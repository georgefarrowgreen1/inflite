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

const NAMED = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: "\u00a0", "#39": "'", hellip: "\u2026", mdash: "\u2014", ndash: "\u2013",
  lsquo: "\u2018", rsquo: "\u2019", ldquo: "\u201c", rdquo: "\u201d", bull: "\u2022", middot: "\u00b7", copy: "\u00a9", reg: "\u00ae",
  trade: "\u2122", euro: "\u20ac", pound: "\u00a3", shy: "\u00ad", zwnj: "\u200c", zwj: "\u200d",
};
const decode = (s) =>
  s.replace(/&(#x[0-9a-f]{1,6}|#\d{1,7}|[a-z]+\d*);/gi, (all, e) => {
    const k = e.toLowerCase();
    if (k[0] === "#") {
      const n = k[1] === "x" ? parseInt(k.slice(2), 16) : parseInt(k.slice(1), 10);
      return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : all;
    }
    return NAMED[k] ?? all;
  });

// HTML read once, a piece at a time, as a browser reads it (a comment, a tag, or the text between), never by stripping
// matches from the string: a strip can rebuild what it strips ("<scr<script>ipt>"). What's kept is written out again from
// what was read: its text with "<" and ">" escaped, so every "<" that goes out starts a tag made here.
// (a tag cut short by another "<", or by the end, is left out, as a browser leaves out one the end cuts short; and no
// reading runs back over the string)
const TOKEN = /<!--[\s\S]*?(?:--!?>|$)|<![^>]*>?|<\?[^>]*>?|<(\/?)([a-zA-Z][^\s\/><]*)((?:[^><"']|"[^"]*"|'[^']*')*)>|<\/?[a-zA-Z][^<>]*(?=<|$)/g;
// (the elements dropped with all inside them: until their end tag, or the end)
const skipTo = (html, name, from) => {
  const re = new RegExp(`</${name}(?=[\\s/>])[^>]*>`, "ig");
  re.lastIndex = from;
  const m = re.exec(html);
  return m ? m.index + m[0].length : html.length;
};
// (an attribute kept only when it can't run anything: no on…= handlers, no javascript: or vbscript: address, however
// it's spelt with entities, tabs or line breaks; no style that runs script)
const ATTR = /([^\s"'>\/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
const NAME_OK = /^[a-zA-Z_:][-a-zA-Z0-9_:.]*$/;
const urlish = (v) =>
  v
    .replace(/&#(x[0-9a-f]+|\d+);?/gi, (all, e) => {
      const n = e[0].toLowerCase() === "x" ? parseInt(e.slice(1), 16) : parseInt(e, 10);
      return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : "";
    })
    .replace(/&(tab|newline);?/gi, "")
    .replace(/&colon;?/gi, ":")
    .replace(/[\u0000-\u0020\u007f-\u00a0]/g, "")
    .toLowerCase();
function attrsOut(raw) {
  let out = "";
  for (const m of String(raw || "").matchAll(ATTR)) {
    const name = m[1];
    if (!NAME_OK.test(name) || /^on/i.test(name)) continue;
    const v = m[2] ?? m[3] ?? m[4];
    if (v === undefined) {
      out += ` ${name.toLowerCase()}`;
      continue;
    }
    const u = urlish(v);
    if (/^(java|vb|live)script:/.test(u) || /(java|vb)script:|expression\(|-moz-binding|behavior:/.test(name.toLowerCase() === "style" ? u : "")) continue;
    out += ` ${name.toLowerCase()}="${v.replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}"`;
  }
  return out;
}

// Walks html: for each element in drop, skips it and all inside it; calls on(token) for everything else. Inside a
// raw-text element kept (style), its text comes as { text, raw: true }.
function walk(html, drop, on) {
  const re = new RegExp(TOKEN.source, "g");
  let at = 0;
  while (at < html.length) {
    re.lastIndex = at;
    const m = re.exec(html);
    if (!m) {
      on({ text: html.slice(at) });
      break;
    }
    if (m.index > at) on({ text: html.slice(at, m.index) });
    at = m.index + m[0].length;
    if (!m[2]) continue; // (a comment, a doctype, a processing instruction, a tag cut short: left out)
    const name = m[2].toLowerCase();
    const end = !!m[1];
    if (!end && drop.has(name)) {
      at = skipTo(html, name, at);
      continue;
    }
    on({ name, end, attrs: m[3] });
    if (!end && name === "style") {
      const close = /<\/style(?=[\s/>])/gi;
      close.lastIndex = at;
      const to = close.exec(html)?.index ?? html.length;
      on({ text: html.slice(at, to), raw: true });
      at = to;
    }
  }
}

// (a message's words from its HTML, as the page's DOMParser reading made them: scripts, styles and the head left out, a
// line for each break and each block's end)
const TEXT_DROP = new Set(["script", "style", "head", "title"]);
const BLOCK_END = new Set(["p", "div", "tr", "li", "h1", "h2", "h3", "h4", "blockquote"]);
export function htmlToText(html) {
  let s = "";
  walk(String(html || ""), TEXT_DROP, (t) => {
    if (t.text !== undefined) s += decode(t.text);
    else if (!t.end && t.name === "br") s += "\n";
    else if (t.end && BLOCK_END.has(t.name)) s += "\n";
  });
  return s.replace(/\n{3,}/g, "\n\n").trim();
}

// (the inside of a message's <body>, without what could run or post anything: script, iframe, object, embed, form,
// on…= handlers and javascript: addresses; and without what belongs to its head. Every tag kept is written out again
// from its name and the attributes kept, its text escaped.)
const BODY_DROP = new Set(["script", "iframe", "object", "form", "title", "noscript", "head", "applet", "frameset", "noembed", "noframes", "template", "xmp", "plaintext"]);
const TAG_DROP = new Set(["embed", "html", "body", "meta", "link", "base", "frame", "portal", "animate", "animatemotion", "animatetransform", "set", "param"]);
const TAG_OK = /^[a-z][a-z0-9-]*(:[a-z][a-z0-9-]*)?$/;
export function bodyInner(html) {
  let s = String(html || "");
  const body = /<body\b[^>]*>([\s\S]*?)(<\/body\s*>|$)/i.exec(s);
  if (body) s = body[1];
  let out = "";
  walk(s, BODY_DROP, (t) => {
    if (t.text !== undefined) out += t.raw ? t.text.replace(/</g, "&lt;") : t.text.replace(/</g, "&lt;").replace(/>/g, "&gt;");
    else if (TAG_DROP.has(t.name) || !TAG_OK.test(t.name)) return;
    else out += t.end ? `</${t.name}>` : `<${t.name}${attrsOut(t.attrs)}>`;
  });
  return out;
}
