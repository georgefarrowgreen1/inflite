import test from "node:test";
import assert from "node:assert/strict";
import {
  agentSessionCreate, agentSessionsList, agentSessionGet, agentSessionUpdate,
  agentEnvironmentGet, agentSessionEvents, agentSessionCancel, agentSessionDelete,
  agentSessionItems, agentSessionTurns, agentSessionTurnGet, agentSessionArtifacts,
  agentArtifactContent, agentEnvironmentWriteFile, agentInputFileUpload,
  agentInputFileDelete, AtlasAgentAPIError,
} from "../today/src/atlas-agent-api.js";
import { AtlasProviderError, safeProviderError } from "../today/src/atlas-openai.js";

const secret = "sk-" + "fixture".repeat(8);
const opts = { secret };
const session = { id: "sess_fixture", status: "idle", environment: { id: "env_fixture", type: "openai_hosted" }, required_actions: [], metadata: { atlas_run_id: "run_fixture" }, spend_control: { limit: 500, consumed: null } };
const createBody = { agent: { model: "gpt-6.2-sol", instructions: "Work in the checked-out repository." }, environment: { type: "openai_hosted", container_size: "medium", network: { access: "restricted", allowed_domains: ["registry.npmjs.org"] } }, review: "auto_review", metadata: { atlas_run_id: "run_fixture" }, spend_control: { limit: 500 } };
const message = { type: "agent.session.input.message", input: [{ role: "user", content: [{ type: "input_text", text: "Implement the task and run focused checks." }] }] };

test("idle session creation preserves the saved model and can persist IDs before sending a task", async () => {
  let calls = 0;
  const value = await agentSessionCreate(createBody, { ...opts, send: async (url, init) => {
    calls++;
    assert.equal(url, "https://api.openai.com/v1/agents/sessions");
    assert.equal(init.method, "POST");
    assert.equal(init.headers["OpenAI-Beta"], "agents=v1");
    assert.equal(init.headers.Authorization, "Bearer " + secret);
    assert.equal(init.redirect, "manual");
    assert.deepEqual(JSON.parse(init.body), { ...createBody, stream: false });
    assert.ok(!init.body.includes(secret));
    assert.ok(!Object.hasOwn(JSON.parse(init.body), "input"));
    assert.ok(!Object.hasOwn(init.headers, "Idempotency-Key"));
    return Response.json(session, { status: 201 });
  } });
  assert.equal(calls, 1);
  assert.deepEqual(value, session);
  assert.equal(value.status, "idle"); // Environment readiness must be read separately.
});

test("accepted input uses the persisted idempotency key and cancellation is explicit", async () => {
  const calls = [];
  const send = async (url, init) => { calls.push({ url, init }); return new Response(null, { status: 202 }); };
  assert.deepEqual(await agentSessionEvents("sess_fixture", [message], { ...opts, send, idempotencyKey: "atlas-run-fixture-input-1" }), { accepted: true });
  assert.deepEqual(JSON.parse(calls[0].init.body), { events: [message] });
  assert.equal(calls[0].init.headers["Idempotency-Key"], "atlas-run-fixture-input-1");
  await agentSessionCancel("sess_fixture", { ...opts, send, idempotencyKey: "atlas-run-fixture-cancel-1" });
  assert.deepEqual(JSON.parse(calls[1].init.body), { events: [{ type: "agent.session.input.cancel" }] });
  assert.ok(calls.every(call => call.url === "https://api.openai.com/v1/agents/sessions/sess_fixture/events"));
});

test("session, turn and artifact reads keep opaque IDs and pagination on the fixed provider origin", async () => {
  const calls = [];
  const send = async (url, init) => {
    calls.push({ url, init });
    return Response.json({ data: [], has_more: false });
  };
  await agentSessionsList({ limit: 1, order: "desc" }, { ...opts, send });
  await agentSessionGet("sess_fixture", { ...opts, send });
  await agentEnvironmentGet("env_fixture", { ...opts, send });
  await agentSessionItems("sess_fixture", { after: "item_previous", order: "asc", limit: 100 }, { ...opts, send });
  await agentSessionTurns("sess_fixture", { order: "desc", limit: 10 }, { ...opts, send });
  await agentSessionTurnGet("sess_fixture", "turn_fixture", { ...opts, send });
  await agentSessionArtifacts("sess_fixture", { environment_id: "env_fixture", after: "artifact_previous", limit: 100 }, { ...opts, send });
  assert.deepEqual(calls.map(call => call.url), [
    "https://api.openai.com/v1/agents/sessions?limit=1&order=desc",
    "https://api.openai.com/v1/agents/sessions/sess_fixture",
    "https://api.openai.com/v1/agents/environments/env_fixture",
    "https://api.openai.com/v1/agents/sessions/sess_fixture/items?after=item_previous&order=asc&limit=100",
    "https://api.openai.com/v1/agents/sessions/sess_fixture/turns?order=desc&limit=10",
    "https://api.openai.com/v1/agents/sessions/sess_fixture/turns/turn_fixture",
    "https://api.openai.com/v1/agents/sessions/sess_fixture/artifacts?environment_id=env_fixture&after=artifact_previous&limit=100",
  ]);
  assert.ok(calls.every(call => call.init.method === "GET" && call.init.redirect === "manual" && call.init.headers["OpenAI-Beta"] === "agents=v1"));
});

test("read-only preflight and observer cancellation never create or cancel remote work", async () => {
  const controller = new AbortController(); let calls = 0;
  const result = agentSessionsList({ limit: 1 }, { ...opts, signal: controller.signal, send: async (_url, init) => {
    calls++;
    assert.equal(init.method, "GET");
    controller.abort();
    return new Promise(() => {});
  } });
  await assert.rejects(() => result, error => error.code === "request_cancelled" && !error.acceptanceUnknown);
  assert.equal(calls, 1);
});

test("lost mutating responses stay uncertain and are never retried automatically", async () => {
  let calls = 0;
  await assert.rejects(() => agentSessionEvents("sess_fixture", [message], { ...opts, idempotencyKey: "persisted-input-key", send: async () => { calls++; throw new Error(secret); } }), error => {
    assert.ok(error instanceof AtlasProviderError);
    assert.equal(error.code, "openai_network");
    assert.equal(error.acceptanceUnknown, true);
    assert.ok(!error.message.includes(secret));
    return true;
  });
  assert.equal(calls, 1);
  await assert.rejects(() => agentSessionCreate(createBody, { ...opts, send: async () => Response.json({ status: "idle" }) }), error => error.code === "openai_invalid_response" && error.acceptanceUnknown);
});

test("provider failures expose static useful messages without upstream secrets", async () => {
  for (const [status, code, expected] of [
    [401, "invalid_api_key", "openai_authentication"],
    [403, "permission_denied", "agent_access_unavailable"],
    [404, "resource_not_found", "agent_resource_missing"],
    [404, "model_not_found", "openai_model_unavailable"],
    [409, "conflict", "agent_resource_busy"],
    [429, "session_budget_exceeded", "agent_budget_exceeded"],
    [429, "insufficient_quota", "openai_quota"],
    [429, "files_api_rate_limit_exceeded", "openai_rate_limited"],
    [503, "server_error", "openai_unavailable"],
  ]) {
    await assert.rejects(() => agentSessionGet("sess_fixture", { ...opts, send: async () => Response.json({ error: { code, message: secret } }, { status, headers: { "Retry-After": "5", "x-request-id": "req_fixture" } }) }), error => {
      assert.equal(error.code, expected);
      assert.equal(error.upstreamStatus, status);
      assert.equal(error.upstreamRequestId, "req_fixture");
      assert.equal(error.retryAfter, 5);
      assert.ok(!error.message.includes(secret));
      assert.equal(safeProviderError(error), error);
      return true;
    });
  }
});

test("redirects never forward credentials or count as confirmed task acceptance", async () => {
  let calls = 0;
  await assert.rejects(() => agentSessionCreate(createBody, { ...opts, send: async (_url, init) => {
    calls++;
    assert.equal(init.redirect, "manual");
    return new Response(null, { status: 307, headers: { Location: "https://untrusted.invalid/collect" } });
  } }), error => error.code === "openai_redirect" && !error.acceptanceUnknown);
  assert.equal(calls, 1);
});

test("invalid paths, queries and undocumented idempotency headers never dispatch", async () => {
  const stopped = { ...opts, send: async () => assert.fail("invalid request dispatched") };
  for (const run of [
    () => agentSessionGet("../../files", stopped),
    () => agentSessionTurnGet("sess_fixture", "https://bad.invalid", stopped),
    () => agentSessionItems("sess_fixture", { limit: 101 }, stopped),
    () => agentSessionsList({ metadata: { atlas_run_id: "run_fixture" } }, stopped),
    () => agentSessionCreate(createBody, { ...stopped, idempotencyKey: "unsupported-create-key" }),
    () => agentSessionEvents("sess_fixture", [message], { ...stopped, idempotencyKey: "bad\r\nHeader" }),
    () => agentSessionCreate({ ...createBody, stream: true }, stopped),
  ]) await assert.rejects(async () => run(), error => error instanceof AtlasAgentAPIError && error.code === "agent_input_invalid");
});

test("bounded downloads retain binary artifact bytes and cancel oversized responses", async () => {
  const bytes = Uint8Array.from([0, 255, 1, 128, 42]);
  assert.deepEqual(await agentArtifactContent("sess_fixture", "artifact_fixture", { ...opts, send: async (url, init) => {
    assert.equal(url, "https://api.openai.com/v1/agents/sessions/sess_fixture/artifacts/artifact_fixture/content");
    assert.equal(init.headers.Accept, "application/octet-stream");
    return new Response(bytes);
  } }), bytes);
  let cancelled = false;
  await assert.rejects(() => agentArtifactContent("sess_fixture", "artifact_fixture", { ...opts, maxBytes: 4, send: async () => new Response(new ReadableStream({ start(controller) { controller.enqueue(bytes); }, cancel() { cancelled = true; } })) }), { code: "openai_response_too_large" });
  assert.equal(cancelled, true);
  await assert.rejects(() => agentSessionGet("sess_fixture", { ...opts, send: async () => new Response(Uint8Array.from([0xff])) }), { code: "openai_invalid_response" });
});

test("environment writes accept only documented files under the workspace", async () => {
  const calls = [];
  const send = async (url, init) => { calls.push({ url, body: JSON.parse(init.body) }); return Response.json({ object: "agent.environment.file", path: "/workspace/repository.tar.gz", size_bytes: 3 }); };
  await agentEnvironmentWriteFile("env_fixture", { type: "inline", path: "/workspace/repository.tar.gz", data: "YWJj" }, { ...opts, send });
  await agentEnvironmentWriteFile("env_fixture", { type: "file_id", path: "/workspace/repository.tar.gz", file_id: "file-fixture" }, { ...opts, send });
  assert.ok(calls.every(call => call.url === "https://api.openai.com/v1/agents/environments/env_fixture/files"));
  assert.deepEqual(calls[0].body, { type: "inline", path: "/workspace/repository.tar.gz", data: "YWJj" });
  assert.deepEqual(calls[1].body, { type: "file_id", path: "/workspace/repository.tar.gz", file_id: "file-fixture" });
  for (const file of [
    { type: "inline", path: "/etc/secret", data: "" },
    { type: "inline", path: "/workspace/../escape", data: "" },
    { type: "inline", path: "/workspace/a\\b", data: "" },
    { type: "inline", path: "/workspace/test", data: "not base64" },
    { type: "file_id", path: "/workspace/test", file_id: "../secret" },
  ]) await assert.rejects(async () => agentEnvironmentWriteFile("env_fixture", file, { ...opts, send: async () => assert.fail("invalid file dispatched") }), { code: "agent_input_invalid" });
});

test("input archive uploads use expiring user_data files without leaking keys into multipart content", async () => {
  const input = new TextEncoder().encode("fixture archive");
  const result = await agentInputFileUpload(input, { ...opts, filename: "atlas-repo.tar.gz", expiresAfterSeconds: 3600, send: async (url, init) => {
    assert.equal(url, "https://api.openai.com/v1/files");
    assert.equal(init.method, "POST");
    assert.equal(init.redirect, "manual");
    assert.equal(init.headers["OpenAI-Beta"], undefined);
    assert.equal(init.headers["Content-Type"], undefined); // fetch supplies the boundary.
    assert.equal(init.body.get("purpose"), "user_data");
    assert.equal(init.body.get("expires_after[anchor]"), "created_at");
    assert.equal(init.body.get("expires_after[seconds]"), "3600");
    const file = init.body.get("file");
    assert.equal(file.name, "atlas-repo.tar.gz");
    assert.deepEqual(new Uint8Array(await file.arrayBuffer()), input);
    return Response.json({ id: "file-fixture", bytes: input.length, purpose: "user_data" });
  } });
  assert.equal(result.id, "file-fixture");
});

test("budget updates and cleanup use documented mutations with no background retries", async () => {
  const calls = [];
  const send = async (url, init) => { calls.push({ url, init }); return new Response(null, { status: 204 }); };
  await agentSessionDelete("sess_fixture", { ...opts, send });
  await agentInputFileDelete("file-fixture", { ...opts, send });
  await agentSessionUpdate("sess_fixture", { spend_control: { limit: 1000 } }, { ...opts, send: async (url, init) => { calls.push({ url, init }); return Response.json({ ...session, spend_control: { limit: 1000, consumed: 25 } }); } });
  assert.deepEqual(calls.map(call => [call.url, call.init.method]), [
    ["https://api.openai.com/v1/agents/sessions/sess_fixture", "DELETE"],
    ["https://api.openai.com/v1/files/file-fixture", "DELETE"],
    ["https://api.openai.com/v1/agents/sessions/sess_fixture", "POST"],
  ]);
  assert.deepEqual(JSON.parse(calls[2].init.body), { spend_control: { limit: 1000 } });
});

test("an HTTP deadline aborts transport and leaves a submitted mutation uncertain", async () => {
  let calls = 0, signal;
  await assert.rejects(() => agentSessionEvents("sess_fixture", [message], { ...opts, timeoutMs: 1000, send: async (_url, init) => { calls++; signal = init.signal; return new Promise(() => {}); } }), error => error.code === "openai_timeout" && error.acceptanceUnknown);
  assert.equal(calls, 1);
  assert.equal(signal.aborted, true);
});

test("pre-cancelled requests never dispatch and are not uncertain mutations", async () => {
  const controller = new AbortController(); controller.abort();
  await assert.rejects(() => agentSessionCreate(createBody, { ...opts, signal: controller.signal, send: async () => assert.fail("cancelled request dispatched") }), error => error.code === "request_cancelled" && !error.acceptanceUnknown);
});
