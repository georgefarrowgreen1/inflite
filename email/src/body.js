// Mail's body shell, /body/ (One roof stage 4, spec §3.3–3.4). A message's body is drawn on InFlite's page only as a
// frame of this one page at Mail's own address, which fetches the message itself and draws it with scripts off. So
// nothing of a body ever reaches a document of inflite.ai: the page there gets a height and a few flags, nothing more.
//
// Answered only here (wrangler.jsonc's run_worker_first sends /body and /body/* to the Worker, index.js to us):
//   GET|HEAD /body/                       the shell, with the Worker's own headers (below), framed only by the hub
//                                         addresses switched on (hubgate.js hubOrigins: the same list as Mail's CORS
//                                         gate, one place decides); those addresses also written into the page
//                                         (data-parents), the only parents it will ever answer, and ?v=<BUILD> on its
//                                         script and style. With no hub address switched on: 404, so the shell exists
//                                         only while Mail is under the roof.
//   GET|HEAD /body/body.js?v=…, body.css?v=…   the file, kept a year (immutable: a new BUILD is a new address)
//   anything else under /body (/body, /body/index.html, /body/x, a file without ?v=, any other method)   404
import { hubOrigins } from "./hubgate.js";

const ORIGIN_RE = /^https?:\/\/[a-z0-9.-]+(:\d{1,5})?$/;
const V_RE = /^[\w.-]{1,32}$/;
const FILES = { "/body/body.js": "text/javascript; charset=utf-8", "/body/body.css": "text/css; charset=utf-8" };
// (what the assets must say a file is before it's sent as one: Mail's assets answer a missing file with Mail's own page,
// 200 text/html (wrangler.jsonc's single-page-application), which must never go out under the shell's name)
const ASSET_TYPE = { "/body/body.js": /^(text|application)\/(javascript|ecmascript)\b/i, "/body/body.css": /^text\/css\b/i };
// (the shell's own mark: its html element, with data-parents empty for this Worker to fill)
const SHELL_MARK = /<html\b[^>]*\sdata-parents=""/i;

// The shell's own policy. Its img-src only matters inside the inner frame, whose own meta policy narrows it to data:
// and 'self' unless remote pictures are allowed; the inner frame (srcdoc) inherits all of this as well.
export const BODY_CSP_BASE =
  "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https: http:; font-src data: https:; media-src https:; connect-src 'self'; frame-src 'self' about:; base-uri 'none'; form-action 'none'; object-src 'none'";
const SHELL_HEADERS = {
  "Content-Type": "text/html; charset=utf-8",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Cross-Origin-Resource-Policy": "same-site",
  "Cache-Control": "private, max-age=300",
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains",
};

const notFound = () =>
  new Response("Not found", {
    status: 404,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'" },
  });

// The build in Mail's deployed app.js (as index.js's appBuild reads it), once per deployment: the shell's ?v=. Only a
// build read is kept. If it can't be read, this deployment's own id stands in (asked again next time), or with none, an
// address never used before: never one constant, which a browser holding an older body.js for a year would take as its.
let buildCache = null;
export async function mailBuild(env, request) {
  const deploy = String(env.BUILD_ID || env.CF_VERSION_METADATA?.id || "").replace(/[^\w]/g, "").slice(0, 31);
  const key = deploy || "dev";
  if (buildCache?.key === key) return buildCache.build;
  try {
    const r = await env.ASSETS.fetch(new Request(new URL("/app.js", request.url)));
    const m = r.ok && /const BUILD = "([\d.]+)"/.exec(await r.text());
    if (m) {
      buildCache = { key, build: m[1] };
      return m[1];
    }
  } catch {}
  return `d${deploy || `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`}`;
}

export async function body(request, env) {
  let origins = [];
  try {
    origins = await hubOrigins(env);
  } catch {}
  return serveBody(request, env, origins);
}

// (the same, given the switched-on origins: body() asks hubgate.js for them; the unit test gives them)
export async function serveBody(request, env, origins) {
  const url = new URL(request.url);
  const method = request.method;
  if (method !== "GET" && method !== "HEAD") return notFound();
  const parents = (Array.isArray(origins) ? origins : []).filter((o) => typeof o === "string" && ORIGIN_RE.test(o));

  if (url.pathname === "/body/") {
    if (!parents.length) return notFound();
    const res = await env.ASSETS.fetch(new Request(new URL("/body/", request.url), { method: "GET" }));
    const page = res.ok ? await res.text() : "";
    if (!SHELL_MARK.test(page)) return notFound();
    const build = await mailBuild(env, request);
    const html = page
      .replace('data-parents=""', `data-parents="${parents.join(" ")}"`)
      .replaceAll("?v=0", `?v=${build}`);
    const headers = new Headers(SHELL_HEADERS);
    headers.set("Content-Security-Policy", `${BODY_CSP_BASE}; frame-ancestors ${parents.join(" ")}`);
    return new Response(method === "HEAD" ? null : html, { status: 200, headers });
  }

  const type = FILES[url.pathname];
  const v = url.searchParams.get("v");
  if (type && v && V_RE.test(v) && [...url.searchParams.keys()].length === 1) {
    const res = await env.ASSETS.fetch(new Request(new URL(url.pathname, request.url), { method: "GET" }));
    if (!res.ok || !ASSET_TYPE[url.pathname].test(res.headers.get("Content-Type") || "")) return notFound();
    return new Response(method === "HEAD" ? null : res.body, {
      status: 200,
      headers: {
        "Content-Type": type,
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
        "Cross-Origin-Resource-Policy": "same-site",
        "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
      },
    });
  }
  return notFound();
}
