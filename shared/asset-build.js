// The public entry points declare their release near the beginning of the file.
// Keep only a resolved build in the isolate. A failed lookup is retried on the next request.
export function assetBuild(path) {
  let last;
  return async (env, request) => {
    const key = env.BUILD_ID || env.CF_VERSION_METADATA?.id || env.ASSETS;
    if (last && last.key === key) return last.build;
    const url = new URL(path, request.url);
    try {
      let response = await env.ASSETS.fetch(new Request(url, { headers: { Range: 'bytes=0-16383' } }));
      let build = await readBuild(response);
      // Older or future entry points can declare the build beyond the prefix.
      if (!build && (response.status === 206 || response.status === 416)) {
        response = await env.ASSETS.fetch(new Request(url));
        build = await readBuild(response);
      }
      if (build) last = { key, build };
      return build;
    } catch {
      return null;
    }
  };
}

async function readBuild(response) {
  if (!response.ok || !response.body) {
    response.body?.cancel().catch(() => {});
    return null;
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let tail = '';
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return null;
      const text = tail + decoder.decode(value, { stream: true });
      const match = /\bconst BUILD\s*=\s*"(\d{1,8}\.\d{1,8}(?:\.\d{1,8})?)"/.exec(text);
      if (match) {
        reader.cancel().catch(() => {});
        return match[1];
      }
      tail = text.slice(-128);
    }
  } finally {
    reader.releaseLock();
  }
}
