// The public About page has its own decorative scene.
import {newLavaScene, driftLava, drawLavaFrame} from "/roof/lava-field.js?about";

const canvas = document.querySelector(".about-sky canvas");
const context = canvas.getContext("2d", {alpha:false});

if (context) {
  const reduce = matchMedia("(prefers-reduced-motion: reduce)");
  const solid = matchMedia("(prefers-reduced-transparency: reduce), (prefers-contrast: more), (forced-colors: active)");
  const pools = newLavaScene();
  let frame, timer, previous;
  let suspended = false;

  function paint() {
    const now = performance.now();
    if (previous) driftLava(pools, Math.min(.25, (now - previous) / 1000), frame.width / frame.height);
    previous = now;
    drawLavaFrame(context, frame, pools, "jade");
  }

  function sync() {
    clearInterval(timer);
    previous = 0;
    if (!frame || document.hidden || suspended || solid.matches) return;
    paint();
    if (!canvas.hasAttribute("data-painted")) canvas.dataset.painted = "";
    if (!reduce.matches) timer = setInterval(paint, 125);
  }

  function resize() {
    const {clientWidth:width, clientHeight:height} = canvas.parentElement;
    if (width && height) {
      const scale = Math.min(1, 240 / Math.max(width, height));
      const w = Math.max(1, Math.round(width * scale)), h = Math.max(1, Math.round(height * scale));
      if (frame?.width !== w || frame?.height !== h) {
        canvas.width = w;
        canvas.height = h;
        frame = context.createImageData(w, h);
      }
    }
    sync();
  }

  for (const media of [reduce, solid]) media.addEventListener("change", sync);
  new ResizeObserver(resize).observe(canvas.parentElement);
  document.addEventListener("visibilitychange", sync);
  addEventListener("pagehide", () => { suspended = true; sync(); });
  addEventListener("pageshow", () => {
    suspended = false;
    sync();
  });
  resize();
}
