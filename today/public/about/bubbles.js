// The public About page has its own decorative scene.
import {newBubbleScene, driftBubbles, drawBubbles, sizeBubbleCanvas} from "/roof/bubbles.js?about";
import {animateWing} from "./wing.js";

const canvas = document.querySelector(".about-sky canvas");
const context = canvas.getContext("2d", {alpha:false});

if (context) {
  const reduce = matchMedia("(prefers-reduced-motion: reduce)");
  const solid = matchMedia("(prefers-reduced-transparency: reduce), (prefers-contrast: more), (forced-colors: active)");
  let bubbles;
  const wing = animateWing(document.querySelector(".intro-art"));
  const main = document.querySelector("main");
  const arrivals = new IntersectionObserver(entries => {
    for (const {target, isIntersecting} of entries) {
      if (!isIntersecting) continue;
      target.dataset.arrived = "";
      arrivals.unobserve(target);
    }
  }, {threshold:.18});
  for (const heading of main.querySelectorAll(".ecosystem-heading, .enquiry-copy")) arrivals.observe(heading);
  let timer, previous;
  let suspended = false;

  function paint() {
    const now = performance.now();
    if (!sizeBubbleCanvas(canvas, canvas.clientWidth, canvas.clientHeight)) return;
    const aspect = canvas.width / canvas.height;
    bubbles ||= newBubbleScene(aspect);
    if (previous && !reduce.matches) driftBubbles(bubbles, Math.min(.5, (now - previous)/1000), aspect);
    previous = now;
    drawBubbles(context, bubbles, "midnight");
    canvas.dataset.painted = "";

    const pearl = bubbles[0];
    wing.setLightIntensity(.4 + .15 * Math.sin(pearl.phase));
    main.style.setProperty("--scene-position", (100 * pearl.x).toFixed(1) + "%");
  }

  function sync() {
    clearInterval(timer);
    previous = 0;
    const active = !document.hidden && !suspended && !solid.matches;
    wing.setMotion(active && !reduce.matches);
    if (!active) return;
    paint();
    if (!reduce.matches) timer = setInterval(paint, 1000 / 12);
  }

  for (const media of [reduce, solid]) media.addEventListener("change", sync);
  new ResizeObserver(sync).observe(canvas.parentElement);
  document.addEventListener("visibilitychange", sync);
  addEventListener("pagehide", () => { suspended = true; sync(); });
  addEventListener("pageshow", () => {
    suspended = false;
    sync();
  });
  sync();
}
