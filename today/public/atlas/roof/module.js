import { atlasMarkup } from "./template.js";
import { createAtlasClient } from "../assets/app.js";

export const CONTRACT = 1;
export const BUILD = "2.6.1";
export const NEWS = "See GitHub checks for a reviewed draft commit and follow up on a failed check in Atlas.";
export const SECTIONS = [["conversations", "Conversations"], ["tasks", "Tasks"], ["environments", "Environments"], ["briefs", "Briefs"], ["settings", "Settings"]];

export function mount(root, fw) {
  // This is trusted application markup. User/model text is rendered with DOM
  // text nodes in the client; no model content enters this template.
  const template = document.createElement("template");
  template.innerHTML = atlasMarkup();
  root.replaceChildren(template.content.cloneNode(true));
  root.classList.add("atlas-app", "atlas-native", "session-check");
  root.querySelector(".atlas-sky")?.remove();
  const header = root.querySelector(".atlas-header");
  if (header) { header.hidden = true; header.setAttribute("aria-hidden", "true"); }
  return createAtlasClient(root, { fw });
}
