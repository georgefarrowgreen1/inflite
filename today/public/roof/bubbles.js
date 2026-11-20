import {minerals} from "./bubble-colours.js";
export {bubbleColours, minerals, defaultBubbleColour} from "./bubble-colours.js";
import {outlineSegments, stepSurface, rippleSurface, settleSurface, surfaceIsMoving, paintSurface, rimColourAt} from "./bubble-surface.js";

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
function baseProfile(b, angle) {
  const a = angle - pose(b);
  return 1 + .072*Math.sin(b.phase)*Math.cos(2*a-.55)
    + .048*Math.cos(.65*b.phase+b.angle)*Math.sin(3*a+b.angle)
    + .031*Math.sin(1.1*b.phase-b.angle)*Math.cos(4*a+.3)
    - (b.strainX || 0)*Math.cos(2*angle) - (b.strainY || 0)*Math.sin(2*angle);
}

// Contact pressure is local to the facing arc. These short-lived springs
// belong to this simulation, so a saved scene carries no stale impressions.
const dents = new WeakMap();
function dentContact(b, neighbour, angle, load, radiusRatio, compression) {
  let patches = dents.get(b);
  let patch = patches?.find(p => p.neighbour === neighbour);
  if (load > 0) {
    const span = Math.sqrt(radiusRatio/(1+radiusRatio));
    if (!patch) {
      if (!patches) { patches = []; dents.set(b,patches); }
      patch = {neighbour,angle,width:.27+.32*span,depth:0,speed:0};
      patches.push(patch);
    }
    const peak = (.046+.12*span)*load/(.37+.63*load);
    patch.speed = Math.min(3.8,Math.max(0,patch.speed)+32*Math.max(0,peak-patch.depth));
    patches.moving = true;
  }
  if (patch) {
    patch.pressure = Math.min(.12,.48*compression);
    patch.targetAngle = angle;
  }
}

function angleGap(angle,centre) {
  const gap = angle-centre;
  return gap-tau*Math.round(gap/tau);
}

function advanceDents(b,dt) {
  const patches = dents.get(b);
  if (!patches) return;
  patches.moving = false;
  for (let i=patches.length-1; i>=0; i--) {
    const p = patches[i], turn = angleGap(p.targetAngle,p.angle);
    p.angle += turn * -Math.expm1(-dt/.035);
    p.speed += (310*(p.pressure-p.depth)-24*p.speed)*dt;
    p.depth += p.speed*dt;
    if (!p.pressure && Math.abs(p.depth)<.00035 && Math.abs(p.speed)<.004) patches.splice(i,1);
    else if (Math.abs(p.speed)>.004 || Math.abs(p.depth-p.pressure)>.00035 || Math.abs(turn)>.002) patches.moving = true;
    p.pressure = 0;
  }
  if (!patches.length) dents.delete(b);
}

function patchOffset(p,angle) {
  const x = angleGap(angle,p.angle)/p.width, x2 = x*x;
  if (x2 >= 2.3**2) return 0;
  // Matching integrals return the displaced rim to two smooth shoulders.
  const lip = 1-x2/(2.3**2), centre = Math.max(0,1-x2);
  return p.depth*(lip**3-2.3*centre**3)/1.3;
}

function dentOffset(patches,angle) {
  let offset = 0;
  for (const p of patches) offset += patchOffset(p,angle);
  return Math.max(-.22,Math.min(.055,offset));
}

function profile(b,angle) {
  const patches = dents.get(b);
  return baseProfile(b,angle) + (patches ? dentOffset(patches,angle) : 0);
}

// Compression lets the two skins travel together while their centres of mass
// rebound. Share the lost facing radius inversely by mass, around the same
// barycentre as the impulse. The offsets disappear with the recovering skin.
function contactOffsets(bubbles,width,height) {
  let shifts;
  for (let i=0; i<bubbles.length; i++) {
    const a = bubbles[i], patches = dents.get(a);
    if (!patches) continue;
    for (const patch of patches) {
      const j = patch.neighbour, b = bubbles[j];
      if (!b) continue;
      const x = (b.x-a.x)*width, y = (b.y-a.y)*height, distance = Math.hypot(x,y);
      if (distance < .00001) continue;
      const angle = Math.atan2(y,x), depth = -sizes[i]*patchOffset(patch,angle);
      if (depth <= 0) continue;
      const gap = distance-sizes[i]*baseProfile(a,angle)-sizes[j]*baseProfile(b,angle+Math.PI);
      const travel = depth*(1-fade(gap/(.45*Math.min(sizes[i],sizes[j]))))/distance;
      if (!travel) continue;
      shifts ??= bubbles.map(() => ({x:0,y:0}));
      const share = sizes[j]/(sizes[i]+sizes[j]);
      shifts[i].x += x*travel*share; shifts[i].y += y*travel*share;
      shifts[j].x -= x*travel*(1-share); shifts[j].y -= y*travel*(1-share);
    }
  }
  return shifts;
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
  const rimA = baseProfile(a,angle), rimB = baseProfile(b,angle+Math.PI);
  const overlap = sizes[i]*rimA + sizes[j]*rimB - distance;
  if (overlap <= 0) {
    if (overlap < -.012*radii) neighbours?.delete(b);
    return;
  }
  if (!dt) return;
  const relative = (b.vx-a.vx)*nx + (b.vy-a.vy)*ny;
  const closing = Math.max(0,-relative);
  const impact = closing > 0 && !neighbours?.has(b);
  // Treat each outline as a thin ring of equal linear density. Opposite
  // impulses conserve momentum and leave each tangential velocity intact.
  const shareA = sizes[j]/radii;
  const shareB = 1-shareA;
  const restitution = .62;
  const impulse = closing*(impact ? 1+restitution : 1);
  // An intersecting restored scene holds elastic compression even at rest.
  // Release it gently; separating bodies receive no extra kick at grazing contact.
  const spring = Math.min(.024,Math.max(0,.24*overlap-.85*Math.max(0,relative)))*dt;
  const push = Math.max(impulse,spring);
  const load = impact ? Math.sqrt(closing/(closing+.055)) : 0;
  if (impact) {
    if (!neighbours) { neighbours = new WeakSet(); touching.set(a,neighbours); }
    neighbours.add(b);
    const wave = .014*load**1.5;
    // Just inside each visible lip, on opposite sides of the same contact.
    rippleSurface(a,.89*rimA*nx,.89*rimA*ny,wave*(.55+.45*shareA));
    rippleSurface(b,-.89*rimB*nx,-.89*rimB*ny,wave*(.55+.45*shareB));
  }
  dentContact(a,j,angle,load,sizes[j]/sizes[i],overlap/sizes[i]);
  dentContact(b,i,angle+Math.PI,load,sizes[i]/sizes[j],overlap/sizes[j]);
  a.vx -= nx*push*shareA; a.vy -= ny*push*shareA;
  b.vx += nx*push*shareB; b.vy += ny*push*shareB;
  // Turn the underlying drift apart too, so a pair can leave contact.
  const steer = -(1+restitution)*Math.min(0,(b.dx-a.dx)*nx + (b.dy-a.dy)*ny);
  a.dx -= nx*steer*shareA; a.dy -= ny*steer*shareA;
  b.dx += nx*steer*shareB; b.dy += ny*steer*shareB;
  const pressure = Math.min(.18, overlap/radii + closing) * dt;
  squeeze(a,nx,ny,pressure*(.3+shareA));
  squeeze(b,nx,ny,pressure*(.3+shareB));
}

function pickBubble(bubbles, pointer, width, height) {
  if (!pointer) return null;
  let nearest = null;
  const shifts = contactOffsets(bubbles,width,height);
  for (let i = 0; i < bubbles.length; i++) {
    const b = bubbles[i];
    const x = (pointer.x-b.x)*width-(shifts?.[i].x || 0);
    const y = (pointer.y-b.y)*height-(shifts?.[i].y || 0);
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
    stepSurface(bubbles[i],dt,hit?.index === i ? hit : null,pointer,sizes[i]);
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
    advanceDents(b,dt);
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
const contactSegments = 3*segments;
const rimOffset = new Float32Array(contactSegments), rimSlope = new Float32Array(segments);
// A periodic cubic spline keeps the silhouette and its tangent continuous at every scale.
function outline(b, rim, patches) {
  const points = [], count = patches ? contactSegments : segments;
  for (let i = 0; i < count; i++) {
    const a = tau*i/count, offset = patches ? dentOffset(patches,a) : 0;
    const r = baseProfile(b,a)+offset;
    if (patches) {
      rimOffset[i] = offset;
      if (i%3 === 0) rim[i/3] = r;
    } else rim[i] = r;
    points.push([r*Math.cos(a), r*Math.sin(a)]);
  }
  const path = new Path2D();
  path.moveTo(...points[0]);
  for (let i = 0; i < count; i++) {
    const a = points[(i+count-1)%count], b = points[i];
    const c = points[(i+1)%count], d = points[(i+2)%count];
    path.bezierCurveTo(b[0]+(c[0]-a[0])/6, b[1]+(c[1]-a[1])/6,
      c[0]-(d[0]-b[0])/6, c[1]-(d[1]-b[1])/6, ...c);
    if (patches && i%3 === 0) {
      rimSlope[i/3] = (rimOffset[(i+1)%count]-rimOffset[(i+count-1)%count])*count/(2*tau);
    }
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

function fade(value) {
  const t = clamp(value);
  return t*t*(3-2*t);
}

function facingReflections(bodies, ink) {
  for (let i=0; i<bodies.length; i++) for (let j=i+1; j<bodies.length; j++) {
    const a = bodies[i], b = bodies[j];
    const dx = b.x-a.x, dy = b.y-a.y, distance = Math.hypot(dx,dy);
    const small = Math.min(a.radius,b.radius), reach = .45*small;
    if (!distance || distance > 1.25*(a.radius+b.radius)+reach) continue;
    const angle = Math.atan2(dy,dx), opposite = angle+Math.PI;
    const rimA = profile(a.b,angle), rimB = profile(b.b,opposite);
    const gap = distance-a.radius*rimA-b.radius*rimB;
    if (gap >= reach || gap <= -small) continue;
    // Fade in at proximity and out again if one silhouette hides the other.
    const visible = fade((gap+small)/(.70*small));
    const tint = visible*fade(1-gap/reach);
    const shade = visible*fade(1-gap/(.18*small));
    a.reflections.push({index:j,angle,rim:rimA,tint,shade,colour:rimColourAt(b.b,j,opposite,ink),
      span:Math.sqrt(b.radius/(a.radius+b.radius))});
    b.reflections.push({index:i,angle:opposite,rim:rimB,tint,shade,colour:rimColourAt(a.b,i,angle,ink),
      span:Math.sqrt(a.radius/(a.radius+b.radius))});
  }
}

function reflectNeighbours(ctx, reflections, ink) {
  const alpha = ctx.globalAlpha;
  for (const {angle,rim,tint,shade,span,colour} of reflections) {
    const x = rim*Math.cos(angle), y = rim*Math.sin(angle);
    const rgb = [colour&255,(colour>>8)&255,(colour>>16)&255].join(",");
    ctx.globalAlpha = alpha*tint*.24;
    wash(ctx,.88*x,.88*y,.11+.17*span,.19+.43*span,angle,
      [[0,`rgb(${rgb})`],[.43,`rgba(${rgb},.66)`],[1,`rgba(${rgb},0)`]]);
    if (shade > 0) {
      ctx.globalAlpha = alpha*shade*.14;
      wash(ctx,x,y,.07+.08*span,.13+.32*span,angle,
        [[0,ink.base],[.4,ink.base+"b0"],[1,ink.base+"00"]]);
    }
  }
  ctx.globalAlpha = alpha;
}

function paintBubble(ctx, body, ink, index, live, detail) {
  const {b:bubble,x,y,radius,reflections} = body;
  ctx.save();
  ctx.translate(x,y);
  ctx.scale(radius,radius);
  const patches = dents.get(bubble);
  ctx.clip(outline(bubble,rim,patches));
  paintSurface(ctx,bubble,radius,rim,ink,index,live,detail,patches ? rimSlope : null);
  if (reflections.length) reflectNeighbours(ctx,reflections,ink);
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
  const shifts = live && contactOffsets(bubbles,width/short,height/short);
  const bodies = bubbles.map((b,index) => {
    if (!live) { settleSurface(b); dents.delete(b); }
    const radius = short*sizes[index], extent = Math.ceil(radius*1.3)+2;
    const x = b.x*width+(shifts?.[index]?.x || 0)*short;
    const y = b.y*height+(shifts?.[index]?.y || 0)*short;
    const bounds = {left:Math.max(0,Math.floor(x-extent)), top:Math.max(0,Math.floor(y-extent)),
      right:Math.min(width,Math.ceil(x+extent)), bottom:Math.min(height,Math.ceil(y+extent))};
    const previous = scene.previous[index];
    return {b,x,y,radius,bounds,reflections:[],active:live && (surfaceIsMoving(b) || gliding(b) || !!dents.get(b)?.moving),
      area:previous ? cover(bounds,previous.bounds) : bounds};
  });
  const moving = bodies.some(p => p.active);
  const start = moving ? performance.now() : 0;
  facingReflections(bodies,ink);
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
    // A nearby orb changes the facing rim even before their bounds cross.
    // Include the former neighbour too so the tint clears on separation.
    const affected = r => areas.includes(bodies[r.index].area);
    for (let count = -1; count !== areas.length;) {
      count = areas.length;
      for (let i=0; i<bodies.length; i++) {
        const p = bodies[i];
        if (!areas.includes(p.area) && (areas.some(a => intersects(a,p.area)) ||
            p.reflections.some(affected) || scene.previous[i].reflections.some(affected))) areas.push(p.area);
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
    paintBubble(ctx,p,ink,i,live,p.active ? scene.detail : 6);
    scene.previous[i] = {b:p.b,bounds:p.bounds,active:p.active,reflections:p.reflections};
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
