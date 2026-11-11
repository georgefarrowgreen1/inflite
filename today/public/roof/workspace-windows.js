// Geometry and metadata only. A window never owns a second app instance.
export const WINDOW_APPS = Object.freeze(["fitness", "weather", "markets", "chats", "mail"]);
const finite = (v, fallback) => typeof v === "number" && Number.isFinite(v) ? v : fallback;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const clean = (v) => Math.round(v * 10000) / 10000;

export function defaultWindow(index = 0) {
  const n = clamp(Math.floor(finite(index, 0)), 0, 4);
  return { x: .025 + n * .065, y: .025 + n * .04, w: .65, h: .8, minimized: false };
}

export function normalizeWindow(value, fallback = defaultWindow()) {
  const v = value && typeof value === "object" ? value : {}, w = clean(clamp(finite(v.w, fallback.w), .16, 1)), h = clean(clamp(finite(v.h, fallback.h), .18, 1));
  return { x: clean(clamp(finite(v.x, fallback.x), 0, 1 - w)), y: clean(clamp(finite(v.y, fallback.y), 0, 1 - h)), w, h, minimized: v.minimized === true };
}

export function normalizeLayout(value, apps = WINDOW_APPS) {
  const list = [...new Set(apps.filter(app => WINDOW_APPS.includes(app)))], v = value && typeof value === "object" ? value : {};
  const order = Array.isArray(v.order) ? [...new Set(v.order.filter(app => list.includes(app)))] : [];
  for (const app of list) if (!order.includes(app)) order.push(app);
  return { mode: v.mode === "float" ? "float" : "tile", windows: Object.fromEntries(list.map((app, index) => [app, normalizeWindow(v.windows?.[app], defaultWindow(index))])), order };
}

export function pixelBounds(value, width, height) {
  const b = normalizeWindow(value), vw = Math.max(1, finite(width, 1)), vh = Math.max(1, finite(height, 1));
  const w = clamp(b.w * vw, Math.min(320, vw), vw), h = clamp(b.h * vh, Math.min(260, vh), vh);
  return { x: clamp(b.x * vw, 0, vw - w), y: clamp(b.y * vh, 0, vh - h), w, h };
}

export function relativeBounds(value, width, height, minimized = false) {
  const vw = Math.max(1, finite(width, 1)), vh = Math.max(1, finite(height, 1));
  return normalizeWindow({ x: value.x / vw, y: value.y / vh, w: value.w / vw, h: value.h / vh, minimized });
}

export function snapWindow(position, fallback = defaultWindow()) {
  if (position === "left") return { x: 0, y: 0, w: .5, h: 1, minimized: false };
  if (position === "right") return { x: .5, y: 0, w: .5, h: 1, minimized: false };
  if (position === "maximise") return { x: 0, y: 0, w: 1, h: 1, minimized: false };
  return normalizeWindow({ ...fallback, minimized: false });
}
