const test = require('node:test');
const assert = require('node:assert/strict');

test('the wallpaper retains its display pixels across a touch and resizes within its canvas budget', async () => {
  const {sizeBubbleCanvas} = await import('../today/public/roof/bubbles.js');
  const previous = global.window;
  global.window = {devicePixelRatio:3};
  try {
    let w = 0, h = 0, resizes = 0;
    const canvas = {
      get width() {return w;}, set width(value) {w=value; resizes++;},
      get height() {return h;}, set height(value) {h=value; resizes++;},
    };
    sizeBubbleCanvas(canvas,390,844);
    assert.deepEqual([w,h,resizes],[1170,2532,2]);
    // A cached entry module can still pass the former interaction flag.
    sizeBubbleCanvas(canvas,390,844,true);
    sizeBubbleCanvas(canvas,390,844,false);
    assert.deepEqual([w,h,resizes],[1170,2532,2]);
    sizeBubbleCanvas(canvas,5120,2880);
    assert.ok(w*h <= 3840*2160);
    assert.equal(w/h,16/9);
  } finally {
    if (previous === undefined) delete global.window;
    else global.window = previous;
  }
});
