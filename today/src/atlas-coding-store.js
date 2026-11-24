import { AtlasStoreError, getConversation } from './atlas-store.js';

const ACTIVE = new Set(['preparing', 'running', 'waiting', 'uncertain', 'publishing']);
const encode = new TextEncoder();
const parse = (text, fallback) => { try { return JSON.parse(text); } catch { return fallback; } };
const missing = () => { throw new AtlasStoreError('not_found', 'This coding task is unavailable.', 404); };
const fail = message => { throw new AtlasStoreError('coding_state_invalid', message, 409); };
const checkId = value => { if (typeof value !== 'string' || !/^[a-zA-Z0-9._:-]{1,256}$/.test(value)) fail('Invalid coding task identifier.'); return value; };
const query = (env, sql, ...args) => env.ATLAS_DB.prepare(sql).bind(...args);
const json = (value, max = 900000) => { const text = JSON.stringify(value); if (encode.encode(text).byteLength > max) fail('The coding result exceeds its storage allowance.'); return text; };
const list = async statement => { const result = await statement.all(); if (result.success === false) fail('Atlas could not read the coding task.'); return result.results || []; };
const checked = async statement => { const result = await statement.run(); if (result.success === false) fail('Atlas could not save the coding task.'); return result; };

export async function codingStorageStatus(env) {
  if (!env?.ATLAS_DB) return { ready: false, storageReady: false, message: 'Atlas storage is not configured.' };
  try {
    const tables = await list(query(env, "SELECT name FROM sqlite_schema WHERE type='table' AND name IN ('atlas_coding_runs','atlas_coding_changes')"));
    const version = await query(env, 'SELECT version FROM atlas_schema WHERE id=1').first();
    const ready = tables.length === 2 && version?.version >= 7;
    return { ready, storageReady: ready, message: ready ? 'Hosted coding tasks use your saved OpenAI connection.' : 'Upgrade Atlas storage to enable coding workspaces.', budgetUsd: 2 };
  } catch { return { ready: false, storageReady: false, message: 'Upgrade Atlas storage to enable coding workspaces.', budgetUsd: 2 }; }
}

function row(value) {
  if (!value) return null;
  return { ...value, manifest: parse(value.manifest_json, {}), priorTurns: parse(value.prior_turns_json, []), checks: parse(value.checks_json, []), activity: parse(value.activity_json, []), changes: parse(value.changes_json, { added: 0, modified: 0, deleted: 0 }) };
}

export function publicCodingRun(run) {
  if (!run) return null;
  return {
    id: run.id, conversationId: run.conversation_id, requestId: run.request_id,
    repository: run.repository, baseBranch: run.base_branch, baseSha: run.base_sha,
    prompt: run.prompt, model: run.model, status: run.status, stage: run.stage,
    revision: run.revision, summary: run.summary,
    checks: run.checks.map(({ command, cwd, status, exitCode, durationMs, outcome, source, output, outputTruncated, truncated }) => ({ command, cwd, status, exitCode, durationMs, outcome, source, output, outputTruncated, truncated })),
    activity: run.activity.map(({ type, label, detail, status, source, truncated }) => ({ type, label, detail, status, source, truncated })),
    changes: run.changes,
    createdAt: run.created_at, updatedAt: run.updated_at, finishedAt: run.finished_at,
    canContinue: !!run.can_continue && !ACTIVE.has(run.status) && !run.publish_url,
    reviewReady: !!run.review_ready && !!(run.changes.added + run.changes.modified + run.changes.deleted),
    budgetUsd: run.budget_cents / 100,
    providerRecordedSpendUsd: Number.isInteger(run.consumed_after) ? Math.max(0, run.consumed_after - run.consumed_before) / 100 : null,
    ...(run.error_code ? { error: { code: run.error_code, message: run.error_message || 'The coding task needs attention.' } } : {}),
    ...(run.publish_url ? { pullRequest: { url: run.publish_url, number: run.publish_number } } : {}),
  };
}

export async function getCodingRun(env, owner, id) {
  return row(await query(env, 'SELECT * FROM atlas_coding_runs WHERE owner=? AND id=?', owner, checkId(id)).first());
}

export async function requireCodingRun(env, owner, id) {
  const value = await getCodingRun(env, owner, id); if (!value) missing(); return value;
}

export async function codingRunByRequest(env, owner, requestId) {
  return row(await query(env, 'SELECT * FROM atlas_coding_runs WHERE owner=? AND request_id=?', owner, checkId(requestId)).first());
}

export async function listCodingRuns(env, owner, conversationId) {
  if (!await getConversation(env, owner, conversationId)) missing();
  return (await list(query(env, 'SELECT * FROM atlas_coding_runs WHERE owner=? AND conversation_id=? ORDER BY created_at DESC,id DESC LIMIT 50', owner, conversationId))).map(row);
}

export async function ownerCodingRuns(env, owner, conversationId = null) {
  const result = await list(query(env, "SELECT * FROM atlas_coding_runs WHERE owner=? AND (session_id IS NOT NULL OR input_file_id IS NOT NULL OR status IN ('preparing','running','waiting','uncertain'))" + (conversationId ? ' AND conversation_id=?' : '') + ' ORDER BY created_at DESC LIMIT 501', owner, ...(conversationId ? [conversationId] : [])));
  if (result.length > 500) throw new AtlasStoreError('coding_cleanup_limit', 'There are too many workspaces to close in one request. Close older task conversations first.', 409);
  return result.map(row);
}

export async function createCodingRun(env, owner, { id, conversationId, requestId, prompt, model, credentialUpdatedAt, repository }) {
  for (const value of [id, requestId]) checkId(value);
  const conversation = await getConversation(env, owner, conversationId);
  if (!conversation) missing();
  if (conversation.archived) throw new AtlasStoreError('conversation_archived', 'Restore this conversation before starting a task.', 409);
  if (conversation.mode !== 'developer' || conversation.repository !== repository) fail('Choose a repository in a Developer conversation.');
  const now = Date.now();
  try {
    const value = await query(env, "INSERT INTO atlas_coding_runs(owner,id,conversation_id,request_id,prompt,model,credential_updated_at,repository,input_key,created_at,updated_at) SELECT ?,?,?,?,?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM atlas_coding_runs WHERE owner=? AND conversation_id=?)<50 RETURNING *", owner, id, conversationId, requestId, prompt, model, credentialUpdatedAt, repository, 'atlas-' + requestId, now, now, owner, conversationId).first();
    if (!value) throw new AtlasStoreError('coding_run_limit', 'Start a new conversation to keep working on this repository.', 409);
    return row(value);
  } catch (error) {
    const duplicate = await codingRunByRequest(env, owner, requestId);
    if (duplicate) {
      if (duplicate.conversation_id !== conversationId || duplicate.prompt !== prompt) throw new AtlasStoreError('request_id_reused', 'This task identifier belongs to another request.', 409);
      return duplicate;
    }
    const active = await query(env, "SELECT id FROM atlas_coding_runs WHERE owner=? AND conversation_id=? AND status IN ('preparing','running','waiting','uncertain','publishing')", owner, conversationId).first();
    if (active) throw new AtlasStoreError('coding_run_active', 'A coding task is already active in this conversation. Open it or stop it before starting another.', 409);
    throw error;
  }
}

export async function claimCodingRun(env, owner, id) {
  const lease = crypto.randomUUID(), now = Date.now();
  const claimed = await query(env, 'UPDATE atlas_coding_runs SET lease_id=?,lease_until=? WHERE owner=? AND id=? AND (lease_until IS NULL OR lease_until<?) RETURNING *', lease, now + 120000, owner, checkId(id), now).first();
  return claimed ? { run: row(claimed), lease } : null;
}

const COLUMNS = new Set(['request_id','prompt','model','credential_updated_at','base_branch','base_sha','base_tree_sha','status','stage','phase','revision','manifest_json','session_id','environment_id','input_file_id','turn_id','prior_turns_json','input_key','budget_cents','total_budget_cents','consumed_before','consumed_after','summary','checks_json','activity_json','changes_json','error_code','error_message','review_ready','can_continue','cancel_requested','publish_url','publish_number','finished_at','dispatched_at']);

export async function updateCodingRun(env, owner, id, lease, patch, { cancelGeneration } = {}) {
  const fields = Object.keys(patch);
  if (fields.some(key => !COLUMNS.has(key))) fail('Invalid coding task update.');
  const value = await query(env, 'UPDATE atlas_coding_runs SET ' + [...fields.map(key => key + '=?'), 'updated_at=?'].join(',') + ' WHERE owner=? AND id=? AND lease_id=?' + (cancelGeneration === undefined ? '' : ' AND cancel_generation=?') + ' RETURNING *', ...fields.map(key => patch[key]), Date.now(), owner, id, lease, ...(cancelGeneration === undefined ? [] : [cancelGeneration])).first();
  if (!value) throw new AtlasStoreError('coding_lease_changed', 'This coding task is being updated. Refresh its status.', 409);
  return row(value);
}

export const codingJSON = json;
export async function releaseCodingRun(env, owner, id, lease) {
  await checked(query(env, 'UPDATE atlas_coding_runs SET lease_id=NULL,lease_until=NULL WHERE owner=? AND id=? AND lease_id=?', owner, id, lease));
}

export async function beginCodingPublication(env, owner, run, lease, cancelGeneration) {
  const value = await query(env, "UPDATE atlas_coding_runs SET status='publishing',stage='Creating draft pull request',cancel_requested=0,updated_at=? WHERE owner=? AND id=? AND lease_id=? AND revision=? AND cancel_generation=? AND review_ready=1 AND publish_url IS NULL AND status IN ('completed','failed','cancelled','publishing') RETURNING *", Date.now(), owner, run.id, lease, run.revision, cancelGeneration).first();
  if (!value) throw new AtlasStoreError('coding_publish_cancelled', 'The task changed or was stopped before publication. Review it before trying again.', 409);
  return row(value);
}

export async function requestCodingCancellation(env, owner, id) {
  await requireCodingRun(env, owner, id);
  await checked(query(env, 'UPDATE atlas_coding_runs SET cancel_requested=1,cancel_generation=cancel_generation+1,updated_at=? WHERE owner=? AND id=?', Date.now(), owner, id));
}

export async function saveCodingChanges(env, owner, run, lease, files) {
  if (!Array.isArray(files) || files.length > 512) fail('The coding result contains too many changed files.');
  // A candidate is unavailable for review until every row is durably written.
  await updateCodingRun(env, owner, run.id, lease, { review_ready: 0 });
  await checked(query(env, 'DELETE FROM atlas_coding_changes WHERE owner=? AND run_id=? AND revision=?', owner, run.id, run.revision));
  for (let offset = 0; offset < files.length; offset += 10) {
    const statements = files.slice(offset, offset + 10).map(file => {
      if (encode.encode(file.contentBase64 || '').byteLength > 1400000 || encode.encode(file.diff || '').byteLength > 262144) fail('A changed file exceeds its storage allowance.');
      return query(env, 'INSERT INTO atlas_coding_changes(owner,run_id,revision,path,operation,before_sha,before_mode,after_sha,after_mode,content_base64,binary,diff,diff_truncated,added_lines,removed_lines,bytes) SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM atlas_coding_runs WHERE owner=? AND id=? AND lease_id=? AND revision=?)', owner, run.id, run.revision, file.path, file.operation, file.beforeSha ?? null, file.beforeMode ?? null, file.afterSha ?? null, file.afterMode ?? null, file.contentBase64 ?? null, +!!file.binary, file.diff || '', +!!file.diffTruncated, file.addedLines ?? null, file.removedLines ?? null, file.contentBase64 ? Math.floor(file.contentBase64.length * 3 / 4) - (file.contentBase64.endsWith('==') ? 2 : file.contentBase64.endsWith('=') ? 1 : 0) : 0, owner, run.id, lease, run.revision);
    });
    const result = await env.ATLAS_DB.batch(statements);
    if (result.some(value => value.success === false || value.meta?.changes !== 1)) fail('The coding task changed while saving its files. Refresh its status.');
  }
  const changes = { added: 0, modified: 0, deleted: 0 };
  for (const file of files) changes[{ add: 'added', modify: 'modified', delete: 'deleted' }[file.operation]]++;
  return updateCodingRun(env, owner, run.id, lease, { changes_json: json(changes), review_ready: 1 });
}

function fileRow(file, full = false) {
  return { path: file.path, operation: file.operation, beforeSha: file.before_sha, beforeMode: file.before_mode, afterSha: file.after_sha, afterMode: file.after_mode, bytes: file.bytes, binary: !!file.binary, diffTruncated: !!file.diff_truncated, addedLines: file.added_lines, removedLines: file.removed_lines, ...(full ? { contentBase64: file.content_base64, diff: file.diff } : {}) };
}

export async function codingChanges(env, owner, run, { full = false } = {}) {
  const columns = full ? '*' : 'path,operation,before_sha,before_mode,after_sha,after_mode,bytes,binary,diff_truncated,added_lines,removed_lines';
  return (await list(query(env, 'SELECT ' + columns + ' FROM atlas_coding_changes WHERE owner=? AND run_id=? AND revision=? ORDER BY path LIMIT 512', owner, run.id, run.revision))).map(file => fileRow(file, full));
}

export async function codingFileDiff(env, owner, run, path) {
  if (typeof path !== 'string' || path.length > 500) missing();
  const value = await query(env, 'SELECT * FROM atlas_coding_changes WHERE owner=? AND run_id=? AND revision=? AND path=?', owner, run.id, run.revision, path).first();
  if (!value) missing();
  const file = fileRow(value, true); delete file.contentBase64; return file;
}
