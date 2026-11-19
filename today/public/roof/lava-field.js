// The shell and the public About page share one wallpaper field and palette.
export const radii = [.28, .11, .23, .14, .27, .064];
const range = (low, high) => low + Math.random() * (high - low);

// All colourways use the same field and lighting. Warmth shifts across a pool
// and the rim catches more light on its upper edge.
export const pigments = {
  midnight: {name:"Midnight", base:[11,9,17], haze:[12,6,19], pool:[47,16,56], warmth:[61,10,-27], depth:[22,0,14], rim:[66,27,58], glint:[72,43,-33]},
  jade: {name:"Jade", base:[5,13,12], haze:[5,16,13], pool:[7,48,38], warmth:[22,20,-17], depth:[7,17,9], rim:[30,74,58], glint:[37,32,6]},
  cobalt: {name:"Cobalt", base:[6,10,21], haze:[7,12,22], pool:[20,29,77], warmth:[-11,33,8], depth:[9,12,18], rim:[45,63,97], glint:[-9,38,29]},
  lagoon: {name:"Lagoon", base:[4,12,19], haze:[5,13,19], pool:[19,31,78], warmth:[-12,57,-49], depth:[8,14,14], rim:[44,71,97], glint:[-12,36,-37]}
};
export const lavaColours = Object.entries(pigments).map(([value, p]) => ({value, name:p.name}));

export function newLavaScene() {
  return radii.map(() => {
    const angle = range(0, Math.PI * 2), speed = range(.00035, .00075);
    const vx = Math.cos(angle) * speed, vy = Math.sin(angle) * speed;
    return { x: range(-.04, 1.04), y: range(-.04, 1.04), stretch: range(.9, 1.35),
      vx, vy, targetX: vx, targetY: vy, turn: range(12, 48) };
  });
}

export function driftLava(pools, dt, aspect) {
  // Ease towards independently sampled velocities. A soft edge current keeps pools in reach.
  const blend = -Math.expm1(-dt / 12);
  const edge = p => Math.max(0, .12 - p) - Math.max(0, p - .88);
  for (const p of pools) {
    p.turn -= dt;
    if (p.turn <= 0) {
      const angle = range(0, Math.PI * 2), speed = range(.00035, .00075);
      p.targetX = Math.cos(angle) * speed;
      p.targetY = Math.sin(angle) * speed;
      p.turn = range(20, 65);
    }
    p.vx += (p.targetX + edge(p.x) * .005 - p.vx) * blend;
    p.vy += (p.targetY + edge(p.y) * .005 - p.vy) * blend;
    p.x += p.vx * dt / Math.max(1, aspect);
    p.y += p.vy * dt * Math.min(1, aspect);
  }
}

export function drawLavaFrame(ctx, frame, pools, colour) {
  const {width:w, height:h} = frame, aspect = w / h;
  const pixels = frame.data;
  const ink = pigments[colour];
  const sx = .77 * Math.max(1, aspect), sy = .77 * Math.max(1, 1 / aspect);
  // X and Y terms are separable, so compute distances once per column and row.
  const columns = pools.map(p => Array.from({length:w}, (_, x) => (x / w - p.x) * sx));
  let index = 0;
  for (let y = 0; y < h; y++) {
    const v = y / h, warm = v * .32 + .22 * Math.cos(v * 5 + .36);
    const rows = pools.map(p => (v - p.y) * sy / p.stretch);
    for (let x = 0; x < w; x++) {
      let field = 0, nx = 0, ny = 0;
      for (let j = 0; j < pools.length; j++) {
        const dx = columns[j][x], dy = rows[j];
        const d = dx * dx + dy * dy + .002, mass = radii[j] ** 2 / d;
        field += mass; nx -= dx * mass / d; ny -= dy * mass / (d * pools[j].stretch);
      }
      const level = field - 1.65, inside = 1 / (1 + Math.exp(-level * 21));
      const rim = Math.exp(-Math.abs(level) * 5.8);
      const light = Math.max(0, (nx * .51 + ny * .86) / (Math.sqrt(nx * nx + ny * ny) || 1));
      const ambient = Math.min(1, field * .42), hot = Math.max(0, Math.min(1, (1 - x / w) * .58 + warm));
      const sheen = rim * (.2 + .8 * light), depth = 1 / (1 + Math.max(0, level) * .85);
      for (let channel = 0; channel < 3; channel++) {
        pixels[index++] = ink.base[channel] + ambient * ink.haze[channel]
          + inside * (ink.pool[channel] + hot * ink.warmth[channel] + depth * ink.depth[channel])
          + sheen * (ink.rim[channel] + hot * ink.glint[channel]);
      }
      pixels[index++] = 255;
    }
  }
  ctx.putImageData(frame, 0, 0);
}
