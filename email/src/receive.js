import PostalMime from "postal-mime";
import { ensureSchema, findThread, cleanMessageId, upsertContacts } from "./db.js";

// Handles mail delivered by Cloudflare Email Routing.
export async function receiveEmail(message, env, ctx) {
  await ensureSchema(env);

  const raw = await new Response(message.raw).arrayBuffer();
  const email = await PostalMime.parse(raw);

  const id = crypto.randomUUID();
  const from = mailbox(email.from) || { name: "", email: message.from };
  const to = addresses(email.to);
  const cc = addresses(email.cc);
  const replyTo = addresses(email.replyTo)[0]?.email || null;
  const messageId = cleanMessageId(email.messageId) || `${id}@${env.DOMAIN}`;
  const inReplyTo = cleanMessageId(email.inReplyTo);
  const threadId = (await findThread(env, inReplyTo, email.references)) || id;
  const date = parseDate(email.date);

  const attachments = (email.attachments || []).map((a) => ({
    id: crypto.randomUUID(),
    filename: a.filename || "attachment",
    type: a.mimeType || "application/octet-stream",
    content: a.content,
    size: byteLength(a.content),
    contentId: cleanMessageId(a.contentId) || null,
    disposition: a.disposition || "attachment",
  }));
  const visibleAttachments = attachments.filter((a) => !(a.disposition === "inline" && a.contentId));

  await Promise.all([
    env.MAIL.put(`raw/${id}.eml`, raw, { httpMetadata: { contentType: "message/rfc822" } }),
    env.MAIL.put(`body/${id}.json`, JSON.stringify({ text: email.text || "", html: email.html || "" }), {
      httpMetadata: { contentType: "application/json" },
    }),
    ...attachments.map((a) => env.MAIL.put(`att/${a.id}`, a.content, { httpMetadata: { contentType: a.type } })),
  ]);

  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO messages (id, folder, thread_id, message_id, in_reply_to, refs, mailbox,
        from_name, from_email, to_json, cc_json, reply_to, subject, snippet, date, unread,
        has_attachments, size)
       VALUES (?1, 'inbox', ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, 1, ?15, ?16)`
    ).bind(
      id,
      threadId,
      messageId,
      inReplyTo || null,
      email.references || null,
      message.to.toLowerCase(),
      from.name,
      from.email.toLowerCase(),
      JSON.stringify(to),
      JSON.stringify(cc),
      replyTo,
      email.subject || "",
      snippet(email.text, email.html),
      date,
      visibleAttachments.length ? 1 : 0,
      message.rawSize || raw.byteLength
    ),
    ...attachments.map((a) =>
      env.DB.prepare(
        `INSERT INTO attachments (id, message_id, filename, type, size, content_id, disposition)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`
      ).bind(a.id, id, a.filename, a.type, a.size, a.contentId, a.disposition)
    ),
  ]);

  ctx.waitUntil(upsertContacts(env, [from]));

  // Optional safety net: also forward to a verified address.
  if (env.FORWARD_TO) ctx.waitUntil(message.forward(env.FORWARD_TO));
}

function mailbox(a) {
  if (!a) return null;
  if (a.group) return a.group[0] ? { name: a.group[0].name || "", email: a.group[0].address } : null;
  return a.address ? { name: a.name || "", email: a.address } : null;
}

function addresses(list) {
  return (list || []).flatMap((a) => (a.group ? a.group.map((g) => mailbox(g)) : [mailbox(a)])).filter(Boolean);
}

function parseDate(d) {
  const t = d ? Date.parse(d) : NaN;
  // Guard against missing or far-future dates pushing mail to the top forever.
  return Number.isFinite(t) && t < Date.now() + 86400000 ? t : Date.now();
}

function byteLength(c) {
  if (typeof c === "string") return new TextEncoder().encode(c).byteLength;
  return c?.byteLength || 0;
}

export function snippet(text, html) {
  let s = text || "";
  if (!s && html) {
    s = html
      // (stop where the quoted reply starts)
      .split(/<blockquote|<div[^>]*class="?gmail_quote|<div[^>]*id="?divRplyFwdMsg/i)[0]
      .replace(/<(style|script|head)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<(br|\/p|\/div)[^>]*>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&#39;|&apos;/g, "'")
      .replace(/&quot;/g, '"');
  }
  // Drop quoted replies (and the "On … wrote:" line before them) so the preview shows what's new.
  const lines = s.split("\n");
  const cut = lines.findIndex((l) => /^\s*>/.test(l) || /^\s*(on\b.+\bwrote:|-{2,}\s*original message\s*-{2,})\s*$/i.test(l));
  return (cut > 0 ? lines.slice(0, cut) : lines.filter((l) => !/^\s*>/.test(l)))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 240);
}
