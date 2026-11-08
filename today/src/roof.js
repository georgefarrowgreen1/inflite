// One roof (stage 1, spec §8.1, D7, D10, D14; stages 2–4, s24-contracts §1): each app that's a module of InFlite's one
// page has its document there be that page (Today's index.html, the framework), never the app's own. Asked by
// today/src/hub.js before anything else of the hub's (its key included), so the framework opens there even while the hub
// isn't ready (and then sends the page to the app's own address itself, D13, D23). Mail's /mail/ is mailroof.js's.
//   MODS             the apps that can be modules here, each with its own switch
//   roofOn(env, app) whether the app is a module here. Weather: always, unless the Worker's secret ROOF_OFF or
//                    ROOF_OFF_WEATHER is "1"; every other app only while its ROOF_<APP> is exactly "1" (opt-in: a Worker
//                    without its secrets is the hub's pages), and never while ROOF_OFF is "1" (roof.yml)
//   appsOn(env)      { [app]: roofOn(env, app) } over MODS: GET /api/hub's apps
//   modOf(path, search)  the app whose document this path is (/<app>/, /<app>/index.html), else null; Chats' only with
//                    no engine in the query (?engine=1 is milestone 1's engine, framed by Today), and never /chats/in/
//                    (Chat's own page, for signing in and keys: stage 3, S3-D8)
//   docOf(app), filesOf(app)  that app's document paths, and its module's files (MAIN's <app>/roof/*, through the hub)
//   ROOF_DOCS, ROOF_FILES     Weather's (stage 1's names)
//   PAGE_HEADERS     the page's headers: the same CSP as today/public/_headers' /* (a unit test compares them)
//   roofPage(request, env)  the framework's page, from the assets, with PAGE_HEADERS set over theirs
//   RETIRE_SW, retireWorker(request)  what /weather/sw.js is while the roof is on: Weather's old worker at the hub,
//                    retired (§8.4)
// Stage 3 adds chats (ROOF_CHATS "1", opt-in as the others): its document /chats/, its files /chats/roof/* (MAIN's
// pigeon/roof/, through the hub's Chat copy), its old worker /chats/sw.js (milestone 1's Chat at the hub)
export const MODS = Object.freeze(["weather", "markets", "fitness", "mail", "chats"]);
export const roofOn = (env, app = "weather") => env?.ROOF_OFF !== "1" && (app === "weather" ? env?.ROOF_OFF_WEATHER !== "1" : env?.["ROOF_" + String(app).toUpperCase()] === "1");
export const appsOn = (env) => Object.fromEntries(MODS.map((a) => [a, roofOn(env, a)]));
export const docOf = (app) => new RegExp(`^/${app}/(index\\.html)?$`);
export const filesOf = (app) => new RegExp(`^/${app}/roof/`);
const DOC = new RegExp(`^/(${MODS.join("|")})/(index\\.html)?$`);
const engine = (q) => { try { return new URLSearchParams(q || "").has("engine"); } catch { return false; } };
export const modOf = (p, q = "") => { const a = DOC.exec(p)?.[1] || null; return a === "chats" && engine(q) ? null : a; };
export const ROOF_DOCS = docOf("weather");
export const ROOF_FILES = filesOf("weather");

// (exactly Weather's own lists, MAIN's functions/_wxapp.js CONNECT, without Cloudflare's beacon, and IMAGES: the
// forecast, places, radar and map are fetched by the page itself, as Weather does at its own address; and Chats': its
// voice pigeons played from blob: (media-src), the camera for a friend's code, the microphone for voice, where you are
// for Look Up (Permissions-Policy, this site's own page only); never 'wasm-unsafe-eval': no Argon2 runs here, S3-D8)
const CSP = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob: https://tilecache.rainviewer.com https://tile.openstreetmap.org https://tiles.openfreemap.org; font-src 'self'; connect-src 'self' wss://streamer.finance.yahoo.com https://email.inflite.ai http://email.ifl.test:8788 https://api.open-meteo.com https://ensemble-api.open-meteo.com https://air-quality-api.open-meteo.com https://marine-api.open-meteo.com https://archive-api.open-meteo.com https://geocoding-api.open-meteo.com https://previous-runs-api.open-meteo.com https://api.bigdatacloud.net https://nominatim.openstreetmap.org https://api.rainviewer.com https://tiles.openfreemap.org; media-src 'self' blob:; frame-src 'self' https://email.inflite.ai http://email.ifl.test:8788; manifest-src 'self'; worker-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; object-src 'none'";
export const PAGE_HEADERS = {
  "Content-Security-Policy": CSP,
  "Permissions-Policy": "camera=(self), microphone=(self), geolocation=(self)",
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains",
  "Cache-Control": "no-cache",
  "X-Robots-Tag": "noindex",
};

// The framework's page for a document at a module's address (/weather/, /markets/, …): the assets' / asked afresh (no condition of the browser's passed
// on, so always the whole page, never a 304 for a page the browser kept from somewhere else), with the page's headers
// set over whatever the assets sent (one CSP, never two), and no body for a HEAD.
export async function roofPage(request, env) {
  const method = request.method === "HEAD" ? "HEAD" : "GET";
  const res = await env.ASSETS.fetch(new Request(new URL("/", request.url), { method }));
  const h = new Headers(res.headers);
  for (const k of ["ETag", "Last-Modified", "Content-Security-Policy-Report-Only"]) h.delete(k);
  for (const [k, v] of Object.entries(PAGE_HEADERS)) h.set(k, v);
  if (method === "HEAD") { if (res.body) res.body.cancel().catch(() => {}); return new Response(null, { status: res.status, statusText: res.statusText, headers: h }); }
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers: h });
}

// An app's old worker at /<app>/ (milestone 1's, at the hub): when the browser next checks it for an update, it gets
// this, which takes over at once, deletes that app's caches here (its own prefix: Weather wx-, Markets markets-app-,
// Fitness fitness-app-, Chat inflight-shell), unregisters itself, and sends each of its windows at /<app>/ to the same
// address again, which is then the framework's page. Nothing else: no fetch, push or message of anyone's is answered by
// it. Served at the hub alone, only while that app's switch is on (the apps' own sw.js stay theirs, at their own
// addresses, and the hub's again while it's off). RETIRE_SW is Weather's (stage 1's name).
// Chats' (stage 3, risk I11) first asks each window at exactly /chats/ or /chats/index.html to route where it is
// ({ ifl: "route" }, as the root worker's openIn), and sends there again only one that doesn't say it's routed within a
// second: that one is milestone 1's page; a window that answers is the framework already, maybe mid-message, and isn't
// reloaded. Never a window at /chats/in/ (Chat's own page, signing in) nor Today's engine (?engine, framed).
const CACHES = { weather: "wx-", markets: "markets-app-", fitness: "fitness-app-", chats: "inflight-shell" };
export const NAMES = { weather: "Weather", markets: "Markets", fitness: "Fitness", mail: "Mail", chats: "Chats" };
const sendAgain = (app) => app === "chats" ? `  const asked = async (c) => {
    const u = new URL(c.url);
    if (c.frameType === "nested" || u.searchParams.has("engine") || (u.pathname !== "/chats/" && u.pathname !== "/chats/index.html")) return;
    const routed = await new Promise((ok) => {
      let ch = null;
      try { ch = new MessageChannel(); } catch {}
      if (!ch) return ok(false);
      const t = setTimeout(() => { try { ch.port1.close(); } catch {} ok(false); }, 1000);
      ch.port1.onmessage = (m) => { if (m.data?.ifl === "routed") { clearTimeout(t); try { ch.port1.close(); } catch {} ok(true); } };
      try { c.postMessage({ ifl: "route", url: u.pathname + u.search + u.hash }, [ch.port2]); } catch { clearTimeout(t); ok(false); }
    });
    if (!routed) await c.navigate(c.url);
  };
  await Promise.all((await self.clients.matchAll({ type: "window", includeUncontrolled: true })).map((c) => asked(c).catch(() => {})));
` : `  for (const c of await self.clients.matchAll({ type: "window" })) {
    try { if (new URL(c.url).pathname.startsWith("/${app}/")) await c.navigate(c.url); } catch {}
  }
`;
export const retireSw = (app = "weather") => `// InFlite: ${NAMES[app]}'s old worker at /${app}/, retired (${NAMES[app]} opens in InFlite's one page now)
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil((async () => {
  try { for (const k of await caches.keys()) if (k.startsWith("${CACHES[app]}")) await caches.delete(k); } catch {}
  try { await self.registration.unregister(); } catch {}
${sendAgain(app)}})()));
`;
export const RETIRE_SW = retireSw("weather");
export function retireWorker(request, app = "weather") {
  const headers = { "Content-Type": "text/javascript; charset=utf-8", "Cache-Control": "no-cache", "X-Content-Type-Options": "nosniff", "X-Robots-Tag": "noindex" };
  return new Response(request?.method === "HEAD" ? null : CACHES[app] ? retireSw(app) : "", { headers });
}
