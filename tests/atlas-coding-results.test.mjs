import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { validateCodingArtifact, codingFileDiff, CODING_RESULT_LIMITS } from '../today/src/atlas-coding-results.js';
import { publishCodingChanges } from '../today/src/atlas-repository.js';
import { source, blob, b64, hash, githubFixture, manifestFor, artifactFor } from './helpers/atlas-coding-fixtures.mjs';

const modify = (path, before, after, mode = '100644') => ({ path, operation: 'modify', beforeBase64: b64(before), contentBase64: b64(after), afterMode: mode });
const add = (path, content, mode = '100644') => ({ path, operation: 'add', beforeBase64: null, contentBase64: b64(content), afterMode: mode });
const remove = (path, before) => ({ path, operation: 'delete', beforeBase64: b64(before), contentBase64: null, afterMode: null });

test('validates more than five changes from actual before bytes, including add/delete/binary/modes', async () => {
  const initial = Object.fromEntries(Array.from({ length: 8 }, (_, i) => ['src/' + i + '.js', source('old ' + i + '\n')]));
  const manifest = manifestFor(initial);
  const changes = Object.entries(initial).map(([path, file], i) => i === 7 ? remove(path, file.bytes) : modify(path, file.bytes, 'new ' + i + '\n', i === 0 ? '100755' : '100644'));
  changes.push(add('assets/new.png', Buffer.from([137, 80, 0, 255])));
  const value = await validateCodingArtifact(artifactFor(manifest, changes), manifest);
  assert.equal(value.files.length, 9); assert.match(value.summary, /1 added, 7 modified, 1 deleted/);
  assert.equal(value.files[0].afterMode, '100755'); assert.equal(value.files[7].afterSha, null); assert.equal(value.files[8].binary, true);
  assert.equal(value.files[8].afterSha, blob(Buffer.from([137, 80, 0, 255])));
  assert.ok(value.files.every(file => !('beforeBase64' in file) && !('before' in file)));
  assert.deepEqual((await validateCodingArtifact(artifactFor(manifest, []), manifest)).files, []);
});

test('pins artifacts to task, revision, repository and base and verifies originals rather than claimed metadata', async () => {
  const manifest = manifestFor({ 'app.js': source('original\n') }), valid = artifactFor(manifest, [modify('app.js', 'original\n', 'next\n')]);
  for (const [key, value] of [['runId', 'other-task'], ['revision', 2], ['repository', 'attacker/repo'], ['baseSha', hash('other base')]]) await assert.rejects(validateCodingArtifact({ ...valid, [key]: value }, manifest), { code: 'coding_result_scope' });
  await assert.rejects(validateCodingArtifact(artifactFor(manifest, [modify('app.js', 'forged\n', 'next\n')]), manifest), { code: 'coding_result_original_changed' });
  const value = await validateCodingArtifact({ ...valid, tests: { passed: true }, changes: valid.changes.map(change => ({ ...change, beforeSha: hash('claimed'), beforeMode: '100755' })) }, manifest);
  assert.equal(value.files[0].beforeSha, blob('original\n')); assert.equal(value.files[0].beforeMode, '100644'); assert.equal(value.tests, undefined);
});

test('rejects unsafe/excluded paths, duplicate or incorrect operations and file-directory conflicts', async () => {
  const manifest = manifestFor({ 'app.js': source('old') }, { excluded: [{ path: 'linked', reason: 'symlink_or_submodule' }] });
  for (const path of ['../escape', '/root/file', '.git/config', 'src/.env.local', '.npmrc', '.dev.vars', 'node_modules/x', '.aws/config', 'secrets.json', 'x\\y']) await assert.rejects(validateCodingArtifact(artifactFor(manifest, [add(path, 'x')]), manifest));
  for (const changes of [[add('linked', 'x')], [add('app.js', 'x')], [modify('missing.js', '', 'x')], [add('x', 'a'), add('x', 'b')]]) await assert.rejects(validateCodingArtifact(artifactFor(manifest, changes), manifest), { code: 'coding_result_scope' });
  await assert.rejects(validateCodingArtifact(artifactFor(manifest, [add('app.js/nested', 'x')]), manifest), { code: 'coding_result_path_conflict' });
  await assert.rejects(validateCodingArtifact(artifactFor(manifest, [modify('app.js', 'old', 'old')]), manifest), { code: 'coding_result_no_change' });
  await assert.rejects(validateCodingArtifact(artifactFor(manifest, [add('link', 'x', '120000')]), manifest), { code: 'coding_result_mode' });
});

test('enforces canonical Base64 and per-file/aggregate review bounds without a five-file gate', async () => {
  const manifest = manifestFor({});
  for (const contentBase64 of ['AA=A', 'AB==', 'YWJj\n', 'a', '!!!=']) await assert.rejects(validateCodingArtifact(artifactFor(manifest, [{ ...add('x', ''), contentBase64 }]), manifest), { code: 'coding_result_encoding' });
  const full = Buffer.alloc(CODING_RESULT_LIMITS.afterFileBytes, 65);
  const value = await validateCodingArtifact(artifactFor(manifest, [add('large.bin', full)]), manifest);
  assert.equal(value.files[0].afterBytes, full.length); assert.equal(value.files[0].diffTruncated, true);
  assert.ok(Buffer.byteLength(value.files[0].diff) <= CODING_RESULT_LIMITS.diffBytes);
  await assert.rejects(validateCodingArtifact(artifactFor(manifest, [add('too-large', Buffer.alloc(full.length + 1))]), manifest), { code: 'coding_result_encoding' });
  await assert.rejects(validateCodingArtifact(artifactFor(manifest, Array.from({ length: 513 }, (_, i) => add('file-' + i, ''))), manifest), { code: 'coding_result_scope' });
  const medium = Buffer.alloc(1024 * 1024, 0), changes = Array.from({ length: 17 }, (_, i) => add('asset-' + i, medium));
  await assert.rejects(validateCodingArtifact(artifactFor(manifest, changes), manifest), { code: 'coding_result_large' });
});

test('contextual diffs retain separate hunks, exact final-newline changes and correct Git application', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'atlas-diff-')); t.after(() => rm(directory, { recursive: true, force: true }));
  const before = Array.from({ length: 30 }, (_, i) => 'line ' + i).join('\n') + '\n';
  const after = before.replace('line 5\n', 'edited 5\n').replace('line 25\n', 'edited 25\n');
  const diff = codingFileDiff('space name.txt', Buffer.from(before), Buffer.from(after), { beforeMode: '100644', afterMode: '100644' });
  assert.equal(diff.diff.match(/^@@/gm).length, 2); assert.equal(diff.addedLines, 2); assert.equal(diff.removedLines, 2); assert.ok(!diff.diff.includes('line 15'));
  await writeFile(join(directory, 'space name.txt'), before);
  execFileSync('git', ['apply', '--check', '-'], { cwd: directory, input: diff.diff + '\n' });
  const newline = codingFileDiff('newline.txt', Buffer.from('same'), Buffer.from('same\n'), { beforeMode: '100644', afterMode: '100644' });
  assert.match(newline.diff, /-same\n\\ No newline at end of file\n\+same/);
  await writeFile(join(directory, 'newline.txt'), 'same'); execFileSync('git', ['apply', '--check', '-'], { cwd: directory, input: newline.diff + '\n' });
  const long = codingFileDiff('long.txt', Buffer.from('x'.repeat(300000)), Buffer.from('x'.repeat(300000) + '\n'), { beforeMode: '100644', afterMode: '100644' });
  assert.equal(long.diffTruncated, true); assert.ok(Buffer.byteLength(long.diff) <= CODING_RESULT_LIMITS.diffBytes);
  const many = codingFileDiff('many.txt', Buffer.from('x\n'.repeat(100001)), Buffer.from('next\n'), { beforeMode: '100644', afterMode: '100644' });
  assert.equal(many.diffTruncated, true); assert.equal(many.addedLines, null);
  const huge = codingFileDiff('huge.txt', Buffer.alloc(8 * 1024 * 1024, 10), null, { beforeMode: '100644', afterMode: null });
  assert.equal(huge.diffTruncated, true); assert.equal(huge.removedLines, null); assert.match(huge.diff, /exceeds 2 MiB/); assert.ok(huge.diff.length < 1000);
});

async function publicationFixture() {
  const initial = Object.fromEntries(Array.from({ length: 7 }, (_, i) => ['src/' + i + '.js', source('old ' + i + '\n')]));
  initial['unrelated.png'] = source(Buffer.from([0, 255, 100])); initial['.env'] = source('FIXTURE_ONLY=yes');
  const { env, api } = await githubFixture(initial), manifest = manifestFor(initial, { baseTreeSha: api.baseTreeSha });
  const changes = Object.entries(initial).filter(([path]) => path.startsWith('src/')).map(([path, file], i) => i === 6 ? remove(path, file.bytes) : modify(path, file.bytes, 'new ' + i + '\n', i === 0 ? '100755' : '100644'));
  changes.push(add('assets/new.bin', Buffer.from([0, 255, 254])));
  const validated = await validateCodingArtifact(artifactFor(manifest, changes), manifest);
  return { env, api, candidate: { id: manifest.runId, revision: 1, repository: api.name, baseBranch: 'main', baseSha: api.baseSha, baseTreeSha: api.baseTreeSha, title: 'Implement the requested change', summary: 'Update the application and assets.', checks: [{ source: 'provider_command_execution', command: 'node --test tests/focused.test.mjs', exitCode: 0 }], files: validated.files } };
}

test('publishes reviewed additions/deletions/binaries/modes with a complete pinned tree and a guarded draft PR', async () => {
  const { env, api, candidate } = await publicationFixture(); let guards = 0;
  const result = await publishCodingChanges(env, 'alice', candidate, { send: api.send, beforeWrite: async () => { guards++; } });
  assert.deepEqual(result, { url: 'https://github.com/owner/project/pull/1', number: 1, headSha: api.pulls[0].head.sha }); assert.equal(api.pulls[0].draft, true);
  const branch = 'atlas/coding-coding-task-r1', commit = api.commits.get(api.branches.get(branch)), files = api.trees.get(commit.tree.sha);
  assert.equal(api.branches.get('main'), api.baseSha); assert.equal(commit.parents[0].sha, api.baseSha);
  assert.equal(files['src/0.js'].mode, '100755'); assert.equal(files['src/6.js'], undefined); assert.deepEqual(files['assets/new.bin'].bytes, Buffer.from([0, 255, 254])); assert.equal(files['.env'].bytes.toString(), 'FIXTURE_ONLY=yes');
  assert.equal(guards, api.calls.filter(call => call.method === 'POST').length);
  assert.ok(api.calls.every(call => call.redirect === 'manual')); assert.ok(!api.calls.some(call => call.url.pathname.includes('/contents/')));
  assert.match(api.pulls[0].body, /exit 0/);
});

test('publication refuses stale bases, forged blobs/original metadata, workflow writes and incomplete trees before mutating GitHub', async () => {
  for (const mutate of [({ api }) => api.branches.set('main', hash('moved')), ({ candidate }) => candidate.files[0].beforeSha = hash('forged'), ({ candidate }) => candidate.files[0].contentBase64 = b64('forged'), ({ api }) => api.treeTruncated = true, ({ candidate }) => candidate.files[0].path = '.github/workflows/build.yml']) {
    const fixture = await publicationFixture(); mutate(fixture);
    await assert.rejects(publishCodingChanges(fixture.env, 'alice', fixture.candidate, { send: fixture.api.send }));
    assert.equal(fixture.api.calls.filter(call => call.method === 'POST').length, 0);
  }
});

test('publication lease/cancellation is checked before each mutation and retry recovers an ambiguously created draft', async () => {
  const { env, api, candidate } = await publicationFixture(); let guards = 0;
  await assert.rejects(publishCodingChanges(env, 'alice', candidate, { send: api.send, beforeWrite: async () => { if (++guards === 3) throw Object.assign(Error('lease changed'), { code: 'lease_changed' }); } }), { code: 'lease_changed' });
  assert.equal(api.calls.filter(call => call.method === 'POST').length, 2); assert.equal(api.pulls.length, 0);
  api.failAfterPull = true;
  await assert.rejects(publishCodingChanges(env, 'alice', candidate, { send: api.send }), { code: 'github_unavailable' });
  const result = await publishCodingChanges(env, 'alice', candidate, { send: api.send });
  assert.equal(result.number, 1); assert.equal(api.pulls.length, 1);
  assert.equal(api.calls.filter(call => call.method === 'POST' && call.url.pathname.endsWith('/git/commits')).length, 1);
  assert.equal(api.calls.filter(call => call.method === 'POST' && call.url.pathname.endsWith('/git/refs')).length, 1);
});

test('publication retry detects unrelated tree tampering and a changed base or non-draft PR', async () => {
  const first = await publicationFixture(); await publishCodingChanges(first.env, 'alice', first.candidate, { send: first.api.send });
  const branch = 'atlas/coding-coding-task-r1', commit = first.api.commits.get(first.api.branches.get(branch));
  commit.tree.sha = first.api.treeFor({ ...first.api.trees.get(commit.tree.sha), 'unreviewed.js': source('foreign') });
  await assert.rejects(publishCodingChanges(first.env, 'alice', first.candidate, { send: first.api.send }), { code: 'coding_branch_conflict' });
  const second = await publicationFixture(); second.api.onWrite = async path => { if (path === '/git/refs') second.api.branches.set('main', hash('concurrent base movement')); };
  await assert.rejects(publishCodingChanges(second.env, 'alice', second.candidate, { send: second.api.send }), { code: 'coding_base_changed' }); assert.equal(second.api.pulls.length, 0);
  const third = await publicationFixture(); await publishCodingChanges(third.env, 'alice', third.candidate, { send: third.api.send }); third.api.pulls[0].draft = false;
  await assert.rejects(publishCodingChanges(third.env, 'alice', third.candidate, { send: third.api.send }), { code: 'patch_pr_conflict' });
});
