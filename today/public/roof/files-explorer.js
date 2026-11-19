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
const folderLocation = item => item?.trashedAt ? null : item?.location ? filesLocation(item.location) : item?.kind === 'folder' && item.source?.kind === 'drive' && FOLDER.test(item.id || '') ? filesLocation({ kind: 'drive', folderId: item.id }) : null;
const errorText = error => clean(error?.message || error?.error, 240) || 'That didn’t finish. Refresh to check before trying again.';

export function createFilesExplorer(root, F, { service, onNavigate = () => false } = {}) {
  if (!service || typeof service.browse !== 'function' || typeof service.run !== 'function') throw new TypeError('InFlite Files needs its account-owned service.');
  const multi = new Map(); let selecting = false;
  const ui = F.ui, owner = F.session?.view?.user?.id, signal = F.signal, popups = new Set(), operations = new Set();
  let gone = false, visible = false, episode = 0, readGen = 0, actionGen = 0, queryTimer = 0, refreshTimer = 0, read = null, previewRead = null, previewURL = null, detailsSheet = null, detailsState = null;
  let location = filesLocation(), listing = { items: [], status: 'loading', capabilities: {} }, query = '', sort = 'name', mode = 'list', selection = null, details = true, preview = null, uploadTarget = null;
  let pendingMenu=null;let page = 0, pageCursors = [null], pageMemory = new Map();
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
    return [{ name: ({recent:'Recent',trash:'Trash',favourites:'Favourites'})[location.view] || 'My Drive', location: filesLocation({ kind: 'drive', view: location.view }) },
      ...(Array.isArray(listing.ancestors) ? listing.ancestors.filter(folder => FOLDER.test(folder?.id || '')).map(folder => ({ name: folder.name, location: filesLocation({ kind: 'drive', folderId: folder.id }) })) : []),
      ...(listing.folder && FOLDER.test(listing.folder.id || '') ? [{ name: listing.folder.name, location }] : [])];
  }
  function parentLocation() {
    const crumbs = breadcrumbs();
    return crumbs.length > 1 ? crumbs[crumbs.length - 2].location : null;
  }
  function model() {
    const values = items();
    return { ...listing, items: values, selecting, selectedKeys:[...multi.keys()],bulkActions:bulkActions(),view: mode, query, sort, selection, details, preview, locations: locations(), breadcrumbs: breadcrumbs(), parentLocation: parentLocation(), transfers: transfers(),
      page: page + 1, focusKey: pageMemory.get(page)?.focusKey,
      locationName: listing.folder?.name || listing.name || (location.kind === 'apps' ? 'From apps' : ({recent:'Recent',trash:'Trash',favourites:'Favourites'})[location.view] || 'My Drive'),
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
    multi.clear();
    page = 0; pageCursors = [null]; pageMemory.clear();
    if (clearSelection) { selection = null; releasePreview(); }
  }
  async function refresh({ reset = false } = {}) {
    if (!active()) return false;
    // This read already captures the latest query and resource state. Pending
    // invalidations must not restart it or disable freshly rendered rows again.
    clearTimeout(queryTimer); queryTimer = 0;
    clearTimeout(refreshTimer); refreshTimer = 0;
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
      for(const [key,version] of multi)if(!items().some(item=>item.key===key&&item.version===version))multi.delete(key);
      if (selection && !items().some(item => item.key === selection)) { selection = null; releasePreview(); }
      if (preview && items().find(item => item.key === preview.key)?.version !== preview.version) releasePreview();
      paint();if(pendingMenu){const key=pendingMenu;pendingMenu=null;const item=items().find(x=>x.key===key);if(item)menu(item)}return true;
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
    pendingMenu=null;closePopups();
    if (onNavigate(next) !== true) show(next);
  }
  function select(item, {multiple=false,range=false}={}) {
    const current = resource(item);
    if (!current) return;
    if((selecting||multiple)&&current.source?.kind==='drive'){selecting=true;const rows=items(),anchor=[...multi.keys()].at(-1)||selection,a=rows.findIndex(value=>value.key===anchor),b=rows.findIndex(value=>value.key===current.key);if(range&&a>=0&&b>=0){for(const value of rows.slice(Math.min(a,b),Math.max(a,b)+1))if(value.source?.kind==='drive'&&multi.size<100)multi.set(value.key,value.version);}else if(multi.has(current.key))multi.delete(current.key);else if(multi.size<100)multi.set(current.key,current.version);paint();return;}
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
    if(active()&&listing.status==='loading'){pendingMenu=item.key;return}
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
    const mine = ++actionGen, openingEpisode = episode, appHandoff = currentItem?.source?.kind === 'app' || ['attach-mail', 'import-fitness'].includes(action);
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
      handle.now(); refresh({ reset: true });
    };
    handle = sheet({ sheet: newFolder ? 'files-new-folder' : 'files-rename', title: newFolder ? 'New folder' : 'Rename', focus: name, body, acts: [{ label: newFolder ? 'Create folder' : 'Save name', primary: true, run: save }] });
    name.addEventListener('keydown', event => { if (event.key === 'Enter' && !event.isComposing) { event.preventDefault(); save(); } });
  }
  function remove(item,action='delete') {
    if (!resource(item) || item.source?.kind !== 'drive') return;
    closePopups(); let handle, pending = false;
    const error = ui.el('p', { role: 'status', hidden: true });
    const body = ui.el('div', { class: 'ifx-form' }, ui.el('p', { text: action==='trash'?'This item and its contents will stay in Trash for 30 days. Storage remains in use until permanently deleted.':item.trashedAt?'This item and its contents will be permanently deleted. This cannot be undone.':item.kind === 'folder' ? 'Only empty folders can be deleted. This can’t be undone.' : 'This file will be removed from My Drive. This can’t be undone.' }), error);
    handle = sheet({ sheet: 'files-delete', title: `${action==='trash'?'Move to Trash':item.trashedAt?'Delete forever':'Delete'}: ${clean(item.name)}?`, body, acts: [{ label: action==='trash'?'Move to Trash':item.trashedAt?'Delete forever':'Delete', destructive: true, run: async () => {
      if (pending || handle.closed) return; pending = true; handle.setBusy(true);
      const answer = await execute(item, action, { input: { version: item.version }, current: () => !handle.closed });
      if (!active() || handle.closed) return; pending = false; handle.setBusy(false);
      if (answer?.ok === false) { error.hidden = false; error.textContent = clean(answer.error, 240) || 'That file couldn’t be deleted.'; return; }
      if (selection === item.key) { selection = null; releasePreview(); }
      handle.now(); refresh({ reset: true });
    } }] });
  }
  function move(item,action='move',batchItems=null) {
    if (!resource(item) || item.source?.kind !== 'drive') return;
    closePopups(); let target = filesLocation(), generation = 0, controller = null, handle, pending = false, destinationReady = false, pickerPage = 0, pickerCursors = [null], nextCursor = null;
    const path = ui.el('div', { class: 'ifx-path' }), folders = ui.el('div', { class: 'ifx-move-folders' }), status = ui.el('p', { role: 'status' });
    const previous = ui.el('button', { type: 'button', class: 'ifx-icon-button', 'aria-label': 'Previous folder page', on: { click: () => load(target, -1) } }, filesIcon('back'));
    const next = ui.el('button', { type: 'button', class: 'ifx-icon-button', 'aria-label': 'Next folder page', on: { click: () => load(target, 1) } }, filesIcon('chevron'));
    const pageNumber = ui.el('span', { class: 'ifx-page-number' }), pager = ui.el('nav', { class: 'ifx-pager', 'aria-label': 'Destination folder pages', hidden: true }, previous, pageNumber, next);
    const copiedName=['copy','restore'].includes(action)&&!batchItems?ui.el('input',{type:'text',maxlength:255,value:action==='copy'?'Copy of '+item.name:item.name,'aria-label':action==='copy'?'Copy name':'Restored name'}):null;
    const body = ui.el('div', { class: 'ifx-form' },...(copiedName?[ui.el('label',{},ui.el('span',{text:'Name'}),copiedName)]:[]), path, status, folders, pager);
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
        destinationReady = (['copy','restore'].includes(action)||item.parentId!==target.folderId||batchItems)&&item.id!==target.folderId&&!batchItems?.some(value=>value.id===target.folderId); handle.setBusy(!destinationReady);
        status.textContent = !destinationReady ? 'Choose a different destination folder.' : children.length ? 'Choose a destination folder.' : 'No folders inside this location.';
      } catch (error) { if (current()) { if (error?.status === 409 && pickerPage > 0) return load(target); status.textContent = errorText(error); } }
    };
    handle = sheet({ sheet: 'files-move', title: `${action==='copy'?'Copy':action==='restore'?'Restore':'Move'} ${batchItems?batchItems.length+' selected items':clean(item.name)}`, body, onClose: () => controller?.abort(), acts: [{ label: action==='copy'?'Copy here':action==='restore'?'Restore here':'Move here', primary: true, run: async () => {
      if (pending || handle.closed || !destinationReady) return;
      pending = true; handle.setBusy(true);
      const input={parentId:target.folderId,version:item.version,...(copiedName?{name:clean(copiedName.value)}:{})};
      const answer=batchItems?await executeBatch(batchItems,action,input,()=>!handle.closed):await execute(item,action,{input,current:()=>!handle.closed});
      if (!active() || handle.closed) return; pending = false; handle.setBusy(false);
      if (answer?.ok === false&&!answer.results) { status.textContent = clean(answer.error, 240) || 'This file couldn’t be moved.'; return; }
      handle.now();if(batchItems)reportBatch(answer,batchItems,action);multi.clear();selecting=false;selection = null; releasePreview(); refresh({ reset: true });
    } }] });
    load(target);
  }
  async function dispatch(item, id) {
    // History reads the server's latest version. A refresh after replacement
    // must not silently consume an action selected in the already-open menu.
    if(id==='history'&&active()&&item.source?.kind==='drive'&&items().some(value=>value.id===item.id))return import('./files-history.js').then(m=>active()&&m.history({F,ui,service,active,live,sheet,refresh,root,resource,errorText},item));
    const current = resource(item);
    if (!current || !activeActions(current).some(action => action.id === id)) return;
    if (id === 'open' && folderLocation(current)) return navigate(folderLocation(current));
    if (id === 'rename' && current.source?.kind === 'drive') return nameForm(current);
    if(id==='restore-to'&&current.source?.kind==='drive')return move(current,'restore');
    if (['move','copy'].includes(id) && current.source?.kind === 'drive') return move(current,id);
    if (['delete','trash'].includes(id) && current.source?.kind === 'drive') return remove(current,id);
    if(id==='replace'&&current.source?.kind==='drive')return import('./files-history.js').then(m=>active()&&m.replaceFile({F,ui,service,active,live,sheet,refresh,root,resource,errorText},current));
    if (id === 'preview' && current.source?.kind === 'drive') {
      if(current.mime==='application/pdf'||current.mime?.startsWith('image/')){
        const mine=episode,m=await import('./files-viewer350.js');if(!active()||mine!==episode||!resource(current))return;
        return m.openViewer(F,{item:current,items:items().filter(x=>x.source?.kind==='drive'&&x.mime?.startsWith('image/')&&!x.trashedAt),service,sheet,current:()=>active()&&mine===episode});
      }return previewFile(current);
    }
    const answer = await execute(current, id,{input:{version:current.version}});
    if(active()&&answer?.ok!==false&&current.source?.kind==='drive'&&['restore','favourite'].includes(id))refresh({reset:true});
    if (active() && answer?.error) F.toast(clean(answer.error, 240));
  }
  const selectedItems=()=>items().filter(item=>multi.get(item.key)===item.version&&item.source?.kind==='drive');
  function bulkActions(){
    const values=selectedItems();if(!values.length)return[];
    const common=id=>values.every(item=>activeActions(item).some(action=>action.id===id));
    return [['move','Move','folder'],['copy','Copy','copy'],['trash','Move to Trash','delete'],['restore','Restore','restore'],['delete','Delete forever','delete']].filter(([id])=>common(id)).map(([id,label,icon])=>({id,label,icon}));
  }
  async function executeBatch(values,action,input={},permitted=()=>true){
    if(!active()||typeof service.batch!=='function')return{ok:false,error:'Batch actions are not available.'};
    const controller=new AbortController(),mine=++actionGen,at=episode;operations.add(controller);
    const current=()=>active()&&episode===at&&mine===actionGen&&!controller.signal.aborted&&permitted();
    try{return await service.batch(values.map(item=>({key:item.key,version:item.version})),action,input,{signal:controller.signal,current});}
    catch(error){return current()?{ok:false,error:errorText(error)}:{ok:false,cancelled:true};}
    finally{operations.delete(controller);}
  }
  function reportBatch(answer,values,action){
    if(!active()||answer?.cancelled)return;
    if(!answer?.results){if(answer?.error)F.toast(answer.error);return;}
    const failed=answer.results.filter(result=>result.ok===false),done=answer.results.length-failed.length;
    if(!failed.length){F.toast(`${done} ${done===1?'item':'items'} updated.`);return;}
    const body=ui.el('div',{class:'ifx-form'},ui.el('p',{text:`${done} updated. ${failed.length} need attention; completed actions were kept.`}),...failed.map(result=>ui.el('p',{text:`${clean(values.find(item=>item.key===result.key)?.name||'Item')}: ${clean(result.error,240)||'Refresh before trying again.'}`})));
    sheet({sheet:'files-batch-results',title:'Some items need attention',body});
  }
  function bulkAction(action){
    const values=selectedItems();if(listing.status!=='ready'||!values.length||!bulkActions().some(value=>value.id===action))return;
    if(['move','copy'].includes(action))return move(values[0],action,values);
    closePopups();let handle,pending=false;
    const words=action==='trash'?'These items and their contents will stay in Trash for 30 days.':action==='delete'?'These items and their contents will be permanently deleted. This cannot be undone.':'Restore these items to their original folders, or My Drive if those folders are gone.';
    handle=sheet({sheet:'files-batch',title:`${action==='trash'?'Move to Trash':action==='delete'?'Delete forever':'Restore'} ${values.length} items?`,body:ui.el('p',{text:words}),acts:[{label:action==='trash'?'Move to Trash':action==='delete'?'Delete forever':'Restore',destructive:action!=='restore',primary:action==='restore',run:async()=>{if(pending||handle.closed)return;pending=true;handle.setBusy(true);const answer=await executeBatch(values,action,{},()=>!handle.closed);if(!active()||handle.closed)return;handle.now();multi.clear();selecting=false;refresh({reset:true});reportBatch(answer,values,action);}}]});
  }
  function startDrag(item,data){
    const current=resource(item);if(!current||!data||typeof service.prepareDrag!=='function')return false;
    const values=multi.has(item.key)?selectedItems():[current],token=service.prepareDrag(values.map(value=>({key:value.key,version:value.version})));if(!token)return false;
    data.setData('application/x-inflite-files-token',token);data.effectAllowed='copyMove';return true;
  }
  async function folderDrop(item,data,copy){
    const target=resource(item);if(!target||target.kind!=='folder'||target.trashedAt||typeof service.resolveDrag!=='function')return;
    let values;try{values=service.resolveDrag(data.getData('application/x-inflite-files-token'),{current:active});}catch(_){return;}
    if(!values?.length)return F.toast('Those files changed. Select them again.');
    if(values.some(value=>value.id===target.id))return F.toast('A folder cannot be moved into itself.');
    const answer=await executeBatch(values,copy?'copy':'move',{parentId:target.id});if(active()){multi.clear();selecting=false;refresh({reset:true});reportBatch(answer,values,copy?'copy':'move');}
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
    onSelectionMode(){selecting=!selecting;multi.clear();paint();},onSelectAll(){if(!active()||listing.status!=='ready')return;selecting=true;for(const item of items())if(item.source?.kind==='drive'&&multi.size<100)multi.set(item.key,item.version);paint();},onClearSelection(){multi.clear();paint();},onBulk:bulkAction,onDragStart:startDrag,onFolderDrop:folderDrop,
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
    visible = false;pendingMenu=null; episode++; readGen++; read?.abort(); for (const controller of operations) controller.abort(); operations.clear(); clearTimeout(queryTimer); clearTimeout(refreshTimer); closePopups(); releasePreview(); view.setVisible(false); root.hidden = true; root.inert = true;
  }
  function destroy() {
    if (gone) return;
    hide(); gone = true; actionGen++; multi.clear(); off(); picker.remove(); view.destroy(); listing = { items: [], capabilities: {} }; selection = null; uploadTarget = null; query = ''; pageMemory.clear(); pageCursors = [null]; location = filesLocation(); signal?.removeEventListener?.('abort', destroy);
  }
  signal?.addEventListener?.('abort', destroy, { once: true });
  if (signal?.aborted) destroy();
  return { show, hide, refresh, destroy, focus: () => active() ? view.focus() : null, focusSearch: () => { if (active()) view.focusSearch(); }, get location() { return { ...location }; } };
}
