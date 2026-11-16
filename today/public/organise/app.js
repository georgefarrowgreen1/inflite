import {createStore} from './store.js';
import {createSystemClient,operationId} from '/roof/system-client.js';
import {localDay,addDays,eventDay,overlaps,when,linkedEvents,pathOf,noteText,eventICS} from './model.js';
const NAMES={calendar:'Calendar',notes:'Notes',people:'People'},SECTIONS={calendar:[['agenda','Agenda'],['week','Week']],notes:[['all','All notes']],people:[['contacts','Contacts']]};
export async function mountApp(root,F,kind){
 const ui=F.ui,el=ui.el,store=await createStore(F,kind),life=F.signal,live=()=>!life.aborted;let route=null,shown=false,loaded=false,reading=0,query='',cursor=null,ids=new Set(),editor=null,editorId=null,editorLoad=0,loading=false,error='',reminders=[],date=localDay(),section=SECTIONS[kind][0][0],searchTimer=0,external=[];
 root.classList.add('org');root.dataset.organise=kind;
 const safe=fn=>()=>{try{Promise.resolve(fn()).catch(e=>{if(live())F.toast(e.message)})}catch(e){if(live())F.toast(e.message)}};
 const button=(label,run,primary=false)=>ui.btn(label,{primary,run:safe(run)});
 const go=id=>F.nav.go('/'+kind+'/#item='+id),home=()=>F.nav.go('/'+kind+'/#'+section),fresh=()=>F.nav.go('/'+kind+'/#new');
 const heading=el('h2',{text:kind==='calendar'?'Your time, together':kind==='notes'?'A place for your thoughts':'Keep your people close'}),sub=el('p',{class:'org-muted',text:kind==='calendar'?'Your events and dated items from InFlite.':kind==='notes'?'Private notes and checklists, saved as you write.':'Private contacts, with links to the things you share.'});
 const search=el('input',{type:'search',class:'org-search',maxlength:160,placeholder:'Search '+NAMES[kind].toLowerCase()+' titles','aria-label':'Search '+NAMES[kind]}),status=el('p',{class:'org-status',role:'status'}),list=el('div',{class:'org-list'}),detail=el('section',{class:'org-detail',hidden:true,'aria-label':NAMES[kind]+' editor'}),more=button('Show more',()=>load(true)),retry=button('Refresh',()=>load());
 const actions=el('div',{class:'org-toolbar'},search,retry,button(kind==='calendar'?'New event':kind==='notes'?'New note':'Add person',fresh,true));
 const sidebar=el('section',{class:'org-browser'},el('div',{class:'org-intro'},heading,sub),actions,status,list,more);
 const weekStrip=el('nav',{class:'org-week-strip','aria-label':'Days this week',hidden:true});
 const viewSwitch=kind==='calendar'?ui.seg(SECTIONS.calendar,section,value=>{section=value;F.nav.go('/calendar/#'+value)},{label:'Calendar view'}):null;
 const dates=el('div',{class:'org-toolbar org-dates'}),day=el('input',{type:'date',value:date,'aria-label':'Calendar date'});
 const changeDate=n=>{date=addDays(date,n);day.value=date;load()};
 if(kind==='calendar'){
  dates.append(button('Previous',()=>changeDate(section==='week'?-7:-1)),day,button('Next',()=>changeDate(section==='week'?7:1)),button('Today',()=>{date=localDay();day.value=date;load()}),viewSwitch);
  sidebar.insertBefore(dates,actions);sidebar.insertBefore(weekStrip,actions);day.addEventListener('change',()=>{if(day.validity.valid&&day.value){date=day.value;load()}});
 }
 const layout=el('div',{class:'org-layout'},sidebar,detail);root.replaceChildren(layout);
 function range(){const start=section==='week'?addDays(date,-((new Date(date+'T12:00:00').getDay()+6)%7)):date;return[start,addDays(start,section==='week'?7:30)]}
 const currentRows=()=>{
  const pending=[...store.localForms(),...store.pending()],map=new Map([...ids].map(id=>[id,store.view(id)]));for(const v of pending)map.set(v.id,v);
  let rows=[...map.values()].filter(v=>v&&!v.deleted&&(!query||v.title.toLocaleLowerCase().includes(query.toLocaleLowerCase())));
  if(kind==='calendar'){const [a,b]=range();rows=rows.filter(v=>overlaps(v,a,b)).concat(external.filter(v=>overlaps(v,a,b)&&(!query||v.title.toLocaleLowerCase().includes(query.toLocaleLowerCase()))));rows.sort((a,b)=>eventDay(a).localeCompare(eventDay(b))||(a.start||0)-(b.start||0));}
  else if(kind==='people')rows.sort((a,b)=>a.title.localeCompare(b.title));else rows.sort((a,b)=>b.updatedAt-a.updatedAt);
  return rows;
 };
 function header(){F.header.set({title:NAMES[kind],line:kind==='calendar'?'Events and linked plans':kind==='notes'?'Private notes and checklists':'Your private contacts',crumb:{text:'InFlite',app:kind},sections:null,section,onSection:value=>F.nav.go('/'+kind+'/#'+value),acts:[{icon:'plus',label:kind==='people'?'Add person':kind==='notes'?'New note':'New event',run:fresh}]})}
 function paint(){
  if(!live())return;const active=list.contains(document.activeElement)?document.activeElement?.closest('[data-record]')?.dataset.record:null;
  status.textContent=error||(loading?'Refreshing…':store.pending().some(v=>v.state==='conflict')?'A change needs review. Open the marked item.':!store.ready()?'Private device storage is unavailable. Editing is paused.':'');
  status.dataset.tone=error?'error':'';more.hidden=!cursor;more.disabled=loading;retry.disabled=loading;
  const rows=currentRows();list.replaceChildren();let group='';
  if(kind==='calendar'){weekStrip.hidden=section!=='week';if(section==='week'){const [first]=range();weekStrip.replaceChildren(...Array.from({length:7},(_,i)=>{const d=addDays(first,i),time=new Date(d+'T12:00:00'),count=rows.filter(v=>overlaps(v,d,addDays(d,1))).length,b=el('button',{type:'button','aria-current':date===d?'date':null,'aria-label':time.toLocaleDateString([],{weekday:'long',day:'numeric',month:'long'})+' · '+count+' items',on:{click:()=>{date=d;day.value=d;load()}}},el('span',{text:time.toLocaleDateString([],{weekday:'short'})}),el('strong',{text:time.getDate()}),el('small',{text:count?'•':' '}));return b}))}}

  if(!rows.length)list.append(ui.empty({title:loading?'Opening '+NAMES[kind]+'…':query?'No matching titles':kind==='calendar'?'Your calendar is clear':kind==='notes'?'Your first note starts here':'Your people, in one place',body:loading?'':kind==='calendar'?'Add an event or open a dated plan from your InFlite apps.':kind==='notes'?'Capture a thought, make a checklist or link a file.':'Add someone and connect their notes, plans and conversations.'}));
  for(const v of rows){
   if(kind==='calendar'&&eventDay(v)!==group){group=eventDay(v);list.append(el('h3',{class:'org-day-label',text:new Date(group+'T12:00:00').toLocaleDateString([],{weekday:'long',day:'numeric',month:'long'})}))}
   const b=el('button',{type:'button',class:'org-record',data:{record:v.id},'aria-current':editorId===v.id?'true':null,on:{click:safe(()=>v.source?openExternal(v):go(v.id))}}),lead=kind==='people'?ui.avatar(v.title):ui.icon(v.ride?'ride':kind==='calendar'?'calendar':'file');
   b.append(el('span',{class:'org-record-icon'},lead),el('span',{class:'org-record-copy'},el('strong',{text:v.title}),el('span',{class:'org-muted',text:kind==='calendar'?when(v)+(v.label?' · '+v.label:''):kind==='notes'?(v.preview??v.text??'').slice(0,110)||(v.checkCount||v.checklist?.length?`${v.doneCount??v.checklist?.filter(x=>x.done).length??0}/${v.checkCount??v.checklist?.length} checked`:'Empty note'):[v.organisation,v.email||v.phone].filter(Boolean).join(' · ')})),ui.icon('chev'));
   if(v.formDraft)b.append(el('span',{class:'org-pending',text:'Draft'}));if(v.pending)b.append(el('span',{class:'org-pending',text:v.state==='conflict'?'Review':v.state==='failed'?'Retry':'Saving'}));list.append(b);
  }
  if(active)list.querySelector('[data-record="'+CSS.escape(active)+'"]')?.focus({preventScroll:true});
  editor?.status();
 }
 async function load(append=false){
  if(!live())return;const mine=++reading;loading=true;error='';paint();
  try{const result=await store.list({q:query,cursor:append?cursor:null,...(kind==='calendar'?{range:range()}: {})});if(!live()||mine!==reading||!result)return;if(!append)ids=new Set();for(const v of result.records)ids.add(v.id);cursor=result.cursor;loaded=true;
   if(kind==='calendar'){
    try{const c=createSystemClient(F),rows=[];let cursor=null;for(let page=0;page<5;page++){const r=await c.request('actions',{query:{status:'open',cursor}});if(!live()||mine!==reading)return;rows.push(...(r.actions||[]));cursor=r.cursor;if(!cursor)break}reminders=rows}catch(_){}
    if(live())external=linkedEvents(F.workspace?.today?.(),reminders);
   }
  }catch(e){if(live()&&mine===reading)error=navigator.onLine===false?'Offline · your pending changes are kept on this device.':e.message}
  finally{if(live()&&mine===reading){loading=false;paint()}}
 }
 async function openEditor(id,{initial}={}){
  const mine=++editorLoad;if(editorId===id&&editor)return;await editor?.flush();if(!live()||mine!==editorLoad)return;editor?.destroy();editor=null;editorId=id;detail.hidden=false;root.dataset.detail='true';detail.replaceChildren(el('p',{role:'status',text:'Opening…'}));
  try{const [module,value]=await Promise.all([import('./editor.js'),initial?Promise.resolve(initial):store.get(id)]);if(!live()||mine!==editorLoad)return;
   editor=module.createEditor({F,kind,id,value,store,detail,go,home,date,onSaved:()=>{ids.add(id);paint()},exportValue,linkPicker:()=>import('./links.js').then(m=>m.chooseLink(F,kind)),prepareInvitation});paint();
  }catch(e){if(live()&&mine===editorLoad)detail.replaceChildren(ui.error({title:'This item could not open',body:e.message,acts:[{label:'Try again',run:()=>{editorId=null;openEditor(id)}}]}))}
 }
 async function create(initial){if(!store.ready())throw Error('Enable private device storage before creating an item.');const id=operationId(),value=initial||{title:kind==='notes'?'Untitled note':'',links:[],...(kind==='notes'?{text:'',checklist:[]}:kind==='people'?{email:'',phone:'',organisation:'',details:''}:{description:'',allDay:false,start:new Date(date+'T09:00:00').getTime(),end:new Date(date+'T10:00:00').getTime(),timezone:Intl.DateTimeFormat().resolvedOptions().timeZone})};
  if(kind==='notes')await store.save(id,value,{version:0});
  await openEditor(id,{initial:{id,kind,...value,version:0}});F.nav.go('/'+kind+'/#item='+id,{replace:true});
 }
 async function openExternal(v){if(v.ride){const body=el('div',{class:'org'},el('h3',{text:v.title}),el('p',{text:'This ride has no confirmed start time. Review Fitness and Weather, or choose a time to create a linked calendar event.'}));let h;body.append(button('Open Fitness',()=>{h.now();F.nav.go(pathOf(v.source))}),button('Open forecast',()=>{h.now();F.nav.go('/weather/')}),button('Choose event time',()=>{h.now();create({title:v.title,description:'',allDay:false,start:new Date(v.startDate+'T09:00:00').getTime(),end:new Date(v.startDate+'T10:00:00').getTime(),timezone:Intl.DateTimeFormat().resolvedOptions().timeZone,links:[v.source]})},true));h=F.sheet.open({sheet:'calendar-ride',title:'Plan this ride',body});return}
  F.nav.go(v.source.app==='reminders'?'/#you=action-'+v.source.id:pathOf(v.source));
 }
 async function exportValue(v){if(!F.workspace?.files?.save)throw Error('Files is still opening. Try again.');const suffix=kind==='calendar'?'.ics':'.txt',mime=kind==='calendar'?'text/calendar':'text/plain',contents=kind==='calendar'?eventICS(v):kind==='notes'?noteText(v):[v.title,v.organisation,v.email,v.phone,v.details].filter(Boolean).join('\n');return F.workspace.files.save(new File([contents],v.title.replace(/[\/:\\\u0000-\u001f]/g,'-').slice(0,120)+suffix,{type:mime}),{title:'Save a copy to Files'})}
 function prepareInvitation(v){const text=`${v.title}\n${v.allDay?new Date(v.startDate+'T12:00:00').toLocaleDateString():new Date(v.start).toLocaleString()+' · '+when(v)}\n${v.description||''}`.trim(),copy=el('textarea',{rows:6,readonly:true,'aria-label':'Invitation text'});copy.value=text;let h;
  const body=el('div',{class:'org'},el('p',{text:'Review this invitation. Nothing is sent automatically.'}),copy,button('Copy invitation',async()=>{await navigator.clipboard.writeText(text);F.toast('Invitation copied')}),button('Open Chats',()=>{h.now();F.nav.go('/chats/')}));
  if(F.workspace?.handoffs?.can('mail','text'))body.append(button('Prepare in Mail',async()=>{h.now();const result=await F.workspace.handoffs.send('mail','text',{subject:v.title,text});if(!result?.ok)F.toast(result?.error||'Mail could not open.')}));h=F.sheet.open({sheet:'calendar-invite',title:'Prepare invitation',body});
 }
 const changed=()=>{F.workspace?.changed();for(const v of store.snapshot())if(!ids.has(v.id)&&v.updatedAt>Date.now()-3000)ids.add(v.id);paint()};store.subscribe(changed);
 search.addEventListener('input',()=>{clearTimeout(searchTimer);searchTimer=setTimeout(()=>{query=search.value.trim();load()},240)});
 const fileMeta=v=>({id:kind+':'+v.id,app:kind,name:v.title+(kind==='calendar'?'.ics':'.txt'),mime:kind==='calendar'?'text/calendar':'text/plain',category:'document',objectId:v.id,intent:'open',downloadIntent:'download',modifiedAt:v.updatedAt});
 const unregister=F.workspace?.provide({snapshot:()=>({status:error?'error':'ready',availability:{local:store.ready(),pending:store.pending().length,saving:store.pending().some(v=>v.state==='saving'),draft:!!editor?.dirty()||store.localForms().length>0,error:store.pending().some(v=>['failed','conflict'].includes(v.state))},actions:[{id:'new',label:kind==='calendar'?'New event':kind==='notes'?'New note':'Add person',enabled:store.ready()}],files:store.snapshot().filter(v=>!v.deleted).map(fileMeta)}),
  async run(intent,object){if(!live()||!F.workspace.active())return{ok:false};if(intent==='new'){fresh();return{ok:true}}if(intent==='open'&&/^[a-f0-9]{32}$/.test(object||'')){go(object);return{ok:true}}if(intent==='download'&&/^[a-f0-9]{32}$/.test(object||'')){const v=await store.get(object);if(!live()||!F.workspace.active())return{ok:false};const file=new File([kind==='calendar'?eventICS(v):kind==='notes'?noteText(v):[v.title,v.organisation,v.email,v.phone,v.details].filter(Boolean).join('\n')],fileMeta(v).name,{type:fileMeta(v).mime}),url=URL.createObjectURL(file),a=el('a',{href:url,download:file.name,hidden:true});root.append(a);a.click();a.remove();const revoke=()=>URL.revokeObjectURL(url);setTimeout(revoke,1000);life.addEventListener('abort',revoke,{once:true});return{ok:true}}return{ok:false}},
  async search(q,lease={}){const result=await store.list({q});return live()&&!lease.signal?.aborted&&(!lease.current||lease.current())?{status:'ready',entries:result.records.slice(0,8).map(v=>({title:v.title,sub:NAMES[kind],path:'/'+kind+'/#item='+v.id}))}:{status:'error',entries:[]}},
  async files({query:q='',current=()=>true}={}){const r=await store.list({q});return live()&&current()?{status:'ready',more:!!r.cursor,files:r.records.map(fileMeta)}:{status:'error',files:[]}}
 });
 const visibility=()=>{if(shown&&document.visibilityState==='visible')load()};document.addEventListener('visibilitychange',visibility,{signal:life});
 const clear=()=>{clearTimeout(searchTimer);editor?.destroy();unregister?.();root.replaceChildren()};life.addEventListener('abort',clear,{once:true});
 return{show(r){shown=true;route=r;section=r.section||section;viewSwitch?.set(section);header();if(!loaded&&!loading||kind==='calendar')load();if(r.key==='new'){create().catch(e=>F.toast(e.message));return}if(r.key==='item'&&/^[a-f0-9]{32}$/.test(r.arg||'')){openEditor(r.arg);return}const mine=++editorLoad,previous=editor;Promise.resolve(previous?.flush()).then(()=>{if(!live()||mine!==editorLoad)return;previous?.destroy();editor=null;editorId=null;detail.hidden=true;delete root.dataset.detail;paint()}).catch(e=>{if(live())F.toast(e.message)})},hide(){shown=false;editor?.flush()},back(){if(editor){editor.close();return true}return false},busy:()=>!!editor?.dirty()||store.busy(),flush:async()=>{await editor?.flush();return store.flush()},sendable:()=>null,workspace:()=>null,unmount:clear};
}
