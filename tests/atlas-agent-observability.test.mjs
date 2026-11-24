import test from "node:test";
import assert from "node:assert/strict";
import { normalizeAgentItems } from "../today/src/atlas-agent-observability.js";

const turnId = "turn_fixture";
const command = (id, overrides = {}) => ({ type: "command_execution", id, turn_id: turnId, command: "node --test tests/atlas.test.mjs", cwd: "/workspace/repository", duration_ms: 100, exit_code: 0, output: "1 test passed", status: "completed", ...overrides });
const message = (id, text, overrides = {}) => ({ type: "message", id, turn_id: turnId, role: "assistant", phase: "final_answer", status: "completed", content: [{ type: "output_text", text }], ...overrides });

test("only provider command_execution records count as execution evidence", () => {
  const value = normalizeAgentItems([
    message("msg_claim", "All 100 tests passed."),
    { type: "function_call", id: "call_fixture", turn_id: turnId, name: "exec", arguments: { command: "npm test" }, status: "completed" },
    { type: "function_call_output", id: "result_fixture", turn_id: turnId, call_id: "call_fixture", output: "tests passed", status: "completed" },
  ], { turnId });
  assert.equal(value.hasCommandEvidence, false);
  assert.deepEqual(value.commands, []);
  assert.equal(value.summary, "All 100 tests passed.");
  assert.equal(value.summarySource, "assistant");
  assert.equal(value.counts.succeeded, 0);
  assert.ok(value.activity.every(item => item.source !== "provider_command_execution"));
});

test("command outcomes require terminal process status and its actual exit code", () => {
  const value = normalizeAgentItems([
    command("cmd_pass"),
    command("cmd_nonzero", { exit_code: 1, output: "1 test failed" }),
    command("cmd_missing_exit", { exit_code: null }),
    command("cmd_running", { status: "in_progress", exit_code: 0 }),
    command("cmd_failed", { status: "failed", exit_code: 0 }),
    command("cmd_incomplete", { status: "incomplete", exit_code: 0 }),
  ], { turnId });
  assert.deepEqual(value.commands.map(item => [item.id, item.outcome]), [
    ["cmd_pass", "succeeded"], ["cmd_nonzero", "failed"], ["cmd_missing_exit", "unknown"],
    ["cmd_running", "running"], ["cmd_failed", "failed"], ["cmd_incomplete", "unknown"],
  ]);
  assert.equal(value.commands[0].durationMs, 100);
  assert.equal(value.commands[1].exitCode, 1);
  assert.equal(value.commands[1].output, "1 test failed");
  assert.equal(value.commands[0].source, "provider_command_execution");
  assert.deepEqual([value.counts.succeeded, value.counts.failed, value.counts.running, value.counts.unknown], [1, 2, 1, 2]);
});

test("turn isolation rejects other turns, user claims and malformed command records", () => {
  const value = normalizeAgentItems([
    command("cmd_other", { turn_id: "turn_other" }),
    command("cmd_malformed", { command: { text: "npm test" } }),
    command("cmd_wrong_status", { status: "done" }),
    { ...command("cmd_no_id"), id: null },
    message("msg_user", "All passed", { role: "user", content: [{ type: "input_text", text: "All passed" }] }),
    message("msg_other", "Wrong answer", { turn_id: "turn_other" }),
  ], { turnId });
  assert.equal(value.commands.length, 0);
  assert.equal(value.summary, "");
  assert.equal(value.hasCommandEvidence, false);
});

test("final summary excludes commentary, reasoning and unfinished final messages", () => {
  const value = normalizeAgentItems([
    message("msg_progress", "I am checking this.", { phase: "commentary" }),
    { type: "reasoning", id: "reason_fixture", turn_id: turnId, status: "completed", summary: [{ type: "summary_text", text: "private reasoning" }] },
    message("msg_unfinished", "Tests pass", { status: "incomplete" }),
  ], { turnId });
  assert.equal(value.summary, "");
  assert.equal(value.summaryStatus, "incomplete");
  assert.equal(JSON.stringify(value).includes("private reasoning"), false);
  assert.equal(value.activity[0].label, "Atlas update");
  const completed = normalizeAgentItems([message("msg_final", "Implemented.")], { turnId });
  assert.equal(completed.summary, "Implemented.");
  assert.deepEqual(completed.summaryItemIds, ["msg_final"]);
});

test("descending pages become chronological and pagination is explicitly incomplete", () => {
  const value = normalizeAgentItems({ object: "list", data: [message("msg_final", "Done"), command("cmd_two"), command("cmd_one")], has_more: true }, { turnId, order: "desc" });
  assert.deepEqual(value.commands.map(item => item.id), ["cmd_one", "cmd_two"]);
  assert.equal(value.incompleteHistory, true);
  assert.equal(value.truncated, true);
  assert.equal(value.summary, "Done");
});

test("duplicate polling and stale reconnect records do not duplicate or regress commands", () => {
  const value = normalizeAgentItems([
    command("cmd_same", { status: "in_progress", exit_code: null, output: "Running" }),
    command("cmd_same", { exit_code: 0, output: "Completed" }),
    command("cmd_same", { status: "in_progress", exit_code: null, output: "Stale" }),
  ], { turnId });
  assert.equal(value.commands.length, 1);
  assert.equal(value.commands[0].outcome, "succeeded");
  assert.equal(value.commands[0].output, "Completed");
  assert.equal(value.counts.succeeded, 1);
});

test("activity and output budgets bound display without changing execution counts", () => {
  const value = normalizeAgentItems([
    command("cmd_first", { output: "first long output", command: "a".repeat(100) }),
    command("cmd_second", { output: "second long output" }),
    command("cmd_last", { output: "last important failure", exit_code: 1 }),
    message("msg_final", "s".repeat(100)),
  ], { turnId, maxCommands: 2, maxActivity: 2, maxOutputBytes: 12, maxItemOutputBytes: 8, maxSummaryBytes: 10, maxCommandBytes: 20 });
  assert.equal(value.commands.length, 2);
  assert.equal(value.activity.length, 2);
  assert.equal(value.counts.commandItems, 3);
  assert.equal(value.counts.failed, 1);
  assert.equal(value.commands[1].output, " failure");
  assert.equal(value.commands[0].output, "tput");
  assert.equal(value.commands[1].outputTruncated, true);
  assert.equal(value.summary, "s".repeat(10));
  assert.equal(value.truncated, true);
});

test("UTF-8 truncation preserves valid text within byte budgets and removes terminal control sequences", () => {
  const value = normalizeAgentItems([
    command("cmd_unicode", { command: "ééé", output: "\x1b[31m⚠️ failure\x1b[0m\r\n\x1b]8;;https://hidden.invalid\x07link\x1b]8;;\x07\x00" }),
    message("msg_unicode", "ééé"),
  ], { turnId, maxCommandBytes: 5, maxSummaryBytes: 5, maxOutputBytes: 12 });
  const bytes = new TextEncoder();
  assert.ok(bytes.encode(value.commands[0].command).length <= 5);
  assert.ok(bytes.encode(value.summary).length <= 5);
  assert.ok(bytes.encode(value.commands[0].output).length <= 12);
  assert.ok(!JSON.stringify(value).includes("�"));
  assert.ok(!JSON.stringify(value).includes("hidden.invalid"));
  assert.ok(!value.commands[0].output.includes("\x1b"));
});

test("null outputs and invalid numeric fields remain unknown instead of being invented", () => {
  const value = normalizeAgentItems([command("cmd_unknown", { output: null, exit_code: "0", duration_ms: -1 })], { turnId });
  assert.equal(value.commands[0].output, null);
  assert.equal(value.commands[0].exitCode, null);
  assert.equal(value.commands[0].durationMs, null);
  assert.equal(value.commands[0].outcome, "unknown");
  assert.equal(value.counts.succeeded, 0);
});

test("normalization requires a specific turn and can explicitly suppress displayed content", () => {
  assert.throws(() => normalizeAgentItems([]), /valid coding turn ID/);
  const value = normalizeAgentItems([command("cmd_fixture"), message("msg_final", "Done")], { turnId, maxCommands: 0, maxActivity: 0, maxSummaryBytes: 0, maxOutputBytes: 0 });
  assert.deepEqual(value.commands, []);
  assert.deepEqual(value.activity, []);
  assert.equal(value.summary, "");
  assert.equal(value.hasCommandEvidence, true);
  assert.equal(value.truncated, true);
});
