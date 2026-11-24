// Isolated browser contract tests: all network calls use fixtures and no paid
// provider requests, real credentials, or remote GitHub writes are possible.
// Run with: node --test --test-concurrency=1 tests/atlas-ui-browser.test.cjs
// Screenshots: set ATLAS_UI_SCREENSHOTS to a writable artifact directory.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync, existsSync, mkdirSync } = require('node:fs');
const { resolve, join } = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium, webkit } = require('playwright');
const PUBLIC = resolve(__dirname, '../today/public');
// Shared appearance intentionally loads account preferences only on canonical
// app hosts. Every request is still intercepted below; none reaches production.
const ORIGIN = 'https://inflite.ai';
let browser, atlasPage;
before(async () => {
  ({ atlasPage } = await import(pathToFileURL(resolve(__dirname, '../today/src/atlas-page.js'))));
  const executablePath = process.env.CHROMIUM_PATH || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined);
  browser = process.env.WEB_UI_BROWSER === 'webkit' ? await webkit.launch() : await chromium.launch({ executablePath, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
});
after(async () => { await browser?.close(); });
const source = { url: 'https://example.org/research', title: 'Research evidence', start_index: 0, end_index: 14 };
const now = 1795500000000;
function defaultFixture() {
  return {
    owner: 'owner-a', ready: true, connected: true, scheduling: true, models: [{ id: 'gpt-6.2-sol', label: 'GPT-6.2 Sol', webSearch: true }, { id: 'fixture-alternate', label: 'Fixture alternate', webSearch: false }], model: 'gpt-6.2-sol', tested: true,
    conversations: [{ id: 'alpha', title: 'Alpha research', mode: 'research', archived: false, created_at: now, updated_at: now }, { id: 'beta', title: 'Beta planning', mode: 'personal', archived: false, created_at: now, updated_at: now }],
    messages: { alpha: [{ id: 'alpha-first', prompt: 'Summarize the evidence', answer: 'Evidence here.\n\n| Finding | Status |\n| --- | --- |\n| Safe rendering | Verified |\n\n```js\nconst secure = true;\n```', status: 'completed', sources: [source], context: [], created_at: now }], beta: [{ id: 'beta-first', prompt: 'Plan a project', answer: 'Only beta content belongs here.', status: 'completed', sources: [], context: [], created_at: now }] },
    settings: { memoryEnabled: false, memory: 'Owner A private memory', dailyRequestLimit: 20, dailyBudgetUsd: null, timezone: 'Europe/London' },
    tasks: [], briefs: [], patches: [], requests: [], overrides: new Map(), next: 1, older: null
  };
}
async function open(options = {}) {
  const fixture = Object.assign(defaultFixture(), options.fixture || {}), errors = [], security = [];
  const context = await browser.newContext({ viewport: { width: options.width || 1280, height: options.height || 900 }, colorScheme: options.theme || 'dark', reducedMotion: 'reduce', serviceWorkers: 'block', hasTouch: !!options.mobile, isMobile: !!options.mobile });
  await context.addInitScript(() => {
    window.__atlasStream = { owner: 'owner-a', controller: null, request: null, requests: [], cancelled: 0 };
    const actualFetch = window.fetch.bind(window);
    window.fetch = async (input, options = {}) => {
      if (new URL(typeof input === 'string' ? input : input.url, location.href).pathname !== '/atlas/api/chat') return actualFetch(input, options);
      const fixture = window.__atlasStream, body = JSON.parse(options.body); fixture.request = body; fixture.requests.push({ body, headers: options.headers });
      const stream = new ReadableStream({ start(controller) { fixture.controller = controller; }, cancel() { fixture.cancelled++; } });
      const abort = () => { try { fixture.controller.error(new DOMException('Stopped', 'AbortError')); } catch {} }; options.signal?.addEventListener('abort', abort, { once: true });
      return new Response(stream, { headers: { 'Content-Type': 'text/event-stream', 'X-Atlas-Owner': fixture.owner } });
    };
    window.__atlasEmit = (event, data) => window.__atlasStream.controller.enqueue(new TextEncoder().encode('event: ' + event + '\ndata: ' + JSON.stringify(data) + '\n\n'));
    document.addEventListener('securitypolicyviolation', event => { window.__atlasPolicyErrors ||= []; window.__atlasPolicyErrors.push(event.violatedDirective + ': ' + event.blockedURI); });
  });
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== ORIGIN) return route.abort();
    if (url.pathname === '/atlas') return route.fulfill({ contentType: 'text/html', headers: { 'Content-Security-Policy': "default-src 'none'; script-src 'self' 'nonce-fixture'; style-src 'self' 'nonce-fixture'; font-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'" }, body: atlasPage('fixture') });
    if (url.pathname === '/account/api/account/appearance') return route.fulfill({ json: { signedIn: true, id: fixture.owner, palette: 'inflite', appearance: options.theme || 'dark' } });
    if (!url.pathname.startsWith('/atlas/api/')) {
      if (!['/theme.js', '/app.css'].includes(url.pathname) && !url.pathname.startsWith('/roof/') && !url.pathname.startsWith('/atlas/assets/')) return route.fulfill({ status: 404, body: '' });
      try { return route.fulfill({ contentType: url.pathname.endsWith('.css') ? 'text/css' : 'text/javascript', body: readFileSync(resolve(PUBLIC, '.' + url.pathname)) }); } catch { return route.fulfill({ status: 404, body: '' }); }
    }
    const path = url.pathname.slice('/atlas/api/'.length), method = request.method(), owner = fixture.owner;
    let body; try { body = request.postDataJSON(); } catch {}
    fixture.requests.push({ path, method, body, headers: request.headers() });
    const reply = (data, status = 200, capturedOwner = owner) => route.fulfill({ status, headers: { 'X-Atlas-Owner': capturedOwner, 'Cache-Control': 'no-store' }, json: data });
    if (fixture.overrides.has(method + ' ' + path)) return fixture.overrides.get(method + ' ' + path)({ route, reply, body, url, owner });
    if (path === 'health') return reply({ owner, storage: { ready: fixture.ready, schemaVersion: fixture.ready ? 6 : 5 }, provider: { keySaved: fixture.connected, decryptable: fixture.connected, model: fixture.model, lastSuccessAt: fixture.tested ? now : null, ...fixture.provider }, scheduling: { available: fixture.scheduling }, github: { connected: true, login: 'fixture-owner' } });
    if (path === 'setup') { fixture.ready = true; return reply({ ready: true, schemaVersion: 6 }); }
    if (path === 'settings') { if (method === 'PATCH') Object.assign(fixture.settings, body); return reply(fixture.settings); }
    if (path === 'models') return reply({ models: fixture.models, selected: fixture.model });
    if (path === 'provider') { if (method === 'POST') { fixture.connected = true; fixture.model = body.model; fixture.tested = false; } else if (method === 'DELETE') fixture.connected = false; return reply({ keySaved: fixture.connected }); }
    if (path === 'provider/test') { fixture.tested = true; return reply({ ok: true, model: fixture.model, checkedAt: now, usage: {} }); }
    if (path === 'github') return reply({ connected: method !== 'DELETE' });
    if (path === 'repositories') return reply({ connected: true, repositories: [{ full_name: 'fixture/atlas', private: true }] });
    if (path === 'repositories/tree') return reply({ repository: 'fixture/atlas', ref: 'a'.repeat(40), files: [{ path: 'src/app.js', sha: 'b'.repeat(40), size: 120 }, { path: 'README.md', sha: 'c'.repeat(40), size: 40 }] });
    if (path === 'repositories/pulls') return reply({ pulls: [{ number: 12, title: 'Improve Atlas', head_sha: 'a'.repeat(40), base_sha: 'b'.repeat(40), url: 'https://github.com/fixture/atlas/pull/12' }] });
    if (path === 'repositories/jobs') return reply({ jobs: [{ id: 44, name: 'Build', status: 'completed', conclusion: 'failure', head_sha: 'a'.repeat(40) }] });
    if (path === 'repositories/context') return reply({ context: { kind: url.searchParams.get('kind'), repository: 'fixture/atlas', path: url.searchParams.get('path') || undefined, ref: url.searchParams.get('ref') || 'a'.repeat(40), title: url.searchParams.get('path') || 'Selected context', text: 'Fixture source content' } });
    if (path === 'conversations') {
      if (method === 'POST') { const conversation = { ...body, id: 'new-' + fixture.next++, created_at: now, updated_at: now, archived: false }; fixture.conversations.unshift(conversation); fixture.messages[conversation.id] = []; return reply({ conversation }, 201); }
      return reply({ conversations: fixture.conversations.filter(c => !!c.archived === (url.searchParams.get('archived') === '1')) });
    }
    let match = /^conversations\/([^/]+)(?:\/(summary|export))?$/.exec(path);
    if (match) {
      const conversation = fixture.conversations.find(c => c.id === match[1]); if (!conversation) return reply({ code: 'not_found', error: 'Conversation missing.' }, 404);
      if (match[2] === 'export') return route.fulfill({ contentType: 'text/markdown', headers: { 'X-Atlas-Owner': owner }, body: '# ' + conversation.title });
      if (match[2] === 'summary') { conversation.summary = 'A bounded summary of earlier context.'; return reply({ summary: conversation.summary }); }
      if (method === 'PATCH') Object.assign(conversation, body);
      if (method === 'DELETE') { fixture.conversations = fixture.conversations.filter(c => c.id !== conversation.id); return reply({ deleted: true }); }
      if (url.searchParams.has('before')) return reply({ conversation, messages: fixture.older || [], hasMore: false, nextBeforeId: null });
      return reply({ conversation, messages: fixture.messages[conversation.id] || [], hasMore: !!fixture.older, nextBeforeId: fixture.older ? 'alpha-first' : null });
    }
    if (/^requests\/.+\/cancel$/.test(path)) return reply({ cancelled: true });
    if (path === 'usage') return reply({ day: '2026-11-24', limits: { dailyRequestLimit: 20, dailyBudgetUsd: 2 }, totals: { requests: 3, completed: 2, failed: 1, pending: 0, inputTokens: 120, outputTokens: 40, estimatedCostUsd: 0.004, unknownCostRequests: 1 }, requests: [] });
    if (path === 'briefs') { if (method === 'POST') { const message = fixture.messages[body.conversationId]?.find(m => m.id === body.messageId); const brief = { id: 'brief-' + fixture.next++, title: body.title || 'Saved brief', created_at: now, ...message }; fixture.briefs.push(brief); return reply({ brief }, 201); } return reply({ briefs: fixture.briefs }); }
    match = /^briefs\/([^/]+)(?:\/(export))?$/.exec(path);
    if (match) { const brief = fixture.briefs.find(b => b.id === match[1]); if (method === 'DELETE') { fixture.briefs = fixture.briefs.filter(b => b.id !== match[1]); return reply({ deleted: true }); } if (match[2]) return route.fulfill({ contentType: 'text/markdown', headers: { 'X-Atlas-Owner': owner }, body: '# ' + brief.title }); return reply({ brief }); }
    if (path === 'patches') return reply({ patches: fixture.patches });
    if (path === 'patches/prepare') { const patch = { id: 'patch-' + fixture.next++, title: 'Reviewable change', repository: body.repository, baseSha: 'a'.repeat(40), summary: 'A small proposed change.', status: 'draft', files: [{ path: 'src/app.js', before: 'one', after: 'two', diff: '- one\n+ two' }], testPlan: ['Run the focused checks.'] }; fixture.patches.push(patch); return reply({ patch }, 201); }
    match = /^patches\/([^/]+)(?:\/(publish))?$/.exec(path);
    if (match) { const patch = fixture.patches.find(p => p.id === match[1]); if (match[2]) { patch.status = 'published'; patch.url = 'https://github.com/fixture/atlas/pull/42'; return reply({ url: patch.url, number: 42 }); } return reply({ patch }); }
    if (path === 'tasks') { if (method === 'POST') { const task = { ...body, id: 'task-' + fixture.next++, enabled: false }; fixture.tasks.push(task); return reply({ task }, 201); } if (method === 'PATCH') { const task = fixture.tasks.find(t => t.id === body.id); Object.assign(task, body); return reply({ task }); } return reply({ tasks: fixture.tasks, autonomous: fixture.scheduling }); }
    if (/^tasks\/.+\/runs$/.test(path)) return reply({ runs: [{ id: 'run-fixture', status: 'completed', started_at: now, finished_at: now + 100, result: 'A scheduled result with evidence.', sources: [source], request_id: 'request-fixture' }] });
    if (/^tasks\/.+\/run$/.test(path)) return reply({ run: { status: 'completed' } });
    if (path === 'stop') { fixture.tasks.forEach(t => { t.enabled = false; }); return reply({ stopped: true }); }
    return reply({ error: 'Unhandled fixture route: ' + path, code: 'fixture_route_missing' }, 404);
  });
  const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
  await page.goto(ORIGIN + '/atlas');
  await page.waitForFunction(() => !document.body.classList.contains('session-check'));
  await page.waitForFunction(theme => document.documentElement.dataset.theme === theme, options.theme || 'dark');
  return { page, context, fixture, errors, security, async close() { security.push(...await page.evaluate(() => window.__atlasPolicyErrors || [])); await context.close(); }, async screenshot(name) { if (!process.env.ATLAS_UI_SCREENSHOTS) return; mkdirSync(process.env.ATLAS_UI_SCREENSHOTS, { recursive: true }); await page.screenshot({ path: join(process.env.ATLAS_UI_SCREENSHOTS, name + '.png'), fullPage: true }); } };
}
async function openThread(t, title) { if (await t.page.locator('#navigation-toggle').isVisible()) await t.page.locator('#navigation-toggle').click(); await t.page.locator('#conversation-list').getByRole('button', { name: new RegExp(title) }).click(); await t.page.waitForFunction(title => document.getElementById('conversation-title').textContent === title, title); }
async function openPanel(t, name) { if (await t.page.locator('#navigation-toggle').isVisible()) await t.page.locator('#navigation-toggle').click(); await t.page.locator('.workspace-tools [data-open="' + name + '"]').click(); await t.page.locator('#' + name + '-dialog').waitFor({ state: 'visible' }); }
async function eventually(check) { let last; for (let i = 0; i < 60; i++) { try { check(); return; } catch (error) { last = error; await new Promise(resolve => setTimeout(resolve, 20)); } } throw last; }
async function emit(page, event, data) { await page.evaluate(({ event, data }) => window.__atlasEmit(event, data), { event, data }); }

for (const width of [320, 390, 1280]) for (const theme of ['light', 'dark']) test('mobile-first layout fits ' + width + 'px in ' + theme + ' appearance', async () => {
  const t = await open({ width, theme, height: 844, mobile: width < 721 });
  try {
    await t.screenshot('atlas-' + width + '-' + theme);
    assert.equal(await t.page.locator('#upgrade-storage').isVisible(), false);
    assert.match(await t.page.locator('#connection-label').textContent(), /Ready/);
    const geometry = await t.page.evaluate(() => { const header = document.querySelector('.atlas-header').getBoundingClientRect(), composer = document.querySelector('.composer').getBoundingClientRect(), main = document.querySelector('.conversation-main').getBoundingClientRect(); return { width: innerWidth, height: innerHeight, scrollWidth: document.documentElement.scrollWidth, headerBottom: header.bottom, mainTop: main.top, composerBottom: composer.bottom, composerRight: composer.right, composerLeft: composer.left, theme: document.documentElement.dataset.theme }; });
    assert.ok(geometry.scrollWidth <= geometry.width + 1, JSON.stringify(geometry)); assert.ok(geometry.composerBottom <= geometry.height + 1, JSON.stringify(geometry)); assert.ok(geometry.composerLeft >= 0 && geometry.composerRight <= geometry.width + 1, JSON.stringify(geometry)); assert.ok(geometry.mainTop >= geometry.headerBottom - 1, JSON.stringify(geometry)); assert.equal(geometry.theme, theme);
    await openThread(t, 'Alpha research');
    assert.equal(await t.page.locator('.message-content table').count(), 1); assert.equal(await t.page.getByRole('button', { name: 'Copy code' }).count(), 1); assert.equal(await t.page.locator('.inline-citation').count(), 1);
    await t.screenshot('atlas-conversation-' + width + '-' + theme);
    assert.deepEqual(t.errors, []);
  } finally { await t.close(); }
});

// Playwright's WebKit screenshotter momentarily inserts an unnonced
// <style>body {}</style> to synchronize animations. Keep the application CSP
// strict, and verify its runtime separately without screenshot instrumentation.
// These cases cover both appearances, mobile/desktop navigation, Markdown and
// dynamic connection rendering; no style-src violations are ignored here.
for (const [width, theme] of [[320, 'light'], [1280, 'dark']]) test('strict CSP covers the ' + width + 'px ' + theme + ' workspace without screenshot instrumentation', async () => {
  const t = await open({ width, theme, height: 844, mobile: width < 721 });
  try {
    await openThread(t, 'Alpha research');
    assert.equal(await t.page.locator('.message-content table').count(), 1);
    assert.equal(await t.page.locator('.inline-citation').count(), 1);
    await openPanel(t, 'settings');
    await t.page.waitForFunction(() => document.getElementById('model-help').textContent.includes('available to your project'));
    t.fixture.provider = { setupAvailable: false, lastErrorCode: 'provider_encryption_invalid', error: 'ATLAS_ENCRYPTION_KEY must be Base64 encoding of exactly 32 bytes.' };
    await t.page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await t.page.waitForFunction(() => document.getElementById('provider-health').textContent.includes('Base64 encoding of exactly 32 bytes'));
    assert.deepEqual(t.errors, []);
  } finally { await t.close(); }
  assert.deepEqual(t.security, []);
});

test('setup runs only when storage requires it, then removes the upgrade action', async () => {
  const t = await open({ fixture: { ready: false } }); try { assert.equal(await t.page.locator('#upgrade-storage').isVisible(), true); await t.page.locator('#upgrade-storage').click(); await t.page.locator('#setup-banner').waitFor({ state: 'hidden' }); assert.equal(t.fixture.requests.filter(r => r.path === 'setup').length, 1); assert.deepEqual(t.errors, []); } finally { await t.close(); }
});

test('stream identity stays with the outgoing conversation after switching threads', async () => {
  const t = await open(); try {
    await openThread(t, 'Alpha research'); await t.page.locator('#prompt').fill('A new alpha question'); await t.page.locator('#send').click(); await t.page.waitForFunction(() => !!window.__atlasStream.request);
    const request = await t.page.evaluate(() => window.__atlasStream.request); assert.equal(request.conversationId, 'alpha');
    await emit(t.page, 'meta', { conversationId: 'alpha', messageId: 'stream-alpha', requestId: request.requestId }); await emit(t.page, 'delta', { text: 'Private alpha answer ' });
    await openThread(t, 'Beta planning'); await emit(t.page, 'delta', { text: 'arrives after the switch.' }); await emit(t.page, 'source', { source }); await emit(t.page, 'done', { message: { id: 'stream-alpha', answer: 'Private alpha answer arrives after the switch.', status: 'completed', sources: [source] } });
    await t.page.locator('#stop-response').waitFor({ state: 'hidden' }); assert.doesNotMatch(await t.page.locator('#messages').textContent(), /Private alpha/); assert.match(await t.page.locator('#messages').textContent(), /Only beta content/);
    const headers = await t.page.evaluate(() => window.__atlasStream.requests[0].headers); assert.equal(headers['X-Atlas-Owner'], 'owner-a'); assert.deepEqual(t.errors, []);
  } finally { await t.close(); }
});

test('Stop preserves partial text and sends cancellation; Retry never silently dispatches', async () => {
  const t = await open(); try {
    await openThread(t, 'Alpha research'); await t.page.locator('#prompt').fill('Start an answer'); await t.page.locator('#send').click(); await t.page.waitForFunction(() => !!window.__atlasStream.request); await emit(t.page, 'delta', { text: 'Keep this partial answer.' }); await t.page.locator('#stop-response').click();
    await t.page.locator('#stop-response').waitFor({ state: 'hidden' }); assert.match(await t.page.locator('#messages').textContent(), /Keep this partial answer/); assert.match(await t.page.locator('#messages').textContent(), /Stopped/);
    await eventually(() => assert.equal(t.fixture.requests.filter(r => /requests\/.+\/cancel/.test(r.path)).length, 1)); await t.page.getByRole('button', { name: 'Retry', exact: true }).click(); assert.equal(await t.page.locator('#prompt').inputValue(), 'Start an answer'); assert.equal(await t.page.evaluate(() => window.__atlasStream.requests.length), 1); assert.deepEqual(t.errors, []);
  } finally { await t.close(); }
});

test('saved history retains safe formatting, sources, pagination and explicit briefs', async () => {
  const t = await open({ fixture: { older: [{ id: 'older-first', prompt: 'Older question', answer: 'Older answer', status: 'completed', sources: [], context: [] }] } }); try {
    t.fixture.messages.alpha[0].answer += '\n\n<script>window.__injected=true</script>\n\n[unsafe](javascript:alert(1))'; await openThread(t, 'Alpha research');
    await t.page.locator('#load-older-messages').click(); await t.page.locator('#older-history').waitFor({ state: 'hidden' }); assert.equal(await t.page.locator('.turn').count(), 2); assert.match(await t.page.locator('#messages').textContent(), /Older answer/); assert.equal(await t.page.evaluate(() => !!window.__injected), false); assert.equal(await t.page.locator('#messages script, #messages img, #messages a[href^="javascript:"]').count(), 0);
    await t.page.locator('.turn').last().getByRole('button', { name: 'Save as brief' }).click(); await eventually(() => assert.equal(t.fixture.briefs.length, 1)); await openPanel(t, 'briefs'); await t.page.locator('#briefs-list .record-open').click(); await t.page.locator('#brief-detail .source-list a').waitFor(); assert.match(await t.page.locator('#brief-detail').textContent(), /Research evidence/); assert.deepEqual(t.errors, []);
  } finally { await t.close(); }
});

test('model changes reuse the saved key and real test status is separate from key storage', async () => {
  const t = await open(); try {
    await openPanel(t, 'settings'); await t.page.locator('#provider-model option[value="fixture-alternate"]').waitFor({ state: 'attached' }); await t.page.locator('#provider-model').selectOption('fixture-alternate'); await t.page.locator('#save-provider').click();
    await eventually(() => { const call = t.fixture.requests.find(r => r.path === 'provider' && r.method === 'POST'); assert.deepEqual(call.body, { model: 'fixture-alternate' }); });
    await t.page.waitForFunction(() => document.getElementById('connection-label').textContent.includes('Key saved')); assert.doesNotMatch(await t.page.locator('#connection-label').textContent(), /Ready/);
    await t.page.locator('#provider-key').fill('sk-fixture-secret-only'); await t.page.locator('#save-provider').click(); await t.page.waitForFunction(() => document.getElementById('provider-key').value === '');
    assert.equal(await t.page.evaluate(() => document.documentElement.outerHTML.includes('sk-fixture-secret-only')), false); assert.equal(await t.page.evaluate(() => Object.values(localStorage).some(v => v.includes('sk-fixture-secret-only'))), false);
    await t.page.locator('#test-provider').click(); await t.page.waitForFunction(() => document.getElementById('connection-label').textContent.includes('Ready')); assert.deepEqual(t.errors, []);
  } finally { await t.close(); }
});

test('invalid encryption health displays its safe configuration recovery message', async () => {
  const error = 'ATLAS_ENCRYPTION_KEY must be Base64 encoding of exactly 32 bytes.';
  const t = await open({ width: 390, height: 844, mobile: true, fixture: { connected: false, tested: false, provider: { setupAvailable: false, lastErrorCode: 'provider_encryption_invalid', error } } });
  try {
    assert.match(await t.page.locator('#connection-label').textContent(), /Connection needs attention/);
    await openPanel(t, 'settings');
    assert.match(await t.page.locator('#provider-health').textContent(), /ATLAS_ENCRYPTION_KEY must be Base64 encoding of exactly 32 bytes\./);
    assert.doesNotMatch(await t.page.locator('#provider-health').textContent(), /provider encryption invalid/);
    assert.equal(await t.page.locator('#test-provider').isDisabled(), true);
    await t.screenshot('atlas-encryption-recovery-mobile');
    assert.deepEqual(t.errors, []);
  } finally { await t.close(); }
});

test('saved unavailable and custom models retain their availability and verification notices', async () => {
  for (const unavailable of [true, false]) {
    const id = unavailable ? 'saved-missing' : 'saved-custom';
    const note = unavailable ? 'The saved model is not listed for this project. Reconnect with an available model.' : 'Saved custom model. Responses and workspace capabilities still need a successful connection test.';
    const t = await open({ fixture: { model: id, models: [{ id: 'gpt-6.2-sol', label: 'GPT-6.2 Sol', available: true, capabilitiesVerified: true }, { id, label: id, available: !unavailable, capabilitiesVerified: false, note }] } });
    try {
      await openPanel(t, 'settings'); await t.page.waitForFunction(note => document.getElementById('model-help').textContent === note, note);
      // Playwright's isDisabled follows the enclosing label to its select.
      // Inspect the option itself so availability is tested independently.
      const option = t.page.locator('#provider-model option[value="' + id + '"]'); assert.equal(await option.evaluate(el => el.disabled), unavailable); assert.match(await option.textContent(), unavailable ? /unavailable/ : /capabilities unverified/);
      await t.page.locator('#provider-model').selectOption('gpt-6.2-sol'); assert.match(await t.page.locator('#model-help').textContent(), /available to your project/); assert.deepEqual(t.errors, []);
    } finally { await t.close(); }
  }
});

test('resource permission errors keep the workspace, session failures clear all private state', async () => {
  const t = await open(); try {
    await openThread(t, 'Alpha research'); t.fixture.overrides.set('GET models', ({ reply }) => reply({ code: 'github_access_or_rate_limit', error: 'Repository access needs attention.' }, 403)); await openPanel(t, 'settings');
    await t.page.waitForFunction(() => document.getElementById('toast').textContent.includes('access needs attention')); assert.equal(await t.page.evaluate(() => document.body.classList.contains('session-check')), false); await t.page.locator('#settings-dialog [data-close]').click(); assert.match(await t.page.locator('#messages').textContent(), /Evidence here/);
    t.fixture.overrides.set('GET health', ({ reply }) => reply({ code: 'sign_in_required', error: 'Sign in to continue.' }, 401)); await t.page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await t.page.waitForFunction(() => document.body.classList.contains('session-check') && document.getElementById('messages').children.length === 0); assert.equal(await t.page.locator('#memory-text').inputValue(), ''); assert.equal(await t.page.locator('#prompt').inputValue(), ''); assert.equal(await t.page.locator('#conversation-list').textContent(), ''); assert.match(await t.page.locator('#session-notice').textContent(), /Sign in/); assert.deepEqual(t.errors, []);
  } finally { await t.close(); }
});

test('account switching drops late private responses and starts the new account cleanly', async () => {
  const t = await open(); let release; try {
    await openThread(t, 'Alpha research'); await t.page.locator('#prompt').fill('Unsent private alpha draft');
    const delayed = new Promise(resolve => { release = resolve; }); let held = false;
    t.fixture.overrides.set('GET settings', async ({ reply, owner }) => { if (!held) { held = true; t.fixture.overrides.delete('GET settings'); await delayed; try { return await reply({ memoryEnabled: true, memory: 'LATE OWNER A PRIVATE DATA', dailyRequestLimit: 20, timezone: 'UTC' }, 200, owner); } catch { return; } } });
    await openPanel(t, 'settings'); await eventually(() => assert.equal(held, true)); t.fixture.owner = 'owner-b'; t.fixture.settings = { memoryEnabled: false, memory: '', dailyRequestLimit: 20, timezone: 'UTC' }; t.fixture.conversations = []; t.fixture.messages = {};
    await t.page.evaluate(() => window.dispatchEvent(new Event('focus'))); await t.page.waitForFunction(() => !document.body.classList.contains('session-check') && document.getElementById('conversation-title').textContent === 'New conversation'); release();
    await t.page.waitForTimeout(40); assert.equal(await t.page.locator('#prompt').inputValue(), ''); assert.equal(await t.page.locator('#memory-text').inputValue(), ''); assert.doesNotMatch(await t.page.locator('body').textContent(), /LATE OWNER A|Alpha research|Unsent private/); assert.equal(new URL(t.page.url()).searchParams.has('conversation'), false); assert.deepEqual(t.errors, []);
  } finally { release?.(); await t.close(); }
});

test('developer context prepares a reviewable patch and requires a separate explicit publication', async () => {
  const t = await open(); try {
    await t.page.locator('#mode').selectOption('developer'); await t.page.locator('#repository').selectOption('fixture/atlas'); await t.page.locator('#attach-context').click(); await t.page.locator('#context-list input').first().check(); await t.page.locator('#context-attach').click(); await t.page.locator('#context-dialog').waitFor({ state: 'hidden' }); assert.match(await t.page.locator('#attached-context').textContent(), /src\/app.js/);
    await t.page.locator('#prompt').fill('Make a small correction'); await t.page.locator('#prepare-patch').click(); await t.page.locator('#patch-detail .patch-file').waitFor(); assert.equal(t.fixture.requests.filter(r => /\/publish$/.test(r.path)).length, 0); assert.match(await t.page.locator('#patch-detail').textContent(), /Validation plan/);
    t.page.once('dialog', dialog => dialog.dismiss()); await t.page.getByRole('button', { name: 'Create draft pull request' }).click(); assert.equal(t.fixture.requests.filter(r => /\/publish$/.test(r.path)).length, 0);
    t.page.once('dialog', dialog => dialog.accept()); await t.page.getByRole('button', { name: 'Create draft pull request' }).click(); await t.page.getByRole('link', { name: 'Open draft pull request' }).waitFor(); assert.equal(t.fixture.requests.filter(r => /\/publish$/.test(r.path)).length, 1); assert.deepEqual(t.errors, []);
  } finally { await t.close(); }
});

test('daily, weekly and interval tasks save paused and enable only after explicit confirmation', async () => {
  const t = await open(); try {
    await openPanel(t, 'schedules');
    for (const kind of ['daily', 'weekly', 'interval']) { await t.page.locator('#new-schedule').click(); await t.page.locator('#schedule-title').fill(kind + ' research'); await t.page.locator('#schedule-prompt').fill('Prepare an evidence-backed briefing.'); await t.page.locator('#schedule-kind').selectOption(kind); await t.page.locator('#schedule-timezone').fill('Europe/London'); await t.page.locator('#schedule-form button[type="submit"]').click(); await t.page.locator('#schedule-form').waitFor({ state: 'hidden' }); }
    assert.equal(t.fixture.tasks.length, 3); assert.ok(t.fixture.tasks.every(task => !task.enabled && !task.includeFitness)); assert.deepEqual(t.fixture.tasks.map(task => task.schedule_kind), ['daily', 'weekly', 'interval']); assert.deepEqual(t.fixture.tasks[1].weekdays, [1]); assert.equal(t.fixture.tasks[2].interval_minutes, 1440);
    t.page.once('dialog', dialog => dialog.dismiss()); await t.page.locator('#schedules-list').getByRole('button', { name: 'Enable', exact: true }).first().click(); assert.equal(t.fixture.tasks[0].enabled, false);
    t.page.once('dialog', dialog => dialog.accept()); await t.page.locator('#schedules-list').getByRole('button', { name: 'Enable', exact: true }).first().click(); await eventually(() => assert.equal(t.fixture.tasks[0].enabled, true));
    await t.page.locator('#schedules-list').getByRole('button', { name: 'Run history' }).first().click(); await t.page.locator('#schedule-runs-list .source-list a').waitFor();
    t.page.once('dialog', dialog => dialog.accept()); await t.page.locator('#stop-schedules').click(); await eventually(() => assert.ok(t.fixture.tasks.every(task => !task.enabled))); assert.deepEqual(t.errors, []);
  } finally { await t.close(); }
});
