// What each app shares with InFlite (spec §3.12, §6.1, D5). Loaded lazily (Apps, You, search). B0's stub; FW writes it.
// Connector = { app, name, shares: { cards?, search?, notifications?, actions?, screens? } (only the words the app really
//   fills), sections: [[id, label]], aliases, files?, mini?(answer) → Mini | null, search?(q) → Entry[] }
// Mini = { kind: "num-bars", num, bars: [0..100 ×5], label } | { kind: "pct-spark", pct, spark? } | { kind: "num", num, label }
// STATIC: descriptors for the apps that aren't modules yet, keyed chats, fitness, markets, mail (Chats: cards,
//   notifications, screens; Fitness: cards, notifications, actions, screens; Markets: cards, notifications, screens;
//   Mail: notifications, screens), with sections, hrefs to their hub pages, and mini where Today's answer has the figure.
// connectorOf(app) → Promise<Connector>: Weather → its connector.js (only when hub && roof; else a static fallback
//   without search/mini); others → STATIC[app].
// miniOf(app, answer) → Promise<Mini | null>: the connector's mini(answer).
// openConnector(F, app): the connector sheet (§3.12).
// placesProvider(F) → off: the Places search provider from Weather's connector.search, plus "Weather Settings".
export const STUB = true;
export const STATIC = {};
export async function connectorOf(app) { return null; }
export async function miniOf(app, answer) { return null; }
export function openConnector(F, app) {}
export function placesProvider(F) { return () => {}; }
