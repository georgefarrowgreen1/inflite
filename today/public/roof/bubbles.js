import {minerals} from "./bubble-colours.js";
export {bubbleColours, minerals, defaultBubbleColour} from "./bubble-colours.js";
import {outlineSegments, stepSurface, rippleSurface, settleSurface, surfaceIsMoving, paintSurface} from "./bubble-surface.js";

// Positions are fractions of the viewport. Sizes and speeds are fractions of its short edge.
const sizes = [.30, .165, .082, .037];
const tau = Math.PI * 2;
const maxSpeed = .36;
const maxSpin = 2.4;
const range = (low, high) => low + Math.random() * (high - low);
const clamp = value => Math.max(0, Math.min(1, value));

// Cached About and Contact entry modules still import this named export.
export const respondingBubbles = bubbles => bubbles.some(surfaceIsMoving);

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
    [b.dx,b.dy].every(v => Math.abs(v) <= .011) && Math.hypot(b.vx,b.vy) <= maxSpeed+.00001 &&
    (b.spin === undefined || (Number.isFinite(b.spin) && Math.abs(b.spin) <= maxSpin)) &&
    [b.strainX,b.strainY].every(v => v === undefined || (Number.isFinite(v) && Math.abs(v) <= .091)));
}

// The same outline is used for drawing, hit testing and contact distances.
// Strain is expressed in screen axes, so a sideways tap squeezes horizontally.
const pose = b => .32 * b.angle + .13 * Math.sin(b.phase);
function profile(b, angle) {
  const a = angle - pose(b);
  return 1 + .072*Math.sin(b.phase)*Math.cos(2*a-.55)
    + .048*Math.cos(.65*b.phase+b.angle)*Math.sin(3*a+b.angle)
    + .031*Math.sin(1.1*b.phase-b.angle)*Math.cos(4*a+.3)
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
  const acceleration = Math.min(.018, overlap*.18 + Math.max(0,-inward)*.85)
    + 30*Math.max(0,-inward-.018);
  b.vx += nx*acceleration*dt;
  b.vy += ny*acceleration*dt;
  const steering = Math.min(0, b.dx*nx + b.dy*ny);
  b.dx -= 1.8*steering*nx;
  b.dy -= 1.8*steering*ny;
  squeeze(b,nx,ny,Math.min(.12,overlap/radius)*dt);
}

const touching = new WeakMap();
function contact(a, b, i, j, width, height, dt) {
  const x = (b.x-a.x)*width, y = (b.y-a.y)*height;
  const distance = Math.hypot(x,y);
  const radii = sizes[i]+sizes[j];
  let neighbours = touching.get(a);
  if (distance > 1.35*radii) { neighbours?.delete(b); return; }
  // Coincident centres can occur after a resize or restoring an earlier scene.
  const angle = distance > .00001 ? Math.atan2(y,x) : a.angle + j;
  const nx = Math.cos(angle), ny = Math.sin(angle);
  const rimA = profile(a,angle), rimB = profile(b,angle+Math.PI);
  const overlap = sizes[i]*rimA + sizes[j]*rimB - distance;
  if (overlap <= 0) {
    if (overlap < -.012*radii) neighbours?.delete(b);
    return;
  }
  const closing = Math.min(0,(b.vx-a.vx)*nx + (b.vy-a.vy)*ny);
  // Transfer the extra closing speed of a flick before the small orb can
  // pass through its neighbour. Ambient drift still yields gradually.
  const push = Math.min(.024, overlap*.24 - closing*.95)*dt + Math.max(0,-closing-.018)*-Math.expm1(-dt/.035);
  const massA = sizes[i]**2, shareA = sizes[j]**2/(massA+sizes[j]**2);
  const shareB = 1-shareA;
  if (closing < -.0008 && dt > 0 && !neighbours?.has(b)) {
    if (!neighbours) { neighbours = new WeakSet(); touching.set(a,neighbours); }
    neighbours.add(b);
    const wave = Math.min(.014,.002-.065*closing);
    // Just inside each visible lip, on opposite sides of the same contact.
    rippleSurface(a,.89*rimA*nx,.89*rimA*ny,wave*(.55+.45*shareA));
    rippleSurface(b,-.89*rimB*nx,-.89*rimB*ny,wave*(.55+.45*shareB));
    const dent = Math.min(.045,-closing*.15);
    squeeze(a,nx,ny,dent*(.3+shareA));
    squeeze(b,nx,ny,dent*(.3+shareB));
  }
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

const tapStrains = new WeakMap();
const strokes = new WeakMap();
const gliding = b => Math.hypot(b.vx-b.dx,b.vy-b.dy) > .018 || Math.abs(b.spin || 0) > .045;

function applyFlick(bubbles, pointer, width, height) {
  if (!pointer?.stroke) { strokes.delete(bubbles); return; }
  let stroke = strokes.get(bubbles);
  if (stroke?.id !== pointer.stroke) {
    const origin = {x:pointer.originX,y:pointer.originY,strength:1};
    stroke = {id:pointer.stroke, hit:pickBubble(bubbles,origin,width,height)};
    strokes.set(bubbles,stroke);
  }
  if (!pointer.release) return;
  strokes.delete(bubbles);
  const hit = stroke.hit;
  if (!hit || hit.distance > 1) return;
  const vx = pointer.flickX || 0, vy = pointer.flickY || 0;
  const speed = Math.hypot(vx,vy);
  if (!Number.isFinite(speed) || speed < .10) return;
  const b = bubbles[hit.index], radius = sizes[hit.index];
  const gain = Math.min(.35,maxSpeed/speed)/(1+1.8*radius);
  b.vx += vx*gain;
  b.vy += vy*gain;
  const torque = (hit.x*vy-hit.y*vx)*1.7/(1+3*radius);
  b.spin = Math.max(-maxSpin,Math.min(maxSpin,(b.spin || 0)+torque));
}

export function driftBubbles(bubbles, dt, aspect, pointer = null) {
  const width = Math.max(1,aspect), height = Math.max(1,1/aspect);
  const hit = pickBubble(bubbles,pointer,width,height);
  applyFlick(bubbles,pointer,width,height);
  dt = Math.min(.16,Math.max(0,dt));
  for (let i = 0; i < bubbles.length; i++) {
    stepSurface(bubbles[i],dt,hit?.index === i ? hit : null,pointer);
  }
  // Bound contact integration when an idle frame or a busy main thread precedes
  // a flick. Input impulses and the membrane are sampled just once per frame.
  const steps = Math.max(1,Math.ceil(dt*120-.000001));
  for (let n=0; n<steps; n++) advanceBodies(bubbles,dt/steps,width,height,hit,pointer,n===0);
  return hit;
}

function advanceBodies(bubbles, dt, width, height, hit, pointer, first) {
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
    const excess = Math.hypot(b.vx-b.dx,b.vy-b.dy);
    const glide = clamp((excess-.02)/.05);
    const decay = (1-glide)*(2.1+sizes[i]*8) + glide*(.40+.45*sizes[i]);
    const ease = -Math.expm1(-dt/decay);
    b.vx += (b.dx-b.vx)*ease;
    b.vy += (b.dy-b.vy)*ease;
    if (b.spin) {
      const drag = -Math.expm1(-dt/.54);
      b.angle += b.spin*.54*drag;
      b.spin *= 1-drag;
      if (Math.abs(b.spin) < .001) b.spin = 0;
    }
    if (hit?.index === i) {
      const angle = hit.distance < .035 ? Math.atan2(b.vy,b.vx) : Math.atan2(-hit.y,-hit.x);
      const nx = Math.cos(angle), ny = Math.sin(angle);
      const tap = first && pointer.tap && hit.distance <= 1;
      const impulse = tap ? .027/(1+3*sizes[i]) : .0013*dt*hit.amount;
      b.vx += nx*impulse; b.vy += ny*impulse;
      if (tap) tapStrains.set(b,{nx,ny,remaining:.086});
    }

    const strain = tapStrains.get(b);
    if (strain) {
      const applied = strain.remaining * -Math.expm1(-dt/.022);
      squeeze(b,strain.nx,strain.ny,applied);
      strain.remaining -= applied;
      if (strain.remaining < .0001) tapStrains.delete(b);
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
    const speed = Math.max(1, Math.hypot(b.vx,b.vy)/maxSpeed);
    b.vx /= speed; b.vy /= speed;
    const steer = Math.max(1, Math.hypot(b.dx,b.dy)/.008);
    b.dx /= steer; b.dy /= steer;
    b.x = clamp(b.x + b.vx*dt/width);
    b.y = clamp(b.y + b.vy*dt/height);
    b.phase = (b.phase + dt*b.tempo) % (tau*20);
  }
}

const segments = outlineSegments;
// A periodic cubic spline keeps the silhouette and its tangent continuous at every scale.
function outline(b, rim) {
  const points = [];
  for (let i = 0; i < segments; i++) {
    const a = tau*i/segments;
    const r = rim[i] = profile(b,a);
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

const glows = new WeakMap();
// The grain is fixed to each surface and stays fine when the interior is magnified.
let grainTile;
const grainPatterns = new WeakMap();
function applyGrain(ctx,index,radius) {
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
      image.data[i+3] = Math.round(Math.abs(difference)*.043);
    }
    tile.putImageData(image,0,0);
  }
  ctx.save();
  const density = Math.max(1,devicePixelRatio*.61);
  ctx.scale(density/radius,density/radius);
  ctx.translate(index*31,index*17);
  if (!grainPatterns.has(ctx)) grainPatterns.set(ctx,ctx.createPattern(grainTile,"repeat"));
  ctx.fillStyle = grainPatterns.get(ctx);
  const reach = 1.33*radius/density;
  ctx.fillRect(-reach-index*31,-reach-index*17,reach*2,reach*2);
  ctx.restore();
}

const rim = new Float32Array(segments);
function paintBubble(ctx, bubble, x, y, radius, ink, index, live, detail) {
  ctx.save();
  ctx.translate(x,y);
  ctx.scale(radius,radius);
  ctx.clip(outline(bubble,rim));
  paintSurface(ctx,bubble,radius,rim,ink,index,live,detail);
  applyGrain(ctx,index,radius);
  ctx.restore();
}

// Use the same antialiased vector drawing on touch, desktop and software-rendered devices.
export function sizeBubbleCanvas(canvas, width, height) {
  if (!width || !height) return false;
  // The glass and the spline edges sample this backing store throughout a gesture.
  const scale = Math.min(window.devicePixelRatio || 1, Math.sqrt(3840*2160/(width*height)), 8192/Math.max(width,height));
  const w = Math.max(1,Math.floor(width*scale)), h = Math.max(1,Math.floor(height*scale));
  if (w !== canvas.width || h !== canvas.height) { canvas.width = w; canvas.height = h; }
  return true;
}

function paintSky(ctx, ground, main, width, height, short) {
  ctx.fillStyle = ground.base;
  ctx.fillRect(0,0,width,height);
  if (!glows.has(ground)) {
    const glow = document.createElement("canvas");
    glow.width = glow.height = 192;
    wash(glow.getContext("2d"),96,96,96,96,0,[[0,ground.atmosphere],[.43,ground.atmosphere+"a0"],[1,ground.atmosphere+"00"]]);
    glows.set(ground,glow);
  }
  ctx.drawImage(glows.get(ground), main.x*width-short*.81, main.y*height-short*.70, short*1.62, short*1.40);
}

const scenes = new WeakMap();
function cover(a,b) {
  return {left:Math.min(a.left,b.left), top:Math.min(a.top,b.top),
    right:Math.max(a.right,b.right), bottom:Math.max(a.bottom,b.bottom)};
}

function intersects(a,b) {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

// Keep the display and lens at their resting resolution. Only the smooth
// interior lighting changes sampling density if several paints exceed budget.
function adjustSurfaceDetail(scene, milliseconds) {
  scene.slow = milliseconds > 7 ? scene.slow+1 : 0;
  scene.fast = milliseconds < 3 ? scene.fast+1 : 0;
  if (scene.slow >= 3 && scene.detail > 2) {
    scene.detail--;
    scene.slow = 0;
  } else if (scene.fast >= 45 && scene.detail < 6) {
    scene.detail++;
    scene.fast = 0;
  }
}

export function drawBubbles(ctx, bubbles, colour, shade = 0, live = true, light = false, damage) {
  const {width,height} = ctx.canvas, short = Math.min(width,height);
  const ink = minerals[colour], ground = light ? ink.light : ink;
  const main = bubbles[0];
  let scene = scenes.get(ctx);
  if (!scene || scene.width !== width || scene.height !== height || scene.ground !== ground || scene.shade !== shade) {
    scene = {width,height,ground,shade,previous:[],detail:6,slow:0,fast:0};
    scenes.set(ctx,scene);
  }
  const bodies = bubbles.map((b,index) => {
    if (!live) settleSurface(b);
    const radius = short*sizes[index], extent = Math.ceil(radius*1.3)+2;
    const x = b.x*width, y = b.y*height;
    const bounds = {left:Math.max(0,Math.floor(x-extent)), top:Math.max(0,Math.floor(y-extent)),
      right:Math.min(width,Math.ceil(x+extent)), bottom:Math.min(height,Math.ceil(y+extent))};
    const previous = scene.previous[index];
    return {b,x,y,radius,bounds,active:live && (surfaceIsMoving(b) || gliding(b)),
      area:previous ? cover(bounds,previous.bounds) : bounds};
  });
  const moving = bodies.some(p => p.active);
  const start = moving ? performance.now() : 0;
  const full = !moving || bodies.length !== scene.previous.length || bodies.some((p,i) => scene.previous[i]?.b !== p.b) ||
    Math.abs(main.phase-scene.phase) >= main.tempo/20;
  const areas = [];
  if (damage) damage.length = 0; // Empty denotes a full paint.
  if (full) {
    scene.phase = main.phase;
    scene.glow = {x:main.x,y:main.y};
  } else {
    for (let i=0; i<bodies.length; i++) {
      const p = bodies[i];
      if (p.active || scene.previous[i].active) areas.push(p.area);
    }
    // Include the full old and new bounds of any crossing body before the
    // redraw. This preserves painter order without full-screen backing layers.
    for (let count = -1; count !== areas.length;) {
      count = areas.length;
      for (const p of bodies) {
        if (!areas.includes(p.area) && areas.some(a => intersects(a,p.area))) areas.push(p.area);
      }
    }
    ctx.save();
    ctx.beginPath();
    for (const area of areas) {
      ctx.rect(area.left,area.top,area.right-area.left,area.bottom-area.top);
      if (damage) damage.push({left:area.left/width,top:area.top/height,right:area.right/width,bottom:area.bottom/height});
    }
    ctx.clip();
  }
  paintSky(ctx,ground,scene.glow,width,height,short);
  for (let i=bodies.length-1; i>=0; i--) {
    const p = bodies[i];
    if (!full && !areas.includes(p.area)) continue;
    paintBubble(ctx,p.b,p.x,p.y,p.radius,ink,i,live,p.active ? scene.detail : 6);
    scene.previous[i] = {b:p.b,bounds:p.bounds,active:p.active};
  }
  scene.previous.length = bodies.length;
  if (shade) {
    ctx.globalAlpha = shade;
    ctx.fillStyle = ground.base;
    ctx.fillRect(0,0,width,height);
    ctx.globalAlpha = 1;
  }
  if (!full) ctx.restore();
  if (moving) adjustSurfaceDetail(scene,performance.now()-start);
  return moving;
}
