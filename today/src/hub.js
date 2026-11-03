// InFlite's hub (Today First, spec §3.3): Chats, Weather, Fitness and Markets as pages of inflite.ai, in one window
// with Today. Each is fetched from the app's own address (chat., weather., fitness., finance.inflite.ai), spoken for
// with that app's own Origin once this Worker has made the checks its api() makes, and given back with the hub's
// headers and its marker (<meta name="ifl-hub" content="/weather/">, which is what tells every page it's at the hub).
//   isHubPath(pathname) → whether the hub answers it (today/src/index.js asks, before anything else)
//   hub(request, env, ctx) → the answer
//   forward(env, request, { app, path, api }) → the app's answer to one request, as the hub gives it back
//   hubPath(href, env, { from, here }) → an address on an app's host as it is at the hub (IFL.hub.go's twin)
// The apps' hosts take what this Worker says of the browser (its address and where it is) only with its key
// (X-Hub-Key, the HUB_KEY secret; MAIN's functions/_middleware.js checks it against a Pages secret of its own). Without
// the key here, or while the apps' hosts say they don't know it, nothing here is served (503), and GET /api/hub says
// so to Today's page, which then links to each app's own address, as before (addendum A1).
// Never the assets binding, except the framework's page for /weather/ (One roof, today/src/roof.js: a document at
// /weather/ is InFlite's one page, while the roof is on): Today's own files are the assets', and none of these paths are.
import { accountCookie } from "./account.js";
import { roofOn, appsOn, modOf, filesOf, roofPage, retireWorker } from "./roof.js";

// each hub path to the host that serves it: `app` names the vars (<APP>_ORIGIN, the origin spoken as: the app's public
// address; <APP>_VIA, where to connect, the same in production and a local pass-through in tests), `under` where its
// files are there (Chat's hub copy is /_hub/, its own pages with /pigeon/ written as /chats/)
export const PAGES = { "/chats/": { app: "CHAT", under: "/_hub/" }, "/weather/": { app: "WEATHER" },
                       "/fitness/": { app: "FITNESS" }, "/markets/": { app: "MARKETS" } };
export const APIS  = { "/api/pigeon/": "CHAT", "/api/weather/": "WEATHER", "/api/fitness/": "FITNESS", "/api/markets/": "MARKETS" };
// (the most each app's API is sent at once: Chat's photos and voice, Fitness's .fit files and Health's nights; the
// others' small JSON)
export const CAPS  = { CHAT: 9 << 20, FITNESS: (25 << 20) + (128 << 10), WEATHER: 64 << 10, MARKETS: 64 << 10 };
// (the apps' server-to-server routes: their schedulers and Strava's hook, never a page's)
export const NEVER = /^\/api\/(pigeon\/notify-tick|weather\/tick|fitness\/(garmin-tick|strava\/hook)|markets\/tick)\b/;

const APPS = ["CHAT", "WEATHER", "FITNESS", "MARKETS"];
const METHODS = new Set(["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE"]);
// (what of the browser's request goes on, besides the account's cookie and Chat's bearer)
const PASS = ["Content-Type", "Accept", "If-None-Match", "If-Modified-Since", "Range", "User-Agent", "X-Home-Screen"];
// (where the browser is, as Cloudflare's edge saw it: the few things the apps read of it, functions/_sites.js cfOf)
const GEO = ["country", "region", "city", "latitude", "longitude", "timezone"];
const PAGE_RE = /^\/(chats|weather|fitness|markets)(\/|$)/, API_RE = /^\/api\/(pigeon|weather|fitness|markets)\//;

const SAID = {
  notReady: "InFlite isn’t ready here yet.",
  notHub: "That request didn’t come from InFlite.",
  method: "InFlite doesn’t do that here.",
  big: "That’s too much to send.",
  down: "Couldn’t reach that app. Try again in a moment.",
  gone: "Not found.",
};
// (the hub's own answers, as today/src/index.js's: never kept, never sniffed, never framed, never read by another site)
const SAFE = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
  "Cross-Origin-Resource-Policy": "same-origin",
};
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json; charset=utf-8", ...SAFE } });
const refuse = (status, error) => json({ error }, status);

export const isHubPath = (p) => PAGE_RE.test(p) || API_RE.test(p) || p === "/api/hub";

// Whether the whole chain works (addendum A1): this Worker's key and every app's address, and the apps' hosts taking
// that key (theirs is a Pages secret of its own: without it, or with another, Chat's /_hub/ is not found there, and
// nothing this Worker says of the browser is believed). Asked of Chat's host as the hub asks it anything (/_hub/version,
// with the hub's headers), and kept in the isolate five minutes after a yes, one after a no.
//   ok: it answered 200. refused: it said not found, a definite no (the key isn't theirs); never a moment's trouble
//   there (no answer, a 5xx), so a blip at the apps' hosts never closes the hub for a minute.
const KEEP_OK = 300e3, KEEP_NO = 60e3, PROBE_WAIT = 5000;
let probed = null, asking = 0;
// (for tests: forget what was found)
export const forgetProbe = () => { probed = null; asking = 0; };
const keyed = (env) => !!env?.HUB_KEY && APPS.every((a) => !!env[`${a}_ORIGIN`]);
const probeTo = (env) => { try { return `${new URL(env.CHAT_VIA || env.CHAT_ORIGIN).origin}${PAGES["/chats/"].under}version`; } catch { return null; } };
// (what was found, while it's fresh, and only for this key and this address of Chat's)
const known = (env, t) => (probed && keyed(env) && probed.key === env.HUB_KEY && probed.to === probeTo(env) && t < probed.until ? probed : null);
async function probe(env, request, t) {
  const to = probeTo(env);
  let status = 0;
  try {
    if (!to) throw new TypeError("no address for Chat");
    const res = await fetch(to, { headers: hubHeaders(env, request, "CHAT"), redirect: "manual", signal: AbortSignal.timeout(PROBE_WAIT) });
    status = res.status;
    if (res.body) res.body.cancel().catch(() => {});
  } catch (e) {
    console.error("hub probe", e && e.message);
  }
  const ok = status === 200;
  return (probed = { ok, refused: status === 404, until: t + (ok ? KEEP_OK : KEEP_NO), key: env.HUB_KEY, to });
}
async function ready(env, request) {
  if (!keyed(env)) return false;
  const t = Date.now();
  return (known(env, t) || (await probe(env, request, t))).ok;
}

export async function hub(request, env, ctx) {
  const url = new URL(request.url), p = url.pathname, method = request.method, read = method === "GET" || method === "HEAD";
  // (Today's page asks once a visit whether the hub's there: until it is, it links to each app's own address)
  // (and whether Weather is a module of it there: One roof, roof.yml's switch, D14)
  // (and each module's switch, apps: s24-contracts §2; roof stays Weather's, for pages from before that read only it)
  if (p === "/api/hub") return read ? json({ ready: await ready(env, request), roof: roofOn(env), apps: appsOn(env) }) : refuse(405, SAID.method);
  // One roof (spec §8.1, D7): with the roof on, a document at /weather/ is the framework's page, and Weather's old worker
  // there is retired, before the key is asked about (the page itself goes to Weather's own address when the hub says it
  // isn't ready); with it off (ROOF_OFF "1"), Weather's milestone-1 page is the hub's again, and the module's files are
  // not found, so a page that missed the change can't start the module either [RB6b]
  // The same for each module of stage 2 (Markets, Fitness), each by its own switch (opt-in; Weather's opt-out)
  const a = read && (/^\/(weather|markets|fitness)(\/|$)/.exec(p)?.[1] || /^\/(weather|markets|fitness)(\/|$)/.exec(plainPath(p))?.[1]);
  if (a) {
    if (roofOn(env, a)) {
      if (modOf(p) === a) return roofPage(request, env);
      if (p === `/${a}/sw.js`) return retireWorker(request, a);
      if (p === `/${a}`) return new Response(null, { status: 301, headers: { Location: `${url.origin}/${a}/${url.search}`, ...SAFE } });
    } else if (filesOf(a).test(p) || filesOf(a).test(plainPath(p))) return refuse(404, SAID.gone);
  }
  if (!env?.HUB_KEY) return refuse(503, SAID.notReady);
  // (nor while the apps' hosts have said they don't know its key: everyone here would be the hub's one address to them.
  // What was found is /api/hub's; where nothing fresh is, it's asked beside this request, for the next)
  const t = Date.now(), found = known(env, t);
  if (found?.refused) return refuse(503, SAID.notReady);
  if (!found && keyed(env) && ctx?.waitUntil && !(t - asking < PROBE_WAIT * 2)) {
    asking = t;
    ctx.waitUntil(probe(env, request, t).finally(() => { asking = 0; }));
  }

  // ---- an app's API, at the same path as on its own host ----
  const api = Object.keys(APIS).find((k) => p.startsWith(k));
  if (api) {
    const app = APIS[api], plain = plainPath(p);
    if (!METHODS.has(method)) return refuse(405, SAID.method);
    // (the apps' server-to-server routes, however the address is written; and none that, read as the app's host reads
    // it, climbs out of this app's API)
    if (NEVER.test(p) || NEVER.test(plain) || !plain.startsWith(api)) return refuse(404, SAID.gone);
    // Same-site pages elsewhere on inflite.ai carry the account's cookie too, so only this site's own pages are
    // answered: a GET from its own page, or one typed or opened from the Home Screen (none); anything else only from
    // its own page, saying so (Origin). (No Sec-Fetch-Site at all: a browser from before it, as api() takes them.)
    const site = request.headers.get("Sec-Fetch-Site");
    if (site && !(site === "same-origin" || (read && site === "none"))) return refuse(403, SAID.notHub);
    if (!read && request.headers.get("Origin") !== url.origin) return refuse(403, SAID.notHub);
    if (!env[`${app}_ORIGIN`]) return refuse(503, SAID.notReady);
    return forward(env, request, { app, path: p + url.search, api: true });
  }

  // ---- an app's pages and files ----
  const m = PAGE_RE.exec(p);
  if (!m) return refuse(404, SAID.gone);
  const prefix = `/${m[1]}/`, page = PAGES[prefix], rest = p.slice(prefix.length);
  if (!read) return refuse(405, SAID.method);
  if (!env[`${page.app}_ORIGIN`]) return refuse(503, SAID.notReady);
  if (p === prefix.slice(0, -1)) return new Response(null, { status: 301, headers: { Location: `${url.origin}${prefix}${url.search}`, ...SAFE } });
  // (an app's API is the hub's only at /api/…, through the checks above: never by way of a page's path, however written)
  if (/^\/api(\/|$)/i.test(plainPath("/" + rest))) return refuse(404, SAID.gone);
  // (/weather/x is weather.'s /x, /chats/x Chat's /_hub/x; /<app>/version each one's own version, as its updater asks)
  return forward(env, request, { app: page.app, path: (page.under || "/") + rest + url.search, api: false });
}

// One request to the app, on the browser's behalf, and its answer as the hub gives it back. path: the path (and query)
// at the app's host. api: an API request, which only hub()'s API branch says, once its checks have passed: only that
// carries the account's cookie (and Chat's its bearer) and a body, and only its answer sets the account's cookie.
export async function forward(env, request, { app, path, api = false }) {
  const as = env[`${app}_ORIGIN`], via = env[`${app}_VIA`] || as;
  const method = request.method, read = method === "GET" || method === "HEAD", url = new URL(request.url);
  const h = hubHeaders(env, request, app);
  if (api) {
    const cookie = accountCookie(request);
    if (cookie) h.set("Cookie", cookie);
    const auth = app === "CHAT" && request.headers.get("Authorization");
    if (auth) h.set("Authorization", auth);
  }

  // (a body only to an API, and no more of it than the app takes: by what the browser says it's sending, which is all
  // that's read of it; and where it doesn't say (sent in chunks), counted as it's read, and refused past the cap
  // before any of it goes on)
  let body = null;
  if (api && !read && request.body) {
    const cap = CAPS[app], said = request.headers.get("Content-Length");
    if (said != null && !(Number(said) <= cap)) return refuse(413, SAID.big);
    body = said != null ? request.body : await upTo(request.body, cap);
    if (body === null) return refuse(413, SAID.big);
  }
  let res;
  try {
    // (written out, never resolved against the app's address: a path that starts // is still a path there)
    res = await fetch(`${new URL(via).origin}${path}`, { method, headers: h, body, redirect: "manual" });
  } catch (e) {
    console.error("hub", app, e && e.message);
    return refuse(502, SAID.down);
  }
  return answer(res, env, { api, here: url.origin, from: `${new URL(as).origin}${path}`, base: Object.keys(PAGES).find((k) => PAGES[k].app === app) });
}

// The app's answer, with the hub's rules on it (spec §3.7): only the account's cookie set, and only by an API; no outside
// beacon allowed by its CSP or left in its page; never sniffed; pages not indexed (the apps' own addresses are); a page
// marked as the hub's, with InFlite's manifest and icon, and kept by the browser only to be checked again.
function answer(res, env, { api, here, from, base }) {
  const h = new Headers(res.headers);
  h.delete("Set-Cookie");
  const cookies = api ? setCookiesOf(res).filter((c) => /^\s*(__Secure-)?account=/.test(c)) : [];
  for (const k of ["Content-Security-Policy", "Content-Security-Policy-Report-Only"]) { const v = h.get(k); if (v) h.set(k, noBeacon(v)); }
  if (!h.has("X-Content-Type-Options")) h.set("X-Content-Type-Options", "nosniff");
  // (never an app's worker over the whole site, nor an app's word wiping the whole site's storage)
  h.delete("Service-Worker-Allowed"); h.delete("Clear-Site-Data");
  if (!api) h.set("X-Robots-Tag", "noindex");
  const loc = h.get("Location");
  if (loc) h.set("Location", hubPath(loc, env, { from, here }));
  const html = !api && /^text\/html\b/i.test(h.get("Content-Type") || "");
  if (html) { h.delete("Content-Length"); h.delete("ETag"); h.set("Cache-Control", "no-cache, private"); }
  const out = new Response(res.body, { status: res.status, statusText: res.statusText, headers: h });
  for (const c of cookies) out.headers.append("Set-Cookie", c);
  if (!html || !res.body) return out;
  return new HTMLRewriter()
    .on('script[src*="cloudflareinsights"]', { element: (el) => el.remove() })
    .on('meta[name="ifl-hub"]', { element: (el) => el.remove() })
    .on("head", { element: (el) => el.prepend(`<meta name="ifl-hub" content="${base}">`, { html: true }) })
    .on('link[rel="manifest"]', { element: (el) => el.setAttribute("href", "/manifest.webmanifest") })
    .on('link[rel="apple-touch-icon"]', { element: (el) => el.setAttribute("href", "/icon-180.png") })
    .transform(out);
}

// An address on one of the apps' hosts, as it is at the hub: chat.'s /x → /chats/x (and its /_hub/x), weather.'s /x →
// /weather/x, fitness. → /fitness/, finance. → /markets/, email. → /mail/; an app's API path as it is (the hub answers
// it at the same path); this site's own address → its path. Anything else (account., auth., another site, another
// app's API on a host) as it was. from: what a relative address is relative to; here: the hub's own origin.
export function hubPath(href, env, { from, here } = {}) {
  let u;
  try { u = new URL(href, from); } catch { return href; }
  if (u.username || u.password || !/^https?:$/.test(u.protocol)) return href;
  const rest = u.pathname + u.search + u.hash, is = (o) => { try { return !!o && new URL(o).origin === u.origin; } catch { return false; } };
  // (a path that would read as another site's address, //x or /\x: left whole)
  const path = (p) => (/^\/[/\\]/.test(p) ? u.href : p);
  for (const [prefix, { app }] of Object.entries(PAGES)) {
    if (!is(env[`${app}_ORIGIN`]) && !is(env[`${app}_VIA`])) continue;
    if (u.pathname.startsWith("/api/")) return Object.entries(APIS).some(([k, a]) => a === app && u.pathname.startsWith(k)) ? rest : href;
    if (app === "CHAT" && u.pathname.startsWith("/_hub/")) return prefix + rest.slice(6);
    return prefix + rest.slice(1);
  }
  if (is(env.MAIL_ORIGIN)) return u.pathname.startsWith("/api/") ? href : "/mail/" + rest.slice(1);
  if (is(here) || is(env.TODAY_AS)) return path(rest);
  return href;
}

// (what every request to an app carries: spoken as the app, the browser's few headers, and the hub's key with what it
// knows of the browser: its address as Cloudflare saw it, never as the browser said, and where it is)
function hubHeaders(env, request, app) {
  const h = new Headers({ Origin: new URL(env[`${app}_ORIGIN`]).origin, "Sec-Fetch-Site": "same-origin" });
  for (const k of PASS) { const v = request.headers.get(k); if (v) h.set(k, v); }
  h.set("X-Hub-Key", env.HUB_KEY);
  const ip = request.headers.get("CF-Connecting-IP");
  if (ip) h.set("X-Hub-IP", ip);
  h.set("X-Hub-Geo", geoOf(request.cf));
  return h;
}
// (where the browser is, for the app: Cloudflare's own few words on it, base64url JSON)
function geoOf(cf) {
  const g = {};
  for (const k of GEO) if (cf && (typeof cf[k] === "string" || typeof cf[k] === "number")) g[k] = cf[k];
  let bin = "";
  for (const b of new TextEncoder().encode(JSON.stringify(g))) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
// (the two addresses of Cloudflare's Web Analytics beacon, out of a CSP: nothing here runs another site's script)
const noBeacon = (csp) => csp.split(";").map((d) => d.split(/\s+/).filter((t) => !/^https:\/\/(static\.)?cloudflareinsights\.com(\/\S*)?$/i.test(t)).join(" ")).join(";");
const setCookiesOf = (res) => (res.headers.getSetCookie ? res.headers.getSetCookie() : [res.headers.get("Set-Cookie")].filter(Boolean));
// (a body of no stated length, read up to the cap: its bytes, or null past it)
async function upTo(stream, cap) {
  const parts = [], reader = stream.getReader();
  let n = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    n += value.byteLength;
    if (n > cap) { reader.cancel().catch(() => {}); return null; }
    parts.push(value);
  }
  const out = new Uint8Array(n);
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.byteLength; }
  return out;
}
// (an address as the app's host will read it: decoded, backslashes as slashes, one slash at a time, and its . and ..
// worked out, as MAIN's own functions/_middleware.js plainPath does; a ? or # decoded out of it kept in the path)
function plainPath(p) {
  for (let i = 0; i < 4; i++) { let d; try { d = decodeURIComponent(p); } catch { break; } if (d === p) break; p = d; }
  p = p.replace(/\\/g, "/").replace(/\/{2,}/g, "/");
  try { return new URL(p.replace(/\?/g, "%3F").replace(/#/g, "%23"), "http://x").pathname.replace(/\/{2,}/g, "/"); } catch { return p; }
}
