const { test } = require('node:test');
const assert = require('node:assert/strict');
const turn = () => new Promise(resolve => setImmediate(resolve));
const SITE = 'https://inflite.ai';
const baseEnv = () => ({
  HUB_KEY: 'hub-test-key', CHAT_ORIGIN: 'https://chat.inflite.ai', WEATHER_ORIGIN: 'https://weather.inflite.ai',
  FITNESS_ORIGIN: 'https://fitness.inflite.ai', MARKETS_ORIGIN: 'https://finance.inflite.ai',
});
const request = (path, init = {}) => new Request(SITE + path, { ...init, headers: {
  Origin: SITE, 'Sec-Fetch-Site': 'same-origin', ...init.headers,
} });

test('upstream deadline aborts a stalled binding once and cancels any late response body', async t => {
  const { fetchUpstream } = await import('../today/src/upstream.js');
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let calls = 0, signal, release, cancelled = false;
  const pending = fetchUpstream((url, init) => {
    calls++; signal = init.signal;
    return new Promise(resolve => { release = resolve; });
  }, 'https://weather.inflite.ai/api/weather/where', { method: 'POST', body: '{}' }, { timeout: 100 });
  const rejected = assert.rejects(pending, e => e.name === 'TimeoutError');
  await turn();
  t.mock.timers.tick(101);
  await rejected;
  assert.equal(signal.aborted, true);
  assert.equal(calls, 1, 'a write is never retried');
  release(new Response(new ReadableStream({ cancel() { cancelled = true; } })));
  await turn();
  assert.equal(cancelled, true, 'a late binding cannot leave its body running');
});

test('headers stop the deadline while range bodies remain streamed and caller cancellation stays connected', async t => {
  const { fetchUpstream } = await import('../today/src/upstream.js');
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const caller = new AbortController();
  let signal, stream;
  const response = new Response(new ReadableStream({ start(c) { stream = c; } }), {
    status: 206, headers: { 'Content-Type': 'audio/mp4', 'Content-Range': 'bytes 0-3/4' },
  });
  const result = await fetchUpstream((url, init) => { signal = init.signal; return response; },
    'https://chat.inflite.ai/api/pigeon/voice', {}, { signal: caller.signal, timeout: 100 });
  assert.equal(result, response);
  assert.equal(result.headers.get('content-range'), 'bytes 0-3/4');
  t.mock.timers.tick(1000);
  assert.equal(signal.aborted, false, 'a download is not cut off by the header deadline');
  stream.enqueue(new Uint8Array([0, 255, 128, 10])); stream.close();
  assert.deepEqual(new Uint8Array(await result.arrayBuffer()), new Uint8Array([0, 255, 128, 10]));
  caller.abort();
  assert.equal(signal.aborted, true);
});

test('cancelling before transport dispatch never calls the upstream', async () => {
  const { fetchUpstream } = await import('../today/src/upstream.js');
  const caller = new AbortController(); caller.abort();
  let called = false;
  await assert.rejects(fetchUpstream(() => { called = true; }, 'https://weather.inflite.ai/', {}, { signal: caller.signal }), e => e.name === 'AbortError');
  assert.equal(called, false);
});

test('hub caps every upload before forwarding and preserves binary bytes through the service binding', async () => {
  const { hub } = await import('../today/src/hub.js');
  const sent = [], env = { ...baseEnv(), APPS: { fetch: async req => {
    sent.push({ bytes: new Uint8Array(await req.arrayBuffer()), type: req.headers.get('content-type') });
    return Response.json({ ok: true });
  } } };
  const bytes = new Uint8Array([0, 255, 128, 195, 40, 13, 10]);
  const ok = await hub(request('/api/fitness/upload', { method: 'POST', body: bytes,
    headers: { 'Content-Type': 'application/octet-stream', 'Content-Length': String(bytes.length) } }), env, {});
  assert.equal(ok.status, 200);
  assert.deepEqual(sent, [{ bytes, type: 'application/octet-stream' }]);
  let cancelled = false;
  const oversized = new ReadableStream({ start(c) { c.enqueue(new Uint8Array(65537)); }, cancel() { cancelled = true; } });
  const tooBig = await hub(request('/api/weather/subscribe', { method: 'POST', body: oversized, duplex: 'half',
    headers: { 'Content-Length': '1' } }), env, {});
  assert.equal(tooBig.status, 413);
  assert.equal(tooBig.headers.get('cache-control'), 'no-store');
  assert.equal(sent.length, 1, 'none of the oversized upload reaches the app');
  assert.equal(cancelled, true);
});

test('hub and Mail return their safe failure when an upstream binding never sends headers', async t => {
  const { hub } = await import('../today/src/hub.js');
  const { mailRoof } = await import('../today/src/mailroof.js');
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const signals = [];
  const stalled = { fetch: req => { signals.push(req.signal); return new Promise(() => {}); } };
  const a = hub(request('/api/weather/where'), { ...baseEnv(), APPS: stalled }, {});
  const b = mailRoof(request('/mail/roof/mail.js'), { ROOF_MAIL: '1', MAIL_ORIGIN: 'https://email.inflite.ai', MAIL: stalled });
  await turn();
  t.mock.timers.tick(30001);
  for (const res of await Promise.all([a, b])) {
    assert.equal(res.status, 502);
    assert.equal(res.headers.get('cache-control'), 'no-store');
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
    assert.doesNotMatch(await res.text(), /TimeoutError|upstream took too long/);
  }
  assert.equal(signals.length, 2);
  assert.ok(signals.every(s => s.aborted));
});

test('hub keeps ranges streamed with the same headers and passes cancellation through APPS', async () => {
  const { hub } = await import('../today/src/hub.js');
  const caller = new AbortController();
  let signal, passedRange, stream;
  const env = { ...baseEnv(), APPS: { fetch: async req => {
    signal = req.signal; passedRange = req.headers.get('range');
    return new Response(new ReadableStream({ start(c) { stream = c; } }), {
      status: 206, headers: { 'Content-Type': 'audio/mp4', 'Content-Range': 'bytes 0-2/3', 'Accept-Ranges': 'bytes' },
    });
  } } };
  const res = await hub(request('/api/pigeon/voice', { signal: caller.signal, headers: { Range: 'bytes=0-2' } }), env, {});
  assert.equal(res.status, 206);
  assert.equal(passedRange, 'bytes=0-2');
  assert.equal(res.headers.get('content-range'), 'bytes 0-2/3');
  assert.equal(res.headers.get('accept-ranges'), 'bytes');
  stream.enqueue(new Uint8Array([0, 255, 128])); stream.close();
  assert.deepEqual(new Uint8Array(await res.arrayBuffer()), new Uint8Array([0, 255, 128]));
  caller.abort(); assert.equal(signal.aborted, true);
});

test('Mail version reads are byte bounded even with a falsely short length and expose only the build', async () => {
  const { mailRoof } = await import('../today/src/mailroof.js');
  let cancelled = false, body = () => Response.json({ build: '1.49', secret: 'never forwarded' });
  const env = { ROOF_MAIL: '1', MAIL_ORIGIN: 'https://email.inflite.ai', MAIL: { fetch: async req => {
    assert.equal(req.headers.get('cookie'), null); assert.equal(req.headers.get('authorization'), null);
    return body();
  } } };
  const req = () => request('/mail/version', { headers: { Cookie: 'account=secret', Authorization: 'Bearer secret' } });
  assert.deepEqual(await (await mailRoof(req(), env)).json(), { build: '1.49' });
  body = () => new Response(new ReadableStream({
    start(c) { c.enqueue(new TextEncoder().encode('{"build":"1.49","extra":"' + 'x'.repeat(4096))); },
    cancel() { cancelled = true; },
  }), { headers: { 'Content-Type': 'application/json', 'Content-Length': '1' } });
  const res = await mailRoof(req(), env);
  assert.equal(res.status, 502); assert.equal(cancelled, true);
});

test('Mail version body timeout cancels a stalled read after headers have arrived', async t => {
  const { mailRoof } = await import('../today/src/mailroof.js');
  const deadline = new AbortController();
  t.mock.method(AbortSignal, 'timeout', () => deadline.signal);
  let cancelled = false;
  const env = { ROOF_MAIL: '1', MAIL_ORIGIN: 'https://email.inflite.ai', MAIL: { fetch: async () =>
    new Response(new ReadableStream({ cancel() { cancelled = true; } }), { headers: { 'Content-Type': 'application/json' } }),
  } };
  const pending = mailRoof(request('/mail/version'), env);
  await turn(); deadline.abort(new DOMException('Timed out', 'TimeoutError'));
  assert.equal((await pending).status, 502);
  assert.equal(cancelled, true);
});

test('parallel foreground and background hub checks share one probe and ignore individual caller cancellation', async t => {
  const { hub, forgetProbe } = await import('../today/src/hub.js');
  forgetProbe(); t.after(forgetProbe);
  let probes = 0, release, signal;
  const gate = new Promise(resolve => { release = resolve; });
  const env = { ...baseEnv(), APPS: { fetch: async req => {
    if (!req.url.endsWith('/_hub/version')) return Response.json({ ok: true });
    probes++; signal = req.signal; await gate; return Response.json({ build: '1.70' });
  } } };
  const caller = new AbortController();
  const pending = Array.from({ length: 6 }, (_, i) => hub(request('/api/hub', i ? {} : { signal: caller.signal }), env, {}));
  const waits = [];
  assert.equal((await hub(request('/api/weather/where'), env, { waitUntil: p => waits.push(p) })).status, 200);
  await turn();
  assert.equal(probes, 1);
  caller.abort(); assert.equal(signal.aborted, false, 'a shared probe has its own deadline');
  release();
  for (const res of await Promise.all(pending)) assert.equal((await res.json()).ready, true);
  await Promise.all(waits);
  assert.equal((await (await hub(request('/api/hub'), env, {})).json()).ready, true);
  assert.equal(probes, 1);
});

test('probe deduplication separates keys and origins and releases successful entries for refresh', async t => {
  const { hub, forgetProbe } = await import('../today/src/hub.js');
  forgetProbe(); t.after(forgetProbe);
  let now = 1800000000000;
  t.mock.method(Date, 'now', () => now);
  const releases = [], seen = [];
  const env = { ...baseEnv(), CHAT_VIA: 'https://chat.inflite.ai', APPS: { fetch: req => {
    seen.push([req.headers.get('x-hub-key'), req.headers.get('origin')]);
    return new Promise(resolve => releases.push(() => resolve(Response.json({ build: '1.70' }))));
  } } };
  const otherKey = { ...env, HUB_KEY: 'another-key' }, otherOrigin = { ...env, CHAT_ORIGIN: 'https://other-chat.inflite.ai' };
  const pending = [env, env, otherKey, otherOrigin].map(e => hub(request('/api/hub'), e, {}));
  await turn();
  assert.deepEqual(seen, [
    ['hub-test-key', 'https://chat.inflite.ai'], ['another-key', 'https://chat.inflite.ai'],
    ['hub-test-key', 'https://other-chat.inflite.ai'],
  ]);
  releases.forEach(resolve => resolve()); await Promise.all(pending);
  now += 301000;
  const fresh = hub(request('/api/hub'), env, {});
  await turn(); assert.equal(seen.length, 4);
  releases[3](); assert.equal((await (await fresh).json()).ready, true);
});

test('a timed-out shared probe releases its pending entry and retains the existing negative-cache duration', async t => {
  const { hub, forgetProbe } = await import('../today/src/hub.js');
  forgetProbe(); t.after(forgetProbe);
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let now = 1800000000000, calls = 0;
  t.mock.method(Date, 'now', () => now);
  const env = { ...baseEnv(), APPS: { fetch: () => ++calls === 1 ? new Promise(() => {}) : Response.json({ build: '1.70' }) } };
  const pending = Array.from({ length: 6 }, () => hub(request('/api/hub'), env, {}));
  await turn(); t.mock.timers.tick(5001);
  for (const res of await Promise.all(pending)) assert.equal((await res.json()).ready, false);
  assert.equal(calls, 1);
  assert.equal((await (await hub(request('/api/hub'), env, {})).json()).ready, false);
  assert.equal(calls, 1, 'existing one-minute negative-cache policy retained');
  now += 61000;
  assert.equal((await (await hub(request('/api/hub'), env, {})).json()).ready, true);
  assert.equal(calls, 2, 'the failed in-flight entry cannot stick after cache expiry');
});

test('a forgotten pending probe cannot overwrite the newer result for the same configuration', async t => {
  const { hub, forgetProbe } = await import('../today/src/hub.js');
  forgetProbe(); t.after(forgetProbe);
  const releases = [];
  const env = { ...baseEnv(), APPS: { fetch: () => new Promise(resolve => releases.push(resolve)) } };
  const old = hub(request('/api/hub'), env, {});
  await turn(); forgetProbe();
  const fresh = hub(request('/api/hub'), env, {});
  await turn();
  releases[1](Response.json({ build: '1.70' }));
  assert.equal((await (await fresh).json()).ready, true);
  releases[0](new Response('Not found', { status: 404 }));
  assert.equal((await (await old).json()).ready, false);
  assert.equal((await (await hub(request('/api/hub'), env, {})).json()).ready, true);
  assert.equal(releases.length, 2, 'the fresh cache survives the older completion');
});
