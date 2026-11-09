// Lifecycle regressions use the real framework with deliberately delayed sample
// modules. No account endpoints, external applications or real services are used.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { createServer } = require('node:http');
const { readFile } = require('node:fs/promises');
const { existsSync } = require('node:fs');
const { resolve, extname } = require('node:path');
const { chromium, webkit } = require('playwright');

const publicDir = resolve(__dirname, '../today/public');
let browser, server, origin;
const fixtureModule = `
  const t = window.trial;
  ++t.imports;
  if (t.mode.import) { t.importStarted = true; await t.gates.import.promise; }
  export const CONTRACT = 1, BUILD = 'lifecycle-test', NEWS = 'Sample module';
  export async function mount(root, fw) {
    ++t.mounts; t.mountStarted = true; t.mountFw = fw; t.mountRoot = root;
    if (t.mode.mount) await t.gates.mount.promise;
    const instance = {
      show() { ++t.shows; }, hide() { ++t.hides; },
      unmount() { ++t.unmounts; }, busy() { return false; },
      flush() { ++t.flushes; return t.mode.flush ? t.gates.flush.promise : Promise.resolve({ lost: 0 }); },
    };
    t.instance = instance;
    return instance;
  }
`;
const fixtureService = `
  export async function startService() {
    const t = window.trial;
    ++t.serviceStarts; t.serviceStarted = true;
    await t.gates.service.promise;
    const service = {
      state: 'ready', facade: { sample: true },
      on(topic, fn) { t.serviceOns.push(topic); return () => { t.serviceOffs.push(topic); }; },
      release(options) { t.serviceReleases.push(options || {}); },
    };
    t.service = service;
    return service;
  }
`;

before(async () => {
  server = createServer(async (req, res) => {
    const pathname = new URL(req.url, 'http://test').pathname;
    let body, type = 'text/javascript';
    try {
      if (pathname === '/') {
        body = '<!doctype html><html><body><div id="root"><header id="hd"></header><div id="views"><main id="today">Today</main><main id="apps">Apps</main><main id="you">You</main></div><nav id="tabs"></nav></div></body></html>';
        type = 'text/html';
      } else if (pathname === '/weather/roof/weather.js') body = fixtureModule;
      else if (pathname === '/chats/roof/service.js') body = fixtureService;
      else if (/^\/(weather|chats)\/roof\/connector\.js$/.test(pathname)) body = 'export const connector = { files: [], lazy: [] };';
      else if (/^\/(weather|chats)\/.+\.css$/.test(pathname)) { body = '/* Sample module styles. */'; type = 'text/css'; }
      else if (/^\/(weather|chats)\/version$/.test(pathname)) { body = JSON.stringify({ build: 'lifecycle-test' }); type = 'application/json'; }
      else {
        const file = resolve(publicDir, '.' + decodeURIComponent(pathname));
        if (!file.startsWith(publicDir + '/')) throw new Error('outside public');
        body = await readFile(file);
        type = { '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' }[extname(file)] || 'application/octet-stream';
      }
      res.writeHead(200, { 'Content-Type': type }); res.end(body);
    } catch { res.writeHead(404); res.end('Not found'); }
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  origin = `http://127.0.0.1:${server.address().port}`;
  const executablePath = process.env.CHROMIUM || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined);
  browser = process.env.WEB_UI_BROWSER === 'webkit' ? await webkit.launch() : await chromium.launch({ executablePath, args: ['--no-sandbox'] });
});
after(async () => { await browser?.close(); await new Promise(r => server ? server.close(r) : r()); });

async function open(mode = {}) {
  const ctx = await browser.newContext({ reducedMotion: 'reduce', serviceWorkers: 'block' });
  const page = await ctx.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(origin);
  await page.evaluate(async mode => {
    const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
    const t = window.trial = {
      mode, gates: { hub: deferred(), import: deferred(), mount: deferred(), service: deferred(), flush: deferred() },
      imports: 0, mounts: 0, shows: 0, hides: 0, unmounts: 0, flushes: 0, built: 0, errors: 0,
      serviceStarts: 0, serviceOns: [], serviceOffs: [], serviceReleases: [], states: [], badges: [], headers: [],
      apps: { weather: true, chats: true },
    };
    // Header/tab rendering is unrelated to lifetime ownership; observe public
    // framework calls without introducing a second shell implementation.
    window.IFL = { built() { ++t.built; } };
    const { createFrame } = await import('/roof/frame.js');
    const byId = id => document.getElementById(id);
    t.frame = createFrame({
      root: byId('root'), header: byId('hd'), views: byId('views'), tabs: byId('tabs'),
      session: () => ({ view: { user: { id: 'sample-owner' }, apps: t.apps }, hub: true, roof: t.apps.weather, apps: t.apps }),
      hubAgain: () => { t.hubStarted = true; return mode.hub ? t.gates.hub.promise : Promise.resolve(); },
      serviceState: (app, state) => t.states.push([app, state]),
      today: { el: byId('today'), title: 'Today' }, apps: { el: byId('apps'), title: 'Apps' }, you: { el: byId('you'), title: 'You' },
    });
    t.frame.header.set = spec => t.headers.push(spec.title);
    t.frame.tabs.badge = (...args) => t.badges.push(args);
    t.fw = t.frame.forModule('weather');
    t.root = t.fw.screenEl.querySelector('.m-weather');
    const { loadModule } = await import('/roof/modules.js');
    t.load = () => {
      t.loading = loadModule('weather', t.frame).then(value => { t.result = value; return 'resolved'; }, error => { t.error = error.message; return 'rejected'; });
    };
    t.snapshot = () => ({
      imports: t.imports, mounts: t.mounts, shows: t.shows, unmounts: t.unmounts, built: t.built,
      errorActions: t.root.querySelectorAll('[data-act="retry"], [data-act="reload"], [data-act="own"]').length,
      errorText: t.root.textContent.includes('didn’t open'),
      connected: t.root.isConnected,
    });
    // Cancellation can settle the public loading promise before the deliberately
    // delayed fixture finishes. Let its completion handlers drain as well.
    t.drain = () => new Promise(resolve => setTimeout(resolve, 0));
  }, mode);
  return { ctx, page, errors };
}

test('module lifetime survives hiding and aborts synchronously when its frame is destroyed', async () => {
  const { ctx, page, errors } = await open();
  try {
    const result = await page.evaluate(() => {
      const t = trial, signal = t.fw.signal;
      const isSignal = signal instanceof AbortSignal;
      t.frame.nav.go('/#apps');
      const hidden = signal?.aborted;
      t.frame.destroy(); t.frame.destroy();
      return { isSignal, hidden, destroyed: signal?.aborted };
    });
    assert.deepEqual(result, { isSignal: true, hidden: false, destroyed: true });
    assert.deepEqual(errors, []);
  } finally { await ctx.close(); }
});

test('destroying during hub validation prevents module import and recovery UI', async () => {
  const { ctx, page, errors } = await open({ hub: true });
  try {
    await page.evaluate(() => trial.load());
    await page.waitForFunction(() => trial.hubStarted);
    const result = await page.evaluate(async () => {
      const t = trial; t.frame.destroy(); t.gates.hub.resolve(); await t.loading; await t.drain(); return t.snapshot();
    });
    assert.equal(result.imports, 0, 'a disposed module must never be imported after hub validation');
    assert.equal(result.mounts, 0);
    assert.equal(result.errorActions, 0);
    assert.equal(result.errorText, false);
    assert.equal(result.connected, false);
    assert.deepEqual(errors, []);
  } finally { await ctx.close(); }
});

test('destroying during import prevents mounting the detached module', async () => {
  const { ctx, page, errors } = await open({ import: true });
  try {
    await page.evaluate(() => trial.load());
    await page.waitForFunction(() => trial.importStarted);
    const result = await page.evaluate(async () => {
      const t = trial; t.frame.destroy(); t.gates.import.resolve(); await import('/weather/roof/weather.js'); await t.loading; await t.drain(); return t.snapshot();
    });
    assert.equal(result.imports, 1);
    assert.equal(result.mounts, 0, 'a late import must not call mount after its owner is destroyed');
    assert.equal(result.unmounts, 0, 'no instance was created');
    assert.equal(result.built, 0);
    assert.equal(result.errorActions, 0);
    assert.deepEqual(errors, []);
  } finally { await ctx.close(); }
});

test('an instance returned after destruction is unmounted exactly once', async () => {
  const { ctx, page, errors } = await open({ mount: true });
  try {
    await page.evaluate(() => trial.load());
    await page.waitForFunction(() => trial.mountStarted);
    const result = await page.evaluate(async () => {
      const t = trial; t.frame.destroy(); t.frame.destroy(); t.gates.mount.resolve(); await t.loading; await t.drain(); return t.snapshot();
    });
    assert.equal(result.mounts, 1);
    assert.equal(result.unmounts, 1, 'the pending instance must be disposed once when it becomes available');
    assert.equal(result.shows, 0);
    assert.equal(result.built, 0, 'a discarded mount is not an installed build');
    assert.equal(result.errorActions, 0);
    assert.deepEqual(errors, []);
  } finally { await ctx.close(); }
});

test('the routed loading path never adopts an instance after frame destruction', async () => {
  const { ctx, page, errors } = await open({ mount: true });
  try {
    await page.evaluate(() => trial.frame.nav.go('/weather/'));
    await page.waitForFunction(() => trial.mountStarted);
    await page.evaluate(() => { trial.frame.destroy(); trial.gates.mount.resolve(); });
    await page.waitForFunction(() => trial.unmounts === 1, null, { timeout: 3000 });
    const result = await page.evaluate(() => { trial.frame.destroy(); return trial.snapshot(); });
    assert.equal(result.mounts, 1);
    assert.equal(result.unmounts, 1);
    assert.equal(result.shows, 0, 'the frame cannot show the late result of its old loading promise');
    assert.equal(result.connected, false);
    assert.equal(result.built, 0);
    assert.equal(result.errorActions, 0);
    assert.deepEqual(errors, []);
  } finally { await ctx.close(); }
});

test('a mount rejected after destruction cannot render retry or error controls', async () => {
  const { ctx, page, errors } = await open({ mount: true });
  try {
    await page.evaluate(() => trial.load());
    await page.waitForFunction(() => trial.mountStarted);
    const result = await page.evaluate(async () => {
      const t = trial; t.frame.destroy(); t.gates.mount.reject(new Error('Sample delayed mount failed')); await t.loading; await t.drain(); return t.snapshot();
    });
    assert.equal(result.errorActions, 0, 'a dead loader cannot expose recovery actions');
    assert.equal(result.errorText, false, 'a dead loader cannot replace its old DOM with failure UI');
    assert.equal(result.built, 0);
    assert.deepEqual(errors, []);
  } finally { await ctx.close(); }
});

test('a stylesheet failure reaches recovery and retries without removing an existing stylesheet', async () => {
  const { ctx, page, errors } = await open();
  let failStyles = true;
  try {
    await page.route('**/weather/roof/weather.css', route => route.fulfill({
      status: failStyles ? 404 : 200, contentType: 'text/css', body: failStyles ? 'Not found' : '/* Recovered sample styles. */',
    }));
    await page.evaluate(async () => {
      const t = trial, link = document.createElement('link');
      link.rel = 'stylesheet'; link.href = '/weather/roof/wxcore.css';
      t.sharedStyle = link;
      await new Promise((resolve, reject) => { link.onload = resolve; link.onerror = reject; document.head.append(link); });
      t.load(); await t.loading;
    });
    const failed = await page.evaluate(() => ({
      ...trial.snapshot(), ownLink: !!document.querySelector('link[href="/weather/roof/weather.css"]'), sharedConnected: trial.sharedStyle.isConnected,
    }));
    assert.equal(failed.mounts, 0, 'a module must not mount without its required CSS');
    assert.ok(failed.errorActions >= 2, 'the ordinary module recovery choices remain available');
    assert.equal(failed.ownLink, false, 'the failed stylesheet created by the loader must not poison retry');
    assert.equal(failed.sharedConnected, true, 'a preexisting shared stylesheet is not owned by the failed load');
    failStyles = false;
    const recovered = await page.evaluate(async () => { trial.load(); await trial.loading; return { ...trial.snapshot(), sharedConnected: trial.sharedStyle.isConnected }; });
    assert.equal(recovered.mounts, 1);
    assert.equal(recovered.errorActions, 0);
    assert.equal(recovered.sharedConnected, true);
    assert.deepEqual(errors, []);
  } finally { await ctx.close(); }
});

test('a replaced module cannot update the current header through its old framework', async () => {
  const { ctx, page, errors } = await open();
  try {
    await page.evaluate(() => {
      const t = trial; t.apps = { ...t.apps, weather: false }; t.frame.setRoof(false, t.apps);
      t.apps = { ...t.apps, weather: true }; t.frame.setRoof(true, t.apps);
      t.nextFw = t.frame.forModule('weather');
      t.frame.nav.go('/weather/');
    });
    await page.waitForFunction(() => trial.shows === 1);
    const result = await page.evaluate(() => {
      const t = trial; t.nextFw.header.set({ title: 'Current owner' });
      const before = t.headers.length;
      t.fw.header.set({ title: 'Stale owner' });
      return { oldAborted: t.fw.signal?.aborted, newAborted: t.nextFw.signal?.aborted, before, after: t.headers.length, title: t.headers.at(-1) };
    });
    assert.equal(result.oldAborted, true);
    assert.equal(result.newAborted, false);
    assert.equal(result.after, result.before, 'the previous module record has no authority over the current header');
    assert.equal(result.title, 'Current owner');
    assert.deepEqual(errors, []);
  } finally { await ctx.close(); }
});

test('re-enabling a hidden module cancels pending permission-off disposal', async () => {
  const { ctx, page, errors } = await open({ flush: true });
  try {
    await page.evaluate(() => trial.frame.nav.go('/weather/'));
    await page.waitForFunction(() => trial.shows === 1);
    const result = await page.evaluate(async () => {
      const t = trial;
      t.frame.nav.go('/#apps');
      t.apps = { ...t.apps, weather: false }; t.frame.setRoof(false, t.apps);
      const flushing = t.flushes;
      t.apps = { ...t.apps, weather: true }; t.frame.setRoof(true, t.apps);
      t.gates.flush.resolve({ lost: 0 }); await t.gates.flush.promise; await t.drain();
      return { flushing, aborted: t.fw.signal.aborted, connected: t.root.isConnected, unmounts: t.unmounts };
    });
    assert.equal(result.flushing, 1, 'disabling the hidden module waits for its pending save');
    assert.equal(result.aborted, false, 'a renewed permission owns the still-live module');
    assert.equal(result.connected, true);
    assert.equal(result.unmounts, 0, 'the old permission-off completion cannot dispose the re-enabled module');
    await page.evaluate(() => trial.frame.nav.go('/weather/'));
    await page.waitForFunction(() => trial.shows === 2);
    assert.equal(await page.evaluate(() => trial.mounts), 1, 'the saved instance is reused');
    assert.deepEqual(errors, []);
  } finally { await ctx.close(); }
});

for (const destroy of [false, true]) test(`pending service startup is inert after ${destroy ? 'frame destruction' : 'explicit termination'}`, async () => {
  const { ctx, page, errors } = await open();
  try {
    await page.evaluate(() => { trial.serviceLoading = trial.frame.service('chats').then(() => 'resolved', () => 'rejected'); });
    await page.waitForFunction(() => trial.serviceStarted);
    const result = await page.evaluate(async destroy => {
      const t = trial;
      if (destroy) t.frame.destroy();
      else t.releasing = t.frame.releaseService('chats', { terminate: true });
      const badgesBefore = t.badges.length;
      t.gates.service.resolve();
      await Promise.all([t.serviceLoading, t.releasing]);
      await t.drain();
      return { starts: t.serviceStarts, ons: t.serviceOns, releases: t.serviceReleases, states: t.states, badges: t.badges.slice(badgesBefore) };
    }, destroy);
    assert.equal(result.starts, 1);
    assert.deepEqual(result.ons, [], 'a discarded service must not acquire frame event subscriptions');
    assert.equal(result.releases.length, 1, 'a service returned after cancellation must be released exactly once');
    assert.equal(result.releases[0].terminate, true);
    assert.deepEqual(result.states, []);
    assert.deepEqual(result.badges, []);
    assert.deepEqual(errors, []);
  } finally { await ctx.close(); }
});
