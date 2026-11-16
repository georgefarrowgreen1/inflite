// First-party app documents use the same account shell and CSP as Today.
import {roofPage,roofOn} from './roof.js';
import {systemAPI} from './system.js';
export function organisePage(request,env){
 const u=new URL(request.url),m=/^\/(calendar|notes|people)(.*)$/.exec(u.pathname);
 if(!m||!['GET','HEAD'].includes(request.method))return new Response('Not found',{status:404});
 if(!roofOn(env,m[1]))return new Response('App unavailable',{status:503});
 if(!m[2])return new Response(null,{status:308,headers:{Location:'/'+m[1]+'/'+u.search,'Cache-Control':'no-store'}});
 if(m[2]==='/'||m[2]==='/index.html')return roofPage(request,env);
 if(m[2]==='/version')return Response.json({app:m[1],v:'4.02',build:'4.02'},{headers:{'Cache-Control':'no-store'}});
 return env.ASSETS.fetch(request);
}
// Reuse the bounded private transport, with a fixed, disjoint capability set.
export function organiseAPI(request,env){return systemAPI(request,env,{prefix:'/api/organise/',upstream:'today/organise/',routes:new Set(['POST list','GET record','PUT record']),query:new Set(['id','kind']),maxBody:512*1024});}
