// Mail's own gate's hand-back under the roof (One roof stage 4, s4/spec §4.1, S4-D12; app.js:6796–6852): lazy, kept
// offline (connector.lazy, C11). B0-b's stub (STUB = true); MR writes it.
// Frozen:
//   signIn(ctx): "Confirm It’s You": the verifier in sessionStorage["mail:signin-verifier"] (store.js SESSION), then
//     ctx.fw.nav.go(<account>/#signin=mail&ask=…&back=encodeURIComponent(location.origin + "/mail/")).
//   finishSignIn(ctx, code) → Promise<boolean>: /mail/#signin=<code> swapped at api.handback(code, verifier), the
//     verifier dropped, the address tidied to the lens's.
export const STUB = true;
export function signIn(ctx) {}
export async function finishSignIn(ctx, code) {
  return false;
}
