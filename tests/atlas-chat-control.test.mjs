import test from 'node:test';
import assert from 'node:assert/strict';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import * as store from '../today/src/atlas-store.js';
import { connectProvider, disconnectProvider } from '../today/src/atlas-provider.js';
import { runAtlasPrompt, streamAtlasPrompt, testProvider, preparePatch, cancelAtlasRequest, cancelOwnerRequests } from '../today/src/atlas-chat.js';

async function fixture(t, conversationOptions = { mode: 'personal' }) {
  const mf = new Miniflare(convertV4MiniflareOptions({ modules: true, script: 'export default {fetch(){return new Response("fixture")}}', compatibilityDate: '2026-10-01', cf: false, d1Databases: ['ATLAS_DB'] }));
  t.after(() => mf.dispose());
  const env = { ATLAS_DB: await mf.getD1Database('ATLAS_DB'), ATLAS_ENCRYPTION_KEY: btoa('k'.repeat(32)) };
  await store.upgradeStorage(env);
  await connectProvider(env, 'owner', { key: 'sk-' + 'fixture'.repeat(8), model: 'gpt-6.2-sol' }, { send: async () => Response.json({ id: 'gpt-6.2-sol' }) });
  const conversation = await store.createConversation(env, 'owner', conversationOptions);
  return { env, conversation };
}
const answer = text => Response.json({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text }] }], usage: { input_tokens: 10, output_tokens: 10 } });
const requestOptions = conversation => ({ owner: 'owner', conversationId: conversation.id, prompt: 'Fixture question', requestId: crypto.randomUUID() });
const repositoryFixture = {
  repository: 'georgefarrowgreen1/inflite', branch: 'claude/inflite', ref: 'a'.repeat(40), tree: 'b'.repeat(40),
  files: {
    'README.md': { sha: 'c'.repeat(40), text: '# Atlas fixture\nRepository overview is supplied automatically.\n' },
    'src/feature.js': { sha: 'd'.repeat(40), text: 'export const automaticRepositoryContext = true;\n' }
  }
};
const repositoryRead = () => Response.json({ id: 'repo-read-response', status: 'completed', output: [{
  type: 'function_call', id: 'repo-read-function', call_id: 'repo-read-call', name: 'repository_read_file',
  arguments: JSON.stringify({ path: 'src/feature.js', start_line: 1, line_count: 100, start_column: 0 })
}], usage: { input_tokens: 11, output_tokens: 3, input_tokens_details: { cached_tokens: 2 } } });
function repositoryTransport(onOpenAI, onGitHub) {
  const githubCalls = [], providerCalls = [], base = '/repos/' + repositoryFixture.repository;
  return { githubCalls, providerCalls, async send(raw, options) {
    const url = new URL(raw);
    assert.equal(options.redirect, 'manual');
    if (url.origin === 'https://api.openai.com') {
      assert.equal(url.pathname, '/v1/responses'); assert.equal(options.method, 'POST');
      const body = JSON.parse(options.body); providerCalls.push(body);
      return onOpenAI(body, options, providerCalls.length);
    }
    assert.equal(url.origin, 'https://api.github.com'); assert.equal(options.method || 'GET', 'GET');
    githubCalls.push(url.href);
    const intercepted = await onGitHub?.(url, options);
    if (intercepted !== undefined) return intercepted;
    if (url.pathname === base) return Response.json({ full_name: repositoryFixture.repository, default_branch: repositoryFixture.branch, private: false });
    if (url.pathname === base + '/commits/' + encodeURIComponent(repositoryFixture.branch)) return Response.json({ sha: repositoryFixture.ref, commit: { tree: { sha: repositoryFixture.tree } } });
    if (url.pathname === base + '/git/trees/' + repositoryFixture.tree) return Response.json({ truncated: false, tree: Object.entries(repositoryFixture.files).map(([path, file]) => ({ path, type: 'blob', mode: '100644', sha: file.sha, size: Buffer.byteLength(file.text) })) });
    if (url.pathname.startsWith(base + '/contents/')) {
      assert.equal(url.searchParams.get('ref'), repositoryFixture.ref);
      const path = decodeURIComponent(url.pathname.slice((base + '/contents/').length)), file = repositoryFixture.files[path];
      assert.ok(file, 'only fixture repository files can be read');
      return Response.json({ type: 'file', path, encoding: 'base64', content: Buffer.from(file.text).toString('base64'), sha: file.sha, size: Buffer.byteLength(file.text) });
    }
    assert.fail('Unexpected fixture GitHub route: ' + url.pathname);
  } };
}

test('a selected repository supplies automatic context and model-driven reads without file attachments', async t => {
  const { env, conversation } = await fixture(t, { mode: 'developer', repository: repositoryFixture.repository }), options = requestOptions(conversation);
  const transport = repositoryTransport(async (body, _options, round) => {
    assert.equal(body.store, false);
    if (round === 1) {
      const supplied = JSON.stringify({ input: body.input, instructions: body.instructions });
      assert.ok(supplied.includes(repositoryFixture.repository)); assert.ok(supplied.includes(repositoryFixture.ref));
      assert.ok(supplied.includes('Repository overview is supplied automatically.'));
      assert.equal(supplied.includes(repositoryFixture.files['src/feature.js'].text.trim()), false);
      assert.ok(body.tools.some(tool => tool.name === 'repository_list_files'));
      assert.ok(body.tools.some(tool => tool.name === 'repository_read_file'));
      assert.ok(body.tools.some(tool => tool.name === 'repository_search'));
      return repositoryRead();
    }
    assert.equal(round, 2);
    const output = body.input.find(item => item.type === 'function_call_output' && item.call_id === 'repo-read-call');
    assert.ok(output); assert.ok(output.output.includes(repositoryFixture.files['src/feature.js'].text.trim()));
    return Response.json({ status: 'completed', output: [{ type: 'message', phase: 'final_answer', content: [{ type: 'output_text', text: 'Automatic repository context is enabled in src/feature.js.' }] }], usage: { input_tokens: 21, output_tokens: 7, input_tokens_details: { cached_tokens: 5 } } });
  });
  const result = await runAtlasPrompt(env, { ...options, context: [], send: transport.send });
  assert.equal(transport.providerCalls.length, 2); assert.equal(result.message.status, 'completed');
  assert.deepEqual([result.usage.inputTokens, result.usage.outputTokens, result.usage.cachedTokens], [32, 10, 7]);
  const sourceURL = 'https://github.com/' + repositoryFixture.repository + '/blob/' + repositoryFixture.ref + '/src/feature.js';
  assert.ok(result.message.sources.some(source => source.url === sourceURL));
  const source = result.message.context.find(context => context.path === 'src/feature.js');
  assert.ok(source); assert.equal(source.repository, repositoryFixture.repository); assert.equal(source.ref, repositoryFixture.ref);
  assert.equal(Object.hasOwn(source, 'text'), false); assert.equal(source.blobSha, repositoryFixture.files['src/feature.js'].sha); assert.equal(source.mode, '100644'); assert.equal(source.automatic, true);
  assert.equal(JSON.stringify(result.message.context).includes('automaticRepositoryContext = true'), false);
  const ledger = await store.getRequest(env, 'owner', options.requestId);
  assert.equal(ledger.status, 'completed'); assert.equal(ledger.dispatched, 1);
  assert.deepEqual([ledger.input_tokens, ledger.output_tokens, ledger.cached_tokens], [32, 10, 7]);
  assert.equal(ledger.estimated_cost_usd, result.usage.estimatedCostUsd);
  assert.equal((await store.usageSummary(env, 'owner')).totals.requests, 1);
});

test('large repository source references preserve the paid answer and full file context within storage bounds', async t => {
  const { env, conversation } = await fixture(t, { mode: 'developer', repository: repositoryFixture.repository }), options = requestOptions(conversation);
  // Each path segment fits common filesystem limits and each URL fits the
  // source validator, but the complete link list exceeds its 100k JSON limit.
  const prefix = Array(10).fill('文'.repeat(40)).join('/');
  const paths = Array.from({ length: 26 }, (_, index) => 'docs/' + prefix + '/' + String(index).padStart(2, '0') + '.md');
  const base = '/repos/' + repositoryFixture.repository, sha = 'e'.repeat(40), fileText = 'x\n';
  const transport = repositoryTransport((_body, _options, round) => {
    if (round <= 4) return Response.json({ status: 'completed', output: paths.slice(round * 4, round * 4 + 4).map((path, index) => ({
      type: 'function_call', id: 'long-ref-' + round + '-' + index, call_id: 'long-ref-call-' + round + '-' + index, name: 'repository_read_file',
      arguments: JSON.stringify({ path, start_line: 1, line_count: 1, start_column: 0 })
    })), usage: { input_tokens: 10, output_tokens: 5 } });
    assert.equal(round, 5); return answer('The repository investigation completed with its source references.');
  }, async url => {
    if (url.pathname === base + '/commits/' + repositoryFixture.ref) return Response.json({ sha: repositoryFixture.ref, commit: { tree: { sha: repositoryFixture.tree } } });
    if (url.pathname === base + '/git/trees/' + repositoryFixture.tree) return Response.json({ truncated: false, tree: paths.map(path => ({ path, sha, mode: '100644', type: 'blob', size: Buffer.byteLength(fileText) })) });
    if (url.pathname.startsWith(base + '/contents/')) {
      const path = decodeURIComponent(url.pathname.slice((base + '/contents/').length)); assert.ok(paths.includes(path)); assert.equal(url.searchParams.get('ref'), repositoryFixture.ref);
      return Response.json({ type: 'file', path, encoding: 'base64', content: Buffer.from(fileText).toString('base64'), sha, size: Buffer.byteLength(fileText) });
    }
  });
  const result = await runAtlasPrompt(env, { ...options, prompt: 'Inspect docs', context: paths.slice(20).map(path => ({ kind: 'file', repository: repositoryFixture.repository, path, ref: repositoryFixture.ref })), send: transport.send });
  assert.equal(result.message.status, 'completed'); assert.equal(result.message.answer, 'The repository investigation completed with its source references.');
  assert.equal(transport.providerCalls.length, 5); assert.equal(result.message.context.length, 26);
  assert.deepEqual(new Set(result.message.context.map(source => source.path)), new Set(paths));
  assert.equal(result.message.context.filter(source => source.automatic === true).length, 20);
  const unboundedSources = result.message.context.map(({ title, url }) => ({ title, url }));
  assert.ok(unboundedSources.every(source => source.url.length <= 4096));
  assert.ok(JSON.stringify(unboundedSources).length > 100000, 'the fixture must exceed the previous merged-source storage limit');
  assert.ok(JSON.stringify(result.message.context).length <= 196608); assert.ok(JSON.stringify(result.message.sources).length < 96000);
  assert.ok(result.message.sources.length > 0 && result.message.sources.length < unboundedSources.length);
  const saved = (await store.listMessages(env, 'owner', conversation.id)).find(message => message.id === options.requestId);
  assert.equal(saved.status, 'completed'); assert.deepEqual(saved.context, result.message.context); assert.deepEqual(saved.sources, result.message.sources);
  const ledger = await store.getRequest(env, 'owner', options.requestId); assert.equal(ledger.status, 'completed'); assert.equal((await store.usageSummary(env, 'owner')).totals.requests, 1);
});

test('automatic repository preparation fails before any paid provider dispatch', async t => {
  const { env, conversation } = await fixture(t, { mode: 'developer', repository: repositoryFixture.repository }), options = requestOptions(conversation);
  const transport = repositoryTransport(() => assert.fail('unavailable repository must not dispatch OpenAI'), async () => Response.json({ message: 'Not found' }, { status: 404 }));
  await assert.rejects(() => runAtlasPrompt(env, { ...options, send: transport.send }), { code: 'github_not_found' });
  assert.equal(transport.providerCalls.length, 0);
  const ledger = await store.getRequest(env, 'owner', options.requestId);
  assert.equal(ledger.dispatched, 0); assert.equal(ledger.status, 'failed');
  assert.equal((await store.usageSummary(env, 'owner')).totals.requests, 0);
  const message = (await store.listMessages(env, 'owner', conversation.id)).find(message => message.id === options.requestId);
  assert.equal(message.status, 'failed'); assert.equal(message.error_code, 'github_not_found');
});

test('Stop reaches automatic repository preparation and model-requested reads before another paid call', { timeout: 20000 }, async t => {
  const { env, conversation } = await fixture(t, { mode: 'developer', repository: repositoryFixture.repository });
  for (const stage of ['preparation', 'tool']) {
    const options = requestOptions(conversation), waits = [], abort = new AbortController();
    t.after(() => abort.abort());
    let reached, upstreamSignal;
    const started = new Promise(resolve => { reached = resolve; });
    const transport = repositoryTransport(() => repositoryRead(), async (url, request) => {
      const blocking = stage === 'preparation' ? url.pathname === '/repos/' + repositoryFixture.repository : url.pathname.endsWith('/contents/src/feature.js');
      if (!blocking) return;
      upstreamSignal = request.signal; reached();
      return new Promise((_resolve, reject) => {
        if (request.signal.aborted) reject(request.signal.reason);
        else request.signal.addEventListener('abort', () => reject(request.signal.reason), { once: true });
      });
    });
    const response = await streamAtlasPrompt(env, { ...options, signal: abort.signal, send: transport.send }, { ctx: { waitUntil: promise => waits.push(promise) } });
    const reader = response.body.getReader(), decoder = new TextDecoder();
    let events = '';
    while (!events.includes('event: meta')) { const chunk = await reader.read(); assert.equal(chunk.done, false); events += decoder.decode(chunk.value); }
    await started;
    assert.equal((await store.getRequest(env, 'owner', options.requestId)).dispatched, stage === 'preparation' ? 0 : 1);
    await cancelAtlasRequest(env, 'owner', options.requestId);
    assert.equal(upstreamSignal.aborted, true);
    while (true) { const chunk = await reader.read(); if (chunk.done) break; events += decoder.decode(chunk.value); }
    await Promise.all(waits);
    assert.match(events, /request_cancelled/);
    assert.equal(transport.providerCalls.length, stage === 'preparation' ? 0 : 1);
    const ledger = await store.getRequest(env, 'owner', options.requestId);
    assert.equal(ledger.status, 'cancelled');
    if (stage === 'tool') assert.deepEqual([ledger.input_tokens, ledger.output_tokens], [11, 3]);
    const message = (await store.listMessages(env, 'owner', conversation.id)).find(message => message.id === options.requestId);
    assert.equal(message.status, 'cancelled'); assert.equal(message.answer, '');
  }
});

test('a later repository reasoning round with unknown usage settles one uncertain request', async t => {
  const { env, conversation } = await fixture(t, { mode: 'developer', repository: repositoryFixture.repository }), options = requestOptions(conversation);
  const transport = repositoryTransport((_body, _options, round) => {
    if (round === 1) return repositoryRead();
    assert.equal(round, 2); throw Error('Private upstream network fixture');
  });
  await assert.rejects(() => runAtlasPrompt(env, { ...options, send: transport.send }), { code: 'openai_network' });
  assert.equal(transport.providerCalls.length, 2);
  const ledger = await store.getRequest(env, 'owner', options.requestId);
  assert.equal(ledger.status, 'uncertain'); assert.equal(ledger.dispatched, 1);
  assert.equal(ledger.input_tokens, null); assert.equal(ledger.output_tokens, null); assert.equal(ledger.estimated_cost_usd, null);
  const usage = await store.usageSummary(env, 'owner'); assert.equal(usage.totals.requests, 1); assert.equal(usage.totals.unknownCostRequests, 1);
  const message = (await store.listMessages(env, 'owner', conversation.id)).find(message => message.id === options.requestId);
  assert.equal(message.status, 'failed'); assert.equal(message.answer, '');
  assert.ok(message.context.some(context => context.path === 'src/feature.js' && context.ref === repositoryFixture.ref));
  assert.equal(JSON.stringify(message).includes('Private upstream network fixture'), false);
});

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
