import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { qualitySuite, evaluateQuality, collectQuality } from '../tools/atlas-quality.mjs';

const complete = () => ({ suite: qualitySuite.suite, model: 'fixture', results: qualitySuite.cases.map((item, i) => ({ caseId: item.id, answer: 'Fixture answer for evaluator verification only.', sources: item.minimumSources ? [{ url: 'https://developers.openai.com/api/docs/guides/responses', title: 'Fixture source' }] : [], status: 'completed', durationMs: (i + 1) * 1000, estimatedCostUsd: i === 0 ? null : 0.01, review: null })) });

test('automated fixture passes never masquerade as measured human answer quality', () => {
  const report = evaluateQuality(complete());
  assert.equal(report.outcome, 'needs_review'); assert.equal(report.totals.automaticPasses, 8); assert.equal(report.totals.humanReviewed, 0);
  assert.equal(report.totals.latencyP50Ms, 4000); assert.equal(report.totals.latencyP95Ms, 8000);
  assert.equal(report.totals.unknownCostCases, 1); assert.ok(Math.abs(report.totals.knownEstimatedCostUsd - 0.07) < 1e-9);
});

test('quality evaluation needs complete coverage and meaningful recorded review', () => {
  const record = complete();
  for (const item of record.results) item.review = { correctness: 4, grounding: 3, usefulness: 4, reviewer: 'fixture-reviewer' };
  assert.equal(evaluateQuality(record).outcome, 'pass');
  record.results[1].review.grounding = 2; assert.equal(evaluateQuality(record).outcome, 'fail');
  record.results[1].review.grounding = 3; record.results.pop();
  assert.equal(evaluateQuality(record).outcome, 'needs_review'); assert.equal(evaluateQuality(record).missing.length, 1);
});

test('missing citations, wrong primary sources, unsafe URLs, incomplete answers and verbose output fail surface checks', () => {
  for (const change of [item => { item.sources = []; }, item => { item.sources = [{ url: 'https://unrelated.example/' }]; }, item => { item.sources.push({ url: 'javascript:alert(1)' }); }, item => { item.status = 'incomplete'; }, item => { item.answer = 'word '.repeat(601); }]) {
    const record = complete(); change(record.results[0]); assert.equal(evaluateQuality(record).outcome, 'fail');
  }
});

test('invalid, duplicated or incomparable result records are rejected', () => {
  assert.throws(() => evaluateQuality({ ...complete(), suite: 'other' }), /does not match/);
  const duplicate = complete(); duplicate.results.push(duplicate.results[0]); assert.throws(() => evaluateQuality(duplicate), /duplicate/);
  const invalid = complete(); invalid.results[0].durationMs = -1; assert.throws(() => evaluateQuality(invalid), /Invalid quality metric/);
  const review = complete(); review.results[0].review = { correctness: 5, grounding: 4, usefulness: 4, reviewer: 'fixture' }; assert.throws(() => evaluateQuality(review), /from0 to4/);
});

test('optional collector has an explicit usage gate and never sends cookies to another origin', async () => {
  const send = async () => assert.fail('must not dispatch');
  await assert.rejects(() => collectQuality({ send }), /confirm-api-usage/);
  await assert.rejects(() => collectQuality({ confirmUsage: true, baseURL: 'https://evil.example', cookie: 'account=' + 'a'.repeat(30), send }), /InFlite HTTPS/);
});

test('optional collector captures real route-shaped results, archives test conversations and retains pending human review', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'atlas-quality-')); t.after(() => rm(dir, { recursive: true, force: true }));
  const output = join(dir, 'results.json'), cookie = 'account=' + 'a'.repeat(30), calls = [], marker = 'a'.repeat(32);
  const send = async (url, options) => {
    assert.ok(url.startsWith('https://next.inflite.ai/atlas/api/')); assert.equal(options.redirect, 'manual'); assert.equal(options.headers.Cookie, cookie);
    if (calls.length) assert.equal(options.headers['X-Atlas-Owner'], marker);
    const path = new URL(url).pathname.split('/api/')[1]; calls.push({ path, method: options.method });
    let data;
    if (path === 'health') data = { storage: { ready: true }, provider: { decryptable: true, model: 'fixture' } };
    else if (path === 'settings') data = { memoryEnabled: false };
    else if (path === 'conversations') data = { conversation: { id: 'fixture-' + calls.length } };
    else if (path === 'chat') data = { message: { answer: 'Fixture answer', status: 'completed', sources: [{ url: 'https://developers.openai.com/api/docs/guides/responses' }] }, usage: { estimatedCostUsd: 0.01 } };
    else { assert.equal(options.method, 'PATCH'); assert.equal(JSON.parse(options.body).archived, true); data = {}; }
    return Response.json(data, { headers: { 'X-Atlas-Owner': marker } });
  };
  const record = await collectQuality({ baseURL: 'https://next.inflite.ai', cookie, output, confirmUsage: true, send });
  assert.equal(record.results.length, 8); assert.equal(calls.filter(c => c.path === 'chat').length, 9);
  assert.equal(calls.filter(c => c.method === 'PATCH').length, 8);
  const saved = await readFile(output, 'utf8'); assert.ok(!saved.includes(cookie)); assert.equal(JSON.parse(saved).results.length, 8);
  assert.equal(evaluateQuality(record).outcome, 'needs_review');
});

test('optional collector saves an incomplete case then stops without more paid calls or archiving it', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'atlas-quality-incomplete-')); t.after(() => rm(dir, { recursive: true, force: true }));
  const output = join(dir, 'results.json'), calls = [], marker = 'a'.repeat(32);
  const send = async (url, options) => {
    const path = new URL(url).pathname.split('/api/')[1]; calls.push({ path, method: options.method });
    let data;
    if (path === 'health') data = { storage: { ready: true }, provider: { decryptable: true, model: 'fixture' } };
    else if (path === 'settings') data = { memoryEnabled: false };
    else if (path === 'conversations') data = { conversation: { id: 'fixture-incomplete' } };
    else if (path === 'chat') data = { message: { answer: 'Partial fixture answer', status: 'incomplete', sources: [] }, usage: { estimatedCostUsd: 0.01 } };
    else assert.fail('An incomplete case must not be archived or followed by more API work.');
    return Response.json(data, { headers: { 'X-Atlas-Owner': marker } });
  };
  await assert.rejects(() => collectQuality({ baseURL: 'https://next.inflite.ai', cookie: 'account=' + 'a'.repeat(30), output, confirmUsage: true, send }), { code: 'benchmark_incomplete' });
  assert.equal(calls.filter(call => call.path === 'chat').length, 1); assert.equal(calls.filter(call => call.method === 'PATCH').length, 0);
  const saved = JSON.parse(await readFile(output, 'utf8'));
  assert.equal(saved.results.length, 1); assert.equal(saved.results[0].status, 'incomplete'); assert.equal(saved.results[0].answer, 'Partial fixture answer'); assert.equal(saved.results[0].estimatedCostUsd, 0.01);
  assert.equal(evaluateQuality(saved).outcome, 'fail');
});
