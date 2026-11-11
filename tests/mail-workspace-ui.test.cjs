// The real Mail entry, list, isolated reader and native compose/viewer run with
// the existing demo Mail transport. No service or personal mailbox is contacted.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync, existsSync } = require('node:fs');
const { resolve, extname } = require('node:path');
const { chromium, webkit } = require('playwright');
const PUBLIC = resolve(__dirname, '../today/public'), MAIL = resolve(__dirname, '../email/public/roof'), ORIGIN = 'http://kit.test';
let browser, routeMail;
before(async () => {
  ({ routeMail } = await import('../../georgefarrowgreen/.tools/tests/mocks/mailmock.mjs'));
  browser = process.env.WEB_UI_BROWSER === 'webkit' ? await webkit.launch() : await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox'] });
});
after(async () => browser?.close());
const fixture = `import * as ui from '/roof/ui.js';import {createSheets} from '/roof/sheet.js';import {mount} from '/mail/roof/mail.js';
const T=window.T={provider:null,headers:[],navigations:[],toasts:[],changes:0,active:true,owner:'owner-a',removed:0},controller=new AbortController();
const F={ui,signal:controller.signal,route:{kind:'tab',tab:'workspace'}};F.sheet=createSheets(F);
const root=document.getElementById('mail'),slot=document.getElementById('slot');
const fw=T.fw={ui,signal:controller.signal,theme:()=> 'light',on:()=>()=>{},visible:()=>!root.hidden,toast:s=>T.toasts.push(s),
 session:{user:{id:T.owner},lost(){},hubAgain(){}},header:{set:s=>T.headers.push(s)},
 search:{provide:()=>()=>{}},lazy:fn=>T.holdLazy?new Promise(r=>T.lazyRelease=()=>r(fn(''))):fn(''),
 sheet:{open:spec=>F.sheet.open({...spec,app:'mail'})},
 nav:{depth:()=>0,href:(key,id)=>key==='thread'?'/mail/#thread='+id:'/mail/',section:lens=>T.go(lens==='people'?'/mail/':'/mail/#'+lens),
 go:path=>T.go(path),back:()=>T.go('/mail/')},
 workspace:{enabled:true,active:()=>T.active,provide:p=>{T.provider=p;return()=>{T.removed++;T.provider=null}},changed:()=>T.changes++}};
T.instance=await mount(root,fw);T.go=path=>{T.navigations.push(path);let hash=path.split('#')[1]||'',id=new URLSearchParams(hash).get('thread');T.route=id?{key:'thread',arg:id,section:'people'}:{key:hash||'people',section:hash||'people'};return T.instance.show(T.route)};
await T.go('/mail/');await T.instance.workspace();
T.setPane=async pane=>{T.instance.hide();root.classList.toggle('ifl-in-pane',pane);(pane?slot:document.getElementById('full')).append(root);await T.instance.show(T.route);await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))};
T.abort=()=>{controller.abort();T.instance.unmount()};T.ready=true;
`;
async function open({ width = 1440, paneWidth = 500, access = 'ok' } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height: 1000 }, reducedMotion: 'reduce', serviceWorkers: 'block' }), unknown = [];
  await ctx.route('**/*', r => {
    const u = new URL(r.request().url());
    if (u.protocol === 'blob:') return r.continue();
    if (u.origin !== ORIGIN) { unknown.push(u.href); return r.abort(); }
    const p = u.pathname;
    if (p === '/') return r.fulfill({ contentType: 'text/html', body: `<!doctype html><html data-theme="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app.css"><link rel="stylesheet" href="/roof/roof.css"><link rel="stylesheet" href="/mail/roof/mail.css"><link rel="stylesheet" href="/mail/roof/reader.css"><link rel="stylesheet" href="/mail/roof/mailsheets.css"><link rel="stylesheet" href="/mail/roof/workspace.css"><link rel="stylesheet" href="/fixture.css"><script type="module" src="/fixture.js"></script></head><body data-app="mail"><button id="focus">Mail actions</button><section id="slot"><div class="m-mail ifl-in-pane" id="mail"></div></section><section id="full"></section></body></html>` });
    if (p === '/fixture.js') return r.fulfill({ contentType: 'text/javascript', body: fixture });
    if (p === '/fixture.css') return r.fulfill({ contentType: 'text/css', body: `body{padding:20px;margin:0}#slot{width:${paneWidth}px;max-width:100%;height:740px;overflow:auto;border-radius:24px;background:var(--ifl-surface)}#full{width:100%}#mail{box-sizing:border-box}` });
    const base = p.startsWith('/mail/roof/') ? MAIL : PUBLIC, path = p.startsWith('/mail/roof/') ? p.slice('/mail/roof'.length) : p, file = resolve(base, '.' + decodeURIComponent(path));
    if (!file.startsWith(base + '/') || !existsSync(file)) { unknown.push(p); return r.fulfill({ status: 404, body: '' }); }
    return r.fulfill({ contentType: ({ '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' })[extname(file)] || 'application/octet-stream', body: readFileSync(file) });
  });
  const mail = await routeMail(ctx, { origin: ORIGIN, access });
  const page = await ctx.newPage(), errors = []; page.setDefaultTimeout(10000); page.on('pageerror', e => errors.push(e.message));
  await page.goto(ORIGIN); await page.waitForFunction(() => window.T?.ready);
  const clean = async () => {
    assert.deepEqual(errors, []); assert.deepEqual(unknown, []);
    assert.ok(mail.log.every(r => !/^\/api\/messages\/[^/]+$/.test(r.path)), 'Root never fetches a message body');
    assert.equal(mail.sends.length, 0, 'an OS action never sends a message');
  };
  return { ctx, page, mail, clean };
}

test('Mail narrow panes follow their own width and preserve native reply draft nodes and focus through resize and full-app moves', async () => {
  const t = await open(); try {
    await t.page.locator('.ml-row[data-thread="t-1"]').waitFor();
    assert.equal(await t.page.locator('#mail').getAttribute('data-layout'), 'phone');
    await t.page.locator('.ml-row[data-thread="t-1"]').click();
    await t.page.locator('.mr-subject').waitFor();
    assert.equal(await t.page.locator('.ml-list').isHidden(), true);
    assert.equal(await t.page.locator('.mr-frame iframe').count() || await t.page.locator('.ml-reader iframe').count(), 1);
    const sandbox = await t.page.locator('.ml-reader iframe').getAttribute('sandbox');
    assert.match(sandbox, /allow-scripts/); assert.match(sandbox, /allow-same-origin/);
    await t.page.evaluate(() => document.getElementById('focus').focus());
    assert.equal(await t.page.evaluate(async () => (await T.provider.run('reply', 't-1', { current: () => true })).ok), true);
    const editor = t.page.locator('dialog[data-sheet="mail-compose"] textarea'); await editor.waitFor(); await editor.fill('Keep this unsent draft while moving Mail.');
    await t.page.evaluate(() => { T.editor = document.querySelector('dialog[data-sheet="mail-compose"] textarea'); document.getElementById('slot').style.width = '860px'; });
    await t.page.waitForFunction(() => document.getElementById('mail').dataset.layout === 'pad');
    assert.equal(await editor.inputValue(), 'Keep this unsent draft while moving Mail.');
    assert.equal(await t.page.evaluate(() => document.querySelector('dialog[data-sheet="mail-compose"] textarea') === T.editor && document.activeElement === T.editor), true);
    await t.page.evaluate(() => { document.getElementById('slot').style.height = '340px'; });
    await t.page.waitForFunction(() => document.getElementById('mail').dataset.layout === 'phone');
    assert.equal(await editor.inputValue(), 'Keep this unsent draft while moving Mail.');
    await t.page.evaluate(() => { document.getElementById('slot').style.height = '740px'; });
    await t.page.waitForFunction(() => document.getElementById('mail').dataset.layout === 'pad');
    await t.page.evaluate(() => T.setPane(false));
    assert.equal(await editor.inputValue(), 'Keep this unsent draft while moving Mail.');
    await t.page.evaluate(() => T.setPane(true));
    assert.equal(await t.page.evaluate(() => document.querySelector('dialog[data-sheet="mail-compose"] textarea') === T.editor), true);
    assert.equal(await editor.inputValue(), 'Keep this unsent draft while moving Mail.');
    await t.page.locator('dialog[data-sheet="mail-compose"] [data-close]').click();
    assert.equal(await t.page.locator('#focus').evaluate(n => document.activeElement === n), true);
    await t.clean();
  } finally { await t.ctx.close(); }
});

test('Mail Files finds attachments beyond the selected conversation; PDF uses native navigation while raster uses its existing viewer', async () => {
  const t = await open({ paneWidth: 360, width: 1000 }); try {
    const files = await t.page.evaluate(() => T.provider.files());
    assert.equal(files.status, 'ready'); assert.ok(files.files.length >= 8);
    const pdf = files.files.find(f => f.mime === 'application/pdf'), image = files.files.find(f => f.mime === 'image/png');
    assert.ok(pdf); assert.ok(image); assert.doesNotMatch(JSON.stringify(files.files), /https?:|snippet|body|maya@/);
    await t.page.evaluate(id => T.provider.run('download-file', id, { current: () => true }), pdf.objectId);
    const link = t.page.getByRole('link', { name: 'Download from Mail', exact: true }); await link.waitFor();
    assert.equal(new URL(await link.getAttribute('href')).origin, 'http://email.kit.test'); assert.equal(new URL(await link.getAttribute('href')).searchParams.has('download'), true);
    assert.equal(t.mail.log.some(r => /^\/api\/attachments\//.test(r.path) && !r.navigate), false, 'PDF is not fetched cross origin');
    const dialog = t.page.locator('dialog[open]'), bounds = await dialog.evaluate(n => ({ width: n.getBoundingClientRect().width, scroll: n.scrollWidth, client: n.clientWidth }));
    assert.ok(bounds.scroll <= bounds.client + 1); await dialog.locator('[data-close]').click();
    await t.page.evaluate(id => T.provider.run('open-file', id, { current: () => true }), image.objectId);
    await t.page.locator('dialog[data-sheet="mail-viewer"] img').waitFor();
    assert.ok(t.mail.log.some(r => /^\/api\/attachments\//.test(r.path) && !r.navigate));
    await t.clean();
  } finally { await t.ctx.close(); }
});

test('Mail actual gate and a delayed optional compose import respect account and operation cancellation', async () => {
  const locked = await open({ access: 'reauth' }); try {
    assert.equal(await locked.page.getByRole('button', { name: 'Confirm It’s You', exact: true }).count(), 1);
    const snap = await locked.page.evaluate(() => T.provider.snapshot()); assert.equal(snap.status, 'locked'); assert.deepEqual(snap.files, []);
    assert.equal((await locked.page.evaluate(() => T.provider.files())).status, 'locked');
    assert.equal(locked.mail.log.some(r => r.path === '/api/threads/search'), false);
    await locked.clean();
  } finally { await locked.ctx.close(); }
  const t = await open(); try {
    await t.page.locator('.ml-row').first().waitFor();
    await t.page.evaluate(() => { T.holdLazy = true; T.pending = T.provider.run('compose', null, { current: () => T.owner === 'owner-a' }); });
    await t.page.waitForFunction(() => !!T.lazyRelease);
    await t.page.evaluate(() => { T.owner = 'owner-b'; T.fw.session.user.id = 'owner-b'; T.lazyRelease(); });
    assert.equal(await t.page.evaluate(async () => (await T.pending).ok), false);
    assert.equal(await t.page.locator('dialog[data-sheet="mail-compose"]').count(), 0);
    await t.clean();
  } finally { await t.ctx.close(); }
});
