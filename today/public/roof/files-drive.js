// Private Drive transport. Only fixed same-origin endpoints are reachable;
// names, previews and object bytes remain in the current account's memory.
const ID = /^[A-Za-z0-9_-]{32}$/, MAX = 25 * 1024 * 1024;
const abort = () => new DOMException("This file operation was released", "AbortError");
const clean = (value, limit = 255) => typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, limit) : "";
const object = value => value && typeof value === "object" && !Array.isArray(value);
export class FilesError extends Error {
  constructor(message, status = 0) { super(message); this.name = "FilesError"; this.status = status; }
}
export const driveId = value => typeof value === "string" && ID.test(value);
const leaseOf = value => ({ signal: value?.signal, current: value?.current });
const checkedId = value => { if (!driveId(value)) throw new FilesError("That file reference is invalid.", 400); return value; };
const checkedVersion = value => { if (!Number.isSafeInteger(value) || value < 1) throw new FilesError("That file version is invalid.", 400); return value; };
export function driveItem(value) {
  if (!object(value) || !driveId(value.id) || value.parentId !== null && !driveId(value.parentId) || !["file", "folder"].includes(value.kind)
    || value.kind === "folder" && (value.size !== 0 || value.status !== "ready")
    || !["pending", "ready"].includes(value.status) || !Number.isSafeInteger(value.version) || value.version < 1
    || !Number.isSafeInteger(value.size) || value.size < 0 || value.size > MAX || [value.createdAt, value.modifiedAt].some(at => !Number.isSafeInteger(at) || at < 0 || at > 864e13)
    || !value.name || value.name !== clean(value.name) || !/^[\w!#$&^_.+-]+\/[\w!#$&^_.+-]+$/.test(value.mime || "")) return null;
  return { id: value.id, parentId: value.parentId, kind: value.kind, name: value.name, mime: value.mime, size: value.size,
    createdAt: value.createdAt, modifiedAt: value.modifiedAt, version: value.version, status: value.status };
}
function itemAnswer(value) {
  const item = driveItem(value?.item);
  if (!item) throw new FilesError("Files received an unexpected answer. Refresh and try again.");
  return item;
}
function listingAnswer(value) {
  if (!object(value) || !Array.isArray(value.items) || value.items.length > 100 || !Array.isArray(value.ancestors) || value.ancestors.length > 16
    || !Number.isSafeInteger(value.revision) || value.revision < 1 || value.cursor !== null && (typeof value.cursor !== "string" || !/^\d{1,12}:\d{1,4}$/.test(value.cursor))) throw new FilesError("That folder couldn’t be read. Try refreshing.");
  const items = value.items.map(driveItem), ancestors = value.ancestors.map(driveItem), folder = value.folder === null ? null : driveItem(value.folder);
  if (items.some(item => !item) || ancestors.some(item => !item || item.kind !== "folder") || value.folder !== null && (!folder || folder.kind !== "folder")) throw new FilesError("That folder couldn’t be read. Try refreshing.");
  const usage = value.usage;
  if (!object(usage) || ["used", "reserved", "limit", "nodes", "nodeLimit", "fileLimit"].some(key => !Number.isSafeInteger(usage[key]) || usage[key] < 0)) throw new FilesError("Files couldn’t read your storage usage.");
  return { items, ancestors, folder, cursor: value.cursor, revision: value.revision,
    usage: Object.fromEntries(["used", "reserved", "limit", "nodes", "nodeLimit", "fileLimit"].map(key => [key, usage[key]])) };
}
async function bounded(response, limit, task, binary = false) {
  const length = response.headers?.get("Content-Length");
  if (length != null && (!/^\d+$/.test(length) || Number(length) > limit)) {
    await response.body?.cancel?.().catch(() => {});
    throw new FilesError("Files received an answer that is too large.");
  }
  if (!response.body?.getReader) {
    const value = binary ? await response.blob() : await response.text(); task.check();
    if ((binary ? value.size : new TextEncoder().encode(value).length) > limit) throw new FilesError("Files received an answer that is too large.");
    return value;
  }
  const reader = response.body.getReader(), chunks = [], stop = () => { reader.cancel().catch(() => {}); };
  let size = 0;
  task.signal.addEventListener("abort", stop, { once: true });
  try {
    while (true) {
      const { value, done } = await reader.read(); task.check();
      if (done) break;
      size += value.byteLength;
      if (size > limit) throw new FilesError("Files received an answer that is too large.");
      chunks.push(value);
    }
    const blob = new Blob(chunks); task.check();
    const value = binary ? blob : await blob.text(); task.check(); return value;
  } catch (error) { await reader.cancel().catch(() => {}); throw error; }
  finally { task.signal.removeEventListener("abort", stop); reader.releaseLock(); }
}
const failure = (value, status) => new FilesError(clean(value?.error, 240) || (status === 401 ? "Sign in to open your files." : "That didn’t finish. Refresh to check before trying again."), status);
export const fileOperationId = () => crypto.randomUUID().replace(/-/g, "");

export function createDriveClient(F) {
  const owner = F.session.view?.user?.id, pending = new Set();
  let dead = false;
  const live = () => !dead && !!owner && !F.signal.aborted && F.session.view?.user?.id === owner;
  const assertLive = current => { if (!live() || current && !current()) throw abort(); };
  function scope({ signal, current } = {}, timeout = 20000) {
    assertLive(current);
    const controller = new AbortController(), stop = () => controller.abort();
    F.signal.addEventListener("abort", stop, { once: true }); signal?.addEventListener("abort", stop, { once: true });
    if (signal?.aborted) stop();
    const timer = setTimeout(() => controller.abort(new FilesError("Files took too long. Refresh before trying again.", 408)), timeout); pending.add(controller);
    return { signal: controller.signal, check: () => { assertLive(current); if (controller.signal.aborted) throw controller.signal.reason instanceof FilesError ? controller.signal.reason : abort(); }, done() {
      clearTimeout(timer); pending.delete(controller); F.signal.removeEventListener("abort", stop); signal?.removeEventListener("abort", stop);
    } };
  }
  const lost = status => { if (status === 401 && live()) Promise.resolve(F.session.lost?.()).catch(() => {}); };
  async function request(action, { method = "GET", query, body, ...lease } = {}) {
    const task = scope(lease);
    try {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(query || {})) if (value != null && value !== "") params.set(key, String(value));
      task.check();
      const response = await fetch(`/api/files/${action}${params.size ? "?" + params : ""}`, { method, credentials: "same-origin", mode: "same-origin", cache: "no-store", redirect: "error", signal: task.signal,
        headers: { "X-Inflite-Files-Owner": owner, Accept: "application/json", ...(method !== "GET" ? { "X-Inflite": "1", "Content-Type": "application/json" } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
      task.check();
      const text = await bounded(response, 128 * 1024, task); task.check();
      let value; try { if (text.length > 128 * 1024) throw new Error(); value = JSON.parse(text); } catch (_) { throw failure(null, response.status); }
      if (!response.ok) { lost(response.status); throw failure(value, response.status); }
      return value;
    } catch (error) { task.check(); throw error; }
    finally { task.done(); }
  }
  const browse = async ({ parentId = null, view = "folder", cursor = null, query = "", sort = view === "recent" ? "modified" : "name", kind = null, ...lease } = {}) => {
    if (parentId !== null) checkedId(parentId);
    if (kind !== null && kind !== "folder" || !["folder", "recent", "search"].includes(view) || !["name", "modified", "size"].includes(sort) || cursor !== null && (typeof cursor !== "string" || !/^\d{1,12}:\d{1,4}$/.test(cursor)) || typeof query !== "string" || query.length > 160) throw new FilesError("That folder request is invalid.", 400);
    const args = { parentId, view, cursor, sort, ...(kind ? { kind } : {}) };
    return listingAnswer(await request(query ? "search" : "list", query ? { method: "POST", body: { ...args, q: query }, ...leaseOf(lease) } : { query: args, ...leaseOf(lease) }));
  };
  async function content(id, lease = {}) {
    checkedId(id); const task = scope(lease, 60000);
    try {
      const response = await fetch(`/api/files/content?id=${encodeURIComponent(id)}`, { credentials: "same-origin", mode: "same-origin", cache: "no-store", redirect: "error", headers: { "X-Inflite-Files-Owner": owner }, signal: task.signal }); task.check();
      if (!response.ok) { const text = await bounded(response, 128 * 1024, task); let value; try { value = JSON.parse(text); } catch (_) {} task.check(); lost(response.status); throw failure(value, response.status); }
      if (response.headers.get("Content-Type")?.split(";")[0] !== "application/octet-stream" || Number(response.headers.get("Content-Length")) > MAX) throw new FilesError("That file couldn’t be downloaded.");
      const blob = await bounded(response, MAX, task, true); task.check();
      if (blob.size > MAX) throw new FilesError("That file is too large to open here.");
      return blob;
    } catch (error) { task.check(); throw error; }
    finally { task.done(); }
  }
  function uploadContent(id, file, { onProgress = () => {}, ...lease } = {}) {
    checkedId(id);
    if (!(file instanceof Blob) || file.size > MAX) return Promise.reject(new FilesError("Choose a file no larger than 25 MB.", 413));
    const task = scope(lease, 120000);
    return new Promise((resolve, reject) => {
      let xhr, finished = false; const stop = () => xhr?.abort();
      const finish = (error, value) => { if (finished) return; try { task.check(); } catch (stale) { error = stale; } finished = true; task.signal.removeEventListener("abort", stop); task.done(); if (xhr) { xhr.onload = xhr.onerror = xhr.onabort = xhr.ontimeout = null; if (xhr.upload) xhr.upload.onprogress = null; } error ? reject(error) : resolve(value); };
      try {
      xhr = new XMLHttpRequest(); xhr.open("PUT", `/api/files/content?id=${encodeURIComponent(id)}`, true); xhr.withCredentials = true; xhr.timeout = 120000;
      xhr.setRequestHeader("X-Inflite-Files-Owner", owner); xhr.setRequestHeader("X-Inflite", "1"); xhr.setRequestHeader("Content-Type", "application/octet-stream"); xhr.setRequestHeader("Accept", "application/json");
      xhr.upload.onprogress = event => { try { task.check(); onProgress(Number.isFinite(event.loaded) && event.loaded >= 0 ? Math.max(0, Math.min(1, file.size ? event.loaded / file.size : 1)) : 0); } catch (_) {} };
      xhr.onload = () => { try { task.check(); if (new TextEncoder().encode(xhr.responseText).length > 128 * 1024) throw failure(null, xhr.status); const value = JSON.parse(xhr.responseText); if (xhr.status < 200 || xhr.status >= 300) { lost(xhr.status); throw failure(value, xhr.status); } finish(null, itemAnswer(value)); } catch (error) { finish(error instanceof SyntaxError ? failure(null, xhr.status) : error); } };
      xhr.onerror = () => finish(new FilesError("The upload lost its connection. Refresh before retrying."));
      xhr.onabort = () => finish(task.signal.reason instanceof FilesError ? task.signal.reason : abort()); xhr.ontimeout = () => finish(new FilesError("The upload timed out. Refresh before retrying."));
      task.signal.addEventListener("abort", stop, { once: true });
      task.check(); xhr.send(file);
      } catch (error) { finish(error); }
    });
  }
  function destroy() { if (dead) return; dead = true; for (const controller of pending) controller.abort(); pending.clear(); F.signal.removeEventListener("abort", destroy); }
  F.signal.addEventListener("abort", destroy, { once: true });
  return { browse, content, uploadContent,
    item: async (id, lease = {}) => itemAnswer(await request("item", { query: { id: checkedId(id) }, ...leaseOf(lease) })),
    createFolder: async (name, parentId, operationId = fileOperationId(), lease = {}) => itemAnswer(await request("folders", { method: "POST", body: { name, parentId, operationId }, ...leaseOf(lease) })),
    reserve: async (spec, lease = {}) => itemAnswer(await request("uploads", { method: "POST", body: spec, ...leaseOf(lease) })),
    rename: async (id, version, name, lease = {}) => itemAnswer(await request("item", { method: "PATCH", body: { id: checkedId(id), version: checkedVersion(version), name }, ...leaseOf(lease) })),
    move: async (id, version, parentId, lease = {}) => itemAnswer(await request("move", { method: "POST", body: { id: checkedId(id), version: checkedVersion(version), parentId }, ...leaseOf(lease) })),
    remove: (id, version, lease = {}) => request("item", { method: "DELETE", query: { id: checkedId(id), version: checkedVersion(version) }, ...leaseOf(lease) }),
    destroy };
}
