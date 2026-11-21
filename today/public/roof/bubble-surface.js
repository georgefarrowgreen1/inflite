// Coordinates are in orb radii. Both the light and the contact forces use this
// surface, so a ripple bends the existing reflections as it crosses the orb.
const edge = 1.32;
const cells = 52;
const stride = cells + 1;
const count = stride * stride;
export const outlineSegments = 40;
const spacing = 2 * edge / cells;
const tick = 1 / 120;
const follow = 1-Math.sqrt(.68), trail = 1-Math.sqrt(.979);
const tau = Math.PI * 2;
const waves = new WeakMap();
const lights = new WeakMap();
const tiles = new WeakMap();
const clamp = value => Math.max(0, Math.min(1, value));
const materials = new Map();

// In radius coordinates a wave crosses a smaller surface sooner. Scale the
// forces and decay together at the same 120 Hz tick. Even the fastest material
// has a squared Courant number below .08 (the 2D stability limit is .5).
function materialFor(radius) {
  let material = materials.get(radius);
  if (!material) {
    const rate = Math.max(.78,Math.min(1.65,Math.sqrt(.165/radius)));
    const step = rate*tick;
    material = {rate,step,step2:step*step,courant:(.97*step/spacing)**2,
      damping:.977**(.5*rate),rimDamping:.88**(.5*rate),
      load:1-.73**(.5*rate),release:1-.82**(.5*rate)};
    materials.set(radius,material);
  }
  return material;
}

// Geometry shared by all four orbs. The angular coordinate samples the very
// same spline radii used for the silhouette, including contact deformation.
const mesh = Array.from({length:count}, (_, i) => {
  const x = (i % stride) * spacing - edge, y = Math.floor(i / stride) * spacing - edge;
  const r = Math.hypot(x,y);
  const angle = Math.atan2(y,x) / tau;
  const spoke = (angle - Math.floor(angle))*outlineSegments;
  const a = Math.floor(spoke);
  const arch = 2.7*x + 1.6*y, cross = 1.35*x - 3.1*y;
  return {x, y, r, ux:r ? x/r : 0, uy:r ? y/r : 0, a, b:(a+1)%outlineSegments, fraction:spoke-a,
    archCos:Math.cos(arch), archSin:Math.sin(arch), crossCos:Math.cos(cross), crossSin:Math.sin(cross)};
});

export const surfaceIsMoving = bubble => waves.has(bubble);

export function settleSurface(bubble) {
  waves.delete(bubble);
}

function surfaceFor(bubble, x, y) {
  let wave = waves.get(bubble);
  if (!wave) {
    wave = {h:new Float32Array(count), last:new Float32Array(count), next:new Float32Array(count), display:new Float32Array(count),
      tx:x, ty:y, x, y, tailX:x, tailY:y, pressure:0, remainder:0, checkIn:0, impulses:[]};
    waves.set(bubble,wave);
  }
  return wave;
}

// Queue each point of impact once. Two neighbours can touch opposite sides
// between solver ticks without moving the fingertip or replacing its pressure.
export function rippleSurface(bubble, x, y, impulse, radius = .24) {
  surfaceFor(bubble,x,y).impulses.push({x,y,impulse,radius});
}

function applyImpulse(next, {x,y,impulse,radius}, rate) {
  const left = Math.max(1,Math.ceil((x-radius+edge)/spacing)), right = Math.min(cells-1,Math.floor((x+radius+edge)/spacing));
  const top = Math.max(1,Math.ceil((y-radius+edge)/spacing)), bottom = Math.min(cells-1,Math.floor((y+radius+edge)/spacing));
  for (let row=top; row<=bottom; row++) for (let col=left; col<=right; col++) {
    const i = row*stride+col, dx = mesh[i].x-x, dy = mesh[i].y-y;
    const footprint = 1-(dx*dx+dy*dy)/(radius*radius);
    if (footprint > 0) next[i] -= impulse*rate*footprint**3;
  }
}

function surfaceAtRest({h,last}, materialStep) {
  // Bound both kinetic and elastic energy. A passing wave can be perfectly
  // flat at a point while moving fastest, or motionless at full deformation.
  for (let row=1; row<cells; row++) for (let i=row*stride+1; i<row*stride+cells; i++) {
    const z = h[i], speed = (z-last[i])/materialStep;
    const sx = (z-h[i-1])/spacing, sy = (z-h[i-stride])/spacing;
    if (4*z*z + speed*speed + sx*sx + sy*sy > .009**2) return false;
  }
  return true;
}

export function stepSurface(bubble, dt, hit, input, radius = .165, present = true) {
  const contact = hit && hit.distance <= 1.04 && input;
  const wave = contact ? surfaceFor(bubble,hit.x,hit.y) : waves.get(bubble);
  if (!wave) return false;
  const material = materialFor(radius);

  const target = contact && !input.release ? (input.down ? 1 : .52)*hit.amount : 0;
  if (contact) { wave.tx = hit.x; wave.ty = hit.y; }
  // A quick lift can land between two display frames. Seed its velocity once.
  if (contact && input.tap) rippleSurface(bubble,hit.x,hit.y,.017,Math.sqrt(.095));
  wave.remainder += Math.min(.16,dt);
  while (wave.remainder >= tick) {
    wave.remainder -= tick;
    wave.x += (wave.tx-wave.x)*follow;
    wave.y += (wave.ty-wave.y)*follow;
    // A sweep pulls a shallow fold behind the fingertip. Its end catches up
    // when the pointer rests, restoring the round footprint of a held press.
    wave.tailX += (wave.x-wave.tailX)*trail;
    wave.tailY += (wave.y-wave.tailY)*trail;
    const trailX = wave.tailX-wave.x, trailY = wave.tailY-wave.y;
    const trailLengthSq = trailX*trailX+trailY*trailY;
    const alongScale = 1/Math.max(.001,trailLengthSq);
    const taper = .54*Math.min(1,trailLengthSq*22);
    wave.pressure += (target-wave.pressure)*(target > wave.pressure ? material.load : material.release);
    const {h, last, next} = wave;
    const left = Math.min(wave.x,wave.tailX)-.37, right = Math.max(wave.x,wave.tailX)+.37;
    const top = Math.min(wave.y,wave.tailY)-.37, bottom = Math.max(wave.y,wave.tailY)+.37;
    // A damped membrane with a soft brush load. Heights propagate after the
    // brush lifts, including on the frames with no new pointer events.
    for (let y = 1; y < cells; y++) {
      for (let x = 1, i = y*stride+1; x < cells; x++, i++) {
        const m = mesh[i], value = h[i];
        const laplace = h[i-1]+h[i+1]+h[i-stride]+h[i+stride]-4*value;
        const absorption = m.r > 1.03 ? material.rimDamping : material.damping;
        let force = -4*value;
        if (wave.pressure > .0001 && m.x >= left && m.x <= right && m.y >= top && m.y <= bottom) {
          const dx = m.x-wave.x, dy = m.y-wave.y;
          const along = clamp((dx*trailX+dy*trailY)*alongScale);
          const bx = dx-along*trailX, by = dy-along*trailY;
          const brush = 1 - (bx*bx+by*by)/.13;
          if (brush > 0) force -= brush*brush*(1-taper*along)*wave.pressure*(37 + 105*value);
        }
        next[i] = value + (value-last[i])*absorption + material.courant*laplace + material.step2*force;
      }
    }
    if (wave.impulses.length) {
      for (const impulse of wave.impulses) applyImpulse(next,impulse,material.rate);
      wave.impulses.length = 0;
    }
    wave.last = h; wave.h = next; wave.next = last;
    wave.checkIn -= tick;
  }
  if (!target && !wave.impulses.length && wave.pressure < .001 && wave.checkIn <= 0) {
    if (surfaceAtRest(wave,material.step)) {
      waves.delete(bubble);
      return false;
    }
    wave.checkIn = .1;
  }
  if (present) {
    const fraction = wave.remainder/tick;
    for (let i=0; i<count; i++) wave.display[i] = wave.last[i]+fraction*(wave.h[i]-wave.last[i]);
  }
  return true;
}

const rgb = hex => [1,3,5].map(i => parseInt(hex.slice(i,i+2),16));
const mix = (a,b,t) => a+(b-a)*t;
const mapSize = 256;
// Geometric latitude is independent of the lighting, palette and gesture.
const latitudeScale = 1024;
const side = new Float32Array(latitudeScale+1), front = new Float32Array(latitudeScale+1);
for (let i = 0; i <= latitudeScale; i++) {
  const r = i/latitudeScale;
  const angle = r*(1.18+.39*r*r);
  side[i] = Math.sin(angle);
  front[i] = Math.cos(angle);
}

const pack = (r,g,b) => Math.round(r) | (Math.round(g)<<8) | (Math.round(b)<<16);

// The enamel carries its own colour. Reflected light can fold all the way
// around a dent while the blush and gold underneath move only a little.
function reflect(coat, shade, pearl, weights, recess = 0) {
  let gloss = weights >>> 9, dark = weights & 511;
  if (recess) {
    gloss = Math.round(gloss*(1-.43*recess));
    dark += Math.round((256-gloss-dark)*recess);
  }
  const base = 256-gloss-dark;
  const rb = (coat & 0xff00ff)*base + (shade & 0xff00ff)*dark + (pearl & 0xff00ff)*gloss;
  const g = (coat & 0xff00)*base + (shade & 0xff00)*dark + (pearl & 0xff00)*gloss;
  return 0xff000000 | (((rb+0x800080)>>>8)&0xff00ff) | (((g+0x8000)>>>8)&0xff00);
}

// Reflection directions are in screen space. Every body and palette shares
// these lights; only the surface normal under a moving dent changes the ray.
let lightsInRoom;
function roomLighting() {
  if (lightsInRoom) return lightsInRoom;
  const weights = new Uint32Array(mapSize*mapSize);
  for (let y = 0; y < mapSize; y++) for (let x = 0; x < mapSize; x++) {
    let nx = 2*x/(mapSize-1)-1, ny = 2*y/(mapSize-1)-1;
    const radius = Math.hypot(nx,ny);
    if (radius > 1) { nx /= radius; ny /= radius; }
    const nz = Math.sqrt(Math.max(0,1-nx*nx-ny*ny));
    const rx = 2*nx*nz, ry = 2*ny*nz, rz = 2*nz*nz-1;
    const shadow = .96*Math.exp(-2.5*(rx-.59)**2-3.3*(ry+.14-.35*rx)**2-1.7*(rz-.50)**2);
    const key = 1.06*Math.exp(-4.4*(rx+.62)**2-3.0*(ry+.35-.16*rx)**2-1.7*(rz-.49)**2);
    const fill = .93*Math.exp(-4.5*(ry-.58+.34*rx)**2-1.4*(rx+.21)**2-1.2*(rz-.48)**2);
    const strip = .96*Math.exp(-23*(rx-.24+.58*ry)**2-2.6*(ry+.68)**2-2*(rz+.12)**2);
    const grazing = .30*(1-nz)**5*(.45+.55*clamp(-nx*.85+ny*.52));
    const highlight = clamp(1-(1-key)*(1-fill)*(1-strip)*(1-grazing));
    const gloss = Math.round(256*highlight), dark = Math.round((256-gloss)*shadow);
    weights[y*mapSize+x] = (gloss<<9) | dark;
  }
  return lightsInRoom = weights;
}

function studioLight(ink) {
  if (lights.has(ink)) return lights.get(ink);
  const body = rgb(ink.body), shade = rgb(ink.shade), pearl = rgb(ink.pearl);
  const rim = ink.rim.map(rgb), size = mapSize*mapSize;
  const palette = {coat:new Uint32Array(size), shade:new Uint32Array(size),
    weights:roomLighting(), pearl:pack(...pearl)};
  const coat = [0,0,0], undertone = [0,0,0];
  for (let y = 0; y < mapSize; y++) for (let x = 0; x < mapSize; x++) {
    let nx = 2*x/(mapSize-1)-1, ny = 2*y/(mapSize-1)-1;
    const radius = Math.hypot(nx,ny);
    const t = (Math.atan2(ny,nx)/tau+1)*rim.length;
    const a = Math.floor(t), frac = t-a;
    const f = frac*frac*(3-2*frac);
    const left = rim[a%rim.length], right = rim[(a+1)%rim.length];
    const i = y*mapSize+x;
    const band = clamp((radius-.31)/.69), film = band*band*(3-2*band);
    for (let k = 0; k < 3; k++) {
      const tint = mix(left[k],right[k],f);
      coat[k] = mix(body[k],tint,film*.98);
      undertone[k] = mix(shade[k],tint,.16+.82*film);
    }
    palette.coat[i] = pack(coat[0],coat[1],coat[2]);
    palette.shade[i] = pack(undertone[0],undertone[1],undertone[2]);
  }
  lights.set(ink,palette);
  return palette;
}

// Sample in the body's local coordinates. A positive turn carries a swatch clockwise.
const pigmentAngle = (b,index) => b.angle + index*1.37 + .19*Math.sin(b.phase);
export function rimColourAt(bubble,index,angle,ink) {
  const local = angle-pigmentAngle(bubble,index), span = (mapSize-1)*.5;
  const x = Math.round(span*(1+Math.cos(local))), y = Math.round(span*(1+Math.sin(local)));
  return studioLight(ink).coat[y*mapSize+x];
}

// The smooth optical field is independent of output resolution. Interpolate
// normals first, then sample colour. A curved softbox stays curved at a dimple.
function surfaceTile(bubble, radius, detail) {
  let tile = tiles.get(bubble);
  const samples = Math.max(1,Math.min(detail,Math.ceil(radius*2.64/cells)));
  if (tile?.samples === samples) return tile;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = cells*samples;
  // The CPU writes this tile; keeping its pixels local avoids GPU readback
  // when the next small rectangle is uploaded while the display is drawing.
  const ctx = canvas.getContext("2d",{alpha:false,willReadFrequently:true});
  const image = ctx.createImageData(canvas.width,canvas.height);
  tile = {canvas,ctx,image,samples,pixels:new Uint32Array(image.data.buffer),
    u:new Float32Array(count),v:new Float32Array(count), pigmentU:new Float32Array(count),pigmentV:new Float32Array(count),
    recess:new Float32Array(count),changed:new Uint8Array(count),
    basePX:new Float64Array(count),basePY:new Float64Array(count),baseNX:new Float64Array(count),baseNY:new Float64Array(count),
    latitude:new Uint16Array(count), dented:new Uint8Array(outlineSegments), spokes:new Uint8Array(outlineSegments)};
  tiles.set(bubble,tile);
  return tile;
}

// Stagger the slow marbling field across bodies. Geometry and waves keep
// their own display-rate clocks.
export const materialTick = (bubble,index) => Math.floor(bubble.phase*10/bubble.tempo + index*.25);

export function paintSurface(ctx,bubble,radius,rim,ink,index,live,detail = 6,rimSlope = null,rimOffset = null) {
  const wave = waves.get(bubble)?.display;
  const tile = surfaceTile(bubble,radius,detail);
  const tiltX = -.19*(bubble.vx || 0), tiltY = -.19*(bubble.vy || 0);
  // Slow marbling can reuse a tile across ambient frames. Stagger its refresh
  // across bodies; physical tilt, rotation, strain and waves update independently.
  const colourTick = materialTick(bubble,index);
  const sameBase = live && ink === tile.ink &&
    colourTick === tile.colourTick && index===tile.index && Math.abs(bubble.angle-tile.angle) < .004 &&
    Math.abs(tiltX-tile.tiltX)+Math.abs(tiltY-tile.tiltY) < .002 &&
    Math.abs((bubble.strainX || 0)-tile.strainX)+Math.abs((bubble.strainY || 0)-tile.strainY) < .004;
  const contactChanged = !!rimSlope || tile.hadSlope;
  if (sameBase && !wave && !tile.wasTouched && !contactChanged) {
    ctx.drawImage(tile.canvas,-edge,-edge,2*edge,2*edge);
    return;
  }
  const newPalette = ink !== tile.ink;
  const oldRadius = tile.visibleRadius ?? 0;
  tile.hadSlope = !!rimSlope;
  tile.wasTouched = !!wave;
  const {u,v,pigmentU,pigmentV,recess,changed} = tile, palette = studioLight(ink);
  const span = (mapSize-1)*.5;
  // Allow the interpolation cell on either side of the antialiased silhouette.
  if (contactChanged) {
    for (let i=0;i<outlineSegments;i++) {
      const active = !!(rimSlope?.[i] || rimOffset?.[3*i]);
      tile.spokes[i] = active || tile.dented[i];
      tile.dented[i] = active;
    }
  }
  if (!sameBase || contactChanged) {
    if (!sameBase) {
      tile.ink = ink; tile.index=index; tile.colourTick = colourTick; tile.angle = bubble.angle;
      tile.phase = bubble.phase;
      tile.tiltX = tiltX; tile.tiltY = tiltY;
      tile.strainX = bubble.strainX || 0; tile.strainY = bubble.strainY || 0;
    }
    tile.visibleRadius = Math.max(...rim)+2*spacing;
    const light = tile.phase*9 + index*.89;
    const roll = pigmentAngle(tile,index);
    tile.cos = Math.cos(roll); tile.sin = Math.sin(roll);
    const driftX = .37*Math.sin(light)+.15*Math.sin(tile.phase*4+1.2);
    const driftY = .33*Math.cos(light*.8+index);
    const bend = .23*Math.sin(light*.75);
    const arch = tile.phase*6 + index, cross = tile.phase*8 - tile.angle;
    const archX = .15*Math.cos(arch), archY = .15*Math.sin(arch);
    const crossX = .12*Math.cos(cross), crossY = .12*Math.sin(cross);
    for (let i = 0; i < count; i++) {
      const p = mesh[i];
      if (p.r > tile.visibleRadius+2*spacing || (sameBase && !tile.spokes[p.a] && !tile.spokes[p.b])) continue;
      const skin = mix(rim[p.a],rim[p.b],p.fraction);
      const lat = Math.min(latitudeScale,Math.round(p.r/skin*latitudeScale));
      const nz = front[lat];
      const driftA = p.archCos*archX-p.archSin*archY;
      const driftB = p.crossSin*crossX+p.crossCos*crossY;
      const baseX = p.ux*side[lat], baseY = p.uy*side[lat];
      const px = baseX+nz*(driftX+bend*p.y+driftA+.42*driftB);
      const py = baseY+nz*(driftY-bend*p.x+.59*driftA-driftB);
      let nx = baseX+nz*(tile.tiltX+.6*(tile.strainX*p.x+tile.strainY*p.y));
      let ny = baseY+nz*(tile.tiltY+.6*(tile.strainY*p.x-tile.strainX*p.y));
      if (rimSlope) {
        // The normal on a dimpled polar outline tilts toward the shallower
        // shoulder. Let that change in orientation fade into the interior.
        const slope = mix(rimSlope[p.a],rimSlope[p.b],p.fraction)/skin;
        const lean = slope*side[lat]*(lat/latitudeScale)**2;
        nx += lean*p.uy; ny -= lean*p.ux;
      }
      tile.latitude[i] = lat;
      tile.basePX[i] = px; tile.basePY[i] = py;
      tile.baseNX[i] = nx; tile.baseNY[i] = ny;
    }
  }

  // The wave advances at display cadence. Reuse the slow pigment and shape
  // fields between updates; unchanged optical cells retain their exact pixels.
  const {cos,sin,visibleRadius} = tile;
  let waveArea;
  if (wave || tile.waveHeight) {
    tile.waveHeight ||= new Float32Array(count);
    if (sameBase) {
      waveArea = tile.waveArea ||= new Uint8Array(count);
      waveArea.fill(0);
      for (let row=1;row<cells;row++) for (let col=1,i=row*stride+1;col<cells;col++,i++) {
        if (tile.waveHeight[i]===(wave?.[i] || 0)) continue;
        // A single membrane node contributes to the nine surrounding normals.
        waveArea[i-1]=waveArea[i]=waveArea[i+1]=1;
        waveArea[i-stride-1]=waveArea[i-stride]=waveArea[i-stride+1]=1;
        waveArea[i+stride-1]=waveArea[i+stride]=waveArea[i+stride+1]=1;
      }
    }
    if (wave) tile.waveHeight.set(wave);
    else { tile.waveHeight=null; tile.waveArea=null; }
  }
  changed.fill(0);
  for (let i=0; i<count; i++) {
    const p=mesh[i];
    if (p.r > visibleRadius+2*spacing || (sameBase && !waveArea?.[i] &&
      !(contactChanged && (tile.spokes[p.a] || tile.spokes[p.b])))) continue;
    const lat=tile.latitude[i], nz=front[lat];
    let px=tile.basePX[i], py=tile.basePY[i], nx=tile.baseNX[i], ny=tile.baseNY[i];
    let rayZ=nz, depth=0;
    if (wave) {
      let sx = 0, sy = 0;
      if (i > stride && i < count-stride-1) {
        const slope = (1.55+.40*nz)/(2*spacing);
        const above = i-stride, below = i+stride;
        // Average across the brush rather than letting a single grid row sharpen a glint.
        sx = ((wave[i+1]-wave[i-1])*.5 + (wave[above+1]+wave[below+1]-wave[above-1]-wave[below-1])*.25)*slope;
        sy = ((wave[below]-wave[above])*.5 + (wave[below-1]+wave[below+1]-wave[above-1]-wave[above+1])*.25)*slope;
      }
      px -= .18*sx; py -= .18*sy;
      // The well transmits a little more of the local colour below the reflected softbox.
      depth = Math.min(.68,Math.max(0,-wave[i])*(2.65+1.2*clamp(.45+sx-sy)));
      // The radial tangent tilts out of the screen at the silhouette. Carry
      // that slope into Z so a ripple at the facing lip can turn the softbox.
      const radial = sx*p.ux + sy*p.uy;
      nx -= sx - (1-nz)*radial*p.ux;
      ny -= sy - (1-nz)*radial*p.uy;
      rayZ += side[lat]*radial;
    }
    const baseInv = 1/Math.sqrt(px*px+py*py+nz*nz);
    const colourX = Math.fround(span*(1+(cos*px+sin*py)*baseInv));
    const colourY = Math.fround(span*(1+(cos*py-sin*px)*baseInv));
    const inv = 1/Math.max(.00001,Math.sqrt(nx*nx+ny*ny+rayZ*rayZ));
    const lightX = Math.fround(span*(1+nx*inv)), lightY = Math.fround(span*(1+ny*inv));
    depth = Math.fround(depth);
    if (newPalette || u[i]!==lightX || v[i]!==lightY || pigmentU[i]!==colourX || pigmentV[i]!==colourY || recess[i]!==depth) {
      changed[i]=1;
      u[i]=lightX; v[i]=lightY; pigmentU[i]=colourX; pigmentV[i]=colourY; recess[i]=depth;
    }
  }
  shadeChangedCells(tile,palette,!!wave,oldRadius);
  ctx.drawImage(tile.canvas,-edge,-edge,2*edge,2*edge);
}

function shadeChangedCells(tile,palette,wave,oldRadius) {
  const {u,v,pigmentU,pigmentV,recess,changed,visibleRadius,pixels}=tile;
  const {coat,shade,pearl,weights}=palette;
  const n = tile.samples, w = tile.canvas.width;
  let left=cells, right=-1, top=cells, bottom=-1;
  for (let cy = 0; cy < cells; cy++) {
    for (let cx = 0; cx < cells; cx++) {
      const i = cy*stride+cx, below = i+stride;
      if (mesh[i].r > visibleRadius || (mesh[i].r <= oldRadius && !(changed[i] || changed[i+1] || changed[below] || changed[below+1]))) continue;
      if (cx<left) left=cx;
      if (cx>right) right=cx;
      if (cy<top) top=cy;
      bottom=cy;
      const leftU = (u[below]-u[i])/n, leftV = (v[below]-v[i])/n;
      const rightU = (u[below+1]-u[i+1])/n, rightV = (v[below+1]-v[i+1])/n;
      for (let row = 0; row < n; row++) {
        const offset = row+.5;
        let tx = u[i]+leftU*offset, ty = v[i]+leftV*offset;
        const du = (u[i+1]+rightU*offset-tx)/n, dv = (v[i+1]+rightV*offset-ty)/n;
        tx += du*.5; ty += dv*.5;
        let pixel = (cy*n+row)*w+cx*n;
        const f = offset/n;
        let px = mix(pigmentU[i],pigmentU[below],f), py = mix(pigmentV[i],pigmentV[below],f);
        const dx = (mix(pigmentU[i+1],pigmentU[below+1],f)-px)/n;
        const dy = (mix(pigmentV[i+1],pigmentV[below+1],f)-py)/n;
        let depth = wave ? mix(recess[i],recess[below],f) : 0;
        const depthStep = wave ? (mix(recess[i+1],recess[below+1],f)-depth)/n : 0;
        px += dx*.5; py += dy*.5; depth += depthStep*.5;
        for (let col=0; col<n; col++,tx+=du,ty+=dv,px+=dx,py+=dy,depth+=depthStep) {
          const pigment = ((py+.5)|0)*mapSize+((px+.5)|0);
          const ray = ((ty+.5)|0)*mapSize+((tx+.5)|0);
          pixels[pixel++] = reflect(coat[pigment],shade[pigment],pearl,weights[ray],depth);
        }
      }
    }
  }
  if (right>=left) tile.ctx.putImageData(tile.image,0,0,left*n,top*n,(right-left+1)*n,(bottom-top+1)*n);
}
