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
    runIntent: (...args) => calls.push(['intent', ...args.slice(0, 3)]),
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

test('direct notification app navigation takes precedence over retired workspace navigation', async () => {
  const { notificationActions } = await api, calls = [];
  const actions = notificationActions({ app: 'chat', url: '/chats/#open=friend-8' }, {
    origin: ORIGIN, enabled: () => true,
    openApp: (...args) => calls.push(['app', ...args]),
    openWorkspace: () => assert.fail('A retired workspace must not open'),
  });
  assert.deepEqual(actions.map(a => a.id), ['app']);
  actions[0].run(); actions[0].run();
  assert.deepEqual(calls, [['app', 'chats', '/chats/#open=friend-8']]);
});

test('cold file commands require the real optional picker and only native supported imports are offered', async () => {
  let dialogs = false;
  const f = await fixture({ fileDialogsAvailable: () => dialogs });
  assert.equal((await f.provider.search('attach a file')).some(r => r.title === 'Attach a file in Mail'), false);
  dialogs = true;
  const attach = (await f.provider.search('attach a file')).find(r => r.title === 'Attach a file in Mail');
  assert.ok(attach); await attach.run();
  assert.deepEqual(f.calls, [['intent', 'mail', 'compose-attach', undefined]]);
  assert.ok((await f.provider.search('import route')).some(r => r.title === 'Import a route or activity'));
  assert.ok((await f.provider.search('import this route')).some(r => r.title === 'Import a route or activity'));
  assert.ok((await f.provider.search('attach this file')).some(r => r.title === 'Attach a file in Mail'));
  assert.equal((await f.provider.search('save export')).some(r => /Save/.test(r.title)), false, 'an unavailable route/workout cannot create a fake export');
  f.F.session.view.apps.mail = false;
  assert.equal((await f.provider.search('attach a file')).some(r => r.title === 'Attach a file in Mail'), false);
  f.commands.destroy();
});

test('native file exports use live provider capabilities and retire after state or entitlement changes', async () => {
  let actions = [{app:'fitness',id:'save-route-drive',label:'Save route to InFlite Files',objectId:'route-1'}];
  const f = await fixture({ fileDialogsAvailable: () => true, actions: () => actions });
  const first = (await f.provider.search('save export')).find(r => r.title === 'Save route to InFlite Files');
  assert.ok(first); actions = [{...actions[0],objectId:'route-2'}];
  await first.run(); assert.deepEqual(f.calls, [], 'an old export cannot switch to a newly selected route');
  const next = (await f.provider.search('save export')).find(r => r.title === 'Save route to InFlite Files');
  actions=[]; await next.run(); assert.deepEqual(f.calls, [], 'removed provider action cannot fall back to a built-in command');
  f.commands.destroy();
});

test('typed system search discovers real capabilities without dispatching callbacks or executing arbitrary text', async () => {
  const calls=[];
  const f=await fixture({systemActions:()=>[
    {id:'open-activity',current:()=>true,run:()=>calls.push('activity')},
    {id:'sync-workspaces',current:()=>true,run:()=>calls.push('sync')},
    {id:'resolve-workspace-sync',current:()=>true,run:()=>calls.push('resolve')},
    {id:'open-recovery',current:()=>true,run:()=>calls.push('status')},
    {id:'retry-mail',app:'mail',current:()=>true,run:()=>calls.push('retry')},
    {id:'send-everything',label:'Send all files',current:()=>true,run:()=>calls.push('BAD')},
    {id:'retry-weather',app:'mail',current:()=>true,run:()=>calls.push('BAD')},
  ]});
  for(const query of ['activity','sync my workspaces','resolve workspace conflict','connection status','retry mail']) assert.ok((await f.provider.search(query)).length,query);
  assert.equal((await f.provider.search('send everything')).some(r=>r.title==='Send all files'),false);
  assert.deepEqual(calls,[]);
  await (await f.provider.search('activity')).find(r=>r.title==='Activity').run();
  assert.deepEqual(calls,['activity']); assert.deepEqual(f.calls,[]);
  f.commands.destroy();
});

test('system controls re-read policy, revision and owning app before every invocation', async () => {
  let revision=1,enabled=true,current=true,present=true;
  const calls=[];
  const f=await fixture({systemActions:()=>present?[{id:'retry-mail',app:'mail',revision,enabled,current:()=>current,run:()=>calls.push('retry')}]:[]});
  const retry=async()=> (await f.provider.search('retry mail')).find(r=>r.title==='Retry Mail');
  const old=await retry(); revision=2; await old.run(); assert.deepEqual(calls,[]);
  const disabled=await retry(); enabled=false; await disabled.run(); assert.deepEqual(calls,[]);
  enabled=true; const locked=await retry(); current=false; await locked.run(); assert.deepEqual(calls,[]);
  current=true; const removed=await retry(); present=false; await removed.run(); assert.deepEqual(calls,[]);
  present=true; const revoked=await retry(); f.F.session.view.apps.mail=false; await revoked.run(); assert.deepEqual(calls,[]);
  f.commands.destroy();
});

test('pending command leases are single-flight, cancelled on teardown and cannot complete in a new account', async () => {
  let release,lease;const waiting=new Promise(r=>release=r),effects=[];
  const f=await fixture({systemActions:()=>[{id:'sync-workspaces',current:()=>true,async run(scope){lease=scope;await waiting;if(scope.current())effects.push('saved');}}]});
  const command=(await f.provider.search('sync workspaces')).find(r=>r.title==='Sync workspaces');
  const running=command.run();assert.equal(lease.current(),true);assert.equal(await command.run(),false,'repeated Enter cannot duplicate a pending sync');
  f.F.session.view.user.id='owner-b';f.controller.abort();assert.equal(lease.signal.aborted,true);assert.equal(lease.current(),false);
  release();await running;assert.deepEqual(effects,[]);assert.deepEqual(f.calls,[['off']]);
});

test('native bootstrap receives a current lease that retires when its action disappears', async () => {
  let release,lease;const waiting=new Promise(r=>release=r),effects=[];
  let actions=[{app:'fitness',id:'save-workout-drive',label:'Save workout',objectId:'ride'}];
  const f=await fixture({fileDialogsAvailable:()=>true,actions:()=>actions,async runIntent(app,id,ref,scope){lease=scope;await waiting;if(scope.current())effects.push([app,id,ref]);}});
  const command=(await f.provider.search('save export')).find(r=>r.title==='Save workout');const running=command.run();
  assert.equal(lease.current(),true);actions=[];assert.equal(lease.current(),false);release();await running;
  assert.deepEqual(effects,[]);f.commands.destroy();
});

test('cancelled typed actions are quiet while a current failure is reported once and retry remains explicit', async () => {
  let cancel=true;
  const f=await fixture({systemActions:()=>[{id:'sync-workspaces',current:()=>true,run(){throw cancel?new DOMException('Cancelled','AbortError'):new Error('Offline');}}]});
  const command=(await f.provider.search('sync workspaces')).find(r=>r.title==='Sync workspaces');
  assert.equal(await command.run(),false);assert.deepEqual(f.calls,[]);
  cancel=false;assert.equal(await command.run(),false);assert.deepEqual(f.calls,[['toast','That action couldn’t open. Try again.']]);
  f.commands.destroy();
});

test('selection availability can turn off while the command keeps its durable owned task lease',async()=>{
 let pending=false,release,systemLease,nativeLease;
 const waiting=new Promise(r=>release=r),effects=[];
 const f=await fixture({fileDialogsAvailable:()=>true,actions:()=>[{app:'fitness',id:'save-route-drive',label:'Save route',objectId:'route',enabled:!pending}],
  systemActions:()=>pending?[]:[{id:'sync-workspaces',enabled:true,current:()=>true,async run(scope){systemLease=scope;pending=true;await waiting;if(scope.current())effects.push('sync');}}],
  async runIntent(_app,_id,_ref,scope){nativeLease=scope;pending=true;await waiting;if(scope.current())effects.push('route');}});
 const sync=(await f.provider.search('sync workspaces')).find(r=>r.title==='Sync workspaces');const systemRun=sync.run();
 assert.equal(systemLease.current(),true,'own pending state does not cancel synchronization');pending=false;
 const save=(await f.provider.search('save export')).find(r=>r.title==='Save route');const nativeRun=save.run();
 assert.equal(nativeLease.current(),true,'temporary disabled provider controls do not revoke the selected export');release();await Promise.all([systemRun,nativeRun]);
 assert.deepEqual(effects,['sync','route']);f.commands.destroy();
});


test('system identifiers cannot inherit object-prototype names and invalid native targets cannot fall back to another resource',async()=>{
 const f=await fixture({systemActions:()=>['constructor','toString','__proto__'].map(id=>({id,label:'Forged '+id,current:()=>true,run(){assert.fail('prototype command');}})),actions:()=>[{app:'mail',id:'reply',label:'Reply forged',objectId:'x'.repeat(201)},{app:'fitness',id:'schedule',label:'Schedule malformed',objectId:{id:'different'}}]});
 for(const word of ['constructor','toString','__proto__'])assert.equal((await f.provider.search(word)).some(r=>r.title.startsWith('Forged')),false);
 assert.equal((await f.provider.search('forged')).some(r=>r.title==='Reply forged'),false);assert.equal((await f.provider.search('malformed')).some(r=>r.title==='Schedule malformed'),false);
 f.commands.destroy();
});
