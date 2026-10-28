import { accountView, accessOf, passOn, forgetCheck } from "./auth.js";
import {
  bumpVersion,
  mailVersion,
  ensureSchema,
  FOLDERS,
  rowToSummary,
  rowToMessage,
  upsertContacts,
  findThread,
  cleanMessageId,
} from "./db.js";
import { receiveEmail, snippet } from "./receive.js";
import { listThreads, getThread, threadAction, counts, wakeSnoozed, unsubInfo } from "./threads.js";
import { vapid, pushAll, pushEndpointOk, peopleUnread } from "./push.js";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(request);
    try {
      return await api(request, env, ctx, url);
    } catch (err) {
      if (!err.status || err.status >= 500) console.error(err);
      // (the words of errors Mail raised itself; never a database's)
      const said = err.publicMessage || (err.status && err.status < 500 ? err.message : null);
      return json({ error: said || "Something went wrong. Try again.", access: err.access }, err.status || 500);
    }
  },

  async email(message, env, ctx) {
    await receiveEmail(message, env, ctx);
  },


  // Every few minutes: conversations whose Later time has come go back in the stream, with a notice.
  async scheduled(event, env, ctx) {
    await ensureSchema(env);
    const woken = await wakeSnoozed(env);
    if (!woken.length) return;
    const badge = await peopleUnread(env);
    await Promise.all(
      woken.map((w) =>
        pushAll(env, { title: w.from || "Mail", body: `Back from Later: ${w.subject}`, tag: w.threadId, url: `/#thread=${w.threadId}`, badge })
      )
    );
  },
};

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
    this.publicMessage = message;
  }
}

const SAFE = { "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'" };

const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...SAFE, ...headers },
  });

const EMAIL_RE = /^[^\s@<>()",;]+@[^\s@<>()",;]+\.[^\s@<>()",;]+$/;

async function api(request, env, ctx, url) {
  const { pathname } = url;
  const method = request.method;

  // Mutating requests must carry a custom header, which browsers won't send
  // cross-site without a CORS preflight (CSRF protection).
  if (method !== "GET" && method !== "HEAD" && request.headers.get("X-Inflite") !== "1") {
    throw new HttpError(403, "Missing request header");
  }

  // Same-site pages elsewhere on inflite.ai also carry the account cookie, so the API answers only this app's own pages.
  const site = request.headers.get("Sec-Fetch-Site");
  if (site && site !== "same-origin" && site !== "none") throw new HttpError(403, "That request didn’t come from Mail.");

  if (pathname === "/api/session" && method === "GET") {
    const view = await accountView(env, request);
    return json({ access: accessOf(view), accountOrigin: env.ACCOUNT_ORIGIN, user: publicUser(view) });
  }

  // Back from the account's page: the code it handed back, swapped there for the site's sign-in.
  if (pathname === "/api/auth/handback" && method === "POST") {
    const { code, verifier } = await request.json();
    const r = await passOn(env, request, "handback", { code, verifier });
    if (r.status !== 200) throw new HttpError(r.status === 403 ? 403 : 400, r.data.error || "That sign-in didn’t work. Try again.");
    const res = json({ access: accessOf(r.data), accountOrigin: env.ACCOUNT_ORIGIN, user: publicUser(r.data) });
    for (const c of r.setCookies) res.headers.append("Set-Cookie", c);
    return res;
  }

  // Signing out of Mail signs out of the account everywhere it's shared, as in the other inflite apps.
  if (pathname === "/api/logout" && method === "POST") {
    forgetCheck(request);
    const r = await passOn(env, request, "signout", {});
    const res = json({ ok: r.status === 200 });
    for (const c of r.setCookies) res.headers.append("Set-Cookie", c);
    return res;
  }

  const view = await accountView(env, request);
  const access = accessOf(view);
  if (access !== "ok") {
    const err = new HttpError(401, access === "notadmin" ? "Mail is only for the site’s admin." : "Sign in to open Mail.");
    err.access = access;
    throw err;
  }
  await ensureSchema(env);

  const res = await route(request, env, ctx, url, view);
  // (anything that changed the mailbox moves its version on)
  if (method !== "GET" && res.ok) ctx.waitUntil(bumpVersion(env).catch(() => {}));
  return res;
}

async function route(request, env, ctx, url, view) {
  const { pathname } = url;
  const method = request.method;
  let m;
  if (pathname === "/api/version" && method === "GET") return json({ v: await mailVersion(env) });
  if (pathname === "/api/me" && method === "GET") return me(env, view);
  if (pathname === "/api/photo" && method === "GET") return photo(env, request, url);
  if ((m = pathname.match(/^\/api\/unsubscribe\/([\w-]+)$/))) {
    if (method === "GET") {
      const info = await unsubInfo(env, m[1]);
      if (!info) throw new HttpError(404, "This sender doesn't say how to unsubscribe.");
      return json({ sender: info.sender, opened: info.opened, of: info.of, how: info.oneClick && info.https ? "oneclick" : info.mailto ? "mail" : info.https ? "page" : null });
    }
    if (method === "POST") return unsubscribe(env, m[1]);
  }
  if (pathname === "/api/counts" && method === "GET") return json(await counts(env));
  if (pathname === "/api/threads" && method === "GET") return json(await listThreads(env, url));
  if (pathname === "/api/threads/batch" && method === "POST") return threadBatch(env, await request.json());
  if ((m = pathname.match(/^\/api\/threads\/([\w-]+)$/))) {
    if (method === "GET") {
      const t = await getThread(env, m[1]);
      if (!t) throw new HttpError(404, "Conversation not found");
      return json(t);
    }
    if (method === "POST") {
      await threadAction(env, m[1], await request.json(), deleteMessages);
      return json({ ok: true });
    }
  }
  if (pathname === "/api/trash/empty" && method === "POST") return emptyTrash(env);
  if (pathname === "/api/push/key" && method === "GET") return json({ key: (await vapid(env)).pub });
  if (pathname === "/api/push/subscribe" && method === "POST") return pushSubscribe(env, await request.json());
  if (pathname === "/api/push/unsubscribe" && method === "POST") {
    const { endpoint } = await request.json();
    await env.DB.prepare(`DELETE FROM push_subs WHERE endpoint = ?1`).bind(String(endpoint || "")).run();
    return json({ ok: true });
  }
  if (pathname === "/api/messages" && method === "GET") return listMessages(env, url);
  if (pathname === "/api/messages/batch" && method === "POST") return batchUpdate(env, await request.json());
  if ((m = pathname.match(/^\/api\/messages\/([\w-]+)$/))) {
    if (method === "GET") return getMessage(env, m[1]);
    if (method === "PATCH") return updateMessage(env, m[1], await request.json());
    if (method === "DELETE") return deleteMessages(env, [m[1]]);
  }
  if ((m = pathname.match(/^\/api\/messages\/([\w-]+)\/raw$/)) && method === "GET") return rawMessage(env, m[1]);
  if ((m = pathname.match(/^\/api\/attachments\/([\w-]+)$/)) && method === "GET") return attachment(env, m[1], url);
  if (pathname === "/api/contacts" && method === "GET") return contacts(env, url);
  if (pathname === "/api/send" && method === "POST") {
    if (Number(request.headers.get("Content-Length")) > 36 * 1024 * 1024) throw new HttpError(413, "That message is too big to send.");
    return send(env, ctx, await request.json(), view);
  }
  if (pathname === "/api/drafts" && method === "POST") return saveDraft(env, await request.json(), view);

  throw new HttpError(404, "Not found");
}

// Unsubscribe: by the sender's one-click address (RFC 8058) if it has one, else by the email it gives; failing both, the
// page it gives, for Mail to open. Then everything from it that's waiting goes to Done.
async function unsubscribe(env, threadId) {
  const info = await unsubInfo(env, threadId);
  if (!info) throw new HttpError(404, "This sender doesn't say how to unsubscribe.");
  let done = false;
  if (info.oneClick && info.https) {
    try {
      const u = new URL(info.https);
      if (u.protocol === "https:" && !u.port && !u.username) {
        const r = await fetch(u, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: "List-Unsubscribe=One-Click",
          redirect: "manual",
          signal: AbortSignal.timeout(8000),
        });
        done = r.status < 400;
      }
    } catch (err) {
      console.error("one-click unsubscribe", err?.message);
    }
  }
  if (!done && info.mailto) {
    const u = new URL(info.mailto);
    const to = decodeURIComponent(u.pathname);
    if (EMAIL_RE.test(to)) {
      let from;
      try {
        from = checkFrom(env, info.mailbox);
      } catch {
        from = checkFrom(env, null);
      }
      await env.EMAIL.send({ from, to, subject: u.searchParams.get("subject") || "unsubscribe", text: u.searchParams.get("body") || "unsubscribe" });
      done = true;
    }
  }
  if (!done) {
    if (info.https) return json({ ok: false, open: info.https });
    throw new HttpError(502, "Couldn't unsubscribe. Try the link in one of their emails.");
  }
  await env.DB.prepare(`UPDATE messages SET folder = 'archive', snooze_until = NULL WHERE from_email = ?1 AND folder = 'inbox'`)
    .bind(info.sender.email)
    .run();
  return json({ ok: true });
}

// A phone or browser turning notifications on (its subscription from PushManager.subscribe)
async function pushSubscribe(env, body) {
  const { endpoint, keys } = body || {};
  if (!pushEndpointOk(endpoint)) throw new HttpError(400, "That device can’t get notifications from Mail.");
  const ok = (s) => typeof s === "string" && /^[\w-]{8,200}$/.test(s);
  if (!ok(keys?.p256dh) || !ok(keys?.auth)) throw new HttpError(400, "That subscription is missing its keys.");
  await env.DB.prepare(
    `INSERT INTO push_subs (endpoint, p256dh, auth, created_at) VALUES (?1, ?2, ?3, ?4)
     ON CONFLICT(endpoint) DO UPDATE SET p256dh = excluded.p256dh, auth = excluded.auth`
  )
    .bind(endpoint, keys.p256dh, keys.auth, Date.now())
    .run();
  // (no more than a handful of devices: the oldest go)
  await env.DB.prepare(`DELETE FROM push_subs WHERE endpoint NOT IN (SELECT endpoint FROM push_subs ORDER BY created_at DESC LIMIT 10)`).run();
  return json({ ok: true });
}

const publicUser = (v) =>
  v?.signedIn
    ? { name: v.name, handle: v.handle, email: v.email, admin: !!v.admin, appearance: v.appearance || "auto", photoAt: v.photoAt || null }
    : null;

// Your account's photo, from the account's address with your sign-in (where its page has it: the account's address only
// answers /api/account/), kept for good by the browser under its ?v= (when it last changed)
async function photo(env, request, url) {
  const r = await fetch(`${env.ACCOUNT_ORIGIN}/api/account/me/photo?v=${encodeURIComponent(url.searchParams.get("v") || "")}`, {
    headers: { Cookie: request.headers.get("Cookie") || "", Accept: "image/*" },
  });
  const type = r.headers.get("Content-Type") || "";
  if (!r.ok || !type.startsWith("image/")) throw new HttpError(404, "No photo.");
  return new Response(r.body, { headers: { "Content-Type": type, "Cache-Control": "private, max-age=31536000, immutable", ...SAFE } });
}

const senderName = (env, view) => env.DISPLAY_NAME || view?.name || "";

async function me(env, view) {
  const defaultFrom = (env.DEFAULT_FROM || `hello@${env.DOMAIN}`).toLowerCase();
  const { results } = await env.DB.prepare(
    `SELECT mailbox, COUNT(*) AS c FROM messages WHERE mailbox IS NOT NULL AND mailbox LIKE ?1
     GROUP BY mailbox ORDER BY c DESC LIMIT 10`
  )
    .bind(`%@${env.DOMAIN}`)
    .all();
  const identities = [...new Set([defaultFrom, ...results.map((r) => r.mailbox)])];
  return json({ displayName: senderName(env, view), domain: env.DOMAIN, defaultFrom, identities, account: publicUser(view) });
}

// The same action on several conversations (Mark All as Read, say)
async function threadBatch(env, { ids, ...body }) {
  if (!Array.isArray(ids) || !ids.length) throw new HttpError(400, "No conversations");
  if (ids.length > (body.action === "delete" ? 25 : 200)) throw new HttpError(400, "Too many conversations at once");
  const good = ids.map(String).filter((id) => /^[\w-]+$/.test(id));
  // (Mark All as Read: a statement per part, rather than one conversation at a time)
  if (body.action === "read") {
    await env.DB.batch(
      chunks(good, 90).map((part) =>
        env.DB.prepare(`UPDATE messages SET unread = 0 WHERE thread_id IN (${part.map((_, i) => `?${i + 1}`).join(",")})`).bind(...part)
      )
    );
    return json({ ok: true });
  }
  for (const id of good) await threadAction(env, id, body, deleteMessages);
  return json({ ok: true });
}

async function emptyTrash(env) {
  const { results } = await env.DB.prepare(`SELECT id FROM messages WHERE folder = 'trash'`).all();
  for (let i = 0; i < results.length; i += 100) await deleteMessages(env, results.slice(i, i + 100).map((r) => r.id));
  return json({ ok: true });
}

async function listMessages(env, url) {
  const folder = url.searchParams.get("folder") || "inbox";
  const q = (url.searchParams.get("q") || "").trim();
  const before = Number(url.searchParams.get("before")) || null;
  const limit = Math.max(1, Math.min(Math.floor(Number(url.searchParams.get("limit"))) || 50, 100));

  const where = [];
  const params = [];
  const bind = (v) => {
    params.push(v);
    return `?${params.length}`;
  };

  if (q) {
    // Search everything except trash, like iOS Mail.
    where.push(`folder != 'trash'`);
    const like = bind(`%${q.replace(/[%_]/g, "")}%`);
    where.push(
      `(subject LIKE ${like} OR snippet LIKE ${like} OR from_name LIKE ${like} OR from_email LIKE ${like} OR to_json LIKE ${like})`
    );
  } else if (folder === "flagged") {
    where.push(`starred = 1 AND folder != 'trash'`);
  } else {
    if (!FOLDERS.includes(folder)) throw new HttpError(400, "Unknown folder");
    where.push(`folder = ${bind(folder)}`);
  }
  if (url.searchParams.get("unread") === "1") where.push(`unread = 1`);
  if (before) where.push(`date < ${bind(before)}`);

  const { results } = await env.DB.prepare(
    `SELECT * FROM messages WHERE ${where.join(" AND ")} ORDER BY date DESC LIMIT ${bind(limit + 1)}`
  )
    .bind(...params)
    .all();
  const hasMore = results.length > limit;
  return json({ messages: results.slice(0, limit).map(rowToSummary), hasMore });
}

async function getMessage(env, id) {
  const row = await env.DB.prepare(`SELECT * FROM messages WHERE id = ?1`).bind(id).first();
  if (!row) throw new HttpError(404, "Message not found");
  const [bodyObj, atts] = await Promise.all([
    env.MAIL.get(`body/${id}.json`),
    env.DB.prepare(`SELECT * FROM attachments WHERE message_id = ?1`).bind(id).all(),
  ]);
  const body = bodyObj ? await bodyObj.json() : { text: "", html: "" };

  let html = body.html || "";
  const attachments = [];
  for (const a of atts.results) {
    const href = `/api/attachments/${a.id}`;
    if (a.content_id && html.includes(`cid:${a.content_id}`)) {
      html = html.split(`cid:${a.content_id}`).join(href);
      continue;
    }
    attachments.push({ id: a.id, filename: a.filename, type: a.type, size: a.size, url: href });
  }

  return json({
    ...rowToMessage(row),
    text: body.text || "",
    html,
    compose: body.compose || null,
    attachments,
  });
}

const PATCHABLE = { unread: "unread", starred: "starred", folder: "folder" };

function patchClause(env, patch) {
  const sets = [];
  const values = [];
  for (const [key, col] of Object.entries(PATCHABLE)) {
    if (!(key in patch)) continue;
    let v = patch[key];
    if (key === "folder") {
      if (!FOLDERS.includes(v)) throw new HttpError(400, "Unknown folder");
    } else v = v ? 1 : 0;
    values.push(v);
    sets.push(`${col} = ?${values.length}`);
  }
  if (!sets.length) throw new HttpError(400, "Nothing to update");
  return { sets, values };
}

async function updateMessage(env, id, patch) {
  const { sets, values } = patchClause(env, patch);
  await env.DB.prepare(`UPDATE messages SET ${sets.join(", ")} WHERE id = ?${values.length + 1}`)
    .bind(...values, id)
    .run();
  return json({ ok: true });
}

async function batchUpdate(env, { ids, delete: del, ...patch }) {
  if (!Array.isArray(ids) || !ids.length) throw new HttpError(400, "No messages");
  if (ids.length > 500) throw new HttpError(400, "Too many messages");
  if (del) return deleteMessages(env, ids);
  const { sets, values } = patchClause(env, patch);
  await env.DB.batch(
    chunks(ids.map(String), 80).map((part) =>
      env.DB.prepare(`UPDATE messages SET ${sets.join(", ")} WHERE id IN (${part.map((_, i) => `?${values.length + i + 1}`).join(",")})`).bind(
        ...values,
        ...part
      )
    )
  );
  return json({ ok: true });
}

const chunks = (a, n) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));

// (in parts: D1 takes at most 100 bound values a statement)
async function deleteMessages(env, ids) {
  for (const part of chunks(ids, 90)) await deleteSome(env, part);
  return json({ ok: true });
}

async function deleteSome(env, ids) {
  const placeholders = ids.map((_, i) => `?${i + 1}`).join(",");
  const { results: atts } = await env.DB.prepare(
    `SELECT id FROM attachments WHERE message_id IN (${placeholders})`
  )
    .bind(...ids)
    .all();
  await env.MAIL.delete([
    ...ids.flatMap((id) => [`body/${id}.json`, `raw/${id}.eml`]),
    ...atts.map((a) => `att/${a.id}`),
  ]);
  await env.DB.batch([
    env.DB.prepare(`DELETE FROM attachments WHERE message_id IN (${placeholders})`).bind(...ids),
    env.DB.prepare(`DELETE FROM messages WHERE id IN (${placeholders})`).bind(...ids),
  ]);
}

async function rawMessage(env, id) {
  const obj = await env.MAIL.get(`raw/${id}.eml`);
  if (!obj) throw new HttpError(404, "Original message not available");
  return new Response(obj.body, {
    headers: { "Content-Type": "message/rfc822", "Content-Disposition": `attachment; filename="${id}.eml"`, ...SAFE },
  });
}

async function attachment(env, id, url) {
  const row = await env.DB.prepare(`SELECT * FROM attachments WHERE id = ?1`).bind(id).first();
  const obj = row && (await env.MAIL.get(`att/${id}`));
  if (!obj) throw new HttpError(404, "Attachment not found");
  const name = (row.filename || "attachment").replace(/["\\\r\n]/g, "_");
  const download = url.searchParams.has("download");
  return new Response(obj.body, {
    headers: {
      "Content-Type": row.type || "application/octet-stream",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${name}"; filename*=UTF-8''${encodeURIComponent(row.filename || "attachment")}`,
      "Cache-Control": "private, max-age=86400",
      // Never let an attachment run script on our origin.
      "Content-Security-Policy": "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

async function contacts(env, url) {
  const q = (url.searchParams.get("q") || "").trim().replace(/[%_]/g, "");
  const { results } = await env.DB.prepare(
    `SELECT email, name FROM contacts WHERE email LIKE ?1 OR name LIKE ?1
     ORDER BY count DESC, last_used DESC LIMIT 8`
  )
    .bind(`%${q}%`)
    .all();
  return json({ contacts: results });
}

function normalizeRecipients(list) {
  return (Array.isArray(list) ? list : [])
    .map((r) => (typeof r === "string" ? { email: r, name: "" } : { email: r?.email || "", name: r?.name || "" }))
    .map((r) => ({ email: r.email.trim(), name: r.name.trim() }))
    .filter((r) => r.email);
}

function checkFrom(env, from) {
  const address = (from || env.DEFAULT_FROM || "").trim().toLowerCase();
  if (!EMAIL_RE.test(address) || !address.endsWith(`@${env.DOMAIN.toLowerCase()}`)) {
    throw new HttpError(400, `You can only send from an @${env.DOMAIN} address.`);
  }
  return address;
}

function base64ToBytes(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function send(env, ctx, body, view) {
  const size = (Array.isArray(body.attachments) ? body.attachments : []).reduce((n, a) => n + String(a?.content || "").length * 0.75, 0);
  if (size > 25 * 1024 * 1024) throw new HttpError(413, "Attachments can be 25 MB at most.");
  const name = senderName(env, view);
  const from = checkFrom(env, body.from);
  const to = normalizeRecipients(body.to);
  const cc = normalizeRecipients(body.cc);
  const bcc = normalizeRecipients(body.bcc);
  const all = [...to, ...cc, ...bcc];
  if (!all.length) throw new HttpError(400, "Add at least one recipient.");
  if (all.length > 50) throw new HttpError(400, "Too many recipients (50 max).");
  const bad = all.find((r) => !EMAIL_RE.test(r.email));
  if (bad) throw new HttpError(400, `“${bad.email}” isn't a valid email address.`);

  const subject = String(body.subject || "").slice(0, 998);
  const text = String(body.text || "");
  const html = body.html ? String(body.html) : undefined;
  const inReplyTo = cleanMessageId(body.inReplyTo);
  const references = String(body.references || "")
    .split(/\s+/)
    .map(cleanMessageId)
    .filter(Boolean);
  if (inReplyTo && !references.includes(inReplyTo)) references.push(inReplyTo);
  // (a long thread's chain is trimmed, as mail clients do: the first message and the most recent)
  if (references.length > 20) references.splice(1, references.length - 20);

  const attachments = (Array.isArray(body.attachments) ? body.attachments : []).map((a) => ({
    id: crypto.randomUUID(),
    filename: String(a.filename || "attachment"),
    type: String(a.type || "application/octet-stream"),
    bytes: base64ToBytes(String(a.content || "")),
  }));

  const toAddr = (r) => (r.name ? { email: r.email, name: r.name } : r.email);
  const headers = {};
  if (inReplyTo) headers["In-Reply-To"] = `<${inReplyTo}>`;
  if (references.length) headers["References"] = references.map((r) => `<${r}>`).join(" ");

  const message = {
    from: name ? { email: from, name } : from,
    subject,
    text,
    ...(html && { html }),
    ...(to.length && { to: to.map(toAddr) }),
    ...(cc.length && { cc: cc.map(toAddr) }),
    ...(bcc.length && { bcc: bcc.map(toAddr) }),
    ...(Object.keys(headers).length && { headers }),
    ...(attachments.length && {
      attachments: attachments.map((a) => ({
        disposition: "attachment",
        filename: a.filename,
        type: a.type,
        content: a.bytes,
      })),
    }),
  };

  let result;
  try {
    result = await env.EMAIL.send(message);
  } catch (err) {
    console.error("send failed", err.code, err.message);
    const hint =
      err.code === "E_SENDER_NOT_VERIFIED"
        ? `${env.DOMAIN} isn't verified for Email Sending yet.`
        : err.code === "E_RATE_LIMIT_EXCEEDED"
          ? "Sending limit reached. Try again later."
          : err.message;
    throw new HttpError(502, hint || "Couldn't send the message.");
  }

  // Sent: whatever happens to the copy kept here, the answer is that it went (so it's never sent twice).
  const id = crypto.randomUUID();
  try {
    await keepSent(env, ctx, { id, result, from, name, to, cc, bcc, all, subject, text, html, inReplyTo, references, attachments, draftId: body.draftId });
  } catch (err) {
    console.error("sent, but the copy wasn't kept", err);
  }
  return json({ ok: true, id });
}

async function keepSent(env, ctx, { id, result, from, name, to, cc, bcc, all, subject, text, html, inReplyTo, references, attachments, draftId }) {
  const messageId = cleanMessageId(result?.messageId) || `${id}@${env.DOMAIN}`;
  const threadId = (await findThread(env, inReplyTo, references.join(" "))) || id;

  await Promise.all([
    env.MAIL.put(`body/${id}.json`, JSON.stringify({ text, html: html || "" }), {
      httpMetadata: { contentType: "application/json" },
    }),
    ...attachments.map((a) => env.MAIL.put(`att/${a.id}`, a.bytes, { httpMetadata: { contentType: a.type } })),
  ]);

  const stmts = [
    env.DB.prepare(
      `INSERT INTO messages (id, folder, thread_id, message_id, in_reply_to, refs, mailbox,
        from_name, from_email, to_json, cc_json, bcc_json, subject, snippet, date, unread,
        has_attachments, size, category)
       VALUES (?1, 'sent', ?2, ?3, ?4, ?5, ?6, ?7, ?6, ?8, ?9, ?10, ?11, ?12, ?13, 0, ?14, ?15, 'people')`
    ).bind(
      id,
      threadId,
      messageId,
      inReplyTo || null,
      references.join(" ") || null,
      from,
      name,
      JSON.stringify(to),
      JSON.stringify(cc),
      JSON.stringify(bcc),
      subject,
      snippet(text, html),
      Date.now(),
      attachments.length ? 1 : 0,
      text.length + (html?.length || 0) + attachments.reduce((n, a) => n + a.bytes.byteLength, 0)
    ),
    ...attachments.map((a) =>
      env.DB.prepare(
        `INSERT INTO attachments (id, message_id, filename, type, size, disposition)
         VALUES (?1, ?2, ?3, ?4, ?5, 'attachment')`
      ).bind(a.id, id, a.filename, a.type, a.bytes.byteLength)
    ),
  ];
  // Replying in a conversation means it has been read.
  if (threadId !== id) stmts.push(env.DB.prepare(`UPDATE messages SET unread = 0 WHERE thread_id = ?1`).bind(threadId));
  await env.DB.batch(stmts);

  if (draftId) ctx.waitUntil(deleteDraft(env, String(draftId)).catch(() => {}));
  ctx.waitUntil(upsertContacts(env, all));
}

// (only ever a draft: never a message that came in or went out)
async function deleteDraft(env, id) {
  const row = await env.DB.prepare(`SELECT id FROM messages WHERE id = ?1 AND folder = 'drafts'`).bind(id).first();
  if (row) await deleteMessages(env, [row.id]);
}

// (a draft's attachments, kept in its stored copy: 25 MB at most, like sending)
function draftFiles(list) {
  const out = [];
  let total = 0;
  for (const a of Array.isArray(list) ? list.slice(0, 20) : []) {
    const content = String(a?.content || "");
    if (!/^[A-Za-z0-9+/=]*$/.test(content)) continue;
    total += content.length * 0.75;
    if (total > 25 * 1024 * 1024) throw new HttpError(413, "Attachments can be 25 MB at most.");
    out.push({ filename: String(a.filename || "attachment").slice(0, 200), type: String(a.type || "application/octet-stream").slice(0, 100), size: Number(a.size) || 0, content });
  }
  return out;
}

async function saveDraft(env, body, view) {
  let id = body.id && /^[\w-]+$/.test(body.id) ? body.id : crypto.randomUUID();
  // (a draft's id can't be used to write over anything else)
  const existing = await env.DB.prepare(`SELECT folder FROM messages WHERE id = ?1`).bind(id).first();
  if (existing && existing.folder !== "drafts") id = crypto.randomUUID();
  const compose = {
    from: String(body.from || ""),
    to: normalizeRecipients(body.to),
    cc: normalizeRecipients(body.cc),
    bcc: normalizeRecipients(body.bcc),
    subject: String(body.subject || ""),
    text: String(body.text || ""),
    inReplyTo: body.inReplyTo || null,
    references: body.references || null,
    quote: body.quote || null,
    attachments: draftFiles(body.attachments),
  };
  await env.MAIL.put(`body/${id}.json`, JSON.stringify({ text: compose.text, html: "", compose }), {
    httpMetadata: { contentType: "application/json" },
  });
  await env.DB.prepare(
    `INSERT INTO messages (id, folder, thread_id, mailbox, from_name, from_email, to_json, cc_json, bcc_json,
       subject, snippet, date)
     VALUES (?1, 'drafts', ?1, ?2, ?3, ?2, ?4, ?5, ?6, ?7, ?8, ?9)
     ON CONFLICT(id) DO UPDATE SET to_json = ?4, cc_json = ?5, bcc_json = ?6, subject = ?7, snippet = ?8,
       date = ?9, mailbox = ?2, from_email = ?2`
  )
    .bind(
      id,
      compose.from.toLowerCase(),
      senderName(env, view),
      JSON.stringify(compose.to),
      JSON.stringify(compose.cc),
      JSON.stringify(compose.bcc),
      compose.subject,
      snippet(compose.text),
      Date.now()
    )
    .run();
  return json({ ok: true, id });
}
