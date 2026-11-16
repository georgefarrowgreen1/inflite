import {deviceId,deviceLabel} from './device-id.js';
import {resumeTarget,RESUME_PREFIX} from './restore.js';
export function openDevices(F,client){
 const ui=F.ui,el=ui.el,currentId=deviceId(client.owner),body=el('div',{class:'system350'});let h,generation=0;
 const current=()=>client.live()&&!h.closed;
 const changed=()=>window.dispatchEvent(new CustomEvent('inflite:devices-changed',{detail:{owner:client.owner}}));
 async function read(){const mine=++generation;body.replaceChildren(el('p',{role:'status',text:'Loading remembered devices…'}));
  try{const result=await client.request('devices',{current:()=>current()&&mine===generation});if(!current()||mine!==generation)return;body.replaceChildren(el('p',{class:'s350-muted',text:'Manage screen continuation and encrypted draft copies. Account sign-ins are managed in Account security.'}));
   if(currentId&&!result.devices.some(d=>d.id===currentId))body.append(ui.btn('Remember this device',{primary:true,run:async()=>{if(!current())return;try{let target={path:'/'};try{const saved=JSON.parse(localStorage.getItem(RESUME_PREFIX+client.owner));target=resumeTarget(saved?.target)||target}catch(_){}await client.request('device-remember',{method:'POST',body:{id:currentId,label:deviceLabel(),target},current});if(!current())return;localStorage.removeItem('ifl:device-paused:'+client.owner);changed();read()}catch(e){if(current())F.toast(e.message)}}}));
   for(const device of result.devices){const row=el('section',{class:'s350-device'},el('div',{},el('strong',{text:device.label+(device.id===currentId?' · this device':'')}),el('small',{text:'Last used '+new Date(device.updatedAt).toLocaleString()})),ui.btn('Forget',{small:true,run:()=>{
    let confirm;confirm=F.sheet.open({title:'Forget '+device.label+'?',body:el('p',{text:'Remove its remembered screen and encrypted draft copies. Its account sign-in stays active.'}),acts:[{label:'Forget device',destructive:true,run:async()=>{if(!current()||confirm.closed)return;confirm.setBusy(true);try{await client.request('device',{method:'DELETE',query:{id:device.id,version:device.revision},current:()=>current()&&!confirm.closed});if(!current())return;if(device.id===currentId)localStorage.setItem('ifl:device-paused:'+client.owner,'1');confirm.now();changed();read()}catch(e){if(current()&&!confirm.closed){confirm.setBusy(false);F.toast(e.message)}}}}]});
   }}));body.append(row)}
   if(!result.devices.length)body.append(el('p',{text:'No remembered devices.'}));body.append(ui.btn('Account security',{run:()=>{h.now();F.nav.go('/#you=account')}}));
  }catch(e){if(current()&&mine===generation)body.replaceChildren(el('p',{role:'status',text:e.message}),ui.btn('Retry',{run:read}))}
 }
 h=F.sheet.open({sheet:'remembered-devices',title:'Remembered devices',body,onClose:()=>generation++});read();return h;
}
