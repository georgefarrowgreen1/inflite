// Bound bytes while reading, including chunked requests without Content-Length.
// null means too large; never collect the rest of an oversized stream.
export async function bodyUpTo(request, max) {
  const length = request.headers.get("Content-Length");
  if (length !== null && !(Number(length) >= 0 && Number(length) <= max)) return null;
  if (!request.body) return "";
  const reader = request.body.getReader(), parts = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if ((size += value.byteLength) > max) {
        reader.cancel().catch(() => {});
        return null;
      }
      parts.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) { bytes.set(part, offset); offset += part.byteLength; }
  return new TextDecoder().decode(bytes);
}
