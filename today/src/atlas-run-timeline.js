import { AtlasStoreError } from './atlas-store.js';

const TIMELINE_SCHEMA_VERSION = 10;
const ID = /^[A-Za-z0-9._:-]{1,600}$/;
const query = (env, sql, ...args) => env.ATLAS_DB.prepare(sql).bind(...args);
const resumable = new Set(['incomplete', 'failed', 'uncertain']);
const codingActive = new Set(['preparing', 'running', 'waiting', 'uncertain', 'publishing']);

export async function runTimelineStorage(env, version) {
  if (!env?.ATLAS_DB || (Number.isInteger(version) && version < TIMELINE_SCHEMA_VERSION)) return false;
  try {
    // The version is committed after the tables and triggers.
    const row = await query(env, "SELECT version, (SELECT COUNT(*) FROM sqlite_schema WHERE type='table' AND name IN ('atlas_answer_runs','atlas_run_events')) AS tables FROM atlas_schema WHERE id=1").first();
    return row?.version >= TIMELINE_SCHEMA_VERSION && row.tables === 2;
  } catch { return false; }
}

export function publicAnswerRun(row) {
  return {
    id: row.id,
    kind: 'background',
    conversationId: row.conversation_id,
    messageId: row.request_id,
    status: row.status,
    checkpoint: row.checkpoint,
    revision: row.revision,
    updatedAt: row.updated_at,
  };
}

const snapshotQueries = {
  background: `
    SELECT a.conversation_id, a.request_id, a.revision, a.status, a.checkpoint, a.error_code, a.updated_at, c.title, c.archived,
      LENGTH(COALESCE(t.answer,'')) AS saved_chars, LENGTH(COALESCE(p.answer,'')) AS prior_chars
    FROM atlas_answer_runs a
    JOIN atlas_conversations c ON c.owner=a.owner AND c.id=a.conversation_id
    LEFT JOIN atlas_turns t ON t.owner=a.owner AND t.conversation_id=a.conversation_id AND t.id=a.request_id
    LEFT JOIN atlas_turns p ON p.owner=a.owner AND p.conversation_id=a.conversation_id AND p.id=a.resume_from
    WHERE a.owner=? AND a.id=?
  `,
  coding: `
    SELECT r.conversation_id, r.revision, r.status, r.phase AS checkpoint, r.stage, r.error_code, r.updated_at, r.cancel_requested, r.review_ready, c.title
    FROM atlas_coding_runs r JOIN atlas_conversations c ON c.owner=r.owner AND c.id=r.conversation_id
    WHERE r.owner=? AND r.id=?
  `,
  scheduled: `
    SELECT r.task_id AS schedule_id, r.status, r.status AS checkpoint, r.error_code, r.cancel_requested,
      COALESCE(r.finished_at,r.started_at) AS updated_at, s.title
    FROM atlas_schedule_runs r JOIN atlas_schedules s ON s.owner=r.owner AND s.id=r.task_id
    WHERE r.owner=? AND r.id=?
  `,
};

export async function readAtlasRunTimeline(env, owner, kind, id, { after = 0, limit = 40 } = {}) {
  if (!Object.hasOwn(snapshotQueries, kind) || !ID.test(id)) throw new AtlasStoreError('not_found', 'This Atlas run is unavailable.', 404);
  if (!Number.isSafeInteger(after) || after < 0) throw new AtlasStoreError('invalid_cursor', 'Choose a valid timeline cursor.', 400);
  const size = Number.isInteger(limit) ? Math.min(100, Math.max(1, limit)) : 40;
  const [snapshot, page] = await env.ATLAS_DB.batch([
    query(env, snapshotQueries[kind], owner, id),
    query(env, 'SELECT seq,revision,status,checkpoint,stage,recorded_at FROM atlas_run_events WHERE owner=? AND kind=? AND run_id=? AND seq>? ORDER BY seq LIMIT ?', owner, kind, id, after, size + 1),
  ]);
  if (!snapshot.success || !page.success) throw new AtlasStoreError('timeline_unavailable', 'Atlas could not read the timeline. Try again.', 503);
  const row = snapshot.results?.[0];
  if (!row) throw new AtlasStoreError('not_found', 'This Atlas run is unavailable.', 404);
  const run = {
    id, kind, title: row.title, status: row.status, checkpoint: row.checkpoint, stage: row.stage ?? null,
    revision: row.revision ?? 1, updatedAt: row.updated_at, errorCode: row.error_code ?? null,
    ...(row.conversation_id ? { conversationId: row.conversation_id } : {}),
    ...(kind === 'coding' ? { reviewReady: row.review_ready === 1 } : {}),
    ...(kind === 'scheduled' ? { scheduleId: row.schedule_id } : {}),
    active: kind === 'coding' ? codingActive.has(row.status) : ['queued', 'running', 'stopping'].includes(row.status),
    ...(row.cancel_requested ? { stopRequested: true } : {}),
  };
  if (kind === 'background') {
    Object.assign(run, {
      messageId: row.request_id,
      savedChars: row.saved_chars,
      canStop: ['queued', 'running'].includes(row.status),
      canResume: !!env.ATLAS_VERIFY_KEY && !row.archived && resumable.has(row.status),
      hasDraft: row.saved_chars > 0 || row.prior_chars > 0,
    });
  }
  const events = page.results.slice(0, size).map(event => ({
    seq: event.seq, revision: event.revision, status: event.status, checkpoint: event.checkpoint, stage: event.stage, at: event.recorded_at,
  }));
  return { run, events, nextAfter: events.at(-1)?.seq ?? after, hasMore: page.results.length > size };
}
