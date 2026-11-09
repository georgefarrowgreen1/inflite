// Bound the wait for an upstream's headers, for either a service binding or fetch.
// No retry: writes must never be repeated here. Stop the deadline after the headers
// arrive so downloads/ranges stay streamed; caller cancellation still reaches them.
export async function fetchUpstream(send, url, init = {}, { signal = init.signal, timeout = 15000 } = {}) {
  const deadline = new AbortController();
  const combined = signal ? AbortSignal.any([signal, deadline.signal]) : deadline.signal;
  combined.throwIfAborted();
  let onAbort;
  const stopped = new Promise((_, reject) => {
    onAbort = () => reject(combined.reason);
    combined.addEventListener("abort", onAbort, { once: true });
  });
  const timer = setTimeout(() => deadline.abort(new DOMException("The upstream took too long", "TimeoutError")), timeout);
  try {
    const sent = Promise.resolve().then(() => {
      combined.throwIfAborted();
      return send(url, { ...init, signal: combined });
    }).then((res) => {
      // Some service-binding adapters may settle after cancellation. Do not leave
      // their body running when this request has already given up.
      if (combined.aborted) {
        res.body?.cancel().catch(() => {});
        throw combined.reason;
      }
      return res;
    });
    return await Promise.race([sent, stopped]);
  } finally {
    clearTimeout(timer);
    combined.removeEventListener("abort", onAbort);
  }
}
