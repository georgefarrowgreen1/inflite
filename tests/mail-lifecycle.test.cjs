// Exercise Mail's real mount and lazy opener callbacks. Rendering and account
// dependencies are local fixtures; delayed imports never contact real services.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { createServer } = require('node:http');
const { readFile } = require('node:fs/promises');
const { existsSync } = require('node:fs');
const { resolve } = require('node:path');
const { chromium, webkit } = require('playwright');

const mailDir = resolve(__dirname, '../email/public/roof');
let browser, server, origin;
const fixtures = {
  'api.js': `export const MAIL = '/sample-mail'; export function createApi() { return { async session() { ++trial.sessions; return { access: 'notadmin' }; } }; }`,
  'actions.js': `export const createActions = () => ({ async load() {}, async counts() {} });`,
  'list.js': `export function view(el, ctx) { trial.ctx = ctx; return { draw() {}, hide() {}, destroy() {}, swiping() { return false; } }; }`,
  'reader.js': `export const view = () => ({ draw() {}, hide() {}, destroy() {} });`,
  'menus.js': `export const openViews = () => {}, openLater = () => {}, openRowMenu = () => {}, openUnsub = () => {}, confirm = () => {};`,
  'outbox.js': `export const createOutbox = () => ({ flush(options) { trial.flushes.push(options || {}); return Promise.resolve({ lost: false }); }, destroy() { ++trial.outboxDestroyed; } });`,
  'compose.js': `export function openCompose(ctx, init) { trial.opened.push(['compose', init]); return 'compose'; }`,
  'mailsettings.js': `export function openSettings(ctx, page) { trial.opened.push(['settings', page]); return 'settings'; }`,
  'viewer.js': `export function openViewer(ctx, files, i) { trial.opened.push(['viewer', files, i]); return 'viewer'; }`,
  'signin.js': `export function signIn() { trial.opened.push(['signin']); return 'signin'; } export async function finishSignIn(ctx, code) { trial.handbacks.push(code); return true; }`,
};

before(async () => {
  server = createServer(async (req, res) => {
    try {
      const path = new URL(req.url, 'http://test').pathname;
      let body, type = 'text/javascript';
      if (path === '/') { body = '<!doctype html><html><body><main id="mail"></main></body></html>'; type = 'text/html'; }
      else {
        const name = path.replace(/^\/mail\/roof\//, '');
        if (name.includes('/') || name.includes('..')) throw new Error('outside Mail');
        body = fixtures[name] ?? await readFile(resolve(mailDir, name));
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

async function open({ show = true } = {}) {
  const ctx = await browser.newContext({ serviceWorkers: 'block' }), page = await ctx.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(origin);
  await page.evaluate(async show => {
    const t = window.trial = { opened: [], handbacks: [], gates: [], toasts: [], sessions: 0, flushes: [], outboxDestroyed: 0 };
    t.controller = new AbortController();
    const fw = {
      signal: t.controller.signal,
      lazy(load) {
        let resolve, reject;
        const promise = new Promise((ok, no) => { resolve = ok; reject = no; });
        t.gates.push({ resolve, reject });
        return promise.then(() => load(''));
      },
      toast: message => t.toasts.push(message),
      session: { lost() {}, hubAgain() {} },
      nav: { depth: () => 0, go() {}, section() {}, href: () => '/mail/' },
      header: { set() {} },
      ui: { empty: () => document.createElement('div') },
      on: () => () => {},
      search: { provide: () => () => {} },
    };
    t.route = { key: 'people', section: 'people' };
    t.mail = await (await import('/mail/roof/mail.js')).mount(document.getElementById('mail'), fw);
    if (show) await t.mail.show(t.route);
    t.begin = (name, args = []) => {
      t.opening = t.ctx.open[name](...args).then(value => { t.result = value === null ? 'skipped' : value; }, error => { t.error = { name: error.name, message: error.message }; });
    };
    t.drain = () => new Promise(resolve => setTimeout(resolve, 0));
  }, show);
  return { ctx, page, errors };
}

const inputs = { compose: [{ subject: 'Unsent draft' }], settings: ['accounts'], viewer: [[{ id: 'sample-file' }], 2], signin: [] };

for (const name of Object.keys(inputs)) test(`Mail ${name}: late import cannot open after hide, return, unmount or abort`, async () => {
  for (const leave of ['hide', 'return', 'unmount', 'abort']) {
    const { ctx, page, errors } = await open();
    try {
      const result = await page.evaluate(async ({ name, args, leave }) => {
        const t = trial;
        t.begin(name, args);
        if (leave === 'abort') t.controller.abort();
        else if (leave === 'unmount') t.mail.unmount();
        else { t.mail.hide(); if (leave === 'return') await t.mail.show(t.route); }
        t.gates[0].resolve();
        await t.opening;
        return { result: t.result, opened: t.opened, toasts: t.toasts, error: t.error || null };
      }, { name, args: inputs[name], leave });
      assert.deepEqual(result, { result: 'skipped', opened: [], toasts: [], error: null }, leave);
      assert.deepEqual(errors, [], leave);
    } finally { await ctx.close(); }
  }
});

test('Mail active lazy openers preserve their arguments and defaults', async () => {
  const { ctx, page, errors } = await open();
  try {
    const result = await page.evaluate(async inputs => {
      const t = trial;
      for (const [name, args] of Object.entries(inputs)) { t.begin(name, args); t.gates.at(-1).resolve(); await t.opening; }
      for (const name of ['compose', 'settings']) { t.begin(name); t.gates.at(-1).resolve(); await t.opening; }
      return { opened: t.opened, error: t.error || null };
    }, inputs);
    assert.deepEqual(result, { opened: [['compose', inputs.compose[0]], ['settings', 'accounts'], ['viewer', inputs.viewer[0], 2], ['signin'], ['compose', {}], ['settings', null]], error: null });
    assert.deepEqual(errors, []);
  } finally { await ctx.close(); }
});

test('Mail skips hidden or released requests without starting lazy work', async () => {
  const { ctx, page, errors } = await open({ show: false });
  try {
    const result = await page.evaluate(async names => {
      const t = trial;
      for (const name of names) { t.begin(name); await t.opening; }
      await t.mail.show(t.route); t.mail.unmount();
      for (const name of names) { t.begin(name); await t.opening; }
      return { loads: t.gates.length, opened: t.opened };
    }, Object.keys(inputs));
    assert.deepEqual(result, { loads: 0, opened: [] });
    assert.deepEqual(errors, []);
  } finally { await ctx.close(); }
});

test('Mail suppresses late import failures but preserves active failure feedback', async () => {
  const { ctx, page, errors } = await open();
  try {
    const result = await page.evaluate(async () => {
      const t = trial;
      t.begin('compose'); t.mail.hide(); await t.mail.show(t.route);
      t.gates.at(-1).reject(new Error('Stale import failed')); await t.opening;
      const stale = { result: t.result, toasts: [...t.toasts], error: t.error || null };
      t.begin('compose'); t.gates.at(-1).reject(new Error('Active import failed')); await t.opening;
      return { stale, toasts: t.toasts, error: t.error };
    });
    assert.deepEqual(result, { stale: { result: 'skipped', toasts: [], error: null }, toasts: ['That didn’t open. Try again.'], error: { name: 'Error', message: 'Active import failed' } });
    assert.deepEqual(errors, []);
  } finally { await ctx.close(); }
});

test('Mail handback finishes and refreshes its session when hidden during import', async () => {
  const { ctx, page, errors } = await open();
  try {
    await page.evaluate(() => { const t = trial; t.beforeSessions = t.sessions; t.mail.show({ key: 'signin', arg: 'sample-handback-code' }); t.mail.hide(); t.gates[0].resolve(); });
    await page.waitForFunction(() => trial.sessions > trial.beforeSessions);
    const result = await page.evaluate(() => ({ handbacks: trial.handbacks, opened: trial.opened, toasts: trial.toasts }));
    assert.deepEqual(result, { handbacks: ['sample-handback-code'], opened: [], toasts: [] });
    assert.deepEqual(errors, []);
  } finally { await ctx.close(); }
});

test('Mail lifecycle cleanup preserves unsent state and both flush contracts', async () => {
  const { ctx, page, errors } = await open();
  try {
    const result = await page.evaluate(async () => {
      const t = trial;
      localStorage.setItem('mail:unsent', JSON.stringify({ subject: 'Unsent draft' }));
      t.ctx.store.set({ compose: true });
      const busy = t.mail.busy(), flushed = await t.mail.flush();
      t.mail.hide(); await t.mail.show(t.route); t.mail.unmount(); await t.drain();
      return { busy, flushed, flushes: t.flushes, destroyed: t.outboxDestroyed, unsent: JSON.parse(localStorage.getItem('mail:unsent')) };
    });
    assert.deepEqual(result, { busy: true, flushed: { lost: false }, flushes: [{}, { keepalive: true }], destroyed: 1, unsent: { subject: 'Unsent draft' } });
    assert.deepEqual(errors, []);
  } finally { await ctx.close(); }
});
