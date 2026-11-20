const preview = document.querySelector(".product-preview");
const dock = preview?.querySelector(".preview-dock");

if (dock) {
  const tabs = Array.from(dock.querySelectorAll('[role="tab"]'));
  const scenes = tabs.map(tab => document.getElementById(tab.getAttribute("aria-controls")));
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  let active = 0;
  let handoff;

  function clearHandoff() {
    if (!handoff) return;
    const { previous, next, exit, entry } = handoff;
    handoff = null;
    delete previous.dataset.previewExiting;
    delete next.dataset.previewEntering;
    exit.cancel();
    entry.cancel();
  }

  function animateHandoff(previous, next, direction, from) {
    previous.dataset.previewExiting = "";
    next.dataset.previewEntering = "";
    const exit = previous.animate([
      from,
      { opacity: 0, transform: `translateX(${-direction * 15}px) scale(.975)` }
    ], { duration: 245, easing: "cubic-bezier(.4,0,.3,1)", fill: "forwards" });
    const entry = next.animate([
      { opacity: .12, transform: `translateX(${direction * 18}px) scale(.985)` },
      { opacity: 1, transform: "translateX(0) scale(1)" }
    ], { duration: 470, easing: "cubic-bezier(.19,.78,.23,1)" });
    const pair = handoff = { previous, next, exit, entry };
    exit.onfinish = () => {
      if (handoff === pair) delete previous.dataset.previewExiting;
    };
    entry.onfinish = () => {
      if (handoff === pair) clearHandoff();
    };
  }

  function show(scene, visible) {
    scene.hidden = !visible;
    scene.inert = !visible;
    scene.tabIndex = visible ? 0 : -1;
    if (visible) scene.removeAttribute("aria-hidden");
    else scene.setAttribute("aria-hidden", "true");
  }

  function select(index, focus = false) {
    const tab = tabs[index];
    if (index !== active) {
      const direction = index > active ? 1 : -1;
      const previous = scenes[active], next = scenes[index];
      const animate = !reduced.matches && typeof next.animate === "function";
      // Capture the panel as it is if another press interrupts its entrance.
      const style = animate && handoff ? getComputedStyle(previous) : null;
      const from = style ? { transform: style.transform, opacity: style.opacity } : { transform: "none", opacity: 1 };
      clearHandoff();
      if (previous.contains(document.activeElement)) tab.focus({ preventScroll: true });
      show(previous, false);
      tabs[active].setAttribute("aria-selected", "false");
      tabs[active].tabIndex = -1;
      show(next, true);
      tab.setAttribute("aria-selected", "true");
      tab.tabIndex = 0;
      active = index;
      preview.dataset.previewApp = next.id.slice("preview-".length);
      if (animate) animateHandoff(previous, next, direction, from);
    }
    if (focus) tab.focus({ preventScroll: true });
  }

  tabs.forEach((tab, index) => {
    const scene = scenes[index];
    scene.setAttribute("role", "tabpanel");
    scene.setAttribute("aria-labelledby", tab.id);
    scene.removeAttribute("aria-label");
    show(scene, index === active);
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
    if (reduced.matches) clearHandoff();
  });
  preview.dataset.previewReady = "";
  dock.hidden = false;
}
