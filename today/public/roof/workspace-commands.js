// OS command search and notification intents. Metadata/query text stays in this
// account's page; the owning apps still open editors and confirm every write.
import { match } from "./search.js";
import { parse, REGISTRY } from "./router.js";
import { loadStyles } from "./modules.js";

const APPS = new Set(["fitness", "weather", "markets", "chats", "mail"]);
const ACTION = /^[a-z][a-z0-9-]{0,47}$/;
const OBJECT = /^[A-Za-z0-9_-]{1,40}$/;
const clean = (value, max = 160) => typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g, " ").trim().slice(0, max) : "";
const get = (fn, fallback) => { try { return typeof fn === "function" ? fn() : fallback; } catch (_) { return fallback; } };
const list = value => Array.isArray(value) ? value : [];
const iconOf = app => app === "chats" ? "chat" : app;
const FILE_ACTIONS = new Set(["compose-attach", "import-drive", "save-route-drive", "save-workout-drive"]);
const FILE_ALIASES = {
  "compose-attach": ["attach a file", "attach from Drive", "email a document", "send file in Mail"],
  "import-drive": ["import route", "import activity", "open GPX", "open FIT", "import from Drive"],
  "save-route-drive": ["save export", "save route", "export GPX to Drive"],
  "save-workout-drive": ["save export", "save workout", "export FIT to Drive"],
};
const SYSTEMS = {
  "open-activity": ["Activity", "Show activity progress uploads downloads background tasks"],
  "sync-workspaces": ["Sync workspaces", "Sync my workspaces update layouts across devices"],
  "resolve-workspace-sync": ["Review workspace sync", "Resolve workspace conflict choose local cloud layout"],
  "open-recovery": ["App status", "Show connection offline app status recovery"],
};
const revisionOf = value => value == null ? null : typeof value === "string" && value.length <= 80 || Number.isSafeInteger(value) && value >= 0 ? value : undefined;
const DEFAULTS = [
  { app: "mail", id: "compose", label: "Compose Mail", keywords: ["new message", "write email", "new email"] },
  { app: "mail", id: "compose-attach", label: "Attach a file in Mail" },
  { app: "fitness", id: "import-drive", label: "Import a route or activity" },
  { app: "chats", id: "new-chat", label: "New chat", keywords: ["compose message", "send message", "start conversation"] },
  { app: "chats", id: "new-group", label: "New group", keywords: ["group chat", "create group"] },
  { app: "fitness", id: "schedule", label: "Set ride time", keywords: ["reschedule ride", "schedule training", "plan ride"] },
  { app: "weather", id: "places", label: "Choose weather location", keywords: ["change place", "find weather", "forecast location"] },
  { app: "markets", id: "add-stock", label: "Add a holding", keywords: ["buy investment", "add stock", "portfolio holding"] },
  { app: "markets", id: "add-cash", label: "Add cash savings", keywords: ["savings account", "cash holding", "interest rate"] },
];

// Getter dependencies are intentional: app availability and provider actions can
// change after a lock/unlock or entitlement refresh without retaining old data.
export function createWorkspaceCommands(F, options = {}) {
  const owner = F.session?.view?.user?.id, signal = F.signal, doc = globalThis.document;
  let gone = false;
  const running = new Map();
  const live = () => !gone && !signal?.aborted && !!owner && F.session?.view?.user?.id === owner;
  const available = app => live() && APPS.has(app) && F.session?.apps?.[app] === true
    && (app !== "mail" || F.session?.view?.apps?.mail === true)
    && list(get(options.apps, [])).some(a => a?.id === app && a.available !== false);
  const invoke = fn => {
    if (!live()) return false;
    try { return Promise.resolve(fn()).catch(error => { if (live() && error?.name !== "AbortError") F.toast?.("That action couldn’t open. Try again."); return false; }); }
    catch (_) { if (live()) F.toast?.("That action couldn’t open. Try again."); return false; }
  };
  function nativeActions() {
    const dynamic = new Map();
    for (const a of list(get(options.actions, [])).slice(0, 100)) if (a && APPS.has(a.app) && ACTION.test(a.id || "")) dynamic.set(`${a.app}:${a.id}`, a);
    const actions = new Map(DEFAULTS.map(a => [`${a.app}:${a.id}`, a]));
    for (const [key, a] of dynamic) actions.set(key, { ...actions.get(key), ...a });
    return { actions, dynamic };
  }
  const filesReady = () => get(options.fileDialogsAvailable, false) === true;
  const nativeAllowed = a => a && available(a.app) && (!FILE_ACTIONS.has(a.id) || filesReady()) && get(a.current, true) !== false;
  const nativeEnabled = a => nativeAllowed(a) && a.enabled !== false;
  function systems() {
    const result = new Map();
    for (const a of list(get(options.systemActions, [])).slice(0, 40)) {
      const retry = typeof a?.id === "string" && /^retry-(fitness|weather|markets|chats|mail)$/.exec(a.id);
      const app = retry ? retry[1] : null;
      if (!a || !Object.hasOwn(SYSTEMS, a.id) && !retry || a.app != null && a.app !== app || typeof a.run !== "function" || typeof a.current !== "function" || revisionOf(a.revision) === undefined) continue;
      if (a.enabled !== false && (!app || available(app)) && get(a.current, false) === true) result.set(a.id, { ...a, app });
    }
    return result;
  }
  // Callers receive a lease that remains live through native imports/pickers.
  // Repeated Enter/click cannot run a second copy of the same pending action.
  function owned(key, current, run, continuing = current) {
    if (!live() || !current() || running.has(key)) return false;
    const controller = new AbortController(), stop = () => controller.abort();
    const lease = { signal: controller.signal, current: () => live() && !controller.signal.aborted && continuing() };
    signal?.addEventListener("abort", stop, { once: true }); running.set(key, controller);
    if (signal?.aborted) stop();
    let result;
    try { result = lease.current() ? run(lease) : false; }
    catch (error) { result = Promise.reject(error); }
    return Promise.resolve(result).catch(error => {
      if (lease.current() && error?.name !== "AbortError") F.toast?.("That action couldn’t open. Try again.");
      return false;
    }).finally(() => {
      signal?.removeEventListener("abort", stop);
      if (running.get(key) === controller) running.delete(key);
    });
  }
  const entry = (title, sub, app, run) => ({ title, sub, icon: iconOf(app), run: () => invoke(run) });
  const provider = {
    id: "workspace-commands", group: "Actions and files", order: 0,
    async search(value) {
      const query = clean(value);
      if (!live() || !query) return [];
      const commandQuery = query.replace(/^(open|show|find|search|attach|import|save|sync|retry|resume|email|send)\s+(?:my|the|a|this)\s+/i, "$1 ");
      const results = [], { actions, dynamic } = nativeActions();
      for (const [key, a] of actions) {
        if (!nativeEnabled(a) || typeof options.runIntent !== "function" || a.objectId != null && (typeof a.objectId !== "string" || !a.objectId || a.objectId.length > 200 || /[\u0000-\u001f\u007f]/.test(a.objectId))) continue;
        const label = clean(a.label, 100), aliases = [...list(a.keywords), ...list(FILE_ALIASES[a.id])].map(k => clean(k, 80)).filter(Boolean);
        const text = [label, REGISTRY[a.app].name, ...aliases].join(" · ");
        if (!label || !match(commandQuery, text)) continue;
        const objectId = typeof a.objectId === "string" && a.objectId.length <= 200 ? a.objectId : undefined;
        const wasDynamic = dynamic.has(key), current = (selection = true) => {
          const latest = nativeActions();
          if (wasDynamic && !latest.dynamic.has(key)) return false;
          const next = latest.actions.get(key), ref = typeof next?.objectId === "string" && next.objectId.length <= 200 ? next.objectId : undefined;
          return (selection ? nativeEnabled(next) : nativeAllowed(next)) && ref === objectId;
        };
        results.push(entry(label, [REGISTRY[a.app].name, ...aliases].join(" · "), a.app,
          () => owned("native:" + key, current, lease => options.runIntent(a.app, a.id, objectId, lease), () => current(false))));
      }
      for (const [id, a] of systems()) {
        const spec = SYSTEMS[id] || [`Retry ${REGISTRY[a.app].name}`, `Retry ${REGISTRY[a.app].name} recover app connection`];
        const title = clean(a.label, 100) || spec[0], sub = clean(a.detail, 180) || "InFlite OS";
        if (!match(commandQuery, [title, spec[1], ...list(a.keywords).map(k => clean(k, 80))].join(" · "))) continue;
        const revision = revisionOf(a.revision), current = () => {
          const next = systems().get(id);
          return !!next && next.app === a.app && revisionOf(next.revision) === revision;
        };
        results.push(entry(title, sub, a.app, () => owned("system:" + id, current, lease => systems().get(id)?.run(lease), () => (!a.app || available(a.app)) && get(a.current, false) === true)));
      }
      if (typeof options.openFiles === "function" && match(commandQuery, "Find attachments and files documents PDF downloads")) results.push(entry("Find attachments and files", "Open your Files library", undefined, () => options.openFiles("")));
      if (/^(open|show|switch)\b/i.test(query) && typeof options.openApp === "function") for (const app of APPS) {
        if (available(app) && match(commandQuery, `Open ${REGISTRY[app].name}`)) results.push(entry(`Open ${REGISTRY[app].name}`, "App", app, () => available(app) ? options.openApp(app) : false));
      }
      for (const w of list(get(options.workspaces, []))) {
        const name = clean(w?.name, 60), id = typeof w?.id === "string" && /^[a-z][a-z0-9_-]{0,39}$/.test(w.id) ? w.id : null;
        const ride = id === "ride" || /\bride\b/i.test(name) && list(w?.panes).some(p => p?.app === "fitness");
        const description = ride ? "Open my ride · Saved workspace" : "Saved workspace";
        if (id && name && typeof options.openWorkspace === "function" && match(commandQuery, `Open ${name} workspace ${description}`)) results.push(entry(`Open ${name} workspace`, description, undefined, () => options.openWorkspace(id)));
      }
      const fileQuery = query.replace(/^(?:find|search|show|open)\s+(?:files?|attachments?|documents?)\s+/i, "");
      // This getter must search already-loaded metadata locally. Opening Files
      // is the explicit action that may ask apps for a bounded fresh index.
      let files = [];
      try { const answer = await options.files?.(fileQuery); files = list(answer?.files || answer); } catch (_) {}
      if (!live()) return [];
      const seen = new Set();
      for (const file of files.slice(0, 200)) {
        // The shared Files index already returns guarded search entries. Keep
        // its app-owned execution callback instead of rebuilding a file URL.
        if (typeof file?.title === "string" && typeof file?.run === "function" && !file.href) {
          const title = clean(file.title, 240), sub = clean(file.sub, 240);
          // A generic Files offer has no owning app even when its display
          // glyph resembles one. Older local indexes can omit the app field.
          if (Object.hasOwn(file, "app") && file.app !== null && !APPS.has(file.app)) continue;
          const app = Object.hasOwn(file, "app") ? APPS.has(file.app) ? file.app : null : file.icon === "chat" ? "chats" : APPS.has(file.icon) ? file.icon : null;
          if (!title || app && !available(app) || !match(fileQuery, title + " " + sub)) continue;
          const result = entry(title, sub, app, () => !app || available(app) ? file.run() : false);
          if (APPS.has(file.icon) || file.icon === "chat") result.icon = iconOf(file.icon);
          results.push(result);
          continue;
        }
        const name = clean(file?.name, 240), app = file?.app, intent = file?.intent;
        const ref = typeof file?.objectId === "string" ? file.objectId : file?.id;
        if (!name || !available(app) || !ACTION.test(intent || "") || typeof ref !== "string" || ref.length > 300 || seen.has(`${app}:${ref}`)) continue;
        if (!match(fileQuery, [name, file.source, file.mime].filter(v => typeof v === "string").join(" · "))) continue;
        seen.add(`${app}:${ref}`);
        if (typeof options.runIntent === "function") results.push(entry(name, `${REGISTRY[app].name} · ${clean(file.source, 80) || "File"}`, app,
          () => available(app) ? options.runIntent(app, intent, ref) : false));
      }
      return results.slice(0, 20);
    },
  };
  const off = F.search.provide(provider);
  const keydown = event => {
    if (!live() || event.defaultPrevented || event.repeat || event.isComposing || event.altKey || !(event.ctrlKey || event.metaKey) || event.key?.toLowerCase() !== "k") return;
    const path = typeof event.composedPath === "function" ? event.composedPath() : [event.target];
    if (path.some(node => node?.closest?.("input,textarea,select,[contenteditable]:not([contenteditable=false])")) || doc.querySelector("dialog[open]")) return;
    event.preventDefault(); F.search.open();
  };
  doc?.addEventListener("keydown", keydown);
  const ready = doc ? loadStyles("/roof/workspace-commands.css") : Promise.resolve();
  // The host waits for this before offering notification action rows. Handle a
  // rejection here too so a missing optional stylesheet never becomes unhandled.
  ready.catch(() => {});
  function destroy() { if (gone) return; gone = true; for (const controller of running.values()) controller.abort(); running.clear(); off?.(); doc?.removeEventListener("keydown", keydown); signal?.removeEventListener?.("abort", destroy); }
  signal?.addEventListener?.("abort", destroy, { once: true });
  if (signal?.aborted) destroy();
  return { ready, destroy };
}

// Only curated same-origin references from the device's real notification log
// can become actions. No query, auth/share token, external URL or inferred ID is
// handed to an app. Reply opens its editor; it does not send a message.
export function notificationTarget(note, origin = globalThis.location?.origin) {
  const app = note?.app === "chat" ? "chats" : note?.app;
  const url = typeof note?.url === "string" ? note.url : "";
  if (!APPS.has(app) || !url.startsWith("/") || url.startsWith("//") || url.length > 320 || /[?%\\\s\u0000-\u001f\u007f]/.test(url)) return null;
  let u;
  try { u = new URL(url, origin); } catch (_) { return null; }
  if (u.origin !== origin || u.username || u.password || u.search) return null;
  if (url.split("#", 1)[0] !== u.pathname) return null;
  const route = parse(u.href, { roof: true, origin });
  if (!route || route.kind !== "app" || route.app !== app) return null;
  // The router deliberately falls back for an unknown hash. Notifications
  // must match an exact reference before they gain an app action.
  const hash = u.hash.slice(1), expected = route.key + (route.arg ? "=" + route.arg : "");
  if (hash && hash !== expected) return null;
  const allowed = new Set(REGISTRY[app].sections.map(([key]) => key));
  let objectId = null;
  if (route.key === "open" && app === "chats" || route.key === "thread" && app === "mail") {
    if (!OBJECT.test(route.arg || "")) return null;
    objectId = route.arg;
  } else if (app === "fitness" && route.key === "day") {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(route.arg || "") || !Number.isFinite(Date.parse(route.arg + "T12:00:00Z")) || new Date(route.arg + "T12:00:00Z").toISOString().slice(0, 10) !== route.arg) return null;
  } else if (app === "markets" && route.key === "s") {
    if (!/^[A-Za-z^][A-Za-z0-9.^=-]{0,39}$/.test(route.arg || "")) return null;
  } else if (!allowed.has(route.key) || route.arg) return null;
  return Object.freeze({ app, path: u.pathname + u.hash, key: route.key, objectId });
}

export function notificationActions(note, options = {}) {
  const target = notificationTarget(note, options.origin || globalThis.location?.origin);
  if (!target || typeof options.enabled !== "function" || !options.enabled(target.app) || options.current?.() === false) return [];
  const live = () => options.current?.() !== false && options.enabled(target.app);
  const result = [];
  const action = (id, label, glyph, run) => {
    let used = false;
    return { id, label, icon: glyph, run() { if (used || !live()) return false; used = true; return run(); } };
  };
  if (target.objectId && (target.app === "chats" || target.app === "mail") && typeof options.runIntent === "function") result.push(action("reply", "Reply", "reply", () => options.runIntent(target.app, "reply", target.objectId)));
  if (target.app === "fitness" && target.key === "today" && typeof options.runIntent === "function") result.push(action("schedule", "Change ride time", "clock", () => options.runIntent("fitness", "schedule")));
  if (typeof options.openWorkspace === "function") result.push(action("workspace", "Open workspace", "grid", () => options.openWorkspace(target.app, target.path)));
  return result;
}
