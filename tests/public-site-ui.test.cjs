const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createServer } = require('node:http');
const { chromium, webkit } = require('playwright');

const origin = 'https://inflite.ai';
const assets = path.resolve(process.env.WEB_UI_PUBLIC || path.resolve(__dirname, '../today/public'));
const pages = ['/about/', '/privacy/', '/storage/', '/terms/', '/contact/'];
const mime = { '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.png': 'image/png' };

async function assertCompanyBrand(region) {
  const brand = region.getByRole('link', { name: 'InFlite, a GFG company', exact: true });
  assert.equal(await brand.getAttribute('href'), '/about/');
  const logo = brand.getByAltText('GFG', { exact: true });
  assert.equal(await logo.getAttribute('src'), '/about/gfg.svg');
  await logo.evaluate(img => img.decode());
  assert.ok(await logo.isVisible());
}

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
  let intercepted = false;
  events.get('fetch')({
    request: { url: origin + '/roof/bubble-surface.js', method:'GET', referrer:origin + '/roof/bubbles.js?about' },
    respondWith() { intercepted = true; },
  });
  assert.equal(intercepted, false, 'public optics follow the renderer even while an older shell is installed');
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
    const header = page.getByRole('banner');
    assert.equal(await header.getByAltText('GFG', { exact: true }).count(), 0);
    for (const [name, href] of [['InFlite', '/about/'], ['Apps', '/about/#apps'], ['Contact', '/contact/'], ['Open InFlite', '/']]) {
      const link = header.getByRole('link', { name, exact: true });
      assert.equal(await link.getAttribute('href'), href);
      const box = await link.boundingBox();
      assert.ok(box && box.width >= 44 && box.height >= 44 && box.x >= 0 && box.x + box.width <= 320, name + ' fits with a 44px touch target');
    }
    const image = () => sky.evaluate(canvas => canvas.toDataURL());
    await page.emulateMedia({colorScheme:'light'});
    const stillFrame = await image();
    await page.emulateMedia({colorScheme:'dark'});
    await page.waitForFunction(before => document.querySelector('.about-sky canvas').toDataURL() !== before, stillFrame);
    await page.emulateMedia({colorScheme:'light'});
    await page.waitForFunction(before => document.querySelector('.about-sky canvas').toDataURL() === before, stillFrame);
    assert.equal(await page.locator('canvas').count(), 1, 'the orbs are the only animated artwork');
    assert.equal(await page.locator('body').evaluate(body => getComputedStyle(body).getPropertyValue('-webkit-user-select') || getComputedStyle(body).userSelect), 'none');
    assert.equal(await page.locator('form').count(), 0);
    assert.equal(await page.locator('.wallpaper-controls, .privacy-feature').count(), 0);
    await page.getByRole('link', { name: 'Explore the apps' }).click();
    assert.equal(new URL(page.url()).hash, '#apps');
    assert.equal(await image(), stillFrame, 'a reduced-motion scene stays still while scrolling');
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.waitForFunction(before => document.querySelector('.about-sky canvas').toDataURL() !== before, stillFrame);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const frozen = await image();
    await page.waitForTimeout(200);
    assert.equal(await image(), frozen);
    assert.deepEqual(await page.evaluate(() => [localStorage.length, sessionStorage.length]), [0, 0]);
    for (const pagePath of pages) {
      if (pagePath === '/contact/') await page.getByRole('banner').getByRole('link', { name: 'Contact' }).click();
      else if (pagePath !== '/about/') await page.locator('footer a[href="' + pagePath + '"]').click();
      assert.equal(new URL(page.url()).pathname, pagePath);
      assert.equal(await page.locator('main h1').count(), 1);
      await assertCompanyBrand(page.getByRole('contentinfo'));
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

    await page.getByRole('heading', { name: 'Get in touch.' }).waitFor();
    assert.equal(await page.getByRole('banner').getByRole('link', { name: 'Contact' }).getAttribute('aria-current'), 'page');
    await page.goto(site + '/about/#contact');
    await page.waitForURL(site + '/contact/');
    assert.equal(await page.getByLabel('Your name').evaluate(input => getComputedStyle(input).getPropertyValue('-webkit-user-select') || getComputedStyle(input).userSelect), 'text');
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
    assert.ok(await page.getByRole('link', { name: 'hello@inflite.ai' }).isVisible());
    await page.setViewportSize({ width: 1440, height: 960 });
    await page.emulateMedia({ colorScheme: 'dark' });
    const heading = await page.getByRole('heading', { name: 'Get in touch.' }).boundingBox();
    const form = await page.locator('form').boundingBox();
    assert.ok(heading.x + heading.width <= form.x, 'the contact form sits beside the introduction on desktop');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));

    await page.goto(site + '/about/');
    assert.equal(await page.locator('.app-list li').count(), 10);
    await page.locator('.introduction').scrollIntoViewIfNeeded();
    assert.ok(await page.getByRole('link', {name:'Explore the apps'}).isVisible());
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.getByRole('navigation', { name: 'Legal' }).getByRole('link', { name: 'Privacy' }).click();
    assert.equal(new URL(page.url()).pathname, '/privacy/');
    await assertCompanyBrand(page.getByRole('contentinfo'));
    assert.deepEqual(errors, []);
    assert.deepEqual(unexpected, []);
    assert.ok(accessed.has('/roof/bubbles.js'));
    assert.ok(!Array.from(accessed).some(pathname => /wing/.test(pathname)));
  } finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
});
