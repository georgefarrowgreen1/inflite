import { rowToSummary, bumpVersion } from "./db.js";

// One stream of conversations rather than folders. Later hides a conversation until a time; when it comes it's back at the
// top of the stream, unread (wakeSnoozed, every few minutes by the scheduler, with a notice; until then a conversation
// whose time has passed already shows, as reads treat it as awake). A conversation is in the stream while any of its messages is in the
// inbox; Done moves those to the archive; a new message brings it back. Views narrow the stream (Unread, Flagged,
// Attachments) or show what's been dealt with (Done); People and Updates split it by what sort of mail it is; an
// address lens shows only mail to one @domain address.

export const VIEWS = ["all", "unread", "flagged", "attachments", "later", "done", "trash"];

const cleanSubject = (s) => (s || "").replace(/^((re|fwd?|aw|sv)\s*:\s*)+/i, "").trim();

// Search with operators: from:, to:, file: (a file's name), has:attachment (or has:image, has:pdf), is:unread,
// is:flagged, is:done, before:/after: (YYYY-MM-DD), in:trash (what's in the Trash, which a search otherwise leaves
// out: listThreads), anything else matched against the subject, preview, people and the names of the files.
// (one of a message's own files, not a picture set in its text)
const fileOf = (cond) =>
  `EXISTS (SELECT 1 FROM attachments a WHERE a.message_id = messages.id AND NOT (COALESCE(a.disposition, '') = 'inline' AND a.content_id IS NOT NULL) AND ${cond})`;
const fileLike = (p) => fileOf(`lower(a.filename) LIKE ${p}`);

export function searchCondition(q, bind) {
  const conds = [];
  const tokens = (q.match(/[\w]+:("[^"]*"|\S+)|"[^"]*"|\S+/g) || []).slice(0, 10);
  const like = (v) => bind(`%${v.replace(/^"|"$/g, "").replace(/[%_]/g, "").toLowerCase()}%`);
  for (const t of tokens) {
    const m = t.match(/^(from|to|file|has|is|before|after):(.+)$/i);
    if (!m) {
      const p = like(t);
      conds.push(
        `(lower(subject) LIKE ${p} OR lower(snippet) LIKE ${p} OR lower(from_name) LIKE ${p} OR lower(from_email) LIKE ${p} OR lower(to_json) LIKE ${p} OR (has_attachments = 1 AND ${fileLike(p)}))`
      );
      continue;
    }
    const [, op, raw] = m;
    const v = raw.replace(/^"|"$/g, "");
    switch (op.toLowerCase()) {
      case "from": {
        const p = like(v);
        conds.push(`(lower(from_email) LIKE ${p} OR lower(from_name) LIKE ${p})`);
        break;
      }
      case "to": {
        const p = like(v);
        conds.push(`(lower(to_json) LIKE ${p} OR lower(cc_json) LIKE ${p} OR lower(mailbox) LIKE ${p} OR also_to LIKE ${p})`);
        break;
      }
      case "file":
        conds.push(fileLike(like(v)));
        break;
      case "has":
        if (/^(attach|file)/i.test(v)) conds.push(`has_attachments = 1`);
        else if (/^(image|photo|picture)s?$/i.test(v)) conds.push(fileOf(`lower(a.type) LIKE 'image/%'`));
        else if (/^pdfs?$/i.test(v)) conds.push(fileOf(`(lower(a.type) = 'application/pdf' OR lower(a.filename) LIKE '%.pdf')`));
        else if (/^videos?$/i.test(v)) conds.push(fileOf(`lower(a.type) LIKE 'video/%'`));
        break;
      case "is":
        if (/^unread$/i.test(v)) conds.push(`unread = 1`);
        else if (/^(flagged|starred)$/i.test(v)) conds.push(`starred = 1`);
        else if (/^done$/i.test(v)) conds.push(`folder = 'archive'`);
        break;
      case "before":
      case "after": {
        const t = Date.parse(v);
        if (Number.isFinite(t)) conds.push(`date ${op.toLowerCase() === "before" ? "<" : ">="} ${bind(t)}`);
        break;
      }
    }
  }
  return conds.length ? conds.join(" AND ") : "1";
}

const AGG = `thread_id, MAX(MAX(date), MAX(COALESCE(bumped_at, 0))) AS last, MAX(date) AS latest, COUNT(*) AS n,
  SUM(folder = 'inbox' AND unread = 1) AS unread, MAX(starred) AS starred, MAX(has_attachments) AS atts,
  SUM(folder = 'inbox') AS inbox, MIN(COALESCE(category, 'people')) AS category, MAX(COALESCE(snooze_until, 0)) AS snooze`;

// Which conversations a list holds (its view, People or Updates, an address, a search: sp, the list's own asking), as
// what's read of each message (where) and what each conversation as a whole must have (having), its values bound by bind
function listFilter(sp, bind, now) {
  const view = VIEWS.includes(sp.get("view")) ? sp.get("view") : "all";
  const category = ["people", "updates"].includes(sp.get("category")) ? sp.get("category") : null;
  const address = (sp.get("address") || "").trim().toLowerCase() || null;
  // (in:trash: the search made in the Trash, in place of everywhere else)
  const raw = (sp.get("q") || "").trim();
  const trashSearch = /(^|\s)in:trash(?=\s|$)/i.test(raw);
  const q = raw.replace(/(^|\s)in:\S+/gi, " ").replace(/\s+/g, " ").trim();
  const inTrash = trashSearch || (view === "trash" && !q);
  const where = inTrash ? `folder = 'trash'` : `folder NOT IN ('trash', 'drafts')`;
  // (a list of the stream's, or the flagged, reads only the conversations that can be in it, found by an index of their
  // own: not every one there's ever been, which Done keeps for good. Whole conversations, so what's added up of each is
  // as it was: scope, for the grouping; where, for each one's messages)
  const among =
    q || inTrash ? null
    : view === "unread" ? `folder = 'inbox' AND unread = 1`
    : view === "all" || view === "later" ? `folder = 'inbox'`
    : view === "flagged" ? `starred = 1`
    : null;
  const scope = among ? `${where} AND thread_id IN (SELECT thread_id FROM messages WHERE ${among})` : where;
  const having = [];
  if (trashSearch && !q) having.push("1");
  else if (q) having.push(`SUM(CASE WHEN ${searchCondition(q, bind)} THEN 1 ELSE 0 END) > 0`);
  else if (view === "all") having.push(`SUM(folder = 'inbox') > 0`, `MAX(COALESCE(snooze_until, 0)) <= ${bind(now)}`);
  else if (view === "unread") having.push(`SUM(folder = 'inbox' AND unread = 1) > 0`, `MAX(COALESCE(snooze_until, 0)) <= ${bind(now)}`);
  else if (view === "flagged") having.push(`MAX(starred) = 1`);
  else if (view === "attachments") having.push(`MAX(has_attachments) = 1`);
  else if (view === "later") having.push(`SUM(folder = 'inbox') > 0`, `MAX(COALESCE(snooze_until, 0)) > ${bind(now)}`);
  else if (view === "done") having.push(`SUM(folder = 'inbox') = 0`);
  if (category && !q && !inTrash && !trashSearch) having.push(`MIN(COALESCE(category, 'people')) = ${bind(category)}`);
  // (one that came to two of your addresses, kept once, is the other's too: also_to)
  if (address) {
    const a = bind(address);
    having.push(`SUM(lower(mailbox) = ${a} OR instr(COALESCE(also_to, ''), ',' || ${a} || ',') > 0) > 0`);
  }
  return { view, category, address, q, trashSearch, where, scope, having };
}

const binder = (params) => (v) => {
  params.push(v);
  return `?${params.length}`;
};

export async function listThreads(env, url) {
  // (count=1: how many conversations it finds, for the searches offered beside one that finds none; up to 999)
  const counting = url.searchParams.get("count") === "1";
  const before = Number(url.searchParams.get("before")) || null;
  const limit = Math.max(1, Math.min(Math.floor(Number(url.searchParams.get("limit"))) || 40, 100));
  const now = Date.now();

  const params = [];
  const bind = binder(params);
  const { view, category, address, q, trashSearch, where, scope, having } = listFilter(url.searchParams, bind, now);
  if (before) having.push(`MAX(MAX(date), MAX(COALESCE(bumped_at, 0))) < ${bind(before)}`);

  if (counting) {
    const row = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM (SELECT thread_id FROM messages WHERE ${scope} AND thread_id IS NOT NULL GROUP BY thread_id
       ${having.length ? `HAVING ${having.join(" AND ")}` : ""} LIMIT 999)`
    )
      .bind(...params)
      .first();
    return { count: row?.n || 0 };
  }
  const { results: groups } = await env.DB.prepare(
    `SELECT ${AGG} FROM messages WHERE ${scope} AND thread_id IS NOT NULL GROUP BY thread_id
     ${having.length ? `HAVING ${having.join(" AND ")}` : ""} ORDER BY ${view === "later" && !q ? "snooze ASC" : "last DESC"} LIMIT ${bind(limit + 1)}`
  )
    .bind(...params)
    .all();
  const hasMore = groups.length > limit;
  const page = groups.slice(0, limit);
  const threads = await threadsFrom(env, page, where, now);

  // Drafts sit at the top of the stream.
  let drafts = [];
  // (drafts sit at the top of People)
  if (view === "all" && category !== "updates" && !q && !trashSearch && !address && !before) {
    const { results } = await env.DB.prepare(`SELECT * FROM messages WHERE folder = 'drafts' ORDER BY date DESC LIMIT 20`).all();
    drafts = results.map(rowToSummary);
  }
  return { threads, drafts, hasMore };
}

// Mark All as Read: every conversation in a list (list: its view, category, address and search, as listThreads is asked),
// not only the pages of it loaded so far
export async function readAll(env, list) {
  const params = [];
  const sp = new URLSearchParams(Object.entries(list || {}).filter(([k, v]) => ["view", "category", "address", "q"].includes(k) && typeof v === "string" && v));
  const { scope, having } = listFilter(sp, binder(params), Date.now());
  await env.DB.prepare(
    `UPDATE messages SET unread = 0 WHERE unread = 1 AND thread_id IN (SELECT thread_id FROM messages WHERE ${scope} AND thread_id IS NOT NULL
     GROUP BY thread_id ${having.length ? `HAVING ${having.join(" AND ")}` : ""})`
  )
    .bind(...params)
    .run();
}

// Each conversation as the list shows it: its latest message, who's in it (newest first), and its state.
async function threadsFrom(env, groups, where, now) {
  if (!groups.length) return [];
  const ids = groups.map((g) => g.thread_id);
  const ph = ids.map((_, i) => `?${i + 1}`).join(",");
  const { results: rows } = await env.DB.prepare(
    `SELECT * FROM messages WHERE thread_id IN (${ph}) AND ${where} ORDER BY date DESC`
  )
    .bind(...ids)
    .all();
  const byThread = new Map();
  for (const r of rows) {
    if (!byThread.has(r.thread_id)) byThread.set(r.thread_id, []);
    byThread.get(r.thread_id).push(r);
  }
  return groups.map((g) => {
    const msgs = byThread.get(g.thread_id) || [];
    const latest = msgs[0];
    const incoming = msgs.find((m) => m.folder !== "sent") || latest;
    const people = [];
    for (const m of msgs) {
      const who = m.folder === "sent" ? { name: "You", email: m.from_email, me: true } : { name: m.from_name, email: m.from_email };
      if (!people.some((p) => p.email === who.email && !!p.me === !!who.me)) people.push(who);
    }
    return {
      id: g.thread_id,
      subject: cleanSubject(latest?.subject) || "(No Subject)",
      latest: latest ? rowToSummary(latest) : null,
      from: incoming ? { name: incoming.from_name || "", email: incoming.from_email || "" } : null,
      people,
      count: g.n,
      unread: g.unread || 0,
      starred: !!g.starred,
      hasAttachments: !!g.atts,
      category: g.category || "people",
      done: !g.inbox,
      trashed: latest?.folder === "trash",
      snoozeUntil: g.snooze > now ? g.snooze : null,
      mailbox: incoming?.mailbox || null,
      // (the sender says how to stop: Unsubscribe can be offered)
      canUnsub: !!msgs.find((m) => m.folder !== "sent" && m.unsub),
      date: g.latest ?? g.last,
      sort: g.last,
    };
  });
}

export async function getThread(env, id) {
  let { results } = await env.DB.prepare(
    `SELECT * FROM messages WHERE thread_id = ?1 AND folder NOT IN ('trash', 'drafts') ORDER BY date DESC`
  )
    .bind(id)
    .all();
  // (a conversation that's all in the trash is shown from there)
  if (!results.length) {
    ({ results } = await env.DB.prepare(`SELECT * FROM messages WHERE thread_id = ?1 AND folder = 'trash' ORDER BY date DESC`)
      .bind(id)
      .all());
  }
  if (!results.length) return null;
  const [t] = await threadsFrom(
    env,
    [
      {
        thread_id: id,
        last: results[0].date,
        latest: results[0].date,
        n: results.length,
        unread: results.filter((r) => r.folder === "inbox" && r.unread).length,
        starred: results.some((r) => r.starred) ? 1 : 0,
        atts: results.some((r) => r.has_attachments) ? 1 : 0,
        inbox: results.filter((r) => r.folder === "inbox").length,
        category: results.some((r) => (r.category || "people") === "people") ? "people" : "updates",
        snooze: Math.max(0, ...results.map((r) => r.snooze_until || 0)),
      },
    ],
    results[0].folder === "trash" ? `folder = 'trash'` : `folder NOT IN ('trash', 'drafts')`,
    Date.now()
  );
  return { ...t, messages: results.map(rowToSummary) };
}

// What can be done to a whole conversation.
export async function threadAction(env, id, body, deleteMessages) {
  const D = env.DB;
  const latestIncoming = () =>
    D.prepare(
      `SELECT * FROM messages WHERE thread_id = ?1 AND folder IN ('inbox', 'archive') ORDER BY date DESC LIMIT 1`
    )
      .bind(id)
      .first();
  switch (body.action) {
    case "done":
      await D.prepare(`UPDATE messages SET folder = 'archive', snooze_until = NULL WHERE thread_id = ?1 AND folder = 'inbox'`).bind(id).run();
      break;
    case "inbox":
      await D.prepare(`UPDATE messages SET folder = 'inbox' WHERE thread_id = ?1 AND folder = 'archive'`).bind(id).run();
      break;
    case "read":
      await D.prepare(`UPDATE messages SET unread = 0 WHERE thread_id = ?1`).bind(id).run();
      break;
    case "unread": {
      const m = await latestIncoming();
      if (m) await D.prepare(`UPDATE messages SET unread = 1 WHERE id = ?1`).bind(m.id).run();
      break;
    }
    case "flag": {
      const m = await D.prepare(`SELECT id FROM messages WHERE thread_id = ?1 AND folder != 'drafts' ORDER BY date DESC LIMIT 1`).bind(id).first();
      if (m) await D.prepare(`UPDATE messages SET starred = 1 WHERE id = ?1`).bind(m.id).run();
      break;
    }
    // Later: out of the stream until a time (from Done too: it comes back then)
    case "snooze": {
      const until = Number(body.until);
      if (!Number.isFinite(until) || until <= Date.now()) {
        const err = new Error("Choose a time in the future.");
        err.status = 400;
        throw err;
      }
      const inbox = await D.prepare(`SELECT COUNT(*) AS n FROM messages WHERE thread_id = ?1 AND folder = 'inbox'`).bind(id).first();
      if (!inbox?.n) await D.prepare(`UPDATE messages SET folder = 'inbox' WHERE thread_id = ?1 AND folder = 'archive'`).bind(id).run();
      await D.prepare(`UPDATE messages SET snooze_until = ?2 WHERE thread_id = ?1 AND folder = 'inbox'`).bind(id, until).run();
      break;
    }
    case "unsnooze":
      await D.prepare(`UPDATE messages SET snooze_until = NULL WHERE thread_id = ?1`).bind(id).run();
      break;
    case "unflag":
      await D.prepare(`UPDATE messages SET starred = 0 WHERE thread_id = ?1`).bind(id).run();
      break;
    case "trash":
      await D.prepare(
        `UPDATE messages SET prev_folder = folder, folder = 'trash', snooze_until = NULL, trashed_at = ?2
         WHERE thread_id = ?1 AND folder NOT IN ('trash', 'drafts')`
      )
        .bind(id, Date.now())
        .run();
      break;
    case "restore":
      await D.prepare(
        `UPDATE messages SET folder = COALESCE(prev_folder, 'inbox'), prev_folder = NULL, trashed_at = NULL WHERE thread_id = ?1 AND folder = 'trash'`
      )
        .bind(id)
        .run();
      break;
    case "delete": {
      const { results } = await D.prepare(`SELECT id FROM messages WHERE thread_id = ?1 AND folder != 'drafts'`).bind(id).all();
      if (results.length) await deleteMessages(env, results.map((r) => r.id));
      break;
    }
    case "category": {
      const category = body.category === "updates" ? "updates" : "people";
      await D.prepare(`UPDATE messages SET category = ?2 WHERE thread_id = ?1`).bind(id, category).run();
      // ("Always": every message from this sender, now and to come)
      if (body.sender) {
        const m = await latestIncoming();
        const sender = (m?.from_email || "").toLowerCase();
        if (sender) {
          await D.batch([
            D.prepare(`INSERT INTO sender_rules (email, category) VALUES (?1, ?2) ON CONFLICT(email) DO UPDATE SET category = ?2`).bind(sender, category),
            D.prepare(`UPDATE messages SET category = ?2 WHERE lower(from_email) = ?1`).bind(sender, category),
          ]);
        }
      }
      break;
    }
    default: {
      const err = new Error("Unknown action");
      err.status = 400;
      throw err;
    }
  }
}

// Figures for the chips: conversations in the stream and unread, for People and Updates; flagged; each address that
// has had mail, with its unread. Added up here, of the conversations in the stream alone (found by their index), rather
// than every conversation there's ever been sent back to be counted: Done keeps them all, and this is asked after
// every change.
export async function counts(env) {
  const now = Date.now();
  const D = env.DB;
  const stream = `SELECT ${AGG} FROM messages WHERE folder NOT IN ('trash', 'drafts') AND thread_id IN (SELECT thread_id FROM messages WHERE folder = 'inbox')
    GROUP BY thread_id`;
  const [sums, later, ups, flagged, trash, drafts, addresses] = await D.batch([
    D.prepare(
      `SELECT SUM(snooze > ?1) AS snoozed,
         SUM(snooze <= ?1 AND category != 'updates') AS people, SUM(snooze <= ?1 AND category != 'updates' AND unread > 0) AS peopleUnread,
         SUM(snooze <= ?1 AND category = 'updates') AS updates, SUM(snooze <= ?1 AND category = 'updates' AND unread > 0) AS updatesUnread
       FROM (${stream})`
    ).bind(now),
    // (for the caught-up screen: the next conversation back from Later, and the newest Updates, whose senders it names)
    D.prepare(`SELECT thread_id, snooze FROM (${stream}) WHERE snooze > ?1 ORDER BY snooze LIMIT 1`).bind(now),
    D.prepare(`SELECT thread_id FROM (${stream}) WHERE snooze <= ?1 AND category = 'updates' ORDER BY last DESC LIMIT 4`).bind(now),
    D.prepare(`SELECT COUNT(DISTINCT thread_id) AS n FROM messages WHERE starred = 1 AND folder NOT IN ('trash', 'drafts')`),
    D.prepare(`SELECT COUNT(DISTINCT thread_id) AS n FROM messages WHERE folder = 'trash'`),
    D.prepare(`SELECT COUNT(*) AS n FROM messages WHERE folder = 'drafts'`),
    D.prepare(
      `SELECT lower(mailbox) AS address, COUNT(*) AS n, SUM(folder = 'inbox' AND unread = 1) AS unread FROM messages
       WHERE folder IN ('inbox', 'archive') AND mailbox LIKE ?1 GROUP BY lower(mailbox) ORDER BY n DESC LIMIT 12`
    ).bind(`%@${env.DOMAIN}`),
  ]);
  const n = sums.results[0] || {};
  const out = {
    people: { threads: n.people || 0, unread: n.peopleUnread || 0 },
    updates: { threads: n.updates || 0, unread: n.updatesUnread || 0 },
    flagged: flagged.results[0]?.n || 0,
    snoozed: n.snoozed || 0,
    trash: trash.results[0]?.n || 0,
    drafts: drafts.results[0]?.n || 0,
    addresses: addresses.results.map((a) => ({ address: a.address, unread: a.unread || 0 })),
  };

  const next = later.results[0];
  const ids = [...(next ? [next.thread_id] : []), ...ups.results.map((r) => r.thread_id)];
  if (ids.length) {
    const { results: latest } = await D.prepare(
      `SELECT thread_id, from_name, from_email, subject, date FROM messages WHERE thread_id IN (${ids.map((_, i) => `?${i + 1}`).join(",")})
       AND folder = 'inbox' ORDER BY date DESC`
    )
      .bind(...ids)
      .all();
    const first = (id) => latest.find((m) => m.thread_id === id);
    const who = (m) => (m ? { name: m.from_name || "", email: m.from_email } : null);
    if (next) {
      const m = first(next.thread_id);
      out.nextLater = { id: next.thread_id, at: next.snooze, from: who(m), subject: cleanSubject(m?.subject) || "(No Subject)" };
    }
    out.updatesFrom = ups.results.map((r) => who(first(r.thread_id))).filter(Boolean);
  }
  // (the Home Screen badge and the title: unread conversations in People)
  out.inbox = { unread: out.people.unread };
  return out;
}

// Conversations whose Later time has come: back at the top, unread. → their ids and subjects (for a notice)
export async function wakeSnoozed(env) {
  const now = Date.now();
  const { results } = await env.DB.prepare(
    `SELECT thread_id, MAX(snooze_until) AS at FROM messages WHERE snooze_until IS NOT NULL AND snooze_until <= ?1 GROUP BY thread_id`
  )
    .bind(now)
    .all();
  if (!results.length) return [];
  const woken = [];
  for (const r of results) {
    const latest = await env.DB.prepare(
      `SELECT id, subject, from_name, from_email FROM messages WHERE thread_id = ?1 AND folder = 'inbox' ORDER BY date DESC LIMIT 1`
    )
      .bind(r.thread_id)
      .first();
    await env.DB.batch([
      env.DB.prepare(`UPDATE messages SET snooze_until = NULL, bumped_at = ?2 WHERE thread_id = ?1 AND snooze_until IS NOT NULL`).bind(r.thread_id, r.at),
      ...(latest ? [env.DB.prepare(`UPDATE messages SET unread = 1 WHERE id = ?1`).bind(latest.id)] : []),
    ]);
    if (latest) woken.push({ threadId: r.thread_id, subject: cleanSubject(latest.subject) || "(No Subject)", from: latest.from_name || latest.from_email });
  }
  await bumpVersion(env);
  return woken;
}

// Unsubscribe: how often you open a sender's mail, and how they say to stop
export async function unsubInfo(env, threadId) {
  const m = await env.DB.prepare(
    `SELECT from_email, from_name, unsub, unsub_post, mailbox FROM messages WHERE thread_id = ?1 AND unsub IS NOT NULL ORDER BY date DESC LIMIT 1`
  )
    .bind(threadId)
    .first();
  if (!m) return null;
  const { results } = await env.DB.prepare(`SELECT unread FROM messages WHERE from_email = ?1 AND folder != 'drafts' ORDER BY date DESC LIMIT 12`)
    .bind(m.from_email)
    .all();
  const links = [...m.unsub.matchAll(/<([^>]+)>/g)].map((x) => x[1].trim());
  return {
    sender: { name: m.from_name || "", email: m.from_email },
    opened: results.filter((r) => !r.unread).length,
    of: results.length,
    https: links.find((l) => /^https:\/\//i.test(l)) || null,
    mailto: links.find((l) => /^mailto:/i.test(l)) || null,
    oneClick: !!m.unsub_post,
    mailbox: m.mailbox,
  };
}
