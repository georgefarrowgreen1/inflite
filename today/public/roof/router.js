// InFlite's router: which screen an address is, and the address of a screen (One roof, spec §3.3). Pure: no DOM, no
// storage, no history; the frame (frame.js) does all of that with what this returns. Written in full by B0 and frozen:
// every batch builds on these names and shapes (MAIN .tools/tests/unit/roofrouter.test.mjs pins them).
//
// Route = { kind: "tab", tab: "today" | "apps" | "you", arg: string | null }
//       | { kind: "app", app: "weather", section: "now" | "days" | "radar" | "warnings", key: string, arg: string | null, query: string }
//   tab arg: only You's, from /#you=<arg> (notify, quiet, rules, phone, apps, account, notify-weather, …).
//   app key: the hash's key as written, a section id or one of the app's aliases (day, settings), else "now";
//   app arg: what follows key= (a day YYYY-MM-DD, a settings page); query: the address's search, raw ("" past 400).
//   An arg is only ever [A-Za-z0-9_-]{1,40}; anything else is dropped (null), never passed on.
//
// History state the frame writes: { ifl: { d: depth, k: key } } only (§3.3); nothing here reads it.

// The apps that are modules (stage 1: Weather). sections = the module's SECTIONS = its connector's sections
// (roofcontract.test); css = the module's stylesheets, linked and awaited before mount (D2).
export const REGISTRY = Object.freeze({
  weather: Object.freeze({
    app: "weather",
    name: "Weather",
    path: "/weather/",
    entry: "/weather/roof/weather.js",
    connector: "/weather/roof/connector.js",
    css: Object.freeze(["/weather/roof/weather.css", "/weather/roof/wxcore.css", "/weather/roof/wxsettings.css", "/weather/roof/radar.css"]),
    sections: Object.freeze([["now", "Now"], ["days", "16 Days"], ["radar", "Radar"], ["warnings", "Warnings"]].map((s) => Object.freeze(s))),
    aliases: Object.freeze({ day: "days", settings: "now" }),
  }),
});

// The tab bar: [label, href, glyph], as the shared block's IFL.hub.tabs has them (keys, not words).
export const TABS = Object.freeze({
  today: Object.freeze(["Today", "/", "sun"]),
  chats: Object.freeze(["Chats", "/chats/", "bubble"]),
  apps: Object.freeze(["Apps", "/#apps", "grid"]),
  you: Object.freeze(["You", "/#you", "person"]),
});

// A path of this site's, as the shared block's rule has it: starts /, not //, no \ and nothing unseen, ≤ 200 characters.
export const ownPath = (p) => typeof p === "string" && p.length <= 200 && /^\/(?!\/)/.test(p) && !/[\\\u0000-\u001f\u007f]/.test(p);

const ARG = /^[\w-]{1,40}$/;
const QUERY_MAX = 400;
const HREF_MAX = 2048;
const BASE = "https://router.invalid";
const argOf = (s) => (typeof s === "string" && ARG.test(s) ? s : null);

// parse(href, { roof, origin }) → Route | null (null: not the framework's, so a normal navigation).
//   href: a path ("/weather/#radar") or an absolute http(s) URL of this origin (a link's a.href). origin defaults to
//   globalThis.location.origin; an absolute URL of any other origin, a protocol-relative "//x", anything with a \ or a
//   control character, or over 2048 characters not counting its query → null. The query alone may be any length: past
//   400 characters it's dropped ("") and the route kept (§3.3).
//   roof: the caller's `session.hub && session.roof`; falsy → app paths are not ours (null), tabs still are.
export function parse(href, { roof = false, origin } = {}) {
  if (typeof href !== "string" || !href) return null;
  if (/[\\\u0000-\u001f\u007f]/.test(href)) return null;
  // (the length cap is on the address less its query: from the first ? before any # up to that #)
  const h = href.indexOf("#"), q = href.indexOf("?");
  const qLen = q >= 0 && (h < 0 || q < h) ? (h < 0 ? href.length : h) - q : 0;
  if (href.length - qLen > HREF_MAX) return null;
  let u;
  if (href[0] === "/") {
    if (href[1] === "/") return null;
    try { u = new URL(href, BASE); } catch (_) { return null; }
  } else {
    if (!/^https?:\/\//i.test(href)) return null;
    const own = origin ?? globalThis.location?.origin;
    if (!own) return null;
    try { u = new URL(href); } catch (_) { return null; }
    if (u.origin !== own) return null;
  }
  const path = u.pathname, hash = u.hash.slice(1);
  if (path === "/" || path === "/index.html") {
    if (hash === "apps") return { kind: "tab", tab: "apps", arg: null };
    if (hash === "you") return { kind: "tab", tab: "you", arg: null };
    if (hash.startsWith("you=")) return { kind: "tab", tab: "you", arg: argOf(hash.slice(4)) };
    return { kind: "tab", tab: "today", arg: null };
  }
  if (!roof) return null;
  for (const r of Object.values(REGISTRY)) {
    if (path !== r.path && path !== r.path + "index.html") continue;
    const eq = hash.indexOf("=");
    const raw = eq < 0 ? hash : hash.slice(0, eq);
    const ids = r.sections.map((s) => s[0]);
    const section = ids.includes(raw) ? raw : Object.hasOwn(r.aliases, raw) ? r.aliases[raw] : null;
    const key = section ? raw : ids[0];
    const arg = section && eq >= 0 ? argOf(hash.slice(eq + 1)) : null;
    const query = u.search.length <= QUERY_MAX ? u.search : "";
    return { kind: "app", app: r.app, section: section || ids[0], key, arg, query };
  }
  return null;
}

// format(route) → path. Tabs: "/", "/#apps", "/#you", "/#you=<arg>". Apps: the app's path for its first section with no
// key ("/weather/"), "/weather/#<key>" otherwise, "/weather/#<key>=<arg>" with an arg. Never a query (so the address is
// tidied of ?lat…&name=… once a deep link is shown, D6). Anything unknown → "/".
//   kind may be left out: a route with `app` is an app route, else one with `tab` a tab route.
//   section: one of the app's section ids; left out (or not one), it's the key's section, else the first.
//   key: used only when it belongs to the section (the section itself, or an alias of it: day → days, settings → now);
//     a key of another section (a spread route whose section was changed) is dropped, and its arg with it, and the
//     address is the section's own. With no key, the key is the section and an arg goes with it.
//   So the frame's calls are:
//     D6 tidy after a deep link is shown:  format({ app, section })                → "/weather/#days"
//     fw.nav.section(id, { arg }):         format({ app, section: id, arg })       → "/weather/#radar", "/weather/#days=<arg>"
//     fw.nav.href(key, arg):               format({ app, key, arg })               → "/weather/#day=2026-11-03"
//     a spread route, section changed:     format({ ...route, section: "radar" })  → "/weather/#radar" (key day, arg dropped)
export function format(route) {
  if (!route || typeof route !== "object") return "/";
  const kind = route.kind ?? (route.app != null ? "app" : route.tab != null ? "tab" : null);
  if (kind === "tab") {
    if (route.tab === "apps") return "/#apps";
    if (route.tab === "you") { const a = argOf(route.arg); return a ? `/#you=${a}` : "/#you"; }
    return "/";
  }
  const r = kind === "app" && typeof route.app === "string" && Object.hasOwn(REGISTRY, route.app) ? REGISTRY[route.app] : null;
  if (!r) return "/";
  const ids = r.sections.map((s) => s[0]);
  const sectionOf = (k) => (typeof k !== "string" ? null : ids.includes(k) ? k : Object.hasOwn(r.aliases, k) ? r.aliases[k] : null);
  const section = ids.includes(route.section) ? route.section : sectionOf(route.key) || ids[0];
  const hasKey = route.key != null;
  const fits = hasKey && sectionOf(route.key) === section;
  const key = fits ? route.key : section;
  const a = fits || !hasKey ? argOf(route.arg) : null;
  if (a) return `${r.path}#${key}=${a}`;
  return key === ids[0] ? r.path : `${r.path}#${key}`;
}

// owns(path, { roof, origin }): the framework draws this address in-page. Callers pass roof: session.hub && session.roof.
export const owns = (path, opts = {}) => parse(path, opts) !== null;
