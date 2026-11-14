// Recovery is a system sheet, not a replacement screen or a new app instance.
export function createWorkspaceRecoveryView(F, recovery) {
  const { ui } = F, owner = F.session.view?.user?.id;
  let sheet = null, off = () => {}, dead = false;
  const live = () => !dead && !F.signal.aborted && F.session.view?.user?.id === owner;
  function close() { off(); off = () => {}; sheet?.now(); sheet = null; }
  function open() {
    if (!live()) return false;
    if (sheet && !sheet.closed) return true;
    const summary = ui.el("p", { class: "ws-recovery-summary", role: "status" });
    const list = ui.el("ul", { class: "ws-recovery-list", "aria-label": "App recovery" });
    const status = ui.el("p", { class: "ws-recovery-message", role: "status" });
    const records = new Map();
    const body = ui.el("div", { class: "ws-recovery" }, summary, ui.el("p", { class: "ws-recovery-help", text: "Resume an app without closing its current view. Open apps and drafts stay in place." }), list, status);
    const mine = sheet = F.sheet.open({ sheet: "workspace-recovery", title: "Connection & recovery", body, onClose() { if (sheet === mine) { off(); off = () => {}; sheet = null; } } });
    const render = value => {
      if (!live() || sheet !== mine || mine.closed) return;
      summary.textContent = value.online ? "Network available" : "You’re offline";
      const keep = new Set();
      for (const app of value.apps) {
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
          const element = ui.el("li", {}, ui.el("div", {}, title, detail), button); row = { element, title, detail, button }; records.set(app.app, row); list.append(element);
        }
        row.detail.textContent = !value.online ? app.loaded ? "Offline · current view kept" : "Offline · open when connected" : app.pending ? "Resuming…" : ({ idle: "Not opened yet", loading: "Opening…", ready: "Ready · current view kept", error: "Couldn’t open", offline: "Connection unavailable · current view kept", signin: "Sign in in the app", locked: "Unlock in the app" })[app.phase];
        row.button.textContent = ["error", "offline"].includes(app.phase) ? "Try again" : "Resume";
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
