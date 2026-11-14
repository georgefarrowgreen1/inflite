// A fixed, same-origin proxy for private layout metadata. The expected owner is
// a precondition; the account service always resolves authority from its cookie.
import { forwardHeaders, todayOrigin, geoOf } from "./account.js";
import { appFetch } from "./apps.js";
import { bodyUpTo } from "./body.js";
import { fetchUpstream } from "./upstream.js";
const LIMIT = 16384;
const SAFE = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Cross-Origin-Resource-Policy": "same-origin", "Referrer-Policy": "no-referrer", "Content-Security-Policy": "sandbox; default-src 'none'; frame-ancestors 'none'" };
const json = (status, error) => Response.json({error}, {status, headers: SAFE});
export async function workspacesAPI(request, env) {
  const url = new URL(request.url), read = request.method === "GET";
  if (url.pathname !== "/api/workspaces" || !["GET", "PUT"].includes(request.method)) return json(404, "That workspace action was not found.");
  if (url.search) return json(400, "That workspace request is invalid.");
  if (request.signal.aborted) return json(499, "Workspace sync was cancelled.");
  const site = request.headers.get("Sec-Fetch-Site"), owner = request.headers.get("X-Inflite-Workspace-Owner");
  if (request.headers.has("Origin") && request.headers.get("Origin") !== url.origin || site && site !== "same-origin" || !read && (request.headers.get("Origin") !== url.origin || request.headers.get("X-Inflite") !== "1")) return json(403, "That request didn’t come from InFlite.");
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(owner || "")) return json(401, "Your account changed. Refresh InFlite before continuing.");
  const headers = forwardHeaders(request, todayOrigin(env, request), {accept:"application/json"}); headers.set("X-Inflite-Workspace-Owner", owner);
  const ip = request.headers.get("CF-Connecting-IP");
  if (env.HUB_KEY && ip) { headers.set("X-Hub-Key", env.HUB_KEY); headers.set("X-Hub-IP", ip); headers.set("X-Hub-Geo", geoOf(request.cf)); }
  let body;
  if (!read) {
    if (request.headers.get("Content-Type")?.split(";")[0].trim() !== "application/json") return json(415, "Workspace sync needs a JSON request.");
    try { body = await bodyUpTo(request, LIMIT); } catch (_) { return json(request.signal.aborted ? 499 : 400, "That workspace request couldn’t be read."); }
    if (body == null) return json(413, "That workspace layout is too large.");
    headers.set("Content-Type", "application/json");
  }
  try {
    const response = await fetchUpstream((target, init) => appFetch(env, target, init), `${env.ACCOUNT_ORIGIN}/api/account/today/workspaces`, {method:request.method,headers,body,redirect:"manual"}, {signal:request.signal,timeout:20000});
    if (response.status >= 300 && response.status < 400 || response.headers.get("Content-Type")?.split(";")[0].trim() !== "application/json") { response.body?.cancel().catch(()=>{}); return json(502,"Workspace sync couldn’t reach your account."); }
    const deadline = new AbortController(), timer = setTimeout(()=>deadline.abort(),20000); let text;
    try { text = await bodyUpTo(response, LIMIT + 1024, {signal:AbortSignal.any([request.signal,deadline.signal])}); } finally { clearTimeout(timer); }
    if (text == null) return json(502,"Workspace sync received an unexpected answer.");
    let value; try { value=JSON.parse(text); if(!value||typeof value!=="object"||Array.isArray(value))throw Error(); } catch (_) { return json(502,"Workspace sync received an unexpected answer."); }
    return new Response(text,{status:response.status,headers:{...SAFE,"Content-Type":"application/json; charset=utf-8"}});
  } catch (_) { return json(request.signal.aborted?499:502,"Workspace sync couldn’t finish. Your layout is kept on this device."); }
}
