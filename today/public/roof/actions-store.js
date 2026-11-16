// Durable, versioned reminder intents. This account journal never accepts app
// message text implicitly; only the person's form values and opaque references.
import {operationId} from './system-client.js';
import {openOfflineStore} from './offline-store.js';
export async function createActionsStore(F,client,{activity,onSaved,onReview}={}){
 const listeners=new Set(),updated=new Map(),items=new Map(),pending=new Map(),presentations=new Map();let gone=false,running=false,reading=new Map(),serial=Promise.resolve(),store=null,sequence=0;
 const live=()=>!gone&&client.live(),emit=()=>{if(live())for(const fn of listeners)fn()};
 try{store=await openOfflineStore(client.owner,{signal:F.signal});for(const intent of await store.list('action'))pending.set(intent.id,{...intent,state:intent.state==='conflict'?'conflict':'queued'})}catch(_){}
 if(!live()){store?.close();return null}
 const merge=action=>{if(!action||!/^[\w-]{32}$/.test(action.id)||typeof action.title!=='string'||!Number.isSafeInteger(action.version))throw Error('That reminder could not be read.');if((items.get(action.id)?.version||0)<=action.version){items.set(action.id,action);updated.set(action.id,++sequence)}return action};
 const note=intent=>{try{activity?.put(intent.id,{title:intent.body.title||items.get(intent.actionId)?.title||'Reminder',kind:'save',status:intent.state==='done'?'succeeded':intent.state==='running'?'running':intent.state==='queued'?'queued':'failed',detail:intent.error||(intent.state==='done'?'Reminder saved':intent.state==='running'?'Saving reminder':'Kept on this device'),actions:intent.state==='conflict'?[{id:'review',label:'Review',run:()=>onReview?.(intent.id)}]:[]})}catch(_){}};
 const snapshot=()=>{const rows=new Map(items);for(const intent of pending.values()){
  const key=intent.actionId||intent.resultId||intent.id,old=rows.get(key)||{id:key,version:0,createdAt:intent.createdAt,status:'open',notes:'',files:[],source:null};rows.set(key,{...old,...intent.body,id:key,pending:true,intentId:intent.id,pendingState:intent.state,pendingError:intent.error});
 }return [...rows.values()].filter(a=>a.status!=='deleted')};
 async function load({view='today',status='open',cursor=null,...lease}={}){const started=sequence,key=view+":"+status,mine=(reading.get(key)||0)+1;reading.set(key,mine);const result=await client.request('actions',{query:{view,status,cursor},...lease});if(!live()||mine!==reading.get(key))return null;if(!cursor){const ids=new Set((result.actions||[]).map(a=>a.id));for(const [id,a]of items)if(a.status===status&&(updated.get(id)||0)<=started&&!ids.has(id)&&(view!=='today'||a.dueAt==null||a.dueAt<=Date.now()+2*864e5))items.delete(id)}for(const a of result.actions||[])merge(a);emit();return result}
 async function get(id,lease={}){const result=await client.request('action',{query:{id},...lease});if(live())merge(result.action);return result.action}
 async function pump(){if(!live()||running||navigator.onLine===false)return;running=true;
  try{for(const intent of pending.values()){
   if(!live()||navigator.onLine===false)break;if(intent.state!=='queued')continue;
   intent.state='running';intent.error='';note(intent);emit();
   try{const value=await client.request(intent.type==='create'?'actions':'action',{method:intent.type==='create'?'POST':'PATCH',body:{...intent.body,...(intent.actionId?{id:intent.actionId,version:intent.version}:{}),operationId:intent.operationId}});if(!live())break;merge(value.action);intent.resultId=value.action.id;await store?.remove(intent.id);if(!live())break;pending.delete(intent.id);intent.state='done';note(intent);if(presentations.get(intent.id)===F.route)onSaved?.(intent,value.action);presentations.delete(intent.id)}catch(error){if(!live())break;intent.state=error.status===409?'conflict':'failed';intent.statusCode=error.status||0;intent.error=error.message||'Retry when connected.';await store?.put({...intent,review:undefined});note(intent)}emit();
  }}finally{running=false;emit()}
 }
 async function enqueue(type,body,action){
  if(!live())throw new DOMException('Released','AbortError');if(!store)throw Error('This browser could not keep the reminder safely. Try again before closing this page.');
  if(action?.pending)throw Error('Let the pending change finish before editing this reminder.');
  const presented=F.route,id=operationId(),intent={id,kind:'action',type,body,operationId:id,actionId:action?.id||null,version:action?.version||null,createdAt:Date.now(),state:'queued',error:''};
  // Serialize acknowledgement against other local edits and sign-out.
  serial=serial.catch(()=>{}).then(async()=>{await store.put(intent);if(live()){pending.set(id,intent);presentations.set(id,presented);emit();note(intent)}});await serial;if(!live())throw new DOMException('Released','AbortError');pump();return {pending:true,id:action?.id||id};
 }
 async function retry(id,{version,body}={}){const intent=pending.get(id);if(!live()||!intent||!['failed','conflict'].includes(intent.state))return;const next={...intent,state:'queued',error:'',...(version?{version,operationId:operationId()}:{}),...(body?{body,operationId:operationId()}:{})};await store?.put(next);if(live()&&pending.get(id)===intent){pending.set(id,next);emit();pump()}}
 async function discard(id){const intent=pending.get(id);if(!live()||!intent||intent.state==='running')return;await store?.remove(id);if(live()){pending.delete(id);emit()}}
 const online=()=>{for(const i of pending.values())if(i.state==='failed'&&(!i.statusCode||[408,502,503].includes(i.statusCode))){i.state='queued';i.error=''}pump()};window.addEventListener('online',online,{signal:F.signal});
 F.signal.addEventListener('abort',()=>{gone=true;store?.close();items.clear();pending.clear();listeners.clear()},{once:true});queueMicrotask(pump);
 return {load,get,snapshot,create:body=>enqueue('create',body),update:(action,patch)=>enqueue('update',patch,action),retry,discard,
  queued:()=>[...pending.values()].map(i=>({...i})),subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn)},busy:()=>live()&&(running||pending.size>0),async flush(){await serial;return {lost:pending.size?1:0}},
  async search(q,lease={}){const r=await client.request('search',{method:'POST',body:{q},...lease});if(live())for(const a of r.actions||[])merge(a);return r.actions||[]}
 };
}
