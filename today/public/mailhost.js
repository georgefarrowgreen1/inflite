// Mail in InFlite's window (Today First, spec §9.4): the script of /mail/, the page today/src/mailhost.js writes, which
// frames Mail at its own address so its mail never shares this site's origin (and Chat's key).
// - The frame: Mail's address (the page's data-mail), with the code coming back from signing in (this page's own
//   #signin=<code>, checked, and taken out of this page's address at once), else Mail as it is.
// - What Mail says, heard only from the frame itself and only from Mail's own address, and only these:
//     { ifl: "hello", v: 1 }    Mail's in the frame: answered the same, so Mail knows it's InFlite's window it's in
//     { ifl: "back" }           Mail's Back: to Apps (/#apps), never history's own back (Mail keeps history of its own)
//     { ifl: "signin", ask }    Mail's Sign In, its word's hash (ask) kept as Mail keeps it: this whole window to the
//                               sign-in page (data-auth), which comes back here, to /mail/#signin=<code>
// - Back to Apps, in the bar: /#apps, the same.
// - A notification tapped while this page is open: the root worker's { ifl: "open", url } (a path of this site's only),
//   said heard, and gone to, as every page of the hub does (.tools/inflite/menu.js).
// - The hub's cross-fade between pages: one that can't be done is let go quietly (no error said for it).
(() => {
  "use strict";
  // (the code a sign-in hands back, and the word's hash Mail sends to sign in with: letters, digits, - and _ only, so
  // neither can carry another part of an address, & or #, into the frame's or the sign-in page's)
  const CODE = /^[A-Za-z0-9_-]{16,128}$/, ASK = /^[A-Za-z0-9_-]{16,64}$/;
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
  // (where the frame goes: Mail, and the code with it when there's one)
  const frameSrc = (code) => `${MAIL}/${code ? `#signin=${code}` : ""}`;
  // (the sign-in page, for Mail, back here)
  const signInAt = (ask) => `${AUTH}/#signin=mail&ask=${ask}&back=${encodeURIComponent(location.origin + "/mail/")}`;
  // (a path of this site's: starts /, not //, no \ and nothing unseen, no more than 200 characters)
  const ownPath = (p) => typeof p === "string" && p.length <= 200 && /^\/(?!\/)/.test(p) && !/[\\\u0000-\u001f\u007f]/.test(p);

  function back() {
    location.assign(APPS);
  }

  // What Mail says from its frame. → what was done ("hello", "back", "signin"), or null for anything not taken
  function heard(e, frame) {
    if (!frame || !MAIL || e.source !== frame.contentWindow || e.origin !== MAIL) return null;
    const d = e.data;
    if (!d || typeof d !== "object") return null;
    if (d.ifl === "hello" && d.v === 1) {
      try { frame.contentWindow.postMessage({ ifl: "hello", v: 1 }, MAIL); } catch (_) {}
      return "hello";
    }
    if (d.ifl === "back") return back(), "back";
    if (d.ifl === "signin" && AUTH && typeof d.ask === "string" && ASK.test(d.ask)) return location.assign(signInAt(d.ask)), "signin";
    return null;
  }

  function start() {
    const frame = document.querySelector('iframe[name="ifl-mail"]');
    document.querySelector(".mh-back")?.addEventListener("click", back);
    addEventListener("message", (e) => heard(e, frame));
    if (!frame || !MAIL) return;
    const code = codeFrom(location.hash);
    // (the code is good once: out of this page's address before anything else, so a reload never hands it in again)
    if (location.hash) try { history.replaceState(history.state, "", location.pathname + location.search); } catch (_) {}
    frame.src = frameSrc(code);
  }

  // (a notification tapped while this page is open: the root worker's word, to a path of this site's only. Said heard,
  // on the port the worker gave, so it doesn't open it some other way too)
  navigator.serviceWorker?.addEventListener?.("message", (e) => {
    const d = e.data;
    if (!d || d.ifl !== "open" || !ownPath(d.url)) return;
    try { e.ports?.[0]?.postMessage({ ifl: "opened" }); } catch (_) {}
    location.assign(d.url);
  });
  // (the cross-fade into this page and out of it: its promises caught, so one that can't be done says nothing)
  const vt = (e) => { const t = e.viewTransition; if (!t) return; for (const k of ["ready", "finished", "updateCallbackDone"]) t[k]?.catch?.(() => {}); };
  addEventListener("pageswap", vt);
  addEventListener("pagereveal", vt);

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
