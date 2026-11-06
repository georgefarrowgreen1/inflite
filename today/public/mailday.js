// Mail on Your Day on Today's page, stage 2 (parcels and bills, the admin's alone, read from Mail by rules, no AI): the
// rows from Mail in Waiting for You (a bill to pay, a renewal, a trial ending, a return's last day: each the thing on the
// left and the number that matters on the right, the amount or the day, with its day under it), the quiet line of what
// paid itself this week, a parcel's row in Coming Up (its window on the right, and the four-part bar: Ordered, Shipped,
// Out Today, Delivered), each one's sheet (Open Email; Track on <courier>; All Bills; then its done button, Paid, Keep It,
// Sorted, Keeping It or Got It, and Hide, each hiding it through Mail as trip.js's Hide does, with its 7 s Undo), and the
// Bills sheet (a month's bills and subscriptions, six months of them, by kind, then those that need you and those that
// pay themselves). The words are the account's (functions/_todaycoming.js mailWaiting, moneyFor, upcomingFor); here
// they're checked, drawn through esc() and nothing in an inline style but the bars' sizes, which are CSS variables set
// after (no style attribute in the markup).
//   owedOf(answer) / paidOf(answer) / moneyOf(answer) → the answer's owed rows, paidSelf and money, checked (owed: those
//     hidden here left out)
//   owedRowHtml(r, link) → a row of Waiting for You's; paidHtml(p) → the quiet line (a button: the Bills sheet)
//   parcelOfRow(r) → a Coming Up row of a parcel's, checked, or null; parcelRowHtml(r, link) → its row; trackHtml(stage)
//   openItem(item, h) → an owed row's or a parcel's sheet; openBills(money, h) → the Bills sheet (billsHtml(money): its
//     inside); fillBars(root) → the bars' sizes set from their data-*
import { esc, G } from "/cards.js";
import { GL, mailIcon, hideItem, isGone } from "/trip.js";

const ID = /^[A-Za-z0-9_~-]{1,64}$/;
const KINDS = ["bill", "renewal", "trial", "sub", "return"];
const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const str = (v, n = 200) => (typeof v === "string" ? v.slice(0, n) : "");
const sv = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
// (one glyph per kind of thing from Mail)
export const ML_GLYPH = {
  parcel: sv('<path d="M3 7.5 12 3l9 4.5v9L12 21l-9-4.5z"/><path d="M3 7.5 12 12l9-4.5M12 12v9"/>'),
  bill: sv('<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/>'),
  renewal: sv('<path d="M20 11a8 8 0 0 0-14.6-4.5M4 13a8 8 0 0 0 14.6 4.5"/><path d="M5 3v4h4M19 21v-4h-4"/>'),
  trial: sv('<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5M9 2h6"/>'),
  return: sv('<path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/>'),
  link: sv('<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>'),
  done: sv('<path d="M5 12.5l4.5 4.5L19 7.5"/>'),
};
ML_GLYPH.sub = ML_GLYPH.bill;
// (each kind's done button: it hides the row through Mail, as Hide does, said as the toast)
const DONE = { bill: "Paid", renewal: "Sorted", trial: "Keep It", return: "Keeping It", parcel: "Got It" };
const LABS = ["Ordered", "Shipped", "Out Today", "Delivered"];

// ---------------------------------------------------------------- the answer's rows, checked
function owedRow(r) {
  if (!r || typeof r !== "object" || !ID.test(str(r.item)) || !KINDS.includes(r.kind) || !str(r.title).trim()) return null;
  const sub = str(r.sub, 160), chg = str(r.chg, 16);
  return { id: str(r.id, 80), item: r.item, kind: r.kind, title: str(r.title, 80), sub, chg: chg && sub.includes(chg) ? chg : "", amt: str(r.amt, 20), when: str(r.when, 20),
    at: num(r.at), href: str(r.href, 400) || null, auto: r.auto === true };
}
export const owedOf = (answer) => (Array.isArray(answer?.owed) ? answer.owed : []).map(owedRow).filter((r) => r && !isGone(r.item)).slice(0, 12);
export function paidOf(answer) {
  const p = answer?.paidSelf;
  return p && typeof p === "object" && Number.isInteger(p.n) && p.n > 0 && str(p.said) ? { n: p.n, said: str(p.said, 80) } : null;
}
export function moneyOf(answer) {
  const m = answer?.money;
  if (!m || typeof m !== "object" || !str(m.month)) return null;
  const bars = (Array.isArray(m.bars) ? m.bars : []).filter((b) => b && str(b.label) && num(b.pct) != null).slice(0, 6)
    .map((b) => ({ label: str(b.label, 8), pct: Math.max(0, Math.min(100, Math.round(b.pct))), said: str(b.said, 12) }));
  const cats = (Array.isArray(m.cats) ? m.cats : []).filter((c) => c && str(c.name) && num(c.pence) != null && c.pence > 0 && str(c.said)).slice(0, 5)
    .map((c) => ({ name: str(c.name, 40), pence: c.pence, said: str(c.said, 60) }));
  const rows = (v) => (Array.isArray(v) ? v : []).map(owedRow).filter((r) => r && !isGone(r.item)).slice(0, 20);
  return { month: str(m.month, 20), n: str(m.n, 60), tag: str(m.tag, 40), bars, cats, needs: rows(m.needs), paid: rows(m.paid) };
}
export function parcelOfRow(r) {
  if (!r || r.app !== "mail" || !ID.test(str(r.parcel)) || !str(r.title) || num(r.at) == null) return null;
  const stage = Number.isInteger(r.stage) && r.stage >= 0 && r.stage <= 3 ? r.stage : 0;
  const track = /^https:\/\/[^\s"'<>\\]+$/i.test(str(r.track, 400)) ? r.track : null;
  return { id: r.parcel, kind: "parcel", title: str(r.title, 80), sub: str(r.sub, 120), stage, amt: str(r.amt, 20), when: str(r.when, 20), at: r.at, until: num(r.until),
    carrier: str(r.carrier, 40), track, ref: str(r.ref, 32), href: str(r.href, 400) || null };
}

// ---------------------------------------------------------------- rows
// (a sub with its change marked: "+18%" in its own tint)
const subHtml = (sub, chg) => {
  if (!sub) return "";
  if (!chg) return `<small>${esc(sub)}</small>`;
  const i = sub.indexOf(chg);
  return `<small>${esc(sub.slice(0, i))}<span class="chg">${esc(chg)}</span>${esc(sub.slice(i + chg.length))}</small>`;
};
const amtHtml = (amt, when) => (amt ? `<span class="ml-amt"><b>${esc(amt)}</b>${when ? `<small>${esc(when)}</small>` : ""}</span>` : "");
// the parcel's four-part bar: a part for each step done, the one it's at half filled; with its labels where asked
export function trackHtml(stage, labels = false) {
  const n = Math.max(0, Math.min(3, stage));
  return `<span class="ml-track" role="img" aria-label="${esc(LABS[n])}">${LABS.map((_, i) => `<i class="${i < n || n === 3 ? "on" : i === n ? "now" : ""}"></i>`).join("")}</span>`
    + (labels ? `<span class="ml-tracklab" aria-hidden="true">${LABS.map((l, i) => `<span${i <= n ? ' class="on"' : ""}>${esc(l)}</span>`).join("")}</span>` : "");
}
// (a row's inside: its icon, what it is, the number on the right)
const inner = (glyph, title, sub, chg, amt, when, more = "", cls = "") => `${mailIcon(glyph, cls)}<span class="tx"><b>${esc(title)}</b>${subHtml(sub, chg)}${more}</span>${amtHtml(amt, when)}`;
// a row of Waiting for You's from Mail: a tap for its sheet (data-do="mailitem"), its email the link where there's none
export function owedRowHtml(r, link) {
  const h = r.href ? link(r.href) : null, attrs = `data-do="mailitem" data-iid="${esc(r.item)}" aria-haspopup="dialog"`;
  const body = inner(ML_GLYPH[r.kind] || ML_GLYPH.bill, r.title, r.sub, r.chg, r.amt, r.when);
  return `<div class="dw-row dm-row">${h ? `<a class="row dm-main" href="${esc(h)}" ${attrs}>${body}</a>` : `<button type="button" class="row dm-main" ${attrs}>${body}</button>`}</div>`;
}
// the quiet line: "3 paid by themselves · £36.00", a tap for the Bills sheet
export const paidHtml = (p, bills) => (bills
  ? `<button type="button" class="dm-quiet" data-do="bills" aria-haspopup="dialog">${esc(p.said)}</button>`
  : `<p class="dm-quiet">${esc(p.said)}</p>`);
// a parcel's row of Coming Up: its window on the right, its bar under its words
export function parcelRowHtml(r, link) {
  const h = r.href ? link(r.href) : null, attrs = `data-do="mailitem" data-pid="${esc(r.id)}" aria-haspopup="dialog"`;
  const body = `<span class="dc-tm" aria-hidden="true"></span>${inner(ML_GLYPH.parcel, r.title, r.sub, "", r.amt, r.when, trackHtml(r.stage), "dc-ic")}`;
  return h ? `<a class="row dc-main" href="${esc(h)}" ${attrs}>${body}</a>` : `<button type="button" class="row dc-main" ${attrs}>${body}</button>`;
}

// ---------------------------------------------------------------- the sheets
function html(s) {
  const t = document.createElement("template");
  t.innerHTML = s;
  return t.content;
}
// (the bars' sizes, from their data-*: the only sizes set here, as CSS variables, never a style attribute in the markup)
export function fillBars(root) {
  for (const el of root.querySelectorAll?.("[data-pct]") || []) el.style.setProperty("--h", `${Math.max(0, Math.min(100, Number(el.dataset.pct) || 0))}%`);
  for (const el of root.querySelectorAll?.("[data-share]") || []) el.style.setProperty("--share", String(Math.max(0, Number(el.dataset.share) || 0)));
}
// an owed row's or a parcel's page: what and when, then Open Email, Track, All Bills, its done button and Hide
function itemBody(it, h, { bills = true } = {}) {
  const email = it.href ? h.link(it.href) : null;
  const facts = it.kind === "parcel"
    ? `<div class="ml-hero">${trackHtml(it.stage, true)}</div>`
    : `<p class="bk-when">${esc([it.amt, it.when].filter(Boolean).join(" · "))}</p>`;
  const acts = [
    email ? `<a class="bk-act go" href="${esc(email)}" data-ml="open">${GL.mail}<span>Open Email</span></a>` : "",
    it.track ? `<a class="bk-act" href="${esc(it.track)}" target="_blank" rel="noopener noreferrer" data-ml="track">${ML_GLYPH.link}<span>${esc(`Track on ${it.carrier || "the Courier’s Site"}`)}</span></a>` : "",
    bills && (it.kind === "bill" || it.kind === "sub") && h.money?.() ? `<button type="button" class="bk-act" data-ml="bills">${ML_GLYPH.bill}<span>All Bills</span></button>` : "",
    DONE[it.kind] ? `<button type="button" class="bk-act" data-ml="done">${ML_GLYPH.done}<span>${esc(DONE[it.kind])}</span></button>` : "",
    `<button type="button" class="bk-act" data-ml="hide">${GL.hide}<span>Hide</span></button>`,
  ];
  return html(`<div class="bk-sheet">${it.sub ? `<p class="bk-p">${subHtml(it.sub, it.chg).replace(/^<small>|<\/small>$/g, "")}</p>` : ""}${facts}<div class="bk-acts">${acts.join("")}</div></div>`);
}
function wireItem(root, it, h, hd) {
  root.addEventListener("click", (e) => {
    const el = e.target.closest?.("[data-ml]");
    if (!el || el.closest(".ifs-page") !== (root.classList?.contains("ifs-page") ? root : null)) return;
    const d = el.dataset.ml;
    if (d === "open") { try { h.go?.(el.getAttribute("href")); } catch {} return; }
    if (d === "track") return;
    if (d === "bills") { e.preventDefault(); const pg = hd.push({ page: "bills", title: "Bills and Subscriptions", body: billsBody(h.money()) }); wireBills(pg, h, hd); return; }
    if (d === "done" || d === "hide") { e.preventDefault(); hd.close(); hideItem(it.id, h, { said: d === "done" ? DONE[it.kind] : "Hidden" }); }
  });
}
export function openItem(it, h) {
  if (!it || typeof h?.sheet !== "function") return null;
  return h.sheet({ sheet: "mail", title: it.title, app: "mail", body: (el, hd) => { el.append(itemBody(it, h)); fillBars(el); wireItem(el, it, h, hd); } });
}
// (an owed row as the item its sheet's about)
export const itemOfRow = (r) => ({ id: r.item, kind: r.kind, title: r.title, sub: r.sub, chg: r.chg, amt: r.amt, when: r.when, href: r.href });

// the Bills sheet: the month's big, its change since six months ago, six months of bars (the last with its amount), the
// split by kind with its legend; then Needs You and Paid by Themselves
const CAT_TONE = ["mail", "weather", "trip", "fitness", "markets"];
const billsBody = (m) => html(billsHtml(m));
export function billsHtml(m) {
  if (!m) return "";
  const rows = (list) => list.map((r) => `<button type="button" class="row dm-main" data-bill="${esc(r.item)}" aria-haspopup="dialog">${inner(ML_GLYPH[r.kind] || ML_GLYPH.bill, r.title, r.sub, r.chg, r.amt, r.when)}</button>`).join("");
  const last = m.bars.length - 1;
  return `<div class="ml-bills">
    <div class="ml-big glass">
      <small>Every Month</small><b>${esc(m.month)}</b>
      <span class="ml-n">${esc(m.n)}${m.tag ? ` · <span class="chg">${esc(m.tag.replace(/ on .*$/, ""))}</span> ${esc(m.tag.replace(/^\S+ /, ""))}` : ""}</span>
      ${m.bars.length ? `<div class="ml-bars" aria-hidden="true">${m.bars.map((b, i) => `<i class="${i === last ? "now" : ""}" data-pct="${b.pct}">${i === last && b.said ? `<em>${esc(b.said)}</em>` : ""}</i>`).join("")}</div>
      <div class="ml-barlab" aria-hidden="true">${m.bars.map((b) => `<span>${esc(b.label)}</span>`).join("")}</div>` : ""}
      ${m.cats.length ? `<div class="ml-split" aria-hidden="true">${m.cats.map((c, i) => `<i class="t-${CAT_TONE[i]}" data-share="${c.pence}"></i>`).join("")}</div>
      <div class="ml-cats">${m.cats.map((c, i) => `<span><i class="t-${CAT_TONE[i]}"></i>${esc(c.said)}</span>`).join("")}</div>` : ""}
    </div>
    ${m.needs.length ? `<h3 class="slabel">Needs You</h3><div class="group glass">${rows(m.needs)}</div>` : ""}
    ${m.paid.length ? `<h3 class="slabel">Paid by Themselves</h3><div class="group glass">${rows(m.paid)}</div>` : ""}
  </div>`;
}
function wireBills(root, h, hd) {
  fillBars(root);
  root.addEventListener("click", (e) => {
    const b = e.target.closest?.("[data-bill]");
    if (!b || b.closest(".ifs-page") !== (root.classList?.contains("ifs-page") ? root : null)) return;
    const m = h.money?.(), r = m && [...m.needs, ...m.paid].find((x) => x.item === b.dataset.bill);
    if (!r) return;
    const it = itemOfRow(r), pg = hd.push({ page: "mail", title: it.title, body: itemBody(it, h, { bills: false }) });
    wireItem(pg, it, h, hd);
  });
}
export function openBills(m, h) {
  if (!m || typeof h?.sheet !== "function") return null;
  return h.sheet({ sheet: "bills", title: "Bills and Subscriptions", app: "mail", body: (el, hd) => { el.append(billsBody(m)); wireBills(el, h, hd); } });
}
