// Fixed private system capabilities. Captured owner is a precondition, never
// authority; the account service resolves its cookie before parsing any body.
import {forwardHeaders,todayOrigin,geoOf} from './account.js';
import {appFetch} from './apps.js';
import {bodyUpTo} from './body.js';
import {fetchUpstream} from './upstream.js';
const ROUTES=new Set(['GET actions','GET action','POST actions','PATCH action','DELETE action','POST search','GET focus','POST focus-dismiss','GET devices','DELETE device','POST device-remember','GET drafts','GET draft','PUT draft']);
const QUERY=new Set(['id','version','status','view','cursor','device','operation']);
const SAFE={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Cross-Origin-Resource-Policy':'same-origin','Referrer-Policy':'no-referrer','Content-Security-Policy':"sandbox; default-src 'none'; frame-ancestors 'none'"};
const json=(status,error)=>Response.json({error},{status,headers:SAFE});
export async function systemAPI(request,env){
 const u=new URL(request.url),action=u.pathname.slice('/api/system/'.length),read=request.method==='GET';
 if(!ROUTES.has(request.method+' '+action))return json(404,'That action was not found.');
 const site=request.headers.get('Sec-Fetch-Site'),origin=request.headers.get('Origin'),owner=request.headers.get('X-Inflite-Owner');
 if(site&&site!=='same-origin'||origin&&origin!==u.origin||!read&&(origin!==u.origin||request.headers.get('X-Inflite')!=='1'))return json(403,'That request did not come from InFlite.');
 if(!/^[\w-]{1,80}$/.test(owner||''))return json(401,'Your account changed. Refresh before continuing.');
 const query=new URLSearchParams();for(const[k,v]of u.searchParams){if(!QUERY.has(k)||query.has(k)||v.length>100||/[\u0000-\u001f\u007f]/.test(v))return json(400,'That request is invalid.');query.set(k,v)}
 const headers=forwardHeaders(request,todayOrigin(env,request),{accept:'application/json'});headers.set('X-Inflite-Owner',owner);
 const ip=request.headers.get('CF-Connecting-IP');if(env.HUB_KEY&&ip){headers.set('X-Hub-Key',env.HUB_KEY);headers.set('X-Hub-IP',ip);headers.set('X-Hub-Geo',geoOf(request.cf))}
 let body;if(!read){if(request.method!=='DELETE'&&request.headers.get('Content-Type')?.split(';')[0].trim()!=='application/json')return json(415,'Use a JSON request.');try{body=await bodyUpTo(request,action==='draft'?384*1024:8192)}catch(_){return json(400,'That request could not be read.')}if(body==null)return json(413,'That request is too large.');body||='{}';headers.set('Content-Type','application/json')}
 try{
 const response=await fetchUpstream((url,init)=>appFetch(env,url,init),`${env.ACCOUNT_ORIGIN}/api/account/today/system/${action}${query.size?'?'+query:''}`,{method:request.method,headers,body,redirect:'manual'},{signal:request.signal,timeout:20000});
 if(response.status>=300&&response.status<400||response.headers.get('Content-Type')?.split(';')[0].trim()!=='application/json'){response.body?.cancel().catch(()=>{});return json(502,'Your account could not be reached.')}
 const content=await bodyUpTo(response,512*1024,{signal:AbortSignal.any([request.signal,AbortSignal.timeout(20000)])});if(content==null)return json(502,'The account response was too large.');try{const value=JSON.parse(content);if(!value||typeof value!=='object'||Array.isArray(value))throw Error()}catch(_){return json(502,'The account response could not be read.')}
 return new Response(content,{status:response.status,headers:{...SAFE,'Content-Type':'application/json; charset=utf-8'}});
 }catch(_){return json(request.signal.aborted?499:502,'Your change could not finish. Try again when connected.')}
}
