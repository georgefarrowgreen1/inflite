// The wallpaper belongs to the document. App routes only replace content above it.
const preferenceKey = "inflite:dark-wallpaper";
const sceneKey = "inflite:midnight-lava:v1";
const choices = ["lava", "still", "plain"];
const radii = [.28, .11, .23, .14, .27, .064];
const range = (low, high) => low + Math.random() * (high - low);

function readPreference() {
  try { return localStorage.getItem(preferenceKey); } catch { return null; }
}
let preference = readPreference();
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

function newScene() {
  return radii.map(() => {
    const angle = range(0, Math.PI * 2), speed = range(.00035, .00075);
    const vx = Math.cos(angle) * speed, vy = Math.sin(angle) * speed;
    return { x: range(-.04, 1.04), y: range(-.04, 1.04), stretch: range(.9, 1.35),
      vx, vy, targetX: vx, targetY: vy, turn: range(12, 48) };
  });
}

const root = document.documentElement;
const canvas = document.querySelector(".sky > canvas");
const dark = matchMedia("(prefers-color-scheme: dark)");
const still = matchMedia("(prefers-reduced-motion: reduce)");
const contrast = matchMedia("(prefers-contrast: more), (forced-colors: active)");
let pools, ctx, frame, timer, previous;
let suspended = false;

function checkpoint() {
  if (pools) try { sessionStorage.setItem(sceneKey, JSON.stringify(pools)); } catch {}
}

function drift(dt, aspect) {
  // Ease towards independently sampled velocities. A soft edge current keeps pools in reach.
  const blend = -Math.expm1(-dt / 12);
  const edge = p => Math.max(0, .12 - p) - Math.max(0, p - .88);
  for (const p of pools) {
    p.turn -= dt;
    if (p.turn <= 0) {
      const angle = range(0, Math.PI * 2), speed = range(.00035, .00075);
      p.targetX = Math.cos(angle) * speed;
      p.targetY = Math.sin(angle) * speed;
      p.turn = range(20, 65);
    }
    p.vx += (p.targetX + edge(p.x) * .005 - p.vx) * blend;
    p.vy += (p.targetY + edge(p.y) * .005 - p.vy) * blend;
    p.x += p.vx * dt / Math.max(1, aspect);
    p.y += p.vy * dt * Math.min(1, aspect);
  }
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
  if (previous && !still.matches && wallpaperPreference() === "lava") drift(Math.min(.5, (now - previous) / 1000), aspect);
  previous = now;
  const pixels = frame.data;
  const sx = .77 * Math.max(1, aspect), sy = .77 * Math.max(1, 1 / aspect);
  // X and Y terms are separable, so compute distances once per column and row.
  const columns = pools.map(p => Array.from({length:w}, (_, x) => (x / w - p.x) * sx));
  let index = 0;
  for (let y = 0; y < h; y++) {
    const v = y / h, warm = v * .32 + .22 * Math.cos(v * 5 + .36);
    const rows = pools.map(p => (v - p.y) * sy / p.stretch);
    for (let x = 0; x < w; x++) {
      let field = 0, nx = 0, ny = 0;
      for (let j = 0; j < pools.length; j++) {
        const dx = columns[j][x], dy = rows[j];
        const d = dx * dx + dy * dy + .002, mass = radii[j] ** 2 / d;
        field += mass; nx -= dx * mass / d; ny -= dy * mass / (d * pools[j].stretch);
      }
      const level = field - 1.65, inside = 1 / (1 + Math.exp(-level * 21));
      const rim = Math.exp(-Math.abs(level) * 5.8);
      const light = Math.max(0, (nx * .51 + ny * .86) / (Math.sqrt(nx * nx + ny * ny) || 1));
      const ambient = Math.min(1, field * .42), hot = Math.max(0, Math.min(1, (1 - x / w) * .58 + warm));
      const sheen = rim * (.2 + .8 * light), depth = 1 / (1 + Math.max(0, level) * .85);
      pixels[index++] = 11 + ambient * 12 + inside * (47 + hot * 61 + depth * 22) + sheen * (66 + hot * 72);
      pixels[index++] = 9 + ambient * 6 + inside * (16 + hot * 10) + sheen * (27 + hot * 43);
      pixels[index++] = 17 + ambient * 19 + inside * (56 - hot * 27 + depth * 14) + sheen * (58 - hot * 33);
      pixels[index++] = 255;
    }
  }
  ctx.putImageData(frame, 0, 0);
}

function sync() {
  clearInterval(timer);
  previous = 0;
  const night = root.dataset.theme ? root.dataset.theme === "dark" : dark.matches;
  const enabled = canvas && night && wallpaperPreference() !== "plain" && !contrast.matches;
  if (enabled) ctx ||= canvas.getContext("2d", {alpha:false});
  root.toggleAttribute("data-midnight-lava", Boolean(enabled && ctx));
  if (!enabled || !ctx || document.hidden || suspended) return;
  pools ||= readScene() || newScene();
  paint();
  if (!still.matches && wallpaperPreference() === "lava") timer = setInterval(paint, 250);
}

if (canvas) {
  for (const media of [dark, still, contrast]) media.addEventListener("change", sync);
  new MutationObserver(sync).observe(root, {attributes:true, attributeFilter:["data-theme"]});
  new ResizeObserver(sync).observe(canvas.parentElement);
  addEventListener("storage", event => {
    if (!event.key || event.key === preferenceKey) { preference = readPreference(); sync(); }
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
