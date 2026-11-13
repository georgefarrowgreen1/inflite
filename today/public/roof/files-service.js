// Account-lived Files service: private Drive writes and app-owned virtual files.
// Explorer selection is local to each reader; only safe metadata is indexed.
import { createAppFilesIndex } from "./files-apps.js";
import { filterWorkspaceFiles, fileText } from "./files-metadata.js";
import { filesLocation } from "./files-location.js";

const ID = /^[A-Za-z0-9_-]{32}$/, MAX_FILE = 25 * 1024 * 1024;
const PREVIEW = /^(?:image\/(?:png|jpeg|gif|webp|avif)|audio\/(?:mpeg|mp4|ogg|wav|webm|aac|flac)|text\/(?:plain|csv)|application\/json)$/;
const abort = () => new DOMException("This Files operation was released", "AbortError");
const label = (id, text, icon = id, other = {}) => ({ id, label: text, icon, ...other });
const keyOf = node => "drive:" + node.id;
const appKey = file => `app:${file.app}:${file.id}`;
const operation = () => crypto.randomUUID().replace(/-/g, "");
const valid = fn => { try { return !fn || fn() !== false; } catch (_) { return false; } };
const previewable = node => node.status === "ready" && PREVIEW.test(node.mime) && (!/^(?:text\/|application\/json$)/.test(node.mime) || node.size <= 262144);

export function createFilesService(F, options = {}) {
  const owner = F.session.view?.user?.id, listeners = new Set(), nodes = new Map(), appRefs = new Map(), transfers = new Map(), writes = new Set();
  let dead = false, driveClient = null, drivePromise = null, activeUploads = 0, appReads = 0, sourceSignature = "", pendingAppEvent = false;
  const live = () => !dead && !!owner && !F.signal.aborted && F.session.view?.user?.id === owner;
  const current = lease => live() && !lease?.signal?.aborted && valid(lease?.current);
  const assert = lease => { if (!current(lease)) throw abort(); };
  const emit = change => { if (live()) for (const registration of [...listeners]) { if (!live()) break; if (listeners.has(registration)) try { registration.fn(change); } catch (_) {} } };
  const open = (query = "", location = null) => { const selected = location ? filesLocation(location) : null; if (live() && (!location || selected)) return options.openExplorer?.(fileText(query, 160), selected); };
  const index = createAppFilesIndex(F, options);
  async function drive(lease) {
    assert(lease);
    if (!driveClient) {
      drivePromise ||= import("./files-drive.js").then(module => { if (!live()) throw abort(); return driveClient ||= module.createDriveClient(F); });
      await drivePromise;
    }
    assert(lease); return driveClient;
  }
  function remember(node) {
    nodes.delete(node.id); nodes.set(node.id, Object.freeze({ ...node }));
    if (nodes.size > 1000) nodes.delete(nodes.keys().next().value);
    return nodes.get(node.id);
  }
  function driveResource(value) {
    const node = remember(value), ready = node.status === "ready";
    const actions = node.kind === "folder" ? [label("open", "Open", "folder", { primary: true })] : ready ? [
      ...(previewable(node) ? [label("preview", "Preview", "preview", { primary: true })] : []), label("download", "Download", "download", { primary: !previewable(node) }),
    ] : [];
    if (ready) actions.push(label("rename", "Rename", "rename"), label("move", "Move", "folder"));
    actions.push(label("delete", ready ? "Delete" : "Remove pending upload", "delete", { destructive: true }));
    return { key: keyOf(node), ...node, source: { kind: "drive", id: "drive" }, sourceLabel: "My Drive", actions,
      primaryAction: node.kind === "folder" ? "open" : ready ? previewable(node) ? "preview" : "download" : null,
      ...(node.kind === "folder" ? { location: { kind: "drive", folderId: node.id, view: "folder" } } : {}) };
  }
  function appResource(file) {
    const key = appKey(file); appRefs.delete(key); appRefs.set(key, file);
    if (appRefs.size > 500) appRefs.delete(appRefs.keys().next().value);
    return { key, id: file.id, source: { kind: "app", id: file.app }, kind: "file", name: file.name, mime: file.mime,
      size: file.size, modifiedAt: file.modifiedAt, category: file.category, sourceLabel: file.source || file.app,
      actions: [label(file.intent, "Open", "open", { primary: true }), ...(file.downloadIntent && file.downloadIntent !== file.intent ? [label(file.downloadIntent, "Download", "download")] : []), ...(file.shareIntent ? [label(file.shareIntent, "Share", "share")] : [])], primaryAction: file.intent };
  }
  function pruneApps() {
    const keep = new Set(index.retain([...appRefs.values()]));
    for (const [key, file] of appRefs) if (!keep.has(file)) appRefs.delete(key);
  }
  const signature = sources => JSON.stringify(sources.map(source => [source.app, source.status, source.more, source.files]));
  const off = index.subscribe(() => {
    if (!live()) return;
    pruneApps();
    const next = signature(index.snapshot());
    if (next === sourceSignature) return;
    sourceSignature = next;
    if (appReads) { pendingAppEvent = true; return; }
    emit({ kind: "resources", source: { kind: "app" } });
  });
  function locations(location) {
    if (!live()) return [];
    return [
      { name: "My Drive", icon: "folder", kind: "drive", selected: location?.kind === "drive" && location.view !== "recent", location: { kind: "drive", folderId: null, view: "folder" } },
      { name: "Recent", icon: "clock", kind: "drive", selected: location?.kind === "drive" && location.view === "recent", location: { kind: "drive", folderId: null, view: "recent" } },
      { name: "From apps", icon: "grid", kind: "apps", selected: location?.kind === "apps" && !location.app, location: { kind: "apps", app: null } },
      ...index.snapshot().map(source => ({ name: source.name, kind: "apps", icon: "folder", selected: location?.kind === "apps" && location.app === source.app, location: { kind: "apps", app: source.app } })),
    ];
  }
  function notices(sources) {
    return sources.flatMap(source => {
      const name = source.name, state = source.status;
      const text = state === "locked" ? `Unlock ${name} to see its files.` : state === "signin" ? `Sign in to ${name} to see its files.` : state === "loading" ? `Loading ${name}…` : state === "error" ? `${name} files couldn’t be loaded.` : source.more ? `${name}: showing recent files. Open the app for more.` : !source.files.length ? `${name} has no files to show here yet.` : "";
      return text ? [{ id: source.app, resourceKey: "source:" + source.app, text, actions: state === "loading" ? [] : [label("open-app", `Open ${name}`, "open")] }] : [];
    });
  }
  async function browse(location, { query = "", sort = "name", cursor = null, foldersOnly = false, refresh = false, ...lease } = {}) {
    assert(lease); const selected = filesLocation(location);
    if (!selected || !["name", "modified", "size"].includes(sort)) throw new Error("That Files location is invalid.");
    query = fileText(query, 160);
    if (selected.kind === "apps") {
      const available = index.snapshot().filter(source => !selected.app || source.app === selected.app);
      if (!selected.app && !query && !selected.category) return { name: "From apps", status: "ready", capabilities: {}, cursor: null, items: available.map(source => ({
        key: "source:" + source.app, id: source.app, source: { kind: "app", id: source.app }, kind: "folder", name: source.name, sourceLabel: ({ ready: "App files", locked: "Unlock to browse", signin: "Sign in to browse", loading: "Open to browse", error: "Open app to retry" })[source.status],
        location: { kind: "apps", app: source.app }, actions: [label("open", "Open", "folder", { primary: true })], primaryAction: "open",
      })) };
      appReads++;
      try {
        const answer = await index.read({ app: selected.app, query, current: lease.current, signal: lease.signal, refresh }); assert(lease);
        const files = filterWorkspaceFiles(answer.files, { query, type: selected.category || "all", sort: sort === "modified" ? "recent" : sort });
        return { name: selected.app ? available[0]?.name || "App files" : "From apps", status: "ready", capabilities: {}, cursor: null, items: files.map(appResource), notices: notices(answer.sources) };
      } finally {
        appReads--; if (!appReads && pendingAppEvent) { pendingAppEvent = false; queueMicrotask(() => emit({ kind: "resources", source: { kind: "app" } })); }
      }
    }
    const api = await drive(lease);
    const answer = await api.browse({ parentId: selected.folderId, view: query && selected.view === "folder" && !selected.folderId ? "search" : selected.view, sort, cursor, query, ...(foldersOnly ? { kind: "folder" } : {}), signal: lease.signal, current: lease.current }); assert(lease);
    if (!query && !cursor && !answer.cursor && !foldersOnly && selected.view === "folder") {
      const ids = new Set(answer.items.map(item => item.id));
      for (const [id, node] of nodes) if (node.parentId === selected.folderId && !ids.has(id)) nodes.delete(id);
    }
    const items = answer.items.filter(item => !foldersOnly || item.kind === "folder").map(driveResource);
    return { ...answer, ancestors: answer.ancestors.filter(item => item.id !== answer.folder?.id), status: "ready", items,
      capabilities: { upload: selected.view === "folder" && !query, newFolder: selected.view === "folder" && !query },
      cursor: foldersOnly && answer.items.some(item => item.kind !== "folder") ? null : answer.cursor };
  }
  function resourceEvent(parentId) { emit({ kind: "resources", source: { kind: "drive", id: "drive" }, folderId: parentId }); }
  async function writing(fn) {
    const promise = Promise.resolve().then(fn); writes.add(promise);
    try { return await promise; } finally { writes.delete(promise); }
  }
  function download(node, lease) {
    assert(lease);
    const anchor = F.ui.el("a", { href: `/api/files/content?id=${encodeURIComponent(node.id)}&download=1`, download: node.name, hidden: true });
    document.body.append(anchor); anchor.click(); anchor.remove();
  }
  async function run(key, action, { input = {}, ...lease } = {}) {
    assert(lease);
    if (typeof key === "string" && key.startsWith("source:") && action === "open-app") return { ok: index.gate(key.slice(7)) };
    if (typeof key === "string" && key.startsWith("app:")) {
      pruneApps(); const file = appRefs.get(key); if (!file) return { ok: false, error: "Open the original app to use this file." };
      return index.run(file, action, { current: () => current(lease) });
    }
    const id = typeof key === "string" && key.startsWith("drive:") ? key.slice(6) : null;
    const node = id && ID.test(id) ? nodes.get(id) : null;
    if (action !== "create-folder" && !node) return { ok: false, error: "That file is no longer available. Refresh to check." };
    if (action === "download" && node.kind === "file" && node.status === "ready") { download(node, lease); return { ok: true }; }
    if (action === "preview") {
      const api = await drive(lease); assert(lease);
      if (!Number.isSafeInteger(input.version) || input.version < 1 || node.version !== input.version) return { ok: false, error: "That file changed. Refresh before opening it." };
      if (!previewable(node)) return { ok: false, error: "Download this file to open it." };
      const fresh = await api.item(id, lease); assert(lease);
      if (fresh.version !== input.version || fresh.status !== "ready") return { ok: false, error: "That file changed. Refresh to open the latest version." };
      const blob = await api.content(id, lease); assert(lease);
      return { ok: true, blob: blob.slice(0, blob.size, node.mime) };
    }
    return writing(async () => {
      assert(lease); const api = await drive(lease); assert(lease); let result;
      if (action === "create-folder" && key == null) result = await api.createFolder(input.name, input.parentId ?? null, operation(), lease);
      else if (action === "rename") result = await api.rename(id, input.version, input.name, lease);
      else if (action === "move") result = await api.move(id, input.version, input.parentId ?? null, lease);
      else if (action === "delete") { await api.remove(id, input.version, lease); nodes.delete(id); resourceEvent(node.parentId); return { ok: true }; }
      else return { ok: false, error: "That action is unavailable for this file." };
      assert(lease); remember(result); resourceEvent(result.parentId); if (action === "move") resourceEvent(node.parentId); return { ok: true };
    });
  }
  function publicTransfers() {
    if (!live()) return [];
    return [...transfers.values()].map(record => ({ id: record.id, name: record.name, status: record.status, progress: record.progress,
      label: record.error || ({ queued: "Waiting", uploading: record.progress >= 1 ? "Finishing…" : "Uploading", reserving: "Preparing…", done: "Uploaded", cancelled: "Cancelled", failed: "Upload failed" })[record.status], cancelable: ["queued", "reserving", "uploading"].includes(record.status) }));
  }
  const transferEvent = () => emit({ kind: "transfers" });
  function trimTransfers() { for (const [id, record] of transfers) { if (transfers.size <= 40) break; if (["done", "cancelled", "failed"].includes(record.status)) transfers.delete(id); } }
  async function uploadOne(record) {
    activeUploads++;
    const lease = { current: () => live() && !record.cancelled, signal: record.controller.signal };
    try {
      const api = await drive(lease); record.status = "reserving"; transferEvent();
      record.reservation = { name: record.name, mime: record.file.type || "application/octet-stream", size: record.file.size, parentId: record.folderId, operationId: record.id };
      record.node = await api.reserve(record.reservation, lease); assert(lease);
      record.status = "uploading"; transferEvent();
      const ready = await api.uploadContent(record.node.id, record.file, { ...lease, onProgress: fraction => { if (current(lease)) { record.progress = fraction; transferEvent(); } } }); assert(lease);
      remember(ready); record.status = "done"; record.progress = 1; resourceEvent(record.folderId);
    } catch (error) {
      record.status = record.cancelled || error?.name === "AbortError" ? "cancelled" : "failed";
      if (record.status === "failed") record.error = fileText(error?.message, 240) || "The upload didn’t finish. Refresh to check.";
      if (live() && record.cancelled && (record.node || record.reservation)) try {
        // Cancellation can hide a committed reservation's reply. Reconcile the
        // exact idempotent operation before cleanup; consumed operations cannot
        // create another item, and a changed account never enters this path.
        const api = await drive(), reserved = record.node || await api.reserve(record.reservation), fresh = await api.item(reserved.id);
        if (fresh.version <= 2 && (record.node || fresh.status === "pending" && fresh.version === 1)) await api.remove(fresh.id, fresh.version);
        resourceEvent(record.folderId);
      } catch (_) { /* An expired reservation is also reclaimed by the server. */ }
    } finally { record.file = record.reservation = null; activeUploads--; trimTransfers(); transferEvent(); pump(); }
  }
  function pump() {
    if (!live()) return;
    for (const record of transfers.values()) {
      if (activeUploads >= 2) break;
      if (record.status === "queued") { record.status = "reserving"; record.promise = uploadOne(record); }
    }
  }
  async function upload(files, { folderId = null, current: accepting } = {}) {
    assert({ current: accepting });
    if (folderId !== null && (typeof folderId !== "string" || !ID.test(folderId))) throw new Error("Choose a valid destination folder.");
    files = [...files];
    if (!files.length) return { queued: 0 };
    if (files.length > 100 || [...transfers.values()].filter(record => ["queued", "reserving", "uploading"].includes(record.status)).length + files.length > 100) throw new Error("Choose up to 100 files at a time.");
    if (files.some(file => !(file instanceof Blob) || typeof file.name !== "string" || !file.name.trim() || /[\/\\\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/.test(file.name) || file.size > MAX_FILE)) throw new Error("Choose files no larger than 25 MB each.");
    for (const file of files) {
      const id = operation(); transfers.set(id, { id, name: file.name, file, folderId, controller: new AbortController(), status: "queued", progress: 0, cancelled: false, node: null });
    }
    trimTransfers(); transferEvent(); pump(); return { queued: files.length };
  }
  function cancelTransfer(id) {
    const record = transfers.get(id); if (!live() || !record || !["queued", "reserving", "uploading"].includes(record.status)) return;
    record.cancelled = true; record.controller.abort();
    if (record.status === "queued") { record.status = "cancelled"; record.file = null; }
    transferEvent();
  }
  const busy = () => live() && (activeUploads > 0 || writes.size > 0 || [...transfers.values()].some(record => ["queued", "reserving", "uploading"].includes(record.status)));
  async function flush({ timeoutMs = 2000 } = {}) {
    let timer, expired = false;
    const deadline = new Promise(resolve => { timer = setTimeout(() => { expired = true; resolve(); }, Math.max(0, Math.min(10000, timeoutMs))); });
    try {
      while (busy() && !expired) {
        const pending = [...writes, ...[...transfers.values()].map(record => record.promise).filter(Boolean)];
        if (!pending.length) break;
        await Promise.race([Promise.allSettled(pending), deadline]);
      }
    } finally { clearTimeout(timer); }
    return { lost: busy() ? 1 : 0 };
  }
  async function search(query) {
    if (!live()) return [];
    const typed = fileText(query, 160); if (!typed) return [];
    const appEntries = await index.search(typed); if (!live()) return [];
    const words = typed.toLocaleLowerCase().split(/\s+/).filter(Boolean);
    const driveEntries = [...nodes.values()].filter(node => node.status === "ready" && words.every(word => node.name.toLocaleLowerCase().includes(word))).slice(0, 10).map(node => ({ app: null, title: node.name, sub: "My Drive", icon: "file", run: () => live() && nodes.has(node.id) && open(node.kind === "folder" ? "" : node.name, { kind: "drive", folderId: node.kind === "folder" ? node.id : node.parentId, view: "folder" }) }));
    return [...driveEntries, ...appEntries, { app: null, title: `Find “${typed}” in InFlite Files`, sub: "Search My Drive", icon: "file", run: () => open(typed) },
      ...(index.snapshot().length ? [{ app: null, title: `Find “${typed}” in app files`, sub: "Attachments, routes and workouts", icon: "file", run: () => open(typed, { kind: "apps", app: null }) }] : [])];
  }
  function destroy() {
    if (dead) return; dead = true; off(); index.destroy(); driveClient?.destroy();
    for (const record of transfers.values()) { record.controller.abort(); record.file = null; }
    transfers.clear(); nodes.clear(); appRefs.clear(); listeners.clear(); writes.clear();
    F.signal.removeEventListener("abort", destroy);
  }
  F.signal.addEventListener("abort", destroy, { once: true }); if (F.signal.aborted) destroy();
  return { browse, run, upload, locations, transfers: publicTransfers, cancelTransfer, busy, flush, search, open,
    update: app => index.update(app), changed: app => index.changed(app), destroy,
    subscribe(fn) { if (!live() || typeof fn !== "function") return () => {}; const registration = { fn }; listeners.add(registration); return () => listeners.delete(registration); } };
}
