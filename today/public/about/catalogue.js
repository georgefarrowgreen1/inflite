const catalogue = document.querySelector(".app-catalogue");

if (catalogue) {
  const list = catalogue.querySelector(".app-list");
  const spotlight = catalogue.querySelector(".app-spotlight");
  const icon = spotlight.querySelector("img");
  const title = spotlight.querySelector("h3");
  const description = spotlight.querySelector("p");
  const launchButton = spotlight.querySelector(".launch");
  const launchText = launchButton.firstChild;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  let selected = -1;
  let animation;

  // The source links remain a complete catalogue without JavaScript.
  const apps = [...list.children].map((item, index) => {
    const link = item.querySelector(".app-link");
    const image = link.querySelector("img");
    const name = link.querySelector("h3").textContent;
    const detail = link.querySelector("p").textContent;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "app-option";
    button.id = `app-choice-${index}`;
    button.setAttribute("role", "tab");
    button.setAttribute("aria-controls", spotlight.id);
    button.setAttribute("aria-selected", "false");
    button.tabIndex = -1;
    button.append(image, document.createTextNode(name));
    item.setAttribute("role", "presentation");
    item.replaceChildren(button);
    button.addEventListener("click", () => select(index));
    return { name, detail, src: image.getAttribute("src"), href: link.getAttribute("href"), family: link.dataset.family, button };
  });

  function select(index, { focus = false, animate = true } = {}) {
    const { button, name, detail, src, href, family } = apps[index];
    if (selected !== index) {
      const previous = apps[selected]?.button;
      if (previous) {
        previous.setAttribute("aria-selected", "false");
        previous.tabIndex = -1;
      }
      button.setAttribute("aria-selected", "true");
      button.tabIndex = 0;
      animation?.cancel();
      icon.src = src;
      title.textContent = name;
      description.textContent = detail;
      launchButton.href = href;
      launchText.textContent = `Open ${name} `;
      spotlight.dataset.family = family;
      spotlight.setAttribute("aria-labelledby", button.id);
      selected = index;
      if (animate && !reduced.matches) {
        animation = spotlight.animate?.(
          [{ opacity: .68, transform: "translateY(4px)" }, { opacity: 1, transform: "translateY(0)" }],
          { duration: 240, easing: "cubic-bezier(.2,.75,.25,1)" }
        );
      }
    }
    if (focus) button.focus();
  }

  list.setAttribute("role", "tablist");
  list.setAttribute("aria-label", "Explore InFlite apps");
  spotlight.setAttribute("role", "tabpanel");
  spotlight.tabIndex = 0;
  select(0, { animate: false });
  catalogue.dataset.ready = "";
  spotlight.hidden = false;

  list.addEventListener("keydown", event => {
    const index = apps.findIndex(app => app.button === event.target);
    if (index < 0) return;
    let next;
    switch (event.key) {
      case "ArrowLeft": next = index - 1; break;
      case "ArrowRight": next = index + 1; break;
      case "ArrowUp": next = index - 5; break;
      case "ArrowDown": next = index + 5; break;
      case "Home": next = 0; break;
      case "End": next = apps.length - 1; break;
      default: return;
    }
    event.preventDefault();
    select((next + apps.length) % apps.length, { focus: true });
  });
  reduced.addEventListener("change", () => {
    if (reduced.matches) animation?.cancel();
  });
}
