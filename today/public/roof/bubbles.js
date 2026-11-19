import {outlineSegments, stepSurface, settleSurface, surfaceIsMoving, paintSurface} from "./bubble-surface.js";

// Positions are fractions of the viewport. Sizes and speeds are fractions of its short edge.
const sizes = [.30, .165, .082, .037];
const tau = Math.PI * 2;
const range = (low, high) => low + Math.random() * (high - low);
const clamp = value => Math.max(0, Math.min(1, value));

export const respondingBubbles = bubbles => bubbles.some(surfaceIsMoving);
export const defaultBubbleColour = "opal";
// Rim swatches travel clockwise from the right-hand edge. Keep existing
// colourways available to people who chose them explicitly in Appearance.
export const minerals = {
  opal: {name:"Opal", light:{base:"#f4f1ef", atmosphere:"#e6dada"}, base:"#100e1a", atmosphere:"#382331", body:"#f1d5c8", shade:"#c3673a", pearl:"#fffcf7",
    rim:["#ffdb49","#e8cd86","#bdd2bd","#469bb9","#e8c1d5","#f57a9e","#e85152","#f19c35"]},
  midnight: {name:"Midnight", light:{base:"#f4f1f7", atmosphere:"#ded4e8"}, base:"#100e1a", atmosphere:"#352340", body:"#89749f", shade:"#392843", pearl:"#f1d9eb",
    rim:["#a581b4","#708fbc","#8ed6f0","#656bb6","#8c5f9d","#dc94b8","#a56da7","#6c5793"]},
  jade: {name:"Jade", light:{base:"#eff5f1", atmosphere:"#d3e4d9"}, base:"#091311", atmosphere:"#12362e", body:"#57907a", shade:"#1a4941", pearl:"#d6f1cf",
    rim:["#a9be76","#98c296","#88d9c7","#3e9796","#287e73","#6cb28c","#a4bc79","#77b193"]},
  cobalt: {name:"Cobalt", light:{base:"#f0f3f9", atmosphere:"#d4dfee"}, base:"#0a0f1d", atmosphere:"#1c304a", body:"#647ca9", shade:"#263353", pearl:"#e1edff",
    rim:["#6caee4","#69c4e5","#9eacfa","#6674bd","#514e9a","#8b7dc9","#6d9ee2","#7eabdd"]},
  lagoon: {name:"Lagoon", light:{base:"#eff5f6", atmosphere:"#cfe3e4"}, base:"#08131c", atmosphere:"#163746", body:"#659591", shade:"#214652", pearl:"#d9f6eb",
    rim:["#79cfab","#93d6bd","#a4c8ff","#5976ad","#326c9a","#5bb4b9","#52bdaa","#99d8bd"]}
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

const tapStrains = new WeakMap();

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
    stepSurface(b,dt,hit?.index === i ? hit : null,pointer);
    if (hit?.index === i) {
      const angle = hit.distance < .035 ? Math.atan2(b.vy,b.vx) : Math.atan2(-hit.y,-hit.x);
      const nx = Math.cos(angle), ny = Math.sin(angle);
      const tap = pointer.tap && hit.distance <= 1;
      const impulse = tap ? .027/(1+3*sizes[i]) : .0013*dt*hit.amount;
      b.vx += nx*impulse; b.vy += ny*impulse;
      if (tap) tapStrains.set(b,{nx,ny,remaining:.082});
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
function paintBubble(ctx, bubble, x, y, radius, ink, index, live) {
  ctx.save();
  ctx.translate(x,y);
  ctx.scale(radius,radius);
  ctx.clip(outline(bubble,rim));
  paintSurface(ctx,bubble,radius,rim,ink,index,live);
  applyGrain(ctx,index,radius);
  ctx.restore();
}

// Use the same antialiased vector drawing on touch, desktop and software-rendered devices.
export function sizeBubbleCanvas(canvas, width, height, interacting = false) {
  if (!width || !height) return false;
  // The travelling highlights are smooth fields. Limit their backing store
  // during gestures; static and ambient scenes retain the full display budget.
  const pixels = interacting ? 640000 : 3840*2160;
  const scale = Math.min(window.devicePixelRatio || 1, Math.sqrt(pixels/(width*height)),
    interacting ? 1.25 : Infinity, 8192/Math.max(width,height));
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
function sceneLayer(width,height) {
  const layer = document.createElement("canvas");
  layer.width = width; layer.height = height;
  return layer.getContext("2d");
}

export function drawBubbles(ctx, bubbles, colour, shade = 0, live = true, light = false) {
  const {width,height} = ctx.canvas, short = Math.min(width,height);
  const ink = minerals[colour], ground = light ? ink.light : ink;
  const main = bubbles[0];
  let moving = 0, active = -1;
  for (let i=0; i<bubbles.length; i++) {
    if (!live) settleSurface(bubbles[i]);
    if (surfaceIsMoving(bubbles[i])) { moving++; active = i; }
  }
  function body(target,i) {
    const b = bubbles[i];
    paintBubble(target,b,b.x*width,b.y*height,short*sizes[i],ink,i,live);
  }
  let left = 0, top = 0, w = width, h = height;
  if (moving === 1) {
    // Keep the painter's order on both sides of the touched orb. Restore only its
    // old and new bounds between ambient updates, including after release.
    let scene = scenes.get(ctx);
    if (!scene || scene.width !== width || scene.height !== height) {
      scene = {width,height,back:sceneLayer(width,height)};
      scenes.set(ctx,scene);
    }
    const b = bubbles[active], x = b.x*width, y = b.y*height;
    const rebuild = scene.body !== b || scene.ground !== ground || scene.shade !== shade ||
      Math.abs(main.phase-scene.phase) >= main.tempo/20;
    if (rebuild) {
      paintSky(scene.back,ground,main,width,height,short);
      for (let i=bubbles.length-1; i>active; i--) body(scene.back,i);
      if (active > 0) {
        scene.front ||= sceneLayer(width,height);
        scene.front.clearRect(0,0,width,height);
        for (let i=active-1; i>=0; i--) body(scene.front,i);
      }
      scene.phase = main.phase; scene.body = b; scene.ground = ground; scene.shade = shade;
    } else {
      const extent = Math.ceil(short*sizes[active]*1.3)+2;
      left = Math.max(0,Math.floor(Math.min(x,scene.x)-extent));
      top = Math.max(0,Math.floor(Math.min(y,scene.y)-extent));
      w = Math.min(width,Math.ceil(Math.max(x,scene.x)+extent))-left;
      h = Math.min(height,Math.ceil(Math.max(y,scene.y)+extent))-top;
    }
    scene.x = x; scene.y = y;
    ctx.drawImage(scene.back.canvas,left,top,w,h,left,top,w,h);
    body(ctx,active);
    if (active > 0) ctx.drawImage(scene.front.canvas,left,top,w,h,left,top,w,h);
  } else {
    scenes.delete(ctx);
    paintSky(ctx,ground,main,width,height,short);
    for (let i=bubbles.length-1; i>=0; i--) body(ctx,i);
  }
  if (shade) {
    ctx.globalAlpha = shade;
    ctx.fillStyle = ground.base;
    ctx.fillRect(left,top,w,h);
    ctx.globalAlpha = 1;
  }
  return moving > 0;
}
