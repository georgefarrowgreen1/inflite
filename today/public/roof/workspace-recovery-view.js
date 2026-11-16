import { loadStyles } from "./modules.js";
import { recoveryDetail } from "./workspace-recovery.js";
const ICONS = { fitness: "fitness", weather: "weather", markets: "markets", chats: "chat", mail: "mail" };
// Recovery is a system sheet, not a replacement screen or a new app instance.
export function createWorkspaceRecoveryView(F, recovery) {
  const { ui } = F, owner = F.session.view?.user?.id;
  let sheet = null, off = () => {}, dead = false, styles = null, epoch = 0;
  const live = () => !dead && !F.signal.aborted && F.session.view?.user?.id === owner;
  const styled = () => styles ||= loadStyles("/roof/workspace-recovery.css").catch(error => { styles = null; throw error; });
  // Prime public presentation assets without blocking the OS or opening a sheet.
  styled().catch(() => {});
  function close() { epoch++; off(); off = () => {}; sheet?.now(); sheet = null; }
  async function open() {
    if (!live()) return false;
    if (sheet && !sheet.closed) return true;
    const at = ++epoch, route = F.route;
    const current = () => live() && epoch === at && F.route === route;
    try { await styled(); }
    catch { if (current()) F.toast?.("Recovery couldn’t load. Try again."); return false; }
    if (!current()) return false;
    const summary = ui.el("p", { class: "ws-recovery-summary", role: "status" });
    const list = ui.el("ul", { class: "ws-recovery-list", "aria-label": "App recovery" });
    const records = new Map();
    const body = ui.el("div", { class: "ws-recovery" }, summary, ui.el("p", { class: "ws-recovery-help", text: "Available content and unsynced changes are reported by each app. Cloud files and sending need a connection." }), list);
    const mine = sheet = F.sheet.open({ sheet: "workspace-recovery", title: "Connection & recovery", body, onClose() { if (sheet === mine) { off(); off = () => {}; sheet = null; } } });
    const render = value => {
      if (!live() || sheet !== mine || mine.closed) return;
      summary.textContent = value.online ? "Network available" : "You’re offline";
      const keep = new Set();
      for (const app of value.apps) {
        if (!Object.hasOwn(ICONS, app.app)) continue;
        keep.add(app.app); let row = records.get(app.app);
        if (!row) {
          const title = ui.el("b", { text: app.name }), detail = ui.el("span", { class: "ws-recovery-detail" });
          const button = ui.btn("Resume", { run: async () => {
            if (!live() || sheet !== mine || mine.closed || !recovery.snapshot().apps.find(item => item.app === app.app)?.retryable) return;
            // The user's resume action hands control back to the native app.
            // Navigation closes sheets; it must not revoke its own handoff.
            close();
            const result = await recovery.recover(app.app, { current: live });
            if (live() && result?.error) F.toast?.(result.error);
          } });
          const element = ui.el("li", {}, ui.el("img", { src: `/apps/${ICONS[app.app]}.svg`, alt: "", width: 36, height: 36 }), ui.el("div", {}, title, detail), button); row = { element, detail, button }; records.set(app.app, row); list.append(element);
        }
        row.detail.textContent = recoveryDetail(app, value.online);
        row.button.textContent = ["error", "offline"].includes(app.phase) ? "Try again" : app.loaded ? "Resume" : "Open";
        row.button.disabled = !app.retryable;
        row.button.setAttribute("aria-label", `${row.button.textContent} ${app.name}`);
        row.element.dataset.state = app.phase;
      }
      for (const [app, row] of records) if (!keep.has(app)) { row.element.remove(); records.delete(app); }
    };
    render(recovery.snapshot()); off = recovery.subscribe(render); return true;
  }
  function destroy() { if (dead) return; dead = true; close(); F.signal.removeEventListener("abort", destroy); }
  F.signal.addEventListener("abort", destroy, { once: true });
  return { open, close, destroy };
}
