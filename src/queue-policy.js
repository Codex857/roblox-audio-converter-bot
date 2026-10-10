export function progressBar(current, total, width = 10) {
  const safeTotal = Math.max(1, Number(total) || 1);
  const ratio = Math.min(1, Math.max(0, (Number(current) || 0) / safeTotal));
  const filled = Math.round(ratio * width);
  return `${"█".repeat(filled)}${"░".repeat(width - filled)} ${Math.round(ratio * 100)}%`;
}

export class CooldownGate {
  constructor({ cooldownMs = 10_000, now = () => Date.now() } = {}) {
    this.cooldownMs = Math.max(0, Number(cooldownMs) || 0);
    this.now = now;
    this.lastAccepted = new Map();
    this.nextCleanup = 0;
  }

  remainingMs(key) {
    const acceptedAt = this.lastAccepted.get(String(key));
    if (acceptedAt === undefined) return 0;
    const remaining = this.cooldownMs - (this.now() - acceptedAt);
    return Math.max(0, remaining);
  }

  accept(key) {
    const now = this.now();
    if (now >= this.nextCleanup) {
      for (const [id, acceptedAt] of this.lastAccepted) {
        if (now - acceptedAt >= this.cooldownMs) this.lastAccepted.delete(id);
      }
      this.nextCleanup = now + Math.max(1000, this.cooldownMs);
    }
    const id = String(key);
    const remainingMs = this.remainingMs(id);
    if (remainingMs > 0) return { accepted: false, remainingMs };
    if (this.cooldownMs > 0) this.lastAccepted.set(id, now);
    return { accepted: true, remainingMs: 0 };
  }

  clear(key) {
    this.lastAccepted.delete(String(key));
  }
}
