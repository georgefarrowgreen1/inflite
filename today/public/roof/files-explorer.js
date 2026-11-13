// Account-bound Explorer interactions. No endpoint, storage key, app import or
// domain calculation belongs here: an injected service resolves every action.
import { createFilesView, createFileDetails, fileDetailsSignature, filesIcon } from './files-view.js';
import { safeFilesLocation as filesLocation } from './files-location.js';
export { filesLocation };

const FOLDER = /^[A-Za-z0-9_-]{32}$/;
const ACTION = /^[a-z][a-z0-9-]{0,47}$/;
const clean = (value, max = 255) => typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max) : '';
const keyOf = location => JSON.stringify(filesLocation(location));
const activeActions = item => (Array.isArray(item?.actions) ? item.actions : []).filter(action => action && ACTION.test(action.id || '') && action.enabled !== false && typeof action.label === 'string').slice(0, 12);
const folderLocation = item => item?.location ? filesLocation(item.location) : item?.kind === 'folder' && item.source?.kind === 'drive' && FOLDER.test(item.id || '') ? filesLocation({ kind: 'drive', folderId: item.id }) : null;
const errorText = error => clean(error?.message || error?.error, 240) || 'That didn’t finish. Refresh to check before trying again.';

export function createFilesExplorer(root, F, { service, onNavigate = () => false, onChanged = () => {} } = {}) {
  if (!service || typeof service.browse !== 'function' || typeof service.run !== 'function') throw new TypeError('InFlite Files needs its account-owned service.');
  const ui = F.ui, owner = F.session?.view?.user?.id, signal = F.signal, popups = new Set(), operations = new Set();
  let gone = false, visible = false, episode = 0, readGen = 0, actionGen = 0, queryTimer = 0, refreshTimer = 0, read = null, previewRead = null, previewURL = null, detailsSheet = null, detailsState = null;
  let location = filesLocation(), listing = { items: [], status: 'loading', capabilities: {} }, query = '', sort = 'name', mode = 'list', selection = null, details = true, preview = null, uploadTarget = null;
  let page = 0, pageCursors = [null], pageMemory = new Map();
  const live = () => !gone && !!owner && !signal?.aborted && F.session?.view?.user?.id === owner;
  const active = () => live() && visible;
  const items = () => (Array.isArray(listing.items) ? listing.items : []).filter(item => item && typeof item.key === 'string' && typeof item.name === 'string').slice(0, 500);
  const resource = item => active() && listing.status === 'ready' ? items().find(next => next.key === item?.key && next.id === item.id && (item.version == null || next.version === item.version)) : null;
  const transfers = () => { try { return (service.transfers?.() || []).map(transfer => ({ ...transfer, cancelable: transfer.cancelable === true && typeof service.cancelTransfer === 'function' })); } catch (_) { return []; } };
  const locations = () => { try { return service.locations?.(location) || []; } catch (_) { return []; } };
  function stopMedia(container) {
    for (const media of container?.querySelectorAll?.('audio,video') || []) { try { media.pause(); media.removeAttribute('src'); media.load(); } catch (_) {} }
  }
  function releasePreview() {
    stopMedia(root); for (const handle of popups) stopMedia(handle.body);
    previewRead?.abort(); previewRead = null;
    if (previewURL) URL.revokeObjectURL(previewURL);
    previewURL = null; preview = null;
  }
  function closePopups() { for (const sheet of [...popups]) sheet.now(); popups.clear(); detailsSheet = null; detailsState = null; }
  function sheet(spec) {
    if (!active()) return null;
    let handle;
    const close = spec.onClose;
    handle = F.sheet.open({ ...spec, onClose() { stopMedia(handle?.body); popups.delete(handle); if (detailsSheet === handle) { detailsSheet = null; detailsState = null; } close?.(); } });
    popups.add(handle);
    return handle;
  }
  const primary = item => activeActions(item).find(action => action.id === item.primaryAction) || activeActions(item).find(action => action.id === 'open' || action.primary) || activeActions(item).find(action => action.id === 'preview');
  function breadcrumbs() {
    if (Array.isArray(listing.breadcrumbs)) return listing.breadcrumbs;
    if (location.kind === 'apps') return [{ name: 'From apps', location: filesLocation({ kind: 'apps' }) }, ...(location.app ? [{ name: listing.name || location.app, location }] : [])];
    return [{ name: location.view === 'recent' ? 'Recent' : 'My Drive', location: filesLocation({ kind: 'drive', view: location.view }) },
      ...(Array.isArray(listing.ancestors) ? listing.ancestors.filter(folder => FOLDER.test(folder?.id || '')).map(folder => ({ name: folder.name, location: filesLocation({ kind: 'drive', folderId: folder.id }) })) : []),
      ...(listing.folder && FOLDER.test(listing.folder.id || '') ? [{ name: listing.folder.name, location }] : [])];
  }
  function parentLocation() {
    const crumbs = breadcrumbs();
    return crumbs.length > 1 ? crumbs[crumbs.length - 2].location : null;
  }
  function model() {
    const values = items();
    return { ...listing, items: values, view: mode, query, sort, selection, details, preview, locations: locations(), breadcrumbs: breadcrumbs(), parentLocation: parentLocation(), transfers: transfers(),
      page: page + 1, focusKey: pageMemory.get(page)?.focusKey,
      locationName: listing.folder?.name || listing.name || (location.kind === 'apps' ? 'From apps' : location.view === 'recent' ? 'Recent' : 'My Drive'),
      capabilities: listing.status === 'ready' ? { ...listing.capabilities, upload: listing.capabilities?.upload === true && typeof service.upload === 'function' } : {} };
  }
  function paint() {
    if (!active()) return;
    view.update(model());
    if (detailsSheet && !detailsSheet.closed) {
      const selected = items().find(item => item.key === selection);
      if (!selected) return detailsSheet.now();
      const signature = fileDetailsSignature(selected);
      if (detailsState?.sheet === detailsSheet && detailsState.signature === signature && detailsState.preview === preview) return;
      const focused = document.activeElement?.dataset?.fileAction;
      detailsSheet.body.replaceChildren(createFileDetails(ui, selected, { preview, onAction: dispatch, onPreviewError: () => previewError(selected.key) }));
      detailsState = { sheet: detailsSheet, signature, preview };
      if (focused) detailsSheet.body.querySelector(`[data-file-action="${CSS.escape(focused)}"]`)?.focus({ preventScroll: true });
    }
  }
  function resetPages({ clearSelection = false } = {}) {
    page = 0; pageCursors = [null]; pageMemory.clear();
    if (clearSelection) { selection = null; releasePreview(); }
  }
  async function refresh({ reset = false } = {}) {
    if (!active()) return false;
    if (reset) resetPages();
    const mine = ++readGen, currentLocation = location, typed = query, sorted = sort, currentPage = page, cursor = pageCursors[page];
    read?.abort(); const controller = read = new AbortController();
    const current = () => active() && !controller.signal.aborted && mine === readGen && keyOf(location) === keyOf(currentLocation) && query === typed && sort === sorted && page === currentPage;
    listing = { ...listing, status: 'loading', error: null }; paint();
    try {
      const answer = await service.browse(currentLocation, { query: typed, sort: sorted, cursor, signal: controller.signal, current });
      if (!current()) return false;
      const state = ['ready', 'error', 'loading'].includes(answer?.status) ? answer.status : 'ready';
      const nextItems = Array.isArray(answer?.items) ? answer.items : [];
      listing = { ...answer, status: state, items: nextItems.slice(0, 500), capabilities: answer?.capabilities || {} };
      if (selection && !items().some(item => item.key === selection)) { selection = null; releasePreview(); }
      if (preview && items().find(item => item.key === preview.key)?.version !== preview.version) releasePreview();
      paint(); return true;
    } catch (error) {
      if (!current()) return false;
      if (error?.status === 409 && page > 0) { resetPages({ clearSelection: true }); listing = { items: [], status: 'loading', capabilities: {} }; return refresh(); }
      listing = { ...listing, status: 'error', error: errorText(error) }; paint(); return false;
    }
  }
  async function changePage(direction) {
    if (!active() || listing.status !== 'ready' || direction < 0 && page === 0 || direction > 0 && !listing.cursor) return;
    pageMemory.set(page, { selection, focusKey: view.focusKey() });
    if (direction > 0) { pageCursors = pageCursors.slice(0, page + 1); pageCursors.push(listing.cursor); page++; }
    else page--;
    actionGen++; episode++; releasePreview(); closePopups(); selection = pageMemory.get(page)?.selection || null;
    listing = { ...listing, items: [], cursor: null, status: 'loading' };
    if (await refresh()) view.focusResource(pageMemory.get(page)?.focusKey || selection || items()[0]?.key);
  }
  function navigate(next) {
    next = filesLocation(next);
    if (!active() || !next) return;
    closePopups();
    if (onNavigate(next) !== true) show(next);
  }
  function select(item) {
    const current = resource(item);
    if (!current) return;
    if (view.isCompact() && folderLocation(current)) return navigate(folderLocation(current));
    if (selection !== current.key) releasePreview();
    selection = current.key; paint();
    if (view.isCompact()) showDetails(current);
  }
  function open(item) {
    const current = resource(item);
    if (!current) return;
    const destination = folderLocation(current);
    if (destination) return navigate(destination);
    const action = primary(current);
    if (action) dispatch(current, action.id);
    else { selection = current.key; paint(); showDetails(current); }
  }
  function showDetails(item) {
    if (!resource(item)) return;
    closePopups(); selection = item.key; details = true;
    detailsSheet = sheet({ sheet: 'files-details', title: 'File details', body: createFileDetails(ui, item, { preview, onAction: dispatch, onPreviewError: () => previewError(item.key) }), onClose() { releasePreview(); paint(); } });
    detailsState = { sheet: detailsSheet, signature: fileDetailsSignature(item), preview };
  }
  function menu(item) {
    const current = resource(item);
    if (!current) return;
    closePopups();
    const body = ui.el('div', { class: 'ifx-details-actions' }); let handle;
    for (const action of activeActions(current)) body.append(ui.el('button', { type: 'button', class: `ifx-action${action.destructive ? ' is-destructive' : ''}`, on: { click() { handle.now(); dispatch(current, action.id); } } }, filesIcon(action.icon || action.id), ui.el('span', { text: clean(action.label, 80) })));
    if (body.firstChild) handle = sheet({ sheet: 'files-actions', title: clean(current.name), body });
  }
  function browseLocations() {
    closePopups(); const body = ui.el('div', { class: 'ifx-details-actions' }); let handle;
    for (const place of locations()) body.append(ui.el('button', { type: 'button', class: 'ifx-action', 'aria-current': place.selected ? 'page' : null, on: { click() { handle.now(); navigate(place.location); } } }, filesIcon(place.icon || 'folder'), ui.el('span', { text: clean(place.name, 100) })));
    handle = sheet({ sheet: 'files-locations', title: 'Locations', body });
  }
  function previewError(key) {
    if (!active() || preview?.key !== key) return;
    if (previewURL) URL.revokeObjectURL(previewURL);
    previewURL = null; preview = { key, version: items().find(item => item.key === key)?.version, state: 'error', error: 'This preview isn’t supported. Download the file to open it.' }; paint();
  }
  async function previewFile(item) {
    const currentItem = resource(item);
    if (!currentItem) return;
    releasePreview(); selection = item.key;
    const controller = previewRead = new AbortController(), mine = episode;
    const current = () => active() && mine === episode && !controller.signal.aborted && previewRead === controller && selection === item.key && !!resource(item);
    preview = { key: item.key, version: item.version, state: 'loading' }; details = true;
    if (view.isCompact() && !detailsSheet) showDetails(item);
    paint();
    try {
      const answer = await service.run(item.key, 'preview', { input: { version: item.version }, signal: controller.signal, current });
      if (!current()) return;
      if (answer?.ok === false) throw new Error(answer.error || 'This preview couldn’t open.');
      const blob = answer?.blob || answer?.file, type = clean(item.mime, 100).toLowerCase();
      if (!(blob instanceof Blob) || blob.size > 25 * 1024 * 1024) throw new Error('Download this file to open it.');
      if (/^(text\/(plain|csv)|application\/json)$/.test(type)) {
        if (blob.size > 262144) throw new Error('This text file is too large to preview. Download it to open it.');
        const text = await blob.text();
        if (!current()) return;
        preview = { key: item.key, version: item.version, state: 'ready', kind: 'text', text };
      } else if (/^image\/(png|jpeg|gif|webp|avif)$/.test(type) || /^audio\/(mpeg|mp4|ogg|wav|webm|aac|flac)$/.test(type)) {
        previewURL = URL.createObjectURL(new Blob([blob], { type }));
        preview = { key: item.key, version: item.version, state: 'ready', kind: type.startsWith('image/') ? 'image' : 'audio', url: previewURL };
      } else throw new Error('Preview isn’t supported for this file. Download it to open it.');
      paint();
    } catch (error) { if (current()) { preview = { key: item.key, version: item.version, state: 'error', error: errorText(error) }; paint(); } }
  }
  async function execute(item, action, { input, current: formCurrent = () => true } = {}) {
    const currentItem = item ? resource(item) : null;
    if (!active() || item && !currentItem || !ACTION.test(action)) return { ok: false, cancelled: true };
    const mine = ++actionGen, openingEpisode = episode, appHandoff = currentItem?.source?.kind === 'app';
    const controller = appHandoff ? null : new AbortController();
    if (controller) operations.add(controller);
    const current = () => live() && mine === actionGen && formCurrent() && !controller?.signal.aborted && (appHandoff || active() && episode === openingEpisode);
    if (appHandoff) closePopups();
    try {
      const answer = await service.run(currentItem?.key || null, action, { input, current, signal: appHandoff ? signal : controller.signal });
      if (!current()) return { ok: false, cancelled: true };
      return answer || { ok: true };
    } catch (error) { return current() ? { ok: false, error: errorText(error) } : { ok: false, cancelled: true }; }
    finally { if (controller) operations.delete(controller); }
  }
  function nameForm(item = null) {
    const currentItem = item ? resource(item) : null, newFolder = !item;
    if (!active() || item && (!currentItem || currentItem.source?.kind !== 'drive') || newFolder && (location.kind !== 'drive' || location.view !== 'folder' || listing.capabilities?.newFolder !== true)) return;
    closePopups();
    const folderId = location.kind === 'drive' ? location.folderId : null, name = ui.el('input', { type: 'text', maxlength: 255, value: currentItem?.name || '', autocomplete: 'off', 'aria-label': newFolder ? 'Folder name' : 'File name' });
    const error = ui.el('p', { role: 'status', hidden: true });
    const body = ui.el('div', { class: 'ifx-form' }, ui.el('label', {}, ui.el('span', { text: newFolder ? 'Folder name' : 'Name' }), name), error);
    let handle, pending = false;
    const save = async () => {
      if (pending || !active() || handle.closed) return;
      const value = clean(name.value);
      if (!value || /[\/\\]/.test(value) || value === '.' || value === '..') { error.hidden = false; error.textContent = 'Enter a name without slashes.'; return; }
      pending = true; handle.setBusy(true); error.hidden = true;
      const answer = await execute(currentItem, newFolder ? 'create-folder' : 'rename', { input: { name: value, ...(newFolder ? { parentId: folderId } : { version: currentItem.version }) }, current: () => !handle.closed });
      if (!active() || handle.closed) return;
      pending = false; handle.setBusy(false);
      if (answer?.ok === false) { if (answer.error) { error.hidden = false; error.textContent = clean(answer.error, 240); } return; }
      handle.now(); refresh({ reset: true }); onChanged();
    };
    handle = sheet({ sheet: newFolder ? 'files-new-folder' : 'files-rename', title: newFolder ? 'New folder' : 'Rename', focus: name, body, acts: [{ label: newFolder ? 'Create folder' : 'Save name', primary: true, run: save }] });
    name.addEventListener('keydown', event => { if (event.key === 'Enter' && !event.isComposing) { event.preventDefault(); save(); } });
  }
  function remove(item) {
    if (!resource(item) || item.source?.kind !== 'drive') return;
    closePopups(); let handle, pending = false;
    const error = ui.el('p', { role: 'status', hidden: true });
    const body = ui.el('div', { class: 'ifx-form' }, ui.el('p', { text: item.kind === 'folder' ? 'Only empty folders can be deleted. This can’t be undone.' : 'This file will be removed from My Drive. This can’t be undone.' }), error);
    handle = sheet({ sheet: 'files-delete', title: `Delete ${clean(item.name)}?`, body, acts: [{ label: 'Delete', destructive: true, run: async () => {
      if (pending || handle.closed) return; pending = true; handle.setBusy(true);
      const answer = await execute(item, 'delete', { input: { version: item.version }, current: () => !handle.closed });
      if (!active() || handle.closed) return; pending = false; handle.setBusy(false);
      if (answer?.ok === false) { error.hidden = false; error.textContent = clean(answer.error, 240) || 'That file couldn’t be deleted.'; return; }
      if (selection === item.key) { selection = null; releasePreview(); }
      handle.now(); refresh({ reset: true }); onChanged();
    } }] });
  }
  function move(item) {
    if (!resource(item) || item.source?.kind !== 'drive') return;
    closePopups(); let target = filesLocation(), generation = 0, controller = null, handle, pending = false, destinationReady = false, pickerPage = 0, pickerCursors = [null], nextCursor = null;
    const path = ui.el('div', { class: 'ifx-path' }), folders = ui.el('div', { class: 'ifx-move-folders' }), status = ui.el('p', { role: 'status' });
    const previous = ui.el('button', { type: 'button', class: 'ifx-icon-button', 'aria-label': 'Previous folder page', on: { click: () => load(target, -1) } }, filesIcon('back'));
    const next = ui.el('button', { type: 'button', class: 'ifx-icon-button', 'aria-label': 'Next folder page', on: { click: () => load(target, 1) } }, filesIcon('chevron'));
    const pageNumber = ui.el('span', { class: 'ifx-page-number' }), pager = ui.el('nav', { class: 'ifx-pager', 'aria-label': 'Destination folder pages', hidden: true }, previous, pageNumber, next);
    const body = ui.el('div', { class: 'ifx-form' }, path, status, folders, pager);
    const load = async (location, direction = 0) => {
      location = filesLocation(location);
      if (!active() || handle?.closed || !location || location.kind !== 'drive' || direction < 0 && pickerPage === 0 || direction > 0 && !nextCursor) return;
      if (!direction || keyOf(target) !== keyOf(location)) { pickerPage = 0; pickerCursors = [null]; }
      else if (direction > 0) { pickerCursors = pickerCursors.slice(0, pickerPage + 1); pickerCursors.push(nextCursor); pickerPage++; }
      else pickerPage--;
      target = location; controller?.abort(); controller = new AbortController(); const mine = ++generation;
      destinationReady = false; handle.setBusy(true); previous.disabled = next.disabled = true;
      const current = () => active() && !handle.closed && mine === generation && !controller.signal.aborted;
      folders.replaceChildren(); status.textContent = 'Loading folders…';
      try {
        const answer = await service.browse(target, { foldersOnly: true, sort: 'name', cursor: pickerCursors[pickerPage], signal: controller.signal, current });
        if (!current()) return;
        const ancestors = [{ name: 'My Drive', id: null }, ...(answer.ancestors || []), ...(answer.folder ? [answer.folder] : [])];
        path.replaceChildren(...ancestors.map(folder => ui.el('button', { type: 'button', class: 'ifx-button', text: clean(folder.name, 100), on: { click: () => load(filesLocation({ kind: 'drive', folderId: folder.id })) } })));
        const children = (answer.items || []).filter(folder => folder.kind === 'folder' && folder.id !== item.id && FOLDER.test(folder.id || ''));
        for (const folder of children) folders.append(ui.el('button', { type: 'button', class: 'ifx-action', on: { click: () => load(filesLocation({ kind: 'drive', folderId: folder.id })) } }, filesIcon('folder'), ui.el('span', { text: clean(folder.name) })));
        nextCursor = answer.cursor || null; previous.disabled = pickerPage === 0; next.disabled = !nextCursor; pager.hidden = pickerPage === 0 && !nextCursor; pageNumber.textContent = `Page ${pickerPage + 1}`;
        destinationReady = item.parentId !== target.folderId && item.id !== target.folderId; handle.setBusy(!destinationReady);
        status.textContent = !destinationReady ? 'Choose a different destination folder.' : children.length ? 'Choose a destination folder.' : 'No folders inside this location.';
      } catch (error) { if (current()) { if (error?.status === 409 && pickerPage > 0) return load(target); status.textContent = errorText(error); } }
    };
    handle = sheet({ sheet: 'files-move', title: `Move ${clean(item.name)}`, body, onClose: () => controller?.abort(), acts: [{ label: 'Move here', primary: true, run: async () => {
      if (pending || handle.closed || !destinationReady) return;
      pending = true; handle.setBusy(true);
      const answer = await execute(item, 'move', { input: { parentId: target.folderId, version: item.version }, current: () => !handle.closed });
      if (!active() || handle.closed) return; pending = false; handle.setBusy(false);
      if (answer?.ok === false) { status.textContent = clean(answer.error, 240) || 'This file couldn’t be moved.'; return; }
      handle.now(); selection = null; releasePreview(); refresh({ reset: true }); onChanged();
    } }] });
    load(target);
  }
  async function dispatch(item, id) {
    const current = resource(item);
    if (!current || !activeActions(current).some(action => action.id === id)) return;
    if (id === 'open' && folderLocation(current)) return navigate(folderLocation(current));
    if (id === 'rename' && current.source?.kind === 'drive') return nameForm(current);
    if (id === 'move' && current.source?.kind === 'drive') return move(current);
    if (id === 'delete' && current.source?.kind === 'drive') return remove(current);
    if (id === 'preview' && current.source?.kind === 'drive') return previewFile(current);
    const answer = await execute(current, id);
    if (active() && answer?.error) F.toast(clean(answer.error, 240));
  }
  const picker = ui.el('input', { type: 'file', multiple: true, hidden: true, 'aria-label': 'Choose files to upload' });
  root.after(picker);
  function upload(files) {
    if (!live() || !uploadTarget || typeof service.upload !== 'function') return;
    const target = uploadTarget; uploadTarget = null;
    const values = Array.from(files || []).filter(file => file instanceof File).slice(0, 100);
    if (!values.length) return;
    try { Promise.resolve(service.upload(values, { folderId: target.folderId, current: live })).catch(error => { if (live()) F.toast(errorText(error)); }); }
    catch (error) { if (live()) F.toast(errorText(error)); }
  }
  picker.addEventListener('change', () => { const files = [...picker.files]; picker.value = ''; upload(files); });
  function chooseUpload() {
    if (!active() || location.kind !== 'drive' || location.view !== 'folder' || listing.capabilities?.upload !== true) return;
    uploadTarget = { folderId: location.folderId }; picker.value = ''; picker.click();
  }
  function drop(data) {
    if (!active() || location.kind !== 'drive' || listing.capabilities?.upload !== true) return;
    if ([...(data.items || [])].some(item => item.webkitGetAsEntry?.()?.isDirectory)) return F.toast('Upload individual files. Folder uploads aren’t available yet.');
    uploadTarget = { folderId: location.folderId }; upload(data.files);
  }
  const view = createFilesView(root, { ui, onLocation: navigate, onBrowse: browseLocations, onUp: () => { const parent = parentLocation(); if (parent) navigate(parent); }, onSelect: select, onOpen: open, onMenu: menu, onAction: dispatch,
    onSearch(value) { if (!active()) return; query = clean(value, 160); resetPages({ clearSelection: true }); clearTimeout(queryTimer); queryTimer = setTimeout(refresh, 250); },
    onSort(value) { if (['name', 'modified', 'size'].includes(value)) { sort = value; resetPages({ clearSelection: true }); refresh(); } },
    onView(value) { if (['list', 'grid'].includes(value)) { mode = value; paint(); } },
    onToggleDetails() { const selected = items().find(item => item.key === selection); if (!selected) return; if (view.isCompact()) showDetails(selected); else { details = !details; paint(); } },
    onNewFolder: () => nameForm(), onUpload: chooseUpload, onDrop: drop, onRetry: () => refresh({ reset: true }), onMore: () => changePage(1), onPrevious: () => changePage(-1), onPreviewError: previewError,
    onCancelTransfer: id => { if (live()) service.cancelTransfer?.(id); },
    onNotice: async (notice, id) => {
      const currentNotice = (listing.notices || []).find(value => value.id === notice.id && value.resourceKey === notice.resourceKey);
      if (!active() || !currentNotice?.actions?.some(action => action.id === id && action.enabled !== false) || !ACTION.test(id)) return;
      const mine = ++actionGen, current = () => live() && mine === actionGen;
      closePopups();
      try { const answer = await service.run(notice.resourceKey, id, { current, signal }); if (current() && answer?.error) F.toast(clean(answer.error, 240)); }
      catch (error) { if (current()) F.toast(errorText(error)); }
    } });
  const off = service.subscribe?.(change => {
    if (!live()) return;
    if (change?.kind === 'transfers' || change?.type === 'transfers') return paint();
    if (!active() || location.kind === 'drive' && change?.source?.kind === 'app') return;
    clearTimeout(refreshTimer); refreshTimer = setTimeout(refresh, 80);
  }) || (() => {});
  function show(next = location, { query: prefill } = {}) {
    if (!live()) return false;
    const selected = filesLocation(next);
    if (!selected) return false;
    const changed = keyOf(selected) !== keyOf(location);
    visible = true; episode++;
    if (changed) { closePopups(); location = selected; query = ''; resetPages({ clearSelection: true }); if (selected.kind === 'drive' && selected.view === 'recent') sort = 'modified'; listing = { items: [], status: 'loading', capabilities: {} }; }
    if (typeof prefill === 'string' && clean(prefill, 160) !== query) { closePopups(); query = clean(prefill, 160); resetPages({ clearSelection: true }); }
    root.hidden = false; root.inert = false; view.setVisible(true); paint(); refresh(); return true;
  }
  function hide() {
    if (gone) return;
    visible = false; episode++; readGen++; read?.abort(); for (const controller of operations) controller.abort(); operations.clear(); clearTimeout(queryTimer); clearTimeout(refreshTimer); closePopups(); releasePreview(); view.setVisible(false); root.hidden = true; root.inert = true;
  }
  function destroy() {
    if (gone) return;
    hide(); gone = true; actionGen++; off(); picker.remove(); view.destroy(); listing = { items: [], capabilities: {} }; selection = null; uploadTarget = null; query = ''; pageMemory.clear(); pageCursors = [null]; location = filesLocation(); signal?.removeEventListener?.('abort', destroy);
  }
  signal?.addEventListener?.('abort', destroy, { once: true });
  if (signal?.aborted) destroy();
  return { show, hide, refresh, destroy, focus: () => active() ? view.focus() : null, focusSearch: () => { if (active()) view.focusSearch(); }, get location() { return { ...location }; } };
}
