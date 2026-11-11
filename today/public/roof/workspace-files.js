// A bounded, account-lived metadata library. Content, keys and download URLs stay
// with the owning app. Global search reads RAM only; opening Files asks the apps.
import { loadStyles } from "./modules.js";

const APPS = new Set(["fitness", "weather", "markets", "chats", "mail"]), LIMIT = 100;
const STATES = new Set(["loading", "ready", "locked", "signin", "error"]);
const opaque = (v) => typeof v === "string" && /^[\w:-]{1,220}$/.test(v) ? v : null;
const text = (v, max) => typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max) : "";
const fold = (v) => String(v || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const queryText = (v) => text(v, 160);
export function normalizeWorkspaceFile(value, app) {
  if (!value || !APPS.has(app) || value.app !== app) return null;
  const id = opaque(value.id), objectId = opaque(value.objectId), intent = opaque(value.intent), name = text(value.name, 255);
  const mime = typeof value.mime === "string" && /^[\w.+-]+\/[\w.+-]+$/.test(value.mime) && value.mime.length <= 100 ? value.mime.toLowerCase() : "";
  if (!id || !objectId || !intent || !name || !mime) return null;
  const out = { id, app, name, mime, objectId, intent };
  if (["image", "audio", "document", "route", "workout"].includes(value.category)) out.category = value.category;
  for (const key of ["downloadIntent", "shareIntent"]) if (opaque(value[key])) out[key] = value[key];
  if (Number.isSafeInteger(value.size) && value.size >= 0) out.size = value.size;
  if (Number.isFinite(value.modifiedAt) && value.modifiedAt > 0) out.modifiedAt = value.modifiedAt;
  if (text(value.source, 140)) out.source = text(value.source, 140);
  return out;
}
const kind = (f) => f.category === "route" || /\.gpx$/i.test(f.name) || f.mime === "application/gpx+xml" ? "routes" : f.category === "workout" || /\.(fit|tcx|zwo|erg|mrc)$/i.test(f.name) ? "workouts" : f.category === "image" || f.mime.startsWith("image/") ? "images" : f.category === "audio" || f.mime.startsWith("audio/") ? "audio" : "documents";
export function filterWorkspaceFiles(files, { query = "", type = "all", source = "all", sort = "recent" } = {}) {
  const words = fold(queryText(query)).split(/\s+/).filter(Boolean);
  return files.filter((f) => (source === "all" || f.app === source) && (type === "all" || kind(f) === type) && words.every((w) => fold(f.name + " " + (f.source || "")).includes(w)))
    .sort((a, b) => (sort === "name" ? a.name.localeCompare(b.name) : sort === "size" ? (b.size || 0) - (a.size || 0) : (b.modifiedAt || 0) - (a.modifiedAt || 0)) || a.name.localeCompare(b.name));
}
const sizeText = (n) => n == null ? "" : n < 1024 ? `${n} B` : n < 1048576 ? `${Math.round(n / 1024)} KB` : `${(n / 1048576).toFixed(1)} MB`;

export function createWorkspaceFiles(F, { sources, load, runIntent, openApp }) {
  const owner = F.session.view?.user?.id, ui = F.ui, cache = new Map();
  let dead = false, handle = null, input, results, status, sourcePick, typePick, sortPick, debounce = 0, queryGen = 0, opGen = 0, q = "";
  const live = () => typeof owner === "string" && !!owner && !dead && !F.signal?.aborted && F.session.view?.user?.id === owner;
  const descriptors = () => {
    if (!live()) return [];
    try { return (sources() || []).filter((s) => s && APPS.has(s.app)).slice(0, APPS.size); } catch (_) { return []; }
  };
  const validFiles = (values, app) => {
    const seen = new Set();
    return (Array.isArray(values) ? values : []).slice(0, LIMIT).map((f) => normalizeWorkspaceFile(f, app)).filter((f) => f && !seen.has(f.id) && seen.add(f.id));
  };
  function sync() {
    const list = descriptors(), present = new Set(list.map((s) => s.app));
    for (const app of cache.keys()) if (!present.has(app)) cache.delete(app);
    for (const s of list) {
      const old = cache.get(s.app), blocked = s.status === "locked" || s.status === "signin";
      // A transient source publishes its entire currently eligible index. Chats
      // must release recalled media and the previous conversation immediately.
      if (s.transient === true) {
        const state = STATES.has(s.status) ? s.status : "loading";
        if (!old || old.sourceState !== state || state === "ready" && old.sourceFiles !== s.files) cache.set(s.app, { status: state, files: state === "ready" ? validFiles(s.files, s.app) : [], token: (old?.token || 0) + 1, more: false, query: "", loaded: true, pending: false, sourceState: state, sourceFiles: state === "ready" ? s.files : null });
      }
      else if (blocked) cache.set(s.app, { status: s.status, files: [], token: (old?.token || 0) + 1, more: false, query: q });
      else if (!old) cache.set(s.app, { status: STATES.has(s.status) ? s.status : "loading", files: validFiles(s.files, s.app), token: 0, query: "", loaded: false });
    }
    return list;
  }
  const allFiles = () => [...cache.values()].flatMap((s) => s.files || []);
  const clearSheet = () => { clearTimeout(debounce); queryGen++; handle = null; input = results = status = sourcePick = typePick = sortPick = null; };
  function close() { const h = handle; clearSheet(); h?.now?.(); }
  async function act(f, intent) {
    sync();
    const entry = cache.get(f.app), present = entry?.files?.some((x) => x.id === f.id && x.objectId === f.objectId && x[intent === f.intent ? "intent" : intent === f.downloadIntent ? "downloadIntent" : "shareIntent"] === intent);
    if (!live() || !present || ["locked", "signin"].includes(entry.status)) return;
    const mine = ++opGen, current = () => live() && mine === opGen;
    // Closing our own dialog is presentation housekeeping, not cancellation.
    close();
    try { const answer = await runIntent(f.app, intent, f.objectId, { current }); if (current() && answer?.ok === false && answer.error) F.toast(text(answer.error, 240)); }
    catch (_) { if (current()) F.toast("That file didn’t open. Try again in its app."); }
  }
  async function addFiles() {
    if (!live() || !descriptors().some((s) => s.app === "fitness")) return;
    const mine = ++opGen, current = () => live() && mine === opGen;
    close();
    try { const answer = await runIntent("fitness", "import-files", undefined, { current }); if (current() && answer?.ok === false && answer.error) F.toast(text(answer.error, 240)); }
    catch (_) { if (current()) F.toast("Open Fitness to add your files."); }
  }
  function gate(app) { if (!live() || !descriptors().some((s) => s.app === app)) return; opGen++; close(); openApp(app); }
  function draw() {
    if (!live() || !handle || !results) return;
    const list = sync(), previous = sourcePick.value, keys = list.map((s) => s.app).join(":");
    if (sourcePick.dataset.sources !== keys) {
      sourcePick.replaceChildren(ui.el("option", { value: "all", text: "All apps" }), ...list.map((s) => ui.el("option", { value: s.app, text: text(s.name || s.app, 40) })));
      sourcePick.value = list.some((s) => s.app === previous) ? previous : "all"; sourcePick.dataset.sources = keys;
    }
    const selected = sourcePick.value, filtered = filterWorkspaceFiles(allFiles(), { query: q, type: typePick.value, source: selected, sort: sortPick.value });
    const shownSources = list.filter((s) => selected === "all" || s.app === selected);
    status.replaceChildren();
    for (const s of shownSources) {
      const item = cache.get(s.app), state = item?.status || "loading", name = text(s.name || s.app, 40);
      if (state === "ready" && !item.more) continue;
      const message = state === "loading" ? `Loading ${name}…` : state === "locked" ? `Unlock ${name} to see its files.` : state === "signin" ? `Sign in to ${name} to see its files.` : state === "error" ? `${name} files couldn’t be loaded.` : `${name}: showing recent files. Search to narrow the list.`;
      const line = ui.el("div", { class: "ifl-files-source", data: { source: s.app, state } }, ui.el("span", { text: message }));
      if (["locked", "signin"].includes(state)) line.append(ui.btn(state === "locked" ? "Unlock" : "Sign in", { small: true, run: () => gate(s.app) }));
      if (state === "error") line.append(ui.btn("Try again", { small: true, run: () => fetchSource(s.app, q, queryGen) }));
      status.append(line);
    }
    results.replaceChildren();
    results.setAttribute("aria-busy", String(shownSources.some((s) => cache.get(s.app)?.status === "loading")));
    for (const f of filtered) {
      const row = ui.el("article", { class: "ifl-files-item", data: { file: f.id, app: f.app } });
      const sub = [f.source || list.find((s) => s.app === f.app)?.name || f.app, sizeText(f.size)].filter(Boolean).join(" · ");
      row.append(ui.row({ lead: { app: f.app }, title: f.name, sub, trail: "chevron", run: () => act(f, f.intent), label: `Open ${f.name}` }));
      if (f.downloadIntent || f.shareIntent) {
        const actions = ui.el("div", { class: "ifl-files-actions" });
        if (f.downloadIntent) actions.append(ui.btn("Download", { small: true, icon: "download", label: `Download ${f.name}`, run: () => act(f, f.downloadIntent) }));
        if (f.shareIntent) actions.append(ui.btn("Share", { small: true, label: `Share ${f.name}`, run: () => act(f, f.shareIntent) }));
        row.append(actions);
      }
      results.append(row);
    }
    if (!filtered.length) results.append(ui.el("p", { class: "ifl-files-empty", text: shownSources.some((s) => cache.get(s.app)?.status === "loading") ? "Your files will appear here." : q ? `No files match “${q}”.` : "No files to show yet. Files stay in the apps where you added them." }));
    const count = ui.el("p", { class: "ifl-files-count", text: `${filtered.length} ${filtered.length === 1 ? "file" : "files"}` });
    results.prepend(count);
  }
  async function fetchSource(app, query, generation) {
    const list = sync(), source = list.find((s) => s.app === app), old = cache.get(app);
    if (!live() || !handle || !source || ["locked", "signin"].includes(source.status)) return;
    if (source.transient === true && source.status === "ready") { draw(); return; }
    const token = (old?.token || 0) + 1, current = () => live() && !!handle && generation === queryGen && cache.get(app)?.token === token;
    cache.set(app, { ...old, token, status: "loading", pending: true, query, files: old?.query === query ? old.files : [] }); draw();
    try {
      const answer = await load(app, query, current);
      if (!current()) return;
      const latest = descriptors().find((s) => s.app === app);
      if (!latest || ["locked", "signin"].includes(latest.status)) { sync(); draw(); return; }
      const state = STATES.has(answer?.status) ? answer.status : "error";
      cache.set(app, { token, query, loaded: true, pending: false, status: state, more: answer?.more === true || Array.isArray(answer?.files) && answer.files.length > LIMIT, files: ["locked", "signin"].includes(state) ? [] : validFiles(answer?.files, app) });
    } catch (_) { if (current()) cache.set(app, { ...cache.get(app), status: "error", pending: false, loaded: true }); }
    if (current()) draw();
  }
  function fetchAll() { const mine = queryGen; for (const s of sync()) fetchSource(s.app, q, mine); }
  function select(label, options, change) {
    const node = ui.el("select", { "aria-label": label, on: { change } });
    for (const [value, title] of options) node.append(ui.el("option", { value, text: title }));
    return ui.el("label", { class: "ifl-files-filter" }, ui.el("span", { text: label }), node);
  }
  function open(query = "") {
    if (!live()) return;
    opGen++; close(); q = queryText(query); sync();
    loadStyles("/roof/workspace-files.css").catch(() => {});
    input = ui.el("input", { type: "search", value: q, placeholder: "Search your files", maxlength: 160, "aria-label": "Search files", autocomplete: "off", on: { input: () => {
      q = queryText(input.value); queryGen++; draw(); clearTimeout(debounce); debounce = setTimeout(fetchAll, 300);
    } } });
    const source = select("App", [["all", "All apps"], ...descriptors().map((s) => [s.app, text(s.name || s.app, 40)])], draw);
    const type = select("Type", [["all", "All types"], ["routes", "Routes"], ["workouts", "Workouts"], ["images", "Images"], ["audio", "Audio"], ["documents", "Documents"]], draw);
    const sort = select("Sort", [["recent", "Recent first"], ["name", "Name"], ["size", "Largest first"]], draw);
    sourcePick = source.querySelector("select"); typePick = type.querySelector("select"); sortPick = sort.querySelector("select");
    status = ui.el("div", { class: "ifl-files-status", "aria-live": "polite" }); results = ui.el("div", { class: "ifl-files-results" });
    const body = ui.el("div", { class: "ifl-files" }, input, ui.el("div", { class: "ifl-files-filters" }, source, type, sort), descriptors().some((s) => s.app === "fitness") ? ui.btn("Add files to Fitness", { small: true, run: addFiles }) : null, status, results);
    handle = F.sheet.open({ sheet: "workspace-files", title: "Files", focus: input, body, onClose: clearSheet });
    draw(); fetchAll();
    return handle;
  }
  function update(app) {
    if (!live()) { destroy(); return; }
    const was = new Map([...cache].map(([id, s]) => [id, s.status]));
    const list = sync(); draw();
    if (handle) for (const s of list) if ((!app || app === s.app) && was.get(s.app) === "loading" && s.status === "ready" && cache.get(s.app)?.loaded && !cache.get(s.app)?.pending) fetchSource(s.app, q, queryGen);
  }
  async function search(query) {
    if (!live()) { cache.clear(); return []; }
    sync(); const typed = queryText(query); if (!typed) return [];
    const found = filterWorkspaceFiles(allFiles(), { query: typed }).slice(0, 15).map((f) => ({ app: f.app, title: f.name, sub: [f.source, "Files"].filter(Boolean).join(" · "), icon: f.app, run: () => act(f, f.intent) }));
    found.push({ app: null, title: `Find “${typed}” in Files`, sub: "Routes, workouts and attachments from your apps", icon: "fitness", run: () => open(typed) });
    return found;
  }
  function destroy() { if (dead) return; dead = true; opGen++; close(); cache.clear(); F.signal?.removeEventListener("abort", destroy); }
  F.signal?.addEventListener("abort", destroy, { once: true });
  if (F.signal?.aborted) destroy();
  return { open, search, update, changed: update, destroy };
}
