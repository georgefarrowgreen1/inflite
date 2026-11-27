// Real search, notification rows and native dialog component; only the device
// notification transport and app-intent boundary are fixtures.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync, existsSync } = require('node:fs');
const { resolve, extname } = require('node:path');
const { chromium, webkit } = require('playwright');
const PUBLIC = resolve(__dirname, '../today/public'), ORIGIN = 'http://actions.test';
let browser;
before(async () => { browser = process.env.WEB_UI_BROWSER === 'webkit' ? await webkit.launch() : await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox'] }); });
after(async () => browser?.close());

async function open(width = 390) {
  const ctx = await browser.newContext({ viewport: { width, height: 844 }, colorScheme: 'dark', reducedMotion: 'reduce', serviceWorkers: 'block' });
  const script = readFileSync(resolve(PUBLIC, 'app.js'), 'utf8'), start = script.indexOf("// ==== InFlite's menu, shared:"), end = "// ==== end of InFlite's menu ====";
  const shared = script.slice(start, script.indexOf(end, start) + end.length), unknown = [];
  const csp = /Content-Security-Policy: (.*)/.exec(readFileSync(resolve(PUBLIC, '_headers'), 'utf8'))[1];
  await ctx.route('**/*', r => {
    const u = new URL(r.request().url()), p = u.pathname;
    if (u.protocol === 'blob:' && u.origin === ORIGIN) return r.continue();
    if (u.origin !== ORIGIN) { unknown.push(u.href); return r.abort(); }
    if (p === '/') return r.fulfill({ contentType: 'text/html', headers: { 'Content-Security-Policy': csp }, body: '<!doctype html><html data-theme="dark"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app.css"><link rel="stylesheet" href="/roof/roof.css"><link rel="stylesheet" href="/roof/workspace-commands.css"><script src="/shared.js" defer></script></head><body><main><h1>Actions fixture</h1><button type="button" id="bell">Notifications</button><button type="button" id="search">Search</button></main></body></html>' });
    if (p === '/shared.js') return r.fulfill({ contentType: 'text/javascript', body: shared });
    if (p === '/api/vitals') return r.fulfill({ status: 204, body: '' });
    if (p === '/api/status-banner') return r.fulfill({ json: { banner: null } });
    const file = resolve(PUBLIC, '.' + decodeURIComponent(p));
    if (file.startsWith(PUBLIC + '/') && existsSync(file)) return r.fulfill({ body: readFileSync(file), contentType: ({ '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' })[extname(file)] || 'application/octet-stream' });
    unknown.push(p); return r.fulfill({ status: 404, body: 'Unexpected fixture path' });
  });
  const page = await ctx.newPage(), errors = [];
  page.setDefaultTimeout(10000); page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => { window.__violations = []; window.__rejections = []; document.addEventListener('securitypolicyviolation', e => __violations.push(e.violatedDirective + ' ' + e.blockedURI)); addEventListener('unhandledrejection', e => __rejections.push(String(e.reason))); });
  await page.goto(ORIGIN);
  await page.evaluate(async () => {
    const ui = await import('/roof/ui.js'), { createSheets } = await import('/roof/sheet.js'), { createSearch } = await import('/roof/search.js'), { createBell } = await import('/bell.js'), { createWorkspaceCommands, notificationActions } = await import('/roof/workspace-commands.js');
    const ac = new AbortController(), sw = new EventTarget();
    const owner = 'owner-a', epoch = 'a'.repeat(64);
    const notes = [
      { id: 'chat-note', app: 'chat', title: 'Message from Reuben', body: 'A private sample', url: '/chats/#open=friend-8', at: Date.now() - 10000, seen: false },
      { id: 'ride-note', app: 'fitness', title: 'Your ride', body: 'Ready to plan', url: '/fitness/#today', at: Date.now() - 20000, seen: false },
    ];
    const s = window.actions = { requests: [], calls: [], counts: [], toasts: [], notes, ac, offline: false, defer: false, ports: [], systems: [], fileDialogs: false };
    sw.getRegistration = async () => ({ active: { postMessage(msg, ports) {
      s.requests.push(msg);
      const answer = () => {
        if (msg.owner !== owner || (msg.ifl !== 'notes' && msg.epoch !== epoch)) {
          ports[0].postMessage({ ifl: 'notes', kept: false, list: [], unread: 0 });
          return;
        }
        if (msg.ifl === 'notes-seen') for (const n of notes) { if (msg.ids?.includes(n.id)) n.seen = true; }
        if (msg.ifl === 'notes-clear') for (let i = notes.length - 1; i >= 0; i--) if (msg.all || msg.ids?.includes(notes[i].id)) notes.splice(i, 1);
        ports[0].postMessage({ ifl: 'notes', owner, epoch, kept: true, list: notes.slice(), unread: notes.filter(n => !n.seen).length });
      };
      if (s.defer) s.ports.push(answer); else queueMicrotask(answer);
    } } });
    Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: sw });
    const F = s.F = { signal: ac.signal, session: { view: { user: { id: owner }, apps: { mail: true } }, apps: { mail: true, chats: true, fitness: true, weather: true, markets: true } }, route: { kind: 'tab', tab: 'workspace' }, ui, toast(text, options) { s.toasts.push({ text, options }); }, nav: { go(path) { s.calls.push(['go', path]); } } };
    F.sheet = createSheets(F); F.search = createSearch(F);
    const runIntent = (app, intent, objectId) => {
      s.calls.push(['intent', app, intent, objectId, document.querySelector('dialog[data-sheet=notifications][open]') !== null]);
      if (s.failAction) return false;
      F.sheet.open({ sheet: 'intent-target', title: intent === 'reply' ? 'Reply editor' : 'App editor', body: ui.el('textarea', { 'aria-label': 'Draft' }) });
    };
    s.commands = createWorkspaceCommands(F, { apps: () => Object.keys(F.session.apps).map(id => ({ id })), actions: () => [], files: () => [], systemActions: () => s.systems, fileDialogsAvailable: () => s.fileDialogs, runIntent, openFiles(q) { s.calls.push(['files', q]); }, openWorkspace(id) { s.calls.push(['workspace', id]); } });
    await s.commands.ready;
    s.bell = createBell(F, {
      count(n) { s.counts.push(n); },
      actions: note => notificationActions(note, {
        origin: location.origin, enabled: app => F.session.apps[app] === true,
        current: () => !ac.signal.aborted && F.session.view.user.id === owner,
        runIntent,
        async openApp(app, path) { s.calls.push(['app', app, path]); return { app }; },
      }),
    });
    document.getElementById('bell').onclick = () => s.bell.open(); document.getElementById('search').onclick = () => F.search.open();
  });
  await page.waitForFunction(() => actions.counts.includes(2));
  const clean = async () => { assert.deepEqual(errors, []); assert.deepEqual(unknown, []); assert.deepEqual(await page.evaluate(() => [__violations, __rejections]), [[], []]); };
  return { ctx, page, clean };
}

test('notification actions are accessible siblings and Reply closes the log before dispatching the exact editor intent', async () => {
  const { ctx, page, clean } = await open(320);
  try {
    await page.getByRole('button', { name: 'Notifications', exact: true }).click();
    const sheet = page.locator('dialog[data-sheet=notifications][open]');
    await sheet.getByRole('button', { name: 'Reply · Message from Reuben', exact: true }).waitFor();
    assert.equal(await sheet.locator('button button').count(), 0);
    assert.equal(await sheet.locator('.ifl-nt-action').evaluateAll(nodes => nodes.every(n => n.getBoundingClientRect().height >= 44 && n.getBoundingClientRect().right <= innerWidth)), true);
    await sheet.getByRole('button', { name: 'Reply · Message from Reuben', exact: true }).click();
    await page.getByRole('dialog', { name: 'Reply editor' }).waitFor();
    assert.deepEqual(await page.evaluate(() => actions.calls), [['intent', 'chats', 'reply', 'friend-8', false]]);
    await page.waitForFunction(() => actions.requests.some(r => r.ifl === 'notes-seen' && r.ids.join() === 'chat-note'));
    assert.equal(await page.evaluate(() => actions.notes.length), 2);
    assert.equal(await page.getByRole('textbox', { name: 'Draft' }).count(), 1, 'the notification action opens an editor without sending');
    await clean();
  } finally { await ctx.close(); }
});

test('a failed notification reply stays unread and its row still opens the source app', async () => {
  const { ctx, page, clean } = await open(320);
  try {
    await page.evaluate(() => { actions.failAction = true; });
    const bell = page.getByRole('button', { name: 'Notifications', exact: true });
    await bell.click();
    await page.getByRole('button', { name: 'Reply · Message from Reuben', exact: true }).click();
    await page.waitForFunction(() => actions.toasts.some(t => t.text === 'That action couldn’t open. Try again.'));
    await bell.click();
    const sheet = page.getByRole('dialog', { name: 'Notifications', exact: true });
    await sheet.getByRole('radio', { name: 'Unread · 2', exact: true }).click();
    await sheet.getByRole('button', { name: 'Reply · Message from Reuben', exact: true }).waitFor();
    assert.equal(await page.evaluate(() => actions.requests.some(r => r.ifl === 'notes-seen' || r.ifl === 'notes-clear')), false);
    assert.equal(await sheet.getByRole('button', { name: /^Open app/ }).count(), 0);
    await sheet.getByRole('button', { name: /^New\. Message from Reuben/ }).click();
    await page.waitForFunction(() => actions.notes.find(n => n.id === 'chat-note')?.seen);
    assert.deepEqual(await page.evaluate(() => actions.calls.at(-1)), ['app', 'chats', '/chats/#open=friend-8']);
    assert.equal(await page.evaluate(() => actions.notes.length), 2);
    await clean();
  } finally { await ctx.close(); }
});

test('real search keyboard activation dispatches a compose command and does not put the query in Recent or a URL', async () => {
  const { ctx, page, clean } = await open();
  try {
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    const input = page.getByRole('combobox', { name: 'Search everything' });
    await input.fill('write email');
    await page.getByRole('option').filter({ hasText: 'Compose Mail' }).waitFor();
    await input.press('ArrowDown'); await input.press('Enter');
    await page.getByRole('dialog', { name: 'App editor' }).waitFor();
    assert.equal(await page.evaluate(() => actions.calls[0][1]), 'mail');
    assert.equal(await page.evaluate(() => actions.calls[0][2]), 'compose');
    assert.equal(await page.evaluate(() => JSON.stringify(history.state).includes('write email') || location.href.includes('write')), false);
    assert.equal(await page.evaluate(() => (localStorage.getItem('ifl:recent') || '').includes('write email')), false);
    await clean();
  } finally { await ctx.close(); }
});

test('account-scoped Ctrl/Command K opens search and respects native editors, dialogs and teardown', async () => {
  const { ctx, page, clean } = await open();
  try {
    await page.getByRole('button', { name: 'Search', exact: true }).focus();
    for (const chord of ['Control+k', 'Meta+k']) {
      await page.keyboard.press(chord);
      await page.getByRole('combobox', { name: 'Search everything' }).waitFor();
      await page.getByRole('button', { name: 'Close', exact: true }).click();
    }
    await page.evaluate(() => { const field = document.createElement('input'); field.id = 'native-editor'; document.body.append(field); field.focus(); });
    await page.keyboard.press('Control+k');
    assert.equal(await page.locator('dialog[data-sheet=search][open]').count(), 0);
    await page.evaluate(() => { document.getElementById('search').focus(); actions.F.sheet.open({ sheet: 'native-editor', title: 'Native editor', body: actions.F.ui.el('p', { text: 'Keep native keyboard shortcuts' }) }); });
    await page.keyboard.press('Meta+k');
    assert.equal(await page.locator('dialog[data-sheet=search][open]').count(), 0);
    await page.evaluate(() => { actions.F.sheet.closeAll(); actions.commands.destroy(); document.getElementById('search').focus(); });
    await page.keyboard.press('Control+k');
    assert.equal(await page.locator('dialog[data-sheet=search][open]').count(), 0);
    await clean();
  } finally { await ctx.close(); }
});

test('a retired notification button and a delayed worker response cannot act in another account or sheet generation', async () => {
  const { ctx, page, clean } = await open();
  try {
    await page.getByRole('button', { name: 'Notifications', exact: true }).click();
    await page.getByRole('button', { name: 'Reply · Message from Reuben', exact: true }).waitFor();
    await page.evaluate(() => { window.oldAction = document.querySelector('.ifl-nt-action'); window.oldMain = document.querySelector('.ifl-nt-main'); window.oldClear = document.querySelector('.ifl-nt-x'); actions.F.sheet.closeAll(); actions.bell.open(); oldAction.click(); oldMain.click(); oldClear.click(); });
    assert.deepEqual(await page.evaluate(() => actions.calls), []);
    await page.evaluate(() => { actions.defer = true; actions.bell.refresh(); });
    await page.waitForFunction(() => actions.ports.length > 0);
    await page.evaluate(() => { actions.F.session.view.user.id = 'owner-b'; actions.ac.abort(); for (const answer of actions.ports) answer(); oldAction.click(); });
    assert.equal(await page.locator('dialog[open]').count(), 0);
    assert.deepEqual(await page.evaluate(() => actions.calls), []);
    assert.equal(await page.evaluate(() => actions.counts.at(-1)), 0);
    await clean();
  } finally { await ctx.close(); }
});

test('retired notification controls and Undo cannot mutate or navigate a replacement account', async () => {
  const { ctx, page, clean } = await open();
  try {
    await page.getByRole('button', { name: 'Notifications', exact: true }).click();
    await page.getByRole('button', { name: 'Reply · Message from Reuben', exact: true }).waitFor();
    await page.evaluate(() => {
      window.retiredControls = ['.ifl-nt-main', '.ifl-nt-x', '.ifl-nt-all', '.ifl-nt-set'].map(q => document.querySelector(q));
      document.querySelector('.ifl-nt-x').click();
    });
    await page.waitForFunction(() => actions.requests.some(r => r.ifl === 'notes-clear'));
    await page.evaluate(() => {
      window.requestsBeforeReplacement = actions.requests.length;
      actions.F.session.view.user.id = 'owner-b'; actions.ac.abort();
      for (const button of retiredControls) button.click();
      for (const toast of actions.toasts) toast.options?.action?.run();
    });
    assert.deepEqual(await page.evaluate(() => actions.calls), []);
    assert.equal(await page.evaluate(() => actions.requests.length), await page.evaluate(() => requestsBeforeReplacement));
    assert.equal(await page.locator('dialog[open]').count(), 0);
    await clean();
  } finally { await ctx.close(); }
});


test('typed system and file commands use the shared search UI and keep their query out of persisted navigation', async () => {
  const {ctx,page,clean}=await open(320);
  try {
    await page.evaluate(()=>{
      actions.fileDialogs=true;
      actions.systems=[{id:'open-activity',label:'Activity',current:()=>!actions.ac.signal.aborted,run(scope){
        if(scope.current())actions.F.sheet.open({sheet:'typed-activity',title:'Activity',body:actions.F.ui.el('p',{text:'No background tasks'})});
      }}];
    });
    await page.keyboard.press('Control+k');const input=page.getByRole('combobox',{name:'Search everything'});
    await input.fill('show activity');const activity=page.getByRole('option').filter({hasText:'Activity'});await activity.waitFor();
    await activity.click();await page.getByRole('dialog',{name:'Activity',exact:true}).waitFor();
    assert.equal(await page.evaluate(()=>JSON.stringify(history.state).includes('show activity')||(localStorage.getItem('ifl:recent')||'').includes('show activity')),false);
    await page.locator('dialog[data-sheet=typed-activity] [data-close]').click();
    await page.getByRole('button',{name:'Search',exact:true}).click();await input.fill('attach a file');
    await page.getByRole('option').filter({hasText:'Attach a file in Mail'}).click();await page.getByRole('dialog',{name:'App editor',exact:true}).waitFor();
    assert.deepEqual(await page.evaluate(()=>actions.calls.at(-1).slice(0,4)),['intent','mail','compose-attach',undefined]);
    assert.equal(await page.evaluate(()=>Object.keys({...localStorage,...sessionStorage}).some(key=>/attach a file/.test(key))),false);
    await clean();
  }finally{await ctx.close();}
});

test('retired system command controls cannot act after policy changes or account replacement',async()=>{
  const {ctx,page,clean}=await open();
  try{
    await page.evaluate(()=>{actions.canSync=true;actions.systems=[{id:'sync-workspaces',label:'Sync workspaces',current:()=>actions.canSync,run(){actions.calls.push(['sync']);}}];});
    await page.getByRole('button',{name:'Search',exact:true}).click();await page.getByRole('combobox',{name:'Search everything'}).fill('sync workspaces');
    await page.getByRole('option').filter({hasText:'Sync workspaces'}).waitFor();
    await page.evaluate(()=>{window.retiredSync=document.querySelector('[role=option]');actions.canSync=false;retiredSync.click();});
    assert.deepEqual(await page.evaluate(()=>actions.calls),[]);
    await page.evaluate(()=>{actions.canSync=true;actions.F.search.open();});
    await page.getByRole('combobox',{name:'Search everything'}).fill('sync workspaces');await page.getByRole('option').filter({hasText:'Sync workspaces'}).waitFor();
    await page.evaluate(()=>{window.retiredSync=document.querySelector('[role=option]');actions.F.session.view.user.id='replacement';actions.ac.abort();retiredSync.click();});
    assert.deepEqual(await page.evaluate(()=>actions.calls),[]);await clean();
  }finally{await ctx.close();}
});

test('global command shortcut preserves a native editor inside a shadow tree',async()=>{
  const {ctx,page,clean}=await open();
  try{
    await page.evaluate(()=>{const host=document.createElement('div');host.id='shadow-editor';document.body.append(host);const field=document.createElement('textarea');field.setAttribute('aria-label','Shadow draft');host.attachShadow({mode:'open'}).append(field);field.focus();});
    await page.keyboard.press('Control+k');assert.equal(await page.locator('dialog[data-sheet=search][open]').count(),0);
    await page.evaluate(()=>document.getElementById('search').focus());await page.keyboard.press('Control+k');await page.getByRole('combobox',{name:'Search everything'}).waitFor();await clean();
  }finally{await ctx.close();}
});
