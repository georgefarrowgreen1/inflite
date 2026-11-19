// The public About page has its own decorative scene.
import {newBubbleScene, driftBubbles, drawBubbles, sizeBubbleCanvas} from "/roof/bubbles.js?about";
import {bubbleMotion} from "/roof/bubble-motion.js?about";

const canvas = document.querySelector(".about-sky canvas");
const context = canvas.getContext("2d", {alpha:false});

if (context) {
  const reduce = matchMedia("(prefers-reduced-motion: reduce)");
  const solid = matchMedia("(prefers-reduced-transparency: reduce), (prefers-contrast: more), (forced-colors: active)");
  let bubbles;
  const main = document.querySelector("main");
  const arrivals = new IntersectionObserver(entries => {
    for (const {target, isIntersecting} of entries) {
      if (!isIntersecting) continue;
      target.dataset.arrived = "";
      arrivals.unobserve(target);
    }
  }, {threshold:.18});
  for (const heading of main.querySelectorAll(".ecosystem-heading, .enquiry-copy")) arrivals.observe(heading);
  const setMotion = bubbleMotion(canvas,paint);
  let suspended = false;

  function paint(dt, pointer) {
    if (!sizeBubbleCanvas(canvas, canvas.clientWidth, canvas.clientHeight)) return;
    const aspect = canvas.width / canvas.height;
    // Compose the first frame beside the copy. The motion solver never sees these bounds.
    bubbles ||= newBubbleScene(aspect, canvas.clientWidth > 800
      ? {x:[.66,.84], y:[.30,.50]} : {x:[.65,.82], y:[.49,.63]});
    const highlight = (dt || pointer) ? driftBubbles(bubbles,dt,aspect,pointer) : null;
    drawBubbles(context,bubbles,"midnight",0,highlight);
    if (!canvas.hasAttribute("data-painted")) canvas.dataset.painted = "";
    main.style.setProperty("--scene-position", (100 * bubbles[0].x).toFixed(1) + "%");
    return highlight;
  }

  function sync() {
    const visible = !document.hidden && !suspended && !solid.matches;
    setMotion(visible ? (reduce.matches ? "still" : "live") : "off");
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
