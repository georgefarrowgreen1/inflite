// What each app shares with InFlite (One roof, spec §3.12, §6.1, D5). Loaded lazily (Apps, You, search, the Places
// provider). Words say only what each app really does today; nothing promised of a later stage.
// Connector = { app, name, icon, href, shares: { cards?, search?, notifications?, actions?, screens? }, sections,
//   aliases, files?, lazy?, mini?(answer) → Mini | null, search?(q, { userId }) → Entry[] } (v1; lazy and userId: s24 §5)
// Mini = { kind: "num-bars", num, bars, label } | { kind: "pct-spark", pct, spark } (a percentage, never amounts; spark: the
//   card's intraday values (cards.markets.spark.vals) made 0…1 here, so only the day's shape leaves, or null) | { kind: "num", num, label }
// STATIC: the apps beside InFlite (chats) and the words of each module that's switched off (fitness, markets, mail), with
//   hrefs to their hub pages and their minis.
// connectorOf(app, F) → Promise<Connector>: a REGISTRY app that's on (F.session.apps[app]) → its connector.js (minis
//   from STATIC where it has none); off, or its file failing → STATIC[app] (Weather: a fallback without search or mini).
// miniOf(app, answer, F?) → Promise<Mini | null>: the connector's mini(answer), null where it has none or it throws
//   (given F, Weather's connector file is asked for only while hub and roof are on).
// openConnector(F, app): the connector sheet (dialog.ifl-sheet[data-sheet=connector]): the app's icon, "<App>’s
//   connector", one line, a row per contract word the app fills, "Open <App>", and for Weather "Weather Settings" and
//   "Weather Notifications", for Markets "Markets Notifications" (/#you=notify), for Fitness while it's on "Fitness
//   Settings" (/fitness/#settings).
// connectorProvider(F, app) → off: the app's connector.search as a search provider, given { userId } (s24 §5, §6);
//   registered by the frame for each app that's on, unless its module is mounted with a provider of its own. Weather's
//   is Places (wx:places, on this device; it adds "Weather Settings"): placesProvider(F) = connectorProvider(F, "weather").
// chatsProvider(F, svc) → off (stage 3, §2.4): Chats' search, the frame's own over its service (never fw.search.provide,
//   so no module's provider is put aside), registered by the frame while the service is signed in and unlocked. People:
//   friends and groups by name (names only, from its friends and groups topics, caught up through "*"); Messages: svc.call("search", q) over
//   what's on this phone, the query to the core by postMessage only. Each opens that chat (/chats/#open=<id>). Orders 5
//   and 6 (before Apps) while the Chats screen shows, else 15 and 16.
import { REGISTRY } from "./router.js";
import { match } from "./search.js";

export const WORDS = [["cards", "Cards"], ["search", "Search"], ["notifications", "Notifications"], ["actions", "Actions"], ["screens", "Screens"]];
const sec = (path, list) => list.map(([id, l]) => [id, l, `${path}#${id}`]);
export const STATIC = Object.freeze({
  chats: { app: "chats", name: "Chats", icon: "chat", href: "/chats/", sections: [],
    shares: { cards: "Who’s waiting for you, and letters on their way", notifications: "New messages, and letters as they land", screens: "Chats, on its own page for now" } },
  fitness: { app: "fitness", name: "Fitness", icon: "fitness", href: "/fitness/", sections: sec("/fitness/", [["today", "Today"], ["activities", "Activities"], ["progress", "Progress"]]),
    shares: { cards: "Today’s session or the ride you’ve done", notifications: "Your session, in the morning notification", actions: "Open Today, Activities or Progress; send a session", screens: "Today · Activities · Progress, on its own page for now" },
    mini: (a) => { const c = a?.cards?.fitness; return c && Number.isFinite(Number(c.ctl)) ? { kind: "num", num: String(Math.round(Number(c.ctl))), label: "Fitness" } : null; } },
  markets: { app: "markets", name: "Markets", icon: "markets", href: "/markets/", sections: sec("/markets/", [["today", "Today"], ["holdings", "Holdings"], ["news", "News"]]),
    shares: { cards: "How your holdings are doing today", notifications: "Price alerts and the evening wrap", screens: "Today · Holdings · News, on its own page for now" },
    mini: (a) => {
      const c = a?.cards?.markets, p = Number(c?.pct), v = (c?.spark?.vals || []).map(Number).filter(Number.isFinite), lo = Math.min(...v), d = Math.max(...v) - lo || 1;
      return c?.traded && Number.isFinite(p) ? { kind: "pct-spark", pct: p, spark: v.length > 1 ? v.map((x) => (x - lo) / d) : null } : null;
    } },
  mail: { app: "mail", name: "Mail", icon: "mail", href: "/mail/", sections: [],
    shares: { notifications: "New mail, from Mail’s own notifications", screens: "Mail, framed in InFlite" } },
});
for (const c of Object.values(STATIC)) c.links = c.sections.map(([, l, h]) => [l, h]);

// Weather without its connector file (hub or roof off): what it shares, no search, no mini
const fallback = (app) => {
  const R = REGISTRY[app];
  return { app, name: R.name, icon: app, href: R.path, sections: R.sections, aliases: R.aliases,
    shares: { cards: "Today’s weather card, rain on your ride, warnings", notifications: "Rain alerts, warnings, the morning briefing and sunshine for your panels, through InFlite", screens: R.sections.map((s) => s[1]).join(" · ") } };
};
let F0 = null;
export async function connectorOf(app, F = F0) {
  if (app === "chat") app = "chats";
  const R = REGISTRY[app];
  if (!R) return STATIC[app] || null;
  if (F ? !F.session?.apps?.[app] : STATIC[app]) return STATIC[app] || fallback(app);
  try {
    const m = await import(R.connector);
    return { icon: app, href: R.path, mini: STATIC[app]?.mini, ...m.connector };
  } catch (_) { return STATIC[app] || fallback(app); }
}

export async function miniOf(app, answer, F = F0) {
  try {
    const c = await connectorOf(app, F);
    const m = c?.mini ? await c.mini(answer) : null;
    return m && typeof m === "object" && m.kind ? m : null;
  } catch (_) { return null; }
}

export async function openConnector(F, app) {
  const signal = F.signal, route = F.route;
  if (signal?.aborted) return null;
  F0 = F;
  const c = await connectorOf(app, F);
  // Imports can finish after leaving this screen or destroying its frame. A
  // return to the same address is a new route visit, with its own sheet owner.
  if (!c || signal?.aborted || F.signal !== signal || F.route !== route) return null;
  const ui = F.ui, rows = WORDS.filter(([k]) => typeof c.shares?.[k] === "string").map(([k, l]) => ui.el("div", { class: "ifl-provides-row", data: { word: k } }, ui.el("b", { text: l }), ui.el("span", { text: c.shares[k] })));
  const acts = [{ label: `Open ${c.name}`, primary: true, href: c.href, act: "open" }];
  const on = !!F.session?.apps?.[app];
  if (app === "weather") acts.push({ label: "Weather Settings", href: `${REGISTRY.weather.path}#settings`, act: "settings" }, { label: "Weather Notifications", href: "/#you=notify-weather", act: "notify" });
  // (stage 2 §2.4: Markets' notifications are You's; Fitness Settings is the module's sheet, so only while it's on)
  if (app === "markets") acts.push({ label: "Markets Notifications", href: "/#you=notify", act: "notify" });
  if (app === "fitness" && on) acts.push({ label: "Fitness Settings", href: `${REGISTRY.fitness.path}#settings`, act: "settings" });
  return F.sheet.open({
    sheet: "connector", app: app === "chats" ? "chat" : app, title: `${c.name}’s connector`,
    hero: { app: c.icon || app, name: `${c.name}’s connector`, line: app === "weather" || on ? "Its own module, under one roof" : "An app beside InFlite" },
    body: ui.el("div", { class: "ifl-connector" },
      ui.el("p", { class: "ifl-sub", text: `${c.name} keeps its own server and data. This is all it shares with InFlite:` }),
      ui.el("div", { class: "ifl-provides" }, rows)),
    acts,
  });
}

const PROV = { weather: ["places", "Places", 20], markets: ["markets", "Markets", 30], fitness: ["fitness", "Fitness", 40], mail: ["mail", "Mail", 50] };
export function connectorProvider(F, app) {
  F0 = F;
  const [id, group, order] = PROV[app] || [app, REGISTRY[app]?.name || app, 60];
  let c = null, dead = false;
  const ready = connectorOf(app, F).then((x) => { c = x; });
  const off = F.search.provide({
    id, group, order,
    search: async (q) => {
      await ready;
      if (dead || typeof c?.search !== "function") return [];
      return c.search(q, { userId: F.session?.view?.user?.id ?? null });
    },
  });
  return () => { dead = true; off(); };
}
export const placesProvider = (F) => connectorProvider(F, "weather");
export function chatsProvider(F, svc) {
  let list = { friends: [], groups: [] };
  const off = svc.on("*", ({ topic: t, data: v }) => { if (t === "friends" || t === "groups") list = { ...list, [t]: Array.isArray(v) ? v : [] }; });
  const here = () => F.route?.kind === "app" && F.route.app === "chats";
  const ok = (id) => typeof id === "string" && /^[\w-]{1,40}$/.test(id);
  const to = (title, sub, id) => ({ title, sub, avatar: title, href: `/chats/#open=${id}` });
  const qOf = (q) => String(q ?? "").trim().slice(0, 100);
  const offA = F.search.provide({ id: "people", group: "People", get order() { return here() ? 5 : 15; },
    search(q) {
      const t = qOf(q).toLowerCase();
      return t ? [...list.friends, ...list.groups].filter((x) => ok(x?.id) && !x.blocked && typeof x.name === "string" && match(t, x.name)).map((x) => to(x.name, "Chats", x.id)) : [];
    } });
  const offB = F.search.provide({ id: "messages", group: "Messages", get order() { return here() ? 6 : 16; },
    async search(q) {
      const t = qOf(q), r = t ? await svc.call("search", t) : [];
      return (Array.isArray(r) ? r : []).filter((x) => ok(x?.chatId)).map((x) => to(String(x.title ?? ""), String(x.sub ?? ""), x.chatId));
    } });
  return () => { offA(); offB(); off(); };
}
