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
