// Bound bytes while reading, including chunked requests and a misstated Content-Length.
// null means too large; never collect the rest of an oversized stream. raw preserves
// binary uploads; the default remains text for Today's JSON endpoints.
export async function bodyUpTo(request, max, { raw = false, signal = request.signal } = {}) {
  signal?.throwIfAborted();
  const length = request.headers.get("Content-Length");
  if (length !== null && !(/^\d+$/.test(length) && Number(length) <= max)) {
    request.body?.cancel().catch(() => {});
    return null;
  }
  if (!request.body) return raw ? new Uint8Array(0) : "";
  const reader = request.body.getReader(), parts = [];
  const aborted = () => { reader.cancel(signal.reason).catch(() => {}); };
  signal?.addEventListener("abort", aborted, { once: true });
  let size = 0;
  try {
    for (;;) {
      signal?.throwIfAborted();
      const { done, value } = await reader.read();
      signal?.throwIfAborted();
      if (done) break;
      if ((size += value.byteLength) > max) {
        reader.cancel().catch(() => {});
        return null;
      }
      parts.push(value);
    }
  } finally {
    signal?.removeEventListener("abort", aborted);
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) { bytes.set(part, offset); offset += part.byteLength; }
  return raw ? bytes : new TextDecoder().decode(bytes);
}
