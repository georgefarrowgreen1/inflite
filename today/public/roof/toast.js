// InFlite's toast (One roof, spec §3.9): the shared block's look (.ifm-note.ifl-toast), above the tab bar, one at a time
// (IFL's own toast, used by IFL.hub.sent, is let go first, so the two never stack), read out through the one aria-live
// region the shared block keeps (.ifm-say). 3.6 s; with an action { label, run } 6 s or until it's tapped; the timer
// waits while the toast is hovered or has the focus. Any action offered here is reachable elsewhere on the screen too
// (WCAG 2.2.1). text always through textContent; app scopes the accent to the toast.
// toast(text, { action: { label, run }, app }) → void
let cur = null;
export function toast(text, { action = null, app = null } = {}) {
  const d = document;
  cur?.gone();
  for (const t of d.querySelectorAll(".ifl-toast")) t.remove();
  let say = d.querySelector(".ifm-say");
  if (!say) { say = d.createElement("p"); say.className = "ifm-say"; say.setAttribute("role", "status"); say.setAttribute("aria-live", "polite"); d.body.append(say); }
  const t = d.createElement("div"), tx = d.createElement("span"), b = d.createElement("b");
  t.className = "ifm-note ifl-toast" + (action ? " has-act" : "");
  if (app) t.dataset.app = app;
  tx.className = "ifm-note-tx"; b.textContent = String(text ?? ""); tx.append(b); t.append(tx);
  if (action) {
    const a = d.createElement("button");
    a.type = "button"; a.className = "ifl-toast-act"; a.textContent = action.label;
    a.addEventListener("click", () => { gone(); action.run?.(); });
    t.append(a);
  }
  d.body.append(t);
  let left = action ? 6000 : 3600, at = 0, timer = 0, held = 0;
  const run = () => { if (held) return; at = Date.now(); timer = setTimeout(gone, left); };
  const hold = () => { if (!held++) { clearTimeout(timer); left = Math.max(800, left - (Date.now() - at)); } };
  const free = () => { if (held && !--held) run(); };
  t.addEventListener("mouseenter", hold); t.addEventListener("mouseleave", free);
  t.addEventListener("focusin", hold); t.addEventListener("focusout", free);
  function gone() {
    clearTimeout(timer);
    if (cur?.t === t) cur = null;
    t.classList.remove("on");
    if (say.textContent === b.textContent) say.textContent = "";
    setTimeout(() => t.remove(), 400);
  }
  cur = { t, gone };
  say.textContent = "";
  requestAnimationFrame(() => requestAnimationFrame(() => { if (cur?.t !== t) return; t.classList.add("on"); say.textContent = b.textContent; }));
  run();
}
