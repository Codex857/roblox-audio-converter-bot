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
  }

  remainingMs(key) {
    const remaining = this.cooldownMs - (this.now() - (this.lastAccepted.get(String(key)) || 0));
    return Math.max(0, remaining);
  }

  accept(key) {
    const id = String(key);
    const remainingMs = this.remainingMs(id);
    if (remainingMs > 0) return { accepted: false, remainingMs };
    this.lastAccepted.set(id, this.now());
    return { accepted: true, remainingMs: 0 };
  }

  clear(key) {
    this.lastAccepted.delete(String(key));
  }
}
