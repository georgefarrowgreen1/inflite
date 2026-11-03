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
export function createSheets(F) {
  const open = [];
  const sync = () => {
    document.body.classList.toggle("sheet-up", open.length > 0);
    vv(open.length > 0);
  };
  let fitting = false;
  const fit = () => { const h = globalThis.visualViewport?.height || innerHeight; for (const s of open) s.el.style.setProperty("--vvh", `${Math.round(h)}px`); };
  const vv = (on) => {
    const v = globalThis.visualViewport;
    if (!v || on === fitting) return;
    fitting = on;
    v[on ? "addEventListener" : "removeEventListener"]("resize", fit);
    if (on) fit();
  };
  const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

  function make(d, { onClose, built, focus } = {}) {
    const body = d.querySelector(".ifs-body"), head = d.querySelector(".ifs-head"), h2 = d.querySelector(".ifs-head h2");
    const was = document.activeElement;
    const stack = [];
    let shut = false;
    const h = { el: d, body, close: () => close(true), now: () => close(false), push, pop, setBusy, closed: false };
    function done() {
      if (h.closed) return;
      h.closed = true;
      d.classList.remove("closing", "dragging");
      d.style.removeProperty("--drag");
      try { if (d.open) d.close(); } catch (_) {}
      const i = open.indexOf(h);
      if (i >= 0) open.splice(i, 1);
      d.removeEventListener("cancel", cancel); d.removeEventListener("close", closed); d.removeEventListener("click", click); d.removeEventListener("keydown", trap);
      head?.removeEventListener("pointerdown", grab); d.querySelector(".ifs-grab")?.removeEventListener("pointerdown", grab);
      while (stack.length) pop(true);
      if (built) d.remove();
      sync();
      if (was?.isConnected && !document.querySelector("dialog[open]")) was.focus?.({ preventScroll: true });
      onClose?.();
    }
    function close(animate) {
      if (shut && animate) return;
      shut = true;
      if (!animate || reduced() || !d.open) return done();
      d.classList.add("closing");
      setTimeout(done, 340);
    }
    const cancel = (e) => { e.preventDefault(); close(true); };
    const closed = () => { if (!h.closed) done(); };
    const click = (e) => {
      if (e.target.closest?.("[data-close]")) return close(true);
      if (e.target.closest?.("[data-back]")) return pop();
      if (e.target !== d) return;
      const r = d.getBoundingClientRect();
      if (e.clientY < r.top || e.clientY > r.bottom || e.clientX < r.left || e.clientX > r.right) close(true);
    };
    // drag down from the grab bar or the head to put it away
    function grab(e) {
      if (e.button || e.target.closest("button")) return;
      const y0 = e.clientY, t0 = Date.now();
      let dy = 0;
      const move = (m) => { dy = Math.max(0, m.clientY - y0); d.classList.add("dragging"); d.style.setProperty("--drag", `${dy}px`); };
      const up = () => {
        removeEventListener("pointermove", move); removeEventListener("pointerup", up); removeEventListener("pointercancel", up);
        d.classList.remove("dragging");
        if (dy > 120 || (dy > 40 && dy / (Date.now() - t0) > 0.6)) close(true);
        else d.style.removeProperty("--drag");
      };
      addEventListener("pointermove", move); addEventListener("pointerup", up); addEventListener("pointercancel", up);
    }
    // Tab and Shift-Tab go round the sheet, never out of it to the browser's own bar
    function trap(e) {
      if (e.key !== "Tab") return;
      const f = [...d.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')].filter((x) => x.getClientRects().length && !x.closest("[hidden]"));
      if (!f.length) return;
      const i = f.indexOf(document.activeElement);
      if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
    }
    function push(page = {}) {
      const kids = [...body.children].filter((c) => !c.hidden);
      for (const c of kids) c.hidden = true;
      const pg = el("div", { class: "ifs-page ifl-enter-push", data: { page: page.page } });
      stack.push({ pg, kids, title: h2?.textContent, acts: d.querySelector(".ifs-acts") });
      d.classList.add("pushed");
      if (h2 && page.title != null) h2.textContent = page.title;
      setActs(d, page.acts);
      body.append(pg);
      if (typeof page.body === "function") page.body(pg, h);
      else if (page.body) pg.append(page.body);
      body.scrollTop = 0;
      h2?.focus({ preventScroll: true });
      return pg;
    }
    function pop(quiet) {
      const s = stack.pop();
      if (!s) return;
      s.pg.remove();
      for (const c of s.kids) c.hidden = false;
      if (h2) h2.textContent = s.title;
      d.querySelector(".ifs-acts")?.remove();
      if (s.acts) d.append(s.acts);
      d.classList.toggle("pushed", stack.length > 0);
      if (!quiet) h2?.focus({ preventScroll: true });
    }
    function setBusy(on) {
      d.toggleAttribute("aria-busy", !!on);
      for (const b of d.querySelectorAll(".ifs-acts button")) b.disabled = !!on;
    }
    if (head && !head.querySelector("[data-back]")) {
      const back = el("button", { class: "ifs-btn ifs-back", type: "button", "aria-label": "Back", data: { back: "" } }, icon("back"));
      head.prepend(back);
    }
    d.addEventListener("cancel", cancel); d.addEventListener("close", closed); d.addEventListener("click", click); d.addEventListener("keydown", trap);
    head?.addEventListener("pointerdown", grab); d.querySelector(".ifs-grab")?.addEventListener("pointerdown", grab);
    d.classList.remove("closing");
    if (!d.isConnected) document.body.append(d);
    try { d.showModal(); } catch (_) { d.setAttribute("open", ""); }
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
