import {openOfflineStore} from './offline-store.js';
// Today layout is a versioned intent, never a blind offline replay. A conflicting
// account layout needs an explicit choice before the saved intent can be sent.
export async function createOfflinePrefs(F,{owner,root,cloud,apply,ack}={}){
 const live=()=>!F.signal.aborted&&F.session.view?.user?.id===owner;
 const panel=F.ui.el('aside',{class:'continuation-card',hidden:true,'aria-label':'Today layout status'});root.prepend(panel);
 let store;try{store=await openOfflineStore(owner,{signal:F.signal})}catch(error){return {busy:()=>false,change(){if(live())F.toast(error.message)}}}
 let pending=null,base=cloud(),conflict=null,busy=false,serial=Promise.resolve(),persisted=0,sequence=0;
 const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
 async function request(method,body){const r=await fetch('/api/files/preferences',{method,credentials:'same-origin',cache:'no-store',mode:'same-origin',redirect:'error',signal:AbortSignal.any([F.signal,AbortSignal.timeout(12000)]),headers:{'X-Inflite-Files-Owner':owner,...(body?{'X-Inflite':'1','Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});const text=await r.text();if(!live()||text.length>10000)throw Error('Layout sync unavailable');const v=JSON.parse(text);if(!r.ok){const e=Error(v.error||'Layout sync unavailable');e.status=r.status;throw e}return v.prefs}
 function paint(message){if(!live())return;panel.hidden=!pending;if(!pending)return;panel.replaceChildren(F.ui.el('p',{role:'status',text:message||(conflict?'Today changed on another device. Choose which layout to keep.':navigator.onLine===false?'Today layout kept on this device. Waiting for a connection.':'Today layout kept on this device. Waiting to sync.')}));panel.append(F.ui.btn(conflict?'Review layouts':'Retry',{small:true,run:()=>conflict?review():pump()}))}
 function save(){const value=structuredClone(pending),generation=sequence;serial=serial.catch(()=>{}).then(async()=>{if(!live())return;await store.put(value);if(!live())return;persisted=generation;paint();queueMicrotask(pump)}).catch(error=>{if(live())paint('Could not keep this layout on your device. '+error.message)});return serial}
 function review(){if(!live()||!conflict)return;let h;const account=conflict;h=F.sheet.open({title:'Today layout changed',body:F.ui.el('p',{text:'Another device updated your layout while this device had changes waiting. Choose the layout to use across your devices.'}),acts:[{label:'Use account layout',run:async()=>{if(!live())return;pending=null;conflict=null;base=account;await serial;await store.remove('today-prefs');if(live()){ack(account);apply(account);panel.hidden=true;h.now()}}},{label:'Keep this layout',primary:true,run:()=>{if(!live()||!pending)return;base=account;pending.expected=account;conflict=null;sequence++;h.now();save()}}]})}
 async function pump(){
  if(!live()||!pending||conflict||busy||persisted!==sequence||navigator.onLine===false)return;busy=true;const sent=structuredClone(pending),generation=sequence;
  try{
   const value=await request('PUT',{...sent.value,expected:sent.expected});if(!live())return;base=value;ack(value);
   if(sequence===generation){pending=null;await store.remove('today-prefs');if(live())panel.hidden=true}
   else{pending.expected=value;sequence++;await save()}
  }catch(error){if(live()){if(error.status===409){try{conflict=await request('GET');paint()}catch(_){paint('Could not check the account layout. Retry when connected.')}}else paint(error.status===401?'Sign in again to sync your saved layout.':'Today layout is kept on this device. Retry when connected.')}}finally{busy=false;if(live()&&pending&&!conflict&&sequence!==generation)queueMicrotask(pump)}
 }
 const records=await store.list('preferences');if(!live())return null;pending=records.find(r=>r.id==='today-prefs'&&r.kind==='preferences')||null;
 if(pending){sequence=persisted=1;apply(pending.value);paint();queueMicrotask(pump)}
 window.addEventListener('online',pump,{signal:F.signal});F.signal.addEventListener('abort',()=>panel.remove(),{once:true});
 return {busy:()=>live()&&!!pending,change(value){if(!live())return;pending={id:'today-prefs',kind:'preferences',value:structuredClone(value),expected:pending?.expected||base};sequence++;save()},review};
}
