// About and Contact share the public orb renderer.
import {defaultBubbleColour, newBubbleScene, driftBubbles, respondingBubbles, drawBubbles, sizeBubbleCanvas} from "/roof/bubbles.js?about";
import {bubbleMotion} from "/roof/bubble-motion.js?about";

const canvas = document.querySelector(".about-sky canvas");
const context = canvas?.getContext("2d", {alpha:false});

if (context) {
  const light = matchMedia("(prefers-color-scheme: light)");
  const reduce = matchMedia("(prefers-reduced-motion: reduce)");
  const solid = matchMedia("(prefers-reduced-transparency: reduce), (prefers-contrast: more), (forced-colors: active)");
  let bubbles;
  const stage = document.querySelector(".introduction, .contact-layout");
  const contact = stage?.classList.contains("contact-layout");
  const setMotion = bubbleMotion(canvas, paint);
  let suspended = false;
  let inView = true;

  function paint(dt, pointer, live) {
    const width = canvas.clientWidth, height = canvas.clientHeight;
    if (!width || !height) return;
    const aspect = width/height;
    // Compose the first frame beside the copy. The motion solver never sees these bounds.
    if (!bubbles) {
      const wide = width > 800;
      const opening = contact
        ? (wide ? {x:[.26,.38], y:[.72,.80]} : {x:[.69,.82], y:[.22,.30]})
        : (wide ? {x:[.79,.91], y:[.43,.56]} : {x:[.66,.83], y:[.48,.62]});
      bubbles = newBubbleScene(aspect, opening);
    }
    if (dt || pointer) driftBubbles(bubbles,dt,aspect,pointer);
    sizeBubbleCanvas(canvas,width,height,live && respondingBubbles(bubbles));
    const moving = drawBubbles(context,bubbles,defaultBubbleColour,0,live,light.matches);
    if (!canvas.hasAttribute("data-painted")) canvas.dataset.painted = "";
    return moving;
  }

  function sync() {
    const visible = inView && !document.hidden && !suspended && !solid.matches;
    setMotion(visible ? (reduce.matches ? "still" : "live") : "off");
  }

  for (const media of [light, reduce, solid]) media.addEventListener("change", sync);
  new ResizeObserver(sync).observe(canvas.parentElement);
  if (stage && "IntersectionObserver" in window) {
    new IntersectionObserver(([entry]) => {
      inView = entry.isIntersecting;
      sync();
    }, { rootMargin: "80px" }).observe(stage);
  }
  document.addEventListener("visibilitychange", sync);
  addEventListener("pagehide", () => { suspended = true; sync(); });
  addEventListener("pageshow", () => {
    suspended = false;
    sync();
  });
  sync();
}
