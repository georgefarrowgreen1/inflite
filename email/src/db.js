// D1 schema, created lazily on first use so no migration step is needed.
const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT)`,
  `CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    folder TEXT NOT NULL,
    thread_id TEXT,
    message_id TEXT,
    in_reply_to TEXT,
    refs TEXT,
    mailbox TEXT,
    from_name TEXT,
    from_email TEXT,
    to_json TEXT,
    cc_json TEXT,
    bcc_json TEXT,
    reply_to TEXT,
    subject TEXT,
    snippet TEXT,
    date INTEGER NOT NULL,
    unread INTEGER NOT NULL DEFAULT 0,
    starred INTEGER NOT NULL DEFAULT 0,
    has_attachments INTEGER NOT NULL DEFAULT 0,
    size INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE INDEX IF NOT EXISTS idx_messages_folder_date ON messages(folder, date DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_messages_message_id ON messages(message_id)`,
  `CREATE INDEX IF NOT EXISTS idx_messages_thread ON messages(thread_id, date)`,
  `CREATE TABLE IF NOT EXISTS attachments (
    id TEXT PRIMARY KEY,
    message_id TEXT NOT NULL,
    filename TEXT,
    type TEXT,
    size INTEGER,
    content_id TEXT,
    disposition TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS idx_attachments_message ON attachments(message_id)`,
  `CREATE TABLE IF NOT EXISTS contacts (
    email TEXT PRIMARY KEY,
    name TEXT,
    count INTEGER NOT NULL DEFAULT 0,
    last_used INTEGER NOT NULL DEFAULT 0
  )`,
];

// Columns and tables added since the first version: each run on its own, as ALTER TABLE fails once a column exists.
const MIGRATIONS = [
  `ALTER TABLE messages ADD COLUMN category TEXT`,
  `ALTER TABLE messages ADD COLUMN snooze_until INTEGER`,
  `ALTER TABLE messages ADD COLUMN prev_folder TEXT`,
  `CREATE TABLE IF NOT EXISTS sender_rules (email TEXT PRIMARY KEY, category TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS idx_messages_thread_folder ON messages(thread_id, folder)`,
  `ALTER TABLE messages ADD COLUMN bumped_at INTEGER`,
  `CREATE INDEX IF NOT EXISTS idx_messages_snooze ON messages(snooze_until)`,
  `CREATE TABLE IF NOT EXISTS push_subs (endpoint TEXT PRIMARY KEY, p256dh TEXT NOT NULL, auth TEXT NOT NULL, created_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT)`,
  // (how a sender says to stop: its List-Unsubscribe header, and whether it takes a one-click POST, RFC 8058)
  `ALTER TABLE messages ADD COLUMN unsub TEXT`,
  `ALTER TABLE messages ADD COLUMN unsub_post INTEGER`,
  // (mail from before categories: sorted by its sender's address alone)
  `UPDATE messages SET category = CASE
     WHEN folder IN ('sent', 'drafts') THEN 'people'
     WHEN lower(from_email) GLOB '*no-reply*' OR lower(from_email) GLOB '*noreply*' OR lower(from_email) GLOB '*donotreply*'
       OR lower(from_email) GLOB '*do-not-reply*' OR lower(from_email) GLOB 'notification*' OR lower(from_email) GLOB 'newsletter*'
       OR lower(from_email) GLOB 'news@*' OR lower(from_email) GLOB 'updates@*' OR lower(from_email) GLOB 'alerts@*'
       OR lower(from_email) GLOB 'receipts@*' OR lower(from_email) GLOB 'billing@*' OR lower(from_email) GLOB 'mailer*' THEN 'updates'
     ELSE 'people' END
   WHERE category IS NULL`,
  // (Mail's own addresses, as Settings has them: see addresses.js)
  `CREATE TABLE IF NOT EXISTS addresses (email TEXT PRIMARY KEY, name TEXT, color TEXT, category TEXT, notify INTEGER NOT NULL DEFAULT 1,
     is_default INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL)`,
  // (an address's own signature, over the one for every address)
  `ALTER TABLE addresses ADD COLUMN signature TEXT`,
  // (a sender's mail found without reading the whole mailbox: unsubscribing, Always, how often you open them)
  `CREATE INDEX IF NOT EXISTS idx_messages_from ON messages(from_email, date)`,
  // (when it went in the Trash: emptied 30 days after; what's there already counts from now)
  `ALTER TABLE messages ADD COLUMN trashed_at INTEGER`,
  `UPDATE messages SET trashed_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000 WHERE folder = 'trash' AND trashed_at IS NULL`,
];

// Bumped whenever SCHEMA or MIGRATIONS change, so a new isolate checks one row rather than running them all again.
const SCHEMA_VERSION = "9";

let ready;

export function ensureSchema(env) {
  ready ??= (async () => {
    const at = await env.DB.prepare(`SELECT v FROM meta WHERE k = 'schema'`).first().catch(() => null);
    if (at?.v === SCHEMA_VERSION) return;
    await env.DB.batch(SCHEMA.map((sql) => env.DB.prepare(sql)));
    for (const sql of MIGRATIONS) {
      try {
        await env.DB.prepare(sql).run();
      } catch (err) {
        if (!/duplicate column/i.test(err.message)) throw err;
      }
    }
    await env.DB.prepare(`INSERT INTO meta (k, v) VALUES ('schema', ?1) ON CONFLICT(k) DO UPDATE SET v = excluded.v`).bind(SCHEMA_VERSION).run();
  })().catch((err) => {
    ready = undefined;
    throw err;
  });
  return ready;
}

// The mailbox's version: changes with anything that changes what the stream shows, so an open Mail can ask whether
// anything's new with one row read rather than reading the stream again.
export function bumpVersion(env) {
  return env.DB.prepare(`INSERT INTO meta (k, v) VALUES ('v', ?1) ON CONFLICT(k) DO UPDATE SET v = excluded.v`)
    .bind(String(Date.now()) + Math.random().toString(36).slice(2, 6))
    .run();
}

export async function mailVersion(env) {
  return (await env.DB.prepare(`SELECT v FROM meta WHERE k = 'v'`).first())?.v || "0";
}

export const FOLDERS = ["inbox", "drafts", "sent", "archive", "trash"];

export function rowToSummary(r) {
  return {
    id: r.id,
    folder: r.folder,
    threadId: r.thread_id,
    mailbox: r.mailbox,
    from: { name: r.from_name || "", email: r.from_email || "" },
    to: parseJSON(r.to_json),
    cc: parseJSON(r.cc_json),
    subject: r.subject || "",
    snippet: r.snippet || "",
    date: r.date,
    unread: !!r.unread,
    starred: !!r.starred,
    hasAttachments: !!r.has_attachments,
    category: r.category || "people",
  };
}

export function rowToMessage(r) {
  return {
    ...rowToSummary(r),
    bcc: parseJSON(r.bcc_json),
    replyTo: r.reply_to || null,
    messageId: r.message_id,
    inReplyTo: r.in_reply_to,
    references: r.refs,
  };
}

function parseJSON(s) {
  try {
    return s ? JSON.parse(s) : [];
  } catch {
    return [];
  }
}

export async function upsertContacts(env, people) {
  const now = Date.now();
  const stmts = people
    .filter((p) => p && p.email)
    .map((p) =>
      env.DB.prepare(
        `INSERT INTO contacts (email, name, count, last_used) VALUES (?1, ?2, 1, ?3)
         ON CONFLICT(email) DO UPDATE SET
           name = COALESCE(NULLIF(?2, ''), contacts.name),
           count = contacts.count + 1,
           last_used = ?3`
      ).bind(p.email.toLowerCase(), p.name || "", now)
    );
  if (stmts.length) await env.DB.batch(stmts);
}

// Finds the thread a message belongs to from its In-Reply-To / References. For mail that's come in (from: who it's
// from, subject: its subject), a message it names counts only if it's plausibly the same conversation: one you sent,
// one this sender was part of, or one with the same subject. A message's ID is no secret (anyone on a thread or a
// list sees it), so naming one alone mustn't put a stranger's mail into a private conversation.
const bareSubject = (s) => (s || "").replace(/^((re|fwd?|aw|sv)\s*:\s*)+/i, "").trim().toLowerCase();
export async function findThread(env, inReplyTo, references, from = null, subject = null) {
  // (the newest few dozen are plenty, and D1 takes at most 100 bound values)
  const refs = (references || "").split(/\s+/).map(cleanMessageId).filter(Boolean).slice(-50);
  const ids = [...new Set([cleanMessageId(inReplyTo), ...refs].filter(Boolean))];
  if (!ids.length) return null;
  const placeholders = ids.map((_, i) => `?${i + 1}`).join(",");
  const { results } = await env.DB.prepare(
    `SELECT thread_id, folder, from_email, to_json, cc_json, subject FROM messages WHERE message_id IN (${placeholders}) LIMIT 20`
  )
    .bind(...ids)
    .all();
  if (from === null) return results[0]?.thread_id || null;
  const who = String(from || "").toLowerCase(), about = bareSubject(subject);
  const part = (json) => { try { return JSON.parse(json || "[]").some((a) => String(a?.email || "").toLowerCase() === who); } catch { return false; } };
  // (the likeliest first, where an ID is on more than one: the sender's own message, then one you sent, then one they
  // were part of, then one on the same subject)
  const rank = (m) => (who && String(m.from_email || "").toLowerCase() === who ? 4 : m.folder === "sent" ? 3 : who && (part(m.to_json) || part(m.cc_json)) ? 2 : about && bareSubject(m.subject) === about ? 1 : 0);
  const best = results.map((m) => [rank(m), m]).filter(([r]) => r > 0).sort((x, y) => y[0] - x[0])[0];
  return best?.[1].thread_id || null;
}

export function cleanMessageId(id) {
  return (id || "").trim().replace(/^<|>$/g, "");
}
