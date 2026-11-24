import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { atlas } from '../today/src/atlas.js';
import { bindAtlasDatabase } from '../tools/atlas-bind.mjs';

const admin = { signedIn: true, user: { id: 'owner' }, apps: { mail: true } };
const request = (path = '/atlas', { method = 'GET', cookie = true, headers = {}, body } = {}) => new Request('https://inflite.ai' + path, { method, headers: { ...(cookie ? { Cookie: 'account=abcdefghijklmnopqrstuvwxyz' } : {}), ...(method === 'GET' ? {} : { Origin: 'https://inflite.ai', 'X-Inflite': '1', 'Content-Type': 'application/json' }), ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });

for (const [name, view] of [['standard', { signedIn: true, user: { id: 'other' }, apps: { mail: false } }], ['signed out', { signedIn: false }], ['missing entitlement', { signedIn: true, user: { id: 'owner' } }]]) {
  test(name + ' cannot access any Atlas surface or contact a provider', async () => {
    let calls = 0;
    for (const path of ['/atlas', '/atlas/assets/app.js', '/atlas/api/health', '/atlas/api/conversations', '/atlas/api/provider', '/atlas/api/tasks', '/atlas/api/briefs', '/atlas/api/github', '/atlas/api/patches']) {
      const response = await atlas(request(path), {}, { account: async () => Response.json(view), send: async () => { calls++; } });
      assert.equal(response.status, view.signedIn === false ? 401 : 403); assert.equal((await response.json()).code, view.signedIn === false ? 'sign_in_required' : 'access_denied');
      assert.match(response.headers.get('Cache-Control'), /no-store/);
    }
    assert.equal(calls, 0);
  });
}

test('missing cookie and account outage fail closed', async () => {
  assert.equal((await atlas(request('/atlas', { cookie: false }), {})).status, 401);
  for (const account of [async () => null, async () => { throw Error('private failure'); }, async () => new Response('invalid'), async () => Response.json({}, { status: 503 }), async () => Response.json({})]) {
    const response = await atlas(request(), {}, { account });
    assert.equal(response.status, 503); assert.equal((await response.json()).code, 'account_unavailable');
  }
});

test('session and confirmed identity are owner-bound without touching storage or a provider', async () => {
  const env = { ATLAS_DB: { prepare() { assert.fail('identity does not depend on storage'); } } };
  const send = async () => assert.fail('identity does not contact providers');
  const account = async (_env, _request, options) => Response.json(options.path === 'atlas/fresh' ? { fresh: true, owner: 'owner' } : admin);
  const session = await atlas(request('/atlas/api/session'), env, { account, send });
  assert.equal(session.status, 200);
  const value = await session.json(); assert.equal(value.signedIn, true); assert.equal(value.available, true); assert.match(value.owner, /^[a-f0-9]{32}$/);
  const identity = await atlas(request('/atlas/api/identity', { headers: { 'X-Atlas-Owner': value.owner } }), env, { account, send });
  assert.equal(identity.status, 200); assert.deepEqual(await identity.json(), { confirmed: true, owner: value.owner });
  const switched = await atlas(request('/atlas/api/identity', { headers: { 'X-Atlas-Owner': '0'.repeat(32) } }), env, { account, send });
  assert.equal(switched.status, 409);
});

test('identity confirmation distinguishes expiry and account-switch from a transient outage', async () => {
  for (const [proof, expected, code] of [
    [() => Response.json({ fresh: false }), 403, 'identity_confirmation_required'],
    [() => new Response('', { status: 403 }), 403, 'identity_confirmation_required'],
    [() => Response.json({ fresh: true, owner: 'another-owner' }), 409, 'session_changed'],
    [() => null, 503, 'account_unavailable'],
    [() => new Response('', { status: 502 }), 503, 'account_unavailable'],
    [() => new Response('bad json'), 503, 'account_unavailable'],
    [() => Response.json({}), 503, 'account_unavailable'],
  ]) {
    const result = await atlas(request('/atlas/api/identity'), {}, { account: async (_env, _request, options) => options.path === 'atlas/fresh' ? proof() : Response.json(admin) });
    assert.equal(result.status, expected); assert.equal((await result.json()).code, code);
  }
});

test('Atlas forwards only authoritative account cookie renewals and preserves cookies on an outage', async () => {
  const headers = new Headers();
  headers.append('Set-Cookie', '__Secure-account=renewedabcdefghijklmnopqrstuvwxyz; Domain=.inflite.ai; Path=/; Secure; HttpOnly');
  headers.append('Set-Cookie', 'ifl_rw=1; Path=/; Secure');
  headers.append('Set-Cookie', 'unrelated=private; Path=/');
  const response = await atlas(request('/atlas/api/session'), {}, { account: async () => Response.json(admin, { headers }) });
  assert.equal(response.headers.getSetCookie().length, 2);
  assert.ok(response.headers.getSetCookie().some(cookie => cookie.startsWith('__Secure-account=renewed')));
  assert.ok(response.headers.getSetCookie().every(cookie => !cookie.startsWith('unrelated=')));
  const failed = await atlas(request('/atlas/api/session'), {}, { account: async () => new Response('', { status: 503, headers: { 'Set-Cookie': 'account=; Max-Age=0; Path=/' } }) });
  assert.equal(failed.status, 503); assert.equal(failed.headers.has('Set-Cookie'), false);
  const malformed = await atlas(request('/atlas/api/session'), {}, { account: async () => Response.json({}, { headers: { 'Set-Cookie': 'account=; Max-Age=0; Path=/' } }) });
  assert.equal(malformed.status, 503); assert.equal(malformed.headers.has('Set-Cookie'), false);
});

test('admin page is private, nonce-protected and initializes the shared theme correctly', async () => {
  const response = await atlas(request(), {}, { account: async () => Response.json(admin) });
  assert.equal(response.status, 200); assert.match(response.headers.get('Cache-Control'), /private, no-store/);
  assert.match(response.headers.get('X-Atlas-Owner'), /^[a-f0-9]{32}$/);
  const csp = response.headers.get('Content-Security-Policy'), html = await response.text();
  const nonce = /script-src 'self' 'nonce-([^']+)'/.exec(csp)[1];
  assert.match(csp, /frame-ancestors 'none'/); assert.ok(!csp.includes('unsafe-inline'));
  assert.ok(html.includes('<script nonce="' + nonce + '">globalThis.__iflSessionStarted=true;</script><script src="/theme.js"></script>'));
  assert.match(html, /src="\/roof\/wallpaper.js"/); assert.match(html, /src="\/atlas\/assets\/app.js"/);
  assert.ok(!html.includes('onclick='));
});

test('authenticated assets are private and never forwarded for unauthenticated users', async () => {
  let calls = 0;
  const env = { ASSETS: { fetch: async () => { calls++; return new Response('fixture', { headers: { 'Cache-Control': 'public, max-age=31536000' } }); } } };
  const response = await atlas(request('/atlas/assets/app.js'), env, { account: async () => Response.json(admin) });
  assert.equal(response.status, 200); assert.equal(calls, 1); assert.match(response.headers.get('Cache-Control'), /no-store/);
  assert.equal((await atlas(request('/atlas/assets/app.js', { cookie: false }), env)).status, 401); assert.equal(calls, 1);
});

test('every mutation checks origin and header before touching storage', async () => {
  for (const headers of [{ Origin: 'https://evil.example' }, { 'X-Inflite': '0' }, { 'Sec-Fetch-Site': 'cross-site' }]) {
    const response = await atlas(request('/atlas/api/setup', { method: 'POST', body: { confirm: true }, headers }), { ATLAS_DB: { prepare() { assert.fail('must not touch storage'); } } }, { account: async () => Response.json(admin) });
    assert.equal(response.status, 403); assert.equal((await response.json()).code, 'invalid_origin');
  }
});

test('an old account marker cannot submit data under a newly signed-in owner', async () => {
  const response = await atlas(request('/atlas/api/conversations', { method: 'POST', headers: { 'X-Atlas-Owner': '0'.repeat(32) }, body: { title: 'Private old-owner title' } }), { ATLAS_DB: { prepare() { assert.fail('must not touch storage'); } } }, { account: async () => Response.json(admin) });
  assert.equal(response.status, 409); assert.equal((await response.json()).code, 'session_changed');
});

test('health distinguishes absent storage without calling OpenAI', async () => {
  const response = await atlas(request('/atlas/api/health'), {}, { account: async () => Response.json(admin), send: async () => assert.fail('health is local') });
  assert.equal(response.status, 200);
  const value = await response.json(); assert.equal(value.storage.ready, false); assert.equal(value.provider.lastErrorCode, 'provider_database_missing'); assert.equal(value.scheduling.available, false);
});

test('provisioning binds only the requested database and refuses conflicts', () => {
  const config = readFileSync(new URL('../wrangler.toml', import.meta.url), 'utf8').replace(/^\s*database_id\s*=.*$/gm, '');
  const stage = '12345678-1234-1234-1234-123456789abc', prod = 'abcdefab-1234-1234-1234-123456789abc';
  const next = bindAtlasDatabase(config, 'next', stage);
  assert.ok(next.includes('database_name = "inflite-atlas-next"\ndatabase_id = "' + stage + '"'));
  assert.ok(!next.includes('database_name = "inflite-atlas-production"\ndatabase_id'));
  assert.equal(bindAtlasDatabase(next, 'next', stage), next);
  assert.throws(() => bindAtlasDatabase(next, 'next', prod), /differs/);
  assert.ok(bindAtlasDatabase(next, 'production', prod).includes('database_name = "inflite-atlas-production"\ndatabase_id = "' + prod + '"'));
  assert.throws(() => bindAtlasDatabase(config, 'next', 'bad'), /Invalid D1 UUID/);
  assert.throws(() => bindAtlasDatabase(config + '\n[[env.next.d1_databases]]\nbinding = "ATLAS_DB"\n', 'next', stage), /exactly one/);
});
