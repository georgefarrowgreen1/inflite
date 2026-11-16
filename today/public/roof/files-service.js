// Account-lived Files service: private Drive writes and app-owned virtual files.
// Explorer selection is local to each reader; only safe metadata is indexed.
import { createAppFilesIndex } from "./files-apps.js";
import { filterWorkspaceFiles, fileText } from "./files-metadata.js";
import { filesLocation } from "./files-location.js";

const ID = /^[A-Za-z0-9_-]{32}$/, MAX_FILE = 25 * 1024 * 1024;
const PREVIEW = /^(?:image\/(?:png|jpeg|gif|webp|avif)|audio\/(?:mpeg|mp4|ogg|wav|webm|aac|flac)|text\/(?:plain|csv)|application\/(?:json|pdf))$/;
const abort = () => new DOMException("This Files operation was released", "AbortError");
const label = (id, text, icon = id, other = {}) => ({ id, label: text, icon, ...other });
const keyOf = node => "drive:" + node.id;
const appKey = file => `app:${file.app}:${file.id}`;
const operation = () => crypto.randomUUID().replace(/-/g, "");
const valid = fn => { try { return !fn || fn() !== false; } catch (_) { return false; } };
const previewable = node => !node.trashedAt && node.status === "ready" && PREVIEW.test(node.mime) && (!/^(?:text\/|application\/json$)/.test(node.mime) || node.size <= 262144);

export function createFilesService(F, options = {}) {
  const owner = F.session.view?.user?.id, listeners = new Set(), nodes = new Map(), appRefs = new Map(), transfers = new Map(), writes = new Set(), drags = new Map();
  let dead = false, driveClient = null, drivePromise = null, activeUploads = 0, appReads = 0, sourceSignature = "", pendingAppEvent = false, driveEpoch = 0;
  let handingOff = false, journal=null;
  const durable = typeof indexedDB==='undefined' ? Promise.resolve(null) : import('./offline-store.js').then(m=>m.openOfflineStore(owner,{signal:F.signal})).then(async store=>{
    journal=store;for(const value of await store.list('upload'))if(value.kind==='upload'&&live()&&!transfers.has(value.id))transfers.set(value.id,{...value,controller:new AbortController(),status:'queued',progress:0,cancelled:false,node:null});
    if(live()){transferEvent();pump()}return store;
  }).catch(()=>null);
  const savedRecord=r=>({kind:'upload',id:r.id,name:r.name,mime:r.file.type,file:r.file,folderId:r.folderId,operationId:r.operationId||r.id,replacement:r.replacement||null});
  const retryTransfer=(id,{explicit=true}={})=>{const r=transfers.get(id);if(!live()||!r||r.status!=='failed'||!r.file)return;r.controller=new AbortController();r.explicitRetry=explicit;r.status='queued';r.error='';transferEvent();pump()};
  const reconnect=()=>{for(const r of transfers.values())if(r.status==='failed'&&r.retryable)retryTransfer(r.id,{explicit:false});pump()};
  if(typeof window!=='undefined')window.addEventListener('online',reconnect,{signal:F.signal});
  const acceptsApp = (app, node) => typeof options.runIntent === "function" && !!F.session.apps?.[app] && node.kind === "file" && node.status === "ready" && !node.trashedAt && (app === "mail" ? F.session.view?.apps?.mail === true && node.size <= 20 * 1024 * 1024 : app === "fitness" && /\.(fit|gpx|tcx|zwo|erg|mrc|zip)$/i.test(node.name));
  const live = () => !dead && !!owner && !F.signal.aborted && F.session.view?.user?.id === owner;
  const current = lease => live() && !lease?.signal?.aborted && valid(lease?.current);
  const assert = lease => { if (!current(lease)) throw abort(); };
  const emit = change => { if (live()) for (const registration of [...listeners]) { if (!live()) break; if (listeners.has(registration)) try { registration.fn(change); } catch (_) {} } };
  const open = (query = "", location = null) => { const selected = location ? filesLocation(location) : null; if (live() && (!location || selected)) return options.openExplorer?.(fileText(query, 160), selected); };
  const index = createAppFilesIndex(F, options);
  async function drive(lease) {
    assert(lease);
    if (!driveClient) {
      drivePromise ||= import("./files-drive.js").then(module => { if (!live()) throw abort(); return driveClient ||= module.createDriveClient(F); });
      await drivePromise;
    }
    assert(lease); return driveClient;
  }
  function remember(node) {
    nodes.delete(node.id); nodes.set(node.id, Object.freeze({ ...node }));
    if (nodes.size > 1000) nodes.delete(nodes.keys().next().value);
    return nodes.get(node.id);
  }
  function driveResource(value) {
    const node = remember(value), ready = node.status === "ready";
    if(node.trashedAt) return { key:keyOf(node),...node,source:{kind:"drive",id:"drive"},sourceLabel:"Trash",actions:[label("restore","Restore","restore",{primary:true}),label("restore-to","Restore somewhere else","folder"),label("delete","Delete forever","delete",{destructive:true})],primaryAction:"restore" };
    const actions = node.kind === "folder" ? [label("open", "Open", "folder", { primary: true })] : ready ? [
      ...(previewable(node) ? [label("preview", "Preview", "preview", { primary: true })] : []), label("download", "Download", "download", { primary: !previewable(node) }), label("history","Version history","restore"),label("replace","Replace file","upload"),
    ] : [];
    if (acceptsApp("mail", node)) actions.push(label("attach-mail", "Attach in Mail", "mail"));
    if (acceptsApp("fitness", node)) actions.push(label("import-fitness", "Import into Fitness", "fitness"));
    if(ready&&options.remind)actions.push(label("remind","Remind me","bell"));
    if (ready) actions.push(label("rename", "Rename", "rename"), label("move", "Move", "folder"), ...(node.kind === "file" ? [label("copy","Copy","copy")] : []), label("favourite",node.favourite?"Remove favourite":"Add favourite","star"));
    actions.push(label(ready?"trash":"delete",ready?"Move to Trash":"Remove pending upload","delete",{destructive:true}));
    return { key: keyOf(node), ...node, source: { kind: "drive", id: "drive" }, sourceLabel: "My Drive", actions,
      primaryAction: node.kind === "folder" ? "open" : ready ? previewable(node) ? "preview" : "download" : null,
      ...(node.kind === "folder" ? { location: { kind: "drive", folderId: node.id, view: "folder" } } : {}) };
  }
  function appResource(file) {
    const key = appKey(file); appRefs.delete(key); appRefs.set(key, file);
    if (appRefs.size > 500) appRefs.delete(appRefs.keys().next().value);
    return { key, id: file.id, source: { kind: "app", id: file.app }, kind: "file", name: file.name, mime: file.mime,
      size: file.size, modifiedAt: file.modifiedAt, category: file.category, sourceLabel: file.source || file.app,
      actions: [label(file.intent, "Open", "open", { primary: true }), ...(file.downloadIntent && file.downloadIntent !== file.intent ? [label(file.downloadIntent, "Download", "download")] : []), ...(file.shareIntent ? [label(file.shareIntent, "Share", "share")] : [])], primaryAction: file.intent };
  }
  function pruneApps() {
    const keep = new Set(index.retain([...appRefs.values()]));
    for (const [key, file] of appRefs) if (!keep.has(file)) appRefs.delete(key);
  }
  const signature = sources => JSON.stringify(sources.map(source => [source.app, source.status, source.more, source.files]));
  const off = index.subscribe(() => {
    if (!live()) return;
    pruneApps();
    const next = signature(index.snapshot());
    if (next === sourceSignature) return;
    sourceSignature = next;
    if (appReads) { pendingAppEvent = true; return; }
    emit({ kind: "resources", source: { kind: "app" } });
  });
  function locations(location) {
    if (!live()) return [];
    return [
      { name: "My Drive", icon: "folder", kind: "drive", selected: location?.kind === "drive" && location.view === "folder", location: { kind: "drive", folderId: null, view: "folder" } },
      { name: "Recent", icon: "clock", kind: "drive", selected: location?.kind === "drive" && location.view === "recent", location: { kind: "drive", folderId: null, view: "recent" } },
      { name:"Favourites",icon:"star",kind:"drive",selected:location?.kind==="drive"&&location.view==="favourites",location:{kind:"drive",folderId:null,view:"favourites"} },
      { name:"Trash",icon:"delete",kind:"drive",selected:location?.kind==="drive"&&location.view==="trash",location:{kind:"drive",folderId:null,view:"trash"} },
      { name: "From apps", icon: "grid", kind: "apps", selected: location?.kind === "apps" && !location.app, location: { kind: "apps", app: null } },
      ...index.snapshot().map(source => ({ name: source.name, kind: "apps", icon: "folder", selected: location?.kind === "apps" && location.app === source.app, location: { kind: "apps", app: source.app } })),
    ];
  }
  function notices(sources) {
    return sources.flatMap(source => {
      const name = source.name, state = source.status;
      const text = state === "locked" ? `Unlock ${name} to see its files.` : state === "signin" ? `Sign in to ${name} to see its files.` : state === "loading" ? `Loading ${name}…` : state === "error" ? `${name} files couldn’t be loaded.` : source.more ? `${name}: showing recent files. Open the app for more.` : !source.files.length ? `${name} has no files to show here yet.` : "";
      return text ? [{ id: source.app, resourceKey: "source:" + source.app, text, actions: state === "loading" ? [] : [label("open-app", `Open ${name}`, "open")] }] : [];
    });
  }
  async function browse(location, { query = "", sort = "name", cursor = null, foldersOnly = false, refresh = false, ...lease } = {}) {
    assert(lease); const selected = filesLocation(location);
    if (!selected || !["name", "modified", "size"].includes(sort)) throw new Error("That Files location is invalid.");
    query = fileText(query, 160);
    if (selected.kind === "apps") {
      const available = index.snapshot().filter(source => !selected.app || source.app === selected.app);
      if (!selected.app && !query && !selected.category) return { name: "From apps", status: "ready", capabilities: {}, cursor: null, items: available.map(source => ({
        key: "source:" + source.app, id: source.app, source: { kind: "app", id: source.app }, kind: "folder", name: source.name, sourceLabel: ({ ready: "App files", locked: "Unlock to browse", signin: "Sign in to browse", loading: "Open to browse", error: "Open app to retry" })[source.status],
        location: { kind: "apps", app: source.app }, actions: [label("open", "Open", "folder", { primary: true })], primaryAction: "open",
      })) };
      appReads++;
      try {
        const answer = await index.read({ app: selected.app, query, current: lease.current, signal: lease.signal, refresh }); assert(lease);
        const files = filterWorkspaceFiles(answer.files, { query, type: selected.category || "all", sort: sort === "modified" ? "recent" : sort });
        return { name: selected.app ? available[0]?.name || "App files" : "From apps", status: "ready", capabilities: {}, cursor: null, items: files.map(appResource), notices: notices(answer.sources) };
      } finally {
        appReads--; if (!appReads && pendingAppEvent) { pendingAppEvent = false; queueMicrotask(() => emit({ kind: "resources", source: { kind: "app" } })); }
      }
    }
    const api = await drive(lease);
    const epoch = driveEpoch;
    const answer = await api.browse({ parentId: selected.folderId, view: query && selected.view === "folder" && !selected.folderId ? "search" : selected.view, sort, cursor, query, ...(foldersOnly ? { kind: "folder" } : {}), signal: lease.signal, current: lease.current }); assert(lease); if(epoch!==driveEpoch) throw abort();
    if (!query && !cursor && !answer.cursor && !foldersOnly && selected.view === "folder") {
      const ids = new Set(answer.items.map(item => item.id));
      for (const [id, node] of nodes) if (node.parentId === selected.folderId && !ids.has(id)) nodes.delete(id);
    }
    const items = answer.items.filter(item => !foldersOnly || item.kind === "folder").map(driveResource);
    return { ...answer, name: ({trash:"Trash",favourites:"Favourites",recent:"Recent"})[selected.view], ancestors: answer.ancestors.filter(item => item.id !== answer.folder?.id), status: "ready", items,
      capabilities: { upload: selected.view === "folder" && !query, newFolder: selected.view === "folder" && !query },
      cursor: foldersOnly && answer.items.some(item => item.kind !== "folder") ? null : answer.cursor };
  }
  function resourceEvent(parentId) { emit({ kind: "resources", source: { kind: "drive", id: "drive" }, folderId: parentId }); }
  async function writing(fn) {
    const promise = Promise.resolve().then(fn); writes.add(promise);
    try { return await promise; } finally { writes.delete(promise); }
  }
  function download(node, lease) {
    assert(lease);
    const anchor = F.ui.el("a", { href: `/api/files/content?id=${encodeURIComponent(node.id)}&download=1`, download: node.name, hidden: true });
    document.body.append(anchor); anchor.click(); anchor.remove();
    try{options.activity?.put("download:"+operation(),{title:node.name,detail:"Sent to your browser’s downloads.",status:"handed-off",kind:"download"});}catch(_){}
  }
  async function run(key, action, { input = {}, ...lease } = {}) {
    assert(lease);
    if (typeof key === "string" && key.startsWith("source:") && action === "open-app") return { ok: index.gate(key.slice(7)) };
    if (typeof key === "string" && key.startsWith("app:")) {
      pruneApps(); const file = appRefs.get(key); if (!file) return { ok: false, error: "Open the original app to use this file." };
      return index.run(file, action, { current: () => current(lease) });
    }
    const id = typeof key === "string" && key.startsWith("drive:") ? key.slice(6) : null;
    const node = id && ID.test(id) ? nodes.get(id) : null;
    if (action !== "create-folder" && !node) return { ok: false, error: "That file is no longer available. Refresh to check." };
    if (action === "attach-mail" || action === "import-fitness") {
      const app = action === "attach-mail" ? "mail" : "fitness";
      if (handingOff || !acceptsApp(app, node) || node.version !== input.version) return { ok: false, error: "Refresh the file and try again." };
      const token = prepareDrag([{ key, version: input.version }]);
      if (!token) return { ok: false, error: "That file is no longer available." };
      handingOff = true;
      try { return await options.runIntent(app, app === "mail" ? "compose-attach" : "import-drive", "drop:" + token, { signal: lease.signal, current: () => current(lease) && acceptsApp(app, node) }); }
      finally { drags.delete(token); handingOff = false; }
    }
    if (action === "download" && node.kind === "file" && node.status === "ready" && !node.trashedAt) { download(node, lease); return { ok: true }; }
    if(action==="remind"&&node.status==="ready"&&!node.trashedAt){await options.remind?.({app:"files",id:node.id});return {ok:true}}
    if (action === "preview") {
      const api = await drive(lease); assert(lease);
      if (!Number.isSafeInteger(input.version) || input.version < 1 || node.version !== input.version) return { ok: false, error: "That file changed. Refresh before opening it." };
      if (!previewable(node)) return { ok: false, error: "Download this file to open it." };
      const fresh = await api.item(id, lease); assert(lease);
      if (fresh.version !== input.version || fresh.status !== "ready" || fresh.trashedAt) return { ok: false, error: "That file changed. Refresh to open the latest version." };
      const blob = await api.content(id, lease); assert(lease);
      return { ok: true, blob: blob.slice(0, blob.size, node.mime) };
    }
    if(action==='history'){const api=await drive(lease);return {ok:true,...await api.history(id,lease)}}
    if(action==='restore-version'){const api=await drive(lease),result=await api.restoreVersion({id,version:input.version,versionId:input.versionId,operationId:operation()},lease);assert(lease);remember(result);resourceEvent(node.parentId);return {ok:true}}
    return writing(async () => {
      assert(lease); const api = await drive(lease); assert(lease); let result;
      if (action === "create-folder" && key == null) result = await api.createFolder(input.name, input.parentId ?? null, operation(), lease);
      else if (action === "rename") result = await api.rename(id, input.version, input.name, lease);
      else if (action === "move") result = await api.move(id, input.version, input.parentId ?? null, lease);
      else if (action === "trash") result = await api.trash(id,input.version,lease);
      else if (action === "restore") result = await api.restore(id,input.version,input,lease);
      else if (action === "favourite") result = await api.favourite(id,input.version,!node.favourite,lease);
      else if (action === "copy" && node.kind === "file") result = await api.copy(id,input.version,input.parentId??null,input.name||"Copy of "+node.name,operation(),lease);
      else if (action === "delete") { await api.remove(id, input.version, lease); driveEpoch++; nodes.clear(); resourceEvent(node.parentId); return { ok: true }; }
      else return { ok: false, error: "That action is unavailable for this file." };
      assert(lease); driveEpoch++; if(["trash","restore"].includes(action))nodes.clear(); remember(result); resourceEvent(result.parentId); if (action === "move") resourceEvent(node.parentId); return { ok: true };
    });
  }
  async function read(key,{version,...lease}={}) {
    assert(lease);
    const id=typeof key==="string"&&key.startsWith("drive:")?key.slice(6):null,node=id&&nodes.get(id);
    if(!node||node.kind!=="file"||node.trashedAt||node.status!=="ready"||node.version!==version)throw new Error("That file changed. Refresh before opening it.");
    const api=await drive(lease),fresh=await api.item(id,lease);assert(lease);
    if(fresh.version!==version||fresh.trashedAt||fresh.status!=="ready")throw new Error("That file changed. Refresh before opening it.");
    const blob=await api.content(id,lease);assert(lease);
    if(blob.size!==fresh.size)throw new Error("The file could not be read completely.");
    return {file:new File([blob],fresh.name,{type:fresh.mime,lastModified:fresh.modifiedAt}),item:driveResource(fresh)};
  }
  async function save(file,{folderId=null,name=file?.name,...lease}={}) {
    assert(lease);if(!(file instanceof Blob)||file.size>MAX_FILE||typeof name!=="string"||!name.trim())throw new Error("Choose a named file no larger than 25 MB.");
    return writing(async()=>{
      const api=await drive(lease),spec={name,parentId:folderId,mime:file.type||"application/octet-stream",size:file.size,operationId:operation()};let reserved;
      const note=(status,detail,progress)=>{try{if(live())options.activity?.put(spec.operationId,{title:name,kind:"upload",status,detail,...(Number.isFinite(progress)?{progress}:{}),actions:[]});}catch(_){}};
      note("running","Preparing save");
      try { reserved=await api.reserve(spec,lease);assert(lease); const ready=await api.uploadContent(reserved.id,file,{...lease,onProgress:value=>note("running","Saving",value)});assert(lease);driveEpoch++; const item=driveResource(ready);resourceEvent(folderId);note("succeeded","Saved to My Drive",1);return{item}; }
      catch(error){if(live()&&error?.name==="AbortError")try{const node=reserved||await api.reserve(spec),fresh=await api.item(node.id);if(fresh.version<=2&&(reserved||fresh.version===1&&fresh.status==="pending"))await api.remove(fresh.id,fresh.version);}catch(_){}note(error?.name==="AbortError"?"cancelled":"failed",error?.name==="AbortError"?"Cancelled":fileText(error?.message,240)||"Refresh Files to check the save.");throw error;}
    });
  }
  async function batch(values,action,input={},lease={}) {
    assert(lease);if(!Array.isArray(values)||!values.length||values.length>100||!["move","copy","trash","restore","delete","favourite"].includes(action))throw new Error("Choose up to 100 supported files.");
    const captured=new Map(values.map(value=>[value.key,nodes.get(value.key?.slice(6))]));
    const results=[];for(const value of values){assert(lease);try{const saved=captured.get(value.key);if(saved&&!nodes.has(saved.id))remember(saved);const result=await run(value.key,action,{...lease,input:{...input,version:value.version}});results.push({key:value.key,...result});}catch(error){assert(lease);results.push({key:value.key,ok:false,error:fileText(error?.message,240)||"That action failed."});}}
    if(["trash","restore","delete"].includes(action)){nodes.clear();resourceEvent(null);}
    return{ok:results.every(result=>result.ok!==false),results};
  }
  function prepareDrag(values) {
    if(!live()||!Array.isArray(values)||!values.length||values.length>100)return null;
    const refs=[];for(const value of values){const node=typeof value.key==="string"&&nodes.get(value.key.slice(6));if(!node||!value.key.startsWith("drive:")||node.trashedAt||node.status!=="ready"||node.version!==value.version)return null;refs.push({key:value.key,version:value.version});}
    const token=operation();drags.set(token,{refs,at:Date.now()});while(drags.size>16)drags.delete(drags.keys().next().value);return token;
  }
  function resolveDrag(token,lease={}) {
    assert(lease);const drag=drags.get(token);if(!drag||Date.now()-drag.at>60000){drags.delete(token);return[];}
    const items=[];for(const ref of drag.refs){const node=nodes.get(ref.key.slice(6));if(!node||node.trashedAt||node.status!=="ready"||node.version!==ref.version)return[];items.push(driveResource(node));}return items;
  }
  function publicTransfers() {
    if (!live()) return [];
    return [...transfers.values()].map(record => ({ id: record.id, name: record.name, status: record.status, progress: record.progress,
      label: record.error || (record.status==="queued"&&globalThis.navigator?.onLine===false?"Kept on this device · waiting for a connection":null) || ({ queued: "Waiting", uploading: record.progress >= 1 ? "Finishing…" : "Uploading", reserving: "Preparing…", done: "Uploaded", cancelled: "Cancelled", failed: "Upload failed" })[record.status], cancelable: ["queued", "reserving", "uploading"].includes(record.status) }));
  }
  const transferEvent = () => {
    if(live())for(const record of transfers.values())try{options.activity?.put(record.id,{title:record.name,detail:record.error||({queued:"Waiting",reserving:"Preparing upload",uploading:"Uploading",done:"Uploaded",cancelled:"Cancelled",failed:"Refresh Files to check before choosing the file again."})[record.status],kind:"upload",status:({queued:"queued",reserving:"running",uploading:"running",done:"succeeded",cancelled:"cancelled",failed:"failed"})[record.status],...(["uploading","done"].includes(record.status)&&Number.isFinite(record.progress)?{progress:record.progress}:{}),actions:["queued","reserving","uploading"].includes(record.status)?[{id:"cancel",label:"Cancel",run:()=>cancelTransfer(record.id)}]:record.status==="failed"?[{id:"retry",label:"Retry",run:()=>retryTransfer(record.id)},{id:"discard",label:"Discard",run:()=>cancelTransfer(record.id)},{id:"review",label:"Review",run:recovery}]:[]});}catch(_){}
    emit({ kind: "transfers" });
  };
  function trimTransfers() { for (const [id, record] of transfers) { if (transfers.size <= 40) break; if (["done", "cancelled", "failed"].includes(record.status)) transfers.delete(id); } }
  async function uploadOne(record) {
    activeUploads++;
    const lease = { current: () => live() && !record.cancelled, signal: record.controller.signal };
    try {
      const api = await drive(lease); record.status = "reserving"; transferEvent();
      record.reservation = { name: record.name, mime: record.file.type || "application/octet-stream", size: record.file.size, parentId: record.folderId, operationId: record.operationId||record.id };
      if(record.replacement){
        const target=record.replacement;
        await api.reserveReplacement({id:target.id,version:target.version,size:record.file.size,mime:record.file.type||'application/octet-stream',operationId:record.operationId||record.id},lease);assert(lease);
        record.node={id:record.operationId||record.id};
      }else{
        try{record.node = await api.reserve(record.reservation, lease)}catch(error){
          if(error.status!==410||!record.explicitRetry)throw error;
          record.operationId=operation();await journal?.put(savedRecord(record));record.reservation.operationId=record.operationId;record.node=await api.reserve(record.reservation,lease);
        }
      }assert(lease);
      record.status = "uploading"; transferEvent();
      const ready = await (record.replacement?api.replaceContent:api.uploadContent)(record.node.id, record.file, { ...lease, onProgress: fraction => { if (current(lease)) { record.progress = fraction; transferEvent(); } } }); assert(lease);
      await journal?.remove(record.id);assert(lease);remember(ready); record.status = "done"; record.progress = 1; resourceEvent(record.folderId);
    } catch (error) {
      record.status = record.cancelled || error?.name === "AbortError" ? "cancelled" : "failed";
      record.retryable=!error.status||[408,502,503].includes(error.status);
      if (record.status === "failed") record.error = fileText(error?.message, 240) || "The upload didn’t finish. Refresh to check.";
      if (live() && record.cancelled && !record.replacement && (record.node || record.reservation)) try {
        // Cancellation can hide a committed reservation's reply. Reconcile the
        // exact idempotent operation before cleanup; consumed operations cannot
        // create another item, and a changed account never enters this path.
        const api = await drive(), reserved = record.node || await api.reserve(record.reservation), fresh = await api.item(reserved.id);
        if (fresh.version <= 2 && (record.node || fresh.status === "pending" && fresh.version === 1)) await api.remove(fresh.id, fresh.version);
        resourceEvent(record.folderId);
      } catch (_) { /* An expired reservation is also reclaimed by the server. */ }
    } finally { if(record.status==="done"||record.cancelled){await journal?.remove(record.id).catch(()=>{});record.file=null}record.reservation = null; activeUploads--; trimTransfers(); transferEvent(); pump(); }
  }
  function pump() {
    if (!live() || globalThis.navigator?.onLine===false) return;
    for (const record of transfers.values()) {
      if (activeUploads >= 2) break;
      if (record.status === "queued") { record.status = "reserving"; record.promise = uploadOne(record); }
    }
  }
  async function upload(files, { folderId = null, current: accepting, replacement=null } = {}) {
    assert({ current: accepting });
    if (folderId !== null && (typeof folderId !== "string" || !ID.test(folderId))) throw new Error("Choose a valid destination folder.");
    files = [...files];
    if (!files.length) return { queued: 0 };
    if (files.length > 100 || [...transfers.values()].filter(record => ["queued", "reserving", "uploading"].includes(record.status)).length + files.length > 100) throw new Error("Choose up to 100 files at a time.");
    if (files.some(file => !(file instanceof Blob) || typeof file.name !== "string" || !file.name.trim() || /[\/\\\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/.test(file.name) || file.size > MAX_FILE)) throw new Error("Choose files no larger than 25 MB each.");
    const store=await durable;assert({current:accepting});
    if(typeof indexedDB!=='undefined'&&!store)throw Error('Files could not keep this upload. Try again before closing this page.');
    for (const file of files) {
      const id = operation(),record={ id, name: file.name, file, folderId,replacement, controller: new AbortController(), status: "queued", progress: 0, cancelled: false, node: null };
      await store?.put(savedRecord(record));assert({current:accepting});transfers.set(id,record);
    }
    trimTransfers(); transferEvent(); pump(); return { queued: files.length };
  }
  function cancelTransfer(id) {
    const record = transfers.get(id); if (!live() || !record || !["queued", "reserving", "uploading","failed"].includes(record.status)) return;
    record.cancelled = true; record.controller.abort();
    if(record.replacement)drive().then(api=>api.cancelReplacement(record.operationId||record.id)).catch(()=>{});
    if (["queued","failed"].includes(record.status)) { record.status = "cancelled"; record.file = null; journal?.remove(record.id).catch(()=>{}); }
    transferEvent();
  }
  const recovery=()=>live()&&import('./files-recovery350.js').then(m=>live()&&m.recover(F,{live,transfers,drive,assert,journal:()=>journal,operation,transferEvent,resourceEvent,retryTransfer,cancelTransfer,savedRecord}));
  const busy = () => live() && (activeUploads > 0 || writes.size > 0 || [...transfers.values()].some(record => ["queued", "reserving", "uploading"].includes(record.status)));
  async function flush({ timeoutMs = 2000 } = {}) {
    let timer, expired = false;
    const deadline = new Promise(resolve => { timer = setTimeout(() => { expired = true; resolve(); }, Math.max(0, Math.min(10000, timeoutMs))); });
    try {
      while (busy() && !expired) {
        const pending = [...writes, ...[...transfers.values()].map(record => record.promise).filter(Boolean)];
        if (!pending.length) break;
        await Promise.race([Promise.allSettled(pending), deadline]);
      }
    } finally { clearTimeout(timer); }
    return { lost: busy() ? 1 : 0 };
  }
  async function searchAccount(query,lease={}){
    assert(lease);const typed=fileText(query,160);if(typed.length<2)return [];
    const api=await drive(lease),answer=await api.browse({view:'search',query:typed,sort:'name',...lease});assert(lease);
    return answer.items.filter(item=>item.status==='ready'&&!item.trashedAt).slice(0,20).map(driveResource);
  }
  async function locate(id,lease={}){assert(lease);if(!ID.test(id||''))throw Error('That file reference is invalid.');const api=await drive(lease),item=await api.item(id,lease);assert(lease);if(item.status!=='ready'||item.trashedAt)throw Error('That file is no longer available.');return driveResource(item)}
  async function search(query) {
    if (!live()) return [];
    const typed = fileText(query, 160); if (!typed) return [];
    const appEntries = await index.search(typed); if (!live()) return [];
    const words = typed.toLocaleLowerCase().split(/\s+/).filter(Boolean);
    const driveEntries = [...nodes.values()].filter(node => node.status === "ready" && !node.trashedAt && words.every(word => node.name.toLocaleLowerCase().includes(word))).slice(0, 10).map(node => ({ app: null, title: node.name, sub: "My Drive", icon: "file", run: () => live() && nodes.has(node.id) && open(node.kind === "folder" ? "" : node.name, { kind: "drive", folderId: node.kind === "folder" ? node.id : node.parentId, view: "folder" }) }));
    return [...driveEntries, ...appEntries, { app: null, title: `Find “${typed}” in InFlite Files`, sub: "Search My Drive", icon: "file", run: () => open(typed) },
      ...(index.snapshot().length ? [{ app: null, title: `Find “${typed}” in app files`, sub: "Attachments, routes and workouts", icon: "file", run: () => open(typed, { kind: "apps", app: null }) }] : [])];
  }
  function destroy() {
    if (dead) return; dead = true; journal?.close(); off(); index.destroy(); driveClient?.destroy();
    for (const record of transfers.values()) { record.controller.abort(); record.file = null; }
    transfers.clear(); drags.clear(); nodes.clear(); appRefs.clear(); listeners.clear(); writes.clear();
    F.signal.removeEventListener("abort", destroy);
  }
  F.signal.addEventListener("abort", destroy, { once: true }); if (F.signal.aborted) destroy();
  return { browse, run, read, save, batch,locate,searchAccount, prepareDrag, resolveDrag, upload, locations, transfers: publicTransfers, cancelTransfer,recovery, busy, flush, search, open,
    update: app => index.update(app), changed: app => index.changed(app), destroy,
    subscribe(fn) { if (!live() || typeof fn !== "function") return () => {}; const registration = { fn }; listeners.add(registration); return () => listeners.delete(registration); } };
}
