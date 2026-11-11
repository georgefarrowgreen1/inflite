const { test } = require('node:test');
const assert = require('node:assert/strict');
const api = import('../today/public/roof/workspace-commands.js');
const ORIGIN = 'https://os.inflite.ai';

async function fixture(options = {}) {
  const { createWorkspaceCommands } = await api, controller = new AbortController(), calls = [], providers = [];
  const F = { signal: controller.signal, session: { view: { user: { id: 'owner-a' }, apps: { mail: true } }, apps: Object.fromEntries(['fitness', 'weather', 'markets', 'chats', 'mail'].map(a => [a, true])) }, search: { provide(p) { providers.push(p); return () => calls.push(['off']); } }, toast: text => calls.push(['toast', text]) };
  const commands = createWorkspaceCommands(F, {
    apps: () => Object.keys(F.session.apps).map(id => ({ id, available: true })),
    workspaces: () => [{ id: 'ride', name: 'Morning ride' }, { id: 'work', name: 'Work <private>' }],
    actions: () => [], files: () => [],
    runIntent: (...args) => calls.push(['intent', ...args]),
    openWorkspace: id => calls.push(['workspace', id]), openFiles: q => calls.push(['files', q]), openApp: app => calls.push(['app', app]), ...options,
  });
  return { F, controller, calls, commands, provider: providers[0] };
}

test('command search opens real app editors and preserves action aliases without triggering writes while typing', async () => {
  const { provider, calls, commands } = await fixture();
  const compose = await provider.search('write email');
  assert.ok(compose.some(r => r.title === 'Compose Mail'));
  assert.deepEqual(calls, [], 'searching itself does not run an action');
  await compose.find(r => r.title === 'Compose Mail').run();
  assert.deepEqual(calls, [['intent', 'mail', 'compose', undefined]]);
  const chat = await provider.search('new chat');
  await chat.find(r => r.title === 'New chat').run();
  assert.equal(calls.at(-1)[2], 'new-chat');
  commands.destroy();
});

test('dynamic provider availability wins over a built-in action and disabled apps/admin Mail stay absent', async () => {
  const { provider, F, commands } = await fixture({ actions: () => [{ app: 'fitness', id: 'schedule', label: 'Change ride time', enabled: false }, { app: 'markets', id: 'income', label: 'Review income', keywords: ['dividend'] }] });
  assert.equal((await provider.search('schedule ride')).some(r => /ride time/.test(r.title)), false);
  assert.ok((await provider.search('dividend')).some(r => r.title === 'Review income'));
  F.session.apps.markets = false;
  assert.equal((await provider.search('dividend')).some(r => r.title === 'Review income'), false);
  F.session.view.apps.mail = false;
  assert.equal((await provider.search('compose mail')).some(r => r.title === 'Compose Mail'), false);
  commands.destroy();
});

test('Files command search reads local metadata and opens an opaque app-owned reference', async () => {
  const asked = [];
  const { provider, calls, commands } = await fixture({ files: q => { asked.push(q); return [{ id: 'mail:attachment:one', app: 'mail', name: 'Invoice <2026>.pdf', mime: 'application/pdf', source: 'Invoice', intent: 'open-file', objectId: 'opaque-attachment-1' }]; } });
  const result = await provider.search('find attachment invoice');
  assert.deepEqual(asked, ['invoice']);
  const file = result.find(r => r.title === 'Invoice <2026>.pdf');
  assert.ok(file && typeof file.run === 'function');
  assert.equal('href' in file, false, 'filenames, query and attachment refs do not enter a URL or Recent');
  await file.run();
  assert.deepEqual(calls, [['intent', 'mail', 'open-file', 'opaque-attachment-1']]);
  commands.destroy();
});

test('the real Files search factory integrates with commands without rebuilding links or fetching while typing', async () => {
  const { createWorkspaceFiles } = await import('../today/public/roof/workspace-files.js');
  let library;
  const { F, provider, calls, commands } = await fixture({ files: q => library.search(q) });
  let loads = 0;
  library = createWorkspaceFiles(F, {
    sources: () => [{ app: 'mail', name: 'Mail', status: 'ready', files: [{ id: 'mail:invoice:one', app: 'mail', name: 'Invoice.pdf', mime: 'application/pdf', objectId: 'invoice-attachment', intent: 'open-file', source: 'Invoice' }] }],
    load: () => { loads++; return { status: 'ready', files: [] }; },
    runIntent: (...args) => calls.push(['intent', ...args]), openApp() {},
  });
  const found = await provider.search('invoice');
  assert.ok(found.some(r => r.title === 'Find “invoice” in Files'));
  const invoice = found.find(r => r.title === 'Invoice.pdf');
  assert.ok(invoice && !invoice.href);
  assert.equal(loads, 0, 'global search uses the existing local index only');
  await invoice.run();
  assert.deepEqual(calls[0].slice(0, 4), ['intent', 'mail', 'open-file', 'invoice-attachment']);
  F.session.apps.fitness = false;
  assert.ok((await provider.search('invoice')).some(r => r.title === 'Find “invoice” in Files'), 'the generic Files offer does not require the app used by its display glyph');
  F.session.apps.mail = false;
  assert.equal((await provider.search('invoice')).some(r => r.title === 'Invoice.pdf'), false, 'actual file entries remain gated by their owning app');
  library.destroy(); commands.destroy();
});

test('file lookups and already-rendered command callbacks cannot cross an account lifetime', async () => {
  let done;
  const waiting = new Promise(r => { done = r; });
  const { provider, controller, calls } = await fixture({ files: () => waiting });
  const search = provider.search('invoice');
  controller.abort();
  done([{ id: 'one', app: 'mail', name: 'Invoice.pdf', intent: 'open-file' }]);
  assert.deepEqual(await search, []);
  assert.deepEqual(calls, [['off']]);
  const second = await fixture();
  const result = await second.provider.search('new chat');
  second.F.session.view.user.id = 'owner-b';
  await result.find(r => r.title === 'New chat').run();
  assert.deepEqual(second.calls, []);
  second.commands.destroy();
});

test('action rejection is handled and an old rejected action cannot toast in a replacement account', async () => {
  let fail;
  const pending = new Promise((_r, no) => { fail = no; });
  const { provider, F, calls, commands } = await fixture({ runIntent: () => pending });
  const result = await provider.search('new chat');
  const action = result.find(r => r.title === 'New chat').run();
  F.session.view.user.id = 'owner-b'; fail(new Error('No longer current'));
  assert.equal(await action, false);
  assert.deepEqual(calls, []);
  commands.destroy(); commands.destroy();
  assert.deepEqual(calls, [['off']]);
});

test('workspace command references are validated and titles stay plain data', async () => {
  const { provider, calls, commands } = await fixture({ workspaces: () => [{ id: 'work', name: 'Work <private>' }, { id: '//evil', name: 'Bad work' }] });
  const results = await provider.search('work');
  assert.ok(results.some(r => r.title === 'Open Work <private> workspace'));
  assert.equal(results.some(r => r.title.includes('Bad work')), false);
  await results.find(r => r.title === 'Open Work <private> workspace').run();
  assert.deepEqual(calls, [['workspace', 'work']]);
  commands.destroy();
});

test('natural Open my ride and Open Markets commands use real workspace/app navigation', async () => {
  const { provider, calls, commands } = await fixture();
  const ride = await provider.search('Open my ride');
  await ride.find(r => r.title === 'Open Morning ride workspace').run();
  const markets = await provider.search('Open Markets');
  await markets.find(r => r.title === 'Open Markets').run();
  assert.deepEqual(calls, [['workspace', 'ride'], ['app', 'markets']]);
  commands.destroy();
});

test('notification targets accept exact curated app references and reject injected/auth/share paths', async () => {
  const { notificationTarget } = await api;
  for (const [app, url] of [['chat', '/chats/#open=friend_12'], ['mail', '/mail/#thread=t-9'], ['fitness', '/fitness/#today'], ['fitness', '/fitness/#day=2026-11-11'], ['markets', '/markets/#s=TSCO.L'], ['weather', '/weather/#days']]) assert.ok(notificationTarget({ app, url }, ORIGIN), url);
  for (const url of ['https://os.inflite.ai/chats/#open=a', '//evil.test/chats/#open=a', '/chats/?code=secret#open=a', '/chats/#share=payload', '/chats/in/', '/chats/#open=a%2Fb', '/chats/#open=a\\b', '/chats/#open=a\nb', '/chats/#open=' + 'a'.repeat(41), '/chats/#settings', '/chats/#unknown', '/chats/#chats=a&b', '/fitness/#day=2026-02-31', '/fitness/#unknown', '/fitness/#today=bad&arg', '/fitness/../fitness/#today']) {
    const app = url.startsWith('/fitness') ? 'fitness' : 'chats';
    assert.equal(notificationTarget({ app, url }, ORIGIN), null, url);
  }
  assert.equal(notificationTarget({ app: 'mail', url: '/chats/#open=abc' }, ORIGIN), null, 'app spoofing cannot select another owning provider');
  assert.equal(notificationTarget({ app: 'account', url: '/#you' }, ORIGIN), null);
});

test('notification Reply and Open workspace preserve the actual target and cannot run twice or after teardown', async () => {
  const { notificationActions } = await api, calls = [];
  let current = true;
  const options = { origin: ORIGIN, enabled: () => true, current: () => current, runIntent: (...args) => calls.push(['intent', ...args]), openWorkspace: (...args) => calls.push(['workspace', ...args]) };
  const actions = notificationActions({ app: 'chat', url: '/chats/#open=friend-8' }, options);
  assert.deepEqual(actions.map(a => a.id), ['reply', 'workspace']);
  actions[0].run(); actions[0].run();
  assert.deepEqual(calls, [['intent', 'chats', 'reply', 'friend-8']]);
  actions[1].run();
  assert.deepEqual(calls.at(-1), ['workspace', 'chats', '/chats/#open=friend-8']);
  const retired = notificationActions({ app: 'mail', url: '/mail/#thread=t_2' }, options);
  current = false;
  assert.equal(retired[0].run(), false);
  assert.equal(calls.length, 2);
  assert.deepEqual(notificationActions({ app: 'mail', url: '/mail/#thread=t_2' }, options), []);
});

test('only a supported current-day Fitness notification offers its real ride-time editor', async () => {
  const { notificationActions } = await api, calls = [];
  const options = { origin: ORIGIN, enabled: () => true, runIntent: (...args) => calls.push(args), openWorkspace() {} };
  const today = notificationActions({ app: 'fitness', url: '/fitness/#today' }, options);
  assert.deepEqual(today.map(a => a.id), ['schedule', 'workspace']); today[0].run();
  assert.deepEqual(calls, [['fitness', 'schedule']]);
  assert.deepEqual(notificationActions({ app: 'fitness', url: '/fitness/#day=2026-11-12' }, options).map(a => a.id), ['workspace']);
  assert.deepEqual(notificationActions({ app: 'mail', url: '/mail/#thread=t' }, { ...options, enabled: () => false }), []);
});
