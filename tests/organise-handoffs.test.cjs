// Exercise the actual native review form without loading an account or sending
// data. Store writes are a spy at the same boundary used by mountApp.
const {test,before}=require('node:test'),assert=require('node:assert/strict');
const {readFile}=require('node:fs/promises'),{resolve}=require('node:path'),{pathToFileURL}=require('node:url');
let openAtlasDraft;
before(async()=>{
 const filename=resolve(__dirname,'../today/public/organise/app.js');
 const source=(await readFile(filename,'utf8'))
  .replace("import {createStore} from './store.js';","const createStore=()=>{throw Error('No account access in review tests')};")
  .replace("import {operationId} from '/roof/system-client.js';","const operationId=()=>{throw Error('No record creation before approval')};")
  .replace("from './model.js'","from "+JSON.stringify(pathToFileURL(resolve(__dirname,'../today/public/organise/model.js')).href));
 ({openAtlasDraft}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64')));
});
const all=node=>[node,...(node.children||[]).flatMap(all)];
function fixture(kind='notes',value={kind:'note-draft',title:'Agenda',text:'Review the plan',source:{app:'mail',threadId:'thread-a'}}){
 const life=new AbortController(),state={active:true,created:[],sheets:[],busy:[]};
 function el(tag,attrs={},...children){return{tag,attrs,children:children.flat().filter(Boolean),value:attrs.value||'',textContent:attrs.text||'',classList:{contains:()=>false},append(...nodes){this.children.push(...nodes.flat().filter(Boolean))},addEventListener(name,run){this[name]=run},checkValidity(){return all(this).every(n=>!n.attrs?.required||!!n.value)},reportValidity(){state.invalid=true}}}
 const F={signal:life.signal,session:{user:{id:'ann'}},ui:{el,btn:(text,props)=>({...el('button',{text}),run:props.run})},sheet:{open(spec){state.sheets.push(spec);const handle={closed:false,el:el('dialog'),now(){handle.closed=true;spec.onClose()},setBusy(value){state.busy.push(value)}};state.handle=handle;return handle}}};
 const create=async(initial,current)=>{if(state.gate)await state.gate;if(!current())return false;state.created.push(initial);return true};
 const handle=openAtlasDraft(F,kind,value,{current:()=>state.active,create});
 const nodes=()=>all(state.sheets[0]?.body||{}),field=label=>nodes().find(n=>n.attrs?.['aria-label']===label),button=label=>nodes().find(n=>n.tag==='button'&&n.textContent===label);
 return{F,life,state,handle,field,button,nodes};
}
test('Atlas Notes handoff stays in native review until Create, using edited text and the original Mail link',async()=>{
 const t=fixture();assert.equal(t.state.sheets.length,1);assert.deepEqual(t.state.created,[]);
 t.field('Title').value='Final agenda';t.field('Note').value='1. Review\n2. Decide';
 await t.button('Create note').run();
 assert.deepEqual(t.state.created,[{title:'Final agenda',text:'1. Review\n2. Decide',checklist:[],links:[{app:'mail',id:'thread-a'}]}]);assert.equal(t.handle.closed,true);
 await t.button('Create note').run();assert.equal(t.state.created.length,1);
});
test('native review never creates after cancel, app departure, account change, or abort',async()=>{
 for(const change of ['cancel','app','owner','abort']){
  const t=fixture();if(change==='cancel')t.button('Cancel').run();if(change==='app')t.state.active=false;if(change==='owner')t.F.session.user.id='bea';if(change==='abort')t.life.abort();
  await t.button('Create note').run();assert.deepEqual(t.state.created,[],change);
 }
});
test('native Calendar review asks for dates when Atlas did not supply reliable times',async()=>{
 const t=fixture('calendar',{kind:'event-draft',title:'Plan review',description:'Discuss agenda',source:{app:'mail',threadId:'thread-a'},attendees:['ignored@example.test']});
 assert.equal(t.field('Starts').value,'');assert.equal(t.field('Ends').value,'');await t.button('Create event').run();assert.deepEqual(t.state.created,[]);assert.equal(t.state.invalid,true);
 t.field('Starts').value='2026-11-24T10:00';t.field('Ends').value='2026-11-24T09:00';await t.button('Create event').run();assert.deepEqual(t.state.created,[]);
 t.field('Ends').value='2026-11-24T11:00';await t.button('Create event').run();
 assert.equal(t.state.created.length,1);const event=t.state.created[0];assert.equal(event.start,new Date('2026-11-24T10:00').getTime());assert.equal(event.end,new Date('2026-11-24T11:00').getTime());assert.equal(event.allDay,false);assert.equal('attendees' in event,false);assert.deepEqual(event.links,[{app:'mail',id:'thread-a'}]);assert.equal(t.handle.closed,true);
});
test('native review defends its pending approval against duplicate clicks and account retirement',async()=>{
 const t=fixture();let resolve;t.state.gate=new Promise(done=>{resolve=done});
 const first=t.button('Create note').run();await t.button('Create note').run();assert.equal(t.button('Create note').disabled,true);assert.deepEqual(t.state.created,[]);
 t.F.session.user.id='bea';resolve();await first;assert.deepEqual(t.state.created,[]);
});
test('native review rejects a wrong target and never turns generated HTML into markup',()=>{
 const wrong=fixture('notes',{kind:'event-draft',title:'Wrong',description:'Wrong'});assert.equal(wrong.handle,null);assert.deepEqual(wrong.state.sheets,[]);
 const t=fixture('notes',{kind:'note-draft',title:'<script>text</script>',text:'<img src=x onerror=alert(1)>',source:{app:'files',url:'https://example.test'}});
 assert.equal(t.field('Title').value,'<script>text</script>');assert.equal(t.field('Note').value,'<img src=x onerror=alert(1)>');assert.equal(t.nodes().some(n=>'innerHTML' in n),false);assert.deepEqual(t.state.created,[]);
});
