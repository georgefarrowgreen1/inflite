// InFlite's header (One roof, spec §3.5): one persistent element in #hd. Row 1 is the shared block's own IFL.header()
// (header.ifh: .ifh-me, .ifh-t > h1.ifh-name + .ifh-line, .ifh-acts), so the copied menu.css styles it and a menu.js
// change reaches it; the framework adds the crumb (above the title), Back (icon-only, in the photo's place on app
// screens) and row 2, the section switcher. set(spec) patches it: never drawn again per tap.
// createHeader(host, F, { me, onMe }) → Header = { el, set(spec), lens(), destroy() }
//   spec = { back: { label } | null, crumb: { text, app? } | null, title, compactTitle?, pick: { label, run } | null,
//            line: string | Node, acts: [{ icon, label, run, word? }], sections: [[id, label]] | null, section,
//            badges?: { [sectionId]: n | { n, say } }, onSection(id) }
//   Search is always the first act (data-act=search), then up to two; each act a button.ifh-act, data-act = its icon.
//   The switcher is a tablist with manual activation (arrows move the focus, Enter or Space chooses), a sliding lens
//   (aria-hidden) recomputed on every set, on resize and once the fonts are in, and a count per section
//   (.ifl-sec-badge; the tab's name then "Warnings, 2 in force").
//   Compaction: --p from the shared block's IFL.watch/settle over the first 64 px; past half way the title shows
//   compactTitle (class ifh-compact); html.ifl-fill (Radar) leaves it as it is. --hd-h is published from a ResizeObserver.
import { el, icon } from "./ui.js";

export function createHeader(host, F, { me, onMe } = {}) {
  const IFL = globalThis.IFL;
  if (!host || !IFL?.header) return { el: host || null, set() {}, lens() {}, destroy() {} };
  const hd = IFL.header({ me: "", title: "", line: "", acts: [], cls: "ifl-hd" });
  const $ = (s) => hd.querySelector(s);
  const meB = $(".ifh-me"), tBox = $(".ifh-t"), h1 = $("h1.ifh-name"), line = $(".ifh-line"), acts = $(".ifh-acts");
  const m = me?.();
  if (m) meB.replaceChildren(m);
  if (onMe) { meB.classList.remove("out"); meB.setAttribute("aria-label", "You and your apps"); meB.setAttribute("aria-haspopup", "dialog"); }
  meB.addEventListener("click", (e) => onMe?.(e.currentTarget));
  const back = el("button", { class: "ifl-back", type: "button", "aria-label": "Back", hidden: true }, icon("back"));
  back.addEventListener("click", () => F?.nav?.back());
  meB.after(back);
  const crumb = el("span", { class: "ifh-crumb" });
  tBox.prepend(crumb);
  h1.tabIndex = -1;
  const full = el("span", { class: "ifh-ttl" });
  const pick = el("button", { class: "ifh-pick", type: "button", "aria-haspopup": "dialog" }, full);
  pick.insertAdjacentHTML("beforeend", IFL.glyph("down").replace("<svg ", '<svg class="ifh-down" '));
  const plain = el("span", { class: "ifh-plain" });
  const segs = el("div", { class: "ifl-segs", role: "tablist", "aria-label": "Sections", hidden: true });
  const lensEl = el("span", { class: "ifl-lens", "aria-hidden": "true" });
  const row2 = el("div", { class: "ifl-row2", hidden: true }, segs);
  hd.append(row2);
  host.replaceChildren(hd);
  let small = false, cur = {}, actKey = "", secKey = "", runs = {};

  pick.addEventListener("click", () => cur.pick?.run?.(pick));
  acts.addEventListener("click", (e) => {
    const b = e.target.closest(".ifh-act");
    if (!b) return;
    const k = b.dataset.act;
    if (k === "search") return F?.search?.open();
    runs[k]?.(b);
  });
  segs.addEventListener("click", (e) => { const b = e.target.closest("[role=tab]"); if (b) choose(b.dataset.sec); });
  segs.addEventListener("keydown", (e) => {
    const tabs = [...segs.querySelectorAll("[role=tab]")], i = tabs.indexOf(document.activeElement);
    if (i < 0) return;
    let j = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 }[e.key];
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); return choose(tabs[i].dataset.sec); }
    if (j == null) return;
    e.preventDefault();
    j = (j + tabs.length) % tabs.length;
    for (const t of tabs) t.tabIndex = -1;
    tabs[j].tabIndex = 0; tabs[j].focus();
  });
  function choose(id) {
    if (id === cur.section) return;
    cur.onSection?.(id);
  }

  function title(t, c) {
    const want = (small && c) || t || "";
    if (full.textContent !== want) full.textContent = want;
    const box = cur.pick ? pick : plain;
    if (full.parentNode !== box) box.prepend(full);
    if (h1.firstChild !== box) h1.replaceChildren(box);
    if (cur.pick) pick.setAttribute("aria-label", cur.pick.label || "Choose");
    h1.setAttribute("aria-label", t || "");
  }
  function setActs(list) {
    list = [{ icon: "search", label: "Search" }, ...(list || []).filter(Boolean).slice(0, 2)];
    runs = {};
    for (const a of list) if (a.run) runs[a.icon] = a.run;
    const k = list.map((a) => `${a.icon}|${a.label}|${a.word || ""}`).join(";");
    if (k === actKey) return;
    actKey = k;
    acts.replaceChildren(...list.map((a) => {
      const b = el("button", { class: "ifh-act", type: "button", "aria-label": a.label, title: a.label, data: { act: a.icon } });
      const g = icon(a.icon);
      if (!a.word && g.firstChild) b.append(g);
      else { b.dataset.word = ""; b.textContent = a.word || a.icon[0].toUpperCase() + a.icon.slice(1); }
      return b;
    }));
  }
  function setSecs(list, section, badges = {}) {
    const k = JSON.stringify(list || null);
    if (k !== secKey) {
      secKey = k;
      segs.replaceChildren(lensEl, ...(list || []).map(([id, l]) => el("button", { class: "ifl-sec", type: "button", role: "tab", id: `ifl-sec-${id}`, data: { sec: id } }, el("span", { class: "ifl-sec-l", text: l }))));
    }
    row2.hidden = segs.hidden = !list;
    hd.classList.toggle("has-secs", !!list);
    for (const b of segs.querySelectorAll("[role=tab]")) {
      const id = b.dataset.sec, on = id === section, l = (list.find((s) => s[0] === id) || [])[1];
      b.setAttribute("aria-selected", String(on));
      b.tabIndex = on ? 0 : -1;
      const v = badges?.[id], n = typeof v === "object" && v ? v.n : v;
      let bd = b.querySelector(".ifl-sec-badge");
      if (n > 0) {
        if (!bd) b.append(bd = el("span", { class: "ifl-sec-badge", "aria-hidden": "true" }));
        bd.textContent = String(n);
        b.setAttribute("aria-label", `${l}, ${(typeof v === "object" && v.say) || `${n} in force`}`);
      } else { bd?.remove(); b.removeAttribute("aria-label"); }
    }
    lens();
  }
  // the lens under the chosen section, from its place in the row; the row scrolled to keep it in sight
  function lens() {
    const b = segs.querySelector("[aria-selected=true]");
    if (!b || segs.hidden) return;
    lensEl.style.setProperty("--lx", `${b.offsetLeft}px`);
    lensEl.style.setProperty("--lw", `${b.offsetWidth}px`);
    segs.classList.toggle("over", segs.scrollWidth > segs.clientWidth + 1);
    const l = b.offsetLeft, r = l + b.offsetWidth;
    if (l < segs.scrollLeft) segs.scrollLeft = l - 12;
    else if (r > segs.scrollLeft + segs.clientWidth) segs.scrollLeft = r - segs.clientWidth + 12;
  }

  function set(spec = {}) {
    cur = { ...spec };
    const onApp = !!spec.back;
    // (only what's different is touched: the same header set again, as a screen and its module each do, changes nothing
    // on screen, so nothing flickers as a section changes)
    back.hidden = !onApp; meB.hidden = onApp;
    if (onApp) back.setAttribute("aria-label", spec.back.label || "Back");
    const c = spec.crumb, ck = (c?.app || "") + (c?.text || "");
    if (crumb.dataset.k !== ck) { crumb.dataset.k = ck; crumb.replaceChildren(...(c?.app ? [icon(null, { app: c.app, size: 16 })] : []), c?.text || ""); }
    crumb.hidden = !c?.text;
    hd.dataset.app = c?.app || "inflite";
    title(spec.title, spec.compactTitle);
    if (spec.line?.nodeType) line.replaceChildren(spec.line);
    else if (line.textContent !== (spec.line || "") || line.firstElementChild) line.textContent = spec.line || "";
    setActs(spec.acts);
    setSecs(spec.sections || null, spec.section, spec.badges);
    compact();
  }

  // compact past half way (--p from the shared block), and the height published for screens that fill the window
  function compact() {
    // (a screen that fills the window (Radar) keeps the header as it is: it never shrinks or grows on the way in or out)
    if (document.documentElement.classList.contains("ifl-fill")) return;
    const s = small ? scrollY > 8 : scrollY > 28; // (the shared block's own hysteresis: compact past 28px, back above 8px)
    if (s === small) return;
    small = s;
    hd.classList.toggle("ifh-compact", s);
    title(cur.title, cur.compactTitle);
  }
  addEventListener("scroll", compact, { passive: true });
  IFL.watch?.();
  const onResize = () => lens();
  addEventListener("resize", onResize);
  document.fonts?.ready?.then(lens, () => {});
  let ro = null;
  if (globalThis.ResizeObserver) {
    ro = new ResizeObserver(() => document.documentElement.style.setProperty("--hd-h", `${hd.offsetHeight}px`));
    ro.observe(hd);
  }
  return {
    el: hd, set, lens, compact,
    destroy() { removeEventListener("scroll", compact); removeEventListener("resize", onResize); ro?.disconnect(); },
  };
}
