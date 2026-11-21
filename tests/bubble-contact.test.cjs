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
    assert.ok(large.vx<0 && small.vx<large.vx, 'weight transfers gradually during initial compression');
    for (let i=1;i<24;i++) {
      assert.ok(Math.abs(large.vx*radii[0]+small.vx*radii[index]-momentum)<1e-10);
      driftBubbles(scene,1/120,3);
    }
    assert.ok(large.vx<0 && small.vx>0, 'after release the large orb recoils and the small orb rebounds');
    assert.ok(Math.abs(large.vx)<small.vx+speed, 'the heavier body changes velocity less');
    const sharedSpeed=Math.abs(momentum)/(radii[0]+radii[index]);
    assert.ok(Math.abs(large.vx)>sharedSpeed && Math.abs(large.vx)<2*sharedSpeed);
    for (let i=0;i<48;i++) driftBubbles(scene,1/60,3);
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
    assert.ok(large.vx<0 && small.vx<large.vx);
    for (let i=0;i<30;i++) {
      const energy=radii[0]*(large.vx**2+large.vy**2)+radii[2]*(small.vx**2+small.vy**2);
      assert.ok(energy<=initialEnergy);
      driftBubbles(scene,1/120,3);
    }
    assert.ok(small.vx>large.vx);
  }
});

test('soft contact loads before rebound and faster impacts retain more relative speed', async () => {
  const {driftBubbles}=await import('../today/public/roof/bubbles.js');
  function strike(speed,intervals) {
    const scene=approaching(2,speed), heavy=scene[0], light=scene[2], initial=(light.x-heavy.x)*3;
    let time=0, frame=0, release, maxCompression=0, rebound=0, loading;
    while (time<.22) {
      const dt=Math.min(intervals[frame++%intervals.length],.22-time);
      const previous=heavy.x;
      driftBubbles(scene,dt,3);
      time+=dt;
      if (dt>1/480) assert.ok(heavy.x<previous,'the heavy centre advances even between 120 Hz ticks');
      const relative=(light.vx-heavy.vx)/speed;
      if (time<=.034) loading=relative;
      if (relative>=0 && !release) release=time;
      rebound=Math.max(rebound,relative);
      maxCompression=Math.max(maxCompression,initial-(light.x-heavy.x)*3);
    }
    assert.ok(loading<-.25 && loading>-.90, 'both bodies are still loading after the first few frames');
    assert.ok(release>.04 && release<.10);
    assert.ok(maxCompression>speed*.015 && maxCompression<speed*.07);
    return rebound;
  }
  const slow=strike(.0065,[1/120]), firm=strike(.12,[1/120]);
  assert.ok(slow>.4 && firm>slow+.07 && firm<.86);
  for (const intervals of [[1/30],[1/60],[1/144],[1/240],[.004,.012,.007,.018]]) {
    assert.ok(Math.abs(strike(.0065,intervals)-slow)<.012);
    assert.ok(Math.abs(strike(.12,intervals)-firm)<.02);
  }
  assert.ok(strike(.35,[1/60])<.9,'a fast flick still dissipates collision energy');
});

test('collision force starts and ends smoothly at the skin and stays passive with two neighbours', async () => {
  const {driftBubbles}=await import('../today/public/roof/bubbles.js');
  const firstImpulse=[];
  for (const hz of [120,240,480]) {
    const speed=.0065, scene=approaching(2,speed), [heavy,,light]=scene;
    const impulses=[];
    for (let i=0;i<hz/4;i++) {
      const incoming=light.vx-heavy.vx;
      driftBubbles(scene,1/hz,3);
      const impulse=(light.vx-heavy.vx-incoming)/speed;
      if (impulse>1e-7) impulses.push(impulse);
    }
    firstImpulse.push(impulses[0]);
    assert.ok(impulses.at(-1)<.05*Math.max(...impulses),'force tapers to zero at release');
  }
  // Starting at zero force gives a quadratic first impulse as the time step
  // shrinks. A dashpot already pressing at first touch would only halve it.
  for (let i=1;i<firstImpulse.length;i++) {
    const ratio=firstImpulse[i]/firstImpulse[i-1];
    assert.ok(ratio>.22 && ratio<.29);
  }

  const scene=[.5,.5-(.465-.000001)/3,.5+(.382-.000001)/3,.93].map(body);
  const [heavy,left,right]=scene;
  left.vx=left.dx=.003;
  right.vx=right.dx=-left.vx*radii[1]/radii[2];
  const energy=()=>scene.reduce((sum,b,i)=>sum+radii[i]*b.vx**2,0);
  const initialEnergy=energy();
  let leftRebounds=0, rightRebounds=0;
  for (let frame=0;frame<120;frame++) {
    const leftApproach=left.vx-heavy.vx, rightApproach=heavy.vx-right.vx;
    driftBubbles(scene,1/240,3);
    if (leftApproach*(left.vx-heavy.vx)<0) leftRebounds++;
    if (rightApproach*(heavy.vx-right.vx)<0) rightRebounds++;
    assert.ok(Math.abs(scene.reduce((sum,b,i)=>sum+radii[i]*b.vx,0))<1e-12);
    assert.ok(energy()<=initialEnergy);
  }
  assert.equal(leftRebounds,1);
  assert.equal(rightRebounds,1);
  assert.ok(left.vx<heavy.vx && heavy.vx<right.vx);
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

  // A nearby partner can redirect an orb before its first partner has gone
  // even a pixel away. This is a fresh collision after a real physical gap.
  const close=approaching(2,.0065), [host,,guest]=close;
  for (const b of close) b.tempo=0;
  for (let i=0;i<84;i++) driftBubbles(close,1/240,3);
  const gap=(guest.x-host.x)*3-radii[0]-radii[2];
  assert.ok(gap>0 && gap<1/390);
  close.forEach(settleSurface);
  guest.vx=guest.dx=host.vx-.005;
  for (let i=0;i<90 && !surfaceIsMoving(guest);i++) driftBubbles(close,1/240,3);
  assert.ok(surfaceIsMoving(host) && surfaceIsMoving(guest));
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

test('a collision inside a delayed display frame advances the same ripple as individual physics ticks', async t => {
  const {driftBubbles,minerals} = await import('../today/public/roof/bubbles.js');
  const {paintSurface,outlineSegments} = await import('../today/public/roof/bubble-surface.js');
  let pixels;
  const context = {
    createImageData: (width,height) => ({width,data:new Uint8ClampedArray(width*height*4)}),
    putImageData: image => { pixels=Buffer.from(image.data); }
  };
  globalThis.document = {createElement: () => ({getContext: () => context})};
  t.after(() => { delete globalThis.document; });
  const rim=new Float32Array(outlineSegments).fill(1);
  const paint=orb=>{
    paintSurface({drawImage(){}},orb,90,rim,minerals.opal,0,false);
    return pixels;
  };
  for (const ticks of [4,6,12]) {
    const delayed=approaching(2,.04), regular=delayed.map(b=>({...b}));
    for (let i=0;i<ticks;i++) driftBubbles(regular,1/120,3);
    driftBubbles(delayed,ticks/120,3);
    for (const index of [0,2]) {
      // The same collision centres and membrane state must reach the same
      // optical sample on both the light body and the heavy one.
      const expected=paint(regular[index]), actual=paint(delayed[index]);
      let differing=0;
      for (let j=0;j<actual.length;j+=4) {
        if (actual[j]!==expected[j] || actual[j+1]!==expected[j+1] || actual[j+2]!==expected[j+2]) differing++;
      }
      assert.equal(differing,0,`${ticks} ticks, orb ${index}, ${differing} differing material samples`);
    }
  }
});
