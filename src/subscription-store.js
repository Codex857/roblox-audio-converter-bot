import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

export const PLAN_LIMITS = Object.freeze({ free: 5, pro: 100, server: 500 });

function monthKey(now = new Date()) {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

export class SubscriptionStore {
  constructor(dataDir = "./data") {
    mkdirSync(dataDir, { recursive: true });
    this.db = new DatabaseSync(join(dataDir, "subscriptions.sqlite"));
    this.db.exec("PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON;");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS subscriptions (
        scope_type TEXT NOT NULL CHECK(scope_type IN ('user', 'server')),
        scope_id TEXT NOT NULL,
        tier TEXT NOT NULL CHECK(tier IN ('pro', 'server')),
        status TEXT NOT NULL,
        stripe_customer_id TEXT,
        stripe_subscription_id TEXT UNIQUE,
        current_period_end INTEGER,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (scope_type, scope_id)
      );
      CREATE TABLE IF NOT EXISTS usage_monthly (
        scope_type TEXT NOT NULL,
        scope_id TEXT NOT NULL,
        month_key TEXT NOT NULL,
        count INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (scope_type, scope_id, month_key)
      );
      CREATE TABLE IF NOT EXISTS stripe_events (
        event_id TEXT PRIMARY KEY,
        processed_at INTEGER NOT NULL
      );
    `);
  }

  close() {
    this.db.close();
  }

  markStripeEvent(eventId) {
    const result = this.db.prepare(
      "INSERT OR IGNORE INTO stripe_events (event_id, processed_at) VALUES (?, ?)"
    ).run(eventId, Date.now());
    return result.changes === 1;
  }

  upsertSubscription({ scopeType, scopeId, tier, status, customerId, subscriptionId, periodEnd }) {
    if (!["user", "server"].includes(scopeType) || !["pro", "server"].includes(tier)) {
      throw new Error("Metadata langganan tidak sah.");
    }
    this.db.prepare(`
      INSERT INTO subscriptions (
        scope_type, scope_id, tier, status, stripe_customer_id,
        stripe_subscription_id, current_period_end, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(scope_type, scope_id) DO UPDATE SET
        tier=excluded.tier,
        status=excluded.status,
        stripe_customer_id=excluded.stripe_customer_id,
        stripe_subscription_id=excluded.stripe_subscription_id,
        current_period_end=excluded.current_period_end,
        updated_at=excluded.updated_at
    `).run(scopeType, scopeId, tier, status, customerId || null, subscriptionId || null, periodEnd || null, Date.now());
  }

  resolvePlan(userId, guildId, now = Date.now()) {
    const activeStatuses = ["active", "trialing"];
    if (guildId) {
      const server = this.db.prepare(
        "SELECT * FROM subscriptions WHERE scope_type='server' AND scope_id=?"
      ).get(guildId);
      if (server && activeStatuses.includes(server.status) && (!server.current_period_end || server.current_period_end > now)) {
        return { tier: "server", scopeType: "server", scopeId: guildId };
      }
    }

    const user = this.db.prepare(
      "SELECT * FROM subscriptions WHERE scope_type='user' AND scope_id=?"
    ).get(userId);
    if (user && activeStatuses.includes(user.status) && (!user.current_period_end || user.current_period_end > now)) {
      return { tier: "pro", scopeType: "user", scopeId: userId };
    }

    return { tier: "free", scopeType: "user", scopeId: userId };
  }

  getQuota(userId, guildId, now = new Date()) {
    const plan = this.resolvePlan(userId, guildId, now.getTime());
    const key = monthKey(now);
    const row = this.db.prepare(
      "SELECT count FROM usage_monthly WHERE scope_type=? AND scope_id=? AND month_key=?"
    ).get(plan.scopeType, plan.scopeId, key);
    const used = Number(row?.count || 0);
    const limit = PLAN_LIMITS[plan.tier];
    return { ...plan, monthKey: key, used, limit, remaining: Math.max(0, limit - used) };
  }

  consume(userId, guildId, now = new Date()) {
    const quota = this.getQuota(userId, guildId, now);
    if (quota.remaining <= 0) return { allowed: false, ...quota };
    this.db.prepare(`
      INSERT INTO usage_monthly (scope_type, scope_id, month_key, count)
      VALUES (?, ?, ?, 1)
      ON CONFLICT(scope_type, scope_id, month_key) DO UPDATE SET count=count+1
    `).run(quota.scopeType, quota.scopeId, quota.monthKey);
    return { allowed: true, ...quota, used: quota.used + 1, remaining: quota.remaining - 1 };
  }
}
