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
function repositoryFile(path, extra = {}) { return { kind: 'file', repository: 'fixture/atlas', path, ref: 'a'.repeat(40), blobSha: 'b'.repeat(40), mode: '100644', title: path, url: 'https://github.com/fixture/atlas/blob/' + 'a'.repeat(40) + '/' + path, ...extra }; }
const now = 1795500000000;
function codingRun(extra = {}) { return { id: 'coding-1', conversationId: 'repo', requestId: 'request-1', repository: 'fixture/atlas', baseBranch: 'main', baseSha: 'a'.repeat(40), prompt: 'Build the repository improvement', status: 'running', stage: 'inspecting_repository', summary: '', createdAt: now, updatedAt: now, revision: 1, changes: { added: 0, modified: 0, deleted: 0 }, checks: [], activity: [{ type: 'message', label: 'Atlas update', detail: 'Reading repository instructions.', source: 'assistant', truncated: false }], budgetUsd: 2, providerRecordedSpendUsd: null, canContinue: false, reviewReady: false, ...extra }; }
function developerFixture(extra = {}) { return { conversations: [{ id: 'repo', title: 'Repository task', mode: 'developer', repository: 'fixture/atlas', created_at: now }], messages: { repo: [] }, ...extra }; }
function defaultFixture() {
  return {
    owner: 'owner-a', ready: true, connected: true, scheduling: true, models: [{ id: 'gpt-6.2-sol', label: 'GPT-6.2 Sol', webSearch: true }, { id: 'fixture-alternate', label: 'Fixture alternate', webSearch: false }], model: 'gpt-6.2-sol', tested: true,
    conversations: [{ id: 'alpha', title: 'Alpha research', mode: 'research', archived: false, created_at: now, updated_at: now }, { id: 'beta', title: 'Beta planning', mode: 'personal', archived: false, created_at: now, updated_at: now }],
    messages: { alpha: [{ id: 'alpha-first', prompt: 'Summarize the evidence', answer: 'Evidence here.\n\n| Finding | Status |\n| --- | --- |\n| Safe rendering | Verified |\n\n```js\nconst secure = true;\n```', status: 'completed', sources: [source], context: [], created_at: now }], beta: [{ id: 'beta-first', prompt: 'Plan a project', answer: 'Only beta content belongs here.', status: 'completed', sources: [], context: [], created_at: now }] },
    settings: { memoryEnabled: false, memory: 'Owner A private memory', dailyRequestLimit: 20, dailyBudgetUsd: null, timezone: 'Europe/London' },
    environments: [], environmentsReady: true, tasks: [], briefs: [], patches: [], coding: { ready: true, storageReady: true, message: '' }, codingRuns: [], codingFiles: {}, codingDiffs: {}, requests: [], overrides: new Map(), next: 1, older: null
  };
}
function nativeAtlasPage(withWallpaper, shellLayout) {
  const optics = withWallpaper ? readFileSync(join(PUBLIC, 'index.html'), 'utf8').match(/<svg class="ifl-optics"[\s\S]*?<\/svg>/)?.[0] : '';
  if (withWallpaper) assert.ok(optics, 'the shell supplies the refractor SVG');
  const tabs = '<nav id="fixture-nav" class="ifl-segs" aria-label="Atlas sections"></nav>';
  const mount = '<div id="fixture-atlas"></div>';
  const shell = shellLayout
    ? `<div id="in" class="today-in" hidden><div id="hd"><header class="ifl-hd ifh has-secs"><h1>Atlas</h1><div class="ifl-row2">${tabs}</div></header></div><div id="views"><main id="m-atlas" class="view ifl-screen" data-app="atlas">${mount}</main></div><div class="ifl-workspace ws-dock-host"><nav class="ws-dock" aria-label="Dock"><button class="ws-dock-button">Apps</button></nav></div></div>`
    : `<div id="in" hidden></div>${tabs}${mount}`;
  const head = atlasPage('fixture').split('<body')[0];
  return (shellLayout ? head.replace('</head>', '<link rel="stylesheet" href="/roof/workspace.css"></head>') : head) + `<body>
    <style nonce="fixture">
      ${shellLayout ? '' : 'body { display: flex; flex-direction: column; height: 100dvh; overflow: hidden; }'}
      #fixture-nav { margin: 12px 16px; flex: none; }
      #fixture-nav .ifl-sec[aria-current="page"] { background: var(--ifl-raised); color: var(--ifl-text); }
      #fixture-atlas { overflow: hidden; }
    </style>
    ${optics}${withWallpaper ? '<div class="sky" aria-hidden="true"><canvas></canvas></div>' : ''}
    ${shell}
    <script type="module" nonce="fixture">
      import { mount, SECTIONS } from '/atlas/roof/module.js';
      import { createSheets } from '/roof/sheet.js';
      const root = document.querySelector('#fixture-atlas');
      const tabs = document.querySelector('#fixture-nav');
      const html = document.documentElement;
      const screenEl = document.querySelector('#m-atlas');
      if (screenEl) { html.classList.add('ifl-os'); html.dataset.app = 'atlas'; }
      const fw = { screenEl, signal: new AbortController().signal, visible: () => true, fill(on) { if (screenEl) html.classList.toggle('ifl-fill', on); }, header: { set() {} },
        tabs: { away(hide) { html.toggleAttribute('data-os-dock-away', hide); document.querySelector('.ws-dock').hidden = hide; } },
        nav: { section: key => show(key), href: (key, arg) => '#' + key + (arg ? '=' + encodeURIComponent(arg) : ''),
          go: path => show(...path.slice(1).split('=').map(decodeURIComponent)) } };
      fw.sheet = createSheets(fw);
      const atlas = mount(root, fw);
      async function show(key, arg) {
        fw.sheet.closeAll();
        for (const tab of tabs.children) tab.setAttribute('aria-current', tab.dataset.key === key ? 'page' : 'false');
        fw.route = { key, arg };
        await atlas.show(fw.route);
      }
      for (const [key, title] of SECTIONS) {
        const tab = document.createElement('button');
        tab.className = 'ifl-sec';
        tab.dataset.key = key;
        tab.textContent = title;
        tab.addEventListener('click', () => show(key));
        tabs.append(tab);
      }
      await show('conversations', new URL(location.href).searchParams.get('conversation'));
      document.querySelector('#in').hidden = false;
      root.dataset.atlasReady = 'true';
    </script></body></html>`;
}
async function open(options = {}) {
  const fixture = Object.assign(defaultFixture(), options.fixture || {}), errors = [], security = [];
  const context = await browser.newContext({ viewport: { width: options.width || 1280, height: options.height || 900 }, deviceScaleFactor: options.deviceScaleFactor, colorScheme: options.theme || 'dark', reducedMotion: 'reduce', serviceWorkers: 'block', hasTouch: !!options.mobile, isMobile: !!options.mobile });
  if (options.shellLayout) await context.addInitScript(() => {
    const viewport = Object.assign(new EventTarget(), { height: innerHeight, offsetTop: 0, scale: 1 });
    Object.defineProperty(window, 'visualViewport', { value: viewport });
    window.resizeAtlasViewport = (height, offsetTop = 0) => {
      Object.assign(viewport, { height, offsetTop });
      viewport.dispatchEvent(new Event('resize'));
    };
  });
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
    if (url.pathname === '/atlas') return route.fulfill({ contentType: 'text/html', headers: { 'Content-Security-Policy': "default-src 'none'; script-src 'self' 'nonce-fixture'; style-src 'self' 'nonce-fixture'; font-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'" }, body: options.native ? nativeAtlasPage(options.wallpaper, options.shellLayout) : atlasPage('fixture') });
    if (url.pathname === '/account/api/account/appearance') return route.fulfill({ json: { signedIn: true, id: fixture.owner, palette: 'inflite', appearance: options.theme || 'dark', glass: options.glass ?? true } });
    if (!url.pathname.startsWith('/atlas/api/')) {
      if (!['/theme.js', '/app.css', '/atlas.svg'].includes(url.pathname) && !url.pathname.startsWith('/roof/') && !url.pathname.startsWith('/atlas/assets/') && !url.pathname.startsWith('/atlas/roof/')) return route.fulfill({ status: 404, body: '' });
      const type = url.pathname.endsWith('.css') ? 'text/css' : url.pathname.endsWith('.svg') ? 'image/svg+xml' : 'text/javascript';
      try { return route.fulfill({ contentType: type, body: readFileSync(resolve(PUBLIC, '.' + url.pathname)) }); } catch { return route.fulfill({ status: 404, body: '' }); }
    }
    const path = url.pathname.slice('/atlas/api/'.length), method = request.method(), owner = fixture.owner;
    let body; try { body = request.postDataJSON(); } catch {}
    fixture.requests.push({ path, method, body, search: url.search, headers: request.headers() });
    const reply = (data, status = 200, capturedOwner = owner) => route.fulfill({ status, headers: { 'X-Atlas-Owner': capturedOwner, 'Cache-Control': 'no-store' }, json: data });
    if (fixture.overrides.has(method + ' ' + path)) return fixture.overrides.get(method + ' ' + path)({ route, reply, body, url, owner });
    if (path === 'health') return reply({ owner, storage: { ready: fixture.ready, schemaVersion: fixture.ready ? 7 : 5 }, provider: { keySaved: fixture.connected, decryptable: fixture.connected, model: fixture.model, lastSuccessAt: fixture.tested ? now : null, ...fixture.provider }, coding: fixture.coding, environments: { ready: fixture.environmentsReady, storageReady: fixture.environmentsReady }, scheduling: { available: fixture.scheduling }, github: { connected: true, login: 'fixture-owner' } });
    if (path === 'session') return reply({ owner, available: true, signedIn: true });
    if (path === 'setup') { fixture.environmentsReady = true; fixture.ready = true; fixture.coding = { ready: true, storageReady: true, message: '' }; return reply({ ready: true, schemaVersion: 7 }); }
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
    if (path === 'environments') {
      if (method === 'POST') { const environment = { ...body, id: 'environment-' + fixture.next++, revision: 1, createdAt: now, updatedAt: now }; fixture.environments.push(environment); return reply({ environment }, 201); }
      return reply({ environments: fixture.environmentsReady ? fixture.environments : [], ready: fixture.environmentsReady });
    }
    const environmentMatch = /^environments\/([^/]+)$/.exec(path);
    if (environmentMatch) {
      const environment = fixture.environments.find(item => item.id === environmentMatch[1]);
      if (!environment) return reply({ code: 'not_found', error: 'Environment missing.' }, 404);
      if (method === 'DELETE') { fixture.environments = fixture.environments.filter(item => item.id !== environment.id); return reply({ removed: true }); }
      if (method === 'PATCH') { if (body.expectedRevision != null && body.expectedRevision !== environment.revision) return reply({ code: 'environment_changed', error: 'The environment changed. Reload it before saving.' }, 409); Object.assign(environment, body, { revision: environment.revision + 1 }); }
      return reply({ environment });
    }
    if (path === 'coding/inbox') {
      const filter = url.searchParams.get('filter'), before = url.searchParams.get('before');
      const rows = fixture.codingRuns.filter(run => {
        if (filter === 'review') return run.status === 'completed' && run.reviewReady;
        if (filter === 'active') return run.status === 'running';
        if (filter === 'finished') return run.status === 'published';
        return true;
      });
      const page = before ? rows.slice(1) : rows.slice(0, 1);
      return reply({ runs: page.map(run => ({ ...run, title: run.prompt, conversationTitle: fixture.conversations.find(c => c.id === run.conversationId)?.title })), next: !before && rows.length > 1 ? 'fixture-next' : null });
    }
    if (path === 'coding/runs') {
      if (method === 'POST') { const run = codingRun({ id: 'coding-' + fixture.next++, conversationId: body.conversationId, requestId: body.requestId, prompt: body.prompt, status: 'preparing', stage: 'preparing_workspace', ...(body.retryFromRunId ? { retryFromRunId: body.retryFromRunId, environment: { ...fixture.codingRuns.find(item => item.id === body.retryFromRunId)?.environment } } : body.environmentId ? { environment: { ...fixture.environments.find(item => item.id === body.environmentId), profileId: body.environmentId } } : {}) }); fixture.codingRuns.push(run); return reply({ run }, 202); }
      return reply({ runs: fixture.codingRuns.filter(run => run.conversationId === url.searchParams.get('conversationId')) });
    }
    match = /^coding\/runs\/([^/]+)(?:\/(cancel|continue|changes|diff|publish))?$/.exec(path);
    if (match) {
      const run = fixture.codingRuns.find(item => item.id === match[1]); if (!run) return reply({ code: 'not_found', error: 'Task missing.' }, 404);
      if (match[2] === 'cancel') Object.assign(run, { status: 'cancelled', stage: 'cancelled', canContinue: true, finishedAt: now + 100 });
      if (match[2] === 'continue') Object.assign(run, { status: 'running', stage: 'working', prompt: body.prompt, requestId: body.requestId, revision: run.revision + 1, canContinue: false, reviewReady: false, checks: [] });
      if (match[2] === 'changes') return reply({ run, files: fixture.codingFiles[run.id] || [], checks: run.checks });
      if (match[2] === 'diff') {
        if (url.searchParams.get('revision') !== String(run.revision)) return reply({ code: 'coding_review_changed', error: 'This task has a newer revision. Refresh the review to see its changes.' }, 409);
        const path = url.searchParams.get('path');
        return reply({ path, operation: 'modify', binary: false, diff: fixture.codingDiffs[path] || '- before\n+ after' });
      }
      if (match[2] === 'publish') { Object.assign(run, { status: 'published', canContinue: false, pullRequest: { url: 'https://github.com/fixture/atlas/pull/42', number: 42 } }); return reply({ run, pullRequest: run.pullRequest }); }
      return reply({ run });
    }
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
  await page.goto(ORIGIN + '/atlas' + (options.conversation ? '?conversation=' + encodeURIComponent(options.conversation) : ''));
  if (options.native) await page.locator('[data-atlas-ready="true"]').waitFor();
  else await page.waitForFunction(() => !document.body.classList.contains('session-check'));
  await page.waitForFunction(theme => document.documentElement.dataset.theme === theme, options.theme || 'dark');
  return { page, context, fixture, errors, security, async close() { security.push(...await page.evaluate(() => window.__atlasPolicyErrors || [])); await context.close(); }, async screenshot(name) { if (!process.env.ATLAS_UI_SCREENSHOTS) return; mkdirSync(process.env.ATLAS_UI_SCREENSHOTS, { recursive: true }); await page.screenshot({ path: join(process.env.ATLAS_UI_SCREENSHOTS, name + '.png'), fullPage: true }); } };
}
async function openThread(t, title) { if (await t.page.locator('#navigation-toggle').isVisible()) await t.page.locator('#navigation-toggle').click(); await t.page.locator('#conversation-list').getByRole('button', { name: new RegExp(title) }).click(); await t.page.waitForFunction(title => document.getElementById('conversation-title').textContent === title, title); }
async function openPanel(t, name) { await t.page.locator('#open-workspace').click(); await t.page.locator('.workspace-tools [data-open="' + name + '"]').click(); await t.page.locator('#' + name + '-dialog').waitFor({ state: 'visible' }); }
async function chooseMode(t, mode) { await t.page.locator('#composer-options').click(); await t.page.locator('#mode').selectOption(mode); await t.page.getByRole('button', { name: 'Close task options', exact: true }).click(); }
async function eventually(check) { let last; for (let i = 0; i < 60; i++) { try { check(); return; } catch (error) { last = error; await new Promise(resolve => setTimeout(resolve, 20)); } } throw last; }
async function emit(page, event, data) { await page.evaluate(({ event, data }) => window.__atlasEmit(event, data), { event, data }); }

function backdrop(locator) {
  return locator.evaluate(node => {
    const style = getComputedStyle(node);
    return style.backdropFilter || style.webkitBackdropFilter || 'none';
  });
}

function material(locator) {
  return locator.evaluate(node => {
    const style = getComputedStyle(node);
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    const context = canvas.getContext('2d');
    context.fillStyle = style.backgroundColor;
    context.fillRect(0, 0, 1, 1);
    return { radius: parseFloat(style.borderTopLeftRadius), shadow: style.boxShadow, alpha: context.getImageData(0, 0, 1, 1).data[3] };
  });
}

async function expectLens(page, locator, profile) {
  if (process.env.WEB_UI_BROWSER !== 'webkit') {
    const filter = await backdrop(locator);
    assert.ok(filter.includes('#ifl-system-lens-' + profile), filter);
    assert.ok(filter.includes('blur('), filter);
    return;
  }
  assert.match(await backdrop(locator), /blur\(/);
  const surface = await locator.elementHandle();
  await page.waitForFunction(node => {
    const bounds = node.getBoundingClientRect(), wallpaper = document.querySelector('.sky > canvas');
    const density = wallpaper.width / wallpaper.clientWidth;
    return density >= 1.99 && [...document.querySelectorAll('.sky > .ifl-orb-lens')].some(layer => {
      const lens = layer.getBoundingClientRect();
      return Math.abs(lens.x - bounds.x) < 1 && Math.abs(lens.y - bounds.y) < 1 &&
        Math.abs(lens.width - bounds.width) < 1 && Math.abs(lens.height - bounds.height) < 1 &&
        layer.firstElementChild.width >= Math.floor(bounds.width * density);
    });
  }, surface);
}

test('native Atlas Liquid Glass uses the shared refractor and removes optics when Glass is Off', async () => {
  const t = await open({ native: true, wallpaper: true, width: 390, mobile: true, deviceScaleFactor: 2, conversation: 'alpha' });
  try {
    const { page } = t;
    const mode = process.env.WEB_UI_BROWSER === 'webkit' ? 'artwork' : 'backdrop';
    await page.locator(`html[data-refractor="${mode}"]`).waitFor({ state: 'attached' });
    const composer = page.locator('#composer');
    const actions = page.locator('#conversation-menu summary');
    const lensLayers = page.locator('.sky > .ifl-orb-lens');
    const expectTranslucency = async surface => {
      const { alpha } = await material(surface);
      assert.ok(alpha > 0 && alpha < 255, `expected a visible translucent tint, got alpha ${alpha}`);
    };
    await expectLens(page, composer, 'control');
    await expectTranslucency(composer);

    await actions.click();
    const menu = page.locator('#conversation-menu[open] > div');
    await expectLens(page, menu, 'sheet');
    await expectTranslucency(menu);
    await page.evaluate(() => InFliteAppearance.setGlass({ glass: false }, { preview: true }));
    assert.equal(await page.locator('html').getAttribute('data-refractor'), null);
    assert.equal(await backdrop(composer), 'none');
    assert.equal(await backdrop(menu), 'none');
    assert.equal((await material(composer)).alpha, 255);
    assert.equal((await material(menu)).alpha, 255);
    assert.equal(await lensLayers.count(), 0);
    assert.equal(await page.getByRole('button', { name: 'Rename', exact: true }).isVisible(), true);

    await page.evaluate(() => InFliteAppearance.cancelGlassPreview());
    await expectLens(page, menu, 'sheet');
    await actions.click();
    await menu.waitFor({ state: 'hidden' });
    if (mode === 'artwork') await page.waitForFunction(() => document.querySelectorAll('.sky > .ifl-orb-lens').length === 1);

    await page.locator('#composer-options').click();
    const options = page.getByRole('dialog', { name: 'Task options', exact: true });
    await options.waitFor();
    await expectLens(page, options, 'sheet');
    await page.emulateMedia({ contrast: 'more' });
    await page.waitForFunction(() => !document.documentElement.hasAttribute('data-refractor'));
    assert.equal(await backdrop(options), 'none');
    assert.equal(await lensLayers.count(), 0);
    await options.getByRole('button', { name: 'Close task options' }).click();
    await options.waitFor({ state: 'hidden' });

    await page.emulateMedia({ contrast: 'no-preference' });
    await page.locator(`html[data-refractor="${mode}"]`).waitFor({ state: 'attached' });
    const mount = page.locator('#fixture-atlas');
    await mount.evaluate(root => {
      const pane = document.createElement('div');
      root.before(pane);
      pane.append(root);
      root.classList.add('ifl-in-pane');
    });
    assert.equal(await backdrop(composer), 'none');
    await lensLayers.first().waitFor({ state: 'detached' });
    await mount.evaluate(root => {
      root.classList.remove('ifl-in-pane');
      root.parentElement.replaceWith(root);
    });
    await expectLens(page, composer, 'control');
    assert.deepEqual(t.errors, []);
  } finally { await t.close(); }
  assert.deepEqual(t.security, []);
});

test('native Atlas sections keep their shared matte material and painted edges without nested blur', async () => {
  const run = codingRun({ status: 'completed', reviewReady: true });
  const fixture = developerFixture({ codingRuns: [run], environments: [cloudEnvironment()], briefs: [{ id: 'research-notes', title: 'Research notes', answer: 'A saved research answer.', sources: [source], created_at: now }] });
  const t = await open({ native: true, theme: 'light', fixture });
  try {
    const { page } = t;
    const tabs = page.getByRole('navigation', { name: 'Atlas sections' });
    const pageCard = async locator => {
      await locator.waitFor();
      const on = await material(locator);
      assert.ok(on.radius >= 20, JSON.stringify(on));
      assert.notEqual(on.shadow, 'none');
      assert.equal(on.alpha, 255);
      assert.equal(await backdrop(locator), 'none');
      await page.evaluate(() => InFliteAppearance.setGlass({ glass: false }, { preview: true }));
      const off = await material(locator);
      assert.equal(off.radius, on.radius);
      assert.equal(off.alpha, 255);
      assert.notEqual(off.shadow, on.shadow);
      await page.evaluate(() => InFliteAppearance.cancelGlassPreview());
    };

    await pageCard(page.locator('.starter-grid'));
    await tabs.getByRole('button', { name: 'Tasks', exact: true }).click();
    const taskList = page.locator('#inbox-list').filter({ hasText: run.prompt });
    await pageCard(taskList);
    await tabs.getByRole('button', { name: 'Environments', exact: true }).click();
    await pageCard(page.locator('.environment-card'));
    await tabs.getByRole('button', { name: 'Briefs', exact: true }).click();
    await page.getByRole('button', { name: /Research notes/ }).click();
    await pageCard(page.locator('.brief-card'));
    await tabs.getByRole('button', { name: 'Settings', exact: true }).click();
    const settings = page.locator('dialog[open] .settings-section').first();
    await settings.waitFor();
    assert.match(await backdrop(page.locator('dialog[open]')), /blur\(/);
    assert.equal(await backdrop(settings), 'none');
    assert.ok((await material(settings)).radius >= 20);
    assert.deepEqual(t.errors, []);
  } finally { await t.close(); }
  assert.deepEqual(t.security, []);
});

test('the mobile native shell keeps Atlas scrollable above the dock during a coding task', async () => {
  const run = codingRun({ status: 'preparing', stage: 'preparing_workspace', activity: [],
    summary: Array.from({ length: 22 }, (_, i) => `Workspace preparation update ${i + 1}.`).join('\n\n') });
  const briefs = Array.from({ length: 25 }, (_, i) => ({ id: 'brief-' + i, title: 'Saved brief ' + i, created_at: now }));
  const t = await open({ native: true, shellLayout: true, width: 390, height: 750, mobile: true, conversation: 'repo', fixture: developerFixture({ codingRuns: [run], briefs }) });
  try {
    const { page } = t;
    await page.locator('.coding-run[open]').waitFor();
    const composer = page.locator('#composer'), messages = page.locator('#messages');
    const dock = page.getByRole('navigation', { name: 'Dock' });
    const dockTop = (await dock.boundingBox()).y;
    const { y, height } = await composer.boundingBox();
    assert.ok(y + height < dockTop, `composer bottom ${y + height} overlaps dock top ${dockTop}`);
    const available = await messages.evaluate(el => el.scrollHeight - el.clientHeight);
    assert.ok(available > 200, 'the long task must create a scrollable conversation');
    await messages.evaluate(el => { el.scrollTop = 0; });
    if (process.env.WEB_UI_BROWSER === 'webkit') {
      await messages.focus();
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('ArrowDown');
    } else {
      const feed = await messages.boundingBox();
      await page.mouse.move(feed.x + feed.width / 2, feed.y + feed.height / 2);
      await page.mouse.wheel(0, 160);
    }
    await page.waitForFunction(() => document.getElementById('messages').scrollTop > 50);
    assert.equal(await page.evaluate(() => scrollY), 0);
    const readingPosition = await messages.evaluate(el => el.scrollTop);
    run.summary += '\n\nWorkspace progress was refreshed.';
    await messages.getByText('Workspace progress was refreshed.').waitFor();
    assert.ok(Math.abs(await messages.evaluate(el => el.scrollTop) - readingPosition) <= 2, 'task refresh must preserve the scroll position');

    await page.locator('#prompt').fill('Keep this draft');
    await page.evaluate(() => resizeAtlasViewport(420, 18));
    await page.waitForFunction(() => document.getElementById('composer').getBoundingClientRect().bottom <= 438);
    assert.equal(await dock.isVisible(), false);
    await page.locator('#prompt').blur();
    await page.evaluate(() => resizeAtlasViewport(innerHeight));
    await dock.waitFor();
    await page.getByRole('button', { name: 'Briefs', exact: true }).click();
    const destination = page.locator('#atlas-destination-scroll');
    await destination.getByRole('button', { name: /Saved brief 24/ }).waitFor();
    await destination.evaluate(el => { el.scrollTop = el.scrollHeight; });
    const last = await destination.getByRole('button', { name: /Saved brief 24/ }).boundingBox();
    assert.ok(last.y + last.height < dockTop, 'the last row should be reachable above the dock');
    assert.deepEqual(t.errors, []);
  } finally { await t.close(); }
});

for (const [width, theme] of [[320, 'dark'], [1440, 'light']]) test('native Atlas uses inline sections and shared sheets at ' + width + 'px', async () => {
  const run = codingRun({ status: 'completed', reviewReady: true });
  const fixture = developerFixture({ codingRuns: [run], environments: [cloudEnvironment()], briefs: [{ id: 'research-notes', title: 'Research notes', answer: 'A saved research answer.', sources: [source], created_at: now }] });
  const t = await open({ native: true, width, theme, mobile: width < 721, fixture });
  try {
    const tabs = t.page.getByRole('navigation', { name: 'Atlas sections' });
    const destination = t.page.locator('#atlas-destination');
    await t.page.getByRole('heading', { name: 'What shall we work on?' }).waitFor();
    await t.page.locator('#prompt').fill('Keep this draft');
    await t.screenshot('atlas-native-conversation-' + width);
    await tabs.getByRole('button', { name: 'Tasks', exact: true }).click();
    await destination.getByRole('heading', { name: run.prompt }).waitFor();
    assert.equal(await t.page.locator('dialog[open]').count(), 0);
    assert.equal(await t.page.locator('#conversation-main').isVisible(), false);
    await t.screenshot('atlas-native-tasks-' + width);
    await destination.getByRole('button', { name: 'In progress' }).click();
    await destination.getByText('No tasks match this status').waitFor();
    await destination.getByRole('button', { name: 'Review', exact: true }).click();
    await destination.getByRole('button', { name: 'Review changes' }).click();
    const review = t.page.getByRole('dialog', { name: 'Review changes' });
    await review.getByText('0 changed files').waitFor();
    await review.getByRole('button', { name: 'Back to tasks' }).click();
    await review.waitFor({ state: 'hidden' });
    assert.equal(await destination.getByRole('button', { name: 'Review', exact: true }).getAttribute('aria-pressed'), 'true');
    await tabs.getByRole('button', { name: 'Environments' }).click();
    await destination.getByRole('button', { name: 'Edit Atlas development' }).click();
    assert.equal(await destination.getByText('No environments yet').isVisible(), false);
    await destination.locator('#environment-name').fill('Keep this environment draft');
    await t.screenshot('atlas-native-environments-' + width);
    await tabs.getByRole('button', { name: 'Briefs' }).click();
    await destination.getByRole('button', { name: /Research notes/ }).click();
    await destination.getByText('A saved research answer.').waitFor();
    await t.screenshot('atlas-native-brief-' + width);
    await destination.getByRole('button', { name: 'All briefs' }).click();
    await destination.getByRole('button', { name: /Research notes/ }).waitFor();
    await tabs.getByRole('button', { name: 'Environments' }).click();
    assert.equal(await destination.locator('#environment-name').inputValue(), 'Keep this environment draft');
    const overflow = await destination.evaluate(el => el.scrollWidth > el.clientWidth || el.firstElementChild.scrollWidth > el.firstElementChild.clientWidth);
    assert.equal(overflow, false);
    await tabs.getByRole('button', { name: 'Conversations' }).click();
    assert.equal(await t.page.locator('#prompt').inputValue(), 'Keep this draft');
    await t.page.locator('#composer-options').click();
    const options = t.page.getByRole('dialog', { name: 'Task options' });
    await options.getByRole('button', { name: /^Personal/ }).click();
    assert.match(await t.page.locator('#workspace-label').textContent(), /Personal/);
    await options.getByRole('button', { name: 'Close task options' }).click();
    await options.waitFor({ state: 'hidden' });
    assert.deepEqual(t.errors, []);
  } finally { await t.close(); }
});

for (const width of [320, 390, 1440]) for (const theme of ['light', 'dark']) test('mobile-first layout fits ' + width + 'px in ' + theme + ' appearance', async () => {
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

test('Atlas opens a conversation while the secondary workspace requests are pending', async () => {
  let releaseRepositories;
  const gate = new Promise(resolve => { releaseRepositories = resolve; });
  const overrides = new Map([['GET repositories', async ({ reply }) => {
    await gate; return reply({ repositories: [{ full_name: 'fixture/atlas' }] });
  }]]);
  const t = await open({ fixture: { overrides } });
  try {
    await eventually(() => assert.ok(t.fixture.requests.some(call => call.path === 'repositories')));
    await openThread(t, 'Alpha research');
    await t.page.locator('#prompt').fill('Work while repositories load');
    assert.equal(await t.page.locator('#send').isEnabled(), true);
  } finally { releaseRepositories(); await t.close(); }
});

test('a superseded conversation cannot replace a newer selection or its in-progress draft', async () => {
  const t = await open();
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  try {
    await openThread(t, 'Alpha research');
    t.fixture.overrides.set('GET conversations/beta', async ({ reply }) => {
      await gate;
      return reply({ conversation: t.fixture.conversations.find(c => c.id === 'beta'), messages: t.fixture.messages.beta });
    });
    await t.page.locator('#conversation-list').getByRole('button', { name: /Beta planning/ }).click();
    await t.page.getByText('Loading conversation…', { exact: true }).waitFor();
    await t.page.locator('#prompt').fill('A draft edited during navigation');
    assert.equal(await t.page.locator('#send').isDisabled(), true);
    await openThread(t, 'Alpha research');
    release();
    await t.page.waitForFunction(() => document.getElementById('messages').getAttribute('aria-busy') !== 'true');
    assert.equal(await t.page.locator('#prompt').inputValue(), 'A draft edited during navigation');
    assert.match(await t.page.locator('#messages').textContent(), /Evidence here/);
    assert.equal(await t.page.locator('#send').isEnabled(), true);
    assert.deepEqual(t.errors, []);
  } finally { release(); await t.close(); }
});

test('conversation search includes repositories and mode while archive navigation ignores stale results', async () => {
  const t = await open({ fixture: developerFixture() });
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const task = t.fixture.conversations[0];
  try {
    await t.page.locator('#conversation-search').fill('developer fixture/atlas');
    await t.page.locator('#conversation-list').getByRole('button', { name: /Repository task/ }).waitFor();
    t.fixture.overrides.set('GET conversations', async ({ reply, url }) => {
      if (url.searchParams.get('archived') === '1') {
        await gate;
        return reply({ conversations: [{ ...task, id: 'archived', title: 'Stale archive', archived: true }] });
      }
      return reply({ conversations: [task] });
    });
    await t.page.locator('#show-archived').check();
    await t.page.getByText('Loading conversations…', { exact: true }).waitFor();
    await t.page.locator('#show-archived').uncheck();
    release();
    await t.page.locator('#conversation-list').getByRole('button', { name: /Repository task/ }).waitFor();
    assert.doesNotMatch(await t.page.locator('#conversation-list').textContent(), /Stale archive/);
  } finally { release(); await t.close(); }
});

test('live replies keep their text node, respect reading position and format once completed', async () => {
  const t = await open({ width: 390, height: 720, mobile: true });
  try {
    await openThread(t, 'Alpha research');
    await t.page.locator('#prompt').fill('A long response');
    await t.page.locator('#send').click();
    await t.page.waitForFunction(() => !!window.__atlasStream.request);
    await emit(t.page, 'delta', { text: 'A long response line.\n'.repeat(80) });
    await t.page.waitForFunction(() => document.querySelector('.streaming-text')?.textContent.length > 1000);
    await t.page.locator('.streaming-text').evaluate(el => { window.__firstStreamNode = el.firstChild; });
    await t.page.locator('#messages').evaluate(el => { el.scrollTop = 0; });
    await t.page.getByRole('button', { name: 'Jump to latest' }).waitFor();
    await emit(t.page, 'delta', { text: 'Another update.' });
    await t.page.waitForFunction(() => document.querySelector('.streaming-text')?.textContent.endsWith('Another update.'));
    assert.equal(await t.page.locator('.streaming-text').evaluate(el => el.firstChild === window.__firstStreamNode), true);
    assert.equal(await t.page.locator('#messages').evaluate(el => el.scrollTop), 0);
    await t.page.getByRole('button', { name: 'Jump to latest' }).click();
    assert.ok(await t.page.locator('#messages').evaluate(el => el.scrollHeight - el.clientHeight - el.scrollTop < 3));
    await emit(t.page, 'done', { message: { answer: '**Formatted** answer.', status: 'completed', sources: [] } });
    await t.page.getByText('Formatted', { exact: true }).waitFor();
    assert.equal(await t.page.locator('.streaming-text').count(), 0);
    assert.deepEqual(t.errors, []);
  } finally { await t.close(); }
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

test('Send explores a repository without manual sources and Work on task starts independently', async () => {
  const t = await open({ width: 320, height: 844, mobile: true }); try {
    await chooseMode(t, 'developer'); await t.page.locator('#repository').selectOption('fixture/atlas');
    await t.page.locator('#composer-options').click();
    assert.equal(await t.page.locator('#repository-note').textContent(), 'Atlas finds and reads relevant files automatically.');
    assert.equal(await t.page.locator('#repository-note').isVisible(), true);
    assert.equal(await t.page.getByRole('button', { name: 'Add specific sources (optional)' }).isVisible(), true);
    await t.page.getByRole('button', { name: 'Close task options', exact: true }).click();
    const geometry = await t.page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth, composer: document.getElementById('composer').getBoundingClientRect().toJSON(), height: innerHeight }));
    assert.ok(geometry.scrollWidth <= geometry.width + 1 && geometry.composer.bottom <= geometry.height + 1, JSON.stringify(geometry));
    assert.ok(geometry.composer.height <= 190, JSON.stringify(geometry));
    await t.page.locator('#intent-ask').click();
    await t.page.locator('#prompt').fill('import repo'); await t.page.locator('#send').click();
    await t.page.waitForFunction(() => !!window.__atlasStream.request);
    const request = await t.page.evaluate(() => window.__atlasStream.request), created = t.fixture.requests.find(r => r.path === 'conversations' && r.method === 'POST');
    assert.equal(request.prompt, 'import repo'); assert.deepEqual(request.context, []);
    assert.equal(created.body.mode, 'developer'); assert.equal(created.body.repository, 'fixture/atlas');
    assert.equal(t.fixture.requests.some(r => ['repositories/tree', 'repositories/context'].includes(r.path)), false);
    assert.equal(await t.page.locator('#context-dialog').isVisible(), false);
    await emit(t.page, 'status', { stage: 'reading_repository' });
    await t.page.waitForFunction(() => document.getElementById('conversation-status').textContent === 'Reading repository…');
    const files = [repositoryFile('README.md'), repositoryFile('src/app.js')];
    await emit(t.page, 'source', { source: files[1] });
    await emit(t.page, 'done', { message: { status: 'completed', answer: 'I have inspected fixture/atlas and its application entry point.', context: [...files, repositoryFile('foreign.js', { repository: 'fixture/other' }), repositoryFile('.github/workflows/deploy.yml'), repositoryFile('symlink.js', { mode: '120000' })], sources: files } });
    await t.page.locator('#stop-response').waitFor({ state: 'hidden' });
    assert.match(await t.page.locator('[aria-label="Context used for this response"]').textContent(), /README\.md.*aaaaaaaaaaaa.*src\/app\.js/s);
    assert.equal(await t.page.locator('.source-list a[href="' + files[1].url + '"]').count(), 1);
    assert.equal(await t.page.locator('#attached-context').textContent(), '');
    await t.page.locator('#intent-code').click(); await t.page.locator('#prompt').fill('Correct the application entry point'); await t.page.locator('#start-coding').click();
    await t.page.locator('.coding-run').waitFor();
    const started = t.fixture.requests.find(r => r.path === 'coding/runs' && r.method === 'POST');
    assert.equal(started.body.prompt, 'Correct the application entry point'); assert.equal(started.body.conversationId, request.conversationId);
    assert.deepEqual(Object.keys(started.body).sort(), ['conversationId', 'prompt', 'requestId']);
    assert.equal(t.fixture.requests.filter(r => /\/publish$/.test(r.path)).length, 0);
    assert.equal(t.fixture.requests.some(r => r.path === 'patches/prepare'), false); assert.deepEqual(t.errors, []);
  } finally { await t.close(); }
});

for (const includeExplicit of [false, true]) test('Retry refreshes automatic repository context' + (includeExplicit ? ' while retaining explicit sources' : ' without manual sources'), async () => {
  const automatic = Array.from({ length: 8 }, (_, i) => repositoryFile('src/read-' + i + '.js', { automatic: true }));
  const explicit = includeExplicit ? [repositoryFile('docs/pinned.md')] : [];
  const t = await open({ fixture: { conversations: [{ id: 'repo', title: 'Repository investigation', mode: 'developer', repository: 'fixture/atlas', created_at: now }], messages: { repo: [
    { id: 'interrupted', status: 'incomplete', prompt: 'Investigate this repository', answer: 'Partial findings.', context: [...explicit, ...automatic], sources: [] }
  ] } } });
  try {
    await openThread(t, 'Repository investigation'); await t.page.getByRole('button', { name: 'Retry', exact: true }).click();
    assert.equal(await t.page.locator('#prompt').inputValue(), 'Investigate this repository');
    assert.equal(await t.page.locator('#attached-context .context-chip').count(), explicit.length);
    assert.doesNotMatch(await t.page.locator('#attached-context').textContent(), /read-\d/);
    await t.page.locator('#send').click(); await t.page.waitForFunction(() => !!window.__atlasStream.request);
    const request = await t.page.evaluate(() => window.__atlasStream.request);
    assert.deepEqual(request.context, explicit.map(({ kind, repository, path, ref }) => ({ kind, repository, path, ref })));
    assert.equal(request.conversationId, 'repo'); assert.equal(t.fixture.requests.some(r => r.path === 'repositories/tree'), false); assert.deepEqual(t.errors, []);
  } finally { await t.close(); }
});

test('coding tasks start directly with a repository and prompt at 320px without file selection', async () => {
  const t = await open({ width: 320, height: 844, mobile: true }); try {
    await chooseMode(t, 'developer'); await t.page.locator('#repository').selectOption('fixture/atlas');
    await t.page.locator('#prompt').fill('Implement the feature across the repository and run the focused checks.');
    assert.equal(await t.page.locator('#start-coding').isEnabled(), true);
    assert.match(await t.page.locator('#coding-allowance').textContent(), /\$2 task allowance.*best effort.*additional or delayed.*compute.*separately/);
    await t.page.locator('#composer-options').click(); await t.page.locator('.coding-permissions summary').click(); assert.match(await t.page.locator('.coding-permissions').textContent(), /edit files and run commands in an isolated workspace/); await t.page.getByRole('button', { name: 'Close task options', exact: true }).click();
    const geometry = await t.page.evaluate(() => ({ width: innerWidth, height: innerHeight, scrollWidth: document.documentElement.scrollWidth, composer: document.getElementById('composer').getBoundingClientRect().toJSON() }));
    assert.ok(geometry.scrollWidth <= geometry.width + 1 && geometry.composer.left >= 0 && geometry.composer.right <= geometry.width + 1 && geometry.composer.bottom <= geometry.height + 1, JSON.stringify(geometry));
    await t.page.locator('#start-coding').click(); await t.page.locator('.coding-run').waitFor();
    const created = t.fixture.requests.find(call => call.path === 'conversations' && call.method === 'POST'), started = t.fixture.requests.find(call => call.path === 'coding/runs' && call.method === 'POST');
    assert.equal(created.body.mode, 'developer'); assert.equal(created.body.repository, 'fixture/atlas');
    assert.equal(started.body.prompt, 'Implement the feature across the repository and run the focused checks.');
    assert.deepEqual(Object.keys(started.body).sort(), ['conversationId', 'prompt', 'requestId']); assert.match(started.body.requestId, /^[a-f0-9-]{36}$/);
    assert.equal(t.fixture.requests.some(call => ['repositories/tree', 'repositories/context', 'patches/prepare'].includes(call.path)), false);
    assert.equal(await t.page.evaluate(() => window.__atlasStream.requests.length), 0);
    assert.match(await t.page.locator('.coding-run').textContent(), /Leaving does not cancel this task/);
    assert.equal(await t.page.locator('#prompt').inputValue(), ''); assert.deepEqual(t.errors, []);
    await t.screenshot('atlas-coding-task-320');
  } finally { await t.close(); }
});

test('coding storage upgrade leaves chat available and enables tasks through existing setup', async () => {
  const t = await open({ fixture: { coding: { ready: false, storageReady: false, message: 'Prepare coding task storage.' } } }); try {
    await chooseMode(t, 'developer'); await t.page.locator('#repository').selectOption('fixture/atlas'); await t.page.locator('#prompt').fill('Inspect this repository');
    assert.equal(await t.page.locator('#send').isEnabled(), true); assert.equal(await t.page.locator('#start-coding').isDisabled(), true);
    assert.equal(await t.page.locator('#upgrade-storage').isVisible(), true); assert.match(await t.page.locator('#setup-message').textContent(), /conversations are ready/);
    await t.page.locator('#upgrade-storage').click();
    // The session privacy mask hides the banner before refreshed health and
    // repository data are ready. Wait for the usable composer, not that mask.
    await t.page.waitForFunction(() => !document.body.classList.contains('session-check') && document.getElementById('setup-banner').hidden && !document.getElementById('start-coding').disabled);
    assert.equal(await t.page.locator('#mode').inputValue(), 'developer'); assert.equal(await t.page.locator('#repository').inputValue(), 'fixture/atlas'); assert.equal(await t.page.locator('#prompt').inputValue(), 'Inspect this repository');
    assert.equal(await t.page.locator('#start-coding').isEnabled(), true); assert.deepEqual(t.fixture.requests.find(call => call.path === 'setup').body, { confirm: true }); assert.deepEqual(t.errors, []);
  } finally { await t.close(); }
});

test('coding tasks restore after reload and navigation, poll remote progress and never cancel on detach', async () => {
  const run = codingRun();
  const fixture = developerFixture({ codingRuns: [run] }); fixture.conversations.push({ id: 'other', title: 'Another conversation', mode: 'research', created_at: now }); fixture.messages.other = [];
  const t = await open({ fixture }); try {
    await openThread(t, 'Repository task'); await t.page.locator('.coding-run').waitFor();
    await t.page.reload(); await t.page.locator('.coding-run').waitFor(); assert.match(await t.page.locator('.coding-run').textContent(), /Build the repository improvement/);
    await openThread(t, 'Another conversation'); assert.equal(await t.page.locator('.coding-run').count(), 0);
    await openThread(t, 'Repository task'); await t.page.locator('.coding-run').waitFor();
    Object.assign(run, { status: 'completed', stage: 'completed', summary: 'Implemented and saved the result.', changes: { added: 0, modified: 1, deleted: 0 }, canContinue: true, reviewReady: true });
    await t.page.waitForFunction(() => document.querySelector('.coding-run')?.textContent.includes('Implemented and saved the result.'), undefined, { timeout: 10000 });
    assert.ok(t.fixture.requests.some(call => call.path === 'coding/runs/coding-1' && call.method === 'GET'));
    assert.match(await t.page.locator('.coding-run').textContent(), /Tests are not verified/);
    assert.equal(t.fixture.requests.some(call => /coding\/runs\/.+\/cancel$/.test(call.path)), false);
    assert.equal(t.fixture.requests.some(call => call.path === 'coding/runs' && call.method === 'POST'), false); assert.deepEqual(t.errors, []);
  } finally { await t.close(); }
});

test('the mobile Tasks inbox opens other conversations and reviews saved changes by revision', async () => {
  const reviewable = codingRun({ status: 'completed', reviewReady: true, revision: 3, summary: 'Saved changes are ready.' });
  const active = codingRun({ id: 'coding-other', conversationId: 'other-repo', prompt: 'Prepare another change' });
  const fixture = developerFixture({ codingRuns: [reviewable, active], codingFiles: { 'coding-1': [{ path: 'src/app.js', operation: 'modify' }] } });
  fixture.conversations.push({ id: active.conversationId, title: 'Other repository task', mode: 'developer', repository: 'fixture/atlas' });
  const t = await open({ width: 320, height: 844, mobile: true, fixture });
  try {
    await t.page.locator('#navigation-toggle').click();
    await t.page.locator('#navigation-dialog').getByRole('button', { name: 'Tasks', exact: true }).click();
    const inbox = t.page.getByRole('dialog', { name: 'Tasks', exact: true });
    await inbox.getByRole('button', { name: 'Load more tasks' }).click();
    await inbox.getByRole('heading', { name: active.prompt }).waitFor();
    assert.ok(t.fixture.requests.some(call => call.path === 'coding/inbox' && new URLSearchParams(call.search).get('before') === 'fixture-next'));
    await inbox.getByLabel('Status').selectOption('review');
    await inbox.getByRole('button', { name: 'Review changes' }).click();
    const review = t.page.getByRole('dialog', { name: 'Review changes' });
    await review.getByText('Revision 3', { exact: false }).waitFor();
    assert.equal(t.fixture.requests.some(call => call.path === 'coding/runs'), false);
    reviewable.revision = 4;
    await review.locator('.patch-file summary').click();
    await review.getByText('This task has a newer revision.', { exact: false }).waitFor();
    assert.equal(await review.locator('#publish-coding').isDisabled(), true);
    await review.getByRole('button', { name: 'Refresh review' }).click();
    await review.getByText('Revision 4', { exact: false }).waitFor();
    await review.locator('.patch-file summary').click();
    await review.getByText('+ after', { exact: false }).waitFor();
    const revisions = t.fixture.requests.filter(call => call.path.endsWith('/diff')).map(call => new URLSearchParams(call.search).get('revision'));
    assert.deepEqual(revisions, ['3', '4']);
    await review.getByRole('button', { name: 'Back to tasks' }).click();
    assert.equal(await inbox.getByLabel('Status').inputValue(), 'review');
    await inbox.getByLabel('Status').selectOption('active');
    await inbox.getByRole('heading', { name: active.prompt }).waitFor();
    await inbox.getByRole('button', { name: 'Open conversation' }).click();
    await t.page.locator('.coding-run[data-run-id="coding-other"][open]').waitFor();
    assert.equal(await t.page.locator('#conversation-title').textContent(), 'Other repository task');
    assert.equal(t.fixture.requests.some(call => call.method === 'POST' && call.path.startsWith('coding/')), false);
    assert.deepEqual(t.errors, []);
  } finally { await t.close(); }
});

test('coding review handles six files, additions, deletions and failed executed commands before explicit publication', async () => {
  const files = Array.from({ length: 6 }, (_, i) => ({ path: 'src/file-' + i + '.js', operation: i < 2 ? 'add' : i === 5 ? 'delete' : 'modify', beforeMode: i < 2 ? null : '100644', afterMode: i === 5 ? null : '100644', bytes: 40 }));
  const run = codingRun({ status: 'completed', stage: 'completed', reviewReady: true, canContinue: true, revision: 3, changes: { added: 2, modified: 3, deleted: 1 }, checks: [{ command: 'npm run test:atlas', status: 'completed', outcome: 'failed', source: 'provider_command_execution', exitCode: 1, output: 'One focused test failed: expected a saved result.' }] });
  const t = await open({ width: 320, height: 844, mobile: true, fixture: developerFixture({ codingRuns: [run], codingFiles: { 'coding-1': files } }) }); try {
    await openThread(t, 'Repository task'); await t.page.getByRole('button', { name: 'Review changes', exact: true }).click();
    await t.page.waitForFunction(() => document.querySelectorAll('#patch-detail .patch-file').length === 6);
    assert.match(await t.page.locator('#patch-detail').textContent(), /6 changed files/);
    assert.match(await t.page.locator('#patch-detail .patch-file').first().textContent(), /add · src\/file-0/); assert.match(await t.page.locator('#patch-detail .patch-file').last().textContent(), /delete · src\/file-5/);
    assert.match(await t.page.locator('#patch-detail .coding-checks').textContent(), /Executed commands.*npm run test:atlas.*failed.*exit 1/s);
    assert.doesNotMatch(await t.page.locator('#patch-detail').textContent(), /Tests passed|Validation plan/);
    assert.equal(t.fixture.requests.filter(call => /\/diff$/.test(call.path)).length, 0);
    await t.page.locator('#patch-detail .patch-file summary').first().click(); await t.page.waitForFunction(() => document.querySelector('#patch-detail .patch-file pre').textContent.includes('+ after'));
    const diff = t.fixture.requests.filter(call => /\/diff$/.test(call.path)); assert.equal(diff.length, 1); assert.equal(new URLSearchParams(diff[0].search).get('path'), files[0].path);
    await t.page.locator('#patch-detail .coding-check summary').click(); assert.match(await t.page.locator('#patch-detail .coding-check pre').textContent(), /One focused test failed/);
    const size = await t.page.locator('#patches-dialog').evaluate(el => ({ width: innerWidth, right: el.getBoundingClientRect().right, left: el.getBoundingClientRect().left, scroll: document.documentElement.scrollWidth })); assert.ok(size.left >= 0 && size.right <= size.width + 1 && size.scroll <= size.width + 1, JSON.stringify(size));
    t.page.once('dialog', dialog => dialog.dismiss()); await t.page.locator('#publish-coding').click(); assert.equal(t.fixture.requests.filter(call => /\/publish$/.test(call.path)).length, 0);
    t.page.once('dialog', dialog => dialog.accept()); await t.page.locator('#publish-coding').click(); await t.page.locator('#patch-detail').getByRole('link', { name: 'Open draft pull request' }).waitFor();
    assert.deepEqual(t.fixture.requests.find(call => /\/publish$/.test(call.path)).body, { confirm: true, revision: 3 });
    assert.equal(t.fixture.requests.filter(call => /\/publish$/.test(call.path)).length, 1); assert.deepEqual(t.errors, []);
    await t.screenshot('atlas-coding-review-320');
  } finally { await t.close(); }
});

test('Stop task is explicit and Continue task submits a new instruction without manual sources', async () => {
  const t = await open({ fixture: developerFixture({ codingRuns: [codingRun()] }) }); try {
    await openThread(t, 'Repository task'); await t.page.getByRole('button', { name: 'Stop task', exact: true }).click();
    await t.page.waitForFunction(() => document.querySelector('.coding-run .message-status')?.textContent === 'Stopped');
    assert.equal(t.fixture.requests.filter(call => /\/cancel$/.test(call.path)).length, 1);
    await t.page.locator('.coding-run').getByRole('button', { name: 'Continue task', exact: true }).click();
    await t.page.locator('#prompt').fill('Fix the remaining failing check and continue.'); assert.equal(await t.page.locator('#start-coding').textContent(), 'Continue task'); await t.page.locator('#start-coding').click();
    await eventually(() => assert.equal(t.fixture.requests.filter(call => /\/continue$/.test(call.path)).length, 1));
    const request = t.fixture.requests.find(call => /\/continue$/.test(call.path)); assert.deepEqual(Object.keys(request.body).sort(), ['prompt', 'requestId']); assert.equal(request.body.prompt, 'Fix the remaining failing check and continue.'); assert.notEqual(request.body.requestId, 'request-1');
    assert.equal(t.fixture.requests.some(call => call.path === 'coding/runs' && call.method === 'POST'), false); assert.equal(t.fixture.requests.some(call => call.path === 'repositories/context'), false);
    await t.page.waitForFunction(() => document.querySelector('.coding-run .message-status')?.textContent === 'Working'); assert.deepEqual(t.errors, []);
  } finally { await t.close(); }
});

test('coding project permission failures stay actionable without clearing the conversation', async () => {
  const t = await open({ fixture: developerFixture() }); try {
    await openThread(t, 'Repository task');
    t.fixture.overrides.set('GET coding/runs/coding-1', ({ reply }) => {
      const run = t.fixture.codingRuns[0]; Object.assign(run, { status: 'failed', stage: 'Task could not start', canContinue: false, error: { code: 'agent_access_unavailable', message: 'This OpenAI key or project does not have access to hosted coding sessions. Enable Agents read and write access and Responses write access for the saved key.' } });
      return reply({ run });
    });
    await t.page.locator('#prompt').fill('Implement a change'); await t.page.locator('#start-coding').click();
    await t.page.waitForFunction(() => document.querySelector('.coding-run .message-error')?.textContent.includes('Enable Agents read and write'), undefined, { timeout: 10000 });
    assert.equal(await t.page.locator('#conversation-title').textContent(), 'Repository task'); assert.equal(await t.page.locator('.coding-run .message-status').textContent(), 'Failed');
    assert.equal(await t.page.locator('.coding-run').getByRole('button', { name: 'Continue task', exact: true }).count(), 0);
    await t.page.locator('#prompt').fill('Explain this repository instead');
    assert.equal(await t.page.locator('#send').isEnabled(), true); assert.equal(await t.page.evaluate(() => document.body.classList.contains('session-check')), false); assert.deepEqual(t.errors, []);
  } finally { await t.close(); }
});

test('account switching clears coding progress and drops a late task response', async () => {
  const t = await open({ fixture: developerFixture({ codingRuns: [codingRun()] }) }); let release; try {
    await openThread(t, 'Repository task'); await t.page.locator('.coding-run').waitFor();
    const delayed = new Promise(resolve => { release = resolve; }); let held = false;
    t.fixture.overrides.set('GET coding/runs/coding-1', async ({ reply, owner }) => { held = true; await delayed; try { return await reply({ run: codingRun({ summary: 'LATE OWNER A CODING CONTENT' }) }, 200, owner); } catch {} });
    await t.page.waitForRequest(request => new URL(request.url()).pathname === '/atlas/api/coding/runs/coding-1', { timeout: 10000 });
    await eventually(() => assert.equal(held, true));
    t.fixture.owner = 'owner-b'; t.fixture.settings = { memoryEnabled: false, memory: '', dailyRequestLimit: 20, timezone: 'UTC' }; t.fixture.conversations = []; t.fixture.messages = {}; t.fixture.codingRuns = [];
    // A second owned request observes the account switch while the coding snapshot is delayed.
    await t.page.locator('#open-workspace').click(); await t.page.locator('.workspace-tools [data-open="usage"]').click(); await t.page.waitForFunction(() => !document.body.classList.contains('session-check') && document.getElementById('conversation-title').textContent === 'New conversation'); release();
    await t.page.waitForTimeout(40); assert.equal(await t.page.locator('.coding-run').count(), 0); assert.equal(await t.page.locator('#prompt').inputValue(), '');
    assert.doesNotMatch(await t.page.locator('body').textContent(), /LATE OWNER A|Build the repository improvement|Repository task/);
    assert.equal(t.fixture.requests.some(call => /coding\/runs\/.+\/cancel$/.test(call.path)), false); assert.deepEqual(t.errors, []);
  } finally { release?.(); await t.close(); }
});

test('previously prepared changes remain reviewable and require explicit publication', async () => {
  const patch = { id: 'legacy', title: 'Previous prepared draft', repository: 'fixture/atlas', baseSha: 'a'.repeat(40), summary: 'A saved proposal.', status: 'draft', files: [{ path: 'src/app.js', diff: '- one\n+ two' }], testPlan: ['Run focused checks.'] };
  const t = await open({ fixture: { patches: [patch] } }); try {
    await openPanel(t, 'patches'); await t.page.getByRole('button', { name: /Previous prepared draft/ }).click();
    await t.page.locator('#patch-detail .patch-file').waitFor(); assert.match(await t.page.locator('#patch-detail').textContent(), /Validation plan/);
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


test('mobile sheets restore focus and Atlas chrome respects Glass Off', async () => {
  const t = await open({ width: 390, mobile: true, glass: false });
  try {
    await t.page.waitForFunction(() => document.documentElement.dataset.glass === 'off');
    const chrome = await t.page.locator('.atlas-header').evaluate(el => {
      const style = getComputedStyle(el);
      return { blur: style.backdropFilter || style.webkitBackdropFilter, background: style.backgroundColor };
    });
    assert.equal(chrome.blur, 'none');
    assert.equal(chrome.background, 'rgb(27, 27, 27)');
    const toggle = t.page.locator('#navigation-toggle');
    await toggle.click();
    await t.page.locator('#navigation-dialog').waitFor();
    assert.equal(await toggle.getAttribute('aria-expanded'), 'true');
    await t.page.keyboard.press('Escape');
    await t.page.locator('#navigation-dialog').waitFor({ state: 'hidden' });
    assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
    assert.equal(await toggle.evaluate(el => document.activeElement === el), true);
    await openPanel(t, 'usage');
    await t.page.locator('#usage-dialog [data-close]').click();
    assert.equal(await t.page.locator('#open-workspace').evaluate(el => document.activeElement === el), true);
    assert.deepEqual(t.errors, []);
  } finally { await t.close(); }
});

test('a rejected task start keeps the goal and shows the request reference beside it', async () => {
  const t = await open({ fixture: developerFixture() });
  try {
    await openThread(t, 'Repository task');
    t.fixture.overrides.set('POST coding/runs', ({ reply }) => reply({
      code: 'agent_access_unavailable', error: 'Enable Agents access for the saved connection.', requestId: 'fixture-start-error'
    }, 403));
    const goal = 'Rebuild the Atlas composer';
    await t.page.locator('#prompt').fill(goal);
    await t.page.locator('#start-coding').click();
    await t.page.waitForFunction(() => document.getElementById('coding-feedback').textContent.includes('fixture-start-error'));
    assert.match(await t.page.locator('#coding-feedback').textContent(), /Enable Agents access/);
    assert.equal(await t.page.locator('#prompt').inputValue(), goal);
    assert.equal(t.fixture.requests.filter(call => call.path === 'coding/runs' && call.method === 'POST').length, 1);
    assert.deepEqual(t.errors, []);
  } finally { await t.close(); }
});

test('the mobile composer fits the keyboard viewport and recovers a failed send with its sources', async () => {
  const t = await open({ width: 390, mobile: true, fixture: developerFixture() });
  try {
    await openThread(t, 'Repository task');
    await t.page.locator('#intent-ask').click(); await t.page.locator('#composer-options').click(); await t.page.locator('#attach-context').click();
    const file = t.page.locator('#context-list label').filter({ hasText: 'README.md' });
    await file.locator('input').check();
    await t.page.locator('#context-attach').click();
    await t.page.locator('#context-dialog').waitFor({ state: 'hidden' });
    const prompt = t.page.locator('#prompt');
    const goal = 'Explain the README';
    await prompt.fill(goal);
    const keyboardLayout = await t.page.evaluate(() => {
      Object.defineProperty(window.visualViewport, 'height', { configurable: true, value: 450 });
      window.visualViewport.dispatchEvent(new Event('resize'));
      return {
        composerBottom: document.getElementById('composer').getBoundingClientRect().bottom,
        viewportHeight: window.visualViewport.height,
        fitted: document.body.classList.contains('atlas-keyboard')
      };
    });
    assert.ok(keyboardLayout.fitted && keyboardLayout.composerBottom <= keyboardLayout.viewportHeight + 1, JSON.stringify(keyboardLayout));
    await t.page.evaluate(() => {
      delete window.visualViewport.height;
      window.visualViewport.dispatchEvent(new Event('resize'));
    });
    await t.page.locator('#send').click();
    await t.page.waitForFunction(() => !!window.__atlasStream.request);
    await emit(t.page, 'error', { code: 'provider_timeout', error: 'The provider timed out.' });
    await t.page.locator('#stop-response').waitFor({ state: 'hidden' });
    assert.equal(await prompt.inputValue(), goal);
    assert.match(await t.page.locator('#attached-context').textContent(), /README\.md/);
    assert.equal(await t.page.getByRole('button', { name: 'Retry', exact: true }).count(), 1);
    assert.deepEqual(t.errors, []);
  } finally { await t.close(); }
});

test('conversation actions rename, export, archive, restore and confirm deletion', async () => {
  const t = await open();
  try {
    await openThread(t, 'Alpha research');
    const actions = () => t.page.locator('#conversation-menu summary').click();
    await actions();
    t.page.once('dialog', dialog => dialog.accept('Renamed research'));
    await t.page.locator('#rename-conversation').click();
    await t.page.waitForFunction(() => document.getElementById('conversation-title').textContent === 'Renamed research');
    await actions();
    const [download] = await Promise.all([
      t.page.waitForEvent('download'),
      t.page.locator('#export-conversation').click()
    ]);
    assert.equal(download.suggestedFilename(), 'Renamed-research.md');
    await t.page.locator('#archive-conversation').click();
    await t.page.waitForFunction(() => document.getElementById('conversation-title').textContent === 'New conversation');
    await t.page.locator('#show-archived').check();
    await openThread(t, 'Renamed research');
    await actions();
    assert.equal(await t.page.locator('#archive-conversation').textContent(), 'Restore conversation');
    await t.page.locator('#archive-conversation').click();
    await t.page.waitForFunction(() => document.getElementById('conversation-title').textContent === 'New conversation');
    await t.page.locator('#show-archived').uncheck();
    await openThread(t, 'Renamed research');
    await actions();
    t.page.once('dialog', dialog => dialog.dismiss());
    await t.page.locator('#delete-conversation').click();
    assert.equal(t.fixture.requests.filter(call => call.method === 'DELETE').length, 0);
    t.page.once('dialog', dialog => dialog.accept());
    await t.page.locator('#delete-conversation').click();
    await t.page.waitForFunction(() => document.getElementById('conversation-title').textContent === 'New conversation');
    assert.equal(t.fixture.requests.filter(call => call.method === 'DELETE').length, 1);
    assert.deepEqual(t.errors, []);
  } finally { await t.close(); }
});


function cloudEnvironment(extra = {}) {
  return { id: 'environment-atlas', name: 'Atlas development', repository: 'fixture/atlas', branch: 'main', setupCommand: 'npm ci', testCommand: 'npm run test:atlas', machine: 'medium', network: 'dependencies', revision: 1, createdAt: now, updatedAt: now, ...extra };
}
for (const width of [320, 390, 1440]) test('coding workspace keeps a compact composer and actionable stopped task at ' + width + 'px', async () => {
  const run = codingRun({ status: 'cancelled', stage: 'cancelled', canContinue: false, environment: { ...cloudEnvironment(), profileId: 'environment-atlas' }, cloud: { state: 'stopped', label: 'Cloud workspace stopped' }, recovery: { action: 'restart', reason: 'Start again in a new workspace using the original environment settings.' } });
  const t = await open({ width, height: 844, mobile: width < 721, fixture: developerFixture({ codingRuns: [run], environments: [cloudEnvironment()] }) });
  try {
    await openThread(t, 'Repository task');
    assert.equal(await t.page.locator('#start-coding').isVisible(), true);
    assert.equal(await t.page.locator('#send').isVisible(), false);
    assert.equal(await t.page.locator('.coding-run').getByRole('button', { name: 'Start again', exact: true }).isVisible(), true);
    assert.equal(await t.page.locator('#coding-options').isVisible(), false);
    assert.equal(await t.page.getByRole('tab', { name: 'Overview', exact: true }).evaluate(el => getComputedStyle(el).whiteSpace), 'nowrap');
    const geometry = await t.page.evaluate(() => { const rect = selector => document.querySelector(selector).getBoundingClientRect().toJSON(); return { width: innerWidth, height: innerHeight, scrollWidth: document.documentElement.scrollWidth, composer: rect('#composer'), messages: rect('#messages'), toolbar: rect('.conversation-toolbar'), header: rect('.atlas-header') }; });
    assert.ok(geometry.scrollWidth <= width + 1, JSON.stringify(geometry));
    assert.ok(geometry.composer.height <= 190, JSON.stringify(geometry));
    assert.ok(geometry.composer.bottom <= geometry.height + 1 && geometry.messages.bottom <= geometry.composer.top + 1, JSON.stringify(geometry));
    assert.ok(geometry.toolbar.top >= geometry.header.bottom - 1 && geometry.messages.height >= 300, JSON.stringify(geometry));
    await t.screenshot('atlas-cloud-workspace-' + width);
    await t.page.locator('#intent-ask').click();
    assert.equal(await t.page.locator('#send').isVisible(), true);
    assert.equal(await t.page.locator('#start-coding').isVisible(), false);
    assert.equal(await t.page.locator('#coding-environment').isVisible(), false);
    await t.page.locator('#intent-code').click();
    assert.equal(await t.page.locator('#coding-environment').isVisible(), true);
    assert.deepEqual(t.errors, []);
  } finally { await t.close(); }
});

test('cloud profiles create, edit with revision, duplicate, select and archive without starting a task', async () => {
  const t = await open({ width: 390, height: 844, mobile: true, fixture: developerFixture() });
  try {
    await openThread(t, 'Repository task'); await t.page.locator('#manage-environments').click(); await t.page.locator('#create-first-environment').click();
    await t.page.locator('#environment-name').fill('Atlas focused checks');
    await t.page.locator('#environment-repository').selectOption('fixture/atlas');
    await t.page.locator('#environment-branch').fill('feature/atlas');
    await t.page.locator('#environment-setup').fill('npm ci --ignore-scripts');
    await t.page.locator('#environment-test').fill('npm run test:atlas');
    await t.page.locator('.environment-advanced summary').click();
    await t.page.locator('#environment-machine').selectOption('large'); await t.page.locator('#environment-network').selectOption('off');
    await t.page.locator('#save-environment').click();
    await t.page.waitForFunction(() => document.getElementById('environment-feedback').textContent.includes('Environment saved'));
    const created = t.fixture.environments[0];
    assert.deepEqual(t.fixture.requests.find(r => r.path === 'environments' && r.method === 'POST').body, { name: 'Atlas focused checks', repository: 'fixture/atlas', branch: 'feature/atlas', setupCommand: 'npm ci --ignore-scripts', testCommand: 'npm run test:atlas', machine: 'large', network: 'off' });
    assert.equal(t.fixture.requests.filter(r => r.path === 'coding/runs' && r.method === 'POST').length, 0);
    await t.screenshot('atlas-cloud-environment-editor-390');
    await t.page.locator('#environment-name').fill('Atlas verified setup'); await t.page.locator('#save-environment').click();
    await eventually(() => assert.equal(created.revision, 2));
    assert.equal(t.fixture.requests.find(r => r.path === 'environments/' + created.id && r.method === 'PATCH').body.expectedRevision, 1);
    await t.page.getByRole('button', { name: 'Edit Atlas verified setup', exact: true }).waitFor();
    await t.page.locator('#environments-list').getByRole('button', { name: 'Duplicate', exact: true }).click();
    assert.equal(await t.page.locator('#environment-id').inputValue(), '');
    assert.equal(await t.page.locator('#environment-setup').inputValue(), 'npm ci --ignore-scripts');
    await t.page.locator('#save-environment').click(); await eventually(() => assert.equal(t.fixture.environments.length, 2));
    await t.page.waitForFunction(() => document.getElementById('use-environment').hidden === false);
    await t.page.locator('#use-environment').click(); await t.page.locator('#environments-dialog').waitFor({ state: 'hidden' });
    const selected = await t.page.locator('#coding-environment').inputValue(); assert.equal(selected, t.fixture.environments[1].id);
    await t.page.locator('#prompt').fill('Implement a focused improvement'); await t.page.locator('#start-coding').click();
    await eventually(() => assert.equal(t.fixture.requests.filter(r => r.path === 'coding/runs' && r.method === 'POST').length, 1));
    assert.equal(t.fixture.requests.find(r => r.path === 'coding/runs' && r.method === 'POST').body.environmentId, selected);
    await t.page.locator('#header-environments').click();
    await t.page.locator('.environment-card[data-environment-id="' + selected + '"]').getByRole('button', { name: 'Archive', exact: true }).click();
    await eventually(() => assert.equal(t.fixture.environments.length, 1));
    assert.equal(t.fixture.codingRuns[0].environment.name, 'Atlas verified setup copy');
    assert.equal(t.fixture.codingRuns[0].environment.branch, 'feature/atlas');
    assert.equal(t.fixture.requests.filter(r => /\/cancel$/.test(r.path)).length, 0);
    assert.deepEqual(t.errors, []);
  } finally { await t.close(); }
});

test('a stale cloud profile edit preserves the draft and displays the conflict', async () => {
  const environment = cloudEnvironment(), t = await open({ fixture: { environments: [environment] } });
  try {
    await t.page.locator('#header-environments').click(); await t.page.getByRole('button', { name: 'Edit Atlas development', exact: true }).click();
    await t.page.locator('#environment-test').fill('npm run test:atlas:browser'); environment.revision = 2;
    await t.page.locator('#save-environment').click();
    await t.page.waitForFunction(() => document.getElementById('environment-feedback').textContent.includes('changed'));
    assert.equal(await t.page.locator('#environment-test').inputValue(), 'npm run test:atlas:browser');
    assert.equal(environment.testCommand, 'npm run test:atlas'); assert.equal(t.fixture.requests.filter(r => r.path === 'coding/runs' && r.method === 'POST').length, 0);
    assert.deepEqual(t.errors, []);
  } finally { await t.close(); }
});

test('completed expired work restarts only on explicit submit with its frozen environment snapshot', async () => {
  const frozen = { ...cloudEnvironment({ id: 'archived-profile', branch: 'release/atlas', setupCommand: 'npm ci --ignore-scripts' }), profileId: 'archived-profile' };
  const run = codingRun({ id: 'prior-task', status: 'completed', stage: 'completed', canContinue: false, environment: frozen, cloud: { state: 'expired', label: 'Cloud workspace expired' }, recovery: { action: 'restart', reason: 'The original workspace expired. Start again with the same environment settings.' } });
  const t = await open({ fixture: developerFixture({ codingRuns: [run], environments: [cloudEnvironment({ id: 'archived-profile', branch: 'changed-branch', setupCommand: 'changed setup' })] }) });
  try {
    await openThread(t, 'Repository task'); await t.page.locator('.coding-run').getByRole('button', { name: 'Start again', exact: true }).click();
    assert.equal(await t.page.locator('#prompt').inputValue(), run.prompt);
    assert.equal(await t.page.locator('#coding-environment').isDisabled(), true);
    assert.match(await t.page.locator('#coding-environment').textContent(), /release\/atlas/);
    assert.match(await t.page.locator('#coding-continue-label').textContent(), /original environment settings/);
    assert.equal(t.fixture.requests.filter(r => r.path === 'coding/runs' && r.method === 'POST').length, 0);
    await t.page.locator('#intent-ask').click(); await t.page.locator('#intent-code').click();
    assert.equal(await t.page.locator('#start-coding').textContent(), 'Work on task');
    await t.page.locator('.coding-run').getByRole('button', { name: 'Start again', exact: true }).click();
    t.fixture.environments = [];
    await t.page.locator('#prompt').fill('Retry the original task and verify it'); await t.page.locator('#start-coding').click();
    await eventually(() => assert.equal(t.fixture.requests.filter(r => r.path === 'coding/runs' && r.method === 'POST').length, 1));
    const call = t.fixture.requests.find(r => r.path === 'coding/runs' && r.method === 'POST');
    assert.equal(call.body.retryFromRunId, 'prior-task'); assert.equal(Object.hasOwn(call.body, 'environmentId'), false);
    assert.equal(t.fixture.codingRuns[1].environment.branch, 'release/atlas'); assert.equal(t.fixture.codingRuns[1].environment.setupCommand, 'npm ci --ignore-scripts');
    assert.deepEqual(t.errors, []);
  } finally { await t.close(); }
});

test('task tabs preserve keyboard focus during progress and expose real command output and changed files', async () => {
  const run = codingRun(), t = await open({ fixture: developerFixture({ codingRuns: [run], codingFiles: { 'coding-1': [{ path: 'src/app.js', operation: 'modify' }] } }) });
  try {
    await openThread(t, 'Repository task'); await t.page.getByRole('tab', { name: 'Activity', exact: true }).click();
    run.activity.push({ label: 'Running focused checks', detail: 'Executed npm run test:atlas.' }); run.updatedAt += 1;
    await t.page.waitForFunction(() => document.getElementById('task-coding-1-activity')?.textContent.includes('Running focused checks'), undefined, { timeout: 10000 });
    assert.equal(await t.page.getByRole('tab', { name: 'Activity', exact: true }).getAttribute('aria-selected'), 'true');
    assert.equal(await t.page.getByRole('tab', { name: 'Activity', exact: true }).evaluate(el => document.activeElement === el), true);
    Object.assign(run, { status: 'completed', stage: 'completed', summary: 'Ready for review.', reviewReady: true, canContinue: true, revision: 2, checks: [{ command: 'npm run test:atlas', exitCode: 1, status: 'completed', outcome: 'failed', output: 'A meaningful check failed.' }], changes: { added: 0, modified: 1, deleted: 0 } });
    await t.page.waitForFunction(() => document.querySelector('.coding-run .message-status')?.textContent === 'Ready to review', undefined, { timeout: 10000 });
    await t.page.getByRole('tab', { name: 'Checks', exact: true }).click();
    await t.page.locator('#task-coding-1-checks .coding-check summary').click();
    assert.match(await t.page.locator('#task-coding-1-checks .coding-check pre').textContent(), /meaningful check failed/);
    await t.page.getByRole('tab', { name: 'Changes', exact: true }).click(); await t.page.locator('#task-coding-1-changes .task-file').waitFor();
    await t.page.locator('#task-coding-1-changes .task-file summary').click();
    await t.page.waitForFunction(() => document.querySelector('#task-coding-1-changes .task-file pre').textContent.includes('+ after'));
    assert.equal(t.fixture.requests.filter(r => /\/publish$/.test(r.path)).length, 0);
    assert.deepEqual(t.errors, []);
  } finally { await t.close(); }
});

test('refreshing one task keeps a different task’s open diff and avoids fetching it again', async () => {
  const saved = codingRun({ id: 'coding-saved', createdAt: now - 60000, status: 'completed', stage: 'completed',
    reviewReady: true, summary: 'Earlier result.' });
  const active = codingRun();
  const t = await open({ fixture: developerFixture({ codingRuns: [saved, active],
    codingFiles: { 'coding-saved': [{ path: 'src/app.js', operation: 'modify' }] } }) });
  try {
    await openThread(t, 'Repository task');
    const card = t.page.locator('[data-run-id="coding-saved"]');
    await card.locator('.task-switch').click();
    await card.getByRole('tab', { name: 'Changes' }).click();
    await card.locator('.task-file summary').click();
    await t.page.waitForFunction(() => document.querySelector('[data-run-id="coding-saved"] .task-file pre')?.textContent.includes('+ after'));
    await card.locator('.task-file').evaluate(el => { window.__atlasSavedDiff = el; });
    active.summary = 'The active task progressed.'; active.updatedAt++;
    await t.page.getByText(active.summary, { exact: true }).waitFor({ timeout: 10000 });
    assert.equal(await card.locator('.task-file').evaluate(el => el.open && el === window.__atlasSavedDiff), true);
    assert.equal(t.fixture.requests.filter(call => call.path === 'coding/runs/coding-saved/diff').length, 1);
  } finally { await t.close(); }
});

test('cloud storage upgrade keeps default coding available and gives an identity confirmation action', async () => {
  const t = await open({ fixture: developerFixture({ environmentsReady: false }) });
  try {
    await openThread(t, 'Repository task'); await t.page.locator('#prompt').fill('Use the default workspace');
    assert.equal(await t.page.locator('#start-coding').isEnabled(), true);
    t.fixture.overrides.set('POST setup', ({ reply }) => reply({ code: 'identity_confirmation_required', error: 'Confirm your identity to prepare cloud environment settings.' }, 403));
    await t.page.locator('#manage-environments').click(); await t.page.locator('#upgrade-environments').click();
    const link = t.page.locator('#environments-feedback').getByRole('link', { name: 'Confirm identity in InFlite' }); await link.waitFor();
    assert.equal(await link.getAttribute('href'), '/#settings=account-confirm');
    assert.equal(await t.page.locator('#new-environment').isDisabled(), true);
    t.fixture.overrides.delete('POST setup'); await t.page.locator('#upgrade-environments').click();
    await t.page.locator('#environments-upgrade').waitFor({ state: 'hidden' }); assert.equal(await t.page.locator('#new-environment').isEnabled(), true);
    assert.deepEqual(t.errors, []);
  } finally { await t.close(); }
});

test('owner changes clear environment scripts, selected profiles and late environment responses', async () => {
  const environment = cloudEnvironment({ name: 'OWNER A PRIVATE PROFILE', setupCommand: 'echo OWNER_A_PRIVATE_SETUP' });
  const t = await open({ fixture: developerFixture({ environments: [environment] }) }); let release;
  try {
    await openThread(t, 'Repository task'); await t.page.locator('#coding-environment').selectOption(environment.id);
    await t.page.locator('#manage-environments').click(); await t.page.getByRole('button', { name: 'Edit OWNER A PRIVATE PROFILE', exact: true }).click();
    const delayed = new Promise(resolve => { release = resolve; }); let held = false;
    t.fixture.overrides.set('GET environments', async ({ reply, owner }) => { held = true; t.fixture.overrides.delete('GET environments'); await delayed; try { return await reply({ environments: [environment], ready: true }, 200, owner); } catch {} });
    await t.page.locator('#environments-dialog [data-close]').click(); await t.page.locator('#header-environments').click(); await eventually(() => assert.equal(held, true));
    t.fixture.owner = 'owner-b'; t.fixture.environments = []; t.fixture.conversations = []; t.fixture.messages = {}; t.fixture.codingRuns = [];
    await t.page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await t.page.waitForFunction(() => !document.body.classList.contains('session-check') && document.getElementById('conversation-title').textContent === 'New conversation'); release();
    await t.page.waitForTimeout(40);
    assert.equal(await t.page.locator('#environment-setup').inputValue(), ''); assert.equal(await t.page.locator('#environment-name').inputValue(), '');
    assert.doesNotMatch(await t.page.locator('body').textContent(), /OWNER A PRIVATE PROFILE|OWNER_A_PRIVATE_SETUP/);
    assert.equal(await t.page.locator('#coding-environment').inputValue(), ''); assert.deepEqual(t.errors, []);
  } finally { release?.(); await t.close(); }
});

test('an unavailable conversation has a working new-conversation recovery action', async () => {
  const t = await open({ conversation: 'no-longer-exists' });
  try {
    await t.page.getByRole('button', { name: 'Start a new conversation', exact: true }).waitFor();
    await t.page.getByRole('button', { name: 'Start a new conversation', exact: true }).click();
    assert.equal(await t.page.locator('#conversation-title').textContent(), 'New conversation'); assert.equal(new URL(t.page.url()).searchParams.has('conversation'), false);
    await t.page.locator('#prompt').fill('A fresh conversation'); assert.equal(await t.page.locator('#send').isEnabled(), true); assert.deepEqual(t.errors, []);
  } finally { await t.close(); }
});


for (const switchEditor of [false, true]) test('a delayed cloud profile save preserves ' + (switchEditor ? 'a different editor draft' : 'newer input in the same editor'), async () => {
  const environment = cloudEnvironment(), t = await open({ fixture: { environments: [environment] } }); let release;
  try {
    await t.page.locator('#header-environments').click(); await t.page.getByRole('button', { name: 'Edit Atlas development', exact: true }).click();
    const delayed = new Promise(resolve => { release = resolve; }); let held = false;
    t.fixture.overrides.set('PATCH environments/environment-atlas', async ({ reply, body }) => { held = true; t.fixture.overrides.delete('PATCH environments/environment-atlas'); await delayed; Object.assign(environment, body, { revision: 2 }); return reply({ environment }); });
    await t.page.locator('#environment-setup').fill('npm ci --ignore-scripts'); await t.page.locator('#save-environment').click(); await eventually(() => assert.equal(held, true));
    if (switchEditor) { await t.page.locator('#new-environment').click(); await t.page.locator('#environment-name').fill('A separate unsaved environment'); }
    await t.page.locator('#environment-setup').fill('npm ci --ignore-scripts && npm run build');
    release(); await t.page.waitForFunction(() => !document.getElementById('save-environment').disabled);
    assert.equal(await t.page.locator('#environment-setup').inputValue(), 'npm ci --ignore-scripts && npm run build');
    assert.equal(environment.setupCommand, 'npm ci --ignore-scripts');
    if (switchEditor) { assert.equal(await t.page.locator('#environment-name').inputValue(), 'A separate unsaved environment'); assert.equal(await t.page.locator('#environment-id').inputValue(), ''); }
    else {
      assert.match(await t.page.locator('#environment-feedback').textContent(), /newer edits have not been saved/);
      await t.page.locator('#save-environment').click(); await eventually(() => assert.equal(environment.revision, 3));
      assert.equal(t.fixture.requests.filter(r => r.path === 'environments/environment-atlas' && r.method === 'PATCH')[1].body.expectedRevision, 2);
    }
    assert.deepEqual(t.errors, []);
  } finally { release?.(); await t.close(); }
});

test('an older environment list cannot resurrect an archived profile after a newer refresh', async () => {
  const environment = cloudEnvironment(), t = await open({ fixture: { environments: [environment] } }); let release;
  try {
    await t.page.locator('#header-environments').click(); await t.page.getByRole('button', { name: 'Edit Atlas development', exact: true }).waitFor();
    await t.page.locator('#environments-dialog [data-close]').click(); await t.page.locator('#environments-dialog').waitFor({ state: 'hidden' });
    const delayed = new Promise(resolve => { release = resolve; }); let held = false;
    t.fixture.overrides.set('GET environments', async ({ reply }) => { held = true; t.fixture.overrides.delete('GET environments'); await delayed; return reply({ environments: [environment], ready: true }); });
    await t.page.locator('#header-environments').click(); await eventually(() => assert.equal(held, true));
    await t.page.locator('#environments-list').getByRole('button', { name: 'Archive', exact: true }).click();
    await t.page.waitForFunction(() => document.querySelectorAll('#environments-list .environment-card').length === 0);
    release(); await t.page.waitForTimeout(60);
    assert.equal(await t.page.locator('#environments-list .environment-card').count(), 0); assert.equal(t.fixture.environments.length, 0);
    assert.doesNotMatch(await t.page.locator('#coding-environment').textContent(), /Atlas development/); assert.deepEqual(t.errors, []);
  } finally { release?.(); await t.close(); }
});

test('new task dispatch locks repository and environment selection while its conversation is being created', async () => {
  const t = await open({ fixture: { environments: [cloudEnvironment({ repository: 'fixture/other' })] } }); let release;
  try {
    await chooseMode(t, 'developer'); await t.page.locator('#repository').selectOption('fixture/atlas');
    const delayed = new Promise(resolve => { release = resolve; }); let held = false;
    t.fixture.overrides.set('POST conversations', async ({ reply, body }) => { held = true; await delayed; const conversation = { ...body, id: 'pending-conversation', created_at: now }; t.fixture.conversations.push(conversation); t.fixture.messages[conversation.id] = []; return reply({ conversation }, 201); });
    await t.page.locator('#prompt').fill('Start in fixture atlas'); await t.page.locator('#start-coding').click(); await eventually(() => assert.equal(held, true));
    assert.equal(await t.page.locator('#repository').isDisabled(), true); assert.equal(await t.page.locator('#mode').isDisabled(), true); assert.equal(await t.page.locator('#coding-environment').isDisabled(), true);
    await t.page.locator('#header-environments').click(); await t.page.locator('#environments-list .environment-use').waitFor();
    assert.equal(await t.page.locator('#environments-list .environment-use').isEnabled(), false);
    release(); await eventually(() => assert.equal(t.fixture.requests.filter(r => r.path === 'coding/runs' && r.method === 'POST').length, 1));
    assert.equal(await t.page.locator('#repository').inputValue(), 'fixture/atlas');
    assert.equal(t.fixture.requests.find(r => r.path === 'coding/runs' && r.method === 'POST').body.conversationId, 'pending-conversation');
    assert.deepEqual(t.errors, []);
  } finally { release?.(); await t.close(); }
});
