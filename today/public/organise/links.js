import {createSystemClient} from '/roof/system-client.js';
// Explicit metadata picker. Selecting a file links it without downloading bytes.
export function chooseLink(F,from,{contactsOnly=false,current=()=>true}={}){
 const ui=F.ui,el=ui.el,client=createSystemClient(F,{prefix:'/api/organise/'});let resolve,kind=contactsOnly?'people':'notes',cursor=null,folder=null,parent=null,epoch=0,timer=0,closed=false,drive=null;
 const lifetime=new AbortController(),live=()=>!closed&&client.live()&&current();
 if(!live())return Promise.resolve(null);
 const result=new Promise(r=>resolve=r),list=el('div',{class:'org-list'}),status=el('p',{role:'status'}),q=el('input',{type:'search',maxlength:160,'aria-label':'Find a linked item',placeholder:'Search titles'}),select=el('select',{'aria-label':'Link from app'});
 for(const [id,name]of [['notes','Notes'],['people','People'],['calendar','Calendar'],['files','Files'],['source','App link']])select.append(el('option',{value:id,text:name}));
 const button=(label,fn)=>ui.btn(label,{run:()=>Promise.resolve().then(()=>live()&&fn()).catch(e=>{if(live()&&e.name!=='AbortError')status.textContent=e.message})}),up=button('Up a folder',()=>{folder=parent;cursor=null;read()}),more=button('Show more',()=>read(true));up.hidden=true;more.hidden=true;
 const abort=()=>{settle(null);h.now()};
 function settle(ref){if(closed)return;const chosen=live()?ref:null;closed=true;epoch++;clearTimeout(timer);lifetime.abort();F.signal.removeEventListener('abort',abort);drive?.destroy();resolve(chosen)}
 function finish(ref){settle(ref);h.now()}
 async function read(append=false){const mine=++epoch,active=()=>live()&&mine===epoch;if(!active())return;status.textContent='Loading…';more.hidden=true;if(!append)list.replaceChildren();
  if(kind==='source'){q.hidden=true;status.textContent='Paste an InFlite conversation link, or choose an app.';const input=el('input',{type:'text',maxlength:180,placeholder:'/chats/#open=…','aria-label':'InFlite link'});list.append(input,button('Link conversation',()=>{let u;try{u=new URL(input.value,location.origin)}catch(_){throw Error('Paste a link from InFlite Chats or Mail.')}const m=/^\/(chats|mail)\/$/.exec(u.pathname),hash=/^#(?:open|thread)=([\w-]{1,64})$/.exec(u.hash);if(u.origin!==location.origin||u.search||!m||!hash||m[1]==='chats'&&!u.hash.startsWith('#open=')||m[1]==='mail'&&!u.hash.startsWith('#thread='))throw Error('Paste a conversation link from this InFlite site.');finish({app:m[1],id:hash[1]})}),...['fitness','weather','markets'].map(app=>button('Link '+app[0].toUpperCase()+app.slice(1),()=>finish({app}))));return}
  q.hidden=false;
  try{
   if(kind==='files'){
    if(!drive){const m=await import('/roof/files-drive.js');if(!active())return;drive=m.createDriveClient(F)}
    const r=await drive.browse({parentId:folder,query:q.value.trim(),view:q.value?'search':'folder',cursor:append?cursor:null,signal:lifetime.signal,current:active});if(!active())return;parent=r.folder?.parentId||null;up.hidden=!folder;cursor=r.cursor;
    for(const v of r.items.filter(v=>v.status==='ready'&&!v.trashedAt))list.append(button(v.kind==='folder'?'Folder · '+v.name:v.name,()=>{if(v.kind==='folder'){folder=v.id;q.value='';read()}else finish({app:'files',id:v.id,title:v.name})}));status.textContent=r.items.length?'Choose a file to link.':'No files here.';
   }else{
    const r=await client.request('list',{method:'POST',body:{kind,q:q.value.trim(),cursor:append?cursor:null},signal:lifetime.signal,current:active});if(!active())return;cursor=r.cursor;for(const v of r.records)list.append(button(v.title,()=>finish({app:kind,id:v.id,title:v.title})));status.textContent=r.records.length?'Choose an item to link.':'No matching items.';
   }more.hidden=!cursor;
  }catch(e){if(active()&&e.name!=='AbortError'){status.textContent=e.message;list.append(button('Try again',()=>read()))}}
 }
 select.addEventListener('change',()=>{kind=select.value;cursor=folder=null;q.value='';up.hidden=true;read()});q.addEventListener('input',()=>{clearTimeout(timer);timer=setTimeout(()=>{cursor=null;read()},250)});
 if(contactsOnly){q.setAttribute('aria-label','Find a contact');q.placeholder='Search contacts'}
 const h=F.sheet.open({sheet:'organise-link',title:contactsOnly?'Choose a contact':'Link an item',body:el('div',{class:'org'},contactsOnly?null:select,q,up,status,list,more),onClose(){settle(null)}});
 F.signal.addEventListener('abort',abort,{once:true});
 read();return result;
}

export async function linkItem(F,kind,{id,store,current}){
 const selected=await chooseLink(F,kind,{current});
 if(!current()||!selected)return;
 const {title,...link}=selected,record=await store.get(id);
 if(!current())return;
 if(record.pending)throw Error('Wait for the current save before linking another item.');
 const fields=kind==='notes'?['text','checklist']:kind==='people'?['email','phone','organisation','details']:
  ['description','allDay','timezone',...(record.allDay?['startDate','endDate']:['start','end'])];
 const value=Object.fromEntries(['title',...fields].map(field=>[field,record[field]??'']));
 const links=record.links||[];
 if(links.length>=12)throw Error('Link up to twelve items.');
 if(links.some(ref=>ref.app===link.app&&ref.id===link.id))return;
 await store.save(id,{...value,links:[...links,link]},{version:record.version});
 if(current())F.toast('Linked item saved for syncing');
}
