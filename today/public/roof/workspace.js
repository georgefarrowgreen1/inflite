// InFlite's trusted first-party workspace host. Domain apps keep their stores,
// writes and encryption; this host owns only presentation and validated refs.
import { REGISTRY, parse, format } from "./router.js";
import { loadStyles, loadConnector, keepOffline } from "./modules.js";
import { createWorkspaceView } from "./workspace-view.js";
import { WORKSPACE_APPS, getWorkspaceApp, safeWorkspaceRoute } from "./workspace-catalog.js";
import { createWorkspaceStore } from "./workspace-state.js";
import { createWorkspaceContext } from "./workspace-context.js";

export const WORKSPACE_VERSION = 1;
const EMPTY_CONTEXT = Object.freeze({ location: null, interval: null });
const duration = (n) => { const m = Math.round(Number(n) / 60); return m > 0 ? m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60}` : ""}` : `${m} min` : ""; };
const guarded = (fn, fallback) => { try { return fn(); } catch (_) { return fallback; } };

export async function createWorkspace(F, options = {}) {
  await loadStyles("/roof/workspace.css");
  if (F.signal.aborted) throw new DOMException("This account was released", "AbortError");
  const { root, today } = options, owner = F.session.view?.user?.id;
  if (!root || !today || !owner) throw new Error("A workspace needs a signed-in owner");
  const html = document.documentElement, originalTitle = document.title;
  const anchor = document.createComment("Today returns here when its workspace closes");
  today.before(anchor);
  const storage = guarded(() => localStorage, null);
  const store = createWorkspaceStore({ userId: owner, storage, signal: F.signal });
  const handles = new Map(), providers = new Map(), snapshots = new Map(), contexts = new Map(), contextListeners = new Set(), offs = [], pending = new Set();
  const paneHistory = new Map(), displayed = new Map(), historyViews = new Map();
  const presentations = new WeakMap(), waiting = new Set();
  let paneRoutes = new Map(), pendingHistory = null, presented = Promise.resolve();
  let shown = false, gone = false, currentId = null, current = null, route = null, foreground = "fitness", scene = 0, paintPending = false, resize = 0, relayed = null, relayOff = () => {}, relayEpoch = 0;
  const live = () => !gone && !F.signal.aborted && F.session.view?.user?.id === owner;
  const paneKey = (app) => `${currentId || ""}:${app}`;
  const stackFor = (app) => paneHistory.get(paneKey(app));
  const wsURL = (id) => id ? `/#workspace=${id}` : "/#workspace";
  function readiness(r) {
    if (!presentations.has(r)) {
      let resolve;
      const record = { route: r, promise: new Promise((done) => { resolve = done; }), finish(value) { waiting.delete(record); resolve(value); } };
      presentations.set(r, record); waiting.add(record);
    }
    return presentations.get(r);
  }
  const appOn = (app) => !!F.session.apps?.[app];
  const currentContext = () => {
    if (!live() || !currentId) return null;
    if (!contexts.has(currentId)) contexts.set(currentId, createWorkspaceContext({ signal: F.signal }));
    return contexts.get(currentId);
  };
  const relay = (value, meta) => {
    const mine = ++relayEpoch;
    for (const entry of [...contextListeners]) {
      if (mine !== relayEpoch) break;
      if (contextListeners.has(entry) && entry.usable()) guarded(() => entry.fn(value, meta));
    }
  };
  function bindContext() {
    const next = currentContext();
    if (next === relayed) return;
    relayOff(); relayed = next; relayOff = next?.subscribe(relay) || (() => {});
    relay(next?.get() || EMPTY_CONTEXT, { source: "workspace:switch" });
  }
  function capability(app, signal) {
    const usable = () => live() && appOn(app) && !signal.aborted;
    return Object.freeze({
      enabled: true,
      active: () => usable() && document.visibilityState === "visible" && !!handles.get(app)?.fw.visible() && (F.route?.kind === "app" && F.route.app === app || shown && !!displayed.get(app)?.visible),
      provide(provider) {
        if (!usable() || !provider || typeof provider.snapshot !== "function" || typeof provider.run !== "function") return () => {};
        const entry = { provider, signal, epoch: 0 }; providers.set(app, entry); refreshProvider(app);
        return () => { if (providers.get(app) === entry) { providers.delete(app); snapshots.delete(app); paint(); } };
      },
      changed: () => { if (usable()) queueProvider(app); },
      context: Object.freeze({
        get: () => usable() ? currentContext()?.get() || EMPTY_CONTEXT : EMPTY_CONTEXT,
        capture() { const context = currentContext(); return () => usable() && currentContext() === context; },
        subscribe(fn) { if (!usable() || typeof fn !== "function") return () => {}; const entry = { app, fn, usable }; contextListeners.add(entry); return () => contextListeners.delete(entry); },
        update(patch, { source = app } = {}) { return usable() && typeof source === "string" && (source === app || source.startsWith(app + ":")) && !!currentContext()?.update(patch, { source }); },
      }),
    });
  }
  function acquire(app) {
    let handle = handles.get(app);
    if (!handle || handle.signal.aborted) {
      handle = F.view(app); handles.set(app, handle); handle.fw.workspace ||= capability(app, handle.signal);
      displayed.delete(app);
    }
    return handle;
  }
  for (const app of WORKSPACE_APPS.filter((a) => a.pane)) acquire(app.id);
  const paneLabel = (app) => root.querySelector(`[data-pane="${app}"] .ws-pane-title`)?.id;
  function header(app, spec = {}) {
    const snap = snapshots.get(app), acts = Array.isArray(spec.acts) ? spec.acts : [];
    const primary = acts.find((a) => a.icon === "search");
    const actions = primary ? [primary] : [];
    if (acts.some((a) => a !== primary) || snap?.actions?.length) actions.push({ id: "workspace-actions", icon: "more", label: `${REGISTRY[app].name} actions`, run: () => openActions(app) });
    view.setPane(app, { ...spec, title: spec.pick ? spec.title || REGISTRY[app].name : REGISTRY[app].name, actions,
      sections: spec.sections === false || spec.sections === null ? [] : REGISTRY[app].sections,
      section: handles.get(app)?.route?.section || current?.panes.find((p) => p.app === app)?.route?.split("#")[1] || REGISTRY[app].sections[0][0],
      back: (stackFor(app)?.length || 0) > 1, busy: false, error: null });
  }
  const view = createWorkspaceView(root, {
    onToday: () => F.nav.go(wsURL()), onWorkspace: (id) => openWorkspace(id), onApp: (app) => openApp(app),
    onSearch: () => F.search.open(), onApps: () => openApps(),
    onNotifications: options.onNotifications, onAccount: options.onAccount, onSettings: options.onSettings,
    onCreateWorkspace: () => editWorkspace(), onFiles: () => openFiles(),
    onManageWorkspace: (id) => manageWorkspace(id),
    onPaneFocus: (app) => focusPane(app), onPaneOpen: (app) => openApp(app), onPaneBack: (app) => paneBack(app),
    onPaneSection: (app, section) => navigatePane(app, format({ app, section })),
    onIntent: (app, intent, id) => runIntent(app, intent, id),
  });
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
  const historyData = () => current ? { userId: owner, id: current.id, activePane: foreground, routes: Object.fromEntries(current.panes.map((p) => [p.app, safeWorkspaceRoute(p.app, p.route) || getWorkspaceApp(p.app).href])) } : null;
  function recordHistory(replace = false) {
    if (live() && shown && current) {
      pendingHistory = { id: current.id, routes: new Map(paneRoutes), foreground };
      F.nav.go(wsURL(current.id), { replace, kind: "section", state: { workspace: historyData() } });
    }
  }
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
    if (live()) { const h = handles.get(app); if (h) header(app, h.header); paint(); }
  }
  function summary() {
    const ride = snapshots.get("fitness")?.ride, card = options.day?.()?.cards?.fitness;
    const session = card?.state === "ok" ? card.session : null;
    const title = ride?.title || session?.name || (card?.kind === "rest" ? "Time to recover" : "Your Ride workspace");
    const seconds = ride?.durationSeconds || session?.secs;
    const time = ride?.scheduled;
    const clock = time ? guarded(() => new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit", timeZone: time.tz || undefined }).format(time.start), "") : "";
    const line = [clock, duration(seconds), ride?.place?.name].filter(Boolean).join(" · ");
    const facts = [];
    if (duration(seconds)) facts.push({ label: "Duration", value: duration(seconds) });
    const tss = ride?.tss ?? session?.tss;
    if (Number.isFinite(tss)) facts.push({ label: "Training load", value: String(Math.round(tss)) });
    return { title, line: line || "Fitness and Weather, ready together", facts };
  }
  function paint() {
    if (!live() || paintPending) return;
    paintPending = true;
    queueMicrotask(() => {
      paintPending = false; if (!live()) return;
      const state = store.read(), file = snapshots.get("fitness")?.files?.[0];
      view.update({ mode: F.route?.kind === "app" ? "app" : shown && current ? "workspace" : "today", activeApp: F.route?.app, activeId: currentId, foregroundApp: foreground,
        paneApps: current?.panes.map((p) => p.app) || ["fitness", "weather"], workspaces: state.workspaces,
        apps: WORKSPACE_APPS.map((a) => ({ ...a, available: appOn(a.id) })), user: { name: F.session.view?.user?.name || "" }, notifications: options.notifications?.() || 0,
        title: current ? `${current.name} workspace` : "Today", summary: summary(),
        resource: file ? { name: file.name, app: "fitness", intent: "view-route", objectId: file.id,
          secondary: { label: "Download GPX", icon: "download", app: "fitness", intent: "export-route", objectId: file.id } } : null });
    });
  }
  function paneVisible(app) {
    const pane = view.slots[app]?.closest(".ifl-workspace-pane");
    return !!(shown && current?.panes.some((p) => p.app === app) && pane && !pane.hidden && getComputedStyle(pane).display !== "none" && pane.getBoundingClientRect().width > 0);
  }
  function present(app, path, visible) {
    const handle = handles.get(app), slot = view.slots[app];
    if (!handle || !slot) return false;
    const r = parse(path, { roof: F.session.apps });
    if (!r || r.kind !== "app" || r.app !== app) { view.setPane(app, { busy: false, error: "This app is not available here yet.", retry: () => F.hubAgain().then(layout) }); return false; }
    const old = displayed.get(app), id = currentId, episode = scene;
    if (old?.id === id && old.path === path && old.visible === visible) return old.ready || Promise.resolve(true);
    if (!old || old.id !== id) {
      handle.attach({ container: slot, workspace: handle.fw.workspace, labelledBy: paneLabel(app),
        navigate: (to, opts) => navigatePane(app, to, opts), back: () => paneBack(app),
        section: (section, opts) => navigatePane(app, format({ app, section, arg: opts?.arg })),
        header: (spec) => header(app, spec), fill: (value) => slot.closest(".ifl-workspace-pane")?.classList.toggle("is-filled", value),
        depth: () => Math.max(0, (stackFor(app)?.length || 1) - 1) });
    }
    const task = { id, path, visible }; displayed.set(app, task);
    if (!visible) { handle.hide(); task.ready = Promise.resolve(true); return task.ready; }
    view.setPane(app, { busy: true, error: null });
    task.ready = (async () => { try {
      await loadStyles(getWorkspaceApp(app).workspace.css);
      if (!live() || !shown || scene !== episode || currentId !== id || displayed.get(app) !== task) return false;
      view.setPane(app, { busy: false, error: null });
      const result = await handle.show(r, { visible: true });
      if (live() && displayed.get(app) === task) {
        header(app, handle.header); paint();
        if (result) loadConnector(app).then((connector) => {
          if (!live() || handle.signal.aborted || !handle.build) return;
          const optional = [`/${app}/roof/workspace.js`, getWorkspaceApp(app).workspace.css];
          if (optional.every((file) => connector.lazy?.includes(file))) keepOffline(app, handle.build, [...connector.files, ...optional], { signal: handle.signal });
        }, () => {});
      }
      return result;
    } catch (_) {
      if (live() && displayed.get(app) === task) view.setPane(app, { busy: false, error: "This app couldn’t open. Try again.", retry: () => { displayed.delete(app); layout(); } });
      return false;
    } })();
    return task.ready;
  }
  function layout() {
    if (!live() || !shown || !current) return;
    const tasks = [];
    for (const [app, handle] of handles) {
      const pane = current.panes.find((p) => p.app === app);
      if (!pane) { handle.hide({ detach: true }); displayed.delete(app); continue; }
      tasks.push(present(app, paneRoutes.get(app) || pane.route, paneVisible(app)));
    }
    return (presented = Promise.all(tasks));
  }
  function focusPane(app) {
    if (!live() || !current?.panes.some((p) => p.app === app) || foreground === app) return;
    foreground = app; store.update(current.id, { activePane: app }); current = store.read().workspaces.find((w) => w.id === current.id);
    view.update({ foregroundApp: app }); paint(); layout();
  }
  function openWorkspace(id) {
    if (!live() || !store.read().workspaces.some((w) => w.id === id)) return;
    if (F.route?.tab !== "workspace" || F.route.arg !== id) F.nav.go(wsURL(id));
  }
  function navigatePane(app, path, opts = {}) {
    if (!live() || !shown || !current) return;
    const r = parse(String(path), { roof: F.session.apps, origin: location.origin });
    if (!r || r.kind !== "app" || !current.panes.some((p) => p.app === r.app)) return F.nav.go(path, opts);
    const base = format(r), at = base.indexOf("#"), next = r.query ? at < 0 ? base + r.query : base.slice(0, at) + r.query + base.slice(at) : base;
    const target = r.app, entry = current.panes.find((p) => p.app === target);
    if ((paneRoutes.get(target) || entry.route) === next && foreground === target) return;
    const stack = stackFor(target) || [paneRoutes.get(target) || entry.route];
    if (opts.replace) stack[stack.length - 1] = next; else if (stack.at(-1) !== next) stack.push(next);
    if (stack.length > 24) stack.shift(); paneHistory.set(paneKey(target), stack);
    const safe = safeWorkspaceRoute(target, next);
    const panes = current.panes.map((p) => p.app === target ? { ...p, route: safe || p.route } : p);
    store.update(current.id, { panes, activePane: target });
    current = store.read().workspaces.find((w) => w.id === current.id);
    paneRoutes.set(target, next); foreground = target; recordHistory();
  }
  function paneBack(app) {
    const stack = stackFor(app);
    if (current && stack?.length > 1) { stack.pop(); navigatePane(app, stack.at(-1), { replace: true }); return; }
    if (shown) F.nav.go(wsURL()); else F.nav.back();
  }
  async function openApp(app) {
    const manifest = getWorkspaceApp(app); if (!live() || !manifest) return;
    const path = paneRoutes.get(app) || current?.panes.find((p) => p.app === app)?.route || manifest.href;
    F.nav.go(path);
    const handle = handles.get(app);
    if (handle) {
      const expected = F.route;
      const instance = await handle.load();
      if (live() && F.route === expected) await instance?.workspace?.();
    }
  }
  async function runIntent(app, intent, objectId) {
    if (!live()) return false;
    let expectedRoute = F.route;
    if (!providers.has(app) || !handles.get(app)?.fw.workspace.active()) {
      const saved = store.read(), eligible = (w) => w?.panes.some((p) => p.app === app);
      const target = saved.workspaces.find((w) => w.id === currentId && eligible(w)) || saved.workspaces.find((w) => w.id === saved.activeId && eligible(w)) || saved.workspaces.find(eligible);
      if (!target) return false;
      store.update(target.id, { activePane: app });
      F.nav.go(wsURL(target.id), { kind: "section" });
      expectedRoute = F.route;
      if (!await readiness(expectedRoute).promise || !live() || F.route !== expectedRoute || currentId !== target.id) return false;
      const handle = handles.get(app), instance = await handle?.load();
      if (!live() || F.route !== expectedRoute || currentId !== target.id) return false;
      await instance?.workspace?.();
    }
    const entry = providers.get(app), id = currentId, epoch = scene;
    if (!entry || !live() || F.route !== expectedRoute || !handles.get(app)?.fw.workspace.active()) return false;
    const ownsAction = () => live() && !entry.signal.aborted && providers.get(app) === entry && id === currentId && epoch === scene && F.route === expectedRoute && handles.get(app)?.fw.workspace.active();
    try {
      const result = await entry.provider.run(intent, objectId, { current: ownsAction });
      if (!ownsAction()) return false;
      if (result?.error) F.toast(result.error);
      queueProvider(app); return result;
    } catch (_) { if (ownsAction()) F.toast("That action couldn’t finish. Try again."); return false; }
  }
  function openActions(app) {
    const handle = handles.get(app), native = handle?.header.acts || [], snap = snapshots.get(app);
    const body = F.ui.el("div", { class: "ifs-page" });
    let menu;
    for (const act of native) if (act.icon !== "search" && typeof act.run === "function") body.append(F.ui.btn(act.label, { icon: act.icon, run: () => { menu.now(); act.run(); } }));
    for (const act of snap?.actions || []) body.append(F.ui.btn(act.label, { disabled: act.enabled === false, run: () => { menu.now(); runIntent(app, act.id); } }));
    if (!body.firstChild) body.append(F.ui.el("p", { text: "App actions will appear when it is ready." }));
    menu = F.sheet.open({ app, sheet: "workspace-actions", title: `${REGISTRY[app].name} actions`, body });
  }
  function openFiles() {
    const body = F.ui.el("div", { class: "ifs-page" }), files = snapshots.get("fitness")?.files || [];
    let menu;
    if (!files.length) body.append(F.ui.el("p", { text: "Saved route files appear here when you open your Ride workspace." }), F.ui.btn("Open Ride workspace", { run: () => { menu.now(); openWorkspace(store.read().workspaces[0].id); } }));
    for (const file of files) body.append(F.ui.el("section", { class: "ifl-card" }, F.ui.el("h3", { text: file.name }),
      F.ui.btn("Open in Fitness", { run: () => { menu.now(); runIntent("fitness", "view-route", file.id); } }),
      F.ui.btn("Download GPX", { run: () => { menu.now(); runIntent("fitness", "export-route", file.id); } })));
    menu = F.sheet.open({ sheet: "workspace-files", title: "Files", body });
  }
  function openApps() {
    const body = F.ui.el("div", { class: "ifs-page" }); let menu;
    body.append(F.ui.btn("Today", { icon: "sun", run: () => { menu.now(); F.nav.go(wsURL()); } }));
    for (const saved of store.read().workspaces) body.append(F.ui.btn(saved.name + " workspace", { icon: "grid", run: () => { menu.now(); openWorkspace(saved.id); } }));
    for (const app of WORKSPACE_APPS) body.append(F.ui.btn(app.name, { disabled: !appOn(app.id), run: () => { menu.now(); openApp(app.id); } }));
    menu = F.sheet.open({ sheet: "workspace-apps", title: "Your apps", body });
  }
  function editWorkspace() {
    const name = F.ui.el("input", { type: "text", maxLength: 60, placeholder: "Workspace name", "aria-label": "Workspace name" });
    const field = F.ui.el("label", { class: "ifl-field" }, name), body = F.ui.el("div", { class: "ifs-page" }, field), picks = [];
    for (const app of WORKSPACE_APPS.filter((a) => a.pane)) {
      const input = F.ui.el("input", { type: "checkbox", checked: true }); picks.push({ app, input });
      body.append(F.ui.el("label", { class: "ifl-row" }, input, F.ui.el("span", { text: app.name })));
    }
    const error = F.ui.el("p", { role: "status", hidden: true }); body.append(error); let menu;
    const save = F.ui.btn("Create workspace", { primary: true, run: () => {
      const panes = picks.filter((p) => p.input.checked).map((p) => ({ app: p.app.id, route: p.app.href }));
      const value = store.create({ name: name.value, panes });
      if (!value) { error.hidden = false; error.textContent = "Give your workspace a name and choose one or two apps. Up to eight can be saved."; return; }
      menu.now(); openWorkspace(value.id);
      if (!store.persisted) F.toast("Your browser couldn’t save this workspace. It will last for this session.");
    } });
    body.append(save); menu = F.sheet.open({ sheet: "workspace-create", title: "New workspace", body });
  }
  function manageWorkspace(id) {
    const saved = store.read().workspaces.find((w) => w.id === id);
    if (!saved || !live()) return;
    const name = F.ui.el("input", { type: "text", maxLength: 60, value: saved.name, "aria-label": "Workspace name" });
    const error = F.ui.el("p", { role: "status", hidden: true });
    const body = F.ui.el("div", { class: "ifs-page" }, F.ui.el("label", { class: "ifl-field" }, F.ui.el("span", { text: "Workspace name" }), name), error);
    let menu;
    body.append(F.ui.btn("Save name", { primary: true, run: () => {
      if (!live()) return;
      if (!store.update(id, { name: name.value })) { error.hidden = false; error.textContent = "Give your workspace a name."; return; }
      menu.now();
      if (shown && currentId === id) show(F.route); else paint();
    } }));
    if (store.read().workspaces.length > 1) body.append(F.ui.btn("Remove workspace", { run: () => {
      if (!live() || !store.remove(id)) return;
      menu.now(); contexts.get(id)?.dispose(); contexts.delete(id);
      for (const key of paneHistory.keys()) if (key.startsWith(id + ":")) paneHistory.delete(key);
      for (const [key, value] of historyViews) if (value.id === id) historyViews.delete(key);
      if (shown && currentId === id) F.nav.go(wsURL(), { replace: true }); else paint();
    } }));
    menu = F.sheet.open({ sheet: "workspace-manage", title: "Edit workspace", body });
  }
  function show(nextRoute) {
    const ready = readiness(nextRoute);
    return showWorkspace(nextRoute).then((ok) => { ready.finish(ok && live() && shown && route === nextRoute); return ok; }, (error) => { ready.finish(false); throw error; });
  }
  async function showWorkspace(nextRoute) {
    if (!live()) return false;
    route = nextRoute; shown = true; const episode = ++scene; html.classList.add("ifl-os", "os-workspace");
    view.slots.dockAnchor.append(view.dock);
    const state = store.read(), chosen = state.workspaces.find((w) => w.id === nextRoute?.arg);
    current = chosen || null; currentId = current?.id || state.activeId || null;
    if (current) {
      store.select(current.id);
      const entryKey = history.state?.ifl?.k;
      const memory = pendingHistory?.id === current.id ? pendingHistory : historyViews.get(entryKey);
      pendingHistory = null;
      const kept = history.state?.workspace;
      if (kept?.userId === owner && kept.id === current.id) {
        current = { ...current, panes: current.panes.map((p) => ({ ...p, route: safeWorkspaceRoute(p.app, kept.routes?.[p.app]) || p.route })) };
        foreground = current.panes.some((p) => p.app === kept.activePane) ? kept.activePane : current.activePane;
      } else foreground = current.activePane;
      paneRoutes = new Map(current.panes.map((p) => [p.app, memory?.id === current.id ? memory.routes.get(p.app) || p.route : p.route]));
      if (memory?.id === current.id && current.panes.some((p) => p.app === memory.foreground)) foreground = memory.foreground;
      store.update(current.id, { panes: current.panes, activePane: foreground });
      if (entryKey) historyViews.set(entryKey, { id: current.id, routes: new Map(paneRoutes), foreground });
      if (historyViews.size > 40) historyViews.delete(historyViews.keys().next().value);
      for (const pane of current.panes) if (!paneHistory.has(paneKey(pane.app))) paneHistory.set(paneKey(pane.app), [pane.route]);
      restoreToday(); today.hidden = true; today.inert = true;
    } else {
      for (const app of displayed.keys()) handles.get(app)?.hide({ detach: true }); displayed.clear();
      view.slots.today.append(today); today.hidden = false; today.inert = false;
      options.onTodayShow?.();
    }
    bindContext(); paint();
    await Promise.resolve();
    if (live() && shown && route === nextRoute) await layout();
    if (!live() || !shown || scene !== episode || route !== nextRoute || F.route !== nextRoute) return false;
    document.title = `${current ? current.name + " workspace" : "Today"} — InFlite OS`;
    return true;
  }
  function hide() {
    if (!live()) return;
    shown = false; ++scene; html.classList.remove("os-workspace");
    for (const app of displayed.keys()) handles.get(app)?.hide({ detach: true }); displayed.clear(); restoreToday();
    options.dockRoot?.append(view.dock);
  }
  function destroy() {
    if (gone) return;
    gone = true; ++scene; cancelAnimationFrame(resize); relayOff();
    for (const pending of [...waiting]) pending.finish(false);
    for (const off of offs.splice(0)) off();
    for (const ctx of contexts.values()) ctx.dispose(); contexts.clear(); contextListeners.clear(); providers.clear(); snapshots.clear(); historyViews.clear(); paneRoutes.clear(); store.dispose();
    restoreToday(); anchor.remove(); view.destroy(); html.classList.remove("ifl-os", "os-workspace"); html.removeAttribute("data-os-dock-away"); document.title = originalTitle;
    if (F.tabs.away === dockAway) F.tabs.away = nativeAway;
    const state = history.state;
    if (state?.workspace?.userId === owner) { const clean = { ...state }; delete clean.workspace; guarded(() => history.replaceState(clean, "")); }
    F.signal.removeEventListener("abort", destroy);
  }
  F.signal.addEventListener("abort", destroy, { once: true });
  const activate = async (r) => {
    if (r?.kind !== "app" || !handles.has(r.app) || !live()) return;
    const instance = await handles.get(r.app).load();
    if (live() && F.route === r) await instance?.workspace?.();
  };
  offs.push(F.on("apps", () => {
    for (const app of handles.keys()) {
      if (appOn(app)) { acquire(app); queueProvider(app); }
      else { handles.get(app).hide({ detach: true }); displayed.delete(app); snapshots.delete(app); }
    }
    paint(); layout();
  }), F.on("changed", (app) => queueProvider(app)), F.on("visible", () => { for (const app of providers.keys()) queueProvider(app); }), F.on("route", (r) => {
    for (const pending of [...waiting]) if (pending.route !== r) pending.finish(false);
    if (r.kind === "app") document.title = `${REGISTRY[r.app].name} — InFlite OS`;
    paint(); activate(r).catch(() => {});
  }));
  const resized = () => { cancelAnimationFrame(resize); resize = requestAnimationFrame(layout); };
  window.addEventListener("resize", resized, { passive: true }); offs.push(() => window.removeEventListener("resize", resized));
  if (typeof ResizeObserver === "function") { const ro = new ResizeObserver(resized); ro.observe(root); offs.push(() => ro.disconnect()); }
  offs.push(F.search.provide({ id: "workspaces", group: "Workspaces", order: 1, search(q) { const query = String(q).toLocaleLowerCase(); return store.read().workspaces.filter((w) => w.name.toLocaleLowerCase().includes(query)).map((w) => ({ title: w.name + " workspace", sub: "Open your saved apps", icon: "grid", href: wsURL(w.id) })); } }));
  currentId = store.read().activeId;
  bindContext(); paint(); activate(F.route).catch(() => {});
  return { show, hide, update: paint, destroy, focus: () => { const heading = root.querySelector("h1") || root; heading.tabIndex = -1; return heading; }, store };
}
