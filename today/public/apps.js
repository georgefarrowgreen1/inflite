// InFlite's Apps (spec §9.1): a view of the one page at inflite.ai (/#apps). A tile for each app with its line from the
// day's answer (answer.apps: "14°, rain from 15:00", "Endurance 75 today", "Tesco +0.3%"), opening the app in this
// window (/weather/, /fitness/, /markets/, and Mail, framed, at /mail/ for the account it's for), each with chips
// straight to a section; and a word under them. Chats isn't here: it's a tab of its own. Where the hub can't serve the
// apps yet (IFL.hub.degraded), each opens at its own address, as Today has always linked them.
//   drawApps(root, ctx: { answer, view, hub, href(app, section), icon(app) }) → nothing: the tiles drawn into root (#apps)
import { esc, G } from "/cards.js";

// (each app's tile: its name, what it is when the day has no line for it, and its sections)
const TILES = [
  { app: "weather", name: "Weather", what: "A forecast that explains itself", chips: [["Radar", "radar"], ["Warnings", "warnings"]] },
  { app: "fitness", name: "Fitness", what: "Your training, a day at a time", chips: [["Today", "today"], ["Activities", "activities"], ["Progress", "progress"]] },
  { app: "markets", name: "Markets", what: "Your money, said simply", chips: [["Today", "today"], ["Holdings", "holdings"], ["News", "news"]] },
  { app: "mail", name: "Mail", what: "For you only", chips: [], only: (view) => view?.apps?.mail === true },
];

export function drawApps(root, ctx = {}) {
  if (!root) return;
  const lines = ctx.answer?.v === 2 && ctx.answer.apps && typeof ctx.answer.apps === "object" ? ctx.answer.apps : {};
  const href = (app, section) => ctx.href?.(app, section) || `/${app === "markets" ? "markets" : app}/${section ? "#" + section : ""}`;
  const icon = (app) => { try { return ctx.icon?.(app) || ""; } catch { return ""; } };
  const tiles = TILES.filter((t) => !t.only || t.only(ctx.view)).map((t) => {
    const line = typeof lines[t.app] === "string" && lines[t.app] ? lines[t.app] : t.what;
    const chips = t.chips.map(([label, s]) => `<a class="achip" href="${esc(href(t.app, s))}" aria-label="${esc(`${t.name}: ${label}`)}">${esc(label)}</a>`).join("");
    return `<article class="atile glass" data-app="${t.app}">
      <a class="atile-go" href="${esc(href(t.app))}"><img class="atile-ic" src="${esc(icon(t.app))}" alt="" width="52" height="52"><span class="atile-tx"><b>${esc(t.name)}</b><small>${esc(line)}</small></span><span class="chev">${G.chev}</span></a>
      ${chips ? `<nav class="achips" aria-label="${esc(t.name)}’s sections">${chips}</nav>` : ""}
    </article>`;
  }).join("");
  root.innerHTML = `<div class="apps-grid">${tiles}</div><p class="apps-note">Their news reaches you on Today. Any card can be sent to a friend.</p>`;
}
