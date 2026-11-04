// Mail's module: what it knows, with no DOM and no storage (One roof stage 4, spec §4.1). Ported from email/public/app.js
// (the line numbers are app.js's), the same words and the same answers: MAIN unit/roofmaillogic.test.mjs runs app.js's
// own functions beside these on fixed inputs. What read app.js's S takes it as an argument here.
//   formatters 119–198; linkify, textToHtml, parseAddress, mailtoDraft 225–295 (no htmlToText or bodyInner: a body is
//   never on this page); VIEWS, LENSES, FILTERS, lensCount, listTitle 1725, 2929–2950; the search tokeniser 3068–3160
//   (nothing remembered); at, laterChoices, fmtWhen 4153–4185; inView 4374; mine, dedupe, replyDraft 5687–5740 with
//   quote: { of, mode } (Mail's server quotes, S4-D4).
// Where app.js's version reads S or the clock, the port takes that as a trailing parameter (state, now; B0-b's names).

const locale = globalThis.navigator?.language || "en-GB";
export const dayMs = 86400000;
export const startOfDay = (t) => new Date(new Date(t).toDateString()).getTime();

export const escapeHtml = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

export function hue(str) {
  let x = 0;
  for (const ch of String(str || "")) x = (x * 31 + ch.charCodeAt(0)) >>> 0;
  return x % 360;
}

export function initials(name, email) {
  const src = (name || "").replace(/["'()]/g, "").trim() || (email || "?").split("@")[0];
  const parts = src.split(/[\s._-]+/).filter(Boolean);
  const s = parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : src.slice(0, 2);
  return s.toUpperCase();
}

export const displayName = (p) => (p ? p.name || p.email || "" : "");

export function fmtListDate(ts, now = Date.now()) {
  const today = startOfDay(now);
  if (ts >= today) return new Date(ts).toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" });
  if (ts >= today - dayMs) return "Yesterday";
  if (ts >= today - 6 * dayMs) return new Date(ts).toLocaleDateString(locale, { weekday: "long" });
  return new Date(ts).toLocaleDateString(locale, { day: "numeric", month: "numeric", year: "2-digit" });
}

export function fmtLongDate(ts, now = Date.now()) {
  const d = new Date(ts);
  const today = startOfDay(now);
  const time = d.toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" });
  if (ts >= today) return `Today at ${time}`;
  if (ts >= today - dayMs) return `Yesterday at ${time}`;
  return `${d.toLocaleDateString(locale, { day: "numeric", month: "long", year: "numeric" })} at ${time}`;
}

export function fmtQuoteDate(ts) {
  const d = new Date(ts);
  return `${d.toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" })} at ${d.toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" })}`;
}

// A file's name cut in the middle when it's long, so its end (and type) still shows: { name, a, b } (b "" when short)
export function attName(name) {
  const n = String(name || "");
  const tail = n.length > 10 ? n.slice(-8) : "";
  return { name: n, a: tail ? n.slice(0, -8) : n, b: tail };
}

export function fmtSize(n) {
  if (!n) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export const debounce = (fn, ms) => {
  let t;
  const d = (...a) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...a), ms);
  };
  d.cancel = () => clearTimeout(t);
  return d;
};
export const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// (web addresses, and email addresses, which write a message here: mailtoDraft)
export function linkify(escaped) {
  return escaped.replace(/\b(https?:\/\/[^\s<>"']+[^\s<>"'.,;:!?)\]])|([\w.+-]+@[\w-]+(?:\.[\w-]+)+)/g, (all, url, mail) =>
    url ? `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>` : `<a href="mailto:${mail}">${mail}</a>`
  );
}

export function textToHtml(text) {
  return linkify(escapeHtml(text || "")).replace(/\r?\n/g, "<br>");
}

export function parseAddress(s) {
  s = String(s || "")
    .trim()
    .replace(/[,;]+$/, "");
  const m = s.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  if (m) return { name: m[1].trim(), email: m[2].trim() };
  return { name: "", email: s };
}

export const EMAIL_RE = /^[^\s@<>()",;]+@[^\s@<>()",;]+\.[^\s@<>()",;]+$/;

// A mailto: link (RFC 6068) as a message to write. A "+" is a plus here, not a space. → null if it isn't one
export function mailtoDraft(href) {
  const m = /^mailto:([^?#]*)(?:\?([^#]*))?/i.exec(String(href || "").trim());
  if (!m) return null;
  const dec = (v) => {
    try {
      return decodeURIComponent(v);
    } catch {
      return v;
    }
  };
  const people = (v) => dec(v).split(/[,;]/).map(parseAddress).filter((p) => EMAIL_RE.test(p.email));
  const out = { to: people(m[1]), cc: [], bcc: [], subject: "", text: "" };
  for (const kv of (m[2] || "").split("&")) {
    const i = kv.indexOf("=");
    if (i < 0) continue;
    const k = kv.slice(0, i).toLowerCase(), v = kv.slice(i + 1);
    if (k === "to") out.to.push(...people(v));
    else if (k === "cc" || k === "bcc") out[k].push(...people(v));
    else if (k === "subject") out.subject = dec(v);
    else if (k === "body") out.text = dec(v).replace(/\r\n/g, "\n");
  }
  return out;
}

// ---- where you are: lenses (the switcher), filters (People and Updates), the boxes (Drafts, Trash) ----
export const VIEWS = {
  all: { chip: "All", title: "Inbox" },
  unread: { chip: "Unread", title: "Unread" },
  flagged: { chip: "Flagged", title: "Flagged" },
  attachments: { chip: "Attachments", title: "Attachments" },
  later: { chip: "Later", title: "Later" },
  done: { chip: "Done", title: "Done" },
  trash: { chip: "Trash", title: "Trash" },
};
export const LENSES = [
  { k: "people", label: "People", icon: "person" },
  { k: "updates", label: "Updates", icon: "news" },
  { k: "later", label: "Later", icon: "clock" },
  { k: "done", label: "Done", icon: "check" },
];
// (the module's filter names: "files" is the server's view "attachments")
export const FILTERS = [
  { k: "all", label: "All Mail" },
  { k: "unread", label: "Unread", icon: "envelopeBadge" },
  { k: "flagged", label: "Flagged", icon: "flag" },
  { k: "files", label: "With Attachments", icon: "clip" },
];
const SERVER_FILTER = { all: "all", unread: "unread", flagged: "flagged", files: "attachments" };

// counts as Mail's /api/counts answers them (threads.js counts) → the store's shape (spec §4.2)
export function countsOf(c) {
  if (!c || typeof c !== "object") return null;
  const byAddress = {};
  for (const a of Array.isArray(c.addresses) ? c.addresses : []) if (a?.address) byAddress[a.address] = Number(a.unread) || 0;
  return {
    people: Number(c.people?.unread) || 0, updates: Number(c.updates?.unread) || 0, later: Number(c.snoozed) || 0,
    drafts: Number(c.drafts) || 0, trash: Number(c.trash) || 0, flagged: Number(c.flagged) || 0, byAddress,
    nextLater: c.nextLater || null, updatesFrom: Array.isArray(c.updatesFrom) ? c.updatesFrom : [],
  };
}
// how many are waiting in a lens: counts as Mail answers them (app.js's S.counts) or as the store keeps them (countsOf)
export const lensCount = (k, counts) => {
  const v = counts?.[k];
  if (typeof v === "number") return k === "people" || k === "updates" || k === "later" || k === "flagged" ? v : 0;
  return k === "people" || k === "updates" ? v?.unread || 0 : k === "later" ? counts?.snoozed || 0 : k === "flagged" ? counts?.flagged || 0 : 0;
};

// app.js's listTitle, its S as { query, lens }
export const listTitle = (s) =>
  s.query ? "Search" : s.lens === "trash" || s.box === "trash" ? "Trash" : s.box === "drafts" ? "Drafts" : s.lens === "flagged" ? "Flagged" : LENSES.find((l) => l.k === s.lens).label;

// The header's title for where the module is (spec §2.1): "All Mail", "Unread", …, an address, "Drafts", "Trash"
export function viewTitle(s) {
  if (s.box === "drafts") return "Drafts";
  if (s.box === "trash") return "Trash";
  if (s.address) return s.address;
  // (all of a lens: the lens's own name, People or Updates, as its tab says; a filter on it: the filter's, Unread, …)
  if (s.lens === "people" || s.lens === "updates") { const f = FILTERS.find((x) => x.k === s.filter); return f && f.k !== "all" ? f.label : LENSES.find((l) => l.k === s.lens)?.label || "Mail"; }
  return LENSES.find((l) => l.k === s.lens)?.label || "Mail";
}

// what Mail's server is asked for, from where the module is (app.js applyLens + listAsk)
export function askOf(s) {
  if (s.box === "trash") return { view: "trash", category: null, address: null, q: s.query || "" };
  if (s.box === "drafts") return { view: "all", category: "people", address: null, q: "" };
  const stream = s.lens === "people" || s.lens === "updates";
  const view = stream ? SERVER_FILTER[s.filter] || "all" : s.lens;
  return { view, category: s.query || view === "trash" || !stream ? null : s.lens, address: s.address || null, q: s.query || "" };
}

// ---- search: the tokeniser (nothing kept: no recent searches under the roof, S4-D9) ----
export const DATES = [
  ["today", "Today"],
  ["week", "This week"],
  ["month", "This month"],
  ["older", "Older"],
];
export const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export function dateOp(k, now = Date.now()) {
  const d = new Date(now);
  if (k === "today") return `after:${ymd(d)}`;
  if (k === "week") return `after:${ymd(new Date(d.getFullYear(), d.getMonth(), d.getDate() - 6))}`;
  const first = ymd(new Date(d.getFullYear(), d.getMonth(), 1));
  return k === "month" ? `after:${first}` : k === "older" ? `before:${first}` : "";
}
// (a search said in words; people: those you hear from, for their first names)
export function sayQuery(q, people = [], now = Date.now()) {
  const nameOf = (email) => {
    const p = people.find((x) => x.email === email);
    return p?.name ? p.name.split(/\s+/)[0] : String(email).split("@")[0];
  };
  const words = [];
  const rest = q.replace(/\b(from|to|has|is|in|before|after):("[^"]*"|\S+)/gi, (t, op, v) => {
    op = op.toLowerCase();
    if (op === "from") words.push(`From ${nameOf(v)}`);
    else if (op === "to") words.push(`To ${nameOf(v)}`);
    else if (op === "in" && /^trash$/i.test(v)) words.push("In Trash");
    else if (op === "has" && /^attach/i.test(v)) words.push("Files");
    else if (op === "is" && /^unread$/i.test(v)) words.push("Unread");
    else if (op === "after" || op === "before") {
      const k = DATES.find(([d]) => dateOp(d, now) === t)?.[0];
      words.push(k ? DATES.find(([d]) => d === k)[1] : `${op === "before" ? "Before" : "Since"} ${new Date(v).toLocaleDateString(locale, { day: "numeric", month: "short" })}`);
    }
    else return t;
    return "";
  });
  return [...words, rest.trim()].filter(Boolean).join(" · ");
}
// a search put back: its filters as filters (sf, as app.js's SF), the rest typed (rest)
export function restoreQuery(q, people = [], now = Date.now()) {
  const sf = { from: null, to: null, date: null, files: false, unread: false, trash: false, open: null };
  const today = dateOp("today", now), week = dateOp("week", now), month = dateOp("month", now), older = dateOp("older", now);
  const rest = q.replace(/\b(from|to|has|is|in|before|after):("[^"]*"|\S+)/gi, (t, op, v) => {
    op = op.toLowerCase();
    if (op === "from") sf.from = { email: v, name: people.find((x) => x.email === v)?.name || "" };
    else if (op === "to") sf.to = { email: v, name: people.find((x) => x.email === v)?.name || "" };
    else if (op === "in" && /^trash$/i.test(v)) sf.trash = true;
    else if (op === "has" && /^attach/i.test(v)) sf.files = true;
    else if (op === "is" && /^unread$/i.test(v)) sf.unread = true;
    else if (t === today) sf.date = "today";
    else if (t === week) sf.date = "week";
    else if (t === month) sf.date = "month";
    else if (t === older) sf.date = "older";
    else return t;
    return "";
  });
  return { rest: rest.replace(/\s{2,}/g, " ").trim(), sf };
}
// What's being typed now: the last word, and the operator it's for (from: or to:), if any
export function typingToken(q) {
  if (!q || /\s$/.test(q)) return null;
  const word = q.split(/\s+/).pop();
  const m = /^(from|to):(.*)$/i.exec(word);
  if (m) return { word, op: m[1].toLowerCase(), value: m[2].replace(/^"/, "") };
  if (word.includes(":")) return null;
  return { word, op: null, value: word.replace(/^"/, "") };
}
export function replaceTyping(q, tok, by) {
  return `${q.slice(0, q.length - tok.word.length)}${by} `;
}

// ---- the list ----
// Today, Yesterday, This Week, then months
export function dayLabel(ts, now = Date.now()) {
  const today = startOfDay(now);
  if (ts >= today) return "Today";
  if (ts >= today - dayMs) return "Yesterday";
  if (ts >= today - 6 * dayMs) return "This Week";
  const d = new Date(ts);
  return d.toLocaleDateString(locale, d.getFullYear() === new Date(now).getFullYear() ? { month: "long" } : { month: "long", year: "numeric" });
}
// Who's in a conversation, newest first: one person by full name, several by first names
export function peopleLine(t) {
  const ps = t.people || [];
  if (ps.length === 1) return ps[0].me ? "You" : displayName(ps[0]) || "Unknown Sender";
  return ps
    .slice(0, 3)
    .map((p) => (p.me ? "You" : (p.name || p.email || "").split(/[\s@]/)[0]))
    .join(", ") + (ps.length > 3 ? ` +${ps.length - 3}` : "");
}
// What swiping right does here: Done, or back to the Inbox from Done, or out of the Trash
export function leadAction(t) {
  if (t.trashed) return { act: "restore", cls: "a-inbox", ic: "inbox", label: "Restore" };
  if (t.done) return { act: "inbox", cls: "a-inbox", ic: "inbox", label: "Inbox" };
  return { act: "done", cls: "a-done", ic: "check", label: "Done" };
}

// ---- Later ----
export function at(days, hour, minute = 0, now = Date.now()) {
  const d = new Date(now);
  d.setDate(d.getDate() + days);
  d.setHours(hour, minute, 0, 0);
  return d.getTime();
}
export function laterChoices(now = Date.now()) {
  const d = new Date(now);
  const hr = d.getHours(), dow = d.getDay();
  const out = [];
  if (hr >= 6 && hr < 17) {
    const half = 1800000;
    out.push({ label: "Later Today", until: Math.ceil((now + 3 * 3600000) / half) * half });
  }
  if (hr < 18) out.push({ label: "This Evening", until: at(0, 18, 0, now) });
  out.push({ label: "Tomorrow Morning", until: at(1, 8, 0, now), timeOnly: true });
  if (dow >= 1 && dow <= 4) out.push({ label: "This Weekend", until: at(6 - dow, 9, 0, now) });
  out.push({ label: "Next Week", until: at(((8 - dow) % 7) || 7, 8, 0, now) });
  return out;
}
// When something comes back, said briefly: "6:00 pm", "Tomorrow 8:00 am", "Sat 9:00 am", "12 Nov"
export function fmtWhen(ts, now = Date.now()) {
  const d = new Date(ts);
  const time = d.toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" });
  const today = startOfDay(now);
  if (ts < today + dayMs) return time;
  if (ts < today + 2 * dayMs) return `Tomorrow ${time}`;
  if (ts < today + 7 * dayMs) return `${d.toLocaleDateString(locale, { weekday: "short" })} ${time}`;
  return d.toLocaleDateString(locale, { day: "numeric", month: "short" });
}
export const fmtTime = (ts) => new Date(ts).toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" });

// ---- acting on a conversation ----
export const PATCH = {
  done: { done: true, snoozeUntil: null },
  inbox: { done: false },
  read: { unread: 0 },
  unread: { unread: 1 },
  flag: { starred: true },
  unflag: { starred: false },
  trash: { trashed: true, snoozeUntil: null },
  restore: { trashed: false },
  unsnooze: { snoozeUntil: null },
};
export const patchOf = (action, extra = {}) =>
  action === "category" ? { category: extra.category } : action === "snooze" ? { snoozeUntil: extra.until, done: false } : PATCH[action] || {};

// Whether a conversation still belongs in the list being shown. state: the store's snapshot, or app.js's S
// ({ query, view, category }), or askOf's answer ({ q, view, category })
export function inView(t, state) {
  const ask = state && "view" in state ? { q: state.q ?? state.query, view: state.view, category: state.category } : askOf(state || {});
  if (ask.q) return !t.trashed;
  if (ask.view === "trash") return t.trashed;
  if (t.trashed) return false;
  if (ask.category && t.category !== ask.category) return false;
  switch (ask.view) {
    case "all":
      return !t.done && !t.snoozeUntil;
    case "unread":
      return t.unread > 0 && !t.done && !t.snoozeUntil;
    case "flagged":
      return t.starred;
    case "attachments":
      return t.hasAttachments;
    case "done":
      return t.done;
    case "later":
      return !!t.snoozeUntil;
  }
  return true;
}

// ---- writing: yours, without doubles, and a reply or forward to a message (me: the store's me) ----
export function mine(email, me) {
  const e = (email || "").toLowerCase();
  return (me?.identities || []).includes(e) || e.endsWith(`@${me?.domain || "inflite.ai"}`);
}
export function dedupe(list, me) {
  const seen = new Set();
  return list.filter((p) => {
    const k = p.email.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
// m: a message's Meta (summary + replyTo, messageId, inReplyTo, references, attachments); mode "reply" | "replyAll" |
// "forward". The quote is the server's to build (S4-D4): quote = { of: m.id, mode: "reply" | "all" | "forward" }; files
// forwarded are { ref } to Mail's own copy, never fetched here.
export function replyDraft(m, mode, me) {
  const defaultFrom = me?.defaultFrom;
  const from =
    m.folder === "sent" ? m.from.email : m.mailbox && mine(m.mailbox, me) ? m.mailbox : defaultFrom;
  let to = [];
  let cc = [];
  if (mode !== "forward") {
    if (m.folder === "sent") {
      to = m.to.slice();
      if (mode === "replyAll") cc = (m.cc || []).slice();
    } else {
      const rt = m.replyTo || m.from.email;
      to = [{ name: m.replyTo ? "" : m.from.name, email: rt }];
      if (mode === "replyAll") {
        cc = dedupe([...(m.to || []), ...(m.cc || [])].filter((p) => !mine(p.email, me) && p.email.toLowerCase() !== rt.toLowerCase()));
      }
    }
  }
  const subj = m.subject || "";
  const subject =
    mode === "forward" ? (/^fwd?:/i.test(subj) ? subj : `Fwd: ${subj}`) : /^re:/i.test(subj) ? subj : `Re: ${subj}`;
  return {
    mode,
    from,
    to,
    cc,
    subject,
    text: "",
    quote: { of: m.id, mode: mode === "replyAll" ? "all" : mode === "forward" ? "forward" : "reply" },
    inReplyTo: mode === "forward" ? null : m.messageId,
    references: mode === "forward" ? null : [m.references, m.messageId].filter(Boolean).join(" "),
    threadId: mode === "forward" ? null : m.threadId || null,
    files: mode === "forward" ? (m.attachments || []).map((a) => ({ ref: a.id, filename: a.filename, type: a.type, size: a.size })) : [],
  };
}

// The only types shown as pictures (S4-D17): a blob: URL is made only for these, re-typed
export const PICTURES = /^image\/(png|jpeg|gif|webp|avif|heic|bmp)$/;

// a thread id as an address may carry it (receive.js: crypto.randomUUID(); the router's [\w-]{1,40})
export const idOk = (id) => typeof id === "string" && /^[\w-]{1,64}$/.test(id);
