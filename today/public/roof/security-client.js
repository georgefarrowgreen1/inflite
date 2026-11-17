// Security Module prompts belong to the captured account, never a global cache.
import {createSystemClient} from './system-client.js';
import {loadStyles} from './modules.js';
const LABELS={'files.content-search':['Search inside documents','Read your supported text documents to return matching excerpts.'],'calendar.subscription':['Read a calendar subscription','Contact the calendar provider using the subscription link you supplied.'],'files.transfer.chats':['Prepare a Chat attachment','Copy this chosen file into a conversation you review before sending.'],'files.transfer.mail':['Prepare a Mail attachment','Copy this chosen file into an unsent email draft.'],'files.transfer.fitness':['Prepare a Fitness import','Read this chosen file for the training or route import you review.']};
export async function approveSecurityAccess(F,key,target='',lease={}){
 const client=createSystemClient(F,{prefix:'/api/security/'}),live=()=>client.live()&&!lease.signal?.aborted&&(!lease.current||lease.current());
 if(!Object.hasOwn(LABELS,key)||!live())throw new DOMException('This account was released','AbortError');
 await loadStyles('/roof/security-module.css');if(!live())throw new DOMException('This account was released','AbortError');
 return new Promise((resolve,reject)=>{const ui=F.ui,el=ui.el,[title,copy]=LABELS[key];let settled=false,busy=false,h;
  const say=el('p',{class:'sm-status',role:'status'}),approve=ui.btn('Allow once',{primary:true,run:async()=>{if(busy||!live()||h.closed)return;busy=true;approve.disabled=true;say.textContent='Confirming access…';try{const r=await client.request('authorise',{method:'POST',body:{key,target},current:()=>live()&&!h.closed});if(!live()||h.closed)return;settled=true;h.now();resolve(r.token)}catch(e){if(live()&&!h.closed)say.textContent=e.message}finally{busy=false;if(live())approve.disabled=false}}}),cancel=ui.btn('Cancel',{run:()=>h.now()});
  function released(){if(!settled){settled=true;reject(new DOMException('This account was released','AbortError'))}h?.now()}
  h=F.sheet.open({sheet:'security-permission',title:'Security Module',body:el('div',{class:'security-module'},el('div',{class:'sm-emblem','aria-hidden':true},ui.icon('lock')),el('h2',{text:title}),el('p',{class:'sm-muted',text:copy}),el('p',{class:'sm-muted',text:'This approval expires in two minutes. Your saved permission stays “Ask each time”.'}),say,el('div',{class:'sm-buttons'},cancel,approve)),onClose(){F.signal.removeEventListener('abort',released);if(!settled){settled=true;reject(new DOMException('Access was not approved','AbortError'))}}});
  F.signal.addEventListener('abort',released,{once:true});
 });
}

export function approveFileTransfer(F,destination,item,lease={}){return createSecurityClient(F,{prefix:'/api/security/'}).request('file-transfer',{method:'POST',body:{destination,id:item.id,version:item.version},...lease})}

// Ordinary record stores never load this review layer. Connection workflows do.
export function createSecurityClient(F,options={}){
 const client=createSystemClient(F,options);
 async function request(action,spec={}){const body=spec.body===undefined?undefined:structuredClone(spec.body);try{return await client.request(action,{...spec,body})}catch(error){if(error.status!==403||!error.field?.startsWith('security:')||spec.reviewed)throw error;const key=error.field.slice(9);let target=key.startsWith('files.transfer.')?body?.id||'':'';if(key==='calendar.subscription')target=body?.url?[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(body.url)))].map(b=>b.toString(16).padStart(2,'0')).join(''):body?.id||'';const approval=await approveSecurityAccess(F,key,target,spec);return client.request(action,{...spec,body,approval})}}
 return {...client,request};
}
