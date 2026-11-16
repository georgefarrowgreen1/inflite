// Account-owned, non-modal status. Network availability never claims that a
// write synced; the producer's snapshot remains authoritative.
import { recoveryDetail } from "./workspace-recovery.js";
export function createConnectionView(F, { root, recovery, open } = {}) {
  const words = F.ui.el("span"), button = F.ui.btn("Review", { small: true, run: () => open?.() });
  const el = F.ui.el("aside", { class: "ifl-workspace ws-connection", "aria-label": "Connection status", hidden: true }, F.ui.el("p", { role: "status", "aria-live": "polite" }, words), button);
  root?.before(el);
  let last = "";
  function update() {
    if (F.signal.aborted) return;
    const snapshot = recovery.snapshot(), route = F.route, current = snapshot.apps.find(app => app.app === route?.app);
    let text = "";
    if (route?.tool === "files" && !snapshot.online) text = "You’re offline. Folder names stay visible; cloud files and uploads need a connection.";
    else if (!snapshot.online) text = current ? "You’re offline · " + recoveryDetail(current, false) : "You’re offline. Some views need a connection.";
    else if (current?.unsynced || current?.syncError || current?.phase === "offline") text = recoveryDetail(current, true);
    if (text !== last) { words.textContent = last = text; el.hidden = !text; }
  }
  const off = recovery.subscribe(update), routeOff = F.on("route", update);
  function destroy() { off(); routeOff(); el.remove(); F.signal.removeEventListener("abort", destroy); }
  F.signal.addEventListener("abort", destroy, { once: true }); update();
  return { update, destroy };
}
