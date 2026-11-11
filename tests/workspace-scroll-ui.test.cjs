// Real frame, workspace controller, slots and routing. Tall cooperative modules
// keep their DOM so the host must own scroll through reparenting and hiding.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync, existsSync } = require('node:fs');
const { resolve, extname } = require('node:path');
const { chromium, webkit } = require('playwright');
const PUBLIC = resolve(__dirname, '../today/public'), ORIGIN = 'http://scroll.test';
let browser;
before(async () => { browser = process.env.WEB_UI_BROWSER === 'webkit' ? await webkit.launch() : await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox'] }); });
after(async () => browser?.close());

function moduleSource(app) {
  return `export const CONTRACT=1,BUILD='scroll-fixture';export async function mount(root,fw){
    const T=window.T,s=T.stats.${app};s.mounts++;s.root=root;s.fw=fw;
    const heading=fw.ui.el('h2',{text:'${app} content'}),routeLabel=fw.ui.el('output',{class:'fixture-route'}),content=fw.ui.el('div',{class:'fixture-long',text:'Long ${app} content'});
    root.replaceChildren(heading,routeLabel,content);s.content=content;let off=()=>{},provided=false;
    return{workspace(){if(provided||!fw.workspace)return;provided=true;off=fw.workspace.provide({snapshot:()=>{s.snapshots=(s.snapshots||0)+1;return{status:'ready',files:[],actions:[]}},run:()=>({ok:true})});},
    async show(route){this.workspace();s.shows++;s.route=route;routeLabel.textContent=route.key;content.classList.toggle('fixture-short',T.short==='${app}'&&root.classList.contains('ifl-in-pane'));fw.header.set({title:'${app} '+route.key});
      if(T.delay==='${app}'&&root.classList.contains('ifl-in-pane')){T.waiting++;await T.wait;}},
    hide(){s.hides++;},flush:async()=>({lost:0}),unmount(){off();s.unmounts++;root.replaceChildren();}};
  }`;
}
async function open({ width = 1440 } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height: 1000 }, reducedMotion: 'reduce', serviceWorkers: 'block' }), unknown = [];
  await ctx.route('**/*', r => {
    const u = new URL(r.request().url()), p = u.pathname;
    if (u.origin !== ORIGIN) { unknown.push(u.href); return r.abort(); }
    if (p === '/') return r.fulfill({ contentType: 'text/html', body: '<!doctype html><html data-theme="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app.css"><link rel="stylesheet" href="/roof/roof.css"><link rel="stylesheet" href="/fixture.css"></head><body><div id="in"><header id="hd"></header><div id="views"><main id="today">Today</main><main id="workspace" hidden></main></div><nav id="tabs"></nav></div></body></html>' });
    if (p === '/fixture.css') return r.fulfill({ contentType: 'text/css', body: '.fixture-long{height:4000px;padding:20px}.fixture-long.fixture-short{height:20px}.fixture-route{display:block;padding:16px}.m-fitness h2,.m-weather h2{padding:16px}' });
    const app = /^\/(fitness|weather)\/roof\/\1\.js$/.exec(p)?.[1];
    if (app) return r.fulfill({ contentType: 'text/javascript', body: moduleSource(app) });
    if (/^\/(fitness|weather)\/roof\/connector\.js$/.test(p)) return r.fulfill({ contentType: 'text/javascript', body: 'export const connector={files:[],lazy:[]};' });
    if (/^\/(fitness|weather)\/version$/.test(p)) return r.fulfill({ json: { build: 'scroll-fixture' } });
    if (/^\/(fitness|weather)\/.+\.css$/.test(p)) return r.fulfill({ contentType: 'text/css', body: '/* fixture module CSS */' });
    const f = resolve(PUBLIC, '.' + decodeURIComponent(p));
    if (!f.startsWith(PUBLIC + '/') || !existsSync(f)) { unknown.push(p); return r.fulfill({ status: 404, body: 'Unexpected fixture resource' }); }
    return r.fulfill({ contentType: ({ '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' })[extname(f)] || 'application/octet-stream', body: readFileSync(f) });
  });
  const page = await ctx.newPage(), errors = []; page.setDefaultTimeout(8000); page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => { window.rejections = []; addEventListener('unhandledrejection', e => rejections.push(String(e.reason?.message || e.reason))); });
  await page.goto(ORIGIN);
  await page.evaluate(async () => {
    const { createFrame } = await import('/roof/frame.js'), { createWorkspace } = await import('/roof/workspace.js'), byId = id => document.getElementById(id);
    const stat = () => ({ mounts: 0, shows: 0, hides: 0, unmounts: 0 });
    const T = window.T = { stats: { fitness: stat(), weather: stat() }, user: { id: 'owner-a', name: 'Owner A' }, enabled: { fitness: true, weather: true }, delay: null, waiting: 0 };
    let ws;
    const F = T.F = createFrame({ root: byId('in'), header: byId('hd'), views: byId('views'), tabs: byId('tabs'),
      session: () => ({ view: { user: T.user }, hub: true, roof: true, apps: T.enabled }), hubAgain: async () => {},
      today: { el: byId('today'), title: 'Today' }, workspace: { el: byId('workspace'), title: 'Workspace', onShow: r => ws?.show(r), onHide: () => ws?.hide() } });
    ws = T.ws = await createWorkspace(F, { root: byId('workspace'), today: byId('today'), dockRoot: byId('in') });
    T.slot = app => document.querySelector('[data-workspace-slot="' + app + '"]');
    T.hold = app => { T.delay = app; T.wait = new Promise(r => T.release = () => { T.delay = null; r(); }); };
    F.nav.go('/#workspace=ride', { kind: 'section' });
  });
  await page.waitForFunction(() => T.stats.fitness.shows > 0 && T.stats.weather.shows > 0 && T.slot('fitness')?.scrollHeight > 3000);
  const settle = () => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))); await settle();
  const clean = async () => { assert.deepEqual(errors, []); assert.deepEqual(unknown, []); assert.deepEqual(await page.evaluate(() => rejections), []); };
  return { ctx, page, settle, clean };
}
const slot = (page, app = 'fitness') => page.locator(`[data-workspace-slot="${app}"]`);
const scroll = (page, app = 'fitness') => slot(page, app).evaluate(n => Math.round(n.scrollTop));
async function putScroll(t, top, app = 'fitness') { await slot(t.page, app).evaluate((n, y) => n.scrollTop = y, top); await t.settle(); assert.equal(await scroll(t.page, app), top); }
async function go(t, path) { await t.page.evaluate(p => T.F.nav.go(p, { kind: 'section' }), path); await t.settle(); }
async function waitPane(t, app = 'fitness') { await t.page.waitForFunction(app => T.slot(app)?.contains(T.F.view(app).el) && T.F.view(app).fw.visible(), app); await t.settle(); }

test('pane scroll survives an empty native reparent and return to the same workspace without remounting or persisting it', async () => {
  const t = await open(); try {
    await putScroll(t, 761);
    await t.page.evaluate(() => { T.original = T.F.view('fitness').root; });
    await t.page.getByRole('button', { name: 'Open Fitness', exact: true }).first().click();
    await t.page.waitForFunction(() => T.F.route.kind === 'app' && document.querySelector('#views #m-fitness:not([hidden])'));
    assert.equal(await scroll(t.page), 0, 'empty pane physically loses its scroll position');
    await go(t, '/#workspace=ride'); await waitPane(t);
    await t.page.waitForFunction(() => Math.abs(T.slot('fitness').scrollTop - 761) < 2);
    assert.equal(await t.page.evaluate(() => T.F.view('fitness').root === T.original && T.stats.fitness.mounts === 1), true);
    const persisted = await t.page.evaluate(() => localStorage.getItem('ifl:workspace:v2:owner-a'));
    assert.doesNotMatch(persisted, /scrollTop|paneScroll|"top"/);
    await t.clean();
  } finally { await t.ctx.close(); }
});

test('scroll is owned by its workspace and app through switching workspaces and mobile foreground panes', async () => {
  const t = await open(); try {
    await putScroll(t, 619); await putScroll(t, 273, 'weather');
    const other = await t.page.evaluate(() => T.ws.store.create({ name: 'Other workspace', panes: [{ app: 'fitness' }, { app: 'weather' }] }).id);
    await go(t, '/#workspace=' + other); await waitPane(t);
    assert.equal(await scroll(t.page), 0, 'a new workspace starts at its own position');
    await putScroll(t, 207);
    await go(t, '/#workspace=ride'); await waitPane(t);
    await t.page.waitForFunction(() => Math.abs(T.slot('fitness').scrollTop - 619) < 2 && Math.abs(T.slot('weather').scrollTop - 273) < 2);
    await go(t, '/#workspace=' + other); await waitPane(t);
    await t.page.waitForFunction(() => Math.abs(T.slot('fitness').scrollTop - 207) < 2);
    await t.page.setViewportSize({ width: 390, height: 844 }); await t.settle();
    await putScroll(t, 421);
    await t.page.getByRole('tab', { name: 'Weather', exact: true }).click(); await waitPane(t, 'weather');
    await putScroll(t, 215, 'weather');
    await t.page.getByRole('tab', { name: 'Fitness', exact: true }).click(); await waitPane(t);
    await t.page.waitForFunction(() => Math.abs(T.slot('fitness').scrollTop - 421) < 2).catch(async e => {
      throw new Error('Fitness should restore 421: ' + JSON.stringify(await t.page.evaluate(() => ({ fitness: T.slot('fitness').scrollTop, weather: T.slot('weather').scrollTop, route: T.F.route, foreground: document.getElementById('workspace').dataset.foregroundApp, client: T.slot('fitness').clientHeight, contains: T.slot('fitness').contains(T.F.view('fitness').el) }))), { cause: e });
    });
    await t.page.getByRole('tab', { name: 'Weather', exact: true }).click(); await waitPane(t, 'weather');
    await t.page.waitForFunction(() => Math.abs(T.slot('weather').scrollTop - 215) < 2);
    assert.deepEqual(await t.page.evaluate(() => [T.stats.fitness.mounts, T.stats.weather.mounts]), [1, 1]);
    await t.clean();
  } finally { await t.ctx.close(); }
});

test('a different pane route starts at its own position and its native round trip retains only the matching route', async () => {
  const t = await open(); try {
    await putScroll(t, 703);
    await t.page.evaluate(() => T.stats.fitness.fw.nav.go('/fitness/#activities'));
    await t.page.waitForFunction(() => T.F.view('fitness').route?.key === 'activities'); await t.settle();
    assert.equal(await scroll(t.page), 0, 'Today scroll cannot leak into Activities');
    await putScroll(t, 263);
    await t.page.getByRole('button', { name: 'Open Fitness', exact: true }).first().click();
    await t.page.waitForFunction(() => T.F.route.kind === 'app');
    await go(t, '/#workspace=ride'); await waitPane(t);
    await t.page.waitForFunction(() => Math.abs(T.slot('fitness').scrollTop - 263) < 2);
    assert.equal(await t.page.evaluate(() => T.F.view('fitness').route.key), 'activities');
    await t.page.evaluate(() => T.stats.fitness.fw.nav.section('today'));
    await t.page.waitForFunction(() => T.F.view('fitness').route?.key === 'today'); await t.settle();
    assert.equal(await scroll(t.page), 0);
    await t.clean();
  } finally { await t.ctx.close(); }
});

test('user input cancels a delayed scroll restoration and an account teardown retires remaining callbacks', async () => {
  const t = await open(); try {
    await putScroll(t, 733);
    await go(t, '/fitness/#today'); await t.page.waitForFunction(() => T.F.route.kind === 'app');
    await t.page.evaluate(() => { T.hold('fitness'); T.F.nav.go('/#workspace=ride', { kind: 'section' }); });
    await t.page.waitForFunction(() => T.waiting === 1);
    await slot(t.page).evaluate(n => { n.dispatchEvent(new WheelEvent('wheel', { deltaY: 95, bubbles: true })); n.scrollTop = 95; });
    await t.page.evaluate(() => T.release()); await t.settle();
    assert.equal(await scroll(t.page), 95, 'late show must not fight the user');
    await putScroll(t, 533);
    await go(t, '/fitness/#today');
    await t.page.evaluate(() => { T.hold('fitness'); T.F.nav.go('/#workspace=ride', { kind: 'section' }); });
    await t.page.waitForFunction(() => T.waiting === 2);
    await t.page.evaluate(() => {
      T.F.destroy(); T.user = { id: 'owner-b', name: 'Owner B' };
      const replacement = document.createElement('div'); replacement.id = 'replacement'; replacement.style.cssText = 'height:200px;overflow:auto';
      const content = document.createElement('div'); content.style.height = '3000px'; replacement.append(content); document.body.append(replacement); replacement.scrollTop = 81;
      T.release();
    }); await t.settle();
    assert.equal(await t.page.locator('#replacement').evaluate(n => n.scrollTop), 81);
    assert.equal(await t.page.locator('#m-fitness,#m-weather').count(), 0);
    assert.equal(await t.page.evaluate(() => T.F.signal.aborted && T.stats.fitness.unmounts === 1 && T.stats.weather.unmounts === 1), true);
    await t.clean();
  } finally { await t.ctx.close(); }
});

test('late app content restores the waiting position once, and user input cancels later growth-based restoration', async () => {
  const t = await open(); try {
    await putScroll(t, 877);
    await t.page.getByRole('button', { name: 'Open Fitness', exact: true }).first().click();
    await t.page.waitForFunction(() => T.F.route.kind === 'app');
    await t.page.evaluate(() => { T.short = 'fitness'; });
    await go(t, '/#workspace=ride'); await waitPane(t);
    assert.equal(await scroll(t.page), 0, 'content too short to restore yet');
    await t.page.evaluate(() => { T.short = null; T.stats.fitness.content.classList.remove('fixture-short'); T.stats.fitness.fw.workspace.changed(); });
    await t.page.waitForFunction(() => Math.abs(T.slot('fitness').scrollTop - 877) < 2).catch(async e => {
      throw new Error('Fitness should restore 877 after content growth: ' + JSON.stringify(await t.page.evaluate(() => ({ top: T.slot('fitness').scrollTop, height: T.slot('fitness').scrollHeight, client: T.slot('fitness').clientHeight, classes: T.stats.fitness.content.className, contentHeight: T.stats.fitness.content.getBoundingClientRect().height, connected: T.stats.fitness.content.isConnected, contains: T.F.view('fitness').root.contains(T.stats.fitness.content), shows: T.stats.fitness.shows, snapshots: T.stats.fitness.snapshots }))), { cause: e });
    });
    await t.page.getByRole('button', { name: 'Open Fitness', exact: true }).first().click();
    await t.page.waitForFunction(() => T.F.route.kind === 'app');
    await t.page.evaluate(() => { T.short = 'fitness'; });
    await go(t, '/#workspace=ride'); await waitPane(t);
    assert.equal(await scroll(t.page), 0);
    await slot(t.page).evaluate(n => n.dispatchEvent(new WheelEvent('wheel', { deltaY: 100, bubbles: true })));
    await t.page.evaluate(() => { T.short = null; T.stats.fitness.content.classList.remove('fixture-short'); T.stats.fitness.fw.workspace.changed(); }); await t.settle();
    assert.equal(await scroll(t.page), 0, 'metadata refresh cannot undo user cancellation');
    await t.clean();
  } finally { await t.ctx.close(); }
});
