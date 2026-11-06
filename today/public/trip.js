// Mail on Your Day on Today's page (stage 1: trips and bookings, the admin's alone, read from Mail by rules, no AI): the
// trip card (a version 2 answer's trip: the account's functions/_todayday.js), drawn above Waiting for You; its day-by-day
// view (the trip's bookings under each of its days, with the weather where it goes); Coming Up's rows from Mail ("from
// Mail"); and the sheet a booking opens: Open Email (Mail's own address for its conversation), Weather There (Weather on
// the place, that day) and Hide (gone from the page at once, with Undo while the toast's up; only then sent, POST
// /api/mail/hide, which the account passes to Mail). Everything through esc(), nothing in an inline style.
//   tripOf(answer) → the answer's trip with every field checked (and the bookings hidden here left out), or null
//   tripCardHtml(trip, { now, tz }) → the card (a button, data-do="trip"), or ""
//   tripDaysHtml(trip, { now, tz }) → the day-by-day list (each booking a button, data-do="booking" data-bid)
//   bookingRowParts(row) → { glyph, from } for a Coming Up row of Mail's (its kind's glyph and "from Mail")
//   openTrip(trip, h) / openBooking(b, h): the sheets, through h.sheet (the page's InFlite sheet, F.sheet.open);
//     h = { sheet, link(href) → address or null, go(href) (the hub's breadcrumb, as a link's left), toast(text, o),
//     call(path, o), redraw(), tz, now() }
//   isGone(id) → whether a booking's been hidden here (until the page is left)
import { esc, hm, dayKey, dateLong, wkShort, G } from "/cards.js";
import { weatherIcon } from "/wxicons.js";

const ID = /^[A-Za-z0-9_-]{1,64}$/;
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
const GL = {
  mail: sv('<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="m3.5 7 8.5 6 8.5-6"/>'),
  hide: sv('<path d="M3 3l18 18M10.6 6.1A10 10 0 0 1 22 12s-1 2-3 3.8M6.6 6.6C3.9 8.3 2 12 2 12s3.6 7 10 7c1.7 0 3.2-.4 4.5-1.1"/>'),
};
const glyphOf = (kind) => KIND_GLYPH[kind] || KIND_GLYPH.booking;

// ---------------------------------------------------------------- what's been hidden here, and Hide's Undo
// (hidden at once on the page; sent once the toast's Undo has had its time, or as the page is left)
const UNDO_MS = 7000;
const gone = new Map();
export const isGone = (id) => gone.has(id);
function hideBooking(id, h) {
  if (!ID.test(id) || gone.has(id)) return;
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
  g.timer = setTimeout(g.send, UNDO_MS);
  h.toast("Hidden from Your Day", { app: "mail", action: { label: "Undo", run: () => {
    if (g.sent) { h.toast("It’s already off Your Day. Put it back from its email in Mail.", { app: "mail" }); return; }
    g.undone = true;
    clearTimeout(g.timer);
    gone.delete(id);
    h.redraw();
  } } });
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
    ref: str(b.ref, 24) || null, href: str(b.href, 400) || null, wx: str(b.wx, 400) || null };
}
export function tripOf(answer) {
  const t = answer?.trip;
  if (!t || typeof t !== "object" || !ID.test(str(t.id)) || !str(t.name).trim() || num(t.start) == null) return null;
  const items = (Array.isArray(t.items) ? t.items : []).map(bookingOf).filter((b) => b && !gone.has(b.id)).sort((a, b) => a.start - b.start);
  if (!items.length) return null;
  const days = (Array.isArray(t.days) ? t.days : []).filter((d) => d && DAY.test(str(d.day))).slice(0, 21).map((d) => ({
    day: d.day, hi: str(d.hi, 12), lo: str(d.lo, 12), icon: /^[a-z-]{1,24}$/.test(str(d.icon)) ? d.icon : "", label: str(d.label, 40), said: str(d.said, 80) }));
  return { id: t.id, name: str(t.name, 60), start: t.start, end: num(t.end) ?? t.start, tz: zoneOk(t.tz) ? t.tz : null, apart: num(t.apart), href: str(t.href, 400) || null,
    destination: str(t.destination?.name, 60) || str(t.name, 60), items, days };
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
  for (const b of trip.items) {
    const k = keyOf(b);
    if (!byDay.has(k)) byDay.set(k, []);
    byDay.get(k).push(b);
  }
  const wxOf = new Map(trip.days.map((d) => [d.day, d]));
  return `<div class="group glass tv-list">${[...byDay.keys()].sort().map((d) => {
    const w = wxOf.get(d), list = byDay.get(d);
    const said = w?.hi ? `${w.hi}${w.said ? ` ${w.said}` : ""}` : "";
    return `<h3 class="tv-day"><span>${esc(dayHead(d))}</span>${said ? `<span class="tv-wx">${w.icon ? weatherIcon(w.icon, 18, w.label) : ""}${esc(said)}</span>` : ""}</h3>${list.length
      ? list.map((b) => `<button type="button" class="row tv-row" data-do="booking" data-bid="${esc(b.id)}"><span class="bk-ic">${glyphOf(b.kind)}</span><span class="tx"><b>${esc(b.title)}</b>${b.sub ? `<small>${esc(b.sub)}</small>` : ""}</span><span class="tv-tm">${esc(hm(b.start, zoneFor(b, trip, z)))}</span></button>`).join("")
      : '<p class="tv-none">Nothing booked</p>'}`;
  }).join("")}</div>`;
}

// ---------------------------------------------------------------- Coming Up's rows from Mail
export const bookingRowParts = (r) => ({ glyph: `<span class="dc-ic bk-ic">${glyphOf(r.kind)}</span>`, from: '<span class="dc-from"><i></i>from Mail</span>' });
// (a Coming Up row of Mail's as a booking: its id from the row's, booking)
export function bookingOfRow(r) {
  const id = ID.test(str(r?.booking)) ? r.booking : null;
  if (!id || num(r.at) == null || !str(r.title)) return null;
  return { id, kind: KINDS.includes(r.kind) ? r.kind : "booking", title: str(r.title, 80), sub: str(r.sub, 120), start: r.at, end: null, tz: null,
    place: str(r.place) ? { name: str(r.place, 60) } : null, ref: str(r.ref, 24) || null, href: str(r.href, 400) || null, wx: str(r.wx, 400) || null };
}

// ---------------------------------------------------------------- the sheets
function html(s) {
  const t = document.createElement("template");
  t.innerHTML = s;
  return t.content;
}
// (a booking's sheet, or page of the trip's: what and when, then Open Email, Weather There, Hide)
function bookingBody(b, trip, h) {
  const z = zoneFor(b, trip, h.tz), when = `${dateLong(b.start, z)} · ${hm(b.start, z)}${b.ref ? ` · ref ${b.ref}` : ""}`;
  const email = b.href ? h.link(b.href) : null, wx = b.wx ? h.link(b.wx) : null;
  const where = trip ? trip.destination : b.place?.name || "";
  const box = html(`<div class="bk-sheet">
    ${b.sub ? `<p class="bk-p">${esc(b.sub)}</p>` : ""}<p class="bk-when">${esc(when)}</p>
    <div class="bk-acts">
      ${email ? `<a class="bk-act go" href="${esc(email)}" data-bk="open">${GL.mail}<span>Open Email</span></a>` : ""}
      ${wx ? `<a class="bk-act" href="${esc(wx)}" data-bk="open">${G.sun}<span>${esc(where ? `Weather in ${where} That Day` : "Weather There That Day")}</span></a>` : ""}
      <button type="button" class="bk-act" data-bk="hide">${GL.hide}<span>Hide From Your Day</span></button>
    </div>
    <p class="bk-how">From the booking’s email, read by Mail.</p>
  </div>`);
  return box;
}
function wireBooking(root, b, h, handle) {
  root.addEventListener("click", (e) => {
    const el = e.target.closest?.("[data-bk]");
    if (!el) return;
    if (el.dataset.bk === "open") { try { h.go?.(el.getAttribute("href")); } catch {} return; }
    if (el.dataset.bk === "hide") { e.preventDefault(); handle?.close(); hideBooking(b.id, h); }
  });
}
export function openBooking(b, h) {
  if (!b || typeof h?.sheet !== "function") return null;
  const handle = h.sheet({ sheet: "booking", title: b.title, app: "mail", body: (el, hd) => { el.append(bookingBody(b, null, h)); wireBooking(el, b, h, hd); } });
  return handle;
}
export function openTrip(trip, h) {
  if (!trip || typeof h?.sheet !== "function") return null;
  const n = trip.days.length || 1, z = h.tz || "Europe/London";
  const head = [datesSaid(trip, z), apartSaid(trip.apart)].filter(Boolean).join(" · ");
  return h.sheet({ sheet: "trip", title: `${trip.name} · ${n} ${n === 1 ? "day" : "days"}`, app: "mail", body: (el, hd) => {
    el.append(html(`<p class="tv-head">${esc(head)}</p>${tripDaysHtml(trip, { now: h.now?.(), tz: z })}`));
    el.addEventListener("click", (e) => {
      const row = e.target.closest?.(".tv-row[data-bid]");
      if (!row || row.closest(".ifs-page")) return;
      const b = trip.items.find((x) => x.id === row.dataset.bid);
      if (!b) return;
      const pg = hd.push({ page: "booking", title: b.title, body: bookingBody(b, trip, h) });
      wireBooking(pg, b, h, hd);
    });
  } });
}
