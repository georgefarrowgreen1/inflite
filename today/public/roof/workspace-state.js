import { getWorkspaceApp, safeWorkspaceRoute } from "./workspace-catalog.js";
import { normalizeLayout } from "./workspace-windows.js";

export const WORKSPACE_STATE_VERSION = 2;
export const WORKSPACE_LIMITS = Object.freeze({ workspaces: 8, panes: 5, name: 60, storedBytes: 16384 });
const idOf = (v) => typeof v === "string" && /^[a-z][a-z0-9_-]{0,39}$/.test(v) ? v : null;
const accountOf = (v) => typeof v === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(v) ? v : null;
const nameOf = (v) => typeof v === "string" ? [...v.replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g, "").trim().replace(/\s+/g, " ")].slice(0, WORKSPACE_LIMITS.name).join("") : "";
const frozen = (v) => { if (v && typeof v === "object") { Object.values(v).forEach(frozen); Object.freeze(v); } return v; };
const timestamp = (n) => Number.isSafeInteger(n) && n >= 0 ? n : 0;
const clock = (now) => timestamp(now());
const panesOf = (list) => {
  if (!Array.isArray(list) || !list.length || list.length > WORKSPACE_LIMITS.panes) return null;
  const seen = new Set(), panes = [];
  for (const p of list) {
    const a = getWorkspaceApp(p?.app), route = safeWorkspaceRoute(p?.app, p?.route ?? a?.href);
    if (!a?.pane || !route || seen.has(a.id)) return null;
    seen.add(a.id);
    panes.push({ id: a.id, app: a.id, route });
  }
  return panes;
};
const initial = (userId, at) => ({ version: WORKSPACE_STATE_VERSION, userId, activeId: "ride", workspaces: [{
  id: "ride", name: "Ride", panes: [{ id: "fitness", app: "fitness", route: "/fitness/#today" }, { id: "weather", app: "weather", route: "/weather/#now" }], activePane: "fitness", layout: normalizeLayout(null, ["fitness", "weather"]), updatedAt: at,
}] });

// Restore only recognised metadata. Unknown fields (including copied domain
// values, bodies, auth state and share payloads) never enter a snapshot or write.
export function restoreWorkspaceState(value, userId, at = 0) {
  if (!accountOf(userId)) throw new TypeError("A signed-in account is required for a workspace.");
  at = timestamp(at);
  const fallback = () => frozen(initial(userId, at));
  if (!value || ![1, WORKSPACE_STATE_VERSION].includes(value.version) || value.userId !== userId || !Array.isArray(value.workspaces) || !value.workspaces.length || value.workspaces.length > WORKSPACE_LIMITS.workspaces) return fallback();
  const seen = new Set(), workspaces = [];
  for (const w of value.workspaces) {
    const id = idOf(w?.id), name = nameOf(w?.name), panes = panesOf(w?.panes);
    if (!id || !name || !panes || seen.has(id)) continue;
    seen.add(id);
    workspaces.push({ id, name, panes, activePane: panes.some((p) => p.id === w.activePane) ? w.activePane : panes[0].id, layout: normalizeLayout(w.layout, panes.map(p => p.app)), updatedAt: Number.isSafeInteger(w.updatedAt) && w.updatedAt >= 0 ? w.updatedAt : at });
  }
  if (!workspaces.length) return fallback();
  return frozen({ version: WORKSPACE_STATE_VERSION, userId, activeId: workspaces.some((w) => w.id === value.activeId) ? value.activeId : workspaces[0].id, workspaces });
}

// Storage is injected for tests/embedders; the account/frame signal fences late
// callbacks. This is local UI metadata, never authoritative server state.
export function createWorkspaceStore({ userId, storage, now = Date.now, makeId = () => `ws-${globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2)}`, signal } = {}) {
  if (!accountOf(userId)) throw new TypeError("A signed-in account is required for a workspace.");
  const key = `ifl:workspace:v2:${userId}`;
  const listeners = new Set();
  let state, dead = !!signal?.aborted, persisted = false, hasLocalData = false, savedText = null;
  try { if (storage === undefined) storage = globalThis.localStorage; } catch (_) {}
  try {
    savedText = storage?.getItem(key) ?? null;
    const text = savedText ?? storage?.getItem(`ifl:workspace:v1:${userId}`);
    if (typeof text === "string" && text.length <= WORKSPACE_LIMITS.storedBytes) {
      const value = JSON.parse(text);
      state = restoreWorkspaceState(value, userId, clock(now));
      hasLocalData = !!value && value.userId === userId && [1, 2].includes(value.version) && Array.isArray(value.workspaces) && value.workspaces.length > 0;
      persisted = JSON.stringify(state) === JSON.stringify(value);
    }
  } catch (_) {}
  state ||= frozen(initial(userId, clock(now)));
  const emit = source => { for (const entry of [...listeners]) { if (dead) break; if (listeners.has(entry)) try { entry.fn(state, {source}); } catch (_) {} } };
  const changed = () => { try { return (storage?.getItem(key) ?? null) !== savedText; } catch (_) { return false; } };
  const write = (next, source = "local") => {
    if (changed()) { persisted = false; emit("storage-conflict"); return false; }
    state = frozen(next); persisted = false; hasLocalData = true;
    try { if (storage?.setItem) { const text = JSON.stringify(state); storage.setItem(key, text); savedText = text; persisted = true; } } catch (_) {}
    emit(source); return true;
  };
  const replace = (id, patch) => {
    if (dead || !patch || typeof patch !== "object") return null;
    const old = state.workspaces.find((w) => w.id === id);
    if (!old) return null;
    const name = patch.name === undefined ? old.name : nameOf(patch.name), panes = patch.panes === undefined ? old.panes : panesOf(patch.panes);
    const activePane = patch.activePane === undefined ? panes?.some((p) => p.id === old.activePane) ? old.activePane : panes?.[0].id : patch.activePane;
    if (!name || !panes || !panes.some((p) => p.id === activePane)) return null;
    const layout = normalizeLayout(patch.layout === undefined ? old.layout : patch.layout, panes.map(p => p.app));
    const w = { id, name, panes, activePane, layout, updatedAt: clock(now) };
    return write({ ...state, workspaces: state.workspaces.map((x) => x.id === id ? w : x) }) ? w : null;
  };
  const dispose = () => { dead = true; listeners.clear(); signal?.removeEventListener("abort", dispose); };
  if (!dead) signal?.addEventListener("abort", dispose, { once: true });
  return Object.freeze({
    read: () => state,
    get persisted() { return persisted; },
    get hasLocalData() { return hasLocalData; },
    get storageChanged() { return changed(); },
    reloadSaved() {
      if (dead) return false;
      try { const text = storage?.getItem(key); if (typeof text !== "string" || text.length > WORKSPACE_LIMITS.storedBytes) return false; const value = JSON.parse(text); if (value?.version !== 2 || value.userId !== userId) return false; const next = restoreWorkspaceState(value, userId, clock(now)); if (JSON.stringify(next) !== JSON.stringify(value)) return false; state = next; savedText = text; persisted = true; hasLocalData = true; emit("saved"); return true; } catch (_) { return false; }
    },
    subscribe(fn) {
      if (dead || typeof fn !== "function") return () => {};
      const entry = {fn}; listeners.add(entry); return () => listeners.delete(entry);
    },
    replaceSnapshot(value, {source = "cloud"} = {}) {
      if (dead || !value || value.userId !== userId || value.version !== WORKSPACE_STATE_VERSION || !Array.isArray(value.workspaces) || !value.workspaces.length) return false;
      if (source === "cloud") try { if ((storage?.getItem(key) ?? null) !== savedText) return false; } catch (_) {}
      const next = restoreWorkspaceState(value, userId, clock(now));
      if (JSON.stringify(next) !== JSON.stringify(value)) return false;
      return write(next, source);
    },
    create(spec = {}) {
      if (dead || !spec || typeof spec !== "object" || state.workspaces.length >= WORKSPACE_LIMITS.workspaces) return null;
      const title = nameOf(spec.name), list = panesOf(spec.panes);
      if (!title || !list) return null;
      let id;
      for (let n = 0; n < 4; n++) { id = idOf(makeId()); if (id && !state.workspaces.some((w) => w.id === id)) break; id = null; }
      if (!id) return null;
      const w = { id, name: title, panes: list, activePane: list[0].id, layout: normalizeLayout(spec.layout, list.map(p => p.app)), updatedAt: clock(now) };
      return write({ ...state, activeId: id, workspaces: [...state.workspaces, w] }) ? w : null;
    },
    update: (id, patch = {}) => replace(id, patch),
    select(id) {
      if (dead || !state.workspaces.some((w) => w.id === id)) return false;
      if (changed()) { persisted = false; emit("storage-conflict"); return false; }
      return state.activeId === id || write({ ...state, activeId: id });
    },
    remove(id) {
      if (dead || !state.workspaces.some((w) => w.id === id)) return false;
      const workspaces = state.workspaces.filter((w) => w.id !== id);
      return !workspaces.length ? write(initial(userId, clock(now))) : write({ ...state, activeId: state.activeId === id ? workspaces[0].id : state.activeId, workspaces });
    },
    clear() {
      if (dead) return;
      // Keep a current-version reset record so an older layout cannot be
      // re-imported from v1 by a reload or a retired v1 tab.
      write(initial(userId, clock(now)));
    },
    dispose,
  });
}
