import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm, chmod, unlink, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { gunzipSync } from 'node:zlib';
import { prepareRepositoryWorkspace, sanitizeRepositoryArchive, createWorkspaceTar, WORKSPACE_BOOTSTRAP, WORKSPACE_EXPORTER, WORKSPACE_LIMITS } from '../today/src/atlas-workspace.js';
import { repositoryWorkspaceArchive } from '../today/src/atlas-repository.js';
import { validateCodingArtifact } from '../today/src/atlas-coding-results.js';
import { source, b64, blob, tar, archiveOf, treeEntries, githubFixture, manifestFor, TOKEN } from './helpers/atlas-coding-fixtures.mjs';

const sanitize = (files, archive = archiveOf(files), options) => sanitizeRepositoryArchive(new Response(archive), { entries: treeEntries(files) }, options);

test('sanitized snapshots preserve tracked source, large vendor bundles, binary images, fonts and executable modes', async () => {
  const files = { 'src/app.js': source('export default 1;\n'), 'vendor/build/worker.js': source(Buffer.alloc(2300000, 65)), 'dist/site.js': source('built source'), 'assets/picture.png': source(Buffer.from([137, 80, 78, 71, 0, 255])), 'assets/font.woff2': source(Buffer.from([0, 15, 255])), 'bin/setup': source('#!/bin/sh\ntrue\n', '100755'), '.env': source('FIXTURE_SECRET=yes'), 'node_modules/pkg/index.js': source('dependency'), '.git/config': source('never copied'), 'linked': source('src/app.js', '120000'), 'submodule': source('submodule fixture', '160000') };
  const result = await sanitize(files);
  assert.equal(result.files.length, 6); assert.equal(result.entries.length, 6); assert.equal(result.excluded.length, 5);
  assert.deepEqual(result.files.find(file => file.path === 'assets/picture.png').bytes, new Uint8Array(files['assets/picture.png'].bytes));
  assert.equal(result.files.find(file => file.path === 'vendor/build/worker.js').bytes.length, 2300000);
  assert.equal(result.files.find(file => file.path === 'bin/setup').mode, '100755');
  assert.ok(result.files.every(file => !file.path.startsWith('.git') && !file.path.startsWith('node_modules')));
});

test('archive verification rejects forged paths, blob content, modes, duplicate/missing entries and unsupported file types', async () => {
  const files = { 'app.js': source('pinned\n') };
  for (const path of ['fixture/../escape', '/absolute/app.js', 'fixture/app\\js', 'fixture//app.js']) await assert.rejects(sanitize(files, tar([{ path, bytes: 'pinned\n' }])), { code: 'workspace_archive_path' });
  for (const entries of [
    [{ path: 'fixture/app.js', bytes: 'forged\n' }],
    [{ path: 'fixture/app.js', bytes: 'pinned\n', mode: 0o755 }],
    [{ path: 'fixture/app.js', bytes: '', type: '2' }],
    [{ path: 'fixture/app.js', bytes: '', type: '1' }],
    [{ path: 'fixture/app.js', bytes: 'pinned\n' }, { path: 'fixture/app.js', bytes: 'pinned\n' }],
    [{ path: 'fixture/unknown.js', bytes: 'unknown\n' }],
  ]) await assert.rejects(sanitize(files, tar(entries)), { code: 'workspace_archive_mismatch' });
  await assert.rejects(sanitize(files, tar([])), { code: 'workspace_archive_incomplete' });
  await assert.rejects(sanitize(files, tar([{ path: 'fixture/app.js', bytes: 'pinned\n' }, { path: 'other/root', bytes: 'x' }])), { code: 'workspace_archive_path' });
});

test('native tar builder supports long Unicode paths and bounded tar metadata safely', async () => {
  const path = 'nested/' + 'long-name-'.repeat(15) + '文.txt', file = source('safe unicode content\n');
  const archive = await createWorkspaceTar([{ path: 'fixture/' + path, bytes: file.bytes, mode: file.mode }]);
  const result = await sanitize({ [path]: file }, archive); assert.equal(result.files[0].path, path); assert.equal(result.entries[0].sha, blob(file.bytes));
  await assert.rejects(sanitize({ 'app.js': source('x') }, tar([{ path: 'PaxHeader', type: 'x', bytes: '99 path=fixture/app.js\n' }])), { code: 'workspace_archive_invalid' });
  await assert.rejects(sanitize({ 'app.js': source('x') }, tar([{ path: 'fixture/app.js', declaredSize: WORKSPACE_LIMITS.fileBytes + 1 }])), { code: 'workspace_file_large' });
  const invalid = gunzipSync(archiveOf({ 'app.js': source('x') })); invalid[0] = 0;
  const corrupt = await new Response(new Blob([invalid]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer();
  await assert.rejects(sanitize({ 'app.js': source('x') }, corrupt), { code: 'workspace_archive_invalid' });
});

test('resource limits and cancellation stop archive ingestion explicitly', async () => {
  const files = { 'large.bin': source(Buffer.alloc(WORKSPACE_LIMITS.fileBytes + 1)) };
  await assert.rejects(sanitize(files, new Uint8Array()), { code: 'workspace_file_large' });
  const entries = Array.from({ length: 5001 }, (_, i) => ({ path: 'file-' + i, mode: '100644', type: 'blob', size: 0, sha: blob('') }));
  await assert.rejects(sanitizeRepositoryArchive(new Response(new Uint8Array()), { entries }), { code: 'workspace_repository_large' });
  const controller = new AbortController(); controller.abort();
  await assert.rejects(sanitize({ 'app.js': source('x') }, undefined, { signal: controller.signal }), { code: 'request_cancelled' });
});

test('repository transport pins the selected branch and keeps credentials off the archive redirect and bundle', async () => {
  const { env, api } = await githubFixture({ 'app.js': source('pinned\n'), '.env': source('FIXTURE_SECRET=yes') }); api.branches.set('feature/custom', api.baseSha);
  const bundle = await prepareRepositoryWorkspace(env, 'alice', { repository: api.name, baseBranch: 'feature/custom', runId: 'task-123' }, { send: api.send });
  assert.equal(bundle.baseBranch, 'feature/custom'); assert.equal(bundle.baseSha, api.baseSha); assert.equal(bundle.baseTreeSha, api.baseTreeSha);
  const download = api.calls.find(call => call.url.hostname === 'codeload.github.com');
  assert.equal(download.headers.has('authorization'), false); assert.equal(download.headers.has('cookie'), false); assert.equal(download.credentials, 'omit'); assert.equal(download.redirect, 'manual');
  assert.ok(api.calls.filter(call => call.url.hostname === 'api.github.com').every(call => call.headers.get('authorization') === 'Bearer ' + TOKEN && call.redirect === 'manual'));
  const contents = gunzipSync(Buffer.from(await bundle.archive.arrayBuffer())).toString();
  assert.ok(contents.includes('repo/app.js')); assert.ok(contents.includes('atlas/bootstrap.py')); assert.ok(contents.includes('atlas/export_changes.py'));
  assert.ok(!contents.includes(TOKEN)); assert.ok(!contents.includes('FIXTURE_SECRET=yes')); assert.equal(bundle.manifest.excluded[0].path, '.env');
});

test('repository transport rejects redirects outside exact codeload repository/commit scope and incomplete trees', async () => {
  for (const redirect of ['https://attacker.example/repo.tar.gz', 'https://codeload.github.com/other/repo/legacy.tar.gz/' + 'a'.repeat(40), 'https://user:password@codeload.github.com/owner/project/legacy.tar.gz/' + 'a'.repeat(40), 'http://codeload.github.com/owner/project/legacy.tar.gz/' + 'a'.repeat(40)]) {
    const { env, api } = await githubFixture(); api.redirect = redirect;
    await assert.rejects(repositoryWorkspaceArchive(env, 'alice', { repository: api.name }, { send: api.send }), { code: 'workspace_archive_redirect' });
    assert.ok(api.calls.every(call => call.url.hostname === 'api.github.com'));
  }
  const { env, api } = await githubFixture(); api.treeTruncated = true;
  await assert.rejects(repositoryWorkspaceArchive(env, 'alice', { repository: api.name }, { send: api.send }), { code: 'workspace_tree_incomplete' });
  assert.ok(!api.calls.some(call => call.url.pathname.includes('/tarball/')));
});

test('bootstrap/export runs real Git and Python, retains ignored tracked inputs and derives continued filesystem changes', async t => {
  const root = await mkdtemp(join(tmpdir(), 'atlas-workspace-')); t.after(() => rm(root, { recursive: true, force: true }));
  const files = { 'src/app.js': source('old\n'), 'remove.txt': source('delete me\n'), 'assets/image.bin': source(Buffer.from([0, 1, 2])), '.gitignore': source('tracked-input.txt\nnode_modules/\ntest-results/\nignored-but-staged.txt\n'), 'tracked-input.txt': source('must exist in baseline\n') };
  const manifest = manifestFor(files), meta = join(root, 'atlas'), repo = join(root, 'repo'); await mkdir(meta, { recursive: true });
  for (const [path, file] of Object.entries(files)) { await mkdir(join(repo, path, '..'), { recursive: true }); await writeFile(join(repo, path), file.bytes); }
  await writeFile(join(meta, 'manifest.json'), JSON.stringify(manifest));
  for (const [name, script] of [['bootstrap.py', WORKSPACE_BOOTSTRAP], ['export_changes.py', WORKSPACE_EXPORTER]]) await writeFile(join(meta, name), script.replaceAll('/workspace', root));
  const run = (script, args = []) => execFileSync('python3', [join(meta, script), ...args], { encoding: 'utf8', stdio: 'pipe' });
  run('bootstrap.py'); assert.equal(execFileSync('git', ['ls-files', 'tracked-input.txt'], { cwd: repo, encoding: 'utf8' }).trim(), 'tracked-input.txt');
  assert.equal(execFileSync('git', ['remote'], { cwd: repo, encoding: 'utf8' }).trim(), '');
  await writeFile(join(repo, 'src/app.js'), 'new\n'); await chmod(join(repo, 'src/app.js'), 0o755); await unlink(join(repo, 'remove.txt'));
  await writeFile(join(repo, 'new-binary.bin'), Buffer.from([0, 255])); await mkdir(join(repo, 'node_modules'), { recursive: true }); await writeFile(join(repo, 'node_modules/ignored'), 'generated dependency');
  await mkdir(join(repo, 'test-results'), { recursive: true }); await writeFile(join(repo, 'test-results/report.json'), '{"tests":100}');
  await writeFile(join(repo, 'src/new.js'), 'export const added = true;\n'); await writeFile(join(repo, 'tracked-input.txt'), 'changed tracked input\n');
  await writeFile(join(repo, 'ignored-but-staged.txt'), 'explicit addition\n'); execFileSync('git', ['add', '--force', 'ignored-but-staged.txt'], { cwd: repo });
  run('bootstrap.py'); assert.equal(await readFile(join(repo, 'src/app.js'), 'utf8'), 'new\n', 'continuation must not reset edits');
  run('export_changes.py', ['--revision', '2']); const artifact = JSON.parse(await readFile(join(root, 'outputs/atlas-changes.json'), 'utf8'));
  const result = await validateCodingArtifact(artifact, { ...manifest, revision: 2 });
  assert.deepEqual(result.files.map(file => [file.path, file.operation]), [['ignored-but-staged.txt', 'add'], ['new-binary.bin', 'add'], ['remove.txt', 'delete'], ['src/app.js', 'modify'], ['src/new.js', 'add'], ['tracked-input.txt', 'modify']]);
  assert.equal(result.files[3].afterMode, '100755'); assert.equal(result.files[1].binary, true);
  await writeFile(join(meta, 'base/src/app.js'), 'forged baseline');
  assert.throws(() => run('export_changes.py', ['--revision', '3']), /original file no longer matches the pinned baseline/);
});

test('exporter refuses symlinks instead of reading outside the workspace', async t => {
  const root = await mkdtemp(join(tmpdir(), 'atlas-symlink-')); t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'atlas'), { recursive: true }); await mkdir(join(root, 'repo'), { recursive: true });
  await writeFile(join(root, 'atlas/manifest.json'), JSON.stringify(manifestFor({})));
  await writeFile(join(root, 'atlas/export_changes.py'), WORKSPACE_EXPORTER.replaceAll('/workspace', root));
  execFileSync('git', ['init'], { cwd: join(root, 'repo'), stdio: 'pipe' });
  await symlink('/etc/passwd', join(root, 'repo/link'));
  assert.throws(() => execFileSync('python3', [join(root, 'atlas/export_changes.py')], { encoding: 'utf8', stdio: 'pipe' }), /Only regular file changes are supported/);
});
