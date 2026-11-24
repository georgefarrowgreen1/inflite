import {AtlasStoreError,getTask,nextTaskRun,storageStatus} from './atlas-store.js';

const LEASE_MS=180000;
const codeOf=error=>typeof error?.code==='string'&&/^[a-z][a-z0-9_]{0,95}$/.test(error.code)?error.code:'execution_failed';
const parse=(value,fallback)=>{try{return JSON.parse(value);}catch{return fallback;}};
const fail=(code,message,status=409)=>{throw new AtlasStoreError(code,message,status);};
const query=(env,sql,...args)=>env.ATLAS_DB.prepare(sql).bind(...args);
async function batch(env,commands){const results=await env.ATLAS_DB.batch(commands.map(([sql,...args])=>query(env,sql,...args)));if(results.some(r=>r?.success===false))fail('storage_unavailable','Atlas could not record the scheduled run.',503);return results;}
function sourceList(values){return (Array.isArray(values)?values:[]).slice(0,100).flatMap(source=>{try{const url=new URL(source.url);return url.protocol==='https:'&&!url.username&&!url.password?[{url:url.href,title:String(source.title||url.hostname).slice(0,500)}]:[];}catch{return [];}});}
const runRow=row=>row?{...row,sources:parse(row.sources_json,[]),manual:row.manual===1}:null;

async function claim(env,task,{manual,requestId,now}){
  const id=requestId||crypto.randomUUID(),key=manual?'manual:'+id:'scheduled:'+task.next_run;
  const existing=await query(env,'SELECT * FROM atlas_schedule_runs WHERE owner=? AND task_id=? AND occurrence_key=?',task.owner,task.id,key).first();
  if(existing)return {duplicate:true,run:runRow(existing)};
  if(manual&&await query(env,'SELECT id FROM atlas_schedule_runs WHERE owner=? AND id=? AND task_id<>?',task.owner,id,task.id).first())fail('request_id_reused','This run identifier belongs to another task.');
  const active=manual?'1=1':"s.enabled=1 AND s.next_run<=? AND EXISTS(SELECT 1 FROM atlas_controls c WHERE c.owner=s.owner AND c.stopped=0)";
  const args=[task.owner,id,task.id,id,key,manual?now:task.next_run,now,task.prompt,Number(manual),task.owner,task.id,...(manual?[]:[now])];
  const writes=await batch(env,[
    ["INSERT OR IGNORE INTO atlas_schedule_runs(owner,id,task_id,request_id,occurrence_key,scheduled_for,status,started_at,prompt_snapshot,manual) SELECT ?,?,?,?,?,?,'queued',?,?,? FROM atlas_schedules s WHERE s.owner=? AND s.id=? AND s.lease_id IS NULL AND "+active,...args],
    ["UPDATE atlas_schedules SET lease_id=?,lease_until=?,updated_at=? WHERE owner=? AND id=? AND lease_id IS NULL AND EXISTS(SELECT 1 FROM atlas_schedule_runs r WHERE r.owner=? AND r.id=? AND r.task_id=atlas_schedules.id AND r.status='queued')",id,now+LEASE_MS,now,task.owner,task.id,task.owner,id]
  ]);
  const own=await query(env,'SELECT lease_id FROM atlas_schedules WHERE owner=? AND id=? AND lease_id=?',task.owner,task.id,id).first();
  if(!own||writes[0]?.meta?.changes!==1){
    const duplicate=await query(env,'SELECT * FROM atlas_schedule_runs WHERE owner=? AND task_id=? AND occurrence_key=?',task.owner,task.id,key).first();
    if(duplicate)return {duplicate:true,run:runRow(duplicate)};
    if(manual)fail('task_running','This task already has an active run.');
    return null;
  }
  return {duplicate:false,run:runRow(await query(env,'SELECT * FROM atlas_schedule_runs WHERE owner=? AND id=?',task.owner,id).first())};
}

async function checkActive(env,task,run,manual,now=Date.now()){
  const current=await query(env,'SELECT s.enabled,s.lease_id,s.lease_until,r.cancel_requested,r.status FROM atlas_schedules s JOIN atlas_schedule_runs r ON r.owner=s.owner AND r.task_id=s.id AND r.id=? WHERE s.owner=? AND s.id=?',run.id,task.owner,task.id).first();
  if(!current||current.lease_id!==run.id||current.lease_until<=now||!['queued','running'].includes(current.status)||current.cancel_requested||(!manual&&!current.enabled))return false;
  if(!manual){const control=await query(env,'SELECT stopped FROM atlas_controls WHERE owner=?',task.owner).first();if(control?.stopped!==0)return false;}
  return true;
}

async function finish(env,task,run,{status,result=null,sources=[],errorCode=null,now,manual,pause=false}){
  const current=await getTask(env,task.owner,task.id);
  const enabled=current?.enabled&&!pause;
  const next=enabled?(manual?current.next_run:nextTaskRun(current,now)):null;
  await batch(env,[
    ["UPDATE atlas_schedule_runs SET status=?,result=?,sources_json=?,error_code=?,finished_at=? WHERE owner=? AND id=? AND status IN ('queued','running') AND EXISTS(SELECT 1 FROM atlas_schedules s WHERE s.owner=? AND s.id=? AND s.lease_id=?)",status,typeof result==='string'?result.slice(0,240000):null,JSON.stringify(sourceList(sources)),errorCode,now,task.owner,run.id,task.owner,task.id,run.id],
    // A stop, pause or reschedule between the preceding read and this commit
    // must win. Completing a request never enables a task or restores its old
    // next occurrence after the user changed it.
    ["UPDATE atlas_schedules SET lease_id=NULL,lease_until=NULL,enabled=CASE WHEN ?=1 THEN 0 ELSE enabled END,next_run=CASE WHEN enabled=0 OR ?=1 THEN NULL WHEN ?=1 THEN next_run WHEN next_run IS ? THEN ? ELSE next_run END,updated_at=? WHERE owner=? AND id=? AND lease_id=?",Number(pause),Number(pause),Number(manual),task.next_run,next,now,task.owner,task.id,run.id]
  ]);
  return runRow(await query(env,'SELECT * FROM atlas_schedule_runs WHERE owner=? AND id=?',task.owner,run.id).first());
}

async function executeClaim(env,task,claimResult,{manual,verifyAdmin,execute,now}){
  if(claimResult.duplicate)return {...claimResult.run,duplicate:true};
  const run=claimResult.run,controller=new AbortController(),started=Date.now();
  const clock=()=>now+Math.max(0,Date.now()-started);
  const access=async()=>{
    if(typeof verifyAdmin!=='function')return manual?true:null;
    try{const value=await verifyAdmin(task.owner);return typeof value==='boolean'?value:null;}catch{return null;}
  };
  const allowed=await access();
  if(allowed!==true)return finish(env,task,run,{status:'skipped',errorCode:allowed===false?'administrator_unavailable':'account_unavailable',now:clock(),manual,pause:allowed===false&&!manual});
  if(!await checkActive(env,task,run,manual,clock()))return finish(env,task,run,{status:'cancelled',errorCode:'task_stopped',now:clock(),manual});
  await query(env,"UPDATE atlas_schedule_runs SET status='running' WHERE owner=? AND id=? AND status='queued'",task.owner,run.id).run();
  let checking=false,nextHeartbeat=clock()+30000;
  const timer=setInterval(async()=>{
    if(checking||controller.signal.aborted)return;checking=true;
    try{
      if(!await checkActive(env,task,run,manual,clock()))controller.abort(new DOMException('Task stopped','AbortError'));
      else if(clock()>=nextHeartbeat){
        await query(env,"UPDATE atlas_schedules SET lease_until=? WHERE owner=? AND id=? AND lease_id=? AND EXISTS(SELECT 1 FROM atlas_schedule_runs r WHERE r.owner=? AND r.id=? AND r.status='running')",clock()+LEASE_MS,task.owner,task.id,run.id,task.owner,run.id).run();
        nextHeartbeat=clock()+30000;
      }
    }
    catch{controller.abort(new DOMException('Task state unavailable','AbortError'));}
    finally{checking=false;}
  },1500);
  const beforeDispatch=async()=>{
    if(controller.signal.aborted||!await checkActive(env,task,run,manual,clock()))fail('task_stopped','This task was stopped.');
    const verified=await access();
    if(verified===false)fail('administrator_unavailable','Administrator access is no longer available.',403);
    if(verified!==true)fail('account_unavailable','InFlite could not check the account right now. The recurring task remains enabled.',503);
  };
  try{
    await beforeDispatch();
    const result=await execute({owner:task.owner,task,requestId:run.request_id,signal:controller.signal,beforeDispatch});
    const active=await checkActive(env,task,run,manual,clock());
    if(!active||controller.signal.aborted)return finish(env,task,run,{status:'cancelled',result:result?.answer,sources:result?.sources,errorCode:'task_stopped',now:clock(),manual});
    const answer=typeof result?.answer==='string'?result.answer:'';
    let status=['completed','incomplete','cancelled','failed','uncertain'].includes(result?.status)?result.status:'failed';
    let errorCode=result?.errorCode?codeOf({code:result.errorCode}):null;
    if(status==='completed'&&!answer.trim()){status='failed';errorCode='empty_response';}
    return finish(env,task,run,{status,result:answer,sources:result?.sources,errorCode,now:clock(),manual});
  }catch(error){
    const stopped=controller.signal.aborted||error?.code==='task_stopped'||error?.code==='request_cancelled';
    return finish(env,task,run,{status:stopped?'cancelled':'failed',errorCode:stopped?'task_stopped':codeOf(error),now:clock(),manual,pause:error?.code==='administrator_unavailable'&&!manual});
  }finally{clearInterval(timer);}
}

// Interrupted leases are recorded as uncertain and are never replayed. The next
// normal occurrence is scheduled; the user may explicitly request a new run.
export async function recoverAtlasRuns(env,{now=Date.now(),limit=20,owner=null}={}){
  const count=Number.isInteger(limit)?Math.min(50,Math.max(1,limit)):20;
  const {results=[]}=await query(env,'SELECT * FROM atlas_schedules WHERE lease_id IS NOT NULL AND lease_until<=?'+(owner?' AND owner=?':'')+' ORDER BY lease_until LIMIT ?',now,...(owner?[owner]:[]),count).all();
  let recovered=0;
  for(const raw of results){
    const task={...raw,weekdays:parse(raw.weekdays_json,[])},run=await query(env,'SELECT * FROM atlas_schedule_runs WHERE owner=? AND id=?',task.owner,task.lease_id).first();
    if(!run)continue;
    const next=task.enabled?(run.manual?task.next_run:nextTaskRun(task,now)):null;
    const interrupted="EXISTS(SELECT 1 FROM atlas_schedule_runs r WHERE r.owner=? AND r.id=? AND r.status='uncertain' AND r.error_code='execution_interrupted' AND r.finished_at=?)";
    const writes=await batch(env,[
      ["UPDATE atlas_schedule_runs SET status='uncertain',error_code='execution_interrupted',finished_at=? WHERE owner=? AND id=? AND status IN ('queued','running') AND EXISTS(SELECT 1 FROM atlas_schedules s WHERE s.owner=? AND s.id=? AND s.lease_id=? AND s.lease_until<=?)",now,task.owner,run.id,task.owner,task.id,run.id,now],
      ["UPDATE atlas_requests SET status=CASE WHEN dispatched=1 THEN 'uncertain' ELSE 'failed' END,error_code='execution_interrupted',finished_at=? WHERE owner=? AND id=? AND status IN ('pending','running') AND "+interrupted,now,task.owner,run.request_id,task.owner,run.id,now],
      ["UPDATE atlas_turns SET status='uncertain',error_code='execution_interrupted',updated_at=? WHERE owner=? AND id=? AND status='running' AND "+interrupted,now,task.owner,run.request_id,task.owner,run.id,now],
      ["UPDATE atlas_schedules SET lease_id=NULL,lease_until=NULL,next_run=CASE WHEN enabled=0 THEN NULL WHEN ?=1 THEN next_run WHEN next_run IS ? THEN ? ELSE next_run END,updated_at=? WHERE owner=? AND id=? AND lease_id=? AND lease_until<=? AND "+interrupted,Number(!!run.manual),task.next_run,next,now,task.owner,task.id,run.id,now,task.owner,run.id,now]
    ]);
    if(writes[0]?.meta?.changes===1)recovered++;
  }
  return {recovered};
}

export async function runAtlasTask(env,owner,id,{execute,verifyAdmin,requestId=crypto.randomUUID(),now=Date.now()}={}){
  if(typeof execute!=='function')fail('scheduler_executor_missing','Atlas task execution is not configured.',503);
  if(typeof requestId!=='string'||!/^[A-Za-z0-9._:-]{1,600}$/.test(requestId))fail('invalid_request','Invalid run identifier.',400);
  const task=await getTask(env,owner,id);if(!task)fail('not_found','This Atlas task is unavailable.',404);
  await recoverAtlasRuns(env,{now,owner});
  const result=await claim(env,task,{manual:true,requestId,now});
  return executeClaim(env,task,result,{manual:true,verifyAdmin,execute,now});
}

export async function runAtlasScheduled(env,{verifyAdmin,execute,now=Date.now(),limit=3}={}){
  if(env?.ATLAS_AUTONOMY!=='1'||!env?.ATLAS_DB||typeof verifyAdmin!=='function'||typeof execute!=='function')return {ran:0,skipped:0};
  if(!(await storageStatus(env)).ready)return {ran:0,skipped:0,code:'storage_upgrade_required'};
  await recoverAtlasRuns(env,{now});
  const count=Number.isInteger(limit)?Math.min(10,Math.max(1,limit)):3;
  const {results=[]}=await query(env,'SELECT s.owner,s.id FROM atlas_schedules s JOIN atlas_controls c ON c.owner=s.owner AND c.stopped=0 WHERE s.enabled=1 AND s.next_run<=? AND s.lease_id IS NULL ORDER BY s.next_run,s.id LIMIT ?',now,count).all();
  let ran=0,skipped=0;
  for(const item of results){
    const task=await getTask(env,item.owner,item.id);if(!task)continue;
    const result=await claim(env,task,{manual:false,now});if(!result||result.duplicate)continue;
    const final=await executeClaim(env,task,result,{manual:false,verifyAdmin,execute,now});
    if(final.status==='skipped')skipped++;else ran++;
  }
  return {ran,skipped};
}
