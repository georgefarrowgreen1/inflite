// Workspace manifest v1. These describe trusted first-party integrations, not a
// security sandbox or a grant of browser/server permissions. No app data lives here.
export const WORKSPACE_MANIFEST_VERSION = 1;
const app = (id, name, href, pane, capabilities) => Object.freeze({
  manifestVersion: WORKSPACE_MANIFEST_VERSION, id, name, icon: id, href, pane,
  trust: "first-party", formFactors: Object.freeze(["phone", "desktop"]),
  capabilities: Object.freeze(capabilities),
  ...(pane ? { workspace: Object.freeze({ css: `/${id}/roof/workspace.css` }) } : {}),
});
export const WORKSPACE_APPS = Object.freeze([
  app("fitness", "Fitness", "/fitness/#today", true, ["view", "local-search", "share-on-request"]),
  app("weather", "Weather", "/weather/#now", true, ["view", "local-search", "location-on-request"]),
  app("markets", "Markets", "/markets/#today", false, ["view", "local-search"]),
  app("chats", "Chats", "/chats/", false, ["view", "encrypted-messaging"]),
  app("mail", "Mail", "/mail/", false, ["view", "isolated-message-body"]),
]);
export const getWorkspaceApp = (id) => WORKSPACE_APPS.find((a) => a.id === id) || null;

const sections = Object.freeze({
  fitness: ["today", "activities", "routes", "progress"],
  weather: ["now", "days", "radar", "warnings"],
  markets: ["today", "holdings", "news"],
  chats: ["chats", "friends"],
  mail: ["people", "updates", "later", "done"],
});
const day = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(s + "T12:00:00Z")) && new Date(s + "T12:00:00Z").toISOString().slice(0, 10) === s;
const objectId = (s) => /^[A-Za-z0-9_-]{1,40}$/.test(s);
// Persist only an app's known internal screen/object reference. Reject rather
// than strip queries: auth codes, location parameters and share payloads must
// never survive as a saved workspace, even if the live router accepts them.
export function safeWorkspaceRoute(id, route) {
  const a = getWorkspaceApp(id);
  if (!a || typeof route !== "string" || route.length > 160 || /[?%\\\s\u0000-\u001f\u007f]/.test(route)) return null;
  const base = `/${id}/`;
  if (route === base) return a.href;
  if (!route.startsWith(base + "#")) return null;
  const hash = route.slice(base.length + 1), at = hash.indexOf("="), key = at < 0 ? hash : hash.slice(0, at), value = at < 0 ? null : hash.slice(at + 1);
  if (value === null && sections[id].includes(key)) return route;
  if ((id === "fitness" || id === "weather") && key === "day" && day(value || "")) return route;
  if ((id === "fitness" && key === "act" || id === "mail" && key === "thread" || id === "chats" && key === "open") && objectId(value || "")) return route;
  if (id === "markets" && key === "s" && /^[A-Za-z^][A-Za-z0-9.^=-]{0,39}$/.test(value || "")) return route;
  return null;
}
