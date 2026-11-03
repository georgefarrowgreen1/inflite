// Mail's module: a conversation's row, and swiping it (One roof stage 4, spec §4.1, S4-D18, D19; app.js threadRowEl
// 3807, setupRowGestures 3977–4150). Every word from mail by textContent.
//   threadRow(t, ctx) → HTMLElement   div.ml-wrap holding the swipe's backing (aria-hidden) and the row itself,
//       div.ifl-row.ml-row[data-thread=<id>] (role=button, tabindex 0, its aria-label read as app.js says it); a draft
//       (t.draft) is [data-draft=<id>] instead
//   swipes(listEl, ctx, { done(id), later(id), menu(id) }) → off   one set of pointer listeners on the list: right past
//       the mark = done, left = later, never a pointer that starts within EDGE px of the window's left edge (the
//       framework's edge Back, D19); press and hold (touch) or the context menu = menu. off.active() → a row is under the
//       finger (busy(), S4-D13). A tap that ends a swipe opens nothing (the row gets data-swiped for a moment).
export const EDGE = 20;
const MARK = 0.33, HOLD = 480;

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
    class: ["ifl-row ml-row", t.unread && "unread", t.starred && "starred", s.layout === "pad" && s.threadId === t.id && "selected", s.lens === "updates" && !s.query && "digest"].filter(Boolean).join(" "),
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
  const under = ui.el("div", { class: "ml-under", "aria-hidden": "true" },
    ui.el("span", { class: "ml-l" }, icon(lead.act === "done" ? "done" : "inbox"), lead.label),
    ui.el("span", { class: "ml-r" }, t.trashed ? icon("flag") : icon("later"), t.trashed ? (t.starred ? "Unflag" : "Flag") : "Later"));
  return ui.el("div", { class: "ml-wrap", data: { key: `t:${t.id}` } }, under, row);
}

export function swipes(listEl, ctx, handlers = {}) {
  let g = null, hold = null;
  const offs = [];
  const on = (ev, fn, o) => { listEl.addEventListener(ev, fn, o); offs.push(() => listEl.removeEventListener(ev, fn, o)); };
  const set = (wrap, x, cls) => {
    wrap.style.setProperty("--x", `${x}px`);
    wrap.classList.toggle("go-l", cls === "l");
    wrap.classList.toggle("go-r", cls === "r");
  };
  const mark = (row) => { row.dataset.swiped = "1"; setTimeout(() => delete row.dataset.swiped, 400); };
  on("pointerdown", (e) => {
    const row = e.target.closest?.(".ml-row[data-thread]");
    if (!row || e.button > 0) return;
    clearTimeout(hold?.timer);
    if (e.pointerType === "touch") hold = { x0: e.clientX, y0: e.clientY, timer: setTimeout(() => { hold = null; if (g?.dir) return; mark(row); g = null; handlers.menu?.(row.dataset.thread); }, HOLD) };
    // (from the left edge: the framework's Back, never a swipe)
    if (e.clientX <= EDGE) return;
    g = { row, wrap: row.parentElement, id: e.pointerId, x0: e.clientX, y0: e.clientY, x: 0, dir: null, w: 0 };
  });
  on("pointermove", (e) => {
    if (hold && Math.hypot(e.clientX - hold.x0, e.clientY - hold.y0) > 8) { clearTimeout(hold.timer); hold = null; }
    if (!g || e.pointerId !== g.id) return;
    const dx = e.clientX - g.x0, dy = e.clientY - g.y0;
    if (!g.dir) {
      if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy) * 1.2) {
        g.dir = "h"; g.w = g.wrap.offsetWidth || 360;
        g.wrap.classList.add("swiping");
        try { g.row.setPointerCapture(e.pointerId); } catch {}
      } else if (Math.abs(dy) > 10) { g = null; return; } else return;
    }
    g.x = Math.max(-g.w, Math.min(g.w, dx));
    set(g.wrap, g.x, g.x > g.w * MARK ? "r" : g.x < -g.w * MARK ? "l" : null);
  });
  const finish = (e) => {
    clearTimeout(hold?.timer); hold = null;
    if (!g || (e && e.pointerId !== g.id)) return;
    const st = g;
    g = null;
    if (st.dir !== "h") return;
    mark(st.row);
    st.wrap.classList.remove("swiping");
    const id = st.row.dataset.thread;
    set(st.wrap, 0, null);
    if (st.x > st.w * MARK) handlers.done?.(id);
    else if (st.x < -st.w * MARK) handlers.later?.(id);
  };
  on("pointerup", finish);
  on("pointercancel", finish);
  on("contextmenu", (e) => {
    const row = e.target.closest?.(".ml-row[data-thread]");
    if (!row) return;
    e.preventDefault();
    handlers.menu?.(row.dataset.thread);
  });
  on("keydown", (e) => {
    const row = e.target.closest?.(".ml-row[data-thread]");
    if (row && (e.key === "ContextMenu" || (e.key === "F10" && e.shiftKey))) { e.preventDefault(); handlers.menu?.(row.dataset.thread); }
  });
  const off = () => { clearTimeout(hold?.timer); for (const f of offs.splice(0)) f(); };
  off.active = () => !!g?.dir;
  return off;
}
