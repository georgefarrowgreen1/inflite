const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFile, writeFile, mkdtemp, rm } = require('node:fs/promises');
const { join, resolve } = require('node:path');
const { tmpdir } = require('node:os');
const { pathToFileURL } = require('node:url');
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const gates = globalThis.__infliteConnectorLifecycleGates = new Map();
const descriptor = { app: 'weather', name: 'Weather', icon: 'weather', href: '/weather/', shares: { cards: 'Weather today' } };
const youRoute = arg => ({ kind: 'tab', tab: 'you', arg });

// Run the real connector implementation, with an actual dynamically imported
// descriptor whose top-level await lets navigation/disposal happen during load.
async function fixture() {
  const dir = await mkdtemp(join(tmpdir(), 'inflite-connector-lifecycle-'));
  const file = pathToFileURL(join(dir, 'descriptor.mjs')).href;
  const result = deferred(), started = deferred();
  gates.set(file, { promise: result.promise, started: started.resolve });
  const source = await readFile(resolve(__dirname, '../today/public/roof/connectors.js'), 'utf8');
  await Promise.all([
    writeFile(join(dir, 'connectors.mjs'), source.replace('"./router.js"', '"./router.mjs"').replace('"./search.js"', '"./search.mjs"')),
    writeFile(join(dir, 'router.mjs'), `export const REGISTRY = { weather: { app: 'weather', name: 'Weather', path: '/weather/', sections: [['now', 'Now']], aliases: {}, connector: ${JSON.stringify(file)} } };`),
    writeFile(join(dir, 'search.mjs'), 'export const match = () => null;'),
    writeFile(join(dir, 'descriptor.mjs'), 'const gate = globalThis.__infliteConnectorLifecycleGates.get(import.meta.url); gate.started(); export const connector = await gate.promise;'),
  ]);
  const { openConnector } = await import(pathToFileURL(join(dir, 'connectors.mjs')));
  const lifetime = new AbortController(), opened = [], rendered = [];
  const F = {
    signal: lifetime.signal, route: youRoute('apps'), session: { apps: { weather: true } },
    ui: { el(...args) { rendered.push(args); return { args }; } },
    sheet: { open(spec) { const handle = { spec }; opened.push(handle); return handle; } },
  };
  return { F, lifetime, opened, rendered, openConnector, started: started.promise, finish: () => result.resolve(descriptor),
    cleanup: async () => { result.resolve(descriptor); gates.delete(file); await rm(dir, { recursive: true, force: true }); } };
}

for (const change of ['destroy', 'navigate', 'leave-and-return', 'replace-argument', 'replace-signal']) {
  test(`a delayed connector cannot open after ${change}`, async () => {
    const f = await fixture();
    try {
      const pending = f.openConnector(f.F, 'weather'); await f.started;
      if (change === 'destroy') f.lifetime.abort();
      if (change === 'navigate') f.F.route = { kind: 'tab', tab: 'today', arg: null };
      if (change === 'leave-and-return') { f.F.route = { kind: 'tab', tab: 'today', arg: null }; f.F.route = youRoute('apps'); }
      if (change === 'replace-argument') f.F.route = youRoute('rules');
      if (change === 'replace-signal') f.F.signal = new AbortController().signal;
      f.finish(); assert.equal(await pending, null);
      assert.equal(f.opened.length, 0); assert.equal(f.rendered.length, 0, 'obsolete work does not build sheet DOM');
    } finally { await f.cleanup(); }
  });
}

for (const kind of ['you', 'module']) {
  test(`a connector still opens from its current ${kind} route`, async () => {
    const f = await fixture();
    try {
      if (kind === 'module') f.F.route = { kind: 'app', app: 'weather', section: 'now', key: 'now', arg: null, query: '' };
      const pending = f.openConnector(f.F, 'weather'); await f.started; f.finish();
      const handle = await pending;
      assert.equal(handle, f.opened[0]); assert.equal(f.opened.length, 1);
      assert.equal(handle.spec.sheet, 'connector'); assert.equal(handle.spec.app, 'weather');
      assert.equal(handle.spec.title, 'Weather’s connector');
      assert.deepEqual(handle.spec.acts.map(a => a.href), ['/weather/', '/weather/#settings', '/#you=notify-weather']);
    } finally { await f.cleanup(); }
  });
}

test('a pre-disposed frame never starts its connector import or builds a sheet', async () => {
  const f = await fixture();
  try {
    f.lifetime.abort(); assert.equal(await f.openConnector(f.F, 'weather'), null);
    assert.equal(f.opened.length, 0); assert.equal(f.rendered.length, 0);
  } finally { await f.cleanup(); }
});

test('a fallback connector respects navigation before its asynchronous return', async () => {
  const f = await fixture();
  try {
    f.F.session.apps.weather = false;
    const pending = f.openConnector(f.F, 'weather'); f.F.route = youRoute('rules');
    assert.equal(await pending, null); assert.equal(f.opened.length, 0);
  } finally { await f.cleanup(); }
});
