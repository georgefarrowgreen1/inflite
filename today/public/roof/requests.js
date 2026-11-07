// Page-lifetime JSON requests. Only unfinished reads are shared: no response cache,
// persistence, automatic retries or write coalescing. Reset at account boundaries.
const cancelled = (reason = "cancelled") => Object.assign(new Error(""), { name: "AbortError", status: 0, cancelled: true, reason });
const timeoutError = (write) => Object.assign(new Error(write
  ? "Couldn’t confirm the change in time. Refresh to check before trying again."
  : "InFlite took too long to respond. Try again."), { name: "TimeoutError", status: 0, timeout: true, offline: true });
export const isRequestCancelled = (error) => error?.cancelled === true;

export function createRequestCoordinator({ fetch: fetcher = (...args) => globalThis.fetch(...args), origin = globalThis.location?.origin,
  timeoutMs: defaultTimeout = 20000 } = {}) {
  const reads = new Map(), latest = new Map(), active = new Set();
  let generation = 0, scope = new AbortController();
  const copy = (value) => typeof structuredClone === "function" ? structuredClone(value) : JSON.parse(JSON.stringify(value));
  const dropRead = (entry) => { if (reads.get(entry.key) === entry) reads.delete(entry.key); };
  const release = (entry) => {
    if (entry.settled && !entry.waiters.size && latest.get(entry.group) === entry) latest.delete(entry.group);
  };
  const obsolete = (entry) => entry.generation !== generation || (entry.read && latest.get(entry.group) !== entry);

  function start(path, options, key, group, read) {
    const controller = new AbortController();
    const entry = { controller, key, group, read, generation, waiters: new Set(), settled: false };
    active.add(entry);
    if (read) {
      const old = latest.get(group);
      latest.set(group, entry); reads.set(key, entry);
      if (old && !old.settled) { dropRead(old); old.controller.abort(cancelled("superseded")); }
    } else {
      // A read requested after a write starts or settles must not join a pre-write
      // transport. Existing reads can finish unless a newer read supersedes them.
      reads.clear();
    }
    let onAbort;
    const aborted = new Promise((_, reject) => {
      onAbort = () => reject(controller.signal.reason || cancelled());
      controller.signal.addEventListener("abort", onAbort, { once: true });
    });
    const timer = setTimeout(() => controller.abort(timeoutError(!read)), options.timeoutMs);
    const work = Promise.resolve().then(async () => {
      if (controller.signal.aborted) throw controller.signal.reason;
      const response = await fetcher(path, { method: options.method, headers: options.headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body), credentials: "same-origin", cache: "no-store", signal: controller.signal });
      let data = null;
      try { data = await response.json(); } catch {} // Preserve empty/204 response behaviour.
      if (controller.signal.aborted) throw controller.signal.reason;
      if (!response.ok) throw Object.assign(new Error(data?.error || "Something went wrong. Try again."), { status: response.status, field: data?.field });
      return data;
    });
    entry.promise = Promise.race([work, aborted]).catch((error) => {
      if (controller.signal.aborted) throw controller.signal.reason;
      if (error?.status !== undefined) throw error;
      throw Object.assign(new Error("Couldn’t reach InFlite just now. Try again in a moment."), { status: 0, offline: true });
    }).finally(() => {
      clearTimeout(timer); controller.signal.removeEventListener("abort", onAbort);
      entry.settled = true; active.delete(entry); dropRead(entry);
      if (!read && entry.generation === generation) reads.clear();
      release(entry);
    });
    return entry;
  }

  function subscribe(entry, signal) {
    return new Promise((resolve, reject) => {
      let done = false;
      const waiter = {};
      const finish = (fn, value) => {
        if (done) return;
        done = true; signal?.removeEventListener("abort", abort);
        entry.waiters.delete(waiter); release(entry); fn(value);
      };
      const abort = () => {
        finish(reject, cancelled());
        if (!entry.settled && !entry.waiters.size) { dropRead(entry); entry.controller.abort(cancelled()); }
      };
      entry.waiters.add(waiter);
      signal?.addEventListener("abort", abort, { once: true });
      if (signal?.aborted) abort();
      entry.promise.then((data) => {
        if (done) return;
        if (obsolete(entry)) return finish(reject, cancelled("superseded"));
        try { finish(resolve, copy(data)); } catch (error) { finish(reject, error); }
      }, (error) => finish(reject, obsolete(entry) ? cancelled("superseded") : error));
    });
  }

  function request(path, { method = "GET", body, headers: extraHeaders, signal, timeoutMs = defaultTimeout, fresh = false, latestKey } = {}) {
    if (signal?.aborted) return Promise.reject(cancelled());
    try {
      const url = new URL(path, origin);
      if (url.origin !== origin || !url.pathname.startsWith("/api/") || url.hash) throw new TypeError("Expected a same-origin API path");
      if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new TypeError("Expected a positive request timeout");
      method = method.toUpperCase();
      const read = method === "GET";
      const headers = new Headers(extraHeaders);
      if (!headers.has("Accept")) headers.set("Accept", "application/json");
      if (!read) headers.set("X-Inflite", "1");
      if (body !== undefined) headers.set("Content-Type", "application/json");
      const target = url.pathname + url.search;
      const identity = JSON.stringify([target, [...headers].sort(), timeoutMs]);
      const group = latestKey == null ? identity : JSON.stringify([String(latestKey), [...headers].sort()]);
      const key = JSON.stringify([identity, group]);
      let entry = read && !fresh ? reads.get(key) : null;
      if (!entry || entry.controller.signal.aborted) entry = start(target, { method, body, headers, timeoutMs }, key, group, read);
      return subscribe(entry, signal);
    } catch (error) { return Promise.reject(error); }
  }

  return {
    request,
    get generation() { return generation; },
    get signal() { return scope.signal; },
    reset() {
      generation++;
      const previous = scope; scope = new AbortController(); reads.clear(); latest.clear();
      previous.abort(cancelled("account changed"));
      for (const entry of active) if (entry.generation !== generation) entry.controller.abort(cancelled("account changed"));
    },
  };
}
