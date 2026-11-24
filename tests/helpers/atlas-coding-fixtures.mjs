import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { encryptIntegration } from '../../today/src/atlas-credentials.js';

export const bytes = value => Buffer.isBuffer(value) ? value : Buffer.from(value);
export const hash = value => createHash('sha1').update(value).digest('hex');
export const blob = value => { const content = bytes(value); return hash(Buffer.concat([Buffer.from('blob ' + content.length + '\0'), content])); };
export const b64 = value => bytes(value).toString('base64');
export const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
export const source = (text, mode = '100644') => ({ bytes: bytes(text), mode });
export const TOKEN = 'github-fixture-coding-token-only';

export function tar(entries) {
  const chunks = [];
  for (const entry of entries) {
    const content = bytes(entry.bytes || ''), header = Buffer.alloc(512);
    const field = (at, size, value) => { const data = Buffer.from(value); if (data.length > size) throw Error('fixture tar field too long'); data.copy(header, at); };
    field(0, 100, entry.path); field(100, 8, (entry.mode || 0o644).toString(8).padStart(7, '0') + '\0');
    field(108, 8, '0000000\0'); field(116, 8, '0000000\0');
    field(124, 12, (entry.declaredSize ?? content.length).toString(8).padStart(11, '0') + '\0'); field(136, 12, '00000000000\0');
    header.fill(32, 148, 156); field(156, 1, entry.type || '0'); field(257, 6, 'ustar\0'); field(263, 2, '00');
    const checksum = header.reduce((total, byte) => total + byte, 0); field(148, 8, checksum.toString(8).padStart(6, '0') + '\0 ');
    chunks.push(header, content); if (content.length % 512) chunks.push(Buffer.alloc(512 - content.length % 512));
  }
  chunks.push(Buffer.alloc(1024));
  return gzipSync(Buffer.concat(chunks));
}

export const treeEntries = files => Object.entries(files).map(([path, value]) => ({ path, type: value.mode === '160000' ? 'commit' : 'blob', mode: value.mode, sha: blob(value.bytes), size: value.bytes.length }));
export const archiveOf = files => tar(Object.entries(files).filter(([, value]) => value.mode !== '160000').map(([path, value]) => ({ path: 'fixture/' + path, bytes: value.mode === '120000' ? '' : value.bytes, mode: value.mode === '100755' ? 0o755 : 0o644, type: value.mode === '120000' ? '2' : '0' })));

export async function githubFixture(initial = { 'src/app.js': source('export const value = 1;\n'), 'README.md': source('# Original\n') }) {
  const name = 'owner/project', calls = [], trees = new Map(), commits = new Map(), branches = new Map(), blobs = new Map(), pulls = [];
  const clone = files => Object.fromEntries(Object.entries(files).map(([path, value]) => [path, { ...value, bytes: bytes(value.bytes) }]));
  const treeFor = files => {
    const snapshot = clone(files), sha = hash(JSON.stringify(treeEntries(snapshot).sort((a, b) => a.path.localeCompare(b.path))));
    trees.set(sha, snapshot); for (const value of Object.values(files)) blobs.set(blob(value.bytes), bytes(value.bytes)); return sha;
  };
  const baseSha = hash('pinned fixture commit'), baseTreeSha = treeFor(initial);
  commits.set(baseSha, { sha: baseSha, tree: { sha: baseTreeSha }, parents: [], message: 'Pinned base' }); branches.set('main', baseSha);
  const env = { ATLAS_ENCRYPTION_KEY: b64(Buffer.alloc(32, 9)) };
  const encrypted = await encryptIntegration(env, 'alice', 'github', TOKEN);
  env.ATLAS_DB = { prepare(sql) { assertSelect(sql); return { bind(owner, kind) { return { async first() { return owner === 'alice' && kind === 'github' ? { ...encrypted, metadata: '{"login":"alice"}' } : null; } }; } }; } };
  function assertSelect(sql) { if (!sql.startsWith('SELECT iv,ciphertext,metadata FROM atlas_integrations')) throw Error('Unexpected fixture database access: ' + sql); }
  const api = { name, calls, trees, commits, branches, blobs, pulls, baseSha, baseTreeSha, treeFor, initial, archive: archiveOf(initial), redirect: 'https://codeload.github.com/' + name + '/legacy.tar.gz/' + baseSha, failAfterPull: false, treeTruncated: false };
  api.send = async (input, init = {}) => {
    const url = new URL(input), headers = new Headers(init.headers), method = init.method || 'GET', body = init.body ? JSON.parse(init.body) : null;
    calls.push({ url, headers, method, body, redirect: init.redirect, credentials: init.credentials });
    if (url.hostname === 'codeload.github.com') return new Response(api.archive);
    if (url.origin !== 'https://api.github.com') throw Error('Unexpected network host');
    if (url.pathname === '/repos/' + name) return json({ full_name: name, default_branch: 'main', permissions: { push: true } });
    const path = decodeURIComponent(url.pathname.slice(('/repos/' + name).length));
    if (method === 'POST') await api.onWrite?.(path, body);
    if (path.startsWith('/git/ref/heads/')) { const branch = path.slice('/git/ref/heads/'.length), sha = branches.get(branch); return sha ? json({ ref: 'refs/heads/' + branch, object: { type: 'commit', sha } }) : json({}, 404); }
    if (path.startsWith('/git/commits/') && method === 'GET') { const commit = commits.get(path.slice('/git/commits/'.length)); return json(commit || {}, commit ? 200 : 404); }
    if (path.startsWith('/git/trees/') && method === 'GET') { const sha = path.slice('/git/trees/'.length), files = trees.get(sha); return files ? json({ sha, tree: treeEntries(files), truncated: api.treeTruncated }) : json({}, 404); }
    if (path.startsWith('/tarball/')) return new Response(null, { status: 302, headers: { Location: api.redirect } });
    if (path === '/git/blobs' && method === 'POST') { const content = Buffer.from(body.content, body.encoding), sha = blob(content); blobs.set(sha, content); return json({ sha }, 201); }
    if (path === '/git/trees' && method === 'POST') {
      const files = clone(trees.get(body.base_tree));
      for (const entry of body.tree) { if (entry.sha === null) delete files[entry.path]; else { if (!blobs.has(entry.sha)) throw Error('Unknown fixture blob'); files[entry.path] = source(blobs.get(entry.sha), entry.mode); } }
      return json({ sha: treeFor(files) }, 201);
    }
    if (path === '/git/commits' && method === 'POST') { const sha = hash(JSON.stringify(body)), commit = { sha, tree: { sha: body.tree }, parents: body.parents.map(sha => ({ sha })), message: body.message }; commits.set(sha, commit); return json(commit, 201); }
    if (path === '/git/refs' && method === 'POST') { const branch = body.ref.slice('refs/heads/'.length); if (branches.has(branch)) return json({}, 422); branches.set(branch, body.sha); return json({ ref: body.ref, object: { sha: body.sha } }, 201); }
    if (path === '/pulls' && method === 'GET') { const head = url.searchParams.get('head')?.split(':').slice(1).join(':'); return json(pulls.filter(pull => pull.state === 'open' && (!head || head === pull.head.ref))); }
    if (path === '/pulls' && method === 'POST') {
      const pull = { number: pulls.length + 1, html_url: 'https://github.com/' + name + '/pull/' + (pulls.length + 1), state: 'open', draft: body.draft, title: body.title, body: body.body, head: { ref: body.head, sha: branches.get(body.head) }, base: { ref: body.base, sha: branches.get(body.base) } };
      pulls.push(pull); if (api.failAfterPull) { api.failAfterPull = false; throw Error('Lost fixture response'); } return json(pull, 201);
    }
    throw Error('Unexpected fixture route: ' + method + ' ' + path);
  };
  return { env, api };
}

export function manifestFor(files, overrides = {}) {
  return { version: 1, runId: 'coding-task', revision: 1, repository: 'owner/project', baseBranch: 'main', baseSha: hash('pinned fixture commit'), baseTreeSha: hash('tree'), files: treeEntries(files).map(({ type, ...entry }) => entry), excluded: [], ...overrides };
}

export function artifactFor(manifest, changes) {
  return { version: 1, runId: manifest.runId, revision: manifest.revision, repository: manifest.repository, baseSha: manifest.baseSha, changes };
}
