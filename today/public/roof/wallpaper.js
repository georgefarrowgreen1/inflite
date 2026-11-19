// The wallpaper belongs to the document. App routes only replace content above it.
import {bubbleMotion} from "./bubble-motion.js";
import {wallpaperFrame} from "./refractor.js";
import {minerals, newBubbleScene, validBubbleScene, driftBubbles, drawBubbles, sizeBubbleCanvas} from "./bubbles.js";
export {bubbleColours} from "./bubbles.js";

const preferenceKey = "inflite:dark-wallpaper";
const colourKey = "inflite:lava-colour"; // Retain people's saved colourways.
const sceneKey = "inflite:bubbles:v1";
const choices = ["bubbles", "still", "plain"];

function readPreference(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}
let preference = readPreference(preferenceKey);
let colour = readPreference(colourKey);
export const wallpaperColour = () => Object.hasOwn(minerals, colour) ? colour : "midnight";
export function setWallpaperColour(value) {
  if (!Object.hasOwn(minerals, value)) return;
  colour = value;
  try { localStorage.setItem(colourKey, value); } catch {}
  sync();
}
export const wallpaperPreference = () => choices.includes(preference) ? preference : "bubbles";
export function setWallpaper(value) {
  if (value === "lava") value = "bubbles";
  if (!choices.includes(value)) return;
  preference = value;
  try { localStorage.setItem(preferenceKey, value); } catch {}
  sync();
}

function readScene() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(sceneKey));
    if (validBubbleScene(saved)) return saved;
  } catch {}
  return null;
}

const root = document.documentElement;
const canvas = document.querySelector(".sky > canvas");
const workspace = document.getElementById("in");
const dark = matchMedia("(prefers-color-scheme: dark)");
const still = matchMedia("(prefers-reduced-motion: reduce)");
const contrast = matchMedia("(prefers-contrast: more), (forced-colors: active)");
let bubbles, ctx, preview;
let suspended = false;

function drawPreview() {
  if (!preview || !ctx) return;
  const scale = Math.min(1, 480 / Math.max(canvas.width,canvas.height));
  const w = Math.max(1,Math.round(canvas.width*scale)), h = Math.max(1,Math.round(canvas.height*scale));
  if (preview.width !== w || preview.height !== h) { preview.width = w; preview.height = h; }
  preview.getContext("2d")?.drawImage(canvas, 0, 0, w, h);
}
export function previewWallpaper(target, signal) {
  preview = target;
  drawPreview();
  signal.addEventListener("abort", () => { if (preview === target) preview = null; }, {once:true});
}

function checkpoint() {
  if (bubbles) try { sessionStorage.setItem(sceneKey, JSON.stringify(bubbles)); } catch {}
}

const setMotion = canvas && bubbleMotion(canvas, paint);

function paint(dt, pointer) {
  if (!sizeBubbleCanvas(canvas, canvas.clientWidth, canvas.clientHeight)) return;
  const aspect = canvas.width / canvas.height;
  bubbles ||= readScene() || newBubbleScene(aspect);
  const highlight = (dt || pointer) ? driftBubbles(bubbles,dt,aspect,pointer) : null;
  drawBubbles(ctx,bubbles,wallpaperColour(),workspace && !workspace.hidden ? .53 : 0,highlight);
  wallpaperFrame(canvas);
  drawPreview();
  return highlight;
}

function sync() {
  const night = root.dataset.theme ? root.dataset.theme === "dark" : dark.matches;
  const enabled = canvas && night && wallpaperPreference() !== "plain" && !contrast.matches;
  if (enabled) ctx ||= canvas.getContext("2d", {alpha:false});
  if (enabled && ctx) root.dataset.midnightLava = wallpaperColour();
  else delete root.dataset.midnightLava;
  const visible = enabled && ctx && !document.hidden && !suspended;
  const live = !still.matches && wallpaperPreference() === "bubbles";
  setMotion?.(visible ? (live ? "live" : "still") : "off");
}

if (canvas) {
  for (const media of [dark, still, contrast]) media.addEventListener("change", sync);
  function watchDensity() {
    matchMedia(`(resolution: ${devicePixelRatio}dppx)`).addEventListener("change", () => {
      watchDensity();
      sync();
    }, {once:true});
  }
  watchDensity();
  new MutationObserver(sync).observe(root, {attributes:true, attributeFilter:["data-theme"]});
  if (workspace) new MutationObserver(sync).observe(workspace, {attributes:true, attributeFilter:["hidden"]});
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
    if (event.persisted && bubbles) bubbles = readScene() || bubbles;
    sync();
  });
  sync();
}
