// Ephemeral, explicit workspace context, never a persisted location history.
// Publishers act only after the user's share/place action. This client-side source
// contract coordinates trusted apps; it is not a security permission boundary.
export const WORKSPACE_CONTEXT_SOURCES = Object.freeze(["fitness", "weather"]);
const sourceOf = (v) => typeof v === "string" && /^(?:fitness|weather)(?::[a-z][a-z0-9-]{0,39})?$/.test(v);
const HOUR = 3600000;
const empty = () => Object.freeze({ location: null, interval: null });
const text = (v, max) => typeof v === "string" ? [...v.replace(/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g, "").trim().replace(/\s+/g, " ")].slice(0, max).join("") : "";
const position = (v) => {
  if (v === null) return null;
  if (!v || !Number.isFinite(v.lat) || Math.abs(v.lat) > 90 || !Number.isFinite(v.lon) || Math.abs(v.lon) > 180) return undefined;
  const name = text(v.name, 120);
  if (!name || v.region != null && typeof v.region !== "string") return undefined;
  const region = text(v.region, 80);
  return Object.freeze({ name, lat: Number(v.lat.toFixed(6)), lon: Number(v.lon.toFixed(6)), ...(region ? { region } : {}) });
};
const time = (v, now) => {
  if (v === null) return null;
  if (!v || !Number.isSafeInteger(now) || !Number.isSafeInteger(v.start) || !Number.isSafeInteger(v.end) || v.start >= v.end || v.end - v.start > 48 * HOUR || v.start < now - 24 * HOUR || v.end > now + 16 * 24 * HOUR) return undefined;
  return Object.freeze({ start: v.start, end: v.end });
};
export function createWorkspaceContext({ signal, now = Date.now } = {}) {
  let state = empty(), dead = !!signal?.aborted;
  const listeners = new Set();
  const dispose = () => { dead = true; listeners.clear(); state = empty(); signal?.removeEventListener("abort", dispose); };
  if (!dead) signal?.addEventListener("abort", dispose, { once: true });
  return Object.freeze({
    get: () => state,
    subscribe(fn) {
      if (dead || typeof fn !== "function") return () => {};
      // A disposer owns one registration. Reusing a stable callback after a
      // hide/reopen must not let an older cleanup remove the new listener.
      const entry = { fn };
      listeners.add(entry);
      return () => listeners.delete(entry);
    },
    update(patch, options = {}) {
      const source = options?.source;
      if (dead || !sourceOf(source) || !patch || typeof patch !== "object") return false;
      const location = Object.hasOwn(patch, "location") ? position(patch.location) : state.location;
      const interval = Object.hasOwn(patch, "interval") ? time(patch.interval, now()) : state.interval;
      if (location === undefined || interval === undefined) return false;
      const next = Object.freeze({ location, interval });
      if (JSON.stringify(next) === JSON.stringify(state)) return false;
      state = next;
      const meta = Object.freeze({ source });
      for (const entry of [...listeners]) {
        if (dead || state !== next) break;
        if (listeners.has(entry)) try { entry.fn(next, meta); } catch (_) {}
      }
      return true;
    },
    dispose,
  });
}
