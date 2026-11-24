import test from 'node:test';
import assert from 'node:assert/strict';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import * as store from '../today/src/atlas-store.js';
import { saveCredential } from '../today/src/atlas-credentials.js';
import { summarizeConversation, runAtlasPrompt, cancelOwnerRequests } from '../today/src/atlas-chat.js';

const secret = 'sk-' + 'summaryfixture'.repeat(4), owner = 'summary-owner';
const uid = () => crypto.randomUUID();
const turnId = n => 'turn-' + String(n).padStart(5, '0');
function response(answer, status = 'completed') {
  return Response.json({ id: 'resp_summary_fixture', status, output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: answer, annotations: [] }] }], usage: { input_tokens: 100, output_tokens: 30, input_tokens_details: { cached_tokens: 0 } }, ...(status === 'incomplete' ? { incomplete_details: { reason: 'max_output_tokens' } } : {}) }, { headers: { 'x-request-id': 'req_summary_fixture' } });
}
function transport(payloads, answer = 'Updated summary with retained decisions.', status = 'completed') {
  return async (url, options) => { assert.equal(url, 'https://api.openai.com/v1/responses'); assert.equal(options.redirect, 'manual'); assert.equal(options.headers.Authorization, 'Bearer ' + secret); const payload = JSON.parse(options.body); assert.equal(payload.store, false); payloads.push(payload); return response(answer, status); };
}

test('conversation summaries preserve contiguous context using real D1 and isolated provider fixtures', { timeout: 60000 }, async t => {
  const mf = new Miniflare(convertV4MiniflareOptions({ modules: true, script: 'export default {fetch(){return new Response("fixture")}}', compatibilityDate: '2026-10-01', cf: false, d1Databases: ['ATLAS_DB'] }));
  t.after(() => mf.dispose());
  const env = { ATLAS_DB: await mf.getD1Database('ATLAS_DB'), ATLAS_ENCRYPTION_KEY: btoa('s'.repeat(32)) };
  await store.upgradeStorage(env); await saveCredential(env, owner, secret, 'gpt-6.2-sol'); await store.saveSettings(env, owner, { dailyRequestLimit: 100 });
  const db = env.ATLAS_DB;
  async function conversation(count, title = 'Summary fixture') {
    const row = await store.createConversation(env, owner, { title, mode: 'personal' });
    if (count) await db.prepare("WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM n WHERE x<?) INSERT INTO atlas_turns(owner,id,conversation_id,prompt,answer,status,created_at,updated_at) SELECT ?,'c-'||?||'-turn-'||printf('%05d',x),?,'Question '||printf('%05d',x),'Answer '||printf('%05d',x),'completed',x,x FROM n").bind(count, owner, row.id, row.id).run();
    row.turn = n => 'c-' + row.id + '-' + turnId(n); return row;
  }
  async function setSummary(row, through, summary = 'Earlier decisions remain important.') { await store.setConversationSummary(env, owner, row.id, { summary, throughId: row.turn(through) }); }

  await t.test('history beyond1000 is summarized oldest-first and advances only through the actual batch', async () => {
    const c = await conversation(1205), payloads = [];
    await db.prepare("UPDATE atlas_turns SET status='incomplete' WHERE owner=? AND id=?").bind(owner, c.turn(150)).run();
    const first = await summarizeConversation(env, owner, c.id, { requestId: uid() }, { send: transport(payloads, 'Summary of the first hundred turns.') });
    assert.equal(first.summarizedTurns, 100); assert.equal(first.hasMore, true); assert.equal(first.conversation.summary_through_id, c.turn(100));
    assert.match(payloads[0].input, /Question 00001/); assert.match(payloads[0].input, /Question 00100/); assert.doesNotMatch(payloads[0].input, /Question 00101|Question 01205/);
    const second = await summarizeConversation(env, owner, c.id, { requestId: uid() }, { send: transport(payloads, 'Summary of the first two hundred turns.') });
    assert.equal(second.summarizedTurns, 100); assert.equal(second.conversation.summary_through_id, c.turn(200)); assert.ok(payloads[1].input.includes('Summary of the first hundred turns.')); assert.match(payloads[1].input, /Question 00101/); assert.match(payloads[1].input, new RegExp(c.turn(150) + ' \\(incomplete\\)')); assert.doesNotMatch(payloads[1].input, /Question 00001|Question 00201/);
    assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM atlas_turns WHERE owner=? AND conversation_id=?').bind(owner, c.id).first()).n, 1205);
  });

  await t.test('the previous summary and whole answer tails survive the input budget', async () => {
    const c = await conversation(50), prior = 'DO NOT LOSE THIS EARLY DECISION. ' + 'p'.repeat(11000), payloads = [];
    await setSummary(c, 5, prior);
    const commands = Array.from({ length: 45 }, (_, i) => { const n = i + 6; return db.prepare('UPDATE atlas_turns SET answer=? WHERE owner=? AND id=?').bind('ANSWER START ' + n + ' ' + 'a'.repeat(7000) + ' ANSWER TAIL ' + n, owner, c.turn(n)); }); await db.batch(commands);
    const result = await summarizeConversation(env, owner, c.id, { requestId: uid() }, { send: transport(payloads) });
    assert.ok(payloads[0].input.includes(prior)); assert.ok(result.summarizedTurns > 0 && result.summarizedTurns < 45); assert.equal(result.hasMore, true);
    const last = 5 + result.summarizedTurns; assert.equal(result.conversation.summary_through_id, c.turn(last));
    for (let n = 6; n <= last; n++) assert.ok(payloads[0].input.includes('ANSWER TAIL ' + n), 'complete answer ' + n);
    assert.ok(!payloads[0].input.includes('ANSWER START ' + (last + 1) + ' ')); assert.ok(JSON.stringify(payloads[0].input).length <= 120000);
  });

  await t.test('a single long turn is included whole rather than advancing across a clipped answer', async () => {
    const c = await conversation(2), payloads = [];
    await db.prepare('UPDATE atlas_turns SET answer=? WHERE owner=? AND id=?').bind('LARGE START ' + 'a'.repeat(230000) + ' IMPORTANT FINAL DECISION', owner, c.turn(1)).run();
    const result = await summarizeConversation(env, owner, c.id, { requestId: uid() }, { send: transport(payloads) });
    assert.equal(result.summarizedTurns, 1); assert.equal(result.hasMore, true); assert.equal(result.conversation.summary_through_id, c.turn(1)); assert.match(payloads[0].input, /IMPORTANT FINAL DECISION/); assert.doesNotMatch(payloads[0].input, /Question 00002/);
  });

  await t.test('a running earlier turn blocks advancing past an answer that may still arrive', async () => {
    const c = await conversation(4), payloads = [];
    await db.prepare('UPDATE atlas_turns SET created_at=created_at+?,updated_at=updated_at+? WHERE owner=? AND conversation_id=?').bind(Date.now(), Date.now(), owner, c.id).run();
    await db.prepare("UPDATE atlas_turns SET status='running',answer='' WHERE owner=? AND id=?").bind(owner, c.turn(2)).run();
    const first = await summarizeConversation(env, owner, c.id, { requestId: uid() }, { send: transport(payloads) });
    assert.equal(first.summarizedTurns, 1); assert.equal(first.hasMore, true); assert.equal(first.conversation.summary_through_id, c.turn(1));
    await assert.rejects(() => summarizeConversation(env, owner, c.id, { requestId: uid() }, { send: transport(payloads) }), { code: 'summary_response_running' });
    assert.equal(payloads.length, 1);
  });

  await t.test('a slow concurrent summary cannot replace a newer committed summary', async () => {
    const c = await conversation(3); let release, dispatched;
    const started = new Promise(resolve => { dispatched = resolve; }), gate = new Promise(resolve => { release = resolve; });
    const slow = summarizeConversation(env, owner, c.id, { requestId: uid() }, { send: async () => { dispatched(); await gate; return response('STALE SUMMARY'); } });
    const rejected = assert.rejects(slow, { code: 'summary_changed' });
    await started;
    const newer = await summarizeConversation(env, owner, c.id, { requestId: uid() }, { send: transport([], 'NEWER SUMMARY') });
    assert.equal(newer.conversation.summary, 'NEWER SUMMARY'); release(); await rejected;
    assert.equal((await store.getConversation(env, owner, c.id)).summary, 'NEWER SUMMARY');
  });

  await t.test('key-removal cancellation during history preparation prevents dispatch with the already-loaded key', async () => {
    const c = await conversation(3), payloads = [], requestId = uid(); let entered, release;
    const reading = new Promise(resolve => { entered = resolve; }), gate = new Promise(resolve => { release = resolve; });
    const delayed = { ...env, ATLAS_DB: {
      prepare(sql) {
        const statement = db.prepare(sql);
        if (!sql.startsWith('SELECT * FROM atlas_turns') || !sql.includes('ORDER BY created_at,id LIMIT')) return statement;
        return { bind(...values) { const bound = statement.bind(...values); return { async all() { entered(); await gate; return bound.all(); } }; } };
      },
      batch: statements => db.batch(statements)
    } };
    const work = summarizeConversation(delayed, owner, c.id, { requestId }, { send: transport(payloads) });
    const rejected = assert.rejects(work, { code: 'request_cancelled' });
    await reading; await cancelOwnerRequests(env, owner); release(); await rejected;
    assert.equal(payloads.length, 0); assert.equal(await store.getRequest(env, owner, requestId), null); assert.equal((await store.getConversation(env, owner, c.id)).summary, '');
    // The preflight control is released even when cancellation happens before
    // a ledger reservation, so a later deliberate request can use the thread.
    await summarizeConversation(env, owner, c.id, { requestId: uid() }, { send: transport(payloads) }); assert.equal(payloads.length, 1);
  });

  await t.test('up-to-date, incomplete and foreign summaries do not overwrite retained history', async () => {
    const c = await conversation(2), payloads = []; await setSummary(c, 1, 'Retain this existing summary.');
    await assert.rejects(() => summarizeConversation(env, owner, c.id, { requestId: uid() }, { send: transport(payloads, 'Partial summary', 'incomplete') }), { code: 'summary_incomplete' });
    assert.equal((await store.getConversation(env, owner, c.id)).summary, 'Retain this existing summary.'); assert.equal((await store.getConversation(env, owner, c.id)).summary_through_id, c.turn(1));
    await setSummary(c, 2); const before = payloads.length;
    await assert.rejects(() => summarizeConversation(env, owner, c.id, { requestId: uid() }, { send: transport(payloads) }), { code: 'summary_current' }); assert.equal(payloads.length, before);
    await saveCredential(env, 'different-owner', secret, 'gpt-6.2-sol');
    await assert.rejects(() => summarizeConversation(env, 'different-owner', c.id, { requestId: uid() }, { send: transport(payloads) }), { code: 'conversation_not_found' }); assert.equal(payloads.length, before);
  });

  await t.test('history markers before and within the latest200 rows never re-add summarized turns', async () => {
    for (const boundary of [100, 400]) {
      const c = await conversation(420), payloads = []; await setSummary(c, boundary, 'Prior summary for boundary ' + boundary);
      await runAtlasPrompt(env, { owner, conversationId: c.id, requestId: uid(), prompt: 'Continue from retained context.', send: transport(payloads, 'A continued answer.') });
      const input = payloads[0].input; assert.ok(input[0].content.includes('Prior summary for boundary ' + boundary)); assert.ok(input.some(message => message.content.includes('Question 00420')));
      assert.ok(!JSON.stringify(input).includes('Question ' + String(boundary).padStart(5, '0')));
      if (boundary === 400) { assert.ok(input.some(message => message.content.includes('Question 00401'))); assert.ok(!JSON.stringify(input).includes('Question 00399')); }
    }
  });

  await t.test('bounded history keeps user/assistant pairs together and labels incomplete excerpts', async () => {
    const c = await conversation(10), payloads = []; await setSummary(c, 1, 'Decision: ' + 's'.repeat(10000));
    await db.batch(Array.from({ length: 9 }, (_, i) => { const n = i + 2; return db.prepare('UPDATE atlas_turns SET prompt=?,answer=?,status=? WHERE owner=? AND id=?').bind('PAIR-' + n + '-USER ' + 'u'.repeat(11000), 'PAIR-' + n + '-ANSWER ' + 'a'.repeat(23000), n === 2 ? 'incomplete' : 'completed', owner, c.turn(n)); }));
    await runAtlasPrompt(env, { owner, conversationId: c.id, requestId: uid(), prompt: 'Follow-up question', send: transport(payloads, 'Follow-up answer.') });
    const history = payloads[0].input.slice(0, -1); assert.ok(history.reduce((n, item) => n + item.content.length, 0) <= 100000);
    const pairs = history.filter(item => /^PAIR-\d+-(?:USER|ANSWER)/.test(item.content)); assert.ok(pairs.length >= 2 && pairs.length % 2 === 0);
    for (let i = 0; i < pairs.length; i += 2) { assert.equal(pairs[i].role, 'user'); assert.equal(pairs[i + 1].role, 'assistant'); assert.equal(/^PAIR-(\d+)/.exec(pairs[i].content)[1], /^PAIR-(\d+)/.exec(pairs[i + 1].content)[1]); }
  });
});
