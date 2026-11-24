import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import * as store from '../today/src/atlas-store.js';
import * as coding from '../today/src/atlas-coding-store.js';

async function fixture(t, { legacy = false } = {}) {
  const mf = new Miniflare(convertV4MiniflareOptions({ modules: true, script: 'export default {fetch(){return new Response("fixture")}}', compatibilityDate: '2026-10-01', cf: false, d1Databases: ['ATLAS_DB'] }));
  t.after(() => mf.dispose());
  const env = { ATLAS_DB: await mf.getD1Database('ATLAS_DB') };
  if (legacy) {
    const sql = (await Promise.all(Array.from({ length: 6 }, (_, i) => readFile(new URL('../atlas/migrations/' + String(i + 1).padStart(4, '0') + '.sql', import.meta.url), 'utf8')))).join('\n');
    await env.ATLAS_DB.batch(sql.split(';').map(value => value.trim()).filter(Boolean).map(value => env.ATLAS_DB.prepare(value)));
  } else await store.upgradeStorage(env);
  return env;
}
const id = () => crypto.randomUUID();
async function create(env, owner = 'alice', conversationId) {
  const conversation = conversationId ? await store.getConversation(env, owner, conversationId) : await store.createConversation(env, owner, { mode: 'developer', repository: 'owner/repo' });
  return coding.createCodingRun(env, owner, { id: id(), conversationId: conversation.id, requestId: id(), prompt: 'Implement a repository task', model: 'gpt-6.2-sol', credentialUpdatedAt: 42, repository: 'owner/repo' });
}

test('coding schema is additive: version six chat remains ready before the explicit upgrade', async t => {
  const env = await fixture(t, { legacy: true });
  assert.equal((await store.storageStatus(env)).ready, true);
  assert.equal((await coding.codingStorageStatus(env)).storageReady, false);
  const conversation = await store.createConversation(env, 'alice', { title: 'Existing chat' });
  await store.upgradeStorage(env);
  assert.equal((await coding.codingStorageStatus(env)).storageReady, true);
  assert.equal((await store.getConversation(env, 'alice', conversation.id)).title, 'Existing chat');
  await store.upgradeStorage(env);
  assert.equal((await store.storageStatus(env)).schemaVersion, 7);
});

test('coding state isolates owners, keeps provider IDs private and permits one active task per conversation', async t => {
  const env = await fixture(t), run = await create(env);
  assert.equal(await coding.getCodingRun(env, 'bob', run.id), null);
  await assert.rejects(() => coding.listCodingRuns(env, 'bob', run.conversation_id), { code: 'not_found' });
  await assert.rejects(() => create(env, 'alice', run.conversation_id), { code: 'coding_run_active' });
  const claim = await coding.claimCodingRun(env, 'alice', run.id);
  const updated = await coding.updateCodingRun(env, 'alice', run.id, claim.lease, { session_id: 'session-private', environment_id: 'environment-private', input_file_id: 'file-private', manifest_json: '{"private":"metadata"}' });
  const text = JSON.stringify(coding.publicCodingRun(updated));
  for (const secret of ['session-private', 'environment-private', 'file-private', 'credential_updated_at', 'manifest_json', 'lease_id']) assert.ok(!text.includes(secret));
  assert.equal(coding.publicCodingRun(updated).budgetUsd, 2);
  assert.equal(await coding.claimCodingRun(env, 'alice', run.id), null);
  await assert.rejects(() => coding.updateCodingRun(env, 'alice', run.id, 'wrong-lease', { status: 'completed' }), { code: 'coding_lease_changed' });
  await coding.releaseCodingRun(env, 'alice', run.id, 'wrong-lease');
  assert.equal(await coding.claimCodingRun(env, 'alice', run.id), null);
  await coding.releaseCodingRun(env, 'alice', run.id, claim.lease);
  assert.ok(await coding.claimCodingRun(env, 'alice', run.id));
});

test('multi-file changes exceed a single D1 row safely, support deletion and stay bound to a revision', async t => {
  const env = await fixture(t), run = await create(env), claim = await coding.claimCodingRun(env, 'alice', run.id);
  const contents = Buffer.from('x'.repeat(400000)).toString('base64');
  const files = Array.from({ length: 6 }, (_, i) => ({ path: 'src/file-' + i + '.js', operation: i === 0 ? 'add' : 'modify', beforeSha: i ? '1'.repeat(40) : null, afterSha: '2'.repeat(40), beforeMode: i ? '100644' : null, afterMode: '100644', contentBase64: contents, diff: '@@ -1 +1 @@\n-before\n+after\n', addedLines: 1, removedLines: 1, binary: false }));
  files.push({ path: 'old.txt', operation: 'delete', beforeSha: '3'.repeat(40), beforeMode: '100644', afterSha: null, afterMode: null, contentBase64: null, diff: '--- a/old.txt\n+++ /dev/null\n@@ -1 +0,0 @@\n-old\n' });
  const saved = await coding.saveCodingChanges(env, 'alice', run, claim.lease, files);
  assert.deepEqual(saved.changes, { added: 1, modified: 5, deleted: 1 });
  const summaries = await coding.codingChanges(env, 'alice', saved);
  assert.equal(summaries.length, 7); assert.equal(summaries[1].bytes, 400000);
  assert.equal(summaries[1].contentBase64, undefined);
  assert.equal((await coding.codingFileDiff(env, 'alice', saved, 'src/file-0.js')).diff, files[0].diff);
  await assert.rejects(() => coding.codingFileDiff(env, 'bob', saved, 'src/file-0.js'), { code: 'not_found' });
  const next = await coding.updateCodingRun(env, 'alice', run.id, claim.lease, { revision: 2, review_ready: 0 });
  assert.deepEqual(await coding.codingChanges(env, 'alice', next), []);
  await assert.rejects(() => coding.saveCodingChanges(env, 'alice', next, claim.lease, [{ ...files[0], contentBase64: 'A'.repeat(1400001) }]), { code: 'coding_state_invalid' });
});

test('remote coding requests survive local stale recovery while ordinary interrupted requests are recovered', async t => {
  const env = await fixture(t), conversation = await store.createConversation(env, 'alice', { mode: 'developer', repository: 'owner/repo' });
  const codingId = id(), chatId = id();
  for (const [requestId, operation] of [[codingId, 'coding'], [chatId, 'chat']]) {
    await store.reserveRequest(env, 'alice', { id: requestId, operation, model: 'gpt-6.2-sol', conversationId: conversation.id, estimatedCostUsd: 2 });
    await store.markRequestDispatched(env, 'alice', requestId);
  }
  await env.ATLAS_DB.prepare('UPDATE atlas_requests SET created_at=1').run();
  await store.recoverStaleRequests(env, 'alice');
  assert.equal((await store.getRequest(env, 'alice', codingId)).status, 'running');
  assert.equal((await store.getRequest(env, 'alice', chatId)).status, 'uncertain');
  await store.finishRequest(env, 'alice', codingId, { status: 'completed', estimatedCostUsd: null });
  await store.saveSettings(env, 'alice', { dailyBudgetUsd: 3 });
  await assert.rejects(() => store.reserveRequest(env, 'alice', { id: id(), operation: 'coding', model: 'gpt-6.2-sol', estimatedCostUsd: 2 }), { code: 'daily_budget_limit' });
});

test('explicit conversation deletion erases coding changes through owner-scoped foreign keys', async t => {
  const env = await fixture(t), run = await create(env), other = await create(env, 'bob');
  const claim = await coding.claimCodingRun(env, 'alice', run.id);
  await coding.saveCodingChanges(env, 'alice', run, claim.lease, [{ path: 'new.txt', operation: 'add', afterSha: '1'.repeat(40), afterMode: '100644', contentBase64: 'eA==', diff: '+x' }]);
  await store.deleteConversation(env, 'alice', run.conversation_id);
  assert.equal(await coding.getCodingRun(env, 'alice', run.id), null);
  assert.ok(await coding.getCodingRun(env, 'bob', other.id));
  assert.equal((await env.ATLAS_DB.prepare('SELECT COUNT(*) AS n FROM atlas_coding_changes').first()).n, 0);
});
