// Mail's own gate's hand-back under the roof (One roof stage 4, s4/spec §4.1, S4-D12; app.js goToAccount/finishSignIn
// 6796–6852, ported). Lazy, kept offline (connector.lazy, C11). Mail needs the admin, a passkey and a check within 12
// hours; "Confirm It’s You" runs this: a word kept in this tab, its hash to InFlite's sign-in page, which sends a
// one-time code back to /mail/#signin=<code>; the code and the word are swapped at Mail's /api/auth/handback over CORS.
// Frozen:
//   signIn(ctx): the verifier in sessionStorage["mail:signin-verifier"] (store.js SESSION), then
//     ctx.fw.nav.go(<sign-in page>/#signin=mail&ask=…&back=encodeURIComponent(location.origin + "/mail/")).
//   finishSignIn(ctx, code) → Promise<boolean>: swapped at api.handback(code, verifier), the verifier dropped either
//     way, store.access set from Mail's answer, the address tidied to the lens's. true when Mail let you in.
import { SESSION } from "./store.js";

const CODE = /^[\w-]{8,200}$/;
const b64url = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
// (InFlite's sign-in page: auth. beside this site, next./os. dropped, as api.js's MAIL rule.)
export const authOrigin = (l = location) => `${l.protocol}//auth.${(l.protocol === "https:" && l.host === "os.inflite.ai" || /^https?:$/.test(l.protocol) && /^os\.ifl\.test(?::\d{1,5})?$/.test(l.host)) ? l.host.slice(3) : l.host.replace(/^next\./, "")}`;

export async function signIn(ctx) {
  const verifier = b64url(crypto.getRandomValues(new Uint8Array(32)));
  const ask = b64url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
  try { sessionStorage.setItem(SESSION.verifier, verifier); } catch (_) {}
  ctx.fw.nav.go(`${authOrigin()}/#signin=mail&ask=${ask}&back=${encodeURIComponent(location.origin + "/mail/")}`);
}

export async function finishSignIn(ctx, code) {
  let verifier = null;
  try { verifier = sessionStorage.getItem(SESSION.verifier); sessionStorage.removeItem(SESSION.verifier); } catch (_) {}
  let r = null;
  if (verifier && CODE.test(String(code || ""))) { try { r = await ctx.api.handback(code, verifier); } catch (_) {} }
  if (r?.access) ctx.store.set({ access: r.access }, "signin");
  try { ctx.fw.nav.section(ctx.store.get().lens || "people"); } catch (_) {}
  return r?.access === "ok";
}
