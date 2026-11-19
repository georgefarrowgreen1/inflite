import {createSystemClient,operationId} from '/roof/system-client.js';
import {addDays,localDay,localInput,parseLocal,zone,pathOf} from './model.js';

export function renderPersonProfile(profile, F, {value, handle, chat, edit, saveState}) {
 const {avatar, btn, el} = F.ui;
 profile.classList.add('org-person');
 const identity = el('div', {class:'org-person-identity'}, avatar(value.title),
  el('div', {}, el('h2', {text:value.title}), saveState));
 const mail = F.workspace?.handoffs;
 const emailHref = value.email ? 'mailto:' + encodeURIComponent(value.email) : '';
 const actions = el('div', {class:'org-person-actions'},
  chat ? btn('Message', {icon:'bubble', primary:true, run:chat}) : null,
  emailHref ? btn('Email', {icon:'mail', ...(mail?.can('mail','text')
   ? {run:()=>mail.send('mail','text',{subject:'Hello '+value.title,text:'',to:value.email})}
   : {href:emailHref})}) : null,
  btn(edit.label, {icon:'pen', primary:!chat&&!saveState, run:edit.run}));
 const fields = [
  ['Email',value.email],
  ['Phone',value.phone ? el('a',{href:'tel:'+encodeURIComponent(value.phone),text:value.phone}) : null],
  ['Organisation',value.organisation],
  ['Chat handle',handle && value.title!=='@'+handle ? '@'+handle : null],
  ['Contact notes',value.details],
 ];
 const details = el('dl', {class:'org-person-details','aria-label':'Contact details'},
  fields.filter(([,content])=>content).map(([label,content])=>el('div',{},el('dt',{text:label}),el('dd',{},content))));
 profile.replaceChildren(identity, actions, details.childElementCount ? details :
  el('p', {class:'org-muted org-person-empty',text:'No contact details yet.'}));
}

export function openFriendProfile(F,{detail,id,current,store,go,findContact}){
 const ui=F.ui,el=ui.el,chat={id};
 const client=createSystemClient(F,{prefix:'/api/organise/'});
 let rendered;
 async function existingContact(active){
  const local=findContact();
  if(local)return local;
  const {records}=await client.request('list',{method:'POST',body:{kind:'people',related:{app:'chats',id},limit:1},current:active});
  return records.find(value=>value.links?.some(ref=>ref.app==='chats'&&ref.id===id))?.id;
 }
 return (friend,state,loaded)=>{
  if(!current())return;
  const key=friend?JSON.stringify([friend.name,friend.handle]):'missing:'+(loaded?'loaded':state);
  if(key===rendered)return;
  rendered=key;
  if(!friend){
   const waiting=!loaded&&(!state||state==='ready');
   detail.replaceChildren(waiting?el('p',{role:'status',text:'Opening contact…'}):
    ui.empty({title:state==='locked'?'Chats is locked':'Chat friend unavailable',
     body:state==='locked'?'Unlock Chats to view this profile.':'Open Chats to check your friends.',
     acts:[{label:'Open Chats',href:'/chats/#friends'}]}));
   return;
  }
  const profile=el('section',{class:'org-profile'}),extra=el('details',{class:'org-extra org-people-extra'},el('summary',{text:'More actions'}));
  const message=el('p',{class:'org-status',role:'status'}),active=()=>current()&&detail.contains(profile);
  let selecting=false;
  async function select(useExisting){
   if(!active()||selecting)return;
   selecting=true;profile.setAttribute('aria-busy','true');message.textContent='';
   try{
    const existing=await existingContact(active);
    if(!active())return;
    if(existing){go(existing,null,true);return}
    if(useExisting){
     const {chooseLink}=await import('./links.js');
     if(!active())return;
     const selected=await chooseLink(F,'chats',{contactsOnly:true});
     if(selected&&active())go(selected.id,{chat},true);
    }else{
     if(!store.ready())throw Error('Private device storage is unavailable. Try again before adding details.');
     const recordId=operationId();
     go(recordId,{chat,initial:{id:recordId,kind:'people',title:friend.name,links:[],version:0}},true);
    }
   }catch(error){if(active())message.textContent=error.message}
   finally{selecting=false;profile.removeAttribute('aria-busy')}
  }
  renderPersonProfile(profile,F,{value:{title:friend.name},handle:friend.handle,
   edit:{label:'Add details',run:()=>select(false)},chat:()=>{if(active())F.nav.go(pathOf({app:'chats',id}))}});
  extra.append(el('div',{class:'org-toolbar'},ui.btn('Link to existing contact',{icon:'link',run:()=>select(true)})));
  detail.replaceChildren(profile,message,extra);
 };
}

export function createEditor({F,kind,id,value,store,detail,home,onSaved,exportValue,linkPicker,prepareInvitation,chat,friendFor}){
 const ui=F.ui,el=ui.el,life=F.signal;let dead=false,dirty=!!value.formDraft,formKept=!!value.formDraft,editEpoch=0,timer=0,version=value.version||0,writing=Promise.resolve(),links=structuredClone(value.links||[]),checklist=structuredClone(value.checklist||[]),labels=new Map((value.linkedLabels||[]).map(r=>[r.app+':'+r.id,r.unavailable?'Unavailable '+r.app:r.title||r.app])),lastSaved=JSON.stringify(value),mounted=true;
 if(chat&&!links.some(ref=>ref.app==='chats'&&ref.id===chat.id)){
  if(links.length>=12)throw Error('Remove a linked item before linking this Chat friend.');
  links.push({app:'chats',id:chat.id});dirty=true;formKept=false;
 }
 const owner=F.session.view?.user?.id||F.session.user?.id;
 const live=()=>!dead&&!life.aborted&&(F.session.view?.user?.id||F.session.user?.id)===owner,safe=fn=>()=>{try{Promise.resolve(fn()).catch(e=>{if(live())message.textContent=e.message})}catch(e){if(live())message.textContent=e.message}};
 const button=(text,fn,primary=false)=>ui.btn(text,{primary,run:safe(fn)}),message=el('p',{role:'status',class:'org-status'}),saved=el('span',{class:'org-save-state',role:'status'}),form=el('form',{class:'org-form'});
 const field=(name,type,initial,max,required=false)=>{const input=el(type==='textarea'?'textarea':'input',{...(type==='textarea'?{rows:name==='Note'?12:3}:{type}),maxlength:max,required,'aria-label':name});input.value=initial??'';form.append(el('label',{class:'org-field'},el('span',{text:name}),input));return input};
 const title=field(kind==='people'?'Name':'Title','text',value.title,160,true);title.autocomplete=kind==='people'?'name':'off';title.placeholder=kind==='people'?'Full name':kind==='notes'?'Title':'Event title';
 let text,email,phone,organisation,description,allDay,start,end,startDate,endDate,checks=null;
 if(kind==='notes'){text=field('Note','textarea',value.text||'',64000);text.classList.add('org-note-body');text.placeholder='Start writing…';checks=el('div',{class:'org-checklist'});form.append(checks);paintChecks();form.append(button('Add checklist item',()=>{if(checklist.length>=200)throw Error('Use up to 200 items.');checklist.push({id:operationId(),text:'',done:false});paintChecks();changed();checks.lastElementChild?.querySelector('input[type=text]')?.focus()}));}
 if(kind==='people'){if(chat)form.append(el('p',{class:'org-muted',text:'These details are private to your InFlite account.'}));organisation=field('Organisation','text',value.organisation,160);email=field('Email','email',value.email,254);email.autocomplete='email';phone=field('Phone','tel',value.phone,40);phone.autocomplete='tel';text=field('Contact notes','textarea',value.details,4000);}
 if(kind==='calendar'){
  description=field('Description','textarea',value.description,4000);allDay=el('input',{type:'checkbox',checked:value.allDay,'aria-label':'All-day event'});form.append(el('label',{class:'org-check'},allDay,el('span',{text:'All day'})));
  const first=value.allDay?value.startDate:localDay(value.start),last=value.allDay?value.endDate:addDays(first,1);
  start=field('Starts','datetime-local',value.startLocal??localInput(value.start||new Date(first+'T09:00:00').getTime()));end=field('Ends','datetime-local',value.endLocal??localInput(value.end||new Date(first+'T10:00:00').getTime()));startDate=field('First day','date',value.firstDay??first);endDate=field('Last day','date',value.lastDay??addDays(last,-1));
  form.append(description.closest('label'));form.append(el('p',{class:'org-muted',text:'Times shown in '+zone()+'. All-day dates stay on the selected days.'}));const dates=()=>{start.closest('label').hidden=end.closest('label').hidden=allDay.checked;startDate.closest('label').hidden=endDate.closest('label').hidden=!allDay.checked};allDay.addEventListener('change',dates);dates();
 }
 const linksBox=el('div',{class:'org-links'});form.append(el('div',{class:'org-toolbar'},el('h3',{text:'Linked items'}),button('Link an item',async()=>{const selected=await linkPicker();if(!live()||!selected)return;if(links.length>=12)throw Error('Link up to twelve items.');const {title,...ref}=selected;if(title)labels.set(ref.app+':'+ref.id,title);if(!links.some(r=>JSON.stringify(r)===JSON.stringify(ref)))links.push(ref);paintLinks();changed()})),linksBox);paintLinks();
 function paintChecks(){if(!checks)return;checks.replaceChildren();for(const c of checklist){const checkbox=el('input',{type:'checkbox',checked:c.done,'aria-label':'Complete checklist item'}),input=el('input',{type:'text',maxlength:500,'aria-label':'Checklist item'});input.value=c.text;checkbox.addEventListener('change',()=>{c.done=checkbox.checked;changed()});input.addEventListener('input',()=>{c.text=input.value;changed()});checks.append(el('div',{class:'org-check-row'},checkbox,input,ui.iconBtn('x',{label:'Remove checklist item',run:()=>{checklist=checklist.filter(x=>x!==c);paintChecks();changed()}})))}}
 function paintLinks(){linksBox.replaceChildren();if(!links.length)linksBox.append(el('p',{class:'org-muted',text:'Link a file, note, person, event or app source.'}));for(const r of links){const label=el('span',{text:labels.get(r.app+':'+r.id)||r.app[0].toUpperCase()+r.app.slice(1)}),open=button('Open',()=>r.app==='files'?F.workspace?.openReference(r):F.nav.go(pathOf(r))),remove=ui.iconBtn('x',{label:'Remove link to '+r.app,run:()=>{links=links.filter(x=>x!==r);paintLinks();changed()}});linksBox.append(el('div',{class:'org-link'},ui.icon(r.app==='files'?'file':'open'),label,open,remove))}}
 function read(){const out={title:title.value.trim(),links:structuredClone(links)};if(kind==='notes')Object.assign(out,{text:text.value,checklist:structuredClone(checklist)});if(kind==='people')Object.assign(out,{email:email.value.trim(),phone:phone.value.trim(),organisation:organisation.value,details:text.value});if(kind==='calendar'){
   Object.assign(out,{description:description.value,allDay:allDay.checked,timezone:zone()});if(out.allDay){if(!startDate.value||!endDate.value||endDate.value<startDate.value)throw Error('Check the event dates.');out.startDate=startDate.value;out.endDate=addDays(endDate.value,1)}else{out.start=Number.isFinite(value.start)&&start.value===localInput(value.start)?value.start:parseLocal(start.value);out.end=Number.isFinite(value.end)&&end.value===localInput(value.end)?value.end:parseLocal(end.value);if(out.start===value.start&&out.end===value.end)out.timezone=value.timezone||zone();if(out.end<=out.start)throw Error('The end time must follow the start time.')}
  }return out;
 }
 function status(){if(!live())return;const r=store.view(id);if(r?.version)version=r.version;remove.hidden=!version;const p=r?.pending;saved.textContent=dirty?(kind==='notes'?'Saving on this device…':formKept?'Draft kept on this device':'Unsaved changes'):p?(r.state==='conflict'?'Needs review':r.state==='failed'?'Kept on this device · retry needed':navigator.onLine===false?'Kept on this device':'Saving…'):dirty?(kind==='notes'?'Saving…':'Unsaved changes'):version?'Saved to your account':'Not saved yet';
  recovery.hidden=!p||!['failed','conflict'].includes(r.state);retry.hidden=r?.state==='conflict';review.hidden=r?.state!=='conflict';if(p&&r.error)message.textContent=r.error;
 }
 async function save(){if(!live()||!dirty)return;clearTimeout(timer);if(!title.value.trim()||!form.checkValidity()){if(kind!=='notes')form.reportValidity();throw Error('Check the required fields before saving.')}const payload=read(),epoch=editEpoch;await store.save(id,payload,{version});if(kind!=='notes'){if(epoch===editEpoch)await store.dropForm(id);else await keepForm()}if(live()){dirty=epoch!==editEpoch;lastSaved=JSON.stringify(payload);message.textContent='';onSaved();status();if(kind!=='notes'&&!dirty)setEditing(false)}}
 async function keepForm(){const epoch=editEpoch,raw={...value,title:title.value,links:structuredClone(links),...(kind==='people'?{email:email.value,phone:phone.value,organisation:organisation.value,details:text.value}:{description:description.value,allDay:allDay.checked,startLocal:start.value,endLocal:end.value,firstDay:startDate.value,lastDay:endDate.value})};await store.keepForm(id,raw,version);if(live()&&epoch===editEpoch){formKept=true;status()}}
 function changed(){formKept=false;editEpoch++;dirty=true;message.textContent='';status();F.workspace?.changed();if(kind==='notes'){clearTimeout(timer);timer=setTimeout(()=>{writing=writing.catch(()=>{}).then(save);writing.catch(e=>{if(live())message.textContent=e.message})},250)}else{clearTimeout(timer);timer=setTimeout(()=>{writing=writing.catch(()=>{}).then(keepForm);writing.catch(e=>{if(live())message.textContent=e.message})},250)}}
 form.addEventListener('input',e=>{if(!e.target.closest('.org-checklist'))changed()});form.addEventListener('change',e=>{if(e.target===allDay)changed()});form.addEventListener('submit',e=>{e.preventDefault();safe(save)()});
 async function flush(){clearTimeout(timer);if(kind==='notes'&&dirty){writing=writing.catch(()=>{}).then(save);await writing.catch(e=>{if(live())message.textContent=e.message})}else{await writing.catch(()=>{});if(kind!=='notes'&&dirty)await keepForm()}}
 function close(){if(kind==='notes'){flush().then(()=>{if(!dirty)home()});return}if(!dirty)return home();const h=F.sheet.open({sheet:'organise-unsaved',title:'Keep editing?',body:el('p',{text:'This item has changes that have not been saved.'}),acts:[{label:'Keep editing',run:()=>h.now()},{label:'Keep draft & close',run:async()=>{h.setBusy(true);try{await flush();h.now();home()}catch(e){F.toast(e.message)}finally{h.setBusy(false)}}},{label:'Discard changes',destructive:true,run:async()=>{clearTimeout(timer);await store.dropForm(id);dirty=false;h.now();home()}}]})}
 const retry=button('Retry save',()=>store.retry(id)),review=button('Review account version',async()=>{let remote=null;try{remote=await store.remote(id)}catch(e){if(e.status!==404)throw e}if(!live())return;const h=F.sheet.open({sheet:'organise-conflict',title:'Review conflicting changes',body:el('div',{class:'org'},el('p',{text:store.view(id)?.unpersisted?'Your edits are still open in this tab. Save a copy to keep them.':'Your local work is kept. Choose which copy to continue with.'}),el('h3',{text:'On this device'}),el('pre',{class:'org-conflict',text:JSON.stringify(read(),null,2)}),el('h3',{text:'In your account'}),el('pre',{class:'org-conflict',text:remote?JSON.stringify(remote,null,2):'This item was deleted.'}),button('Save my work as a new copy',async()=>{await flush();const next=await store.copy(id);dirty=false;h.now();F.nav.go('/'+kind+'/#item='+next)}),button('Use account version',async()=>{await store.discard(id);h.now();dirty=false;home()}))});}),recovery=el('div',{class:'org-recovery',hidden:true},retry,review);
 const remove=button('Delete',()=>{const h=F.sheet.open({sheet:'organise-delete',title:'Delete this '+(kind==='notes'?'note':kind==='people'?'person':'event')+'?',body:el('p',{text:'Linked files and items in other apps will stay in place.'}),acts:[{label:'Cancel',run:()=>h.now()},{label:'Delete',destructive:true,run:async()=>{try{await flush();const r=store.view(id);if(r?.pending)throw Error('Finish or review the pending save before deleting.');if(version){await store.save(id,read(),{version,deleted:true})}dirty=false;h.now();home()}catch(e){F.toast(e.message)}}}]});});remove.hidden=!version;
 const saveButton=button('Save',save,true),editButton=kind==='calendar'?button('Edit event',()=>setEditing(true)):null,tools=el('div',{class:'org-toolbar org-editor-tools'},saved,editButton,kind==='notes'?null:saveButton);
 const share=button('Use in another app',async()=>{await flush();if(live())await F.workspace?.life?.share({app:kind,id})});
 const profile=el('section',{class:'org-profile'});
 let profileHandle;
 function renderLinks(refs){
  if(!refs.length)return;
  const linked=el('div',{class:'org-profile-links org-related'},el('h3',{text:'Linked items'}));
  for(const r of refs)linked.append(button(labels.get(r.app+':'+r.id)||r.app[0].toUpperCase()+r.app.slice(1),()=>r.app==='files'?F.workspace?.openReference(r):F.nav.go(pathOf(r))));
  profile.append(linked);
 }
 function renderContact(){
  const ref=links.find(r=>r.app==='chats');
  profileHandle=ref&&friendFor?.(ref.id)?.handle;
  renderPersonProfile(profile,F,{value:read(),handle:profileHandle,saveState:saved,edit:{label:'Edit contact',run:()=>setEditing(true)},
   chat:ref?()=>F.nav.go(pathOf(ref)):null});
  renderLinks(links.filter(r=>r!==ref));
 }
 function setEditing(edit){
  form.hidden=!edit;profile.hidden=edit;saveButton.hidden=!edit;
  if(editButton)editButton.hidden=edit;
  if(kind==='people'){
   tools.hidden=!edit;
   if(edit)tools.prepend(saved);else renderContact();
  }
  if(!edit){
   if(kind==='people')return;
   const v=read(),fields=el('div',{class:'org-contact-details'});
    const date=v.allDay?new Date(v.startDate+'T12:00:00'):new Date(v.start),end=v.allDay?new Date(addDays(v.endDate,-1)+'T12:00:00'):new Date(v.end);
    fields.append(...[el('div',{},el('small',{text:v.allDay?'Date':'Starts'}),el('span',{text:date.toLocaleDateString([],{weekday:'long',day:'numeric',month:'long',year:'numeric'})+(v.allDay?' · All day':' · '+date.toLocaleTimeString([],{hour:'numeric',minute:'2-digit'}))})),(!v.allDay||v.endDate>addDays(v.startDate,1))?el('div',{},el('small',{text:'Ends'}),el('span',{text:end.toLocaleDateString([],{day:'numeric',month:'long'})+(v.allDay?'':' · '+end.toLocaleTimeString([],{hour:'numeric',minute:'2-digit'}))})):null].filter(Boolean));
    if(v.description)fields.append(el('div',{},el('small',{text:'Details'}),el('span',{text:v.description})));
    profile.replaceChildren(el('span',{class:'org-empty-icon'},ui.icon('calendar')),el('h2',{text:v.title}),fields);
   renderLinks(links);
  }else{queueMicrotask(()=>{if(live()&&F.workspace?.active())title.focus({preventScroll:true})})}
 }
 const footer=el('div',{class:'org-toolbar org-editor-footer'},share,button('Save a copy to Files',()=>{if(!title.value.trim())throw Error('Add a title first.');return exportValue({...read(),id})}),remove);
 const extra=el('details',{class:kind==='people'?'org-extra org-people-extra':'org-extra'},el('summary',{text:kind==='notes'?'Linked items & actions':'More actions'}));
 if(kind==='notes'){const linksHead=linksBox.previousElementSibling;extra.append(linksHead,linksBox)}extra.append(footer);
 detail.replaceChildren(...[tools,profile,form,message,recovery,kind==='calendar'?button('Prepare invitation',()=>prepareInvitation({...read(),id})):null,extra].filter(Boolean));
 if(kind!=='notes')setEditing(!version||dirty);else profile.hidden=true;
 if(kind==='people'&&version){
  const related=el('section',{class:'org-related',hidden:true},el('h3',{text:'Related notes and events'}));
  detail.insertBefore(related,extra);
  const c=createSystemClient(F,{prefix:'/api/organise/'});
  Promise.all(['notes','calendar'].map(app=>c.request('list',{method:'POST',body:{kind:app,related:{app:'people',id},limit:12}}).then(r=>r.records))).then(groups=>{
   if(!live())return;
   const rows=groups.flat();related.hidden=!rows.length;
   for(const v of rows)related.append(button(v.title,()=>F.nav.go('/'+v.kind+'/#item='+v.id)));
  }).catch(()=>{if(live()){related.hidden=false;related.append(el('p',{class:'org-muted',text:'Related items couldn’t load.'}));}});
 }
status();queueMicrotask(()=>{if(live()&&F.workspace?.active()&&!form.hidden&&(!version||kind!=='notes')){title.focus({preventScroll:true});if(kind==='notes'&&title.value==='Untitled note')title.select()}});
 return{status,close,flush,dirty:()=>dirty,refreshFriend(){
  if(kind!=='people'||!live()||profile.hidden)return;
  const ref=links.find(r=>r.app==='chats');
  if(profileHandle!==(ref&&friendFor?.(ref.id)?.handle))renderContact();
 },destroy(){dead=true;mounted=false;clearTimeout(timer);detail.replaceChildren()}};
}
