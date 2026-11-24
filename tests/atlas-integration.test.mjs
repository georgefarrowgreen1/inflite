import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import * as store from '../today/src/atlas-store.js';
import * as contexts from '../today/src/atlas-workspace-context.js';
import * as coding from '../today/src/atlas-coding-store.js';
import { atlas } from '../today/src/atlas.js';
import { runAtlasPrompt } from '../today/src/atlas-chat.js';
import { connectProvider } from '../today/src/atlas-provider.js';
import { runDueAtlasAnswers } from '../today/src/atlas-run-coordinator.js';

const COOKIE = 'account=abcdefghijklmnopqrstuvwxyz';
const request = (path = '/atlas/api/chat', { method = 'GET', body } = {}) => new Request('https://inflite.ai' + path, { method, headers: { Cookie: COOKIE + '; unrelated=must-not-leave-hub', ...(method === 'GET' ? {} : { Origin: 'https://inflite.ai', 'X-Inflite': '1', 'Content-Type': 'application/json' }) }, ...(body ? { body: JSON.stringify(body) } : {}) });
const account = async () => Response.json({ signedIn: true, user: { id: 'alice' }, apps: { mail: true } });
const answer = () => Response.json({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: 'A proposed reply for your review.' }] }], usage: { input_tokens: 20, output_tokens: 10 } });

async function fixture(t, { version = store.SCHEMA_VERSION } = {}) {
  const mf = new Miniflare(convertV4MiniflareOptions({ modules: true, script: 'export default {fetch(){return new Response("fixture")}}', compatibilityDate: '2026-10-01', cf: false, d1Databases: ['ATLAS_DB'] }));
  t.after(() => mf.dispose());
  const env = { ATLAS_DB: await mf.getD1Database('ATLAS_DB'), ATLAS_ENCRYPTION_KEY: btoa('w'.repeat(32)), MAIL_ORIGIN: 'https://email.inflite.ai' };
  if (version === store.SCHEMA_VERSION) await store.upgradeStorage(env);
  else {
    const sql = (await Promise.all(Array.from({ length: version }, (_, i) => readFile(new URL('../atlas/migrations/' + String(i + 1).padStart(4, '0') + '.sql', import.meta.url), 'utf8')))).join('\n');
    await env.ATLAS_DB.batch(sql.split(';').map(s => s.trim()).filter(Boolean).map(s => env.ATLAS_DB.prepare(s)));
  }
  const conversation = await store.createConversation(env, 'alice', { title: 'Selected Mail conversation', mode: 'personal' });
  return { env, conversation };
}

function mailFixture(env, { owner = 'alice', count = 8 } = {}) {
  const messages = Array.from({ length: count }, (_, i) => ({ id: 'message-' + (i + 1), threadId: 'thread-1', folder: i === count - 1 ? 'sent' : 'inbox', date: 1000 + i, from: { name: 'Sender', email: 'sender@example.test' }, subject: 'Server-owned subject', snippet: 'Private snippet', text: 'Private mail body ' + (i + 1), hasAttachments: false }));
  const calls = [], remote = { owner, access: 'ok', messages, calls, intercept: null };
  env.MAIL = { async fetch(req) {
    const url = new URL(req.url); calls.push(url.pathname);
    assert.equal(url.origin, env.MAIL_ORIGIN); assert.equal(req.method, 'GET'); assert.equal(req.redirect, 'manual');
    assert.equal(req.headers.get('Origin'), env.MAIL_ORIGIN); assert.equal(req.headers.get('Cookie'), COOKIE);
    if (remote.intercept) { const result = await remote.intercept(req); if (result !== undefined) return result; }
    if (url.pathname === '/api/session') return Response.json({ access: remote.access, user: { id: remote.owner } });
    if (url.pathname === '/api/threads/thread-1') return Response.json({ id: 'thread-1', subject: 'Server-owned subject', messages: messages.map(({ text, ...meta }) => meta) });
    const id = /^\/api\/messages\/([^/]+)$/.exec(url.pathname)?.[1];
    const message = messages.find(m => m.id === id);
    if (message) return Response.json(message);
    assert.fail('No inbox enumeration, search, attachments, or send route is permitted: ' + url.pathname);
  } };
  return remote;
}

test('selected Mail context stores only references, bounds reads and isolates conversations and owners', async t => {
  const { env, conversation } = await fixture(t), remote = mailFixture(env);
  const result = await contexts.setWorkspaceContext(env, 'alice', conversation.id, { app: 'mail', kind: 'thread', threadId: 'thread-1', title: 'Untrusted title', url: 'https://evil.example/private', text: 'Untrusted client text' }, { request: request() });
  assert.equal(result.ready, true); assert.equal(result.context.length, 1);
  const context = result.context[0];
  assert.equal(context.title, 'Server-owned subject'); assert.equal(context.messageId, 'message-7'); assert.equal(context.selection, 'thread'); assert.equal(context.truncated, true);
  assert.equal(context.url, 'https://inflite.ai/mail/#thread=thread-1'); assert.equal('text' in context, false);
  assert.equal(remote.calls.filter(path => path.startsWith('/api/messages/')).length, 6);
  assert.equal(remote.calls.includes('/api/messages/message-1'), false);
  const row = await env.ATLAS_DB.prepare('SELECT * FROM atlas_workspace_contexts WHERE owner=? AND conversation_id=?').bind('alice', conversation.id).first();
  assert.deepEqual(JSON.parse(row.source_json), { app: 'mail', kind: 'thread', threadId: 'thread-1' });
  assert.equal(JSON.stringify(row).includes('Private mail body'), false); assert.equal(JSON.stringify(row).includes('Untrusted'), false);
  assert.deepEqual((await contexts.getWorkspaceContext(env, 'alice', conversation.id)).context, [context]);
  const reads = remote.calls.length;
  for (const operation of [() => contexts.getWorkspaceContext(env, 'bob', conversation.id), () => contexts.clearWorkspaceContext(env, 'bob', conversation.id), () => contexts.setWorkspaceContext(env, 'bob', conversation.id, { app: 'mail', kind: 'thread', threadId: 'thread-1' }, { request: request() })]) await assert.rejects(operation, { code: 'not_found' });
  assert.equal(remote.calls.length, reads);
  const second = await store.createConversation(env, 'alice', { mode: 'personal' });
  assert.deepEqual((await contexts.getWorkspaceContext(env, 'alice', second.id)).context, []);
  await contexts.clearWorkspaceContext(env, 'alice', conversation.id);
  assert.deepEqual((await contexts.getWorkspaceContext(env, 'alice', conversation.id)).context, []);
  await contexts.setWorkspaceContext(env, 'alice', conversation.id, { app: 'mail', kind: 'thread', threadId: 'thread-1', messageId: 'message-2' }, { request: request() });
  await store.deleteConversation(env, 'alice', conversation.id);
  assert.equal((await env.ATLAS_DB.prepare('SELECT count(*) AS n FROM atlas_workspace_contexts').first()).n, 0);
});

test('Mail selection is reauthorized at the source and rejects foreign messages, switches, outages and archives', async t => {
  const { env, conversation } = await fixture(t), remote = mailFixture(env);
  const source = { app: 'mail', kind: 'thread', threadId: 'thread-1' };
  const attach = extra => contexts.setWorkspaceContext(env, 'alice', conversation.id, { ...source, ...extra }, { request: request() });
  remote.owner = 'bob';
  await assert.rejects(() => attach(), { code: 'session_changed' }); assert.deepEqual(remote.calls, ['/api/session']);
  remote.owner = 'alice'; remote.access = 'reauth'; remote.calls.length = 0;
  await assert.rejects(() => attach(), { code: 'identity_confirmation_required' }); assert.deepEqual(remote.calls, ['/api/session']);
  remote.access = 'ok'; remote.calls.length = 0;
  await assert.rejects(() => attach({ messageId: 'another-thread-message' }), { code: 'mail_context_not_found' });
  assert.equal(remote.calls.some(path => path.startsWith('/api/messages/')), false);
  await assert.rejects(() => attach({ threadId: '../session' }), { code: 'workspace_context_invalid' });
  remote.intercept = req => new URL(req.url).pathname === '/api/session' ? new Response('', { status: 503 }) : undefined;
  await assert.rejects(() => attach(), { code: 'mail_context_unavailable', status: 503 });
  remote.intercept = req => new URL(req.url).pathname === '/api/session' ? Response.json({}) : undefined;
  await assert.rejects(() => attach(), { code: 'mail_context_unavailable', status: 503 });
  remote.intercept = null;
  await attach({ messageId: 'message-2' });
  const saved = await contexts.getWorkspaceContext(env, 'alice', conversation.id);
  assert.equal(saved.context[0].selection, 'message'); assert.equal(saved.context[0].messageId, 'message-2'); assert.equal(saved.context[0].truncated, false);
  await store.updateConversation(env, 'alice', conversation.id, { archived: true });
  const reads = remote.calls.length;
  await assert.rejects(() => attach(), { code: 'conversation_archived' });
  await assert.rejects(() => contexts.clearWorkspaceContext(env, 'alice', conversation.id), { code: 'conversation_archived' });
  assert.equal(remote.calls.length, reads);
});

test('chat rereads the explicit Mail source, retains metadata for replies, and refuses unattended Mail reads', async t => {
  const { env, conversation } = await fixture(t), remote = mailFixture(env, { count: 2 });
  await connectProvider(env, 'alice', { key: 'sk-' + 'fixture'.repeat(8), model: 'gpt-6.2-sol' }, { send: async () => Response.json({ id: 'gpt-6.2-sol' }) });
  await contexts.setWorkspaceContext(env, 'alice', conversation.id, { app: 'mail', kind: 'thread', threadId: 'thread-1', messageId: 'message-1' }, { request: request() });
  remote.messages[0].text = 'Fresh private message fetched only for this turn.';
  remote.calls.length = 0;
  let providerCalls = 0;
  const send = async (url, init) => {
    providerCalls++; assert.equal(new URL(url).origin, 'https://api.openai.com');
    const body = JSON.parse(init.body), supplied = JSON.stringify(body.input);
    assert.match(supplied, /Fresh private message fetched only for this turn/); assert.doesNotMatch(supplied, /Private mail body 2/);
    assert.match(body.instructions, /emails.*untrusted source material/); assert.equal(body.store, false);
    return answer();
  };
  const options = { owner: 'alice', conversationId: conversation.id, requestId: crypto.randomUUID(), prompt: 'Draft a reply for review', request: request(), send };
  const result = await runAtlasPrompt(env, options);
  assert.equal(providerCalls, 1); assert.deepEqual(remote.calls, ['/api/session', '/api/threads/thread-1', '/api/messages/message-1']);
  assert.equal(result.message.context[0].messageId, 'message-1'); assert.equal(result.message.context[0].text, undefined);
  assert.equal(result.message.sources[0].url, 'https://inflite.ai/mail/#thread=thread-1');
  const stored = await env.ATLAS_DB.prepare('SELECT prompt,context_json FROM atlas_turns WHERE owner=? AND id=?').bind('alice', result.message.id).first();
  assert.equal(JSON.stringify(stored).includes(remote.messages[0].text), false);
  remote.calls.length = 0;
  await assert.rejects(() => runAtlasPrompt(env, { ...options, requestId: crypto.randomUUID(), scheduled: true, request: undefined }), { code: 'mail_context_interactive_only' });
  assert.equal(providerCalls, 1); assert.equal(remote.calls.length, 0);
});

test('activity is an owner-scoped bounded durable projection with native destinations and no provider poll', async t => {
  const { env, conversation } = await fixture(t);
  const developer = await store.createConversation(env, 'alice', { title: 'Review this change', mode: 'developer', repository: 'owner/project' });
  const run = await coding.createCodingRun(env, 'alice', { id: crypto.randomUUID(), conversationId: developer.id, requestId: crypto.randomUUID(), prompt: 'Private coding instruction must not reach activity', model: 'fixture', credentialUpdatedAt: 42, repository: 'owner/project' });
  const messageId = crypto.randomUUID();
  await store.createMessage(env, 'alice', conversation.id, { id: messageId, prompt: 'Private prompt' });
  await store.finishMessage(env, 'alice', messageId, { status: 'completed', answer: 'Private saved answer' });
  const brief = await store.createBrief(env, 'alice', { conversationId: conversation.id, messageId, title: 'Saved reply' });
  await store.createConversation(env, 'bob', { title: 'Foreign private title', mode: 'personal' });
  const response = await atlas(request('/atlas/api/activity?limit=9999'), env, { account, send: async () => assert.fail('activity never calls providers') });
  assert.equal(response.status, 200);
  const activity = await response.json(); assert.equal(activity.ready, true); assert.ok(activity.items.length <= 20);
  const task = activity.items.find(item => item.kind === 'coding'), saved = activity.items.find(item => item.kind === 'brief');
  assert.equal(task.runId, run.id); assert.equal(task.href, '/atlas/#tasks=' + run.id); assert.equal(task.title, developer.title);
  assert.equal(saved.briefId, brief.id); assert.equal(saved.href, '/atlas/#briefs=' + brief.id);
  assert.doesNotMatch(JSON.stringify(activity), /Foreign|Private coding|Private saved answer|Private prompt/);
  assert.equal((await coding.getCodingRun(env, 'alice', run.id)).status, run.status);
  assert.equal((await (await atlas(request('/atlas/api/activity?limit=1'), env, { account })).json()).items.length, 1);
  const foreign = await atlas(request('/atlas/api/conversations/' + developer.id + '/workspace-context'), env, { account: async () => Response.json({ signedIn: true, user: { id: 'bob' }, apps: { mail: true } }) });
  assert.equal(foreign.status, 404);
});

test('recent runs combines current owner records without exposing bodies or duplicating scheduled answers', async t => {
  const { env, conversation } = await fixture(t);
  const otherAccount = async () => Response.json({ signedIn: true, user: { id: 'bob' }, apps: { mail: true } });
  const developer = await store.createConversation(env, 'alice', { title: 'Repository repair', mode: 'developer', repository: 'owner/project' });
  const run = await coding.createCodingRun(env, 'alice', { id: 'coding-1', conversationId: developer.id, requestId: 'coding-request', prompt: 'Private coding prompt', model: 'fixture', credentialUpdatedAt: 42, repository: 'owner/project' });
  const schedule = await store.createTask(env, 'alice', { title: 'Weekly release review', prompt: 'Private schedule prompt', schedule_kind: 'interval', interval_minutes: 360 });
  await store.createMessage(env, 'alice', conversation.id, { id: 'answer-1', prompt: 'Private question' });
  await store.finishMessage(env, 'alice', 'answer-1', { status: 'completed', answer: 'Private response' });
  await store.createMessage(env, 'alice', schedule.conversation_id, { id: 'scheduled-answer', prompt: 'Private generated question', status: 'failed' });
  const other = await store.createConversation(env, 'bob', { title: 'Foreign conversation', mode: 'research' });
  await store.createMessage(env, 'bob', other.id, { id: 'scheduled-answer', prompt: 'Foreign question' });
  await env.ATLAS_DB.batch([
    env.ATLAS_DB.prepare('UPDATE atlas_turns SET updated_at=1000 WHERE owner=? AND id=?').bind('alice', 'answer-1'),
    env.ATLAS_DB.prepare('UPDATE atlas_coding_runs SET updated_at=2000 WHERE owner=? AND id=?').bind('alice', run.id),
    env.ATLAS_DB.prepare("INSERT INTO atlas_schedule_runs(owner,id,task_id,request_id,occurrence_key,status,started_at,finished_at,result) VALUES(?,?,?,?,?,'failed',?,?,?)")
      .bind('alice', 'scheduled-1', schedule.id, 'scheduled-answer', 'occurrence-1', 2500, 3000, 'Private scheduled result'),
  ]);
  const read = (path, identity = account) => atlas(request('/atlas/api/runs' + path), env, { account: identity, send: async () => assert.fail('Reading runs must not call a provider') });
  const response = await read('');
  assert.equal(response.status, 200);
  assert.match(response.headers.get('Cache-Control'), /no-store/);
  const { items } = await response.json();
  assert.deepEqual(items, [
    { kind: 'scheduled', id: 'scheduled-1', title: schedule.title, status: 'failed', updatedAt: 3000, scheduleId: schedule.id },
    { kind: 'coding', id: run.id, title: developer.title, status: run.status, updatedAt: 2000, conversationId: developer.id, reviewReady: false },
    { kind: 'answer', id: 'answer-1', title: conversation.title, status: 'completed', updatedAt: 1000, conversationId: conversation.id },
  ]);
  assert.deepEqual((await (await read('?limit=1')).json()).items, items.slice(0, 1));
  const firstPage = await (await read('?filter=all&limit=1')).json();
  assert.equal(firstPage.items[0].id, 'scheduled-1');
  assert.deepEqual((await (await read('?filter=all&before=' + encodeURIComponent(firstPage.next))).json()).items.map(item => item.id), [run.id, 'answer-1']);
  assert.deepEqual((await (await read('?filter=review')).json()).items.map(item => item.id), ['scheduled-1']);
  assert.deepEqual((await (await read('?filter=active')).json()).items.map(item => item.id), [run.id]);
  assert.deepEqual((await (await read('?filter=finished')).json()).items.map(item => item.id), ['answer-1']);
  assert.equal((await read('?filter=other')).status, 400);
  const savedAnswer = await (await read('/answer/answer-1?after=1')).json();
  assert.equal(savedAnswer.run.messageId, 'answer-1');
  assert.deepEqual(savedAnswer.events.map(event => event.status), ['completed']);
  assert.equal((await read('/answer/answer-1', otherAccount)).status, 404);
  assert.deepEqual((await (await read('', otherAccount)).json()).items.map(item => item.title), [other.title]);
  const standard = () => Response.json({ signedIn: true, user: { id: 'alice' }, apps: { mail: false } });
  assert.equal((await read('', standard)).status, 403);
});

test('recent runs remains available before coding storage is installed', async t => {
  const { env, conversation } = await fixture(t, { version: 6 });
  await store.createMessage(env, 'alice', conversation.id, { id: 'answer-only', prompt: 'Question' });
  const response = await atlas(request('/atlas/api/runs'), env, { account });
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).items.map(item => item.id), ['answer-only']);
  const health = await atlas(request('/atlas/api/health'), env, { account });
  assert.deepEqual((await health.json()).runs, { ready: false, backgroundAvailable: false });
});

async function runFixture(t) {
  const { env, conversation } = await fixture(t);
  env.ATLAS_VERIFY_KEY = 'fixture';
  env.APPS = { async fetch(req) {
    assert.equal(new URL(req.url).pathname, '/api/atlas-admin');
    assert.equal(req.headers.get('Authorization'), 'Bearer fixture');
    assert.equal(req.headers.get('Cookie'), null);
    return Response.json({ allowed: (await req.json()).owner === 'alice' });
  } };
  const model = 'gpt-6.2-sol', send = async () => assert.fail('The HTTP request must never call a provider');
  await connectProvider(env, 'alice', { key: 'sk-' + 'fixture'.repeat(8), model }, { send: async () => Response.json({ id: model }) });
  return {
    env, conversation, model,
    async call(path, body) {
      const response = await atlas(request('/atlas/api/runs' + path, { ...(body ? { method: 'POST', body } : {}) }), env, { account, send });
      return { status: response.status, data: await response.json() };
    },
  };
}

test('an expired pre-dispatch lease is fenced and recovered once without reusing its ledger', async t => {
  const { env, conversation, model, call } = await runFixture(t);
  const requestId = crypto.randomUUID(), path = '/background/' + requestId;
  const { data: { run } } = await call('', { conversationId: conversation.id, requestId, prompt: 'Resume a queued answer' });
  await store.reserveRequest(env, 'alice', { id: run.messageId, operation: 'chat', model, conversationId: conversation.id });
  await store.createMessage(env, 'alice', conversation.id, { id: run.messageId, prompt: 'Resume a queued answer' });
  await env.ATLAS_DB.prepare("UPDATE atlas_answer_runs SET status='running',checkpoint='preparing',lease_token='expired',lease_until=0 WHERE owner='alice' AND id=?").bind(run.id).run();
  const verifyAdmin = async owner => owner === 'alice';
  const send = async () => assert.fail('Recovery must first fence the previous attempt');
  assert.equal((await runDueAtlasAnswers(env, { verifyAdmin, send })).ran, 1);
  const recovered = (await call(path)).data;
  assert.equal(recovered.run.status, 'queued'); assert.equal(recovered.run.revision, 2);
  assert.notEqual(recovered.run.messageId, run.messageId);
  assert.equal(recovered.events.at(-1).checkpoint, 'requeued');
  await assert.rejects(() => store.markRequestDispatched(env, 'alice', run.messageId), { code: 'request_cancelled' });
  assert.equal((await call(path + '/stop', { revision: 1 })).status, 409);
  let dispatched = 0;
  const execute = async () => { dispatched++; return answer(); };
  const ticks = await Promise.all([runDueAtlasAnswers(env, { verifyAdmin, send: execute }), runDueAtlasAnswers(env, { verifyAdmin, send: execute })]);
  assert.equal(ticks.reduce((sum, tick) => sum + tick.ran, 0), 1);
  assert.equal(dispatched, 1);
  const finished = (await call(path)).data;
  assert.equal(finished.run.status, 'completed');
  assert.equal(finished.run.messageId, recovered.run.messageId);
});

test('an expired dispatched run retains its partial answer and requires explicit revision-bound resume', async t => {
  const { env, conversation, model, call } = await runFixture(t);
  const requestId = crypto.randomUUID(), path = '/background/' + requestId;
  const prompt = 'Finish the release checklist', savedDraft = 'A private saved draft checkpoint';
  const { data: { run } } = await call('', { conversationId: conversation.id, requestId, prompt });
  await store.reserveRequest(env, 'alice', { id: run.messageId, operation: 'chat', model, conversationId: conversation.id });
  await store.createMessage(env, 'alice', conversation.id, { id: run.messageId, prompt });
  await store.markRequestDispatched(env, 'alice', run.messageId);
  await env.ATLAS_DB.batch([
    env.ATLAS_DB.prepare("UPDATE atlas_answer_runs SET status='running',checkpoint='draft_saved',lease_token='expired',lease_until=0 WHERE owner='alice' AND id=?").bind(run.id),
    env.ATLAS_DB.prepare("UPDATE atlas_turns SET answer=? WHERE owner='alice' AND id=?").bind(savedDraft, run.messageId),
  ]);
  const verifyAdmin = async () => true;
  const noDispatch = async () => assert.fail('An already-dispatched request must never be replayed');
  const [one, two] = await Promise.all([runDueAtlasAnswers(env, { verifyAdmin, send: noDispatch }), runDueAtlasAnswers(env, { verifyAdmin, send: noDispatch })]);
  assert.equal(one.ran + two.ran, 1);
  const uncertain = (await call(path + '?limit=1')).data;
  assert.equal(uncertain.run.status, 'uncertain');
  assert.equal(uncertain.run.savedChars, savedDraft.length);
  assert.equal(uncertain.run.hasDraft, true); assert.equal(uncertain.run.canResume, true);
  assert.equal(uncertain.hasMore, true);
  const replay = (await call(path + '?after=' + uncertain.nextAfter)).data;
  assert.deepEqual(replay.events.map(event => event.checkpoint), ['draft_saved', 'interrupted']);
  assert.doesNotMatch(JSON.stringify(replay), /private saved draft/);
  assert.equal((await store.getMessage(env, 'alice', run.messageId)).answer, savedDraft);
  assert.equal((await store.getRequest(env, 'alice', run.messageId)).status, 'uncertain');
  assert.equal((await call(path + '/resume', { revision: 1 })).status, 409);
  const attempts = await Promise.all([call(path + '/resume', { revision: 1, confirm: true }), call(path + '/resume', { revision: 1, confirm: true })]);
  assert.deepEqual(attempts.map(item => item.status).sort(), [202, 409]);
  let dispatched = 0;
  await runDueAtlasAnswers(env, { verifyAdmin, send: async (_url, init) => {
    dispatched++; assert.match(init.body, /private saved draft checkpoint/); return answer();
  } });
  assert.equal(dispatched, 1);
  const completed = (await call(path)).data;
  assert.equal(completed.run.revision, 2); assert.equal(completed.run.status, 'completed');
  assert.deepEqual(completed.events.map(event => event.seq), [1, 2, 3, 4, 5, 6, 7]);
  assert.equal((await store.getMessage(env, 'alice', run.messageId)).answer, savedDraft);
  await store.deleteConversation(env, 'alice', conversation.id);
  assert.equal((await call(path)).status, 404);
  assert.equal((await env.ATLAS_DB.prepare('SELECT COUNT(*) AS count FROM atlas_run_events WHERE run_id=?').bind(run.id).first()).count, 0);
});

test('recovery finalizes an already-saved answer without dispatching it again', async t => {
  const { env, conversation, model, call } = await runFixture(t);
  const requestId = crypto.randomUUID(), prompt = 'Recover a completed answer';
  const { data: { run } } = await call('', { conversationId: conversation.id, requestId, prompt });
  await env.ATLAS_DB.prepare("UPDATE atlas_answer_runs SET status='running',checkpoint='dispatching',lease_token='expired',lease_until=0 WHERE owner='alice' AND id=?").bind(run.id).run();
  await store.reserveRequest(env, 'alice', { id: run.messageId, operation: 'chat', model, conversationId: conversation.id });
  await store.createMessage(env, 'alice', conversation.id, { id: run.messageId, prompt });
  await store.markRequestDispatched(env, 'alice', run.messageId);
  await store.finishRequest(env, 'alice', run.messageId, { status: 'completed', estimatedCostUsd: 0.01 });
  await store.finishMessage(env, 'alice', run.messageId, { status: 'completed', answer: 'Already saved' });
  await runDueAtlasAnswers(env, { verifyAdmin: async () => true, send: async () => assert.fail('The recorded result is authoritative') });
  const recovered = (await call('/background/' + requestId)).data;
  assert.equal(recovered.run.status, 'completed'); assert.equal(recovered.run.revision, 1);
  assert.equal(recovered.run.messageId, run.messageId);
  assert.deepEqual(recovered.events.map(event => event.checkpoint), ['queued', 'dispatching', 'reconciled']);
  assert.equal((await store.getRequest(env, 'alice', run.messageId)).estimated_cost_usd, 0.01);
});

test('account proof, explicit stop and Mail context gate background dispatch', async t => {
  const { env, conversation, call } = await runFixture(t);
  const requestId = crypto.randomUUID(), path = '/background/' + requestId;
  const body = { conversationId: conversation.id, requestId, prompt: 'Run when verified' };
  assert.equal((await call('', body)).status, 202);
  assert.equal((await call('', { ...body, requestId: crypto.randomUUID() })).data.code, 'run_active');
  const send = async () => assert.fail('This job is not approved for dispatch');
  assert.equal((await runDueAtlasAnswers(env, { verifyAdmin: async () => null, send })).ran, 0);
  assert.equal((await call(path)).data.run.status, 'queued');
  assert.equal((await call(path + '/stop', { revision: 1 })).data.run.status, 'cancelled');
  const revoked = crypto.randomUUID();
  assert.equal((await call('', { ...body, requestId: revoked })).status, 202);
  assert.equal((await runDueAtlasAnswers(env, { verifyAdmin: async () => false, send })).ran, 1);
  assert.equal((await call('/background/' + revoked)).data.run.errorCode, 'administrator_unavailable');
  const remote = mailFixture(env);
  await contexts.setWorkspaceContext(env, 'alice', conversation.id, { app: 'mail', kind: 'thread', threadId: 'thread-1' }, { request: request() });
  const previous = remote.calls.length;
  assert.equal((await call('', { ...body, requestId: crypto.randomUUID() })).data.code, 'mail_context_interactive_only');
  assert.equal(remote.calls.length, previous);
});

test('a running answer saves a real stream checkpoint and an explicit stop retains it', async t => {
  const { env, conversation, call } = await runFixture(t);
  const requestId = crypto.randomUUID(), path = '/background/' + requestId;
  const { data: { run } } = await call('', { conversationId: conversation.id, requestId, prompt: 'A long background answer' });
  const fragment = 'Saved answer detail. '.repeat(240);
  const packet = 'data: ' + JSON.stringify({ type: 'response.output_text.delta', delta: fragment }) + '\n\n';
  let controller;
  const body = new ReadableStream({ start(stream) { controller = stream; stream.enqueue(new TextEncoder().encode(packet)); } });
  const completion = runDueAtlasAnswers(env, { verifyAdmin: async () => true, send: async () => new Response(body, { headers: { 'Content-Type': 'text/event-stream' } }) });
  try {
    let timeline;
    for (let check = 0; check < 50; check++) {
      timeline = (await call(path)).data;
      if (timeline.run.checkpoint === 'draft_saved') break;
      await new Promise(resolve => setTimeout(resolve, 40));
    }
    assert.equal(timeline.run.checkpoint, 'draft_saved'); assert.ok(timeline.run.savedChars >= 4096);
    assert.equal((await call(path + '/stop', { revision: 1 })).data.run.status, 'stopping');
    assert.equal((await store.getRequest(env, 'alice', run.messageId)).cancel_requested, 1);
    await completion;
    const stopped = (await call(path)).data;
    assert.equal(stopped.run.status, 'cancelled');
    assert.deepEqual(stopped.events.map(event => event.checkpoint), ['queued', 'preparing', 'dispatching', 'draft_saved', 'stop_requested', 'cancelled']);
    assert.equal((await store.getMessage(env, 'alice', run.messageId)).answer, fragment);
  } finally {
    try { controller.close(); } catch {}
    await completion;
  }
});

test('schema eight keeps chat available, context requires explicit setup, and schema nine verifies its table', async t => {
  const { env, conversation } = await fixture(t, { version: 8 });
  assert.equal((await store.storageStatus(env)).ready, true);
  assert.deepEqual(await contexts.loadWorkspaceContext(env, 'alice', conversation.id), []);
  assert.deepEqual(await contexts.getWorkspaceContext(env, 'alice', conversation.id), { context: [], ready: false, requiredVersion: 9, code: 'storage_upgrade_required' });
  await assert.rejects(() => contexts.setWorkspaceContext(env, 'alice', conversation.id, { app: 'mail', kind: 'thread', threadId: 'thread-1' }, { request: request() }), { code: 'storage_upgrade_required' });
  await store.upgradeStorage(env);
  assert.equal((await contexts.workspaceContextStorageStatus(env)).ready, true);
  await env.ATLAS_DB.prepare('DROP TABLE atlas_workspace_contexts').run();
  assert.equal((await contexts.workspaceContextStorageStatus(env)).code, 'workspace_context_unavailable');
  await assert.rejects(() => contexts.loadWorkspaceContext(env, 'alice', conversation.id), { code: 'workspace_context_unavailable' });
  await store.upgradeStorage(env);
  assert.equal((await contexts.workspaceContextStorageStatus(env)).ready, true);
});

test('shared verifier credential failures are unknown, while explicit owner denial is authoritative', async t => {
  const { env } = await fixture(t);
  env.ATLAS_VERIFY_KEY = 'fixture-verifier'; env.ATLAS_AUTONOMY = '1';
  const task = await store.createTask(env, 'alice', { title: 'Scheduled fixture', prompt: 'A private task', mode: 'personal', interval_minutes: 60 });
  for (const status of [401, 403, 503]) {
    env.APPS = { fetch: async () => new Response('', { status }) };
    const activation = await atlas(request('/atlas/api/tasks', { method: 'PATCH', body: { id: task.id, enabled: true, confirm: true } }), env, { account, send: async () => assert.fail('no provider dispatch on unknown account') });
    assert.equal(activation.status, 503); assert.equal((await activation.json()).code, 'account_unavailable');
    const manual = await atlas(request('/atlas/api/tasks/' + task.id + '/run', { method: 'POST', body: { requestId: crypto.randomUUID(), confirm: true } }), env, { account, send: async () => assert.fail('no provider dispatch on unknown account') });
    assert.equal(manual.status, 200); assert.equal((await manual.json()).run.error_code, 'account_unavailable');
  }
  env.APPS = { fetch: async () => Response.json({ allowed: false }) };
  const denial = await atlas(request('/atlas/api/tasks', { method: 'PATCH', body: { id: task.id, enabled: true, confirm: true } }), env, { account });
  assert.equal(denial.status, 403); assert.equal((await denial.json()).code, 'administrator_unavailable');
});
