// One roof, stage 4 (Mail under the roof, spec §6.2, §2.3): with Mail's switch on (roofOn(env, "mail"): the Worker's
// secret ROOF_MAIL "1", and ROOF_OFF not "1"), a document at /mail/ is InFlite's one page (the framework, as /weather/
// is), and Mail's module files, which are Mail's own (the inflite repo's email/public/roof/, served by Mail's Worker at
// email.inflite.ai/roof/), are passed through here, at /mail/roof/, so the page loads them from its own origin. Code only:
// no cookie goes to Mail, no header but Accept and If-None-Match, and nothing comes back that isn't a script or a
// stylesheet. Never an API call: the page asks Mail's API itself (S4-D2), so no mail ever crosses this Worker.
// With the switch off (absent, as it ships), /mail/roof/* and /mail/version are not found, so a page that missed the
// change can't start the module; the rest of /mail/ is milestone 1's framed page (today/src/mailhost.js) exactly.
//   mailRoof(request, env) → the answer for a path of Mail's under the roof, or null for mailPage to answer as it does
//     GET|HEAD /mail/, /mail/index.html   the framework's page (roof.js roofPage)
//     GET|HEAD /mail/roof/<file>.js|.css   Mail's /roof/<file>, Cache-Control no-cache, nosniff (else 404, or 502)
//     GET|HEAD /mail/version               Mail's /roof/version, { build }, never kept
// Mail's Worker is reached by the service binding MAIL where wrangler.toml has one (the fallback, BI20), else at
// MAIL_VIA (the tests' stand-in, RI13), else at MAIL_ORIGIN, in this zone, so Cloudflare sends it to Mail's Worker.
import { roofOn, roofPage } from "./roof.js";

const DOCS = /^\/mail\/(index\.html)?$/;
const FILES = /^\/mail\/roof\//;
const FILE = /^\/mail\/roof\/([\w-][\w.-]{0,79}\.(?:js|css))$/;
const ORIGIN = /^https?:\/\/[a-z0-9.-]+(:\d{1,5})?$/i;
// (what a module file may be, by what it's called)
const TYPES = { js: /^(text|application)\/javascript\b/i, css: /^text\/css\b/i };
const SAFE = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'", "Cross-Origin-Resource-Policy": "same-origin" };
const said = (status, words, extra = {}) => new Response(words, { status, headers: { "Content-Type": "text/plain; charset=utf-8", ...SAFE, ...extra } });
const originOf = (v) => (typeof v === "string" && ORIGIN.test(v) ? v.toLowerCase() : null);

// One request to Mail's Worker for one of its files, carrying nothing of the browser's but these two
async function askMail(env, path, request) {
  const mail = originOf(env.MAIL_ORIGIN);
  if (!mail) return null;
  const headers = new Headers();
  for (const k of ["Accept", "If-None-Match"]) { const v = request.headers.get(k); if (v && v.length <= 512) headers.set(k, v); }
  const method = request.method === "HEAD" ? "HEAD" : "GET", init = { method, headers, redirect: "manual" };
  if (typeof env.MAIL?.fetch === "function") return env.MAIL.fetch(new Request(mail + path, init));
  return fetch((originOf(env.MAIL_VIA) || mail) + path, init);
}

export async function mailRoof(request, env) {
  const url = new URL(request.url), p = url.pathname, method = request.method, read = method === "GET" || method === "HEAD";
  const file = FILES.test(p), version = p === "/mail/version";
  if (!file && !version && !DOCS.test(p)) return null;
  if (!roofOn(env, "mail")) return file || version ? said(404, "Not found.") : null;
  if (!read) return file || version ? said(405, "Mail’s files don’t do that.", { Allow: "GET, HEAD" }) : null;
  if (!file && !version) return roofPage(request, env);

  const m = file ? FILE.exec(p) : null;
  if (file && !m) return said(404, "Not found.");
  let res;
  try {
    res = await askMail(env, file ? `/roof/${m[1]}` : "/roof/version", request);
  } catch (e) {
    console.error("mail roof", e && e.message);
    return said(502, "Mail can’t be reached just now.");
  }
  if (!res) return said(503, "Mail isn’t ready here yet.");
  if (res.status === 404) { res.body?.cancel?.().catch?.(() => {}); return said(404, "Not found."); }

  if (version) {
    // ({ build } and nothing else, read and written again here)
    let build = null;
    try { if (res.status === 200 && /^application\/json\b/i.test(res.headers.get("Content-Type") || "")) build = (await res.json())?.build; } catch (_) {}
    if (!(typeof build === "string" || typeof build === "number") || !/^\d{1,4}(\.\d{1,4})?$/.test(String(build))) { res.body?.cancel?.().catch?.(() => {}); return said(502, "Mail can’t be reached just now."); }
    return new Response(method === "HEAD" ? null : JSON.stringify({ build }), { headers: { "Content-Type": "application/json; charset=utf-8", ...SAFE } });
  }

  const ext = m[1].endsWith(".css") ? "css" : "js", type = res.headers.get("Content-Type") || "";
  const headers = { "Cache-Control": "no-cache", "X-Content-Type-Options": "nosniff" };
  const etag = res.headers.get("ETag");
  if (etag && etag.length <= 200) headers.ETag = etag;
  if (res.status === 304) { res.body?.cancel?.().catch?.(() => {}); return new Response(null, { status: 304, headers }); }
  if (res.status !== 200 || !TYPES[ext].test(type)) {
    res.body?.cancel?.().catch?.(() => {});
    return said(502, "Mail can’t be reached just now.");
  }
  headers["Content-Type"] = ext === "css" ? "text/css; charset=utf-8" : "text/javascript; charset=utf-8";
  if (method === "HEAD") { res.body?.cancel?.().catch?.(() => {}); return new Response(null, { headers }); }
  return new Response(res.body, { headers });
}
