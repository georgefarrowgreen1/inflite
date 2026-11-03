// One roof (stage 1, spec §8.1, D7, D10, D14): Weather is a module of InFlite's one page, so a document at /weather/ is
// that page (Today's index.html, the framework), never Weather's own. Asked by today/src/hub.js before anything else of
// the hub's (its key included), so the framework opens there even while the hub isn't ready (and then sends the page to
// Weather's own address itself, D13, D23).
//   ROOF_DOCS        the paths that are the framework's page at /weather/ (any query)
//   ROOF_FILES       the module's files (MAIN's weather/roof/*, through the hub): not found while the roof is off
//   roofOn(env)      whether Weather is a module here: always, unless the Worker's secret ROOF_OFF is "1" (roof.yml)
//   PAGE_HEADERS     the page's headers: the same CSP as today/public/_headers' /* (a unit test compares them)
//   roofPage(request, env)  the framework's page, from the assets, with PAGE_HEADERS set over theirs
//   RETIRE_SW, retireWorker(request)  what /weather/sw.js is while the roof is on: Weather's old worker at the hub,
//                    retired (§8.4)
export const ROOF_DOCS = /^\/weather\/(index\.html)?$/;
export const ROOF_FILES = /^\/weather\/roof\//;
export const roofOn = (env) => env?.ROOF_OFF !== "1";

// (exactly Weather's own lists, MAIN's functions/_wxapp.js CONNECT, without Cloudflare's beacon, and IMAGES: the
// forecast, places, radar and map are fetched by the page itself, as Weather does at its own address)
const CSP = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob: https://tilecache.rainviewer.com https://tile.openstreetmap.org https://tiles.openfreemap.org; font-src 'self'; connect-src 'self' https://api.open-meteo.com https://ensemble-api.open-meteo.com https://air-quality-api.open-meteo.com https://marine-api.open-meteo.com https://archive-api.open-meteo.com https://geocoding-api.open-meteo.com https://previous-runs-api.open-meteo.com https://api.bigdatacloud.net https://nominatim.openstreetmap.org https://api.rainviewer.com https://tiles.openfreemap.org; frame-src 'self'; manifest-src 'self'; worker-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; object-src 'none'";
export const PAGE_HEADERS = {
  "Content-Security-Policy": CSP,
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(self)",
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains",
  "Cache-Control": "no-cache",
  "X-Robots-Tag": "noindex",
};

// The framework's page for a document at /weather/: the assets' / asked afresh (no condition of the browser's passed
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

// Weather's old worker at /weather/ (milestone 1's, at the hub): when the browser next checks it for an update, it
// gets this, which takes over at once, deletes Weather's caches here (wx-*), unregisters itself, and sends each of its
// windows at /weather/ to the same address again, which is then the framework's page. Nothing else: no fetch, push or
// message of anyone's is answered by it. Served at the hub alone, only while the roof is on (MAIN's weather/sw.js stays
// Weather's own, at its own address, and the hub's again while the roof is off).
export const RETIRE_SW = `// InFlite: Weather's old worker at /weather/, retired (Weather opens in InFlite's one page now)
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil((async () => {
  try { for (const k of await caches.keys()) if (k.startsWith("wx-")) await caches.delete(k); } catch {}
  try { await self.registration.unregister(); } catch {}
  for (const c of await self.clients.matchAll({ type: "window" })) {
    try { if (new URL(c.url).pathname.startsWith("/weather/")) await c.navigate(c.url); } catch {}
  }
})()));
`;
export function retireWorker(request) {
  const headers = { "Content-Type": "text/javascript; charset=utf-8", "Cache-Control": "no-cache", "X-Content-Type-Options": "nosniff", "X-Robots-Tag": "noindex" };
  return new Response(request?.method === "HEAD" ? null : RETIRE_SW, { headers });
}
