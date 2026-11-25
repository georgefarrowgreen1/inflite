// WebKit's native backdrop composites page content. Refract only the wallpaper
// inside its own paint layer so intervening content naturally covers the bevel.
const root = document.documentElement;
// Workspace panes already provide their own material to the controls inside them.
const atlas = ".atlas-app:not(.ifl-in-pane)";
const controlSurfaces = `.ifh:not(.ifh-conversation) .ifh-acts:not(:empty), .m-mail .mr-qr, .m-chats .ch-composer, ${atlas} .atlas-glass--control`;
const windowSurfaces = `.ifm-pop, dialog.ifl-sheet[open]:not([data-sheet=workspace-apps]), ${atlas} .action-menu[open] > .atlas-glass--window`;
const eligible = `.ws-dock, .settings-preview-dock, .ifl-tabs, dialog.ifl-sheet[open][data-sheet=workspace-apps], ${controlSurfaces}, ${windowSurfaces}`;
const profiles = {dock:{depth:7, bend:12}, sheet:{depth:5, bend:7}, control:{depth:3.5, bend:4}};
let source, strength = 0, pending = 0;
const crops = new Map();
const sizes = typeof ResizeObserver === "function" ? new ResizeObserver(schedule) : null;

// A rounded, antialiased band for each physical pixel of the bevel. Geometry
// is reused while the orbs move. Only these thin bands need to be drawn.
function bevel(width, height, radii, profile, density) {
  const depth = Math.min(profile.depth, width / 4, height / 4) * strength;
  const count = Math.max(1, Math.ceil(depth * density));
  const bands = [];
  function contour(path, inset) {
    path.roundRect(inset, inset, width-2*inset, height-2*inset, radii.map(r => Math.max(0, r-inset)));
  }
  for (let i=0; i<count; i++) {
    const path = new Path2D();
    contour(path, Math.max(0, (i-.35)*depth/count));
    contour(path, (i+1)*depth/count);
    // Centre and silhouette meet the original artwork without a discontinuity.
    const bend = profile.bend * strength * Math.sin(Math.PI * (i+.5)/count) ** 2;
    bands.push({path, insetX:Math.min(.2, bend/width), insetY:Math.min(.2, bend/height)});
  }
  return bands;
}

function paint(crop) {
  const {art, canvas, ctx, x, y, width, height, cssWidth, cssHeight} = crop;
  const sx = x * art.width, sy = y * art.height;
  const sw = width * art.width, sh = height * art.height;
  const w = Math.max(1, Math.round(sw)), h = Math.max(1, Math.round(sh));
  // Match the backing store of the artwork, including display-density changes.
  if (canvas.width !== w || canvas.height !== h || !crop.bands) {
    canvas.width = w; canvas.height = h;
    ctx.setTransform(w/cssWidth, 0, 0, h/cssHeight, 0, 0);
    crop.bands = bevel(cssWidth, cssHeight, crop.radii, crop.profile, Math.max(w/cssWidth,h/cssHeight));
  }
  ctx.clearRect(0, 0, cssWidth, cssHeight);
  for (const {path, insetX, insetY} of crop.bands) {
    ctx.save();
    ctx.clip(path, "evenodd");
    ctx.drawImage(art, sx + insetX*sw, sy + insetY*sh,
      sw*(1-2*insetX), sh*(1-2*insetY), 0, 0, cssWidth, cssHeight);
    ctx.restore();
  }
}

export function wallpaperFrame(canvas, damage) {
  if (!strength || document.hidden) return;
  if (source !== canvas) { source = canvas; schedule(); }
  for (const crop of crops.values()) {
    // Preview art is a scaled copy of the complete scene, so its normalized
    // crop coordinates can use the same damage rectangles as the wallpaper.
    if (!damage?.length || damage.some(a => a.left < crop.x+crop.width && a.right > crop.x &&
      a.top < crop.y+crop.height && a.bottom > crop.y)) paint(crop);
  }
}

function removeCrops() {
  sizes?.disconnect();
  for (const crop of crops.values()) crop.layer.remove();
  crops.clear();
}

function align() {
  pending = 0;
  if (!source || !strength || !root.hasAttribute("data-midnight-lava") || document.hidden) { removeCrops(); return; }
  const boxes = new Map();
  const sceneRect = source.getBoundingClientRect();
  let animating = false;
  for (const node of document.querySelectorAll(eligible)) {
    const box = node.getBoundingClientRect();
    if (!box.width || !box.height || box.right <= 0 || box.left >= innerWidth || box.bottom <= 0 || box.top >= innerHeight || node.hasAttribute("data-launcher-open")) continue;
    const style = getComputedStyle(node);
    if (style.visibility === "hidden") continue;
    animating ||= node.getAnimations().some(a => a.playState === "running");
    if (style.opacity === "0") continue;
    const preview = node.matches(".settings-preview-dock");
    const host = preview ? node.parentElement : source.parentElement;
    const art = preview ? host.querySelector(":scope > canvas") : source;
    const scene = preview ? art?.getBoundingClientRect() : sceneRect;
    if (!scene?.width || !scene.height) continue;
    const origin = preview ? host.getBoundingClientRect() : scene;
    const round = Math.min(box.width, box.height)/2;
    const radii = [style.borderTopLeftRadius,style.borderTopRightRadius,style.borderBottomRightRadius,style.borderBottomLeftRadius]
      .map(radius => radius.endsWith("%") ? Math.min(1,parseFloat(radius)/50)*round : Math.min(round,parseFloat(radius) || 0));
    const profile = node.matches(controlSurfaces) ? profiles.control :
      node.matches(windowSurfaces) ? profiles.sheet : profiles.dock;
    boxes.set(node, {host, art, box, scene, origin, radius:style.borderRadius, radii, profile});
  }
  for (const [node, {host, art, box, scene, origin, radius, radii, profile}] of boxes) {
    let crop = crops.get(node);
    if (!crop) {
      const layer = document.createElement("div"), canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (!ctx) continue;
      layer.className = "ifl-orb-lens";
      layer.setAttribute("aria-hidden", "true");
      layer.append(canvas);
      // Keep the refracted artwork in the wallpaper's own paint order. Anything
      // scrolling between the wallpaper and glass naturally covers it.
      if (node.parentElement === host) host.insertBefore(layer, node);
      else host.append(layer);
      crop = {layer, canvas, ctx};
      crops.set(node, crop);
      sizes?.observe(node);
    }
    const x = (box.left - scene.left) / scene.width, y = (box.top - scene.top) / scene.height;
    const width = box.width / scene.width, height = box.height / scene.height;
    if (crop.cssWidth !== box.width || crop.cssHeight !== box.height || crop.radius !== radius || crop.profile !== profile || crop.strength !== strength) {
      Object.assign(crop, {cssWidth:box.width, cssHeight:box.height, radius, radii, profile, strength, bands:null});
      Object.assign(crop.layer.style, {width:box.width+"px", height:box.height+"px", borderRadius:radius});
    }
    if (!crop.bands || crop.art !== art || crop.x !== x || crop.y !== y || crop.width !== width || crop.height !== height) {
      Object.assign(crop, {art,x,y,width,height});
      paint(crop);
    }
    const left = box.left-origin.left, top = box.top-origin.top;
    if (crop.left !== left || crop.top !== top) {
      crop.left = left; crop.top = top;
      Object.assign(crop.layer.style, {left:left+"px", top:top+"px"});
    }
  }
  for (const [node, crop] of crops) if (!boxes.has(node)) { sizes?.unobserve(node); crop.layer.remove(); crops.delete(node); }
  if (animating) schedule();
}

function schedule() {
  if (strength && !pending && !document.hidden) pending = requestAnimationFrame(align);
}

export function setStrength(value) {
  strength = value;
  if (strength) {
    source ||= document.querySelector(".sky > canvas");
    schedule();
  } else {
    cancelAnimationFrame(pending);
    pending = 0;
    removeCrops();
  }
}

// Batch geometry on layout changes; scrolling colours come from native glass.
new MutationObserver(records => {
  if (!strength || document.hidden) return;
  if (records.some(r => r.type === "attributes" || [...r.addedNodes, ...r.removedNodes].some(n => n.nodeType === 1 && !n.matches(".ifl-orb-lens")))) schedule();
}).observe(document.body, {childList:true, subtree:true, attributes:true, attributeFilter:["hidden","open","data-launcher-open"]});
new MutationObserver(schedule).observe(root, {attributes:true, attributeFilter:["data-midnight-lava","data-app"]});
for (const event of ["scroll","transitionrun","transitionend","animationstart","animationend","toggle"])
  document.addEventListener(event, schedule, {capture:true, passive:true});
addEventListener("pointermove", event => { if (event.buttons && document.querySelector("dialog.dragging")) schedule(); }, {passive:true});
addEventListener("resize", schedule);
window.visualViewport?.addEventListener("resize", schedule);
document.addEventListener("visibilitychange", schedule);
