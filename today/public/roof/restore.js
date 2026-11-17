// Reopening keeps only a verified account's curated screen reference and scroll.
// Never persist queries, names, content, share/auth tokens or unsaved editor text.
import { REGISTRY, parse, format, ownPath, safeFilesLocation } from "./router.js";
export const RESUME_PREFIX = "ifl:resume:v1:";
const parseTarget = path => parse(path, { roof: true, workspace: true });
export function resumeTarget(value) {
  if (!ownPath(value?.path) || value.path.length > 180 || /[?%\s]/.test(value.path)) return null;
  const r = parseTarget(value.path);
  if (!r) return null;
  const y = Number.isFinite(value.y) ? Math.min(1000000, Math.max(0, Math.round(value.y))) : 0;
  const path = format(r);
  if (r.kind === "app") {
    const R = REGISTRY[r.app], section = R.sections.some(([id]) => id === r.key) && !r.arg;
    const object = R.stay?.includes(r.key) && /^[A-Za-z0-9_-]{1,40}$/.test(r.arg || "");
    if (!section && !object || r.hash) return null;
    if (path !== value.path && value.path !== R.path) return null;
    return { path, y };
  }
  if (r.tool === "files") {
    const location = safeFilesLocation(value.files || { kind: "drive", folderId: r.folder || null });
    if (!location || location.kind === "drive" && location.folderId !== (r.folder || null)) return null;
    if (path !== value.path) return null;
    return { path, y, files: location };
  }
  return value.path === "/" || value.path === "/#workspace" ? { path: "/", y } : null;
}
export function createResumeState({ owner, signal, storage, now = Date.now } = {}) {
  if (storage === undefined) try { storage = globalThis.localStorage; } catch {}
  const key = RESUME_PREFIX + owner;
  const live = () => typeof owner === "string" && /^[\w-]{1,100}$/.test(owner) && !signal?.aborted;
  let last = "", savedAt = 0;
  function clear() { try { storage?.removeItem(key); } catch (_) {} last = ""; }
  function targetFor(route, { y = 0, state } = {}) {
    if (!live() || !route || route.query) return null;
    const path = route.kind === "tab" && route.tab === "workspace" && route.tool !== "files" ? "/" : format(route);
    return resumeTarget({ path, y, files: state?.files?.userId === owner ? state.files.location : undefined });
  }
  function remember(route, options) {
    const target = targetFor(route, options);
    if (!target || !storage?.setItem) return false;
    const text = JSON.stringify(target), at = now();
    if (text === last && at - savedAt < 60000) return true;
    try { storage.setItem(key, JSON.stringify({ v: 1, owner, at, target })); last = text; savedAt = at; return true; } catch (_) { return false; }
  }
  function restore(href, apps = {}) {
    if (!live()) return null;
    try {
      const u = new URL(href);
      if (u.pathname !== "/" || u.hash || [...u.searchParams.keys()].some(k => k !== "os")) return null;
      const raw = storage?.getItem(key); if (!raw || raw.length > 1500) return null;
      const record = JSON.parse(raw), at = now();
      const target = resumeTarget(record.target);
      if (!target || record.v !== 1 || record.owner !== owner || !Number.isSafeInteger(record.at) || record.at > at + 60000 || at - record.at > 7 * 864e5) { clear(); return null; }
      const r = parseTarget(target.path);
      if (r?.kind === "app" && apps[r.app] !== true) return null;
      return { ...target, ...(target.files ? { state: { files: { userId: owner, location: target.files } } } : {}) };
    } catch (_) { return null; }
  }
  return { targetFor, remember, restore, clear };
}
