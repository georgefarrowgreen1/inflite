// One account-lived service connects explicit actions, Today and app discovery.
// Native modules keep ownership of content, unlock and send/confirm flows.
import {createSystemClient} from './system-client.js';
import {createActionsStore} from './actions-store.js';
import {loadStyles} from './modules.js';
import {deviceId} from './device-id.js';
export async function createSystem350(F,options){
 const client=createSystemClient(F),live=client.live,ui=F.ui,el=ui.el;
 await loadStyles('/roof/system350.css');if(!live())return null;
 let actionsUI=null,uiLoad=null,readError='',refreshing=false,focusLoaded=false,dismissed=new Set(),gone=false;
 const root=options.today,panel=el('section',{class:'system350 s350-today','aria-label':'For your day',hidden:true});
 async function views(){if(actionsUI)return actionsUI;uiLoad||=import('./actions-ui.js').then(m=>live()?actionsUI=m.createActionsUI(F,{store,files:options.files,client,openSource:options.openSource}):null);return uiLoad}
 const store=await createActionsStore(F,client,{activity:options.activity,onReview:id=>views().then(v=>live()&&v?.queue(id)),onSaved:(intent,action)=>{if(!live())return;const done=intent.body.status==='done',deleted=intent.body.status==='deleted';F.toast(done?'Reminder completed':deleted?'Reminder deleted':'Reminder saved',{action:done||deleted?{label:'Undo',run:()=>{if(live())store.update(action,{status:'open'}).catch(e=>{if(live())F.toast(e.message)})}}:null})}});if(!live()||!store){panel.remove();return null}
 const openList=()=>views().then(v=>live()&&v?.list()),openTask=id=>views().then(v=>live()&&v?.detail(id)),capture=(source=null,{current=live}={})=>views().then(v=>live()&&current()&&v?.form(null,{source}));
 async function devices(){const m=await import('./devices-ui.js');return live()?m.openDevices(F,client):null}
 function recommendations(){
  const answer=options.day?.(),cards=answer?.cards||{},out=[],now=Date.now(),fresh=Number.isFinite(answer?.at)&&Math.abs(now-answer.at)<30*60000;
  if(!fresh)return out;
  const fitness=cards.fitness,best=fitness?.best,day=fitness?.day||new Date().toISOString().slice(0,10);
  if(fitness?.kind==='session'&&best?.said){const id='ride:'+day;out.push({id,title:best.poor?'Review your ride conditions':'A weather window for your ride',why:[best.said,best.sub].filter(Boolean).join(' · '),label:'Review ride',run:()=>import('./ride-overview.js').then(m=>live()&&m.openRideOverview(F,cards))})}
  const dividend=cards.markets?.dividend;if(Number.isFinite(dividend?.at)&&dividend.at>=now-864e5&&dividend.at<=now+7*864e5)out.push({id:'income:'+new Date(dividend.at).toISOString().slice(0,10),title:'Income coming up',why:dividend.name+' · expected around '+new Date(dividend.at).toLocaleDateString(),label:'Review in Markets',run:()=>options.openSource({app:'markets'})});
  const mail=options.snapshots?.().get('mail');if(mail?.status==='ready'&&(mail.availability?.draft||mail.drafts>0))out.push({id:'draft:mail',title:'Finish your draft in Mail',why:'Mail has unfinished work ready for review.',label:'Open Mail',run:()=>options.openSource({app:'mail',id:mail.draftId||null})});
  return out.filter(x=>!dismissed.has(x.id)).slice(0,2);
 }
 function paint(){
  if(!live()||gone)return;const focused=panel.contains(document.activeElement)?document.activeElement?.dataset?.s350Focus:null;
  const values=store.snapshot().filter(a=>a.status==='open'&&(a.dueAt==null||a.dueAt<Date.now()+2*864e5)).sort((a,b)=>(a.dueAt??Infinity)-(b.dueAt??Infinity)||b.createdAt-a.createdAt),queued=store.queued();
  if(!values.length&&!queued.length&&!recommendations().length){panel.remove();return}panel.hidden=false;if(panel.parentNode!==root)root.prepend(panel);
  const header=el('div',{class:'s350-toolbar'},el('h2',{text:'For your day'}),ui.btn('New reminder',{small:true,run:()=>capture()}));panel.replaceChildren(header);
  if(readError)panel.append(el('div',{class:'s350-inline-status',role:'status'},el('span',{text:readError}),ui.btn('Retry',{small:true,run:refresh})));
  if(queued.length)panel.append(ui.btn(queued.length+' changes kept on this device',{small:true,run:()=>views().then(v=>live()&&v?.queue())}));
  if(actionsUI){for(const a of values.slice(0,3)){const row=actionsUI.row(a);row.querySelector('.s350-row-main').dataset.s350Focus=a.id+':open';row.querySelector('.ifl-icon-btn')?.setAttribute('data-s350-focus',a.id+':complete');panel.append(row)}}else if(values.length)views().then(()=>paint());
  const remaining=Math.max(0,3-Math.min(values.length,3));for(const item of recommendations().slice(0,remaining)){const card=el('article',{class:'s350-suggestion'},el('div',{},el('strong',{text:item.title}),el('p',{text:item.why})),el('div',{class:'s350-toolbar'},ui.btn(item.label,{small:true,run:item.run}),ui.iconBtn('x',{label:'Dismiss '+item.title,run:async()=>{try{await client.request('focus-dismiss',{method:'POST',body:{id:item.id}});if(live()){dismissed.add(item.id);paint()}}catch(e){if(live())F.toast(e.message)}}})));panel.append(card)}
  if(!values.length&&!recommendations().length&&!readError)panel.append(el('p',{class:'s350-muted',text:'Keep a reminder here, or make one from Mail, Chats, Fitness or Files.'}));
  panel.append(ui.btn('All reminders',{small:true,run:openList}));
  if(focused)panel.querySelector('[data-s350-focus="'+CSS.escape(focused)+'"]')?.focus({preventScroll:true});
 }
 async function refresh(){if(!live()||refreshing)return;refreshing=true;try{await store.load({view:'today'});if(!live())return;readError='';if(!focusLoaded){try{const r=await client.request('focus');if(live()){dismissed=new Set(r.dismissed||[]);focusLoaded=true}}catch(_){}}}catch(e){if(live())readError=navigator.onLine===false?'Reminders are kept on this device. Connect to refresh.':'Reminders could not refresh.'}finally{refreshing=false;paint()}}
 const timer=setInterval(()=>{if(live()&&document.visibilityState==='visible'&&F.route?.tab==='today')refresh()},60000);timer.unref?.();
 let lastRead=Date.now();const offStore=store.subscribe(paint),offVisible=F.on('visible',()=>{if(Date.now()-lastRead>30000){lastRead=Date.now();refresh()}});
 const route=r=>{if(!live()||r?.kind!=='tab'||r.tab!=='you')return;if(r.arg==='reminders')openList();else if(r.arg==='remembered')devices();else if(/^action-[\w-]{32}$/.test(r.arg||''))openTask(r.arg.slice(7))};const offRoute=F.on('route',route);
 const searchProvider={id:'reminders350',group:'Reminders',order:12,search:async(q,lease={})=>{
  const text=q.trim();if(text.length<2||!live())return [];
  const entries=[...(/remind|task|todo/i.test(text)?[{title:'New reminder',sub:'Create a linked action',run:()=>live()&&capture()}]:[]),...(/device|privacy|remember/i.test(text)?[{title:'Remembered devices',sub:'Continuation and encrypted draft copies',run:()=>live()&&devices()}]:[])];
  try{const found=await store.search(text,lease);if(live())entries.push(...found.slice(0,8).map(a=>({title:a.title,sub:a.status==='done'?'Completed reminder':'Reminder',icon:'today',run:()=>live()&&openTask(a.id)})))}catch(_){if(live())entries.push({title:'Open reminders',sub:'Connect to search all saved reminders',run:openList})}return entries;
 }};
 const offTask=F.systemTasks?.register?.(store,{signal:F.signal})||(()=>{});F.signal.addEventListener('abort',()=>{gone=true;clearInterval(timer);offStore();offVisible();offRoute();offTask();panel.remove()},{once:true});
 paint();refresh();route(F.route);return {search:(q,lease)=>searchProvider.search(q,lease),capture,openList,openTask,devices,refresh,update:paint,store,client,device:()=>deviceId(client.owner)};
}
