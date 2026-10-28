// D1 schema, created lazily on first use so no migration step is needed.
const SCHEMA = [
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
  // (mail from before categories: sorted by its sender's address alone)
  `UPDATE messages SET category = CASE
     WHEN folder IN ('sent', 'drafts') THEN 'people'
     WHEN lower(from_email) GLOB '*no-reply*' OR lower(from_email) GLOB '*noreply*' OR lower(from_email) GLOB '*donotreply*'
       OR lower(from_email) GLOB '*do-not-reply*' OR lower(from_email) GLOB 'notification*' OR lower(from_email) GLOB 'newsletter*'
       OR lower(from_email) GLOB 'news@*' OR lower(from_email) GLOB 'updates@*' OR lower(from_email) GLOB 'alerts@*'
       OR lower(from_email) GLOB 'receipts@*' OR lower(from_email) GLOB 'billing@*' OR lower(from_email) GLOB 'mailer*' THEN 'updates'
     ELSE 'people' END
   WHERE category IS NULL`,
];

let ready;

export function ensureSchema(env) {
  ready ??= (async () => {
    await env.DB.batch(SCHEMA.map((sql) => env.DB.prepare(sql)));
    for (const sql of MIGRATIONS) {
      try {
        await env.DB.prepare(sql).run();
      } catch (err) {
        if (!/duplicate column/i.test(err.message)) throw err;
      }
    }
  })().catch((err) => {
    ready = undefined;
    throw err;
  });
  return ready;
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

// Finds the thread a message belongs to from its In-Reply-To / References.
export async function findThread(env, inReplyTo, references) {
  const ids = [inReplyTo, ...(references || "").split(/\s+/)]
    .map(cleanMessageId)
    .filter(Boolean);
  if (!ids.length) return null;
  const placeholders = ids.map((_, i) => `?${i + 1}`).join(",");
  const row = await env.DB.prepare(
    `SELECT thread_id FROM messages WHERE message_id IN (${placeholders}) LIMIT 1`
  )
    .bind(...ids)
    .first();
  return row?.thread_id || null;
}

export function cleanMessageId(id) {
  return (id || "").trim().replace(/^<|>$/g, "");
}
