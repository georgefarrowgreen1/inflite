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
