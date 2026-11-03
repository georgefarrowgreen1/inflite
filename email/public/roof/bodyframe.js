// The parent half of Mail's body boundary (One roof stage 4, s4/spec §3.2, §3.1, S4-D3; the parent half of app.js:5068–5195;
// security-critical, deep review R3). The only file of the module that touches a body frame, names /body/ or calls
// postMessage. A message's body is never on this page: each is a frame of Mail's shell at Mail's own address
// (email/public/body/), which fetches and draws it with scripts off. What comes back is a height and a few flags,
// each checked here; this page never reads the frame's document (it can't: another origin) and never posts it a body.
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
// navigator.onLine, is covered with "Couldn’t show this message · Open in Mail" (RI10): the frame hidden, a
// div.mail-body-cover put after it. Offline, the module's own offline state covers the reader instead.
import { MAIL } from "./api.js";

export const BODY = "/body/";
export const MSG = { ifl: "mailbody", v: 1 };
export const SANDBOX = "allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox";
export const ID_RE = /^[\w-]{1,64}$/;
export const H_START = 120;
export const H_MIN = 40;
export const H_MAX = 40000;
export const MAILTO_MAX = 2000;
export const SILENT_MS = 6000;

const THEMES = new Set(["light", "dark"]);
const THREAD_RE = /^[\w-]{1,40}$/;
// (every live frame made here: its record by its element)
const live = new Map();
let seer = null;
let listening = null;

const srcOf = (r) => `${MAIL}${BODY}#${new URLSearchParams({ m: r.id, t: r.theme, img: r.images ? "1" : "0", p: location.origin })}`;

// (silent too long while online: covered, with Mail's own address to read it at)
function startClock(r) {
  if (r.clock || r.heard) return;
  r.clock = setTimeout(() => {
    if (!live.has(r.el) || r.heard || !navigator.onLine) return;
    cover(r);
  }, SILENT_MS);
}
function cover(r) {
  if (r.cover) return;
  const c = document.createElement("div");
  c.className = "mail-body-cover";
  const words = document.createElement("span");
  words.textContent = "Couldn’t show this message";
  const sep = document.createTextNode(" · ");
  const open = document.createElement("a");
  open.href = `${MAIL}/${r.thread ? `#thread=${r.thread}` : ""}`;
  open.target = "_blank";
  open.rel = "noopener noreferrer";
  open.textContent = "Open in Mail";
  c.append(words, sep, open);
  r.el.hidden = true;
  r.el.after(c);
  r.cover = c;
}
function uncover(r) {
  if (!r.cover) return;
  r.cover.remove();
  r.cover = null;
  r.el.hidden = false;
}
function seen(entries) {
  for (const e of entries) {
    if (!e.isIntersecting) continue;
    const r = live.get(e.target);
    seer?.unobserve(e.target);
    if (r) startClock(r);
  }
}

export function bodyFrame(message, { theme = "light", images = false, eager = false } = {}) {
  const id = message?.id;
  if (typeof id !== "string" || !ID_RE.test(id)) return null;
  const from = message.from || {};
  const sender = String(from.name || from.email || "").trim();
  const r = {
    id,
    theme: THEMES.has(theme) ? theme : "light",
    images: images === true,
    thread: typeof message.threadId === "string" && THREAD_RE.test(message.threadId) ? message.threadId : null,
    heard: false,
    clock: null,
    cover: null,
    el: document.createElement("iframe"),
  };
  const el = r.el;
  el.className = "mail-body";
  el.setAttribute("sandbox", SANDBOX);
  el.setAttribute("allow", "");
  el.setAttribute("referrerpolicy", "no-referrer");
  el.setAttribute("loading", eager ? "eager" : "lazy");
  el.setAttribute("title", sender ? `Message from ${sender}` : "Message");
  el.setAttribute("height", String(H_START));
  el.addEventListener("load", () => {
    if (live.has(el) && navigator.onLine) startClock(r);
  });
  el.src = srcOf(r);
  live.set(el, r);
  if (typeof IntersectionObserver === "function") {
    seer ||= new IntersectionObserver(seen);
    seer.observe(el);
  }

  return {
    el,
    setTheme(t) {
      if (!THEMES.has(t) || !live.has(el) || t === r.theme) return;
      r.theme = t;
      // (heard from: told; not yet, its address says it, as it loads)
      if (r.heard && el.contentWindow) el.contentWindow.postMessage({ ...MSG, t }, MAIL);
      else el.src = srcOf(r);
    },
    allowImages() {
      if (!live.has(el) || r.images) return;
      r.images = true;
      el.src = srcOf(r);
    },
    destroy() {
      clearTimeout(r.clock);
      seer?.unobserve(el);
      r.cover?.remove();
      el.remove();
      live.delete(el);
    },
  };
}

export function themeAll(t) {
  if (!THEMES.has(t)) return;
  for (const r of live.values()) {
    if (r.theme === t) continue;
    r.theme = t;
    if (r.heard && r.el.contentWindow) r.el.contentWindow.postMessage({ ...MSG, t }, MAIL);
    else r.el.src = srcOf(r);
  }
}

export function listenFrames(handlers = {}) {
  if (listening) window.removeEventListener("message", listening);
  const on = (e) => {
    if (e.origin !== MAIL || !e.source) return;
    let r = null;
    for (const x of live.values()) if (x.el.contentWindow === e.source) r = x;
    if (!r) return;
    const d = e.data;
    if (!d || typeof d !== "object" || Array.isArray(d) || Object.getPrototypeOf(d) !== Object.prototype) return;
    if (d.ifl !== MSG.ifl || d.v !== MSG.v || d.id !== r.id) return;
    if (Number.isInteger(d.h) && d.h >= H_MIN && d.h <= H_MAX) {
      r.heard = true;
      clearTimeout(r.clock);
      uncover(r);
      r.el.setAttribute("height", String(d.h));
    }
    if (typeof d.designed === "boolean") r.el.classList.toggle("designed", d.designed);
    if (typeof d.remote === "boolean") handlers.remote?.(r.id, d.remote);
    if (typeof d.quotes === "boolean") r.quotes = d.quotes;
    if (typeof d.mailto === "string" && d.mailto.length <= MAILTO_MAX && /^mailto:/i.test(d.mailto)) handlers.mailto?.(d.mailto);
    if (d.touched === true) handlers.touched?.(r.id);
  };
  listening = on;
  window.addEventListener("message", on);
  return () => {
    window.removeEventListener("message", on);
    if (listening === on) listening = null;
  };
}
