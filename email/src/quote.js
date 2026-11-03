// Replies and forwards quoted by Mail's server (One roof, stage 4, S4-D4). Under the roof the page never has the original's
// body: compose carries quote: { of: <message id>, mode: "reply"|"all"|"forward" }, and Mail builds from its own copy what
// Mail on its own builds in the page (email/public/app.js replyDraft's header, buildPayload's "> " text and
// <blockquote type="cite">, without Mail's inline pictures). A quote Mail on its own saved with a draft ({ header, html,
// text, forward }) is used as it is.

const MODES = new Set(["reply", "all", "forward"]);
const ID_RE = /^[\w-]{1,64}$/;

// A draft's or a send's quote as it may be kept: { of, mode } (InFlite's), or Mail on its own's whole quote (strings,
// with of when 1.49 saved it); anything else none.
export function cleanQuote(q) {
  if (!q || typeof q !== "object") return null;
  const of = typeof q.of === "string" && ID_RE.test(q.of) ? q.of : null;
  if (typeof q.header === "string") {
    const str = (v) => (typeof v === "string" ? v : "");
    return { header: str(q.header), html: str(q.html), text: str(q.text), forward: !!q.forward, ...(of && { of }) };
  }
  return of ? { of, mode: MODES.has(q.mode) ? q.mode : "reply" } : null;
}

// fmtQuoteDate (app.js), in London: "3 Nov 2026 at 14:02"
export function quoteDate(ts) {
  const d = new Date(ts);
  const o = { timeZone: "Europe/London" };
  return `${d.toLocaleDateString("en-GB", { ...o, day: "numeric", month: "short", year: "numeric" })} at ${d.toLocaleTimeString("en-GB", { ...o, hour: "numeric", minute: "2-digit" })}`;
}

const parse = (s) => {
  try {
    const v = JSON.parse(s || "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
};

// The quote for { of, mode }, from Mail's own copy of the message: { header, html, text, forward }, or null when Mail no
// longer has it (sent without one, as a reply to a message deleted meanwhile is).
export async function quoteFrom(env, { of, mode }) {
  const row = await env.DB.prepare(`SELECT * FROM messages WHERE id = ?1 AND folder != 'drafts'`).bind(of).first();
  if (!row) return null;
  const [obj, atts] = await Promise.all([
    env.MAIL.get(`body/${of}.json`),
    env.DB.prepare(`SELECT id, content_id FROM attachments WHERE message_id = ?1`).bind(of).all(),
  ]);
  const body = obj ? await obj.json() : {};
  // (pictures in its text, at Mail's address as getMessage gives them, then left out below as buildPayload leaves them)
  let html = String(body.html || "");
  for (const a of atts.results || []) if (a.content_id && html.includes(`cid:${a.content_id}`)) html = html.split(`cid:${a.content_id}`).join(`/api/attachments/${a.id}`);
  const subj = row.subject || "";
  const who = row.from_name ? `${row.from_name} <${row.from_email}>` : row.from_email;
  const header =
    mode === "forward"
      ? `Begin forwarded message:\n\nFrom: ${who}\nSubject: ${subj}\nDate: ${quoteDate(row.date)}\nTo: ${parse(row.to_json).map((p) => p.email).join(", ")}`
      : `On ${quoteDate(row.date)}, ${who} wrote:`;
  return { header, html, text: String(body.text || ""), forward: mode === "forward" };
}

// The words of a message with its quote: buildPayload's (app.js), made here. → { text, html }
export function withQuote(words, quote) {
  let text = String(words || "");
  let html = `<div style="font-family:-apple-system,BlinkMacSystemFont,Helvetica,Arial,sans-serif;font-size:16px;line-height:1.45;color:#1c1c1e">${textToHtml(text)}</div>`;
  if (quote) {
    const qText = quote.text || htmlToText(quote.html);
    text += `\n\n${quote.header}\n\n${quote.forward ? qText : qText.split("\n").map((l) => `> ${l}`).join("\n")}`;
    // (pictures shown from Mail's own attachments are Mail's links, no use to anyone else: they're left out)
    const qHtml = quote.html ? bodyInner(quote.html).replace(/<img\b[^>]*\bsrc\s*=\s*["']?(\/api\/attachments\/|cid:)[^>]*>/gi, "") : textToHtml(quote.text);
    html += `<br><div style="font-family:-apple-system,Helvetica,Arial,sans-serif;color:#6e6e73;font-size:14px">${textToHtml(quote.header)}</div><blockquote type="cite" style="margin:10px 0 0;padding:0 0 0 12px;border-left:2px solid #c7c7cc">${qHtml}</blockquote>`;
  }
  return { text, html };
}

// The page's helpers (app.js linkify, textToHtml, htmlToText, bodyInner), here without a DOM (a Worker has none).
const escapeHtml = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
export function linkify(escaped) {
  return escaped.replace(/\b(https?:\/\/[^\s<>"']+[^\s<>"'.,;:!?)\]])|([\w.+-]+@[\w-]+(?:\.[\w-]+)+)/g, (all, url, mail) =>
    url ? `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>` : `<a href="mailto:${mail}">${mail}</a>`
  );
}
export const textToHtml = (text) => linkify(escapeHtml(text || "")).replace(/\r?\n/g, "<br>");

const NAMED = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'" };
const decode = (s) =>
  s.replace(/&(#x[0-9a-f]{1,6}|#\d{1,7}|[a-z]+\d*);/gi, (all, e) => {
    const k = e.toLowerCase();
    if (k[0] === "#") {
      const n = k[1] === "x" ? parseInt(k.slice(2), 16) : parseInt(k.slice(1), 10);
      return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : all;
    }
    return NAMED[k] ?? all;
  });

// (a message's words from its HTML, as the page's DOMParser reading made them: scripts, styles and the head left out, a
// line for each break and each block's end)
export function htmlToText(html) {
  const s = String(html || "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(script|style|head|title)\b[\s\S]*?<\/\1\s*>/gi, "")
    .replace(/<br\b[^>]*>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h1|h2|h3|h4|blockquote)\s*>/gi, "\n")
    .replace(/<[^>]*>/g, "");
  return decode(s).replace(/\n{3,}/g, "\n\n").trim();
}

// (the inside of a message's <body>, without what could run or post anything: script, iframe, object, embed, form; and
// without what belongs to its head)
export function bodyInner(html) {
  let s = String(html || "");
  const body = /<body\b[^>]*>([\s\S]*?)(<\/body\s*>|$)/i.exec(s);
  s = body ? body[1] : s.replace(/<head\b[\s\S]*?<\/head\s*>/gi, "");
  return s
    .replace(/<(script|iframe|object|form|title|noscript)\b[\s\S]*?<\/\1\s*>/gi, "")
    .replace(/<\/?(script|iframe|object|embed|form|title|noscript|html|head|body|meta|link|base)\b[^>]*>/gi, "")
    .replace(/<!doctype[^>]*>/gi, "");
}
