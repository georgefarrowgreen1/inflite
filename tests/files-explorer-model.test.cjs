const { test } = require('node:test');
const assert = require('node:assert/strict');
const moduleAt = import('../today/public/roof/files-explorer.js');

test('Explorer locations accept only opaque Drive folders and known virtual app locations', async () => {
  const { filesLocation } = await moduleAt;
  const folderId = 'Ab_9-'.repeat(6) + 'xy';
  assert.equal(folderId.length, 32);
  assert.deepEqual(filesLocation(), { kind: 'drive', folderId: null, view: 'folder' });
  assert.deepEqual(filesLocation({ kind: 'drive', folderId }), { kind: 'drive', folderId, view: 'folder' });
  assert.deepEqual(filesLocation({ kind: 'drive', view: 'recent', folderId }), { kind: 'drive', folderId: null, view: 'recent' });
  for (const app of ['fitness', 'weather', 'markets', 'chats', 'mail']) assert.deepEqual(filesLocation({ kind: 'apps', app }), { kind: 'apps', app });
  assert.deepEqual(filesLocation({ kind: 'apps', app: 'fitness', category: 'routes' }), { kind: 'apps', app: 'fitness', category: 'routes' });
  assert.deepEqual(filesLocation({ kind: 'apps' }), { kind: 'apps', app: null });
});

test('Explorer location boundaries reject traversal, unsupported sources and private payloads', async () => {
  const { filesLocation } = await moduleAt;
  for (const value of [null, false, [], '/#files', { kind: 'constructor' }, { kind: 'apps', app: 'constructor' }, { kind: 'apps', app: 'mail', category: 'secrets' }, { kind: 'drive', view: 'all-accounts' }]) assert.equal(filesLocation(value), null, JSON.stringify(value));
  for (const folderId of ['../private', '//evil.test/x', 'a'.repeat(31), 'a'.repeat(33), 'a'.repeat(31) + '\n', 'a'.repeat(31) + '/', { id: 'a'.repeat(32) }]) assert.equal(filesLocation({ kind: 'drive', folderId }), null);
  const original = { kind: 'drive', folderId: 'a'.repeat(32), name: 'Private folder', query: 'Private search', ownerId: 'another-account', token: 'secret' };
  const normalized = filesLocation(original);
  assert.deepEqual(normalized, { kind: 'drive', folderId: 'a'.repeat(32), view: 'folder' });
  assert.notEqual(normalized, original);
});
