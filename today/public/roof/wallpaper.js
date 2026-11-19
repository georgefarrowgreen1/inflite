// The wallpaper belongs to the document. App routes only replace content above it.
import {wallpaperFrame} from "./refractor.js";
import {radii, pigments, newLavaScene, driftLava, drawLavaFrame} from "./lava-field.js";
export {lavaColours} from "./lava-field.js";

const preferenceKey = "inflite:dark-wallpaper";
const colourKey = "inflite:lava-colour";
const sceneKey = "inflite:midnight-lava:v1";
const choices = ["lava", "still", "plain"];

function readPreference(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}
let preference = readPreference(preferenceKey);
let colour = readPreference(colourKey);
export const wallpaperColour = () => Object.hasOwn(pigments, colour) ? colour : "midnight";
export function setWallpaperColour(value) {
  if (!Object.hasOwn(pigments, value)) return;
  colour = value;
  try { localStorage.setItem(colourKey, value); } catch {}
  sync();
}
export const wallpaperPreference = () => choices.includes(preference) ? preference : "lava";
export function setWallpaper(value) {
  if (!choices.includes(value)) return;
  preference = value;
  try { localStorage.setItem(preferenceKey, value); } catch {}
  sync();
}

function readScene() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(sceneKey));
    if (Array.isArray(saved) && saved.length === radii.length && saved.every(p =>
      p && ["x","y","vx","vy","targetX","targetY","turn","stretch"].every(k => Number.isFinite(p[k])) &&
      Math.abs(p.x) < 2 && Math.abs(p.y) < 2 && p.stretch >= .9 && p.stretch <= 1.35 &&
      p.turn >= 0 && p.turn <= 65 && [p.vx,p.vy,p.targetX,p.targetY].every(v => Math.abs(v) < .01))) return saved;
  } catch {}
  return null;
}

const root = document.documentElement;
const canvas = document.querySelector(".sky > canvas");
const dark = matchMedia("(prefers-color-scheme: dark)");
const still = matchMedia("(prefers-reduced-motion: reduce)");
const contrast = matchMedia("(prefers-contrast: more), (forced-colors: active)");
let pools, ctx, frame, timer, previous;
let suspended = false;

let preview;
function drawPreview() {
  if (!preview || !frame) return;
  if (preview.width !== frame.width || preview.height !== frame.height) {
    preview.width = frame.width;
    preview.height = frame.height;
  }
  preview.getContext("2d")?.drawImage(canvas, 0, 0);
}
export function previewWallpaper(target, signal) {
  preview = target;
  drawPreview();
  signal.addEventListener("abort", () => { if (preview === target) preview = null; }, {once:true});
}

function checkpoint() {
  if (pools) try { sessionStorage.setItem(sceneKey, JSON.stringify(pools)); } catch {}
}

function paint() {
  const width = canvas.clientWidth, height = canvas.clientHeight;
  if (!width || !height) return;
  const scale = Math.min(1, 220 / Math.max(width, height));
  const w = Math.max(1, Math.round(width * scale)), h = Math.max(1, Math.round(height * scale));
  if (!frame || frame.width !== w || frame.height !== h) {
    canvas.width = w; canvas.height = h;
    frame = ctx.createImageData(w, h);
  }
  const now = performance.now(), aspect = w / h;
  if (previous && !still.matches && wallpaperPreference() === "lava") driftLava(pools, Math.min(.5, (now - previous) / 1000), aspect);
  previous = now;
  drawLavaFrame(ctx, frame, pools, wallpaperColour());
  wallpaperFrame(canvas, frame);
  drawPreview();
}

function sync() {
  clearInterval(timer);
  previous = 0;
  const night = root.dataset.theme ? root.dataset.theme === "dark" : dark.matches;
  const enabled = canvas && night && wallpaperPreference() !== "plain" && !contrast.matches;
  if (enabled) ctx ||= canvas.getContext("2d", {alpha:false});
  if (enabled && ctx) root.dataset.midnightLava = wallpaperColour();
  else delete root.dataset.midnightLava;
  if (!enabled || !ctx || document.hidden || suspended) return;
  pools ||= readScene() || newLavaScene();
  paint();
  if (!still.matches && wallpaperPreference() === "lava") timer = setInterval(paint, 250);
}

if (canvas) {
  for (const media of [dark, still, contrast]) media.addEventListener("change", sync);
  new MutationObserver(sync).observe(root, {attributes:true, attributeFilter:["data-theme"]});
  new ResizeObserver(sync).observe(canvas.parentElement);
  addEventListener("storage", event => {
    if (event.storageArea !== localStorage || (event.key && event.key !== preferenceKey && event.key !== colourKey)) return;
    preference = readPreference(preferenceKey);
    colour = readPreference(colourKey);
    sync();
    window.dispatchEvent(new Event("inflite:wallpaper-storage"));
  });
  document.addEventListener("visibilitychange", () => { if (document.hidden) checkpoint(); sync(); });
  addEventListener("pagehide", () => { suspended = true; checkpoint(); sync(); });
  addEventListener("pageshow", event => {
    suspended = false;
    if (event.persisted && pools) pools = readScene() || pools;
    sync();
  });
  sync();
}
