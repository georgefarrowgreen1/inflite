// A bounded, account-lived metadata library. Content, keys and download URLs stay
// with the owning app. Global search reads RAM only; opening Files asks the apps.
import { loadStyles } from "./modules.js";

import { createAppFilesIndex } from "./files-apps.js";
import { fileText as text, fileQuery as queryText, normalizeWorkspaceFile, filterWorkspaceFiles } from "./files-metadata.js";
export { normalizeWorkspaceFile, filterWorkspaceFiles };
const sizeText = (n) => n == null ? "" : n < 1024 ? `${n} B` : n < 1048576 ? `${Math.round(n / 1024)} KB` : `${(n / 1048576).toFixed(1)} MB`;

export function createWorkspaceFiles(F, options = {}) {
  const { sources, load, runIntent, openApp } = options;
  const owner = F.session.view?.user?.id, ui = F.ui, cache = new Map(), rows = new Map(), pending = new Set();
  let dead = false, handle = null, input, results, status, sourcePick, typePick, sortPick, debounce = 0, queryGen = 0, opGen = 0, q = "";
  const live = () => typeof owner === "string" && !!owner && !dead && !F.signal?.aborted && F.session.view?.user?.id === owner;
  const owned = !options.index, index = options.index || createAppFilesIndex(F, { sources, load, runIntent, openApp, onFind: query => open(query) });
  function sync() {
    const list = index.snapshot(), present = new Set(list.map(s => s.app)), eligible = new Set(index.retain([...rows.values()].flatMap(row => row.files))); cache.clear();
    for (const app of rows.keys()) if (!present.has(app)) rows.delete(app);
    for (const source of list) {
      const local = rows.get(source.app), current = local && local.files.filter(file => eligible.has(file));
      const stale = local && current.length !== local.files.length;
      cache.set(source.app, ["locked", "signin"].includes(source.status) || !local || local.query !== q || stale ? source : { ...source, ...local, files: current });
    }
    return list;
  }
  const descriptors = () => sync();
  const allFiles = () => [...cache.values()].flatMap((s) => s.files || []);
  const clearSheet = () => { clearTimeout(debounce); queryGen++; handle = null; input = results = status = sourcePick = typePick = sortPick = null; };
  function close() { const h = handle; clearSheet(); h?.now?.(); }
  async function act(f, intent) {
    sync();
    const entry = cache.get(f.app), present = entry?.files?.some(x => x === f && [x.intent, x.downloadIntent, x.shareIntent].includes(intent));
    if (!live() || !present || ["locked", "signin"].includes(entry.status)) return;
    const mine = ++opGen, current = () => live() && mine === opGen;
    close();
    const answer = await index.run(f, intent, { current });
    if (current() && answer?.ok === false && answer.error) F.toast?.(text(answer.error, 240));
  }
  async function addFiles() {
    if (!live() || !descriptors().some((s) => s.app === "fitness")) return;
    const mine = ++opGen, current = () => live() && mine === opGen;
    close();
    try { const answer = await runIntent("fitness", "import-files", undefined, { current }); if (current() && answer?.ok === false && answer.error) F.toast(text(answer.error, 240)); }
    catch (_) { if (current()) F.toast("Open Fitness to add your files."); }
  }
  function gate(app) { if (!live()) return; opGen++; close(); index.gate(app); }
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
  async function fetchSource(app, query, generation, refresh = true) {
    const current = () => live() && !!handle && generation === queryGen;
    if (!current()) return;
    pending.add(app);
    try {
      const answer = await index.read({ app, query, current, refresh });
      if (current() && answer.sources[0]) rows.set(app, { ...answer.sources[0], query });
    } catch (_) {} finally { pending.delete(app); if (current()) draw(); }
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
    index.update(app); draw();
  }
  async function search(query) { if (!live()) return []; return index.search(query); }
  const off = index.subscribe(() => {
    if (!live()) return destroy();
    const list = sync(); draw();
    if (handle) for (const source of list) if (source.status === "ready" && rows.get(source.app)?.status === "loading" && !pending.has(source.app)) fetchSource(source.app, q, queryGen, false);
  });
  function destroy() { if (dead) return; dead = true; opGen++; close(); rows.clear(); cache.clear(); off(); if (owned) index.destroy(); F.signal?.removeEventListener("abort", destroy); }
  F.signal?.addEventListener("abort", destroy, { once: true });
  if (F.signal?.aborted) destroy();
  return { open, search, update, changed: app => { index.changed(app); update(app); }, destroy };
}
