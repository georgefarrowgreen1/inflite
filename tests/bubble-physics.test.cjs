const { test } = require('node:test');
const assert = require('node:assert/strict');
const load = () => import('../today/public/roof/bubbles.js');

// The original saved-scene format predates contact deformation.
const scene = () => [[.4,.5],[.65,.5],[.12,.15],[.9,.85]].map(([x,y]) => ({
  x, y, vx:0, vy:0, dx:0, dy:0, phase:0, angle:0, tempo:.05, turn:60
}));

test('overlapping bubbles part gently in proportion to their masses, even with coincident centres', async () => {
  const {driftBubbles,validBubbleScene} = await load();
  for (const coincident of [false,true]) {
    const bodies = scene();
    if (coincident) bodies[1].x = bodies[0].x;
    const initialGap = Math.abs(bodies[0].x-bodies[1].x);
    assert.ok(validBubbleScene(bodies));
    driftBubbles(bodies,1/30,1);
    const speeds = bodies.map(b => Math.hypot(b.vx,b.vy));
    assert.ok(speeds[1] > speeds[0] && speeds[0] > 0);
    assert.ok(speeds[1] < .001, 'first contact should ease in');
    assert.ok(bodies[0].strainX || bodies[0].strainY);
    for (let i=0; i<300; i++) driftBubbles(bodies,1/30,1);
    assert.ok(Math.hypot(bodies[0].x-bodies[1].x,bodies[0].y-bodies[1].y) > initialGap + .04);
    assert.ok(validBubbleScene(JSON.parse(JSON.stringify(bodies))));
  }
});

test('a tap pushes only the hit surface and the deformation relaxes', async () => {
  const {driftBubbles,validBubbleScene} = await load();
  const bodies = scene();
  const tap = {x:.42,y:.5,tap:true,strength:1};
  const hit = driftBubbles(bodies,.05,2.4,tap);
  assert.equal(hit.index,0);
  assert.ok(bodies[0].vx < -.01);
  assert.ok(bodies[0].strainX > .07);
  assert.equal(bodies[1].vx,0);
  for (let i=0; i<90; i++) driftBubbles(bodies,1/30,2.4);
  assert.ok(Math.abs(bodies[0].strainX) < .002);
  assert.ok(validBubbleScene(bodies));
  assert.equal(driftBubbles(bodies,.05,2.4,{...tap,x:.98,y:.02}),null);
});

test('a flick carries its original orb through release with size-dependent travel and off-centre roll', async () => {
  const {driftBubbles,validBubbleScene} = await load();
  function flick(index,offset,speed=2,hz=60) {
    const bodies = scene();
    const radius = [.30,.165,.082,.037][index];
    bodies.forEach((b,i) => { b.x = [.14,.46,.76,.93][i]; b.y = .5; });
    const b = bodies[index], start = b.x;
    const brush = {stroke:1,originX:b.x,originY:.5+radius*offset,strength:1};
    driftBubbles(bodies,0,3,{...brush,x:brush.originX,y:brush.originY,down:true});
    // A quick brush can end beyond the edge in the gap between orbs.
    driftBubbles(bodies,0,3,{...brush,x:b.x+radius*.45,y:.5,release:true,flickX:speed,flickY:0});
    for (let frame=0; frame<hz/2; frame++) driftBubbles(bodies,1/hz,3);
    assert.ok(validBubbleScene(JSON.parse(JSON.stringify(bodies))));
    return {travel:b.x-start,angle:b.angle};
  }
  const large = flick(0,-.5), small = flick(2,-.5);
  assert.ok(large.travel > .015 && small.travel > large.travel);
  assert.ok(large.angle > .15 && flick(0,.5).angle < -.15);
  assert.equal(flick(0,0).angle,0);
  assert.ok(flick(0,-.5,-2).travel < -.015);
  assert.ok(Math.abs(flick(0,-.5,2,30).travel-flick(0,-.5,2,120).travel) < .0001);
});

test('the release samples the last brush velocity and leaves vertical touch scrolling to the page', async () => {
  const {bubbleMotion} = await import('../today/public/roof/bubble-motion.js');
  const window = new EventTarget();
  let time=0, frame, input;
  const create = require('node:vm').runInNewContext('('+bubbleMotion.toString()+')', {
    window, performance:{now:()=>time}, requestAnimationFrame(cb){frame=cb;return 1;},
    cancelAnimationFrame(){frame=null;}, clearTimeout, setTimeout(){return 0;}
  });
  const control = create({getBoundingClientRect:()=>({left:0,top:0,width:400,height:800})},
    (dt,pointer)=>{input=pointer;return false;});
  control('live');
  function touch(type,t,x,y,delivered=t) {
    time=delivered;
    const point = {identifier:9,clientX:x,clientY:y};
    const event = Object.defineProperty(new Event(type),'timeStamp',{value:t});
    window.dispatchEvent(Object.assign(event,{
      touches:type==='touchend'?[]:[point],changedTouches:[point],
    }));
  }
  touch('touchstart',5,100,100); touch('touchmove',25,120,100,90); touch('touchend',45,140,100,90);
  frame(time);
  assert.equal(input.originX,.25); assert.equal(input.originY,.125); assert.equal(input.flickX,2.5);
  touch('touchstart',100,100,100); touch('touchmove',120,140,100); touch('touchend',320,140,100);
  frame(time);
  assert.ok(input.release && !input.flickX && !input.tap);
  touch('touchstart',400,100,100); touch('touchmove',420,102,130); touch('touchend',440,103,160);
  frame(time);
  assert.equal(input,null);
  control('off');
});

test('active feedback paints every refresh at 60, 120, 144 and 240 Hz', async () => {
  const {bubbleMotion} = await import('../today/public/roof/bubble-motion.js');
  const vm = require('node:vm');
  for (const hz of [60,120,144,240]) {
    let pending, frames = 0;
    const scheduler = vm.runInNewContext('('+bubbleMotion.toString()+')', {
      window: new EventTarget(), performance:{now:()=>0},
      requestAnimationFrame(callback) { pending = callback; return 1; },
      cancelAnimationFrame() { pending = null; }, clearTimeout,
    });
    const setMode = scheduler({},() => { frames++; return true; });
    setMode('live');
    for (let i=1; i<=hz; i++) {
      const callback = pending;
      pending = null;
      callback(1000*i/hz);
    }
    assert.equal(frames,hz+1);
    setMode('off');
    assert.equal(pending,null);
  }
});
