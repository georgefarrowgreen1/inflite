const {test}=require('node:test'),assert=require('node:assert/strict');
const source=import('../today/public/roof/restore.js'),routes=import('../today/public/roof/router.js');
const NOW=1794800000000,ID='a'.repeat(32);
async function fixture(){const {createResumeState,RESUME_PREFIX}=await source,{parse}=await routes,map=new Map(),life=new AbortController();let time=NOW;
 const storage={getItem:k=>map.get(k),setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)};
 return{map,life,storage,key:RESUME_PREFIX+'ann',setTime:v=>time=v,parse:p=>parse(p,{roof:true,workspace:true}),make:(owner='ann',extra={})=>createResumeState({owner,signal:life.signal,storage,now:()=>time,...extra})};}
test('restoration persists only a curated route and bounded scroll, never editor content or query',async()=>{
 const t=await fixture(),r=t.make();assert.equal(r.remember(t.parse('/chats/#open=chat-123'),{y:429.8,state:{secret:'private'}}),true);
 assert.deepEqual(r.restore('https://inflite.ai/',{chats:true}),{path:'/chats/#open=chat-123',y:430});
 assert.deepEqual(Object.keys(JSON.parse(t.map.get(t.key))).sort(),['at','owner','target','v']);assert.doesNotMatch(t.map.get(t.key),/secret|private/);
 for(const path of ['/auth/','/account/','/chats/#share=token','/weather/#day=2026-11-16','/markets/#s=ABC','/mail/?token=private'])assert.equal(r.remember(t.parse(path)),false,path);
});
test('bare root only: explicit links, callback queries and disabled apps win',async()=>{
 const t=await fixture(),r=t.make();r.remember(t.parse('/fitness/#routes'),{y:100});
 assert.equal(r.restore('https://inflite.ai/',{fitness:false}),null);
 for(const url of ['https://inflite.ai/#apps','https://inflite.ai/?token=secret','https://inflite.ai/weather/'])assert.equal(r.restore(url,{fitness:true}),null);
 assert.equal(r.restore('https://inflite.ai/?os=1',{fitness:true}).path,'/fitness/#routes');
});
test('opaque Files folders and source enums restore without names or searches',async()=>{
 const t=await fixture(),r=t.make();r.remember(t.parse('/#files='+ID),{state:{files:{userId:'ann',location:{kind:'drive',folderId:ID,name:'Private folder',q:'secret'}}}});
 assert.deepEqual(r.restore('https://inflite.ai/').state.files,{userId:'ann',location:{kind:'drive',folderId:ID,view:'folder'}});assert.doesNotMatch(t.map.get(t.key),/Private|secret/);
 r.remember(t.parse('/#files'),{state:{files:{userId:'ann',location:{kind:'apps',app:'mail',category:'documents'}}}});
 assert.equal(r.restore('https://inflite.ai/').files.app,'mail');
});
test('different accounts, expired records, malformed targets and aborted lifetimes never restore',async()=>{
 const t=await fixture(),r=t.make();r.remember(t.parse('/weather/'));assert.equal(t.make('beth').restore('https://inflite.ai/',{weather:true}),null);
 const valid=t.map.get(t.key);t.setTime(NOW+8*864e5);assert.equal(r.restore('https://inflite.ai/',{weather:true}),null);assert.equal(t.map.has(t.key),false);t.setTime(NOW);
 for(const value of ['bad','x'.repeat(1501),JSON.stringify({v:1,owner:'beth',at:NOW,target:{path:'/weather/'}}),JSON.stringify({v:1,owner:'ann',at:NOW+120000,target:{path:'/weather/'}}),JSON.stringify({v:1,owner:'ann',at:NOW,target:{path:'//evil.test'}})]){t.map.set(t.key,value);assert.equal(r.restore('https://inflite.ai/',{weather:true}),null);}
 t.map.set(t.key,valid);t.life.abort();assert.equal(r.restore('https://inflite.ai/',{weather:true}),null);assert.equal(r.remember(t.parse('/weather/')),false);
});
test('storage failures and invalid owner IDs fail closed; signout can remove the exact owner record',async()=>{
 const t=await fixture();for(const storage of [null,{getItem(){throw Error('blocked')},setItem(){throw Error('full')}}]){const r=t.make('ann',{storage});assert.equal(r.remember(t.parse('/weather/')),false);assert.equal(r.restore('https://inflite.ai/',{weather:true}),null);}
 assert.equal(t.make('../other').remember(t.parse('/weather/')),false);const r=t.make();r.remember(t.parse('/weather/'));r.clear();assert.equal(t.map.has(t.key),false);
});
test('malformed references cannot smuggle URLs, encoded tokens or noncanonical app aliases',async()=>{
 const {resumeTarget}=await source;for(const path of ['https://evil.test/','//evil.test/','/mail/#thread=secret%20token','/chats/#open=abc?token=secret','/chats/#open=abc\\def','/chats/#settings','/#files=../bad','/weather/#now#extra'])assert.equal(resumeTarget({path}),null,path);
 assert.deepEqual(resumeTarget({path:'/weather/#radar',y:Infinity}),{path:'/weather/#radar',y:0});
});
