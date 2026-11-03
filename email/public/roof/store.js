// Mail's module state (One roof stage 4, s4/spec §4.1, §4.2, S4-D16): one store in place of app.js's S (app.js:1730),
// and the names of what Mail keeps at inflite.ai. B0-b's stub (STUB = true): KEYS, the shapes, STORAGE, SESSION and CAP
// are frozen; MM writes the real store.
//
// createStore(init) → { get(), set(patch, why), on(key, fn) → off }
//   get(): the current snapshot, frozen (a new object on every change; never mutated).
//   set(patch, why): merges patch's top-level keys (each one of KEYS); emits each changed key, then "*", batched in a
//   microtask (one emission per key however many sets came before it). why: a short word for debugging, never stored.
//   on(key, fn): fn(snapshot, why) on that key's change ("*": on any); → off.
// Keys and shapes (§4.2, frozen):
//   access: "ok"|"signin"|"notadmin"|"passkey"|"reauth"|null
//   me: { displayName, defaultFrom, identities[], addresses[], signature } | null
//   counts: { people, updates, later, drafts, trash, byAddress: { [email]: n } } | null
//   version: string|null   offline: bool   updatedAt: number|null
//   lens: "people"|"updates"|"later"|"done"   filter: "all"|"unread"|"flagged"|"files"   address: string|null
//   box: null|"drafts"|"trash"   query: string
//   list: { rows: Summary[], more: bool, loading: bool, err: string|null }
//   threadId: string|null   thread: { t: Thread|null, metas: { [id]: Meta }, loading: bool, err: string|null }
//   layout: "phone"|"pad"   compose: bool   sending: number   outbox: OutboxItem[]
// STORAGE: localStorage keys at inflite.ai (S4-D16; every one removed at any sign-out, C10's APP_KEPT); SESSION: the
// sessionStorage key (C10's APP_SESSION_KEPT); CAP: all mail:* together at most 256 KB (RI8). No IndexedDB.
export const STUB = true;
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

export function createStore(init = {}) {
  let snap = Object.freeze({ ...initial(), ...init });
  const subs = new Map();
  return {
    get: () => snap,
    set(patch = {}, why = "") { snap = Object.freeze({ ...snap, ...patch }); for (const fn of subs.get("*") || []) fn(snap, why); },
    on(key, fn) { if (!subs.has(key)) subs.set(key, new Set()); subs.get(key).add(fn); return () => subs.get(key)?.delete(fn); },
  };
}
