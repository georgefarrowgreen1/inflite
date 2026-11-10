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
// The account's appearance, Light or Dark as chosen (app.js keeps it in this browser), set as the page is read, before
// it's first drawn, and the browser's bar with it, as the other apps do. (Automatic needs nothing: the stylesheet
// follows the device.) And neither the way in nor your day is shown until app.js knows which it is (html.boot), so
// one never flashes before the other. A slow start offers Retry, never an unconfirmed sign-in screen.
try {
  const t = localStorage.getItem("today:appearance");
  if (t === "light" || t === "dark") {
    document.documentElement.dataset.theme = t;
    for (const m of document.querySelectorAll('meta[name="theme-color"]')) m.setAttribute("content", t === "dark" ? "#101210" : "#f8f9f6");
  }
} catch (_) {}
document.documentElement.classList.add("boot");
setTimeout(() => {
  document.documentElement.classList.remove("boot");
  const state = document.getElementById("sessionState");
  if (!state || state.hidden || state.getAttribute("aria-busy") !== "true") return;
  document.getElementById("sessionSaid").textContent = "Still connecting…";
  document.getElementById("sessionRetry").hidden = false;
}, 4000);
