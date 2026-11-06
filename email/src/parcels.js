// Mail on Your Day, stage 2: parcels and returns, read from mail by rules alone (spot.js's way: no AI of any kind,
// nothing sent anywhere to be read; an email that can't be read is left alone, never guessed at). In this order of trust:
//   1. the order and delivery details a shop or courier puts in its email in schema.org's form (JSON-LD or microdata):
//      ParcelDelivery and Order;
//   2. rules for the couriers' and the big shops' own emails, by the domain of the address they're from (that domain, or
//      a name under it: evri-redelivery.top or evri.com.parcel.top is never Evri), and only where DMARC passed for it;
//   3. nothing else: no "your order" guessed at from anyone else.
// A parcel's tracking page is the courier's own, made from its fixed https address and the tracking number (or, for an
// Amazon order with no courier's number, Amazon's order page and the order number): never a link taken from an email.
import { jsonLd, microdata, plain, cut, timeOf, zonedMs, zoneParts, hashOf } from "./spot.js";

const H = 3600e3, DAY = 864e5;
const enc = encodeURIComponent;

// The couriers, each with its own domains, its tracking numbers (those that can't be anything else, and those that need
// a "tracking number" beside them to be taken for one) and its own tracking page
export const COURIERS = {
  royalmail: { name: "Royal Mail", domains: ["royalmail.com"], sure: /\b[A-Z]{2}\d{9}GB\b/, labelled: /^(?:[A-Z]{2}\d{9}GB|\d{16})$/, track: (r) => `https://www.royalmail.com/track-your-item#/tracking-results/${enc(r)}` },
  evri: { name: "Evri", domains: ["evri.com", "hermes-europe.co.uk"], sure: /\bH[0-9A-Z]{11,15}\b(?=[^0-9A-Z]|$)/, labelled: /^(?:H[0-9A-Z]{11,15}|\d{16})$/, track: (r) => `https://www.evri.com/track/parcel/${enc(r)}` },
  dpd: { name: "DPD", domains: ["dpd.co.uk", "dpdlocal.co.uk"], sure: null, labelled: /^(?:\d{14}|\d{10})$/, track: (r) => `https://track.dpd.co.uk/parcels/${enc(r)}` },
  ups: { name: "UPS", domains: ["ups.com"], sure: /\b1Z[0-9A-Z]{16}\b/, labelled: /^1Z[0-9A-Z]{16}$/, track: (r) => `https://www.ups.com/track?tracknum=${enc(r)}` },
  dhl: { name: "DHL", domains: ["dhl.com", "dhl.co.uk"], sure: /\bJJD\d{10,20}\b/, labelled: /^(?:\d{10}|JJD\d{10,20})$/, track: (r) => `https://www.dhl.com/gb-en/home/tracking.html?tracking-id=${enc(r)}` },
  yodel: { name: "Yodel", domains: ["yodel.co.uk"], sure: /\bJD\d{16,18}\b/, labelled: /^(?:JD\d{16,18}|\d{16})$/, track: (r) => `https://www.yodel.co.uk/track/${enc(r)}` },
  parcelforce: { name: "Parcelforce", domains: ["parcelforce.co.uk", "parcelforce.com"], sure: /\b[A-Z]{2}\d{9}GB\b/, labelled: /^(?:[A-Z]{2}\d{7}|[A-Z]{2}\d{9}GB)$/, track: (r) => `https://www.parcelforce.com/track-trace?trackNumber=${enc(r)}` },
  amazon: { name: "Amazon", domains: ["amazon.co.uk", "amazon.com"], sure: /\bTBA\d{9,12}\b/, labelled: /^TBA\d{9,12}$/, track: null },
};
const ORDER_PAGE = { "amazon.co.uk": "https://www.amazon.co.uk/gp/your-account/order-details?orderID=", "amazon.com": "https://www.amazon.com/gp/your-account/order-details?orderID=" };
const AMAZON_ORDER = /\b\d{3}-\d{7}-\d{7}\b/;

// (the shops whose returns period is known, in days from the order: no others get a last day to return)
export const RETURNS = { amazon: 30, zara: 30, asos: 28, wiggle: 30, "john lewis": 35, next: 28, "m&s": 35, "marks & spencer": 35, "marks and spencer": 35, "h&m": 28, uniqlo: 30 };
const fold = (s) => String(s || "").normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();
export const returnsOf = (shop) => RETURNS[fold(shop).replace(/\.(?:co\.uk|com)$/, "")] ?? null;

// The address's domain, and whether it's one of a list's (that domain, or a name under it)
export const domainOf = (email) => String(email || "").toLowerCase().replace(/^.*@/, "").replace(/\.$/, "").trim();
export const under = (d, base) => !!d && (d === base || d.endsWith(`.${base}`));
export function courierOf(email) {
  const d = domainOf(email);
  for (const [key, c] of Object.entries(COURIERS)) { const base = c.domains.find((b) => under(d, b)); if (base) return { key, base, ...c }; }
  return null;
}
const courierByName = (name) => {
  const n = fold(name).replace(/\b(?:uk|ltd|limited|group|parcels?|logistics)\b/g, "").replace(/\s+/g, " ").trim();
  if (!n) return null;
  const alias = { hermes: "evri", "royal mail": "royalmail", "dpd local": "dpd", "parcel force": "parcelforce", "amazon": "amazon" };
  const key = alias[n] || Object.keys(COURIERS).find((k) => fold(COURIERS[k].name) === n);
  return key ? { key, ...COURIERS[key] } : null;
};

// A courier's own tracking page for a number of its own form; else null (never an address from the email)
export function trackOf(key, ref, order = "", base = "") {
  const c = COURIERS[key];
  const r = String(ref || "").toUpperCase();
  if (c?.track && r && c.labelled.test(r)) return c.track(r);
  if (key === "amazon" && AMAZON_ORDER.test(order || "")) return (ORDER_PAGE[base] || ORDER_PAGE["amazon.co.uk"]) + enc(order);
  return null;
}

// ---------------------------------------------------------------------------------------------------------------------
// Words, as rules read them: the body's text (or its HTML's), one line a paragraph or a table's row
// ---------------------------------------------------------------------------------------------------------------------
export function textOf(text, html) {
  let t = String(text || "");
  if (!t.trim() && html) t = String(html).replace(/<(script|style|head)\b[\s\S]*?<\/\1\s*>/gi, " ").replace(/<br\s*\/?>|<\/(p|div|tr|li|h\d|table|section)>/gi, "\n").replace(/<\/t[dh]>/gi, " ");
  return t.slice(0, 60000).split(/\n/).map((l) => plain(l)).filter(Boolean).join("\n");
}

const MON = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };
const WDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const MONTH_RE = "(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";
// (a calendar day as { y, mo, d }, in the account's zone, of a moment)
export const wallDay = (ms, zone) => { const p = zoneParts(ms, zone); return { y: p.y, mo: p.mo, d: p.d }; };
const dnum = (w) => Date.UTC(w.y, w.mo - 1, w.d) / DAY;
const fromDn = (n) => { const x = new Date(n * DAY); return { y: x.getUTCFullYear(), mo: x.getUTCMonth() + 1, d: x.getUTCDate() }; };
// A day an email names (today, tomorrow, a weekday, "6 November", "Nov 6", "06/11/2026"), from the day it came: → { y, mo,
// d } | null. relative: whether today, tomorrow and a bare weekday count (an absolute date always does)
export function dayIn(s, mailMs, zone, { relative = true } = {}) {
  s = String(s || "").toLowerCase();
  const base = wallDay(mailMs, zone), n0 = dnum(base);
  const found = [];
  const add = (i, w) => w && found.push([i, w]);
  let m;
  const absolute = (y, mo, d) => {
    if (!(mo >= 1 && mo <= 12 && d >= 1 && d <= 31)) return null;
    let yy = y ? (y < 100 ? 2000 + y : y) : base.y;
    if (!y && dnum({ y: yy, mo, d }) < n0 - 60) yy++;
    const x = new Date(Date.UTC(yy, mo - 1, d));
    return x.getUTCDate() === d ? { y: yy, mo, d } : null;
  };
  for (m of s.matchAll(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?${MONTH_RE}\\b,?(?:\\s+(\\d{4}))?`, "g"))) add(m.index, absolute(m[3] ? +m[3] : 0, MON[m[2].slice(0, 3) === "sep" ? "sep" : m[2].slice(0, 3)], +m[1]));
  for (m of s.matchAll(new RegExp(`\\b${MONTH_RE}\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b,?(?:\\s+(\\d{4}))?`, "g"))) add(m.index, absolute(m[3] ? +m[3] : 0, MON[m[1].slice(0, 3)], +m[2]));
  for (m of s.matchAll(/\b(\d{1,2})\/(\d{1,2})\/(\d{4}|\d{2})\b/g)) add(m.index, absolute(+m[3], +m[2], +m[1]));
  if (relative) {
    for (m of s.matchAll(/\b(today|tonight|tomorrow)\b/g)) add(m.index, fromDn(n0 + (m[1] === "tomorrow" ? 1 : 0)));
    for (m of s.matchAll(/\b(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b(?!\s+\d)/g)) add(m.index, fromDn(n0 + ((WDAYS.indexOf(m[1]) - new Date(n0 * DAY).getUTCDay() + 7) % 7)));
  }
  found.sort((a, b) => a[0] - b[0]);
  return found[0]?.[1] || null;
}

// "between 11:00 and 13:00", "11:00 - 12:00", "between 11am and 1pm" → [from, to] in minutes of the day | null
export function windowIn(s) {
  const T = String.raw`(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)?`;
  const mins = (h, mi, ap) => { h = +h; mi = +(mi || 0); if (ap) { if (h < 1 || h > 12) return null; h = (h % 12) + (ap.toLowerCase() === "pm" ? 12 : 0); } return h <= 24 && mi < 60 ? h * 60 + mi : null; };
  for (const re of [new RegExp(String.raw`\bbetween\s+${T}\s*(?:and|-|–|to)\s*${T}`, "i"), new RegExp(String.raw`\b${T}\s*(?:-|–|to)\s*${T}\b`, "i")]) {
    for (const m of String(s || "").matchAll(new RegExp(re.source, "gi"))) {
      // (a bare range is a time only where it says so: 11:00, 11am; never "1-2 days")
      if (!/^between/i.test(m[0]) && !((m[2] || m[3]) && (m[5] || m[6]))) continue;
      const a = mins(m[1], m[2], m[3] || m[6]), b = mins(m[4], m[5], m[6]);
      if (a != null && b != null && b > a && b - a <= 12 * 60) return [a, b];
    }
  }
  return null;
}

// ---------------------------------------------------------------------------------------------------------------------
// 1. schema.org: ParcelDelivery and Order
// ---------------------------------------------------------------------------------------------------------------------
const one = (v) => (Array.isArray(v) ? v.find((x) => x != null && x !== "") : v);
const obj = (v) => { v = one(v); return v && typeof v === "object" ? v : null; };
const str = (v) => { v = one(v); if (v && typeof v === "object") v = one(v.name) ?? one(v["@id"]) ?? one(v["@value"]) ?? ""; return typeof v === "string" || typeof v === "number" ? plain(v) : ""; };
const typesOf = (o) => [].concat(o?.["@type"] ?? []).map((t) => String(t).replace(/^.*[/#:]/, ""));
const isA = (o, t) => typesOf(o).includes(t);
function stageOfStatus(v) {
  const s = str(v).replace(/^.*[/#:]/, "").toLowerCase().replace(/[\s_-]/g, "");
  if (!s) return null;
  if (/cancel|returned|problem/.test(s)) return -1;
  if (/delivered/.test(s)) return 3;
  if (/pickupavailable|readyforcollection|readytocollect/.test(s)) return 2.5;
  if (/outfordelivery/.test(s)) return 2;
  if (/intransit|shipped|dispatched|despatched/.test(s)) return 1;
  if (/processing|ordered|received|paymentdue|confirmed/.test(s)) return 0;
  return null;
}
function nodesOf(roots) {
  const out = [], seen = new Set(), ids = new Map();
  const index = (v, d) => { if (d > 12 || !v || typeof v !== "object") return; if (Array.isArray(v)) return v.forEach((x) => index(x, d + 1)); if (typeof v["@id"] === "string" && Object.keys(v).length > 1) ids.set(v["@id"], v); for (const k in v) index(v[k], d + 1); };
  roots.forEach((r) => index(r, 0));
  const walk = (v, d) => {
    if (d > 12 || out.length > 40 || !v || typeof v !== "object") return;
    if (Array.isArray(v)) return v.forEach((x) => walk(x, d + 1));
    if (typeof v["@id"] === "string" && Object.keys(v).length === 1 && ids.has(v["@id"])) v = ids.get(v["@id"]);
    if (seen.has(v)) return;
    seen.add(v);
    if (isA(v, "ParcelDelivery") || isA(v, "Order")) out.push(v);
    for (const k in v) walk(v[k], d + 1);
  };
  roots.forEach((r) => walk(r, 0));
  const deref = (v) => (v && typeof v === "object" && typeof v["@id"] === "string" && Object.keys(v).length === 1 && ids.get(v["@id"])) || v;
  return { nodes: out, deref };
}
function fromSchema(html, { mailDate, zone }) {
  if (!/application\/ld\+json|itemscope/i.test(html || "")) return [];
  const { nodes, deref } = nodesOf([...jsonLd(html), ...microdata(html)]);
  const out = [], orders = new Set();
  const orderFacts = (o) => {
    o = deref(obj(o));
    if (!o) return {};
    orders.add(o);
    const offers = [].concat(o.acceptedOffer ?? o.orderedItem ?? []).filter((x) => x && typeof x === "object");
    const t = timeOf(o.orderDate, zone);
    return { order: cut(str(o.orderNumber), 32), shop: cut(str(o.seller) || str(o.merchant) || str(o.broker), 40), orderedAt: t ? t.ms : null, items: offers.length || null, status: stageOfStatus(o.orderStatus) };
  };
  for (const n of nodes.filter((x) => isA(x, "ParcelDelivery"))) {
    const o = orderFacts(n.partOfOrder);
    const carrierName = str(n.carrier) || str(n.provider) || str(n.hasDeliveryMethod);
    const c = courierByName(carrierName);
    const status = stageOfStatus(n.deliveryStatus) ?? o.status;
    if (status === -1) continue;
    const a = timeOf(n.expectedArrivalFrom, zone), b = timeOf(n.expectedArrivalUntil, zone);
    let window = null, due = null;
    const day = (t) => { const w = t.wall || wallDay(t.ms, zone); return zonedMs(w.y, w.mo, w.d, 0, 0, 0, zone); };
    if (a && b && !a.dateOnly && !b.dateOnly && day(a) === day(b) && b.ms > a.ms && b.ms - a.ms <= 12 * H) { window = { from: a.ms, to: b.ms }; due = day(a); }
    else if (a || b) due = day(a || b);
    out.push({
      source: "schema", carrierKey: c?.key || null, carrier: cut(c?.name || carrierName, 40), shop: o.shop || "", order: o.order || "", orderedAt: o.orderedAt,
      ref: cut(str(n.trackingNumber).replace(/\s+/g, "").toUpperCase(), 32), stage: status == null ? 1 : Math.floor(status), note: status === 2.5 ? "Ready to collect" : "",
      window, due, deliveredAt: status === 3 ? mailDate : null, failed: false, items: o.items,
    });
  }
  for (const o of nodes.filter((x) => isA(x, "Order") && !orders.has(x))) {
    const f = orderFacts(o);
    if (f.status === -1 || !f.order) continue;
    out.push({ source: "schema", carrierKey: null, carrier: "", shop: f.shop, order: f.order, orderedAt: f.orderedAt ?? (f.status === 0 || f.status == null ? mailDate : null), ref: "",
      stage: f.status == null ? 0 : Math.floor(f.status), note: f.status === 2.5 ? "Ready to collect" : "", window: null, due: null, deliveredAt: f.status === 3 ? mailDate : null, failed: false, items: f.items });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------------
// 2. Rules, for the couriers' and the big shops' own emails
// ---------------------------------------------------------------------------------------------------------------------
const PHRASES = {
  delivered: /\b(?:has|have|was|were) been delivered\b|\bwas delivered\b|\bdelivered:|^delivered\b|\bwe(?:'|’)ve delivered\b|\bsuccessfully delivered\b|\bhas arrived\b|\bdelivered (?:to|today at|at \d)/im,
  failed: /\b(?:sorry,? we missed you|we missed you|couldn(?:'|’)t deliver|could not deliver|unable to deliver|delivery (?:was )?unsuccessful|attempted (?:to deliver|delivery)|tried to deliver)\b/i,
  out: /\bout for delivery\b|\b(?:arriving|coming|delivering it|will be delivered|be with you|on (?:its|it(?:'|’)s) way to you) today\b|\byour (?:parcel|package|delivery) is (?:with your|on the van)/i,
  shipped: /\b(?:shipped|dispatched|despatched|on its way|on the way|in transit|handed (?:it )?(?:over )?to)\b|\bwith (?:the |our )?courier\b|\bwe(?:'|’)ve (?:got|received) your parcel\b/i,
  ordered: /\b(?:order (?:confirmation|confirmed|received|placed)|thanks for your order|thank you for your order|we(?:'|’)ve received your order)\b/i,
};
const NOTE = /\b(left (?:in|at|on|with|behind|by|outside) [^.,;\n]{2,40}|delivered to (?:your )?(?:neighbour|safe ?place|porch|reception|parcel (?:locker|box)|front door)[^.,;\n]{0,30}|(?:handed|given) to (?:a |your )?(?:neighbour|resident|reception|you)[^.,;\n]{0,30}|(?:put|placed) (?:in|through) (?:your )?(?:letterbox|safe ?place|porch|parcel box))/i;
const SHOP_FROM = /\b(?:[Pp]arcel|[Oo]rder|[Pp]ackage|[Ii]tem|[Dd]elivery|[Pp]urchase)(?: [A-Z0-9]{8,30})? from ([A-Z0-9][A-Za-z0-9&'’.+]*(?: (?:&|and|[A-Z0-9][A-Za-z0-9&'’.+]*)){0,3})/;
const SHOP_YOUR = /\b[Yy]our ((?:[A-Z][A-Za-z0-9&'’.+]*)(?: [A-Z&][A-Za-z0-9&'’.+]*){0,2}) (?:parcel|order|package|delivery)\b/;
const NOT_SHOP = /^(?:Your|The|Us|You|Our|Amazon Logistics|Royal Mail|Evri|DPD|UPS|DHL|Yodel|Parcelforce|Hermes|Tracking|Order|Parcel|Delivery|Today|Tomorrow)$/;
const cap1 = (s) => s.charAt(0).toUpperCase() + s.slice(1);

function refIn(t, c, all) {
  // (beside its label, of the courier's own form; else one only that courier's numbers look like)
  for (const m of t.matchAll(/\b(?:tracking|parcel|shipment|consignment|item|reference)\s*(?:number|no\.?|id|ref(?:erence)?|code)?\s*(?:is|:|#)?\s*([A-Z0-9][A-Z0-9 ]{6,30}[A-Z0-9])\b/gi)) {
    const r = m[1].replace(/\s+/g, "").toUpperCase();
    for (const k of all) if (COURIERS[k].labelled.test(r)) return { ref: r, key: k };
    // (a number beside the label with a space or two in it, as some write theirs)
    const firstWord = m[1].split(/\s+/)[0].toUpperCase();
    for (const k of all) if (COURIERS[k].labelled.test(firstWord)) return { ref: firstWord, key: k };
  }
  for (const k of all) { const re = COURIERS[k].sure; const m = re && re.exec(t); if (m) return { ref: m[0].toUpperCase(), key: k }; }
  return null;
}

// (the day a shop's email says it was ordered: "Order placed: 4 November")
const orderDay = (t, mailDate, zone) => { const m = /\border (?:placed|date|made)[:\s]+([^\n]{0,30})/i.exec(t); const d = m && dayIn(m[1], mailDate, zone, { relative: false }); return d ? zonedMs(d.y, d.mo, d.d, 12, 0, 0, zone) : null; };
function fromRules({ text, subject, sender, mailDate, zone }) {
  const c = courierOf(sender);
  if (!c) return [];
  const all = `${subject}\n${text}`;
  const shopMail = c.key === "amazon";
  let stage = PHRASES.delivered.test(all) ? 3 : PHRASES.failed.test(all) ? 1 : PHRASES.out.test(all) ? 2 : PHRASES.shipped.test(all) ? 1 : shopMail && PHRASES.ordered.test(all) ? 0 : null;
  // ("will be delivered today" is out for delivery, not delivered)
  if (stage === 3 && /\b(?:will be|to be|being|be) delivered\b/i.test(all) && !/\b(?:has|have|was) been delivered\b|\bwas delivered\b|\bdelivered:|^delivered\b/im.test(all)) stage = PHRASES.out.test(all) ? 2 : 1;
  if (stage == null) return [];
  const failed = stage === 1 && PHRASES.failed.test(all) && !PHRASES.delivered.test(all);
  // (who carries it: the courier itself, or for a shop's email the courier it names)
  let carrier = shopMail ? null : { key: c.key, ...COURIERS[c.key] };
  if (shopMail) {
    const by = /\b(?:delivered|shipped|dispatched|despatched|sent|carried|coming|travelling) (?:by|with|via) (Royal Mail|Evri|Hermes|DPD(?: Local)?|UPS|DHL|Yodel|Parcelforce|Amazon(?: Logistics)?)\b/i.exec(all);
    carrier = courierByName(by?.[1] || "Amazon");
  }
  const keys = carrier ? [carrier.key, ...Object.keys(COURIERS).filter((k) => k !== carrier.key)] : Object.keys(COURIERS);
  const found = refIn(all, carrier, shopMail ? keys : [c.key]);
  const ref = found ? cut(found.ref, 32) : "";
  if (shopMail && found && found.key !== carrier?.key && found.key !== "amazon") carrier = { key: found.key, ...COURIERS[found.key] };
  const order = cut(shopMail ? AMAZON_ORDER.exec(all)?.[0] || "" : /\border\s*(?:number|no\.?|ref(?:erence)?)?\s*[:#]?\s*([A-Z0-9][A-Z0-9-]{4,30})\b/i.exec(all)?.[1] || "", 32);
  // (nothing to know it by: not a parcel this can follow)
  if (!ref && !order) return [];
  let shop = shopMail ? "Amazon" : "";
  if (!shop) {
    const m = SHOP_FROM.exec(all) || SHOP_YOUR.exec(all);
    const s = m && m[1].replace(/[.’']+$/, "").trim();
    if (s && !NOT_SHOP.test(s) && fold(s) !== fold(c.name)) shop = cut(cap1(s), 40);
  }
  // (when: today's window, or the day it's due)
  let window = null, due = null, deliveredAt = null;
  const w = windowIn(all);
  let day = null;
  for (const m of all.matchAll(/\b(?:arriving|arrives|arrive|expected|estimated delivery|delivery (?:date|day)|due|will be delivered|should arrive|get it|deliver (?:it|your parcel))\b[^.\n]{0,60}/gi))
    if ((day = dayIn(m[0], mailDate, zone))) break;
  day ||= stage === 2 ? wallDay(mailDate, zone) : null;
  if (stage === 3) {
    day = null;
    const at = /\bdelivered\b[^.\n]{0,30}?\bat (\d{1,2})[:.](\d{2})\b/i.exec(all);
    const md = wallDay(mailDate, zone);
    deliveredAt = at && +at[1] < 24 && +at[2] < 60 ? zonedMs(md.y, md.mo, md.d, +at[1], +at[2], 0, zone) : mailDate;
    if (deliveredAt > mailDate + H) deliveredAt = mailDate;
  } else if (day) {
    due = zonedMs(day.y, day.mo, day.d, 0, 0, 0, zone);
    if (w) window = { from: zonedMs(day.y, day.mo, day.d, Math.floor(w[0] / 60), w[0] % 60, 0, zone), to: zonedMs(day.y, day.mo, day.d, Math.floor(w[1] / 60), w[1] % 60, 0, zone) };
  }
  const note = stage === 3 ? cut(cap1((NOTE.exec(all)?.[1] || "").trim()), 60) : failed ? "Missed delivery" : /\b(?:ready (?:to|for) (?:collect|collection)|available (?:to|for) collect)/i.test(all) ? "Ready to collect" : "";
  return [{
    source: "rules", carrierKey: carrier?.key || null, carrier: cut(carrier?.name || "", 40), base: c.base, shop, order, ref, stage, failed, window, due, deliveredAt, note,
    orderedAt: shopMail ? (stage === 0 ? mailDate : orderDay(all, mailDate, zone)) : null, items: null,
  }];
}

// An email's parcels: { html, text, subject, sender, mailDate, zone } → [{ source, carrierKey, carrier, shop, order, ref,
// stage 0–3, failed, window, due, deliveredAt, note, orderedAt }]. The order details first; rules only where there are none
export function parcelsOf({ html = "", text = "", subject = "", sender = "", mailDate = Date.now(), zone = "Europe/London" }) {
  const schema = fromSchema(html, { mailDate, zone });
  if (schema.length) {
    // (the courier's own form for the number, where the sender is that courier)
    const c = courierOf(sender);
    return schema.slice(0, 5).map((p) => ({ ...p, base: c?.base || "", carrierKey: p.carrierKey || c?.key || null, carrier: p.carrier || c?.name || "" }));
  }
  return fromRules({ text: textOf(text, html), subject: plain(subject), sender, mailDate, zone });
}

// ---------------------------------------------------------------------------------------------------------------------
// Kept, in Mail's database (db.js: parcels; spot_threads, spot_wrong as for bookings): one row a parcel, joined across its
// emails by its tracking number, else by its order number and shop. 0 ordered, 1 on its way, 2 out for delivery, 3
// delivered; a delivered one stays delivered, a missed one is on its way again; an older email never undoes a newer one's
// when, where or what it says
// ---------------------------------------------------------------------------------------------------------------------
const PCOLS = ["id", "shop", "carrier", "carrier_key", "base", "stage", "win_from", "win_to", "due_at", "delivered_at", "note", "ref", "order_no", "ordered_at", "return_by",
  "thread_id", "message_id", "sender", "source", "hidden", "mail_date", "created", "updated"];
const PUPSERT = `INSERT INTO parcels (${PCOLS.join(", ")}) VALUES (${PCOLS.map((_, i) => `?${i + 1}`).join(", ")})
  ON CONFLICT(id) DO UPDATE SET ${PCOLS.filter((c) => !["id", "created", "hidden"].includes(c)).map((c) => `${c} = excluded.${c}`).join(", ")}`;
// (the last day to return, from the order's day and the shop's returns period: the end of that day)
const returnBy = (shop, orderedAt, zone) => {
  const days = returnsOf(shop);
  if (!days || !Number.isFinite(orderedAt)) return null;
  const w = wallDay(orderedAt, zone);
  return zonedMs(w.y, w.mo, w.d + days + 1, 0, 0, 0, zone) - 1;
};

export async function keepParcels(env, list, { threadId, messageId, sender, mailDate, zone = "Europe/London", now = Date.now() }) {
  if (!list.length) return 0;
  sender = String(sender || "").toLowerCase();
  if (await env.DB.prepare(`SELECT 1 AS k FROM spot_wrong WHERE sender = ?1 AND kind = 'parcel'`).bind(sender).first()) return 0;
  let n = 0;
  for (const p of list) {
    let row = p.ref ? await env.DB.prepare(`SELECT * FROM parcels WHERE ref = ?1 ORDER BY updated DESC LIMIT 1`).bind(p.ref).first() : null;
    if (!row && p.order)
      row = await env.DB.prepare(`SELECT * FROM parcels WHERE order_no = ?1 AND (COALESCE(shop, '') = '' OR ?2 = '' OR lower(shop) = lower(?2)) ORDER BY updated DESC LIMIT 1`).bind(p.order, p.shop || "").first();
    // (a delivered one long gone, read again from the read-back: not made again)
    if (!row && p.stage === 3 && (p.deliveredAt ?? mailDate) < now - 18 * H && !returnBy(p.shop, p.orderedAt, zone)) continue;
    const newer = !row || mailDate >= row.mail_date;
    const id = row?.id || `parcel-${await hashOf(p.ref ? `ref|${p.ref}` : p.order ? `order|${p.order}|${fold(p.shop)}` : `msg|${messageId}`)}`;
    const stage = !row ? p.stage : row.stage === 3 || p.stage === 3 ? 3 : p.failed && newer ? 1 : Math.max(row.stage, p.stage);
    const r = row ? { ...row } : { id, hidden: 0, created: now, shop: "", carrier: "", carrier_key: null, base: "", ref: "", order_no: "", note: "", mail_date: 0 };
    r.stage = stage;
    r.shop = r.shop || p.shop || "";
    r.ref = r.ref || p.ref || "";
    r.order_no = r.order_no || p.order || "";
    if (p.carrierKey && (newer || !r.carrier_key)) { r.carrier_key = p.carrierKey; r.carrier = p.carrier; }
    else if (!r.carrier && p.carrier) r.carrier = p.carrier;
    if (p.base && (newer || !r.base)) r.base = p.base;
    if (newer && p.due != null) { r.due_at = p.due; r.win_from = p.window?.from ?? null; r.win_to = p.window?.to ?? null; }
    if (newer && (p.note || (row && p.stage !== row.stage))) r.note = p.note || "";
    if (stage === 3) r.delivered_at = r.delivered_at ?? p.deliveredAt ?? mailDate;
    const ordered = [r.ordered_at, p.orderedAt].filter(Number.isFinite);
    r.ordered_at = ordered.length ? Math.min(...ordered) : null;
    r.return_by = returnBy(r.shop, r.ordered_at, zone);
    if (newer) Object.assign(r, { thread_id: threadId, message_id: messageId, sender, source: p.source, mail_date: mailDate });
    r.updated = now;
    await env.DB.batch([
      env.DB.prepare(PUPSERT).bind(...PCOLS.map((c) => r[c] ?? (["stage", "hidden", "mail_date", "created", "updated"].includes(c) ? 0 : null))),
      env.DB.prepare(`INSERT OR IGNORE INTO spot_threads (spot_id, thread_id) VALUES (?1, ?2)`).bind(id, threadId),
    ]);
    n++;
  }
  return n;
}

const parcelOut = (r) => ({
  id: r.id, shop: cut(r.shop || r.carrier || "", 40), carrier: cut(r.carrier || "", 40), stage: Math.max(0, Math.min(3, r.stage | 0)),
  window: Number.isFinite(r.win_from) && Number.isFinite(r.win_to) ? { from: r.win_from, to: r.win_to } : null,
  due: Number.isFinite(r.due_at) ? r.due_at : null, deliveredAt: Number.isFinite(r.delivered_at) ? r.delivered_at : null, note: cut(r.note || "", 60),
  track: r.carrier_key ? trackOf(r.carrier_key, r.ref, r.order_no, r.base) : null, ref: cut(r.ref || "", 32), order: cut(r.order_no || "", 32), thread: r.thread_id || null,
  returnBy: Number.isFinite(r.return_by) ? r.return_by : null,
});

// For Today's card: those not taken off that are on their way (heard of in the last 30 days), delivered in the last 18
// hours, or whose last day to return is in the next 3; soonest first, 10 at most
export async function parcelsCard(env, now = Date.now()) {
  const { results } = await env.DB.prepare(
    `SELECT * FROM parcels WHERE hidden = 0 AND ((stage < 3 AND mail_date >= ?1) OR (stage = 3 AND delivered_at >= ?2) OR (return_by >= ?3 AND return_by <= ?4)) LIMIT 200`
  ).bind(now - 30 * DAY, now - 18 * H, now, now + 3 * DAY).all();
  const when = (r) => (r.stage < 3 ? r.win_from ?? r.due_at ?? now + 30 * DAY : r.delivered_at >= now - 18 * H ? r.delivered_at : r.return_by);
  return results.sort((a, b) => when(a) - when(b) || (a.id < b.id ? -1 : 1)).slice(0, 10).map(parcelOut);
}
// For the strip: a conversation's parcels (taken off ones too, said so)
export async function threadParcels(env, threadId) {
  const { results } = await env.DB.prepare(
    `SELECT p.*, (SELECT from_name FROM messages m WHERE m.id = p.message_id) AS from_name FROM parcels p
       WHERE p.thread_id = ?1 OR p.id IN (SELECT spot_id FROM spot_threads WHERE thread_id = ?1) ORDER BY p.updated DESC LIMIT 4`
  ).bind(threadId).all();
  return results.map((r) => ({ ...parcelOut(r), kind: "parcel", hidden: !!r.hidden, source: r.source, sender: cut(r.from_name || r.carrier || r.sender || "", 60) }));
}
