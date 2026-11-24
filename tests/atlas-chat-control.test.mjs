import test from 'node:test';
import assert from 'node:assert/strict';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import * as store from '../today/src/atlas-store.js';
import { connectProvider, disconnectProvider } from '../today/src/atlas-provider.js';
import { runAtlasPrompt, streamAtlasPrompt, testProvider, preparePatch, cancelAtlasRequest, cancelOwnerRequests } from '../today/src/atlas-chat.js';

async function fixture(t) {
  const mf = new Miniflare(convertV4MiniflareOptions({ modules: true, script: 'export default {fetch(){return new Response("fixture")}}', compatibilityDate: '2026-10-01', cf: false, d1Databases: ['ATLAS_DB'] }));
  t.after(() => mf.dispose());
  const env = { ATLAS_DB: await mf.getD1Database('ATLAS_DB'), ATLAS_ENCRYPTION_KEY: btoa('k'.repeat(32)) };
  await store.upgradeStorage(env);
  await connectProvider(env, 'owner', { key: 'sk-' + 'fixture'.repeat(8), model: 'gpt-6.2-sol' }, { send: async () => Response.json({ id: 'gpt-6.2-sol' }) });
  const conversation = await store.createConversation(env, 'owner', { mode: 'personal' });
  return { env, conversation };
}
const answer = text => Response.json({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text }] }], usage: { input_tokens: 10, output_tokens: 10 } });
const requestOptions = conversation => ({ owner: 'owner', conversationId: conversation.id, prompt: 'Fixture question', requestId: crypto.randomUUID() });

test('a completed paid answer survives provider-health or ledger settlement failure', async t => {
  const { env, conversation } = await fixture(t), actual = env.ATLAS_DB;
  for (const failure of ['health', 'ledger']) {
    const wrapped = { ...env, ATLAS_DB: { batch: (...args) => actual.batch(...args), prepare(sql) {
      if ((failure === 'health' && sql.startsWith('INSERT INTO atlas_provider_health')) || (failure === 'ledger' && sql.startsWith('UPDATE atlas_requests SET status=?'))) throw Error('private fixture failure');
      return actual.prepare(sql);
    } } };
    const options = requestOptions(conversation);
    const result = await runAtlasPrompt(wrapped, { ...options, send: async () => answer('Answer retained despite ' + failure) });
    assert.equal(result.message.status, 'completed'); assert.match(result.message.answer, /Answer retained/);
    assert.equal((await store.listMessages(env, 'owner', conversation.id)).at(-1).status, 'completed');
    const ledger = await store.getRequest(env, 'owner', options.requestId);
    assert.equal(ledger.dispatched, 1); assert.equal(ledger.status, failure === 'ledger' ? 'running' : 'completed');
  }
});

test('provider tests share cancellation controls and connection removal aborts them', async t => {
  const { env } = await fixture(t);
  for (const remove of [false, true]) {
    let dispatched; const started = new Promise(resolve => { dispatched = resolve; });
    const requestId = crypto.randomUUID();
    const promise = testProvider(env, 'owner', { requestId }, { send: async (_url, options) => {
      dispatched();
      return new Promise((_resolve, reject) => { if (options.signal.aborted) reject(options.signal.reason); else options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true }); });
    } });
    const rejected = assert.rejects(promise, { code: 'request_cancelled' });
    await started;
    if (remove) await cancelOwnerRequests(env, 'owner'); else await cancelAtlasRequest(env, 'owner', requestId);
    await rejected;
    assert.equal((await store.getRequest(env, 'owner', requestId)).status, 'cancelled');
  }
});

test('connection removal during provider-test credential loading prevents paid dispatch', async t => {
  const { env } = await fixture(t), actual = env.ATLAS_DB, requestId = crypto.randomUUID();
  let reached, release;
  const started = new Promise(resolve => { reached = resolve; }), resumed = new Promise(resolve => { release = resolve; });
  const delayed = { ...env, ATLAS_DB: { batch: (...args) => actual.batch(...args), prepare(sql) {
    const statement = actual.prepare(sql);
    if (!sql.startsWith('SELECT iv,ciphertext,model,updated_at FROM atlas_credentials')) return statement;
    return { bind(...args) { const bound = statement.bind(...args); return { async first() { const row = await bound.first(); reached(); await resumed; return row; } }; } };
  } } };
  let calls = 0;
  const pending = testProvider(delayed, 'owner', { requestId }, { send: async () => { calls++; return answer('Unexpected paid response'); } });
  const rejected = assert.rejects(pending, { code: 'request_cancelled' });
  await started;
  await cancelOwnerRequests(env, 'owner'); await disconnectProvider(env, 'owner'); release();
  await rejected;
  assert.equal(calls, 0); assert.equal(await store.getRequest(env, 'owner', requestId), null);
});

test('connection removal aborts repository preflight before patch generation can dispatch', async t => {
  const { env } = await fixture(t), repository = 'georgefarrowgreen1/inflite';
  const conversation = await store.createConversation(env, 'owner', { mode: 'developer', repository });
  const requestId = crypto.randomUUID();
  let reached, rejectPreflight, upstreamSignal, calls = 0;
  const started = new Promise(resolve => { reached = resolve; });
  const pending = preparePatch(env, 'owner', { requestId, conversationId: conversation.id, repository, paths: ['README.md'], prompt: 'Improve this selected file.' }, { send: async (url, options) => {
    calls++; assert.equal(new URL(url).origin, 'https://api.github.com'); upstreamSignal = options.signal;
    return new Promise((_resolve, reject) => { rejectPreflight = reject; reached(); options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true }); });
  } });
  const rejected = assert.rejects(pending, { code: 'request_cancelled' });
  await started;
  await cancelOwnerRequests(env, 'owner'); await disconnectProvider(env, 'owner');
  const aborted = upstreamSignal.aborted;
  rejectPreflight(new DOMException('Fixture cleanup', 'AbortError')); await rejected;
  assert.equal(aborted, true); assert.equal(calls, 1); assert.equal(await store.getRequest(env, 'owner', requestId), null);
  assert.equal((await env.ATLAS_DB.prepare('SELECT COUNT(*) AS count FROM atlas_patches').first()).count, 0);
});

test('Stop before reservation persists across request handlers and prevents any provider call', async t => {
  const { env, conversation } = await fixture(t), options = requestOptions(conversation);
  await cancelAtlasRequest(env, 'owner', options.requestId);
  await assert.rejects(() => runAtlasPrompt(env, { ...options, send: async () => assert.fail('cancelled request must not dispatch') }), { code: 'request_cancelled' });
  assert.equal((await store.listMessages(env, 'owner', conversation.id)).length, 0);
});

test('the final atomic dispatch gate rejects a removed or replaced credential revision', async t => {
  const { env, conversation } = await fixture(t);
  const credential = await env.ATLAS_DB.prepare("SELECT updated_at FROM atlas_credentials WHERE owner='owner'").first();
  for (const action of ['replace', 'remove']) {
    const id = crypto.randomUUID();
    await store.reserveRequest(env, 'owner', { id, operation: 'chat', model: 'gpt-6.2-sol', conversationId: conversation.id });
    if (action === 'replace') await env.ATLAS_DB.prepare("UPDATE atlas_credentials SET updated_at=updated_at+1 WHERE owner='owner'").run();
    else await env.ATLAS_DB.prepare("DELETE FROM atlas_credentials WHERE owner='owner'").run();
    await assert.rejects(() => store.markRequestDispatched(env, 'owner', id, { credentialUpdatedAt: credential.updated_at }), { code: 'provider_connection_changed' });
    assert.equal((await store.getRequest(env, 'owner', id)).dispatched, 0);
  }
});

test('streaming checkpoints retain received text before terminal completion', async t => {
  const { env, conversation } = await fixture(t), options = requestOptions(conversation), waits = [];
  let upstream;
  const response = await streamAtlasPrompt(env, { ...options, send: async () => new Response(new ReadableStream({ start(controller) { upstream = controller; controller.enqueue(new TextEncoder().encode('data: ' + JSON.stringify({ type: 'response.output_text.delta', delta: 'Partial '.repeat(700) }) + '\n\n')); } }), { headers: { 'Content-Type': 'text/event-stream' } }) }, { ctx: { waitUntil: promise => waits.push(promise) } });
  const reader = response.body.getReader(), decoder = new TextDecoder();
  while (true) { const part = await reader.read(); assert.equal(part.done, false); if (decoder.decode(part.value).includes('event: delta')) break; }
  const running = await env.ATLAS_DB.prepare('SELECT status,answer FROM atlas_turns WHERE owner=? AND id=?').bind('owner', options.requestId).first();
  assert.equal(running.status, 'running'); assert.equal(running.answer, 'Partial '.repeat(700));
  await cancelAtlasRequest(env, 'owner', options.requestId);
  await reader.cancel(); await Promise.all(waits);
  try { upstream.close(); } catch {}
  const final = await env.ATLAS_DB.prepare('SELECT status,answer FROM atlas_turns WHERE owner=? AND id=?').bind('owner', options.requestId).first();
  assert.equal(final.status, 'cancelled'); assert.equal(final.answer, running.answer);
});
