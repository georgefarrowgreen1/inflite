const { test } = require('node:test');
const assert = require('node:assert/strict');

const body = x => ({x,y:.5,vx:0,vy:0,dx:0,dy:0,phase:0,angle:0,tempo:.05,turn:60});

test('a closing pair excites both facing surfaces once and can meet again', async () => {
  const {driftBubbles} = await import('../today/public/roof/bubbles.js');
  const {surfaceIsMoving,settleSurface} = await import('../today/public/roof/bubble-surface.js');
  const scene = [body(.36),body(.51),body(.86)], [large,small] = scene;
  function meet() {
    large.vx=.16; small.vx=0;
    driftBubbles(scene,1/60,3);
  }
  meet();
  assert.deepEqual(scene.map(surfaceIsMoving),[true,true,false]);
  assert.ok(small.vx > .01, 'a moving orb transfers momentum along the collision normal');
  scene.forEach(settleSurface);
  meet();
  assert.deepEqual(scene.map(surfaceIsMoving),[false,false,false], 'sustained contact does not seed another ripple');
  small.x=.7;
  driftBubbles(scene,1/60,3);
  small.x=large.x+.15;
  meet();
  assert.deepEqual(scene.map(surfaceIsMoving),[true,true,false]);
});

test('a shallow ripple settles earlier than a deep one across refresh rates', async () => {
  const {rippleSurface,stepSurface,surfaceIsMoving} = await import('../today/public/roof/bubble-surface.js');
  function duration(impulse,hz) {
    const orb = body(.5);
    rippleSurface(orb,.86,0,impulse);
    let frames=0;
    while (surfaceIsMoving(orb) && frames<6*hz) {
      stepSurface(orb,1/hz,null,null);
      frames++;
    }
    assert.equal(surfaceIsMoving(orb),false);
    return frames/hz;
  }
  const slow=duration(.001,30), fast=duration(.001,120);
  assert.ok(Math.abs(slow-fast)<.14);
  assert.ok(fast>.5 && fast<2);
  assert.ok(duration(.014,120)>fast+1);
});

test('a tap travels the same fraction of a small orb sooner and settles sooner', async t => {
  const {driftBubbles,minerals} = await import('../today/public/roof/bubbles.js');
  const {paintSurface,outlineSegments,surfaceIsMoving} = await import('../today/public/roof/bubble-surface.js');
  // Read the actual optical tile before its final blit. Use identical lighting
  // and raster dimensions so only the simulated material changes the pixels.
  let image, span;
  const context = {
    createImageData: (width,height) => ({width,data:new Uint8ClampedArray(width*height*4)}),
    putImageData: value => { image=value; }
  };
  globalThis.document = {createElement: () => ({getContext: () => context})};
  t.after(() => { delete globalThis.document; });
  const target = { drawImage: (tile,x,y,width) => { span=width; } };
  const rim = new Float32Array(outlineSegments).fill(1);

  function measure(index,hz) {
    const scene=[.15,.38,.64,.85].map(x=>({...body(x),phase:.72,angle:.15,tempo:0}));
    const orb=scene[index], dt=1/hz;
    const paint = () => paintSurface(target,orb,42,rim,minerals.opal,0,true,2);
    paint();
    const rest=image.data.slice(), width=image.width, ring=[];
    for (let y=0; y<width; y++) for (let x=0; x<width; x++) {
      const radius = Math.hypot(x+.5-width/2,y+.5-width/2)*span/width;
      if (radius >= .60 && radius <= .66) ring.push(4*(y*width+x));
    }
    assert.ok(ring.length);
    driftBubbles(scene,dt,4,{x:orb.x,y:orb.y,tap:true,release:true,strength:1});
    let arrival=0, frames=1;
    while (surfaceIsMoving(orb) && frames<6*hz) {
      if (!arrival) {
        paint();
        const changed=ring.filter(i=>[0,1,2].some(c=>Math.abs(rest[i+c]-image.data[i+c])>12)).length;
        if (changed > .12*ring.length) arrival=frames/hz;
      }
      driftBubbles(scene,dt,4);
      frames++;
    }
    assert.ok(arrival>0 && !surfaceIsMoving(orb));
    return {arrival,settled:frames/hz};
  }
  const fast=measure(3,120), slow=measure(0,120);
  assert.ok(fast.arrival<.75*slow.arrival && fast.settled<.75*slow.settled);
  for (const hz of [30,60,240]) {
    assert.ok(Math.abs(measure(3,hz).arrival-fast.arrival)<1/30+.001);
    assert.ok(Math.abs(measure(0,hz).arrival-slow.arrival)<1/30+.001);
  }
});
