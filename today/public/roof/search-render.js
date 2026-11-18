// Loaded on the first typed query. Opening Search can focus the field synchronously.
import { REGISTRY } from "./router.js";
import { match } from "./search.js";
const SHOW = 3;
// (and more ways in, as you type)
const ALSO = [["Rain radar", "weather", "/weather/#radar"], ["16-day forecast", "weather", "/weather/#days"], ["Add a friend", "chats", "/chats/#add"], ["Friend requests", "chats", "/chats/#requests"]];

// the Apps provider: every module (REGISTRY) and app beside (connectors.js STATIC) with its sections; a module that's
// switched off is listed as STATIC has it (its hub page's), and an app's sections only where the account has the app
// (view.apps[app] !== false); Mail, the site admin's alone, not listed at all for anyone else
export function appsProvider(F, yours) {
  let st = null;
  const on = (a) => !!F.session?.apps?.[a], has = (a) => F.session?.view?.apps?.[a] !== false;
  const mod = (R) => ({ app: R.app, name: R.name, icon: R.app, href: R.path, links: R.sections.slice(1).map(([id, l]) => [l, R.path + "#" + id]) });
  const load = () => (st ||= import("./connectors.js").then((c) => c.STATIC, () => ({}))).then((S) =>
    [...Object.values(REGISTRY).filter((R) => !S[R.app]).map(mod), ...Object.values(S).map((c) => (REGISTRY[c.app] && on(c.app) ? mod(REGISTRY[c.app]) : c))]
      .filter((c) => yours(c.app)).flatMap((c) => [{ title: c.name, sub: "App", icon: c.icon, href: c.href }, ...(has(c.app) ? c.links || [] : []).map(([l, href]) => ({ title: `${c.name} · ${l}`, sub: c.name, icon: c.icon, href })),
        ...(has(c.app) ? ALSO.filter(([, a]) => a === c.app).map(([title, , href]) => ({ title, sub: c.name, icon: c.icon, href })) : [])]));
  return {
    id: "apps", group: "Apps", order: 10,
    search: (q) => load().then((a) => (q.trim() ? a.filter((e) => match(q, e.title)) : a)),
  };
}

// (a title with what matched in bold: its letters as text, never markup)
export function highlight(ui, r, title, hits) {
  const b = r.querySelector(".ifl-tx b");
  if (!b || !hits?.length) return r;
  const kids = [];
  let k = 0;
  for (const [a, z] of hits) { if (a > k) kids.push(title.slice(k, a)); kids.push(ui.el("mark", { class: "ifl-hit", text: title.slice(a, z) })); k = z; }
  if (k < title.length) kids.push(title.slice(k));
  b.replaceChildren(...kids);
  return r;
}

export function resultGroups(r, { ui, input, group, rowOf, wide, draw }) {
  const showAll = (g) => {
    const b = ui.el("button", { class: "ifl-sr-more", type: "button", text: "Show all", "aria-label": `Show all ${g.group || ""}`.trim(), "aria-expanded": "false" });
    b.addEventListener("click", () => { wide.add(g.id); draw(); input.focus({ preventScroll: true }); });
    return b;
  };
  const gs = [];
  if (r.top) gs.push(group("top", "Top hit", [rowOf(r.top.e, "top", r.top.hits)], null, "top"));
  for (const g of r.groups) {
    const full = wide.has(g.id), shown = full ? g.entries : g.entries.slice(0, SHOW);
    gs.push(group(g.id, g.group || g.id, shown.map((x, i) => rowOf(x.e, `${g.id}-${i}`, x.hits)), !full && g.all > SHOW ? showAll(g) : null));
  }
  if (r.more.length) gs.push(group("more", "More", r.more.map((x, i) => rowOf(x.e, `more-${i}`))));
  return gs;
}
