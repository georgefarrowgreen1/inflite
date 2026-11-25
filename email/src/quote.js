// Replies and forwards quoted by Mail's server (One roof, stage 4, S4-D4). Under the roof the page never has the original's
// body: compose carries quote: { of: <message id>, mode: "reply"|"all"|"forward" }, and Mail builds from its own copy what
// Mail on its own builds in the page (email/public/app.js replyDraft's header, buildPayload's "> " text and
// <blockquote type="cite">, without Mail's inline pictures). A quote Mail on its own saved with a draft ({ header, html,
// text, forward }) is used as it is.

const MODES = new Set(["reply", "all", "forward"]);
const ID_RE = /^[\w-]{1,64}$/;
const LEGACY_MESSAGE = '<div style="font-family:-apple-system,BlinkMacSystemFont,Helvetica,Arial,sans-serif;font-size:16px;line-height:1.45;color:#1c1c1e">';
const LEGACY_ATTRIBUTION = '<br><div style="font-family:-apple-system,Helvetica,Arial,sans-serif;color:#6e6e73;font-size:14px">';
const LEGACY_QUOTE = '<blockquote type="cite" style="margin:10px 0 0;padding:0 0 0 12px;border-left:2px solid #c7c7cc">';

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
export function withQuote(words, quote, authoredHtml, renderQuote = legacyQuote) {
  let text = String(words || "");
  let html = authoredHtml ?? messageHtml(text);
  if (quote) {
    const qText = quote.text || htmlToText(quote.html);
    text += `\n\n${quote.header}\n\n${quote.forward ? qText : qText.split("\n").map((l) => `> ${l}`).join("\n")}`;
    // (pictures shown from Mail's own attachments are Mail's links, no use to anyone else: they're left out)
    const qHtml = quote.html ? quoteBody(quote.html) : textToHtml(quote.text);
    html += renderQuote(textToHtml(quote.header), qHtml);
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

function messageHtml(words) {
  return LEGACY_MESSAGE + textToHtml(words) + "</div>";
}

function legacyQuote(heading, body) {
  return LEGACY_ATTRIBUTION + heading + "</div>" + LEGACY_QUOTE + body + "</blockquote>";
}

function quoteBody(html) {
  return bodyInner(html).replace(/<img\b[^>]*\bsrc\s*=\s*["']?(\/api\/attachments\/|cid:)[^>]*>/gi, "");
}

function personalQuote(heading, body) {
  return `<blockquote type="cite" class="ifl-personal-quote" style="margin:24px 0 0;padding:2px 0 2px 13px;border-left:2px solid #c6d0e0;color:#526174;font-size:14px;line-height:21px"><p style="margin:0 0 6px;font-size:13px;line-height:19px;font-weight:600">${heading}</p>${body}</blockquote>`;
}

function signatureHtml(sender, extra = "") {
  // The name and attribution remain readable when clients block the decorative image.
  return `<table class="ifl-personal-rule" role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:24px;border-top:1px solid #dce2eb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif"><tr><td style="padding-top:16px;overflow-wrap:anywhere">
    <p style="margin:0 0 5px;font-size:15px;line-height:21px"><strong>${escapeHtml(sender)}</strong></p>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
      <td class="ifl-personal-secondary" valign="middle" style="font-size:13px;line-height:19px;color:#526174">Sent with InFlite</td>
      <td valign="middle" style="padding-left:7px"><img src="https://inflite.ai/icon-192.png" alt="" width="17" height="17" style="width:17px;height:17px;display:block;border:0;border-radius:4px"></td>
    </tr></table>
    ${extra ? `<p class="ifl-personal-secondary" style="margin:5px 0 0;font-size:12px;line-height:18px;color:#526174">${textToHtml(extra)}</p>` : ""}
  </td></tr></table>`;
}

function personalContent(words, { name, from, signature }) {
  const sender = name || from;
  const first = name?.split(/\s+/)[0] || from;
  const normalized = words.replace(/\r\n/g, "\n").trimEnd();
  const saved = signature?.replace(/\r\n/g, "\n").trimEnd();
  const closing = [saved, sender, first].find(value => value && normalized.endsWith("\n\n" + value));
  const prose = (closing ? normalized.slice(0, -closing.length - 2) : normalized).trim();
  const extra = closing === saved && closing !== sender && closing !== first ? closing : "";
  const paragraphs = prose ? prose.split(/\n(?:[ \t]*\n)+/).map((p, i) =>
    `<p style="margin:${i ? "14px 0 0" : "0"};font-size:16px;line-height:1.55">${textToHtml(p)}</p>`
  ).join("") : "";
  return paragraphs + signatureHtml(sender, extra);
}

function personalDocument(body) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark">
  <style>
    :root { color-scheme:light dark; supported-color-schemes:light dark; }
    .ifl-personal-gutter a { color:#224fae; }
    .ifl-personal-quote > .ifl-personal-column { background:transparent !important; color:inherit !important; margin:0; }
    .ifl-personal-quote .ifl-personal-gutter { padding:0 !important; }
    @media (max-width:460px) { .ifl-personal-gutter { padding:27px 24px 28px !important; } }
    @media (prefers-color-scheme:dark) {
      .ifl-personal-surface { background:#171b24 !important; color:#edf2fa !important; }
      .ifl-personal-secondary, .ifl-personal-quote { color:#b3bfd1 !important; }
      .ifl-personal-rule { border-color:#364151 !important; }
      .ifl-personal-quote { border-color:#506079 !important; }
      .ifl-personal-gutter a { color:#accbff !important; }
    }
  </style></head><body data-ifl-personal class="ifl-personal-surface" style="margin:0;padding:0;background:#ffffff;color:#182235;-webkit-text-size-adjust:100%">
  <table class="ifl-personal-column ifl-personal-surface" role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" align="center" style="max-width:580px;margin:0 auto;background:#ffffff;color:#182235"><tr><td class="ifl-personal-gutter" align="left" style="padding:35px 34px;font:16px/1.55 -apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;overflow-wrap:anywhere">${body}</td></tr></table>
  </body></html>`;
}

// Older standalone clients send their own HTML for replies. Recognise the
// generated wrapper so those messages can use the same layout as new drafts.
function legacyReply(html) {
  if (!html.startsWith(LEGACY_MESSAGE) || !html.endsWith("</blockquote>")) return null;
  const divider = "</div>" + LEGACY_ATTRIBUTION;
  const authoredEnd = html.indexOf("</div>", LEGACY_MESSAGE.length);
  if (authoredEnd < 0 || !html.startsWith(divider, authoredEnd)) return null;
  const headingStart = authoredEnd + divider.length;
  const bodyStart = "</div>" + LEGACY_QUOTE;
  const headingEnd = html.indexOf("</div>", headingStart);
  if (headingEnd < 0 || !html.startsWith(bodyStart, headingEnd)) return null;
  return {
    words: htmlToText(html.slice(LEGACY_MESSAGE.length, authoredEnd)),
    quote: personalQuote(bodyInner(html.slice(headingStart, headingEnd)), quoteBody(html.slice(headingEnd + bodyStart.length, -"</blockquote>".length))),
  };
}

export function personalMessage(text, identity, { richHtml, quote } = {}) {
  if (!richHtml || richHtml === messageHtml(text)) {
    const result = withQuote(text, quote, personalContent(text, identity), personalQuote);
    return { text: result.text, html: personalDocument(result.html) };
  }
  const reply = legacyReply(richHtml);
  if (reply) return { text, html: personalDocument(personalContent(reply.words, identity) + reply.quote) };

  // A caller's rich text may be a complete document with its own styling.
  const boundary = richHtml.search(/<br><div style="font-family:-apple-system,Helvetica,Arial,sans-serif;color:#6e6e73;font-size:14px">|<\/body\s*>|<\/html\s*>/i);
  const end = boundary < 0 ? richHtml.length : boundary;
  const footer = signatureHtml(identity.name || identity.from);
  return { text, html: richHtml.slice(0, end) + footer + richHtml.slice(end) };
}

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
    else if (!TAG_DROP.has(t.name) && TAG_OK.test(t.name)) out += t.end ? `</${t.name}>` : `<${t.name}${attrsOut(t.attrs)}>`;
  });
  return out;
}
