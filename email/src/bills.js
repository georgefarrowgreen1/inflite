// Mail on Your Day, stage 2: bills and subscriptions, read from mail by rules alone (spot.js's way: no AI of any kind,
// nothing sent anywhere to be read; one it's unsure of, the amount or the date, is left alone). In this order of trust:
//   1. the invoice a company puts in its email in schema.org's form (JSON-LD or microdata): Invoice;
//   2. rules for the senders of UK household bills and subscriptions, by the domain of the address they're from (that
//      domain, or a name under it; never one that only looks like it), and only where DMARC passed for it.
// In pounds alone: an amount in another currency isn't read. Kinds: "bill" (an amount due), "renewal" (renews on a
// date at a price; was: last year's, or the price before), "trial" (a free trial ends on a date, then a price), "sub" (a
// charge made: a receipt). Each sender's amounts are kept (bill_history, 13 months), so a new one is set beside its usual.
import { jsonLd, microdata, plain, cut, timeOf, zonedMs, hashOf } from "./spot.js";
import { domainOf, under, textOf, dayIn, wallDay } from "./parcels.js";

export const CATS = ["Home", "Phone and internet", "Subscriptions", "Car", "Other"];
// (the senders read by rules: their domains, their name, and what they're for)
const S = (name, cat, domains, o = {}) => domains.map((d) => [d, { name, cat, ...o }]);
export const SENDERS = Object.fromEntries([
  ...S("Octopus Energy", "Home", ["octopus.energy"]), ...S("British Gas", "Home", ["britishgas.co.uk"]), ...S("EDF", "Home", ["edfenergy.com"]),
  ...S("E.ON Next", "Home", ["eonnext.com"]), ...S("OVO", "Home", ["ovoenergy.com"]),
  ...S("Thames Water", "Home", ["thameswater.co.uk"]), ...S("Severn Trent", "Home", ["severntrent.co.uk", "stwater.co.uk"]), ...S("United Utilities", "Home", ["unitedutilities.com"]),
  ...S("Anglian Water", "Home", ["anglianwater.co.uk"]), ...S("Yorkshire Water", "Home", ["yorkshirewater.com"]), ...S("South West Water", "Home", ["southwestwater.co.uk"]),
  ...S("Wessex Water", "Home", ["wessexwater.co.uk"]), ...S("Southern Water", "Home", ["southernwater.co.uk"]),
  ...S("EE", "Phone and internet", ["ee.co.uk"]), ...S("Vodafone", "Phone and internet", ["vodafone.co.uk"]), ...S("O2", "Phone and internet", ["o2.co.uk"]),
  ...S("Three", "Phone and internet", ["three.co.uk"]), ...S("BT", "Phone and internet", ["bt.com"]), ...S("Virgin Media", "Phone and internet", ["virginmedia.com"]),
  ...S("Sky", "Phone and internet", ["sky.com"]),
  ...S("Admiral", "insurer", ["admiral.com"]), ...S("Aviva", "insurer", ["aviva.co.uk"]), ...S("Direct Line", "insurer", ["directline.com"]),
  ...S("Churchill", "insurer", ["churchill.com"]), ...S("LV=", "insurer", ["lv.com"]),
  ...S("Netflix", "Subscriptions", ["netflix.com"]), ...S("Spotify", "Subscriptions", ["spotify.com"]), ...S("Apple", "Subscriptions", ["apple.com"]),
  ...S("Disney+", "Subscriptions", ["disneyplus.com"]), ...S("Strava", "Subscriptions", ["strava.com"]), ...S("YouTube", "Subscriptions", ["youtube.com"]),
  ...S("Google", "Subscriptions", ["google.com"]), ...S("Amazon Prime", "Subscriptions", ["amazon.co.uk"], { needs: /\bprime\b/i }),
  ...S("DVLA", "Car", ["dvla.gov.uk"]),
]);
// The sender an address is, by its domain: { key (the domain it's under), name, cat } | null. A council's own (*.gov.uk)
// only for council tax
export function senderOf(email, fromName = "", words = "") {
  const d = domainOf(email);
  for (const [base, s] of Object.entries(SENDERS)) {
    if (!under(d, base)) continue;
    if (s.needs && !s.needs.test(words)) return null;
    return { key: base, name: s.name, cat: s.cat };
  }
  if (/\.gov\.uk$/.test(d) && /\bcouncil tax\b/i.test(words)) {
    const label = d.replace(/\.gov\.uk$/, "").split(".").pop();
    const name = /council/i.test(fromName) ? cut(fromName, 40) : `${label.charAt(0).toUpperCase()}${label.slice(1)} Council`;
    return { key: `${label}.gov.uk`, name, cat: "Home" };
  }
  return null;
}
// (an insurer's category, by what it insures)
const insured = (t) => (/\b(?:car|motor|vehicle|van)\b/i.test(t) ? "Car" : /\b(?:home|buildings|contents|house)\b/i.test(t) ? "Home" : "Other");

// ---------------------------------------------------------------------------------------------------------------------
// Pounds and dates
// ---------------------------------------------------------------------------------------------------------------------
const AMT = String.raw`£\s?((?:\d{1,3}(?:,\d{3})+|\d{1,6})(?:\.\d{2})?)\b`;
export const penceOf = (s) => { const n = Math.round(Number(String(s).replace(/,/g, "")) * 100); return Number.isInteger(n) && n > 0 && n < 10000000 ? n : null; };
// (the first amount after one of the labels, in pence; each label tried in turn)
function labelled(t, labels) {
  for (const l of labels) {
    const m = new RegExp(String.raw`\b(?:${l})[^£$€\n]{0,40}${AMT}`, "i").exec(t);
    if (m) return penceOf(m[1]);
  }
  return null;
}
// (the one date after a label: never a bare weekday, never one made up)
function dated(t, labels, mailDate, zone) {
  for (const l of labels) {
    const m = new RegExp(String.raw`\b(?:${l})[:\s]+([^\n£]{0,40})`, "i").exec(t);
    const d = m && dayIn(m[1], mailDate, zone, { relative: false });
    if (d) return zonedMs(d.y, d.mo, d.d, 0, 0, 0, zone);
  }
  return null;
}
const perOf = (t) => (/\b(?:a|per|each|every|\/)\s?(?:month|mo)\b|\bmonthly\b/i.test(t) ? "m" : /\b(?:a|per|each|every|\/)\s?(?:year|yr)\b|\b(?:annual|annually|yearly)\b/i.test(t) ? "y" : /\bquarter(?:ly)?\b/i.test(t) ? "q" : null);
const AUTO = /\bdirect debit\b|\bwill be (?:taken|collected|charged) (?:automatically|from your (?:account|bank|card)|to your (?:card|payment method))|\bwe(?:'|’)ll (?:take|collect|charge)\b|\bcard on file\b|\bpaid automatically\b|\bautomatic(?:ally)? (?:payment|renew|charged)|\brecurring payment\b|\bcharged to your (?:card|payment method)\b|\bpayment method on file\b/i;

// ---------------------------------------------------------------------------------------------------------------------
// 1. schema.org: Invoice
// ---------------------------------------------------------------------------------------------------------------------
const one = (v) => (Array.isArray(v) ? v.find((x) => x != null && x !== "") : v);
const obj = (v) => { v = one(v); return v && typeof v === "object" ? v : null; };
const str = (v) => { v = one(v); if (v && typeof v === "object") v = one(v.name) ?? one(v["@id"]) ?? one(v["@value"]) ?? ""; return typeof v === "string" || typeof v === "number" ? plain(v) : ""; };
const typesOf = (o) => [].concat(o?.["@type"] ?? []).map((t) => String(t).replace(/^.*[/#:]/, ""));
function invoices(roots) {
  const out = [];
  const walk = (v, d) => {
    if (d > 12 || out.length > 5 || !v || typeof v !== "object") return;
    if (Array.isArray(v)) return v.forEach((x) => walk(x, d + 1));
    if (typesOf(v).includes("Invoice")) return void out.push(v);
    for (const k in v) walk(v[k], d + 1);
  };
  roots.forEach((r) => walk(r, 0));
  return out;
}
// (a price as schema.org gives it: a number, "£84.20", or a PriceSpecification / MonetaryAmount, in pounds alone)
function poundsOf(v) {
  const o = obj(v);
  if (o) {
    const cur = str(o.priceCurrency ?? o.currency).toUpperCase();
    if (cur && cur !== "GBP") return null;
    return poundsOf(o.price ?? o.value);
  }
  const s = str(v);
  if (/[$€¥]|\b(?:USD|EUR)\b/i.test(s)) return null;
  const m = /^\s*(?:£|GBP\s*)?((?:\d{1,3}(?:,\d{3})+|\d{1,7})(?:\.\d{1,2})?)\s*$/i.exec(s);
  return m ? penceOf(m[1]) : null;
}
function fromSchema(html, { sender, fromName, mailDate, zone, words }) {
  if (!/application\/ld\+json|itemscope/i.test(html || "")) return [];
  const out = [];
  for (const inv of invoices([...jsonLd(html), ...microdata(html)])) {
    const amount = poundsOf(inv.totalPaymentDue) ?? poundsOf(inv.minimumPaymentDue);
    const t = timeOf(inv.paymentDueDate ?? inv.paymentDue, zone);
    const status = str(inv.paymentStatus).replace(/^.*[/#:]/, "").toLowerCase();
    const paid = /complete|paid/.test(status) && !/due/.test(status);
    if (!amount || (!t && !paid)) continue;
    const known = senderOf(sender, fromName, words);
    const name = cut(str(inv.provider) || str(inv.broker) || known?.name || fromName || domainOf(sender), 40);
    const cat = known ? (known.cat === "insurer" ? insured(words) : known.cat) : "Other";
    const w = t ? t.wall || wallDay(t.ms, zone) : wallDay(mailDate, zone);
    out.push({
      source: "schema", kind: paid ? "sub" : "bill", key: known?.key || domainOf(sender), sender: name, cat, amount,
      due: zonedMs(w.y, w.mo, w.d, 0, 0, 0, zone), auto: paid || /automatically/.test(status), was: null, per: perOf(str(inv.billingPeriod)) || perOf(words),
      account: cut(str(inv.accountId) || str(inv.confirmationNumber), 24),
    });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------------
// 2. Rules, for the senders of household bills and subscriptions
// ---------------------------------------------------------------------------------------------------------------------
const DUE = ["due (?:on|by|date)?", "payment date", "pay (?:it )?(?:by|before)", "please pay(?: [^\\n]{0,30}?)? by", "(?:will be|we(?:'|’)ll) (?:taken|collected|take it|collect it|charged?)(?: [^\\n]{0,30}?)? on", "collect(?:ed)? on", "on or (?:around|after)", "payable by"];
function fromRules({ text, subject, sender, fromName, mailDate, zone }) {
  const all = `${subject}\n${text}`;
  const s = senderOf(sender, fromName, all);
  if (!s) return [];
  // (in pounds alone: an email whose amounts are all in another currency isn't read)
  if (!new RegExp(AMT).test(all)) return [];
  const cat = s.cat === "insurer" ? insured(all) : s.cat;
  const account = cut(/\b(?:account|customer|policy|membership)\s*(?:number|no\.?|ref(?:erence)?|id)?\s*[:#]?\s*([A-Z0-9][A-Z0-9-]{3,20})\b/i.exec(all)?.[1] || "", 24);
  const auto = AUTO.test(all);
  const base = { source: "rules", key: s.key, sender: s.name, cat, account };
  let kind = null, amount = null, due = null, was = null, per = null;
  if (/\bfree trial\b|\btrial (?:ends|will end|is ending|period ends|expires)\b/i.test(all)) {
    kind = "trial";
    const m = new RegExp(String.raw`(?:then|after (?:that|which|your (?:free )?trial)[^£\n]{0,30}?|it(?:'|’)ll be|will be charged|you(?:'|’)ll (?:pay|be charged)|costs?)[^£\n]{0,30}?${AMT}([^\n]{0,20})`, "i").exec(all);
    amount = m ? penceOf(m[1]) : null;
    per = m ? perOf(m[2]) : null;
    due = dated(all, ["trial (?:ends|will end|is ending|period ends|expires)(?: on)?", "ends on", "until", "free until"], mailDate, zone);
  } else if (/\brenew(?:s|al|ing)?\b|\bprice (?:is )?(?:changing|going up|increase|rise)\b|\bnew price\b/i.test(all)) {
    kind = "renewal";
    const change = new RegExp(String.raw`\bfrom ${AMT}[^£\n]{0,20}?\bto ${AMT}`, "i").exec(all);
    if (change) { was = penceOf(change[1]); amount = penceOf(change[2]); }
    amount ??= labelled(all, ["renewal (?:price|premium|quote|cost)", "new (?:price|premium)", "will renew (?:at|for)", "renews? (?:at|for)", "total (?:annual )?(?:premium|cost|price)", "premium", "price"]);
    was ??= labelled(all, ["last year(?:(?:'|’)s)?(?: (?:price|premium|cost))?", "previous(?:ly)?(?: (?:price|premium))?", "you paid"]);
    per = perOf(all) || "y";
    due = dated(all, ["renews? on", "renewal date", "due to renew on", "will renew on", "starting(?: from| on)?", "from your (?:next )?(?:payment|bill) on", "takes effect (?:on|from)", "from"], mailDate, zone);
  } else if (/\breceipt\b|\bpayment (?:received|confirmation|successful|confirmed)\b|\bthanks? (?:you )?for your payment\b|\bwe(?:'|’)ve (?:charged|taken)\b|\byou(?:'|’)ve been charged\b|\byour (?:subscription|membership) (?:payment|has been renewed)\b/i.test(all)) {
    kind = "sub";
    amount = labelled(all, ["total", "amount (?:paid|charged)", "you(?:'|’)ve been charged", "we(?:'|’)ve charged(?: you)?", "charged", "paid", "amount", "payment of"]);
    // (a receipt is for the day it says, else the day it came)
    due = dated(all, ["date(?: of (?:payment|purchase|charge))?", "paid on", "charged on", "billed on"], mailDate, zone) ?? (() => { const w = wallDay(mailDate, zone); return zonedMs(w.y, w.mo, w.d, 0, 0, 0, zone); })();
    per = perOf(all);
  } else if (/\bbill\b|\bstatement\b|\binvoice\b|\bamount (?:due|to pay)\b|\bpayment (?:due|reminder)\b|\bcouncil tax\b|\binstalment\b|\bvehicle tax\b/i.test(all)) {
    kind = "bill";
    amount = labelled(all, ["amount due", "total due", "total to pay", "amount to pay", "balance (?:due|to pay|outstanding)", "you owe", "bill (?:total|amount)", "your (?:\\w+ )?bill (?:is|for [^£\\n]{0,30}? is)", "total amount", "instalment(?: of)?", "(?:we(?:'|’)ll|will) (?:take|collect)", "amount", "total", "pay"]);
    due = dated(all, DUE, mailDate, zone);
    per = perOf(all) || (s.key.endsWith(".gov.uk") || cat === "Home" || cat === "Phone and internet" ? "m" : null);
  }
  // (unsure of the amount or the day: not read)
  if (!kind || !amount || !due) return [];
  return [{ ...base, kind, amount, due, auto: kind === "sub" || auto, was: was && was !== amount ? was : null, per }];
}

// An email's bills: { html, text, subject, sender, fromName, mailDate, zone } → [{ source, kind, key, sender, cat, amount
// (pence), due (ms, the day's start), auto, was, per ("m" | "y" | "q" | null), account }]
export function billsOf({ html = "", text = "", subject = "", sender = "", fromName = "", mailDate = Date.now(), zone = "Europe/London" }) {
  const words = textOf(text, html);
  const schema = fromSchema(html, { sender, fromName, mailDate, zone, words: `${subject}\n${words}` });
  if (schema.length) return schema;
  return fromRules({ text: words, subject: plain(subject), sender, fromName, mailDate, zone });
}

// ---------------------------------------------------------------------------------------------------------------------
// A sender's history: its usual, last year's, its last six, and what a month of them all comes to
// ---------------------------------------------------------------------------------------------------------------------
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); const n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : Math.round((s[n / 2 - 1] + s[n / 2]) / 2)) : null; };
const DAY = 864e5;
// hist: that sender's rows { at, pence, kind, per }, oldest first. → { usual, was, last }
export function compare(hist, at) {
  const before = hist.filter((h) => h.at < at && h.kind !== "trial");
  const upTo = hist.filter((h) => h.at <= at && h.kind !== "trial");
  const five = before.slice(-5).map((h) => h.pence);
  const year = before.filter((h) => h.at >= at - 400 * DAY && h.at <= at - 330 * DAY).pop();
  return { usual: five.length >= 2 ? median(five) : null, was: year ? year.pence : null, last: upTo.slice(-6).map((h) => h.pence) };
}
// (what one sender comes to a month, as of t: its latest within 13 months, by how often it comes)
export function monthly(hist, t) {
  const h = hist.filter((x) => x.kind !== "trial" && x.at <= t && x.at > t - 396 * DAY);
  if (!h.length) return 0;
  const last = h[h.length - 1];
  let per = last.per;
  if (!per && h.length > 1) {
    const gaps = h.slice(1).map((x, i) => (x.at - h[i].at) / DAY);
    const g = median(gaps);
    per = g < 45 ? "m" : g < 135 ? "q" : g < 250 ? "h" : "y";
  }
  if (!per) per = last.kind === "renewal" ? "y" : "m";
  return Math.round(last.pence / ({ m: 1, q: 3, h: 6, y: 12 }[per] || 1));
}
// The card's money: { month, n, months: [6, oldest first], cats: [{ name, pence }], paidSelf: { n, pence } }
export function moneyOf(rows, paid, now, zone) {
  const by = new Map();
  for (const r of rows) { if (!by.has(r.sender_key)) by.set(r.sender_key, []); by.get(r.sender_key).push({ at: r.at, pence: r.pence, kind: r.kind, per: r.per, cat: r.cat }); }
  for (const h of by.values()) h.sort((a, b) => a.at - b.at);
  const w = wallDay(now, zone);
  // (this month's: as of now, with what's come in already for the next 14 days)
  const ends = [5, 4, 3, 2, 1, 0].map((k) => (k === 0 ? now + 14 * DAY : zonedMs(w.y, w.mo - k + 1, 1, 0, 0, 0, zone) - 1));
  const months = ends.map((t) => [...by.values()].reduce((s, h) => s + monthly(h, t), 0));
  const cats = new Map();
  let n = 0;
  for (const h of by.values()) {
    const m = monthly(h, ends[5]);
    if (!m) continue;
    n++;
    const c = CATS.includes(h[h.length - 1].cat) ? h[h.length - 1].cat : "Other";
    cats.set(c, (cats.get(c) || 0) + m);
  }
  return {
    month: months[5], n, months,
    cats: [...cats].map(([name, pence]) => ({ name, pence })).sort((a, b) => b.pence - a.pence),
    paidSelf: { n: paid.length, pence: paid.reduce((s, p) => s + p.amount, 0) },
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// Kept, in Mail's database (db.js: bills, bill_history; spot_threads, spot_wrong as for bookings): one row a bill, by its
// sender, kind, account and day (a reminder for the same one changes it rather than adding another); each sender's
// amounts by day, 13 months of them
// ---------------------------------------------------------------------------------------------------------------------
const BCOLS = ["id", "kind", "sender_key", "sender_name", "cat", "amount", "due_at", "auto", "was", "per", "account", "thread_id", "message_id", "sender", "source", "mail_date", "created", "updated"];
const BUPSERT = `INSERT INTO bills (${BCOLS.join(", ")}) VALUES (${BCOLS.map((_, i) => `?${i + 1}`).join(", ")})
  ON CONFLICT(id) DO UPDATE SET ${BCOLS.filter((c) => !["id", "created"].includes(c)).map((c) => `${c} = excluded.${c}`).join(", ")} WHERE excluded.mail_date >= bills.mail_date`;
const HUPSERT = `INSERT INTO bill_history (sender_key, at, pence, kind, per, cat, name, mail_date) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
  ON CONFLICT(sender_key, at) DO UPDATE SET pence = excluded.pence, kind = excluded.kind, per = excluded.per, cat = excluded.cat, name = excluded.name, mail_date = excluded.mail_date
  WHERE excluded.mail_date >= bill_history.mail_date`;
const isoDay = (ms) => new Date(ms).toISOString().slice(0, 10);

export async function keepBills(env, list, { threadId, messageId, sender, mailDate, now = Date.now() }) {
  if (!list.length) return 0;
  sender = String(sender || "").toLowerCase();
  const { results: wrong } = await env.DB.prepare(`SELECT kind FROM spot_wrong WHERE sender = ?1`).bind(sender).all();
  const no = new Set(wrong.map((w) => w.kind));
  const ops = [];
  for (const b of list) {
    if (no.has(b.kind) || !b.amount || !Number.isFinite(b.due)) continue;
    const id = `bill-${await hashOf([b.key, b.kind, b.account || "", isoDay(b.due)].join("|").toLowerCase())}`;
    const row = { id, kind: b.kind, sender_key: b.key, sender_name: cut(b.sender, 40), cat: CATS.includes(b.cat) ? b.cat : "Other", amount: b.amount, due_at: b.due, auto: b.auto ? 1 : 0,
      was: b.was ?? null, per: b.per || null, account: b.account || null, thread_id: threadId, message_id: messageId, sender, source: b.source, mail_date: mailDate, created: now, updated: now };
    ops.push(env.DB.prepare(BUPSERT).bind(...BCOLS.map((c) => row[c])), env.DB.prepare(`INSERT OR IGNORE INTO spot_threads (spot_id, thread_id) VALUES (?1, ?2)`).bind(id, threadId));
    if (b.kind !== "trial") ops.push(env.DB.prepare(HUPSERT).bind(b.key, b.due, b.amount, b.kind, b.per || null, row.cat, row.sender_name, mailDate));
  }
  if (ops.length) ops.push(env.DB.prepare(`DELETE FROM bill_history WHERE at < ?1`).bind(now - 400 * DAY));
  if (ops.length) await env.DB.batch(ops);
  return ops.length;
}

async function historyOf(env, keys) {
  if (!keys.length) return new Map();
  const { results } = await env.DB.prepare(`SELECT sender_key, at, pence, kind, per FROM bill_history WHERE sender_key IN (${keys.map((_, i) => `?${i + 1}`).join(", ")}) ORDER BY at`).bind(...keys).all();
  const by = new Map(keys.map((k) => [k, []]));
  for (const r of results) by.get(r.sender_key)?.push(r);
  return by;
}
const billOut = (r, hist) => {
  const c = compare(hist || [], r.due_at);
  return {
    id: r.id, kind: r.kind, sender: cut(r.sender_name, 40), cat: CATS.includes(r.cat) ? r.cat : "Other", amount: r.amount, due: Number.isFinite(r.due_at) ? r.due_at : null, auto: !!r.auto,
    usual: c.usual, was: r.was ?? (r.kind === "trial" ? null : c.was), last: c.last.length ? c.last : r.kind === "trial" ? [] : [r.amount], thread: r.thread_id || null,
  };
};

// For Today's card: bills not taken off that are due (a renewal renewing, a trial ending) within the next 14 days, or
// within 7 for one that pays itself; soonest first, 20 at most. And money: what a month of them all comes to
export async function billsCard(env, now = Date.now(), zone = "Europe/London") {
  const w = wallDay(now, zone), today = zonedMs(w.y, w.mo, w.d, 0, 0, 0, zone);
  const [{ results }, { results: hist }, { results: paid }] = await Promise.all([
    env.DB.prepare(`SELECT * FROM bills WHERE hidden = 0 AND due_at >= ?1 AND due_at <= ?2 AND (auto = 0 OR due_at <= ?3) ORDER BY due_at, id LIMIT 20`).bind(today, now + 14 * DAY, now + 7 * DAY).all(),
    env.DB.prepare(`SELECT sender_key, at, pence, kind, per, cat FROM bill_history WHERE at > ?1 AND at <= ?2 ORDER BY at`).bind(now - 400 * DAY, now + 14 * DAY).all(),
    env.DB.prepare(`SELECT amount FROM bills WHERE hidden = 0 AND auto = 1 AND kind != 'trial' AND due_at >= ?1 AND due_at <= ?2`).bind(now - 7 * DAY, now).all(),
  ]);
  const by = await historyOf(env, [...new Set(results.map((r) => r.sender_key))]);
  return { bills: results.map((r) => billOut(r, by.get(r.sender_key))), money: moneyOf(hist, paid, now, zone) };
}
// For the strip: a conversation's bills (taken off ones too, said so)
export async function threadBills(env, threadId) {
  const { results } = await env.DB.prepare(
    `SELECT * FROM bills WHERE thread_id = ?1 OR id IN (SELECT spot_id FROM spot_threads WHERE thread_id = ?1) ORDER BY due_at DESC LIMIT 4`
  ).bind(threadId).all();
  const by = await historyOf(env, [...new Set(results.map((r) => r.sender_key))]);
  return results.map((r) => ({ ...billOut(r, by.get(r.sender_key)), hidden: !!r.hidden, source: r.source, account: cut(r.account || "", 24) }));
}
