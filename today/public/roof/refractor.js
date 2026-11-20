// Apply the lens to the scene before the browser paints the glass and its controls.
const root = document.documentElement;
const solid = matchMedia("(prefers-reduced-transparency: reduce), (prefers-contrast: more), (forced-colors: active)");
const hasBackdrop = CSS.supports("backdrop-filter", "blur(1px)") || CSS.supports("-webkit-backdrop-filter", "blur(1px)");
// WebKit accepts SVG in backdrop-filter syntax but only renders displacement as
// a regular filter. Its native glass composites text, images and frames.
const artLens = typeof document.getCSSCanvasContext === "function";
const displacement = document.querySelector("#ifl-system-lens feDisplacementMap");
const canDisplace = hasBackdrop && (artLens ? typeof Path2D !== "undefined" && !!Path2D.prototype.roundRect :
  !!displacement && CSS.supports("backdrop-filter", "url(#ifl-system-lens)"));
const lenses = [];
if (!artLens && canDisplace) {
  for (const [kind, scale] of [["dock",.085], ["sheet",.032], ["control",.055]]) {
    const filter = displacement.parentNode;
    const node = kind === "dock" ? filter : filter.cloneNode(true);
    if (node !== filter) { node.id += "-" + kind; filter.after(node); }
    lenses.push({map:node.querySelector("feDisplacementMap"), scale});
  }
}

let artwork, loading, strength = 0;

export function wallpaperFrame(canvas, damage) {
  artwork?.wallpaperFrame(canvas, damage);
}

function sync() {
  const prefs = window.InFliteAppearance?.snapshot();
  strength = canDisplace && !solid.matches && prefs?.glass ? prefs.glassStrength / 100 : 0;
  if (!strength) {
    delete root.dataset.refractor;
    artwork?.setStrength(0);
  } else if (!artLens) {
    for (const {map, scale} of lenses) map.setAttribute("scale", String(scale * strength));
    root.dataset.refractor = "backdrop";
  } else if (artwork) {
    artwork.setStrength(strength);
    root.dataset.refractor = "artwork";
  } else if (!loading) {
    loading = import("./orb-refraction.js").then(module => {
      artwork = module;
      sync();
    }).catch(() => { loading = null; });
  }
}

addEventListener("inflite:appearance", sync);
addEventListener("pageshow", sync);
solid.addEventListener("change", sync);
sync();
