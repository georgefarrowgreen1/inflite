import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import * as store from '../today/src/atlas-store.js';

async function fixture(t,{upgrade=true}={}){
  const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("fixture")}}',compatibilityDate:'2026-10-01',cf:false,d1Databases:['ATLAS_DB']}));
  t.after(()=>mf.dispose());
  const env={ATLAS_DB:await mf.getD1Database('ATLAS_DB')};
  if(upgrade)await store.upgradeStorage(env);
  return env;
}
const id=()=>crypto.randomUUID();
async function addMessage(env,owner,conversationId,{answer='A sourced answer',sources=[]}={}){
  const messageId=id();await store.createMessage(env,owner,conversationId,{id:messageId,prompt:'A question'});
  return store.finishMessage(env,owner,messageId,{answer,status:'completed',sources});
}

test('real D1 migration creates fresh storage and matches the checked-in migrations',async t=>{
  const sql=(await Promise.all(Array.from({length:6},(_,i)=>readFile(new URL('../atlas/migrations/'+String(i+1).padStart(4,'0')+'.sql',import.meta.url),'utf8')))).join('\n');
  assert.equal(store.SCHEMA_SQL,sql);
  const env=await fixture(t,{upgrade:false});assert.equal((await store.storageStatus(env)).ready,false);
  assert.deepEqual(await store.upgradeStorage(env),{ready:true,schemaVersion:6,requiredVersion:6});
  assert.deepEqual(await store.upgradeStorage(env),{ready:true,schemaVersion:6,requiredVersion:6});
  assert.equal((await store.storageStatus({})).code,'storage_missing');
});

test('legacy import is idempotent, leaves original records intact and never reactivates old schedules',async t=>{
  const env=await fixture(t,{upgrade:false}),db=env.ATLAS_DB;
  const old=(await Promise.all(Array.from({length:5},(_,i)=>readFile(new URL('../atlas/migrations/'+String(i+1).padStart(4,'0')+'.sql',import.meta.url),'utf8')))).join('\n');
  await db.batch(old.split(';').map(s=>s.trim()).filter(Boolean).map(s=>db.prepare(s)));
  await db.batch([
    db.prepare("INSERT INTO atlas_messages(owner,mode,prompt,answer,created_at) VALUES('alice','research','Old question','Old answer',100)"),
    db.prepare("INSERT INTO atlas_messages(owner,mode,prompt,answer,created_at) VALUES('bob','research','Another owner question','Another owner answer',100)"),
    db.prepare("INSERT INTO atlas_tasks(id,owner,prompt,interval_minutes,enabled,next_run,created_at) VALUES('old-task','alice','Old task',60,1,200,100)"),
    db.prepare("INSERT INTO atlas_controls(owner,stopped) VALUES('alice',0)"),
    db.prepare("INSERT INTO atlas_task_runs(id,task_id,owner,started_at,status) VALUES('old-run','old-task','alice',150,'running')")
  ]);
  await store.upgradeStorage(env);await store.upgradeStorage(env);
  const conversations=await store.listConversations(env,'alice');assert.equal(conversations.length,2);
  const imported=conversations.find(c=>c.title==='Imported research history');
  assert.equal((await store.listMessages(env,'alice',imported.id)).length,1);
  const task=await store.getTask(env,'alice','old-task');assert.equal(task.enabled,false);assert.equal(task.next_run,null);
  assert.equal((await store.taskRuns(env,'alice',task.id))[0].status,'uncertain');
  assert.equal((await db.prepare('SELECT enabled FROM atlas_tasks WHERE id=?').bind('old-task').first()).enabled,1);
  assert.equal((await db.prepare("SELECT COUNT(*) AS count FROM atlas_messages WHERE owner='alice'").first()).count,1);
  await store.deleteConversation(env,'alice',imported.id);await store.upgradeStorage(env);
  assert.equal(await store.getConversation(env,'alice',imported.id),null);
  assert.equal((await db.prepare("SELECT COUNT(*) AS count FROM atlas_messages WHERE owner='alice'").first()).count,0);
  assert.equal((await db.prepare("SELECT COUNT(*) AS count FROM atlas_messages WHERE owner='bob'").first()).count,1);
  assert.equal((await db.prepare("SELECT COUNT(*) AS count FROM atlas_imports WHERE owner='alice' AND kind='message'").first()).count,1);
});

test('conversations isolate owners and threads, preserve citations, export snapshots and delete owned data',async t=>{
  const env=await fixture(t),a=await store.createConversation(env,'alice',{title:'Research A',mode:'research'}),b=await store.createConversation(env,'alice',{title:'Research B',mode:'research'});
  const msg=await addMessage(env,'alice',a.id,{sources:[{url:'https://example.org/source',title:'Evidence',start_index:0,end_index:3},{url:'javascript:alert(1)',title:'Unsafe'}]});
  assert.equal((await store.listMessages(env,'alice',b.id)).length,0);
  assert.equal(await store.getConversation(env,'bob',a.id),null);
  await assert.rejects(()=>store.listMessages(env,'bob',a.id),{code:'not_found'});
  await assert.rejects(()=>store.createMessage(env,'bob',a.id,{id:id(),prompt:'foreign'}),{code:'not_found'});
  await assert.rejects(()=>store.createConversation(env,'alice',{mode:'research',repository:'owner/project'}),{code:'invalid_repository'});
  await assert.rejects(()=>store.updateConversation(env,'alice',a.id,{mode:'developer'}),{code:'conversation_context_fixed'});
  assert.deepEqual(msg.sources,[{url:'https://example.org/source',title:'Evidence',start_index:0,end_index:3}]);
  const brief=await store.createBrief(env,'alice',{conversationId:a.id,messageId:msg.id,title:'Saved research'});
  assert.equal((await store.getBrief(env,'alice',brief.id)).answer,msg.answer);
  assert.deepEqual((await store.getBrief(env,'alice',brief.id)).sources,msg.sources);
  assert.equal(await store.getBrief(env,'bob',brief.id),null);
  await store.setConversationSummary(env,'alice',a.id,{summary:'Earlier discussion',throughId:msg.id});
  assert.equal((await store.getConversation(env,'alice',a.id)).summary_through_id,msg.id);
  await assert.rejects(()=>store.setConversationSummary(env,'alice',b.id,{summary:'wrong thread',throughId:msg.id}),{code:'not_found'});
  await store.updateConversation(env,'alice',a.id,{title:'Renamed',archived:true});
  assert.equal((await store.listConversations(env,'alice')).length,1);
  await assert.rejects(()=>store.createMessage(env,'alice',a.id,{id:id(),prompt:'archived'}),{code:'conversation_archived'});
  await store.deleteConversation(env,'alice',a.id);
  assert.equal(await store.getBrief(env,'alice',brief.id),null);
  assert.equal((await store.listConversations(env,'alice')).length,1);
});

test('history pagination and exports preserve every turn past 1000 without crossing conversations',async t=>{
  const env=await fixture(t),c=await store.createConversation(env,'alice',{mode:'research'}),other=await store.createConversation(env,'alice',{mode:'research'}),db=env.ATLAS_DB;
  await db.prepare("WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM n WHERE x<1205) INSERT INTO atlas_turns(owner,id,conversation_id,prompt,answer,status,created_at,updated_at) SELECT 'alice','turn-'||printf('%05d',x),?,'Question '||x,'Answer '||x,'completed',CAST(x/3 AS INTEGER),CAST(x/3 AS INTEGER) FROM n").bind(c.id).run();
  const foreign=await addMessage(env,'alice',other.id);
  await assert.rejects(()=>store.getMessagePage(env,'alice',c.id,{beforeId:foreign.id}),{code:'not_found'});
  await assert.rejects(()=>store.getMessagePage(env,'bob',c.id),{code:'not_found'});
  const latest=await store.getMessagePage(env,'alice',c.id,{limit:400});assert.equal(latest.messages.length,400);assert.equal(latest.hasMore,true);assert.equal(latest.messages[399].id,'turn-01205');
  const middle=await store.getMessagePage(env,'alice',c.id,{limit:400,beforeId:latest.nextBeforeId}),oldest=await store.getMessagePage(env,'alice',c.id,{limit:400,beforeId:middle.nextBeforeId}),first=await store.getMessagePage(env,'alice',c.id,{limit:400,beforeId:oldest.nextBeforeId});
  assert.equal(first.messages.length,5);assert.equal(first.hasMore,false);assert.equal(first.nextBeforeId,null);
  assert.equal(new Set([...latest.messages,...middle.messages,...oldest.messages,...first.messages].map(m=>m.id)).size,1205);
  const exported=[];
  for await(const message of store.iterateMessages(env,'alice',c.id,{pageSize:137}))exported.push(message);
  assert.equal(exported.length,1205);assert.equal(exported[0].id,'turn-00001');assert.equal(exported[1204].answer,'Answer 1205');
});

test('incomplete and interrupted answers are explicit and cannot become successful empty briefs',async t=>{
  const env=await fixture(t),c=await store.createConversation(env,'alice',{mode:'research'}),messageId=id();
  await store.createMessage(env,'alice',c.id,{id:messageId,prompt:'Question'});
  const result=await store.finishMessage(env,'alice',messageId,{status:'completed',answer:''});
  assert.equal(result.status,'incomplete');assert.equal(result.error_code,'empty_response');
  await assert.rejects(()=>store.createBrief(env,'alice',{conversationId:c.id,messageId}),{code:'brief_incomplete'});
  const final=await store.finishMessage(env,'alice',messageId,{status:'completed',answer:'late replacement'});
  assert.equal(final.answer,'');assert.equal(final.status,'incomplete');
});

test('memory settings are explicit and owner-scoped with validated allowances and timezones',async t=>{
  const env=await fixture(t);assert.equal((await store.getSettings(env,'alice')).memoryEnabled,false);
  await store.saveSettings(env,'alice',{memoryEnabled:true,memory:'Use concise answers.',dailyRequestLimit:12,dailyBudgetUsd:0.5,timezone:'Europe/London'});
  assert.equal((await store.getSettings(env,'alice')).memory,'Use concise answers.');
  assert.equal((await store.getSettings(env,'bob')).memory,'');
  await store.saveSettings(env,'alice',{memoryEnabled:false,memory:''});
  assert.equal((await store.getSettings(env,'alice')).memoryEnabled,false);
  await assert.rejects(()=>store.saveSettings(env,'alice',{dailyRequestLimit:101}),{code:'invalid_request'});
  await assert.rejects(()=>store.saveSettings(env,'alice',{timezone:'No/Such_Timezone'}),{code:'invalid_timezone'});
});

test('atomic request reservations enforce concurrency, deduplicate retries and retain legacy usage',async t=>{
  const env=await fixture(t);await store.saveSettings(env,'alice',{dailyRequestLimit:3});
  const attempts=await Promise.allSettled(Array.from({length:12},()=>store.reserveRequest(env,'alice',{id:id(),operation:'chat',model:'fixture-model'})));
  assert.equal(attempts.filter(r=>r.status==='fulfilled').length,3);
  assert.equal(attempts.filter(r=>r.status==='rejected'&&r.reason.code==='daily_request_limit').length,9);
  const first=attempts.find(r=>r.status==='fulfilled').value.request;
  assert.equal((await store.reserveRequest(env,'alice',{id:first.id,operation:'chat',model:'fixture-model'})).duplicate,true);
  await assert.rejects(()=>store.reserveRequest(env,'alice',{id:first.id,operation:'provider_test',model:'fixture-model'}),{code:'request_id_reused'});
  await store.finishRequest(env,'alice',first.id,{status:'failed',errorCode:'context_unavailable'});
  const replacement=await store.reserveRequest(env,'alice',{id:id(),operation:'chat',model:'fixture-model'});assert.equal(replacement.duplicate,false);
  assert.equal((await store.usageSummary(env,'alice')).totals.requests,3);
  const day=new Date().toISOString().slice(0,10);
  await env.ATLAS_DB.prepare('INSERT INTO atlas_usage(owner,day,requests) VALUES(?,?,?)').bind('bob',day,19).run();
  await store.reserveRequest(env,'bob',{id:id(),operation:'chat',model:'fixture-model'});
  await assert.rejects(()=>store.reserveRequest(env,'bob',{id:id(),operation:'chat',model:'fixture-model'}),{code:'daily_request_limit'});
});

test('dispatch is single-use, cancellation is owner-scoped and estimates include concurrent reservations',async t=>{
  const env=await fixture(t);await store.saveSettings(env,'alice',{dailyBudgetUsd:0.05});
  const rid=id();await store.reserveRequest(env,'alice',{id:rid,operation:'chat',model:'fixture',estimatedCostUsd:0.04});
  await assert.rejects(()=>store.reserveRequest(env,'alice',{id:id(),operation:'chat',model:'fixture',estimatedCostUsd:0.04}),{code:'daily_budget_limit'});
  assert.equal(await store.getRequest(env,'bob',rid),null);
  assert.equal((await store.cancelRequest(env,'bob',rid)).status,'cancelled');
  assert.equal((await store.getRequest(env,'alice',rid)).cancel_requested,0);
  const dispatches=await Promise.allSettled([store.markRequestDispatched(env,'alice',rid),store.markRequestDispatched(env,'alice',rid)]);
  assert.equal(dispatches.filter(r=>r.status==='fulfilled').length,1);
  await store.finishRequest(env,'alice',rid,{status:'completed',inputTokens:100,outputTokens:50,cachedTokens:0,webSearchCalls:0,estimatedCostUsd:0.02,durationMs:120});
  const next=id();await store.reserveRequest(env,'alice',{id:next,operation:'chat',model:'fixture',estimatedCostUsd:0.03});
  await store.cancelRequest(env,'alice',next);
  await assert.rejects(()=>store.markRequestDispatched(env,'alice',next),{code:'request_cancelled'});
  const usage=await store.usageSummary(env,'alice');assert.equal(usage.totals.requests,1);assert.equal(usage.totals.inputTokens,100);assert.equal(usage.totals.estimatedCostUsd,0.02);assert.equal(usage.budgetIsEstimate,true);
});

test('model rounds extend one reservation before and after dispatch without double-counting or releasing it',async t=>{
  const env=await fixture(t),requestId=id();
  await store.saveSettings(env,'alice',{dailyBudgetUsd:1,dailyRequestLimit:1});
  await store.reserveRequest(env,'alice',{id:requestId,operation:'chat',model:'fixture',estimatedCostUsd:0.1});
  const pending=await store.extendRequestReservation(env,'alice',requestId,0.6);
  assert.equal(pending.status,'pending');assert.equal(pending.dispatched,0);assert.equal(pending.reserved_cost_usd,0.6);
  await store.markRequestDispatched(env,'alice',requestId);
  const running=await store.extendRequestReservation(env,'alice',requestId,0.9);
  assert.equal(running.status,'running');assert.equal(running.dispatched,1);assert.equal(running.reserved_cost_usd,0.9);
  assert.equal((await store.extendRequestReservation(env,'alice',requestId,0.4)).reserved_cost_usd,0.9);
  const usage=await store.usageSummary(env,'alice');assert.equal(usage.totals.requests,1);assert.equal(usage.requests.length,1);
  await assert.rejects(()=>store.reserveRequest(env,'alice',{id:id(),operation:'chat',model:'fixture'}),{code:'daily_request_limit'});
  await store.saveSettings(env,'alice',{dailyBudgetUsd:0.5});
  await assert.rejects(()=>store.extendRequestReservation(env,'alice',requestId,0.4),{code:'daily_budget_limit'});
  assert.equal((await store.getRequest(env,'alice',requestId)).reserved_cost_usd,0.9);
});

test('concurrent model continuations cannot reserve the same remaining daily budget',async t=>{
  const env=await fixture(t),requests=[id(),id()];
  await store.saveSettings(env,'alice',{dailyBudgetUsd:10});
  for(const requestId of requests){
    await store.reserveRequest(env,'alice',{id:requestId,operation:'chat',model:'fixture',estimatedCostUsd:2});
    await store.markRequestDispatched(env,'alice',requestId);
  }
  await store.reserveRequest(env,'bob',{id:id(),operation:'chat',model:'fixture',estimatedCostUsd:100});
  const outcomes=await Promise.allSettled(requests.map(requestId=>store.extendRequestReservation(env,'alice',requestId,7)));
  assert.equal(outcomes.filter(outcome=>outcome.status==='fulfilled').length,1);
  assert.equal(outcomes.filter(outcome=>outcome.status==='rejected'&&outcome.reason.code==='daily_budget_limit').length,1);
  const rows=await Promise.all(requests.map(requestId=>store.getRequest(env,'alice',requestId)));
  assert.equal(rows.reduce((sum,row)=>sum+row.reserved_cost_usd,0),9);
  assert.equal((await store.usageSummary(env,'alice')).totals.requests,2);
});

test('reservation extensions use settled charges and reject foreign, cancelled and finished requests',async t=>{
  const env=await fixture(t),settled=id(),active=id();
  await store.saveSettings(env,'alice',{dailyBudgetUsd:10});
  await store.reserveRequest(env,'alice',{id:settled,operation:'chat',model:'fixture',estimatedCostUsd:8});
  await store.markRequestDispatched(env,'alice',settled);
  await store.finishRequest(env,'alice',settled,{status:'completed',estimatedCostUsd:2});
  await store.reserveRequest(env,'alice',{id:active,operation:'chat',model:'fixture',estimatedCostUsd:1});
  assert.equal((await store.extendRequestReservation(env,'alice',active,8)).reserved_cost_usd,8);
  await assert.rejects(()=>store.extendRequestReservation(env,'alice',active,9),{code:'daily_budget_limit'});
  await assert.rejects(()=>store.extendRequestReservation(env,'bob',active,1),{code:'not_found'});
  await assert.rejects(()=>store.extendRequestReservation(env,'alice',settled,3),{code:'request_not_active'});
  await assert.rejects(()=>store.extendRequestReservation(env,'alice',active,-1),{code:'invalid_request'});
  await store.markRequestDispatched(env,'alice',active);await store.cancelRequest(env,'alice',active);
  await assert.rejects(()=>store.extendRequestReservation(env,'alice',active,8),{code:'request_cancelled'});
  assert.equal((await store.getRequest(env,'alice',active)).reserved_cost_usd,8);
});

test('dispatched requests with missing usage retain budget for later admissions and model rounds',async t=>{
  const env=await fixture(t);
  for(const status of ['uncertain','cancelled']){
    const owner='owner-'+status,unknown=id(),active=id();
    await store.saveSettings(env,owner,{dailyBudgetUsd:10});
    await store.reserveRequest(env,owner,{id:unknown,operation:'chat',model:'fixture',estimatedCostUsd:6});
    await store.markRequestDispatched(env,owner,unknown);
    await store.finishRequest(env,owner,unknown,{status,estimatedCostUsd:null,errorCode:status==='uncertain'?'openai_network':'request_cancelled'});
    await store.reserveRequest(env,owner,{id:active,operation:'chat',model:'fixture',estimatedCostUsd:3});
    await assert.rejects(()=>store.reserveRequest(env,owner,{id:id(),operation:'chat',model:'fixture',estimatedCostUsd:2}),{code:'daily_budget_limit'});
    await assert.rejects(()=>store.extendRequestReservation(env,owner,active,5),{code:'daily_budget_limit'});
    assert.equal((await store.extendRequestReservation(env,owner,active,4)).reserved_cost_usd,4);
    const usage=await store.usageSummary(env,owner);assert.equal(usage.totals.requests,2);assert.equal(usage.totals.unknownCostRequests,1);assert.equal(usage.totals.estimatedCostUsd,0);
    if(status==='uncertain'){
      await store.finishRequest(env,owner,unknown,{status:'completed',estimatedCostUsd:2});
      assert.equal((await store.extendRequestReservation(env,owner,active,7)).reserved_cost_usd,7);
      assert.equal((await store.reserveRequest(env,owner,{id:id(),operation:'chat',model:'fixture',estimatedCostUsd:1})).duplicate,false);
    }
  }
});

test('a pre-reservation cancellation persists without consuming allowance and wins races with later reservations',async t=>{
  const env=await fixture(t),requestId=id();
  const cancelled=await store.cancelRequest(env,'alice',requestId);assert.equal(cancelled.status,'cancelled');assert.equal(cancelled.operation,'cancel');assert.equal(cancelled.dispatched,0);
  await assert.rejects(()=>store.reserveRequest(env,'alice',{id:requestId,operation:'chat',model:'fixture'}),{code:'request_cancelled'});
  await assert.rejects(()=>store.markRequestDispatched(env,'alice',requestId),{code:'request_cancelled'});
  const bob=await store.reserveRequest(env,'bob',{id:requestId,operation:'chat',model:'fixture'});assert.equal(bob.duplicate,false);assert.equal(bob.request.cancel_requested,0);
  const ids=Array.from({length:8},()=>id());
  const outcomes=await Promise.all(ids.map(async requestId=>{
    const raced=await Promise.allSettled([store.reserveRequest(env,'alice',{id:requestId,operation:'chat',model:'fixture'}),store.cancelRequest(env,'alice',requestId)]);
    assert.equal(raced[1].status,'fulfilled');if(raced[0].status==='rejected')assert.equal(raced[0].reason.code,'request_cancelled');
    await assert.rejects(()=>store.markRequestDispatched(env,'alice',requestId),{code:'request_cancelled'});
    return store.getRequest(env,'alice',requestId);
  }));
  assert.ok(outcomes.every(row=>row.status==='cancelled'&&row.cancel_requested===1&&row.dispatched===0));
  assert.equal((await store.usageSummary(env,'alice')).totals.requests,0);
  await store.saveSettings(env,'alice',{dailyRequestLimit:1});const allowed=await store.reserveRequest(env,'alice',{id:id(),operation:'chat',model:'fixture'});assert.equal(allowed.duplicate,false);
});

test('history and usage reads repair stale ledger and message states together without touching fresh requests or other owners',async t=>{
  const env=await fixture(t),db=env.ATLAS_DB,a=await store.createConversation(env,'alice',{mode:'research'}),b=await store.createConversation(env,'bob',{mode:'research'}),now=Date.now(),old=now-601000;
  const pending=id(),dispatched=id(),recent=id(),settled=id(),otherOwner=id();
  for(const [owner,conversationId,requestId,dispatch,stale] of [['alice',a.id,pending,false,true],['alice',a.id,dispatched,true,true],['alice',a.id,recent,true,false],['alice',a.id,settled,true,true],['bob',b.id,otherOwner,true,true]]){
    await store.reserveRequest(env,owner,{id:requestId,operation:'chat',model:'fixture',conversationId});
    await store.createMessage(env,owner,conversationId,{id:requestId,prompt:'Fixture interrupted request'});
    if(dispatch)await store.markRequestDispatched(env,owner,requestId);
    if(requestId===settled)await store.finishRequest(env,owner,requestId,{status:'completed',inputTokens:5,outputTokens:3,estimatedCostUsd:0.01});
    if(stale)await db.batch([
      db.prepare('UPDATE atlas_requests SET created_at=? WHERE owner=? AND id=?').bind(old,owner,requestId),
      db.prepare('UPDATE atlas_turns SET created_at=?,answer=? WHERE owner=? AND id=?').bind(old,dispatch?'Retained partial answer':'',owner,requestId)
    ]);
  }
  const page=await store.getMessagePage(env,'alice',a.id),messages=new Map(page.messages.map(m=>[m.id,m]));
  assert.equal(messages.get(pending).status,'failed');assert.equal((await store.getRequest(env,'alice',pending)).status,'failed');
  assert.equal(messages.get(dispatched).status,'uncertain');assert.equal(messages.get(dispatched).answer,'Retained partial answer');assert.equal((await store.getRequest(env,'alice',dispatched)).status,'uncertain');
  assert.equal(messages.get(settled).status,'uncertain');assert.equal((await store.getRequest(env,'alice',settled)).status,'completed');
  assert.equal(messages.get(recent).status,'running');assert.equal((await store.getRequest(env,'alice',recent)).status,'running');
  assert.equal((await store.getRequest(env,'bob',otherOwner)).status,'running');assert.equal((await db.prepare('SELECT status FROM atlas_turns WHERE owner=? AND id=?').bind('bob',otherOwner).first()).status,'running');
  const usagePending=id();await store.reserveRequest(env,'alice',{id:usagePending,operation:'chat',model:'fixture',conversationId:a.id});await store.createMessage(env,'alice',a.id,{id:usagePending,prompt:'Usage recovery'});
  await db.batch([db.prepare('UPDATE atlas_requests SET created_at=? WHERE owner=? AND id=?').bind(old,'alice',usagePending),db.prepare('UPDATE atlas_turns SET created_at=? WHERE owner=? AND id=?').bind(old,'alice',usagePending)]);
  const usage=await store.usageSummary(env,'alice');assert.equal(usage.totals.requests,3);assert.equal(usage.totals.pending,1);
  assert.equal((await db.prepare('SELECT status FROM atlas_turns WHERE owner=? AND id=?').bind('alice',usagePending).first()).status,'failed');
  assert.deepEqual(await store.recoverStaleRequests(env,'alice'),{messagesRecovered:0,requestsRecovered:0});
});

test('provider health ignores late completions for replaced credentials',async t=>{
  const env=await fixture(t);await env.ATLAS_DB.prepare("INSERT INTO atlas_credentials(owner,iv,ciphertext,model,updated_at) VALUES('alice','fixture','fixture','fixture-model',10)").run();
  await store.recordProviderHealth(env,'alice',{model:'fixture-model',credentialUpdatedAt:10,lastCheckedAt:100,lastSuccessAt:100,lastErrorCode:null});
  assert.equal((await store.getProviderHealth(env,'alice')).lastSuccessAt,100);
  await env.ATLAS_DB.prepare("UPDATE atlas_credentials SET updated_at=20 WHERE owner='alice'").run();
  await store.recordProviderHealth(env,'alice',{model:'fixture-model',credentialUpdatedAt:20,lastCheckedAt:200,lastSuccessAt:200});
  await store.recordProviderHealth(env,'alice',{model:'fixture-model',credentialUpdatedAt:10,lastSuccessAt:300});
  assert.equal((await store.getProviderHealth(env,'alice')).lastSuccessAt,200);
  assert.equal((await store.getProviderHealth(env,'alice')).credentialUpdatedAt,20);
  assert.equal((await store.getProviderHealth(env,'bob')).lastSuccessAt,null);
});

test('usage totals include paid requests older than the bounded display list',async t=>{
  const env=await fixture(t),db=env.ATLAS_DB,day=new Date().toISOString().slice(0,10);
  await db.prepare("INSERT INTO atlas_requests(owner,id,operation,model,day,status,dispatched,input_tokens,output_tokens,estimated_cost_usd,created_at) VALUES('alice','paid','chat','fixture',?,'completed',1,123,45,0.25,1)").bind(day).run();
  await db.prepare("WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM n WHERE x<501) INSERT INTO atlas_requests(owner,id,operation,model,day,status,dispatched,created_at) SELECT 'alice','failed-'||x,'chat','fixture',?,'failed',0,x+1 FROM n").bind(day).run();
  const usage=await store.usageSummary(env,'alice');assert.equal(usage.requests.length,500);assert.equal(usage.totals.requests,1);assert.equal(usage.totals.failed,501);assert.equal(usage.totals.inputTokens,123);assert.equal(usage.totals.outputTokens,45);assert.equal(usage.totals.estimatedCostUsd,0.25);
});

test('daily and weekly schedules honor timezone, daylight saving gaps and repeated times',()=>{
  const daily={schedule_kind:'daily',local_time:'09:00',timezone:'Europe/London',weekdays:[]};
  assert.equal(new Date(store.nextTaskRun(daily,Date.parse('2026-03-28T12:00:00Z'))).toISOString(),'2026-03-29T08:00:00.000Z');
  const gap={...daily,local_time:'01:30'};
  assert.equal(new Date(store.nextTaskRun(gap,Date.parse('2026-03-28T12:00:00Z'))).toISOString(),'2026-03-29T01:30:00.000Z');
  assert.equal(new Date(store.nextTaskRun(gap,Date.parse('2026-10-24T12:00:00Z'))).toISOString(),'2026-10-25T00:30:00.000Z');
  assert.equal(new Date(store.nextTaskRun(gap,Date.parse('2026-10-25T00:45:00Z'))).toISOString(),'2026-10-26T01:30:00.000Z');
  const weekly={...daily,schedule_kind:'weekly',weekdays:[1]};
  assert.equal(new Date(store.nextTaskRun(weekly,Date.parse('2026-11-24T12:00:00Z'))).toISOString(),'2026-11-30T09:00:00.000Z');
});

test('tasks start paused, preserve explicit context, require activation confirmation and remain owner-scoped',async t=>{
  const env=await fixture(t),task=await store.createTask(env,'alice',{title:'Research briefing',prompt:'Research topic',mode:'research',schedule_kind:'daily',local_time:'09:00',timezone:'Europe/London'});
  assert.equal(task.enabled,false);assert.equal(task.next_run,null);
  assert.equal((await store.getConversation(env,'alice',task.conversation_id)).mode,'research');
  await assert.rejects(()=>store.updateTask(env,'alice',task.id,{enabled:true}),{code:'confirmation_required'});
  const enabled=await store.updateTask(env,'alice',task.id,{enabled:true,confirm:true});assert.equal(enabled.enabled,true);assert.ok(enabled.next_run>Date.now());
  await assert.rejects(()=>store.updateTask(env,'bob',task.id,{enabled:false}),{code:'not_found'});
  await store.stopTasks(env,'alice');assert.equal((await store.getTask(env,'alice',task.id)).enabled,false);
  const fitness=await store.createTask(env,'alice',{prompt:'Summarize my week',mode:'fitness',includeFitness:true,interval_minutes:1440});assert.equal(fitness.includeFitness,true);
  await store.deleteConversation(env,'alice',fitness.conversation_id);assert.equal((await store.getTask(env,'alice',fitness.id)).conversation_id,null);
  await store.deleteTask(env,'alice',task.id);assert.equal(await store.getTask(env,'alice',task.id),null);
});
