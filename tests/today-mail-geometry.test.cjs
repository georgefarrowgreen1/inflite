// Render real compose controls in native Mail and Today's real framework sheet.
// Account and delivery dependencies are sample fixtures; no real mail is sent.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { createServer } = require('node:http');
const { readFile, mkdir } = require('node:fs/promises');
const { readFileSync, existsSync } = require('node:fs');
const { resolve, extname } = require('node:path');
const { chromium, webkit } = require('playwright');
const root = resolve(__dirname, '..'), today = resolve(root, 'today/public'), mail = resolve(root, 'email/public');
const fixture = name => JSON.parse(readFileSync(resolve(__dirname, `fixtures/${name}.json`), 'utf8'));
const day = fixture('day'), build = /const BUILD = "([\d.]+)"/.exec(readFileSync(resolve(today, 'app.js'), 'utf8'))[1];
let browser, todayServer, mailServer;
async function serve(base, hosted = false) {
  const server = createServer(async (req, res) => {
    try {
      const path = decodeURIComponent(new URL(req.url, 'http://test').pathname), alias = hosted && path.startsWith('/mail/') ? mail : base;
      const file = resolve(alias, '.' + (alias === mail && hosted ? path.slice(5) : path === '/' ? '/index.html' : path));
      if (!file.startsWith(alias + '/')) throw new Error('outside public');
      const body = await readFile(file), type = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.svg': 'image/svg+xml', '.png': 'image/png' }[extname(file)] || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': type }); res.end(body);
    } catch { res.writeHead(404); res.end('Not found'); }
  });
  await new Promise(ok => server.listen(0, '127.0.0.1', ok)); return server;
}
before(async () => {
  todayServer = await serve(today, true); mailServer = await serve(mail);
  browser = process.env.WEB_UI_BROWSER === 'webkit' ? await webkit.launch() : await chromium.launch({ executablePath: process.env.CHROMIUM || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined), args: ['--no-sandbox'] });
});
after(async () => { await browser?.close(); await Promise.all([todayServer, mailServer].filter(Boolean).map(s => new Promise(ok => s.close(ok)))); });
async function open({ native = false, width, theme }) {
  const origin = `http://127.0.0.1:${(native ? mailServer : todayServer).address().port}`;
  const ctx = await browser.newContext({ viewport: { width, height: 844 }, colorScheme: theme, reducedMotion: 'reduce', serviceWorkers: 'block', hasTouch: width < 600, isMobile: width < 600 });
  await ctx.addInitScript(width => {
    const viewport = Object.assign(new EventTarget(), { width, height: 844, offsetTop: 0, scale: 1 });
    Object.defineProperty(window, 'visualViewport', { configurable: true, value: viewport });
    Object.defineProperties(screen, { width: { get: () => width }, height: { get: () => 844 } });
    window.__geometryViewport = height => { viewport.height = height; viewport.dispatchEvent(new Event('resize')); dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })); };
    window.__rejections = []; addEventListener('unhandledrejection', e => __rejections.push(String(e.reason)));
  }, width);
  const page = await ctx.newPage(), errors = []; page.on('pageerror', e => errors.push(e.message));
  const view = fixture('session'); view.links = { ...view.links, account: origin, auth: origin };
  await ctx.route('**/*', route => {
    const url = new URL(route.request().url()); if (url.origin !== origin) return route.abort();
    if (url.pathname !== '/version' && !url.pathname.startsWith('/api/')) return route.continue();
    const api = { '/version': { build }, '/api/session': view, '/api/boot': { view, cards: day }, '/api/today': day, '/api/hub': { ready: true, roof: true, apps: {} }, '/api/rules': fixture('rules'), '/api/notify': fixture('notify'), '/api/devices': { devices: [], here: [] } };
    return route.fulfill({ status: api[url.pathname] ? 200 : 404, json: api[url.pathname] || { error: 'Sample response unavailable' } });
  });
  if (!native) await page.clock.setFixedTime(new Date(day.at));
  await page.goto(origin + (native ? '/?demo' : '/'));
  await page.locator(native ? 'button[aria-label="New Message"]' : '#top .day-top').waitFor();
  if (native) await page.getByRole('button', { name: 'New Message', exact: true }).click();
  else {
    await page.addStyleTag({ url: '/mail/roof/mailsheets.css' });
    await page.evaluate(async () => {
      const ui = await import('/roof/ui.js'), { createSheets } = await import('/roof/sheet.js'), { openCompose } = await import('/mail/roof/compose.js'), { createStore } = await import('/mail/roof/store.js');
      const sheets = createSheets({ route: { tab: 'today' } }); let slot = null;
      const fw = { ui, toast() {}, sheet: { open: spec => sheets.open({ ...spec, app: 'mail' }) } };
      window.__geometryCompose = openCompose({ fw, store: createStore({ me: { defaultFrom: 'george@example.com', identities: ['george@example.com', 'work@example.com'] } }), logic: {}, icon: name => ui.icon(name), open: {},
        api: { saveDraft: async () => ({ id: 'sample-draft' }) }, outbox: { unsent: () => slot, keepUnsent: f => (slot = f, true), dropUnsent: () => { slot = null; }, track: () => () => {} } },
      { subject: 'A clear subject', text: 'Hello,\n\nA little breathing room for every field.' });
    });
  }
  return { ctx, page, errors };
}
async function screenshot(page, name) {
  if (!process.env.GEOMETRY_ARTIFACTS) return;
  await mkdir(process.env.GEOMETRY_ARTIFACTS, { recursive: true });
  await page.screenshot({ path: resolve(process.env.GEOMETRY_ARTIFACTS, `${name}.png`) });
}
async function noErrors(page, errors) { assert.deepEqual(errors, []); assert.deepEqual(await page.evaluate(() => __rejections), []); }
async function roundedInset(locator) {
  const s = await locator.evaluate(el => { const s = getComputedStyle(el); return { radius: parseFloat(s.borderTopLeftRadius), rightRadius: parseFloat(s.borderTopRightRadius), left: parseFloat(s.paddingLeft), right: parseFloat(s.paddingRight) }; });
  assert.ok(s.radius >= 16 && s.rightRadius >= 16, 'the editing surface keeps rounded corners before and after focus');
  assert.ok(s.left >= 16 && s.right >= 16, 'text keeps a full field inset');
}
async function roundedWindow(locator) {
  const radii = await locator.evaluate(el => { const s = getComputedStyle(el); return ['borderTopLeftRadius', 'borderTopRightRadius', 'borderBottomLeftRadius', 'borderBottomRightRadius'].map(k => parseFloat(s[k])); });
  assert.ok(radii.every(r => r >= 30), 'every sheet corner remains rounded');
}
async function centredIcons(locator) {
  const icons = await locator.evaluateAll(elements => elements.map(el => {
    const icon = el.querySelector('svg'), b = el.getBoundingClientRect(), i = icon?.getBoundingClientRect();
    return { width: b.width, height: b.height, dx: i ? Math.abs(b.x + b.width / 2 - i.x - i.width / 2) : 0, dy: i ? Math.abs(b.y + b.height / 2 - i.y - i.height / 2) : 0 };
  }));
  assert.ok(icons.length > 0);
  for (const icon of icons) { assert.ok(icon.width >= 44 && icon.height >= 44, 'icon controls retain a 44px target'); assert.ok(icon.dx < 1 && icon.dy < 1, 'glyphs stay centred inside their control'); }
}
for (const [width, theme] of [[320, 'dark'], [390, 'dark'], [1440, 'light']]) test(`Hosted Mail editing surfaces keep one rounded focus ring and comfortable insets at ${width}px ${theme}`, async () => {
  const { ctx, page, errors } = await open({ width, theme });
  try {
    const sheet = page.locator('dialog[data-sheet="mail-compose"]'), input = sheet.getByRole('textbox', { name: 'To', exact: true });
    await roundedWindow(sheet);
    const headGap = await sheet.evaluate(el => el.querySelector('.mc-row').getBoundingClientRect().top - el.querySelector('.ifs-head').getBoundingClientRect().bottom);
    assert.ok(headGap >= 12, 'the first field keeps at least 12px below the sheet header');
    await input.fill('friend@example.com');
    const ring = await input.evaluate(el => { const i = getComputedStyle(el), r = getComputedStyle(el.closest('.mc-row')); return { innerOutline: i.outlineStyle, innerShadow: i.boxShadow, radius: parseFloat(r.borderTopLeftRadius), shadow: r.boxShadow, top: r.borderTopColor, bottom: r.borderBottomColor, height: el.getBoundingClientRect().height }; });
    assert.equal(ring.innerOutline, 'none', 'the bare inner input must not draw a second square ring'); assert.equal(ring.innerShadow, 'none');
    assert.ok(ring.radius >= 16 && ring.shadow.includes('inset'), 'the visible focus indicator belongs to the rounded outer field'); assert.equal(ring.top, ring.bottom); assert.ok(ring.height >= 44);
    for (const selector of ['.mc-row[data-k="to"]', '.mc-subject', '.mc-text', '.mc-from']) await roundedInset(sheet.locator(selector));
    await centredIcons(sheet.locator('.mc-tools .ifl-icon-btn'));
    for (const name of ['Cc/Bcc', 'Add Files']) assert.ok((await sheet.locator('.mc-tools').getByRole('button', { name, exact: true }).boundingBox()).height >= 44);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
    await screenshot(page, `hosted-${width}-${theme}`);
    if (width < 600) {
      await page.evaluate(() => __geometryViewport(400)); await sheet.locator('input[aria-label="To"]').focus();
      const fit = await input.evaluate(el => ({ bottom: el.closest('.mc-row').getBoundingClientRect().bottom, sheetBottom: el.closest('dialog').getBoundingClientRect().bottom }));
      assert.ok(fit.bottom <= 400 && fit.sheetBottom <= 400, 'the rounded focused row stays above the keyboard');
      await roundedWindow(sheet);
      await screenshot(page, `hosted-${width}-keyboard`);
    }
    await noErrors(page, errors);
  } finally { await ctx.close(); }
});
for (const [width, theme] of [[320, 'dark'], [390, 'light'], [1440, 'dark']]) test(`Native Mail compose controls keep rounded focus, insets and centred icons at ${width}px ${theme}`, async () => {
  const { ctx, page, errors } = await open({ native: true, width, theme });
  try {
    const sheet = page.locator('.sheet.open'), input = sheet.getByRole('textbox', { name: 'To', exact: true });
    await roundedWindow(sheet);
    await input.fill('friend@example.com');
    const ring = await input.evaluate(el => { const i = getComputedStyle(el), r = getComputedStyle(el.closest('.field')); return { outline: i.outlineStyle, radius: parseFloat(r.borderTopLeftRadius), shadow: r.boxShadow }; });
    assert.equal(ring.outline, 'none'); assert.ok(ring.radius >= 16 && ring.shadow.includes('inset'));
    for (const selector of ['.field[data-k="to"]', '.c-subject', '.compose-text']) await roundedInset(sheet.locator(selector));
    await input.press('Enter');
    await sheet.locator('.token').evaluate(async el => { await Promise.allSettled(el.getAnimations().map(a => a.finished)); });
    assert.ok((await sheet.locator('.token').boundingBox()).height >= 44);
    assert.ok((await sheet.locator('.from-chip').boundingBox()).height >= 44);
    await centredIcons(sheet.locator('.sheet-head .gbtn, .c-tool:not(.c-cc):not([hidden])').filter({ visible: true }));
    const layout = await sheet.evaluate(el => { const a = el.querySelector('.field').getBoundingClientRect(), b = el.querySelector('.c-subject').getBoundingClientRect(), c = el.querySelector('.compose-text').getBoundingClientRect(), d = el.getBoundingClientRect(); return { a: a.x, b: b.x, c: c.x, inset: a.x - d.x, overflow: el.scrollWidth > el.clientWidth + 1 }; });
    assert.equal(layout.a, layout.b); assert.equal(layout.b, layout.c); assert.ok(layout.inset >= 20); assert.equal(layout.overflow, false);
    await screenshot(page, `native-${width}-${theme}`);
    await noErrors(page, errors);
  } finally { await ctx.close(); }
});
