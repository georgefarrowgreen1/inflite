// The shell owns one optical material. Foreground icons and text never enter the filter.
const root = document.documentElement;
const eligible = ".ws-dock, .ifl-tabs, .ifh:not(.ifh-conversation) .ifh-acts, .ifm-pop, dialog.ifl-sheet[open]";
const solid = matchMedia("(prefers-reduced-transparency: reduce), (prefers-contrast: more), (forced-colors: active)");
const hasCSSCanvas = typeof document.getCSSCanvasContext === "function";
const namedCanvas = hasCSSCanvas && CSS.supports("background-image", "-webkit-canvas(ifl-lava)") && CSS.supports("mask-composite", "exclude");
// WebKit accepts URL backdrop filters in CSS but does not composite their SVG output.
const backdrop = !hasCSSCanvas && CSS.supports("backdrop-filter", "url(#ifl-system-lens)");
const displacement = document.querySelector("#ifl-system-lens feDisplacementMap");
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
  const zoom = 1 + .32 * strength;
  const visible = [];
  for (const node of document.querySelectorAll(eligible)) {
    const box = node.getBoundingClientRect();
    if (box.width && box.height && box.right > 0 && box.left < innerWidth && box.bottom > 0 && box.top < innerHeight)
      visible.push([node, box]);
  }
  root.style.setProperty("--ifl-lens-size", sky.width * zoom + "px " + sky.height * zoom + "px");
  for (const [node, box] of visible) {
    const x = (sky.left - box.left) * zoom - box.width * (zoom - 1) / 2;
    const y = (sky.top - box.top) * zoom - box.height * (zoom - 1) / 2;
    node.style.setProperty("--ifl-lens-position", x.toFixed(1) + "px " + y.toFixed(1) + "px");
  }
}

function schedule() {
  if (namedCanvas && strength && source && root.hasAttribute("data-midnight-lava") && !document.hidden && !pending)
    pending = requestAnimationFrame(align);
}

function sync() {
  const prefs = window.InFliteAppearance?.snapshot();
  strength = !solid.matches && prefs?.glass ? prefs.glassStrength / 100 : 0;
  if (!strength) {
    delete root.dataset.refractor;
    cancelAnimationFrame(pending);
    pending = 0;
  } else if (namedCanvas) {
    root.dataset.refractor = "wallpaper";
    publish();
    schedule();
  } else if (backdrop && displacement) {
    displacement.setAttribute("scale", String(36 * strength));
    root.dataset.refractor = "backdrop";
  }
}

if (namedCanvas) {
  // Route changes and top-layer sheets can replace chrome while the wallpaper is still.
  new MutationObserver(schedule).observe(document.body, {childList:true, subtree:true});
  new MutationObserver(schedule).observe(root, {attributes:true, attributeFilter:["data-midnight-lava", "data-app"]});
  for (const event of ["scroll", "animationend", "transitionend", "toggle"])
    document.addEventListener(event, schedule, {capture:true, passive:true});
  addEventListener("resize", schedule);
  window.visualViewport?.addEventListener("resize", schedule);
  window.visualViewport?.addEventListener("scroll", schedule);
}
addEventListener("inflite:appearance", sync);
addEventListener("pageshow", sync);
solid.addEventListener("change", sync);
sync();
