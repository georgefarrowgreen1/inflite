// Security Module is a fixed private capability, never an arbitrary proxy.
import {systemAPI} from './system.js';
export const SECURITY_METHODS=new Set(['GET summary','GET permissions','PUT permission','POST authorise','POST confirmation','POST sessions/revoke','POST file-transfer']);
export function securityAPI(request,env){return systemAPI(request,env,{prefix:'/api/security/',upstream:'today/security/',routes:SECURITY_METHODS,query:new Set(),maxBody:2048,security:true});}
