// TTL cache with request coalescing: concurrent callers of the same key share one producer call.
export class TtlCache {
  constructor() {
    this.store = new Map();    // key -> { at, value }
    this.inflight = new Map(); // key -> Promise
  }

  get(key, ttlSec, producer) {
    const hit = this.store.get(key);
    if (hit && Date.now() - hit.at < ttlSec * 1000) return Promise.resolve(hit.value);
    if (this.inflight.has(key)) return this.inflight.get(key);
    const p = producer()
      .then((value) => {
        this.store.set(key, { at: Date.now(), value });
        if (this.store.size > 500) this.store.delete(this.store.keys().next().value); // oldest first
        return value;
      })
      .finally(() => this.inflight.delete(key));
    this.inflight.set(key, p);
    return p;
  }
}

/** Error with a provider-agnostic `code` (NOT_CONNECTED / DISCONNECTED / TIMEOUT / UNSUPPORTED / BAD_REQUEST). */
export function err(message, code) {
  return Object.assign(new Error(message), { code });
}
