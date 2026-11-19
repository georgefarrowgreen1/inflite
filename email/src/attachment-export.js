// Explicit, authenticated attachment transfer. These bytes are never a preview.
const MAX = 25 * 1024 * 1024;
const fail = (status, message) => { throw Object.assign(new Error(message), {status}); };
export function attachmentDisposition(filename, mode = "attachment") {
  const name = String(filename || "Attachment").slice(0, 255).toWellFormed().replace(/[\x00-\x1f\x7f]/g, "_");
  const ascii = name.replace(/[^\x20-\x7e]|["\\]/g, "_");
  const encoded = encodeURIComponent(name).replace(/[!'()*]/g, ch => "%" + ch.charCodeAt(0).toString(16).toUpperCase());
  return `${mode}; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

export async function exportAttachment(env, id) {
  const row = await env.DB.prepare("SELECT filename, size FROM attachments WHERE id = ?1").bind(id).first();
  if (!row) fail(404, "Attachment not found");
  if (!Number.isSafeInteger(row.size) || row.size < 0 || row.size > MAX) fail(413, "Files are limited to 25 MB each.");
  const object = await env.MAIL.get(`att/${id}`);
  if (!object) fail(404, "Attachment not found");
  if (!Number.isSafeInteger(object.size) || object.size < 0 || object.size > MAX) fail(413, "Files are limited to 25 MB each.");
  return new Response(object.body, {headers:{
    "Content-Type":"application/octet-stream", "Content-Length":String(object.size),
    "Content-Disposition":attachmentDisposition(row.filename),
    "Cache-Control":"private, no-store", "X-Content-Type-Options":"nosniff",
    "Content-Security-Policy":"sandbox; default-src 'none'; frame-ancestors 'none'", "Referrer-Policy":"no-referrer"
  }});
}
