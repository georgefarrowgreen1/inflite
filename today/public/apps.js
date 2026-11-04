// InFlite's Apps (spec §9.1; One roof §4.2): a screen of the one page at inflite.ai (/#apps). A tile for each app with
// its line from the day's answer (answer.apps: "14°, rain from 15:00", "Endurance 75 today", "Tesco +0.3%") and, where
// the app's connector has one, a live mini (Weather's temperature and the next hours' rain, Markets' percent and its
// shape: never an amount), opening the app (Weather in this page, /weather/; Fitness and Markets at /fitness/ and
// /markets/; and Mail, framed, at /mail/ for the account it's for), each with chips straight to a section; and a word
// under them. Chats isn't here: it's a tab of its own. Where the hub can't serve the apps yet (IFL.hub.degraded), each
// opens at its own address, as Today has always linked them.
//   drawApps(root, ctx: { answer, view, hub, href(app, section), ui (the framework's builders), connectors() → the
//   framework's connectors.js, frame: F (so Weather's connector is asked for only with hub and roof on) }) → nothing: the tiles drawn into root (#apps), their minis as each connector has them
const TILES = [
  { app: "weather", name: "Weather", what: "A forecast that explains itself", chips: [["Radar", "radar"], ["Warnings", "warnings"]] },
  { app: "fitness", name: "Fitness", what: "Your training, a day at a time", chips: [["Activities", "activities"], ["Progress", "progress"]] },
  { app: "markets", name: "Markets", what: "Your money, said simply", chips: [["Holdings", "holdings"], ["News", "news"]] },
  // (Mail's chips only while Mail's switch is on here, its lenses then the module's: s4/spec §2.5)
  { app: "mail", name: "Mail", what: "For you only", chips: [], only: (view) => view?.apps?.mail === true,
    on: [["People", "people"], ["Updates", "updates"], ["Later", "later"], ["Done", "done"]] },
];
// (whether a module's switch is on here: the frame's session, hub and apps, as the router reads them)
const switchedOn = (ctx, app) => { const s = ctx.frame?.session; return !!(s && s.hub === true && s.apps?.[app] === true); };

let drawn = 0;
export function drawApps(root, ctx = {}) {
  const ui = ctx.ui;
  if (!root || !ui) return;
  const n = ++drawn, answer = ctx.answer;
  const lines = answer?.v === 2 && answer.apps && typeof answer.apps === "object" ? answer.apps : {};
  const href = (app, section) => ctx.href?.(app, section) || `/${app}/${section ? "#" + section : ""}`;
  const shown = TILES.filter((t) => !t.only || t.only(ctx.view));
  // (every tile: its name with a line beneath, and on the right its mini's figure alone. Weather's line is its mini's
  // words, "Rain from 08:00", so the temperature isn't said twice; the others keep their own line, "All caught up")
  const lineOf = (t, m) => (m?.kind === "num-bars" && m.label ? m.label : typeof lines[t.app] === "string" && lines[t.app] ? lines[t.app] : t.what);
  const make = (t, mini = null, m = null) => ui.tile({
    app: t.app, name: t.name, line: lineOf(t, m), href: href(t.app), mini,
    chips: (t.on && switchedOn(ctx, t.app) ? t.on : t.chips).map(([text, s]) => ({ text, href: href(t.app, s) })),
  });
  const tiles = shown.map((t) => make(t));
  const grid = document.createElement("div");
  grid.className = "apps-grid";
  grid.append(...tiles.filter(Boolean));
  const note = document.createElement("p");
  note.className = "apps-note";
  note.textContent = "Their news reaches you on Today.";
  root.replaceChildren(grid, note);
  // (each tile's mini, once its connector says it: the tile drawn again with it, unless it's being used)
  if (!answer || typeof ctx.connectors !== "function") return;
  ctx.connectors().then((m) => Promise.all(shown.map(async (t, i) => {
    const mini = await Promise.resolve(m.miniOf(t.app, answer, ctx.frame)).catch(() => null);
    const was = tiles[i];
    if (!mini || n !== drawn || !was?.isConnected || was.contains(document.activeElement)) return;
    const node = ui.mini(mini), now = node && make(t, node, mini);
    if (now) { was.replaceWith(now); tiles[i] = now; }
  }))).catch(() => {});
}
