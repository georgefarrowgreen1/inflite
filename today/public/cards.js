// InFlite Today's four cards, each drawn from the account's answer (GET /api/today: functions/_todaycards.js in the
// georgefarrowgreen repo), in each app's own words and look. Every string from the answer is someone's text, never
// markup: it goes in through esc(), and every address only from the answer's own href fields and links, checked. The
// only markup here is our own (the glyphs, the icons, the fixed words). And no inline styles anywhere: a figure a drawing
// needs (how far a pigeon's flown, where the best hours are) goes in data-vars, set as custom properties once it's in
// the page (applyVars), as the page's rules allow no inline styles.
import { weatherIcon } from "/wxicons.js";

export const CARD_KEYS = ["weather", "chat", "fitness", "markets"];
export const APP = {
  weather: { name: "Weather", icon: "/apps/weather.svg" },
  chat: { name: "Chat", icon: "/apps/chat.svg" },
  fitness: { name: "Fitness", icon: "/apps/fitness.svg" },
  markets: { name: "Markets", icon: "/apps/markets.svg" },
};
const MIN = 60e3, HR = 60 * MIN;

// ---------------------------------------------------------------- text, addresses, times
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
// (an address from the account: https only, or http where Today itself is (a test on this computer))
export const safe = (h) => (typeof h === "string" && (/^https:\/\//i.test(h) || (location.protocol === "http:" && /^http:\/\//i.test(h))) ? h : null);
const href = (h) => esc(safe(h) || "#");
const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const and2 = (a) => (a.length > 1 ? `${a.slice(0, -1).join(", ")} and ${a.at(-1)}` : a[0] || "");

const fmts = new Map();
function dtf(tz, o) {
  const k = `${tz}|${JSON.stringify(o)}`;
  let f = fmts.get(k);
  if (!f) {
    try { f = new Intl.DateTimeFormat("en-GB", { timeZone: tz, ...o }); } catch { f = new Intl.DateTimeFormat("en-GB", o); }
    fmts.set(k, f);
  }
  return f;
}
export const hm = (t, tz) => dtf(tz, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(t);
export const dayKey = (t, tz) => dtf(tz, { year: "numeric", month: "2-digit", day: "2-digit" }).format(t);
export const dateLong = (t, tz) => dtf(tz, { weekday: "long", day: "numeric", month: "long" }).format(t);
export const dateShort = (t, tz) => dtf(tz, { weekday: "short", day: "numeric", month: "short" }).format(t);
const dayMonth = (t, tz) => dtf(tz, { day: "numeric", month: "short" }).format(t);
const weekday = (t, tz) => dtf(tz, { weekday: "long" }).format(t);
const wkShort = (t, tz) => dtf(tz, { weekday: "short" }).format(t);
// (the calendar day of t where tz is, as a count of days: so two days a clock change apart are still one day apart)
const dayNo = (t, tz) => {
  const p = Object.fromEntries(dtf(tz, { year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(t).map((x) => [x.type, x.value]));
  return Math.round(Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day)) / (24 * HR));
};
// "", "tomorrow ", "yesterday ", "Wed ", or six days or more off "Fri 23 Oct " (as Chat's atTime: a weekday alone reads as
// this week's): the day of t, said from today's
function dayWord(t, now, tz) {
  const d = dayNo(t, tz) - dayNo(now, tz);
  return d === 0 ? "" : d === 1 ? "tomorrow " : d === -1 ? "yesterday " : Math.abs(d) < 6 ? `${wkShort(t, tz)} ` : `${wkShort(t, tz)} ${dayMonth(t, tz)} `;
}
// (as Chat says how long, pigeon/app.js fmtDur: "1d 2h", "8h 9m", "12m", "under a minute")
const togo = (ms) => {
  ms = Math.max(0, ms);
  const d = Math.floor(ms / (24 * HR)), h = Math.floor((ms % (24 * HR)) / HR), m = Math.floor((ms % HR) / MIN);
  return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : m ? `${m}m` : "under a minute";
};
// (as Fitness says a length of time, fitness/ui.js: "45 min", "1 h 12 min", "3 h")
export const dur = (secs) => { const m = Math.round(secs / 60); if (m < 60) return `${m} min`; const h = Math.floor(m / 60), r = m % 60; return r ? `${h} h ${r} min` : `${h} h`; };
const hmOf = (s) => { const m = Math.round((s || 0) / 60); return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`; };
const miles = (km) => `${Math.round(km * 0.621371).toLocaleString("en-GB")} mi`;
// (as Markets says numbers: markets/app.js)
const SYM = { GBP: "£", USD: "$", EUR: "€", JPY: "¥", INR: "₹" };
const fmt = (n, d = 2) => Number(n).toLocaleString("en-GB", { minimumFractionDigits: d, maximumFractionDigits: d });
const money = (v, cur = "GBP", d = 2) => (v < 0 ? "−" : "") + (SYM[cur] ?? "") + fmt(Math.abs(v), d) + (SYM[cur] || !cur ? "" : " " + cur);
const signed = (v, cur = "GBP", d = 2) => (v >= 0 ? "+" : "−") + (SYM[cur] ?? "") + fmt(Math.abs(v), d) + (SYM[cur] || !cur ? "" : " " + cur);
const pct = (v, d = 2) => (v == null ? "–" : (v >= 0 ? "+" : "−") + fmt(Math.abs(v), d) + "%");
const tone = (v) => (v == null || Math.abs(v) < 0.005 ? "mk-flat" : v >= 0 ? "mk-up" : "mk-down");

// ---------------------------------------------------------------- glyphs (ours)
const sv = (d, w = 2.2) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const BIRD_D = "M3.2 11.6 5 10.6C6.2 9.4 8 9.2 9.4 9.9L12.6 3.6C14.4 3 15.6 4 15.4 5.8L14.2 10.6C16.2 10.6 18.4 10 20.6 8.8L21 9.6C20.2 11.2 19.4 12.2 18.6 12.8L21.4 14.4 17.4 14.6C15.4 16.6 12 17.4 9.4 16.2 7.4 15.3 6.1 13.6 5.4 12.3Z";
export const G = {
  open: sv('<path d="M8 16 16 8M9 8h7v7"/>', 2.4),
  chev: sv('<path d="m9 6 6 6-6 6"/>', 2.4),
  down: sv('<path d="m6 9 6 6 6-6"/>', 2.6),
  up: sv('<path d="m6 15 6-6 6 6"/>', 2.4),
  x: sv('<path d="M6 6l12 12M18 6 6 18"/>', 2.4),
  warn: sv('<path d="M10.3 3.9 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>'),
  clock: sv('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>', 2),
  bell: sv('<path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>', 2),
  lock: sv('<rect x="4" y="11" width="16" height="10" rx="2.5"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>', 2),
  again: sv('<path d="M3.5 12a8.5 8.5 0 1 0 2.5-6"/><path d="M3 4v4.5h4.5"/>', 2.2),
  coin: sv('<circle cx="12" cy="12" r="8.5"/><path d="M14.5 9.2c-.5-.8-1.4-1.2-2.5-1.2-1.6 0-2.7.9-2.7 2.1 0 2.7 5.4 1.6 5.4 4 0 1.2-1.1 2.1-2.7 2.1-1.2 0-2.2-.5-2.7-1.4M12 6.5V8M12 16v1.5"/>'),
  piggy: sv('<path d="M5 11a7 6 0 0 1 12.6-3.2L20 7v3.5l1 1.5-1 1.5h-1.6a7 6 0 0 1-2.4 2.6V19h-3v-2a8 8 0 0 1-2 0v2H8v-3a6 6 0 0 1-3-5z"/><path d="M15.5 10.5h.01"/>'),
  ride: sv('<circle cx="6" cy="16" r="3.6"/><circle cx="18" cy="16" r="3.6"/><path d="M6 16l3.7-7h6.1L18 16M9.7 9 12.4 16H6M14.3 6.4h2.4"/>', 1.9),
  run: sv('<circle cx="14" cy="4.5" r="2"/><path d="M8 21l3-6 3 2 1 4M7 12l3-4 4 1 2 3 3 1M10 8l1.5 5"/>', 1.9),
  check: sv('<path d="m5 12.5 4.5 4.5L19 7"/>', 3),
  heart: sv('<path d="M12 20s-7.5-4.5-7.5-10.2A4.3 4.3 0 0 1 12 7.2a4.3 4.3 0 0 1 7.5 2.6C19.5 15.5 12 20 12 20z"/>'),
  flag: sv('<path d="M5.5 21V4.5M5.5 4.5h11l-2.2 4 2.2 4h-11"/>'),
  sun: sv('<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4"/>', 2),
  info: sv('<circle cx="12" cy="12" r="8.6"/><path d="M12 11v5.4"/><path d="M12 7.7v.1" stroke-width="2.8"/>'),
  bird: `<svg viewBox="0 0 24 24" class="bird-ic" aria-hidden="true"><path d="${BIRD_D}" transform="matrix(-1 0 0 1 24 0)"/></svg>`,
  birdL: `<svg viewBox="0 0 24 24" class="pg-bird" aria-hidden="true"><path d="${BIRD_D}"/></svg>`,
  flame: '<svg viewBox="0 0 24 24" class="pg-flame" aria-hidden="true"><path d="M12 21c-3.9 0-6.5-2.6-6.5-6.2 0-2.6 1.4-4.6 3-6.3.3 1.7 1.2 2.9 2.4 3.4-.4-3.3 1-6.1 3.4-8.4.2 2.8 1.6 4.4 2.9 6 1 1.3 1.8 2.9 1.8 4.9 0 4-2.6 6.6-6.5 6.6Z"/></svg>',
};

// ---------------------------------------------------------------- the frame every card shares
// (the card's head: its app, a few words, and Open: a link to the app, at the closest place it has to what's shown)
function head(key, card, meta = "", label = "") {
  const a = APP[key];
  return `<a class="tc-head" href="${href(card.href)}" aria-label="${esc(label || `Open ${a.name}`)}"><img src="${a.icon}" alt=""><span class="tc-app">${a.name}</span><span class="tc-meta">${meta}</span><span class="tc-go"><span>Open</span>${G.open}</span></a>`;
}
// Send to a friend: Chat, with the card's line to start a letter with (never a word of anyone's letter)
function sendPill(card, ctx) {
  const chat = safe(ctx.links?.chat);
  if (!card.share || typeof card.share !== "string" || !chat) return "";
  return `<a class="pill" href="${esc(`${chat.replace(/\/+$/, "")}/#share=${encodeURIComponent(card.share)}`)}" data-send>${G.bird}Send to a friend</a>`;
}
const foot = (...xs) => { const s = xs.filter(Boolean).join(""); return s ? `<div class="tc-foot">${s}</div>` : ""; };
const linkPill = (label, h, { primary = false, icon = "" } = {}) => `<a class="pill${primary ? " primary" : ""}" href="${href(h)}">${icon}${esc(label)}</a>`;

// a card waiting for its answer: its head, and the shape of what's coming
export function placeholder(key) {
  const a = APP[key];
  return `<article class="tcard glass loading" data-app="${key}" aria-label="${a.name}"><div class="tc-head"><img src="${a.icon}" alt=""><span class="tc-app">${a.name}</span><span class="tc-meta"></span></div><div class="sk" aria-hidden="true"><i></i><i></i><i></i></div><span class="vh">Getting ${a.name}’s day…</span></article>`;
}

// not set up (with the button that does it), or couldn't load (with Try Again, which asks for this card alone)
function notOk(key, card) {
  const meta = key === "weather" && card.place?.name ? esc(card.place.name) : "";
  const act = card.state === "empty" && card.action ? linkPill(card.action.label, card.action.href, { primary: true }) : "";
  const retry = card.state === "error" ? `<button class="pill" type="button" data-retry="${key}">${G.again}Try Again</button>` : "";
  return `${head(key, card, meta)}<p class="tc-p tc-said">${esc(card.said)}</p>${foot(act, retry)}`;
}

// the whole card, from its part of the answer: ctx = { links, tz, now }
export function cardHTML(key, card, ctx) {
  const a = APP[key];
  let inner = "", cls = "";
  try {
    if (!card || typeof card !== "object") card = { state: "error", said: "Couldn’t load this just now.", retry: true };
    if (card.state !== "ok") inner = notOk(key, card);
    else if (key === "weather") ({ inner, cls } = weather(card, ctx));
    else if (key === "chat") inner = chat(card, ctx);
    else if (key === "fitness") inner = fitness(card, ctx);
    else if (key === "markets") inner = markets(card, ctx);
  } catch (e) {
    console.error(e);
    inner = notOk(key, { state: "error", href: card?.href, said: "Couldn’t show this just now." });
    cls = "";
  }
  return `<article class="tcard glass${cls ? " " + cls : ""}" data-app="${key}" data-state="${esc(card?.state || "error")}" aria-label="${a.name}">${inner}</article>`;
}

// what a drawing needs as figures, set once it's in the page: data-vars="--f:0.42;--x:12.5"
export function applyVars(root) {
  for (const el of root.querySelectorAll("[data-vars]")) {
    for (const part of el.dataset.vars.split(";")) {
      const [k, v] = part.split(":");
      if (/^--[a-z]+$/.test(k) && /^-?[\d.]+$/.test(v)) el.style.setProperty(k, v);
    }
  }
}
const vars = (o) => `data-vars="${Object.entries(o).map(([k, v]) => `--${k}:${Number(v).toFixed(4).replace(/\.?0+$/, "") || 0}`).join(";")}"`;

// ---------------------------------------------------------------- Weather
const SKIES = ["clear-day", "partly-day", "cloudy-day", "rain-day", "storm", "snow-day", "fog", "clear-night", "partly-night", "cloudy-night", "rain-night", "snow-night", "dusk", "dawn"];
const ICONS = ["sun", "moon", "mostly-sun", "mostly-moon", "partly-sun", "partly-moon", "cloud", "fog", "drizzle", "rain", "heavy-rain", "showers-sun", "showers-moon", "sleet", "snow", "storm"];
const wxIcon = (name, size) => weatherIcon(ICONS.includes(name) ? name : "cloud", size);
const WARN_COLOURS = ["yellow", "amber", "orange", "red"];
// the place's own clock (its UTC offset, as Weather's is), 24 or 12 hour as Weather's setting has it
export function placeClock(now, offset, clock) {
  const d = new Date(now + (num(offset) || 0) * 1000), h = d.getUTCHours(), m = String(d.getUTCMinutes()).padStart(2, "0");
  return clock === "12" ? `${h % 12 || 12}:${m}${h < 12 ? "am" : "pm"}` : `${String(h).padStart(2, "0")}:${m}`;
}
function weather(c, ctx) {
  const sky = SKIES.includes(c.sky) ? c.sky : "cloudy-day", night = /-night$/.test(sky);
  const p = c.place || {}, now = c.now || {}, day = c.day || {}, hours = c.hours || { list: [] }, list = Array.isArray(hours.list) ? hours.list : [];
  const clk = c.clock === "12" ? "12" : "24", off = num(c.offset) || 0;
  const meta = `${esc(p.name)} · <span data-wxclock data-off="${off}" data-clk="${clk}">${placeClock(ctx.now, off, clk)}</span>`;
  const w = c.warning, colour = WARN_COLOURS.includes(w?.colour) ? w.colour : "yellow";
  const warn = w ? `<a class="wx-warn ${colour}" href="${href(c.href)}" aria-label="${esc(`${w.chip}, from ${w.issuer || "the official forecaster"}: see it in Weather`)}">${G.warn}<span>${esc(w.chip)}</span>${G.chev.replace("<svg", '<svg class="chev"')}</a>` : "";
  const wet = !!hours.wet;
  const pop = (x) => (num(x.pop) >= 20 ? `${Math.round(x.pop / 10) * 10}%` : "");
  const hrs = list.map((x, i) => {
    const isNow = x.time === "Now" && i === 0;
    const said = `${x.time}: ${x.temp}, ${x.label}${num(x.pop) >= 20 ? `, ${x.pop}% chance of rain` : ""}`;
    return `<div class="wx-hour${isNow ? " now" : ""}" role="listitem" aria-label="${esc(said)}"><span class="h-time">${esc(x.time)}</span><span class="h-icon">${wxIcon(x.icon, 30)}</span><span class="h-temp num">${esc(x.temp)}</span>${wet ? `<span class="h-pop">${pop(x)}</span>` : ""}</div>`;
  }).join("");
  const inner = `${head("weather", c, meta, `Open Weather for ${p.name || "your place"}`)}
    <div class="wx-now"><span class="t num">${esc(now.temp)}</span>${wxIcon(now.icon, 58)}<span class="d"><b>${esc(now.label)}</b><small><span class="nw">H ${esc(day.hi)} L ${esc(day.lo)}</span> <span class="nw">· Feels like ${esc(now.feels)}</span></small></span></div>
    <p class="wx-brief"><b>${esc(c.lead)}</b>${c.more ? ` ${esc(c.more)}` : ""}</p>
    ${warn}
    ${list.length ? `<a class="wx-ahead" href="${href(c.href)}" aria-label="${esc(`${hours.label}, in Weather`)}"><span class="lab">${G.clock}${esc(hours.label)}</span><span class="wx-hours" role="list">${hrs}</span></a>` : ""}
    ${foot(sendPill(c, ctx))}`;
  return { inner, cls: `wx wx-sk-${sky}${night ? " night" : ""}` };
}

// ---------------------------------------------------------------- Chat
const KINDS = ["standard", "swift", "turbo", "rocket", "dumb"];
// (Chat's words for a pigeon of each kind, pigeon/app.js, without their punctuation)
const KIND_SAID = { standard: "A standard pigeon", swift: "A swift pigeon", turbo: "A turbo pigeon", rocket: "A rocket pigeon", dumb: "A dumb pigeon" };
const firstOf = (who) => String(who?.first || who?.name || "Someone");
// (each friend's own colour, by their id, behind their initial; their picture over it, where they have one)
function av(who) {
  const id = String(who?.id || "");
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const img = who?.photoAt && /^[\w-]{8,64}$/.test(id) ? `<img class="av-img" src="/api/avatar?id=${encodeURIComponent(id)}&amp;v=${encodeURIComponent(String(who.photoAt))}" alt="">` : "";
  // (their whole name on it, shown as you point at it: the row says their first)
  const name = typeof who?.name === "string" && who.name ? ` title="${esc(who.name)}"` : "";
  return `<span class="pg-av c${h % 6}" aria-hidden="true"${name}>${esc([...firstOf(who)][0] || "?")}${img}</span>`;
}
// how far it's come, as a line with the bird along it (moved on each minute: tick)
function track(p, now) {
  const span = Math.max(1, p.landsAt - p.sentAt), f = Math.max(0, Math.min(1, (now - p.sentAt) / span)), kind = KINDS.includes(p.kind) ? p.kind : "standard";
  return `<span class="pg-track k-${kind}${now >= p.landsAt ? " done" : ""}" ${vars({ f })} aria-hidden="true"><i></i><b class="cb">${G.bird}</b></span>`;
}
// "lands about 11:05", "lands at 11:05" (within ten minutes, when Chat's sure of it), "lands tomorrow about 08:40", and
// once it's down "landed at 11:05" (on a day gone or today, never one still to come): said again each minute (tick)
const whenSaid = (lands, now, tz) => (lands <= now ? `landed ${dayWord(lands, now, tz)}at ${hm(lands, tz)}`
  : `lands ${dayWord(lands, now, tz)}${lands - now <= 10 * MIN ? "at" : "about"} ${hm(lands, tz)}`);
const togoSaid = (lands, now) => (lands <= now ? "Landed" : `${togo(lands - now)} to go`);
// (the card's title, from how many are still flying to you and how many have landed unread: said again as they land)
const chatTitle = (flying, landed, who1) => (flying > 1 ? `${flying} pigeons on their way to you` : flying ? "A pigeon on its way to you"
  : landed > 1 ? `${landed} pigeons landed` : landed === 1 ? `${who1}’s pigeon landed` : "No pigeons on their way to you");
// (a streak's time left, as Chat says it: pigeon/app.js streakLeft and its Flight Streak row)
const streakSaid = (ends, now) => `Send a pigeon in the next ${togo(Math.max(MIN, ends - now))} to keep it`;
function chat(c, ctx) {
  const { now, tz } = ctx, list = (x) => (Array.isArray(x) ? x.filter((p) => p && typeof p === "object") : []);
  const inbound = list(c.inbound), unread = list(c.unread), mine = list(c.mine), more = num(c.more) || 0;
  const flies = (p) => !((num(p.landsAt) || 0) <= now), down = inbound.filter((p) => !flies(p));
  const inAir = inbound.length - down.length + mine.filter(flies).length + more, unreadN = unread.reduce((a, u) => a + (num(u.n) || 0), 0);
  const un1 = unreadN === 1 ? firstOf((unread.find((u) => num(u.n)) || unread[0]).who) : "";
  const title = chatTitle(inbound.length - down.length, unreadN + down.length, unreadN + down.length !== 1 ? "" : unreadN ? un1 : firstOf(down[0].who));
  const carrier = (p, yours) => (p.bird?.name ? `${p.bird.name}${p.bird.rank ? `, ${p.bird.rank}` : ""}` : p.mystery ? (yours && KINDS.includes(p.kind) ? `Mystery: ${p.kind}` : "A mystery pigeon") : KIND_SAID[p.kind] || "A pigeon");
  const live = (p) => `data-sent="${num(p.sentAt) || 0}" data-lands="${num(p.landsAt) || 0}" data-tz="${esc(tz)}"`;
  const inRow = (p) => {
    const where = num(p.km) ? ` · ${miles(p.km)}${p.from ? ` from ${esc(p.from)}` : ""}` : p.from ? ` · from ${esc(p.from)}` : "";
    return `<a class="pg-row in" href="${href(p.href)}" ${live(p)} data-who="${esc(firstOf(p.who))}">${av(p.who)}<span class="pg-tx"><b>${esc(firstOf(p.who))}’s pigeon <span data-when>${esc(whenSaid(p.landsAt, now, tz))}</span></b><small>${esc(carrier(p, false))}${where} · <span data-togo>${togoSaid(p.landsAt, now)}</span></small></span><span class="pg-go">${G.chev}</span>${track(p, now)}</a>`;
  };
  // (landed unread: when the last of them landed, never later than now, so never on a day still to come)
  const unRow = (u) => {
    const t = Math.min(num(u.last) ?? now, now), many = num(u.n) > 1;
    return `<a class="pg-row" href="${href(u.href)}">${av(u.who)}<span class="pg-tx"><b>${esc(firstOf(u.who))}’s ${many ? "pigeons landed, the last" : "pigeon landed"} ${esc(dayWord(t, now, tz))}at ${hm(t, tz)}</b><small class="pg-unread">${many ? `${u.n} not read yet` : "Not read yet"}</small></span><span class="pg-go">${G.chev}</span></a>`;
  };
  const myRow = (p) => {
    const where = num(p.km) ? ` · ${miles(p.km)}${p.to ? ` to ${esc(p.to)}` : ""}` : p.to ? ` · to ${esc(p.to)}` : "";
    return `<a class="pg-row mine" href="${href(p.href)}" ${live(p)}>${av(p.who)}<span class="pg-tx"><b>To ${esc(firstOf(p.who))} · <span data-when>${esc(whenSaid(p.landsAt, now, tz))}</span></b><small>${esc(carrier(p, true))}${where} · <span data-togo>${togoSaid(p.landsAt, now)}</span></small></span><span class="pg-go">${G.chev}</span>${track(p, now)}</a>`;
  };
  const s = c.streak, ends = num(s?.endsAt);
  const streak = s && num(s.n) && ends ? `<a class="pg-streak" href="${href(s.href)}"${ends <= now ? " hidden" : ""}>${G.flame}<span class="tx"><b>${s.n}-day flight streak with ${esc(firstOf(s.who))}</b><small data-ends="${ends}">${streakSaid(ends, now)}</small></span>${G.chev.replace("<svg", '<svg class="pg-chev"')}</a>` : "";
  const rows = [...inbound.map(inRow), ...unread.map(unRow)].join("");
  return `${head("chat", c, inAir ? `${inAir} in the air` : "")}
    <h3 class="tc-h" data-pgtitle data-unread="${unreadN}" data-who1="${esc(un1)}" data-more="${more}">${esc(title)}</h3>
    ${rows ? `<div class="pg-list">${rows}</div>` : ""}
    ${mine.length ? `<p class="pg-label">Yours in the air</p><div class="pg-list">${mine.map(myRow).join("")}</div>${more > 0 ? `<p class="pg-more">and ${more} more in the air, in Chat</p>` : ""}` : ""}
    ${streak}
    ${foot(sendPill(c, ctx))}`;
}

// ---------------------------------------------------------------- Fitness
const ZONES = [[0.55, "z1"], [0.75, "z2"], [0.9, "z3"], [1.05, "z4"], [1.2, "z5"], [1.5, "z6"], [Infinity, "z7"]];
const zoneOf = (x) => ZONES.find(([top]) => x < top)[1];
// the session's shape, step by step, each in its zone's colour (as Fitness draws it, small)
function profile(steps, label) {
  const ok = (Array.isArray(steps) ? steps : []).map((s) => (Array.isArray(s) ? [Number(s[0]) || 0, Number(s[1]) || 0, Number(s[2]) || 0] : null)).filter((s) => s && s[0] > 0);
  if (!ok.length) return "";
  const total = ok.reduce((a, s) => a + s[0], 0), W = 300, H = 44, top = Math.max(1.2, ...ok.map((s) => Math.max(s[1], s[2]) * 1.08));
  const x = (t) => (t / total) * (W - 2), y = (v) => H - (Math.min(v, top) / top) * (H - 2), f1 = (v) => v.toFixed(1);
  let t = 0, body = "";
  for (const [secs, from, to] of ok) {
    const x0 = x(t), x1 = Math.max(x0 + 0.6, x(t + secs) - 0.6);
    body += `<path class="ft-${zoneOf((from + to) / 2)}" d="M${f1(x0)} ${H}V${f1(y(Math.max(from, 0.02)))}L${f1(x1)} ${f1(y(Math.max(to, 0.02)))}V${H}Z"/>`;
    t += secs;
  }
  return `<div class="ft-prof-mini"><svg class="ft-chart mini" width="100%" height="100%" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="${esc(label)}">${body}</svg></div>`;
}
const RATINGS = ["great", "good", "fair", "poor"];
// the best time to ride (or run), as Weather says it, with every daylight hour coloured by how good it is (Fitness's
// ratings, fitness/besttime.js ratingOf, with their key), and now
function bestBox(b, tz, now, sport = "ride") {
  if (!b) return "";
  const row = b.poor
    ? `<span class="ft-best poor"><span class="ft-wxi">${G.info}</span><span class="tx"><b>${esc(b.said)}</b><small>${esc(b.sub)}</small></span></span>`
    : `<span class="ft-best"><span class="ft-wxi">${G.sun}</span><span class="tx"><b>${esc(b.said)}</b><small>${esc(b.sub)}</small></span></span>`;
  const grid = (Array.isArray(b.grid) ? b.grid : []).filter((g) => g && num(g.t) != null);
  if (!grid.length) return `<div class="ft-bestbox">${row}</div>`;
  const n = grid.length, t0 = grid[0].t, pos = (tt) => ((tt - t0) / (n * HR)) * 100;
  const cells = grid.map((g) => { const r = String(g.rating || "").toLowerCase(); return `<i class="${RATINGS.includes(r) ? r : "fair"}"></i>`; }).join("");
  const win = !b.poor && num(b.start) != null && num(b.end) != null ? `<span class="ft-bt-win" ${vars({ x: pos(b.start), w: pos(b.end) - pos(b.start) })}></span>` : "";
  const p = pos(now);
  const nowL = `<span class="ft-bt-now" data-t0="${t0}" data-n="${n}" ${vars({ x: Math.max(0, Math.min(100, p)) })}${p > 0 && p < 100 ? "" : " hidden"}></span>`;
  // (every third hour marked, and the end of the last: the one before it left out if it'd sit too close)
  const marks = [];
  for (let i = 0; i <= n; i += 3) marks.push(i);
  if (marks.at(-1) !== n) { if (n - marks.at(-1) < 2 && marks.length > 1) marks.pop(); marks.push(n); }
  const axis = marks.map((i) => `<span ${vars({ x: (i / n) * 100 })}>${esc(hm(i < n ? grid[i].t : grid[n - 1].t + HR, tz).slice(0, 2))}</span>`).join("");
  const said = `Each daylight hour for a ${sport === "run" ? "run" : "ride"}: ${grid.map((g) => `${hm(g.t, tz)} ${String(g.rating || "")}`).join(", ")}${!b.poor && b.span ? `. Best ${b.span}` : ""}`;
  const key = `<div class="ft-bt-key" aria-hidden="true">${RATINGS.map((r) => `<span><i class="${r}"></i>${r.charAt(0).toUpperCase() + r.slice(1)}</span>`).join("")}</div>`;
  return `<div class="ft-bestbox">${row}<div class="ft-bt" role="img" aria-label="${esc(said)}"><div class="ft-bt-cells" ${vars({ n })}>${cells}</div>${win}${nowL}</div><div class="ft-bt-axis" aria-hidden="true">${axis}</div>${key}</div>`;
}
const SPORT = (s) => { const w = String(s || "ride").toLowerCase(); return w.charAt(0).toUpperCase() + w.slice(1); };
const chip = (text, { cls = "", tile = "ft-s-ride", icon = G.ride } = {}) => `<span class="ft-sport${cls ? " " + cls : ""}"><i class="ft-tile ${tile}">${icon}</i>${esc(text)}</span>`;
function nextRow(nx, c) {
  if (!nx || !nx.name) return "";
  const lead = nx.label === "Tomorrow" ? "Tomorrow" : `Next · ${nx.label || ""}`;
  return `<a class="ft-next" href="${href(c.href)}"><span class="tx"><small>${esc(lead)}</small><b>${esc(nx.name)}</b>${num(nx.secs) ? `<small>${dur(nx.secs)}</small>` : ""}</span><span class="ft-chev">${G.chev}</span></a>`;
}
function fitness(c, ctx) {
  const { now, tz } = ctx, s = c.session, metaDay = c.day && /^\d{4}-\d\d-\d\d$/.test(c.day) ? weekday(Date.parse(`${c.day}T12:00:00Z`), "UTC") : "";
  const hd = head("fitness", c, esc(metaDay));
  const send = sendPill(c, ctx), open = linkPill("Open Fitness", c.href);
  if (c.kind === "done" && c.done) {
    const d = c.done, from = d.from === "garmin" ? " · from Garmin Connect" : d.from === "strava" ? " · from Strava" : "";
    const dist = num(d.dist) != null ? (c.units === "imperial" ? `${(d.dist / 1609.344).toFixed(1)}<u> mi</u>` : `${(d.dist / 1000).toFixed(d.dist < 10000 ? 2 : 1)}<u> km</u>`) : null;
    const figs = [num(d.secs) != null ? ["Time", hmOf(d.secs)] : null, dist ? ["Distance", dist] : null, num(d.tss) != null ? ["Stress", String(Math.round(d.tss))] : null].filter(Boolean);
    return `${hd}${chip("Done today", { cls: "ok", tile: "ft-s-ok", icon: G.check })}<h3 class="tc-h">${esc(s?.name || d.name || `${SPORT(d.sport)}`)}</h3>
      <p class="ft-meta">Started ${hm(d.start, tz)}${from}</p>
      ${figs.length ? `<div class="ft-figs">${figs.map(([k, v]) => `<div><small>${k}</small><b>${v}</b></div>`).join("")}</div>` : ""}
      ${nextRow(c.next, c)}
      ${foot(open, send)}`;
  }
  if (c.kind === "rest") {
    // (the rest day's reason, as Fitness gave it: the card's own why, as only a session has a session)
    const why = typeof c.why === "string" && c.why.trim() ? c.why : "";
    return `${hd}${chip("Rest day", { cls: "rest", tile: "ft-s-rest", icon: G.heart })}<h3 class="tc-h">Rest, and let it sink in</h3>${why ? `<p class="ft-why">${esc(why)}</p>` : ""}${nextRow(c.next, c)}${foot(open, send)}`;
  }
  if (c.kind === "event") {
    return `${hd}${chip("Event day", { tile: "ft-s-ride", icon: G.flag })}<h3 class="tc-h">${esc(c.event?.name || s?.name || "Your event")}</h3>${foot(open, send)}`;
  }
  if (c.kind !== "session" || !s) {
    return `${hd}<h3 class="tc-h">No session planned today</h3>${nextRow(c.next, c)}${foot(open)}`;
  }
  const sport = String(s.sport || "ride").toLowerCase(), word = SPORT(sport);
  const meta = [num(s.secs) ? dur(s.secs) : null, num(s.tss) ? `stress ${Math.round(s.tss)}` : null].filter(Boolean).join(" · ");
  return `${hd}${chip(`${word}${s.kind ? ` · ${s.kind}` : ""}`, { icon: sport === "run" ? G.run : G.ride })}<h3 class="tc-h">${esc(s.name)}</h3>${meta ? `<p class="ft-meta">${meta}</p>` : ""}
    ${profile(s.steps, `${s.name}: its shape, step by step`)}
    ${s.why ? `<p class="ft-why"><b>Why today:</b> ${esc(s.why)}</p>` : ""}
    ${bestBox(c.best, tz, now, sport)}
    ${foot(linkPill("Details", c.href, { primary: true }), linkPill("Change", c.href), send)}`;
}

// ---------------------------------------------------------------- Markets
function resample(vals, n) {
  if (vals.length < 2) return Array(n).fill(vals[0] ?? 0);
  return Array.from({ length: n }, (_, i) => { const x = (i / (n - 1)) * (vals.length - 1), a = Math.floor(x), b = Math.min(vals.length - 1, a + 1); return vals[a] + (vals[b] - vals[a]) * (x - a); });
}
function place(vals, w, h, { pad = 12, base = null } = {}) {
  const all = base != null ? [...vals, base] : vals, lo = Math.min(...all), hi = Math.max(...all), span = hi - lo || Math.abs(hi) * 0.01 || 1;
  const y = (v) => pad + (h - 2 * pad) * (1 - (v - lo) / span);
  return { pts: vals.map((v, i) => [(vals.length > 1 ? i / (vals.length - 1) : 0.5) * w, y(v)]), baseY: base != null ? y(base) : null };
}
function smooth(p) {
  if (!p.length) return "";
  let s = `M${p[0][0].toFixed(1)} ${p[0][1].toFixed(1)}`;
  for (let i = 1; i < p.length; i++) { const [x0, y0] = p[i - 1], [x1, y1] = p[i]; s += ` Q${x0.toFixed(1)} ${y0.toFixed(1)} ${((x0 + x1) / 2).toFixed(1)} ${((y0 + y1) / 2).toFixed(1)}`; }
  const l = p[p.length - 1];
  return `${s} L${l[0].toFixed(1)} ${l[1].toFixed(1)}`;
}
const area = (p, h) => (p.length ? `${smooth(p)} L${p[p.length - 1][0].toFixed(1)} ${h} L${p[0][0].toFixed(1)} ${h} Z` : "");
function spark(s) {
  const vals = (Array.isArray(s?.vals) ? s.vals : []).map(Number).filter(Number.isFinite);
  if (vals.length < 2 || num(s.base) == null) return "";
  const up = vals[vals.length - 1] >= s.base, W = 300, H = 54, { pts, baseY } = place(resample(vals, 48), W, H, { pad: 4, base: s.base });
  return `<svg class="mk-spark ${up ? "is-up" : "is-down"}" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true"><path class="ar" d="${area(pts, H)}"/><line class="base" x1="0" x2="${W}" y1="${baseY.toFixed(1)}" y2="${baseY.toFixed(1)}"/><path class="ln" d="${smooth(pts)}"/></svg>`;
}
function bigMoney(v) { const s = money(v), i = s.lastIndexOf("."); return i > 0 ? `${s.slice(0, i)}<span class="mk-p">${s.slice(i)}</span>` : s; }
function markets(c, ctx) {
  const { tz } = ctx, owned = num(c.owned) || 0, following = num(c.following) || 0;
  const meta = owned ? `${owned} holding${owned === 1 ? "" : "s"}` : following ? `Following ${following}` : "";
  const d = c.dividend, isa = c.isa, dv = num(d?.value) || 0;
  // (no pence from £100 up, as Markets says it)
  const divRow = d && num(d.at) != null ? `<a class="mk-crow" href="${href(d.href)}"><span class="ic green">${G.coin}</span><span class="tx"><b>Dividend, around ${dayMonth(d.at, tz)}</b><small>${esc(d.name)}: about ${money(dv, "GBP", dv >= 100 ? 0 : 2)}</small></span><span class="chev">${G.chev}</span></a>` : "";
  const isaRow = isa ? (() => {
    const all = (num(isa.left) || 0) <= 0, used = Math.max(0, Math.min(1, num(isa.used) || 0));
    return `<a class="mk-crow" href="${href(c.href)}"><span class="ic teal">${G.piggy}</span><span class="tx"><b>${all ? "Your ISA allowance is all used" : `${money(isa.left, "GBP", 0)} of your ISA allowance left`}</b><span class="mk-allow" aria-hidden="true"><i ${vars({ used })}></i></span><small>${money(num(isa.paid) || 0, "GBP", 0)} of ${money(num(isa.allowance) || 0, "GBP", 0)} used · ${all ? "it starts again on 6 April" : "till 5 April"}</small></span><span class="chev">${G.chev}</span></a>`;
  })() : "";
  const rows = divRow || isaRow ? `<div class="mk-crows">${divRow}${isaRow}</div>` : "";
  if (!owned) {
    return `${head("markets", c, esc(meta))}<h3 class="tc-h">Nothing you own yet</h3><p class="tc-p">Say how many shares you own on each one’s page in Markets, and Today shows how they’re doing.</p>${rows}${foot(sendPill(c, ctx))}`;
  }
  const m = c.market || {}, shut = Array.isArray(m.shut) ? m.shut.filter((x) => typeof x === "string") : [];
  const said = shut.length ? `${and2(shut)} ${shut.length > 1 ? "are" : "is"} shut today` : String(m.said || "");
  const traded = !!c.traded, change = num(c.change) || 0;
  const left = (Array.isArray(c.leftOut) ? c.leftOut : []).filter((x) => typeof x === "string");
  // (Markets' own words for the day, markets/app.js daySaid: one priced holding said by its own change, two or more by
  // the one that did most and the one that gave back; on a day a market's shut, only that your holdings are as they closed)
  const name = (x) => `<a class="mk-name" href="${href(x.href)}">${esc(x.name)}</a>`, one = owned - left.length === 1 ? c.top || c.low : null;
  let words = "";
  if (traded && Math.abs(change) >= 0.01 && one && num(c.pct) != null) words = `${name(one)} is ${c.pct >= 0 ? "up" : "down"} ${fmt(Math.abs(c.pct))}% today.`;
  else if (traded && Math.abs(change) >= 0.01) {
    const out = [];
    if (c.top && num(c.top.change) > 0) out.push(`${name(c.top)} did most of the work, adding ${money(c.top.change)}.`);
    if (c.low && num(c.low.change) < 0) out.push(`${name(c.low)} ${out.length ? "gave back" : "took away"} ${money(-c.low.change)}.`);
    words = out.join(" ");
  } else words = !traded && shut.length ? "Your holdings are as they closed." : "No change today yet: your holdings are as they closed.";
  const leftSaid = left.length ? `<p class="tc-p mk-left">${esc(`${and2(left)} ${left.length === 1 ? "isn’t" : "aren’t"} in this total: no price for ${left.length === 1 ? "it" : "them"} just now.`)}</p>` : "";
  const aria = `Your portfolio is at ${money(num(c.value) || 0)}${traded ? `, ${change >= 0 ? "up" : "down"} ${money(Math.abs(change))} (${fmt(Math.abs(num(c.pct) || 0))}%) today` : ""}. Open Markets`;
  return `${head("markets", c, esc(meta))}
    <a class="mk-cbig" href="${href(c.href)}" aria-label="${esc(aria)}">
      <span class="mk-k"><span class="mk-dot${m.open ? " on" : ""}"></span>${esc(said)}${c.stale ? " · Prices delayed" : ""}</span>
      <span class="mk-big">${bigMoney(num(c.value) || 0)}</span>
      ${traded ? `<span class="mk-chg"><b class="${tone(change)}">${signed(change)}</b><b class="${tone(change)}">${pct(num(c.pct))}</b><span>today</span></span>${spark(c.spark)}` : ""}
    </a>
    <p class="tc-p mk-said">${words}</p>${leftSaid}
    ${rows}
    ${foot(sendPill(c, ctx))}`;
}

// ---------------------------------------------------------------- each minute, with no fetch: the place's clock, how long
// each pigeon has to go, how far it's come and when it lands or landed (and so the Chat card's title and count), the
// streak's time left, and where now is among the best hours
const setText = (el, s) => { if (el && el.textContent !== s) el.textContent = s; };
export function tick(root, now) {
  for (const el of root.querySelectorAll("[data-wxclock]")) setText(el, placeClock(now, Number(el.dataset.off) || 0, el.dataset.clk));
  for (const row of root.querySelectorAll(".pg-row[data-lands]")) {
    const sent = Number(row.dataset.sent), lands = Number(row.dataset.lands);
    if (!lands) continue;
    const tr = row.querySelector(".pg-track");
    setText(row.querySelector("[data-togo]"), togoSaid(lands, now));
    setText(row.querySelector("[data-when]"), whenSaid(lands, now, row.dataset.tz));
    if (tr) {
      tr.style.setProperty("--f", String(Math.max(0, Math.min(1, (now - sent) / Math.max(1, lands - sent)))));
      tr.classList.toggle("done", now >= lands);
    }
  }
  for (const h of root.querySelectorAll("[data-pgtitle]")) {
    const card = h.closest(".tcard") || root, ins = [...card.querySelectorAll(".pg-row.in[data-lands]")];
    const down = ins.filter((r) => Number(r.dataset.lands) <= now), un = Number(h.dataset.unread) || 0, landed = un + down.length;
    setText(h, chatTitle(ins.length - down.length, landed, landed !== 1 ? "" : un ? h.dataset.who1 : down[0].dataset.who));
    const air = ins.length - down.length + [...card.querySelectorAll(".pg-row.mine[data-lands]")].filter((r) => Number(r.dataset.lands) > now).length + (Number(h.dataset.more) || 0);
    setText(card.querySelector(".tc-meta"), air ? `${air} in the air` : "");
  }
  for (const el of root.querySelectorAll("[data-ends]")) {
    const ends = Number(el.dataset.ends), row = el.closest(".pg-streak");
    setText(el, streakSaid(ends, now));
    if (row) row.hidden = ends <= now;
  }
  for (const el of root.querySelectorAll(".ft-bt-now")) {
    const t0 = Number(el.dataset.t0), n = Number(el.dataset.n), p = ((now - t0) / (n * HR)) * 100;
    el.hidden = !(p > 0 && p < 100);
    el.style.setProperty("--x", String(Math.max(0, Math.min(100, p))));
  }
}
