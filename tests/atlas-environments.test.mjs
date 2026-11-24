import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import * as store from '../today/src/atlas-store.js';
import * as environments from '../today/src/atlas-environments.js';
import * as coding from '../today/src/atlas-coding-store.js';
import { atlas } from '../today/src/atlas.js';

const repository = 'georgefarrowgreen1/inflite';
const profile = (patch = {}) => ({ name: 'Atlas development', repository, ...patch });
async function fixture(t, { version = 8 } = {}) {
  const mf = new Miniflare(convertV4MiniflareOptions({ modules: true, script: 'export default {fetch(){return new Response("fixture")}}', compatibilityDate: '2026-10-01', cf: false, d1Databases: ['ATLAS_DB'] }));
  t.after(() => mf.dispose());
  const env = { ATLAS_DB: await mf.getD1Database('ATLAS_DB') };
  if (version === 8) await store.upgradeStorage(env);
  else {
    const sql = (await Promise.all(Array.from({ length: version }, (_, i) => readFile(new URL('../atlas/migrations/' + String(i + 1).padStart(4, '0') + '.sql', import.meta.url), 'utf8')))).join('\n');
    await env.ATLAS_DB.batch(sql.split(';').map(value => value.trim()).filter(Boolean).map(value => env.ATLAS_DB.prepare(value)));
  }
  return env;
}

test('schema seven remains usable and explicit cloud upgrade preserves conversations, budgets and existing coding runs', async t => {
  const env = await fixture(t, { version: 7 });
  await store.saveSettings(env, 'alice', { dailyBudgetUsd: 50, dailyRequestLimit: 100 });
  const conversation = await store.createConversation(env, 'alice', { mode: 'developer', repository, title: 'Existing work' });
  const run = await coding.createCodingRun(env, 'alice', { id: crypto.randomUUID(), conversationId: conversation.id, requestId: crypto.randomUUID(), prompt: 'Existing task', model: 'gpt-6.2-sol', credentialUpdatedAt: 42, repository });
  assert.equal((await store.storageStatus(env)).ready, true);
  assert.equal((await coding.codingStorageStatus(env)).ready, true);
  assert.equal((await environments.environmentStorageStatus(env)).ready, false);
  assert.equal((await environments.resolveEnvironment(env, 'alice', { repository })).machine, 'medium');
  await assert.rejects(() => environments.createEnvironment(env, 'alice', profile()), { code: 'environments_storage_upgrade_required' });
  const upgrades = await Promise.all([store.upgradeStorage(env), store.upgradeStorage(env)]);
  assert.ok(upgrades.every(result => result.schemaVersion === 8));
  await store.upgradeStorage(env);
  assert.equal((await environments.environmentStorageStatus(env)).ready, true);
  assert.equal((await store.storageStatus(env)).schemaVersion, 8);
  assert.equal((await store.getSettings(env, 'alice')).dailyBudgetUsd, 50);
  assert.equal((await store.getSettings(env, 'alice')).dailyRequestLimit, 100);
  assert.equal((await store.getConversation(env, 'alice', conversation.id)).title, 'Existing work');
  const persisted = await coding.getCodingRun(env, 'alice', run.id);
  assert.equal(persisted.prompt, 'Existing task');
  assert.equal(persisted.environment_profile_id, null);
  assert.equal(persisted.environment_config_json, '{}');
  assert.equal(persisted.cloud_status, null);
  assert.equal(persisted.cloud_checked_at, null);
  assert.equal(persisted.retry_from_run_id, null);
});

test('partial schema eight is not ready until cloud observation and retry columns are present', async t => {
  const env = await fixture(t, { version: 7 });
  const sql = await readFile(new URL('../atlas/migrations/0008.sql', import.meta.url), 'utf8');
  const initial = sql.split(';').map(value => value.trim()).filter(Boolean).filter(value => !/ADD COLUMN (cloud_status|cloud_checked_at|retry_from_run_id)\b/.test(value));
  await env.ATLAS_DB.batch(initial.map(value => env.ATLAS_DB.prepare(value)));
  assert.equal((await store.storageStatus(env)).schemaVersion, 8);
  assert.equal((await environments.environmentStorageStatus(env)).ready, false);
  const upgraded = await store.upgradeStorage(env);
  assert.equal(upgraded.schemaVersion, 8);
  assert.equal((await environments.environmentStorageStatus(env)).ready, true);
  const columns = await env.ATLAS_DB.prepare('PRAGMA table_info(atlas_coding_runs)').all();
  for (const name of ['environment_profile_id', 'environment_config_json', 'cloud_status', 'cloud_checked_at', 'retry_from_run_id']) assert.equal(columns.results.filter(column => column.name === name).length, 1);
  await store.upgradeStorage(env);
});

test('saved cloud recipes isolate owners and soft archive without changing existing task snapshots', async t => {
  const env = await fixture(t);
  const saved = await environments.createEnvironment(env, 'alice', profile({ branch: 'release/atlas', setupCommand: 'npm ci --ignore-scripts', testCommand: 'npm run test:atlas', machine: 'large', network: 'off' }));
  assert.equal(saved.revision, 1);
  assert.equal(saved.setupCommand, 'npm ci --ignore-scripts');
  assert.equal((await environments.listEnvironments(env, 'alice')).length, 1);
  assert.deepEqual(await environments.listEnvironments(env, 'bob'), []);
  assert.equal(await environments.getEnvironment(env, 'bob', saved.id), null);
  await assert.rejects(() => environments.updateEnvironment(env, 'bob', saved.id, { name: 'Foreign edit' }), { code: 'not_found' });
  await assert.rejects(() => environments.archiveEnvironment(env, 'bob', saved.id), { code: 'not_found' });
  await assert.rejects(() => environments.resolveEnvironment(env, 'bob', { environmentId: saved.id, repository }), { code: 'not_found' });
  await assert.rejects(() => environments.resolveEnvironment(env, 'alice', { environmentId: saved.id, repository: 'owner/other' }), { code: 'environment_repository_mismatch' });
  const snapshot = await environments.resolveEnvironment(env, 'alice', { environmentId: saved.id, repository });
  const conversation = await store.createConversation(env, 'alice', { mode: 'developer', repository });
  const run = await coding.createCodingRun(env, 'alice', { id: crypto.randomUUID(), conversationId: conversation.id, requestId: crypto.randomUUID(), prompt: 'A task', model: 'gpt-6.2-sol', credentialUpdatedAt: 42, repository });
  await env.ATLAS_DB.prepare('UPDATE atlas_coding_runs SET environment_profile_id=?,environment_config_json=? WHERE owner=? AND id=?').bind(saved.id, JSON.stringify(snapshot), 'alice', run.id).run();
  const changed = await environments.updateEnvironment(env, 'alice', saved.id, { name: 'Updated recipe', machine: 'small', expectedRevision: 1 });
  assert.equal(changed.revision, 2);
  assert.deepEqual(await environments.archiveEnvironment(env, 'alice', saved.id), { removed: true });
  assert.deepEqual(await environments.archiveEnvironment(env, 'alice', saved.id), { removed: true });
  assert.deepEqual(await environments.listEnvironments(env, 'alice'), []);
  assert.equal(await environments.getEnvironment(env, 'alice', saved.id), null);
  await assert.rejects(() => environments.resolveEnvironment(env, 'alice', { environmentId: saved.id, repository }), { code: 'not_found' });
  const persisted = await coding.getCodingRun(env, 'alice', run.id);
  assert.equal(persisted.status, 'preparing');
  assert.deepEqual(JSON.parse(persisted.environment_config_json), snapshot);
  const archived = await env.ATLAS_DB.prepare('SELECT archived,name FROM atlas_environments WHERE owner=? AND id=?').bind('alice', saved.id).first();
  assert.equal(archived.archived, 1);
});

test('environment validation rejects URLs, malformed refs, arbitrary network policies and credential fields', async t => {
  const env = await fixture(t);
  for (const branch of ['../main', 'main..next', 'https://github.com/a/b', 'main@{1}', '-main', '.hidden', 'a/.hidden', 'a//b', 'a.lock', 'branch.', '@', 'main\nother']) {
    assert.throws(() => environments.normalizeEnvironmentConfig(profile({ branch })), { code: 'environment_branch_invalid' });
  }
  for (const patch of [{ name: '' }, { name: 'x'.repeat(81) }, { setupCommand: 'x'.repeat(8001) }, { testCommand: 'bad\0command' }]) {
    assert.throws(() => environments.normalizeEnvironmentConfig(profile(patch)), { code: 'environment_invalid' });
  }
  for (const repository of ['https://github.com/owner/repo', '../repo', 'owner/../repo', 'owner/repo/extra']) assert.throws(() => environments.normalizeEnvironmentConfig(profile({ repository })), { code: 'repository_invalid' });
  assert.throws(() => environments.normalizeEnvironmentConfig(profile({ machine: 'unbounded' })), { code: 'environment_machine_invalid' });
  assert.throws(() => environments.normalizeEnvironmentConfig(profile({ network: 'unrestricted' })), { code: 'environment_network_invalid' });
  await assert.rejects(() => environments.createEnvironment(env, 'alice', profile({ secrets: { KEY: 'private' } })), { code: 'environment_invalid' });
  await assert.rejects(() => environments.createEnvironment(env, 'alice', profile({ owner: 'bob' })), { code: 'environment_invalid' });
  const valid = environments.normalizeEnvironmentConfig(profile({ branch: 'feat/a-b_2', setupCommand: 'npm ci\nnpm run build', machine: 'small' }));
  assert.equal(valid.branch, 'feat/a-b_2'); assert.equal(valid.network, 'dependencies');
  assert.equal(environments.defaultEnvironment(repository).id, null);
  assert.equal((await environments.environmentStorageStatus({})).ready, false);
});

test('concurrent profile edits reject stale revisions instead of silently replacing another edit', async t => {
  const env = await fixture(t), saved = await environments.createEnvironment(env, 'alice', profile());
  const outcomes = await Promise.allSettled(['First edit', 'Second edit'].map(name => environments.updateEnvironment(env, 'alice', saved.id, { name, expectedRevision: saved.revision })));
  assert.equal(outcomes.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(outcomes.filter(result => result.status === 'rejected' && result.reason.code === 'environment_changed').length, 1);
  const current = await environments.getEnvironment(env, 'alice', saved.id);
  assert.equal(current.revision, 2);
  await assert.rejects(() => environments.updateEnvironment(env, 'alice', saved.id, { name: 'Late stale overwrite', expectedRevision: 1 }), { code: 'environment_changed' });
  assert.equal((await environments.getEnvironment(env, 'alice', saved.id)).name, current.name);
});

test('profile capacity is atomic, owner scoped and released by archival', async t => {
  const env = await fixture(t);
  const outcomes = await Promise.allSettled(Array.from({ length: 42 }, (_, i) => environments.createEnvironment(env, 'alice', profile({ name: 'Environment ' + i }))));
  assert.equal(outcomes.filter(result => result.status === 'fulfilled').length, 40);
  assert.equal(outcomes.filter(result => result.status === 'rejected' && result.reason.code === 'environment_limit').length, 2);
  await environments.createEnvironment(env, 'bob', profile());
  const existing = await environments.listEnvironments(env, 'alice');
  await environments.archiveEnvironment(env, 'alice', existing[0].id);
  await environments.createEnvironment(env, 'alice', profile({ name: 'Replacement' }));
  assert.equal((await environments.listEnvironments(env, 'alice')).length, 40);
});

test('environment HTTP routes expose readiness, protect ownership and origin, and never execute a saved script', async t => {
  const env = await fixture(t, { version: 7 });
  async function call(path, { method = 'GET', body, owner = 'alice', origin = 'https://inflite.ai', admin = true, cookie = true, fresh = true } = {}) {
    const request = new Request('https://inflite.ai/atlas/api' + path, { method, headers: { ...(cookie ? { Cookie: 'account=abcdefghijklmnopqrstuvwxyz' } : {}), Origin: origin, 'X-Inflite': '1', 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const response = await atlas(request, env, {
      account: async (_env, _request, { path }) => Response.json(path === 'atlas/fresh' ? { fresh, owner } : { signedIn: true, user: { id: owner }, apps: { mail: admin } }),
      send: async () => assert.fail('Saving an environment must not execute a script or call OpenAI'),
    });
    return { status: response.status, value: await response.json() };
  }
  const initial = await call('/environments');
  assert.equal(initial.status, 200); assert.equal(initial.value.ready, false); assert.deepEqual(initial.value.environments, []);
  assert.equal((await call('/health')).value.environments.ready, false);
  assert.equal((await call('/environments', { method: 'POST', body: profile() })).value.code, 'environments_storage_upgrade_required');
  assert.equal((await call('/setup', { method: 'POST', body: { confirm: true }, fresh: false })).status, 403);
  assert.equal((await call('/setup', { method: 'POST', body: { confirm: true } })).value.schemaVersion, 8);
  const created = await call('/environments', { method: 'POST', body: profile({ setupCommand: 'printf ready' }) });
  assert.equal(created.status, 201); const id = created.value.environment.id;
  assert.equal((await call('/environments')).value.environments[0].id, id);
  assert.equal((await call('/health')).value.environments.ready, true);
  assert.equal((await call('/environments/' + id, { owner: 'bob' })).status, 404);
  assert.equal((await call('/environments/' + id, { method: 'PATCH', body: { name: 'Foreign' }, owner: 'bob' })).status, 404);
  assert.equal((await call('/environments/' + id, { method: 'DELETE', owner: 'bob' })).status, 404);
  assert.equal((await call('/environments', { method: 'POST', body: profile(), origin: 'https://foreign.invalid' })).value.code, 'invalid_origin');
  assert.equal((await call('/environments', { cookie: false })).status, 401);
  assert.equal((await call('/environments', { admin: false })).status, 403);
  const edited = await call('/environments/' + id, { method: 'PATCH', body: { machine: 'large', expectedRevision: 1 } });
  assert.equal(edited.value.environment.machine, 'large');
  assert.equal((await call('/environments/' + id, { method: 'DELETE' })).value.removed, true);
  assert.deepEqual((await call('/environments')).value.environments, []);
});
