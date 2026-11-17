// Presentational OS shell. Slot elements are stable; the host owns module data,
// routes, persistence, mounting and cleanup. No screen below invents account data.
// createWorkspaceView(root, callbacks) -> { slots, dock, update(model), setPane(key,spec),
//   getViewport(), isPaneVisible(app), revealPane(app), windowAction(app, command), destroy() }
// dock is a self-scoped movable element; restore it with slots.dockAnchor.append(dock).
// model: { mode:"today"|"workspace"|"app"|"files", activeId, activeApp, foregroundApp, paneApps?,
//   title?, subtitle?, workspaces:[{id,name,icon?}], apps:[{id,name,icon?,available?}],
//   user?:{name,photo?}, summary?:{title,line,facts?:[{label,value}]}, resource?, layout? }
// layout: { mode:"tile"|"float", windows:{[app]:{x,y,w,h,minimized}}, order:[app] }.
// Window bounds are normalized. onWindowChange(app,bounds) commits only a completed
// gesture; onWindowFocus(app), onLayoutMode(mode), onViewportChange() notify the host.
// onBeforePaneFocus(app) runs before a user switch hides the previous app slot.
// resource: { name, app, intent, objectId, secondary?:{label,icon?,app,intent,objectId}, share? }.
// setPane("fitness"|"weather"|"markets"|"chats"|"mail"|"app", {title,line,pick?,actions,sections,section,busy,error}).
import { el, icon, avatar } from "./ui.js";
import { LAUNCHER_APPS, initialFavourites, normaliseFavourites, toggleFavourite, moveFavourite } from "./launcher-model.js";
import { launcherInput, animateOrder, stopOrder } from "./launcher-input.js";
import { captureLauncherOrigin } from "./launcher-motion.js";
import { WINDOW_APPS, normalizeLayout, normalizeWindow, pixelBounds, relativeBounds, snapWindow } from "./workspace-windows.js";

let serial = 0;
const APP_NAMES = { calendar:"Calendar", notes:"Notes", people:"People", fitness: "Fitness", weather: "Weather", markets: "Markets", chats: "Chats", mail: "Mail" };
const APP_ICONS = { chats: "chat" };
const asText = value => value == null ? "" : String(value);
const words = (node, value) => { const text = asText(value); if (node.textContent !== text) node.textContent = text; };
const callable = value => typeof value === "function";
const appSymbol = app => icon(null, { app: APP_ICONS[app] || app, size: 32 });
function badge(button,state){
  button.querySelector('.wsl-badge')?.remove();button.removeAttribute('aria-description');
  if(!state)return;button.setAttribute('aria-description',state.label);
  (button.querySelector('.ws-dock-symbol')||button).append(el('span',{class:'wsl-badge','aria-hidden':'true',data:{status:state.kind},text:state.text}));
}

export function createWorkspaceView(root, callbacks = {}) {
  const uid = `ifl-workspace-${++serial}`, actions = new Map(), cleanups = [], panes = new Map();
  let launcherRefresh=null;
  let gone = false, model = {}, focusedApp = "", avatarKey = "", gesture = null, frame = 0, menuEpoch = 0, motion = null;
  const windowsEnabled = callable(callbacks.onWindowChange);
  const listen = (node, type, fn, options) => { node.addEventListener(type, fn, options); cleanups.push(() => node.removeEventListener(type, fn, options)); };
  const action = (key, run) => { if (callable(run)) actions.set(key, run); else actions.delete(key); return key; };
  const button = (label, glyph, key, cls = "ws-icon-button") => el("button", { type: "button", class: cls, "aria-label": label, title: label, data: { wsAction: key } }, glyph ? icon(glyph) : null);
  const bindButton = (label, glyph, key, run, cls) => callable(run) ? button(label, glyph, action(key, run), cls) : null;
  const setCurrent = (node, selected) => { if (!node) return; if (selected) node.setAttribute("aria-current", "page"); else node.removeAttribute("aria-current"); };
  const paneApp = key => key === "app" ? model.activeApp : key;
  const paneApps = () => {
    const list = Array.isArray(model.paneApps) ? [...new Set(model.paneApps.filter(app => WINDOW_APPS.includes(app)))] : [];
    return list.length ? list : ["fitness", "weather"];
  };
  const invoke = (name, ...args) => { if (!gone && callable(callbacks[name])) return callbacks[name](...args); };
  const brand = (cls, title) => el("span", { class: cls }, el("img", { class: "ws-brand-mark", src: "/inflite.svg", alt: "", width: 48, height: 48 }), el("span", { text: title }));

  function reconcile(container, records, items, keyOf, make, paint) {
    const keys = new Set(items.map(keyOf));
    for (const [key, node] of records) if (!keys.has(key)) { node.remove(); records.delete(key); }
    items.forEach((item, index) => {
      const key = keyOf(item); let node = records.get(key);
      if (!node) { node = make(item); records.set(key, node); }
      paint(node, item);
      if (container.children[index] !== node) container.insertBefore(node, container.children[index] || null);
    });
  }

  const sideBrand = callable(callbacks.onToday) ? bindButton("Go to Today", null, "today", opener => invoke("onToday", opener), "ws-brand-button") : el("div", { class: "ws-brand-button" });
  sideBrand.append(brand("ws-brand", "InFlite"));
  const todaySide = callable(callbacks.onToday) ? bindButton("Today", "calendar", "today", opener => invoke("onToday", opener), "ws-sidebar-button") : null;
  if (todaySide) todaySide.append(el("span", { text: "Today" }));
  const savedNav = el("div", { class: "ws-saved-nav" }), savedRecords = new Map();
  const sideNav = el("nav", { class: "ws-workspace-nav", "aria-label": "InFlite" }, todaySide, savedNav);
  const create = callable(callbacks.onCreateWorkspace) ? bindButton("New workspace", "plus", "create-workspace", opener => invoke("onCreateWorkspace", opener), "ws-sidebar-button ws-create") : null;
  const files = callable(callbacks.onFiles) ? bindButton("Files", "file", "files", opener => invoke("onFiles", opener), "ws-sidebar-button") : null;
  if (files) files.append(el("span", { text: "Files" }));
  const activity = callable(callbacks.onActivity) ? bindButton("Activity", "clock", "activity", () => invoke("onActivity"), "ws-sidebar-button") : null;
  const activityCount = el("span", { class: "ws-system-count", hidden: true, "aria-hidden": "true" });
  if (activity) activity.append(el("span", { text: "Activity" }), activityCount);
  const sync = callable(callbacks.onSync) ? bindButton("Workspace sync", "swap", "sync", () => invoke("onSync"), "ws-sidebar-button") : null;
  const syncState = el("span", { class: "ws-sync-state", text: "This device", "aria-hidden": "true" });
  if (sync) sync.append(el("span", { text: "Sync" }), syncState);
  const settings = callable(callbacks.onSettings) ? bindButton("Settings", "settings", "settings", opener => invoke("onSettings", opener), "ws-sidebar-button") : null;
  if (settings) settings.append(el("span", { text: "Settings" }));
  const sideFoot = el("div", { class: "ws-sidebar-foot" }, files, activity, sync, settings);
  const sidebar = el("aside", { class: "ws-sidebar", "aria-label": "InFlite navigation" }, sideBrand,
    el("p", { class: "ws-nav-label", text: callable(callbacks.onWorkspace) ? "Workspaces" : "Navigate" }), sideNav, create, sideFoot);
  if (create) { create.hidden = !callable(callbacks.onCreateWorkspace); create.append(el("span", { text: "New workspace" })); }
  sideFoot.hidden = !files && !activity && !sync && !settings;

  const heading = el("h1", { class: "ws-title", id: `${uid}-title` }, el("span", { class: "ws-title-desktop" }), el("span", { class: "ws-title-mobile" }));
  const headingLine = el("p", { class: "ws-heading-line", hidden: true });
  const phoneBrand = el("img", { class: "ws-phone-mark", src: "/inflite.svg", alt: "", width: 36, height: 36 });
  const back = bindButton("Back", "back", "back", opener => invoke("onPaneBack", model.mode === "app" ? model.activeApp : model.foregroundApp || "fitness", opener), "ws-icon-button ws-phone-only");
  if (back) back.hidden = true;
  const headingBox = el("div", { class: "ws-heading" }, phoneBrand, el("div", { class: "ws-heading-copy" }, heading, headingLine));
  const homeMode = callable(callbacks.onToday) ? bindButton("Show Today", null, "today-mode", () => invoke("onToday"), "ws-mode-button") : null;
  const workspaceMode = callable(callbacks.onWorkspaceMode) ? bindButton("Open Workspaces", null, "workspace-mode", () => invoke("onWorkspaceMode"), "ws-mode-button") : null;
  if (homeMode) homeMode.append(el("span", { text: "Today" }));
  if (workspaceMode) workspaceMode.append(el("span", { text: "Workspaces" }));
  const modes = el("div", { class: "ws-mode-switch", role: "group", "aria-label": "InFlite view" }, homeMode, workspaceMode);
  const search = callable(callbacks.onSearch) ? button("Search InFlite", "search", action("search", opener => invoke("onSearch", opener)), "ws-search") : null;
  if (search) {
    search.append(el("span", { text: "Search InFlite" }), el("kbd", { class: "ws-shortcut-key", text: /Mac|iPhone|iPad/.test(globalThis.navigator?.platform || "") ? "⌘ K" : "Ctrl K" }));
    search.setAttribute("aria-keyshortcuts", "Control+K Meta+K");
  }
  const appsHeader = callable(callbacks.onApps) ? bindButton("Open apps", "grid", "apps", opener => invoke("onApps", opener), "ws-icon-button ws-phone-only") : null;
  const manage = callable(callbacks.onManageWorkspace) ? bindButton("Workspace options", "more", "manage-workspace", opener => invoke("onManageWorkspace", model.activeId, opener), "ws-icon-button") : null;
  if (manage) manage.hidden = true;
  const layoutButton = windowsEnabled ? button("Float windows", null, action("window-layout", () => changeMode(model.layout?.mode === "float" ? "tile" : "float")), "ws-icon-button ws-layout-button ws-desktop-only") : null;
  layoutButton?.append(el("span", { class: "ws-layout-mark", "aria-hidden": "true" }));
  const switchButton = windowsEnabled ? button("Open windows", "grid", action("window-switcher", opener => openSwitcher(opener)), "ws-icon-button ws-switch-button") : null;
  if (layoutButton) layoutButton.hidden = true;
  if (switchButton) switchButton.hidden = true;
  const notifications = callable(callbacks.onNotifications) ? bindButton("Notifications", "bell", "notifications", opener => invoke("onNotifications", opener), "ws-icon-button ws-desktop-only") : null;
  const notificationCount = el("span", { class: "ws-notification-count", hidden: true, "aria-hidden": "true" });
  notifications?.append(notificationCount);
  const account = callable(callbacks.onAccount) ? button("Your account", null, action("account", opener => invoke("onAccount", opener)), "ws-icon-button ws-account") : null;
  account?.append(icon("person"));
  const capture=callable(callbacks.onCapture)?bindButton("Quick Capture","plus","capture",()=>invoke("onCapture"),"ws-icon-button ws-capture"):null;
  const toolbar = el("header", { class: "ws-toolbar", role: "banner" }, back, headingBox, search, el("div", { class: "ws-header-actions" }, capture, appsHeader, layoutButton, switchButton, manage, notifications, account));

  const phoneChips = el("nav", { class: "ws-workspace-chips", "aria-label": "Workspaces" }), chipRecords = new Map();
  const cardTitle = el("h3", { class: "ws-summary-title" }), cardLine = el("p", { class: "ws-summary-line" }), cardFacts = el("dl", { class: "ws-summary-facts" });
  const summaryOpen = button("Open ride workspace", "chev", "open-workspace", "ws-summary-open");
  const summarySymbols = el("div", { class: "ws-summary-symbols", "aria-hidden": "true" }, appSymbol("fitness"), icon("plus"), appSymbol("weather"));
  const card = el("section", { class: "ws-workspace-card", "aria-labelledby": `${uid}-summary` },
    el("div", { class: "ws-summary-head" }, el("div", { class: "ws-summary-copy" }, cardTitle, cardLine), summaryOpen), summarySymbols, cardFacts,
    button("Open ride workspace", null, "open-workspace", "ws-primary ws-open-workspace"));
  cardTitle.id = `${uid}-summary`; card.lastElementChild.textContent = "Open ride workspace";
  const homeTitle = el("h2", { class: "ws-home-title", text: "Your day, together" });
  const overview = el("section", { class: "ws-home-overview", "aria-label": "Your workspaces" }, homeTitle, phoneChips, card);
  const todaySlot = el("div", { class: "ws-today-slot", data: { workspaceSlot: "today" } });
  const recentRows = el("div", { class: "ws-resume-rows" }), recentRecords = new Map();
  const recentPanel = el("section", { class: "ws-home-panel", "aria-label": "Pick up where you left off", hidden: true }, el("h2", { text: "Pick up where you left off" }), recentRows);
  const activityRows = el("div", { class: "ws-home-activity-rows" }), activityRecords = new Map();
  const activityOpen = callable(callbacks.onActivity) ? bindButton("Open Activity", "chev", "home-activity", () => invoke("onActivity"), "ws-home-panel-open") : null;
  activityOpen?.prepend(el("span", { text: "Activity" }));
  const activityPanel = el("section", { class: "ws-home-panel", "aria-label": "Recent activity", hidden: true }, activityOpen || el("h2", { text: "Activity" }), activityRows);
  const homeSide = el("aside", { class: "ws-home-side", "aria-label": "Continue and activity", hidden: true }, recentPanel, activityPanel);
  const homeBody = el("div", { class: "ws-home-body" }, todaySlot, homeSide);
  const todayView = el("div", { class: "ws-home" }, overview, homeBody);

  const foregroundTabs = el("div", { class: "ws-pane-tabs", role: "tablist", "aria-label": "Ride workspace apps" });
  const foregroundButtons = new Map();
  for (const app of WINDOW_APPS) {
    const b = button(APP_NAMES[app], null, action(`focus:${app}`, () => { if (windowsEnabled && layoutOf().windows[app]?.minimized) restoreWindow(app); else { foreground(app); focusWindow(app); invoke("onPaneFocus", app); } }), "ws-pane-tab");
    b.setAttribute("role", "tab"); b.append(appSymbol(app), el("span", { text: APP_NAMES[app] }));
    foregroundTabs.append(b); foregroundButtons.set(app, b);
  }

  function makePane(key) {
    const app = key === "app" ? "" : key, name = APP_NAMES[app] || "App";
    const title = el("h2", { class: "ws-pane-title", id: `${uid}-${key}-title`, text: name }), line = el("p", { class: "ws-pane-line", hidden: true });
    const symbol = el("span", { class: "ws-pane-symbol", "aria-hidden": "true" }, app ? appSymbol(app) : null);
    const paneBack = button(`Back in ${name}`, "back", action(`pane-back:${key}`, opener => invoke("onPaneBack", paneApp(key), opener)));
    paneBack.hidden = true;
    const pick = button("Choose a place", null, action(`pick:${key}`, opener => panes.get(key)?.spec.pick?.run?.(opener)), "ws-pane-pick");
    const pickText = el("span"); pick.append(pickText, icon("down")); pick.hidden = true;
    const buttons = el("div", { class: "ws-pane-actions" });
    const open = callable(callbacks.onPaneOpen) ? button(`Open ${name}`, "open", action(`expand:${key}`, opener => invoke("onPaneOpen", paneApp(key), opener))) : null;
    const windowOptions = key !== "app" && windowsEnabled ? button(`${name} window options`, "down", action(`window-menu:${key}`, opener => openWindowMenu(key, opener)), "ws-icon-button ws-window-options") : null;
    windowOptions?.setAttribute("aria-haspopup", "menu"); windowOptions?.setAttribute("aria-expanded", "false");
    const resizeHandle = key !== "app" && windowsEnabled ? el("span", { class: "ws-resize-handle", "aria-hidden": "true", data: { resizeWindow: key } }) : null;
    const busyMark = el("span", { class: "ws-busy-mark", "aria-hidden": "true", hidden: true });
    const sectionNav = el("div", { class: "ws-pane-sections", role: "tablist", "aria-label": `${name} sections`, hidden: true });
    const statusTitle = el("b"), statusText = el("p"), statusActions = el("div", { class: "ws-status-actions" });
    const status = el("div", { class: "ws-pane-status", role: "status", hidden: true }, statusTitle, statusText, statusActions);
    const slot = el("div", { class: "ws-module-slot", data: { workspaceSlot: key } });
    const pane = el("section", { class: "ifl-workspace-pane", id: `${uid}-${key}`, tabindex: "-1", data: { pane: key }, "aria-label": `${name} workspace window` },
      el("header", { class: "ws-pane-header" }, paneBack, symbol, el("div", { class: "ws-pane-heading" }, title, pick, line), busyMark, buttons, windowOptions, open), sectionNav, status, slot, resizeHandle);
    const record = { el: pane, slot, title, line, symbol, pick, pickText, buttons, open, windowOptions, resizeHandle, paneBack, busyMark, sectionNav, status, statusTitle, statusText, statusActions,
      spec: { title: name, busy: true }, actionRecords: new Map(), sectionRecords: new Map() };
    panes.set(key, record); return pane;
  }
  const paneGrid = el("div", { class: "ws-pane-grid" }, ...WINDOW_APPS.map(makePane));
  for (const [app, b] of foregroundButtons) b.setAttribute("aria-controls", panes.get(app).el.id);
  const rideView = el("section", { class: "ws-ride", "aria-label": "Ride workspace", hidden: true }, foregroundTabs, paneGrid);
  const appView = el("section", { class: "ws-single-app", "aria-label": "App", hidden: true }, makePane("app"));
  const resourceName = el("span", { class: "ws-resource-name" }), resourceMain = button("Open file", "file", "resource", "ws-resource-open");
  resourceMain.append(resourceName);
  const secondaryIcon = el("span", { class: "ws-resource-secondary-icon", "aria-hidden": "true" }), secondaryLabel = el("span");
  const share = button("Workspace file action", null, "share-resource", "ws-resource-share"); share.append(secondaryIcon, secondaryLabel);
  const resource = el("section", { class: "ws-resource", "aria-label": "Workspace file", hidden: true }, resourceMain, share);
  const filesSlot = el("div", { class: "ws-files-slot", data: { workspaceSlot: "files" } });
  const filesView = el("div", { class: "ws-files-view", hidden: true, inert: true }, filesSlot);
  const canvas = el("div", { class: "ws-canvas" }, todayView, rideView, appView, filesView, resource);
  const windowMenu = el("div", { class: "ws-window-menu", role: "menu", hidden: true });
  const keyboardHint = el("p", { class: "ws-window-hint", role: "status", hidden: true });
  const closedWindows = el("div", { class: "ws-windows-empty", hidden: true }, el("h2", { text: "Your windows are minimised" }), el("p", { text: "Choose a window to pick up where you left off." }), button("Open windows", "grid", "window-switcher", "ws-secondary"));
  rideView.append(closedWindows);
  canvas.append(windowMenu, keyboardHint);
  if (homeMode && workspaceMode) toolbar.insertBefore(modes, search || toolbar.lastElementChild);
  const offline = el("p", { class: "ws-offline", role: "status", hidden: true, text: "You’re offline. Open apps keep their current view. Sending and cloud files need a connection." });
  const main = el("div", { class: "ws-main" }, toolbar, offline, canvas);
  const dock = el("nav", { class: "ws-dock", "aria-label": "Apps" }), dockRecords = new Map();
  const dockToday = callable(callbacks.onToday) ? button("Today", null, "today", "ws-dock-button") : null;
  dockToday?.append(el("span", { class: "ws-dock-symbol ws-dock-today" }, icon("sun")), el("span", { class: "ws-dock-label", text: "Today" }));
  const dockApps = el("div", { class: "ws-dock-apps" });
  const launcher = callable(callbacks.onApps) ? button("All apps", "grid", "apps", "ws-dock-button ws-dock-launcher") : null;
  launcher?.append(el("span",{class:"ws-dock-label",text:"Apps"}));
  const dockSelection=el("span",{class:"ws-dock-selection","aria-hidden":"true"});
  dock.append(dockSelection,...[dockToday, dockApps, launcher].filter(Boolean));
  const launcherOpen = value => {
    if (gone) return;
    dock.toggleAttribute("data-launcher-open", value);
    launcher?.setAttribute("aria-expanded", String(value));
  };
  function selectDock(animate = true) {
    const selected = dock.querySelector("button[aria-current]") || launcher;
    if (!selected?.offsetWidth) return;
    // Use the slot's layout position even while its button is pressed or reordering.
    const width = selected.offsetWidth;
    const x = selected.offsetLeft;
    const pose = x + ":" + width;
    if (animate && dockSelection.dataset.pose === pose) return;
    dockSelection.toggleAttribute("data-glide", animate && !!dockSelection.dataset.pose && !dock.hasAttribute("data-launcher-open"));
    dockSelection.style.width = width + "px";
    dockSelection.style.transform = `translateX(${x}px)`;
    dockSelection.dataset.pose = pose;
  }
  const dockHost = el("div", { class: "ifl-workspace ws-dock-host" }, dock);
  const fileToken = event => Array.from(event.dataTransfer?.types || []).includes("application/x-inflite-files-token");
  const dropTarget = event => { const node = event.target?.closest?.("[data-app-drop]"); return node && dock.contains(node) && ["mail", "fitness"].includes(node.dataset.appDrop) ? node : null; };
  listen(dock, "dragover", event => { const node = dropTarget(event); if (!node || !fileToken(event) || !callable(callbacks.onAppDrop)) return; event.preventDefault(); event.dataTransfer.dropEffect = "copy"; node.dataset.dropReady = "true"; });
  listen(dock, "dragleave", event => { const node = dropTarget(event); if (node && !node.contains(event.relatedTarget)) delete node.dataset.dropReady; });
  listen(dock, "dragend", () => { for (const node of dock.querySelectorAll("[data-drop-ready]")) delete node.dataset.dropReady; });
  listen(dock, "drop", event => { const node = dropTarget(event); if (!node || !fileToken(event) || !callable(callbacks.onAppDrop)) return; const token = event.dataTransfer.getData("application/x-inflite-files-token"); delete node.dataset.dropReady; if (!/^[a-f0-9]{32}$/.test(token)) return; event.preventDefault(); event.stopPropagation(); invoke("onAppDrop", node.dataset.appDrop, token); });
  const dockAnchor = el("div", { class: "ws-dock-anchor" }, dockHost);
  const sidebarAnchor = el("div", { class: "ws-sidebar-anchor" }, sidebar);
  const shell = el("div", { class: "ws-shell" }, sidebarAnchor, main, dockAnchor);
  root.classList.add("ifl-workspace"); root.replaceChildren(shell);

  const desktop = () => matchMedia("(min-width: 960px)").matches;
  const layoutOf = () => normalizeLayout(model.layout, paneApps());
  function getViewport() {
    const r = paneGrid.getBoundingClientRect();
    return { width: r.width, height: r.height, left: r.left, top: r.top };
  }
  function isPaneVisible(app) {
    const pane = panes.get(app)?.el;
    if (gone || model.mode !== "workspace" || !pane || pane.hidden || !paneApps().includes(app) || layoutOf().windows[app]?.minimized) return false;
    if (!desktop()) return root.dataset.foregroundApp === app;
    const r = pane.getBoundingClientRect(), box = paneGrid.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && r.right > box.left && r.left < box.right && r.bottom > box.top && r.top < box.bottom;
  }
  function revealPane(app) {
    const pane = panes.get(app)?.el;
    if (gone || model.mode !== "workspace" || !pane || pane.hidden || !paneApps().includes(app)) return false;
    if (!desktop() || layoutOf().mode !== "tile") return isPaneVisible(app);
    const r = pane.getBoundingClientRect(), box = paneGrid.getBoundingClientRect();
    let top = paneGrid.scrollTop, left = paneGrid.scrollLeft;
    if (r.top < box.top || r.height > box.height) top += r.top - box.top;
    else if (r.bottom > box.bottom) top += r.bottom - box.bottom;
    if (r.left < box.left || r.width > box.width) left += r.left - box.left;
    else if (r.right > box.right) left += r.right - box.right;
    // Only the workspace canvas moves. Native composers and document scroll stay
    // anchored, and scroll listeners can wake the newly visible real app host.
    paneGrid.scrollTop = Math.max(0, top); paneGrid.scrollLeft = Math.max(0, left);
    return isPaneVisible(app);
  }
  function paintWindows() {
    const layout = layoutOf(), available = paneApps(), visible = available.filter(app => !layout.windows[app].minimized);
    root.dataset.layout = layout.mode; root.dataset.windowCount = String(visible.length);
    root.classList.toggle("ws-window-manager", windowsEnabled);
    const size = getViewport();
    for (const app of WINDOW_APPS) {
      const p = panes.get(app), exists = available.includes(app), minimized = exists && !!layout.windows[app].minimized;
      p.el.dataset.minimized = String(minimized);
      p.el.hidden = !exists || minimized;
      p.el.inert = p.el.hidden || (!desktop() && root.dataset.foregroundApp !== app);
      p.el.style.setProperty("--ws-z", String(layout.order.indexOf(app) + 1));
      p.el.classList.toggle("is-front", app === layout.order.filter(id => visible.includes(id)).at(-1));
      if (exists && layout.mode === "float" && desktop()) {
        const b = pixelBounds(layout.windows[app], size.width, size.height);
        for (const [name, value] of Object.entries(b)) p.el.style.setProperty(`--ws-${name}`, `${value}px`);
        p.el.classList.toggle("is-compact", b.w < 420);
      } else p.el.classList.toggle("is-compact", desktop() && (visible.length > 1 ? (size.width - 16) / 2 : size.width) < 420);
      p.resizeHandle?.toggleAttribute("hidden", !exists || layout.mode !== "float" || !desktop());
      const b = foregroundButtons.get(app);
      b.dataset.minimized = String(minimized); b.setAttribute("aria-label", minimized ? `Restore ${APP_NAMES[app]}` : APP_NAMES[app]);
    }
    closedWindows.hidden = model.mode !== "workspace" || visible.length > 0;
    if (layoutButton) {
      layoutButton.hidden = model.mode !== "workspace";
      layoutButton.setAttribute("aria-label", layout.mode === "float" ? "Tile windows" : "Float windows");
      layoutButton.title = layoutButton.getAttribute("aria-label"); layoutButton.setAttribute("aria-pressed", String(layout.mode === "float"));
    }
    if (switchButton) switchButton.hidden = model.mode !== "workspace";
    if (appsHeader) appsHeader.hidden = model.mode === "workspace" && windowsEnabled;
  }
  function focusWindow(app) {
    if (!windowsEnabled || !paneApps().includes(app)) return;
    const layout = layoutOf();
    model.layout = { ...layout, order: [...layout.order.filter(id => id !== app), app] };
    paintWindows(); invoke("onWindowFocus", app);
  }
  function changeMode(mode) {
    if (!windowsEnabled || gone || model.mode !== "workspace") return;
    finishGesture(false); closeWindowMenu();
    model.layout = { ...layoutOf(), mode: mode === "float" ? "float" : "tile" };
    paintWindows(); invoke("onLayoutMode", model.layout.mode);
  }
  function setWindow(app, patch, { commit = true, floating = false } = {}) {
    if (!windowsEnabled || gone || !paneApps().includes(app)) return;
    const layout = layoutOf(), next = normalizeWindow({ ...layout.windows[app], ...patch }, layout.windows[app]), changedMode = floating && layout.mode !== "float";
    model.layout = { ...layout, mode: floating ? "float" : layout.mode, windows: { ...layout.windows, [app]: next } };
    paintWindows();
    if (commit) { if (changedMode) invoke("onLayoutMode", "float"); invoke("onWindowChange", app, next); }
  }
  function restoreWindow(app) {
    if (!paneApps().includes(app)) return;
    setWindow(app, { minimized: false }); foreground(app); focusWindow(app); invoke("onPaneFocus", app);
    closeWindowMenu(); panes.get(app)?.el.focus({ preventScroll: true });
  }
  function windowAction(app, command) {
    command = ({ minimize: "minimise", maximize: "maximise", "snap-left": "left", "snap-right": "right" })[command] || command;
    if (!windowsEnabled || gone || !paneApps().includes(app)) return false;
    closeWindowMenu();
    if (command === "restore") { restoreWindow(app); return true; }
    if (command === "minimise") {
      const next = paneApps().find(id => id !== app && !layoutOf().windows[id].minimized);
      invoke("onBeforePaneFocus", next || app);
      setWindow(app, { minimized: true });
      if (next) { foreground(next, false); invoke("onPaneFocus", next); panes.get(next).el.focus({ preventScroll: true }); }
      else switchButton?.focus({ preventScroll: true });
      return true;
    }
    if (["left", "right", "maximise", "restore-size"].includes(command)) {
      setWindow(app, snapWindow(command), { floating: true }); foreground(app); focusWindow(app); invoke("onPaneFocus", app); panes.get(app).el.focus({ preventScroll: true }); return true;
    }
    if (command === "move" || command === "resize") { startKeyboard(app, command); return true; }
    return false;
  }
  function closeWindowMenu(restoreFocus = false) {
    ++menuEpoch;
    const opener = windowMenu._opener;
    windowMenu.hidden = true; windowMenu.replaceChildren();
    opener?.setAttribute("aria-expanded", "false"); windowMenu._opener = null;
    if (restoreFocus && opener?.isConnected && !opener.closest("[hidden],[inert]")) opener.focus({ preventScroll: true });
  }
  function showWindowMenu(app, opener, switcher) {
    if (!windowMenu.hidden && windowMenu._opener === opener) { closeWindowMenu(true); return; }
    closeWindowMenu();
    windowMenu.setAttribute("aria-label", switcher ? "Open windows" : `${APP_NAMES[app]} window`);
    windowMenu._opener = opener; opener?.setAttribute("aria-expanded", "true"); opener?.setAttribute("aria-haspopup", "menu");
    const epoch = menuEpoch, owner = model.activeId, owned = () => !gone && !windowMenu.hidden && menuEpoch === epoch && model.activeId === owner && model.mode === "workspace";
    const option = (label, fn, glyph) => {
      const b = el("button", { type: "button", role: "menuitem", class: "ws-window-option" }, glyph ? icon(glyph) : null, el("span", { text: label }));
      b.addEventListener("click", () => { if (owned()) fn(); }); windowMenu.append(b);
    };
    if (switcher) for (const id of paneApps()) {
      const minimized = layoutOf().windows[id].minimized;
      const b = el("button", { type: "button", role: "menuitem", class: "ws-window-option", "aria-label": `${minimized ? "Restore" : "Switch to"} ${APP_NAMES[id]}` }, appSymbol(id), el("span", { text: APP_NAMES[id] }), el("small", { text: minimized ? "Minimised" : "Open" }));
      b.addEventListener("click", () => { if (owned()) restoreWindow(id); }); windowMenu.append(b);
    } else {
      if (desktop()) {
        option("Snap left", () => windowAction(app, "left")); option("Snap right", () => windowAction(app, "right"));
        option("Maximise", () => windowAction(app, "maximise")); option("Restore size", () => windowAction(app, "restore-size"));
        option("Move with arrow keys", () => windowAction(app, "move")); option("Resize with arrow keys", () => windowAction(app, "resize"));
      }
      option("Minimise", () => windowAction(app, "minimise"));
    }
    windowMenu.hidden = false;
    const box = canvas.getBoundingClientRect(), r = opener?.getBoundingClientRect() || box, width = Math.min(284, Math.max(160, box.width - 24));
    windowMenu.style.setProperty("--ws-menu-x", `${Math.max(8, Math.min(box.width - width - 8, r.right - box.left - width))}px`);
    windowMenu.style.setProperty("--ws-menu-y", `${Math.max(8, Math.min(box.height - 100, r.bottom - box.top + 8))}px`);
    windowMenu.style.setProperty("--ws-menu-width", `${width}px`);
    windowMenu.querySelector("button")?.focus({ preventScroll: true });
  }
  const openWindowMenu = (app, opener) => showWindowMenu(app, opener, false);
  const openSwitcher = (opener) => showWindowMenu(null, opener, true);
  function startKeyboard(app, type) {
    if (!desktop()) return;
    finishGesture(false);
    const layout = layoutOf(), size = getViewport(), before = layout.windows[app];
    gesture = { app, type, keyboard: true, owner: model.activeId, before, beforeMode: layout.mode, size };
    setWindow(app, before, { commit: false, floating: true });
    keyboardHint.hidden = false; keyboardHint.textContent = `${type === "move" ? "Move" : "Resize"} ${APP_NAMES[app]}. Use arrow keys, Enter to save, Escape to cancel.`;
    panes.get(app).el.classList.add("is-adjusting"); panes.get(app).el.tabIndex = -1; panes.get(app).el.focus({ preventScroll: true });
  }
  function finishGesture(commit = true) {
    const g = gesture; if (!g) return;
    gesture = null; g.abort?.abort(); cancelAnimationFrame(frame); frame = 0;
    root.classList.remove("is-window-dragging"); keyboardHint.hidden = true; keyboardHint.textContent = "";
    panes.get(g.app)?.el.classList.remove("is-adjusting");
    if (gone || g.owner !== model.activeId || model.mode !== "workspace") return;
    if (!commit) { setWindow(g.app, g.before, { commit: false }); model.layout.mode = g.beforeMode; paintWindows(); return; }
    const completed = layoutOf().windows[g.app], mode = model.layout.mode;
    if (g.beforeMode !== mode) invoke("onLayoutMode", mode);
    invoke("onWindowChange", g.app, completed);
  }
  function pointerGesture(event) {
    if (!windowsEnabled || !desktop() || model.mode !== "workspace" || event.button || event.isPrimary === false) return;
    const target = event.target, handle = target.closest?.("[data-resize-window]"), header = target.closest?.(".ws-pane-header"), pane = target.closest?.(".ws-pane-grid > .ifl-workspace-pane");
    if (!pane || (!handle && (!header || target.closest("button,a,input,textarea,select")))) return;
    const app = pane.dataset.pane; if (!paneApps().includes(app)) return;
    finishGesture(false); closeWindowMenu();
    const size = getViewport(), r = pane.getBoundingClientRect(), before = layoutOf().windows[app], mode = layoutOf().mode, rect = { x: r.left - size.left, y: r.top - size.top, w: r.width, h: r.height };
    const ac = new AbortController(), id = event.pointerId, sx = event.clientX, sy = event.clientY;
    let moved = false;
    const g = gesture = { app, type: handle ? "resize" : "move", owner: model.activeId, before, beforeMode: mode, size, abort: ac };
    const move = e => {
      if (e.pointerId !== id || gesture !== g) return;
      const dx = e.clientX - sx, dy = e.clientY - sy;
      if (!moved && Math.hypot(dx, dy) < 5) return;
      moved = true; e.preventDefault(); root.classList.add("is-window-dragging");
      const next = g.type === "resize" ? { ...rect, w: rect.w + dx, h: rect.h + dy } : { ...rect, x: rect.x + dx, y: rect.y + dy };
      const bounded = pixelBounds(relativeBounds(next, size.width, size.height), size.width, size.height);
      cancelAnimationFrame(frame); frame = requestAnimationFrame(() => { frame = 0; if (gesture === g) setWindow(app, relativeBounds(bounded, size.width, size.height), { commit: false, floating: true }); });
    };
    const up = e => {
      if (e.pointerId !== id || gesture !== g) return;
      if (frame) { cancelAnimationFrame(frame); frame = 0; }
      if (moved && e.type !== "pointercancel") {
        const dx = e.clientX - sx, dy = e.clientY - sy;
        let next = g.type === "resize" ? { ...rect, w: rect.w + dx, h: rect.h + dy } : { ...rect, x: rect.x + dx, y: rect.y + dy };
        let bounds = relativeBounds(pixelBounds(relativeBounds(next, size.width, size.height), size.width, size.height), size.width, size.height);
        if (g.type === "move") { if (e.clientY - size.top < 18) bounds = snapWindow("maximise"); else if (e.clientX - size.left < 18) bounds = snapWindow("left"); else if (size.left + size.width - e.clientX < 18) bounds = snapWindow("right"); }
        setWindow(app, bounds, { commit: false, floating: true }); focusWindow(app); finishGesture(true);
      } else finishGesture(false);
    };
    const opts = { signal: ac.signal };
    window.addEventListener("pointermove", move, { ...opts, passive: false }); window.addEventListener("pointerup", up, opts); window.addEventListener("pointercancel", up, opts);
    window.addEventListener("blur", () => finishGesture(false), opts);
    try { header?.setPointerCapture(id); } catch (_) {}
  }
  listen(root, "pointerdown", pointerGesture);
  listen(window, "pointerdown", e => { if (!windowMenu.hidden && !windowMenu.contains(e.target) && !windowMenu._opener?.contains(e.target)) closeWindowMenu(); }, { passive: true });
  listen(paneGrid, "scroll", () => { closeWindowMenu(); invoke("onViewportChange"); }, { passive: true });
  listen(window, "resize", () => { if (gesture) finishGesture(false); closeWindowMenu(); paintWindows(); invoke("onViewportChange"); }, { passive: true });
  listen(document, "visibilitychange", () => { if (document.hidden) { finishGesture(false); closeWindowMenu(); } });
  listen(windowMenu, "focusout", e => {
    if (windowMenu.contains(e.relatedTarget)) return;
    const epoch = menuEpoch;
    requestAnimationFrame(() => { if (epoch === menuEpoch && !windowMenu.hidden && !windowMenu.contains(document.activeElement)) closeWindowMenu(); });
  });
  listen(root, "focusout", e => { const g = gesture; if (g?.keyboard && e.relatedTarget && !panes.get(g.app).el.contains(e.relatedTarget)) finishGesture(false); });
  listen(root, "keydown", e => {
    if (!windowMenu.hidden && windowMenu.contains(e.target)) {
      const bs = [...windowMenu.querySelectorAll("button")], at = bs.indexOf(e.target);
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); closeWindowMenu(true); }
      else if (["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) { e.preventDefault(); const n = e.key === "Home" ? 0 : e.key === "End" ? bs.length - 1 : (at + (e.key === "ArrowDown" ? 1 : -1) + bs.length) % bs.length; bs[n]?.focus(); }
      return;
    }
    const g = gesture;
    if (!g?.keyboard || e.target !== panes.get(g.app)?.el) return;
    if (e.key === "Escape" || e.key === "Enter") { e.preventDefault(); e.stopPropagation(); finishGesture(e.key === "Enter"); return; }
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) return;
    e.preventDefault(); e.stopPropagation(); const b = pixelBounds(layoutOf().windows[g.app], g.size.width, g.size.height), step = e.shiftKey ? 64 : 16, dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0, dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
    const next = g.type === "resize" ? { ...b, w: b.w + dx, h: b.h + dy } : { ...b, x: b.x + dx, y: b.y + dy };
    setWindow(g.app, relativeBounds(pixelBounds(relativeBounds(next, g.size.width, g.size.height), g.size.width, g.size.height), g.size.width, g.size.height), { commit: false, floating: true });
  });

  function foreground(app, notify = true) {
    const available = paneApps();
    const visible = available.filter(id => !layoutOf().windows[id].minimized);
    if (!available.includes(app) || layoutOf().windows[app]?.minimized) app = visible[0] || available[0];
    if (notify && app !== root.dataset.foregroundApp) invoke("onBeforePaneFocus", app);
    model.foregroundApp = app;
    root.dataset.foregroundApp = app;
    root.dataset.paneCount = String(available.length);
    for (const [id, b] of foregroundButtons) {
      const selected = available.includes(id); b.hidden = !selected; panes.get(id).el.hidden = !selected || !!layoutOf().windows[id]?.minimized;
      panes.get(id).el.inert = panes.get(id).el.hidden || (!desktop() && id !== app);
      b.setAttribute("aria-selected", String(id === app)); b.tabIndex = id === app ? 0 : -1; panes.get(id).el.dataset.foreground = String(id === app);
    }
  }

  function markFocus(key) {
    const app = paneApp(key); if (!app || focusedApp === app && (model.mode !== "workspace" || layoutOf().order.at(-1) === app)) return;
    if (WINDOW_APPS.includes(app)) foreground(app);
    focusedApp = app; root.dataset.focusedApp = app;
    focusWindow(app); invoke("onPaneFocus", app);
  }

  // Animate retained elements only; cancellation never removes an app or editor.
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const stopMotion = () => { motion?.cancel(); motion = null; };
  listen(reduced, "change", () => { if (reduced.matches) stopMotion(); });
  listen(document, "visibilitychange", () => { if (document.hidden) stopMotion(); });
  function enter(node, spatial = false) {
    stopMotion();
    if (gone || document.hidden || document.documentElement.dataset.vt || reduced.matches || !node?.animate || !node.getClientRects().length) return;
    try {
      motion = node.animate([{ opacity: .6, transform: spatial ? "translateY(8px)" : "none" }, { opacity: 1, transform: "none" }], { duration: 220, easing: "cubic-bezier(.2,.8,.2,1)" });
      motion.finished.catch(() => {});
    } catch (_) {}
  }
  function setPane(key, patch = {}) {
    if (gone) return;
    const p = panes.get(key); if (!p) return;
    const previousSection = p.spec.section;
    p.spec = { ...p.spec, ...patch }; const s = p.spec, app = paneApp(key), name = APP_NAMES[app] || "App";
    words(p.title, s.title || name);
    p.title.title = asText(s.title || name);
    const line = s.line?.nodeType ? s.line.textContent : s.line;
    words(p.line, line); p.line.hidden = !asText(line);
    p.pick.hidden = !callable(s.pick?.run);
    p.title.hidden = !p.pick.hidden;
    words(p.pickText, s.pick?.text || s.title || s.pick?.label || "Choose");
    p.pick.setAttribute("aria-label", asText(s.pick?.label || s.title || "Choose"));
    p.paneBack.hidden = !s.back || !callable(callbacks.onPaneBack);
    p.open?.setAttribute("aria-label", `Open ${name}`); p.open?.setAttribute("title", `Open ${name}`);
    if (key === "app" && p.symbol.dataset.app !== app) { p.symbol.replaceChildren(app ? appSymbol(app) : null); p.symbol.dataset.app = app || ""; }
    const acts = (Array.isArray(s.actions) ? s.actions : Array.isArray(s.acts) ? s.acts : []).filter(a => a && callable(a.run) && a.label);
    reconcile(p.buttons, p.actionRecords, acts, a => asText(a.id || a.icon || a.label), a => button(a.label, a.icon || "more", `pane-action:${key}:${a.id || a.icon || a.label}`), (b, a) => {
      const id = `pane-action:${key}:${a.id || a.icon || a.label}`; action(id, opener => a.run(opener));
      b.setAttribute("aria-label", a.label); b.title = a.label; b.disabled = !!a.disabled;
    });
    const sections = Array.isArray(s.sections) && callable(callbacks.onPaneSection) ? s.sections.filter(a => Array.isArray(a) && a[0] && a[1]) : [];
    const selectedSection = sections.some(a => a[0] === s.section) ? s.section : sections[0]?.[0];
    p.sectionNav.hidden = !sections.length;
    reconcile(p.sectionNav, p.sectionRecords, sections, a => asText(a[0]), a => {
      const b = button(a[1], null, action(`section:${key}:${a[0]}`, () => invoke("onPaneSection", paneApp(key), a[0])), "ws-section-button"); b.setAttribute("role", "tab"); return b;
    }, (b, a) => { words(b, a[1]); b.setAttribute("aria-selected", String(a[0] === selectedSection)); b.tabIndex = a[0] === selectedSection ? 0 : -1; });
    if (previousSection && s.section !== previousSection && !p.el.hidden) enter(p.slot);
    p.el.setAttribute("aria-busy", String(!!s.busy)); p.busyMark.hidden = !s.busy;
    p.status.hidden = !s.error && (!s.busy || p.slot.childElementCount > 0);
    words(p.statusTitle, s.error?.title || (s.error ? `${name} couldn’t open` : `Opening ${name}…`));
    words(p.statusText, s.error?.message || s.error?.text || (typeof s.error === "string" ? s.error : ""));
    const retry = s.error?.retry || s.retry;
    if (s.error && callable(retry)) {
      if (!p.statusActions.firstChild) p.statusActions.append(button("Try again", null, `retry:${key}`, "ws-secondary"));
      words(p.statusActions.firstChild, "Try again"); action(`retry:${key}`, retry);
    } else { p.statusActions.replaceChildren(); actions.delete(`retry:${key}`); }
  }

  function update(next = {}) {
    if (gone) return;
    if (next.activeId && next.activeId !== model.activeId || next.mode && next.mode !== "workspace") closeWindowMenu();
    if (gesture && (next.activeId && next.activeId !== model.activeId || next.mode && next.mode !== "workspace")) finishGesture(false);
    if (next.activeId && next.activeId !== model.activeId) focusedApp = "";
    const heldLayout = gesture ? model.layout : null;
    const previousPage = `${model.mode}:${model.mode === "workspace" && model.activeId}`;
    model = { ...model, ...next };
    if (heldLayout) model.layout = heldLayout;
    const mode = /^(workspace|app|files)$/.test(model.mode) ? model.mode : "today", spaces = (Array.isArray(model.workspaces) ? model.workspaces : []).filter(w => w?.id && w.name && callable(callbacks.onWorkspace));
    const current = spaces.find(w => w.id === model.activeId), ride = spaces.find(w => w.id === "ride") || spaces.find(w => {
      const apps = Array.isArray(w.panes) ? w.panes.map(p => p.app) : Array.isArray(w.apps) ? w.apps : [];
      return apps.includes("fitness") && apps.includes("weather");
    });
    const apps = (Array.isArray(model.apps) ? model.apps : []).filter(a => a?.id && a.available !== false && callable(callbacks.onApp));
    const activeApp = apps.find(a => a.id === model.activeApp), title = mode === "files" ? "InFlite Files" : model.title || (mode === "workspace" ? `${current?.name || "Ride"} workspace` : mode === "app" ? activeApp?.name || APP_NAMES[model.activeApp] || "App" : "Today");
    root.dataset.mode = mode;
    root.dataset.unified = model.unifiedHome ? "true" : "false";
    words(homeTitle, model.unifiedHome ? model.greeting || "Your day, together" : "Your day, together");
    const recents = (Array.isArray(model.recentApps) ? model.recentApps : []).filter(item => APP_NAMES[item?.app] && callable(callbacks.onRecent)).slice(0, 4);
    recentPanel.hidden = !model.unifiedHome || !recents.length;
    reconcile(recentRows, recentRecords, recents, item => item.app, item => {
      const node = bindButton(`Continue in ${APP_NAMES[item.app]}`, null, `recent:${item.app}`, () => invoke("onRecent", item.app), "ws-resume-row");
      node.append(appSymbol(item.app), el("span", { text: APP_NAMES[item.app] }), icon("chev")); return node;
    }, () => {});
    const jobs = (Array.isArray(model.recentActivity) ? model.recentActivity : []).filter(item => item?.key && item?.title).slice(0, 3);
    activityPanel.hidden = !model.unifiedHome || !jobs.length;
    reconcile(activityRows, activityRecords, jobs, item => item.key, () => el("div", { class: "ws-home-activity-row" }, el("span", { class: "ws-home-job-icon", "aria-hidden": "true" }), el("div", {}, el("strong"), el("span"))), (node, item) => {
      const glyph = item.status === "succeeded" ? "check" : item.status === "failed" ? "warn" : item.status === "handed-off" ? "download" : item.status === "cancelled" ? "x" : "clock";
      if (node.dataset.status !== item.status) { node.dataset.status = item.status; node.firstChild.replaceChildren(icon(glyph)); }
      words(node.querySelector("strong"), item.title); words(node.lastElementChild.lastElementChild, item.detail || item.status);
    });
    homeSide.hidden = recentPanel.hidden && activityPanel.hidden; homeBody.dataset.side = String(!homeSide.hidden);
    modes.hidden = !homeMode || !workspaceMode;
    homeMode?.setAttribute("aria-pressed", String(mode === "today"));
    workspaceMode?.setAttribute("aria-pressed", String(mode === "workspace"));
    offline.hidden = model.connectionManaged || model.online !== false;
    const syncLabel = ({ synced: "Synced", syncing: "Syncing…", conflict: "Review", waiting: "Waiting", offline: "Offline", error: "Needs attention" })[model.syncStatus?.state] || "This device";
    words(syncState, syncLabel);
    const tasks = Math.max(0, Math.floor(Number(model.activityCount) || 0)); activityCount.hidden = !tasks; words(activityCount, tasks > 99 ? "99+" : tasks);
    if (mode === "today") canvas.removeAttribute("role"); else canvas.setAttribute("role", "main");
    words(heading.querySelector(".ws-title-desktop"), title);
    words(heading.querySelector(".ws-title-mobile"), mode === "workspace" ? current?.name || "Ride" : title);
    words(headingLine, model.subtitle); headingLine.hidden = !model.subtitle;
    rideView.setAttribute("aria-label", `${current?.name || "Ride"} workspace`);
    foregroundTabs.setAttribute("aria-label", `${current?.name || "Ride"} workspace apps`);
    appView.setAttribute("aria-label", activeApp?.name || APP_NAMES[model.activeApp] || "App");
    if (back) back.hidden = mode === "today" || mode === "files" || !callable(callbacks.onPaneBack);
    if (manage) manage.hidden = mode !== "workspace" || !current;
    todayView.hidden = mode !== "today"; rideView.hidden = mode !== "workspace"; appView.hidden = mode !== "app";
    filesView.hidden = mode !== "files"; filesView.inert = mode !== "files";
    foreground(model.foregroundApp || "fitness", false);
    if (previousPage !== `${model.mode}:${model.mode === "workspace" && model.activeId}`) enter(mode === "today" ? todayView : mode === "files" ? filesView : rideView, true);
    setCurrent(todaySide, mode === "today" && !model.settingsActive);
    setCurrent(settings, model.settingsActive);
    setCurrent(files, mode === "files");
    const paintWorkspace = (b, w) => { words(b.lastElementChild, w.name); setCurrent(b, mode === "workspace" && w.id === model.activeId); };
    const makeWorkspace = (w, cls) => {
      const b = button(w.name, (w.icon || (w.id === "ride" ? "ride" : "grid")), action(`workspace:${w.id}`, opener => invoke("onWorkspace", w.id, opener)), cls);
      b.append(el("span", { text: w.name })); return b;
    };
    reconcile(savedNav, savedRecords, spaces, w => w.id, w => makeWorkspace(w, "ws-sidebar-button"), paintWorkspace);
    const chips = [...(callable(callbacks.onToday) ? [{ id: "today", name: "Today", icon: "calendar" }] : []), ...spaces];
    reconcile(phoneChips, chipRecords, chips, w => w.id, w => {
      const b = makeWorkspace(w, "ws-workspace-chip"); if (w.id === "today") b.dataset.wsAction = "today"; return b;
    }, (b, w) => { words(b.lastElementChild, w.name); setCurrent(b, w.id === "today" ? mode === "today" && !model.settingsActive : mode === "workspace" && w.id === model.activeId); });
    card.hidden = !ride;
    action("open-workspace", ride ? opener => invoke("onWorkspace", ride.id, opener) : null);
    const openLabel = ride ? `Open ${ride.name} workspace` : "Open workspace";
    summaryOpen.setAttribute("aria-label", openLabel); summaryOpen.title = openLabel;
    words(card.lastElementChild, openLabel); card.lastElementChild.setAttribute("aria-label", openLabel);
    const summary = model.summary || model.ride || {};
    words(cardTitle, summary.title || ride?.name && `${ride.name} workspace` || "Ride workspace");
    words(cardLine, summary.line || "Fitness and Weather, together.");
    const facts = (Array.isArray(summary.facts) ? summary.facts : []).filter(f => f?.label && f.value != null);
    const factKey = JSON.stringify(facts.map(f => [f.label, f.value]));
    if (cardFacts.dataset.values !== factKey) { cardFacts.dataset.values = factKey; cardFacts.replaceChildren(...facts.map(f => el("div", {}, el("dt", { text: f.label }), el("dd", { text: f.value })))); }
    cardFacts.hidden = !facts.length;
    setCurrent(dockToday, mode === "today" && !model.settingsActive);
    const candidates=[...(callable(callbacks.onFiles)?[{id:"files",name:"Files",available:true,indicator:model.fileIndicator}]:[]),...(Array.isArray(model.apps)?model.apps:[])];
    const ids=initialFavourites(model.favourites,id=>candidates.some(a=>a.id===id&&a.available!==false));
    const pinned=ids.map(id=>candidates.find(a=>a.id===id)).filter(Boolean);
    if(files)files.hidden=ids.includes("files");
    const orderKey=pinned.map(a=>a.id).join(','),moved=!!dockApps.dataset.order&&dockApps.dataset.order!==orderKey;
    const place=()=>reconcile(dockApps, dockRecords, pinned, a => a.id, a => {
      const b = button(a.name || APP_NAMES[a.id] || a.id, null, action(`app:${a.id}`, opener => { if (model.mode === "workspace" && layoutOf().windows[a.id]?.minimized) restoreWindow(a.id); else if(a.id==="files")invoke("onFiles",captureLauncherOrigin(opener));else invoke("onApp", a.id, captureLauncherOrigin(opener)); }), "ws-dock-button");
      b.dataset.launcherApp=a.id;
      b.append(el("span", { class: "ws-dock-symbol" }, a.id==="files"?el("span",{class:"wsl-files-mark","aria-hidden":"true"},icon("file")):appSymbol(a.icon || a.id)), el("span", { class: "ws-dock-label" })); if (callable(callbacks.onAppDrop) && ["mail", "fitness"].includes(a.id)) b.dataset.appDrop = a.id; return b;
    }, (b, a) => { const name = a.name || APP_NAMES[a.id] || a.id, inWorkspace = mode === "workspace" && paneApps().includes(a.id), minimized = inWorkspace && layoutOf().windows[a.id].minimized; b.disabled=a.available===false;badge(b,a.available===false?null:a.indicator);words(b.lastElementChild, name); b.setAttribute("aria-label", minimized ? `Restore ${name}` : name); b.title = minimized ? `Restore ${name}` : name; b.toggleAttribute("data-running", inWorkspace); b.toggleAttribute("data-minimized", minimized); setCurrent(b, mode === "files" && a.id === "files" || mode === "app" && a.id === model.activeApp || inWorkspace && !minimized && a.id === model.foregroundApp); });
    if(moved)animateOrder(dockApps,place);else place();dockApps.dataset.order=orderKey;
    for(const old of dockApps.querySelectorAll('.ws-dock-add'))old.remove();
    for(let i=pinned.length;i<4;i++){const add=button("Choose a favourite","plus","apps","ws-dock-button ws-dock-add");add.append(el("span",{class:"ws-dock-label",text:"Add"}));dockApps.append(add)}
    setCurrent(launcher,mode!=="today"&&!pinned.some(a=>mode==="files"?a.id==="files":a.id===model.activeApp));
    selectDock();launcherRefresh?.();
    const user = model.user || {}, userKey = JSON.stringify([user.name || "", user.photo || ""]);
    if (account && userKey !== avatarKey) { avatarKey = userKey; account.replaceChildren(user.name || user.photo ? avatar(user.name || "", { photo: user.photo }) : icon("person")); const photo = account.querySelector("img"); photo?.addEventListener("error", () => photo.remove(), { once: true }); account.setAttribute("aria-label", user.name ? `Account for ${user.name}` : "Your account"); }
    const count = Math.max(0, Math.floor(Number(model.notifications) || 0)); notificationCount.hidden = !count; words(notificationCount, count > 99 ? "99+" : count);
    notifications?.setAttribute("aria-label", count ? `Notifications, ${count} unread` : "Notifications");
    const file = model.resource;
    resource.hidden = mode === "files" || !file?.name || !file.app || !file.intent || !callable(callbacks.onIntent);
    words(resourceName, file?.name); resourceMain.setAttribute("aria-label", file?.name ? `Open ${file.name}` : "Open file");
    action("resource", file?.app && file.intent ? () => invoke("onIntent", file.app, file.intent, file.objectId) : null);
    const secondary = file?.secondary || (file?.share ? { label: "Share in Chats", icon: "bubble", ...file.share } : null);
    share.hidden = !secondary?.label || !secondary.app || !secondary.intent || !callable(callbacks.onIntent);
    words(secondaryLabel, secondary?.label); share.setAttribute("aria-label", asText(secondary?.label)); share.title = asText(secondary?.label);
    if (secondaryIcon.dataset.icon !== (secondary?.icon || "")) { secondaryIcon.replaceChildren(secondary?.icon ? icon(secondary.icon) : null); secondaryIcon.dataset.icon = secondary?.icon || ""; }
    secondaryIcon.hidden = !secondary?.icon;
    action("share-resource", !share.hidden ? () => invoke("onIntent", secondary.app, secondary.intent, secondary.objectId) : null);
    for (const key of panes.keys()) setPane(key);
    paintWindows();
  }

  const activate = event => {
    const b = event.target.closest?.("[data-ws-action]");
    if (!b || (!root.contains(b) && !dockHost.contains(b)) || b.disabled || gone) return;
    actions.get(b.dataset.wsAction)?.(b);
  };
  listen(root, "click", event => { if (!dockHost.contains(event.target)) activate(event); });
  listen(dockHost, "click", activate);
  cleanups.push(launcherInput(dockHost,{current:()=>!gone,menu:(app,node)=>invoke('onAppMenu',app,node)}));
  listen(root, "focusin", event => { const pane = event.target.closest?.(".ifl-workspace-pane"); if (pane) markFocus(pane.dataset.pane); });
  listen(root, "pointerdown", event => { const pane = event.target.closest?.(".ifl-workspace-pane"); if (pane) markFocus(pane.dataset.pane); }, { passive: true });
  const navigateKeys = event => {
    if (event.defaultPrevented) return;
    const list = event.target.closest?.('.ws-pane-tabs, .ws-pane-sections, .ws-dock, .ws-workspace-nav'); if (!list) return;
    const buttons = [...list.querySelectorAll("button:not(:disabled)")].filter(b => b.getClientRects().length), at = buttons.indexOf(event.target.closest("button"));
    if (at < 0) return;
    let next = at;
    if (event.key === "Home") next = 0; else if (event.key === "End") next = buttons.length - 1;
    else if (["ArrowRight", "ArrowDown"].includes(event.key)) next = (at + 1) % buttons.length;
    else if (["ArrowLeft", "ArrowUp"].includes(event.key)) next = (at + buttons.length - 1) % buttons.length;
    else return;
    event.preventDefault(); buttons[next]?.focus();
  };
  listen(root, "keydown", event => { if (!dockHost.contains(event.target)) navigateKeys(event); });
  listen(dockHost, "keydown", navigateKeys);

  function appLauncher(close) {
    const favs=el('div',{class:'wsl-favourites',role:'group','aria-label':'Favourite order',hidden:true});
    const body=el('div',{class:'ws-launcher'}),grid=el('div',{class:'wsl-apps',role:'group','aria-label':'Apps'}),status=el('p',{class:'wsl-edit-status',role:'status'});
    let editing=false,query='';
    const edit=el('button',{type:'button',class:'wsl-edit','aria-label':'Edit favourites',text:'Edit'});
    const input=el('input',{type:'search',placeholder:'Search apps','aria-label':'Search apps',maxlength:40});
    const search=el('label',{class:'wsl-search-field'},icon('search'),input);
    const tools=el('div',{class:'wsl-tools'},search,edit);
    const liveBody=()=>!gone&&body.isConnected;
    const favourites=()=>normaliseFavourites(model.favourites)||[];
    const appItems=()=>[{id:'files',name:'Files',available:callable(callbacks.onFiles)},...(model.apps||[])].sort((a,b)=>LAUNCHER_APPS.indexOf(a.id)-LAUNCHER_APPS.indexOf(b.id));
    const state=id=>id==='files'?model.fileIndicator:(model.apps||[]).find(a=>a.id===id)?.indicator;
    const refresh=()=>{for(const b of grid.querySelectorAll('[data-launcher-app]'))badge(b,editing?null:state(b.dataset.launcherApp))};
    launcherRefresh=refresh;
    const mark=id=>id==='files'?el('span',{class:'wsl-files-mark','aria-hidden':'true'},icon('file')):icon(null,{app:APP_ICONS[id]||id,size:40});
    const launchButton=(label,glyph,callback,cls,args=[])=>el('button',{type:'button',class:cls,'aria-label':label,on:{click(){if(!liveBody())return;close?.();invoke(callback,...args)}}},glyph,el('span',{text:label}));
    function paintGrid() {
      grid.replaceChildren();favs.replaceChildren();favs.hidden=!editing;
      if(editing)for(const [index,id]of favourites().entries()){
        const name=id==='files'?'Files':APP_NAMES[id];
        favs.append(el('button',{type:'button',class:'wsl-favourite',data:{launcherFavourite:id},'aria-label':`Move ${name}, position ${index+1} of ${favourites().length}`},mark(id),el('span',{text:name})));
      }
      const list=appItems().filter(a=>a?.id&&LAUNCHER_APPS.includes(a.id)&&a.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
      for(const a of list){
        const allowed=()=>appItems().some(item=>item.id===a.id&&item.available!==false),pinned=favourites().includes(a.id);
        const b=el('button',{type:'button',class:'wsl-app','aria-label':editing?(pinned?'Unpin ':'Pin ')+a.name:a.name,data:{launcherApp:a.id},on:{click(){
          if(!liveBody()||(!allowed()&&!(editing&&pinned)))return;
          if(editing){const next=toggleFavourite(favourites(),a.id);if(next.full){status.textContent='Unpin an app to make room.';return}invoke('onFavourites',next.items);model.favourites=next.items;paintGrid();return}
          const launch=captureLauncherOrigin(b);if(a.id==='files')invoke('onFiles',launch);else invoke('onApp',a.id,launch);
        }}},mark(a.id),el('span',{text:a.name}));
        b.disabled=!allowed()&&!(editing&&pinned);
        if(editing){b.setAttribute('aria-pressed',String(pinned));if(pinned)b.append(el('span',{class:'wsl-pinned','aria-hidden':'true'},icon('check')))}else setCurrent(b,model.mode==='files'?a.id==='files':model.mode==='app'&&model.activeApp===a.id);
        grid.append(b);
      }
      if(!list.length)grid.append(el('p',{class:'wsl-empty',text:'No apps found'}));
      status.hidden=!editing;status.textContent=editing?`${favourites().length} of 4 favourites · Drag to reorder, or use arrow keys.`:'';
      refresh();edit.textContent=editing?'Done':'Edit';edit.setAttribute('aria-label',editing?'Done editing favourites':'Edit favourites');
    }
    edit.addEventListener('click',()=>{if(!liveBody())return;editing=!editing;paintGrid()});
    input.addEventListener('input',()=>{query=input.value;paintGrid()});
    input.addEventListener('keydown',event=>{if(event.key==='Enter'&&!editing){event.preventDefault();grid.querySelector('button:not(:disabled)')?.click()}});
    const security=callable(callbacks.onSecurity)?launchButton('Security Module',icon('lock'),'onSecurity','wsl-security'):null;
    security?.append(icon('chev'));
    const preferences = callable(callbacks.onSettings) ? launchButton('Settings',icon('settings'),'onSettings','wsl-settings') : null;
    preferences?.append(icon('chev'));
    const more=el('details',{class:'wsl-more'},el('summary',{},icon('more'),el('span',{text:'More'}),icon('down'))),controls=el('div',{class:'wsl-controls'});
    for(const[label,glyph,callback]of[['Today','sun','onToday'],['Quick Capture','plus','onCapture'],['Search InFlite','search','onSearch'],['Activity','clock','onActivity'],['App status','info','onRecovery'],['Notifications','bell','onNotifications']])if(callable(callbacks[callback]))controls.append(launchButton(label,icon(glyph),callback,'wsl-control'));
    more.append(controls);const utilities=el('div',{class:'wsl-utilities'},preferences,security);if(controls.childElementCount)utilities.append(more);body.append(tools,favs,status,grid,utilities);
    const dispose=launcherInput(body,{current:liveBody,menu:(app,node)=>{if(!editing)return invoke('onAppMenu',app,node)},reorder:(id,target)=>{
      if(!liveBody()||!editing)return;const next=moveFavourite(favourites(),id,target);invoke('onFavourites',next);model.favourites=next;animateOrder(favs,paintGrid);favs.querySelector('[data-launcher-favourite="'+id+'"]')?.focus({preventScroll:true});
    }});
    body.destroyLauncher=()=>{stopOrder(favs);dispose();if(launcherRefresh===refresh)launcherRefresh=null};
    paintGrid();return body;
  }

  function destroy() {
    if (gone) return;
    finishGesture(false); closeWindowMenu();
    gone = true; stopOrder(dockApps); stopMotion(); cancelAnimationFrame(frame); for (const off of cleanups.splice(0)) off(); actions.clear();
    dockHost.remove();
    root.replaceChildren(); root.classList.remove("ifl-workspace");
    for (const key of ["mode", "foregroundApp", "focusedApp", "paneCount", "layout", "windowCount"]) delete root.dataset[key];
  }
  if (callbacks.signal) { const abort = () => destroy(); callbacks.signal.addEventListener("abort", abort, { once: true }); cleanups.push(() => callbacks.signal.removeEventListener("abort", abort)); }
  listen(globalThis,"resize",()=>selectDock(false));
  const slots = { today: todaySlot, files: filesSlot, ...Object.fromEntries(WINDOW_APPS.map(app => [app, panes.get(app).slot])), app: panes.get("app").slot, dockAnchor, sidebarAnchor };
  update();
  if (callbacks.signal?.aborted) destroy();
  return { slots, sidebar, dock: dockHost, launcher: appLauncher, launcherOpen, update, setPane, destroy, getViewport, isPaneVisible, revealPane, windowAction };
}
