const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { createServer } = require('node:http');
const { readFileSync, existsSync } = require('node:fs');
const { createHash } = require('node:crypto');
const source = readFileSync(require.resolve('../today/public/sw.js'), 'utf8');

test('the root worker drops legacy and former-account notifications, including delayed Mail details', async () => {
  const build = /^const RELEASE = "([\d.]+)";/m.exec(source)[1];
  const bodies = { '/': '<title>Notifications fixture</title>', '/app.js': `const BUILD = "${build}";` };
  const releasePaths = [
    /['"](\/organise\/releases\/[^/]+\/store\.js)['"]/.exec(readFileSync(require.resolve('../today/public/roof/workspace.js'), 'utf8'))[1],
    /['"](\/organise\/releases\/[^/]+\/links\.js)['"]/.exec(readFileSync(require.resolve('../today/public/roof/life410.js'), 'utf8'))[1],
  ];
  for (const path of releasePaths) bodies[path] = readFileSync(require.resolve('../today/public' + path), 'utf8');
  const a = { owner: 'A', epoch: 'a'.repeat(64) }, bAccount = { owner: 'B', epoch: 'b'.repeat(64) }, aNext = { owner: 'A', epoch: 'c'.repeat(64) };
  const sums = JSON.parse(/^const INTEGRITY = (.*);$/m.exec(source)[1]);
  for (const path of Object.keys(sums)) sums[path] = 'sha256-' + createHash('sha256').update(bodies[path] ?? build).digest('base64');
  const workerSource = source.replace(/^const INTEGRITY = .*;$/m, `const INTEGRITY = ${JSON.stringify(sums)};`);
  const server = createServer((req, res) => {
    const path = req.url.split('?')[0];
    if (path === '/api/notification-session') {
      const account = /(?:^|; )fixture=(A2|A|B)/.exec(req.headers.cookie || '')?.[1];
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify(account ? { signedIn: true, ...({ A: a, B: bAccount, A2: aNext })[account] } : { signedIn: false }));
    }
    if (path === '/sw.js') { res.setHeader('Content-Type', 'text/javascript'); return res.end(workerSource); }
    if (path === '/') res.setHeader('Content-Type', 'text/html');
    if (path.endsWith('.js')) res.setHeader('Content-Type', 'text/javascript');
    res.end(bodies[path] ?? build);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({ executablePath: process.env.CHROMIUM || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined) });
    const ctx = await browser.newContext(), url = 'http://127.0.0.1:' + server.address().port;
    await ctx.grantPermissions(['notifications'], { origin: url });
    const page = await ctx.newPage();
    await page.goto(url);
    await page.evaluate(() => new Promise((resolve, reject) => {
      const r = indexedDB.open('inflite-notes', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('kv');
      r.onerror = () => reject(r.error);
      r.onsuccess = () => {
        const db = r.result, tx = db.transaction('kv', 'readwrite');
        tx.objectStore('kv').put({ list: [{ id: 'legacy', at: Date.now(), title: 'Legacy private text' }], gone: [] }, 'log');
        tx.oncomplete = () => { db.close(); resolve(); };
      };
    }));
    const read = () => page.evaluate(() => new Promise((resolve, reject) => {
      const r = indexedDB.open('inflite-notes', 1);
      r.onerror = () => reject(r.error);
      r.onsuccess = () => {
        const db = r.result, q = db.transaction('kv').objectStore('kv').get('log');
        q.onsuccess = () => { db.close(); resolve(q.result); };
      };
    }));
    await page.evaluate(async () => {
      window.notesMessages = [];
      navigator.serviceWorker.addEventListener('message', e => notesMessages.push(e.data));
      await navigator.serviceWorker.register('/sw.js?os=1');
    });
    await page.waitForFunction(() => navigator.serviceWorker.controller);
    assert.equal(await read(), undefined, 'activation removes the unowned legacy journal');
    const worker = ctx.serviceWorkers()[0];
    await worker.evaluate(() => {
      const realFetch = self.fetch.bind(self);
      self.fetch = (url, options) => String(url).includes('/api/notice/') ? new Promise(resolve => { self.finishMail = resolve; }) : realFetch(url, options);
    });
    const push = data => worker.evaluate(d => {
      const event = new PushEvent('push', { data: JSON.stringify(d) });
      const waits = [];
      event.waitUntil = p => waits.push(p);
      self.dispatchEvent(event);
      return Promise.all(waits);
    }, data);
    const ask = (client, data) => client.evaluate(d => new Promise(resolve => {
      const channel = new MessageChannel();
      channel.port1.onmessage = e => { channel.port1.close(); resolve(e.data); };
      navigator.serviceWorker.controller.postMessage(d, [channel.port2]);
    }), data);
    const shown = () => page.evaluate(async () => (await (await navigator.serviceWorker.ready).getNotifications()).map(({ title, body, tag, data }) => ({ title, body, tag, data })));
    await ctx.addCookies([{ name: 'fixture', value: 'A', url }]);
    await push({ ...a, app: 'today', title: 'A private schedule', body: 'A private appointment', url: '/#morning' });
    assert.equal((await ask(page, { ifl: 'notes', owner: 'A' })).list[0].title, 'A private schedule');
    assert.deepEqual((await ask(page, { ifl: 'notes', owner: 'B' })).list, []);
    const mail = push({ ...a, app: 'mail', title: 'Mail', tag: 'private-thread', url: '/mail/#thread=private-thread' });
    await page.waitForFunction(async () => (await (await navigator.serviceWorker.ready).getNotifications()).some(n => n.tag === 'mail:private-thread'));
    await ctx.addCookies([{ name: 'fixture', value: 'B', url }]);
    const b = await ctx.newPage();
    await b.goto(url);
    await b.waitForFunction(() => navigator.serviceWorker.controller);
    assert.deepEqual((await ask(b, { ifl: 'notes', owner: 'B' })).list, []);
    assert.deepEqual((await shown()).filter(n => n.tag !== 'ifl:notice'), [], 'the previous account’s OS notifications close');
    await push({ ...bAccount, app: 'today', title: 'B private schedule' });
    await worker.evaluate(() => self.finishMail(Response.json({ title: 'A sender', body: 'A subject' })));
    await mail;
    const log = await read();
    assert.deepEqual([log.owner, log.list.map(n => n.title)], ['B', ['B private schedule']]);
    assert.deepEqual((await ask(page, { ifl: 'notes', owner: 'A' })).list, []);
    assert.deepEqual((await shown()).filter(n => n.tag !== 'ifl:notice').map(n => n.title), ['B private schedule']);
    await ask(page, { ifl: 'notes-forget', ...a });
    assert.equal((await read()).owner, 'B', 'a delayed sign-out from A does not clear B');
    await push({ ...a, app: 'mail', title: 'Late A push', tag: 'old-thread', url: '/mail/#thread=old-thread' });
    assert.deepEqual((await read()).list.map(n => n.title), ['B private schedule']);
    assert.ok((await shown()).some(n => n.title === 'InFlite' && !n.data));
    assert.ok((await page.evaluate(() => notesMessages)).every(m => Object.keys(m).length === 1 && ['notes-updated', 'notes-reset'].includes(m.ifl)), 'tabs receive only invalidations');
    await ctx.clearCookies();
    await ask(b, { ifl: 'notes-forget', owner: null });
    await push({ ...bAccount, app: 'today', title: 'Signed-out private push', body: 'Private text', url: '/#private' });
    assert.equal(await read(), undefined);
    assert.deepEqual((await ask(b, { ifl: 'notes', owner: null })).list, []);
    assert.deepEqual((await shown()).map(({ title, data }) => [title, data]), [['InFlite', null]]);
    await ctx.addCookies([{ name: 'fixture', value: 'A2', url }]);
    await push({ ...aNext, app: 'today', title: 'New session detail' });
    await ask(page, { ifl: 'notes-forget', ...a });
    await push({ ...a, app: 'today', title: 'Old session detail' });
    assert.deepEqual((await read()).list.map(n => n.title), ['New session detail']);
    assert.equal((await read()).epoch, aNext.epoch, 'old-session pushes and cleanup cannot alter a fresh login for the same account');
    // The native Organise cache supplies its lazy picker. The shell also retains the Store it imports.
    const picker = releasePaths[1], moduleBuild = picker.split('/')[3];
    await page.evaluate(({ picker, moduleBuild }) => navigator.serviceWorker.controller.postMessage({ ifl: 'keep', app: 'notes', build: moduleBuild, files: [picker] }), { picker, moduleBuild });
    await page.waitForFunction(async picker => !!(await caches.match(picker)), picker);
    await ctx.setOffline(true);
    for (const path of releasePaths) assert.equal(await page.evaluate(path => fetch(path).then(r => r.text()), path), bodies[path]);
  } finally {
    await browser?.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
  }
});

test('an interrupted shell install preserves offline launch and a complete update waits for open tabs', async () => {
  let build = '4.6.1', interrupt = false, mixedDocument = false, sentSession = false, stableRequests = 0;
  const documentFor = version => '<title>' + version + '</title>';
  const scriptFor = version => 'const BUILD = "' + version + '";';
  const server = createServer((req, res) => {
    const path = req.url.split('?')[0];
    if (interrupt && path === '/cards.js') { res.writeHead(503).end(); return; }
    if (path === '/layout.js' && req.headers.cookie) sentSession = true;
    res.setHeader('Cache-Control', 'no-store');
    if (path === '/sw.js') {
      res.setHeader('Content-Type', 'text/javascript');
      const sums = JSON.parse(/^const INTEGRITY = (.*);$/m.exec(source)[1]);
      const bodies = { '/': documentFor(build), '/app.js': scriptFor(build), '/day.css': '/* stable */' };
      for (const key of Object.keys(sums)) sums[key] = 'sha256-' + createHash('sha256').update(bodies[key] ?? build).digest('base64');
      res.end(source.replace(/^const INTEGRITY = .*;$/m, 'const INTEGRITY = ' + JSON.stringify(sums) + ';')
        .replace(/const RELEASE = "[\d.]+";/, 'const RELEASE = "' + build + '";'));
    } else if (path === '/day.css') {
      res.setHeader('Cache-Control', 'public, no-cache');
      res.setHeader('ETag', '"constant-css"');
      stableRequests++;
      res.end('/* stable */');
    } else if (path === '/') {
      res.setHeader('Content-Type', 'text/html'); res.end(documentFor(mixedDocument ? '4.6.1' : build));
    } else if (path === '/app.js') res.end(scriptFor(build));
    else res.end(build);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({executablePath: process.env.CHROMIUM || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined)});
    const ctx = await browser.newContext(), url = 'http://127.0.0.1:' + server.address().port;
    await ctx.addCookies([{ name: 'ifl-session', value: 'sample-session', url }]);
    let page = await ctx.newPage();
    await page.goto(url);
    await page.evaluate(async () => { await navigator.serviceWorker.register('/sw.js'); await navigator.serviceWorker.ready; });
    await page.waitForFunction(() => !!navigator.serviceWorker.controller);
    const update = () => page.evaluate(async () => {
      const reg = await navigator.serviceWorker.getRegistration();
      const state = new Promise(resolve => reg.addEventListener('updatefound', () => {
        const worker = reg.installing;
        worker.addEventListener('statechange', () => {
          if (['installed','redundant'].includes(worker.state)) resolve(worker.state);
        });
      }, { once: true }));
      await reg.update();
      return state;
    });
    build = '4.6.2'; mixedDocument = true;
    assert.equal(await update(), 'redundant', 'a root document from a different release cannot install');
    mixedDocument = false; interrupt = true;
    assert.equal(await update(), 'redundant');
    await ctx.setOffline(true); await page.close(); page = await ctx.newPage();
    await page.goto(url); assert.equal(await page.title(), '4.6.1');
    assert.equal(await page.evaluate(() => fetch('/cards.js').then(r => r.text())), '4.6.1');
    await ctx.setOffline(false); interrupt = false;
    assert.equal(await update(), 'installed');
    assert.equal(stableRequests, 1, 'unchanged verified CSS is copied locally during both update attempts');
    assert.equal(await page.evaluate(() => fetch('/cards.js').then(r => r.text())), '4.6.1');
    const other = await ctx.newPage();
    await other.goto(url);
    const activate = () => page.evaluate(async () => {
      const reg = await navigator.serviceWorker.getRegistration(), channel = new MessageChannel();
      const reply = new Promise(resolve => { channel.port1.onmessage = e => resolve(e.data); });
      reg.waiting.postMessage({ifl:'activate-shell',build:'4.6.2'},[channel.port2]);
      return reply;
    });
    assert.deepEqual(await activate(), {activating:false,reason:'other-windows'});
    await other.close();
    await page.evaluate(() => new Promise(resolve => {
      const frame = document.createElement('iframe');
      frame.onload = resolve; frame.src = '/embedded'; document.body.append(frame);
    }));
    assert.deepEqual(await activate(), {activating:true}, 'an embedded same-origin frame belongs to this window');
    await page.waitForFunction(async()=> (await (await fetch('/cards.js')).text()) === '4.6.2');
    await page.close(); page = await ctx.newPage();
    await ctx.setOffline(true); await page.goto(url);
    await page.waitForFunction(async () => (await fetch('/cards.js')).text().then(text => text === '4.6.2'));
    await page.reload(); assert.equal(await page.title(), '4.6.2');
    assert.equal(sentSession, false, 'shell staging fetches public files without a session cookie');
    await ctx.setOffline(false);
    await page.evaluate(async () => {
      const cache = await caches.open('inflite-shell-set-4.6.2');
      await cache.put('/day.css', new Response('damaged local copy', { headers: { 'Content-Type': 'text/css' } }));
    });
    build = '4.6.3';
    assert.equal(await update(), 'installed');
    assert.equal(stableRequests, 2, 'a damaged local asset is fetched again before installation');
    assert.equal(await page.evaluate(async () => (await (await caches.open('inflite-shell-set-4.6.3')).match('/day.css')).text()), '/* stable */');
  } finally { await browser?.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});
