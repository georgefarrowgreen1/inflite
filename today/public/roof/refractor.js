// The shell owns one optical material. Foreground icons and text never enter the filter.
const root = document.documentElement;
const eligible = ".ws-dock, .settings-preview-dock, .ifl-tabs, .ifh:not(.ifh-conversation) .ifh-acts, .ifm-pop, dialog.ifl-sheet[open]";
const solid = matchMedia("(prefers-reduced-transparency: reduce), (prefers-contrast: more), (forced-colors: active)");
const hasCSSCanvas = typeof document.getCSSCanvasContext === "function";
const namedCanvas = hasCSSCanvas && CSS.supports("background-image", "-webkit-canvas(ifl-lava)") && CSS.supports("mask-composite", "exclude");
// WebKit accepts URL backdrop filters in CSS but does not composite their SVG output.
const backdrop = !hasCSSCanvas && CSS.supports("backdrop-filter", "url(#ifl-system-lens)");
const displacement = document.querySelector("#ifl-system-lens feDisplacementMap");
// The dock and drawer share the same edge depth throughout their handoff.
const lenses = {dock:{bend:26, scale:36}, sheet:{bend:10, scale:15}, control:{bend:4, scale:7}};
if (backdrop && displacement) {
  for (const [kind, lens] of Object.entries(lenses)) {
    const filter = displacement.parentNode;
    if (kind === "dock") lens.map = displacement;
    else {
      const copy = filter.cloneNode(true);
      copy.id = "ifl-system-lens-" + kind;
      filter.after(copy);
      lens.map = copy.querySelector("feDisplacementMap");
    }
  }
}
const moving = new Set();
let fullLayout = true;
let strength = 0, source, pixels, glassCanvas, pending = 0;

// WebKit exposes its CSS canvas as a live image. All rims share the already rendered
// wallpaper pixels, including in Still mode. Only their crop changes when a surface moves.
function publish() {
  if (!namedCanvas || !strength || !pixels || !root.hasAttribute("data-midnight-lava") || document.hidden) return;
  if (!glassCanvas || glassCanvas.canvas.width !== pixels.width || glassCanvas.canvas.height !== pixels.height) {
    glassCanvas = document.getCSSCanvasContext("2d", "ifl-lava", pixels.width, pixels.height);
  }
  glassCanvas?.putImageData(pixels, 0, 0);
}

export function wallpaperFrame(canvas, frame) {
  if (!namedCanvas) return;
  const resized = pixels !== frame;
  source = canvas;
  pixels = frame;
  publish();
  if (resized) schedule();
}

function align() {
  pending = 0;
  if (!strength || document.hidden || !source || !root.hasAttribute("data-midnight-lava")) return;
  const sky = source.getBoundingClientRect();
  if (!sky.width || !sky.height) return;
  const nodes = fullLayout ? document.querySelectorAll(eligible) : moving;
  fullLayout = false;
  const updates = [];
  for (const node of nodes) {
    if (!node.isConnected) continue;
    const box = node.getBoundingClientRect();
    if (!box.width || !box.height || box.right <= 0 || box.left >= innerWidth || box.bottom <= 0 || box.top >= innerHeight) continue;
    const preview = node.matches(".settings-preview-dock");
    const scene = preview ? node.previousElementSibling.getBoundingClientRect() : sky;
    const lens = node.matches(".ifh-acts") ? lenses.control :
      node.matches(".ifm-pop, dialog:not([data-sheet=workspace-apps])") ? lenses.sheet : lenses.dock;
    // Work in screen pixels, then undo the current pop/drag transform for the CSS crop.
    const sx = box.width / node.offsetWidth, sy = box.height / node.offsetHeight;
    const bend = lens.bend * strength * (preview ? .5 : 1);
    const zx = 1 + 2 * bend / box.width, zy = 1 + 2 * bend / box.height;
    const x = ((scene.left - box.left) * zx - bend) / sx - node.clientLeft;
    const y = ((scene.top - box.top) * zy - bend) / sy - node.clientTop;
    updates.push([node, scene.width * zx / sx, scene.height * zy / sy, x, y]);
  }
  for (const [node, w, h, x, y] of updates) {
    node.style.setProperty("--ifl-lens-size", w.toFixed(2) + "px " + h.toFixed(2) + "px");
    node.style.setProperty("--ifl-lens-position", x.toFixed(2) + "px " + y.toFixed(2) + "px");
  }
  for (const node of moving) {
    if (!node.isConnected || !node.getAnimations().some(a => a.playState === "running")) moving.delete(node);
  }
  if (moving.size) queueLayout();
}

function queueLayout() {
  if (namedCanvas && strength && source && root.hasAttribute("data-midnight-lava") && !document.hidden && !pending)
    pending = requestAnimationFrame(align);
}

function schedule() {
  fullLayout = true;
  queueLayout();
}

function sync() {
  const prefs = window.InFliteAppearance?.snapshot();
  strength = !solid.matches && prefs?.glass ? prefs.glassStrength / 100 : 0;
  if (!strength) {
    delete root.dataset.refractor;
    cancelAnimationFrame(pending);
    pending = 0;
    moving.clear();
  } else if (namedCanvas) {
    root.dataset.refractor = "wallpaper";
    publish();
    schedule();
  } else if (backdrop && displacement) {
    for (const lens of Object.values(lenses)) lens.map.setAttribute("scale", String(lens.scale * strength));
    root.dataset.refractor = "backdrop";
  }
}

if (namedCanvas) {
  // Route changes and top-layer sheets can replace chrome while the wallpaper is still.
  new MutationObserver(schedule).observe(document.body, {childList:true, subtree:true});
  new MutationObserver(schedule).observe(root, {attributes:true, attributeFilter:["data-midnight-lava", "data-app"]});
  for (const event of ["scroll", "animationend", "transitionend", "toggle"])
    document.addEventListener(event, schedule, {capture:true, passive:true});
  for (const type of ["animationstart", "transitionrun"]) {
    document.addEventListener(type, event => {
      if (!strength || !root.hasAttribute("data-midnight-lava") || !event.target.matches(eligible)) return;
      moving.add(event.target);
      queueLayout();
    });
  }
  addEventListener("pointermove", event => {
    if (event.buttons && document.querySelector("dialog.ifl-sheet[open]")) schedule();
  }, {passive:true});
  addEventListener("resize", schedule);
  window.visualViewport?.addEventListener("resize", schedule);
  window.visualViewport?.addEventListener("scroll", schedule);
}
addEventListener("inflite:appearance", sync);
addEventListener("pageshow", sync);
solid.addEventListener("change", sync);
sync();
