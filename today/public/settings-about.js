import { documents } from "./settings-documents.js";
import { connectContactForm } from "./contact/form.js";

const readableTags = new Set(["section", "h2", "p", "ul", "ol", "li", "a", "strong", "em"]);
const localDocuments = {
  "/about/": "/#settings=about-apps",
  "/about/#apps": "/#settings=about-apps",
  "/about/#contact": "/#settings=about-contact",
  "/contact/": "/#settings=about-contact",
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
  const list = el("ul", { class: "settings-document-apps", role: "list" });
  for (const app of section.querySelectorAll(".app-list > li")) {
    const src = app.querySelector("img")?.getAttribute("src");
    const featured = src === "/inflite.svg";
    const icon = featured || /^\/apps\/[a-z]+\.svg$/.test(src || "")
      ? el("img", { src, alt: "", width: 44, height: 44, loading: featured ? "eager" : "lazy", decoding: "async" })
      : ui.icon("file");
    list.append(el("li", { class: featured ? "settings-document-featured" : null },
      el("span", { class: "settings-document-app-icon", "aria-hidden": "true" }, icon),
      el("div", {}, el("h3", { text: app.querySelector("h3").textContent }), el("p", { text: app.querySelector("p").textContent }))));
  }
  body.append(list);
}

function contact(body, source, frame) {
  const { el } = frame.ui;
  const section = source.querySelector("#contact");
  const intro = el("div", { class: "settings-document-lead" });
  readingContent(intro, section.querySelectorAll(".contact-intro p"));
  body.append(intro);
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
  const alternative = el("div", { class: "settings-document-alternative" });
  readingContent(alternative, section.querySelectorAll(".contact-alternative"));
  body.append(alternative);
}

function policy(body, source, ui) {
  const { el } = ui;
  const copy = el("div", { class: "settings-document-reading" });
  const intro = source.querySelector(".policy-hero") || source;
  const articles = source.querySelector(".policy-articles") || source;
  readingContent(copy, [...intro.children].filter(node => node.matches("p")));
  readingContent(copy, [...articles.children].filter(node => node.matches("section")));
  const headings = [...copy.querySelectorAll(":scope > section > h3")];
  if (headings.length > 1) {
    const contents = el("details", { class: "settings-document-index" },
      el("summary", { text: "On this page" }, ui.icon("chev")));
    const jumps = headings.map(heading => el("button", {
      type: "button", text: heading.textContent,
      on: { click() {
        contents.open = false;
        heading.tabIndex = -1;
        heading.focus({ preventScroll: true });
        heading.scrollIntoView({ block: "start" });
      } }
    }));
    contents.append(el("nav", { "aria-label": "On this page" }, jumps));
    copy.querySelector("section").before(contents);
  }
  body.append(copy);
}

export function renderSettingsDocument(slot, page, frame) {
  const source = document.createElement("template");
  source.innerHTML = documents[page === "apps" ? "about" : page];
  const body = frame.ui.el("article", { class: "settings-document-article" });
  if (page === "apps") catalogue(body, source.content, frame.ui);
  else if (page === "contact") contact(body, source.content, frame);
  else policy(body, source.content, frame.ui);
  slot.replaceChildren(body);
}
