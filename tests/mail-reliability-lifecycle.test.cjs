const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');

const origin = 'https://email.inflite.ai';
const sql = new DatabaseSync(':memory:');
const objects = new Map();
const background = [];
const ctx = { waitUntil: promise => background.push(promise) };
let worker, view;

function statement(text, args = []) {
  return {
    bind: (...values) => statement(text, values),
    first: async () => sql.prepare(text).get(...args) || null,
    all: async () => ({ results: sql.prepare(text).all(...args) }),
    run: async () => ({ meta: { changes: sql.prepare(text).run(...args).changes } }),
  };
}

const env = {
  DOMAIN: 'inflite.ai', DEFAULT_FROM: 'hello@inflite.ai', ACCOUNT_ORIGIN: 'https://account.inflite.ai',
  APPS: { fetch: async () => Response.json(view) },
  DB: {
    prepare: statement,
    async batch(statements) {
      sql.exec('BEGIN');
      try {
        for (const query of statements) await query.run();
        sql.exec('COMMIT');
      } catch (error) {
        sql.exec('ROLLBACK');
        throw error;
      }
    },
  },
  MAIL: {
    put: async (key, value) => objects.set(key, value),
    get: async key => objects.has(key) ? new Response(objects.get(key)) : null,
    delete: async keys => [].concat(keys).forEach(key => objects.delete(key)),
  },
  EMAIL: { send: () => assert.fail('unexpected provider call') },
};

before(async () => {
  view = { signedIn: true, admin: true, passkey: true, fresh: true, id: 'test-owner' };
  worker = (await import('../email/src/index.js')).default;
  await (await import('../email/src/db.js')).ensureSchema(env);
});
after(async () => {
  while (background.length) await background.shift();
  sql.close();
});

function request(path, data) {
  return worker.fetch(new Request(origin + '/api/' + path, {
    method: data === undefined ? 'GET' : 'POST',
    headers: { Origin: origin, Cookie: 'account=abcdefghijklmnopqrstuvwxyz', 'X-Inflite': '1', 'Sec-Fetch-Site': 'same-origin' },
    body: data === undefined ? undefined : JSON.stringify(data),
  }), env, ctx);
}

const fields = { to: [{ email: 'recipient@example.test' }], subject: 'Local fixture', text: 'Draft content' };
const files = count => Array.from({ length: count }, (_, i) => ({ filename: `file-${i}.txt`, content: 'YWJj', size: 3 }));

test('Mail saves at most 20 attachments without truncating a rejected draft or sending a legacy over-limit draft', async () => {
  const initial = await request('drafts', { ...fields, attachments: files(20) });
  assert.equal(initial.status, 200);
  const { id, revision } = await initial.json();
  const key = `draft/${id}/${revision}.json`;
  const saved = objects.get(key);
  assert.equal(JSON.parse(saved).compose.attachments.length, 20);

  const rejected = await request('drafts', { id, ...fields, draftRevision: revision, text: 'replacement', attachments: files(21) });
  assert.equal(rejected.status, 413);
  assert.match((await rejected.json()).error, /20 files/);
  assert.equal(objects.get(key), saved);
  assert.equal(sql.prepare('SELECT snippet FROM messages WHERE id = ?').get(id).snippet, fields.text);
  assert.equal((await request('send', { ...fields, draftId: 'oversized-direct-draft', key: 'too-many-files', attachments: files(21) })).status, 413);

  const legacy = JSON.parse(saved);
  legacy.compose.attachments.push(files(21).at(-1));
  objects.set(key, JSON.stringify(legacy));
  assert.equal((await request('send', { draftId: id, draftRevision: revision, key: 'legacy-draft-files' })).status, 413);
  assert.equal(JSON.parse(objects.get(key)).compose.attachments.length, 21);
  assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM sends').get().n, 0);
});

test('Mail retains unresolved send keys after a lost provider response or failed accepted-send receipt', async () => {
  const successfulProvider = { messageId: 'fixture@example.test' };
  let calls = 0;
  env.EMAIL.send = async () => { calls++; throw new Error('Provider response interrupted'); };
  const ambiguous = { ...fields, draftId: 'lost-response-draft', key: 'lost-provider-response' };
  assert.equal((await request('send', ambiguous)).status, 503);
  sql.prepare('UPDATE sends SET at = 0 WHERE key = ?').run(ambiguous.key);
  assert.equal((await request('send', ambiguous)).status, 503);
  assert.equal(calls, 1);

  const accepted = { ...fields, draftId: 'accepted-receipt-draft', key: 'accepted-receipt-lost' };
  env.EMAIL.send = async () => { calls++; return successfulProvider; };
  sql.exec(`CREATE TRIGGER fail_receipt BEFORE UPDATE OF id ON sends BEGIN SELECT RAISE(FAIL, 'receipt unavailable'); END;`);
  try {
    const res = await request('send', accepted);
    assert.equal(res.status, 200);
    assert.equal(sql.prepare('SELECT folder FROM messages WHERE id = ?').get((await res.json()).id).folder, 'sent');
  } finally { sql.exec('DROP TRIGGER fail_receipt'); }
  assert.equal(sql.prepare('SELECT id FROM sends WHERE key = ?').get(accepted.key).id, null);
  sql.prepare('UPDATE sends SET at = 0 WHERE key = ?').run(accepted.key);
  assert.equal((await request('send', accepted)).status, 503);
  assert.equal(calls, 2);

  const rateLimited = { ...fields, draftId: 'rate-limited-draft', key: 'retry-rate-limited' };
  env.EMAIL.send = async () => {
    calls++;
    throw Object.assign(new Error('Rate limit'), { code: 'E_RATE_LIMIT_EXCEEDED' });
  };
  assert.equal((await request('send', rateLimited)).status, 502);
  assert.equal(sql.prepare('SELECT id FROM sends WHERE key = ?').get(rateLimited.key), undefined);
  env.EMAIL.send = async () => { calls++; return successfulProvider; };
  const retried = await request('send', rateLimited);
  assert.equal(retried.status, 200);
  assert.deepEqual(await (await request('send', rateLimited)).json(), await retried.json());
  assert.equal(calls, 4);
});

test('Mail purges R2 objects in supported batches and retains index rows when a batch fails', async () => {
  const addMessage = sql.prepare("INSERT INTO messages(id, folder, date) VALUES(?, 'trash', 0)");
  const addAttachment = sql.prepare('INSERT INTO attachments(id, message_id) VALUES(?, ?)');
  const counts = () => [
    sql.prepare("SELECT COUNT(*) AS n FROM messages WHERE folder = 'trash'").get().n,
    sql.prepare("SELECT COUNT(*) AS n FROM attachments WHERE message_id LIKE 'purge-%'").get().n,
  ];
  for (let i = 0; i < 40; i++) {
    const id = `purge-${i}`;
    addMessage.run(id);
    objects.set(`body/${id}.json`, '{}');
    objects.set(`raw/${id}.eml`, 'original');
    for (let j = 0; j < 30; j++) {
      const attachment = `${id}-${j}`;
      addAttachment.run(attachment, id);
      objects.set(`att/${attachment}`, 'file');
    }
  }
  const remove = env.MAIL.delete;
  const sizes = [];
  env.MAIL.delete = async keys => {
    sizes.push(keys.length);
    assert.ok(keys.length <= 1000);
    if (sizes.length === 2) throw new Error('R2 interrupted');
    return remove(keys);
  };
  try {
    assert.equal((await request('trash/empty', {})).status, 500);
    assert.deepEqual(counts(), [40, 1200]);
    assert.equal((await request('trash/empty', {})).status, 200);
    assert.deepEqual(counts(), [0, 0]);
    assert.deepEqual(sizes, [1000, 280, 1000, 280]);
    assert.equal([...objects.keys()].filter(key => key.includes('/purge-')).length, 0);
  } finally { env.MAIL.delete = remove; }
});

test('Mail notification details require fresh access and an unexpired delivery token', async () => {
  const id = crypto.randomUUID();
  const thread = 'fixture-private-thread';
  sql.prepare("INSERT INTO messages(id, folder, thread_id, from_name, subject, snippet, date, category) VALUES(?, 'inbox', ?, ?, ?, ?, ?, 'people')")
    .run('notice-fixture', thread, 'Private sender', 'Private subject', 'Private snippet', Date.now());
  sql.prepare("INSERT INTO push_notices(id, thread_id, kind, expires_at) VALUES(?, ?, 'new', ?)").run(id, thread, Date.now() + 60000);
  const path = `push/notice/${id}`;
  const paths = [path, `notice/${thread}`];
  try {
    for (const access of [{ fresh: false }, { passkey: false }, { signedIn: false }, { admin: false }]) {
      const fresh = view;
      view = { ...view, ...access };
      for (const route of paths) {
        const res = await request(route);
        assert.equal(res.status, 401);
        assert.doesNotMatch(await res.text(), /Private|fixture-private-thread/);
      }
      view = fresh;
    }
    const res = await request(path);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('Cache-Control'), 'no-store');
    assert.deepEqual(await res.json(), { title: 'Private sender', body: 'Private subject\nPrivate snippet', thread, badge: 0 });
    sql.prepare('UPDATE push_notices SET expires_at = 0 WHERE id = ?').run(id);
    assert.equal((await request(path)).status, 404);
  } finally { view = { signedIn: true, admin: true, passkey: true, fresh: true, id: 'test-owner' }; }
});

test('two Mail tabs retain the intended attachment after reorder and reject handles that were removed', async () => {
  const id = 'draft-old-attachment-fixture';
  sql.prepare("INSERT INTO messages(id, folder, date) VALUES(?, 'drafts', 0)").run(id);
  objects.set(`body/${id}.json`, JSON.stringify({ compose: { ...fields, attachments: [
    { filename: 'left.txt', content: 'bGVmdA==', size: 4 },
    { filename: 'right.txt', content: 'cmlnaHQ=', size: 5 },
  ] } }));
  const open = async () => {
    const response = await request(`drafts/${id}`);
    assert.equal(response.status, 200);
    return response.json();
  };
  const firstTab = await open(), secondTab = await open();
  assert.equal(firstTab.revision, secondTab.revision);
  const [left, right] = firstTab.compose.files.map(({ draftFile }) => ({ draftFile }));

  const reordered = await request('drafts', { id, ...fields, draftRevision: secondTab.revision, attachments: [right, left] });
  assert.equal(reordered.status, 200);
  const reorderedDraft = await open();
  assert.deepEqual(reorderedDraft.compose.files.map(({ draftFile }) => draftFile), [right.draftFile, left.draftFile]);
  assert.equal((await request('send', { draftId: id, draftRevision: firstTab.revision, key: 'stale-reordered-draft' })).status, 409);

  const keepLeft = await request('drafts', { id, ...fields, draftRevision: reorderedDraft.revision, attachments: [left] });
  assert.equal(keepLeft.status, 200);
  const kept = await open();
  assert.deepEqual(kept.compose.files.map(file => file.filename), ['left.txt']);
  for (const attachments of [[right], [{ i: 0 }]]) {
    const refused = await request('drafts', { id, ...fields, draftRevision: kept.revision, subject: 'stale overwrite', attachments });
    assert.equal(refused.status, 409);
    assert.deepEqual(await open(), kept);
  }
  const provider = env.EMAIL.send;
  const delivered = [];
  env.EMAIL.send = async message => { delivered.push(message); return {}; };
  try {
    const sent = await request('send', { draftId: id, draftRevision: kept.revision, key: 'intended-file-only' });
    assert.equal(sent.status, 200);
    assert.deepEqual(delivered[0].attachments.map(a => [a.filename, new TextDecoder().decode(a.content)]), [['left.txt', 'left']]);
  } finally { env.EMAIL.send = provider; }
});


test('a stale tab cannot overwrite the text or remove attachments from an already completed draft save', async () => {
  const initial = await request('drafts', { ...fields, attachments: files(1) });
  const { id, revision } = await initial.json();
  const open = async () => (await request(`drafts/${id}`)).json();
  const firstTab = await open(), secondTab = await open();
  const [kept] = firstTab.compose.files;
  const update = await request('drafts', {
    ...fields, id, draftRevision: secondTab.revision, text: 'Saved newer words',
    attachments: [{ draftFile: kept.draftFile }, files(2)[1]],
  });
  assert.equal(update.status, 200);
  const latest = await open();
  assert.equal(latest.compose.text, 'Saved newer words');
  assert.equal(latest.compose.files.length, 2);
  assert.equal((await request('send', { ...fields, draftId: id, key: 'unversioned-direct-draft' })).status, 409);

  for (const draftRevision of [revision, undefined]) {
    const stale = await request('drafts', {
      ...fields, id, draftRevision, text: 'Older local words', attachments: [{ draftFile: kept.draftFile }],
    });
    assert.equal(stale.status, 409);
    assert.match((await stale.json()).error, /Reopen/);
    assert.deepEqual(await open(), latest);
  }
});

test('draft send reservations survive an overlapping save, different client keys and direct submission', async () => {
  const created = await request('drafts', { ...fields, attachments: files(1) });
  assert.equal(created.status, 200);
  const { id, revision } = await created.json();
  const startedSave = Promise.withResolvers(), finishSave = Promise.withResolvers();
  const startedSend = Promise.withResolvers(), finishSend = Promise.withResolvers();
  const put = env.MAIL.put, provider = env.EMAIL.send;
  let sends = 0;
  env.MAIL.put = async (key, body) => {
    await put(key, body);
    if (key.startsWith(`draft/${id}/`)) { startedSave.resolve(); await finishSave.promise; }
  };
  env.EMAIL.send = async () => {
    sends++;
    startedSend.resolve();
    await finishSend.promise;
    throw new Error('Response lost after provider handoff');
  };
  const save = request('drafts', { id, ...fields, draftRevision: revision, subject: 'Racing edit', attachments: [] });
  let pending;
  try {
    await startedSave.promise;
    pending = request('send', { draftId: id, draftRevision: revision, key: 'claim-racing-original' });
    await startedSend.promise;
    const secondTab = await request('send', { draftId: id, draftRevision: revision, key: 'claim-racing-other-key' });
    assert.equal(secondTab.status, 409);
    assert.match((await secondTab.json()).error, /unconfirmed/);
    const direct = await request('send', { ...fields, draftId: id, key: 'claim-racing-direct-key', attachments: files(1) });
    assert.equal(direct.status, 409);
    finishSave.resolve();
    assert.equal((await save).status, 409);
    finishSend.resolve();
    assert.equal((await pending).status, 503);
    assert.equal((await request('drafts', { id, ...fields, subject: 'Later edit' })).status, 409);
    assert.equal((await request('send', { draftId: id, draftRevision: revision, key: 'claim-racing-after-loss' })).status, 409);
    assert.equal(sends, 1);
    const stillThere = await (await request(`drafts/${id}`)).json();
    assert.equal(stillThere.revision, revision);
    assert.equal(stillThere.compose.subject, fields.subject);
    assert.equal(stillThere.compose.files.length, 1);

    env.EMAIL.send = async () => { sends++; return {}; };
    const separate = await request('send', { ...fields, draftId: 'explicit-independent-copy', key: 'claim-explicit-copy' });
    assert.equal(separate.status, 200);
    assert.equal(sends, 2);
  } finally {
    finishSave.resolve(); finishSend.resolve();
    await Promise.allSettled([save, pending]);
    env.MAIL.put = put; env.EMAIL.send = provider;
  }
});

test('an uncertain standalone send keeps its draft identity even without a server draft', async () => {
  const provider = env.EMAIL.send;
  let calls = 0;
  env.EMAIL.send = async () => { calls++; throw new Error('Response lost'); };
  const draftId = 'unsaved-standalone-compose';
  try {
    assert.equal((await request('send', { ...fields, key: 'no-standalone-draft' })).status, 409);
    assert.equal((await request('send', { ...fields, draftId, key: 'standalone-original-key' })).status, 503);
    assert.equal((await request('send', { ...fields, draftId, key: 'standalone-reopened-key' })).status, 409);
    assert.equal((await request('drafts', { ...fields, id: draftId })).status, 409);
    assert.equal((await request(`drafts/${draftId}`)).status, 409);
    assert.equal(calls, 1);
  } finally { env.EMAIL.send = provider; }
});
