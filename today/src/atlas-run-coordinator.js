import { AtlasStoreError, cancelRequest, finishMessage, finishRequest, getConversation, getMessage, getRequest } from './atlas-store.js';
import { requestIdentifier, runAtlasPrompt } from './atlas-chat.js';
import { getProvider } from './atlas-provider.js';
import { getWorkspaceContext } from './atlas-workspace-context.js';
import { runTimelineStorage } from './atlas-run-timeline.js';

const EXECUTION_MS = 180000;
const LEASE_MS = EXECUTION_MS + 30000;
const ACTIVE = "('queued','running','stopping')";
const RESUMABLE = new Set(['failed', 'incomplete', 'uncertain']);
const fail = (code, message, status = 409) => { throw new AtlasStoreError(code, message, status); };
const query = (env, sql, ...args) => env.ATLAS_DB.prepare(sql).bind(...args);
const findJob = (env, owner, id) => query(env, 'SELECT * FROM atlas_answer_runs WHERE owner=? AND id=?', owner, id).first();

async function requireJob(env, owner, id) {
  const job = await findJob(env, owner, requestIdentifier(id));
  if (!job) fail('not_found', 'This Atlas run is unavailable.', 404);
  return job;
}

function requireBackground(env) {
  if (!env.ATLAS_VERIFY_KEY) fail('background_unavailable', 'Background runs need the InFlite account verification connection.', 503);
}

function readInput(body, conversation) {
  if (typeof body.prompt !== 'string' || !body.prompt.trim() || body.prompt.length > 12000) {
    fail('prompt_invalid', 'Enter a prompt of up to 12,000 characters.', 400);
  }
  const includeFitness = body.includeFitness === true;
  if (includeFitness && conversation.mode !== 'fitness') {
    fail('fitness_mode_required', 'Choose the Fitness workspace before including a Fitness summary.', 400);
  }
  const context = body.context ?? [];
  if (!Array.isArray(context) || context.length > 6 || (context.length && (conversation.mode !== 'developer' || !conversation.repository))) {
    fail('context_invalid', 'Choose up to six sources from the selected repository.', 400);
  }
  const selections = context.map(source => {
    if (!source || !['file', 'pull', 'job'].includes(source.kind) || source.repository !== conversation.repository) {
      fail('context_invalid', 'The selected sources must belong to this repository.', 400);
    }
    const selection = { kind: source.kind, repository: source.repository };
    for (const key of ['path', 'ref', 'number', 'id']) {
      const value = source[key];
      if (value == null) continue;
      if (!(typeof value === 'string' && value.length <= 4096) && !Number.isSafeInteger(value)) {
        fail('context_invalid', 'Choose a valid repository source.', 400);
      }
      selection[key] = value;
    }
    return selection;
  });
  return JSON.stringify({ prompt: body.prompt.trim(), includeFitness, context: selections });
}

async function checkConversation(env, owner, id) {
  const conversation = await getConversation(env, owner, id);
  if (!conversation || conversation.archived) fail('conversation_unavailable', 'Open an active conversation to run in the background.', 409);
  return conversation;
}

async function verifyBackgroundContext(env, owner, id) {
  const { context } = await getWorkspaceContext(env, owner, id);
  if (context.length) fail('mail_context_interactive_only', 'Use Send in this conversation to include its selected Mail context.', 409);
}

export async function enqueueAtlasAnswer(env, owner, body) {
  requireBackground(env);
  const id = requestIdentifier(body.requestId);
  const conversation = await checkConversation(env, owner, body.conversationId);
  const input = readInput(body, conversation);
  const duplicate = async () => {
    const existing = await findJob(env, owner, id);
    if (existing && (existing.conversation_id !== conversation.id || existing.input_json !== input)) {
      fail('request_id_reused', 'This run identifier belongs to another request.');
    }
    return existing;
  };
  const existing = await duplicate();
  if (existing) return existing;
  await verifyBackgroundContext(env, owner, conversation.id);
  const { updatedAt } = await getProvider(env, owner);
  const now = Date.now();
  const job = await query(env, `
    INSERT INTO atlas_answer_runs(owner,id,conversation_id,request_id,input_json,connection_version,status,checkpoint,available_at,created_at,updated_at)
    SELECT ?,?,?,?,?,?,'queued','queued',?,?,?
    FROM atlas_conversations c WHERE c.owner=? AND c.id=? AND c.archived=0
    ON CONFLICT DO NOTHING RETURNING *
  `, owner, id, conversation.id, crypto.randomUUID(), input, updatedAt, now, now, now, owner, conversation.id).first();
  if (job) return job;
  const repeated = await duplicate();
  if (repeated) return repeated;
  await checkConversation(env, owner, conversation.id);
  fail('run_active', 'A background answer is already active in this conversation. Open it from Recent runs.');
}

export async function stopAtlasAnswer(env, owner, id, { revision }) {
  const job = await requireJob(env, owner, id);
  if (revision !== job.revision) fail('run_changed', 'The run has changed. Refresh its timeline.');
  const saved = await query(env, `
    UPDATE atlas_answer_runs SET status=CASE status WHEN 'queued' THEN 'cancelled' ELSE 'stopping' END,
      checkpoint=CASE status WHEN 'queued' THEN 'stopped' ELSE 'stop_requested' END, updated_at=?
    WHERE owner=? AND id=? AND revision=? AND status IN ('queued','running') RETURNING *
  `, Date.now(), owner, id, job.revision).first();
  const current = saved || await requireJob(env, owner, id);
  if (current.revision !== job.revision) fail('run_changed', 'The run has changed. Refresh its timeline.');
  return current;
}

export async function resumeAtlasAnswer(env, owner, id, body) {
  requireBackground(env);
  if (body.confirm !== true) fail('confirmation_required', 'Review this run and confirm using your Atlas allowance again.');
  const job = await requireJob(env, owner, id);
  if (body.revision !== job.revision || !RESUMABLE.has(job.status)) fail('run_changed', 'The run has changed. Refresh its timeline.');
  await checkConversation(env, owner, job.conversation_id);
  await verifyBackgroundContext(env, owner, job.conversation_id);
  const { updatedAt } = await getProvider(env, owner);
  const message = await getMessage(env, owner, job.request_id);
  const resumeFrom = message?.answer.trim() ? message.id : job.resume_from;
  const now = Date.now();
  const updated = await query(env, `
    UPDATE atlas_answer_runs AS a SET revision=revision+1, request_id=?, resume_from=?, connection_version=?,
      status='queued', checkpoint='resume_queued', error_code=NULL, available_at=?, updated_at=?
    WHERE owner=? AND id=? AND revision=? AND status=?
      AND EXISTS(SELECT 1 FROM atlas_conversations c WHERE c.owner=a.owner AND c.id=a.conversation_id AND archived=0)
      AND NOT EXISTS(SELECT 1 FROM atlas_answer_runs b WHERE b.owner=a.owner AND b.conversation_id=a.conversation_id AND b.status IN ${ACTIVE})
    RETURNING *
  `, crypto.randomUUID(), resumeFrom, updatedAt, now, now, owner, id, job.revision, job.status).first();
  if (!updated) fail('run_changed', 'The run or conversation has changed. Refresh its timeline.');
  return updated;
}

async function settleJob(env, job, status, checkpoint, errorCode, now) {
  return query(env, 'UPDATE atlas_answer_runs SET status=?,checkpoint=?,error_code=?,lease_token=NULL,lease_until=NULL,updated_at=? WHERE owner=? AND id=? AND lease_token=? RETURNING *',
    status, checkpoint, errorCode ?? null, now, job.owner, job.id, job.lease_token).first();
}

function recordedOutcome(message, request, fallback) {
  if (message?.status === 'completed') return { status: 'completed', code: null };
  if (request?.status === 'uncertain') return { status: 'uncertain', code: request.error_code };
  if (message && message.status !== 'running') return { status: message.status, code: message.error_code };
  if (['failed', 'incomplete', 'cancelled'].includes(request?.status)) return { status: request.status, code: request.error_code };
  return fallback;
}

async function recoverJob(env, job, now, allowed) {
  // Fence a stale worker before rotating the attempt. A provider dispatch that
  // won the race leaves dispatched=1 and can never be retried automatically.
  const request = await cancelRequest(env, job.owner, job.request_id, { undispatchedOnly: true });
  const message = await getMessage(env, job.owner, job.request_id);
  if (!request.dispatched && job.status !== 'stopping' && allowed && request.error_code === 'request_cancelled') {
    if (message?.status === 'running') await finishMessage(env, job.owner, job.request_id, { status: 'cancelled', errorCode: 'run_interrupted' });
    const requeued = await query(env, "UPDATE atlas_answer_runs SET revision=revision+1,request_id=?,status='queued',checkpoint='requeued',lease_token=NULL,lease_until=NULL,available_at=?,updated_at=? WHERE owner=? AND id=? AND lease_token=? AND status='running' RETURNING id",
      crypto.randomUUID(), now, now, job.owner, job.id, job.lease_token).first();
    if (requeued) return;
  }
  const fallback = request.dispatched
    ? { status: 'uncertain', code: 'run_interrupted' }
    : { status: 'cancelled', code: allowed ? 'request_cancelled' : 'administrator_unavailable' };
  const final = !request.dispatched && !allowed ? fallback : recordedOutcome(message, request, fallback);
  if (message?.status === 'running') {
    await finishMessage(env, job.owner, job.request_id, { answer: message.answer, sources: message.sources, status: final.status, errorCode: final.code });
  }
  if (final.status === 'uncertain') await finishRequest(env, job.owner, job.request_id, { status: final.status, errorCode: final.code });
  await settleJob(env, job, final.status, final.status === 'uncertain' ? 'interrupted' : 'reconciled', final.code, now);
}

async function executeJob(env, candidate, { verifyAdmin, send, clock }) {
  const access = async () => {
    try { return await verifyAdmin(candidate.owner); } catch { return null; }
  };
  const allowed = await access();
  const now = clock();
  if (allowed !== true && allowed !== false) {
    await query(env, 'UPDATE atlas_answer_runs SET available_at=? WHERE owner=? AND id=? AND request_id=? AND (lease_until IS NULL OR lease_until<=?) AND status IN ' + ACTIVE,
      now + 60000, candidate.owner, candidate.id, candidate.request_id, now).run();
    return false;
  }
  if (allowed === false && candidate.status === 'queued') {
    const revoked = await query(env, "UPDATE atlas_answer_runs SET status='cancelled',checkpoint='stopped',error_code='administrator_unavailable',updated_at=? WHERE owner=? AND id=? AND request_id=? AND status='queued' RETURNING id",
      now, candidate.owner, candidate.id, candidate.request_id).first();
    return !!revoked;
  }
  const token = crypto.randomUUID();
  const job = await query(env, `
    UPDATE atlas_answer_runs SET lease_token=?, lease_until=?,
      status=CASE WHEN status='queued' THEN 'running' ELSE status END,
      checkpoint=CASE WHEN status='queued' THEN 'preparing' ELSE checkpoint END, updated_at=?
    WHERE owner=? AND id=? AND request_id=? AND status=? AND available_at<=? AND (lease_until IS NULL OR lease_until<=?)
    RETURNING *
  `, token, now + LEASE_MS, now, candidate.owner, candidate.id, candidate.request_id, candidate.status, now, now).first();
  if (!job) return false;
  if (candidate.status !== 'queued' || allowed === false) {
    await recoverJob(env, job, clock(), allowed);
    return true;
  }
  const guard = "owner=? AND id=? AND lease_token=? AND lease_until>? AND status='running'";
  const lease = () => [job.owner, job.id, token, clock()];
  const beforeDispatch = async () => {
    const allowed = await access();
    if (allowed !== true) fail(allowed === false ? 'administrator_unavailable' : 'account_unavailable', 'InFlite could not authorize this background run.', 503);
    const active = await query(env, "UPDATE atlas_answer_runs SET checkpoint=CASE WHEN checkpoint='draft_saved' THEN checkpoint ELSE 'dispatching' END,updated_at=? WHERE " + guard + ' RETURNING id',
      clock(), ...lease()).first();
    if (!active) fail('request_cancelled', 'The run was stopped or its worker has changed.');
    const connection = await query(env, 'SELECT updated_at FROM atlas_credentials WHERE owner=?', job.owner).first();
    if (connection?.updated_at !== job.connection_version) fail('provider_connection_changed', 'The saved OpenAI connection changed. Review the run before trying again.');
  };
  const onCheckpoint = async () => {
    await query(env, "UPDATE atlas_answer_runs SET checkpoint='draft_saved',updated_at=? WHERE " + guard + " AND checkpoint<>'draft_saved'",
      clock(), ...lease()).run();
  };
  let outcome;
  try {
    const result = await runAtlasPrompt(env, {
      ...JSON.parse(job.input_json), owner: job.owner, conversationId: job.conversation_id,
      requestId: job.request_id, connectionVersion: job.connection_version, resumeFrom: job.resume_from,
      background: true, signal: AbortSignal.timeout(EXECUTION_MS), send, beforeDispatch, onCheckpoint,
    });
    outcome = { status: result.message.status, code: result.message.error_code };
  } catch (error) {
    const [request, message] = await Promise.all([getRequest(env, job.owner, job.request_id), getMessage(env, job.owner, job.request_id)]);
    const code = typeof error?.code === 'string' && /^[a-z][a-z0-9_]{0,95}$/.test(error.code) ? error.code : 'run_failed';
    outcome = recordedOutcome(message, request, { status: code === 'request_cancelled' ? 'cancelled' : 'failed', code });
  }
  const saved = ['completed', 'incomplete'].includes(outcome.status) ? 'saved' : outcome.status;
  await settleJob(env, job, outcome.status, saved, outcome.code, clock());
  return true;
}

// The minute trigger owns manual background answers. The existing ledger
// remains authoritative for allowance, provider dispatch and cancellation.
export async function runDueAtlasAnswers(env, { verifyAdmin, send = fetch, now = Date.now(), limit = 3 } = {}) {
  if (!env.ATLAS_VERIFY_KEY || typeof verifyAdmin !== 'function' || !await runTimelineStorage(env)) return { ran: 0 };
  const started = Date.now(), clock = () => now + Math.max(0, Date.now() - started);
  const count = Number.isInteger(limit) ? Math.max(1, Math.min(5, limit)) : 3;
  const due = await query(env, 'SELECT owner,id,request_id,status FROM atlas_answer_runs WHERE status IN ' + ACTIVE + ' AND available_at<=? AND (lease_until IS NULL OR lease_until<=?) ORDER BY available_at,id LIMIT ?', now, now, count).all();
  const results = await Promise.allSettled((due.results || []).map(job => executeJob(env, job, { verifyAdmin, send, clock })));
  let ran = 0;
  for (const result of results) {
    if (result.status === 'fulfilled') ran += Number(result.value);
    else console.warn(JSON.stringify({ event: 'atlas_background_run_recovery_pending' }));
  }
  return { ran };
}
