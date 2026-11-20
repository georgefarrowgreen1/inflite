// Reveal each section once without hiding content before the script loads.
const reduced = matchMedia("(prefers-reduced-motion: reduce)");
const entered = new WeakSet();
const running = new Set();
let observer;

function syncReveals() {
  observer?.disconnect();
  if (reduced.matches) {
    for (const animation of running) animation.cancel();
    return;
  }
  if (!("IntersectionObserver" in window) || !Element.prototype.animate) return;
  observer = new IntersectionObserver(entries => {
    let delay = 0;
    for (const { target, isIntersecting } of entries) {
      if (!isIntersecting) continue;
      observer.unobserve(target);
      entered.add(target);
      const animation = target.animate(
        [{ opacity: .64, transform: "translateY(18px)" }, { opacity: 1, transform: "translateY(0)" }],
        { duration: 620, delay: Math.min(delay, 140), easing: "cubic-bezier(.18,.7,.23,1)", fill: "backwards" }
      );
      running.add(animation);
      animation.finished.then(() => running.delete(animation), () => running.delete(animation));
      delay += 45;
    }
  }, { threshold: .12 });
  for (const element of document.querySelectorAll("[data-reveal]")) {
    if (!entered.has(element)) observer.observe(element);
  }
}
reduced.addEventListener("change", syncReveals);
syncReveals();
