export const localDay=(v=new Date())=>{const d=new Date(v);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};
export const addDays=(s,n)=>{const d=new Date(s+'T12:00:00');d.setDate(d.getDate()+n);return localDay(d)};
export const localInput=ms=>{const d=new Date(ms);return localDay(d)+'T'+String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0')};
export function parseLocal(s){const d=new Date(s);if(!Number.isFinite(+d)||localInput(+d)!==s)throw Error('This local time does not exist. Choose another time.');return +d}
export const zone=()=>Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC';
export const eventDay=v=>v.allDay?v.startDate:localDay(v.start);
export function overlaps(v,first,last){return v.allDay?v.startDate<last&&v.endDate>first:v.start<new Date(last+'T00:00:00').getTime()&&v.end>new Date(first+'T00:00:00').getTime()}
export function when(v){return v.allDay?'All day'+(v.endDate>addDays(v.startDate,1)?' · through '+new Date(addDays(v.endDate,-1)+'T12:00:00').toLocaleDateString(): ''):new Date(v.start).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})+' – '+new Date(v.end).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}
export const pathOf=r=>['calendar','notes','people'].includes(r.app)?`/${r.app}/#item=${r.id}`:r.app==='mail'?(r.id?'/mail/#thread='+r.id:'/mail/'):r.app==='chats'?(r.id?'/chats/#open='+r.id:'/chats/'):r.app==='fitness'&&/^\d{4}-\d{2}-\d{2}$/.test(r.id||'')?'/fitness/#day='+r.id:`/${r.app}/`;
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
export function noteText(v){return v.title+'\n\n'+(v.text||'')+(v.checklist?.length?'\n\n'+v.checklist.map(x=>(x.done?'[x] ':'[ ] ')+x.text).join('\n'):'')}
export function eventICS(v){const escape=s=>String(s||'').replace(/\\/g,'\\\\').replace(/\r?\n/g,'\\n').replace(/;/g,'\\;').replace(/,/g,'\\,'),dt=n=>new Date(n).toISOString().replace(/[-:]/g,'').replace(/\.\d+Z$/,'Z'),date=s=>s.replace(/-/g,'');
 const lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//InFlite//Calendar 4.00//EN','BEGIN:VEVENT','UID:'+v.id+'@inflite.ai','DTSTAMP:'+dt(Date.now()),v.allDay?'DTSTART;VALUE=DATE:'+date(v.startDate):'DTSTART:'+dt(v.start),v.allDay?'DTEND;VALUE=DATE:'+date(v.endDate):'DTEND:'+dt(v.end),'SUMMARY:'+escape(v.title),'DESCRIPTION:'+escape(v.description),'END:VEVENT','END:VCALENDAR'];
 // RFC 5545: fold on UTF-8 byte boundaries, at 75 octets including continuation.
 return lines.map(line=>{let out='',part='',n=0;for(const ch of line){const size=new TextEncoder().encode(ch).length;if(n+size>75){out+=part+'\r\n ';part='';n=1}part+=ch;n+=size}return out+part}).join('\r\n')+'\r\n';
}
