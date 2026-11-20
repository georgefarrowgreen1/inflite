import { createDiscoveryView, discover, searchRecords, isRecordApp } from './discovery350.js';
import { initialFavourites, normaliseFavourites, toggleFavourite, launcherStatus } from "./launcher-model.js";
import { captureLauncherOrigin, launcherTransition } from "./launcher-motion.js";
// Unified InFlite shell: singleton apps, Files and account-scoped actions.
// Saved workspaces are retired; existing records are never read or changed.
import { REGISTRY, format } from "./router.js";
import { loadStyles } from "./modules.js";
import { createWorkspaceView } from "./workspace-view.js";
import { WORKSPACE_APPS, getWorkspaceApp, safeWorkspaceRoute } from "./workspace-catalog.js";
import { createWorkspaceCommands, notificationActions } from "./workspace-commands.js";
import { createFilesService } from "./files-service.js";
import { safeFilesLocation } from "./files-location.js";
import { createActivityRegistry, createWorkspaceActivity } from "./workspace-activity.js";
import { createWorkspaceRecovery } from "./workspace-recovery.js";
import { createWorkspaceRecoveryView } from "./workspace-recovery-view.js";
import { createConnectionView } from "./connection.js";
import { createHandoffs } from "./handoffs.js";

const EMPTY_CONTEXT = Object.freeze({ location: null, interval: null });
const retiredContextAction = (app, id) => app === "fitness" && id === "weather-for-ride" || app === "weather" && ["use-place", "window"].includes(id);
const guarded = (fn, fallback) => { try { return fn(); } catch (_) { return fallback; } };

export async function createWorkspace(F, options = {}) {
  await Promise.all([loadStyles("/roof/workspace.css"),loadStyles("/roof/launcher.css")]);
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
  const organiseStores=new Map();
  const organiseStore=kind=>{if(!['notes','people','calendar'].includes(kind)||!live())return Promise.reject(new Error('This account was released'));if(!organiseStores.has(kind))organiseStores.set(kind,import('/organise/releases/4.32.4/store.js').then(m=>live()?m.createStore(F,kind):null).then(store=>{if(store&&live())F.systemTasks?.register?.(store,{signal:F.signal});return store}));return organiseStores.get(kind)};
  let securityLoad=null;
  const security=()=>securityLoad||=(import('./security-module.js').then(m=>live()?m.createSecurityModule(F,{remembered:()=>system().then(s=>s?.devices()),calendars:()=>lifeTools().then(s=>s?.calendars())}):null).catch(e=>{securityLoad=null;throw e}));
  let lifeLoad=null;
  const lifeTools=()=>lifeLoad||=(Promise.all([import('./life410.js'),system()]).then(([m,s])=>live()?m.createLifeTools(F,{system:s,files,organiseStore,today,editToday:options.onEditToday}):null).catch(e=>{lifeLoad=null;throw e}));
  let files = null, commands = null, dialogs = null, recovery = null, recoveryView = null,systemInstance=null,systemLoad=null;
  const system=()=>systemLoad||=(import('./system350.js').then(m=>live()?m.createSystem350(F,{today,files,day:options.day,snapshots:()=>snapshots,activity:activity.source('reminders',{current:live,signal:F.signal}),openSource}):null).then(s=>{if(live())systemInstance=s;return s}).catch(error=>{systemLoad=null;throw error}));
  let dialogInstance = null, dialogLoad = null;
  let explorer = null, explorerLoad = null, filesLocation = safeFilesLocation({ kind: "drive" }), pendingFilesQuery = null;
  let shown = false, gone = false, route = null, scene = 0, paintPending = false;
  let stopLaunch=null;
  const launchMotion=spec=>(stopLaunch=launcherTransition(spec));
  F.nav.launchMotion=launchMotion;
  offs.push(()=>{stopLaunch?.();if(F.nav.launchMotion===launchMotion)F.nav.launchMotion=null});
  const live = () => !gone && !F.signal.aborted && F.session.view?.user?.id === owner;
  const organiseTimer=setTimeout(()=>{if(live())import('/organise/today.js').then(m=>{if(live())m.connectToday(F,today)}).catch(()=>{})},1500);F.signal.addEventListener('abort',()=>clearTimeout(organiseTimer),{once:true});
  const activity = createActivityRegistry(F), activityView = createWorkspaceActivity(F, { registry: activity });
  const fileActivity = activity.source("files", { current: live, signal: F.signal });
  recovery = createWorkspaceRecovery(F, { getHandle: app => handles.get(app), retry: retryApp,
    activity: activity.source("recovery", { current: live, signal: F.signal }), onChange: () => { paintNativeRecovery(); paint(); } });
  recoveryView = createWorkspaceRecoveryView(F, recovery);
  const connection = createConnectionView(F, { root, recovery, open: () => recoveryView.open() });
  const loadApp = async (app, handle, lease = {}) => {
    // A query may stop waiting; the singleton mount still belongs to the account.
    const instance=await recovery.load(app,async()=>{
      const value=await handle.load();if(!live()||handle.signal.aborted)return null;
      await value?.workspace?.();return value;
    },{current:()=>live()&&!handle.signal.aborted,signal:handle.signal});
    return live()&&!lease.signal?.aborted&&guarded(()=>!lease.current||lease.current(),false)?instance:null;
  };
  const appOn = (app) => !!F.session.apps?.[app] && (app !== "mail" || F.session.view?.apps?.mail === true);
  const favouriteKey='ifl:launcher:v1:'+owner;
  const readFavourites = () => initialFavourites(guarded(() => JSON.parse(localStorage.getItem(favouriteKey))), id => id === "files" || appOn(id));
  let favourites = readFavourites(), favouriteNotice = null;
  function saveFavourites(items) {
    const next = normaliseFavourites(items);
    if (!live() || !next) return;
    favouriteNotice?.close();
    favourites = next;
    guarded(() => localStorage.setItem(favouriteKey, JSON.stringify(next)));
    paint();
  }
  function syncFavourites(event) {
    if (!live() || (event.key !== favouriteKey && event.key !== null) || event.storageArea !== localStorage) return;
    favouriteNotice?.close();
    favourites = readFavourites();
    paint();
  }
  globalThis.addEventListener("storage", syncFavourites);
  offs.push(() => { globalThis.removeEventListener("storage", syncFavourites); favouriteNotice?.close(); });
  let appsMenu = null;
  function launchOptions(source) {
    const origin = source?.nodeType ? captureLauncherOrigin(source) : source;
    return origin ? { kind: "launch", launch: origin } : {};
  }
  const handoffs = createHandoffs(F, { available: appOn, deliver: async (app, token, lease) => {
    const opened = await openApp(app, format({ app }), { ...lease, wake: true });
    return opened && lease.current() ? runIntent(app, "handoff", token, lease) : { ok: false, cancelled: true };
  } });
  function capability(app, signal) {
    const usable = () => live() && appOn(app) && !signal.aborted;
    return Object.freeze({
      enabled: true,
      discovery350:true,
      security:Object.freeze({open:()=>security().then(s=>usable()&&s?.open({app}))}),
      ...(app === "mail" && { async calendarChange(spec, current) {
        const handle = handles.get(app);
        const active = () => usable() && handle?.fw.visible() && !handle.el.hidden && !handle.el.inert && current();
        if (!active()) return null;
        const { matchChange } = await import("../organise/mail-calendar.js");
        return active() ? matchChange(handle.fw, spec, active) : null;
      } }),
      organiseStore,
      life:Object.freeze({share:ref=>lifeTools().then(v=>live()&&v?.share(ref)),calendars:()=>lifeTools().then(v=>live()&&v?.calendars())}),
      today:()=>usable()?options.day?.():null,
      openReference:source=>usable()?openSource(source):false,
      actions:Object.freeze({capture(ref={}){const active=()=>usable()&&F.route?.app===app&&handles.get(app)?.fw.visible();if(!active())return Promise.resolve(false);const source={app,...(typeof ref.id==='string'?{id:ref.id}:{}),...(typeof ref.item==='string'?{item:ref.item}:{})};return system().then(s=>active()&&s?.capture(source,{current:active}))}}),
      drafts:Object.freeze({device:()=>{try{return usable()?localStorage.getItem('ifl:device:'+owner):null}catch(_){return null}}}),
      handoffs: handoffs.forApp(app, { signal, current: usable, active: () => usable() && F.route?.app === app && handles.get(app)?.fw.visible() }),
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
    onToday: opener => {const origin=captureLauncherOrigin(opener);F.nav.go("/",{resume:true,...(origin?{kind:'launch-return',launch:origin}:{})})}, onApp: (app,launch) => openApp(app,null,{launch}),
    onFavourites: saveFavourites, onReplaceFavourite: chooseReplacement,
    onAppMenu:openAppMenu,
    onRecent: app => { if (live() && appOn(app)) openApp(app); },
    onAppDrop: (app, token) => { if (live() && ["mail", "fitness"].includes(app) && /^[a-f0-9]{32}$/.test(token)) return runIntent(app, app === "mail" ? "compose-attach" : "import-drive", "drop:" + token); },
    onSecurity:()=>security().then(s=>live()&&s?.open({app:F.route?.app||null})),onCapture:()=>lifeTools().then(v=>live()&&v?.capture()),onSearch: query => F.search.open(typeof query === "string" && query ? { query } : undefined), onApps: opener => openApps(opener),
    onNotifications: options.onNotifications, onAccount: options.onAccount, onSettings: options.onSettings,
    onFiles: launch => openFiles(null,null,launch),
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
      const old = snapshots.get(app);
      if (old?.status === 'ready' && ['locked', 'signin'].includes(snapshot?.status)) F.search.invalidate?.({ app });
      snapshots.set(app, snapshot || null);
    } catch (_) { if (live() && appOn(app) && !entry.signal.aborted && providers.get(app) === entry && entry.epoch === epoch) snapshots.set(app, { status: "error", actions: [], files: [] }); }
    if (live()) { recovery.update(app, snapshots.get(app)); files?.update?.(); files?.changed?.(app); paint(); }
  }
  function paint() {
    if (!live() || paintPending) return;
    paintPending = true;
    queueMicrotask(() => {
      paintPending = false; if (!live()) return;
      const user = F.session.view?.user || {};
      systemInstance?.update();
      view.update({ favourites,settingsActive: F.route?.tab === "you",mode: F.route?.kind === "app" ? "app" : shown && route?.tool === "files" ? "files" : "today", activeApp: F.route?.app,
        apps: WORKSPACE_APPS.map((a) => ({ ...a, available: appOn(a.id),indicator:appOn(a.id)?launcherStatus(snapshots.get(a.id)):null })), fileIndicator:fileIndicator(), user: { name: user.name || "", photo: user.photoAt && /^[\w-]{8,64}$/.test(owner) ? `/api/avatar?id=${encodeURIComponent(owner)}&v=${encodeURIComponent(String(user.photoAt))}` : null }, notifications: options.notifications?.() || 0,
        unifiedHome: true, connectionManaged: true, activityCount: activityView.count(),
        greeting: `${new Date().getHours() < 12 ? "Good morning" : new Date().getHours() < 18 ? "Good afternoon" : "Good evening"}${F.session.view?.user?.name ? ", " + String(F.session.view.user.name).trim().split(/\s+/)[0] : ""}`,
        recentApps: [...recentApps.keys()].reverse().filter(appOn).map(app => ({ app })), recentActivity: activity.snapshot().slice(0, 3),
        subtitle: guarded(() => new Intl.DateTimeFormat(undefined, { weekday: "long", day: "numeric", month: "long" }).format(new Date()), ""), title: "Today" });
    });
  }
  function fileIndicator(){
    const rows=files?.transfers?.()||[],active=rows.filter(r=>['queued','reserving','uploading'].includes(r.status));
    if(rows.some(r=>r.status==='failed'))return {label:'Upload needs attention',text:'!',kind:'error'};
    if(!active.length)return null;
    const known=active.every(r=>Number.isFinite(r.progress)),percent=known?Math.floor(active.reduce((n,r)=>n+Math.max(0,Math.min(1,r.progress)),0)/active.length*100):null;
    return {label:active.length+' upload'+(active.length===1?'':'s')+(percent===null?' waiting':' · '+percent+'%'),text:percent===null?'':percent+'%',kind:'upload'};
  }
  function chooseReplacement(app, sheet) {
    if (!live() || sheet.closed || favourites.length !== 4 || favourites.includes(app)) return;
    const expected = F.route;
    const appName = id => id === "files" ? "Files" : REGISTRY[id].name;
    const name = appName(app);
    const choices = F.ui.el("div", { class: "wsl-replacements" });
    for (const id of favourites) {
      const label = appName(id);
      const choice = F.ui.el("button", { type: "button", class: "wsl-replacement", "aria-label": "Replace " + label },
        F.ui.icon(null, { app: id === "chats" ? "chat" : id, size: 32 }), F.ui.el("span", { text: label }));
      choice.addEventListener("click", () => {
        if (!live() || F.route !== expected || sheet.closed || sheet.el.classList.contains("closing") ||
            !sheet.el.contains(choice) || choice.closest("[hidden]")) return;
        if (favourites.length !== 4 || !favourites.includes(id) || favourites.includes(app) || (app !== "files" && !appOn(app))) {
          sheet.pop();
          return;
        }
        const previous = favourites;
        saveFavourites(previous.map(slot => slot === id ? app : slot));
        const applied = favourites;
        sheet.now();
        favouriteNotice = F.toast(`${name} replaced ${label} in the dock.`, {
          action: { label: "Undo", run() {
            if (live() && favourites === applied) saveFavourites(previous);
          } },
          onClose() { favouriteNotice = null; }
        });
      });
      choices.append(choice);
    }
    sheet.push({ title: "Replace a favourite", page: "replace-favourite", body: F.ui.el("div", { class: "ws-launcher" },
      F.ui.el("p", { class: "wsl-prompt", text: `Choose the dock slot for ${name}.` }), choices) });
  }
  function openAppMenu(app,opener){
    if(!live()||!['files',...WORKSPACE_APPS.map(a=>a.id)].includes(app)||app!=='files'&&!appOn(app))return;
    const expected=F.route,valid=()=>live()&&body.isConnected&&!body.closest('[hidden]')&&!menu?.closed&&!menu?.el.classList.contains('closing')&&F.route===expected&&(app==='files'||appOn(app));
    const ui=F.ui,name=app==='files'?'Files':REGISTRY[app].name,body=ui.el('div',{class:'wsl-context'});
    let menu;const close=()=>{if(menu===appsMenu)F.sheet.closeAll();else menu?.now()};
    const item=(label,glyph,run)=>body.append(ui.btn(label,{icon:glyph,run:()=>{if(!valid())return;return run()}}));
    const indicator=app==='files'?fileIndicator():launcherStatus(snapshots.get(app));
    if(indicator)body.append(ui.el('p',{class:'wsl-edit-status',text:indicator.label}));
    item('Open '+name,'open',()=>{const launch=captureLauncherOrigin(opener);close();return app==='files'?openFiles(null,null,launch):openApp(app,null,{launch})});
    const defaults={calendar:['new','New event'],notes:['new','New note'],people:['new','Add person'],mail:['compose','New message'],chats:['new-chat','New chat']},shortcut=defaults[app];
    if(shortcut)item(shortcut[1],'plus',async()=>{const launch=captureLauncherOrigin(opener);close();const route=await openApp(app,format({app}),{launch});if(route&&live()&&F.route===route)return runIntent(app,shortcut[0],null,{current:()=>live()&&F.route===route})});
    const pinned=favourites.includes(app),full=!pinned&&favourites.length===4;
    if (full) item("Replace a favourite…", "swap", () => chooseReplacement(app, menu));
    else item(pinned ? "Remove from favourites" : "Add to favourites", pinned ? "minus" : "plus", () => {
      if (favourites.includes(app) !== pinned) return;
      const next = toggleFavourite(favourites, app);
      if (next.full) return chooseReplacement(app, menu);
      saveFavourites(next.items);
      if (menu === appsMenu) menu.pop();
      else close();
    });
    if(app==='files'&&indicator)item('View activity','clock',()=>{close();activityView.open()});
    if(appsMenu&&!appsMenu.closed){menu=appsMenu;menu.push({page:'app-actions',title:name,body})}
    else menu=F.sheet.open({sheet:'launcher-actions',title:name,body});
    return menu;
  }
  async function searchApp(app,query,lease={}){
    const valid=()=>live()&&appOn(app)&&!lease.signal?.aborted&&guarded(()=>!lease.current||lease.current(),false);
    if(!valid())return {status:'disabled',entries:[]};
    if (isRecordApp(app)) {
      const store = await organiseStores.get(app);
      return searchRecords(F, app, query, { signal: lease.signal, current: valid }, store);
    }
    const handle=acquire(app);
    if(!handle.el.isConnected||handle.el.hidden){if(!backgroundSlots.has(app)){const slot=F.ui.el('div');background.append(slot);backgroundSlots.set(app,slot)}handle.attach({container:backgroundSlots.get(app),workspace:handle.fw.workspace,navigate(){},back(){},section(){},header(){},fill(){}})}
    await loadApp(app,handle,lease);if(!valid())return {status:'error',entries:[]};
    const entry=providers.get(app);if(!entry||typeof entry.provider.search!=='function')return {status:snapshots.get(app)?.status||'loading',entries:[]};
    const result=await entry.provider.search(query,{...lease,current:()=>valid()&&providers.get(app)===entry});return valid()?result:{status:'error',entries:[]};
  }
  async function openSource(source){
    if(!live()||!source||!['mail','chats','fitness','weather','markets','files','calendar','notes','people'].includes(source.app))return false;
    if (isRecordApp(source.app)) {
      if (!/^[a-f0-9]{32}$/.test(source.id)) return false;
      return openApp(source.app, '/' + source.app + '/#item=' + source.id);
    }
    if (source.app === 'files') {
      const origin = F.route, current = () => live() && F.route === origin;
      try {
        const item = await files.locate(source.id, { current });
        if (!current()) return false;
        if (item.kind === 'folder') return openFiles('', item.location);
        const { openFileReference } = await import('./search-file.js');
        return current() && openFileReference(F, files, item, current);
      } catch (error) { if (current()) F.toast(error.message); return false; }
    }
    const {sourcePath}=await import('./actions-ui.js');if(!live())return false;
    const expected=await openApp(source.app,sourcePath(source),{wake:true,current:live});if(!expected||!live())return false;
    if(source.item&&['mail','chats'].includes(source.app))return runIntent(source.app,'reveal-source',source.item,{current:()=>live()&&F.route===expected});return true;
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
    return !!await openApp(app, null, { ...lease, wake: true });
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
  async function openApp(app, destination = null, lease = {}) {
    const manifest = getWorkspaceApp(app); if (!live() || !manifest || !appOn(app)) return null;
    const path = destination || recentApps.get(app) || manifest.href;
    const { launch, wake = false } = lease;
    F.nav.go(path, { ...launchOptions(launch), ...(wake ? { kind: "section" } : {}), resume: !destination && !wake });
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
      expectedRoute = await openApp(app, format({ app }), { wake: true, current: callerCurrent, signal });
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
  function navigateFiles(next, { query, resume = false,launch=null } = {}) {
    next = safeFilesLocation(next);
    if (!live() || !next) return false;
    const path = format({ tab: "workspace", tool: "files", folder: next.kind === "drive" && next.view === "folder" ? next.folderId : null });
    const prefill = typeof query === "string" ? { query: query.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 160), location: JSON.stringify(next), route: null } : null;
    pendingFilesQuery = prefill;
    const replace = F.route?.tool === "files" && JSON.stringify(filesLocation) === JSON.stringify(next);
    F.nav.go(path, { kind: "section",...launchOptions(launch), replace, resume, state: { files: { userId: owner, location: next } } });
    if (prefill && pendingFilesQuery === prefill) prefill.route = F.route;
    return true;
  }
  const openFiles = (query = null, location = null,launch=null) => {
    const destination = location === null ? query === null ? filesLocation : { kind: "drive", folderId: null, view: "folder" } : safeFilesLocation(location);
    return destination ? navigateFiles(destination, { query,launch, resume: query === null && location === null }) : false;
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
      explorer = m.createFilesExplorer(view.slots.files, F, { service: files, onNavigate: next => navigateFiles(next) });
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
  function openApps(opener) {
    if (!live() || (appsMenu && !appsMenu.closed)) return;
    let disposeLauncher;
    // Safari does not focus a button on tap. Give the sheet its actual return target.
    opener?.focus?.({ preventScroll: true });
    const menu = F.sheet.open({ sheet: 'workspace-apps', title: 'Your apps', onClose: () => {
      disposeLauncher?.();
      if (appsMenu === menu) {
        appsMenu = null;
        view.launcherOpen(false);
      }
    } });
    appsMenu = menu;
    disposeLauncher = view.launcher(menu, opener?.classList?.contains("ws-dock-add"));
    view.launcherOpen(true);
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
    gone = true; appsMenu?.now();appsMenu=null;++scene;
    for (const off of offs.splice(0)) off();
    explorer?.destroy(); dialogs?.destroy(); handoffs.destroy(); connection.destroy(); recoveryView?.destroy(); recovery?.destroy(); activityView.destroy(); activity.destroy(); pendingFilesQuery = null;
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
    await loadApp(r.app, handles.get(r.app), { current: () => live() && F.route === r });
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
    authoriseTransfer:async(app,item,lease)=>{const m=await import('./security-client.js');if(!live())throw new DOMException('This account was released','AbortError');return m.approveFileTransfer(F,app,item,lease)},
    activity: fileActivity,share:source=>lifeTools().then(v=>live()&&v?.share(source)),remind:source=>system().then(s=>live()&&s?.capture(source)),
    sources: () => WORKSPACE_APPS.filter(a => ["fitness", "mail", "chats", "markets", "calendar", "notes", "people"].includes(a.id) && appOn(a.id)).map(a => ({ app: a.id, name: a.name, transient: a.id === "chats", status: snapshots.get(a.id)?.status || (snapshots.get(a.id)?.loading ? "loading" : providers.has(a.id) ? "ready" : "loading"), files: snapshots.get(a.id)?.files || [] })),
    load: loadFiles, runIntent, openExplorer: openFiles,
  });
  // A stable capability exists immediately; picker code/styles are fetched only
  // after an explicit Open/Save/drop action, outside the boot's critical graph.
  dialogs = { forApp(app, requester = {}) {
    const api = {};
    for (const method of ["open", "save", "fromDrop"]) api[method] = async (...args) => {
      const valid = () => live() && !requester.signal?.aborted && guarded(() => !requester.current || requester.current(), false);
      if (!valid()) return null;
      dialogLoad ||= Promise.all([import("./files-dialogs.js"), loadStyles("/roof/files-dialogs.css")]).then(([m]) => {
        if (live()) dialogInstance ||= m.createFilesDialogs(F, { service: files });
        return dialogInstance;
      }).catch(error => { dialogLoad = null; throw error; });
      const instance = await dialogLoad;
      return valid() && instance ? instance.forApp(app, requester)[method](...args) : null;
    };
    return Object.freeze(api);
  }, destroy() { dialogInstance?.destroy(); } };
  offs.push(activity.subscribe(paint),files.subscribe(paint));
  offs.push(F.search.provide({id:'reminders350',group:'Reminders',order:12,scope:'account',search:(q,lease)=>q.trim().length<2?[]:system().then(s=>live()&&s?s.search(q,lease):[])}));
  offs.push(F.search.provide({id:'document-contents',group:'Document contents',order:90,search:q=>q.trim().length<2?[]:[{title:'Search inside documents',offer:true,layer:true,sub:'Text, Markdown, CSV and JSON · open content search',run:current=>lifeTools().then(v=>live()&&current()&&v?.searchDocuments(q))}]}));
  F.search.useDiscovery?.(createDiscoveryView);
  for (const app of ['files','calendar','notes','people','mail','chats','fitness','markets','weather']) {
    offs.push(F.search.provide({
      id: 'discover-' + app, group: REGISTRY[app]?.name || 'Files', order: 22, scope: 'account',
      async search(query, lease) {
        if (query.trim().length < 2 || !live() || app !== 'files' && !appOn(app)) return [];
        return live() ? discover(F, { app, query, lease, files, searchApp, openApp, openSource, runIntent }) : [];
      }
    }));
  }
  queueMicrotask(()=>system().catch(()=>{}));
  const securityRoute=r=>{if(r?.kind==='tab'&&r.tab==='you'&&r.arg==='security')security().then(s=>live()&&F.route===r&&s?.open()).catch(e=>live()&&F.route===r&&F.toast(e.message))};
  offs.push(F.on('route',securityRoute));securityRoute(F.route);
  const lifeTimer=setTimeout(()=>{if(live())lifeTools().catch(()=>{})},1800);F.signal.addEventListener('abort',()=>clearTimeout(lifeTimer),{once:true});
  if (F.systemTasks?.register) offs.push(F.systemTasks.register(files, { signal: F.signal }));
  commands = createWorkspaceCommands(F, {
    apps: () => WORKSPACE_APPS.map(a => ({ ...a, available: appOn(a.id) })),
    files: q => files.search(q, { includeDrive: false }), actions: () => [...snapshots].flatMap(([app, snapshot]) => (snapshot?.actions || []).filter(action => !retiredContextAction(app, action.id)).map(action => ({ app, ...action }))),
    runIntent, openApp, openFiles, fileDialogsAvailable: () => live() && !!dialogs,
    systemActions: () => [
      {id:'quick-capture',label:'Quick Capture',detail:'Save a thought, reminder, photo or file',keywords:['capture','inbox','save','note'],current:live,run:()=>lifeTools().then(v=>live()&&v?.capture())},
      {id:'today-customise',label:'Customise Today',detail:'Choose cards and sections',keywords:['layout','reorder','hide'],current:live,run:()=>lifeTools().then(v=>live()&&v?.customise())},
      {id:'security-module',label:'Security',detail:'Sign-in, sessions, app access and activity',keywords:['security module','password','passkeys','permissions','access','devices','privacy'],current:live,run:()=>security().then(s=>live()&&s?.open())},
      {id:'calendar-connections',label:'Connected calendars',detail:'Google Calendar, Outlook and iCalendar files',keywords:['subscribe','ics','calendar'],current:live,run:()=>lifeTools().then(v=>live()&&v?.calendars())},
      {id:'queued-file-recovery',label:'Queued file recovery',detail:'Retry or save files kept on this device',keywords:['upload','recover'],current:live,run:()=>files.recovery()},
      {id:'open-reminders',label:'Reminders',detail:'Actions linked to your apps',keywords:['tasks','todo','follow up'],current:live,run:()=>system().then(s=>live()&&s?.openList())},
      {id:'remembered-devices',label:'Remembered devices',detail:'Continuation and encrypted draft copies',keywords:['devices','privacy'],current:live,run:()=>system().then(s=>live()&&s?.devices())},
      { id: "open-activity", label: "Open Activity", detail: "Uploads, downloads and background tasks", keywords: ["transfers", "progress"], current: live, run: () => activityView.open() },
      { id: "open-recovery", label: "Open App status", detail: "Connection and recovery", keywords: ["offline", "recover"], current: live, run: () => recoveryView.open() },
      ...recovery.actions(),
    ],
  });
  paint(); activate(F.route).catch(() => {});
  return { show, hide, update: paint, destroy, openFiles,security:()=>security(),life:()=>lifeTools(),remembered:()=>system().then(s=>live()&&s?.devices()),
    notificationActions: note => notificationActions(note, { origin: location.origin, enabled: appOn, openApp, runIntent, current: live }),
    focus: () => { if (shown && route?.tool === "files") { const target = explorer?.focus(); if (target) return target; } const heading = root.querySelector("h1") || root; heading.tabIndex = -1; return heading; } };
}
