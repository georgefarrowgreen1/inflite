import PostalMime from "postal-mime";
import { ensureSchema, findThread, cleanMessageId, upsertContacts, bumpVersion } from "./db.js";
import { pushAll, peopleUnread } from "./push.js";
import { arrivalFor } from "./addresses.js";
import { quietNow } from "./auth.js";

// Handles mail delivered by Cloudflare Email Routing. Nothing that arrives is lost: the original is kept first, and if
// reading it fails (twice: a database that's briefly not answering shouldn't make good mail unreadable) it still shows in
// the stream (with the original to download), and goes to FORWARD_TO if that's set. With the database not answering at
// all, a note of it is kept beside the original (pending/), and the scheduled run reads it in once it is (retryPending).
export async function receiveEmail(message, env, ctx) {
  // (to an address that isn't one of yours, with Settings set to turn those away: refused, so its sender hears)
  let arrival = { address: null, reject: false };
  try {
    await ensureSchema(env);
    arrival = await arrivalFor(env, message.to);
  } catch (err) {
    console.error("couldn't check the address", err);
  }
  if (arrival.reject) {
    message.setReject("This address doesn’t exist.");
    return;
  }
  const id = crypto.randomUUID();
  const raw = await new Response(message.raw).arrayBuffer();
  await env.MAIL.put(`raw/${id}.eml`, raw, { httpMetadata: { contentType: "message/rfc822" } });
  let err;
  for (let tries = 0; tries < 2; tries++) {
    try {
      await ensureSchema(env);
      await store(message, env, ctx, id, raw, arrival.address);
      return;
    } catch (e) {
      err = e;
      if (!tries) await new Promise((ok) => setTimeout(ok, 1000));
    }
  }
  console.error("couldn't read an incoming message", id, err);
  if (env.FORWARD_TO) ctx.waitUntil(message.forward(env.FORWARD_TO).catch((e) => console.error("forward", e)));
  try {
    await keepUnread(env, message, id, raw.byteLength);
  } catch (e) {
    console.error("couldn't keep it either; the original is at", `raw/${id}.eml`, e);
    // (to be read in later, from the original; failing that too, the delivery fails, so it's never taken as delivered
    // with nothing to show for it)
    await env.MAIL.put(`pending/${id}`, JSON.stringify({ to: message.to || "", from: message.from || "", at: Date.now() }), {
      httpMetadata: { contentType: "application/json" },
    });
  }
}

// (one that couldn't be read, in the stream as such, with its original to download; an open Mail shows it, as it shows
// any that's come)
async function keepUnread(env, message, id, size) {
  await env.DB.prepare(
    `INSERT INTO messages (id, folder, thread_id, mailbox, from_name, from_email, to_json, cc_json, subject, snippet, date,
       unread, has_attachments, size, category)
     VALUES (?1, 'inbox', ?1, ?2, '', ?3, '[]', '[]', ?4, ?5, ?6, 1, 0, ?7, 'people')`
  )
    .bind(id, (message.to || "").toLowerCase(), (message.from || "").toLowerCase(), "(A message Mail couldn’t read)",
      "Download the original from the menu to see it.", Date.now(), size)
    .run();
  await bumpVersion(env).catch(() => {});
}

// Mail kept while the database wasn't answering (a note under pending/ beside each original), read in now: each as it
// would have been as it came (its address's settings, People or Updates, its conversation, a notice for mail from people)
export async function retryPending(env, ctx) {
  const { objects } = await env.MAIL.list({ prefix: "pending/", limit: 25 });
  if (!objects.length) return;
  await ensureSchema(env);
  for (const o of objects) {
    const id = o.key.slice("pending/".length);
    try {
      const [note, orig, row] = await Promise.all([
        env.MAIL.get(o.key).then((x) => x?.json()).catch(() => null),
        env.MAIL.get(`raw/${id}.eml`),
        env.DB.prepare(`SELECT id FROM messages WHERE id = ?1`).bind(id).first(),
      ]);
      // (already in, or nothing left to read in)
      if (!row && orig) {
        const raw = await orig.arrayBuffer();
        const { address } = await arrivalFor(env, note?.to);
        const message = { to: note?.to || "", from: note?.from || "", rawSize: raw.byteLength };
        // (one that still can't be read, with the database answering now: shown as one that couldn't be)
        await store(message, env, ctx, id, raw, address).catch((err) => {
          console.error("couldn't read a kept message", id, err);
          return keepUnread(env, message, id, raw.byteLength);
        });
      }
      await env.MAIL.delete(o.key);
    } catch (err) {
      console.error("couldn't read in a kept message yet", id, err);
    }
  }
}

async function store(message, env, ctx, id, raw, address) {
  const email = await PostalMime.parse(raw);
  const from = mailbox(email.from) || { name: "", email: message.from || "" };
  from.email ||= message.from || "";
  const to = addresses(email.to);
  const cc = addresses(email.cc);
  const replyTo = addresses(email.replyTo)[0]?.email || null;
  const messageId = cleanMessageId(email.messageId) || `${id}@${env.DOMAIN}`;
  const to1 = (message.to || "").toLowerCase();
  // (the same message delivered again: kept once. Only the same one, though: the same ID from the same sender with the
  // same subject. A message's ID can be known ahead, so one sent first under it mustn't make the real one be dropped:
  // a different message under an ID that's taken is kept, as its own. To two of your addresses, it comes once for each
  // (Email Routing brings one per address), maybe both at once: still one message, one conversation and one notice,
  // with the other address noted on it (also_to), so that address's own mail shows it too. A copy you sent yourself
  // isn't the same as the one that comes, unless it's to the address it's from. same(): its ID, sender, subject and the
  // address it's come to, as where they're bound)
  const same = (mid, who, subj, to) => `message_id = ${mid} AND lower(from_email) = ${who} AND COALESCE(subject, '') = ${subj} AND (lower(mailbox) = ${to} OR folder NOT IN ('sent', 'drafts'))`;
  const sameAs = () =>
    env.DB.prepare(`SELECT id, mailbox, also_to FROM messages WHERE ${same("?2", "?3", "?4", "?5")} ORDER BY id = ?1 DESC LIMIT 1`)
      .bind(id, messageId, from.email.toLowerCase(), email.subject || "", to1)
      .first();
  // (this copy let go, and its address noted on the one kept, where it's another of yours)
  const keptOnce = async (dup) => {
    await env.MAIL.delete(`raw/${id}.eml`);
    if (!to1 || to1 === String(dup.mailbox || "").toLowerCase() || String(dup.also_to || "").includes(`,${to1},`)) return;
    await env.DB.prepare(`UPDATE messages SET also_to = COALESCE(also_to, ',') || ?2 || ',' WHERE id = ?1 AND instr(COALESCE(also_to, ''), ',' || ?2 || ',') = 0`)
      .bind(dup.id, to1)
      .run();
    await bumpVersion(env).catch((e) => console.error("version", e));
  };
  // (with no ID of its own, the one made for it is this copy's alone: only ever found kept by the try before this one)
  const dup = await sameAs();
  // (kept already, by the try before this one: receiveEmail)
  if (dup?.id === id) return;
  if (dup) return keptOnce(dup);
  const inReplyTo = cleanMessageId(email.inReplyTo);
  const existingThread = await findThread(env, inReplyTo, email.references, from.email || "", email.subject || "");
  const threadId = existingThread || id;
  const category = await classify(env, email, from.email, !!existingThread, address?.category);
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

  // (the files just kept go again if the message can't be: else they'd stay with nothing pointing at them)
  const unkeep = () => env.MAIL.delete([`body/${id}.json`, ...attachments.map((a) => `att/${a.id}`)]).catch(() => {});
  // (all or nothing, and nothing if the same message has been kept meanwhile: same(), above)
  const isNew = `EXISTS (SELECT 1 FROM messages WHERE id = ?1)`;
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO messages (id, folder, thread_id, message_id, in_reply_to, refs, mailbox,
        from_name, from_email, to_json, cc_json, reply_to, subject, snippet, date, unread,
        has_attachments, size, category, unsub, unsub_post)
       SELECT ?1, 'inbox', ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, 1, ?15, ?16, ?17, ?18, ?19
       WHERE NOT EXISTS (SELECT 1 FROM messages WHERE ${same("?3", "?8", "?12", "?6")})`
    ).bind(
      id,
      threadId,
      messageId,
      inReplyTo || null,
      email.references || null,
      to1,
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
      category,
      unsubOf(email),
      /one-click/i.test(headerOf(email, "list-unsubscribe-post")) ? 1 : 0
    ),
    // (a new message brings its conversation back into the stream, snoozed or not)
    env.DB.prepare(`UPDATE messages SET snooze_until = NULL WHERE thread_id = ?2 AND snooze_until IS NOT NULL AND ${isNew}`).bind(id, threadId),
    ...attachments.map((a) =>
      env.DB.prepare(
        `INSERT INTO attachments (id, message_id, filename, type, size, content_id, disposition)
         SELECT ?2, ?1, ?3, ?4, ?5, ?6, ?7 WHERE ${isNew}`
      ).bind(id, a.id, a.filename, a.type, a.size, a.contentId, a.disposition)
    ),
  ]).catch(async (err) => {
    // (the database's answer lost, though it took them: kept, as it has them, and its files with it. Else the try after
    // this one would find it kept (above) with its body and files gone)
    if (await env.DB.prepare(`SELECT 1 AS k FROM messages WHERE id = ?1`).bind(id).first().catch(() => null)) return;
    await unkeep();
    throw err;
  });
  // (the same one, come to another of your addresses at the same moment, kept just before this: this one let go. Not
  // kept, yet the same as nothing (gone that moment)? Tried again, as new. Not known, the database not answering just
  // then: taken as kept, as it most likely was, so its notice still goes)
  const kept = email.messageId ? await env.DB.prepare(`SELECT 1 AS k FROM messages WHERE id = ?1`).bind(id).first().catch(() => ({ k: 1 })) : true;
  if (!kept) {
    await unkeep();
    const dup = await sameAs();
    if (!dup) throw new Error("not kept, and the same as nothing kept");
    return keptOnce(dup);
  }

  // (the message is kept by now: these failing mustn't send it down the couldn't-read path, kept and forwarded twice)
  ctx.waitUntil(upsertContacts(env, [from]).catch((e) => console.error("contacts", e)));
  await bumpVersion(env).catch((e) => console.error("version", e));

  // A notice for mail from people (not for updates: newsletters, receipts and the like wait in the stream), unless its
  // address is set not to notify; an address set to Updates that notifies, notifies for all of it
  const notify = address ? address.notify && (category === "people" || address.category === "updates") : category === "people";
  // (none in the account's Quiet Hours: what came meanwhile is there, unread, when they're over)
  if (notify && !(await quietNow(env))) {
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

  // Optional safety net: also forward to a verified address. (Not for one read in later, from what was kept: forwarded
  // as it came)
  if (env.FORWARD_TO && message.forward) ctx.waitUntil(message.forward(env.FORWARD_TO).catch((e) => console.error("forward", e)));
}

// People or Updates: a rule set for the sender wins; then the address's own setting; then a reply in a conversation you're part of is People; then the
// signs bulk mail carries (an unsubscribe link, a list, "bulk" precedence, an automated sender) make it Updates.
const BULK_SENDER = /^(no-?reply|do-?not-?reply|notifications?|newsletters?|news|updates?|alerts?|receipts?|billing|invoices?|mailer(-daemon)?|bounces?|marketing|digest)([+._-]|@)/i;

const headerOf = (email, k) => (email.headers || []).find((h) => h.key === k)?.value || "";

// (the ways to stop it the sender gives, kept as they were given, for Unsubscribe)
function unsubOf(email) {
  const v = headerOf(email, "list-unsubscribe").replace(/\s+/g, " ").trim();
  return /<(https:|mailto:)/i.test(v) ? v.slice(0, 2000) : null;
}

async function classify(env, email, fromEmail, inConversation, addressCategory) {
  const rule = await env.DB.prepare(`SELECT category FROM sender_rules WHERE email = ?1`)
    .bind((fromEmail || "").toLowerCase())
    .first();
  if (rule) return rule.category;
  // (then where its address sends its mail, as Settings has it)
  if (addressCategory) return addressCategory;
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
