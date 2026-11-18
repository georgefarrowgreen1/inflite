// Follow-ups belong to a sent message. Receiving a reply clears its thread in
// the same D1 transaction as delivery; queued drafts never create reminders.
export function validDue(value) {
  return Number.isSafeInteger(value) && value > 0 && value < Date.now() + 367 * 86400000;
}
export async function dueFollowups(env, claim = false) {
  const fields = 'thread_id, message_id, due';
  const query = claim
    ? `UPDATE mail_followups SET notified=1 WHERE thread_id IN (SELECT f.thread_id FROM mail_followups f JOIN messages m ON m.id=f.message_id WHERE f.notified=0 AND f.due<=? AND m.folder='sent' ORDER BY f.due LIMIT 50) RETURNING ${fields}`
    : `SELECT f.thread_id, f.message_id, f.due, m.subject FROM mail_followups f JOIN messages m ON m.id=f.message_id WHERE f.due<=? AND m.folder='sent' ORDER BY f.due LIMIT 50`;
  return (await env.DB.prepare(query).bind(Date.now()).all()).results;
}
