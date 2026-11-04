// Mail in InFlite's window (Today First, spec §9.4): the script of /mail/, the page today/src/mailhost.js writes, which
// frames Mail at its own address so its mail never shares this site's origin (and Chat's key).
// - The frame: Mail's address (the page's data-mail), with the code coming back from signing in (this page's own
//   #signin=<code>, checked, and taken out of this page's address at once); else a conversation a notification opens
//   (#thread=<id>, its id checked) or Mail's settings (#settings, or #settings=<page>, which Mail opens as #settings),
//   passed into Mail's address as Mail itself reads them (One roof stage 4, spec §2.3: the page Mail is while its switch
//   is off); else Mail as it is.
// - What Mail says, heard only from the frame itself and only from Mail's own address, and only these:
//     { ifl: "hello", v: 1 }    Mail's in the frame: answered the same, so Mail knows it's InFlite's window it's in;
//                               then what InFlite's Mail was writing as its switch was turned off (mail:unsent, its
//                               words), if any, handed in as { ifl: "unsent", v: 1, at, draft }, to Mail's address alone
//     { ifl: "unsent", v: 1, at, saved: true }   Mail has saved it as a draft: this phone's copy let go, if it's still that one
//     { ifl: "back" }           Mail's Back: to Apps (/#apps), never history's own back (Mail keeps history of its own)
//     { ifl: "signin", ask }    Mail's Sign In, its word's hash (ask) kept as Mail keeps it: this whole window to the
//                               sign-in page (data-auth), which comes back here, to /mail/#signin=<code>
// - Back to Apps, in the bar: /#apps, the same.
// - A notification tapped while this page is open: the root worker's { ifl: "open", url } (a path of this site's only),
//   said heard, and gone to, as every page of the hub does (.tools/inflite/menu.js), with this page as the breadcrumb.
//   One for this page itself (/mail/#thread=<id>, the conversation a notification of Mail's opens): Mail opened at it in
//   a fresh frame (an address only its # differs in would never reload this page or the frame, RI5), even while the hub
//   isn't serving the apps' pages (this one is served all the same);
//   (sessionStorage "ifl-crumb"), so the page it opens comes Back here. Not while the hub isn't serving the apps' pages
//   (Today's word for the visit, sessionStorage "ifl-hub-ready" "0": this page is served all the same, the apps' aren't):
//   then it's not heard, and the root worker opens it its own way (Today, which sends it to the app's own address).
// - The Home Screen icon's badge: counted again by the root worker as this page opens and each time it's back in sight,
//   as every page of the hub has it.
// - The hub's cross-fade between pages: one that can't be done is let go quietly (no error said for it).
(() => {
  "use strict";
  // (the code a sign-in hands back, and the word's hash Mail sends to sign in with: letters, digits, - and _ only, so
  // neither can carry another part of an address, & or #, into the frame's or the sign-in page's)
  const CODE = /^[A-Za-z0-9_-]{16,128}$/, ASK = /^[A-Za-z0-9_-]{16,64}$/;
  // (a conversation's id: letters, digits, - and _ only, 64 at most)
  const THREAD = /^[\w-]{1,64}$/;
  const ORIGIN = /^https?:\/\/[a-z0-9.-]+(:\d{1,5})?$/i;
  const root = document.documentElement;
  const MAIL = ORIGIN.test(root.dataset.mail || "") ? root.dataset.mail : null;
  const AUTH = ORIGIN.test(root.dataset.auth || "") ? root.dataset.auth : null;
  const APPS = "/#apps";

  // (the code from #signin=<code>, as the sign-in page puts it, with anything after it; null when there's none or it
  // isn't one)
  function codeFrom(hash) {
    let code = null;
    try { code = new URLSearchParams(String(hash || "").replace(/^#/, "")).get("signin"); } catch (_) {}
    return code && CODE.test(code) ? code : null;
  }
  // (what of this page's # goes into Mail's: the sign-in's code first, else a conversation, else Mail's settings; "" for
  // none. Each as Mail reads it at its start: #signin=<code>, #thread=<id>, #settings)
  function markOf(hash) {
    const code = codeFrom(hash);
    if (code) return `#signin=${code}`;
    let p = null;
    try { p = new URLSearchParams(String(hash || "").replace(/^#/, "")); } catch (_) { return ""; }
    const thread = p.get("thread");
    if (thread && THREAD.test(thread)) return `#thread=${thread}`;
    return p.has("settings") ? "#settings" : "";
  }
  // (where the frame goes: Mail, and what of this page's # it's given)
  const frameSrc = (hash) => `${MAIL}/${markOf(hash)}`;
  // (the frame, as it is now: a fresh one when a notification opens a conversation here)
  let frame = null;
  // (the sign-in page, for Mail, back here)
  const signInAt = (ask) => `${AUTH}/#signin=mail&ask=${ask}&back=${encodeURIComponent(location.origin + "/mail/")}`;
  // (a path of this site's: starts /, not //, no \ and nothing unseen, no more than 200 characters)
  const ownPath = (p) => typeof p === "string" && p.length <= 200 && /^\/(?!\/)/.test(p) && !/[\\\u0000-\u001f\u007f]/.test(p);
  const store = () => { try { return sessionStorage; } catch (_) { return null; } };
  // (another page than this one: what a notification opens, for which this page is the breadcrumb)
  const leaving = (p) => { try { return new URL(p, location.origin).pathname !== location.pathname; } catch (_) { return false; } };
  // (the hub not serving the apps' pages this visit, as Today found: /api/hub, kept in this tab by Today's page)
  const notReady = () => { try { return store()?.getItem("ifl-hub-ready") === "0"; } catch (_) { return false; } };

  function back() {
    location.assign(APPS);
  }

  // (what InFlite's Mail was writing when Mail's switch was turned off, kept on this phone as mail:unsent, its words and
  // never files (One roof stage 4, §8): Mail's API answers no InFlite address from then on, so it couldn't be saved from
  // here. Handed to Mail in the frame, at Mail's address alone, once Mail's said hello; Mail saves it as a draft and says
  // so by the copy's time, and this phone's copy goes, unless it's changed since. Never shown on this page)
  const UNSENT = "mail:unsent";
  const local = () => { try { return localStorage; } catch (_) { return null; } };
  function unsent() {
    let u = null;
    try { u = JSON.parse(local()?.getItem(UNSENT) || "null"); } catch (_) { return null; }
    if (!u || typeof u !== "object" || !Number.isFinite(u.at)) return null;
    return u.subject || String(u.text || "").trim() || ["to", "cc", "bcc"].some((k) => Array.isArray(u[k]) && u[k].length) ? u : null;
  }
  function handIn(frame) {
    const u = unsent();
    if (!u) return;
    const { from, to, cc, bcc, subject, text, inReplyTo, references, draftId, quote, quoteOld } = u;
    const draft = { from, to, cc, bcc, subject, text, inReplyTo, references, draftId, ...(quote?.of && !quoteOld && { quote: { of: quote.of, mode: quote.mode } }) };
    try { frame.contentWindow.postMessage({ ifl: "unsent", v: 1, at: u.at, draft }, MAIL); } catch (_) {}
  }

  // What Mail says from its frame. → what was done ("hello", "back", "signin", "unsent"), or null for anything not taken
  function heard(e, frame) {
    if (!frame || !MAIL || e.source !== frame.contentWindow || e.origin !== MAIL) return null;
    const d = e.data;
    if (!d || typeof d !== "object") return null;
    if (d.ifl === "hello" && d.v === 1) {
      try { frame.contentWindow.postMessage({ ifl: "hello", v: 1 }, MAIL); } catch (_) {}
      handIn(frame);
      return "hello";
    }
    if (d.ifl === "unsent" && d.v === 1 && d.saved === true) {
      if (unsent()?.at === d.at) try { local()?.removeItem(UNSENT); } catch (_) {}
      return "unsent";
    }
    if (d.ifl === "back") return back(), "back";
    if (d.ifl === "signin" && AUTH && typeof d.ask === "string" && ASK.test(d.ask)) return location.assign(signInAt(d.ask)), "signin";
    return null;
  }

  function start() {
    frame = document.querySelector('iframe[name="ifl-mail"]');
    document.querySelector(".mh-back")?.addEventListener("click", back);
    addEventListener("message", (e) => heard(e, frame));
    if (!frame || !MAIL) return;
    const hash = location.hash;
    // (the code is good once: out of this page's address before anything else, so a reload never hands it in again)
    if (hash) try { history.replaceState(history.state, "", location.pathname + location.search); } catch (_) {}
    frame.src = frameSrc(hash);
  }

  // (Mail again at what a notification opens: a fresh frame, the same in every way but its address, so Mail starts at it
  // whatever the frame's showing now; where one can't be made, the frame's address set)
  function reframe(src) {
    if (!frame) return;
    let fresh = null;
    try { fresh = typeof frame.cloneNode === "function" && typeof frame.replaceWith === "function" ? frame.cloneNode(false) : null; } catch (_) { fresh = null; }
    if (!fresh) { frame.src = src; return; }
    fresh.src = src;
    frame.replaceWith(fresh);
    frame = fresh;
  }

  // (a notification tapped while this page is open: the root worker's word, to a path of this site's only. Said heard,
  // on the port the worker gave, so it doesn't open it some other way too; this page the breadcrumb for the one it opens.
  // With the hub not serving the apps' pages, not heard: the worker, hearing nothing, opens it its own way)
  navigator.serviceWorker?.addEventListener?.("message", (e) => {
    const d = e.data;
    if (!d || d.ifl !== "open" || !ownPath(d.url)) return;
    // (this page: Mail opened at it here, the hub serving the apps' pages or not)
    if (!leaving(d.url)) {
      if (!frame || !MAIL) return;
      try { e.ports?.[0]?.postMessage({ ifl: "opened" }); } catch (_) {}
      let hash = "";
      try { hash = new URL(d.url, location.origin).hash; } catch (_) {}
      reframe(frameSrc(hash));
      return;
    }
    if (notReady()) return;
    try { e.ports?.[0]?.postMessage({ ifl: "opened" }); } catch (_) {}
    try { store()?.setItem("ifl-crumb", location.pathname); } catch (_) {}
    location.assign(d.url);
  });
  // (the Home Screen icon's badge, as many notifications as are still showing: counted again by the root worker as this
  // page opens and each time it's back in sight)
  const recount = () => { try { navigator.serviceWorker?.getRegistration?.("/")?.then?.((r) => r?.active?.postMessage({ ifl: "badge" }), () => {}); } catch (_) {} };
  recount();
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") recount(); });
  // (the cross-fade into this page and out of it: its promises caught, so one that can't be done says nothing)
  const vt = (e) => { const t = e.viewTransition; if (!t) return; for (const k of ["ready", "finished", "updateCallbackDone"]) t[k]?.catch?.(() => {}); };
  addEventListener("pageswap", vt);
  addEventListener("pagereveal", vt);

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
