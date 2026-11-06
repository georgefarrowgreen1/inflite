// Mail on Your Day on Today's page (stage 1: trips and bookings, the admin's alone, read from Mail by rules, no AI): the
// trip card (a version 2 answer's trip: the account's functions/_todayday.js), drawn above Waiting for You; its day-by-day
// view (the trip's bookings under each of its days, with the weather where it goes); Coming Up's rows from Mail (Mail's
// teal icon with a small envelope on it, the time on the right); and the sheet a booking opens: Open Email (Mail's own
// address for its conversation), Weather There (Weather on the place, that day) and Hide (gone from the page at once,
// with Undo while the toast's up; only then sent, POST /api/mail/hide, which the account passes to Mail). Stage 3: a
// hidden booking stays in its day in the trip, faded, with Put Back (POST /api/mail/unhide, at once, Undo-free), and the
// trip says how many are hidden; a repeating invite's sheet lists its next dates (one cancelled struck through, one moved
// at its new time), and its Hide hides every date of it. Everything through esc(), nothing in an inline style.
//   tripOf(answer) → the answer's trip with every field checked (the bookings hidden, by Mail or here, as hidden), or null
//   tripCardHtml(trip, { now, tz }) → the card (a button, data-do="trip"), or ""
//   tripDaysHtml(trip, { now, tz }) → the day-by-day list (each booking a button, data-do="booking" data-bid; each hidden
//     one a row with Put Back, data-tv="back")
//   mailIcon(glyph) → Mail's teal icon with its envelope; bookingRowParts(row) → { glyph } for a Coming Up row of Mail's;
//   seriesHtml(booking, tz) → a repeating invite's next dates
//   openTrip(trip, h) / openBooking(b, h): the sheets, through h.sheet (the page's InFlite sheet, F.sheet.open);
//     h = { sheet, link(href) → address or null, go(href) (the hub's breadcrumb, as a link's left), toast(text, o),
//     call(path, o), redraw(), trip() (the trip as it now stands), tz, now() }
//   hideItem(id, h, { said }) → a booking, parcel or bill hidden here (and sent once Undo's time is up); isGone(id) →
//     whether it's been hidden here (a repeating invite's date: any of its series), until the page is left
import { esc, hm, dayKey, dateLong, wkShort, G } from "/cards.js";
import { weatherIcon } from "/wxicons.js";

// (Mail's ids, and a repeating invite's dates: <series>~<yyyymmdd>)
const ID = /^[A-Za-z0-9_~-]{1,64}$/;
const KINDS = ["flight", "train", "bus", "hotel", "car", "restaurant", "event", "booking"];
const TRAVEL = ["flight", "train", "bus"];
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const str = (v, n = 200) => (typeof v === "string" ? v.slice(0, n) : "");
const zoneOk = (tz) => { if (typeof tz !== "string" || !tz) return false; try { new Intl.DateTimeFormat("en-GB", { timeZone: tz }); return true; } catch { return false; } };

// ---------------------------------------------------------------- glyphs, one per kind of booking
const sv = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
export const KIND_GLYPH = {
  flight: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M21 15.5v-1.8l-8-5V3.5a1.5 1.5 0 0 0-3 0v5.2l-8 5v1.8l8-2.5v5.2l-2 1.5V21l3.5-1 3.5 1v-1.3l-2-1.5V13z"/></svg>',
  train: sv('<rect x="5" y="3" width="14" height="14" rx="3"/><path d="M5 11h14M9 21l1.5-4M15 21l-1.5-4"/><path d="M9 14h.01M15 14h.01"/>'),
  bus: sv('<rect x="4" y="3" width="16" height="15" rx="3"/><path d="M4 11h16M7 21v-3M17 21v-3"/><path d="M8 15h.01M16 15h.01"/>'),
  hotel: sv('<path d="M3 18V7M3 14h18v4M21 14v-2a3 3 0 0 0-3-3h-7v5"/><circle cx="7" cy="11" r="1.6"/>'),
  car: sv('<path d="M5 16V11l2-5h10l2 5v5"/><path d="M3 16h18v3H3zM5 11h14"/><path d="M7.5 13.5h.01M16.5 13.5h.01"/>'),
  restaurant: sv('<path d="M7 3v8M5 3v5a2 2 0 0 0 4 0V3M7 11v10M16 3c-2 2-2 6 0 8v10"/>'),
  event: sv('<path d="M3 10a2 2 0 0 0 0 4v4h18v-4a2 2 0 0 1 0-4V6H3z"/><path d="M14 6v12" stroke-dasharray="2 2"/>'),
  booking: sv('<rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>'),
};
export const GL = {
  mail: sv('<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="m3.5 7 8.5 6 8.5-6"/>'),
  hide: sv('<path d="M3 3l18 18M10.6 6.1A10 10 0 0 1 22 12s-1 2-3 3.8M6.6 6.6C3.9 8.3 2 12 2 12s3.6 7 10 7c1.7 0 3.2-.4 4.5-1.1"/>'),
};
const glyphOf = (kind) => KIND_GLYPH[kind] || KIND_GLYPH.booking;
// (Mail's teal icon, with the small envelope that says it came from Mail, in place of a "from Mail" line)
const VIA = '<i class="ml-via"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="m3.5 7 8.5 6 8.5-6"/></svg></i>';
export const mailIcon = (glyph, cls = "") => `<span class="ml-ic${cls ? ` ${cls}` : ""}">${glyph}${VIA}</span>`;

// ---------------------------------------------------------------- what's been hidden here, and Hide's Undo
// (hidden at once on the page; sent once the toast's Undo has had its time, or as the page is left)
const UNDO_MS = 7000;
const gone = new Map();
// (the bookings put back here, from Mail's hidden: shown again until the page is left)
const back = new Set();
const seriesOf = (id) => (typeof id === "string" && id.includes("~") ? id.slice(0, id.indexOf("~")) : null);
export const isGone = (id) => gone.has(id) || (!!seriesOf(id) && [...gone.keys()].some((k) => seriesOf(k) === seriesOf(id)));
export function hideItem(id, h, { said = "Hidden" } = {}) {
  if (!ID.test(id) || isGone(id)) return;
  const g = { sent: false, undone: false, timer: 0 };
  gone.set(id, g);
  h.redraw();
  g.send = () => {
    if (g.sent || g.undone) return;
    g.sent = true;
    clearTimeout(g.timer);
    Promise.resolve().then(() => h.call("/api/mail/hide", { method: "POST", body: { id } })).catch((e) => {
      // (not done: back on the page, and said; signed out meanwhile, the page's own way out of a 401 says that)
      gone.delete(id);
      h.redraw();
      if (e?.status !== 401) h.toast(e?.message || "Couldn’t hide it just now. Try again in a moment.", { app: "mail" });
    });
  };
  g.undo = () => {
    if (g.sent) return false;
    g.undone = true;
    clearTimeout(g.timer);
    gone.delete(id);
    h.redraw();
    return true;
  };
  g.timer = setTimeout(g.send, UNDO_MS);
  h.toast(said, { app: "mail", action: { label: "Undo", run: () => { if (!g.undo()) h.toast("Already hidden", { app: "mail" }); } } });
}
// Put Back: one hidden here whose Undo's still to come, undone; one hidden for good (here, or by Mail), put back in Mail
// at once (POST /api/mail/unhide) and shown again; said where it can't be
function putBack(id, h) {
  const g = gone.get(id);
  if (g?.undo?.()) return;
  Promise.resolve().then(() => h.call("/api/mail/unhide", { method: "POST", body: { id } })).then(() => {
    gone.delete(id);
    back.add(id);
    h.redraw();
    h.toast("Back on Your Day", { app: "mail" });
  }, (e) => { if (e?.status !== 401) h.toast(e?.message || "Couldn’t put it back just now. Try again in a moment.", { app: "mail" }); });
}
// (a Hide still waiting for its Undo's time as the page is left: sent then, so it isn't lost)
if (typeof addEventListener === "function") {
  addEventListener("pagehide", () => {
    for (const [id, g] of gone) {
      if (g.sent || g.undone) continue;
      g.sent = true;
      clearTimeout(g.timer);
      try {
        fetch("/api/mail/hide", { method: "POST", keepalive: true, credentials: "same-origin", headers: { "Content-Type": "application/json", Accept: "application/json", "X-Inflite": "1" }, body: JSON.stringify({ id }) }).catch(() => {});
      } catch {}
    }
  });
}

// ---------------------------------------------------------------- the answer's trip, checked
function bookingOf(b) {
  if (!b || typeof b !== "object" || !ID.test(str(b.id)) || !KINDS.includes(b.kind) || !str(b.title).trim() || num(b.start) == null) return null;
  const place = b.place && typeof b.place === "object" && str(b.place.name) ? { name: str(b.place.name, 60) } : null;
  return { id: b.id, kind: b.kind, title: str(b.title, 80), sub: str(b.sub, 120), start: b.start, end: num(b.end), tz: zoneOk(b.tz) ? b.tz : null, place,
    ref: str(b.ref, 24) || null, href: str(b.href, 400) || null, wx: str(b.wx, 400) || null, ...seriesFields(b) };
}
// (a repeating invite's date: how it repeats, the series' next dates (at most 5: { start, cancelled, was }), and where
// this one was moved from)
function seriesFields(b) {
  const repeat = str(b.repeat, 40).trim();
  if (!repeat) return num(b.was) != null ? { was: b.was } : {};
  const next = (Array.isArray(b.next) ? b.next : []).filter((n) => n && typeof n === "object" && num(n.start) != null).slice(0, 5)
    .map((n) => ({ start: n.start, cancelled: n.cancelled === true, was: num(n.was) }));
  return { repeat, next, ...(num(b.was) != null ? { was: b.was } : {}) };
}
export function tripOf(answer) {
  const t = answer?.trip;
  if (!t || typeof t !== "object" || !ID.test(str(t.id)) || !str(t.name).trim() || num(t.start) == null) return null;
  const all = (Array.isArray(t.items) ? t.items : []).map(bookingOf).filter(Boolean);
  // (Mail's hidden, those put back here shown again, as bookings of no kind it said)
  const was = (Array.isArray(t.hidden) ? t.hidden : []).filter((b) => b && ID.test(str(b.id)) && str(b.title).trim() && num(b.start) != null && !all.some((x) => x.id === b.id))
    .slice(0, 10).map((b) => ({ id: b.id, kind: "booking", title: str(b.title, 80), sub: str(b.sub, 120), start: b.start, end: null, tz: null, place: null, ref: null, href: null, wx: null }));
  const items = [...all, ...was.filter((b) => back.has(b.id))].filter((b) => !isGone(b.id)).sort((a, b) => a.start - b.start);
  const hidden = [...all.filter((b) => isGone(b.id)), ...was.filter((b) => !back.has(b.id) && !items.some((x) => x.id === b.id))].sort((a, b) => a.start - b.start);
  if (!items.length) return null;
  const days = (Array.isArray(t.days) ? t.days : []).filter((d) => d && DAY.test(str(d.day))).slice(0, 21).map((d) => ({
    day: d.day, hi: str(d.hi, 12), lo: str(d.lo, 12), icon: /^[a-z-]{1,24}$/.test(str(d.icon)) ? d.icon : "", label: str(d.label, 40), said: str(d.said, 80) }));
  return { id: t.id, name: str(t.name, 60), start: t.start, end: num(t.end) ?? t.start, tz: zoneOk(t.tz) ? t.tz : null, apart: num(t.apart), href: str(t.href, 400) || null,
    destination: str(t.destination?.name, 60) || str(t.name, 60), items, hidden, days };
}

// ---------------------------------------------------------------- words
// (a day key's own words, read at noon UTC so it's that day wherever: "Sat", "Saturday 7", "7 Nov")
const atNoon = (day) => Date.parse(`${day}T12:00:00Z`);
const wkOf = (day) => wkShort(atNoon(day), "UTC");
const dayHead = (day) => new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", weekday: "long", day: "numeric" }).format(atNoon(day));
const dayNum = (t, tz) => { const [y, m, d] = dayKey(t, tz).split("/").reverse().map(Number); return Math.round(Date.UTC(y, m - 1, d) / 864e5); };
// "same time as home", "1 h ahead of home", "5 h 30 min behind home"; "" where it isn't known
export function apartSaid(mins) {
  if (num(mins) == null) return "";
  if (!mins) return "same time as home";
  const a = Math.abs(mins), h = Math.floor(a / 60), m = a % 60;
  return `${h ? `${h} h` : ""}${h && m ? " " : ""}${m ? `${m} min` : ""} ${mins > 0 ? "ahead of" : "behind"} home`;
}
// "Sat 7 – Tue 10 Nov", "Sat 31 Oct – Tue 3 Nov", "Sat 7 Nov"
export function datesSaid(trip, tz) {
  const z = trip.tz || tz, f = (t, o) => new Intl.DateTimeFormat("en-GB", { timeZone: z, ...o }).format(t);
  const a = { wd: f(trip.start, { weekday: "short" }), d: f(trip.start, { day: "numeric" }), m: f(trip.start, { month: "short" }) };
  if (dayKey(trip.start, z) === dayKey(trip.end, z)) return `${a.wd} ${a.d} ${a.m}`;
  const b = { wd: f(trip.end, { weekday: "short" }), d: f(trip.end, { day: "numeric" }), m: f(trip.end, { month: "short" }) };
  return a.m === b.m ? `${a.wd} ${a.d} – ${b.wd} ${b.d} ${b.m}` : `${a.wd} ${a.d} ${a.m} – ${b.wd} ${b.d} ${b.m}`;
}
// "Lisbon today", "Lisbon tomorrow", "Lisbon on Sunday", "In Lisbon"
export function tripHead(trip, now, tz) {
  if (trip.start <= now) return `In ${trip.name}`;
  const d = dayNum(trip.start, tz) - dayNum(now, tz);
  return d <= 0 ? `${trip.name} today` : d === 1 ? `${trip.name} tomorrow` : `${trip.name} on ${new Intl.DateTimeFormat("en-GB", { timeZone: tz, weekday: "long" }).format(trip.start)}`;
}
const zoneFor = (b, trip, tz) => b.tz || trip?.tz || tz;
// (a booking's time, with its day where that isn't today: "07:40", "Sat 07:40")
const whenShort = (b, now, z) => `${dayNum(b.start, z) !== dayNum(now, z) ? `${wkShort(b.start, z)} ` : ""}${hm(b.start, z)}`;

// ---------------------------------------------------------------- the trip card
export function tripCardHtml(trip, { now, tz } = {}) {
  if (!trip) return "";
  const t = num(now) ?? Date.now(), z = tz || "Europe/London";
  const next = trip.items.find((b) => b.start > t);
  const plane = trip.items.some((b) => TRAVEL.includes(b.kind)) ? glyphOf(trip.items.find((b) => TRAVEL.includes(b.kind)).kind) : glyphOf("hotel");
  const sub = [datesSaid(trip, z), apartSaid(trip.apart)].filter(Boolean).join(" · ");
  // (four days of the weather there, from today on)
  const today = dayKey(t, trip.tz || z).split("/").reverse().join("-");
  const wx = trip.days.filter((d) => d.day >= today && d.hi && d.icon).slice(0, 4);
  const nz = next ? zoneFor(next, trip, z) : z;
  return `<h2 class="vh">Your trip</h2><button type="button" class="tcard glass trip-card" data-do="trip" data-trip="${esc(trip.id)}" aria-haspopup="dialog">
    <span class="tp-hd"><span class="tp-ic">${plane}</span><span class="tx"><b class="tp-h">${esc(tripHead(trip, t, z))}</b><small>${esc(sub)}</small></span><span class="chev">${G.chev}</span></span>
    ${next ? `<span class="tp-next"><span class="tp-pill">Booked</span><span class="tx"><b>${esc(next.title)} · ${esc(whenShort(next, t, nz))}</b>${next.sub ? ` <span>${esc(next.sub)}</span>` : ""}</span>${next.ref ? `<span class="tp-ref">ref ${esc(next.ref)}</span>` : ""}</span>` : ""}
    ${wx.length ? `<span class="tp-wx">${wx.map((d) => `<span class="tp-day"><small>${esc(wkOf(d.day))}</small>${weatherIcon(d.icon, 22, d.label)}<b>${esc(d.hi)}</b></span>`).join("")}</span>` : ""}
  </button>`;
}

// ---------------------------------------------------------------- the trip, day by day
export function tripDaysHtml(trip, { now, tz } = {}) {
  if (!trip) return "";
  const z = tz || "Europe/London", dz = trip.tz || z;
  const keyOf = (b) => dayKey(b.start, dz).split("/").reverse().join("-");
  const days = trip.days.length ? trip.days.map((d) => d.day) : [...new Set(trip.items.map(keyOf))];
  const byDay = new Map(days.map((d) => [d, []]));
  // (each hidden one in its day too, faded, with Put Back)
  for (const b of [...trip.items, ...(trip.hidden || []).map((x) => ({ ...x, hid: true }))].sort((a, b) => a.start - b.start)) {
    const k = keyOf(b);
    if (!byDay.has(k)) byDay.set(k, []);
    byDay.get(k).push(b);
  }
  const wxOf = new Map(trip.days.map((d) => [d.day, d]));
  const row = (b) => b.hid
    ? `<div class="row tv-row tv-hid" data-hid="${esc(b.id)}"><span class="bk-ic">${GL.hide}</span><span class="tx"><b>${esc(b.title)}</b><small>Hidden</small></span><button type="button" class="tv-back" data-tv="back" data-bid="${esc(b.id)}">Put Back</button></div>`
    : `<button type="button" class="row tv-row" data-do="booking" data-bid="${esc(b.id)}">${mailIcon(glyphOf(b.kind), "bk-ic")}<span class="tx"><b>${esc(b.title)}</b>${b.sub ? `<small>${esc(b.sub)}</small>` : ""}</span><span class="tv-tm">${esc(hm(b.start, zoneFor(b, trip, z)))}</span></button>`;
  return `<div class="group glass tv-list">${[...byDay.keys()].sort().map((d) => {
    const w = wxOf.get(d), list = byDay.get(d);
    const said = w?.hi ? `${w.hi}${w.said ? ` ${w.said}` : ""}` : "";
    return `<h3 class="tv-day"><span>${esc(dayHead(d))}</span>${said ? `<span class="tv-wx">${w.icon ? weatherIcon(w.icon, 18, w.label) : ""}${esc(said)}</span>` : ""}</h3>${list.length
      ? list.map(row).join("") : '<p class="tv-none">Nothing booked</p>'}`;
  }).join("")}</div>`;
}

// ---------------------------------------------------------------- Coming Up's rows from Mail
export const bookingRowParts = (r) => ({ glyph: mailIcon(glyphOf(r.kind), "dc-ic") });
// (a Coming Up row of Mail's as a booking: its id from the row's, booking)
export function bookingOfRow(r) {
  const id = ID.test(str(r?.booking)) ? r.booking : null;
  if (!id || num(r.at) == null || !str(r.title)) return null;
  return { id, kind: KINDS.includes(r.kind) ? r.kind : "booking", title: str(r.title, 80), sub: str(r.sub, 120), start: r.at, end: null, tz: null,
    place: str(r.place) ? { name: str(r.place, 60) } : null, ref: str(r.ref, 24) || null, href: str(r.href, 400) || null, wx: str(r.wx, 400) || null, ...seriesFields(r) };
}

// ---------------------------------------------------------------- the sheets
function html(s) {
  const t = document.createElement("template");
  t.innerHTML = s;
  return t.content;
}
// (a repeating invite's next dates: the day, the time (a moved one's new time, "moved"), Next and Off)
export function seriesHtml(b, z) {
  if (!b.repeat || !b.next?.length) return "";
  const first = b.next.find((n) => !n.cancelled);
  return `<div class="group glass bk-occ">${b.next.map((n) => {
    const f = (o) => new Intl.DateTimeFormat("en-GB", { timeZone: z, ...o }).format(n.start), d = `${f({ weekday: "short" })} ${f({ month: "short" }).slice(0, 3)}`, day = f({ day: "numeric" });
    const moved = n.was != null && !n.cancelled;
    return `<div class="bk-o${n.cancelled ? " off" : ""}"><span class="bk-od"><small>${esc(d)}</small><b>${esc(day)}</b></span><span class="tx"><b>${esc(hm(n.start, z))}</b>${moved ? ' <span class="chg">moved</span>' : ""}${moved ? `<small>was ${esc(hm(n.was, z))}</small>` : ""}</span>${n.cancelled ? '<span class="bk-pill off">Off</span>' : n === first ? '<span class="bk-pill">Next</span>' : ""}</div>`;
  }).join("")}</div>`;
}
// (a booking's sheet, or page of the trip's: what and when, then Open Email, Weather There, Hide; a repeating invite's
// with its next dates)
function bookingBody(b, trip, h) {
  const z = zoneFor(b, trip, h.tz), when = `${dateLong(b.start, z)} · ${hm(b.start, z)}${b.ref ? ` · ref ${b.ref}` : ""}`;
  const email = b.href ? h.link(b.href) : null, wx = b.wx ? h.link(b.wx) : null;
  const where = trip ? trip.destination : b.place?.name || "";
  // (a repeating invite's sub, without how it repeats at its end: that's the line under it)
  const tail = b.repeat ? ` · ${b.repeat}` : "", sub = !b.repeat ? b.sub : b.sub.endsWith(tail) ? b.sub.slice(0, -tail.length) : b.sub === b.repeat ? "" : b.sub;
  const box = html(`<div class="bk-sheet">
    ${sub ? `<p class="bk-p">${esc(sub)}</p>` : ""}<p class="bk-when">${esc(b.repeat ? `${b.repeat.charAt(0).toUpperCase()}${b.repeat.slice(1)} · ${hm(b.start, z)}` : when)}</p>
    ${seriesHtml(b, z)}
    <div class="bk-acts">
      ${email ? `<a class="bk-act go" href="${esc(email)}" data-bk="open">${GL.mail}<span>Open Email</span></a>` : ""}
      ${wx ? `<a class="bk-act" href="${esc(wx)}" data-bk="open">${G.sun}<span>${esc(where ? `Weather in ${where} That Day` : "Weather There That Day")}</span></a>` : ""}
      <button type="button" class="bk-act" data-bk="hide">${GL.hide}<span>Hide</span></button>
    </div>
  </div>`);
  return box;
}
function wireBooking(root, b, h, handle) {
  root.addEventListener("click", (e) => {
    const el = e.target.closest?.("[data-bk]");
    if (!el) return;
    if (el.dataset.bk === "open") { try { h.go?.(el.getAttribute("href")); } catch {} return; }
    if (el.dataset.bk === "hide") { e.preventDefault(); handle?.close(); hideItem(b.id, h); }
  });
}
export function openBooking(b, h) {
  if (!b || typeof h?.sheet !== "function") return null;
  const handle = h.sheet({ sheet: "booking", title: b.title, app: "mail", body: (el, hd) => { el.append(bookingBody(b, null, h)); wireBooking(el, b, h, hd); } });
  return handle;
}
// (the trip's sheet: its dates and the time there, how many of its bookings are hidden, and its days; drawn again in
// place after a Hide or a Put Back, from the trip as it now stands)
let tripShown = null;
function tripBody(trip, h) {
  const z = h.tz || "Europe/London", n = trip.hidden?.length || 0;
  const head = [datesSaid(trip, z), apartSaid(trip.apart)].filter(Boolean).join(" · ");
  return html(`<p class="tv-head"><span>${esc(head)}</span>${n ? `<span class="tv-cnt">${n} hidden</span>` : ""}</p>${tripDaysHtml(trip, { now: h.now?.(), tz: z })}`);
}
export function redrawTrip() {
  const s = tripShown;
  if (!s || s.hd.closed || !s.el.isConnected) { tripShown = null; return; }
  const trip = s.h.trip?.();
  if (!trip) return;
  s.trip = trip;
  s.box.replaceChildren(tripBody(trip, s.h));
}
export function openTrip(trip, h) {
  if (!trip || typeof h?.sheet !== "function") return null;
  const n = trip.days.length || 1;
  // (a Hide or a Put Back from inside it draws the day and the trip again)
  const hh = { ...h, redraw: () => { h.redraw(); redrawTrip(); } };
  return h.sheet({ sheet: "trip", title: `${trip.name} · ${n} ${n === 1 ? "day" : "days"}`, app: "mail", body: (el, hd) => {
    const box = document.createElement("div");
    box.className = "tv-box";
    box.append(tripBody(trip, hh));
    el.append(box);
    tripShown = { el, hd, h: hh, box, trip };
    el.addEventListener("click", (e) => {
      const pb = e.target.closest?.('[data-tv="back"]');
      if (pb && !pb.closest(".ifs-page")) { e.preventDefault(); putBack(pb.dataset.bid, hh); return; }
      const row = e.target.closest?.(".tv-row[data-do='booking'][data-bid]");
      if (!row || row.closest(".ifs-page")) return;
      const b = tripShown?.trip.items.find((x) => x.id === row.dataset.bid);
      if (!b) return;
      const pg = hd.push({ page: "booking", title: b.title, body: bookingBody(b, tripShown.trip, hh) });
      pg.addEventListener("click", (e2) => {
        const el2 = e2.target.closest?.("[data-bk]");
        if (!el2) return;
        if (el2.dataset.bk === "open") { try { hh.go?.(el2.getAttribute("href")); } catch {} return; }
        // (hidden from inside the trip: back to its days, where it stays, faded, with Put Back)
        if (el2.dataset.bk === "hide") { e2.preventDefault(); hd.pop(); hideItem(b.id, hh); }
      });
    });
  } });
}
