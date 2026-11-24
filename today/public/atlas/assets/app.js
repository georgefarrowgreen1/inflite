/* Atlas client. Private content lives only in this page's memory; server ownership
   is checked on every response, including every new streaming response. */
import { createSheets } from "../../roof/sheet.js";
import { toast as showToast } from "../../roof/toast.js";

export function safeUrl(value) {
  try { const u = new URL(String(value)); return u.protocol === "https:" && !u.username && !u.password ? u.href : null; } catch { return null; }
}
export async function* streamEvents(body, { signal, maxBytes = 8 * 1024 * 1024 } = {}) {
  if (!body?.getReader) throw Error("The response stream is unavailable.");
  const reader = body.getReader(), decoder = new TextDecoder();
  let buffer = "", event = "message", data = [], total = 0;
  function line(value) {
    if (value.endsWith("\r")) value = value.slice(0, -1);
    if (!value) { const out = data.length ? { event, data: data.join("\n") } : null; event = "message"; data = []; return out; }
    if (value.startsWith(":")) return null;
    const colon = value.indexOf(":"), key = colon < 0 ? value : value.slice(0, colon);
    let valuePart = colon < 0 ? "" : value.slice(colon + 1); if (valuePart.startsWith(" ")) valuePart = valuePart.slice(1);
    if (key === "event") event = valuePart; else if (key === "data") data.push(valuePart);
    return null;
  }
  const stop = () => reader.cancel().catch(() => {});
  signal?.addEventListener("abort", stop, { once: true });
  try {
    for (;;) {
      if (signal?.aborted) throw new DOMException("Request stopped", "AbortError");
      const { value, done } = await reader.read();
      if (signal?.aborted) throw new DOMException("Request stopped", "AbortError");
      if (value) { total += value.byteLength; if (total > maxBytes) throw Error("The response was too large."); buffer += decoder.decode(value, { stream: true }); }
      if (done) buffer += decoder.decode();
      let end;
      while ((end = buffer.indexOf("\n")) >= 0) { const result = line(buffer.slice(0, end)); buffer = buffer.slice(end + 1); if (result) yield result; }
      if (buffer.length > 1024 * 1024) throw Error("The response event was too large.");
      if (done) { if (buffer) { const result = line(buffer); if (result) yield result; } const result = line(""); if (result) yield result; break; }
    }
  } finally { signal?.removeEventListener("abort", stop); await reader.cancel().catch(() => {}); reader.releaseLock(); }
}

const $ = id => document.getElementById(id);
const modeNames = { research: "Research", developer: "Developer", personal: "Personal", fitness: "Cycling & fitness", tasks: "Task planning" };
const state = { owner: null, epoch: 0, controllers: new Set(), health: null, settings: null, conversations: [], conversation: null, messages: [], messagePage: {}, activeId: null, context: [], repositories: [], models: [], stream: null, dispatching: false, navigation: 0, contextLoad: 0, contexts: [], tasks: [], scheduleContext: [], patches: [], selectedPatch: null, codingRuns: [], codingObserver: null, codingLoading: false, codingLoadError: "", codingContinuation: null, codingReview: null, codingDispatching: false, drafts: new Map(), privateReady: false, checking: null };
let sheets, navigationSheet, activeToast;
const mobileQuery = "(max-width: 720px)";
function node(tag, className, text) { const el = document.createElement(tag); if (className) el.className = className; if (text != null) el.textContent = String(text); return el; }
function button(text, action, className = "") { const el = node("button", className, text); el.type = "button"; el.addEventListener("click", action); return el; }
function timestamp(value) { if (!value) return ""; const d = new Date(typeof value === "string" && /^\d+$/.test(value) ? Number(value) : value); return Number.isNaN(d.getTime()) ? "" : d.toLocaleString([], { dateStyle: "medium", timeStyle: "short" }); }
function shortDate(value) { if (!value) return ""; return new Date(Number(value) || value).toLocaleDateString([], { month: "short", day: "numeric" }); }
function money(value) { return typeof value === "number" && Number.isFinite(value) ? "$" + value.toFixed(value < 0.01 && value > 0 ? 4 : 2) : "Unavailable"; }
function uuid() { return crypto.randomUUID(); }
function toast(message) {
  activeToast = showToast(message);
  const dialog = sheets.top()?.el;
  if (dialog) dialog.append([...document.querySelectorAll(".ifl-toast")].at(-1));
}
function feedback(id, message, error = false) { const el = $(id); el.textContent = message || ""; el.classList.toggle("error", error); }
function errorText(error) { return (error?.message || "Something went wrong. Try again.") + (error?.requestId ? " Reference: " + error.requestId : ""); }
async function busy(control, action, feedbackId) {
  if (control.disabled || control.classList.contains("busy-label")) return; control.disabled = true; control.classList.add("busy-label");
  try { return await action(); } catch (error) { if (error.accountChanged) return; if (feedbackId) feedback(feedbackId, errorText(error), true); else toast(errorText(error)); }
  finally { control.disabled = false; control.classList.remove("busy-label"); updateComposer(); }
}
function clearPrivateState(message = "Your session changed. Checking access…") {
  detachCodingObserver(); state.codingRuns = []; state.codingContinuation = null; state.codingReview = null; state.codingLoading = false; state.codingLoadError = ""; state.codingDispatching = false;
  state.epoch++; state.stream?.controller.abort(); state.stream = null; state.dispatching = false; state.owner = null; state.health = null; state.conversation = null; state.conversations = []; state.messages = []; state.activeId = null; state.context = []; state.contexts = []; state.repositories = []; state.models = []; state.tasks = []; state.scheduleContext = []; state.patches = []; state.selectedPatch = null; state.settings = null; state.privateReady = false; state.drafts.clear(); state.navigation++; state.contextLoad++;
  for (const controller of state.controllers) controller.abort(); state.controllers.clear(); state.messagePage = {};
  for (const id of ["messages", "conversation-list", "attached-context", "provider-health", "usage-totals", "usage-requests", "briefs-list", "brief-detail", "context-list", "patches-list", "patch-detail", "schedules-list", "schedule-runs-list", "schedule-context", "thread-summary-text"]) $(id)?.replaceChildren();
  for (const id of ["prompt", "provider-key", "github-token", "memory-text", "schedule-prompt", "schedule-title", "conversation-search"]) if ($(id)) $(id).value = "";
  sheets.closeAll();
  activeToast?.close();
  for (const notice of document.querySelectorAll(".ifl-toast")) notice.remove();
  for (const id of ["provider-feedback", "github-feedback", "preferences-feedback", "patch-feedback", "context-feedback", "schedule-feedback", "context-repository", "github-health", "conversation-status", "coding-feedback", "toast"]) if ($(id)) $(id).textContent = "";
  for (const id of ["repository", "schedule-repository", "provider-model"]) if ($(id)) $(id).replaceChildren();
  $("schedule-id").value = ""; $("fitness-consent").checked = false; $("schedule-fitness-consent").checked = false; $("memory-enabled").checked = false; $("conversation-menu").hidden = true; $("thread-summary").hidden = true; $("older-history").hidden = true; $("schedule-form").hidden = true; $("schedule-runs").hidden = true;
  replaceConversationUrl(null); navigation(false);
  $("conversation-title").textContent = "New conversation"; $("connection-label").textContent = "Sign in required"; $("session-notice").textContent = message; document.body.classList.add("session-check"); updateComposer();
}
function checkEpoch(epoch) { if (epoch !== state.epoch) { const error = Error("This response belongs to a previous session."); error.accountChanged = true; throw error; } }
function inspectOwner(response, data, { health = false } = {}) {
  const next = response.headers.get("X-Atlas-Owner") || (health && typeof data?.owner === "string" ? data.owner : null);
  if ((state.owner && next && state.owner !== next) || data?.code === "session_changed") { clearPrivateState(); const e = Error("Your account changed. Reloading Atlas…"); e.accountChanged = true; queueMicrotask(() => bootstrap()); throw e; }
  if ((response.status === 401 || response.status === 403) && (["sign_in_required", "access_denied"].includes(data?.code) || /^(Sign in required|Access denied)$/.test(data?.error || ""))) {
    clearPrivateState("Sign in to InFlite to continue. Your private workspace has been cleared.");
    const link = node("a", "", "Open InFlite sign-in"); link.href = "/account"; $("session-notice").append(node("br"), link);
    const error = Error(data.error || "Sign in to continue."); error.accountChanged = true; throw error;
  }
  if (response.ok && !next) throw Error("Atlas could not verify this response's account. Refresh the page.");
  if (next && !state.owner) state.owner = next;
  return next;
}
async function api(path, method = "GET", body, { signal, timeout = 120000 } = {}) {
  const epoch = state.epoch, controller = new AbortController(), timer = setTimeout(() => controller.abort(), timeout);
  state.controllers.add(controller);
  const stop = () => controller.abort(); signal?.addEventListener("abort", stop, { once: true });
  if (signal?.aborted) controller.abort();
  try {
    const response = await fetch("/atlas/api/" + path, { method, credentials: "same-origin", cache: "no-store", headers: { "Content-Type": "application/json", "X-Inflite": "1", ...(state.owner ? { "X-Atlas-Owner": state.owner } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: controller.signal });
    let data; try { data = await response.json(); } catch { throw Error("Atlas returned an unreadable response. Try again."); }
    checkEpoch(epoch); inspectOwner(response, data, { health: path === "health" });
    if (!response.ok) { const e = Error(data.error || "Request failed."); e.code = data.code; e.requestId = data.requestId; e.status = response.status; throw e; }
    return data;
  } catch (error) { checkEpoch(epoch); throw error; }
  finally { clearTimeout(timer); signal?.removeEventListener("abort", stop); state.controllers.delete(controller); }
}
async function download(path, name) {
  const epoch = state.epoch;
  const response = await fetch("/atlas/api/" + path, { credentials: "same-origin", cache: "no-store", headers: { "X-Inflite": "1", ...(state.owner ? { "X-Atlas-Owner": state.owner } : {}) } });
  if (!response.ok) { let data = {}; try { data = await response.json(); } catch {} checkEpoch(epoch); inspectOwner(response, data); throw Error(data.error || "The export could not be downloaded."); }
  checkEpoch(epoch); inspectOwner(response, null); const blob = await response.blob(); checkEpoch(epoch); const url = URL.createObjectURL(blob), a = node("a"); a.href = url; a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function titleFilename(value) { return (String(value || "atlas").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "atlas") + ".md"; }
function placeSidebar(mobile) {
  if (!mobile) navigation(false);
  $(mobile ? "navigation-slot" : "sidebar-slot").append($("atlas-sidebar"));
}
function navigation(open) {
  if (!open) return navigationSheet?.now();
  if (navigationSheet || !matchMedia(mobileQuery).matches) return;
  const toggle = $("navigation-toggle");
  toggle.setAttribute("aria-expanded", "true");
  toggle.focus({ preventScroll: true });
  navigationSheet = sheets.openEl($("navigation-dialog"), { onClose: () => {
    navigationSheet = null;
    toggle.setAttribute("aria-expanded", "false");
  } });
}
function openDialog(name, trigger) {
  navigation(false);
  const top = sheets.top();
  if (top?.el.id === "workspace-dialog" && name !== "workspace") {
    top.now();
    trigger = $("open-workspace");
  }
  trigger?.focus({ preventScroll: true });
  return sheets.openEl($(name + "-dialog"));
}
function fitComposerViewport() {
  const viewport = window.visualViewport;
  const body = document.body;
  const height = document.documentElement.clientHeight;
  const typing = matchMedia("(any-pointer: coarse)").matches && document.activeElement === $("prompt");
  if ((typing || body.classList.contains("atlas-keyboard")) && viewport && Math.abs(viewport.scale - 1) < .01 && height - viewport.height > 80) {
    body.style.setProperty("--atlas-visible-height", Math.round(viewport.height) + "px");
    body.style.setProperty("--atlas-visible-top", Math.round(viewport.offsetTop) + "px");
    body.classList.add("atlas-keyboard");
  } else {
    body.classList.remove("atlas-keyboard");
    body.style.removeProperty("--atlas-visible-height");
    body.style.removeProperty("--atlas-visible-top");
  }
}
function currentModel() { return $("provider-model").value === "custom" ? $("provider-custom-model").value.trim() : $("provider-model").value; }
function updateModelHelp() { const model = state.models.find(item => item.id === currentModel()); $("model-help").textContent = model?.note || (model?.available === false ? "This saved model is unavailable to the current project. Choose an available model or reconnect another project." : model?.capabilitiesVerified === false ? "Saved custom model. Its workspace capabilities are unverified; test a short response before using it." : model ? "This model is available to your project. A short test checks the selected workflow." : $("provider-model").value === "custom" ? "Enter a Responses-compatible model ID. Its availability is checked when you save; workspace capabilities may remain unverified." : "Save a connection to check models available to your OpenAI project."); }
function fillModels(models = [], selected) {
  const select = $("provider-model"), previous = selected || currentModel() || "gpt-6.2-sol";
  state.models = models; select.replaceChildren(); const seen = new Set();
  for (const model of models) { if (!model?.id || seen.has(model.id)) continue; seen.add(model.id); const option = node("option", "", (model.label || model.id) + (model.available === false ? " (unavailable)" : model.capabilitiesVerified === false ? " (capabilities unverified)" : "")); option.value = model.id; option.disabled = model.available === false; select.append(option); }
  if (!models.length) { const option = node("option", "", "GPT-6.2 Sol"); option.value = "gpt-6.2-sol"; select.append(option); seen.add(option.value); }
  const custom = node("option", "", "Enter a model ID…"); custom.value = "custom"; select.append(custom);
  select.value = seen.has(previous) ? previous : "custom"; $("provider-custom-model").value = previous; $("custom-model-label").hidden = select.value !== "custom";
  updateModelHelp();
}
function renderHealth() {
  const health = state.health, provider = health?.provider || {}, ready = health?.storage?.ready === true;
  const codingUpgrade = ready && health?.coding?.storageReady === false;
  $("setup-banner").hidden = ready && !codingUpgrade; $("upgrade-storage").disabled = !health; $("upgrade-storage").hidden = health?.storage?.code === "storage_missing";
  $("setup-message").textContent = health?.storage?.code === "storage_missing" ? "Connect Atlas storage in the deployment settings, then reload this page." : codingUpgrade ? "Upgrade storage to save coding tasks and reconnect to their progress. Your conversations are ready to use." : "Prepare storage for conversations, sources and saved work.";
  $("upgrade-storage").textContent = codingUpgrade ? "Enable coding tasks" : "Prepare workspace";
  const status = $("connection-status");
  let label = "Connect OpenAI", kind = "attention";
  if (!ready) label = "Finish setup";
  else if (provider.keySaved && provider.decryptable === false) { label = "Connection needs attention"; kind = "error"; }
  else if (provider.error || provider.lastErrorCode) { label = "Connection needs attention"; kind = "error"; }
  else if (provider.keySaved && provider.lastSuccessAt) { label = "Ready · " + (provider.model || "OpenAI"); kind = "ready"; }
  else if (provider.keySaved) label = "Key saved · Test connection";
  $("connection-label").textContent = label; status.dataset.state = kind;
  const summary = $("provider-health"); summary.replaceChildren();
  const pill = (text, ok) => summary.append(node("span", "health-pill " + (ok ? "ok" : ""), text));
  pill(ready ? "Storage ready" : "Storage setup needed", ready);
  pill(provider.keySaved ? "Key saved" : "No key saved", provider.keySaved);
  if (provider.keySaved) pill(provider.decryptable ? "Saved key readable" : "Saved key unavailable", provider.decryptable);
  if (provider.lastSuccessAt) summary.append(node("span", "health-pill", "Last successful response: " + timestamp(provider.lastSuccessAt)));
  if (typeof provider.error === "string" && provider.error) summary.append(node("p", "field-feedback error", provider.error));
  else if (provider.lastErrorCode) summary.append(node("span", "health-pill error", "Last check: " + provider.lastErrorCode.replaceAll("_", " ")));
  $("test-provider").disabled = !ready || !provider.keySaved || provider.decryptable === false;
  $("load-models").disabled = !provider.keySaved; $("remove-provider").disabled = !provider.keySaved;
  if (provider.model && !$("provider-form").contains(document.activeElement)) fillModels(state.models, provider.model);
  $("github-health").textContent = health?.github?.connected ? "Connected" + (health.github.login ? " as " + health.github.login : "") : "Public repositories are available without a saved GitHub token.";
  const scheduling = health?.scheduling;
  $("scheduling-status").textContent = scheduling?.available ? "Tasks are saved paused. Enabling a task allows recurring API usage." : scheduling?.reason || "Tasks can be drafted. Recurring execution needs deployment configuration.";
  updateComposer();
}
function updateComposer() {
  const ready = state.privateReady && state.health?.storage?.ready && state.health?.provider?.keySaved && state.health?.provider?.decryptable !== false && !state.conversation?.archived;
  $("send").disabled = !ready || !!state.stream || state.dispatching || state.codingDispatching || !$("prompt").value.trim();
  $("stop-response").hidden = !state.stream;
  $("mode").disabled = !!state.activeId; $("repository").disabled = !!state.activeId;
  const mode = state.conversation?.mode || $("mode").value;
  $("workspace-label").textContent = modeNames[mode] || mode;
  $("repository-control").hidden = mode !== "developer"; $("fitness-control").hidden = mode !== "fitness"; $("start-coding").hidden = mode !== "developer";
  $("repository-note").hidden = mode !== "developer" || !$("repository").value;
  const continuation = state.codingRuns.find(run => run.id === state.codingContinuation && run.canContinue);
  if (!continuation) state.codingContinuation = null;
  const activeTask = state.codingRuns.some(run => codingActive(run) && run.id !== continuation?.id);
  $("start-coding").textContent = continuation ? "Continue task" : "Work on task";
  $("start-coding").disabled = !ready || state.health?.coding?.ready !== true || state.health?.coding?.storageReady !== true || !$("repository").value || !!state.stream || state.dispatching || state.codingDispatching || state.codingLoading || !!state.codingLoadError || activeTask || !$("prompt").value.trim();
  $("coding-options").hidden = mode !== "developer";
  $("coding-health").textContent = state.health?.coding?.ready ? "" : state.health?.coding?.message || "Coding tasks are unavailable. You can still ask Atlas about this repository with Send.";
  $("coding-health").hidden = !$("coding-health").textContent;
  $("coding-continue-note").hidden = !continuation;
  $("coding-continue-label").textContent = continuation ? "Next instruction for: " + continuation.prompt : "";
  const publish = $("publish-coding"), reviewedRun = state.codingRuns.find(run => run.id === state.codingReview?.id);
  if (publish && reviewedRun) publish.disabled = publish.classList.contains("busy-label") || reviewedRun.revision !== state.codingReview.revision || !reviewedRun.reviewReady || codingActive(reviewedRun) || !state.health?.github?.connected;
  $("attach-context").disabled = !$("repository").value || !state.health?.storage?.ready;
  const needsProvider = state.privateReady && state.health?.storage?.ready && (!state.health.provider?.keySaved || state.health.provider?.decryptable === false);
  $("connect-provider").hidden = !needsProvider;
  $("connect-provider").textContent = state.health?.provider?.keySaved ? "Check provider connection" : "Connect provider";
  $("composer-hint").textContent = !state.health?.storage?.ready ? "Prepare the workspace to start a conversation." : state.conversation?.archived ? "Restore this conversation to continue." : state.stream && state.stream.conversationId !== state.activeId ? "A response is running in another conversation." : "";
  $("composer-hint").hidden = !$("composer-hint").textContent;
}
function saveDraft() { state.drafts.set(state.activeId || "new", { prompt: $("prompt").value, context: [...state.context], fitness: $("fitness-consent").checked }); }
function restoreDraft(id) { const draft = state.drafts.get(id || "new"); $("prompt").value = draft?.prompt || ""; state.context = draft?.context || []; $("fitness-consent").checked = !!draft?.fitness; renderContextChips(); resizePrompt(); }
function renderThreads() {
  const list = $("conversation-list"), query = $("conversation-search").value.trim().toLowerCase(); list.replaceChildren();
  const rows = state.conversations.filter(c => !query || String(c.title).toLowerCase().includes(query));
  for (const c of rows) { const b = button("", () => selectConversation(c.id)); b.setAttribute("aria-current", String(c.id === state.activeId)); b.append(node("span", "thread-name", c.title || "Untitled conversation"), node("span", "thread-date", (modeNames[c.mode] || c.mode) + " · " + shortDate(c.updated_at || c.created_at))); list.append(b); }
  if (!rows.length) list.append(node("p", "muted empty-small", query ? "No matching conversations." : $("show-archived").checked ? "No archived conversations." : "Your conversations will appear here."));
}
async function loadThreads() { const result = await api("conversations?archived=" + ($("show-archived").checked ? "1" : "0")); state.conversations = result.conversations || []; renderThreads(); }
function replaceConversationUrl(id) { const url = new URL(location.href); if (id) url.searchParams.set("conversation", id); else url.searchParams.delete("conversation"); history.replaceState(null, "", url.pathname + url.search); }
async function selectConversation(id, { preserveDraft = false } = {}) {
  if (!preserveDraft) saveDraft(); detachCodingObserver(); state.codingRuns = []; state.codingContinuation = null; state.codingLoadError = ""; state.codingLoading = false; const generation = ++state.navigation; navigation(false); feedback("coding-feedback", ""); $("conversation-status").textContent = "Loading conversation…";
  try {
    const result = await api("conversations/" + encodeURIComponent(id)); if (generation !== state.navigation) return;
    state.conversation = result.conversation; state.activeId = id; state.messages = result.messages || []; if (state.stream?.conversationId === id) { const at = state.messages.findIndex(m => m.id === state.stream.message.id); if (at < 0) state.messages.push(state.stream.message); else state.messages[at] = state.stream.message; } $("mode").value = state.conversation.mode; setRepository(state.conversation.repository || "");
    $("conversation-title").textContent = state.conversation.title || "Untitled conversation"; $("conversation-menu").hidden = false; $("conversation-menu").open = false;
    $("archive-conversation").textContent = state.conversation.archived ? "Restore conversation" : "Archive";
    $("thread-summary").hidden = !state.conversation.summary; $("thread-summary-text").textContent = state.conversation.summary || "";
    state.messagePage = { hasMore: !!result.hasMore, nextBeforeId: result.nextBeforeId }; $("older-history").hidden = !state.messagePage.hasMore;
    restoreDraft(id); renderMessages(); renderThreads(); updateComposer(); replaceConversationUrl(id); $("conversation-status").textContent = ""; await observeCodingRuns();
  } catch (error) { if (generation === state.navigation) { $("conversation-status").textContent = errorText(error); toast(errorText(error)); } }
}
function newConversation(mode) { feedback("coding-feedback", ""); saveDraft(); detachCodingObserver(); state.codingRuns = []; state.codingContinuation = null; state.codingLoadError = ""; state.codingLoading = false; state.navigation++; state.activeId = null; state.conversation = null; state.messages = []; state.messagePage = {}; state.context = []; $("conversation-title").textContent = "New conversation"; $("conversation-menu").hidden = true; $("thread-summary").hidden = true; $("older-history").hidden = true; if (mode && modeNames[mode]) $("mode").value = mode; restoreDraft(null); renderMessages(); renderThreads(); updateComposer(); replaceConversationUrl(null); navigation(false); $("prompt").focus(); }
async function loadOlderMessages(control) { await busy(control, async () => { const id = state.activeId, generation = state.navigation, before = state.messagePage.nextBeforeId; if (!id || !state.messagePage.hasMore || !before) return; const result = await api("conversations/" + encodeURIComponent(id) + "?before=" + encodeURIComponent(before) + "&limit=100"); if (id !== state.activeId || generation !== state.navigation) return; const container = $("messages"), height = container.scrollHeight, top = container.scrollTop, known = new Set(state.messages.map(m => m.id)); state.messages = [...(result.messages || []).filter(m => !known.has(m.id)), ...state.messages]; state.messagePage = { hasMore: !!result.hasMore, nextBeforeId: result.nextBeforeId }; $("older-history").hidden = !state.messagePage.hasMore; renderMessages(); container.scrollTop = container.scrollHeight - height + top; }); }
async function ensureConversation(snapshot = {}) {
  if (state.activeId) return state.conversation;
  const generation = state.navigation, mode = snapshot.mode || $("mode").value, repository = snapshot.repository ?? $("repository").value;
  const result = await api("conversations", "POST", { title: (snapshot.prompt ?? $("prompt").value).trim().slice(0, 80) || "New conversation", mode, repository: mode === "developer" ? repository || null : null });
  if (generation === state.navigation && !state.activeId) { state.conversation = result.conversation; state.activeId = result.conversation.id; $("conversation-title").textContent = result.conversation.title; $("conversation-menu").hidden = false; replaceConversationUrl(state.activeId); updateComposer(); }
  loadThreads().catch(() => {}); return result.conversation;
}
function inlineMarkdown(target, text) {
  const pattern = /(`[^`\n]+`|\*\*[^*\n]+\*\*|__[^_\n]+__|\[[^\]\n]+\]\([^\s)]+\))/g;
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    if (match.index > last) target.append(document.createTextNode(text.slice(last, match.index)));
    const token = match[0];
    if (token.startsWith("`")) target.append(node("code", "", token.slice(1, -1)));
    else if (token.startsWith("**") || token.startsWith("__")) target.append(node("strong", "", token.slice(2, -2)));
    else { const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(token), url = safeUrl(link?.[2]); if (url) { const a = node("a", "", link[1]); a.href = url; a.target = "_blank"; a.rel = "noopener noreferrer"; target.append(a); } else target.append(document.createTextNode(token)); }
    last = match.index + token.length;
  }
  if (last < text.length) target.append(document.createTextNode(text.slice(last)));
}
function citationLinks(target, sources, start, end) {
  const seen = new Set(); sources.forEach((source, i) => { const at = Number(source.start_index); const url = safeUrl(source.url); if (!url || !Number.isFinite(at) || at < start || at >= end || seen.has(url)) return; seen.add(url); const a = node("a", "inline-citation", String(i + 1)); a.href = url; a.target = "_blank"; a.rel = "noopener noreferrer"; a.title = source.title || new URL(url).hostname; a.setAttribute("aria-label", "Source " + (i + 1) + ": " + a.title); target.append(a); });
}
export function renderMarkdown(target, value, sources = []) {
  target.replaceChildren(); const text = String(value || ""), lines = text.split("\n"); let i = 0, offset = 0;
  const cellText = line => line.trim().replace(/^\||\|$/g, "").split("|").map(x => x.trim());
  const appendText = (el, raw, start) => { inlineMarkdown(el, raw); citationLinks(el, sources, start, start + raw.length + 1); target.append(el); };
  while (i < lines.length) {
    const line = lines[i], start = offset;
    if (!line.trim()) { offset += line.length + 1; i++; continue; }
    if (/^\s*```/.test(line)) {
      const language = line.trim().slice(3).trim().slice(0, 40); offset += line.length + 1; i++; const code = [];
      while (i < lines.length && !/^\s*```/.test(lines[i])) { code.push(lines[i]); offset += lines[i].length + 1; i++; }
      if (i < lines.length) { offset += lines[i].length + 1; i++; }
      const box = node("div", "code-block"), head = node("div", "code-header"), pre = node("pre"), content = node("code", "", code.join("\n")); head.append(node("span", "", language || "Code"), button("Copy code", async e => { try { await navigator.clipboard.writeText(code.join("\n")); e.currentTarget.textContent = "Copied"; } catch { toast("Select and copy the code manually."); } })); pre.append(content); box.append(head, pre); target.append(box); continue;
    }
    if (i + 1 < lines.length && line.includes("|") && /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(lines[i + 1])) {
      const wrapper = node("div", "table-scroll"), table = node("table"), head = node("thead"), row = node("tr"); for (const cell of cellText(line)) { const th = node("th"); inlineMarkdown(th, cell); row.append(th); } head.append(row); table.append(head); offset += line.length + lines[i + 1].length + 2; i += 2; const tbody = node("tbody");
      while (i < lines.length && lines[i].includes("|") && lines[i].trim()) { const tr = node("tr"); for (const cell of cellText(lines[i])) { const td = node("td"); inlineMarkdown(td, cell); tr.append(td); } tbody.append(tr); offset += lines[i].length + 1; i++; } table.append(tbody); wrapper.append(table); target.append(wrapper); continue;
    }
    const heading = /^(#{1,4})\s+(.+)$/.exec(line); if (heading) { appendText(node("h" + Math.min(heading[1].length + 1, 4)), heading[2], start); offset += line.length + 1; i++; continue; }
    if (/^\s*>/.test(line)) { const quote = node("blockquote"); inlineMarkdown(quote, line.replace(/^\s*>\s?/, "")); citationLinks(quote, sources, start, start + line.length + 1); target.append(quote); offset += line.length + 1; i++; continue; }
    const listMatch = /^\s*(?:[-*+]\s+|\d+[.)]\s+)/.exec(line);
    if (listMatch) { const list = node(/^\s*\d/.test(line) ? "ol" : "ul"); while (i < lines.length && /^\s*(?:[-*+]\s+|\d+[.)]\s+)/.test(lines[i])) { const li = node("li"); inlineMarkdown(li, lines[i].replace(/^\s*(?:[-*+]\s+|\d+[.)]\s+)/, "")); citationLinks(li, sources, offset, offset + lines[i].length + 1); list.append(li); offset += lines[i].length + 1; i++; } target.append(list); continue; }
    const paragraph = [line]; offset += line.length + 1; i++; while (i < lines.length && lines[i].trim() && !/^(?:#{1,4}\s|\s*```|\s*>|\s*[-*+]\s|\s*\d+[.)]\s)/.test(lines[i]) && !(i + 1 < lines.length && /^\s*\|?\s*:?-{3,}/.test(lines[i + 1]))) { paragraph.push(lines[i]); offset += lines[i].length + 1; i++; }
    const p = node("p"); inlineMarkdown(p, paragraph.join("\n")); citationLinks(p, sources, start, offset); target.append(p);
  }
}
function sourceList(sources = []) { const list = node("ol", "source-list"); const seen = new Set(); sources.forEach((source, i) => { const url = safeUrl(source.url); if (!url || seen.has(url)) return; seen.add(url); const li = node("li"), a = node("a", "", (i + 1) + ". " + (source.title || new URL(url).hostname)); a.href = url; a.target = "_blank"; a.rel = "noopener noreferrer"; a.title = source.title || url; li.append(a); list.append(li); }); return list; }
function renderMessages() {
  const container = $("messages"); container.replaceChildren();
  if (!state.messages.length && !state.codingRuns.length && !state.codingLoadError) {
    const welcome = $("welcome-template").content.cloneNode(true);
    for (const starter of welcome.querySelectorAll("[data-starter]")) starter.addEventListener("click", () => {
      if (!state.activeId && $("mode").value !== starter.dataset.mode) {
        $("mode").value = starter.dataset.mode;
        $("mode").dispatchEvent(new Event("change"));
      }
      $("prompt").value = starter.dataset.starter;
      resizePrompt(); updateComposer(); $("prompt").focus();
    });
    container.append(welcome);
    return;
  }
  for (const message of state.messages) container.append(messageElement(message));
  renderCodingRuns();
  container.scrollTop = container.scrollHeight;
}
function messageElement(message) {
  const group = node("section", "turn"); group.dataset.messageId = message.id;
  const user = node("article", "message user"), userBody = node("div", "message-content", message.prompt); user.append(userBody); group.append(user);
  const assistant = node("article", "message assistant"), heading = node("div", "message-heading"); heading.append(node("span", "assistant-label", "Atlas"));
  const status = node("span", "message-status", message.status === "running" ? "Responding…" : message.status === "completed" ? "" : message.status || ""); status.dataset.status = message.status; status.hidden = message.status === "completed"; heading.append(status); assistant.append(heading);
  const body = node("div", "message-content"); renderMarkdown(body, message.answer || "", message.sources || []); assistant.append(body, sourceList(message.sources));
  if (message.error_code || message.errorMessage) assistant.append(node("p", "message-error", message.errorMessage || "This response is " + (message.status || "unavailable") + ". " + String(message.error_code || "").replaceAll("_", " ")));
  if (message.context?.length) { const used = node("div", "context-note context-chips"); used.setAttribute("aria-label", "Context used for this response"); for (const c of message.context) used.append(node("span", "context-chip", (c.path || c.title || c.repository || c.kind) + (c.ref ? " · " + String(c.ref).slice(0, 12) : ""))); assistant.append(used); }
  const actions = node("div", "message-actions");
  if (message.answer) actions.append(button("Copy answer", async () => { try { await navigator.clipboard.writeText(message.answer); toast("Answer copied."); } catch { toast("Select the answer to copy it."); } }));
  if (message.answer && message.status !== "running") actions.append(button("Save as brief", e => busy(e.currentTarget, async () => { const result = await api("briefs", "POST", { conversationId: state.activeId, messageId: message.id, title: state.conversation?.title }); toast("Saved to research briefs."); return result; })));
  if (["failed", "cancelled", "incomplete"].includes(message.status)) actions.append(button("Retry", () => { if (state.stream) return toast("Stop the current response first."); $("prompt").value = message.prompt; state.context = (message.context || []).filter(c => c.automatic !== true && ["file", "pull", "job"].includes(c.kind)).map(contextDescriptor); $("fitness-consent").checked = state.conversation?.mode === "fitness" && (!!message.includeFitness || (message.context || []).some(c => c.kind === "fitness")); renderContextChips(); resizePrompt(); updateComposer(); $("prompt").focus(); toast("Review the prompt, then Send to try again."); }));
  if (message.status === "uncertain") actions.append(button("Check saved result", () => selectConversation(state.activeId, { preserveDraft: true })));
  assistant.append(actions); group.append(assistant); return group;
}
function updateMessage(message, conversationId) {
  if (state.activeId !== conversationId) return;
  const index = state.messages.findIndex(m => m.id === message.id); if (index < 0) state.messages.push(message); else state.messages[index] = message;
  const container = $("messages"), nearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 120;
  const old = [...container.children].find(el => el.dataset.messageId === message.id); const fresh = messageElement(message); if (old) old.replaceWith(fresh); else { container.querySelector(".welcome")?.remove(); container.insertBefore(fresh, $("coding-runs")); }
  if (nearBottom) container.scrollTop = container.scrollHeight;
}
function contextDescriptor(c) { const value = { kind: c.kind, repository: c.repository }; for (const k of ["path", "ref", "number", "id"]) if (c[k] != null) value[k] = c[k]; return value; }
function renderContextChips() { const target = $("attached-context"); target.replaceChildren(); state.context.forEach((context, i) => { const chip = node("div", "context-chip"); const title = context.path || context.title || (context.kind === "pull" ? "PR #" + context.number : "Job " + context.id); chip.append(node("span", "", title), button("×", () => { state.context.splice(i, 1); renderContextChips(); updateComposer(); })); chip.lastChild.setAttribute("aria-label", "Remove " + title); chip.title = context.ref ? "Revision " + context.ref : title; target.append(chip); }); }
function resizePrompt() { const el = $("prompt"); el.style.height = "auto"; el.style.height = Math.min(el.scrollHeight, matchMedia(mobileQuery).matches ? 140 : 180) + "px"; }
async function sendMessage(event) {
  event?.preventDefault(); if (state.stream || state.dispatching || !$("prompt").value.trim()) return;
  const control = $("send"); if (control.disabled) return; control.disabled = true;
  const epoch = state.epoch, originId = state.activeId, generation = state.navigation, mode = state.conversation?.mode || $("mode").value;
  const draft = $("prompt").value, prompt = draft.trim(), repository = $("repository").value, context = state.context.map(contextDescriptor), includeFitness = mode === "fitness" && $("fitness-consent").checked;
  state.dispatching = true; $("prompt").value = ""; state.drafts.delete(originId || "new"); resizePrompt(); updateComposer();
  let active, restorePrompt = false;
  try {
    const conversation = await ensureConversation({ prompt, mode, repository }), requestId = uuid(), controller = new AbortController(); checkEpoch(epoch);
    active = { epoch, conversationId: conversation.id, requestId, controller, stopped: false, message: { id: requestId, prompt, answer: "", status: "running", sources: [], context, includeFitness, created_at: Date.now() } };
    state.stream = active; state.dispatching = false; updateMessage(active.message, active.conversationId); updateComposer();
    const response = await fetch("/atlas/api/chat", { method: "POST", credentials: "same-origin", cache: "no-store", headers: { "Content-Type": "application/json", "X-Inflite": "1", "X-Atlas-Owner": state.owner, Accept: "text/event-stream" }, body: JSON.stringify({ conversationId: conversation.id, requestId, prompt, includeFitness, context, stream: true }), signal: controller.signal });
    if (!response.ok || !response.headers.get("Content-Type")?.includes("text/event-stream")) {
      let data = {}; try { data = await response.json(); } catch {} checkEpoch(epoch); inspectOwner(response, data);
      const error = Error(data.error || "Atlas could not start this response."); error.code = data.code; error.requestId = data.requestId; throw error;
    }
    checkEpoch(epoch); inspectOwner(response, null); let terminal = false;
    for await (const packet of streamEvents(response.body, { signal: controller.signal })) {
      checkEpoch(epoch);
      let data; try { data = JSON.parse(packet.data); } catch { throw Error("Atlas returned an unreadable stream event."); }
      if (packet.event === "meta") { if (data.conversationId && data.conversationId !== active.conversationId) throw Error("Atlas returned a response for a different conversation."); if (typeof data.messageId === "string" && data.messageId !== active.message.id) { const previous = active.message.id; active.message.id = data.messageId; if (state.activeId === active.conversationId) { const existing = [...$("messages").children].find(el => el.dataset.messageId === previous); if (existing) existing.dataset.messageId = active.message.id; } } }
      else if (packet.event === "status") { if (state.activeId === active.conversationId) $("conversation-status").textContent = ({ connecting: "Connecting…", searching: "Searching sources…", reading_repository: "Reading repository…", responding: "Writing the response…", saving: "Saving the response…" })[data.stage] || "Working…"; }
      else if (packet.event === "delta") { active.message.answer += typeof data.text === "string" ? data.text : ""; updateMessage(active.message, active.conversationId); }
      else if (packet.event === "source") { if (data.source?.url && !active.message.sources.some(s => s.url === data.source.url && s.start_index === data.source.start_index)) { active.message.sources.push(data.source); updateMessage(active.message, active.conversationId); } }
      else if (packet.event === "done") { terminal = true; const m = data.message || {}; active.message = { ...active.message, ...m, id: active.message.id, prompt, status: m.status || "completed" }; updateMessage(active.message, active.conversationId); break; }
      else if (packet.event === "error") { terminal = true; restorePrompt = true; active.message.status = active.message.answer ? "incomplete" : "failed"; active.message.error_code = data.code; active.message.errorMessage = (data.error || "The response could not finish.") + (data.requestId ? " Reference: " + data.requestId : ""); updateMessage(active.message, active.conversationId); break; }
    }
    if (!terminal) { active.message.status = "uncertain"; active.message.errorMessage = "The connection ended before completion was confirmed. Reload this conversation to check the saved result."; updateMessage(active.message, active.conversationId); }
  } catch (error) {
    restorePrompt = !active || !active.stopped && error.name !== "AbortError";
    if (active && state.owner && epoch === state.epoch && !error.accountChanged) { active.message.status = active.stopped || error.name === "AbortError" ? "cancelled" : error.code ? "failed" : "uncertain"; active.message.errorMessage = active.stopped ? "Stopped. Any text already received is shown above." : errorText(error); updateMessage(active.message, active.conversationId); }
    else if (!error.accountChanged && epoch === state.epoch) toast(errorText(error));
  } finally {
    if (epoch === state.epoch) {
      if (restorePrompt) {
        const thread = active?.conversationId || originId;
        if (thread === state.activeId && (thread || generation === state.navigation)) {
          if (!$("prompt").value) { $("prompt").value = draft; resizePrompt(); }
        } else {
          const saved = state.drafts.get(thread || "new");
          if (saved && !saved.prompt) saved.prompt = draft;
        }
      }
      state.dispatching = false;
      if (state.stream === active) state.stream = null;
      if (active?.conversationId === state.activeId) $("conversation-status").textContent = "";
      updateComposer();
    }
    if (state.privateReady && epoch === state.epoch) { await loadThreads().catch(() => {}); await refreshHealth().catch(() => {}); }
  }
}
async function stopResponse() { const active = state.stream; if (!active) return; active.stopped = true; const cancellation = api("requests/" + encodeURIComponent(active.requestId) + "/cancel", "POST", {}).catch(() => {}); active.controller.abort(); await cancellation; }
async function refreshHealth() { const data = await api("health", "GET", undefined, { timeout: 20000 }); state.health = data; renderHealth(); return data; }
async function loadSettings() {
  const data = await api("settings"); state.settings = data.settings || data;
  $("memory-enabled").checked = !!state.settings.memoryEnabled; $("memory-text").value = state.settings.memory || "";
  $("daily-request-limit").value = state.settings.dailyRequestLimit ?? 20; $("daily-budget").value = state.settings.dailyBudgetUsd ?? "";
  $("default-timezone").value = state.settings.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/London";
  $("schedule-timezone").value = $("default-timezone").value;
}
async function loadRepositories() {
  const data = await api("repositories"); state.repositories = data.repositories || [];
  for (const id of ["repository", "schedule-repository"]) { const el = $(id), selected = el.value; el.replaceChildren(); const none = node("option", "", "Select repository"); none.value = ""; el.append(none); for (const repo of state.repositories) { const option = node("option", "", repo.full_name || repo); option.value = repo.full_name || repo; el.append(option); } if ([...el.options].some(o => o.value === selected)) el.value = selected; }
  if (state.conversation?.repository) setRepository(state.conversation.repository); updateComposer();
}
function setRepository(value) { const el = $("repository"); if (value && ![...el.options].some(o => o.value === value)) { const option = node("option", "", value); option.value = value; el.append(option); } el.value = value; }
async function showPanel(name, trigger) {
  openDialog(name, trigger);
  try {
    if (name === "settings") { await refreshHealth(); if (state.health.storage?.ready) { await loadSettings(); if (state.health.provider?.keySaved) { const result = await api("models"); fillModels(result.models, result.selected); } } }
    if (name === "usage") await loadUsage();
    if (name === "briefs") await loadBriefs();
    if (name === "schedules") await loadSchedules();
    if (name === "patches") await loadPatches({ reset: true });
  } catch (error) { toast(errorText(error)); }
}
async function loadUsage() {
  const data = await api("usage"), totals = data.totals || {}, limits = data.limits || {};
  $("usage-period").textContent = (data.day ? data.day + " · " : "") + "Daily allowance resets at midnight UTC.";
  const grid = $("usage-totals"); grid.replaceChildren();
  for (const [value, label] of [[`${totals.requests ?? 0} / ${limits.dailyRequestLimit ?? 20}`, "Requests used / allowance"], [money(totals.estimatedCostUsd), "Estimated cost (USD)"], [totals.completed ?? 0, "Completed requests"], [totals.pending ?? 0, "In progress"], [totals.failed ?? 0, "Failed requests"], [(totals.inputTokens ?? 0).toLocaleString() + " / " + (totals.outputTokens ?? 0).toLocaleString(), "Input / output tokens"]]) { const metric = node("div", "metric"); metric.append(node("strong", "", value), node("span", "", label)); grid.append(metric); }
  $("usage-note").textContent = (limits.dailyBudgetUsd != null ? "Daily estimate threshold: " + money(limits.dailyBudgetUsd) + ". " : "") + (totals.unknownCostRequests ? totals.unknownCostRequests + " request(s) have no complete cost estimate. " : "") + "Estimates use reported usage and published rates; provider billing is authoritative.";
  const list = $("usage-requests"); list.replaceChildren();
  for (const request of data.requests || []) { const card = node("article", "record-card"); card.append(node("h3", "", (request.operation || "Request").replaceAll("_", " ")), node("p", "", (request.model || "") + " · " + request.status)); const meta = node("div", "record-meta"); meta.append(node("span", "", timestamp(request.created_at)), node("span", "", money(request.estimated_cost_usd))); card.append(meta); if (request.error_code) card.append(node("p", "", String(request.error_code).replaceAll("_", " "))); list.append(card); }
  if (!list.children.length) list.append(node("p", "muted empty-small", "No requests recorded yet."));
}
async function loadBriefs() {
  const data = await api("briefs"), list = $("briefs-list"); list.replaceChildren(); $("brief-detail").hidden = true;
  for (const brief of data.briefs || []) { const card = node("article", "record-card"), open = button("", () => showBrief(brief.id), "record-open"); open.append(node("h3", "", brief.title || "Research brief"), node("p", "", timestamp(brief.created_at))); card.append(open); list.append(card); }
  if (!list.children.length) list.append(node("p", "muted empty-small", "No saved briefs yet."));
}
async function showBrief(id) {
  try { const result = await api("briefs/" + encodeURIComponent(id)), brief = result.brief, detail = $("brief-detail"); detail.replaceChildren(); detail.hidden = false; detail.append(node("h3", "", brief.title || "Research brief")); const content = node("div", "brief-content message-content"); renderMarkdown(content, brief.answer, brief.sources); detail.append(content, sourceList(brief.sources)); const actions = node("div", "button-row"); actions.append(button("Export brief", e => busy(e.currentTarget, () => download("briefs/" + encodeURIComponent(id) + "/export", titleFilename(brief.title)))), button("Delete brief", e => busy(e.currentTarget, async () => { if (!confirm("Delete this saved brief?")) return; await api("briefs/" + encodeURIComponent(id), "DELETE"); await loadBriefs(); }), "danger-text")); detail.append(actions); detail.scrollIntoView({ block: "start", behavior: "smooth" }); } catch (error) { toast(errorText(error)); }
}
async function loadContextSources() {
  const repository = $("repository").value, kind = $("context-kind").value, ref = $("context-ref").value.trim(), generation = ++state.contextLoad;
  if (!repository) return feedback("context-feedback", "Select a repository in the conversation first.", true);
  $("context-repository").textContent = repository; feedback("context-feedback", "Loading sources…"); $("context-list").replaceChildren();
  try {
    const query = new URLSearchParams({ repository }); if (ref) query.set("ref", ref);
    const data = await api("repositories/" + ({ file: "tree", pull: "pulls", job: "jobs" })[kind] + "?" + query);
    if (generation !== state.contextLoad) return;
    state.contexts = (data.files || data.pulls || data.jobs || []).map(item => ({ ...item, kind, repository, ...(kind === "file" ? { ref: data.ref || ref || item.ref } : {}) }));
    renderContextSources(); feedback("context-feedback", data.truncated ? "Showing a bounded selection. Enter a more specific revision if needed." : state.contexts.length + " sources available.");
  } catch (error) { if (generation === state.contextLoad) feedback("context-feedback", errorText(error), true); }
}
function renderContextSources() {
  const list = $("context-list"), query = $("context-search").value.trim().toLowerCase(); list.replaceChildren();
  state.contexts.forEach((item, index) => { const label = item.path || (item.kind === "pull" ? "#" + item.number + " " + item.title : item.name + " · " + (item.conclusion || item.status)); if (query && !label.toLowerCase().includes(query)) return; const row = node("label", "context-choice"), check = node("input"); check.type = "checkbox"; check.value = String(index); const text = node("span", "", label); if (item.ref || item.head_sha) text.append(node("small", "", "Revision " + (item.ref || item.head_sha).slice(0, 12))); if (item.size) text.append(node("small", "", Math.ceil(item.size / 1024) + " KB")); row.append(check, text); list.append(row); });
  if (!list.children.length) list.append(node("p", "muted empty-small", "No matching sources."));
}
async function attachSelectedContext(control) {
  await busy(control, async () => {
    const selected = [...$("context-list").querySelectorAll("input:checked")].map(el => state.contexts[Number(el.value)]).filter(Boolean);
    if (!selected.length) throw Error("Choose at least one source."); if (selected.length + state.context.length > 6) throw Error("Attach up to six sources at a time.");
    const repository = $("repository").value, generation = state.navigation;
    for (const selectedSource of selected) {
      const descriptor = contextDescriptor(selectedSource); const query = new URLSearchParams(Object.entries(descriptor).filter(([, value]) => value != null).map(([key, value]) => [key, String(value)]));
      const result = await api("repositories/context?" + query), source = { ...descriptor, ...result.context };
      if ($("repository").value !== repository || generation !== state.navigation) throw Error("The conversation changed. Choose context again.");
      const key = JSON.stringify(contextDescriptor(source)); if (!state.context.some(c => JSON.stringify(contextDescriptor(c)) === key)) state.context.push(source);
    }
    renderContextChips(); updateComposer();
    const sheet = sheets.top();
    if (sheet?.el.id === "context-dialog") sheet.now();
    toast("Sources added.");
  }, "context-feedback");
}
async function loadPatches({ reset = false } = {}) {
  const data = await api("patches"), list = $("patches-list"); list.replaceChildren();
  if (reset) { state.codingReview = null; list.hidden = false; $("patch-detail").hidden = true; feedback("patch-feedback", ""); }
  for (const run of state.codingRuns.filter(item => item.reviewReady || item.pullRequest)) { const card = node("article", "record-card"), open = button("", () => reviewCodingRun(run.id), "record-open"); open.append(node("h3", "", run.prompt), node("p", "", run.repository + " · " + codingStatus(run))); card.append(open); list.append(card); }
  for (const patch of data.patches || []) { const card = node("article", "record-card"), open = button("", () => showPatch(patch.id), "record-open"); open.append(node("h3", "", patch.title || "Draft changes"), node("p", "", patch.repository + " · " + patch.status)); card.append(open); list.append(card); }
  if (!list.children.length) list.append(node("p", "muted empty-small", "No changes to review here. Open a Developer conversation to start or reconnect to a coding task."));
}
function patchFiles(patch) { if (Array.isArray(patch.files)) return patch.files; try { return JSON.parse(patch.files_json || "[]"); } catch { return []; } }
async function showPatch(id, known) {
  try {
    state.codingReview = null;
    const patch = known || (await api("patches/" + encodeURIComponent(id))).patch; state.selectedPatch = patch;
    const detail = $("patch-detail"); detail.replaceChildren(); detail.hidden = false; detail.append(node("h3", "", patch.title || "Draft changes"), node("p", "muted", patch.repository + " · base " + String(patch.baseSha || patch.base_sha || "").slice(0, 12)));
    const summary = node("div", "message-content brief-content"); renderMarkdown(summary, patch.summary || ""); detail.append(summary);
    for (const file of patchFiles(patch)) { const section = node("details", "patch-file"); section.append(node("summary", "", file.path), node("pre", "", file.diff || "Before\n" + (file.before || "") + "\n\nAfter\n" + (file.after || file.content || ""))); detail.append(section); }
    const plan = node("div", "message-content brief-content"); const testPlan = patch.testPlan || patch.test_plan || ""; renderMarkdown(plan, "### Validation plan\n" + (Array.isArray(testPlan) ? testPlan.map(x => "- " + x).join("\n") : testPlan)); detail.append(plan);
    if (patch.url && safeUrl(patch.url)) { const a = node("a", "", "Open draft pull request ↗"); a.href = safeUrl(patch.url); a.target = "_blank"; a.rel = "noopener noreferrer"; detail.append(a); }
    else { detail.append(node("p", "field-help", "Review every file above. Publishing creates a new branch and a draft pull request for this exact change.")); const publish = button("Create draft pull request", e => busy(e.currentTarget, async () => { if (!confirm("Publish these reviewed changes to a new branch and create a draft pull request in " + patch.repository + "?")) return; const result = await api("patches/" + encodeURIComponent(patch.id) + "/publish", "POST", { confirm: true }); await showPatch(patch.id, { ...patch, ...result, status: "published" }); await loadPatches(); feedback("patch-feedback", "Draft pull request created."); }), "primary-button"); publish.disabled = !state.health?.github?.connected || !["draft", "ready"].includes(patch.status || "draft"); detail.append(publish); if (!state.health?.github?.connected) detail.append(node("p", "field-help", "Connect GitHub in Settings to publish.")); }
    detail.scrollIntoView({ block: "start", behavior: "smooth" });
  } catch (error) { feedback("patch-feedback", errorText(error), true); }
}
function codingActive(run) { return ["preparing", "running", "waiting", "uncertain", "publishing"].includes(run.status); }
function codingStatus(run) { return ({ preparing: "Preparing workspace", running: "Working", waiting: "Waiting", completed: "Completed", failed: "Failed", cancelled: "Stopped", uncertain: "Checking task state", publishing: "Creating pull request", published: "Published" })[run.status] || "Checking task state"; }
function detachCodingObserver() {
  const observer = state.codingObserver; state.codingObserver = null; state.codingLoading = false;
  if (observer) { clearTimeout(observer.timer); observer.controller.abort(); }
}
function codingViewCurrent(observer) { return state.codingObserver === observer && observer.epoch === state.epoch && observer.navigation === state.navigation && observer.conversationId === state.activeId && document.visibilityState === "visible"; }
function invalidateCodingReview(run) {
  if (!state.codingReview || state.codingReview.id !== run.id || state.codingReview.revision === run.revision && run.reviewReady) return;
  const publish = $("publish-coding"); if (publish) publish.disabled = true;
  feedback("patch-feedback", "This task has changed. Open Review changes again before publishing.");
}
function acceptCodingRun(run) {
  if (!run || run.conversationId !== state.activeId) return;
  state.codingLoadError = "";
  const index = state.codingRuns.findIndex(item => item.id === run.id);
  if (index < 0) state.codingRuns.push(run); else state.codingRuns[index] = run;
  invalidateCodingReview(run); renderCodingRuns(); updateComposer();
}
async function observeCodingRuns({ restore = true } = {}) {
  detachCodingObserver();
  if (!state.activeId || state.conversation?.mode !== "developer" || !state.privateReady || state.health?.coding?.storageReady !== true || document.visibilityState !== "visible") return;
  const observer = { epoch: state.epoch, navigation: state.navigation, conversationId: state.activeId, controller: new AbortController(), failures: 0, timer: null };
  state.codingObserver = observer;
  const poll = async (loadList = false) => {
    if (!codingViewCurrent(observer)) return;
    if (loadList) { state.codingLoading = true; updateComposer(); }
    try {
      if (loadList) {
        const data = await api("coding/runs?conversationId=" + encodeURIComponent(observer.conversationId), "GET", undefined, { signal: observer.controller.signal, timeout: 30000 });
        if (!codingViewCurrent(observer)) return;
        state.codingRuns = (data.runs || []).filter(run => run?.conversationId === observer.conversationId);
      } else {
        const results = await Promise.allSettled(state.codingRuns.filter(codingActive).map(run => api("coding/runs/" + encodeURIComponent(run.id), "GET", undefined, { signal: observer.controller.signal, timeout: 120000 })));
        if (!codingViewCurrent(observer)) return;
        let failure;
        for (const result of results) {
          if (result.status === "rejected") { failure ||= result.reason; continue; }
          const run = result.value.run, index = state.codingRuns.findIndex(item => item.id === run?.id);
          if (index >= 0 && run.conversationId === observer.conversationId) state.codingRuns[index] = run;
        }
        if (failure) throw failure;
      }
      observer.failures = 0; state.codingLoadError = "";
      for (const run of state.codingRuns) invalidateCodingReview(run);
    } catch (error) {
      if (!codingViewCurrent(observer) || error.accountChanged) return;
      observer.failures++; state.codingLoadError = "Progress could not be refreshed. The task may still be running. Reconnecting… " + errorText(error);
    } finally {
      if (codingViewCurrent(observer)) {
        state.codingLoading = false; renderCodingRuns(); updateComposer();
        if (observer.failures || state.codingRuns.some(codingActive)) observer.timer = setTimeout(() => poll(observer.failures > 0 && loadList), Math.min(30000, 5000 * 2 ** observer.failures));
      }
    }
  };
  if (restore) await poll(true); else if (state.codingRuns.some(codingActive)) observer.timer = setTimeout(() => poll(), 5000);
}
function codingChecks(checks = [], { prefix = "", opened = new Set() } = {}) {
  const section = node("section", "coding-checks"); section.append(node("h4", "", "Executed commands"));
  if (!checks.length) { section.append(node("p", "field-help", "No command results have been reported. Tests are not verified.")); return section; }
  for (const [index, check] of checks.entries()) {
    const details = node("details", "coding-check"), summary = node("summary"), exit = Number.isInteger(check.exitCode) ? " · exit " + check.exitCode : " · no exit code reported";
    details.dataset.disclosure = prefix + ":command:" + index; details.open = opened.has(details.dataset.disclosure);
    summary.append(node("code", "", check.command || "Command"), node("span", "check-result", " — " + (check.outcome || check.status || "unknown") + exit)); details.append(summary);
    details.append(node("pre", "", check.output || "No output was recorded."));
    if (check.outputTruncated || check.truncated) details.append(node("p", "field-help", "This command or its output was truncated in the activity record.")); section.append(details);
  }
  return section;
}
function pullRequestLink(pullRequest) {
  const href = safeUrl(pullRequest?.url); if (!href) return null;
  const link = node("a", "", "Open draft pull request ↗"); link.href = href; link.target = "_blank"; link.rel = "noopener noreferrer"; return link;
}
function renderCodingRuns() {
  const container = $("messages"), previous = $("coding-runs"), nearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 120;
  if (!state.codingRuns.length && !state.codingLoadError) { previous?.remove(); if (!state.messages.length && !container.querySelector(".welcome")) renderMessages(); return; }
  const signature = JSON.stringify([state.codingRuns, state.codingLoadError, state.health?.coding?.ready, state.health?.coding?.backgroundAvailable, state.conversation?.archived]);
  if (previous?.dataset.snapshot === signature) return;
  const opened = new Set([...previous?.querySelectorAll("details[open]") || []].map(el => el.dataset.disclosure).filter(Boolean));
  const list = node("section", "coding-runs"); list.id = "coding-runs"; list.setAttribute("aria-label", "Coding tasks"); list.dataset.snapshot = signature;
  if (state.codingLoadError) { const notice = node("div", "notice-inline coding-reconnect"); notice.append(node("p", "", state.codingLoadError), button("Reconnect", () => observeCodingRuns())); list.append(notice); }
  const runs = [...state.codingRuns].sort((a, b) => Number(a.createdAt) - Number(b.createdAt) || String(a.id).localeCompare(String(b.id)));
  for (const run of runs) {
    const card = node("article", "coding-run"), heading = node("div", "coding-run-heading"); card.dataset.runId = run.id;
    const status = node("span", "message-status", codingStatus(run)); status.dataset.status = run.status; status.setAttribute("role", "status"); heading.append(node("h3", "", "Coding task"), status);
    card.append(heading, node("p", "coding-prompt", run.prompt), node("p", "field-help", run.repository + (run.baseBranch ? " · " + run.baseBranch : "") + (run.baseSha ? " · " + run.baseSha.slice(0, 12) : "")));
    if (run.stage && codingActive(run)) card.append(node("p", "coding-stage", String(run.stage).replaceAll("_", " ")));
    if (run.summary) { const summary = node("div", "message-content"); renderMarkdown(summary, run.summary); card.append(summary); }
    if (run.error?.message) card.append(node("p", "message-error", run.error.message));
    if (run.activity?.length) { const details = node("details", "coding-activity"), entries = node("ol"); details.dataset.disclosure = run.id + ":activity"; details.open = opened.has(details.dataset.disclosure); details.append(node("summary", "", "Activity · " + run.activity.length)); for (const entry of run.activity) entries.append(node("li", "", [entry.label, entry.detail || entry.text].filter(Boolean).join(": ") + (entry.truncated ? " (truncated)" : ""))); details.append(entries); card.append(details); }
    const changes = run.changes || {}; if (run.reviewReady) card.append(node("p", "coding-change-count", (changes.added || 0) + " added · " + (changes.modified || 0) + " modified · " + (changes.deleted || 0) + " deleted"));
    if (run.checks?.length || !codingActive(run)) card.append(codingChecks(run.checks, { prefix: run.id, opened }));
    const actions = node("div", "button-row coding-actions");
    if (run.reviewReady) actions.append(button("Review changes", e => busy(e.currentTarget, () => reviewCodingRun(run.id))));
    if (run.canContinue && !state.conversation?.archived) actions.append(button("Continue task", () => { state.codingContinuation = run.id; updateComposer(); $("prompt").focus(); toast("Describe the next step, then select Continue task."); }));
    if (["preparing", "running", "waiting", "uncertain"].includes(run.status)) actions.append(button("Stop task", e => busy(e.currentTarget, async () => { detachCodingObserver(); try { const result = await api("coding/runs/" + encodeURIComponent(run.id) + "/cancel", "POST", {}); acceptCodingRun(result.run); } finally { await observeCodingRuns({ restore: false }); } }), "danger-text"));
    const link = pullRequestLink(run.pullRequest); if (link) actions.append(link); card.append(actions);
    if (codingActive(run)) card.append(node("p", "field-help", state.health?.coding?.backgroundAvailable ? "This task can continue while you are away. Use Stop task to cancel it." : "Leaving does not cancel this task. Keep this page open until work starts; reopen it to finish setup or collect results."));
    card.append(node("p", "field-help", "Updated " + timestamp(run.updatedAt || run.createdAt))); list.append(card);
  }
  container.querySelector(".welcome")?.remove(); if (previous) previous.replaceWith(list); else container.append(list); if (nearBottom) container.scrollTop = container.scrollHeight;
}
async function startCodingTask() {
  const control = $("start-coding"); if (control.disabled || state.codingDispatching) return;
  const epoch = state.epoch, navigation = state.navigation, originId = state.activeId, prompt = $("prompt").value.trim(), repository = $("repository").value, continuation = state.codingContinuation;
  state.codingDispatching = true; feedback("coding-feedback", "Starting task…"); updateComposer();
  try {
    const conversation = await ensureConversation({ prompt, mode: "developer", repository }); checkEpoch(epoch);
    const path = continuation ? "coding/runs/" + encodeURIComponent(continuation) + "/continue" : "coding/runs";
    const result = await api(path, "POST", { ...(continuation ? {} : { conversationId: conversation.id }), requestId: uuid(), prompt }); checkEpoch(epoch);
    if (navigation === state.navigation && state.activeId === conversation.id) {
      feedback("coding-feedback", "");
      if ($("prompt").value.trim() === prompt) $("prompt").value = "";
      state.drafts.delete(originId || "new"); state.codingContinuation = null; resizePrompt(); acceptCodingRun(result.run); await observeCodingRuns({ restore: false });
    }
    loadThreads().catch(() => {});
  } catch (error) {
    if (!error.accountChanged && epoch === state.epoch && navigation === state.navigation) {
      feedback("coding-feedback", errorText(error), true);
      if (state.activeId) await observeCodingRuns();
    }
  } finally { if (epoch === state.epoch) { state.codingDispatching = false; updateComposer(); } }
}
async function reviewCodingRun(id) {
  const review = { id, revision: null, epoch: state.epoch }; state.codingReview = review; state.selectedPatch = null;
  openDialog("patches"); $("patches-list").hidden = true; $("patch-detail").hidden = false; $("patch-detail").replaceChildren(); feedback("patch-feedback", "Loading changes…");
  try {
    const data = await api("coding/runs/" + encodeURIComponent(id) + "/changes");
    if (state.codingReview !== review || review.epoch !== state.epoch) return;
    const run = data.run; review.revision = run.revision; acceptCodingRun(run);
    const detail = $("patch-detail"); detail.append(node("h3", "", "Review coding task"), node("p", "muted", run.repository + " · base " + String(run.baseSha || "").slice(0, 12)), node("p", "", run.summary || run.prompt));
    const files = data.files || []; detail.append(node("p", "field-help", files.length + " changed file" + (files.length === 1 ? "" : "s") + ". Open each file to inspect its diff."));
    for (const file of files) {
      const section = node("details", "patch-file"), output = node("pre", "", "Open to load the diff."); let loaded = false, loading = false;
      section.append(node("summary", "", file.operation + " · " + file.path), output);
      section.addEventListener("toggle", async () => {
        if (!section.open || loaded || loading) return; loading = true; output.textContent = "Loading diff…";
        try {
          const result = await api("coding/runs/" + encodeURIComponent(id) + "/diff?path=" + encodeURIComponent(file.path));
          if (state.codingReview !== review || review.epoch !== state.epoch || !section.isConnected) return;
          output.textContent = (result.binary ? "Binary file. A text diff is unavailable." : result.diff || "No text diff was recorded.") + (result.diffTruncated ? "\n\nDiff preview truncated. The complete file is included when you publish the draft pull request." : ""); loaded = true;
        } catch (error) { if (!error.accountChanged && state.codingReview === review) output.textContent = errorText(error) + " Close and reopen this file to retry."; }
        finally { loading = false; }
      }); detail.append(section);
    }
    detail.append(codingChecks(data.checks || run.checks));
    const link = pullRequestLink(run.pullRequest);
    if (link) detail.append(link); else {
      detail.append(node("p", "field-help", "Publishing creates a new branch and a draft pull request for this reviewed revision. It does not merge or deploy the changes."));
      const publish = button("Create draft pull request", e => busy(e.currentTarget, async () => {
        if (state.codingReview !== review) return;
        if (!confirm("Create a new branch and draft pull request for these reviewed changes in " + run.repository + "?")) return;
        const result = await api("coding/runs/" + encodeURIComponent(id) + "/publish", "POST", { confirm: true, revision: review.revision });
        if (state.codingReview !== review || review.epoch !== state.epoch) return;
        acceptCodingRun(result.run); const published = pullRequestLink(result.pullRequest || result.run?.pullRequest);
        if (published) { publish.replaceWith(published); feedback("patch-feedback", "Draft pull request created."); } else { feedback("patch-feedback", "Publication is being checked. Refresh this review for its result."); await observeCodingRuns(); }
      }, "patch-feedback"), "primary-button"); publish.id = "publish-coding"; publish.disabled = !run.reviewReady || !files.length || !state.health?.github?.connected; detail.append(publish);
      if (!state.health?.github?.connected) detail.append(node("p", "field-help", "Connect GitHub in Settings to publish."));
    }
    feedback("patch-feedback", "");
  } catch (error) { if (!error.accountChanged && state.codingReview === review) feedback("patch-feedback", errorText(error), true); }
}
function scheduleDescription(task) {
  if (task.schedule_kind === "interval") return "Every " + (task.interval_minutes / 60) + " hours";
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"], selected = Array.isArray(task.weekdays) ? task.weekdays : [];
  return (task.schedule_kind === "weekly" ? selected.map(day => days[day]).join(", ") || "Weekly" : "Daily") + " at " + (task.local_time || "08:00") + " · " + (task.timezone || "UTC");
}
async function loadSchedules() {
  const data = await api("tasks"); state.tasks = data.tasks || []; if (state.health) state.health.scheduling = { ...state.health.scheduling, available: !!data.autonomous }; renderHealth();
  const list = $("schedules-list"); list.replaceChildren();
  for (const task of state.tasks) {
    const card = node("article", "record-card"); card.append(node("h3", "", task.title || task.prompt?.slice(0, 80) || "Scheduled task"), node("p", "", scheduleDescription(task)), node("p", "", (task.enabled ? "Enabled" : "Paused") + (task.next_run ? " · Next: " + timestamp(task.next_run) : "") + (task.last_status ? " · Last: " + task.last_status : "")));
    const actions = node("div", "button-row"); actions.append(button("Edit", () => editSchedule(task)));
    const toggle = button(task.enabled ? "Pause" : "Enable", e => busy(e.currentTarget, async () => { if (!task.enabled && !confirm("Enable recurring API usage for this task? It will use your saved model and connection.")) return; await api("tasks", "PATCH", { id: task.id, enabled: !task.enabled, confirm: true }); await loadSchedules(); })); toggle.disabled = !task.enabled && !data.autonomous; actions.append(toggle);
    actions.append(button("Run once", e => busy(e.currentTarget, async () => { if (!confirm("Run this task now using your saved connection and daily allowance?")) return; await api("tasks/" + encodeURIComponent(task.id) + "/run", "POST", { requestId: uuid(), confirm: true }); await loadSchedules(); await showRuns(task); toast("Task run finished. See its result below."); })), button("Run history", () => showRuns(task))); card.append(actions); list.append(card);
  }
  if (!list.children.length) list.append(node("p", "muted empty-small", "No scheduled tasks yet."));
}
function scheduleFields() { const kind = $("schedule-kind").value, mode = $("schedule-mode").value; $("schedule-time-label").hidden = kind === "interval"; $("schedule-interval-label").hidden = kind !== "interval"; $("schedule-weekdays").hidden = kind !== "weekly"; $("schedule-repository-label").hidden = mode !== "developer"; $("schedule-context-section").hidden = mode !== "developer"; $("schedule-fitness-control").hidden = mode !== "fitness"; if (mode !== "fitness") $("schedule-fitness-consent").checked = false; $("schedule-use-context").disabled = !state.context.some(c => c.repository === $("schedule-repository").value); renderScheduleContext(); }
function renderScheduleContext() { const target = $("schedule-context"); target.replaceChildren(); for (const [i, item] of state.scheduleContext.entries()) { const chip = node("div", "context-chip"); const label = item.path || item.title || (item.kind === "pull" ? "PR #" + item.number : "Job " + item.id); chip.append(node("span", "", label), button("×", () => { state.scheduleContext.splice(i, 1); renderScheduleContext(); })); chip.lastChild.setAttribute("aria-label", "Remove " + label + " from schedule"); target.append(chip); } if (!state.scheduleContext.length) target.append(node("p", "field-help", "No repository context attached. You can reuse sources selected in your conversation.")); }
function editSchedule(task) {
  $("schedule-form").hidden = false; $("schedule-form-title").textContent = task ? "Edit scheduled task" : "New scheduled task"; $("schedule-id").value = task?.id || ""; $("schedule-title").value = task?.title || ""; $("schedule-prompt").value = task?.prompt || $("prompt").value || ""; $("schedule-mode").value = task?.mode || state.conversation?.mode || $("mode").value; $("schedule-kind").value = task?.schedule_kind || "daily"; $("schedule-time").value = task?.local_time || "08:00"; $("schedule-interval").value = (task?.interval_minutes || 1440) / 60; $("schedule-timezone").value = task?.timezone || state.settings?.timezone || "Europe/London";
  const repository = task?.repository || $("repository").value || ""; if (repository && ![...$("schedule-repository").options].some(o => o.value === repository)) { const option = node("option", "", repository); option.value = repository; $("schedule-repository").append(option); } $("schedule-repository").value = repository;
  $("schedule-fitness-consent").checked = task?.mode === "fitness" && !!task?.includeFitness; state.scheduleContext = Array.isArray(task?.context) ? task.context.map(contextDescriptor) : [];
  $("schedule-mode").disabled = !!task; $("schedule-repository").disabled = !!task;
  for (const box of document.querySelectorAll('input[name="weekday"]')) box.checked = (task?.weekdays || [1]).includes(Number(box.value)); feedback("schedule-feedback", ""); scheduleFields(); $("schedule-form").scrollIntoView({ block: "start", behavior: "smooth" });
}
async function saveSchedule(event) {
  event.preventDefault(); const control = $("schedule-form").querySelector('button[type="submit"]');
  await busy(control, async () => {
    const id = $("schedule-id").value, existing = state.tasks.find(t => t.id === id), kind = $("schedule-kind").value;
    const body = { title: $("schedule-title").value.trim(), prompt: $("schedule-prompt").value.trim(), mode: $("schedule-mode").value, repository: $("schedule-mode").value === "developer" ? $("schedule-repository").value || null : null, includeFitness: $("schedule-mode").value === "fitness" && $("schedule-fitness-consent").checked, context: $("schedule-mode").value === "developer" ? state.scheduleContext.filter(c => c.repository === $("schedule-repository").value).map(contextDescriptor) : [], schedule_kind: kind, timezone: $("schedule-timezone").value.trim(), ...(kind === "interval" ? { interval_minutes: Number($("schedule-interval").value) * 60 } : { local_time: $("schedule-time").value }), ...(kind === "weekly" ? { weekdays: [...document.querySelectorAll('input[name="weekday"]:checked')].map(el => Number(el.value)) } : {}) };
    if (kind === "weekly" && !body.weekdays.length) throw Error("Choose at least one weekday.");
    if (existing?.enabled && !confirm("Apply these changes to the active recurring task?")) return;
    await api("tasks", id ? "PATCH" : "POST", id ? { ...body, id, enabled: !!existing?.enabled, confirm: !!existing?.enabled } : body); $("schedule-form").hidden = true; await loadSchedules(); toast(id ? "Task updated." : "Task saved paused.");
  }, "schedule-feedback");
}
async function showRuns(task) {
  try { const data = await api("tasks/" + encodeURIComponent(task.id) + "/runs"), section = $("schedule-runs"), list = $("schedule-runs-list"); section.hidden = false; $("schedule-runs-title").textContent = "Run history · " + (task.title || "Task"); list.replaceChildren(); for (const run of data.runs || []) { const card = node("article", "record-card"); card.append(node("h4", "", run.status + " · " + timestamp(run.started_at || run.created_at))); if (run.error_code) card.append(node("p", "", String(run.error_code).replaceAll("_", " "))); if (run.result) { const content = node("div", "run-content message-content"); renderMarkdown(content, run.result, run.sources); card.append(content, sourceList(run.sources)); } if (run.request_id) card.append(node("p", "context-note", "Reference: " + run.request_id)); list.append(card); } if (!list.children.length) list.append(node("p", "muted empty-small", "This task has not run yet.")); section.scrollIntoView({ block: "start", behavior: "smooth" }); } catch (error) { toast(errorText(error)); }
}
async function bootstrap() {
  const epoch = state.epoch;
  $("session-notice").textContent = "Checking your session…"; document.body.classList.add("session-check");
  try {
    const health = await refreshHealth(); if (!health.storage?.ready) { state.privateReady = true; document.body.classList.remove("session-check"); renderMessages(); updateComposer(); return; }
    const results = await Promise.allSettled([loadThreads(), loadSettings(), loadRepositories()]); checkEpoch(epoch);
    const failed = results.find(result => result.status === "rejected"); if (failed && !state.owner) return;
    state.privateReady = true; document.body.classList.remove("session-check"); renderHealth();
    const id = new URL(location.href).searchParams.get("conversation"); if (id) await selectConversation(id); else renderMessages();
    if (failed) toast(errorText(failed.reason));
  } catch (error) { if (!error.accountChanged) { $("session-notice").textContent = errorText(error); const retry = button("Try again", () => bootstrap()); $("session-notice").append(node("br"), retry); } }
}
async function verifyVisibleSession() {
  if (document.visibilityState !== "visible" || state.checking) return;
  document.body.classList.add("session-check"); $("session-notice").textContent = "Checking your session…";
  state.checking = (async () => { try { await refreshHealth(); if (state.privateReady && state.owner) { document.body.classList.remove("session-check"); await observeCodingRuns(); } else if (state.owner) await bootstrap(); } catch (error) { if (!error.accountChanged) $("session-notice").textContent = errorText(error); } finally { state.checking = null; } })();
  await state.checking;
}
function init() {
  sheets = createSheets();
  const mobile = matchMedia(mobileQuery);
  placeSidebar(mobile.matches);
  mobile.addEventListener("change", event => placeSidebar(event.matches));
  $("navigation-toggle").addEventListener("click", () => navigation(true));
  window.visualViewport?.addEventListener("resize", fitComposerViewport);
  window.visualViewport?.addEventListener("scroll", fitComposerViewport);
  $("prompt").addEventListener("focus", fitComposerViewport);
  $("prompt").addEventListener("blur", fitComposerViewport);
  for (const el of document.querySelectorAll("[data-open]")) el.addEventListener("click", () => showPanel(el.dataset.open, el));
  $("new-chat").addEventListener("click", () => newConversation()); $("conversation-search").addEventListener("input", renderThreads); $("show-archived").addEventListener("change", () => loadThreads().catch(error => toast(errorText(error))));
  $("load-older-messages").addEventListener("click", e => loadOlderMessages(e.currentTarget));
  $("mode").addEventListener("change", () => { feedback("coding-feedback", ""); state.context = []; renderContextChips(); updateComposer(); }); $("repository").addEventListener("change", () => { feedback("coding-feedback", ""); state.context = []; renderContextChips(); updateComposer(); });
  $("prompt").addEventListener("input", () => { resizePrompt(); updateComposer(); }); $("prompt").addEventListener("keydown", event => { if (event.key === "Enter" && !event.isComposing && !event.shiftKey && (event.ctrlKey || event.metaKey || !matchMedia("(pointer:coarse)").matches)) { event.preventDefault(); if (!$("send").disabled) $("composer").requestSubmit(); } });
  $("composer").addEventListener("submit", sendMessage); $("stop-response").addEventListener("click", stopResponse);
  $("upgrade-storage").addEventListener("click", e => busy(e.currentTarget, async () => { await api("setup", "POST", { confirm: true }); await bootstrap(); toast("Workspace storage is ready."); }));
  $("provider-model").addEventListener("change", () => { $("custom-model-label").hidden = $("provider-model").value !== "custom"; updateModelHelp(); }); $("provider-custom-model").addEventListener("input", updateModelHelp);
  $("provider-form").addEventListener("submit", event => { event.preventDefault(); const key = $("provider-key").value.trim(), model = currentModel(); if (!key && !state.health?.provider?.keySaved) return feedback("provider-feedback", "Enter the OpenAI key to save this connection.", true); if (!model) return feedback("provider-feedback", "Choose a model or enter a model ID.", true); $("provider-key").value = ""; busy($("save-provider"), async () => { await api("provider", "POST", { ...(key ? { key } : {}), model }); feedback("provider-feedback", key ? "Key saved. Use the short test to verify an actual response." : "Model saved. Test a short response with this model."); await refreshHealth(); const result = await api("models"); fillModels(result.models, result.selected || model); }, "provider-feedback"); });
  $("load-models").addEventListener("click", e => busy(e.currentTarget, async () => { const result = await api("models"); fillModels(result.models, result.selected); feedback("provider-feedback", "Available models refreshed."); }, "provider-feedback"));
  $("test-provider").addEventListener("click", e => busy(e.currentTarget, async () => { feedback("provider-feedback", "Testing a short response…"); await api("provider/test", "POST", { research: $("test-research").checked, requestId: uuid() }); await refreshHealth(); feedback("provider-feedback", "The connection produced a response successfully."); }, "provider-feedback"));
  $("remove-provider").addEventListener("click", e => busy(e.currentTarget, async () => { if (!confirm("Remove your saved OpenAI connection? Scheduled work using it will no longer be able to run.")) return; await api("provider", "DELETE"); await refreshHealth(); feedback("provider-feedback", "Saved key removed."); }, "provider-feedback"));
  $("github-form").addEventListener("submit", event => { event.preventDefault(); const token = $("github-token").value.trim(); $("github-token").value = ""; if (!token) return feedback("github-feedback", "Enter a GitHub token.", true); busy($("github-form").querySelector('button[type="submit"]'), async () => { await api("github", "POST", { token }); await refreshHealth(); await loadRepositories(); feedback("github-feedback", "GitHub connection saved."); }, "github-feedback"); });
  $("remove-github").addEventListener("click", e => busy(e.currentTarget, async () => { if (!confirm("Remove your saved GitHub connection?")) return; await api("github", "DELETE"); await refreshHealth(); await loadRepositories(); feedback("github-feedback", "GitHub connection removed."); }, "github-feedback"));
  $("preferences-form").addEventListener("submit", event => { event.preventDefault(); busy($("preferences-form").querySelector('button[type="submit"]'), async () => { const budget = $("daily-budget").value; await api("settings", "PATCH", { memoryEnabled: $("memory-enabled").checked, memory: $("memory-text").value, dailyRequestLimit: Number($("daily-request-limit").value), dailyBudgetUsd: budget === "" ? null : Number(budget), timezone: $("default-timezone").value.trim() }); await loadSettings(); feedback("preferences-feedback", "Preferences saved."); }, "preferences-feedback"); });
  $("clear-memory").addEventListener("click", e => busy(e.currentTarget, async () => { if (!confirm("Clear your saved personal context?")) return; await api("settings", "PATCH", { memoryEnabled: false, memory: "" }); await loadSettings(); feedback("preferences-feedback", "Saved personal context cleared."); }, "preferences-feedback"));
  $("rename-conversation").addEventListener("click", e => busy(e.currentTarget, async () => { const id = state.activeId; if (!id) return; const title = window.prompt("Conversation title", state.conversation.title); if (!title?.trim()) return; await api("conversations/" + encodeURIComponent(id), "PATCH", { title: title.trim() }); await selectConversation(id); await loadThreads(); }));
  $("archive-conversation").addEventListener("click", e => busy(e.currentTarget, async () => { const id = state.activeId; if (!id) return; await api("conversations/" + encodeURIComponent(id), "PATCH", { archived: !state.conversation.archived }); newConversation(); await loadThreads(); }));
  $("delete-conversation").addEventListener("click", e => busy(e.currentTarget, async () => { const id = state.activeId; if (!id || !confirm("Delete this conversation and its saved messages?")) return; if (state.stream?.conversationId === id) await stopResponse(); await api("conversations/" + encodeURIComponent(id), "DELETE"); state.drafts.delete(id); newConversation(); await loadThreads(); }));
  $("export-conversation").addEventListener("click", e => busy(e.currentTarget, () => download("conversations/" + encodeURIComponent(state.activeId) + "/export", titleFilename(state.conversation.title))));
  $("summarize-conversation").addEventListener("click", e => busy(e.currentTarget, async () => { const id = state.activeId; if (!id) return; const result = await api("conversations/" + encodeURIComponent(id) + "/summary", "POST", { requestId: uuid() }); if (state.activeId === id) await selectConversation(id); const count = Number.isInteger(result.summarizedTurns) ? "Summarized " + result.summarizedTurns + " earlier turn" + (result.summarizedTurns === 1 ? "." : "s.") : "Earlier context summarized."; toast(count + (result.hasMore ? " More remains; summarize again when ready." : " The full conversation is retained.")); }));
  $("attach-context").addEventListener("click", event => { openDialog("context", event.currentTarget); $("context-search").value = ""; loadContextSources(); }); $("context-refresh").addEventListener("click", loadContextSources); $("context-kind").addEventListener("change", () => { $("context-ref-label").hidden = $("context-kind").value !== "file"; loadContextSources(); }); $("context-search").addEventListener("input", renderContextSources); $("context-attach").addEventListener("click", e => attachSelectedContext(e.currentTarget));
  $("start-coding").addEventListener("click", startCodingTask); $("clear-coding-continuation").addEventListener("click", () => { state.codingContinuation = null; updateComposer(); }); $("new-schedule").addEventListener("click", () => editSchedule()); $("schedule-kind").addEventListener("change", scheduleFields); $("schedule-mode").addEventListener("change", scheduleFields); $("schedule-form").addEventListener("submit", saveSchedule); $("cancel-schedule-edit").addEventListener("click", () => { $("schedule-form").hidden = true; });
  $("schedule-repository").addEventListener("change", () => { state.scheduleContext = []; scheduleFields(); }); $("schedule-use-context").addEventListener("click", () => { state.scheduleContext = state.context.filter(c => c.repository === $("schedule-repository").value).map(contextDescriptor); renderScheduleContext(); });
  $("stop-schedules").addEventListener("click", e => busy(e.currentTarget, async () => { if (!confirm("Pause all your scheduled tasks?")) return; await api("stop", "POST", {}); await loadSchedules(); toast("All scheduled tasks paused."); }));
  let zones = ["Europe/London", "UTC"]; try { if (Intl.supportedValuesOf) zones = ["UTC", ...Intl.supportedValuesOf("timeZone")]; } catch {} for (const zone of zones) { const option = node("option"); option.value = zone; $("timezones").append(option); }
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") { detachCodingObserver(); document.body.classList.add("session-check"); } else verifyVisibleSession(); });
  window.addEventListener("focus", verifyVisibleSession); window.addEventListener("pagehide", () => { detachCodingObserver(); $("provider-key").value = ""; $("github-token").value = ""; document.body.classList.add("session-check"); }); window.addEventListener("pageshow", event => { if (event.persisted) verifyVisibleSession(); });
  bootstrap();
}
if (typeof document !== "undefined") { if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true }); else init(); }
