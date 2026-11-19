import { documents } from "./settings-documents.js";
import { connectContactForm } from "./about/contact.js";

const readableTags = new Set(["section", "h2", "p", "ul", "ol", "li", "a", "strong", "em"]);
const localDocuments = {
  "/about/": "/#settings=about-apps",
  "/about/#apps": "/#settings=about-apps",
  "/about/#contact": "/#settings=about-contact",
  "/privacy/": "/#settings=about-privacy",
  "/storage/": "/#settings=about-storage",
  "/terms/": "/#settings=about-terms",
};
const contactForms = new WeakMap();

// Copy the text and links from the published copy into the app's own layout.
// The source stays inert and the view never imports its scripts or styles.
function readingContent(parent, nodes) {
  for (const node of nodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      parent.append(node.textContent);
      continue;
    }
    if (!readableTags.has(node.localName)) continue;
    const next = document.createElement(node.localName === "h2" ? "h3" : node.localName);
    if (node.classList.contains("date")) next.className = "settings-document-date";
    if (node.localName === "a") {
      const href = node.getAttribute("href") || "";
      const internal = Object.hasOwn(localDocuments, href) && localDocuments[href];
      if (internal) next.href = internal;
      else if (href.startsWith("mailto:")) next.href = href;
      else if (href.startsWith("https://")) {
        next.href = href;
        next.target = "_blank";
        next.rel = "noopener noreferrer";
      } else {
        parent.append(node.textContent);
        continue;
      }
    }
    readingContent(next, node.childNodes);
    parent.append(next);
  }
}

function catalogue(body, source, ui) {
  const { el } = ui;
  const section = source.querySelector("#apps");
  readingContent(body, section.querySelectorAll(".ecosystem-heading p"));
  const list = el("ul", { class: "settings-document-apps group glass", role: "list" });
  for (const app of section.querySelectorAll(".app-list > li")) {
    const src = app.querySelector("img")?.getAttribute("src");
    const icon = src === "/inflite.svg" || /^\/apps\/[a-z]+\.svg$/.test(src || "")
      ? el("img", { src, alt: "", width: 38, height: 38, loading: "lazy" })
      : ui.icon("file");
    list.append(el("li", {},
      el("span", { class: "settings-document-app-icon", "aria-hidden": "true" }, icon),
      el("div", {}, el("h3", { text: app.querySelector("h3").textContent }), el("p", { text: app.querySelector("p").textContent }))));
  }
  body.append(list);
}

function contact(body, source, frame) {
  const { el } = frame.ui;
  const section = source.querySelector("#contact");
  readingContent(body, section.querySelectorAll(".enquiry-copy p"));
  let form = contactForms.get(frame);
  if (!form) {
    const published = section.querySelector("form");
    const field = name => {
      const original = published.elements.namedItem(name);
      return el("label", {}, original.closest("label").textContent.trim(),
        el(original.localName, {
          name, required: original.required, maxlength: original.maxLength,
          autocomplete: original.getAttribute("autocomplete"), type: original.getAttribute("type"),
          rows: original.getAttribute("rows")
        }));
    };
    form = el("form", { class: "settings-document-contact" },
      el("div", { class: "settings-document-fields" }, field("name"), field("email")),
      field("message"),
      el("label", { class: "vh", "aria-hidden": "true" }, "Website",
        el("input", { name: "website", tabindex: -1, autocomplete: "off" })),
      el("div", { class: "settings-document-actions" },
        el("button", { class: "ifl-btn primary", type: "submit", text: "Send message" }),
        el("a", { href: localDocuments["/privacy/"], text: "Privacy notice" })),
      el("p", { class: "settings-document-status", role: "status" }));
    connectContactForm(form, frame.signal);
    contactForms.set(frame, form);
  }
  body.append(form);
}

export function renderSettingsDocument(slot, page, frame) {
  const source = document.createElement("template");
  source.innerHTML = documents[page === "apps" || page === "contact" ? "about" : page];
  const body = frame.ui.el("article", { class: "settings-document-article" });
  if (page === "apps") catalogue(body, source.content, frame.ui);
  else if (page === "contact") contact(body, source.content, frame);
  else readingContent(body, [...source.content.children].filter(node => node.matches("p, section")));
  slot.replaceChildren(body);
}
