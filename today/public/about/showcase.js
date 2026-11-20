const preview = document.querySelector(".product-preview");
const dock = preview?.querySelector(".preview-dock");

if (dock) {
  const tabs = Array.from(dock.querySelectorAll('[role="tab"]'));
  const scenes = tabs.map(tab => document.getElementById(tab.getAttribute("aria-controls")));
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  let active = 0;
  let entrance;

  function select(index, focus = false) {
    const tab = tabs[index];
    if (index !== active) {
      const forward = index > active;
      entrance?.cancel();
      scenes[active].hidden = true;
      tabs[active].setAttribute("aria-selected", "false");
      tabs[active].tabIndex = -1;

      const scene = scenes[index];
      scene.hidden = false;
      tab.setAttribute("aria-selected", "true");
      tab.tabIndex = 0;
      active = index;
      preview.dataset.previewApp = scene.id.slice("preview-".length);

      if (!reduced.matches) {
        entrance = scene.animate([
          { opacity: .43, transform: `translate3d(${forward ? 12 : -12}px, 3px, 0)` },
          { opacity: 1, transform: "translate3d(0, 0, 0)" }
        ], { duration: 375, easing: "cubic-bezier(.2,.75,.23,1)" });
      }
    }
    if (focus) tab.focus({ preventScroll: true });
  }

  tabs.forEach((tab, index) => {
    const scene = scenes[index];
    scene.setAttribute("role", "tabpanel");
    scene.setAttribute("aria-labelledby", tab.id);
    scene.removeAttribute("aria-label");
    scene.tabIndex = 0;
    tab.addEventListener("click", () => select(index));
  });

  dock.addEventListener("keydown", event => {
    const index = tabs.indexOf(event.target);
    if (index < 0) return;
    let next;
    switch (event.key) {
      case "ArrowRight": next = (index + 1) % tabs.length; break;
      case "ArrowLeft": next = (index + tabs.length - 1) % tabs.length; break;
      case "Home": next = 0; break;
      case "End": next = tabs.length - 1; break;
      default: return;
    }
    event.preventDefault();
    select(next, true);
  });

  reduced.addEventListener("change", () => {
    if (reduced.matches) entrance?.cancel();
  });
  dock.hidden = false;
}
