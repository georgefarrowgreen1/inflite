const {test}=require('node:test');
const assert=require('node:assert/strict');
const source=import('../today/public/roof/files-dialogs.js');
const token='a'.repeat(32),key='drive:'+'b'.repeat(32);
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve};};
async function fixture(run,options={}){
 const {createFilesDialogs}=await source,life=new AbortController(),calls=[];
 const F={signal:life.signal,session:{view:{user:{id:'owner-a'}}},ui:{},sheet:{}};
 const service={async resolveDrag(value,lease){calls.push({kind:'resolve',value,lease});return options.resolve?options.resolve(value,lease):[{key,id:'b'.repeat(32),version:4,name:'Ride.GPX',mime:'application/gpx+xml',size:4,kind:'file',status:'ready'}];},async read(value,lease){calls.push({kind:'read',value,lease});return options.read?options.read(value,lease):{file:new File(['data'],'Ride.GPX',{type:'application/gpx+xml'})};}};
 const dialogs=createFilesDialogs(F,{service}),app=dialogs.forApp('fitness',{current:()=>!life.signal.aborted});
 const transfer={getData:type=>type==='application/x-inflite-files-token'?token:''};
 try{await run({dialogs,app,transfer,F,life,calls});}finally{dialogs.destroy();life.abort();}
}
test('file formats are normalized, bounded and checked by actual name/MIME',async()=>{
 const {fileAccept,acceptsFile}=await source;
 assert.deepEqual(fileAccept(' .GPX, application/gpx+xml,image/*,.gpx,invalid,https://evil.test'),['.gpx','application/gpx+xml','image/*']);
 assert.equal(acceptsFile({name:'RIDE.GPX',mime:'application/octet-stream'},fileAccept('.gpx')),true);
 assert.equal(acceptsFile({name:'script.html',mime:'text/html'},fileAccept('image/*')),false);
 assert.equal(acceptsFile(new File(['a'],'Photo.png',{type:'image/png'}),fileAccept('image/*')),true);
 assert.equal(fileAccept(Array(100).fill('.fit')).length,1);
});
test('save filenames require a real bounded leaf name without path/control spoofing',async()=>{
 const {validSaveName}=await source;
 for(const name of ['Route.gpx','🌤 forecast.json','Café ride.fit'])assert.equal(validSaveName(name),true);
 for(const name of ['', ' ','.','..','../private','dir\\private',' lead.txt','tail.txt ','a\n.txt','a\u202eexe.txt','a'.repeat(256)])assert.equal(validSaveName(name),false,name);
});
test('explicit opaque drag resolves metadata then reads only the observed file version',async()=>{
 await fixture(async({app,transfer,calls})=>{
  const files=await app.fromDrop(transfer,{accept:'.gpx',maxBytes:5});
  assert.equal(files.length,1);assert.equal(files[0].name,'Ride.GPX');assert.equal(await files[0].text(),'data');
  assert.deepEqual(calls.map(c=>c.kind),['resolve','read']);assert.equal(calls[1].value,key);assert.equal(calls[1].lease.version,4);
  assert.equal(calls[1].lease.current(),false,'completed drop lease is released');
 });
});
test('foreign data formats, forged tokens and expired metadata never read bytes',async()=>{
 await fixture(async({app,calls})=>{
  for(const value of ['',token+'x','b'.repeat(31),'../../private'])assert.equal(await app.fromDrop({getData:()=>value}),null);
  assert.equal(calls.length,0);
 });
 await fixture(async({app,transfer,calls})=>{assert.equal(await app.fromDrop(transfer),null);assert.equal(calls.filter(c=>c.kind==='read').length,0);},{resolve:()=>[]});
});
test('format, file-count and aggregate byte limits reject before opening dropped content',async()=>{
 const base={key,version:1,name:'Unsafe.html',mime:'text/html',size:6,kind:'file'};
 for(const opts of [{accept:'.fit'},{maxBytes:5},{maxFiles:1}])await fixture(async({app,transfer,calls})=>{
  await assert.rejects(app.fromDrop(transfer,opts));assert.equal(calls.filter(c=>c.kind==='read').length,0);
 },{resolve:()=>opts.maxFiles?[base,{...base,key:key+'2'}]:[base]});
});
test('a swapped account or aborted requester cannot receive late dropped bytes',async()=>{
 for(const mode of ['account','signal']){
  const waiting=deferred(),started=deferred();
  await fixture(async({dialogs,transfer,F,life})=>{
   const requested=new AbortController(),app=dialogs.forApp('mail',{signal:requested.signal});
   const result=app.fromDrop(transfer);await started.promise;
   if(mode==='account')F.session.view.user.id='owner-b';else requested.abort();
   waiting.resolve({file:new File(['data'],'Ride.GPX',{type:'application/gpx+xml'})});
   await assert.rejects(result,error=>error.name==='AbortError');
  },{read:async()=>{started.resolve();return waiting.promise;}});
 }
});
test('post-read bytes are rechecked and a non-owned request never begins',async()=>{
 await fixture(async({app,transfer,calls})=>{
  await assert.rejects(app.fromDrop(transfer,{maxBytes:5}),/limits/);
  assert.equal(calls.filter(c=>c.kind==='read').length,1);
 },{read:()=>({file:new File(['too large'],'Ride.GPX',{type:'application/gpx+xml'})})});
 await fixture(async({app,transfer,calls})=>{
  await assert.rejects(app.fromDrop(transfer,{current:()=>false}),error=>error.name==='AbortError');assert.equal(calls.length,0);
 });
});
