// Deferred work belongs to a lifetime, just like requests and event listeners.
// Native imports cannot be cancelled; timers and idle callbacks can. Capture the
// account/frame signal when scheduling so a later callback never adopts a new one.
export function createTaskScope(signal) {
  const pending = new Set();
  let stopped = false;
  const active = () => !stopped && !signal?.aborted;
  function schedule(fn, start, stop) {
    if (!active()) return () => {};
    let id, done = false;
    const cancel = () => {
      if (done) return;
      done = true; pending.delete(cancel); stop(id);
    };
    pending.add(cancel);
    id = start(() => {
      if (done) return;
      done = true; pending.delete(cancel);
      if (active()) fn();
    });
    return cancel;
  }
  function dispose() {
    if (stopped) return;
    stopped = true;
    signal?.removeEventListener("abort", dispose);
    for (const cancel of [...pending]) cancel();
  }
  signal?.addEventListener("abort", dispose, { once: true });
  if (signal?.aborted) dispose();
  return {
    get active() { return active(); },
    timeout(fn, ms) { return schedule(fn, (run) => setTimeout(run, ms), clearTimeout); },
    idle(fn) {
      return typeof globalThis.requestIdleCallback === "function"
        ? schedule(fn, (run) => requestIdleCallback(run, { timeout: 3000 }), (id) => globalThis.cancelIdleCallback?.(id))
        : schedule(fn, (run) => setTimeout(run, 1200), clearTimeout);
    },
    dispose,
  };
}
