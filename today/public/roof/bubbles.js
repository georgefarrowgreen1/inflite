// Positions are fractions of the viewport. Sizes and speeds are fractions of its short edge.
const sizes = [.30, .165, .082, .037];
const tau = Math.PI * 2;
const range = (low, high) => low + Math.random() * (high - low);
const clamp = value => Math.max(0, Math.min(1, value));

export const minerals = {
  midnight: {name:"Midnight", base:"#100e1a", atmosphere:"#352340", deep:"#302043", violet:"#65529e", bloom:"#dc94b8", pearl:"#f1d9eb", flash:"#8ed6f0"},
  jade: {name:"Jade", base:"#091311", atmosphere:"#12362e", deep:"#123a37", violet:"#267f71", bloom:"#92bf78", pearl:"#d6f1cf", flash:"#88d9c7"},
  cobalt: {name:"Cobalt", base:"#0a0f1d", atmosphere:"#1c304a", deep:"#18284d", violet:"#4459a0", bloom:"#6caee4", pearl:"#d1e5ff", flash:"#9eacfa"},
  lagoon: {name:"Lagoon", base:"#08131c", atmosphere:"#163746", deep:"#163348", violet:"#326c9a", bloom:"#52bdaa", pearl:"#cef4e2", flash:"#a4c8ff"}
};
export const bubbleColours = Object.entries(minerals).map(([value, {name}]) => ({value, name}));

function direction() {
  const angle = range(0, tau), speed = range(.0032, .007);
  return [Math.cos(angle) * speed, Math.sin(angle) * speed];
}

// Spread out the first frame. The starting points play no part in subsequent motion.
export function newBubbleScene(aspect = 1) {
  const bubbles = [];
  for (const radius of sizes) {
    const candidate = () => [range(.09, .91), range(.09, .91)];
    let [x, y] = candidate();
    for (let n = 0; n < 24 && bubbles.some((b, i) =>
      Math.hypot((x-b.x) * Math.max(1,aspect), (y-b.y) * Math.max(1,1/aspect)) < (radius+sizes[i]) * 1.22); n++) {
      [x, y] = candidate();
    }
    const [vx, vy] = direction();
    bubbles.push({x, y, vx, vy, dx:vx, dy:vy, turn:range(14, 52),
      phase:range(0, tau), angle:range(-1, 1), tempo:range(.034, .065)});
  }
  return bubbles;
}

export function validBubbleScene(scene) {
  return Array.isArray(scene) && scene.length === sizes.length && scene.every(b =>
    b && ["x","y","vx","vy","dx","dy","turn","phase","angle","tempo"].every(key => Number.isFinite(b[key])) &&
    b.x >= 0 && b.x <= 1 && b.y >= 0 && b.y <= 1 && b.turn >= 0 && b.turn <= 65 &&
    b.tempo >= .03 && b.tempo <= .07 && [b.vx,b.vy,b.dx,b.dy].every(v => Math.abs(v) <= .01));
}

function advanceAxis(position, velocity, desired, dt, extent) {
  // Gently turn back at the viewport boundary. There is no fixed centre or orbit.
  const margin = Math.min(.13, .08 / extent);
  const towardInside = position < margin ? 1 : position > 1-margin ? -1 : 0;
  if (towardInside && desired * towardInside < 0) desired *= -1;
  velocity += (desired - velocity) * -Math.expm1(-dt / 3.8);
  return [clamp(position + velocity * dt / extent), velocity, desired];
}

export function driftBubbles(bubbles, dt, aspect) {
  for (const b of bubbles) {
    b.turn -= dt;
    if (b.turn <= 0) {
      [b.dx, b.dy] = direction();
      b.turn = range(16, 60);
    }
    [b.x, b.vx, b.dx] = advanceAxis(b.x, b.vx, b.dx, dt, Math.max(1,aspect));
    [b.y, b.vy, b.dy] = advanceAxis(b.y, b.vy, b.dy, dt, Math.max(1,1/aspect));
    b.phase = (b.phase + dt * b.tempo) % (tau * 20);
  }
}

const segments = 40;
// A periodic cubic spline keeps the silhouette and its tangent continuous at every scale.
function outline(b) {
  const points = [];
  const pear = .115 * Math.sin(b.phase);
  const trefoil = .073 * Math.cos(.65*b.phase + b.angle);
  const square = .047 * Math.sin(1.1*b.phase - b.angle);
  for (let i = 0; i < segments; i++) {
    const a = tau*i/segments;
    const r = 1 + pear*Math.cos(2*a-.55) + trefoil*Math.sin(3*a+b.angle) + square*Math.cos(4*a+.3);
    points.push([r*Math.cos(a), r*Math.sin(a)]);
  }
  const path = new Path2D();
  path.moveTo(...points[0]);
  for (let i = 0; i < segments; i++) {
    const a = points[(i+segments-1)%segments], b = points[i];
    const c = points[(i+1)%segments], d = points[(i+2)%segments];
    path.bezierCurveTo(b[0]+(c[0]-a[0])/6, b[1]+(c[1]-a[1])/6,
      c[0]-(d[0]-b[0])/6, c[1]-(d[1]-b[1])/6, ...c);
  }
  path.closePath();
  return path;
}

function wash(ctx, x, y, rx, ry, angle, stops) {
  ctx.save();
  ctx.translate(x,y);
  ctx.rotate(angle);
  ctx.scale(rx,ry);
  const gradient = ctx.createRadialGradient(0,0,0, 0,0,1);
  for (const [position, colour] of stops) gradient.addColorStop(position,colour);
  ctx.fillStyle = gradient;
  ctx.fillRect(-1,-1,2,2);
  ctx.restore();
}

// Cache soft reflections once per colourway. Only the vector edge, pose and crop
// change on a frame, even at 4K. Smaller bubbles see a different face of the light.
const materials = new WeakMap();
const glows = new WeakMap();
function material(ink, index) {
  if (!materials.has(ink)) materials.set(ink, []);
  const textures = materials.get(ink);
  if (textures[index]) return textures[index];
  const surface = document.createElement("canvas");
  surface.width = surface.height = [640,384,224,128][index];
  const ctx = surface.getContext("2d", {alpha:false});
  const unit = surface.width / 3;
  ctx.setTransform(unit, 0, 0, unit, surface.width/2, surface.height/2);
  const flip = index % 2 ? -1 : 1;
  ctx.scale(flip,1);
  const body = ctx.createLinearGradient(-.65,-1, .65,1);
  for (const [position, colour] of [[0,ink.pearl],[.18,ink.bloom],[.43,ink.violet],[.78,ink.deep],[1,ink.violet]]) {
    body.addColorStop(position,colour);
  }
  ctx.fillStyle = body;
  ctx.fillRect(-1.5,-1.5,3,3);
  wash(ctx,-.33,-.4,1.18,1.02,-.5,[[0,ink.pearl+"ed"],[.42,ink.bloom+"bc"],[1,ink.bloom+"00"]]);
  wash(ctx,.7,-.03,1.12,.61,-1.06,[[0,ink.flash+"ce"],[.5,ink.violet+"85"],[1,ink.violet+"00"]]);
  wash(ctx,-.64,.55,.9,.63,-.6,[[0,ink.violet+"ea"],[.58,ink.deep+"8a"],[1,ink.deep+"00"]]);
  wash(ctx,-.12,-.93,1.06,.43,-.27,[[0,ink.pearl],[.5,ink.pearl+"8a"],[1,ink.pearl+"00"]]);
  // Light refracted back into the lower shell, with a faint chromatic fringe.
  wash(ctx,-.12,-.23,1.15,1.24,-.49,[[0,ink.flash+"00"],[.66,ink.flash+"00"],
    [.80,ink.flash+"45"],[.87,ink.pearl+"94"],[.895,ink.bloom+"7d"],[.94,ink.flash+"28"],[1,ink.flash+"00"]]);
  textures[index] = surface;
  return surface;
}

function paintBubble(ctx, bubble, x, y, radius, ink, index) {
  ctx.save();
  ctx.translate(x,y);
  ctx.scale(radius,radius);
  ctx.rotate(.32 * bubble.angle + .13 * Math.sin(bubble.phase));
  const shell = outline(bubble);
  ctx.clip(shell);
  ctx.save();
  ctx.rotate(.29 * Math.sin(bubble.phase + index) + .25 * index);
  const offset = .085 * Math.sin(bubble.phase);
  ctx.drawImage(material(ink,index), -1.5+offset, -1.5, 3, 3);
  ctx.restore();
  const edge = ctx.createLinearGradient(-.86,-.72,.78,.91);
  edge.addColorStop(0,ink.pearl+"cf");
  edge.addColorStop(.32,ink.bloom+"1c");
  edge.addColorStop(.62,ink.flash+"0a");
  edge.addColorStop(1,ink.flash+"bf");
  ctx.strokeStyle = edge;
  ctx.lineWidth = .012;
  ctx.stroke(shell);
  ctx.restore();
}

// Use the same antialiased vector drawing on touch, desktop and software-rendered devices.
export function sizeBubbleCanvas(canvas, width, height) {
  if (!width || !height) return false;
  const scale = Math.min(window.devicePixelRatio || 1, Math.sqrt(3840*2160 / (width*height)), 8192/Math.max(width,height));
  const w = Math.max(1,Math.floor(width*scale)), h = Math.max(1,Math.floor(height*scale));
  if (w !== canvas.width || h !== canvas.height) { canvas.width = w; canvas.height = h; }
  return true;
}

export function drawBubbles(ctx, bubbles, colour, shade = 0) {
  const {width, height} = ctx.canvas;
  const ink = minerals[colour], short = Math.min(width,height);
  ctx.fillStyle = ink.base;
  ctx.fillRect(0,0,width,height);
  const main = bubbles[0];
  if (!glows.has(ink)) {
    const glow = document.createElement("canvas");
    glow.width = glow.height = 192;
    wash(glow.getContext("2d"),96,96,96,96,0,[[0,ink.atmosphere],[.43,ink.atmosphere+"a0"],[1,ink.atmosphere+"00"]]);
    glows.set(ink,glow);
  }
  ctx.drawImage(glows.get(ink), main.x*width-short*.81, main.y*height-short*.70, short*1.62, short*1.40);
  // Foreground bubbles occlude distant ones naturally as they pass.
  for (let i = bubbles.length-1; i >= 0; i--) {
    const b = bubbles[i];
    paintBubble(ctx,b,b.x*width,b.y*height,short*sizes[i],ink,i);
  }
  if (shade) {
    ctx.globalAlpha = shade;
    ctx.fillStyle = ink.base;
    ctx.fillRect(0, 0, width, height);
    ctx.globalAlpha = 1;
  }
}
