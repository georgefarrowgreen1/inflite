// Speculation fetches public code only. It never mounts an app or starts its data
// service. One app at a time, with a small idle budget and account-owned cleanup.
export function createPreloader({ signal, eligible, load, idle, network = () => navigator.connection, visible = () => document.visibilityState !== "hidden", online = () => navigator.onLine !== false } = {}) {
  const done = new Set(), queue = new Map();
  let running = false, activeApp = null, cancel = null, stopped = false, idleCount = 0;
  const live = () => !stopped && !signal?.aborted;
  const allowed = () => {
    const n = network();
    return live() && visible() && online() && !n?.saveData && !/^(slow-2g|2g|3g)$/.test(n?.effectiveType || "") && !(Number(n?.downlink) > 0 && n.downlink < 1.5);
  };
  function schedule() {
    if (!allowed() || running || cancel || !queue.size) return;
    cancel = idle(() => { cancel = null; run(); });
  }
  async function run() {
    if (!allowed() || running) return;
    const entry = [...queue].find(([, intent]) => intent || idleCount < 2);
    if (!entry) return;
    const [app, intent] = entry;
    queue.delete(app);
    if (!eligible(app)) return schedule();
    running = true;
    activeApp = app;
    if (!intent) ++idleCount;
    try {
      const value = await load(app, { signal, current: () => allowed() && eligible(app) });
      if (live() && value !== false && value !== null) done.add(app);
    } catch (_) { /* navigation owns real loading and its recovery */ }
    finally { running = false; activeApp = null; schedule(); }
  }
  function request(app, { intent = false } = {}) {
    if (!live() || done.has(app) || activeApp === app || !eligible(app)) return;
    if (intent) { queue.delete(app); queue.set(app, true); }
    else if (!queue.has(app)) queue.set(app, false);
    // Intent goes first but remains idle work, so a tap keeps priority.
    if (intent) { const entries = [...queue]; queue.clear(); queue.set(app, true); for (const [key, value] of entries) if (key !== app) queue.set(key, value); }
    schedule();
  }
  function dispose() { stopped = true; cancel?.(); cancel = null; queue.clear(); done.clear(); signal?.removeEventListener("abort", dispose); }
  signal?.addEventListener("abort", dispose, { once: true });
  return { request, wake: schedule, dispose };
}
