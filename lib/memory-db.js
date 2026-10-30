/**
 * Tiny in-memory stand-in for the parts of @upstash/redis this project uses.
 * ONLY for local development / testing. On Vercel the real database is always used.
 */
const store = new Map(); // key -> { value, expiresAt }

function live(key) {
  const e = store.get(key);
  if (!e) return undefined;
  if (e.expiresAt && Date.now() > e.expiresAt) {
    store.delete(key);
    return undefined;
  }
  return e;
}

// Mimic Upstash's automatic JSON (de)serialisation.
const encode = (v) => (typeof v === "string" ? v : JSON.stringify(v));
const decode = (s) => {
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
};

module.exports = {
  async get(key) {
    const e = live(key);
    return e === undefined ? null : decode(e.value);
  },
  async set(key, value, opts = {}) {
    if (opts.nx && live(key)) return null;
    store.set(key, { value: encode(value), expiresAt: opts.ex ? Date.now() + opts.ex * 1000 : 0 });
    return "OK";
  },
  async del(...keys) {
    return keys.reduce((n, k) => n + (store.delete(k) ? 1 : 0), 0);
  },
  async incr(key) {
    const e = live(key);
    const n = (e ? Number(e.value) : 0) + 1;
    store.set(key, { value: String(n), expiresAt: e ? e.expiresAt : 0 });
    return n;
  },
  async expire(key, seconds) {
    const e = live(key);
    if (!e) return 0;
    e.expiresAt = Date.now() + seconds * 1000;
    return 1;
  },
  async hincrby(key, field, by) {
    const e = live(key);
    const h = e ? JSON.parse(e.value) : {};
    h[field] = (Number(h[field]) || 0) + by;
    store.set(key, { value: JSON.stringify(h), expiresAt: 0 });
    return h[field];
  },
  async hgetall(key) {
    const e = live(key);
    return e ? JSON.parse(e.value) : null;
  },
  async hdel(key, ...fields) {
    const e = live(key);
    if (!e) return 0;
    const h = JSON.parse(e.value);
    let n = 0;
    for (const f of fields) if (f in h) (delete h[f], n++);
    store.set(key, { value: JSON.stringify(h), expiresAt: 0 });
    return n;
  },
};
