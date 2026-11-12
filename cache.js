// Completed translations only; kept in worker memory, never written to storage.
export class TranslationCache {
  constructor({ttl = 5 * 60 * 1000, limit = 50, now = Date.now} = {}) {
    this.entries = new Map(); this.ttl = ttl; this.limit = limit; this.now = now;
  }
  key(model, text) { return JSON.stringify([model, text]); }
  prune() {
    const now = this.now();
    for (const [key, item] of this.entries) if (item.expires <= now) this.entries.delete(key);
  }
  get(model, text) {
    this.prune();
    const key = this.key(model, text), item = this.entries.get(key);
    if (!item) return null;
    this.entries.delete(key); this.entries.set(key, item);
    return item.output;
  }
  set(model, text, output) {
    this.prune();
    const key = this.key(model, text);
    this.entries.delete(key);
    this.entries.set(key, {output, expires: this.now() + this.ttl});
    while (this.entries.size > this.limit) this.entries.delete(this.entries.keys().next().value);
  }
  delete(model, text) { this.entries.delete(this.key(model, text)); }
  clear() { this.entries.clear(); }
}
