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
// ctx (all but now may be left out; the page hands in what it has):
//   now      the time (a number), or a function giving it (the page's clock, never before the answer's own moment)
//   hub      IFL.hub (else a page-wide IFL.hub, else none: off the hub, every link to the app's own address)
//   links    the account's links (chat, weather, fitness, finance): the apps' own addresses, off the hub
//   prefs    { order, hidden }: Edit's order and hidden cards, for The Rest of Today (where root has none of the page's
//            own cards already)
//   call(path, { method, body })   the page's request helper (else one here: same origin, X-Inflite on a write)
//   toast(text)    the page's word after doing something (else one here)
//   refresh()      ask for the day again, after Undo, Take or Keep. A page that hands it in asks again itself after an
//                  answer that says planning (§7.7); without it, the day's fetched here and drawn: after an act, and once
//                  5 s after a planning answer
//   line(text)     the header's line for the phase ("16:05 · your ride"), or null: the page's own (the morning's date)
//                  (without it, written into #hd .ifh-line)
//   timers   false: nothing is timed here, the page calls tickDay itself (each minute, and at until). Otherwise the next
//            boundary is drawn at its minute from here too (the page's own minute may come up to 59 s late); tickDay
//            twice is as once
import { CARD_KEYS, APP, esc, safe, hm, dayKey, dateLong, dateShort, wkShort, dayWord, G, av, cardHTML, applyVars, tick, sendButton, hubOf, onHub } from "/cards.js";

const MIN = 60e3;
const PHASES = ["morning", "midday", "preride", "riding", "after", "evening"];
// what each phase shows below its top card (§7.3: nothing beside the ride; after it, what's coming; in the evening,
// tomorrow's first thing)
const BELOW = {
  morning: ["waiting", "coming", "rest"], midday: ["waiting", "coming", "rest"], preride: [], riding: [],
  after: ["coming", "rest"], evening: ["coming", "rest"],
};
const SECTIONS = ["top", "waiting", "coming", "rest"];
const LABELS = { waiting: "Waiting for You", coming: "Coming Up", rest: "The Rest of Today" };
const LINE = { midday: "what’s next", preride: "your ride", riding: "riding", after: "ride done", evening: "closed" };
const KINDS = ["plan", "weather", "ride", "done", "closed"];
const TONES = ["up", "down", "warn", "good"];
const ID = /^[\w-]{8,64}$/, PACKED = /^[A-Za-z0-9_-]{1,6000}$/;
// (a hub path of each app's, and the account's link that's the app's own address)
const APP_PATHS = [["/chats/", "chat"], ["/weather/", "weather"], ["/fitness/", "fitness"], ["/markets/", "finance"]];

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
  return { chat: at("chat"), weather: at("weather"), fitness: at("fitness"), finance: at("finance") };
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
      const base = safe(linksOf(ctx)[key]);
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
function topHtml(t, phase, st, now) {
  const kind = KINDS.includes(t.kind) ? t.kind : "plan", lines = texts(t.lines);
  const stats = list(t.stats).filter((s) => str(s.label) && (typeof s.value === "string" || num(s.value) != null));
  const wrote = list(t.wrote).filter((w) => ID.test(str(w.id)) && str(w.first));
  const buttons = list(t.buttons).map((b) => buttonHtml(b, t, st, now)).filter(Boolean);
  const to = t.sendTo && ID.test(str(t.sendTo.id)) && str(t.sendTo.first) && str(t.sendTo.why) ? t.sendTo : null;
  const send = sendButton(t, { ...st.ctx, links: linksOf(st.ctx) }, { label: "Send", glyph: G.bird, aria: "Send this to a friend" });
  return `<article class="tcard glass day-top" data-kind="${kind}" data-phase="${esc(phase)}" aria-labelledby="dt-h">
    ${str(t.chip) ? `<span class="dt-chip">${kind === "done" ? G.check : kind === "ride" ? G.ride : ""}${esc(t.chip)}</span>` : ""}
    <h2 class="tc-h dt-h" id="dt-h" tabindex="-1">${esc(t.title)}</h2>
    ${lines.length ? `<div class="dt-lines">${lines.map((l) => `<p class="tc-p">${esc(l)}</p>`).join("")}</div>` : ""}
    ${stats.length ? `<dl class="dt-stats">${stats.map((s) => `<div${TONES.includes(s.tone) ? ` class="dt-${s.tone}"` : ""}><dt>${esc(s.label)}</dt><dd>${esc(s.value)}</dd></div>`).join("")}</dl>` : ""}
    ${wrote.length ? `<div class="dt-wrote">${wrote.map((w) => `<p class="dt-said" data-wid="${esc(w.id)}" data-first="${esc(w.first)}" data-since="${num(w.at) ?? 0}" hidden></p>`).join("")}</div>` : ""}
    ${to ? `<p class="dt-to">${esc(to.first)} · ${esc(to.why)}</p>` : ""}
    ${buttons.length || send ? `<div class="tc-foot">${buttons.join("")}${send}</div>` : ""}
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
function waitingHtml(rows, st, now) {
  const tz = str(st.answer.tz) || undefined;
  return `<h2 class="slabel">${LABELS.waiting}</h2><div class="group glass">${rows.map((r) => {
    const g = r.group && typeof r.group === "object" && ID.test(str(r.group.id)) && str(r.group.name) ? r.group : null;
    const who = g ? `${r.first} in ${g.name}` : r.first, n = num(r.n) || 1;
    const h = linkTo(`/chats/#open=${g ? g.id : r.id}`, st.ctx);
    const when = `${n > 1 ? `${n} messages, the last` : "Wrote"} ${dayWord(Math.min(r.at, now), now, tz)}at ${hm(r.at, tz)}`;
    return `<div class="dw-row" data-wid="${esc(r.id)}" data-at="${r.at}">
      <a class="row dw-main" href="${esc(h || "#")}" data-do="answer">${av(g ? { id: g.id, first: g.name } : { id: r.id, first: r.first })}<span class="tx"><b>${esc(who)}</b><small>${esc(when)}</small><span class="dw-words" hidden></span></span><span class="chev">${G.chev}</span></a>
      <div class="dw-chips" hidden></div>
    </div>`;
  }).join("")}</div>`;
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
// (still to come at now; in the evening, tomorrow's first thing alone)
export function comingAt(upcoming, now, phase) {
  const rows = list(upcoming).filter((r) => num(r.at) != null && r.at > now && str(r.title)).sort((a, b) => a.at - b.at);
  return phase === "evening" ? rows.slice(0, 1) : rows;
}
function comingHtml(rows, st, now) {
  const tz = str(st.answer.tz) || undefined, ctx = { ...st.ctx, links: linksOf(st.ctx) };
  return `<h2 class="slabel">${LABELS.coming}</h2><div class="group glass">${rows.map((r) => {
    const app = APP[r.app === "markets" || r.app === "chat" || r.app === "weather" || r.app === "fitness" ? r.app : ""];
    const h = linkTo(r.href, st.ctx), other = dayKey(r.at, tz) !== dayKey(now, tz);
    const send = sendButton(r, ctx, { label: "", glyph: G.bird, cls: "dc-send", aria: `Send to a friend: ${r.title}` });
    return `<div class="dc-row" data-due="${r.at}"${send ? " data-sends" : ""}>
      <a class="row dc-main" href="${esc(h || "#")}"><span class="dc-tm">${esc(hm(r.at, tz))}${other ? `<small>${esc(wkShort(r.at, tz))}</small>` : ""}</span>${app ? `<img class="dc-ic" src="${app.icon}" alt="">` : `<span class="dc-ic"></span>`}<span class="tx"><b>${esc(r.title)}</b>${str(r.sub) ? `<small>${esc(r.sub)}</small>` : ""}</span></a>${send}
    </div>`;
  }).join("")}</div>`;
}

// ---------------------------------------------------------------- drawing
const live = new WeakMap();
// (answers already asked again for, while planning: once more each, then as usual)
let askedAt = -Infinity;
// (the focus kept where it was as the day's drawn again: the same button or row, else the top card's title)
function focusKey(root) {
  const f = typeof document !== "undefined" ? document.activeElement : null;
  if (!f || f === root || !root.contains?.(f)) return null;
  const sec = f.closest?.("#top, #waiting, #coming, #rest");
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
  const a = st.answer, s = sections(root), shows = BELOW[phase] || BELOW.midday;
  st.phase = phase;
  root.dataset.phase = phase || "";
  drawTop(root, st, phase, now, s);
  const w = shows.includes("waiting") ? waitingRows(a) : [];
  s.waiting.innerHTML = w.length ? waitingHtml(w, st, now) : "";
  s.waiting.hidden = !w.length;
  const rows = shows.includes("coming") ? comingAt(a.upcoming, now, phase) : [];
  s.coming.innerHTML = rows.length ? comingHtml(rows, st, now) : "";
  s.coming.hidden = !rows.length;
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
function drawTop(root, st, phase, now, s = sections(root)) {
  const top = topFor(st.answer, phase, now);
  st.wrote = top ? list(top.wrote).filter((w) => ID.test(str(w.id)) && str(w.first) && num(w.at) != null) : [];
  s.top.innerHTML = top ? topHtml(top, phase, st, now) : "";
  s.top.hidden = !top;
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
  const st = { answer, ctx: ctx && typeof ctx === "object" ? ctx : {}, base: Date.now(), timer: prev?.timer || 0, wrote: [], own: false };
  live.set(root, st);
  wire(root);
  paint(root, st, phaseAt(answer, nowOf(st)), nowOf(st));
  schedule(root, st);
  // (the day's plan still being worked out on the server: asked once more in 5 seconds, then as usual; by the page
  // itself where it can ask (refresh), as §7.7 has it)
  if (answer.planning === true && st.ctx.timers !== false && typeof st.ctx.refresh !== "function" && Date.now() - askedAt > MIN) {
    askedAt = Date.now();
    const t = setTimeout(() => { if (live.get(root) === st && root.isConnected) again(root, st); }, 5000);
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
    if (!root.isConnected) { live.delete(root); return; }
    tickDay(root, a, nowOf(st));
    schedule(root, st);
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
    if (r?.ok) {
      const say = str(r.say) || `Sent to ${str(t.sendTo?.first) || "your friend"}.`;
      if (typeof hub.sent === "function") hub.sent(say); else toast(st.ctx, say);
      return;
    }
    // (the engine opened its own sheet: nothing more)
    if (r && r.ok !== false) return;
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
function toast(ctx, text) {
  if (typeof ctx.toast === "function") return ctx.toast(text);
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
