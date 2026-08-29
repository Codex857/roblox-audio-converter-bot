import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SubscriptionStore } from "../src/subscription-store.js";

function withStore(run) {
  const dir = mkdtempSync(join(tmpdir(), "subscription-store-test-"));
  const store = new SubscriptionStore(dir);
  try {
    run(store);
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
}

test("free users receive five monthly conversions", () => withStore((store) => {
  const date = new Date("2026-08-01T00:00:00Z");
  for (let index = 0; index < 5; index += 1) {
    assert.equal(store.consume("user-1", "guild-1", date).allowed, true);
  }
  const blocked = store.consume("user-1", "guild-1", date);
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.remaining, 0);
}));

test("active Pro subscription raises a user's limit", () => withStore((store) => {
  store.upsertSubscription({
    scopeType: "user",
    scopeId: "user-2",
    tier: "pro",
    status: "active",
    subscriptionId: "sub_test",
    periodEnd: Date.parse("2026-09-01T00:00:00Z")
  });
  const quota = store.getQuota("user-2", "guild-1", new Date("2026-08-10T00:00:00Z"));
  assert.equal(quota.tier, "pro");
  assert.equal(quota.limit, 100);
}));

test("server subscription is shared and takes priority over user plan", () => withStore((store) => {
  store.upsertSubscription({
    scopeType: "server",
    scopeId: "guild-paid",
    tier: "server",
    status: "active",
    subscriptionId: "sub_server",
    periodEnd: Date.parse("2026-09-01T00:00:00Z")
  });
  const first = store.consume("member-a", "guild-paid", new Date("2026-08-10T00:00:00Z"));
  const second = store.getQuota("member-b", "guild-paid", new Date("2026-08-10T00:00:00Z"));
  assert.equal(first.tier, "server");
  assert.equal(second.used, 1);
  assert.equal(second.limit, 500);
}));
