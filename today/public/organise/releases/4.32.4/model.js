export const localDay=(v=new Date())=>{const d=new Date(v);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};
export const addDays=(s,n)=>{const d=new Date(s+'T12:00:00');d.setDate(d.getDate()+n);return localDay(d)};
export const localInput=ms=>{const d=new Date(ms);return localDay(d)+'T'+String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0')};
export function parseLocal(s){const d=new Date(s);if(!Number.isFinite(+d)||localInput(+d)!==s)throw Error('This local time does not exist. Choose another time.');return +d}
export const zone=()=>Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC';
export const eventDay=v=>v.allDay?v.startDate:localDay(v.start);
export function overlaps(v,first,last){return v.allDay?v.startDate<last&&v.endDate>first:v.start<new Date(last+'T00:00:00').getTime()&&v.end>new Date(first+'T00:00:00').getTime()}
export function when(v){return v.allDay?'All day'+(v.endDate>addDays(v.startDate,1)?' · through '+new Date(addDays(v.endDate,-1)+'T12:00:00').toLocaleDateString(): ''):new Date(v.start).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})+' – '+new Date(v.end).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}
export const pathOf=r=>['calendar','notes','people'].includes(r.app)?`/${r.app}/#item=${r.id}`:r.app==='mail'?(r.id?'/mail/#thread='+r.id:'/mail/'):r.app==='chats'?(r.id?'/chats/#open='+r.id:'/chats/'):r.app==='fitness'&&/^\d{4}-\d{2}-\d{2}$/.test(r.id||'')?'/fitness/#day='+r.id:`/${r.app}/`;
