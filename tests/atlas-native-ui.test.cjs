const { test, before } = require('node:test');
const assert = require('node:assert/strict');
let mount;
before(async () => {
  ({ mount } = await import('../today/public/atlas/roof/module.js'));
});

// A small structural DOM runs the real mounted client without a browser process.
// Browser layout/focus-trap checks remain in atlas-ui-browser.test.cjs.
class Element extends EventTarget {
  constructor(tag = 'div', doc) {
    super(); this.tagName = tag.toUpperCase(); this.ownerDocument = doc; this.childNodes = []; this.parentNode = null;
    this.attrs = {}; this.dataset = {}; this.style = { setProperty() {}, removeProperty() {} };
    this._text = ''; this._value = ''; this.hidden = false; this.disabled = false; this.checked = false; this.scrollHeight = 100; this.scrollTop = 0; this.clientHeight = 100;
    if (tag === 'template') this.content = new Element('fragment', doc);
    this.classList = { contains: x => this.className.split(/\s+/).includes(x), add: (...xs) => { this.className = [...new Set([...this.className.split(/\s+/).filter(Boolean), ...xs])].join(' '); }, remove: (...xs) => { this.className = this.className.split(/\s+/).filter(x => !xs.includes(x)).join(' '); }, toggle: (x, on) => { const yes = on ?? !this.classList.contains(x); this.classList[yes ? 'add' : 'remove'](x); return yes; } };
  }
  get id() { return this.attrs.id || ''; } set id(v) { this.attrs.id = v; }
  get className() { return this.attrs.class || ''; } set className(v) { this.attrs.class = v; }
  get children() { return this.childNodes.filter(x => !x.tagName.startsWith('#')); }
  get firstChild() { return this.childNodes[0] || null; } get lastChild() { return this.childNodes.at(-1) || null; }
  get options() { return this.children.filter(x => x.tagName === 'OPTION'); }
  get value() { return this._value || (this.tagName === 'SELECT' ? (this.options.find(x => x.attrs.selected !== undefined) || this.options[0])?.value || '' : ''); }
  set value(v) { this._value = String(v); }
  get textContent() { return this._text + this.childNodes.map(x => x.textContent).join(''); }
  set textContent(v) { this.replaceChildren(); this._text = String(v); }
  get isConnected() { return this === this.ownerDocument.body || !!this.parentNode?.isConnected; }
  set innerHTML(value) { if (this.tagName !== 'TEMPLATE') throw Error('Unexpected executable HTML sink'); parse(value, this.content); }
  setAttribute(k, v) { this.attrs[k] = String(v); if (k.startsWith('data-')) this.dataset[k.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = String(v); if (k === 'value') this.value = v; if (k === 'hidden') this.hidden = true; if (k === 'checked') this.checked = true; }
  getAttribute(k) { return this.attrs[k] ?? null; } removeAttribute(k) { delete this.attrs[k]; }
  append(...nodes) { for (let n of nodes) { if (typeof n === 'string') n = Object.assign(new Element('#text', this.ownerDocument), { textContent: n }); if (n.tagName === 'FRAGMENT') { this.append(...n.childNodes); continue; } n.remove(); n.parentNode = this; this.childNodes.push(n); } }
  prepend(...nodes) { const rest = [...this.childNodes]; this.replaceChildren(...nodes, ...rest); }
  replaceChildren(...nodes) { for (const child of this.childNodes) child.parentNode = null; this.childNodes = []; this._text = ''; this.append(...nodes); }
  remove() { if (!this.parentNode) return; const p = this.parentNode; p.childNodes = p.childNodes.filter(x => x !== this); this.parentNode = null; }
  before(node) { const p = this.parentNode, at = p.childNodes.indexOf(this); node.remove(); node.parentNode = p; p.childNodes.splice(at, 0, node); }
  replaceWith(node) { this.before(node); this.remove(); }
  insertBefore(node, ref) { if (ref) ref.before(node); else this.append(node); }
  contains(node) { return this === node || this.childNodes.some(child => child.contains(node)); }
  matches(selector) {
    if (selector.includes(',')) return selector.split(',').some(s => this.matches(s.trim()));
    const chain = selector.trim().split(/\s+/), last = chain.pop();
    const tag = /^[a-z][a-z0-9-]*/i.exec(last)?.[0], id = /#([\w-]+)/.exec(last)?.[1];
    if (tag && tag.toUpperCase() !== this.tagName || id && id !== this.id) return false;
    for (const c of last.matchAll(/\.([\w-]+)/g)) if (!this.classList.contains(c[1])) return false;
    for (const a of last.matchAll(/\[([\w-]+)(?:=["']?([^\]"']+)["']?)?\]/g)) if (!(a[1] in this.attrs) || a[2] != null && this.attrs[a[1]] !== a[2]) return false;
    if (last.includes(':checked') && !this.checked) return false;
    if (!chain.length) return true;
    let p = this.parentNode; while (p) { if (p.matches(chain.join(' '))) return true; p = p.parentNode; } return false;
  }
  querySelectorAll(selector) { return this.children.flatMap(child => [...(child.matches(selector) ? [child] : []), ...child.querySelectorAll(selector)]); }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  closest(selector) { return this.matches(selector) ? this : this.parentNode?.closest(selector) || null; }
  focus() { this.ownerDocument.activeElement = this; } scrollIntoView() {}
  cloneNode(deep) { const x = new Element(this.tagName.toLowerCase(), this.ownerDocument); for (const [k, v] of Object.entries(this.attrs)) x.setAttribute(k, v); x._text = this._text; x.value = this._value; if (deep) { x.append(...this.childNodes.map(n => n.cloneNode(true))); if (this.content) x.content.append(...this.content.childNodes.map(n => n.cloneNode(true))); } return x; }
}
function parse(html, target) {
  const stack = [target], voids = new Set(['INPUT', 'BR', 'HR', 'META', 'LINK', 'IMG']);
  for (const token of html.match(/<!--[\s\S]*?-->|<[^>]*>|[^<]+/g) || []) {
    if (token.startsWith('<!--')) continue;
    if (token.startsWith('</')) { stack.pop(); continue; }
    if (token.startsWith('<')) {
      const tag = /^<([\w-]+)/.exec(token)?.[1]; if (!tag) continue;
      const el = new Element(tag, target.ownerDocument);
      for (const a of token.slice(tag.length + 1, -1).matchAll(/([\w:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) el.setAttribute(a[1], a[2] ?? a[3] ?? a[4] ?? '');
      stack.at(-1).append(el); if (!voids.has(el.tagName) && !token.endsWith('/>')) stack.push(el.content || el);
    } else stack.at(-1).append(token);
  }
}
async function fixture(overrides = {}) {
  const previous = new Map(), doc = new EventTarget(); doc.visibilityState = 'visible'; doc.createElement = tag => new Element(tag, doc); doc.createComment = () => new Element('#comment', doc); doc.createTextNode = text => Object.assign(new Element('#text', doc), { textContent: text }); doc.body = doc.createElement('body'); doc.documentElement = doc.createElement('html'); doc.activeElement = doc.body;
  const root = doc.createElement('main'), sibling = doc.createElement('div'); sibling.id = 'other-app'; doc.body.append(root, sibling); doc.querySelectorAll = selector => doc.body.querySelectorAll(selector);
  const calls = [], sheets = [], toasts = [], controller = new AbortController(); let provider, instance, handoff = null;
  const location = new URL('https://inflite.ai/atlas/#conversations');
  const window = new EventTarget(); window.visualViewport = null;
  const globals = { document: doc, window, location, history: { replaceState() {} }, matchMedia: () => Object.assign(new EventTarget(), { matches: false }), requestAnimationFrame: fn => setTimeout(fn, 0), cancelAnimationFrame: clearTimeout };
  const data = { owner: 'owner-a', context: [], conversations: [], settings: { memory: 'Stored context', timezone: 'UTC' }, ...overrides };
  globals.fetch = async (url, options = {}) => {
    const path = String(url).replace('/atlas/api/', ''), body = options.body && JSON.parse(options.body), method = options.method || 'GET'; calls.push({ path, method, body, signal: options.signal });
    if (options.signal?.aborted) throw new DOMException('Stopped', 'AbortError');
    if (data.handle) { const answer = await data.handle({ path, method, body, options }); if (answer) return answer; }
    const reply = value => new Response(JSON.stringify(value), { headers: { 'X-Atlas-Owner': data.owner, 'Content-Type': 'application/json' } });
    if (path === 'health') return reply({ owner: data.owner, storage: { ready: true }, provider: { keySaved: false }, github: {}, coding: { ready: false, storageReady: true }, environments: { ready: true }, workspaceContext: { ready: data.contextReady !== false } });
    if (path === 'session') return reply({ owner: data.owner, available: true, signedIn: true });
    if (path === 'settings') { if (method === 'PATCH') Object.assign(data.settings, body); return reply(data.settings); }
    if (path === 'repositories') return reply({ repositories: [] });
    if (path === 'environments') return reply({ environments: [], ready: true });
    if (path.startsWith('conversations?')) return reply({ conversations: data.conversations });
    if (path === 'conversations' && method === 'POST') { const conversation = { id: 'conversation-new', ...body }; data.conversations.push(conversation); return reply({ conversation }); }
    if (path.endsWith('/workspace-context')) { if (method === 'POST') data.context = [{ kind: 'mail', app: 'mail', threadId: body.source.threadId, messageId: 'message-a', title: 'Selected email', selection: 'thread' }]; if (method === 'DELETE') data.context = []; return reply({ context: data.context }); }
    if (path.startsWith('conversations/')) return reply({ conversation: data.conversations.find(x => x.id === path.split('/')[1]), messages: [], hasMore: false });
    if (path === 'provider') return reply({ keySaved: true });
    if (path === 'models') return reply({ models: [], selected: 'fixture-model' });
    return reply({});
  };
  for (const [key, value] of Object.entries(globals)) { previous.set(key, Object.getOwnPropertyDescriptor(global, key)); Object.defineProperty(global, key, { configurable: true, writable: true, value }); }
  function openSheet(spec) {
    const el = doc.createElement('dialog'), head = doc.createElement('header'), h2 = doc.createElement('h2'), body = doc.createElement('div'); head.className = 'ifs-head'; h2.textContent = spec.title; head.append(h2); body.className = 'ifs-body'; el.append(head, body); doc.body.append(el);
    if (spec.body) body.append(spec.body);
    const handle = { el, body, closed: false, close() { this.now(); }, now() { if (this.closed) return; this.closed = true; spec.onClose?.(); el.remove(); }, setBusy() {} };
    sheets.push({ spec, handle }); return handle;
  }
  const fw = { signal: controller.signal, visible: () => true, fill() {}, header: { set() {} }, toast: text => { toasts.push(text); return { close() {} }; }, sheet: { open: openSheet },
    confirmIdentity: async options => { calls.push({ confirmation: options }); return true; },
    nav: { href: (key, arg) => '/atlas/#' + key + (arg ? '=' + arg : ''), go: path => { calls.push({ navigation: path }); }, section: key => calls.push({ section: key }) },
    workspace: { provide: value => { provider = value; return () => { provider = null; }; }, changed() {}, active: () => true, handoffs: { take() { const result = handoff; handoff = null; return result; }, send: async (...args) => { calls.push({ handoff: args }); return { ok: true }; } } },
  };
  const workspace = fw.workspace; if (overrides.deferWorkspace) delete fw.workspace;
  instance = mount(root, fw); await instance.ready;
  return { root, sibling, document: doc, window, instance, fw, workspace, calls, data, sheets, toasts, controller, get provider() { return provider; }, setHandoff(value) { handoff = value; }, $(id) { return doc.body.querySelector('#' + id); }, close() { instance.unmount(); for (const [key, descriptor] of previous) { if (descriptor) Object.defineProperty(global, key, descriptor); else delete global[key]; } } };
}
async function until(check) { for (let i = 0; i < 50; i++) { if (check()) return; await new Promise(resolve => setTimeout(resolve, 1)); } assert.ok(check()); }

test('native mount retains the shared shell, publishes metadata and tears down only its own lifetime', async () => {
  const t = await fixture();
  try {
    assert.equal(t.root.classList.contains('atlas-native'), true);
    assert.equal(t.root.querySelector('.atlas-sky'), null);
    assert.equal(t.root.querySelector('.atlas-header').hidden, true);
    assert.equal(t.provider.snapshot().status, 'ready');
    t.$('prompt').value = 'An unfinished goal'; t.$('prompt').dispatchEvent(new Event('input'));
    assert.equal(t.instance.busy(), true);
    t.instance.hide(); await t.instance.show({ key: 'conversations' });
    assert.equal(t.$('prompt').value, 'An unfinished goal');
    assert.equal((await t.instance.flush()).lost, 1);
    const before = t.calls.length; t.controller.abort(); t.window.dispatchEvent(new Event('focus'));
    await Promise.resolve(); assert.equal(t.calls.length, before);
    assert.equal(t.root.children.length, 0); assert.equal(t.provider, null); assert.ok(t.sibling.isConnected);
  } finally { t.close(); }
});

test('native sheets restore their original live form nodes without losing unsaved values', async () => {
  const t = await fixture();
  try {
    await t.instance.show({ key: 'settings' });
    const field = t.$('memory-text'); field.value = 'Unsaved preference'; t.$('preferences-form').dispatchEvent(new Event('input'));
    assert.equal(t.sheets.at(-1).handle.el.contains(field), true);
    assert.equal(t.sheets.at(-1).handle.el.classList.contains('atlas-app'), false, 'the shared dialog keeps its native surface and geometry');
    assert.equal(field.closest('.atlas-native-content').classList.contains('atlas-app'), true);
    t.sheets.at(-1).handle.now();
    assert.equal(t.root.contains(field), true);
    await t.instance.show({ key: 'settings' });
    assert.equal(t.$('memory-text'), field); assert.equal(field.value, 'Unsaved preference');
    assert.equal(t.sheets.at(-1).handle.el.getAttribute('aria-labelledby'), 'settings-title');
  } finally { t.close(); }
});

test('Mail handoff uses only a source reference and does not invalidate its route during delivery', async () => {
  const t = await fixture();
  try {
    t.setHandoff({ kind: 'mail-context', threadId: 'thread-a', subject: 'Selected email' });
    const result = await t.provider.run('handoff', 'token', { current: () => !t.calls.some(call => call.navigation), signal: new AbortController().signal });
    assert.deepEqual(result, { ok: true });
    const post = t.calls.find(call => call.path.endsWith('/workspace-context') && call.method === 'POST');
    assert.deepEqual(post.body, { source: { app: 'mail', kind: 'thread', threadId: 'thread-a' } });
    assert.match(t.$('attached-context').textContent, /Selected email/);
    assert.equal(t.calls.some(call => call.navigation), false);
    await until(() => t.calls.some(call => call.navigation));
    assert.equal(t.calls.at(-1).navigation, '/atlas/#conversations=conversation-new');
  } finally { t.close(); }
});

test('a cancelled handoff cannot attach context after its conversation request resolves', async () => {
  let finish;
  const t = await fixture({ handle: async ({ path, body }) => path === 'conversations' ? new Promise(resolve => { finish = () => resolve(new Response(JSON.stringify({ conversation: { id: 'late', ...body } }), { headers: { 'X-Atlas-Owner': 'owner-a' } })); }) : null });
  try {
    const controller = new AbortController(); t.setHandoff({ kind: 'mail-context', threadId: 'thread-a', subject: 'Selected email' });
    const pending = t.provider.run('handoff', 'token', { current: () => !controller.signal.aborted, signal: controller.signal });
    await until(() => finish); controller.abort(); finish();
    assert.deepEqual(await pending, { ok: false });
    assert.equal(t.calls.some(call => call.path?.endsWith('/workspace-context')), false);
    assert.equal(t.calls.some(call => call.navigation), false);
  } finally { t.close(); }
});

test('account transport errors preserve drafts while authoritative owner changes clear them', async () => {
  const t = await fixture();
  try {
    t.$('prompt').value = 'Keep this draft'; t.$('prompt').dispatchEvent(new Event('input'));
    t.data.handle = async ({ path }) => path === 'session' ? new Response(JSON.stringify({ code: 'account_unavailable', error: 'Account temporarily unavailable.' }), { status: 503 }) : null;
    t.window.dispatchEvent(new Event('focus')); await until(() => t.root.classList.contains('session-degraded'));
    assert.equal(t.$('prompt').value, 'Keep this draft'); assert.equal(t.root.classList.contains('session-check'), false);
    t.data.handle = null; t.data.owner = 'owner-b'; t.window.dispatchEvent(new Event('focus'));
    await until(() => t.$('prompt').value === ''); assert.equal(t.instance.busy(), false);
  } finally { t.close(); }
});

test('explicit identity rejection confirms in place and retries the refused write exactly once', async () => {
  let writes = 0;
  const t = await fixture({ handle: async ({ path }) => path === 'provider' && ++writes === 1 ? new Response(JSON.stringify({ code: 'identity_confirmation_required', error: 'Confirm identity.' }), { status: 403, headers: { 'X-Atlas-Owner': 'owner-a' } }) : null });
  try {
    await t.instance.show({ key: 'settings' });
    t.$('provider-key').value = 'fixture-not-a-real-key'; t.$('provider-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await until(() => writes === 2 && /Key saved/.test(t.$('provider-feedback').textContent));
    assert.equal(t.calls.filter(call => call.confirmation).length, 1);
    assert.equal(t.calls.find(call => call.confirmation).confirmation.expectedOwner, 'owner-a');
    assert.equal(t.$('provider-key').value, '');
    assert.equal(t.calls.some(call => call.navigation), false);
  } finally { t.close(); }
});

test('main InFlite Settings can open Atlas settings through its trusted sheet host', async () => {
  const t = await fixture();
  try {
    t.instance.hide(); let opened = false;
    const host = { ...t.fw, sheet: { open(spec) { opened = true; return t.fw.sheet.open(spec); } } };
    await t.instance.settingsPanel(host, () => true);
    assert.equal(opened, true); assert.equal(t.sheets.at(-1).handle.el.id, 'settings-dialog');
    t.sheets.at(-1).handle.now(); opened = false;
    await t.instance.settingsPanel(host, () => false); assert.equal(opened, false);
  } finally { t.close(); }
});

test('a cold native mount adopts the workspace capability once after the shell becomes ready', async () => {
  const t = await fixture({ deferWorkspace: true });
  try {
    assert.equal(t.provider, undefined);
    t.fw.workspace = t.workspace; t.instance.workspace();
    const first = t.provider; assert.ok(first); assert.equal(first.snapshot().status, 'ready');
    t.instance.workspace(); assert.equal(t.provider, first);
    t.instance.unmount(); t.instance.workspace(); assert.equal(t.provider, null);
  } finally { t.close(); }
});

test('schema-eight workspaces expose the connected-context upgrade while retaining conversations', async () => {
  const t = await fixture({ contextReady: false });
  try {
    assert.equal(t.$('setup-banner').hidden, false);
    assert.equal(t.$('upgrade-storage').textContent, 'Enable connected context');
    assert.match(t.$('setup-message').textContent, /Existing conversations remain available/);
    assert.equal(t.provider.snapshot().status, 'ready');
  } finally { t.close(); }
});
