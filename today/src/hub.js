// InFlite's hub (Today First, spec §3.3): Chats, Weather, Fitness and Markets as pages of inflite.ai, in one window
// with Today. Each is fetched from the app's own address (chat., weather., fitness., finance.inflite.ai), spoken for
// with that app's own Origin once this Worker has made the checks its api() makes, and given back with the hub's
// headers and its marker (<meta name="ifl-hub" content="/weather/">, which is what tells every page it's at the hub).
//   isHubPath(pathname) → whether the hub answers it (today/src/index.js asks, before anything else)
//   hub(request, env, ctx) → the answer
//   forward(env, request, { app, path }) → the app's answer to one request, as the hub gives it back
//   hubPath(href, env, { from, here }) → an address on an app's host as it is at the hub (IFL.hub.go's twin)
// The apps' hosts take what this Worker says of the browser (its address and where it is) only with its key
// (X-Hub-Key, the HUB_KEY secret; MAIN's functions/_middleware.js checks it). Without the key nothing here is served
// (503), and GET /api/hub says so to Today's page, which then links to each app's own address, as before.
// Never the assets binding: Today's own files are the assets', and none of these paths are.
import { accountCookie } from "./account.js";

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

// whether the hub can serve: its key, and every app's address
const ready = (env) => !!env?.HUB_KEY && APPS.every((a) => !!env[`${a}_ORIGIN`]);

export async function hub(request, env, ctx) {
  const url = new URL(request.url), p = url.pathname, method = request.method, read = method === "GET" || method === "HEAD";
  // (Today's page asks once a visit whether the hub's there: until it is, it links to each app's own address)
  if (p === "/api/hub") return read ? json({ ready: ready(env) }) : refuse(405, SAID.method);
  if (!env?.HUB_KEY) return refuse(503, SAID.notReady);

  // ---- an app's API, at the same path as on its own host ----
  const api = Object.keys(APIS).find((k) => p.startsWith(k));
  if (api) {
    const app = APIS[api];
    if (!METHODS.has(method)) return refuse(405, SAID.method);
    // (the apps' server-to-server routes, however the address is written)
    if (NEVER.test(p) || NEVER.test(plainPath(p))) return refuse(404, SAID.gone);
    // Same-site pages elsewhere on inflite.ai carry the account's cookie too, so only this site's own pages are
    // answered: a GET from its own page, or one typed or opened from the Home Screen (none); anything else only from
    // its own page, saying so (Origin). (No Sec-Fetch-Site at all: a browser from before it, as api() takes them.)
    const site = request.headers.get("Sec-Fetch-Site");
    if (site && !(site === "same-origin" || (read && site === "none"))) return refuse(403, SAID.notHub);
    if (!read && request.headers.get("Origin") !== url.origin) return refuse(403, SAID.notHub);
    if (!env[`${app}_ORIGIN`]) return refuse(503, SAID.notReady);
    return forward(env, request, { app, path: p + url.search });
  }

  // ---- an app's pages and files ----
  const m = PAGE_RE.exec(p), prefix = `/${m[1]}/`, page = PAGES[prefix];
  if (!read) return refuse(405, SAID.method);
  if (!env[`${page.app}_ORIGIN`]) return refuse(503, SAID.notReady);
  if (p === prefix.slice(0, -1)) return new Response(null, { status: 301, headers: { Location: `${url.origin}${prefix}${url.search}`, ...SAFE } });
  // (/weather/x is weather.'s /x, /chats/x Chat's /_hub/x; /<app>/version each one's own version, as its updater asks)
  return forward(env, request, { app: page.app, path: (page.under || "/") + p.slice(prefix.length) + url.search });
}

// One request to the app, on the browser's behalf, and its answer as the hub gives it back. path: the path (and query)
// at the app's host. Only an API request carries the account's cookie (and Chat's its bearer) and a body.
export async function forward(env, request, { app, path }) {
  const as = env[`${app}_ORIGIN`], via = env[`${app}_VIA`] || as, api = path.startsWith("/api/");
  const method = request.method, read = method === "GET" || method === "HEAD", url = new URL(request.url);
  const h = new Headers({ Origin: new URL(as).origin, "Sec-Fetch-Site": "same-origin" });
  for (const k of PASS) { const v = request.headers.get(k); if (v) h.set(k, v); }
  if (api) {
    const cookie = accountCookie(request);
    if (cookie) h.set("Cookie", cookie);
    const auth = app === "CHAT" && request.headers.get("Authorization");
    if (auth) h.set("Authorization", auth);
  }
  h.set("X-Hub-Key", env.HUB_KEY);
  const ip = request.headers.get("CF-Connecting-IP");
  if (ip) h.set("X-Hub-IP", ip);
  h.set("X-Hub-Geo", geoOf(request.cf));

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
// (an address as the app's host will read it: decoded, backslashes as slashes, one slash at a time)
function plainPath(p) {
  for (let i = 0; i < 4; i++) { let d; try { d = decodeURIComponent(p); } catch { break; } if (d === p) break; p = d; }
  return p.replace(/\\/g, "/").replace(/\/{2,}/g, "/");
}
