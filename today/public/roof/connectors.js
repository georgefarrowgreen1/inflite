// What each app shares with InFlite (One roof, spec §3.12, §6.1, D5). Loaded lazily (Apps, You, search, the Places
// provider). Words say only what each app really does today; nothing promised of a later stage.
// Connector = { app, name, icon, href, shares: { cards?, search?, notifications?, actions?, screens? }, sections,
//   aliases, files?, mini?(answer) → Mini | null, search?(q) → Entry[] }
// Mini = { kind: "num-bars", num, bars, label } | { kind: "pct-spark", pct } (a percentage, never amounts: Today's Markets card
//   carries no intraday values yet, so no spark is drawn) | { kind: "num", num, label }
// STATIC: the apps that aren't modules yet (chats, fitness, markets, mail), with hrefs to their hub pages.
// connectorOf(app) → Promise<Connector>: Weather → its connector.js (only when hub && roof are on; else a static
//   fallback without search or mini); the others → STATIC[app].
// miniOf(app, answer, F?) → Promise<Mini | null>: the connector's mini(answer), null where it has none or it throws
//   (given F, Weather's connector file is asked for only while hub and roof are on).
// openConnector(F, app): the connector sheet (dialog.ifl-sheet[data-sheet=connector]): the app's icon, "<App>’s
//   connector", one line, a row per contract word the app fills, "Open <App>", and for Weather "Weather Settings" and
//   "Weather Notifications".
// placesProvider(F) → off: the Places search provider (Weather's connector.search over wx:places, on this device; it
//   adds "Weather Settings"), registered by the frame while hub and roof are on and Weather isn't mounted.
import { REGISTRY } from "./router.js";

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
      const c = a?.cards?.markets, p = Number(c?.pct);
      return c?.traded && Number.isFinite(p) ? { kind: "pct-spark", pct: p } : null;
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
const roofOn = (F) => { const s = F?.session; return !!(s?.hub && s?.roof); };
let F0 = null;
export async function connectorOf(app, F = F0) {
  if (STATIC[app]) return STATIC[app];
  if (app === "chat") return STATIC.chats;
  const R = REGISTRY[app];
  if (!R) return null;
  if (F && !roofOn(F)) return fallback(app);
  try {
    const m = await import(R.connector);
    return { icon: app, href: R.path, ...m.connector };
  } catch (_) { return fallback(app); }
}

export async function miniOf(app, answer, F = F0) {
  try {
    const c = await connectorOf(app, F);
    const m = c?.mini ? await c.mini(answer) : null;
    return m && typeof m === "object" && m.kind ? m : null;
  } catch (_) { return null; }
}

export async function openConnector(F, app) {
  F0 = F;
  const c = await connectorOf(app, F);
  if (!c) return null;
  const ui = F.ui, rows = WORDS.filter(([k]) => typeof c.shares?.[k] === "string").map(([k, l]) => ui.el("div", { class: "ifl-provides-row", data: { word: k } }, ui.el("b", { text: l }), ui.el("span", { text: c.shares[k] })));
  const acts = [{ label: `Open ${c.name}`, primary: true, href: c.href, act: "open" }];
  if (app === "weather") acts.push({ label: "Weather Settings", href: `${REGISTRY.weather.path}#settings`, act: "settings" }, { label: "Weather Notifications", href: "/#you=notify-weather", act: "notify" });
  return F.sheet.open({
    sheet: "connector", app: app === "chats" ? "chat" : app, title: `${c.name}’s connector`,
    hero: { app: c.icon || app, name: `${c.name}’s connector`, line: c.name === "Weather" ? "Its own module, under one roof" : "An app beside InFlite" },
    body: ui.el("div", { class: "ifl-connector" },
      ui.el("p", { class: "ifl-sub", text: `${c.name} keeps its own server and data. This is all it shares with InFlite:` }),
      ui.el("div", { class: "ifl-provides" }, rows)),
    acts,
  });
}

export function placesProvider(F) {
  F0 = F;
  let c = null, dead = false;
  const ready = connectorOf("weather", F).then((x) => { c = x; });
  const off = F.search.provide({
    id: "places", group: "Places", order: 20,
    search: async (q) => {
      await ready;
      if (dead || typeof c?.search !== "function") return [];
      return c.search(q);
    },
  });
  return () => { dead = true; off(); };
}
