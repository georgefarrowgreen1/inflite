// Execute Today's real notification workflows with controllable browser waits.
// The VM substitutes browser/account boundaries, not the workflow implementation.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const vm = require('node:vm');
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const cancelled = () => Object.assign(new Error('The account changed'), { name: 'AbortError', cancelled: true });
const copy = value => JSON.parse(JSON.stringify(value));
const sub = endpoint => ({ endpoint, toJSON() { return { endpoint, keys: { p256dh: 'sample', auth: 'sample' } }; } });
const digest = () => Uint8Array.from({ length: 32 }, () => 7).buffer;
async function until(predicate) {
  for (let i = 0; i < 40; i++) { if (predicate()) return; await new Promise(setImmediate); }
  assert.fail('the expected browser/account boundary was not reached');
}
async function quiet(promise) {
  try { return await promise; } catch (error) { if (error?.name === 'AbortError' || error?.cancelled) return null; throw error; }
}

function host(t, options = {}) {
  const calls = [], browser = { permissions: 0, lookups: 0, subscriptions: 0, hashes: 0 }, toasts = [], timers = new Set();
  const storage = new Map([['today:push', 'https://push.test/old-a']]);
  let controller = new AbortController(), generation = 0;
  const S = { view: { user: { id: 'a' }, push: { on: true, every: false }, hubPush: true },
    morning: { on: false, at: 420, devices: 1, thisDevice: false }, device: 'device-a', endpoint: 'https://push.test/state-a', hub: true };
  const subscription = sub('https://push.test/current');
  const manager = {
    getSubscription: () => { browser.lookups++; return Promise.resolve(options.lookup ? options.lookup(browser.lookups) : subscription); },
    subscribe: data => { browser.subscriptions++; browser.subscriptionOptions = data; return Promise.resolve(options.subscribe ? options.subscribe() : subscription); },
  };
  const registration = { pushManager: manager };
  const requests = { get signal() { return controller.signal; }, get generation() { return generation; } };
  const sandbox = {
    S, requests, Promise, AbortController, AbortSignal, DOMException, TextEncoder, Uint8Array, Date,
    navigator: { serviceWorker: { ready: options.ready || Promise.resolve(registration), getRegistration: () => Promise.resolve(registration) } },
    Notification: {
      permission: options.permission || 'granted',
      requestPermission: () => { browser.permissions++; return Promise.resolve(options.requestPermission ? options.requestPermission() : 'granted'); },
    },
    crypto: { subtle: { digest: () => { browser.hashes++; return Promise.resolve(options.hash ? options.hash(browser.hashes) : digest()); } } },
    localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, String(value)), removeItem: key => storage.delete(key) },
    setTimeout(fn, delay) { const timer = setTimeout(fn, delay); timer.unref(); timers.add(timer); return timer; },
    clearTimeout(timer) { clearTimeout(timer); timers.delete(timer); },
    canPush: () => true, pushWhy: () => null, browserTz: () => 'Europe/London',
    drawMorning() {}, toast: text => toasts.push(text),
    missing: error => error?.status === 404 || error?.status === 501,
    isRequestCancelled: error => error?.name === 'AbortError' || error?.cancelled === true,
    b64url: bytes => Buffer.from(bytes).toString('base64url'),
    atob: value => Buffer.from(value, 'base64').toString('binary'),
    async call(path, settings = {}) {
      const signal = settings.signal || controller.signal;
      if (signal.aborted) throw signal.reason || cancelled();
      const entry = { path, method: settings.method || 'GET', body: settings.body == null ? null : copy(settings.body), owner: S.view?.user?.id };
      calls.push(entry);
      const work = Promise.resolve().then(() => options.call ? options.call(entry) : path === '/api/push/key' ? { key: 'AQID' }
        : path.startsWith('/api/devices?') ? { here: [] } : path === '/api/morning' ? { on: true, at: 420, devices: 1, thisDevice: true } : { ok: true });
      let abort;
      try {
        return await Promise.race([work, new Promise((_, reject) => {
          abort = () => reject(signal.reason || cancelled()); signal.addEventListener('abort', abort, { once: true });
        })]);
      } finally { signal.removeEventListener('abort', abort); }
    },
  };
  t.after(() => { controller.abort(cancelled()); for (const timer of timers) clearTimeout(timer); });
  const source = readFileSync(resolve(__dirname, '../today/public/app.js'), 'utf8');
  const morning = source.indexOf('async function putMorning('), scope = source.indexOf('function pushScope(');
  const start = scope >= 0 && scope < morning ? scope : morning;
  const end = source.indexOf("// (the morning's settings: a sheet", start);
  assert.ok(start > 0 && end > start, 'execute the real notification workflow section');
  vm.runInNewContext(source.slice(start, end) + '\nglobalThis.push = { putMorning, findDevice, postDevice, subscribe, ownSub, kept, turnOn, turnOff, fanOut, syncPush, deviceMoved };', sandbox);
  function switchAccount({ pushOn = false, every = false } = {}) {
    controller.abort(cancelled()); controller = new AbortController(); generation++;
    S.view = { user: { id: 'b' }, push: { on: pushOn, every }, hubPush: true };
    S.morning = { on: pushOn, at: 480, devices: 2, thisDevice: false };
    S.device = 'device-b'; S.endpoint = 'https://push.test/state-b';
    storage.set('today:push', 'https://push.test/marker-b'); storage.set('today:push-off', 'b');
    return snapshot();
  }
  function snapshot() { return { state: copy(S), storage: [...storage.entries()] }; }
  return { ...sandbox.push, S, calls, browser, storage, toasts, registration, subscription, switchAccount, snapshot };
}

for (const boundary of ['permission', 'worker', 'lookup', 'key', 'subscription']) test(`turnOn cannot adopt account B after account A waits for ${boundary}`, async t => {
  const wait = deferred();
  const options = boundary === 'permission' ? { permission: 'default', requestPermission: () => wait.promise }
    : boundary === 'worker' ? { ready: wait.promise }
    : boundary === 'lookup' ? { lookup: () => wait.promise }
    : boundary === 'key' ? { lookup: () => null, call: entry => entry.path === '/api/push/key' ? wait.promise : { ok: true } }
    : { lookup: () => null, subscribe: () => wait.promise };
  const h = host(t, options), pending = quiet(h.turnOn());
  await until(() => boundary === 'permission' ? h.browser.permissions === 1 : boundary === 'worker' ? true : boundary === 'lookup' ? h.browser.lookups === 1 : boundary === 'key' ? h.calls.length === 1 : h.browser.subscriptions === 1);
  const before = h.switchAccount(), callsBefore = h.calls.length, toastsBefore = h.toasts.length;
  wait.resolve(boundary === 'permission' ? 'granted' : boundary === 'worker' ? h.registration : boundary === 'key' ? { key: 'AQID' } : h.subscription);
  await pending;
  assert.equal(h.calls.length, callsBefore, 'no request starts under the replacement account');
  assert.deepEqual(h.snapshot(), before, 'the replacement account and its local settings are untouched');
  assert.equal(h.toasts.length, toastsBefore, 'cancellation does not show an obsolete error');
  if (boundary === 'key') assert.equal(h.browser.subscriptions, 0, 'the stale key cannot create a subscription');
});

for (const empty of [false, true]) test(`turnOff cancels a delayed ${empty ? 'empty' : 'existing'} subscription lookup without changing B`, async t => {
  const wait = deferred(), h = host(t, { lookup: () => wait.promise }), pending = quiet(h.turnOff());
  await until(() => h.browser.lookups === 1);
  const before = h.switchAccount(); wait.resolve(empty ? null : h.subscription); await pending;
  assert.deepEqual(h.calls, [], 'a stale lookup must not start a DELETE');
  assert.deepEqual(h.snapshot(), before, 'B retains its push marker and device-off preference');
  assert.deepEqual(h.toasts, []);
});

for (const boundary of ['lookup', 'subscription']) test(`fanOut cancels across an account change during ${boundary}`, async t => {
  const wait = deferred(), h = host(t, boundary === 'lookup' ? { lookup: () => wait.promise } : { lookup: () => null, subscribe: () => wait.promise });
  const pending = quiet(h.fanOut());
  await until(() => boundary === 'lookup' ? h.browser.lookups === 1 : h.browser.subscriptions === 1);
  const before = h.switchAccount(), callsBefore = h.calls.length;
  wait.resolve(h.subscription); await pending;
  assert.equal(h.calls.length, callsBefore);
  assert.deepEqual(h.snapshot(), before, 'the old fan-out request cannot enable every-app notifications for B');
  assert.deepEqual(h.toasts, []);
});

test('syncPush keeps deduplication and throttling within one account, including late cleanup', async t => {
  const first = deferred(), second = deferred();
  const h = host(t, { lookup: n => n === 1 ? first.promise : second.promise });
  const a = h.syncPush({ force: true }), endedA = quiet(a);
  await until(() => h.browser.lookups === 1);
  h.switchAccount({ pushOn: true }); h.storage.delete('today:push-off');
  const b = h.syncPush(), endedB = quiet(b);
  await until(() => h.browser.lookups === 2);
  assert.notEqual(a, b, 'B must not join A’s pending browser read or throttle window');
  assert.equal(h.syncPush({ force: true }), b, 'B’s concurrent refresh shares its own in-flight work');
  first.resolve(h.subscription); await endedA;
  assert.equal(h.syncPush({ force: true }), b, 'A’s finally handler must not clear B’s in-flight record');
  second.resolve(h.subscription); await endedB;
  assert.ok(h.calls.length > 0);
  assert.ok(h.calls.every(entry => entry.owner === 'b'));
  assert.equal(h.calls.filter(entry => entry.method === 'POST').length, 1);
  assert.equal(h.S.morning.thisDevice, true);
  assert.equal(h.storage.get('today:push'), h.subscription.endpoint);
});

for (const operation of ['kept', 'findDevice', 'deviceMoved']) test(`${operation} cannot write B’s device state after A’s pending hash`, async t => {
  const wait = deferred(), h = host(t, { hash: () => wait.promise });
  const pending = quiet(operation === 'kept' ? h.kept(h.subscription) : h[operation]());
  await until(() => h.browser.hashes === 1);
  const before = h.switchAccount(), callsBefore = h.calls.length;
  wait.resolve(digest()); await pending;
  assert.equal(h.calls.length, callsBefore);
  assert.deepEqual(h.snapshot(), before, 'the old digest cannot overwrite endpoint, device ID or stored subscription');
});

test('deviceMoved cannot register B after A’s delayed subscription lookup', async t => {
  const wait = deferred(), h = host(t, { lookup: () => wait.promise }), pending = quiet(h.deviceMoved());
  await until(() => h.browser.lookups === 1);
  const before = h.switchAccount(); wait.resolve(h.subscription); await pending;
  assert.deepEqual(h.calls, []);
  assert.deepEqual(h.snapshot(), before);
});

test('turnOn preserves subscription creation, device registration and morning settings', async t => {
  const h = host(t, { permission: 'default', lookup: () => null });
  h.storage.set('today:push-off', 'a');
  assert.equal(await h.turnOn(), true);
  assert.deepEqual(h.calls.map(entry => [entry.path, entry.method]), [['/api/push/key', 'GET'], ['/api/device', 'POST'], ['/api/morning', 'PUT']]);
  assert.equal(h.browser.permissions, 1); assert.equal(h.browser.subscriptions, 1);
  assert.equal(h.browser.subscriptionOptions.userVisibleOnly, true);
  assert.equal(h.calls[1].body.tz, 'Europe/London'); assert.equal(h.calls[1].body.sub.endpoint, h.subscription.endpoint);
  assert.equal(h.calls[2].body.on, true); assert.equal(h.calls[2].body.device.length, 16);
  assert.equal(h.S.view.push.on, true); assert.equal(h.S.morning.on, true);
  assert.equal(h.storage.get('today:push'), h.subscription.endpoint); assert.equal(h.storage.has('today:push-off'), false);
});

test('the older device API fallback still registers morning-only notifications', async t => {
  const h = host(t, { call(entry) { if (entry.path === '/api/device') throw Object.assign(new Error('Not found'), { status: 404 }); return entry.path === '/api/morning' ? { on: true, at: 420, devices: 1 } : { ok: true }; } });
  assert.equal(await h.turnOn(), true);
  assert.deepEqual(h.calls.map(entry => [entry.path, entry.method]), [['/api/device', 'POST'], ['/api/push', 'POST'], ['/api/morning', 'PUT']]);
  assert.equal(h.calls[1].body.fan, undefined);
});

test('fanOut preserves explicit fan registration and never silently falls back to morning-only', async t => {
  const h = host(t); await h.fanOut();
  assert.equal(h.calls.length, 1); assert.equal(h.calls[0].path, '/api/device'); assert.equal(h.calls[0].body.fan, true);
  assert.equal(h.S.view.push.every, true);
  const unavailable = host(t, { call() { throw Object.assign(new Error('Not found'), { status: 404 }); } });
  await assert.rejects(unavailable.fanOut(), error => error.status === 404);
  assert.deepEqual(unavailable.calls.map(entry => entry.path), ['/api/device']);
});

test('turnOff retains its older DELETE fallback and updates only the current account', async t => {
  const h = host(t, { call(entry) { if (entry.path === '/api/device') throw Object.assign(new Error('Not found'), { status: 404 }); return { on: false }; } });
  assert.equal(await h.turnOff(), true);
  assert.deepEqual(h.calls.map(entry => [entry.path, entry.method]), [['/api/device', 'DELETE'], ['/api/push', 'DELETE']]);
  assert.equal(h.storage.has('today:push'), false); assert.equal(h.storage.get('today:push-off'), 'a');
  assert.equal(h.S.view.push.on, false); assert.equal(h.S.morning.thisDevice, false);
});

test('deviceMoved preserves the legacy move endpoint before replacing its saved subscription', async t => {
  const h = host(t, { call(entry) { if (entry.path === '/api/device') throw Object.assign(new Error('Not found'), { status: 404 }); return { moved: true }; } });
  await h.deviceMoved();
  assert.deepEqual(h.calls.map(entry => entry.path), ['/api/device', '/api/push/move']);
  assert.equal(h.calls[1].body.was, 'https://push.test/old-a'); assert.equal(h.storage.get('today:push'), h.subscription.endpoint);
});
