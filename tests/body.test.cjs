const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');

test('Mail release probes reach the Worker instead of the SPA fallback', async () => {
  const config = JSON.parse(readFileSync(resolve(__dirname, '../email/wrangler.jsonc'), 'utf8').replace(/^\s*\/\/.*$/gm, ''));
  assert.equal(config.assets.run_worker_first, true);
  const { default: worker } = await import('../email/src/index.js');
  const response = await worker.fetch(new Request('https://email.inflite.ai/version'), {
    CF_VERSION_METADATA: { id: 'release-test' },
    ASSETS: { fetch: async () => new Response('const BUILD = "1.74";') },
  }, {});
  assert.match(response.headers.get('content-type'), /application\/json/);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await response.json(), { app: 'mail', build: '1.74', min: null });
});

function streamRequest(chunks, length) {
  let reads = 0, cancelled = false;
  const body = new ReadableStream({
    pull(c) { reads++; chunks.length ? c.enqueue(new TextEncoder().encode(chunks.shift())) : c.close(); },
    cancel() { cancelled = true; },
  }, { highWaterMark: 0 });
  return { headers: new Headers(length === undefined ? {} : { 'Content-Length': length }), body,
    get reads() { return reads; }, get cancelled() { return cancelled; } };
}

test('Today caps bytes, including split UTF-8, and stops oversized chunked uploads', async () => {
  const { bodyUpTo } = await import('../today/src/body.js');
  assert.equal(await bodyUpTo(streamRequest(['é', '🙂']), 6), 'é🙂');
  const request = streamRequest(['1234', '5678', 'never read']);
  assert.equal(await bodyUpTo(request, 7), null);
  assert.equal(request.reads, 2);
  assert.equal(request.cancelled, true);
  for (const length of ['8', 'invalid', '-1']) {
    const request = streamRequest(['never read'], length);
    assert.equal(await bodyUpTo(request, 7), null);
    assert.equal(request.reads, 0);
  }
});

test('the same body limit preserves binary uploads and counts a falsely short declared length', async () => {
  const { bodyUpTo } = await import('../today/src/body.js');
  const bytes = new Uint8Array([0, 255, 128, 195, 40, 13, 10]);
  const request = new Request('https://inflite.ai/api/fitness/upload', { method: 'POST', body: bytes });
  assert.deepEqual(await bodyUpTo(request, bytes.length, { raw: true }), bytes);
  const short = streamRequest(['1234', '5678', 'never read'], '1');
  assert.equal(await bodyUpTo(short, 7, { raw: true }), null);
  assert.equal(short.cancelled, true);
  assert.equal(short.reads, 2);
});

test('cancelling a request releases a pending body read', async () => {
  const { bodyUpTo } = await import('../today/src/body.js');
  const controller = new AbortController();
  let cancelled = false;
  const body = new ReadableStream({ cancel() { cancelled = true; } });
  const request = { headers: new Headers(), body, signal: controller.signal };
  const pending = bodyUpTo(request, 64, { raw: true });
  const rejected = assert.rejects(pending, e => e.name === 'AbortError');
  controller.abort();
  await rejected;
  assert.equal(cancelled, true);
  assert.equal(body.locked, false);
});

test('oversized Today settings and bug reports never reach the account service', async () => {
  const { default: worker } = await import('../today/src/index.js');
  let forwarded = 0;
  const env = { ACCOUNT_ORIGIN: 'https://account.inflite.ai', APPS: { fetch() { forwarded++; throw new Error('must not forward'); } } };
  for (const [path, method, size] of [['/api/prefs', 'PUT', 65537], ['/api/bugs', 'POST', 36001]]) {
    const source = streamRequest(['x'.repeat(size), 'never read']);
    const request = new Request('https://inflite.ai' + path, { method, body: source.body, duplex: 'half',
      headers: { Origin: 'https://inflite.ai', 'Sec-Fetch-Site': 'same-origin', 'X-Inflite': '1' } });
    const response = await worker.fetch(request, env, {});
    assert.equal(response.status, 413);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(source.cancelled, true);
  }
  assert.equal(forwarded, 0);
});

test('Mail caps JSON before parsing; fallbacks cannot swallow a size error', async () => {
  const { jsonBody } = await import('../email/src/index.js');
  assert.deepEqual(await jsonBody(streamRequest(['{"text":"é"}']), 13), { text: 'é' });
  for (const fallback of [undefined, {}, null]) {
    const request = streamRequest(['1234', '5678', 'never read']);
    await assert.rejects(jsonBody(request, 7, fallback), e => e.status === 413);
    assert.equal(request.reads, 2);
    assert.equal(request.cancelled, true);
  }
  for (const text of ['{', 'null', '[]', '3']) {
    await assert.rejects(jsonBody(streamRequest([text])), e => e.status === 400 && !!e.publicMessage);
  }
  assert.deepEqual(await jsonBody(streamRequest(['{']), 7, {}), {});
  const large = '{"text":"' + 'x'.repeat(65536) + '"}';
  await assert.rejects(jsonBody(streamRequest([large])), e => e.status === 413);
  assert.equal((await jsonBody(streamRequest([large]), 36 * 1024 * 1024)).text.length, 65536);
});
