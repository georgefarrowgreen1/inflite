import { AtlasStoreError } from './atlas-store.js';

const shell = { repository: 'georgefarrowgreen1/inflite', branch: 'claude/inflite' };
const apps = { repository: 'georgefarrowgreen1/georgefarrowgreen', branch: 'main' };
const projects = new Map([
  ...['today', 'mail'].map(service => [service, shell]),
  ...['chat', 'weather', 'fitness', 'markets', 'auth', 'account', 'home', 'notify', 'wxtick', 'garmin', 'mkttick', 'morning'].map(service => [service, apps]),
]);

// Automatic edits are restricted to audited feature files with an existing
// test command. Unlisted services can receive a diagnosis. Tests, auth,
// release configuration, monitoring and the repair policy cannot be edited.
const rules = new Map([
  ['today', { files: ['today/src/london-weather.js'], test: 'node --test tests/extra-apps.test.cjs' }],
  ['mail', { files: ['email/src/threads.js', 'email/src/followups.js'], test: 'node --test tests/mail-intelligence.test.cjs' }],
  ['chat', { files: ['functions/_todaychat.js'], test: 'node --test .tools/tests/unit/todaycards.test.mjs' }],
  ['weather', { files: ['functions/_wxwarn.js'], test: 'node --test .tools/tests/unit/wxwarn.test.mjs' }],
  ['fitness', { files: ['functions/_fitroutechoices.js'], test: 'node --test .tools/tests/unit/fitroutechoices.test.mjs' }],
  ['markets', { files: ['functions/_todaymkt.js'], test: 'node --test .tools/tests/unit/todaymarkets.test.mjs' }],
]);

export const isRepairService = service => projects.has(service);

export function repairProject(services) {
  if (!Array.isArray(services)) return null;
  const mapped = services.map(service => projects.get(service));
  return mapped[0] && mapped.every(project => project === mapped[0]) ? mapped[0] : null;
}

export function repairRules(repository, services) {
  if (!Array.isArray(services) || repairProject(services)?.repository !== repository) return [];
  return [...new Set(services.map(service => rules.get(service)).filter(Boolean))];
}

function recordedSuccess(checks, command) {
  // Accept the exact invocation and the managed runner's equivalent shell
  // representation. Compound commands and model-written summaries are not proof.
  const allowed = [command, `/bin/bash -lc '${command}'`, `/bin/bash -lc "${command}"`];
  const last = checks.findLast(check => check.source === 'provider_command_execution' &&
    check.cwd === '/workspace/repo' && allowed.includes(check.command?.trim()));
  const output = last?.output?.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '') || '';
  return last?.status === 'completed' && last.exitCode === 0 && !last.truncated && !last.outputTruncated && /^(?:#|ℹ) pass [1-9]\d*\s*$/m.test(output);
}

export const REPAIR_VALIDATION_UNAVAILABLE = 'Atlas needs verified test results for these exact changes before it can create a draft pull request.';

export function assertRepairScope(run, files) {
  if (!run.environment.incident || !files.length) return [];
  const services = run.environment.incidentServices;
  if (run.environment.network !== 'off' || run.base_branch !== repairProject(services)?.branch) {
    throw new AtlasStoreError('repair_scope_blocked', 'This repair needs the approved branch and isolated workspace before it can be reviewed.', 409);
  }
  const scope = repairRules(run.repository, services);
  const changedRules = scope.filter(rule => files.some(file => rule.files.includes(file.path)));
  const allowedPaths = new Set(changedRules.flatMap(rule => rule.files));
  let changedLines = 0;
  for (const file of files) {
    if (!allowedPaths.has(file.path) || file.operation !== 'modify' || file.binary ||
        file.beforeMode !== '100644' || file.afterMode !== '100644') {
      throw new AtlasStoreError('repair_scope_blocked', 'This incident needs changes outside the files approved for automatic repair.', 409);
    }
    if (file.diffTruncated || !Number.isInteger(file.addedLines) || !Number.isInteger(file.removedLines)) {
      throw new AtlasStoreError('repair_diff_unavailable', 'Atlas needs a complete text diff before this change can be reviewed.', 409);
    }
    changedLines += file.addedLines + file.removedLines;
  }
  if (changedLines > 300) {
    throw new AtlasStoreError('repair_scope_blocked', 'This change exceeds the automatic repair scope.', 409);
  }
  return changedRules;
}

export function assertRepairCandidate(run, files) {
  const changedRules = assertRepairScope(run, files);
  if (!changedRules.length) return;
  if (changedRules.some(rule => !recordedSuccess(run.checks, rule.test))) {
    throw new AtlasStoreError('repair_checks_required', 'The approved repository tests must pass before this repair can be published.', 409);
  }
  // The hosted API exposes command records and an export independently. Their
  // shared turn ID does not attest which file contents the command tested.
  throw new AtlasStoreError('repair_candidate_unverified', REPAIR_VALIDATION_UNAVAILABLE, 409);
}
