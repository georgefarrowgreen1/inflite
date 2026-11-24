import test from 'node:test';
import assert from 'node:assert/strict';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import * as store from '../today/src/atlas-store.js';
import {runAtlasScheduled,runAtlasTask,recoverAtlasRuns} from '../today/src/atlas-scheduler.js';

async function fixture(t,{owner='alice',enabled=true}={}){
  const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("fixture")}}',compatibilityDate:'2026-10-01',cf:false,d1Databases:['ATLAS_DB']}));
  t.after(()=>mf.dispose());
  const env={ATLAS_DB:await mf.getD1Database('ATLAS_DB'),ATLAS_AUTONOMY:'1'};
  await store.upgradeStorage(env);
  const task=await store.createTask(env,owner,{title:'Briefing',prompt:'Summarize research',mode:'research',interval_minutes:60});
  const now=Date.now();
  if(enabled){await store.updateTask(env,owner,task.id,{enabled:true,confirm:true});await env.ATLAS_DB.prepare('UPDATE atlas_schedules SET next_run=? WHERE owner=? AND id=?').bind(now-1000,owner,task.id).run();}
  return {env,task:await store.getTask(env,owner,task.id),now};
}
const answer={status:'completed',answer:'A scheduled answer',sources:[{url:'https://example.org/evidence',title:'Evidence'}]};

test('background work needs its master switch, verifier and owner-aware executor',async()=>{
  let touched=false;const env={ATLAS_AUTONOMY:'1',ATLAS_DB:{prepare(){touched=true;throw Error();}},OPENAI_API_KEY:'unused-worker-key',ATLAS_MODEL:'unused-model'};
  assert.deepEqual(await runAtlasScheduled(env,{verifyAdmin:async()=>true}),{ran:0,skipped:0});
  assert.deepEqual(await runAtlasScheduled({...env,ATLAS_AUTONOMY:'0'},{verifyAdmin:async()=>true,execute:async()=>answer}),{ran:0,skipped:0});
  assert.deepEqual(await runAtlasScheduled(env,{execute:async()=>answer}),{ran:0,skipped:0});
  assert.equal(touched,false);
});

test('due runs use owner-scoped execution, real ledger and a stable results conversation',async t=>{
  const {env,task,now}=await fixture(t);let checks=0,executions=0;
  const result=await runAtlasScheduled(env,{now,verifyAdmin:async owner=>{assert.equal(owner,'alice');checks++;return true;},execute:async spec=>{
    executions++;assert.equal(spec.owner,'alice');assert.equal(spec.task.conversation_id,task.conversation_id);assert.ok(spec.signal instanceof AbortSignal);
    await spec.beforeDispatch();
    await store.reserveRequest(env,spec.owner,{id:spec.requestId,operation:'schedule',model:'owner-selected-model',conversationId:spec.task.conversation_id});
    await store.markRequestDispatched(env,spec.owner,spec.requestId);
    await store.finishRequest(env,spec.owner,spec.requestId,{status:'completed',inputTokens:10,outputTokens:5,estimatedCostUsd:0.001});
    return {...answer,requestId:spec.requestId};
  }});
  assert.deepEqual(result,{ran:1,skipped:0});assert.equal(executions,1);assert.equal(checks,3);
  const runs=await store.taskRuns(env,'alice',task.id);assert.equal(runs.length,1);assert.equal(runs[0].status,'completed');assert.equal(runs[0].result,answer.answer);assert.deepEqual(runs[0].sources,answer.sources);assert.equal(runs[0].prompt_snapshot,task.prompt);
  const updated=await store.getTask(env,'alice',task.id);assert.equal(updated.lease_id,null);assert.ok(updated.next_run>now);assert.equal(updated.last_status,'completed');
  assert.equal((await store.usageSummary(env,'alice')).totals.requests,1);
});

test('concurrent sweeps claim a due occurrence exactly once',async t=>{
  const {env,task,now}=await fixture(t);let calls=0;
  const options={now,verifyAdmin:async()=>true,execute:async()=>{calls++;await new Promise(resolve=>setTimeout(resolve,30));return answer;}};
  const results=await Promise.all([runAtlasScheduled(env,options),runAtlasScheduled(env,options),runAtlasScheduled(env,options)]);
  assert.equal(calls,1);assert.equal(results.reduce((n,r)=>n+r.ran,0),1);assert.equal((await store.taskRuns(env,'alice',task.id)).length,1);
});

test('current administrator denial creates an explainable skipped run and pauses future work',async t=>{
  const {env,task,now}=await fixture(t);let called=false;
  assert.deepEqual(await runAtlasScheduled(env,{now,verifyAdmin:async()=>false,execute:async()=>{called=true;return answer;}}),{ran:0,skipped:1});
  assert.equal(called,false);const runs=await store.taskRuns(env,'alice',task.id);assert.equal(runs[0].status,'skipped');assert.equal(runs[0].error_code,'administrator_unavailable');
  assert.equal((await store.getTask(env,'alice',task.id)).enabled,false);assert.equal((await store.usageSummary(env,'alice')).totals.requests,0);
});

test('revocation and stop during preparation prevent provider dispatch',async t=>{
  for(const reason of ['revoked','stopped']){
    await t.test(reason,async tt=>{
      const {env,task,now}=await fixture(tt);let checks=0,dispatched=false;
      await runAtlasScheduled(env,{now,verifyAdmin:async()=>{checks++;return reason==='revoked'?checks<3:true;},execute:async spec=>{
        if(reason==='stopped')await store.stopTasks(env,'alice');
        await spec.beforeDispatch();dispatched=true;return answer;
      }});
      assert.equal(dispatched,false);const run=(await store.taskRuns(env,'alice',task.id))[0];assert.ok(['failed','cancelled'].includes(run.status));assert.equal((await store.usageSummary(env,'alice')).totals.requests,0);
    });
  }
});

test('stopping an in-flight task retains its partial result with cancelled status',async t=>{
  const {env,task,now}=await fixture(t);
  await runAtlasScheduled(env,{now,verifyAdmin:async()=>true,execute:async()=>{await store.stopTasks(env,'alice');return {status:'completed',answer:'Partial result',sources:answer.sources};}});
  const run=(await store.taskRuns(env,'alice',task.id))[0];assert.equal(run.status,'cancelled');assert.equal(run.result,'Partial result');assert.equal(run.error_code,'task_stopped');
  assert.equal((await store.getTask(env,'alice',task.id)).next_run,null);
});

test('interrupted leases are recorded as uncertain and never replayed',async t=>{
  const {env,task,now}=await fixture(t),requestId=crypto.randomUUID(),old=now-300000;
  await store.reserveRequest(env,'alice',{id:requestId,operation:'schedule',model:'fixture',conversationId:task.conversation_id});
  await store.markRequestDispatched(env,'alice',requestId);
  await store.createMessage(env,'alice',task.conversation_id,{id:requestId,prompt:task.prompt});
  await env.ATLAS_DB.batch([
    env.ATLAS_DB.prepare('UPDATE atlas_schedules SET lease_id=?,lease_until=? WHERE owner=? AND id=?').bind(requestId,old+180000,'alice',task.id),
    env.ATLAS_DB.prepare("INSERT INTO atlas_schedule_runs(owner,id,task_id,request_id,occurrence_key,scheduled_for,status,started_at) VALUES(?,?,?,?,?,?,'running',?)").bind('alice',requestId,task.id,requestId,'scheduled:'+task.next_run,task.next_run,old)
  ]);
  let calls=0;assert.deepEqual(await runAtlasScheduled(env,{now,verifyAdmin:async()=>true,execute:async()=>{calls++;return answer;}}),{ran:0,skipped:0});
  assert.equal(calls,0);const run=(await store.taskRuns(env,'alice',task.id))[0];assert.equal(run.status,'uncertain');assert.equal(run.error_code,'execution_interrupted');
  assert.equal((await store.getRequest(env,'alice',requestId)).status,'uncertain');assert.equal((await store.listMessages(env,'alice',task.conversation_id))[0].status,'uncertain');
  assert.ok((await store.getTask(env,'alice',task.id)).next_run>now);
});

test('explicit manual runs work with background disabled, remain paused and deduplicate retries',async t=>{
  const {env,task,now}=await fixture(t,{enabled:false});env.ATLAS_AUTONOMY='0';let calls=0;const requestId=crypto.randomUUID();
  const options={now,requestId,verifyAdmin:async()=>true,execute:async()=>{calls++;return answer;}};
  const result=await runAtlasTask(env,'alice',task.id,options);assert.equal(result.status,'completed');assert.equal(result.manual,true);
  const duplicate=await runAtlasTask(env,'alice',task.id,options);assert.equal(duplicate.duplicate,true);assert.equal(calls,1);
  const current=await store.getTask(env,'alice',task.id);assert.equal(current.enabled,false);assert.equal(current.next_run,null);
  await assert.rejects(()=>runAtlasTask(env,'bob',task.id,options),{code:'not_found'});
  const other=await store.createTask(env,'alice',{prompt:'Another task',mode:'research'});
  await assert.rejects(()=>runAtlasTask(env,'alice',other.id,options),{code:'request_id_reused'});
});

test('concurrent manual retries dispatch once and editing a paused task does not cancel its explicit run',async t=>{
  const {env,task,now}=await fixture(t,{enabled:false});let calls=0;const requestId=crypto.randomUUID();
  const options={now,requestId,verifyAdmin:async()=>true,execute:async spec=>{
    calls++;await store.updateTask(env,'alice',task.id,{title:'Renamed during a manual run'});await spec.beforeDispatch();return answer;
  }};
  const results=await Promise.all([runAtlasTask(env,'alice',task.id,options),runAtlasTask(env,'alice',task.id,options),runAtlasTask(env,'alice',task.id,options)]);
  assert.equal(calls,1);assert.equal(results.filter(r=>r.duplicate).length,2);assert.equal((await store.taskRuns(env,'alice',task.id))[0].status,'completed');assert.equal((await store.getTask(env,'alice',task.id)).enabled,false);
});

test('a stop committed while completion is being persisted cannot re-enable the schedule',async t=>{
  const {env,task,now}=await fixture(t),db=env.ATLAS_DB;let stopAtCommit=false;
  env.ATLAS_DB={prepare:sql=>db.prepare(sql),batch:async statements=>{
    if(stopAtCommit){stopAtCommit=false;await db.prepare('UPDATE atlas_schedules SET enabled=0,next_run=NULL WHERE owner=? AND id=?').bind('alice',task.id).run();}
    return db.batch(statements);
  }};
  await runAtlasScheduled(env,{now,verifyAdmin:async()=>true,execute:async()=>{stopAtCommit=true;return answer;}});
  const after=await store.getTask(env,'alice',task.id);assert.equal(after.enabled,false);assert.equal(after.next_run,null);assert.equal(after.lease_id,null);
});

test('expired recovery is owner-scoped and respects a lease renewed after its initial scan',async t=>{
  const {env,task,now}=await fixture(t),db=env.ATLAS_DB,requestId=crypto.randomUUID();
  await db.batch([
    db.prepare('UPDATE atlas_schedules SET lease_id=?,lease_until=? WHERE owner=? AND id=?').bind(requestId,now-1,'alice',task.id),
    db.prepare("INSERT INTO atlas_schedule_runs(owner,id,task_id,request_id,occurrence_key,status,started_at) VALUES(?,?,?,?,?,'running',?)").bind('alice',requestId,task.id,requestId,'scheduled:'+task.next_run,now-200000)
  ]);
  assert.deepEqual(await recoverAtlasRuns(env,{now,owner:'bob'}),{recovered:0});
  let renew=true;
  env.ATLAS_DB={prepare:sql=>db.prepare(sql),batch:async statements=>{
    if(renew){renew=false;await db.prepare('UPDATE atlas_schedules SET lease_until=? WHERE owner=? AND id=?').bind(now+180000,'alice',task.id).run();}
    return db.batch(statements);
  }};
  assert.deepEqual(await recoverAtlasRuns(env,{now,owner:'alice'}),{recovered:0});assert.equal((await store.taskRuns(env,'alice',task.id))[0].status,'running');assert.equal((await store.getTask(env,'alice',task.id)).lease_id,requestId);
});

test('failed and empty provider results remain failures and do not expose raw errors',async t=>{
  for(const scenario of ['exception','empty'])await t.test(scenario,async tt=>{
    const {env,task,now}=await fixture(tt);
    await runAtlasScheduled(env,{now,verifyAdmin:async()=>true,execute:async()=>{if(scenario==='exception')throw Error('private-key-and-upstream-body');return {status:'completed',answer:''};}});
    const runs=await store.taskRuns(env,'alice',task.id);assert.equal(runs[0].status,'failed');assert.equal(runs[0].error_code,scenario==='exception'?'execution_failed':'empty_response');assert.ok(!JSON.stringify(runs).includes('private-key'));
  });
});
