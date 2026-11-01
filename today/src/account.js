// Signing in is inflite's account's (account.inflite.ai). Its cookie covers every address on inflite.ai, so the browser
// sends it here too; this Worker passes it on to the account's address, which answers everything Today shows. (The
// account side is functions/_todayapp.js in the georgefarrowgreen repo: TODAY_ROUTES.) Nothing the browser sent is
// passed on but the account's cookie and these few headers.

const COOKIE_RE = /(?:^|;\s*)((?:__Secure-)?account=[A-Za-z0-9_-]{20,100})(?=;|$)/g;

// Only the account's cookie is passed on, never anything else the browser sent.
export function accountCookie(request) {
  const found = [...(request.headers.get("Cookie") || "").matchAll(COOKIE_RE)].map((m) => m[1]);
  return found.length ? found.join("; ") : null;
}

// What goes with each request to the account: its cookie, the browser's own User-Agent and X-Home-Screen, the address
// Cloudflare's edge saw it come from, and Today's own origin as Origin (set here, after this Worker's own checks, so the
// account can check it on a GET too, which a browser's same-origin GET doesn't send)
export function forwardHeaders(request, origin, { body = false, accept = "application/json" } = {}) {
  const h = new Headers({ Accept: accept, Origin: origin });
  const cookie = accountCookie(request);
  if (cookie) h.set("Cookie", cookie);
  for (const k of ["User-Agent", "X-Home-Screen", "CF-Connecting-IP"]) {
    const v = request.headers.get(k);
    if (v) h.set(k, v);
  }
  if (body) h.set("Content-Type", "application/json");
  return h;
}

// A request to the account's address, on the browser's behalf: its answer, or null when it can't be reached or doesn't
// answer in time (a slow account is the same as one that's down)
export async function ask(env, request, { method = "GET", path, query = null, body = null, timeout = 8000, accept } = {}) {
  const origin = new URL(request.url).origin;
  const q = query && [...query.keys()].length ? `?${query}` : "";
  try {
    return await fetch(`${env.ACCOUNT_ORIGIN}/api/account/${path}${q}`, {
      method,
      headers: forwardHeaders(request, origin, { body: body != null, accept }),
      body: body ?? undefined,
      redirect: "manual",
      signal: AbortSignal.timeout(timeout),
    });
  } catch {
    return null;
  }
}

// The account's Set-Cookie headers, each one, to pass back to the browser (sign-in, its renewal, sign-out)
export const setCookies = (res) => (res.headers.getSetCookie ? res.headers.getSetCookie() : [res.headers.get("Set-Cookie")].filter(Boolean));
