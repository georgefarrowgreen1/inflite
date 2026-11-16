// Unified InFlite shell: singleton apps, Files and account-scoped actions.
// Saved workspaces are retired; existing records are never read or changed.
import { REGISTRY, format } from "./router.js";
import { loadStyles } from "./modules.js";
import { createWorkspaceView } from "./workspace-view.js";
import { WORKSPACE_APPS, getWorkspaceApp, safeWorkspaceRoute } from "./workspace-catalog.js";
import { createWorkspaceCommands, notificationActions } from "./workspace-commands.js";
import { createFilesService } from "./files-service.js";
import { safeFilesLocation } from "./files-location.js";
import { createFilesDialogs } from "./files-dialogs.js";
import { createActivityRegistry, createWorkspaceActivity } from "./workspace-activity.js";
import { createWorkspaceRecovery } from "./workspace-recovery.js";
import { createWorkspaceRecoveryView } from "./workspace-recovery-view.js";

export const WORKSPACE_VERSION = 2;
const EMPTY_CONTEXT = Object.freeze({ location: null, interval: null });
const retiredContextAction = (app, id) => app === "fitness" && id === "weather-for-ride" || app === "weather" && ["use-place", "window"].includes(id);
const guarded = (fn, fallback) => { try { return fn(); } catch (_) { return fallback; } };

export async function createWorkspace(F, options = {}) {
  await loadStyles("/roof/workspace.css");
  if (F.signal.aborted) throw new DOMException("This account was released", "AbortError");
  const { root, today } = options, owner = F.session.view?.user?.id;
  if (!root || !today || !owner) throw new Error("InFlite needs a signed-in owner");
  const html = document.documentElement, originalTitle = document.title;
  html.classList.add("ifl-os");
  const anchor = document.createComment("Today returns here when the shell closes");
  today.before(anchor);
  const handles = new Map(), providers = new Map(), snapshots = new Map(), offs = [], pending = new Set();
  const backgroundSlots = new Map();
  const recentApps = new Map();
  const background = F.ui.el("div", { hidden: true, inert: true, "aria-hidden": "true" });
  options.dockRoot?.append(background);
  let files = null, commands = null, dialogs = null, recovery = null, recoveryView = null;
  let explorer = null, explorerLoad = null, filesLocation = safeFilesLocation({ kind: "drive" }), pendingFilesQuery = null;
  let shown = false, gone = false, route = null, scene = 0, paintPending = false;
  const live = () => !gone && !F.signal.aborted && F.session.view?.user?.id === owner;
  const activity = createActivityRegistry(F), activityView = createWorkspaceActivity(F, { registry: activity });
  const fileActivity = activity.source("files", { current: live, signal: F.signal });
  recovery = createWorkspaceRecovery(F, { getHandle: app => handles.get(app), retry: retryApp,
    activity: activity.source("recovery", { current: live, signal: F.signal }), onChange: () => { paintNativeRecovery(); paint(); } });
  recoveryView = createWorkspaceRecoveryView(F, recovery);
  const loadApp = (app, handle, lease = {}) => recovery.load(app, async () => {
    const instance = await handle.load();
    if (!live() || lease.signal?.aborted || !guarded(() => !lease.current || lease.current(), false)) return null;
    await instance?.workspace?.(); return instance;
  }, lease);
  const appOn = (app) => !!F.session.apps?.[app] && (app !== "mail" || F.session.view?.apps?.mail === true);
  function capability(app, signal) {
    const usable = () => live() && appOn(app) && !signal.aborted;
    return Object.freeze({
      enabled: true,
      get files() { return usable() ? dialogs?.forApp(app, { current: usable, signal }) || null : null; },
      active: () => usable() && document.visibilityState === "visible" && !!handles.get(app)?.fw.visible() && F.route?.kind === "app" && F.route.app === app,
      provide(provider) {
        if (!usable() || !provider || typeof provider.snapshot !== "function" || typeof provider.run !== "function") return () => {};
        const entry = { provider, signal, epoch: 0 }; providers.set(app, entry); refreshProvider(app);
        return () => { if (providers.get(app) === entry) { providers.delete(app); snapshots.delete(app); paint(); } };
      },
      changed: () => { if (usable()) queueProvider(app); },
      context: Object.freeze({ get: () => EMPTY_CONTEXT, capture: () => usable, subscribe: () => () => {}, update: () => false }),
    });
  }
  function acquire(app) {
    let handle = handles.get(app);
    if (!handle || handle.signal.aborted) {
      handle = F.view(app); handles.set(app, handle); handle.fw.workspace ||= capability(app, handle.signal);
    }
    return handle;
  }
  for (const app of WORKSPACE_APPS.filter((a) => a.pane)) acquire(app.id);
  const view = createWorkspaceView(root, {
    onToday: () => F.nav.go("/", { resume: true }), onApp: (app) => openApp(app),
    onRecent: app => { if (live() && appOn(app)) openApp(app); },
    onAppDrop: (app, token) => { if (live() && ["mail", "fitness"].includes(app) && /^[a-f0-9]{32}$/.test(token)) return runIntent(app, app === "mail" ? "compose-attach" : "import-drive", "drop:" + token); },
    onSearch: () => F.search.open(), onApps: () => openApps(),
    onNotifications: options.onNotifications, onAccount: options.onAccount, onSettings: options.onSettings,
    onFiles: () => openFiles(),
    onActivity: () => activityView.open(), onRecovery: () => recoveryView.open(),
  });
  // Chrome has one account-owned home outside animated page containers.
  // Keep the dock mounted here through Today, Files and native app navigation.
  (options.dockRoot || root.ownerDocument.body).append(view.dock);
  // Full-screen composers and keyboards retain the native app's chrome policy.
  const nativeAway = F.tabs.away;
  const dockAway = (value) => {
    nativeAway?.(value);
    view.dock.querySelector(".ws-dock").hidden = !!value;
    html.toggleAttribute("data-os-dock-away", !!value);
  };
  F.tabs.away = dockAway;
  dockAway(!!document.getElementById("tabs")?.classList.contains("away"));
  const restoreToday = () => { if (anchor.parentNode && today.parentNode !== anchor.parentNode) anchor.parentNode.insertBefore(today, anchor.nextSibling); };
  function queueProvider(app) {
    if (pending.has(app)) return;
    pending.add(app); queueMicrotask(() => { pending.delete(app); if (live()) refreshProvider(app); });
  }
  async function refreshProvider(app) {
    const entry = providers.get(app);
    if (!entry || !live() || !appOn(app) || entry.signal.aborted) return;
    const epoch = ++entry.epoch;
    try {
      const snapshot = await entry.provider.snapshot();
      if (!live() || !appOn(app) || entry.signal.aborted || providers.get(app) !== entry || entry.epoch !== epoch) return;
      snapshots.set(app, snapshot || null);
    } catch (_) { if (live() && appOn(app) && !entry.signal.aborted && providers.get(app) === entry && entry.epoch === epoch) snapshots.set(app, { status: "error", actions: [], files: [] }); }
    if (live()) { recovery.update(app, snapshots.get(app)?.status); files?.update?.(); files?.changed?.(app); paint(); }
  }
  function paint() {
    if (!live() || paintPending) return;
    paintPending = true;
    queueMicrotask(() => {
      paintPending = false; if (!live()) return;
      const user = F.session.view?.user || {};
      view.update({ mode: F.route?.kind === "app" ? "app" : shown && route?.tool === "files" ? "files" : "today", activeApp: F.route?.app, workspaces: [],
        apps: WORKSPACE_APPS.map((a) => ({ ...a, available: appOn(a.id) })), user: { name: user.name || "", photo: user.photoAt && /^[\w-]{8,64}$/.test(owner) ? `/api/avatar?id=${encodeURIComponent(owner)}&v=${encodeURIComponent(String(user.photoAt))}` : null }, notifications: options.notifications?.() || 0,
        unifiedHome: true, online: recovery.snapshot().online, activityCount: activityView.count(),
        greeting: `${new Date().getHours() < 12 ? "Good morning" : new Date().getHours() < 18 ? "Good afternoon" : "Good evening"}${F.session.view?.user?.name ? ", " + String(F.session.view.user.name).trim().split(/\s+/)[0] : ""}`,
        recentApps: [...recentApps.keys()].reverse().filter(appOn).map(app => ({ app })), recentActivity: activity.snapshot().slice(0, 3),
        subtitle: guarded(() => new Intl.DateTimeFormat(undefined, { weekday: "long", day: "numeric", month: "long" }).format(new Date()), ""), title: "Today" });
    });
  }
  async function loadFiles(app, query, callerCurrent = () => true) {
    const valid = () => live() && appOn(app) && callerCurrent();
    if (!valid() || !getWorkspaceApp(app)) return { status: "error", files: [] };
    const handle = acquire(app);
    if (!handle.el.isConnected || handle.el.hidden) {
      if (!backgroundSlots.has(app)) { const slot = F.ui.el("div"); background.append(slot); backgroundSlots.set(app, slot); }
      handle.attach({ container: backgroundSlots.get(app), workspace: handle.fw.workspace, navigate() {}, back() {}, section() {}, header() {}, fill() {} });
    }
    const instance = await loadApp(app, handle, { current: valid });
    if (!instance) return { status: "error", files: [] };
    if (!valid() || handle.signal.aborted) return { status: "error", files: [] };
    const entry = providers.get(app);
    const current = () => valid() && !handle.signal.aborted && providers.get(app) === entry;
    if (!current() || !entry) return { status: "loading", files: [] };
    const value = typeof entry.provider.files === "function" ? await entry.provider.files({ query, current }) : { status: "ready", files: snapshots.get(app)?.files || [] };
    return current() ? value : { status: "error", files: [] };
  }
  function paintNativeRecovery() {
    if (!live() || F.route?.kind !== "app" || !recovery) return;
    const app = F.route.app, handle = handles.get(app), status = recovery.snapshot().apps.find(item => item.app === app);
    if (!handle || handle.build || status?.loaded || status?.phase !== "error" || status.pending || handle.root.querySelector("[data-os-recovery-error]")) return;
    const body = F.ui.error({ title: `${REGISTRY[app].name} couldn’t open`, body: "Try again without closing your other apps.", acts: [{ label: "Try again", run: () => recovery.recover(app) }] });
    body.dataset.osRecoveryError = app; handle.root.replaceChildren(body);
  }
  async function retryApp(app, lease = {}) {
    const expected = F.route, episode = scene;
    const valid = () => live() && !lease.signal?.aborted && guarded(() => !lease.current || lease.current(), false) && F.route === expected && scene === episode;
    if (!valid() || !appOn(app)) return false;
    const handle = acquire(app);
    if (handle.busy()) return { ok: false, error: `Finish editing in ${REGISTRY[app].name} before refreshing it.` };
    return !!await openApp(app, null, false, true, lease);
  }
  function nativeReady(app, expected, lease = {}) {
    const handle = handles.get(app);
    return new Promise(resolve => {
      let frame = 0, done = false, offRoute = () => {};
      const finish = value => { if (done) return; done = true; cancelAnimationFrame(frame); clearTimeout(timer); offRoute(); F.signal.removeEventListener("abort", stop); lease.signal?.removeEventListener("abort", stop); resolve(value); };
      const stop = () => finish(false), valid = () => live() && !handle?.signal.aborted && !lease.signal?.aborted && guarded(() => !lease.current || lease.current(), false) && F.route === expected;
      const check = () => { if (!valid()) return finish(false); if (handle?.ready(expected) && handle.el.isConnected && !handle.el.hidden && !handle.el.inert && !handle.el.classList.contains("ifl-pane-screen") && handle.fw.workspace.active()) return finish(true); frame = requestAnimationFrame(check); };
      const timer = setTimeout(stop, 5000);
      F.signal.addEventListener("abort", stop, { once: true }); lease.signal?.addEventListener("abort", stop, { once: true });
      offRoute = F.on("route", () => { if (F.route !== expected) stop(); }); check();
    });
  }
  async function openApp(app, destination = null, expand = false, wake = false, lease = {}) {
    const manifest = getWorkspaceApp(app); if (!live() || !manifest || !appOn(app)) return null;
    const path = destination || recentApps.get(app) || manifest.href;
    F.nav.go(path, { ...(wake ? { kind: "section" } : {}), resume: !destination && !wake });
    const expected = F.route, handle = handles.get(app);
    if (expected?.kind !== "app" || expected.app !== app) return null;
    try { if (handle) {
      const instance = await loadApp(app, handle, { ...lease, current: () => live() && F.route === expected && guarded(() => !lease.current || lease.current(), false) });
      if (!instance) return null;
    }
    return live() && F.route === expected && await nativeReady(app, expected, lease) ? expected : null;
    } catch (_) { return null; }
  }
  function providerReady(app, current, signal) {
    return new Promise(resolve => {
      let poll, deadline, done = false;
      const finish = value => { if (done) return; done = true; clearTimeout(poll); clearTimeout(deadline); F.signal.removeEventListener("abort", stop); signal?.removeEventListener("abort", stop); resolve(value); };
      const stop = () => finish(false);
      const check = () => {
        if (!current()) return stop();
        if (snapshots.has(app) && snapshots.get(app)?.status !== "loading") return finish(true);
        poll = setTimeout(check, 50);
      };
      F.signal.addEventListener("abort", stop, { once: true }); signal?.addEventListener("abort", stop, { once: true });
      queueProvider(app); deadline = setTimeout(stop, 8000); poll = setTimeout(check, 0);
    });
  }
  async function runIntent(app, intent, objectId, { current: callerCurrent = () => true, signal } = {}) {
    if (!live() || signal?.aborted || !callerCurrent() || !appOn(app) || retiredContextAction(app, intent)) return false;
    let expectedRoute = F.route;
    if (!providers.has(app) || !handles.get(app)?.fw.workspace.active()) {
      expectedRoute = await openApp(app, format({ app }), true, true, { current: callerCurrent, signal });
      if (!expectedRoute || !callerCurrent()) return false;
    }
    if (!await nativeReady(app, expectedRoute, { current: callerCurrent, signal })) return false;
    const entry = providers.get(app), epoch = scene;
    if (!entry || !live() || signal?.aborted || !callerCurrent() || F.route !== expectedRoute || !handles.get(app)?.fw.workspace.active()) return false;
    const ownsAction = () => live() && !signal?.aborted && callerCurrent() && !entry.signal.aborted && providers.get(app) === entry && epoch === scene && F.route === expectedRoute && handles.get(app)?.fw.workspace.active();
    if (!await providerReady(app, ownsAction, signal)) { if (ownsAction()) F.toast(`${REGISTRY[app].name} is still opening. Try again in a moment.`); return false; }
    try {
      const result = await entry.provider.run(intent, objectId, { current: ownsAction, signal });
      if (!ownsAction()) return false;
      if (result?.error) F.toast(result.error);
      queueProvider(app); return result;
    } catch (_) { if (ownsAction()) F.toast("That action couldn’t finish. Try again."); return false; }
  }
  function navigateFiles(next, { query, resume = false } = {}) {
    next = safeFilesLocation(next);
    if (!live() || !next) return false;
    const path = format({ tab: "workspace", tool: "files", folder: next.kind === "drive" && next.view === "folder" ? next.folderId : null });
    const prefill = typeof query === "string" ? { query: query.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 160), location: JSON.stringify(next), route: null } : null;
    pendingFilesQuery = prefill;
    const replace = F.route?.tool === "files" && JSON.stringify(filesLocation) === JSON.stringify(next);
    F.nav.go(path, { kind: "section", replace, resume, state: { files: { userId: owner, location: next } } });
    if (prefill && pendingFilesQuery === prefill) prefill.route = F.route;
    return true;
  }
  const openFiles = (query = null, location = null) => {
    const destination = location === null ? query === null ? filesLocation : { kind: "drive", folderId: null, view: "folder" } : safeFilesLocation(location);
    return destination ? navigateFiles(destination, { query, resume: query === null && location === null }) : false;
  };
  function filesLocationAt(r) {
    const direct = safeFilesLocation({ kind: "drive", folderId: r?.folder || null });
    if (r?.folder) return direct;
    const saved = history.state?.files;
    const kept = saved?.userId === owner ? safeFilesLocation(saved.location) : null;
    return kept && !(kept.kind === "drive" && kept.folderId) ? kept : direct;
  }
  function loadExplorer() {
    if (!explorerLoad) explorerLoad = Promise.all([import("./files-explorer.js"), loadStyles("/roof/files-view.css")]).then(([m]) => {
      if (!live()) return null;
      explorer = m.createFilesExplorer(view.slots.files, F, { service: files, onNavigate: next => navigateFiles(next), onChanged() {} });
      explorer.hide(); return explorer;
    }).catch(error => { explorerLoad = null; throw error; });
    return explorerLoad;
  }
  async function showFiles(nextRoute, episode) {
    filesLocation = filesLocationAt(nextRoute);
    const pending = pendingFilesQuery;
    const prefill = pending && (!pending.route || pending.route === nextRoute) && pending.location === JSON.stringify(filesLocation) ? pending.query : undefined;
    pendingFilesQuery = null;
    restoreToday(); today.hidden = true; today.inert = true;
    if (!explorer) {
      view.slots.files.hidden = false; view.slots.files.inert = false;
      view.slots.files.replaceChildren(F.ui.el("p", { role: "status", text: "Opening InFlite Files…" }));
    }
    paint();
    const active = () => live() && shown && route === nextRoute && F.route === nextRoute && scene === episode;
    if (active()) document.title = "InFlite Files — InFlite";
    try {
      const host = await loadExplorer();
      if (!active() || !host) return false;
      host.show(filesLocation, prefill === undefined ? {} : { query: prefill });
      document.title = "InFlite Files — InFlite";
      if (prefill) host.focusSearch?.();
      return true;
    } catch (_) {
      if (active()) {
        view.slots.files.hidden = false; view.slots.files.inert = false;
        view.slots.files.replaceChildren(F.ui.error({ title: "Files couldn’t open", body: "Try again to open InFlite Files.", acts: [{ label: "Try again", run: () => { if (active()) show(nextRoute); } }] }));
      }
      return false;
    }
  }
  function openApps() {
    if (!live()) return;
    let menu;
    const body = view.launcher(() => menu?.now());
    menu = F.sheet.open({ sheet: "workspace-apps", title: "Your apps", body });
  }
  async function show(nextRoute) {
    if (!live()) return false;
    // Old saved-layout bookmarks return home without touching saved records.
    if (nextRoute?.arg && nextRoute.tool !== "files") { F.nav.go("/", { replace: true, kind: "section" }); return false; }
    explorer?.hide(); route = nextRoute; shown = true; const episode = ++scene;
    html.classList.add("ifl-os", "os-workspace");
    view.slots.sidebarAnchor.append(view.sidebar);
    if (nextRoute?.tool === "files") return showFiles(nextRoute, episode);
    pendingFilesQuery = null;
    view.slots.today.append(today); today.hidden = false; today.inert = false;
    options.onTodayShow?.(); paint(); document.title = "Today — InFlite";
    return true;
  }
  function hide() {
    if (!live()) return;
    explorer?.hide(); pendingFilesQuery = null;
    shown = false; ++scene; html.classList.remove("os-workspace");
    restoreToday();
    view.dock.prepend(view.sidebar);
  }
  function destroy() {
    if (gone) return;
    gone = true; ++scene;
    for (const off of offs.splice(0)) off();
    explorer?.destroy(); dialogs?.destroy(); recoveryView?.destroy(); recovery?.destroy(); activityView.destroy(); activity.destroy(); pendingFilesQuery = null;
    providers.clear(); snapshots.clear(); recentApps.clear(); files?.destroy(); commands?.destroy(); background.remove();
    restoreToday(); anchor.remove(); view.destroy(); html.classList.remove("ifl-os", "os-workspace"); html.removeAttribute("data-os-dock-away"); document.title = originalTitle;
    if (F.tabs.away === dockAway) F.tabs.away = nativeAway;
    const state = history.state;
    if (state?.workspace?.userId === owner || state?.files?.userId === owner) { const clean = { ...state }; if (state.workspace?.userId === owner) delete clean.workspace; if (state.files?.userId === owner) delete clean.files; guarded(() => history.replaceState(clean, "")); }
    F.signal.removeEventListener("abort", destroy);
  }
  F.signal.addEventListener("abort", destroy, { once: true });
  const activate = async (r) => {
    if (r?.kind !== "app" || !handles.has(r.app) || !live()) return;
    const handle = handles.get(r.app), instance = await loadApp(r.app, handle, { current: () => live() && F.route === r });
  };
  offs.push(F.on("apps", () => {
    for (const app of handles.keys()) {
      if (appOn(app)) { acquire(app); queueProvider(app); }
      else { handles.get(app).hide({ detach: true }); snapshots.delete(app); }
    }
    files?.update?.(); paint();
  }), F.on("changed", (app) => queueProvider(app)), F.on("visible", () => { for (const app of providers.keys()) queueProvider(app); }), F.on("route", (r) => {
    if (r.kind === "app") { document.title = `${REGISTRY[r.app].name} — InFlite`; recentApps.delete(r.app); recentApps.set(r.app, safeWorkspaceRoute(r.app, format(r)) || getWorkspaceApp(r.app)?.href); }
    paint(); activate(r).catch(() => {});
  }));
  files = createFilesService(F, {
    activity: fileActivity,
    sources: () => WORKSPACE_APPS.filter(a => ["fitness", "mail", "chats", "markets"].includes(a.id) && appOn(a.id)).map(a => ({ app: a.id, name: a.name, transient: a.id === "chats", status: snapshots.get(a.id)?.status || (snapshots.get(a.id)?.loading ? "loading" : providers.has(a.id) ? "ready" : "loading"), files: snapshots.get(a.id)?.files || [] })),
    load: loadFiles, runIntent, openApp, openExplorer: openFiles,
  });
  dialogs = createFilesDialogs(F, { service: files });
  offs.push(activity.subscribe(paint));
  if (F.systemTasks?.register) offs.push(F.systemTasks.register(files, { signal: F.signal }));
  commands = createWorkspaceCommands(F, {
    apps: () => WORKSPACE_APPS.map(a => ({ ...a, available: appOn(a.id) })),
    files: q => files.search(q), actions: () => [...snapshots].flatMap(([app, snapshot]) => (snapshot?.actions || []).filter(action => !retiredContextAction(app, action.id)).map(action => ({ app, ...action }))),
    runIntent, openApp, openFiles, fileDialogsAvailable: () => live() && !!dialogs,
    systemActions: () => [
      { id: "open-activity", label: "Open Activity", detail: "Uploads, downloads and background tasks", keywords: ["transfers", "progress"], current: live, run: () => activityView.open() },
      { id: "open-recovery", label: "Open App status", detail: "Connection and recovery", keywords: ["offline", "recover"], current: live, run: () => recoveryView.open() },
      ...recovery.actions(),
    ],
  });
  paint(); activate(F.route).catch(() => {});
  return { show, hide, update: paint, destroy, openFiles, busy: () => live() && !!files?.busy(),
    async flush(options) { return live() ? files?.flush(options) || { lost: 0 } : { lost: 0 }; },
    notificationActions: note => notificationActions(note, { origin: location.origin, enabled: appOn, openApp, runIntent, current: live }),
    focus: () => { if (shown && route?.tool === "files") { const target = explorer?.focus(); if (target) return target; } const heading = root.querySelector("h1") || root; heading.tabIndex = -1; return heading; } };
}
