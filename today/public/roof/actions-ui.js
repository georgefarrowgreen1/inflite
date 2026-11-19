// Reminder screens share the framework's fields, sheets, focus and feedback.
const NAME={mail:'Mail',chats:'Chats',fitness:'Fitness',weather:'Weather',markets:'Markets',files:'Files',notes:'Notes',calendar:'Calendar',people:'People'};
const DEFAULT={mail:'Follow up in Mail',chats:'Reply in Chats',fitness:'Plan my ride',weather:'Check the forecast',markets:'Review my portfolio',files:'Review this file',notes:'Review this note',calendar:'Prepare for this event',people:'Follow up'};
export const sourcePath=s=>!s?'/':['notes','calendar','people'].includes(s.app)?'/'+s.app+'/#item='+s.id:s.app==='mail'?(s.id?'/mail/#thread='+s.id:'/mail/'):s.app==='chats'?(s.id?'/chats/#open='+s.id:'/chats/'):s.app==='files'?'/#files':s.app==='fitness'?'/fitness/':s.app==='markets'?'/markets/#holdings':'/weather/';
export function dueWords(at,status='open'){
 if(at==null)return 'No date';const date=new Date(at);if(!Number.isFinite(date.getTime()))return '';
 const day=new Intl.DateTimeFormat(undefined,{weekday:'short',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}).format(date);return (status==='open'&&at<Date.now()?'Overdue · ':'')+day;
}
const localDate=at=>{if(at==null)return '';const d=new Date(at);return new Date(at-d.getTimezoneOffset()*60000).toISOString().slice(0,16)};
export function createActionsUI(F,{store,files,openSource,client}){
 const ui=F.ui,live=()=>client.live(),el=ui.el;
 const button=(text,run,primary=false)=>ui.btn(text,{primary,run:()=>{const route=F.route;try{Promise.resolve(run()).catch(e=>{if(live()&&F.route===route)F.toast(e.message||'That did not finish.')})}catch(e){if(live())F.toast(e.message||'That did not finish.')}}});
 const field=(label,input)=>el('label',{class:'s350-field'},el('span',{text:label}),input);
 const errorText=e=>e?.message||'That did not finish. Retry when connected.';
 const showError=(node,e)=>{node.textContent=errorText(e);node.hidden=false};
 async function attach(existing,current){
  const selected=new Map(existing.map(f=>[f.id,f])),status=el('p',{role:'status'}),list=el('div',{class:'s350-list'}),crumb=el('p',{class:'s350-muted'}),q=el('input',{type:'search',placeholder:'Search Drive','aria-label':'Search Drive',maxlength:160});
  let folder=null,parent=null,cursor=null,gen=0,timer=0,resolve;const result=new Promise(r=>resolve=r);
  const done=button('Attach selected',()=>{if(current()&&!h.closed){resolve([...selected.values()]);h.now()}},true),up=button('Up a folder',()=>{folder=parent;cursor=null;read()});
  const more=button('Show more',()=>read(true));let h;
  async function read(append=false){const mine=++gen;if(!current()||h.closed)return;status.textContent='Loading files…';if(!append)list.replaceChildren();more.disabled=true;
   try{const answer=await files.browse({kind:'drive',folderId:folder,view:folder?'folder':q.value?'search':'folder'},{query:q.value.trim(),cursor:append?cursor:null,current:()=>current()&&!h.closed&&mine===gen});if(!current()||h.closed||mine!==gen)return;
    parent=answer.folder?.parentId||null;up.disabled=!folder;crumb.textContent=answer.folder?.name||'My Drive';cursor=answer.cursor;
    for(const item of answer.items||[]){if(item.trashedAt||item.status!=='ready')continue;
     if(item.kind==='folder')list.append(button(item.name,()=>{folder=item.id;cursor=null;q.value='';read()}));
     else{const check=el('input',{type:'checkbox',checked:selected.has(item.id),'aria-label':'Attach '+item.name});check.addEventListener('change',()=>{if(check.checked&&selected.size>=5){check.checked=false;status.textContent='Attach up to five files.';return}check.checked?selected.set(item.id,{id:item.id,version:item.version,name:item.name}):selected.delete(item.id);done.disabled=!selected.size});list.append(el('label',{class:'s350-choice'},check,el('span',{text:item.name})))}
    }status.textContent=answer.items?.length?'':'No files here.';done.disabled=!selected.size;more.hidden=!cursor;
   }catch(e){if(current()&&!h.closed&&mine===gen)showError(status,e)}finally{more.disabled=false}
  }
  q.addEventListener('input',()=>{clearTimeout(timer);timer=setTimeout(()=>{cursor=null;read()},250)});
  h=F.sheet.open({sheet:'action-files',title:'Attach from Files',body:el('div',{class:'system350'},q,el('div',{class:'s350-toolbar'},up,crumb),status,list,more,done),onClose(){gen++;clearTimeout(timer);resolve(null)}});
  done.disabled=!selected.size;read();return result;
 }
 function form(item=null,{source=null,intent=null,initial=null,onCommitted=null}={}){
  item=item||initial;
  if(!live())return null;const title=el('input',{type:'text',maxlength:160,value:item?.title||DEFAULT[source?.app]||'','aria-label':'Reminder title',autocomplete:'off'}),notes=el('textarea',{maxlength:2000,rows:3,'aria-label':'Reminder notes',value:item?.notes||''}),date=el('input',{type:'datetime-local',value:localDate(item?.dueAt),'aria-label':'Reminder date'}),notify=el('input',{type:'checkbox',checked:item?.notify!==false,'aria-label':'Notify on registered devices'}),error=el('p',{role:'status',class:'s350-error',hidden:true}),attachments=el('div',{class:'s350-file-chips'});
  notes.value=item?.notes||'';
  const repeat=el('select',{'aria-label':'Repeat reminder'});for(const [value,label]of [['','Never'],['daily','Every day'],['weekly','Every week'],['monthly','Every month'],['yearly','Every year']])repeat.append(el('option',{value,text:label}));repeat.value=item?.recurrence?.frequency||'';
  let refs=(item?.files||[]).map(f=>({...f,name:item?.attachments?.find(a=>a.id===f.id)?.name||f.name||'Attached file'})),h,saving=false;
  const current=()=>live()&&!h.closed;
  function paintFiles(){attachments.replaceChildren(...refs.map(f=>el('div',{class:'s350-file-chip'},el('span',{text:f.name||'Attached file'}),ui.iconBtn('x',{label:'Remove '+(f.name||'attached file'),run:()=>{refs=refs.filter(x=>x.id!==f.id);paintFiles()}}))))}
  const pick=button('Attach a file',async()=>{try{const chosen=await attach(refs,current);if(current()&&chosen){refs=chosen;paintFiles()}}catch(e){if(current())showError(error,e)}});
  const body=el('form',{class:'system350 s350-form'},field('Title',title),source||item?.source?el('p',{class:'s350-muted',text:'Linked to '+NAME[(source||item.source).app]+'. Your title and notes appear in Today.'}):null,field('Notes',notes),field('Remind me',date),field('Repeat',repeat),el('label',{class:'s350-choice'},notify,el('span',{text:'Notify on devices with Today notifications enabled'})),el('p',{class:'s350-muted',text:'Device alerts follow quiet hours and the next reminder check.'}),attachments,pick,error);
  body.addEventListener('submit',e=>{e.preventDefault();save()});
  async function save(){if(!current()||saving)return;const name=title.value.trim();if(!name){error.textContent='Give the reminder a title.';error.hidden=false;title.focus();return}
   const at=date.value?new Date(date.value).getTime():null;if(at!==null&&!Number.isFinite(at)){error.textContent='Choose a valid date.';error.hidden=false;return}
   if(repeat.value&&!at){error.textContent='Choose a date before setting a repeat.';error.hidden=false;date.focus();return}
   const value={recurrence:repeat.value?{frequency:repeat.value,timezone:Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC'}:null,title:name,notes:notes.value.trim(),dueAt:at,notify:notify.checked,files:refs.map(({id,version})=>({id,version})),...(!item?.version?{source:source||item?.source||null}:{})};saving=true;h.setBusy(true);error.hidden=true;
   try{if(intent)await store.retry(intent.id,{body:value});else if(item?.version)await store.update(item,value);else await store.create(value);if(current()){await onCommitted?.();if(!current())return;h.now();F.toast(navigator.onLine===false?'Reminder kept on this device':'Saving reminder…')}}catch(e){if(current()){h.setBusy(false);saving=false;showError(error,e)}}
  }
  h=F.sheet.open({sheet:'reminder-edit',title:intent?'Edit pending reminder':item?.version?'Edit reminder':'New reminder',focus:title,body,acts:[{label:item?.version?'Save changes':'Add reminder',primary:true,run:save}]});paintFiles();return h;
 }
 async function detail(id){
  if(!live())return;const local=store.snapshot().find(a=>a.id===id);if(local?.pending)return queue(local.intentId);
  const body=el('div',{class:'system350'},el('p',{role:'status',text:'Loading reminder…'})),h=F.sheet.open({sheet:'reminder',title:'Reminder',body});
  try{const a=await store.get(id,{current:()=>live()&&!h.closed});if(!live()||h.closed)return;
   body.replaceChildren(el('h3',{class:'s350-title',text:a.title}),el('p',{class:'s350-muted',text:dueWords(a.dueAt,a.status)+(a.recurrence?' · Repeats '+a.recurrence.frequency:'')}));if(a.repetitions)body.append(el('p',{class:'s350-muted',text:a.repetitions+' completed occurrences. The next date skips missed occurrences.'}));if(a.notes)body.append(el('p',{class:'s350-notes',text:a.notes}));
   if(a.source)body.append(button('Open in '+NAME[a.source.app],()=>{h.now();openSource(a.source)}));
   for(const file of a.attachments||[]){body.append(file.unavailable?el('p',{text:'An attached file is no longer available.'}):button(file.name+(file.changed?' · updated':''),()=>{h.now();openSource({app:'files',id:file.id})}))}
   body.append(el('div',{class:'s350-toolbar'},button(a.status==='done'?'Reopen reminder':'Complete reminder',async()=>{await store.update(a,{status:a.status==='done'?'open':'done'});if(live()&&!h.closed)h.now()},true),button('Edit',()=>{h.now();form(a)}),button('Delete',()=>{let confirm;confirm=F.sheet.open({title:'Delete reminder?',body:el('p',{text:'The linked message or file stays in its app.'}),acts:[{label:'Delete reminder',destructive:true,run:async()=>{try{await store.update(a,{status:'deleted'});if(live()){confirm.now();h.now()}}catch(e){if(live())F.toast(errorText(e))}}}]})})));
  }catch(e){if(live()&&!h.closed)body.replaceChildren(el('p',{role:'status',text:errorText(e)}),button('Retry',()=>{h.now();detail(id)}))}return h;
 }
 function list(){
  if(!live())return;const openedAt=Date.now();let h,status='open',cursor=null,ids=[],generation=0,timer=0;
  const query=el('input',{type:'search',maxlength:160,placeholder:'Search reminders','aria-label':'Search reminders'}),rows=el('div',{class:'s350-list'}),say=el('p',{role:'status',class:'s350-muted'}),tabs=el('div',{class:'s350-segments',role:'group','aria-label':'Reminder state'});
  const more=button('Show older reminders',()=>load(true));
  const controls=['open','done'].map(s=>button(s==='open'?'Open':'Completed',()=>{status=s;cursor=null;load()}));tabs.append(...controls);
  function paint(){if(!live()||h.closed)return;controls.forEach((b,i)=>b.setAttribute('aria-pressed',String(status===(i?'done':'open'))));const all=store.snapshot(),found=all.filter(a=>a.status===status&&(ids.includes(a.id)||a.pending||a.createdAt>=openedAt)).filter(a=>!query.value.trim()||`${a.title} ${a.notes}`.toLowerCase().includes(query.value.trim().toLowerCase()));rows.replaceChildren(...found.map(a=>row(a)));if(!found.length)rows.append(el('p',{class:'s350-empty',text:query.value?'No reminders match this search.':status==='done'?'Completed reminders appear here.':'Add a reminder or save one from an app.'}));say.textContent=store.queued().length?store.queued().length+' changes kept on this device':'';more.hidden=!cursor}
  async function load(append=false){const mine=++generation;say.textContent='Loading reminders…';try{let result;if(query.value.trim()){const actions=await store.search(query.value.trim(),{current:()=>live()&&!h.closed&&generation===mine});result={actions,cursor:null}}else result=await store.load({status,view:'',cursor:append?cursor:null,current:()=>live()&&!h.closed&&generation===mine});if(!live()||h.closed||mine!==generation||!result)return;ids=append?[...ids,...result.actions.map(a=>a.id)]:result.actions.map(a=>a.id);cursor=result.cursor;paint()}catch(e){if(live()&&!h.closed&&mine===generation)showError(say,e)}}
  query.addEventListener('input',()=>{clearTimeout(timer);timer=setTimeout(()=>load(),250)});
  h=F.sheet.open({sheet:'reminders',title:'Reminders',body:el('div',{class:'system350'},el('div',{class:'s350-toolbar'},button('New reminder',()=>form(),true),button('Pending changes',()=>queue())),query,tabs,say,rows,more),onClose:()=>{generation++;clearTimeout(timer);off()}});const off=store.subscribe(paint);load();return h;
 }
 function row(a){
  const check=ui.iconBtn('check',{label:(a.status==='done'?'Reopen ':'Complete ')+a.title,run:async()=>{try{await store.update(a,{status:a.status==='done'?'open':'done'})}catch(e){if(live())F.toast(errorText(e))}}});check.disabled=!!a.pending;check.setAttribute('aria-pressed',String(a.status==='done'));
  const open=el('button',{type:'button',class:'s350-row-main',on:{click:()=>a.pending?queue(a.intentId):detail(a.id)}},el('strong',{text:a.title}),el('small',{text:a.pending?(a.pendingState==='conflict'?'Review changes':a.pendingState==='failed'?'Needs attention':'Kept on this device'):dueWords(a.dueAt,a.status)+(a.recurrence?' · '+a.recurrence.frequency:'')}));
  return el('article',{class:'s350-action-row',data:{overdue:String(a.status==='open'&&a.dueAt!=null&&a.dueAt<Date.now())}},check,open);
 }
 function queue(only=null){
  if(!live())return;const body=el('div',{class:'system350'});let h;
  const paint=()=>{if(!live()||h.closed)return;const values=store.queued().filter(i=>!only||i.id===only);body.replaceChildren();if(!values.length)body.append(el('p',{text:'All reminder changes are saved.'}));
   for(const i of values){const block=el('section',{class:'s350-card'},el('h3',{text:i.body.title||store.snapshot().find(a=>a.id===i.actionId)?.title||'Reminder change'}),el('p',{text:i.error||(i.state==='running'?'Saving…':'Kept on this device. Waiting to save.')}));
    if(i.state!=='running')block.append(button(i.state==='conflict'?'Review saved version':'Retry',async()=>{try{if(i.state==='conflict'&&i.actionId){const latest=await store.get(i.actionId,{current:()=>live()&&!h.closed});if(!live()||h.closed)return;let review;review=F.sheet.open({sheet:'reminder-conflict',title:'Reminder changed',body:el('div',{class:'system350'},el('h3',{text:'Saved on your account'}),el('p',{text:latest.title}),el('p',{text:latest.notes||dueWords(latest.dueAt,latest.status)}),el('h3',{text:'Your pending change'}),el('p',{text:i.body.title||i.body.status||'Edited reminder'})),acts:[{label:'Use account version',run:async()=>{await store.discard(i.id);if(live())review.now()}},{label:'Keep this edit',primary:true,run:async()=>{await store.retry(i.id,{version:latest.version});if(live())review.now()}}]})}else await store.retry(i.id)}catch(e){if(live()&&!h.closed)F.toast(errorText(e))}}),button('Edit pending reminder',()=>form({...store.snapshot().find(a=>a.id===(i.actionId||i.id)),...i.body},{intent:i})),button('Stop retrying',async()=>{await store.discard(i.id);if(live())paint()}));body.append(block)
   }
  };h=F.sheet.open({sheet:'reminder-queue',title:'Pending reminder changes',body,onClose:()=>off()});const off=store.subscribe(paint);paint();return h;
 }
 return {form,detail,list,row,queue};
}
