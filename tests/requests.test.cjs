const { test } = require('node:test');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const { resolve } = require('node:path');
const modulePromise = import(pathToFileURL(resolve(__dirname, '../today/public/roof/requests.js')));
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const response = (data, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => data });
const tick = async () => { await Promise.resolve(); await Promise.resolve(); };
async function coordinator(fetch, options = {}) { return (await modulePromise).createRequestCoordinator({ origin: 'https://inflite.test', fetch, ...options }); }
const cancelled = e => e.cancelled === true && e.name === 'AbortError';

test('concurrent identical reads share a transport, have independent JSON, and are never cached after completion', async () => {
  let calls = 0;
  const c = await coordinator(async () => { calls++; return response({ prefs: { hidden: [] } }); });
  const [a, b] = await Promise.all([c.request('/api/prefs'), c.request('/api/prefs')]);
  assert.equal(calls, 1); a.prefs.hidden.push('weather'); assert.deepEqual(b.prefs.hidden, []);
  await c.request('/api/prefs'); assert.equal(calls, 2);
});

test('one cancelled subscriber does not cancel another subscriber’s read', async () => {
  const wait = deferred(); let transport;
  const c = await coordinator((_, o) => { transport = o.signal; return wait.promise; });
  const controller = new AbortController();
  const a = c.request('/api/today', { signal: controller.signal }), b = c.request('/api/today');
  const rejected = assert.rejects(a, cancelled); await tick(); controller.abort(); await rejected;
  assert.equal(transport.aborted, false);
  wait.resolve(response({ day: 1 })); assert.deepEqual(await b, { day: 1 });
});

test('the last cancellation aborts transport and its late cleanup cannot remove a replacement read', async () => {
  const waits = [deferred(), deferred()]; const signals = []; let calls = 0;
  const c = await coordinator((_, o) => { signals.push(o.signal); return waits[calls++].promise; });
  const controller = new AbortController(), a = c.request('/api/today', { signal: controller.signal });
  const rejected = assert.rejects(a, cancelled); await tick(); controller.abort(); await rejected;
  assert.equal(signals[0].aborted, true);
  const b = c.request('/api/today'); await tick(); waits[0].resolve(response({ old: true })); await tick();
  const joined = c.request('/api/today'); waits[1].resolve(response({ fresh: true }));
  assert.deepEqual(await b, { fresh: true }); assert.deepEqual(await joined, { fresh: true }); assert.equal(calls, 2);
});

test('deadlines cover response-body reading and never retry writes with an uncertain outcome', async () => {
  let calls = 0, signal;
  const c = await coordinator(async (_, o) => { calls++; signal = o.signal; return { ok: true, status: 200, json: () => new Promise(() => {}) }; }, { timeoutMs: 15 });
  await assert.rejects(c.request('/api/today'), e => e.timeout === true && !e.cancelled && e.status === 0);
  assert.equal(signal.aborted, true);
  await assert.rejects(c.request('/api/act', { method: 'POST', body: { id: 'one' } }), e => e.timeout === true && /Refresh to check/.test(e.message));
  assert.equal(calls, 2);
});

test('reset aborts reads and writes, ignores old 401s, and allows new account reads', async () => {
  const waits = [deferred(), deferred()]; let calls = 0; const signals = [];
  const c = await coordinator((_, o) => { signals.push(o.signal); return calls < 2 ? waits[calls++].promise : Promise.resolve(response({ account: 'new' })); });
  const a = c.request('/api/today'), b = c.request('/api/prefs', { method: 'PUT', body: {} });
  const rejects = [assert.rejects(a, cancelled), assert.rejects(b, cancelled)]; await tick();
  const before = c.generation; c.reset(); assert.equal(c.generation, before + 1);
  await Promise.all(rejects); assert.ok(signals.every(s => s.aborted));
  waits[0].resolve(response({ error: 'Old account' }, 401)); waits[1].resolve(response({ prefs: 'old' }));
  assert.deepEqual(await c.request('/api/today'), { account: 'new' });
});

test('latest logical read cancels an older query and stale HTTP errors do not escape', async () => {
  const waits = [deferred(), deferred()]; let calls = 0;
  const c = await coordinator(() => waits[calls++].promise);
  const a = c.request('/api/today?only=weather', { latestKey: 'today' }); const rejected = assert.rejects(a, cancelled); await tick();
  const b = c.request('/api/today?v=2', { latestKey: 'today' }); await tick();
  waits[0].resolve(response({ error: 'Old session' }, 401)); waits[1].resolve(response({ at: 2 }));
  await rejected; assert.deepEqual(await b, { at: 2 }); assert.equal(calls, 2);
});

test('fresh reads replace old transports while distinct URLs and headers remain independent', async () => {
  const wait = deferred(); let calls = 0;
  const c = await coordinator(async () => ++calls === 1 ? wait.promise : response({ n: calls }));
  const a = c.request('/api/today'); const rejected = assert.rejects(a, cancelled); await tick();
  const b = c.request('/api/today', { fresh: true }); await rejected; await b;
  wait.resolve(response({ n: 1 }));
  await Promise.all([c.request('/api/today?a=1'), c.request('/api/today?a=2'), c.request('/api/today?a=1', { headers: { 'X-Home-Screen': '1' } })]);
  assert.equal(calls, 5);
});

test('writes are sent separately with the existing credentials and CSRF headers', async () => {
  const sent = [];
  const c = await coordinator(async (url, o) => { sent.push({ url, ...o }); return response({ error: 'No' }, 503); });
  await Promise.all([1, 2].map(() => assert.rejects(c.request('/api/prefs', { method: 'PUT', body: { hidden: [] } }), e => e.status === 503)));
  assert.equal(sent.length, 2);
  for (const o of sent) {
    assert.equal(o.credentials, 'same-origin'); assert.equal(o.cache, 'no-store');
    assert.equal(o.headers.get('X-Inflite'), '1'); assert.equal(o.headers.get('Content-Type'), 'application/json');
    assert.deepEqual(JSON.parse(o.body), { hidden: [] });
  }
});

test('reads requested after a write do not join a transport created before that write', async () => {
  const old = deferred(); let reads = 0;
  const c = await coordinator(async (_, o) => o.method === 'GET' ? (++reads === 1 ? old.promise : response({ prefs: 'new' })) : response({ saved: true }));
  const a = c.request('/api/prefs'); const rejected = assert.rejects(a, cancelled); await tick();
  await c.request('/api/prefs', { method: 'PUT', body: {} });
  assert.deepEqual(await c.request('/api/prefs'), { prefs: 'new' }); await rejected;
  old.resolve(response({ prefs: 'old' })); assert.equal(reads, 2);
});

test('HTTP errors retain status/field, network failures remain offline, and explicit retries make a new request', async () => {
  let calls = 0;
  const c = await coordinator(async () => { calls++; if (calls === 1) throw new TypeError('Network'); return calls === 2 ? response({ error: 'Invalid', field: 'time' }, 400) : response(null, 204); });
  await assert.rejects(c.request('/api/session'), e => e.status === 0 && e.offline);
  await assert.rejects(c.request('/api/session'), e => e.status === 400 && e.field === 'time' && e.message === 'Invalid');
  assert.equal(await c.request('/api/session'), null); assert.equal(calls, 3);
});

test('pre-aborted requests, foreign origins and invalid deadlines never reach the network', async () => {
  let calls = 0; const c = await coordinator(async () => { calls++; return response({}); });
  const controller = new AbortController(); controller.abort();
  await assert.rejects(c.request('/api/session', { signal: controller.signal }), cancelled);
  await assert.rejects(c.request('https://other.test/api/session'), TypeError);
  await assert.rejects(c.request('/api/session', { timeoutMs: 0 }), TypeError);
  assert.equal(calls, 0);
});

test('captured screen signals cannot start new requests after reset; new-scope work survives abort callbacks', async () => {
  let calls = 0;
  const c = await coordinator(async () => { calls++; return response({ current: true }); });
  const oldSignal = c.signal;
  let fresh;
  oldSignal.addEventListener('abort', () => { fresh = c.request('/api/session', { signal: c.signal }); });
  c.reset();
  await assert.rejects(c.request('/api/notify', { signal: oldSignal }), cancelled);
  assert.deepEqual(await fresh, { current: true }); assert.equal(calls, 1);
});
