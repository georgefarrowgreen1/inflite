// Apps: a compact launcher with this account's quick links on this device. Status
// lines come from Today's answer; app destinations and Mail lenses retain the hub's
// existing switches and standalone fallbacks. Chats has its own navigation tab.
const APPS = [
  { app: "weather", name: "Weather", what: "A forecast that explains itself", links: [["Radar", "radar", "radar"], ["Warnings", "warnings", "warn"]] },
  { app: "fitness", name: "Fitness", what: "Your training, a day at a time", links: [["Activities", "activities", "run"], ["Progress", "progress", "trend"]] },
  { app: "markets", name: "Markets", what: "Your money, said simply", links: [["Holdings", "holdings", "layers"], ["News", "news", "file"]] },
  { app: "mail", name: "Mail", what: "For you only", only: (view) => view?.apps?.mail === true,
    links: [["People", "people", "people"], ["Updates", "updates", "inbox"], ["Later", "later", "clock"], ["Done", "done", "check"]] },
];
const LIMIT = 4;
const DEFAULTS = ["weather:radar", "fitness:activities", "markets:holdings", "mail:people"];
const KNOWN = new Set(APPS.flatMap((a) => a.links.map(([, section]) => `${a.app}:${section}`)));
// Local shortcut glyphs keep the generated shared menu untouched.
const GLYPHS = {
  radar: 'M21 12a9 9 0 1 1-9-9 9 9 0 0 1 9 9M17 12a5 5 0 1 1-5-5 5 5 0 0 1 5 5M12 12l6.4-6.4',
  run: 'M17 4a2 2 0 1 1-4 0 2 2 0 0 1 4 0M12 8l4 3 4-1M12 8l-4 3-3-1M12 8l-2 6 5 3-2 5M10 14l-4 5H2',
  layers: 'M12 3l10 5-10 5L2 8ZM2 12l10 5 10-5M2 16l10 5 10-5',
  people: 'M12 7a3 3 0 1 1-6 0 3 3 0 0 1 6 0M2 21v-2a7 7 0 0 1 14 0v2M16 4a3 3 0 0 1 0 6M19 14a5 5 0 0 1 3 5v2',
};
function quickIcon(ui, name) {
  if (!GLYPHS[name]) return ui.icon(name);
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  for (const [k, v] of Object.entries({ viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": "1.8", "stroke-linecap": "round", "stroke-linejoin": "round" })) svg.setAttribute(k, v);
  const path = document.createElementNS(svg.namespaceURI, "path");
  path.setAttribute("d", GLYPHS[name]); svg.append(path);
  return ui.el("span", { class: "ifl-glyph", "aria-hidden": "true" }, svg);
}
const switchedOn = (ctx, app) => { const s = ctx.frame?.session; return !!(s?.hub === true && s.apps?.[app] === true); };
function readChoices(key) {
  if (!key) return null;
  try {
    const value = JSON.parse(localStorage.getItem(key));
    if (!Array.isArray(value)) return null;
    const clean = [...new Set(value.filter((id) => typeof id === "string" && KNOWN.has(id)))].slice(0, LIMIT);
    return value.length && !clean.length ? null : clean;
  } catch { return null; }
}

const renders = new WeakMap();
export function drawApps(root, ctx = {}) {
  if (!root || !ctx.ui) return;
  const { ui } = ctx, { el } = ui, owner = ctx.view?.user?.id;
  const previous = renders.get(root);
  // Same-account refreshes wait until the editor closes, keeping its draft and
  // focus intact. A new account immediately releases the old account's editor.
  if (previous?.editing && !previous.editing.closed && previous.owner === owner && previous.current()) {
    previous.latest = ctx;
    return;
  }
  previous?.editing?.close();
  const state = { owner, latest: ctx, editing: null };
  renders.set(root, state);
  const current = () => renders.get(root) === state && root.isConnected && ctx.current?.() !== false;
  state.current = current;
  const lines = ctx.answer?.v === 2 && typeof ctx.answer.apps === "object" ? ctx.answer.apps : {};
  const href = (app, section) => ctx.href?.(app, section) || `/${app}/${section ? "#" + section : ""}`;
  const shown = APPS.filter((a) => !a.only || a.only(ctx.view));
  const choices = shown.flatMap((a) => a.app === "mail" && !switchedOn(ctx, "mail") ? [] : a.links.map(([label, section, icon]) =>
    ({ id: `${a.app}:${section}`, app: a.app, name: a.name, label, section, icon })));
  const available = new Map(choices.map((q) => [q.id, q]));
  const defaults = DEFAULTS.filter((id) => available.has(id));
  const key = owner ? `today:quick:${owner}` : null;
  let chosen = readChoices(key) ?? defaults;
  const list = ui.list(shown.map((a) => ui.row({ lead: { app: a.app }, title: a.name,
    sub: typeof lines?.[a.app] === "string" && lines[a.app] ? lines[a.app] : a.what,
    href: href(a.app), trail: "chevron" })));
  list.classList.add("apps-list");
  list.setAttribute("aria-label", "Apps");
  const grid = el("div", { class: "apps-shortcuts" });
  const drawQuick = () => {
    const links = chosen.map((id) => available.get(id)).filter(Boolean).map((q) => el("a", {
      class: "apps-shortcut", href: href(q.app, q.section), data: { quick: q.id }, "aria-label": `${q.label} in ${q.name}`,
    }, quickIcon(ui, q.icon), el("span", { text: q.label })));
    grid.replaceChildren(...(links.length ? links : [el("p", { class: "apps-empty", text: "Add shortcuts to the places you open most." })]));
  };
  function edit() {
    if (!current() || state.editing || !ctx.frame?.sheet) return;
    // Preserve choices for temporarily unavailable apps until the user explicitly
    // saves a new selection. Opening or cancelling the editor never changes them.
    let draft = chosen.filter((id) => available.has(id));
    const status = el("p", { class: "apps-choice-count", role: "status", "aria-live": "polite" });
    const rows = [];
    const sync = () => {
      status.textContent = `${draft.length} of ${LIMIT} selected${draft.length === LIMIT ? ". Turn one off to add another." : "."}`;
      for (const [id, row] of rows) {
        const input = row.querySelector("input");
        input.checked = draft.includes(id);
        input.disabled = !input.checked && draft.length >= LIMIT;
      }
    };
    for (const q of choices) {
      const row = ui.row({ title: q.label, sub: q.name, lead: { app: q.app }, trail: "switch", checked: draft.includes(q.id),
        onChange(on) {
          draft = draft.filter((id) => id !== q.id);
          if (on && draft.length < LIMIT) draft.push(q.id);
          sync();
        } });
      row.dataset.quick = q.id;
      rows.push([q.id, row]);
    }
    const body = el("div", { class: "apps-editor" },
      el("p", { class: "apps-choice-help", text: "Choose up to four shortcuts. Saved for this account on this device." }),
      status, ui.list(rows.map(([, row]) => row)),
      ui.btn("Reset to defaults", { small: true, run: () => { draft = [...defaults]; sync(); } }));
    sync();
    const h = ctx.frame.sheet.open({ sheet: "quick-access", title: "Quick access", body, app: "inflite",
      acts: [
        { label: "Cancel", run: () => h.close() },
        { label: "Done", primary: true, run: () => {
          if (!current()) { h.close(); return; }
          if (key) {
            try { localStorage.setItem(key, JSON.stringify(draft)); }
            catch { status.textContent = "Couldn’t save shortcuts on this device. Please try again."; return; }
          }
          chosen = [...draft]; drawQuick(); h.close();
        } },
      ], onClose: () => {
        state.editing = null;
        if (state.latest !== ctx && current()) {
          const refocus = root.contains(document.activeElement);
          drawApps(root, state.latest);
          if (refocus) root.querySelector(".apps-edit")?.focus({ preventScroll: true });
        }
      } });
    state.editing = h;
  }
  const quick = el("section", { class: "apps-quick", "aria-labelledby": "apps-quick-title" },
    el("div", { class: "apps-quick-head" }, el("h2", { id: "apps-quick-title", text: "Quick access" }),
      el("button", { class: "apps-edit", type: "button", text: "Edit", "aria-label": "Edit quick access", on: { click: edit } })), grid);
  drawQuick();
  root.replaceChildren(el("div", { class: "apps-layout" }, list, quick));
}
