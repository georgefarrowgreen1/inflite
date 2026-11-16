// Shared validation lives with the core router so reopen references do not
// add an optional Files module to the ordinary shell.
export { safeFilesLocation, safeFilesLocation as filesLocation } from "./router.js";
