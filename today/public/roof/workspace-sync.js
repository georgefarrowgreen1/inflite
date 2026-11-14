// Account-lived synchronization of layout metadata only. App objects, drafts,
// document names and content never cross this boundary.
import { restoreWorkspaceState, WORKSPACE_LIMITS } from "./workspace-state.js";
const sections = { fitness:["today","activities","routes","progress"],weather:["now","days","radar","warnings"],markets:["today","holdings","news"],chats:["chats","friends"],mail:["people","updates","later","done"] };
const homes = {fitness:"/fitness/#today",weather:"/weather/#now",markets:"/markets/#today",chats:"/chats/",mail:"/mail/"};
const abort = () => new DOMException("Workspace sync was released", "AbortError");
const same = (a,b) => JSON.stringify(a) === JSON.stringify(b);
export function workspaceCloudState(value, owner) {
  const restored = restoreWorkspaceState(value, owner, 0);
  return { version:2,userId:owner,activeId:restored.activeId,workspaces:restored.workspaces.map(w=>({...w,updatedAt:0,panes:w.panes.map(p=>({id:p.app,app:p.app,route:[homes[p.app],...sections[p.app].map(k=>`/${p.app}/#${k}`)].includes(p.route)?p.route:homes[p.app]}))})) };
}
function cloudReply(value, owner) {
  if (!value || !Number.isSafeInteger(value.revision) || value.revision<0 || !Number.isSafeInteger(value.updatedAt) || value.updatedAt<0 || (value.revision===0)!==(value.state===null)) throw Error("Workspace sync received an unexpected answer.");
  if(value.state!==null) {
    const state=workspaceCloudState(value.state,owner);
    if(!same(state,value.state))throw Error("Workspace sync received an unexpected layout.");
    return {...value,state};
  }
  return {revision:0,state:null,updatedAt:value.updatedAt};
}
export function createWorkspaceSync(F,{store,onChange=()=>{},onStatus=()=>{},storage,pollMs=30000,debounceMs=350}={}) {
  const owner=F.session.view?.user?.id, listeners=new Set(), pending=new Set(), key=`ifl:workspace-sync:v1:${owner}`;
  let dead=false,started=false,flight=null,writing=false,debounce=0,poll=0,base=null,revision=null,uncertain=false,sequence=0,dialog=null,dialogPromise=null;
  let api;
  let state={state:"idle",message:"Your workspaces are kept on this device.",revision:0,updatedAt:0,dirty:false,hasCloud:false,uncertain:false,localConflict:false};
  const live=()=>!dead&&!!owner&&!F.signal.aborted&&F.session.view?.user?.id===owner;
  const check=()=>{if(!live())throw abort();};
  const local=()=>workspaceCloudState(store.read(),owner);
  try { storage ??= globalThis.localStorage; } catch (_) {}
  try {
    const text=storage?.getItem(key);
    if(text&&text.length<=WORKSPACE_LIMITS.storedBytes+1024){const kept=JSON.parse(text);if(kept.version===1&&Number.isSafeInteger(kept.revision)&&kept.revision>0&&same(workspaceCloudState(kept.base,owner),kept.base)){base=kept.base;revision=kept.revision;}}
  } catch (_) {}
  state={...state,revision:revision||0,hasCloud:!!base,dirty:!base||!same(local(),base)};
  const notify=(patch={})=>{
    if(!live())return;
    state=Object.freeze({...state,...patch,dirty:!base||!same(local(),base),uncertain,localPersisted:!store.hasLocalData||store.persisted});
    try{onStatus(state);}catch(_){}
    for(const entry of [...listeners]){if(!live())break;if(listeners.has(entry))try{entry.fn(state);}catch(_){}}
  };
  const remember=answer=>{
    base=answer.state;revision=answer.revision;uncertain=false;
    if(store.hasLocalData&&!store.persisted&&!store.storageChanged&&same(local(),base))store.replaceSnapshot(store.read(),{source:"cloud"});
    try{storage?.setItem(key,JSON.stringify({version:1,revision,base}));}catch(_){}
    notify({revision,updatedAt:answer.updatedAt,hasCloud:!!base});
  };
  async function request(method,body) {
    check();const controller=new AbortController(),stop=()=>controller.abort();pending.add(controller);F.signal.addEventListener("abort",stop,{once:true});
    const timer=setTimeout(()=>controller.abort(),20000);
    try{
      const text=body===undefined?undefined:JSON.stringify(body);
      if(text&&new TextEncoder().encode(text).length>16384)throw Error("That workspace layout is too large to sync.");
      const response=await fetch("/api/workspaces",{method,credentials:"same-origin",mode:"same-origin",cache:"no-store",redirect:"error",signal:controller.signal,headers:{Accept:"application/json","X-Inflite-Workspace-Owner":owner,...(method==="PUT"?{"X-Inflite":"1","Content-Type":"application/json"}:{})},...(text?{body:text}:{})});check();
      const reader=response.body?.getReader();let value;
      if(reader){const chunks=[];let size=0;const cancel=()=>reader.cancel().catch(()=>{});controller.signal.addEventListener("abort",cancel,{once:true});
        try{while(true){const part=await reader.read();check();if(controller.signal.aborted)throw abort();if(part.done)break;size+=part.value.byteLength;if(size>17408)throw Error("Workspace sync received an answer that is too large.");chunks.push(part.value);}value=JSON.parse(await new Blob(chunks).text());}
        catch(error){await reader.cancel().catch(()=>{});throw error;}finally{controller.signal.removeEventListener("abort",cancel);reader.releaseLock();}
      }else{const text=await response.text();check();if(new TextEncoder().encode(text).length>17408)throw Error("Workspace sync received an answer that is too large.");value=JSON.parse(text);}
      check();if(controller.signal.aborted)throw abort();
      if(!response.ok){if(response.status===401&&live())Promise.resolve(F.session.lost?.()).catch(()=>{});throw Object.assign(Error(typeof value?.error==="string"?value.error.slice(0,240):"Workspace sync couldn’t finish."),{status:response.status});}
      return cloudReply(value,owner);
    }catch(error){check();if(controller.signal.aborted)throw Object.assign(Error("Workspace sync couldn’t be confirmed. Check again before retrying."),{timeout:true});throw error;}
    finally{clearTimeout(timer);pending.delete(controller);F.signal.removeEventListener("abort",stop);}
  }
  const blocked=()=>{try{return !!F.busy?.();}catch(_){return true;}};
  const conflict=answer=>{notify({state:"conflict",message:"Workspaces differ on this device and in the cloud. Choose which layout to keep.",revision:answer.revision,hasCloud:!!answer.state});return false;};
  function settled(){if(store.storageChanged)return storageConflict();notify(store.hasLocalData&&!store.persisted?{state:"waiting",message:"Saved in the cloud. This device couldn’t keep an offline layout copy.",localConflict:false}:{state:"synced",message:state.dirty?"Your latest changes are waiting to sync.":"Workspaces are up to date.",localConflict:false});return true;}
  function adopt(answer){check();if(!store.replaceSnapshot(answer.state,{source:"cloud"}))throw Error(store.storageChanged?"The saved layout changed in another tab. Reload to review it before applying the cloud layout.":"That cloud layout couldn’t be applied.");remember(answer);try{onChange(store.read());}catch(_){}return settled();}
  async function write(answer, selected) {
    check();writing=true;notify({state:"syncing",message:"Saving workspaces…"});
    try{
      const committed=await request("PUT",{revision:answer.revision,state:selected,operationId:crypto.randomUUID().replace(/-/g,"")});check();
      if(committed.revision!==answer.revision+1||!same(committed.state,selected))throw Error("Workspace sync received an unexpected acknowledgement.");
      remember(committed);return settled();
    }catch(error){if(error.status===409){const latest=await request("GET");return conflict(latest);}uncertain=true;throw error;}
    finally{writing=false;}
  }
  const storageConflict=()=>{notify({state:"error",localConflict:true,message:"Another tab changed the saved layout. Review its saved workspaces before syncing or editing this layout."});return false;};
  async function perform({manual=false,choice=null}={}) {
    check();if(store.storageChanged)return storageConflict();notify({state:"syncing",message:"Checking your workspaces…"});
    const atStart=local(), answer=await request("GET");check();if(store.storageChanged)return storageConflict();const current=local();
    if(choice){if(!same(atStart,current))return conflict(answer);if(choice==="cloud"){if(!answer.state)return conflict(answer);return adopt(answer);}return write(answer,current);}
    if(answer.state&&same(answer.state,current)){remember(answer);return settled();}
    if(answer.state){
      if(!store.hasLocalData||base&&same(current,base)){if(!manual&&blocked()){notify({state:"waiting",message:"A cloud layout is ready. Finish your current task, then sync workspaces.",hasCloud:true,revision:answer.revision});return false;}return adopt(answer);}
      if(!base||!same(answer.state,base))return conflict(answer);
    }else if(base)return conflict(answer);
    if(uncertain&&!manual){notify({state:"error",message:"The last sync couldn’t be confirmed. Choose Sync now to check and retry."});return false;}
    return write(answer,current);
  }
  const schedule=()=>{clearTimeout(debounce);if(started&&live()&&state.state!=="conflict")debounce=setTimeout(()=>sync({manual:false}),(Number.isFinite(debounceMs)?Math.max(0,Math.min(5000,debounceMs)):350));};
  function sync({manual=true}={}) {
    if(!live())return Promise.resolve(false);
    if(flight)return flight;
    if(store.storageChanged)return Promise.resolve(storageConflict());
    if(globalThis.navigator?.onLine===false){notify({state:"offline",message:"You’re offline. Reconnect to sync your workspaces."});return Promise.resolve(false);}
    const mine=++sequence;
    flight=perform({manual}).catch(error=>{if(live()&&mine===sequence&&error.name!=="AbortError")notify({state:globalThis.navigator?.onLine===false?"offline":"error",message:error.message||"Workspace sync couldn’t finish. Your layout is kept on this device."});return false;}).finally(()=>{flight=null;if(live()&&state.state==="synced"&&state.dirty)schedule();});
    return flight;
  }
  async function resolve(choice){if(!["local","cloud"].includes(choice)||!live()||flight)return false;
    flight=perform({manual:true,choice}).catch(error=>{if(live()&&error.name!=="AbortError")notify({state:"error",message:error.message||"Workspace sync couldn’t finish."});return false;}).finally(()=>{flight=null;if(live()&&state.state==="synced"&&state.dirty)schedule();});return flight;
  }
  const offStore=store.subscribe?.((_next,meta)=>{if(!live())return;if(meta?.source==="storage-conflict"){storageConflict();return;}if(meta?.source==="saved"){notify({state:"idle",localConflict:false,message:"Saved workspaces are now loaded. Sync to check the cloud layout."});return;}if(meta?.source!=="cloud"){notify();if(state.dirty)schedule();}})||(()=>{});
  const online=()=>{if(live())sync({manual:false});},offline=()=>notify({state:"offline",message:"You’re offline. Reconnect to sync your workspaces."}),visible=()=>{if(globalThis.document?.visibilityState!=="hidden")online();};
  function start(){if(!live()||started)return Promise.resolve(false);started=true;globalThis.addEventListener?.("online",online);globalThis.addEventListener?.("offline",offline);globalThis.document?.addEventListener("visibilitychange",visible);poll=setInterval(()=>{if(globalThis.document?.visibilityState!=="hidden"&&!flight)sync({manual:false});},(Number.isFinite(pollMs)?Math.max(10000,Math.min(300000,pollMs)):30000));return sync({manual:false});}
  function destroy(){if(dead)return;dead=true;dialog?.now?.();dialog=null;sequence++;offStore();clearTimeout(debounce);clearInterval(poll);for(const controller of pending)controller.abort();pending.clear();listeners.clear();globalThis.removeEventListener?.("online",online);globalThis.removeEventListener?.("offline",offline);globalThis.document?.removeEventListener("visibilitychange",visible);F.signal.removeEventListener("abort",destroy);base=null;}
  F.signal.addEventListener("abort",destroy,{once:true});if(F.signal.aborted)destroy();
  const unsafe=()=>writing||!!store.storageChanged||!!(store.hasLocalData&&!store.persisted);
  return api={start,sync,resolve,reviewSaved(){if(!live()||writing||!store.reloadSaved?.())return false;try{onChange(store.read());}catch(_){}return true;},status:()=>live()?state:null,subscribe(fn){if(!live()||typeof fn!=="function")return()=>{};const entry={fn};listeners.add(entry);return()=>listeners.delete(entry);},destroy,busy:()=>live()&&unsafe(),
    async flush({timeoutMs=2000}={}){if(!writing)return{lost:live()&&unsafe()?1:0};let timer;try{await Promise.race([flight,new Promise(r=>timer=setTimeout(r,Math.min(10000,Math.max(0,timeoutMs))))]);}finally{clearTimeout(timer);}return{lost:live()&&unsafe()?1:0};},
    open(){check();const route=F.route;if(dialog&&!dialog.closed){dialog.el?.querySelector("h2")?.focus?.();return Promise.resolve(dialog);}return dialogPromise||=(import("./workspace-sync-view.js").then(module=>{check();return F.route===route?dialog=module.openWorkspaceSync(F,api):null;}).finally(()=>{dialogPromise=null;}));}
  };
}
