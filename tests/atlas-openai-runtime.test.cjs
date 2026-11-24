const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { build } = require("esbuild");
const { Miniflare, convertV4MiniflareOptions } = require("miniflare");

// Exercise the production global fetch and stream APIs in workerd. Every
// outbound request is intercepted locally, including hypothetical redirects.
test("Responses JSON, streaming and cancellation work in the Worker runtime", { timeout: 30000 }, async t => {
  const secret = "sk-" + "fixture".repeat(8), model = "gpt-6.2-sol";
  const entry = `
    import { callOpenAI } from ${JSON.stringify(path.resolve(__dirname, "../today/src/atlas-openai.js"))};
    export default { async fetch(request) {
      const route = new URL(request.url).pathname, controller = new AbortController(), events = [];
      if (route === "/preabort") controller.abort();
      try {
        const result = await callOpenAI({ secret: ${JSON.stringify(secret)}, model: ${JSON.stringify(model)}, input: "Fixture request", webSearch: true,
          stream: route !== "/json", signal: controller.signal,
          onEvent(type, data) { events.push({ type, data }); if (type === "delta" && route === "/cancel") controller.abort(); }
        });
        return Response.json({ result, events });
      } catch (error) { return Response.json({ code: error.code, error: error.message, usage: error.usage, upstreamRequestId: error.upstreamRequestId }, { status: error.status || 500 }); }
    } };
  `;
  const bundled = await build({ stdin: { contents: entry, resolveDir: path.resolve(__dirname, "..") }, bundle: true, format: "esm", platform: "neutral", target: "es2022", write: false, logLevel: "silent" });
  const citation = { type: "url_citation", url: "https://example.com/source", title: "Fixture source", start_index: 0, end_index: 7 };
  const complete = {
    id: "resp_runtime_fixture", status: "completed", service_tier: "default",
    output: [{ type: "web_search_call", id: "ws_fixture" }, { type: "message", phase: "final_answer", content: [{ type: "output_text", text: "Ride 🚲 safely", annotations: [citation] }] }],
    usage: { input_tokens: 100, output_tokens: 20, input_tokens_details: { cached_tokens: 40 } },
  };
  const sse = value => "data: " + JSON.stringify(value) + "\r\n\r\n";
  let mode = "json", calls = [];
  const mf = new Miniflare(convertV4MiniflareOptions({
    modules: true, script: bundled.outputFiles[0].text, compatibilityDate: "2026-10-01", cf: false,
    outboundService: async request => {
      const url = new URL(request.url);
      calls.push({ host: url.hostname, path: url.pathname, method: request.method, authorized: request.headers.get("Authorization") === "Bearer " + secret });
      if (mode === "redirect") return new Response(null, { status: 302, headers: { Location: "https://redirect-target.invalid/collect" } });
      if (url.hostname !== "api.openai.com" || url.pathname !== "/v1/responses") return new Response("Unexpected fixture destination", { status: 500 });
      const payload = await request.json();
      assert.equal(payload.model, model); assert.equal(payload.store, false); assert.equal(payload.service_tier, "default");
      assert.deepEqual(payload.reasoning, { effort: "low" }); assert.equal(payload.max_tool_calls, 3);
      if (mode === "quota") return Response.json({ error: { code: "insufficient_quota", message: secret } }, { status: 429, headers: { "x-request-id": "req_quota" } });
      if (mode === "json") return Response.json(complete, { headers: { "x-request-id": "req_json" } });
      const initial = sse({ type: "response.web_search_call.searching", item_id: "ws_fixture" }) + sse({ type: "response.output_text.delta", output_index: 1, content_index: 0, delta: "Ride 🚲 safely" });
      const ending = sse({ type: "response.output_text.annotation.added", output_index: 1, content_index: 0, annotation: citation }) + sse({ type: "response.completed", response: complete });
      const bytes = new TextEncoder().encode(initial + (mode === "stream" ? ending : ""));
      let at = 0;
      return new Response(new ReadableStream({
        pull(controller) {
          if (at < bytes.length) { controller.enqueue(bytes.slice(at, at += 7)); return; }
          if (mode !== "cancel") controller.close();
        },
      }), { headers: { "Content-Type": "text/event-stream", "x-request-id": "req_stream" } });
    },
  }));
  t.after(() => mf.dispose());
  async function request(route) {
    calls = [];
    const response = await mf.dispatchFetch("https://fixture.invalid" + route);
    const text = await response.text();
    assert.ok(!text.includes(secret), "response never exposes fixture credentials or raw upstream messages");
    return { status: response.status, value: JSON.parse(text) };
  }

  await t.test("real JSON fetch preserves sources and records bounded standard-tier usage", async () => {
    const response = await request("/json");
    assert.equal(response.status, 200); assert.equal(response.value.result.status, "completed");
    assert.equal(response.value.result.answer, "Ride 🚲 safely"); assert.equal(response.value.result.upstreamRequestId, "req_json");
    assert.equal(response.value.result.sources[0].url, citation.url); assert.equal(response.value.result.usage.estimatedCostUsd, 0.010324);
    assert.deepEqual(calls, [{ host: "api.openai.com", path: "/v1/responses", method: "POST", authorized: true }]);
  });

  await t.test("workerd streams Unicode and terminal usage across arbitrary upstream chunks", async () => {
    mode = "stream";
    const { value, status } = await request("/stream");
    assert.equal(status, 200); assert.equal(value.result.status, "completed"); assert.equal(value.result.answer, "Ride 🚲 safely");
    assert.equal(value.events.filter(event => event.type === "delta").map(event => event.data.text).join(""), value.result.answer);
    assert.ok(value.events.some(event => event.type === "status" && event.data.stage === "searching"));
    assert.equal(value.result.usage.inputTokens, 100); assert.equal(value.result.usage.webSearchCalls, 1);
    assert.equal(value.result.sources[0].start_index, 0); assert.equal(value.result.upstreamRequestId, "req_stream");
  });

  await t.test("premature stream termination retains partial content without inventing usage", async () => {
    mode = "interrupted";
    const { value } = await request("/stream");
    assert.equal(value.result.status, "incomplete"); assert.equal(value.result.errorCode, "openai_stream_interrupted");
    assert.equal(value.result.answer, "Ride 🚲 safely"); assert.equal(value.result.usage.estimatedCostUsd, null);
  });

  await t.test("cancellation stops an unclosed upstream stream and keeps already received output", async () => {
    mode = "cancel";
    const { status, value } = await request("/cancel");
    assert.equal(status, 200); assert.equal(value.result.status, "cancelled"); assert.equal(value.result.errorCode, "request_cancelled");
    assert.equal(value.result.answer, "Ride 🚲 safely"); assert.equal(calls.length, 1);
    const stopped = await request("/preabort");
    assert.equal(stopped.value.code, "request_cancelled"); assert.equal(calls.length, 0);
  });

  await t.test("non-2xx responses have actionable errors and redirects never forward credentials", async () => {
    for (const [upstream, code] of [["quota", "openai_quota"], ["redirect", "openai_redirect"]]) {
      mode = upstream;
      const { value } = await request("/json");
      assert.equal(value.code, code); assert.equal(calls.length, 1); assert.equal(calls[0].host, "api.openai.com");
    }
  });
});
