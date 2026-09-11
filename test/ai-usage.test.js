import test from "node:test";
import assert from "node:assert/strict";
import { DailyUsageLimiter } from "../src/ai-usage.js";

test("daily AI usage limiter reserves, releases and resets by UTC day", () => {
  let now = Date.parse("2026-09-11T10:00:00Z");
  const limiter = new DailyUsageLimiter({ limit: 2, now: () => now });
  assert.equal(limiter.reserve("user").accepted, true);
  assert.equal(limiter.reserve("user").remaining, 0);
  assert.equal(limiter.reserve("user").accepted, false);
  assert.equal(limiter.release("user").remaining, 1);
  now += 24 * 60 * 60 * 1000;
  assert.deepEqual(limiter.status("user"), { used: 0, remaining: 2, limit: 2, day: "2026-09-12" });
});
