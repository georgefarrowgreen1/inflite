import { repositoryWorkspaceArchive, safeCodingPath, repositoryBlobSha } from './atlas-repository.js';
import { bytesFromBase64, CODING_RESULT_LIMITS } from './atlas-coding-results.js';

const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });
const fail = (code, message, status = 400) => { throw Object.assign(new Error(message), { code, status }); };
export const WORKSPACE_LIMITS = Object.freeze({ files: 5000, fileBytes: 8 * 1024 * 1024, sourceBytes: 32 * 1024 * 1024, archiveBytes: 40 * 1024 * 1024, inflatedBytes: 48 * 1024 * 1024 });
const check = signal => { if (signal?.aborted) fail('request_cancelled', 'The request was stopped.', 499); };

async function abortable(promise, signal) {
  if (!signal) return promise;
  check(signal);
  let listener;
  const aborted = new Promise((_, reject) => { listener = () => reject(Object.assign(new Error('The request was stopped.'), { code: 'request_cancelled', status: 499 })); signal.addEventListener('abort', listener, { once: true }); });
  try { return await Promise.race([promise, aborted]); } finally { signal.removeEventListener('abort', listener); }
}

class BytesReader {
  constructor(stream, limit, signal) { this.reader = stream.getReader(); this.limit = limit; this.signal = signal; this.pending = new Uint8Array(); this.position = 0; this.received = 0; }
  async take(size, allowEnd = false) {
    check(this.signal);
    const result = new Uint8Array(size); let written = 0;
    while (written < size) {
      if (this.position === this.pending.length) {
        const next = await abortable(this.reader.read(), this.signal);
        if (next.done) { if (!written && allowEnd) return null; fail('workspace_archive_invalid', 'The repository archive ended unexpectedly.', 502); }
        this.pending = next.value; this.position = 0; this.received += next.value.byteLength;
        if (this.received > this.limit) fail('workspace_archive_large', 'The repository archive exceeds the workspace size limit.', 413);
      }
      const length = Math.min(size - written, this.pending.length - this.position);
      result.set(this.pending.subarray(this.position, this.position + length), written); this.position += length; written += length;
    }
    return result;
  }
  async close() { try { await this.reader.cancel(); } catch {} this.reader.releaseLock(); }
}

function tarText(header, start, length) {
  const bytes = header.subarray(start, start + length), zero = bytes.indexOf(0);
  try { return decoder.decode(zero < 0 ? bytes : bytes.subarray(0, zero)); } catch { fail('workspace_archive_invalid', 'The repository archive has an invalid path.', 502); }
}
function tarNumber(header, start, length) {
  const raw = tarText(header, start, length).trim();
  if (raw && !/^[0-7]+$/.test(raw)) fail('workspace_archive_invalid', 'The repository archive has an invalid numeric field.', 502);
  const number = raw ? Number.parseInt(raw, 8) : 0;
  if (!Number.isSafeInteger(number) || number < 0) fail('workspace_archive_invalid', 'The repository archive has an invalid size.', 502);
  return number;
}
function tarHeader(header) {
  const expected = tarNumber(header, 148, 8);
  const actual = header.reduce((total, value, index) => total + (index >= 148 && index < 156 ? 32 : value), 0);
  if (expected !== actual) fail('workspace_archive_invalid', 'The repository archive checksum is invalid.', 502);
  const prefix = tarText(header, 345, 155), name = tarText(header, 0, 100);
  return { path: prefix ? prefix + '/' + name : name, size: tarNumber(header, 124, 12), mode: tarNumber(header, 100, 8), type: tarText(header, 156, 1) || '0' };
}
function paxValues(bytes) {
  const result = {}; let offset = 0;
  while (offset < bytes.length) {
    const space = bytes.indexOf(32, offset);
    if (space < offset || space - offset > 8) fail('workspace_archive_invalid', 'The archive extended header is invalid.', 502);
    const lengthText = decoder.decode(bytes.subarray(offset, space));
    if (!/^[1-9][0-9]*$/.test(lengthText)) fail('workspace_archive_invalid', 'The archive extended header is invalid.', 502);
    const length = Number(lengthText), end = offset + length;
    if (end > bytes.length || end <= space + 1 || bytes[end - 1] !== 10) fail('workspace_archive_invalid', 'The archive extended header is invalid.', 502);
    const record = decoder.decode(bytes.subarray(space + 1, end - 1)), equals = record.indexOf('=');
    if (equals <= 0) fail('workspace_archive_invalid', 'The archive extended header is invalid.', 502);
    const key = record.slice(0, equals);
    if (key.startsWith('GNU.sparse') || key === 'linkpath') fail('workspace_archive_invalid', 'Sparse and linked archive entries are unsupported.', 502);
    result[key] = record.slice(equals + 1); offset = end;
  }
  return result;
}
function archivePath(value) {
  if (typeof value !== 'string' || !value || value.startsWith('/') || /[\\\x00-\x1f]/.test(value)) fail('workspace_archive_path', 'The repository archive contains an unsafe path.', 502);
  const parts = value.replace(/\/$/, '').split('/');
  if (parts.some(part => !part || part === '.' || part === '..')) fail('workspace_archive_path', 'The repository archive contains an unsafe path.', 502);
  return parts;
}

// Stream the gzip/tar so a compressed bomb cannot allocate an unbounded body.
// Every retained file is verified against its immutable Git blob, not merely
// the archive's own claimed name, length or permissions.
export async function sanitizeRepositoryArchive(response, snapshot, { signal } = {}) {
  if (!response?.body) fail('workspace_archive_invalid', 'The repository archive has no content.', 502);
  const entries = new Map(), expected = new Map(), excluded = [];
  let sourceBytes = 0;
  for (const row of snapshot.entries || []) {
    if (!row || typeof row.path !== 'string' || entries.has(row.path) || !/^[a-f0-9]{40}$/i.test(row.sha || '')) fail('workspace_tree_invalid', 'The pinned repository tree is invalid.', 502);
    archivePath('root/' + row.path); entries.set(row.path, row);
    if (row.type === 'tree') continue;
    try { safeCodingPath(row.path); } catch { excluded.push({ path: row.path, reason: 'secret_dependency_or_cache' }); continue; }
    if (row.type !== 'blob' || !['100644', '100755'].includes(row.mode)) { excluded.push({ path: row.path, reason: 'symlink_or_submodule' }); continue; }
    if (!Number.isSafeInteger(row.size) || row.size < 0 || row.size > WORKSPACE_LIMITS.fileBytes) fail('workspace_file_large', 'A repository input exceeds the 8 MiB file limit.', 413);
    sourceBytes += row.size; expected.set(row.path, row);
    if (sourceBytes > WORKSPACE_LIMITS.sourceBytes || expected.size > WORKSPACE_LIMITS.files) fail('workspace_repository_large', 'This repository exceeds the coding workspace resource limit.', 413);
  }
  let compressed = 0;
  const bounded = response.body.pipeThrough(new TransformStream({ transform(chunk, controller) {
    compressed += chunk.byteLength;
    if (compressed > WORKSPACE_LIMITS.archiveBytes) fail('workspace_archive_large', 'The compressed repository archive exceeds the workspace size limit.', 413);
    controller.enqueue(chunk);
  } }));
  let stream;
  try { stream = bounded.pipeThrough(new DecompressionStream('gzip')); } catch { fail('workspace_archive_invalid', 'The repository archive is not a supported gzip archive.', 502); }
  const input = new BytesReader(stream, WORKSPACE_LIMITS.inflatedBytes, signal), found = new Map();
  let root = null, extended = {}, longName = null, ended = false;
  try {
    for (;;) {
      const bytes = await input.take(512, true);
      if (!bytes) fail('workspace_archive_invalid', 'The repository archive has no end marker.', 502);
      if (bytes.every(value => value === 0)) {
        const second = await input.take(512);
        if (second.some(value => value !== 0)) fail('workspace_archive_invalid', 'The repository archive has an invalid end marker.', 502);
        ended = true; break;
      }
      const header = tarHeader(bytes);
      if (header.size > WORKSPACE_LIMITS.fileBytes) fail('workspace_file_large', 'A repository archive entry exceeds the 8 MiB file limit.', 413);
      if (['x', 'g', 'L'].includes(header.type) && header.size > 65536) fail('workspace_archive_invalid', 'The archive path metadata is too large.', 502);
      const content = await input.take(header.size), padding = (512 - header.size % 512) % 512;
      if (padding) await input.take(padding);
      if (header.type === 'x' || header.type === 'g') {
        const values = paxValues(content);
        if (header.type === 'g') { if (values.path || values.size) fail('workspace_archive_invalid', 'Global archive paths are unsupported.', 502); }
        else extended = values;
        continue;
      }
      if (header.type === 'L') { longName = decoder.decode(content).replace(/\0+$/, ''); continue; }
      const name = extended.path || longName || header.path;
      if (extended.size !== undefined && (!/^[0-9]+$/.test(extended.size) || Number(extended.size) !== header.size)) fail('workspace_archive_invalid', 'The archive file length is inconsistent.', 502);
      extended = {}; longName = null;
      const parts = archivePath(name);
      if (root === null) root = parts[0];
      if (parts[0] !== root) fail('workspace_archive_path', 'The archive has more than one repository root.', 502);
      if (parts.length === 1) { if (header.type !== '5') fail('workspace_archive_path', 'The archive root is not a directory.', 502); continue; }
      const path = parts.slice(1).join('/');
      if (header.type === '5') continue;
      const entry = entries.get(path);
      if (!entry) fail('workspace_archive_mismatch', 'The archive contains a file outside the pinned repository tree.', 502);
      if (found.has(path)) fail('workspace_archive_mismatch', 'The archive repeats a repository file.', 502);
      if (!expected.has(path)) continue;
      if (header.type !== '0' || header.size !== entry.size || ((header.mode & 0o111) ? '100755' : '100644') !== entry.mode) fail('workspace_archive_mismatch', 'An archive file does not match the pinned repository tree.', 502);
      if (await repositoryBlobSha(content) !== entry.sha.toLowerCase()) fail('workspace_archive_mismatch', 'An archive file failed its pinned Git blob verification.', 502);
      found.set(path, { path, mode: entry.mode, bytes: content });
    }
  } catch (error) {
    if (signal?.aborted) fail('request_cancelled', 'The request was stopped.', 499);
    if (typeof error?.code === 'string' && Number.isInteger(error.status)) throw error;
    fail('workspace_archive_invalid', 'The repository archive could not be decoded.', 502);
  } finally { await input.close(); }
  if (!ended || found.size !== expected.size) fail('workspace_archive_incomplete', 'The archive omits files from the pinned repository. Atlas stopped rather than creating an incomplete workspace.', 502);
  return { files: [...found.values()].sort((a, b) => a.path.localeCompare(b.path)), entries: [...expected.values()].map(({ path, sha, mode, size }) => ({ path, sha: sha.toLowerCase(), mode, size })).sort((a, b) => a.path.localeCompare(b.path)), excluded, sourceBytes };
}

function writeString(header, at, length, value) {
  const bytes = encoder.encode(value);
  if (bytes.length > length) fail('workspace_bundle_invalid', 'The workspace archive header is too long.', 500);
  header.set(bytes, at);
}
function makeHeader(path, size, mode = 0o644, type = '0') {
  const header = new Uint8Array(512);
  writeString(header, 0, 100, path); writeString(header, 100, 8, mode.toString(8).padStart(7, '0') + '\0');
  writeString(header, 108, 8, '0000000\0'); writeString(header, 116, 8, '0000000\0');
  writeString(header, 124, 12, size.toString(8).padStart(11, '0') + '\0'); writeString(header, 136, 12, '00000000000\0');
  header.fill(32, 148, 156); writeString(header, 156, 1, type); writeString(header, 257, 6, 'ustar\0'); writeString(header, 263, 2, '00');
  const checksum = header.reduce((total, byte) => total + byte, 0); writeString(header, 148, 8, checksum.toString(8).padStart(6, '0') + '\0 ');
  return header;
}
function paxPath(path) {
  const body = ' path=' + path + '\n'; let length = encoder.encode(body).length + 1;
  while (length !== encoder.encode(String(length) + body).length) length = encoder.encode(String(length) + body).length;
  return encoder.encode(String(length) + body);
}
export async function createWorkspaceTar(files) {
  const parts = [];
  const append = (path, bytes, mode, type = '0') => { parts.push(makeHeader(path, bytes.length, mode, type), bytes); if (bytes.length % 512) parts.push(new Uint8Array(512 - bytes.length % 512)); };
  for (const [index, file] of files.entries()) {
    if (encoder.encode(file.path).length > 100) { append('PaxHeaders/' + index, paxPath(file.path), 0o644, 'x'); append('entry-' + index, file.bytes, file.mode === '100755' ? 0o755 : 0o644); }
    else append(file.path, file.bytes, file.mode === '100755' ? 0o755 : 0o644);
  }
  parts.push(new Uint8Array(1024));
  const stream = new Blob(parts).stream().pipeThrough(new CompressionStream('gzip'));
  return new Response(stream).blob();
}

export const WORKSPACE_BOOTSTRAP = String.raw`import hashlib, json, os, pathlib, shutil, subprocess
root = pathlib.Path('/workspace')
meta = root / 'atlas'
repo = root / 'repo'
manifest = json.loads((meta / 'manifest.json').read_text())
marker = meta / 'bootstrap.json'
if repo.is_symlink():
    raise RuntimeError('The workspace repository must be a regular directory.')
repo.mkdir(parents=True, exist_ok=True)
if marker.exists():
    prior = json.loads(marker.read_text())
    if prior.get('runId') != manifest['runId'] or prior.get('baseSha') != manifest['baseSha']:
        raise RuntimeError('This workspace belongs to another task.')
    print(json.dumps({'ready': True, 'repository': manifest['repository'], 'baseSha': manifest['baseSha']}))
    raise SystemExit(0)
baseline = meta / 'base'
for entry in manifest['files']:
    source = repo / entry['path']
    if source.is_symlink() or not source.is_file():
        raise RuntimeError('A source file is missing or is not regular: ' + entry['path'])
    content = source.read_bytes()
    sha = hashlib.sha1(b'blob ' + str(len(content)).encode() + b'\0' + content).hexdigest()
    if sha != entry['sha'] or len(content) != entry['size']:
        raise RuntimeError('Pinned source verification failed: ' + entry['path'])
    target = baseline / entry['path']
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, target)
subprocess.run(['git', '-C', str(repo), 'init'], check=True, capture_output=True)
subprocess.run(['git', '-C', str(repo), '-c', 'core.hooksPath=/dev/null', 'add', '--force', '--all'], check=True, capture_output=True)
subprocess.run(['git', '-C', str(repo), '-c', 'core.hooksPath=/dev/null', '-c', 'user.name=Atlas', '-c', 'user.email=atlas@inflite.ai', 'commit', '--no-gpg-sign', '--allow-empty', '-m', 'Atlas pinned workspace baseline'], check=True, capture_output=True)
commit = subprocess.run(['git', '-C', str(repo), 'rev-parse', 'HEAD'], check=True, capture_output=True, text=True).stdout.strip()
if 'restoredFrom' in manifest:
    changes = json.loads((meta / 'recovery.json').read_text())
    for change in changes:
        if change['operation'] != 'delete':
            continue
        target = repo / change['path']
        target.unlink()
        for parent in target.parents:
            if parent == repo or any(parent.iterdir()):
                break
            parent.rmdir()
    for change in changes:
        if change['operation'] == 'delete':
            continue
        source = meta / 'recovery' / change['path']
        target = repo / change['path']
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, target)
    added = [change['path'] for change in changes if change['operation'] == 'add']
    if added:
        subprocess.run(['git', '-C', str(repo), 'add', '--intent-to-add', '--force', '--', *added], check=True, capture_output=True)
marker.write_text(json.dumps({'runId': manifest['runId'], 'baseSha': manifest['baseSha'], 'workspaceCommit': commit}))
print(json.dumps({'ready': True, 'repository': manifest['repository'], 'baseSha': manifest['baseSha'], 'files': len(manifest['files'])}))
`;

export const WORKSPACE_EXPORTER = String.raw`import argparse, base64, hashlib, json, os, pathlib, re, stat, subprocess
parser = argparse.ArgumentParser()
parser.add_argument('--revision', type=int)
args = parser.parse_args()
meta = pathlib.Path('/workspace/atlas')
repo = pathlib.Path('/workspace/repo')
manifest = json.loads((meta / 'manifest.json').read_text())
revision = args.revision if args.revision is not None else manifest['revision']
if revision < 1 or revision > 1000000:
    raise RuntimeError('Invalid review revision.')
def allowed(path):
    parts = path.split('/')
    if not path or len(path) > 500 or path.startswith('/') or re.search(r'[\\\x00-\x1f]', path): return False
    if any(not p or p in ('.', '..', '.git') or re.match(r'^\.env(?:\.|$)', p, re.I) or re.match(r'^(?:id_rsa|id_ed25519|credentials|secrets)(?:\.|$)', p, re.I) for p in parts): return False
    if re.search(r'\.(?:pem|p12|pfx|key|keystore)$', path, re.I): return False
    if any(p.lower() in ('node_modules', '.venv', 'venv', '__pycache__', '.cache', '.next', '.turbo', '.aws', '.ssh', '.gnupg') for p in parts): return False
    if re.search(r'(?:^|/)(?:\.npmrc|\.pypirc|\.netrc|\.git-credentials|\.dev\.vars(?:\..*)?|[^/]*\.tfstate(?:\.backup)?|service[-_]account[^/]*\.json)$', path, re.I): return False
    if re.search(r'(?:^|/)\.(?:docker|kube)/config(?:\.json)?$', path, re.I): return False
    return True
def blob(content):
    return hashlib.sha1(b'blob ' + str(len(content)).encode() + b'\0' + content).hexdigest()
original = {entry['path']: entry for entry in manifest['files']}
# New generated reports/build caches should follow the repository's ignore
# rules. Explicitly staged files are included, and pinned tracked inputs stay
# eligible even when an ignore pattern matches them.
listed = subprocess.run(['git', '-C', str(repo), '-c', 'core.hooksPath=/dev/null', '-c', 'core.fsmonitor=false', 'ls-files', '--cached', '--others', '--exclude-standard', '-z'], check=True, capture_output=True).stdout
eligible = {path.decode('utf-8') for path in listed.split(b'\0') if path}
current = {}
for directory, dirs, files in os.walk(repo, followlinks=False):
    relative = pathlib.Path(directory).relative_to(repo)
    kept = []
    for name in dirs:
        path = (relative / name).as_posix()
        if not allowed(path): continue
        if (pathlib.Path(directory) / name).is_symlink(): raise RuntimeError('Symlink changes are unsupported: ' + path)
        kept.append(name)
    dirs[:] = kept
    for name in files:
        path = (relative / name).as_posix()
        if not allowed(path): continue
        if path not in original and path not in eligible: continue
        file = pathlib.Path(directory) / name
        info = file.lstat()
        if not stat.S_ISREG(info.st_mode): raise RuntimeError('Only regular file changes are supported: ' + path)
        if len(current) >= 10000: raise RuntimeError('The workspace file resource limit was reached.')
        if info.st_size > 8 * 1024 * 1024: raise RuntimeError('A workspace file exceeds the 8 MiB input limit: ' + path)
        current[path] = (file, info)
changes = []
after_total = combined_total = 0
for path in sorted(set(original) | set(current)):
    prior = original.get(path)
    present = current.get(path)
    after = present[0].read_bytes() if present else None
    after_mode = ('100755' if present[1].st_mode & 0o111 else '100644') if present else None
    if prior and after is not None and blob(after) == prior['sha'] and after_mode == prior['mode']: continue
    if after is not None and len(after) > 1024 * 1024: raise RuntimeError('A changed file exceeds the 1 MiB output limit: ' + path)
    before = (meta / 'base' / path).read_bytes() if prior else None
    if prior and (blob(before) != prior['sha'] or len(before) != prior['size']): raise RuntimeError('The original file no longer matches the pinned baseline: ' + path)
    after_total += len(after) if after is not None else 0
    combined_total += (len(after) if after is not None else 0) + (len(before) if before is not None else 0)
    if len(changes) >= 512 or after_total > 16 * 1024 * 1024 or combined_total > 20 * 1024 * 1024: raise RuntimeError('The change artifact resource limit was reached. Keep the workspace and continue with a smaller task.')
    changes.append({'path': path, 'operation': 'delete' if after is None else 'modify' if prior else 'add', 'beforeBase64': base64.b64encode(before).decode() if before is not None else None, 'afterMode': after_mode, 'contentBase64': base64.b64encode(after).decode() if after is not None else None})
artifact = {'version': 1, 'runId': manifest['runId'], 'revision': revision, 'repository': manifest['repository'], 'baseSha': manifest['baseSha'], 'changes': changes}
encoded = json.dumps(artifact, ensure_ascii=False, separators=(',', ':')).encode()
if len(encoded) > 32 * 1024 * 1024: raise RuntimeError('The change artifact exceeds its 32 MiB limit.')
output = pathlib.Path('/workspace/outputs')
output.mkdir(parents=True, exist_ok=True)
temporary = output / 'atlas-changes.json.tmp'
temporary.write_bytes(encoded)
temporary.replace(output / 'atlas-changes.json')
print(json.dumps({'artifact': '/workspace/outputs/atlas-changes.json', 'revision': revision, 'changedFiles': len(changes), 'afterBytes': after_total}))
`;

async function checkpointOverlay(snapshot, entries, checkpoint, changes, signal) {
  const invalid = () => fail('coding_checkpoint_invalid', 'The saved checkpoint does not match the original source. Review the original task before starting again.', 409);
  if (!Array.isArray(changes) || !changes.length || changes.length !== checkpoint.fileCount || changes.length > CODING_RESULT_LIMITS.files) invalid();
  const originals = new Map(entries.map(entry => [entry.path, entry]));
  const pinnedPaths = new Set(snapshot.entries.filter(entry => entry.type !== 'tree').map(entry => entry.path));
  const paths = new Set(pinnedPaths);
  const seen = new Set(), operations = [], files = [];
  let total = 0;
  for (const change of changes) {
    check(signal);
    const { path, operation, beforeSha, beforeMode, afterSha, afterMode, contentBase64 } = change;
    safeCodingPath(path);
    if (seen.has(path) || !['add', 'modify', 'delete'].includes(operation)) invalid();
    seen.add(path);
    const original = originals.get(path);
    if (operation === 'add' ? pinnedPaths.has(path) || beforeSha !== null || beforeMode !== null : !original || original.sha !== beforeSha || original.mode !== beforeMode) invalid();
    operations.push({ path, operation });
    if (operation === 'delete') {
      if (contentBase64 !== null || afterSha !== null || afterMode !== null) invalid();
      paths.delete(path);
      continue;
    }
    const bytes = bytesFromBase64(contentBase64, CODING_RESULT_LIMITS.afterFileBytes);
    total += bytes.length;
    if (total > CODING_RESULT_LIMITS.afterBytes || !['100644', '100755'].includes(afterMode) || await repositoryBlobSha(bytes) !== afterSha) invalid();
    paths.add(path);
    files.push({ path: 'atlas/recovery/' + path, mode: afterMode, bytes });
  }
  for (const path of paths) {
    const parts = path.split('/');
    for (let index = 1; index < parts.length; index++) if (paths.has(parts.slice(0, index).join('/'))) invalid();
  }
  files.push({ path: 'atlas/recovery.json', mode: '100644', bytes: encoder.encode(JSON.stringify(operations)) });
  return files;
}

export async function prepareRepositoryWorkspace(env, owner, { repository, baseBranch, runId, revision = 1, checkpoint, changes }, options = {}) {
  if (typeof runId !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(runId) || !Number.isSafeInteger(revision) || revision < 1 || revision > 1000000) fail('workspace_task_invalid', 'The coding task identifier is invalid.');
  const snapshot = await repositoryWorkspaceArchive(env, owner, { repository, baseBranch: checkpoint?.baseBranch || baseBranch, checkpoint }, options);
  const sanitized = await sanitizeRepositoryArchive(snapshot.response, snapshot, options);
  const manifest = { version: 1, runId, revision, repository, baseBranch: snapshot.baseBranch, baseSha: snapshot.baseSha, baseTreeSha: snapshot.baseTreeSha, files: sanitized.entries, excluded: sanitized.excluded };
  const files = sanitized.files.map(file => ({ ...file, path: 'repo/' + file.path }));
  if (checkpoint) {
    files.push(...await checkpointOverlay(snapshot, sanitized.entries, checkpoint, changes, options.signal));
    manifest.restoredFrom = { runId: checkpoint.runId, revision: checkpoint.revision, fileCount: checkpoint.fileCount, savedAt: checkpoint.savedAt };
  }
  files.push({ path: 'atlas/manifest.json', mode: '100644', bytes: encoder.encode(JSON.stringify(manifest)) }, { path: 'atlas/bootstrap.py', mode: '100644', bytes: encoder.encode(WORKSPACE_BOOTSTRAP) }, { path: 'atlas/export_changes.py', mode: '100644', bytes: encoder.encode(WORKSPACE_EXPORTER) });
  check(options.signal);
  const archive = await createWorkspaceTar(files);
  return { repository, baseBranch: snapshot.baseBranch, baseSha: snapshot.baseSha, baseTreeSha: snapshot.baseTreeSha, runId, revision, manifest, archive, filename: 'atlas-workspace.tar.gz', bootstrapCommand: 'python3 /workspace/atlas/bootstrap.py', exportCommand: 'python3 /workspace/atlas/export_changes.py' };
}
