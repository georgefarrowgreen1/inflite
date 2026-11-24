import { AtlasProviderError, classifyOpenAIError } from "./atlas-openai.js";

// The Agents API is the managed Codex harness; Atlas only owns its task state.
// Contract checked 2026-11-24 against the official sessions, events, hosted
// environments, and files guides: https://developers.openai.com/api/docs/guides/agents-api
// These methods never retry mutations or tie a remote turn to a browser stream.
const ORIGIN = "https://api.openai.com";
const BETA = "agents=v1";
const MiB = 1024 * 1024;
const MAX_JSON_RESPONSE = 8 * MiB;
const MAX_JSON_REQUEST = 16 * MiB;
const MAX_ARTIFACT = 32 * MiB;
const MAX_INPUT_FILE = 50 * MiB;
const encoder = new TextEncoder();
const ID = /^[a-zA-Z0-9_-]{1,256}$/;
const MODEL = /^[a-zA-Z0-9._-]{1,100}$/;
const record = value => value !== null && typeof value === "object" && !Array.isArray(value);

const AGENT_ERRORS = {
  agent_input_invalid: [400, "Atlas could not prepare this coding request. Check the repository and try again."],
  agent_access_unavailable: [403, "This OpenAI key or project does not have access to hosted coding sessions. Enable Agents read and write access and Responses write access for the saved key."],
  agent_files_access_unavailable: [403, "This OpenAI key or project cannot upload the repository workspace. Enable Files read and write access for the saved key."],
  agent_resource_missing: [404, "This coding session or its files are no longer available. Start a new coding task."],
  agent_resource_busy: [409, "The coding workspace is still changing. Check its latest status before trying this action again."],
  agent_budget_exceeded: [429, "This coding session has reached its spending limit."],
};

export class AtlasAgentAPIError extends AtlasProviderError {
  constructor(code, options = {}) {
    super("openai_request_invalid", options);
    const item = AGENT_ERRORS[code] || AGENT_ERRORS.agent_input_invalid;
    this.name = "AtlasAgentAPIError";
    this.code = AGENT_ERRORS[code] ? code : "agent_input_invalid";
    this.status = item[0];
    this.message = item[1];
  }
}

function invalid() { throw new AtlasAgentAPIError("agent_input_invalid"); }
function id(value) { if (typeof value !== "string" || !ID.test(value)) invalid(); return value; }
function requestId(value) { return typeof value === "string" && /^[a-zA-Z0-9_-]{1,128}$/.test(value) ? value : undefined; }
function bounded(value, fallback, min, max) { return Number.isFinite(value) ? Math.max(min, Math.min(max, Math.floor(value))) : fallback; }

function queryString(query = {}, additional = []) {
  if (!record(query)) invalid();
  const allowed = new Set(["after", "limit", "order", ...additional]);
  const values = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (!allowed.has(key)) invalid();
    if (value === undefined || value === null) continue;
    if (key === "limit") {
      if (!Number.isInteger(value) || value < 1 || value > 100) invalid();
    } else if (key === "order") {
      if (!["asc", "desc"].includes(value)) invalid();
    } else id(value);
    values.set(key, String(value));
  }
  return values.size ? "?" + values.toString() : "";
}

function makeDeadline(signal, timeoutMs) {
  const timerController = new AbortController();
  const timer = setTimeout(() => timerController.abort(new DOMException("Request deadline", "TimeoutError")), bounded(timeoutMs, 20000, 1000, 60000));
  return {
    signal: signal ? AbortSignal.any([signal, timerController.signal]) : timerController.signal,
    timedOut: timerController.signal,
    close: () => clearTimeout(timer),
  };
}

function abortable(promise, signal) {
  if (signal.aborted) { Promise.resolve(promise).catch(() => {}); return Promise.reject(signal.reason); }
  let listener;
  const stop = new Promise((_, reject) => {
    listener = () => reject(signal.reason);
    signal.addEventListener("abort", listener, { once: true });
  });
  return Promise.race([promise, stop]).finally(() => signal.removeEventListener("abort", listener));
}

async function readBytes(response, signal, maxBytes) {
  if (!response.body) return new Uint8Array();
  const declared = response.headers.get("Content-Length");
  if (declared && /^\d+$/.test(declared) && Number(declared) > maxBytes) {
    response.body.cancel().catch(() => {});
    throw new AtlasProviderError("openai_response_too_large");
  }
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0, complete = false;
  try {
    while (true) {
      const { value, done } = await abortable(reader.read(), signal);
      if (done) { complete = true; break; }
      size += value.byteLength;
      if (size > maxBytes) throw new AtlasProviderError("openai_response_too_large");
      chunks.push(value);
    }
  } finally {
    if (!complete) reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}

function parseJSON(bytes, allowEmpty = false) {
  if (!bytes.byteLength && allowEmpty) return { accepted: true };
  try {
    const value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    if (!record(value)) throw Error();
    return value;
  } catch { throw new AtlasProviderError("openai_invalid_response"); }
}

function retryAfter(response) {
  const raw = response.headers.get("Retry-After");
  if (!raw) return undefined;
  const seconds = /^\d+(?:\.\d+)?$/.test(raw.trim()) ? Number(raw) : (Date.parse(raw) - Date.now()) / 1000;
  return Number.isFinite(seconds) && seconds >= 0 ? Math.min(3600, seconds) : undefined;
}

async function checkResponse(response, signal, agents) {
  if (response.ok) return;
  const options = { retryAfter: retryAfter(response), upstreamRequestId: response.headers.get("x-request-id") };
  let body;
  if (response.status >= 300 && response.status < 400) response.body?.cancel().catch(() => {});
  else {
    try { body = parseJSON(await readBytes(response, signal, 16384)); }
    catch (error) { if (signal.aborted) throw error; }
  }
  const code = body?.error?.code ?? body?.code;
  let error;
  if (code === "session_budget_exceeded") error = new AtlasAgentAPIError("agent_budget_exceeded", options);
  else if (response.status === 403 && agents) error = new AtlasAgentAPIError("agent_access_unavailable", options);
  else if (response.status === 403) error = new AtlasAgentAPIError("agent_files_access_unavailable", options);
  else if (response.status === 404 && !["model_not_found", "model_not_available", "invalid_model"].includes(code)) error = new AtlasAgentAPIError("agent_resource_missing", options);
  else if (response.status === 409) error = new AtlasAgentAPIError("agent_resource_busy", options);
  else error = classifyOpenAIError(response.status, body, options);
  error.upstreamStatus = response.status;
  throw error;
}

async function request(path, { method = "GET", body, binary = false, allowEmpty = false, events = false, ...opts } = {}) {
  const { secret, send = fetch, signal } = opts;
  if (typeof secret !== "string" || !secret || secret.length > 512 || !/^[\x21-\x7e]+$/.test(secret)) throw new AtlasProviderError("provider_key_invalid");
  const agents = path.startsWith("/v1/agents/");
  const headers = { Authorization: "Bearer " + secret, Accept: binary ? "application/octet-stream" : "application/json" };
  if (agents) headers["OpenAI-Beta"] = BETA;
  if (opts.idempotencyKey !== undefined) {
    // The provider documents Idempotency-Key for input-event submissions only.
    if (!events || typeof opts.idempotencyKey !== "string" || !/^[\x21-\x7e]{1,256}$/.test(opts.idempotencyKey)) invalid();
    headers["Idempotency-Key"] = opts.idempotencyKey;
  }
  let wireBody = body;
  if (body !== undefined && !(body instanceof FormData)) {
    try { wireBody = JSON.stringify(body); } catch { invalid(); }
    if (typeof wireBody !== "string" || encoder.encode(wireBody).byteLength > MAX_JSON_REQUEST) invalid();
    headers["Content-Type"] = "application/json";
  }
  const deadline = makeDeadline(signal, opts.timeoutMs);
  let upstreamRequestId, dispatched = false;
  try {
    deadline.signal.throwIfAborted();
    const response = await abortable(Promise.resolve().then(() => {
      deadline.signal.throwIfAborted();
      dispatched = true;
      return send(ORIGIN + path, { method, headers, body: wireBody, redirect: "manual", signal: deadline.signal });
    }), deadline.signal);
    upstreamRequestId = requestId(response.headers.get("x-request-id"));
    await checkResponse(response, deadline.signal, agents);
    const maxBytes = bounded(opts.maxBytes, binary ? 8 * MiB : 2 * MiB, 1, binary ? MAX_ARTIFACT : MAX_JSON_RESPONSE);
    const bytes = await readBytes(response, deadline.signal, maxBytes);
    return binary ? bytes : parseJSON(bytes, allowEmpty);
  } catch (caught) {
    let error = caught;
    if (!(error instanceof AtlasProviderError)) {
      const code = deadline.timedOut.aborted || error?.name === "TimeoutError" ? "openai_timeout" : signal?.aborted || error?.name === "AbortError" ? "request_cancelled" : "openai_network";
      error = new AtlasProviderError(code, { upstreamRequestId });
    }
    if (upstreamRequestId && !error.upstreamRequestId) error.upstreamRequestId = upstreamRequestId;
    // Do not silently submit a second task after a lost create/input response.
    if (dispatched && method !== "GET" && (!error.upstreamStatus || error.upstreamStatus >= 500)) error.acceptanceUnknown = true;
    throw error;
  } finally { deadline.close(); }
}

function asObject(value) { if (!record(value)) invalid(); return value; }
function sessionPath(sessionId) { return "/v1/agents/sessions/" + id(sessionId); }
function environmentPath(environmentId) { return "/v1/agents/environments/" + id(environmentId); }

export async function agentSessionCreate(body, opts = {}) {
  asObject(body);
  if (!record(body.agent) || !MODEL.test(body.agent.model || "") || body.environment?.type !== "openai_hosted" || body.stream === true) invalid();
  const result = await request("/v1/agents/sessions", { ...opts, method: "POST", body: { ...body, stream: false } });
  if (typeof result.id !== "string" || !ID.test(result.id)) {
    const error = new AtlasProviderError("openai_invalid_response"); error.acceptanceUnknown = true; throw error;
  }
  return result;
}

export function agentSessionsList(query = {}, opts = {}) {
  // List supports pagination, not a metadata filter. Recovery can inspect the
  // atlas_run_id metadata on returned sessions, without assuming server filters.
  return request("/v1/agents/sessions" + queryString(query), opts);
}
export function agentSessionGet(sessionId, opts = {}) { return request(sessionPath(sessionId), opts); }
export function agentSessionUpdate(sessionId, body, opts = {}) { return request(sessionPath(sessionId), { ...opts, method: "POST", body: asObject(body) }); }
export function agentSessionDelete(sessionId, opts = {}) { return request(sessionPath(sessionId), { ...opts, method: "DELETE", allowEmpty: true }); }
export function agentEnvironmentGet(environmentId, opts = {}) { return request(environmentPath(environmentId), opts); }

export function agentSessionEvents(sessionId, events, opts = {}) {
  if (!Array.isArray(events) || !events.length || events.length > 100 || !events.every(record)) invalid();
  const body = { events };
  // Session input has a 4MiB runtime limit. Leave headroom for runtime metadata.
  let size;
  try { size = encoder.encode(JSON.stringify(body)).byteLength; } catch { invalid(); }
  if (size > 4 * MiB - 16384) invalid();
  return request(sessionPath(sessionId) + "/events", { ...opts, method: "POST", body, events: true, allowEmpty: true });
}
export function agentSessionCancel(sessionId, opts = {}) {
  return agentSessionEvents(sessionId, [{ type: "agent.session.input.cancel" }], opts);
}
export function agentSessionItems(sessionId, query = {}, opts = {}) { return request(sessionPath(sessionId) + "/items" + queryString(query), opts); }
export function agentSessionTurns(sessionId, query = {}, opts = {}) { return request(sessionPath(sessionId) + "/turns" + queryString(query), opts); }
export function agentSessionTurnGet(sessionId, turnId, opts = {}) { return request(sessionPath(sessionId) + "/turns/" + id(turnId), opts); }
export function agentSessionArtifacts(sessionId, query = {}, opts = {}) { return request(sessionPath(sessionId) + "/artifacts" + queryString(query, ["environment_id"]), opts); }
export function agentArtifactContent(sessionId, artifactId, opts = {}) { return request(sessionPath(sessionId) + "/artifacts/" + id(artifactId) + "/content", { ...opts, binary: true }); }

function environmentFile(file) {
  asObject(file);
  if (typeof file.path !== "string" || !file.path.startsWith("/workspace/") || file.path.length > 4096 || /[\\\x00-\x1f\x7f]/.test(file.path) || file.path.split("/").slice(2).some(part => !part || part === "." || part === ".." || encoder.encode(part).length > 255)) invalid();
  if (file.type === "file_id") return { type: "file_id", path: file.path, file_id: id(file.file_id) };
  if (file.type !== "inline" || typeof file.data !== "string" || file.data.length > 6990508 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(file.data)) invalid();
  const padding = file.data.endsWith("==") ? 2 : file.data.endsWith("=") ? 1 : 0;
  if (file.data.length / 4 * 3 - padding > 5 * MiB) invalid();
  return { type: "inline", path: file.path, data: file.data };
}
export function agentEnvironmentWriteFile(environmentId, file, opts = {}) {
  return request(environmentPath(environmentId) + "/files", { ...opts, method: "POST", body: environmentFile(file) });
}

export function agentInputFileUpload(bytes, opts = {}) {
  const filename = opts.filename ?? "atlas-repository.tar.gz";
  const expiresAfterSeconds = opts.expiresAfterSeconds ?? 86400;
  if (typeof filename !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(filename) || !Number.isInteger(expiresAfterSeconds) || expiresAfterSeconds < 3600 || expiresAfterSeconds > 2592000) invalid();
  let blob;
  if (bytes instanceof Blob) blob = bytes;
  else if (bytes instanceof ArrayBuffer || ArrayBuffer.isView(bytes)) blob = new Blob([bytes], { type: "application/octet-stream" });
  else invalid();
  if (!blob.size || blob.size > MAX_INPUT_FILE) invalid();
  const form = new FormData();
  form.set("purpose", "user_data");
  form.set("file", blob, filename);
  form.set("expires_after[anchor]", "created_at");
  form.set("expires_after[seconds]", String(expiresAfterSeconds));
  return request("/v1/files", { ...opts, method: "POST", body: form });
}
export function agentInputFileDelete(fileId, opts = {}) { return request("/v1/files/" + id(fileId), { ...opts, method: "DELETE", allowEmpty: true }); }

export const AGENT_SESSION_STATUSES = Object.freeze(["idle", "in_progress", "requires_action", "failed", "budget_reached"]);
export const AGENT_TURN_STATUSES = Object.freeze(["queued", "in_progress", "waiting", "completed", "failed", "cancelled"]);
export const AGENT_TERMINAL_TURN_STATUSES = Object.freeze(["completed", "failed", "cancelled"]);
