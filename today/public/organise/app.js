import {createStore} from './store.js';
import {createSystemClient,operationId} from '/roof/system-client.js';
import {localDay,addDays,eventDay,overlaps,when,linkedEvents,pathOf,noteText,eventICS} from './model.js';
const NAMES={calendar:'Calendar',notes:'Notes',people:'People'},SECTIONS={calendar:[['week','Week'],['agenda','Month']],notes:[['all','All notes']],people:[['contacts','Contacts']]};
export async function mountApp(root,F,kind){
 const ui=F.ui,el=ui.el,store=await(F.workspace?.organiseStore?.(kind)||createStore(F,kind)),life=F.signal,live=()=>!life.aborted;let route=null,shown=false,loaded=false,reading=0,query='',cursor=null,ids=new Set(),editor=null,editorId=null,editorLoad=0,loading=false,error='',reminders=[],date=localDay(),section=SECTIONS[kind][0][0],searchTimer=0,external=[],noteFilter='all',noteView='list',feedRefreshedAt=0;
 root.classList.add('org');root.dataset.organise=kind;root.dataset.notesView=noteView;
 const safe=fn=>()=>{try{Promise.resolve(fn()).catch(e=>{if(live())F.toast(e.message)})}catch(e){if(live())F.toast(e.message)}};
 const button=(label,run,primary=false)=>ui.btn(label,{primary,run:safe(run)});
 const go=id=>F.nav.go('/'+kind+'/#item='+id),home=()=>F.nav.go('/'+kind+'/#'+section),fresh=()=>F.nav.go('/'+kind+'/#new');
 const createLabel=kind==='calendar'?'New event':kind==='notes'?'New note':'Add person';
 const search=el('input',{type:'search',class:'org-search',maxlength:160,placeholder:kind==='people'?'Search contacts':kind==='notes'?'Search notes':'Search events','aria-label':'Search '+NAMES[kind]}),status=el('p',{class:'org-status',role:'status'}),list=el('div',{class:'org-list'}),detail=el('section',{class:'org-detail',hidden:true,'aria-label':NAMES[kind]+' editor'}),more=button('Show more',()=>load(true)),retry=button('Try again',()=>load());
 const count=el('span',{class:'org-library-count'}),createButton=ui.btn(createLabel,{icon:'plus',primary:true,run:fresh}),caption=el('div',{class:'org-library-caption'},el('h2',{text:kind==='notes'?'Library':kind==='people'?'Contacts':'Upcoming'}),count);
 const actions=el('div',{class:'org-library-head'},caption,createButton),searchBox=el('label',{class:'org-search-box'},ui.icon('search'),search);
 const noteTools=kind==='notes'?el('div',{class:'org-library-options'},ui.seg([['all','All notes'],['lists','Checklists']],noteFilter,value=>{noteFilter=value;paint()},{label:'Notes collection'}),ui.iconBtn('grid',{label:'Switch notes layout',run:()=>{noteView=noteView==='list'?'grid':'list';root.dataset.notesView=noteView;paint()}})):null;
 const sidebar=el('section',{class:'org-browser'},actions,searchBox,status,retry,list,more);retry.hidden=true;if(noteTools)sidebar.insertBefore(noteTools,searchBox);
 const weekStrip=el('nav',{class:'org-week-strip','aria-label':'Choose a date'}),monthTitle=el('h2'),monthGrid=el('div',{class:'org-month-grid'});
 const day=el('input',{type:'date',value:date,'aria-label':'Calendar date'}),datePicker=el('label',{class:'org-date-picker'},monthTitle,day);
 const changeDate=n=>{const d=new Date(date+'T12:00:00');if(section==='week')date=addDays(date,n*7);else{d.setDate(1);d.setMonth(d.getMonth()+n);date=localDay(d)}day.value=date;load()};
 const viewSwitch=kind==='calendar'?ui.seg([['agenda','Month'],['week','Week']],section,value=>{section=value;F.nav.go('/calendar/#'+value)},{label:'Calendar view'}):null;
 if(kind==='calendar'){
  const nav=el('div',{class:'org-month-nav'},ui.iconBtn('back',{label:'Previous',run:()=>changeDate(-1)}),ui.iconBtn('chev',{label:'Next',run:()=>changeDate(1)}));
  const dates=el('section',{class:'org-calendar-panel','aria-label':'Calendar dates'},el('div',{class:'org-month-head'},datePicker,nav),el('div',{class:'org-calendar-controls'},viewSwitch,button('Today',()=>{date=localDay();day.value=date;load()})),weekStrip,monthGrid);
  sidebar.prepend(dates);day.addEventListener('change',()=>{if(day.validity.valid&&day.value){date=day.value;load()}});
 }
 const layout=el('div',{class:'org-layout'},sidebar,detail);root.replaceChildren(layout);
 function range(){const first=section==='week'?date:date.slice(0,8)+'01',start=addDays(first,-((new Date(first+'T12:00:00').getDay()+6)%7));return[start,addDays(start,section==='week'?7:42)]}
 const matches=v=>!query||ids.has(v.id)||[v.title,v.preview,v.text,v.description,v.details,v.email,v.organisation,...(v.checklist||[]).map(c=>c.text)].some(t=>t?.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
 const currentRows=()=>{
  const pending=[...store.localForms(),...store.pending()],map=new Map([...ids].map(id=>[id,store.view(id)]));for(const v of pending)map.set(v.id,v);
  let rows=[...map.values()].filter(v=>v&&!v.deleted&&matches(v));
  if(kind==='calendar'){const [a,b]=range();rows=rows.filter(v=>overlaps(v,a,b)).concat(external.filter(v=>overlaps(v,a,b)&&matches(v)));rows.sort((a,b)=>eventDay(a).localeCompare(eventDay(b))||(a.start||0)-(b.start||0));}
  else if(kind==='people')rows.sort((a,b)=>a.title.localeCompare(b.title));else rows.sort((a,b)=>b.updatedAt-a.updatedAt);
  return kind==='notes'&&noteFilter==='lists'?rows.filter(v=>(v.checkCount??v.checklist?.length??0)>0):rows;
 };
 function header(){F.header.set({title:NAMES[kind],line:'',crumb:{text:'InFlite',app:kind},sections:null,section,acts:kind==='calendar'?[{icon:'settings',label:'Connected calendars',run:()=>F.workspace?.life?.calendars()}]:kind==='people'?[{icon:'more',label:'Contacts actions',run:()=>{const body=el('div',{class:'org'},button('Import contacts',()=>{h.now();return importContacts()}));const h=F.sheet.open({sheet:'contacts-actions',title:'Contacts',body})}}]:[]})}
 function dateLabel(d,options){return new Date(d+'T12:00:00').toLocaleDateString([],options)}
 function paintDates(rows){
  monthTitle.textContent=dateLabel(date,{month:'long',year:'numeric'});weekStrip.hidden=section!=='week';monthGrid.hidden=section==='week';
  const focusDate=root.contains(document.activeElement)?document.activeElement?.dataset.date:null;const [first]=range(),parent=section==='week'?weekStrip:monthGrid;parent.replaceChildren();
  if(section!=='week')for(let i=0;i<7;i++)parent.append(el('span',{class:'org-weekday',text:dateLabel(addDays('2026-11-16',i),{weekday:'short'})}));
  for(let i=0;i<(section==='week'?7:42);i++){
   const d=addDays(first,i),n=rows.filter(v=>overlaps(v,d,addDays(d,1))).length,b=el('button',{type:'button',class:'org-date',data:{date:d,outside:d.slice(0,7)!==date.slice(0,7),today:d===localDay()},'aria-current':date===d?'date':null,'aria-label':dateLabel(d,{weekday:'long',day:'numeric',month:'long'})+' · '+n+' items',on:{click:()=>{date=d;day.value=d;load()}}},section==='week'?el('span',{text:dateLabel(d,{weekday:'short'})}):null,el('strong',{text:new Date(d+'T12:00:00').getDate()}),el('small',{class:n?'org-date-dot':'','aria-hidden':true}));parent.append(b);
  }
  if(focusDate)parent.querySelector('[data-date="'+CSS.escape(focusDate)+'"]')?.focus({preventScroll:true});
 }
 function paint(){
  if(!live())return;const active=list.contains(document.activeElement)?document.activeElement?.closest('[data-record]')?.dataset.record:null;
  status.textContent=error||(loading&&!loaded?'Opening…':store.pending().some(v=>v.state==='conflict')?'A change needs review. Open the marked item.':!store.ready()?'Private device storage is unavailable. Editing is paused.':'');
  status.dataset.tone=error?'error':'';more.hidden=!cursor;more.disabled=loading;retry.hidden=!error;retry.disabled=loading;
  const allRows=currentRows();let rows=allRows;if(kind==='calendar'){paintDates(allRows);const monthEnd=localDay(new Date(Number(date.slice(0,4)),Number(date.slice(5,7)),1));rows=allRows.filter(v=>overlaps(v,date,section==='week'?addDays(date,1):monthEnd));caption.firstChild.textContent=section==='week'?dateLabel(date,{weekday:'long',day:'numeric',month:'short'}):'Upcoming';}
  count.textContent=rows.length?(rows.length+(cursor?'+':'')+' '+(kind==='notes'?(rows.length===1?'note':'notes'):kind==='people'?(rows.length===1?'person':'people'):(rows.length===1?'item':'items'))):'';
  const isEmpty=loaded&&!loading&&!query&&!store.snapshot().some(v=>!v.deleted)&&!store.localForms().length;actions.hidden=kind!=='calendar'&&isEmpty;searchBox.hidden=kind!=='calendar'&&isEmpty;if(noteTools)noteTools.hidden=isEmpty;
  list.replaceChildren();let group='',groupBox=list;
  if(!rows.length&&!loading){
   const first=!query&&kind!=='calendar'&&(kind!=='notes'||noteFilter==='all'),empty=el('section',{class:first?'org-welcome':'org-empty'});
   if(first){
    const art=el('div',{class:'org-welcome-art','aria-hidden':true},kind==='notes'?el('div',{class:'org-paper org-paper-back'}):el('div',{class:'org-portrait org-portrait-back'},ui.avatar('M')),kind==='notes'?el('div',{class:'org-paper'},el('span',{class:'org-paper-mark'},ui.icon('file')),el('i'),el('i'),el('i')):el('div',{class:'org-portrait'},ui.avatar('R')),el('span',{class:'org-art-badge'},ui.icon(kind==='notes'?'plus':'person')));
    empty.append(art,el('h2',{text:kind==='notes'?'No notes yet':'No contacts yet'}),el('p',{text:kind==='notes'?'Start writing or make a checklist.':'Add someone, or bring your contacts with you.'}),button(createLabel,fresh,true));
    if(kind==='notes')empty.append(button('Start a checklist',()=>create({title:'Untitled checklist',text:'',checklist:[{id:operationId(),text:'',done:false}],links:[]})));
    else empty.append(button('Import contacts',()=>importContacts()));
   }else empty.append(el('span',{class:'org-empty-icon'},ui.icon(kind==='notes'?'file':kind==='people'?'person':'calendar')),el('h3',{text:query?'No results':kind==='notes'?'No checklists yet':'Nothing scheduled'}),el('p',{text:query?'Try another name or title.':kind==='notes'?'Turn your next note into a list.':section==='week'?'Nothing scheduled for this day.':'Nothing else scheduled this month.'}),kind==='notes'?button('Start a checklist',()=>create({title:'Untitled checklist',text:'',checklist:[{id:operationId(),text:'',done:false}],links:[]})):null);
   list.append(empty);
  }
  for(const v of rows){
   const key=kind==='calendar'?eventDay(v)<date?date:eventDay(v):kind==='people'?(v.title.trim()[0]||'#').toLocaleUpperCase():noteView==='list'?(localDay(v.updatedAt||Date.now())===localDay()?'Today':localDay(v.updatedAt||Date.now())===addDays(localDay(),-1)?'Yesterday':'Earlier'):'';
   if(key&&key!==group){group=key;list.append(el('h3',{class:'org-day-label',text:kind==='calendar'?dateLabel(group,{weekday:'long',day:'numeric',month:'long'}):group}));groupBox=el('div',{class:'org-record-group'});list.append(groupBox)}
   const b=el('button',{type:'button',class:'org-record',data:{record:v.id},'aria-current':editorId===v.id?'true':null,on:{click:safe(()=>v.source?openExternal(v):go(v.id))}}),copy=el('span',{class:'org-record-copy'},el('strong',{text:v.title}));
   if(kind==='calendar'){
    const time=v.ride?'To plan':v.allDay?(v.source?'Date only':'All day'):new Date(v.start).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'});
    b.append(el('span',{class:'org-event-time'},el('strong',{text:time}),!v.allDay&&v.end-v.start>60000?el('small',{text:new Date(v.end).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})}):null));
    const subtitle=v.source?(v.ride?'Fitness · choose a time':v.label):v.links?.length?v.links.length+' linked '+(v.links.length===1?'item':'items'):'';if(subtitle)copy.append(el('span',{class:'org-muted',text:subtitle}));
    b.dataset.source=v.source?.app||'calendar';
   }else if(kind==='notes'){
    b.append(el('span',{class:'org-note-symbol'},ui.icon((v.checkCount??v.checklist?.length??0)?'check':'file')));const preview=(v.matchPreview??v.preview??v.text??'').trim();copy.append(el('span',{class:'org-note-preview org-muted',text:preview||'No additional text'}));
    const total=v.checkCount??v.checklist?.length??0,done=v.doneCount??v.checklist?.filter(x=>x.done).length??0;
    copy.append(el('span',{class:'org-note-meta'},el('span',{text:v.updatedAt?new Date(v.updatedAt).toLocaleDateString([],{month:'short',day:'numeric'}):'Just now'}),total?el('span',{text:done+' / '+total+' checked'}):null));
   }else{b.append(el('span',{class:'org-record-avatar'},ui.avatar(v.title)));copy.append(el('span',{class:'org-muted',text:v.organisation||v.email||v.phone||'Contact'}));}
   b.append(copy);if(kind!=='notes')b.append(ui.icon('chev'));
   if(v.formDraft)b.append(el('span',{class:'org-pending',text:'Draft'}));if(v.pending)b.append(el('span',{class:'org-pending',text:v.state==='conflict'?'Review':v.state==='failed'?'Retry':'Saving'}));groupBox.append(b);
  }
  if(active)list.querySelector('[data-record="'+CSS.escape(active)+'"]')?.focus({preventScroll:true});editor?.status();
 }
 async function importContacts(){const [m]=await Promise.all([import('./import.js'),import('/roof/modules.js').then(m=>m.loadStyles(new URL('./editor.css',import.meta.url).pathname))]);if(live()&&shown)m.openImport({F,store,onImported:()=>load()})}
 async function load(append=false){
  if(!live())return;const mine=++reading;loading=true;error='';paint();
  try{const result=await store.list({q:query,cursor:append?cursor:null,...(kind==='calendar'?{range:range()}: {})});if(!live()||mine!==reading||!result)return;if(!append)ids=new Set();for(const v of result.records)ids.add(v.id);cursor=result.cursor;loaded=true;
   if(kind==='calendar'){
    let feeds=[];try{const refresh=Date.now()-feedRefreshedAt>15*60000;feedRefreshedAt=Date.now();const m=await import('./connected.js');if(live()&&mine===reading)feeds=await m.readFeeds(F,range(),{current:()=>live()&&shown,refresh,onRefresh:()=>load()})}catch(_){}
    if(!live()||mine!==reading)return;
    try{const c=createSystemClient(F),rows=[];let cursor=null;for(let page=0;page<5;page++){const r=await c.request('actions',{query:{status:'open',cursor}});if(!live()||mine!==reading)return;rows.push(...(r.actions||[]));cursor=r.cursor;if(!cursor)break}reminders=rows}catch(_){}
    if(live())external=linkedEvents(F.workspace?.today?.(),reminders).concat(feeds);
   }
  }catch(e){if(live()&&mine===reading)error=navigator.onLine===false?'Offline · your pending changes are kept on this device.':e.message}
  finally{if(live()&&mine===reading){loading=false;paint()}}
 }
 async function openEditor(id,{initial}={}){
  const mine=++editorLoad;if(editorId===id&&editor)return;await editor?.flush();if(!live()||mine!==editorLoad)return;editor?.destroy();editor=null;editorId=id;detail.hidden=false;root.dataset.detail='true';detail.replaceChildren(el('p',{role:'status',text:'Opening…'}));
  try{const [module,value]=await Promise.all([import('./editor.js'),initial?Promise.resolve(initial):store.get(id),import('/roof/modules.js').then(m=>m.loadStyles(new URL('./editor.css',import.meta.url).pathname))]);if(!live()||mine!==editorLoad)return;
   editor=module.createEditor({F,kind,id,value,store,detail,go,home,date,onSaved:()=>{ids.add(id);paint()},exportValue,linkPicker:()=>import('./links.js').then(m=>m.chooseLink(F,kind)),prepareInvitation});paint();
  }catch(e){if(live()&&mine===editorLoad)detail.replaceChildren(ui.error({title:'This item could not open',body:e.message,acts:[{label:'Try again',run:()=>{editorId=null;openEditor(id)}}]}))}
 }
 async function create(initial){if(!store.ready())throw Error('Enable private device storage before creating an item.');const id=operationId(),value=initial||{title:kind==='notes'?'Untitled note':'',links:[],...(kind==='notes'?{text:'',checklist:[]}:kind==='people'?{email:'',phone:'',organisation:'',details:''}:{description:'',allDay:false,start:new Date(date+'T09:00:00').getTime(),end:new Date(date+'T10:00:00').getTime(),timezone:Intl.DateTimeFormat().resolvedOptions().timeZone})};
  if(kind==='notes')await store.save(id,value,{version:0});
  if(!live()||!shown)return;await openEditor(id,{initial:{id,kind,...value,version:0}});if(!live()||!shown)return;F.nav.go('/'+kind+'/#item='+id,{replace:true});
 }
 async function openExternal(v){if(v.readOnly)return import('./connected.js').then(m=>live()&&shown&&m.openEvent(F,v,{create}));if(v.ride){const body=el('div',{class:'org'},el('h3',{text:v.title}),el('p',{text:'This ride has no confirmed start time. Review Fitness and Weather, or choose a time to create a linked calendar event.'}));let h;body.append(button('Open Fitness',()=>{h.now();F.nav.go(pathOf(v.source))}),button('Open forecast',()=>{h.now();F.nav.go('/weather/')}),button('Choose event time',()=>{h.now();create({title:v.title,description:'',allDay:false,start:new Date(v.startDate+'T09:00:00').getTime(),end:new Date(v.startDate+'T10:00:00').getTime(),timezone:Intl.DateTimeFormat().resolvedOptions().timeZone,links:[v.source]})},true));h=F.sheet.open({sheet:'calendar-ride',title:'Plan this ride',body});return}
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
  async search(q,lease={}){const result=await store.list({q});return live()&&!lease.signal?.aborted&&(!lease.current||lease.current())?{status:'ready',entries:result.records.slice(0,8).map(v=>({title:v.title,sub:v.matchPreview||v.preview||NAMES[kind],path:'/'+kind+'/#item='+v.id}))}:{status:'error',entries:[]}},
  async files({query:q='',current=()=>true}={}){const r=await store.list({q});return live()&&current()?{status:'ready',more:!!r.cursor,files:r.records.map(fileMeta)}:{status:'error',files:[]}}
 });
 const incoming=e=>{if(live()&&shown&&e.detail?.owner===(F.session.view?.user?.id||F.session.user?.id)&&e.detail?.kind===kind)load()};window.addEventListener('inflite:organise-change',incoming,{signal:life});
 const visibility=()=>{if(shown&&document.visibilityState==='visible')load()};document.addEventListener('visibilitychange',visibility,{signal:life});
 const clear=()=>{clearTimeout(searchTimer);editor?.destroy();unregister?.();root.replaceChildren()};life.addEventListener('abort',clear,{once:true});
 return{show(r){shown=true;route=r;if(kind==='calendar'&&r.key==='date'&&/^\d{4}-\d{2}-\d{2}$/.test(r.arg||'')){date=r.arg;day.value=date;section='week'}if(!['item','new'].includes(r.key))section=r.section||section;viewSwitch?.set(section);header();if(!loaded&&!loading||kind==='calendar')load();if(r.key==='new'){create().catch(e=>F.toast(e.message));return}if(r.key==='item'&&/^[a-f0-9]{32}$/.test(r.arg||'')){openEditor(r.arg);return}const mine=++editorLoad,previous=editor;Promise.resolve(previous?.flush()).then(()=>{if(!live()||mine!==editorLoad)return;previous?.destroy();editor=null;editorId=null;detail.hidden=true;delete root.dataset.detail;paint()}).catch(e=>{if(live())F.toast(e.message)})},hide(){shown=false;editor?.flush()},back(){if(editor){editor.close();return true}return false},busy:()=>!!editor?.dirty()||store.busy(),flush:async()=>{await editor?.flush();return store.flush()},sendable:()=>null,workspace:()=>null,unmount:clear};
}
