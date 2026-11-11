// Presentational OS shell. Slot elements are stable; the host owns module data,
// routes, persistence, mounting and cleanup. No screen below invents account data.
// createWorkspaceView(root, callbacks) -> { slots, dock, update(model), setPane(key,spec), destroy() }
// dock is a self-scoped movable element; restore it with slots.dockAnchor.append(dock).
// model: { mode:"today"|"workspace"|"app", activeId, activeApp, foregroundApp, paneApps?,
//   title?, subtitle?, workspaces:[{id,name,icon?}], apps:[{id,name,icon?,available?}],
//   user?:{name,photo?}, summary?:{title,line,facts?:[{label,value}]}, resource? }
// resource: { name, app, intent, objectId, secondary?:{label,icon?,app,intent,objectId}, share? }.
// setPane("fitness"|"weather"|"app", {title,line,pick?,actions,sections,section,busy,error}).
import { el, icon, avatar } from "./ui.js";

let serial = 0;
const APP_NAMES = { fitness: "Fitness", weather: "Weather", markets: "Markets", chats: "Chats", mail: "Mail" };
const APP_ICONS = { chats: "chat" };
const asText = value => value == null ? "" : String(value);
const words = (node, value) => { const text = asText(value); if (node.textContent !== text) node.textContent = text; };
const callable = value => typeof value === "function";
const appSymbol = app => icon(null, { app: APP_ICONS[app] || app, size: 32 });

export function createWorkspaceView(root, callbacks = {}) {
  const uid = `ifl-workspace-${++serial}`, actions = new Map(), cleanups = [], panes = new Map();
  let gone = false, model = {}, focusedApp = "", avatarKey = "";
  const listen = (node, type, fn, options) => { node.addEventListener(type, fn, options); cleanups.push(() => node.removeEventListener(type, fn, options)); };
  const action = (key, run) => { if (callable(run)) actions.set(key, run); else actions.delete(key); return key; };
  const button = (label, glyph, key, cls = "ws-icon-button") => el("button", { type: "button", class: cls, "aria-label": label, title: label, data: { wsAction: key } }, glyph ? icon(glyph) : null);
  const bindButton = (label, glyph, key, run, cls) => callable(run) ? button(label, glyph, action(key, run), cls) : null;
  const setCurrent = (node, selected) => { if (!node) return; if (selected) node.setAttribute("aria-current", "page"); else node.removeAttribute("aria-current"); };
  const paneApp = key => key === "app" ? model.activeApp : key;
  const paneApps = () => {
    const list = Array.isArray(model.paneApps) ? [...new Set(model.paneApps.filter(app => app === "fitness" || app === "weather"))] : [];
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
  const sideNav = el("nav", { class: "ws-workspace-nav", "aria-label": "Workspaces" }, todaySide, savedNav);
  const create = callable(callbacks.onCreateWorkspace) ? bindButton("New workspace", "plus", "create-workspace", opener => invoke("onCreateWorkspace", opener), "ws-sidebar-button ws-create") : null;
  const files = callable(callbacks.onFiles) ? bindButton("Files", "file", "files", opener => invoke("onFiles", opener), "ws-sidebar-button") : null;
  if (files) files.append(el("span", { text: "Files" }));
  const settings = callable(callbacks.onSettings) ? bindButton("Settings", "settings", "settings", opener => invoke("onSettings", opener), "ws-sidebar-button") : null;
  if (settings) settings.append(el("span", { text: "Settings" }));
  const sideFoot = el("div", { class: "ws-sidebar-foot" }, files, settings);
  const sidebar = el("aside", { class: "ws-sidebar", "aria-label": "InFlite workspace navigation" }, sideBrand,
    el("p", { class: "ws-nav-label", text: "Workspaces" }), sideNav, create, sideFoot);
  if (create) { create.hidden = !callable(callbacks.onCreateWorkspace); create.append(el("span", { text: "New workspace" })); }
  sideFoot.hidden = !files && !settings;

  const heading = el("h1", { class: "ws-title", id: `${uid}-title` }, el("span", { class: "ws-title-desktop" }), el("span", { class: "ws-title-mobile" }));
  const headingLine = el("p", { class: "ws-heading-line", hidden: true });
  const phoneBrand = el("img", { class: "ws-phone-mark", src: "/inflite.svg", alt: "", width: 36, height: 36 });
  const back = bindButton("Back", "back", "back", opener => invoke("onPaneBack", model.mode === "app" ? model.activeApp : model.foregroundApp || "fitness", opener), "ws-icon-button ws-phone-only");
  if (back) back.hidden = true;
  const headingBox = el("div", { class: "ws-heading" }, phoneBrand, el("div", { class: "ws-heading-copy" }, heading, headingLine));
  const search = callable(callbacks.onSearch) ? button("Search InFlite", "search", action("search", opener => invoke("onSearch", opener)), "ws-search") : null;
  if (search) {
    search.append(el("span", { text: "Search InFlite" }), el("kbd", { class: "ws-shortcut-key", text: /Mac|iPhone|iPad/.test(globalThis.navigator?.platform || "") ? "⌘ K" : "Ctrl K" }));
    search.setAttribute("aria-keyshortcuts", "Control+K Meta+K");
  }
  const appsHeader = callable(callbacks.onApps) ? bindButton("Open apps", "grid", "apps", opener => invoke("onApps", opener), "ws-icon-button ws-phone-only") : null;
  const manage = callable(callbacks.onManageWorkspace) ? bindButton("Workspace options", "more", "manage-workspace", opener => invoke("onManageWorkspace", model.activeId, opener), "ws-icon-button") : null;
  if (manage) manage.hidden = true;
  const notifications = callable(callbacks.onNotifications) ? bindButton("Notifications", "bell", "notifications", opener => invoke("onNotifications", opener), "ws-icon-button ws-desktop-only") : null;
  const notificationCount = el("span", { class: "ws-notification-count", hidden: true, "aria-hidden": "true" });
  notifications?.append(notificationCount);
  const account = callable(callbacks.onAccount) ? button("Your account", null, action("account", opener => invoke("onAccount", opener)), "ws-icon-button ws-account") : null;
  account?.append(icon("person"));
  const toolbar = el("header", { class: "ws-toolbar", role: "banner" }, back, headingBox, search, el("div", { class: "ws-header-actions" }, appsHeader, manage, notifications, account));

  const phoneChips = el("nav", { class: "ws-workspace-chips", "aria-label": "Workspaces" }), chipRecords = new Map();
  const cardTitle = el("h3", { class: "ws-summary-title" }), cardLine = el("p", { class: "ws-summary-line" }), cardFacts = el("dl", { class: "ws-summary-facts" });
  const summaryOpen = button("Open ride workspace", "chev", "open-workspace", "ws-summary-open");
  const summarySymbols = el("div", { class: "ws-summary-symbols", "aria-hidden": "true" }, appSymbol("fitness"), icon("plus"), appSymbol("weather"));
  const card = el("section", { class: "ws-workspace-card", "aria-labelledby": `${uid}-summary` },
    el("div", { class: "ws-summary-head" }, el("div", { class: "ws-summary-copy" }, cardTitle, cardLine), summaryOpen), summarySymbols, cardFacts,
    button("Open ride workspace", null, "open-workspace", "ws-primary ws-open-workspace"));
  cardTitle.id = `${uid}-summary`; card.lastElementChild.textContent = "Open ride workspace";
  const overview = el("section", { class: "ws-home-overview", "aria-label": "Your workspaces" }, el("h2", { class: "ws-home-title", text: "Your day, together" }), phoneChips, card);
  const todaySlot = el("div", { class: "ws-today-slot", data: { workspaceSlot: "today" } });
  const todayView = el("div", { class: "ws-home" }, overview, todaySlot);

  const foregroundTabs = el("div", { class: "ws-pane-tabs", role: "tablist", "aria-label": "Ride workspace apps" });
  const foregroundButtons = new Map();
  for (const app of ["fitness", "weather"]) {
    const b = button(APP_NAMES[app], null, action(`focus:${app}`, () => { foreground(app); invoke("onPaneFocus", app); }), "ws-pane-tab");
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
    const busyMark = el("span", { class: "ws-busy-mark", "aria-hidden": "true", hidden: true });
    const sectionNav = el("div", { class: "ws-pane-sections", role: "tablist", "aria-label": `${name} sections`, hidden: true });
    const statusTitle = el("b"), statusText = el("p"), statusActions = el("div", { class: "ws-status-actions" });
    const status = el("div", { class: "ws-pane-status", role: "status", hidden: true }, statusTitle, statusText, statusActions);
    const slot = el("div", { class: "ws-module-slot", data: { workspaceSlot: key } });
    const pane = el("section", { class: "ifl-workspace-pane", id: `${uid}-${key}`, data: { pane: key }, "aria-labelledby": title.id },
      el("header", { class: "ws-pane-header" }, paneBack, symbol, el("div", { class: "ws-pane-heading" }, title, pick, line), busyMark, buttons, open), sectionNav, status, slot);
    const record = { el: pane, slot, title, line, symbol, pick, pickText, buttons, open, paneBack, busyMark, sectionNav, status, statusTitle, statusText, statusActions,
      spec: { title: name, busy: true }, actionRecords: new Map(), sectionRecords: new Map() };
    panes.set(key, record); return pane;
  }
  const paneGrid = el("div", { class: "ws-pane-grid" }, makePane("fitness"), makePane("weather"));
  for (const [app, b] of foregroundButtons) b.setAttribute("aria-controls", panes.get(app).el.id);
  const rideView = el("section", { class: "ws-ride", "aria-label": "Ride workspace", hidden: true }, foregroundTabs, paneGrid);
  const appView = el("section", { class: "ws-single-app", "aria-label": "App", hidden: true }, makePane("app"));
  const resourceName = el("span", { class: "ws-resource-name" }), resourceMain = button("Open file", "file", "resource", "ws-resource-open");
  resourceMain.append(resourceName);
  const secondaryIcon = el("span", { class: "ws-resource-secondary-icon", "aria-hidden": "true" }), secondaryLabel = el("span");
  const share = button("Workspace file action", null, "share-resource", "ws-resource-share"); share.append(secondaryIcon, secondaryLabel);
  const resource = el("section", { class: "ws-resource", "aria-label": "Workspace file", hidden: true }, resourceMain, share);
  const canvas = el("div", { class: "ws-canvas" }, todayView, rideView, appView, resource);
  const main = el("div", { class: "ws-main" }, toolbar, canvas);
  const dock = el("nav", { class: "ws-dock", "aria-label": "Apps" }), dockRecords = new Map();
  const dockToday = callable(callbacks.onToday) ? button("Today", null, "today", "ws-dock-button") : null;
  dockToday?.append(el("span", { class: "ws-dock-symbol ws-dock-today" }, icon("calendar")), el("span", { class: "ws-dock-label", text: "Today" }));
  const dockApps = el("div", { class: "ws-dock-apps" });
  const launcher = callable(callbacks.onApps) ? button("All apps", "grid", "apps", "ws-dock-button ws-dock-launcher") : null;
  dock.append(...[dockToday, dockApps, launcher].filter(Boolean));
  const dockHost = el("div", { class: "ifl-workspace ws-dock-host" }, dock);
  const dockAnchor = el("div", { class: "ws-dock-anchor" }, dockHost);
  const shell = el("div", { class: "ws-shell" }, sidebar, main, dockAnchor);
  root.classList.add("ifl-workspace"); root.replaceChildren(shell);

  function foreground(app) {
    const available = paneApps();
    if (!available.includes(app)) app = available[0];
    model.foregroundApp = app;
    root.dataset.foregroundApp = app;
    root.dataset.paneCount = String(available.length);
    for (const [id, b] of foregroundButtons) {
      const selected = available.includes(id); b.hidden = !selected; panes.get(id).el.hidden = !selected;
      b.setAttribute("aria-selected", String(id === app)); b.tabIndex = id === app ? 0 : -1; panes.get(id).el.dataset.foreground = String(id === app);
    }
  }

  function markFocus(key) {
    const app = paneApp(key); if (!app || focusedApp === app) return;
    if (app === "fitness" || app === "weather") foreground(app);
    focusedApp = app; root.dataset.focusedApp = app; invoke("onPaneFocus", app);
  }

  function setPane(key, patch = {}) {
    if (gone) return;
    const p = panes.get(key); if (!p) return;
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
    model = { ...model, ...next };
    const mode = /^(workspace|app)$/.test(model.mode) ? model.mode : "today", spaces = (Array.isArray(model.workspaces) ? model.workspaces : []).filter(w => w?.id && w.name && callable(callbacks.onWorkspace));
    const current = spaces.find(w => w.id === model.activeId), ride = spaces.find(w => w.id === "ride") || spaces.find(w => {
      const apps = Array.isArray(w.panes) ? w.panes.map(p => p.app) : Array.isArray(w.apps) ? w.apps : [];
      return apps.includes("fitness") && apps.includes("weather");
    });
    const apps = (Array.isArray(model.apps) ? model.apps : []).filter(a => a?.id && a.available !== false && callable(callbacks.onApp));
    const activeApp = apps.find(a => a.id === model.activeApp), title = model.title || (mode === "workspace" ? `${current?.name || "Ride"} workspace` : mode === "app" ? activeApp?.name || APP_NAMES[model.activeApp] || "App" : "Today");
    root.dataset.mode = mode;
    if (mode === "today") canvas.removeAttribute("role"); else canvas.setAttribute("role", "main");
    words(heading.querySelector(".ws-title-desktop"), title);
    words(heading.querySelector(".ws-title-mobile"), mode === "workspace" ? current?.name || "Ride" : title);
    words(headingLine, model.subtitle); headingLine.hidden = !model.subtitle;
    rideView.setAttribute("aria-label", `${current?.name || "Ride"} workspace`);
    foregroundTabs.setAttribute("aria-label", `${current?.name || "Ride"} workspace apps`);
    appView.setAttribute("aria-label", activeApp?.name || APP_NAMES[model.activeApp] || "App");
    if (back) back.hidden = mode === "today" || !callable(callbacks.onPaneBack);
    if (manage) manage.hidden = mode !== "workspace" || !current;
    todayView.hidden = mode !== "today"; rideView.hidden = mode !== "workspace"; appView.hidden = mode !== "app";
    foreground(model.foregroundApp || "fitness");
    if (todaySide) setCurrent(todaySide, mode === "today");
    const paintWorkspace = (b, w) => { words(b.lastElementChild, w.name); setCurrent(b, mode === "workspace" && w.id === model.activeId); };
    const makeWorkspace = (w, cls) => {
      const b = button(w.name, w.icon || "ride", action(`workspace:${w.id}`, opener => invoke("onWorkspace", w.id, opener)), cls);
      b.append(el("span", { text: w.name })); return b;
    };
    reconcile(savedNav, savedRecords, spaces, w => w.id, w => makeWorkspace(w, "ws-sidebar-button"), paintWorkspace);
    const chips = [...(callable(callbacks.onToday) ? [{ id: "today", name: "Today", icon: "calendar" }] : []), ...spaces];
    reconcile(phoneChips, chipRecords, chips, w => w.id, w => {
      const b = makeWorkspace(w, "ws-workspace-chip"); if (w.id === "today") b.dataset.wsAction = "today"; return b;
    }, (b, w) => { words(b.lastElementChild, w.name); setCurrent(b, w.id === "today" ? mode === "today" : mode === "workspace" && w.id === model.activeId); });
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
    setCurrent(dockToday, mode === "today");
    reconcile(dockApps, dockRecords, apps, a => a.id, a => {
      const b = button(a.name || APP_NAMES[a.id] || a.id, null, action(`app:${a.id}`, opener => invoke("onApp", a.id, opener)), "ws-dock-button");
      b.append(el("span", { class: "ws-dock-symbol" }, appSymbol(a.icon || a.id)), el("span", { class: "ws-dock-label" })); return b;
    }, (b, a) => { const name = a.name || APP_NAMES[a.id] || a.id; words(b.lastElementChild, name); b.setAttribute("aria-label", name); b.title = name; setCurrent(b, mode === "app" && a.id === model.activeApp); });
    const user = model.user || {}, userKey = JSON.stringify([user.name || "", user.photo || ""]);
    if (account && userKey !== avatarKey) { avatarKey = userKey; account.replaceChildren(user.name || user.photo ? avatar(user.name || "", { photo: user.photo }) : icon("person")); account.setAttribute("aria-label", user.name ? `Account for ${user.name}` : "Your account"); }
    const count = Math.max(0, Math.floor(Number(model.notifications) || 0)); notificationCount.hidden = !count; words(notificationCount, count > 99 ? "99+" : count);
    notifications?.setAttribute("aria-label", count ? `Notifications, ${count} unread` : "Notifications");
    const file = model.resource;
    resource.hidden = !file?.name || !file.app || !file.intent || !callable(callbacks.onIntent);
    words(resourceName, file?.name); resourceMain.setAttribute("aria-label", file?.name ? `Open ${file.name}` : "Open file");
    action("resource", file?.app && file.intent ? () => invoke("onIntent", file.app, file.intent, file.objectId) : null);
    const secondary = file?.secondary || (file?.share ? { label: "Share in Chats", icon: "bubble", ...file.share } : null);
    share.hidden = !secondary?.label || !secondary.app || !secondary.intent || !callable(callbacks.onIntent);
    words(secondaryLabel, secondary?.label); share.setAttribute("aria-label", asText(secondary?.label)); share.title = asText(secondary?.label);
    if (secondaryIcon.dataset.icon !== (secondary?.icon || "")) { secondaryIcon.replaceChildren(secondary?.icon ? icon(secondary.icon) : null); secondaryIcon.dataset.icon = secondary?.icon || ""; }
    secondaryIcon.hidden = !secondary?.icon;
    action("share-resource", !share.hidden ? () => invoke("onIntent", secondary.app, secondary.intent, secondary.objectId) : null);
    for (const key of panes.keys()) setPane(key);
  }

  const activate = event => {
    const b = event.target.closest?.("[data-ws-action]");
    if (!b || (!root.contains(b) && !dockHost.contains(b)) || b.disabled || gone) return;
    actions.get(b.dataset.wsAction)?.(b);
  };
  listen(root, "click", event => { if (!dockHost.contains(event.target)) activate(event); });
  listen(dockHost, "click", activate);
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

  function destroy() {
    if (gone) return;
    gone = true; for (const off of cleanups.splice(0)) off(); actions.clear();
    dockHost.remove();
    root.replaceChildren(); root.classList.remove("ifl-workspace");
    for (const key of ["mode", "foregroundApp", "focusedApp", "paneCount"]) delete root.dataset[key];
  }
  if (callbacks.signal) { const abort = () => destroy(); callbacks.signal.addEventListener("abort", abort, { once: true }); cleanups.push(() => callbacks.signal.removeEventListener("abort", abort)); }
  const slots = { today: todaySlot, fitness: panes.get("fitness").slot, weather: panes.get("weather").slot, app: panes.get("app").slot, dockAnchor };
  update();
  if (callbacks.signal?.aborted) destroy();
  return { slots, dock: dockHost, update, setPane, destroy };
}
