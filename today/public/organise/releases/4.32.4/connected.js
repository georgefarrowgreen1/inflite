// Calendar-only work stays outside the first-open graph of Notes and People.
import {addDays,localDay,pathOf,when,zone} from './model.js';

async function readFeeds(client,range,{current,refresh,onRefresh}){
 const live=()=>client.live()&&current();
 const body={from:new Date(range[0]+'T00:00:00').getTime(),to:new Date(range[1]+'T00:00:00').getTime()};
 const result=await client.request('calendar-events',{method:'POST',body,current});
 if(!live())return[];
 if(refresh){
  const stale=(result.calendars||[]).filter(c=>c.provider!=='Imported calendar'&&Date.now()-c.syncedAt>15*60000);
  if(stale.length)Promise.allSettled(stale.map(({id,version})=>client.request('calendar-refresh',{method:'POST',body:{id,version},current}))).then(()=>{if(live())onRefresh()});
 }
 return result.events||[];
}

function openEvent(F,v,{create}){const ui=F.ui,el=ui.el;let h;const button=(text,fn)=>ui.btn(text,{run:()=>Promise.resolve(fn()).catch(e=>{if(!F.signal.aborted)F.toast(e.message)})});const body=el('div',{class:'org'},el('p',{class:'org-muted',text:v.calendarName+' · Read only'}),el('h2',{text:v.title}),el('p',{text:when(v)}),v.description?el('p',{class:'org-event-description',text:v.description}):null,el('p',{class:'org-muted',text:'Changes stay in your original calendar. Last synced '+new Date(v.syncedAt).toLocaleString()}),button('Make an editable copy',async()=>{const {title,description,allDay,timezone,start,end,startDate,endDate}=v;h.now();await create({title,description,allDay,timezone,links:[],...(allDay?{startDate,endDate}:{start,end})})}),button('Manage calendars',()=>{h.now();F.workspace?.life?.calendars()}));h=F.sheet.open({sheet:'external-event',title:'Calendar event',body});return h}

// These are dated source references, never duplicate events. No body scraping or
// decrypted message data. Undated rides stay undated until explicitly scheduled.
export function linkedEvents(answer,reminders=[],now=Date.now()){
 const out=reminders.filter(a=>a.status==='open'&&Number.isFinite(a.dueAt)).map(a=>({id:'reminder:'+a.id,title:a.title,start:a.dueAt,end:a.dueAt+1,source:{app:'reminders',id:a.id},label:'Reminder'}));
 if(!answer||!Number.isFinite(answer.at)||Math.abs(now-answer.at)>30*60000)return out;
 const c=answer.cards||{},f=c.fitness,d=c.markets?.dividend;
 if(f?.kind==='session'&&/^\d{4}-\d{2}-\d{2}$/.test(f.day||''))out.push({id:'fitness:'+f.day,title:f.session?.name||'Planned ride',allDay:true,startDate:f.day,endDate:addDays(f.day,1),source:{app:'fitness',id:f.day},label:'Fitness · time not set',ride:true});
 if(Number.isFinite(d?.at))out.push({id:'income:'+d.at,title:d.name?'Income · '+d.name:'Expected income',allDay:true,startDate:localDay(d.at),endDate:addDays(localDay(d.at),1),source:{app:'markets'},label:'Markets · estimated date'});
 for(const p of c.chat?.inbound||[])if(Number.isFinite(p.landsAt))out.push({id:'letter:'+p.who?.id+':'+p.landsAt,title:p.mystery?'A letter arrives':'Letter from '+(p.who?.name||'a friend'),start:p.landsAt,end:p.landsAt+1,source:{app:'chats',...(!p.mystery&&/^[\w-]{1,40}$/.test(p.who?.id||'')?{id:p.who.id}:{})},label:'Chats · expected arrival'});
 for(const b of c.mail?.ahead||[])if(Number.isFinite(b.start))out.push({id:'booking:'+b.id,title:b.title,start:b.start,end:Number.isFinite(b.end)&&b.end>b.start?b.end:b.start+1,source:{app:'mail',...(/^[\w-]{1,40}$/.test(b.thread||'')?{id:b.thread}:{})},label:'Mail · confirmed booking'});
 for(const p of c.markets?.payouts||[])if(/^\d{4}-\d{2}-\d{2}$/.test(p.date||''))out.push({id:'interest:'+p.id,title:'Interest · '+p.name,allDay:true,startDate:p.date,endDate:addDays(p.date,1),source:{app:'markets'},label:'Markets · scheduled payout'});
 return out;
}

async function readReminders(client,current){
 const rows=[];
 let cursor=null;
 for(let page=0;page<5;page++){
  const result=await client.request('actions',{query:{status:'open',cursor},current});
  rows.push(...(result.actions||[]));
  cursor=result.cursor;
  if(!cursor)break;
 }
 return rows;
}

export async function calendarSources(F,range,{current,refresh,onRefresh}){
 const {createSystemClient}=await import('/roof/system-client.js');
 if(!current())return[];
 const [feeds,reminders]=await Promise.all([
  readFeeds(createSystemClient(F,{prefix:'/api/organise/'}),range,{current,refresh,onRefresh}).catch(()=>[]),
  readReminders(createSystemClient(F),current).catch(()=>[]),
 ]);
 return current()?linkedEvents(F.workspace?.today?.(),reminders).concat(feeds):[];
}

export function openCalendarSource(F,event,{create}){
 if(event.readOnly)return openEvent(F,event,{create});
 if(!event.ride){
  F.nav.go(event.source.app==='reminders'?'/#you=action-'+event.source.id:pathOf(event.source));
  return;
 }
 const {el,btn}=F.ui;
 const body=el('div',{class:'org'},el('h3',{text:event.title}),el('p',{text:'This ride has no confirmed start time. Review Fitness and Weather, or choose a time to create a linked calendar event.'}));
 let sheet;
 body.append(btn('Open Fitness',{run:()=>{sheet.now();F.nav.go(pathOf(event.source))}}),
  btn('Open forecast',{run:()=>{sheet.now();F.nav.go('/weather/')}}),
  btn('Choose event time',{primary:true,run:async()=>{
   sheet.now();
   try{
    await create({title:event.title,description:'',allDay:false,start:new Date(event.startDate+'T09:00:00').getTime(),end:new Date(event.startDate+'T10:00:00').getTime(),timezone:zone(),links:[event.source]});
   }catch(error){if(!F.signal.aborted)F.toast(error.message)}
  }}));
 sheet=F.sheet.open({sheet:'calendar-ride',title:'Plan this ride',body});
}
