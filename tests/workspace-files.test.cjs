const {test}=require('node:test');
const assert=require('node:assert/strict');
const fileModule=import('../today/public/roof/workspace-files.js');
const file=(extra={})=>({id:'mail:attachment:abc-1',app:'mail',name:'Invoice.pdf',mime:'application/pdf',objectId:'abc-1',intent:'open-attachment',downloadIntent:'download-attachment',...extra});
test('Files accepts only bounded metadata and opaque same-source resource references',async()=>{
 const {normalizeWorkspaceFile:clean}=await fileModule;
 assert.deepEqual(clean(file({body:'PRIVATE',url:'https://secret/?token=key',coords:[[1,2]],size:12,modifiedAt:123,source:'Maya'}),'mail'),file({size:12,modifiedAt:123,source:'Maya'}));
 for(const extra of [{app:'chats'},{id:'https://secret/file'},{objectId:'../../attachment'},{intent:'javascript:alert(1)'},{mime:'text/html;secret=x'},{name:''}])assert.equal(clean(file(extra),'mail'),null,JSON.stringify(extra));
 assert.equal(clean(file(),'constructor'),null);
 const bounded=clean(file({name:'a'.repeat(1000),source:'b'.repeat(1000),size:-1,modifiedAt:Infinity}),'mail');assert.equal(bounded.name.length,255);assert.equal(bounded.source.length,140);assert.equal('size' in bounded,false);assert.equal('modifiedAt' in bounded,false);
 assert.equal(clean(file({category:'audio'}),'mail').category,'audio');assert.equal('category' in clean(file({category:'token=secret'}),'mail'),false);
});
test('Files filtering and sorting use actual names, types, sizes and sources',async()=>{
 const {filterWorkspaceFiles:filter}=await fileModule;
 const files=[file({id:'a',name:'Résumé.pdf',source:'Maya',size:200,modifiedAt:20}),file({id:'b',app:'fitness',name:'Norwich.gpx',mime:'application/gpx+xml',size:100,modifiedAt:30}),file({id:'c',app:'fitness',name:'Endurance.fit',mime:'application/vnd.ant.fit',size:300,modifiedAt:10}),file({id:'d',app:'chats',name:'Ride.png',mime:'image/png',size:80,modifiedAt:15})];
 assert.deepEqual(filter(files,{query:'resume maya'}).map(f=>f.id),['a']);assert.deepEqual(filter(files,{type:'routes'}).map(f=>f.id),['b']);assert.deepEqual(filter(files,{type:'workouts'}).map(f=>f.id),['c']);assert.deepEqual(filter(files,{source:'chats',type:'images'}).map(f=>f.id),['d']);assert.deepEqual(filter(files,{sort:'size'}).map(f=>f.id),['c','a','b','d']);assert.deepEqual(filter(files).map(f=>f.id),['b','a','d','c']);
 const opaqueMedia=[file({id:'image',mime:'application/octet-stream',category:'image'}),file({id:'audio',mime:'application/octet-stream',category:'audio'})];assert.deepEqual(filter(opaqueMedia,{type:'images'}).map(f=>f.id),['image']);assert.deepEqual(filter(opaqueMedia,{type:'audio'}).map(f=>f.id),['audio']);
});
test('transient Chat metadata is reconciled on recall and conversation switch, including saved command callbacks',async()=>{
 const {createWorkspaceFiles}=await fileModule,ac=new AbortController(),runs=[];
 let eligible=[file({id:'chats:file:peer:photo',objectId:'peer:photo',app:'chats',name:'Private photo',mime:'application/octet-stream',intent:'open-file'})],status='ready';
 const F={signal:ac.signal,ui:{},session:{view:{user:{id:'ann'}}}};
 const library=createWorkspaceFiles(F,{sources:()=>[{app:'chats',status,transient:true,files:eligible}],load(){throw Error('transient reconciliation must not fetch')},runIntent:(...args)=>runs.push(args),openApp(){}});
 const saved=(await library.search('Private')).find(e=>e.title==='Private photo');assert.ok(saved);
 eligible=[];library.changed('chats');
 assert.deepEqual((await library.search('Private')).map(e=>e.title),['Find “Private” in Files']);
 await saved.run();assert.deepEqual(runs,[],'a recalled file’s existing command cannot invoke its native action');
 eligible=[file({id:'chats:file:other:voice',objectId:'other:voice',app:'chats',name:'Other conversation voice',mime:'application/octet-stream',intent:'open-file'})];library.update('chats');
 assert.ok((await library.search('Other')).some(e=>e.title==='Other conversation voice'));
 assert.equal((await library.search('Private')).some(e=>e.title==='Private photo'),false);
 for(const next of ['loading','locked','signin','error']){status=next;library.update('chats');assert.equal((await library.search('Other')).some(e=>e.title==='Other conversation voice'),false,next)}
 status='ready';library.update('chats');assert.ok((await library.search('Other')).some(e=>e.title==='Other conversation voice'));
 ac.abort();assert.deepEqual(await library.search('Other'),[]);
});

test('app display metadata strips bidi overrides and isolates while preserving Arabic and Hebrew text and opaque references',async()=>{
 const {normalizeWorkspaceFile:clean}=await fileModule;
 const value=file({name:'דוח\u202epdf.exe\u2066',source:'تقرير\u2069 Maya'}),parsed=clean(value,'mail');
 assert.equal(/[\u202a-\u202e\u2066-\u2069]/.test(parsed.name+parsed.source),false);
 assert.ok(parsed.name.includes('דוח'));assert.ok(parsed.source.includes('تقرير'));
 assert.equal(parsed.id,value.id);assert.equal(parsed.objectId,value.objectId);assert.equal(parsed.intent,value.intent);
});
