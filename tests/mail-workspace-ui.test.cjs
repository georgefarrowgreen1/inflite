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
    if (p === '/') return r.fulfill({ contentType: 'text/html', body: `<!doctype html><html data-theme="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app.css"><link rel="stylesheet" href="/roof/roof.css"><link rel="stylesheet" href="/mail/roof/mail.css"><link rel="stylesheet" href="/mail/roof/reader.css"><link rel="stylesheet" href="/mail/roof/mailsheets.css"><link rel="stylesheet" href="/mail/roof/workspace.css"><link rel="stylesheet" href="/fixture.css"><script type="module" src="/fixture.js"></script></head><body data-app="mail"><button id="focus">Mail actions</button><section id="slot" class="ws-module-slot" data-workspace-slot="mail"><div class="m-mail ifl-in-pane" id="mail"></div></section><section id="full"></section></body></html>` });
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

test('Phone Mail reveals search on demand and keeps text tools and Send inside the writing sheet', async () => {
  const t = await open({ width: 390, paneWidth: 390 });
  try {
    await t.page.evaluate(() => T.setPane(false));
    await t.page.locator('.ml-row').first().waitFor();
    const search = t.page.getByRole('searchbox', { name: 'Search Mail', includeHidden: true });
    assert.equal(await search.isHidden(), true);
    await t.page.evaluate(() => T.headers.at(-1).acts.find(a => a.icon === 'search').run(document.getElementById('focus')));
    await search.fill('unmatched phrase');
    await search.press('Escape');
    assert.equal(await search.isHidden(), true);
    assert.equal(await t.page.evaluate(() => document.activeElement.id), 'focus');
    await t.page.evaluate(() => { T.headers.at(-1).acts.find(a => a.icon === 'compose').run(); });
    const sheet = t.page.getByRole('dialog', { name: 'New message' });
    await sheet.waitFor();
    assert.equal(await sheet.locator('.ifs-head').getByRole('button', { name: 'Send' }).isVisible(), true);
    await sheet.getByRole('button', { name: 'Cc/Bcc' }).click();
    assert.equal(await sheet.getByRole('textbox', { name: 'Bcc', exact: true }).isVisible(), true);
    const body = sheet.locator('textarea');
    await body.fill('Meet at nine');
    await sheet.getByRole('button', { name: 'Text tools' }).click();
    await sheet.getByRole('button', { name: 'Bullet list' }).click();
    assert.equal(await body.inputValue(), '• Meet at nine');
    await sheet.getByText('Saved on device', { exact: true }).waitFor();
    await t.clean();
  } finally { await t.ctx.close(); }
});

test('The compact compose toolbar fits five named actions at 320px and protects the draft', async () => {
  const t = await open({ width: 320, paneWidth: 320 });
  try {
    await t.page.evaluate(() => {
      T.fw.workspace.files = { open: async () => [new File(['notes'], 'notes.txt', { type: 'text/plain' })] };
      T.headers.at(-1).acts.find(action => action.icon === 'compose').run();
    });
    const sheet = t.page.getByRole('dialog', { name: 'New message' });
    const group = sheet.getByRole('group', { name: 'Message tools' });
    await group.waitFor();
    assert.equal(await group.getByRole('button').count(), 5);
    const rects = await group.locator('button').evaluateAll(nodes => nodes.map(n => {
      const {x, y, right, width, height} = n.getBoundingClientRect();
      return {x, y, right, width, height};
    }));
    assert.ok(rects.every(r => r.x >= 0 && r.right <= 320 && r.width >= 44 && r.height >= 44 && r.y === rects[0].y));
    await group.getByRole('button', { name: 'Attach from InFlite Files' }).click();
    await sheet.getByText('notes.txt', {exact: true}).waitFor();
    await group.getByRole('button', {name:'Follow up if unanswered'}).click();
    const due = sheet.getByLabel('Follow up in People if unanswered');
    assert.equal(await due.isVisible(), true);
    await group.getByRole('button', {name:'Text tools'}).click();
    assert.equal(await due.isVisible(), false);
    await group.getByRole('button', {name:'Delete draft'}).click();
    const confirm = t.page.getByRole('dialog', {name:'Delete draft?'});
    await confirm.getByRole('button', {name:'Keep writing'}).click();
    assert.equal(await sheet.isVisible(), true);
    await group.getByRole('button', {name:'Delete draft'}).click();
    await confirm.getByRole('button', {name:'Delete draft', exact:true}).click();
    await sheet.waitFor({state:'hidden'});
    await t.clean();
  } finally { await t.ctx.close(); }
});

test('Mail opens a native time review, accepts an explicit change, and offers an editable reply', async () => {
  const t = await open();
  try {
    const threadId = 't-1', evidence = 'Can we make it 09:30 instead?';
    const msg = t.mail.msgs.find(m => m.threadId === threadId);
    const start = new Date(Date.now() + 3*86400000).setUTCHours(8,0,0,0);
    const record = {id:'a'.repeat(32),kind:'calendar',version:4,title:'Club ride',timezone:'UTC',description:'Meet outside',links:[],start,end:start+3600000,allDay:false};
    await t.page.route('**/api/threads/t-1', route => route.fulfill({
      headers:{'Access-Control-Allow-Origin':ORIGIN,'Access-Control-Allow-Credentials':'true'},json:{
        id:threadId,subject:record.title,latestId:msg.id,messages:[{...msg,date:Date.now(),snippet:evidence}],
        timeChange:{messageId:msg.id,evidence,time:'09:30'}
      }
    }));
    const writes = [];
    await t.page.route('**/api/organise/**', async route => {
      const req = route.request();
      assert.equal(req.headers()['x-inflite-owner'],'owner-a');
      if (req.url().endsWith('/list')) return route.fulfill({json:{records:[record],cursor:null}});
      if (req.method()==='GET') return route.fulfill({json:{record}});
      writes.push(req.postDataJSON());
      return route.fulfill({json:{record:{...record,...writes.at(-1).value,version:5}}});
    });
    await t.page.evaluate(async () => {
      // The fixture runs over http://kit.test. Production has a secure context.
      if (!crypto.randomUUID) crypto.randomUUID = () => 'a'.repeat(32);
      const {matchChange} = await import('/organise/mail-calendar.js');
      T.fw.workspace.calendarChange = (spec,current) => matchChange(T.fw,spec,current);
    });
    await t.page.locator('.ml-row[data-thread="t-1"]').click();
    const suggestion = t.page.getByText('Time change proposed', {exact:true});
    await suggestion.click();
    let review = t.page.getByRole('dialog',{name:'Review change'});
    assert.equal(await review.locator('blockquote').textContent(),evidence);
    assert.match(await review.innerText(),/08:00/);
    assert.match(await review.innerText(),/09:30/);
    await review.getByRole('button',{name:'View message'}).click();
    assert.deepEqual(writes,[]);
    await suggestion.click();
    await review.getByRole('button',{name:'Update Calendar'}).click();
    await t.page.getByRole('button',{name:'Reply with time'}).click();
    const editor = t.page.locator('dialog[data-sheet="mail-compose"] textarea');
    await editor.waitFor();
    assert.match(await editor.inputValue(),/09:30 works for me/);
    await editor.fill('Let me know by Friday.');
    const follow = t.page.getByRole('button',{name:/^Follow up .* if unanswered$/});
    await follow.click();
    const due = t.page.getByLabel('Follow up in People if unanswered');
    assert.ok(Date.parse(await due.inputValue()) > Date.now());
    const clock = t.page.getByRole('button', {name:/^Follow up if unanswered/});
    assert.equal(await clock.getAttribute('aria-expanded'), 'true');
    await t.page.getByRole('button', { name: 'Clear follow-up time' }).click();
    assert.equal(await due.inputValue(), '');
    assert.equal(await clock.getAttribute('aria-expanded'), 'false');
    assert.equal(await clock.getAttribute('aria-label'), 'Follow up if unanswered');
    assert.equal(await editor.inputValue(),'Let me know by Friday.');
    assert.equal(writes.length,1);
    assert.deepEqual(writes[0].value,{title:record.title,description:record.description,links:[],timezone:'UTC',allDay:false,start:start+5400000,end:start+9000000});
    await t.clean();
  } finally { await t.ctx.close(); }
});

test('A pending message has one visible Undo, including after another notification replaces it', async () => {
  const t = await open({ width: 390, paneWidth: 390 });
  try {
    await t.page.evaluate(async () => {
      const { toast } = await import('/roof/toast.js');
      T.fw.toast = (message, options) => toast(message, { ...options, app: 'mail' });
      T.headers.at(-1).acts.find(action => action.icon === 'compose').run();
    });
    const dialog = t.page.getByRole('dialog', { name: 'New message' });
    const to = dialog.getByRole('textbox', { name: 'To', exact: true });
    await to.fill('alongrecipientaddress@example.com');
    await to.press('Enter');
    await dialog.getByRole('textbox', { name: 'Subject' }).fill('Lunch on Thursday');
    await dialog.getByRole('textbox', { name: 'Message' }).fill('Does noon work?');
    await dialog.getByRole('button', { name: 'Send', exact: true }).click();
    const undo = t.page.getByRole('button', { name: 'Undo', exact: true });
    await t.page.locator('.ifl-toast.on').getByRole('button', { name: 'Undo' }).waitFor();
    assert.equal(await undo.count(), 1);
    const text = await t.page.locator('.ifl-toast.on .ifm-note-tx').boundingBox();
    const action = await undo.boundingBox();
    assert.ok(text.y >= action.y && text.y + text.height <= action.y + action.height, 'Undo shares a line with the status');
    assert.equal(await t.page.locator('.ml-out').isVisible(), false);
    await t.page.evaluate(() => T.fw.toast('Copied'));
    await t.page.locator('.ml-out').getByRole('button', { name: 'Undo' }).waitFor();
    assert.equal(await undo.count(), 1);
    await undo.click();
    await dialog.waitFor();
    assert.equal(await dialog.getByRole('textbox', { name: 'Subject' }).inputValue(), 'Lunch on Thursday');
    await t.clean();
  } finally { await t.ctx.close(); }
});

test('Mail opens the newest message and hands a selected quick reply to a saved compose draft', async () => {
  const t = await open({width:390,paneWidth:390});
  try {
    const newest = t.mail.msgs.find(m => m.from.name === 'Leo Martins' && m.folder === 'inbox');
    const older = t.mail.msgs.find(m => m.threadId === newest.threadId && m.id !== newest.id);
    const row = t.page.locator(`.ml-row[data-thread="${newest.threadId}"]`);
    assert.equal(await row.evaluate(el => getComputedStyle(el).backgroundImage), 'none');
    await row.click();
    const latest = t.page.locator('.mr-msgs .mr-card');
    assert.equal(await latest.evaluate(el => getComputedStyle(el).backgroundImage), 'none');
    assert.equal(await latest.getAttribute('data-mid'), newest.id);
    await latest.locator('.mr-mhead').click();
    assert.ok((await latest.locator('.mr-addresses').innerText()).includes(newest.from.email));
    const earlier = t.page.locator(`.mr-older [data-mid="${older.id}"]`);
    assert.equal(await earlier.locator('iframe').count(),0);
    await earlier.locator('.mr-mhead').click();
    await earlier.locator('iframe').waitFor({state:'attached'});
    await earlier.locator('.mr-mhead').click();
    assert.equal(await earlier.locator('iframe').count(),0);
    const words = 'Friday works. See you there!';
    const input = t.page.getByRole('textbox',{name:'Reply to Leo'});
    await input.fill(words);
    await input.evaluate(el => el.setSelectionRange(7,12,'backward'));
    await t.page.getByRole('button',{name:'Expand reply'}).click();
    const sheet = t.page.getByRole('dialog',{name:'Reply',exact:true});
    const body = sheet.getByRole('textbox',{name:'Message',exact:true});
    assert.equal(await body.inputValue(), words);
    assert.deepEqual(await body.evaluate(el => [el.selectionStart,el.selectionEnd,el.selectionDirection]),[7,12,'backward']);
    assert.equal(await sheet.locator('.mc-chip').first().getAttribute('title'),newest.from.email);
    await sheet.locator('[data-close]').click();
    await t.page.waitForFunction(() => !document.querySelector('dialog[open]'));
    assert.equal(await input.inputValue(),'');
    await t.page.waitForFunction(() => T.toasts.includes('Draft saved'));
    const save = t.mail.log.find(r => r.method === 'POST' && r.path === '/api/drafts');
    assert.ok(save.body.text.startsWith(words));
    assert.equal(save.body.quote.of,newest.id);
    await t.clean();
  } finally {await t.ctx.close();}
});

test('Contact cards transfer chosen People fields and review incoming changes before saving', async () => {
  const t=await open({width:390,paneWidth:390});
  const person={id:'b'.repeat(32),version:3,title:'Sam Taylor',email:'sam@example.com',phone:'07700 900123',organisation:'Northline'};
  const saves=[];
  try {
    await t.ctx.route('**/api/people-cards/*',async route=>{
      const save=route.request().url().endsWith('/save');
      if(save)saves.push(route.request().postDataJSON());
      await route.fulfill({json:save?{record:person}:{records:[person],cursor:null,owner:'owner-a'}});
    });
    const msg=t.mail.msgs.find(m=>m.from.name==='Leo Martins' && m.folder==='inbox');
    msg.attachments.push({id:'vcard1',filename:'Sam Taylor.vcf',type:'text/vcard',size:128});
    await t.ctx.route('**/api/attachments/vcard1/export',r=>r.fulfill({contentType:'application/octet-stream',body:'BEGIN:VCARD\r\nVERSION:3.0\r\nFN:Sam Taylor\r\nEMAIL:sam@example.com\r\nTEL:07700 900321\r\nEND:VCARD\r\n'}));
    await t.page.locator('.ml-row[data-thread="'+msg.threadId+'"]').click();
    await t.page.getByRole('button',{name:'Save to People'}).click();
    const card=t.page.locator('.ifl-contact-card');
    await card.getByRole('button',{name:'Update contact'}).waitFor();
    assert.equal(await card.getByLabel('Save destination').inputValue(),person.id);
    assert.ok((await card.innerText()).includes('Currently 07700 900123'));
    assert.equal(saves.length,0);
    await card.getByRole('button',{name:'Update contact'}).click();
    await card.getByRole('button',{name:'Done'}).click();
    assert.deepEqual(saves[0].fields,{phone:'07700 900321'});
    assert.equal(saves[0].version,3);
    await t.page.getByRole('button',{name:'Expand reply'}).click();
    await t.page.getByRole('button',{name:'Add Files',exact:true}).click();
    await card.getByRole('button',{name:'Share contact'}).click();
    await card.getByLabel('Contact from People').selectOption({label:'Sam Taylor · sam@example.com'});
    await card.getByLabel(/Phone/).check();
    await card.getByRole('button',{name:'Attach contact card'}).click();
    const sheet=t.page.locator('[data-sheet=mail-compose]');
    await sheet.getByRole('button',{name:'Edit shared details'}).click();
    assert.ok(await card.getByLabel(/Phone/).isChecked());
    assert.equal(await card.getByLabel(/Organisation/).isChecked(),false);
    await card.getByRole('button',{name:'Close contact card'}).click();
    await sheet.locator('[data-close]').click();
    await t.page.waitForFunction(()=>T.toasts.includes('Draft saved'));
    const payload=t.mail.log.find(r=>r.path==='/api/drafts' && r.method==='POST').body;
    const vcf=Buffer.from(payload.attachments[0].content,'base64').toString();
    assert.match(vcf,/FN:Sam Taylor\r\n/);assert.match(vcf,/TEL:07700 900123\r\n/);
    assert.doesNotMatch(vcf,/ORG:|NOTE:|Northline/);
    await t.clean();
  } finally {await t.ctx.close();}
});
