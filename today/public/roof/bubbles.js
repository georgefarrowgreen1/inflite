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
export function newBubbleScene(aspect = 1, opening) {
  const bubbles = [];
  for (const radius of sizes) {
    const candidate = !bubbles.length && opening
      ? () => [range(...opening.x), range(...opening.y)]
      : () => [range(.09, .91), range(.09, .91)];
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
    b.tempo >= .03 && b.tempo <= .07 &&
    [b.dx,b.dy].every(v => Math.abs(v) <= .011) && Math.hypot(b.vx,b.vy) <= .041 &&
    [b.strainX,b.strainY].every(v => v === undefined || (Number.isFinite(v) && Math.abs(v) <= .091)));
}

// The same outline is used for drawing, hit testing and contact distances.
// Strain is expressed in screen axes, so a sideways tap squeezes horizontally.
const pose = b => .32 * b.angle + .13 * Math.sin(b.phase);
function profile(b, angle) {
  const a = angle - pose(b);
  return 1 + .105*Math.sin(b.phase)*Math.cos(2*a-.55)
    + .066*Math.cos(.65*b.phase+b.angle)*Math.sin(3*a+b.angle)
    + .04*Math.sin(1.1*b.phase-b.angle)*Math.cos(4*a+.3)
    - (b.strainX || 0)*Math.cos(2*angle) - (b.strainY || 0)*Math.sin(2*angle);
}

function squeeze(b, nx, ny, amount) {
  const x = (b.strainX || 0) + amount*(nx*nx-ny*ny);
  const y = (b.strainY || 0) + amount*2*nx*ny;
  const limit = Math.max(1, Math.hypot(x,y)/.09);
  b.strainX = x/limit;
  b.strainY = y/limit;
}

function wall(b, radius, distance, nx, ny, dt) {
  const overlap = .94*radius - distance;
  if (overlap <= 0) return;
  const inward = b.vx*nx + b.vy*ny;
  const acceleration = Math.min(.018, overlap*.18 + Math.max(0,-inward)*.85);
  b.vx += nx*acceleration*dt;
  b.vy += ny*acceleration*dt;
  const steering = Math.min(0, b.dx*nx + b.dy*ny);
  b.dx -= 1.8*steering*nx;
  b.dy -= 1.8*steering*ny;
  squeeze(b,nx,ny,Math.min(.12,overlap/radius)*dt);
}

function contact(a, b, i, j, width, height, dt) {
  const x = (b.x-a.x)*width, y = (b.y-a.y)*height;
  const distance = Math.hypot(x,y);
  if (distance > 1.35*(sizes[i]+sizes[j])) return;
  // Coincident centres can occur after a resize or restoring an earlier scene.
  const angle = distance > .00001 ? Math.atan2(y,x) : a.angle + j;
  const nx = Math.cos(angle), ny = Math.sin(angle);
  const overlap = sizes[i]*profile(a,angle) + sizes[j]*profile(b,angle+Math.PI) - distance;
  if (overlap <= 0) return;
  const closing = Math.min(0,(b.vx-a.vx)*nx + (b.vy-a.vy)*ny);
  const push = Math.min(.024, overlap*.24 - closing*.95)*dt;
  const massA = sizes[i]**2, shareA = sizes[j]**2/(massA+sizes[j]**2);
  const shareB = 1-shareA;
  a.vx -= nx*push*shareA; a.vy -= ny*push*shareA;
  b.vx += nx*push*shareB; b.vy += ny*push*shareB;
  // Turn the underlying drift apart too, so a pair can leave contact.
  const steer = -1.65*Math.min(0,(b.dx-a.dx)*nx + (b.dy-a.dy)*ny);
  a.dx -= nx*steer*shareA; a.dy -= ny*steer*shareA;
  b.dx += nx*steer*shareB; b.dy += ny*steer*shareB;
  const pressure = Math.min(.18, overlap/(sizes[i]+sizes[j]) - closing) * dt;
  squeeze(a,nx,ny,pressure*(.3+shareA));
  squeeze(b,nx,ny,pressure*(.3+shareB));
}

function pickBubble(bubbles, pointer, width, height) {
  if (!pointer) return null;
  let nearest = null;
  for (let i = 0; i < bubbles.length; i++) {
    const b = bubbles[i];
    const x = (pointer.x-b.x)*width, y = (pointer.y-b.y)*height;
    const angle = Math.atan2(y,x);
    const distance = Math.hypot(x,y) / (sizes[i]*profile(b,angle));
    if (distance > 1.35 || (nearest && distance >= nearest.distance)) continue;
    nearest = {index:i, distance, x:x/sizes[i], y:y/sizes[i], amount:pointer.strength * clamp((1.35-distance)/.45)};
    if (distance <= 1) break; // Frontmost visible surface.
  }
  return nearest;
}

export function driftBubbles(bubbles, dt, aspect, pointer = null) {
  const width = Math.max(1,aspect), height = Math.max(1,1/aspect);
  const hit = pickBubble(bubbles,pointer,width,height);
  const recover = Math.exp(-dt*1.7);
  for (let i = 0; i < bubbles.length; i++) {
    const b = bubbles[i];
    b.strainX = (b.strainX || 0)*recover;
    b.strainY = (b.strainY || 0)*recover;
    b.turn -= dt;
    if (b.turn <= 0) {
      [b.dx, b.dy] = direction();
      b.turn = range(16, 60);
    }
    const ease = -Math.expm1(-dt / (2.1 + sizes[i]*8));
    b.vx += (b.dx-b.vx)*ease;
    b.vy += (b.dy-b.vy)*ease;
    if (hit?.index === i) {
      const angle = hit.distance < .035 ? Math.atan2(b.vy,b.vx) : Math.atan2(-hit.y,-hit.x);
      const nx = Math.cos(angle), ny = Math.sin(angle);
      const tap = pointer.tap && hit.distance <= 1;
      const impulse = tap ? .027/(1+3*sizes[i]) : .0013*dt*hit.amount;
      b.vx += nx*impulse; b.vy += ny*impulse;
      if (tap) squeeze(b,nx,ny,.082);
    }

    wall(b,sizes[i]*profile(b,Math.PI),b.x*width,1,0,dt);
    wall(b,sizes[i]*profile(b,0),(1-b.x)*width,-1,0,dt);
    wall(b,sizes[i]*profile(b,-Math.PI/2),b.y*height,0,1,dt);
    wall(b,sizes[i]*profile(b,Math.PI/2),(1-b.y)*height,0,-1,dt);
  }
  for (let i = 0; i < bubbles.length; i++) {
    for (let j = i+1; j < bubbles.length; j++) contact(bubbles[i],bubbles[j],i,j,width,height,dt);
  }
  for (const b of bubbles) {
    const speed = Math.max(1, Math.hypot(b.vx,b.vy)/.04);
    b.vx /= speed; b.vy /= speed;
    const steer = Math.max(1, Math.hypot(b.dx,b.dy)/.008);
    b.dx /= steer; b.dy /= steer;
    b.x = clamp(b.x + b.vx*dt/width);
    b.y = clamp(b.y + b.vy*dt/height);
    b.phase = (b.phase + dt*b.tempo) % (tau*20);
  }
  return hit;
}

const segments = 40;
// A periodic cubic spline keeps the silhouette and its tangent continuous at every scale.
function outline(b) {
  const points = [];
  for (let i = 0; i < segments; i++) {
    const a = tau*i/segments;
    const r = profile(b,a);
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
// Bake a repeatable, low-contrast grain into the material so the surface carries
// its own texture through a turn. The backdrop and UI receive no noise.
let grainTile;
function applyGrain(ctx, index) {
  if (!grainTile) {
    grainTile = document.createElement("canvas");
    grainTile.width = grainTile.height = 192;
    const tile = grainTile.getContext("2d");
    const image = tile.createImageData(192,192);
    let seed = 727;
    for (let i = 0; i < image.data.length; i += 4) {
      seed = (Math.imul(seed,1664525) + 1013904223) >>> 0;
      const difference = (seed >>> 24) - ((seed >>> 12) & 255);
      const light = difference > 0 ? 255 : 0;
      image.data[i] = image.data[i+1] = image.data[i+2] = light;
      image.data[i+3] = Math.round(Math.abs(difference)*.082);
    }
    tile.putImageData(image,0,0);
  }
  ctx.save();
  ctx.setTransform(1,0,0,1,index*31,index*17);
  ctx.fillStyle = ctx.createPattern(grainTile,"repeat");
  ctx.fillRect(-index*31,-index*17,ctx.canvas.width,ctx.canvas.height);
  ctx.restore();
}

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
    [.78,ink.flash+"36"],[.862,ink.pearl+"78"],[.90,ink.bloom+"69"],[.965,ink.flash+"1f"],[1,ink.flash+"00"]]);
  applyGrain(ctx,index);
  textures[index] = surface;
  return surface;
}

function paintBubble(ctx, bubble, x, y, radius, ink, index, highlight) {
  ctx.save();
  ctx.translate(x,y);
  ctx.scale(radius,radius);
  const shell = outline(bubble);
  ctx.clip(shell);
  ctx.save();
  ctx.rotate(pose(bubble) + .29 * Math.sin(bubble.phase + index) + .25 * index);
  const offset = .085 * Math.sin(bubble.phase);
  ctx.drawImage(material(ink,index), -1.5+offset, -1.5, 3, 3);
  ctx.restore();
  if (highlight) {
    ctx.save();
    ctx.globalAlpha = highlight.amount;
    wash(ctx,highlight.x*.60,highlight.y*.60,.63,.48,-.45,
      [[0,ink.pearl+"53"],[.48,ink.flash+"1a"],[1,ink.flash+"00"]]);
    ctx.restore();
  }
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

export function drawBubbles(ctx, bubbles, colour, shade = 0, highlight = null) {
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
  // Paint back to front, matching the order used by hit tests.
  for (let i = bubbles.length-1; i >= 0; i--) {
    const b = bubbles[i];
    paintBubble(ctx,b,b.x*width,b.y*height,short*sizes[i],ink,i,highlight?.index === i ? highlight : null);
  }
  if (shade) {
    ctx.globalAlpha = shade;
    ctx.fillStyle = ink.base;
    ctx.fillRect(0, 0, width, height);
    ctx.globalAlpha = 1;
  }
}
