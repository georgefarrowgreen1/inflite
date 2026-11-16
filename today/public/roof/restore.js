// Reopening keeps only a verified account's curated screen reference and scroll.
// Never persist queries, names, content, share/auth tokens or unsaved editor text.
import { REGISTRY, parse, format, safeFilesLocation } from "./router.js";
export const RESUME_PREFIX = "ifl:resume:v1:";
const AGE = 7 * 864e5, ORIGIN = "https://inflite.ai";
export function resumeTarget(value) {
  if (!value || typeof value.path !== "string" || value.path.length > 180 || /[?%\\\s\u0000-\u001f\u007f]/.test(value.path) || !value.path.startsWith("/") || value.path.startsWith("//")) return null;
  const r = parse(value.path, { roof: true, workspace: true, origin: ORIGIN });
  if (!r) return null;
  const y = Number.isFinite(value.y) ? Math.min(1000000, Math.max(0, Math.round(value.y))) : 0;
  if (r.kind === "app") {
    const R = REGISTRY[r.app], section = R.sections.some(([id]) => id === r.key) && !r.arg;
    const object = R.stay?.includes(r.key) && /^[A-Za-z0-9_-]{1,40}$/.test(r.arg || "");
    if (!section && !object || r.query || r.hash) return null;
    const path = format(r);
    if (path !== value.path && value.path !== R.path) return null;
    return { path, y };
  }
  if (r.tool === "files") {
    const location = safeFilesLocation(value.files || { kind: "drive", folderId: r.folder || null });
    if (!location || location.kind === "drive" && location.folderId !== (r.folder || null)) return null;
    const path = format(r); if (path !== value.path) return null;
    return { path, y, files: location };
  }
  return value.path === "/" || value.path === "/#workspace" ? { path: "/", y } : null;
}
export function createResumeState({ owner, signal, storage, now = Date.now } = {}) {
  if (storage === undefined) try { storage = globalThis.localStorage; } catch (_) { storage = null; }
  const key = RESUME_PREFIX + owner;
  const live = () => typeof owner === "string" && /^[\w-]{1,100}$/.test(owner) && !signal?.aborted;
  let last = "", savedAt = 0;
  function clear() { try { storage?.removeItem(key); } catch (_) {} last = ""; }
  function remember(route, { y = 0, state } = {}) {
    if (!live() || !route || route.query || !storage?.setItem) return false;
    const path = route.kind === "tab" && route.tab === "workspace" && route.tool !== "files" ? "/" : format(route);
    const target = resumeTarget({ path, y, files: state?.files?.userId === owner ? state.files.location : undefined });
    if (!target) return false;
    const text = JSON.stringify(target), at = now();
    if (text === last && at - savedAt < 60000) return true;
    try { storage?.setItem(key, JSON.stringify({ v: 1, owner, at, target })); last = text; savedAt = at; return true; } catch (_) { return false; }
  }
  function restore(href, apps = {}) {
    if (!live()) return null;
    let u; try { u = new URL(href); } catch (_) { return null; }
    if (u.pathname !== "/" || u.hash || [...u.searchParams.keys()].some(k => k !== "os")) return null;
    try {
      const raw = storage?.getItem(key); if (!raw || raw.length > 1500) return null;
      const record = JSON.parse(raw), at = now();
      if (record.v !== 1 || record.owner !== owner || !Number.isSafeInteger(record.at) || record.at > at + 60000 || at - record.at > AGE) { clear(); return null; }
      const target = resumeTarget(record.target); if (!target) { clear(); return null; }
      const r = parse(target.path, { roof: true, workspace: true, origin: ORIGIN });
      if (r?.kind === "app" && apps[r.app] !== true) return null;
      return { ...target, ...(target.files ? { state: { files: { userId: owner, location: target.files } } } : {}) };
    } catch (_) { return null; }
  }
  return { remember, restore, clear };
}
