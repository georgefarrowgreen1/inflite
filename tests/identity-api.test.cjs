const { test } = require('node:test');
const assert = require('node:assert/strict');
const { webcrypto } = require('node:crypto');
globalThis.crypto ||= webcrypto;
const req = (path, init = {}) => new Request('https://inflite.ai' + path, { ...init, headers: { 'Sec-Fetch-Site': 'same-origin', Origin: 'https://inflite.ai', ...init.headers } });
const env = send => ({ HUB_KEY: 'private-worker-key', APPS: { fetch: send } });

test('identity exposes exact canonical prefixes and canonicalizes directory bases before resolving relative resources', async () => {
  const { isIdentityPath, identity } = await import('../today/src/identity.js');
  for (const path of ['/auth', '/auth/', '/auth/signin.js', '/account', '/account/api/account/me']) assert.equal(isIdentityPath(path), true);
  for (const path of ['/authentication', '/accounts', '//auth/', '/AUTH/']) assert.equal(isIdentityPath(path), false);
  const r = await identity(req('/auth?signin=today'), env(() => assert.fail('redirect needs no upstream')));
  assert.equal(r.status, 308); assert.equal(r.headers.get('Location'), '/auth/?signin=today');
});
test('identity preserves browser WebAuthn Origin and bytes, fixed role and known-device cookies while dropping caller credentials', async () => {
  const { identity } = await import('../today/src/identity.js'); let sent;
  const data = { challenge: 'unmodified', clientDataJSON: Buffer.from(JSON.stringify({ origin: 'https://inflite.ai', type: 'webauthn.get' })).toString('base64url') };
  const known = '__Secure-known-deadbeef=' + 'a'.repeat(32) + '.' + 'b'.repeat(16) + '.' + 'c'.repeat(32);
  const response = await identity(req('/auth/api/account/signin/passkey', { method: 'POST', body: JSON.stringify(data), headers: { 'Content-Type': 'application/json', Cookie: `__Secure-account=${'s'.repeat(32)}; ${known}; unrelated=secret; ifl_rw=1`, Authorization: 'Bearer unsafe', 'X-Hub-Ok': 'forged', 'X-Hub-Key': 'forged', 'X-Inflite-Identity': 'account' } }), env(async request => {
    sent = request; assert.deepEqual(await request.json(), data);
    const r = Response.json({ signedIn: true }); r.headers.append('Set-Cookie', '__Secure-account=new; Path=/; Domain=inflite.ai; HttpOnly; Secure'); r.headers.append('Set-Cookie', known + '; Path=/; Domain=inflite.ai; HttpOnly; Secure'); return r;
  }));
  assert.equal(sent.url, 'https://auth.inflite.ai/api/account/signin/passkey');
  assert.equal(sent.headers.get('Origin'), 'https://inflite.ai'); assert.equal(sent.headers.get('X-Inflite-Identity'), 'auth');
  assert.equal(sent.headers.get('X-Hub-Key'), 'private-worker-key'); assert.equal(sent.headers.get('X-Hub-Ok'), null); assert.equal(sent.headers.get('Authorization'), null);
  assert.equal(sent.headers.get('Cookie'), `__Secure-account=${'s'.repeat(32)}; ${known}; ifl_rw=1`);
  assert.equal(response.headers.getSetCookie().length, 2); assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
});
test('identity refuses foreign writes, cross-site API reads, unrelated APIs, malformed paths and missing authenticated transport', async () => {
  const { identity } = await import('../today/src/identity.js'); let calls = 0; const e = env(() => { calls++; return Response.json({}); });
  for (const [request, status] of [[req('/auth/api/account/signout', { method: 'POST', headers: { Origin: 'https://evil.test' } }),403], [req('/account/api/account/me', {headers:{'Sec-Fetch-Site':'cross-site'}}),403], [req('/auth/api/files/list'),404], [req('/account/apps%2fmail.png'),400], [req('/account/thing', {method:'POST'}),404]]) assert.equal((await identity(request,e)).status,status);
  assert.equal((await identity(req('/auth/api/account/me'), {})).status, 503); assert.equal(calls,0);
});
test('identity remaps reviewed redirects only and never retries uncertain writes', async () => {
  const { identity } = await import('../today/src/identity.js'); let calls=0;
  const ok = await identity(req('/auth/go?signin=today'), env(() => new Response(null,{status:302,headers:{Location:'https://account.inflite.ai/#welcome=back'}})));
  assert.equal(ok.headers.get('Location'),'https://inflite.ai/account/#welcome=back');
  assert.equal((await identity(req('/auth/'), env(() => new Response(null,{status:302,headers:{Location:'https://evil.test/'}})))).status,502);
  const r = await identity(req('/auth/api/account/signout',{method:'POST',body:'{}'}), env(() => {calls++;throw new Error('uncertain');}));
  assert.equal(r.status,502);assert.equal(calls,1);
});
