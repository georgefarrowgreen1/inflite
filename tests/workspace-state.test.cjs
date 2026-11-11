const { test } = require('node:test');
const assert = require('node:assert/strict');
const stateModule = import('../today/public/roof/workspace-state.js');
const catalogModule = import('../today/public/roof/workspace-catalog.js');
const memory = () => {
  const data = new Map(), writes = [];
  return { data, writes, getItem: key => data.get(key) ?? null, setItem(key, value) { data.set(key, value); writes.push({ key, value }); }, removeItem: key => data.delete(key) };
};
const pane = (app = 'fitness', route) => ({ app, ...(route === undefined ? {} : { route }) });
const setup = async (extra = {}) => {
  const { createWorkspaceStore } = await stateModule;
  let n = 0;
  const storage = memory();
  const store = createWorkspaceStore({ userId: 'account-a', storage, now: () => 1700000000000, makeId: () => `workspace-${++n}`, ...extra });
  return { store, storage };
};

test('catalogue v1 exposes all five first-party panes without an isolation claim', async () => {
  const { WORKSPACE_APPS, WORKSPACE_MANIFEST_VERSION, getWorkspaceApp } = await catalogModule;
  assert.equal(WORKSPACE_MANIFEST_VERSION, 1);
  assert.deepEqual(WORKSPACE_APPS.filter(a => a.pane).map(a => a.id), ['fitness', 'weather', 'markets', 'chats', 'mail']);
  for (const app of WORKSPACE_APPS) {
    assert.equal(app.trust, 'first-party');
    assert.equal(app.manifestVersion, 1);
    assert.deepEqual(app.formFactors, ['phone', 'desktop']);
    assert.ok(Object.isFrozen(app) && Object.isFrozen(app.capabilities) && Object.isFrozen(app.formFactors));
    assert.equal(getWorkspaceApp(app.id), app);
    assert.equal('sandboxed' in app, false);
    assert.equal('permissionsGranted' in app, false);
  }
  assert.ok(Object.isFrozen(WORKSPACE_APPS));
  for (const id of ['files', 'calendar', '__proto__', 'constructor', null]) assert.equal(getWorkspaceApp(id), null);
});

test('saved routes admit only curated internal sections and bounded object references', async () => {
  const { safeWorkspaceRoute } = await catalogModule;
  for (const [app, route] of [
    ['fitness', '/fitness/#routes'], ['fitness', '/fitness/#day=2026-11-10'], ['fitness', '/fitness/#act=ride_12-a'],
    ['weather', '/weather/#radar'], ['weather', '/weather/#day=2028-02-29'],
    ['markets', '/markets/#s=TSCO.L'], ['markets', '/markets/#s=^GSPC'], ['markets', '/markets/#s=GBPUSD=X'],
    ['chats', '/chats/#open=friend-123'], ['mail', '/mail/#thread=thread_9'],
  ]) assert.equal(safeWorkspaceRoute(app, route), route, route);
  assert.equal(safeWorkspaceRoute('fitness', '/fitness/'), '/fitness/#today');
  assert.equal(safeWorkspaceRoute('weather', '/weather/'), '/weather/#now');
});

test('route injection, auth state, share payloads, bodies and encoded routes cannot be persisted', async () => {
  const { safeWorkspaceRoute } = await catalogModule;
  for (const route of [
    'https://inflite.ai/fitness/', '//evil.test/fitness/', 'javascript:alert(1)', '/fitness/../weather/',
    '/fitness/#today?token=secret', '/fitness/?code=secret#today', '/fitness/#today&amount=5000',
    '/fitness/#settings', '/fitness/#signin', '/fitness/#account', '/fitness/#share=body',
    '/fitness/#act=%2e%2e', '/fitness/#act=a/b', '/fitness/#act=a\\b', '/fitness/#act=a\nb',
    '/fitness/#day=2026-02-31', '/fitness/#day=2026-13-01', '/fitness/#day=2026-1-01',
    '/fitness/#act=' + 'a'.repeat(41), '/fitness/#today#now', '/fitness/#today ',
  ]) assert.equal(safeWorkspaceRoute('fitness', route), null, route);
  for (const [app, route] of [['chats', '/chats/#share=encrypted-or-plain'], ['mail', '/mail/#signin'], ['weather', '/weather/?lat=52&lon=1'], ['markets', '/markets/#s=10000'], ['fitness', '/weather/#now']]) assert.equal(safeWorkspaceRoute(app, route), null, route);
});

test('the first account starts with the real Ride pair without writing storage or inventing other apps', async () => {
  const { store, storage } = await setup();
  assert.equal(store.read().version, 2);
  assert.equal(store.read().userId, 'account-a');
  assert.equal(store.read().activeId, 'ride');
  assert.deepEqual(store.read().workspaces[0].panes, [
    { id: 'fitness', app: 'fitness', route: '/fitness/#today' }, { id: 'weather', app: 'weather', route: '/weather/#now' },
  ]);
  assert.equal(storage.writes.length, 0);
  assert.equal(store.persisted, false);
});

test('create and update save only whitelisted route metadata, never copied domain or auth fields', async () => {
  const { store, storage } = await setup();
  const created = store.create({ name: '  Morning   ride  ', panes: [{ ...pane(), amount: 5000, body: 'message body', token: 'auth-secret', id: 'tampered' }], account: 'other', auth: 'secret' });
  assert.equal(created.name, 'Morning ride');
  assert.equal(created.id, store.read().activeId);
  assert.ok(Object.isFrozen(created));
  const updated = store.update(created.id, { panes: [pane('weather', '/weather/#days')], body: 'private', activeId: 'foreign' });
  assert.equal(updated.activePane, 'weather', 'replacement panes have a valid default focus');
  assert.equal(store.update(created.id, { activePane: 'fitness' }), null);
  assert.equal(store.update(created.id, { panes: [pane('weather', '/weather/?token=secret')] }), null);
  assert.equal(store.persisted, true);
  for (const { value } of storage.writes) {
    for (const secret of ['5000', 'message body', 'auth-secret', 'tampered', 'private', 'foreign', 'token', 'body', 'amount']) assert.equal(value.includes(secret), false, secret);
    const saved = JSON.parse(value);
    assert.deepEqual(Object.keys(saved), ['version', 'userId', 'activeId', 'workspaces']);
    for (const w of saved.workspaces) for (const p of w.panes) assert.deepEqual(Object.keys(p), ['id', 'app', 'route']);
  }
});

test('unsupported, duplicate or excessive panes and workspace limits reject without partial writes', async () => {
  const { store, storage } = await setup();
  for (const panes of [[], [pane('files')], [pane(), pane()], [pane(), pane('weather'), pane()], ['fitness', 'weather', 'markets', 'chats', 'mail', 'fitness'].map(app => pane(app))]) assert.equal(store.create({ name: 'Test', panes }), null);
  assert.equal(storage.writes.length, 0);
  for (let i = 1; i < 8; i++) assert.ok(store.create({ name: 'Ride ' + i, panes: [pane()] }));
  const before = storage.writes.length;
  assert.equal(store.create({ name: 'Ninth', panes: [pane()] }), null);
  assert.equal(store.read().workspaces.length, 8);
  assert.equal(storage.writes.length, before);
});

test('restoring saved metadata filters malformed records and fixes missing active references', async () => {
  const { restoreWorkspaceState } = await stateModule;
  const valid = { id: 'one', name: 'One', panes: [pane()], activePane: 'missing', updatedAt: NaN, body: 'not copied' };
  const restored = restoreWorkspaceState({ version: 1, userId: 'a', activeId: 'missing', workspaces: [
    { ...valid, id: '__proto__' }, { ...valid, name: '' }, { ...valid, panes: [pane('weather', '/weather/?auth=secret')] },
    valid, { ...valid, name: 'Duplicate should not replace first' }, { ...valid, id: 'two', panes: [pane('files')] },
  ], auth: 'secret' }, 'a', 42);
  assert.deepEqual(restored, { version: 2, userId: 'a', activeId: 'one', workspaces: [{ id: 'one', name: 'One', panes: [{ id: 'fitness', app: 'fitness', route: '/fitness/#today' }], activePane: 'fitness', layout: { mode: 'tile', windows: { fitness: { x: .025, y: .025, w: .65, h: .8, minimized: false } }, order: ['fitness'] }, updatedAt: 42 }] });
});

test('foreign account, unsupported version, malformed or excessive storage safely starts fresh', async () => {
  const { createWorkspaceStore, WORKSPACE_LIMITS } = await stateModule;
  const { store } = await setup(), good = JSON.parse(JSON.stringify(store.read()));
  for (const text of [
    '{broken', 'null', '[]', JSON.stringify({ ...good, userId: 'another-account' }), JSON.stringify({ ...good, version: 999 }),
    JSON.stringify({ ...good, workspaces: new Array(9).fill(good.workspaces[0]) }), ' '.repeat(WORKSPACE_LIMITS.storedBytes + 1),
  ]) {
    const storage = memory(); storage.data.set('ifl:workspace:v1:account-a', text);
    const fresh = createWorkspaceStore({ userId: 'account-a', storage, now: () => 7 });
    assert.equal(fresh.read().workspaces[0].id, 'ride');
    assert.equal(fresh.read().workspaces.length, 1);
    assert.equal(fresh.read().userId, 'account-a');
    assert.equal(fresh.persisted, false);
    assert.equal(storage.writes.length, 0);
  }
});

test('saving then restoring is idempotent and does not replay creations or duplicate defaults', async () => {
  const { createWorkspaceStore } = await stateModule;
  const { store, storage } = await setup();
  const one = store.create({ name: 'Forecast', panes: [pane('weather', '/weather/#warnings')] });
  store.update(one.id, { name: 'Tomorrow' });
  const snapshot = store.read(), writes = storage.writes.length;
  for (let i = 0; i < 3; i++) {
    const restored = createWorkspaceStore({ userId: 'account-a', storage, now: () => 99 });
    assert.deepEqual(restored.read(), snapshot);
    assert.equal(restored.persisted, true);
    assert.equal(storage.writes.length, writes);
    restored.dispose();
  }
});

test('account switches and late callbacks cannot overwrite or clear another account workspace', async () => {
  const { createWorkspaceStore } = await stateModule;
  const storage = memory(), oldLife = new AbortController();
  const a = createWorkspaceStore({ userId: 'account-a', storage, now: () => 1, makeId: () => 'a-work', signal: oldLife.signal });
  a.create({ name: 'A private layout', panes: [pane()] });
  oldLife.abort();
  const b = createWorkspaceStore({ userId: 'account-b', storage, now: () => 2, makeId: () => 'b-work' });
  assert.equal(b.read().workspaces.length, 1);
  assert.equal(JSON.stringify(b.read()).includes('A private'), false);
  b.create({ name: 'B layout', panes: [pane('weather')] });
  const before = [...storage.data];
  assert.equal(a.create({ name: 'Stale', panes: [pane()] }), null);
  assert.equal(a.update('a-work', { name: 'Stale' }), null);
  assert.equal(a.select('ride'), false);
  assert.equal(a.remove('a-work'), false);
  a.clear(); a.dispose(); a.dispose();
  assert.deepEqual([...storage.data], before);
  b.clear();
  assert.ok(storage.data.has('ifl:workspace:v2:account-a'));
  assert.deepEqual(JSON.parse(storage.data.get('ifl:workspace:v2:account-b')), b.read(), 'reset persists a v2 tombstone without touching another owner');
});

test('a pre-aborted lifetime is inert and explicit disposal fences every mutation', async () => {
  const controller = new AbortController(); controller.abort();
  for (const extra of [{ signal: controller.signal }, {}]) {
    const { store, storage } = await setup(extra);
    store.dispose();
    assert.equal(store.create({ name: 'Late', panes: [pane()] }), null);
    assert.equal(store.update('ride', { name: 'Late' }), null);
    assert.equal(store.select('ride'), false);
    assert.equal(store.remove('ride'), false);
    store.clear();
    assert.equal(storage.writes.length, 0);
  }
});

test('storage denial and quota errors preserve the current session and report unsaved metadata', async () => {
  for (const storage of [null, { getItem() { throw Error('denied'); }, setItem() { throw Error('quota'); }, removeItem() { throw Error('denied'); } }]) {
    const { store } = await setup({ storage });
    const created = store.create({ name: 'In memory', panes: [pane()] });
    assert.ok(created);
    assert.equal(store.read().activeId, created.id);
    assert.equal(store.persisted, false);
    assert.ok(store.update(created.id, { name: 'Still editable' }));
    store.clear();
    assert.equal(store.read().workspaces[0].name, 'Ride');
  }
});

test('snapshots cannot be mutated by callers or by later edits to their original inputs', async () => {
  const { store } = await setup();
  const input = { name: 'One', panes: [pane('weather')] }, created = store.create(input);
  input.name = 'Changed'; input.panes[0].app = 'mail'; input.panes.push(pane());
  assert.equal(created.name, 'One');
  assert.equal(created.panes.length, 1);
  assert.equal(created.panes[0].app, 'weather');
  assert.ok(Object.isFrozen(store.read()) && Object.isFrozen(created.panes) && Object.isFrozen(created.panes[0]));
  assert.throws(() => created.panes.push(pane()), TypeError);
});

test('selection and deletion use valid workspace IDs and deleting the final one restores Ride', async () => {
  const { store } = await setup();
  const one = store.create({ name: 'One', panes: [pane()] });
  assert.equal(store.select('unknown'), false);
  assert.equal(store.remove('unknown'), false);
  assert.equal(store.select('ride'), true);
  assert.equal(store.read().activeId, 'ride');
  assert.equal(store.remove('ride'), true);
  assert.equal(store.read().activeId, one.id);
  assert.equal(store.remove(one.id), true);
  assert.deepEqual(store.read().workspaces.map(w => w.id), ['ride']);
  assert.equal(store.read().activeId, 'ride');
});

test('invalid account identity is refused before reading any storage', async () => {
  const { createWorkspaceStore } = await stateModule;
  for (const userId of [undefined, null, '', '../account', 'account:token', 'a'.repeat(129), 42]) {
    assert.throws(() => createWorkspaceStore({ userId, storage: { getItem() { assert.fail('read without valid identity'); } } }), TypeError);
  }
});

test('name, ID and clock edge cases are bounded without an ID-collision retry loop', async () => {
  let calls = 0;
  const { store } = await setup({ makeId: () => { calls++; return 'ride'; }, now: () => Infinity });
  assert.equal(store.create({ name: 'Collision', panes: [pane()] }), null);
  assert.equal(calls, 4);
  assert.equal(store.read().workspaces[0].updatedAt, 0);
  const fresh = (await setup()).store;
  const one = fresh.create({ name: '  \u202e' + '🚲'.repeat(100) + '\u0000  ', panes: [pane()] });
  assert.equal([...one.name].length, 60);
  assert.equal(one.name.includes('\u202e'), false);
  assert.equal(one.name.includes('\u0000'), false);
  assert.equal(fresh.create({ name: '\u0000  ', panes: [pane()] }), null);
  assert.equal(fresh.create(null), null);
  assert.equal(fresh.update('ride', null), null);
});

const contextModule = import('../today/public/roof/workspace-context.js');
const CONTEXT_NOW = 1700000000000, HOUR = 3600000;
const place = () => ({ name: 'North Walsham', lat: 52.8213, lon: 1.3867, region: 'GB' });

test('ephemeral context starts empty and copies only explicit validated place/time metadata', async () => {
  const { createWorkspaceContext } = await contextModule;
  const context = createWorkspaceContext({ now: () => CONTEXT_NOW });
  assert.deepEqual(context.get(), { location: null, interval: null });
  const seen = [];
  context.subscribe((value, meta) => seen.push({ value, meta }));
  const input = { location: { ...place(), amount: 5000, token: 'secret' }, interval: { start: CONTEXT_NOW, end: CONTEXT_NOW + HOUR, body: 'private' }, auth: 'secret' };
  assert.equal(context.update(input, { source: 'fitness:weather-for-ride' }), true);
  assert.deepEqual(context.get(), { location: place(), interval: { start: CONTEXT_NOW, end: CONTEXT_NOW + HOUR } });
  assert.deepEqual(seen[0].meta, { source: 'fitness:weather-for-ride' });
  assert.ok(Object.isFrozen(context.get()) && Object.isFrozen(context.get().location) && Object.isFrozen(context.get().interval));
  input.location.lat = 90; input.interval.end = CONTEXT_NOW;
  assert.equal(context.get().location.lat, 52.8213);
  assert.equal(context.get().interval.end, CONTEXT_NOW + HOUR);
  assert.equal(JSON.stringify(context.get()).includes('secret'), false);
});

test('replayed coordinates and intervals do not emit updates or feedback loops', async () => {
  const { createWorkspaceContext } = await contextModule;
  const context = createWorkspaceContext({ now: () => CONTEXT_NOW });
  let calls = 0;
  context.subscribe(value => { calls++; assert.equal(context.update(value, { source: 'weather:place-chosen' }), false); });
  const value = { location: place(), interval: { start: CONTEXT_NOW, end: CONTEXT_NOW + HOUR } };
  assert.equal(context.update(value, { source: 'fitness' }), true);
  assert.equal(context.update(structuredClone(value), { source: 'weather' }), false);
  assert.equal(context.update({ location: { ...place(), lat: place().lat + 0.00000001 } }, { source: 'weather' }), false, 'sub-metre rounding does not churn context');
  assert.equal(context.update({ token: 'ignored' }, { source: 'fitness' }), false);
  assert.equal(calls, 1);
});

test('invalid location data and unsupported publishers cannot change current context', async () => {
  const { createWorkspaceContext } = await contextModule;
  const context = createWorkspaceContext({ now: () => CONTEXT_NOW });
  for (const source of [undefined, null, 'markets', 'mail', 'fitness:../secrets', 'weather:', 'Fitness', 'weather:' + 'a'.repeat(41), 'fitness:one:two']) assert.equal(context.update({ location: place() }, { source }), false, String(source));
  assert.equal(context.update({ location: place() }, null), false);
  for (const location of [undefined, {}, { ...place(), lat: '52' }, { ...place(), lat: NaN }, { ...place(), lat: Infinity }, { ...place(), lat: 90.1 }, { ...place(), lon: -180.1 }, { ...place(), name: '' }, { ...place(), region: 4 }]) assert.equal(context.update({ location }, { source: 'fitness' }), false);
  assert.deepEqual(context.get(), { location: null, interval: null });
  assert.equal(context.update({ location: { name: 'North pole', lat: 90, lon: 180 } }, { source: 'weather:place-chosen' }), true);
  assert.deepEqual(context.get().location, { name: 'North pole', lat: 90, lon: 180 });
});

test('time context is an ordered UTC millisecond interval bounded to forecast horizon and 48 hours', async () => {
  const { createWorkspaceContext } = await contextModule;
  const context = createWorkspaceContext({ now: () => CONTEXT_NOW });
  for (const interval of [undefined, {}, { start: CONTEXT_NOW, end: CONTEXT_NOW }, { start: CONTEXT_NOW, end: CONTEXT_NOW - 1 }, { start: CONTEXT_NOW, end: CONTEXT_NOW + 48 * HOUR + 1 }, { start: CONTEXT_NOW - 24 * HOUR - 1, end: CONTEXT_NOW }, { start: CONTEXT_NOW + 16 * 24 * HOUR - 1, end: CONTEXT_NOW + 16 * 24 * HOUR + 1 }, { start: String(CONTEXT_NOW), end: CONTEXT_NOW + HOUR }, { start: CONTEXT_NOW, end: Infinity }]) assert.equal(context.update({ interval }, { source: 'fitness' }), false);
  assert.equal(context.update({ interval: { start: CONTEXT_NOW - 24 * HOUR, end: CONTEXT_NOW + 24 * HOUR } }, { source: 'fitness' }), true);
  assert.equal(context.update({ interval: { start: CONTEXT_NOW + 15 * 24 * HOUR, end: CONTEXT_NOW + 16 * 24 * HOUR } }, { source: 'fitness' }), true);
  assert.equal(createWorkspaceContext({ now: () => NaN }).update({ interval: { start: CONTEXT_NOW, end: CONTEXT_NOW + HOUR } }, { source: 'fitness' }), false);
});

test('invalid compound updates are atomic and null clears are explicit, independent and deduplicated', async () => {
  const { createWorkspaceContext } = await contextModule;
  const context = createWorkspaceContext({ now: () => CONTEXT_NOW });
  context.update({ location: place(), interval: { start: CONTEXT_NOW, end: CONTEXT_NOW + HOUR } }, { source: 'fitness' });
  const before = context.get();
  assert.equal(context.update({ location: { ...place(), name: 'Changed' }, interval: { start: 5, end: 4 } }, { source: 'fitness' }), false);
  assert.equal(context.get(), before);
  assert.equal(context.update({ location: null }, { source: 'weather' }), true);
  assert.equal(context.get().location, null);
  assert.deepEqual(context.get().interval, before.interval);
  assert.equal(context.update({ interval: null }, { source: 'fitness' }), true);
  assert.deepEqual(context.get(), { location: null, interval: null });
  assert.equal(context.update({ location: null, interval: null }, { source: 'fitness' }), false);
});

test('abort/dispose clears context, removes subscribers and makes all stale writers inert', async () => {
  const { createWorkspaceContext } = await contextModule;
  for (const beforeStart of [false, true]) {
    const controller = new AbortController();
    if (beforeStart) controller.abort();
    const context = createWorkspaceContext({ signal: controller.signal, now: () => CONTEXT_NOW });
    let calls = 0;
    context.subscribe(() => calls++);
    context.update({ location: place() }, { source: 'fitness' });
    assert.equal(calls, beforeStart ? 0 : 1);
    controller.abort();
    assert.deepEqual(context.get(), { location: null, interval: null });
    assert.equal(context.update({ location: place() }, { source: 'fitness' }), false);
    context.subscribe(() => assert.fail('subscriber attached after disposal'));
    context.dispose(); context.dispose();
    assert.equal(calls, beforeStart ? 0 : 1);
  }
});

test('unsubscribed, failed or disposed listeners cannot disrupt other consumers or revive the old context', async () => {
  const { createWorkspaceContext } = await contextModule;
  const context = createWorkspaceContext({ now: () => CONTEXT_NOW });
  let calls = 0;
  const off = context.subscribe(() => assert.fail('removed listener'));
  off(); off();
  context.subscribe(() => { throw Error('consumer failed'); });
  context.subscribe(() => calls++);
  context.update({ location: place() }, { source: 'fitness' });
  assert.equal(calls, 1);
  context.subscribe(() => context.dispose());
  context.subscribe(() => assert.fail('listener after disposal'));
  context.update({ location: null }, { source: 'fitness' });
  assert.equal(calls, 2);
  assert.deepEqual(context.get(), { location: null, interval: null });
});

test('reentrant context updates never deliver an older snapshot after a newer one', async () => {
  const { createWorkspaceContext } = await contextModule;
  const context = createWorkspaceContext({ now: () => CONTEXT_NOW }), seen = [];
  context.subscribe(value => {
    if (value.location?.name === 'North Walsham') context.update({ location: { ...place(), name: 'Chosen second' } }, { source: 'weather:place-chosen' });
  });
  context.subscribe(value => seen.push(value.location.name));
  context.update({ location: place() }, { source: 'fitness:weather-for-ride' });
  assert.deepEqual(seen, ['Chosen second']);
});

test('each context subscription cleanup owns its registration, including reused stable callbacks', async () => {
  const { createWorkspaceContext } = await contextModule;
  const context = createWorkspaceContext({ now: () => CONTEXT_NOW }), seen = [];
  const listener = value => seen.push(value.location?.name);
  const old = context.subscribe(listener);
  old();
  const current = context.subscribe(listener);
  old();
  context.update({ location: place() }, { source: 'weather' });
  assert.deepEqual(seen, ['North Walsham'], 'an old cleanup cannot remove a later registration');
  const other = context.subscribe(listener);
  current(); current();
  context.update({ location: { ...place(), name: 'London' } }, { source: 'weather' });
  assert.deepEqual(seen, ['North Walsham', 'London'], 'another registration survives one owner’s cleanup');
  other();
  context.update({ location: null }, { source: 'weather' });
  assert.deepEqual(seen, ['North Walsham', 'London']);
});

test('a listener removed and resubscribed during dispatch receives only the next context change', async () => {
  const { createWorkspaceContext } = await contextModule;
  const context = createWorkspaceContext({ now: () => CONTEXT_NOW }), seen = [];
  let first = true, remove;
  const listener = value => seen.push(value.location.name);
  context.subscribe(() => {
    if (!first) return;
    first = false;
    remove();
    remove = context.subscribe(listener);
  });
  remove = context.subscribe(listener);
  context.update({ location: place() }, { source: 'fitness' });
  assert.deepEqual(seen, [], 'the new registration was not present when dispatch began');
  context.update({ location: { ...place(), name: 'London' } }, { source: 'weather' });
  assert.deepEqual(seen, ['London']);
});

test('public metadata restoration normalises invalid fallback timestamps before building a snapshot', async () => {
  const { restoreWorkspaceState } = await stateModule;
  const value = { version: 1, userId: 'account-a', activeId: 'one', workspaces: [{ id: 'one', name: 'One', panes: [pane()], updatedAt: NaN }] };
  for (const at of [NaN, Infinity, -1, Number.MAX_SAFE_INTEGER + 1, 'yesterday', null, {}]) {
    for (const input of [null, value]) assert.equal(restoreWorkspaceState(input, 'account-a', at).workspaces[0].updatedAt, 0);
  }
  assert.equal(restoreWorkspaceState(value, 'account-a', 42).workspaces[0].updatedAt, 42);
});

test('generated stored metadata stays account-scoped, bounded, immutable and canonically restorable', async () => {
  const { restoreWorkspaceState, WORKSPACE_LIMITS } = await stateModule;
  const { safeWorkspaceRoute } = await catalogModule;
  const marker = 'fixture-secret-body';
  const choices = [null, {}, '', ' ', 4, 'safe', '__proto__', '../wrong', '\u202eTitle', '🚲'.repeat(80)];
  const apps = ['fitness', 'weather', 'mail', 'markets', 'chats', '__proto__', null];
  const routes = [undefined, '/fitness/#today', '/weather/#now', '/weather/#day=2026-11-10', '/fitness/?code=secret', '//evil.test/', '/fitness/#act=%2f', '/weather/#day=2026-02-31'];
  let seed = 0x6b8b4567;
  const pick = values => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return values[(seed >>> 0) % values.length]; };
  let recognised = 0;
  for (let n = 0; n < 400; n++) {
    const account = n % 3 ? 'account-a' : 'account-b';
    const value = { version: n % 5 ? 1 : 2, userId: account, activeId: pick(choices), token: marker, workspaces: Array.from({ length: n % 10 }, () => ({
      id: pick(choices), name: pick(choices), activePane: pick(apps), updatedAt: pick([NaN, -1, 5, Number.MAX_SAFE_INTEGER + 1]), body: marker,
      panes: Array.from({ length: n % 4 }, () => ({ app: pick(apps), route: pick(routes), token: marker })),
    })) };
    if (n % 8 === 0) {
      value.version = 1; value.userId = 'account-a';
      value.workspaces = [{ id: 'generated', name: 'Ride 🚲', activePane: 'missing', updatedAt: -1, body: marker,
        panes: [pane('weather', '/weather/#day=2026-11-10'), pane('fitness', '/fitness/#act=ride_12-a')] }, ...value.workspaces.slice(0, 7)];
    }
    const restored = restoreWorkspaceState(value, 'account-a', pick([0, 42, NaN, -1, {}]));
    if (restored.workspaces.some(w => w.id === 'generated')) recognised++;
    assert.equal(restored.userId, 'account-a');
    assert.ok(Object.isFrozen(restored) && Object.isFrozen(restored.workspaces));
    assert.ok(restored.workspaces.length >= 1 && restored.workspaces.length <= WORKSPACE_LIMITS.workspaces);
    assert.equal(new Set(restored.workspaces.map(w => w.id)).size, restored.workspaces.length);
    assert.ok(restored.workspaces.some(w => w.id === restored.activeId));
    for (const w of restored.workspaces) {
      assert.ok(Number.isSafeInteger(w.updatedAt) && w.updatedAt >= 0);
      assert.ok(Object.isFrozen(w) && Object.isFrozen(w.panes));
      assert.ok(w.panes.length >= 1 && w.panes.length <= WORKSPACE_LIMITS.panes);
      assert.equal(new Set(w.panes.map(p => p.app)).size, w.panes.length);
      assert.ok(w.panes.some(p => p.id === w.activePane));
      for (const p of w.panes) { assert.ok(Object.isFrozen(p)); assert.equal(safeWorkspaceRoute(p.app, p.route), p.route); }
    }
    assert.equal(JSON.stringify(restored).includes(marker), false);
    assert.deepEqual(restoreWorkspaceState(JSON.parse(JSON.stringify(restored)), 'account-a', 99), restored);
  }
  assert.equal(recognised, 50, 'generated cases exercise retained metadata as well as safe fallback');
});
