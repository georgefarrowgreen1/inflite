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
    const landing = mark.getAnimations().find(animation => animation.animationName === "entrance-dock");
    if (!landing) {
      dismiss();
      return;
    }
    landing.finished.then(dismiss, dismiss);
    function aimAtHeader() {
      // CSS starts on first paint. A late image or script lets the drawing fade in place.
      if (landing.currentTime >= landing.effect.getTiming().delay) return;
      const from = mark.getBoundingClientRect();
      const to = logo.getBoundingClientRect();
      if (!from.width || !to.width) return;
      const dx = to.left - from.left;
      const dy = to.top - from.top;
      const distance = Math.hypot(dx + (to.width - from.width) / 2, dy + (to.height - from.height) / 2);
      const travel = Math.round(Math.min(760, Math.max(510, 420 + .44 * distance)));
      scene.style.setProperty("--land-x", `${dx}px`);
      scene.style.setProperty("--land-y", `${dy}px`);
      scene.style.setProperty("--land-scale", String(to.width / from.width));
      scene.style.setProperty("--travel", `${travel}ms`);
      document.body.classList.add("logo-entering");
    }
    if (logo.complete) aimAtHeader();
    else logo.addEventListener("load", aimAtHeader, { once: true, signal: lifetime.signal });
  });
}

playLogoEntrance();
