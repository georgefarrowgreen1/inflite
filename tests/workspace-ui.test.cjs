// Independent browser checks of the real frame's controlled app views. Modules
// and account responses are fixtures; nothing can leave this local origin.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync, existsSync } = require('node:fs');
const { resolve, extname } = require('node:path');
const { chromium, webkit } = require('playwright');
const PUBLIC = resolve(__dirname, '../today/public'), ORIGIN = 'http://workspace.test';
let browser;
before(async () => { browser = process.env.WEB_UI_BROWSER === 'webkit' ? await webkit.launch() : await chromium.launch({ executablePath: process.env.CHROMIUM || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined), args: ['--no-sandbox'] }); });
after(async () => browser?.close());

function moduleSource(app) {
  return `const app=${JSON.stringify(app)}, t=window.work, s=t.stats[app];s.imports++;s.importStarted=true;
    if(t.mode.import===app)await t.gates.import.promise;
    export const CONTRACT=1,BUILD='workspace-fixture',NEWS='Workspace fixture';
    export async function mount(root,fw){
      s.mounts++;s.fw=fw;s.root=root;
      if(t.mode.mount===app)await t.gates.mount.promise;
      const input=fw.ui.el('input',{placeholder:app+' draft','aria-label':app+' draft'}),label=fw.ui.el('output',{class:'fixture-route'});
      const destination=app==='weather'?'/weather/#days':'/fitness/#activities';
      const link=fw.ui.el('a',{href:destination,text:app+' link'});
      const nav=fw.ui.el('button',{type:'button',text:app+' navigate',on:{click:()=>fw.nav.go(destination)}});
      const section=fw.ui.el('button',{type:'button',text:app+' section',on:{click:()=>fw.nav.section(app==='weather'?'radar':'progress')}});
      const sheet=fw.ui.el('button',{type:'button',text:app+' settings',on:{click:()=>fw.sheet.open({sheet:'workspace-fixture',title:app+' settings',body:fw.ui.el('input',{'aria-label':app+' setting'})})}});
      const back=fw.ui.el('button',{type:'button',text:app+' back',on:{click:()=>fw.nav.back()}});
      root.replaceChildren(fw.ui.el('section',{class:'fixture-module'},fw.ui.el('h2',{text:app}),label,input,link,nav,section,sheet,back));
      let timer=0;
      const stop=()=>{clearInterval(timer);timer=0;},start=()=>{stop();if(fw.visible())timer=setInterval(()=>{if(fw.visible())s.ticks++;},25);};
      const offs=[fw.on('visible',()=>{s.visibleEvents++;start();}),fw.on('hidden',()=>{s.hiddenEvents++;stop();}),fw.search.provide({id:'workspace-'+app,group:app,search:q=>q?[{title:app+' workspace entry',href:destination}]:[]})];
      fw.header.set({title:app+' initial'});
      return {show(route){s.shows.push(route.key);s.routes.push(route);label.textContent=route.key;fw.header.set({title:app+' '+route.key});start();},hide(){s.hides++;stop();},busy(){return!!input.value;},async flush(){s.flushes++;if(t.mode.flush===app)await t.gates.flush.promise;return{lost:0};},unmount(){s.unmounts++;s.abortedAtUnmount=fw.signal.aborted;stop();for(const off of offs)off?.();root.replaceChildren();}};
    }`;
}

async function open(mode = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 940 }, reducedMotion: 'reduce', serviceWorkers: 'block' });
  const shared = readFileSync(resolve(PUBLIC, 'app.js'), 'utf8');
  const start = shared.indexOf('// ==== InFlite\'s menu, shared:'), endMark = '// ==== end of InFlite\'s menu ====';
  const block = shared.slice(start, shared.indexOf(endMark, start) + endMark.length);
  const csp = /Content-Security-Policy: (.*)/.exec(readFileSync(resolve(PUBLIC, '_headers'), 'utf8'))[1];
  const unknown = [];
  await ctx.route('**/*', route => {
    const url = new URL(route.request().url()), p = url.pathname;
    if (url.origin !== ORIGIN) { unknown.push(url.href); return route.abort(); }
    const send = (body, type = 'text/javascript') => route.fulfill({ contentType: type, body });
    if (p === '/') return route.fulfill({ contentType: 'text/html', headers: { 'Content-Security-Policy': csp }, body: '<!doctype html><html data-theme="light"><head><meta charset="utf-8"><link rel="stylesheet" href="/app.css"><link rel="stylesheet" href="/roof/roof.css"><link rel="stylesheet" href="/fixture.css"><script src="/fixture-shared.js" defer></script></head><body><div id="in"><header id="hd"></header><div id="views"><main id="today">Today</main><main id="apps" hidden>Apps</main><main id="you" hidden>You</main></div><nav id="tabs"></nav><div class="fixture-panes"><section id="slot-weather" aria-label="Weather pane"></section><section id="slot-fitness" aria-label="Fitness pane"></section></div></div></body></html>' });
    if (p === '/fixture.css') return send('.fixture-panes{display:grid;grid-template-columns:1fr 1fr;gap:20px;padding:20px}.fixture-panes>section{position:relative;min-height:400px;overflow:auto;border:1px solid #ddd;border-radius:26px}.fixture-module{display:flex;flex-direction:column;gap:12px;padding:20px}.fixture-module input,.fixture-module button,.fixture-module a{min-height:44px}.fixture-module input{border:1px solid #bbb;border-radius:16px;padding:10px}', 'text/css');
    if (p === '/fixture-shared.js') return send(block);
    if (p === '/api/vitals') return route.fulfill({ status: 204, body: '' });
    if (p === '/api/status-banner') return route.fulfill({ json: { banner: null } });
    const app = /^\/(weather|fitness)\/roof\/\1\.js$/.exec(p)?.[1];
    if (app) return send(moduleSource(app));
    if (/^\/(weather|fitness)\/roof\/connector\.js$/.test(p)) return send('export const connector={files:[],lazy:[],name:"Fixture"};');
    if (/^\/(weather|fitness)\/.+\.css$/.test(p)) return send('/* fixture module CSS */', 'text/css');
    if (/^\/(weather|fitness)\/version$/.test(p)) return route.fulfill({ json: { build: 'workspace-fixture' } });
    const file = resolve(PUBLIC, '.' + decodeURIComponent(p));
    if (file.startsWith(PUBLIC + '/') && existsSync(file)) return send(readFileSync(file), ({ '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png' })[extname(file)] || 'application/octet-stream');
    unknown.push(p); return route.fulfill({ status: 404, body: 'Fixture did not expect this resource' });
  });
  const page = await ctx.newPage(), errors = [];
  page.setDefaultTimeout(10000); page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => { window.__workspaceCsp = []; window.__workspaceRejected = []; document.addEventListener('securitypolicyviolation', e => __workspaceCsp.push(e.violatedDirective + ' ' + e.blockedURI)); addEventListener('unhandledrejection', e => __workspaceRejected.push(String(e.reason?.message || e.reason))); });
  await page.goto(ORIGIN); await page.bringToFront();
  await page.evaluate(async mode => {
    const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
    const stats = () => ({ imports: 0, importStarted: false, mounts: 0, hides: 0, shows: [], routes: [], unmounts: 0, flushes: 0, ticks: 0, visibleEvents: 0, hiddenEvents: 0 });
    const t = window.work = { mode, gates: { import: deferred(), mount: deferred(), flush: deferred() }, stats: { weather: stats(), fitness: stats() }, enabled: { weather: true, fitness: true }, user: { id: 'account-a', name: 'Account A' }, views: {}, attachments: {}, hooks: { weather: [], fitness: [] }, headers: {}, focus: 'weather' };
    const { createFrame } = await import('/roof/frame.js'), { parse, format } = await import('/roof/router.js');
    const byId = id => document.getElementById(id);
    t.parse = p => parse(p, { roof: true });
    t.F = createFrame({ root: byId('in'), header: byId('hd'), views: byId('views'), tabs: byId('tabs'), retired: Promise.resolve(), session: () => ({ view: { user: t.user }, hub: true, roof: true, apps: t.enabled }), hubAgain: async () => {}, today: { el: byId('today'), title: 'Today' }, apps: { el: byId('apps'), title: 'Apps' }, you: { el: byId('you'), title: 'You' } });
    t.attach = (app, container = byId('slot-' + app)) => {
      const v = t.views[app] ||= t.F.view(app), hooks = t.hooks[app];
      const workspace = t.capabilities?.[app] || { enabled: true, active: () => t.focus === app && v.el.isConnected && !v.el.hidden && v.fw.visible(), provide: () => () => {}, changed() {}, context: { get: () => null, subscribe: () => () => {}, update() {} } };
      (t.capabilities ||= {})[app] = workspace;
      t.attachments[app] = v.attach({ container, workspace,
        navigate: (path) => { hooks.push(['navigate', path]); const r = t.parse(path); if (r?.app === app) return v.show(r, { visible: true }); },
        section: (section, opts) => { hooks.push(['section', section]); return v.show(t.parse(format({ app, section, arg: opts?.arg || null })), { visible: true }); },
        back: () => hooks.push(['back']), header: spec => { t.headers[app] = spec; }, fill: value => hooks.push(['fill', value]),
      });
      return v;
    };
    t.show = async (app, path = '/' + app + '/') => { const v = t.views[app] || t.attach(app); return v.show(t.parse(path), { visible: true }); };
    t.counts = () => Object.fromEntries(Object.entries(t.stats).map(([app, s]) => [app, { imports: s.imports, mounts: s.mounts, hides: s.hides, shows: s.shows, unmounts: s.unmounts, flushes: s.flushes, ticks: s.ticks }]));
  }, mode);
  const clean = async () => { assert.deepEqual(errors, []); assert.deepEqual(await page.evaluate(() => [__workspaceCsp, __workspaceRejected]), [[], []]); assert.deepEqual(unknown, []); };
  return { ctx, page, errors, clean };
}

test('a pending native exit cannot hide the same app after it is already presented in the destination pane', async () => {
  const { ctx, page, clean } = await open();
  try {
    await page.evaluate(() => work.F.nav.go('/weather/#days'));
    await page.locator('#views #m-weather:not([hidden]) input').waitFor();
    await page.getByRole('textbox', { name: 'weather draft' }).fill('A native draft before the immediate move');
    const hides = await page.evaluate(async () => {
      work.F.nav.go('/#apps');
      work.attach('weather');
      await work.show('weather', '/weather/#days');
      return work.stats.weather.hides;
    });
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const after = await page.evaluate(() => ({ hides: work.stats.weather.hides, same: work.F.view('weather') === work.views.weather,
      route: work.F.route.tab, visible: work.views.weather.fw.visible(), parent: work.views.weather.el.parentNode.id,
      draft: work.views.weather.root.querySelector('input').value }));
    assert.deepEqual(after, { hides, same: true, route: 'apps', visible: true, parent: 'slot-weather', draft: 'A native draft before the immediate move' });
    await clean();
  } finally { await ctx.close(); }
});

test('controlled app views reuse one instance and draft through split, reparent, hide and return to Today navigation', async () => {
  const { ctx, page, clean } = await open();
  try {
    await page.evaluate(async () => { await work.show('weather'); await work.show('fitness'); });
    assert.equal(await page.locator('#m-weather').getAttribute('role'), null, 'the named pane supplies its landmark without nesting a main');
    await page.getByRole('textbox', { name: 'weather draft' }).fill('An unsaved weather note');
    const reuse = await page.evaluate(async () => {
      const v = work.views.weather, root = v.root, fw = v.fw, signal = v.signal;
      v.hide({ detach: true }); const detached = !v.el.isConnected;
      work.attachments.weather(); work.attach('weather', document.getElementById('slot-fitness'));
      await work.show('weather', '/weather/#days');
      return { same: v === work.F.view('weather') && v.root === root && v.fw === fw && v.signal === signal, detached, connected: v.el.isConnected, parent: v.el.parentElement.id, mounted: work.stats.weather.mounts, draft: root.querySelector('input').value };
    });
    assert.deepEqual(reuse, { same: true, detached: true, connected: true, parent: 'slot-fitness', mounted: 1, draft: 'An unsaved weather note' });
    await page.evaluate(() => { work.views.weather.hide({ detach: true }); work.attachments.weather(); work.F.nav.go('/weather/#days'); });
    await page.locator('#views #m-weather:not([hidden])').waitFor();
    assert.equal(await page.locator('#m-weather').count(), 1);
    assert.equal(await page.locator('#m-weather').getAttribute('role'), 'main', 'the same full-screen host restores the app main landmark');
    assert.deepEqual(await page.evaluate(() => [work.stats.weather.imports, work.stats.weather.mounts]), [1, 1]);
    await clean();
  } finally { await ctx.close(); }
});

test('buttons, links, Back, sections and header updates remain owned by their attached pane', async () => {
  const { ctx, page, clean } = await open();
  try {
    await page.evaluate(async () => { await work.show('weather'); await work.show('fitness'); });
    await page.getByRole('button', { name: 'weather navigate' }).click();
    await page.waitForFunction(() => work.views.weather.route?.section === 'days');
    await page.getByRole('link', { name: 'fitness link' }).click();
    await page.waitForFunction(() => work.views.fitness.route?.section === 'activities');
    await page.getByRole('button', { name: 'weather section' }).click();
    await page.waitForFunction(() => work.views.weather.route?.section === 'radar');
    await page.getByRole('button', { name: 'fitness back' }).click();
    const state = await page.evaluate(() => ({ global: work.F.route.kind, globalTab: work.F.route.tab, url: location.pathname + location.hash, weather: work.views.weather.route.section, fitness: work.views.fitness.route.section, hooks: work.hooks, headers: [work.views.weather.header.title, work.views.fitness.header.title] }));
    assert.equal(state.global, 'tab'); assert.equal(state.globalTab, 'today'); assert.equal(state.url, '/');
    assert.equal(state.weather, 'radar'); assert.equal(state.fitness, 'activities');
    assert.ok(state.hooks.fitness.some(([kind]) => kind === 'navigate')); assert.ok(state.hooks.fitness.some(([kind]) => kind === 'back'));
    assert.deepEqual(state.headers, ['weather radar', 'fitness activities']);
    await clean();
  } finally { await ctx.close(); }
});

test('the newest pane route owns a delayed import without affecting another visible app', async () => {
  const { ctx, page, clean } = await open({ import: 'weather' });
  try {
    await page.evaluate(() => { work.attach('weather'); work.first = work.show('weather').catch(() => false); });
    await page.waitForFunction(() => work.stats.weather.importStarted);
    await page.evaluate(async () => { await work.show('fitness'); work.latest = work.show('weather', '/weather/#days').catch(() => false); work.gates.import.resolve(); await Promise.all([work.first, work.latest]); });
    assert.deepEqual(await page.evaluate(() => ({ weather: work.stats.weather.shows, fitness: work.stats.fitness.shows, mounts: work.stats.weather.mounts, route: work.views.weather.route.section, global: work.F.route.tab })), { weather: ['days'], fitness: ['today'], mounts: 1, route: 'days', global: 'today' });
    await clean();
  } finally { await ctx.close(); }
});

test('hiding one pane stops its work while document visibility pauses and resumes only the visible panes', async () => {
  const { ctx, page, clean } = await open();
  try {
    await page.evaluate(async () => { await work.show('weather'); await work.show('fitness'); });
    await page.waitForFunction(() => work.stats.weather.ticks >= 2 && work.stats.fitness.ticks >= 2);
    await page.evaluate(() => { work.views.weather.hide(); work.hiddenTicks = work.stats.weather.ticks; work.otherTicks = work.stats.fitness.ticks; });
    await page.waitForFunction(() => work.stats.fitness.ticks > work.otherTicks + 2);
    assert.equal(await page.evaluate(() => work.views.weather.fw.visible()), false);
    assert.equal(await page.evaluate(() => work.stats.weather.ticks === work.hiddenTicks), true);
    await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' }); Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')); work.sleep = [work.stats.weather.ticks, work.stats.fitness.ticks]; });
    await page.waitForTimeout(100);
    assert.deepEqual(await page.evaluate(() => [work.stats.weather.ticks, work.stats.fitness.ticks]), await page.evaluate(() => work.sleep));
    await page.evaluate(() => { delete document.visibilityState; delete document.hidden; document.dispatchEvent(new Event('visibilitychange')); });
    await page.waitForFunction(() => work.stats.fitness.ticks > work.sleep[1] + 2);
    assert.equal(await page.evaluate(() => work.stats.weather.ticks === work.hiddenTicks), true, 'document resume cannot restart a hidden pane');
    await clean();
  } finally { await ctx.close(); }
});

test('background and detached drafts stay busy and all mounted views participate in flush', async () => {
  const { ctx, page, clean } = await open({ flush: 'weather' });
  try {
    await page.evaluate(async () => { await work.show('weather'); await work.show('fitness'); });
    await page.getByRole('textbox', { name: 'weather draft' }).fill('Keep this background draft');
    await page.evaluate(() => { work.focus = 'fitness'; work.views.weather.hide({ detach: true }); });
    assert.equal(await page.evaluate(() => work.F.busy()), true);
    await page.evaluate(() => { work.flushing = work.F.flush(); });
    await page.waitForFunction(() => work.stats.weather.flushes === 1 && work.stats.fitness.flushes === 1);
    await page.evaluate(async () => { work.gates.flush.resolve(); await work.flushing; });
    assert.equal(await page.evaluate(() => work.views.weather.root.querySelector('input').value), 'Keep this background draft');
    await clean();
  } finally { await ctx.close(); }
});

test('destroying an account owns pending imports and every old view capability', async () => {
  const { ctx, page, clean } = await open({ import: 'weather' });
  try {
    await page.evaluate(() => { work.attach('weather'); work.pending = work.show('weather').catch(() => false); });
    await page.waitForFunction(() => work.stats.weather.importStarted);
    const result = await page.evaluate(async () => {
      const v = work.views.weather, fw = v.fw; work.F.destroy(); work.user = { id: 'account-b', name: 'Account B' };
      work.gates.import.resolve(); await work.pending;
      const shown = await v.show(work.parse('/weather/#days'), { visible: true }).catch(() => false);
      await Promise.resolve(v.load()).catch(() => false);
      fw.header.set({ title: 'Obsolete account' }); fw.nav.go('/fitness/');
      const sheet = fw.sheet.open({ title: 'Obsolete account', body: 'Never shown' });
      return { shown, mounts: work.stats.weather.mounts, signal: v.signal.aborted, frameSignal: work.F.signal.aborted, connected: v.el.isConnected, sheetClosed: sheet.closed, dialogs: document.querySelectorAll('dialog[open]').length };
    });
    assert.deepEqual(result, { shown: false, mounts: 0, signal: true, frameSignal: true, connected: false, sheetClosed: true, dialogs: 0 });
    await clean();
  } finally { await ctx.close(); }
});

test('hidden hosts cannot open a modal and detaching retains the same workspace adapter for a later show', async () => {
  const { ctx, page, clean } = await open();
  try {
    const state = await page.evaluate(async () => {
      await work.show('weather'); const v = work.views.weather, capability = v.fw.workspace;
      v.hide({ detach: true }); work.attachments.weather();
      const blocked = v.fw.sheet.open({ title: 'Hidden pane', body: 'Never shown' });
      const retained = v.fw.workspace === capability;
      work.attach('weather'); await work.show('weather');
      return { blocked: blocked.closed, dialogs: document.querySelectorAll('dialog[open]').length, retained, same: v.fw.workspace === capability, mounts: work.stats.weather.mounts };
    });
    assert.deepEqual(state, { blocked: true, dialogs: 0, retained: true, same: true, mounts: 1 });
    await clean();
  } finally { await ctx.close(); }
});

test('a retired attachment disposer cannot detach or reroute the newer host of the same view', async () => {
  const { ctx, page, clean } = await open();
  try {
    const result = await page.evaluate(async () => {
      await work.show('weather'); const v = work.views.weather, retire = work.attachments.weather;
      work.attach('weather', document.getElementById('slot-fitness')); await work.show('weather', '/weather/#days');
      retire(); v.fw.nav.section('radar');
      await new Promise(r => requestAnimationFrame(r));
      return { parent: v.el.parentElement?.id, connected: v.el.isConnected, visible: v.fw.visible(), route: v.route.section, calls: work.hooks.weather.filter(([kind, value]) => kind === 'section' && value === 'radar').length, mounts: work.stats.weather.mounts };
    });
    assert.deepEqual(result, { parent: 'slot-fitness', connected: true, visible: true, route: 'radar', calls: 1, mounts: 1 });
    await clean();
  } finally { await ctx.close(); }
});
