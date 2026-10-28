import PostalMime from "postal-mime";
import { ensureSchema, findThread, cleanMessageId, upsertContacts, bumpVersion } from "./db.js";
import { pushAll, peopleUnread } from "./push.js";

// Handles mail delivered by Cloudflare Email Routing. Nothing that arrives is lost: the original is kept first, and if
// reading it fails it still shows in the stream (with the original to download), and goes to FORWARD_TO if that's set.
export async function receiveEmail(message, env, ctx) {
  const id = crypto.randomUUID();
  const raw = await new Response(message.raw).arrayBuffer();
  await env.MAIL.put(`raw/${id}.eml`, raw, { httpMetadata: { contentType: "message/rfc822" } });
  try {
    await ensureSchema(env);
    await store(message, env, ctx, id, raw);
  } catch (err) {
    console.error("couldn't read an incoming message", id, err);
    if (env.FORWARD_TO) ctx.waitUntil(message.forward(env.FORWARD_TO).catch((e) => console.error("forward", e)));
    await env.DB.prepare(
      `INSERT INTO messages (id, folder, thread_id, mailbox, from_name, from_email, to_json, cc_json, subject, snippet, date,
         unread, has_attachments, size, category)
       VALUES (?1, 'inbox', ?1, ?2, '', ?3, '[]', '[]', ?4, ?5, ?6, 1, 0, ?7, 'people')`
    )
      .bind(id, (message.to || "").toLowerCase(), (message.from || "").toLowerCase(), "(A message Mail couldn’t read)",
        "Download the original from the menu to see it.", Date.now(), raw.byteLength)
      .run()
      .catch((e) => console.error("couldn't keep it either; the original is at", `raw/${id}.eml`, e));
  }
}

async function store(message, env, ctx, id, raw) {
  const email = await PostalMime.parse(raw);
  const from = mailbox(email.from) || { name: "", email: message.from || "" };
  from.email ||= message.from || "";
  const to = addresses(email.to);
  const cc = addresses(email.cc);
  const replyTo = addresses(email.replyTo)[0]?.email || null;
  const messageId = cleanMessageId(email.messageId) || `${id}@${env.DOMAIN}`;
  // (the same message delivered again: kept once)
  if (email.messageId) {
    const dup = await env.DB.prepare(`SELECT id FROM messages WHERE message_id = ?1 AND mailbox = ?2 LIMIT 1`)
      .bind(messageId, (message.to || "").toLowerCase())
      .first();
    if (dup) {
      await env.MAIL.delete(`raw/${id}.eml`);
      return;
    }
  }
  const inReplyTo = cleanMessageId(email.inReplyTo);
  const existingThread = await findThread(env, inReplyTo, email.references);
  const threadId = existingThread || id;
  const category = await classify(env, email, from.email, !!existingThread);
  const date = parseDate(email.date);

  // (at most 30 parts kept apart; any more stay in the original)
  const attachments = (email.attachments || []).slice(0, 30).map((a) => ({
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
    env.MAIL.put(`body/${id}.json`, JSON.stringify({ text: email.text || "", html: email.html || "" }), {
      httpMetadata: { contentType: "application/json" },
    }),
    ...attachments.map((a) => env.MAIL.put(`att/${a.id}`, a.content, { httpMetadata: { contentType: a.type } })),
  ]);

  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO messages (id, folder, thread_id, message_id, in_reply_to, refs, mailbox,
        from_name, from_email, to_json, cc_json, reply_to, subject, snippet, date, unread,
        has_attachments, size, category)
       VALUES (?1, 'inbox', ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, 1, ?15, ?16, ?17)`
    ).bind(
      id,
      threadId,
      messageId,
      inReplyTo || null,
      email.references || null,
      (message.to || "").toLowerCase(),
      from.name,
      from.email.toLowerCase(),
      JSON.stringify(to),
      JSON.stringify(cc),
      replyTo,
      email.subject || "",
      snippet(email.text, email.html),
      date,
      visibleAttachments.length ? 1 : 0,
      message.rawSize || raw.byteLength,
      category
    ),
    // (a new message brings its conversation back into the stream, snoozed or not)
    env.DB.prepare(`UPDATE messages SET snooze_until = NULL WHERE thread_id = ?1 AND snooze_until IS NOT NULL`).bind(threadId),
    ...attachments.map((a) =>
      env.DB.prepare(
        `INSERT INTO attachments (id, message_id, filename, type, size, content_id, disposition)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`
      ).bind(a.id, id, a.filename, a.type, a.size, a.contentId, a.disposition)
    ),
  ]);

  ctx.waitUntil(upsertContacts(env, [from]));
  await bumpVersion(env);

  // A notice for mail from people (not for updates: newsletters, receipts and the like wait in the stream)
  if (category === "people") {
    ctx.waitUntil(
      peopleUnread(env).then((badge) =>
        pushAll(env, {
          title: from.name || from.email,
          body: [email.subject || "(No Subject)", snippet(email.text, email.html)].filter(Boolean).join("\n").slice(0, 240),
          tag: threadId,
          url: `/#thread=${threadId}`,
          badge,
        })
      )
    );
  }

  // Optional safety net: also forward to a verified address.
  if (env.FORWARD_TO) ctx.waitUntil(message.forward(env.FORWARD_TO));
}

// People or Updates: a rule set for the sender wins; then a reply in a conversation you're part of is People; then the
// signs bulk mail carries (an unsubscribe link, a list, "bulk" precedence, an automated sender) make it Updates.
const BULK_SENDER = /^(no-?reply|do-?not-?reply|notifications?|newsletters?|news|updates?|alerts?|receipts?|billing|invoices?|mailer(-daemon)?|bounces?|marketing|digest)([+._-]|@)/i;

async function classify(env, email, fromEmail, inConversation) {
  const rule = await env.DB.prepare(`SELECT category FROM sender_rules WHERE email = ?1`)
    .bind((fromEmail || "").toLowerCase())
    .first();
  if (rule) return rule.category;
  if (inConversation) return "people";
  const header = (k) => (email.headers || []).find((h) => h.key === k)?.value || "";
  const auto = header("auto-submitted");
  if (
    header("list-unsubscribe") ||
    header("list-id") ||
    /^(bulk|list|junk)$/i.test(header("precedence").trim()) ||
    (auto && !/^no$/i.test(auto.trim())) ||
    header("feedback-id") ||
    BULK_SENDER.test(fromEmail || "")
  )
    return "updates";
  return "people";
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
