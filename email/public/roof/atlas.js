// Mail's explicit Atlas actions load only when requested. Every network read
// and native draft still belongs to the initiating account and presentation.
const ID = /^[\w-]{1,64}$/;
const clean = v => typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g, "").trim().slice(0, 180) : "";

export async function runAtlas(ctx, action, value, current) {
  const { store, api, logic, fw } = ctx, sdk = fw.workspace;
  if (!current()) return { ok: false, cancelled: true };
  if (action === "ask-atlas") {
    const { id, threadId } = value;
    if (!ID.test(id || "") || id !== threadId) return { ok: false, error: "Choose a conversation in Mail first." };
    const present = () => current() && store.get().threadId === threadId;
    if (!present()) return { ok: false, cancelled: true };
    if (!sdk.handoffs?.can("atlas", "mail-context")) return { ok: false, error: "Atlas is not available in this workspace." };
    const result = await api.thread(id);
    if (!present()) return { ok: false, cancelled: true };
    const thread = result?.thread || result, messages = result?.messages || thread?.messages || [];
    if (thread?.id !== id || thread.trashed || !messages.some(m => ID.test(m.id || "") && !["trash", "drafts"].includes(m.folder))) return { ok: false, error: "That conversation is no longer available." };
    // Only the selected reference crosses the shell. Atlas fetches its bounded
    // context through its authenticated server endpoint when it is attached.
    return sdk.handoffs.send("atlas", "mail-context", { threadId: id, subject: clean(thread.subject) });
  }
  if (action !== "handoff" || value?.kind !== "mail-reply" || !ID.test(value.threadId || "") || !ID.test(value.messageId || "") || typeof value.text !== "string" || !value.text.trim() || value.text.length > 16000) return { ok: false };
  const result = await api.thread(value.threadId);
  if (!current()) return { ok: false, cancelled: true };
  const thread = result?.thread || result, messages = result?.messages || thread?.messages || [];
  if (thread?.id !== value.threadId || !messages.some(m => m.id === value.messageId && !["trash", "drafts"].includes(m.folder))) return { ok: false, error: "The source message is no longer available. Open the conversation in Mail." };
  const meta = await api.meta(value.messageId);
  if (!current()) return { ok: false, cancelled: true };
  if (meta?.id !== value.messageId || ["trash", "drafts"].includes(meta.folder) || meta.threadId !== value.threadId) return { ok: false, error: "The source reply could not be verified. Open the conversation in Mail." };
  // Addresses, quoting and headers are resolved by Mail; Atlas supplies text.
  return { ok: !!(await ctx.open.compose({ ...logic.replyDraft(meta, "reply", store.get().me), text: value.text }, current)), pending: true };
}
