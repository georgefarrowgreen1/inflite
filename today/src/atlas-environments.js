import { AtlasStoreError } from './atlas-store.js';
import { safeRepository } from './atlas-repository.js';

const VERSION = 8;
const LIMIT = 40;
const FIELDS = new Set(['name', 'repository', 'branch', 'setupCommand', 'testCommand', 'machine', 'network']);
const failure = (code, message, status = 400) => new AtlasStoreError(code, message, status);
const missing = () => { throw failure('not_found', 'This cloud environment is unavailable.', 404); };
const stale = () => { throw failure('environment_changed', 'This environment changed. Reload it before saving your changes.', 409); };
const query = (env, sql, ...args) => env.ATLAS_DB.prepare(sql).bind(...args);

function ownerId(value) {
  if (typeof value !== 'string' || !value || value.length > 256 || /[\x00-\x1f]/.test(value)) throw failure('invalid_owner', 'The cloud environment owner is unavailable.');
  return value;
}
function itemId(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9._:-]{1,256}$/.test(value)) throw failure('invalid_id', 'Invalid cloud environment identifier.');
  return value;
}
function bodyObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw failure('environment_invalid', 'Enter a valid cloud environment configuration.');
  return value;
}
function editableBody(value, { expectedRevision = false } = {}) {
  bodyObject(value);
  if (Object.keys(value).some(key => !FIELDS.has(key) && !(expectedRevision && key === 'expectedRevision'))) throw failure('environment_invalid', 'This environment configuration contains an unsupported setting.');
  return value;
}
function text(value, limit, label, { empty = false, trim = false } = {}) {
  if (typeof value !== 'string' || value.length > limit || /[\x00\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value) || (!empty && !value.trim())) throw failure('environment_invalid', 'Enter a valid ' + label + '.');
  return trim ? value.trim() : value;
}
function branchName(value) {
  const branch = text(value, 200, 'branch', { empty: true, trim: true });
  if (branch && (/[\x00-\x20~^:?*\[\\\x7f]/.test(branch) || branch === '@' || branch.includes('..') || branch.includes('@{') || branch.startsWith('-') || branch.startsWith('/') || branch.endsWith('/') || branch.endsWith('.') || branch.split('/').some(part => !part || part.startsWith('.') || part.endsWith('.lock')))) throw failure('environment_branch_invalid', 'Enter a Git branch name, or leave it blank for the repository default.');
  return branch;
}

/** Recipes contain configuration, never a provider credential or a live session. */
export function normalizeEnvironmentConfig(value) {
  bodyObject(value);
  const name = text(value.name, 80, 'environment name', { trim: true });
  const repository = safeRepository(value.repository);
  const machine = value.machine ?? 'medium', network = value.network ?? 'dependencies';
  if (!['small', 'medium', 'large'].includes(machine)) throw failure('environment_machine_invalid', 'Choose a Small, Medium or Large cloud machine.');
  if (!['dependencies', 'off'].includes(network)) throw failure('environment_network_invalid', 'Choose package downloads or no network access.');
  return {
    name, repository,
    branch: branchName(value.branch ?? ''),
    setupCommand: text(value.setupCommand ?? '', 8000, 'setup command', { empty: true }),
    testCommand: text(value.testCommand ?? '', 8000, 'check command', { empty: true }),
    machine, network,
  };
}

function row(value) {
  return value ? {
    id: value.id, name: value.name, repository: value.repository, branch: value.branch,
    setupCommand: value.setup_command, testCommand: value.test_command,
    machine: value.machine, network: value.network, revision: value.revision,
    createdAt: value.created_at, updatedAt: value.updated_at,
  } : null;
}
async function rows(statement) {
  const result = await statement.all();
  if (result?.success === false) throw failure('environment_storage_unavailable', 'Cloud environments could not be loaded. Try again.', 503);
  return result?.results || [];
}

export async function environmentStorageStatus(env) {
  const unavailable = { ready: false, storageReady: false, requiredVersion: VERSION, code: 'environments_storage_upgrade_required', message: 'Upgrade storage to save cloud environment configurations.' };
  if (!env?.ATLAS_DB) return { ...unavailable, schemaVersion: 0 };
  try {
    const version = await query(env, 'SELECT version FROM atlas_schema WHERE id=1').first();
    const tables = await rows(query(env, "SELECT name FROM sqlite_schema WHERE type='table' AND name='atlas_environments'"));
    const columns = await rows(query(env, 'PRAGMA table_info(atlas_coding_runs)'));
    const ready = version?.version >= VERSION && tables.length === 1 && ['environment_profile_id', 'environment_config_json', 'cloud_status', 'cloud_checked_at', 'retry_from_run_id'].every(name => columns.some(column => column.name === name));
    return ready ? { ready: true, storageReady: true, schemaVersion: version.version, requiredVersion: VERSION } : { ...unavailable, schemaVersion: version?.version || 0 };
  } catch { return { ...unavailable, schemaVersion: 0 }; }
}

async function available(env) {
  const status = await environmentStorageStatus(env);
  if (!status.ready) throw failure(status.code, status.message, 409);
}

export function defaultEnvironment(repository) {
  return { id: null, revision: 1, ...normalizeEnvironmentConfig({ name: 'Default cloud environment', repository }) };
}

export async function listEnvironments(env, owner) {
  ownerId(owner); await available(env);
  return (await rows(query(env, 'SELECT * FROM atlas_environments WHERE owner=? AND archived=0 ORDER BY updated_at DESC,id LIMIT ?', owner, LIMIT))).map(row);
}

export async function getEnvironment(env, owner, id) {
  ownerId(owner); itemId(id); await available(env);
  return row(await query(env, 'SELECT * FROM atlas_environments WHERE owner=? AND id=? AND archived=0', owner, id).first());
}

export async function resolveEnvironment(env, owner, { environmentId, repository }) {
  ownerId(owner); safeRepository(repository);
  if (environmentId == null || environmentId === '') return defaultEnvironment(repository);
  const environment = await getEnvironment(env, owner, environmentId);
  if (!environment) missing();
  if (environment.repository.toLowerCase() !== repository.toLowerCase()) throw failure('environment_repository_mismatch', 'Choose a cloud environment for this repository.', 409);
  return { ...environment, repository };
}

export async function createEnvironment(env, owner, input) {
  ownerId(owner); editableBody(input); await available(env);
  const value = normalizeEnvironmentConfig(input), id = crypto.randomUUID(), now = Date.now();
  const result = await query(env, `INSERT INTO atlas_environments(owner,id,name,repository,branch,setup_command,test_command,machine,network,created_at,updated_at)
    SELECT ?,?,?,?,?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM atlas_environments WHERE owner=? AND archived=0)<? RETURNING *`,
  owner, id, value.name, value.repository, value.branch, value.setupCommand, value.testCommand, value.machine, value.network, now, now, owner, LIMIT).first();
  if (!result) throw failure('environment_limit', 'Archive an unused cloud environment before creating another. You can save up to 40.', 409);
  return row(result);
}

export async function updateEnvironment(env, owner, id, input) {
  editableBody(input, { expectedRevision: true });
  const current = await getEnvironment(env, owner, id); if (!current) missing();
  const expected = input.expectedRevision ?? current.revision;
  if (!Number.isInteger(expected) || expected < 1) throw failure('environment_revision_invalid', 'Reload this environment before saving.', 400);
  if (expected !== current.revision) stale();
  const value = normalizeEnvironmentConfig({ ...current, ...input });
  const result = await query(env, `UPDATE atlas_environments SET name=?,repository=?,branch=?,setup_command=?,test_command=?,machine=?,network=?,revision=revision+1,updated_at=?
    WHERE owner=? AND id=? AND archived=0 AND revision=? RETURNING *`,
  value.name, value.repository, value.branch, value.setupCommand, value.testCommand, value.machine, value.network, Date.now(), owner, id, expected).first();
  if (!result) stale();
  return row(result);
}

export async function archiveEnvironment(env, owner, id) {
  ownerId(owner); itemId(id); await available(env);
  // Keep the configuration record and all immutable run snapshots. This action
  // neither cancels running work nor terminates a reusable hosted workspace.
  const result = await query(env, 'UPDATE atlas_environments SET archived=1,revision=revision+1,updated_at=? WHERE owner=? AND id=? AND archived=0 RETURNING id', Date.now(), owner, id).first();
  if (!result) {
    const existing = await query(env, 'SELECT id FROM atlas_environments WHERE owner=? AND id=? AND archived=1', owner, id).first();
    if (!existing) missing();
  }
  return { removed: true };
}
