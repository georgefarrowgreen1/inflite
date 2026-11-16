// Background screen continuation. Explicit links and the active screen always
// win; another device is opened only through the person's Continue action.
import {deviceId,deviceLabel} from './device-id.js';
import {resumeTarget,RESUME_PREFIX} from './restore.js';
export function connectContinuity(F,{owner,root}={}){
 const live=()=>!F.signal.aborted&&F.session.view?.user?.id===owner;
 const id=deviceId(owner);if(!id)return;
 const paused=()=>{try{return localStorage.getItem('ifl:device-paused:'+owner)==='1'}catch(_){return true}};
 let revision=0,loaded=false,running=false,timer=0,last='',devices=[],lastRead=0;
 const panel=F.ui.el('section',{class:'continuation-card',hidden:true,'aria-label':'Continue on this device'});root.prepend(panel);
 const label=deviceLabel();
 async function request(method,body){
  const response=await fetch('/api/files/continuity',{method,credentials:'same-origin',mode:'same-origin',cache:'no-store',redirect:'error',signal:AbortSignal.any([F.signal,AbortSignal.timeout(12000)]),headers:{'X-Inflite-Files-Owner':owner,...(body?{'X-Inflite':'1','Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
  const text=await response.text();if(!live()||text.length>16000)throw Error('Continuation unavailable');let value=JSON.parse(text);if(!response.ok){const error=Error(value.error||'Continuation unavailable');error.status=response.status;throw error}return value;
 }
 function paint(){
  if(!live())return;panel.replaceChildren();
  const other=devices.filter(d=>d.id!==id&&resumeTarget(d.target)&&Date.now()-d.updatedAt<30*864e5).filter(d=>{const app=d.target.path.split('/')[1];return !app||app.startsWith('#')||F.session.apps?.[app]===true}).slice(0,3);
  panel.hidden=!other.length;if(!other.length)return;
  panel.append(F.ui.el('h2',{text:'Continue from another device'}));
  for(const d of other){const app=d.target.path.split('/')[1],name=({fitness:'Fitness',weather:'Weather',markets:'Markets',chats:'Chats',mail:'Mail'})[app]||(d.target.path.includes('#files')?'Files':'Today');panel.append(F.ui.el('button',{type:'button',class:'continuation-row',on:{click:()=>{if(live())F.nav.go(d.target.path,{state:d.target.files?{files:{userId:owner,location:d.target.files}}:undefined})}}},F.ui.el('span',{},F.ui.el('strong',{text:name}),F.ui.el('small',{text:d.label+' · '+new Date(d.updatedAt).toLocaleString()})),F.ui.el('span',{'aria-hidden':'true',text:'›'})))}
 }
 async function read(){if(!live()||running)return;running=true;try{const result=await request('GET');devices=Array.isArray(result.devices)?result.devices.slice(0,12):[];revision=devices.find(d=>d.id===id)?.revision||0;loaded=true;lastRead=Date.now();paint()}catch(_){}finally{running=false}}
 async function write(){
  if(!live()||!loaded||running||paused()||navigator.onLine===false)return;let record;try{const raw=localStorage.getItem(RESUME_PREFIX+owner);if(!raw||raw.length>1500)return;record=JSON.parse(raw);if(record.owner!==owner)return}catch(_){return}
  const target=resumeTarget(record.target);if(!target)return;const text=JSON.stringify(target);if(text===last)return;running=true;
  try{const result=await request('PUT',{id,revision,label,target});revision=result.revision;last=text}catch(error){if(error.status===410){try{localStorage.setItem('ifl:device-paused:'+owner,'1')}catch(_){}}else if(error.status===409&&live()){loaded=false;setTimeout(()=>{if(live())read().then(schedule)},1000)}}finally{running=false}
 }
 function schedule(){clearTimeout(timer);timer=setTimeout(()=>{if(!loaded)read().then(write);else write()},1500)}
 window.addEventListener('inflite:devices-changed',e=>{if(live()&&e.detail?.owner===owner){last='';loaded=false;read().then(schedule)}},{signal:F.signal});
 const off=F.on('route',schedule);
 const visible=()=>{if(document.visibilityState==='visible'&&Date.now()-lastRead>60000)read().then(schedule)};
 document.addEventListener('visibilitychange',visible,{signal:F.signal});window.addEventListener('online',()=>read().then(schedule),{signal:F.signal});
 F.signal.addEventListener('abort',()=>{clearTimeout(timer);off();panel.remove()},{once:true});read().then(schedule);
}
