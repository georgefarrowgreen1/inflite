// Desktop packing without moving nodes or changing keyboard order. The browser
// places tiles in row order; small row spans let the next tile fill available space.
const running = new WeakMap();
const GAP = 20, ROW = 4, MIN_WIDTH = 320, MAX_COLUMNS = 4;

export function arrangeToday(root) {
  if (!root || typeof ResizeObserver === "undefined") return () => {};
  if (running.has(root)) return running.get(root);
  const desktop = matchMedia("(min-width: 1100px)");
  const observed = new Set();
  let frame = 0, inlineSize = -1, stopped = false;
  const schedule = () => { if (!stopped && !frame) frame = requestAnimationFrame(layout); };
  const resize = new ResizeObserver((entries) => {
    let changed = false;
    for (const entry of entries) {
      if (entry.target !== root) { changed = true; continue; }
      const size = entry.borderBoxSize?.[0]?.inlineSize ?? entry.contentRect.width;
      if (Math.abs(size - inlineSize) > 0.1) { inlineSize = size; changed = true; }
    }
    if (changed) schedule();
  });
  const changes = new MutationObserver((records) => {
    if (records.some((r) => r.target !== root || r.type === "childList" || r.attributeName === "hidden")) schedule();
  });
  function clear() {
    root.classList.remove("today-packed");
    root.style.removeProperty("--today-columns");
    root.style.removeProperty("--today-summary-columns");
    for (const el of observed) { resize.unobserve(el); el.style.removeProperty("--tile-rows"); }
    observed.clear();
  }
  function layout() {
    frame = 0;
    if (!desktop.matches) { clear(); return; }
    if (!root.clientWidth) return; // Another screen is open. ResizeObserver resumes on return.
    const tiles = [...root.children].flatMap((el) => el.id === "rest" || el.id === "side" ? [...el.children] : [el])
      .filter((el) => !el.matches(".slabel, [hidden]") && el.getClientRects().length && el.offsetHeight);
    const wanted = new Set(tiles);
    for (const el of observed) if (!wanted.has(el)) { resize.unobserve(el); el.style.removeProperty("--tile-rows"); observed.delete(el); }
    const css = getComputedStyle(root);
    const width = root.clientWidth - parseFloat(css.paddingLeft) - parseFloat(css.paddingRight);
    const columns = Math.max(1, Math.min(MAX_COLUMNS, Math.floor((width + GAP) / (MIN_WIDTH + GAP))));
    root.style.setProperty("--today-columns", String(columns));
    root.style.setProperty("--today-summary-columns", String(Math.min(2, columns)));
    // Widths are set before measuring. Heights stay natural, even when a disclosure,
    // image, font or asynchronously loaded card changes its size.
    const spans = tiles.map((el) => Math.ceil((el.offsetHeight + GAP) / ROW));
    tiles.forEach((el, i) => {
      const span = String(spans[i]);
      if (el.style.getPropertyValue("--tile-rows") !== span) el.style.setProperty("--tile-rows", span);
      if (!observed.has(el)) { observed.add(el); resize.observe(el); }
    });
    if (!root.classList.contains("today-packed")) root.classList.add("today-packed");
  }
  resize.observe(root);
  changes.observe(root, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ["hidden", "class", "open"] });
  desktop.addEventListener("change", schedule);
  addEventListener("resize", schedule, { passive: true });
  document.fonts?.ready.then(schedule, () => {});
  schedule();
  const stop = () => {
    stopped = true;
    cancelAnimationFrame(frame); resize.disconnect(); changes.disconnect();
    desktop.removeEventListener("change", schedule); removeEventListener("resize", schedule); clear(); running.delete(root);
  };
  running.set(root, stop);
  return stop;
}
