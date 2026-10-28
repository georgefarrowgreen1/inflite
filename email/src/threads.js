import { rowToSummary, bumpVersion } from "./db.js";

// One stream of conversations rather than folders. Later hides a conversation until a time; when it comes it's back at the
// top of the stream, unread (wakeSnoozed, every few minutes by the scheduler, with a notice; until then a conversation
// whose time has passed already shows, as reads treat it as awake). A conversation is in the stream while any of its messages is in the
// inbox; Done moves those to the archive; a new message brings it back. Views narrow the stream (Unread, Flagged,
// Attachments) or show what's been dealt with (Done); People and Updates split it by what sort of mail it is; an
// address lens shows only mail to one @domain address.

export const VIEWS = ["all", "unread", "flagged", "attachments", "later", "done", "trash"];

const cleanSubject = (s) => (s || "").replace(/^((re|fwd?|aw|sv)\s*:\s*)+/i, "").trim();

// Search with operators: from:, to:, has:attachment, is:unread, is:flagged, is:done, before:/after: (YYYY-MM-DD),
// anything else matched against the subject, preview and people.
export function searchCondition(q, bind) {
  const conds = [];
  const tokens = (q.match(/[\w]+:("[^"]*"|\S+)|"[^"]*"|\S+/g) || []).slice(0, 10);
  const like = (v) => bind(`%${v.replace(/^"|"$/g, "").replace(/[%_]/g, "").toLowerCase()}%`);
  for (const t of tokens) {
    const m = t.match(/^(from|to|has|is|before|after):(.+)$/i);
    if (!m) {
      const p = like(t);
      conds.push(`(lower(subject) LIKE ${p} OR lower(snippet) LIKE ${p} OR lower(from_name) LIKE ${p} OR lower(from_email) LIKE ${p} OR lower(to_json) LIKE ${p})`);
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
        conds.push(`(lower(to_json) LIKE ${p} OR lower(cc_json) LIKE ${p} OR lower(mailbox) LIKE ${p})`);
        break;
      }
      case "has":
        if (/^attach/i.test(v)) conds.push(`has_attachments = 1`);
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

export async function listThreads(env, url) {
  const view = VIEWS.includes(url.searchParams.get("view")) ? url.searchParams.get("view") : "all";
  const category = ["people", "updates"].includes(url.searchParams.get("category")) ? url.searchParams.get("category") : null;
  const address = (url.searchParams.get("address") || "").trim().toLowerCase() || null;
  const q = (url.searchParams.get("q") || "").trim();
  const before = Number(url.searchParams.get("before")) || null;
  const limit = Math.max(1, Math.min(Math.floor(Number(url.searchParams.get("limit"))) || 40, 100));
  const now = Date.now();

  const params = [];
  const bind = (v) => {
    params.push(v);
    return `?${params.length}`;
  };
  const inTrash = view === "trash" && !q;
  const where = inTrash ? `folder = 'trash'` : `folder NOT IN ('trash', 'drafts')`;
  const having = [];
  if (q) having.push(`SUM(CASE WHEN ${searchCondition(q, bind)} THEN 1 ELSE 0 END) > 0`);
  else if (view === "all") having.push(`SUM(folder = 'inbox') > 0`, `MAX(COALESCE(snooze_until, 0)) <= ${bind(now)}`);
  else if (view === "unread") having.push(`SUM(folder = 'inbox' AND unread = 1) > 0`, `MAX(COALESCE(snooze_until, 0)) <= ${bind(now)}`);
  else if (view === "flagged") having.push(`MAX(starred) = 1`);
  else if (view === "attachments") having.push(`MAX(has_attachments) = 1`);
  else if (view === "later") having.push(`SUM(folder = 'inbox') > 0`, `MAX(COALESCE(snooze_until, 0)) > ${bind(now)}`);
  else if (view === "done") having.push(`SUM(folder = 'inbox') = 0`);
  if (category && !q && !inTrash) having.push(`MIN(COALESCE(category, 'people')) = ${bind(category)}`);
  if (address) having.push(`SUM(lower(mailbox) = ${bind(address)}) > 0`);
  if (before) having.push(`MAX(MAX(date), MAX(COALESCE(bumped_at, 0))) < ${bind(before)}`);

  const { results: groups } = await env.DB.prepare(
    `SELECT ${AGG} FROM messages WHERE ${where} AND thread_id IS NOT NULL GROUP BY thread_id
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
  if (view === "all" && category !== "updates" && !q && !address && !before) {
    const { results } = await env.DB.prepare(`SELECT * FROM messages WHERE folder = 'drafts' ORDER BY date DESC LIMIT 20`).all();
    drafts = results.map(rowToSummary);
  }
  return { threads, drafts, hasMore };
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
        `UPDATE messages SET prev_folder = folder, folder = 'trash', snooze_until = NULL
         WHERE thread_id = ?1 AND folder NOT IN ('trash', 'drafts')`
      )
        .bind(id)
        .run();
      break;
    case "restore":
      await D.prepare(
        `UPDATE messages SET folder = COALESCE(prev_folder, 'inbox'), prev_folder = NULL WHERE thread_id = ?1 AND folder = 'trash'`
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
// has had mail, with its unread.
export async function counts(env) {
  const now = Date.now();
  const { results } = await env.DB.prepare(
    `SELECT ${AGG} FROM messages WHERE folder NOT IN ('trash', 'drafts') AND thread_id IS NOT NULL GROUP BY thread_id`
  ).all();
  const out = {
    people: { threads: 0, unread: 0 },
    updates: { threads: 0, unread: 0 },
    flagged: 0,
    snoozed: 0,
    done: 0,
  };
  for (const r of results) {
    const c = out[r.category === "updates" ? "updates" : "people"];
    if (r.inbox > 0 && r.snooze > now) out.snoozed++;
    else if (r.inbox > 0) {
      c.threads++;
      if (r.unread) c.unread++;
    } else out.done++;
    if (r.starred) out.flagged++;
  }
  const [trash, drafts, addresses] = await env.DB.batch([
    env.DB.prepare(`SELECT COUNT(DISTINCT thread_id) AS n FROM messages WHERE folder = 'trash'`),
    env.DB.prepare(`SELECT COUNT(*) AS n FROM messages WHERE folder = 'drafts'`),
    env.DB.prepare(
      `SELECT lower(mailbox) AS address, COUNT(*) AS n, SUM(folder = 'inbox' AND unread = 1) AS unread FROM messages
       WHERE folder IN ('inbox', 'archive') AND mailbox LIKE ?1 GROUP BY lower(mailbox) ORDER BY n DESC LIMIT 12`
    ).bind(`%@${env.DOMAIN}`),
  ]);
  out.trash = trash.results[0]?.n || 0;
  out.drafts = drafts.results[0]?.n || 0;
  out.addresses = addresses.results.map((a) => ({ address: a.address, unread: a.unread || 0 }));

  // For the caught-up screen: the next conversation back from Later, and who the newest Updates are from
  const later = results.filter((r) => r.inbox > 0 && r.snooze > now).sort((a, b) => a.snooze - b.snooze)[0];
  const ups = results
    .filter((r) => r.inbox > 0 && r.snooze <= now && r.category === "updates")
    .sort((a, b) => b.last - a.last)
    .slice(0, 4);
  const ids = [...(later ? [later.thread_id] : []), ...ups.map((r) => r.thread_id)];
  if (ids.length) {
    const { results: latest } = await env.DB.prepare(
      `SELECT thread_id, from_name, from_email, subject, date FROM messages WHERE thread_id IN (${ids.map((_, i) => `?${i + 1}`).join(",")})
       AND folder = 'inbox' ORDER BY date DESC`
    )
      .bind(...ids)
      .all();
    const first = (id) => latest.find((m) => m.thread_id === id);
    const who = (m) => (m ? { name: m.from_name || "", email: m.from_email } : null);
    if (later) {
      const m = first(later.thread_id);
      out.nextLater = { id: later.thread_id, at: later.snooze, from: who(m), subject: cleanSubject(m?.subject) || "(No Subject)" };
    }
    out.updatesFrom = ups.map((r) => who(first(r.thread_id))).filter(Boolean);
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
