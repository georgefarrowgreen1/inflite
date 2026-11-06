// Today's day, drawn (Today First, spec §7.3, §7.4, §7.7, §8.3): a version 2 answer of GET /api/today?v=2, phase by
// phase. The top card of the phase it is (the plan, the weather you'll ride in, the ride, your ride done, the day
// closed), Waiting for You (who and when from the server; what they said only from Chat's engine on this phone, faded in,
// and only beside a message the server named), Coming Up, The Rest of Today (the four cards, in Edit's order, put away
// before and during a ride); Undo, Take and Keep (/api/act/undo, /api/act); Open and Answer through the hub; Send on
// every card (IFL.hub.send). Everything through esc(), nothing in an inline style, and never a box to type in: Today is
// read, a tap, Undo, Open, Answer or Send, never a question.
//   drawDay(root, answer, ctx) → nothing: the day drawn into root (#today), its phase as root's data-phase; then, with
//     no request, each minute's passed rows taken away and, at each boundary, the next phase drawn from the answer's tops
//   phaseAt(answer, now) → the phase it is at now, from the answer's timeline
//   tickDay(root, answer, now) → nothing: passed Coming Up rows dropped, and at the answer's until, the next phase
//   mergeWaiting(rows, said) → the server's Waiting rows, each with the engine's words only where they may go beside it
//   dayLine(answer, now, phase?) → { text, html }: the header's line for the phase ("16:05 · your ride")
//   comingAt(upcoming, now, phase, { dawn, tz }?) → the Coming Up rows still to come at now (in the evening, tonight's and
//     tomorrow's first), and a ride not in yet (late: true) though its time has passed
//   stopDay(root) → nothing: nothing more timed or drawn here for root (the page has taken it back). The same happens by
//     itself once the page takes root's data-phase off (drawing its own four cards there, or signed out)
// ctx (all but now may be left out; the page hands in what it has):
//   now      the time (a number), or a function giving it (the page's clock, never before the answer's own moment)
//   hub      IFL.hub, where the page has none on window (window.IFL.hub first: the same one, which the hub sets for
//            Chat's engine, §8.2); with neither, off the hub: every link to the app's own address
//   links    the account's links (chat, weather, fitness, finance, email): the apps' own addresses, off the hub
//   prefs    { order, hidden }: Edit's order and hidden cards, for The Rest of Today (where root has none of the page's
//            own cards already)
//   call(path, { method, body })   the page's request helper (else one here: same origin, X-Inflite on a write)
//   toast(text)    the page's word after doing something (else one here)
//   refresh()      ask for the day again, after Undo, Take or Keep. A page that hands it in asks again itself after an
//                  answer that says planning (§7.7); without it, the day's fetched here and drawn: after an act, and once
//                  5 s after a planning answer
//   line(text)     the header's line for the phase ("16:05 · your ride"), or null: the page's own (the morning's date)
//                  (without it, written into #hd .ifh-line)
//   sheet(spec)    the page's InFlite sheet (F.sheet.open), for Mail's trip, bookings, parcels and bills (trip.js,
//                  mailday.js); without it a row from Mail goes to its email, and the trip card opens nothing
//   timers   false: nothing is timed here, the page calls tickDay itself (each minute, and at until). Otherwise the next
//            boundary is drawn at its minute from here too (the page's own minute may come up to 59 s late); tickDay
//            twice is as once
import { CARD_KEYS, APP, esc, safe, safeOrigin, hm, dayKey, dateLong, dateShort, wkShort, dayWord, G, av, cardHTML, applyVars, tick, sendButton, hubOf, onHub } from "/cards.js";
import { tripOf, tripCardHtml, bookingRowParts, bookingOfRow, openTrip, openBooking, isGone, redrawTrip } from "/trip.js";
import { owedOf, paidOf, moneyOf, owedRowHtml, paidHtml, parcelOfRow, parcelRowHtml, openItem, openBills, itemOfRow } from "/mailday.js";

const MIN = 60e3;
const PHASES = ["morning", "midday", "preride", "riding", "after", "evening"];
// what each phase shows below its top card (§7.3: nothing beside the ride; after it, what's coming; in the evening,
// tomorrow's first thing)
const BELOW = {
  morning: ["waiting", "coming", "rest"], midday: ["waiting", "coming", "rest"], preride: [], riding: [],
  after: ["coming", "rest"], evening: ["coming", "rest"],
};
// (a ride's phase with no top card of its own: the day's second ride (the answer's tops have the first ride's, and the
// next answer the second's), or one the server left out. Then what's coming (the ride's row among it) and the rest of the
// day, as after a ride, rather than a page with nothing on it)
const RIDE = ["preride", "riding"], NO_TOP = ["coming", "rest"];
// (Mail's trip, the admin's alone (trip.js), shows wherever Coming Up does, above Waiting for You)
const SECTIONS = ["top", "trip", "waiting", "coming", "rest"];
const LABELS = { waiting: "Waiting for You", coming: "Coming Up", rest: "The Rest of Today" };
const LINE = { midday: "what’s next", preride: "your ride", riding: "riding", after: "ride done", evening: "closed" };
const KINDS = ["plan", "weather", "ride", "done", "closed"];
const TONES = ["up", "down", "warn", "good"];
const ID = /^[\w-]{8,64}$/, PACKED = /^[A-Za-z0-9_-]{1,6000}$/;
// (a hub path of each app's, and the account's link that's the app's own address)
const APP_PATHS = [["/chats/", "chat"], ["/weather/", "weather"], ["/fitness/", "fitness"], ["/markets/", "finance"], ["/mail/", "email"]];

const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const str = (v) => (typeof v === "string" ? v : "");
const list = (v) => (Array.isArray(v) ? v.filter((x) => x && typeof x === "object") : []);
const texts = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === "string" && x.trim()) : []);

// ---------------------------------------------------------------- the phase, from the answer alone
export function phaseAt(answer, now) {
  if (!answer || typeof answer !== "object") return undefined;
  let phase = PHASES.includes(answer.phase) ? answer.phase : undefined;
  if (num(now) == null) return phase;
  const line = list(answer.timeline).filter((x) => PHASES.includes(x.phase) && num(x.at) != null).sort((a, b) => a.at - b.at);
  for (const x of line) {
    if (x.at > now) break;
    phase = x.phase;
  }
  return phase;
}

// ---------------------------------------------------------------- what they said, beside who
// The server names who's waiting (ids, first names, the time of their newest message, never words); Chat's engine on
// this phone says what (decrypted there, never sent anywhere). Words go beside a row only for an id the server named,
// and only when the engine's newest message is at least as new as the server's: a stale engine never puts old words
// beside a new message.
export function mergeWaiting(rows, said) {
  const best = new Map();
  for (const s of list(said)) {
    if (typeof s.id !== "string" || num(s.at) == null || typeof s.said !== "string" || !s.said.trim()) continue;
    const was = best.get(s.id);
    if (!was || s.at > was.at) best.set(s.id, s);
  }
  return list(rows).map((r) => {
    const s = best.get(r.id);
    if (!s || num(r.at) == null || s.at < r.at) return { ...r };
    return { ...r, said: s.said, kind: typeof s.kind === "string" ? s.kind : "message", topics: Array.isArray(s.topics) ? s.topics : [] };
  });
}
// (what the engine said, kept in memory only for as long as the page is open, for the server's same message: so a
// redraw every few minutes asks Chat nothing new. Where it had nothing as new yet, it's asked again two minutes on)
const heard = new Map();
const heardFor = (r) => { const h = heard.get(r.id); return h && h.serverAt === r.at && (h.said || Date.now() - h.tried < 2 * MIN) ? h : null; };
const wroteHeard = new Map();
// (Chats locked by its app lock, stage 3 S3-D14: every word heard let go of, so none is drawn again until it's unlocked
// and asked afresh)
export function forgetHeard() { heard.clear(); wroteHeard.clear(); }

// ---------------------------------------------------------------- the header's line
export function dayLine(answer, now, phase = phaseAt(answer, now)) {
  const tz = str(answer?.tz) || undefined, t = num(now) ?? Date.now();
  if (LINE[phase]) {
    const text = `${hm(t, tz)} · ${LINE[phase]}`;
    return { text, html: esc(text) };
  }
  const w = answer?.cards?.weather, place = w?.state === "ok" && typeof w.place?.name === "string" && w.place.name ? w.place.name : "";
  return { text: `${dateLong(t, tz)}${place ? ` · ${place}` : ""}`, html: `<span class="d-long">${esc(dateLong(t, tz))}</span><span class="d-short">${esc(dateShort(t, tz))}</span>${place ? ` · ${esc(place)}` : ""}` };
}

// ---------------------------------------------------------------- where things go
// (the page's sections in root, made where the page has none: then whatever root held already (the page's own four
// cards, in Edit's order) is kept as The Rest of Today)
function sections(root) {
  const out = {};
  let made = false;
  for (const k of SECTIONS) {
    let el = root.querySelector(`#${k}`);
    if (!el) {
      el = document.createElement("section");
      el.id = k;
      el.className = "day-sec";
      made = true;
    }
    out[k] = el;
  }
  if (made) {
    const kept = [...root.children].filter((c) => !SECTIONS.includes(c.id));
    for (const k of SECTIONS) if (out[k].parentNode !== root) root.append(out[k]);
    if (kept.length && !out.rest.dataset.kept) {
      out.rest.dataset.kept = "1";
      out.rest.replaceChildren(restLabel(), ...kept);
    }
  }
  return out;
}
function restLabel() {
  const h = document.createElement("h2");
  h.className = "slabel";
  h.textContent = LABELS.rest;
  return h;
}
function ensureCss() {
  if (typeof document === "undefined" || document.querySelector('link[rel="stylesheet"][href="/day.css"]')) return;
  const l = document.createElement("link");
  l.rel = "stylesheet";
  l.href = "/day.css";
  document.head?.append(l);
}
const DEFAULT_LINKS = () => {
  const live = /(^|\.)inflite\.ai$/.test(location.hostname);
  const at = (n) => (live ? `https://${n}.inflite.ai` : `${location.protocol}//${n}.${location.hostname}${location.port ? ":" + location.port : ""}`);
  return { chat: at("chat"), weather: at("weather"), fitness: at("fitness"), finance: at("finance"), email: at("email") };
};
const linksOf = (ctx) => (ctx?.links && typeof ctx.links === "object" && typeof ctx.links.chat === "string" ? ctx.links : DEFAULT_LINKS());
// an address for a button or a row: at the hub, the hub's path (IFL.hub.go); off it (or with the hub not ready), a hub
// path goes to the app's own address, as Today has always linked; and checked either way
function linkTo(h, ctx) {
  if (typeof h !== "string" || !h) return null;
  if (onHub(ctx)) {
    try { return safe(hubOf(ctx).go(h)); } catch { return null; }
  }
  if (/^\/(?!\/)/.test(h)) {
    for (const [path, key] of APP_PATHS) {
      if (!h.startsWith(path) && h !== path.slice(0, -1)) continue;
      const base = safeOrigin(linksOf(ctx)[key]) || safeOrigin(DEFAULT_LINKS()[key]);
      return base && safe(h) ? safe(`${base.replace(/\/+$/, "")}/${h.slice(path.length)}`) : null;
    }
  }
  return safe(h);
}

// ---------------------------------------------------------------- the time
// (the page's clock: a function, a moment that's moved on since it was drawn, or this device's)
function nowOf(st) {
  const n = st?.ctx?.now;
  if (typeof n === "function") {
    const v = n();
    if (num(v) != null) return v;
  }
  if (num(n) != null) return n + (Date.now() - st.base);
  return Date.now();
}

// ---------------------------------------------------------------- the top card
// (the acts of this answer, as the server said them and as they've been taken, kept or undone here since: until an
// answer newer than the one they were done on, which says how they stand itself)
const acted = new Map();
const actOf = (st, id) => {
  const a = list(st.answer.acts).find((x) => x.id === id), o = acted.get(id);
  const now = o && !(num(st.answer.at) != null && num(o.at) != null && st.answer.at > o.at) ? o.state : null;
  return a ? { ...a, ...(now ? { state: now } : {}) } : now ? { id, state: now } : null;
};
// (Undo while the act stands and its time to undo hasn't gone; Take on an offer; Keep on an added ride not kept yet. An
// act the answer doesn't list is the server's word alone, shown as it came, until it's answered)
function actShows(what, act, now) {
  if (!act) return true;
  if (what === "undo") return ["done", "taken", "kept"].includes(act.state) && !(num(act.undoUntil) != null && now >= act.undoUntil);
  if (what === "take") return act.state === "offered";
  if (what === "keep") return act.state === "done";
  return false;
}
let actsOff = false;
function buttonHtml(b, t, st, now) {
  const label = str(b.label).trim();
  if (!label) return "";
  const ctx = st.ctx;
  if (b.do === "undo" || b.do === "take" || b.do === "keep") {
    if (actsOff || !ID.test(str(b.id)) || !actShows(b.do, actOf(st, b.id), now)) return "";
    return `<button class="pill${b.do === "undo" ? "" : " primary"}" type="button" data-do="${b.do}" data-id="${esc(b.id)}">${b.do === "undo" ? G.again : b.do === "keep" ? G.check : ""}${esc(label)}</button>`;
  }
  if (b.do === "open") {
    const h = linkTo(b.href, ctx);
    return h ? `<a class="pill" href="${esc(h)}" data-do="open">${esc(label)}${G.open}</a>` : "";
  }
  if (b.do === "answer") {
    const id = ID.test(str(b.id)) ? b.id : null, h = linkTo(str(b.href) || (id ? `/chats/#open=${id}` : ""), ctx);
    return h ? `<a class="pill primary" href="${esc(h)}" data-do="answer">${esc(label)}</a>` : "";
  }
  if (b.do === "sendto") {
    const to = [b.to, b.id, t.sendTo?.id].find((x) => ID.test(str(x)));
    if (!to || !str(t.share)) return "";
    if (!onHub(ctx)) return sendButton(t, { ...ctx, links: linksOf(ctx) }, { label, glyph: G.bird });
    return `<button class="pill" type="button" data-do="sendto" data-to="${esc(to)}">${G.bird}${esc(label)}</button>`;
  }
  return "";
}
// (a line of the top card as a row: the app it's about by its icon, and its words without the app's name in front)
const MOON = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></svg>';
function lineRow(l) {
  let app = "", words = l;
  const m = /^(Markets|Fitness|Weather|Chat|Mail):\s*/i.exec(l);
  if (m) { app = m[1].toLowerCase(); words = l.slice(m[0].length); }
  else if (/waiting for an answer|wrote to you|sent you/i.test(l)) app = "chat";
  else if (/^tomorrow|rain|drizzle|showers|sunny|cloud|breezy|wind|frost|snow/i.test(l)) app = "weather";
  words = words.charAt(0).toUpperCase() + words.slice(1);
  const ic = APP[app] ? `<img class="dt-ic" src="${APP[app].icon}" alt="">` : `<span class="dt-ic dt-ic-x">${/^quiet hours/i.test(l) ? MOON : G.clock}</span>`;
  return `<li>${ic}<span>${esc(words)}</span></li>`;
}
// (the digits of a figure, to tell a stat that only says the title again: "−0.2%" beside "Down 0.2%")
const digitsOf = (x) => (String(x).match(/\d+(?:[.,]\d+)?/g) || []).join(" ");
function topHtml(t, phase, st, now) {
  const kind = KINDS.includes(t.kind) ? t.kind : "plan", lines = texts(t.lines);
  const said = digitsOf(t.title);
  const stats = list(t.stats).filter((s) => str(s.label) && (typeof s.value === "string" || num(s.value) != null)).filter((s) => !said || digitsOf(s.value) !== said);
  const wrote = list(t.wrote).filter((w) => ID.test(str(w.id)) && str(w.first));
  // (no Open or Send here: the rows say where each thing is, and each app has its own)
  const buttons = list(t.buttons).filter((b) => b.do !== "open" && b.do !== "sendto").map((b) => buttonHtml(b, t, st, now)).filter(Boolean);
  return `<article class="tcard glass day-top" data-kind="${kind}" data-phase="${esc(phase)}" aria-labelledby="dt-h">
    ${str(t.chip) ? `<span class="dt-chip">${kind === "done" ? G.check : kind === "ride" ? G.ride : ""}${esc(t.chip)}</span>` : ""}
    <h2 class="tc-h dt-h" id="dt-h" tabindex="-1">${esc(t.title)}</h2>
    ${stats.length ? `<dl class="dt-stats">${stats.map((s) => `<div${TONES.includes(s.tone) ? ` class="dt-${s.tone}"` : ""}><dt>${esc(s.label)}</dt><dd>${esc(s.value)}</dd></div>`).join("")}</dl>` : ""}
    ${lines.length ? `<ul class="dt-rows">${lines.map(lineRow).join("")}</ul>` : ""}
    ${wrote.length ? `<div class="dt-wrote">${wrote.map((w) => `<p class="dt-said" data-wid="${esc(w.id)}" data-first="${esc(w.first)}" data-since="${num(w.at) ?? 0}" hidden></p>`).join("")}</div>` : ""}
    ${buttons.length ? `<div class="tc-foot">${buttons.join("")}</div>` : ""}
  </article>`;
}

// ---------------------------------------------------------------- Waiting for You
const holdingsOf = (answer) => list(answer?.cards?.markets?.holdings).filter((h) => str(h.sym) && str(h.name) && PACKED.test(str(h.sendCard)));
// (the topics the engine found in what they said, as your own holdings' cards to send them: Tesco's, if they asked
// about Tesco. Percent only, as every Markets card)
function chipsFor(topics, holdings) {
  const out = [];
  for (const tp of Array.isArray(topics) ? topics : []) {
    const k = String(typeof tp === "string" ? tp : tp && typeof tp === "object" ? tp.sym || tp.name || "" : "").toLowerCase();
    if (!k) continue;
    const h = holdings.find((x) => x.sym.toLowerCase() === k || x.name.toLowerCase() === k || x.sym.toLowerCase().split(".")[0] === k);
    if (h && !out.includes(h)) out.push(h);
  }
  return out.slice(0, 3);
}
const pctSaid = (p) => (num(p) == null ? "" : ` ${p >= 0 ? "+" : "−"}${Math.abs(p).toLocaleString("en-GB", { maximumFractionDigits: 2 })}%`);
function waitingRows(answer) {
  return list(answer.waiting).filter((r) => ID.test(str(r.id)) && str(r.first) && num(r.at) != null);
}
// (Waiting for You: who's waiting, then Mail's (Mail on Your Day, stage 2: a bill to pay, a renewal, a trial ending, a
// return's last day, mailday.js), then the quiet line of what paid itself this week)
function waitingHtml(rows, st, now, owed = [], paid = null) {
  const tz = str(st.answer.tz) || undefined, link = (h) => linkTo(h, st.ctx);
  const mail = owed.map((r) => owedRowHtml(r, link)).join("") + (paid ? paidHtml(paid, !!moneyOf(st.answer) && typeof st.ctx.sheet === "function") : "");
  return `<h2 class="slabel">${LABELS.waiting}</h2><div class="group glass">${rows.map((r) => {
    const g = r.group && typeof r.group === "object" && ID.test(str(r.group.id)) && str(r.group.name) ? r.group : null;
    const who = g ? `${r.first} in ${g.name}` : r.first, n = num(r.n) || 1;
    const h = linkTo(`/chats/#open=${g ? g.id : r.id}`, st.ctx);
    const when = `${n > 1 ? `${n} messages, the last` : "Wrote"} ${dayWord(Math.min(r.at, now), now, tz)}at ${hm(r.at, tz)}`;
    const inner = `${av(g ? { id: g.id, first: g.name } : { id: r.id, first: r.first })}<span class="tx"><b>${esc(who)}</b><small>${esc(when)}</small><span class="dw-words" hidden></span></span>`;
    // (with no address to answer at, the row's there to read, not a link to nowhere)
    return `<div class="dw-row" data-wid="${esc(r.id)}" data-at="${r.at}">
      ${h ? `<a class="row dw-main" href="${esc(h)}" data-do="answer">${inner}<span class="chev">${G.chev}</span></a>` : `<div class="row dw-main">${inner}</div>`}
      <div class="dw-chips" hidden></div>
    </div>`;
  }).join("")}${mail}</div>`;
}
// the engine's words, put beside the rows it may go beside (faded in), with the cards they asked about to send back
function fillWaiting(root, st, merged) {
  const holdings = holdingsOf(st.answer);
  for (const r of merged) {
    const row = [...root.querySelectorAll("#waiting .dw-row")].find((x) => x.dataset.wid === r.id);
    if (!row || Number(row.dataset.at) !== r.at) continue;
    const words = row.querySelector(".dw-words"), chips = row.querySelector(".dw-chips");
    if (!r.said) { words.hidden = true; words.textContent = ""; chips.hidden = true; chips.replaceChildren(); continue; }
    words.textContent = `“${r.said}”`;
    words.hidden = false;
    words.classList.add("in");
    const cs = chipsFor(r.topics, holdings);
    chips.innerHTML = cs.map((h) => sendButton({ share: `${h.name}${pctSaid(h.pct)} today.`, sendCard: h.sendCard }, { ...st.ctx, links: linksOf(st.ctx) },
      { label: h.name, glyph: G.bird, to: r.id, cls: "dw-chip", aria: `Send ${h.name}’s card to ${r.first}` })).join("");
    chips.hidden = !cs.length;
  }
}
function listen(root, st, rows) {
  const hub = hubOf(st.ctx);
  if (!onHub(st.ctx) || typeof hub.chat !== "function") return;
  const named = rows.slice(0, 6);
  // (words already heard for these same messages: drawn again at once, with nothing asked)
  const known = mergeWaiting(named, named.map(heardFor).filter((h) => h && h.said));
  fillWaiting(root, st, known.filter((r) => r.said));
  const ask = named.filter((r) => !heardFor(r));
  const wrote = st.wrote;
  if (!ask.length && !wrote.length) return;
  whenIdle(root, st, () => hear(root, st, hub, ask, wrote));
}
// (Chat's engine is the whole of Chat in a frame (its store, a sync, the decrypting): so it's asked at idle once the day's
// drawn, never in the same moment as Today's first paint (§8.2), and only while the page is in sight. A day drawn out of
// sight (a phase's minute come while the phone's locked) waits until it's seen; the words already heard are drawn at once)
const IDLE_WAIT = 2000;
function whenIdle(root, st, fn) {
  if (st.hearing) return;
  st.hearing = true;
  const go = () => { st.hearing = false; if (live.get(root) === st) fn(); };
  const idle = () => {
    if (typeof requestIdleCallback === "function") return requestIdleCallback(go, { timeout: IDLE_WAIT });
    setTimeout(go, IDLE_WAIT / 2)?.unref?.();
  };
  if (typeof document !== "undefined" && document.visibilityState === "hidden" && typeof document.addEventListener === "function") {
    const seen = () => { if (document.visibilityState === "hidden") return; st.off?.(); if (live.get(root) === st) idle(); else st.hearing = false; };
    document.addEventListener("visibilitychange", seen);
    st.off = () => { st.off = null; document.removeEventListener?.("visibilitychange", seen); };
    return;
  }
  idle();
}
function hear(root, st, hub, ask, wrote) {
  Promise.resolve(hub.chat()).then(async (c) => {
    if (!c || (c.state && c.state !== "ready")) return;
    if (ask.length && typeof c.waiting === "function") {
      const said = await c.waiting({ ids: ask.map((r) => r.id), stocks: holdingsOf(st.answer).map((h) => ({ sym: h.sym, name: h.name })) });
      const merged = mergeWaiting(ask, said);
      const at = new Map(list(said).filter((x) => typeof x.id === "string").map((x) => [x.id, x.at]));
      for (const r of merged) heard.set(r.id, { id: r.id, serverAt: r.at, at: r.said ? at.get(r.id) : -1, said: r.said || "", kind: r.kind, topics: r.topics, tried: Date.now() });
      if (live.get(root) === st) fillWaiting(root, st, merged);
    }
    if (wrote.length && typeof c.since === "function") await sinceAll(root, st, c);
  }).catch(() => {});
}
// (the after card's "wrote while you rode": what each said since the ride began, the same way, the same rule)
async function sinceAll(root, st, c) {
  const from = num(st.answer.ride?.start);
  if (from == null) return;
  for (const w of st.wrote) {
    const key = `${w.id}|${from}|${w.at}`;
    let got = wroteHeard.get(key);
    if (!got) {
      const r = await c.since(w.id, from);
      got = r && typeof r.said === "string" && r.said.trim() && num(r.at) != null && r.at >= w.at ? { said: r.said } : { said: "" };
      wroteHeard.set(key, got);
    }
    if (live.get(root) !== st || !got.said) continue;
    const p = [...root.querySelectorAll("#top .dt-said")].find((x) => x.dataset.wid === w.id);
    if (!p) continue;
    p.textContent = `${w.first}: “${got.said}”`;
    p.hidden = false;
    p.classList.add("in");
  }
}

// ---------------------------------------------------------------- Coming Up
// (still to come at now, soonest first, with a ride not in yet (late: true, at its start, §7.6) kept though its time has
// passed, for the rest of its day where the answer is. In the evening, what's left of tonight (a call at 20:00, a pigeon landing) and
// tomorrow's first thing (§7.3), and nothing after it: tomorrow starts at dawn, the next morning in the answer's
// timeline, or without one at midnight where the answer's tz is)
export function comingAt(upcoming, now, phase, { dawn = null, tz } = {}) {
  const late = (r) => r.late === true && (tz ? dayKey(r.at, tz) === dayKey(now, tz) : now < r.at + 86400000);
  // (a parcel's row stays until its window's end, until, though its at (the window's start) has come)
  const rows = list(upcoming).filter((r) => num(r.at) != null && (r.at > now || (num(r.until) != null && r.until > now) || late(r)) && str(r.title)).sort((a, b) => a.at - b.at);
  if (phase !== "evening") return rows;
  const at = num(dawn), first = rows.findIndex(at != null ? (r) => r.at >= at : (r) => dayKey(r.at, tz) !== dayKey(now, tz));
  return first < 0 ? rows : rows.slice(0, first + 1);
}
// (the next morning's start in the answer's timeline, after now)
const dawnAfter = (answer, now) => list(answer.timeline).filter((x) => x.phase === "morning" && num(x.at) != null && x.at > now).sort((a, b) => a.at - b.at)[0]?.at ?? null;
// (when the tick takes a row away: at its time, but a ride not in yet (late: its at, the ride's start, has passed) stays
// until the next morning, or a day on without a timeline; a new answer replaces it sooner, once the ride's in)
const dueOf = (r, answer, now) => r.late === true ? dawnAfter(answer, now) ?? r.at + 86400000 : num(r.until) ?? r.at;
function comingHtml(rows, st, now) {
  const tz = str(st.answer.tz) || undefined, ctx = { ...st.ctx, links: linksOf(st.ctx) };
  return `<h2 class="slabel">${LABELS.coming}</h2><div class="group glass">${rows.map((r) => {
    if (r.app === "mail") return mailRowHtml(r, st, now, tz);
    const app = APP[r.app === "markets" || r.app === "chat" || r.app === "weather" || r.app === "fitness" ? r.app : ""];
    const h = linkTo(r.href, st.ctx), other = dayKey(r.at, tz) !== dayKey(now, tz);
    const send = "";
    const inner = `<span class="dc-tm">${esc(hm(r.at, tz))}${other ? `<small>${esc(wkShort(r.at, tz))}</small>` : ""}</span>${app ? `<img class="dc-ic" src="${app.icon}" alt="">` : `<span class="dc-ic"></span>`}<span class="tx"><b>${esc(r.title)}</b>${str(r.sub) ? `<small>${esc(r.sub)}</small>` : ""}</span>`;
    return `<div class="dc-row" data-due="${dueOf(r, st.answer, now)}"${send ? " data-sends" : ""}>
      ${h ? `<a class="row dc-main" href="${esc(h)}">${inner}</a>` : `<div class="row dc-main">${inner}</div>`}${send}
    </div>`;
  }).join("")}</div>`;
}

// (a booking or a parcel from Mail (Mail on Your Day, trip.js, mailday.js): Mail's teal icon with its envelope, what it
// is, and the number that matters on the right (the time, or a parcel's window) with its day under it; a parcel with its
// four-part bar. A tap opens its sheet; a link to its email where there's no sheet. One hidden here isn't drawn)
function mailRowHtml(r, st, now, tz) {
  const p = parcelOfRow(r);
  if (p) return `<div class="dc-row dc-mail dc-parcel" data-due="${dueOf(r, st.answer, now)}">${parcelRowHtml(p, (h) => linkTo(h, st.ctx))}</div>`;
  const b = bookingOfRow(r);
  if (!b) return "";
  const h = linkTo(r.href, st.ctx), parts = bookingRowParts(b);
  const d = dayKey(r.at, tz), when = d === dayKey(now, tz) ? "today" : d === dayKey(now + 86400000, tz) ? "tomorrow" : wkShort(r.at, tz);
  const inner = `<span class="dc-tm" aria-hidden="true"></span>${parts.glyph}<span class="tx"><b>${esc(r.title)}</b>${str(r.sub) ? `<small>${esc(r.sub)}</small>` : ""}</span><span class="ml-amt"><b>${esc(hm(r.at, tz))}</b><small>${esc(when)}</small></span>`;
  const attrs = `data-do="booking" data-bid="${esc(b.id)}" aria-haspopup="dialog"`;
  return `<div class="dc-row dc-mail" data-due="${dueOf(r, st.answer, now)}">
      ${h ? `<a class="row dc-main" href="${esc(h)}" ${attrs}>${inner}</a>` : `<button type="button" class="row dc-main" ${attrs}>${inner}</button>`}
    </div>`;
}
// (the rows of Mail's bookings and parcels hidden here, left out)
const shownRows = (rows) => rows.filter((r) => r.app !== "mail" || !isGone(str(r.parcel) || str(r.booking)));
// (what trip.js's sheets are given: the page's sheet, toast and requests, links as this page makes them, and the day
// drawn again after a Hide or its Undo)
function tripHelp(root, st) {
  return {
    sheet: typeof st.ctx.sheet === "function" ? st.ctx.sheet : null,
    link: (h) => linkTo(h, st.ctx),
    go: (h) => { if (onHub(st.ctx)) hubOf(st.ctx).go(h); },
    toast: (text, o) => toast(st.ctx, text, o),
    call: (path, o) => call(st.ctx, path, o),
    redraw: () => { const now = live.get(root); if (now && root.isConnected) paint(root, now, now.phase, nowOf(now)); redrawTrip(); },
    trip: () => tripOf(live.get(root)?.answer || st.answer),
    money: () => moneyOf(live.get(root)?.answer || st.answer),
    tz: str(st.answer.tz) || undefined,
    now: () => nowOf(st),
  };
}

// ---------------------------------------------------------------- drawing
const live = new WeakMap();
// (the page has taken root back since the day was drawn: its own four cards drawn there (an answer without v, a copy it
// kept), or signed out, either way root's phase taken off. Then nothing more is timed, drawn or said in the header from
// here: a day forgotten stays forgotten (§11.5))
const taken = (root, st) => root.dataset.phase !== (st.phase || "");
export function stopDay(root) {
  const st = root ? live.get(root) : null;
  if (!st) return;
  clearTimeout(st.timer);
  st.timer = 0;
  st.off?.();
  live.delete(root);
}
// (answers already asked again for, while planning: once more each, then as usual)
let askedAt = -Infinity;
// (the focus kept where it was as the day's drawn again: the same button or row, else the top card's title)
function focusKey(root) {
  const f = typeof document !== "undefined" ? document.activeElement : null;
  if (!f || f === root || !root.contains?.(f)) return null;
  const sec = f.closest?.("#top, #trip, #waiting, #coming, #rest");
  if (!sec || sec.id === "rest") return null;
  const at = (k) => (f.getAttribute(k) != null ? `[${k}="${CSS.escape(f.getAttribute(k))}"]` : "");
  return { sec: sec.id, sel: `${f.tagName.toLowerCase()}${at("data-do")}${at("data-id")}${at("data-to")}${at("data-share")}${at("href")}` };
}
function refocus(root, key) {
  if (!key) return;
  const again = root.querySelector(`#${key.sec} ${key.sel}`) || root.querySelector("#dt-h");
  again?.focus?.({ preventScroll: true });
}
function paint(root, st, phase, now) {
  const key = focusKey(root);
  try { draw(root, st, phase, now); } finally { refocus(root, key); }
}
function draw(root, st, phase, now) {
  const a = st.answer, s = sections(root);
  st.phase = phase;
  root.dataset.phase = phase || "";
  const top = drawTop(root, st, phase, now, s);
  const shows = !top && RIDE.includes(phase) ? NO_TOP : BELOW[phase] || BELOW.midday;
  const w = shows.includes("waiting") ? waitingRows(a) : [];
  const owed = shows.includes("waiting") ? owedOf(a) : [], paid = shows.includes("waiting") ? paidOf(a) : null;
  s.waiting.innerHTML = w.length || owed.length || paid ? waitingHtml(w, st, now, owed, paid) : "";
  s.waiting.hidden = !(w.length || owed.length || paid);
  const rows = shows.includes("coming") ? shownRows(comingAt(a.upcoming, now, phase, { dawn: dawnAfter(a, now), tz: str(a.tz) || undefined })) : [];
  s.coming.innerHTML = rows.length ? comingHtml(rows, st, now) : "";
  s.coming.hidden = !rows.length;
  // (Mail's trip, wherever Coming Up shows: above Waiting for You)
  const trip = shows.includes("coming") ? tripOf(a) : null;
  s.trip.innerHTML = trip ? tripCardHtml(trip, { now, tz: str(a.tz) || undefined }) : "";
  s.trip.hidden = !trip;
  if (!s.rest.dataset.kept) {
    const prefs = st.ctx.prefs && typeof st.ctx.prefs === "object" ? st.ctx.prefs : {};
    const order = (Array.isArray(prefs.order) ? prefs.order : CARD_KEYS).filter((k) => CARD_KEYS.includes(k));
    const hidden = Array.isArray(prefs.hidden) ? prefs.hidden : [];
    const cards = a.cards && typeof a.cards === "object" ? a.cards : {};
    const shown = order.filter((k) => !hidden.includes(k) && cards[k]);
    s.rest.innerHTML = shown.length ? `<h2 class="slabel">${LABELS.rest}</h2>${shown.map((k) => cardHTML(k, cards[k], { links: linksOf(st.ctx), tz: str(a.tz) || undefined, now, hub: hubOf(st.ctx) })).join("")}` : "";
    applyVars(s.rest);
  }
  s.rest.hidden = !shows.includes("rest") || !s.rest.children.length;
  writeLine(st, phase, now);
  listen(root, st, w);
}
// (the answer's top for the phase it is: the first time the phase comes in its timeline, never a later return to it (the
// clock's phase again after a ride's cap), which needs what's happened since, so the page's next answer draws it)
function topFor(answer, phase, now) {
  const t = answer.tops && typeof answer.tops === "object" ? answer.tops[phase] : null;
  if (!t || typeof t !== "object" || !str(t.title)) return null;
  const line = list(answer.timeline).filter((x) => PHASES.includes(x.phase) && num(x.at) != null).sort((a, b) => a.at - b.at);
  const at = line.findLastIndex((x) => x.at <= now);
  return at > 0 && line.slice(0, at).some((x) => x.phase === phase) ? null : t;
}
// (a top card that says only what the Weather card below says, the weather and its figures, with nothing next, no one
// who wrote and nothing to do: left out while that Weather card is on the page, so nothing's said twice)
function onlyWeather(t, a, st) {
  if (t.kind !== "weather" || texts(t.lines).length || list(t.wrote).length || list(t.buttons).some((b) => b.do !== "open" && b.do !== "sendto")) return false;
  const prefs = st.ctx.prefs && typeof st.ctx.prefs === "object" ? st.ctx.prefs : {};
  const hidden = Array.isArray(prefs.hidden) ? prefs.hidden : [];
  return a.cards?.weather?.state === "ok" && !hidden.includes("weather");
}
function drawTop(root, st, phase, now, s = sections(root)) {
  let top = topFor(st.answer, phase, now);
  if (top && onlyWeather(top, st.answer, st)) top = null;
  st.wrote = top ? list(top.wrote).filter((w) => ID.test(str(w.id)) && str(w.first) && num(w.at) != null) : [];
  s.top.innerHTML = top ? topHtml(top, phase, st, now) : "";
  s.top.hidden = !top;
  return top;
}
function writeLine(st, phase, now) {
  const { html, text } = dayLine(st.answer, now, phase);
  if (typeof st.ctx.line === "function") return st.ctx.line(LINE[phase] ? text : null);
  const el = typeof document !== "undefined" ? document.querySelector("#hd .ifh-line") : null;
  if (el && el.innerHTML !== html) el.innerHTML = html;
}
export function drawDay(root, answer, ctx) {
  if (!root) return;
  if (!answer || typeof answer !== "object") {
    root.dataset.phase = "";
    return;
  }
  const prev = live.get(root);
  // (never an older answer over one asked for here since, which the page hasn't heard of)
  if (prev?.own && prev.answer !== answer && num(prev.answer.at) != null && num(answer.at) != null && answer.at < prev.answer.at) return;
  ensureCss();
  prev?.off?.();
  const st = { answer, ctx: ctx && typeof ctx === "object" ? ctx : {}, base: Date.now(), timer: prev?.timer || 0, wrote: [], own: false };
  live.set(root, st);
  wire(root);
  paint(root, st, phaseAt(answer, nowOf(st)), nowOf(st));
  schedule(root, st);
  // (the day's plan still being worked out on the server: asked once more in 5 seconds, then as usual; by the page
  // itself where it can ask (refresh), as §7.7 has it)
  if (answer.planning === true && st.ctx.timers !== false && typeof st.ctx.refresh !== "function" && Date.now() - askedAt > MIN) {
    askedAt = Date.now();
    const t = setTimeout(() => { if (live.get(root) === st && root.isConnected && !taken(root, st)) again(root, st); }, 5000);
    t?.unref?.();
  }
}
// the day asked for again: by the page if it can, else here, and drawn (never over a newer one the page has drawn since)
async function again(root, st) {
  if (typeof st.ctx.refresh === "function") return st.ctx.refresh();
  try {
    const a = await call(st.ctx, "/api/today?v=2");
    if (a && a.v === 2 && live.get(root) === st) {
      drawDay(root, a, st.ctx);
      const now = live.get(root);
      if (now && now.answer === a) now.own = true;
    }
  } catch {}
}
// each minute, and at the next boundary or row's time if that's sooner: tickDay, with no request
function schedule(root, st) {
  clearTimeout(st.timer);
  st.timer = 0;
  if (st.ctx.timers === false) return;
  const now = nowOf(st), a = st.answer;
  const due = [num(a.until), ...list(a.timeline).map((x) => num(x.at)), ...list(a.upcoming).map((x) => num(x.at)), ...list(a.acts).map((x) => num(x.undoUntil))]
    .filter((x) => x != null && x > now);
  const next = Math.min((Math.floor(now / MIN) + 1) * MIN, ...due);
  st.timer = setTimeout(() => {
    if (live.get(root) !== st) return;
    if (!root.isConnected || taken(root, st)) return stopDay(root);
    tickDay(root, a, nowOf(st));
    if (live.get(root) === st) schedule(root, st);
  }, Math.max(100, next - now + 20));
  st.timer?.unref?.();
}
export function tickDay(root, answer, now) {
  if (!root || !answer || typeof answer !== "object") return;
  const st = live.get(root);
  if (!st || st.answer !== answer) {
    // (an answer the page has that isn't the one drawn: drawn, unless it's older than one asked for here)
    drawDay(root, answer, st ? { ...st.ctx, ...(num(now) != null && typeof st.ctx.now !== "function" ? { now } : {}) } : num(now) != null ? { now } : {});
    return;
  }
  if (taken(root, st)) return stopDay(root);
  const t = num(now) ?? nowOf(st), phase = phaseAt(answer, t), s = sections(root);
  if (phase !== st.phase) {
    paint(root, st, phase, t);
    return;
  }
  for (const r of [...s.coming.querySelectorAll("[data-due]")]) if (Number(r.dataset.due) <= t) r.remove();
  if (!s.coming.querySelector("[data-due]")) { s.coming.hidden = true; s.coming.replaceChildren(); }
  for (const b of [...s.top.querySelectorAll('[data-do="undo"]')]) if (!actShows("undo", actOf(st, b.dataset.id), t)) b.remove();
  tick(s.rest, t);
  writeLine(st, phase, t);
}

// ---------------------------------------------------------------- the buttons
function wire(root) {
  if (root.dataset.dayWired) return;
  root.dataset.dayWired = "1";
  root.addEventListener("click", (e) => {
    const el = e.target?.closest?.("[data-do]");
    const st = live.get(root);
    if (!el || !st || !root.contains(el)) return;
    const d = el.dataset.do;
    if ((d === "open" || d === "answer") && onHub(st.ctx)) {
      // (the hub's breadcrumb, as the page is left: IFL.hub.go writes it; the link goes as links go)
      try { hubOf(st.ctx).go(el.getAttribute("href")); } catch {}
      return;
    }
    if (d === "undo" || d === "take" || d === "keep") { e.preventDefault(); act(root, st, el); return; }
    if (d === "mailitem" || d === "bills") {
      const h = tripHelp(root, st);
      if (!h.sheet) { if (onHub(st.ctx) && el.getAttribute("href")) { try { hubOf(st.ctx).go(el.getAttribute("href")); } catch {} } return; }
      e.preventDefault();
      if (d === "bills") { openBills(moneyOf(st.answer), h); return; }
      const pr = el.dataset.pid ? list(st.answer.upcoming).map(parcelOfRow).find((x) => x && x.id === el.dataset.pid) : null;
      const ow = el.dataset.iid ? owedOf(st.answer).find((x) => x.item === el.dataset.iid) : null;
      if (pr || ow) openItem(pr || itemOfRow(ow), h);
      return;
    }
    if (d === "trip" || d === "booking") {
      const h = tripHelp(root, st);
      if (d === "trip") { e.preventDefault(); openTrip(tripOf(st.answer), h); return; }
      const r = list(st.answer.upcoming).find((x) => x.app === "mail" && x.booking === el.dataset.bid), b = r && bookingOfRow(r);
      // (with no sheet to open, the row's a link to its email, as any link goes)
      if (b && h.sheet) { e.preventDefault(); openBooking(b, h); }
      else if (onHub(st.ctx) && el.getAttribute("href")) { try { hubOf(st.ctx).go(el.getAttribute("href")); } catch {} }
      return;
    }
    if (d === "sendto") { e.preventDefault(); sendTo(st, el.dataset.to); }
  });
  // (a long press on a Coming Up row that has a card: Send, as its button does)
  let press = 0, pressed = false;
  const stop = () => { clearTimeout(press); press = 0; };
  root.addEventListener("pointerdown", (e) => {
    const row = e.target?.closest?.(".dc-row[data-sends]");
    pressed = false;
    if (!row || e.target.closest(".dc-send")) return;
    stop();
    press = setTimeout(() => { pressed = true; row.querySelector(".dc-send")?.click(); }, 550);
  });
  for (const n of ["pointerup", "pointercancel", "pointerleave", "scroll"]) root.addEventListener(n, stop, { passive: true });
  root.addEventListener("click", (e) => { if (pressed && e.target?.closest?.(".dc-main")) { e.preventDefault(); pressed = false; } }, true);
  root.addEventListener("contextmenu", (e) => {
    const row = e.target?.closest?.(".dc-row[data-sends]");
    if (!row) return;
    e.preventDefault();
    if (!pressed) row.querySelector(".dc-send")?.click();
    pressed = false;
  });
}
// Send to Leo, in one tap: the engine sends it at once where it can (it refuses without your tap), else Chat's sheet
// opens with Leo chosen
async function sendTo(st, to) {
  const hub = hubOf(st.ctx), t = st.answer.tops?.[st.phase];
  if (!t || !ID.test(str(to)) || !onHub(st.ctx)) return;
  const words = str(t.share), packed = PACKED.test(str(t.sendCard)) ? t.sendCard : null;
  let c = null;
  try { c = typeof hub.chat === "function" ? await hub.chat() : null; } catch {}
  if (c && (!c.state || c.state === "ready") && typeof c.sendTo === "function") {
    let r = null;
    try { r = await c.sendTo(to, words, packed); } catch {}
    if (r?.ok === true && !r.why) {
      const say = str(r.say) || `Sent to ${str(t.sendTo?.first) || "your friend"}.`;
      if (typeof hub.sent === "function") hub.sent(say); else toast(st.ctx, say);
      return;
    }
    // (the engine opened its own sheet, Leo chosen: nothing more. Refused (false, { ok: false }, or any { why }, as the
    // hub reads a refusal), or nothing said: Chat's sheet, here)
    const refused = !r || r.ok === false || (typeof r === "object" && r.why != null && r.why !== "");
    if (!refused) return;
  }
  try { await hub.send(words, packed, { to }); } catch {}
}
// Undo, Take and Keep: the account's answer said, and the card drawn again as it now stands
async function act(root, st, el) {
  if (el.disabled) return;
  const id = el.dataset.id, what = el.dataset.do;
  el.disabled = true;
  try {
    const r = await call(st.ctx, what === "undo" ? "/api/act/undo" : "/api/act", { method: "POST", body: { id } });
    const state = str(r?.act?.state);
    if (state) acted.set(id, { state, at: num(st.answer.at) });
    toast(st.ctx, str(r?.said) || (what === "take" ? str(r?.act?.said) || "Done." : what === "keep" ? "Kept." : "Undone."));
    redrawTop(root, st);
    if (typeof st.ctx.refresh === "function") st.ctx.refresh(); else again(root, st);
  } catch (e) {
    // (the account side without acts yet: their buttons go; a refusal of this one: it goes; offline or a fault: kept)
    if (e.status === 501) actsOff = true;
    else if (e.status >= 400 && e.status < 500 && e.status !== 401 && e.status !== 429) acted.set(id, { state: "gone", at: num(st.answer.at) });
    toast(st.ctx, e.status === 501 ? "Today can’t do that just yet." : e.message || "That didn’t work. Try again.");
    if (e.status === 501 || (e.status >= 400 && e.status < 500 && e.status !== 429)) redrawTop(root, st);
    else el.disabled = false;
    // (signed out meanwhile: the page told at once, by asking for the day, so its own way out of a 401 runs now, not at
    // its next refresh minutes on)
    if (e.status === 401 && typeof st.ctx.refresh === "function") Promise.resolve().then(() => st.ctx.refresh()).catch(() => {});
  }
}
function redrawTop(root, st) {
  if (live.get(root) !== st) return;
  const now = nowOf(st), key = focusKey(root);
  drawTop(root, st, st.phase, now);
  listen(root, st, []);
  // (the button pressed, where it's still there; where it's gone, the card's title, so the focus is never lost)
  ((key && root.querySelector(`#${key.sec} ${key.sel}`)) || root.querySelector("#dt-h"))?.focus?.({ preventScroll: true });
}

// ---------------------------------------------------------------- the account, and a word after
async function call(ctx, path, { method = "GET", body } = {}) {
  if (typeof ctx.call === "function") return ctx.call(path, { method, body });
  const headers = { Accept: "application/json" };
  if (method !== "GET") headers["X-Inflite"] = "1";
  if (body !== undefined) headers["Content-Type"] = "application/json";
  let r;
  try {
    r = await fetch(path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined, credentials: "same-origin", cache: "no-store" });
  } catch {
    throw Object.assign(new Error("Couldn’t reach InFlite just now. Try again in a moment."), { status: 0 });
  }
  let data = null;
  try { data = await r.json(); } catch {}
  if (!r.ok) throw Object.assign(new Error(data?.error || "Something went wrong. Try again."), { status: r.status });
  return data;
}
function toast(ctx, text, o) {
  if (typeof ctx.toast === "function") return o ? ctx.toast(text, o) : ctx.toast(text);
  let t = document.querySelector(".toast");
  if (!t) {
    t = document.createElement("div");
    t.className = "toast";
    t.setAttribute("role", "status");
    document.body.append(t);
  }
  t.textContent = text;
  t.classList.add("on");
  clearTimeout(toast.t);
  toast.t = setTimeout(() => t.classList.remove("on"), 2600);
}
