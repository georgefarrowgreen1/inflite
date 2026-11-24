import test from "node:test";
import assert from "node:assert/strict";
import { callOpenAI, openAIJSON, classifyOpenAIError, extractUsage, modelCapabilities, AtlasProviderError } from "../today/src/atlas-openai.js";
import { encryptIntegration, decryptIntegration, saveCredential, loadCredential } from "../today/src/atlas-credentials.js";

const secret = "sk-" + "fixture".repeat(8);
const model = "gpt-6.2-sol";
const output = (answer = "Hello", extra = {}) => ({ id: "resp_fixture", status: "completed", output: [{ type: "message", phase: "final_answer", content: [{ type: "output_text", text: answer, annotations: [] }] }], usage: { input_tokens: 100, output_tokens: 20, input_tokens_details: { cached_tokens: 40 } }, ...extra });
const base = { secret, model, input: [{ role: "user", content: "Fixture prompt" }] };
const event = value => "data: " + JSON.stringify(value) + "\r\n\r\n";
const final = value => event({ type: "response.completed", response: value });
function streamResponse(text, chunks = 1) {
  const bytes = new TextEncoder().encode(text);
  let at = 0;
  return new Response(new ReadableStream({ pull(controller) { if (at >= bytes.length) return controller.close(); controller.enqueue(bytes.slice(at, at += chunks)); } }), { headers: { "Content-Type": "text/event-stream", "x-request-id": "req_fixture" } });
}

for (const [status, body, code] of [
  [401, { error: { message: secret, code: "invalid_api_key" } }, "openai_authentication"],
  [403, { error: { message: secret } }, "openai_permission"],
  [404, { error: { code: "model_not_found" } }, "openai_model_unavailable"],
  [429, { error: { type: "insufficient_quota", message: secret } }, "openai_quota"],
  [429, { error: { code: "organization_spend_limit_exceeded" } }, "openai_quota"],
  [429, { error: { code: "rate_limit_exceeded" } }, "openai_rate_limited"],
  [500, { error: { message: secret } }, "openai_unavailable"],
]) test("provider HTTP " + status + " maps safely to " + code, async () => {
  await assert.rejects(() => callOpenAI({ ...base, send: async () => Response.json(body, { status, headers: { "Retry-After": "12", "x-request-id": "req_fixture" } }) }), error => {
    assert.ok(error instanceof AtlasProviderError); assert.equal(error.code, code);
    assert.equal(error.upstreamRequestId, "req_fixture"); assert.equal(error.retryAfter, 12);
    assert.ok(!error.message.includes(secret)); return true;
  });
});

test("manual redirects are rejected before any forwarding", async () => {
  for (const status of [301, 302, 303, 307, 308]) {
    let calls = 0;
    await assert.rejects(() => callOpenAI({ ...base, send: async (url, init) => {
      calls++; assert.equal(url, "https://api.openai.com/v1/responses"); assert.equal(init.redirect, "manual");
      return new Response(null, { status, headers: { Location: "https://redirect-target.invalid/collect" } });
    } }), { code: "openai_redirect" });
    assert.equal(calls, 1);
  }
});

test("JSON response handles final phase, citation offsets, low reasoning and usage", async () => {
  const answer = output("See source", { output: [
    { type: "message", phase: "commentary", content: [{ type: "output_text", text: "Searching", annotations: [] }] },
    { type: "web_search_call", id: "search1" },
    { type: "message", phase: "final_answer", content: [
      { type: "output_text", text: "See", annotations: [] },
      { type: "output_text", text: "source", annotations: [{ type: "url_citation", url: "https://example.com/source", title: "Source", start_index: 0, end_index: 6 }, { type: "url_citation", url: "javascript:alert(1)", title: "bad" }] },
    ] },
  ] });
  const result = await callOpenAI({ ...base, webSearch: true, send: async (url, init) => {
    const body = JSON.parse(init.body);
    assert.equal(body.store, false); assert.equal(body.service_tier, "default"); assert.deepEqual(body.reasoning, { effort: "low" });
    assert.deepEqual(body.tools, [{ type: "web_search", search_context_size: "low" }]); assert.equal(body.max_tool_calls, 3);
    return Response.json(answer, { headers: { "x-request-id": "req_fixture" } });
  } });
  assert.equal(result.answer, "See\nsource"); assert.equal(result.status, "completed");
  assert.deepEqual(result.sources, [{ url: "https://example.com/source", title: "Source", start_index: 4, end_index: 10 }]);
  assert.equal(result.usage.inputTokens, 100); assert.equal(result.usage.webSearchCalls, 1);
  assert.equal(result.usage.estimatedCostUsd, 0.010324);
});

test("empty, refused and incomplete responses cannot be stored as successful empty answers", async () => {
  for (const [value, code] of [
    [output(""), "openai_empty_response"],
    [output("", { status: "incomplete", incomplete_details: { reason: "max_output_tokens" } }), "openai_output_limit"],
    [output("", { output: [{ type: "message", content: [{ type: "refusal", refusal: "Fixture refusal" }] }] }), "openai_refused"],
    [{ status: "completed", metadata: { fixture: true } }, "openai_invalid_response"],
  ]) await assert.rejects(() => callOpenAI({ ...base, send: async () => Response.json(value) }), { code });
  const result = await callOpenAI({ ...base, send: async () => Response.json(output("Partial answer", { status: "incomplete", incomplete_details: { reason: "max_output_tokens" } })) });
  assert.equal(result.status, "incomplete"); assert.equal(result.errorCode, "openai_output_limit"); assert.equal(result.answer, "Partial answer");
});

test("arbitrary SSE byte boundaries preserve Unicode, progress, citations and final usage", async () => {
  const events = [], answer = "A 🚲 answer";
  const source = { type: "url_citation", url: "https://example.com/bike", title: "Bike", start_index: 2, end_index: 4 };
  const text = ": keepalive\r\n\r\n" + event({ type: "response.web_search_call.searching", item_id: "ws_fixture" }) +
    event({ type: "response.output_text.delta", output_index: 1, content_index: 0, delta: "A 🚲 " }) +
    event({ type: "response.output_text.delta", output_index: 1, content_index: 0, delta: "answer" }) +
    event({ type: "response.output_text.annotation.added", output_index: 1, content_index: 0, annotation: source }) +
    final(output(answer, { output: [{ type: "web_search_call", id: "ws_fixture" }, { type: "message", content: [{ type: "output_text", text: answer, annotations: [source] }] }] }));
  const result = await callOpenAI({ ...base, stream: true, send: async () => streamResponse(text, 1), onEvent: (type, data) => events.push({ type, data }) });
  assert.equal(result.answer, answer); assert.equal(result.status, "completed");
  assert.equal(events.filter(x => x.type === "delta").map(x => x.data.text).join(""), answer);
  assert.ok(events.some(x => x.type === "status" && x.data.stage === "searching"));
  assert.equal(result.sources[0].url, "https://example.com/bike"); assert.equal(result.usage.webSearchCalls, 1);
  assert.equal(result.upstreamRequestId, "req_fixture");
});

test("SSE multi-line data and unbroken chunks with many events are parsed", async () => {
  const events = Array.from({ length: 1800 }, () => event({ type: "response.output_text.delta", output_index: 0, content_index: 0, delta: "a" })).join("");
  const value = output("a".repeat(1800));
  const ending = "data: {\n" + 'data: "type":"response.completed",\n' + 'data: "response":' + JSON.stringify(value) + "}\n\n";
  const result = await callOpenAI({ ...base, stream: true, send: async () => streamResponse(events + ending, 1024 * 1024) });
  assert.equal(result.status, "completed"); assert.equal(result.answer.length, 1800);
});

test("interrupted SSE keeps partial text and never reports completion", async () => {
  const result = await callOpenAI({ ...base, stream: true, send: async () => streamResponse(event({ type: "response.output_text.delta", delta: "Kept partial" }) + "data: [DONE]\n\n", 1024) });
  assert.equal(result.status, "incomplete"); assert.equal(result.errorCode, "openai_stream_interrupted"); assert.equal(result.answer, "Kept partial");
  assert.equal(result.usage.inputTokens, null); assert.equal(result.usage.estimatedCostUsd, null);
});

test("partial refusals and failed terminal events retain text with an accurate incomplete state", async () => {
  const refused = output("A partial answer", { output: [{ type: "message", content: [{ type: "output_text", text: "A partial answer" }, { type: "refusal", refusal: "Fixture refusal" }] }] });
  const json = await callOpenAI({ ...base, send: async () => Response.json(refused) });
  assert.equal(json.answer, "A partial answer"); assert.equal(json.status, "incomplete"); assert.equal(json.errorCode, "openai_refused");
  for (const [ending, code] of [
    [event({ type: "response.refusal.delta", delta: "Fixture refusal" }), "openai_refused"],
    [event({ type: "response.failed", response: output("", { status: "failed", error: { code: "insufficient_quota", message: secret } }) }), "openai_quota"],
    ["data: invalid JSON\n\n", "openai_invalid_response"],
  ]) {
    const result = await callOpenAI({ ...base, stream: true, send: async () => streamResponse(event({ type: "response.output_text.delta", delta: "Partial" }) + ending, 32) });
    assert.equal(result.status, "incomplete"); assert.equal(result.errorCode, code); assert.equal(result.answer, "Partial");
    assert.ok(!JSON.stringify(result).includes(secret));
  }
});

test("unbounded answers, oversized SSE events and truncated UTF-8 are rejected safely", async () => {
  await assert.rejects(() => callOpenAI({ ...base, send: async () => Response.json(output("a".repeat(128 * 1024 + 1))) }), { code: "openai_response_too_large" });
  await assert.rejects(() => callOpenAI({ ...base, stream: true, send: async () => streamResponse("data: " + "a".repeat(256 * 1024 + 1), 32768) }), { code: "openai_response_too_large" });
  await assert.rejects(() => callOpenAI({ ...base, stream: true, send: async () => new Response(Uint8Array.of(0xc3), { headers: { "Content-Type": "text/event-stream" } }) }), { code: "openai_invalid_response" });
});

test("a stalled response body reaches its deadline and aborts upstream work", async () => {
  let upstreamSignal, cancelled = false;
  const response = new Response(new ReadableStream({ cancel() { cancelled = true; } }), { headers: { "Content-Type": "text/event-stream" } });
  await assert.rejects(() => callOpenAI({ ...base, stream: true, timeoutMs: 1000, send: async (_url, init) => { upstreamSignal = init.signal; return response; } }), { code: "openai_timeout" });
  assert.equal(upstreamSignal.aborted, true); assert.equal(cancelled, true);
});

test("caller cancellation aborts upstream and retains already displayed output", async () => {
  const controller = new AbortController(); let upstreamSignal, cancelled = false;
  const response = new Response(new ReadableStream({ start(stream) { stream.enqueue(new TextEncoder().encode(event({ type: "response.output_text.delta", delta: "Partial" }))); }, cancel() { cancelled = true; } }), { headers: { "Content-Type": "text/event-stream" } });
  const result = await callOpenAI({ ...base, stream: true, signal: controller.signal, send: async (_url, init) => { upstreamSignal = init.signal; return response; }, onEvent(type) { if (type === "delta") controller.abort(); } });
  assert.equal(result.status, "cancelled"); assert.equal(result.answer, "Partial"); assert.equal(upstreamSignal.aborted, true);
  assert.equal(cancelled, true);
});

test("pre-cancelled requests never dispatch", async () => {
  const controller = new AbortController(); controller.abort(); let calls = 0;
  await assert.rejects(() => callOpenAI({ ...base, signal: controller.signal, send: async () => { calls++; } }), { code: "request_cancelled" });
  assert.equal(calls, 0);
});

test("network exceptions and malformed responses never expose raw secrets", async () => {
  await assert.rejects(() => callOpenAI({ ...base, send: async () => { throw Error(secret); } }), error => error.code === "openai_network" && !error.message.includes(secret));
  await assert.rejects(() => callOpenAI({ ...base, send: async () => new Response(secret, { headers: { "x-request-id": secret + "?" } }) }), error => error.code === "openai_invalid_response" && !error.message.includes(secret) && !error.upstreamRequestId);
});

test("model metadata requests are fixed-origin, bounded and reject redirects", async () => {
  const value = await openAIJSON("/v1/models", { secret, send: async (url, init) => { assert.equal(url, "https://api.openai.com/v1/models"); assert.equal(init.redirect, "manual"); return Response.json({ data: [] }); } });
  assert.deepEqual(value, { data: [] });
  await assert.rejects(() => openAIJSON("https://bad.invalid", { secret, send: async () => assert.fail("must not dispatch") }), { code: "provider_model_invalid" });
  await assert.rejects(() => openAIJSON("/v1/models", { secret, send: async () => new Response("x".repeat(1025)), maxBytes: 1024 }), { code: "openai_response_too_large" });
});

test("pricing distinguishes unknown usage and non-standard processing tiers", () => {
  assert.equal(extractUsage(null, model).estimatedCostUsd, null);
  assert.equal(extractUsage({ input_tokens: 100, output_tokens: 100 }, "unknown-model").estimatedCostUsd, null);
  assert.equal(extractUsage({ input_tokens: 100, output_tokens: 100 }, model, 0, "priority").estimatedCostUsd, null);
  assert.equal(modelCapabilities("gpt-6.2-sol").webSearch, true);
  assert.equal(modelCapabilities("gpt-6.2-sol-2026-11-01").webSearch, true);
  assert.equal(modelCapabilities("gpt-6x2-sol").capabilitiesVerified, false);
  assert.equal(classifyOpenAIError(429, { error: { type: "insufficient_quota" } }).code, "openai_quota");
});

test("integration ciphertext is scoped to owner and integration kind", async () => {
  const env = { ATLAS_ENCRYPTION_KEY: btoa("k".repeat(32)) };
  const record = await encryptIntegration(env, "owner", "github", "fixture-github-token");
  assert.ok(!JSON.stringify(record).includes("fixture-github-token"));
  assert.equal(await decryptIntegration(env, "owner", "github", record), "fixture-github-token");
  for (const [owner, kind] of [["other", "github"], ["owner", "provider"]]) await assert.rejects(() => decryptIntegration(env, owner, kind, record), { code: "integration_secret_unreadable" });
});
