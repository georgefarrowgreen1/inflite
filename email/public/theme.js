// ==== InFlite motion: shared lifecycle ====
// Pause presentation motion before first paint and while the page is in the app
// switcher. This does not pause data, requests, navigation or authentication.
(() => {
  const doc = globalThis.document, root = doc?.documentElement;
  if (!root?.toggleAttribute || globalThis.__iflMotionReady) return;
  globalThis.__iflMotionReady = true;
  const sync = () => root.toggleAttribute("data-motion-paused", doc.visibilityState === "hidden");
  doc.addEventListener?.("visibilitychange", sync);
  globalThis.addEventListener?.("pagehide", () => root.toggleAttribute("data-motion-paused", true));
  globalThis.addEventListener?.("pageshow", sync);
  sync();
})();
// ==== End InFlite motion ====
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
// The account's appearance, Light or Dark as chosen (app.js lookOf remembers it in this browser), set as the page is
// read, before it's first drawn, and the browser's bar with it, as the site's other apps do. (Automatic needs nothing:
// the stylesheet follows the device.)
try {
  const t = localStorage.getItem("mail:appearance");
  if (t === "light" || t === "dark") {
    document.documentElement.dataset.theme = t;
    for (const m of document.querySelectorAll('meta[name="theme-color"]')) m.setAttribute("content", t === "dark" ? "#101210" : "#f8f9f6");
  }
} catch (_) {}
