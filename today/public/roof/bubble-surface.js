// Coordinates are in orb radii. Both the light and the contact forces use this
// surface, so a ripple bends the existing reflections as it crosses the orb.
const edge = 1.32;
const cells = 52;
const stride = cells + 1;
const count = stride * stride;
export const outlineSegments = 40;
const spacing = 2 * edge / cells;
const tick = 1 / 60;
const courant = (.97 * tick / spacing) ** 2;
const tau = Math.PI * 2;
const waves = new WeakMap();
const lights = new WeakMap();
const tiles = new WeakMap();
const clamp = value => Math.max(0, Math.min(1, value));

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

export function stepSurface(bubble, dt, hit, input) {
  const contact = hit && hit.distance <= 1.04 && input;
  let wave = waves.get(bubble);
  if (!contact && !wave) return false;
  if (!wave) {
    wave = {h:new Float32Array(count), last:new Float32Array(count), next:new Float32Array(count),
      tx:hit.x, ty:hit.y, x:hit.x, y:hit.y, tailX:hit.x, tailY:hit.y, pressure:0, age:0, remainder:0};
    waves.set(bubble,wave);
  }

  const target = contact && !input.release ? (input.down ? 1 : .52)*hit.amount : 0;
  if (contact) { wave.tx = hit.x; wave.ty = hit.y; }
  wave.age = target || (contact && input.tap) ? 0 : wave.age + dt;
  // A quick lift can land between two display frames. Seed its velocity once.
  if (contact && input.tap) {
    for (let i = 0; i < count; i++) {
      const dx = mesh[i].x-hit.x, dy = mesh[i].y-hit.y;
      const footprint = 1 - (dx*dx+dy*dy)/.095;
      if (footprint > 0) wave.last[i] += .034 * footprint ** 3;
    }
  }
  wave.remainder += Math.min(.16,dt);
  while (wave.remainder >= tick) {
    wave.remainder -= tick;
    wave.x += (wave.tx-wave.x)*.32;
    wave.y += (wave.ty-wave.y)*.32;
    // A sweep pulls a shallow fold behind the fingertip. Its end catches up
    // when the pointer rests, restoring the round footprint of a held press.
    wave.tailX += (wave.x-wave.tailX)*.021;
    wave.tailY += (wave.y-wave.tailY)*.021;
    const trailX = wave.tailX-wave.x, trailY = wave.tailY-wave.y;
    const trailLengthSq = trailX*trailX+trailY*trailY;
    const alongScale = 1/Math.max(.001,trailLengthSq);
    const taper = .54*Math.min(1,trailLengthSq*22);
    wave.pressure += (target-wave.pressure)*(target > wave.pressure ? .27 : .18);
    const {h, last, next} = wave;
    // A damped membrane with a soft brush load. Heights propagate after the
    // brush lifts, including on the frames with no new pointer events.
    for (let y = 1; y < cells; y++) {
      for (let x = 1, i = y*stride+1; x < cells; x++, i++) {
        const m = mesh[i], value = h[i];
        const laplace = h[i-1]+h[i+1]+h[i-stride]+h[i+stride]-4*value;
        const absorption = m.r > 1.03 ? .88 : .977;
        let force = -4*value;
        const dx = m.x-wave.x, dy = m.y-wave.y;
        const along = clamp((dx*trailX+dy*trailY)*alongScale);
        const bx = dx-along*trailX, by = dy-along*trailY;
        const brush = 1 - (bx*bx+by*by)/.13;
        if (brush > 0) force -= brush*brush*(1-taper*along)*wave.pressure*(37 + 105*value);
        next[i] = value + (value-last[i])*absorption + courant*laplace + tick*tick*force;
      }
    }
    wave.last = h; wave.h = next; wave.next = last;
  }
  if (wave.age < 4.8) return true;
  waves.delete(bubble);
  return false;
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
  const gloss = Math.round((weights >>> 9)*(1-.43*recess)), shadow = weights & 511;
  const dark = shadow + Math.round((256-gloss-shadow)*recess), base = 256-gloss-dark;
  const rb = (coat & 0xff00ff)*base + (shade & 0xff00ff)*dark + (pearl & 0xff00ff)*gloss;
  const g = (coat & 0xff00)*base + (shade & 0xff00)*dark + (pearl & 0xff00)*gloss;
  return 0xff000000 | (((rb+0x800080)>>>8)&0xff00ff) | (((g+0x8000)>>>8)&0xff00);
}

// A small studio-light map. Broad softboxes in the reflected view create the
// bright lip and shaded side of an indentation without painting a ring on top.
function studioLight(ink) {
  if (lights.has(ink)) return lights.get(ink);
  const body = rgb(ink.body), shade = rgb(ink.shade), pearl = rgb(ink.pearl);
  const rim = ink.rim.map(rgb), size = mapSize*mapSize;
  const palette = {colour:new Uint32Array(size), coat:new Uint32Array(size), shade:new Uint32Array(size),
    weights:new Uint32Array(size), pearl:pack(...pearl)};
  const coat = [0,0,0], undertone = [0,0,0];
  for (let y = 0; y < mapSize; y++) for (let x = 0; x < mapSize; x++) {
    let nx = 2*x/(mapSize-1)-1, ny = 2*y/(mapSize-1)-1;
    const radius = Math.hypot(nx,ny);
    const t = (Math.atan2(ny,nx)/tau+1)*rim.length;
    const a = Math.floor(t), frac = t-a;
    const f = frac*frac*(3-2*frac);
    const left = rim[a%rim.length], right = rim[(a+1)%rim.length];
    if (radius > 1) { nx /= radius; ny /= radius; }
    const nz = Math.sqrt(Math.max(0,1-nx*nx-ny*ny));
    const rx = 2*nx*nz, ry = 2*ny*nz, rz = 2*nz*nz-1;
    const band = clamp((radius-.31)/.69);
    const film = band*band*(3-2*band);
    const shadow = .96*Math.exp(-2.5*(rx-.59)**2-3.3*(ry+.14-.35*rx)**2-1.7*(rz-.50)**2);
    const key = 1.06*Math.exp(-4.4*(rx+.62)**2-3.0*(ry+.35-.16*rx)**2-1.7*(rz-.49)**2);
    const fill = .93*Math.exp(-4.5*(ry-.58+.34*rx)**2-1.4*(rx+.21)**2-1.2*(rz-.48)**2);
    const strip = .96*Math.exp(-23*(rx-.24+.58*ry)**2-2.6*(ry+.68)**2-2*(rz+.12)**2);
    const grazing = .30*(1-nz)**5*(.45+.55*clamp(-nx*.85+ny*.52));
    const highlight = clamp(1-(1-key)*(1-fill)*(1-strip)*(1-grazing));
    const gloss = Math.round(256*highlight), dark = Math.round((256-gloss)*shadow);
    const i = y*mapSize+x;
    palette.weights[i] = (gloss<<9) | dark;
    for (let k = 0; k < 3; k++) {
      const tint = mix(left[k],right[k],f);
      coat[k] = mix(body[k],tint,film*.98);
      undertone[k] = mix(shade[k],tint,.16+.82*film);
    }
    palette.coat[i] = pack(coat[0],coat[1],coat[2]);
    palette.shade[i] = pack(undertone[0],undertone[1],undertone[2]);
    palette.colour[i] = reflect(palette.coat[i],palette.shade[i],palette.pearl,palette.weights[i]);
  }
  lights.set(ink,palette);
  return palette;
}

// The smooth optical field is independent of output resolution. Interpolate
// normals first, then sample colour. A curved softbox stays curved at a dimple.
function surfaceTile(bubble, radius) {
  let tile = tiles.get(bubble);
  const samples = Math.max(1,Math.min(6,Math.ceil(radius*2.64/cells)));
  if (tile?.samples === samples) return tile;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = cells*samples;
  const ctx = canvas.getContext("2d",{alpha:false});
  const image = ctx.createImageData(canvas.width,canvas.height);
  tile = {canvas,ctx,image,samples,pixels:new Uint32Array(image.data.buffer),
    u:new Float32Array(count),v:new Float32Array(count), pigmentU:new Float32Array(count),pigmentV:new Float32Array(count), recess:new Float32Array(count)};
  tiles.set(bubble,tile);
  return tile;
}

export function paintSurface(ctx,bubble,radius,rim,ink,index,live) {
  const tile = surfaceTile(bubble,radius);
  const wave = waves.get(bubble)?.h;
  // A brush can run at display cadence. Undisturbed bodies have very slow
  // optical motion and can reuse their lighting between ambient frames.
  if (live && !wave && !tile.wasTouched && ink === tile.ink &&
    Math.abs(bubble.phase-tile.phase) < bubble.tempo/24 &&
    Math.abs((bubble.strainX || 0)-tile.strainX)+Math.abs((bubble.strainY || 0)-tile.strainY) < .004) {
    ctx.drawImage(tile.canvas,-edge,-edge,2*edge,2*edge);
    return;
  }
  tile.ink = ink; tile.phase = bubble.phase; tile.wasTouched = !!wave;
  tile.strainX = bubble.strainX || 0; tile.strainY = bubble.strainY || 0;
  const {u,v,pigmentU,pigmentV,recess} = tile, palette = studioLight(ink);
  const span = (mapSize-1)*.5;
  const light = bubble.phase*9 + index*.89;
  const tiltX = .37*Math.sin(light)+.15*Math.sin(bubble.phase*4+1.2);
  const tiltY = .33*Math.cos(light*.8+index);
  const roll = .48*Math.sin(bubble.phase*3.25+index*1.37)+.20*bubble.angle+.33*Math.sin(index*2.03);
  const cos = Math.cos(roll), sin = Math.sin(roll);
  const bend = .23*Math.sin(light*.75);
  const arch = bubble.phase*6 + index, cross = bubble.phase*8 - bubble.angle;
  const archX = .15*Math.cos(arch), archY = .15*Math.sin(arch);
  const crossX = .12*Math.cos(cross), crossY = .12*Math.sin(cross);
  for (let i = 0; i < count; i++) {
    const p = mesh[i], skin = mix(rim[p.a],rim[p.b],p.fraction);
    const lat = Math.min(latitudeScale,Math.round(p.r/skin*latitudeScale));
    const nz = front[lat];
    const driftA = p.archCos*archX-p.archSin*archY;
    const driftB = p.crossSin*crossX+p.crossCos*crossY;
    let nx = p.ux*side[lat]+nz*(tiltX+bend*p.y+driftA+.42*driftB);
    let ny = p.uy*side[lat]+nz*(tiltY-bend*p.x+.59*driftA-driftB);
    if (wave) {
      let sx = 0, sy = 0;
      if (i > stride && i < count-stride-1) {
        const slope = (1.55+.40*nz)/(2*spacing);
        const above = i-stride, below = i+stride;
        // Average across the brush rather than letting a single grid row sharpen a glint.
        sx = ((wave[i+1]-wave[i-1])*.5 + (wave[above+1]+wave[below+1]-wave[above-1]-wave[below-1])*.25)*slope;
        sy = ((wave[below]-wave[above])*.5 + (wave[below-1]+wave[below+1]-wave[above-1]-wave[above+1])*.25)*slope;
      }
      const px = nx-.18*sx, py = ny-.18*sy;
      const baseInv = 1/Math.sqrt(px*px+py*py+nz*nz);
      pigmentU[i] = span*(1+(cos*px-sin*py)*baseInv);
      pigmentV[i] = span*(1+(sin*px+cos*py)*baseInv);
      // The well transmits a little more of the local colour below the reflected softbox.
      recess[i] = Math.min(.68,Math.max(0,-wave[i])*(2.65+1.2*clamp(.45+sx-sy)));
      nx -= sx; ny -= sy;
    }
    const inv = 1/Math.sqrt(nx*nx+ny*ny+nz*nz);
    u[i] = span*(1+(cos*nx-sin*ny)*inv);
    v[i] = span*(1+(sin*nx+cos*ny)*inv);
  }
  const n = tile.samples, w = tile.canvas.width;
  for (let cy = 0; cy < cells; cy++) {
    for (let cx = 0; cx < cells; cx++) {
      const i = cy*stride+cx, below = i+stride;
      // The largest supported silhouette and strain fit within 1.25 radii.
      if (mesh[i].r > 1.25+spacing*2) continue;
      const leftU = (u[below]-u[i])/n, leftV = (v[below]-v[i])/n;
      const rightU = (u[below+1]-u[i+1])/n, rightV = (v[below+1]-v[i+1])/n;
      for (let row = 0; row < n; row++) {
        const offset = row+.5;
        let tx = u[i]+leftU*offset, ty = v[i]+leftV*offset;
        const du = (u[i+1]+rightU*offset-tx)/n, dv = (v[i+1]+rightV*offset-ty)/n;
        tx += du*.5; ty += dv*.5;
        let pixel = (cy*n+row)*w+cx*n;
        if (wave) {
          const f = offset/n;
          let px = mix(pigmentU[i],pigmentU[below],f), py = mix(pigmentV[i],pigmentV[below],f);
          const dx = (mix(pigmentU[i+1],pigmentU[below+1],f)-px)/n;
          const dy = (mix(pigmentV[i+1],pigmentV[below+1],f)-py)/n;
          let depth = mix(recess[i],recess[below],f);
          const depthStep = (mix(recess[i+1],recess[below+1],f)-depth)/n;
          px += dx*.5; py += dy*.5; depth += depthStep*.5;
          for (let col=0; col<n; col++,tx+=du,ty+=dv,px+=dx,py+=dy,depth+=depthStep) {
            const pigment = ((py+.5)|0)*mapSize+((px+.5)|0);
            const ray = ((ty+.5)|0)*mapSize+((tx+.5)|0);
            tile.pixels[pixel++] = reflect(palette.coat[pigment],palette.shade[pigment],palette.pearl,palette.weights[ray],depth);
          }
        } else {
          for (let col=0; col<n; col++,tx+=du,ty+=dv) {
            tile.pixels[pixel++] = palette.colour[((ty+.5)|0)*mapSize+((tx+.5)|0)];
          }
        }
      }
    }
  }
  tile.ctx.putImageData(tile.image,0,0);
  ctx.drawImage(tile.canvas,-edge,-edge,2*edge,2*edge);
}
