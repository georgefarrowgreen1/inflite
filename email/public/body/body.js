// ==== InFlite page zoom: shared guard ====
// InFlite's page zoom policy. Runs before sign-in and independently of the menu.
// Components such as maps and photo viewers retain their own gesture handling.
(() => {
  if (globalThis.__iflZoomBlocked) return;
  globalThis.__iflZoomBlocked = true;
  for (const type of ["gesturestart", "gesturechange", "gestureend"]) {
    document.addEventListener(type, (event) => event.preventDefault(), { passive: false });
  }
  document.addEventListener("touchmove", (event) => {
    if (event.touches?.length > 1) event.preventDefault();
  }, { passive: false });
})();
// ==== End InFlite page zoom ====
// Mail's body shell (One roof stage 4, spec §3.3): one page at Mail's own address, framed by InFlite's page once per
// message, that fetches the message itself and draws it exactly as Mail on its own does (its inner frame, scripts off),
// so nothing of a body ever reaches a document of inflite.ai. What it tells the page holding it: a height and a few
// flags, posted only to `parent` at the one address `p` it was given, and only if that address is one Mail's Worker
// wrote into this page (data-parents: the hub addresses switched on, the same list as the CORS gate and this page's
// frame-ancestors). What it hears: only a theme, only from `parent` at that same address. Everything else is ignored.
//
// Its address: /body/#m=<message id>&t=<light|dark>&img=<0|1>&p=<parent's origin>, all in the hash, which never reaches
// a server. document.referrer is empty (no-referrer), so p is how it knows whom to answer.
//
// The drawing is Mail's own (email/public/app.js messageBody, cleanMail, htmlFrame, foldQuotes), moved here as it is
// but for the colours, which come from body.css by theme (--mail-text, --mail-quote, --mail-rule, --mail-link).
"use strict";

// ---- moved from email/public/app.js, as it is ----
const ATTRIBUTION = /^(on\b.+\bwrote:|-{2,}\s*original message\s*-{2,}|le .+ a écrit\s*:|am .+ schrieb .+:)\s*$/i;
// Designed emails (their own backgrounds) keep a white card; plain ones take the app's own colours, dark mode too.
const DESIGNED = /\bbgcolor\s*=|background(-color|-image)?\s*:|<(table|td|body)[^>]*\sbackground\s*=/i;
const REMOTE = /(src|background)\s*=\s*["']?\s*https?:|url\(\s*["']?https?:/i;
// The inner document's own policy (beside this page's, which it inherits: a script would have to pass the sandbox,
// script-src 'self' and default-src 'none')
const CSP_REMOTE = "default-src 'none'; img-src 'self' data: https: http:; style-src 'unsafe-inline' https:; font-src data: https:; media-src https:";
const CSP_LOCAL = "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; font-src data:";
// The inner frame: never allow-scripts (as in production)
const SANDBOX = "allow-same-origin allow-popups allow-popups-to-escape-sandbox";

const escapeHtml = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

// (web addresses, and email addresses, which write a message: posted to the page as { mailto })
function linkify(escaped) {
  return escaped.replace(/\b(https?:\/\/[^\s<>"']+[^\s<>"'.,;:!?)\]])|([\w.+-]+@[\w-]+(?:\.[\w-]+)+)/g, (all, url, mail) =>
    url ? `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>` : `<a href="mailto:${mail}">${mail}</a>`
  );
}

// The email's own HTML, parsed (inert: nothing loads) rather than matched, so a tag hidden inside another can't come
// back once the outer one's taken out: no scripts, and no link, meta or base (a preconnect or a base would reach the
// sender with Remote Images off). Its styles kept; its body's attributes carried over by the frame's own parser.
function cleanMail(html) {
  const d = new DOMParser().parseFromString(html, "text/html");
  d.querySelectorAll("script, link, meta, base, noscript").forEach((e) => e.remove());
  return [...d.head.querySelectorAll("style")].map((e) => e.outerHTML).join("") + d.body.outerHTML;
}

// A plain-text message (messageBody's text path): escaped, linked, its quoted part ("On … wrote:" and the "> " lines)
// cut off to be folded. → { main, quoted } as HTML, quoted null when there's none
function textParts(text) {
  const lines = (text || "").replace(/\r\n/g, "\n").split("\n");
  let cut = lines.findIndex((l, i) => /^\s*>/.test(l) || (ATTRIBUTION.test(l.trim()) && lines.slice(i + 1).some((x) => /^\s*>/.test(x))));
  if (cut > 0 && !lines.slice(0, cut).join("").trim()) cut = -1;
  const render = (ls) =>
    ls
      .map((l) => {
        const e = linkify(escapeHtml(l));
        return /^\s*&gt;/.test(e) ? `<span class="quote">${e.replace(/^\s*(&gt;\s?)+/, "")}</span>` : e;
      })
      .join("\n")
      .replace(/<\/span>\n<span class="quote">/g, "\n");
  if (cut < 0) return { main: render(lines).trim(), quoted: null };
  return { main: render(lines.slice(0, cut)).trimEnd(), quoted: render(lines.slice(cut)).trim() };
}

// Marks the quoted part of an HTML reply (Apple Mail, Gmail, Outlook) so it can be folded. → whether there was one
function foldQuotes(d) {
  if (!d?.body) return false;
  const marked = [];
  const mark = (el) => {
    el.classList.add("inflite-q");
    marked.push(el);
  };
  const candidates = [...d.querySelectorAll('blockquote[type="cite"], .gmail_quote, blockquote')];
  for (const el of candidates) if (!el.parentElement?.closest('blockquote, .gmail_quote, .inflite-q')) mark(el);
  // Outlook: everything from its reply header on
  const ol = d.querySelector('#divRplyFwdMsg, [id^="divRplyFwdMsg"], #appendonsend');
  if (ol) for (let el = ol; el; el = el.nextElementSibling) mark(el);
  // An "On … wrote:" line just before a quote
  for (const el of marked.slice()) {
    const prev = el.previousElementSibling;
    if (prev && !prev.classList.contains("inflite-q") && ATTRIBUTION.test((prev.textContent || "").trim())) mark(prev);
  }
  if (!marked.length) return false;
  // Never fold away the whole message (a forward, say).
  if (!(d.body.innerText || "").trim()) {
    marked.forEach((el) => el.classList.remove("inflite-q"));
    return false;
  }
  return true;
}

// The inner document's look: a designed email on white; a plain one in Mail's colours for the theme (v: a colour of
// body.css's, by name), its own colours overridden in dark mode (the HTML path only: a text body has none of its own)
function lookOf(designed, dark, v, html) {
  return designed
    ? `:root{color-scheme:light}
html,body{margin:0;padding:0;background:#fff}
body{padding:16px;font:15px/1.5 -apple-system,BlinkMacSystemFont,Helvetica,Arial,sans-serif;color:#1c1c1e}
blockquote{margin:8px 0;padding-left:12px;border-left:2px solid #c7c7cc;color:#555}
a{color:#0a84ff}`
    : `:root{color-scheme:${dark ? "dark" : "light"}}
html,body{margin:0;padding:0;background:transparent}
body{padding:14px 20px 8px;font:17px/1.45 -apple-system,BlinkMacSystemFont,Helvetica,Arial,sans-serif;color:${v("--mail-text")}}
blockquote{margin:8px 0;padding-left:12px;border-left:2px solid ${v("--mail-rule")};color:${v("--mail-quote")}}
a{color:${v("--mail-link")}}
${dark && html ? `body *{color:inherit!important;background-color:transparent!important}
blockquote{border-left-color:${v("--mail-rule")}!important;color:${v("--mail-quote")}!important}
a,a *{color:${v("--mail-link")}!important}` : ""}`;
}

// (a text body's own look: Mail's .mail-body, .quote and .quoted, in the theme's colours)
const textLook = (v) => `.mail-body{white-space:pre-wrap;overflow-wrap:anywhere}
.mail-body .quote{display:block;margin:4px 0;padding-left:12px;border-left:2px solid ${v("--mail-rule")};color:${v("--mail-quote")}}
.mail-body.quoted{margin-top:12px;color:${v("--mail-quote")}}
.mail-empty{color:${v("--mail-quote")}}`;

function innerDoc(csp, look, inner) {
  return `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="x-dns-prefetch-control" content="off">
<base target="_blank">
<style>
${look}
html,body{touch-action:manipulation}
body{overflow-wrap:anywhere;-webkit-text-size-adjust:100%}
img{max-width:100%;height:auto}
pre{white-space:pre-wrap}
.inflite-q{display:none!important}
.inflite-showq .inflite-q{display:revert!important}
</style></head><body>${inner}</body></html>`;
}

// ---- the page this shell is: its address, whom it answers, and what it says ----
const root = document.documentElement;
const parents = (root.getAttribute("data-parents") || "").split(" ").filter(Boolean);
const framed = window.parent !== window;

// The hash, strictly: exactly m, t, img and p, once each, each as it must be, p one of data-parents. → null otherwise
function readHash() {
  const q = new URLSearchParams(location.hash.slice(1));
  const keys = [...q.keys()];
  if (keys.length !== 4 || ["m", "t", "img", "p"].some((k) => q.getAll(k).length !== 1)) return null;
  const m = q.get("m"), t = q.get("t"), img = q.get("img"), p = q.get("p");
  if (!/^[\w-]{1,64}$/.test(m) || (t !== "light" && t !== "dark") || (img !== "0" && img !== "1") || !parents.includes(p)) return null;
  return { m, t, img: img === "1", p };
}

let at = readHash();
let msg = null;
let lastH = 0;
let touchedAt = 0;
// (whether #b holds anything yet, a message or a note: no height is said before, so a shell that has loaded but has
// nothing to show, Mail answering 403, 404 or 500, or no answer at all, says nothing, and the page's 6 s rule covers it)
let drawn = false;

// (to the page holding this one, only: parent, at p)
function post(fields) {
  if (!at || !framed) return;
  window.parent.postMessage({ ifl: "mailbody", v: 1, id: at.m, ...fields }, at.p);
}
function postHeight() {
  const el = document.getElementById("b");
  if (!el || !drawn) return;
  const h = Math.max(40, Math.min(40000, Math.ceil(el.getBoundingClientRect().height)));
  if (Math.abs(h - lastH) <= 1) return;
  lastH = h;
  post({ h });
}
// (touched, scrolled or typed in: the page's updater waits, as for a touch on the page; at most once a second)
function touched() {
  const now = Date.now();
  if (now - touchedAt < 1000) return;
  touchedAt = now;
  post({ touched: true });
}
// (an email address tapped: a message to it, written on the page; nothing else of the mail goes with it)
function mailtoOut(e) {
  const a = e.target?.closest?.("a[href]");
  const href = a && String(a.getAttribute("href") || "").trim();
  if (!href || !/^mailto:/i.test(href)) return;
  e.preventDefault();
  if (href.length <= 2000) post({ mailto: href });
}

const NS = "http://www.w3.org/2000/svg";
function moreIcon() {
  const s = document.createElementNS(NS, "svg");
  s.setAttribute("viewBox", "0 0 24 24");
  s.setAttribute("class", "i");
  s.setAttribute("aria-hidden", "true");
  for (const cx of ["5.5", "12", "18.5"]) {
    const c = document.createElementNS(NS, "circle");
    for (const [k, val] of [["cx", cx], ["cy", "12"], ["r", "1.7"]]) c.setAttribute(k, val);
    s.append(c);
  }
  return s;
}

// Quoted replies ("On … wrote:" and what follows) are folded away behind a button, as in Mail.
function quoteToggle(onToggle) {
  let shown = false;
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "quote-toggle";
  btn.setAttribute("aria-expanded", "false");
  const words = document.createElement("span");
  words.textContent = "Show Quoted Text";
  btn.append(moreIcon(), words);
  btn.addEventListener("click", () => {
    shown = !shown;
    btn.setAttribute("aria-expanded", String(shown));
    words.textContent = shown ? "Hide Quoted Text" : "Show Quoted Text";
    onToggle(shown);
  });
  return btn;
}

function note(words) {
  const el = document.getElementById("b");
  const p = document.createElement("p");
  p.className = "note";
  p.textContent = words;
  el.replaceChildren(p);
  drawn = true;
}

// The message, drawn (again, for a new theme or with remote pictures now allowed)
function draw() {
  const el = document.getElementById("b");
  root.setAttribute("data-t", at.t);
  if (!msg) return;
  const dark = at.t === "dark";
  const css = getComputedStyle(root);
  const v = (n) => css.getPropertyValue(n).trim();
  const isHtml = !!(msg.html && msg.html.trim());
  const allowRemote = at.img;
  let designed = false, hasRemote = false, quotes = false, doc;
  if (isHtml) {
    hasRemote = REMOTE.test(msg.html);
    designed = DESIGNED.test(msg.html);
    doc = innerDoc(allowRemote ? CSP_REMOTE : CSP_LOCAL, lookOf(designed, dark, v, true), cleanMail(msg.html));
  } else {
    const { main, quoted } = textParts(msg.text);
    quotes = quoted != null;
    const first = quotes || main ? `<div class="mail-body">${main}</div>` : '<div class="mail-body"><span class="mail-empty">This message has no content.</span></div>';
    doc = innerDoc(CSP_LOCAL, `${lookOf(false, dark, v, false)}\n${textLook(v)}`, first + (quotes ? `<div class="mail-body quoted inflite-q">${quoted}</div>` : ""));
  }

  const frame = document.createElement("iframe");
  frame.className = "mail-frame";
  frame.title = "Message content";
  frame.setAttribute("sandbox", SANDBOX);
  frame.setAttribute("referrerpolicy", "no-referrer");
  frame.style.colorScheme = designed ? "light" : dark ? "dark" : "light";
  frame.srcdoc = doc;

  // Sized to its content, without ever collapsing it first: wide newsletters are shrunk to fit, as in Mail; the height
  // follows the body as images arrive.
  const fit = () => {
    const d = frame.contentDocument;
    if (!d?.body) return;
    const b = d.body.getBoundingClientRect();
    // (a template that holds the body to the page's height, html,body{height:100%}, overflows it instead: the
    // document's own height then says how tall it really is)
    const over = d.documentElement.scrollHeight > frame.offsetHeight + 1 ? d.documentElement.scrollHeight : 0;
    const px = Math.ceil(Math.max(b.bottom + (parseFloat(d.defaultView.getComputedStyle(d.body).marginBottom) || 0), over));
    if (Math.abs(px - frame.offsetHeight) > 1) frame.style.height = `${px}px`;
    postHeight();
  };
  let lastWidth = 0;
  const fitWidth = () => {
    const d = frame.contentDocument;
    if (!d?.body) return;
    const avail = frame.clientWidth;
    if (!avail || avail === lastWidth) return fit();
    lastWidth = avail;
    d.body.style.zoom = "";
    const sw = d.documentElement.scrollWidth;
    // (shrunk no further than this, so its words stay readable: what's left is scrolled sideways, in the frame)
    if (sw > avail + 2) d.body.style.zoom = String(Math.max(0.6, avail / sw));
    fit();
  };

  const toggleRow = document.createElement("div");
  toggleRow.className = "quote-row";
  toggleRow.hidden = true;
  frame.addEventListener("load", () => {
    const d = frame.contentDocument;
    if (isHtml) quotes = foldQuotes(d);
    if (quotes) {
      toggleRow.replaceChildren(
        quoteToggle((show) => {
          frame.contentDocument?.documentElement.classList.toggle("inflite-showq", show);
          fit();
        })
      );
      toggleRow.hidden = false;
    }
    post({ quotes });
    lastWidth = 0;
    fitWidth();
    if (!d?.body) return;
    // (images arriving, fonts, quotes shown: whatever changes the body's size)
    const ro = new ResizeObserver(() => (frame.isConnected ? fit() : ro.disconnect()));
    ro.observe(d.body);
    const rw = new ResizeObserver(() => (frame.isConnected ? fitWidth() : rw.disconnect()));
    rw.observe(frame);
    d.addEventListener("load", fit, true);
    for (const ev of ["pointerdown", "wheel", "keydown", "scroll"]) d.addEventListener(ev, touched, { capture: true, passive: true });
    d.addEventListener("click", mailtoOut);
  });

  el.replaceChildren(frame, toggleRow);
  drawn = true;
  post({ designed, remote: hasRemote && !allowRemote });
}

async function load() {
  let r;
  try {
    r = await fetch(`/api/messages/${encodeURIComponent(at.m)}`, { credentials: "same-origin", cache: "no-store" });
  } catch {
    return; // (no connection: the page's own offline state, or its "Couldn't show this message", covers it)
  }
  if (r.status === 401) {
    note("Open Mail to read this");
    lastH = 64;
    post({ h: 64 });
    return;
  }
  if (!r.ok) return;
  let m;
  try {
    m = await r.json();
  } catch {
    return;
  }
  msg = { html: typeof m?.html === "string" ? m.html : "", text: typeof m?.text === "string" ? m.text : "" };
  draw();
}

// What the page says: only a theme, only from parent at p
addEventListener("message", (e) => {
  if (!at || !framed || e.source !== window.parent || e.origin !== at.p) return;
  const d = e.data;
  if (!d || typeof d !== "object" || Object.getPrototypeOf(d) !== Object.prototype || d.ifl !== "mailbody" || d.v !== 1) return;
  if ((d.t === "light" || d.t === "dark") && d.t !== at.t) {
    at.t = d.t;
    draw();
  }
});

// A new address from the page (img=1 for this message, or another theme): drawn again; another message or another
// parent: a fresh start
addEventListener("hashchange", () => {
  const next = readHash();
  if (!next || !at || next.m !== at.m || next.p !== at.p) return location.reload();
  at = next;
  draw();
});

if (at) {
  root.setAttribute("data-t", at.t);
  for (const ev of ["pointerdown", "wheel", "keydown"]) document.addEventListener(ev, touched, { capture: true, passive: true });
  if (typeof ResizeObserver === "function") new ResizeObserver(postHeight).observe(document.getElementById("b"));
  load();
}
