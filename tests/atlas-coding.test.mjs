import test from 'node:test';
import assert from 'node:assert/strict';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import * as store from '../today/src/atlas-store.js';
import * as state from '../today/src/atlas-coding-store.js';
import * as coding from '../today/src/atlas-coding.js';
import { saveCredential } from '../today/src/atlas-credentials.js';
import { getProvider } from '../today/src/atlas-provider.js';
import { repositoryBlobSha, connectGithub } from '../today/src/atlas-repository.js';
import { atlas } from '../today/src/atlas.js';

const OWNER = 'coding-owner';
const SECRET = 'sk-' + 'coding-fixture'.repeat(5);
const MODEL = 'gpt-6.2-sol';
const REPOSITORY = 'owner/project';
const BASE = 'a'.repeat(40), TREE = 'b'.repeat(40);
const HOSTS = ['registry.npmjs.org', 'pypi.org', 'files.pythonhosted.org', 'cdn.playwright.dev', 'playwright.download.prss.microsoft.com'];
const OUTPUT_PATH = '/workspace/outputs/atlas-changes.json';
const uid = () => crypto.randomUUID();
const textBytes = value => new TextEncoder().encode(value);
const json = value => Response.json(value);
const list = values => ({ object: 'list', data: values, has_more: false, first_id: values[0]?.id ?? null, last_id: values.at(-1)?.id ?? null });

async function fixture(t) {
  const mf = new Miniflare(convertV4MiniflareOptions({ modules: true, script: 'export default {fetch(){return new Response("fixture")}}', compatibilityDate: '2026-10-01', cf: false, d1Databases: ['ATLAS_DB'] }));
  t.after(() => mf.dispose());
  const env = { ATLAS_DB: await mf.getD1Database('ATLAS_DB'), ATLAS_ENCRYPTION_KEY: btoa('c'.repeat(32)) };
  await store.upgradeStorage(env);
  await store.saveSettings(env, OWNER, { dailyRequestLimit: 100, dailyBudgetUsd: 100 });
  await saveCredential(env, OWNER, SECRET, MODEL);
  await connectGithub(env, OWNER, 'github-coding-fixture-token', { send: async () => json({ login: 'fixture' }) });
  return env;
}

async function patchRun(env, id, patch) {
  const claimed = await state.claimCodingRun(env, OWNER, id);
  assert.ok(claimed, 'fixture obtains a lease');
  try { return await state.updateCodingRun(env, OWNER, id, claimed.lease, patch); }
  finally { await state.releaseCodingRun(env, OWNER, id, claimed.lease); }
}

async function newRun(env, patch = {}) {
  const conversation = await store.createConversation(env, OWNER, { title: 'Coding fixture', mode: 'developer', repository: REPOSITORY });
  const requestId = uid();
  const started = await coding.startCodingRun(env, OWNER, { conversationId: conversation.id, requestId, prompt: 'Improve the fixture and run its focused checks.' });
  const before = 'export const value = 1;\n';
  const manifest = { version: 1, runId: started.id, revision: 1, repository: REPOSITORY, baseSha: BASE, baseBranch: 'main', baseTreeSha: TREE, files: [{ path: 'src/value.js', mode: '100644', size: textBytes(before).length, sha: await repositoryBlobSha(textBytes(before)) }], excluded: [] };
  const run = await patchRun(env, started.id, { phase: 'create_ready', base_branch: 'main', base_sha: BASE, base_tree_sha: TREE, manifest_json: JSON.stringify(manifest), input_file_id: 'file_fixture', ...patch });
  return { run, conversation, requestId, before, manifest };
}

function remoteFixture(fixture) {
  const sessionId = 'sess_' + fixture.run.id.replaceAll('-', '');
  const environmentId = 'env_' + fixture.run.id.replaceAll('-', '');
  const remote = {
    calls: [], inputs: [], cancelCalls: 0, createCalls: 0, updateCalls: 0,
    session: { id: sessionId, object: 'agent.session', agent: { model: MODEL }, environment: { type: 'openai_hosted', id: environmentId, network: { access: 'restricted', allowed_domains: HOSTS } }, metadata: { atlas_run_id: fixture.run.id }, review: 'auto_review', spend_control: { limit: 200, consumed: 0 }, status: 'idle', required_actions: [] },
    environment: { id: environmentId, type: 'openai_hosted', status: 'connected' },
    turns: [], items: [], artifacts: [], contents: new Map(), exists: false,
    hiddenRecovery: false, loseCreateResponse: false, loseInputResponse: false, rejectBudgetUpdate: false,
    async send(url, init = {}) {
      const parsed = new URL(url);
      const method = init.method || 'GET';
      assert.equal(parsed.origin, 'https://api.openai.com', 'coding control plane stays on the provider origin');
      assert.equal(new Headers(init.headers).get('authorization'), 'Bearer ' + SECRET);
      const body = typeof init.body === 'string' ? JSON.parse(init.body) : null;
      remote.calls.push({ path: parsed.pathname, method, body, idempotencyKey: new Headers(init.headers).get('Idempotency-Key'), signal: init.signal });
      if (parsed.pathname === '/v1/agents/sessions' && method === 'POST') {
        if (remote.createRejection) { remote.createCalls++; return Response.json({ error: { code: 'permission_denied' } }, { status: remote.createRejection }); }
        remote.createCalls++; remote.exists = true;
        remote.session.metadata = body.metadata;
        remote.session.agent.model = body.agent.model;
        if (remote.onCreate) await remote.onCreate(body);
        if (remote.loseCreateResponse) { remote.loseCreateResponse = false; throw new Error('Lost fixture create response'); }
        return Response.json(remote.session, { status: 201 });
      }
      if (parsed.pathname === '/v1/agents/sessions' && method === 'GET') return json(list(remote.exists && !remote.hiddenRecovery ? [remote.session] : []));
      if (parsed.pathname === '/v1/agents/environments/' + environmentId) return json(remote.environment);
      if (parsed.pathname === '/v1/files/file_fixture' && method === 'DELETE') return json({ id: 'file_fixture', deleted: true });
      if (parsed.pathname === '/v1/agents/sessions/' + sessionId) {
        if (method === 'DELETE') { remote.exists = false; return json({ id: sessionId, deleted: true }); }
        if (method === 'POST') {
          remote.updateCalls++;
          if (remote.rejectBudgetUpdate) throw new Error('Lost fixture budget update response');
          remote.session.spend_control.limit = body.spend_control.limit;
          return json(remote.session);
        }
        return json(remote.session);
      }
      if (parsed.pathname === '/v1/agents/sessions/' + sessionId + '/events') {
        const event = body.events[0];
        if (event.type === 'agent.session.input.cancel') remote.cancelCalls++;
        else if (event.type === 'agent.session.input.message') {
          remote.inputs.push(event);
          const turn = remote.turn('turn_' + remote.inputs.length, 'in_progress');
          remote.turns.push(turn); remote.session.status = 'in_progress';
          if (remote.onInput) await remote.onInput(event, init);
          if (remote.loseInputResponse) { remote.loseInputResponse = false; throw new Error('Lost fixture input response'); }
        } else assert.fail('Unexpected input event');
        return new Response(null, { status: 202 });
      }
      if (parsed.pathname === '/v1/agents/sessions/' + sessionId + '/turns') return json(list([...remote.turns].reverse()));
      if (parsed.pathname.startsWith('/v1/agents/sessions/' + sessionId + '/turns/')) {
        const found = remote.turns.find(turn => turn.id === parsed.pathname.split('/').at(-1));
        return found ? json(remote.turnOverride || found) : Response.json({ error: { code: 'resource_not_found' } }, { status: 404 });
      }
      if (parsed.pathname === '/v1/agents/sessions/' + sessionId + '/items') return json(list([...remote.items].reverse()));
      if (parsed.pathname === '/v1/agents/sessions/' + sessionId + '/artifacts') return json(list([...remote.artifacts].reverse()));
      if (parsed.pathname.endsWith('/content')) {
        const artifactId = parsed.pathname.split('/').at(-2);
        const content = remote.contents.get(artifactId);
        assert.ok(content, 'only the expected artifact can be downloaded');
        return new Response(content);
      }
      assert.fail('Unexpected fixture provider route: ' + parsed.pathname);
    },
    turn(id, status = 'completed', extra = {}) {
      return { id, object: 'agent.session.turn', session_id: sessionId, agent_id: 'agent_fixture', subagent_id: null, status, created_at: 1, started_at: 1, completed_at: status === 'in_progress' ? null : 2, usage: { input_tokens: 40, input_tokens_details: { cached_tokens: 10 }, output_tokens: 10, output_tokens_details: { reasoning_tokens: 2 }, total_tokens: 50 }, error: null, ...extra };
    },
    finish(turnId, revision = 1, { status = 'completed', after = 'export const value = 2;\n', exitCode = 0, artifactRevision = revision } = {}) {
      const turn = remote.turns.find(value => value.id === turnId);
      Object.assign(turn, remote.turn(turnId, status));
      remote.session.status = 'idle'; remote.session.spend_control.consumed = revision * 15;
      remote.items.push(
        { type: 'command_execution', id: 'cmd_' + revision, turn_id: turnId, command: 'node --test tests/fixture.test.mjs', cwd: '/workspace/repo', status: 'completed', exit_code: exitCode, duration_ms: 25, output: exitCode ? 'Focused check failed' : 'Focused check passed' },
        { type: 'message', id: 'msg_' + revision, turn_id: turnId, role: 'assistant', phase: 'final_answer', status: 'completed', content: [{ type: 'output_text', text: 'Implemented fixture revision ' + revision + '.' }] },
      );
      const artifact = { version: 1, runId: fixture.run.id, revision: artifactRevision, repository: REPOSITORY, baseSha: BASE, changes: [{ path: 'src/value.js', operation: 'modify', beforeBase64: btoa(fixture.before), contentBase64: btoa(after), afterMode: '100644' }] };
      const artifactId = 'artifact_' + revision;
      const bytes = textBytes(JSON.stringify(artifact));
      remote.artifacts.push({ id: artifactId, turn_id: turnId, session_id: sessionId, environment_id: environmentId, path: OUTPUT_PATH, size_bytes: bytes.length });
      remote.contents.set(artifactId, bytes);
    },
  };
  return remote;
}

async function seedRemote(env, fixture, remote, { phase = 'observe', status = 'running', turnId = 'turn_1', ...patch } = {}) {
  remote.exists = true;
  if (!(await store.getRequest(env, OWNER, fixture.requestId)).dispatched) await store.markRequestDispatched(env, OWNER, fixture.requestId);
  if (turnId && !remote.turns.some(turn => turn.id === turnId)) remote.turns.push(remote.turn(turnId, 'in_progress'));
  return patchRun(env, fixture.run.id, { session_id: remote.session.id, environment_id: remote.environment.id, input_file_id: null, turn_id: turnId, phase, status, dispatched_at: Date.now(), ...patch });
}

function beforeClaim(env, action, matches = sql => sql.startsWith('UPDATE atlas_coding_runs SET lease_id=')) {
  let done = false;
  const original = env.ATLAS_DB;
  const wrapped = new Proxy(original, { get(target, key) {
    if (key !== 'prepare') { const value = target[key]; return typeof value === 'function' ? value.bind(target) : value; }
    return sql => {
      const statement = original.prepare(sql);
      if (!matches(sql)) return statement;
      const wrap = current => new Proxy(current, { get(item, property) {
        if (property === 'bind') return (...args) => wrap(item.bind(...args));
        if (property === 'first') return async (...args) => { if (!done) { done = true; await action(); } return item.first(...args); };
        const value = item[property]; return typeof value === 'function' ? value.bind(item) : value;
      } });
      return wrap(statement);
    };
  } });
  return { ...env, ATLAS_DB: wrapped };
}

async function route(env, path, { method = 'GET', body, owner = OWNER, signedIn = true, admin = true, fresh = true, signal, send = async () => assert.fail('route must not dispatch'), headers = {} } = {}) {
  const request = new Request('https://inflite.ai/atlas/api' + path, { method, signal, headers: { Cookie: 'account=abcdefghijklmnopqrstuvwxyz', Origin: 'https://inflite.ai', 'X-Inflite': '1', 'Content-Type': 'application/json', ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const response = await atlas(request, env, { send, account: async (_env, _request, { path: accountPath }) => accountPath === 'atlas/fresh' ? json({ fresh, owner }) : json({ signedIn, apps: { mail: admin }, user: { id: owner } }) });
  const value = await response.json();
  assert.ok(!JSON.stringify(value).includes(SECRET), 'public coding responses exclude the saved key');
  return { status: response.status, value, headers: response.headers };
}

test('hosted coding orchestration uses persistent owner-scoped state and real provider evidence', async t => {
  const env = await fixture(t);

  await t.test('create, bootstrap, input and artifact collection remain separate durable phases', async () => {
    const f = await newRun(env), remote = remoteFixture(f);
    const duplicate = await coding.startCodingRun(env, OWNER, { conversationId: f.conversation.id, requestId: f.requestId, prompt: f.run.prompt });
    assert.equal(duplicate.id, f.run.id);
    remote.onCreate = async body => {
      assert.equal(body.input, undefined);
      assert.equal(body.stream, false);
      assert.equal(body.agent.model, MODEL);
      assert.equal(body.spend_control.limit, 200);
      assert.equal(body.environment.files[0].file_id, 'file_fixture');
      assert.match(body.environment.setup_commands[0].command, /bootstrap\.py/);
      assert.ok(!JSON.stringify(body).includes(SECRET));
    };
    await coding.advanceCodingRun(env, OWNER, f.run.id, { send: remote.send });
    assert.equal((await state.requireCodingRun(env, OWNER, f.run.id)).phase, 'environment');
    remote.environment.status = 'provisioning';
    await coding.advanceCodingRun(env, OWNER, f.run.id, { send: remote.send });
    assert.equal(remote.inputs.length, 0);
    remote.environment.status = 'connected';
    await coding.advanceCodingRun(env, OWNER, f.run.id, { send: remote.send });
    assert.equal((await state.requireCodingRun(env, OWNER, f.run.id)).phase, 'submit');
    await coding.advanceCodingRun(env, OWNER, f.run.id, { send: remote.send });
    assert.equal(remote.inputs.length, 1);
    assert.equal(remote.calls.find(call => call.body?.events?.[0]?.type === 'agent.session.input.message').idempotencyKey, f.run.input_key);
    remote.turns.push(remote.turn('sub_turn', 'completed', { subagent_id: 'subagent_fixture' }));
    remote.artifacts.push({ id: 'stale_artifact', turn_id: 'old_turn', session_id: remote.session.id, environment_id: remote.environment.id, path: OUTPUT_PATH, size_bytes: 1 });
    remote.finish('turn_1', 1, { exitCode: 1 });
    const completed = await coding.advanceCodingRun(env, OWNER, f.run.id, { send: remote.send });
    assert.equal(completed.status, 'completed');
    assert.equal(completed.reviewReady, true);
    assert.equal(completed.checks[0].outcome, 'failed', 'a completed turn does not rewrite an actual failed check');
    assert.equal(completed.checks[0].exitCode, 1);
    assert.equal(completed.changes.modified, 1);
    const reviewed = await coding.codingReview(env, OWNER, f.run.id);
    assert.equal(reviewed.files[0].path, 'src/value.js');
    assert.match((await coding.codingDiff(env, OWNER, f.run.id, 'src/value.js')).diff, /value = 2/);
    const ledger = await store.getRequest(env, OWNER, f.requestId);
    assert.equal(ledger.estimated_cost_usd, null, 'unknown total provider/container charges retain the reservation');
    assert.equal(ledger.reserved_cost_usd, 2);
    assert.equal(remote.createCalls, 1);
    assert.equal(remote.calls.some(call => call.path.includes('stale_artifact/content')), false);
  });

  await t.test('lost create responses reconcile metadata and never submit a duplicate session', async () => {
    const f = await newRun(env), remote = remoteFixture(f);
    remote.loseCreateResponse = true; remote.hiddenRecovery = true;
    const first = await coding.advanceCodingRun(env, OWNER, f.run.id, { send: remote.send });
    assert.equal(first.status, 'uncertain');
    await coding.advanceCodingRun(env, OWNER, f.run.id, { send: remote.send });
    assert.equal(remote.createCalls, 1);
    assert.equal(remote.inputs.length, 0);
    remote.hiddenRecovery = false;
    await coding.advanceCodingRun(env, OWNER, f.run.id, { send: remote.send });
    const recovered = await state.requireCodingRun(env, OWNER, f.run.id);
    assert.equal(recovered.session_id, remote.session.id);
    assert.equal(recovered.phase, 'environment');
    assert.equal(remote.createCalls, 1);
  });

  await t.test('a rejected session configuration is terminal and can never later submit input', async () => {
    const f = await newRun(env), remote = remoteFixture(f);
    remote.session.review = 'none';
    const failed = await coding.advanceCodingRun(env, OWNER, f.run.id, { send: remote.send });
    assert.equal(failed.status, 'failed');
    assert.equal(failed.error.code, 'coding_configuration_unavailable');
    await coding.advanceCodingRun(env, OWNER, f.run.id, { send: remote.send });
    await coding.advanceCodingRun(env, OWNER, f.run.id, { send: remote.send });
    assert.equal(remote.inputs.length, 0);
    assert.equal((await state.requireCodingRun(env, OWNER, f.run.id)).phase, 'done');
  });

  await t.test('a confirmed hosted-creation denial is terminal rather than uncertain forever', async () => {
    const f = await newRun(env), remote = remoteFixture(f);
    remote.createRejection = 403;
    const result = await coding.advanceCodingRun(env, OWNER, f.run.id, { send: remote.send });
    assert.equal(result.status, 'failed');
    assert.equal(result.error.code, 'agent_access_unavailable');
    assert.equal((await state.requireCodingRun(env, OWNER, f.run.id)).phase, 'done');
    await coding.advanceCodingRun(env, OWNER, f.run.id, { send: remote.send });
    assert.equal(remote.createCalls, 1);
    assert.equal(remote.inputs.length, 0);
  });

  await t.test('lost input acceptance observes the existing root turn without resending', async () => {
    const f = await newRun(env), remote = remoteFixture(f);
    await seedRemote(env, f, remote, { phase: 'submit', turnId: null });
    remote.loseInputResponse = true;
    assert.equal((await coding.advanceCodingRun(env, OWNER, f.run.id, { send: remote.send })).status, 'uncertain');
    await coding.advanceCodingRun(env, OWNER, f.run.id, { send: remote.send });
    assert.equal(remote.inputs.length, 1);
    assert.equal((await state.requireCodingRun(env, OWNER, f.run.id)).turn_id, 'turn_1');
  });

  await t.test('aborting a browser observer does not abort submitted hosted work', async () => {
    const f = await newRun(env), remote = remoteFixture(f), controller = new AbortController();
    await seedRemote(env, f, remote, { phase: 'submit', turnId: null });
    remote.onInput = async (_event, init) => { controller.abort(); assert.equal(init.signal.aborted, false); };
    const response = await route(env, '/coding/runs/' + f.run.id, { signal: controller.signal, send: remote.send });
    assert.equal(response.status, 200);
    assert.equal(remote.inputs.length, 1);
    assert.equal(remote.cancelCalls, 0);
    assert.equal((await state.requireCodingRun(env, OWNER, f.run.id)).cancel_requested, 0);
  });

  await t.test('cancel acceptance stays pending until the provider turn is terminal', async () => {
    const f = await newRun(env), remote = remoteFixture(f);
    await seedRemote(env, f, remote);
    const stopping = await coding.cancelCodingRun(env, OWNER, f.run.id, { send: remote.send });
    assert.notEqual(stopping.status, 'cancelled');
    await coding.advanceCodingRun(env, OWNER, f.run.id, { send: remote.send });
    assert.notEqual((await state.requireCodingRun(env, OWNER, f.run.id)).status, 'cancelled');
    assert.equal(remote.cancelCalls, 1, 'observation does not loop cancellation submissions');
    remote.turns[0].status = 'cancelled'; remote.session.status = 'idle';
    const stopped = await coding.advanceCodingRun(env, OWNER, f.run.id, { send: remote.send });
    assert.equal(stopped.status, 'cancelled');
    assert.equal((await store.getRequest(env, OWNER, f.requestId)).status, 'cancelled');
  });

  await t.test('cancelling before creation prevents all hosted session/input creation', async () => {
    const f = await newRun(env), remote = remoteFixture(f);
    const cancelled = await coding.cancelCodingRun(env, OWNER, f.run.id, { send: remote.send });
    assert.equal(cancelled.status, 'cancelled');
    assert.equal(remote.createCalls, 0);
    assert.equal(remote.inputs.length, 0);
    await coding.advanceCodingRun(env, OWNER, f.run.id, { send: remote.send });
    assert.equal(remote.createCalls, 0);
  });

  await t.test('Stop persisted just before input dispatch defeats the submission transition', async () => {
    const f = await newRun(env), remote = remoteFixture(f);
    await seedRemote(env, f, remote, { phase: 'submit', turnId: null });
    const raced = beforeClaim(env, async () => state.requestCodingCancellation(env, OWNER, f.run.id), sql => sql.startsWith('UPDATE atlas_coding_runs SET phase=?,status=?,stage=?,dispatched_at=?'));
    await coding.advanceCodingRun(raced, OWNER, f.run.id, { send: remote.send });
    assert.equal(remote.inputs.length, 0, 'a persisted Stop wins over not-yet-dispatched task input');
    assert.equal((await state.requireCodingRun(env, OWNER, f.run.id)).cancel_requested, 1);
  });

  await t.test('a new revision reuses workspace but collects only its new turn and artifact', async () => {
    const f = await newRun(env), remote = remoteFixture(f);
    await seedRemote(env, f, remote);
    remote.finish('turn_1');
    await coding.advanceCodingRun(env, OWNER, f.run.id, { send: remote.send });
    remote.inputs.push({ fixture: 'prior input' });
    const requestId = uid();
    const continued = await coding.continueCodingRun(env, OWNER, f.run.id, { requestId, prompt: 'Make the value three and run the check again.' }, { send: remote.send });
    assert.equal(continued.revision, 2);
    assert.equal(continued.reviewReady, false);
    assert.equal(remote.session.spend_control.limit, 215);
    assert.deepEqual((await coding.codingReview(env, OWNER, f.run.id)).files, []);
    for (let step = 0; step < 3 && remote.inputs.length === 1; step++) await coding.advanceCodingRun(env, OWNER, f.run.id, { send: remote.send });
    assert.equal(remote.inputs.length, 2);
    const taskText = remote.inputs[1].input[0].content[0].text;
    assert.match(taskText, /Keep all prior task edits/);
    assert.match(taskText, /--revision 2/);
    remote.finish('turn_2', 2, { after: 'export const value = 3;\n' });
    const completed = await coding.advanceCodingRun(env, OWNER, f.run.id, { send: remote.send });
    assert.equal(completed.status, 'completed');
    assert.equal(completed.revision, 2);
    assert.equal(completed.summary, 'Implemented fixture revision 2.');
    assert.equal(completed.checks.length, 1);
    assert.equal(completed.checks[0].turnId, undefined, 'provider IDs stay out of public command records');
    assert.equal((await state.requireCodingRun(env, OWNER, f.run.id)).checks[0].turnId, 'turn_2');
    assert.match((await coding.codingDiff(env, OWNER, f.run.id, 'src/value.js')).diff, /value = 3/);
    const duplicate = await coding.continueCodingRun(env, OWNER, f.run.id, { requestId, prompt: 'Make the value three and run the check again.' }, { send: remote.send });
    assert.equal(duplicate.revision, 2);
    assert.equal(remote.updateCalls, 1);
  });

  await t.test('a persisted continuation budget update recovers without raising the budget again', async () => {
    const f = await newRun(env), remote = remoteFixture(f);
    remote.exists = true; remote.session.spend_control = { limit: 215, consumed: 15 };
    remote.turns.push(remote.turn('prior_turn'));
    await patchRun(env, f.run.id, { phase: 'budget_update', revision: 2, session_id: remote.session.id, environment_id: remote.environment.id, total_budget_cents: 215, consumed_before: 15, prior_turns_json: '["prior_turn"]', input_file_id: null });
    await coding.advanceCodingRun(env, OWNER, f.run.id, { send: remote.send });
    assert.equal((await state.requireCodingRun(env, OWNER, f.run.id)).phase, 'submit');
    assert.equal((await store.getRequest(env, OWNER, f.requestId)).dispatched, 1);
    assert.equal(remote.updateCalls, 0);
    assert.equal(remote.inputs.length, 0);
    await coding.advanceCodingRun(env, OWNER, f.run.id, { send: remote.send });
    assert.equal(remote.inputs.length, 1);
    assert.equal(remote.updateCalls, 0);
  });

  await t.test('budget-stopped sessions cannot accidentally resume as a new revision', async () => {
    const f = await newRun(env), remote = remoteFixture(f);
    await seedRemote(env, f, remote, { phase: 'done', status: 'failed', can_continue: 1 });
    remote.turns[0].status = 'failed'; remote.session.status = 'budget_reached'; remote.session.spend_control.consumed = 201;
    await assert.rejects(() => coding.continueCodingRun(env, OWNER, f.run.id, { requestId: uid(), prompt: 'Try again.' }, { send: remote.send }), error => /budget|session_busy|not_resumable/.test(error.code));
    assert.equal(remote.updateCalls, 0);
    assert.equal(remote.inputs.length, 0);
    assert.equal((await state.requireCodingRun(env, OWNER, f.run.id)).revision, 1);
  });

  await t.test('an artifact from the wrong revision cannot become reviewable', async () => {
    const f = await newRun(env), remote = remoteFixture(f);
    await seedRemote(env, f, remote, { revision: 2 });
    remote.finish('turn_1', 2, { artifactRevision: 1 });
    const result = await coding.advanceCodingRun(env, OWNER, f.run.id, { send: remote.send });
    assert.equal(result.error.code, 'coding_result_scope');
    assert.equal(result.reviewReady, false);
    assert.deepEqual((await coding.codingReview(env, OWNER, f.run.id)).files, []);
  });

  await t.test('a completed turn waits briefly for publication of its exact artifact', async () => {
    const f = await newRun(env), remote = remoteFixture(f);
    await seedRemote(env, f, remote);
    remote.turns[0].status = 'completed'; remote.session.status = 'idle';
    const collecting = await coding.advanceCodingRun(env, OWNER, f.run.id, { send: remote.send });
    assert.notEqual(collecting.status, 'completed');
    assert.equal((await state.requireCodingRun(env, OWNER, f.run.id)).phase, 'collect');
    remote.finish('turn_1');
    const finished = await coding.advanceCodingRun(env, OWNER, f.run.id, { send: remote.send });
    assert.equal(finished.status, 'completed');
    assert.equal(finished.reviewReady, true);
  });

  await t.test('provider records cannot substitute a turn or artifact from another session', async () => {
    const f = await newRun(env), remote = remoteFixture(f);
    await seedRemote(env, f, remote);
    remote.turnOverride = remote.turn('turn_1', 'completed', { session_id: 'sess_foreign' });
    const wrongTurn = await coding.advanceCodingRun(env, OWNER, f.run.id, { send: remote.send });
    assert.equal(wrongTurn.error.code, 'coding_turn_mismatch');
    assert.equal(wrongTurn.reviewReady, false);
    remote.turnOverride = null; remote.finish('turn_1');
    remote.artifacts[0].environment_id = 'env_foreign';
    const wrongArtifact = await coding.advanceCodingRun(env, OWNER, f.run.id, { send: remote.send });
    assert.equal(wrongArtifact.reviewReady, false);
    assert.equal(remote.calls.some(call => call.path.endsWith('/artifacts/artifact_1/content')), false);
  });

  await t.test('publication rechecks the exact revision after acquiring its lease', async () => {
    const f = await newRun(env, { phase: 'done', status: 'completed', can_continue: 1, review_ready: 1, changes_json: '{"added":0,"modified":1,"deleted":0}' });
    const raced = beforeClaim(env, async () => env.ATLAS_DB.prepare("UPDATE atlas_coding_runs SET revision=2,status='preparing',phase='submit',review_ready=0 WHERE owner=? AND id=?").bind(OWNER, f.run.id).run());
    await assert.rejects(() => coding.publishCodingRun(raced, OWNER, f.run.id, { confirm: true, revision: 1 }, { send: async () => assert.fail('stale review cannot publish') }), { code: 'coding_review_changed' });
    assert.equal((await state.requireCodingRun(env, OWNER, f.run.id)).status, 'preparing', 'stale publication does not terminalize the new revision');
  });

  await t.test('continuation rechecks publication state after acquiring its lease', async () => {
    const f = await newRun(env, { phase: 'done', status: 'completed', can_continue: 1 });
    const raced = beforeClaim(env, async () => env.ATLAS_DB.prepare("UPDATE atlas_coding_runs SET status='published',publish_url='https://github.com/owner/project/pull/1',can_continue=0 WHERE owner=? AND id=?").bind(OWNER, f.run.id).run());
    await assert.rejects(() => coding.continueCodingRun(raced, OWNER, f.run.id, { requestId: uid(), prompt: 'Stale continuation.' }, { send: async () => assert.fail('published work cannot resume') }), { code: 'coding_not_resumable' });
    assert.equal((await state.requireCodingRun(env, OWNER, f.run.id)).status, 'published');
  });

  await t.test('cancellation arriving before the publication lease blocks publication', async () => {
    const f = await newRun(env, { phase: 'done', status: 'completed', can_continue: 1, review_ready: 1, changes_json: '{"added":0,"modified":1,"deleted":0}' });
    const raced = beforeClaim(env, async () => state.requestCodingCancellation(env, OWNER, f.run.id));
    await assert.rejects(() => coding.publishCodingRun(raced, OWNER, f.run.id, { confirm: true, revision: 1 }, { send: async () => assert.fail('cancelled publication cannot dispatch') }), error => /cancel/.test(error.code));
  });

  await t.test('cancellation after lease acquisition also defeats the atomic publication transition', async () => {
    const f = await newRun(env, { phase: 'done', status: 'completed', can_continue: 1, review_ready: 1, changes_json: '{"added":0,"modified":1,"deleted":0}' });
    const raced = beforeClaim(env, async () => state.requestCodingCancellation(env, OWNER, f.run.id), sql => sql.startsWith("UPDATE atlas_coding_runs SET status='publishing'"));
    await assert.rejects(() => coding.publishCodingRun(raced, OWNER, f.run.id, { confirm: true, revision: 1 }, { send: async () => assert.fail('cancelled publication cannot dispatch') }), error => /cancel/.test(error.code));
    const unchanged = await state.requireCodingRun(env, OWNER, f.run.id);
    assert.equal(unchanged.status, 'completed');
    assert.equal(unchanged.cancel_requested, 1);
  });

  await t.test('the public Stop route records cancellation while a publisher holds the lease', async () => {
    const f = await newRun(env, { phase: 'done', status: 'publishing', review_ready: 1, changes_json: '{"added":0,"modified":1,"deleted":0}' });
    const claimed = await state.claimCodingRun(env, OWNER, f.run.id);
    try {
      const result = await route(env, '/coding/runs/' + f.run.id + '/cancel', { method: 'POST', body: {} });
      assert.equal(result.status, 200);
      const stopped = await state.requireCodingRun(env, OWNER, f.run.id);
      assert.equal(stopped.cancel_requested, 1);
      assert.equal(stopped.cancel_generation, 1);
      assert.equal(stopped.lease_id, claimed.lease, 'Stop does not take over the active publisher lease');
    } finally { await state.releaseCodingRun(env, OWNER, f.run.id, claimed.lease); }
  });

  await t.test('owner, same-origin and fresh-identity gates protect coding routes', async () => {
    const f = await newRun(env);
    const denied = await route(env, '/coding/runs/' + f.run.id, { owner: 'other-owner' });
    assert.equal(denied.status, 404);
    assert.equal((await route(env, '/coding/runs/' + f.run.id, { admin: false })).status, 403);
    assert.equal((await route(env, '/coding/runs/' + f.run.id + '/cancel', { method: 'POST', body: {}, headers: { Origin: 'https://other.invalid' } })).status, 403);
    assert.equal((await state.requireCodingRun(env, OWNER, f.run.id)).cancel_requested, 0);
    const staleIdentity = await route(env, '/coding/runs/' + f.run.id + '/publish', { method: 'POST', body: { confirm: true, revision: 1 }, fresh: false });
    assert.equal(staleIdentity.status, 403);
    assert.equal(staleIdentity.value.code, 'identity_confirmation_required');
    assert.match(denied.headers.get('Cache-Control'), /no-store/);
  });

  await t.test('cleanup does not discard credentials while a remote task lease is held', async () => {
    const f = await newRun(env), remote = remoteFixture(f);
    await seedRemote(env, f, remote);
    const claimed = await state.claimCodingRun(env, OWNER, f.run.id);
    try {
      await assert.rejects(() => coding.closeCodingSessions(env, OWNER, { conversationId: f.conversation.id, send: remote.send }), { code: 'coding_cleanup_pending' });
      assert.equal((await getProvider(env, OWNER)).secret, SECRET);
      assert.equal(remote.calls.some(call => call.method === 'DELETE'), false);
    } finally { await state.releaseCodingRun(env, OWNER, f.run.id, claimed.lease); }
  });

  await t.test('background recovery resumes authorized setup and cancels revoked setup before input', async subtest => {
    const isolated = await fixture(subtest);
    const allowed = await newRun(isolated), allowedRemote = remoteFixture(allowed);
    const verified = [];
    const resumed = await coding.reconcileCodingBackground(isolated, { limit: 1, verifyAdmin: async owner => { verified.push(owner); return true; }, send: allowedRemote.send });
    assert.equal(resumed.observed, 1);
    assert.deepEqual(verified, [OWNER]);
    assert.equal(allowedRemote.createCalls, 1);
    assert.equal(allowedRemote.inputs.length, 0);
    await patchRun(isolated, allowed.run.id, { status: 'failed', phase: 'done' });
    const denied = await newRun(isolated), deniedRemote = remoteFixture(denied);
    await coding.reconcileCodingBackground(isolated, { limit: 1, verifyAdmin: async () => false, send: deniedRemote.send });
    assert.equal(deniedRemote.createCalls, 0);
    assert.equal(deniedRemote.inputs.length, 0);
    assert.equal((await state.requireCodingRun(isolated, OWNER, denied.run.id)).status, 'cancelled');
  });
});
