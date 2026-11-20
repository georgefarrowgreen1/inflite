// Observe gestures through the page. Controls, text entry and native scrolling keep ownership.
export function bubbleMotion(canvas, paint) {
  const controls = 'a, button, input, select, textarea, label, summary, form, dialog, iframe, [contenteditable], [role=button], [role=tab], [role=slider], [role=menuitem], [role=switch], [role=link]';
  let mode = "off", timer, frame = 0, previous;
  let press, point, lift, sequence = 0;

  function eligible(event) {
    return mode === "live" && !event.composedPath().some(node => node.matches?.(controls));
  }

  function clearInput() { press = point = lift = null; }

  // Use capture time even if rendering delayed delivery of the final moves.
  // Older touch implementations occasionally report time since the Unix epoch.
  function eventTime(event) {
    const now = performance.now(), t = event.timeStamp;
    return Number.isFinite(t) && t > 0 && t <= now+1 ? t : now;
  }

  function aim(x,y,down) {
    point = {x,y,down,since:point?.down === down ? point.since : performance.now()};
  }

  function begin(event,id,x,y,touch) {
    if (!eligible(event)) { clearInput(); return; }
    const time = eventTime(event);
    press = {id,x,y,time,touch,moved:false,stroke:++sequence,samples:[{x,y,time}]};
    lift = null;
    aim(x,y,true);
    queue();
  }

  function track(x,y,time) {
    const samples = press.samples;
    // Keep one sample on either side of the velocity window. A pause before
    // lifting should release the dent without throwing the orb.
    while (samples.length > 1 && samples[1].time <= time-90) samples.shift();
    const last = samples[samples.length-1];
    if (time <= last.time) { last.x = x; last.y = y; }
    else samples.push({x,y,time});
  }

  function move(event,id,x,y) {
    if (!eligible(event)) { clearInput(); return; }
    if (press?.id !== id) return;
    const dx = Math.abs(x-press.x), dy = Math.abs(y-press.y);
    if (!press.moved && press.touch && dy > 8 && dy > dx) { clearInput(); return; }
    if (Math.hypot(dx,dy) > 9) press.moved = true;
    track(x,y,eventTime(event));
    aim(x,y,true);
    queue();
  }

  function end(event,id,x,y) {
    if (press?.id !== id) return;
    if (!eligible(event)) { clearInput(); return; }
    const time = eventTime(event);
    const dx = x-press.x, dy = y-press.y;
    if (!press.moved && press.touch && Math.abs(dy) > 8 && Math.abs(dy) > Math.abs(dx)) { clearInput(); return; }
    const moved = press.moved || Math.hypot(dx,dy) >= 10;
    const tap = !moved && time-press.time < 550;
    track(x,y,time);
    const [first,second] = press.samples;
    const start = Math.max(first.time,time-90);
    const mix = second ? (start-first.time)/(second.time-first.time) : 0;
    const seconds = (time-start)/1000;
    const moving = moved && second && seconds >= .008;
    const speedX = moving ? (x-first.x-(second.x-first.x)*mix)/seconds : 0;
    const speedY = moving ? (y-first.y-(second.y-first.y)*mix)/seconds : 0;
    lift = {x,y,release:true,tap,stroke:press.stroke,originX:press.x,originY:press.y,speedX,speedY};
    if (press.touch) point = null;
    else aim(x,y,false);
    press = null;
    queue();
  }

  function sample(now) {
    const p = lift || point;
    if (!p) return null;
    lift = null;
    const box = canvas.getBoundingClientRect();
    if (!box.width || !box.height) return null;
    const strength = p.release ? 1 : .25+.75 * -Math.expm1(-Math.max(0,now-p.since)/85);
    const input = {x:(p.x-box.left)/box.width, y:(p.y-box.top)/box.height,
      down:!!p.down, release:!!p.release, tap:!!p.tap, strength};
    const stroke = p.release ? p : press;
    if (stroke) {
      input.stroke = stroke.stroke;
      input.originX = ((p.release ? p.originX : stroke.x)-box.left)/box.width;
      input.originY = ((p.release ? p.originY : stroke.y)-box.top)/box.height;
    }
    if (p.speedX || p.speedY) {
      const short = Math.min(box.width,box.height);
      input.flickX = p.speedX/short;
      input.flickY = p.speedY/short;
    }
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
    const live = mode === "live";
    const responding = paint(dt,live ? sample(now) : null,live);
    if (live && responding) queue();
    else if (live) timer = setTimeout(queue,45);
  }

  window.addEventListener("pointerdown", event => {
    if (event.pointerType === "touch" || !event.isPrimary || event.button !== 0) return;
    begin(event,event.pointerId,event.clientX,event.clientY,false);
  }, {passive:true});
  window.addEventListener("pointermove", event => {
    if (event.pointerType === "touch" || !event.isPrimary) return;
    if (press) { move(event,event.pointerId,event.clientX,event.clientY); return; }
    if (!eligible(event) || event.buttons) { point = null; return; }
    aim(event.clientX,event.clientY,false);
    queue();
  }, {passive:true});
  window.addEventListener("pointerup", event => {
    if (event.pointerType !== "touch") end(event,event.pointerId,event.clientX,event.clientY);
  }, {passive:true});
  window.addEventListener("pointerout", event => {
    if (event.pointerType !== "touch" && !event.relatedTarget) clearInput();
  }, {passive:true});
  window.addEventListener("pointercancel", event => {
    if (event.pointerType !== "touch") clearInput();
  }, {passive:true});

  // Browsers may cancel Pointer Events when a touch becomes a pan. Track the
  // original finger passively so a horizontal brush can finish and a scroll can win.
  window.addEventListener("touchstart", event => {
    if (event.touches.length !== 1) { clearInput(); return; }
    const t = event.touches[0];
    begin(event,t.identifier,t.clientX,t.clientY,true);
  }, {passive:true});
  window.addEventListener("touchmove", event => {
    if (!press?.touch || event.touches.length !== 1) return;
    const t = event.touches[0];
    move(event,t.identifier,t.clientX,t.clientY);
  }, {passive:true});
  window.addEventListener("touchend", event => {
    if (!press?.touch || event.touches.length) return;
    const t = event.changedTouches[0];
    end(event,t.identifier,t.clientX,t.clientY);
  }, {passive:true});
  window.addEventListener("touchcancel", clearInput, {passive:true});
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
      let density = devicePixelRatio;
      timer = setInterval(() => {
        if (density === devicePixelRatio) return;
        density = devicePixelRatio;
        paint(0,null,false);
      },1000);
    }
  };
}
