// Swiping between an app's sections (Weather's Now, 16 Days, Radar and Warnings; Fitness's; Markets'), as a native app
// pages between its tabs: the section follows the finger, the one beside it comes in from the side, and a release past a
// third of the width (or a quick flick) settles on it with a spring; short of that, back as it was. Kept out of roof/
// (the framework's own scripts have a size budget); it asks the frame for nothing but F.route and F.nav.section.
//   swipes(F) → off
// Only a horizontal drag that starts on the app's screen, by touch, and not: on a field, a map (Radar: the map has the
// finger), a sheet, the header or the tab bar; within 24 px of either edge (the phone's own back swipe); or on anything
// that handles a sideways drag of its own (a chart you scrub, a row you swipe, anything scrolling sideways: each sets a
// touch-action of its own, or scrolls). The screen allows pan-y and pinch-zoom (app.css): vertical scrolling and zoom
// stay with the browser; a sideways drag comes here. Mail's rows swipe for Done and Later, so Mail has no section swipe.
// The section beside is shown from where the switch will put it (the frame's rule: scrolled past the header, its own
// last place or just under the header; at the top, its top), so letting go changes nothing that's seen. A section never
// drawn yet is drawn first: an "ifl-peek" event on the module's root with its id (weather.js, fitness.js, markets.js).
const NO = 'input, textarea, select, [contenteditable], .radar-map, canvas, video, iframe, [data-no-swipe], dialog, .ifl-hd, .ifl-tabs, .ml-row';

export function swipes(F) {
  const doc = document, html = doc.documentElement;
  // (each section's last scroll, as the frame keeps it: the switch goes back to it)
  const ys = new Map();
  const onScroll = () => { const r = F.route; if (r?.kind === "app" && r.section && !st) ys.set(`${r.app}:${r.section}`, scrollY); };
  addEventListener("scroll", onScroll, { passive: true });
  let st = null, quiet = 0;

  const screen = () => doc.querySelector("main.ifl-screen:not([hidden])");
  const secOf = (scr, id) => scr.querySelector(`[role=tabpanel] > section[data-sec="${CSS.escape(id)}"]`);
  const ownDrag = (t, stop) => {
    for (let n = t; n && n !== stop; n = n.parentElement) {
      const cs = getComputedStyle(n), ta = cs.touchAction;
      if (ta && ta !== "auto" && ta !== "manipulation") return true;
      if (n.scrollWidth > n.clientWidth + 2 && /auto|scroll/.test(cs.overflowX)) return true;
    }
    return false;
  };
  const targetY = (app, id) => (scrollY > 28 ? Math.max(ys.get(`${app}:${id}`) || 0, 29) : 0);
  const put = (el, x) => el?.style.setProperty("--sx", `${x}px`);

  function down(e) {
    // A second finger belongs to pinch zoom. Cancel any section preview before it
    // can settle into navigation, including browsers that delay pointercancel.
    if (e.pointerType === "touch" && !e.isPrimary && st) { up({ pointerId: st.id }, true); return; }
    if (e.pointerType !== "touch" || !e.isPrimary || st || html.classList.contains("ifl-fill") || Date.now() < quiet) return;
    const r = F.route;
    if (r?.kind !== "app" || !r.section || r.app === "mail") return;
    if (e.clientX < 24 || e.clientX > innerWidth - 24) return;
    const scr = screen(), panel = scr?.querySelector("[role=tabpanel]");
    if (!panel || !panel.contains(e.target) || e.target.closest(NO) || ownDrag(e.target, panel)) return;
    const ids = [...doc.querySelectorAll("#hd [role=tab][data-sec]")].map((b) => b.dataset.sec), i = ids.indexOf(r.section);
    const cur = i < 0 ? null : secOf(scr, r.section);
    if (!cur || ids.length < 2) return;
    st = { id: e.pointerId, x0: e.clientX, y0: e.clientY, ids, i, app: r.app, scr, panel, cur, lock: null, dx: 0, dir: 0, nb: null, nbId: null, v: [] };
    // (the section readied to move from the touch itself, before the drag's known to be sideways: its layer's made in
    // those few frames, not in the first frame of the swipe)
    cur.classList.add("ifl-sw-ready");
    // (what the swipe needs measured, measured now, before anything's changed: no layout forced as it begins)
    st.top = Math.round(cur.getBoundingClientRect().top - panel.getBoundingClientRect().top);
    st.disp = getComputedStyle(cur).display;
  }
  function begin() {
    html.classList.add("ifl-swiping");
    st.cur.classList.add("ifl-sw-cur");
  }
  // (the section beside, on the side the finger's going: shown from where the switch will put it)
  function neighbour(dir) {
    if (st.dir === dir) return;
    if (st.nb) { st.nb.classList.remove("ifl-sw-peek"); st.nb.style.removeProperty("--sx"); st.nb.style.removeProperty("--sy"); }
    st.dir = dir; st.nb = null; st.nbId = null;
    const j = st.i - dir, id = st.ids[j];
    if (id == null) return;
    const el = secOf(st.scr, id);
    if (!el) return;
    if (!el.childElementCount) st.panel.dispatchEvent(new CustomEvent("ifl-peek", { detail: id }));
    el.style.setProperty("--sw-d", st.disp || "block");
    el.style.setProperty("--sy", `${st.top + scrollY - targetY(st.app, id)}px`);
    el.classList.add("ifl-sw-peek");
    st.nb = el; st.nbId = id;
  }
  function move(e) {
    if (!st || e.pointerId !== st.id) return;
    const dx = e.clientX - st.x0, dy = e.clientY - st.y0;
    if (!st.lock) {
      if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
      st.lock = Math.abs(dx) > Math.abs(dy) * 1.2 ? "x" : "y";
      if (st.lock === "y") { st.cur.classList.remove("ifl-sw-ready"); st = null; return; }
      begin();
    }
    const dir = dx > 0 ? 1 : -1;
    neighbour(dir);
    // (no section that way: it gives, a little, and comes back)
    const x = st.nb ? dx : dx * 0.3, W = innerWidth;
    st.dx = x;
    st.v.push([e.timeStamp, dx]); if (st.v.length > 5) st.v.shift();
    put(st.cur, x);
    if (st.nb) put(st.nb, x - dir * W);
  }
  function up(e, cancelled = false) {
    if (!st || e.pointerId !== st.id) return;
    const s = st;
    if (s.settling) return;
    if (s.lock !== "x") { s.cur.classList.remove("ifl-sw-ready"); st = null; return; }
    s.settling = true;
    const W = innerWidth, [a, b] = [s.v[0], s.v[s.v.length - 1]], vel = a && b && b[0] > a[0] ? (b[1] - a[1]) / (b[0] - a[0]) : 0;
    const go = !cancelled && !!s.nb && (Math.abs(s.dx) > W / 3 || (Math.abs(vel) > 0.45 && Math.sign(vel) === s.dir));
    html.classList.add("ifl-sw-go");
    put(s.cur, go ? s.dir * W : 0);
    if (s.nb) put(s.nb, go ? 0 : -s.dir * W);
    quiet = Date.now() + 400;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      // (the switch first, then the preview let go, in the one task: nothing seen moves)
      if (go) F.nav.section(s.app, s.nbId);
      for (const el of [s.cur, s.nb]) { if (!el) continue; el.classList.remove("ifl-sw-cur", "ifl-sw-peek", "ifl-sw-ready"); for (const p of ["--sx", "--sy", "--sw-d"]) el.style.removeProperty(p); }
      html.classList.remove("ifl-swiping", "ifl-sw-go");
      if (st === s) st = null;
    };
    s.cur.addEventListener("transitionend", finish, { once: true });
    setTimeout(finish, 420);
  }
  // (a tap that ends a swipe opens nothing)
  const click = (e) => { if (Date.now() < quiet) { e.preventDefault(); e.stopPropagation(); } };
  const onUp = (e) => up(e), onCancel = (e) => up(e, true);
  doc.addEventListener("pointerdown", down, { passive: true });
  doc.addEventListener("pointermove", move, { passive: true });
  doc.addEventListener("pointerup", onUp, { passive: true });
  doc.addEventListener("pointercancel", onCancel, { passive: true });
  doc.addEventListener("click", click, true);
  return () => {
    removeEventListener("scroll", onScroll);
    doc.removeEventListener("pointerdown", down); doc.removeEventListener("pointermove", move);
    doc.removeEventListener("pointerup", onUp); doc.removeEventListener("pointercancel", onCancel);
    doc.removeEventListener("click", click, true);
  };
}
