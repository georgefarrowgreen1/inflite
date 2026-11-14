import { loadStyles } from "./modules.js";
export { createActivityRegistry } from "./workspace-activity-state.js";

const LABELS = Object.freeze({ queued: "Waiting to start", running: "In progress", waiting: "Needs attention", succeeded: "Completed", failed: "Couldn’t finish", cancelled: "Cancelled", "handed-off": "Opened download" });
const ACTIVE = new Set(["queued", "running"]), FINISHED = new Set(["succeeded", "failed", "cancelled", "handed-off"]);
const GLYPHS = Object.freeze({ succeeded: "check", failed: "warn", waiting: "warn", cancelled: "x", "handed-off": "download" });

export function createWorkspaceActivity(F, { registry } = {}) {
  if (!registry?.snapshot || !registry?.invoke) throw new TypeError("Activity requires its account registry.");
  const ui = F.ui, rows = new Map();
  let dead = false, handle = null, list, summary, clear, error;
  const live = () => !dead && !F.signal?.aborted && registry.live();
  const cleanSheet = () => { handle = null; list = summary = clear = error = null; rows.clear(); };
  function close() { const previous = handle; cleanSheet(); previous?.now?.(); }
  async function act(row, id) {
    if (!live() || !handle || !row.item) return;
    const mine = handle, item = row.item;
    error.hidden = true; error.textContent = "";
    const answer = await registry.invoke(item.key, id, item.revision);
    if (!live() || handle !== mine) return;
    if (answer?.ok === false && !answer.cancelled) { error.textContent = answer.error || "That action couldn’t finish."; error.hidden = false; }
  }
  function draw() {
    if (!live()) return destroy();
    if (!handle || !list) return;
    const focused = document.activeElement;
    const entries = registry.snapshot(), active = entries.filter(item => ACTIVE.has(item.status)).length;
    const attention = entries.filter(item => item.status === "failed" || item.status === "waiting").length;
    summary.textContent = entries.length ? [active ? `${active} in progress` : "Recent activity", attention ? `${attention} ${attention === 1 ? "needs" : "need"} attention` : null].filter(Boolean).join(" · ") : "Uploads, downloads and workspace tasks appear here.";
    clear.hidden = !entries.some(item => FINISHED.has(item.status) && !item.pending);
    const keep = new Set();
    let position = list.firstElementChild;
    for (const item of entries) {
      keep.add(item.key); let row = rows.get(item.key);
      if (!row) {
        const title = ui.el("h3"), detail = ui.el("p", { class: "wsa-detail" }), status = ui.el("span", { class: "wsa-state" });
        const progress = ui.el("progress", { max: 1, class: "wsa-progress" });
        const actions = ui.el("div", { class: "wsa-actions" });
        const symbol = ui.el("span", { class: "wsa-symbol", "aria-hidden": "true" }, ui.icon("clock"));
        const node = ui.el("article", { class: "wsa-task", role: "listitem" }, symbol, ui.el("div", { class: "wsa-copy" }, title, detail, status, progress, actions));
        row = { node, title, detail, status, progress, actions, symbol, glyph: "clock", buttons: new Map(), item: null }; rows.set(item.key, row);
      }
      row.item = item; row.node.dataset.status = item.status; row.node.dataset.activity = item.key;
      const glyph = GLYPHS[item.status] || "clock";
      if (row.glyph !== glyph) { row.symbol.replaceChildren(ui.icon(glyph)); row.glyph = glyph; }
      row.title.textContent = item.title; row.detail.textContent = item.detail; row.detail.hidden = !item.detail;
      row.status.textContent = LABELS[item.status] || "Task";
      row.progress.hidden = !ACTIVE.has(item.status); row.progress.setAttribute("aria-label", `${item.title} progress`);
      if (item.progress == null) row.progress.removeAttribute("value"); else row.progress.value = item.progress;
      const actionIds = new Set();
      for (const action of item.actions) {
        actionIds.add(action.id); let button = row.buttons.get(action.id);
        if (!button) { button = ui.el("button", { type: "button", class: "ifl-btn wsa-action", on: { click: () => act(row, action.id) } }); row.buttons.set(action.id, button); row.actions.append(button); }
        button.textContent = action.label; button.setAttribute("aria-label", `${action.label}: ${item.title}`); button.setAttribute("aria-disabled", String(!action.enabled));
      }
      for (const [id, button] of row.buttons) if (!actionIds.has(id)) { button.remove(); row.buttons.delete(id); }
      if (row.node !== position) list.insertBefore(row.node, position); position = row.node.nextElementSibling;
    }
    for (const [key, row] of rows) if (!keep.has(key)) { row.node.remove(); rows.delete(key); }
    list.hidden = !entries.length;
    if (focused === clear && clear.hidden) summary.focus({ preventScroll: true });
    else if (focused?.isConnected && document.activeElement === document.body) focused.focus?.({ preventScroll: true });
  }
  function open() {
    if (!live()) return;
    close(); loadStyles("/roof/workspace-activity.css").catch(() => {});
    summary = ui.el("p", { class: "wsa-summary", role: "status", "aria-live": "polite", tabindex: -1 });
    error = ui.el("p", { class: "wsa-error", role: "status", hidden: true });
    clear = ui.btn("Clear completed", { small: true, run: () => { if (live()) registry.clearCompleted(); } });
    clear.classList.add("wsa-clear");
    list = ui.el("div", { class: "wsa-list", role: "list", "aria-label": "Background activity" });
    const body = ui.el("div", { class: "wsa" }, ui.el("div", { class: "wsa-top" }, summary, clear), error, list);
    handle = F.sheet.open({ sheet: "workspace-activity", title: "Activity", body, onClose: cleanSheet }); draw(); return handle;
  }
  const off = registry.subscribe(draw);
  function destroy() { if (dead) return; dead = true; off(); close(); F.signal?.removeEventListener("abort", destroy); registry.signal?.removeEventListener("abort", destroy); }
  F.signal?.addEventListener("abort", destroy, { once: true }); registry.signal?.addEventListener("abort", destroy, { once: true });
  if (F.signal?.aborted || registry.signal?.aborted) destroy();
  return Object.freeze({ open, close, destroy, count: () => live() ? registry.snapshot().filter(item => ACTIVE.has(item.status)).length : 0 });
}
