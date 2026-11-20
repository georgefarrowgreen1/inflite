// Mail's module: a conversation's row, and swiping it (One roof stage 4, spec §4.1, S4-D18, D19; app.js threadRowEl
// 3807, setupRowGestures 3977–4150). Every word from mail by textContent.
//   threadRow(t, ctx) → HTMLElement   div.ml-wrap holding the swipe's backing (aria-hidden) and the row itself,
//       div.ifl-row.ml-row[data-thread=<id>] (role=button, tabindex 0, its aria-label read as app.js says it); a draft
//       (t.draft) is [data-draft=<id>] instead
//   swipes(listEl, ctx, { done(id), later(id), menu(id) }) → off. A short swipe reveals one action; a deliberate full swipe
//       runs it. Leave the left screen edge to Back. The same actions are available by long press or the context menu.
export const EDGE = 20;
const REVEAL = 104, HOLD = 480;

export function threadRow(t, ctx) {
  const { fw, logic, icon } = ctx, ui = fw.ui, s = ctx.store.get();
  if (t.draft) {
    const who = (t.to || []).map(logic.displayName).filter(Boolean).join(", ") || "No Recipients";
    const row = ui.el("div", { class: "ifl-row ml-row draft", role: "button", tabindex: "0", data: { draft: t.id }, "aria-label": `Draft. ${t.subject || "No Subject"}` },
      ui.avatar((t.to || [])[0]?.name || (t.to || [])[0]?.email || "?"),
      ui.el("span", { class: "ml-tx" },
        ui.el("span", { class: "ml-top" }, ui.el("b", { class: "ml-from" }, ui.el("span", { class: "ml-tag", text: "Draft" }), who), ui.el("span", { class: "ml-date", text: logic.fmtListDate(t.date) })),
        ui.el("span", { class: "ml-subj", text: t.subject || "(No Subject)" }),
        ui.el("span", { class: "ml-snip", text: t.snippet || " " })));
    return ui.el("div", { class: "ml-wrap", data: { key: `d:${t.id}` } }, row);
  }
  const people = logic.peopleLine(t), lead = logic.leadAction(t);
  const when = t.snoozeUntil ? logic.fmtWhen(t.snoozeUntil) : logic.fmtListDate(t.date);
  const label = [t.unread && "Unread", t.starred && "Flagged", people, t.subject, t.hasAttachments && "Has attachments", t.snoozeUntil ? `Comes back ${when}` : when].filter(Boolean).join(". ");
  const from = t.from || t.people?.[0] || { name: "?" };
  const row = ui.el("div", {
    class: ["ifl-row ml-row", t.unread && "unread", t.starred && "starred", s.layout === "pad" && s.threadId === t.id && "selected"].filter(Boolean).join(" "),
    role: "button", tabindex: "0", data: { thread: t.id }, "aria-label": label,
  },
  ui.el("span", { class: "ml-dot", "aria-hidden": "true" }),
  ui.avatar(from.name || from.email || "?"),
  ui.el("span", { class: "ml-tx" },
    ui.el("span", { class: "ml-top" },
      ui.el("b", { class: "ml-from", text: people }),
      t.count > 1 ? ui.el("span", { class: "ml-n", text: String(t.count) }) : null,
      ui.el("span", { class: t.snoozeUntil ? "ml-date later" : "ml-date" }, t.snoozeUntil ? icon("later") : null, when)),
    ui.el("span", { class: "ml-subj" }, t.hasAttachments ? icon("attachment") : null, t.starred ? icon("flag") : null, ui.el("span", { text: t.subject || "(No Subject)" })),
    ui.el("span", { class: "ml-snip" }, t.latest?.folder === "sent" ? ui.el("span", { class: "ml-you", text: "You: " }) : null, t.latest?.snippet || t.snippet || " ")));
  const under = ui.el("div", { class: "ml-under" },
    ui.el("button", { type: "button", class: "ml-l", inert: true }, icon(lead.act === "done" ? "done" : "inbox"), lead.label),
    ui.el("button", { type: "button", class: "ml-r", inert: true }, t.trashed ? icon("flag") : icon("later"), t.trashed ? (t.starred ? "Unflag" : "Flag") : "Later"));
  return ui.el("div", { class: "ml-wrap", data: { key: `t:${t.id}` } }, under, row);
}

export function swipes(listEl, ctx, handlers = {}) {
  const doc = listEl.ownerDocument;
  let gesture = null, revealed = null;
  const offs = [];
  const on = (el, ev, fn) => { el.addEventListener(ev, fn); offs.push(() => el.removeEventListener(ev, fn)); };
  const direction = x => x > 0 ? "left" : x < 0 ? "right" : null;
  const set = (row, x, armed = false) => {
    const wrap = row.parentElement, side = direction(x);
    row.style.setProperty("--x", `${x}px`);
    if (side) wrap.dataset.swipe = side;
    else delete wrap.dataset.swipe;
    wrap.toggleAttribute("data-armed", armed);
  };
  const disableActions = wrap => { for (const btn of wrap.querySelectorAll(".ml-under button")) btn.inert = true; };
  function close(row = revealed?.row) {
    if (!revealed || revealed.row !== row) return false;
    const wrap = row.parentElement;
    if (wrap.contains(doc.activeElement) && doc.activeElement.closest(".ml-under")) row.focus({ preventScroll: true });
    disableActions(wrap);
    set(row, 0);
    revealed = null;
    return true;
  }
  function show(row, x) {
    const wrap = row.parentElement;
    set(row, x);
    wrap.querySelector(x > 0 ? ".ml-l" : ".ml-r").inert = false;
    revealed = { row, x };
  }
  function mark(row) {
    const token = String(performance.now());
    row.dataset.swiped = token;
    setTimeout(() => { if (row.dataset.swiped === token) delete row.dataset.swiped; }, 350);
  }
  const run = (row, x) => x > 0 ? handlers.done?.(row.dataset.thread) : handlers.later?.(row.dataset.thread);
  const openMenu = row => { close(); handlers.menu?.(row.dataset.thread); };

  on(doc, "pointerdown", e => {
    if (revealed && !revealed.row.parentElement.contains(e.target)) close();
  });
  on(listEl, "pointerdown", e => {
    const row = e.target.closest?.(".ml-row[data-thread]");
    if (!row || e.isPrimary === false || e.button > 0 || e.clientX <= EDGE || gesture || ctx.canRead?.() === false) return;
    if (revealed?.row !== row) close();
    delete row.dataset.swiped;
    const start = revealed?.x || 0;
    const drag = { row, id: e.pointerId, x0: e.clientX, y0: e.clientY, start, x: start, width: 0, frame: 0, timer: 0 };
    gesture = drag;
    if (e.pointerType === "touch") drag.timer = setTimeout(() => {
      if (gesture !== drag) return;
      gesture = null;
      mark(row);
      openMenu(row);
    }, HOLD);
  });
  on(listEl, "pointermove", e => {
    const drag = gesture;
    if (!drag || e.pointerId !== drag.id) return;
    const { row } = drag, wrap = row.parentElement, dx = e.clientX - drag.x0, dy = e.clientY - drag.y0;
    if (Math.hypot(dx, dy) > 8) clearTimeout(drag.timer);
    if (!drag.width) {
      if (Math.abs(dx) <= 10 || Math.abs(dx) <= Math.abs(dy) * 1.25) {
        if (Math.abs(dy) > 10) { gesture = null; close(); }
        return;
      }
      drag.width = wrap.clientWidth;
      if (!drag.width) return;
      wrap.classList.add("swiping");
      disableActions(wrap);
      revealed = null;
      try { row.setPointerCapture(e.pointerId); } catch {}
    }
    const limit = Math.max(REVEAL, drag.width * 0.72);
    drag.x = Math.max(-limit, Math.min(limit, drag.start + dx));
    drag.armed = Math.abs(drag.x) > Math.max(REVEAL + 28, drag.width * 0.55);
    drag.frame ||= requestAnimationFrame(() => {
      drag.frame = 0;
      set(row, drag.x, drag.armed);
    });
  });
  function finish(e, cancelled = false) {
    const drag = gesture;
    if (!drag || e && e.pointerId !== drag.id) return;
    gesture = null;
    clearTimeout(drag.timer);
    cancelAnimationFrame(drag.frame);
    if (!drag.width) return;
    const { row, x } = drag;
    mark(row);
    row.parentElement.classList.remove("swiping");
    if (row.hasPointerCapture(drag.id)) row.releasePointerCapture(drag.id);
    if (!cancelled && !drag.armed && Math.abs(x) >= REVEAL / 2) return show(row, Math.sign(x) * REVEAL);
    set(row, 0);
    if (!cancelled && drag.armed) run(row, x);
  }
  on(doc, "pointerup", e => finish(e));
  on(doc, "pointercancel", e => finish(e, true));
  on(listEl, "lostpointercapture", e => finish(e, true));
  on(listEl, "click", e => {
    const btn = e.target.closest?.(".ml-under button");
    if (!revealed || !btn || btn.inert || !revealed.row.parentElement.contains(btn)) return;
    const { row, x } = revealed;
    close(row);
    run(row, x);
  });
  on(listEl, "contextmenu", e => {
    const row = e.target.closest?.(".ml-row[data-thread]");
    if (!row) return;
    e.preventDefault();
    if (row.dataset.swiped && !gesture) return;
    finish(null, true);
    openMenu(row);
  });
  on(listEl, "keydown", e => {
    if (e.key === "Escape" && close()) e.preventDefault();
    const row = e.target.closest?.(".ml-row[data-thread]");
    if (row && (e.key === "ContextMenu" || (e.key === "F10" && e.shiftKey))) { e.preventDefault(); openMenu(row); }
  });
  const reset = () => { finish(null, true); close(); };
  const off = () => { reset(); for (const f of offs.splice(0)) f(); };
  off.close = close;
  off.reset = reset;
  off.active = () => !!gesture?.width;
  return off;
}
