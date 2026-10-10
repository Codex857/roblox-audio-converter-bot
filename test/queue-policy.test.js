import test from "node:test";
import assert from "node:assert/strict";
import { CooldownGate, progressBar } from "../src/queue-policy.js";

test("new users are accepted at time zero and expired users are removed", () => {
  let now = 0;
  const gate = new CooldownGate({ cooldownMs: 5000, now: () => now });
  assert.equal(gate.accept("first").accepted, true);
  assert.equal(gate.accept("first").accepted, false);
  now = 5000;
  assert.equal(gate.accept("second").accepted, true);
  assert.equal(gate.lastAccepted.has("first"), false);
  const disabled = new CooldownGate({ cooldownMs: 0 });
  disabled.accept("user");
  assert.equal(disabled.lastAccepted.size, 0);
});

test("progress bar clamps values and reports a useful percentage", () => {
  assert.equal(progressBar(0, 4, 4), "░░░░ 0%");
  assert.equal(progressBar(2, 4, 4), "██░░ 50%");
  assert.equal(progressBar(9, 4, 4), "████ 100%");
});

test("cooldown gate accepts once and reports remaining time", () => {
  let now = 10_000;
  const gate = new CooldownGate({ cooldownMs: 5_000, now: () => now });
  assert.deepEqual(gate.accept("user"), { accepted: true, remainingMs: 0 });
  now += 2_000;
  assert.deepEqual(gate.accept("user"), { accepted: false, remainingMs: 3_000 });
  now += 3_000;
  assert.deepEqual(gate.accept("user"), { accepted: true, remainingMs: 0 });
});
