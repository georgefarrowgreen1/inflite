// Mail's OS boundary uses the real store and reply builder. All transport and
// presentation is local: no message body, attachment bytes or send API exists.
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const { readFile } = require('node:fs/promises');
const { resolve } = require('node:path');
let createWorkspace, createStore, logic, FILE_LIMITS;
const moduleAt = async name => import('data:text/javascript;base64,' + (await readFile(resolve(__dirname, '../email/public/roof', name))).toString('base64'));
before(async () => {
  ({ createWorkspace, FILE_LIMITS } = await moduleAt('workspace.js'));
  ({ createStore } = await moduleAt('store.js'));
  logic = await moduleAt('logic.js');
});
const tick = () => new Promise(resolve => queueMicrotask(resolve));
const deferred = () => { let resolve; const promise = new Promise(ok => resolve = ok); return { promise, resolve }; };
const missing = () => Object.assign(new Error('deleted'), { status: 404 });
function fixture({ access = 'ok', api = {}, ready } = {}) {
  const store = createStore({ access, me: { addresses: [{ address: 'ann@example.test' }] } }), controller = new AbortController();
  const calls = [], opened = [], sheets = [], classes = new Set(), state = { current: true, active: true, changes: 0, removed: 0 };
  const root = { classList: { add: x => classes.add(x), remove: x => classes.delete(x) } };
  const sdk = { active: () => state.active, changed: () => state.changes++, provide: p => { state.provider = p; return () => state.removed++; } };
  const fw = { signal: controller.signal, workspace: sdk, session: { user: { id: 'ann' } },
    ui: { el: (tag, props, ...children) => ({ tag, ...props, children }) }, sheet: { open: spec => sheets.push(spec) } };
  const transport = {
    async search(q) { calls.push(['search', q]); return { threads: [{ id: 'thread-a' }] }; },
    async thread(id) { calls.push(['thread', id]); return { thread: { id }, messages: [{ id: 'msg-a', hasAttachments: true, folder: 'inbox' }] }; },
    async meta(id) { calls.push(['meta', id]); return { id, threadId: 'thread-a', folder: 'inbox', date: 1000, from: { name: 'Maya', email: 'maya@example.test' }, to: [{ email: 'ann@example.test' }], subject: 'Trip', messageId: '<a@example.test>', references: '<before@example.test>', attachments: [{ id: 'att-a', filename: 'Invoice.pdf', type: 'application/pdf', size: 2048 }] }; },
    fileUrl: id => `https://email.inflite.ai/api/attachments/${encodeURIComponent(id)}`,
    ...api,
  };
  const show = kind => async (...args) => {
    const current = typeof args.at(-1) === 'function' ? args.pop() : () => true;
    if (state.lazy) await state.lazy.promise;
    if (!current()) return null;
    opened.push({ kind, args }); return kind;
  };
  const ctx = { store, api: transport, logic, fw, open: { compose: show('compose'), viewer: show('viewer'), signin: show('signin') } };
  const workspace = createWorkspace(root, ctx, { current: () => state.current, ready: ready ? () => ready({ store, state }) : async () => {} });
  return { workspace, state, store, fw, controller, calls, opened, sheets, classes, ctx };
}

test('Mail Files enumerates authorised attachment metadata across threads, with local queries and no body/URL exposure', async () => {
  const t = fixture({ api: {
    async search(q) { t.calls.push(['search', q]); return { threads: [{ id: 'thread-a' }, { id: 'thread-b' }, { id: '../escape' }] }; },
    async thread(id) { t.calls.push(['thread', id]); return { id, messages: [{ id: id === 'thread-a' ? 'msg-a' : 'msg-b', folder: 'inbox', hasAttachments: true }] }; },
    async meta(id) { t.calls.push(['meta', id]); return { id, threadId: id === 'msg-a' ? 'thread-a' : 'thread-b', folder: 'inbox', body: '<secret>', snippet: 'secret', from: { email: 'private@example.test' }, attachments: [
      { id: 'att-' + id, filename: id === 'msg-a' ? 'Invoice.pdf' : '\u202eMap\n.png', type: id === 'msg-a' ? 'application/pdf' : 'image/png', size: 10, url: 'https://private.test/token' },
      { id: '../escape', filename: 'bad', type: 'application/pdf' },
    ] }; },
  } });
  const first = await t.workspace.files({ query: 'invoice' });
  assert.equal(first.status, 'ready'); assert.equal(first.files.length, 1);
  assert.deepEqual(t.calls.filter(c => c[0] === 'search'), [['search', { q: 'has:attachment', view: 'attachments' }]]);
  const next = await t.workspace.files({ query: 'map' });
  assert.equal(next.files[0].name, 'Map.png'); assert.equal(t.calls.filter(c => c[0] === 'search').length, 1);
  const rows = t.workspace.snapshot().files;
  assert.equal(rows.length, 2); assert.equal(rows[0].intent, 'open-file'); assert.equal(rows[0].objectId, rows[0].id);
  assert.doesNotMatch(JSON.stringify(rows), /secret|private|token|body|snippet|https:/);
  assert.deepEqual(Object.keys(rows[0]).sort(), ['app', 'downloadIntent', 'id', 'intent', 'kind', 'mime', 'name', 'objectId', 'shareIntent', 'size', 'source'].sort());
  t.workspace.destroy(); assert.equal(t.state.removed, 1); assert.equal(t.classes.has('ml-workspace'), false);
});

test('Mail Files uses bounded reads and reports additional results rather than pretending to index all mail', async () => {
  let threads = 0, metas = 0;
  const t = fixture({ api: {
    async search() { return { threads: Array.from({ length: 45 }, (_, i) => ({ id: `t-${i}` })), hasMore: true }; },
    async thread(id) { threads++; return { id, messages: Array.from({ length: 8 }, (_, i) => ({ id: `${id}-m-${i}`, folder: 'inbox', hasAttachments: true })) }; },
    async meta(id) { metas++; return { id, folder: 'inbox', attachments: [{ id: id + '-a', filename: id + '.pdf', type: 'application/pdf' }] }; },
  } });
  const result = await t.workspace.files();
  assert.equal(result.status, 'ready'); assert.equal(result.more, true);
  assert.ok(threads <= FILE_LIMITS.threads); assert.ok(metas <= FILE_LIMITS.messages);
  assert.ok(result.files.length <= FILE_LIMITS.files); assert.ok(result.files.length > 1);
});

test('Mail gate states have real sign-in/confirmation actions and never fetch or expose files', async () => {
  for (const [access, status, unlock] of [['signin', 'signin', true], ['reauth', 'locked', true], ['passkey', 'locked', true], ['notadmin', 'locked', false]]) {
    const t = fixture({ access });
    assert.equal((await t.workspace.files()).status, status); assert.equal(t.calls.length, 0);
    const snap = t.workspace.snapshot(); assert.equal(snap.status, status); assert.deepEqual(snap.files, []);
    assert.equal(snap.actions.some(a => a.id === 'signin'), unlock);
    assert.equal(snap.actions.find(a => a.id === 'compose').enabled, false);
    const reply = await t.workspace.run('reply', 'thread-a'); assert.equal(reply.ok, false); assert.equal(t.calls.length, 0);
    const sign = await t.workspace.run('signin'); assert.equal(sign.ok, unlock); assert.equal(t.opened.length, Number(unlock));
  }
});

test('Mail first boot can finish access without loading events cancelling its Files request', async () => {
  const t = fixture({ access: null, ready: async ({ store }) => {
    store.set({ list: { rows: [], loading: true } }); await tick(); store.set({ access: 'ok' }); await tick();
  } });
  const result = await t.workspace.files();
  assert.equal(result.status, 'ready'); assert.equal(result.files.length, 1);
});

test('Mail clears metadata immediately on lock and an older request cannot erase a new unlocked request', async () => {
  const old = deferred(), next = deferred(); let number = 0;
  const t = fixture({ api: { search: async () => ++number === 1 ? old.promise : next.promise } });
  const first = t.workspace.files(); await tick();
  t.store.set({ access: 'reauth' }); await tick();
  assert.deepEqual(t.workspace.snapshot().files, []); assert.equal((await t.workspace.files()).status, 'locked');
  t.store.set({ access: 'ok' }); await tick(); const second = t.workspace.files(); await tick();
  old.resolve({ threads: [{ id: 'old-thread' }] }); await first;
  next.resolve({ threads: [{ id: 'thread-a' }] }); const fresh = await second;
  assert.equal(fresh.files.length, 1); assert.equal(t.workspace.snapshot().files.length, 1);
  assert.equal(number, 2);
});

test('Mail deleted and mismatched metadata is skipped without making available files disappear', async () => {
  const t = fixture({ api: {
    async search() { return { threads: ['gone', 'wrong', 'thread-a'].map(id => ({ id })) }; },
    async thread(id) { if (id === 'gone') throw missing(); if (id === 'wrong') return { id: 'other', messages: [{ id: 'bad', hasAttachments: true }] }; return { id, messages: [{ id: 'gone-meta', hasAttachments: true }, { id: 'wrong-meta', hasAttachments: true }, { id: 'msg-a', hasAttachments: true }] }; },
    async meta(id) { if (id === 'gone-meta') throw missing(); return { id: id === 'wrong-meta' ? 'other-meta' : id, attachments: [{ id: 'att-a', filename: 'Available.pdf', type: 'application/pdf' }] }; },
  } });
  assert.deepEqual((await t.workspace.files()).files.map(f => f.name), ['Available.pdf']);
});

test('Mail reply opens the existing reply draft with recipients and quote headers, never sends', async () => {
  const t = fixture(); const result = await t.workspace.run('reply', 'thread-a');
  assert.equal(result.ok, true); assert.equal(result.pending, true);
  const draft = t.opened[0]; assert.equal(draft.kind, 'compose');
  assert.deepEqual(draft.args[0].to, [{ name: 'Maya', email: 'maya@example.test' }]);
  assert.equal(draft.args[0].subject, 'Re: Trip'); assert.deepEqual(draft.args[0].quote, { of: 'msg-a', mode: 'reply' });
  assert.equal(draft.args[0].inReplyTo, '<a@example.test>');
  assert.match(draft.args[0].references, /a@example.test/); assert.deepEqual(t.calls.map(c => c[0]), ['thread', 'meta']);
  t.store.set({ threadId: 'thread-a' }); assert.equal(t.workspace.snapshot().actions.find(a => a.id === 'reply').enabled, true);
});

test('Mail reply and file effects stop after a changed operation, account, active pane or Mail gate', async () => {
  for (const stage of ['thread', 'meta', 'lazy']) for (const change of ['lease', 'owner', 'active', 'access', 'abort']) {
    const gate = deferred(); let external = true;
    const t = fixture({ api: stage === 'thread' ? { thread: async () => gate.promise } : stage === 'meta' ? { meta: async () => gate.promise } : {} });
    if (stage === 'lazy') t.state.lazy = gate;
    const pending = t.workspace.run('reply', 'thread-a', { current: () => external });
    await tick(); await tick(); await tick();
    if (change === 'lease') external = false;
    if (change === 'owner') t.fw.session.user.id = 'bea';
    if (change === 'active') t.state.active = false;
    if (change === 'access') t.store.set({ access: 'reauth' });
    if (change === 'abort') t.controller.abort();
    gate.resolve(stage === 'thread' ? { id: 'thread-a', messages: [{ id: 'msg-a' }] } : { id: 'msg-a', from: { email: 'maya@example.test' }, subject: 'Late' });
    assert.equal((await pending).ok, false, `${stage}/${change}`); assert.deepEqual(t.opened, [], `${stage}/${change}`);
  }
  const gate = deferred(), t = fixture({ api: { meta: async () => gate.promise } });
  const pending = t.workspace.run('download-file', 'mail:file:msg-a:att-a'); await tick();
  t.store.set({ access: 'reauth' }); gate.resolve({ id: 'msg-a', attachments: [{ id: 'att-a', filename: 'Secret.pdf', type: 'application/pdf' }] });
  assert.equal((await pending).ok, false); assert.deepEqual(t.sheets, []);
});

test('Mail attachment open/download revalidates the opaque ref and uses its native authenticated origin', async () => {
  const t = fixture();
  assert.equal((await t.workspace.run('open-file', 'mail:file:msg-a:att-a')).ok, true);
  const open = t.sheets[0].body.children[2];
  assert.equal(open.tag, 'a'); assert.equal(open.target, '_blank'); assert.equal(open.rel, 'noopener');
  assert.equal(open.href, 'https://email.inflite.ai/api/attachments/att-a');
  assert.equal((await t.workspace.run('download-file', 'mail:file:msg-a:att-a')).ok, true);
  assert.equal(new URL(t.sheets[1].body.children[2].href).searchParams.has('download'), true);
  for (const ref of ['https://evil.test', 'mail:file:msg-a:other', 'mail:file:../bad:att-a']) assert.equal((await t.workspace.run('open-file', ref)).ok, false);
  assert.equal(t.sheets.length, 2); assert.equal(t.opened.length, 0);
  t.ctx.api.meta = async () => ({ id: 'msg-a', folder: 'trash', attachments: [{ id: 'att-a' }] });
  assert.equal((await t.workspace.run('download-file', 'mail:file:msg-a:att-a')).ok, false);
});

test('Mail raster preview and sharing use native viewer and editable attachment draft without arbitrary URLs', async () => {
  const t = fixture({ api: { meta: async id => ({ id, attachments: [{ id: 'att-a', filename: 'Photo.png', type: 'image/png', size: 12, url: 'https://evil.test/secret' }] }) } });
  assert.equal((await t.workspace.run('open-file', 'mail:file:msg-a:att-a')).ok, true);
  assert.equal(t.opened[0].kind, 'viewer'); assert.equal(t.opened[0].args[0][0].id, 'att-a'); assert.equal('url' in t.opened[0].args[0][0], false);
  assert.equal((await t.workspace.run('forward-file', 'mail:file:msg-a:att-a')).ok, true);
  assert.deepEqual(t.opened[1], { kind: 'compose', args: [{ subject: 'Photo.png', files: [{ ref: 'att-a', filename: 'Photo.png', type: 'image/png', size: 12 }] }] });
  assert.equal(t.sheets.length, 0);
});

test('Mail late Files results cannot publish after an account switch, request cancellation or destroy', async () => {
  for (const change of ['owner', 'request', 'destroy']) {
    const gate = deferred(), t = fixture({ api: { meta: async () => gate.promise } }); let asking = true;
    const pending = t.workspace.files({ current: () => asking }); await tick(); await tick(); await tick();
    if (change === 'owner') t.fw.session.user.id = 'bea';
    if (change === 'request') asking = false;
    if (change === 'destroy') t.workspace.destroy();
    gate.resolve({ id: 'msg-a', attachments: [{ id: 'att-a', filename: 'Late.pdf', type: 'application/pdf' }] });
    assert.deepEqual((await pending).files, [], change);
    if (change !== 'request') assert.deepEqual(t.workspace.snapshot().files, [], change);
    t.workspace.destroy(); t.controller.abort(); assert.equal(t.state.removed, 1, change);
  }
});
