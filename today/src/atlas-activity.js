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

export async function atlasRuns(env, owner, { limit = 24, schemaVersion = 6, timeline = false } = {}) {
  const count = Number.isInteger(limit) ? Math.max(1, Math.min(50, limit)) : 24;
  const [answers, coding, scheduled, background] = await Promise.all([
    projectionRows(env, `
      SELECT t.id, t.conversation_id, c.title, t.status, t.updated_at
      FROM atlas_turns t
      JOIN atlas_conversations c ON c.owner=t.owner AND c.id=t.conversation_id
      WHERE t.owner=? AND c.archived=0
        AND t.id NOT IN (SELECT request_id FROM atlas_schedule_runs WHERE owner=?)
        ${timeline ? "AND NOT EXISTS (SELECT 1 FROM atlas_run_events e WHERE e.owner=t.owner AND e.kind='background' AND e.attempt_id=t.id)" : ""}
      ORDER BY t.updated_at DESC,t.id LIMIT ?
    `, owner, owner, count),
    schemaVersion >= 7 ? projectionRows(env, `
      SELECT r.id, r.conversation_id, c.title, r.status, r.review_ready, r.updated_at
      FROM atlas_coding_runs r
      JOIN atlas_conversations c ON c.owner=r.owner AND c.id=r.conversation_id
      WHERE r.owner=? AND c.archived=0
      ORDER BY r.updated_at DESC,r.id LIMIT ?
    `, owner, count) : [],
    projectionRows(env, `
      SELECT r.id, s.id AS schedule_id, s.title, r.status,
        COALESCE(r.finished_at,r.started_at) AS updated_at
      FROM atlas_schedule_runs r
      JOIN atlas_schedules s ON s.owner=r.owner AND s.id=r.task_id
      WHERE r.owner=?
      ORDER BY updated_at DESC,r.id LIMIT ?
    `, owner, count),
    timeline ? projectionRows(env, `
      SELECT r.id, r.conversation_id, c.title, r.status, r.updated_at
      FROM atlas_answer_runs r
      JOIN atlas_conversations c ON c.owner=r.owner AND c.id=r.conversation_id
      WHERE r.owner=? AND (c.archived=0 OR r.status IN ('queued','running','stopping'))
      ORDER BY r.updated_at DESC,r.id LIMIT ?
    `, owner, count) : [],
  ]);
  const entry = (kind, row) => ({
    kind, id: row.id, title: text(row.title, 160), status: text(row.status, 40), updatedAt: row.updated_at,
  });
  const items = [
    ...answers.filter(row => ID.test(row.conversation_id)).map(row => ({ ...entry('answer', row), conversationId: row.conversation_id })),
    ...coding.filter(row => ID.test(row.conversation_id)).map(row => ({ ...entry('coding', row), conversationId: row.conversation_id, reviewReady: row.review_ready === 1 })),
    ...scheduled.filter(row => ID.test(row.schedule_id)).map(row => ({ ...entry('scheduled', row), scheduleId: row.schedule_id })),
    ...background.map(row => ({ ...entry('background', row), conversationId: row.conversation_id })),
  ].filter(item => ID.test(item.id))
    .sort((a, b) => b.updatedAt - a.updatedAt || a.id.localeCompare(b.id) || a.kind.localeCompare(b.kind))
    .slice(0, count);
  return { items };
}
