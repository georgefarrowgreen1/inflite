// Atlas-only payload schemas. Loaded for an explicit handoff, never shell boot.
// Only selected references and reviewable native draft fields may cross apps.
const clean = (s, n) => typeof s === "string" ? s.replace(/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g, " ").trim().slice(0, n) : "";
const ID = /^[A-Za-z0-9_-]{1,64}$/;
const bodyText = (value, max) => typeof value === "string" && value.length <= max ? value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g, "") : null;
const mailSource = value => value == null ? undefined : value.app === "mail" && ID.test(value.threadId || "") ? { app: "mail", threadId: value.threadId } : null;

export function handoffPayload(source, target, kind, value) {
  if (source === "mail" && target === "atlas" && kind === "mail-context") {
    if (!ID.test(value?.threadId || "") || value.messageId != null && !ID.test(value.messageId)) return null;
    return { threadId: value.threadId, ...(value.messageId ? { messageId: value.messageId } : {}), subject: clean(value.subject, 180) };
  }
  if (source === "atlas" && target === "mail" && kind === "mail-reply") {
    const text = bodyText(value?.text, 16000);
    return ID.test(value?.threadId || "") && ID.test(value.messageId || "") && text?.trim() ? { threadId: value.threadId, messageId: value.messageId, text } : null;
  }
  if (source === "atlas" && ["notes", "calendar"].includes(target) && kind === (target === "notes" ? "note-draft" : "event-draft")) {
    const title = clean(value?.title, 160), from = mailSource(value?.source);
    if (!title || from === null) return null;
    if (target === "notes") {
      const text = bodyText(value?.text, 64000);
      return text?.trim() ? { title, text, ...(from ? { source: from } : {}) } : null;
    }
    const description = bodyText(value?.description ?? "", 4000);
    if (description === null) return null;
    const hasTime = value.start != null || value.end != null;
    if (hasTime && (!Number.isSafeInteger(value.start) || !Number.isSafeInteger(value.end) || value.start < 0 || value.end <= value.start || value.end > 8640000000000000 || value.end - value.start > 366 * 864e5)) return null;
    const timezone = clean(value.timezone, 80);
    if (timezone) { try { new Intl.DateTimeFormat("en", { timeZone: timezone }); } catch { return null; } }
    return { title, description, ...(hasTime ? { start: value.start, end: value.end } : {}), ...(timezone ? { timezone } : {}), ...(from ? { source: from } : {}) };
  }
  if (source === "atlas" && target === "mail" && kind === "text") {
    const subject = clean(value?.subject, 180), text = bodyText(value?.text, 16000);
    return subject && text?.trim() ? { subject, text } : null;
  }
  return null;
}
