// One clock for ambient drift and input. The wallpaper never owns a gesture.
export function bubbleMotion(canvas, paint) {
  const controls = 'a, button, input, select, textarea, label, summary, form, dialog, iframe, [contenteditable], [role=button], [role=tab], [role=slider], [role=menuitem], [role=switch], [role=link]';
  let mode = "off", timer, frame = 0, previous;
  let press, point, tap;

  function eligible(event) {
    return mode === "live" && event.isPrimary &&
      !event.composedPath().some(node => node.matches?.(controls));
  }

  function location(event, hover) {
    const now = performance.now();
    return {x:event.clientX, y:event.clientY, hover, time:now, since:point?.hover ? point.since : now};
  }

  function lightAt(p, now) {
    if (p.hover) return .85 * -Math.expm1(-Math.max(0,now-p.since)/120);
    return (p.release ?? 1) * Math.exp(-Math.max(0,now-p.time)/310);
  }

  function sample(now) {
    const p = tap || point;
    if (!p) return null;
    const strength = lightAt(p,now);
    if (!p.hover && strength < .01) { point = null; return null; }
    const box = canvas.getBoundingClientRect();
    if (!box.width || !box.height) return null;
    const input = {x:(p.x-box.left)/box.width, y:(p.y-box.top)/box.height, strength, tap:!!tap};
    tap = null;
    return input;
  }

  function queue() {
    if (mode === "live" && !frame) frame = requestAnimationFrame(render);
  }

  function render(now) {
    frame = 0;
    clearTimeout(timer);
    const dt = previous === undefined ? 0 : Math.min(.35,Math.max(0,(now-previous)/1000));
    previous = now;
    const contact = paint(dt,mode === "live" ? sample(now) : null);
    if (mode === "live") timer = setTimeout(queue,1000/(contact ? 30 : 15));
  }

  function clearInput() { press = point = tap = null; }

  window.addEventListener("pointerdown", event => {
    if (!event.isPrimary) { clearInput(); return; }
    if (event.button !== 0 || !eligible(event)) return;
    press = {id:event.pointerId, x:event.clientX, y:event.clientY, time:performance.now()};
  }, {passive:true});
  window.addEventListener("pointermove", event => {
    if (press?.id === event.pointerId && Math.hypot(event.clientX-press.x,event.clientY-press.y) > 10) press = null;
    if (event.pointerType === "touch") return;
    if (!eligible(event) || event.buttons) { point = null; return; }
    const waking = !point;
    point = location(event,true);
    if (waking) queue();
  }, {passive:true});
  window.addEventListener("pointerup", event => {
    const start = press;
    press = null;
    if (start?.id !== event.pointerId || !eligible(event) || performance.now()-start.time > 650 ||
        Math.hypot(event.clientX-start.x,event.clientY-start.y) > 10) return;
    point = location(event,event.pointerType === "mouse");
    tap = point;
    queue();
  }, {passive:true});
  window.addEventListener("pointerout", event => {
    if (event.relatedTarget !== null || event.pointerType === "touch") return;
    press = null;
    if (point?.hover) {
      point.time = performance.now();
      point.release = lightAt(point,point.time);
      point.hover = false;
    }
  }, {passive:true});
  window.addEventListener("pointercancel", clearInput, {passive:true});
  window.addEventListener("scroll", clearInput, {capture:true, passive:true});
  window.addEventListener("blur", clearInput);

  return function setMode(next) {
    clearTimeout(timer);
    cancelAnimationFrame(frame);
    frame = 0;
    previous = undefined;
    if (next !== mode || next !== "live") clearInput();
    mode = next;
    if (mode === "off") return;
    render(performance.now());
    if (mode === "still") {
      // A display-density change can occur without a CSS resize, even on a static scene.
      let density = devicePixelRatio;
      timer = setInterval(() => {
        if (density === devicePixelRatio) return;
        density = devicePixelRatio;
        paint(0,null);
      },1000);
    }
  };
}
