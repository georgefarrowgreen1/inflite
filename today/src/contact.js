import { bodyUpTo } from "./body.js";
import { fetchUpstream } from "./upstream.js";

const errors = {
  400: "Enter your name, a valid email address and a message of up to 4,000 characters.",
  403: "Open Contact on InFlite to send a message.",
  405: "Use the contact form to send a message.",
  413: "This message is too long. Please shorten it and try again.",
  415: "Send your message using the contact form.",
  429: "You’ve sent several messages. Please try again later.",
  503: "We couldn’t confirm delivery. You can email hello@inflite.ai.",
};
const reply = (status, ok = false) => Response.json(ok ? { ok: true } : { error: errors[status] }, {
  status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", ...(status === 405 ? { Allow: "POST" } : {}) },
});

export async function contact(request, env) {
  const url = new URL(request.url);
  if (request.method !== "POST") return reply(405);
  const site = request.headers.get("Sec-Fetch-Site");
  if (url.origin !== "https://inflite.ai" || request.headers.get("Origin") !== url.origin || (site && site !== "same-origin")) return reply(403);
  if (url.search) return reply(400);
  if (request.headers.get("Content-Type")?.split(";")[0].trim().toLowerCase() !== "application/json") return reply(415);
  // Cloudflare supplies this at ingress. Never use a forwarded address or a hub header supplied by the browser.
  const ip = request.headers.get("CF-Connecting-IP");
  if (!ip || !env.HUB_KEY || !env.APPS) return reply(503);
  let body;
  try {
    body = await bodyUpTo(request, 24 * 1024, { signal: AbortSignal.any([request.signal, AbortSignal.timeout(10000)]) });
  } catch { return reply(400); }
  if (body === null) return reply(413);

  try {
    const headers = { "Content-Type": "application/json", "X-Hub-Key": env.HUB_KEY, "X-Hub-IP": ip };
    const res = await fetchUpstream((target, init) => env.APPS.fetch(new Request(target, init)),
      "https://account.inflite.ai/api/inflite-contact", { method: "POST", headers, body, redirect: "manual" }, { signal: request.signal, timeout: 10000 });
    if (res.status === 201 && res.headers.get("Content-Type")?.startsWith("application/json")) {
      const text = await bodyUpTo(res, 256, { signal: AbortSignal.any([request.signal, AbortSignal.timeout(3000)]) });
      if (text && JSON.parse(text)?.ok === true) return reply(201, true);
    } else {
      res.body?.cancel().catch(() => {});
    }
    return reply([400, 413, 415, 429].includes(res.status) ? res.status : 503);
  } catch { return reply(503); }
}
