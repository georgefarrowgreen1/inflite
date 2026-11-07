// Mail on Your Day, stage 1: trips and bookings spotted in mail, for Today (the account's server asks for them with the
// card, connect.js). By rules alone, and on Mail's own server: no AI of any kind, nothing sent anywhere to be read. An
// email that can't be read is left alone, never guessed at. In this order of trust:
//   1. the booking details a sender puts in its email in schema.org's form (the form Gmail and Outlook read): JSON-LD
//      (<script type="application/ld+json">) and microdata (itemscope / itemtype / itemprop), its Reservations
//      (https://developers.google.com/gmail/markup/reference: flights, trains, buses, hotels, cars, tables, events);
//   2. a calendar invite (a text/calendar part, or an .ics file): its VEVENTs;
//   3. nothing else, in stage 1.
// Each booking is one row of spots per leg, kept by a stable id made from what names the booking (its reference and
// leg, or the invite's UID), so a later email for the same one (a new time, a cancellation) changes it rather than
// adding another; an older email never undoes a newer one (mail_date). Kept only while the switch in Mail's Settings is
// on ("Spot in your mail" → "Trips and bookings", meta spot_trips): turned on, the last 60 days are read back, a few
// emails at a time (readBack, from the switch and the scheduled run), without holding anything up.
// Stage 3: a repeating invite is one row with its rule (repeat.js), each of its dates its own on Today's card, and a
// later email moving or cancelling one date kept beside it (spot_occ). Stage 2: parcels (parcels.js) and bills
// (bills.js), each behind its own switch ("Parcels and returns", "Bills and subscriptions"), read only from mail whose
// DMARC passed for its sender; this file reads each email for every switch that's on, and answers the card and the strip.
import { ensureSchema } from "./db.js";
import { parseRule, expand, lastOf, repeatWords, dayKey } from "./repeat.js";
import { parcelsOf, keepParcels, parcelsCard, threadParcels, domainOf, sameSender } from "./parcels.js";
import { billsOf, keepBills, billsCard, threadBills } from "./bills.js";

const H = 3600e3, DAY = 864e5;
const KINDS = {
  FlightReservation: "flight", TrainReservation: "train", BusReservation: "bus", LodgingReservation: "hotel",
  RentalCarReservation: "car", FoodEstablishmentReservation: "restaurant", EventReservation: "event",
};
export const TRAVEL = new Set(["flight", "train", "bus"]);
// (a booking's, a parcel's or a bill's; one date of a repeating invite's is its series' and the date: <id>~<yyyymmdd>)
export const ID_RE = /^[A-Za-z0-9_~-]{1,64}$/;

// ---------------------------------------------------------------------------------------------------------------------
// Plain text, bounded
// ---------------------------------------------------------------------------------------------------------------------
const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—", rarr: "→", hellip: "…" };
export function entities(s) {
  return String(s).replace(/&(#x[0-9a-f]{1,6}|#\d{1,7}|[a-z]{2,8});/gi, (m, e) => {
    if (e[0] === "#") {
      const n = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return n > 0 && n < 0x110000 && !(n >= 0xd800 && n < 0xe000) ? String.fromCodePoint(n) : "";
    }
    return ENT[e.toLowerCase()] ?? m;
  });
}
// (no markup, no control characters, one line)
export const plain = (s) => entities(String(s ?? "").replace(/<[^<>]*>/g, " ")).replace(/[\u0000-\u001f\u007f\u200b-\u200f\u2028-\u202e]/g, " ").replace(/\s+/g, " ").trim();
// (of a long one, its first 2000 characters: no more is ever shown)
export const cut = (s, n) => { s = plain(String(s ?? "").slice(0, Math.max(2000, n))); return s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s; };
const one = (v) => (Array.isArray(v) ? v.find((x) => x != null && x !== "") : v);
const obj = (v) => { v = one(v); return v && typeof v === "object" ? v : null; };
// (a value as words: a string or number, or a thing's name)
function str(v) {
  v = one(v);
  if (v && typeof v === "object") v = one(v.name) ?? one(v["@value"]) ?? "";
  if (v && typeof v === "object") v = one(v["@value"]) ?? "";
  return typeof v === "string" || typeof v === "number" ? plain(String(v).slice(0, 2000)) : "";
}
const typesOf = (o) => [].concat(o?.["@type"] ?? []).map((t) => String(t).replace(/^.*[/#:]/, ""));
const kindOf = (o) => KINDS[typesOf(o).find((t) => KINDS[t])] || null;
const num = (v) => { const n = Number(str(v)); return Number.isFinite(n) ? n : null; };
const geoOf = (place) => {
  const g = obj(place?.geo);
  const lat = num(g?.latitude), lon = num(g?.longitude);
  return lat != null && lon != null && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 && (lat || lon) ? { lat, lon } : null;
};

// ---------------------------------------------------------------------------------------------------------------------
// Times. A time with its offset is that moment; with none, the zone the booking gives (a calendar invite's TZID); with
// none of that either, the account's zone (schema.org gives an airport or a hotel no zone of its own, so the only zone
// a booking's bare "2026-11-07T07:40:00" can be read in without guessing at one is the account's: zoneOf). The wall
// time as the email wrote it is kept for the words (07:40 at the airport, as the ticket says).
// ---------------------------------------------------------------------------------------------------------------------
export function okZone(z) {
  if (typeof z !== "string" || !z || z.length > 64) return false;
  try { new Intl.DateTimeFormat("en-GB", { timeZone: z }); return true; } catch { return false; }
}
const partsFmt = new Map();
export function zoneParts(t, zone) {
  let f = partsFmt.get(zone);
  if (!f) partsFmt.set(zone, (f = new Intl.DateTimeFormat("en-US", { timeZone: zone, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric" })));
  const p = Object.fromEntries(f.formatToParts(t).map((x) => [x.type, Number(x.value)]));
  return { y: p.year, mo: p.month, d: p.day, hh: p.hour % 24, mi: p.minute, ss: p.second };
}
// (a wall time in a zone, as a moment)
export function zonedMs(y, mo, d, hh, mi, ss, zone) {
  const wall = Date.UTC(y, mo - 1, d, hh, mi, ss);
  let t = wall;
  for (let i = 0; i < 3; i++) {
    const p = zoneParts(t, zone);
    const off = Date.UTC(p.y, p.mo - 1, p.d, p.hh, p.mi, p.ss) - t;
    const next = wall - off;
    if (next === t) break;
    t = next;
  }
  return t;
}
const validDate = (y, mo, d) => { const x = new Date(Date.UTC(y, mo - 1, d)); return y >= 1990 && y <= 2200 && x.getUTCMonth() === mo - 1 && x.getUTCDate() === d; };
const ISO = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:[.,]\d+)?)?)?\s*(Z|[+-]\d{2}(?::?\d{2})?)?$/i;
// → { ms, wall: { y, mo, d, hh, mi } | null, dateOnly } | null
export function timeOf(v, zone) {
  const s = str(v);
  if (!s) return null;
  const m = ISO.exec(s);
  if (!m) return null;
  const [y, mo, d] = [m[1], m[2], m[3]].map(Number);
  if (!validDate(y, mo, d)) return null;
  const dateOnly = m[4] === undefined;
  const hh = Number(m[4] || 0), mi = Number(m[5] || 0), ss = Number(m[6] || 0);
  if (hh > 23 || mi > 59 || ss > 60) return null;
  const off = m[7];
  if (off && !dateOnly) {
    let mins = 0;
    if (!/^z$/i.test(off)) {
      const o = /^([+-])(\d{2}):?(\d{2})?$/.exec(off);
      mins = (o[1] === "-" ? -1 : 1) * (Number(o[2]) * 60 + Number(o[3] || 0));
      if (Math.abs(mins) > 14 * 60) return null;
    }
    const ms = Date.UTC(y, mo - 1, d, hh, mi, ss) - mins * 60e3;
    return { ms, wall: /^z$/i.test(off) ? null : { y, mo, d, hh, mi }, dateOnly: false };
  }
  // (no offset: the account's zone, as above)
  return { ms: zonedMs(y, mo, d, hh, mi, ss, zone), wall: { y, mo, d, hh, mi }, dateOnly };
}
const pad = (n) => String(n).padStart(2, "0");
const wallOf = (t, zone) => t.wall || zoneParts(t.ms, zone);
export const hm = (t, zone) => { if (!t || t.dateOnly) return ""; const w = wallOf(t, zone); return `${pad(w.hh)}:${pad(w.mi)}`; };
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"], MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const dayOf = (t, zone) => { if (!t) return ""; const w = wallOf(t, zone); const x = new Date(Date.UTC(w.y, w.mo - 1, w.d)); return `${DAYS[x.getUTCDay()]} ${w.d} ${MONTHS[w.mo - 1]}`; };
const dayNo = (t, zone) => { const w = wallOf(t, zone); return Date.UTC(w.y, w.mo - 1, w.d) / DAY; };
const at = (t, zone) => [dayOf(t, zone), hm(t, zone)].filter(Boolean).join(" ");
// (a date with no time: the day's first moment, or for the end of a stay, its last)
const startOfDay = (t, zone) => (t.dateOnly ? zonedMs(t.wall.y, t.wall.mo, t.wall.d, 0, 0, 0, zone) : t.ms);
const endOfDay = (t, zone) => (t.dateOnly ? zonedMs(t.wall.y, t.wall.mo, t.wall.d + 1, 0, 0, 0, zone) - 1 : t.ms);

// ---------------------------------------------------------------------------------------------------------------------
// Places
// ---------------------------------------------------------------------------------------------------------------------
// (the city an airport's code stands for, for the airports most flown to from the UK and the world's largest: a trip's
// name, "Lisbon", where the booking doesn't name the city itself. Any other is named from what the booking says)
const AIRPORTS = Object.fromEntries(
  ("LHR LGW STN LTN LCY SEN:London|MAN:Manchester|EDI:Edinburgh|GLA:Glasgow|BHX:Birmingham|BRS:Bristol|NCL:Newcastle|LPL:Liverpool|" +
    "BFS BHD:Belfast|ABZ:Aberdeen|EMA:East Midlands|LBA:Leeds|SOU:Southampton|EXT:Exeter|CWL:Cardiff|INV:Inverness|JER:Jersey|GCI:Guernsey|" +
    "DUB:Dublin|ORK:Cork|SNN:Shannon|LIS:Lisbon|OPO:Porto|FAO:Faro|FNC:Funchal|PDL:Ponta Delgada|MAD:Madrid|BCN:Barcelona|AGP:Málaga|PMI:Palma|" +
    "ALC:Alicante|IBZ:Ibiza|SVQ:Seville|VLC:Valencia|BIO:Bilbao|TFS TFN:Tenerife|LPA:Gran Canaria|ACE:Lanzarote|FUE:Fuerteventura|MAH:Menorca|" +
    "CDG ORY BVA:Paris|NCE:Nice|LYS:Lyon|MRS:Marseille|BOD:Bordeaux|TLS:Toulouse|NTE:Nantes|GVA:Geneva|ZRH:Zurich|BSL MLH:Basel|AMS:Amsterdam|" +
    "EIN:Eindhoven|RTM:Rotterdam|BRU CRL:Brussels|LUX:Luxembourg|FRA:Frankfurt|MUC:Munich|BER:Berlin|HAM:Hamburg|DUS:Düsseldorf|CGN:Cologne|" +
    "STR:Stuttgart|VIE:Vienna|SZG:Salzburg|INN:Innsbruck|PRG:Prague|BUD:Budapest|WAW WMI:Warsaw|KRK:Kraków|GDN:Gdańsk|CPH:Copenhagen|" +
    "ARN BMA:Stockholm|GOT:Gothenburg|OSL:Oslo|BGO:Bergen|HEL:Helsinki|KEF:Reykjavík|RIX:Riga|TLL:Tallinn|VNO:Vilnius|FCO CIA:Rome|" +
    "MXP LIN BGY:Milan|VCE TSF:Venice|NAP:Naples|FLR:Florence|PSA:Pisa|BLQ:Bologna|TRN:Turin|CTA:Catania|PMO:Palermo|CAG:Cagliari|OLB:Olbia|" +
    "BRI:Bari|ATH:Athens|SKG:Thessaloniki|HER:Heraklion|CHQ:Chania|RHO:Rhodes|CFU:Corfu|JTR:Santorini|JMK:Mykonos|ZTH:Zakynthos|IST SAW:Istanbul|" +
    "AYT:Antalya|DLM:Dalaman|BJV:Bodrum|DBV:Dubrovnik|SPU:Split|ZAG:Zagreb|LJU:Ljubljana|OTP:Bucharest|SOF:Sofia|BEG:Belgrade|TIA:Tirana|" +
    "MLA:Malta|LCA:Larnaca|PFO:Paphos|TLV:Tel Aviv|AMM:Amman|DXB DWC:Dubai|AUH:Abu Dhabi|DOH:Doha|BAH:Bahrain|MCT:Muscat|RUH:Riyadh|JED:Jeddah|" +
    "CAI:Cairo|HRG:Hurghada|SSH:Sharm el-Sheikh|CMN:Casablanca|RAK:Marrakech|TUN:Tunis|NBO:Nairobi|JNB:Johannesburg|CPT:Cape Town|" +
    "JFK EWR LGA:New York|BOS:Boston|IAD DCA BWI:Washington|PHL:Philadelphia|ORD MDW:Chicago|LAX:Los Angeles|SFO:San Francisco|SEA:Seattle|" +
    "MIA:Miami|FLL:Fort Lauderdale|MCO:Orlando|TPA:Tampa|ATL:Atlanta|DFW:Dallas|IAH:Houston|AUS:Austin|DEN:Denver|LAS:Las Vegas|PHX:Phoenix|" +
    "SAN:San Diego|MSP:Minneapolis|DTW:Detroit|MSY:New Orleans|BNA:Nashville|HNL:Honolulu|YYZ:Toronto|YVR:Vancouver|YUL:Montreal|YYC:Calgary|" +
    "MEX:Mexico City|CUN:Cancún|HAV:Havana|NAS:Nassau|MBJ:Montego Bay|BGI:Barbados|ANU:Antigua|GRU:São Paulo|GIG:Rio de Janeiro|" +
    "EZE:Buenos Aires|SCL:Santiago|LIM:Lima|BOG:Bogotá|HND NRT:Tokyo|KIX:Osaka|ICN:Seoul|PEK PKX:Beijing|PVG SHA:Shanghai|HKG:Hong Kong|" +
    "TPE:Taipei|SIN:Singapore|BKK DMK:Bangkok|HKT:Phuket|KUL:Kuala Lumpur|CGK:Jakarta|DPS:Bali|MNL:Manila|SGN:Ho Chi Minh City|HAN:Hanoi|" +
    "DEL:Delhi|BOM:Mumbai|BLR:Bangalore|MAA:Chennai|CMB:Colombo|MLE:Malé|SYD:Sydney|MEL:Melbourne|BNE:Brisbane|PER:Perth|AKL:Auckland|" +
    "MRU:Mauritius|SEZ:Seychelles")
    .split("|")
    .flatMap((x) => { const [codes, city] = x.split(":"); return codes.split(" ").map((c) => [c, city]); })
);
const placeWords = /\b(international|intl\.?|airport|aeroporto|aéroport|aeropuerto|flughafen|luchthaven|lufthavn|flygplats|terminal \w+)\b/gi;
function cityOf(place, code) {
  const a = obj(place?.address);
  return cut(str(a?.addressLocality) || AIRPORTS[code] || str(place?.name).replace(placeWords, " ") || code || "", 60);
}
const codeOf = (place) => { const c = str(place?.iataCode).toUpperCase(); return /^[A-Z]{3}$/.test(c) ? c : ""; };
const localityOf = (place) => cut(str(obj(place?.address)?.addressLocality), 60);

// ---------------------------------------------------------------------------------------------------------------------
// JSON-LD and microdata, as objects. Of an email's HTML, its first 256 KB (where any real one puts its details), and read
// by indexOf and by patterns that never read on to the end again for each tag left open
// ---------------------------------------------------------------------------------------------------------------------
export const MAX_HTML = 256 * 1024;
// (where a block's closing tag, </tag> with only space before its >, is at or after i in the page, lower-cased: [its
// start, just after it], or null)
function closing(low, tag, i) {
  const re = new RegExp(`</${tag}\\s*>`, "y");
  for (let j = low.indexOf(`</${tag}`, i); j !== -1; j = low.indexOf(`</${tag}`, j + 1)) { re.lastIndex = j; if (re.test(low)) return [j, re.lastIndex]; }
  return null;
}
// (the page with its comments out: one left open, and all after it, left as they are)
function dropComments(src) {
  let out = "", from = 0;
  for (let i; (i = src.indexOf("<!--", from)) !== -1; ) {
    const j = src.indexOf("-->", i + 4);
    if (j === -1) break;
    out += src.slice(from, i);
    from = j + 3;
  }
  return out + src.slice(from);
}
// (the page with its scripts', styles' and head's insides out, each put as by; one left open is left as it is, and with
// none closed after it, every later one of its kind too)
export function dropBlocks(html, by = "") {
  const src = String(html), low = src.toLowerCase(), open = new Set(["script", "style", "head"]);
  let out = "", from = 0;
  for (const m of low.matchAll(/<(script|style|head)\b/g)) {
    if (m.index < from || !open.has(m[1])) continue;
    const c = closing(low, m[1], m.index + m[0].length);
    if (!c) { open.delete(m[1]); continue; }
    out += src.slice(from, m.index) + by;
    from = c[1];
  }
  return out + src.slice(from);
}
// (a block as senders write it, forgiven its HTML comment or CDATA wrapper, its escaped quotes and its trailing commas;
// one that still isn't JSON is left alone)
function looseJson(s) {
  s = String(s).trim().replace(/^<!--/, "").replace(/-->$/, "").replace(/^(\/\/\s*)?<!\[CDATA\[/, "").replace(/(\/\/\s*)?\]\]>$/, "").trim();
  if (!s || s.length > 500000) return undefined;
  for (const t of [s, entities(s)]) {
    for (const u of [t, t.replace(/,(\s*[}\]])/g, "$1")]) {
      try { return JSON.parse(u); } catch {}
    }
  }
  return undefined;
}
export function jsonLd(html) {
  const out = [], src = String(html || "").slice(0, MAX_HTML), low = src.toLowerCase();
  let from = 0;
  for (const m of low.matchAll(/<script\b([^<>]*)>/g)) {
    if (m.index < from || !/\btype\s*=\s*(["']?)\s*application\/ld\+json\s*\1/.test(m[1])) continue;
    const c = closing(low, "script", m.index + m[0].length);
    if (!c) break;
    from = c[1];
    const v = looseJson(src.slice(m.index + m[0].length, c[0]));
    if (v !== undefined) out.push(v);
    if (out.length >= 20) break;
  }
  return out;
}

const VOID = new Set("area base br col embed hr img input link meta param source track wbr".split(" "));
function attrsOf(s) {
  const a = {};
  for (const m of s.matchAll(/([^\s=/"'<>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) {
    const k = m[1].toLowerCase();
    if (!(k in a)) a[k] = entities(m[2] ?? m[3] ?? m[4] ?? "");
  }
  return a;
}
// (the page's elements as a tree, enough to read its microdata: forgiving of what's left open, never a script's or a
// style's insides)
function tree(html) {
  const root = { tag: "", attrs: {}, kids: [] }, stack = [root];
  let n = 0;
  const src = dropBlocks(dropComments(String(html).slice(0, MAX_HTML)));
  for (const m of src.matchAll(/<(\/?)([a-zA-Z][\w:-]*)((?:[^<>"']|"[^"]*"|'[^']*')*)>|([^<]+)/g)) {
    if (++n > 40000) break;
    const top = stack[stack.length - 1];
    if (m[4] !== undefined) { top.kids.push(m[4]); continue; }
    const tag = m[2].toLowerCase();
    if (m[1]) {
      const i = stack.findLastIndex((e) => e.tag === tag);
      if (i > 0) stack.length = i;
      continue;
    }
    const el = { tag, attrs: attrsOf(m[3]), kids: [] };
    top.kids.push(el);
    if (tag === "br") top.kids.push(" ");
    if (!VOID.has(tag) && !/\/\s*$/.test(m[3])) stack.push(el);
  }
  return root;
}
const textOf = (n) => (typeof n === "string" ? entities(n) : ["td", "th", "p", "div", "li", "tr"].includes(n.tag) ? ` ${n.kids.map(textOf).join("")} ` : n.kids.map(textOf).join(""));
function propValue(el) {
  const a = el.attrs;
  if (el.tag === "meta") return a.content ?? "";
  if (["a", "area", "link"].includes(el.tag)) return a.href ?? "";
  if (["img", "audio", "video", "source", "iframe", "embed"].includes(el.tag)) return a.src ?? "";
  if (el.tag === "object") return a.data ?? "";
  if (el.tag === "time" && a.datetime) return a.datetime;
  if (["data", "meter"].includes(el.tag) && a.value != null) return a.value;
  if ("content" in a) return a.content;
  return plain(textOf(el));
}
export function microdata(html) {
  if (!/\bitemscope\b/i.test(html || "")) return [];
  const items = [];
  const item = (el, depth) => {
    const o = { "@type": (el.attrs.itemtype || "").trim().split(/\s+/)[0] || "" };
    const props = (n) => {
      for (const k of n.kids) {
        if (typeof k === "string") continue;
        const scope = "itemscope" in k.attrs;
        if (k.attrs.itemprop) {
          const v = scope ? (depth < 10 ? item(k, depth + 1) : null) : propValue(k);
          if (v != null) for (const name of k.attrs.itemprop.trim().split(/\s+/)) o[name] = name in o ? [].concat(o[name], v) : v;
        }
        if (!scope) props(k);
      }
    };
    props(el);
    return o;
  };
  const walk = (n) => {
    for (const k of n.kids) {
      if (typeof k === "string") continue;
      if ("itemscope" in k.attrs && !k.attrs.itemprop) { items.push(item(k, 0)); if (items.length >= 50) return; }
      else walk(k);
    }
  };
  walk(tree(html));
  return items;
}

// Every reservation in what was read, its references to other nodes (@id) followed
export function reservationsIn(roots) {
  const ids = new Map();
  const index = (v, d) => {
    if (d > 14 || !v || typeof v !== "object") return;
    if (Array.isArray(v)) return v.forEach((x) => index(x, d + 1));
    if (typeof v["@id"] === "string" && Object.keys(v).length > 1 && !ids.has(v["@id"])) ids.set(v["@id"], v);
    for (const k in v) index(v[k], d + 1);
  };
  roots.forEach((r) => index(r, 0));
  // (a copy with each bare {"@id"} put in its node's place, cycles cut)
  const resolve = (v, d, seen) => {
    if (!v || typeof v !== "object" || d > 10) return v;
    if (Array.isArray(v)) return v.slice(0, 40).map((x) => resolve(x, d + 1, seen));
    if (typeof v["@id"] === "string" && Object.keys(v).length === 1 && ids.has(v["@id"])) v = ids.get(v["@id"]);
    if (seen.has(v)) return null;
    const s2 = new Set(seen).add(v), o = {};
    for (const k in v) o[k] = resolve(v[k], d + 1, s2);
    return o;
  };
  const found = [], seen = new Set();
  const walk = (v, d) => {
    if (d > 14 || found.length >= 20 || !v || typeof v !== "object") return;
    if (Array.isArray(v)) return v.forEach((x) => walk(x, d + 1));
    if (typeof v["@id"] === "string" && Object.keys(v).length === 1 && ids.has(v["@id"])) v = ids.get(v["@id"]);
    if (seen.has(v)) return;
    seen.add(v);
    if (kindOf(v)) return void found.push(resolve(v, 0, new Set()));
    for (const k in v) walk(v[k], d + 1);
  };
  roots.forEach((r) => walk(r, 0));
  return found;
}

// ---------------------------------------------------------------------------------------------------------------------
// A reservation, as the bookings it holds (one per leg)
// ---------------------------------------------------------------------------------------------------------------------
const cancelledIn = (v) => /cancel/i.test([].concat(v ?? []).map((x) => (x && typeof x === "object" ? x["@id"] || x.name || "" : String(x))).join(" "));
const refOf = (r) => cut(str(r.reservationNumber) || str(r.reservationId) || str(r.confirmationNumber), 24);
const people = (n) => (n > 0 && n < 100 ? `${n} ${n === 1 ? "person" : "people"}` : "");
const words = (...xs) => xs.filter(Boolean).join(" · ");

export function bookingsOf(r, { zone, sender = "" }) {
  const kind = kindOf(r);
  const ref = refOf(r);
  const status = cancelledIn(r.reservationStatus) ? "cancelled" : "confirmed";
  const fors = [].concat(r.reservationFor ?? []).filter((x) => x && typeof x === "object").slice(0, 12);
  if (!fors.length) fors.push({});
  const out = [];
  const keyed = (parts, t) => [kind, ref || `${sender}|${t ? dayOf(t, zone) : ""}`, ...parts].map((x) => String(x || "").toLowerCase()).join("|");
  for (const f of fors) {
    let b = null;
    if (TRAVEL.has(kind)) {
      const depKey = kind === "flight" ? "departureAirport" : kind === "train" ? "departureStation" : "departureBusStop";
      const arrKey = depKey.replace("departure", "arrival");
      const dep = obj(f[depKey]) || obj(f.departureStation) || obj(f.departureBusStop), arr = obj(f[arrKey]) || obj(f.arrivalStation) || obj(f.arrivalBusStop);
      const t0 = timeOf(f.departureTime ?? r.departureTime, zone), t1 = timeOf(f.arrivalTime ?? r.arrivalTime, zone);
      const fromCode = codeOf(dep), toCode = codeOf(arr);
      const fromName = cut(str(dep?.name), 60), toName = cut(str(arr?.name), 60);
      const fromCity = kind === "flight" ? cityOf(dep, fromCode) : localityOf(dep) || fromName;
      const city = kind === "flight" ? cityOf(arr, toCode) : localityOf(arr) || toName;
      let no, what;
      if (kind === "flight") {
        const air = obj(f.airline), n = str(f.flightNumber).replace(/\s+/g, "").toUpperCase(), ac = str(air?.iataCode).toUpperCase();
        no = cut(/^[A-Z0-9]{2}\d/.test(n) && (!ac || n.startsWith(ac)) ? n : `${ac}${n}`, 12);
        what = "Flight";
      } else {
        const co = str(f[kind === "train" ? "trainCompany" : "busCompany"]) || str(f.provider) || str(r.provider);
        no = cut([co, str(f[kind === "train" ? "trainNumber" : "busNumber"]) || str(f[kind === "train" ? "trainName" : "busName"])].filter(Boolean).join(" "), 40);
        what = kind === "train" ? "Train" : "Coach";
      }
      const fromL = kind === "flight" ? fromCode || fromName : fromName, toL = kind === "flight" ? toCode || toName : toName;
      const term = (x) => (x ? ` T${String(x).replace(/^terminal\s*/i, "")}` : "");
      const fromWhere = cut(`${fromL}${kind === "flight" ? term(str(f.departureTerminal)) : ""}`, 40), toWhere = cut(toL, 40);
      const plat = kind === "train" && str(f.departurePlatform) ? `Platform ${str(f.departurePlatform)}` : "";
      b = {
        key: keyed([no, fromCode || fromName, toCode || toName], ref ? null : t0),
        title: city || toL ? `${what} to ${city || toL}` : no ? `${what} ${no}` : what,
        sub: words(no, `${fromWhere} ${hm(t0, zone)} → ${toWhere} ${hm(t1, zone)}`.replace(/\s+/g, " ").trim(), plat),
        facts: [["From", words(fromWhere, hm(t0, zone)).replace(" · ", " ")], ["To", words(toWhere, hm(t1, zone)).replace(" · ", " ")]],
        t0, t1,
        place: fromName || fromCode ? { name: fromName || fromCode, ...geoOf(dep) } : null,
        from: cut(fromCode || fromName, 60), to: cut(toCode || toName, 60), fromCity, city,
        dest: geoOf(arr),
      };
    } else if (kind === "hotel") {
      const t0 = timeOf(r.checkinDate ?? r.checkinTime, zone), t1 = timeOf(r.checkoutDate ?? r.checkoutTime, zone);
      const name = cut(str(f.name), 60);
      const nights = t0 && t1 ? Math.round(dayNo(t1, zone) - dayNo(t0, zone)) : 0;
      b = {
        key: keyed([name], ref ? null : t0),
        title: name || "Hotel",
        sub: words(t0 && (t0.dateOnly ? `Check-in ${dayOf(t0, zone)}` : `Check-in from ${hm(t0, zone)}`), nights > 0 && nights < 400 ? `${nights} night${nights === 1 ? "" : "s"}` : ""),
        facts: [["Check-in", at(t0, zone)], ["Check-out", at(t1, zone)]],
        t0, t1, allDay: true,
        place: name ? { name, ...geoOf(f) } : null,
        city: localityOf(f),
      };
    } else if (kind === "car") {
      const t0 = timeOf(r.pickupTime, zone), t1 = timeOf(r.dropoffTime, zone);
      const pick = obj(r.pickupLocation), co = str(r.provider) || str(obj(f)?.rentalCompany) || str(obj(f)?.brand);
      const pickName = cut(str(pick?.name), 60);
      b = {
        key: keyed([pickName], ref ? null : t0),
        title: co ? cut(`Car from ${co}`, 80) : "Hire car",
        sub: words(t0 && `Pick up ${hm(t0, zone)}${pickName ? ` at ${pickName}` : ""}`, t1 && `back ${at(t1, zone)}`),
        facts: [["Pick up", at(t0, zone)], ["Return", at(t1, zone)]],
        t0, t1,
        place: pickName ? { name: pickName, ...geoOf(pick) } : null,
        city: localityOf(pick),
      };
    } else if (kind === "restaurant") {
      const t0 = timeOf(r.startTime ?? f.startDate ?? r.startDate, zone), t1 = timeOf(r.endTime, zone);
      const name = cut(str(f.name), 60), n = num(r.partySize);
      b = {
        key: keyed([name], ref ? null : t0),
        title: name ? cut(`Table at ${name}`, 80) : "Table booked",
        sub: words(people(n), localityOf(f)),
        facts: [["When", at(t0, zone)], ["Table for", n > 0 && n < 100 ? String(n) : ""]],
        t0, t1,
        place: name ? { name, ...geoOf(f) } : null,
        city: localityOf(f),
      };
    } else if (kind === "event") {
      const t0 = timeOf(f.startDate ?? r.startDate ?? r.startTime, zone), t1 = timeOf(f.endDate ?? r.endDate, zone);
      const loc = obj(f.location), name = cut(str(f.name), 80), venue = cut(str(loc?.name), 60);
      const tickets = Array.isArray(r.reservedTicket) ? r.reservedTicket.length : num(r.numSeats);
      b = {
        key: keyed([name], ref ? null : t0),
        title: name || "Event",
        sub: words(venue, tickets > 1 && tickets < 100 ? `${tickets} tickets` : ""),
        facts: [["When", at(t0, zone)], ["Where", venue || localityOf(loc)]],
        t0, t1,
        place: venue ? { name: venue, ...geoOf(loc) } : null,
        city: localityOf(loc),
      };
    }
    if (!b) continue;
    const start = b.t0 ? (b.allDay ? startOfDay(b.t0, zone) : b.t0.ms) : null;
    const end = b.t1 ? (b.allDay ? endOfDay(b.t1, zone) : b.t1.ms) : null;
    out.push({
      key: b.key, kind, title: cut(b.title, 80), sub: cut(b.sub, 120), facts: b.facts.filter(([, v]) => v).map(([k, v]) => [k, cut(v, 40)]),
      start, end: end != null && start != null && end >= start ? end : null, tz: null,
      place: b.place?.name ? { name: cut(b.place.name, 60), ...(b.place.lat != null && { lat: b.place.lat, lon: b.place.lon }) } : null,
      ref, from: b.from || null, to: b.to || null, fromCity: b.fromCity || null, city: b.city || null, dest: b.dest || null,
      status, source: "schema",
    });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------------
// Calendar invites (RFC 5545): lines unfolded, VEVENTs read, their times by Z, by TZID, or (floating, or a TZID that
// isn't a zone this can name) the account's zone
// ---------------------------------------------------------------------------------------------------------------------
const WINDOWS = {
  "GMT Standard Time": "Europe/London", "Greenwich Standard Time": "Atlantic/Reykjavik", "W. Europe Standard Time": "Europe/Berlin",
  "Romance Standard Time": "Europe/Paris", "Central Europe Standard Time": "Europe/Budapest", "Central European Standard Time": "Europe/Warsaw",
  "GTB Standard Time": "Europe/Athens", "E. Europe Standard Time": "Europe/Chisinau", "FLE Standard Time": "Europe/Kiev",
  "Eastern Standard Time": "America/New_York", "Central Standard Time": "America/Chicago", "Mountain Standard Time": "America/Denver",
  "Pacific Standard Time": "America/Los_Angeles", "Tokyo Standard Time": "Asia/Tokyo", "AUS Eastern Standard Time": "Australia/Sydney",
  "India Standard Time": "Asia/Kolkata", "Singapore Standard Time": "Asia/Singapore", "Arabian Standard Time": "Asia/Dubai",
  UTC: "UTC", "Coordinated Universal Time": "UTC",
};
export function zoneOfTzid(tzid) {
  const z = String(tzid || "").replace(/^"|"$/g, "").replace(/^\/+/, "").trim();
  if (!z) return null;
  if (WINDOWS[z]) return WINDOWS[z];
  // (as some calendars write it: /mozilla.org/20070129_1/Europe/London)
  const tail = /([A-Za-z]+\/[A-Za-z_+-]+(?:\/[A-Za-z_+-]+)?)$/.exec(z)?.[1];
  for (const c of [z, tail]) if (c && /\//.test(c) && okZone(c)) return c;
  return null;
}
export function icsEvents(text) {
  const lines = String(text || "").slice(0, 300000).replace(/\r\n?/g, "\n").replace(/\n[ \t]/g, "").split("\n");
  const stack = [], events = [];
  let method = "", ev = null;
  for (const line of lines) {
    const m = /^([A-Za-z0-9-]+)((?:;(?:[^:";]|"[^"]*")*)*):(.*)$/.exec(line);
    if (!m) continue;
    const name = m[1].toUpperCase(), value = m[3];
    if (name === "BEGIN") {
      stack.push(value.trim().toUpperCase());
      if (stack[stack.length - 1] === "VEVENT") ev = {};
      continue;
    }
    if (name === "END") {
      const was = stack.pop();
      if (was === "VEVENT" && ev) { events.push(ev); ev = null; if (events.length >= 20) break; }
      continue;
    }
    const top = stack[stack.length - 1];
    if (top === "VCALENDAR" && name === "METHOD") method = value.trim().toUpperCase();
    if (top !== "VEVENT" || !ev) continue;
    const params = {};
    for (const p of m[2].matchAll(/;([A-Za-z0-9-]+)=("[^"]*"|[^;]*)/g)) params[p[1].toUpperCase()] = p[2].replace(/^"|"$/g, "");
    // (the dates a repeating one skips or adds may come on more than one line, each with more than one date)
    if (name === "EXDATE" || name === "RDATE") { (ev[`${name}*`] ||= []).length < 200 && ev[`${name}*`].push({ value, params }); continue; }
    if (name in ev) continue;
    ev[name] = { value, params };
  }
  return { method, events };
}
const unescapeIcs = (s) => String(s || "").replace(/\\([\\;,nN])/g, (_, c) => (c === "n" || c === "N" ? "\n" : c));
function icsTime(p, zone) {
  if (!p) return null;
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/i.exec(p.value.trim());
  if (!m) return null;
  const [y, mo, d] = [m[1], m[2], m[3]].map(Number);
  if (!validDate(y, mo, d)) return null;
  const dateOnly = m[4] === undefined || p.params.VALUE === "DATE";
  const hh = Number(m[4] || 0), mi = Number(m[5] || 0), ss = Number(m[6] || 0);
  if (hh > 23 || mi > 59 || ss > 60) return null;
  if (m[7] && !dateOnly) return { ms: Date.UTC(y, mo - 1, d, hh, mi, ss), wall: null, dateOnly: false, tz: null };
  // (TZID, where it names a zone; else, or floating, the account's: zoneOf)
  const tz = p.params.TZID ? zoneOfTzid(p.params.TZID) : null;
  return { ms: zonedMs(y, mo, d, hh, mi, ss, tz || zone), wall: { y, mo, d, hh, mi }, dateOnly, tz };
}
export function icsBookings(text, { method: partMethod = "", zone, sender = "" }) {
  const { method: calMethod, events } = icsEvents(text);
  const method = (partMethod || calMethod || "").toUpperCase();
  // (an answer to an invite, or a calendar asking for one: not an invite)
  if (["REPLY", "COUNTER", "REFRESH", "DECLINECOUNTER"].includes(method)) return [];
  const out = [];
  for (const ev of events) {
    const v = (k) => (ev[k] ? plain(unescapeIcs(ev[k].value.slice(0, 2000))) : "");
    const t0 = icsTime(ev.DTSTART, zone);
    let t1 = icsTime(ev.DTEND, zone);
    const uid = v("UID"), title = cut(v("SUMMARY"), 80), loc = cut(unescapeIcs(ev.LOCATION?.value || "").split("\n")[0], 60);
    if (!t0 && !uid) continue;
    const tz = t0?.tz || null, z = tz || zone;
    // (an all-day event's end is the day after its last)
    let end = t1 ? (t1.dateOnly ? t1.ms - 1 : t1.ms) : null;
    if (t0?.dateOnly && !t1) end = zonedMs(t0.wall.y, t0.wall.mo, t0.wall.d + 1, 0, 0, 0, z) - 1;
    const start = t0 ? t0.ms : null;
    if (end != null && start != null && end < start) end = null;
    const g = /^\s*(-?\d+(?:\.\d+)?)\s*[;,]\s*(-?\d+(?:\.\d+)?)\s*$/.exec(ev.GEO?.value || "");
    const lat = g ? Number(g[1]) : null, lon = g ? Number(g[2]) : null;
    const days = t0?.dateOnly && end ? Math.round((end + 1 - start) / DAY) : 0;
    const when = t0 ? (t0.dateOnly ? (days > 1 ? `${days} days` : "All day") : `${hm(t0, z)}${t1 && !t1.dateOnly ? `–${hm({ ...t1, wall: t1.wall && t1.tz === tz ? t1.wall : null }, z)}` : ""}`) : "";
    // (one date of a repeating one, moved or cancelled by a later email: kept beside the series, by the date it was)
    const rid = uid && ev["RECURRENCE-ID"] ? icsTime(ev["RECURRENCE-ID"], zone) : null;
    // (a repeating one: its rule, the dates it skips and adds, and the wall clock it's worked out on)
    let rule = null;
    if (t0 && !rid) {
      const r = ev.RRULE ? parseRule(ev.RRULE.value) : null;
      const dates = (k) => (ev[`${k}*`] || []).flatMap((p) => p.value.split(",").map((x) => ({ value: x.trim(), params: p.params })));
      const rd = dates("RDATE").map((p) => icsTime(p, zone)).filter(Boolean).map((t) => (t.dateOnly ? zonedMs(t.wall.y, t.wall.mo, t.wall.d, t0.wall?.hh || 0, t0.wall?.mi || 0, 0, z) : t.ms));
      const ex = dates("EXDATE").map((p) => { const t = icsTime(p, zone); return !t ? null : t.dateOnly ? `${t.wall.y}${pad(t.wall.mo)}${pad(t.wall.d)}` : t.ms; }).filter((x) => x != null);
      if (r || rd.length) {
        const wall = t0.wall || (({ y, mo, d, hh, mi, ss }) => ({ y, mo, d, hh, mi, ss }))(zoneParts(t0.ms, "UTC"));
        rule = { r, w: { ...wall, ss: 0 }, z: t0.wall ? z : "UTC", ad: !!t0.dateOnly, dur: end != null && start != null ? end - start : null, ex: ex.slice(0, 200), rd: rd.slice(0, 200) };
      }
    }
    out.push({
      key: ["ics", uid ? `${uid}|${rid ? "" : v("RECURRENCE-ID") || ev["RECURRENCE-ID"]?.value || ""}` : `${sender}|${title}|${t0?.ms}`].join("|").toLowerCase(),
      ...(rule && { rule }),
      ...(rid && { override: { rid: rid.ms, day: rid.wall ? `${rid.wall.y}${pad(rid.wall.mo)}${pad(rid.wall.d)}` : null } }),
      kind: "booking", title: title || loc || "Calendar invite", sub: cut(words(when, loc), 120),
      facts: [["When", t0 ? at(t0, z) : ""], ["Where", loc]].filter(([, x]) => x).map(([k, x]) => [k, cut(x, 40)]),
      start, end, tz,
      place: loc ? { name: loc, ...(g && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 && { lat, lon }) } : null,
      ref: "", from: null, to: null, fromCity: null, city: null, dest: null,
      status: method === "CANCEL" || /^cancel/i.test(v("STATUS")) ? "cancelled" : "confirmed", source: "ics",
    });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------------
// An email, read: { html, attachments: [{ mimeType|type, filename, content, method }] } → its bookings, each with its id
// ---------------------------------------------------------------------------------------------------------------------
const isCalendar = (a) => /^(text\/calendar|application\/ics)\b/i.test(a?.mimeType || a?.type || "") || /\.ics$/i.test(a?.filename || "");
const dec = new TextDecoder();
const asText = (c) => (typeof c === "string" ? c : c ? dec.decode(c instanceof ArrayBuffer ? new Uint8Array(c) : c) : "");
export async function spotEmail({ html = "", attachments = [], sender = "", zone = "Europe/London" }) {
  zone = okZone(zone) ? zone : "Europe/London";
  sender = String(sender || "").toLowerCase();
  let list = [];
  if (/application\/ld\+json|itemscope/i.test(html)) {
    const roots = [...jsonLd(html), ...microdata(html)];
    for (const r of reservationsIn(roots)) list.push(...bookingsOf(r, { zone, sender }));
  }
  // (the booking details first: an invite beside them is the same booking again)
  if (!list.length)
    for (const a of attachments.filter(isCalendar).slice(0, 3)) {
      const text = asText(a.content);
      if (text.length < 300000 && /BEGIN:VEVENT/i.test(text)) list.push(...icsBookings(text, { method: a.method, zone, sender }));
    }
  // (20 at most from one email: no real one holds more)
  const seen = new Set(), out = [];
  for (const b of list) {
    if (out.length >= 20) break;
    let id = `${b.kind}-${await hashOf(b.key)}`;
    // (one date of a repeating one: the series' id, and the date it was)
    if (b.override) id = `${id}~${b.override.day || dayKey(Math.floor(b.override.rid / DAY))}`;
    // (the same leg twice, once for each passenger, say: once)
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({ ...b, id });
  }
  return out;
}
export async function hashOf(s) {
  const d = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));
  return btoa(String.fromCharCode(...d.slice(0, 15))).replace(/\+/g, "-").replace(/\//g, "_");
}

// ---------------------------------------------------------------------------------------------------------------------
// Trips: a run of bookings away, anchored by an outbound leg (a flight, train or coach) or a hotel stay, to the way back
// or the hotel's checkout; what falls between joins it, where it's known to be in the same place (or isn't known)
// ---------------------------------------------------------------------------------------------------------------------
const fold = (s) => String(s || "").normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();
const sameCity = (a, b) => !!a && !!b && fold(a) === fold(b);
// (a leg's side (from or to) at a stop: its code or name, or its city)
const meets = (r, side, stop) => !!stop && ((!!r[`${side}_place`] && fold(r[`${side}_place`]) === fold(stop.code)) || sameCity(side === "from" ? r.from_city : r.city, stop.city));
const stopTo = (r) => ({ code: r.to_place, city: r.city });
const stopFrom = (r) => ({ code: r.from_place, city: r.from_city });
const endOf = (r) => r.end_at ?? r.start_at;
export function tripsOf(rows) {
  const list = rows.filter((r) => r.status !== "cancelled" && !r.hidden && Number.isFinite(r.start_at)).sort((a, b) => a.start_at - b.start_at || (a.id < b.id ? -1 : 1));
  const used = new Set(), trips = [];
  const take = (r, items) => (used.add(r.id), items.push(r));
  const free = (r) => !used.has(r.id);
  for (const a of list) {
    if (!free(a) || !(TRAVEL.has(a.kind) || a.kind === "hotel")) continue;
    const items = [];
    take(a, items);
    const start = a.start_at;
    let end = endOf(a), dest, there;
    const geo = (r, lat, lon) => (Number.isFinite(r[lat]) && Number.isFinite(r[lon]) ? { lat: r[lat], lon: r[lon] } : {});
    if (TRAVEL.has(a.kind)) {
      const home = stopFrom(a);
      there = stopTo(a);
      dest = { name: a.city || a.to_place, ...geo(a, "dest_lat", "dest_lon") };
      // (on from where it lands, within a day: a connection, and the trip's where that one lands)
      for (let c; (c = list.find((b) => free(b) && TRAVEL.has(b.kind) && b.start_at >= end - H && b.start_at <= end + 24 * H && meets(b, "from", there) && !meets(b, "to", home))); ) {
        take(c, items);
        end = endOf(c);
        there = stopTo(c);
        dest = { name: c.city || c.to_place, ...geo(c, "dest_lat", "dest_lon") };
      }
      // (the way back: the first leg from there, or home, within 30 days)
      const back = list.find((b) => free(b) && TRAVEL.has(b.kind) && b.start_at > end && b.start_at <= start + 30 * DAY && (meets(b, "from", there) || meets(b, "to", home)));
      const until = back ? back.start_at : end + 2 * DAY;
      for (const s of list)
        if (free(s) && s.kind === "hotel" && s.start_at >= start - 12 * H && s.start_at <= until && (!s.city || !dest.name || sameCity(s.city, dest.name))) {
          take(s, items);
          if (!back) end = Math.max(end, endOf(s));
          if (Number.isFinite(s.lat)) dest = { ...dest, lat: s.lat, lon: s.lon };
        }
      if (back) {
        take(back, items);
        end = endOf(back);
        // (and its connections on, home)
        for (let at2 = stopTo(back), c; !meets(back, "to", home) && (c = list.find((b) => free(b) && TRAVEL.has(b.kind) && b.start_at >= end - H && b.start_at <= end + 24 * H && meets(b, "from", at2))); ) {
          take(c, items);
          end = endOf(c);
          if (meets(c, "to", home)) break;
          at2 = stopTo(c);
        }
      }
    } else {
      dest = { name: a.city || a.place, ...geo(a, "lat", "lon") };
      // (another stay there, following on)
      for (let s; (s = list.find((b) => free(b) && b.kind === "hotel" && b.start_at >= end - DAY && b.start_at <= end + DAY && (!b.city || !a.city || sameCity(b.city, a.city)))); ) {
        take(s, items);
        end = Math.max(end, endOf(s));
      }
    }
    // (what's between, there or somewhere not known)
    for (const r of list)
      if (free(r) && r.start_at >= start && r.start_at <= end && (TRAVEL.has(r.kind) ? r.start_at > start && endOf(r) <= end : !r.city || !dest.name || sameCity(r.city, dest.name))) take(r, items);
    const name = cut(dest.name || "Trip", 60);
    trips.push({
      id: `trip-${a.id}`.slice(0, 64), name, start, end,
      destination: { name, ...(Number.isFinite(dest.lat) && Number.isFinite(dest.lon) && { lat: dest.lat, lon: dest.lon }) },
      items: items.sort((x, y) => x.start_at - y.start_at).map((r) => r.id),
    });
  }
  return trips.sort((x, y) => x.start - y.start);
}

// ---------------------------------------------------------------------------------------------------------------------
// Kept, in Mail's database (db.js: spots, spot_occ, spot_wrong, and parcels.js's and bills.js's; meta spot_trips,
// spot_parcels, spot_bills (Settings' three switches), spot_back, spot_tz)
// ---------------------------------------------------------------------------------------------------------------------
const meta = async (env, k) => (await env.DB.prepare(`SELECT v FROM meta WHERE k = ?1`).bind(k).first())?.v ?? null;
const setMeta = (env, k, v) => env.DB.prepare(`INSERT INTO meta (k, v) VALUES (?1, ?2) ON CONFLICT(k) DO UPDATE SET v = excluded.v`).bind(k, v);
export const spotOn = async (env) => (await meta(env, "spot_trips")) === "1";
// (Settings' switches: "Trips and bookings", "Parcels and returns", "Bills and subscriptions"; and the read-back, if one's going)
const SWITCH = { trips: "spot_trips", parcels: "spot_parcels", bills: "spot_bills" };
export async function switches(env) {
  const { results } = await env.DB.prepare(`SELECT k, v FROM meta WHERE k IN ('spot_trips', 'spot_parcels', 'spot_bills', 'spot_back')`).all();
  const m = Object.fromEntries(results.map((r) => [r.k, r.v]));
  return { trips: m.spot_trips === "1", parcels: m.spot_parcels === "1", bills: m.spot_bills === "1", back: m.spot_back || null };
}
// (the account's zone: as the browser that turned the switch on said, else the account's Quiet Hours', else the UK's)
export async function zoneOf(env) {
  const z = await meta(env, "spot_tz");
  if (okZone(z)) return z;
  try { const q = JSON.parse((await meta(env, "quiet")) || "null"); if (okZone(q?.tz) && q.tz !== "UTC") return q.tz; } catch {}
  return "Europe/London";
}

const COLS = ["id", "kind", "title", "sub", "facts", "start_at", "end_at", "tz", "place", "lat", "lon", "dest_lat", "dest_lon", "ref", "from_place", "to_place", "from_city", "city",
  "thread_id", "message_id", "sender", "source", "status", "mail_date", "created", "updated", "rule", "last_at"];
const UPSERT = `INSERT INTO spots (${COLS.join(", ")}) VALUES (${COLS.map((_, i) => `?${i + 1}`).join(", ")})
  ON CONFLICT(id) DO UPDATE SET ${COLS.filter((c) => !["id", "created"].includes(c)).map((c) => `${c} = excluded.${c}`).join(", ")}
  WHERE excluded.mail_date >= spots.mail_date`;
// (one date of a repeating invite, moved or cancelled: by its series and the moment it was)
const OCC = `INSERT INTO spot_occ (series_id, rid, start_at, end_at, cancelled, title, sub, thread_id, message_id, mail_date) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
  ON CONFLICT(series_id, rid) DO UPDATE SET start_at = excluded.start_at, end_at = excluded.end_at, cancelled = excluded.cancelled, title = excluded.title, sub = excluded.sub,
    thread_id = excluded.thread_id, message_id = excluded.message_id, mail_date = excluded.mail_date WHERE excluded.mail_date >= spot_occ.mail_date`;
// (a repeating one's last date, or null for one with no end)
const seriesLast = (rule) => lastOf(rule.r, { wall: rule.w, zone: rule.z, ex: rule.ex, rd: rule.rd });

// An email's bookings, kept: each new one added, each known one brought up to date (unless this email is older than the
// one it was last read from, or from another sender: one who knows a booking's reference or an invite's UID never changes
// or cancels someone else's). Not those of a sender and kind said to be Wrong, and none already over (ended more than 12
// hours ago: as from the read-back, so for mail as it comes too, which may be a receipt for a stay that's over)
export async function keepBookings(env, list, { threadId, messageId, sender, mailDate, now = Date.now() }) {
  if (!list.length) return 0;
  sender = String(sender || "").toLowerCase();
  const { results: wrong } = await env.DB.prepare(`SELECT kind FROM spot_wrong WHERE sender = ?1`).bind(sender).all();
  const no = new Set(wrong.map((w) => w.kind));
  // (who each known one was read from; a date moved or cancelled only of a series known, from its own sender)
  const ids = [...new Set(list.map((b) => own(b.id)))];
  const { results: had } = await env.DB.prepare(`SELECT id, sender FROM spots WHERE id IN (${ids.map((_, i) => `?${i + 1}`).join(", ")})`).bind(...ids).all();
  const from = new Map(had.map((r) => [r.id, r.sender]));
  const theirs = (id) => from.has(id) && !sameSender(from.get(id), sender);
  const series = new Set(list.filter((b) => !b.override).map((b) => b.id));
  const ops = [];
  for (const b of list) {
    if (no.has(b.kind) || !ID_RE.test(b.id) || theirs(own(b.id))) continue;
    if (b.override) {
      const sid = b.id.split("~")[0];
      // (one for a series not read yet, kept for when it is (the read-back can meet a cancellation before its invite):
      // only that invite's own sender's are kept then, and those still waiting after 60 days go)
      if (!from.has(sid) && !series.has(sid)) ops.push(env.DB.prepare(`DELETE FROM spot_occ WHERE series_id NOT IN (SELECT id FROM spots) AND mail_date < ?1`).bind(now - 60 * DAY));
      ops.push(
        env.DB.prepare(OCC).bind(sid, b.override.rid, b.start ?? null, b.end ?? null, b.status === "cancelled" ? 1 : 0, cut(b.title, 80), cut(b.sub, 120), threadId, messageId, mailDate),
        env.DB.prepare(`INSERT OR IGNORE INTO spot_threads (spot_id, thread_id) VALUES (?1, ?2)`).bind(sid, threadId)
      );
      continue;
    }
    if (b.id.includes("~")) continue;
    // (a cancellation that doesn't say when: the booking it names, if it's known, cancelled)
    if (b.start == null) {
      if (b.status === "cancelled")
        ops.push(
          env.DB.prepare(`UPDATE spots SET status = 'cancelled', thread_id = ?2, message_id = ?3, mail_date = ?4, updated = ?5 WHERE id = ?1 AND mail_date <= ?4`).bind(b.id, threadId, messageId, mailDate, now),
          env.DB.prepare(`INSERT OR IGNORE INTO spot_threads (spot_id, thread_id) SELECT id, ?2 FROM spots WHERE id = ?1`).bind(b.id, threadId)
        );
      continue;
    }
    const last = b.rule ? seriesLast(b.rule) : undefined;
    if (b.rule ? last != null && last + (b.rule.dur || 0) < now - 12 * H : (b.end ?? b.start) < now - 12 * H) continue;
    const row = {
      id: b.id, kind: b.kind, title: cut(b.title, 80), sub: cut(b.sub, 120), facts: JSON.stringify(b.facts || []).slice(0, 600), start_at: b.start, end_at: b.end ?? null, tz: okZone(b.tz) ? b.tz : null,
      place: b.place?.name ? cut(b.place.name, 60) : null, lat: b.place?.lat ?? null, lon: b.place?.lon ?? null, dest_lat: b.dest?.lat ?? null, dest_lon: b.dest?.lon ?? null,
      ref: b.ref ? cut(b.ref, 24) : null, from_place: b.from ? cut(b.from, 60) : null, to_place: b.to ? cut(b.to, 60) : null, from_city: b.fromCity ? cut(b.fromCity, 60) : null, city: b.city ? cut(b.city, 60) : null,
      thread_id: threadId, message_id: messageId, sender, source: b.source, status: b.status, mail_date: mailDate, created: now, updated: now,
      rule: b.rule ? JSON.stringify(b.rule) : null, last_at: b.rule ? last : null,
    };
    ops.push(env.DB.prepare(UPSERT).bind(...COLS.map((c) => row[c])), env.DB.prepare(`INSERT OR IGNORE INTO spot_threads (spot_id, thread_id) VALUES (?1, ?2)`).bind(b.id, threadId));
    // (a new series: dates moved or cancelled ahead of it by anyone but its own sender let go)
    if (b.rule && !from.has(b.id))
      ops.push(env.DB.prepare(`DELETE FROM spot_occ WHERE series_id = ?1 AND NOT EXISTS (SELECT 1 FROM messages m WHERE (m.id = spot_occ.message_id OR m.message_id = spot_occ.message_id) AND lower(m.from_email) = ?2)`).bind(b.id, sender));
  }
  if (ops.length) await env.DB.batch(ops);
  return ops.length;
}


// (DMARC failed, by the receiving end's own check: what it says about its sender can't be trusted, so it isn't read)
const untrusted = (headers) => (headers || []).some((h) => h.key === "authentication-results" && /\bdmarc\s*=\s*fail\b/i.test(h.value || ""));
// (DMARC passed for the domain of the address it's from, by the receiving end's own check: the topmost
// Authentication-Results, which it adds above any the sender wrote itself; one that names another domain doesn't count.
// Parcels and bills are read from nothing less: a parcel or a bill is what scams look like)
export function dmarcPass(headers, from) {
  const ar = (headers || []).filter((h) => h.key === "authentication-results").map((h) => String(h.value || ""));
  if (!ar.length || ar.some((v) => /\bdmarc\s*=\s*fail\b/i.test(v))) return false;
  const m = /\bdmarc\s*=\s*pass\b([^;]*)/i.exec(ar[0]);
  if (!m) return false;
  const named = /\bheader\.from\s*=\s*([^\s;()]+)/i.exec(m[1])?.[1]?.toLowerCase();
  const d = domainOf(from);
  return !!d && (!named || d === named || d.endsWith(`.${named}`));
}
// (an original's headers, as postal-mime gives them: [{ key, value }], from the top)
function headersOf(raw) {
  const text = new TextDecoder().decode(raw.slice(0, 65536));
  const head = text.split(/\r?\n\r?\n/)[0].replace(/\r?\n[ \t]+/g, " ");
  return head.split(/\r?\n/).map((l) => /^([!-9;-~]+):\s?(.*)$/.exec(l)).filter(Boolean).map((m) => ({ key: m[1].toLowerCase(), value: m[2] }));
}

// One email, read for each switch that's on: its bookings (stage 1), and where DMARC passed for its sender, its parcels
// and bills. Each kept apart, so one that fails never stops the others. headers: a function, asked only when there's a
// parcel or a bill to keep (the read-back reads them from the original then). → how many kept
async function readOne(env, on, mail, { threadId, messageId, sender, date, zone, now = Date.now() }) {
  let n = 0;
  // (no later than it came: an email dated ahead never stands over the ones that come after it)
  if (Number.isFinite(date) && date > now) date = now;
  const at = { threadId, messageId, sender, mailDate: date, zone, now };
  if (on.trips)
    try { n += await keepBookings(env, await spotEmail({ html: mail.html, attachments: mail.attachments, sender, zone }), at); }
    catch (err) { console.error("spot: couldn't read a message for bookings", messageId, err); }
  if (!on.parcels && !on.bills) return n;
  const given = { html: mail.html, text: mail.text, subject: mail.subject, sender, fromName: mail.fromName, mailDate: date, zone };
  let parcels = [], bills = [];
  try { if (on.parcels) parcels = parcelsOf(given); } catch (err) { console.error("spot: couldn't read a message for parcels", messageId, err); }
  try { if (on.bills) bills = billsOf(given); } catch (err) { console.error("spot: couldn't read a message for bills", messageId, err); }
  if (!(parcels.length || bills.length) || !dmarcPass(await mail.headers(), sender)) return n;
  try { n += await keepParcels(env, parcels, at); } catch (err) { console.error("spot: couldn't keep a message's parcels", messageId, err); }
  try { n += await keepBills(env, bills, at); } catch (err) { console.error("spot: couldn't keep a message's bills", messageId, err); }
  return n;
}

// A message as it's kept (receive.js store): what it holds spotted and kept, for each switch that's on. Never throws: a
// failure to spot never stops mail being kept
export async function spotStored(env, { email, threadId, messageId, sender, date }) {
  try {
    const on = await switches(env);
    if (!(on.trips || on.parcels || on.bills) || untrusted(email.headers)) return 0;
    const zone = await zoneOf(env);
    const mail = { html: email.html || "", text: email.text || "", subject: email.subject || "", fromName: email.from?.name || "", attachments: email.attachments || [], headers: async () => email.headers };
    return await readOne(env, on, mail, { threadId, messageId, sender, date, zone });
  } catch (err) {
    console.error("spot: couldn't read a message", messageId, err);
    return 0;
  }
}

// The last 60 days read back, oldest first (so the newest word on each is the one kept), a few at a time, for the kinds
// just turned on: from the switch (once it's on: index.js) and every scheduled run until it's done. Each read-back has
// its own n: one started again meanwhile (another switch turned on) is the one that goes on, and this one stops without
// writing over it. → whether there's more to read
export async function readBack(env, { budgetMs = 20000, batch = 8, now = Date.now() } = {}) {
  const began = Date.now();
  let st;
  try { st = JSON.parse((await meta(env, "spot_back")) || "null"); } catch { st = null; }
  if (!st) return false;
  const sw = await switches(env);
  // (from before parcels and bills: trips alone)
  const on = Object.fromEntries(Object.keys(SWITCH).map((k) => [k, sw[k] && (st.kinds || ["trips"]).includes(k)]));
  if (!on.trips && !on.parcels && !on.bills) {
    await env.DB.prepare(`DELETE FROM meta WHERE k = 'spot_back'`).run();
    return false;
  }
  const zone = await zoneOf(env);
  const mine = `json_extract(v, '$.n') IS ?1`, n = st.n ?? null;
  do {
    // (started again meanwhile: that one goes on)
    if (!(await env.DB.prepare(`SELECT 1 AS k FROM meta WHERE k = 'spot_back' AND ${mine}`).bind(n).first())) return false;
    const { results } = await env.DB.prepare(
      `SELECT id, thread_id, from_email, from_name, subject, date FROM messages WHERE folder NOT IN ('sent', 'drafts', 'trash') AND date >= ?1 AND date <= ?2
         AND (date > ?3 OR (date = ?3 AND id > ?4)) ORDER BY date, id LIMIT ?5`
    ).bind(st.from, st.until, st.at, st.id, batch).all();
    for (const m of results) {
      // (its place kept before it's read: one that stops the run itself (too long at it, say) is passed over next time,
      // never read again and again, holding up all after it)
      st.at = m.date;
      st.id = m.id;
      await env.DB.prepare(`UPDATE meta SET v = ?2 WHERE k = 'spot_back' AND ${mine}`).bind(n, JSON.stringify(st)).run();
      try {
        const body = await env.MAIL.get(`body/${m.id}.json`).then((o) => (o ? o.json() : null)).catch(() => null);
        const html = String(body?.html || ""), text = String(body?.text || "");
        const attachments = [];
        if (on.trips && !/application\/ld\+json|itemscope/i.test(html)) {
          const cals = await env.DB.prepare(`SELECT id, filename, type FROM attachments WHERE message_id = ?1 AND (type LIKE 'text/calendar%' OR type LIKE 'application/ics%' OR lower(filename) LIKE '%.ics') LIMIT 3`).bind(m.id).all();
          for (const a of cals.results) {
            const o = await env.MAIL.get(`att/${a.id}`).catch(() => null);
            if (o) attachments.push({ filename: a.filename, mimeType: a.type, content: new Uint8Array(await o.arrayBuffer()) });
          }
        }
        const headers = async () => { const o = await env.MAIL.get(`raw/${m.id}.eml`).catch(() => null); return o ? headersOf(new Uint8Array(await o.arrayBuffer())) : []; };
        if (html || text || attachments.length)
          await readOne(env, on, { html, text, subject: m.subject || "", fromName: m.from_name || "", attachments, headers }, { threadId: m.thread_id, messageId: m.id, sender: m.from_email, date: m.date, zone, now });
      } catch (err) {
        console.error("spot: couldn't read back a message", m.id, err);
      }
    }
    if (results.length < batch) {
      await env.DB.prepare(`DELETE FROM meta WHERE k = 'spot_back' AND ${mine}`).bind(n).run();
      return false;
    }
  } while (Date.now() - began < budgetMs);
  return true;
}

// The switches ({ trips, parcels, bills }, each true, false or left out): one turned on starts the read-back for it (the
// last 60 days, up to now: what comes from now on is read as it comes); one turned off, what it spotted goes (what you'd
// taken off stays taken off, for when it's on again)
export async function setSpot(env, ctx, given, now = Date.now()) {
  const keys = Object.keys(SWITCH).filter((k) => given[k] !== undefined);
  if (!keys.length || keys.some((k) => typeof given[k] !== "boolean")) throw Object.assign(new Error("Choose on or off."), { status: 400, publicMessage: "Choose on or off." });
  const was = await switches(env);
  const ops = keys.map((k) => setMeta(env, SWITCH[k], given[k] ? "1" : "0"));
  if (okZone(given.tz)) ops.push(setMeta(env, "spot_tz", given.tz));
  const turned = keys.filter((k) => given[k] && !was[k]);
  // (bills known from the read-back's start: the months before it are left unknown, not counted as nothing)
  if (turned.includes("bills")) ops.push(setMeta(env, "bills_since", String(now - 60 * DAY)));
  if (turned.length) {
    let st = null;
    try { st = JSON.parse(was.back || "null"); } catch {}
    const kinds = [...new Set([...(st ? st.kinds || ["trips"] : []), ...turned])];
    // (and the kinds of one written meanwhile put with them, in the one statement: two switches turned on at once, each
    // before the other's written, both read back)
    ops.push(env.DB.prepare(`INSERT INTO meta (k, v) VALUES ('spot_back', ?1) ON CONFLICT(k) DO UPDATE SET v = json_set(excluded.v, '$.kinds', json((SELECT json_group_array(value) FROM
      (SELECT value FROM json_each(COALESCE(json_extract(meta.v, '$.kinds'), '["trips"]')) UNION ALL
       SELECT value FROM json_each(excluded.v, '$.kinds') WHERE value NOT IN (SELECT value FROM json_each(COALESCE(json_extract(meta.v, '$.kinds'), '["trips"]')))))))`)
      .bind(JSON.stringify({ from: now - 60 * DAY, until: now, at: 0, id: "", kinds, n: crypto.randomUUID() })));
  }
  const off = keys.filter((k) => !given[k]);
  if (off.includes("trips")) ops.push(env.DB.prepare(`DELETE FROM spots WHERE hidden = 0`), env.DB.prepare(`DELETE FROM spot_occ WHERE series_id NOT IN (SELECT id FROM spots)`));
  if (off.includes("parcels")) ops.push(env.DB.prepare(`DELETE FROM parcels WHERE hidden = 0`));
  if (off.includes("bills")) ops.push(env.DB.prepare(`DELETE FROM bills WHERE hidden = 0`), env.DB.prepare(`DELETE FROM bill_history`));
  if (off.length) ops.push(env.DB.prepare(`DELETE FROM spot_threads WHERE spot_id NOT IN (SELECT id FROM spots UNION ALL SELECT id FROM parcels UNION ALL SELECT id FROM bills)`));
  if (Object.keys(SWITCH).every((k) => (keys.includes(k) ? !given[k] : !was[k]))) ops.push(env.DB.prepare(`DELETE FROM meta WHERE k = 'spot_back'`));
  await env.DB.batch(ops);
  if (turned.length && ctx) ctx.waitUntil(readBack(env).catch((err) => console.error("spot: read-back", err)));
}
export async function spotState(env) {
  const s = await switches(env);
  return { trips: s.trips, parcels: s.parcels, bills: s.bills, reading: (s.trips || s.parcels || s.bills) && !!s.back };
}

// ---------------------------------------------------------------------------------------------------------------------
// For Today's card, and for the strip
// ---------------------------------------------------------------------------------------------------------------------
// (what's near enough now to be on Today, or in a trip that is: those taken off too, for the trip's own list of them)
async function nearRows(env, now) {
  const { results } = await env.DB.prepare(
    `SELECT * FROM spots WHERE rule IS NULL AND status = 'confirmed' AND COALESCE(end_at, start_at) >= ?1 AND start_at <= ?2 ORDER BY start_at LIMIT 400`
  ).bind(now - 45 * DAY, now + 120 * DAY).all();
  return results;
}
const placeOut = (r) => (r.place ? { name: cut(r.place, 60), ...(Number.isFinite(r.lat) && Number.isFinite(r.lon) && { lat: r.lat, lon: r.lon }) } : null);
const ruleOf = (r) => { try { const x = JSON.parse(r.rule || "null"); return x && x.w && okZone(x.z) ? x : null; } catch { return null; } };

// A repeating invite's dates around now (from two days ago to a year on, 400 at most), each moved or cancelled as its
// later emails said: [{ start, end, day, cancelled, was, title, sub }]
function seriesDates(r, rule, occ, now) {
  const dates = expand(rule.r, { wall: rule.w, zone: rule.z, ex: rule.ex || [], rd: rule.rd || [], from: now - 2 * DAY, to: now + 366 * DAY, max: 400 });
  const dur = Number.isFinite(rule.dur) ? rule.dur : null;
  const byRid = new Map(occ.map((o) => [o.rid, o]));
  const out = dates.map((d) => {
    const o = byRid.get(d.start);
    byRid.delete(d.start);
    if (!o) return { start: d.start, end: dur != null ? d.start + dur : null, day: d.day, cancelled: false, was: null, title: r.title, sub: r.sub };
    if (o.cancelled) return { start: d.start, end: dur != null ? d.start + dur : null, day: d.day, cancelled: true, was: null, title: r.title, sub: r.sub };
    const start = Number.isFinite(o.start_at) ? o.start_at : d.start;
    return { start, end: Number.isFinite(o.end_at) ? o.end_at : dur != null ? start + dur : null, day: d.day, cancelled: false, was: start !== d.start ? d.start : null, title: o.title || r.title, sub: o.sub || r.sub };
  });
  // (one moved from a date the rule doesn't give, or from before the dates looked at, onto one that is)
  for (const o of byRid.values())
    if (!o.cancelled && Number.isFinite(o.start_at) && o.start_at >= now - 2 * DAY && o.start_at <= now + 366 * DAY) {
      const p = zoneParts(o.rid, rule.z);
      out.push({ start: o.start_at, end: Number.isFinite(o.end_at) ? o.end_at : null, day: dayKey(Date.UTC(p.y, p.mo - 1, p.d) / DAY), cancelled: false, was: o.rid, title: o.title || r.title, sub: o.sub || r.sub });
    }
  return out.sort((a, b) => a.start - b.start);
}
const nextOf = (dates, now) => dates.filter((d) => (d.end ?? d.start) >= now).slice(0, 5).map((d) => ({ start: d.start, ...(d.cancelled && { cancelled: true }), ...(d.was != null && { was: d.was }) }));
async function seriesRows(env, now, where = `hidden = 0 AND status = 'confirmed'`) {
  const { results } = await env.DB.prepare(`SELECT * FROM spots WHERE rule IS NOT NULL AND ${where} AND (last_at IS NULL OR last_at >= ?1) AND start_at <= ?2 LIMIT 50`).bind(now - 2 * DAY, now + 14 * DAY).all();
  return results;
}
async function occOf(env, ids) {
  if (!ids.length) return new Map();
  const { results } = await env.DB.prepare(`SELECT * FROM spot_occ WHERE series_id IN (${ids.map((_, i) => `?${i + 1}`).join(", ")})`).bind(...ids).all();
  const by = new Map(ids.map((id) => [id, []]));
  for (const o of results) by.get(o.series_id)?.push(o);
  return by;
}
// (each date of each repeating invite within the card's window, as its own item: <series id>~<yyyymmdd>)
async function repeating(env, now) {
  const rows = await seriesRows(env, now);
  const occ = await occOf(env, rows.map((r) => r.id));
  const out = [];
  for (const r of rows) {
    const rule = ruleOf(r);
    if (!rule) continue;
    const dates = seriesDates(r, rule, occ.get(r.id) || [], now), next = nextOf(dates, now), repeat = repeatWords(rule.r, rule.w);
    for (const d of dates)
      if (!d.cancelled && d.start <= now + 14 * DAY && (d.end ?? d.start) >= now - 12 * H)
        out.push({
          id: `${r.id}~${d.day}`.slice(0, 64), kind: r.kind, title: cut(d.title, 80), sub: cut(d.sub || "", 120), start: d.start, end: d.end, tz: okZone(r.tz) ? r.tz : null,
          place: placeOut(r), ref: r.ref ? cut(r.ref, 24) : null, trip: null, thread: r.thread_id || null, status: "confirmed", ...(repeat && { repeat }), next, ...(d.was != null && { was: d.was }),
        });
  }
  return out;
}

// For Today's card (connect.js card): what's ahead in the next 14 days (and what ended in the last 12 hours), soonest
// first, 40 at most, each date of a repeating invite its own; the trips they're in, 5 at most, each with what of it was
// taken off (hidden, 10 at most, for Put Back). null while the switch is off (the card then has neither)
export async function aheadOf(env, now = Date.now()) {
  if (!(await spotOn(env))) return null;
  const all = await nearRows(env, now);
  const rows = all.filter((r) => !r.hidden);
  const trips = tripsOf(rows);
  const tripOf = new Map(trips.flatMap((t) => t.items.map((id) => [id, t.id])));
  const ahead = rows
    .filter((r) => r.start_at <= now + 14 * DAY && endOf(r) >= now - 12 * H)
    .map((r) => ({
      id: r.id, kind: r.kind, title: cut(r.title, 80), sub: cut(r.sub || "", 120), start: r.start_at, end: r.end_at ?? null, tz: okZone(r.tz) ? r.tz : null,
      place: placeOut(r), ref: r.ref ? cut(r.ref, 24) : null, trip: tripOf.get(r.id) || null, thread: r.thread_id || null, status: r.status,
    }))
    .concat(await repeating(env, now).catch((err) => (console.error("card: repeating", err), [])))
    .sort((a, b) => a.start - b.start || (a.id < b.id ? -1 : 1))
    .slice(0, 40);
  const shown = new Set(ahead.map((a) => a.id));
  // (the trips as they'd be with nothing taken off: what of each was)
  const whole = all.some((r) => r.hidden) ? tripsOf(all.map((r) => ({ ...r, hidden: 0 }))) : [];
  const tripsOut = trips
    .filter((t) => t.items.some((id) => shown.has(id)))
    .slice(0, 5)
    // (each item one Today can find in ahead)
    .map((t) => {
      const w = whole.find((x) => x.items.some((id) => t.items.includes(id)));
      const hidden = w ? all.filter((r) => r.hidden && w.items.includes(r.id)).slice(0, 10).map((r) => ({ id: r.id, title: cut(r.title, 80), sub: cut(r.sub || "", 120), start: r.start_at })) : [];
      return { ...t, items: t.items.filter((id) => shown.has(id)), hidden };
    });
  return { ahead, trips: tripsOut };
}

// Everything the card has from Mail on Your Day, for each switch that's on (connect.js card): ahead and trips, parcels,
// bills and money. Each apart: one failing leaves the others, and the card's numbers, as they are
export async function spotCard(env, now = Date.now()) {
  const on = await switches(env);
  const out = {};
  const part = (what, fn) => fn().catch((err) => (console.error(`card: ${what}`, err), null));
  if (on.trips) Object.assign(out, await part("bookings", () => aheadOf(env, now)));
  if (on.parcels) { const p = await part("parcels", () => parcelsCard(env, now)); if (p) out.parcels = p; }
  if (on.bills) Object.assign(out, await part("bills", async () => billsCard(env, now, await zoneOf(env), Number(await meta(env, "bills_since")) || 0)));
  return out;
}

// For the strip at the top of a conversation: its bookings (hidden ones too, said so), each with its trip, a repeating
// one at its next date; its parcels and its bills. Only for the switches that are on; null with all three off
export async function threadSpots(env, threadId, now = Date.now()) {
  const on = await switches(env);
  if (!on.trips && !on.parcels && !on.bills) return null;
  const out = [];
  if (on.trips) out.push(...(await threadBookings(env, threadId, now)));
  if (on.parcels) out.push(...(await threadParcels(env, threadId)));
  if (on.bills) out.push(...(await threadBills(env, threadId)));
  return out.slice(0, 6);
}
async function threadBookings(env, threadId, now) {
  const { results } = await env.DB.prepare(
    `SELECT s.*, (SELECT from_name FROM messages m WHERE m.id = s.message_id) AS from_name FROM spots s
       WHERE s.thread_id = ?1 OR s.id IN (SELECT spot_id FROM spot_threads WHERE thread_id = ?1) ORDER BY s.start_at LIMIT 6`
  ).bind(threadId).all();
  if (!results.length) return [];
  const trips = tripsOf((await nearRows(env, now)).filter((r) => !r.hidden));
  const occ = await occOf(env, results.filter((r) => r.rule).map((r) => r.id));
  return results.map((r) => {
    const t = trips.find((x) => x.items.includes(r.id));
    let facts = [];
    try { facts = JSON.parse(r.facts || "[]").filter((f) => Array.isArray(f) && f.length === 2).slice(0, 3).map(([k, v]) => [cut(k, 20), cut(v, 40)]); } catch {}
    const rule = r.rule ? ruleOf(r) : null;
    const dates = rule ? seriesDates(r, rule, occ.get(r.id) || [], now) : null;
    const nextDate = dates?.find((d) => !d.cancelled && (d.end ?? d.start) >= now);
    return {
      id: r.id, kind: r.kind, title: r.title, sub: r.sub || "", facts, start: nextDate?.start ?? r.start_at, end: nextDate ? nextDate.end : r.end_at ?? null, tz: r.tz, place: placeOut(r), ref: r.ref || null,
      status: r.status, hidden: !!r.hidden, source: r.source, sender: cut(r.from_name || r.sender || "", 60),
      trip: t ? { id: t.id, name: t.name, start: t.start, end: t.end } : null,
      ...(rule && { repeat: repeatWords(rule.r, rule.w), next: nextOf(dates, now) }),
    };
  });
}

// Remove (hidden), Put it back, and Wrong (hidden, and its sender's mail of that kind not read for it again; put back,
// read again), for a booking, a parcel or a bill (one date of a repeating invite: the whole series). → whether there was one
const tableOf = (id) => (id.startsWith("parcel-") ? "parcels" : id.startsWith("bill-") ? "bills" : "spots");
const kindCol = (table) => (table === "parcels" ? `'parcel'` : "kind");
const own = (id) => String(id || "").split("~")[0];
export async function hideSpot(env, id, hidden = true) {
  id = own(id);
  const table = tableOf(id);
  const r = await env.DB.prepare(`UPDATE ${table} SET hidden = ?2, updated = ?3 WHERE id = ?1`).bind(id, hidden ? 1 : 0, Date.now()).run();
  if (!hidden && r.meta?.changes) {
    const s = await env.DB.prepare(`SELECT sender, ${kindCol(table)} AS kind FROM ${table} WHERE id = ?1`).bind(id).first();
    if (s) await env.DB.prepare(`DELETE FROM spot_wrong WHERE sender = ?1 AND kind = ?2`).bind(s.sender, s.kind).run();
  }
  return !!r.meta?.changes;
}
export async function wrongSpot(env, id) {
  id = own(id);
  const table = tableOf(id);
  const s = await env.DB.prepare(`SELECT sender, ${kindCol(table)} AS kind FROM ${table} WHERE id = ?1`).bind(id).first();
  if (!s) return false;
  await env.DB.batch([
    env.DB.prepare(`INSERT OR IGNORE INTO spot_wrong (sender, kind, at) VALUES (?1, ?2, ?3)`).bind(s.sender || "", s.kind, Date.now()),
    env.DB.prepare(`UPDATE ${table} SET hidden = 1, updated = ?2 WHERE id = ?1`).bind(id, Date.now()),
  ]);
  return true;
}
// (the conversation one was last read from, for the strip drawn again)
export async function threadOfSpot(env, id) {
  id = own(id);
  return String((await env.DB.prepare(`SELECT thread_id FROM ${tableOf(id)} WHERE id = ?1`).bind(id).first())?.thread_id || "");
}

export { ensureSchema };
