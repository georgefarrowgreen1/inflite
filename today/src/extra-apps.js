// InFlite Status shares the public origin. This is a fixed service route, never
// an arbitrary URL proxy; operational report/tick endpoints stay private.
import { appFetch } from "./apps.js";
import { bodyUpTo } from "./body.js";
import { fetchUpstream } from "./upstream.js";
const API = /^\/api\/status(?:\/(?:day|hours|code|push-key|subscribe|unsubscribe))?$/;
const PAGE = /^\/status(?:\/|$)/;
const FILE = /^\/(?:index\.html|app\.js|theme\.js|styles\.css|icon\.svg|icon-180\.png|icons\/(?:today|chat|weather|fitness|markets|mail|account|home)\.svg|sw\.js|manifest\.webmanifest|feed\.xml)?$/;
const SAFE = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Cross-Origin-Resource-Policy": "same-origin", "Referrer-Policy": "no-referrer" };
const fail = (status) => new Response("Couldn’t open Status.", { status, headers: SAFE });
export const isExtraPath = (path) => PAGE.test(path) || path === "/api/status" || path.startsWith("/api/status/");
export async function extraApp(request, env) {
  const url = new URL(request.url), api = url.pathname.startsWith("/api/"), read = ["GET", "HEAD"].includes(request.method);
  if (!env.HUB_KEY) return fail(503);
  if (url.pathname === "/status") return new Response(null, { status: 308, headers: { ...SAFE, Location: "/status/" + url.search } });
  const path = api ? url.pathname : url.pathname.slice(7) || "/";
  if (api ? !API.test(path) : !FILE.test(path)) return fail(404);
  const subscription = /^\/api\/status\/(subscribe|unsubscribe)$/.test(path);
  if (read ? subscription : !subscription || request.method !== "POST") return fail(405);
  const site = request.headers.get("Sec-Fetch-Site");
  if (api && site && site !== "same-origin" && !(read && site === "none")) return fail(403);
  if (!read && request.headers.get("Origin") !== url.origin) return fail(403);
  let body;
  if (!read) {
    try { body = await bodyUpTo(request, 8192, { raw: true }); }
    catch { return fail(request.signal.aborted ? 499 : 400); }
    if (body === null) return fail(413);
  }
  // This exact host is the existing APPS service's Status route. Cookies,
  // authorization and arbitrary browser headers are deliberately not forwarded.
  const upstream = "https://status.inflite.ai", headers = new Headers({ Accept: request.headers.get("Accept") || "*/*", Origin: upstream, "Sec-Fetch-Site": "same-origin", "X-Hub-Key": env.HUB_KEY });
  for (const key of ["User-Agent", "CF-Connecting-IP", "If-None-Match", "If-Modified-Since"]) { const v = request.headers.get(key); if (v) headers.set(key, v); }
  if (!read) headers.set("Content-Type", "application/json");
  let res;
  try { res = await fetchUpstream((u, init) => appFetch(env, u, init), upstream + path + url.search, { method: request.method, headers, body, redirect: "manual", signal: request.signal }); }
  catch { return fail(request.signal.aborted ? 499 : 503); }
  const out = new Headers(res.headers);
  for (const key of ["Set-Cookie", "Service-Worker-Allowed", "Clear-Site-Data", "Content-Length"]) out.delete(key);
  out.set("X-Content-Type-Options", "nosniff"); out.set("Cross-Origin-Resource-Policy", "same-origin");
  const loc = out.get("Location");
  if (loc) {
    let to;
    try { to = new URL(loc, res.url || upstream + path); } catch {}
    if (!to || to.origin !== upstream || to.username || to.password) {
      res.body?.cancel().catch(() => {});
      return fail(502);
    }
    out.set("Location", (API.test(to.pathname) ? "" : "/status") + to.pathname + to.search + to.hash);
  }
  if (!api && path === "/manifest.webmanifest" && res.ok && request.method !== "HEAD") {
    try {
      const text = await bodyUpTo(res, 16 * 1024, { signal: AbortSignal.any([request.signal, AbortSignal.timeout(5000)]) });
      const data = text && JSON.parse(text);
      if (!data || typeof data !== "object" || Array.isArray(data)) return fail(502);
      data.start_url = "/status/"; data.scope = "/status/";
      data.icons = (data.icons || []).map(icon => ({ ...icon, src: "/status/" + String(icon.src || "").replace(/^\//, "") }));
      out.delete("ETag");
      return new Response(JSON.stringify(data), { status: res.status, headers: out });
    } catch { return fail(request.signal.aborted ? 499 : 502); }
  }
  return new Response(res.body, { status: res.status, headers: out });
}
