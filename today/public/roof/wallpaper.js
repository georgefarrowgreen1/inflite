// The wallpaper belongs to the document. App routes only replace content above it.
import {minerals, defaultBubbleColour} from "./bubble-colours.js";
export {bubbleColours} from "./bubble-colours.js";

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
    if (engine?.validBubbleScene(saved)) return saved;
  } catch {}
  return null;
}

const root = document.documentElement;
const canvas = document.querySelector(".sky > canvas");
const workspace = document.getElementById("in");
const signedOut = document.getElementById("out");
const dark = matchMedia("(prefers-color-scheme: dark)");
const still = matchMedia("(prefers-reduced-motion: reduce)");
const contrast = matchMedia("(prefers-contrast: more), (forced-colors: active)");
let bubbles, ctx, preview, previewSize, refraction, wallpaperFrame;
let suspended = false, light = false;
let engine, motion, loading, setMotion;

function prepareRefraction() {
  const prefs = window.InFliteAppearance?.snapshot();
  if (refraction || workspace?.hidden !== false || contrast.matches || !prefs?.glass || !prefs.glassStrength) return;
  refraction = import("./refractor.js").then(module => {
    wallpaperFrame = module.wallpaperFrame;
    if (ctx) wallpaperFrame(canvas);
  }).catch(() => { refraction = null; });
}

function drawPreview(frameScene = false) {
  if (!preview?.isConnected || !ctx || !bubbles) return;
  const frame = preview.parentElement;
  const fit = Math.max(frame.clientWidth / canvas.width, frame.clientHeight / canvas.height);
  const scale = Math.min(1, fit * (window.devicePixelRatio || 1));
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
    previewSize ||= new ResizeObserver(() => drawPreview(true));
    previewSize.disconnect();
    previewSize.observe(target.parentElement);
    signal.addEventListener("abort", () => {
      if (preview === target) { previewSize.disconnect(); preview = null; }
    }, {once:true});
  }
  drawPreview(true);
}

function checkpoint() {
  if (bubbles) try { sessionStorage.setItem(sceneKey, JSON.stringify(bubbles)); } catch {}
}

const damage = [];
function loadRenderer() {
  if (loading) return;
  loading = Promise.all([import("./bubbles.js"), import("./bubble-motion.js")]).then(([art, input]) => {
    engine = art;
    motion = input.bubbleMotion;
    // Preferences, visibility and the selected shell screen can change during either import.
    sync();
  }).catch(() => { loading = null; });
}

function paint(dt, pointer, live, frameMs) {
  const width = canvas.clientWidth, height = canvas.clientHeight;
  if (!width || !height) return;
  const aspect = width/height;
  bubbles ||= readScene() || engine.newBubbleScene(aspect);
  if (dt || pointer) engine.driftBubbles(bubbles,dt,aspect,pointer);
  engine.sizeBubbleCanvas(canvas,width,height);
  const moving = engine.drawBubbles(ctx,bubbles,wallpaperColour(),workspace && !workspace.hidden ? .53 : 0,live,light,damage,frameMs);
  if (moving === null) return false;
  drawPreview();
  wallpaperFrame?.(canvas,damage);
  return moving;
}

function sync() {
  light = root.dataset.theme ? root.dataset.theme === "light" : !dark.matches;
  const enabled = canvas && wallpaperPreference() !== "plain" && !contrast.matches;
  // The opening screen paints its own opaque artwork while the session resolves.
  const revealed = !workspace || !workspace.hidden || signedOut?.hidden === false;
  const visible = enabled && revealed && !document.hidden && !suspended &&
    canvas.parentElement.clientWidth > 0 && canvas.parentElement.clientHeight > 0;
  if (visible) {
    if (!engine) loadRenderer();
    else {
      ctx ||= canvas.getContext("2d", {alpha:false});
      if (ctx) setMotion ||= motion(canvas,paint);
    }
  }
  if (enabled && ctx) {
    const colour = wallpaperColour();
    root.dataset.midnightLava = colour;
    const ink = minerals[colour];
    root.style.setProperty("--orb-ground", light ? ink.light.base : ink.base);
  } else {
    delete root.dataset.midnightLava;
    root.style.removeProperty("--orb-ground");
  }
  const live = !still.matches && wallpaperPreference() === "bubbles";
  setMotion?.(visible ? (live ? "live" : "still") : "off");
  prepareRefraction();
}

if (canvas) {
  addEventListener("inflite:appearance", prepareRefraction);
  for (const media of [dark, still, contrast]) media.addEventListener("change", sync);
  new MutationObserver(sync).observe(root, {attributes:true, attributeFilter:["data-theme"]});
  const screens = new MutationObserver(sync);
  for (const view of [workspace, signedOut]) {
    if (view) screens.observe(view, {attributes:true, attributeFilter:["hidden"]});
  }
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
