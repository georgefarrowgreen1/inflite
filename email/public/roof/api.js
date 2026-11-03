// Mail's module: Mail's API, called straight from the page (One roof stage 4, spec S4-D2, §4.7; app.js realApi
// 1144–1245). Credentialed CORS to Mail's own address: reads carry no custom header (simple requests, no preflight),
// writes carry X-Inflite: 1 and go to a few fixed URLs. Never asked for here: a message's body (/api/messages/<id>),
// logout, push, the old send with its payload, New or Delete Address. A query never goes in a URL: search and contact
// lookups are POST bodies (S4-D9).
// MAIL: Mail's address beside this one (modules.js's rule: next.inflite.ai → email.inflite.ai; the test hub
//   ifl.test:8788 → email.ifl.test:8788).
// createApi({ base = MAIL, onLost(access), onRefused() }) → the methods of §4.7; each rejects with ApiError(status,
//   message) (status 0: no answer). onLost: a 401 with an access word; onRefused: no answer while online (Mail's hub
//   switch off: a CORS refusal looks like this), so the page asks /api/hub again (C1).
export const MAIL = `${location.protocol}//email.${location.host.replace(/^next\./, "")}`;

export const METHODS = ["session", "me", "version", "counts", "settings", "handback", "threads", "search", "thread", "meta", "draft", "batch", "emptyTrash", "unsubInfo", "unsubscribe", "remove", "saveSettings", "checkAddress", "updateAddress", "findContacts", "saveDraft", "sendDraft", "sent", "picture", "fileUrl", "rawUrl"];

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const OFFLINE = "You’re offline.", AWAY = "Couldn’t reach Mail. Try again in a moment.";
const offline = () => globalThis.navigator?.onLine === false;

// An upload by XMLHttpRequest, which says how far it's got: given up on once it stops moving for 30 s, then a minute for
// Mail's answer (app.js upload). → a Response, as fetch's
function upload(method, url, headers, body, onProgress) {
  return new Promise((resolve, reject) => {
    const x = new XMLHttpRequest();
    let timer = 0;
    const giveUpIn = (ms) => {
      clearTimeout(timer);
      timer = setTimeout(() => x.abort(), ms);
    };
    x.open(method, url);
    x.withCredentials = true;
    for (const [k, v] of Object.entries(headers)) x.setRequestHeader(k, v);
    x.upload.onprogress = (e) => {
      giveUpIn(30000);
      if (onProgress && e.lengthComputable) try { onProgress(e.loaded / e.total); } catch {}
    };
    x.upload.onload = () => giveUpIn(60000);
    x.onload = () => (clearTimeout(timer), resolve(new Response(x.responseText || null, { status: x.status })));
    x.onerror = x.onabort = () => (clearTimeout(timer), reject(new Error("Not sent")));
    giveUpIn(30000);
    x.send(body);
  });
}

export function createApi({ base = MAIL, onLost = null, onRefused = null } = {}) {
  async function req(method, path, body, opts = {}) {
    const write = method !== "GET";
    const headers = { ...(write && { "X-Inflite": "1" }), ...(body !== undefined && { "Content-Type": "application/json" }) };
    const text = body !== undefined ? JSON.stringify(body) : undefined;
    // (kept going as the page goes only if it's small enough for the browser to: 64 KB at most)
    const keepalive = !!opts.keepalive && new Blob([text || ""]).size < 64000;
    const url = base + path;
    const res = await (opts.upload && !keepalive
      ? upload(method, url, headers, text, opts.onProgress)
      : fetch(url, {
          method,
          signal: typeof AbortSignal.timeout === "function" ? AbortSignal.timeout(opts.timeout || 20000) : undefined,
          credentials: "include",
          mode: "cors",
          keepalive,
          headers,
          body: text,
        })
    ).catch(() => {
      if (!offline()) try { onRefused?.(); } catch {}
      throw new ApiError(0, offline() ? OFFLINE : AWAY);
    });
    if (opts.blob) {
      if (!res.ok) throw new ApiError(res.status, `Request failed (${res.status})`);
      return res.blob();
    }
    let data = null;
    try {
      data = await res.json();
    } catch {}
    if (!res.ok) {
      if (res.status === 401 && data?.access) try { onLost?.(data.access); } catch {}
      throw Object.assign(new ApiError(res.status, data?.error || `Request failed (${res.status})`), { access: data?.access || null });
    }
    return data;
  }
  const qs = (o) =>
    new URLSearchParams(Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== "" && v !== false)).toString();
  const enc = encodeURIComponent;
  return {
    session: () => req("GET", "/api/session"),
    me: () => req("GET", "/api/me"),
    version: () => req("GET", "/api/version"),
    counts: () => req("GET", "/api/counts"),
    settings: () => req("GET", "/api/settings"),
    handback: (code, verifier) => req("POST", "/api/auth/handback", { code, verifier }),
    // (never q: a search is search(), by POST)
    threads: ({ view, category, address, before } = {}) => req("GET", `/api/threads?${qs({ view, category, address, before })}`),
    search: ({ q, view, category, address, before, count } = {}) => req("POST", "/api/threads/search", { q, view, category, address, before, count: count ? 1 : undefined }),
    thread: (id) => req("GET", `/api/threads/${enc(id)}`),
    meta: (id) => req("GET", `/api/messages/${enc(id)}/meta`),
    draft: (id) => req("GET", `/api/drafts/${enc(id)}`),
    batch: (body, opts) => req("POST", "/api/threads/batch", body, opts),
    emptyTrash: () => req("POST", "/api/trash/empty", {}),
    unsubInfo: (id) => req("GET", `/api/unsubscribe/${enc(id)}`),
    unsubscribe: (id) => req("POST", `/api/unsubscribe/${enc(id)}`, {}),
    remove: (id) => req("DELETE", `/api/messages/${enc(id)}`),
    saveSettings: (patch) => req("PATCH", "/api/settings", patch),
    checkAddress: (local) => req("GET", `/api/addresses/check?${qs({ local })}`),
    updateAddress: (email, patch) => req("PATCH", `/api/addresses/${enc(email)}`, patch),
    findContacts: (q) => req("POST", "/api/contacts/find", { q }),
    saveDraft: (draft, onProgress, opts = {}) => req("POST", "/api/drafts", draft, { upload: true, onProgress, ...opts }),
    sendDraft: (draftId, key, opts = {}) => req("POST", "/api/send", { draftId, key }, opts),
    sent: (keys) => req("GET", `/api/sends?${qs({ keys: keys.join(",") })}`),
    picture: (id) => req("GET", `/api/attachments/${enc(id)}`, undefined, { blob: true }),
    fileUrl: (id) => `${base}/api/attachments/${enc(id)}`,
    rawUrl: (id) => `${base}/api/messages/${enc(id)}/raw`,
  };
}
