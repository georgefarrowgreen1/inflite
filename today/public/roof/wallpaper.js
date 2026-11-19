// The wallpaper belongs to the document. App routes only replace content above it.
import {bubbleMotion} from "./bubble-motion.js";
import {wallpaperFrame} from "./refractor.js";
import {minerals, defaultBubbleColour, newBubbleScene, validBubbleScene, driftBubbles, respondingBubbles, drawBubbles, sizeBubbleCanvas} from "./bubbles.js";
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
export const wallpaperColour = () => Object.hasOwn(minerals, colour) ? colour : defaultBubbleColour;
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
let suspended = false, light = false, lastSample = -Infinity;

function drawPreview(frameScene = false) {
  if (!preview?.isConnected || !ctx || !bubbles) return;
  const scale = Math.min(1, 960 / Math.max(canvas.width,canvas.height));
  const w = Math.max(1,Math.round(canvas.width*scale)), h = Math.max(1,Math.round(canvas.height*scale));
  if (frameScene || preview.width !== w || preview.height !== h) {
    preview.width = w; preview.height = h;
    // Frame the largest orb when opening or rotating. The scene can then drift freely.
    preview.style.setProperty("--scene-aspect", String(w/h));
    preview.style.setProperty("--scene-x", String(bubbles[0].x));
    preview.style.setProperty("--scene-y", String(bubbles[0].y));
  }
  preview.getContext("2d")?.drawImage(canvas, 0, 0, w, h);
}
export function previewWallpaper(target, signal) {
  if (preview !== target) {
    preview = target;
    signal.addEventListener("abort", () => { if (preview === target) preview = null; }, {once:true});
  }
  drawPreview(true);
}

function checkpoint() {
  if (bubbles) try { sessionStorage.setItem(sceneKey, JSON.stringify(bubbles)); } catch {}
}

const setMotion = canvas && bubbleMotion(canvas, paint);

function paint(dt, pointer, live) {
  const width = canvas.clientWidth, height = canvas.clientHeight;
  if (!width || !height) return;
  const aspect = width/height;
  bubbles ||= readScene() || newBubbleScene(aspect);
  if (dt || pointer) driftBubbles(bubbles,dt,aspect,pointer);
  sizeBubbleCanvas(canvas,width,height,live && respondingBubbles(bubbles));
  const moving = drawBubbles(ctx,bubbles,wallpaperColour(),workspace && !workspace.hidden ? .53 : 0,live,light);
  // The small glass bevel and Settings thumbnail sample the full-rate artwork.
  // Avoid a synchronous WebKit pixel readback on every high-refresh frame.
  const now = performance.now();
  if (!dt || !moving || now-lastSample >= 1000/30) {
    wallpaperFrame(canvas);
    drawPreview();
    lastSample = now;
  }
  return moving;
}

function sync() {
  light = root.dataset.theme ? root.dataset.theme === "light" : !dark.matches;
  const enabled = canvas && wallpaperPreference() !== "plain" && !contrast.matches;
  if (enabled) ctx ||= canvas.getContext("2d", {alpha:false});
  if (enabled && ctx) {
    const colour = wallpaperColour();
    root.dataset.midnightLava = colour;
    const ink = minerals[colour];
    root.style.setProperty("--orb-ground", light ? ink.light.base : ink.base);
  } else {
    delete root.dataset.midnightLava;
    root.style.removeProperty("--orb-ground");
  }
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
