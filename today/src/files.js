// InFlite Files has a bounded binary API alongside Today's small JSON API.
// Storage and authorization remain at the account service; the browser speaks
// only to its own OS origin and never receives a bucket name or storage key.
import { forwardHeaders, todayOrigin, geoOf } from "./account.js";
import { appFetch } from "./apps.js";
import { bodyUpTo } from "./body.js";
import { fetchUpstream } from "./upstream.js";

const MAX_FILE = 25 * 1024 * 1024, MAX_JSON = 4096, MAX_REPLY = 128 * 1024;
const ROUTES = new Set(["GET list", "GET item", "GET limits", "POST search", "POST folders", "POST uploads", "POST move", "PATCH item", "DELETE item", "GET content", "PUT content"]);
const QUERY = new Set(["id", "parentId", "view", "sort", "kind", "cursor", "version", "download"]);
const SAFE = { "Cache-Control": "private, no-store", "Content-Security-Policy": "sandbox; default-src 'none'; frame-ancestors 'none'", "X-Content-Type-Options": "nosniff", "Cross-Origin-Resource-Policy": "same-origin", "Referrer-Policy": "no-referrer" };
const json = (status, error) => new Response(JSON.stringify({ error }), { status, headers: { ...SAFE, "Content-Type": "application/json; charset=utf-8" } });
export const isFilesAPI = pathname => pathname === "/api/files" || pathname.startsWith("/api/files/");

export async function filesAPI(request, env) {
  const url = new URL(request.url), action = url.pathname.slice("/api/files/".length), head = request.method === "HEAD", method = head ? "GET" : request.method, read = method === "GET";
  if (request.signal.aborted) return json(499, "Upload cancelled.");
  if (!ROUTES.has(`${method} ${action}`)) return json(404, "That Files action was not found.");
  const site = request.headers.get("Sec-Fetch-Site");
  if (site && site !== "same-origin" && !(read && site === "none")) return json(403, "That request didn’t come from InFlite.");
  if (!read && (request.headers.get("Origin") !== url.origin || request.headers.get("X-Inflite") !== "1")) return json(403, "That request didn’t come from InFlite.");
  const expectedOwner = request.headers.get("X-Inflite-Files-Owner"), nativeDownload = read && action === "content";
  if (!(nativeDownload && expectedOwner === null) && !/^[A-Za-z0-9_-]{1,80}$/.test(expectedOwner || "")) return json(401, "Your account changed. Refresh InFlite before continuing.");
  const query = new URLSearchParams();
  for (const [key, value] of url.searchParams) {
    if (!QUERY.has(key) || query.has(key) || value.length > 160 || /[\u0000-\u001f\u007f]/.test(value)) return json(400, "That file request is invalid.");
    query.set(key, value);
  }
  const binary = method === "PUT" && action === "content";
  const headers = forwardHeaders(request, todayOrigin(env, request), { accept: "application/json" });
  if (expectedOwner !== null) headers.set("X-Inflite-Files-Owner", expectedOwner);
  const ip = request.headers.get("CF-Connecting-IP");
  if (env.HUB_KEY && ip) { headers.set("X-Hub-Key", env.HUB_KEY); headers.set("X-Hub-IP", ip); headers.set("X-Hub-Geo", geoOf(request.cf)); }
  let body = null, overflow = false;
  if (!read) {
    if (binary) {
      const length = request.headers.get("Content-Length");
      if (length != null && (!/^\d{1,10}$/.test(length) || Number(length) > MAX_FILE)) return json(413, "Choose a file no larger than 25 MB.");
      headers.set("Content-Type", "application/octet-stream");
      if (length != null) headers.set("Content-Length", length);
      if (request.body) {
        let count = 0;
        body = request.body.pipeThrough(new TransformStream({ transform(chunk, controller) {
          count += chunk.byteLength;
          if (count > MAX_FILE) { overflow = true; controller.error(new Error("File upload is too large")); return; }
          controller.enqueue(chunk);
        } }));
      }
    } else {
      if (request.headers.get("Content-Type")?.split(";")[0].trim() !== "application/json" && method !== "DELETE") return json(415, "Files needs a JSON request.");
      try { body = await bodyUpTo(request, MAX_JSON); }
      catch (_) { return json(request.signal.aborted ? 499 : 400, request.signal.aborted ? "Upload cancelled." : "That file request couldn’t be read."); }
      if (body == null) return json(413, "That file request is too large.");
      headers.set("Content-Type", "application/json");
      body ||= "{}";
    }
  }
  if (read && action === "content") {
    const range = request.headers.get("Range");
    if (range) { if (!/^bytes=\d{0,12}-\d{0,12}$/.test(range)) return json(416, "That file range is unavailable."); headers.set("Range", range); }
  }
  try {
    const suffix = query.size ? `?${query}` : "";
    const response = await fetchUpstream((target, init) => appFetch(env, target, init), `${env.ACCOUNT_ORIGIN}/api/account/today/files/${action}${suffix}`, { method, headers, body: body ?? undefined, redirect: "manual", ...(body instanceof ReadableStream ? { duplex: "half" } : {}) }, { signal: request.signal, timeout: binary ? 120e3 : 20e3 });
    if (overflow) { response.body?.cancel().catch(() => {}); return json(413, "Choose a file no larger than 25 MB."); }
    if (response.status >= 300 && response.status < 400) { response.body?.cancel().catch(() => {}); return json(502, "Files couldn’t reach your account. Try again."); }
    const type = response.headers.get("Content-Type")?.split(";")[0].trim();
    if (read && action === "content" && response.ok) {
      if (type !== "application/octet-stream") { response.body?.cancel().catch(() => {}); return json(502, "That file couldn’t be downloaded."); }
      const output = new Headers(SAFE);
      for (const name of ["Content-Type", "Content-Length", "Content-Range", "Accept-Ranges", "Content-Disposition"]) { const value = response.headers.get(name); if (value) output.set(name, value); }
      if (head) response.body?.cancel().catch(() => {});
      return new Response(head ? null : response.body, { status: response.status, headers: output });
    }
    if (type !== "application/json") { response.body?.cancel().catch(() => {}); return json(502, "Files couldn’t reach your account. Try again."); }
    const bodyDeadline = new AbortController(), timer = setTimeout(() => bodyDeadline.abort(new Error("Files answer timed out")), 20e3);
    let text;
    try { text = await bodyUpTo(response, MAX_REPLY, { signal: AbortSignal.any([request.signal, bodyDeadline.signal]) }); }
    finally { clearTimeout(timer); }
    if (text == null) return json(502, "Files received an unexpected answer. Try again.");
    try { const value = JSON.parse(text); if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(); }
    catch (_) { return json(502, "Files received an unexpected answer. Try again."); }
    return new Response(head ? null : text, { status: response.status, headers: { ...SAFE, "Content-Type": "application/json; charset=utf-8" } });
  } catch (_) { return json(overflow ? 413 : request.signal.aborted ? 499 : 502, overflow ? "Choose a file no larger than 25 MB." : request.signal.aborted ? "Upload cancelled." : "Files couldn’t reach your account. Try again."); }
}
