import {createSystemClient} from '/roof/system-client.js';
import {localDay,addDays,when} from './model.js';
// A small, lazy Today summary. Its private read never blocks shell startup.
export function connectToday(F,root){
 const client=createSystemClient(F,{prefix:'/api/organise/'}),ui=F.ui,panel=ui.el('section',{class:'ifl-card org-today','aria-label':'Your calendar'});let last=0,running=false,dead=false;
 const live=()=>!dead&&client.live();
 async function refresh(force=false){if(!live()||running||!force&&Date.now()-last<30000)return;running=true;
  try{const a=localDay(),b=addDays(a,7),r=await client.request('list',{method:'POST',body:{kind:'calendar',fromDate:a,toDate:b,from:new Date(a+'T00:00:00').getTime(),to:new Date(b+'T00:00:00').getTime(),limit:3}});if(!live())return;last=Date.now();if(!r.records.length){panel.remove();return}r.records.sort((a,b)=>(a.start||Date.parse(a.startDate))-(b.start||Date.parse(b.startDate)));panel.replaceChildren(ui.el('div',{class:'org-today-head'},ui.icon(null,{app:'calendar',size:32}),ui.el('h2',{text:'Coming up'}),ui.btn('Calendar',{small:true,run:()=>F.nav.go('/calendar/')})));
   for(const v of r.records)panel.append(ui.row({title:v.title,sub:new Date((v.startDate||localDay(v.start))+'T12:00:00').toLocaleDateString([],{weekday:'short',day:'numeric',month:'short'})+' · '+when(v),href:'/calendar/#item='+v.id,trail:'chevron'}));if(!panel.isConnected)root.append(panel);
  }catch(_){/* Existing day stays stable during a transient private read failure. */}finally{running=false}
 }
 const off=F.on('route',r=>{if(r?.tab==='today')refresh()}),offVisible=F.on('visible',()=>{if(F.route?.tab==='today')refresh()});
 const changed=e=>{if(e.detail?.owner===client.owner)refresh(true)};window.addEventListener('inflite:organise-change',changed,{signal:F.signal});
 F.signal.addEventListener('abort',()=>{dead=true;panel.remove();off?.();offVisible?.()},{once:true});refresh();
 return{refresh};
}
