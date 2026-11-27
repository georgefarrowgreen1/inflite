import { ask, accountCookie, setCookies } from './account.js';
import { appFetch } from './apps.js';
import { bodyUpTo } from './body.js';
import { atlasPage } from './atlas-page.js';
import * as store from './atlas-store.js';
import { providerStatus, connectProvider, disconnectProvider, availableModels } from './atlas-provider.js';
import { testProvider, summarizeConversation, preparePatch, runAtlasPrompt, streamAtlasPrompt, cancelAtlasRequest, cancelOwnerRequests, executeScheduledAtlas, safeFailure, requestIdentifier } from './atlas-chat.js';
import * as repository from './atlas-repository.js';
import { runAtlasTask, stopScheduledOccurrence } from './atlas-scheduler.js';
import { evolution } from './atlas-evolution.js';
import * as coding from './atlas-coding.js';
import { requireOpenAtlasIncident } from './atlas-incidents.js';
import * as environments from './atlas-environments.js';
import { workspaceContextStorageStatus, getWorkspaceContext, setWorkspaceContext, clearWorkspaceContext } from './atlas-workspace-context.js';
import { atlasActivity, atlasRunAlerts, atlasRuns } from './atlas-activity.js';
import { enqueueAtlasAnswer, resumeAtlasAnswer, stopAtlasAnswer } from './atlas-run-coordinator.js';
import { publicAnswerRun, readAtlasRunTimeline, runTimelineStorage, streamRunTimeline } from './atlas-run-timeline.js';
import { parallelResearchStorage } from './atlas-parallel-research.js';
import { readAtlasRunDraft } from './atlas-run-drafts.js';

const PRIVATE = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Cross-Origin-Resource-Policy': 'same-origin', 'Referrer-Policy': 'no-referrer' };
const API_CSP = "default-src 'none'; frame-ancestors 'none'";
const fail = (code, message, status = 400) => { throw Object.assign(new Error(message), { code, status }); };
const absent = () => fail('not_found', 'This Atlas item could not be found.', 404);

function scheduleAvailability(env) {
  if (env.ATLAS_AUTONOMY !== '1') return { available: false, reason: 'Background scheduling is paused in the deployment. You can save tasks and run them manually.' };
  if (!env.ATLAS_VERIFY_KEY) return { available: false, reason: 'Background scheduling needs the account-service verification key.' };
  return { available: true };
}

async function input(request, limit = 65536) {
  const raw = await bodyUpTo(request, limit);
  if (raw === null) fail('request_too_large', 'This request is too large.', 413);
  let body;
  try { body = JSON.parse(raw); } catch { fail('request_invalid', 'Atlas could not read this request.'); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) fail('request_invalid', 'Atlas could not read this request.');
  return body;
}

function markdownSources(sources) {
  return sources?.length ? '\n\n### Sources\n\n' + sources.map((s, i) => `${i + 1}. ${String(s.title || s.url).replace(/[\r\n]/g, ' ')} — ${s.url}`).join('\n') : '';
}

function download(text, title, headers) {
  const filename = String(title || 'atlas').replace(/[^a-zA-Z0-9_-]+/g, '-').slice(0, 80) || 'atlas';
  return new Response(text, { headers: { ...headers, 'Content-Type': 'text/markdown; charset=utf-8', 'Content-Disposition': `attachment; filename="${filename}.md"`, 'Content-Security-Policy': API_CSP } });
}

function exportConversation(env, owner, conversation, headers) {
  const encoder = new TextEncoder(), turns = store.iterateMessages(env, owner, conversation.id);
  let first = true;
  const stream = new ReadableStream({
    async pull(controller) {
      try {
        if (first) {
          first = false;
          controller.enqueue(encoder.encode('# ' + conversation.title + '\n\nWorkspace: ' + conversation.mode + (conversation.repository ? '\nRepository: ' + conversation.repository : '') + '\n'));
          return;
        }
        const next = await turns.next();
        if (next.done) { controller.close(); return; }
        const m = next.value;
        controller.enqueue(encoder.encode('\n---\n\n## You\n\n' + m.prompt + '\n\n## Atlas\n\nStatus: ' + m.status + '\n\n' + m.answer + markdownSources(m.sources) + '\n'));
      } catch (error) { controller.error(error); }
    },
    async cancel() { await turns.return(); }
  });
  return download(stream, conversation.title, headers);
}

// The account service remains authoritative for every page, asset and API call.
// An opaque identity marker lets the client discard late responses after an
// account switch without exposing an email or raw account identifier.
export async function atlas(request, env, { account = ask, send = fetch, ctx } = {}) {
  const renewals = new Map();
  const rememberCookies = response => {
    for (const cookie of setCookies(response)) {
      const match = /^((?:__Secure-)?account|ifl_rw)=/.exec(cookie);
      if (match) renewals.set(match[1], cookie);
    }
  };
  const response = await handleAtlas(request, env, { account, send, ctx, rememberCookies });
  for (const cookie of renewals.values()) response.headers.append('Set-Cookie', cookie);
  return response;
}

async function handleAtlas(request, env, { account, send, ctx, rememberCookies }) {
  const url = new URL(request.url), started = Date.now(), diagnosticId = crypto.randomUUID();
  let headers = { ...PRIVATE };
  const json = (data, status = 200) => Response.json(data, { status, headers: { ...headers, 'Content-Security-Policy': API_CSP } });
  const accountUnavailable = () => json({ error: 'InFlite could not check your account right now. Your work is still saved. Try again shortly.', code: 'account_unavailable' }, 503);
  const accountData = async (response, limit) => JSON.parse(await bodyUpTo(response, limit, { signal: AbortSignal.any([request.signal, AbortSignal.timeout(8000)]) }));
  if (!accountCookie(request)) return json({ error: 'Sign in to InFlite to open Atlas.', code: 'sign_in_required' }, 401);
  let view, identityResponse;
  try {
    const result = identityResponse = await account(env, request, { path: 'today/me', timeout: 8000 });
    if (result?.status === 401) { rememberCookies(result); return json({ error: 'Sign in to InFlite to open Atlas.', code: 'sign_in_required' }, 401); }
    if (result?.status === 403) { rememberCookies(result); return json({ error: 'Atlas is available to InFlite administrators.', code: 'access_denied' }, 403); }
    if (!result?.ok) return accountUnavailable();
    view = await accountData(result, 65536);
  } catch { return accountUnavailable(); }
  if (view?.signedIn === false) { rememberCookies(identityResponse); return json({ error: 'Sign in to InFlite to open Atlas.', code: 'sign_in_required' }, 401); }
  if (view?.signedIn !== true || !view?.user?.id || !['string', 'number'].includes(typeof view.user.id)) return accountUnavailable();
  rememberCookies(identityResponse);
  if (view?.apps?.mail !== true) return json({ error: 'Atlas is available to InFlite administrators.', code: 'access_denied' }, 403);
  const owner = String(view.user.id);
  const ownerMarker = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode('atlas-owner:' + owner))), b => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
  headers['X-Atlas-Owner'] = ownerMarker;
  if (request.headers.has('X-Atlas-Owner') && request.headers.get('X-Atlas-Owner') !== ownerMarker) return json({ error: 'The signed-in account changed. Reload Atlas before continuing.', code: 'session_changed' }, 409);
  const fresh = async () => {
    let proof, response;
    try {
      response = await account(env, request, { path: 'atlas/fresh', timeout: 8000 });
      if (response?.ok) proof = await accountData(response, 4096);
    } catch {}
    if ([401, 403].includes(response?.status) || proof?.fresh === false) { rememberCookies(response); fail('identity_confirmation_required', 'Confirm your identity in InFlite, then try again.', 403); }
    if (!response?.ok || proof?.fresh !== true || !proof.owner) fail('account_unavailable', 'InFlite could not confirm your identity right now. Try again shortly.', 503);
    rememberCookies(response);
    if (String(proof.owner) !== owner) fail('session_changed', 'The signed-in account changed. Reload Atlas before continuing.', 409);
  };
  const verifyAdmin = async candidate => {
    if (String(candidate) !== owner) return false;
    try {
      if (env.ATLAS_VERIFY_KEY) {
        const response = await appFetch(env, 'https://account.inflite.ai/api/atlas-admin', { method: 'POST', headers: { Authorization: 'Bearer ' + env.ATLAS_VERIFY_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ owner }), redirect: 'manual', signal: AbortSignal.timeout(8000) });
        // A shared service key rejection is not evidence of owner revocation.
        if (!response.ok) return null;
        const proof = await accountData(response, 4096);
        return typeof proof?.allowed === 'boolean' ? proof.allowed : null;
      }
      const response = await account(env, request, { path: 'today/me', timeout: 8000 });
      if ([401, 403].includes(response?.status)) { rememberCookies(response); return false; }
      if (!response?.ok) return null;
      const current = await accountData(response, 65536);
      if (current?.signedIn === false) { rememberCookies(response); return false; }
      if (current?.signedIn !== true || !current?.user?.id) return null;
      rememberCookies(response);
      return current?.signedIn === true && current?.apps?.mail === true && String(current?.user?.id) === owner;
    } catch { return null; }
  };
  const requireBackgroundAccess = async () => {
    if (!env.ATLAS_VERIFY_KEY) fail('background_unavailable', 'Background runs need the InFlite account verification connection.', 503);
    const allowed = await verifyAdmin(owner);
    if (allowed === false) fail('administrator_unavailable', 'InFlite could not confirm administrator access for background work.', 403);
    if (allowed !== true) fail('background_unavailable', 'InFlite could not verify access for background work. Try again shortly.', 503);
  };
  try {
    if (['GET', 'HEAD'].includes(request.method) && ['/atlas', '/atlas/'].includes(url.pathname)) {
      const nonce = crypto.randomUUID();
      return new Response(request.method === 'HEAD' ? null : atlasPage(nonce), { headers: { ...headers, 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': `default-src 'none'; script-src 'self' 'nonce-${nonce}'; style-src 'self' 'nonce-${nonce}'; font-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'` } });
    }
    if (['GET', 'HEAD'].includes(request.method) && ['/atlas/assets/app.js', '/atlas/assets/style.css'].includes(url.pathname)) {
      const response = await env.ASSETS.fetch(request);
      return new Response(request.method === 'HEAD' ? null : response.body, { status: response.status, headers: { ...headers, 'Content-Type': url.pathname.endsWith('.js') ? 'text/javascript; charset=utf-8' : 'text/css; charset=utf-8' } });
    }
    if (!url.pathname.startsWith('/atlas/api/')) return json({ error: 'Atlas route not found.', code: 'not_found' }, 404);
    const path = url.pathname.slice('/atlas/api'.length), method = request.method;
    if (!['GET', 'HEAD'].includes(method) && (request.headers.get('Origin') !== url.origin || request.headers.get('X-Inflite') !== '1' || (request.headers.has('Sec-Fetch-Site') && request.headers.get('Sec-Fetch-Site') !== 'same-origin'))) fail('invalid_origin', 'Open Atlas on InFlite to make this change.', 403);
    if (path === '/session' && method === 'GET') return json({ owner: ownerMarker, signedIn: true, available: true });
    if (path === '/identity' && method === 'GET') { await fresh(); return json({ confirmed: true, owner: ownerMarker }); }
    const storage = await store.storageStatus(env);
    if (path === '/health' && method === 'GET') {
      const [provider, timelineReady] = await Promise.all([providerStatus(env, owner), runTimelineStorage(env, storage.schemaVersion)]);
      const backgroundAvailable = timelineReady && !!env.ATLAS_VERIFY_KEY;
      const parallelAvailable = backgroundAvailable && await parallelResearchStorage(env, storage.schemaVersion);
      let github = { connected: false };
      if (storage.ready) {
        try { github = await repository.githubStatus(env, owner); }
        catch (error) { const safe = safeFailure(error); github = { connected: false, error: safe.error, code: safe.code }; }
      }
      return json({ owner: ownerMarker, storage, provider, scheduling: scheduleAvailability(env), github, coding: await coding.codingHealth(env, provider), environments: await environments.environmentStorageStatus(env), workspaceContext: await workspaceContextStorageStatus(env), runs: { ready: timelineReady, backgroundAvailable, ...(parallelAvailable ? { parallelAvailable } : {}) } });
    }
    if (path === '/setup' && method === 'POST') {
      const body = await input(request);
      if (body.confirm !== true) fail('confirmation_required', 'Confirm the Atlas storage upgrade.', 409);
      await fresh();
      return json(await store.upgradeStorage(env));
    }
    // Removing a saved key remains possible during a partial schema upgrade or
    // encryption configuration failure.
    if (path === '/provider' && method === 'DELETE') {
      await fresh();
      await coding.closeCodingSessions(env, owner, { send });
      if (storage.ready) await cancelOwnerRequests(env, owner);
      return json(await disconnectProvider(env, owner));
    }
    if (!storage.ready) fail(storage.code || 'storage_upgrade_required', env.ATLAS_DB ? 'Finish Atlas storage setup to use this feature.' : 'The Atlas database is not configured.', env.ATLAS_DB ? 409 : 503);
    const options = { send, signal: request.signal };
    if (path === '/activity' && method === 'GET') return json(await atlasActivity(env, owner, { limit: url.searchParams.has('limit') ? Number(url.searchParams.get('limit')) : 12, schemaVersion: storage.schemaVersion }));
    if (path === '/alerts' && method === 'GET') return json(await atlasRunAlerts(env, owner, { timeline: await runTimelineStorage(env, storage.schemaVersion) }));
    if (path === '/runs' && method === 'GET') {
      const timeline = await runTimelineStorage(env, storage.schemaVersion);
      return json(await atlasRuns(env, owner, {
        limit: url.searchParams.has('limit') ? Number(url.searchParams.get('limit')) : undefined,
        filter: url.searchParams.get('filter') ?? undefined, before: url.searchParams.get('before'), schemaVersion: storage.schemaVersion, timeline,
      }));
    }
    const runRoute = /^\/runs\/(answer|background|coding|scheduled)\/([^/]+)(?:\/(stop|resume|draft))?$/.exec(path);
    if ((path === '/runs' && method === 'POST') || runRoute) {
      if (!await runTimelineStorage(env, storage.schemaVersion)) fail('runs_storage_upgrade_required', 'Upgrade Atlas storage to use run timelines and background answers.', 409);
      if (!runRoute) {
        const body = await input(request);
        await requireBackgroundAccess();
        return json({ run: publicAnswerRun(await enqueueAtlasAnswer(env, owner, body)) }, 202);
      }
      const [, kind, id, action] = runRoute;
      if (!action && method === 'GET') {
        const read = after => readAtlasRunTimeline(env, owner, kind, id, { after, limit: url.searchParams.has('limit') ? Number(url.searchParams.get('limit')) : undefined });
        const initial = await read(Number(url.searchParams.get('after') ?? 0));
        if (url.searchParams.get('stream') !== '1') return json(initial);
        const allowed = async () => {
          const response = await account(env, request, { path: 'today/me', timeout: 8000 });
          if (response?.status === 401 || response?.status === 403) return false;
          if (!response?.ok) return null;
          const current = await accountData(response, 65536);
          return current?.signedIn === true && current?.apps?.mail === true && String(current?.user?.id) === owner;
        };
        return streamRunTimeline(initial, { request, read, allowed, headers: { ...headers, 'Content-Security-Policy': API_CSP } });
      }
      if (action === 'draft' && method === 'GET') return json(await readAtlasRunDraft(env, owner, kind, id, Number(url.searchParams.get('revision'))));
      if (kind === 'background' && method === 'POST') {
        if (action === 'stop') return json({ run: publicAnswerRun(await stopAtlasAnswer(env, owner, id, await input(request, 1024))) });
        if (action === 'resume') {
          const body = await input(request, 1024);
          await requireBackgroundAccess();
          return json({ run: publicAnswerRun(await resumeAtlasAnswer(env, owner, id, body)) }, 202);
        }
      }
      if (action === 'stop' && method === 'POST' && kind !== 'background') {
        const { revision } = await input(request, 1024);
        const { run } = await readAtlasRunTimeline(env, owner, kind, id, { limit: 1 });
        if (revision !== run.revision || !run.canStop) fail('run_changed', 'The run has changed. Refresh its timeline.', 409);
        if (kind === 'coding') return json({ run: await coding.cancelCodingRun(env, owner, id, { send, revision }) });
        if (kind === 'scheduled') return json(await stopScheduledOccurrence(env, owner, id));
        return json(await cancelAtlasRequest(env, owner, id));
      }
    }

    if (path === '/provider') {
      if (method === 'GET') return json(await providerStatus(env, owner));
      if (method === 'POST') { const body = await input(request, 8192); await fresh(); await coding.closeCodingSessions(env, owner, { send }); return json(await connectProvider(env, owner, body, options)); }
    }
    if (path === '/models' && method === 'GET') return json(await availableModels(env, owner, options));
    if (path === '/provider/test' && method === 'POST') return json(await testProvider(env, owner, await input(request), options));
    if (path === '/settings') {
      if (method === 'GET') return json(await store.getSettings(env, owner));
      if (method === 'PATCH') return json(await store.saveSettings(env, owner, await input(request)));
    }
    if (path === '/environments') {
      if (method === 'GET') {
        const status = await environments.environmentStorageStatus(env);
        return json({ ...status, environments: status.ready ? await environments.listEnvironments(env, owner) : [] });
      }
      if (method === 'POST') return json({ environment: await environments.createEnvironment(env, owner, await input(request)) }, 201);
    }
    const environmentMatch = /^\/environments\/([^/]+)$/.exec(path);
    if (environmentMatch) {
      const id = environmentMatch[1];
      if (method === 'GET') { const environment = await environments.getEnvironment(env, owner, id); if (!environment) absent(); return json({ environment }); }
      if (method === 'PATCH') return json({ environment: await environments.updateEnvironment(env, owner, id, await input(request)) });
      if (method === 'DELETE') return json(await environments.archiveEnvironment(env, owner, id));
    }
    if (path === '/conversations') {
      if (method === 'GET') return json({ conversations: await store.listConversations(env, owner, { archived: url.searchParams.get('archived') === '1' }) });
      if (method === 'POST') return json({ conversation: await store.createConversation(env, owner, await input(request)) }, 201);
    }
    const workspaceMatch = /^\/conversations\/([^/]+)\/workspace-context$/.exec(path);
    if (workspaceMatch) {
      const id = workspaceMatch[1];
      if (method === 'GET') return json(await getWorkspaceContext(env, owner, id));
      if (method === 'POST') return json(await setWorkspaceContext(env, owner, id, (await input(request, 4096)).source, { ...options, request }));
      if (method === 'DELETE') return json(await clearWorkspaceContext(env, owner, id));
    }
    let match = /^\/conversations\/([^/]+)(?:\/(export|summary))?$/.exec(path);
    if (match) {
      const id = match[1], action = match[2];
      if (action === 'summary' && method === 'POST') return json(await summarizeConversation(env, owner, id, await input(request), options));
      if (method === 'GET') {
        const conversation = await store.getConversation(env, owner, id);
        if (!conversation) absent();
        if (action === 'export') return exportConversation(env, owner, conversation, headers);
        if (!action) return json({ conversation, ...await store.getMessagePage(env, owner, id, { limit: url.searchParams.has('limit') ? Number(url.searchParams.get('limit')) : 100, beforeId: url.searchParams.get('before') }) });
      }
      if (!action && method === 'PATCH') return json({ conversation: await store.updateConversation(env, owner, id, await input(request)) });
      if (!action && method === 'DELETE') { await coding.closeCodingSessions(env, owner, { conversationId: id, send }); return json(await store.deleteConversation(env, owner, id)); }
    }
    if (path === '/chat' && method === 'POST') {
      const body = await input(request);
      const operation = { ...options, owner, request, account, conversationId: body.conversationId, requestId: body.requestId, prompt: body.prompt, includeFitness: body.includeFitness === true, context: body.context || [] };
      return body.stream === true ? await streamAtlasPrompt(env, operation, { headers, ctx }) : json(await runAtlasPrompt(env, operation));
    }
    // The browser observes these sessions; its lifetime does not own them.
    // Do not pass request.signal into the hosted execution lifecycle.
    const kickCoding = id => {
      if (ctx?.waitUntil) ctx.waitUntil(coding.progressCodingSetup(env, owner, id, { send }).catch(error => {
        console.warn(JSON.stringify({ event: 'atlas_coding_observation_failed', code: safeFailure(error).code }));
      }));
    };
    if (path === '/coding/inbox' && method === 'GET') return json(await coding.getCodingInbox(env, owner, {
      filter: url.searchParams.get('filter') ?? 'all', before: url.searchParams.get('before'),
    }));
    if (path === '/coding/runs') {
      if (method === 'GET') return json({ runs: await coding.getCodingRuns(env, owner, url.searchParams.get('conversationId')) });
      if (method === 'POST') { const run = await coding.startCodingRun(env, owner, await input(request), options); kickCoding(run.id); return json({ run }, 202); }
    }
    match = /^\/coding\/runs\/([^/]+)(?:\/(cancel|continue|changes|checks|diff|publish))?$/.exec(path);
    if (match) {
      const id = match[1], action = match[2];
      if (!action && method === 'GET') return json({ run: await coding.advanceCodingRun(env, owner, id, { send }) });
      if (action === 'cancel' && method === 'POST') return json({ run: await coding.cancelCodingRun(env, owner, id, { send }) });
      if (action === 'continue' && method === 'POST') { const run = await coding.continueCodingRun(env, owner, id, await input(request), { send }); kickCoding(id); return json({ run }, 202); }
      if (action === 'changes' && method === 'GET') return json(await coding.codingReview(env, owner, id, { send }));
      if (action === 'checks' && method === 'GET') return json(await coding.codingChecks(env, owner, id, Number(url.searchParams.get('revision')), options));
      if (action === 'diff' && method === 'GET') return json(await coding.codingDiff(env, owner, id, url.searchParams.get('path'), url.searchParams.get('revision')));
      if (action === 'publish' && method === 'POST') {
        const body = await input(request);
        await fresh();
        const verifyIncident = (owner, incident, repository, services) => requireOpenAtlasIncident(env, owner, incident, repository, services);
        return json(await coding.publishCodingRun(env, owner, id, body, { send, verifyIncident }));
      }
    }
    match = /^\/requests\/([^/]+)\/cancel$/.exec(path);
    if (match && method === 'POST') { await cancelAtlasRequest(env, owner, match[1]); return json({ cancelled: true }); }
    if (path === '/usage' && method === 'GET') return json(await store.usageSummary(env, owner));
    if (path === '/briefs') {
      if (method === 'GET') return json({ briefs: await store.listBriefs(env, owner) });
      if (method === 'POST') return json({ brief: await store.createBrief(env, owner, await input(request)) }, 201);
    }
    match = /^\/briefs\/([^/]+)(?:\/(export))?$/.exec(path);
    if (match) {
      if (method === 'GET') {
        const brief = await store.getBrief(env, owner, match[1]);
        if (!brief) absent();
        return match[2] ? download('# ' + brief.title + '\n\n' + brief.answer + markdownSources(brief.sources) + '\n', brief.title, headers) : json({ brief });
      }
      if (!match[2] && method === 'DELETE') return json(await store.deleteBrief(env, owner, match[1]));
    }
    if (path === '/github') {
      if (method === 'GET') return json(await repository.githubStatus(env, owner));
      if (method === 'POST') { const body = await input(request, 8192); await fresh(); return json(await repository.connectGithub(env, owner, body.token, options)); }
      if (method === 'DELETE') { await fresh(); return json(await repository.disconnectGithub(env, owner)); }
    }
    if (method === 'GET') {
      const repo = url.searchParams.get('repository');
      if (path === '/repositories') return json(await repository.listRepositories(env, owner, options));
      if (path === '/repositories/tree') return json(await repository.repositoryTree(env, owner, { repository: repo, ref: url.searchParams.get('ref') || undefined }, options));
      if (path === '/repositories/pulls') return json(await repository.repositoryPulls(env, owner, repo, options));
      if (path === '/repositories/jobs') return json(await repository.repositoryJobs(env, owner, repo, options));
      if (path === '/repositories/context') return json({ context: await repository.repositoryContext(env, owner, { repository: repo, kind: url.searchParams.get('kind'), path: url.searchParams.get('path'), ref: url.searchParams.get('ref') || undefined, number: Number(url.searchParams.get('number')), id: Number(url.searchParams.get('id')) }, options) });
    }
    if (path === '/patches' && method === 'GET') return json({ patches: await repository.listPatches(env, owner) });
    if (path === '/patches/prepare' && method === 'POST') return json(await preparePatch(env, owner, await input(request), options), 201);
    match = /^\/patches\/([^/]+)(?:\/(publish))?$/.exec(path);
    if (match) {
      if (!match[2] && method === 'GET') { const patch = await repository.getPatch(env, owner, match[1]); if (!patch) absent(); return json({ patch }); }
      if (match[2] === 'publish' && method === 'POST') {
        if ((await input(request)).confirm !== true) fail('confirmation_required', 'Review the patch and confirm creation of its draft pull request.', 409);
        await fresh();
        return json(await repository.publishPatch(env, owner, match[1], options));
      }
    }
    if (path === '/tasks') {
      if (method === 'GET') return json({ tasks: await store.listTasks(env, owner), autonomous: scheduleAvailability(env).available });
      if (method === 'POST') return json({ task: await store.createTask(env, owner, await input(request)) }, 201);
      if (['PATCH', 'DELETE'].includes(method)) {
        const body = await input(request);
        if (method === 'DELETE') { await store.updateTask(env, owner, body.id, { enabled: false }); return json({ cancelled: true }); }
        if (body.enabled === true) {
          if (body.confirm !== true) fail('confirmation_required', 'Confirm recurring API usage before enabling this task.', 409);
          const availability = scheduleAvailability(env);
          if (!availability.available) fail('scheduling_unavailable', availability.reason, 503);
          const allowed = await verifyAdmin(owner);
          if (allowed === false) fail('administrator_unavailable', 'Administrator access is no longer available for scheduling.', 403);
          if (allowed !== true) fail('account_unavailable', 'InFlite could not check your account right now. Try again shortly.', 503);
          if (!(await providerStatus(env, owner)).decryptable) fail('provider_not_configured', 'Save an OpenAI connection before enabling this task.', 409);
        }
        return json({ task: await store.updateTask(env, owner, body.id, body) });
      }
    }
    match = /^\/tasks\/([^/]+)\/(runs|run)$/.exec(path);
    if (match) {
      if (match[2] === 'runs' && method === 'GET') return json({ runs: await store.taskRuns(env, owner, match[1]) });
      if (match[2] === 'run' && method === 'POST') {
        const body = await input(request);
        if (body.confirm !== true) fail('confirmation_required', 'Confirm this task run and its API usage.', 409);
        requestIdentifier(body.requestId);
        const completion = runAtlasTask(env, owner, match[1], { requestId: body.requestId, verifyAdmin, execute: args => executeScheduledAtlas(env, args, { send }) });
        ctx?.waitUntil?.(completion);
        return json({ run: await completion });
      }
    }
    if (path === '/stop' && method === 'POST') return json(await store.stopTasks(env, owner));
    if (path === '/evolution') return evolution(request, env, owner, json);
    return json({ error: 'This Atlas route or method is unavailable.', code: 'route_not_found' }, 404);
  } catch (error) {
    const safe = safeFailure(error, diagnosticId);
    const supplied = Number.isInteger(error?.status) && error.status >= 400 && error.status <= 599 ? error.status : 503;
    // An upstream credential rejection must never look like an InFlite sign-out.
    const status = supplied === 401 && safe.code !== 'sign_in_required' ? 422 : supplied;
    console.warn(JSON.stringify({ event: 'atlas_request_failed', requestId: diagnosticId, code: safe.code, status, durationMs: Date.now() - started }));
    return json(safe, status);
  }
}
