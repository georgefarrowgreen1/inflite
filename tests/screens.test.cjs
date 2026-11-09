const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { pathToFileURL } = require('node:url');
const vm = require('node:vm');
const publicDir = resolve(__dirname, '../today/public');
const tasksModule = import(pathToFileURL(resolve(publicDir, 'roof/screens.js')));
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const tick = async () => { await Promise.resolve(); await Promise.resolve(); };
const route = (tab, arg = null) => ({ kind: 'tab', tab, arg });

async function host(tab = 'apps', arg = null) {
  const { createScreenTasks } = await tasksModule;
  const loads = [], draws = [], navigations = [], account = new AbortController(), lifetime = new AbortController();
  const sandbox = {
    createScreenTasks, requests: { signal: account.signal }, S: { view: { user: { id: 'a' } } },
    F: { route: route(tab, arg), signal: lifetime.signal, ui: {} },
    $: id => ({ id }), scopedAPI: () => ({ current: () => !sandbox.requests.signal.aborted, call: async () => ({}) }),
    IFL: { hub: { href: app => `/${app}/` } }, chatsHere: true,
    missing() {}, toast() {}, currentSub() {}, turnOn() {}, turnOff() {}, fanOut() {}, everyKept() {}, syncPush() {}, offHere() {}, toMorning() {}, openAccount() {}, signOut() {}, canPush() {}, pushWhy() {}, openSheet() {}, closeSheet() {}, BUILD: 'test',
    load: name => { const d = deferred(); loads.push({ name, ...d }); return d.promise; },
  };
  const source = readFileSync(resolve(publicDir, 'app.js'), 'utf8');
  const start = source.indexOf('import { createScreenTasks }');
  const end = source.indexOf('// (signed out, or not?', start);
  assert.ok(start > 0 && end > start, 'run the real host screen orchestration');
  const section = source.slice(start, end).replace(/^import[^\n]+\n/, '').replace(/import\("\/(apps|you)\.js"\)/g, (_, name) => `load("${name}")`);
  vm.runInNewContext(section + '\nglobalThis.hostScreens = { drawAppsNow, drawYouNow };', sandbox);
  const module = {
    drawApps(root, ctx) { draws.push({ root, ctx }); },
    drawYou(root, ctx) { draws.push({ root, ctx }); return Promise.resolve(); },
    goTo(root, ctx, arg) { navigations.push({ root, ctx, arg }); },
  };
  return { sandbox, loads, draws, navigations, module, account, lifetime, ...sandbox.hostScreens };
}

test('a delayed Apps import cannot draw after leaving its route', async () => {
  const h = await host(); h.drawAppsNow(); h.sandbox.F.route = route('today');
  h.loads[0].resolve(h.module); await tick(); assert.equal(h.draws.length, 0);
});

test('a delayed import cannot acquire a different account or a replacement frame', async () => {
  for (const change of ['account', 'frame']) {
    const h = await host(); h.drawAppsNow();
    if (change === 'account') {
      h.account.abort(); h.sandbox.requests.signal = new AbortController().signal; h.sandbox.S.view = { user: { id: 'b' } };
    } else h.sandbox.F = { ...h.sandbox.F, signal: new AbortController().signal };
    h.loads[0].resolve(h.module); await tick(); assert.equal(h.draws.length, 0, change);
    h.drawAppsNow(); h.loads[1].resolve(h.module); await tick(); assert.equal(h.draws.length, 1, `${change}: current screen still draws`);
  }
});

test('frame disposal invalidates pending imports even before the host drops its frame reference', async () => {
  const h = await host(); h.drawAppsNow(); h.lifetime.abort();
  h.loads[0].resolve(h.module); await tick(); assert.equal(h.draws.length, 0);
});

test('same-account Apps refresh uses the latest import and preserves the existing editor ownership', async () => {
  const h = await host(); h.drawAppsNow(); h.loads[0].resolve(h.module); await tick();
  const editor = h.draws[0].ctx;
  h.drawAppsNow(); h.drawAppsNow();
  h.loads[2].resolve(h.module); h.loads[1].resolve(h.module); await tick();
  assert.equal(h.draws.length, 2, 'the superseded refresh does not replace the screen');
  assert.equal(editor.current(), true, 'an unfinished shortcut editor stays owned by this account and frame');
  h.account.abort(); assert.equal(editor.current(), false, 'the editor cannot save for a later account');
});

test('replacement You arguments discard an earlier lazy navigation and capture the shown route', async () => {
  const h = await host('you', 'rules'); h.drawYouNow('rules');
  h.sandbox.F.route = route('you', 'apps'); h.drawYouNow('apps');
  h.loads[0].resolve(h.module); h.loads[1].resolve(h.module); await tick();
  assert.equal(h.draws.length, 1); assert.deepEqual(h.navigations.map(n => n.arg), ['apps']);
  const ctx = h.draws[0].ctx;
  assert.equal(ctx.active(), true); h.sandbox.F.route = route('today');
  assert.equal(ctx.active(), false); assert.equal(ctx.current(), true, 'cached account data can complete without navigating');
});

test('redrawing You without an explicit argument retains the current deep link', async () => {
  const h = await host('you', 'phone'); h.drawYouNow(); h.loads[0].resolve(h.module); await tick();
  assert.equal(h.draws.length, 1); assert.equal(h.navigations[0].arg, 'phone');
});

let youModule;
async function you() {
  if (!youModule) {
    const cards = 'data:text/javascript,' + encodeURIComponent('export const G = {}; export const esc = s => String(s ?? "");');
    const source = readFileSync(resolve(publicDir, 'you.js'), 'utf8').replace('"/cards.js"', JSON.stringify(cards)).replace('import("/mailnotify.js")', 'globalThis.loadMailNotifications()');
    youModule = import('data:text/javascript,' + encodeURIComponent(source));
  }
  return youModule;
}

test('a delayed You deep link cannot scroll, focus or open a folder after route ownership changes', async () => {
  const m = await you();
  for (const [desktop, id] of [[true, 'rules'], [false, 'rules'], [false, 'quiet']]) {
    let active = true, scrolled = 0, focused = 0, opened = 0, ready = false;
    const wait = deferred(), target = { scrollIntoView() { scrolled++; }, querySelector: () => ({ matches: () => true, focus() { focused++; } }) };
    globalThis.matchMedia = () => ({ matches: desktop });
    globalThis.document = { getElementById: () => ({ dataset: {}, querySelector: () => ({}), open: false }) };
    const root = { querySelector: () => ready ? target : null };
    const ctx = { current: () => true, active: () => active, openSheet() { opened++; } };
    const pending = m.goTo(root, ctx, id, wait.promise);
    active = false; ready = true; wait.resolve(); await pending;
    assert.deepEqual({ scrolled, focused, opened }, { scrolled: 0, focused: 0, opened: 0 }, `${desktop ? 'desktop' : 'mobile'} ${id}`);
  }
});

test('a current You deep link still scrolls and focuses its destination', async () => {
  const m = await you(); let scrolled = 0, focused = 0;
  globalThis.matchMedia = () => ({ matches: false });
  const target = { scrollIntoView() { scrolled++; }, querySelector: () => ({ matches: () => true, focus() { focused++; } }) };
  await m.goTo({ querySelector: () => target }, { current: () => true, active: () => true }, 'quiet');
  assert.deepEqual({ scrolled, focused }, { scrolled: 1, focused: 1 });
});

test('a Mail notifications import cannot open or toast after leaving You', async () => {
  const m = await you();
  for (const fails of [false, true]) {
    const wait = deferred(); let active = true, opened = 0, toasts = 0;
    globalThis.loadMailNotifications = () => wait.promise;
    const pending = m.goTo({}, { current: () => true, active: () => active, frame: {}, toast() { toasts++; } }, 'notify-mail');
    active = false;
    if (fails) wait.reject(new Error('Unavailable')); else wait.resolve({ openMailNotify() { opened++; } });
    await pending; assert.deepEqual({ opened, toasts }, { opened: 0, toasts: 0 });
  }
});

test('an obsolete Weather notifications deep link cannot open a sheet', async () => {
  const m = await you(); let opened = 0;
  globalThis.document = { getElementById: () => ({ querySelector: () => ({}), open: false }) };
  await m.goTo({}, { view: { user: { id: 'a' } }, current: () => true, active: () => false, openSheet() { opened++; } }, 'notify-weather');
  assert.equal(opened, 0);
});

test('an old You visit cannot start its settings load after a slow browser subscription lookup', async () => {
  const m = await you(), subscription = deferred(); let active = true, calls = 0;
  globalThis.document = { getElementById: () => null };
  globalThis.matchMedia = () => ({ matches: false });
  const root = { innerHTML: '', isConnected: true, querySelector: () => null, querySelectorAll: () => [] };
  const pending = m.drawYou(root, {
    view: { user: { id: 'a', name: 'Example' } }, hub: false, current: () => true, active: () => active,
    sub: () => subscription.promise, call: () => { calls++; return Promise.resolve({}); }, missing: () => false,
  });
  const shown = root.innerHTML; active = false; subscription.resolve(null); await pending;
  assert.equal(calls, 0); assert.equal(root.innerHTML, shown);
});
