import { bodyUpTo } from './body.js';
import { encryptIntegration, decryptIntegration } from './atlas-credentials.js';

const PUBLIC_REPOS = ['georgefarrowgreen1/inflite', 'georgefarrowgreen1/georgefarrowgreen', 'georgefarrowgreen1/CHB'];
const API = 'https://api.github.com';
const encoder = new TextEncoder();
const failure = (code, message, status = 400) => Object.assign(new Error(message), { code, status });
const parse = value => { try { return JSON.parse(value || 'null'); } catch { return null; } };
const shaPattern = /^[a-f0-9]{40}$/i;
const idPattern = /^[a-zA-Z0-9_-]{1,80}$/;

export function safeRepository(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/.test(value) || value.split('/').some(x => x === '.' || x === '..')) {
    throw failure('repository_invalid', 'Choose a valid repository.');
  }
  return value;
}

export function safeRepositoryPath(value) {
  if (typeof value !== 'string' || value.length > 500 || !value || value.startsWith('/') || /[\\\x00-\x1f]/.test(value)) throw failure('file_invalid', 'Choose a valid repository file.');
  const parts = value.split('/');
  if (parts.some(x => !x || x === '.' || x === '..' || x === '.git' || /^\.env(?:\.|$)/i.test(x) || /^(?:id_rsa|id_ed25519|credentials|secrets)(?:\.|$)/i.test(x)) || /\.(?:pem|p12|pfx|key|keystore)$/i.test(value)) {
    throw failure('file_private', 'This file is excluded from AI context.');
  }
  return value;
}

function pathURL(path) { return path.split('/').map(encodeURIComponent).join('/'); }
function baseURL(repository) { return '/repos/' + repository; }
function contextURL(repository, ref, path) { return 'https://github.com/' + repository + '/blob/' + ref + '/' + pathURL(path); }

async function integration(env, owner) {
  const row = await env.ATLAS_DB.prepare('SELECT iv,ciphertext,metadata FROM atlas_integrations WHERE owner=? AND kind=?').bind(owner, 'github').first();
  if (!row) return null;
  try { return { token: await decryptIntegration(env, owner, 'github', row), metadata: parse(row.metadata) || {} }; }
  catch { throw failure('github_credential_unreadable', 'Reconnect GitHub to use this saved connection.', 503); }
}

export async function githubStatus(env, owner) {
  const saved = await integration(env, owner);
  return { connected: !!saved, login: saved?.metadata?.login || null, repositories: PUBLIC_REPOS };
}

async function githubFetch(route, { token, send = fetch, signal, method = 'GET', body, accept = 'application/vnd.github+json', limit = 2 * 1024 * 1024, raw = false } = {}) {
  if (!route.startsWith('/') || route.startsWith('//')) throw failure('github_route_invalid', 'The repository request could not be prepared.');
  const headers = { Accept: accept, 'User-Agent': 'InFlite-Atlas', 'X-GitHub-Api-Version': '2022-11-28' };
  if (token) headers.Authorization = 'Bearer ' + token;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  let response;
  try {
    response = await send(API + route, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }), redirect: 'manual', signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000) });
  } catch (error) {
    if (signal?.aborted) throw failure('request_cancelled', 'The request was stopped.', 499);
    throw failure('github_unavailable', 'GitHub could not be reached. Try again.', 503);
  }
  if (raw) return response;
  if (!response.ok) {
    if (response.status === 401) throw failure('github_unauthorized', 'Reconnect GitHub with a valid token.', 401);
    if (response.status === 403 || response.status === 429) throw failure('github_access_or_rate_limit', 'GitHub denied access or reached its request limit. Check the token permissions and try again later.', 403);
    if (response.status === 404) throw failure('github_not_found', 'That repository resource is unavailable to this connection.', 404);
    if (response.status === 409 || response.status === 422) throw failure('github_conflict', 'The repository changed or GitHub could not accept this change. Refresh the patch before publishing.', 409);
    throw failure('github_request_failed', 'GitHub could not complete the request.', 502);
  }
  const text = await bodyUpTo(response, limit);
  if (text === null) throw failure('github_response_large', 'That repository resource is too large to load.', 413);
  if (accept !== 'application/vnd.github+json') return text;
  const data = parse(text);
  if (data === null) throw failure('github_response_invalid', 'GitHub returned an unreadable response.', 502);
  return data;
}

export async function connectGithub(env, owner, token, options = {}) {
  if (typeof token !== 'string' || token.length < 20 || token.length > 1000 || /[\s\x00-\x1f]/.test(token)) throw failure('github_token_invalid', 'Enter a valid GitHub token.');
  const user = await githubFetch('/user', { ...options, token });
  if (typeof user.login !== 'string' || !/^[a-z0-9-]{1,100}$/i.test(user.login)) throw failure('github_response_invalid', 'GitHub could not verify this connection.', 502);
  const encrypted = await encryptIntegration(env, owner, 'github', token);
  const metadata = JSON.stringify({ login: user.login });
  const result = await env.ATLAS_DB.prepare('INSERT INTO atlas_integrations(owner,kind,iv,ciphertext,metadata,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(owner,kind) DO UPDATE SET iv=excluded.iv,ciphertext=excluded.ciphertext,metadata=excluded.metadata,updated_at=excluded.updated_at').bind(owner, 'github', encrypted.iv, encrypted.ciphertext, metadata, Date.now()).run();
  if (result?.success === false) throw failure('github_save_failed', 'GitHub was verified, but its connection could not be saved.', 503);
  return { connected: true, login: user.login };
}

export async function disconnectGithub(env, owner) {
  await env.ATLAS_DB.prepare('DELETE FROM atlas_integrations WHERE owner=? AND kind=?').bind(owner, 'github').run();
  return { connected: false };
}

async function repositoryAccess(env, owner, repository, options = {}) {
  safeRepository(repository);
  const saved = await integration(env, owner);
  if (!saved && !PUBLIC_REPOS.includes(repository)) throw failure('repository_not_allowed', 'Connect GitHub to use this repository.', 403);
  const opts = { ...options, token: saved?.token };
  const repo = await githubFetch(baseURL(repository), opts);
  if (repo.full_name?.toLowerCase() !== repository.toLowerCase()) throw failure('repository_moved', 'This repository moved. Select its current name.', 409);
  return { repo, opts, saved };
}

export async function listRepositories(env, owner, options = {}) {
  const saved = await integration(env, owner);
  if (!saved) return { connected: false, login: null, repositories: PUBLIC_REPOS.map(full_name => ({ full_name, private: false })) };
  const repos = await githubFetch('/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator,organization_member', { ...options, token: saved.token });
  if (!Array.isArray(repos)) throw failure('github_response_invalid', 'GitHub could not list the repositories.', 502);
  return { connected: true, login: saved.metadata.login, repositories: repos.map(r => ({ full_name: r.full_name, private: !!r.private, default_branch: r.default_branch })).filter(r => typeof r.full_name === 'string') };
}

async function resolveRef(repository, ref, repo, opts) {
  if (ref !== undefined && (typeof ref !== 'string' || ref.length > 200 || /[\x00-\x20]/.test(ref))) throw failure('repository_ref_invalid', 'Choose a valid repository revision.');
  const commit = await githubFetch(baseURL(repository) + '/commits/' + encodeURIComponent(ref || repo.default_branch), opts);
  if (!shaPattern.test(commit.sha || '')) throw failure('github_response_invalid', 'GitHub could not identify this revision.', 502);
  return { sha: commit.sha, tree: commit.commit?.tree?.sha, branch: repo.default_branch };
}

export async function repositoryTree(env, owner, { repository, ref }, options = {}) {
  const { repo, opts } = await repositoryAccess(env, owner, repository, options);
  const resolved = await resolveRef(repository, ref, repo, opts);
  const tree = await githubFetch(baseURL(repository) + '/git/trees/' + (resolved.tree || resolved.sha) + '?recursive=1', { ...opts, limit: 4 * 1024 * 1024 });
  const files = (tree.tree || []).filter(row => row.type === 'blob' && row.mode !== '120000' && row.size <= 65536).filter(row => {
    try { safeRepositoryPath(row.path); return !/(?:^|\/)(?:node_modules|vendor|dist|\.next|\.assets)\//.test(row.path); } catch { return false; }
  }).map(row => ({ path: row.path, sha: row.sha, size: row.size })).slice(0, 2000);
  return { repository, ref: resolved.sha, branch: resolved.branch, files, truncated: !!tree.truncated || (tree.tree || []).length > 2000 };
}

export async function repositoryPulls(env, owner, repository, options = {}) {
  const { opts } = await repositoryAccess(env, owner, repository, options);
  const pulls = await githubFetch(baseURL(repository) + '/pulls?state=open&per_page=30', opts);
  if (!Array.isArray(pulls)) throw failure('github_response_invalid', 'GitHub could not list the pull requests.', 502);
  return { pulls: pulls.map(p => ({ number: p.number, title: p.title, head_sha: p.head?.sha, base_sha: p.base?.sha, url: p.html_url })) };
}

export async function repositoryJobs(env, owner, repository, options = {}) {
  const { opts } = await repositoryAccess(env, owner, repository, options);
  const runs = await githubFetch(baseURL(repository) + '/actions/runs?per_page=5', opts);
  const jobs = [];
  for (const run of (runs.workflow_runs || []).slice(0, 3)) {
    const data = await githubFetch(baseURL(repository) + '/actions/runs/' + run.id + '/jobs?per_page=30', opts);
    for (const job of data.jobs || []) jobs.push({ id: job.id, name: job.name, status: job.status, conclusion: job.conclusion, head_sha: job.head_sha || run.head_sha, url: job.html_url });
  }
  return { jobs };
}

async function fileContext(repository, path, resolved, opts) {
  safeRepositoryPath(path);
  const tree = resolved.entries || await githubFetch(baseURL(repository) + '/git/trees/' + (resolved.tree || resolved.sha) + '?recursive=1', { ...opts, limit: 4 * 1024 * 1024 });
  const entry = (tree.tree || []).find(item => item.path === path);
  if (!entry || entry.type !== 'blob' || !['100644', '100755'].includes(entry.mode)) throw failure('file_not_text', 'Choose a regular repository text file.');
  const data = await githubFetch(baseURL(repository) + '/contents/' + pathURL(path) + '?ref=' + resolved.sha, { ...opts, limit: 150000 });
  if (data.type !== 'file' || data.encoding !== 'base64' || data.size > 65536 || typeof data.content !== 'string' || !shaPattern.test(data.sha || '')) throw failure('file_not_text', 'Choose a text file smaller than 64 KB.', 413);
  if (data.sha !== entry.sha) throw failure('file_revision_changed', 'The file revision could not be verified. Refresh the repository.', 409);
  let text;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(atob(data.content.replace(/\s/g, '')), c => c.charCodeAt(0))); } catch { throw failure('file_not_text', 'This file is not readable UTF-8 text.'); }
  if (text.includes('\0') || encoder.encode(text).length > 65536) throw failure('file_not_text', 'Choose a text file smaller than 64 KB.', 413);
  return { kind: 'file', repository, path, ref: resolved.sha, blobSha: data.sha, mode: entry.mode, title: path, url: contextURL(repository, resolved.sha, path), text, truncated: false };
}

export async function repositoryContext(env, owner, selection, options = {}) {
  const { repository, kind } = selection;
  const { repo, opts } = await repositoryAccess(env, owner, repository, options);
  if (kind === 'file') return fileContext(repository, selection.path, await resolveRef(repository, selection.ref, repo, opts), opts);
  if (kind === 'pull') {
    if (!Number.isSafeInteger(Number(selection.number)) || Number(selection.number) < 1) throw failure('pull_invalid', 'Choose a valid pull request.');
    const number = Number(selection.number);
    const pull = await githubFetch(baseURL(repository) + '/pulls/' + number, opts);
    if (!shaPattern.test(pull.head?.sha || '') || !shaPattern.test(pull.base?.sha || '')) throw failure('github_response_invalid', 'GitHub could not identify this pull request revision.', 502);
    const files = await githubFetch(baseURL(repository) + '/pulls/' + number + '/files?per_page=50', { ...opts, limit: 1024 * 1024 });
    if (!Array.isArray(files)) throw failure('github_response_invalid', 'GitHub could not read the pull request changes.', 502);
    const verified = await githubFetch(baseURL(repository) + '/pulls/' + number, opts);
    if (verified.head?.sha !== pull.head.sha || verified.base?.sha !== pull.base.sha) throw failure('pull_revision_changed', 'This pull request changed while it was being read. Attach it again.', 409);
    const selected = files.filter(f => { try { safeRepositoryPath(f.filename); return true; } catch { return false; } });
    const text = ['Pull request #' + number + ': ' + pull.title, 'Head commit: ' + pull.head?.sha, String(pull.body || '').slice(0, 6000), ...selected.map(f => '\nFile: ' + f.filename + '\n' + (f.patch || '[Diff unavailable for this file]'))].join('\n');
    return { kind, repository, number, ref: pull.head?.sha, title: 'PR #' + number + ': ' + pull.title, url: pull.html_url, text: text.slice(0, 50000), truncated: text.length > 50000 || pull.changed_files > files.length };
  }
  if (kind === 'job') {
    const id = Number(selection.id);
    if (!Number.isSafeInteger(id) || id < 1) throw failure('job_invalid', 'Choose a valid workflow job.');
    const job = await githubFetch(baseURL(repository) + '/actions/jobs/' + id, opts);
    let text = ['Job: ' + job.name, 'Commit: ' + job.head_sha, 'Status: ' + job.status + ' / ' + job.conclusion, ...(job.steps || []).map(s => s.name + ': ' + s.conclusion)].join('\n');
    let truncated = false;
    if (job.status === 'completed') {
      const response = await githubFetch(baseURL(repository) + '/actions/jobs/' + id + '/logs', { ...opts, raw: true });
      if (response.status === 302) {
        const location = response.headers.get('Location');
        let url;
        try { url = new URL(location); } catch { throw failure('github_logs_unavailable', 'The job log download is unavailable.', 502); }
        if (url.protocol !== 'https:' || url.username || url.password || url.port || !(/(^|\.)actions\.githubusercontent\.com$/i.test(url.hostname) || /\.blob\.core\.windows\.net$/i.test(url.hostname) || /\.githubusercontent\.com$/i.test(url.hostname))) throw failure('github_log_redirect', 'GitHub returned an unexpected log download address.', 502);
        // Signed log downloads never receive the GitHub bearer token or cookies.
        let download;
        try { download = await (options.send || fetch)(url.href, { redirect: 'manual', credentials: 'omit', signal: options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000) }); }
        catch { throw failure(options.signal?.aborted ? 'request_cancelled' : 'github_logs_unavailable', options.signal?.aborted ? 'The request was stopped.' : 'The job logs could not be downloaded.', options.signal?.aborted ? 499 : 502); }
        if (!download.ok) throw failure('github_logs_unavailable', 'The job logs could not be downloaded.', 502);
        const logs = await bodyUpTo(download, 512 * 1024);
        if (logs === null) throw failure('github_logs_large', 'This job log is too large. Select a smaller job or paste the relevant failure.', 413);
        text += '\n\n' + logs.slice(-50000);
        truncated = logs.length > 50000;
      } else if (response.ok) {
        const logs = await bodyUpTo(response, 512 * 1024);
        if (logs === null) throw failure('github_logs_large', 'This job log is too large.', 413);
        text += '\n\n' + logs.slice(-50000); truncated = logs.length > 50000;
      } else if (response.status !== 404) throw failure('github_logs_unavailable', 'GitHub could not provide this job log.', 502);
    }
    return { kind, repository, id, ref: job.head_sha, title: job.name + ' (' + (job.conclusion || job.status) + ')', url: job.html_url, text, truncated };
  }
  throw failure('context_invalid', 'Choose a repository file, pull request or workflow job.');
}

export async function loadRepositorySelections(env, owner, repository, selections = [], options = {}) {
  if (!Array.isArray(selections) || selections.length > 6) throw failure('context_limit', 'Attach up to six repository sources.');
  if (selections.some(s => !s || s.repository !== repository)) throw failure('context_repository_mismatch', 'The attached context must belong to this conversation’s repository.');
  const contexts = [];
  let total = 0;
  for (const selection of selections) {
    const item = await repositoryContext(env, owner, selection, options);
    total += item.text.length;
    if (total > 100000) throw failure('context_limit', 'The attached context is too large. Select fewer files or smaller logs.', 413);
    contexts.push(item);
  }
  return contexts;
}

export async function patchInputs(env, owner, { repository, paths, ref }, options = {}) {
  if (!Array.isArray(paths) || paths.length < 1 || paths.length > 5 || new Set(paths).size !== paths.length) throw failure('patch_files_invalid', 'Select one to five files for this patch.');
  for (const path of paths) {
    safeRepositoryPath(path);
    if (path.startsWith('.github/workflows/')) throw failure('patch_workflow_restricted', 'Workflow changes require a separate repository review.');
  }
  const { repo, opts } = await repositoryAccess(env, owner, repository, options);
  const resolved = await resolveRef(repository, ref, repo, opts);
  const files = [];
  for (const path of paths) files.push(await fileContext(repository, path, resolved, opts));
  if (files.reduce((sum, f) => sum + f.text.length, 0) > 80000) throw failure('patch_files_large', 'Select fewer or smaller files for this patch.', 413);
  return { repository, baseSha: resolved.sha, baseBranch: resolved.branch, files };
}

export function validatePatchOutput(output, inputs) {
  const data = typeof output === 'string' ? parse(output) : output;
  if (!data || typeof data.title !== 'string' || !data.title.trim() || data.title.length > 160 || typeof data.summary !== 'string' || data.summary.length > 10000 || !Array.isArray(data.files) || !data.files.length || data.files.length > inputs.files.length || typeof data.testPlan !== 'string' || data.testPlan.length > 12000) throw failure('patch_output_invalid', 'The model did not produce a complete patch. Try a smaller change.', 502);
  const allowed = new Map(inputs.files.map(f => [f.path, f]));
  const seen = new Set();
  const files = data.files.map(file => {
    if (!file || typeof file !== 'object' || Array.isArray(file)) throw failure('patch_scope_invalid', 'The proposed patch contains an invalid file.', 502);
    const original = allowed.get(file.path);
    if (!original || seen.has(file.path) || typeof file.content !== 'string' || encoder.encode(file.content).length > 100000 || file.content.includes('\0')) throw failure('patch_scope_invalid', 'The proposed patch changed files outside the selected scope.', 502);
    seen.add(file.path);
    return { path: file.path, before: original.text, after: file.content, beforeSha: original.blobSha, mode: original.mode, diff: fullFileDiff(file.path, original.text, file.content) };
  }).filter(f => f.before !== f.after);
  if (!files.length) throw failure('patch_no_changes', 'The model proposed no file changes.', 422);
  return { title: data.title.trim(), summary: data.summary, files, testPlan: data.testPlan, repository: inputs.repository, baseSha: inputs.baseSha, baseBranch: inputs.baseBranch };
}

function fullFileDiff(path, before, after) {
  const old = before.split('\n'), next = after.split('\n');
  return ['--- a/' + path, '+++ b/' + path, '@@ -1,' + old.length + ' +1,' + next.length + ' @@', ...old.map(l => '-' + l), ...next.map(l => '+' + l)].join('\n');
}

function patchRow(row) {
  return row && { id: row.id, conversationId: row.conversation_id, repository: row.repository, baseSha: row.base_sha, title: row.title, summary: row.summary, files: parse(row.files_json) || [], testPlan: row.test_plan, status: row.status, url: row.url, number: row.number, created_at: row.created_at, updated_at: row.updated_at };
}

export async function savePatch(env, owner, conversationId, patch, id = crypto.randomUUID()) {
  if (!idPattern.test(id)) throw failure('patch_invalid', 'The patch identifier is invalid.');
  const conversation = await env.ATLAS_DB.prepare('SELECT mode,repository FROM atlas_conversations WHERE owner=? AND id=?').bind(owner, conversationId).first();
  if (!conversation || conversation.mode !== 'developer' || conversation.repository !== patch.repository) throw failure('patch_conversation_invalid', 'Choose a Developer conversation for this repository.', 404);
  validateStoredPatch(patch);
  const now = Date.now();
  const files = JSON.stringify(patch.files.map(f => ({ ...f, baseBranch: patch.baseBranch })));
  await env.ATLAS_DB.prepare('INSERT INTO atlas_patches(id,owner,conversation_id,repository,base_sha,title,summary,files_json,test_plan,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').bind(id, owner, conversationId, patch.repository, patch.baseSha, patch.title, patch.summary, files, patch.testPlan, 'draft', now, now).run();
  return getPatch(env, owner, id);
}

function validateStoredPatch(patch) {
  safeRepository(patch.repository);
  if (!shaPattern.test(patch.baseSha || '') || !Array.isArray(patch.files) || !patch.files.length || patch.files.length > 5 || new Set(patch.files.map(f => f?.path)).size !== patch.files.length) throw failure('patch_invalid', 'Prepare a fresh patch before publishing.', 409);
  for (const file of patch.files) {
    safeRepositoryPath(file?.path);
    if (file.path.startsWith('.github/workflows/') || !['100644', '100755'].includes(file.mode) || !shaPattern.test(file.beforeSha || '') || typeof file.before !== 'string' || typeof file.after !== 'string' || encoder.encode(file.after).length > 100000 || file.after.includes('\0')) throw failure('patch_invalid', 'The patch contains an unsupported file. Prepare it again.', 409);
  }
}

function verifiedPull(pr, { repository, branch, branchCommit, baseBranch, baseSha }) {
  if (pr?.draft !== true || pr?.state !== 'open' || pr.head?.sha !== branchCommit || pr.head?.ref !== branch || pr.base?.ref !== baseBranch || pr.base?.sha !== baseSha || !Number.isSafeInteger(pr.number) || pr.number < 1) throw failure('patch_pr_conflict', 'The pull request no longer matches this draft. Review it on GitHub before trying again.', 409);
  const expected = 'https://github.com/' + repository + '/pull/' + pr.number;
  let url;
  try { url = new URL(pr.html_url); } catch { throw failure('github_response_invalid', 'GitHub did not return the draft pull request address.', 502); }
  if (url.href.toLowerCase() !== expected.toLowerCase()) throw failure('github_response_invalid', 'GitHub returned an unexpected pull request address.', 502);
  return { url: expected, number: pr.number };
}

export async function getPatch(env, owner, id) {
  if (!idPattern.test(id)) return null;
  return patchRow(await env.ATLAS_DB.prepare('SELECT * FROM atlas_patches WHERE owner=? AND id=?').bind(owner, id).first());
}

export async function listPatches(env, owner) {
  const { results } = await env.ATLAS_DB.prepare('SELECT id,conversation_id,repository,base_sha,title,summary,test_plan,status,url,number,created_at,updated_at FROM atlas_patches WHERE owner=? ORDER BY created_at DESC LIMIT 50').bind(owner).all();
  return results.map(patchRow);
}

export async function publishPatch(env, owner, id, options = {}) {
  const patch = await getPatch(env, owner, id);
  if (!patch) throw failure('patch_not_found', 'That patch could not be found.', 404);
  if (patch.status === 'published' && patch.url) return { url: patch.url, number: patch.number };
  validateStoredPatch(patch);
  // Bound the complete operation below the publication lease, including all
  // preflight reads. A retry can then recover the deterministic branch safely.
  const deadline = AbortSignal.timeout(90000);
  const { repo, opts, saved } = await repositoryAccess(env, owner, patch.repository, { ...options, signal: options.signal ? AbortSignal.any([options.signal, deadline]) : deadline });
  if (!saved || repo.permissions?.push !== true) throw failure('github_write_required', 'Connect a GitHub token with Contents and Pull requests write access to publish this draft.', 403);
  const baseBranch = patch.files[0]?.baseBranch || repo.default_branch;
  const current = await resolveRef(patch.repository, baseBranch, repo, opts);
  if (current.sha !== patch.baseSha) throw failure('patch_base_changed', 'The repository has changed. Prepare a fresh patch before publishing.', 409);
  const now = Date.now();
  const claim = await env.ATLAS_DB.prepare("UPDATE atlas_patches SET status='publishing',updated_at=? WHERE owner=? AND id=? AND (status IN ('draft','failed') OR (status='publishing' AND updated_at<?)) RETURNING id").bind(now, owner, id, now - 120000).first();
  if (!claim) throw failure('patch_publish_pending', 'This patch is already being published. Refresh its status shortly.', 409);
  const branch = 'atlas/' + id;
  try {
    const base = await githubFetch(baseURL(patch.repository) + '/git/commits/' + patch.baseSha, opts);
    if (!shaPattern.test(base.tree?.sha || '')) throw failure('github_response_invalid', 'GitHub could not verify the original repository tree.', 502);
    const entries = await githubFetch(baseURL(patch.repository) + '/git/trees/' + base.tree.sha + '?recursive=1', { ...opts, limit: 4 * 1024 * 1024 });
    for (const file of patch.files) {
      const original = await fileContext(patch.repository, file.path, { sha: patch.baseSha, tree: base.tree.sha, entries }, opts);
      if (original.text !== file.before || original.blobSha !== file.beforeSha || original.mode !== file.mode) throw failure('patch_original_changed', 'The approved file content could not be verified. Prepare a fresh patch.', 409);
    }
    // The resulting tree identifies the whole repository. Comparing this SHA
    // catches unselected file additions, deletions and mode changes on a retry;
    // checking only the selected files would miss those changes.
    const expectedTree = await githubFetch(baseURL(patch.repository) + '/git/trees', { ...opts, method: 'POST', body: { base_tree: base.tree.sha, tree: patch.files.map(f => ({ path: f.path, mode: f.mode, type: 'blob', content: f.after })) } });
    if (!shaPattern.test(expectedTree.sha || '')) throw failure('github_response_invalid', 'GitHub could not verify the proposed repository tree.', 502);
    let branchCommit;
    const existing = await githubFetch(baseURL(patch.repository) + '/git/ref/heads/' + pathURL(branch), { ...opts, raw: true });
    if (existing.ok) {
      const text = await bodyUpTo(existing, 20000), ref = parse(text);
      branchCommit = ref?.object?.sha;
      if (!shaPattern.test(branchCommit || '')) throw failure('patch_branch_conflict', 'The draft branch could not be verified.', 409);
      const commit = await githubFetch(baseURL(patch.repository) + '/git/commits/' + branchCommit, opts);
      if (commit.parents?.length !== 1 || commit.parents[0].sha !== patch.baseSha || commit.message !== 'Atlas patch ' + id + '\n\n' + patch.title || commit.tree?.sha !== expectedTree.sha) throw failure('patch_branch_conflict', 'The draft branch was changed. Prepare a fresh patch.', 409);
    } else {
      if (existing.status !== 404) throw failure('github_request_failed', 'GitHub could not inspect the draft branch.', 502);
      const commit = await githubFetch(baseURL(patch.repository) + '/git/commits', { ...opts, method: 'POST', body: { message: 'Atlas patch ' + id + '\n\n' + patch.title, tree: expectedTree.sha, parents: [patch.baseSha] } });
      branchCommit = commit.sha;
      if (!shaPattern.test(branchCommit || '')) throw failure('github_response_invalid', 'GitHub could not verify the draft commit.', 502);
      await githubFetch(baseURL(patch.repository) + '/git/refs', { ...opts, method: 'POST', body: { ref: 'refs/heads/' + branch, sha: branchCommit } });
    }
    const latest = await resolveRef(patch.repository, baseBranch, repo, opts);
    if (latest.sha !== patch.baseSha) throw failure('patch_base_changed', 'The repository changed during publication. Prepare a fresh patch before publishing.', 409);
    const verifiedBranch = await githubFetch(baseURL(patch.repository) + '/git/ref/heads/' + pathURL(branch), opts);
    if (verifiedBranch.object?.sha !== branchCommit) throw failure('patch_branch_conflict', 'The draft branch changed during publication. Prepare a fresh patch.', 409);
    const ownerName = patch.repository.split('/')[0];
    const matching = await githubFetch(baseURL(patch.repository) + '/pulls?state=open&head=' + encodeURIComponent(ownerName + ':' + branch) + '&base=' + encodeURIComponent(baseBranch), opts);
    if (!Array.isArray(matching)) throw failure('github_response_invalid', 'GitHub could not verify existing pull requests.', 502);
    let pr = matching.find(p => p.head?.sha === branchCommit);
    if (!pr) pr = await githubFetch(baseURL(patch.repository) + '/pulls', { ...opts, method: 'POST', body: { title: patch.title, head: branch, base: baseBranch, draft: true, body: patch.summary + '\n\n## Validation plan\n\n' + patch.testPlan + '\n\nPrepared in Atlas against ' + patch.baseSha + '. Tests have not been executed by Atlas; review and CI are required before merging.' } });
    const result = verifiedPull(pr, { repository: patch.repository, branch, branchCommit, baseBranch, baseSha: patch.baseSha });
    const savedPatch = await env.ATLAS_DB.prepare("UPDATE atlas_patches SET status='published',url=?,number=?,updated_at=? WHERE owner=? AND id=? AND status='publishing' AND updated_at=? RETURNING id").bind(result.url, result.number, Date.now(), owner, id, now).first();
    if (!savedPatch) throw failure('patch_publish_pending', 'The draft was created, but its saved status changed. Refresh this patch before retrying.', 409);
    return result;
  } catch (error) {
    await env.ATLAS_DB.prepare("UPDATE atlas_patches SET status='failed',updated_at=? WHERE owner=? AND id=? AND status='publishing' AND updated_at=?").bind(Date.now(), owner, id, now).run();
    throw error;
  }
}
