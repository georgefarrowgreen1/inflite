import { safeCodingPath, repositoryBlobSha } from './atlas-repository.js';

const encoder = new TextEncoder();
const fail = (code, message, status = 422) => { throw Object.assign(new Error(message), { code, status }); };
export const CODING_RESULT_LIMITS = Object.freeze({ artifactBytes: 32 * 1024 * 1024, files: 512, afterFileBytes: 1024 * 1024, beforeFileBytes: 8 * 1024 * 1024, afterBytes: 16 * 1024 * 1024, combinedBytes: 20 * 1024 * 1024, diffBytes: 256 * 1024, diffTextBytes: 2 * 1024 * 1024, diffLines: 30000 });

export function bytesFromBase64(value, maximum) {
  if (typeof value !== 'string' || value.length > Math.ceil(maximum / 3) * 4 || value.length % 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) fail('coding_result_encoding', 'A changed file has invalid or oversized Base64 content.');
  let raw;
  try { raw = atob(value); } catch { fail('coding_result_encoding', 'A changed file has invalid Base64 content.'); }
  if (raw.length > maximum || btoa(raw) !== value) fail('coding_result_encoding', 'A changed file has invalid or oversized Base64 content.');
  return Uint8Array.from(raw, character => character.charCodeAt(0));
}
function textFrom(bytes) {
  if (bytes === null) return '';
  if (bytes.includes(0)) return null;
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { return null; }
}
function prefix(value, maximum) {
  if (encoder.encode(value).length <= maximum) return value;
  let low = 0, high = Math.min(value.length, maximum);
  while (low < high) { const at = Math.ceil((low + high) / 2); if (encoder.encode(value.slice(0, at)).length <= maximum) low = at; else high = at - 1; }
  if (low && /[\uD800-\uDBFF]/.test(value[low - 1])) low--;
  return value.slice(0, low);
}

// Patience anchors provide contextual hunks in linear working memory. Regions
// without unique anchors use a bounded replacement hunk, not quadratic LCS.
function lineOperations(old, next) {
  const operations = [];
  const append = (kind, value) => operations.push({ kind, value });
  const compare = (a, aEnd, b, bEnd, depth) => {
    while (a < aEnd && b < bEnd && old[a] === next[b]) { append(' ', old[a]); a++; b++; }
    let suffix = 0;
    while (aEnd - suffix > a && bEnd - suffix > b && old[aEnd - suffix - 1] === next[bEnd - suffix - 1]) suffix++;
    const oldEnd = aEnd - suffix, newEnd = bEnd - suffix;
    if (a === oldEnd) { for (let i = b; i < newEnd; i++) append('+', next[i]); }
    else if (b === newEnd) { for (let i = a; i < oldEnd; i++) append('-', old[i]); }
    else {
      const left = new Map(), right = new Map();
      if (depth < 12 && oldEnd - a + newEnd - b <= 100000) {
        for (let i = a; i < oldEnd; i++) left.set(old[i], left.has(old[i]) ? -1 : i);
        for (let i = b; i < newEnd; i++) right.set(next[i], right.has(next[i]) ? -1 : i);
      }
      const pairs = [];
      for (const [line, i] of left) { const j = right.get(line); if (i >= 0 && Number.isInteger(j) && j >= 0) pairs.push([i, j]); }
      pairs.sort((x, y) => x[0] - y[0]);
      const tails = [], prior = [];
      for (let index = 0; index < pairs.length; index++) {
        let low = 0, high = tails.length;
        while (low < high) { const mid = (low + high) >> 1; if (pairs[tails[mid]][1] < pairs[index][1]) low = mid + 1; else high = mid; }
        prior[index] = low ? tails[low - 1] : -1; tails[low] = index;
      }
      const anchors = [];
      for (let at = tails.length ? tails.at(-1) : -1; at >= 0; at = prior[at]) anchors.push(pairs[at]);
      anchors.reverse();
      if (!anchors.length) { for (let i = a; i < oldEnd; i++) append('-', old[i]); for (let i = b; i < newEnd; i++) append('+', next[i]); }
      else {
        let i = a, j = b;
        for (const [x, y] of anchors) { compare(i, x, j, y, depth + 1); append(' ', old[x]); i = x + 1; j = y + 1; }
        compare(i, oldEnd, j, newEnd, depth + 1);
      }
    }
    for (let i = 0; i < suffix; i++) append(' ', old[oldEnd + i]);
  };
  compare(0, old.length, 0, next.length, 0);
  return operations;
}

export function codingFileDiff(path, beforeBytes, afterBytes, { beforeMode, afterMode } = {}) {
  const before = textFrom(beforeBytes), after = textFrom(afterBytes), beforeLabel = beforeBytes === null ? '/dev/null' : 'a/' + path, afterLabel = afterBytes === null ? '/dev/null' : 'b/' + path;
  const header = ['diff --git ' + JSON.stringify('a/' + path) + ' ' + JSON.stringify('b/' + path)];
  if (beforeBytes === null) header.push('new file mode ' + afterMode);
  else if (afterBytes === null) header.push('deleted file mode ' + beforeMode);
  else if (beforeMode !== afterMode) header.push('old mode ' + beforeMode, 'new mode ' + afterMode);
  if (before === null || after === null) return { binary: true, diff: [...header, beforeBytes !== null && afterBytes !== null && beforeBytes.length === afterBytes.length && beforeBytes.every((byte, index) => byte === afterBytes[index]) ? 'Binary content unchanged; file mode changed.' : 'Binary files ' + beforeLabel + ' and ' + afterLabel + ' differ'].join('\n'), diffTruncated: false, addedLines: null, removedLines: null };
  // Line count is bounded before allocating diff objects. Large minified files
  // are still supported; large line counts get an explicit limited preview.
  if ((beforeBytes?.byteLength || 0) + (afterBytes?.byteLength || 0) > CODING_RESULT_LIMITS.diffTextBytes) return { binary: false, diff: [...header, '[Diff preview omitted: the combined source text exceeds 2 MiB. The complete reviewed file content is retained.]'].join('\n'), diffTruncated: true, addedLines: null, removedLines: null };
  let lineCount = 0;
  for (const text of [before, after]) for (let at = 0; at < text.length; at++) if (text[at] === '\n' && ++lineCount > CODING_RESULT_LIMITS.diffLines) return { binary: false, diff: [...header, '[Diff preview omitted: more than 30,000 source lines. The complete reviewed file content is retained.]'].join('\n'), diffTruncated: true, addedLines: null, removedLines: null };
  const lines = text => {
    if (text === '') return [];
    const values = text.split('\n'), terminal = text.endsWith('\n');
    if (terminal) values.pop();
    return values.map((value, index) => value + (terminal || index < values.length - 1 ? '\n' : ''));
  };
  const operations = lineOperations(lines(before), lines(after));
  const changed = [], positions = []; let oldLine = 1, newLine = 1, addedLines = 0, removedLines = 0;
  operations.forEach((operation, index) => {
    positions.push([oldLine, newLine]);
    if (operation.kind !== ' ') changed.push(index);
    if (operation.kind === '+') addedLines++; else oldLine++;
    if (operation.kind === '-') removedLines++; else newLine++;
  });
  const ranges = [];
  for (const index of changed) {
    const start = Math.max(0, index - 3), end = Math.min(operations.length, index + 4), last = ranges.at(-1);
    if (last && start <= last[1]) last[1] = Math.max(last[1], end); else ranges.push([start, end]);
  }
  if (ranges.length) header.push('--- ' + beforeLabel, '+++ ' + afterLabel);
  const result = []; let size = 0, truncated = false;
  const emit = value => {
    const bytes = encoder.encode(value).length + 1;
    if (size + bytes > CODING_RESULT_LIMITS.diffBytes - 100) { const remaining = Math.max(0, CODING_RESULT_LIMITS.diffBytes - size - 100); if (remaining) result.push(prefix(value, remaining)); truncated = true; return false; }
    result.push(value); size += bytes; return true;
  };
  for (const line of header) if (!emit(line)) break;
  outer: for (const [start, end] of ranges) {
    const oldCount = operations.slice(start, end).filter(row => row.kind !== '+').length, newCount = operations.slice(start, end).filter(row => row.kind !== '-').length;
    const oldStart = oldCount ? positions[start][0] : positions[start][0] - 1, newStart = newCount ? positions[start][1] : positions[start][1] - 1;
    if (!emit('@@ -' + oldStart + ',' + oldCount + ' +' + newStart + ',' + newCount + ' @@')) break;
    for (let index = start; index < end; index++) {
      const operation = operations[index], terminated = operation.value.endsWith('\n');
      if (!emit(operation.kind + (terminated ? operation.value.slice(0, -1) : operation.value))) break outer;
      if (!terminated && !emit('\\ No newline at end of file')) break outer;
    }
  }
  if (truncated) result.push('[Diff preview truncated; the complete reviewed file content is retained.]');
  return { binary: false, diff: result.join('\n'), diffTruncated: truncated, addedLines, removedLines };
}

export async function validateCodingArtifact(raw, manifest) {
  let text, artifact;
  try {
    text = raw instanceof Uint8Array ? new TextDecoder('utf-8', { fatal: true }).decode(raw) : typeof raw === 'string' ? raw : JSON.stringify(raw);
    if (typeof text !== 'string' || encoder.encode(text).length > CODING_RESULT_LIMITS.artifactBytes) fail('coding_result_large', 'The coding result exceeds the 32 MiB review limit.', 413);
    artifact = JSON.parse(text);
  } catch (error) { if (error?.code) throw error; fail('coding_result_invalid', 'The coding workspace did not return a readable change artifact.'); }
  if (!artifact || typeof artifact !== 'object' || Array.isArray(artifact) || artifact.version !== 1 || artifact.runId !== manifest.runId || artifact.revision !== manifest.revision || artifact.repository !== manifest.repository || artifact.baseSha !== manifest.baseSha || !Array.isArray(artifact.changes) || artifact.changes.length > CODING_RESULT_LIMITS.files) fail('coding_result_scope', 'This change artifact does not match the task, repository, revision and pinned base.');
  const original = new Map((manifest.files || []).map(file => [file.path, file])), excluded = new Set((manifest.excluded || []).map(file => file.path)), seen = new Set(), files = [];
  let afterTotal = 0, combinedTotal = 0;
  for (const change of artifact.changes) {
    if (!change || typeof change !== 'object' || Array.isArray(change) || !['add', 'modify', 'delete'].includes(change.operation)) fail('coding_result_invalid', 'A proposed file operation is invalid.');
    safeCodingPath(change.path);
    if (seen.has(change.path) || excluded.has(change.path)) fail('coding_result_scope', 'A proposed file is duplicated or was excluded from this workspace.');
    seen.add(change.path);
    const prior = original.get(change.path);
    if (change.operation === 'add' ? !!prior || change.beforeBase64 !== null : !prior) fail('coding_result_scope', 'A proposed file operation does not match the pinned repository tree.');
    const before = prior ? bytesFromBase64(change.beforeBase64, CODING_RESULT_LIMITS.beforeFileBytes) : null;
    if (prior && (before.length !== prior.size || await repositoryBlobSha(before) !== prior.sha.toLowerCase())) fail('coding_result_original_changed', 'The artifact original content does not match the pinned Git blob.');
    let after = null, afterSha = null;
    if (change.operation === 'delete') { if (change.contentBase64 !== null || change.afterMode !== null) fail('coding_result_invalid', 'A deleted file must not contain replacement content.'); }
    else {
      if (!['100644', '100755'].includes(change.afterMode)) fail('coding_result_mode', 'Only regular text and binary files can be included in a coding change.');
      after = bytesFromBase64(change.contentBase64, CODING_RESULT_LIMITS.afterFileBytes); afterSha = await repositoryBlobSha(after);
      if (prior && afterSha === prior.sha.toLowerCase() && change.afterMode === prior.mode) fail('coding_result_no_change', 'The artifact includes an unchanged file. Export the current workspace changes again.');
    }
    afterTotal += after?.length || 0; combinedTotal += (before?.length || 0) + (after?.length || 0);
    if (afterTotal > CODING_RESULT_LIMITS.afterBytes || combinedTotal > CODING_RESULT_LIMITS.combinedBytes) fail('coding_result_large', 'The change artifact exceeds the review resource limit.', 413);
    files.push({ path: change.path, operation: change.operation, beforeSha: prior?.sha || null, beforeMode: prior?.mode || null, afterSha, afterMode: after ? change.afterMode : null, contentBase64: after ? change.contentBase64 : null, beforeBytes: before?.length || 0, afterBytes: after?.length || 0, ...codingFileDiff(change.path, before, after, { beforeMode: prior?.mode, afterMode: change.afterMode }) });
  }
  const finalPaths = new Set(original.keys());
  for (const file of files) { if (file.operation === 'delete') finalPaths.delete(file.path); else finalPaths.add(file.path); }
  for (const path of finalPaths) {
    const parts = path.split('/');
    for (let i = 1; i < parts.length; i++) if (finalPaths.has(parts.slice(0, i).join('/'))) fail('coding_result_path_conflict', 'The proposed changes make a file overlap a directory.');
  }
  const count = kind => files.filter(file => file.operation === kind).length;
  return { files, summary: files.length ? files.length + ' files changed (' + count('add') + ' added, ' + count('modify') + ' modified, ' + count('delete') + ' deleted).' : 'No repository files changed.', changedFiles: files.length, afterBytes: afterTotal };
}
