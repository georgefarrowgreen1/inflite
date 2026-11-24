// Account-owned activity metadata. Producers own transports, retries and busy
// state; this registry never persists, starts work, or retries a write itself.
const STATES = new Set(["queued", "running", "waiting", "succeeded", "failed", "cancelled", "handed-off"]);
const FINISHED = new Set(["succeeded", "failed", "cancelled", "handed-off"]);
const KINDS = new Set(["upload", "download", "sync", "recovery", "open", "save", "task"]);
const sourceId = value => typeof value === "string" && /^[a-z][a-z0-9-]{0,39}$/.test(value);
const taskId = value => typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9:_.-]{0,119}$/.test(value);
const clean = (value, max) => typeof value === "string" ? [...value.replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g, " ").trim()].slice(0, max).join("") : "";
const allowed = fn => { try { return !fn || fn() !== false; } catch (_) { return false; } };
const failed = () => ({ ok: false, cancelled: true });

export function createActivityRegistry(F, { limit = 128, now = Date.now } = {}) {
  const owner = F.session?.view?.user?.id, entries = new Map(), sources = new Map(), listeners = new Set(), life = new AbortController();
  const capacity = Number.isInteger(limit) ? Math.min(200, Math.max(8, limit)) : 128;
  let dead = false, order = 0, revision = 0;
  const stamp = () => { try { const at = now(); return Number.isSafeInteger(at) && at >= 0 ? at : 0; } catch (_) { return 0; } };
  function live() {
    if (!dead && (!owner || F.signal?.aborted || F.session?.view?.user?.id !== owner)) destroy();
    return !dead;
  }
  function sourceLive(source) { return live() && !source.dead && !source.signal?.aborted && sources.get(source.id) === source && allowed(source.current); }
  function notify() { if (!live()) return; for (const item of [...listeners]) { if (!live()) break; if (listeners.has(item)) try { item.fn(); } catch (_) {} } }
  function remove(entry) { if (entries.get(entry.key) !== entry) return false; entries.delete(entry.key); entry.controller.abort(); return true; }
  function discard(source, announce = true) {
    if (source.dead) return;
    source.dead = true; source.controller.abort(); source.signal?.removeEventListener("abort", source.stop);
    if (sources.get(source.id) === source) sources.delete(source.id);
    for (const entry of entries.values()) if (entry.source === source) remove(entry);
    if (announce) notify();
  }
  function prune() { for (const source of [...sources.values()]) if (!sourceLive(source)) discard(source, false); }
  function snapshot() {
    if (!live()) return [];
    prune();
    return [...entries.values()].sort((a, b) => b.updatedAt - a.updatedAt || b.order - a.order).map(entry => Object.freeze({
      key: entry.key, id: entry.id, source: entry.source.id, revision: entry.revision,
      title: entry.title, detail: entry.detail, kind: entry.kind, status: entry.status,
      progress: entry.progress, createdAt: entry.createdAt, updatedAt: entry.updatedAt,
      pending: entry.pending, actions: Object.freeze([...entry.actions.values()].map(action => Object.freeze({ id: action.id, label: action.label, enabled: !entry.pending && allowed(action.current) }))),
    }));
  }
  function source(id, { signal, current } = {}) {
    if (!live() || !sourceId(id)) throw new TypeError("A valid activity source is required.");
    prune();
    const previous = sources.get(id); if (previous) discard(previous, false);
    if (sources.size >= 12) throw new Error("Too many activity sources.");
    const record = { id, current, signal, controller: new AbortController(), dead: false };
    record.stop = () => discard(record); sources.set(id, record);
    signal?.addEventListener("abort", record.stop, { once: true });
    if (!sourceLive(record)) discard(record, false);
    return Object.freeze({
      put(id, spec = {}) {
        if (!sourceLive(record)) { discard(record); return false; }
        if (!taskId(id) || !spec || !STATES.has(spec.status)) return false;
        const title = clean(spec.title, 160); if (!title) return false;
        const key = record.id + ":" + id, old = entries.get(key);
        let entry = old;
        if (entry && FINISHED.has(entry.status) && !entry.pending) { remove(entry); entry = null; }
        if (!entry) {
          if (entries.size >= capacity) {
            const completed = [...entries.values()].filter(item => FINISHED.has(item.status) && !item.pending).sort((a, b) => a.order - b.order)[0];
            if (!completed) return false;
            remove(completed);
          }
          entry = { key, id, source: record, controller: new AbortController(), order: ++order, createdAt: stamp(), pending: false };
          entries.set(key, entry);
        }
        const actions = new Map();
        for (const value of (Array.isArray(spec.actions) ? spec.actions : []).slice(0, 4)) {
          const label = clean(value?.label, 60);
          if (!sourceId(value?.id) || !label || typeof value.run !== "function" || actions.has(value.id)) continue;
          actions.set(value.id, { id: value.id, label, run: value.run, current: value.current });
        }
        Object.assign(entry, { title, detail: clean(spec.detail, 280), status: spec.status, kind: KINDS.has(spec.kind) ? spec.kind : "task",
          progress: Number.isFinite(spec.progress) && spec.progress >= 0 && spec.progress <= 1 ? spec.progress : null,
          updatedAt: Math.max(entry.createdAt, entry.updatedAt || 0, stamp()), actions, revision: ++revision });
        notify(); return true;
      },
      remove(id) { const entry = entries.get(record.id + ":" + id); if (!sourceLive(record) || entry?.source !== record) return false; const result = remove(entry); if (result) notify(); return result; },
      clear() { if (!sourceLive(record)) return; for (const entry of entries.values()) if (entry.source === record) remove(entry); notify(); },
      destroy() { discard(record); },
    });
  }
  async function invoke(key, actionId, observedRevision) {
    if (!live()) return failed();
    prune(); const entry = entries.get(key), action = entry?.actions.get(actionId);
    if (!entry || !action || entry.pending || entry.revision !== observedRevision || !sourceLive(entry.source) || !allowed(action.current)) return failed();
    const owned = () => live() && sourceLive(entry.source) && entries.get(key) === entry && !entry.controller.signal.aborted;
    const current = () => owned() && allowed(action.current);
    const signal = AbortSignal.any([life.signal, entry.controller.signal, entry.source.controller.signal]);
    entry.pending = true; entry.revision = ++revision; notify();
    try {
      if (!current()) return failed();
      const answer = await action.run({ current, signal });
      if (!current()) return failed();
      return answer === false || answer?.ok === false ? { ok: false, error: clean(answer?.error, 240) || "That action didn’t finish. Check the task before trying again." } : { ok: true };
    } catch (error) {
      return current() && error?.name !== "AbortError" ? { ok: false, error: clean(error?.message, 240) || "That action didn’t finish. Check the task before trying again." } : failed();
    } finally {
      if (owned()) { entry.pending = false; entry.revision = ++revision; notify(); }
    }
  }
  function clearCompleted() { if (!live()) return; prune(); for (const entry of entries.values()) if (FINISHED.has(entry.status) && !entry.pending) remove(entry); notify(); }
  function destroy() {
    if (dead) return; dead = true; life.abort();
    for (const source of [...sources.values()]) discard(source, false);
    entries.clear(); sources.clear(); listeners.clear(); F.signal?.removeEventListener("abort", destroy);
  }
  F.signal?.addEventListener("abort", destroy, { once: true }); live();
  return Object.freeze({ source, snapshot, invoke, clearCompleted, destroy, live, signal: life.signal,
    subscribe(fn) { if (!live() || typeof fn !== "function") return () => {}; const entry = { fn }; listeners.add(entry); return () => listeners.delete(entry); } });
}
