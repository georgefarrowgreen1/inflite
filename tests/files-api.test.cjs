const { test } = require('node:test');
const assert = require('node:assert/strict');
const ORIGIN = 'https://os.inflite.ai';
const ID = 'a'.repeat(32);
const cookie = 'A'.repeat(32);
const req = (path, init = {}) => new Request(ORIGIN + '/api/files/' + path, { ...init, headers: { Origin: ORIGIN, 'Sec-Fetch-Site': 'same-origin', 'X-Inflite': '1', 'X-Inflite-Files-Owner': 'ann', 'Content-Type': 'application/json', Cookie: `__Secure-account=${cookie}; other=private; ifl_rw=1`, ...init.headers } });
const env = send => ({ ACCOUNT_ORIGIN: 'https://account.inflite.ai', TODAY_AS: 'https://inflite.ai', HUB_KEY: 'files-test-key', APPS: { fetch: send } });
const turn = () => new Promise(resolve => setImmediate(resolve));

test('Files rejects foreign browser origins, missing write headers, unknown paths and duplicate query fields before forwarding', async () => {
  const { filesAPI } = await import('../today/src/files.js'); let calls = 0;
  const e = env(() => { calls++; return Response.json({ ok: true }); });
  const samples = [
    [req('folders', { method: 'POST', body: '{}', headers: { Origin: 'https://evil.test' } }), 403],
    [req('folders', { method: 'POST', body: '{}', headers: { 'X-Inflite': '' } }), 403],
    [req('list', { headers: { 'Sec-Fetch-Site': 'same-site' } }), 403],
    [req('content?id=' + ID, { headers: { 'Sec-Fetch-Site': 'cross-site' } }), 403],
    [req('../account/me'), 404], [req('list?id=x&id=y'), 400], [req('list?target=https://evil.test'), 400],
  ];
  for (const [request, status] of samples) assert.equal((await filesAPI(request, e)).status, status);
  assert.equal(calls, 0);
});
test('Files uses only the account cookie and canonical Today identity; private errors remain bounded JSON', async () => {
  const { filesAPI } = await import('../today/src/files.js'); let sent;
  const result = await filesAPI(req('search', { method: 'POST', body: JSON.stringify({ q: 'private invoice', parentId: null }), headers: { Authorization: 'Bearer must-not-forward', 'X-Hub-Ok': 'forged' } }), env(async request => {
    sent = { url: request.url, headers: Object.fromEntries(request.headers), body: await request.json() };
    return Response.json({ items: [], cursor: null }, { headers: { 'Set-Cookie': 'must-not-return=1' } });
  }));
  assert.equal(result.status, 200); assert.equal(sent.url, 'https://account.inflite.ai/api/account/today/files/search');
  assert.equal(sent.headers.origin, 'https://inflite.ai'); assert.equal(sent.headers.cookie, `__Secure-account=${cookie}; ifl_rw=1`);
  assert.equal(sent.headers.authorization, undefined); assert.equal(sent.headers['x-hub-ok'], undefined);
  assert.equal(sent.headers['x-inflite-files-owner'], 'ann');
  assert.deepEqual(sent.body, { q: 'private invoice', parentId: null }); assert.equal(result.headers.get('set-cookie'), null);
  assert.equal(result.headers.get('cache-control'), 'private, no-store'); assert.equal(result.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(result.headers.get('access-control-allow-origin'), null);
});
test('Files requires a bounded captured-owner predicate before forwarding metadata or writes', async () => {
  const { filesAPI } = await import('../today/src/files.js'); let calls = 0;
  const e = env(() => { calls++; return Response.json({ items: [] }); });
  for (const owner of [null, '', 'a'.repeat(81), 'bad.owner', 'bad owner', '\u00e9']) {
    for (const [path, init] of [['list', {}], ['folders', { method: 'POST', body: '{invalid JSON' }], ['content?id=' + ID, { method: 'PUT', body: 'private bytes' }]]) {
      const request = req(path, { ...init, headers: { 'X-Inflite-Files-Owner': owner || '' } });
      if (owner === null) request.headers.delete('X-Inflite-Files-Owner');
      const denied = await filesAPI(request, e); assert.equal(denied.status, 401); assert.match((await denied.json()).error, /account changed/i);
    }
  }
  assert.equal(calls, 0);
  assert.equal((await filesAPI(req('list', { headers: { 'X-Inflite-Files-Owner': 'A'.repeat(80) } }), e)).status, 200);
  assert.equal(calls, 1);
});
test('native attachment GET and HEAD may omit owner predicates while supplied predicates stay validated', async () => {
  const { filesAPI } = await import('../today/src/files.js'); let calls = 0;
  const e = env(request => { calls++; assert.equal(request.headers.get('x-inflite-files-owner'), null); return new Response(new Uint8Array([1]), { headers: { 'Content-Type': 'application/octet-stream', 'Content-Length': '1' } }); });
  for (const method of ['GET', 'HEAD']) {
    const request = new Request(ORIGIN + '/api/files/content?id=' + ID, { method, headers: { 'Sec-Fetch-Site': 'none', Cookie: `__Secure-account=${cookie}` } });
    const response = await filesAPI(request, e); assert.equal(response.status, 200); await response.arrayBuffer();
  }
  for (const owner of ['', 'a'.repeat(81), 'bad.owner']) assert.equal((await filesAPI(req('content?id=' + ID, { headers: { 'X-Inflite-Files-Owner': owner } }), e)).status, 401);
  assert.equal(calls, 2);
});
test('binary uploads preserve exact bytes and enforce actual stream bounds, not a dishonest Content-Length', async () => {
  const { filesAPI } = await import('../today/src/files.js'); const bytes = new Uint8Array([0, 255, 128, 13, 10]); let data, calls = 0;
  const e = env(async request => { calls++; data = new Uint8Array(await request.arrayBuffer()); return Response.json({ item: { id: ID } }); });
  const ok = await filesAPI(req('content?id=' + ID, { method: 'PUT', body: bytes, headers: { 'Content-Type': 'application/octet-stream', 'Content-Length': String(bytes.length) } }), e);
  assert.equal(ok.status, 200); assert.deepEqual(data, bytes);
  const huge = await filesAPI(req('content?id=' + ID, { method: 'PUT', body: new Uint8Array(), headers: { 'Content-Length': String(25 * 1024 * 1024 + 1) } }), e);
  assert.equal(huge.status, 413); assert.equal(calls, 1);
  let cancelled = false;
  const source = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(25 * 1024 * 1024 + 1)); }, cancel() { cancelled = true; } });
  const streamed = await filesAPI(req('content?id=' + ID, { method: 'PUT', body: source, duplex: 'half', headers: { 'Content-Length': '1' } }), e);
  assert.equal(streamed.status, 413); assert.equal(cancelled, true);
});
test('private content and ranges stay streamed with only safe headers, and HEAD cancels an unread upstream body', async () => {
  const { filesAPI } = await import('../today/src/files.js'); let produced, sent, cancelled = false;
  const response = () => new Response(new ReadableStream({ start(controller) { produced = controller; }, cancel() { cancelled = true; } }), { status: 206, headers: { 'Content-Type': 'application/octet-stream', 'Content-Length': '4', 'Content-Range': 'bytes 0-3/4', 'Content-Disposition': 'attachment; filename="sample.txt"', 'Accept-Ranges': 'bytes', 'Access-Control-Allow-Origin': '*', 'Set-Cookie': 'no=1' } });
  const e = env(request => { sent = request; return response(); });
  const out = await filesAPI(req('content?id=' + ID, { headers: { Range: 'bytes=0-3' } }), e);
  assert.equal(out.status, 206); assert.equal(sent.headers.get('range'), 'bytes=0-3');
  assert.equal(out.headers.get('content-range'), 'bytes 0-3/4'); assert.equal(out.headers.get('content-security-policy'), "sandbox; default-src 'none'; frame-ancestors 'none'");
  assert.equal(out.headers.get('access-control-allow-origin'), null); assert.equal(out.headers.get('set-cookie'), null);
  produced.enqueue(new Uint8Array([1, 2, 3, 4])); produced.close(); assert.deepEqual(new Uint8Array(await out.arrayBuffer()), new Uint8Array([1, 2, 3, 4]));
  const head = await filesAPI(req('content?id=' + ID, { method: 'HEAD' }), e); assert.equal(head.status, 206); await turn(); assert.equal(cancelled, true); assert.equal(sent.method, 'GET');
});
test('upstream redirects, HTML and oversized JSON never masquerade as a file or leak their payload', async () => {
  const { filesAPI } = await import('../today/src/files.js');
  for (const make of [() => new Response('private upstream HTML', { headers: { 'Content-Type': 'text/html' } }), () => Response.redirect('https://evil.test', 302), () => new Response('x'.repeat(129 * 1024), { headers: { 'Content-Type': 'application/json' } })]) {
    const out = await filesAPI(req('list'), env(make)); assert.equal(out.status, 502); assert.doesNotMatch(await out.text(), /private upstream HTML|evil\.test|x{20}/);
  }
  const file = await filesAPI(req('content?id=' + ID), env(() => new Response('<script>bad</script>', { headers: { 'Content-Type': 'text/html' } }))); assert.equal(file.status, 502);
});
test('a stalled upstream is cancelled once at its deadline and late bodies are closed without retrying a write', async t => {
  const { filesAPI } = await import('../today/src/files.js'); t.mock.timers.enable({ apis: ['setTimeout'] }); let release, signal, calls = 0, cancelled = false;
  const pending = filesAPI(req('folders', { method: 'POST', body: '{}' }), env(request => { calls++; signal = request.signal; return new Promise(resolve => release = resolve); }));
  await turn(); t.mock.timers.tick(20001); const out = await pending; assert.equal(out.status, 502); assert.equal(calls, 1); assert.equal(signal.aborted, true);
  release(new Response(new ReadableStream({ cancel() { cancelled = true; } }), { headers: { 'Content-Type': 'application/json' } })); await turn(); assert.equal(cancelled, true);
});
test('caller cancellation before dispatch or during JSON input never forwards an old account action', async () => {
  const { filesAPI } = await import('../today/src/files.js'); let calls = 0;
  const e = env(() => { calls++; return Response.json({ ok: true }); });
  const before = new AbortController(); before.abort();
  assert.equal((await filesAPI(req('folders', { method: 'POST', body: '{}', signal: before.signal }), e)).status, 499);
  let reading, cancelled = false;
  const during = new AbortController(), stream = new ReadableStream({ start(controller) { reading = controller; controller.enqueue(new TextEncoder().encode('{')); }, cancel() { cancelled = true; } });
  const pending = filesAPI(req('folders', { method: 'POST', body: stream, duplex: 'half', signal: during.signal }), e);
  await turn(); during.abort();
  assert.equal((await pending).status, 499); assert.equal(cancelled, true); assert.equal(calls, 0);
});
test('sorted folder pages forward only explicit query controls while terms stay in search bodies', async () => {
  const { filesAPI } = await import('../today/src/files.js'); let calls = 0, sent;
  const e = env(request => { calls++; sent = new URL(request.url); return Response.json({ items: [], cursor: null }); });
  const out = await filesAPI(req('list?parentId=' + ID + '&view=folder&sort=modified&kind=folder&cursor=3%3A100'), e);
  assert.equal(out.status, 200); assert.deepEqual(Object.fromEntries(sent.searchParams), { parentId: ID, view: 'folder', sort: 'modified', kind: 'folder', cursor: '3:100' });
  for (const path of ['list?q=private-name', 'list?kind=folder&kind=folder', 'list?sort=name&sort=size', 'list?cursor=' + 'x'.repeat(161)]) assert.equal((await filesAPI(req(path), e)).status, 400);
  assert.equal(calls, 1);
});
