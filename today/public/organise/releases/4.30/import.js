import {operationId} from '/roof/system-client.js';
// A vCard import is explicit and local until the selection is confirmed. No file
// bytes, URLs, photos or vCard commands are handed to another app or executed.
export function parseContacts(raw){
 if(typeof raw!=='string'||raw.length>512*1024)throw Error('Choose a contacts file smaller than 512 KB.');
 const lines=raw.replace(/\r\n[ \t]|\n[ \t]/g,'').split(/\r?\n/),out=[];let v=null;
 const decode=s=>s.replace(/\\[nN]/g,'\n').replace(/\\([,;\\])/g,'$1');
 for(const line of lines){
  if(/^BEGIN:VCARD$/i.test(line)){v={title:'',email:'',phone:'',organisation:'',details:'',links:[]};continue}
  if(/^END:VCARD$/i.test(line)){if(v?.title.trim())out.push(v);v=null;if(out.length>100)throw Error('Import up to 100 contacts at a time.');continue}
  if(!v)continue;const colon=line.indexOf(':');if(colon<0)continue;const property=line.slice(0,colon),key=property.split(';')[0].replace(/^.*\./,'').toUpperCase(),value=decode(line.slice(colon+1));
  if(!['FN','N','EMAIL','TEL','ORG','NOTE'].includes(key))continue;
  if(/ENCODING|CHARSET/i.test(property))throw Error('Export this file as UTF-8 vCard 3.0 or 4.0, then try again.');
  if(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u202a-\u202e\u2066-\u2069]/.test(value))throw Error('This file contains unsupported characters.');
  if(key==='FN')v.title=value.trim().slice(0,160);
  if(key==='N'&&!v.title)v.title=value.split(';').filter(Boolean).reverse().join(' ').trim().slice(0,160);
  if(key==='EMAIL'&&!v.email&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)&&value.length<=254)v.email=value;
  if(key==='TEL'&&!v.phone)v.phone=value.replace(/^tel:/i,'').slice(0,40);
  if(key==='ORG')v.organisation=value.replace(/;/g,' · ').slice(0,160);
  if(key==='NOTE')v.details=value.slice(0,4000);
 }
 if(!out.length)throw Error('No named contacts found. Choose a .vcf contacts file.');return out;
}
export function openImport({F,store,onImported}){
 const {el}=F.ui,life=F.signal;let rows=[],generation=0,closed=false,working=false;
 const live=()=>!closed&&!life.aborted,input=el('input',{type:'file',accept:'.vcf,text/vcard,text/x-vcard','aria-label':'Contacts file'}),message=el('p',{class:'org-status',role:'status'}),preview=el('div',{class:'org-import-preview'}),confirm=F.ui.btn('Import contacts',{primary:true,run:async()=>{
  if(working||!rows.length||!live())return;working=true;input.disabled=true;confirm.disabled=true;let completed=0;const total=rows.length,selected=[...rows];
  try{for(const value of selected){if(!live())break;await store.save(operationId(),value,{version:0});rows.shift();completed++;message.textContent=completed+' of '+total+' kept'}if(live()){message.textContent=completed+' contacts added. Pending changes sync when connected.';rows=[];onImported();F.toast(completed+' contacts added')}}catch(e){if(live())message.textContent=e.message+' · '+completed+' contacts were kept. You can retry the remaining contacts.'}finally{working=false;if(live()){input.disabled=false;confirm.disabled=!rows.length}}
 }});confirm.disabled=true;
 const body=el('section',{class:'org'},el('p',{class:'org-muted',text:'Choose a vCard (.vcf) file. Review the contacts, then add them to your private address book.'}),el('label',{class:'org-field'},el('span',{text:'Contacts file'}),input),message,preview,confirm);
 const h=F.sheet.open({sheet:'people-import',title:'Import contacts',body});
 input.addEventListener('change',async()=>{const mine=++generation;rows=[];preview.replaceChildren();confirm.disabled=true;const file=input.files?.[0];if(!file)return;try{if(file.size>512*1024)throw Error('Choose a contacts file smaller than 512 KB.');const text=await file.text();if(!live()||mine!==generation)return;rows=parseContacts(text);message.textContent=rows.length+' contacts ready to import. Existing contacts stay as they are.';for(const v of rows)preview.append(el('div',{class:'org-import-contact'},F.ui.avatar(v.title),el('span',{},el('strong',{text:v.title}),el('small',{class:'org-muted',text:v.email||v.phone||v.organisation}))));confirm.disabled=false}catch(e){if(live()&&mine===generation)message.textContent=e.message}});
 // The native sheet scope removes its body when closed. Stop late file reads
 // and writes on owner replacement, or when the user closes the preview.
 const observer=new MutationObserver(()=>{if(!body.isConnected){closed=true;generation++;rows=[];observer.disconnect()}});observer.observe(document.body,{childList:true,subtree:true});life.addEventListener('abort',()=>{closed=true;generation++;rows=[];observer.disconnect();h.now()},{once:true});
}
