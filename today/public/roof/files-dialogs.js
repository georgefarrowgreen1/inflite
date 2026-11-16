// Account-owned Open/Save dialogs. Bytes move only after the person's explicit
// Open/Save action; locations, queries and filenames never enter browser history.
const LIMIT = 25 * 1024 * 1024;
const safe = fn => { try { return !fn || fn() !== false; } catch (_) { return false; } };
const text = (value, max = 180) => typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g, "").slice(0, max) : "";
export function fileAccept(value) {
  const list = typeof value === "string" ? value.split(",") : Array.isArray(value) ? value : [];
  return [...new Set(list.slice(0, 30).filter(v => typeof v === "string").map(v => v.trim().toLowerCase()).filter(v => /^\.[a-z0-9_-]{1,16}$|^[a-z0-9!#$&^_.+-]+\/(?:[a-z0-9!#$&^_.+-]+|\*)$/.test(v)))];
}
export function acceptsFile(item, accept) {
  return !accept.length || accept.some(type => type[0] === "." ? String(item?.name || "").toLowerCase().endsWith(type) : type.endsWith("/*") ? String(item?.mime || item?.type || "").toLowerCase().startsWith(type.slice(0, -1)) : type === String(item?.mime || item?.type || "").toLowerCase());
}
export const validSaveName = name => typeof name === "string" && !!name.trim() && name === name.trim() && name.length <= 255 && !/[\/\\\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/.test(name) && ![".", ".."].includes(name);
const fileSize = size => Number.isFinite(size) ? size < 1024 ? `${size} B` : size < 1048576 ? `${Math.round(size / 1024)} KB` : `${(size / 1048576).toFixed(1)} MB` : "";

export function createFilesDialogs(F, { service } = {}) {
  const owner = F.session.view?.user?.id;
  let dead = false, pending = null;
  const alive = () => !dead && !!owner && !F.signal.aborted && F.session.view?.user?.id === owner;
  function show(mode, file, options = {}, requester = {}) {
    if (!alive() || requester.signal?.aborted || options.signal?.aborted || !safe(requester.current) || !safe(options.current)) return Promise.resolve(null);
    if (mode === "save" && (!(file instanceof Blob) || !Number.isSafeInteger(file.size) || file.size > LIMIT)) return Promise.reject(new Error("Choose a file no larger than 25 MB."));
    pending?.cancel();
    return new Promise(resolve => {
      const controller = new AbortController(), children = new Set(), subscriptions = [], selection = new Map(), el = F.ui.el;
      const accept = fileAccept(options.accept), multiple = options.multiple === true;
      const maxBytes = Number.isSafeInteger(options.maxBytes) ? Math.max(0, Math.min(LIMIT, options.maxBytes)) : LIMIT;
      const maxFiles = multiple ? Math.max(1, Math.min(100, Number.isSafeInteger(options.maxFiles) ? options.maxFiles : 100)) : 1;
      let closed = false, loading = false, committing = false, episode = 0, listingRead = null, folderId = null, query = "", page = 0, cursors = [null], answer = null, handle;
      const current = () => alive() && !closed && !controller.signal.aborted && !requester.signal?.aborted && !options.signal?.aborted && safe(requester.current) && safe(options.current);
      const lease = () => ({ current, signal: controller.signal });
      const status = el("p", { class: "ifd-status", role: "status", "aria-live": "polite" });
      const path = el("nav", { class: "ifd-path", "aria-label": "Folder path" });
      const list = el("div", { class: "ifd-list", role: "list", "aria-label": mode === "save" ? "Destination folders" : "Files to open" });
      const search = el("input", { type: "search", "aria-label": mode === "save" ? "Find destination folders" : "Find files", placeholder: mode === "save" ? "Find folders" : "Find files", maxlength: 160, autocomplete: "off", autocapitalize: "off", spellcheck: "false" });
      const name = el("input", { type: "text", "aria-label": "File name", maxlength: 255, autocomplete: "off", value: text(options.suggestedName || file?.name || "Untitled", 255) });
      const previous = F.ui.btn("Previous page", { small: true, run: () => changePage(-1) });
      const next = F.ui.btn("Next page", { small: true, run: () => changePage(1) });
      const pager = el("nav", { class: "ifd-pages", "aria-label": "File pages" }, previous, next);
      const choose = F.ui.btn(mode === "save" ? "Save here" : "Open", { primary: true, run: commit });
      const cancel = F.ui.btn("Cancel", { run: () => finish(null) });
      const newFolder = F.ui.btn("New folder", { small: true, run: createFolder });
      const controls = el("div", { class: "ifd-tools" }, search, newFolder);
      const body = el("div", { class: "ifd" }, path, controls, mode === "save" ? el("label", { class: "ifd-name" }, el("span", { text: "File name" }), name) : null, list, status, pager);
      const job = { cancel: () => finish(null) }; pending = job;
      function finish(value) {
        if (closed) return; closed = true; episode++; listingRead?.abort(); controller.abort(); for (const child of children) child.now(); children.clear();
        for (const off of subscriptions.splice(0)) off();
        if (pending === job) pending = null;
        selection.clear(); name.value = search.value = ""; list.replaceChildren();
        handle?.now(); resolve(value);
      }
      for (const signal of [F.signal, requester.signal, options.signal].filter(Boolean)) {
        signal.addEventListener("abort", job.cancel, { once: true }); subscriptions.push(() => signal.removeEventListener("abort", job.cancel));
      }
      const ready = () => {
        choose.disabled = loading || committing || (mode === "save" ? !validSaveName(name.value) : !selection.size);
        search.disabled = committing; name.disabled = committing; newFolder.disabled = loading || committing || !!query;
        previous.disabled = loading || committing || page === 0; next.disabled = loading || committing || !answer?.cursor;
        list.setAttribute("aria-busy", String(loading));
        for (const button of list.querySelectorAll("button")) { button.disabled = button.dataset.eligible === "no"; button.setAttribute("aria-disabled", String(loading || committing || button.disabled)); }
      };
      function navigate(id) { if (!current() || committing) return; folderId = id; query = search.value = ""; page = 0; cursors = [null]; selection.clear(); refresh(); }
      function changePage(direction) {
        if (!current() || loading || committing || direction < 0 && !page || direction > 0 && !answer?.cursor) return;
        if (direction > 0) cursors[++page] = answer.cursor; else page--;
        selection.clear(); refresh();
      }
      function selected(item) {
        if (!current() || loading || committing) return;
        if (item.kind === "folder") return navigate(item.id);
        if (!acceptsFile(item, accept) || item.status !== "ready" || item.size > maxBytes) return;
        if (selection.has(item.key)) selection.delete(item.key);
        else {
          if (!multiple) selection.clear();
          if (selection.size >= maxFiles || [...selection.values()].reduce((n, value) => n + value.size, item.size) > maxBytes) { status.textContent = `Choose up to ${maxFiles} file${maxFiles === 1 ? "" : "s"}, ${fileSize(maxBytes)} in total.`; return; }
          selection.set(item.key, item);
        }
        draw();
      }
      function draw() {
        const focused = list.contains(document.activeElement) ? document.activeElement?.dataset?.fileKey : null;
        const root = F.ui.btn("My Drive", { small: true, run: () => navigate(null) });
        path.replaceChildren(root, ...(answer?.ancestors || []).map(item => F.ui.btn(item.name, { small: true, run: () => navigate(item.id) })), ...(folderId ? [el("span", { "aria-current": "page", text: text(answer?.folder?.name || "Folder") })] : []));
        list.replaceChildren(...(answer?.items || []).map(item => {
          const eligible = item.kind === "folder" || mode === "open" && item.status === "ready" && acceptsFile(item, accept) && item.size <= maxBytes;
          const button = el("button", { type: "button", class: "ifd-entry", data: { fileKey: item.key, eligible: eligible ? "yes" : "no" }, disabled: !eligible, "aria-disabled": String(!eligible || loading || committing), "aria-label": `${item.kind === "folder" ? "Open folder" : "Select"} ${text(item.name, 255)}`, ...(item.kind !== "folder" ? { "aria-pressed": String(selection.has(item.key)) } : {}), on: { click: () => selected(item) } }, F.ui.icon(item.kind === "folder" ? "folder" : "file"), el("span", {}, el("b", { text: text(item.name, 255) }), el("small", { text: item.kind === "folder" ? "Folder" : item.status !== "ready" ? "Uploading…" : fileSize(item.size) })), selection.has(item.key) ? F.ui.icon("check") : null);
          return el("div", { role: "listitem" }, button);
        }));
        ready();
        if (focused) list.querySelector(`[data-file-key="${CSS.escape(focused)}"]`)?.focus({ preventScroll: true });
      }
      async function refresh() {
        if (!current()) return; const mine = ++episode;
        listingRead?.abort(); const read = listingRead = new AbortController();
        const stop = () => read.abort(); controller.signal.addEventListener("abort", stop, { once: true });
        loading = true; status.textContent = "Loading…"; ready();
        try {
          const result = await service.browse({ kind: "drive", folderId, view: "folder" }, { query, cursor: cursors[page], foldersOnly: mode === "save", signal: read.signal, current: () => current() && mine === episode });
          if (!current() || mine !== episode) return;
          answer = result;
          const retained = new Map((result.items || []).map(item => [item.key, item]));
          for (const [key, item] of selection) if (retained.get(key)?.version !== item.version) selection.delete(key);
          loading = false; status.textContent = result.items.length ? `${selection.size ? `${selection.size} selected · ` : ""}${result.items.length} item${result.items.length === 1 ? "" : "s"}` : query ? "No matching files." : mode === "save" ? "Save in this folder, or create a new folder." : "No files in this folder yet."; draw();
        } catch (error) {
          if (!current() || mine !== episode) return;
          if (error?.status === 409 && page > 0) { page = 0; cursors = [null]; return refresh(); }
          loading = false; status.textContent = text(error?.message, 240) || "Files couldn’t load. Try again."; answer = null; list.replaceChildren(F.ui.btn("Try again", { run: refresh })); ready();
        } finally { controller.signal.removeEventListener("abort", stop); }
      }
      async function commit() {
        if (!current() || loading || committing || mode === "save" && !validSaveName(name.value) || mode === "open" && !selection.size) return;
        committing = true; ready(); status.textContent = mode === "save" ? "Saving…" : "Opening…";
        try {
          if (mode === "save") {
            const result = await service.save(file, { folderId, name: name.value, ...lease() });
            if (!current()) return finish(null);
            if (!result?.item?.id) throw new Error("The file wasn’t saved. Refresh to check before trying again.");
            finish({ id: result.item.id, name: result.item.name });
          } else {
            const values = []; let bytes = 0;
            for (const item of selection.values()) {
              const result = await service.read(item.key, { version: item.version, ...lease() });
              if (!current()) return finish(null);
              if (!(result?.file instanceof File) || !acceptsFile(result.file, accept) || (bytes += result.file.size) > maxBytes) throw new Error("Those files don’t match this app’s file limits.");
              values.push(result.file);
            }
            finish(values);
          }
        } catch (error) {
          if (!current()) return finish(null);
          committing = false; status.textContent = text(error?.message, 240) || "That didn’t finish. Refresh to check before trying again."; ready();
        }
      }
      async function createFolder() {
        if (!current() || loading || committing || query) return;
        const field = el("input", { type: "text", "aria-label": "Folder name", maxlength: 255, autocomplete: "off" });
        const message = el("p", { role: "status" }); let dialog;
        const create = F.ui.btn("Create folder", { primary: true, run: async () => {
          if (!current() || !validSaveName(field.value)) { message.textContent = "Enter a folder name."; return; }
          create.disabled = true;
          try { const result = await service.run(null, "create-folder", { input: { name: field.value, parentId: folderId }, ...lease() }); if (!current()) return; if (result?.ok === false) throw new Error(result.error); dialog.now(); refresh(); }
          catch (error) { if (current()) { message.textContent = text(error?.message, 240) || "The folder couldn’t be created."; create.disabled = false; } }
        } });
        field.addEventListener("keydown", event => { if (event.key === "Enter") { event.preventDefault(); create.click(); } });
        dialog = F.sheet.open({ sheet: "files-dialog-folder", title: "New folder", onClose: () => children.delete(dialog), body: el("div", { class: "ifd-form" }, el("label", {}, el("span", { text: "Folder name" }), field), message, create), focus: field }); children.add(dialog);
      }
      search.addEventListener("input", () => { if (committing) return; query = text(search.value, 160); page = 0; cursors = [null]; selection.clear(); refresh(); });
      name.addEventListener("input", ready);
      name.addEventListener("keydown", event => { if (event.key === "Enter") { event.preventDefault(); commit(); } });
      handle = F.sheet.open({ sheet: mode === "save" ? "files-save" : "files-open", title: text(options.title, 80) || (mode === "save" ? "Save to InFlite Files" : "Open from InFlite Files"), body, onClose: () => finish(null) });
      handle.el.append(el("footer", { class: "ifs-acts ifd-actions" }, cancel, choose));
      if (service.subscribe) subscriptions.push(service.subscribe(change => { if (current() && !committing && change.kind === "resources" && change.source?.kind === "drive") refresh(); }));
      refresh();
    });
  }
  async function fromDrop(dataTransfer, options = {}, requester = {}) {
    const token = dataTransfer?.getData?.("application/x-inflite-files-token");
    if (typeof token !== "string" || !/^[a-f0-9]{32}$/.test(token) || !service.resolveDrag) return null;
    const controller = new AbortController(), subscriptions = [];
    const current = () => alive() && !controller.signal.aborted && !requester.signal?.aborted && !options.signal?.aborted && safe(requester.current) && safe(options.current);
    const lease = { signal: controller.signal, current }, accept = fileAccept(options.accept);
    const maxBytes = Number.isSafeInteger(options.maxBytes) ? Math.max(0, Math.min(LIMIT, options.maxBytes)) : LIMIT;
    const maxFiles = Math.max(1, Math.min(100, Number.isSafeInteger(options.maxFiles) ? options.maxFiles : 100));
    const assert = () => { if (!current()) throw new DOMException("This file drop was released", "AbortError"); };
    const stop = () => controller.abort();
    for (const signal of [F.signal, requester.signal, options.signal].filter(Boolean)) {
      signal.addEventListener("abort", stop, { once: true }); subscriptions.push(() => signal.removeEventListener("abort", stop));
    }
    try {
      assert(); const items = await service.resolveDrag(token, lease); assert();
      if (!items?.length) return null;
      if (items.length > maxFiles || items.some(item => item.kind !== "file" || !acceptsFile(item, accept)) || items.reduce((total, item) => total + item.size, 0) > maxBytes) throw new Error("Choose supported files within this app’s file limit.");
      const files = []; let bytes = 0;
      for (const item of items) {
        const result = await service.read(item.key, { version: item.version, ...lease }); assert();
        if (!(result?.file instanceof File) || !acceptsFile(result.file, accept) || (bytes += result.file.size) > maxBytes) throw new Error("Those files don’t match this app’s file limits.");
        files.push(result.file);
      }
      return files;
    } finally { controller.abort(); for (const off of subscriptions) off(); }
  }
  const open = options => show("open", null, options);
  const save = (file, options) => show("save", file, options);
  function destroy() { if (dead) return; dead = true; pending?.cancel(); F.signal.removeEventListener("abort", destroy); }
  F.signal.addEventListener("abort", destroy, { once: true });
  return { open, save, fromDrop, destroy, forApp(app, requester = {}) {
    if (!["mail", "fitness", "chats", "markets", "weather", "calendar", "notes", "people"].includes(app)) throw new TypeError("A known app is required for Files dialogs.");
    return Object.freeze({ open: options => show("open", null, options, requester), save: (file, options) => show("save", file, options, requester), fromDrop: (dataTransfer, options) => fromDrop(dataTransfer, options, requester) });
  } };
}
