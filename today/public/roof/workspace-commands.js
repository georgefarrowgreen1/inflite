// OS command search and notification intents. Metadata/query text stays in this
// account's page; the owning apps still open editors and confirm every write.
import { match } from "./search.js";
import { parse, REGISTRY } from "./router.js";
import { loadStyles } from "./modules.js";

const APPS = new Set(["fitness", "weather", "markets", "chats", "mail"]);
const ACTION = /^[a-z][a-z0-9-]{0,47}$/;
const OBJECT = /^[A-Za-z0-9_-]{1,40}$/;
const clean = (value, max = 160) => typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max) : "";
const get = (fn, fallback) => { try { return typeof fn === "function" ? fn() : fallback; } catch (_) { return fallback; } };
const list = value => Array.isArray(value) ? value : [];
const iconOf = app => app === "chats" ? "chat" : app;
const DEFAULTS = [
  { app: "mail", id: "compose", label: "Compose Mail", keywords: ["new message", "write email", "new email"] },
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
  const live = () => !gone && !signal?.aborted && !!owner && F.session?.view?.user?.id === owner;
  const available = app => live() && APPS.has(app) && F.session?.apps?.[app] === true
    && (app !== "mail" || F.session?.view?.apps?.mail === true)
    && list(get(options.apps, [])).some(a => a?.id === app && a.available !== false);
  const invoke = fn => {
    if (!live()) return false;
    try { return Promise.resolve(fn()).catch(() => { if (live()) F.toast?.("That action couldn’t open. Try again."); return false; }); }
    catch (_) { if (live()) F.toast?.("That action couldn’t open. Try again."); return false; }
  };
  const entry = (title, sub, app, run) => ({ title, sub, icon: iconOf(app), run: () => invoke(run) });
  const provider = {
    id: "workspace-commands", group: "Actions and files", order: 0,
    async search(value) {
      const query = clean(value);
      if (!live() || !query) return [];
      const commandQuery = query.replace(/^(open|show|find|search)\s+my\s+/i, "$1 ");
      const results = [], dynamic = new Map();
      for (const a of list(get(options.actions, []))) if (a && APPS.has(a.app) && ACTION.test(a.id || "")) dynamic.set(`${a.app}:${a.id}`, a);
      const actions = new Map(DEFAULTS.map(a => [`${a.app}:${a.id}`, a]));
      for (const [key, a] of dynamic) actions.set(key, { ...actions.get(key), ...a });
      for (const a of actions.values()) {
        if (!available(a.app) || a.enabled === false || typeof options.runIntent !== "function") continue;
        const label = clean(a.label, 100), aliases = list(a.keywords).map(k => clean(k, 80)).filter(Boolean);
        const text = [label, REGISTRY[a.app].name, ...aliases].join(" · ");
        if (!label || !match(commandQuery, text)) continue;
        const objectId = typeof a.objectId === "string" && a.objectId.length <= 200 ? a.objectId : undefined;
        results.push(entry(label, [REGISTRY[a.app].name, ...aliases].join(" · "), a.app,
          () => available(a.app) ? options.runIntent(a.app, a.id, objectId) : false));
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
    if (event.target?.closest?.("input,textarea,select,[contenteditable]:not([contenteditable=false])") || doc.querySelector("dialog[open]")) return;
    event.preventDefault(); F.search.open();
  };
  doc?.addEventListener("keydown", keydown);
  const ready = doc ? loadStyles("/roof/workspace-commands.css") : Promise.resolve();
  // The host waits for this before offering notification action rows. Handle a
  // rejection here too so a missing optional stylesheet never becomes unhandled.
  ready.catch(() => {});
  function destroy() { if (gone) return; gone = true; off?.(); doc?.removeEventListener("keydown", keydown); signal?.removeEventListener?.("abort", destroy); }
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
