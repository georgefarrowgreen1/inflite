// Signing in is inflite's account's (account.inflite.ai). Its cookie covers every address on inflite.ai, so the browser
// sends it here too; this Worker passes it to the account's address, which says who it is and whether they may open
// Mail: the site's admin, with a passkey, that has confirmed it's them in the last 12 hours.
// (The account side is functions/_mailapp.js in the georgefarrowgreen repo.)

const COOKIE_RE = /(?:^|;\s*)((?:__Secure-)?account=[A-Za-z0-9_-]{20,100})(?=;|$)/g;
const CHECK_TTL = 60 * 1000;

// Only the account's cookie is passed on, never anything else the browser sent.
export function accountCookie(request) {
  const found = [...(request.headers.get("Cookie") || "").matchAll(COOKIE_RE)].map((m) => m[1]);
  return found.length ? found.join("; ") : null;
}

function forwardHeaders(request, cookie) {
  const h = new Headers({ Accept: "application/json" });
  if (cookie) h.set("Cookie", cookie);
  for (const k of ["User-Agent", "Origin", "X-Home-Screen", "CF-Connecting-IP"]) {
    const v = request.headers.get(k);
    if (v) h.set(k, v);
  }
  return h;
}

// Answers are kept a minute per sign-in, so each mail request doesn't ask the account's address again.
const checked = new Map();

export function forgetCheck(request) {
  const cookie = accountCookie(request);
  if (cookie) checked.delete(cookie);
}

export async function accountView(env, request) {
  const cookie = accountCookie(request);
  if (!cookie) return { signedIn: false };
  const hit = checked.get(cookie);
  if (hit && Date.now() - hit.at < CHECK_TTL) return hit.view;
  const res = await fetch(`${env.ACCOUNT_ORIGIN}/api/account/mail/me`, { headers: forwardHeaders(request, cookie) });
  if (!res.ok) throw Object.assign(new Error("Couldn’t reach your inflite account. Try again in a moment."), { status: 502 });
  const view = await res.json();
  if (checked.size > 200) checked.clear();
  checked.set(cookie, { at: Date.now(), view });
  return view;
}

// What stands between this browser and the inbox, if anything.
export function accessOf(view) {
  if (!view?.signedIn) return "signin";
  if (!view.admin) return "notadmin";
  if (!view.passkey) return "passkey";
  if (!view.fresh) return "reauth";
  return "ok";
}

// A sign-in change made on the account's address (handback, signout), its cookie passed back to the browser.
export async function passOn(env, request, path, body) {
  const headers = forwardHeaders(request, accountCookie(request));
  headers.set("Content-Type", "application/json");
  const res = await fetch(`${env.ACCOUNT_ORIGIN}/api/account/mail/${path}`, { method: "POST", headers, body: JSON.stringify(body || {}) });
  let data = {};
  try {
    data = await res.json();
  } catch {}
  const setCookies = res.headers.getSetCookie ? res.headers.getSetCookie() : [res.headers.get("Set-Cookie")].filter(Boolean);
  return { status: res.status, data, setCookies };
}
