// Public identity pages stay on InFlite. Their native service hosts still choose
// the sign-in/account role; the browser's Origin and WebAuthn data are untouched.
import { appFetch } from './apps.js';
import { geoOf } from './account.js';
import { fetchUpstream } from './upstream.js';
import { bodyUpTo } from './body.js';

const PREFIX = /^\/(auth|account)(?=\/|$)/;
const SAFE = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' };
const fail = (status, error) => Response.json({ error }, { status, headers: SAFE });
export const isIdentityPath = path => PREFIX.test(path);
// This is an identity boundary, not a general proxy: unrelated cookies, bearer
// credentials and caller-supplied trusted headers never cross it.
export function identityCookies(request) {
  return (request.headers.get('Cookie') || '').split(';').map(s => s.trim()).filter(s =>
    /^(?:__Secure-)?account=[A-Za-z0-9_-]{20,100}$/.test(s) || s === 'ifl_rw=1' ||
    /^(?:(?:__Secure-|__Host-))?known-[a-f0-9]{8}=[a-f0-9]{32}\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{32}$/.test(s)
  ).slice(0, 24).join('; ');
}
function publicLocation(value, role) {
  const u = new URL(value, `https://${role}.inflite.ai`);
  const paths = { auth: '/auth', account: '/account', chat: '/chats', weather: '/weather', fitness: '/fitness', finance: '/markets', email: '/mail' };
  const m = /^(auth|account|chat|weather|fitness|finance|email)\.inflite\.ai$/.exec(u.hostname);
  if (m && u.protocol === 'https:' && !u.port && !u.username && !u.password) return `https://inflite.ai${paths[m[1]]}${u.pathname}${u.search}${u.hash}`;
  if (u.origin === 'https://inflite.ai' && !u.username && !u.password) return u.href;
  return null; // identity never redirects a browser to an unreviewed origin
}
export async function identity(request, env) {
  const url = new URL(request.url), match = PREFIX.exec(url.pathname);
  if (!match) return fail(404, 'That identity page was not found.');
  const role = match[1], base = '/' + role, path = url.pathname.slice(base.length) || '/';
  if (url.origin !== 'https://inflite.ai') return fail(404, 'Open identity on InFlite.');
  if (url.pathname === base) return new Response(null, { status: 308, headers: { ...SAFE, Location: base + '/' + url.search } });
  if (/%(?:2f|5c|00)/i.test(path) || path.includes('\\') || url.search.length > 8192) return fail(400, 'That identity request is invalid.');
  const api = path.startsWith('/api/'), read = request.method === 'GET' || request.method === 'HEAD';
  if ((!read && !api) || (api && !path.startsWith('/api/account/'))) return fail(404, 'That identity action was not found.');
  if (!read && request.headers.get('Origin') !== url.origin) return fail(403, 'That request didn’t come from InFlite.');
  const site = request.headers.get('Sec-Fetch-Site');
  if (api && site && site !== 'same-origin' && !(read && site === 'none')) return fail(403, 'That request didn’t come from InFlite.');
  if (!env.HUB_KEY) return fail(503, 'Sign-in is temporarily unavailable. Please try again.');
  const headers = new Headers({ 'X-Hub-Key': env.HUB_KEY, 'X-Inflite-Identity': role });
  const cookies = identityCookies(request); if (cookies) headers.set('Cookie', cookies);
  for (const name of ['Accept', 'Content-Type', 'User-Agent', 'X-Home-Screen', 'Range']) {
    const value = request.headers.get(name); if (value) headers.set(name, value);
  }
  const origin = request.headers.get('Origin'); if (origin) headers.set('Origin', origin);
  const ip = request.headers.get('CF-Connecting-IP');
  if (ip) { headers.set('X-Hub-IP', ip); headers.set('X-Hub-Geo', geoOf(request.cf)); }
  let body;
  if (!read) {
    try { body = await bodyUpTo(request, 32 * 1024 * 1024, { raw: true }); }
    catch { return fail(request.signal.aborted ? 499 : 400, 'That request could not be read.'); }
    if (body === null) return fail(413, 'That identity request is too large.');
  }
  try {
    const response = await fetchUpstream((target, init) => appFetch(env, target, init), `https://${role}.inflite.ai${path}${url.search}`, { method: request.method, headers, body, redirect: 'manual' }, { signal: request.signal, timeout: 30000 });
    const out = new Headers(response.headers);
    for (const name of ['Access-Control-Allow-Origin', 'Access-Control-Allow-Credentials', 'Access-Control-Allow-Headers', 'Access-Control-Allow-Methods', 'Service-Worker-Allowed']) out.delete(name);
    if (api) out.set('Cache-Control', 'private, no-store');
    if (response.status >= 300 && response.status < 400) {
      const location = publicLocation(out.get('Location') || '', role);
      response.body?.cancel().catch(() => {});
      if (!location) return fail(502, 'That identity destination is unavailable.');
      out.set('Location', location); return new Response(null, { status: response.status, headers: out });
    }
    if (request.method === 'HEAD') response.body?.cancel().catch(() => {});
    return new Response(request.method === 'HEAD' ? null : response.body, { status: response.status, headers: out });
  } catch { return fail(request.signal.aborted ? 499 : 502, 'Sign-in could not be reached. Please try again.'); }
}
