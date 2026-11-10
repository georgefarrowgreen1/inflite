// Real mocked pages: exercise motion ownership without a real account or email delivery.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { createServer } = require('node:http');
const { readFile } = require('node:fs/promises');
const { readFileSync, existsSync } = require('node:fs');
const { resolve, extname } = require('node:path');
const { chromium, webkit } = require('playwright');
const root = resolve(__dirname, '..'), today = resolve(root, 'today/public'), mail = resolve(root, 'email/public');
const fixture = name => JSON.parse(readFileSync(resolve(__dirname, `fixtures/${name}.json`), 'utf8'));
const day = fixture('day');
let browser, todayServer, mailServer, todayOrigin, mailOrigin;
async function serve(base) {
  const server = createServer(async (req, res) => {
    try {
      const pathname = decodeURIComponent(new URL(req.url, 'http://test').pathname), file = resolve(base, '.' + (pathname === '/' ? '/index.html' : pathname));
      if (!file.startsWith(base + '/')) throw new Error('outside public');
      const body = await readFile(file), type = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' }[extname(file)] || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': type }); res.end(body);
    } catch { res.writeHead(404); res.end('Not found'); }
  });
  await new Promise(ok => server.listen(0, '127.0.0.1', ok));
  return server;
}
before(async () => {
  todayServer = await serve(today); mailServer = await serve(mail);
  todayOrigin = `http://127.0.0.1:${todayServer.address().port}`; mailOrigin = `http://127.0.0.1:${mailServer.address().port}`;
  browser = process.env.WEB_UI_BROWSER === 'webkit' ? await webkit.launch() : await chromium.launch({ executablePath: process.env.CHROMIUM || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined), args: ['--no-sandbox'] });
});
after(async () => { await browser?.close(); await Promise.all([todayServer, mailServer].filter(Boolean).map(s => new Promise(ok => s.close(ok)))); });
async function open({ nativeMail = false, width = 390, motion = 'no-preference' } = {}) {
  const origin = nativeMail ? mailOrigin : todayOrigin;
  const ctx = await browser.newContext({ viewport: { width, height: 844 }, reducedMotion: motion, colorScheme: 'light', serviceWorkers: 'block', isMobile: width < 600, hasTouch: width < 600 });
  const page = await ctx.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => { window.__rejections = []; addEventListener('unhandledrejection', e => __rejections.push(String(e.reason))); });
  const view = fixture('session');
  view.links = { ...view.links, account: origin, auth: origin };
  await ctx.route('**/*', route => {
    const u = new URL(route.request().url());
    if (u.origin !== origin) return route.abort();
    if (!u.pathname.startsWith('/api/') && u.pathname !== '/version') return route.continue();
    const api = { '/api/session': view, '/api/boot': { view, cards: day }, '/api/today': day, '/api/hub': { ready: true, roof: true, apps: {} }, '/api/rules': fixture('rules'), '/api/notify': fixture('notify'), '/api/devices': { devices: [], here: [] }, '/version': { build: 'motion-test' } };
    return route.fulfill({ status: api[u.pathname] ? 200 : 404, json: api[u.pathname] || { error: 'Sample response unavailable' } });
  });
  if (!nativeMail) await page.clock.setFixedTime(new Date(day.at));
  await page.goto(origin + (nativeMail ? '/?demo' : '/'));
  await page.locator(nativeMail ? 'button[aria-label="New Message"]' : '#top .day-top').waitFor();
  return { ctx, page, errors };
}
async function settled(locator) { await locator.evaluate(async el => { await Promise.allSettled(el.getAnimations({ subtree: true }).filter(a => Number.isFinite(a.effect.getComputedTiming().endTime)).map(a => a.finished)); }); }
async function noErrors(page, errors) { assert.deepEqual(errors, []); assert.deepEqual(await page.evaluate(() => __rejections), []); }

async function hostedCompose() {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' }), page = await ctx.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => { window.__rejections = []; addEventListener('unhandledrejection', e => __rejections.push(String(e.reason))); });
  await ctx.route('**/*', async route => {
    const u = new URL(route.request().url());
    if (u.origin !== mailOrigin) return route.abort();
    if (u.pathname === '/__compose-test') return route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><body></body></html>' });
    if (u.pathname === '/__compose-ui.js') return route.fulfill({ contentType: 'text/javascript', body: await readFile(resolve(today, 'roof/ui.js')) });
    return route.continue();
  });
  await page.goto(mailOrigin + '/__compose-test');
  await page.evaluate(async () => {
    const ui = await import('/__compose-ui.js'), { openCompose } = await import('/roof/compose.js'), { createStore } = await import('/roof/store.js');
    let slot = null;
    const outbox = window.__composeOutbox = { sends: [], unsent: () => slot, keepUnsent: f => (slot = f, true), dropUnsent: () => { slot = null; }, track: () => () => {}, send: async (f, files) => { outbox.sends.push({ f, files }); return { ok: true }; } };
    const fw = { ui, toast() {}, sheet: { open(spec) {
      const el = ui.el('section', { class: 'ifl-sheet', data: { app: 'mail' } }, spec.body, spec.acts.map(a => ui.btn(a.label, a)));
      document.body.append(el);
      return { el, closed: false, setBusy() {}, close() { this.closed = true; el.remove(); spec.onClose?.(); } };
    } } };
    openCompose({ fw, store: createStore({ me: { defaultFrom: 'me@example.com', identities: ['me@example.com'] } }), logic: {}, icon: () => document.createElement('span'), open: {},
      api: { saveDraft: async () => ({ id: 'sample-draft' }) }, outbox }, { subject: 'Sample note', text: 'Hello' });
  });
  return { ctx, page, errors };
}

test('Today refresh keeps the card stationary and its content readable throughout the stagger', async () => {
  const { ctx, page, errors } = await open();
  try {
    const card = page.locator('.tcard[data-app="markets"]');
    await settled(card);
    const result = await card.evaluate(el => {
      const before = el.getBoundingClientRect(), allowance = el.querySelector('.mk-allow i');
      el.classList.add('in');
      const after = el.getBoundingClientRect(), children = [...el.children].filter(e => !e.matches('.tc-head,.tc-reply'));
      return { before: { x: before.x, y: before.y, width: before.width, height: before.height }, after: { x: after.x, y: after.y, width: after.width, height: after.height },
        cardMoves: el.getAnimations().some(a => a.effect.getKeyframes().some(k => k.transform && k.transform !== 'none')),
        readable: children.every(e => Number(getComputedStyle(e).opacity) >= .8),
        delayed: children.some(e => parseFloat(getComputedStyle(e).animationDelay) > 0),
        allowanceVisible: !allowance || allowance.getBoundingClientRect().width > 4 };
    });
    assert.deepEqual(result.after, result.before, 'refresh must not move the card or change its measured layout');
    assert.equal(result.cardMoves, false);
    assert.equal(result.readable, true, 'a delayed child remains legible');
    assert.equal(result.delayed, true);
    assert.equal(result.allowanceVisible, true, 'a data bar must not reset to zero during a repaint');
    await settled(card);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
    await noErrors(page, errors);
  } finally { await ctx.close(); }
});

test('Today disclosure tolerates rapid keyboard reversal and reduced motion stays still', async () => {
  const { ctx, page, errors } = await open();
  try {
    const details = page.locator('.dt-history'), summary = details.locator('summary');
    const closed = await details.boundingBox();
    await summary.focus(); await page.keyboard.press('Enter');
    assert.equal(await details.getAttribute('open'), '');
    await page.keyboard.press('Enter'); await page.keyboard.press('Enter');
    await settled(details);
    assert.ok((await details.boundingBox()).height > closed.height + 2);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await summary.focus(); await page.keyboard.press('Enter');
    await settled(details);
    assert.equal(await details.getAttribute('open'), null);
    const still = await details.boundingBox();
    assert.ok(Math.abs(still.height - closed.height) < 1, 'closing restores the original disclosure height');
    assert.equal(await summary.evaluate(el => el === document.activeElement), true);
    await page.locator('.tcard[data-app="markets"]').evaluate(el => el.classList.add('in'));
    assert.equal(await page.locator('.tcard.in').evaluate(el => el.getAnimations({ subtree: true }).some(a => a.effect.getComputedTiming().activeDuration > 1)), false);
    await noErrors(page, errors);
  } finally { await ctx.close(); }
});

for (const width of [390, 1440]) test(`Mail composer close completion belongs to the old sheet at ${width}px`, async () => {
  const { ctx, page, errors } = await open({ nativeMail: true, width });
  try {
    const newMessage = page.getByRole('button', { name: 'New Message', exact: true });
    await newMessage.click();
    const first = page.locator('.sheet.open'); await first.waitFor(); await settled(first);
    await page.evaluate(() => {
      const old = window.__oldSheet = document.querySelector('.sheet.open');
      old.querySelector('button[aria-label="Close"]').click();
      old.getAnimations().forEach(a => a.pause());
      document.querySelector('button[aria-label="New Message"]').click();
    });
    await page.locator('.sheet.open').waitFor();
    const result = await page.evaluate(() => {
      const old = __oldSheet, current = document.querySelector('.sheet.open');
      const noTap = getComputedStyle(old).pointerEvents === 'none';
      old.querySelector('.sheet-head').dispatchEvent(new TransitionEvent('transitionend', { bubbles: true, propertyName: 'transform' }));
      const descendantIgnored = old.isConnected;
      old.dispatchEvent(new TransitionEvent('transitionend', { propertyName: 'transform' }));
      return { noTap, descendantIgnored, oldRemoved: !old.isConnected, currentAlive: current?.isConnected && current.classList.contains('open'),
        inert: document.getElementById('app').inert, open: document.body.classList.contains('sheet-open'), focused: current?.contains(document.activeElement), sheets: document.querySelectorAll('.sheet').length };
    });
    assert.deepEqual(result, { noTap: true, descendantIgnored: true, oldRemoved: true, currentAlive: true, inert: true, open: true, focused: true, sheets: 1 });
    await noErrors(page, errors);
  } finally { await ctx.close(); }
});

test('Mail press feedback contracts gently and sending settles without a full-screen fly-off', async () => {
  const { ctx, page, errors } = await open({ nativeMail: true });
  try {
    const button = page.getByRole('button', { name: 'New Message', exact: true });
    await button.hover(); await page.mouse.down(); await page.waitForTimeout(120);
    const scale = await button.evaluate(el => new DOMMatrix(getComputedStyle(el).transform).a);
    assert.ok(scale > .9 && scale < 1, 'the control should contract gently, without enlarging under the finger');
    await page.mouse.up();
    const sheet = page.locator('.sheet.open'); await sheet.waitFor(); await settled(sheet);
    await sheet.locator('.field input').first().fill('friend@example.com'); await sheet.locator('.field input').first().press('Enter');
    await sheet.locator('.c-subject').fill('A small note'); await sheet.locator('.compose-text').fill('Tomorrow works for me.');
    // Capture the short-lived sending sheet in the same click task as the app.
    // A later automation evaluation can legitimately receive a detached node.
    await sheet.evaluate(el => {
      const send = el.querySelector('button[aria-label="Send"]');
      send.addEventListener('click', () => { window.__sendStart = el.getBoundingClientRect().y; }, { capture: true, once: true });
      send.addEventListener('click', () => {
        window.__sendingSheet = el;
        for (const a of el.getAnimations()) { a.pause(); a.currentTime = Number(a.effect.getTiming().duration) * .9; }
        window.__sendingFrame = { before: __sendStart, connected: el.isConnected, sending: el.classList.contains('sending'), y: el.getBoundingClientRect().y,
          scale: new DOMMatrix(getComputedStyle(el).transform).a, pointer: getComputedStyle(el).pointerEvents };
      }, { once: true });
    });
    await sheet.getByRole('button', { name: 'Send', exact: true }).click();
    const frame = await page.evaluate(() => __sendingFrame);
    assert.equal(frame.connected, true, 'sample the sending state before its legitimate removal');
    assert.equal(frame.sending, true);
    assert.ok(Math.abs(frame.y - frame.before) < 32, 'sending should settle near its original position');
    assert.ok(frame.scale >= .98);
    assert.equal(frame.pointer, 'none');
    await page.evaluate(() => __sendingSheet.dispatchEvent(new TransitionEvent('transitionend', { propertyName: 'transform' })));
    await page.locator('.sheet.sending').waitFor({ state: 'detached' });
    await noErrors(page, errors);
  } finally { await ctx.close(); }
});

test('Mail reduced motion removes the composer immediately and stops indefinite spinners', async () => {
  const { ctx, page, errors } = await open({ nativeMail: true, motion: 'reduce' });
  try {
    const newMessage = page.getByRole('button', { name: 'New Message', exact: true });
    await newMessage.hover(); await page.mouse.down();
    assert.equal(await newMessage.evaluate(el => getComputedStyle(el).transform), 'none');
    await page.mouse.up();
    const sheet = page.locator('.sheet.open'); await sheet.waitFor();
    await sheet.getByRole('button', { name: 'Close', exact: true }).click();
    assert.equal(await page.locator('.sheet').count(), 0, 'reduced motion must not leave an invisible closing sheet');
    assert.equal(await page.locator('#app').evaluate(el => el.inert), false);
    const moving = await page.evaluate(() => {
      const spinner = document.createElement('div'); spinner.className = 'spinner'; document.body.append(spinner);
      const active = spinner.getAnimations().length; spinner.remove(); return active;
    });
    assert.equal(moving, 0);
    await noErrors(page, errors);
  } finally { await ctx.close(); }
});

for (const width of [390, 1440]) test(`Mail recipients retain keyboard focus and existing chips through edits at ${width}px`, async () => {
  const { ctx, page, errors } = await open({ nativeMail: true, width });
  try {
    await page.getByRole('button', { name: 'New Message', exact: true }).click();
    const sheet = page.locator('.sheet.open'), input = sheet.getByRole('textbox', { name: 'To', exact: true });
    await sheet.waitFor(); await settled(sheet);
    await input.fill('one@example.com'); await input.press('Enter');
    assert.equal(await input.evaluate(el => el === document.activeElement), true, 'Return keeps the recipient keyboard active');
    await settled(sheet);
    await sheet.locator('.token').first().evaluate(el => { window.__firstRecipient = el; });
    await input.fill('two@example.com'); await input.press('Enter');
    assert.deepEqual(await input.evaluate(el => ({ focused: el === document.activeElement, same: __firstRecipient === el.parentNode.querySelector('.token'), replaying: __firstRecipient.getAnimations().length > 0 })), { focused: true, same: true, replaying: false });
    await sheet.locator('.c-subject').focus();
    await sheet.locator('.field[data-k="to"] > label').click();
    assert.equal(await sheet.locator('.token').count(), 2, 'tapping the To label keeps every recipient');
    assert.equal(await input.evaluate(el => el === document.activeElement), true);
    await input.press('Backspace');
    assert.equal(await sheet.locator('.token').count(), 1);
    assert.equal(await input.evaluate(el => el === document.activeElement), true);
    await input.fill('two@example.com'); await input.press('Enter');
    await sheet.locator('.token[title="one@example.com"]').click();
    await page.getByRole('menuitem', { name: 'Remove', exact: true }).click();
    assert.equal(await sheet.locator('.token').getAttribute('title'), 'two@example.com', 'removal follows current recipient identity');
    assert.equal(await input.evaluate(el => el === document.activeElement), true);
    await sheet.getByRole('button', { name: 'Cc/Bcc', exact: true }).click();
    const cc = sheet.getByRole('textbox', { name: 'Cc', exact: true });
    await cc.fill('partial');
    const toggled = await cc.evaluate(el => {
      const button = el.closest('.sheet').querySelector('.c-cc');
      button.click(); button.click();
      return { same: el.isConnected, value: el.value, focused: document.activeElement === el };
    });
    assert.deepEqual(toggled, { same: true, value: 'partial', focused: true }, 'rapid Cc/Bcc reversal preserves the field and partial address');
    await sheet.getByRole('button', { name: 'Cc/Bcc', exact: true }).click();
    assert.equal(await sheet.locator('.c-subject').evaluate(el => el === document.activeElement), true, 'hiding a focused recipient row returns focus to the subject');
    await noErrors(page, errors);
  } finally { await ctx.close(); }
});

test('Hosted Mail recipients keep focus and identity while preserving ordered duplicate recipients and send validation', async () => {
  const { ctx, page, errors } = await hostedCompose();
  try {
    const input = page.getByRole('textbox', { name: 'To', exact: true });
    await input.fill('one@example.com'); await input.press('Enter');
    assert.equal(await input.evaluate(el => el === document.activeElement), true);
    await page.locator('.mc-chip').first().evaluate(el => { window.__firstRecipient = el; });
    for (const address of ['two@example.com', 'one@example.com']) { await input.fill(address); await input.press('Enter'); }
    assert.equal(await page.locator('.mc-chip').first().evaluate(el => el === __firstRecipient), true);
    await page.getByRole('textbox', { name: 'Subject', exact: true }).focus();
    await page.locator('.mc-row[data-k="to"] > .mc-k').click();
    assert.equal(await page.locator('.mc-chip').count(), 3, 'tapping the To label keeps every recipient');
    assert.equal(await input.evaluate(el => el === document.activeElement), true);
    await page.getByRole('button', { name: 'Remove one@example.com', exact: true }).first().click();
    assert.equal(await input.evaluate(el => el === document.activeElement), true);
    assert.deepEqual(await page.locator('.mc-chip').allTextContents(), ['two@example.com', 'one@example.com']);
    await input.fill('invalid-address'); await input.press('Enter');
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    assert.equal(await page.evaluate(() => __composeOutbox.sends.length), 0, 'invalid addresses still prevent sending');
    await page.getByRole('button', { name: 'Remove invalid-address', exact: true }).click();
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    assert.deepEqual(await page.evaluate(() => __composeOutbox.sends.map(s => s.f.to.map(p => p.email))), [['two@example.com', 'one@example.com']]);
    await noErrors(page, errors);
  } finally { await ctx.close(); }
});
