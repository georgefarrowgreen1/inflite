import { assetBuild } from "../../shared/asset-build.js";
import { bodyUpTo } from "../../shared/bounded-body.js";
import { sameOriginPost } from "../../shared/browser-origin.js";
import { dueFollowups, validDue } from "./followups.js";
import { peopleCards } from './people-cards.js';
import { exportAttachment, attachmentDisposition } from "./attachment-export.js";
import { sharedNotFound } from "../../shared/not-found.js";
import { accountView, accessOf, passOn, accountCookie, quietNow } from "./auth.js";
import {
  bumpVersion,
  mailVersion,
  ensureSchema,
  FOLDERS,
  rowToBrief,
  rowToMessage,
  upsertContacts,
  findThread,
  cleanMessageId,
} from "./db.js";
import { receiveEmail, retryPending, snippet } from "./receive.js";
import { settings, updateSettings, listAddresses, createAddress, updateAddress, deleteAddress, addressOf, defaultAddress, localProblem } from "./addresses.js";
import { listThreads, getThread, getThreadPage, threadAction, counts, wakeSnoozed, unsubInfo, readAll } from "./threads.js";
import { vapid, pushMailNotice, getPushNotice, PUSH_NOTICE_ID, pushEndpointOk, peopleUnread, noticeInflite } from "./push.js";
import { listedOrigins, hubOf, hubHeaders, preflight, hubRefusal, hubNavigation, RASTER } from "./hubgate.js";
import { cleanQuote, personalMessage, quoteFrom } from "./quote.js";
import { keyOk, card, notice, searchParams } from "./connect.js";
import { body } from "./body.js";
import { appFetch } from "./apps.js";
import { readBack, setSpot, spotState, threadSpots, hideSpot, wrongSpot, threadOfSpot, ID_RE as SPOT_ID } from "./spot.js";

const worker = {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    // (the body shell for InFlite's page, One roof stage 4: body.js answers every /body path, 404 while no hub is on)
    if (url.pathname === "/body" || url.pathname.startsWith("/body/")) return body(request, env);
    // (Mail's version as deployed, for anyone: status.inflite.ai's checks, as Today's /version; nothing of the mailbox's)
    if (url.pathname === "/version" && request.method === "GET") return json({ app: "mail", build: await appBuild(env, request), min: null }, 200, { "Cache-Control": "no-store" });
    // Existing embedded/body surfaces remain isolated at Mail's origin. Only a
    // person opening the standalone document moves to the unified app.
    const destination = request.headers.get("Sec-Fetch-Dest");
    if (url.hostname === "email.inflite.ai" && PAGE.has(url.pathname) && ["GET", "HEAD"].includes(request.method)
        && (destination ? destination === "document" : /text\/html/i.test(request.headers.get("Accept") || "")))
      return new Response(null, { status: 308, headers: { Location: "https://inflite.ai/mail/standalone/" + url.search, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
    if (PAGE.has(url.pathname)) return page(request, env);
    // (the module InFlite's page runs Mail as, under the roof: its files, passed through at inflite.ai/mail/roof/)
    if (url.pathname.startsWith("/roof/")) return roofFile(request, env, url);
    // (Mail's page's later parts, each loaded the first time it's needed: never one for another Mail than the page's)
    if (url.pathname.startsWith("/parts/")) return partFile(request, env, url);
    if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(request);
    // (a bug report, from the window the shared menu shows when something breaks in Mail: passed on to the account's
    // address, where every app's are kept, the georgefarrowgreen repo's functions/_bugs.js; from Mail's own pages only)
    if (url.pathname === "/api/bugs") return bugReport(request, env);
    if (url.pathname === "/api/vitals") return vitals(request, env, ctx);
    // (status.inflite.ai's banner for Mail, as the shared menu asks for it: the account's address answers it)
    if (url.pathname === "/api/status-banner" && request.method === "GET") {
      const res = await appFetch(env, `${env.ACCOUNT_ORIGIN}/api/status-banner?app=mail`, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(5000) }).catch(() => null);
      return res?.ok ? new Response(res.body, { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } }) : json({ banner: null }, 200, { "Cache-Control": "no-store" });
    }
    // (InFlite's page, at a hub whose switch is on: hubgate.js)
    const hub = hubOf(request, env);
    if (hub && request.method === "OPTIONS") return preflight(hub);
    // (Mail's notifications, as the account's Notifications page shows them: asked from there, with the account's sign-in)
    const cors = url.pathname === "/api/notify" && request.headers.get("Origin") === env.ACCOUNT_ORIGIN
      ? { "Access-Control-Allow-Origin": env.ACCOUNT_ORIGIN, "Access-Control-Allow-Credentials": "true", Vary: "Origin" } : null;
    if (cors && request.method === "OPTIONS")
      return new Response(null, { status: 204, headers: { ...cors, "Access-Control-Allow-Methods": "GET, PATCH", "Access-Control-Allow-Headers": "Content-Type, X-Inflite", "Access-Control-Max-Age": "600" } });
    let res;
    try {
      res = await api(request, env, ctx, url, !!cors, hub);
    } catch (err) {
      if (!err?.status || err.status >= 500) console.error("mail request failed");
      // (the words of errors Mail raised itself; never a database's)
      const said = err?.publicMessage || (err?.status && err.status < 500 ? err.message : null);
      res = json({ error: said || "Something went wrong. Try again.", access: err?.access }, err?.status || 500);
    }
    if (cors) for (const [k, v] of Object.entries(cors)) res.headers.set(k, v);
    // (Vary added to, never put over what a route said)
    if (hub) for (const [k, v] of Object.entries(hubHeaders(hub))) k.toLowerCase() === "vary" ? varyOn(res, v) : res.headers.set(k, v);
    // (a file's answer differs by who asks: a hub may read only pictures, so no cache gives one asker's answer to another)
    if (url.pathname.startsWith("/api/attachments/")) varyOn(res, "Origin");
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
      // (through InFlite, when George has chosen that: Mail's own only where the account says it isn't telling anyone)
      await Promise.allSettled(
        told.map(async (w) =>
          (await noticeInflite(env, { kind: "later", threadId: w.threadId })) &&
          pushMailNotice(env, { kind: "later", threadId: w.threadId })
        )
      );
    } catch {
      console.error("scheduled: Later");
    }
    try {
      // An open People inbox polls the mailbox version. Wake it when a
      // reminder becomes due, including when no messages arrived that minute.
      if ((await dueFollowups(env, true)).length) await bumpVersion(env);
    } catch { console.error("scheduled: mail follow-ups"); }
    // mail that came while the database wasn't answering, read in now it is (receive.js)
    await retryPending(env, ctx).catch(() => console.error("scheduled: pending"));
    // the last 60 days read back, a few at a time, once one of Spot in Your Mail's switches is turned on (spot.js)
    await readBack(env, { budgetMs: 15000 }).catch(() => console.error("scheduled: bookings"));
    // once a day: what's been in the Trash 30 days goes for good, and people kept for addressing mail who've had
    // nothing to or from them in half a year, with no mail left of theirs
    await tidy(env).catch(() => console.error("scheduled: tidy"));
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

// Mail's page (/, and /index.html), the one Mail's ever opened at, answered here rather than straight from the files
// (wrangler.jsonc's run_worker_first), so it can say who may frame it: InFlite's window (HUB_ORIGIN, whose /mail/ page
// frames Mail, today/src/mailhost.js in this repo's root Worker: the hub's address, or more than one, a space between
// each, as the site's and its staging hub's) and no one else. Mail's own policy (public/_headers, for every other file)
// with frame-ancestors those addresses in place of 'none': put in place of the one the files carry, never beside it, as
// two policies are both applied and the stricter 'none' would still refuse the frame. With no hub address, or anything
// in it that isn't an address, 'none', as before. The rest of _headers' rules for the page set here too, so the page is
// the same whether or not the files' own headers came with it.
const PAGE = new Set(["/", "/index.html"]);
const MAIL_CSP =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https:; img-src 'self' data: blob: https: http:; font-src 'self' data: https:; media-src 'self' https:; connect-src 'self'; worker-src 'self'; frame-src 'self' about: blob:; object-src 'none'; base-uri 'self'; form-action 'self'";
// (every hub listed, switched on or not: the framed page of milestone 1 is how Mail opens at a hub whose switch is off)
function pagePolicy(env) {
  const hubs = listedOrigins(env);
  return `${MAIL_CSP}; frame-ancestors ${hubs.length ? hubs.join(" ") : "'none'"}`;
}
const PAGE_HEADERS = {
  "Cache-Control": "no-cache",
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
};
async function page(request, env) {
  const res = await env.ASSETS.fetch(request);
  const out = new Response(res.body, res);
  for (const [k, v] of Object.entries(PAGE_HEADERS)) out.headers.set(k, v);
  out.headers.set("Content-Security-Policy", pagePolicy(env));
  out.headers.delete("X-Frame-Options");
  return out;
}

const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...SAFE, ...headers },
  });

const EMAIL_RE = /^[^\s@<>()",;]+@[^\s@<>()",;]+\.[^\s@<>()",;]+$/;
// (an attachment's id, as a forwarded file ({ ref }) names it)
const REF_RE = /^[\w-]{1,64}$/;
// (a Vary added to an answer's, never put over it)
function varyOn(res, name) {
  const v = res.headers.get("Vary") || "";
  if (!new RegExp(`(^|,)\\s*${name}\\s*(,|$)`, "i").test(v)) res.headers.set("Vary", v ? `${v}, ${name}` : name);
}

// (the asks by POST that change nothing: the mailbox's version stays as it is)
const READ_POSTS = new Set(["/api/threads/search", "/api/contacts/find"]);

async function api(request, env, ctx, url, fromAccount = false, hub = null) {
  const { pathname } = url;
  const method = request.method;

  // (what InFlite's page may never ask for: hubgate.js, spec §3.5)
  if (hub) {
    const why = hubRefusal(request, url);
    if (why) throw new HttpError(403, why);
  }

  // Today's card, for the account's server, by the key it shares with Mail: never a cookie, before anyone's sign-in
  if (pathname === "/api/connector/card" && method === "GET") {
    if (!(await keyOk(request, env))) throw new HttpError(401, "Not allowed.");
    await ensureSchema(env);
    return json(await card(env));
  }
  // Today's Hide on a booking, a parcel or a bill from Mail (Mail on Your Day), and its Put Back, by the same key: { id }
  // → 204, or 404 for one Mail hasn't got. Put back, that sender's mail of that kind is read again (as the strip's)
  if ((pathname === "/api/connector/hide" || pathname === "/api/connector/unhide") && method === "POST") {
    if (!(await keyOk(request, env))) throw new HttpError(401, "Not allowed.");
    const b = await jsonBody(request, 64 * 1024, null);
    if (typeof b?.id !== "string" || !SPOT_ID.test(b.id)) throw new HttpError(400, "Which one?");
    await ensureSchema(env);
    if (!(await hideSpot(env, b.id, pathname === "/api/connector/hide"))) throw new HttpError(404, "No such one.");
    return new Response(null, { status: 204, headers: { "Cache-Control": "no-store", ...SAFE } });
  }

  // Mutating requests must carry a custom header, which browsers won't send
  // cross-site without a CORS preflight (CSRF protection).
  if (method !== "GET" && method !== "HEAD" && request.headers.get("X-Inflite") !== "1") {
    throw new HttpError(403, "Missing request header");
  }
  // The custom header and CORS are the first boundary; check the sender too.
  // Service-to-service routes above authenticate with their own shared key.
  if (method !== "GET" && method !== "HEAD") {
    const origin = request.headers.get("Origin");
    if (origin !== url.origin && !(hub && origin === hub) && !(fromAccount && origin === env.ACCOUNT_ORIGIN)) throw new HttpError(403, "That request didn’t come from Mail.");
  }

  // Same-site pages elsewhere on inflite.ai also carry the account cookie, so the API answers only this app's own pages.
  const site = request.headers.get("Sec-Fetch-Site");
  // (the account's own page alone, for Mail's notifications: same-site, from its own origin, by name)
  // (and InFlite's page, at a hub whose switch is on, by CORS; or a tap there that opens a file or an original at Mail's
  // own address, while one is: hubgate.js)
  const nav = !hub && site === "same-site" && hubNavigation(request, url, env);
  if (site && site !== "same-origin" && site !== "none" && !(fromAccount && site === "same-site") && !(hub && site === "same-site") && !nav)
    throw new HttpError(403, "That request didn’t come from Mail.");
  if (fromAccount && pathname !== "/api/notify") throw new HttpError(403, "That request didn’t come from Mail.");

  if (pathname === "/api/session" && method === "GET") {
    const view = await accountView(env, request);
    return json({ access: accessOf(view), accountOrigin: env.ACCOUNT_ORIGIN, user: publicUser(view) });
  }

  // Back from the account's page: the code it handed back, swapped there for the site's sign-in.
  if (pathname === "/api/auth/handback" && method === "POST") {
    const { code, verifier } = await jsonBody(request);
    const r = await passOn(env, request, "handback", { code, verifier });
    if (r.status !== 200) throw new HttpError(r.status === 403 ? 403 : 400, r.data.error || "That sign-in didn’t work. Try again.");
    const res = json({ access: accessOf(r.data), accountOrigin: env.ACCOUNT_ORIGIN, user: publicUser(r.data) });
    for (const c of r.setCookies) res.headers.append("Set-Cookie", c);
    return res;
  }

  // Signing out of Mail signs out of the account everywhere it's shared, as in the other inflite apps.
  if (pathname === "/api/logout" && method === "POST") {
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
  if (method === 'POST' && ['/api/people-cards/list', '/api/people-cards/save'].includes(pathname)) {
    const input = await jsonBody(request, 8192);
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new HttpError(400, 'Choose a contact.');
    return json(await peopleCards(request, env, pathname.split('/').pop(), input));
  }
  await ensureSchema(env);

  // Mail's notifications, for the account's Notifications page: how many devices it's on, and each address's on or off
  if (pathname === "/api/notify") {
    if (method === "PATCH") {
      const b = await jsonBody(request, 64 * 1024, {});
      if (typeof b.notify !== "boolean") throw new HttpError(400, "Choose on or off.");
      await updateAddress(env, b.email, { notify: b.notify });
    } else if (method !== "GET") throw new HttpError(405, "Not allowed.");
    const [subs, list] = await Promise.all([env.DB.prepare(`SELECT COUNT(*) AS n FROM push_subs`).first(), listAddresses(env, { fallbackName: view.name || "" })]);
    return json({ on: subs?.n || 0, addresses: list.map((a) => ({ email: a.email, name: a.name || "", notify: a.notify !== false })) });
  }

  const res = await route(request, env, ctx, url, view, hub);
  // (anything that changed the mailbox moves its version on)
  if (method !== "GET" && res.ok && !READ_POSTS.has(pathname) && !/^\/api\/attachments\/[\w-]+\/export$/.test(pathname)) ctx.waitUntil(bumpVersion(env).catch(() => {}));
  return res;
}

async function route(request, env, ctx, url, view, hub = null) {
  const { pathname } = url;
  const method = request.method;
  let m;
  // (the mailbox's version, and the app's: an open Mail updates itself when a new one is deployed)
  if (pathname === "/api/version" && method === "GET") return json({ v: await mailVersion(env), build: buildOf(env), app: await appBuild(env, request) });
  if (pathname === "/api/me" && method === "GET") return me(env, view);
  // Settings: the addresses, what happens to mail to others, the signature
  // (and Spot in Your Mail: { spot: { trips, parcels, bills, tz } }, Mail on Your Day, spot.js)
  if (pathname === "/api/settings") {
    const all = async () => ({ ...(await settings(env, senderName(env, view))), spot: await spotState(env) });
    if (method === "GET") return json(await all());
    if (method === "PATCH") {
      const b = await jsonBody(request);
      if (b?.spot !== undefined) await setSpot(env, ctx, b.spot && typeof b.spot === "object" ? b.spot : {});
      await updateSettings(env, b);
      return json(await all());
    }
  }
  if (pathname === "/api/addresses/check" && method === "GET") {
    const local = (url.searchParams.get("local") || "").trim().toLowerCase();
    const problem = localProblem(local);
    const taken = !problem && !!(await addressOf(env, `${local}@${env.DOMAIN}`));
    return json({ ok: !problem && !taken, problem: problem || (taken ? "That’s already one of your addresses." : null) });
  }
  if (pathname === "/api/addresses" && method === "POST") return json(await createAddress(env, await jsonBody(request)));
  if ((m = pathname.match(/^\/api\/addresses\/([^/]+)$/))) {
    const email = decodeURIComponent(m[1]);
    if (method === "PATCH") {
      const b = await jsonBody(request);
      // (the address mail goes from unless chosen: at Mail's own address, S4-D11)
      if (hub && b?.isDefault) throw new HttpError(403, "Choose the default address in Mail Settings at Mail’s own address.");
      return json(await updateAddress(env, email, b));
    }
    if (method === "DELETE") {
      await deleteAddress(env, email);
      return json({ ok: true });
    }
  }
  if (pathname === "/api/photo" && method === "GET") return photo(env, request, url);
  if ((m = pathname.match(/^\/api\/unsubscribe\/([\w-]+)$/))) {
    if (method === "GET" || method === "POST") return unsubscribe(env, m[1], method);
  }
  if (pathname === "/api/counts" && method === "GET") return json(await counts(env));
  if (pathname === "/api/threads" && method === "GET") return json(await listThreads(env, url));
  if (pathname === "/api/threads/batch" && method === "POST") return threadBatch(env, await jsonBody(request));
  // (a search asked in the request's body, as InFlite's page asks: the same as /api/threads?q=)
  if (pathname === "/api/threads/search" && method === "POST") {
    const sp = searchParams(await jsonBody(request, 64 * 1024, null));
    if (!sp) throw new HttpError(400, "That search is too long.");
    return json(await listThreads(env, new URL(`https://mail/api/threads?${sp}`)));
  }
  if ((m = pathname.match(/^\/api\/threads\/([\w-]+)$/))) {
    if (method === "GET") {
      if (url.searchParams.has("after")) {
        const page = await getThreadPage(env, m[1], url.searchParams.get("after"));
        if (!page) throw new HttpError(400, "Refresh the conversation.");
        return json(page);
      }
      const [t, spots] = await Promise.all([
        getThread(env, m[1], { paged: url.searchParams.get("paged") === "1" }),
        threadSpots(env, m[1]).catch(() => (console.error("mail spots failed"), null)),
      ]);
      if (!t) throw new HttpError(404, "Conversation not found");
      // (the bookings, parcels and bills spotted in it, for the strip at its top, while their switches are on)
      return json(spots?.length ? { ...t, spots } : t);
    }
    if (method === "POST") {
      await threadAction(env, m[1], await jsonBody(request), deleteMessages);
      return json({ ok: true });
    }
  }
  // (the strip's Remove, Put It Back and Wrong, for a booking, a parcel or a bill: { hidden } or { wrong: true })
  if ((m = pathname.match(/^\/api\/spots\/([A-Za-z0-9_~-]{1,64})$/)) && method === "POST") {
    const b = await jsonBody(request, 64 * 1024, {});
    const done = b?.wrong === true ? await wrongSpot(env, m[1]) : typeof b?.hidden === "boolean" ? await hideSpot(env, m[1], b.hidden) : null;
    if (done === null) throw new HttpError(400, "Remove, put back, or wrong?");
    if (!done) throw new HttpError(404, "That one has gone.");
    return json({ ok: true, spots: await threadSpots(env, await threadOfSpot(env, m[1])) });
  }
  if (pathname === "/api/trash/empty" && method === "POST") return emptyTrash(env);
  if (method === "GET" && (m = pathname.match(/^\/api\/notice\/([\w-]{1,64})$/))) {
    const words = await notice(env, m[1]);
    if (!words) throw new HttpError(404, "No notice.");
    return json(words);
  }
  if (method === "GET" && !hub && (m = pathname.match(/^\/api\/push\/notice\/([^/]+)$/)) && PUSH_NOTICE_ID.test(m[1])) {
    const entry = await getPushNotice(env, m[1]);
    const words = entry && await notice(env, entry.thread_id, entry.kind);
    if (!words) throw new HttpError(404, "No notice.");
    return json({ ...words, thread: entry.thread_id, badge: await peopleUnread(env) });
  }
  if (pathname === "/api/push/key" && method === "GET") return json({ key: (await vapid(env)).pub });
  if (pathname === "/api/push/subscribe" && method === "POST") return pushSubscribe(env, await jsonBody(request));
  if (pathname === "/api/push/unsubscribe" && method === "POST") {
    const { endpoint } = await jsonBody(request);
    await env.DB.prepare(`DELETE FROM push_subs WHERE endpoint = ?1`).bind(String(endpoint || "")).run();
    return json({ ok: true });
  }
  if (pathname === "/api/messages" && method === "GET") return listMessages(env, url);
  if (pathname === "/api/messages/batch" && method === "POST") return batchUpdate(env, await jsonBody(request));
  // (a message without its body: who, when, about what, its files; for InFlite's reader, whose bodies are Mail's frame)
  if ((m = pathname.match(/^\/api\/messages\/([\w-]+)\/meta$/)) && method === "GET") return messageMeta(env, m[1]);
  // (a draft's fields, without the old quoted text: drafts only)
  if ((m = pathname.match(/^\/api\/drafts\/([\w-]+)$/)) && method === "GET") return getDraft(env, m[1], view);
  if ((m = pathname.match(/^\/api\/messages\/([\w-]+)$/))) {
    if (method === "GET") return getMessage(env, m[1]);
    if (method === "PATCH") return updateMessage(env, m[1], await jsonBody(request));
    if (method === "DELETE") return deleteMessages(env, [m[1]]);
  }
  if ((m = pathname.match(/^\/api\/messages\/([\w-]+)\/raw$/)) && method === "GET") return rawMessage(env, m[1]);
  if ((m = pathname.match(/^\/api\/attachments\/([\w-]+)\/export$/)) && method === "POST") return exportAttachment(env, m[1]);
  if ((m = pathname.match(/^\/api\/attachments\/([\w-]+)$/)) && method === "GET") return attachment(env, m[1], url, request, hub);
  if (pathname === "/api/contacts" && method === "GET") return contacts(env, url);
  if (pathname === "/api/contacts/find" && method === "POST") {
    const sp = searchParams(await jsonBody(request, 64 * 1024, null));
    if (!sp) throw new HttpError(400, "That search is too long.");
    return contacts(env, new URL(`https://mail/api/contacts?${sp}`));
  }
  // (which of the messages an app kept in its outbox went after all, by its names for them: their answers never got back)
  if (pathname === "/api/sends" && method === "GET") {
    const keys = (url.searchParams.get("keys") || "").split(",").filter((k) => /^[\w-]{8,64}$/.test(k)).slice(0, 50);
    if (!keys.length) return json({ sent: [] });
    const { results } = await env.DB.prepare(`SELECT key FROM sends WHERE id IS NOT NULL AND (owner IS NULL OR owner = ?1) AND key IN (${keys.map((_, i) => `?${i + 2}`).join(",")})`)
      .bind(view.id || null, ...keys)
      .all();
    return json({ sent: results.map((r) => r.key) });
  }
  if (method === "POST" && (pathname === "/api/drafts" || pathname === "/api/send")) {
    const message = await jsonBody(request, 36 * 1024 * 1024);
    if (hub && !message?.accountOwner) throw new HttpError(409, "Refresh InFlite to save or send mail.");
    if (message && Object.hasOwn(message, "accountOwner") && (!view.id || message.accountOwner !== view.id)) {
      const error = new HttpError(401, "This draft belongs to another account.");
      error.access = "signin";
      throw error;
    }
    return pathname === "/api/drafts" ? saveDraft(env, ctx, message, view) : send(env, ctx, message, view);
  }

  throw new HttpError(404, "Not found");
}

function mailtoTo(mailto) {
  try {
    const address = new URL(mailto);
    if (address.protocol !== "mailto:") return null;
    const to = decodeURIComponent(address.pathname);
    return to.length <= 254 && !/[\x00-\x1f\x7f]/.test(to) && EMAIL_RE.test(to) ? to : null;
  } catch {
    return null;
  }
}
function unsubscribePage(value) {
  if (typeof value !== "string" || /[\u0000-\u001f\u007f]/.test(value)) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.port && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
}
async function unsubscribe(env, threadId, method) {
  const info = await unsubInfo(env, threadId);
  if (!info) throw new HttpError(404, "This sender doesn't say how to unsubscribe.");
  const page = unsubscribePage(info.https), to = mailtoTo(info.mailto);
  const how = info.oneClick && page ? "page" : to ? "mail" : page ? "page" : null;
  if (!how) throw new HttpError(404, "This sender doesn't say how to unsubscribe.");
  if (method === "GET") {
    return json({ sender: info.sender, opened: info.opened, of: info.of, how, to: how === "mail" ? to : null, page: how === "page" ? page : null });
  }
  // Sender-controlled URLs are offered as browser links. Only a confirmed
  // email unsubscribe sends a request and moves the sender's messages to Done.
  if (how === "page") return json({ ok: false, open: page });
  await env.EMAIL.send({ from: checkFrom(env, null), to, subject: "unsubscribe", text: "unsubscribe" });
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
const appBuild = assetBuild("/app.js");

// The module InFlite's page runs Mail as (email/public/roof/), passed through by InFlite's Worker at /mail/roof/<file>:
// a script or a style that's there, as it is, asked again each time (no-cache), never Mail's page in its place (the
// files' not_found_handling answers any other path with it). And /roof/version: the module's BUILD, for an open page to
// tell it's behind (as appBuild reads app.js's).
const ROOF_FILE = /^\/roof\/\w[\w.-]*\.(js|css)$/;
async function roofFile(request, env, url) {
  const none = () => new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store", ...SAFE } });
  if (request.method !== "GET" && request.method !== "HEAD") return none();
  if (url.pathname === "/roof/version") return json({ build: await roofBuild(env, request) });
  if (!ROOF_FILE.test(url.pathname)) return none();
  const res = await env.ASSETS.fetch(request);
  const type = res.headers.get("Content-Type") || "";
  const ok = res.status === 304 || (res.status === 200 && (url.pathname.endsWith(".js") ? /^(text|application)\/javascript\b/i : /^text\/css\b/i).test(type));
  if (!ok) return none();
  const out = new Response(res.body, res);
  out.headers.set("Cache-Control", "no-cache");
  out.headers.set("X-Content-Type-Options", "nosniff");
  return out;
}
// Mail's page's later parts (public/parts/: the compose sheet, the viewer, search's help, the sheets used now and then,
// the demo), each loaded by the page the first time it's needed, as /parts/<name>.js?b=<the page's BUILD>: a part for
// the Mail deployed, and only for a page that's that Mail. A page whose BUILD isn't the one deployed (a new Mail
// deployed while it was open) is turned away (409), so it never runs a new part over its old self: its service worker
// has its own kept (sw.js), or the new Mail's put in (app.js partFailed). As the module's files: there as they are,
// asked again each time (no-cache), never Mail's page in their place.
const PART_FILE = /^\/parts\/\w[\w-]*\.js$/;
async function partFile(request, env, url) {
  const none = (status = 404) => new Response(status === 409 ? "Not this Mail’s" : "Not found", { status, headers: { "Cache-Control": "no-store", ...SAFE } });
  if ((request.method !== "GET" && request.method !== "HEAD") || !PART_FILE.test(url.pathname)) return none();
  const b = url.searchParams.get("b");
  if (b) {
    const now = await appBuild(env, request);
    if (!now) return new Response("Mail is updating.", { status: 503, headers: { ...SAFE, "Cache-Control": "no-store", "Retry-After": "1" } });
    if (b !== now) return none(409);
  }
  const res = await env.ASSETS.fetch(request);
  const ok = res.status === 304 || (res.status === 200 && /^(text|application)\/javascript\b/i.test(res.headers.get("Content-Type") || ""));
  if (!ok) return none();
  const out = new Response(res.body, res);
  out.headers.set("Cache-Control", "no-cache");
  out.headers.set("X-Content-Type-Options", "nosniff");
  return out;
}

const roofBuild = assetBuild("/roof/mail.js");

const publicUser = (v) =>
  v?.signedIn
    ? { id: v.id, name: v.name, handle: v.handle, email: v.email, admin: !!v.admin, appearance: v.appearance || "auto", photoAt: v.photoAt || null }
    : null;

// Your account's photo, from the account's address with your sign-in. The URL
// is account-dependent even with ?v=, so it must be authorized on every read.
async function photo(env, request, url) {
  const r = await appFetch(env, `${env.ACCOUNT_ORIGIN}/api/account/me/photo?v=${encodeURIComponent(url.searchParams.get("v") || "")}`, {
    headers: { Cookie: accountCookie(request), Accept: "image/*" },
  });
  const type = r.headers.get("Content-Type") || "";
  if (!r.ok || !type.startsWith("image/")) throw new HttpError(404, "No photo.");
  return new Response(r.body, { headers: { "Content-Type": type, "Cache-Control": "private, no-store", ...SAFE } });
}

const senderName = (env, view) => env.DISPLAY_NAME || view?.name || "";

async function me(env, view) {
  const addresses = await listAddresses(env, { fallbackName: senderName(env, view) });
  const defaultFrom = addresses.find((a) => a.isDefault)?.email || (env.DEFAULT_FROM || `hello@${env.DOMAIN}`).toLowerCase();
  const identities = [...new Set([defaultFrom, ...addresses.map((a) => a.email)])];
  const signature = (await env.DB.prepare(`SELECT v FROM meta WHERE k = 'signature'`).first())?.v || "";
  return json({ displayName: senderName(env, view), domain: env.DOMAIN, defaultFrom, identities, addresses, signature, account: publicUser(view) });
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
  await env.DB.prepare(`DELETE FROM push_notices WHERE expires_at <= ?1`).bind(t).run();
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
  return json({ messages: results.slice(0, limit).map(rowToBrief), hasMore });
}

async function getMessage(env, id) {
  const row = await env.DB.prepare(`SELECT * FROM messages WHERE id = ?1`).bind(id).first();
  if (!row) throw new HttpError(404, "Message not found");
  const [bodyObj, atts] = await Promise.all([
    env.MAIL.get(draftBodyKey(id, row.draft_revision)),
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

  // (a draft written in InFlite keeps only which message it quotes: opened here, in Mail on its own, it has the quote
  // whole, as Mail's compose shows and sends it)
  const draft = row.folder === "drafts" && (await draftSnapshot(bodyObj, body));
  if (row.folder === "drafts" && !draft) throw draftChanged();
  let compose = draft?.compose || body.compose || null;
  const q = compose && cleanQuote(compose.quote);
  if (q && !q.header) {
    const whole = await quoteFrom(env, q).catch(() => null);
    compose = { ...compose, quote: whole ? { ...whole, of: q.of } : null };
  }
  // (and a file it forwards ({ ref }) at Mail's own address, which Mail on its own fetches to send or save it, as it does
  // a forwarded file: never a chip with nothing behind it, dropped without a word)
  if (compose && Array.isArray(compose.attachments))
    compose = { ...compose, attachments: compose.attachments.map((a) => (a && !a.content && typeof a.ref === "string" && REF_RE.test(a.ref) ? { ...a, url: `/api/attachments/${a.ref}` } : a)) };
  return json({
    ...rowToMessage(row),
    text: body.text || "",
    html,
    compose,
    ...(draft && { draftRevision: draft.revision }),
    attachments,
  });
}

// A message as InFlite's reader has it: what the list knows of it and its headers for a reply, and its own files (not the
// pictures set in its text); never its body (spec §3.5)
async function messageMeta(env, id) {
  const row = await env.DB.prepare(`SELECT * FROM messages WHERE id = ?1`).bind(id).first();
  if (!row) throw new HttpError(404, "Message not found");
  const { results } = await env.DB.prepare(`SELECT id, filename, type, size, content_id FROM attachments WHERE message_id = ?1`).bind(id).all();
  // (which are pictures in its text, as getMessage tells them: read here, never passed on)
  let html = "";
  if (results.some((a) => a.content_id)) {
    const obj = await env.MAIL.get(`body/${id}.json`);
    html = obj ? String((await obj.json())?.html || "") : "";
  }
  const attachments = results
    .filter((a) => !(a.content_id && html.includes(`cid:${a.content_id}`)))
    .map((a) => ({ id: a.id, filename: a.filename, type: a.type, size: a.size }));
  return json({ ...rowToMessage(row), attachments });
}

// A draft's editable fields and saved attachment handles, without attachment bytes.
async function getDraft(env, id, view) {
  const row = await draftRow(env, id);
  if (!row) {
    const attempted = await draftAttempt(env, view.id, id);
    if (attempted) throw draftSendConflict(attempted);
    throw new HttpError(404, "Draft not found");
  }
  const draft = await readDraft(env, row);
  if (!draft) throw draftChanged();
  const c = draft.compose;
  const q = cleanQuote(c.quote);
  let quote = null, quoteOld = false;
  if (q?.of) quote = { of: q.of, mode: q.mode || (q.forward ? "forward" : "reply") };
  else if (q) {
    const answers = !q.forward && cleanMessageId(c.inReplyTo);
    const orig = answers && (await env.DB.prepare(`SELECT id FROM messages WHERE message_id = ?1 AND folder != 'drafts' ORDER BY date DESC LIMIT 1`).bind(answers).first());
    if (orig) quote = { of: orig.id, mode: "reply" };
    else quoteOld = true;
  }
  const people = (l) => (Array.isArray(l) ? l.map((p) => ({ name: String(p?.name || ""), email: String(p?.email || "") })) : []);
  const files = c.attachments.map((a) => ({
    draftFile: a.draftFile,
    filename: String(a?.filename || "attachment"),
    type: String(a?.type || "application/octet-stream"),
    size: Number(a?.size) || 0,
    ...(a?.ref && { ref: a.ref }),
  }));
  return json({
    id,
    revision: draft.revision,
    compose: {
      ...(validDue(c.followUpAt) && { followUpAt:c.followUpAt }),
      from: String(c.from || ""),
      to: people(c.to),
      cc: people(c.cc),
      bcc: people(c.bcc),
      subject: String(c.subject || ""),
      text: String(c.text || ""),
      inReplyTo: c.inReplyTo || null,
      references: c.references || null,
      quote,
      files,
    },
    quoteOld,
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
  const [{ results: atts }, { results: drafts }] = await Promise.all([
    env.DB.prepare(`SELECT id FROM attachments WHERE message_id IN (${placeholders})`).bind(...ids).all(),
    env.DB.prepare(`SELECT id, draft_revision FROM messages WHERE id IN (${placeholders}) AND draft_revision IS NOT NULL`).bind(...ids).all(),
  ]);
  const keys = [
    ...ids.flatMap((id) => [`body/${id}.json`, `raw/${id}.eml`]),
    ...atts.map((a) => `att/${a.id}`),
    ...drafts.map((row) => draftBodyKey(row.id, row.draft_revision)),
  ];
  // Retain the index entries until every R2 batch succeeds, so a failed batch can be retried.
  for (const part of chunks(keys, 1000)) await env.MAIL.delete(part);
  await env.DB.batch([
    env.DB.prepare(`DELETE FROM mail_followups WHERE message_id IN (${placeholders})`).bind(...ids),
    env.DB.prepare(`DELETE FROM attachments WHERE message_id IN (${placeholders})`).bind(...ids),
    env.DB.prepare(`DELETE FROM messages WHERE id IN (${placeholders})`).bind(...ids),
  ]);
}

async function rawMessage(env, id) {
  const obj = await env.MAIL.get(`raw/${id}.eml`);
  if (!obj) throw new HttpError(404, "Original message not available");
  return new Response(obj.body, {
    headers: { "Content-Type": "message/rfc822", "Content-Disposition": `attachment; filename="${id}.eml"`, "Cache-Control": "private, no-store", ...SAFE },
  });
}

async function attachment(env, id, url, request, hub = null) {
  const row = await env.DB.prepare(`SELECT * FROM attachments WHERE id = ?1`).bind(id).first();
  // (to InFlite's page, pictures alone, which it shows as pictures; the rest opens at Mail's own address, S4-D17)
  if (hub && row && !RASTER.test(row.type || "")) throw new HttpError(403, "Open this file at Mail’s own address.");
  // (a part asked for, as a video player does, and iPhone insists on before it plays one)
  const range = request?.headers.get("Range");
  const obj = row && (await env.MAIL.get(`att/${id}`, range ? { range: request.headers } : undefined));
  if (!obj) throw new HttpError(404, "Attachment not found");
  // (shown in place only if it's a picture, a sound, a film or a PDF; anything else, an HTML page say, is a download,
  // so it never opens as a page of Mail's own)
  const declared = row.type || "";
  const viewable = RASTER.test(declared) || /^(audio\/[\w.+-]+|video\/[\w.+-]+|application\/pdf)$/i.test(declared);
  const type = viewable ? declared : "application/octet-stream";
  const download = url.searchParams.has("download") || !viewable;
  const headers = {
    "Content-Type": type,
    "Content-Disposition": attachmentDisposition(row.filename, download ? "attachment" : "inline"),
    "Cache-Control": "private, no-store",
    "Accept-Ranges": "bytes",
    "Referrer-Policy": "no-referrer",
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

// (one line: whatever's asked for, nothing of a message's headers has a line break of its own, which would start another
// header, a Bcc say)
const flat = (v) => String(v ?? "").replace(/[\x00-\x1f\x7f]+/g, " ");

function normalizeRecipients(list) {
  return (Array.isArray(list) ? list : [])
    .map((r) => (typeof r === "string" ? { email: r, name: "" } : { email: r?.email || "", name: r?.name || "" }))
    .map((r) => ({ email: String(r.email).trim(), name: flat(r.name).trim() }))
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

const MAX_ATTACHMENTS = 20;
function attachmentList(value) {
  const list = Array.isArray(value) ? value : [];
  if (list.length > MAX_ATTACHMENTS) throw new HttpError(413, `You can attach ${MAX_ATTACHMENTS} files at most.`);
  return list;
}

const unconfirmedSend = () => new HttpError(503, "Mail couldn’t confirm delivery. Check Sent before composing a new copy.");
const draftChanged = () => new HttpError(409, "This draft changed in another window. Reopen it to review its latest version.");
const draftSendConflict = (attempt) => new HttpError(409, attempt.id
  ? "This draft was already sent. Open Sent to review it."
  : "Delivery of this draft is unconfirmed. Check Sent before composing a new copy.");

const draftAttempt = (env, owner, id) => owner && id && env.DB.prepare(`SELECT id FROM sends WHERE owner = ?1 AND draft_id = ?2`).bind(owner, id).first();

const definiteRejections = new Set([
  "E_VALIDATION_ERROR", "E_FIELD_MISSING", "E_TOO_MANY_RECIPIENTS", "E_TOO_MANY_ATTACHMENTS",
  "E_SENDER_NOT_VERIFIED", "E_SENDER_DOMAIN_NOT_AVAILABLE", "E_SENDER_DOMAIN_NOT_CONFIGURED", "E_EMAIL_SENDING_NOT_READY",
  "E_RECIPIENT_NOT_ALLOWED", "E_RECIPIENT_PLAN_RESTRICTED", "E_RECIPIENT_SUPPRESSED", "E_ACCOUNT_SUSPENDED",
  "E_CONTENT_TOO_LARGE", "E_RATE_LIMIT_EXCEEDED", "E_DAILY_LIMIT_EXCEEDED", "E_HEADER_NOT_ALLOWED",
  "E_HEADER_USE_API_FIELD", "E_HEADER_VALUE_INVALID", "E_HEADER_VALUE_TOO_LONG", "E_HEADER_NAME_INVALID",
  "E_HEADERS_TOO_LARGE", "E_HEADERS_TOO_MANY",
]);

async function send(env, ctx, body, view) {
  const key = body.key;
  if (typeof key !== "string" || !/^[\w-]{8,64}$/.test(key)) throw new HttpError(400, "This send needs a valid retry key.");
  const owner = view.id;
  if (!owner) throw new HttpError(401, "Sign in to send mail.");
  const draftId = body.draftId ?? null;
  if (draftId !== null && (typeof draftId !== "string" || !REF_RE.test(draftId))) throw new HttpError(400, "That draft ID is invalid.");
  const revision = body.draftRevision ?? null;
  if (revision !== null && (typeof revision !== "string" || !REF_RE.test(revision))) throw draftChanged();
  const previous = () => env.DB.prepare(`SELECT key, id, owner, draft_id, draft_revision FROM sends
    WHERE (key = ?1 AND (owner = ?2 OR owner IS NULL)) OR (owner = ?2 AND draft_id = ?3)
    ORDER BY key = ?1 DESC LIMIT 1`).bind(key, owner, draftId).first();
  function previousResponse(was) {
    if (was.key !== key) throw draftSendConflict(was);
    if (was.owner && (was.draft_id !== draftId || was.draft_revision !== revision)) throw draftSendConflict(was);
    if (was.id) return json({ ok: true, id: was.id });
    throw unconfirmedSend();
  }
  const was = await previous();
  if (was) return previousResponse(was);
  if (!draftId) throw new HttpError(409, "Refresh Mail to send this message.");

  // A saved-draft send names the snapshot returned by its save. Standalone Mail can also send its explicit fields.
  const fromDraft = draftId && Object.keys(body).every((k) => ["draftId", "draftRevision", "key", "accountOwner"].includes(k));
  const row = await draftRow(env, draftId);
  if (fromDraft || row || revision) {
    const draft = row && await readDraft(env, row);
    if (!draft || revision !== draft.revision) {
      const concurrent = await previous();
      if (concurrent) return previousResponse(concurrent);
      if (!row) throw new HttpError(404, "That draft isn’t in Drafts any more.");
      throw draftChanged();
    }
    if (fromDraft) body = draft.compose;
  }
  const list = attachmentList(body.attachments);
  const size = list.reduce((n, a) => n + String(a?.content || "").length * 0.75, 0);
  if (size > 25 * 1024 * 1024) throw new HttpError(413, "Attachments can be 25 MB at most.");
  const from = checkFrom(env, body.from || (await defaultAddress(env)));
  const address = await addressOf(env, from).catch(() => null);
  const name = flat(address?.name || senderName(env, view)).trim();
  const to = normalizeRecipients(body.to);
  const cc = normalizeRecipients(body.cc);
  const bcc = normalizeRecipients(body.bcc);
  const all = [...to, ...cc, ...bcc];
  if (!all.length) throw new HttpError(400, "Add at least one recipient.");
  if (all.length > 50) throw new HttpError(400, "Too many recipients (50 max).");
  const bad = all.find((r) => !EMAIL_RE.test(r.email));
  if (bad) throw new HttpError(400, `“${bad.email}” isn't a valid email address.`);

  const subject = flat(body.subject || "").slice(0, 998);
  const signature = address?.signature || (await env.DB.prepare("SELECT v FROM meta WHERE k = 'signature'").first())?.v || "";
  const richHtml = body.html ? String(body.html) : "";
  const quote = richHtml ? null : cleanQuote(body.quote);
  const { text, html } = personalMessage(String(body.text || ""), { name, from, signature }, {
    richHtml, quote: quote && !quote.header ? await quoteFrom(env, quote) : quote,
  });
  const inReplyTo = cleanMessageId(body.inReplyTo);
  const references = (Array.isArray(body.references) ? body.references.join(" ") : String(body.references || ""))
    .split(/\s+/)
    .map(cleanMessageId)
    .filter(Boolean);
  if (inReplyTo && !references.includes(inReplyTo)) references.push(inReplyTo);
  // (a long thread's chain is trimmed, as mail clients do: the first message and the most recent)
  if (references.length > 20) references.splice(1, references.length - 20);

  const attachments = await filesOut(env, list);
  if (attachments.reduce((n, a) => n + a.bytes.byteLength, 0) > 25 * 1024 * 1024) throw new HttpError(413, "Attachments can be 25 MB at most.");

  const toAddr = (r) => (r.name ? { email: r.email, name: r.name } : r.email);
  const headers = {};
  if (inReplyTo) headers["In-Reply-To"] = `<${inReplyTo}>`;
  if (references.length) headers["References"] = references.map((r) => `<${r}>`).join(" ");
  for (const k in headers) headers[k] = flat(headers[k]);

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

  // Commit the key before contacting the provider. An unresolved claim may already have reached
  // the provider, so only a definite pre-delivery rejection releases it for another attempt.
  const claimedAt = Date.now();
  const claim = await env.DB.prepare(`INSERT INTO sends (key, at, owner, draft_id, draft_revision)
    SELECT ?1, ?2, ?3, ?4, ?5
    WHERE (?6 = 0 AND NOT EXISTS (SELECT 1 FROM messages WHERE id = ?4 AND folder = 'drafts'))
       OR (?6 = 1 AND EXISTS (SELECT 1 FROM messages WHERE id = ?4 AND folder = 'drafts' AND draft_revision IS ?7))
    ON CONFLICT DO NOTHING`).bind(key, claimedAt, owner, draftId, revision, row ? 1 : 0, row?.draft_revision ?? null).run();
  if (!claim.meta?.changes) {
    const concurrent = await previous();
    if (concurrent) return previousResponse(concurrent);
    throw draftChanged();
  }

  // Finish the receipt and Sent copy if the client stops waiting for its response.
  const going = (async () => {
    let result;
    try {
      result = await env.EMAIL.send(message);
    } catch (err) {
      const code = err?.code;
      if (!definiteRejections.has(code)) throw unconfirmedSend();
      console.error("mail send rejected", code);
      await env.DB.prepare(`DELETE FROM sends WHERE key = ?1 AND at = ?2 AND id IS NULL`).bind(key, claimedAt).run().catch(() => {});
      const hint =
        code === "E_SENDER_NOT_VERIFIED"
          ? `${env.DOMAIN} isn't verified for Email Sending yet.`
          : code === "E_RATE_LIMIT_EXCEEDED"
            ? "Sending limit reached. Try again later."
            : code === "E_RECIPIENT_SUPPRESSED"
              ? "A sender or recipient address is on the delivery suppression list. Check the addresses before trying again."
              : "The mail provider refused this message.";
      throw new HttpError(502, hint);
    }

    const id = crypto.randomUUID();
    const saveReceipt = async () => env.DB.prepare(`UPDATE sends SET id = ?2 WHERE key = ?1 AND id IS NULL`).bind(key, id).run();
    const receipt = await saveReceipt().catch(() => null);
    try {
      await keepSent(env, ctx, { followUpAt: body.followUpAt, id, result, from, name, to, cc, bcc, all, subject, text, html, inReplyTo, references, attachments, draftId: row ? draftId : null });
    } catch {
      console.error("sent, but the copy wasn't kept");
    }
    if (!receipt) await saveReceipt().catch(() => console.error("sent, but the receipt wasn't kept"));
    return id;
  })();
  ctx.waitUntil(going.catch(() => {}));
  return json({ ok: true, id: await going });
}

async function keepSent(env, ctx, { followUpAt, id, result, from, name, to, cc, bcc, all, subject, text, html, inReplyTo, references, attachments, draftId }) {
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
  if (validDue(followUpAt)) {
    stmts.push(env.DB.prepare(`INSERT INTO mail_followups(thread_id,message_id,due,notified) VALUES(?,?,?,0)
      ON CONFLICT(thread_id) DO UPDATE SET message_id=excluded.message_id,due=excluded.due,notified=0`).bind(threadId,id,followUpAt));
  }
  // Replying in a conversation means it has been read.
  if (threadId !== id) stmts.push(env.DB.prepare(`UPDATE messages SET unread = 0 WHERE thread_id = ?1`).bind(threadId));
  await env.DB.batch(stmts);

  if (draftId) ctx.waitUntil(deleteDraft(env, String(draftId)).catch(() => {}));
  ctx.waitUntil(upsertContacts(env, all));
}

// A message's files to send: those sent with it, and those forwarded ({ ref: an attachment's id }), copied from Mail's own
// (never fetched into the page, S4-D4). One that can't be had is said, never left out.
// Read the sizes of forwarded attachments before reading their contents.
async function filesOut(env, list) {
  const gone = (a, row) => new HttpError(400, `Couldn’t attach “${String(a.filename || row?.filename || "a file").slice(0, 200)}”.`);
  const rows = new Map();
  let total = 0;
  for (const a of list) {
    if (a?.ref === undefined) {
      if (typeof a?.content !== "string") throw new HttpError(400, "An attachment was invalid. Add the file again.");
      total += a.content.length * 0.75;
      continue;
    }
    const ref = typeof a.ref === "string" && REF_RE.test(a.ref) ? a.ref : null;
    const row = ref && (await env.DB.prepare(`SELECT filename, type, size FROM attachments WHERE id = ?1`).bind(ref).first());
    if (!row) throw gone(a, row);
    rows.set(a, { ref, ...row });
    total += Number(row.size) || 0;
  }
  if (total > 25 * 1024 * 1024) throw new HttpError(413, "Attachments can be 25 MB at most.");
  const out = [];
  for (const a of list) {
    const row = rows.get(a);
    if (row) {
      const obj = await env.MAIL.get(`att/${row.ref}`);
      if (!obj) throw gone(a, row);
      out.push({ id: crypto.randomUUID(), filename: flat(a.filename || row.filename || "attachment"), type: flat(row.type || "application/octet-stream"), bytes: new Uint8Array(await obj.arrayBuffer()) });
      continue;
    }
    let bytes;
    try { bytes = base64ToBytes(a.content); }
    catch { throw gone(a); }
    out.push({ id: crypto.randomUUID(), filename: flat(a.filename || "attachment"), type: flat(a.type || "application/octet-stream"), bytes });
  }
  return out;
}

// D1 points to one immutable R2 snapshot. Drafts written by older Mail remain at the original key.
const draftBodyKey = (id, revision) => revision ? `draft/${id}/${revision}.json` : `body/${id}.json`;
const draftRow = (env, id) => env.DB.prepare(`SELECT id, draft_revision FROM messages WHERE id = ?1 AND folder = 'drafts'`).bind(id).first();

async function draftSnapshot(obj, body) {
  if (!obj) return null;
  body ??= await obj.json();
  if (!body?.compose) return null;
  let revision = body.revision || obj.etag;
  if (!revision) {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(body)));
    revision = Array.from(new Uint8Array(digest).slice(0, 16), byte => byte.toString(16).padStart(2, "0")).join("");
  }
  const files = Array.isArray(body.compose.attachments) ? body.compose.attachments : [];
  const attachments = files.map((file, i) => ({ ...file, draftFile: file?.draftFile || `${revision}-${i}` }));
  return { revision, compose: { ...body.compose, attachments } };
}

const readDraft = async (env, row) => draftSnapshot(await env.MAIL.get(draftBodyKey(row.id, row.draft_revision)));

// (only ever a draft: never a message that came in or went out)
async function deleteDraft(env, id) {
  const row = await env.DB.prepare(`SELECT id FROM messages WHERE id = ?1 AND folder = 'drafts'`).bind(id).first();
  if (row) await deleteMessages(env, [row.id]);
}

// Resolve the attachment handles against the captured draft. Missing handles require reloading the draft.
async function draftFiles(env, list, kept = []) {
  const out = [];
  let total = 0;
  const add = (n) => {
    total += n;
    if (total > 25 * 1024 * 1024) throw new HttpError(413, "Attachments can be 25 MB at most.");
  };
  for (const a of list) {
    if (a?.draftFile !== undefined || a?.i !== undefined) {
      const file = kept.find((item) => item.draftFile === a.draftFile);
      if (!file) throw draftChanged();
      add(file.ref ? Number(file.size) || 0 : String(file.content || "").length * 0.75);
      out.push(file);
      continue;
    }
    if (a?.ref !== undefined) {
      const ref = typeof a.ref === "string" && REF_RE.test(a.ref) ? a.ref : null;
      const row = ref && (await env.DB.prepare(`SELECT filename, type, size FROM attachments WHERE id = ?1`).bind(ref).first());
      const had = !row && ref && kept.find((k) => k?.ref === ref);
      if (had) {
        add(Number(had.size) || 0);
        out.push(had);
        continue;
      }
      if (!row) throw new HttpError(400, `Couldn’t attach “${String(a.filename || "a file").slice(0, 200)}”.`);
      add(Number(row.size) || 0);
      out.push({ draftFile: crypto.randomUUID(), ref, filename: String(a.filename || row.filename || "attachment").slice(0, 200), type: String(row.type || "application/octet-stream").slice(0, 100), size: Number(row.size) || 0 });
      continue;
    }
    const content = a?.content;
    if (typeof content !== "string" || !/^[A-Za-z0-9+/=]*$/.test(content)) throw new HttpError(400, "An attachment was invalid. Add the file again.");
    add(content.length * 0.75);
    out.push({ draftFile: crypto.randomUUID(), filename: String(a.filename || "attachment").slice(0, 200), type: String(a.type || "application/octet-stream").slice(0, 100), size: Number(a.size) || 0, content });
  }
  return out;
}

async function saveDraft(env, ctx, body, view) {
  const list = attachmentList(body.attachments);
  let id = typeof body.id === "string" && REF_RE.test(body.id) ? body.id : crypto.randomUUID();
  const owner = view.id;
  if (!owner) throw new HttpError(401, "Sign in to save drafts.");
  const attempt = await draftAttempt(env, owner, id);
  if (attempt) throw draftSendConflict(attempt);
  let existing = await env.DB.prepare(`SELECT id, folder, draft_revision FROM messages WHERE id = ?1`).bind(id).first();
  if (existing && existing.folder !== "drafts") {
    id = crypto.randomUUID();
    existing = null;
  }
  const snapshot = existing && await readDraft(env, existing);
  if (snapshot ? body.draftRevision !== snapshot.revision : existing || body.draftRevision != null) throw draftChanged();
  const stored = snapshot?.compose || {};
  const kept = stored.attachments || [];
  if (body.keepAttachments === true && list.length) throw new HttpError(400, "Choose how to keep the draft attachments.");
  const quote = cleanQuote("quote" in body ? body.quote : stored.quote);
  const compose = {
    followUpAt: validDue(body.followUpAt) ? body.followUpAt : (body.followUpAt === undefined ? stored.followUpAt || null : null),
    from: String(body.from || ""),
    to: normalizeRecipients(body.to),
    cc: normalizeRecipients(body.cc),
    bcc: normalizeRecipients(body.bcc),
    subject: String(body.subject || ""),
    text: String(body.text || ""),
    inReplyTo: body.inReplyTo || null,
    references: body.references || null,
    quote,
    attachments: body.keepAttachments === true ? attachmentList(kept) : await draftFiles(env, list, kept),
  };
  const revision = crypto.randomUUID();
  const key = draftBodyKey(id, revision);
  await env.MAIL.put(key, JSON.stringify({ text: compose.text, html: "", compose, revision }), {
    httpMetadata: { contentType: "application/json" },
  });
  const result = await env.DB.prepare(
    `INSERT INTO messages (id, folder, thread_id, mailbox, from_name, from_email, to_json, cc_json, bcc_json,
       subject, snippet, date, draft_revision)
     SELECT ?1, 'drafts', ?1, ?2, ?3, ?2, ?4, ?5, ?6, ?7, ?8, ?9, ?10
     WHERE NOT EXISTS (SELECT 1 FROM sends WHERE owner = ?11 AND draft_id = ?1)
       AND (?12 = 0 OR EXISTS (SELECT 1 FROM messages WHERE id = ?1 AND folder = 'drafts' AND draft_revision IS ?13))
     ON CONFLICT(id) DO UPDATE SET to_json = ?4, cc_json = ?5, bcc_json = ?6, subject = ?7, snippet = ?8,
       date = ?9, mailbox = ?2, from_email = ?2, draft_revision = ?10
     WHERE ?12 = 1 AND messages.folder = 'drafts' AND messages.draft_revision IS ?13`
  ).bind(id, compose.from.toLowerCase(), senderName(env, view), JSON.stringify(compose.to), JSON.stringify(compose.cc),
    JSON.stringify(compose.bcc), compose.subject, snippet(compose.text), Date.now(), revision, owner,
    existing ? 1 : 0, existing?.draft_revision ?? null).run();
  if (!result.meta?.changes) {
    ctx.waitUntil(env.MAIL.delete(key).catch(() => {}));
    const concurrent = await draftAttempt(env, owner, id);
    if (concurrent) throw draftSendConflict(concurrent);
    throw draftChanged();
  }
  if (existing) ctx.waitUntil(env.MAIL.delete(draftBodyKey(id, existing.draft_revision)).catch(() => {}));
  return json({ ok: true, id, revision });
}

// How fast Mail's page was on this device, numbers only, from the shared menu as it's left: passed on to the account
// (functions/_vitals.js), nothing kept here
async function vitals(request, env, ctx) {
  const none = (status = 204) => new Response(null, { status, headers: { "Cache-Control": "no-store" } });
  if (request.method !== "POST") return none(405);
  if (!sameOriginPost(request)) return none(403);
  const body = await bodyUpTo(request, 600);
  if (body === null) return none(413);
  const go = appFetch(env, `${env.ACCOUNT_ORIGIN}/api/vitals`, { method: "POST", headers: whose(request, env, { "Content-Type": "text/plain" }), body, signal: AbortSignal.timeout(5000) }).catch(() => null);
  if (ctx?.waitUntil) ctx.waitUntil(go); else await go;
  return none();
}

async function bugReport(request, env) {
  const out = (status, error) => json({ error }, status);
  if (request.method !== "POST") return out(405, "Not here.");
  if (!sameOriginPost(request)) return out(403, "Not from here.");
  const body = await bodyUpTo(request, 3 * 12000);
  if (body === null || body.length > 12000) return out(413, "That report is too long.");
  const headers = whose(request, env, { "Content-Type": "application/json" });
  const res = await appFetch(env, `${env.ACCOUNT_ORIGIN}/api/bugs`, { method: "POST", headers, body, signal: AbortSignal.timeout(8000) }).catch(() => null);
  if (!res) return out(502, "The report couldn’t be sent just now.");
  return new Response(res.body, { status: res.status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
}

// (what's passed on says whose it is: the browser's address, as auth.js's forwardHeaders passes it, and with the hub's
// key where Mail has one, as Today's ask() does, which the account believes of a Worker. Else everyone's Mail would be
// counted against one address's limits)
function whose(request, env, headers) {
  const ip = request.headers.get("CF-Connecting-IP");
  if (ip) headers["CF-Connecting-IP"] = ip;
  if (ip && env.HUB_KEY) Object.assign(headers, { "X-Hub-Key": env.HUB_KEY, "X-Hub-IP": ip });
  return headers;
}

// Small API objects by default; composing mail has its own attachment-sized cap.
// A fallback applies only to malformed JSON, never to an oversized request.
export async function jsonBody(request, max = 64 * 1024, fallback) {
  const text = await bodyUpTo(request, max);
  if (text === null) throw new HttpError(413, "That request is too large.");
  try {
    const value = JSON.parse(text);
    if (value && typeof value === "object" && !Array.isArray(value)) return value;
  } catch {
    if (fallback !== undefined) return fallback;
  }
  throw new HttpError(400, "That request wasn’t valid JSON.");
}

export default {
  ...worker,
  async fetch(request, env, ctx) {
    return sharedNotFound(request, await worker.fetch(request, env, ctx), env.TODAY_APP);
  },
};
