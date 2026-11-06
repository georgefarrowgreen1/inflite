// Mail on Your Day, stage 3: a repeating calendar invite (RFC 5545 RRULE, EXDATE, RDATE), as its dates. By rules alone,
// as the rest of spot.js: FREQ DAILY, WEEKLY, MONTHLY or YEARLY, with INTERVAL, COUNT, UNTIL, BYDAY (and its 2TH, -1FR),
// BYMONTHDAY, BYMONTH, BYSETPOS and WKST. A rule with anything else in it (BYHOUR, BYWEEKNO, ...) isn't read as a rule:
// the invite is its first date alone, never guessed at. Worked out on the wall clock of the invite's own zone (its TZID;
// the account's for a floating time; UTC for one in Z), so 19:00 stays 19:00 across the clocks changing.
import { zonedMs, zoneParts } from "./spot.js";

const DAY = 864e5;
const WD = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };
const FULL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const ints = (v, lo, hi) => v.split(",").map((x) => (/^[+-]?\d{1,4}$/.test(x) ? Number(x) : NaN)).filter((n) => Number.isInteger(n) && n >= lo && n <= hi && n !== 0);

// RRULE's value → { freq, interval, count, until (its text), byday: [{ n, wd }], bymonthday, bymonth, bysetpos, wkst } | null
export function parseRule(s) {
  const r = { freq: null, interval: 1, count: null, until: null, byday: [], bymonthday: [], bymonth: [], bysetpos: [], wkst: 1 };
  for (const part of String(s || "").trim().toUpperCase().split(";")) {
    if (!part) continue;
    const [k, v = ""] = part.split("=");
    if (k === "FREQ") r.freq = ["DAILY", "WEEKLY", "MONTHLY", "YEARLY"].includes(v) ? v : "";
    else if (k === "INTERVAL") r.interval = /^\d{1,3}$/.test(v) && +v > 0 ? +v : 0;
    else if (k === "COUNT") r.count = /^\d{1,4}$/.test(v) && +v > 0 ? +v : 0;
    else if (k === "UNTIL") r.until = /^\d{8}(T\d{6}Z?)?$/.test(v) ? v : "";
    else if (k === "WKST") r.wkst = v in WD ? WD[v] : -1;
    else if (k === "BYDAY") {
      for (const x of v.split(",")) {
        const m = /^([+-]?\d{1,2})?(SU|MO|TU|WE|TH|FR|SA)$/.exec(x);
        if (!m || (m[1] && (Math.abs(+m[1]) > 53 || +m[1] === 0))) return null;
        r.byday.push({ n: m[1] ? +m[1] : 0, wd: WD[m[2]] });
      }
    } else if (k === "BYMONTHDAY") { r.bymonthday = ints(v, -31, 31); if (r.bymonthday.length !== v.split(",").length) return null; }
    else if (k === "BYMONTH") { r.bymonth = ints(v, 1, 12); if (r.bymonth.length !== v.split(",").length) return null; }
    else if (k === "BYSETPOS") { r.bysetpos = ints(v, -366, 366); if (r.bysetpos.length !== v.split(",").length) return null; }
    // (anything else: not a rule this reads)
    else return null;
  }
  if (!r.freq || !r.interval || r.count === 0 || r.until === "" || r.wkst < 0) return null;
  return r;
}

// (calendar days as numbers: day 0 is 1 Jan 1970, a Thursday)
const dn = (y, mo, d) => Date.UTC(y, mo - 1, d) / DAY;
const ymd = (n) => { const x = new Date(n * DAY); return { y: x.getUTCFullYear(), mo: x.getUTCMonth() + 1, d: x.getUTCDate() }; };
const wdOf = (n) => (((n + 4) % 7) + 7) % 7;
const daysIn = (y, mo) => new Date(Date.UTC(y, mo, 0)).getUTCDate();
export const dayKey = (n) => { const { y, mo, d } = ymd(n); return `${y}${String(mo).padStart(2, "0")}${String(d).padStart(2, "0")}`; };
const setpos = (list, pos) => (pos.length ? [...new Set(pos.map((p) => (p > 0 ? list[p - 1] : list[list.length + p])).filter((x) => x != null))].sort((a, b) => a - b) : list);

// The days of a month a rule picks (its BYMONTHDAY and BYDAY, or the first date's day)
function monthDays(r, y, mo, firstDay) {
  const len = daysIn(y, mo);
  let set = null;
  if (r.bymonthday.length) set = r.bymonthday.map((d) => (d > 0 ? d : len + 1 + d)).filter((d) => d >= 1 && d <= len);
  if (r.byday.length) {
    const days = new Set();
    for (const { n, wd } of r.byday) {
      const all = [];
      for (let d = 1; d <= len; d++) if (wdOf(dn(y, mo, d)) === wd) all.push(d);
      if (!n) all.forEach((d) => days.add(d));
      else { const d = n > 0 ? all[n - 1] : all[all.length + n]; if (d) days.add(d); }
    }
    set = set ? set.filter((d) => days.has(d)) : [...days];
  }
  if (!set) set = firstDay <= len ? [firstDay] : [];
  return setpos([...new Set(set)].sort((a, b) => a - b).map((d) => dn(y, mo, d)), r.bysetpos);
}
// (a YEARLY BYDAY with no BYMONTH: the nth of that weekday in the year)
function yearDays(r, y) {
  const days = new Set(), first = dn(y, 1, 1), last = dn(y, 12, 31);
  for (const { n, wd } of r.byday) {
    const all = [];
    for (let d = first; d <= last; d++) if (wdOf(d) === wd) all.push(d);
    if (!n) all.forEach((d) => days.add(d));
    else { const d = n > 0 ? all[n - 1] : all[all.length + n]; if (d != null) days.add(d); }
  }
  return setpos([...days].sort((a, b) => a - b), r.bysetpos);
}

// A rule's dates, from its first (wall: { y, mo, d, hh, mi, ss } in zone): each { start: ms, day: "yyyymmdd" } that falls
// within [from, to], in order, at most max of them. COUNT counts from the first date, however long ago that was; UNTIL
// is inclusive. ex: EXDATEs (a moment in ms, or a "yyyymmdd" for a date); rd: RDATEs (ms). Never more than 4000
// periods looked at, so a broken rule can't run on.
export function expand(r, { wall, zone, from = -Infinity, to = Infinity, ex = [], rd = [], max = 400 }) {
  // (no rule, only dates added: the first date, and those)
  r = r || { freq: null, interval: 1, count: null, until: null, byday: [], bymonthday: [], bymonth: [], bysetpos: [], wkst: 1 };
  const at = (n) => { const { y, mo, d } = ymd(n); return zonedMs(y, mo, d, wall.hh, wall.mi, wall.ss || 0, zone); };
  const first = dn(wall.y, wall.mo, wall.d), t0 = at(first);
  let until = Infinity;
  if (r.until) {
    const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/.exec(r.until);
    until = !m[4] ? zonedMs(+m[1], +m[2], +m[3] + 1, 0, 0, 0, zone) - 1 : m[7] ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]) : zonedMs(+m[1], +m[2], +m[3], +m[4], +m[5], +m[6], zone);
  }
  const exMs = new Set(ex.filter((x) => typeof x === "number")), exDay = new Set(ex.filter((x) => typeof x === "string"));
  const out = [];
  let n = 0, done = false;
  // (→ false once there's no more to look for)
  const take = (d) => {
    const ms = at(d);
    if (ms < t0) return true;
    if (ms > until || (r.count && n >= r.count)) return (done = true), false;
    n++;
    if (ms > to) return (done = true), false;
    const day = dayKey(d);
    if (ms >= from && !exMs.has(ms) && !exDay.has(day)) out.push({ start: ms, day });
    return true;
  };
  take(first);
  const okMonth = (d) => !r.bymonth.length || r.bymonth.includes(ymd(d).mo);
  const { y: y0, mo: m0, d: d0 } = ymd(first);
  // (with no COUNT to keep, the periods long before from are stepped over)
  let p0 = 0;
  if (r.freq && !r.count && Number.isFinite(from) && from > t0) {
    const f = ymd(Math.floor((from - t0) / DAY) + first), span = r.freq === "DAILY" ? (Math.floor((from - t0) / DAY)) : r.freq === "WEEKLY" ? Math.floor((from - t0) / DAY / 7) : r.freq === "MONTHLY" ? (f.y - y0) * 12 + f.mo - m0 : f.y - y0;
    p0 = Math.max(0, Math.floor(span / r.interval) - 1);
  }
  for (let p = p0; r.freq && p < p0 + 4000 && !done; p++) {
    let days = [];
    if (r.freq === "DAILY") {
      const d = first + p * r.interval;
      const md = r.bymonthday.length ? monthDays({ ...r, byday: [], bysetpos: [] }, ymd(d).y, ymd(d).mo, 0) : null;
      if (okMonth(d) && (!md || md.includes(d)) && (!r.byday.length || r.byday.some((b) => b.wd === wdOf(d)))) days = [d];
    } else if (r.freq === "WEEKLY") {
      const ws = first - ((wdOf(first) - r.wkst + 7) % 7) + p * 7 * r.interval;
      const wds = r.byday.length ? r.byday.map((b) => b.wd) : [wdOf(first)];
      days = setpos([...new Set(wds.map((w) => ws + ((w - r.wkst + 7) % 7)))].sort((a, b) => a - b).filter(okMonth), r.bysetpos);
    } else if (r.freq === "MONTHLY") {
      const k = m0 - 1 + p * r.interval, y = y0 + Math.floor(k / 12), mo = (k % 12) + 1;
      if (!r.bymonth.length || r.bymonth.includes(mo)) days = monthDays(r, y, mo, d0);
    } else {
      const y = y0 + p * r.interval;
      if (r.byday.length && !r.bymonth.length && !r.bymonthday.length) days = yearDays(r, y);
      else for (const mo of r.bymonth.length ? [...r.bymonth].sort((a, b) => a - b) : [m0]) days.push(...monthDays(r, y, mo, d0));
    }
    for (const d of days) if (d > first && !take(d)) break;
    if (out.length >= max) break;
  }
  // (and the dates added, at their own moments)
  for (const ms of rd) if (Number.isFinite(ms) && ms >= from && ms <= to && !out.some((o) => o.start === ms) && !exMs.has(ms)) {
    const p = zoneParts(ms, zone);
    out.push({ start: ms, day: dayKey(dn(p.y, p.mo, p.d)) });
  }
  return out.sort((a, b) => a.start - b.start).slice(0, max);
}

// The last date of a rule that ends (COUNT or UNTIL), or null for one that doesn't
export function lastOf(r, o) {
  if (r?.freq && !r.count && !r.until) return null;
  const all = expand(r, { ...o, max: 10000 });
  return all.length ? all[all.length - 1].start : null;
}

// A rule in plain words, 40 characters at most: "every day", "every week on Monday", "every other Thursday", "every
// month on the 3rd Tuesday", "every year"
const ord = (n) => (n === -1 ? "last" : n < 0 ? `${ord(-n)} from last` : `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] || "th"}`);
const and = (xs) => (xs.length > 1 ? `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}` : xs[0] || "");
const every = (i, one, other, many) => (i === 1 ? `every ${one}` : i === 2 ? `every other ${other}` : `every ${i} ${many}`);
export function repeatWords(r, wall) {
  if (!r?.freq) return "";
  const wd0 = wdOf(dn(wall.y, wall.mo, wall.d));
  let s;
  if (r.freq === "DAILY") {
    const wds = r.byday.map((b) => b.wd).sort();
    s = wds.join() === "1,2,3,4,5" ? "every weekday" : every(r.interval, "day", "day", "days");
  } else if (r.freq === "WEEKLY") {
    const wds = [...new Set(r.byday.length ? r.byday.map((b) => b.wd) : [wd0])].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
    const names = and(wds.map((w) => (wds.length > 1 ? SHORT : FULL)[w]));
    s = r.interval === 1 ? `every week on ${names}` : r.interval === 2 ? `every other ${names}` : `every ${r.interval} weeks on ${names}`;
  } else if (r.freq === "MONTHLY") {
    const b = r.byday.find((x) => x.n);
    const what = b ? `the ${ord(b.n)} ${FULL[b.wd]}` : r.bymonthday.length ? (r.bymonthday[0] === -1 ? "the last day" : `the ${ord(r.bymonthday[0])}`) : `the ${ord(wall.d)}`;
    s = `${every(r.interval, "month", "month", "months")} on ${what}`;
  } else s = every(r.interval, "year", "year", "years");
  return s.length > 40 ? `${s.slice(0, 39).trimEnd()}…` : s;
}
