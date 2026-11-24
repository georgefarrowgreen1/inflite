import { readFileSync, writeFileSync, renameSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const qualitySuite = JSON.parse(readFileSync(new URL('../atlas/quality/cases.json', import.meta.url), 'utf8'));
const finite = (value, name) => { if (!Number.isFinite(value) || value < 0) throw Error('Invalid quality metric: ' + name); return value; };
const percentile = (values, p) => values.length ? [...values].sort((a, b) => a - b)[Math.max(0, Math.ceil(values.length * p) - 1)] : null;

export function evaluateQuality(record, suite = qualitySuite) {
  if (record?.suite !== suite.suite || !Array.isArray(record.results)) throw Error('Quality suite does not match');
  const allowed = new Map(suite.cases.map(item => [item.id, item])), observed = new Set();
  const results = record.results.map(item => {
    const spec = allowed.get(item.caseId);
    if (!spec || observed.has(item.caseId)) throw Error('Unknown or duplicate quality case');
    observed.add(item.caseId);
    if (typeof item.answer !== 'string' || !Array.isArray(item.sources)) throw Error('Invalid quality answer');
    finite(item.durationMs, 'durationMs');
    if (item.estimatedCostUsd != null) finite(item.estimatedCostUsd, 'estimatedCostUsd');
    const urls = item.sources.map(source => { try { const url = new URL(source.url); return url.protocol === 'https:' && !url.username && !url.password ? url : null; } catch { return null; } });
    const unique = [...new Set(urls.filter(Boolean).map(url => url.href))];
    const checks = {
      completed: item.status === 'completed' && !!item.answer.trim(),
      sourceCount: unique.length >= spec.minimumSources,
      sourceSafety: urls.every(Boolean),
      primarySource: !spec.sourceHosts || urls.some(url => url && spec.sourceHosts.includes(url.hostname)),
      length: item.answer.trim().split(/\s+/).filter(Boolean).length <= spec.maxWords,
    };
    let review = null;
    if (item.review != null) {
      for (const key of ['correctness', 'grounding', 'usefulness']) if (!Number.isInteger(item.review[key]) || item.review[key] < 0 || item.review[key] > 4) throw Error('Human review scores must be integers from0 to4');
      if (typeof item.review.reviewer !== 'string' || !item.review.reviewer.trim()) throw Error('Human review needs a reviewer identifier');
      review = { correctness: item.review.correctness, grounding: item.review.grounding, usefulness: item.review.usefulness, reviewer: item.review.reviewer };
    }
    const automaticPass = Object.values(checks).every(Boolean);
    const reviewedPass = review && ['correctness', 'grounding', 'usefulness'].every(key => review[key] >= 3);
    return { caseId: item.caseId, checks, automaticPass, review, outcome: !automaticPass || (review && !reviewedPass) ? 'fail' : review ? 'pass' : 'needs_review', durationMs: item.durationMs, estimatedCostUsd: item.estimatedCostUsd ?? null };
  });
  const missing = suite.cases.filter(item => !observed.has(item.id)).map(item => item.id);
  const knownCosts = results.filter(item => item.estimatedCostUsd != null);
  return {
    suite: suite.suite, model: record.model || null, recordedAt: record.recordedAt || null,
    outcome: results.some(item => item.outcome === 'fail') ? 'fail' : missing.length || results.some(item => item.outcome === 'needs_review') ? 'needs_review' : 'pass',
    missing, results,
    totals: { cases: results.length, automaticPasses: results.filter(item => item.automaticPass).length, humanReviewed: results.filter(item => item.review).length, latencyP50Ms: percentile(results.map(item => item.durationMs), 0.5), latencyP95Ms: percentile(results.map(item => item.durationMs), 0.95), knownEstimatedCostUsd: knownCosts.reduce((sum, item) => sum + item.estimatedCostUsd, 0), unknownCostCases: results.length - knownCosts.length },
    note: 'Automatic checks cannot establish factual correctness or whether a citation supports a claim. A passing quality result requires a recorded human review for every case. Costs are estimates, not provider invoices.'
  };
}

function writeReport(file, value) {
  const target = resolve(file), temporary = target + '.tmp';
  writeFileSync(temporary, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
  renameSync(temporary, target);
}

// This optional collector uses an already-configured Atlas owner connection. It
// never reads or provisions an OpenAI key. There are no automatic paid retries.
export async function collectQuality({ baseURL, cookie, output, confirmUsage = false, send = fetch } = {}) {
  if (!confirmUsage) throw Error('Use --confirm-api-usage to run the benchmark with your saved Atlas connection.');
  if (!['https://inflite.ai', 'https://next.inflite.ai'].includes(baseURL)) throw Error('Choose the production or staging InFlite HTTPS origin.');
  if (typeof cookie !== 'string' || !/^(?:__Secure-)?account=[A-Za-z0-9_-]{20,100}$/.test(cookie)) throw Error('ATLAS_SESSION_COOKIE must contain only the current account cookie.');
  if (!output) throw Error('Choose a private output file for the benchmark results.');
  let marker;
  const api = async (path, method = 'GET', body) => {
    const response = await send(baseURL + '/atlas/api/' + path, { method, redirect: 'manual', signal: AbortSignal.timeout(150000), headers: { Cookie: cookie, Origin: baseURL, 'X-Inflite': '1', 'Content-Type': 'application/json', ...(marker ? { 'X-Atlas-Owner': marker } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const raw = await response.text();
    let data; try { data = JSON.parse(raw); } catch { throw Error('Atlas returned an unreadable benchmark response.'); }
    const next = response.headers.get('X-Atlas-Owner');
    if (marker && next !== marker) throw Error('The Atlas account changed; benchmark stopped.');
    if (next) marker = next;
    if (!response.ok) throw Object.assign(new Error('Atlas benchmark request failed: ' + (/^[a-z_]+$/.test(data.code) ? data.code : response.status)), { code: data.code });
    return data;
  };
  const health = await api('health'), settings = await api('settings');
  if (!health.storage?.ready || !health.provider?.decryptable) throw Error('Finish Atlas storage and provider setup before collecting quality results.');
  if (settings.memoryEnabled) throw Error('Turn off shared personal memory for a controlled benchmark run.');
  const record = { suite: qualitySuite.suite, model: health.provider.model, recordedAt: new Date().toISOString(), results: [] };
  writeReport(output, record);
  for (const spec of qualitySuite.cases) {
    let conversation, answer = '', sources = [], status = 'failed', cost = 0, unknownCost = false;
    const started = performance.now();
    try {
      ({ conversation } = await api('conversations', 'POST', { title: 'Quality benchmark: ' + spec.id, mode: spec.mode }));
      for (const prompt of spec.turns) {
        const response = await api('chat', 'POST', { conversationId: conversation.id, requestId: crypto.randomUUID(), prompt, stream: false, includeFitness: false });
        answer = response.message.answer; sources = response.message.sources; status = response.message.status;
        if (response.usage?.estimatedCostUsd == null) unknownCost = true; else cost += response.usage.estimatedCostUsd;
        if (status !== 'completed') break;
      }
      record.results.push({ caseId: spec.id, conversationId: conversation.id, answer, sources, status, durationMs: Math.round(performance.now() - started), estimatedCostUsd: unknownCost ? null : cost, review: null });
      writeReport(output, record);
      if (status !== 'completed') throw Object.assign(new Error('Atlas benchmark stopped because the case did not complete. Its partial result has been saved.'), { code: 'benchmark_incomplete' });
      await api('conversations/' + conversation.id, 'PATCH', { archived: true });
    } catch (error) {
      if (!record.results.some(item => item.caseId === spec.id)) record.results.push({ caseId: spec.id, conversationId: conversation?.id || null, answer, sources, status: 'failed', errorCode: /^[a-z_]+$/.test(error.code) ? error.code : 'benchmark_interrupted', durationMs: Math.round(performance.now() - started), estimatedCostUsd: null, review: null });
      writeReport(output, record);
      throw error;
    }
  }
  return record;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [command, file, ...flags] = process.argv.slice(2);
  try {
    if (command === 'evaluate' && file) console.log(JSON.stringify(evaluateQuality(JSON.parse(readFileSync(file, 'utf8'))), null, 2));
    else if (command === 'run' && file) { const record = await collectQuality({ baseURL: process.env.ATLAS_BASE_URL || 'https://next.inflite.ai', cookie: process.env.ATLAS_SESSION_COOKIE, output: file, confirmUsage: flags.includes('--confirm-api-usage') }); console.log(JSON.stringify(evaluateQuality(record), null, 2)); }
    else throw Error('Usage: node tools/atlas-quality.mjs evaluate RESULTS.json | run RESULTS.json --confirm-api-usage');
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
