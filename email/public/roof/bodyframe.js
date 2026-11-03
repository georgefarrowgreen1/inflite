// The parent half of Mail's body boundary (One roof stage 4, s4/spec §3.2, §3.1, S4-D3; the parent half of app.js:5068–5195;
// security-critical, deep review R3). The only file of the module that touches a body frame, names /body/ or calls
// postMessage. B0-b's stub (STUB = true): the signatures and the message constants are frozen; MB writes it.
//
// bodyFrame(message, { theme, images, eager }) → { el, setTheme(t), allowImages(), destroy() }
//   message: a Summary or Meta ({ id, from, … }); id checked against ID_RE first (else no frame: null).
//   el: iframe.mail-body, src = MAIL + BODY + "#" + new URLSearchParams({ m: id, t: theme, img: images ? 1 : 0,
//   p: location.origin }), sandbox = SANDBOX, allow = "", referrerpolicy = "no-referrer", loading = eager ? "eager" :
//   "lazy", title = "Message from <sender>", height = H_START until the frame says.
//   setTheme(t): posts { ...MSG, t } to that frame only, target origin MAIL (never "*"). allowImages(): the frame's address
//   replaced with img=1 (this message only). destroy(): the frame removed and forgotten.
// listenFrames({ remote(id, on), mailto(href), touched(id) }) → off: the ONE window "message" listener for every frame
//   (added at mount, removed at unmount). A message counts only if e.origin === MAIL, e.source is the contentWindow of a
//   live frame made here, and e.data is a plain object { ifl: MSG.ifl, v: MSG.v, id } whose id is that frame's message.
//   Fields, each validated, anything else ignored: h (integer H_MIN–H_MAX → the frame's height attribute), designed
//   (boolean → class "designed", the white card), remote (boolean → remote(id, on), the module's banner), quotes
//   (boolean, informational), mailto (string matching ^mailto: and ≤ MAILTO_MAX → mailto(href)), touched (→ touched(id)).
// themeAll(t): setTheme(t) on every live frame.
// A frame that hasn't said a height SILENT_MS after its load event, or after an IntersectionObserver first sees it, while
// navigator.onLine, is covered with "Couldn’t show this message · Open in Mail" (RI10). The parent never reads
// contentDocument and never posts a body.
import { MAIL } from "./api.js";

export const STUB = true;
export const BODY = "/body/";
export const MSG = { ifl: "mailbody", v: 1 };
export const SANDBOX = "allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox";
export const ID_RE = /^[\w-]{1,64}$/;
export const H_START = 120;
export const H_MIN = 40;
export const H_MAX = 40000;
export const MAILTO_MAX = 2000;
export const SILENT_MS = 6000;

export function bodyFrame(message, { theme = "light", images = false, eager = false } = {}) {
  return null;
}
export function listenFrames(handlers = {}) {
  return () => {};
}
export function themeAll(t) {}
