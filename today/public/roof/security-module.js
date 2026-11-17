import {createSystemClient} from './system-client.js';
import {loadStyles} from './modules.js';
const MODES={allow:'Allowed',ask:'Ask each time',block:'Blocked'};
const EVENTS={'permission-changed':'App permission changed','permission-once':'Temporary app access approved','file-transfer':'File access approved for another app','content-search':'Document contents searched','calendar-access':'Calendar connection used','sessions-revoked':'Sessions signed out','signout-others':'Other sessions signed out','signout-device':'A device signed out','signin':'Signed in','export':'Account data exported','password':'Password changed','email-confirmed':'Email verified','passkey-add':'Passkey added','passkey-remove':'Passkey removed','password-checked':'Password breach check completed','signup':'Account created','reset':'Password reset'};
const time=t=>new Date(t).toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'});
const date=t=>new Date(t).toLocaleDateString(undefined,{day:'numeric',month:'short',year:'numeric'});
const short=t=>new Date(t).toLocaleString(undefined,{day:'numeric',month:'short',hour:'numeric',minute:'2-digit'});
export async function createSecurityModule(F,options={}){
 const client=createSystemClient(F,{prefix:'/api/security/'}),live=client.live,ui=F.ui,el=ui.el;await loadStyles('/roof/security-module.css');if(!live())return null;let opened=null;
 const btn=(label,run,extra={})=>ui.btn(label,{...extra,run:()=>Promise.resolve().then(run).catch(e=>{if(live()&&e.name!=='AbortError')F.toast(e.message)})});
 const card=(title,...children)=>el('section',{class:'sm-card'},el('h3',{text:title}),...children);
 const note=text=>el('p',{class:'sm-muted',text});
 const link=(label,path)=>btn(label,()=>F.nav.go(path));
 const setting=(title,icon,action)=>ui.row({lead:{icon},title,trail:'chevron',...(typeof action==='string'?{href:action}:{run:()=>Promise.resolve().then(action).catch(e=>{if(live())F.toast(e.message)})})});
 function row(title,copy,action,icon='lock'){return el('div',{class:'sm-row'},el('span',{class:'sm-icon','aria-hidden':true},ui.icon(icon)),el('div',{class:'sm-copy'},el('strong',{text:title}),el('small',{text:copy})),action)}
 function reauth(body,say){say.textContent='Confirm it’s you in Account, then return here and retry. Your current choices have not been applied.';if(!body.querySelector('[data-sm-reauth]')){const a=link('Confirm identity in Account','/#settings=account-confirm');a.dataset.smReauth='';body.append(a)}}
 function confirm({title,copy,action,target,commit}){if(!live())return;let h,busy=false;const say=el('p',{class:'sm-status',role:'status'}),body=el('div',{class:'security-module'},el('h2',{text:title}),note(copy),say);const save=btn('Confirm',async()=>{if(busy||!live()||h.closed)return;busy=true;save.disabled=true;h.setBusy(true);try{const proof=await client.request('confirmation',{method:'POST',body:{action,target},current:()=>!h.closed});if(!live()||h.closed)return;await commit(proof.token,()=>!h.closed);if(live()&&!h.closed)h.now()}catch(e){if(live()&&!h.closed){h.setBusy(false);if(e.field==='reauth')reauth(body,say);else say.textContent=e.message}}finally{busy=false;if(live())save.disabled=false}},{primary:true});body.append(el('div',{class:'sm-buttons'},btn('Cancel',()=>h.now()),save));h=F.sheet.open({sheet:'security-confirmation',title:'Security Module',body});return h;}
 function permission(p,refresh){let h,busy=false;const say=el('p',{class:'sm-status',role:'status'}),body=el('div',{class:'security-module'},el('h2',{text:p.title}),note(p.detail),note(p.inherited?'This connection is allowed by default. Choose a setting below.':'Change how this built-in connection uses your data.'),say);
  async function save(mode,ticket,current=()=>!h.closed){if(!live()||!current())return;await client.request('permission',{method:'PUT',body:{key:p.key,mode,version:p.version,...(ticket?{ticket}:{})},current});if(!live()||!current())return;await refresh();if(!live()||!current())return;h.now();requestAnimationFrame(()=>{if(live()&&opened&&!opened.closed&&F.sheet.top()?.el===opened.el)[...opened.el.querySelectorAll('[data-permission]')].find(n=>n.dataset.permission===p.key)?.querySelector('button')?.focus({preventScroll:true})});F.toast('Permission updated')}
  for(const mode of ['ask','allow','block']){const choice=btn(MODES[mode]+(p.mode===mode?' · current':''),async()=>{if(busy||!live()||h.closed)return;if(mode===p.mode)return;if(mode==='allow')return confirm({title:'Allow '+p.title.toLowerCase()+'?',copy:'This connection can run when you use it without another Security Module prompt. You can revoke access here.',action:'permissions-allow',target:p.key+':'+p.version,commit:(token,current)=>save(mode,token,()=>current()&&!h.closed)});busy=true;try{await save(mode)}catch(e){if(live()&&!h.closed)say.textContent=e.message}finally{busy=false}},{label:MODES[mode]+(p.mode===mode?' · current':'')});choice.classList.add('sm-choice');choice.setAttribute('aria-pressed',String(p.mode===mode));choice.replaceChildren(el('span',{class:'sm-icon','aria-hidden':true},ui.icon(p.mode===mode?'check':mode==='block'?'lock':'info')),el('span',{class:'sm-copy'},el('strong',{text:MODES[mode]}),el('small',{text:{ask:'Review each use. Approvals last two minutes.',allow:'Run this connection without another prompt.',block:'Stop this connection until you change it.'}[mode]})));body.append(choice)}
  h=F.sheet.open({sheet:'security-edit-permission',title:'App access',body});return h;
 }
 function open({app=null}={}){
  if(!live())return;if(opened&&!opened.closed)return opened;
  let h,view='overview',summary=null,epoch=0,motion=null;
  const positions={overview:0,access:0,activity:0},body=el('div',{class:'security-module sm-main'}),content=el('div',{class:'sm-content',role:'region','aria-label':'Security overview'}),say=el('p',{class:'sm-status',role:'status'}),stamp=el('span',{class:'sm-updated'});
  const refreshButton=btn('Refresh',refresh,{label:'Refresh security information'});
  const tabs=ui.seg([['overview','Overview'],['access','App access'],['activity','Activity']],view,v=>{positions[view]=content.scrollTop;view=v;paint(true);content.scrollTop=positions[v]},{label:'Security Module section'});
  const current=()=>live()&&!h.closed;
  async function refresh(){
   if(!current())return;const mine=++epoch;refreshButton.disabled=true;content.setAttribute('aria-busy','true');say.textContent='Checking your account…';if(!summary)content.replaceChildren(ui.skeleton('rows',4));
   try{const r=await client.request('summary',{current:()=>current()&&mine===epoch});if(!current()||mine!==epoch)return;summary=r;stamp.textContent='Updated '+short(r.checkedAt);stamp.title=time(r.checkedAt);say.textContent='';paint()}
   catch(e){if(current()&&mine===epoch){summary=null;stamp.textContent='';content.replaceChildren(ui.error({title:'Security Module could not refresh',body:e.message,acts:[{label:'Retry',run:refresh,primary:true}]}));say.textContent='No current security status is available.'}}
   finally{if(current()&&mine===epoch){refreshButton.disabled=false;content.removeAttribute('aria-busy')}}
  }
  function paint(animate=false){
   if(!current()||!summary)return;const top=content.scrollTop;motion?.cancel();content.replaceChildren();content.setAttribute('aria-label',{overview:'Security overview',access:'App permissions',activity:'Security activity'}[view]);
   if(view==='overview'){
    const remaining=summary.checks.filter(c=>c.state!=='ready').length;
    content.append(el('div',{class:'sm-heading'},el('span',{class:'sm-emblem','aria-hidden':true},ui.icon('lock')),el('div',{},el('h2',{text:app?'Security for '+({chats:'Chats',files:'Files'}[app]||app[0].toUpperCase()+app.slice(1)):'Your account'}),note(remaining?remaining+' '+(remaining===1?'check needs':'checks need')+' your attention':'Your account checks are up to date'))));
    const checks=summary.checks.map(c=>{
     const ready=c.state==='ready',pw=summary.account.passwordCheck;
     const labels={email:[ready?'Email verified':'Verify your email',ready?'Recovery email confirmed':'Keep your recovery email verified','mail'],passkeys:[ready?'Passkey ready':'Add a passkey',ready?summary.account.passkeys+' '+(summary.account.passkeys===1?'passkey available':'passkeys available'):'Sign in with your face, fingerprint or device PIN','key'],stale:[ready?'Sessions up to date':'Review unused sessions',ready?'None inactive for 90 days':'Review devices you no longer use','device'],password:[ready?'Password check complete':c.state==='unknown'?'Check your password':'Password needs attention',pw?(pw.foundInBreach?'Exposure reported':'No exposure reported')+' · '+date(pw.checkedAt):'No breach check recorded','lock']};
     const [title,copy,icon]=labels[c.id]||[c.title,ready?'Up to date':'Needs your review','info'];
     const state=ready?el('span',{class:'sm-check-state','aria-label':'Up to date'},ui.icon('check')):link('Review','/#settings=account-security');
     const r=row(title,copy,state,icon);r.dataset.state=c.state;return r;
    });
    content.append(card('Account protection',...checks));
    const devices=card('Signed-in sessions');
    if(summary.sessionCount>summary.sessions.length)devices.append(note('Showing the '+summary.sessions.length+' most recent of '+summary.sessionCount+' sessions. Sign out other sessions includes those not shown.'));
    for(const s of summary.sessions)devices.append(row(s.label,[s.current?null:s.place,s.stale?'Inactive for 90 days':'Last active '+short(s.seenAt)].filter(Boolean).join(' · '),s.current?el('span',{class:'sm-state',text:'Current'}):btn('Sign out',()=>confirm({title:'Sign out this session?',copy:s.label+' will need to sign in again. Other sessions stay signed in. Downloaded copies remain on that device.',action:'sessions-revoke',target:s.id,commit:async(ticket,current)=>{await client.request('sessions/revoke',{method:'POST',body:{target:s.id,ticket},current});if(live()&&current())await refresh()}}),{small:true,destructive:true}),'device'));
    if(summary.sessions.some(s=>!s.current))devices.append(btn('Sign out other sessions',()=>confirm({title:'Sign out all other sessions?',copy:'This session stays signed in. Other devices will need to sign in again. Downloaded copies remain on those devices. A pending email change will be cancelled.',action:'sessions-revoke',target:'others',commit:async(ticket,current)=>{await client.request('sessions/revoke',{method:'POST',body:{target:'others',ticket},current});if(live()&&current())await refresh()}}),{destructive:true}));content.append(devices);
    const settings=card('Connections and recovery',setting('Passkeys and account recovery','key','/#settings=account-security'),setting('Remembered devices','device',()=>options.remembered?.()),setting('Connected calendars','calendar',()=>options.calendars?.()),setting('Fitness providers and app sharing','link','/#you=apps'),setting('Export account data','download','/#settings=account-data'));settings.classList.add('sm-settings');content.append(settings);
    content.append(el('details',{class:'sm-card sm-disclosure'},el('summary',{},el('span',{text:'How your information is protected'}),ui.icon('chev')),el('div',{class:'sm-boundaries'},...Object.values(summary.boundaries).map(note))));
   }else if(view==='access'){
    content.append(note('Choose which connections can run, ask first or stay blocked.'));
    const applicable=summary.permissions.filter(p=>!app||app==='files'&&p.key.startsWith('files.')||app==='calendar'&&p.key==='calendar.subscription'||p.key==='files.transfer.'+app);
    if(!applicable.length)content.append(ui.empty({title:'No extra permissions',body:'This app uses your existing account and record ownership checks.'}));
    for(const p of applicable){const c=card(p.title,note(p.detail),row(MODES[p.mode],p.inherited?'Default setting':'Changed '+date(p.updatedAt),btn('Change',()=>permission(p,refresh),{small:true}),'link'));c.dataset.mode=p.mode;c.dataset.permission=p.key;content.append(c)}
    if(app)content.append(btn('View all app access',()=>{app=null;paint()}));
    content.append(note('These controls apply to InFlite’s built-in connections. Revoking access does not recall copies already sent.'));
   }else{
    content.append(note('Recent account and Security Module events are kept for 30 days. Security Module records action types, never search text, file contents or subscription links.'));
    if(!summary.events.length)content.append(ui.empty({title:'No recent activity',body:'Sign-ins and security changes will appear here.'}));
    let group,day='';for(const e of summary.events){const key=date(e.at);if(key!==day){day=key;group=card(key===date(Date.now())?'Today':key);group.classList.add('sm-events');content.append(group)}group.append(row(EVENTS[e.kind]||e.kind.replaceAll('-',' '),[new Date(e.at).toLocaleTimeString(undefined,{hour:'numeric',minute:'2-digit'}),e.app,e.device].filter(Boolean).join(' · '),null,'clock'))}
   }
   content.scrollTop=top;
   if(animate&&!matchMedia('(prefers-reduced-motion: reduce)').matches)motion=content.animate([{opacity:.35,transform:'translateY(4px)'},{opacity:1,transform:'translateY(0)'}],{duration:180,easing:'cubic-bezier(.2,.8,.2,1)'});
  }
  body.append(el('div',{class:'sm-toolbar'},tabs,el('div',{class:'sm-meta'},stamp,refreshButton),say),content);
  h=opened=F.sheet.open({sheet:'security-module',title:'Security Module',body,onClose(){epoch++;motion?.cancel();summary=null;opened=null}});refresh();return h;
 }
 return{open,transfer:async(destination,item,lease={})=>client.request('file-transfer',{method:'POST',body:{destination,id:item.id,version:item.version},...lease})};
}
