// All provider failures are translated to static messages. Never return an
// upstream error body, authorization header, prompt or raw exception.
const ERRORS = {
  provider_not_configured: [503, "Save an OpenAI connection before using Atlas."],
  provider_database_missing: [503, "Atlas storage is not configured."],
  provider_database_read_failed: [503, "Atlas could not read the saved connection. Check its storage setup."],
  provider_database_write_failed: [503, "Atlas could not save the connection. Check its storage setup."],
  provider_database_delete_failed: [503, "Atlas could not remove the saved connection. Try again."],
  provider_encryption_missing: [503, "Atlas encryption is not configured."],
  provider_encryption_invalid: [503, "ATLAS_ENCRYPTION_KEY must be Base64 encoding of exactly 32 bytes."],
  provider_encryption_failed: [503, "Atlas could not encrypt the connection. Check the Worker encryption configuration."],
  provider_credential_unreadable: [503, "Atlas cannot decrypt this saved connection. Restore the original encryption secret or reconnect your provider."],
  provider_health_unavailable: [503, "Atlas could not read connection health. Finish the storage setup and try again."],
  provider_key_invalid: [400, "Enter a valid OpenAI API key."],
  provider_model_invalid: [400, "Enter a valid model ID."],
  openai_authentication: [400, "OpenAI rejected the API key. Check the key or reconnect your provider."],
  openai_permission: [403, "This OpenAI key or project does not have permission for this request."],
  openai_model_unavailable: [400, "This model is not available to the OpenAI project. Choose another available model."],
  openai_quota: [429, "The OpenAI project has exhausted its credits or spending allowance. Check its billing and usage limits."],
  openai_rate_limited: [429, "OpenAI is temporarily rate limiting this project. Wait briefly and try again."],
  openai_request_invalid: [400, "OpenAI could not accept this request. Check the selected model and workspace capabilities."],
  openai_timeout: [504, "OpenAI took too long to respond. Try a shorter request or try again later."],
  openai_network: [502, "Atlas could not reach OpenAI. Try again shortly."],
  openai_unavailable: [502, "OpenAI is temporarily unavailable. Try again shortly."],
  openai_redirect: [502, "OpenAI returned an unexpected redirect. Atlas stopped the request to protect the connection."],
  openai_invalid_response: [502, "OpenAI returned an unreadable response. Try again."],
  openai_response_too_large: [502, "The response exceeded Atlas's size limit. Try a more focused request."],
  openai_empty_response: [502, "OpenAI returned no answer. Try a more focused request."],
  openai_refused: [422, "The model could not fulfil this request. Try rephrasing or choosing a different task."],
  openai_output_limit: [502, "The answer reached its output limit. The partial response has been kept."],
  openai_incomplete: [502, "OpenAI did not finish this answer. The partial response has been kept."],
  openai_stream_interrupted: [502, "The response stream was interrupted. The partial response has been kept."],
  request_cancelled: [499, "The request was stopped."],
  integration_secret_invalid: [400, "Enter a valid integration credential."],
  integration_secret_unreadable: [503, "Atlas cannot decrypt this integration. Reconnect it or restore the original encryption secret."],
};

export class AtlasProviderError extends Error {
  constructor(code, options = {}) {
    const item = ERRORS[code] || ERRORS.openai_unavailable;
    super(item[1]);
    this.name = "AtlasProviderError";
    this.code = ERRORS[code] ? code : "openai_unavailable";
    this.status = item[0];
    if (Number.isFinite(options.retryAfter)) this.retryAfter = Math.max(0, Math.min(3600, Math.ceil(options.retryAfter)));
    const id = safeRequestId(options.upstreamRequestId);
    if (id) this.upstreamRequestId = id;
    if (options.usage) this.usage = options.usage;
  }
}

export function safeProviderError(error, fallback = "openai_unavailable") {
  if (error instanceof AtlasProviderError) return error;
  return new AtlasProviderError(ERRORS[error?.code] ? error.code : fallback);
}

export const PRICING_DATE = "2026-11-24";
// Capabilities and Standard prices verified against the official model pages:
// https://developers.openai.com/api/docs/models/gpt-6.2-sol
// https://developers.openai.com/api/docs/models/gpt-6.2-astra
// Web-search call charges: https://developers.openai.com/api/docs/pricing
export const MODEL_CATALOG = Object.freeze([
  { id: "gpt-6.2-sol", label: "GPT-6.2 Sol", webSearch: true, reasoning: true, structuredOutputs: true, pricing: { inputPerMillion: 2, cachedInputPerMillion: 0.1, outputPerMillion: 10, currency: "USD", date: PRICING_DATE } },
  { id: "gpt-6.2-astra", label: "GPT-6.2 Astra", webSearch: true, reasoning: true, structuredOutputs: true, pricing: { inputPerMillion: 8, cachedInputPerMillion: 0.4, outputPerMillion: 40, currency: "USD", date: PRICING_DATE } },
]);

export function modelCapabilities(model) {
  const found = MODEL_CATALOG.find(item => model === item.id || (typeof model === "string" && new RegExp("^" + item.id.replaceAll(".", "\\.") + "-\\d{4}-\\d{2}-\\d{2}$").test(model)));
  return found ? { ...found, id: model, capabilitiesVerified: true } : { id: model, label: model, webSearch: false, reasoning: false, structuredOutputs: false, capabilitiesVerified: false, pricing: null };
}

const MAX_BODY = 2 * 1024 * 1024;
const MAX_EVENT = 256 * 1024;
const MAX_ANSWER = 128 * 1024;
const MAX_SOURCES = 50;
const MODEL_ID = /^[a-zA-Z0-9._-]{1,100}$/;
const safeRequestId = id => typeof id === "string" && /^[a-zA-Z0-9_-]{1,128}$/.test(id) ? id : null;
const tokenCount = n => Number.isSafeInteger(n) && n >= 0 && n <= 10000000 ? n : null;

export function extractUsage(usage, model, webSearchCalls = 0, serviceTier = "default") {
  const inputTokens = tokenCount(usage?.input_tokens);
  const outputTokens = tokenCount(usage?.output_tokens);
  const cachedTokens = tokenCount(usage?.input_tokens_details?.cached_tokens);
  const calls = tokenCount(webSearchCalls) ?? 0;
  const pricing = modelCapabilities(model).pricing;
  let estimatedCostUsd = null;
  if (pricing && inputTokens !== null && outputTokens !== null && [undefined, null, "default", "standard"].includes(serviceTier)) {
    const cached = Math.min(inputTokens, cachedTokens ?? 0);
    const long = inputTokens > 272000;
    estimatedCostUsd = ((inputTokens - cached) * pricing.inputPerMillion + cached * pricing.cachedInputPerMillion) * (long ? 2 : 1) / 1e6;
    estimatedCostUsd += outputTokens * pricing.outputPerMillion * (long ? 1.5 : 1) / 1e6;
    estimatedCostUsd += calls * 0.01;
    estimatedCostUsd = Math.round(estimatedCostUsd * 1e8) / 1e8;
  }
  return {
    inputTokens, outputTokens, cachedTokens, webSearchCalls: calls, estimatedCostUsd,
    pricingDate: pricing ? PRICING_DATE : null,
    estimateNote: "Estimate of standard token charges and observed web-search calls; additional cache-write or unreported tool usage may apply. OpenAI billing is authoritative.",
  };
}

function deadline(signal, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new DOMException("Request deadline", "TimeoutError")), timeoutMs);
  return { signal: signal ? AbortSignal.any([signal, controller.signal]) : controller.signal, timeout: controller.signal, close: () => clearTimeout(timer) };
}

function abortable(promise, signal) {
  if (!signal) return promise;
  if (signal.aborted) { Promise.resolve(promise).catch(() => {}); return Promise.reject(signal.reason); }
  let listener;
  const stopped = new Promise((_, reject) => {
    listener = () => reject(signal.reason);
    signal.addEventListener("abort", listener, { once: true });
  });
  return Promise.race([promise, stopped]).finally(() => signal.removeEventListener("abort", listener));
}

function transportError(error, signal, timedOut, upstreamRequestId) {
  if (error instanceof AtlasProviderError) return error;
  if (timedOut?.aborted || error?.name === "TimeoutError") return new AtlasProviderError("openai_timeout", { upstreamRequestId });
  if (signal?.aborted || error?.name === "AbortError") return new AtlasProviderError("request_cancelled", { upstreamRequestId });
  return new AtlasProviderError("openai_network", { upstreamRequestId });
}

async function readText(response, signal, maxBytes = MAX_BODY) {
  if (!response.body) throw new AtlasProviderError("openai_invalid_response");
  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let size = 0, text = "", complete = false;
  try {
    while (true) {
      const { value, done } = await abortable(reader.read(), signal);
      if (done) { complete = true; break; }
      size += value.byteLength;
      if (size > maxBytes) throw new AtlasProviderError("openai_response_too_large");
      try { text += decoder.decode(value, { stream: true }); }
      catch { throw new AtlasProviderError("openai_invalid_response"); }
    }
    try { return text + decoder.decode(); }
    catch { throw new AtlasProviderError("openai_invalid_response"); }
  } finally {
    if (!complete) reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

function retryAfter(response) {
  const raw = response.headers.get("Retry-After");
  if (!raw) return undefined;
  const seconds = /^\d+(?:\.\d+)?$/.test(raw.trim()) ? Number(raw) : (Date.parse(raw) - Date.now()) / 1000;
  return Number.isFinite(seconds) && seconds >= 0 ? Math.min(3600, seconds) : undefined;
}

export function classifyOpenAIError(status, body, options = {}) {
  const code = body?.error?.code ?? body?.code;
  const type = body?.error?.type ?? body?.type;
  if (["insufficient_quota", "billing_hard_limit_reached", "billing_not_active", "organization_spend_limit_exceeded", "project_spend_limit_exceeded", "usage_limit_exceeded", "organization_usage_limit_exceeded"].includes(code) || type === "insufficient_quota") return new AtlasProviderError("openai_quota", options);
  if (["model_not_found", "model_not_available", "invalid_model"].includes(code)) return new AtlasProviderError("openai_model_unavailable", options);
  if (["invalid_api_key", "invalid_authentication", "missing_api_key"].includes(code) || status === 401) return new AtlasProviderError("openai_authentication", options);
  if (["rate_limit_exceeded", "slow_down"].includes(code) || type === "rate_limit_error" || status === 429) return new AtlasProviderError("openai_rate_limited", options);
  if (status === 403) return new AtlasProviderError("openai_permission", options);
  if (status === 404) return new AtlasProviderError("openai_model_unavailable", options);
  if (status >= 300 && status < 400) return new AtlasProviderError("openai_redirect", options);
  if (status === 408 || status === 504) return new AtlasProviderError("openai_timeout", options);
  if (status >= 400 && status < 500) return new AtlasProviderError("openai_request_invalid", options);
  return new AtlasProviderError("openai_unavailable", options);
}

async function checkResponse(response, signal) {
  if (response.ok) return;
  const options = { retryAfter: retryAfter(response), upstreamRequestId: response.headers.get("x-request-id") };
  if (response.status >= 300 && response.status < 400) {
    response.body?.cancel().catch(() => {});
    throw classifyOpenAIError(response.status, null, options);
  }
  let body;
  try { body = JSON.parse(await readText(response, signal, 16384)); }
  catch (error) { if (signal.aborted) throw error; }
  throw classifyOpenAIError(response.status, body, options);
}

export async function openAIJSON(path, { secret, send = fetch, signal, timeoutMs = 10000, maxBytes = 1048576 } = {}) {
  if (!/^\/v1\/models(?:\/[a-zA-Z0-9._-]{1,100})?$/.test(path)) throw new AtlasProviderError("provider_model_invalid");
  if (typeof secret !== "string" || !secret || secret.length > 512) throw new AtlasProviderError("provider_key_invalid");
  const wait = deadline(signal, Math.min(30000, Math.max(1000, timeoutMs)));
  let requestId;
  try {
    wait.signal.throwIfAborted();
    const response = await abortable(Promise.resolve().then(() => { wait.signal.throwIfAborted(); return send("https://api.openai.com" + path, {
      headers: { Authorization: "Bearer " + secret, Accept: "application/json" }, redirect: "manual", signal: wait.signal,
    }); }), wait.signal);
    requestId = safeRequestId(response.headers.get("x-request-id"));
    await checkResponse(response, wait.signal);
    let value;
    try { value = JSON.parse(await readText(response, wait.signal, Math.min(MAX_BODY, maxBytes))); }
    catch (error) { if (error instanceof AtlasProviderError || wait.signal.aborted) throw error; throw new AtlasProviderError("openai_invalid_response"); }
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new AtlasProviderError("openai_invalid_response");
    return value;
  } catch (error) { throw transportError(error, signal, wait.timeout, requestId); }
  finally { wait.close(); }
}

function sourceFrom(annotation, base = 0, length) {
  if (annotation?.type !== "url_citation" || typeof annotation.url !== "string" || annotation.url.length > 2048) return null;
  let url;
  try { url = new URL(annotation.url); } catch { return null; }
  if (url.protocol !== "https:" || url.username || url.password) return null;
  const source = { url: url.href, title: typeof annotation.title === "string" ? annotation.title.slice(0, 300) : url.hostname };
  const start = annotation.start_index, end = annotation.end_index;
  if (Number.isInteger(start) && Number.isInteger(end) && start >= 0 && end >= start && (length === undefined || end <= length)) {
    source.start_index = base + start; source.end_index = base + end;
  }
  return source;
}

function uniqueSources(sources) {
  const seen = new Set();
  return sources.filter(source => {
    const key = JSON.stringify([source.url, source.start_index, source.end_index]);
    if (seen.has(key)) return false;
    seen.add(key); return true;
  }).slice(0, MAX_SOURCES);
}

function responseContent(response) {
  if (!response || typeof response !== "object" || !Array.isArray(response.output)) throw new AtlasProviderError("openai_invalid_response");
  const messages = response.output.filter(item => item?.type === "message");
  const final = messages.filter(item => item.phase === "final_answer");
  const selected = final.length ? final : messages;
  const texts = [], sources = [];
  let offset = 0, refusal = false;
  for (const message of selected) {
    if (!Array.isArray(message.content)) throw new AtlasProviderError("openai_invalid_response");
    for (const part of message.content) {
      if (part?.type === "refusal") refusal = true;
      if (part?.type !== "output_text" || typeof part.text !== "string") continue;
      if (texts.length) offset++;
      for (const annotation of Array.isArray(part.annotations) ? part.annotations : []) {
        const source = sourceFrom(annotation, offset, part.text.length); if (source) sources.push(source);
      }
      texts.push(part.text); offset += part.text.length;
      if (offset > MAX_ANSWER) throw new AtlasProviderError("openai_response_too_large");
    }
  }
  const webCalls = response.output.filter(item => item?.type === "web_search_call");
  return { answer: texts.join("\n"), sources: uniqueSources(sources), refusal, webSearchCalls: webCalls.length };
}

function incompleteCode(reason) {
  return reason === "max_output_tokens" ? "openai_output_limit" : reason === "content_filter" ? "openai_refused" : "openai_incomplete";
}

function resultFrom(response, model, requestId, fallback = {}) {
  const content = responseContent(response);
  const usage = extractUsage(response.usage, model, Math.max(content.webSearchCalls, fallback.webSearchCalls || 0), response.service_tier);
  const status = response.status ?? "completed";
  if (status === "failed" || response.error) throw classifyOpenAIError(502, { error: response.error }, { upstreamRequestId: requestId, usage });
  if (content.refusal && !content.answer.trim()) throw new AtlasProviderError("openai_refused", { upstreamRequestId: requestId, usage });
  if (!content.answer.trim()) throw new AtlasProviderError(status === "incomplete" ? incompleteCode(response.incomplete_details?.reason) : "openai_empty_response", { upstreamRequestId: requestId, usage });
  if (!["completed", "incomplete", "cancelled", "in_progress", "queued"].includes(status)) throw new AtlasProviderError("openai_invalid_response", { upstreamRequestId: requestId, usage });
  return {
    answer: content.answer, sources: content.sources, usage,
    status: status === "cancelled" ? "cancelled" : status === "completed" && !content.refusal ? "completed" : "incomplete",
    upstreamRequestId: requestId || null, responseId: safeRequestId(response.id),
    ...(status !== "completed" || content.refusal ? { errorCode: status === "cancelled" ? "request_cancelled" : content.refusal ? "openai_refused" : incompleteCode(response.incomplete_details?.reason) } : {}),
  };
}

async function consumeStream(response, { model, signal, onEvent, requestId }) {
  if (!response.body) throw new AtlasProviderError("openai_invalid_response", { upstreamRequestId: requestId });
  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  const parts = new Map(), webCalls = new Set();
  let buffer = "", data = [], dataBytes = 0, bytes = 0, terminal = null, streamError = null, ended = false, refusal = false;
  const emit = async (type, payload) => { if (typeof onEvent === "function") await abortable(Promise.resolve().then(() => onEvent(type, payload)), signal); };
  const keyFor = event => [Number.isInteger(event.output_index) ? event.output_index : 0, Number.isInteger(event.content_index) ? event.content_index : 0].join(":");
  const partFor = event => { const key = keyFor(event); if (!parts.has(key)) parts.set(key, { text: "", annotations: [], output: Number(event.output_index) || 0, content: Number(event.content_index) || 0 }); return parts.get(key); };
  const contents = () => {
    const ordered = [...parts.values()].sort((a, b) => a.output - b.output || a.content - b.content);
    let answer = "", sources = [];
    for (const part of ordered) {
      if (answer) answer += "\n";
      for (const annotation of part.annotations) { const source = sourceFrom(annotation, answer.length, part.text.length); if (source) sources.push(source); }
      answer += part.text;
    }
    return { answer, sources: uniqueSources(sources) };
  };
  async function dispatch() {
    if (!data.length) return;
    const value = data.join("\n"); data = []; dataBytes = 0;
    if (value === "[DONE]") return;
    let event;
    try { event = JSON.parse(value); } catch { throw new AtlasProviderError("openai_invalid_response", { upstreamRequestId: requestId }); }
    if (!event || typeof event.type !== "string") throw new AtlasProviderError("openai_invalid_response", { upstreamRequestId: requestId });
    if (event.type === "response.output_text.delta") {
      if (typeof event.delta !== "string") throw new AtlasProviderError("openai_invalid_response", { upstreamRequestId: requestId });
      const part = partFor(event); part.text += event.delta;
      if (contents().answer.length > MAX_ANSWER) throw new AtlasProviderError("openai_response_too_large", { upstreamRequestId: requestId });
      await emit("delta", { text: event.delta });
    } else if (event.type === "response.output_text.annotation.added") {
      partFor(event).annotations.push(event.annotation);
      const source = sourceFrom(event.annotation);
      if (source) await emit("source", { source });
    } else if (event.type.startsWith("response.web_search_call.")) {
      if (typeof event.item_id === "string") webCalls.add(event.item_id);
      if (event.type.endsWith(".searching") || event.type.endsWith(".in_progress")) await emit("status", { stage: "searching" });
      if (event.type.endsWith(".completed")) await emit("status", { stage: "responding" });
    } else if (event.type === "response.output_item.added" && event.item?.type === "web_search_call") {
      if (typeof event.item.id === "string") webCalls.add(event.item.id);
    } else if (event.type === "response.refusal.delta" || event.type === "response.refusal.done") {
      refusal = true;
    } else if (["response.completed", "response.incomplete", "response.failed"].includes(event.type)) {
      terminal = event.response;
      if (!terminal || typeof terminal !== "object") throw new AtlasProviderError("openai_invalid_response", { upstreamRequestId: requestId });
      if (!terminal.status) terminal = { ...terminal, status: event.type.slice(9) };
    } else if (event.type === "error") {
      streamError = classifyOpenAIError(502, event, { upstreamRequestId: requestId });
    }
  }
  async function line(value) {
    if (value === "") return dispatch();
    if (value.startsWith("data:")) {
      const datum = value.slice(5).replace(/^ /, ""); dataBytes += datum.length;
      if (dataBytes > MAX_EVENT) throw new AtlasProviderError("openai_response_too_large", { upstreamRequestId: requestId });
      data.push(datum);
    }
  }
  let failure;
  try {
    while (!terminal && !streamError) {
      const next = await abortable(reader.read(), signal);
      if (next.done) {
        ended = true;
        try { buffer += decoder.decode(); }
        catch { throw new AtlasProviderError("openai_invalid_response", { upstreamRequestId: requestId }); }
        break;
      }
      bytes += next.value.byteLength;
      if (bytes > MAX_BODY) throw new AtlasProviderError("openai_response_too_large", { upstreamRequestId: requestId });
      try { buffer += decoder.decode(next.value, { stream: true }); }
      catch { throw new AtlasProviderError("openai_invalid_response", { upstreamRequestId: requestId }); }
      while (true) {
        const at = buffer.search(/[\r\n]/);
        if (at < 0 || (buffer[at] === "\r" && at === buffer.length - 1)) break;
        const width = buffer[at] === "\r" && buffer[at + 1] === "\n" ? 2 : 1;
        const value = buffer.slice(0, at); buffer = buffer.slice(at + width);
        await line(value);
        if (terminal || streamError) break;
      }
      if (buffer.length > MAX_EVENT) throw new AtlasProviderError("openai_response_too_large", { upstreamRequestId: requestId });
    }
    if (!terminal && !streamError && buffer) await line(buffer.replace(/[\r\n]+$/, ""));
    if (!terminal && !streamError) await dispatch();
  } catch (error) { failure = error; }
  finally {
    if (!ended) reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  const partial = contents();
  if (terminal) {
    try { return resultFrom(terminal, model, requestId, { webSearchCalls: webCalls.size }); }
    catch (error) {
      if (!partial.answer.trim()) throw error;
      return { ...partial, status: "incomplete", errorCode: safeProviderError(error).code, usage: error.usage || extractUsage(terminal.usage, model, webCalls.size, terminal.service_tier), upstreamRequestId: requestId || null, responseId: safeRequestId(terminal.id) };
    }
  }
  if (partial.answer.trim()) return {
    ...partial, status: signal.aborted && signal.reason?.name !== "TimeoutError" ? "cancelled" : "incomplete",
    errorCode: signal.aborted ? (signal.reason?.name === "TimeoutError" ? "openai_timeout" : "request_cancelled") : (streamError?.code || (refusal ? "openai_refused" : failure instanceof AtlasProviderError ? failure.code : "openai_stream_interrupted")),
    usage: extractUsage(null, model, webCalls.size), upstreamRequestId: requestId || null, responseId: null,
  };
  if (streamError) throw streamError;
  if (refusal) throw new AtlasProviderError("openai_refused", { upstreamRequestId: requestId });
  if (failure) throw failure;
  throw new AtlasProviderError("openai_stream_interrupted", { upstreamRequestId: requestId });
}

export async function callOpenAI({ secret, model, input, instructions = "", webSearch = false, stream = false, maxOutputTokens = 4000, signal, onEvent, send = fetch, textFormat, timeoutMs = 90000 } = {}) {
  if (typeof secret !== "string" || !secret || secret.length > 512) throw new AtlasProviderError("provider_key_invalid");
  if (typeof model !== "string" || !MODEL_ID.test(model)) throw new AtlasProviderError("provider_model_invalid");
  if (!(typeof input === "string" || Array.isArray(input)) || !input.length || typeof instructions !== "string" || instructions.length > 16000) throw new AtlasProviderError("openai_request_invalid");
  const tokens = Math.max(16, Math.min(16000, Number.isInteger(maxOutputTokens) ? maxOutputTokens : 4000));
  const body = {
    model, input, instructions, store: false, stream: !!stream, service_tier: "default", max_output_tokens: tokens,
    ...(modelCapabilities(model).reasoning ? { reasoning: { effort: "low" } } : {}),
    ...(webSearch ? { tools: [{ type: "web_search", search_context_size: "low" }], max_tool_calls: 3 } : {}),
    ...(textFormat ? { text: { format: textFormat } } : {}),
  };
  let serialized;
  try { serialized = JSON.stringify(body); } catch { throw new AtlasProviderError("openai_request_invalid"); }
  if (serialized.length > 512 * 1024) throw new AtlasProviderError("openai_request_invalid");
  const wait = deadline(signal, Math.min(120000, Math.max(1000, timeoutMs)));
  let requestId;
  const emit = async (type, data) => { if (typeof onEvent === "function") await abortable(Promise.resolve().then(() => onEvent(type, data)), wait.signal); };
  try {
    await emit("status", { stage: "connecting" });
    wait.signal.throwIfAborted();
    const response = await abortable(Promise.resolve().then(() => { wait.signal.throwIfAborted(); return send("https://api.openai.com/v1/responses", {
      method: "POST", headers: { Authorization: "Bearer " + secret, "Content-Type": "application/json", Accept: stream ? "text/event-stream" : "application/json" },
      body: serialized, redirect: "manual", signal: wait.signal,
    }); }), wait.signal);
    requestId = safeRequestId(response.headers.get("x-request-id"));
    await checkResponse(response, wait.signal);
    await emit("status", { stage: "responding" });
    if (stream && response.headers.get("Content-Type")?.toLowerCase().includes("text/event-stream")) {
      return await consumeStream(response, { model, signal: wait.signal, onEvent, requestId });
    }
    let value;
    try { value = JSON.parse(await readText(response, wait.signal)); }
    catch (error) { if (error instanceof AtlasProviderError || wait.signal.aborted) throw error; throw new AtlasProviderError("openai_invalid_response", { upstreamRequestId: requestId }); }
    const result = resultFrom(value, model, requestId);
    if (stream) { await emit("delta", { text: result.answer }); for (const source of result.sources) await emit("source", { source }); }
    return result;
  } catch (error) { throw transportError(error, signal, wait.timeout, requestId); }
  finally { wait.close(); }
}
