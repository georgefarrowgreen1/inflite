// Mail's API client under the roof (One roof stage 4, s4/spec §4.7, S4-D2, S4-D9, S4-D17, §3.5). The page calls Mail's
// Worker directly, by credentialed CORS: reads (GET) carry no custom header (no preflight), writes (POST, PATCH, DELETE)
// carry X-Inflite: 1 and go through a few fixed URLs. Never a query in a URL: searches and contact lookups are POST
// bodies. Never a body: no message(), no /api/messages/<id> but /meta (§3.1; Mail's server refuses it from a hub too).
// B0-b's stub (STUB = true): MAIL, ApiError, METHODS and every method's name, request and answer are frozen; the stub's
// methods answer the shapes below, empty; MM writes the real client (Mail's timeouts, XHR uploads with progress,
// realApi app.js:1144–1245).
//
// MAIL = `${location.protocol}//email.${location.host.replace(/^next\./, "")}` (modules.js's rule; the test stack's
//   http://email.ifl.test:8788, the kit's http://email.kit.test).
// createApi({ base = MAIL, onLost }) → the methods; onLost(access) on a 401 that carries { access } (D3).
// ApiError(status, message): status 0 = never reached Mail (offline, CORS refused, timed out).
//
// | method                                  | request                                  | answer
// | session() me() version() counts() settings() handback(code, verifier)  | as realApi       | as realApi
// | threads({ view, category, address, before }) | GET /api/threads?… (never q)        | { threads: Summary[], drafts, hasMore }, each with latestId
// | search({ q, view, category, address, before, count }) | POST /api/threads/search   | as threads, or { count }
// | thread(id)                              | GET /api/threads/<id>                    | Thread (+ messages: Summary[])
// | meta(id)                                | GET /api/messages/<id>/meta              | Meta = summary + replyTo, messageId, inReplyTo, references, attachments[{ id, filename, type, size }]
// | draft(id)                               | GET /api/drafts/<id>                     | { compose: { from, to, cc, bcc, subject, text, inReplyTo, references, quote, files[] }, quoteOld }
// | batch(body)                             | POST /api/threads/batch                  | { ok } (single-thread actions too: { ids: [id], action, … })
// | emptyTrash() unsubInfo(id) unsubscribe(id) remove(id) saveSettings(p) updateAddress(e, p) | as realApi | as realApi
// | findContacts(q)                         | POST /api/contacts/find { q }            | { contacts }
// | saveDraft(draft, onProgress)            | POST /api/drafts (XHR, progress)         | { id }
// | sendDraft(draftId, key)                 | POST /api/send { draftId, key }          | { id }
// | sent(keys)                              | GET /api/sends?keys=                     | { sent }
// | picture(id)                             | GET /api/attachments/<id> (raster only)  | Blob
// | fileUrl(id) rawUrl(id)                  | none (a navigation, new tab)             | MAIL + "/api/attachments/<id>", MAIL + "/api/messages/<id>/raw"
// Payload shapes (frozen): draft { id?, from, to, cc, bcc, subject, text, inReplyTo, references, quote: { of, mode } |
// null, attachments: [{ filename, type, size, content } | { ref }] }.
// No checkAddress: realApi's GET /api/addresses/check?local=… puts what was typed into a URL, and the module has no New
// Address (§4.1 mailsettings), so it is not here (review I6 of B0-b; s4/spec §4.7's list less that one).
export const STUB = true;
export const MAIL = `${location.protocol}//email.${location.host.replace(/^next\./, "")}`;
export const METHODS = ["session", "me", "version", "counts", "settings", "handback", "threads", "search", "thread", "meta", "draft", "batch", "emptyTrash", "unsubInfo", "unsubscribe", "remove", "saveSettings", "updateAddress", "findContacts", "saveDraft", "sendDraft", "sent", "picture", "fileUrl", "rawUrl"];

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function createApi({ base = MAIL, onLost } = {}) {
  const ok = (x) => Promise.resolve(x);
  const id = (x) => encodeURIComponent(String(x));
  return {
    session: () => ok({ access: null, accountOrigin: "", user: null }),
    me: () => ok({ displayName: "", domain: "", defaultFrom: "", identities: [], addresses: [], signature: "" }),
    version: () => ok({ v: null, build: null, app: null }),
    counts: () => ok({ people: { threads: 0, unread: 0 }, updates: { threads: 0, unread: 0 }, flagged: 0, snoozed: 0, trash: 0, drafts: 0, addresses: [], inbox: { unread: 0 } }),
    settings: () => ok({ domain: "", catchall: "keep", signature: "", colors: [], addresses: [] }),
    handback: (code, verifier) => ok({ access: null, accountOrigin: "", user: null }),
    threads: ({ view, category, address, before } = {}) => ok({ threads: [], drafts: [], hasMore: false }),
    search: ({ q, view, category, address, before, count } = {}) => ok(count ? { count: 0 } : { threads: [], drafts: [], hasMore: false }),
    thread: (tid) => Promise.reject(new ApiError(404, "Conversation not found")),
    meta: (mid) => Promise.reject(new ApiError(404, "Message not found")),
    draft: (did) => Promise.reject(new ApiError(404, "Draft not found")),
    batch: (body) => ok({ ok: true }),
    emptyTrash: () => ok({ ok: true }),
    unsubInfo: (tid) => ok({ sender: null, opened: 0, of: 0, how: null, to: null, page: null }),
    unsubscribe: (tid) => ok({ ok: true }),
    remove: (mid) => ok({ ok: true }),
    saveSettings: (patch) => ok({ domain: "", catchall: "keep", signature: "", colors: [], addresses: [] }),
    updateAddress: (email, patch) => ok({ email }),
    findContacts: (q) => ok({ contacts: [] }),
    saveDraft: (draft, onProgress) => ok({ ok: true, id: draft?.id || null }),
    sendDraft: (draftId, key) => ok({ ok: true, id: null }),
    sent: (keys) => ok({ sent: [] }),
    picture: (aid) => Promise.reject(new ApiError(404, "Not found")),
    fileUrl: (aid) => `${base}/api/attachments/${id(aid)}`,
    rawUrl: (mid) => `${base}/api/messages/${id(mid)}/raw`,
  };
}
