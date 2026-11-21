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

test('installed shell keeps its orb modules offline and leaves public pages on their own release', async () => {
  const events = new Map();
  const self = { location: new URL('/sw.js', origin), addEventListener: (name, handler) => events.set(name, handler) };
  const caches = { open:async () => ({ match:async key => key }) };
  vm.runInNewContext(fs.readFileSync(path.join(assets, 'sw.js'), 'utf8'), { self, URL, caches });
  for (const page of pages) {
    for (const pathname of [page, page.slice(0, -1), page + 'index.html']) {
      events.get('fetch')({ request: { method: 'GET', mode: 'navigate', url: origin + pathname }, respondWith() {
        assert.fail('The installed app intercepted public navigation to ' + pathname);
      } });
    }
  }
  for (const filename of ['bubble-surface.js', 'bubble-colours.js']) {
    const asset = '/roof/' + filename;
    const request = { url:origin + asset, method:'GET', referrer:origin + '/roof/bubbles.js?about' };
    events.get('fetch')({ request, respondWith() { assert.fail('Public renderer dependency intercepted: ' + asset); } });
    let cached;
    events.get('fetch')({ request:{...request, referrer:origin + '/roof/bubbles.js'}, respondWith(result) { cached = result; } });
    assert.equal(await cached, asset, 'the shell serves its installed copy of ' + filename);
  }
});

test('public pages and contact form work without signing in, from phone to desktop', async () => {
  const unexpected = [], sent = [], errors = [], accessed = new Set();
  let receipt = 503, pending, browser;
  const forecast = { temperature: 8.7, code: 63, day: true, windy: true, high: 11, low: 5,
    upcoming: [{ time: 1795255200, temperature: 10 }, { time: 1795258800, temperature: 11 }] };
  let london = forecast;
  let providerOnline = false;
  let providerRequests = 0;
  const weatherRequests = [];
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/api/about/weather' && req.method === 'GET') {
      weatherRequests.push(req.headers.cookie);
      res.writeHead(london ? 200 : 503, { 'Content-Type': 'application/json' }).end(JSON.stringify(london));
      return;
    }
    if (url.pathname === '/api/contact' && req.method === 'POST') {
      const body = [];
      for await (const chunk of req) body.push(chunk);
      sent.push({ fields: JSON.parse(Buffer.concat(body)), cookie: req.headers.cookie, origin: req.headers.origin,
        attempt: req.headers['idempotency-key'] });
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
    const provider = 'https://api.open-meteo.com/v1/forecast?';
    context.on('request', request => {
      if (new URL(request.url()).origin !== site && !request.url().startsWith(provider)) unexpected.push(request.url());
    });
    await context.route(url => url.href.startsWith(provider), route => {
      providerRequests++;
      const query = new URL(route.request().url()).searchParams;
      assert.equal(query.get('latitude'), '51.5072');
      assert.equal(query.get('longitude'), '-0.1276');
      assert.equal(route.request().headers().referer, undefined);
      if (!providerOnline) return route.fulfill({ status: 503 });
      const now = Math.floor(Date.now() / 1000);
      return route.fulfill({ json: { current: { time: now, temperature_2m: 7, weather_code: 73, is_day: 1 },
        hourly: { time: [now + 3600, now + 7200], temperature_2m: [7, 6] } } });
    });
    const page = await context.newPage();
    page.on('pageerror', e => errors.push(e.message));
    await context.addCookies([{ name: 'fixture', value: 'signed-in', url: site }]);
    await page.goto(site + '/about/');
    assert.ok(await page.locator('.logo-entrance').isHidden(), 'reduced motion opens straight to the page');
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
    // Sample after media-query listeners have run and their frame has been painted.
    const image = () => sky.evaluate(canvas => new Promise(resolve => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve(canvas.toDataURL())));
    }));
    await page.emulateMedia({colorScheme:'light'});
    const stillFrame = await image();
    await page.emulateMedia({colorScheme:'dark'});
    await page.waitForFunction(before => document.querySelector('.about-sky canvas').toDataURL() !== before, stillFrame);
    await page.emulateMedia({colorScheme:'light'});
    await page.waitForFunction(before => document.querySelector('.about-sky canvas').toDataURL() === before, stillFrame);
    assert.equal(await page.locator('canvas').count(), 1, 'the product preview reuses ordinary HTML and the existing orb canvas');
    const preview = page.getByRole('group', { name: 'InFlite product preview' });
    const tab = name => preview.getByRole('tab', { name, exact: true });
    const today = preview.getByRole('tabpanel', { name: 'Today' });
    await today.getByText('Rain · Windy', { exact: true }).waitFor();
    assert.ok(await today.getByText('London, UK', { exact: true }).isVisible());
    assert.ok(await today.getByText('9°', { exact: true }).isVisible());
    assert.deepEqual(weatherRequests, [undefined], 'the shared London preview fetch uses no session cookie');
    assert.equal(providerRequests, 0, 'the same-origin endpoint is tried first');
    assert.equal(await tab('Today').getAttribute('aria-selected'), 'true');
    await tab('Weather').click();
    const weather = preview.getByRole('tabpanel', { name: 'Weather' });
    assert.ok(await weather.getByRole('heading', { name: 'London, UK' }).isVisible());
    assert.ok(await weather.getByText('High 11° · Low 5°').isVisible());
    assert.deepEqual(await weather.locator('dt').allTextContents(), ['Now', '10:00', '11:00']);
    assert.deepEqual(await weather.locator('dd').allTextContents(), ['9°', '10°', '11°']);
    const effect = weather.locator('.preview-weather-sky');
    await weather.scrollIntoViewIfNeeded();
    await page.waitForFunction(() => document.querySelector('.product-preview').hasAttribute('data-weather-in-view'));
    assert.ok(await effect.locator('.preview-weather-rain').isVisible());
    assert.ok(await effect.locator('.preview-weather-wind').isVisible());
    assert.equal(await effect.locator('.preview-weather-rain').evaluate(el => getComputedStyle(el, '::before').animationName), 'none');
    london = null;
    await page.evaluate(() => dispatchEvent(new Event('online')));
    await weather.getByText('Weather unavailable', { exact: true }).waitFor();
    assert.ok(await weather.locator('[data-weather-hours]').isHidden());
    assert.ok(await effect.isHidden());
    providerOnline = true;
    await page.evaluate(() => dispatchEvent(new Event('online')));
    await weather.getByText('Snow', { exact: true }).waitFor();
    assert.equal(providerRequests, 2, 'if the edge is unavailable, the fixed forecast can load directly');
    london = forecast;
    await page.evaluate(() => dispatchEvent(new Event('online')));
    await weather.getByText('Rain · Windy', { exact: true }).waitFor();
    await tab('Weather').focus();
    await page.keyboard.press('ArrowRight');
    assert.equal(await tab('Fitness').getAttribute('aria-selected'), 'true');
    assert.ok(await preview.getByRole('tabpanel', { name: 'Fitness' }).isVisible());
    await page.keyboard.press('End');
    assert.equal(await tab('Mail').getAttribute('aria-selected'), 'true');
    await page.keyboard.press('Home');
    assert.equal(await tab('Today').getAttribute('aria-selected'), 'true');
    const story = page.getByRole('region', { name: 'Take the scenic route.' });
    assert.equal(await story.getByRole('link', { name: 'Explore cycling routes' }).getAttribute('href'), '/fitness/#routes');
    const landscape = story.locator('.story-landscape');
    await landscape.scrollIntoViewIfNeeded();
    await landscape.evaluate(image => image.decode());
    assert.ok(await landscape.evaluate(image => image.currentSrc.endsWith('/about/gravel-lane-small.webp')));
    assert.equal(await landscape.evaluate(image => image.getAnimations().length), 0, 'reduced motion keeps the landscape still');
    assert.equal(await page.locator('body').evaluate(body => getComputedStyle(body).getPropertyValue('-webkit-user-select') || getComputedStyle(body).userSelect), 'none');
    assert.equal(await page.locator('form').count(), 0);
    assert.equal(await page.locator('.wallpaper-controls, .privacy-feature').count(), 0);
    await page.getByRole('link', { name: 'Explore the apps' }).click();
    assert.equal(new URL(page.url()).hash, '#apps');
    const catalogue = page.getByRole('tablist', { name: 'Explore InFlite apps' });
    const app = name => catalogue.getByRole('tab', { name, exact: true });
    const details = name => page.getByRole('region', { name: 'Meet the apps.' }).getByRole('tabpanel', { name });
    assert.equal(await catalogue.getByRole('tab').count(), 10);
    assert.equal(await app('Today').getAttribute('aria-selected'), 'true');
    assert.ok(await details('Today').isVisible());
    for (const tab of await catalogue.getByRole('tab').all()) {
      const box = await tab.boundingBox();
      assert.ok(box && box.width >= 44 && box.height >= 44 && box.x >= 0 && box.x + box.width <= 320);
      assert.ok(await tab.evaluate(button => button.scrollWidth <= button.clientWidth + 1));
    }
    await app('Today').focus();
    await page.keyboard.press('ArrowDown');
    assert.equal(await app('Today').getAttribute('tabindex'), '-1');
    assert.equal(await app('Files').getAttribute('aria-selected'), 'true');
    assert.ok(await app('Files').evaluate(button => document.activeElement === button));
    assert.equal(await details('Files').getByRole('link', { name: 'Open Files' }).getAttribute('href'), '/#files');
    assert.equal(await page.locator('#app-spotlight p').count(), 1);
    assert.equal(await details('Files').evaluate(panel => panel.getAnimations().length), 0);
    await app('Weather').click();
    assert.equal(await details('Weather').getByRole('link', { name: 'Open Weather' }).getAttribute('href'), '/weather/');
    assert.equal(new URL(page.url()).hash, '#apps', 'app selection stays on the catalogue');
    assert.equal(await image(), stillFrame, 'a reduced-motion scene stays still while scrolling');
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.evaluate(() => window.scrollTo(0, 0));
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
      if (pagePath === '/about/') {
        const sizes = await page.locator('footer .brand-name, footer .brand-company, footer nav a')
          .evaluateAll(elements => elements.map(el => getComputedStyle(el).fontSize));
        assert.equal(new Set(sizes).size, 1);
        assert.ok(await page.locator('footer .brand-name').evaluate(el => {
          const name = document.createRange();
          name.selectNodeContents(el.firstChild);
          const brand = name.getBoundingClientRect(), company = el.lastElementChild.getBoundingClientRect();
          return company.left >= brand.right && company.top < brand.bottom && company.bottom > brand.top;
        }));
      }
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
    const email = page.getByLabel('Email address');
    await email.fill('invalid email');
    const message = page.getByLabel('Message', { exact: true });
    await message.fill('Please help with this fixture.');
    const submit = page.getByRole('button', { name: /send/i });
    await submit.click();
    assert.equal(sent.length, 0, 'invalid fields never reach the contact server');
    assert.equal(await email.evaluate(field => field.validity.valid), false);
    await email.fill('sender@example.test');
    await submit.focus();
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.querySelector('[role="status"]').textContent.includes('couldn’t be confirmed'));
    assert.ok(await submit.evaluate(button => button === document.activeElement), 'a failed submission returns keyboard focus to the retry control');
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
    assert.match(sent[0].attempt, /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/);
    assert.equal(sent[1].attempt, sent[0].attempt, 'retry keeps the same delivery receipt key');
    assert.deepEqual(sent[1].fields, { name: 'Fixture Sender', email: 'sender@example.test', message: 'Please help with this fixture.', website: '' });
    assert.equal(await message.inputValue(), '');
    assert.ok(await page.getByRole('link', { name: 'hello@inflite.ai' }).isVisible());
    for (const width of [320, 390, 428, 550, 1440]) {
      await page.setViewportSize({ width, height: 960 });
      const [brand, menu, launch] = await Promise.all([
        header.getByRole('link', { name: 'InFlite', exact: true }).boundingBox(),
        header.getByRole('navigation', { name: 'Main' }).boundingBox(),
        header.getByRole('link', { name: 'Open InFlite', exact: true }).boundingBox(),
      ]);
      assert.ok(Math.abs(menu.x + menu.width / 2 - width / 2) < 1, 'Apps and Contact are centred at ' + width + 'px');
      if (width === 320) {
        assert.ok(menu.y >= Math.max(brand.y + brand.height, launch.y + launch.height));
      } else {
        assert.ok(Math.abs(menu.y + menu.height / 2 - launch.y - launch.height / 2) < 1);
        assert.ok(brand.x + brand.width < menu.x && menu.x + menu.width < launch.x);
      }
    }
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

    const fallback = await browser.newPage({ javaScriptEnabled: false, viewport: { width: 320, height: 720 } });
    await fallback.goto(site + '/about/#apps');
    const fallbackLinks = fallback.locator('.app-list a');
    assert.equal(await fallbackLinks.count(), 10);
    const calendar = fallbackLinks.filter({ hasText: 'Calendar' });
    assert.ok(await calendar.isVisible());
    assert.equal(await calendar.getAttribute('href'), '/calendar/');
    await fallback.close();

    const motion = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'no-preference' });
    await motion.bringToFront();
    await motion.goto(site + '/about/', { waitUntil: 'commit' });
    await motion.locator('body.logo-entering').waitFor({ state: 'attached', timeout: 5000 });
    const entrance = motion.locator('.logo-entrance');
    const headerIcon = motion.locator('.about-nav .brand img');
    const revealedSky = motion.locator('.about-sky canvas[data-painted]');
    await entrance.waitFor({ state: 'detached' });
    await revealedSky.waitFor({ state: 'visible' });
    assert.equal(await headerIcon.evaluate(img => getComputedStyle(img).opacity), '1');
    await motion.reload({ waitUntil: 'commit' });
    await motion.locator('body.logo-entering').waitFor({ state: 'attached', timeout: 5000 });
    // The first keystroke both dismisses the entrance and performs its regular action.
    await motion.keyboard.press('Tab');
    assert.ok(await motion.getByRole('link', { name: 'Skip to content' }).evaluate(link => link === document.activeElement));
    assert.ok(await entrance.isHidden());
    assert.equal(await headerIcon.evaluate(img => getComputedStyle(img).opacity), '1');
    await revealedSky.waitFor({ state: 'visible' });
    await motion.goto('about:blank');
    await motion.goto(site + '/about/#apps');
    assert.ok(await entrance.isHidden(), 'a deep link opens directly at the app picker');
    await motion.getByRole('tab', { name: 'Weather', exact: true }).first().click();
    const weatherScene = motion.locator('#preview-weather');
    const weatherArt = weatherScene.locator('.preview-weather-sky');
    await weatherScene.scrollIntoViewIfNeeded();
    await motion.waitForFunction(() => document.querySelector('.product-preview').hasAttribute('data-weather-in-view'));
    await weatherArt.locator('.preview-weather-rain').waitFor();
    for (const [code, kind, layer, animation] of [
      [63, 'rain', 'rain', 'london-rain'], [73, 'snow', 'snow', 'london-snow'],
      [0, 'clear', 'light', 'london-light'], [3, 'cloud', 'cloud-front', 'london-cloud'],
    ]) {
      london = { ...forecast, code };
      await motion.evaluate(() => dispatchEvent(new Event('online')));
      await weatherScene.locator(`[data-sky="${kind}"]`).waitFor();
      assert.equal(await weatherArt.locator('.preview-weather-' + layer).evaluate((el, pseudo) =>
        getComputedStyle(el, pseudo).animationName, kind === 'rain' || kind === 'snow' ? '::before' : null), animation);
    }
    assert.equal(await weatherArt.locator('.preview-weather-wind i').first().evaluate(el => getComputedStyle(el).animationName), 'london-wind');
    await motion.close();

    assert.deepEqual(errors, []);
    assert.deepEqual(unexpected, []);
    assert.ok(accessed.has('/roof/bubbles.js'));
    assert.ok(!Array.from(accessed).some(pathname => /wing/.test(pathname)));
  } finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
});
