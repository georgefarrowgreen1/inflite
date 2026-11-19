const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createServer } = require('node:http');
const { chromium, webkit } = require('playwright');

const origin = 'https://inflite.ai';
const assets = path.resolve(__dirname, '../today/public');
const pages = ['/about/', '/privacy/', '/storage/', '/terms/'];
const mime = { '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.png': 'image/png' };

test('installed shell leaves online public page navigations to the site', () => {
  const events = new Map();
  const self = { location: new URL('/sw.js', origin), addEventListener: (name, handler) => events.set(name, handler) };
  vm.runInNewContext(fs.readFileSync(path.join(assets, 'sw.js'), 'utf8'), { self, URL });
  for (const page of pages) {
    for (const pathname of [page, page.slice(0, -1), page + 'index.html']) {
      events.get('fetch')({ request: { method: 'GET', mode: 'navigate', url: origin + pathname }, respondWith() {
        assert.fail('The installed app intercepted public navigation to ' + pathname);
      } });
    }
  }
});

test('public pages and contact form work without signing in, from phone to desktop', async () => {
  const unexpected = [], sent = [], errors = [], accessed = new Set();
  let receipt = 503, pending, browser;
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/api/contact' && req.method === 'POST') {
      const body = [];
      for await (const chunk of req) body.push(chunk);
      sent.push({ fields: JSON.parse(Buffer.concat(body)), cookie: req.headers.cookie, origin: req.headers.origin });
      if (pending) await pending;
      res.writeHead(receipt, { 'Content-Type': 'application/json' }).end(JSON.stringify(receipt === 201 ? { ok: true } : { error: 'Unavailable' }));
      return;
    }
    const file = path.join(assets, url.pathname + (url.pathname.endsWith('/') ? 'index.html' : ''));
    if (url.pathname.startsWith('/api/') || !mime[path.extname(file)] || !fs.existsSync(file)) {
      unexpected.push(req.url);
      res.writeHead(404).end();
      return;
    }
    accessed.add(url.pathname);
    res.writeHead(200, { 'Content-Type': mime[path.extname(file)] }).end(fs.readFileSync(file));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const site = 'http://127.0.0.1:' + server.address().port;
  try {
    const executablePath = process.env.CHROMIUM || (fs.existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined);
    browser = process.env.WEB_UI_BROWSER === 'webkit' ? await webkit.launch() : await chromium.launch({
      executablePath, args: ['--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1'],
    });
    const context = await browser.newContext({ viewport: { width: 320, height: 720 }, reducedMotion: 'reduce', serviceWorkers: 'block' });
    context.on('request', request => {
      if (new URL(request.url()).origin !== site) unexpected.push(request.url());
    });
    const page = await context.newPage();
    page.on('pageerror', e => errors.push(e.message));
    await context.addCookies([{ name: 'fixture', value: 'signed-in', url: site }]);
    await page.goto(site + '/about/');
    const sky = page.locator('.about-sky canvas[data-painted]');
    await sky.waitFor();
    const image = () => sky.evaluate(canvas => canvas.toDataURL());
    const stillFrame = await image();
    const wing = page.locator('.intro-art');
    assert.equal(await page.locator('body').evaluate(body => getComputedStyle(body).getPropertyValue('-webkit-user-select') || getComputedStyle(body).userSelect), 'none');
    assert.equal(await page.getByLabel('Your name').evaluate(input => getComputedStyle(input).getPropertyValue('-webkit-user-select') || getComputedStyle(input).userSelect), 'text');
    assert.equal(await wing.locator('img').getAttribute('draggable'), 'false');
    assert.equal(await wing.evaluate(art => art.dispatchEvent(new MouseEvent('contextmenu', { cancelable: true }))), false);
    assert.equal(await wing.getAttribute('data-wing-motion'), null);
    assert.equal(await wing.locator('.wing-canvas').isVisible(), false);
    assert.equal(await page.locator('.wallpaper-controls, .privacy-feature').count(), 0);
    await page.getByRole('link', { name: 'Explore the apps' }).click();
    assert.equal(new URL(page.url()).hash, '#apps');
    assert.equal(await image(), stillFrame, 'a reduced-motion scene stays still while scrolling');
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await wing.scrollIntoViewIfNeeded();
    await page.waitForFunction(() => {
      const art = document.querySelector('.intro-art[data-wing-motion]');
      return art && (art.hasAttribute('data-wing-live') || art.querySelector('img').getAnimations().length > 0);
    });
    await page.waitForFunction(before => document.querySelector('.about-sky canvas').toDataURL() !== before, stillFrame);
    await page.getByRole('link', { name: 'Explore the apps' }).click();
    await page.waitForFunction(() => !document.querySelector('.intro-art').hasAttribute('data-wing-motion'));
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await wing.scrollIntoViewIfNeeded();
    assert.equal(await wing.locator('.wing-canvas').isVisible(), false);
    assert.deepEqual(await page.evaluate(() => [localStorage.length, sessionStorage.length]), [0, 0]);
    for (const pagePath of pages) {
      if (pagePath !== '/about/') await page.locator('footer a[href="' + pagePath + '"]').click();
      assert.equal(new URL(page.url()).pathname, pagePath);
      assert.equal(await page.locator('main h1').count(), 1);
      const problems = await page.evaluate(() => {
        const errors = [];
        if (document.documentElement.scrollWidth > innerWidth) errors.push('horizontal overflow');
        for (const link of document.querySelectorAll('a[href^="#"]')) {
          if (!document.getElementById(link.hash.slice(1))) errors.push('broken ' + link.hash);
        }
        return errors;
      });
      assert.deepEqual(problems, []);
      await page.addScriptTag({ path: require.resolve('axe-core/axe.min.js') });
      const violations = await page.evaluate(async () => (await axe.run(document, {
        runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'],
        // Page zoom is locked by the owner's explicit preference.
        rules: { 'meta-viewport': { enabled: false } },
      })).violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => n.target) })));
      assert.deepEqual(violations, []);
    }

    await page.locator('a[href="/about/#contact"]').first().click();
    await page.getByLabel('Your name').fill('Fixture Sender');
    await page.getByLabel('Email address').fill('sender@example.test');
    const message = page.getByLabel('Message', { exact: true });
    await message.fill('Please help with this fixture.');
    const submit = page.getByRole('button', { name: /send/i });
    await submit.click();
    await page.waitForFunction(() => document.querySelector('[role="status"]').textContent.includes('couldn’t be confirmed'));
    assert.equal(await message.inputValue(), 'Please help with this fixture.');
    receipt = 201;
    let release;
    pending = new Promise(resolve => { release = resolve; });
    await submit.click();
    await page.waitForFunction(() => document.querySelector('button[type="submit"]').disabled);
    await page.locator('form').evaluate(form => form.requestSubmit());
    release();
    await page.waitForFunction(() => document.querySelector('[role="status"]').textContent.includes('Message received'));
    assert.equal(sent.length, 2);
    assert.deepEqual(sent.map(({ cookie, origin }) => [cookie, origin]), [[undefined, site], [undefined, site]]);
    assert.deepEqual(sent[1].fields, { name: 'Fixture Sender', email: 'sender@example.test', message: 'Please help with this fixture.', website: '' });
    assert.equal(await message.inputValue(), '');
    assert.equal(await page.locator('.app-list li').count(), 10);
    const heroLayout = () => page.locator('.introduction').evaluate(section => {
      const copy = section.querySelector('.intro-copy').getBoundingClientRect();
      const art = section.querySelector('.intro-art').getBoundingClientRect();
      return art.top >= copy.bottom ? 'stacked' : art.left + art.width / 2 > copy.right ? 'side-by-side' : 'overlapping';
    });
    assert.equal(await heroLayout(), 'stacked');
    await page.setViewportSize({ width: 1440, height: 960 });
    assert.equal(await heroLayout(), 'side-by-side');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.getByRole('navigation', { name: 'Legal' }).getByRole('link', { name: 'Privacy' }).click();
    assert.equal(new URL(page.url()).pathname, '/privacy/');
    assert.deepEqual(errors, []);
    assert.deepEqual(unexpected, []);
    assert.ok(accessed.has('/about/glass-wing-768.webp'));
  } finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
});
