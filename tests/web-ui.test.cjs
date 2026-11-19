// Real browser checks against the checked-out UI. All account responses are sample
// fixtures; cross-origin requests are blocked and no real account is involved.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { createServer } = require('node:http');
const { readFile, mkdir } = require('node:fs/promises');
const { existsSync, readFileSync } = require('node:fs');
const { resolve, extname } = require('node:path');
const { chromium, webkit } = require('playwright');

const publicDir = resolve(process.env.WEB_UI_PUBLIC || resolve(__dirname, '../today/public'));
const fixture = (name) => require(`./fixtures/${name}.json`);
const day = fixture('day');
const build = /const BUILD = "([\d.]+)"/.exec(readFileSync(resolve(publicDir, 'app.js'), 'utf8'))[1];
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
  browser = process.env.WEB_UI_BROWSER === 'webkit' ? await webkit.launch() : await chromium.launch({ executablePath, args: ['--no-sandbox'] });
});
after(async () => { await browser?.close(); await new Promise(r => server ? server.close(r) : r()); });

for (const width of [390, 1440]) for (const noViewTransitions of [false, true]) {
  test(`motion: rapid tabs and history settle on one usable page at ${width}px (${noViewTransitions ? 'CSS fallback' : 'View Transitions'})`, async () => {
    const { ctx, page, errors } = await open({ width, motion: 'no-preference', noViewTransitions });
    try {
      await page.evaluate(() => {
        for (const tab of ['apps', 'you', 'today', 'you', 'apps', 'today', 'apps']) document.querySelector(`#tabs [data-tab="${tab}"]`).click();
      });
      await page.waitForFunction(() => document.documentElement.dataset.route === '/#apps' && !document.querySelector('#apps').hidden);
      await page.waitForFunction(() => !document.documentElement.dataset.vt && !document.querySelector('.ifl-screen[class*="ifl-enter-"]'));
      assert.equal(await page.locator('#apps [data-app-row="weather"]').isVisible(), true);
      assert.equal(await page.locator('#views > :is(main,[role=main]):not([hidden])').count(), 1);
      await page.goBack();
      await page.waitForFunction(() => document.documentElement.dataset.route === '/' && !document.querySelector('#today').hidden);
      await page.goForward();
      await page.waitForFunction(() => document.documentElement.dataset.route === '/#apps' && !document.querySelector('#apps').hidden);
      await page.waitForFunction(() => !document.documentElement.dataset.vt && !document.querySelector('.ifl-screen[class*="ifl-enter-"]'));
      const boxes = await page.evaluate(() => {
        const nav = document.querySelector('#tabs').getBoundingClientRect(), current = document.querySelector('#tabs [aria-current]').getBoundingClientRect();
        return { fits: nav.top >= 0 && nav.bottom <= innerHeight && current.top >= 0 && current.bottom <= innerHeight, overflow: document.documentElement.scrollWidth > innerWidth + 1 };
      });
      assert.deepEqual(boxes, { fits: true, overflow: false });
      await save(page, `motion-apps-${width}-${noViewTransitions ? 'fallback' : 'native'}`);
      assert.deepEqual(errors, []);
      assert.deepEqual(await page.evaluate(() => [window.__csp, window.__rejections]), [[], []]);
    } finally { await ctx.close(); }
  });
}

for (const width of [390, 1440]) {
  test(`motion: sheets spring back, cancel safely, restore nested pages and release focus at ${width}px`, async () => {
    const { ctx, page, errors } = await open({ width, motion: 'no-preference', iphoneViewport: width === 390 });
    try {
      await page.locator('#hd .ifh-me').focus();
      await page.evaluate(async () => {
        const { createSheets } = await import('/roof/sheet.js');
        const { el } = await import('/roof/ui.js');
        const sheets = window.__motionSheets = createSheets({});
        const h = window.__motionSheet = sheets.open({ title: 'Motion check', body: el('button', { type: 'button', text: 'Original action' }) });
      });
      const sheet = page.locator('dialog[open]');
      await sheet.evaluate(async d => { await Promise.allSettled(d.getAnimations().map(a => a.finished)); });
      const before = await sheet.boundingBox();
      const head = await sheet.locator('.ifs-head').boundingBox();
      const x = head.x + head.width / 2, y = head.y + 18;
      await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x, y + 24, { steps: 4 });
      await page.waitForTimeout(150); await page.mouse.up();
      await page.waitForTimeout(450);
      const after = await sheet.boundingBox();
      assert.ok(Math.abs(before.y - after.y) < 1, 'short drag springs back to its original position');
      await page.evaluate(() => {
        const d = __motionSheet.el, head = d.querySelector('.ifs-head');
        head.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 71, clientY: 100, isPrimary: true }));
        dispatchEvent(new PointerEvent('pointermove', { pointerId: 72, clientY: 300 }));
      });
      assert.equal(await sheet.evaluate(d => d.style.getPropertyValue('--drag')), '', 'another pointer cannot move the sheet');
      await page.evaluate(() => {
        dispatchEvent(new PointerEvent('pointermove', { pointerId: 71, clientY: 280 }));
        dispatchEvent(new PointerEvent('pointercancel', { pointerId: 71 }));
      });
      await page.waitForTimeout(450);
      assert.equal(await sheet.count(), 1, 'pointer cancellation returns the sheet without dismissing it');
      await page.evaluate(() => __motionSheet.push({ page: 'details', title: 'Details', body: document.createTextNode('Nested content') }));
      await page.locator('dialog [data-back]').click();
      assert.equal(await sheet.getByRole('button', { name: 'Original action' }).isVisible(), true);
      if (width === 390) {
        await page.evaluate(() => {
          const input = document.createElement('input'); __motionSheet.body.append(input); input.focus(); __viewport(360, 48, 'resume');
        });
        await page.waitForFunction(() => {
          const r = document.querySelector('dialog[open]').getBoundingClientRect();
          return r.top >= 48 && r.bottom <= 408;
        });
        await page.evaluate(() => { document.activeElement.blur(); __viewport(844, 0, 'resume'); });
      }
      await page.keyboard.press('Escape');
      await sheet.waitFor({ state: 'detached' });
      await page.evaluate(() => dispatchEvent(new PointerEvent('pointermove', { pointerId: 71, clientY: 600 })));
      assert.equal(await page.locator('body.sheet-up').count(), 0);
      assert.equal(await page.locator('#hd .ifh-me').evaluate(e => e === document.activeElement), true);
      assert.deepEqual(errors, []);
      assert.deepEqual(await page.evaluate(() => [window.__csp, window.__rejections]), [[], []]);
    } finally { await ctx.close(); }
  });
}

for (const width of [390, 1440]) test(`motion: nested sheet height follows content and reverses without a pixel lock at ${width}px`, async () => {
  const { ctx, page, errors } = await open({ width, motion: 'no-preference' });
  try {
    await page.evaluate(async () => {
      const { createSheets } = await import('/roof/sheet.js'), { el } = await import('/roof/ui.js');
      window.__sizeSheets = createSheets({});
      window.__sizeSheet = __sizeSheets.open({ title: 'Height check', body: el('button', { type: 'button', text: 'Original action' }), acts: [{ label: 'Done' }] });
      window.__heightMotion = () => __sizeSheet.el.getAnimations().find(a => a.effect.getKeyframes().some(k => 'height' in k));
      window.__pushTall = () => __sizeSheet.push({ page: 'tall', title: 'Expanded details', body: el('div', { class: 'size-copy' }, ...Array.from({ length: 6 }, (_, i) => el('p', { text: `Expanded section ${i + 1}` }))), acts: [{ label: 'Continue' }] });
    });
    const sheet = page.locator('dialog[open]');
    await sheet.evaluate(async d => { await Promise.allSettled(d.getAnimations().map(a => a.finished)); });
    const short = (await sheet.boundingBox()).height;
    const growing = await page.evaluate(() => {
      __pushTall(); const a = __heightMotion();
      if (!a) return null;
      a.pause(); a.currentTime = a.effect.getTiming().duration / 2;
      return { height: __sizeSheet.el.getBoundingClientRect().height, target: parseFloat(a.effect.getKeyframes().at(-1).height), fill: a.effect.getTiming().fill, inline: __sizeSheet.el.style.height };
    });
    assert.ok(growing, 'expanding real content creates a finite height morph');
    assert.ok(growing.target > short + 80 && growing.height > short && growing.height < growing.target, 'the intermediate sheet height lies between its short and tall content');
    assert.ok(['auto', 'none'].includes(growing.fill), 'the WAAPI effect has no retained fill'); assert.equal(growing.inline, '');
    await page.evaluate(async () => { const a = __heightMotion(); a.finish(); await a.finished; });
    const tall = (await sheet.boundingBox()).height;
    assert.ok(Math.abs(tall - growing.target) < 1.5, 'completion returns to the intrinsic tall height');
    const intrinsic = await sheet.evaluate(d => {
      const before = d.offsetHeight, extra = document.createElement('p'); extra.textContent = 'Content added after the transition';
      d.querySelector('.size-copy').append(extra); const after = d.offsetHeight; extra.remove();
      return { before, after, inline: d.style.height };
    });
    assert.ok(intrinsic.after > intrinsic.before + 10, 'new content can still grow the completed sheet'); assert.equal(intrinsic.inline, '');
    const reversed = await page.evaluate(() => {
      __sizeSheet.pop(); const shrinking = __heightMotion(); shrinking.pause(); shrinking.currentTime = shrinking.effect.getTiming().duration / 2;
      const before = __sizeSheet.el.getBoundingClientRect().height;
      __pushTall(); const growing = __heightMotion(); growing.pause(); growing.currentTime = 0;
      return { before, after: __sizeSheet.el.getBoundingClientRect().height, running: __sizeSheet.el.getAnimations().filter(a => a.effect.getKeyframes().some(k => 'height' in k)).length };
    });
    assert.ok(Math.abs(reversed.before - reversed.after) < 1.5, 'reversing starts from the current visual height'); assert.equal(reversed.running, 1, 'the earlier height morph is cancelled');
    await page.evaluate(async () => { const a = __heightMotion(); a.finish(); await a.finished; __sizeSheet.pop(); const back = __heightMotion(); back.finish(); await back.finished; });
    assert.ok(Math.abs((await sheet.boundingBox()).height - short) < 1.5, 'popping returns to the original natural height');
    assert.equal(await sheet.getByRole('button', { name: 'Original action' }).isVisible(), true);
    assert.equal(await sheet.evaluate(d => d.style.height), '');
    await page.keyboard.press('Escape'); await sheet.waitFor({ state: 'detached' });
    assert.deepEqual(errors, []); assert.deepEqual(await page.evaluate(() => [__csp, __rejections]), [[], []]);
  } finally { await ctx.close(); }
});

test('motion: sheet height releases for keyboard, resize, hidden, reduced motion, drag and close', async () => {
  const { ctx, page, errors } = await open({ motion: 'no-preference', iphoneViewport: true });
  try {
    await page.evaluate(async () => {
      const { createSheets } = await import('/roof/sheet.js'), { el } = await import('/roof/ui.js');
      let hidden = false;
      Object.defineProperties(document, { hidden: { configurable: true, get: () => hidden }, visibilityState: { configurable: true, get: () => hidden ? 'hidden' : 'visible' } });
      window.__sizeHidden = v => { hidden = v; document.dispatchEvent(new Event('visibilitychange')); };
      window.__openSizeSheet = () => {
        const sheets = createSheets({});
        window.__cancelSizeSheet = sheets.open({ title: 'Height cancellation', body: el('p', { text: 'Short content' }), acts: [{ label: 'Done' }] });
        window.__cancelHeight = () => __cancelSizeSheet.el.getAnimations().find(a => a.effect.getKeyframes().some(k => 'height' in k));
        window.__expandSizeSheet = () => __cancelSizeSheet.push({ page: 'long', title: 'Longer content', body: el('div', { class: 'cancel-copy' }, ...Array.from({ length: 6 }, (_, i) => el('p', { text: `Longer section ${i + 1}` })), el('input', { 'aria-label': 'Height test field' })), acts: [{ label: 'Continue' }] });
      };
    });
    for (const reason of ['keyboard', 'resize', 'hidden', 'reduced', 'drag', 'close']) {
      await page.emulateMedia({ reducedMotion: 'no-preference' });
      await page.setViewportSize({ width: 390, height: 844 });
      await page.evaluate(() => { __sizeHidden(false); __viewport(844); __openSizeSheet(); });
      const sheet = page.locator('dialog[open]');
      await sheet.evaluate(async d => { await Promise.allSettled(d.getAnimations().map(a => a.finished)); });
      assert.equal(await page.evaluate(() => { __expandSizeSheet(); const a = __cancelHeight(); if (!a) return false; a.pause(); a.currentTime = 80; return true; }), true, `${reason}: a height morph started`);
      if (reason === 'keyboard') { await sheet.getByRole('textbox', { name: 'Height test field' }).focus(); await page.evaluate(() => __viewport(480)); }
      if (reason === 'resize') { await page.setViewportSize({ width: 420, height: 780 }); await page.evaluate(() => __viewport(780)); }
      if (reason === 'hidden') await page.evaluate(() => __sizeHidden(true));
      if (reason === 'reduced') await page.emulateMedia({ reducedMotion: 'reduce' });
      if (reason === 'drag') await page.evaluate(() => {
        __cancelSizeSheet.el.querySelector('.ifs-head').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 91, clientY: 100, isPrimary: true }));
        dispatchEvent(new PointerEvent('pointermove', { pointerId: 91, clientY: 124 })); dispatchEvent(new PointerEvent('pointercancel', { pointerId: 91 }));
      });
      if (reason === 'close') assert.equal(await page.evaluate(() => { __cancelSizeSheet.close(); return !!__cancelHeight(); }), false, 'closing cancels the height effect immediately');
      await page.waitForFunction(() => !__cancelHeight());
      assert.equal(await page.evaluate(() => __cancelSizeSheet.el.style.height), '', `${reason}: no retained inline height`);
      if (reason === 'keyboard' || reason === 'resize') { const rect = await sheet.boundingBox(), foot = reason === 'keyboard' ? 480 : 780; assert.ok(rect.y >= 0 && rect.y + rect.height <= foot + 1, `${reason}: the sheet fits the changed viewport`); }
      if (reason === 'close') await sheet.waitFor({ state: 'detached' });
      else {
        await page.setViewportSize({ width: 390, height: 844 });
        await page.evaluate(() => { __sizeHidden(false); document.activeElement?.blur(); __viewport(844); });
        const flow = await sheet.evaluate(d => {
          const before = d.offsetHeight, extra = document.createElement('p'); extra.textContent = 'More content still participates in layout';
          d.querySelector('.cancel-copy').append(extra); const after = d.offsetHeight; extra.remove();
          return { before, after, open: d.open };
        });
        assert.ok(flow.open && flow.after > flow.before + 10, `${reason}: the released sheet follows its content`);
        await page.evaluate(() => __cancelSizeSheet.now());
      }
      await page.waitForFunction(() => !document.body.classList.contains('sheet-up') && !document.body.classList.contains('kb-up'));
    }
    assert.deepEqual(errors, []); assert.deepEqual(await page.evaluate(() => [__csp, __rejections]), [[], []]);
  } finally { await ctx.close(); }
});

test('motion: opening Search flushes pending route snapshots before the dialog and retains focus against late callbacks', async () => {
  const { ctx, page, errors } = await open({ motion: 'no-preference' });
  try {
    await page.evaluate(() => {
      window.__modalSnapshots = [];
      document.startViewTransition = update => {
        let finish, ready;
        const finished = new Promise(ok => { finish = ok; }), pending = new Promise(ok => { ready = ok; });
        const task = { update, finish: () => { ready(); finish(); }, skipped: false }; __modalSnapshots.push(task);
        return { ready: pending, updateCallbackDone: finished, finished, skipTransition: () => { task.skipped = true; } };
      };
      const show = HTMLDialogElement.prototype.showModal;
      HTMLDialogElement.prototype.showModal = function () {
        window.__beforeModal = { route: document.documentElement.dataset.route, motion: document.documentElement.dataset.vt || '', youVisible: !document.querySelector('#you').hidden, skipped: __modalSnapshots.every(t => t.skipped) };
        return show.call(this);
      };
      for (const tab of ['apps', 'you']) document.querySelector(`#tabs [data-tab="${tab}"]`).click();
    });
    assert.equal(await page.evaluate(() => document.querySelector('#you').hidden), true, 'the current route snapshot is still pending');
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    const search = page.getByRole('combobox', { name: 'Search everything', exact: true }); await search.waitFor();
    assert.deepEqual(await page.evaluate(() => __beforeModal), { route: '/#settings', motion: '', youVisible: true, skipped: true }, 'the latest route is rendered and snapshots are skipped before native dialog open');
    await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === 'Search everything');
    await page.evaluate(async () => {
      for (const task of [...__modalSnapshots].reverse()) { task.update(); task.finish(); }
      await Promise.resolve(); await Promise.resolve();
    });
    assert.equal(await page.evaluate(() => document.documentElement.dataset.route), '/#settings');
    assert.equal(await page.locator('#you').isVisible(), true);
    assert.equal(await search.evaluate(e => e === document.activeElement), true, 'late updates and completion cannot steal dialog focus');
    assert.equal(await page.evaluate(() => document.documentElement.dataset.vt || ''), '');
    await page.keyboard.press('Escape'); await page.locator('dialog[open]').waitFor({ state: 'detached' });
    assert.equal(await page.evaluate(() => document.documentElement.dataset.route), '/#settings');
    assert.deepEqual(errors, []); assert.deepEqual(await page.evaluate(() => [__csp, __rejections]), [[], []]);
  } finally { await ctx.close(); }
});

for (const width of [390, 1440]) test(`motion: nested sheet Back restores its scroll and invoking control at ${width}px`, async () => {
  const { ctx, page, errors } = await open({ width, motion: 'no-preference' });
  try {
    await page.evaluate(async () => {
      const { createSheets } = await import('/roof/sheet.js'), { el } = await import('/roof/ui.js');
      const body = el('div', {}, ...Array.from({ length: 30 }, (_, i) => el('p', { text: `Settings row ${i}` })));
      const button = el('button', { type: 'button', text: 'Open details' }); body.append(button);
      window.__nested = createSheets({}).open({ title: 'Settings', body });
      __nested.el.scrollTop = 280; button.focus({ preventScroll: true });
      window.__parentPosition = __nested.el.scrollTop;
      __nested.push({ page: 'details', title: 'Details', body: el('p', { text: 'Details content' }) });
    });
    const sheet = page.getByRole('dialog', { name: 'Details', exact: true });
    assert.equal(await sheet.evaluate(d => d.scrollTop), 0, 'a nested page starts at its heading');
    await sheet.locator('[data-back]').click();
    await page.waitForFunction(() => document.activeElement?.textContent === 'Open details');
    assert.ok(await page.evaluate(() => Math.abs(__nested.el.scrollTop - __parentPosition) < 2), 'Back restores the original settings position');
    await page.keyboard.press('Escape'); await sheet.waitFor({ state: 'detached' });
    assert.deepEqual(errors, []); assert.deepEqual(await page.evaluate(() => [__csp, __rejections]), [[], []]);
  } finally { await ctx.close(); }
});

test('motion: closed sheet handles cannot change a reused dialog', async () => {
  const { ctx, page, errors } = await open();
  try {
    const result = await page.evaluate(async () => {
      const { createSheets } = await import('/roof/sheet.js'), { el } = await import('/roof/ui.js');
      const sheets = createSheets({}), first = sheets.open({ title: 'Settings', body: el('p', { text: 'Original' }) });
      const dialog = first.el; first.now();
      const second = sheets.openEl(dialog);
      first.push({ page: 'old', title: 'Stale', body: el('p', { text: 'Old content' }) });
      first.setBusy(true); first.pop();
      const unchanged = dialog.querySelector('h2').textContent === 'Settings' && !dialog.hasAttribute('aria-busy') && !dialog.querySelector('.ifs-page');
      second.push({ page: 'current', title: 'Current', body: el('p', { text: 'Current content' }) });
      const usable = dialog.querySelector('h2').textContent === 'Current'; second.now(); dialog.remove();
      return { unchanged, usable };
    });
    assert.deepEqual(result, { unchanged: true, usable: true });
    assert.deepEqual(errors, []); assert.deepEqual(await page.evaluate(() => [__csp, __rejections]), [[], []]);
  } finally { await ctx.close(); }
});

test('motion: cancelled Home Screen edge gestures never navigate a later touch', async () => {
  const { ctx, page, errors } = await open({ iosHomeScreen: true, motion: 'no-preference' });
  try {
    await page.locator('#tabs [data-tab="apps"]').click();
    await page.waitForFunction(() => document.documentElement.dataset.route === '/#apps' && !document.querySelector('#apps').hidden);
    for (const reason of ['touchcancel', 'resize', 'blur']) {
      await page.evaluate(reason => {
        const touch = (type, x) => { const e = new Event(type, { bubbles: true }); Object.defineProperties(e, { touches: { value: [{ clientX: x, clientY: 160 }] }, changedTouches: { value: [{ clientX: x, clientY: 160 }] } }); document.dispatchEvent(e); };
        touch('touchstart', 5); (reason === 'touchcancel' ? document : window).dispatchEvent(new Event(reason)); touch('touchend', 180);
      }, reason);
      await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
      assert.equal(await page.evaluate(() => document.documentElement.dataset.route), '/#apps', `${reason} releases the abandoned edge gesture`);
    }
    await page.evaluate(() => {
      const touch = (type, x) => { const e = new Event(type, { bubbles: true }); Object.defineProperties(e, { touches: { value: [{ clientX: x, clientY: 160 }] }, changedTouches: { value: [{ clientX: x, clientY: 160 }] } }); document.dispatchEvent(e); };
      touch('touchstart', 5); touch('touchend', 180);
    });
    await page.waitForFunction(() => document.documentElement.dataset.route === '/');
    assert.deepEqual(errors, []); assert.deepEqual(await page.evaluate(() => [__csp, __rejections]), [[], []]);
  } finally { await ctx.close(); }
});

test('motion: horizontal gestures and viewport changes cancel sheet dismissal safely', async () => {
  const { ctx, page, errors } = await open({ motion: 'no-preference', iphoneViewport: true });
  try {
    await page.evaluate(async () => {
      const { createSheets } = await import('/roof/sheet.js');
      window.__gesture = createSheets({}).open({ title: 'Gesture check' });
      window.__drag = (id, x, y, type, head = false) => (head ? __gesture.el.querySelector('.ifs-head') : window).dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: id, clientX: x, clientY: y, isPrimary: true }));
      __drag(1, 100, 100, 'pointerdown', true); __drag(1, 300, 180, 'pointermove'); __drag(1, 300, 320, 'pointerup');
    });
    const sheet = page.getByRole('dialog', { name: 'Gesture check' });
    assert.equal(await sheet.evaluate(d => d.classList.contains('closing')), false, 'a horizontal swipe does not dismiss a sheet');
    await page.evaluate(() => {
      __drag(2, 100, 100, 'pointerdown', true); __drag(2, 100, 280, 'pointermove'); __viewport(480); __drag(2, 100, 320, 'pointerup');
    });
    assert.deepEqual(await sheet.evaluate(d => [d.classList.contains('closing'), d.classList.contains('dragging'), d.style.getPropertyValue('--drag')]), [false, false, ''], 'keyboard/viewport changes release the gesture');
    await page.keyboard.press('Escape'); await sheet.waitFor({ state: 'detached' });
    assert.deepEqual(errors, []); assert.deepEqual(await page.evaluate(() => [__csp, __rejections]), [[], []]);
  } finally { await ctx.close(); }
});

test('motion: reduced motion removes spatial feedback and decorative loops pause in the background', async () => {
  const { ctx, page, errors } = await open({ motion: 'no-preference' });
  try {
    const indicator = page.locator('#kept');
    await indicator.evaluate(el => {
      el.hidden = false;
      el.setAttribute('data-refreshing', '');
    });
    const sweep = prop => indicator.evaluate((el, prop) => getComputedStyle(el, '::after')[prop], prop);
    assert.equal(await sweep('animationName'), 'day-refresh-sweep');
    await page.evaluate(() => {
      let hidden = false;
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => hidden ? 'hidden' : 'visible' });
      window.__motionHidden = (value, notify = true) => { hidden = value; if (notify) document.dispatchEvent(new Event('visibilitychange')); };
      __motionHidden(true);
    });
    assert.equal(await sweep('animationPlayState'), 'paused');
    await page.evaluate(() => { __motionHidden(false, false); dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })); });
    assert.equal(await sweep('animationPlayState'), 'running');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    assert.equal(await sweep('animationName'), 'none');
    await page.locator('#tabs [data-tab="apps"]').click();
    await page.waitForFunction(() => !document.querySelector('#apps').hidden && !document.documentElement.dataset.vt);
    await page.locator('.apps-shortcut').first().hover(); await page.mouse.down();
    assert.equal(await page.locator('.apps-shortcut').first().evaluate(e => getComputedStyle(e).transform), 'none');
    await page.mouse.move(0, 0); await page.mouse.up();
    assert.deepEqual(errors, []);
    assert.deepEqual(await page.evaluate(() => window.__rejections), []);
  } finally { await ctx.close(); }
});

test('motion: late snapshot callbacks cannot restore an old route or clear a newer transition', async () => {
  const { ctx, page, errors } = await open({ motion: 'no-preference' });
  try {
    await page.evaluate(() => {
      window.__snapshots = [];
      document.startViewTransition = update => {
        let finish;
        const finished = new Promise(ok => { finish = ok; });
        const task = { update, finish, skipped: false };
        __snapshots.push(task);
        return { ready: Promise.reject(new DOMException('Snapshot cancelled', 'AbortError')), updateCallbackDone: finished, finished, skipTransition: () => { task.skipped = true; } };
      };
      for (const tab of ['apps', 'you', 'apps']) document.querySelector(`#tabs [data-tab="${tab}"]`).click();
      __snapshots[2].update();
      __snapshots[0].update(); __snapshots[1].update();
      __snapshots[0].finish(); __snapshots[1].finish();
    });
    await page.waitForFunction(() => !document.querySelector('#apps').hidden);
    assert.deepEqual(await page.evaluate(() => ({ title: document.querySelector('#hd h1').textContent, route: document.documentElement.dataset.route, motion: document.documentElement.dataset.vt, skipped: __snapshots.slice(0, 2).every(t => t.skipped) })),
      { title: 'Apps', route: '/#apps', motion: 'tab', skipped: true });
    await page.evaluate(() => __snapshots[2].finish());
    await page.waitForFunction(() => !document.documentElement.dataset.vt);
    assert.deepEqual(errors, []);
    assert.deepEqual(await page.evaluate(() => window.__rejections), []);
  } finally { await ctx.close(); }
});

test('motion: cancelled and interrupted notification swipes never clear a row', async () => {
  const { ctx, page, errors } = await open({ motion: 'no-preference' });
  try {
    await page.evaluate(async () => {
      const ui = await import('/roof/ui.js'), { createSheets } = await import('/roof/sheet.js'), { draw } = await import('/bell.js');
      window.__cleared = 0; window.__opened = 0;
      const box = ui.el('div');
      window.__noticeSheet = createSheets({}).open({ title: 'Notifications', body: box });
      draw(box, [{ id: 'motion-note', app: 'weather', title: 'Rain later', body: 'A sample notification', at: Date.now() }], { ui, open() { ++__opened; }, clear() { ++__cleared; } });
      window.__noticeDrag = (id, end) => {
        const card = box.querySelector('.ifl-nt-card');
        card.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: id, clientX: 30, clientY: 100, isPrimary: true }));
        dispatchEvent(new PointerEvent('pointermove', { pointerId: id, clientX: 300, clientY: 100 }));
        if (end === 'blur') dispatchEvent(new Event('blur'));
        else if (end) dispatchEvent(new PointerEvent(end, { pointerId: id }));
      };
      __noticeDrag(1, 'pointercancel');
    });
    assert.equal(await page.evaluate(() => __cleared), 0);
    assert.equal(await page.locator('.ifl-nt-card').evaluate(e => e.style.getPropertyValue('--dx')), '0px');
    await page.evaluate(() => __noticeDrag(2, 'blur'));
    assert.equal(await page.evaluate(() => __cleared), 0);
    await page.locator('.ifl-nt-main').focus(); await page.keyboard.press('Enter');
    assert.equal(await page.evaluate(() => __opened), 1, 'keyboard activation still works after an interrupted swipe');
    await page.evaluate(() => __noticeDrag(3, 'pointerup'));
    assert.equal(await page.evaluate(() => __cleared), 1, 'a deliberate swipe still clears the notification');
    await page.evaluate(() => { __noticeDrag(4); __noticeSheet.now(); dispatchEvent(new PointerEvent('pointerup', { pointerId: 4 })); });
    assert.equal(await page.evaluate(() => __cleared), 1, 'closing the sheet during a drag never clears anything');
    assert.deepEqual(errors, []);
    assert.deepEqual(await page.evaluate(() => window.__rejections), []);
  } finally { await ctx.close(); }
});

for (const width of [390, 1440]) test(`Today account control uses the saved profile photo and retains its initial fallback at ${width}px`, async () => {
  const t = await open({ width, initialPath: '/?os=1', intercept: async (route, { url }) => {
    if (url.pathname !== '/api/avatar') return false;
    await route.fulfill({ contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNQmHDgPwAEtAJwv2DoAwAAAABJRU5ErkJggg==', 'base64') }); return true;
  } });
  try {
    const account = t.page.locator('.ws-account'), photo = account.locator('img');
    await photo.waitFor(); await photo.evaluate(n => n.decode());
    const url = new URL(await photo.getAttribute('src'), t.page.url());
    assert.equal(url.pathname, '/api/avatar'); assert.equal(url.searchParams.get('id'), fixture('session').user.id); assert.equal(url.searchParams.get('v'), String(fixture('session').user.photoAt));
    const image = await photo.boundingBox(), circle = await account.locator('.ifl-avatar').boundingBox();
    assert.deepEqual(image, circle, 'the photo fills the existing circular avatar');
    await account.click(); await t.page.locator('.ifm-layer.open').waitFor();
    await t.page.keyboard.press('Escape'); await t.page.locator('.ifm-layer.open').waitFor({ state: 'detached' });
    await photo.evaluate(n => n.dispatchEvent(new Event('error')));
    assert.equal(await account.locator('img').count(), 0); assert.equal(await account.locator('.ifl-avatar').textContent(), 'A');
    assert.deepEqual(t.errors, []); assert.deepEqual(await t.page.evaluate(() => [__csp, __rejections]), [[], []]);
  } finally { await t.ctx.close(); }
  const fallback = await open({ width, initialPath: '/?os=1', user: { photoAt: null } });
  try {
    await fallback.page.locator('.ws-account .ifl-avatar').waitFor();
    assert.equal(await fallback.page.locator('.ws-account img').count(), 0);
    assert.equal(await fallback.page.locator('.ws-account .ifl-avatar').textContent(), 'A');
    assert.deepEqual(fallback.errors, []);
  } finally { await fallback.ctx.close(); }
});

async function open({ width = 390, scheme = 'light', answer = day, signedIn = true, preferences, intercept, initialPath = '/', waitForDay = true, waitForReady = true, legacyShell = false, seedSession, seedCards, seedHub, blockBootstrap = false, user, viewApps, hubApps = {}, serviceWorkers = 'block', iosHomeScreen = false, iphoneViewport = false, motion = 'reduce', noViewTransitions = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height: 844 }, colorScheme: scheme, reducedMotion: motion,
    locale: 'en-GB', timezoneId: 'Europe/London', serviceWorkers, hasTouch: width < 600, isMobile: width < 600 });
  if (noViewTransitions) await ctx.addInitScript(() => { delete Document.prototype.startViewTransition; });
  if (iphoneViewport) await ctx.addInitScript(() => {
    const v = Object.assign(new EventTarget(), { height: 844, width: 390, offsetTop: 0, scale: 1 });
    Object.defineProperty(window, 'visualViewport', { configurable: true, value: v });
    Object.defineProperties(screen, { width: { get: () => 390 }, height: { get: () => 844 } });
    window.__viewport = (height, offsetTop = 0, event = 'resize') => {
      Object.assign(v, { height, offsetTop });
      if (event === 'resume') dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
      else v.dispatchEvent(new Event(event));
    };
  });
  if (iosHomeScreen) await ctx.addInitScript(() => {
    // iOS can report a short layout height even while fixed elements use the full viewport.
    let shortBy = 54;
    Object.defineProperty(navigator, 'standalone', { configurable: true, get: () => true });
    Object.defineProperty(window, 'innerHeight', { configurable: true, get: () => Math.round(visualViewport.height) - shortBy });
    const height = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight').get;
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, get() {
      if (this.style.cssText.includes('safe-area-inset-top') && this.style.visibility === 'hidden') return 47;
      return height.call(this);
    } });
    window.__homeScreenHeight = n => { shortBy = n; dispatchEvent(new Event('resize')); };
  });
  const requests = [], errors = [];
  const view = structuredClone(fixture('session'));
  if (user) view.user = { ...view.user, ...user };
  if (viewApps) view.apps = viewApps;
  if (preferences) view.prefs = preferences;
  view.links = { ...view.links, account: origin, auth: origin };
  if (seedSession) await ctx.addInitScript(view => {if(window===window.top)localStorage.setItem('today:session', JSON.stringify({ id: view.user.id, at: Date.now(), view }));}, seedSession);
  if (seedCards) await ctx.addInitScript(({id,answer}) => {if(window===window.top)localStorage.setItem('today:cards:'+id,JSON.stringify({id,at:Date.now(),answer}));},seedCards);
  if (seedHub) await ctx.addInitScript(values => { for (const [key, value] of Object.entries(values)) sessionStorage.setItem(key, value); }, seedHub);
  await ctx.route('**/*', async route => {
    const req = route.request(), url = new URL(req.url());
    if (url.origin !== origin) return route.abort();
    if (legacyShell && url.pathname === '/') {
      let html = (await readFile(resolve(publicDir, 'index.html'), 'utf8')).replace('id="out" aria-label="InFlite" hidden', 'id="out" aria-label="InFlite"');
      if (legacyShell !== 'overlap') html = html.replace(/<main[^>]*id="sessionState"[\s\S]*?<\/main>/, '');
      const policy = await readFile(resolve(publicDir, '_headers'), 'utf8');
      return route.fulfill({ body: html, headers: { 'Content-Type': 'text/html', 'Content-Security-Policy': /Content-Security-Policy: (.*)/.exec(policy)[1] } });
    }
    if (url.pathname === '/version') return route.fulfill({ json: { build } });
    if (blockBootstrap && url.pathname === '/app.js') return route.abort();
    if (!url.pathname.startsWith('/api/')) return route.continue();
    requests.push({ path: url.pathname, method: req.method(), body: req.postDataJSON() });
    if (intercept && await intercept(route, { url, request: req, view, answer })) return;
    const api = { '/api/session': signedIn ? view : { signedIn: false }, '/api/boot': { view, cards: answer },
      '/api/today': answer, '/api/hub': { ready: true, roof: true, apps: { weather: false, fitness: false, markets: false, chats: false, mail: false, ...hubApps } },
      '/api/rules': fixture('rules'), '/api/notify': fixture('notify'), '/api/devices': { devices: [], here: [] },
      '/api/act/undo': { act: { state: 'undone' }, said: 'Change undone.' } };
    return route.fulfill({ status: api[url.pathname] ? 200 : 404, json: api[url.pathname] || { error: 'Sample response unavailable' } });
  });
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => {
    window.__csp = [];
    window.__rejections = [];
    addEventListener('unhandledrejection', e => window.__rejections.push(String(e.reason)));
    document.addEventListener('securitypolicyviolation', e => window.__csp.push(`${e.violatedDirective}: ${e.blockedURI}`));
  });
  await page.clock.setFixedTime(new Date(answer.at));
  // WebKit can include startup fetches in its load event. Tests that hold the
  // session response must observe the page before that event to release it.
  await page.goto(origin + initialPath, { waitUntil: waitForReady ? 'load' : 'commit' });
  if (waitForReady) await page.locator(signedIn ? (waitForDay ? '#top .day-top' : '#in:not([hidden])') : '#out:not([hidden]) #signin').waitFor();
  if (waitForReady && signedIn && waitForDay && process.env.WEB_UI_BROWSER === 'webkit') {
    await page.waitForLoadState('networkidle'); await page.bringToFront();
    // Activate WebKit's page before testing hardware-keyboard focus.
    await page.mouse.click(1, 1);
  }
  return { ctx, page, requests, errors };
}

for (const width of [390, 1440]) for (const tab of ['apps', 'you']) {
  test(`cold /#${tab} startup renders its requested screen at ${width}px`, async () => {
    const { ctx, page, errors } = await open({ width, initialPath: `/#${tab}`, waitForDay: false });
    try {
      await page.bringToFront();
      const content = tab === 'apps' ? '#apps [data-app-row="weather"]' : '#youAcct';
      await page.locator(content).waitFor({ timeout: 5000 });
      await page.waitForFunction(title => document.querySelector('#hd h1')?.innerText.trim() === title, tab === 'apps' ? 'Apps' : 'Settings', { timeout: 5000 });
      assert.equal(await page.locator(content).isVisible(), true);
      assert.equal((await page.locator('#hd h1').innerText()).trim(), tab === 'apps' ? 'Apps' : 'Settings');
      assert.equal(await page.locator('#views > :is(main,[role=main]):not([hidden])').count(), 1);
      assert.equal(await page.locator(`#tabs [data-tab="${tab}"]`).getAttribute('aria-current'), 'page');
      assert.equal(await page.evaluate(() => document.documentElement.dataset.route), `/#${tab}`);
      if (tab === 'apps') assert.equal(await page.locator('#apps .apps-shortcut').count(), 3);
      else await page.getByRole('searchbox', { name: 'Search settings' }).waitFor({ timeout: 5000 });
      assert.deepEqual(errors, []);
      assert.deepEqual(await page.evaluate(() => [window.__csp, window.__rejections]), [[], []]);
    } finally { await ctx.close(); }
  });
}

for (const width of [390, 1440]) {
  test(`cold /#you=quiet startup survives delayed settings at ${width}px`, async () => {
    let release;
    const held = new Promise(resolve => { release = resolve; });
    const { ctx, page, requests, errors } = await open({
      width, initialPath: '/#you=quiet', waitForDay: false, waitForReady: false,
      intercept: async (route, { url }) => {
        if (url.pathname === '/api/notify') await held;
      },
    });
    try {
      await page.bringToFront();
      await page.getByRole('heading', {name:'Settings',exact:true}).waitFor({ timeout: 5000 });
      await page.locator('[data-group="notifications"]').waitFor({ timeout: 5000 });
      assert.equal(await page.locator('#youQuiet').count(), 0, 'the screen renders before its delayed settings answer');
      release(); await page.locator('#youQuiet').waitFor({ timeout: 5000 });
      assert.equal(await page.locator('#youQuiet').isVisible(), true);
      assert.equal(await page.locator('#youQuiet').getAttribute('role'), 'switch');
      assert.equal(await page.evaluate(() => document.documentElement.dataset.route), '/#you=quiet');
      assert.equal(await page.locator('#views > :is(main,[role=main]):not([hidden])').count(), 1);
      assert.ok(requests.some(r => r.path === '/api/notify'));
      if (width >= 1100) assert.equal(await page.locator('.settings-category[data-category="notifications"]').getAttribute('aria-current'), 'page');
      assert.deepEqual(errors, []);
      assert.deepEqual(await page.evaluate(() => [window.__csp, window.__rejections]), [[], []]);
    } finally { release(); await ctx.close(); }
  });
}

for (const width of [320, 390, 1440]) test(`Today presents one next action and keeps other details reachable at ${width}px`, async () => {
  const answer = structuredClone(day), first = 'offer-one', second = 'offer-two';
  answer.acts = [{ id: first, state: 'offered' }, { id: second, state: 'offered' }];
  answer.tops.morning = { kind: 'plan', title: 'Your day, joined up', chip: 'A suggestion',
    stats: [{ label: 'Weather', value: 'Dry' }],
    lines: ['Today: dry all day.', 'Long ride has no time yet.', 'Long ride today · best 12:00–14:00.', 'London shut today.'],
    buttons: [{ do: 'take', id: first, label: 'Ride Then' }, { do: 'take', id: second, label: 'Add Thursday’s Ride' }] };
  const { ctx, page, errors } = await open({ width, answer });
  try {
    assert.equal(await page.locator('.day-top > .tc-foot .primary').count(), 1);
    assert.match(await page.locator('.day-top > .dt-rows').innerText(), /best 12:00–14:00.*not scheduled/s);
    assert.equal(await page.getByRole('button', { name: 'Add Thursday’s Ride', exact: true }).isVisible(), false);
    await page.locator('.dt-history summary').click();
    assert.equal(await page.getByRole('button', { name: 'Add Thursday’s Ride', exact: true }).isVisible(), true);
    assert.match(await page.locator('.dt-history').innerText(), /London shut today/);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
    await save(page, `next-action-${width}`);
    assert.deepEqual(errors, []);
    assert.deepEqual(await page.evaluate(() => window.__csp), []);
  } finally { await ctx.close(); }
});
async function save(page, name) {
  const out = process.env.WEB_UI_SCREENSHOTS;
  // Playwright's WebKit screenshots inject a dummy stylesheet to sync animations.
  // Preserve the real CSP checks; Chromium supplies the sample preview artifacts.
  if (!out || process.env.WEB_UI_BROWSER === 'webkit') return;
  await mkdir(out, { recursive: true });
  // WebKit's default caret hiding injects a style element, which the app's CSP
  // correctly rejects. Keep the caret as drawn when taking a sample preview.
  await page.screenshot({ path: `${out}/sample-${name}.png`, fullPage: true, caret: 'initial' });
}

async function settleLayout(page) {
  await page.locator('#today.today-packed').waitFor();
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(resolve)))));
  // Native ResizeObserver notifications and the browser's resize event can arrive
  // after Playwright's clock-backed animation frames. Wait for the measured heights.
  await page.waitForFunction(() => [...document.querySelectorAll('#top, #side > section, #rest > .tcard')]
    .filter(e => e.getClientRects().length && e.offsetHeight)
    .every(e => Number(e.style.getPropertyValue('--tile-rows')) === Math.ceil((e.offsetHeight + 20) / 4)));
}
async function tileBoxes(page) {
  return page.evaluate(() => [...document.querySelectorAll('#top, #side > section, #rest > .tcard')]
    .filter(e => e.getClientRects().length && e.offsetHeight).map(e => {
      const r = e.getBoundingClientRect(); return { id: e.id || e.dataset.app, x: r.x, y: r.y, w: r.width, h: r.height };
    }));
}
function assertPacked(boxes) {
  for (let i = 0; i < boxes.length; i++) {
    if (i) assert.ok(boxes[i].y >= boxes[i - 1].y - 1, `${boxes[i].id} stays in reading order`);
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i], b = boxes[j];
      const overlap = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > 1 && Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > 1;
      assert.equal(overlap, false, `${a.id} overlaps ${b.id}`);
    }
  }
}

test('desktop tiles use two to four columns and fill gaps beneath shorter cards', async () => {
  const { ctx, page, errors } = await open({ width: 1440, scheme: 'dark' });
  try {
    for (const [width, columns] of [[1100, 2], [1280, 2], [1440, 3], [1920, 4], [2560, 4]]) {
      await page.setViewportSize({ width, height: 1000 }); await settleLayout(page);
      await page.waitForFunction(n => Number(document.querySelector('#today').style.getPropertyValue('--today-columns')) === n, columns);
      assert.equal(await page.locator('#today').evaluate(e => Number(e.style.getPropertyValue('--today-columns'))), columns);
      const boxes = await tileBoxes(page); assertPacked(boxes);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
      if (width === 1440) {
        const fitness = boxes.find(b => b.id === 'fitness'), markets = boxes.find(b => b.id === 'markets');
        assert.ok(markets.y < fitness.y + fitness.h, 'Markets fills available space beside Fitness');
        assert.ok(Math.max(...boxes.map(b => b.y + b.h)) < 1300, 'the sample day makes use of all three columns');
      }
      await save(page, `desktop-${width}-packed`);
    }
    assert.deepEqual(errors, []);
    assert.deepEqual(await page.evaluate(() => window.__csp), []);
  } finally { await ctx.close(); }
});

test('packing updates for expanding history, new card content and returning from other screens', async () => {
  const { ctx, page, errors } = await open({ width: 1440 });
  try {
    await settleLayout(page);
    const summary = page.locator('.dt-history > summary'); await summary.scrollIntoViewIfNeeded(); await summary.focus(); await page.keyboard.press('Enter');
    await settleLayout(page); assertPacked(await tileBoxes(page));
    assert.equal(await summary.evaluate(e => e === document.activeElement), true);
    const weatherHeight = (await tileBoxes(page)).find(b => b.id === 'weather').h;
    await page.evaluate(async () => {
      const { drawDay } = await import('/day.js'), answer = await (await fetch('/api/today')).json();
      answer.cards.weather.lead = 'A longer update to check that loaded content can change the height of a tile without covering the next one. '.repeat(4);
      drawDay(document.querySelector('#today'), answer, { now: answer.at, timers: false });
    });
    await settleLayout(page); assertPacked(await tileBoxes(page));
    assert.ok((await tileBoxes(page)).find(b => b.id === 'weather').h > weatherHeight + 120, 'new content really changed the card height');
    assert.equal(await page.locator('.dt-history').evaluate(e => e.open), true);
    await page.evaluate(() => { location.hash = 'apps'; }); await page.locator('#apps:not([hidden])').waitFor();
    await page.setViewportSize({ width: 1920, height: 1000 });
    await page.evaluate(() => { location.hash = ''; }); await settleLayout(page);
    assertPacked(await tileBoxes(page));
    assert.equal(await page.locator('#today').evaluate(e => e.style.getPropertyValue('--today-columns')), '4');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForFunction(() => !document.querySelector('#today').classList.contains('today-packed'));
    // The breakpoint clears packing before child ResizeObservers and the return
    // transition finish. Check the final phone layout, as the desktop checks do.
    await page.evaluate(async () => {
      await Promise.allSettled(document.getAnimations().filter(a => a.effect?.getTiming().iterations !== Infinity).map(a => a.finished));
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    });
    assert.equal(await page.locator('#rest').evaluate(e => getComputedStyle(e).display), 'grid');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
    assert.deepEqual(errors, []);
  } finally { await ctx.close(); }
});

test('hidden cards and a changed card order are respected without a sidebar', async () => {
  const answer = structuredClone(day); answer.upcoming = []; answer.waiting = [];
  const order = ['fitness', 'markets', 'chat', 'weather'];
  const { ctx, page } = await open({ width: 1920, answer, preferences: { order, hidden: ['chat'] } });
  try {
    await settleLayout(page);
    const boxes = await tileBoxes(page); assertPacked(boxes);
    assert.deepEqual(boxes.filter(b => b.id !== 'top').map(b => b.id), ['fitness', 'markets', 'weather']);
    assert.equal(await page.locator('#today').evaluate(e => e.style.getPropertyValue('--today-columns')), '4');
    await save(page, 'desktop-no-sidebar');
  } finally { await ctx.close(); }
});

test('changes are keyboard-accessible; Undo keeps the original request and open state', async () => {
  const { ctx, page, requests, errors } = await open();
  try {
    const history = page.locator('.dt-history'), summary = history.locator('summary');
    assert.equal(await history.evaluate(e => e.open), false);
    assert.equal(await page.getByRole('button', { name: 'Undo the Move', exact: true }).isVisible(), false);
    await summary.scrollIntoViewIfNeeded(); await summary.focus(); await page.keyboard.press('Enter');
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
        if (screen === 'today' && width >= 1100) await settleLayout(page);
        if (screen === 'apps') await page.locator('#apps .apps-list .ifl-row').first().waitFor();
        if (screen === 'you') {
          await page.locator('[data-category=notifications]').click();
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

test('page zoom is blocked and control variants share sizes, focus and disabled states', async () => {
  const { ctx, page } = await open({ signedIn: false });
  try {
    const viewport = await page.locator('meta[name=viewport]').getAttribute('content');
    assert.match(viewport, /maximum-scale=1/);
    assert.match(viewport, /user-scalable=no/);
    const zoomEvents = await page.evaluate(() => ['gesturestart', 'gesturechange', 'gestureend'].map(type => {
      const event = new Event(type, { bubbles: true, cancelable: true });
      return document.dispatchEvent(event);
    }));
    assert.deepEqual(zoomEvents, [false, false, false], 'the shared early guard cancels browser pinch gestures');
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
    assert.equal(controls.outline, 'solid'); assert.equal(controls.touch, 'pan-x pan-y');
    const input = page.getByRole('switch', { name: 'Sample setting' });
    await input.focus(); await page.keyboard.press('Space'); assert.equal(await input.isChecked(), true);
  } finally { await ctx.close(); }
});

test('visibility and push refreshes share a pending Today request', async () => {
  let hold = false, count = 0, release, observed;
  const seen = new Promise(r => observed = r), gate = new Promise(r => release = r);
  const { ctx, page, errors } = await open({ intercept: async (route, { url, answer }) => {
    if (url.pathname !== '/api/today' || !hold) return false;
    count++; observed(); await gate; await route.fulfill({ json: answer }); return true;
  } });
  try {
    hold = true;
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange'))); await seen;
    await page.evaluate(() => navigator.serviceWorker.dispatchEvent(new MessageEvent('message', { data: { inflight: 'sync' } })));
    await page.clock.runFor(1600);
    assert.equal(count, 1, 'both refresh paths join the same transport');
    release(); await page.waitForResponse(r => new URL(r.url()).pathname === '/api/today');
    assert.equal(await page.locator('#in').isVisible(), true); assert.deepEqual(errors, []);
  } finally { release(); await ctx.close(); }
});

test('slow cold and returning starts never reveal sign-in before the session answers', async () => {
  for (const returning of [false, true]) {
    let release, observed;
    const gate = new Promise(r => release = r), seen = new Promise(r => observed = r);
    const { ctx, page, errors } = await open({ waitForReady: false, seedSession: returning ? fixture('session') : undefined,
      intercept: async (route, { url, view, answer }) => {
        if (url.pathname !== '/api/session') return false;
        observed(); await gate; await route.fulfill({ json: view }); return true;
      } });
    try {
      await seen; await page.waitForTimeout(4500);
      assert.equal(await page.locator('#sessionSaid').isVisible(), true);
      assert.equal(await page.locator('#sessionRetry').isVisible(), false, 'an active session check has no retry control');
      assert.equal(await page.locator('#signin').isVisible(), false, 'the four-second fallback must not show login');
      release(); await page.locator('#top .day-top').waitFor();
      assert.equal(await page.locator('#sessionSaid').isVisible(), false);
      assert.equal(await page.locator('#out').isVisible(), false);
      assert.deepEqual(errors, []);
    } finally { release(); await ctx.close(); }
  }
});

test('an unavailable or malformed startup session offers Retry and recovers without sign-in', async () => {
  for (const failure of ['network', 'server', 'malformed']) {
    let fail = true;
    const { ctx, page, errors } = await open({ waitForReady: false, intercept: async (route, { url }) => {
      if (url.pathname !== '/api/session' || !fail) return false;
      fail = false;
      if (failure === 'network') await route.abort();
      else await route.fulfill({ status: failure === 'server' ? 503 : 200, json: failure === 'server' ? { error: 'Connection unavailable' } : {} });
      return true;
    } });
    try {
      await page.locator('#sessionState #sessionRetry:not([hidden])').waitFor();
      assert.equal(await page.locator('#signin').isVisible(), false);
      assert.equal(await page.locator('#in').isVisible(), false, 'unknown sessions do not expose cached account content');
      await page.locator('#sessionRetry').click();
      await page.locator('#top .day-top').waitFor();
      assert.equal(await page.locator('#out').isVisible(), false);
      assert.deepEqual(errors, []);
    } finally { await ctx.close(); }
  }
});

test('desktop sign-in replaces the opening screen and fits a short window', async () => {
  let release, observed;
  const gate = new Promise(r => release = r), seen = new Promise(r => observed = r);
  const {ctx, page, errors} = await open({width:1440, waitForReady:false, legacyShell:'overlap', signedIn:false,
    intercept:async (route, {url}) => {
      if (url.pathname !== '/api/session') return false;
      observed(); await gate;
      await route.fulfill({json:{signedIn:false}});
      return true;
    }});
  try {
    await seen;
    await page.getByText('Still connecting…').waitFor();
    assert.equal(await page.locator('#out').isVisible(), false);
    assert.equal(await page.locator('#sessionState').isVisible(), true);
    release();
    const title = page.getByRole('heading', {name:'Sign in to InFlite'});
    await title.waitFor();
    assert.equal(await page.locator('#sessionState').isVisible(), false);
    for (const viewport of [{width:1440,height:844}, {width:1024,height:440}]) {
      await page.setViewportSize(viewport);
      const entry = await page.locator('#out .ifl-entry').boundingBox();
      const logo = await page.locator('#out .ifl-logo').boundingBox();
      const label = await title.boundingBox();
      const signIn = await page.locator('#signin').boundingBox();
      assert.ok(logo.y + logo.height <= label.y && label.y + label.height <= signIn.y);
      assert.ok(entry.y >= 0 && entry.y + entry.height <= viewport.height);
      assert.ok(Math.abs(entry.x + entry.width / 2 - viewport.width / 2) < 2);
    }
    assert.deepEqual(errors, []);
  } finally { release(); await ctx.close(); }
});

test('secondary 401s and worker sign-out hints keep the current screen until the session is confirmed', async () => {
  let verifying = false, expired = false, release, observed, checks = 0;
  const gate = new Promise(r => release = r), seen = new Promise(r => observed = r);
  const { ctx, page, errors } = await open({ intercept: async (route, { url, view }) => {
    if (url.pathname === '/api/notify') { verifying = true; await route.fulfill({ status: 401, json: { error: 'Unavailable app session' } }); return true; }
    if (url.pathname === '/api/session' && verifying) {
      checks++; observed(); await gate; await route.fulfill({ json: expired ? { signedIn: false } : view }); return true;
    }
    return false;
  } });
  try {
    await page.evaluate(() => { localStorage.setItem('markets:plan', 'kept'); location.hash = 'you'; });
    await seen;
    await page.evaluate(() => { for (let i=0;i<3;i++) navigator.serviceWorker.dispatchEvent(new MessageEvent('message', { data: { ifl: 'signedout' } })); });
    await page.waitForTimeout(150);
    assert.equal(checks, 1, 'concurrent hints share the authoritative session check');
    assert.equal(await page.locator('#in').isVisible(), true);
    assert.equal(await page.locator('#signin').isVisible(), false);
    assert.equal(await page.evaluate(() => localStorage.getItem('markets:plan')), 'kept');
    assert.ok(await page.evaluate(() => localStorage.getItem('today:session')));
    release(); await page.waitForResponse(r => new URL(r.url()).pathname === '/api/session');
    assert.equal(await page.locator('#in').isVisible(), true);
    assert.equal(await page.locator('#out').isVisible(), false);
    expired = true;
    await page.evaluate(() => navigator.serviceWorker.dispatchEvent(new MessageEvent('message', { data: { ifl: 'signedout' } })));
    await page.locator('#out:not([hidden]) #signin').waitFor();
    assert.equal(checks, 2, 'a later sign-out hint revalidates instead of reusing the cached positive check');
    assert.equal(await page.evaluate(() => localStorage.getItem('today:session')), null);
    assert.deepEqual(errors, []);
  } finally { release(); await ctx.close(); }
});

test('failure to verify a secondary 401 preserves the already authenticated session and its cache', async () => {
  let verifying = false;
  const { ctx, page, errors } = await open({ intercept: async (route, { url }) => {
    if (url.pathname === '/api/notify') { verifying = true; await route.fulfill({ status: 401, json: { error: 'Unavailable app session' } }); return true; }
    if (url.pathname === '/api/session' && verifying) { await route.fulfill({ status: 503, json: { error: 'Try later' } }); return true; }
    return false;
  } });
  try {
    const response = page.waitForResponse(r => new URL(r.url()).pathname === '/api/session');
    await page.evaluate(() => { location.hash = 'you'; }); await response;
    assert.equal(await page.locator('#in').isVisible(), true);
    assert.equal(await page.locator('#out').isVisible(), false);
    assert.ok(await page.evaluate(() => localStorage.getItem('today:session')));
    assert.deepEqual(errors, []);
  } finally { await ctx.close(); }
});

test('a Home Screen offline reload keeps the eligible same-account day without showing login', async () => {
  let offline = false;
  const { ctx, page, errors } = await open({ iosHomeScreen: true, intercept: async (route, { url }) => {
    if (!offline || !['/api/boot', '/api/session'].includes(url.pathname)) return false;
    await route.abort(); return true;
  } });
  try {
    await page.waitForFunction(() => { const s = JSON.parse(localStorage.getItem('today:session')); return s && localStorage.getItem('today:cards:' + s.id); });
    offline = true; await page.reload();
    // Offline storage intentionally keeps the redacted legacy cards, never the
    // live v2 day header (which can contain money and other transient details).
    await page.locator('#in:not([hidden])').waitFor();
    await page.locator('#rest .tcard').first().waitFor();
    assert.equal(await page.locator('#signin').isVisible(), false);
    assert.equal(await page.locator('#sessionSaid').isVisible(), false);
    assert.ok(await page.evaluate(() => localStorage.getItem('today:session')));
    assert.deepEqual(errors, []);
  } finally { await ctx.close(); }
});

test('the updated script opens safely with the previous cached Home Screen HTML', async () => {
  const { ctx, page, errors } = await open({ legacyShell: true, iosHomeScreen: true });
  try {
    assert.equal(await page.locator('#in').isVisible(), true);
    assert.equal(await page.locator('#signin').isVisible(), false);
    assert.equal(await page.locator('#sessionState').count(), 1);
    assert.deepEqual(errors, []);
  } finally { await ctx.close(); }
});

test('sign-out drops an outstanding day response and its cached account data', async () => {
  let release, observed, expired = false;
  const seen = new Promise(r => observed = r), gate = new Promise(r => release = r);
  const privateDay = structuredClone(day); privateDay.cards.weather.lead = 'PRIVATE OLD ACCOUNT DATA';
  const { ctx, page, errors } = await open({ waitForDay: false, intercept: async (route, { url }) => {
    if (url.pathname === '/api/notify') { expired = true; await route.fulfill({ status: 401, json: { error: 'Signed out' } }); return true; }
    if (url.pathname === '/api/session' && expired) { await route.fulfill({ status: 401, json: { error: 'Session ended' } }); return true; }
    if (url.pathname !== '/api/today') return false;
    observed(); await gate; await route.fulfill({ json: privateDay }).catch(() => {}); return true;
  } });
  try {
    await seen;
    await page.evaluate(() => { location.hash = 'you'; });
    await page.locator('#out:not([hidden]) #signin').waitFor(); release();
    await page.waitForTimeout(150);
    assert.equal(await page.locator('#in').isVisible(), false);
    assert.doesNotMatch(await page.locator('body').innerText(), /PRIVATE OLD ACCOUNT DATA/);
    assert.equal(await page.evaluate(() => Object.keys(localStorage).some(k => k.startsWith('today:cards:'))), false);
    assert.deepEqual(errors, []);
  } finally { release(); await ctx.close(); }
});

test('an unavailable day shows an explicit retry and recovers without replaying writes', async () => {
  let failed = false;
  const { ctx, page, requests } = await open({ waitForDay: false, intercept: async (route, { url }) => {
    if (url.pathname !== '/api/today' || failed) return false;
    failed = true; await route.fulfill({ status: 503, json: { error: 'Today is temporarily unavailable.' } }); return true;
  } });
  try {
    await page.getByText('Today couldn’t load', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Try Again', exact: true }).click();
    await page.locator('#top .day-top').waitFor();
    assert.equal(requests.filter(r => r.path === '/api/today').length, 2);
    assert.equal(requests.some(r => r.method !== 'GET'), false);
  } finally { await ctx.close(); }
});

test('returning startup validates the account without waiting for the combined day endpoint', async () => {
  const { ctx, page, requests, errors } = await open({ seedSession: fixture('session'), user: { id: 'd84670f1-1b2c-4321-8e9f-123456789abc', name: 'Jordan Patel', first: 'Jordan' } });
  try {
    await page.locator('#top .dt-h').waitFor();
    await page.evaluate(() => { location.hash = 'you'; }); await page.locator('#youAcct').waitFor();
    assert.match(await page.locator('#youAcct').innerText(), /Jordan Patel/);
    assert.doesNotMatch(await page.locator('#youAcct').innerText(), /Alex Morgan/);
    assert.equal(requests.filter(r => r.path === '/api/boot').length, 0);
    assert.equal(requests.filter(r => r.path === '/api/session').length, 1);
    assert.equal(requests.filter(r => r.path === '/api/today').length, 1);
    assert.deepEqual(errors, []);
  } finally { await ctx.close(); }
});

for (const width of [390, 1440]) test(`slow day data cannot block the dock, You or cached owner content at ${width}px`, async () => {
  let release, observed;
  const gate = new Promise(r => release = r), seen = new Promise(r => observed = r);
  const cached=structuredClone(day);delete cached.v;delete cached.cards.markets;delete cached.cards.mail;cached.cards.weather.lead='Cached owner forecast';
  const t = await open({ width, initialPath:'/?os=1', waitForReady: false, seedSession: fixture('session'), seedCards:{id:fixture('session').user.id,answer:cached}, intercept: async (route, {url, answer}) => {
    if (url.pathname !== '/api/today') return false;
    observed(); await gate; await route.fulfill({json:answer}); return true;
  }});
  try {
    await seen;
    await t.page.locator('#in:not([hidden])').waitFor();
    assert.equal(await t.page.locator('#sessionState').isVisible(), false);
    assert.ok((await t.page.locator('#rest').innerText()).includes('Cached owner forecast'));
    await t.page.locator('.ws-dock').waitFor({timeout:5000});
    assert.equal(await t.page.locator('.ws-dock').isVisible(), true);
    await t.page.evaluate(()=>{location.hash='you';});
    await t.page.locator('#youAcct').waitFor();
    assert.match(await t.page.locator('#youAcct').innerText(), /Alex Morgan/);
    assert.equal(t.requests.filter(r=>r.path==='/api/boot').length,0);
    assert.deepEqual(t.errors,[]);
    release();
  } finally { release(); await t.ctx.close(); }
});

test('a cached day stays hidden until identity is confirmed and is discarded for a different account', async () => {
  let releaseSession, releaseCards, seenSession;
  const sessionGate=new Promise(r=>releaseSession=r), cardsGate=new Promise(r=>releaseCards=r), seen=new Promise(r=>seenSession=r);
  const old=fixture('session'), cached=structuredClone(day);delete cached.v;cached.cards.weather.lead='PRIVATE PREVIOUS OWNER';
  const t=await open({waitForReady:false,seedSession:old,seedCards:{id:old.user.id,answer:cached},intercept:async(route,{url,view,answer})=>{
    if(url.pathname==='/api/session'){seenSession();await sessionGate;await route.fulfill({json:{...view,user:{...view.user,id:'different-owner',name:'Jordan New',first:'Jordan'}}});return true;}
    if(url.pathname==='/api/today'){await cardsGate;await route.fulfill({json:answer});return true;}
    return false;
  }});
  try {
    await seen;assert.equal(await t.page.locator('#in').isVisible(),false);assert.doesNotMatch(await t.page.locator('body').innerText(),/PRIVATE PREVIOUS OWNER|Alex Morgan/);
    releaseSession();await t.page.locator('#in:not([hidden])').waitFor();
    assert.doesNotMatch(await t.page.locator('body').innerText(),/PRIVATE PREVIOUS OWNER/);
    assert.equal(await t.page.evaluate(id=>localStorage.getItem('today:cards:'+id),old.user.id),null);
    releaseCards();assert.deepEqual(t.errors,[]);
  } finally {releaseSession();releaseCards();await t.ctx.close();}
});

test('a failed bootstrap script keeps a public shell and eventually offers recovery', async () => {
  const t=await open({waitForReady:false,blockBootstrap:true});
  try {
    await t.page.locator('.opening-preview').waitFor();
    assert.equal(await t.page.locator('#signin').isVisible(),false);
    assert.equal(await t.page.locator('#sessionRetry').isVisible(),false);
    await t.page.locator('#sessionRetry').waitFor({timeout:15000});
    assert.equal(await t.page.locator('#sessionState').getAttribute('aria-busy'),'false');
    assert.equal(await t.page.locator('#signin').isVisible(),false);
    assert.equal(t.requests.some(r=>r.path==='/api/session'),false);
  } finally {await t.ctx.close();}
});

test('Retry is hidden again while a replacement session request is pending', async () => {
  let count=0, release, observed;
  const gate=new Promise(r=>release=r), seen=new Promise(r=>observed=r);
  const t=await open({waitForReady:false, intercept:async(route,{url,view})=>{
    if(url.pathname!=='/api/session')return false;
    if(++count===1){await route.fulfill({status:503,json:{error:'Temporarily unavailable'}});return true;}
    observed();await gate;await route.fulfill({json:view});return true;
  }});
  try {
    await t.page.locator('#sessionRetry').waitFor();await t.page.locator('#sessionRetry').click();await seen;
    assert.equal(await t.page.locator('#sessionRetry').isVisible(),false);
    assert.equal(await t.page.locator('#sessionState').getAttribute('aria-busy'),'true');
    assert.equal(await t.page.locator('#signin').isVisible(),false);
    release();await t.page.locator('#top .day-top').waitFor();assert.deepEqual(t.errors,[]);
  } finally {release();await t.ctx.close();}
});

test('revalidating an offline session replaces every module lifetime before showing a different account', async () => {
  let offline = false, otherAccount = false;
  const { ctx, page, errors } = await open({ iosHomeScreen: true, hubApps: { weather: true }, intercept: async (route, { url, view, answer }) => {
    if (!['/api/session', '/api/boot'].includes(url.pathname)) return false;
    if (offline) { await route.abort(); return true; }
    if (!otherAccount) return false;
    const next = structuredClone(view);
    next.user = { ...next.user, id: 'new-account-lifetime', name: 'New Account', first: 'New' };
    await route.fulfill({ json: url.pathname === '/api/boot' ? { view: next, cards: answer } : next });
    return true;
  } });
  try {
    await ctx.route('**/weather/roof/*', async route => {
      const path = new URL(route.request().url()).pathname;
      if (path.endsWith('.css')) return route.fulfill({ contentType: 'text/css', body: '/* fixture */' });
      const body = path.endsWith('/weather.js') ? `export const CONTRACT = 1, BUILD = 'fixture';
        export function mount(root, fw) {
          const id = fw.session.user.id;
          (globalThis.__moduleLifetimes ||= []).push({ id, signal: fw.signal, ended: false });
          const record = __moduleLifetimes.at(-1);
          root.textContent = 'Module owner: ' + id;
          return { show() {}, hide() {}, unmount() { record.ended = true; } };
        }` : 'export const connector = { files: [], preload: [], sections: [] };';
      await route.fulfill({ contentType: 'text/javascript', body });
    });
    await page.waitForFunction(() => {
      const kept = JSON.parse(localStorage.getItem('today:session'));
      return kept && localStorage.getItem('today:cards:' + kept.id);
    });
    offline = true;
    await page.reload();
    await page.locator('#rest .tcard').first().waitFor();
    await page.evaluate(() => {
      const link = document.createElement('a'); link.href = '/weather/'; document.body.append(link); link.click(); link.remove();
    });
    await page.waitForFunction(() => globalThis.__moduleLifetimes?.length === 1);
    const oldId = await page.evaluate(() => __moduleLifetimes[0].id);
    offline = false; otherAccount = true;
    await page.evaluate(() => dispatchEvent(new Event('online')));
    await page.waitForFunction(() => globalThis.__moduleLifetimes?.length === 2);
    assert.deepEqual(await page.evaluate(() => __moduleLifetimes.map(x => ({ id: x.id, aborted: x.signal.aborted, ended: x.ended }))), [
      { id: oldId, aborted: true, ended: true },
      { id: 'new-account-lifetime', aborted: false, ended: false },
    ]);
    assert.equal(await page.locator('#views > :is(main,[role=main])[data-app="weather"]').count(), 1);
    assert.doesNotMatch(await page.locator('#in').innerText(), new RegExp(oldId));
    assert.deepEqual(errors, []);
    assert.deepEqual(await page.evaluate(() => [window.__csp, window.__rejections]), [[], []]);
  } finally { await ctx.close(); }
});

test('the coordinator and signed-out shell still load after an offline reload', { skip: process.env.WEB_UI_BROWSER === 'webkit' && 'Playwright WebKit cannot reload this intercepted localhost service-worker page offline' }, async () => {
  let offline = false;
  const { ctx, page, errors } = await open({ signedIn: false, serviceWorkers: 'allow', intercept: async (route, { url }) => {
    if (!offline || url.pathname !== '/api/session') return false;
    await route.abort(); return true;
  } });
  try {
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.waitForFunction(() => !!navigator.serviceWorker.controller);
    await page.waitForFunction(async () => !!(await caches.match('/roof/requests.js')));
    offline = true; await ctx.setOffline(true); await page.reload();
    await page.locator('#sessionState:not([hidden]) #sessionRetry:not([hidden])').waitFor();
    assert.equal(await page.locator('#signin').isVisible(), false, 'an offline session check does not claim the account signed out');
    assert.deepEqual(errors, []);
  } finally { await ctx.close(); }
});

async function appsScreen(page) {
  await page.evaluate(() => { location.hash = 'apps'; });
  await page.locator('#apps:not([hidden]) .apps-list .ifl-row').first().waitFor();
  await page.waitForFunction(() => !document.documentElement.hasAttribute('data-vt'));
}
const quickIds = page => page.locator('#apps .apps-shortcut').evaluateAll(links => links.map(a => a.dataset.quick));

test('quick launch has four app rows, working destinations and reachable shortcuts on phone and desktop', async () => {
  const answer = structuredClone(day); answer.apps.mail = 'All caught up';
  for (const width of [320, 390, 1440]) for (const scheme of ['light', 'dark']) {
    const { ctx, page, errors } = await open({ width, scheme, answer, viewApps: { mail: true }, hubApps: { mail: true } });
    try {
      await appsScreen(page);
      const rows = page.locator('#apps .apps-list .ifl-row');
      assert.equal(await rows.count(), 4);
      assert.deepEqual(await rows.evaluateAll(a => a.map(n => new URL(n.href).pathname)), ['/weather/', '/fitness/', '/markets/', '/mail/']);
      assert.match(await rows.first().innerText(), /9°, rain from 15:00/);
      assert.deepEqual(await quickIds(page), ['weather:radar', 'fitness:activities', 'markets:holdings', 'mail:people']);
      assert.match(await page.getByRole('link', { name: 'People in Mail', exact: true }).getAttribute('href'), /\/mail\/#people$/);
      for (const b of await page.locator('#apps .apps-shortcut, #apps .apps-edit, #apps .apps-list .ifl-row').all()) {
        const r = await b.boundingBox(); assert.ok(r.width >= 44 && r.height >= 44, 'comfortable tap target');
      }
      const listBox = await page.locator('.apps-list').boundingBox(), quickBox = await page.locator('.apps-quick').boundingBox();
      assert.ok(width >= 1100 ? quickBox.x > listBox.x + listBox.width : quickBox.y >= listBox.y + listBox.height, 'responsive list and quick access placement');
      const last = await page.locator('#apps .apps-shortcut').last().boundingBox();
      if (width === 390) {
        const nav = await page.locator('#tabs').boundingBox();
        assert.ok(last.y + last.height < nav.y, 'four shortcuts clear the floating navigation');
      }
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
      await save(page, `quick-launch-${width}-${scheme}`);
      assert.deepEqual(errors, []); assert.deepEqual(await page.evaluate(() => window.__csp), []);
    } finally { await ctx.close(); }
  }
});

test('quick access edits use toggles, enforce four choices, cancel cleanly, persist, and reset', async () => {
  const { ctx, page, requests, errors } = await open({ viewApps: { mail: true }, hubApps: { mail: true } });
  const initial = ['weather:radar', 'fitness:activities', 'markets:holdings', 'mail:people'];
  try {
    await appsScreen(page);
    const edit = page.getByRole('button', { name: 'Edit quick access', exact: true });
    await edit.click();
    let dialog = page.getByRole('dialog', { name: 'Quick access', exact: true });
    await dialog.waitFor();
    assert.equal(await dialog.getByRole('switch', { name: 'Warnings', exact: true }).isDisabled(), true);
    await dialog.getByRole('switch', { name: 'Radar', exact: true }).uncheck();
    await dialog.getByRole('switch', { name: 'Warnings', exact: true }).check();
    assert.equal(await dialog.getByRole('switch', { name: 'News', exact: true }).isDisabled(), true);
    await save(page, 'quick-launch-editor');
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    assert.deepEqual(await quickIds(page), initial);
    await edit.click(); dialog = page.getByRole('dialog', { name: 'Quick access', exact: true });
    await dialog.getByRole('switch', { name: 'Radar', exact: true }).focus(); await page.keyboard.press('Space');
    await dialog.getByRole('switch', { name: 'Warnings', exact: true }).check();
    await dialog.getByRole('button', { name: 'Done', exact: true }).click();
    const saved = ['fitness:activities', 'markets:holdings', 'mail:people', 'weather:warnings'];
    assert.deepEqual(await quickIds(page), saved);
    assert.equal(await edit.evaluate(el => el === document.activeElement), true, 'focus returns to Edit');
    await page.reload(); await appsScreen(page);
    assert.deepEqual(await quickIds(page), saved, 'choices survive a reload');
    await edit.click(); dialog = page.getByRole('dialog', { name: 'Quick access', exact: true });
    await dialog.getByRole('button', { name: 'Reset to defaults', exact: true }).click();
    await dialog.getByRole('button', { name: 'Done', exact: true }).click();
    assert.deepEqual(await quickIds(page), initial);
    await edit.click(); dialog = page.getByRole('dialog', { name: 'Quick access', exact: true });
    for (const input of await dialog.getByRole('switch').all()) if (await input.isChecked()) await input.uncheck();
    await dialog.getByRole('button', { name: 'Done', exact: true }).click();
    assert.deepEqual(await quickIds(page), []);
    await page.reload(); await appsScreen(page); assert.deepEqual(await quickIds(page), [], 'an intentionally empty selection is remembered');
    assert.equal(requests.some(r => r.method !== 'GET' && r.path !== '/api/vitals'), false, 'shortcut edits make no account or app writes: ' + JSON.stringify(requests.filter(r => r.method !== 'GET')));
    assert.deepEqual(errors, []);
  } finally { await ctx.close(); }
});

test('quick access respects app availability, validates stored IDs and isolates accounts', async () => {
  let second = false;
  const firstId = fixture('session').user.id, secondId = 'other-account';
  const { ctx, page, errors } = await open({ intercept: async (_route, { view }) => {
    if (second) view.user.id = secondId;
    return false;
  } });
  try {
    await page.evaluate(id => {
      localStorage.setItem(`today:quick:${id}`, JSON.stringify(['mail:people', 'weather:warnings', 'weather:warnings', 'javascript:alert(1)', 'markets:news']));
    }, firstId);
    await appsScreen(page);
    assert.equal(await page.locator('#apps .apps-list .ifl-row').count(), 3);
    assert.deepEqual(await quickIds(page), ['weather:warnings', 'markets:news'], 'unavailable apps, duplicates and unknown destinations are excluded');
    await page.getByRole('button', { name: 'Edit quick access', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Quick access', exact: true });
    assert.equal(await dialog.getByRole('switch', { name: 'People', exact: true }).count(), 0);
    await page.keyboard.press('Escape');
    second = true; await page.reload(); await appsScreen(page);
    assert.deepEqual(await quickIds(page), ['weather:radar', 'fitness:activities', 'markets:holdings']);
    await page.getByRole('button', { name: 'Edit quick access', exact: true }).click();
    await page.getByRole('dialog', { name: 'Quick access', exact: true }).getByRole('button', { name: 'Done', exact: true }).click();
    const kept = await page.evaluate(([a,b]) => [JSON.parse(localStorage.getItem(`today:quick:${a}`)), JSON.parse(localStorage.getItem(`today:quick:${b}`))], [firstId, secondId]);
    assert.ok(kept[0].includes('mail:people'), 'another account does not overwrite the first account’s hidden choices');
    assert.deepEqual(kept[1], ['weather:radar', 'fitness:activities', 'markets:holdings']);
    assert.deepEqual(errors, []);
  } finally { await ctx.close(); }
});

test('blocked shortcut storage shows a recoverable error and leaves the previous choices intact', async () => {
  const { ctx, page, errors } = await open();
  try {
    await appsScreen(page); const before = await quickIds(page);
    await page.getByRole('button', { name: 'Edit quick access', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Quick access', exact: true });
    await dialog.getByRole('switch', { name: 'Radar', exact: true }).uncheck();
    await page.evaluate(() => {
      const set = Storage.prototype.setItem;
      Storage.prototype.setItem = function(k,v) { if (k.startsWith('today:quick:')) throw new DOMException('Storage unavailable', 'QuotaExceededError'); return set.call(this,k,v); };
    });
    await dialog.getByRole('button', { name: 'Done', exact: true }).click();
    assert.match(await dialog.getByRole('status').innerText(), /Couldn’t save/);
    assert.equal(await dialog.isVisible(), true);
    assert.deepEqual(await quickIds(page), before);
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    assert.deepEqual(errors, []);
  } finally { await ctx.close(); }
});

test('an Apps refresh preserves an open edit, and an old account editor cannot save after its scope ends', async () => {
  const { ctx, page, errors } = await open();
  try {
    const result = await page.evaluate(async () => {
      const { drawApps } = await import('/apps.js'), ui = await import('/roof/ui.js');
      const root = document.createElement('section'); document.body.append(root);
      let spec, live = true;
      const frame = { session: { hub: true, apps: {} }, sheet: { open(s) {
        spec = s; document.body.append(s.body);
        const h = { closed: false, close() { if (h.closed) return; h.closed = true; s.body.remove(); s.onClose(); } };
        return h;
      } } };
      const original = { ui, view: { user: { id: 'edit-owner-a' } }, current: () => live, frame };
      drawApps(root, original); const button = root.querySelector('button'); button.click();
      const input = spec.body.querySelector('[data-quick="weather:radar"] input'); input.checked = false; input.dispatchEvent(new Event('change'));
      drawApps(root, { ...original, answer: { v: 2, apps: { weather: 'Updated forecast' } } });
      const sameEditor = !input.disabled && button === root.querySelector('button');
      const refreshedWhileEditing = root.textContent.includes('Updated forecast');
      spec.acts[1].run();
      const refreshed = root.textContent.includes('Updated forecast'), saved = JSON.parse(localStorage.getItem('today:quick:edit-owner-a'));
      root.querySelector('button').click(); const old = spec;
      live = false;
      drawApps(root, { ...original, current: () => true, view: { user: { id: 'edit-owner-b' } } });
      old.acts[1].run();
      const nextRoot = root.firstChild;
      drawApps(root, { ...original, answer: { v: 2, apps: { weather: 'OLD ACCOUNT STATUS' } } });
      const staleIgnored = nextRoot === root.firstChild && !root.textContent.includes('OLD ACCOUNT STATUS');
      const other = localStorage.getItem('today:quick:edit-owner-b'); root.remove();
      return { sameEditor, refreshedWhileEditing, refreshed, staleIgnored, saved, after: JSON.parse(localStorage.getItem('today:quick:edit-owner-a')), other };
    });
    assert.equal(result.sameEditor, true);
    assert.equal(result.refreshedWhileEditing, true);
    assert.equal(result.refreshed, true);
    assert.equal(result.staleIgnored, true);
    assert.deepEqual(result.saved, ['fitness:activities', 'markets:holdings']);
    assert.deepEqual(result.after, result.saved);
    assert.equal(result.other, null);
    assert.deepEqual(errors, []);
  } finally { await ctx.close(); }
});

async function refreshFromForeground(page, time) {
  await page.clock.setFixedTime(new Date(time));
  const response = page.waitForResponse(r => new URL(r.url()).pathname === '/api/today');
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await response;
  await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
}

test('fresh Today answers patch Apps statuses in place and keep focused links and scroll position', async () => {
  for (const width of [390, 1440]) {
    const answer = structuredClone(day); answer.apps.mail = 'All caught up';
    const { ctx, page, requests, errors } = await open({ width, answer, viewApps: { mail: true }, hubApps: { mail: true } });
    try {
      await appsScreen(page);
      await page.setViewportSize({ width, height: 390 });
      await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
      await page.locator('#apps [data-app-row="weather"]').focus();
      await page.evaluate(async () => {
        scrollTo(0, 70);
        await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
        window.__statusNodes = [...document.querySelectorAll('#apps .apps-list a, #apps .apps-shortcut, #apps .apps-edit')];
        window.__statusFocus = document.activeElement; window.__statusScroll = scrollY; window.__statusMutations = 0;
        new MutationObserver(rs => window.__statusMutations += rs.length).observe(document.querySelector('#apps'), { subtree: true, childList: true, characterData: true });
      });
      const before = requests.filter(r => r.path === '/api/today').length;
      Object.assign(answer.apps, { weather: '12°, dry now', fitness: 'Recovery today', markets: 'London open', mail: '2 unread' });
      await refreshFromForeground(page, day.at + 5000);
      assert.deepEqual(await page.locator('#apps .apps-list .ifl-tx small').allTextContents(), Object.values(answer.apps));
      const kept = await page.evaluate(() => ({ nodes: __statusNodes.every(n => n.isConnected), focus: __statusFocus === document.activeElement, scroll: scrollY, before: __statusScroll }));
      assert.ok(kept.before > 0, 'the launcher really was scrolled');
      assert.deepEqual(kept, { nodes: true, focus: true, scroll: kept.before, before: kept.before }, `${width}px retains the launcher state`);
      await page.evaluate(() => { window.__statusMutations = 0; });
      await refreshFromForeground(page, day.at + 10000);
      assert.equal(await page.evaluate(() => __statusMutations), 0, 'an unchanged answer makes no Apps DOM mutations');
      assert.equal(requests.filter(r => r.path === '/api/today').length, before + 2, 'uses the existing refresh without another Apps fetch');
      assert.equal(requests.some(r => r.method !== 'GET'), false);
      await save(page, `fresh-status-${width}`);
      assert.deepEqual(errors, []); assert.deepEqual(await page.evaluate(() => window.__csp), []);
    } finally { await ctx.close(); }
  }
});

test('fresh statuses arrive under an open shortcut editor without changing its draft, focus or scroll', async () => {
  const answer = structuredClone(day); answer.apps.mail = 'All caught up';
  const { ctx, page, errors } = await open({ answer, viewApps: { mail: true }, hubApps: { mail: true } });
  try {
    await appsScreen(page);
    const initial = await quickIds(page);
    for (const [i, action] of ['Cancel', 'Done'].entries()) {
      await page.getByRole('button', { name: 'Edit quick access', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: 'Quick access', exact: true });
      await dialog.getByRole('switch', { name: 'Radar', exact: true }).uncheck();
      await dialog.getByRole('switch', { name: 'Warnings', exact: true }).check();
      await dialog.evaluate(d => {
        window.__liveEditor = d; d.scrollTop = 120;
        window.__liveInput = d.querySelector('[data-quick="weather:warnings"] input');
        __liveInput.focus({ preventScroll: true }); window.__liveScroll = d.scrollTop;
      });
      answer.apps.weather = `${13 + i}°, dry now`;
      await refreshFromForeground(page, day.at + (i + 1) * 5000);
      assert.equal(await page.locator('#apps [data-app-row="weather"] small').innerText(), answer.apps.weather);
      assert.equal(await dialog.evaluate(d => d === __liveEditor && d.scrollTop === __liveScroll && document.activeElement === __liveInput && __liveInput.checked), true);
      assert.equal(await dialog.getByRole('switch', { name: 'Radar', exact: true }).isChecked(), false);
      await dialog.getByRole('button', { name: action, exact: true }).click();
      assert.deepEqual(await quickIds(page), action === 'Cancel' ? initial : ['fitness:activities', 'markets:holdings', 'mail:people', 'weather:warnings']);
    }
    assert.deepEqual(errors, []);
  } finally { await ctx.close(); }
});

test('an unsuccessful status refresh keeps the last answer and a later refresh recovers', async () => {
  const answer = structuredClone(day);
  let fail = false;
  const { ctx, page, errors } = await open({ answer, intercept: async (route, { url }) => {
    if (url.pathname !== '/api/today' || !fail) return false;
    await route.fulfill({ status: 503, json: { error: 'Temporarily unavailable' } }); return true;
  } });
  try {
    await appsScreen(page);
    const row = page.locator('#apps [data-app-row="weather"]'); await row.focus();
    const before = await row.locator('small').innerText();
    fail = true; await refreshFromForeground(page, day.at + 5000);
    assert.equal(await row.locator('small').innerText(), before);
    assert.equal(await row.evaluate(n => n === document.activeElement), true);
    fail = false; answer.apps.weather = '15°, sunny';
    await refreshFromForeground(page, day.at + 10000);
    assert.equal(await row.locator('small').innerText(), '15°, sunny');
    assert.equal(await row.evaluate(n => n === document.activeElement), true);
    assert.deepEqual(errors, []);
  } finally { await ctx.close(); }
});


test('bottom navigation stays inside the visible Home Screen viewport after height corrections and resume', async () => {
  const { ctx, page, errors } = await open({ iosHomeScreen: true });
  try {
    const placed = async label => {
      // Resizes and the menu's hide/show transition can settle on later rendering frames.
      await page.waitForFunction(() => {
        const r = document.querySelector('#tabs').getBoundingClientRect();
        return r.top >= 0 && r.bottom <= visualViewport.height - 8;
      }, null, { timeout: 3000 });
      const nav = await page.locator('#tabs').boundingBox();
      const viewport = page.viewportSize();
      assert.ok(nav && nav.y >= 0 && nav.y + nav.height <= viewport.height - 8, label + ': all tab labels above the screen edge');
      const labels = await page.locator('#tabs .ifl-tab').evaluateAll(tabs => tabs.map(t => t.getBoundingClientRect().bottom));
      assert.ok(labels.every(b => b < viewport.height - 8), label + ': every tab remains reachable');
    };
    await page.waitForFunction(() => document.documentElement.style.getPropertyValue('--fix-gap') === '54px');
    await placed('short reported height');
    for (const gap of [0, 54, 20, 0, 54]) {
      await page.evaluate(n => { __homeScreenHeight(n); dispatchEvent(new Event('pageshow')); dispatchEvent(new Event('focus')); }, gap);
      await placed('resume with correction ' + gap);
    }
    await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
    await placed('after scrolling');
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    await page.locator('dialog[open]').waitFor();
    await page.keyboard.press('Escape');
    await page.locator('dialog[open]').waitFor({ state: 'detached' });
    await placed('after closing search');
    await page.setViewportSize({ width: 844, height: 390 });
    await page.evaluate(() => { __homeScreenHeight(20); dispatchEvent(new Event('orientationchange')); });
    await placed('landscape');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => __homeScreenHeight(54));
    await placed('back to portrait');
    await save(page, 'menu-home-screen-position');
    // Match-media rules settle on the rendering frame after a mobile orientation change.
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await page.locator('#tabs').evaluate(nav => nav.classList.add('away'));
    await page.waitForFunction(() => getComputedStyle(document.querySelector('#tabs')).visibility === 'hidden');
    await page.locator('#tabs').evaluate(nav => nav.classList.remove('away'));
    await placed('after leaving chat');
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const rail = await page.locator('#tabs').boundingBox();
    assert.ok(rail.x === 0 && rail.y === 0 && rail.width < 300 && rail.height === 1000, 'desktop sidebar keeps its full-height position');
    assert.deepEqual(errors, []);
  } finally { await ctx.close(); }
});

test('sheet-close restoration belongs to its current route, frame and sheet generation', async () => {
  const { ctx, page, errors } = await open();
  try {
    const calls = await page.evaluate(async () => {
      const { createSheets } = await import('/roof/sheet.js');
      const original = { requestAnimationFrame, cancelAnimationFrame, scrollTo }, url = location.href;
      let queued = new Map(), id = 0, writes = [];
      window.requestAnimationFrame = fn => { queued.set(++id, fn); return id; };
      window.cancelAnimationFrame = n => queued.delete(n);
      window.scrollTo = (...args) => writes.push(args);
      const results = {};
      try {
        for (const end of ['current', 'route', 'url', 'signal', 'new-sheet']) {
          const controller = new AbortController(), owner = { route: {}, signal: controller.signal };
          const sheets = createSheets(owner), sheet = sheets.open({ title: 'Close ownership' });
          sheet.now();
          const late = [...queued.values()].at(-1); writes = [];
          if (end === 'route') owner.route = {};
          if (end === 'url') history.replaceState(history.state, '', '#another-screen');
          if (end === 'signal') controller.abort();
          if (end === 'new-sheet') sheets.open({ title: 'A newer sheet' });
          // A cancelled frame may already be in the browser's callback queue.
          late(); results[end] = writes.length;
          sheets.closeAll(); queued.clear(); history.replaceState(history.state, '', url);
        }
      } finally { Object.assign(window, original); }
      return results;
    });
    assert.deepEqual(calls, { current: 1, route: 0, url: 0, signal: 0, 'new-sheet': 0 });
    assert.deepEqual(errors, []);
  } finally { await ctx.close(); }
});

test('iPhone sheets fit Home Screen corrections, keyboards and resume while preserving scroll and focus', async () => {
  const { ctx, page, errors } = await open({ iphoneViewport: true });
  try {
    await page.evaluate(async () => {
      scrollTo(0, 240); window.__beforeSheetY = scrollY;
      document.documentElement.style.setProperty('--fix-gap', '54px');
      const { createSheets } = await import('/roof/sheet.js');
      const { el } = await import('/roof/ui.js');
      window.__sheets = createSheets({});
      window.__sheet = __sheets.open({ title: 'Reliability check', sheet: 'iphone-test',
        body: el('div', {}, ...Array.from({ length: 25 }, (_, i) => el('p', { text: `Scrollable content ${i}` })), el('input', { 'aria-label': 'Test field' })),
        acts: [{ label: 'Done', run() {} }] });
    });
    const placed = async label => {
      await page.waitForFunction(() => {
        const d = document.querySelector('dialog[open]'), r = d.getBoundingClientRect(), v = visualViewport;
        if (r.top < v.offsetTop || r.bottom > v.offsetTop + v.height + 1) return false;
        return [...d.querySelectorAll('.ifs-acts button')].every(b => {
          const a = b.getBoundingClientRect(), hit = document.elementFromPoint(a.x + a.width / 2, a.y + a.height / 2);
          return a.top >= v.offsetTop && a.bottom <= v.offsetTop + v.height + 1 && (b === hit || b.contains(hit));
        });
      }, null, { timeout: 1500 }).catch(() => {});
      const r = await page.locator('dialog[open]').evaluate(d => {
        const r = d.getBoundingClientRect(), v = visualViewport;
        return { top: r.top, bottom: r.bottom, foot: v.height + v.offsetTop, actions: [...d.querySelectorAll('.ifs-acts button')].map(b => { const r = b.getBoundingClientRect(); const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return { top: r.top, bottom: r.bottom, hit: b === hit || b.contains(hit) }; }), keyboard: d.classList.contains('ifs-kb') };
      });
      assert.ok(r.top >= visualTop && r.bottom <= r.foot + 1, `${label}: ${JSON.stringify(r)}`);
      assert.ok(r.actions.every(a => a.top >= visualTop && a.bottom <= r.foot + 1 && a.hit), `${label}: action buttons are fully visible and tappable: ${JSON.stringify(r)}`);
      return r;
    };
    let visualTop = 0;
    await placed('Home Screen gap');
    await page.locator('input[aria-label="Test field"]').focus();
    await page.evaluate(() => __viewport(480));
    assert.equal((await placed('keyboard overlays layout')).keyboard, true);
    await page.setViewportSize({ width: 390, height: 480 });
    await page.evaluate(() => __viewport(480));
    assert.equal((await placed('keyboard also shrinks layout')).keyboard, true);
    await page.setViewportSize({ width: 390, height: 844 });
    visualTop = 16;
    await page.evaluate(() => __viewport(460, 16, 'scroll'));
    await placed('panned visual viewport');
    visualTop = 0;
    await page.evaluate(() => __viewport(740, 0, 'resume'));
    await placed('resume without resize');
    await page.evaluate(() => __viewport(844));
    assert.equal((await placed('keyboard dismissed')).keyboard, false);
    await page.evaluate(() => { visualViewport.scale = 2; __viewport(480); });
    assert.equal((await placed('pinch zoom')).keyboard, false, 'zoom is not a keyboard');
    await page.evaluate(() => { visualViewport.scale = 1; __viewport(844); });
    const before = await page.evaluate(() => scrollY);
    if (process.env.WEB_UI_BROWSER === 'webkit') await page.locator('dialog[open]').evaluate(d => d.scrollBy(0, 500));
    else { await page.mouse.move(190, 300); await page.mouse.wheel(0, 500); }
    assert.equal(await page.evaluate(() => scrollY), before, 'scrolling sheet content never scrolls the page behind it');
    await page.evaluate(() => __sheet.close());
    await page.locator('dialog[open]').waitFor({ state: 'detached' });
    assert.equal(await page.evaluate(() => document.body.classList.contains('kb-up')), false);
    assert.equal(await page.evaluate(() => scrollY), await page.evaluate(() => __beforeSheetY), 'closing restores the existing page position');
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    await placed('search sheet');
    await page.keyboard.press('Escape');
    await page.locator('dialog[open]').waitFor({ state: 'detached' });
    assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('aria-label')), 'Search', 'focus returns to the opener');
    await page.evaluate(() => { window.__parent = __sheets.open({ title: 'Parent' }); window.__child = __sheets.open({ title: 'Child' }); __child.close(); });
    await page.getByRole('dialog', { name: 'Child', exact: true }).waitFor({ state: 'detached' });
    assert.equal(await page.evaluate(() => document.body.classList.contains('sheet-up')), true, 'closing one sheet leaves the other modal');
    await page.evaluate(() => __parent.close());
    await page.locator('dialog[open]').waitFor({ state: 'detached' });
    assert.equal(await page.evaluate(() => document.body.classList.contains('sheet-up')), false);
    await page.evaluate(() => __viewport(480));
    assert.equal(await page.evaluate(() => document.body.classList.contains('kb-up')), false, 'closed sheets leave no keyboard state behind');
    assert.deepEqual(errors, []);
    assert.deepEqual(await page.evaluate(() => window.__csp), []);
  } finally { await ctx.close(); }
});

test('profile menu stays reachable through Home Screen resume and rotation, then restores focus', async () => {
  const { ctx, page, errors } = await open({ iosHomeScreen: true });
  try {
    const opener = page.locator('#hd .ifh-me');
    await opener.click();
    const menu = page.locator('.ifm-pop.open'); await menu.waitFor();
    const fits = async () => {
      await page.waitForFunction(() => {
        const r = document.querySelector('.ifm-pop.open').getBoundingClientRect();
        return r.top >= 0 && r.bottom <= visualViewport.height && r.left >= 0 && r.right <= innerWidth;
      });
    };
    await fits();
    for (const gap of [20, 54, 0]) { await page.evaluate(gap => { __homeScreenHeight(gap); dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })); }, gap); await fits(); }
    await page.setViewportSize({ width: 844, height: 390 }); await fits();
    await page.keyboard.press('Tab');
    assert.equal(await menu.evaluate(m => m.contains(document.activeElement)), true, 'keyboard focus stays in the menu');
    await page.keyboard.press('Escape');
    await page.locator('.ifm-pop').waitFor({ state: 'detached' });
    assert.equal(await opener.evaluate(e => e === document.activeElement), true);
    assert.deepEqual(errors, []);
    assert.deepEqual(await page.evaluate(() => window.__csp), []);
  } finally { await ctx.close(); }
});


test('a slow hub answer restores same-origin Chats without losing the saved Chat session', async () => {
  const {ctx, page, requests, errors} = await open({ intercept: async (route, {url}) => {
    if (url.pathname !== '/api/hub') return false;
    await new Promise(resolve => setTimeout(resolve, 2200));
    await route.fulfill({json:{ready:true, roof:true, apps:{weather:false, fitness:false, markets:false, chats:false, mail:false}}});
    return true;
  }});
  try {
    await page.waitForFunction(() => window.IFL.hub.degraded === false, null, {timeout:5000});
    assert.equal(await page.locator('#tabs [data-tab="chats"]').getAttribute('href'), '/chats/');
    // A non-extractable Chat key belongs to this origin; navigation must keep it
    // here rather than opening the separate subdomain's empty IndexedDB store.
    await page.evaluate(async () => {
      const keys = await crypto.subtle.generateKey({name:'ECDH', namedCurve:'P-256'}, false, ['deriveBits']);
      await new Promise((resolve, reject) => {
        const request = indexedDB.open('inflight',1);
        request.onupgradeneeded = () => request.result.createObjectStore('kv');
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result, tx = db.transaction('kv','readwrite');
          tx.objectStore('kv').put({token:'saved-chat-session', priv:keys.privateKey},'session');
          tx.oncomplete = () => {db.close(); resolve();};
        };
      });
    });
    await ctx.route('**/chats/', route => route.fulfill({contentType:'text/html',body:'<!doctype html><head><title>Chats navigation check</title><script src="/fade.js"></script></head>'}));
    await page.locator('#tabs [data-tab="chats"]').click();
    await page.waitForURL('**/chats/');
    assert.equal(new URL(page.url()).origin, origin);
    const kept = await page.evaluate(() => new Promise(resolve => {
      const request = indexedDB.open('inflight',1);
      request.onsuccess = () => {const db=request.result, q=db.transaction('kv').objectStore('kv').get('session'); q.onsuccess=()=>{resolve([q.result.token,q.result.priv.extractable]);db.close();};};
    }));
    assert.deepEqual(kept,['saved-chat-session',false]);
    assert.equal(requests.some(r => /handback|logout/.test(r.path)),false);
    assert.deepEqual(errors,[]);
  } finally {await ctx.close();}
});

test('a cached failed hub check is revalidated on the next Today boot', async () => {
  const {ctx,page,requests,errors} = await open({seedHub:{'ifl-hub-ready':'0','ifl-roof':'0','ifl-roof-apps':'{}'}});
  try {
    assert.equal(requests.filter(r=>r.path==='/api/hub').length,1);
    assert.equal(await page.locator('#tabs [data-tab="chats"]').getAttribute('href'),'/chats/');
    assert.deepEqual(errors,[]);
  } finally {await ctx.close();}
});

test('tapping fallback Chats rechecks the hub and opens the shared origin after recovery', async () => {
  let probes=0;
  const {ctx,page,errors} = await open({intercept:async (route,{url})=>{
    if(url.pathname!=='/api/hub') return false;
    await route.fulfill({json:{ready:++probes>1,roof:true,apps:{}}});return true;
  }});
  try {
    assert.match(await page.locator('#tabs [data-tab="chats"]').getAttribute('href'),/^https:\/\/chat\./);
    await ctx.route('**/chats/',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><head><title>Shared Chats</title><script src="/fade.js"></script></head>'}));
    await page.locator('#tabs [data-tab="chats"]').click();
    await page.waitForURL(origin+'/chats/');
    assert.equal(probes,2);
    assert.deepEqual(errors,[]);
  } finally {await ctx.close();}
});

test('a failed reconnect keeps the signed-in user in Today rather than opening a separate login', async () => {
  let probes=0;
  const {ctx,page,errors} = await open({intercept:async (route,{url})=>{
    if(url.pathname!=='/api/hub') return false;
    if(++probes===1) await route.fulfill({json:{ready:false,roof:false,apps:{}}});
    else await route.abort();
    return true;
  }});
  try {
    await page.locator('#tabs [data-tab="chats"]').click();
    await page.locator('.ifm-say[role="status"]').filter({hasText:'Chats is reconnecting. Try again in a moment.'}).waitFor();
    assert.equal(page.url(),origin+'/');
    assert.equal(await page.locator('#in').isVisible(),true);
    assert.deepEqual(errors,[]);
  } finally {await ctx.close();}
});

for (const width of [320, 390, 1440]) test(`shared header removes repeated words and actions without losing controls at ${width}px`, async () => {
  const {ctx,page,errors}=await open({width});
  try {
    const initial=await page.evaluate(async()=>{
      const {createHeader}=await import('/roof/header.js');
      const host=document.createElement('div');host.id='header-review';document.querySelector('#in').prepend(host);
      window.headerCalls=[];
      const head=createHeader(host,{search:{open:()=>headerCalls.push('search')},nav:{back:()=>headerCalls.push('back')}});
      window.reviewHeader=head;
      head.set({title:'Weather',crumb:{app:'weather',text:'Weather'},line:'  WEATHER  ',back:{label:'Back to Today'},acts:[
        {icon:'search',label:'Search again',run:()=>headerCalls.push('duplicate search')},
        {icon:'settings',label:'Settings',run:()=>headerCalls.push('settings')},
        {icon:'settings',label:'Settings again',run:()=>headerCalls.push('duplicate settings')},
        {icon:'plus',label:'Add',run:()=>headerCalls.push('add')}
      ]});
      return {crumb:host.querySelector('.ifh-crumb').hidden,line:host.querySelector('.ifh-line').textContent,actions:[...host.querySelectorAll('.ifh-act')].map(x=>x.dataset.act)};
    });
    assert.deepEqual(initial,{crumb:true,line:'',actions:['search','settings','plus']});
    const host=page.locator('#header-review');
    await host.locator('[data-act=search]').click();await host.locator('[data-act=settings]').click();await host.locator('[data-act=plus]').click();
    assert.deepEqual(await page.evaluate(()=>headerCalls),['search','settings','add']);
    const preserved=await page.evaluate(()=>{
      const spec={title:'Today',crumb:{app:'weather',text:'Weather'},line:'Rain from 14:00',acts:[]};reviewHeader.set(spec);reviewHeader.set(spec);
      const root=reviewHeader.el,normal={crumb:!root.querySelector('.ifh-crumb').hidden,line:root.querySelector('.ifh-line').textContent};
      const b=document.createElement('button');b.textContent='Today';b.onclick=()=>headerCalls.push('line');reviewHeader.set({...spec,line:b});
      return {...normal,interactive:root.querySelector('.ifh-line button')===b};
    });
    assert.deepEqual(preserved,{crumb:true,line:'Rain from 14:00',interactive:true});
    await host.locator('.ifh-line button').click();assert.equal((await page.evaluate(()=>headerCalls)).at(-1),'line');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
    await page.evaluate(()=>{reviewHeader.destroy();document.querySelector('#header-review').remove();});assert.deepEqual(errors,[]);
  } finally {await ctx.close();}
});

test('a quiet day refresh keeps cached cards and focused controls in place, including on failure',async()=>{
 const cached=structuredClone(day);delete cached.v;delete cached.cards.markets;delete cached.cards.mail;
 let release;const gate=new Promise(resolve=>release=resolve);
 const t=await open({initialPath:'/?os=1',seedSession:fixture('session'),seedCards:{id:fixture('session').user.id,answer:cached},waitForDay:false,intercept:async(route,{url})=>{
  if(url.pathname!=='/api/today')return false;await gate;await route.fulfill({status:503,json:{error:'Temporarily unavailable'}});return true;
 }});
 try{
  await t.page.locator('.ws-dock').waitFor();
  const indicator=t.page.locator('#kept[data-refreshing]');
  await indicator.waitFor();
  assert.equal(await indicator.locator('.vh').textContent(),'Updating your day…');
  const animation=()=>indicator.evaluate(el=>getComputedStyle(el,'::after').animationName);
  assert.equal(await animation(),'none');
  await t.page.emulateMedia({reducedMotion:'no-preference'});
  assert.equal(await animation(),'day-refresh-sweep');
  await t.page.evaluate(()=>{const card=document.querySelector('.tcard[data-app="weather"]');window.keptRefreshCard=card;window.keptRefreshAction=card.querySelector('a');keptRefreshAction.focus({preventScroll:true})});
  const before=await t.page.locator('.tcard[data-app="weather"]').boundingBox();
  release();await t.page.getByText('Couldn’t update. Showing your last saved day.',{exact:true}).waitFor();
  assert.equal(await indicator.count(),0);
  const after=await t.page.locator('.tcard[data-app="weather"]').boundingBox();
  assert.equal(await t.page.evaluate(()=>keptRefreshCard===document.querySelector('.tcard[data-app="weather"]')&&document.activeElement===keptRefreshAction),true);
  assert.ok(Math.abs(before.y-after.y)<=1,'refresh status does not shift existing cards');
  assert.equal(await t.page.locator('#sessionState').isVisible(),false);assert.equal(await t.page.locator('.ws-dock').isVisible(),true);assert.deepEqual(t.errors,[]);
 }finally{release();await t.ctx.close()}
});

test('the live shell records a bounded anonymous startup sample after the interface paints',async()=>{
 const t=await open({initialPath:'/?os=1'});try{
  await t.page.locator('.ws-dock').waitFor();await t.page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
  await t.page.evaluate(()=>dispatchEvent(new Event('pagehide')));
  await t.page.waitForFunction(()=>true);await t.page.waitForTimeout(100);
  const sample=t.requests.find(r=>r.path==='/api/vitals'&&typeof r.body?.m?.startup==='number');
  assert.ok(sample,'a ready startup reaches the existing vitals transport');assert.equal(sample.body.app,'today');assert.ok(sample.body.m.startup>=0&&sample.body.m.startup<=60000);
  assert.deepEqual(Object.keys(sample.body).sort(),['app','dev','m']);assert.deepEqual(Object.keys(sample.body.m).sort(),['open_fail','startup']);assert.deepEqual(t.errors,[]);
 }finally{await t.ctx.close()}
});


for (const width of [320, 390, 1440]) test(`Ride overview requires an available planned session at ${width}px`, async () => {
  const answer = structuredClone(day);
  answer.tops.morning = {kind:'weather',title:'10° · Dry until 05:00',chip:'North Walsham · now',lines:['Environment Agency: flood alert in force.'],buttons:[]};
  answer.cards.fitness = {state:'ok',kind:'rest'};
  const {ctx,page,errors} = await open({width,answer});
  try {
    assert.equal(await page.locator('[data-ride-overview]').count(),0,'weather and a rest day do not offer a ride');
    const planned = structuredClone(day.cards.fitness);
    assert.equal(planned.kind,'session');
    for (const fitness of [undefined,{state:'ok',kind:'none'},{...planned,session:null},{...planned,session:'invalid'},{...planned,state:'error'},{...planned,kind:'done'},{...planned,kind:'rest'},planned]) {
      await page.evaluate(async ({answer,fitness})=>{
        const {drawDay}=await import('/day.js');answer.cards.fitness=fitness;
        drawDay(document.querySelector('#today'),answer,{now:answer.at,timers:false});
      },{answer,fitness});
      const valid=fitness===planned;
      assert.equal(await page.locator('#top [data-ride-overview]').count(),valid?1:0,'headline follows the actual session availability');
      assert.equal(await page.locator('#rest [data-ride-overview]').count(),valid?1:0,'Fitness card follows the same availability rule');
    }
    const guard = await page.evaluate(async()=>{
      const {openRideOverview}=await import('/roof/ride-overview.js'),messages=[];let opened=false;
      openRideOverview({ui:{},toast:t=>messages.push(t),sheet:{open(){opened=true}}},{fitness:{state:'error',kind:'session',session:{name:'Old ride'}}});
      return {messages,opened};
    });
    assert.equal(guard.opened,false,'an unavailable session cannot open a stale overview');
    assert.equal(guard.messages.length,1);
    assert.deepEqual(errors,[]);
  } finally {await ctx.close();}
});

for (const width of [390, 1440]) test(`unified settings search and appearance at ${width}px`, async () => {
  const {page, ctx, errors} = await open({width,initialPath:'/#settings',waitForDay:false});
  try {
    const owner = fixture('session').user.id;
    let pref = {appearance:'auto',palette:'inflite',glass:true,glassStrength:55};
    await page.route('**/account/api/account/appearance', route => route.fulfill({json:{signedIn:true,id:owner,...pref}}));
    await page.route('**/account/api/account/prefs', async route => {
      assert.equal(route.request().headers()['x-inflite-owner'],owner);
      Object.assign(pref,route.request().postDataJSON());
      await route.fulfill({json:{id:owner,prefs:pref}});
    });
    const search = page.getByRole('searchbox',{name:'Search settings'});
    await search.waitFor();
    await save(page, `settings-home-${width}`);
    await search.fill('liquid glass');
    const appearance = page.getByRole('button',{name:/Appearance Theme/});
    await appearance.waitFor();
    assert.equal(await page.locator('[data-setting=security]').isVisible(),false);
    await appearance.click();
    const mode = page.getByRole('combobox',{name:'Mode',exact:true});
    await mode.selectOption('dark');
    await page.waitForFunction(() => !document.querySelector('.settings-appearance fieldset')?.disabled &&
      document.querySelector('.settings-appearance select')?.value === 'dark');
    assert.equal(pref.appearance,'dark');
    const wallpaper = page.getByRole('combobox', {name:'Dark wallpaper on this device'});
    await wallpaper.selectOption('plain');
    assert.equal(await page.locator('html[data-midnight-lava]').count(), 0);
    const colours = page.getByRole('group', {name:'Lava colour', exact:true});
    assert.equal(await colours.isVisible(), false);
    await wallpaper.selectOption('still');
    const canvas = page.locator('html[data-midnight-lava] .sky canvas');
    await canvas.waitFor();
    const original = await canvas.evaluate(c => c.toDataURL());
    const rendered = new Set([original]);
    for (const colour of ['Jade','Cobalt','Lagoon','Midnight']) {
      await colours.getByRole('radio', {name:colour,exact:true}).check();
      assert.equal(await page.locator('html').getAttribute('data-midnight-lava'), colour.toLowerCase());
      const pixels = await canvas.evaluate(c => c.toDataURL());
      assert.equal(await page.locator('.settings-dock-preview canvas').evaluate(c => c.toDataURL()),pixels);
      if (colour === 'Midnight') assert.equal(pixels, original, 'colour changes preserve the exact pool positions');
      else rendered.add(pixels);
    }
    assert.equal(rendered.size, 4, 'each colourway paints distinct pixels');
    const slider = page.getByRole('slider',{name:'Glass intensity'});
    const adjust = value => slider.evaluate((n,v) => {
      n.value = v;
      n.dispatchEvent(new Event('input',{bubbles:true}));
    }, value);
    await adjust(82);
    await save(page, 'dock-glass-preview-'+width);
    assert.equal(await page.evaluate(()=>InFliteAppearance.snapshot().glassStrength),82);
    assert.equal(pref.glassStrength,55,'dragging previews before saving');
    await slider.dispatchEvent('change');
    await page.waitForFunction(()=>document.querySelector('.settings-range input')?.value === '82' && !document.querySelector('.settings-appearance fieldset').disabled);
    assert.equal(pref.glassStrength,82);
    await adjust(10);

    await page.keyboard.press('Escape');
    await page.waitForFunction(()=>InFliteAppearance.snapshot().glassStrength===82);
    let email = {emailOk:true,chat:{emails:{},pigeons:true},weather:{email:{}},account:{fixed:true}};
    await page.route('**/account/api/account/notify', async route => {
      assert.equal(route.request().headers()['x-inflite-owner'],owner);
      if (route.request().method() === 'PATCH') Object.assign(email,route.request().postDataJSON());
      await route.fulfill({json:email});
    });
    await search.fill('email preferences');
    await page.locator('[data-setting=emails]').click();
    const fixed = page.getByRole('switch',{name:'When a reported problem is fixed'});
    await fixed.uncheck();
    await page.waitForFunction(() => !document.querySelector('.settings-preferences fieldset')?.disabled);
    assert.equal(email.account.fixed,false);
    await page.keyboard.press('Escape');
    await search.fill('unfindable setting');
    await page.getByText('No matching settings',{exact:true}).waitFor();
    await search.fill('');
    await page.locator('[data-category=notifications]').click();
    await page.getByRole('switch',{name:'Quiet hours',exact:true}).waitFor();
    assert.equal(new URL(page.url()).hash,'#settings=notifications');
    await page.goBack();
    await page.locator('[data-category=notifications]').waitFor();
    assert.deepEqual(errors,[]);
  } finally { await ctx.close(); }
});

// Sample the exposed app gutter from a whole viewport screenshot. Cropped
// WebKit screenshots can omit composited fixed layers.
async function wallpaperPixels(page) {
  await page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
  const {PNG} = require('playwright-core/lib/utilsBundle');
  const shot = PNG.sync.read(await page.screenshot());
  return Array.from({length:64}, (_, i) => shot.data.readUInt32BE(((300 + i) * shot.width + 2) * 4));
}

test('Midnight Lava carries the same visible scene through the app drawer, Calendar and a reload', async () => {
  const {ctx, page, errors} = await open({initialPath:'/?os=1', scheme:'dark', hubApps:{calendar:true}, viewApps:{calendar:true}});
  try {
    await page.locator('html[data-midnight-lava] .sky canvas').waitFor();
    const image = () => page.locator('.sky canvas').evaluate(c => c.toDataURL());
    await page.evaluate(async () => (await import('/roof/wallpaper.js')).setWallpaperColour('lagoon'));
    const first = await image();
    await page.evaluate(() => { window.wallpaperNode = document.querySelector('.sky canvas'); });
    async function checkVisibleScene() {
      const sky = page.locator('.sky canvas');
      const visible = await wallpaperPixels(page);
      const expected = await sky.evaluate(c => {
        const copy = document.createElement('canvas');
        copy.width = c.clientWidth; copy.height = c.clientHeight;
        const raster = copy.getContext('2d');
        raster.drawImage(c, 0, 0, copy.width, copy.height);
        return Array.from(raster.getImageData(2, 300, 1, 64).data);
      });
      // The compositor and Canvas2D can interpolate the low-resolution artwork
      // slightly differently. Compare the painted colours with the scaled scene.
      const meanError = visible.reduce((sum, pixel, i) => {
        for (let j = 0; j < 3; j++) sum += Math.abs((pixel >>> (24 - j * 8) & 255) - expected[i * 4 + j]);
        return sum;
      }, 0) / (visible.length * 3);
      assert.ok(meanError < 3, 'painted gutter should match the wallpaper, mean colour error ' + meanError);
      assert.ok(await sky.evaluate(c => c === window.wallpaperNode));
      assert.equal(await image(), first);
    }
    await checkVisibleScene();
    await page.evaluate(async () => (await import('/roof/wallpaper.js')).setWallpaper('still'));
    await page.emulateMedia({reducedMotion:'no-preference'});
    await page.locator('.ws-dock-launcher').click();
    await page.getByRole('dialog', {name:'Your apps'}).getByRole('button', {name:'Calendar', exact:true}).click();
    await page.locator('.m-calendar:visible').waitFor();
    await page.waitForFunction(() => !document.documentElement.dataset.vt && !document.querySelector('.ifl-screen[class*="ifl-enter-"]'));
    await checkVisibleScene();
    await page.goBack();
    await page.locator('#workspace[data-mode=today]').waitFor();
    await page.waitForFunction(() => !document.documentElement.dataset.vt && !document.querySelector('.ifl-screen[class*="ifl-enter-"]'));
    await checkVisibleScene();
    await page.goto(origin + '/?os=1');
    await page.locator('html[data-midnight-lava] .sky canvas').waitFor();
    assert.equal(await page.locator('html').getAttribute('data-midnight-lava'), 'lagoon');
    assert.equal(await image(), first, 'same-tab navigation restores the colourway and exact still frame');
    await page.evaluate(async () => (await import('/roof/wallpaper.js')).setWallpaper('lava'));
    await page.waitForFunction(before => document.querySelector('.sky canvas').toDataURL() !== before, first);
    await page.emulateMedia({colorScheme:'light'});
    await page.waitForFunction(() => !document.documentElement.hasAttribute('data-midnight-lava'));
    assert.deepEqual(errors, []);
  } finally { await ctx.close(); }
});

test('app launch keeps exposed wallpaper pixels stationary throughout the transition', async () => {
  const {ctx, page} = await open({initialPath:'/?os=1', scheme:'dark', hubApps:{calendar:true}, viewApps:{calendar:true}});
  try {
    await page.evaluate(async () => (await import('/roof/wallpaper.js')).setWallpaper('still'));
    await page.emulateMedia({reducedMotion:'no-preference'});
    const calendar = page.locator('.ws-dock [data-launcher-app=calendar]');
    await calendar.waitFor();
    const stationary = await wallpaperPixels(page);
    await calendar.click();
    const motion = await page.waitForFunction(() => {
      const animations = document.getAnimations().filter(a =>
        a.effect?.target?.id === 'm-calendar' || a.animationName?.startsWith('ifl-launch'));
      if (!animations.length) return false;
      for (const animation of animations) animation.pause();
      return animations;
    });
    for (const fraction of [.05, .5, .9]) {
      await motion.evaluate((animations, f) => {
        for (const a of animations) a.currentTime = f * a.effect.getTiming().duration;
      }, fraction);
      const pixels = await wallpaperPixels(page);
      assert.deepEqual(pixels, stationary, 'wallpaper changed at ' + fraction * 100 + '% of launch');
    }
    await motion.evaluate(animations => animations.forEach(a => a.finish()));
    await page.locator('.m-calendar:visible').waitFor();

    // With live drift enabled, returning home should animate only the feed.
    const sky = await page.locator('.sky canvas').elementHandle();
    await page.evaluate(async () => (await import('/roof/wallpaper.js')).setWallpaper('lava'));
    await page.locator('.ws-dock [data-ws-action=today]').evaluate(button => button.click());
    const returning = await page.waitForFunction(() => {
      const screen = document.querySelector('#workspace');
      const animation = screen?.querySelector('.ws-canvas')?.getAnimations()[0];
      if (!animation) return false;
      animation.pause();
      return animation;
    });
    assert.equal(await page.locator('#workspace').evaluate(n => n.getAnimations().length), 0);
    assert.equal(await sky.evaluate(c => c === document.querySelector('.sky canvas')), true);
    await returning.evaluate(a => a.finish());
    const before = await sky.evaluate(c => c.toDataURL());
    await page.waitForFunction(pixels => document.querySelector('.sky canvas').toDataURL() !== pixels, before);
  } finally { await ctx.close(); }
});

test('system glass refracts the dock edge, keeps its centre clear and follows appearance settings', async () => {
  const {ctx, page, errors} = await open({initialPath:'/?os=1', scheme:'dark'});
  try {
    const dock = page.locator('.ws-dock:visible');
    await dock.waitFor();
    await page.evaluate(async () => {
      (await import('/roof/wallpaper.js')).setWallpaper('still');
      InFliteAppearance.setGlass({glass:true, glassStrength:100}, {preview:true});
    });
    const mode = await page.locator('html').getAttribute('data-refractor');
    assert.equal(mode, process.env.WEB_UI_BROWSER === 'webkit' ? 'wallpaper' : 'backdrop');
    const box = await dock.boundingBox();
    // Uniform stripes make a displaced sample distinguishable from blur or a flat tint.
    await dock.evaluate(n => {
      n.style.setProperty('background','transparent','important');
      n.style.setProperty('--ifl-glass-blur','blur(0px)','important');
      for (const child of n.children) child.style.setProperty('visibility','hidden','important');
    });
    const row = await page.evaluate(async ({mode, box}) => {
      const stripe = 'repeating-linear-gradient(90deg, #040404 0 8px, #fafafa 8px 16px)';
      const bg = document.createElement('div');
      Object.assign(bg.style,{position:'fixed', inset:'0', zIndex:'7', background:stripe, pointerEvents:'none'});
      document.querySelector('.ws-dock').before(bg);
      if (mode === 'wallpaper') {
        const sky = document.querySelector('.sky canvas');
        const raster = document.createElement('canvas');
        raster.width = sky.width; raster.height = sky.height;
        const c = raster.getContext('2d');
        c.fillStyle = '#040404';
        c.fillRect(0,0,raster.width,raster.height);
        c.fillStyle = '#fafafa';
        c.fillRect(0,0,Math.ceil((box.x + 22) * raster.width / sky.clientWidth),raster.height);
        (await import('/roof/refractor.js')).wallpaperFrame(sky,c.getImageData(0,0,raster.width,raster.height));
      }
      await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
      return Math.floor(box.y + box.height/2);
    }, {mode, box});
    const {PNG} = require('playwright-core/lib/utilsBundle');
    const shot = async () => {
      await page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
      return PNG.sync.read(await page.screenshot());
    };
    const on = await shot();
    // Flatten only the optics, preserving the same tint, bevel and layered controls.
    await dock.evaluate((node, mode) => {
      if (mode === 'backdrop') {
        document.querySelector('#ifl-system-lens feDisplacementMap').setAttribute('scale','0');
      } else {
        const box = node.getBoundingClientRect(), sky = document.querySelector('.sky canvas').getBoundingClientRect();
        node.style.setProperty('--ifl-lens-size', sky.width+'px '+sky.height+'px');
        node.style.setProperty('--ifl-lens-position', (sky.left-box.left)+'px '+(sky.top-box.top)+'px');
      }
    }, mode);
    const off = await shot();
    const diff = x => Math.abs(on.data[4*(row*on.width+x)] - off.data[4*(row*off.width+x)]);
    let bend = 0;
    for(let i=2;i<Math.min(28,box.width/4);i++) bend += diff(Math.floor(box.x)+i);
    assert.ok(bend > 40, 'bevel must visibly shift the striped backdrop: ' + bend);
    assert.ok(diff(Math.floor(box.x+box.width/2)) < 5, 'centre samples the original backdrop');
    await page.evaluate(()=>InFliteAppearance.setGlass({glassStrength:0},{preview:true}));
    assert.equal(await page.locator('html').getAttribute('data-refractor'),null);
    await page.evaluate(()=>InFliteAppearance.cancelGlassPreview());
    assert.equal(await page.locator('html').getAttribute('data-refractor'),mode);
    await page.emulateMedia({contrast:'more'});
    await page.waitForFunction(() => !document.documentElement.hasAttribute('data-refractor'));
    assert.deepEqual(errors, []);
  } finally { await ctx.close(); }
});

test('Lava drawer follows a short drag, rotates in place and releases the dock on dismissal', async () => {
  const {ctx,page,errors} = await open({initialPath:'/?os=1',scheme:'dark',motion:'no-preference'});
  try {
    await page.evaluate(async () => (await import('/roof/wallpaper.js')).setWallpaper('still'));
    const launcher = page.locator('.ws-dock-launcher');
    await launcher.click();
    const drawer = page.getByRole('dialog',{name:'Your apps'});
    await drawer.evaluate(n => Promise.allSettled(n.getAnimations().map(a=>a.finished)));
    const head = await drawer.locator('.ifs-head h2').boundingBox();
    const x = head.x + 8, y = head.y + head.height/2;
    await page.mouse.move(x,y);
    await page.mouse.down();
    const webkit = process.env.WEB_UI_BROWSER === 'webkit';
    const cropY = () => drawer.evaluate(n=>parseFloat(n.style.getPropertyValue('--ifl-lens-position').split(' ')[1]));
    const start = await cropY();
    await page.mouse.move(x,y+24,{steps:6});
    await page.waitForFunction(()=>document.querySelector('dialog.dragging')?.style.getPropertyValue('--drag') === '24px');
    if (webkit) await page.waitForFunction(start => {
      const d = document.querySelector('dialog.dragging');
      return parseFloat(d?.style.getPropertyValue('--ifl-lens-position').split(' ')[1]) < start-18;
    },start);
    await page.mouse.up();
    if (webkit) await page.waitForFunction(start => {
      const d = document.querySelector('dialog[open]');
      return Math.abs(parseFloat(d?.style.getPropertyValue('--ifl-lens-position').split(' ')[1])-start)<2;
    },start);
    await page.setViewportSize({width:820,height:390});
    await drawer.locator('.ifs-head h2').scrollIntoViewIfNeeded();
    if (webkit) await page.waitForFunction(()=>parseFloat(document.querySelector('dialog[open]').style.getPropertyValue('--ifl-lens-size'))>820);
    const landscape = await drawer.locator('.ifs-head h2').boundingBox();
    await page.mouse.move(landscape.x+8,landscape.y+12);
    await page.mouse.down();
    await page.mouse.move(landscape.x+8,landscape.y+148,{steps:3});
    await page.mouse.up();
    await drawer.waitFor({state:'detached'});
    await launcher.click();
    await drawer.waitFor();
    assert.deepEqual(errors,[]);
  } finally { await ctx.close(); }
});

test('a signed-in shell applies an offered update once the visible work finishes', async () => {
  const {ctx,page} = await open({initialPath:'/?os=1'});
  try {
    const target = '90.1.1';
    await page.route('**/version', r => r.fulfill({json:{build:target}}));
    await page.evaluate(build => {
      const task = document.createElement('div');
      task.id = 'pending-update-test';
      task.setAttribute('aria-busy','true');
      task.textContent = 'Saving';
      document.body.append(task);
      IFL.offer(build);
    },target);
    assert.ok(await page.evaluate(()=>IFL.updateReady()));
    const navigated = page.waitForEvent('load',{timeout:4500});
    await page.evaluate(build => {
      document.getElementById('pending-update-test').hidden = true;
      IFL.offer(build);
    },target);
    await navigated;
    assert.equal(await page.evaluate(()=>JSON.parse(sessionStorage.getItem('ifl-upd:today')).build),target);
  } finally {await ctx.close();}
});

test('Settings recovers a stalled read and reconciles an unconfirmed appearance save without replaying it', async () => {
  const {page,ctx} = await open({initialPath:'/#settings',waitForDay:false});
  try {
    const owner = fixture('session').user.id;
    let stuck = true, writes = 0;
    let prefs = {appearance:'auto',palette:'inflite',glass:true,glassStrength:55};
    await page.evaluate(() => {
      const timeout = AbortSignal.timeout.bind(AbortSignal);
      AbortSignal.timeout = ms => timeout(ms === 12000 ? 250 : ms);
    });
    await page.route('**/account/api/account/appearance', route => {
      if (!stuck) return route.fulfill({json:{id:owner,signedIn:true,...prefs}});
    });
    await page.route('**/account/api/account/prefs', route => {
      prefs = {...prefs,...route.request().postDataJSON()};
      writes++;
      return route.abort('failed');
    });
    await page.getByRole('searchbox',{name:'Search settings'}).fill('liquid glass');
    await page.getByRole('button',{name:/Appearance Theme/}).click();
    await page.getByText('Account took too long to respond. Try again.').waitFor();
    stuck = false;
    await page.getByRole('button',{name:'Try again',exact:true}).click();
    await page.getByRole('combobox',{name:'Mode',exact:true}).selectOption('dark');
    await page.getByRole('button',{name:'Reload preferences'}).click();
    await page.waitForFunction(()=>document.querySelector('.settings-appearance select')?.value === 'dark');
    assert.equal(writes,1);
  } finally { await ctx.close(); }
});

test('repeated and overlapping search terms preserve each result’s original label', async () => {
  const {page,ctx} = await open();
  try {
    const labels = await page.evaluate(async () => {
      const [{match},{highlight},ui] = await Promise.all([
        import('/roof/search.js'), import('/roof/search-render.js'), import('/roof/ui.js')
      ]);
      return ['wea weather','weather weather','forecast weather'].map(query => {
        const title = 'Weather forecast', row = ui.row({title});
        highlight(ui,row,title,match(query,title).hits);
        return row.querySelector('b').textContent;
      });
    });
    assert.deepEqual(labels,Array(3).fill('Weather forecast'));
  } finally { await ctx.close(); }
});

test('an unconfirmed sign-out keeps this account usable and the same control can retry', async () => {
  let attempts = 0;
  const {ctx,page} = await open({initialPath:'/#settings',waitForDay:false,intercept:async (route,{url})=>{
    if (url.pathname !== '/api/logout') return false;
    attempts++;
    await route.fulfill({status:attempts===1 ? 503 : 200,json:attempts===1 ? {error:'Busy'} : {ok:true}});
    return true;
  }});
  try {
    await page.getByRole('searchbox',{name:'Search settings'}).fill('Sign out');
    const button = page.locator('#youOut');
    await button.waitFor();
    const before = await page.evaluate(()=>{
      localStorage.setItem('today:push','keep-push-on-failure');
      return [location.href,history.length,localStorage.getItem('today:session')];
    });
    await button.click();
    await page.getByText('Couldn’t confirm sign-out. Try again.',{exact:true}).first().waitFor();
    assert.deepEqual(await page.evaluate(()=>[location.href,history.length,localStorage.getItem('today:session')]), before);
    assert.equal(await page.evaluate(()=>localStorage.getItem('today:push')),'keep-push-on-failure');
    assert.equal(await button.isEnabled(),true);
    await button.click();
    await page.waitForURL(url=>url.hash.startsWith('#signout=') || url.hostname === 'auth.inflite.ai');
    assert.equal(attempts,2);
  } finally { await ctx.close(); }
});

test('after sign-in the shell restores a local destination and discards a stale external destination', async () => {
  const {ctx,page} = await open({intercept:async (route,{url,view})=>{
    if (url.pathname !== '/api/auth/handback') return false;
    await route.fulfill({json:view});
    return true;
  }});
  try {
    for (const destination of ['https://elsewhere.example/','/#settings']) {
      await page.evaluate(path=>{
        sessionStorage.setItem('inflite:signin-verifier','sample-verifier');
        sessionStorage.setItem('inflite:signin-then',path);
      },destination);
      await page.goto(origin + '/?callback#signin=sample');
      if (destination === '/#settings') {
        await page.getByRole('searchbox',{name:'Search settings'}).waitFor();
        assert.equal(new URL(page.url()).hash,'#settings');
      } else {
        await page.locator('#top .day-top').waitFor();
        assert.equal(new URL(page.url()).origin,origin);
      }
      assert.equal(await page.evaluate(()=>sessionStorage.getItem('inflite:signin-then')),null);
    }
  } finally { await ctx.close(); }
});
