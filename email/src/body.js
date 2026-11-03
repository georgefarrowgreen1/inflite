// Mail's Worker for the body shell (One roof stage 4, s4/spec §3.4; security-critical, deep review R3): GET|HEAD /body/
// → the shell with the Worker's headers (frame-ancestors and data-parents = hubOrigins(env), 404 with none switched on);
// /body/body.js?v=… and /body/body.css?v=… immutable; /body, /body/index.html and anything else under /body/ → 404.
// Called by index.js's fetch for /body and /body/* (wrangler.jsonc's run_worker_first). B0-b's stub: the signature is
// frozen and every answer is 404 until MB writes it.
import { hubOrigins } from "./hubgate.js";

export async function body(request, env) {
  return new Response("Not found", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
}
