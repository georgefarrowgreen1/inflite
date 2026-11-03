// Mail's module: its one store (One roof stage 4, spec §4.2), in place of app.js's S (1730).
// createStore(init) → { get(), set(patch, why), on(key, fn) → off }
//   get(): the current snapshot, frozen (a new object after every set that changes something; never changed in place).
//   set(patch, why): shallow-merges patch's top-level keys; a key whose value is the same (Object.is) is no change.
//   on(key, fn): fn(snapshot, why) once per microtask for each changed top-level key; "*" once after them all.
//   Events are batched in a microtask: several sets in a row emit each changed key once, with the latest snapshot.
//   A key that isn't one of KEYS is left out.
// Keys and shapes (frozen by B0-b, spec §4.2): KEYS, initial(). Storage at inflite.ai (S4-D16): STORAGE, every one under
// "mail:" and removed at any sign-out (Today's APP_KEPT); SESSION: the sign-in verifier, sessionStorage's
// (APP_SESSION_KEPT). All mail:* together ≤ CAP bytes (local.put refuses past it, as a QuotaExceededError).

export const KEYS = ["access", "me", "counts", "version", "offline", "updatedAt", "lens", "filter", "address", "box", "query", "list", "threadId", "thread", "layout", "compose", "sending", "outbox"];
export const STORAGE = { replies: "mail:replies", unsent: "mail:unsent", outbox: "mail:outbox", remoteImages: "mail:remote-images", lens: "mail:lens" };
export const SESSION = { verifier: "mail:signin-verifier" };
export const CAP = 262144;

export const initial = () => ({
  access: null, me: null, counts: null, version: null, offline: false, updatedAt: null,
  lens: "people", filter: "all", address: null, box: null, query: "",
  list: { rows: [], more: false, loading: false, err: null },
  threadId: null, thread: { t: null, metas: {}, loading: false, err: null },
  layout: "phone", compose: false, sending: 0, outbox: [],
});

const freeze = (v) => (v && typeof v === "object" && !Object.isFrozen(v) ? Object.freeze(v) : v);

export function createStore(init = {}) {
  const deep = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, freeze(v)]));
  let s = Object.freeze(deep({ ...initial(), ...init }));
  const subs = new Map();
  let pending = null, why = null;
  const emit = () => {
    const keys = pending;
    pending = null;
    const w = why;
    why = null;
    for (const k of [...keys, "*"]) for (const fn of [...(subs.get(k) || [])]) {
      try { fn(s, w); } catch (e) { console.error(e); }
    }
  };
  return {
    get: () => s,
    set(patch = {}, w = null) {
      const changed = Object.keys(patch).filter((k) => KEYS.includes(k) && !Object.is(s[k], patch[k]));
      if (!changed.length) return s;
      const next = { ...s };
      for (const k of changed) next[k] = freeze(patch[k]);
      s = Object.freeze(next);
      why = w ?? why;
      if (!pending) { pending = new Set(); queueMicrotask(emit); }
      for (const k of changed) pending.add(k);
      return s;
    },
    on(key, fn) {
      if (!subs.has(key)) subs.set(key, new Set());
      subs.get(key).add(fn);
      return () => subs.get(key)?.delete(fn);
    },
  };
}

// localStorage under the roof, quietly: a page with storage refused works without it
export const local = {
  get(k, d = null) {
    try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; }
  },
  // → true once written; throws QuotaExceededError (and the 256 KB cap as one) for the caller to say so
  put(k, v) {
    const text = JSON.stringify(v);
    let used = 0;
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith("mail:") && key !== k) used += key.length + (localStorage.getItem(key) || "").length;
      }
    } catch {}
    if (used + k.length + text.length > CAP) throw Object.assign(new Error("over the cap"), { name: "QuotaExceededError" });
    localStorage.setItem(k, text);
    return true;
  },
  drop(k) { try { localStorage.removeItem(k); } catch {} },
};
