// Run the real Frame constructor with inert DOM/chrome adapters. Module loading
// is a cooperative fixture; no system-task lifecycle or reload logic is stubbed.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { getEventListeners } = require('node:events');
const vm = require('node:vm');
const source = readFileSync(resolve(__dirname, '../today/public/roof/frame.js'), 'utf8')
  .replace(/^import .*;\n/gm, '').replace(/^export \{.*;\n/gm, '').replace(/^export (?=(?:const|function) )/gm, '')
  .replaceAll('import("./modules.js")', 'loadModules()');
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const drain = async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); };

function element() {
  const n = new EventTarget(), values = new Set();
  Object.assign(n, { nodeType: 1, dataset: {}, children: [], hidden: false, inert: false, isConnected: true,
    classList: { add: (...a) => a.forEach(x => values.add(x)), remove: (...a) => a.forEach(x => values.delete(x)), toggle(x, v) { if (v) values.add(x); else values.delete(x); }, contains: x => values.has(x) },
    append(...children) { for (const c of children) { c.parentNode = n; n.children.push(c); } },
    remove() { if (n.parentNode) n.parentNode.children = n.parentNode.children.filter(c => c !== n); n.parentNode = null; },
    setAttribute() {}, removeAttribute() {}, querySelector: () => null, querySelectorAll: () => [], contains: x => x === n || n.children.includes(x),
  });
  Object.defineProperty(n, 'firstChild', { get: () => n.children[0] || null });
  return n;
}
function host() {
  const account = { id: 'owner-a' }, location = new URL('https://os.test/'), timers = new Map();
  const doc = new EventTarget(), globalEvents = new EventTarget(); let nextTimer = 0, now = 1000, reloads = 0;
  doc.documentElement = element(); doc.visibilityState = 'visible'; doc.activeElement = null;
  doc.getElementById = () => null; doc.querySelector = () => null;
  location.reload = () => ++reloads; location.assign = () => {};
  const history = { state: null, replaceState(state, _, url) { this.state = state; location.href = new URL(url, location).href; }, pushState(state, _, url) { this.replaceState(state, _, url); }, back() {} };
  const moduleInstance = { busy: () => false, flush: () => ({ lost: 2 }), unmount() {} };
  const sandbox = { AbortController, DOMException, URL, EventTarget, Event, console, history, location, document: doc,
    navigator: { onLine: true, serviceWorker: new EventTarget() }, sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    Date: class extends Date { static now() { return now; } },
    addEventListener: globalEvents.addEventListener.bind(globalEvents), removeEventListener: globalEvents.removeEventListener.bind(globalEvents),
    setTimeout(fn, ms) { const id = ++nextTimer; timers.set(id, { fn, ms }); return id; }, clearTimeout: id => timers.delete(id),
    setInterval(fn, ms) { const id = ++nextTimer; timers.set(id, { fn, ms }); return id; }, clearInterval: id => timers.delete(id),
    requestIdleCallback() {}, requestAnimationFrame() {}, scrollY: 0, scrollTo() {},
    matchMedia: () => Object.assign(new EventTarget(), { matches: true }),
    REGISTRY: { weather: { name: 'Weather', path: '/weather/', sections: [['now', 'Now']] } },
    parse: path => ({ kind: 'tab', tab: /#apps/.test(String(path)) ? 'apps' : 'today', arg: null }),
    format: r => r?.kind === 'app' ? '/weather/#now' : '/#' + (r?.tab || ''), owns: () => false, ownPath: () => false,
    createHeader: () => ({ set() {}, destroy() {} }), createTabs: () => ({ set() {}, away() {}, badge() {}, destroy() {} }),
    createSheets: () => ({ top: () => null, closeAll() {} }), createSearch: () => ({ provide: () => () => {} }), createSend: () => ({}), toast() {},
    ui: { el: () => element(), skeleton: () => element() },
    loadModules: async () => ({ loadModule: async () => ({ instance: moduleInstance, m: { BUILD: 'tasks' } }) }),
  };
  vm.runInNewContext(source + '\nglobalThis.create = createFrame;', sandbox, { filename: 'frame.js' });
  const frame = sandbox.create({ session: () => ({ view: { user: { id: account.id } }, hub: false }), views: element() });
  return { frame, account, doc, moduleInstance, timers, reloads: () => reloads,
    advance(ms) { now += ms; },
    runTimers(ms) { for (const [id, timer] of [...timers]) if (timer.ms <= ms && timers.delete(id)) timer.fn(); },
    visibility(state) { doc.visibilityState = state; doc.dispatchEvent(new Event('visibilitychange')); },
  };
}

test('system work survives screen navigation and contributes to the existing mounted-module flush', async () => {
  const h = host(); let busy = true, systemFlushes = 0, moduleFlushes = 0;
  h.moduleInstance.flush = () => { moduleFlushes++; return { lost: 2 }; };
  await h.frame.view('weather').load();
  const off = h.frame.systemTasks.register({ busy: () => busy, flush() { systemFlushes++; return { lost: 3 }; } });
  assert.equal(h.frame.busy(), true);
  h.frame.nav.go('/#apps'); assert.equal(h.frame.route.tab, 'apps'); assert.equal(h.frame.busy(), true);
  assert.equal((await h.frame.flush()).lost, 5);
  assert.equal(systemFlushes, 1); assert.equal(moduleFlushes, 1);
  busy = false; assert.equal(h.frame.busy(), true, 'uncertain system flush remains protected');
  off(); assert.equal(h.frame.busy(), false); h.frame.destroy();
});

test('automatic stale reload waits for account-owned transfers even across visible screen changes', () => {
  const h = host(); let busy = true;
  h.frame.systemTasks.register({ busy: () => busy }); h.frame.stale = true;
  h.frame.nav.go('/#apps'); h.visibility('hidden'); h.advance(61000); h.visibility('visible');
  assert.equal(h.reloads(), 0);
  busy = false; h.visibility('hidden'); h.advance(61000); h.visibility('visible');
  assert.equal(h.reloads(), 1); h.frame.destroy();
});

test('pending, rejected and timed-out flushes block reload until a successful bounded retry', async () => {
  const h = host(), wait = deferred(), received = []; let mode = 'reject';
  h.frame.systemTasks.register({ busy() { if (mode === 'busy-error') throw new Error('Unknown state'); return false; }, flush(options) { received.push(options.timeoutMs); if (mode === 'reject') return Promise.reject(new Error('Uncertain write')); if (mode === 'wait') return wait.promise; return { lost: 0 }; } });
  assert.equal((await h.frame.flush()).lost, 1); assert.equal(h.frame.busy(), true);
  mode = 'wait'; const pending = h.frame.flush({ timeoutMs: 30 }); await drain();
  assert.equal(h.frame.busy(), true); h.runTimers(30); assert.equal((await pending).lost, 1);
  wait.resolve({ lost: 0 }); await drain(); assert.equal(h.frame.busy(), true, 'late completion cannot clear a timed-out flush');
  mode = 'ok'; assert.equal((await h.frame.flush({ timeoutMs: 9000 })).lost, 0); assert.equal(received.at(-1), 2000); assert.equal(h.frame.busy(), false);
  mode = 'busy-error'; assert.equal(h.frame.busy(), true, 'busy failure is conservative'); h.frame.destroy();
});

test('account changes retire tasks, settle their pending flushes and remove every abort listener', async () => {
  const h = host(), signal = new AbortController(), wait = deferred(); let calls = 0;
  const off = h.frame.systemTasks.register({ busy: () => true, flush: () => { calls++; return wait.promise; } }, { signal: signal.signal });
  assert.equal(getEventListeners(signal.signal, 'abort').length, 1); assert.equal(getEventListeners(h.frame.signal, 'abort').length, 1);
  const pending = h.frame.flush(); await drain(); assert.equal(calls, 1);
  h.account.id = 'owner-b'; assert.equal(h.frame.busy(), false); assert.equal((await pending).lost, 0);
  assert.equal(getEventListeners(signal.signal, 'abort').length, 0); assert.equal(getEventListeners(h.frame.signal, 'abort').length, 0); assert.equal(h.timers.size, 0);
  wait.resolve({ lost: 99 }); await drain(); h.account.id = 'owner-a'; assert.equal(h.frame.busy(), false, 'an observed retired account cannot revive its task');
  off(); off(); h.frame.destroy();
});

test('explicit abort and frame disposal retire pending callbacks and reject late registrations', async () => {
  const h = host(), signal = new AbortController(), wait = deferred(); let calls = 0;
  h.frame.systemTasks.register({ busy: () => true }, { signal: signal.signal }); signal.abort(); assert.equal(h.frame.busy(), false);
  h.frame.systemTasks.register({ flush: () => { calls++; return wait.promise; } }); const pending = h.frame.flush(); await drain();
  assert.equal(h.frame.busy(), true); h.frame.destroy(); assert.equal((await pending).lost, 0); assert.equal(h.frame.busy(), false); assert.equal(h.timers.size, 0);
  wait.reject(new Error('Late failure')); await drain(); h.frame.systemTasks.register({ busy: () => { calls++; return true; } });
  assert.equal(h.frame.busy(), false); assert.equal(calls, 1); assert.equal(getEventListeners(h.frame.signal, 'abort').length, 0);
});

test('an older failed flush cannot replace the successful result of a newer flush', async () => {
  const h = host(), first = deferred(), second = deferred(); let n = 0;
  h.frame.systemTasks.register({ flush: () => ++n === 1 ? first.promise : second.promise });
  const old = h.frame.flush(), current = h.frame.flush(); await drain();
  second.resolve({ lost: 0 }); assert.equal((await current).lost, 0); assert.equal(h.frame.busy(), true, 'older work is still in progress');
  first.reject(new Error('Older failure')); assert.equal((await old).lost, 1); assert.equal(h.frame.busy(), false, 'the latest successful flush owns recovery');
  h.frame.destroy();
});

test('unsigned and malformed system tasks never acquire a registration', () => {
  const h = host(); let calls = 0;
  h.account.id = null; const off = h.frame.systemTasks.register({ busy() { calls++; return true; } }); off(); off();
  h.account.id = 'owner-a'; h.frame.systemTasks.register({ busy: 'yes', flush() { calls++; } }); h.frame.systemTasks.register({});
  h.frame.systemTasks.register({ busy() { calls++; return true; } }, { signal: {} });
  assert.equal(h.frame.busy(), false); assert.equal(calls, 0); assert.equal(getEventListeners(h.frame.signal, 'abort').length, 0); h.frame.destroy();
});
