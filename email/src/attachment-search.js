// Keep free-text search intact unless a sender and a supported file type are explicit.
const kinds = {
  route: "(lower(a.filename) LIKE '%.gpx' OR lower(a.filename) LIKE '%.fit' OR lower(a.filename) LIKE '%.tcx' OR lower(a.filename) LIKE '%.kml')",
  pdf: "(lower(a.type) = 'application/pdf' OR lower(a.filename) LIKE '%.pdf')",
  photo: "lower(a.type) LIKE 'image/%'",
  file: "1"
};
export const visibleFile = "NOT (COALESCE(a.disposition, '') = 'inline' AND a.content_id IS NOT NULL)";
export function attachmentIntent(text) {
  const query = String(text || "").trim().replace(/^(?:find |show me )?(?:the )?/i, "");
  const match = /^(route|pdf|photo|attachment|file)s? (?:from (.+)|(.+) sent(?: me)?)$/iu.exec(query);
  const sender = (match?.[2] || match?.[3] || "").trim().toLowerCase();
  if (!sender || sender.length > 80 || !/^[\p{L}\p{N}.'@+-]+(?: [\p{L}\p{N}.'@+-]+){0,3}$/u.test(sender)) return null;
  const kind = match[1].toLowerCase();
  return { sender, condition: kinds[kind === "attachment" ? "file" : kind] };
}

export function senderCondition(parameter) {
  return `(lower(from_email) LIKE ${parameter} OR lower(from_name) LIKE ${parameter})`;
}

export async function attachSearchHits(db, threads, intent, trash) {
  // D1 accepts at most 100 bindings per statement. Keep the result bounded on large mailboxes.
  for (let i = 0; i < threads.length; i += 40) {
    const group = threads.slice(i, i + 40);
    const ids = group.map(thread => thread.id);
    const placeholders = ids.map(() => "?").join(",");
    const {results} = await db.prepare(`SELECT * FROM (
      SELECT a.id,a.filename,m.thread_id,m.date,COALESCE(NULLIF(m.from_name,''),m.from_email) AS sender,
        row_number() OVER (PARTITION BY m.thread_id ORDER BY m.date DESC,a.id) AS rank
      FROM attachments a JOIN messages m ON m.id=a.message_id
      WHERE m.thread_id IN (${placeholders}) AND ${trash ? "m.folder='trash'" : "m.folder IN ('archive','inbox')"}
      AND ${senderCondition("?" + (ids.length + 1))} AND ${visibleFile} AND ${intent.condition}
    ) WHERE rank<=10 ORDER BY date DESC,id`).bind(...ids, "%" + intent.sender + "%").all();
    for (const thread of group) thread.matchedFiles = results.filter(row => row.thread_id === thread.id);
  }
}
