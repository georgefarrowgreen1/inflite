const { test } = require('node:test');
const assert = require('node:assert/strict');
const load = () => import('../today/public/roof/tasks.js');

test('an account reset cancels deferred refreshes and idle starts without affecting the new account', async t => {
  const { createTaskScope } = await load();
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const account = new AbortController(), old = createTaskScope(account.signal), seen = [];
  old.timeout(() => seen.push('old refresh'), 5000);
  old.idle(() => seen.push('old service'));
  account.abort();
  const fresh = createTaskScope(new AbortController().signal);
  fresh.timeout(() => seen.push('new refresh'), 5000);
  t.mock.timers.tick(90000);
  assert.deepEqual(seen, ['new refresh']);
  assert.equal(old.active, false);
  old.timeout(() => seen.push('late old work'), 0);
  t.mock.timers.tick(1);
  assert.deepEqual(seen, ['new refresh']);
  fresh.dispose();
});

test('individual cancellation and disposal are idempotent, including work scheduled by a callback', async t => {
  const { createTaskScope } = await load();
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const scope = createTaskScope(), seen = [];
  const cancel = scope.timeout(() => seen.push('cancelled'), 5);
  cancel(); cancel();
  scope.timeout(() => {
    seen.push('first');
    scope.timeout(() => seen.push('second'), 100);
    scope.dispose();
  }, 10);
  t.mock.timers.tick(1000);
  scope.dispose();
  assert.deepEqual(seen, ['first']);
});

test('native idle callbacks are cancelled and a callback already queued by the browser remains inert', async t => {
  const { createTaskScope } = await load();
  const original = { request: global.requestIdleCallback, cancel: global.cancelIdleCallback };
  t.after(() => {
    for (const [key, value] of [['requestIdleCallback', original.request], ['cancelIdleCallback', original.cancel]]) {
      if (value === undefined) delete global[key]; else global[key] = value;
    }
  });
  let run, cancelled;
  global.requestIdleCallback = (fn, options) => { run = fn; assert.equal(options.timeout, 3000); return 17; };
  global.cancelIdleCallback = id => { cancelled = id; };
  const controller = new AbortController(), scope = createTaskScope(controller.signal);
  let calls = 0;
  scope.idle(() => calls++);
  controller.abort(); run();
  assert.equal(cancelled, 17);
  assert.equal(calls, 0);
});

test('a pre-aborted lifetime never registers timers or idle work', async t => {
  const { createTaskScope } = await load();
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const controller = new AbortController(); controller.abort();
  const scope = createTaskScope(controller.signal);
  scope.timeout(() => assert.fail('aborted timer ran'), 0);
  scope.idle(() => assert.fail('aborted idle callback ran'));
  t.mock.timers.tick(10000);
  assert.equal(scope.active, false);
});
