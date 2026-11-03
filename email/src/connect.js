// What Mail tells InFlite (One roof, stage 4): Today's card (numbers only, to the account's server with the shared key),
// a notice's words (to the phone itself, never through InFlite's servers), and the searches InFlite's page asks for in a
// request's body rather than its address (Mail's logs keep addresses; S4-D9).
import { counts, cleanSubject } from "./threads.js";
import { addressOf } from "./addresses.js";

const enc = new TextEncoder();

// The account's server, by the key it shares with Mail (MAIL_KEY: Authorization: Bearer <key>), compared in the same time
// whatever it is; never by a cookie. No key set: no one.
export async function keyOk(request, env) {
  const key = typeof env.MAIL_KEY === "string" ? env.MAIL_KEY : "";
  const m = /^Bearer (\S{1,512})$/.exec(request.headers.get("Authorization") || "");
  if (!key || !m) return false;
  const [a, b] = await Promise.all([key, m[1]].map((s) => crypto.subtle.digest("SHA-256", enc.encode(s))));
  const x = new Uint8Array(a), y = new Uint8Array(b);
  let d = 0;
  for (let i = 0; i < x.length; i++) d |= x[i] ^ y[i];
  return d === 0;
}

// Today's card: how many conversations from people are unread, Updates' unread, and Later's count with the next one's
// time. Numbers only.
export async function card(env) {
  const c = await counts(env);
  const n = (v) => (Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0);
  const next = Number(c.nextLater?.at);
  return { people: n(c.people?.unread), updates: n(c.updates?.unread), later: { n: n(c.snoozed), next: Number.isFinite(next) && next > 0 ? next : null } };
}

const cut = (s, n) => {
  const t = String(s || "").replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};

// A notice's words, for the phone that was just told "New mail from people" or "Back from Later" with only the
// conversation's id: its newest incoming message's sender (name, else address) and subject, 120 characters each at most.
// Only where a notice was due (receive.js's rule: People, or an address set to notify for Updates; or a conversation just
// back from Later, which always notifies); else null.
export async function notice(env, threadId) {
  const m = await env.DB.prepare(
    `SELECT from_name, from_email, subject, category, mailbox, folder FROM messages WHERE thread_id = ?1 AND folder IN ('inbox', 'archive')
     ORDER BY date DESC LIMIT 1`
  )
    .bind(threadId)
    .first();
  if (!m) return null;
  // (brought back by Later since its newest message came: bumped_at, wakeSnoozed)
  const back = await env.DB.prepare(`SELECT 1 AS k FROM messages WHERE thread_id = ?1 AND bumped_at > (SELECT MAX(date) FROM messages WHERE thread_id = ?1 AND folder IN ('inbox', 'archive')) LIMIT 1`)
    .bind(threadId)
    .first();
  if (!back) {
    const address = m.mailbox ? await addressOf(env, String(m.mailbox).toLowerCase()).catch(() => null) : null;
    const category = m.category || "people";
    const due = address ? address.notify && (category === "people" || address.category === "updates") : category === "people";
    if (!due) return null;
  }
  const title = cut(m.from_name || m.from_email || "Mail", 120);
  const body = back ? cut(`Back from Later: ${cleanSubject(m.subject) || "(No Subject)"}`, 120) : cut(m.subject || "(No Subject)", 120);
  return { title, body };
}

// The searches, from a request's body: { q, view, category, address, before, count } as listThreads reads them from an
// address, and { q } for contacts. A search 300 characters long at most.
export function searchParams(b) {
  b = b && typeof b === "object" ? b : {};
  const q = typeof b.q === "string" ? b.q.trim() : "";
  if (q.length > 300) return null;
  const sp = new URLSearchParams();
  if (q) sp.set("q", q);
  for (const k of ["view", "category", "address"]) if (typeof b[k] === "string" && b[k]) sp.set(k, b[k].slice(0, 320));
  if (Number.isFinite(Number(b.before)) && Number(b.before) > 0) sp.set("before", String(Number(b.before)));
  if (b.count === true || b.count === 1 || b.count === "1") sp.set("count", "1");
  if (Number.isFinite(Number(b.limit)) && Number(b.limit) > 0) sp.set("limit", String(Math.floor(Number(b.limit))));
  return sp;
}
