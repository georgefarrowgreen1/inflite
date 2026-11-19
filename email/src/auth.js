// Signing in is inflite's account's (account.inflite.ai). Its cookie covers every address on inflite.ai, so the browser
// sends it here too; this Worker passes it to the account's address, which says who it is and whether they may open
// Mail: the site's admin, with a passkey, that has confirmed it's them in the last 12 hours.
// (The account side is functions/_mailapp.js in the georgefarrowgreen repo.)
import { appFetch } from "./apps.js";

// (and the mark that the browser has just changed its sign-in, ifl_rw=1, so the account asks its main database who's
// signed in, not a copy near the visitor that may be a moment behind: georgefarrowgreen functions/_account.js markWrote)
const COOKIE_RE = /(?:^|;\s*)((?:__Secure-)?account=[A-Za-z0-9_-]{20,100}|ifl_rw=1)(?=;|$)/g;

// Only the account's cookie (and that mark) is passed on, never anything else the browser sent.
export function accountCookie(request) {
  const found = [...(request.headers.get("Cookie") || "").matchAll(COOKIE_RE)].map((m) => m[1]);
  return found.some((c) => c !== "ifl_rw=1") ? found.join("; ") : null;      // (the mark alone: no one signed in)
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

export async function accountView(env, request) {
  const cookie = accountCookie(request);
  if (!cookie) return { signedIn: false };
  // Private Mail checks the current sign-in and permissions on every request.
  const res = await appFetch(env, `${env.ACCOUNT_ORIGIN}/api/account/mail/me`, {
    headers: forwardHeaders(request, cookie), redirect: "manual", signal: AbortSignal.timeout(8000),
  }).catch(() => null);
  if (!res?.ok) {
    res?.body?.cancel().catch(() => {});
    const message = "Couldn’t reach your InFlite account. Try again in a moment.";
    throw Object.assign(new Error(message), { status: 502, publicMessage: message });
  }
  const view = await res.json();
  // Keep Quiet Hours for notices that arrive without a browser session.
  if (accessOf(view) === "ok" && view.quiet) keepQuiet(env, view.quiet).catch(() => {});
  return view;
}

// The account's Quiet Hours, as its Notifications page has them ({ on, from, to, tz }): kept when they change, and whether
// it's within them now
let quietKept = null;
async function keepQuiet(env, q) {
  const v = JSON.stringify({ on: !!q.on, from: Number(q.from) || 0, to: Number(q.to) || 0, tz: String(q.tz || "UTC") });
  if (v === quietKept) return;
  await env.DB.prepare(`INSERT INTO meta (k, v) VALUES ('quiet', ?1) ON CONFLICT(k) DO UPDATE SET v = excluded.v`).bind(v).run();
  quietKept = v;
}
export async function quietNow(env, t = Date.now()) {
  let q = null;
  try { q = JSON.parse((await env.DB.prepare(`SELECT v FROM meta WHERE k = 'quiet'`).first())?.v || "null"); } catch {}
  if (!q?.on || q.from === q.to) return false;
  let h;
  try { h = Number(new Intl.DateTimeFormat("en-GB", { timeZone: q.tz, hour: "numeric", hourCycle: "h23" }).format(t)); } catch { return false; }
  return q.from > q.to ? h >= q.from || h < q.to : h >= q.from && h < q.to;
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
  const res = await appFetch(env, `${env.ACCOUNT_ORIGIN}/api/account/mail/${path}`, {
    method: "POST", headers, body: JSON.stringify(body || {}), redirect: "manual", signal: AbortSignal.timeout(8000),
  });
  let data = {};
  try {
    data = await res.json();
  } catch {}
  const setCookies = res.headers.getSetCookie ? res.headers.getSetCookie() : [res.headers.get("Set-Cookie")].filter(Boolean);
  return { status: res.status, data, setCookies };
}
