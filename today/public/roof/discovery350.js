// Each app publishes independently. Only an explicit file selection reads its bytes.
import { REGISTRY } from './router.js';
const clean = (s, n = 180) => typeof s === 'string' ? s.replace(/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g, ' ').trim().slice(0, n) : '';
const objectId = /^[\w:.-]{1,200}$/;
const dates = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });

export async function discover(F, { app, query, lease = {}, files, searchApp, openApp, runIntent }) {
  const owner = F.session.view?.user?.id;
  const owned = () => !!owner && !F.signal.aborted && F.session.view?.user?.id === owner &&
    (app === 'files' || F.session.apps?.[app] && (app !== 'mail' || F.session.view.apps?.mail === true));
  const live = () => owned() && !lease.signal?.aborted && (!lease.current || lease.current());
  const q = clean(query, 160);
  if (q.length < 2 || !live()) return [];
  await new Promise(resolve => setTimeout(resolve, 180));
  if (!live()) return [];
  const name = REGISTRY[app]?.name || 'Files';
  const fallback = (title, sub) => [{ title, sub, app, icon: app, offer: true, run: () => owned() && (app === 'files' ? files.open(q) : openApp(app)) }];
  try {
    if (app === 'files') {
      const entries = items => items.map(file => ({
        title: file.name, sub: ['Files', file.folderName || (file.parentId ? '' : 'My Drive'), file.modifiedAt && 'Updated ' + dates.format(file.modifiedAt)].filter(Boolean).join(' · '),
        app, icon: app, key: file.key, updatedAt: file.modifiedAt,
        preview: file.kind === 'file' ? async context => {
          const { previewFile } = await import('./search-file.js');
          if (owned() && context.current()) await previewFile(F, files, file, context);
        } : null,
        run: () => owned() && files.open('', { kind: 'drive', folderId: file.kind === 'folder' ? file.id : file.parentId, view: 'folder' })
      }));
      const items = await files.searchAccount(q, { signal: lease.signal, current: live });
      return live() ? entries(items) : [];
    }
    const answer = await searchApp(app, q, { signal: lease.signal, current: live });
    if (!live() || answer?.status === 'disabled') return [];
    if (answer?.status !== 'ready') {
      if (answer?.status === 'locked') return fallback('Unlock ' + name, 'Unlock to search your private data');
      if (answer?.status === 'signin') return fallback('Sign in to ' + name, 'Continue in the app');
      return fallback('Open ' + name, 'Search could not finish · retry in the app');
    }
    return (answer.entries || []).flatMap(e => {
      if (!clean(e?.title)) return [];
      const path = typeof e.path === 'string' && e.path.startsWith('/' + app + '/') && !/[?\\\u0000-\u001f]/.test(e.path) ? e.path : null;
      const intent = typeof e.intent === 'string' && /^[a-z][a-z-]{1,47}$/.test(e.intent) && (!e.objectId || objectId.test(e.objectId)) ? e.intent : null;
      if (!path && !intent) return [];
      return [{ title: clean(e.title), sub: [name, clean(e.sub, 180)].filter(Boolean).join(' · '), app, icon: app === 'chats' ? 'chat' : app,
        key: path || [app, intent, e.objectId || ''].join(':'), detail: true,
        run: () => owned() && (path ? openApp(app, path) : runIntent(app, intent, e.objectId)) }];
    });
  } catch {
    return live() ? fallback('Search ' + name, 'Open ' + name + ' to retry') : [];
  }
}

const sourceOf = e => e.app || (e.icon === 'chat' ? 'chats' : e.icon);
const appName = app => REGISTRY[app]?.name || (app === 'files' ? 'Files' : null);

export function createDiscoveryView(F, { list, sheet, redraw, select, restore, resetSelection }) {
  const ui = F.ui;
  const filters = ui.el("div", { class: "ifl-search-filters", role: "group", "aria-label": "Filter by app", hidden: true });
  let active = "";
  function filter(groups) {
    const sources = new Set(groups.flatMap(g => g.entries.filter(e => !e.offer).map(sourceOf)).filter(appName));
    if (!sources.has(active)) active = "";
    const names = ["", ...[...sources].sort((a, b) => appName(a).localeCompare(appName(b)))];
    filters.hidden = sources.size < 2 && !active;
    if (filters.dataset.sources !== names.join("|")) {
      filters.dataset.sources = names.join("|");
      filters.replaceChildren(...names.map(app => ui.el("button", { type: "button", text: appName(app) || "All", data: { source: app }, on: { click() {
        active = app; resetSelection(); list.scrollTop = 0; redraw();
      } } })));
    }
    for (const b of filters.children) b.setAttribute("aria-pressed", String(b.dataset.source === active));
    return active ? groups.map(g => ({ ...g, entries: g.entries.filter(e => sourceOf(e) === active) })) : groups;
  }
  function open(e, row) {
    const h = sheet(), scroll = list.scrollTop, controller = new AbortController();
    const current = () => !controller.signal.aborted && !F.signal.aborted && !h.closed;
    const panel = ui.el("div", { class: "ifl-search-detail" }, ui.el("p", { text: e.sub }));
    select(row);
    h.push({ page: "result", title: e.title, body: panel, onLeave() {
      controller.abort();
      queueMicrotask(() => { if (!h.closed) { restore(row); list.scrollTop = scroll; } });
    }, acts: [{ label: e.preview ? "Show in folder" : "Open in " + appName(e.app), run: () => { h.now(); e.run(); } }] });
    h.el.querySelector("[data-back]")?.setAttribute("aria-label", "Back to results");
    if (e.preview) Promise.resolve(e.preview({ panel, current, signal: controller.signal })).catch(error => {
      if (current()) panel.append(ui.el("p", { role: "status", text: error.message || "Preview unavailable." }));
    });
  }
  return { filters, filter, open, reset() { active = ""; filters.hidden = true; } };
}
