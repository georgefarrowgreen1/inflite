const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { createServer } = require('node:http');
const { readFileSync, existsSync } = require('node:fs');
const { createHash } = require('node:crypto');
const source = readFileSync(require.resolve('../today/public/sw.js'), 'utf8');

test('an interrupted shell install preserves offline launch and a complete update waits for open tabs', async () => {
  let build = '4.6.1', interrupt = false, stableRequests = 0;
  const server = createServer((req, res) => {
    const path = req.url.split('?')[0];
    if (interrupt && path === '/cards.js') { res.writeHead(503).end(); return; }
    res.setHeader('Cache-Control', 'no-store');
    if (path === '/sw.js') {
      res.setHeader('Content-Type', 'text/javascript');
      const sums = JSON.parse(/^const INTEGRITY = (.*);$/m.exec(source)[1]);
      for (const key of Object.keys(sums)) sums[key] = 'sha256-' + createHash('sha256').update(key === '/app.js' ? 'const BUILD = "' + build + '";' : key === '/day.css' ? '/* stable */' : build).digest('base64');
      res.end(source.replace(/^const INTEGRITY = .*;$/m, 'const INTEGRITY = ' + JSON.stringify(sums) + ';')
        .replace(/const RELEASE = "[\d.]+";/, 'const RELEASE = "' + build + '";'));
    } else if (path === '/day.css') {
      res.setHeader('Cache-Control', 'public, no-cache');
      res.setHeader('ETag', '"constant-css"');
      stableRequests++;
      res.end('/* stable */');
    } else if (path === '/') {
      res.setHeader('Content-Type', 'text/html'); res.end('<title>' + build + '</title>');
    } else if (path === '/app.js') res.end('const BUILD = "' + build + '";');
    else res.end(build);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({executablePath: process.env.CHROMIUM || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined)});
    const ctx = await browser.newContext(), url = 'http://127.0.0.1:' + server.address().port;
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
    build = '4.6.2'; interrupt = true;
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
