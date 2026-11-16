// Coarse, bounded timings only: known app, device class and numbers. Never a
// route, account, file, message, search or draft. Uses the existing vitals sink.
const APPS = new Set(["today", "weather", "fitness", "markets", "chats", "mail", "files"]);
export function createShellPerformance() {
  const doc = globalThis.document, nav = globalThis.navigator, clock = globalThis.performance;
  const pending = new Map();
  let episode = 0, sent = 0, started = false, stopped = false;
  const visible = () => doc?.visibilityState !== "hidden";
  const initial = visible();
  const perApp = new Map();
  function sample(app, metric, value) {
    if (!APPS.has(app) || !Number.isFinite(value) || value < 0 || value > 60000) return;
    const m = pending.get(app) || {};
    m[metric] = Math.max(m[metric] || 0, Math.round(value)); pending.set(app, m);
  }
  function begin(app, { cold = false, startup = false, signal } = {}) {
    const at = startup ? 0 : clock?.now?.(), mine = episode;
    let done = false;
    return (result = "ready") => {
      if (done) return; done = true;
      if (stopped || result === "cancelled" || signal?.aborted || !initial || !visible() || mine !== episode || !APPS.has(app)) return;
      sample(app, "open_fail", result === "ready" ? 0 : 1);
      if (result === "ready") sample(app, startup ? "startup" : cold ? "cold" : "warm", clock?.now?.() - at);
    };
  }
  function flush() {
    const coarse = (() => { try { return matchMedia("(pointer: coarse)").matches; } catch (_) { return false; } })();
    for (const [app, m] of pending) {
      if (sent >= 12 || (perApp.get(app) || 0) >= 2 || typeof nav?.sendBeacon !== "function") continue;
      try {
        const accepted = nav.sendBeacon("/api/vitals", new Blob([JSON.stringify({ app, dev: coarse ? "phone" : "computer", m })], { type: "text/plain" }));
        if (accepted) { ++sent; perApp.set(app, (perApp.get(app) || 0) + 1); }
      } catch (_) {}
    }
    pending.clear();
  }
  const hidden = () => { if (!visible()) { ++episode; flush(); } };
  doc?.addEventListener("visibilitychange", hidden);
  globalThis.addEventListener?.("pagehide", flush);
  return {
    begin,
    startup(signal) {
      if (started) return; started = true;
      const finish = begin("today", { startup: true, signal });
      requestAnimationFrame(() => requestAnimationFrame(() => finish()));
    },
    dispose() { stopped = true; pending.clear(); ++episode; doc?.removeEventListener("visibilitychange", hidden); globalThis.removeEventListener?.("pagehide", flush); },
  };
}
