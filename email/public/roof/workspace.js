// Optional Mail integration. Only authorised metadata enters the OS; message
// bodies, attachment bytes and authentication remain with Mail's existing UI.
const ID = /^[\w-]{1,64}$/;
const PICTURE = /^image\/(png|jpeg|gif|webp|avif|heic|bmp)$/i;
export const FILE_LIMITS = Object.freeze({ threads: 40, messages: 80, files: 100 });
const clean = (v, max = 180) => typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g, "").trim().slice(0, max) : "";
const mime = (v) => typeof v === "string" && /^[\w.+-]+\/[\w.+-]+$/.test(v) && v.length <= 100 ? v.toLowerCase() : "application/octet-stream";
const parseRef = (v) => typeof v === "string" ? /^mail:file:([\w-]{1,64}):([\w-]{1,64})$/.exec(v) : null;
const blocked = (s) => s.access === "ok" ? null : s.access === "signin" ? "signin" : s.access ? "locked" : "loading";
const refs = (m) => !m || !ID.test(m.id || "") || ["trash", "drafts"].includes(m.folder) ? [] : (Array.isArray(m.attachments) ? m.attachments : []).slice(0, 30).filter(a => ID.test(a?.id || "")).map(a => {
  const id = `mail:file:${m.id}:${a.id}`, name = clean(a.filename) || "Attachment";
  const at = typeof m.date === "number" ? m.date : Date.parse(m.date);
  return { id, app: "mail", kind: "file", objectId: id, name, mime: mime(a.type),
    ...(Number.isSafeInteger(a.size) && a.size >= 0 ? { size: a.size } : {}), ...(Number.isFinite(at) && at >= 0 ? { modifiedAt: at } : {}),
    source: "Mail", intent: "open-file", downloadIntent: "download-file", shareIntent: "forward-file" };
});

export function createWorkspace(root, ctx, { current = () => true, ready = async () => {}, resize = () => {} } = {}) {
  const { store, api, logic, fw } = ctx, sdk = fw.workspace, owner = fw.session.user.id;
  let dead = false, cached = null, listing = null, generation = 0, lastAccess = store.get().access;
  const live = () => !dead && !fw.signal.aborted && current() && fw.session.user.id === owner;
  const active = () => live() && sdk.active() !== false;
  const cachedFiles = () => blocked(store.get()) ? [] : cached?.files || Object.values(store.get().thread?.metas || {}).flatMap(refs).slice(0, FILE_LIMITS.files);
  const gone = () => ({ status: "signin", files: [] });
  root.classList.add("ml-workspace");
  // The slot is the viewport; Mail's reader/list content must not resize itself
  // during observer delivery. Reparenting always retires the previous target.
  const win = root.ownerDocument?.defaultView || globalThis;
  let paneRO = null, paneFrame = 0, paneHost = null;
  function pauseLayout() {
    paneRO?.disconnect(); if (paneFrame) win.cancelAnimationFrame(paneFrame);
    paneFrame = 0; paneHost = null;
  }
  function observeLayout() {
    pauseLayout();
    if (!active() || !root.classList.contains("ifl-in-pane") || typeof win.ResizeObserver !== "function") return;
    paneHost = root.closest(".ws-module-slot");
    if (!paneHost) return;
    paneRO ||= new win.ResizeObserver(() => {
      if (paneHost && !paneFrame && active()) paneFrame = win.requestAnimationFrame(() => {
        paneFrame = 0;
        if (active() && paneHost && root.closest(".ws-module-slot") === paneHost) resize();
      });
    });
    paneRO.observe(paneHost);
  }

  function snapshot() {
    if (!live()) return { status: "signin", actions: [], files: [] };
    const s = store.get(), status = blocked(s), canUse = s.access === "ok";
    return { status: status || (s.list.err && !s.list.rows.length ? "error" : "ready"), files: cachedFiles(),
      actions: [
        { id: "compose", label: "Compose a message", keywords: ["write", "email", "new mail"], enabled: canUse },
        { id: "reply", label: "Reply to this conversation", keywords: ["reply", "email"], enabled: canUse && ID.test(s.threadId || "") },
        ...(!canUse && s.access && s.access !== "notadmin" ? [{ id: "signin", label: s.access === "signin" ? "Sign in to Mail" : "Confirm it’s you", enabled: true }] : []),
      ] };
  }
  // A fixed attachment search enumerates recent metadata. Text typed in the OS
  // filters these names locally and is never sent to Mail as a search query.
  async function readFiles(mine) {
    await ready();
    if (!live() || mine !== generation) return gone();
    if (blocked(store.get())) return { status: blocked(store.get()), files: [] };
    const found = await api.search({ q: "has:attachment", view: "attachments" });
    if (!live() || mine !== generation) return gone();
    const threads = (found?.threads || []).filter(t => ID.test(t?.id || "")).slice(0, FILE_LIMITS.threads);
    let more = !!found?.hasMore || (found?.threads?.length || 0) > threads.length, next = 0, inspected = 0;
    const files = new Map();
    await Promise.all(Array.from({ length: Math.min(3, threads.length) }, async () => {
      while (live() && mine === generation && next < threads.length) {
        const item = threads[next++];
        let result;
        try { result = await api.thread(item.id); } catch (e) { if (e?.status === 404) continue; throw e; }
        if (!live() || mine !== generation || blocked(store.get())) return;
        const thread = result?.thread || result;
        if (thread?.id && thread.id !== item.id) continue;
        const messages = result?.messages || thread?.messages || [];
        for (const m of messages) {
          if (!m?.hasAttachments || !ID.test(m.id || "") || ["trash", "drafts"].includes(m.folder)) continue;
          if (++inspected > FILE_LIMITS.messages || files.size >= FILE_LIMITS.files) { more = true; break; }
          let meta;
          try { meta = await api.meta(m.id); } catch (e) { if (e?.status === 404) continue; throw e; }
          if (!live() || mine !== generation || blocked(store.get())) return;
          if (meta?.id !== m.id || meta.threadId && meta.threadId !== item.id) continue;
          if ((meta.attachments?.length || 0) > 30) more = true;
          for (const f of refs(meta)) { if (files.size >= FILE_LIMITS.files) { more = true; break; } files.set(f.id, f); }
        }
      }
    }));
    if (!live() || mine !== generation) return gone();
    if (blocked(store.get())) return { status: blocked(store.get()), files: [] };
    return { status: "ready", files: [...files.values()].sort((a, b) => (b.modifiedAt || 0) - (a.modifiedAt || 0) || a.id.localeCompare(b.id)), more, at: Date.now() };
  }
  async function files({ query = "", refresh = false, current: requesting = () => true } = {}) {
    if (!live() || !requesting()) return gone();
    if (blocked(store.get()) && store.get().access !== null) return { status: blocked(store.get()), files: [] };
    if (refresh) cached = null;
    if (!cached || Date.now() - cached.at > 30000) {
      const mine = generation;
      if (!listing) {
        const pending = readFiles(mine).then(result => { if (live() && mine === generation && result.status === "ready") { cached = result; sdk.changed(); } return result; }).finally(() => { if (listing === pending) listing = null; });
        listing = pending;
      }
      try { await listing; }
      catch (e) {
        if (!live() || !requesting()) return gone();
        return { status: blocked(store.get()) || "error", files: [], error: clean(e?.message) || "Mail attachments couldn’t load." };
      }
    }
    if (!live() || !requesting()) return gone();
    if (blocked(store.get())) return { status: blocked(store.get()), files: [] };
    const q = clean(query, 200).toLocaleLowerCase();
    return { status: "ready", files: (cached?.files || []).filter(f => !q || f.name.toLocaleLowerCase().includes(q)), more: !!cached?.more, description: "Recent Mail attachments" };
  }
  async function run(intent, object, { current: presenting = () => true } = {}) {
    const present = () => active() && presenting();
    if (!present()) return { ok: false, cancelled: true };
    if (intent === "signin") {
      if (store.get().access === "notadmin") return { ok: false, error: "Mail is only available to its owner." };
      return { ok: !!(await ctx.open.signin(present)) };
    }
    await ready();
    if (!present()) return { ok: false, cancelled: true };
    if (blocked(store.get())) return { ok: false, error: store.get().access === "notadmin" ? "Mail is only available to its owner." : "Open Mail and confirm it’s you to continue." };
    const permitted = () => present() && store.get().access === "ok";
    if (intent === "compose") return { ok: !!(await ctx.open.compose({}, permitted)), pending: true };
    if (intent === "reply") {
      const id = typeof object === "string" ? object : store.get().threadId;
      if (!ID.test(id || "")) return { ok: false, error: "Choose a conversation in Mail first." };
      const result = await api.thread(id);
      if (!permitted()) return { ok: false, cancelled: true };
      const thread = result?.thread || result, messages = result?.messages || thread?.messages || [];
      if (thread?.id && thread.id !== id) return { ok: false, error: "That conversation couldn’t be verified. Open it in Mail." };
      const available = messages.filter(m => !["trash", "drafts"].includes(m.folder) && ID.test(m.id || ""));
      const message = available.find(m => m.folder !== "sent") || available[0];
      if (!message) return { ok: false, error: "That conversation is no longer available." };
      const meta = await api.meta(message.id);
      if (!permitted()) return { ok: false, cancelled: true };
      if (meta?.id !== message.id || ["trash", "drafts"].includes(meta.folder) || meta.threadId && meta.threadId !== id) return { ok: false, error: "That reply couldn’t be verified. Open the conversation in Mail." };
      return { ok: !!(await ctx.open.compose(logic.replyDraft(meta, "reply", store.get().me), permitted)), pending: true };
    }
    if (!["open-file", "download-file", "forward-file"].includes(intent)) return { ok: false, error: "That Mail action is not available." };
    const parts = parseRef(object);
    if (!parts) return { ok: false, error: "That attachment reference is not valid." };
    const meta = await api.meta(parts[1]);
    if (!permitted()) return { ok: false, cancelled: true };
    const file = refs(meta).find(f => f.id === object), attachment = meta?.attachments?.find(a => a.id === parts[2]);
    if (!file || !attachment) return { ok: false, error: "That attachment is no longer available." };
    if (intent === "forward-file") return { ok: !!(await ctx.open.compose({ subject: file.name, files: [{ ref: parts[2], filename: file.name, type: file.mime, size: file.size }] }, permitted)), pending: true };
    if (intent === "open-file" && PICTURE.test(file.mime)) return { ok: !!(await ctx.open.viewer([{ id: parts[2], filename: file.name, type: file.mime, size: file.size }], 0, permitted)), pending: true };
    // Keep non-raster navigation at Mail's origin. Its existing attachment gate
    // remains authoritative; no cross-origin fetch, body preview or blob cache.
    const url = new URL(api.fileUrl(parts[2]));
    if (intent === "download-file") url.searchParams.set("download", "");
    const link = fw.ui.el("a", { class: "ifl-btn primary", href: url.href, target: "_blank", rel: "noopener", text: intent === "download-file" ? "Download from Mail" : "Open in Mail" });
    const body = fw.ui.el("div", { class: "ml-workspace-file" }, fw.ui.el("p", { text: file.name }), fw.ui.el("p", { text: "Mail checks your access before opening this attachment." }), link);
    fw.sheet.open({ sheet: "mail-workspace-file", title: intent === "download-file" ? "Download attachment" : "Open attachment", body });
    return { ok: true, pending: true };
  }
  const off = sdk.provide({ snapshot, files, run });
  const changed = store.on("*", () => {
    if (!live()) return;
    const access = store.get().access;
    if (access !== lastAccess && access !== "ok") { generation++; cached = null; listing = null; }
    lastAccess = access;
    sdk.changed();
  });
  function destroy() {
    if (dead) return;
    dead = true; generation++; pauseLayout(); cached = null; off(); changed(); root.classList.remove("ml-workspace"); fw.signal.removeEventListener("abort", destroy);
  }
  fw.signal.addEventListener("abort", destroy, { once: true });
  if (fw.signal.aborted) destroy();
  return { snapshot, files, run, observeLayout, pauseLayout, destroy };
}
