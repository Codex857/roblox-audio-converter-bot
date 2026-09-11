function utcDay(now) {
  return new Date(now).toISOString().slice(0, 10);
}

export class DailyUsageLimiter {
  constructor({ limit = 5, now = () => Date.now() } = {}) {
    this.limit = Math.max(1, Number(limit) || 5);
    this.now = now;
    this.entries = new Map();
  }

  status(userId) {
    const key = String(userId);
    const day = utcDay(this.now());
    const entry = this.entries.get(key);
    const used = entry?.day === day ? entry.used : 0;
    return { used, remaining: Math.max(0, this.limit - used), limit: this.limit, day };
  }

  reserve(userId) {
    const status = this.status(userId);
    if (status.remaining <= 0) return { accepted: false, ...status };
    this.entries.set(String(userId), { day: status.day, used: status.used + 1 });
    return { accepted: true, used: status.used + 1, remaining: status.remaining - 1, limit: status.limit, day: status.day };
  }

  release(userId) {
    const status = this.status(userId);
    if (status.used <= 0) return status;
    this.entries.set(String(userId), { day: status.day, used: status.used - 1 });
    return this.status(userId);
  }
}
