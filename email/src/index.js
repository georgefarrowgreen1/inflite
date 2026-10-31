import { accountView, accessOf, passOn, forgetCheck, accountCookie, quietNow } from "./auth.js";
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
import { receiveEmail, retryPending, snippet } from "./receive.js";
import { settings, updateSettings, listAddresses, createAddress, updateAddress, deleteAddress, addressOf, defaultAddress, localProblem } from "./addresses.js";
import { listThreads, getThread, threadAction, counts, wakeSnoozed, unsubInfo, readAll } from "./threads.js";
import { vapid, pushAll, pushEndpointOk, peopleUnread } from "./push.js";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(request);
    // (Mail's notifications, as the account's Notifications page shows them: asked from there, with the account's sign-in)
    const cors = url.pathname === "/api/notify" && request.headers.get("Origin") === env.ACCOUNT_ORIGIN
      ? { "Access-Control-Allow-Origin": env.ACCOUNT_ORIGIN, "Access-Control-Allow-Credentials": "true", Vary: "Origin" } : null;
    if (cors && request.method === "OPTIONS")
      return new Response(null, { status: 204, headers: { ...cors, "Access-Control-Allow-Methods": "GET, PATCH", "Access-Control-Allow-Headers": "Content-Type, X-Inflite", "Access-Control-Max-Age": "600" } });
    let res;
    try {
      res = await api(request, env, ctx, url, !!cors);
    } catch (err) {
      if (!err.status || err.status >= 500) console.error(err);
      // (the words of errors Mail raised itself; never a database's)
      const said = err.publicMessage || (err.status && err.status < 500 ? err.message : null);
      res = json({ error: said || "Something went wrong. Try again.", access: err.access }, err.status || 500);
    }
    if (cors) for (const [k, v] of Object.entries(cors)) res.headers.set(k, v);
    return res;
  },

  async email(message, env, ctx) {
    await receiveEmail(message, env, ctx);
  },


  // Every few minutes: conversations whose Later time has come go back in the stream, with a notice (none in the
  // account's Quiet Hours, as for new mail, receive.js: they're back, unread, when those are over)
  async scheduled(event, env, ctx) {
    try {
      await ensureSchema(env);
      const woken = await wakeSnoozed(env);
      const told = woken.length && !(await quietNow(env)) ? woken : [];
      const badge = told.length ? await peopleUnread(env) : 0;
      await Promise.allSettled(
        told.map((w) =>
          pushAll(env, { title: w.from || "Mail", body: `Back from Later: ${w.subject}`, tag: w.threadId, url: `/#thread=${w.threadId}`, badge })
        )
      );
    } catch (err) {
      console.error("scheduled: Later", err);
    }
    // mail that came while the database wasn't answering, read in now it is (receive.js)
    await retryPending(env, ctx).catch((err) => console.error("scheduled: pending", err));
    // once a day: what's been in the Trash 30 days goes for good, and people kept for addressing mail who've had
    // nothing to or from them in half a year, with no mail left of theirs
    await tidy(env).catch((err) => console.error("scheduled: tidy", err));
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

async function api(request, env, ctx, url, fromAccount = false) {
  const { pathname } = url;
  const method = request.method;

  // Mutating requests must carry a custom header, which browsers won't send
  // cross-site without a CORS preflight (CSRF protection).
  if (method !== "GET" && method !== "HEAD" && request.headers.get("X-Inflite") !== "1") {
    throw new HttpError(403, "Missing request header");
  }

  // Same-site pages elsewhere on inflite.ai also carry the account cookie, so the API answers only this app's own pages.
  const site = request.headers.get("Sec-Fetch-Site");
  // (the account's own page alone, for Mail's notifications: same-site, from its own origin, by name)
  if (site && site !== "same-origin" && site !== "none" && !(fromAccount && site === "same-site")) throw new HttpError(403, "That request didn’t come from Mail.");
  if (fromAccount && pathname !== "/api/notify") throw new HttpError(403, "That request didn’t come from Mail.");

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

  // Mail's notifications, for the account's Notifications page: how many devices it's on, and each address's on or off
  if (pathname === "/api/notify") {
    if (method === "PATCH") {
      const b = await request.json().catch(() => ({}));
      if (typeof b.notify !== "boolean") throw new HttpError(400, "Choose on or off.");
      await updateAddress(env, b.email, { notify: b.notify });
    } else if (method !== "GET") throw new HttpError(405, "Not allowed.");
    const [subs, list] = await Promise.all([env.DB.prepare(`SELECT COUNT(*) AS n FROM push_subs`).first(), listAddresses(env, { fallbackName: view.name || "" })]);
    return json({ on: subs?.n || 0, addresses: list.map((a) => ({ email: a.email, name: a.name || "", notify: a.notify !== false })) });
  }

  const res = await route(request, env, ctx, url, view);
  // (anything that changed the mailbox moves its version on)
  if (method !== "GET" && res.ok) ctx.waitUntil(bumpVersion(env).catch(() => {}));
  return res;
}

async function route(request, env, ctx, url, view) {
  const { pathname } = url;
  const method = request.method;
  let m;
  // (the mailbox's version, and the app's: an open Mail updates itself when a new one is deployed)
  if (pathname === "/api/version" && method === "GET") return json({ v: await mailVersion(env), build: buildOf(env), app: await appBuild(env, request) });
  if (pathname === "/api/me" && method === "GET") return me(env, view);
  // Settings: the addresses, what happens to mail to others, the signature
  if (pathname === "/api/settings") {
    if (method === "GET") return json(await settings(env, senderName(env, view)));
    if (method === "PATCH") {
      await updateSettings(env, await request.json());
      return json(await settings(env, senderName(env, view)));
    }
  }
  if (pathname === "/api/addresses/check" && method === "GET") {
    const local = (url.searchParams.get("local") || "").trim().toLowerCase();
    const problem = localProblem(local);
    const taken = !problem && !!(await addressOf(env, `${local}@${env.DOMAIN}`));
    return json({ ok: !problem && !taken, problem: problem || (taken ? "That’s already one of your addresses." : null) });
  }
  if (pathname === "/api/addresses" && method === "POST") return json(await createAddress(env, await request.json()));
  if ((m = pathname.match(/^\/api\/addresses\/([^/]+)$/))) {
    const email = decodeURIComponent(m[1]);
    if (method === "PATCH") return json(await updateAddress(env, email, await request.json()));
    if (method === "DELETE") {
      await deleteAddress(env, email);
      return json({ ok: true });
    }
  }
  if (pathname === "/api/photo" && method === "GET") return photo(env, request, url);
  if ((m = pathname.match(/^\/api\/unsubscribe\/([\w-]+)$/))) {
    if (method === "GET") {
      const info = await unsubInfo(env, m[1]);
      if (!info) throw new HttpError(404, "This sender doesn't say how to unsubscribe.");
      const how = info.oneClick && info.https ? "oneclick" : info.mailto ? "mail" : info.https ? "page" : null;
      // (their page, where that's the way: opened by the tap itself, as a page opened after waiting for Mail is blocked)
      return json({ sender: info.sender, opened: info.opened, of: info.of, how, to: info.mailto ? mailtoTo(info.mailto) : null, page: how === "page" ? info.https : null });
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
  if ((m = pathname.match(/^\/api\/attachments\/([\w-]+)$/)) && method === "GET") return attachment(env, m[1], url, request);
  if (pathname === "/api/contacts" && method === "GET") return contacts(env, url);
  // (which of the messages an app kept in its outbox went after all, by its names for them: their answers never got back)
  if (pathname === "/api/sends" && method === "GET") {
    const keys = (url.searchParams.get("keys") || "").split(",").filter((k) => /^[\w-]{8,64}$/.test(k)).slice(0, 50);
    if (!keys.length) return json({ sent: [] });
    const { results } = await env.DB.prepare(`SELECT key FROM sends WHERE id IS NOT NULL AND key IN (${keys.map((_, i) => `?${i + 1}`).join(",")})`)
      .bind(...keys)
      .all();
    return json({ sent: results.map((r) => r.key) });
  }
  if (pathname === "/api/send" && method === "POST") {
    if (Number(request.headers.get("Content-Length")) > 36 * 1024 * 1024) throw new HttpError(413, "That message is too big to send.");
    return send(env, ctx, await request.json(), view);
  }
  if (pathname === "/api/drafts" && method === "POST") return saveDraft(env, await request.json(), view);

  throw new HttpError(404, "Not found");
}

// Unsubscribe: by the sender's one-click address (RFC 8058) if it has one, else by the email it gives; failing both, the
// page it gives, for Mail to open. Then everything from it that's waiting goes to Done.
// (the address a sender's unsubscribe email goes to, shown before it's sent; its subject and body kept short and plain)
function mailtoTo(mailto) {
  try {
    const to = decodeURIComponent(new URL(mailto).pathname);
    return EMAIL_RE.test(to) ? to : null;
  } catch {
    return null;
  }
}
const oneLine = (v, n) => String(v || "").replace(/[\r\n]+/g, " ").trim().slice(0, n);
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
    const to = mailtoTo(info.mailto);
    if (to) {
      // (from the default address, and saying only "unsubscribe": the sender's header chooses where it goes, never what
      // it says, nor which of your addresses it's from, so an unsubscribe can't be made into a message from you)
      await env.EMAIL.send({ from: checkFrom(env, null), to, subject: "unsubscribe", text: "unsubscribe" });
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

// Which deploy of Mail this is: Cloudflare's version of the Worker (BUILD_ID stands in for it in local tests)
const buildOf = (env) => env.BUILD_ID || env.CF_VERSION_METADATA?.id || null;

// The build number in the Mail that's deployed (BUILD in app.js), read once per deployment, so a page running older
// code (an old copy kept by the phone, say) can tell it's behind
let appBuildCache = null;
async function appBuild(env, request) {
  const key = buildOf(env) || "dev";
  if (appBuildCache?.key === key) return appBuildCache.build;
  try {
    const r = await env.ASSETS.fetch(new Request(new URL("/app.js", request.url)));
    const m = r.ok && /const BUILD = "([\d.]+)"/.exec(await r.text());
    appBuildCache = { key, build: m ? m[1] : null };
    return appBuildCache.build;
  } catch {
    return null;
  }
}

const publicUser = (v) =>
  v?.signedIn
    ? { name: v.name, handle: v.handle, email: v.email, admin: !!v.admin, appearance: v.appearance || "auto", photoAt: v.photoAt || null }
    : null;

// Your account's photo, from the account's address with your sign-in (where its page has it: the account's address only
// answers /api/account/), kept for good by the browser under its ?v= (when it last changed)
async function photo(env, request, url) {
  const r = await fetch(`${env.ACCOUNT_ORIGIN}/api/account/me/photo?v=${encodeURIComponent(url.searchParams.get("v") || "")}`, {
    headers: { Cookie: accountCookie(request), Accept: "image/*" },
  });
  const type = r.headers.get("Content-Type") || "";
  if (!r.ok || !type.startsWith("image/")) throw new HttpError(404, "No photo.");
  return new Response(r.body, { headers: { "Content-Type": type, "Cache-Control": "private, max-age=31536000, immutable", ...SAFE } });
}

const senderName = (env, view) => env.DISPLAY_NAME || view?.name || "";

async function me(env, view) {
  const addresses = await listAddresses(env, { fallbackName: senderName(env, view) });
  const defaultFrom = addresses.find((a) => a.isDefault)?.email || (env.DEFAULT_FROM || `hello@${env.DOMAIN}`).toLowerCase();
  const identities = [...new Set([defaultFrom, ...addresses.map((a) => a.email)])];
  const signature = (await env.DB.prepare(`SELECT v FROM meta WHERE k = 'signature'`).first())?.v || "";
  return json({ displayName: senderName(env, view), domain: env.DOMAIN, defaultFrom, identities, addresses, signature, account: publicUser(view) });
}

// (the name a message from an address goes out under: the address's own, as Settings has it, else yours)
async function nameFor(env, view, from) {
  const a = await addressOf(env, from).catch(() => null);
  return a?.name || senderName(env, view);
}

// The same action on several conversations (Mark All as Read, say)
async function threadBatch(env, { ids, every, ...body }) {
  // (Mark All as Read on a whole list, every: what it is, as it's asked for; however much of it has been loaded)
  if (body.action === "read" && every && typeof every === "object") {
    await readAll(env, every);
    return json({ ok: true });
  }
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

const TRASH_DAYS = 30, CONTACT_DAYS = 180, CONTACTS_A_DAY = 90;
async function tidy(env, t = Date.now()) {
  const day = new Date(t).toISOString().slice(0, 10);
  if ((await env.DB.prepare(`SELECT v FROM meta WHERE k = 'tidy_day'`).first())?.v === day) return;
  await env.DB.prepare(`INSERT INTO meta (k, v) VALUES ('tidy_day', ?1) ON CONFLICT(k) DO UPDATE SET v = excluded.v`).bind(day).run();
  // (what's been sent, by its app's name for it, kept a week: long enough for any asking again)
  await env.DB.prepare(`DELETE FROM sends WHERE at < ?1`).bind(t - 7 * 864e5).run();
  // (a few hundred a day at most: any more go the next day)
  const { results } = await env.DB.prepare(`SELECT id FROM messages WHERE folder = 'trash' AND trashed_at < ?1 LIMIT 500`).bind(t - TRASH_DAYS * 864e5).all();
  for (let i = 0; i < results.length; i += 100) await deleteMessages(env, results.slice(i, i + 100).map((r) => r.id));
  // (people: ninety a day at most, in turn, from where the day before left off, rather than every one half a year quiet
  // checked against every message each day: each not found as a sender reads the whole mailbox for its name, and D1
  // does one thing at a time. As a sender, by index: from_email is kept in lower case, as contacts are)
  const stale = t - CONTACT_DAYS * 864e5;
  const after = (await env.DB.prepare(`SELECT v FROM meta WHERE k = 'tidy_contact'`).first())?.v || "";
  const { results: due } = await env.DB.prepare(`SELECT email FROM contacts WHERE email > ?1 AND coalesce(last_used, 0) < ?2 ORDER BY email LIMIT ${CONTACTS_A_DAY}`)
    .bind(after, stale)
    .all();
  if (due.length)
    await env.DB.prepare(
      `DELETE FROM contacts WHERE email IN (${due.map((_, i) => `?${i + 2}`).join(",")}) AND coalesce(last_used, 0) < ?1
         AND NOT EXISTS (SELECT 1 FROM messages WHERE from_email = contacts.email)
         AND NOT EXISTS (SELECT 1 FROM messages WHERE to_json LIKE '%"' || contacts.email || '"%' OR cc_json LIKE '%"' || contacts.email || '"%')`
    )
      .bind(stale, ...due.map((r) => r.email))
      .run();
  // (the last of them reached: from the start again tomorrow)
  const next = due.length < CONTACTS_A_DAY ? "" : due[due.length - 1].email;
  await env.DB.prepare(`INSERT INTO meta (k, v) VALUES ('tidy_contact', ?1) ON CONFLICT(k) DO UPDATE SET v = excluded.v`).bind(next).run();
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

async function attachment(env, id, url, request) {
  const row = await env.DB.prepare(`SELECT * FROM attachments WHERE id = ?1`).bind(id).first();
  // (a part asked for, as a video player does, and iPhone insists on before it plays one)
  const range = request?.headers.get("Range");
  const obj = row && (await env.MAIL.get(`att/${id}`, range ? { range: request.headers } : undefined));
  if (!obj) throw new HttpError(404, "Attachment not found");
  const name = (row.filename || "attachment").replace(/["\\\r\n]/g, "_");
  // (shown in place only if it's a picture, a sound, a film or a PDF; anything else, an HTML page say, is a download,
  // so it never opens as a page of Mail's own)
  const type = row.type || "application/octet-stream", viewable = /^(image\/(png|jpe?g|gif|webp|avif|heic|bmp)|audio\/[\w.+-]+|video\/[\w.+-]+|application\/pdf)$/i.test(type);
  const download = url.searchParams.has("download") || !viewable;
  const headers = {
    "Content-Type": type,
    "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${name}"; filename*=UTF-8''${encodeURIComponent(row.filename || "attachment")}`,
    "Cache-Control": "private, max-age=86400",
    "Accept-Ranges": "bytes",
    // Never let an attachment run script on our origin. (A PDF, which browsers refuse to show in a sandbox, is shown
    // by their own viewer, which runs nothing of ours; and only ever inside Mail.)
    "Content-Security-Policy": /^application\/pdf$/i.test(type)
      ? "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; frame-ancestors 'self'"
      : "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox",
    "X-Content-Type-Options": "nosniff",
  };
  const r = obj.range;
  if (range && r && obj.size) {
    const start = "suffix" in r ? Math.max(0, obj.size - r.suffix) : r.offset || 0;
    const len = "suffix" in r ? obj.size - start : r.length ?? obj.size - start;
    headers["Content-Range"] = `bytes ${start}-${start + len - 1}/${obj.size}`;
    headers["Content-Length"] = String(len);
    return new Response(obj.body, { status: 206, headers });
  }
  return new Response(obj.body, { headers });
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
  const from = checkFrom(env, body.from || (await defaultAddress(env)));
  const name = await nameFor(env, view, from);
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

  // Each message once, however often it's asked for (key: the app's own name for it, the same each time it asks): one
  // whose answer never got back to the phone (a slow upload given up on, the app put away) and asked for again is said
  // to have gone, not sent twice. One still going from the first time says so, to be asked again in a moment; one left
  // half done minutes ago is taken as not sent.
  const key = typeof body.key === "string" && /^[\w-]{8,64}$/.test(body.key) ? body.key : null;
  if (key) {
    const claim = await env.DB.prepare(`INSERT INTO sends (key, at) VALUES (?1, ?2) ON CONFLICT(key) DO NOTHING`).bind(key, Date.now()).run();
    if (!claim.meta?.changes) {
      const was = await env.DB.prepare(`SELECT id, at FROM sends WHERE key = ?1`).bind(key).first();
      if (was?.id) return json({ ok: true, id: was.id });
      if (was && Date.now() - was.at < 2 * 60e3) throw new HttpError(503, "That message is still sending. Try again in a moment.");
      await env.DB.prepare(`UPDATE sends SET at = ?2 WHERE key = ?1`).bind(key, Date.now()).run();
    }
  }

  // (sending, and what's kept of it here, carried through even if the phone stops waiting for the answer)
  const going = (async () => {
    let result;
    try {
      result = await env.EMAIL.send(message);
    } catch (err) {
      console.error("send failed", err.code, err.message);
      if (key) await env.DB.prepare(`DELETE FROM sends WHERE key = ?1`).bind(key).run().catch(() => {});
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
    if (key) await env.DB.prepare(`UPDATE sends SET id = ?2 WHERE key = ?1`).bind(key, id).run().catch((err) => console.error("sent, but not noted as sent", err));
    try {
      await keepSent(env, ctx, { id, result, from, name, to, cc, bcc, all, subject, text, html, inReplyTo, references, attachments, draftId: body.draftId });
    } catch (err) {
      console.error("sent, but the copy wasn't kept", err);
    }
    return id;
  })();
  ctx.waitUntil(going.catch(() => {}));
  return json({ ok: true, id: await going });
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
