import {createSystemClient} from '/roof/system-client.js';
import {localDay,addDays,eventDay,when} from './model.js';

const midnight=date=>Date.parse(date+'T00:00:00');
const ends=event=>event.allDay?midnight(event.endDate):event.end;
// Match the native list's order before merging its bounded page with feeds.
const sortStart=event=>event.allDay?Date.parse(event.startDate):event.start;

// A small, lazy Today summary. Its private read never blocks shell startup.
export function connectToday(F,root,{onUpcoming}={}){
 const client=createSystemClient(F,{prefix:'/api/organise/'}),ui=F.ui,panel=ui.el('section',{class:'ifl-card org-today','aria-label':'Your calendar'});let last=0,running=false,dead=false;
 const live=()=>!dead&&client.live();
 async function refresh(force=false){if(!live()||running||!force&&Date.now()-last<30000)return;running=true;
  try{
   const now=Date.now(),fromDate=localDay(now),toDate=addDays(fromDate,7),to=midnight(toDate);
   // Feeds filter all-day dates at UTC midnight, so include both date boundaries
   // in the request and apply the local range to the merged results.
   const [native,feeds]=await Promise.all([
    client.request('list',{method:'POST',body:{kind:'calendar',fromDate,toDate,from:now,to,limit:3}}),
    client.request('calendar-events',{method:'POST',body:{from:Math.min(now,Date.parse(fromDate)),to:Math.max(to,Date.parse(toDate))}}).catch(()=>({events:[]})),
   ]);
   if(!live())return;
   last=Date.now();
   const records=[...(native.records||[]),...(feeds.events||[])]
    .filter(v=>ends(v)>now&&(v.allDay?v.startDate<toDate:v.start<to))
    .sort((x,y)=>sortStart(x)-sortStart(y));
   const subtitle=v=>new Date(eventDay(v)+'T12:00:00').toLocaleDateString([],{weekday:'short',day:'numeric',month:'short'})+' · '+when(v);
   const next=records.find(v=>!v.readOnly&&/^[a-f0-9]{32}$/.test(v.id));
   onUpcoming?.(next?{id:next.id,title:next.title,detail:subtitle(next),ends:ends(next)}:null);
   if(!records.length){panel.remove();return}
   panel.replaceChildren(ui.el('div',{class:'org-today-head'},ui.icon(null,{app:'calendar',size:32}),ui.el('h2',{text:'Coming up'}),ui.btn('Calendar',{small:true,run:()=>F.nav.go('/calendar/')})));
   for(const v of records.slice(0,3))panel.append(ui.row({title:v.title,sub:subtitle(v),href:v.readOnly?'/calendar/#date='+eventDay(v):'/calendar/#item='+v.id,trail:'chevron'}));if(!panel.isConnected)root.append(panel);
  }catch(_){/* Existing day stays stable during a transient private read failure. */}finally{running=false}
 }
 const off=F.on('route',r=>{if(r?.tab==='today')refresh()}),offVisible=F.on('visible',()=>{if(F.route?.tab==='today')refresh()});
 const changed=e=>{if(e.detail?.owner===client.owner)refresh(true)};window.addEventListener('inflite:organise-change',changed,{signal:F.signal});
 F.signal.addEventListener('abort',()=>{dead=true;panel.remove();off?.();offVisible?.()},{once:true});refresh();
 return{refresh};
}
