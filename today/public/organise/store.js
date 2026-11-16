import {createSystemClient,operationId} from '/roof/system-client.js';
import {openOfflineStore} from '/roof/offline-store.js';
// Encrypted, acknowledged per-record drafts. An uncertain request keeps its exact
// operation until acknowledged; newer typing follows it at the returned version.
export async function createStore(F,kind){
 const client=createSystemClient(F,{prefix:'/api/organise/'}),items=new Map(),pending=new Map(),forms=new Map(),listeners=new Set();let local=null,running=false,serial=Promise.resolve(),sequence=0,read=0;
 const live=client.live,emit=()=>{if(live())for(const fn of listeners)fn()},clone=v=>structuredClone(v);
 try{local=await openOfflineStore(client.owner,{signal:F.signal});for(const v of await local.list('organise-'+kind))pending.set(v.id,{...v,state:v.state==='conflict'?'conflict':'queued'});for(const v of await local.list('organise-form-'+kind))forms.set(v.recordId,v)}catch(_){}
 if(!live()){local?.close();throw new DOMException('Released','AbortError')}
 const merge=r=>{if(r&&/^[a-f0-9]{32}$/.test(r.id)&&r.kind===kind&&Number.isSafeInteger(r.version)&&(items.get(r.id)?.version||0)<=r.version){items.set(r.id,{...items.get(r.id),...r});sequence++}};
 const view=id=>{const p=pending.get(id);return p?{...items.get(id),id,kind,...clone(p.value),version:p.version,deleted:p.deleted,pending:true,state:p.state,error:p.error,updatedAt:p.updatedAt}:items.get(id)};
 async function list({q='',cursor=null,range=null}={}){const seq=++read,start=sequence,r=await client.request('list',{method:'POST',body:{kind,q,cursor,...(range?{fromDate:range[0],toDate:range[1],from:new Date(range[0]+'T00:00:00').getTime(),to:new Date(range[1]+'T00:00:00').getTime()}: {})}});if(!live())return null;for(const v of r.records)merge(v);emit();return{...r,records:r.records.map(v=>view(v.id)),start}}
 async function get(id){if(forms.has(id)){const f=forms.get(id);return {id,kind,...clone(f.value),version:f.version,formDraft:true}}if(pending.has(id))return view(id);const r=await client.request('record',{query:{kind,id}});if(live())merge(r.record);return view(id)}
 const persist=v=>{if(!local)throw Error('Private device storage is unavailable. Keep this page open and try again.');return local.put(v)};
 function commit(fn){const p=serial.catch(()=>{}).then(()=>{if(!live())throw new DOMException('Released','AbortError');return fn()});serial=p;return p}
 async function save(id,value,{version=0,deleted=false}={}){
  if(!live())throw new DOMException('Released','AbortError');
  return commit(async()=>{const old=pending.get(id),p={...old,id,kind:'organise-'+kind,version:old?.version??version,value:clone(value),deleted,revision:(old?.revision||0)+1,updatedAt:Date.now(),state:old?.state==='conflict'?'conflict':'queued',error:old?.state==='conflict'?old.error:'',operation:old?.operation||null};
   if(old?.state==='failed'&&old.status>=400&&old.status<500&&![408,429].includes(old.status))p.operation=null;
   await persist(p);if(live()){pending.set(id,p);sequence++;emit();queueMicrotask(pump)}return view(id);
  });
 }
 async function pump(){if(running||!live()||navigator.onLine===false)return;running=true;
  try{for(const [id] of pending){while(live()&&navigator.onLine!==false){let p=pending.get(id);if(!p||p.state!=='queued')break;
   try{
    await commit(async()=>{p=pending.get(id);if(!p||p.state!=='queued')return;if(!p.operation){const next={...p,operation:{operationId:operationId(),version:p.version,value:clone(p.value),deleted:p.deleted,revision:p.revision}};await persist(next);pending.set(id,next);p=next}p.state='saving';emit()});
    if(!p?.operation)break;const op=p.operation,r=await client.request('record',{method:'PUT',body:{kind,id,version:op.version,operationId:op.operationId,value:op.value,deleted:op.deleted}});
    await commit(async()=>{if(!live())return;merge(r.record);const form=forms.get(id);if(form&&form.version===op.version){const next={...form,version:r.record.version};await persist(next);forms.set(id,next)}window.dispatchEvent(new CustomEvent('inflite:organise-change',{detail:{owner:client.owner,kind}}));const current=pending.get(id);if(current.revision===op.revision){await local.remove(id);pending.delete(id)}else{const next={...current,version:r.record.version,operation:null,state:'queued',error:''};await persist(next);pending.set(id,next)}emit()});
   }catch(error){if(!live())break;await commit(async()=>{const current=pending.get(id);if(!current)return;const next={...current,state:[409,410].includes(error.status)?'conflict':'failed',status:error.status||0,error:error.message||'Retry when connected.'};await persist(next);pending.set(id,next);emit()}).catch(()=>{});break}
  }}}finally{running=false;emit()}
 }
 async function retry(id){await commit(async()=>{const p=pending.get(id);if(!p||p.state==='conflict')return;const n={...p,state:'queued',error:''};await persist(n);pending.set(id,n);emit()});pump()}
 async function discard(id){await commit(async()=>{if(pending.get(id)?.state==='saving')throw Error('Wait for the current save.');await local?.remove(id);pending.delete(id);emit()})}
 async function copy(id){const p=pending.get(id);if(!p)throw Error('That draft is no longer available.');const fresh=operationId();await save(fresh,{...p.value,title:p.value.title+' (copy)'},{version:0});await discard(id);return fresh}
 const online=()=>{for(const p of pending.values())if(p.state==='failed'&&(!p.status||p.status>=500||[408,429].includes(p.status)))retry(p.id).catch(()=>{});pump()};window.addEventListener('online',online,{signal:F.signal});
 F.signal.addEventListener('abort',()=>{local?.close();items.clear();pending.clear();forms.clear();listeners.clear()},{once:true});queueMicrotask(pump);
 async function keepForm(id,value,version){return commit(async()=>{const v={id:'form:'+id,recordId:id,kind:'organise-form-'+kind,value:clone(value),version,updatedAt:Date.now()};await persist(v);forms.set(id,v);emit()})}
 async function dropForm(id){return commit(async()=>{await local?.remove('form:'+id);forms.delete(id);emit()})}
 return{list,get,save,retry,discard,copy,view,keepForm,dropForm,localForms:()=>[...forms.values()].map(v=>({id:v.recordId,kind,...clone(v.value),version:v.version,formDraft:true,updatedAt:v.updatedAt})),ready:()=>!!local,subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn)},pending:()=>[...pending.keys()].map(view),snapshot:()=>[...new Set([...items.keys(),...pending.keys()])].map(view).filter(v=>!v.deleted),busy:()=>running,async flush(){await serial;return{lost:0}},remote:async id=>(await client.request('record',{query:{kind,id}})).record};
}
