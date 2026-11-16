// Owner-fenced private JSON. This module contains no app content or global cache.
export const operationId=()=>crypto.randomUUID().replace(/-/g,'');
export function createSystemClient(F){
 const owner=F.session.view?.user?.id;
 const live=()=>!F.signal.aborted&&F.session.view?.user?.id===owner;
 const check=lease=>{if(!live()||lease?.signal?.aborted||lease?.current&&lease.current()===false)throw new DOMException('This account was released','AbortError')};
 async function request(action,{method='GET',body,query,...lease}={}){
  check(lease);const params=new URLSearchParams();for(const[k,v]of Object.entries(query||{}))if(v!=null&&v!=='')params.set(k,String(v));
  const signal=AbortSignal.any([F.signal,...(lease.signal?[lease.signal]:[]),AbortSignal.timeout(12000)]);
  const response=await fetch('/api/system/'+action+(params.size?'?'+params:''),{method,signal,credentials:'same-origin',mode:'same-origin',redirect:'error',cache:'no-store',headers:{'X-Inflite-Owner':owner,...(method==='GET'?{}:{'X-Inflite':'1','Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)})});check(lease);if(response.status===401)Promise.resolve(F.session.lost?.()).catch(()=>{});
  const reader=response.body?.getReader(),chunks=[];let n=0;
  if(reader)try{for(;;){const part=await reader.read();check(lease);if(part.done)break;n+=part.value.byteLength;if(n>512*1024)throw Error('The account response was too large.');chunks.push(part.value)}}catch(error){await reader.cancel().catch(()=>{});throw error}finally{reader.releaseLock()}
  const content=await new Blob(chunks).text();check(lease);let value;try{value=JSON.parse(content)}catch(_){throw Error('The account response could not be read.')}
  if(!response.ok){const error=Error(typeof value.error==='string'?value.error:'That change did not finish.');error.status=response.status;throw error}return value;
 }
 return {request,live,owner};
}
