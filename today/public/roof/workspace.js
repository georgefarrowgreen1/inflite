// InFlite's trusted first-party workspace host. Domain apps keep their stores,
// writes and encryption; this host owns only presentation and validated refs.
import { REGISTRY, parse, format } from "./router.js";
import { loadStyles, loadConnector, keepOffline } from "./modules.js";
import { createWorkspaceView } from "./workspace-view.js";
import { WORKSPACE_APPS, getWorkspaceApp, safeWorkspaceRoute } from "./workspace-catalog.js";
import { createWorkspaceStore } from "./workspace-state.js";
import { createWorkspaceContext } from "./workspace-context.js";
import { createWorkspaceCommands, notificationActions } from "./workspace-commands.js";
import { createFilesService } from "./files-service.js";
import { safeFilesLocation } from "./files-location.js";

export const WORKSPACE_VERSION = 2;
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
  const paneHistory = new Map(), displayed = new Map(), historyViews = new Map(), backgroundSlots = new Map(), paneScroll = new Map(), restoring = new Map(), paneObservers = new Map();
  const background = F.ui.el("div", { hidden: true, inert: true, "aria-hidden": "true" });
  options.dockRoot?.append(background);
  let files = null, commands = null;
  let explorer = null, explorerLoad = null, filesLocation = safeFilesLocation({ kind: "drive" }), pendingFilesQuery = null;
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
  const appOn = (app) => !!F.session.apps?.[app] && (app !== "mail" || F.session.view?.apps?.mail === true);
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
      const observer = paneObservers.get(app);
      if (observer) { observer.disconnect(); observer.observe(handle.root); }
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
    view.setPane(app, { ...spec, title: spec.pick || ["chats", "mail", "markets"].includes(app) ? spec.title || REGISTRY[app].name : REGISTRY[app].name, actions,
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
    onWindowFocus: (app) => focusPane(app), onWindowChange: (app, patch) => changeWindow(app, patch), onLayoutMode: (mode) => changeLayout(mode),
    onViewportChange: () => { cancelAnimationFrame(resize); resize = requestAnimationFrame(layout); },
    onBeforePaneFocus: () => rememberAll(), onPaneFocus: (app) => focusPane(app), onPaneOpen: (app) => openApp(app, null, true), onPaneBack: (app) => paneBack(app),
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
    if (live()) { const h = handles.get(app); if (h) header(app, h.header); files?.update?.(); files?.changed?.(app); restoreScroll(app); requestAnimationFrame(() => restoreScroll(app)); paint(); }
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
      rememberAll();
      const state = store.read(), file = current?.panes.some(p => p.app === "fitness") ? snapshots.get("fitness")?.files?.[0] : null;
      view.update({ mode: F.route?.kind === "app" ? "app" : shown && route?.tool === "files" ? "files" : shown && current ? "workspace" : "today", activeApp: F.route?.app, activeId: currentId, foregroundApp: foreground,
        paneApps: current?.panes.map((p) => p.app) || ["fitness", "weather"], workspaces: state.workspaces,
        apps: WORKSPACE_APPS.map((a) => ({ ...a, available: appOn(a.id) })), user: { name: F.session.view?.user?.name || "" }, notifications: options.notifications?.() || 0,
        title: current ? `${current.name} workspace` : "Today", summary: summary(), layout: current?.layout,
        resource: file ? { name: file.name, app: "fitness", intent: "view-route", objectId: file.id,
          secondary: { label: "Download GPX", icon: "download", app: "fitness", intent: "export-route", objectId: file.id } } : null });
    });
  }
  function paneVisible(app) {
    if (typeof view.isPaneVisible === "function") return shown && !!current?.panes.some(p => p.app === app) && view.isPaneVisible(app);
    const pane = view.slots[app]?.closest(".ifl-workspace-pane");
    return !!(shown && current?.panes.some((p) => p.app === app) && pane && !pane.hidden && getComputedStyle(pane).display !== "none" && pane.getBoundingClientRect().width > 0);
  }
  // Scroll belongs to the workspace slot, which becomes empty on native moves.
  // Keep only bounded RAM references and stop delayed restoration on user input.
  function rememberScroll(app) {
    const task = displayed.get(app), slot = view.slots[app];
    if (!task?.visible || !slot?.clientHeight || !slot.contains(handles.get(app)?.el) || restoring.has(app)) return;
    const key = `${task.id}:${app}`;
    paneScroll.delete(key); paneScroll.set(key, { path: task.path, top: slot.scrollTop });
    if (paneScroll.size > 40) paneScroll.delete(paneScroll.keys().next().value);
  }
  const rememberAll = () => { for (const app of displayed.keys()) rememberScroll(app); };
  function restoreScroll(app) {
    const task = displayed.get(app), saved = restoring.get(app), slot = view.slots[app];
    if (!saved || !live() || !shown || !task?.visible || !task.rendered || task !== saved.task || !slot?.contains(handles.get(app)?.el)) return;
    const maximum = slot.scrollHeight - slot.clientHeight;
    slot.scrollTop = saved.top;
    if (maximum >= saved.top - 1 && Math.abs(slot.scrollTop - saved.top) < 2) restoring.delete(app);
  }
  for (const app of WORKSPACE_APPS.filter(a => a.pane)) {
    const cancel = () => restoring.delete(app.id);
    if (typeof ResizeObserver === "function") {
      const observer = new ResizeObserver(() => restoreScroll(app.id));
      paneObservers.set(app.id, observer); observer.observe(handles.get(app.id).root); offs.push(() => observer.disconnect());
    }
    for (const event of ["pointerdown", "touchstart", "wheel", "keydown"]) {
      view.slots[app.id].addEventListener(event, cancel, { passive: true, capture: true });
      offs.push(() => view.slots[app.id].removeEventListener(event, cancel, true));
    }
  }
  function present(app, path, visible) {
    const handle = handles.get(app), slot = view.slots[app];
    if (!handle || !slot) return false;
    const r = parse(path, { roof: F.session.apps });
    if (!r || r.kind !== "app" || r.app !== app) { view.setPane(app, { busy: false, error: "This app is not available here yet.", retry: () => F.hubAgain().then(layout) }); return false; }
    const old = displayed.get(app), id = currentId, episode = scene;
    if (old?.id === id && old.path === path && old.visible === visible) return old.ready || Promise.resolve(true);
    rememberScroll(app); restoring.delete(app);
    if (!old || old.id !== id) {
      handle.attach({ container: slot, workspace: handle.fw.workspace, labelledBy: paneLabel(app),
        navigate: (to, opts) => navigatePane(app, to, opts), back: () => paneBack(app),
        section: (section, opts) => navigatePane(app, format({ app, section, arg: opts?.arg })),
        header: (spec) => header(app, spec), fill: (value) => slot.closest(".ifl-workspace-pane")?.classList.toggle("is-filled", value),
        depth: () => Math.max(0, (stackFor(app)?.length || 1) - 1) });
    }
    const task = { id, path, visible, rendered: false }; displayed.set(app, task);
    const saved = paneScroll.get(`${id}:${app}`);
    if (visible && saved?.path === path && saved.top > 0) restoring.set(app, { task, top: saved.top });
    else if (!old || old.id !== id || old.path !== path) slot.scrollTop = 0;
    if (!visible) { handle.hide(); task.ready = Promise.resolve(true); return task.ready; }
    view.setPane(app, { busy: true, error: null });
    task.ready = (async () => { try {
      await loadStyles(getWorkspaceApp(app).workspace.css);
      if (!live() || !shown || scene !== episode || currentId !== id || displayed.get(app) !== task) return false;
      view.setPane(app, { busy: false, error: null });
      const instance = await handle.load();
      if (!live() || !shown || scene !== episode || currentId !== id || displayed.get(app) !== task) return false;
      await instance?.workspace?.();
      if (!live() || !shown || scene !== episode || currentId !== id || displayed.get(app) !== task) return false;
      const result = await handle.show(r, { visible: true });
      task.rendered = result !== false;
      if (live() && displayed.get(app) === task) {
        header(app, handle.header); restoreScroll(app);
        requestAnimationFrame(() => restoreScroll(app)); paint();
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
      if (!pane) { rememberScroll(app); restoring.delete(app); handle.hide({ detach: true }); displayed.delete(app); continue; }
      tasks.push(present(app, paneRoutes.get(app) || pane.route, paneVisible(app)));
    }
    return (presented = Promise.all(tasks));
  }
  function focusPane(app) {
    if (!live() || !current?.panes.some((p) => p.app === app)) return;
    const oldOrder = current.layout?.order || [];
    const window = current.layout?.windows?.[app];
    if (foreground === app && oldOrder.at(-1) === app && !window?.minimized) { view.revealPane?.(app); layout(); return; }
    const nextLayout = { ...current.layout, order: [...oldOrder.filter(a => a !== app), app], windows: { ...current.layout?.windows, [app]: { ...window, minimized: false } } };
    rememberAll();
    foreground = app; store.update(current.id, { activePane: app, layout: nextLayout }); current = store.read().workspaces.find((w) => w.id === current.id);
    view.update({ foregroundApp: app, layout: current.layout }); view.revealPane?.(app); paint(); layout();
  }
  function openWorkspace(id) {
    if (!live() || !store.read().workspaces.some((w) => w.id === id)) return;
    if (F.route?.tab !== "workspace" || F.route.arg !== id) F.nav.go(wsURL(id));
  }
  function changeWindow(app, patch) {
    if (!live() || !current?.panes.some(p => p.app === app)) return;
    rememberAll();
    const next = { ...current.layout, windows: { ...current.layout.windows, [app]: { ...current.layout.windows[app], ...patch } } };
    store.update(current.id, { layout: next });
    current = store.read().workspaces.find(w => w.id === current.id);
    view.update({ layout: current.layout }); paint(); layout();
  }
  function changeLayout(mode) {
    if (!live() || !current || !["tile", "float"].includes(mode)) return;
    rememberAll();
    store.update(current.id, { layout: { ...current.layout, mode } });
    current = store.read().workspaces.find(w => w.id === current.id);
    view.update({ layout: current.layout }); paint(); layout();
  }
  function openWorkspaceFor(app, path) {
    if (!live() || !appOn(app)) return;
    const state = store.read(), eligible = w => w.panes.some(p => p.app === app);
    const target = state.workspaces.find(w => w.id === currentId && eligible(w)) || state.workspaces.find(eligible);
    if (!target) return openApp(app, path || getWorkspaceApp(app)?.href, true);
    const safe = safeWorkspaceRoute(app, path) || target.panes.find(p => p.app === app).route;
    store.update(target.id, { panes: target.panes.map(p => p.app === app ? { ...p, route: safe } : p), activePane: app,
      layout: { ...target.layout, windows: { ...target.layout.windows, [app]: { ...target.layout.windows[app], minimized: false } } } });
    if (shown && current && currentId === target.id) {
      if ((paneRoutes.get(app) || "") !== safe) navigatePane(app, safe);
      else { current = store.read().workspaces.find(w => w.id === target.id); focusPane(app); paint(); layout(); }
    } else openWorkspace(target.id);
  }
  async function loadFiles(app, query, callerCurrent = () => true) {
    const valid = () => live() && appOn(app) && callerCurrent();
    if (!valid() || !getWorkspaceApp(app)) return { status: "error", files: [] };
    const handle = acquire(app);
    if (!handle.el.isConnected || handle.el.hidden && !displayed.has(app)) {
      if (!backgroundSlots.has(app)) { const slot = F.ui.el("div"); background.append(slot); backgroundSlots.set(app, slot); }
      handle.attach({ container: backgroundSlots.get(app), workspace: handle.fw.workspace, navigate() {}, back() {}, section() {}, header() {}, fill() {} });
    }
    const instance = await handle.load();
    if (!valid() || handle.signal.aborted) return { status: "error", files: [] };
    await instance?.workspace?.();
    const entry = providers.get(app);
    const current = () => valid() && !handle.signal.aborted && providers.get(app) === entry;
    if (!current() || !entry) return { status: "loading", files: [] };
    const value = typeof entry.provider.files === "function" ? await entry.provider.files({ query, current }) : { status: "ready", files: snapshots.get(app)?.files || [] };
    return current() ? value : { status: "error", files: [] };
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
  async function openApp(app, destination = null, expand = false, wake = false) {
    const manifest = getWorkspaceApp(app); if (!live() || !manifest) return;
    const path = destination || paneRoutes.get(app) || current?.panes.find((p) => p.app === app)?.route || manifest.href;
    rememberAll();
    F.nav.go(path, wake ? { kind: "section" } : undefined);
    const expected = F.route, handle = handles.get(app);
    if (handle) {
      const instance = await handle.load();
      if (live() && F.route === expected) await instance?.workspace?.();
    }
    return live() && F.route === expected ? expected : null;
  }
  async function runIntent(app, intent, objectId, { current: callerCurrent = () => true } = {}) {
    if (!live() || !callerCurrent() || !appOn(app)) return false;
    let expectedRoute = F.route;
    if (!providers.has(app) || !handles.get(app)?.fw.workspace.active()) {
      const saved = store.read(), eligible = (w) => w?.panes.some((p) => p.app === app);
      const target = saved.workspaces.find((w) => w.id === currentId && eligible(w)) || saved.workspaces.find((w) => w.id === saved.activeId && eligible(w)) || saved.workspaces.find(eligible);
      if (!target) {
        expectedRoute = await openApp(app, format({ app }), true, true);
        if (!expectedRoute || !callerCurrent()) return false;
      } else {
      const restored = { ...target.layout, windows: { ...target.layout.windows, [app]: { ...target.layout.windows[app], minimized: false } } };
      store.update(target.id, { activePane: app, layout: restored });
      F.nav.go(wsURL(target.id), { kind: "section" });
      expectedRoute = F.route;
      if (!await readiness(expectedRoute).promise || !live() || F.route !== expectedRoute || currentId !== target.id) return false;
      const handle = handles.get(app), instance = await handle?.load();
      if (!live() || F.route !== expectedRoute || currentId !== target.id) return false;
      await instance?.workspace?.();
      }
    }
    const entry = providers.get(app), id = currentId, epoch = scene;
    if (!entry || !live() || !callerCurrent() || F.route !== expectedRoute || !handles.get(app)?.fw.workspace.active()) return false;
    const ownsAction = () => live() && callerCurrent() && !entry.signal.aborted && providers.get(app) === entry && id === currentId && epoch === scene && F.route === expectedRoute && handles.get(app)?.fw.workspace.active();
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
  function navigateFiles(next, { query } = {}) {
    next = safeFilesLocation(next);
    if (!live() || !next) return false;
    const path = format({ tab: "workspace", tool: "files", folder: next.kind === "drive" && next.view === "folder" ? next.folderId : null });
    const prefill = typeof query === "string" ? { query: query.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 160), location: JSON.stringify(next), route: null } : null;
    pendingFilesQuery = prefill;
    const replace = F.route?.tool === "files" && JSON.stringify(filesLocation) === JSON.stringify(next);
    F.nav.go(path, { kind: "section", replace, state: { files: { userId: owner, location: next } } });
    if (prefill && pendingFilesQuery === prefill) prefill.route = F.route;
    return true;
  }
  const openFiles = (query = "", location = null) => {
    const destination = location === null ? { kind: "drive", folderId: null, view: "folder" } : safeFilesLocation(location);
    return destination ? navigateFiles(destination, { query }) : false;
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
    current = null; currentId = store.read().activeId;
    restoring.clear();
    for (const app of displayed.keys()) handles.get(app)?.hide({ detach: true }); displayed.clear();
    restoreToday(); today.hidden = true; today.inert = true;
    if (!explorer) {
      view.slots.files.hidden = false; view.slots.files.inert = false;
      view.slots.files.replaceChildren(F.ui.el("p", { role: "status", text: "Opening InFlite Files…" }));
    }
    bindContext(); paint();
    const active = () => live() && shown && route === nextRoute && F.route === nextRoute && scene === episode;
    if (active()) document.title = "InFlite Files — InFlite OS";
    try {
      const host = await loadExplorer();
      if (!active() || !host) return false;
      host.show(filesLocation, prefill === undefined ? {} : { query: prefill });
      document.title = "InFlite Files — InFlite OS";
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
    const body = F.ui.el("div", { class: "ifs-page" }); let menu;
    body.append(F.ui.btn("Today", { icon: "sun", run: () => { menu.now(); F.nav.go(wsURL()); } }), F.ui.btn("Files", { icon: "file", run: () => { menu.now(); openFiles(); } }));
    if (options.onNotifications) body.append(F.ui.btn("Notifications", { icon: "bell", run: () => { if (live()) { menu.now(); options.onNotifications(); } } }));
    for (const saved of store.read().workspaces) body.append(F.ui.btn(saved.name + " workspace", { icon: "grid", run: () => { menu.now(); openWorkspace(saved.id); } }));
    for (const app of WORKSPACE_APPS) body.append(F.ui.btn(app.name, { disabled: !appOn(app.id), run: () => { menu.now(); openApp(app.id); } }));
    menu = F.sheet.open({ sheet: "workspace-apps", title: "Your apps", body });
  }
  function editWorkspace() {
    const name = F.ui.el("input", { type: "text", maxLength: 60, placeholder: "Workspace name", "aria-label": "Workspace name" });
    const field = F.ui.el("label", { class: "ifl-field" }, name), body = F.ui.el("div", { class: "ifs-page" }, field), picks = [];
    for (const app of WORKSPACE_APPS.filter((a) => a.pane)) {
      const input = F.ui.el("input", { type: "checkbox", checked: app.id === "fitness" || app.id === "weather", disabled: !appOn(app.id) }); picks.push({ app, input });
      body.append(F.ui.el("label", { class: "ifl-row" }, input, F.ui.el("span", { text: app.name })));
    }
    const error = F.ui.el("p", { role: "status", hidden: true }); body.append(error); let menu;
    const save = F.ui.btn("Create workspace", { primary: true, run: () => {
      const panes = picks.filter((p) => p.input.checked).map((p) => ({ app: p.app.id, route: p.app.href }));
      const value = store.create({ name: name.value, panes });
      if (!value) { error.hidden = false; error.textContent = "Give your workspace a name and choose up to five apps. Up to eight workspaces can be saved."; return; }
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
      for (const key of paneScroll.keys()) if (key.startsWith(id + ":")) paneScroll.delete(key);
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
    rememberAll();
    explorer?.hide();
    route = nextRoute; shown = true; const episode = ++scene; html.classList.add("ifl-os", "os-workspace");
    view.slots.dockAnchor.append(view.dock);
    if (nextRoute?.tool === "files") return showFiles(nextRoute, episode);
    pendingFilesQuery = null;
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
      rememberAll(); restoring.clear();
      for (const app of displayed.keys()) handles.get(app)?.hide({ detach: true }); displayed.clear();
      view.slots.today.append(today); today.hidden = false; today.inert = false;
      options.onTodayShow?.();
    }
    bindContext(); paint();
    await Promise.resolve();
    if (live() && shown && route === nextRoute) { if (current) view.revealPane?.(foreground); await layout(); }
    if (!live() || !shown || scene !== episode || route !== nextRoute || F.route !== nextRoute) return false;
    document.title = `${current ? current.name + " workspace" : "Today"} — InFlite OS`;
    return true;
  }
  function hide() {
    if (!live()) return;
    rememberAll(); restoring.clear();
    explorer?.hide(); pendingFilesQuery = null;
    shown = false; ++scene; html.classList.remove("os-workspace");
    for (const app of displayed.keys()) handles.get(app)?.hide({ detach: true }); displayed.clear(); restoreToday();
    options.dockRoot?.append(view.dock);
  }
  function destroy() {
    if (gone) return;
    gone = true; ++scene; cancelAnimationFrame(resize); relayOff();
    for (const pending of [...waiting]) pending.finish(false);
    for (const off of offs.splice(0)) off();
    explorer?.destroy(); pendingFilesQuery = null;
    for (const ctx of contexts.values()) ctx.dispose(); contexts.clear(); contextListeners.clear(); paneObservers.clear(); paneScroll.clear(); restoring.clear(); providers.clear(); snapshots.clear(); historyViews.clear(); paneRoutes.clear(); store.dispose(); files?.destroy(); commands?.destroy(); background.remove();
    restoreToday(); anchor.remove(); view.destroy(); html.classList.remove("ifl-os", "os-workspace"); html.removeAttribute("data-os-dock-away"); document.title = originalTitle;
    if (F.tabs.away === dockAway) F.tabs.away = nativeAway;
    const state = history.state;
    if (state?.workspace?.userId === owner || state?.files?.userId === owner) { const clean = { ...state }; if (state.workspace?.userId === owner) delete clean.workspace; if (state.files?.userId === owner) delete clean.files; guarded(() => history.replaceState(clean, "")); }
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
    files?.update?.(); paint(); layout();
  }), F.on("changed", (app) => queueProvider(app)), F.on("visible", () => { for (const app of providers.keys()) queueProvider(app); }), F.on("route", (r) => {
    for (const pending of [...waiting]) if (pending.route !== r) pending.finish(false);
    if (r.kind === "app") document.title = `${REGISTRY[r.app].name} — InFlite OS`;
    paint(); activate(r).catch(() => {});
  }));
  const resized = () => { cancelAnimationFrame(resize); resize = requestAnimationFrame(layout); };
  window.addEventListener("resize", resized, { passive: true }); offs.push(() => window.removeEventListener("resize", resized));
  if (typeof ResizeObserver === "function") { const ro = new ResizeObserver(resized); ro.observe(root); offs.push(() => ro.disconnect()); }
  offs.push(F.search.provide({ id: "workspaces", group: "Workspaces", order: 1, search(q) { const query = String(q).toLocaleLowerCase(); return store.read().workspaces.filter((w) => w.name.toLocaleLowerCase().includes(query)).map((w) => ({ title: w.name + " workspace", sub: "Open your saved apps", icon: "grid", href: wsURL(w.id) })); } }));
  files = createFilesService(F, {
    sources: () => WORKSPACE_APPS.filter(a => ["fitness", "mail", "chats", "markets"].includes(a.id) && appOn(a.id)).map(a => ({ app: a.id, name: a.name, transient: a.id === "chats", status: snapshots.get(a.id)?.status || (snapshots.get(a.id)?.loading ? "loading" : providers.has(a.id) ? "ready" : "loading"), files: snapshots.get(a.id)?.files || [] })),
    load: loadFiles, runIntent, openApp, openExplorer: openFiles,
  });
  if (F.systemTasks?.register) offs.push(F.systemTasks.register(files, { signal: F.signal }));
  commands = createWorkspaceCommands(F, {
    apps: () => WORKSPACE_APPS.map(a => ({ ...a, available: appOn(a.id) })), workspaces: () => store.read().workspaces,
    files: q => files.search(q), actions: () => [...snapshots].flatMap(([app, snapshot]) => (snapshot?.actions || []).map(action => ({ app, ...action }))),
    runIntent, openWorkspace, openApp, openFiles,
  });
  currentId = store.read().activeId;
  bindContext(); paint(); activate(F.route).catch(() => {});
  return { show, hide, update: paint, destroy, openFiles, busy: () => live() && !!files?.busy(), flush: options => live() ? files?.flush(options) || Promise.resolve({ lost: 0 }) : Promise.resolve({ lost: 0 }), notificationActions: note => notificationActions(note, { origin: location.origin, enabled: appOn, workspaces: () => store.read().workspaces, openWorkspace: openWorkspaceFor, openApp, runIntent, current: live }), focus: () => { if (shown && route?.tool === "files") { const target = explorer?.focus(); if (target) return target; } const heading = root.querySelector("h1") || root; heading.tabIndex = -1; return heading; }, store };
}
