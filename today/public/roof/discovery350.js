// Query fan-out is explicit and cancellable. Native apps own their searches:
// Mail uses its authenticated API, Chat searches its unlocked local core.
import {REGISTRY} from './router.js';
const clean=(s,n=180)=>typeof s==='string'?s.replace(/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g,' ').trim().slice(0,n):'';
const id=/^[\w:.-]{1,200}$/;
export async function discover(F,{query,lease={},files,searchApp,openApp,runIntent}){
 const owner=F.session.view?.user?.id,owned=()=>!F.signal.aborted&&F.session.view?.user?.id===owner,live=()=>owned()&&!lease.signal?.aborted&&(!lease.current||lease.current());
 const q=clean(query,160);if(q.length<2||!live())return [];
 // A short additional debounce avoids sending account searches for each key.
 await new Promise(resolve=>setTimeout(resolve,180));if(!live())return [];
 const apps=['mail','chats','fitness','markets','weather'].filter(a=>F.session.apps?.[a]&&(a!=='mail'||F.session.view?.apps?.mail===true));
 const work=[files.searchAccount(q,{...lease,current:live}).then(values=>values.slice(0,8).map(file=>({title:file.name,sub:'Files · My Drive',icon:'files',run:()=>owned()&&files.open(file.name,{kind:'drive',folderId:file.kind==='folder'?file.id:file.parentId,view:'folder'})}))).catch(()=>[{title:'Search Files',sub:navigator.onLine===false?'Connect to search your Drive':'Open Files to retry',icon:'files',run:()=>owned()&&files.open(q)}])];
 for(const app of apps)work.push((async()=>{
  const answer=await searchApp(app,q,{...lease,current:live});if(!live())return [];
  const status=answer?.status;if(status!=='ready')return [{title:status==='locked'?'Unlock '+REGISTRY[app].name:status==='signin'?'Sign in to '+REGISTRY[app].name:'Open '+REGISTRY[app].name,sub:status==='loading'?'Still opening · retry this search':status==='error'?'Search could not finish':status==='locked'?'Unlock to search your private data':'Continue in the app',icon:app,run:()=>owned()&&openApp(app)}];
  return (answer.entries||[]).slice(0,6).filter(e=>e&&clean(e.title)&&(typeof e.path==='string'&&e.path.startsWith('/'+app+'/')&&!/[?\\\u0000-\u001f]/.test(e.path)||typeof e.intent==='string'&&/^[a-z][a-z-]{1,47}$/.test(e.intent)&&(!e.objectId||id.test(e.objectId)))).map(e=>({title:clean(e.title),sub:REGISTRY[app].name+' · '+clean(e.sub,140),icon:app,run:()=>owned()&&(e.path?openApp(app,e.path):runIntent(app,e.intent,e.objectId))}));
 })().catch(()=>live()?[{title:'Open '+REGISTRY[app].name,sub:'Search could not finish · retry in the app',icon:app,run:()=>owned()&&openApp(app)}]:[]));
 const result=await Promise.all(work);return live()?result.flat().slice(0,24):[];
}
