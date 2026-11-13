const APPS = new Set(["fitness", "weather", "markets", "chats", "mail"]);
const filesFolder = s => typeof s === "string" && /^[A-Za-z0-9_-]{32}$/.test(s) ? s : null;
// Only opaque IDs and curated source/view enums may accompany a Files history
// entry. Names, queries, resources and signed URLs remain in the account service.
export function safeFilesLocation(value = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  if (value.kind === "apps") {
    if (value.app != null && !APPS.has(value.app) || value.category != null && !["routes", "workouts", "images", "audio", "documents"].includes(value.category)) return null;
    return { kind: "apps", app: value.app || null, ...(value.category ? { category: value.category } : {}) };
  }
  if (value.kind !== undefined && value.kind !== "drive" || value.folderId != null && !filesFolder(value.folderId) || value.view != null && !["folder", "recent"].includes(value.view)) return null;
  return { kind: "drive", folderId: value.view === "recent" ? null : value.folderId || null, view: value.view === "recent" ? "recent" : "folder" };
}
export { safeFilesLocation as filesLocation };
