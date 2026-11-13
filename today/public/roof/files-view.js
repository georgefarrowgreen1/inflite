// Presentational InFlite Files. Account data and all operations belong to the
// injected controller/service. This view never imports an app or fetches a URL.
const PATHS = {
  folder: ['M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z'],
  file: ['M6 3h8l4 4v14H6Z', 'M14 3v5h4', 'M9 12h6m-6 4h6'],
  image: ['M4 4h16v16H4Z', 'm4 16 5-6 4 4 3-3 4 5', 'M9 8h.01'],
  preview: ['M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z', 'M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0'],
  audio: ['M9 18V5l10-2v13', 'M9 15c-6-2-6 7 0 4m10-6c-6-2-6 7 0 4'],
  search: ['M20 20l-5-5', 'M16 10a6 6 0 1 1-12 0 6 6 0 0 1 12 0'],
  grid: ['M4 4h6v6H4Zm10 0h6v6h-6ZM4 14h6v6H4Zm10 0h6v6h-6Z'],
  list: ['M9 5h11M9 12h11M9 19h11M4 5h.01M4 12h.01M4 19h.01'],
  more: ['M5 12h.01M12 12h.01M19 12h.01'],
  back: ['m14 5-7 7 7 7'], up: ['m5 12 7-7 7 7M12 5v15'],
  chevron: ['m9 5 7 7-7 7'], close: ['m6 6 12 12M6 18 18 6'],
  upload: ['M12 16V3m-5 5 5-5 5 5M4 15v6h16v-6'],
  plus: ['M12 5v14M5 12h14'], info: ['M12 11v6m0-10h.01', 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0'],
  download: ['M12 3v13m-5-5 5 5 5-5M4 16v5h16v-5'],
  open: ['M14 3h7v7m0-7L10 14M21 14v7H3V3h7'],
  share: ['M12 16V3m-5 5 5-5 5 5M5 11v10h14V11'],
  cloud: ['M6 19a5 5 0 1 1 1-10 6 6 0 0 1 12-1 5 5 0 0 1-1 11Z'],
  clock: ['M12 7v5l4 2', 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0'],
  apps: ['M4 4h6v6H4Zm10 0h6v6h-6ZM4 14h6v6H4Zm10 0h6v6h-6Z'],
  check: ['m5 12 4 4 10-10'], retry: ['M20 9a8 8 0 1 0 0 6M20 3v6h-6'],
  edit: ['m4 16 11-11 4 4L8 20H4Zm9-9 4 4'],
  move: ['M3 8h7l2 2h9v10H3Z', 'M15 2v6m-3-3 3-3 3 3'],
  delete: ['M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7'],
};
const clean = (value, max = 255) => typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max) : '';
const actionOK = action => action && /^[a-z][a-z0-9-]{0,47}$/.test(action.id || '') && action.enabled !== false && typeof action.label === 'string';
const GLYPHS = { rename: 'edit', 'open-file': 'open', 'download-file': 'download', 'forward-file': 'share' };
const size = bytes => !Number.isSafeInteger(bytes) || bytes < 0 ? '—' : bytes < 1024 ? `${bytes} B` : bytes < 1048576 ? `${Math.round(bytes / 1024)} KB` : bytes < 1073741824 ? `${(bytes / 1048576).toFixed(1)} MB` : `${(bytes / 1073741824).toFixed(1)} GB`;
const date = value => Number.isFinite(value) && value >= 0 && value <= 864e13 ? new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' }).format(value) : '—';
export const fileGlyph = item => item?.kind === 'folder' ? 'folder' : item?.category === 'image' || item?.mime?.startsWith('image/') ? 'image' : item?.category === 'audio' || item?.mime?.startsWith('audio/') ? 'audio' : 'file';
function fileKind(item) {
  if (item?.kind === 'folder') return 'Folder';
  if (item?.category === 'route' || /\.gpx$/i.test(item?.name || '')) return 'GPX route';
  if (item?.category === 'workout' || /\.(fit|zwo)$/i.test(item?.name || '')) return 'Workout file';
  const type = clean(item?.mime, 100).toLowerCase(), known = { 'text/plain': 'Text document', 'text/csv': 'CSV document', 'application/json': 'JSON document', 'application/pdf': 'PDF document' };
  if (known[type]) return known[type];
  if (fileGlyph(item) === 'image') return 'Image';
  if (fileGlyph(item) === 'audio') return 'Audio file';
  const extension = /\.([a-z0-9]{1,8})$/i.exec(item?.name || '')?.[1];
  return extension ? `${extension.toUpperCase()} file` : 'File';
}
export const fileDetailsSignature = item => item ? JSON.stringify([item.key, item.version, item.name, item.kind, item.mime, item.size, item.modifiedAt, item.sourceLabel, item.source?.kind,
  (Array.isArray(item.actions) ? item.actions : []).filter(actionOK).slice(0, 12).map(action => [action.id, action.label, action.icon, !!action.destructive])]) : '';

export function filesIcon(name, doc = document) {
  const svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
  const requested = GLYPHS[name] || name, glyph = Object.hasOwn(PATHS, requested) ? requested : 'file';
  svg.setAttribute('data-icon', glyph);
  for (const [key, value] of Object.entries({ viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.7', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true', focusable: 'false' })) svg.setAttribute(key, value);
  for (const d of PATHS[glyph]) { const path = doc.createElementNS(svg.namespaceURI, 'path'); path.setAttribute('d', d); svg.append(path); }
  return svg;
}

export function createFileDetails(ui, item, { preview = null, onAction = () => {}, onPreviewError = () => {} } = {}) {
  const el = ui.el, actions = Array.isArray(item?.actions) ? item.actions.filter(actionOK).slice(0, 12) : [];
  const source = item?.sourceLabel || (item?.source?.kind === 'drive' ? 'My Drive' : 'From apps');
  const facts = [['Kind', fileKind(item)], ...(item?.kind === 'folder' ? [] : [['Size', size(item?.size)]]), ['Modified', date(item?.modifiedAt)]];
  const box = el('div', { class: 'ifx-details' },
    el('div', { class: 'ifx-details-symbol', 'aria-hidden': 'true' }, filesIcon(fileGlyph(item))),
    el('h3', { class: 'ifx-details-name', text: clean(item?.name) }),
    el('p', { class: 'ifx-details-source', text: clean(source, 140) }));
  if (preview?.key === item?.key) {
    const region = el('div', { class: 'ifx-preview', 'aria-label': `Preview of ${clean(item.name)}` });
    if (preview.state === 'loading') region.append(el('p', { role: 'status', text: 'Loading preview…' }));
    else if (preview.state === 'error') region.append(el('p', { role: 'status', text: clean(preview.error, 240) || 'This preview couldn’t open.' }));
    else if (preview.kind === 'text') region.append(el('pre', { tabindex: 0, text: String(preview.text || '').slice(0, 262144) }));
    else if (preview.kind === 'image' && preview.url?.startsWith('blob:')) region.append(el('img', { src: preview.url, alt: clean(item.name), on: { error: onPreviewError } }));
    else if (preview.kind === 'audio' && preview.url?.startsWith('blob:')) region.append(el('audio', { src: preview.url, controls: true, preload: 'metadata', 'aria-label': clean(item.name) }));
    box.append(region);
  }
  const dl = el('dl', { class: 'ifx-details-facts' });
  for (const [label, value] of facts) dl.append(el('div', {}, el('dt', { text: label }), el('dd', { text: value })));
  box.append(dl);
  const controls = el('div', { class: 'ifx-details-actions' });
  for (const a of actions) controls.append(el('button', { type: 'button', class: `ifx-action${a.destructive ? ' is-destructive' : ''}`, data: { fileAction: a.id }, on: { click: () => onAction(item, a.id) } }, filesIcon(a.icon || a.id), el('span', { text: clean(a.label, 80) })));
  box.append(controls);
  return box;
}

export function createFilesView(root, { ui, ...callbacks }) {
  const el = ui.el, doc = root.ownerDocument, records = new Map(), locationRecords = new Map(), offs = [];
  let model = {}, gone = false, visible = true, compact = false, resize = 0, dragDepth = 0, focusedKey = null, inspectorSignature = null, inspectorPreview = null;
  const call = (name, ...args) => { if (!gone && typeof callbacks[name] === 'function') return callbacks[name](...args); };
  const listen = (node, type, fn, options) => { node.addEventListener(type, fn, options); offs.push(() => node.removeEventListener(type, fn, options)); };
  const button = (label, glyph, run, cls = 'ifx-button') => el('button', { type: 'button', class: cls, 'aria-label': label, title: label, on: { click: run } }, filesIcon(glyph, doc), el('span', { text: label }));
  root.classList.add('ifl-files-explorer');
  const locations = el('nav', { class: 'ifx-locations', 'aria-label': 'File locations' });
  const locationList = el('div', { class: 'ifx-location-list' });
  const usage = el('p', { class: 'ifx-usage' });
  locations.append(el('h2', { class: 'ifx-section-label', text: 'Locations' }), locationList, usage);
  const browse = button('Locations', 'folder', () => call('onBrowse'), 'ifx-button ifx-browse');
  const up = button('Enclosing folder', 'up', () => call('onUp'), 'ifx-icon-button');
  const breadcrumbs = el('ol', { class: 'ifx-breadcrumbs', 'aria-label': 'Folder path' });
  const query = el('input', { type: 'search', placeholder: 'Search files', maxlength: 160, autocomplete: 'off', autocorrect: 'off', autocapitalize: 'off', spellcheck: 'false', 'aria-label': 'Search files' });
  const search = el('label', { class: 'ifx-search' }, filesIcon('search', doc), query);
  const upload = button('Upload', 'upload', () => call('onUpload'), 'ifx-button is-primary');
  const newFolder = button('New folder', 'plus', () => call('onNewFolder'));
  const sort = el('select', { 'aria-label': 'Sort files' });
  for (const [value, label] of [['name', 'Name'], ['modified', 'Newest'], ['size', 'Largest']]) sort.append(el('option', { value, text: label }));
  const list = button('List view', 'list', () => call('onView', 'list'), 'ifx-icon-button');
  const grid = button('Grid view', 'grid', () => call('onView', 'grid'), 'ifx-icon-button');
  const details = button('File details', 'info', () => call('onToggleDetails'), 'ifx-icon-button ifx-details-toggle');
  const views = el('div', { class: 'ifx-view-options', role: 'group', 'aria-label': 'File view' }, list, grid);
  const toolbar = el('header', { class: 'ifx-toolbar' }, el('div', { class: 'ifx-path' }, browse, up, breadcrumbs), search,
    el('div', { class: 'ifx-tools' }, upload, newFolder, el('label', { class: 'ifx-sort' }, el('span', { class: 'ifx-sr-only', text: 'Sort files' }), sort), views, details));
  const status = el('p', { class: 'ifx-status', role: 'status', 'aria-live': 'polite' });
  const notices = el('div', { class: 'ifx-notices' });
  const retry = button('Try again', 'retry', () => call('onRetry'));
  const message = el('div', { class: 'ifx-message', hidden: true }, el('p'), retry);
  const headings = el('div', { class: 'ifx-list-heading', 'aria-hidden': 'true' }, el('span', { text: 'Name' }), el('span', { text: 'Modified' }), el('span', { text: 'Size' }), el('span', { text: 'Location' }), el('span'));
  const items = el('div', { class: 'ifx-items', role: 'list', 'aria-label': 'Files' });
  const previous = button('Previous page', 'back', () => call('onPrevious'), 'ifx-button');
  const pageNumber = el('span', { class: 'ifx-page-number' });
  const more = button('Next page', 'chevron', () => call('onMore'), 'ifx-button');
  const pager = el('nav', { class: 'ifx-pager', 'aria-label': 'File pages' }, previous, pageNumber, more);
  const results = el('section', { class: 'ifx-results', 'aria-label': 'Folder contents' }, status, notices, message, headings, items, pager);
  const inspector = el('aside', { class: 'ifx-inspector', 'aria-label': 'File details' });
  const transfers = el('section', { class: 'ifx-transfers', hidden: true, 'aria-label': 'Transfers' });
  const body = el('div', { class: 'ifx-body' }, results, inspector);
  const main = el('section', { class: 'ifx-main', 'aria-label': 'InFlite Files', tabindex: -1 }, toolbar, body, transfers);
  const drop = el('div', { class: 'ifx-drop', hidden: true, 'aria-hidden': 'true' }, filesIcon('upload', doc), el('b', { text: 'Upload to this folder' }));
  root.replaceChildren(locations, main, drop);
  listen(query, 'input', () => call('onSearch', query.value));
  listen(sort, 'change', () => call('onSort', sort.value));
  listen(items, 'focusin', event => {
    if (!event.target.closest?.('.ifx-file-main')) return;
    focusedKey = event.target.closest('[data-file-key]')?.dataset.fileKey;
    for (const [key, record] of records) { record.select.tabIndex = key === focusedKey ? 0 : -1; record.menu.tabIndex = key === focusedKey ? 0 : -1; }
  });
  listen(items, 'keydown', event => {
    const button = event.target.closest?.('.ifx-file-main');
    if (!button) return;
    const buttons = [...items.querySelectorAll('.ifx-file-main')], index = buttons.indexOf(button);
    const next = event.key === 'ArrowDown' ? Math.min(buttons.length - 1, index + 1) : event.key === 'ArrowUp' ? Math.max(0, index - 1) : event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : -1;
    if (next >= 0) { event.preventDefault(); buttons.forEach((b, i) => b.tabIndex = i === next ? 0 : -1); buttons[next].focus({ preventScroll: true }); buttons[next].scrollIntoView?.({ block: 'nearest' }); return; }
    const record = records.get(button.closest('[data-file-key]')?.dataset.fileKey);
    if (!record || model.status !== 'ready') return;
    if (event.key === 'Enter') { event.preventDefault(); call('onOpen', record.item); }
    if (event.key === 'F2' && record.item.actions?.some(a => a.id === 'rename' && a.enabled !== false)) { event.preventDefault(); call('onAction', record.item, 'rename'); }
  });
  const canDrop = event => model.capabilities?.upload === true && event.dataTransfer?.types?.includes('Files');
  listen(root, 'dragenter', event => { if (!canDrop(event)) return; event.preventDefault(); dragDepth++; drop.hidden = false; });
  listen(root, 'dragover', event => { if (canDrop(event)) { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; } });
  listen(root, 'dragleave', () => { if (--dragDepth <= 0) { dragDepth = 0; drop.hidden = true; } });
  listen(root, 'drop', event => { const accepted = canDrop(event); dragDepth = 0; drop.hidden = true; if (!accepted) return; event.preventDefault(); call('onDrop', event.dataTransfer); });
  const measure = () => { cancelAnimationFrame(resize); resize = requestAnimationFrame(() => { if (gone || !visible) return; const next = root.getBoundingClientRect().width < 1000; root.dataset.compact = String(next); if (compact !== next) { compact = next; call('onCompact', compact); } }); };
  const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null;
  observer?.observe(root); measure();
  function update(next) {
    if (gone) return;
    model = next || {};
    root.dataset.fileView = model.view === 'grid' ? 'grid' : 'list';
    root.dataset.details = String(model.details !== false);
    list.setAttribute('aria-pressed', String(root.dataset.fileView === 'list')); grid.setAttribute('aria-pressed', String(root.dataset.fileView === 'grid'));
    details.setAttribute('aria-pressed', String(model.details !== false));
    if (query.value !== String(model.query || '')) query.value = String(model.query || '');
    query.setAttribute('aria-label', `Search ${clean(model.locationName, 100) || 'files'}`);
    sort.value = ['name', 'modified', 'size'].includes(model.sort) ? model.sort : 'name';
    upload.hidden = model.capabilities?.upload !== true; newFolder.hidden = model.capabilities?.newFolder !== true;
    up.disabled = !model.parentLocation; details.disabled = !model.selection;
    const placeKeys = new Set(); let placePosition = locationList.firstElementChild;
    for (const location of (Array.isArray(model.locations) ? model.locations : []).slice(0, 12)) {
      const key = JSON.stringify(location.location); if (placeKeys.has(key)) continue; placeKeys.add(key);
      let record = locationRecords.get(key);
      if (!record) {
        const label = el('span'), node = el('button', { type: 'button', class: 'ifx-location' }, filesIcon(location.icon || (location.kind === 'apps' ? 'apps' : 'cloud'), doc), label);
        record = { node, label, location }; node.addEventListener('click', () => { if (!gone && node.isConnected && locationRecords.get(key) === record) call('onLocation', record.location.location); }); locationRecords.set(key, record);
      }
      record.location = location; record.label.textContent = clean(location.name, 80);
      if (location.selected) record.node.setAttribute('aria-current', 'page'); else record.node.removeAttribute('aria-current');
      if (record.node !== placePosition) locationList.insertBefore(record.node, placePosition); placePosition = record.node.nextElementSibling;
    }
    for (const [key, record] of locationRecords) if (!placeKeys.has(key)) { record.node.remove(); locationRecords.delete(key); }
    usage.hidden = !model.usage;
    usage.textContent = model.usage ? `${size(model.usage.used)} of ${size(model.usage.limit)} used` : '';
    breadcrumbs.replaceChildren(...(Array.isArray(model.breadcrumbs) ? model.breadcrumbs : []).slice(0, 34).map((crumb, i, all) => el('li', {}, i ? filesIcon('chevron', doc) : null,
      i === all.length - 1 ? el('span', { 'aria-current': 'page', text: clean(crumb.name, 140), title: clean(crumb.name) }) : el('button', { type: 'button', text: clean(crumb.name, 140), title: clean(crumb.name), on: { click: () => call('onLocation', crumb.location) } }))));
    const values = (Array.isArray(model.items) ? model.items : []).filter(item => item && typeof item.key === 'string').slice(0, 500), keep = new Set();
    if (!values.some(item => item.key === focusedKey)) focusedKey = values.find(item => item.key === model.focusKey)?.key || values.find(item => item.key === model.selection)?.key || values[0]?.key || null;
    const activeElement = doc.activeElement, oldActive = activeElement?.closest?.('[data-file-key]'), oldOrder = [...records.keys()], oldIndex = oldOrder.indexOf(oldActive?.dataset.fileKey);
    let position = items.firstElementChild;
    for (const item of values) {
      if (keep.has(item.key)) continue; keep.add(item.key);
      let record = records.get(item.key);
      if (!record) {
        const symbol = el('span', { class: 'ifx-file-symbol', 'aria-hidden': 'true' }), name = el('span', { class: 'ifx-file-name' }), sub = el('span', { class: 'ifx-file-sub' });
        const select = el('button', { type: 'button', class: 'ifx-file-main' }, symbol, el('span', { class: 'ifx-file-copy' }, name, sub));
        const modified = el('span', { class: 'ifx-file-date', 'aria-hidden': 'true' }), bytes = el('span', { class: 'ifx-file-size', 'aria-hidden': 'true' }), source = el('span', { class: 'ifx-file-source', 'aria-hidden': 'true' });
        const menu = button('File actions', 'more', () => {}, 'ifx-icon-button ifx-file-menu');
        const node = el('article', { class: 'ifx-file', role: 'listitem', data: { fileKey: item.key } }, select, modified, bytes, source, menu);
        record = { node, select, symbol, name, sub, modified, bytes, source, menu, item };
        const current = () => !gone && model.status === 'ready' && node.isConnected && records.get(item.key) === record;
        select.addEventListener('click', () => { if (current()) call('onSelect', record.item); });
        select.addEventListener('dblclick', () => { if (current()) call('onOpen', record.item); });
        menu.addEventListener('click', () => { if (current()) call('onMenu', record.item); });
        records.set(item.key, record);
      }
      record.item = item;
      const selected = model.selection === item.key;
      record.node.dataset.selected = String(selected);
      record.node.dataset.kind = item.kind === 'folder' ? 'folder' : 'file';
      record.name.textContent = clean(item.name); record.name.title = clean(item.name);
      record.symbol.replaceChildren(filesIcon(fileGlyph(item), doc));
      record.sub.textContent = [item.kind === 'folder' ? 'Folder' : size(item.size), clean(item.sourceLabel, 100)].filter(Boolean).join(' · ');
      record.modified.textContent = date(item.modifiedAt); record.bytes.textContent = item.kind === 'folder' ? '—' : size(item.size); record.source.textContent = clean(item.sourceLabel, 100);
      record.select.setAttribute('aria-disabled', String(model.status !== 'ready')); record.menu.setAttribute('aria-disabled', String(model.status !== 'ready'));
      record.select.setAttribute('aria-label', `Select ${clean(item.name)}`); record.select.setAttribute('aria-pressed', String(selected)); record.select.tabIndex = focusedKey === item.key ? 0 : -1;
      record.menu.setAttribute('aria-label', `Actions for ${clean(item.name)}`); record.menu.setAttribute('aria-haspopup', 'dialog'); record.menu.hidden = !Array.isArray(item.actions) || !item.actions.some(actionOK); record.menu.tabIndex = focusedKey === item.key ? 0 : -1;
      if (record.node !== position) items.insertBefore(record.node, position);
      position = record.node.nextElementSibling;
    }
    for (const [key, record] of records) if (!keep.has(key)) { record.node.remove(); records.delete(key); }
    if (oldActive?.isConnected && doc.activeElement === doc.body) activeElement.focus({ preventScroll: true });
    if (oldActive && !oldActive.isConnected && values.length) records.get(values[Math.max(0, Math.min(oldIndex, values.length - 1))].key)?.select.focus({ preventScroll: true });
    const loading = model.status === 'loading';
    results.setAttribute('aria-busy', String(loading));
    status.textContent = loading ? 'Loading files…' : `${values.length} ${values.length === 1 ? 'item' : 'items'}${model.page > 1 || model.cursor ? ` · Page ${model.page || 1}` : ''}`;
    notices.replaceChildren(...(Array.isArray(model.notices) ? model.notices : []).slice(0, 6).map(notice => el('div', { class: 'ifx-notice' }, el('p', { text: clean(notice.text, 240) }),
      ...(Array.isArray(notice.actions) ? notice.actions : []).filter(action => action.enabled !== false).slice(0, 3).map(action => button(clean(action.label, 80), action.icon || 'chevron', () => call('onNotice', notice, action.id))))));
    message.hidden = values.length > 0 && model.status !== 'error';
    message.firstElementChild.textContent = model.status === 'error' ? clean(model.error, 240) || 'Files couldn’t be loaded. Try again.' : loading ? 'Your files will appear here.' : model.query ? `No files match “${clean(model.query, 160)}”.` : model.emptyMessage || 'This folder is empty.';
    retry.hidden = model.status !== 'error'; headings.hidden = !values.length || root.dataset.fileView === 'grid'; pager.hidden = !model.cursor && !(model.page > 1); previous.disabled = loading || !(model.page > 1); more.disabled = loading || !model.cursor; pageNumber.textContent = `Page ${model.page || 1}`;
    inspector.hidden = model.details === false;
    const selected = values.find(item => item.key === model.selection);
    const signature = fileDetailsSignature(selected);
    if (signature !== inspectorSignature || model.preview !== inspectorPreview) {
      const inspectorFocus = inspector.contains(doc.activeElement) ? doc.activeElement?.dataset?.fileAction : null;
      inspector.replaceChildren(selected ? createFileDetails(ui, selected, { preview: model.preview, onAction: (item, id) => { if (model.status === 'ready') call('onAction', item, id); }, onPreviewError: () => call('onPreviewError', selected.key) }) : el('div', { class: 'ifx-no-selection' }, filesIcon('info', doc), el('p', { text: 'Select a file to see its details.' })));
      inspectorSignature = signature; inspectorPreview = model.preview;
      if (inspectorFocus) inspector.querySelector(`[data-file-action="${CSS.escape(inspectorFocus)}"]`)?.focus({ preventScroll: true });
    }
    for (const control of inspector.querySelectorAll('[data-file-action]')) control.setAttribute('aria-disabled', String(model.status !== 'ready'));
    const transfersList = (Array.isArray(model.transfers) ? model.transfers : []).slice(0, 5);
    transfers.hidden = !transfersList.length;
    transfers.replaceChildren(...transfersList.map(transfer => {
      const progress = el('progress', { max: 1, 'aria-label': `Upload ${clean(transfer.name)}` });
      if (Number.isFinite(transfer.progress) && transfer.progress >= 0 && transfer.progress <= 1) progress.value = transfer.progress;
      return el('div', { class: 'ifx-transfer' }, filesIcon(transfer.status === 'done' ? 'check' : 'upload', doc), el('div', {}, el('b', { text: clean(transfer.name) }), el('span', { text: clean(transfer.label || transfer.status, 140) }), progress), transfer.cancelable ? button(`Cancel upload of ${clean(transfer.name)}`, 'close', () => call('onCancelTransfer', transfer.id), 'ifx-icon-button') : null);
    }));
  }
  function destroy() { if (gone) return; gone = true; observer?.disconnect(); cancelAnimationFrame(resize); for (const off of offs.splice(0)) off(); records.clear(); locationRecords.clear(); items.replaceChildren(); inspector.replaceChildren(); locationList.replaceChildren(); breadcrumbs.replaceChildren(); transfers.replaceChildren(); notices.replaceChildren(); query.value = ''; status.textContent = ''; model = {}; inspectorSignature = inspectorPreview = focusedKey = null; root.replaceChildren(); root.classList.remove('ifl-files-explorer'); delete root.dataset.fileView; delete root.dataset.details; delete root.dataset.compact; }
  return { update, isCompact: () => compact || root.getBoundingClientRect().width < 1000, focus: () => main, focusSearch: () => query.focus({ preventScroll: true }), focusKey: () => focusedKey,
    focusResource(key) { const record = records.get(key); if (record) { record.select.focus({ preventScroll: true }); record.select.scrollIntoView?.({ block: 'nearest' }); } },
    setVisible(value) { visible = !!value; if (visible) { observer?.observe(root); measure(); } else { observer?.disconnect(); cancelAnimationFrame(resize); } }, destroy };
}
