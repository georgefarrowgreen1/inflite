// Pure, bounded app metadata. No URLs, body bytes or persistent state.
export const FILE_APPS = Object.freeze(["fitness", "weather", "markets", "chats", "mail"]);
const APPS = new Set(FILE_APPS);
export const FILE_LIMIT = 100;
const opaque = (v) => typeof v === "string" && /^[\w:-]{1,220}$/.test(v) ? v : null;
export const fileText = (v, max) => typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g, " ").trim().slice(0, max) : "";
const fold = (v) => String(v || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
export const fileQuery = (v) => fileText(v, 160);
export function normalizeWorkspaceFile(value, app) {
  if (!value || !APPS.has(app) || value.app !== app) return null;
  const id = opaque(value.id), objectId = opaque(value.objectId), intent = opaque(value.intent), name = fileText(value.name, 255);
  const mime = typeof value.mime === "string" && /^[\w.+-]+\/[\w.+-]+$/.test(value.mime) && value.mime.length <= 100 ? value.mime.toLowerCase() : "";
  if (!id || !objectId || !intent || !name || !mime) return null;
  const out = { id, app, name, mime, objectId, intent };
  if (["image", "audio", "document", "route", "workout"].includes(value.category)) out.category = value.category;
  for (const key of ["downloadIntent", "shareIntent"]) if (opaque(value[key])) out[key] = value[key];
  if (Number.isSafeInteger(value.size) && value.size >= 0) out.size = value.size;
  if (Number.isFinite(value.modifiedAt) && value.modifiedAt > 0) out.modifiedAt = value.modifiedAt;
  if (fileText(value.source, 140)) out.source = fileText(value.source, 140);
  return out;
}
const kind = (f) => f.category === "route" || /\.gpx$/i.test(f.name) || f.mime === "application/gpx+xml" ? "routes" : f.category === "workout" || /\.(fit|tcx|zwo|erg|mrc)$/i.test(f.name) ? "workouts" : f.category === "image" || f.mime.startsWith("image/") ? "images" : f.category === "audio" || f.mime.startsWith("audio/") ? "audio" : "documents";
export function filterWorkspaceFiles(files, { query = "", type = "all", source = "all", sort = "recent" } = {}) {
  const words = fold(fileQuery(query)).split(/\s+/).filter(Boolean);
  return files.filter((f) => (source === "all" || f.app === source) && (type === "all" || kind(f) === type) && words.every((w) => fold(f.name + " " + (f.source || "")).includes(w)))
    .sort((a, b) => (sort === "name" ? a.name.localeCompare(b.name) : sort === "size" ? (b.size || 0) - (a.size || 0) : (b.modifiedAt || 0) - (a.modifiedAt || 0)) || a.name.localeCompare(b.name));
}
