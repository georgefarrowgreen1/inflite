const {test}=require('node:test');
const assert=require('node:assert/strict');
const {fixture}=require('./fixtures/mail-private-cache.cjs');
test('authenticated Mail originals, pictures and full/ranged attachments never enter HTTP caches',async()=>{
 const f=await fixture();try{
  for(const path of ['/api/messages/message1/raw','/api/photo?v=1','/api/attachments/file1','/api/attachments/file1?download']){
   const r=await f.mail.fetch(f.request(path),f.env,f.ctx);assert.equal(r.status,200,path);assert.equal(r.headers.get('cache-control'),'private, no-store',path);assert.ok((await r.arrayBuffer()).byteLength>0);
  }
  const ranged=await f.mail.fetch(f.request('/api/attachments/file1',undefined,{Range:'bytes=0-6'}),f.env,f.ctx);
  assert.equal(ranged.status,206);assert.equal(ranged.headers.get('cache-control'),'private, no-store');assert.equal(ranged.headers.get('content-range'),'bytes 0-6/24');assert.equal(await ranged.text(),'PRIVATE');
  const avatar=await f.today.fetch(new Request('https://inflite.ai/api/avatar?v=1',{headers:{Cookie:f.request('/').headers.get('cookie')}}),f.env,f.ctx);
  assert.equal(avatar.status,200);assert.equal(avatar.headers.get('cache-control'),'private, no-store');assert.match(await avatar.text(),/PRIVATE-AVATAR/);
 }finally{await f.close();}
});
