// Real browser checks against the checked-out UI. All account responses are sample
// fixtures; cross-origin requests are blocked and no real account is involved.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { createServer } = require('node:http');
const { readFile, mkdir } = require('node:fs/promises');
const { existsSync } = require('node:fs');
const { resolve, extname } = require('node:path');
const { chromium } = require('playwright');

const publicDir = resolve(__dirname, '../today/public');
const fixture = (name) => require(`./fixtures/${name}.json`);
const day = fixture('day');
let browser, server, origin;
before(async () => {
  server = createServer(async (req, res) => {
    try {
      const path = decodeURIComponent(new URL(req.url, 'http://test').pathname);
      const file = resolve(publicDir, '.' + (path === '/' ? '/index.html' : path));
      if (!file.startsWith(publicDir + '/')) throw new Error('outside public');
      const body = await readFile(file);
      const type = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.svg': 'image/svg+xml', '.png': 'image/png' }[extname(file)] || 'application/octet-stream';
      const headers = { 'Content-Type': type };
      if (extname(file) === '.html') {
        const policy = await readFile(resolve(publicDir, '_headers'), 'utf8');
        headers['Content-Security-Policy'] = /Content-Security-Policy: (.*)/.exec(policy)[1];
      }
      res.writeHead(200, headers); res.end(body);
    } catch { res.writeHead(404); res.end('Not found'); }
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  origin = `http://127.0.0.1:${server.address().port}`;
  const executablePath = process.env.CHROMIUM || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined);
  browser = await chromium.launch({ executablePath, args: ['--no-sandbox'] });
});
after(async () => { await browser?.close(); await new Promise(r => server ? server.close(r) : r()); });

async function open({ width = 390, scheme = 'light', answer = day, signedIn = true } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height: 844 }, colorScheme: scheme, reducedMotion: 'reduce',
    locale: 'en-GB', timezoneId: 'Europe/London', serviceWorkers: 'block', hasTouch: width < 600, isMobile: width < 600 });
  const requests = [], errors = [];
  const view = structuredClone(fixture('session'));
  view.links = { ...view.links, account: origin, auth: origin };
  await ctx.route('**/*', async route => {
    const req = route.request(), url = new URL(req.url());
    if (url.origin !== origin) return route.abort();
    if (url.pathname === '/version') return route.fulfill({ json: { build: '1.81' } });
    if (!url.pathname.startsWith('/api/')) return route.continue();
    requests.push({ path: url.pathname, method: req.method(), body: req.postDataJSON() });
    const api = { '/api/session': signedIn ? view : { signedIn: false }, '/api/boot': { view, cards: answer },
      '/api/today': answer, '/api/hub': { ready: true, roof: true, apps: { weather: false, fitness: false, markets: false, chats: false, mail: false } },
      '/api/rules': fixture('rules'), '/api/notify': fixture('notify'), '/api/devices': { devices: [], here: [] },
      '/api/act/undo': { act: { state: 'undone' }, said: 'Change undone.' } };
    return route.fulfill({ status: api[url.pathname] ? 200 : 404, json: api[url.pathname] || { error: 'Sample response unavailable' } });
  });
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => {
    window.__csp = [];
    document.addEventListener('securitypolicyviolation', e => window.__csp.push(`${e.violatedDirective}: ${e.blockedURI}`));
  });
  await page.clock.setFixedTime(new Date(answer.at));
  await page.goto(origin);
  await page.locator(signedIn ? '#top .day-top' : '#out:not([hidden]) #signin').waitFor();
  return { ctx, page, requests, errors };
}
async function save(page, name) {
  const out = process.env.WEB_UI_SCREENSHOTS;
  if (!out) return;
  await mkdir(out, { recursive: true });
  await page.screenshot({ path: `${out}/sample-${name}.png`, fullPage: true });
}

test('changes are keyboard-accessible; Undo keeps the original request and open state', async () => {
  const { ctx, page, requests, errors } = await open();
  try {
    const history = page.locator('.dt-history'), summary = history.locator('summary');
    assert.equal(await history.evaluate(e => e.open), false);
    assert.equal(await page.getByRole('button', { name: 'Undo the Move', exact: true }).isVisible(), false);
    await summary.focus(); await page.keyboard.press('Enter');
    assert.equal(await history.evaluate(e => e.open), true);
    await page.evaluate(async () => {
      const { drawDay } = await import('/day.js'), answer = await (await fetch('/api/today')).json();
      drawDay(document.querySelector('#today'), answer, { now: answer.at, timers: false });
    });
    assert.equal(await history.evaluate(e => e.open), true, 'refresh keeps the disclosure open');
    assert.equal(await summary.evaluate(e => e === document.activeElement), true, 'refresh keeps keyboard focus');
    await page.getByRole('button', { name: 'Undo the Move', exact: true }).click();
    await page.waitForFunction(() => !document.querySelector('[data-do="undo"]:disabled'));
    const writes = requests.filter(r => r.method !== 'GET');
    assert.equal(writes.length, 1);
    assert.equal(writes[0].path, '/api/act/undo');
    assert.deepEqual(writes[0].body, { id: day.tops.morning.buttons[0].id });
    assert.equal(await history.evaluate(e => e.open), true, 'Undo does not close the history');
    assert.deepEqual(errors, []);
  } finally { await ctx.close(); }
});

test('offers stay visible before opening history; ride guidance stays expanded', async () => {
  const answer = structuredClone(day), top = answer.tops.morning;
  const offer = { ...top.buttons[0], do: 'take', label: 'Accept suggestion' };
  top.buttons.push(offer);
  answer.acts = answer.acts.map(a => a.id === offer.id ? { ...a, state: 'offered' } : a);
  const { ctx, page, requests } = await open({ answer });
  try {
    assert.equal(await page.getByRole('button', { name: 'Accept suggestion' }).isVisible(), true);
    assert.equal(requests.some(r => r.method !== 'GET'), false, 'viewing a suggestion never accepts it');
    await page.evaluate(async () => {
      const { drawDay } = await import('/day.js'), answer = await (await fetch('/api/today')).json();
      answer.tops.morning.kind = 'ride';
      drawDay(document.querySelector('#today'), answer, { now: answer.at, timers: false });
    });
    assert.equal(await page.locator('.dt-history').count(), 0);
    assert.equal(await page.locator('#top .dt-rows li').count(), top.lines.length);
  } finally { await ctx.close(); }
});

test('Today, Apps and You fit phone and desktop widths in both themes', async () => {
  for (const width of [320, 390, 1440]) for (const scheme of ['light', 'dark']) {
    const { ctx, page, errors } = await open({ width, scheme });
    try {
      const first = await page.locator('#coming .dc-row').first().boundingBox();
      // Coming Up's first event is available in the initial phone viewport.
      if (width === 390) assert.ok(first && first.y < 700, `first event at ${first?.y}`);
      for (const screen of ['today', 'apps', 'you']) {
        if (screen !== 'today') {
          await page.evaluate(screen => { location.hash = screen; }, screen);
          await page.locator(`#${screen}:not([hidden])`).waitFor();
        }
        if (screen === 'you') {
          await page.locator('#youQuiet').waitFor();
          assert.match(await page.locator('#youPhoneRow').innerText(), /On This Device/);
          assert.equal(await page.locator('#youQuiet').getAttribute('role'), 'switch');
        }
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, `${width}/${scheme}/${screen} overflows`);
        await save(page, `${width}-${scheme}-${screen}`);
      }
      assert.deepEqual(errors, []);
      assert.deepEqual(await page.evaluate(() => window.__csp), [], 'production CSP permits all UI resources');
    } finally { await ctx.close(); }
  }
});

test('a second touch cancels section swiping instead of navigating during pinch zoom', async () => {
  const { ctx, page } = await open();
  try {
    const result = await page.evaluate(async () => {
      const { swipes } = await import('/swipe.js');
      const root = document.querySelector('#today'); root.dataset.app = 'weather';
      root.innerHTML = '<div role="tabpanel"><section data-sec="now"><p id="gesture-target">Now</p></section><section data-sec="days">Days</section></div>';
      document.querySelector('#hd').innerHTML = '<button role="tab" data-sec="now">Now</button><button role="tab" data-sec="days">Days</button>';
      const calls = [], off = swipes({ route: { kind: 'app', app: 'weather', section: 'now' }, nav: { section: (...args) => calls.push(args) } });
      const target = document.querySelector('#gesture-target');
      const fire = (name, x, id = 1, primary = true) => target.dispatchEvent(new PointerEvent(name, {
        bubbles: true, pointerType: 'touch', pointerId: id, isPrimary: primary, clientX: x, clientY: 300,
      }));
      fire('pointerdown', 270); fire('pointermove', 100);
      const started = document.documentElement.classList.contains('ifl-swiping');
      fire('pointerdown', 230, 2, false); fire('pointerup', 100);
      await new Promise(r => setTimeout(r, 450)); off(); return { calls, started };
    });
    assert.equal(result.started, true, 'the gesture started a section preview');
    assert.deepEqual(result.calls, []);
  } finally { await ctx.close(); }
});

test('zoom is permitted and control variants share sizes, focus and disabled states', async () => {
  const { ctx, page } = await open({ signedIn: false });
  try {
    const viewport = await page.locator('meta[name=viewport]').getAttribute('content');
    assert.doesNotMatch(viewport, /maximum-scale|user-scalable\s*=\s*no/);
    const controls = await page.evaluate(async () => {
      const { btn, sw } = await import('/roof/ui.js');
      const host = document.querySelector('#out'), pill = document.createElement('button');
      pill.className = 'pill'; pill.textContent = 'Card action';
      const button = btn('Module action'), disabled = btn('Disabled'), toggle = sw(false, () => {}, { label: 'Sample setting' });
      disabled.disabled = true; host.append(pill, button, disabled, toggle);
      const style = e => { const c = getComputedStyle(e); return { h: c.minHeight, radius: c.borderRadius, font: c.fontSize }; };
      button.focus();
      return { pill: style(pill), button: style(button), disabled: getComputedStyle(disabled).opacity,
        outline: getComputedStyle(button).outlineStyle, touch: getComputedStyle(document.documentElement).touchAction };
    });
    assert.deepEqual(controls.pill, controls.button);
    assert.equal(controls.button.h, '44px'); assert.equal(controls.disabled, '0.5');
    assert.equal(controls.outline, 'solid'); assert.match(controls.touch, /manipulation|pinch-zoom|auto/);
    const input = page.getByRole('switch', { name: 'Sample setting' });
    await input.focus(); await page.keyboard.press('Space'); assert.equal(await input.isChecked(), true);
  } finally { await ctx.close(); }
});
