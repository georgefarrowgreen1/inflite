// InFlite's router: which screen an address is, and the address of a screen (One roof, spec §3.3; stages 2–4's joint
// contracts, roof/s24-contracts.md §3). Pure: no DOM, no storage, no history; the frame (frame.js) does all of that with
// what this returns. Written in full by B0 and frozen: every batch builds on these names and shapes (MAIN
// .tools/tests/unit/roofrouter.test.mjs pins them).
//
// Route = { kind: "tab", tab: "today" | "apps" | "you", arg: string | null }
//       | { kind: "app", app: <a REGISTRY key>, section: <one of its section ids>, key: string, arg: string | null, query: string }
//   tab arg: only You's, from /#you=<arg> (notify, quiet, rules, phone, apps, account, notify-weather, …).
//   app key: the hash's key as written, a section id or one of the app's aliases, else the app's first section;
//   app hash: only where key is one of the app's raw keys (REGISTRY[app].raw: Chats' share), the address's whole hash
//   after #, as written (≤ 7000 characters; such an address may be up to 2048 + 7000 long); absent otherwise.
//   app arg: what follows the first = after key, once decodeURIComponent'd (a day YYYY-MM-DD, a settings page, a symbol
//   such as TSCO.L, ^GSPC or GBPUSD=X, a thread's id); query: the address's search, raw ("" past 400).
//   An app's arg is only ever [A-Za-z0-9_.^=-]{1,40} after that one decoding; You's and Weather's [A-Za-z0-9_-]{1,40} as
//   written, never decoded (stage 1's rule, kept); anything else (or a bad %) is dropped (null).
//
// History state the frame writes: { ifl: { d: depth, k: key } } only (§3.3); nothing here reads it.

// The apps that are modules. sections = the module's SECTIONS = its connector's sections (roofcontract.test); css = the
// module's stylesheets, linked and awaited before mount (D2). Optional fields (s24-contracts §3):
//   link   the F.session.links key of the app's own address, where it isn't the app's name (links[R.link || app])
//   stay   hash keys the frame's tidy (D6) leaves in the address once shown (Mail's reader: #thread=<id>)
//   idb    the one IndexedDB database the module may open, only from <app>/roof/idb.js (C5)
// Stage 3 (Chats; roof/s3/spec.md §5.1, S3-C1), optional too:
//   tab      the tab-bar key whose screen this app's root route is (Chats: "chats"; the frame draws it as a tab screen)
//   id       the app's data id where it isn't the app's name (Chats: "chat": versions, IFL.built, push app, storage)
//   raw      hash keys whose whole hash the route carries raw, as route.hash (≤ 7000 characters; Send's #share=…)
//   service  the one file that may make the app's Worker (Chats: service.js, loaded only by the frame, never a module)
//   skip     { paths, query }: addresses under the app's path that aren't the framework's (null: a normal navigation):
//            a path starting with one of paths (Chat's own page at /chats/in/), or a query with one of query's names
//            (/chats/?engine=1, the milestone-1 engine)
const fz = (o) => Object.freeze(o);
const secs = (l) => fz(l.map((s) => fz(s)));
export const REGISTRY = fz({
  weather: fz({
    app: "weather",
    name: "Weather",
    path: "/weather/",
    entry: "/weather/roof/weather.js",
    connector: "/weather/roof/connector.js",
    css: fz(["/weather/roof/weather.css", "/weather/roof/wxcore.css", "/weather/roof/wxsettings.css", "/weather/roof/radar.css"]),
    sections: secs([["now", "Now"], ["days", "16 Days"], ["radar", "Radar"], ["warnings", "Warnings"]]),
    aliases: fz({ day: "days", settings: "now" }),
  }),
  markets: fz({
    app: "markets",
    name: "Markets",
    path: "/markets/",
    link: "finance",
    entry: "/markets/roof/markets.js",
    connector: "/markets/roof/connector.js",
    css: fz(["/markets/roof/markets.css"]),
    sections: secs([["today", "Today"], ["holdings", "Holdings"], ["news", "News"]]),
    aliases: fz({ s: "today", income: "holdings", isa: "holdings", vs: "holdings", about: "holdings" }),
  }),
  fitness: fz({
    app: "fitness",
    name: "Fitness",
    path: "/fitness/",
    idb: "fitness",
    entry: "/fitness/roof/fitness.js",
    connector: "/fitness/roof/connector.js",
    css: fz(["/fitness/roof/fitness.css", "/fitness/roof/fxviews.css"]),
    sections: secs([["today", "Today"], ["activities", "Activities"], ["progress", "Progress"]]),
    aliases: fz({ plan: "today", day: "today", offer: "today", settings: "today", act: "activities" }),
  }),
  mail: fz({
    app: "mail",
    name: "Mail",
    path: "/mail/",
    link: "email",
    entry: "/mail/roof/mail.js",
    connector: "/mail/roof/connector.js",
    css: fz(["/mail/roof/mail.css", "/mail/roof/reader.css", "/mail/roof/mailsheets.css"]),
    sections: secs([["people", "People"], ["updates", "Updates"], ["later", "Later"], ["done", "Done"]]),
    aliases: fz({ thread: "people", settings: "people", signin: "people" }),
    stay: fz(["thread"]),
  }),
  chats: fz({
    app: "chats",
    id: "chat",
    name: "Chats",
    path: "/chats/",
    tab: "chats",
    link: "chat",
    idb: "inflight",
    entry: "/chats/roof/chats.js",
    connector: "/chats/roof/connector.js",
    service: "/chats/roof/service.js",
    css: fz(["/chats/roof/chats.css", "/chats/roof/chsheets.css", "/chats/cards.css"]),
    sections: secs([["chats", "Chats"], ["friends", "Friends"]]),
    aliases: fz({ open: "chats", settings: "chats", account: "chats", flightlog: "chats", share: "chats", requests: "friends", add: "friends" }),
    stay: fz(["open"]),
    raw: fz(["share"]),
    skip: fz({ paths: fz(["/chats/in/"]), query: fz(["engine"]) }),
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

const ARG = /^[\w.^=-]{1,40}$/;
const QUERY_MAX = 400;
const HREF_MAX = 2048;
const RAW_MAX = 7000;
const BASE = "https://router.invalid";
const argOf = (s) => (typeof s === "string" && ARG.test(s) ? s : null);
// (You's arg and Weather's, as stage 1 had them: [\w-] only, never decoded)
const arg1 = (s) => (typeof s === "string" && /^[\w-]{1,40}$/.test(s) ? s : null);
// (an arg as the address writes it: decoded once; a bad % → null)
const argIn = (s) => { try { return argOf(decodeURIComponent(s)); } catch (_) { return null; } };
// (whether an app's routes are ours: roof true (every app) or a map with the app's flag true)
const isOn = (roof, app) => roof === true || (!!roof && typeof roof === "object" && roof[app] === true);

// parse(href, { roof, origin }) → Route | null (null: not the framework's, so a normal navigation).
//   href: a path ("/weather/#radar") or an absolute http(s) URL of this origin (a link's a.href). origin defaults to
//   globalThis.location.origin; an absolute URL of any other origin, a protocol-relative "//x", anything with a \ or a
//   control character, or over 2048 characters not counting its query → null. The query alone may be any length: past
//   400 characters it's dropped ("") and the route kept (§3.3).
//   roof: false (no app is ours), true (every app: only the frame's re-parse of an address it already accepted), or a
//   map { [app]: boolean } (the caller's `session.hub ? session.apps : false`): an app's paths are ours only where its
//   flag is true, else null (a normal navigation); tabs always are.
export function parse(href, { roof = false, origin } = {}) {
  if (typeof href !== "string" || !href) return null;
  if (/[\\\u0000-\u001f\u007f]/.test(href)) return null;
  // (the length cap is on the address less its query: from the first ? before any # up to that #)
  const h = href.indexOf("#"), q = href.indexOf("?");
  const qLen = q >= 0 && (h < 0 || q < h) ? (h < 0 ? href.length : h) - q : 0;
  // (a raw key's hash (Chats' #share=…) is capped on its own, RAW_MAX; whether the path is that app's is checked below)
  const hk = h < 0 ? "" : href.slice(h + 1).split("=")[0];
  const rawHash = h >= 0 && href.length - h - 1 <= RAW_MAX && Object.values(REGISTRY).some((r) => r.raw?.includes(hk));
  const long = href.length - qLen > HREF_MAX;
  if (long && !(rawHash && h - qLen <= HREF_MAX)) return null;
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
    if (hash.startsWith("you=")) return { kind: "tab", tab: "you", arg: arg1(hash.slice(4)) };
    return { kind: "tab", tab: "today", arg: null };
  }
  if (!roof) return null;
  for (const r of Object.values(REGISTRY)) {
    if (r.skip?.paths?.some((p) => path.startsWith(p))) return null;
    if (path !== r.path && path !== r.path + "index.html") continue;
    if (!isOn(roof, r.app)) return null;
    if (r.skip?.query?.some((n) => u.searchParams.has(n))) return null;
    const eq = hash.indexOf("=");
    const raw = eq < 0 ? hash : hash.slice(0, eq);
    const ids = r.sections.map((s) => s[0]);
    const section = ids.includes(raw) ? raw : Object.hasOwn(r.aliases, raw) ? r.aliases[raw] : null;
    const key = section ? raw : ids[0];
    const arg = section && eq >= 0 ? (r.app === "weather" ? arg1 : argIn)(hash.slice(eq + 1)) : null;
    const query = u.search.length <= QUERY_MAX ? u.search : "";
    const raws = !!section && !!r.raw?.includes(raw);
    if (long && !raws) return null;
    const out = { kind: "app", app: r.app, section: section || ids[0], key, arg, query };
    if (raws) out.hash = hash;
    return out;
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
    if (route.tab === "you") { const a = arg1(route.arg); return a ? `/#you=${a}` : "/#you"; }
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
  const a = fits || !hasKey ? (r.app === "weather" ? arg1 : argOf)(route.arg) : null;
  if (a) return `${r.path}#${key}=${a}`;
  return key === ids[0] ? r.path : `${r.path}#${key}`;
}

// owns(path, { roof, origin }): the framework draws this address in-page. Callers pass roof: session.hub ? session.apps : false.
export const owns = (path, opts = {}) => parse(path, opts) !== null;
