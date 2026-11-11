const { test } = require('node:test');
const assert = require('node:assert/strict');
const stateModule = import('../today/public/roof/workspace-state.js');
const apps = ['fitness', 'weather', 'markets', 'chats', 'mail'];
const pane = app => ({ app });
const memory = () => {
  const data = new Map(), writes = [];
  return { data, writes, getItem: key => data.get(key) ?? null, setItem(key, value) { data.set(key, value); writes.push({ key, value }); }, removeItem: key => data.delete(key) };
};
const legacy = name => ({ version: 1, userId: 'owner', activeId: 'old', workspaces: [{ id: 'old', name, panes: [pane('weather')], activePane: 'weather', updatedAt: 7 }] });

test('legacy v1 metadata migrates in memory and the first edit writes only the account-owned v2 key', async () => {
  const { createWorkspaceStore } = await stateModule;
  const storage = memory(), v1 = JSON.stringify(legacy('Legacy'));
  storage.data.set('ifl:workspace:v1:owner', v1);
  const store = createWorkspaceStore({ userId: 'owner', storage, now: () => 20 });
  assert.equal(store.read().version, 2);
  assert.equal(store.read().workspaces[0].name, 'Legacy');
  assert.equal(store.read().workspaces[0].layout.mode, 'tile');
  assert.equal(store.persisted, false);
  assert.equal(storage.writes.length, 0, 'opening never mutates a retired schema');
  store.update('old', { name: 'Current' });
  assert.deepEqual(storage.writes.map(w => w.key), ['ifl:workspace:v2:owner']);
  assert.equal(storage.data.get('ifl:workspace:v1:owner'), v1);
  assert.equal(createWorkspaceStore({ userId: 'owner', storage }).read().workspaces[0].name, 'Current');
});

test('a retired v1 writer cannot overwrite or merge a current v2 layout', async () => {
  const { createWorkspaceStore } = await stateModule;
  const storage = memory();
  storage.data.set('ifl:workspace:v1:owner', JSON.stringify(legacy('Legacy')));
  const store = createWorkspaceStore({ userId: 'owner', storage });
  store.update('old', { name: 'Current', panes: apps.map(pane), activePane: 'mail', layout: { mode: 'float', windows: { mail: { x: .2, y: .1, w: .5, h: .6, minimized: true } }, order: ['mail', 'chats'] } });
  const snapshot = store.read();
  storage.data.set('ifl:workspace:v1:owner', JSON.stringify(legacy('Stale overwrite')));
  assert.deepEqual(createWorkspaceStore({ userId: 'owner', storage }).read(), snapshot);
});

test('an invalid present v2 record never falls back to stale v1 or another account', async () => {
  const { createWorkspaceStore } = await stateModule;
  for (const value of ['{broken', '', JSON.stringify({ ...legacy('Wrong owner'), version: 2, userId: 'foreign' }), JSON.stringify({ ...legacy('Future'), version: 999 })]) {
    const storage = memory();
    storage.data.set('ifl:workspace:v1:owner', JSON.stringify(legacy('Must not resurrect')));
    storage.data.set('ifl:workspace:v2:owner', value);
    const store = createWorkspaceStore({ userId: 'owner', storage });
    assert.equal(store.read().workspaces[0].name, 'Ride');
    assert.equal(storage.writes.length, 0);
  }
});

test('reset cannot resurrect retained legacy metadata after the next reload', async () => {
  const { createWorkspaceStore } = await stateModule;
  const storage = memory(), v1 = JSON.stringify(legacy('Must stay reset'));
  storage.data.set('ifl:workspace:v1:owner', v1);
  const store = createWorkspaceStore({ userId: 'owner', storage });
  store.update('old', { name: 'New layout' });
  store.clear();
  assert.equal(store.read().workspaces[0].name, 'Ride');
  assert.equal(createWorkspaceStore({ userId: 'owner', storage }).read().workspaces[0].name, 'Ride');
  assert.equal(storage.data.get('ifl:workspace:v1:owner'), v1, 'reset leaves retired writers isolated');
});

test('three through five unique apps and their minimized windows survive cold restoration', async () => {
  const { createWorkspaceStore } = await stateModule;
  for (const count of [3, 4, 5]) {
    const storage = memory(), selected = apps.slice(0, count);
    const store = createWorkspaceStore({ userId: 'owner', storage, makeId: () => 'daily', now: () => 99 });
    const workspace = store.create({ name: 'Daily', panes: selected.map(pane), layout: { mode: 'float', windows: Object.fromEntries(selected.map((app, i) => [app, { x: .02 * i, y: .01 * i, w: .6, h: .7, minimized: true }])), order: [...selected].reverse() } });
    assert.deepEqual(workspace.panes.map(p => p.app), selected);
    assert.deepEqual(workspace.layout.order, [...selected].reverse());
    assert.ok(Object.values(workspace.layout.windows).every(w => w.minimized));
    assert.deepEqual(createWorkspaceStore({ userId: 'owner', storage }).read(), store.read());
    const focus = selected[count - 1];
    const restored = store.update(workspace.id, { activePane: focus, layout: { ...workspace.layout, windows: { ...workspace.layout.windows, [focus]: { ...workspace.layout.windows[focus], minimized: false } } } });
    assert.equal(restored.activePane, focus);
    assert.equal(restored.layout.windows[focus].minimized, false);
    assert.equal(Object.values(restored.layout.windows).filter(w => w.minimized).length, count - 1);
    assert.deepEqual(createWorkspaceStore({ userId: 'owner', storage }).read(), store.read());
  }
});

test('editing pane membership retains surviving geometry and drops removed or unknown windows', async () => {
  const { createWorkspaceStore } = await stateModule;
  const store = createWorkspaceStore({ userId: 'owner', storage: null, makeId: () => 'daily' });
  const workspace = store.create({ name: 'Daily', panes: apps.map(pane), layout: { mode: 'float', windows: { mail: { x: .2, y: .1, w: .7, h: .8, minimized: true } }, order: [...apps].reverse() } });
  const updated = store.update(workspace.id, { panes: [pane('mail'), pane('weather')] });
  assert.deepEqual(Object.keys(updated.layout.windows), ['mail', 'weather']);
  assert.deepEqual(updated.layout.windows.mail, workspace.layout.windows.mail);
  assert.deepEqual(updated.layout.order, ['mail', 'weather']);
  assert.equal(updated.activePane, 'mail');
  assert.ok(Object.isFrozen(updated.layout) && Object.isFrozen(updated.layout.windows) && Object.isFrozen(updated.layout.windows.mail) && Object.isFrozen(updated.layout.order));
});

test('hostile layout geometry is finite, viewport-bounded, canonical and free of copied domain fields', async () => {
  const { createWorkspaceStore, restoreWorkspaceState } = await stateModule;
  const values = [undefined, null, {}, [], '', '1', false, true, NaN, Infinity, -Infinity, -1e20, 0, .123456789, .9999999, 1, 1e20];
  let seed = 0x5ae7b;
  const pick = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return values[(seed >>> 0) % values.length]; };
  const marker = 'fixture-private-body';
  const store = createWorkspaceStore({ userId: 'owner', storage: null, makeId: () => 'daily' });
  const workspace = store.create({ name: 'Daily', panes: apps.map(pane) });
  for (let n = 0; n < 300; n++) {
    const layout = { mode: n % 2 ? 'float' : marker, windows: Object.fromEntries([...apps, '__proto__', 'files'].map(app => [app, { x: pick(), y: pick(), w: pick(), h: pick(), minimized: pick(), body: marker, location: { lat: 52 } }])), order: ['mail', 'mail', marker, '__proto__', ...apps], token: marker };
    const updated = store.update(workspace.id, { layout });
    assert.deepEqual(updated.layout.order, ['mail', 'fitness', 'weather', 'markets', 'chats']);
    assert.equal(updated.layout.mode, n % 2 ? 'float' : 'tile');
    assert.deepEqual(Object.keys(updated.layout), ['mode', 'windows', 'order']);
    assert.deepEqual(Object.keys(updated.layout.windows), apps);
    for (const window of Object.values(updated.layout.windows)) {
      assert.deepEqual(Object.keys(window), ['x', 'y', 'w', 'h', 'minimized']);
      for (const key of ['x', 'y', 'w', 'h']) assert.ok(Number.isFinite(window[key]));
      assert.ok(window.w >= .16 && window.w <= 1);
      assert.ok(window.h >= .18 && window.h <= 1);
      assert.ok(window.x >= 0 && window.x + window.w <= 1.00000001);
      assert.ok(window.y >= 0 && window.y + window.h <= 1.00000001);
      assert.equal(typeof window.minimized, 'boolean');
    }
    const encoded = JSON.stringify(store.read());
    assert.equal(encoded.includes(marker), false);
    assert.equal(encoded.includes('location'), false);
    assert.deepEqual(restoreWorkspaceState(JSON.parse(encoded), 'owner'), store.read());
  }
});
