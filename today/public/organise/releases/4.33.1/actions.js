// Explicit export and invitation controls load only when requested.
import {when} from './model.js';

export function noteText(v){return v.title+'\n\n'+(v.text||'')+(v.checklist?.length?'\n\n'+v.checklist.map(x=>(x.done?'[x] ':'[ ] ')+x.text).join('\n'):'')}
export function eventICS(v){const escape=s=>String(s||'').replace(/\\/g,'\\\\').replace(/\r?\n/g,'\\n').replace(/;/g,'\\;').replace(/,/g,'\\,'),dt=n=>new Date(n).toISOString().replace(/[-:]/g,'').replace(/\.\d+Z$/,'Z'),date=s=>s.replace(/-/g,'');
 const lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//InFlite//Calendar 4.00//EN','BEGIN:VEVENT','UID:'+v.id+'@inflite.ai','DTSTAMP:'+dt(Date.now()),v.allDay?'DTSTART;VALUE=DATE:'+date(v.startDate):'DTSTART:'+dt(v.start),v.allDay?'DTEND;VALUE=DATE:'+date(v.endDate):'DTEND:'+dt(v.end),'SUMMARY:'+escape(v.title),'DESCRIPTION:'+escape(v.description),'END:VEVENT','END:VCALENDAR'];
 // RFC 5545: fold on UTF-8 byte boundaries, at 75 octets including continuation.
 return lines.map(line=>{let out='',part='',n=0;for(const ch of line){const size=new TextEncoder().encode(ch).length;if(n+size>75){out+=part+'\r\n ';part='';n=1}part+=ch;n+=size}return out+part}).join('\r\n')+'\r\n';
}

function documentFile(kind,v,name){
 const suffix=kind==='calendar'?'.ics':'.txt',mime=kind==='calendar'?'text/calendar':'text/plain';
 const contents=kind==='calendar'?eventICS(v):kind==='notes'?noteText(v):[v.title,v.organisation,v.email,v.phone,v.details].filter(Boolean).join('\n');
 return new File([contents],name+suffix,{type:mime});
}

export async function exportValue(F,kind,v){
 if(F.signal.aborted)return;
 if(!F.workspace?.files?.save)throw Error('Files is still opening. Try again.');
 const name=v.title.replace(/[\/:\\\u0000-\u001f]/g,'-').slice(0,120);
 return F.workspace.files.save(documentFile(kind,v,name),{title:'Save a copy to Files'});
}

export function downloadValue(F,root,kind,v){
 const file=documentFile(kind,v,v.title),url=URL.createObjectURL(file);
 const link=F.ui.el('a',{href:url,download:file.name,hidden:true});
 const revoke=()=>{
  URL.revokeObjectURL(url);
  clearTimeout(timer);
  F.signal.removeEventListener('abort',revoke);
 };
 const timer=setTimeout(revoke,1000);
 F.signal.addEventListener('abort',revoke,{once:true});
 root.append(link);link.click();link.remove();
 return{ok:true};
}

export function prepareInvitation(F,v){const ui=F.ui,el=ui.el,current=()=>!F.signal.aborted&&F.workspace?.active()!==false,button=(label,run)=>ui.btn(label,{run:async()=>{if(!current())return;try{await run()}catch(e){if(current())F.toast(e.message)}}});const text=`${v.title}\n${v.allDay?new Date(v.startDate+'T12:00:00').toLocaleDateString():new Date(v.start).toLocaleString()+' · '+when(v)}\n${v.description||''}`.trim(),copy=el('textarea',{rows:6,readonly:true,'aria-label':'Invitation text'});copy.value=text;let h;
  const body=el('div',{class:'org'},el('p',{text:'Review this invitation. Nothing is sent automatically.'}),copy,button('Copy invitation',async()=>{await navigator.clipboard.writeText(text);F.toast('Invitation copied')}),button('Open Chats',()=>{h.now();F.nav.go('/chats/')}));
  if(F.workspace?.handoffs?.can('mail','text'))body.append(button('Prepare in Mail',async()=>{h.now();const result=await F.workspace.handoffs.send('mail','text',{subject:v.title,text});if(!result?.ok)F.toast(result?.error||'Mail could not open.')}));h=F.sheet.open({sheet:'calendar-invite',title:'Prepare invitation',body});
 }
