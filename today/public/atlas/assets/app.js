/* Atlas client. Private content lives only in this page's memory; server ownership
   is checked on every response, including every new streaming response. */
import { createSheets } from "../../roof/sheet.js";
import { toast as showToast } from "../../roof/toast.js";
import { nativeSheets, confirmAction, promptValue } from "../roof/native.js";

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

function node(tag, className, text) { const el = document.createElement(tag); if (className) el.className = className; if (text != null) el.textContent = String(text); return el; }
function button(text, action, className = "") { const el = node("button", className, text); el.type = "button"; el.addEventListener("click", action); return el; }
function emptyState(title, detail, action) {
  const empty = node("div", "atlas-empty ifl-empty");
  empty.append(node("b", "", title));
  if (detail) empty.append(node("p", "", detail));
  if (action) empty.append(action);
  return empty;
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
export function renderMarkdown(target, value, sources = [], notify = showToast) {
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
      const box = node("div", "code-block"), head = node("div", "code-header"), pre = node("pre"), content = node("code", "", code.join("\n")); head.append(node("span", "", language || "Code"), button("Copy code", async e => { try { await navigator.clipboard.writeText(code.join("\n")); e.currentTarget.textContent = "Copied"; } catch { notify("Select and copy the code manually."); } })); pre.append(content); box.append(head, pre); target.append(box); continue;
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

export function createAtlasClient(root, { fw = null } = {}) {
  if (!root) throw new TypeError("Atlas needs a mount root");
  const lifetime = new AbortController();
  const ids = new Map([...root.querySelectorAll("[id]")].map(el => [el.id, el]));
  let disposed = false, shown = true, route = null, routeEpoch = 0, routing = false;
  const $ = id => ids.get(id) || root.querySelector(`[id="${id}"]`) || sheets?.elements?.().map(el => el.querySelector(`[id="${id}"]`)).find(Boolean);
  const all = selector => [...new Set([root, ...(sheets?.elements?.() || [])].flatMap(el => [...el.querySelectorAll(selector)]))];
  const listen = (target, event, handler, options = {}) => target?.addEventListener(event, handler, { ...options, signal: lifetime.signal });
  const visible = () => !disposed && shown && document.visibilityState === "visible" && (!fw || fw.visible());
const modeNames = { research: "Research", developer: "Developer", personal: "Personal", fitness: "Cycling & fitness", tasks: "Task planning" };
const modeDetails = {
  research: "Find and compare sources", developer: "Ask about code or work on a repository",
  personal: "Think through ideas and decisions", fitness: "Plan training and review rides", tasks: "Break work into steps",
};
const state = { owner: null, epoch: 0, controllers: new Set(), health: null, settings: null, conversations: [], conversation: null, messages: [], messagePage: {}, activeId: null, context: [], repositories: [], models: [], stream: null, dispatching: false, navigation: 0, contextLoad: 0, contexts: [], tasks: [], scheduleContext: [], patches: [], selectedPatch: null, codingRuns: [], codingObserver: null, codingLoading: false, codingLoadError: "", codingContinuation: null, codingRestart: null, codingReview: null, codingDispatching: false, intent: "code", environments: [], environmentsReady: null, environmentsLoading: false, environmentId: "", environmentEditingRevision: null, environmentEditorSession: 0, environmentEditorVersion: 0, environmentsRequest: 0, taskTabs: new Map(), taskExpanded: new Map(), taskChanges: new Map(), drafts: new Map(), privateReady: false, checking: null, workspaceContext: [], contextPending: false, briefs: [] };
let sheets, navigationSheet, activeToast;
let keyboardShell;
let codingInbox;
let inboxScroll = 0;
const destinationRoutes = { inbox: "tasks", environments: "environments", briefs: "briefs" };
let destination = null, briefRequest = null, briefListRequest = null;
let runsRequest = null;
let runTimeline = null, answerSubmission = null;
let runDraft = null;
let threadsRequest = null, threadsArchived = null, threadsError = "", threadSelection = null;
const mobileQuery = "(max-width: 720px)";
const dirtyForms = new Set();
const codingSnapshots = new WeakMap();
let providerOff = null, routeSyncSuppressed = 0, nativeSettings = null, paintFrame = 0, queuedMessage = null;
const identityHost = () => nativeSettings?.current() ? nativeSettings.fw : fw;
function renderAnswer(target, value, sources) { return renderMarkdown(target, value, sources, toast); }
function timestamp(value) { if (!value) return ""; const d = new Date(typeof value === "string" && /^\d+$/.test(value) ? Number(value) : value); return Number.isNaN(d.getTime()) ? "" : d.toLocaleString([], { dateStyle: "medium", timeStyle: "short" }); }
function shortDate(value) { if (!value) return ""; return new Date(Number(value) || value).toLocaleDateString([], { month: "short", day: "numeric" }); }
function recordTime(value) {
  const time = node("time", "record-time"), date = new Date(Number(value) || value);
  if (!value || Number.isNaN(date.getTime())) { time.hidden = true; return time; }
  const year = date.getFullYear() === new Date().getFullYear() ? undefined : "numeric";
  time.textContent = date.toLocaleDateString([], { month: "short", day: "numeric", year }) + " · " + date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  time.dateTime = date.toISOString();
  return time;
}
function money(value) { return typeof value === "number" && Number.isFinite(value) ? "$" + value.toFixed(value < 0.01 && value > 0 ? 4 : 2) : "Unavailable"; }
function uuid() { return crypto.randomUUID(); }
function toast(message) {
  if (disposed) return;
  activeToast = fw ? fw.toast(message) : showToast(message);
}
function feedback(id, message, error = false) { const el = $(id); el.textContent = message || ""; el.classList.toggle("error", error); }
function errorText(error) { return (error?.message || "Something went wrong. Try again.") + (error?.requestId ? " Reference: " + error.requestId : ""); }
function actionableError(error, id) {
  if (disposed) return;
  if (id) feedback(id, errorText(error), true); else toast(errorText(error));
  if (error?.code !== "identity_confirmation_required") return;
  const target = $(id || "setup-message");
  if (!id) { target.replaceChildren(node("span", "", "Confirm your identity to finish this setup, then retry here.")); $("setup-banner").hidden = false; }
  const recover = identityHost()?.confirmIdentity ? button("Confirm identity", async () => {
    if (await identityHost().confirmIdentity({ reason: "Confirm your InFlite account to update Atlas connections.", expectedOwner: state.owner, signal: lifetime.signal })) {
      feedback(id || "setup-message", "Identity confirmed. Retry your change.");
    }
  }, "identity-recovery") : node("a", "identity-recovery", "Confirm identity in InFlite");
  if (!identityHost()?.confirmIdentity) recover.href = "/#settings=account-confirm";
  target.append(document.createTextNode(" "), recover);
}
async function busy(control, action, feedbackId) {
  if (disposed || control.disabled || control.classList.contains("busy-label")) return;
  control.disabled = true; control.classList.add("busy-label");
  try { return await action(); }
  catch (error) {
    if (error.accountChanged) return;
    // This explicit server rejection happens before the write. Never retry an
    // ambiguous network failure, which could repeat a successful operation.
    if (error.code === "identity_confirmation_required" && identityHost()?.confirmIdentity) {
      try {
        const owner = state.owner, epoch = state.epoch;
        const confirmed = await identityHost().confirmIdentity({ reason: "Confirm your InFlite account to save this Atlas change.", expectedOwner: owner, signal: lifetime.signal });
        checkEpoch(epoch);
        if (confirmed && state.owner === owner) return await action();
      } catch (retryError) { if (!retryError.accountChanged) actionableError(retryError, feedbackId); return; }
    }
    actionableError(error, feedbackId);
  } finally { control.disabled = false; control.classList.remove("busy-label"); if (!disposed) updateComposer(); }
}
function clearPrivateState(message = "Your session changed. Checking access…") {
  leaveDestination();
  briefListRequest?.abort(); briefListRequest = null; showBriefList();
  threadsRequest?.abort(); threadsRequest = null; threadsArchived = null; threadsError = "";
  cancelThreadSelection();
  answerSubmission = null;
  detachCodingObserver(); state.codingRuns = []; state.codingContinuation = null; state.codingRestart = null; state.codingReview = null; state.codingLoading = false; state.codingLoadError = ""; state.codingDispatching = false;
  state.environments = []; state.environmentsReady = null; state.environmentsLoading = false; state.environmentId = ""; state.environmentEditingRevision = null; state.environmentEditorSession++; state.environmentEditorVersion++; state.environmentsRequest++; state.intent = "code"; state.taskTabs.clear(); state.taskExpanded.clear(); state.taskChanges.clear();
  state.epoch++; state.stream?.controller.abort(); state.stream = null; state.dispatching = false; state.owner = null; state.health = null; state.conversation = null; state.conversations = []; state.messages = []; state.activeId = null; state.context = []; state.contexts = []; state.repositories = []; state.models = []; state.tasks = []; state.scheduleContext = []; state.patches = []; state.selectedPatch = null; state.settings = null; state.privateReady = false; state.drafts.clear(); state.workspaceContext = []; state.contextPending = false; state.briefs = []; dirtyForms.clear(); state.navigation++; state.contextLoad++;
  for (const controller of state.controllers) controller.abort(); state.controllers.clear(); state.messagePage = {};
  for (const id of ["messages", "conversation-list", "attached-context", "provider-health", "usage-totals", "usage-requests", "briefs-list", "brief-detail", "context-list", "patches-list", "patch-detail", "inbox-list", "schedules-list", "schedule-runs-list", "schedule-context", "thread-summary-text", "environments-list"]) $(id)?.replaceChildren();
  for (const id of ["prompt", "provider-key", "github-token", "memory-text", "schedule-prompt", "schedule-title", "conversation-search", "environment-id", "environment-name", "environment-branch", "environment-setup", "environment-test"]) if ($(id)) $(id).value = "";
  sheets.closeAll();
  activeToast?.close();
  for (const id of ["provider-feedback", "github-feedback", "preferences-feedback", "patch-feedback", "inbox-feedback", "context-feedback", "schedule-feedback", "context-repository", "github-health", "conversation-status", "coding-feedback", "environment-feedback", "environments-feedback", "toast"]) if ($(id)) $(id).textContent = "";
  $("inbox-filter").value = "all";
  for (const id of ["repository", "schedule-repository", "provider-model", "environment-repository", "coding-environment"]) if ($(id)) $(id).replaceChildren();
  $("environment-form").hidden = true; syncEnvironmentLayout();
  $("schedule-id").value = ""; $("fitness-consent").checked = false; $("schedule-fitness-consent").checked = false; $("memory-enabled").checked = false; $("conversation-menu").hidden = true; $("thread-summary").hidden = true; $("older-history").hidden = true; $("schedule-form").hidden = true; $("schedule-runs").hidden = true;
  replaceConversationUrl(null); navigation(false);
  $("conversation-title").textContent = "New conversation"; $("connection-label").textContent = "Sign in required"; $("session-notice").textContent = message; root.classList.add("session-check"); updateComposer();
}
function checkEpoch(epoch) { if (disposed || epoch !== state.epoch) { const error = Error("This response belongs to a previous session."); error.accountChanged = true; throw error; } }
function inspectOwner(response, data, { health = false } = {}) {
  const next = response.headers.get("X-Atlas-Owner") || (health && typeof data?.owner === "string" ? data.owner : null);
  if ((state.owner && next && state.owner !== next) || data?.code === "session_changed") { clearPrivateState(); const e = Error("Your account changed. Reloading Atlas…"); e.accountChanged = true; queueMicrotask(() => { if (!disposed) bootstrap(); }); throw e; }
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
    checkEpoch(epoch); inspectOwner(response, data, { health: path === "health" || path === "session" });
    if (!response.ok) { const e = Error(data.error || "Request failed."); e.code = data.code; e.requestId = data.requestId; e.status = response.status; throw e; }
    return data;
  } catch (error) { checkEpoch(epoch); throw error; }
  finally { clearTimeout(timer); signal?.removeEventListener("abort", stop); state.controllers.delete(controller); }
}
async function download(path, name) {
  const epoch = state.epoch;
  const response = await fetch("/atlas/api/" + path, { credentials: "same-origin", cache: "no-store", headers: { "X-Inflite": "1", ...(state.owner ? { "X-Atlas-Owner": state.owner } : {}) } });
  if (!response.ok) { let data = {}; try { data = await response.json(); } catch {} checkEpoch(epoch); inspectOwner(response, data); throw Error(data.error || "The export could not be downloaded."); }
  checkEpoch(epoch); inspectOwner(response, null); const blob = await response.blob(); checkEpoch(epoch); const url = URL.createObjectURL(blob), a = node("a"); a.href = url; a.download = name; root.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function titleFilename(value) { return (String(value || "atlas").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "atlas") + ".md"; }
function drawerLayout(narrow = matchMedia(mobileQuery).matches) {
  return narrow || root.classList.contains("ifl-in-pane");
}
function placeSidebar(narrow) {
  const drawer = drawerLayout(narrow);
  if (!drawer) navigation(false);
  const slot = $(drawer ? "navigation-slot" : "sidebar-slot"), sidebar = $("atlas-sidebar");
  if (sidebar.parentNode !== slot) slot.append(sidebar);
}
function navigation(open, { search = !!fw } = {}) {
  if (!open) return navigationSheet?.now();
  if (navigationSheet) return;
  if (!drawerLayout() && !destination) { $("conversation-search").focus(); return; }
  const toggle = $("navigation-toggle");
  toggle.setAttribute("aria-expanded", "true");
  toggle.focus({ preventScroll: true });
  $("navigation-slot").append($("atlas-sidebar"));
  navigationSheet = sheets.openEl($("navigation-dialog"), { focus: search ? $("conversation-search") : undefined, onClose: () => {
    navigationSheet = null;
    toggle.setAttribute("aria-expanded", "false");
    if (!drawerLayout()) $("sidebar-slot").append($("atlas-sidebar"));
  } });
}
function openDialog(name, trigger, options) {
  if (trigger && navigationSheet?.el.contains(trigger)) trigger = $("navigation-toggle");
  navigation(false);
  const top = sheets.top();
  if (top?.el.id === "workspace-dialog" && name !== "workspace") {
    top.now();
    trigger = $("open-workspace");
  }
  trigger?.focus({ preventScroll: true });
  return sheets.openEl($(name + "-dialog"), options);
}
function leaveDestination() {
  if (!destination) return;
  const { name, source, content } = destination;
  destination = null;
  if (name === "inbox") closeCodingInbox(codingInbox);
  if (name === "run-timeline") clearRunTimeline();
  if (name === "briefs") {
    briefListRequest?.abort(); briefListRequest = null; showBriefList();
    $("briefs-list").removeAttribute("aria-busy");
  }
  if (name === "environments") {
    $("environment-toolbar").append($("new-environment"));
    $("new-environment").hidden = false;
  }
  $("run-back-to-list").hidden = true;
  content.classList.remove("atlas-page-content");
  content.classList.add("ifs-body");
  source.append(content);
  $("atlas-destination").hidden = true;
  $("conversation-main").hidden = false;
  $("sidebar-slot").hidden = false;
}
function enterDestination(name) {
  if (destination?.name === name) return;
  if (destination?.name === "inbox" && name === "run-timeline") inboxScroll = $("atlas-destination-scroll").scrollTop;
  else if (name === "inbox" && destination?.name !== "run-timeline") inboxScroll = 0;
  navigation(false); sheets.closeAll(); leaveDestination(); detachCodingObserver();
  if (threadSelection) { cancelThreadSelection(); ++state.navigation; $("conversation-status").replaceChildren(); }
  const source = $(name + "-dialog"), content = source.querySelector(".ifs-body");
  const page = $("atlas-destination"), heading = $("atlas-destination-title");
  destination = { name, source, content };
  heading.textContent = source.querySelector("h2").textContent;
  $("run-back-to-list").hidden = name !== "run-timeline";
  if (name === "environments") {
    $("atlas-destination-actions").append($("new-environment"));
    syncEnvironmentLayout();
  }
  content.classList.remove("ifs-body");
  content.classList.add("atlas-page-content");
  $("atlas-destination-body").replaceChildren(content);
  $("atlas-destination-scroll").scrollTop = 0;
  $("conversation-main").hidden = true;
  $("sidebar-slot").hidden = true;
  page.hidden = false;
  heading.focus({ preventScroll: true });
}
function clearNativeKeyboard() {
  if (!keyboardShell) return;
  keyboardShell.style.removeProperty("--atlas-viewport-bottom");
  keyboardShell.removeAttribute("data-atlas-keyboard");
  keyboardShell = null;
  fw.tabs?.away(false);
}
function fitComposerViewport() {
  const viewport = window.visualViewport;
  const body = root;
  const height = document.documentElement.clientHeight;
  const typing = matchMedia("(any-pointer: coarse)").matches && document.activeElement === $("prompt");
  const keyboardUp = viewport && Math.abs(viewport.scale - 1) < .01 && height - viewport.height > 80;
  if (fw) {
    const shell = fw.screenEl?.closest("#in");
    if ((!typing && !keyboardShell) || !keyboardUp || !visible() || !shell || root.classList.contains("ifl-in-pane")) return clearNativeKeyboard();
    if (shell !== keyboardShell) {
      clearNativeKeyboard();
      keyboardShell = shell;
      shell.setAttribute("data-atlas-keyboard", "");
      fw.tabs?.away(true);
    }
    shell.style.setProperty("--atlas-viewport-bottom", Math.round(viewport.height + viewport.offsetTop) + "px");
    return;
  }
  if ((typing || body.classList.contains("atlas-keyboard")) && keyboardUp) {
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
  const environmentsUpgrade = ready && health?.environments?.ready === false;
  const workspaceContextUpgrade = ready && health?.workspaceContext?.ready === false;
  const runsUpgrade = ready && health?.runs?.ready === false;
  $("setup-banner").hidden = ready && !codingUpgrade && !environmentsUpgrade && !workspaceContextUpgrade && !runsUpgrade; $("upgrade-storage").disabled = !health; $("upgrade-storage").hidden = health?.storage?.code === "storage_missing";
  $("setup-message").textContent = health?.storage?.code === "storage_missing" ? "Connect Atlas storage in the deployment settings, then reload this page." : codingUpgrade ? "Upgrade storage to save coding tasks and reconnect to their progress. Your conversations are ready to use." : environmentsUpgrade ? "Save reusable cloud environments with repository setup and focused checks." : workspaceContextUpgrade ? "Enable selected Mail context and connected app drafts in your InFlite workspace. Existing conversations remain available." : runsUpgrade ? "Enable saved timelines and checkpoints for Atlas runs." : "Prepare storage for conversations, sources and saved work.";
  $("upgrade-storage").textContent = codingUpgrade ? "Enable coding tasks" : environmentsUpgrade ? "Enable cloud environments" : workspaceContextUpgrade ? "Enable connected context" : runsUpgrade ? "Enable run timelines" : "Prepare workspace";
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
  const ready = state.privateReady && !threadSelection && state.health?.storage?.ready && state.health?.provider?.keySaved && state.health?.provider?.decryptable !== false && !state.conversation?.archived;
  const hasPrompt = !!$("prompt").value.trim();
  $("send").disabled = !ready || !!state.stream || state.dispatching || state.codingDispatching || !hasPrompt;
  $("stop-response").hidden = !state.stream;
  $("mode").disabled = !!state.activeId || state.dispatching || state.codingDispatching; $("repository").disabled = !!state.activeId || state.dispatching || state.codingDispatching;
  if (fw) for (const button of $("mode-choices").children) {
    const selected = button.dataset.mode === $("mode").value;
    button.setAttribute("aria-pressed", String(selected)); button.disabled = $("mode").disabled;
    button.hidden = !!state.activeId && !selected;
  }
  for (const control of all(".environment-use, #use-environment")) control.disabled = state.dispatching || state.codingDispatching;
  const mode = state.conversation?.mode || $("mode").value;
  const code = mode === "developer" && state.intent === "code";
  root.dataset.atlasMode = mode;
  $("workspace-label").textContent = modeNames[mode] || mode;
  $("composer-mode-label").textContent = mode === "developer" ? "" : modeNames[mode] || "Options";
  $("composer-intent").hidden = mode !== "developer";
  $("intent-code").setAttribute("aria-pressed", String(state.intent === "code")); $("intent-ask").setAttribute("aria-pressed", String(state.intent === "ask"));
  $("repository-control").dataset.intent = code ? "code" : "ask"; $("coding-environment").closest(".environment-context").hidden = !code; $("manage-environments").hidden = !!fw || !code;
  if (fw && mode === "developer") {
    const repository = $("repository").value, environment = $("coding-environment").selectedOptions[0]?.textContent || "Default environment";
    $("repository-display").textContent = repository.split("/").at(-1) || "Select repository";
    $("repository-display").parentElement.title = repository;
    $("environment-display").textContent = environment;
    $("environment-display").parentElement.title = environment;
  }
  $("repository-control").hidden = mode !== "developer"; $("fitness-control").hidden = mode !== "fitness"; $("start-coding").hidden = !code;
  $("send").hidden = code || !!state.stream;
  $("background-answer").hidden = code || (!!fw && !hasPrompt) || state.health?.runs?.backgroundAvailable !== true || state.workspaceContext.some(source => source.kind === "mail");
  $("background-answer").disabled = $("send").disabled || state.contextPending;
  $("parallel-research").hidden = mode !== "research" || !hasPrompt || state.health?.runs?.parallelAvailable !== true || $("background-answer").hidden;
  $("parallel-research").disabled = $("background-answer").disabled;
  $("prompt").placeholder = mode === "developer" ? code ? "Describe the change you want to make…" : "Ask about your repository…" : "What should we work on?";
  $("repository-note").hidden = mode !== "developer" || !$("repository").value;
  const continuation = state.codingRuns.find(run => run.id === state.codingContinuation && run.canContinue);
  if (!continuation) state.codingContinuation = null;
  const restart = state.codingRuns.find(run => run.id === state.codingRestart?.id && !codingActive(run));
  if (!restart) state.codingRestart = null;
  const recovery = continuation || restart;
  const activeTask = state.codingRuns.some(run => codingActive(run) && run.id !== continuation?.id);
  $("start-coding").textContent = continuation ? "Continue task" : state.codingRestart?.restoreRevision ? "Restore and continue" : restart ? "Start again" : "Work on task";
  $("start-coding").disabled = !ready || state.health?.coding?.ready !== true || state.health?.coding?.storageReady !== true || !$("repository").value || !!state.stream || state.dispatching || state.codingDispatching || state.codingLoading || !!state.codingLoadError || activeTask || !hasPrompt;
  $("coding-environment").disabled = !!recovery || activeTask || state.environmentsLoading || state.codingDispatching;
  $("coding-environment").title = recovery ? "This task keeps its original cloud environment." : "Choose reusable cloud setup for the next task.";
  $("coding-options").hidden = mode !== "developer";
  $("coding-health").textContent = state.health?.coding?.ready ? "" : state.health?.coding?.message || "Coding tasks are unavailable. You can still ask Atlas about this repository with Send.";
  $("coding-health").hidden = !$("coding-health").textContent;
  $("coding-continue-note").hidden = !code || !recovery;
  $("coding-continue-label").textContent = continuation ? "Continuing this cloud workspace" : state.codingRestart?.restoreRevision ? `Restoring saved revision ${state.codingRestart.restoreRevision} at its original commit` : restart ? "Fresh workspace · original environment settings" : "";
  const publish = $("publish-coding"), review = state.codingReview;
  if (publish && review?.run) publish.disabled = publish.classList.contains("busy-label") || review.stale || !review.hasFiles || !review.run.reviewReady || codingActive(review.run) || !state.health?.github?.connected;
  $("attach-context").disabled = !$("repository").value || !state.health?.storage?.ready;
  if (state.contextPending) { $("send").disabled = true; $("start-coding").disabled = true; }
  if (fw) updateNativeHeader();
  const needsProvider = state.privateReady && state.health?.storage?.ready && (!state.health.provider?.keySaved || state.health.provider?.decryptable === false);
  $("connect-provider").hidden = !needsProvider;
  $("connect-provider").textContent = state.health?.provider?.keySaved ? "Check provider connection" : "Connect provider";
  $("composer-hint").textContent = !state.health?.storage?.ready ? "Prepare the workspace to start a conversation." : state.conversation?.archived ? "Restore this conversation to continue." : state.stream && state.stream.conversationId !== state.activeId ? "A response is running in another conversation." : "";
  $("composer-hint").hidden = !$("composer-hint").textContent;
}
function saveDraft() { state.drafts.set(state.activeId || "new", { prompt: $("prompt").value, context: [...state.context], fitness: $("fitness-consent").checked, environmentId: state.environmentId, intent: state.intent }); }
function restoreDraft(id) { const draft = state.drafts.get(id || "new"); $("prompt").value = draft?.prompt || ""; state.context = draft?.context || []; state.environmentId = draft?.environmentId || ""; state.intent = draft?.intent || "code"; $("fitness-consent").checked = !!draft?.fitness; renderContextChips(); fillEnvironmentChoices(); resizePrompt(); }
function renderThreads() {
  const list = $("conversation-list"), archived = $("show-archived").checked;
  const words = $("conversation-search").value.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const rows = threadsArchived === archived ? state.conversations.filter(c => {
    const searchable = [c.title, c.repository, modeNames[c.mode] || c.mode].join(" ").toLowerCase();
    return words.every(word => searchable.includes(word));
  }) : [];
  const content = [];
  for (const c of rows) {
    const b = button("", () => selectConversation(c.id), "ifl-row atlas-disclosure");
    b.setAttribute("aria-current", String(c.id === state.activeId));
    const text = node("span", "ifl-tx");
    text.append(node("b", "thread-name", c.title || "Untitled conversation"), node("small", "thread-date", [modeNames[c.mode] || c.mode, c.repository, shortDate(c.updated_at || c.created_at)].filter(Boolean).join(" · ")));
    b.append(text);
    content.push(b);
  }
  if (!rows.length && !threadsError) content.push(emptyState(threadsRequest ? "Loading conversations…" :
    words.length ? "No matching conversations" : archived ? "No archived conversations" : "No conversations yet"));
  $("clear-conversation-search").hidden = !$("conversation-search").value;
  if (threadsError) {
    content.push(emptyState("History is unavailable", threadsError, button("Retry history", loadThreads, "quiet-button")));
  }
  list.setAttribute("aria-busy", String(!!threadsRequest)); list.replaceChildren(...content);
}
async function loadThreads() {
  threadsRequest?.abort();
  const request = new AbortController(), archived = $("show-archived").checked;
  threadsRequest = request; threadsError = ""; renderThreads();
  try {
    const result = await api("conversations?archived=" + (archived ? "1" : "0"), "GET", undefined, { signal: request.signal, timeout: 20000 });
    if (threadsRequest !== request || disposed) return;
    state.conversations = result.conversations || []; threadsArchived = archived;
    fw?.workspace?.changed();
  } catch (error) {
    if (threadsRequest === request && !error.accountChanged) threadsError = "Conversation history could not load. " + errorText(error);
  } finally {
    if (threadsRequest === request) { threadsRequest = null; renderThreads(); }
  }
}
function cancelThreadSelection() {
  const request = threadSelection; threadSelection = null; request?.abort();
  $("messages").removeAttribute("aria-busy");
}
function replaceConversationUrl(id) { if (fw) { if (!routing && !routeSyncSuppressed && shown) fw.nav.go(fw.nav.href("conversations", id || null), { replace: true }); return; } const url = new URL(location.href); if (id) url.searchParams.set("conversation", id); else url.searchParams.delete("conversation"); history.replaceState(null, "", url.pathname + url.search); }
async function selectConversation(id, { preserveDraft = false } = {}) {
  cancelThreadSelection();
  const request = new AbortController(), generation = ++state.navigation;
  threadSelection = request; detachCodingObserver(); navigation(false);
  $("messages").setAttribute("aria-busy", "true"); $("conversation-status").textContent = "Loading conversation…"; updateComposer();
  try {
    const result = await api("conversations/" + encodeURIComponent(id), "GET", undefined, { signal: request.signal, timeout: 20000 });
    if (threadSelection !== request || generation !== state.navigation) return;
    if (!preserveDraft) saveDraft();
    threadSelection = null; $("messages").removeAttribute("aria-busy"); feedback("coding-feedback", "");
    state.codingRuns = []; state.codingContinuation = null; state.codingRestart = null; state.codingLoadError = "";
    state.conversation = result.conversation; state.activeId = id; state.messages = result.messages || []; if (state.stream?.conversationId === id) { const at = state.messages.findIndex(m => m.id === state.stream.message.id); if (at < 0) state.messages.push(state.stream.message); else state.messages[at] = state.stream.message; } $("mode").value = state.conversation.mode; setRepository(state.conversation.repository || "");
    $("conversation-title").textContent = state.conversation.title || "Untitled conversation"; $("conversation-menu").hidden = false; $("conversation-menu").open = false;
    $("archive-conversation").textContent = state.conversation.archived ? "Restore conversation" : "Archive";
    $("thread-summary").hidden = !state.conversation.summary; $("thread-summary-text").textContent = state.conversation.summary || "";
    state.messagePage = { hasMore: !!result.hasMore, nextBeforeId: result.nextBeforeId }; $("older-history").hidden = !state.messagePage.hasMore;
    if (!routing) leaveDestination();
    state.workspaceContext = []; restoreDraft(id); renderMessages(); renderThreads(); updateComposer(); replaceConversationUrl(id); $("conversation-status").textContent = ""; await Promise.allSettled([observeCodingRuns(), loadWorkspaceContext(id, generation)]);
  } catch (error) { if (threadSelection === request && generation === state.navigation && !error.accountChanged) {
    threadSelection = null; $("messages").removeAttribute("aria-busy");
    $("conversation-status").replaceChildren(node("span", "", errorText(error)));
    if (error.status === 404 && !state.activeId) {
      $("conversation-title").textContent = "Conversation unavailable"; renderMessages();
      $("conversation-status").append(button("Start a new conversation", () => newConversation(), "text-button"));
    } else if (error.status !== 404) $("conversation-status").append(button("Retry opening", () => selectConversation(id, { preserveDraft }), "text-button"));
    updateComposer();
    if (state.activeId) await observeCodingRuns({ restore: false });
  } }
}
function newConversation(mode) { leaveDestination(); cancelThreadSelection(); $("conversation-status").replaceChildren(); feedback("coding-feedback", ""); saveDraft(); detachCodingObserver(); state.codingRuns = []; state.codingContinuation = null; state.codingRestart = null; state.codingLoadError = ""; state.codingLoading = false; state.navigation++; state.activeId = null; state.conversation = null; state.messages = []; state.messagePage = {}; state.context = []; state.workspaceContext = []; $("conversation-title").textContent = "New conversation"; $("conversation-menu").hidden = true; $("thread-summary").hidden = true; $("older-history").hidden = true; if (mode && modeNames[mode]) $("mode").value = mode; restoreDraft(null); renderMessages(); renderThreads(); updateComposer(); replaceConversationUrl(null); navigation(false); $("prompt").focus(); }
async function loadOlderMessages(control) {
  await busy(control, async () => {
    const id = state.activeId, generation = state.navigation, before = state.messagePage.nextBeforeId;
    if (!id || threadSelection || !state.messagePage.hasMore || !before) return;
    const result = await api("conversations/" + encodeURIComponent(id) + "?before=" + encodeURIComponent(before) + "&limit=100");
    if (id !== state.activeId || generation !== state.navigation) return;
    const container = $("messages"), anchor = container.querySelector(".turn"), top = anchor?.getBoundingClientRect().top;
    const known = new Set(state.messages.map(message => message.id));
    const older = (result.messages || []).filter(message => !known.has(message.id));
    state.messages = [...older, ...state.messages];
    state.messagePage = { hasMore: !!result.hasMore, nextBeforeId: result.nextBeforeId };
    container.prepend(...older.map(messageElement));
    $("older-history").hidden = !state.messagePage.hasMore;
    if (anchor) container.scrollTop += anchor.getBoundingClientRect().top - top;
    if (document.activeElement === control && control.parentElement.hidden) container.focus({ preventScroll: true });
    updateLatestControl();
  });
}
async function ensureConversation(snapshot = {}, lease = {}) {
  const current = () => !lease.signal?.aborted && (!lease.current || lease.current());
  if (!current()) throw new DOMException("Action ended", "AbortError");
  if (state.activeId) return state.conversation;
  const generation = state.navigation, mode = snapshot.mode || $("mode").value, repository = snapshot.repository ?? $("repository").value;
  const result = await api("conversations", "POST", { title: (snapshot.prompt ?? $("prompt").value).trim().slice(0, 80) || "New conversation", mode, repository: mode === "developer" ? repository || null : null }, { signal: lease.signal });
  if (!current()) throw new DOMException("Action ended", "AbortError");
  if (generation === state.navigation && !state.activeId) { state.conversation = result.conversation; state.activeId = result.conversation.id; $("conversation-title").textContent = result.conversation.title; $("conversation-menu").hidden = false; replaceConversationUrl(state.activeId); updateComposer(); }
  loadThreads().catch(() => {}); return result.conversation;
}
function sourceList(sources = []) { const list = node("ol", "source-list"); const seen = new Set(); sources.forEach((source, i) => { const url = safeUrl(source.url); if (!url || seen.has(url)) return; seen.add(url); const li = node("li"), a = node("a", "", (i + 1) + ". " + (source.title || new URL(url).hostname)); a.href = url; a.target = "_blank"; a.rel = "noopener noreferrer"; a.title = source.title || url; li.append(a); list.append(li); }); return list; }
function isAtLatest(container, tolerance = 100) {
  return container.scrollHeight - container.scrollTop - container.clientHeight < tolerance;
}
function updateLatestControl() {
  const control = $("jump-to-latest");
  const hidden = !(state.messages.length || state.codingRuns.length) || isAtLatest($("messages"));
  if (control.hidden !== hidden) control.hidden = hidden;
}
function jumpToLatest({ focus = false } = {}) {
  const container = $("messages");
  if (focus) container.focus({ preventScroll: true });
  container.scrollTop = container.scrollHeight;
  updateLatestControl();
}
function renderMessages() {
  const container = $("messages"); container.replaceChildren();
  if (!state.messages.length && !state.codingRuns.length && !state.codingLoadError) {
    if (fw && state.activeId) {
      const empty = emptyState("No messages yet");
      empty.classList.add("empty-conversation");
      container.append(empty);
      updateLatestControl();
      return;
    }
    const welcome = $("welcome-template").content.cloneNode(true);
    welcome.querySelector("[data-history]").addEventListener("click", () => navigation(true, { search: false }));
    const recent = welcome.querySelector('[data-open="runs"]');
    recent.addEventListener("click", () => showPanel("runs", recent));
    for (const starter of welcome.querySelectorAll("[data-starter]")) starter.addEventListener("click", () => {
      if (!state.activeId && $("mode").value !== starter.dataset.mode) {
        $("mode").value = starter.dataset.mode;
        $("mode").dispatchEvent(new Event("change"));
      }
      if (!$("prompt").value.trim()) $("prompt").value = starter.dataset.starter;
      resizePrompt(); updateComposer(); saveDraft(); $("prompt").focus();
    });
    container.append(welcome);
    updateLatestControl();
    return;
  }
  for (const message of state.messages) container.append(messageElement(message));
  renderCodingRuns();
  jumpToLatest();
}
function messageElement(message) {
  const group = node("section", "turn"); group.dataset.messageId = message.id;
  const user = node("article", "message user"), userBody = node("div", "message-content", message.prompt); user.append(userBody); group.append(user);
  const assistant = node("article", "message assistant"), heading = node("div", "message-heading"); heading.append(node("span", "assistant-label", "Atlas"));
  const status = node("span", "message-status", message.status === "running" ? "Responding…" : message.status === "completed" ? "" : message.status || ""); status.dataset.status = message.status; status.hidden = message.status === "completed"; heading.append(status); assistant.append(heading);
  const running = message.status === "running";
  const body = node("div", running ? "message-content streaming-text" : "message-content");
  if (running) body.append(document.createTextNode(message.answer || ""));
  else renderAnswer(body, message.answer || "", message.sources || []);
  assistant.append(body);
  if (!running) assistant.append(sourceList(message.sources));
  if (message.error_code || message.errorMessage) assistant.append(node("p", "message-error", message.errorMessage || "This response is " + (message.status || "unavailable") + ". " + String(message.error_code || "").replaceAll("_", " ")));
  if (message.context?.length) { const used = node("div", "context-note context-chips"); used.setAttribute("aria-label", "Context used for this response"); for (const c of message.context) used.append(node("span", "context-chip", (c.path || c.title || c.repository || c.kind) + (c.ref ? " · " + String(c.ref).slice(0, 12) : "") + (c.kind === "mail" && c.truncated ? " · Partial context" : ""))); assistant.append(used); }
  const actions = node("div", "message-actions");
  if (!running && message.answer) actions.append(button("Copy answer", async () => { try { await navigator.clipboard.writeText(message.answer); toast("Answer copied."); } catch { toast("Select the answer to copy it."); } }));
  if (message.answer && message.status !== "running") actions.append(button("Save as brief", e => busy(e.currentTarget, async () => { const result = await api("briefs", "POST", { conversationId: state.activeId, messageId: message.id, title: state.conversation?.title }); toast("Saved to research briefs."); return result; })));
  if (message.answer && message.status !== "running" && fw?.workspace?.handoffs) {
    const context = (message.context || []).find(item => item.kind === "mail");
    const source = context?.threadId ? { app: "mail", threadId: context.threadId } : undefined;
    const title = (state.conversation?.title || "Atlas answer").slice(0, 160);
    const handoff = (app, kind, payload) => async event => busy(event.currentTarget, async () => {
      const result = await fw.workspace.handoffs.send(app, kind, payload);
      if (result?.ok === false || result === false) toast("That app could not open. Your answer is still here.");
    });
    if (context?.threadId && context?.messageId && message.answer.length <= 16000) actions.append(button("Review reply in Mail", handoff("mail", "mail-reply", { threadId: context.threadId, messageId: context.messageId, text: message.answer })));
    else if (message.answer.length <= 16000) actions.append(button("Draft in Mail", handoff("mail", "text", { subject: title, text: message.answer })));
    if (message.answer.length <= 64000) actions.append(button("Save to Notes", handoff("notes", "note-draft", { title, text: message.answer, ...(source ? { source } : {}) })));
    if (message.answer.length <= 4000) actions.append(button("Plan in Calendar", handoff("calendar", "event-draft", { title, description: message.answer, ...(source ? { source } : {}) })));
  }
  if (["failed", "cancelled", "incomplete"].includes(message.status)) actions.append(button("Retry", () => { if (state.stream) return toast("Stop the current response first."); state.intent = "ask"; $("prompt").value = message.prompt; state.context = (message.context || []).filter(c => c.automatic !== true && ["file", "pull", "job"].includes(c.kind)).map(contextDescriptor); $("fitness-consent").checked = state.conversation?.mode === "fitness" && (!!message.includeFitness || (message.context || []).some(c => c.kind === "fitness")); renderContextChips(); resizePrompt(); updateComposer(); $("prompt").focus(); toast("Review the prompt, then Send to try again."); }));
  if (message.status === "uncertain") actions.append(button("Check saved result", () => selectConversation(state.activeId, { preserveDraft: true })));
  assistant.append(actions); group.append(assistant); return group;
}
function queueMessage(message, conversationId) {
  queuedMessage = { message, conversationId };
  if (!paintFrame) paintFrame = requestAnimationFrame(() => { paintFrame = 0; const next = queuedMessage; queuedMessage = null; if (next && !disposed) updateMessage(next.message, next.conversationId); });
}
function updateMessage(message, conversationId) {
  if (queuedMessage?.message.id === message.id) { cancelAnimationFrame(paintFrame); paintFrame = 0; queuedMessage = null; }
  if (state.activeId !== conversationId) return;
  const index = state.messages.findIndex(m => m.id === message.id); if (index < 0) state.messages.push(message); else state.messages[index] = message;
  const container = $("messages"), nearBottom = isAtLatest(container);
  const old = container.querySelector('[data-message-id="' + CSS.escape(String(message.id)) + '"]');
  const liveText = message.status === "running" && old?.querySelector(".streaming-text")?.firstChild;
  if (liveText) liveText.data = message.answer || "";
  else if (old) old.replaceWith(messageElement(message));
  else { container.querySelector(".welcome, .empty-conversation")?.remove(); container.insertBefore(messageElement(message), $("coding-runs")); }
  if (nearBottom) jumpToLatest();
  else updateLatestControl();
}
function contextDescriptor(c) { const value = { kind: c.kind, repository: c.repository }; for (const k of ["path", "ref", "number", "id"]) if (c[k] != null) value[k] = c[k]; return value; }
function renderContextChips() { const target = $("attached-context"); target.replaceChildren(); state.context.forEach((context, i) => { const chip = node("div", "context-chip"); const title = context.path || context.title || (context.kind === "pull" ? "PR #" + context.number : "Job " + context.id); chip.append(node("span", "", title), button("×", () => { state.context.splice(i, 1); renderContextChips(); updateComposer(); })); chip.lastChild.setAttribute("aria-label", "Remove " + title); chip.title = context.ref ? "Revision " + context.ref : title; target.append(chip); }); renderWorkspaceContext(target); }
function resizePrompt() { const el = $("prompt"); el.style.height = "auto"; el.style.height = Math.min(el.scrollHeight, matchMedia(mobileQuery).matches ? 140 : 180) + "px"; }
async function loadWorkspaceContext(id = state.activeId, generation = state.navigation) {
  if (!id || !fw) return;
  try {
    const data = await api("conversations/" + encodeURIComponent(id) + "/workspace-context");
    if (generation !== state.navigation || state.activeId !== id) return;
    state.workspaceContext = data.context || []; renderContextChips();
  } catch (error) { if (!error.accountChanged && generation === state.navigation) toast("Connected context could not refresh. " + errorText(error)); }
}
function renderWorkspaceContext(target) {
  for (const context of state.workspaceContext) {
    const title = "Mail · " + (context.title || "Selected thread") + (context.truncated ? " · Partial context" : ""), chip = node("div", "context-chip workspace-context-chip");
    chip.append(node("span", "", title), button("×", event => busy(event.currentTarget, async () => {
      const id = state.activeId, generation = state.navigation;
      await api("conversations/" + encodeURIComponent(id) + "/workspace-context", "DELETE");
      if (id === state.activeId && generation === state.navigation) { state.workspaceContext = []; renderContextChips(); }
    })));
    chip.lastChild.setAttribute("aria-label", "Remove " + title); if (context.truncated) chip.title = "Partial context: older messages, long text or attachments may be omitted."; target.append(chip);
  }
  if (state.contextPending) target.append(node("span", "context-chip", "Connecting selected Mail context…"));
}
async function receiveHandoff(token, lease = {}) {
  const ownerEpoch = state.epoch, episode = routeEpoch;
  const current = () => !disposed && shown && ownerEpoch === state.epoch && episode === routeEpoch && !lease.signal?.aborted && (!lease.current || lease.current());
  if (!fw?.workspace?.handoffs || !current()) return { ok: false };
  await ready; if (!current() || !state.privateReady) return { ok: false };
  const handoff = fw.workspace.handoffs.take(token);
  if (handoff?.kind !== "mail-context" || !current()) return { ok: false };
  // Delivery owns the shell's current route until it returns. A nested route
  // change here would invalidate that lease, so synchronize it afterwards.
  routeSyncSuppressed++;
  newConversation("personal");
  const generation = state.navigation;
  state.contextPending = true; renderContextChips(); updateComposer();
  try {
    const conversation = await ensureConversation({ mode: "personal", prompt: handoff.subject || "Mail conversation" }, { ...lease, current });
    if (!current() || generation !== state.navigation) return { ok: false };
    const data = await api("conversations/" + encodeURIComponent(conversation.id) + "/workspace-context", "POST", { source: { app: "mail", kind: "thread", threadId: handoff.threadId, ...(handoff.messageId ? { messageId: handoff.messageId } : {}) } }, { signal: lease.signal });
    if (!current() || generation !== state.navigation || state.activeId !== conversation.id) return { ok: false };
    state.workspaceContext = data.context || [];
    if (!$("prompt").value) $("prompt").value = "Help me with this email thread.";
    saveDraft(); resizePrompt(); toast("Mail context is attached. Ask Atlas what you need.");
    setTimeout(() => {
      if (!disposed && shown && ownerEpoch === state.epoch && episode === routeEpoch && generation === state.navigation && state.activeId === conversation.id) replaceConversationUrl(conversation.id);
    }, 0);
    return { ok: true };
  } catch (error) { if (current() && !error.accountChanged) toast("Mail context was not attached. " + errorText(error)); return { ok: false }; }
  finally { routeSyncSuppressed--; if (!disposed && generation === state.navigation) { state.contextPending = false; renderContextChips(); updateComposer(); } }
}
async function sendMessage(event) {
  event?.preventDefault(); if (state.stream || state.dispatching || !$("prompt").value.trim()) return;
  const control = $("send"); if (control.disabled) return; control.disabled = true;
  const epoch = state.epoch, originId = state.activeId, generation = state.navigation, mode = state.conversation?.mode || $("mode").value;
  const responseContext = state.workspaceContext.map(context => ({ ...context }));
  const draft = $("prompt").value, prompt = draft.trim(), repository = $("repository").value, context = state.context.map(contextDescriptor), includeFitness = mode === "fitness" && $("fitness-consent").checked;
  state.dispatching = true; $("prompt").value = ""; state.drafts.delete(originId || "new"); resizePrompt(); updateComposer();
  let active, restorePrompt = false;
  try {
    const conversation = await ensureConversation({ prompt, mode, repository }), requestId = uuid(), controller = new AbortController(); checkEpoch(epoch);
    active = { epoch, conversationId: conversation.id, requestId, controller, stopped: false, message: { id: requestId, prompt, answer: "", status: "running", sources: [], context: [...context, ...responseContext], includeFitness, created_at: Date.now() } };
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
      else if (packet.event === "delta") { active.message.answer += typeof data.text === "string" ? data.text : ""; queueMessage(active.message, active.conversationId); }
      else if (packet.event === "source") { if (data.source?.url && !active.message.sources.some(s => s.url === data.source.url && s.start_index === data.source.start_index)) active.message.sources.push(data.source); }
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
async function queueBackgroundAnswer(button, plan) {
  if (button.disabled || button.hidden) return;
  const draft = $("prompt").value, prompt = draft.trim(), generation = state.navigation, epoch = state.epoch;
  const mode = state.conversation?.mode || $("mode").value, repository = $("repository").value;
  const context = state.context.map(contextDescriptor), includeFitness = mode === "fitness" && $("fitness-consent").checked;
  state.dispatching = true; updateComposer();
  try {
    if (plan && !await confirmAction(fw, "Run independent research and verification, then combine the findings? This uses up to three requests from your Atlas allowance.")) return;
    checkEpoch(epoch);
    if (generation !== state.navigation) return;
    feedback("coding-feedback", "Saving run…");
    const conversation = await ensureConversation({ prompt, mode, repository });
    checkEpoch(epoch);
    const payload = { conversationId: conversation.id, prompt, includeFitness, context, ...(plan ? { plan, confirm: true } : {}) };
    const key = JSON.stringify(payload);
    // If the response is lost, retry the same submission instead of creating
    // another run. The server validates that the original payload still matches.
    if (answerSubmission?.key !== key) answerSubmission = { key, id: uuid() };
    const { run } = await api("runs", "POST", { ...payload, requestId: answerSubmission.id }, { timeout: 20000 });
    answerSubmission = null;
    const saved = state.drafts.get(conversation.id);
    if (saved?.prompt === draft) state.drafts.set(conversation.id, { ...saved, prompt: "" });
    if (state.activeId === conversation.id && generation === state.navigation) {
      if ($("prompt").value === draft) { $("prompt").value = ""; saveDraft(); resizePrompt(); }
      feedback("coding-feedback", "");
      if (visible()) openRunTimeline(run, button);
    } else toast("Atlas saved the run. Open Recent runs to follow it.");
  } catch (error) {
    if (!error.accountChanged && epoch === state.epoch) {
      if (error.status && error.status < 500) answerSubmission = null;
      if (generation === state.navigation) feedback("coding-feedback", errorText(error), true);
      else toast(errorText(error));
    }
  } finally {
    if (epoch === state.epoch) { state.dispatching = false; updateComposer(); }
  }
}
async function refreshHealth() { const data = await api("health", "GET", undefined, { timeout: 20000 }); state.health = data; renderHealth(); return data; }
async function loadSettings() {
  const data = await api("settings"); state.settings = data.settings || data;
  if (dirtyForms.has("preferences-form")) return;
  $("memory-enabled").checked = !!state.settings.memoryEnabled; $("memory-text").value = state.settings.memory || "";
  $("daily-request-limit").value = state.settings.dailyRequestLimit ?? 20; $("daily-budget").value = state.settings.dailyBudgetUsd ?? "";
  $("default-timezone").value = state.settings.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/London";
  $("schedule-timezone").value = $("default-timezone").value;
}
async function loadRepositories() {
  const data = await api("repositories"); state.repositories = data.repositories || [];
  for (const id of ["repository", "schedule-repository", "environment-repository"]) { const el = $(id), selected = el.value; el.replaceChildren(); const none = node("option", "", "Select repository"); none.value = ""; el.append(none); for (const repo of state.repositories) { const option = node("option", "", repo.full_name || repo); option.value = repo.full_name || repo; el.append(option); } if ([...el.options].some(o => o.value === selected)) el.value = selected; }
  if (state.conversation?.repository) setRepository(state.conversation.repository); fillEnvironmentChoices(); updateComposer();
}
function setRepository(value) { const el = $("repository"); if (value && ![...el.options].some(o => o.value === value)) { const option = node("option", "", value); option.value = value; el.append(option); } el.value = value; }
function fillEnvironmentChoices() {
  const select = $("coding-environment"), repository = $("repository").value;
  const recovery = state.codingRuns.find(run => run.id === (state.codingContinuation || state.codingRestart?.id));
  if (recovery) { const option = node("option", "", (recovery.environment?.name || "Original environment") + " · " + (recovery.environment?.branch || recovery.baseBranch || "default branch")); option.value = "task:" + recovery.id; select.replaceChildren(option); return; }
  select.replaceChildren(); const defaultOption = node("option", "", "Default environment"); defaultOption.value = ""; select.append(defaultOption);
  const compatible = state.environments.filter(environment => environment.repository === repository);
  for (const environment of compatible) { const option = node("option", "", environment.name); option.value = environment.id; select.append(option); }
  if (state.environmentId && !compatible.some(environment => environment.id === state.environmentId)) state.environmentId = "";
  select.value = state.environmentId;
}
async function loadEnvironments() {
  const epoch = state.epoch, generation = ++state.environmentsRequest;
  state.environmentsLoading = true; updateComposer();
  feedback("environments-feedback", state.environmentsReady == null ? "Loading environments…" : "");
  syncEnvironmentLayout();
  try {
    const data = await api("environments"); checkEpoch(epoch); if (generation !== state.environmentsRequest) return;
    state.environments = data.environments || []; state.environmentsReady = data.ready !== false;
    fillEnvironmentChoices(); renderEnvironments(); feedback("environments-feedback", "");
  } catch (error) {
    if (error.accountChanged) throw error;
    if (generation !== state.environmentsRequest) return;
    if (error.code === "environments_storage_upgrade_required") {
      state.environments = []; state.environmentsReady = false; fillEnvironmentChoices(); renderEnvironments();
    } else {
      feedback("environments-feedback", errorText(error), true);
      $("environments-feedback").append(button("Retry environments", loadEnvironments, "quiet-button"));
    }
  } finally {
    if (epoch === state.epoch && generation === state.environmentsRequest) {
      state.environmentsLoading = false;
      syncEnvironmentLayout(); updateComposer();
    }
  }
}
function syncEnvironmentLayout() {
  const empty = !state.environments.length && !state.environmentsLoading && state.environmentsReady === true && !$("environments-feedback").classList.contains("error");
  const editing = !$("environment-form").hidden;
  $("environment-empty").hidden = !empty || editing;
  $("environment-detail").hidden = !empty && !editing;
  $("environment-directory").hidden = empty && !editing;
  $("environments-list").setAttribute("aria-busy", String(state.environmentsLoading));
  if (destination?.name === "environments") {
    $("new-environment").hidden = editing || !state.environmentsReady || empty;
  }
}
function duplicateEnvironment(environment) {
  editEnvironment({ ...environment, id: null, name: environment.name.slice(0, 70) + " copy" });
}
async function archiveEnvironment(environment, control) {
  await busy(control, async () => {
    if (fw && !await confirmAction(fw, "Archive " + environment.name + "? Existing tasks keep their setup.")) return;
    await api("environments/" + encodeURIComponent(environment.id), "DELETE");
    if (state.environmentId === environment.id) state.environmentId = "";
    await loadEnvironments();
    if ($("environment-id").value === environment.id) closeEnvironmentEditor();
    toast("Environment archived. Existing tasks keep their setup.");
  }, "environments-feedback");
}
function renderEnvironments() {
  const list = $("environments-list"); list.replaceChildren();
  const upgrade = state.environmentsReady === false;
  $("environments-upgrade").hidden = !upgrade; $("new-environment").disabled = upgrade; $("create-first-environment").disabled = upgrade;
  for (const environment of state.environments) {
    const card = node("article", "environment-card"); card.dataset.environmentId = environment.id;
    const open = button("", () => editEnvironment(environment), "environment-open ifl-row atlas-disclosure"), details = node("span", "ifl-tx");
    details.append(node("b", "", environment.name), node("small", "environment-repository", environment.repository),
      node("small", "environment-config", (environment.branch || "Default branch") + " · " + (environment.machine || "medium")));
    open.append(details);
    open.setAttribute("aria-label", "Edit " + environment.name);
    const actions = node("div", "environment-card-actions"), use = button(fw ? "Use for task" : "Use", () => useEnvironment(environment), "text-button environment-use");
    if (fw) use.setAttribute("aria-label", "Use " + environment.name + " for a task");
    actions.append(use);
    if (!fw) actions.append(button("Duplicate", () => duplicateEnvironment(environment), "text-button"),
      button("Archive", event => archiveEnvironment(environment, event.currentTarget), "text-button danger-text"));
    card.append(open, actions); list.append(card);
  }
  syncEnvironmentLayout();
}
function closeEnvironmentEditor() {
  const id = $("environment-id").value;
  dirtyForms.delete("environment-form"); state.environmentEditorSession++; state.environmentEditorVersion++;
  $("environment-form").hidden = true; $("environment-id").value = ""; state.environmentEditingRevision = null;
  feedback("environment-feedback", ""); syncEnvironmentLayout();
  if (destination?.name === "environments") {
    const opened = $("environments-list").querySelector(`[data-environment-id="${CSS.escape(id)}"] .environment-open`);
    (opened || $("atlas-destination-title")).focus();
  }
}
function editEnvironment(environment, { focus = true } = {}) {
  state.environmentEditorSession++; state.environmentEditorVersion++;
  $("environment-empty").hidden = true; $("environment-form").hidden = false;
  $("environment-form-title").textContent = environment?.id ? "Edit environment" : "New environment";
  $("environment-id").value = environment?.id || ""; state.environmentEditingRevision = environment?.id ? environment.revision : null;
  $("environment-name").value = environment?.name || ""; $("environment-branch").value = environment?.branch || ""; $("environment-setup").value = environment?.setupCommand || ""; $("environment-test").value = environment?.testCommand || "";
  const repository = environment?.repository || $("repository").value;
  const select = $("environment-repository"); if (repository && ![...select.options].some(option => option.value === repository)) { const option = node("option", "", repository); option.value = repository; select.append(option); } select.value = repository;
  $("environment-machine").value = environment?.machine || "medium"; $("environment-network").value = environment?.network || "dependencies";
  $("use-environment").hidden = !environment?.id; $("use-environment").disabled = state.dispatching || state.codingDispatching; feedback("environment-feedback", "");
  $("environment-editor-actions").hidden = !fw || !environment?.id;
  syncEnvironmentLayout();
  if (focus) {
    if (destination?.name === "environments") $("atlas-destination-scroll").scrollTop = 0;
    else $("environment-form").scrollIntoView({ block: "nearest" });
    $(fw ? "environment-form-title" : "environment-name").focus({ preventScroll: true });
  }
}
function useEnvironment(environment) {
  if (state.dispatching || state.codingDispatching) return;
  if (state.activeId && (state.conversation?.mode !== "developer" || state.conversation.repository !== environment.repository)) newConversation("developer");
  state.codingContinuation = null; state.codingRestart = null;
  $("mode").value = "developer"; setRepository(environment.repository); state.environmentId = environment.id; state.intent = "code";
  fillEnvironmentChoices(); updateComposer(); saveDraft();
  if (destination?.name === "environments") { leaveDestination(); replaceConversationUrl(state.activeId); }
  const sheet = sheets.top(); if (sheet?.el.id === "environments-dialog") sheet.now();
  $("prompt").focus(); toast(environment.name + " selected for the next task.");
}
async function saveEnvironment(event) {
  event.preventDefault();
  await busy($("save-environment"), async () => {
    const id = $("environment-id").value, epoch = state.epoch, session = state.environmentEditorSession, version = state.environmentEditorVersion;
    const body = { name: $("environment-name").value.trim(), repository: $("environment-repository").value, branch: $("environment-branch").value.trim(), setupCommand: $("environment-setup").value, testCommand: $("environment-test").value, machine: $("environment-machine").value, network: $("environment-network").value, ...(id && state.environmentEditingRevision != null ? { expectedRevision: state.environmentEditingRevision } : {}) };
    let data;
    try { data = await api("environments" + (id ? "/" + encodeURIComponent(id) : ""), id ? "PATCH" : "POST", body); }
    catch (error) { if (error.accountChanged || session === state.environmentEditorSession) throw error; toast(errorText(error)); return; }
    await loadEnvironments(); checkEpoch(epoch);
    if (session !== state.environmentEditorSession) { toast("Environment saved."); return; }
    if (data.environment && version === state.environmentEditorVersion) {
      dirtyForms.delete("environment-form"); editEnvironment(data.environment, { focus: false });
      feedback("environment-feedback", "Environment saved. New tasks use these settings.");
    } else if (data.environment) {
      $("environment-id").value = data.environment.id; state.environmentEditingRevision = data.environment.revision;
      $("environment-form-title").textContent = "Edit environment"; $("use-environment").hidden = false;
      $("environment-editor-actions").hidden = !fw;
      feedback("environment-feedback", "Environment saved. Your newer edits have not been saved yet.");
    }
  }, "environment-feedback");
}
async function showPanel(name, trigger, { page = false } = {}) {
  if (fw && name === "runs") { sheets.closeAll(); fw.nav.section("tasks"); return; }
  if (fw && destinationRoutes[name] && !page) {
    navigation(false); sheets.closeAll(); fw.nav.section(destinationRoutes[name]); return;
  }
  const samePage = page && destination?.name === name;
  if (page) enterDestination(name);
  if (name === "inbox") return openCodingInbox(trigger, page);
  if (name === "runs") {
    openDialog("runs", trigger, { onClose: clearRuns });
    return loadRecentRuns();
  }
  if (!page) openDialog(name, trigger);
  try {
    if (name === "settings") { await refreshHealth(); if (state.health.storage?.ready) { await loadSettings(); if (state.health.provider?.keySaved) { const result = await api("models"); fillModels(result.models, result.selected); } } }
    if (name === "usage") await loadUsage();
    if (name === "briefs" && !samePage) { const loading = loadBriefs(); if (!page) await loading; }
    if (name === "schedules") await loadSchedules();
    if (name === "patches") await loadPatches({ reset: true });
    if (name === "environments") {
      const loading = loadEnvironments().catch(error => { if (!error.accountChanged) toast(errorText(error)); });
      if (!page) await loading;
    }
  } catch (error) { toast(errorText(error)); }
}
function clearRuns() {
  runsRequest?.abort();
  runsRequest = null;
  $("runs-list").removeAttribute("aria-busy");
  $("runs-list").replaceChildren();
  feedback("runs-feedback", "");
}
const runKinds = { answer: "Answer", background: "Background answer", coding: "Coding task", scheduled: "Scheduled task" };
const runStatuses = { queued: "Queued", running: "Working", completed: "Completed", incomplete: "Incomplete",
  failed: "Failed", cancelled: "Stopped", skipped: "Skipped", stopping: "Stopping", uncertain: "Outcome unconfirmed" };
const checkpointLabels = {
  queued: "Queued", started: "Started responding", preparing: "Preparing the answer", dispatching: "Starting the response", draft_saved: "Saved a partial answer",
  saved: "Saved the response", requeued: "Recovered before dispatch", resume_queued: "Queued a new attempt",
  reconciled: "Recovered the recorded outcome", interrupted: "Worker interrupted", stop_requested: "Stop requested",
  completed: "Completed", cancelled: "Stopped", stopped: "Stopped", researching: "Researching and verifying", synthesizing: "Combining the findings",
};
const subtaskLabels = { research: "Research", verification: "Verification" };
const runPrefixes = { answer: "a", background: "b", coding: "c", scheduled: "s" };
const runFromReference = reference => {
  const match = /^([abcs])_([A-Za-z0-9_-]{1,80})$/.exec(reference || "");
  return match && (match[1] === "a" || match[2].length <= 38) ? { id: match[2], kind: { a: "answer", b: "background", c: "coding", s: "scheduled" }[match[1]] } : null;
};
const runStatus = run => run.kind === "coding" ? codingStatus(run) : runStatuses[run.status] || "Status unavailable";
const runPath = run => "runs/" + run.kind + "/" + encodeURIComponent(run.id);

async function openRunResult(run, trigger) {
  if (sheets.top()?.el.id === "run-timeline-dialog") sheets.top().now();
  if (sheets.top()?.el.id === "runs-dialog") sheets.top().now();
  if (run.kind === "scheduled") {
    await showPanel("schedules", trigger);
    const task = state.tasks.find(task => task.id === run.scheduleId);
    if (task && sheets.top()?.el.id === "schedules-dialog") await showRuns(task);
  } else if (run.kind === "coding" && run.reviewReady && !codingActive(run)) {
    if (fw) fw.nav.go(fw.nav.href("tasks", run.id));
    else await reviewCodingRun(run.id);
  } else if (run.kind === "background" || run.kind === "answer" && run.messageId) {
    await selectConversation(run.conversationId);
    if (state.activeId === run.conversationId) {
      const message = $("messages").querySelector('[data-message-id="' + CSS.escape(run.messageId) + '"]');
      message?.scrollIntoView({ block: "nearest" });
    }
  } else if (fw) {
    fw.nav.go(fw.nav.href("conversations", run.conversationId));
  } else {
    await selectConversation(run.conversationId);
  }
}
function openRecentRun(run, trigger) {
  if (state.health?.runs?.ready) return openRunTimeline(run, trigger);
  return openRunResult(run, trigger);
}
async function loadRecentRuns() {
  runsRequest?.abort();
  const request = new AbortController(), list = $("runs-list");
  runsRequest = request;
  list.setAttribute("aria-busy", "true");
  feedback("runs-feedback", "Loading runs…");
  try {
    const data = await api("runs", "GET", undefined, { signal: request.signal, timeout: 20000 });
    if (runsRequest !== request) return;
    const rows = data.items.map(run => {
      const kind = runKinds[run.kind];
      const status = node("span", "message-status", runStatus(run));
      status.dataset.status = run.status;
      const open = button("", event => openRecentRun(run, event.currentTarget), "record-open run-open ifl-row atlas-disclosure");
      const label = node("span", "ifl-tx");
      const meta = node("small", "record-meta");
      meta.append(node("span", "", kind), recordTime(run.updatedAt));
      label.append(node("b", "", run.title || kind), meta);
      open.append(label, status);
      return open;
    });
    list.replaceChildren(...(rows.length ? rows : [emptyState("No runs yet")]));
    feedback("runs-feedback", "");
  } catch (error) {
    if (runsRequest === request && !error.accountChanged) feedback("runs-feedback", errorText(error), true);
  } finally {
    if (runsRequest === request) {
      runsRequest = null;
      list.removeAttribute("aria-busy");
    }
  }
}
function pauseRunTimeline() {
  if (!runTimeline) return;
  clearTimeout(runTimeline.timer);
  runTimeline.request?.abort();
  runTimeline.request = null;
}
function clearRunTimeline() {
  pauseRunTimeline();
  runTimeline = null;
  runDraft?.sheet.now();
  for (const id of ["run-heading", "run-state", "run-checkpoint", "run-events", "run-updated", "run-subtask-list"]) $(id).replaceChildren();
  $("run-subtasks").hidden = true;
  for (const id of ["run-open-result", "run-prepare-draft", "run-resume", "run-stop", "run-more", "run-copy-link"]) $(id).hidden = true;
  feedback("run-feedback", "");
}
function openRunTimeline(run, trigger, { page = false } = {}) {
  const reference = runPrefixes[run.kind] + "_" + run.id;
  const link = runFromReference(reference) ? reference : null;
  if (fw && !page) {
    if (link) fw.nav.go(fw.nav.href("tasks", link));
    else return openRunResult(run, trigger);
    return;
  }
  if (runTimeline?.sheet) runTimeline.sheet.now();
  else if (runTimeline) clearRunTimeline();
  if (page) enterDestination("run-timeline");
  const sheet = page ? null : openDialog("run-timeline", trigger, { onClose: clearRunTimeline });
  runTimeline = { sheet, ref: run, run: null, after: 0, request: null, timer: null, retry: 0 };
  $("run-heading").textContent = run.title || runKinds[run.kind];
  $("run-state").textContent = "Loading timeline…";
  runTimeline.reference = link;
  $("run-copy-link").hidden = !runTimeline.reference;
  void loadRunTimeline();
}
function renderRunTimeline(run, events, hasMore) {
  $("run-heading").textContent = run.title || runKinds[run.kind];
  const status = [run.plan === "parallel_research" ? "Parallel research" : runKinds[run.kind], run.stopRequested ? "Stopping" : runStatus(run), run.revision > 1 && "Revision " + run.revision].filter(Boolean).join(" · ");
  if ($("run-state").textContent !== status) $("run-state").textContent = status;
  if (run.updatedAt !== runTimeline.updatedAt) {
    runTimeline.updatedAt = run.updatedAt;
    $("run-updated").replaceChildren(recordTime(run.updatedAt));
  }
  const checkpoint = run.status === "queued" && run.kind === "background" ? "Atlas will start this run in the background."
    : run.status === "uncertain" && run.kind === "background" ? "Atlas could not confirm the outcome of the previous attempt."
    : run.status === "failed" && run.errorCode ? run.errorCode.replaceAll("_", " ") : run.kind === "coding" ? String(run.stage || "").replaceAll("_", " ") : run.plan ? checkpointLabels[run.checkpoint] || "" : "";
  $("run-checkpoint").textContent = [checkpoint, run.kind === "background" && run.status !== "completed" && run.hasDraft ? "A partial answer is saved." : ""].filter(Boolean).join(" ");
  $("run-open-result").hidden = !run.conversationId && !run.scheduleId;
  $("run-open-result").textContent = run.kind === "scheduled" ? "Open scheduled work" : run.kind === "coding" && run.reviewReady && !codingActive(run) ? "Review changes" : "Open conversation";
  $("run-prepare-draft").hidden = !run.draftAvailable || !fw?.workspace?.handoffs;
  $("run-resume").hidden = !run.canResume; $("run-resume").textContent = run.hasDraft ? "Resume from checkpoint" : "Retry run";
  $("run-stop").hidden = !run.canStop;
  $("run-more").hidden = !hasMore;
  renderRunSubtasks(run.subtasks);
  for (const event of events) {
    const item = node("li", "ifl-tx");
    const title = event.checkpoint === "subtask" ? subtaskLabels[event.stage] + " · " + (runStatuses[event.status] || "Updated")
      : event.checkpoint === "stop_requested" ? checkpointLabels.stop_requested
      : run.kind === "coding" ? event.stage?.replaceAll("_", " ") || runStatuses[event.status] : checkpointLabels[event.checkpoint] || runStatuses[event.status];
    const meta = node("small", "record-meta");
    meta.append(recordTime(event.at));
    if (event.revision > 1) meta.append(node("span", "", "Attempt " + event.revision));
    item.append(node("b", "", title || "Run updated"), meta);
    $("run-events").append(item);
  }
}
function renderRunSubtasks(subtasks) {
  if (!Array.isArray(subtasks)) return;
  $("run-subtasks").hidden = !subtasks.length;
  const list = $("run-subtask-list"), signature = JSON.stringify(subtasks);
  if (runTimeline.subtaskSignature === signature) return;
  runTimeline.subtaskSignature = signature;
  const expanded = new Set([...list.querySelectorAll("details[open]")].map(row => row.dataset.step));
  list.replaceChildren(...subtasks.map(step => {
    const title = [subtaskLabels[step.step], runStatuses[step.status]].filter(Boolean).join(" · ");
    if (!step.answer) {
      const row = node("div", "run-subtask");
      row.append(node("b", "", title));
      if (step.errorCode) row.append(node("p", "field-help", step.errorCode.replaceAll("_", " ")));
      return row;
    }
    const row = node("details", "run-subtask"), answer = node("div", "message-content");
    row.dataset.step = step.step;
    row.open = expanded.has(step.step);
    renderAnswer(answer, step.answer, step.sources);
    row.append(node("summary", "", title), answer, sourceList(step.sources));
    return row;
  }));
}
async function loadRunTimeline() {
  const timeline = runTimeline;
  if (!timeline || timeline.request || !visible()) return;
  clearTimeout(timeline.timer);
  const request = new AbortController();
  timeline.request = request;
  let follow = false;
  try {
    const result = await api(runPath(timeline.ref) + "?after=" + timeline.after, "GET", undefined, { signal: request.signal, timeout: 15000 });
    if (runTimeline !== timeline || timeline.request !== request) return;
    timeline.run = result.run;
    renderRunTimeline(result.run, result.events.filter(event => event.seq > timeline.after), result.hasMore);
    timeline.after = result.nextAfter;
    timeline.retry = 0;
    if (result.run.status !== "failed") feedback("run-feedback", timeline.after ? "" : "No timeline events have been saved for this run.");
    else feedback("run-feedback", "This run could not finish.", true);
    follow = result.run.active && !result.hasMore;
  } catch (error) {
    if (runTimeline !== timeline || timeline.request !== request || error.accountChanged) return;
    feedback("run-feedback", errorText(error), true);
    if (!timeline.run) $("run-state").textContent = "Timeline unavailable";
    if (error.status === 404) for (const id of ["run-open-result", "run-prepare-draft", "run-resume", "run-stop"]) $(id).hidden = true;
    timeline.retry++;
    follow = !error.status || error.status >= 500;
  } finally {
    if (runTimeline === timeline && timeline.request === request) {
      timeline.request = null;
      if (follow && visible()) timeline.timer = setTimeout(loadRunTimeline, timeline.retry ? Math.min(30000, 5000 * (timeline.retry + 1)) : 5000);
    }
  }
}
async function changeRun(event, action) {
  const timeline = runTimeline, run = timeline?.run;
  if (!run) return;
  await busy(event.currentTarget, async () => {
    if (action === "resume" && !await confirmAction(fw, "Start a new attempt using your Atlas allowance? The previous result will remain available.")) return;
    if (runTimeline !== timeline) return;
    try { await api(runPath(run) + "/" + action, "POST", { revision: run.revision, ...(action === "resume" ? { confirm: true } : {}) }); }
    finally {
      if (runTimeline === timeline) {
        pauseRunTimeline();
        await loadRunTimeline();
      }
    }
  }, "run-feedback");
}
function clearRunDraft() {
  runDraft?.controller.abort();
  runDraft = null;
  for (const id of ["run-draft-heading", "run-draft-note", "run-draft-preview"]) $(id).replaceChildren();
  $("run-draft-reading").hidden = true;
  $("run-draft-open").disabled = true;
  $("run-draft-target").value = "notes";
  feedback("run-draft-feedback", "");
}

function renderRunDraft() {
  if (!runDraft?.format) return;
  const target = $("run-draft-target").value;
  const preview = runDraft.format(runDraft.result, target);
  $("run-draft-reading").hidden = !preview;
  $("run-draft-open").disabled = !preview;
  if (!preview) return feedback("run-draft-feedback", "A draft could not be prepared for this app.", true);
  $("run-draft-heading").textContent = preview.title;
  $("run-draft-preview").textContent = preview.preview;
  $("run-draft-note").textContent = [preview.kind === "mail-reply" && "This opens a reply to the original message.", preview.excerpt && "This draft contains an excerpt of the run result."].filter(Boolean).join(" ");
  $("run-draft-open").textContent = preview.kind === "mail-reply" ? "Open reply in Mail" : ({ notes: "Open Notes draft", calendar: "Open Calendar draft", mail: "Open Mail draft" })[target];
  feedback("run-draft-feedback", "");
}

async function previewRunDraft(trigger) {
  const run = runTimeline?.run;
  if (!run?.draftAvailable || !fw?.workspace?.handoffs || runDraft) return;
  const sheet = openDialog("run-draft", trigger, { onClose: clearRunDraft });
  if (sheet.closed) return;
  const pending = { sheet, controller: new AbortController(), path: runPath(run) + "/draft?revision=" + run.revision };
  runDraft = pending;
  feedback("run-draft-feedback", "Loading saved result…");
  try {
    const [{ draft }, { runDraftForApp }] = await Promise.all([
      api(pending.path, "GET", undefined, { signal: pending.controller.signal }), import("../roof/handoffs.js"),
    ]);
    if (runDraft !== pending) return;
    pending.result = draft;
    pending.format = runDraftForApp;
    renderRunDraft();
  } catch (error) { if (runDraft === pending && !error.accountChanged) actionableError(error, "run-draft-feedback"); }
}

async function openPreparedDraft(control) {
  const pending = runDraft;
  const target = $("run-draft-target").value;
  const preview = pending?.format?.(pending.result, target);
  if (!preview) return;
  await busy(control, async () => {
    const { draft } = await api(pending.path, "GET", undefined, { signal: pending.controller.signal });
    if (runDraft !== pending || $("run-draft-target").value !== target) return;
    if (JSON.stringify(draft) !== JSON.stringify(pending.result)) {
      pending.result = draft;
      renderRunDraft();
      return feedback("run-draft-feedback", "The saved result changed. Review this updated draft.");
    }
    const opened = await fw.workspace.handoffs.send(preview.app, preview.kind, preview.payload);
    if (runDraft !== pending) return;
    if (opened === false || opened?.ok === false) return feedback("run-draft-feedback", "The destination app could not open. Try again from this preview.", true);
    pending.sheet.now();
  }, "run-draft-feedback");
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
  briefListRequest?.abort();
  const request = new AbortController(), list = $("briefs-list");
  briefListRequest = request;
  list.setAttribute("aria-busy", "true");
  if (!list.children.length) list.append(emptyState("Loading briefs…"));
  try {
    const data = await api("briefs", "GET", undefined, { signal: request.signal, timeout: 20000 });
    if (briefListRequest !== request) return;
    state.briefs = data.briefs || []; fw?.workspace?.changed();
    const rows = state.briefs.map(brief => {
      const open = button("", () => {
        if (destination?.name === "briefs") fw.nav.go(fw.nav.href("briefs", brief.id));
        else showBrief(brief.id);
      }, "record-open ifl-row atlas-disclosure");
      const text = node("span", "ifl-tx");
      text.append(node("b", "", brief.title || "Research brief"), recordTime(brief.created_at));
      open.append(text);
      return open;
    });
    const openConversations = destination?.name === "briefs" ? button("Open conversations", () => fw.nav.section("conversations"), "quiet-button") : null;
    list.replaceChildren(...(rows.length ? rows : [emptyState("No saved briefs yet", "Choose Save as brief on an answer to keep it with its sources.", openConversations)]));
  } catch (error) {
    if (briefListRequest === request && !error.accountChanged) list.replaceChildren(
      emptyState("Briefs are unavailable", errorText(error), button("Try again", loadBriefs, "quiet-button")));
  } finally {
    if (briefListRequest === request) { briefListRequest = null; list.removeAttribute("aria-busy"); }
  }
}
function showBriefList() {
  briefRequest?.abort(); briefRequest = null;
  const wasDetail = $("briefs-list").hidden;
  $("briefs-list").hidden = false;
  $("brief-detail").hidden = true; $("brief-detail").replaceChildren();
  if (wasDetail && destination?.name === "briefs") {
    $("atlas-destination-scroll").scrollTop = destination.listScroll || 0;
    $("atlas-destination-title").focus({ preventScroll: true });
  }
}
async function showBrief(id) {
  briefRequest?.abort();
  const request = new AbortController(), detail = $("brief-detail"), page = destination?.name === "briefs" ? destination : null;
  briefRequest = request;
  if (page && !$("briefs-list").hidden) page.listScroll = $("atlas-destination-scroll").scrollTop;
  detail.hidden = false; $("briefs-list").hidden = !!page;
  const back = page ? button("All briefs", () => fw.nav.section("briefs"), "quiet-button brief-back") : null;
  detail.replaceChildren(...[back, emptyState("Loading brief…")].filter(Boolean));
  const path = "briefs/" + encodeURIComponent(id);
  try {
    const { brief } = await api(path, "GET", undefined, { signal: request.signal, timeout: 20000 });
    if (briefRequest !== request) return;
    const card = node("article", "brief-card ifl-card"), title = node("h2", "", brief.title || "Research brief");
    const content = node("div", "brief-content message-content");
    renderAnswer(content, brief.answer, brief.sources);
    const actions = node("div", "button-row");
    actions.append(button("Export brief", e => busy(e.currentTarget, () => download(path + "/export", titleFilename(brief.title))), "quiet-button"),
      button("Delete brief", e => busy(e.currentTarget, async () => {
        if (!await confirmAction(fw, "Delete this saved brief?")) return;
        await api(path, "DELETE");
        showBriefList(); await loadBriefs();
        if (page && destination?.name === "briefs") fw.nav.section("briefs");
      }), "danger-text"));
    card.append(title, recordTime(brief.created_at), content, sourceList(brief.sources), actions);
    detail.replaceChildren(...[back, card].filter(Boolean));
    if (page) { title.tabIndex = -1; title.focus({ preventScroll: true }); $("atlas-destination-scroll").scrollTop = 0; }
    else detail.scrollIntoView({ block: "start" });
  } catch (error) {
    if (briefRequest === request && !error.accountChanged) detail.replaceChildren(...[back,
      emptyState("Brief unavailable", errorText(error), button("Try again", () => showBrief(id), "quiet-button"))].filter(Boolean));
  }
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
  if (reset) {
    state.codingReview = null;
    $("patches-title").textContent = "Draft changes"; $("close-patches").setAttribute("aria-label", "Close draft changes");
    $("patches-list").hidden = false; $("patch-detail").hidden = true; $("review-toolbar").hidden = true; feedback("patch-feedback", "");
  }
  const data = await api("patches"), list = $("patches-list"); list.replaceChildren();
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
    const summary = node("div", "message-content brief-content"); renderAnswer(summary, patch.summary || ""); detail.append(summary);
    for (const file of patchFiles(patch)) { const section = node("details", "patch-file"); section.append(node("summary", "", file.path), node("pre", "", file.diff || "Before\n" + (file.before || "") + "\n\nAfter\n" + (file.after || file.content || ""))); detail.append(section); }
    const plan = node("div", "message-content brief-content"); const testPlan = patch.testPlan || patch.test_plan || ""; renderAnswer(plan, "### Validation plan\n" + (Array.isArray(testPlan) ? testPlan.map(x => "- " + x).join("\n") : testPlan)); detail.append(plan);
    if (patch.url && safeUrl(patch.url)) { const a = node("a", "", "Open draft pull request ↗"); a.href = safeUrl(patch.url); a.target = "_blank"; a.rel = "noopener noreferrer"; detail.append(a); }
    else { detail.append(node("p", "field-help", "Review every file above. Publishing creates a new branch and a draft pull request for this exact change.")); const publish = button("Create draft pull request", e => busy(e.currentTarget, async () => { if (!await confirmAction(fw, "Publish these reviewed changes to a new branch and create a draft pull request in " + patch.repository + "?")) return; const result = await api("patches/" + encodeURIComponent(patch.id) + "/publish", "POST", { confirm: true }); await showPatch(patch.id, { ...patch, ...result, status: "published" }); await loadPatches(); feedback("patch-feedback", "Draft pull request created."); }), "primary-button"); publish.disabled = !state.health?.github?.connected || !["draft", "ready"].includes(patch.status || "draft"); detail.append(publish); if (!state.health?.github?.connected) detail.append(node("p", "field-help", "Connect GitHub in Settings to publish.")); }
    detail.scrollIntoView({ block: "start", behavior: "smooth" });
  } catch (error) { feedback("patch-feedback", errorText(error), true); }
}
function codingActive(run) { return ["preparing", "running", "waiting", "uncertain", "publishing"].includes(run.status); }
function codingStatus(run) { if (run.reviewReady && run.status !== "published" && !codingActive(run)) return "Ready to review"; return ({ preparing: "Preparing workspace", running: "Working", waiting: "Waiting", completed: "Completed", failed: "Failed", cancelled: "Stopped", uncertain: "Checking task state", publishing: "Creating pull request", published: "Published" })[run.status] || "Checking task state"; }
function closeCodingInbox(inbox) {
  if (!inbox || codingInbox !== inbox) return;
  inbox.controller?.abort();
  clearTimeout(inbox.timer);
  codingInbox = null;
  $("inbox-list").replaceChildren();
  $("inbox-list").removeAttribute("aria-busy");
  $("refresh-inbox").removeAttribute("aria-busy");
}
function openCodingInbox(trigger, page) {
  if (codingInbox) return;
  const inbox = { next: null, controller: null, filter: null, page, restoreScroll: page ? inboxScroll : 0 };
  inboxScroll = 0;
  codingInbox = inbox;
  if (!page) inbox.sheet = openDialog("inbox", trigger, { onClose: () => closeCodingInbox(inbox) });
  loadCodingInbox();
}
async function openTaskConversation(run) {
  codingInbox?.sheet?.now();
  state.taskExpanded.set(run.id, true);
  await selectConversation(run.conversationId);
  if (state.activeId === run.conversationId) {
    const card = [...$("messages").querySelectorAll("[data-run-id]")].find(el => el.dataset.runId === run.id);
    card?.scrollIntoView({ block: "nearest" });
    card?.querySelector("summary")?.focus({ preventScroll: true });
  }
}
function inboxTask(run) {
  const card = node("article", "record-card inbox-task"), heading = node("div", "inbox-task-heading");
  const status = node("span", "message-status", run.kind ? runStatus(run) : codingStatus(run));
  if (run.kind === "coding" && run.status === "waiting") status.textContent = "Needs attention";
  status.dataset.status = run.status;
  heading.append(node("h3", "", run.title || runKinds[run.kind] || "Coding task"), status);
  const meta = node("div", "record-meta");
  meta.append(node("p", "muted", [runKinds[run.kind], run.repository, run.baseBranch].filter(Boolean).join(" · ")), recordTime(run.updatedAt));
  card.append(heading, meta);
  const actions = node("div", "button-row");
  if (run.reviewReady && (!codingActive(run) || run.status === "publishing")) {
    actions.append(button("Review changes", event => reviewCodingRun(run.id, { inboxTrigger: event.currentTarget }), "primary-button"));
  }
  const open = button(run.kind ? "Timeline" : "Open conversation", event => run.kind ? openRecentRun(run, event.currentTarget) : openTaskConversation(run), "text-button inbox-open-conversation");
  actions.append(open);
  card.append(actions);
  return card;
}
async function loadCodingInbox({ more = false } = {}) {
  const inbox = codingInbox;
  if (!inbox || more && (!inbox.next || inbox.controller)) return;
  inbox.controller?.abort();
  clearTimeout(inbox.timer);
  const controller = new AbortController(), list = $("inbox-list"), loadMore = $("more-inbox");
  inbox.controller = controller;
  const current = () => codingInbox === inbox && inbox.controller === controller;
  const filter = $("inbox-filter").value, keepRows = filter === inbox.filter && !!list.querySelector(".inbox-task");
  const params = new URLSearchParams({ filter });
  for (const control of all("[data-inbox-filter]")) control.setAttribute("aria-pressed", String(control.dataset.inboxFilter === filter));
  if (more) params.set("before", inbox.next);
  else if (!keepRows) { inbox.next = null; list.replaceChildren(); loadMore.hidden = true; }
  list.setAttribute("aria-busy", "true");
  $("refresh-inbox").setAttribute("aria-busy", "true");
  loadMore.disabled = true;
  feedback("inbox-feedback", keepRows ? "" : "Loading tasks…");
  try {
    const data = await api((inbox.page ? "runs?" : "coding/inbox?") + params, "GET", undefined, { signal: controller.signal, timeout: 30000 });
    if (!current()) return;
    const runs = inbox.page ? data.items : data.runs;
    const signature = JSON.stringify([filter, runs]);
    if (more || !keepRows || inbox.signature !== signature || inbox.extended) {
      const cards = runs.map(inboxTask);
      if (more) list.append(...cards); else list.replaceChildren(...cards);
      if (more) cards[0]?.querySelector("button")?.focus();
    }
    inbox.signature = signature;
    inbox.extended = more;
    inbox.next = data.next; inbox.filter = filter;
    if (!list.children.length) {
      const start = filter === "all" && inbox.page ? button("New conversation", () => newConversation(), "quiet-button") : null;
      list.append(emptyState(filter === "all" ? inbox.page ? "No tasks yet" : "No coding tasks yet" : "No tasks match this status", filter === "all" && !inbox.page ? "Start a task from a Developer conversation." : "", start));
    }
    feedback("inbox-feedback", "");
    if (inbox.restoreScroll) { $("atlas-destination-scroll").scrollTop = inbox.restoreScroll; inbox.restoreScroll = 0; }
  } catch (error) {
    if (current() && !error.accountChanged) feedback("inbox-feedback", errorText(error), true);
  } finally {
    if (current()) {
      inbox.controller = null;
      list.removeAttribute("aria-busy");
      $("refresh-inbox").removeAttribute("aria-busy");
      loadMore.hidden = !inbox.next;
      loadMore.disabled = false;
      if (inbox.page && !inbox.extended && visible()) inbox.timer = setTimeout(() => { if (visible()) void loadCodingInbox(); }, 15000);
    }
  }
}
function detachCodingObserver() {
  const observer = state.codingObserver; state.codingObserver = null; state.codingLoading = false;
  if (observer) { clearTimeout(observer.timer); observer.controller.abort(); }
}
function codingViewCurrent(observer) { return state.codingObserver === observer && observer.epoch === state.epoch && observer.navigation === state.navigation && observer.conversationId === state.activeId && visible(); }
function invalidateCodingReview(run) {
  const review = state.codingReview;
  if (!review?.run || review.id !== run.id || review.run.revision === run.revision && run.reviewReady) return;
  review.stale = true;
  const publish = $("publish-coding"); if (publish) publish.disabled = true;
  feedback("patch-feedback", "This task has changed. Refresh the review before publishing.");
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
  if (destination || !state.activeId || state.conversation?.mode !== "developer" || !state.privateReady || state.health?.coding?.storageReady !== true || !visible()) return;
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
  const succeeded = checks.filter(check => check.exitCode === 0).length, failed = checks.filter(check => Number.isInteger(check.exitCode) && check.exitCode !== 0).length;
  section.append(node("p", "checks-totals", succeeded + " succeeded" + (failed ? " · " + failed + " failed" : "") + (checks.length - succeeded - failed ? " · " + (checks.length - succeeded - failed) + " pending or unreported" : "")));
  for (const [index, check] of checks.entries()) {
    const details = node("details", "coding-check"), summary = node("summary"), exit = Number.isInteger(check.exitCode) ? " · exit " + check.exitCode : " · no exit code reported";
    details.dataset.disclosure = prefix + ":command:" + index; details.open = opened.has(details.dataset.disclosure);
    summary.append(node("code", "", check.command || "Command"), node("span", "check-result", (check.outcome || check.status || "unknown") + exit)); details.append(summary); details.dataset.outcome = check.exitCode === 0 ? "success" : Number.isInteger(check.exitCode) ? "failed" : "unknown";
    if (check.command) details.append(node("code", "command-full", check.command));
    details.append(node("pre", "", check.output || "No output was recorded."));
    if (check.outputTruncated || check.truncated) details.append(node("p", "field-help", "This command or its output was truncated in the activity record.")); section.append(details);
  }
  return section;
}
function pullRequestLink(pullRequest) {
  const href = safeUrl(pullRequest?.url); if (!href) return null;
  const link = node("a", "", "Open draft pull request"); link.href = href; link.target = "_blank"; link.rel = "noopener noreferrer"; return link;
}
function prepareTaskRecovery(run, continuing, restoreRevision = null) {
  state.intent = "code"; state.codingContinuation = continuing ? run.id : null; state.codingRestart = continuing ? null : { id: run.id, restoreRevision };
  if (!continuing) $("prompt").value = run.prompt || "";
  fillEnvironmentChoices();
  resizePrompt(); updateComposer(); $("prompt").focus();
  toast(continuing ? "Add the next instruction to continue this workspace." : restoreRevision ? "Review the instruction before restoring your saved changes." : "Review the task, then start again in a fresh workspace.");
}
function taskRecoveryText(run) {
  if (run.recovery?.reason) return run.recovery.reason;
  if (run.status === "cancelled") return run.canContinue ? "This task was stopped. Its cloud workspace is available to continue." : "This task was stopped. Start again to use a fresh cloud workspace.";
  if (run.status === "failed") return run.canContinue ? "The task needs attention. You can continue in the same workspace with another instruction." : "The task could not finish. Review the error, then start again in a fresh workspace.";
  if (run.status === "completed" && !run.summary) return run.reviewReady ? "Changes are ready for your review." : "This task finished without saved file changes.";
  return "";
}
async function loadTaskChanges(run, panel) {
  if (panel.dataset.loaded || !run.reviewReady) return;
  const epoch = state.epoch, generation = state.navigation, key = run.id + ":" + run.revision;
  panel.dataset.loaded = "loading"; panel.replaceChildren(node("p", "field-help", "Loading changed files…"));
  try {
    let data = state.taskChanges.get(key);
    if (!data) {
      data = await api("coding/runs/" + encodeURIComponent(run.id) + "/changes");
      checkEpoch(epoch);
      if (generation !== state.navigation) return;
      if (data.run.revision === run.revision) state.taskChanges.set(key, data);
    }
    if (!panel.isConnected || epoch !== state.epoch || generation !== state.navigation) return;
    const current = state.codingRuns.find(item => item.id === run.id);
    if (!current || current.revision !== run.revision || data.run.revision !== run.revision || !data.run.reviewReady || !current.reviewReady) { panel.dataset.loaded = ""; panel.replaceChildren(node("p", "field-help", "The task changed. Reopen its changes after it finishes.")); return; }
    panel.replaceChildren(); const files = data.files || [];
    panel.append(node("p", "field-help", files.length + " changed file" + (files.length === 1 ? "" : "s")));
    for (const file of files) {
      const details = node("details", "patch-file task-file"), summary = node("summary"), output = node("pre", "", "Open to load the diff.");
      summary.append(node("span", "file-operation", file.operation || "modify"), node("span", "file-path", file.path)); details.append(summary, output);
      let loaded = false, loading = false;
      details.addEventListener("toggle", async () => {
        if (!details.open || loaded || loading) return; loading = true; output.textContent = "Loading diff…";
        try {
          const diff = await api(codingDiffPath(run, file)); checkEpoch(epoch);
          if (!details.isConnected || generation !== state.navigation) return;
          output.textContent = (diff.binary ? "Binary file. A text diff is unavailable." : diff.diff || "No text diff was recorded.") + (diff.diffTruncated ? "\n\nDiff preview truncated. The full file is retained for publication." : ""); loaded = true;
        } catch (error) { if (!error.accountChanged && details.isConnected) output.textContent = errorText(error); } finally { loading = false; }
      }); panel.append(details);
    }
    if (!files.length) panel.append(node("p", "field-help", "No file changes were saved for this revision."));
    panel.append(button("Review changes", event => busy(event.currentTarget, () => reviewCodingRun(run.id)), "quiet-button")); panel.dataset.loaded = "true";
  } catch (error) { if (!error.accountChanged && panel.isConnected && epoch === state.epoch) { panel.dataset.loaded = ""; panel.replaceChildren(node("p", "message-error", errorText(error)), button("Retry loading changes", () => loadTaskChanges(run, panel), "text-button")); } }
}
function renderCodingRuns() {
  const container = $("messages"), previous = $("coding-runs"), scrollTop = container.scrollTop;
  const nearBottom = isAtLatest(container, 24);
  if (!state.codingRuns.length && !state.codingLoadError) { previous?.remove(); if (!state.messages.length && !container.querySelector(".welcome, .empty-conversation")) renderMessages(); else updateLatestControl(); return; }
  const flags = [state.health?.coding?.ready, state.health?.coding?.backgroundAvailable, state.conversation?.archived];
  const signature = JSON.stringify([state.codingRuns, state.codingLoadError, flags]);
  if (codingSnapshots.get(previous) === signature) return;
  const previousCards = new Map([...previous?.children || []].filter(el => el.dataset.runId).map(el => [el.dataset.runId, el]));
  const opened = new Set([...previous?.querySelectorAll("details[open]") || []].map(el => el.dataset.disclosure).filter(Boolean));
  const focused = previous?.contains(document.activeElement) ? { id: document.activeElement.id, runId: document.activeElement.closest("[data-run-id]")?.dataset.runId, role: document.activeElement.getAttribute("role"), text: document.activeElement.textContent } : null;
  const list = node("section", "coding-runs"); list.id = "coding-runs"; list.setAttribute("aria-label", "Coding tasks"); codingSnapshots.set(list, signature);
  if (state.codingLoadError) { const notice = node("div", "notice-inline coding-reconnect"); notice.append(node("p", "", state.codingLoadError), button("Reconnect", () => observeCodingRuns())); list.append(notice); }
  const runs = [...state.codingRuns].sort((a, b) => Number(a.createdAt) - Number(b.createdAt) || String(a.id).localeCompare(String(b.id)));
  for (const run of runs) {
    const snapshot = JSON.stringify([run, flags]), old = previousCards.get(run.id);
    if (codingSnapshots.get(old) === snapshot) { list.append(old); continue; }
    const card = node("details", "coding-run"), heading = node("div", "coding-run-heading"); card.dataset.runId = run.id; card.dataset.disclosure = run.id + ":task"; card.open = state.taskExpanded.has(run.id) ? state.taskExpanded.get(run.id) : run === runs[runs.length - 1]; card.addEventListener("toggle", () => { if (card.isConnected) state.taskExpanded.set(run.id, card.open); });
    codingSnapshots.set(card, snapshot);
    const status = node("span", "message-status", codingStatus(run)); status.dataset.status = run.status; status.setAttribute("role", "status"); heading.append(node("h3", "", run.prompt?.split("\n")[0].slice(0, 140) || "Coding task"), status);
    const cloudState = run.cloud?.label || ({ preparing: "Preparing cloud workspace", running: "Cloud workspace running", waiting: "Cloud workspace waiting", completed: run.canContinue ? "Cloud workspace available" : "Cloud task completed", cancelled: run.canContinue ? "Cloud workspace available" : "Cloud task stopped", failed: "Cloud task needs attention", published: "Changes published" })[run.status] || "Cloud workspace";
    const metadata = node("div", "task-metadata"); metadata.append(node("span", "task-repository", run.repository), node("span", "task-branch", run.baseBranch || run.environment?.branch || "Default branch"));
    const taskHeading = node("summary", "task-switch"); taskHeading.append(heading, metadata); card.append(taskHeading);
    if (run.error?.message) card.append(node("p", "message-error", run.error.message));
    const tabs = node("div", "task-tabs"), panels = node("div", "task-panels"); tabs.setAttribute("role", "tablist"); tabs.setAttribute("aria-label", "Task details");
    const parts = new Map(), controls = new Map(); const chosen = state.taskTabs.get(run.id) || "overview";
    for (const [name, label] of [["overview", "Overview"], ["activity", "Activity"], ["changes", "Changes"], ["checks", "Checks"]]) {
      const panel = node("section", "task-panel"), control = button(label, () => selectTaskTab(name));
      panel.id = "task-" + run.id + "-" + name; panel.setAttribute("role", "tabpanel"); panel.setAttribute("aria-labelledby", panel.id + "-tab"); panel.hidden = chosen !== name;
      control.id = panel.id + "-tab"; control.setAttribute("role", "tab"); control.setAttribute("aria-controls", panel.id); control.setAttribute("aria-selected", String(chosen === name)); control.tabIndex = chosen === name ? 0 : -1;
      control.addEventListener("keydown", event => { const names = [...parts.keys()]; let next = names.indexOf(name); if (event.key === "ArrowRight") next = (next + 1) % names.length; else if (event.key === "ArrowLeft") next = (next + names.length - 1) % names.length; else if (event.key === "Home") next = 0; else if (event.key === "End") next = names.length - 1; else return; event.preventDefault(); selectTaskTab(names[next]); controls.get(names[next]).focus(); });
      parts.set(name, panel); controls.set(name, control); tabs.append(control); panels.append(panel);
    }
    function selectTaskTab(name) { state.taskTabs.set(run.id, name); for (const [key, panel] of parts) { panel.hidden = key !== name; const control = controls.get(key); control.setAttribute("aria-selected", String(key === name)); control.tabIndex = key === name ? 0 : -1; } if (name === "changes") loadTaskChanges(run, parts.get(name)); }
    const overview = parts.get("overview");
    overview.append(node("p", "task-cloud-state", cloudState + (run.environment?.name ? " · " + run.environment.name : "")));
    if (run.stage && codingActive(run)) { const progress = node("div", "task-progress"); progress.append(node("span", "task-progress-indicator"), node("p", "coding-stage", String(run.stage).replaceAll("_", " "))); overview.append(progress); }
    if (run.summary) { const summary = node("div", "message-content"); renderAnswer(summary, run.summary); overview.append(summary); }
    const recovery = taskRecoveryText(run); if (recovery) overview.append(node("p", "task-recovery", recovery));
    const changes = run.changes || {}; if (run.reviewReady) overview.append(node("p", "coding-change-count", (changes.added || 0) + " added · " + (changes.modified || 0) + " modified · " + (changes.deleted || 0) + " deleted"));
    if (codingActive(run) && run.activity?.length) { const latest = run.activity[run.activity.length - 1]; overview.append(node("p", "task-latest", [latest.label, latest.detail || latest.text].filter(Boolean).join(": "))); }
    const details = node("details", "task-workspace-details"); details.dataset.disclosure = run.id + ":workspace"; details.open = opened.has(details.dataset.disclosure); details.append(node("summary", "", "Workspace details"), node("p", "field-help", "OpenAI-hosted Linux workspace · " + (run.environment?.machine || "medium") + " machine"), node("p", "field-help", run.environment?.name || "Default environment"));
    if (run.baseSha) details.append(node("p", "field-help", "Source commit " + run.baseSha));
    if (run.environment?.setupCommand) details.append(node("pre", "", "Setup: " + run.environment.setupCommand));
    if (run.environment?.testCommand) details.append(node("pre", "", "Verification: " + run.environment.testCommand));
    details.append(node("p", "field-help", "Workspace reuse lasts while the cloud session is available."));
    if (run.savedCheckpoint) details.append(node("p", "field-help", "Saved revision " + run.savedCheckpoint.revision + " · " + timestamp(run.savedCheckpoint.savedAt)));
    overview.append(details);
    if (run.prompt?.includes("\n") || run.prompt?.length > 140) { const instruction = node("details", "task-instructions"); instruction.append(node("summary", "", "Task instructions"), node("p", "coding-prompt", run.prompt)); overview.append(instruction); }
    const activity = parts.get("activity"), entries = node("ol", "task-activity-list");
    for (const entry of run.activity || []) { const item = node("li"); item.append(node("strong", "", entry.label || entry.type || "Activity")); if (entry.detail || entry.text) item.append(node("p", "", (entry.detail || entry.text) + (entry.truncated ? " (truncated)" : ""))); entries.append(item); }
    activity.append(entries); if (!entries.children.length) activity.append(node("p", "field-help", codingActive(run) ? "Activity will appear as Atlas prepares and works in the cloud workspace." : "No activity was reported for this task."));
    parts.get("checks").append(codingChecks(run.checks, { prefix: run.id, opened }));
    parts.get("changes").append(node("p", "field-help", codingActive(run) ? "File changes become available when Atlas finishes this task." : "This task has no saved file changes to review."));
    card.append(tabs, panels);
    const actions = node("div", "button-row coding-actions");
    if (run.reviewReady) actions.append(button("Review changes", e => busy(e.currentTarget, () => reviewCodingRun(run.id)), "primary-button"));
    if (run.canContinue && !state.conversation?.archived) actions.append(button("Continue task", () => prepareTaskRecovery(run, true), "quiet-button"));
    if ((run.recovery?.action === "restart" || ["failed", "cancelled"].includes(run.status)) && !codingActive(run) && !state.conversation?.archived) {
      if (run.savedCheckpoint) actions.append(button("Restore saved changes", () => prepareTaskRecovery(run, false, run.savedCheckpoint.revision), "quiet-button"));
      actions.append(button("Start again", () => prepareTaskRecovery(run, false), run.canContinue || run.savedCheckpoint ? "text-button" : "primary-button"));
    }
    if (run.status === "failed" && /access|permission|provider|credential/.test(run.error?.code || "")) actions.append(button("Connection settings", event => showPanel("settings", event.currentTarget), "text-button"));
    if (["preparing", "running", "waiting", "uncertain"].includes(run.status)) actions.append(button("Stop task", e => busy(e.currentTarget, async () => { detachCodingObserver(); try { const result = await api("coding/runs/" + encodeURIComponent(run.id) + "/cancel", "POST", {}); acceptCodingRun(result.run); } finally { await observeCodingRuns({ restore: false }); } }), "danger-text"));
    const link = pullRequestLink(run.pullRequest); if (link) actions.append(link); card.append(actions);
    if (codingActive(run)) card.append(node("p", "task-away-note field-help", state.health?.coding?.backgroundAvailable ? "Runs in the cloud. You can return to this task later." : run.status === "preparing" ? "Keep Atlas open while the workspace prepares. Leaving does not cancel this task." : "Running in the cloud. Leaving does not cancel this task; return here for results."));
    card.append(node("p", "task-updated", "Updated " + timestamp(run.updatedAt || run.createdAt))); list.append(card);
    if (chosen === "changes") queueMicrotask(() => loadTaskChanges(run, parts.get("changes")));
  }
  container.querySelector(".welcome, .empty-conversation")?.remove(); if (previous) previous.replaceWith(list); else container.append(list);
  if (nearBottom) jumpToLatest();
  else { container.scrollTop = scrollTop; updateLatestControl(); }
  if (focused) {
    const candidate = focused.id ? $(focused.id) : [...list.querySelectorAll("[data-run-id]")].find(item => item.dataset.runId === focused.runId)?.querySelectorAll("button, summary, a");
    const control = candidate instanceof Element ? candidate : [...candidate || []].find(item => item.textContent === focused.text && item.getAttribute("role") === focused.role);
    if (control && list.contains(control)) control.focus({ preventScroll: true });
  }
}
async function startCodingTask() {
  const control = $("start-coding"); if (control.disabled || state.codingDispatching) return;
  const epoch = state.epoch, navigation = state.navigation, originId = state.activeId, prompt = $("prompt").value.trim(), repository = $("repository").value, continuation = state.codingContinuation, restart = state.codingRestart, environmentId = state.environmentId;
  state.codingDispatching = true; feedback("coding-feedback", "Starting task…"); updateComposer();
  try {
    const conversation = await ensureConversation({ prompt, mode: "developer", repository }); checkEpoch(epoch);
    const path = continuation ? "coding/runs/" + encodeURIComponent(continuation) + "/continue" : "coding/runs";
    if (restart && restart.submission?.prompt !== prompt) restart.submission = { prompt, id: uuid() };
    const result = await api(path, "POST", { ...(continuation ? {} : { conversationId: conversation.id, ...(restart ? { retryFromRunId: restart.id, ...(restart.restoreRevision ? { restoreRevision: restart.restoreRevision } : {}) } : environmentId ? { environmentId } : {}) }), requestId: restart?.submission.id || uuid(), prompt }); checkEpoch(epoch);
    if (navigation === state.navigation && state.activeId === conversation.id) {
      feedback("coding-feedback", "");
      if ($("prompt").value.trim() === prompt) $("prompt").value = "";
      state.drafts.delete(originId || "new"); state.codingContinuation = null; state.codingRestart = null; fillEnvironmentChoices(); resizePrompt(); acceptCodingRun(result.run); await observeCodingRuns({ restore: false });
    }
    loadThreads().catch(() => {});
  } catch (error) {
    if (!error.accountChanged && epoch === state.epoch && navigation === state.navigation) {
      feedback("coding-feedback", errorText(error), true);
      if (state.activeId) await observeCodingRuns();
    }
  } finally { if (epoch === state.epoch) { state.codingDispatching = false; updateComposer(); } }
}
function codingDiffPath(run, file) {
  return "coding/runs/" + encodeURIComponent(run.id) + "/diff?" + new URLSearchParams({ path: file.path, revision: run.revision });
}
async function reviewCodingRun(id, { inboxTrigger } = {}) {
  const inbox = inboxTrigger ? codingInbox : null;
  const review = { id, inboxTrigger };
  state.codingReview = review;
  state.selectedPatch = null;
  $("patches-title").textContent = "Review changes";
  $("close-patches").setAttribute("aria-label", "Close review");
  $("review-toolbar").hidden = false;
  $("back-to-tasks").hidden = !inbox;
  review.sheet = openDialog("patches", inboxTrigger, { onClose: () => {
    state.codingReview = null;
    $("patch-detail").replaceChildren();
    if (codingInbox === inbox && inbox && state.privateReady) {
      if (inbox.refreshAfterReview) {
        inbox.refreshAfterReview = false;
        loadCodingInbox();
        $("refresh-inbox").focus();
      } else inboxTrigger.focus({ preventScroll: true });
    }
  } });
  const current = () => state.codingReview === review && !review.sheet.closed;
  const detail = $("patch-detail");
  $("patches-list").hidden = true;
  detail.hidden = false;
  detail.replaceChildren();
  feedback("patch-feedback", "Loading changes…");
  try {
    const data = await api("coding/runs/" + encodeURIComponent(id) + "/changes");
    if (!current()) return;
    const run = data.run, files = data.files || [];
    review.run = run;
    review.hasFiles = files.length > 0;
    acceptCodingRun(run);
    const metadata = [run.repository, run.baseBranch, run.baseSha && "Base " + run.baseSha.slice(0, 12), "Revision " + run.revision].filter(Boolean);
    detail.append(node("h3", "", run.prompt?.split("\n")[0].slice(0, 140) || "Coding task"), node("p", "muted", metadata.join(" · ")));
    if (run.summary) detail.append(node("p", "review-summary", run.summary));
    if (run.error?.message) detail.append(node("p", "message-error", run.error.message));
    detail.append(node("h4", "", files.length + " changed file" + (files.length === 1 ? "" : "s")));
    for (const file of files) {
      const section = node("details", "patch-file"), output = node("pre", "", "Open to load the diff."); let loaded = false, loading = false;
      section.append(node("summary", "", file.operation + " · " + file.path), output);
      section.addEventListener("toggle", async () => {
        if (!section.open || loaded || loading) return; loading = true; output.textContent = "Loading diff…";
        try {
          const result = await api(codingDiffPath(run, file));
          if (!current() || !section.isConnected) return;
          output.textContent = (result.binary ? "Binary file. A text diff is unavailable." : result.diff || "No text diff was recorded.") + (result.diffTruncated ? "\n\nDiff preview truncated. The complete file is included when you publish the draft pull request." : ""); loaded = true;
        } catch (error) {
          if (!error.accountChanged && current()) {
            if (error.code === "coding_review_changed") {
              review.stale = true;
              updateComposer();
            }
            output.textContent = errorText(error) + (review.stale ? "" : " Close and reopen this file to retry.");
          }
        }
        finally { loading = false; }
      }); detail.append(section);
    }
    detail.append(codingChecks(data.checks || run.checks));
    const link = pullRequestLink(run.pullRequest);
    if (link) detail.append(link);
    else if (run.status === "publishing") detail.append(node("p", "field-help", "Draft pull request creation is in progress. Refresh the review to check its status."));
    else if (run.reviewReady && files.length && !codingActive(run)) {
      detail.append(node("p", "field-help", "This creates a draft pull request from the reviewed revision. Deployment happens through the reviewed release process."));
      const publish = button("Create draft pull request", e => busy(e.currentTarget, async () => {
        if (!current() || review.stale) return;
        if (!await confirmAction(fw, "Create a new branch and draft pull request for these reviewed changes in " + run.repository + "?")) return;
        let result;
        try { result = await api("coding/runs/" + encodeURIComponent(id) + "/publish", "POST", { confirm: true, revision: run.revision }); }
        catch (error) {
          if (!current() || error.accountChanged) return;
          if (["coding_review_changed", "coding_review_unavailable", "coding_publish_pending"].includes(error.code)) review.stale = true;
          throw error;
        }
        if (!current()) return;
        acceptCodingRun(result.run); const published = pullRequestLink(result.pullRequest || result.run?.pullRequest);
        if (published) {
          if (inbox) inbox.refreshAfterReview = true;
          publish.replaceWith(published);
          published.focus();
          feedback("patch-feedback", "Draft pull request created.");
        } else {
          review.stale = true;
          feedback("patch-feedback", "Publication is being checked. Refresh the review for its result.");
        }
      }, "patch-feedback"), "primary-button"); publish.id = "publish-coding"; publish.disabled = !run.reviewReady || !files.length || !state.health?.github?.connected; detail.append(publish);
      if (!state.health?.github?.connected) detail.append(node("p", "field-help", "Connect GitHub in Settings to publish."));
    }
    feedback("patch-feedback", "");
    updateComposer();
  } catch (error) { if (!error.accountChanged && current()) feedback("patch-feedback", errorText(error), true); }
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
    const toggle = button(task.enabled ? "Pause" : "Enable", e => busy(e.currentTarget, async () => { if (!task.enabled && !await confirmAction(fw, "Enable recurring API usage for this task? It will use your saved model and connection.")) return; await api("tasks", "PATCH", { id: task.id, enabled: !task.enabled, confirm: true }); await loadSchedules(); })); toggle.disabled = !task.enabled && !data.autonomous; actions.append(toggle);
    actions.append(button("Run once", e => busy(e.currentTarget, async () => { if (!await confirmAction(fw, "Run this task now using your saved connection and daily allowance?")) return; await api("tasks/" + encodeURIComponent(task.id) + "/run", "POST", { requestId: uuid(), confirm: true }); await loadSchedules(); await showRuns(task); toast("Task run finished. See its result below."); })), button("Run history", () => showRuns(task))); card.append(actions); list.append(card);
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
  for (const box of all('input[name="weekday"]')) box.checked = (task?.weekdays || [1]).includes(Number(box.value)); feedback("schedule-feedback", ""); scheduleFields(); $("schedule-form").scrollIntoView({ block: "start", behavior: "smooth" });
}
async function saveSchedule(event) {
  event.preventDefault(); const control = $("schedule-form").querySelector('button[type="submit"]');
  await busy(control, async () => {
    const id = $("schedule-id").value, existing = state.tasks.find(t => t.id === id), kind = $("schedule-kind").value;
    const body = { title: $("schedule-title").value.trim(), prompt: $("schedule-prompt").value.trim(), mode: $("schedule-mode").value, repository: $("schedule-mode").value === "developer" ? $("schedule-repository").value || null : null, includeFitness: $("schedule-mode").value === "fitness" && $("schedule-fitness-consent").checked, context: $("schedule-mode").value === "developer" ? state.scheduleContext.filter(c => c.repository === $("schedule-repository").value).map(contextDescriptor) : [], schedule_kind: kind, timezone: $("schedule-timezone").value.trim(), ...(kind === "interval" ? { interval_minutes: Number($("schedule-interval").value) * 60 } : { local_time: $("schedule-time").value }), ...(kind === "weekly" ? { weekdays: [...all('input[name="weekday"]:checked')].map(el => Number(el.value)) } : {}) };
    if (kind === "weekly" && !body.weekdays.length) throw Error("Choose at least one weekday.");
    if (existing?.enabled && !await confirmAction(fw, "Apply these changes to the active recurring task?")) return;
    await api("tasks", id ? "PATCH" : "POST", id ? { ...body, id, enabled: !!existing?.enabled, confirm: !!existing?.enabled } : body); $("schedule-form").hidden = true; await loadSchedules(); toast(id ? "Task updated." : "Task saved paused.");
  }, "schedule-feedback");
}
async function showRuns(task) {
  try { const data = await api("tasks/" + encodeURIComponent(task.id) + "/runs"), section = $("schedule-runs"), list = $("schedule-runs-list"); section.hidden = false; $("schedule-runs-title").textContent = "Run history · " + (task.title || "Task"); list.replaceChildren(); for (const run of data.runs || []) { const card = node("article", "record-card"); card.append(node("h4", "", run.status + " · " + timestamp(run.started_at || run.created_at))); if (run.error_code) card.append(node("p", "", String(run.error_code).replaceAll("_", " "))); if (run.result) { const content = node("div", "run-content message-content"); renderAnswer(content, run.result, run.sources); card.append(content, sourceList(run.sources)); } if (run.request_id) card.append(node("p", "context-note", "Reference: " + run.request_id)); list.append(card); } if (!list.children.length) list.append(node("p", "muted empty-small", "This task has not run yet.")); section.scrollIntoView({ block: "start", behavior: "smooth" }); } catch (error) { toast(errorText(error)); }
}
async function bootstrap() {
  const epoch = state.epoch;
  $("session-notice").textContent = "Checking your session…"; root.classList.add("session-check");
  try {
    const health = await refreshHealth(); if (!health.storage?.ready) { state.privateReady = true; fw?.workspace?.changed(); root.classList.remove("session-check"); renderMessages(); updateComposer(); return; }
    const history = loadThreads();
    void Promise.allSettled([loadSettings(), loadRepositories(), loadEnvironments()]).then(results => {
      if (disposed || epoch !== state.epoch) return;
      const failed = results.find(result => result.status === "rejected" && !result.reason.accountChanged);
      if (failed) toast(errorText(failed.reason));
    });
    state.privateReady = true; fw?.workspace?.changed(); root.classList.remove("session-check"); renderHealth();
    const id = fw ? null : new URL(location.href).searchParams.get("conversation"); if (id) await selectConversation(id); else renderMessages();
    const run = !fw && health.runs?.ready && runFromReference(/^#runs=(.*)$/.exec(location.hash)?.[1]);
    if (run) openRunTimeline(run);
    await history;
  } catch (error) { if (!error.accountChanged) { $("session-notice").textContent = errorText(error); const retry = button("Try again", () => bootstrap()); $("session-notice").append(node("br"), retry); } }
}
async function verifyVisibleSession() {
  if (!visible() || state.checking) return;
  if (!state.privateReady) { root.classList.add("session-check"); $("session-notice").textContent = "Checking your session…"; }
  state.checking = (async () => {
    try {
      await (fw ? api("session", "GET", undefined, { timeout: 15000 }) : refreshHealth());
      root.classList.remove("session-degraded");
      if (state.privateReady && state.owner) { root.classList.remove("session-check"); void loadRunTimeline(); if (!state.codingObserver && !threadSelection) await observeCodingRuns(); }
      else if (state.owner) await bootstrap();
    } catch (error) {
      if (!error.accountChanged) {
        $("session-notice").textContent = "Connection interrupted. Your draft is kept here. " + errorText(error);
        root.classList.add("session-degraded");
        if (state.privateReady) root.classList.remove("session-check");
      }
    } finally { state.checking = null; }
  })();
  await state.checking;
}
function init() {
  sheets = fw ? nativeSheets(fw) : createSheets();
  const mobile = matchMedia(mobileQuery);
  placeSidebar(mobile.matches);
  if (fw) {
    $("prompt").rows = 1;
    $("task-options-environments").hidden = false;
    const choices = $("mode-choices"), select = $("mode");
    for (const [mode, title] of Object.entries(modeNames)) {
      const choice = button("", () => {
        if (select.value === mode) return;
        select.value = mode; select.dispatchEvent(new Event("change"));
      }, "ifl-row mode-choice");
      choice.dataset.mode = mode;
      const text = node("span", "ifl-tx"); text.append(node("b", "", title), node("small", "", modeDetails[mode]));
      choice.append(text, node("span", "mode-check", "✓")); choice.lastChild.setAttribute("aria-hidden", "true");
      choices.append(choice);
    }
    choices.hidden = false; select.closest("label").hidden = true;
  }
  listen(mobile, "change", event => placeSidebar(event.matches));
  $("navigation-toggle").addEventListener("click", () => navigation(true));
  listen(window.visualViewport, "resize", fitComposerViewport);
  listen(window.visualViewport, "scroll", fitComposerViewport);
  $("prompt").addEventListener("focus", fitComposerViewport);
  $("prompt").addEventListener("blur", fitComposerViewport);
  for (const el of all("[data-open]")) el.addEventListener("click", () => showPanel(el.dataset.open, el));
  $("refresh-runs").addEventListener("click", loadRecentRuns);
  $("background-answer").addEventListener("click", event => queueBackgroundAnswer(event.currentTarget));
  $("parallel-research").addEventListener("click", event => queueBackgroundAnswer(event.currentTarget, "parallel_research"));
  $("run-refresh").addEventListener("click", loadRunTimeline);
  $("run-more").addEventListener("click", loadRunTimeline);
  $("run-stop").addEventListener("click", event => changeRun(event, "stop"));
  $("run-resume").addEventListener("click", event => changeRun(event, "resume"));
  $("run-open-result").addEventListener("click", event => {
    if (runTimeline?.run) void openRunResult(runTimeline.run, event.currentTarget);
  });
  $("run-prepare-draft").addEventListener("click", event => previewRunDraft(event.currentTarget));
  $("run-draft-target").addEventListener("change", renderRunDraft);
  $("run-draft-open").addEventListener("click", event => openPreparedDraft(event.currentTarget));
  $("run-copy-link").addEventListener("click", async () => {
    if (!runTimeline?.reference) return;
    try {
      await navigator.clipboard.writeText(new URL("/atlas/#" + (fw ? "tasks" : "runs") + "=" + runTimeline.reference, location.origin).href);
      toast("Run link copied.");
    } catch { toast("Atlas could not copy the run link."); }
  });
  $("inbox-filter").addEventListener("change", () => loadCodingInbox());
  for (const control of all("[data-inbox-filter]")) control.addEventListener("click", () => {
    if ($("inbox-filter").value === control.dataset.inboxFilter) return;
    $("inbox-filter").value = control.dataset.inboxFilter; loadCodingInbox();
  });
  $("refresh-inbox").addEventListener("click", () => loadCodingInbox());
  $("more-inbox").addEventListener("click", () => loadCodingInbox({ more: true }));
  $("back-to-tasks").addEventListener("click", () => state.codingReview?.sheet.now());
  $("refresh-review").addEventListener("click", () => {
    const review = state.codingReview;
    if (review) reviewCodingRun(review.id, { inboxTrigger: review.inboxTrigger });
  });
  $("new-chat").addEventListener("click", () => newConversation()); $("conversation-search").addEventListener("input", renderThreads); $("show-archived").addEventListener("change", loadThreads);
  $("clear-conversation-search").addEventListener("click", () => {
    $("conversation-search").value = ""; renderThreads(); $("conversation-search").focus();
  });
  listen($("messages"), "scroll", updateLatestControl, { passive: true });
  $("jump-to-latest").addEventListener("click", () => jumpToLatest({ focus: true }));
  $("load-older-messages").addEventListener("click", e => loadOlderMessages(e.currentTarget));
  $("mode").addEventListener("change", () => { feedback("coding-feedback", ""); state.context = []; state.intent = "code"; state.codingContinuation = null; state.codingRestart = null; fillEnvironmentChoices(); renderContextChips(); updateComposer(); }); $("repository").addEventListener("change", () => { feedback("coding-feedback", ""); state.context = []; state.environmentId = ""; state.codingContinuation = null; state.codingRestart = null; renderContextChips(); fillEnvironmentChoices(); updateComposer(); });
  $("prompt").addEventListener("input", () => { saveDraft(); resizePrompt(); updateComposer(); }); $("prompt").addEventListener("keydown", event => { if (event.key === "Enter" && !event.isComposing && !event.shiftKey && (event.ctrlKey || event.metaKey || !matchMedia("(pointer:coarse)").matches)) { event.preventDefault(); const submit = $("start-coding").hidden ? $("send") : $("start-coding"); if (!submit.disabled) $("composer").requestSubmit(); } });
  $("composer").addEventListener("submit", event => { event.preventDefault(); if ((state.conversation?.mode || $("mode").value) === "developer" && state.intent === "code") startCodingTask(); else sendMessage(event); }); $("stop-response").addEventListener("click", stopResponse);
  $("upgrade-storage").addEventListener("click", e => busy(e.currentTarget, async () => { await api("setup", "POST", { confirm: true }); await bootstrap(); toast("Workspace storage is ready."); }));
  $("provider-model").addEventListener("change", () => { $("custom-model-label").hidden = $("provider-model").value !== "custom"; updateModelHelp(); }); $("provider-custom-model").addEventListener("input", updateModelHelp);
  $("provider-form").addEventListener("submit", event => { event.preventDefault(); const key = $("provider-key").value.trim(), model = currentModel(); if (!key && !state.health?.provider?.keySaved) return feedback("provider-feedback", "Enter the OpenAI key to save this connection.", true); if (!model) return feedback("provider-feedback", "Choose a model or enter a model ID.", true); $("provider-key").value = ""; busy($("save-provider"), async () => { await api("provider", "POST", { ...(key ? { key } : {}), model }); feedback("provider-feedback", key ? "Key saved. Use the short test to verify an actual response." : "Model saved. Test a short response with this model."); await refreshHealth(); const result = await api("models"); fillModels(result.models, result.selected || model); }, "provider-feedback"); });
  $("load-models").addEventListener("click", e => busy(e.currentTarget, async () => { const result = await api("models"); fillModels(result.models, result.selected); feedback("provider-feedback", "Available models refreshed."); }, "provider-feedback"));
  $("test-provider").addEventListener("click", e => busy(e.currentTarget, async () => { feedback("provider-feedback", "Testing a short response…"); await api("provider/test", "POST", { research: $("test-research").checked, requestId: uuid() }); await refreshHealth(); feedback("provider-feedback", "The connection produced a response successfully."); }, "provider-feedback"));
  $("remove-provider").addEventListener("click", e => busy(e.currentTarget, async () => { if (!await confirmAction(fw, "Remove your saved OpenAI connection? Scheduled work using it will no longer be able to run.")) return; await api("provider", "DELETE"); await refreshHealth(); feedback("provider-feedback", "Saved key removed."); }, "provider-feedback"));
  $("github-form").addEventListener("submit", event => { event.preventDefault(); const token = $("github-token").value.trim(); $("github-token").value = ""; if (!token) return feedback("github-feedback", "Enter a GitHub token.", true); busy($("github-form").querySelector('button[type="submit"]'), async () => { await api("github", "POST", { token }); await refreshHealth(); await loadRepositories(); feedback("github-feedback", "GitHub connection saved."); }, "github-feedback"); });
  $("remove-github").addEventListener("click", e => busy(e.currentTarget, async () => { if (!await confirmAction(fw, "Remove your saved GitHub connection?")) return; await api("github", "DELETE"); await refreshHealth(); await loadRepositories(); feedback("github-feedback", "GitHub connection removed."); }, "github-feedback"));
  $("preferences-form").addEventListener("submit", event => { event.preventDefault(); busy($("preferences-form").querySelector('button[type="submit"]'), async () => { const budget = $("daily-budget").value; await api("settings", "PATCH", { memoryEnabled: $("memory-enabled").checked, memory: $("memory-text").value, dailyRequestLimit: Number($("daily-request-limit").value), dailyBudgetUsd: budget === "" ? null : Number(budget), timezone: $("default-timezone").value.trim() }); dirtyForms.delete("preferences-form"); await loadSettings(); feedback("preferences-feedback", "Preferences saved."); }, "preferences-feedback"); });
  $("clear-memory").addEventListener("click", e => busy(e.currentTarget, async () => { if (!await confirmAction(fw, "Clear your saved personal context?")) return; await api("settings", "PATCH", { memoryEnabled: false, memory: "" }); await loadSettings(); feedback("preferences-feedback", "Saved personal context cleared."); }, "preferences-feedback"));
  $("rename-conversation").addEventListener("click", e => busy(e.currentTarget, async () => { const id = state.activeId; if (!id) return; const title = await promptValue(fw, "Conversation title", state.conversation.title); if (!title?.trim()) return; await api("conversations/" + encodeURIComponent(id), "PATCH", { title: title.trim() }); await selectConversation(id); await loadThreads(); }));
  $("archive-conversation").addEventListener("click", e => busy(e.currentTarget, async () => { const id = state.activeId; if (!id) return; await api("conversations/" + encodeURIComponent(id), "PATCH", { archived: !state.conversation.archived }); newConversation(); await loadThreads(); }));
  $("delete-conversation").addEventListener("click", e => busy(e.currentTarget, async () => { const id = state.activeId; if (!id || !await confirmAction(fw, "Delete this conversation and its saved messages?")) return; if (state.stream?.conversationId === id) await stopResponse(); await api("conversations/" + encodeURIComponent(id), "DELETE"); state.drafts.delete(id); newConversation(); await loadThreads(); }));
  $("export-conversation").addEventListener("click", e => busy(e.currentTarget, () => download("conversations/" + encodeURIComponent(state.activeId) + "/export", titleFilename(state.conversation.title))));
  $("summarize-conversation").addEventListener("click", e => busy(e.currentTarget, async () => { const id = state.activeId; if (!id) return; const result = await api("conversations/" + encodeURIComponent(id) + "/summary", "POST", { requestId: uuid() }); if (state.activeId === id) await selectConversation(id); const count = Number.isInteger(result.summarizedTurns) ? "Summarized " + result.summarizedTurns + " earlier turn" + (result.summarizedTurns === 1 ? "." : "s.") : "Earlier context summarized."; toast(count + (result.hasMore ? " More remains; summarize again when ready." : " The full conversation is retained.")); }));
  $("attach-context").addEventListener("click", event => { const top = sheets.top(); if (top?.el.id === "task-options-dialog") top.now(); openDialog("context", event.currentTarget); $("context-search").value = ""; loadContextSources(); }); $("context-refresh").addEventListener("click", loadContextSources); $("context-kind").addEventListener("change", () => { $("context-ref-label").hidden = $("context-kind").value !== "file"; loadContextSources(); }); $("context-search").addEventListener("input", renderContextSources); $("context-attach").addEventListener("click", e => attachSelectedContext(e.currentTarget));
  $("intent-code").addEventListener("click", () => { state.intent = "code"; updateComposer(); saveDraft(); });
  $("intent-ask").addEventListener("click", () => { state.intent = "ask"; state.codingContinuation = null; state.codingRestart = null; fillEnvironmentChoices(); updateComposer(); saveDraft(); });
  $("coding-environment").addEventListener("change", () => { state.codingContinuation = null; state.codingRestart = null; state.environmentId = $("coding-environment").value; saveDraft(); updateComposer(); });
  $("new-environment").addEventListener("click", () => editEnvironment()); $("create-first-environment").addEventListener("click", () => editEnvironment());
  $("cancel-environment-edit").addEventListener("click", closeEnvironmentEditor); $("environment-form").addEventListener("submit", saveEnvironment);
  for (const event of ["input", "change"]) $("environment-form").addEventListener(event, () => { state.environmentEditorVersion++; });
  $("use-environment").addEventListener("click", () => { const environment = state.environments.find(item => item.id === $("environment-id").value); if (environment) useEnvironment(environment); });
  $("duplicate-environment").addEventListener("click", () => {
    const environment = state.environments.find(item => item.id === $("environment-id").value);
    if (environment) duplicateEnvironment(environment);
  });
  $("archive-environment").addEventListener("click", event => {
    const environment = state.environments.find(item => item.id === $("environment-id").value);
    if (environment) archiveEnvironment(environment, event.currentTarget);
  });
  $("upgrade-environments").addEventListener("click", event => busy(event.currentTarget, async () => { await api("setup", "POST", { confirm: true }); await refreshHealth(); await loadEnvironments(); toast("Cloud environments are ready."); }, "environments-feedback"));
  $("start-coding").addEventListener("click", startCodingTask); $("clear-coding-continuation").addEventListener("click", () => { state.codingContinuation = null; state.codingRestart = null; fillEnvironmentChoices(); updateComposer(); }); $("new-schedule").addEventListener("click", () => editSchedule()); $("schedule-kind").addEventListener("change", scheduleFields); $("schedule-mode").addEventListener("change", scheduleFields); $("schedule-form").addEventListener("submit", saveSchedule); $("cancel-schedule-edit").addEventListener("click", () => { dirtyForms.delete("schedule-form"); $("schedule-form").hidden = true; });
  $("schedule-repository").addEventListener("change", () => { state.scheduleContext = []; scheduleFields(); }); $("schedule-use-context").addEventListener("click", () => { state.scheduleContext = state.context.filter(c => c.repository === $("schedule-repository").value).map(contextDescriptor); renderScheduleContext(); });
  $("stop-schedules").addEventListener("click", e => busy(e.currentTarget, async () => { if (!await confirmAction(fw, "Pause all your scheduled tasks?")) return; await api("stop", "POST", {}); await loadSchedules(); toast("All scheduled tasks paused."); }));
  let zones = ["Europe/London", "UTC"]; try { if (Intl.supportedValuesOf) zones = ["UTC", ...Intl.supportedValuesOf("timeZone")]; } catch {} for (const zone of zones) { const option = node("option"); option.value = zone; $("timezones").append(option); }
  listen(document, "visibilitychange", () => { if (document.visibilityState === "hidden") { detachCodingObserver(); pauseRunTimeline(); if (!fw) root.classList.add("session-check"); } else verifyVisibleSession(); });
  listen(window, "focus", verifyVisibleSession); listen(window, "pagehide", () => { detachCodingObserver(); pauseRunTimeline(); $("provider-key").value = ""; $("github-token").value = ""; if (!fw) root.classList.add("session-check"); }); listen(window, "pageshow", event => { if (event.persisted) verifyVisibleSession(); });
  for (const name of ["preferences-form", "environment-form", "schedule-form"]) listen($(name), "input", () => { dirtyForms.add(name); });
  return bootstrap();
}
function updateNativeHeader() {
  if (!fw || disposed || !shown) return;
  fw.header.set({ title: "Atlas", compactTitle: "Atlas", line: "", crumb: { text: "InFlite", app: "atlas" },
    acts: [
      { icon: "search", scope: "app", label: "Find a conversation", run: () => navigation(true) },
      { icon: "plus", label: "New conversation", run: () => newConversation() },
      { icon: "more", label: "Atlas tools", run: () => showPanel("workspace") },
    ],
  });
}
function hasDraft() {
  return dirtyForms.size > 0 || !!$("prompt")?.value.trim() || !!$("provider-key")?.value || !!$("github-token")?.value || [...state.drafts.values()].some(draft => draft.prompt?.trim());
}
function isBusy() { return !disposed && (hasDraft() || !!state.stream || state.dispatching || state.codingDispatching || state.contextPending || all(".busy-label").length > 0); }
const fileMetadata = (value, kind) => ({
  id: "atlas:" + kind + ":" + value.id, app: "atlas", name: titleFilename(value.title),
  mime: "text/markdown", category: "document", objectId: kind + ":" + value.id,
  intent: "open", downloadIntent: "download", modifiedAt: Number(value.updated_at || value.created_at) || 0,
});
function workspaceFiles() { return [...state.conversations.map(value => fileMetadata(value, "conversation")), ...state.briefs.map(value => fileMetadata(value, "brief"))]; }
async function workspaceRun(intent, object, lease = {}) {
  const current = () => !disposed && !lease.signal?.aborted && (!lease.current || lease.current());
  if (!current() || !fw?.workspace?.active()) return { ok: false };
  if (intent === "handoff") return receiveHandoff(object, lease);
  await ready; if (!current()) return { ok: false };
  if (intent === "new") { newConversation(); return { ok: true }; }
  if (["tasks", "environments", "briefs", "settings"].includes(intent)) { fw.nav.section(intent); return { ok: true }; }
  if (!["open", "download"].includes(intent) || typeof object !== "string") return { ok: false };
  const match = /^(conversation|brief):(.+)$/.exec(object);
  if (!match) return { ok: false };
  const [, kind, id] = match;
  const valid = /^[A-Za-z0-9_-]{1,40}$/.test(id) || kind === "conversation" && /^legacy-(?:[a-f0-9]{2}){1,60}-(?:research|developer|personal|fitness|tasks)$/.test(id);
  if (!valid) return { ok: false };
  if (intent === "download") { await download((kind === "brief" ? "briefs/" : "conversations/") + encodeURIComponent(id) + "/export", "atlas-" + kind + ".md"); return { ok: true }; }
  fw.nav.go(fw.nav.href(kind === "brief" ? "briefs" : "conversations", id)); return { ok: true };
}
const ready = init();
function attachWorkspace() {
  if (disposed || !fw?.workspace || providerOff) return;
  providerOff = fw.workspace.provide({
  snapshot: () => ({ status: state.privateReady ? "ready" : "loading", availability: { local: false, draft: hasDraft(), saving: !!state.stream || state.dispatching || state.codingDispatching, pending: 0 },
    actions: [{ id: "new", label: "New conversation", enabled: state.privateReady }, { id: "tasks", label: "Coding tasks", enabled: state.privateReady }, { id: "environments", label: "Cloud environments", enabled: state.privateReady }], files: workspaceFiles() }),
  run: workspaceRun,
  search: async (query, lease = {}) => ({ status: disposed || lease.signal?.aborted ? "error" : "ready", entries: disposed || lease.signal?.aborted ? [] : state.conversations.filter(value => String(value.title).toLowerCase().includes(String(query).toLowerCase())).slice(0, 8).map(value => ({ title: value.title, sub: modeNames[value.mode] || "Atlas", path: fw.nav.href("conversations", value.id) })) }),
  files: async ({ query = "", current = () => true } = {}) => ({ status: !disposed && current() ? "ready" : "error", files: !disposed && current() ? workspaceFiles().filter(value => value.name.toLowerCase().includes(query.toLowerCase())) : [], more: false }),
  });
}
attachWorkspace();
function unmount() {
  if (disposed) return;
  clearNativeKeyboard();
  shown = false; ++routeEpoch; disposed = true; ++state.epoch; cancelAnimationFrame(paintFrame); paintFrame = 0; queuedMessage = null;
  lifetime.abort(); detachCodingObserver(); state.stream?.controller.abort(); state.stream = null;
  for (const controller of state.controllers) controller.abort(); state.controllers.clear();
  leaveDestination(); sheets?.closeAll(); activeToast?.close(); providerOff?.(); providerOff = null;
  answerSubmission = null;
  state.drafts.clear(); dirtyForms.clear(); state.messages = []; state.conversations = []; state.workspaceContext = []; state.briefs = []; state.owner = null;
  for (const input of all("input, textarea")) input.value = "";
  root.replaceChildren(); root.classList.remove("atlas-app", "atlas-native", "session-check", "session-degraded");
}
listen(fw?.signal, "abort", unmount, { once: true });
return {
  ready,
  async show(nextRoute = {}) {
    if (disposed) return;
    const generation = ++routeEpoch; shown = true; route = nextRoute; updateNativeHeader(); fw?.fill(true);
    await ready; if (disposed || generation !== routeEpoch) return;
    if (fw && !navigationSheet) placeSidebar();
    routing = true;
    try {
      const key = nextRoute.key || nextRoute.section || "conversations", id = nextRoute.arg;
      if (key === "conversations") {
        if (destination) { sheets.closeAll(); leaveDestination(); }
        if (id && id !== state.activeId) await selectConversation(id);
      } else if (key === "runs") {
        leaveDestination();
        const run = runFromReference(id);
        if (fw) fw.nav.go(fw.nav.href("tasks", run && state.health?.runs?.ready ? id : null), { replace: true });
        else if (run && state.health?.runs?.ready) openRunTimeline(run);
        else await showPanel("runs");
      }
      else if (key === "tasks") {
        const run = fw && runFromReference(id);
        if (run && state.health?.runs?.ready) { openRunTimeline(run, null, { page: true }); return; }
        await showPanel("inbox", null, { page: !!fw });
        if (id && !run) {
          if (generation !== routeEpoch) return;
          const data = await api("coding/runs/" + encodeURIComponent(id));
          if (generation !== routeEpoch) return;
          if (data.run?.conversationId && data.run.conversationId !== state.activeId) await selectConversation(data.run.conversationId);
          if (generation === routeEpoch) await reviewCodingRun(id);
        }
      } else if (key === "briefs") {
        await showPanel("briefs", null, { page: !!fw });
        if (generation === routeEpoch) { if (id) await showBrief(id); else showBriefList(); }
      }
      else if (key === "environments") await showPanel(key, null, { page: !!fw });
      else if (key === "settings") await showPanel(key);
      if (generation === routeEpoch) { resizePrompt(); updateComposer(); if (state.privateReady && !destination && !state.codingObserver && !threadSelection) await observeCodingRuns(); }
    } catch (error) { if (!error.accountChanged) toast(errorText(error)); }
    finally { if (generation === routeEpoch) routing = false; }
  },
  hide() { if (disposed) return; clearNativeKeyboard(); shown = false; ++routeEpoch; routing = false; saveDraft(); if (threadSelection) { cancelThreadSelection(); $("conversation-status").replaceChildren(); } detachCodingObserver(); sheets.closeAll(); leaveDestination(); $("provider-key").value = ""; $("github-token").value = ""; },
  back() { const top = sheets.top(); if (top) { top.now(); return true; } return false; },
  async settingsPanel(host, current = () => true) {
    await ready; if (disposed || !current()) return;
    nativeSettings = { fw: host, current };
    sheets.openEl($("settings-dialog"), { framework: host, onClose: () => { nativeSettings = null; } });
    try { await refreshHealth(); if (!current() || disposed) return; if (state.health?.storage?.ready) await loadSettings(); }
    catch (error) { if (current() && !error.accountChanged) actionableError(error, "provider-feedback"); }
  },
  busy: isBusy,
  flush: async () => { saveDraft(); return { lost: hasDraft() ? 1 : 0 }; },
  sendable: () => null,
  workspace: attachWorkspace,
  onIntent: workspaceRun,
  unmount,
};
}

if (typeof document !== "undefined") {
  const standalone = () => { if (document.body.classList.contains("atlas-app")) createAtlasClient(document.body); };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", standalone, { once: true }); else standalone();
}
