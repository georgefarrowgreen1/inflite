// Project only documented saved-item fields into the Atlas UI. An assistant
// statement or a function-call result is not evidence that a command ran.
// https://developers.openai.com/api/reference/resources/beta/subresources/agents/subresources/sessions/subresources/items/methods/list
const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });
const ID = /^[a-zA-Z0-9_-]{1,256}$/;
const OUTPUT_STATUSES = new Set(["in_progress", "completed", "incomplete"]);
const CALL_STATUSES = new Set([...OUTPUT_STATUSES, "failed"]);
const terminal = status => status === "completed" || status === "failed" || status === "incomplete";
const validId = value => typeof value === "string" && ID.test(value);
const integer = value => Number.isSafeInteger(value) ? value : null;
const limit = (value, fallback, maximum) => Number.isSafeInteger(value) && value >= 0 ? Math.min(maximum, value) : fallback;

function cleanText(value) {
  if (typeof value !== "string") return "";
  // Terminal presentation codes should not become hidden text or links in a
  // browser log. The caller must still render these plain strings as text.
  return value.replace(/\x1b\][^\x07]*(?:\x07|\x1b\\)/g, "")
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "")
    .replace(/\r\n?/g, "\n")
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]/g, "");
}

function validSlice(bytes, size, tail) {
  if (size <= 0) return "";
  // UTF-8 sequences have at most four bytes. Trim a boundary rather than
  // inserting replacement characters that could exceed the byte allowance.
  for (let trim = 0; trim < 4 && trim <= size; trim++) {
    try { return decoder.decode(tail ? bytes.subarray(bytes.length - size + trim) : bytes.subarray(0, size - trim)); }
    catch { /* Try the next complete code point. */ }
  }
  return "";
}

function clipped(value, maxBytes, tail = false) {
  const text = cleanText(value);
  const bytes = encoder.encode(text);
  if (bytes.byteLength <= maxBytes) return { text, truncated: false, bytes: bytes.byteLength };
  const result = validSlice(bytes, maxBytes, tail);
  return { text: result, truncated: true, bytes: encoder.encode(result).byteLength };
}

function messageText(item, maxBytes) {
  let remaining = maxBytes, text = "", truncated = false;
  for (const part of Array.isArray(item.content) ? item.content : []) {
    if (part?.type !== "output_text" || typeof part.text !== "string") continue;
    const separator = text ? "\n" : "";
    if (remaining < separator.length) { truncated = true; break; }
    const result = clipped(part.text, remaining - separator.length);
    text += separator + result.text;
    remaining -= result.bytes + separator.length;
    truncated ||= result.truncated;
  }
  return { text, truncated };
}

function commandResult(item, commandLimit) {
  if (!validId(item.id) || typeof item.command !== "string" || !CALL_STATUSES.has(item.status)) return null;
  const command = clipped(item.command, commandLimit);
  const cwd = item.cwd === null ? null : typeof item.cwd === "string" ? clipped(item.cwd, 2048).text : null;
  const exitCode = integer(item.exit_code);
  const duration = integer(item.duration_ms);
  let outcome = "unknown";
  if (item.status === "in_progress") outcome = "running";
  else if (item.status === "failed") outcome = "failed";
  else if (item.status === "completed" && exitCode !== null) outcome = exitCode === 0 ? "succeeded" : "failed";
  return {
    id: item.id,
    turnId: item.turn_id,
    command: command.text,
    cwd,
    status: item.status,
    exitCode,
    durationMs: duration !== null && duration >= 0 ? duration : null,
    outcome,
    source: "provider_command_execution",
    output: typeof item.output === "string" ? item.output : null,
    truncated: command.truncated,
    outputTruncated: false,
  };
}

/**
 * Normalize one root turn's saved items. Pass all fetched pages in ascending
 * order, or the API page plus order:"desc". When pagination stops early, pass
 * historyIncomplete:true. Limits bound the displayed evidence, not execution.
 *
 * "succeeded" means this process completed with exit code zero. It does not
 * claim the command was a test or that the repository is correct.
 */
export function normalizeAgentItems(itemsOrPage, options = {}) {
  const { turnId } = options;
  if (!validId(turnId)) throw new TypeError("A valid coding turn ID is required.");
  const isPage = itemsOrPage && typeof itemsOrPage === "object" && !Array.isArray(itemsOrPage);
  const received = Array.isArray(itemsOrPage) ? itemsOrPage : Array.isArray(itemsOrPage?.data) ? itemsOrPage.data : [];
  const incompleteHistory = options.historyIncomplete === true || (isPage && itemsOrPage.has_more === true);
  const maxActivity = limit(options.maxActivity, 60, 200);
  const maxCommands = limit(options.maxCommands, 80, 200);
  const maxOutputBytes = limit(options.maxOutputBytes, 64 * 1024, 1024 * 1024);
  const maxSummaryBytes = limit(options.maxSummaryBytes, 16 * 1024, 64 * 1024);
  const maxCommandBytes = limit(options.maxCommandBytes, 2048, 8192);
  const maxItemOutputBytes = limit(options.maxItemOutputBytes, 8 * 1024, 64 * 1024);
  const all = options.order === "desc" ? received.slice().reverse() : received;
  const items = new Map();
  let ignored = 0;
  for (const item of all) {
    if (!item || item.turn_id !== turnId || !validId(item.id)) { ignored++; continue; }
    const previous = items.get(item.id);
    // Reconnect buffers can include an earlier in-progress version of an
    // already finalized saved item. Never regress that final evidence.
    if (previous && terminal(previous.status) && !terminal(item.status)) continue;
    items.set(item.id, item);
  }

  const activity = [], commands = [], finals = [];
  let summaryStatus = null, truncated = incompleteHistory, unsupported = 0;
  for (const item of items.values()) {
    if (item.type === "command_execution") {
      const command = commandResult(item, maxCommandBytes);
      if (!command) { ignored++; continue; }
      commands.push(command);
      activity.push({ id: item.id, turnId, type: item.type, status: command.status, label: command.outcome === "running" ? "Running command" : "Executed command", detail: command.command, outcome: command.outcome, source: "provider_command_execution", truncated: command.truncated });
    } else if (item.type === "message" && item.role === "assistant" && OUTPUT_STATUSES.has(item.status)) {
      const text = messageText(item, item.phase === "final_answer" ? maxSummaryBytes : 1024);
      truncated ||= text.truncated;
      if (item.phase === "final_answer") {
        summaryStatus = item.status;
        if (item.status === "completed") finals.push({ id: item.id, text: text.text, truncated: text.truncated });
      }
      if (text.text) activity.push({ id: item.id, turnId, type: item.type, status: item.status, label: item.phase === "final_answer" ? "Atlas summary" : "Atlas update", detail: clipped(text.text, 1024).text, source: "assistant", truncated: text.truncated || encoder.encode(text.text).byteLength > 1024 });
    } else if (["function_call", "mcp_call"].includes(item.type) && CALL_STATUSES.has(item.status)) {
      // Names are descriptive activity only. Arguments/output can contain
      // arbitrary content and must not be promoted to execution evidence.
      const name = clipped(item.name, 160).text;
      activity.push({ id: item.id, turnId, type: item.type, status: item.status, label: "Tool activity", detail: name || "Tool call", source: "provider_item", truncated: false });
    } else unsupported++;
  }

  let summary = "", summaryRemaining = maxSummaryBytes;
  const summaryItemIds = [];
  for (const final of finals) {
    const separator = summary ? "\n\n" : "";
    if (summaryRemaining < separator.length) { truncated = true; break; }
    const text = clipped(final.text, summaryRemaining - separator.length);
    summary += separator + text.text;
    summaryRemaining -= text.bytes + separator.length;
    summaryItemIds.push(final.id);
    truncated ||= text.truncated || final.truncated;
  }

  const counts = {
    receivedItems: received.length,
    matchingItems: items.size,
    ignoredItems: ignored,
    unsupportedItems: unsupported,
    commandItems: commands.length,
    succeeded: commands.filter(command => command.outcome === "succeeded").length,
    failed: commands.filter(command => command.outcome === "failed").length,
    running: commands.filter(command => command.outcome === "running").length,
    unknown: commands.filter(command => command.outcome === "unknown").length,
  };
  const selected = maxCommands ? commands.slice(-maxCommands) : [];
  let remainingOutput = maxOutputBytes;
  // Prefer the newest output, where the final check or latest failure lives.
  for (let index = selected.length - 1; index >= 0; index--) {
    const command = selected[index];
    if (command.output === null) continue;
    const output = clipped(command.output, Math.min(maxItemOutputBytes, remainingOutput), true);
    command.output = output.text;
    command.outputTruncated = output.truncated;
    command.truncated ||= output.truncated;
    remainingOutput -= output.bytes;
    truncated ||= command.truncated;
  }
  truncated ||= activity.length > maxActivity || commands.length > maxCommands;
  return {
    activity: maxActivity ? activity.slice(-maxActivity) : [],
    commands: selected,
    summary,
    summaryStatus,
    summarySource: "assistant",
    summaryItemIds,
    hasCommandEvidence: commands.length > 0,
    incompleteHistory,
    truncated,
    counts,
  };
}
