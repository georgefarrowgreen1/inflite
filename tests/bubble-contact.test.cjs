const { test } = require('node:test');
const assert = require('node:assert/strict');

const body = x => ({x,y:.5,vx:0,vy:0,dx:0,dy:0,phase:0,angle:0,tempo:.05,turn:60});
const radii = [.30,.165,.082,.037];

function approaching(index,speed,tangent=0) {
  const scene=[.32,.70,.83,.93].map(body);
  const small=scene[index];
  small.x=scene[0].x+(radii[0]+radii[index]-.000001)/3;
  small.vx=-speed; small.dx=Math.max(-.007,-speed);
  small.vy=small.dy=tangent;
  return scene;
}

test('a passive small orb imparts a weighted recoil to a stationary large orb', async () => {
  const {driftBubbles}=await import('../today/public/roof/bubbles.js');
  for (const index of [1,2,3]) {
    const speed=.0065, scene=approaching(index,speed), large=scene[0], small=scene[index];
    const start=large.x, momentum=small.vx*radii[index];
    driftBubbles(scene,1/120,3);
    assert.ok(large.vx<0 && small.vx>0, 'the large orb recoils and the small orb rebounds');
    assert.ok(Math.abs(large.vx)<small.vx+speed, 'the heavier body changes velocity less');
    assert.ok(Math.abs(large.vx*radii[0]+small.vx*radii[index]-momentum)<1e-10);
    const sharedSpeed=Math.abs(momentum)/(radii[0]+radii[index]);
    assert.ok(Math.abs(large.vx)>sharedSpeed && Math.abs(large.vx)<2*sharedSpeed);
    for (let i=0;i<60;i++) driftBubbles(scene,1/60,3);
    assert.ok((start-large.x)*3>sharedSpeed, 'recoil carries through the next second');
    assert.ok((small.x-large.x)*3>radii[index]+radii[0], 'the two orbs separate on their own');
  }
});

test('a glancing impact preserves tangential motion and does not add kinetic energy', async () => {
  const {driftBubbles}=await import('../today/public/roof/bubbles.js');
  for (const speed of [.00001,.0065,.12]) {
    const scene=approaching(2,speed,.003), large=scene[0], small=scene[2];
    const initialEnergy=radii[2]*(speed**2+small.vy**2);
    driftBubbles(scene,1/120,3);
    assert.equal(large.vy,0);
    assert.equal(small.vy,.003);
    assert.ok(large.vx<0 && small.vx>0);
    const energy=radii[0]*large.vx**2+radii[2]*(small.vx**2+small.vy**2);
    assert.ok(energy<=initialEnergy);
  }
});

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
