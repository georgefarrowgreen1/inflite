// Each app publishes independently. Only an explicit file selection reads its bytes.
import { createSystemClient } from './system-client.js';
import { REGISTRY } from './router.js';
const clean = (s, n = 180) => typeof s === 'string' ? s.replace(/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g, ' ').trim().slice(0, n) : '';
const objectId = /^[\w:.-]{1,200}$/;
const dates = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });

export const isRecordApp = app => ['people', 'notes', 'calendar'].includes(app);

// A read-only account request. Typing never starts an editor, offline journal or write pump.
export async function searchRecords(F, app, q, lease, store) {
  if (!isRecordApp(app) || !lease.current()) return { status: 'disabled', entries: [] };
  const client = createSystemClient(F, { prefix: '/api/organise/' });
  const { records } = await client.request('list', { method: 'POST', body: { kind: app, q, limit: 20 }, ...lease });
  const entries = records.flatMap(record => {
    const local = store?.view(record.id);
    const item = local?.pending ? local : record;
    if (item.deleted || item.kind !== app || !/^[a-f0-9]{32}$/.test(item.id)) return [];
    return [{ title: item.title, sub: item.matchPreview || item.preview, recordId: item.id }];
  });
  return { status: 'ready', entries };
}

export async function discover(F, { app, query, lease = {}, files, searchApp, openApp, openSource, runIntent }) {
  const owner = F.session.view?.user?.id;
  const owned = () => !!owner && !F.signal.aborted && F.session.view?.user?.id === owner &&
    (app === 'files' || F.session.apps?.[app] && (!['mail', 'atlas'].includes(app) || F.session.view.apps?.mail === true));
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
      if (isRecordApp(app) && e.recordId) {
        return [{ title: clean(e.title), sub: [name, clean(e.sub)].filter(Boolean).join(' · '),
          app, icon: app, key: '/' + app + '/#item=' + e.recordId, detail: true,
          run: () => owned() && openSource({ app, id: e.recordId }) }];
      }
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

export function createDiscoveryView(F, { list, sheet, redraw, select, restore, resetSelection, resume, query, expanded, focusResult }) {
  const ui = F.ui;
  const filters = ui.el("div", { class: "ifl-search-filters", role: "group", "aria-label": "Filter by app", hidden: true });
  let active = resume?.filter || "";
  function filter(groups, settled) {
    const sources = new Set(groups.flatMap(g => g.entries.filter(e => !e.offer).map(sourceOf)).filter(appName));
    if ((!resume || settled) && !sources.has(active)) active = "";
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
    function launch() {
      if (isRecordApp(e.app) && e.detail) {
        const state = { query: query(), filter: active, selected: row.dataset.result, scroll, wide: [...expanded()] };
        returnFromRecord(F, e.key, state);
      }
      h.now();
      e.run();
    }
    h.push({ page: "result", title: e.title, body: panel, onLeave() {
      controller.abort();
      queueMicrotask(() => { if (!h.closed) { restore(row); list.scrollTop = scroll; } });
    }, acts: [{ label: e.preview ? "Show in folder" : "Open in " + appName(e.app), run: launch }] });
    h.el.querySelector("[data-back]")?.setAttribute("aria-label", "Back to results");
    if (e.preview) Promise.resolve(e.preview({ panel, current, signal: controller.signal })).catch(error => {
      if (current()) panel.append(ui.el("p", { role: "status", text: error.message || "Preview unavailable." }));
    });
  }
  return { filters, filter, open, reset() { resume = null; active = ""; filters.hidden = true; },
    restored(settled) {
      if (!resume) return;
      focusResult(resume.selected);
      list.scrollTop = resume.scroll;
      if (settled) resume = null;
    }
  };
}

// Keep the return address in this frame only. Re-query when the original history entry returns.
function returnFromRecord(F, path, state) {
  const origin = history.state?.ifl?.k, owner = F.session.view?.user?.id;
  if (!origin || !owner) return;
  F.nav.cancelSearchReturn?.();
  let destination;
  const cleanup = () => {
    off(); offApps(); F.signal.removeEventListener('abort', cleanup);
    delete F.nav.returnFromRecord; delete F.nav.cancelSearchReturn;
  };
  const off = F.on('route', () => {
    if (!destination && location.pathname + location.hash === path) {
      destination = history.state?.ifl?.k;
      return;
    }
    const returning = destination && history.state?.ifl?.k === origin;
    cleanup();
    if (returning && owner === F.session.view?.user?.id) queueMicrotask(() => {
      if (!F.signal.aborted && history.state?.ifl?.k === origin) F.search.open(state);
    });
  });
  const offApps = F.on('apps', cleanup);
  F.signal.addEventListener('abort', cleanup, { once: true });
  F.nav.cancelSearchReturn = cleanup;
  F.nav.returnFromRecord = (next, app) => {
    if (!isRecordApp(app) || !REGISTRY[app].sections.some(([key]) => next === '/' + app + '/#' + key)) return false;
    if (!destination || history.state?.ifl?.k !== destination || location.pathname + location.hash !== path) return false;
    history.back();
    return true;
  };
}
