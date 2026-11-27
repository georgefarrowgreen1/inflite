// An acknowledged, bounded account journal. Private payloads and File bytes are
// encrypted with a non-extractable device key; no private response enters Cache.
const PREFIX='ifl:offline:v1:', LIMIT=100*1024*1024;
const req=r=>new Promise((yes,no)=>{r.onsuccess=()=>yes(r.result);r.onerror=()=>no(r.error)});
const done=t=>new Promise((yes,no)=>{t.oncomplete=yes;t.onabort=t.onerror=()=>no(t.error||Error('Local storage did not finish.'))});
const matches=(row,expected)=>expected===null?row===undefined:!!row&&row.journalStamp===expected.journalStamp;

export async function openOfflineStore(owner,{signal}={}){
 if(!/^[\w-]{1,100}$/.test(owner)||!globalThis.indexedDB||!crypto.subtle)throw Error('This browser could not keep offline work. Leave this page open and try again.');
 const name=PREFIX+owner,opening=indexedDB.open(name,2);
 opening.onupgradeneeded=e=>{const db=opening.result;if(e.oldVersion<1){db.createObjectStore('key');db.createObjectStore('work',{keyPath:'id'})}if(e.oldVersion<2){opening.transaction.objectStore('work').createIndex('kind','kind');const quota=db.createObjectStore('quota',{keyPath:'id'});const cursor=opening.transaction.objectStore('work').openCursor();cursor.onsuccess=()=>{const row=cursor.result;if(row){quota.put({id:row.key,bytes:row.value.data.byteLength});row.continue()}}}};
 const db=await req(opening);let closed=false;
 const check=()=>{if(closed||signal?.aborted)throw new DOMException('Offline work released','AbortError')};
 const close=()=>{if(closed)return;closed=true;db.close();window.removeEventListener('inflite:purge-offline',purge);signal?.removeEventListener('abort',close)};
 const purge=e=>{if(e.detail?.owner===owner){close();indexedDB.deleteDatabase(name)}};
 window.addEventListener('inflite:purge-offline',purge);signal?.addEventListener('abort',close,{once:true});db.onversionchange=close;
 try{
  check();const candidate=await crypto.subtle.generateKey({name:'AES-GCM',length:256},false,['encrypt','decrypt']);check();
  const t=db.transaction('key','readwrite'),settled=done(t),store=t.objectStore('key');let key=await req(store.get('main'));if(!key){key=candidate;store.put(key,'main')}await settled;check();
  localStorage.setItem(name,'1');
  const encode=async value=>{const iv=crypto.getRandomValues(new Uint8Array(12)),blob=value.file,meta={...value,file:undefined};const data=await new Blob([JSON.stringify(meta),'\n',...(blob?[blob]:[])]).arrayBuffer();check();return {iv,data:await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:new TextEncoder().encode(owner)},key,data)}};
  const decode=async row=>{const data=new Uint8Array(await crypto.subtle.decrypt({name:'AES-GCM',iv:row.iv,additionalData:new TextEncoder().encode(owner)},key,row.data));check();const end=data.indexOf(10);if(end<0)throw Error('Offline work could not be read.');const v=JSON.parse(new TextDecoder().decode(data.subarray(0,end)));if(v.kind==='upload')v.file=new File([data.subarray(end+1)],v.name,{type:v.mime});return v};
  return {close,
   async list(kind){check();const s=db.transaction('work').objectStore('work'),rows=await req(kind?s.index('kind').getAll(kind):s.getAll());return Promise.all(rows.map(decode))},
   async put(value,expected){
    check();const encrypted=await encode(value);check();
    const t=db.transaction(['work','quota'],'readwrite'),settled=done(t),store=t.objectStore('work'),quota=t.objectStore('quota');
    if(expected!==undefined&&!matches(await req(store.get(value.id)),expected)){await settled;check();return false}
    const rows=(await req(quota.getAll())).filter(row=>row.id!==value.id);
    if(rows.reduce((n,row)=>n+row.bytes,0)+encrypted.data.byteLength>LIMIT||rows.length>=100){
     t.abort();await settled.catch(()=>{});throw Error('Offline storage is full. Finish or cancel earlier work first.');
    }
    store.put({id:value.id,kind:value.kind,journalStamp:value.journalStamp,...encrypted});
    quota.put({id:value.id,bytes:encrypted.data.byteLength});
    await settled;check();return true;
   },
   async remove(id,expected){
    check();
    const t=db.transaction(['work','quota'],'readwrite'),settled=done(t),store=t.objectStore('work');
    // An opaque stamp lets one tab acknowledge its own saved row even if
    // another tab has since kept a newer edit under the same record ID.
    if(expected===undefined||matches(await req(store.get(id)),expected)){
     store.delete(id);
     t.objectStore('quota').delete(id);
    }
    await settled;check();
   }
  };
 }catch(error){close();throw error}
}
