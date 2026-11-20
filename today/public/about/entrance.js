function playLogoEntrance() {
  const scene = document.querySelector(".logo-entrance");
  const logo = document.querySelector(".about-nav .brand > img");
  const quiet = matchMedia("(prefers-reduced-motion: reduce), (forced-colors: active)");
  const navigation = performance.getEntriesByType("navigation")[0];
  if (!scene) return;
  if (!logo || !Element.prototype.getAnimations || quiet.matches || document.hidden ||
      location.hash || scrollY || navigation?.type === "back_forward" || (logo.complete && !logo.naturalWidth)) {
    scene.remove();
    return;
  }

  const lifetime = new AbortController();
  const options = { passive: true, signal: lifetime.signal };
  function dismiss() {
    lifetime.abort();
    scene.remove();
    document.body.classList.remove("logo-entering");
  }
  for (const type of ["pointerdown", "keydown", "focusin", "wheel", "scroll", "resize", "pagehide", "hashchange"]) {
    window.addEventListener(type, dismiss, options);
  }
  document.addEventListener("visibilitychange", dismiss, options);
  quiet.addEventListener("change", dismiss, options);
  logo.addEventListener("error", dismiss, options);

  requestAnimationFrame(() => {
    if (lifetime.signal.aborted) return;
    const mark = scene.querySelector(".entrance-mark");
    const from = mark.getBoundingClientRect();
    const to = logo.getBoundingClientRect();
    const [landing] = mark.getAnimations();
    if (!landing || !from.width || !to.width) {
      dismiss();
      return;
    }
    landing.finished.then(dismiss, dismiss);
    // CSS starts on the first paint. A late script can let the mark finish fading in place.
    if (landing.currentTime >= landing.effect.getTiming().delay) return;
    scene.style.setProperty("--land-x", `${to.x + to.width / 2 - from.x - from.width / 2}px`);
    scene.style.setProperty("--land-y", `${to.y + to.height / 2 - from.y - from.height / 2}px`);
    scene.style.setProperty("--land-scale", String(to.width / from.width));
    document.body.classList.add("logo-entering");
  });
}

playLogoEntrance();
