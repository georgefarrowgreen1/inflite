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
      const type = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp' }[extname(file)] || 'application/octet-stream';
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
    await page.evaluate(async () => {
      (await import('/roof/wallpaper.js')).setWallpaper('plain');
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
    await page.evaluate(async () => {
      (await import('/roof/wallpaper.js')).setWallpaper('plain');
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

async function open({ width = 390, deviceScaleFactor = 1, scheme = 'light', answer = day, signedIn = true, preferences, intercept, beforeNavigate, initialPath = '/', waitForDay = true, waitForReady = true, legacyShell = false, seedSession, seedCards, seedHub, blockBootstrap = false, user, viewApps, hubApps = {}, serviceWorkers = 'block', iosHomeScreen = false, iphoneViewport = false, motion = 'reduce', noViewTransitions = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height: 844 }, deviceScaleFactor, colorScheme: scheme, reducedMotion: motion,
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
  if (beforeNavigate) await beforeNavigate(page);
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
      // The reported viewport and the CSS viewport lengths can settle on different frames.
      await page.waitForFunction(({width,height}) => {
        const minHeight = parseFloat(getComputedStyle(document.querySelector('#out')).minHeight);
        return innerWidth === width && innerHeight === height && Math.abs(minHeight - height) < 1;
      }, viewport);
      const { entry, logo, label, signIn } = await page.locator('#out .ifl-entry').evaluate(panel => {
        const bounds = selector => panel.querySelector(selector).getBoundingClientRect().toJSON();
        return { entry: panel.getBoundingClientRect().toJSON(), logo: bounds('.ifl-logo'),
          label: bounds('.ifl-entry-title'), signIn: bounds('#signin') };
      });
      const size = `${viewport.width}×${viewport.height}`;
      assert.ok(logo.bottom <= label.top && label.bottom <= signIn.top,
        `${size}: the logo, title and sign-in button are stacked (${logo.bottom}, ${label.top}, ${label.bottom}, ${signIn.top})`);
      assert.ok(entry.top >= 0 && entry.bottom <= viewport.height, `${size}: the entry fits vertically (${entry.top}, ${entry.bottom})`);
      assert.ok(Math.abs(entry.x + entry.width / 2 - viewport.width / 2) < 2, `${size}: the entry is centred`);
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

for (const cached of [false, true]) test(`a malformed Today response recovers with ${cached ? 'a cached' : 'no cached'} day`, async () => {
  let reads = 0;
  const saved = structuredClone(day);
  delete saved.v;
  const { ctx, page, requests, errors } = await open({
    waitForDay: false,
    seedCards: cached ? { id: fixture('session').user.id, answer: saved } : undefined,
    intercept: async (route, { url }) => {
      if (url.pathname !== '/api/today' || ++reads !== 1) return false;
      await route.fulfill({ json: cached ? { cards: [] } : { message: 'Unexpected result' } });
      return true;
    },
  });
  try {
    if (cached) {
      await page.getByText('Couldn’t update. Showing your last saved day.', { exact: true }).waitFor({ timeout: 10000 });
      assert.equal(await page.locator('.tcard[data-app="weather"]').isVisible(), true);
      await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    } else {
      await page.getByText('Today couldn’t load', { exact: true }).waitFor({ timeout: 10000 });
      await page.getByRole('button', { name: 'Try Again', exact: true }).click();
    }
    await page.locator('#top .day-top').waitFor();
    assert.equal(requests.filter(r => r.path === '/api/today' && r.method === 'GET').length, 2);
    assert.deepEqual(errors, []);
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

for (const scenario of [
  {name:'slow opening', width:390, motion:'no-preference', paint:true},
  {name:'fast opening', width:390, motion:'no-preference', paint:false},
  {name:'opening with Reduce Motion', width:1440, motion:'reduce', paint:true},
]) test(`${scenario.name} hands off to the ready shell without waiting for the day`, async () => {
  let allowSession, allowDay;
  const session = new Promise(resolve => allowSession = resolve);
  const cards = new Promise(resolve => allowDay = resolve);
  const t = await open({width:scenario.width, motion:scenario.motion, waitForReady:false,
    intercept:async (route,{url,view,answer}) => {
      if (url.pathname === '/api/session') {
        await session;
        await route.fulfill({json:view});
        return true;
      }
      if (url.pathname === '/api/today') {
        await cards;
        await route.fulfill({json:answer});
        return true;
      }
      return false;
    }});
  try {
    const orb = t.page.locator('#sessionState .opening-orb');
    await orb.waitFor();
    if (scenario.paint) await t.page.waitForFunction(() => getComputedStyle(document.querySelector('.opening-orb')).opacity === '1');
    else await orb.evaluate(node => {
      const opening = node.getAnimations().find(animation => animation.animationName === 'loading-appear');
      opening.pause();
      opening.currentTime = 0;
    });
    assert.equal(await orb.evaluate(node => getComputedStyle(node,'::after').animationName),
      scenario.motion === 'reduce' ? 'none' : 'opening-drift');
    await t.page.evaluate(() => {
      window.openingHandoff = [];
      new MutationObserver(changes => {
        for (const change of changes) for (const node of change.addedNodes) {
          if (node.matches?.('.opening-exit')) window.openingHandoff.push({
            hidden:node.getAttribute('aria-hidden'), input:getComputedStyle(node).pointerEvents
          });
        }
      }).observe(document.body,{childList:true});
    });
    allowSession();
    await t.page.locator('#in:not([hidden])').waitFor();
    assert.equal(await t.page.locator('#sessionState').isVisible(),false);
    assert.equal(await t.page.locator('#top .day-top').count(),0,'the day is still pending');
    const handoff = await t.page.evaluate(() => openingHandoff);
    assert.deepEqual(handoff,scenario.paint && scenario.motion !== 'reduce' ? [{hidden:'true',input:'none'}] : []);
    await t.page.locator('.opening-exit').waitFor({state:'detached'});
    allowDay();
    await t.page.locator('#top .day-top').waitFor();
    assert.deepEqual(t.errors,[]);
    assert.deepEqual(await t.page.evaluate(() => window.__csp),[]);
  } finally { allowSession(); allowDay(); await t.ctx.close(); }
});

test('a failed bootstrap script keeps a public shell and eventually offers recovery', async () => {
  const t=await open({waitForReady:false,blockBootstrap:true});
  try {
    await t.page.locator('.opening-orb').waitFor();
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

test('Quick Capture stays against the mobile keyboard as the viewport changes', async () => {
  const { ctx, page, errors } = await open({ initialPath: '/?os=1', iphoneViewport: true });
  try {
    await page.getByRole('button', { name: 'Quick Capture', exact: true }).tap();
    const capture = page.getByRole('dialog', { name: 'Quick Capture', exact: true });
    const field = capture.getByRole('textbox', { name: 'Capture text' });
    await field.waitFor({ timeout: 5000 });
    assert.equal(await field.evaluate(node => node === document.activeElement), true);

    const placement = () => capture.evaluate(async dialog => {
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const { top, bottom } = dialog.getBoundingClientRect();
      const viewport = visualViewport;
      const save = dialog.querySelector('.life-capture > button').getBoundingClientRect();
      return { top, bottom, visibleTop: viewport.offsetTop, visibleBottom: viewport.offsetTop + viewport.height,
        saveBottom: save.bottom, keyboard: dialog.classList.contains('ifs-kb') };
    });
    const moveKeyboard = async (height, offset = 0, event = 'resize') => {
      await page.evaluate(([height, offset, event]) => __viewport(height, offset, event), [height, offset, event]);
      await page.waitForFunction(() => {
        const dialog = document.querySelector('dialog[data-sheet="quick-capture"]');
        const { height, offsetTop } = visualViewport;
        return Math.abs(dialog.getBoundingClientRect().bottom - height - offsetTop) <= 1;
      }, null, { timeout: 1500 });
      return placement();
    };
    for (const [height, offset, event] of [[500, 0, 'resize'], [450, 36, 'scroll']]) {
      const geometry = await moveKeyboard(height, offset, event);
      const { top, bottom, visibleTop, saveBottom, keyboard } = geometry;
      assert.equal(keyboard, true);
      assert.ok(top >= visibleTop, JSON.stringify(geometry));
      assert.ok(saveBottom <= bottom, 'Save is above the keyboard');
    }
    await page.setViewportSize({ width: 390, height: 480 });
    assert.equal((await moveKeyboard(480)).keyboard, true, 'the keyboard can resize the layout as well');
    await page.setViewportSize({ width: 390, height: 844 });

    const compact = await moveKeyboard(270);
    assert.ok(compact.top > 0 && Math.abs(compact.bottom - compact.visibleBottom) <= 1, JSON.stringify(compact));
    await capture.getByRole('button', { name: 'Save note' }).scrollIntoViewIfNeeded();
    const scrolled = await placement();
    assert.ok(scrolled.saveBottom <= scrolled.visibleBottom, 'Save remains reachable on a short viewport');
    const restored = await moveKeyboard(844);
    assert.equal(restored.keyboard, false);
    assert.ok(Math.abs(restored.bottom - restored.visibleBottom) <= 1);
    await capture.getByRole('button', { name: 'Close', exact: true }).tap();
    await capture.waitFor({ state: 'detached' });
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
    await page.waitForFunction(() => {
      const field = document.activeElement;
      if (!field?.matches('input[aria-label="Test field"]')) return false;
      const body = field.closest('.ifs-body').getBoundingClientRect();
      const box = field.getBoundingClientRect();
      return box.top >= body.top - 1 && box.bottom <= body.bottom + 1;
    }, null, { timeout: 1500 });
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
    const parentScroll = await page.evaluate(async () => {
      const { el } = await import('/roof/ui.js');
      window.__parent = __sheets.open({ title: 'Parent', body: el('div', {},
        ...Array.from({ length: 40 }, (_, i) => el('p', { text: `Parent content ${i}` }))) });
      __parent.el.scrollTop = 360;
      const before = __parent.el.scrollTop;
      const field = el('input', { 'aria-label': 'Child field' });
      const child = __sheets.open({ title: 'Child', body: field, focus: field });
      __viewport(480);
      const during = __parent.el.scrollTop;
      child.now();
      const after = __parent.el.scrollTop;
      __viewport(844);
      return { before, during, after };
    });
    assert.ok(parentScroll.before > 0);
    assert.deepEqual(parentScroll, { before: parentScroll.before, during: parentScroll.before, after: parentScroll.before });
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

for (const start of ['plain','high contrast']) test(`orb rendering loads on demand after a ${start} startup`, async () => {
  const requests=[];
  const renderer=/\/roof\/(bubbles|bubble-surface)\.js(?:\?|$)/;
  const {ctx,page,errors}=await open({initialPath:'/#settings',waitForDay:false,beforeNavigate:async page => {
    if (start==='plain') await page.addInitScript(() => localStorage.setItem('inflite:dark-wallpaper','plain'));
    else await page.emulateMedia({contrast:'more'});
    page.on('request',r => {if (renderer.test(r.url())) requests.push(new URL(r.url()).pathname);});
  }});
  let unblock;
  try {
    await page.route('**/account/api/account/appearance',r => r.fulfill({json:{
      signedIn:true,id:fixture('session').user.id,appearance:'auto',palette:'inflite',glass:true,glassStrength:55
    }}));
    await page.getByRole('searchbox',{name:'Search settings'}).fill('orbs');
    await page.getByRole('button',{name:/Appearance Theme/}).click({timeout:5000});
    const picker=page.getByRole('combobox',{name:'Wallpaper on this device'});
    await picker.waitFor();
    assert.deepEqual(requests,[],'opening the shell and its appearance controls does not download the renderer');
    if (start==='plain') {
      const gate=new Promise(resolve => {unblock=resolve;});
      await page.route('**/roof/bubbles.js*',async route => {await gate; await route.continue();});
      const firstLoad=page.waitForRequest('**/roof/bubbles.js*',{timeout:5000});
      await picker.selectOption('still');
      await firstLoad;
      await picker.selectOption('plain');
      unblock();
      // Wait for module evaluation as well as network completion.
      await page.evaluate(async () => {await import('/roof/bubbles.js'); await new Promise(requestAnimationFrame);});
      assert.equal(await page.locator('html[data-midnight-lava]').count(),0,'a late import respects the newer Plain selection');
      await picker.selectOption('still');
    } else {
      await page.emulateMedia({contrast:'no-preference'});
    }
    await page.waitForFunction(() => {
      const canvas=document.querySelector('html[data-midnight-lava] .sky > canvas');
      const preview=document.querySelector('.settings-dock-preview > canvas');
      if (!canvas || !preview?.style.getPropertyValue('--scene-x')) return false;
      const copy=document.createElement('canvas');
      copy.width=preview.width; copy.height=preview.height;
      const context=copy.getContext('2d');
      context.drawImage(canvas,0,0,copy.width,copy.height);
      return context.getImageData(0,0,1,1).data[3]===255 && copy.toDataURL()===preview.toDataURL();
    },null,{timeout:5000});
    assert.ok(requests.includes('/roof/bubbles.js'));
    assert.deepEqual(errors,[]);
  } finally {unblock?.(); await ctx.close();}
});

for (const width of [320, 390, 1440]) test(`unified settings search and appearance at ${width}px`, async () => {
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
    await search.fill('orbs');
    const appearance = page.getByRole('button',{name:/Appearance Theme/});
    await appearance.waitFor();
    assert.equal(await page.locator('[data-setting=security]').isVisible(),false);
    await appearance.click();
    const mode = page.getByRole('radiogroup',{name:'Mode',exact:true});
    const dark = mode.getByRole('radio',{name:'Dark',exact:true});
    await mode.getByRole('radio',{name:'System',exact:true}).focus();
    await page.keyboard.press('ArrowLeft');
    await page.waitForFunction(() => InFliteAppearance.snapshot().appearance === 'dark' && !document.querySelector('.appearance-layout').disabled);
    assert.equal(await dark.isChecked(),true);
    assert.equal(await dark.evaluate(n => n === document.activeElement),true);
    assert.equal(pref.appearance,'dark');
    const wallpaper = page.getByRole('combobox', {name:'Wallpaper on this device'});
    assert.deepEqual(await wallpaper.locator('option').allTextContents(),['Orbs · drifting','Orbs · still','Plain']);
    await wallpaper.selectOption('plain');
    assert.equal(await page.locator('html[data-midnight-lava]').count(), 0);
    const colours = page.getByRole('group', {name:'Orb colour', exact:true});
    assert.equal(await colours.isVisible(), false);
    await wallpaper.selectOption('still');
    const canvas = page.locator('html[data-midnight-lava] .sky > canvas');
    await canvas.waitFor();
    const original = await canvas.evaluate(c => c.toDataURL());
    const rendered = new Set([original]);
    assert.equal(await colours.getByRole('radio', {name:'Opal',exact:true}).isChecked(),true);
    for (const colour of ['Jade','Cobalt','Lagoon','Midnight','Opal']) {
      await colours.getByRole('radio', {name:colour,exact:true}).check();
      assert.equal(await page.locator('html').getAttribute('data-midnight-lava'), colour.toLowerCase());
      const pixels = await canvas.evaluate(c => c.toDataURL());
      assert.equal(await page.locator('.settings-dock-preview > canvas').evaluate(preview => {
        const expected = document.createElement('canvas');
        expected.width = preview.width;
        expected.height = preview.height;
        expected.getContext('2d').drawImage(document.querySelector('.sky > canvas'), 0, 0, expected.width, expected.height);
        return expected.toDataURL() === preview.toDataURL();
      }),true);
      if (colour === 'Opal') assert.equal(pixels, original, 'colour changes preserve the exact orb scene');
      else rendered.add(pixels);
    }
    assert.equal(rendered.size, 5, 'each colourway paints distinct pixels');
    assert.ok(await page.locator('.settings-dock-preview > canvas').evaluate(canvas => {
      const frame = canvas.parentElement.getBoundingClientRect(), scene = canvas.getBoundingClientRect();
      const x = scene.left + scene.width * Number(canvas.style.getPropertyValue('--scene-x'));
      const y = scene.top + scene.height * Number(canvas.style.getPropertyValue('--scene-y'));
      return x >= frame.left && x <= frame.right && y >= frame.top && y <= frame.bottom;
    }), 'the preview includes the main orb on both wide and tall screens');
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
    const glass = page.getByRole('switch',{name:'Liquid Glass'});
    await glass.uncheck();
    await slider.waitFor({state:'hidden'});
    await glass.check();
    await slider.waitFor();
    assert.equal(await slider.inputValue(),'82');
    const palette = page.getByRole('combobox',{name:'Colour palette'});
    await palette.selectOption('graphite');
    await page.waitForFunction(()=>InFliteAppearance.snapshot().palette === 'graphite' && !document.querySelector('.appearance-layout').disabled);
    await mode.getByRole('radio',{name:'Light',exact:true}).click();
    await page.waitForFunction(()=>InFliteAppearance.snapshot().appearance === 'light' && !document.querySelector('.appearance-layout').disabled);
    assert.equal(await colours.getByRole('radio',{name:'Opal'}).isChecked(),true);
    const geometry = await page.locator('.settings-appearance').evaluate(n => ({
      content:n.scrollWidth, width:n.clientWidth,
      swatches:Array.from(n.querySelectorAll('.orb-swatches label'),label => [label.offsetWidth,label.offsetHeight]),
      modeHeight:n.querySelector('.appearance-mode [role=radio]').offsetHeight,
      slider:n.querySelector('input[type=range]').offsetWidth
    }));
    assert.ok(geometry.content <= geometry.width + 1);
    assert.ok(geometry.swatches.every(([w,h])=>w>=44 && h>=44));
    assert.ok(geometry.modeHeight>=44);
    assert.ok(geometry.slider>200);
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

for (const width of [320, 1440]) test(`About documents and Contact stay in Settings at ${width}px`, async () => {
  const messages = [];
  let outcome = 503;
  const {page,ctx,errors} = await open({width,initialPath:'/#settings=about',waitForDay:false,
    intercept:async (route,{url,request}) => {
      if (url.pathname !== '/api/contact') return false;
      messages.push({data:request.postDataJSON(),cookie:request.headers().cookie});
      await route.fulfill({status:outcome,json:outcome === 201 ? {ok:true} : {error:'Unavailable'}});
      return true;
    }});
  try {
    await ctx.addCookies([{name:'contact-fixture',value:'sample-session',url:page.url()}]);
    await page.evaluate(() => { window.aboutSettingsDocument = document; });
    const about = page.locator('#you [data-group=about]');
    const body = page.locator('.settings-document');
    await about.getByRole('link',{name:'Terms of use'}).waitFor();
    assert.equal(await about.getByRole('heading',{name:'About InFlite',exact:true}).count(),1);
    const footer = about.locator('footer');
    await footer.evaluate(el => el.scrollIntoView({behavior:'instant',block:'center'}));
    await page.waitForFunction(() => {
      const el = document.querySelector('#you [data-group=about] footer');
      if (!el) return false;
      const terms = el.previousElementSibling.querySelector('a:last-child').getBoundingClientRect();
      const brand = el.querySelector('strong').getBoundingClientRect();
      const gfg = el.querySelector('[aria-label="gfg"]').getBoundingClientRect();
      return el.getBoundingClientRect().top >= terms.bottom && brand.right <= gfg.left &&
        Math.max(brand.top,gfg.top) < Math.min(brand.bottom,gfg.bottom) && el.scrollWidth <= el.clientWidth;
    });
    const typeSizes = await about.locator('h2, .row .tx b, .row .val, footer, footer strong')
      .evaluateAll(elements => elements.map(el => getComputedStyle(el).fontSize));
    assert.equal(new Set(typeSizes).size,1);
    const lastRows = about.locator('.group > .row:nth-last-child(-n+5)');
    assert.deepEqual(await lastRows.allTextContents(), [
      'About the apps', 'Contact InFlite', 'Privacy notice', 'Cookies and device storage', 'Terms of use'
    ]);
    async function enter(title,key) {
      await about.getByRole('link',{name:title,exact:true}).click();
      await body.getByRole('heading',{name:title,exact:true}).waitFor();
      assert.equal(new URL(page.url()).pathname,'/');
      assert.equal(new URL(page.url()).hash,'#settings=about-' + key);
      assert.ok(await body.evaluate(n => n.scrollWidth <= n.clientWidth + 1));
    }
    const back = () => page.locator('.settings-document-back').click();
    await enter('About the apps','apps');
    await body.getByRole('heading',{name:'Calendar',exact:true}).waitFor();
    assert.equal(await body.locator('li').count(),10);
    await back();
    for (const [title,key,heading] of [
      ['Privacy notice','privacy','Your controls and rights'],
      ['Cookies and device storage','storage','Changing or clearing storage'],
      ['Terms of use','terms','Your choices and legal rights']
    ]) {
      await enter(title,key);
      await body.getByRole('heading',{name:heading,exact:true}).waitFor();
      await back();
    }
    await enter('Contact InFlite','contact');
    await body.getByLabel('Your name',{exact:true}).fill('Fixture Sender');
    await body.getByLabel('Email address',{exact:true}).fill('sender@example.test');
    const message = body.getByLabel('Message',{exact:true});
    await message.fill('A private draft for the support form.');
    await body.getByRole('link',{name:'Privacy notice',exact:true}).click();
    await body.getByRole('heading',{name:'Your controls and rights',exact:true}).waitFor();
    await page.goBack();
    assert.equal(await message.inputValue(),'A private draft for the support form.');
    const submit = body.getByRole('button',{name:'Send message'});
    await submit.click();
    await body.getByText(/Delivery couldn’t be confirmed/).waitFor();
    assert.equal(await message.inputValue(),'A private draft for the support form.');
    outcome = 201;
    await submit.click();
    await body.getByText(/Message received/).waitFor();
    assert.deepEqual(messages,Array(2).fill({data:{name:'Fixture Sender',email:'sender@example.test',
      message:'A private draft for the support form.',website:''},cookie:undefined}));
    assert.equal(await message.inputValue(),'');
    assert.equal(await page.evaluate(() => window.aboutSettingsDocument === document),true);
    assert.equal(await body.locator('iframe').count(),0);
    assert.deepEqual(errors,[]);
    assert.deepEqual(await page.evaluate(() => window.__csp),[]);
  } finally { await ctx.close(); }
});

for(const width of [390,1440])test(`People uses one profile for Chat friends and saved contacts at ${width}px`,async()=>{
  const apps={people:true,chats:true},existing='b'.repeat(32),records=new Map([[existing,{
    kind:'people',id:existing,title:'Existing contact',email:'existing@example.test',phone:'+44 7700 900000',links:[],version:1,updatedAt:1,
  }]]),writes=[];
  const {page,ctx,errors}=await open({width,scheme:width===390?'dark':'light',initialPath:'/?os=1',waitForDay:false,hubApps:apps,viewApps:apps,
    intercept:async (route,{url,request})=>{
      if(url.pathname==='/api/organise/list'){
        const {kind,q='',related}=request.postDataJSON();
        const result=kind==='people'?[...records.values()].filter(value=>
          value.title.toLowerCase().includes(q.toLowerCase())&&(!related||value.links.some(ref=>ref.app===related.app&&ref.id===related.id))):[];
        await route.fulfill({json:{records:result,cursor:null}});return true;
      }
      if(url.pathname!=='/api/organise/record')return false;
      if(request.method()==='PUT'){
        const {id,kind,value,version}=request.postDataJSON();
        writes.push(value);
        const record={id,kind,...value,version:version+1,updatedAt:Date.now()};
        records.set(id,record);await route.fulfill({json:{record}});return true;
      }
      const record=records.get(url.searchParams.get('id'));
      await route.fulfill({status:record?200:404,json:record?{record}:{error:'Missing contact'}});return true;
    }});
  try{
    const owner=fixture('session').user.id;
    await ctx.route('**/chats/roof/service.js',route=>route.fulfill({contentType:'text/javascript',body:`
      export async function startService(){
        const listeners=new Set(),owner=${JSON.stringify(owner)};
        let state='ready';
        const friends=[{id:'friend-1',name:'Taylor Friend',handle:'taylor',place:'Private location'},
          {id:'friend-2',name:'Jamie Friend',handle:'jamie'},{id:'friend-3',name:'Morgan Friend',handle:'morgan'},
          {id:'blocked-1',name:'Blocked person',blocked:true}];
        function publish(topic,data){
          for(const [key,callback] of listeners)if(key==='*')callback({topic,data});else if(key===topic)callback(data);
        }
        window.mockChatState=next=>{state=next;publish('state',{state});if(state==='ready'){publish('me',{id:owner});publish('friends',friends)}};
        return {get state(){return state},facade:{},release(){listeners.clear()},on(key,callback){
          const listener=[key,callback];listeners.add(listener);
          if(key==='*')for(const [topic,data] of [['state',{state}],['me',{id:owner}],['friends',friends],['groups',[{id:'group-1',name:'Hidden group'}]]])callback({topic,data});
          return ()=>listeners.delete(listener);
        }};
      }`}));
    await page.locator('.ws-dock-launcher').click();
    await page.getByRole('dialog',{name:'Your apps'}).getByRole('button',{name:'People',exact:true}).click();
    const people=page.locator('.m-people:visible');
    const row=name=>people.locator('.org-record').filter({hasText:name});
    await row('Taylor Friend').waitFor();
    assert.equal(await row('Blocked person').count(),0);
    assert.equal(await row('Hidden group').count(),0);
    assert.equal(await people.getByText('Private location').count(),0);
    assert.equal(writes.length,0);
    const profile=people.locator('.org-person');
    const details=profile.getByLabel('Contact details');
    const back=()=>page.getByRole('button',{name:'Back to Contacts',exact:true}).click();
    await row('Existing contact').click();
    await profile.getByRole('heading',{name:'Existing contact',exact:true}).waitFor();
    assert.ok(await details.getByText('existing@example.test',{exact:true}).isVisible());
    assert.ok(await details.getByRole('link',{name:'+44 7700 900000',exact:true}).isVisible());
    await profile.getByRole('button',{name:'Edit contact',exact:true}).waitFor();
    await save(page,`people-contact-${width}`);
    await back();
    const search=people.getByRole('searchbox',{name:'Search People'});
    await search.fill('@taylor');await row('Jamie Friend').waitFor({state:'hidden'});
    await row('Taylor Friend').click();
    await profile.getByRole('heading',{name:'Taylor Friend',exact:true}).waitFor();
    assert.equal(new URL(page.url()).hash,'#friend=friend-1');
    assert.equal(await page.getByRole('dialog',{name:'Chat friend',exact:true}).count(),0);
    assert.ok(await details.getByText('@taylor',{exact:true}).isVisible());
    const messageAction=profile.getByRole('button',{name:'Message',exact:true});
    const addDetails=profile.getByRole('button',{name:'Add details',exact:true});
    assert.ok(await messageAction.isVisible());
    assert.equal((await messageAction.boundingBox()).y,(await addDetails.boundingBox()).y);
    assert.ok(await profile.evaluate(node=>node.scrollWidth<=node.clientWidth+1));
    await save(page,`people-chat-friend-${width}`);
    await addDetails.click();
    const name=people.getByRole('textbox',{name:'Name',exact:true});
    await name.waitFor();assert.equal(await name.inputValue(),'Taylor Friend');
    assert.equal(writes.length,0);
    await people.getByRole('textbox',{name:'Email',exact:true}).fill('taylor@example.test');
    await people.getByRole('textbox',{name:'Contact notes',exact:true}).fill('Private contact notes');
    await people.getByRole('button',{name:'Save',exact:true}).click();
    await people.getByText('Saved to your account',{exact:true}).waitFor();
    assert.equal(writes[0].details,'Private contact notes');
    assert.deepEqual(writes[0].links,[{app:'chats',id:'friend-1'}]);
    assert.ok(await details.getByText('taylor@example.test',{exact:true}).isVisible());
    assert.ok(await details.getByText('@taylor',{exact:true}).isVisible());
    await back();
    await search.fill('');
    await row('Jamie Friend').click();
    await profile.getByRole('heading',{name:'Jamie Friend',exact:true}).waitFor();
    await people.getByText('More actions',{exact:true}).click();
    await people.getByRole('button',{name:'Link to existing contact',exact:true}).click();
    await page.getByRole('dialog',{name:'Choose a contact',exact:true}).getByRole('button',{name:'Existing contact',exact:true}).click();
    await name.waitFor();assert.equal(await people.getByRole('textbox',{name:'Email',exact:true}).inputValue(),'existing@example.test');
    await people.getByRole('button',{name:'Save',exact:true}).click();
    await people.getByText('Saved to your account',{exact:true}).waitFor();
    assert.deepEqual(writes[1].links,[{app:'chats',id:'friend-2'}]);
    await back();
    await row('Morgan Friend').waitFor();
    assert.equal(await row('Taylor Friend').count(),1);
    assert.equal(await row('Jamie Friend').count(),0);
    await row('Morgan Friend').click();
    await profile.getByRole('heading',{name:'Morgan Friend',exact:true}).waitFor();
    await page.evaluate(()=>mockChatState('locked'));
    await people.getByText('Chats is locked',{exact:true}).waitFor();
    assert.equal(await profile.count(),0);
    assert.equal(await people.getByText('@morgan',{exact:true}).count(),0);
    await back();
    await people.getByRole('link',{name:'Unlock Chats to see friends'}).waitFor();
    assert.equal(await people.getByText(/Chat friend/).count(),0);
    assert.equal(await row('Morgan Friend').count(),0);
    await row('Taylor Friend').waitFor();
    assert.deepEqual(errors,[]);
    assert.deepEqual(await page.evaluate(()=>window.__csp),[]);
  }finally{await ctx.close()}
});

for (const status of [200, 409]) test(`an older Notes save response (${status}) preserves a newer offline draft in another tab`, async () => {
  const ctx = await browser.newContext({serviceWorkers:'block'});
  const fixtureURL = origin + '/organise-journal-fixture';
  await ctx.route(fixtureURL, route => route.fulfill({contentType:'text/html',body:'<!doctype html><title>Draft journal fixture</title>'}));
  const page = await ctx.newPage();
  let release;
  const hold = new Promise(resolve => { release = resolve; });
  const id = 'a'.repeat(32);
  const initialise = async tab => tab.evaluate(async owner => {
    const { createStore } = await import('/organise/store.js');
    const signal = new AbortController().signal;
    window.testNoteStore = await createStore({ signal, session: { user: owner } }, 'notes');
  }, {id:fixture('session').user.id});
  const save = (tab, text) => tab.evaluate(({id, text}) =>
    testNoteStore.save(id, {title:'A shared note',text,links:[],checklist:[]}, {version:1}), {id, text});
  try {
    const other = await ctx.newPage();
    await other.addInitScript(() => Object.defineProperty(navigator, 'onLine', { get: () => false }));
    await Promise.all([page.goto(fixtureURL), other.goto(fixtureURL)]);
    await initialise(page);
    await page.route('**/api/organise/record', async route => {
      const request = route.request().postDataJSON();
      await hold;
      const json = status === 200
        ? {record:{id,kind:'notes',version:2,...request.value}}
        : {error:'This note was changed elsewhere.'};
      await route.fulfill({status,json});
    });
    const writeStarted = page.waitForRequest(request => request.url().endsWith('/api/organise/record') && request.method() === 'PUT');
    await save(page, 'First tab edit');
    await writeStarted;
    await initialise(other);
    await save(other, 'Second tab offline edit');
    release();
    await page.waitForFunction(status => status === 200
      ? testNoteStore.pending().length === 0
      : testNoteStore.pending().some(v => v.state === 'conflict'), status);
    await other.reload();
    await initialise(other);
    const saved = await other.evaluate(id => testNoteStore.pending().find(v => v.id === id)?.text, id);
    assert.equal(saved, 'Second tab offline edit');
    await assert.rejects(save(page, 'A further edit in the stale tab'), /A newer draft was kept in another tab/);
    const conflict = await page.evaluate(id => testNoteStore.pending().find(v => v.id === id), id);
    assert.equal(conflict.state, 'conflict');
    assert.equal(conflict.text, 'A further edit in the stale tab');
    assert.equal(await page.evaluate(() => testNoteStore.busy()), true);
    assert.deepEqual(await page.evaluate(() => testNoteStore.flush()), {lost:1});
    await other.reload();
    await initialise(other);
    assert.equal(await other.evaluate(id => testNoteStore.pending().find(v => v.id === id)?.text, id), saved);
  } finally { release(); await ctx.close(); }
});

// Sample the exposed app gutter from a whole viewport screenshot. Cropped
// WebKit screenshots can omit composited fixed layers.
async function wallpaperPixels(page) {
  await page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
  const {PNG} = require('playwright-core/lib/utilsBundle');
  const shot = PNG.sync.read(await page.screenshot());
  return Array.from({length:64}, (_, i) => shot.data.readUInt32BE(((300 + i) * shot.width + 2) * 4));
}

test('an orb bends locally under a press and its light travels outward after a tap', async () => {
  const {ctx,page} = await open({scheme:'dark'});
  try {
    const response = await page.evaluate(async () => {
      const {drawBubbles} = await import('/roof/bubbles.js');
      const {stepSurface} = await import('/roof/bubble-surface.js');
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 256;
      const raster = canvas.getContext('2d', {willReadFrequently:true});
      // Hold the geometry and the studio lights still to isolate the optical response.
      const body = {x:.5,y:.5,phase:.72,angle:.15,tempo:.05};
      const hit = {distance:0,x:0,y:0,amount:1};
      const frame = (live=true) => {
        drawBubbles(raster,[body],'opal',0,live);
        return raster.getImageData(0,0,256,256).data;
      };
      const rest = frame();
      function difference(inner,outer) {
        const pixels = frame();
        let changed = 0;
        for (let y=50; y<206; y++) for (let x=50; x<206; x++) {
          const r = Math.hypot(x-128,y-128);
          if (r < inner || r > outer) continue;
          const i = 4*(y*256+x);
          if ([0,1,2].some(c => Math.abs(rest[i+c]-pixels[i+c]) > 12)) changed++;
        }
        return changed;
      }
      for (let i=0; i<10; i++) stepSurface(body,1/60,hit,{down:true});
      const core = difference(0,24), distant = difference(48,68);
      let previous = frame(), subframes = 0;
      for (let i=0; i<8; i++) {
        stepSurface(body,1/240,hit,{down:true});
        const next = frame();
        if (next.some((v,j) => Math.abs(v-previous[j]) > 1)) subframes++;
        previous = next;
      }
      const still = frame(false).every((v,i) => rest[i] === v);
      stepSurface(body,1/60,hit,{tap:true,release:true});
      const early = difference(36,54);
      for (let i=0; i<32; i++) stepSurface(body,1/60,null,null);
      const outward = difference(36,54);
      for (let i=0; i<300; i++) stepSurface(body,1/60,null,null);
      return {core,distant,subframes,still,early,outward,settled:frame().every((v,i) => rest[i] === v)};
    });
    assert.ok(response.core > 100 && response.distant < 12, JSON.stringify(response));
    assert.ok(response.outward > response.early + 70, JSON.stringify(response));
    assert.equal(response.subframes,8, "the surface should change on every 240 Hz display tick");
    assert.ok(response.still && response.settled,JSON.stringify(response));
  } finally { await ctx.close(); }
});

test('a live orb keeps its display-resolution glass during a press and rolls in the direction of a flick', async () => {
  const scene = [[.50,.45],[.72,.79],[.15,.17],[.88,.10]].map(([x,y]) => ({
    x,y,vx:0,vy:0,dx:0,dy:0,turn:60,phase:.72,angle:0,tempo:.05
  }));
  const sceneKey = 'inflite:bubbles:v1';
  const {ctx,page,errors} = await open({initialPath:'/?os=1',scheme:'dark',deviceScaleFactor:3,seedHub:{[sceneKey]:JSON.stringify(scene)}});
  try {
    const sky = page.locator('.sky > canvas'), dock = page.locator('.ws-dock:visible');
    await dock.waitFor();
    await page.evaluate(() => {
      document.querySelector('.ws-home-body').style.visibility = 'hidden';
      InFliteAppearance.setGlass({glass:true,glassStrength:100},{preview:true});
    });
    const box = await sky.boundingBox(), x = box.x + box.width*.5, y = box.y + box.height*.45 - box.width*.13;
    await page.emulateMedia({reducedMotion:'no-preference'});
    await page.mouse.move(x-40,y);
    await page.mouse.down();
    await sky.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    assert.ok(await sky.evaluate(c => c.width/c.clientWidth > 2.99 && c.height/c.clientHeight > 2.99),
      'pressing one orb keeps the wallpaper at its resting 3× resolution');
    if (process.env.WEB_UI_BROWSER === 'webkit') {
      const {width} = await dock.boundingBox();
      await page.waitForFunction(w => [...document.querySelectorAll('.sky .ifl-orb-lens canvas')].some(c =>
        Math.abs(c.getBoundingClientRect().width-w)<1 && c.width >= Math.floor(w*2.99)),width);
    }
    await page.mouse.up();
    // Replay the same captured 60 ms touch in both engines. Software rendering
    // on a busy runner can separate two Playwright mouse calls by a full second.
    await page.evaluate(({x,y}) => {
      const target=document.elementFromPoint(x,y), start=performance.now()-65;
      const samples=[['touchstart',-40,0],['touchmove',-18,20],['touchmove',6,40],['touchend',34,60]];
      for (const [type,offset,dt] of samples) {
        const finger={identifier:7,clientX:x+offset,clientY:y};
        const event=new Event(type,{bubbles:true,cancelable:true});
        Object.defineProperties(event,{
          timeStamp:{value:start+dt},touches:{value:type==='touchend'?[]:[finger]},changedTouches:{value:[finger]}
        });
        target.dispatchEvent(event);
      }
    },{x,y});
    await sky.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const orb = await page.evaluate(key => {
      dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true}));
      return JSON.parse(sessionStorage.getItem(key))[0];
    },sceneKey);
    assert.ok(orb.x > .50 && orb.vx > .01 && Math.abs(orb.angle) > .001, JSON.stringify(orb));
    assert.deepEqual(errors,[]);
  } finally { await ctx.close(); }
});

test('a drifting light orb dents the heavy outline at contact and the rim recovers', async t => {
  const {ctx,page}=await open({width:390,scheme:'dark'});
  try {
    const runs=await page.evaluate(async () => {
      const {drawBubbles,driftBubbles}=await import('/roof/bubbles.js');
      const width=390,height=844,aspect=width/height;
      const canvas=document.createElement('canvas'); canvas.width=104; canvas.height=225;
      const raster=canvas.getContext('2d'), probe=document.createElement('canvas').getContext('2d');
      let silhouette, capture;
      const clip=raster.clip.bind(raster);
      raster.clip=(...args) => {
        if(args[0] instanceof Path2D) {
          silhouette=args[0];
          if(capture) {
            const matrix=new DOMMatrix().scale(width/canvas.width).multiply(raster.getTransform());
            const shape=new Path2D();
            shape.addPath(silhouette,matrix);
            capture.push({shape,x:matrix.e,y:matrix.f,r:Math.hypot(matrix.a,matrix.b)});
          }
        }
        clip(...args);
      };
      function path(body) {
        drawBubbles(raster,[body],'opal');
        const scaled=new Path2D();
        scaled.addPath(silhouette,new DOMMatrix().scale(256));
        return scaled;
      }
      function radius(shape,angle) {
        const x=Math.cos(angle), y=Math.sin(angle);
        let low=.4,high=1.4;
        for(let i=0;i<15;i++) {
          const r=(low+high)/2;
          if(probe.isPointInPath(shape,256*r*x,256*r*y)) low=r;
          else high=r;
        }
        return (low+high)/2;
      }
      function dent(orb,angle,measureWidth=false,shoulderAngle=0) {
        const actual=path(orb);
        // Keep the body's pose and breathing phase to isolate the collision
        // from its normal silhouette. Optical shading cannot change this clip.
        const rest=path({...orb});
        const inward=offset=>radius(rest,angle+offset)-radius(actual,angle+offset);
        const far=inward(Math.PI),depth=inward(0)-far;
        let breadth=0;
        if(measureWidth && depth>.001) {
          // Angular width of the half-depth contour, independent of peak height.
          for(let i=-24;i<=24;i++) if(inward(i*.025)>=depth*.5) breadth+=.025;
        }
        const shoulder=shoulderAngle ? -(inward(-shoulderAngle)+inward(shoulderAngle))/2 : 0;
        return {depth,breadth,far,shoulder};
      }
      function body(x,y,vx=0,vy=0) {
        return {x,y,vx,vy,dx:vx,dy:vy,phase:0,angle:0,tempo:.04,turn:60};
      }
      function pair(scene,lightRadius) {
        capture=[];
        drawBubbles(raster,scene,'opal');
        const byRadius=r=>capture.find(p=>Math.abs(p.r-width*r)<.01);
        const pair=[byRadius(.30),byRadius(lightRadius)];
        capture=null;
        return pair;
      }
      function gap([a,b]) {
        const dx=b.x-a.x,dy=b.y-a.y,distance=Math.hypot(dx,dy),nx=dx/distance,ny=dy/distance;
        let nearest=Infinity,centre=0;
        // Scan the two facing splines, including the shoulders of the dent.
        // A negative separation means the rendered bodies overlap.
        const edgeLimit=Math.floor(b.r*.72*2)/2;
        for(let offset=-edgeLimit;offset<=edgeLimit;offset+=.5) {
          const x=a.x-ny*offset,y=a.y+nx*offset;
          function edge(shape,fromA) {
            let low=0,high=distance;
            for(let i=0;i<14;i++) {
              const mid=(low+high)/2;
              if(probe.isPointInPath(shape,x+nx*mid,y+ny*mid)===fromA) low=mid;
              else high=mid;
            }
            return (low+high)/2;
          }
          const separation=edge(b.shape,false)-edge(a.shape,true);
          nearest=Math.min(nearest,separation);
          if(offset===0) centre=separation;
        }
        return {nearest,centre};
      }
      return [[.082,0],[.082,.003],[.037,.003]].map(([radius,sideways])=>{
        // The small orb drifts into the right shoulder of the large orb at
        // ordinary wallpaper speed. Mail and its dock can cover the other two.
        const heavy=body(.42,.51), light=body(heavy.x+.30+radius+.006,.51,-.006,sideways);
        const scene=[heavy,body(.74,.13),body(.25,.86)];
        scene.splice(radius===.082 ? 2 : 3,0,light);
        const start=pair(scene,radius),startGap=gap(start).nearest;
        let maxDent=0,angleAtPeak=0,recoil=0,lightResponse=0,peak,impactFrame,peakFrame,release;
        let centreError=0,farEdgeError=0,unexpectedStep=0;
        const lastOffsets=[0,0],paintedHeight=canvas.height*width/canvas.width;
        const samples=[];
        for(let i=0;i<240;i++) {
          driftBubbles(scene,1/60,aspect);
          const dx=light.x-heavy.x, dy=(light.y-heavy.y)/aspect;
          const angle=Math.atan2(dy,dx), nx=Math.cos(angle), ny=Math.sin(angle);
          recoil=Math.max(recoil,-heavy.vx*nx-heavy.vy*ny);
          if(impactFrame===undefined && recoil>.0001) impactFrame=i;
          lightResponse=Math.max(lightResponse,(light.vx+.006)*nx+(light.vy-sideways)*ny);
          const loading=impactFrame!==undefined && i-impactFrame<48;
          let painted;
          if(i%4===0 || loading) {
            const impression=dent(heavy,angle,loading && i-impactFrame<12,loading ? .55 : 0);
            if(loading) {
              const donor=dent(light,angle+Math.PI,false,.8);
              // The small facing cap follows the common seam. Track both free
              // shoulders to compare relaxation outside the touching surfaces.
              samples.push({heavy:impression.depth,breadth:impression.breadth,
                heavyShoulder:impression.shoulder,lightShoulder:donor.shoulder});
              painted=pair(scene,radius);
              // Follow both objects separately. Opposite whole-body lunges can
              // cancel in the pair's centre of mass even as both far edges jump.
              for (const [j,b,far] of [[0,heavy,impression.far],[1,light,donor.far]]) {
                const p=painted[j],toward=j===0?1:-1;
                const offset=toward*((p.x-b.x*width)*nx+(p.y-b.y*paintedHeight)*ny);
                centreError=Math.max(centreError,Math.abs(offset));
                farEdgeError=Math.max(farEdgeError,Math.abs(offset+far*p.r));
                unexpectedStep=Math.max(unexpectedStep,Math.abs(offset-lastOffsets[j]));
                lastOffsets[j]=offset;
              }
            }
            if(impression.depth>maxDent) {maxDent=impression.depth;angleAtPeak=angle;peak=painted || pair(scene,radius);peakFrame=i;}
          }
          if(i===impactFrame+8) release=painted || pair(scene,radius);
        }
        const end=pair(scene,radius),endGap=gap(end).nearest;
        const travelPx=start[0].x-end[0].x, lateral=light.vy;
        light.x=.80; light.y=.74; light.vx=light.vy=light.dx=light.dy=0;
        for(let i=0;i<300;i++) driftBubbles(scene,1/60,aspect);
        const recovered=Math.abs(dent(heavy,angleAtPeak).depth);
        function halfRecovery(key) {
          const high=Math.max(...samples.map(s=>s[key])),at=samples.findIndex(s=>s[key]===high);
          const half=samples.findIndex((s,i)=>i>at && s[key]<high*.5);
          return half>at ? (half-at)*1000/60 : 0;
        }
        const rising=samples.find(s=>s.heavy>=maxDent*.25),loaded=samples.find(s=>s.heavy===maxDent);
        // Report the local loss of radius in CSS pixels on the reference phone.
        return {dentPx:maxDent*width*.30,restPx:recovered*width*.30,travelPx,recoil,lightResponse,lateral,sideways,radius,
          centreError,farEdgeError,unexpectedStep,startGap,endGap,peakGap:gap(peak),releaseGap:gap(release),peakMs:Math.round((peakFrame-impactFrame)*1000/60),
          risingBreadth:rising?.breadth,loadedBreadth:loaded?.breadth,heavyHalf:halfRecovery('heavyShoulder'),lightHalf:halfRecovery('lightShoulder')};
      });
    });
    for(const run of runs) t.diagnostic(`${run.sideways?'Glancing':'Head-on'} impact at radius ${run.radius}: ${run.dentPx.toFixed(2)} px dent, ${run.startGap.toFixed(2)} px starting gap, ${run.peakGap.centre.toFixed(2)} px centreline at peak (${run.peakMs} ms, ${run.peakGap.nearest.toFixed(2)} px at shoulders), ${run.releaseGap.centre.toFixed(2)} px centreline at 133 ms, ${run.travelPx.toFixed(2)} px recoil, ${run.restPx.toFixed(2)} px residual.`);
    for(const run of runs) {
      assert.ok(run.startGap>1, 'the small orb starts visibly separated: '+JSON.stringify(run));
      assert.ok(run.dentPx>1, 'the heavy silhouette develops a visible, one-sided dent: '+JSON.stringify(run));
      assert.ok(run.centreError<1 && run.unexpectedStep<.5, 'compression keeps each painted centre on its physical trajectory: '+JSON.stringify(run));
      assert.ok(run.farEdgeError<1, 'the quiet side follows the body through the bump: '+JSON.stringify(run));
      assert.ok(run.peakGap.nearest<=1, 'the two rendered outlines touch during compression: '+JSON.stringify(run));
      assert.ok(Math.abs(run.peakGap.centre)<=1, 'the lighter orb sits against the centre of the dent: '+JSON.stringify(run));
      assert.ok(run.loadedBreadth>run.risingBreadth, 'the contact spreads across the rim as it loads: '+JSON.stringify(run));
      assert.ok(run.lightHalf>0 && run.heavyHalf>run.lightHalf, 'the smaller body relaxes sooner after its own peak: '+JSON.stringify(run));
      assert.ok(run.endGap>1, 'the two outlines part naturally after recoil: '+JSON.stringify(run));
      assert.ok(run.restPx<.3, 'the heavy rim recovers after separation: '+JSON.stringify(run));
      assert.ok(run.travelPx>.6, 'the heavy orb shifts away from the impact: '+JSON.stringify(run));
      assert.ok(run.recoil>0 && run.lightResponse>run.recoil*2, 'the smaller orb yields more than the heavier one: '+JSON.stringify(run));
      if(run.sideways) assert.ok(run.lateral>run.sideways*.25,'a glancing impact preserves travel along the rim');
    }
  } finally {await ctx.close();}
});

test('a travelling ripple updates only changed material and matches a full paint at 240 Hz', async () => {
  const {ctx,page}=await open();
  try {
    const result=await page.evaluate(async () => {
      const {paintSurface,outlineSegments,stepSurface}=await import('/roof/bubble-surface.js');
      const {minerals}=await import('/roof/bubble-colours.js');
      const radius=155, size=320, rim=new Float32Array(outlineSegments).fill(1);
      function raster() {
        const canvas=document.createElement('canvas');
        canvas.width=canvas.height=size;
        const ctx=canvas.getContext('2d',{willReadFrequently:true});
        ctx.setTransform(radius,0,0,radius,size/2,size/2);
        return ctx;
      }
      const a=raster(), b=raster(), fast={phase:.72,angle:.1,tempo:.05}, control={...fast};
      const inks=[{...minerals.opal},{...minerals.opal}];
      const paint=(ctx,body,ink,live)=>{
        // The scene paints a fresh sky beneath each material pass.
        ctx.clearRect(-2,-2,4,4);
        paintSurface(ctx,body,radius,rim,ink,0,live,6);
      };
      const read=ctx=>new Uint32Array(ctx.getImageData(0,0,size,size).data.buffer);
      const hit={x:.17,y:-.28,distance:.33,amount:1};
      const uploads=[];
      const proto=CanvasRenderingContext2D.prototype, original=proto.putImageData;
      let measure=false, mismatches=0, displayUpdates=0;
      try {
        proto.putImageData=function(image,...args) {
          if (measure) uploads.push(args.length===6 ? args[4]*args[5]/(image.width*image.height) : 1);
          return original.call(this,image,...args);
        };
        paint(a,fast,minerals.opal,true);
        let previous=read(a);
        for (let i=0;i<12;i++) {
          for (const body of [fast,control]) stepSurface(body,1/240,hit,{down:true});
          measure=true; paint(a,fast,minerals.opal,true); measure=false;
          // Alternate identical palettes to require a complete independent reshade.
          paint(b,control,inks[i%2],false);
          const pixels=read(a), reference=read(b);
          if (pixels.some((v,j)=>v!==previous[j])) displayUpdates++;
          for (let j=0;j<pixels.length;j++) if (pixels[j]!==reference[j]) mismatches++;
          previous=pixels;
        }
      } finally {proto.putImageData=original;}
      return {mismatches,displayUpdates,uploads};
    });
    assert.equal(result.mismatches,0,JSON.stringify(result));
    assert.ok(result.displayUpdates>=8,JSON.stringify(result));
    assert.ok(result.uploads.length>=8 && Math.max(...result.uploads)<.6,JSON.stringify(result));
  } finally {await ctx.close();}
});

test('shared studio light stays in place while an orb turns its pigment', async () => {
  const {ctx,page}=await open();
  try {
    const result=await page.evaluate(async () => {
      const {paintSurface,outlineSegments}=await import('/roof/bubble-surface.js');
      const {minerals}=await import('/roof/bubble-colours.js');
      const rim=new Float32Array(outlineSegments).fill(1), size=160, radius=75;
      const plain={...minerals.opal,body:'#484848',shade:'#484848',rim:Array(8).fill('#484848'),pearl:'#ffffff'};
      function frame(ink,phase,angle,index) {
        const canvas=document.createElement('canvas');
        canvas.width=canvas.height=size;
        const raster=canvas.getContext('2d',{willReadFrequently:true});
        raster.setTransform(radius,0,0,radius,size/2,size/2);
        paintSurface(raster,{phase,angle,tempo:.05},radius,rim,ink,index,false);
        return raster.getImageData(0,0,size,size).data;
      }
      const neutral=frame(plain,.1,0,0), turned=frame(plain,2.2,Math.PI/2,2);
      const opal=frame(minerals.opal,.72,0,0), rotated=frame(minerals.opal,.72,Math.PI/2,0);
      let lightChanged=0, pigmentChanged=0, min=255,max=0;
      for (let y=0;y<size;y++) for (let x=0;x<size;x++) {
        if (Math.hypot(x+.5-size/2,y+.5-size/2)>radius*.93) continue;
        const i=4*(y*size+x);
        min=Math.min(min,neutral[i]); max=Math.max(max,neutral[i]);
        if (neutral[i]!==turned[i]) lightChanged++;
        if ([0,1,2].some(c=>Math.abs(opal[i+c]-rotated[i+c])>12)) pigmentChanged++;
      }
      return {lightChanged,pigmentChanged,lightRange:max-min};
    });
    assert.ok(result.lightRange>35,'the neutral material should actually reflect a studio highlight');
    assert.equal(result.lightChanged,0,'a circular neutral surface shares its highlights across bodies and poses');
    assert.ok(result.pigmentChanged>150,JSON.stringify(result));
  } finally {await ctx.close();}
});

test('orb impacts keep unchanged wallpaper and distant glass outside the dirty region', async () => {
  const {ctx,page}=await open({deviceScaleFactor:3});
  try {
    const result=await page.evaluate(async () => {
      const {drawBubbles,sizeBubbleCanvas}=await import('/roof/bubbles.js');
      const {stepSurface}=await import('/roof/bubble-surface.js');
      const canvas=document.createElement('canvas');
      sizeBubbleCanvas(canvas,390,844);
      const raster=canvas.getContext('2d'), damage=[];
      const orb={x:.5,y:.35,phase:.72,angle:.1,tempo:.05};
      const paint=()=>drawBubbles(raster,[orb],'opal',.53,true,false,damage);
      paint();
      const local=[];
      for (let i=0;i<3;i++) {
        // A missed refresh advances the surface by 67 ms. Its tiny recoil
        // has moved the broad sky by less than one physical pixel in total.
        orb.x+=.2/canvas.width; orb.phase+=orb.tempo/15;
        stepSurface(orb,1/15,{distance:.5,x:.5,y:0,amount:1},{down:true});
        const moving=paint();
        local.push(moving && damage.length===1 && damage[0].bottom<.7);
      }
      orb.x+=1/canvas.width; orb.phase+=orb.tempo/15;
      const moved=paint();
      return {width:canvas.width,local,refreshed:moved && damage.length===0};
    });
    assert.deepEqual(result,{width:1170,local:[true,true,true],refreshed:true});
  } finally {await ctx.close();}
});

test('neighbour colours reach the facing rim and clear when the orbs drift apart', async () => {
  const {ctx,page}=await open();
  try {
    const results=await page.evaluate(async () => {
      const {drawBubbles}=await import('/roof/bubbles.js');
      const {rimColourAt}=await import('/roof/bubble-surface.js');
      const {minerals}=await import('/roof/bubble-colours.js');
      const width=400,height=220,x0=.34,farX=.93;
      function raster() {
        const c=document.createElement('canvas'); c.width=width; c.height=height;
        return c.getContext('2d',{willReadFrequently:true});
      }
      return [false,true].map(light=>{
        const scene=[x0,farX].map((x,i)=>({x,y:.5,phase:.72+i*.85,angle:.1,tempo:.05,
          vx:i===1 ? .12 : 0,vy:0,dx:0,dy:0}));
        const live=raster(),damage=[];
        const frame=(target,bodies,dirty) => {
          drawBubbles(target,bodies,'opal',light ? .53 : 0,true,light,dirty);
          return target.getImageData(0,0,width,height).data;
        };
        const baseline=frame(live,scene,damage);
        let facing=0,opposite=0,maxMismatch=0,partial=false,colourShift=0;
        for (const gap of [144,108,144,(farX-x0)*width]) {
          scene[1].x=x0+gap/width;
          const livePixels=frame(live,scene,damage);
          partial ||= damage.length>0;
          const fresh=frame(raster(),scene.map(b=>({...b})));
          for(let i=0;i<fresh.length;i++) maxMismatch=Math.max(maxMismatch,Math.abs(fresh[i]-livePixels[i]));
          if (gap!==108) continue;
          // Turn only the donor. Project the reflected colour change onto its
          // actual outgoing pigment shift, removing any change in brightness.
          const turned=scene.map(b=>({...b}));
          turned[1].angle+=Math.PI;
          const a=rimColourAt(scene[1],1,Math.PI,minerals.opal);
          const b=rimColourAt(turned[1],1,Math.PI,minerals.opal);
          const channels=[0,8,16].map(shift=>((b>>>shift)&255)-((a>>>shift)&255));
          const mean=channels.reduce((sum,value)=>sum+value)/3;
          const shifted=frame(raster(),turned);
          const radius=.30*height;
          for (let y=0;y<height;y++) for (let x=0;x<width;x++) {
            const dx=(x+.5-x0*width)/radius,dy=(y+.5-height/2)/radius;
            if (Math.abs(dx)<.48 || Math.hypot(dx,dy)>.98) continue;
            const i=4*(y*width+x);
            if (dx>0) for (let c=0;c<3;c++) colourShift+=(shifted[i+c]-livePixels[i+c])*(channels[c]-mean);
            if (![0,1,2].some(c=>Math.abs(livePixels[i+c]-baseline[i+c])>2)) continue;
            if (dx>0) facing++; else opposite++;
          }
        }
        return {light,facing,opposite,colourShift,maxMismatch,partial};
      });
    });
    for (const row of results) {
      assert.ok(row.facing>row.opposite+15 && row.colourShift>0,JSON.stringify(row));
      assert.ok(row.partial && row.maxMismatch<=2,JSON.stringify(row));
    }
  } finally {await ctx.close();}
});

test('an orb collision sends a visible ripple from each facing edge', async () => {
  const {ctx,page} = await open();
  try {
    const counts = await page.evaluate(async () => {
      const {drawBubbles,driftBubbles} = await import('/roof/bubbles.js');
      const {settleSurface} = await import('/roof/bubble-surface.js');
      const bodies = [.32,.77].map((x,i) => ({x,y:.5,vx:i ? 0 : .12,vy:0,dx:0,dy:0,
        phase:1.5,angle:0,tempo:.05,turn:60}));
      for (let i=0;i<12;i++) driftBubbles(bodies,1/60,1);
      const size=240;
      function pixels(centres) {
        const canvas=document.createElement('canvas');
        canvas.width=canvas.height=size;
        const context=canvas.getContext('2d',{willReadFrequently:true});
        if(centres) {
          const clip=context.clip.bind(context);
          context.clip=(...args)=>{
            if(args[0] instanceof Path2D) centres.unshift(context.getTransform());
            clip(...args);
          };
        }
        drawBubbles(context,bodies,'opal',0,true);
        return context.getImageData(0,0,size,size).data;
      }
      const centres=[], rippling=pixels(centres);
      // Remove only surface waves, preserving the contact geometry and light.
      bodies.forEach(settleSurface);
      const samePose=pixels();
      return centres.map((centre,i) => {
        const radius=(i ? .165 : .30)*size, counts={near:0,far:0};
        for (let y=0;y<size;y++) for (let x=0;x<size;x++) {
          const dx=(x+.5-centre.e)/radius * (i ? -1 : 1);
          if (Math.abs(dx)<.50 || Math.abs(dx)>.95 || Math.abs(y+.5-centre.f)>radius*.31) continue;
          const pixel=4*(y*size+x);
          if ([0,1,2].some(c => Math.abs(rippling[pixel+c]-samePose[pixel+c])>8)) counts[dx>0?'near':'far']++;
        }
        return counts;
      });
    });
    assert.equal(counts.length,2);
    for (const {near,far} of counts) assert.ok(near > far+8, JSON.stringify(counts));
  } finally { await ctx.close(); }
});

test('one or two rippling orbs clear their old positions as they pass behind a foreground orb', async () => {
  const {ctx,page} = await open();
  try {
    const difference = await page.evaluate(async () => {
      const {drawBubbles} = await import('/roof/bubbles.js');
      const {stepSurface} = await import('/roof/bubble-surface.js');
      const raster = () => {
        const c = document.createElement('canvas');
        c.width = 360; c.height = 240;
        return c.getContext('2d', {willReadFrequently:true});
      };
      for (const moving of [1,2]) for (const light of [false,true]) {
        const bodies = [.54,.28,.84].map(x => ({x,y:.5,phase:.5,angle:0,tempo:.05}));
        const display = raster();
        for (const b of bodies.slice(1,1+moving)) {
          stepSurface(b,1/60,{x:0,y:0,distance:0,amount:1},{tap:true,release:true});
        }
        const draw = target => drawBubbles(target,bodies,'opal',.53,true,light);
        draw(display);
        for (const [x1,x2] of [[.49,.60],[.76,.25]]) {
          bodies[1].x = x1;
          if (moving===2) bodies[2].x = x2;
          draw(display);
          const expected = raster();
          draw(expected);
          const pixels = target => target.getImageData(0,0,360,240).data;
          const actual = pixels(display), fresh = pixels(expected);
          if (actual.some((v,i) => Math.abs(v-fresh[i])>2)) return {moving,light,x1,x2};
        }
      }
      return false;
    });
    assert.equal(difference,false);
  } finally { await ctx.close(); }
});

test('Midnight Bubbles carries the same visible scene through the app drawer, Calendar and a reload', async () => {
  const {ctx, page, errors} = await open({initialPath:'/?os=1', scheme:'dark', hubApps:{calendar:true}, viewApps:{calendar:true}});
  try {
    await page.locator('html[data-midnight-lava] .sky > canvas').waitFor();
    const image = () => page.locator('.sky > canvas').evaluate(c => c.toDataURL());
    await page.evaluate(async () => (await import('/roof/wallpaper.js')).setWallpaperColour('lagoon'));
    const first = await image();
    await page.evaluate(() => { window.wallpaperNode = document.querySelector('.sky > canvas'); });
    async function checkVisibleScene() {
      const sky = page.locator('.sky > canvas');
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
    await page.locator('html[data-midnight-lava] .sky > canvas').waitFor();
    assert.equal(await page.locator('html').getAttribute('data-midnight-lava'), 'lagoon');
    assert.equal(await image(), first, 'same-tab navigation restores the colourway and exact still frame');
    await page.emulateMedia({colorScheme:'light'});
    await page.waitForFunction(() => getComputedStyle(document.documentElement).getPropertyValue('--orb-ground').trim() === '#eff5f6');
    const lightFrame = await image();
    assert.notEqual(lightFrame,first);
    assert.equal(await page.locator('html').getAttribute('data-midnight-lava'),'lagoon');
    await page.emulateMedia({colorScheme:'dark'});
    await page.waitForFunction(before => document.querySelector('.sky > canvas').toDataURL() === before,first);
    await page.emulateMedia({colorScheme:'light'});
    await page.waitForFunction(before => document.querySelector('.sky > canvas').toDataURL() === before,lightFrame);
    await page.evaluate(async () => (await import('/roof/wallpaper.js')).setWallpaper('lava'));
    await page.waitForFunction(before => document.querySelector('.sky > canvas').toDataURL() !== before, lightFrame);
    await page.evaluate(async () => (await import('/roof/wallpaper.js')).setWallpaper('plain'));
    assert.equal(await page.locator('html[data-midnight-lava]').count(),0);
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
    const sky = await page.locator('.sky > canvas').elementHandle();
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
    assert.equal(await sky.evaluate(c => c === document.querySelector('.sky > canvas')), true);
    await returning.evaluate(a => a.finish());
    const before = await sky.evaluate(c => c.toDataURL());
    await page.waitForFunction(pixels => document.querySelector('.sky > canvas').toDataURL() !== pixels, before);
  } finally { await ctx.close(); }
});

test('high-refresh orb motion retains fine grain and highlights at display resolution', async () => {
  const {ctx,page} = await open({deviceScaleFactor:3,scheme:'dark'});
  try {
    const result = await page.evaluate(async () => {
      const {sizeBubbleCanvas,driftBubbles,drawBubbles} = await import('/roof/bubbles.js');
      function raster() {
        const canvas=document.createElement('canvas');
        sizeBubbleCanvas(canvas,390,430);
        return canvas.getContext('2d',{willReadFrequently:true});
      }
      const target=raster(), reference=raster();
      const body={x:.5,y:.5,phase:.8,angle:.4,turn:50,tempo:.05,dx:0,dy:0,vx:.06,vy:0};
      const fast=[{...body}], control=[{...body}];
      for (let i=0;i<20;i++) {
        const input=i<6 ? {x:.49,y:.45,down:true,strength:.9} : null;
        for (const bodies of [fast,control]) driftBubbles(bodies,1/240,390/430,input);
        drawBubbles(target,fast,'opal',0,true,false,undefined,1000/240);
      }
      // The reference is painted once at the exact same simulated pose.
      drawBubbles(reference,control,'opal',0,true,false);
      const width=210, height=150;
      const x=Math.round(fast[0].x*target.canvas.width-width/2), y=Math.round(fast[0].y*target.canvas.height-height/2);
      const read=context=>context.getImageData(x,y,width,height).data;
      const a=read(target), b=read(reference);
      let grain=0, originalGrain=0, deviation=0, samples=0;
      for (let k=4*width;k<a.length-4*width;k+=4) {
        // The second difference isolates single-pixel texture from the
        // slow colour gradients. A softened or downscaled grain loses energy.
        grain+=Math.abs(2*a[k]-a[k-4*width]-a[k+4*width]);
        originalGrain+=Math.abs(2*b[k]-b[k-4*width]-b[k+4*width]);
        for (let c=0;c<3;c++) deviation+=Math.abs(a[k+c]-b[k+c]);
        samples++;
      }
      return {width:target.canvas.width,height:target.canvas.height,grain:grain/samples,
        referenceGrain:originalGrain/samples,ratio:grain/originalGrain,meanError:deviation/(3*samples)};
    });
    assert.equal(result.width,1170);
    assert.equal(result.height,1290);
    assert.ok(result.referenceGrain>.4 && Math.abs(result.ratio-1)<.12,JSON.stringify(result));
    assert.ok(result.meanError<3,JSON.stringify(result));
  } finally { await ctx.close(); }
});

test('system glass bends a display-resolution scene at the rim and leaves the centre and foreground sharp', async () => {
  const {ctx, page, errors} = await open({initialPath:'/?os=1', scheme:'dark', deviceScaleFactor:3});
  try {
    const dock = page.locator('.ws-dock:visible');
    await dock.waitFor();
    await page.evaluate(async () => {
      (await import('/roof/wallpaper.js')).setWallpaper('still');
      InFliteAppearance.setGlass({glass:true, glassStrength:100}, {preview:true});
    });
    const mode = process.env.WEB_UI_BROWSER === 'webkit' ? 'artwork' : 'backdrop';
    await page.locator(`html[data-refractor="${mode}"]`).waitFor();
    const box = await dock.boundingBox();
    // Compare the same high-density artwork with and without displacement.
    await dock.evaluate(node => {
      node.style.setProperty('background','transparent','important');
      node.style.setProperty('--ifl-glass-blur','blur(0px)','important');
      for (const child of node.children) child.style.visibility = 'hidden';
    });
    const density = await page.evaluate(async () => {
      document.querySelector('.ws-home-body').style.display = 'none';
      const sky = document.querySelector('.sky > canvas'), scale = sky.width / sky.clientWidth;
      const c = sky.getContext('2d');
      c.save();
      c.setTransform(scale,0,0,sky.height/sky.clientHeight,0,0);
      c.fillStyle = '#181818'; c.fillRect(0,0,sky.clientWidth,sky.clientHeight);
      c.fillStyle = '#eee';
      for (let x=0; x<sky.clientWidth; x+=7) c.fillRect(x,0,2,sky.clientHeight);
      c.restore();
      (await import('/roof/refractor.js')).wallpaperFrame(sky);
      return scale;
    });
    assert.ok(density > 2.9, 'the original orb artwork is painted at 3×');
    if (mode === 'artwork') {
      await page.waitForFunction(width => [...document.querySelectorAll('.sky .ifl-orb-lens')].some(layer =>
        Math.abs(layer.getBoundingClientRect().width - width) < 1 && layer.firstElementChild.width >= Math.floor(width * 2.99)),box.width);
    }
    const {PNG} = require('playwright-core/lib/utilsBundle');
    const shot = async () => {
      await page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
      return PNG.sync.read(await page.screenshot());
    };
    const on = await shot();
    if (mode === 'artwork') await page.locator('.sky .ifl-orb-lens').evaluateAll(layers => layers.forEach(n => n.style.display='none'));
    else await page.locator('#ifl-system-lens feDisplacementMap').evaluate(n => n.setAttribute('scale','0'));
    const off = await shot(), ratio = on.width / 390, row = Math.floor((box.y + box.height/2)*ratio);
    const diff = x => Math.abs(on.data[4*(row*on.width+x)] - off.data[4*(row*off.width+x)]);
    let bend = 0;
    for(let i=2; i<22*ratio; i++) bend += diff(Math.floor(box.x*ratio)+i);
    assert.ok(bend > 200, 'the display-resolution rim bends the fine stripes: '+bend);
    assert.ok(diff(Math.floor((box.x+box.width/2)*ratio)) < 5, 'centre samples the original backdrop');
    await page.evaluate(()=>InFliteAppearance.setGlass({glassStrength:0},{preview:true}));
    assert.equal(await page.locator('html').getAttribute('data-refractor'),null);
    await page.evaluate(()=>InFliteAppearance.cancelGlassPreview());
    assert.equal(await page.locator('html').getAttribute('data-refractor'),mode);
    await page.emulateMedia({contrast:'more'});
    await page.waitForFunction(() => !document.documentElement.hasAttribute('data-refractor'));
    assert.deepEqual(errors, []);
  } finally { await ctx.close(); }
});

test('a full dock replaces one favourite from shortcuts or Edit dock and supports Undo', async () => {
  const apps = {weather:true,fitness:true,markets:true,mail:true,chats:true,calendar:true,people:true,notes:true};
  const {ctx,page,errors} = await open({initialPath:'/?os=1',waitForDay:false,hubApps:apps,viewApps:apps});
  try {
    const dock = page.locator('.ws-dock'), menu = page.locator('dialog[data-sheet=workspace-apps]');
    const showApps = () => dock.getByRole('button',{name:'All apps',exact:true}).click();
    const button = name => menu.getByRole('button',{name,exact:true});
    const order = () => dock.locator('[data-launcher-app]').evaluateAll(nodes=>nodes.map(node=>node.dataset.launcherApp));
    await dock.locator('[data-launcher-app]').first().waitFor();
    const initial = await order();
    assert.equal(initial.length,4);
    const target = ['Weather','Fitness','Notes','People','Calendar'].find(name=>!initial.includes(name.toLowerCase()));
    const next = [...initial];
    next[1] = target.toLowerCase();
    await showApps();
    await button(target).click({button:'right'});
    await button('Replace a favourite…').click();
    const choices = menu.locator('.wsl-replacements button');
    assert.equal(await choices.count(),4);
    await button('Back').click();
    assert.deepEqual(await order(),initial);
    await button('Replace a favourite…').click();
    await choices.nth(1).click();
    await menu.waitFor({state:'detached'});
    assert.deepEqual(await order(),next);
    await page.getByRole('button',{name:'Undo',exact:true}).click();
    assert.deepEqual(await order(),initial);

    await showApps();
    await button('Actions').click();
    await button('Edit dock').click();
    await button('Pin '+target).click();
    await choices.nth(1).click();
    await menu.waitFor({state:'detached'});
    await page.reload();
    await dock.locator('[data-launcher-app]').first().waitFor();
    assert.deepEqual(await order(),next);
    assert.deepEqual(errors,[]);
  } finally { await ctx.close(); }
});

test('Bubbles drawer follows a short drag, rotates in place and releases the dock on dismissal', async () => {
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
    const before = await drawer.boundingBox();
    await page.mouse.move(x,y+24,{steps:6});
    await page.waitForFunction(()=>document.querySelector('dialog.dragging')?.style.getPropertyValue('--drag') === '24px');
    const aligned = async () => {
      if (process.env.WEB_UI_BROWSER === 'webkit') await page.waitForFunction(() => {
        const box = document.querySelector('dialog[open]').getBoundingClientRect();
        return [...document.querySelectorAll('.sky .ifl-orb-lens')].some(layer => {
          const rect = layer.getBoundingClientRect();
          return Math.abs(rect.x-box.x)<1 && Math.abs(rect.y-box.y)<1 && Math.abs(rect.width-box.width)<1 && Math.abs(rect.height-box.height)<1;
        });
      });
    };
    await aligned();
    assert.ok((await drawer.boundingBox()).y > before.y+18);
    await page.mouse.up();
    await page.waitForFunction(top=>Math.abs(document.querySelector('dialog[open]').getBoundingClientRect().top-top)<1,before.y);
    await aligned();
    await page.setViewportSize({width:820,height:390});
    await drawer.locator('.ifs-head h2').scrollIntoViewIfNeeded();
    await aligned();
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
    const dark = page.getByRole('radio',{name:'Dark',exact:true});
    await dark.click();
    await page.getByRole('button',{name:'Reload preferences'}).click();
    await dark.waitFor();
    assert.equal(await dark.isChecked(),true);
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
