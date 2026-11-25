// Shared activity is a projection of durable Atlas records. Reading it never
// polls a provider, starts a task or copies private answers into the app shell.
const ID = /^[A-Za-z0-9._:-]{1,600}$/;
const text = (value, max) => typeof value === 'string' ? value.slice(0, max) : '';
const route = (section, id) => '/atlas/#' + section + '=' + encodeURIComponent(id);
async function projectionRows(env, sql, ...params) {
  const result = await env.ATLAS_DB.prepare(sql).bind(...params).all();
  if (result?.success === false) throw Object.assign(new Error('Atlas activity is temporarily unavailable.'), { code: 'activity_unavailable', status: 503 });
  return result?.results || [];
}

export async function atlasActivity(env, owner, { limit = 12, schemaVersion = 6 } = {}) {
  const count = Number.isInteger(limit) ? Math.max(1, Math.min(20, limit)) : 12;
  const all = sql => projectionRows(env, sql, owner, count);
  const [runs, briefs, conversations] = await Promise.all([
    schemaVersion >= 7 ? all('SELECT r.id,r.conversation_id,r.status,r.stage,r.updated_at,c.title FROM atlas_coding_runs r JOIN atlas_conversations c ON c.owner=r.owner AND c.id=r.conversation_id WHERE r.owner=? AND c.archived=0 ORDER BY r.updated_at DESC,r.id LIMIT ?') : [],
    all('SELECT b.id,b.conversation_id,b.title,b.created_at FROM atlas_briefs b JOIN atlas_conversations c ON c.owner=b.owner AND c.id=b.conversation_id WHERE b.owner=? AND c.archived=0 ORDER BY b.created_at DESC,b.id LIMIT ?'),
    all('SELECT id,title,updated_at FROM atlas_conversations WHERE owner=? AND archived=0 ORDER BY updated_at DESC,id LIMIT ?'),
  ]);
  const represented = new Set([...runs, ...briefs].map(row => row.conversation_id));
  const items = [
    ...runs.map(r => ({ id: r.id, kind: 'coding', runId: r.id, conversationId: r.conversation_id, title: text(r.title, 160), status: text(r.status, 40), stage: text(r.stage, 120), updatedAt: r.updated_at, href: route('tasks', r.id) })),
    ...briefs.map(b => ({ id: b.id, kind: 'brief', briefId: b.id, conversationId: b.conversation_id, title: text(b.title, 160), status: 'saved', stage: 'Saved brief', updatedAt: b.created_at, href: route('briefs', b.id) })),
    ...conversations.filter(c => !represented.has(c.id)).map(c => ({ id: c.id, kind: 'conversation', conversationId: c.id, title: text(c.title, 160), status: 'saved', stage: 'Conversation', updatedAt: c.updated_at, href: route('conversations', c.id) })),
  ].filter(item => ID.test(item.id) && ID.test(item.conversationId)).sort((a, b) => b.updatedAt - a.updatedAt || a.id.localeCompare(b.id)).slice(0, count);
  return { items, ready: true };
}

const inProgress = "status IN ('queued','preparing','running','waiting','publishing','stopping')";
const needsReview = "(status IN ('waiting','failed','incomplete','uncertain') OR (review_ready=1 AND status<>'published' AND NOT (" + inProgress + ")))";
const runFilters = {
  all: '1', active: inProgress, review: needsReview,
  finished: 'NOT (' + inProgress + ') AND NOT (' + needsReview + ')',
};

export async function atlasRuns(env, owner, { limit = 24, schemaVersion = 6, timeline = false, filter, before = null } = {}) {
  const count = Number.isInteger(limit) ? Math.max(1, Math.min(50, limit)) : 24;
  const workspace = filter !== undefined || before !== null;
  const cursor = before?.match(/^(0|[1-9]\d{0,15}):(answer|background|coding|scheduled):([A-Za-z0-9._:-]{1,600})$/);
  if (!Object.hasOwn(runFilters, filter ?? 'all') || (before !== null && (!cursor || !Number.isSafeInteger(Number(cursor[1]))))) {
    throw Object.assign(new Error('Choose a valid task filter or refresh the task list.'), { code: 'runs_filter_invalid', status: 400 });
  }
  const queries = [`
    SELECT 'answer' AS kind,t.id,t.conversation_id,NULL AS schedule_id,c.title,t.status,0 AS review_ready,
      NULL AS stage,t.updated_at
    FROM atlas_turns t JOIN atlas_conversations c ON c.owner=t.owner AND c.id=t.conversation_id
    WHERE t.owner=? AND c.archived=0
      AND NOT EXISTS(SELECT 1 FROM atlas_schedule_runs s WHERE s.owner=t.owner AND s.request_id=t.id)
      ${timeline ? "AND NOT EXISTS(SELECT 1 FROM atlas_run_events e WHERE e.owner=t.owner AND e.kind='background' AND e.attempt_id=t.id)" : ""}
    `, `
    SELECT 'scheduled',r.id,NULL,s.id,s.title,r.status,0,NULL,COALESCE(r.finished_at,r.started_at)
    FROM atlas_schedule_runs r JOIN atlas_schedules s ON s.owner=r.owner AND s.id=r.task_id
    WHERE r.owner=?
  `];
  if (schemaVersion >= 7) queries.push(`
    SELECT 'coding',r.id,r.conversation_id,NULL,${workspace ? "substr(r.prompt,1,140)" : "c.title"},
      r.status,r.review_ready,r.stage,r.updated_at
    FROM atlas_coding_runs r JOIN atlas_conversations c ON c.owner=r.owner AND c.id=r.conversation_id
    WHERE r.owner=? ${workspace ? "" : "AND c.archived=0"}
  `);
  if (timeline) queries.push(`
    SELECT 'background',r.id,r.conversation_id,NULL,c.title,r.status,0,r.checkpoint,r.updated_at
    FROM atlas_answer_runs r JOIN atlas_conversations c ON c.owner=r.owner AND c.id=r.conversation_id
    WHERE r.owner=? AND (c.archived=0 OR r.status IN ('queued','running','stopping'))
  `);
  const afterCursor = cursor ? 'AND (updated_at<? OR (updated_at=? AND (id,kind)>(?,?)))' : '';
  const params = [...queries.map(() => owner), ...(cursor ? [Number(cursor[1]), Number(cursor[1]), cursor[3], cursor[2]] : []), count + 1];
  const rows = await projectionRows(env, `SELECT * FROM (${queries.join(' UNION ALL ')})
    WHERE (${runFilters[filter ?? 'all']}) ${afterCursor}
    ORDER BY updated_at DESC,id,kind LIMIT ?`, ...params);
  const page = rows.slice(0, count), last = page.at(-1);
  const items = page.filter(row => ID.test(row.id) && ID.test(row.conversation_id || row.schedule_id)).map(row => ({
    kind: row.kind, id: row.id, title: text(row.title, 160).split('\n')[0], status: text(row.status, 40), updatedAt: row.updated_at,
    ...(row.conversation_id ? { conversationId: row.conversation_id } : { scheduleId: row.schedule_id }),
    ...(row.kind === 'coding' ? { reviewReady: row.review_ready === 1 } : {}),
    ...(workspace && row.stage ? { stage: text(row.stage, 120) } : {}),
  }));
  return { items, ...(workspace ? { next: rows.length > count ? last.updated_at + ':' + last.kind + ':' + last.id : null } : {}) };
}

export async function atlasRunAlerts(env, owner, { timeline, now = Date.now() } = {}) {
  if (!timeline) return { alerts: [] };
  const since = now - 7 * 86400000;
  const rows = await projectionRows(env, `
    SELECT * FROM (
      SELECT 'c' AS prefix,r.id,r.revision,r.status,r.updated_at,substr(r.prompt,1,140) AS title
      FROM atlas_coding_runs r JOIN atlas_conversations c ON c.owner=r.owner AND c.id=r.conversation_id
      WHERE r.owner=? AND c.archived=0 AND r.updated_at>=? AND (
        r.status IN ('waiting','failed','uncertain') OR (r.status='completed' AND r.review_ready=1 AND EXISTS(
          SELECT 1 FROM atlas_coding_changes f WHERE f.owner=r.owner AND f.run_id=r.id AND f.revision=r.revision)))
      UNION ALL
      SELECT 'b',r.id,r.revision,r.status,r.updated_at,c.title
      FROM atlas_answer_runs r JOIN atlas_conversations c ON c.owner=r.owner AND c.id=r.conversation_id
      WHERE r.owner=? AND c.archived=0 AND r.updated_at>=? AND r.status IN ('completed','incomplete','failed','uncertain')
      UNION ALL
      SELECT 's',r.id,1,r.status,COALESCE(r.finished_at,r.started_at),s.title
      FROM atlas_schedule_runs r JOIN atlas_schedules s ON s.owner=r.owner AND s.id=r.task_id
      WHERE r.owner=? AND COALESCE(r.finished_at,r.started_at)>=? AND r.status IN ('failed','incomplete','uncertain')
    ) ORDER BY updated_at DESC,prefix,id LIMIT 20`, owner, since, owner, since, owner, since);
  return { alerts: rows.filter(row => /^[A-Za-z0-9_-]{1,38}$/.test(row.id)).map(row => ({
    reference: `${row.prefix}_${row.id}`, revision: row.revision, status: row.status,
    title: text(row.title, 140).split('\n')[0], updatedAt: row.updated_at,
  })) };
}
