// InFlite's sheet (One roof, spec §3.8, D22): one component on <dialog>.showModal() (focus trap, Escape, the page made
// inert, the top layer over the tab bar), opened by a tap with no history entry and no URL. While any is open,
// body.sheet-up is set (Weather's charts hold back on it).
// createSheets(F) → Sheets:
//   open(spec) → Handle, spec = { sheet, label, title, hero, body, acts, onClose, app, focus }
//     sheet: its name, data-sheet on the <dialog> (fixed list in MAIN .tools/tests/roofhooks.mjs: search, connector,
//       places, confirm-place, wxsettings, day, detail, warning, credits); label: aria-label when there's no title;
//     title: the h2; hero: { app, name, line } (.ifs-hero); body: Node | (bodyEl, handle) => void; acts: [{ label, run,
//     primary, destructive, act }] in the sticky footer.ifs-acts; onClose(): after it closes, however; app: the accent
//     for this sheet only; focus: the element to focus as it opens (else its h2)
//   Handle = { el (the dialog), body (its .ifs-body), close(), push(page) → pageEl, pop(), setBusy(bool) }
//     push(page), page = { page, title, body, acts }: an inner page (back ‹ in the head), its container .ifs-page with
//     data-page=<page>
//   openEl(dialog, { onClose }) → Handle: the static dialogs in index.html, written with the frozen markup:
// <dialog class="ifl-sheet" id="…" aria-labelledby="…-t"><div class="ifs-grab" aria-hidden="true"></div>
//   <header class="ifs-head"><h2 id="…-t" tabindex="-1">…</h2><button class="ifs-btn" type="button" data-close
//   aria-label="Close">✕</button></header><div class="ifs-body">…</div><footer class="ifs-acts">…</footer></dialog>
//   closeAll(): every framework sheet, at once (never Chat's engine dialog); any route change calls it first (D22).
//   top() → Handle | null.
import { el, btn, icon } from "./ui.js";

let n = 0;
export function createSheets(F, { beforeOpen } = {}) {
  const open = [];
  const focused = () => (document.activeElement?.shadowRoot || document).activeElement;
  let restoreFrame = 0, restoreAt = 0;
  const touchInsets = new WeakMap();
  function restoreTouchInsets(el) {
    const original = touchInsets.get(el);
    if (original) Object.assign(el.style, original);
    touchInsets.delete(el);
  }
  // (the keyboard up: an open sheet no taller than what's in sight, and lifted above it. iOS lays the keyboard over the
  // page, not the page above the keyboard, so a sheet fixed to the page's foot sat under it, its field out of sight: it's
  // taken up by how much of the page the keyboard covers, the page's height less what's in sight and where that starts)
  const v = globalThis.visualViewport;
  let lateT = 0, fitFrame = 0, observedBody = null, keyboard = false;
  function revealField() {
    const sheet = open.at(-1), field = focused();
    if (!sheet?.el.classList.contains("ifs-kb-body") || !sheet.body?.contains(field)) return;
    const { el, body } = sheet;
    if (el.scrollTop) el.scrollTop = 0;
    const bounds = body.getBoundingClientRect(), target = field.getBoundingClientRect();
    if (target.height > bounds.height) {
      if (target.bottom <= bounds.top || target.top >= bounds.bottom) body.scrollTop += Math.round(target.top - bounds.top);
      return;
    }
    if (target.bottom > bounds.bottom) body.scrollTop += Math.ceil(target.bottom - bounds.bottom);
    else if (target.top < bounds.top) body.scrollTop += Math.floor(target.top - bounds.top);
  }
  const bodyResize = globalThis.ResizeObserver ? new ResizeObserver(revealField) : null;
  function observeBody(body) {
    if (body === observedBody) return;
    observedBody = body;
    bodyResize?.disconnect();
    if (body) bodyResize?.observe(body);
  }
  const fit = () => {
    const layoutHeight = document.documentElement.clientHeight;
    const height = v?.height || layoutHeight, top = Math.max(0, v?.offsetTop || 0);
    const covered = Math.max(0, Math.round(layoutHeight - height));
    const foot = Math.max(0, covered - Math.round(top));
    const s = globalThis.screen, portrait = matchMedia("(orientation: portrait)").matches;
    const tall = s ? (portrait ? Math.max(s.width, s.height) : Math.min(s.width, s.height)) : height;
    const field = focused();
    const editing = field?.matches("input,textarea,[contenteditable]");
    const typing = editing && matchMedia("(any-pointer: coarse)").matches;
    // Browser chrome can change the viewport without opening a keyboard. Keep
    // the keyboard layout during focus changes until the viewport grows again.
    const fitted = Math.abs((v?.scale || 1) - 1) < 0.01;
    const keyboardCovers = covered > (editing || keyboard ? 80 : 160);
    keyboard = fitted && (keyboardCovers || (typing && tall - height > 260));
    const up = keyboard;
    const sheet = open.at(-1);
    if (sheet) {
      const { el, body } = sheet;
      el.style.setProperty("--vvh", `${Math.round(height)}px`);
      el.style.setProperty("--vv-top", `${Math.round(top)}px`);
      el.style.setProperty("--sheet-foot", `${foot}px`);
      el.classList.toggle("ifs-kb", up);
      const ownsField = editing && body?.contains(field);
      const innerScroll = up && (ownsField || el.classList.contains("ifs-kb-body"));
      el.classList.toggle("ifs-kb-body", innerScroll);
      if (up && matchMedia("(hover: none)").matches) {
        // WebKit can keep the old fixed-dialog inset through a viewport change.
        if (!touchInsets.has(el)) {
          const { top, bottom, maxHeight } = el.style;
          touchInsets.set(el, { top, bottom, maxHeight });
        }
        const safeTop = "max(env(safe-area-inset-top, 0px), 12px)";
        // Let Quick Capture's content height grow upward from the keyboard.
        el.style.top = el.dataset.sheet === "quick-capture" ? "auto" : `calc(${Math.round(top)}px + ${safeTop} + 6px)`;
        el.style.bottom = `${foot}px`;
        el.style.maxHeight = `calc(${Math.round(height)}px - ${safeTop} - 6px)`;
      } else restoreTouchInsets(el);
      cancelAnimationFrame(fitFrame);
      // Measure after WebKit has laid out the newly fitted dialog.
      observeBody(innerScroll && ownsField ? body : null);
      if (innerScroll && ownsField) fitFrame = requestAnimationFrame(revealField);
    }
    // (and the tab bar out of sight while it's up: iOS's bar above the keyboard is see-through, and it showed through it)
    document.body.classList.toggle("kb-up", up && open.length > 0);
  };
  const later = () => {
    clearTimeout(lateT);
    fit();
    lateT = setTimeout(fit, 400);
  };
  const sync = () => {
    const up = open.length > 0;
    document.body.classList.toggle("sheet-up", up);
    if (!up) { keyboard = false; document.body.classList.remove("kb-up"); }
    // (and again a moment after, and after a field's chosen or typed in: iOS raises its row of word suggestions after
    // the keyboard, and doesn't always say so)
    if (v) for (const [t, e] of [[v, "resize"], [v, "scroll"], [document, "focusin"], [document, "focusout"], [document, "input"], [document, "visibilitychange"], [globalThis, "pageshow"], [globalThis, "resize"]]) t[up ? "addEventListener" : "removeEventListener"](e, later);
    clearTimeout(lateT);
    cancelAnimationFrame(fitFrame);
    if (up && v) fit();
    else observeBody(null);
  };
  const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

  function make(d, { onClose, built, focus } = {}) {
    beforeOpen?.();
    cancelAnimationFrame(restoreFrame); restoreFrame = 0; restoreAt++;
    const body = d.querySelector(".ifs-body"), head = d.querySelector(".ifs-head"), h2 = head?.querySelector("h2");
    const was = focused(), page = { x: scrollX, y: scrollY, route: F?.route, url: location.href };
    const stack = [];
    let shut = false, closeTimer = 0, drag = null, pageTimer = 0, sizeMotion = null;
    const ac = new AbortController(), sig = { signal: ac.signal };
    const h = { el: d, body, close: () => close(true), back: () => stack.length ? pop() : close(true), now: () => close(false), push, pop, setBusy, closed: false };
    function done() {
      if (h.closed) return;
      shut = true;
      h.closed = true;
      const current = !F?.signal?.aborted && F?.route === page.route && location.href === page.url;
      const position = current ? page : { x: scrollX, y: scrollY };
      clearTimeout(closeTimer); clearTimeout(pageTimer); drag?.abort(); sizeMotion?.cancel();
      d.classList.remove("closing", "dragging", "ifs-touched", "ifs-kb", "ifs-kb-body");
      body.classList.remove("ifl-enter-pop");
      d.style.removeProperty("--drag");
      restoreTouchInsets(d);
      try { if (d.open) d.close(); } catch (_) {}
      open.splice(open.indexOf(h), 1);
      ac.abort();
      while (stack.length) pop(true);
      if (built) d.remove();
      sync();
      const parent = open.at(-1);
      const returnsToOpener = parent ? parent.el.contains(was) : !document.querySelector("dialog[open]");
      if (current && was?.isConnected && returnsToOpener) was.focus?.({ preventScroll: true });
      // WebKit can scroll after native dialog close, despite preventScroll. A newer sheet, route or frame owns its
      // own position; it must never inherit this close's deferred restoration.
      cancelAnimationFrame(restoreFrame);
      const token = ++restoreAt, route = F?.route, url = location.href;
      if (!F?.signal?.aborted) {
        scrollTo(position.x, position.y);
        restoreFrame = requestAnimationFrame(() => {
          restoreFrame = 0;
          if (token === restoreAt && !F?.signal?.aborted && F?.route === route && location.href === url) scrollTo(position.x, position.y);
        });
      }
      onClose?.();
    }
    function close(animate) {
      if (shut && animate) return;
      shut = true;
      sizeMotion?.cancel();
      if (!animate || reduced() || !d.open) return done();
      drag?.abort(); d.classList.remove("dragging");
      d.classList.add("closing");
      closeTimer = setTimeout(done, 400);
    }
    const cancel = (e) => { e.preventDefault(); h.back(); };
    const click = (e) => {
      if (e.target.closest?.("[data-close]")) return close(true);
      if (e.target.closest?.("[data-back]")) return pop();
      if (e.target !== d) return;
      const r = d.getBoundingClientRect();
      if (e.clientY < r.top || e.clientY > r.bottom || e.clientX < r.left || e.clientX > r.right) close(true);
    };
    // drag down from the grab bar or the head to put it away
    function grab(e) {
      if (shut || drag || e.button || e.isPrimary === false || e.target.closest("button, input, select, textarea, a")) return;
      sizeMotion?.cancel();
      const x0 = e.clientX, y0 = e.clientY, t0 = Date.now();
      let dy = 0;
      const a = drag = new AbortController(), o = { signal: a.signal };
      const cancelDrag = () => { a.abort(); drag = null; d.classList.remove("dragging"); d.style.removeProperty("--drag"); };
      const up = (p) => {
        if (p.pointerId !== e.pointerId) return;
        a.abort(); drag = null;
        d.classList.remove("dragging");
        if (p.type !== "pointercancel" && (dy > 120 || (dy > 40 && dy / Math.max(1, Date.now() - t0) > 0.6))) close(true);
        else d.style.removeProperty("--drag");
      };
      addEventListener("pointermove", (m) => { if (m.pointerId !== e.pointerId) return; dy = Math.max(0, m.clientY - y0); if (Math.abs(m.clientX - x0) > Math.max(12, dy)) return cancelDrag(); d.classList.add("dragging", "ifs-touched"); d.style.setProperty("--drag", `${dy}px`); }, o);
      addEventListener("pointerup", up, o); addEventListener("pointercancel", up, o);
      addEventListener("blur", cancelDrag, o);
      for (const target of [v, globalThis]) target?.addEventListener("resize", cancelDrag, o);
      document.addEventListener("visibilitychange", () => { if (document.hidden) cancelDrag(); }, o);
    }
    // Tab and Shift-Tab go round the sheet, never out of it to the browser's own bar
    function trap(e) {
      if (e.key === "Escape") return cancel(e);
      if (e.key !== "Tab") return;
      const f = [...d.querySelectorAll('a[href],button,input,select,textarea,[tabindex]:not([tabindex="-1"])')].filter((x) => !x.disabled && x.getClientRects().length && !x.closest("[hidden]"));
      if (!f.length) return;
      const i = f.indexOf(focused());
      if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
    }
    const stopSize = () => sizeMotion?.cancel();
    for (const target of [v, globalThis, document]) target?.addEventListener?.(target === document ? "visibilitychange" : "resize", stopSize, sig);
    const calm = matchMedia("(prefers-reduced-motion: reduce)");
    calm.addEventListener?.("change", stopSize, sig);
    const sizeBefore = () => { const height = d.offsetHeight; stopSize(); return height; };
    function resizeFrom(height) {
      if (!height || height === d.offsetHeight || drag || shut || reduced() || document.hidden || d.classList.contains("ifs-kb") || !d.animate) return;
      // A finite, unfilled animation returns to intrinsic height automatically.
      // Cancelling on resize, keyboard appearance or a newer page leaves no pixel lock.
      try { sizeMotion = d.animate([{ height: `${height}px` }, { height: `${d.offsetHeight}px` }], { duration: 280, easing: "cubic-bezier(0.32, 0.72, 0, 1)" }); sizeMotion.finished.catch(() => {}); } catch (_) {}
    }
    function push(page = {}) {
      if (shut) return;
      const height = sizeBefore();
      clearTimeout(pageTimer); body.classList.remove("ifl-enter-pop");
      const kids = [...body.children].filter((c) => !c.hidden);
      const pg = el("div", { class: "ifs-page ifl-enter-push", data: { page: page.page } });
      stack.push({ pg, kids, onLeave: page.onLeave, title: h2?.textContent, acts: d.querySelector(".ifs-acts"), y: d.scrollTop, by: body.scrollTop, focus: focused() });
      for (const c of kids) c.hidden = true;
      d.classList.add("pushed");
      if (h2 && page.title != null) h2.textContent = page.title;
      setActs(d, page.acts);
      body.append(pg);
      if (typeof page.body === "function") page.body(pg, h);
      else if (page.body) pg.append(page.body);
      d.scrollTop = body.scrollTop = 0;
      resizeFrom(height);
      h2?.focus({ preventScroll: true });
      return pg;
    }
    function pop(quiet) {
      if (shut && !quiet) return;
      const s = stack.pop();
      if (!s) return;
      const height = sizeBefore();
      s.pg.remove();
      s.onLeave?.();
      for (const c of s.kids) c.hidden = false;
      if (h2) h2.textContent = s.title;
      d.querySelector(".ifs-acts")?.remove();
      if (s.acts) d.append(s.acts);
      d.classList.toggle("pushed", stack.length > 0);
      if (!quiet) {
        resizeFrom(height);
        body.classList.add("ifl-enter-pop");
        clearTimeout(pageTimer); pageTimer = setTimeout(() => body.classList.remove("ifl-enter-pop"), 450);
        d.scrollTop = s.y; body.scrollTop = s.by;
        (s.focus?.isConnected && d.contains(s.focus) ? s.focus : h2)?.focus({ preventScroll: true });
      }
    }
    function setBusy(on) {
      if (shut) return;
      if (on) d.setAttribute("aria-busy", "true"); else d.removeAttribute("aria-busy");
      for (const b of d.querySelectorAll(".ifs-acts button, [data-sheet-action]")) b.disabled = !!on;
    }
    if (head && !head.querySelector("[data-back]")) {
      const back = el("button", { class: "ifs-btn ifs-back", type: "button", "aria-label": "Back", data: { back: "" } }, icon("back"));
      head.prepend(back);
    }
    const ended = (e) => { if (shut && e.target === d && /^(ifl-sheet-out|ifl-sheet-unpop)$/.test(e.animationName)) done(); };
    for (const [t, e, f] of [[d, "cancel", cancel], [d, "close", done], [d, "click", click], [d, "keydown", trap], [d, "animationend", ended], [head, "pointerdown", grab], [d.querySelector(".ifs-grab"), "pointerdown", grab]]) t?.addEventListener(e, f, sig);
    d.classList.remove("closing");
    if (!d.isConnected) document.body.append(d);
    try { d.showModal(); } catch (_) { d.setAttribute("open", ""); }
    d.scrollTop = body.scrollTop = 0;
    open.push(h);
    sync();
    (focus || h2)?.focus?.({ preventScroll: true });
    return h;
  }
  function setActs(d, acts) {
    d.querySelector(".ifs-acts")?.remove();
    if (acts?.length) d.append(el("footer", { class: "ifs-acts" }, acts.map((a) => btn(a.label, a))));
  }

  return {
    open(spec = {}) {
      const id = `ifl-sh-${++n}`;
      const d = el("dialog", { class: "ifl-sheet", id, data: { sheet: spec.sheet, app: spec.app } });
      const h2 = el("h2", { id: `${id}-t`, tabindex: "-1", text: spec.title || spec.label || "", class: spec.title ? null : "vh" });
      if (spec.title) d.setAttribute("aria-labelledby", `${id}-t`);
      else d.setAttribute("aria-label", spec.label || "");
      const x = el("button", { class: "ifs-btn", type: "button", "aria-label": "Close", data: { close: "" } }, icon("x"));
      const body = el("div", { class: "ifs-body" });
      d.append(el("div", { class: "ifs-grab", "aria-hidden": "true" }), el("header", { class: "ifs-head" }, h2, x));
      if (spec.hero) d.append(el("div", { class: "ifs-hero" }, spec.hero.app ? icon(null, { app: spec.hero.app, size: 64 }) : null, el("b", { text: spec.hero.name }), spec.hero.line ? el("span", { text: spec.hero.line }) : null));
      d.append(body);
      setActs(d, spec.acts);
      const h = make(d, { onClose: spec.onClose, built: true, focus: spec.focus });
      if (typeof spec.body === "function") spec.body(body, h);
      else if (spec.body) body.append(spec.body);
      if (spec.focus) spec.focus.focus?.({ preventScroll: true });
      return h;
    },
    openEl(d, { onClose } = {}) {
      const h = open.find((s) => s.el === d);
      return h || make(d, { onClose });
    },
    closeAll() { for (const s of [...open].reverse()) s.now(); },
    top: () => open[open.length - 1] || null,
  };
}
