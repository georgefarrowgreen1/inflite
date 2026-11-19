// The public About page has its own decorative scene.
import {newLavaScene, driftLava, drawLavaFrame} from "/roof/lava-field.js?about";
import {animateWing} from "./wing.js";

const canvas = document.querySelector(".about-sky canvas");
const context = canvas.getContext("2d", {alpha:false});

if (context) {
  const reduce = matchMedia("(prefers-reduced-motion: reduce)");
  const solid = matchMedia("(prefers-reduced-transparency: reduce), (prefers-contrast: more), (forced-colors: active)");
  const pools = newLavaScene();
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
  let frame, timer, previous;
  let suspended = false;

  function paint() {
    const now = performance.now();
    if (previous) driftLava(pools, Math.min(.25, (now - previous) / 1000), frame.width / frame.height);
    previous = now;
    drawLavaFrame(context, frame, pools, "midnight");

    // Use a light already present in the field for the wing and the section edges.
    const pool = pools[2];
    const x = Math.max(0, Math.min(frame.width - 1, Math.round(pool.x * frame.width)));
    const y = Math.max(0, Math.min(frame.height - 1, Math.round(pool.y * frame.height)));
    const pixel = 4 * (y * frame.width + x);
    const [r, g, b] = frame.data.subarray(pixel, pixel + 3);
    wing.setLightIntensity((.25 * r + .5 * g + .25 * b) / 255);
    const scroll = reduce.matches ? 0 : Math.min(1, Math.max(0, scrollY) / (2 * innerHeight));
    const position = 20 + 48 * x / frame.width + 16 * scroll;
    main.style.setProperty("--scene-position", position.toFixed(1) + "%");
    main.style.setProperty("--scene-light", [r + 48, g + 37, b + 82].join(" "));
  }

  function sync() {
    clearInterval(timer);
    previous = 0;
    const active = !document.hidden && !suspended && !solid.matches;
    wing.setMotion(active && !reduce.matches);
    if (!active || !frame) return;
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
