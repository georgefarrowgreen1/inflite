// One account-owned app metadata index shared by Explorer, quick Files and search.
// Providers retain content and native actions; search never invokes a provider.
import { FILE_APPS, FILE_LIMIT, fileText, fileQuery, normalizeWorkspaceFile, filterWorkspaceFiles } from "./files-metadata.js";
const APPS = new Set(FILE_APPS), STATES = new Set(["loading", "ready", "locked", "signin", "error"]);
const blocked = state => state === "locked" || state === "signin";
const abort = () => new DOMException("This Files read was released", "AbortError");
const safe = fn => { try { return fn() !== false; } catch (_) { return false; } };

export function createAppFilesIndex(F, { sources = () => [], load, runIntent, openApp, onFind } = {}) {
  const owner = F.session?.view?.user?.id, cache = new Map(), listeners = new Set(), issued = new WeakMap(), life = new AbortController();
  let dead = false, epoch = 0, sequence = 0, action = 0, queued = false;
  const live = () => !dead && typeof owner === "string" && !!owner && !F.signal?.aborted && F.session?.view?.user?.id === owner;
  const validLease = lease => live() && !lease?.signal?.aborted && (!lease?.current || safe(lease.current));
  const descriptors = () => {
    if (!live()) return [];
    const seen = new Set();
    try { return (sources() || []).filter(s => s && APPS.has(s.app) && !seen.has(s.app) && seen.add(s.app)
      && !(s.app === "mail" && (F.session?.apps?.mail === false || F.session?.view?.apps?.mail === false))).slice(0, APPS.size); } catch (_) { return []; }
  };
  const emit = () => {
    if (queued || !live()) return;
    queued = true; queueMicrotask(() => { queued = false; if (live()) for (const registration of [...listeners]) { if (!live()) break; if (!listeners.has(registration)) continue; try { registration.fn(); } catch (_) {} } });
  };
  function filesOf(values, app, entry) {
    const seen = new Set(), out = [];
    for (const value of (Array.isArray(values) ? values : []).slice(0, FILE_LIMIT)) {
      const file = normalizeWorkspaceFile(value, app);
      if (!file || seen.has(file.id)) continue;
      seen.add(file.id); Object.freeze(file); issued.set(file, { entry, epoch: entry.epoch }); out.push(file);
    }
    return out;
  }
  function sync() {
    if (!live()) { destroy(); return []; }
    const list = descriptors(), present = new Set(list.map(s => s.app)); let changed = false;
    for (const [app, entry] of cache) if (!present.has(app)) { entry.epoch = ++epoch; cache.delete(app); changed = true; }
    for (const source of list) {
      const state = STATES.has(source.status) ? source.status : "loading";
      let entry = cache.get(source.app);
      if (!entry) {
        entry = { app: source.app, name: fileText(source.name || source.app, 40), epoch: ++epoch, sourceState: null, files: [], status: state, more: false, query: "", loaded: false, dirty: false, tasks: new Map(), latest: 0, bootstrapped: false, interests: [] };
        cache.set(source.app, entry); changed = true;
      }
      entry.name = fileText(source.name || source.app, 40);
      if (source.transient === true) {
        const clean = state === "ready" ? filesOf(source.files, source.app, entry) : [];
        const signature = JSON.stringify([state, clean, source.more === true || Array.isArray(source.files) && source.files.length > FILE_LIMIT]);
        if (entry.signature !== signature) {
          entry.epoch = ++epoch; entry.signature = signature; entry.status = state; entry.files = state === "ready" ? filesOf(clean, source.app, entry) : [];
          entry.more = state === "ready" && (source.more === true || Array.isArray(source.files) && source.files.length > FILE_LIMIT);
          entry.loaded = state === "ready" || entry.loaded; entry.dirty = false; entry.sourceState = state; changed = true;
        }
      } else if (blocked(state)) {
        if (entry.sourceState !== state || entry.files.length || !blocked(entry.status)) { entry.epoch = ++epoch; entry.status = state; entry.files = []; entry.more = false; entry.loaded = false; entry.dirty = false; changed = true; }
        entry.sourceState = state;
      } else {
        if (blocked(entry.sourceState)) { entry.status = state; entry.loaded = false; entry.dirty = true; changed = true; }
        if (entry.sourceState !== state && state === "loading") { entry.status = state; entry.loaded = false; entry.dirty = true; changed = true; }
        if (entry.sourceState === null && source.files?.length) { entry.files = filesOf(source.files, source.app, entry); entry.more = source.more === true || source.files.length > FILE_LIMIT; }
        entry.sourceState = state;
      }
    }
    if (changed) emit(); return list;
  }
  const view = entry => ({ app: entry.app, name: entry.name, status: entry.status, files: [...entry.files], more: entry.more === true });
  function snapshot() { return sync().map(s => view(cache.get(s.app))); }
  const belongs = (entry, app) => live() && cache.get(app) === entry && descriptors().some(s => s.app === app && !blocked(s.status));
  function wait(task, lease) {
    if (!validLease(lease)) return Promise.reject(abort());
    task.leases.add(lease);
    return new Promise((resolve, reject) => {
      const stop = () => finish(abort()), finish = (error, value) => {
        if (done) return; done = true; task.leases.delete(lease); lease.signal?.removeEventListener("abort", stop); F.signal?.removeEventListener("abort", stop); life.signal.removeEventListener("abort", stop);
        error ? reject(error) : resolve(value);
      }; let done = false;
      lease.signal?.addEventListener("abort", stop, { once: true }); F.signal?.addEventListener("abort", stop, { once: true }); life.signal.addEventListener("abort", stop, { once: true });
      task.promise.then(value => finish(validLease(lease) ? null : abort(), value), error => finish(validLease(lease) ? error : abort()));
    });
  }
  async function readSource(source, query, lease, refresh) {
    const entry = cache.get(source.app);
    if (!entry || !validLease(lease)) throw abort();
    if (blocked(source.status) || blocked(entry.status)) return view(entry);
    if (source.transient === true && source.status === "ready") return view(entry);
    let task = entry.tasks.get(query);
    if (task && !task.current()) { entry.tasks.delete(query); task = null; }
    if (!task && !refresh && !entry.dirty && entry.loaded && entry.query === query) return view(entry);
    if (!task && source.transient === true && entry.bootstrapped && entry.status !== "error") return view(entry);
    if (!task) {
      const previous = entry.query === query ? entry.files : [];
      const mine = ++sequence; entry.latest = mine; entry.query = query; entry.status = "loading"; entry.files = previous;
      task = { leases: new Set(), previous, epoch: entry.epoch, abandoned: false, current: null, promise: null };
      task.current = () => {
        if (task.abandoned || !belongs(entry, source.app) || entry.epoch !== task.epoch) return false;
        if (![...task.leases].some(validLease)) { task.abandoned = true; return false; } return true;
      };
      const active = task;
      task.promise = Promise.resolve().then(async () => {
        try {
          if (!active.current()) throw abort();
          entry.bootstrapped = true;
          const answer = await load?.(source.app, query, active.current);
          sync(); if (!active.current()) throw abort();
          if (source.transient === true) {
            entry.loaded = true;
            if (answer?.status === "error" && entry.status !== "ready") entry.status = "error";
            return view(entry);
          }
          const state = STATES.has(answer?.status) ? answer.status : "error";
          if (blocked(state)) { entry.epoch = ++epoch; active.epoch = entry.epoch; }
          const result = { app: entry.app, name: entry.name, status: state, files: blocked(state) ? [] : filesOf(answer?.files, source.app, entry), more: !blocked(state) && (answer?.more === true || Array.isArray(answer?.files) && answer.files.length > FILE_LIMIT) };
          if (entry.latest === mine) { Object.assign(entry, result, { query, loaded: true, dirty: false }); if (state === "loading") entry.interests = [...active.leases].filter(validLease).slice(-8); else entry.interests = []; emit(); }
          return result;
        } catch (error) {
          // A cold Chat bootstrap can publish its canonical snapshot before
          // load() returns. Its old epoch must not publish data, but a live
          // reader may adopt the new canonical state without cancelling peers.
          if (source.transient === true && !active.abandoned && cache.get(source.app) === entry && [...active.leases].some(validLease) && entry.epoch !== active.epoch) return view(entry);
          if (!active.current()) throw abort();
          const result = { app: entry.app, name: entry.name, status: "error", files: active.previous, more: entry.more === true };
          if (entry.latest === mine) { Object.assign(entry, result, { loaded: true, dirty: false, query }); emit(); } return result;
        } finally { if (entry.tasks.get(query) === active) entry.tasks.delete(query); }
      });
      entry.tasks.set(query, task); emit();
    }
    return wait(task, lease);
  }
  async function read({ app, query = "", current, signal, refresh = false } = {}) {
    const lease = { current, signal }; if (!validLease(lease)) throw abort();
    const typed = fileQuery(query), list = sync().filter(s => app == null || s.app === app);
    const answers = await Promise.all(list.map(s => readSource(s, typed, lease, refresh === true)));
    if (!validLease(lease)) throw abort();
    const result = answers.map(source => ({ ...source, files: filterWorkspaceFiles(source.files, { query: typed }) }));
    return { sources: result, files: result.flatMap(s => s.files) };
  }
  async function run(file, intent = file?.intent, { current } = {}) {
    sync(); const proof = file && issued.get(file), entry = proof?.entry;
    if (!validLease({ current }) || !entry || !belongs(entry, file.app) || proof.epoch !== entry.epoch || blocked(entry.status)
      || ![file.intent, file.downloadIntent, file.shareIntent].filter(Boolean).includes(intent)) return { ok: false, cancelled: true };
    const mine = ++action, owned = () => validLease({ current }) && mine === action && proof.epoch === entry.epoch && belongs(entry, file.app) && !blocked(entry.status);
    try { const answer = await runIntent?.(file.app, intent, file.objectId, { current: owned }); return owned() ? answer || { ok: true } : { ok: false, cancelled: true }; }
    catch (_) { return owned() ? { ok: false, error: "That file didn’t open. Try again in its app." } : { ok: false, cancelled: true }; }
  }
  function gate(app) { sync(); if (!live() || !cache.has(app)) return false; ++action; openApp?.(app); return true; }
  async function search(query) {
    if (!live()) { destroy(); return []; }
    sync(); const typed = fileQuery(query); if (!typed) return [];
    const found = filterWorkspaceFiles([...cache.values()].flatMap(s => s.files), { query: typed }).slice(0, 15).map(file => ({ app: file.app, title: file.name, sub: [file.source, "Files"].filter(Boolean).join(" · "), icon: file.app,
      run: async () => { const answer = await run(file, file.intent); if (live() && answer?.error) F.toast?.(fileText(answer.error, 240)); return answer; } }));
    if (typeof onFind === "function") found.push({ app: null, title: `Find “${typed}” in Files`, sub: "Routes, workouts and attachments from your apps", icon: "fitness", run: () => live() && onFind(typed) });
    return found;
  }
  function update(app) {
    if (!live()) { destroy(); return; }
    const before = new Map([...cache].map(([id, s]) => [id, s.status])), list = sync();
    for (const s of list) { const entry = cache.get(s.app); if ((!app || app === s.app) && s.transient !== true && before.get(s.app) === "loading" && s.status === "ready" && entry.loaded && !entry.tasks.size) {
      const interest = entry.interests.find(validLease); if (interest) read({ app: s.app, query: entry.query, ...interest, refresh: true }).catch(() => {});
    } } emit();
  }
  function changed(app) { sync(); for (const [id, entry] of cache) if (!app || app === id) entry.dirty = true; update(app); }
  function subscribe(fn) { if (!live() || typeof fn !== "function") return () => {}; const registration = { fn }; listeners.add(registration); return () => listeners.delete(registration); }
  function retain(files) { sync(); return (Array.isArray(files) ? files : []).filter(file => { const proof = issued.get(file); return proof && proof.epoch === proof.entry.epoch && belongs(proof.entry, file.app) && !blocked(proof.entry.status); }); }
  function destroy() { if (dead) return; dead = true; life.abort(); ++action; for (const entry of cache.values()) { entry.epoch = ++epoch; } cache.clear(); listeners.clear(); F.signal?.removeEventListener("abort", destroy); }
  F.signal?.addEventListener("abort", destroy, { once: true }); if (F.signal?.aborted) destroy();
  return { read, snapshot, search, run, gate, update, changed, subscribe, retain, destroy };
}
