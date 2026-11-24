import { runAtlasResearchStep } from './atlas-chat.js';
import { AtlasStoreError, cancelRequest, finishRequest, getRequest, usageSummary } from './atlas-store.js';

export const PARALLEL_RESEARCH = 'parallel_research';
const query = (env, sql, ...args) => env.ATLAS_DB.prepare(sql).bind(...args);
const fail = (code, message, status = 409) => { throw new AtlasStoreError(code, message, status); };
const needsAttention = new Set(['failed', 'incomplete', 'uncertain']);

export async function parallelResearchStorage(env, version) {
  if (!env.ATLAS_DB || version < 11) return false;
  try {
    const row = await query(env, "SELECT version,(SELECT COUNT(*) FROM sqlite_schema WHERE type='table' AND name='atlas_run_subtasks') AS ready FROM atlas_schema WHERE id=1").first();
    return row?.version >= 11 && row.ready === 1;
  } catch { return false; }
}

async function steps(env, owner, id) {
  const result = await query(env, 'SELECT * FROM atlas_run_subtasks WHERE owner=? AND run_id=? ORDER BY step', owner, id).all();
  if (!result.success) fail('subtask_storage_unavailable', 'Atlas could not read the saved subtasks.', 503);
  return result.results;
}

export async function readParallelResearch(env, owner, id) {
  return (await steps(env, owner, id)).map(row => ({
    step: row.step, status: row.status, updatedAt: row.updated_at, errorCode: row.error_code,
    ...(row.status === 'completed' ? { answer: row.answer, sources: JSON.parse(row.sources_json) } : {}),
  }));
}

async function finishStep(env, job, step, patch, now) {
  return query(env, `
    UPDATE atlas_run_subtasks AS s SET status=?,answer=?,sources_json=?,error_code=?,updated_at=?
    WHERE s.owner=? AND s.run_id=? AND s.step=? AND s.request_id=? AND s.status='running'
      AND EXISTS(SELECT 1 FROM atlas_answer_runs r WHERE r.owner=s.owner AND r.id=s.run_id AND r.lease_token=? AND r.lease_until>?)
    RETURNING step
  `, patch.status, patch.answer || '', JSON.stringify(patch.sources || []), patch.code ?? null, now,
  job.owner, job.id, step.step, step.request_id, job.lease_token, now).first();
}

async function executeStep(env, job, step, { prompt, beforeDispatch, signal, send, clock }) {
  const started = clock();
  const claim = await query(env, `
    UPDATE atlas_run_subtasks AS s SET status='running',request_id=?,updated_at=?
    WHERE s.owner=? AND s.run_id=? AND s.step=? AND s.status='queued'
      AND EXISTS(SELECT 1 FROM atlas_answer_runs r WHERE r.owner=s.owner AND r.id=s.run_id AND r.lease_token=? AND r.lease_until>? AND r.status='running')
    RETURNING *
  `, crypto.randomUUID(), started, job.owner, job.id, step.step, job.lease_token, started).first();
  if (!claim) fail('request_cancelled', 'The run was stopped or its worker has changed.');
  let patch;
  try {
    const result = await runAtlasResearchStep(env, {
      owner: job.owner, conversationId: job.conversation_id, connectionVersion: job.connection_version,
      requestId: claim.request_id, step: step.step, prompt, signal, beforeDispatch, send,
    });
    patch = result.status === 'completed' && result.answer.trim()
      ? { status: 'completed', answer: result.answer.slice(0, 12000), sources: result.sources }
      : { status: 'incomplete', code: result.errorCode || 'evidence_incomplete' };
  } catch (error) {
    const ledger = await getRequest(env, job.owner, claim.request_id);
    const code = typeof error?.code === 'string' && /^[a-z][a-z0-9_]{0,95}$/.test(error.code) ? error.code : 'subtask_failed';
    patch = { status: ledger?.status === 'uncertain' ? 'uncertain' : code === 'request_cancelled' ? 'cancelled' : 'failed', code };
  }
  if (!await finishStep(env, job, claim, patch, clock())) fail('request_cancelled', 'The run was stopped or its worker has changed.');
}

export async function executeParallelResearch(env, job, options) {
  const saved = await steps(env, job.owner, job.id);
  if (saved.length !== 2) fail('subtask_storage_unavailable', 'The parallel research plan could not be loaded.', 503);
  const pending = saved.filter(step => step.status === 'queued');
  const usage = await usageSummary(env, job.owner);
  if (usage.limits.dailyRequestLimit - usage.totals.requests < pending.length + 1) {
    fail('daily_request_limit', 'This run needs room for its remaining subtasks and final answer in your Atlas allowance.', 429);
  }
  // Each branch uses the existing atomic usage ledger and independently
  // verifies administrator access immediately before its provider dispatch.
  const outcomes = await Promise.allSettled(pending.map(step => executeStep(env, job, step, options)));
  const failed = outcomes.find(outcome => outcome.status === 'rejected');
  if (failed) throw failed.reason;
  const results = await readParallelResearch(env, job.owner, job.id);
  if (results.some(step => step.status === 'uncertain')) fail('parallel_subtask_uncertain', 'Atlas could not confirm one of the research subtasks.');
  if (results.some(step => step.status === 'cancelled')) fail('request_cancelled', 'The run was stopped.');
  if (results.some(step => step.status !== 'completed')) fail('parallel_evidence_incomplete', 'A research subtask needs attention. Inspect it before retrying.');
  return results;
}

export async function recoverParallelResearch(env, job, now) {
  const saved = await steps(env, job.owner, job.id);
  let attention = saved.some(step => needsAttention.has(step.status));
  for (const step of saved.filter(step => step.status === 'running')) {
    // Fence the old request ID even if reservation had not started. A paid
    // request with no saved evidence requires a new, explicitly approved attempt.
    const ledger = await cancelRequest(env, job.owner, step.request_id, { undispatchedOnly: true });
    const status = ledger.dispatched ? 'uncertain' : job.status === 'stopping' ? 'cancelled' : 'queued';
    if (ledger.dispatched) {
      attention = true;
      await finishRequest(env, job.owner, step.request_id, { status: 'uncertain', errorCode: 'run_interrupted' });
    }
    await finishStep(env, job, step, { status, code: ledger.dispatched ? 'run_interrupted' : null }, now);
  }
  return attention;
}
