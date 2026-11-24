const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { build } = require('esbuild');
const { Miniflare, convertV4MiniflareOptions } = require('miniflare');

test('Atlas routes, owner context, streaming and scheduling integrate in workerd with real D1', { timeout: 60000 }, async t => {
  const secret = 'sk-' + 'fixture'.repeat(8), model = 'gpt-6.2-sol';
  const entry = `
    import { atlas } from ${JSON.stringify(path.resolve(__dirname, '../today/src/atlas.js'))};
    import worker from ${JSON.stringify(path.resolve(__dirname, '../today/src/index.js'))};
    export default { scheduled(controller, env, ctx) {
      return worker.scheduled(controller, { ...env, ATLAS_ENCRYPTION_KEY: btoa('k'.repeat(32)), ATLAS_VERIFY_KEY: 'fixture-verifier', ATLAS_AUTONOMY: '0', APPS: { fetch: req => fetch(req) } }, ctx);
    }, async fetch(request, env, ctx) {
      const owner = request.headers.get('X-Fixture-Owner') || 'alice';
      const config = { ...env, ATLAS_ENCRYPTION_KEY: btoa('k'.repeat(32)), OPENAI_API_KEY: 'must-never-use-global-key', ATLAS_AUTONOMY: request.headers.get('X-Fixture-Autonomy') || '0' };
      if (request.headers.get('X-Fixture-Verify')) config.ATLAS_VERIFY_KEY = 'fixture-verifier';
      config.APPS = { fetch: req => fetch(req) };
      if (request.headers.get('X-Fixture-Broken')) config.ATLAS_ENCRYPTION_KEY = 'invalid';
      const account = async (_env, _request, { path }) => {
        if (path === 'today/me') return Response.json({ signedIn: true, user: { id: owner }, apps: { mail: request.headers.get('X-Fixture-Admin') !== 'false' } });
        if (path === 'atlas/fresh') return Response.json({ fresh: request.headers.get('X-Fixture-Fresh') !== 'false', owner });
        if (path === 'today/cards') return Response.json({ fitness: { owner, summary: 'Fixture fitness summary for ' + owner } });
        return new Response(null, { status: 404 });
      };
      return atlas(request, config, { account, ctx });
    } };
  `;
  const bundled = await build({ stdin: { contents: entry, resolveDir: path.resolve(__dirname, '..') }, bundle: true, format: 'esm', platform: 'neutral', target: 'es2022', write: false, logLevel: 'silent' });
  let upstream = 'ok', adminAllowed = true, calls = [], payloads = [];
  const cited = { type: 'url_citation', url: 'https://example.org/evidence', title: 'Fixture evidence', start_index: 0, end_index: 7 };
  const responseObject = (text = 'Fixture answer', status = 'completed') => ({ id: 'resp_fixture', status, output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text, annotations: [cited] }] }], usage: { input_tokens: 100, output_tokens: 20, input_tokens_details: { cached_tokens: 10 } }, ...(status === 'incomplete' ? { incomplete_details: { reason: 'max_output_tokens' } } : {}) });
  const sse = events => new Response(events.map(event => 'data: ' + JSON.stringify(event) + '\n\n').join(''), { headers: { 'Content-Type': 'text/event-stream', 'x-request-id': 'req_fixture' } });
  const mf = new Miniflare(convertV4MiniflareOptions({
    modules: true, script: bundled.outputFiles[0].text, compatibilityDate: '2026-10-01', cf: false, d1Databases: ['ATLAS_DB'],
    outboundService: async request => {
      const url = new URL(request.url);
      calls.push({ host: url.hostname, path: url.pathname, method: request.method, authorization: request.headers.get('Authorization') });
      if (url.hostname === 'account.inflite.ai') {
        assert.equal(request.headers.get('Cookie'), null); assert.equal(request.headers.get('Authorization'), 'Bearer fixture-verifier');
        const body = await request.json(); assert.equal(body.owner, 'alice');
        if (url.pathname === '/api/atlas-admin') return Response.json({ allowed: adminAllowed });
        if (url.pathname === '/api/atlas-context') { assert.equal(body.scope, 'fitness'); return Response.json({ fitness: { summary: 'Current scheduled owner fitness' } }); }
      }
      assert.equal(url.hostname, 'api.openai.com', 'no redirect destination may be contacted');
      assert.equal(request.headers.get('Authorization'), 'Bearer ' + secret);
      if (upstream === 'redirect') return new Response(null, { status: 307, headers: { Location: 'https://untrusted.invalid/collect' } });
      if (url.pathname === '/v1/models/' + model) return Response.json({ id: model });
      if (url.pathname === '/v1/models') return Response.json({ data: [{ id: model }, { id: 'gpt-6.2-astra' }] });
      assert.equal(url.pathname, '/v1/responses');
      const body = await request.json(); payloads.push(body); assert.equal(body.store, false); assert.equal(body.model, model);
      if (upstream === 'quota') return Response.json({ error: { code: 'insufficient_quota', message: 'SECRET ' + secret } }, { status: 429 });
      if (upstream === 'empty') return Response.json({ status: 'completed', output: [], usage: { input_tokens: 100, output_tokens: 0 } });
      if (upstream === 'summary') return Response.json(responseObject('The user chose the evidence-based option.'));
      if (upstream === 'incomplete') return Response.json(responseObject('Partial fixture answer', 'incomplete'));
      if (body.stream) {
        const events = [{ type: 'response.output_text.delta', delta: 'Fixture ' }, { type: 'response.output_text.delta', delta: 'answer' }, { type: 'response.output_text.annotation.added', annotation: cited }];
        if (upstream !== 'interrupted') events.push({ type: 'response.completed', response: responseObject() });
        return sse(events);
      }
      return Response.json(responseObject(), { headers: { 'x-request-id': 'req_fixture' } });
    }
  }));
  t.after(() => mf.dispose());
  const db = await mf.getD1Database('ATLAS_DB');
  async function raw(route, { method = 'GET', body, owner = 'alice', headers = {} } = {}) {
    return mf.dispatchFetch('https://inflite.ai/atlas/api' + route, { method, headers: { Cookie: 'account=abcdefghijklmnopqrstuvwxyz', Origin: 'https://inflite.ai', 'X-Inflite': '1', 'Content-Type': 'application/json', 'X-Fixture-Owner': owner, ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  }
  async function call(route, options) {
    const response = await raw(route, options), text = await response.text();
    assert.ok(!text.includes(secret) && !text.includes('must-never-use-global-key'), 'keys never appear in API responses');
    return { status: response.status, value: JSON.parse(text), headers: response.headers };
  }
  const post = (route, body, extra = {}) => call(route, { ...extra, method: 'POST', body });
  const uid = () => crypto.randomUUID();
  let conversation, second, fitness, message, ownerMarker;

  await t.test('health works before migration and setup needs explicit confirmation plus fresh auth', async () => {
    const health = await call('/health'); ownerMarker = health.value.owner;
    assert.equal(health.status, 200); assert.equal(health.value.storage.ready, false);
    assert.equal((await call('/conversations')).status, 409);
    assert.equal((await post('/setup', {})).status, 409);
    assert.equal((await post('/setup', { confirm: true }, { headers: { 'X-Fixture-Fresh': 'false' } })).status, 403);
    assert.equal((await post('/setup', { confirm: true })).value.schemaVersion, 10);
    assert.equal((await post('/setup', { confirm: true })).value.ready, true);
    assert.equal(calls.length, 0);
  });

  await t.test('provider metadata validation is encrypted and separate from a real connection test', async () => {
    assert.equal((await post('/provider', { key: secret, model }, { headers: { 'X-Fixture-Fresh': 'false' } })).value.code, 'identity_confirmation_required');
    assert.equal(calls.length, 0);
    const saved = await post('/provider', { key: secret, model }); assert.equal(saved.status, 200); assert.equal(saved.value.healthy, false);
    const row = await db.prepare("SELECT * FROM atlas_credentials WHERE owner='alice'").first(); assert.ok(!JSON.stringify(row).includes(secret));
    assert.equal((await call('/provider', { owner: 'bob' })).value.keySaved, false);
    const checked = await post('/provider/test', { requestId: uid() }); assert.equal(checked.status, 200); assert.equal(checked.value.ok, true);
    assert.equal((await call('/health')).value.provider.healthy, true);
    const models = await call('/models'); assert.equal(models.value.selected, model); assert.equal(models.value.models.length, 2);
  });

  await t.test('conversations and explicit memory reach only the intended owner and thread', async () => {
    conversation = (await post('/conversations', { mode: 'research', title: 'Research one' })).value.conversation;
    second = (await post('/conversations', { mode: 'personal', title: 'Personal two' })).value.conversation;
    fitness = (await post('/conversations', { mode: 'fitness' })).value.conversation;
    await call('/settings', { method: 'PATCH', body: { memory: 'Private cycling preference', memoryEnabled: true, dailyRequestLimit: 100 } });
    const result = await post('/chat', { conversationId: conversation.id, requestId: uid(), prompt: 'First thread question' });
    assert.equal(result.status, 200); message = result.value.message;
    assert.equal(message.status, 'completed'); assert.equal(message.sources[0].url, cited.url);
    assert.match(payloads.at(-1).instructions, /Private cycling preference/);
    assert.equal((await call('/conversations/' + conversation.id, { owner: 'bob' })).status, 404);
    assert.equal((await call('/settings', { owner: 'bob' })).value.memory, '');
    assert.equal((await post('/chat', { conversationId: conversation.id, requestId: uid(), prompt: 'foreign' }, { owner: 'bob' })).status, 503, 'another owner cannot use the global key');
    await post('/chat', { conversationId: second.id, requestId: uid(), prompt: 'Separate thread question' });
    assert.ok(!JSON.stringify(payloads.at(-1).input).includes('First thread question'));
    const changed = await post('/conversations', { mode: 'personal' }, { owner: 'bob', headers: { 'X-Atlas-Owner': ownerMarker } });
    assert.equal(changed.value.code, 'session_changed');
    assert.equal((await call('/conversations', { owner: 'bob' })).value.conversations.length, 0);
  });

  await t.test('same request ID dispatches only once and sources survive brief/export/reload', async () => {
    const before = payloads.length;
    assert.equal((await post('/chat', { conversationId: conversation.id, requestId: message.id, prompt: 'A repeated request' })).value.code, 'request_duplicate');
    assert.equal(payloads.length, before);
    const saved = await post('/briefs', { conversationId: conversation.id, messageId: message.id, title: 'Saved evidence' });
    assert.equal(saved.status, 201);
    const brief = saved.value.brief;
    assert.equal((await call('/briefs/' + brief.id, { owner: 'bob' })).status, 404);
    assert.match(await (await raw('/briefs/' + brief.id + '/export')).text(), /https:\/\/example.org\/evidence/);
    const exportResult = await raw('/conversations/' + conversation.id + '/export');
    assert.match(exportResult.headers.get('Content-Disposition'), /attachment/);
    assert.match(await exportResult.text(), /Status: completed[\s\S]*Fixture evidence/);
    assert.equal((await call('/conversations/' + conversation.id)).value.messages[0].id, message.id);
  });

  await t.test('real SSE events stream, persist and retain an interrupted partial answer', async () => {
    const response = await raw('/chat', { method: 'POST', body: { conversationId: conversation.id, requestId: uid(), prompt: 'Streaming question', stream: true } });
    assert.equal(response.status, 200); assert.match(response.headers.get('Content-Type'), /event-stream/);
    const streamed = await response.text(); assert.match(streamed, /event: meta/); assert.match(streamed, /event: delta/); assert.match(streamed, /event: source/); assert.match(streamed, /event: done/);
    upstream = 'interrupted';
    const id = uid(), partial = await raw('/chat', { method: 'POST', body: { conversationId: conversation.id, requestId: id, prompt: 'Interrupted question', stream: true } });
    assert.match(await partial.text(), /"status":"incomplete"/);
    const row = await db.prepare('SELECT * FROM atlas_turns WHERE owner=? AND id=?').bind('alice', id).first();
    assert.equal(row.status, 'incomplete'); assert.equal(row.answer, 'Fixture answer'); assert.equal(row.error_code, 'openai_stream_interrupted');
    assert.equal((await post('/briefs', { conversationId: conversation.id, messageId: id })).value.code, 'brief_incomplete');
    upstream = 'ok';
  });

  await t.test('empty answers, quota and redirects are actionable without leaking or fake success', async () => {
    for (const [state, code] of [['empty', 'openai_empty_response'], ['quota', 'openai_quota'], ['redirect', 'openai_redirect']]) {
      upstream = state; const id = uid(), before = calls.length;
      const result = await post('/chat', { conversationId: conversation.id, requestId: id, prompt: 'Failure fixture' });
      assert.equal(result.value.code, code); assert.ok(result.status >= 400); assert.equal(calls.length, before + 1);
      const row = await db.prepare('SELECT * FROM atlas_turns WHERE owner=? AND id=?').bind('alice', id).first(); assert.equal(row.status, 'failed'); assert.equal(row.answer, '');
      assert.equal((await call('/provider')).value.lastErrorCode, code);
    }
    upstream = 'ok';
  });

  await t.test('allowances stop dispatch and a completed summary remains scoped to its conversation', async () => {
    await call('/settings', { method: 'PATCH', body: { dailyRequestLimit: 1 } });
    const before = payloads.length;
    assert.equal((await post('/chat', { conversationId: conversation.id, requestId: uid(), prompt: 'Should stop' })).value.code, 'daily_request_limit');
    assert.equal(payloads.length, before);
    await call('/settings', { method: 'PATCH', body: { dailyRequestLimit: 100 } });
    upstream = 'summary';
    assert.equal((await post('/conversations/' + conversation.id + '/summary', { requestId: uid() })).status, 200);
    assert.match((await call('/conversations/' + conversation.id)).value.conversation.summary, /evidence-based/);
    assert.equal((await call('/conversations/' + second.id)).value.conversation.summary, '');
    upstream = 'ok';
    const usage = (await call('/usage')).value;
    assert.ok(usage.totals.requests >= 9); assert.ok(usage.totals.inputTokens > 0); assert.ok(usage.totals.estimatedCostUsd > 0); assert.equal(usage.budgetIsEstimate, true);
  });

  await t.test('Fitness data requires consent and a Fitness conversation', async () => {
    const before = payloads.length;
    assert.equal((await post('/chat', { conversationId: second.id, requestId: uid(), prompt: 'Wrong mode', includeFitness: true })).value.code, 'fitness_mode_required');
    assert.equal(payloads.length, before);
    await post('/chat', { conversationId: fitness.id, requestId: uid(), prompt: 'My next session', includeFitness: true });
    assert.match(JSON.stringify(payloads.at(-1).input), /Fixture fitness summary for alice/);
    await post('/chat', { conversationId: fitness.id, requestId: uid(), prompt: 'Generic question', includeFitness: false });
    assert.ok(!JSON.stringify(payloads.at(-1).input).includes('Fixture fitness summary for alice'));
  });

  await t.test('tasks start paused; manual execution rechecks current admin, uses owner key and records results', async () => {
    const task = (await post('/tasks', { title: 'Fixture task', prompt: 'Summarize my training', mode: 'fitness', schedule_kind: 'daily', local_time: '08:00', timezone: 'Europe/London', includeFitness: true, enabled: true })).value.task;
    assert.equal(task.enabled, false);
    assert.equal((await call('/tasks', { method: 'PATCH', body: { id: task.id, enabled: true, confirm: true } })).value.code, 'scheduling_unavailable');
    const headers = { 'X-Fixture-Verify': '1' }, id = uid();
    const run = await post('/tasks/' + task.id + '/run', { requestId: id, confirm: true }, { headers });
    assert.equal(run.status, 200); assert.equal(run.value.run.status, 'completed');
    const timeline = (await call('/runs/scheduled/' + id)).value;
    assert.deepEqual(timeline.events.map(event => event.status), ['queued', 'running', 'completed']);
    assert.match(JSON.stringify(payloads.at(-1).input), /Current scheduled owner fitness/);
    const before = payloads.length;
    assert.equal((await post('/tasks/' + task.id + '/run', { requestId: id, confirm: true }, { headers })).value.run.duplicate, true);
    assert.equal(payloads.length, before);
    adminAllowed = false;
    const denied = await post('/tasks/' + task.id + '/run', { requestId: uid(), confirm: true }, { headers });
    assert.equal(denied.value.run.status, 'skipped'); assert.equal(payloads.length, before);
    assert.equal((await call('/tasks/' + task.id + '/runs', { owner: 'bob' })).status, 404);
    adminAllowed = true;
  });

  await t.test('cron finishes a queued answer after its HTTP client leaves and replays the same timeline', async () => {
    const headers = { 'X-Fixture-Verify': '1' };
    const body = { conversationId: second.id, requestId: uid(), prompt: 'Continue after the tab closes' };
    const before = payloads.length;
    assert.equal((await post('/runs', body)).value.code, 'background_unavailable');
    adminAllowed = false;
    assert.equal((await post('/runs', body, { headers })).value.code, 'administrator_unavailable');
    assert.equal((await call('/runs/background/' + body.requestId)).status, 404);
    adminAllowed = true;
    const submissions = await Promise.all([post('/runs', body, { headers }), post('/runs', body, { headers })]);
    assert.ok(submissions.every(response => response.status === 202 && response.value.run.id === body.requestId));
    assert.equal(submissions[0].value.run.messageId, submissions[1].value.run.messageId);
    assert.equal(payloads.length, before);
    const detail = '/runs/background/' + body.requestId;
    const first = (await call(detail + '?limit=1', { headers })).value;
    assert.deepEqual(first.events.map(event => [event.seq, event.checkpoint]), [[1, 'queued']]);
    assert.equal((await call(detail, { owner: 'bob', headers })).status, 404);
    assert.equal((await call(detail, { headers: { ...headers, 'X-Fixture-Admin': 'false' } })).status, 403);

    const runtime = await mf.getWorker();
    const tick = await runtime.scheduled({ cron: '* * * * *' });
    assert.equal(tick.outcome, 'ok');
    const replay = (await call(detail + '?after=' + first.nextAfter, { headers })).value;
    assert.equal(replay.run.status, 'completed');
    assert.deepEqual(replay.events.map(event => event.checkpoint), ['preparing', 'dispatching', 'saved']);
    assert.deepEqual(replay.events.map(event => event.seq), [2, 3, 4]);
    assert.equal(payloads.length, before + 1);
    assert.equal((await call('/conversations/' + second.id)).value.messages.find(item => item.id === replay.run.messageId).answer, 'Fixture answer');
    assert.ok(!(await call('/runs')).value.items.some(item => item.id === replay.run.messageId));
    assert.equal((await runtime.scheduled({ cron: '* * * * *' })).outcome, 'ok');
    assert.equal(payloads.length, before + 1);
  });

  await t.test('archiving fixes context boundaries and deleting a conversation removes its messages and briefs', async () => {
    assert.equal((await call('/conversations/' + conversation.id, { method: 'PATCH', body: { mode: 'personal' } })).value.code, 'conversation_context_fixed');
    await call('/conversations/' + conversation.id, { method: 'PATCH', body: { title: 'Renamed', archived: true } });
    assert.equal((await post('/chat', { conversationId: conversation.id, requestId: uid(), prompt: 'Archived' })).value.code, 'conversation_archived');
    assert.equal((await call('/conversations?archived=1')).value.conversations[0].title, 'Renamed');
    assert.equal((await call('/conversations/' + conversation.id, { method: 'DELETE' })).value.deleted, true);
    assert.equal((await call('/briefs')).value.briefs.length, 0);
    assert.equal((await call('/conversations/' + conversation.id)).status, 404);
    assert.equal((await call('/provider', { method: 'DELETE', headers: { 'X-Fixture-Broken': '1' } })).value.keySaved, false);
    assert.equal((await post('/chat', { conversationId: second.id, requestId: uid(), prompt: 'No saved provider' })).value.code, 'provider_not_configured');
  });
});
