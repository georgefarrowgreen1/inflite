// The real account/frame/controller with cooperative app boundaries. An action
// waking an app without a saved workspace must retain its initiating route.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Module } = require('node:module');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');

function fixture() {
  const filename = resolve(__dirname, 'workspace-security-ui.test.cjs'), m = new Module(filename);
  m.filename = filename; m.paths = Module._nodeModulePaths(__dirname);
  const original = m.require.bind(m); let start, stop;
  m.require = id => id === 'node:test' ? { test() {}, before(fn) { start = fn; }, after(fn) { stop = fn; } } : original(id);
  m._compile(readFileSync(filename, 'utf8') + '\nmodule.exports={open};', filename);
  return { start: () => start(), stop: () => stop(), open: m.exports.open };
}

async function prepare(t) {
  await t.page.evaluate(() => {
    audit.ws.store.update('ride', { panes: [{ app: 'fitness' }], activePane: 'fitness' });
    audit.F.nav.go('/#workspace=ride', { replace: true, kind: 'section' });
  });
  await t.settle();
  await t.page.evaluate(() => audit.F.search.open());
  await t.page.getByRole('combobox', { name: 'Search everything' }).fill('inspect weather');
  await t.page.getByRole('option').filter({ hasText: 'Inspect app' }).waitFor();
}

test('a native app wake cannot adopt a replacement route and execute its earlier command there', async () => {
  const env = fixture(); await env.start(); let t;
  try {
    t = await env.open(); await prepare(t);
    await t.page.evaluate(() => {
      [...document.querySelectorAll('[role=option]')].find(n => n.textContent.includes('Inspect app')).click();
      audit.F.nav.go('/weather/#radar', { kind: 'section' });
    });
    await t.settle();
    assert.equal(await t.page.evaluate(() => audit.F.route.key), 'radar');
    assert.deepEqual(await t.page.evaluate(() => audit.runs), [], 'an earlier command cannot open an editor after replacement navigation');
    await t.clean();
  } finally { await t?.ctx.close(); await env.stop(); }
});

test('a native app wake with its original route intact runs the requested command once', async () => {
  const env = fixture(); await env.start(); let t;
  try {
    t = await env.open(); await prepare(t);
    await t.page.getByRole('option').filter({ hasText: 'Inspect app' }).click();
    await t.page.waitForFunction(() => audit.runs.length === 1);
    assert.deepEqual(await t.page.evaluate(() => audit.runs.map(({ app, intent }) => [app, intent])), [['weather', 'inspect']]);
    assert.equal(await t.page.evaluate(() => audit.F.route.kind === 'app' && audit.F.route.app === 'weather'), true);
    await t.clean();
  } finally { await t?.ctx.close(); await env.stop(); }
});
