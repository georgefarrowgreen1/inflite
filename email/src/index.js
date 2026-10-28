import { accountView, accessOf, passOn, forgetCheck } from "./auth.js";
import {
  ensureSchema,
  FOLDERS,
  rowToSummary,
  rowToMessage,
  upsertContacts,
  findThread,
  cleanMessageId,
} from "./db.js";
import { receiveEmail, snippet } from "./receive.js";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(request);
    try {
      return await api(request, env, ctx, url);
    } catch (err) {
      if (!err.status || err.status >= 500) console.error(err);
      return json({ error: err.publicMessage || err.message || "Something went wrong", access: err.access }, err.status || 500);
    }
  },

  async email(message, env, ctx) {
    await receiveEmail(message, env, ctx);
  },
};

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
    this.publicMessage = message;
  }
}

const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...headers },
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

  let m;
  if (pathname === "/api/me" && method === "GET") return me(env, view);
  if (pathname === "/api/counts" && method === "GET") return counts(env);
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
  if (pathname === "/api/send" && method === "POST") return send(env, ctx, await request.json(), view);
  if (pathname === "/api/drafts" && method === "POST") return saveDraft(env, await request.json(), view);

  throw new HttpError(404, "Not found");
}

const publicUser = (v) =>
  v?.signedIn ? { name: v.name, handle: v.handle, email: v.email, admin: !!v.admin, appearance: v.appearance || "auto" } : null;

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

async function counts(env) {
  const { results } = await env.DB.prepare(
    `SELECT folder, COUNT(*) AS total, SUM(unread) AS unread FROM messages GROUP BY folder`
  ).all();
  const flagged = await env.DB.prepare(
    `SELECT COUNT(*) AS total FROM messages WHERE starred = 1 AND folder != 'trash'`
  ).first();
  const out = Object.fromEntries(FOLDERS.map((f) => [f, { total: 0, unread: 0 }]));
  for (const r of results) out[r.folder] = { total: r.total, unread: r.unread || 0 };
  out.flagged = { total: flagged?.total || 0, unread: 0 };
  return json(out);
}

async function listMessages(env, url) {
  const folder = url.searchParams.get("folder") || "inbox";
  const q = (url.searchParams.get("q") || "").trim();
  const before = Number(url.searchParams.get("before")) || null;
  const limit = Math.min(Number(url.searchParams.get("limit")) || 50, 100);

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

  // The rest of its conversation (not drafts or trash), for the reader to show under it.
  const { results: thread } = row.thread_id
    ? await env.DB.prepare(
        `SELECT * FROM messages WHERE thread_id = ?1 AND id != ?2 AND folder NOT IN ('trash', 'drafts')
         ORDER BY date DESC LIMIT 20`
      )
        .bind(row.thread_id, id)
        .all()
    : { results: [] };

  return json({
    ...rowToMessage(row),
    thread: thread.map(rowToSummary),
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
  const placeholders = ids.map((_, i) => `?${values.length + i + 1}`).join(",");
  await env.DB.prepare(`UPDATE messages SET ${sets.join(", ")} WHERE id IN (${placeholders})`)
    .bind(...values, ...ids)
    .run();
  return json({ ok: true });
}

async function deleteMessages(env, ids) {
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
  return json({ ok: true });
}

async function rawMessage(env, id) {
  const obj = await env.MAIL.get(`raw/${id}.eml`);
  if (!obj) throw new HttpError(404, "Original message not available");
  return new Response(obj.body, {
    headers: { "Content-Type": "message/rfc822", "Content-Disposition": `attachment; filename="${id}.eml"` },
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

  const id = crypto.randomUUID();
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
        has_attachments, size)
       VALUES (?1, 'sent', ?2, ?3, ?4, ?5, ?6, ?7, ?6, ?8, ?9, ?10, ?11, ?12, ?13, 0, ?14, ?15)`
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
  // Replying to a message means it has been read.
  if (inReplyTo) stmts.push(env.DB.prepare(`UPDATE messages SET unread = 0 WHERE message_id = ?1`).bind(inReplyTo));
  await env.DB.batch(stmts);

  if (body.draftId) ctx.waitUntil(deleteMessages(env, [String(body.draftId)]).catch(() => {}));
  ctx.waitUntil(upsertContacts(env, all));

  return json({ ok: true, id });
}

async function saveDraft(env, body, view) {
  const id = body.id && /^[\w-]+$/.test(body.id) ? body.id : crypto.randomUUID();
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
