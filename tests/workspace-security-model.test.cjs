const { test } = require('node:test');
const assert = require('node:assert/strict');
const models = Promise.all([
  import('../today/public/roof/workspace-catalog.js'),
  import('../today/public/roof/workspace-state.js'),
  import('../today/public/roof/workspace-context.js'),
]);

test('adversarial route mutations cannot change URL origin, pathname or carry query data', async () => {
  const [{ safeWorkspaceRoute }] = await models;
  const origin = 'https://os.inflite.ai';
  const bases = [['fitness', '/fitness/#today'], ['weather', '/weather/#days']];
  const payloads = [
    '?code=fixture-secret', '?lat=52&lon=1', '%3Fcode%3Dfixture-secret', '%23today',
    '../', '/..', '\\..', '%2f..', '%252f..', '\n', '\r', '\t', '\0',
    'https://evil.test/', '//evil.test/', '@evil.test', '#signin', '&token=fixture-secret',
    '<svg/onload=alert(1)>', '\u202e', '\u2066', '\u00a0', '\ufeff',
  ];
  let checked = 0;
  for (const [app, base] of bases) {
    for (const payload of payloads) {
      for (let at = 0; at <= base.length; at++) {
        const route = base.slice(0, at) + payload + base.slice(at);
        const accepted = safeWorkspaceRoute(app, route);
        checked++;
        if (accepted === null) continue;
        const target = new URL(accepted, origin);
        assert.equal(target.origin, origin, route);
        assert.equal(target.pathname, `/${app}/`, route);
        assert.equal(target.search, '', route);
        assert.equal(accepted.includes('fixture-secret'), false, route);
      }
    }
  }
  assert.ok(checked > 700);
});

test('abort during context delivery clears private location before another subscriber can run', async () => {
  const [, , { createWorkspaceContext }] = await models;
  const life = new AbortController();
  const context = createWorkspaceContext({ signal: life.signal });
  context.subscribe(() => life.abort());
  context.subscribe(() => assert.fail('old-account location delivered after abort'));
  assert.equal(context.update({ location: { name: 'Private start', lat: 52.5, lon: 1.2 } }, { source: 'fitness:weather-for-ride' }), true);
  assert.deepEqual(context.get(), { location: null, interval: null });
  assert.equal(context.update({ location: { name: 'Late start', lat: 51, lon: 0 } }, { source: 'weather:place' }), false);
});

test('independent workspaces do not share context or retain caller-owned coordinate objects', async () => {
  const [, , { createWorkspaceContext }] = await models;
  const first = createWorkspaceContext(), second = createWorkspaceContext();
  const location = { name: 'Ride start', lat: 52.1234567, lon: 1.1234567, token: 'fixture-secret' };
  first.update({ location }, { source: 'fitness:weather-for-ride' });
  location.lat = 90; location.name = 'Changed';
  assert.deepEqual(second.get(), { location: null, interval: null });
  assert.deepEqual(first.get().location, { name: 'Ride start', lat: 52.123457, lon: 1.123457 });
  assert.equal(JSON.stringify(first.get()).includes('fixture-secret'), false);
  first.dispose();
  assert.deepEqual(first.get(), second.get());
});

test('maximum supported Unicode metadata remains restorable within the stated storage byte bound', async () => {
  const [, { createWorkspaceStore, WORKSPACE_LIMITS }] = await models;
  const entries = new Map();
  const storage = { getItem: key => entries.get(key), setItem: (key, value) => entries.set(key, value) };
  let id = 0;
  const store = createWorkspaceStore({ userId: 'a'.repeat(128), storage, now: () => Number.MAX_SAFE_INTEGER, makeId: () => 'w' + (++id).toString().padEnd(39, 'a') });
  const panes = [{ app: 'fitness', route: '/fitness/#act=' + 'x'.repeat(40) }, { app: 'weather', route: '/weather/#day=2028-02-29' }];
  store.update('ride', { name: '🚲'.repeat(60), panes });
  for (let n = 1; n < WORKSPACE_LIMITS.workspaces; n++) assert.ok(store.create({ name: '🚲'.repeat(60), panes }));
  const encoded = [...entries.values()][0];
  assert.ok(Buffer.byteLength(encoded, 'utf8') < WORKSPACE_LIMITS.storedBytes);
  const restored = createWorkspaceStore({ userId: 'a'.repeat(128), storage });
  assert.equal(restored.persisted, true);
  assert.deepEqual(restored.read(), store.read());
});


test('every accepted workspace identifier remains addressable by the live router', async () => {
  const [, { createWorkspaceStore, restoreWorkspaceState }] = await models;
  const { parse } = await import('../today/public/roof/router.js');
  const id = 'w'.repeat(40), store = createWorkspaceStore({ userId: 'owner-a', storage: null, makeId: () => id });
  const record = store.create({ name: 'Bounded', panes: [{ app: 'fitness' }] });
  assert.equal(record.id, id);
  assert.equal(parse('/#workspace=' + record.id, { workspace: true }).arg, id);
  const tooLong = createWorkspaceStore({ userId: 'owner-a', storage: null, makeId: () => id + 'x' });
  assert.equal(tooLong.create({ name: 'Unreachable', panes: [{ app: 'weather' }] }), null);
  const invalid = { version: 1, userId: 'owner-a', activeId: id + 'x', workspaces: [{ id: id + 'x', name: 'Unreachable', panes: [{ app: 'weather' }], activePane: 'weather', updatedAt: 1 }] };
  assert.equal(restoreWorkspaceState(invalid, 'owner-a').activeId, 'ride');
});
