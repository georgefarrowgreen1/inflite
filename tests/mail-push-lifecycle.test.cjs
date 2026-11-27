const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');

const source = readFileSync(require.resolve('../email/public/sw.js'), 'utf8');
const token = 'b4d7a2c1-1234-4123-a123-123456789abc';
const thread = 'private-thread';
const legacy = { title: 'Private sender', body: 'Private subject and snippet', badge: 3, url: `/#thread=${thread}`, tag: thread };
const origin = 'https://email.inflite.ai';

function serviceWorker(fetch) {
  const handlers = new Map(), calls = [], notes = [], badges = [], opened = [];
  let timeout, unsubscribed = 0;
  vm.runInNewContext(source, {
    AbortController, URL, URLSearchParams,
    setTimeout(fn) { timeout = fn; return 1; },
    clearTimeout() { timeout = null; },
    fetch(path, options) { calls.push(path); return fetch(path, options); },
    self: {
      addEventListener: (event, fn) => handlers.set(event, fn),
      location: { origin },
      navigator: { async setAppBadge(n) { badges.push(n); }, async clearAppBadge() { badges.push(0); } },
      registration: {
        async showNotification(title, options) { notes.push({ title, ...JSON.parse(JSON.stringify(options)) }); },
        pushManager: { async getSubscription() { return { async unsubscribe() { unsubscribed++; } }; } },
      },
      clients: { async matchAll() { return []; }, async openWindow(url) { opened.push(url); } },
    },
  });
  const fire = (type, event) => {
    let wait;
    handlers.get(type)({ ...event, waitUntil: promise => { wait = promise; } });
    return wait;
  };
  return {
    fire, calls, notes, badges, opened, get unsubscribed() { return unsubscribed; },
    push: payload => fire('push', { data: { json: () => payload } }),
    timeout: () => timeout(),
  };
}

function generic(h) {
  assert.equal(h.notes.length, 1);
  assert.deepEqual(h.notes[0], {
    title: 'Mail', body: 'Open Mail to see your notifications.', tag: 'mail', icon: '/icon-192.png', data: { url: '/' },
  });
  assert.deepEqual(h.badges, [0]);
  assert.equal(h.unsubscribed, 0);
}

for (const access of ['reauth', 'passkey', 'unrecognized', null]) {
  test(`Mail push with ${access ?? 'an unknown session'} hides queued message content and routing`, async () => {
    const h = serviceWorker(async () => access ? Response.json({ access }) : new Response(null, { status: 502 }));
    await h.push(legacy);
    generic(h);
    assert.deepEqual(h.calls, ['/api/session']);
    await h.fire('notificationclick', { notification: { ...h.notes[0], close() {} } });
    assert.deepEqual(h.opened, [`${origin}/`]);
  });
}

test('Mail push uses the opaque fallback on network failure, malformed payload, and verification timeout', async () => {
  const network = serviceWorker(async () => { throw new Error('offline'); });
  await network.push(legacy);
  generic(network);
  const malformed = serviceWorker(async () => Response.json({ access: 'ok' }));
  await malformed.fire('push', { data: { json() { throw new Error('malformed'); }, text: () => legacy.body } });
  generic(malformed);
  const slow = serviceWorker(() => new Promise(() => {}));
  const pending = slow.push(legacy);
  slow.timeout();
  await pending;
  generic(slow);
});

test('Mail verifies fresh access before resolving opaque push tokens and keeps conversation actions', async () => {
  const h = serviceWorker(async (path, options) => {
    assert.equal(options.cache, 'no-store');
    assert.equal(options.credentials, 'same-origin');
    if (path === '/api/session') return Response.json({ access: 'ok' });
    return Response.json({ title: legacy.title, body: legacy.body, thread, badge: legacy.badge });
  });
  await h.push({ notice: token });
  assert.deepEqual(h.calls, ['/api/session', `/api/push/notice/${token}`]);
  assert.equal(h.notes[0].title, legacy.title);
  assert.equal(h.notes[0].body, legacy.body);
  assert.equal(h.notes[0].tag, thread);
  assert.deepEqual(h.notes[0].data, { url: legacy.url, thread });
  assert.deepEqual(h.notes[0].actions.map(action => action.action), ['reply', 'done', 'later']);
  assert.deepEqual(h.badges, [3]);
  await h.fire('notificationclick', { action: 'reply', notification: { ...h.notes[0], close() {} } });
  assert.deepEqual(h.opened, [`${origin}${legacy.url}&reply=1`]);

  const revoked = serviceWorker(async path => path === '/api/session'
    ? Response.json({ access: 'ok' }) : new Response(null, { status: 401 }));
  await revoked.push({ notice: token });
  generic(revoked);
});

test('Mail only unsubscribes devices on a definite sign-out', async () => {
  const h = serviceWorker(async () => Response.json({ access: 'signin' }));
  await h.push(legacy);
  assert.equal(h.unsubscribed, 1);
  assert.deepEqual(h.badges, [0]);
  assert.deepEqual(h.notes[0].data, { url: '/' });
  assert.doesNotMatch(JSON.stringify(h.notes), /Private|private-thread/);
});

test('Mail only retires a previous endpoint after confirming its replacement', async () => {
  const subscription = endpoint => ({ endpoint, toJSON: () => ({ endpoint, keys: {} }) });
  const oldSubscription = subscription('https://example.test/old');
  const newSubscription = subscription('https://example.test/new');
  for (const [status, ok] of [[401, false], [200, false], [200, "true"], [200, true]]) {
    const h = serviceWorker(async () => Response.json({ ok }, { status }));
    await h.fire('pushsubscriptionchange', { oldSubscription, newSubscription });
    assert.deepEqual(h.calls, ok === true ? ['/api/push/subscribe', '/api/push/unsubscribe'] : ['/api/push/subscribe']);
  }
});
