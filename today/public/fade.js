// The cross-fade this page opens with, caught before it can fail out loud (InFlite's hub: pages cross-fade into each
// other, .tools/inflite/menu.css). A page opens with the cross-fade it was left with already under way
// (document.activeViewTransition). Should that be called off before it's shown (on a slow load, the page's opt-in isn't
// in place as it's revealed), each of its promises rejects ("Transition was aborted because of invalid state.
// ViewTransition opt-in disabled"), and with no one listening that's an error on the page. The menu's own catch
// (menu.js) runs from the page's module, which runs after the page is read and can come too late; this runs first, as
// the page's head is read. Nothing else changes: the cross-fade goes ahead, or is let go, as before.
(() => {
  try {
    const t = document.activeViewTransition;
    if (t) for (const k of ["ready", "finished", "updateCallbackDone"]) t[k]?.catch?.(() => {});
  } catch (_) {}
  // (and that one error, should a cross-fade begun later go unheard: only it, never anything else)
  addEventListener("unhandledrejection", (e) => {
    const r = e.reason;
    if (r && r.name === "InvalidStateError" && /^Transition was aborted/.test(String(r.message))) e.preventDefault();
  });
})();
