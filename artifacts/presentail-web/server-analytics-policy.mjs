/**
 * Bounded in-process rate limit for repeated server-originated analytics.
 * The first occurrence emits immediately; further occurrences for that key
 * are intentionally suppressed until the window expires.
 */
export class WindowedKeyRateLimiter {
  constructor(windowMs, maxKeys = 5_000) {
    this.windowMs = windowMs;
    this.maxKeys = maxKeys;
    this.entries = new Map();
  }

  shouldAllow(key, now = Date.now()) {
    const lastAllowedAt = this.entries.get(key);
    if (lastAllowedAt !== undefined && now - lastAllowedAt < this.windowMs) {
      return false;
    }
    this.entries.delete(key);
    this.entries.set(key, now);
    this.prune();
    return true;
  }

  reset() {
    this.entries.clear();
  }

  prune() {
    while (this.entries.size > this.maxKeys) {
      const oldestKey = this.entries.keys().next().value;
      if (oldestKey === undefined) break;
      this.entries.delete(oldestKey);
    }
  }
}

export function buildProductLifecycle410Event(productSlug) {
  return {
    name: "product_lifecycle_410",
    productId: String(productSlug).slice(0, 64),
    platform: "web",
  };
}