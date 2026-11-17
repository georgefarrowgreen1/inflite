// Real frame and unified shell: native app continuity and cancellable motion.
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
    const heading=fw.ui.el('h2',{text:'${app} content'}),draft=fw.ui.el('input',{'aria-label':'${app} draft'}),routeLabel=fw.ui.el('output',{class:'fixture-route'}),content=fw.ui.el('div',{class:'fixture-long',text:'Long ${app} content'});
    root.replaceChildren(heading,draft,routeLabel,content);s.content=content;let off=()=>{},provided=false;
    return{workspace(){if(provided||!fw.workspace)return;provided=true;off=fw.workspace.provide({snapshot:()=>{s.snapshots=(s.snapshots||0)+1;return{status:'ready',files:[],actions:[]}},run:()=>({ok:true})});},
    async show(route){this.workspace();s.shows++;s.route=route;routeLabel.textContent=route.key;content.classList.toggle('fixture-short',T.short==='${app}'&&root.classList.contains('ifl-in-pane'));fw.header.set({title:'${app} '+route.key});
      if(T.delay==='${app}'&&root.classList.contains('ifl-in-pane')){T.waiting++;await T.wait;}},
    hide(){s.hides++;},flush:async()=>({lost:0}),unmount(){off();s.unmounts++;root.replaceChildren();}};
  }`;
}
async function open({ width = 1440, motion = 'reduce' } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height: 1000 }, reducedMotion: motion, serviceWorkers: 'block' }), unknown = [];
  let workspaceCloud={revision:0,state:null,updatedAt:0};await ctx.route('**/*', r => {
    const u = new URL(r.request().url()), p = u.pathname;
    if (u.origin !== ORIGIN) { unknown.push(u.href); return r.abort(); }
    if(p==='/api/organise/preferences')return r.fulfill({json:{prefs:{hidden:[],version:0}}});if(p==='/api/organise/calendar-events')return r.fulfill({json:{events:[],warnings:[],calendars:[]}});if(p==='/api/organise/list')return r.fulfill({json:{records:[],cursor:null}});if(p.startsWith('/api/system/'))return r.fulfill({json:p.endsWith('/focus')?{dismissed:[]}:{actions:[],cursor:null,counts:{open:0,done:0}}});
    if(p==='/api/workspaces'){const req=r.request();if(req.method()==='PUT'){const body=req.postDataJSON();if(body.revision!==workspaceCloud.revision)return r.fulfill({status:409,json:{error:'Conflict',...workspaceCloud}});workspaceCloud={revision:workspaceCloud.revision+1,state:body.state,updatedAt:Date.now()};}return r.fulfill({json:workspaceCloud});}if (p === '/') return r.fulfill({ contentType: 'text/html', body: '<!doctype html><html data-theme="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app.css"><link rel="stylesheet" href="/roof/roof.css"><link rel="stylesheet" href="/fixture.css"></head><body><div id="in"><header id="hd"></header><div id="views"><main id="today">Today</main><main id="workspace" hidden></main></div><nav id="tabs"></nav></div></body></html>' });
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
    F.nav.go('/fitness/', { kind: 'section' });
  });
  await page.waitForFunction(() => T.stats.fitness.shows > 0 && T.F.view('fitness').fw.visible());
  const settle = () => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))); await settle();
  const clean = async () => { assert.deepEqual(errors, []); assert.deepEqual(unknown, []); assert.deepEqual(await page.evaluate(() => rejections), []); };
  return { ctx, page, settle, clean };
}
async function waitNative(t, app = 'fitness') {
  await t.page.waitForFunction(app => { const handle = T.F.view(app); return T.F.route.kind === 'app' && T.F.route.app === app && handle.el.parentElement === document.getElementById('views') && !handle.el.hidden && !handle.root.classList.contains('ifl-in-pane'); }, app);
  await t.settle();
}

test('reopening a native app resumes its last native section and preserves its one editor', async () => {
  const t = await open(); try {
    await t.page.locator('.ws-dock-button[aria-label="Fitness"]').click(); await waitNative(t);
    await t.page.getByRole('textbox', {name:'fitness draft',exact:true}).fill('native draft');
    await t.page.evaluate(() => T.stats.fitness.fw.nav.section('activities'));
    await t.page.waitForFunction(() => T.F.route.app === 'fitness' && T.F.route.key === 'activities');
    await t.page.locator('.ws-dock-button[aria-label="Weather"]').click(); await waitNative(t,'weather');
    await t.page.locator('.ws-dock-button[aria-label="Fitness"]').click(); await waitNative(t);
    assert.equal(await t.page.evaluate(() => T.F.route.key),'activities');
    assert.equal(await t.page.getByRole('textbox', {name:'fitness draft',exact:true}).inputValue(),'native draft');
    assert.equal(await t.page.evaluate(() => T.stats.fitness.mounts),1); await t.clean();
  } finally { await t.ctx.close(); }
});

for (const motion of ['reduce','no-preference']) test(`app transitions cancel cleanly on rapid navigation and teardown (${motion})`, async () => {
  const t = await open({motion}); try {
    await t.page.evaluate(() => T.stats.fitness.fw.nav.go('/fitness/#activities'));
    await t.page.waitForFunction(() => T.F.route.key === 'activities');
    if(motion === 'reduce') assert.equal(await t.page.locator('#m-fitness').evaluate(n=>n.getAnimations().length),0);
    else {
      await t.page.emulateMedia({reducedMotion:'reduce'}); await t.settle();
      assert.equal(await t.page.locator('#m-fitness').evaluate(n=>n.getAnimations().length),0,'changing Reduce Motion cancels the current element animation');
      await t.page.emulateMedia({reducedMotion:'no-preference'});
    }
    await t.page.evaluate(() => { for(const section of ['routes','today','activities','today']) T.stats.fitness.fw.nav.go('/fitness/#'+section); });
    await t.page.waitForFunction(() => T.F.route.key === 'today');
    await t.page.evaluate(() => { T.ws.destroy(); T.F.destroy(); });
    await t.settle();
    assert.equal(await t.page.locator('#workspace').evaluate(n=>n.getAnimations({subtree:true}).length),0);
    await t.clean();
  } finally { await t.ctx.close(); }
});
