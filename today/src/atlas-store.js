// Canonical schema is verified against atlas/migrations by atlas-store runtime tests.
export const SCHEMA_VERSION = 11;
const CHAT_SCHEMA_VERSION = 6;
export const SCHEMA_SQL = "CREATE TABLE IF NOT EXISTS atlas_messages (\n id INTEGER PRIMARY KEY AUTOINCREMENT,\n owner TEXT NOT NULL,\n mode TEXT NOT NULL,\n prompt TEXT NOT NULL,\n answer TEXT NOT NULL,\n created_at INTEGER NOT NULL\n);\nCREATE INDEX IF NOT EXISTS atlas_messages_owner_mode ON atlas_messages(owner,mode,id DESC);\nCREATE TABLE IF NOT EXISTS atlas_usage (\n owner TEXT NOT NULL,\n day TEXT NOT NULL,\n requests INTEGER NOT NULL DEFAULT 0,\n PRIMARY KEY(owner,day)\n);\n\nCREATE TABLE IF NOT EXISTS atlas_tasks (\n id TEXT PRIMARY KEY,\n owner TEXT NOT NULL,\n prompt TEXT NOT NULL,\n interval_minutes INTEGER NOT NULL CHECK(interval_minutes BETWEEN 60 AND 10080),\n enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN (0,1)),\n next_run INTEGER,\n created_at INTEGER NOT NULL\n);\nCREATE INDEX IF NOT EXISTS atlas_tasks_owner ON atlas_tasks(owner);\nCREATE TABLE IF NOT EXISTS atlas_task_runs (\n id TEXT PRIMARY KEY,\n task_id TEXT NOT NULL,\n owner TEXT NOT NULL,\n started_at INTEGER NOT NULL,\n finished_at INTEGER,\n status TEXT NOT NULL CHECK(status IN ('running','completed','failed','cancelled')),\n result TEXT,\n FOREIGN KEY(task_id) REFERENCES atlas_tasks(id)\n);\n\nCREATE TABLE IF NOT EXISTS atlas_controls (owner TEXT PRIMARY KEY, stopped INTEGER NOT NULL DEFAULT 1 CHECK(stopped IN (0,1)));\n\nCREATE TABLE IF NOT EXISTS atlas_improvements (\n id TEXT PRIMARY KEY,\n owner TEXT NOT NULL,\n title TEXT NOT NULL,\n hypothesis TEXT NOT NULL,\n metric TEXT NOT NULL,\n baseline TEXT NOT NULL,\n status TEXT NOT NULL DEFAULT 'proposed' CHECK(status IN ('proposed','archived')),\n created_at INTEGER NOT NULL\n);\nCREATE INDEX IF NOT EXISTS atlas_improvements_owner ON atlas_improvements(owner,created_at DESC);\nCREATE TABLE IF NOT EXISTS atlas_evaluations (\n id TEXT PRIMARY KEY,\n improvement_id TEXT NOT NULL REFERENCES atlas_improvements(id),\n owner TEXT NOT NULL,\n candidate_sha TEXT NOT NULL,\n baseline_sha TEXT NOT NULL,\n evidence_url TEXT NOT NULL,\n outcome TEXT NOT NULL CHECK(outcome IN ('pass','fail','inconclusive')),\n created_at INTEGER NOT NULL\n);\n\nCREATE TABLE IF NOT EXISTS atlas_credentials (owner TEXT PRIMARY KEY, iv TEXT NOT NULL, ciphertext TEXT NOT NULL, model TEXT NOT NULL, updated_at INTEGER NOT NULL);\n\n-- Atlas conversations and execution records. Additive and safe to reapply.\nCREATE TABLE IF NOT EXISTS atlas_schema (id INTEGER PRIMARY KEY CHECK(id=1), version INTEGER NOT NULL, updated_at INTEGER NOT NULL);\nCREATE TABLE IF NOT EXISTS atlas_settings (\n owner TEXT PRIMARY KEY, memory_enabled INTEGER NOT NULL DEFAULT 0 CHECK(memory_enabled IN (0,1)), memory TEXT NOT NULL DEFAULT '',\n daily_request_limit INTEGER NOT NULL DEFAULT 20 CHECK(daily_request_limit BETWEEN 1 AND 100), daily_budget_usd REAL,\n timezone TEXT NOT NULL DEFAULT 'Europe/London', updated_at INTEGER NOT NULL\n);\nCREATE TABLE IF NOT EXISTS atlas_conversations (\n owner TEXT NOT NULL, id TEXT NOT NULL, title TEXT NOT NULL, mode TEXT NOT NULL, repository TEXT,\n archived INTEGER NOT NULL DEFAULT 0 CHECK(archived IN (0,1)), summary TEXT NOT NULL DEFAULT '', summary_through_id TEXT,\n created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, PRIMARY KEY(owner,id)\n);\nCREATE INDEX IF NOT EXISTS atlas_conversations_owner_updated ON atlas_conversations(owner,archived,updated_at DESC);\nCREATE TABLE IF NOT EXISTS atlas_turns (\n owner TEXT NOT NULL, id TEXT NOT NULL, conversation_id TEXT NOT NULL, prompt TEXT NOT NULL, answer TEXT NOT NULL DEFAULT '',\n status TEXT NOT NULL CHECK(status IN ('running','completed','incomplete','cancelled','failed','uncertain')),\n sources_json TEXT NOT NULL DEFAULT '[]', context_json TEXT NOT NULL DEFAULT '[]', error_code TEXT,\n created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, PRIMARY KEY(owner,id),\n FOREIGN KEY(owner,conversation_id) REFERENCES atlas_conversations(owner,id) ON DELETE CASCADE\n);\nCREATE INDEX IF NOT EXISTS atlas_turns_conversation ON atlas_turns(owner,conversation_id,created_at,id);\nCREATE TABLE IF NOT EXISTS atlas_requests (\n owner TEXT NOT NULL, id TEXT NOT NULL, conversation_id TEXT, operation TEXT NOT NULL, model TEXT NOT NULL, day TEXT NOT NULL,\n status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','running','completed','failed','cancelled','incomplete','uncertain')),\n dispatched INTEGER NOT NULL DEFAULT 0 CHECK(dispatched IN (0,1)), cancel_requested INTEGER NOT NULL DEFAULT 0 CHECK(cancel_requested IN (0,1)),\n reserved_cost_usd REAL NOT NULL DEFAULT 0, estimated_cost_usd REAL, input_tokens INTEGER, output_tokens INTEGER, cached_tokens INTEGER,\n web_search_calls INTEGER, error_code TEXT, upstream_request_id TEXT, duration_ms INTEGER,\n created_at INTEGER NOT NULL, finished_at INTEGER, PRIMARY KEY(owner,id)\n);\nCREATE INDEX IF NOT EXISTS atlas_requests_owner_day ON atlas_requests(owner,day,created_at DESC);\nCREATE TABLE IF NOT EXISTS atlas_briefs (\n owner TEXT NOT NULL, id TEXT NOT NULL, conversation_id TEXT NOT NULL, message_id TEXT NOT NULL, title TEXT NOT NULL,\n answer TEXT NOT NULL, sources_json TEXT NOT NULL DEFAULT '[]', created_at INTEGER NOT NULL, PRIMARY KEY(owner,id),\n FOREIGN KEY(owner,conversation_id) REFERENCES atlas_conversations(owner,id) ON DELETE CASCADE\n);\nCREATE INDEX IF NOT EXISTS atlas_briefs_owner_created ON atlas_briefs(owner,created_at DESC);\nCREATE TABLE IF NOT EXISTS atlas_provider_health (\n owner TEXT PRIMARY KEY, model TEXT, last_checked_at INTEGER, last_success_at INTEGER, last_error_code TEXT, credential_updated_at INTEGER\n);\nCREATE TABLE IF NOT EXISTS atlas_schedules (\n owner TEXT NOT NULL, id TEXT NOT NULL, conversation_id TEXT, title TEXT NOT NULL, prompt TEXT NOT NULL, mode TEXT NOT NULL DEFAULT 'research', repository TEXT,\n enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN (0,1)), schedule_kind TEXT NOT NULL CHECK(schedule_kind IN ('interval','daily','weekly')),\n interval_minutes INTEGER, local_time TEXT, timezone TEXT NOT NULL DEFAULT 'Europe/London', weekdays_json TEXT NOT NULL DEFAULT '[]', include_fitness INTEGER NOT NULL DEFAULT 0 CHECK(include_fitness IN (0,1)), context_json TEXT NOT NULL DEFAULT '[]',\n next_run INTEGER, lease_id TEXT, lease_until INTEGER, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, PRIMARY KEY(owner,id),\n FOREIGN KEY(owner,conversation_id) REFERENCES atlas_conversations(owner,id)\n);\nCREATE INDEX IF NOT EXISTS atlas_schedules_due ON atlas_schedules(enabled,next_run,lease_until);\nCREATE TABLE IF NOT EXISTS atlas_schedule_runs (\n owner TEXT NOT NULL, id TEXT NOT NULL, task_id TEXT NOT NULL, request_id TEXT NOT NULL, occurrence_key TEXT NOT NULL, scheduled_for INTEGER,\n status TEXT NOT NULL CHECK(status IN ('queued','running','completed','incomplete','failed','cancelled','skipped','uncertain')),\n started_at INTEGER NOT NULL, finished_at INTEGER, result TEXT, prompt_snapshot TEXT, sources_json TEXT NOT NULL DEFAULT '[]', error_code TEXT,\n cancel_requested INTEGER NOT NULL DEFAULT 0 CHECK(cancel_requested IN (0,1)), manual INTEGER NOT NULL DEFAULT 0 CHECK(manual IN (0,1)),\n PRIMARY KEY(owner,id), UNIQUE(owner,task_id,occurrence_key), FOREIGN KEY(owner,task_id) REFERENCES atlas_schedules(owner,id) ON DELETE CASCADE\n);\nCREATE INDEX IF NOT EXISTS atlas_schedule_runs_task ON atlas_schedule_runs(owner,task_id,started_at DESC);\nCREATE TABLE IF NOT EXISTS atlas_integrations (\n owner TEXT NOT NULL, kind TEXT NOT NULL, iv TEXT NOT NULL, ciphertext TEXT NOT NULL, metadata TEXT NOT NULL DEFAULT '{}',\n updated_at INTEGER NOT NULL, PRIMARY KEY(owner,kind)\n);\nCREATE TABLE IF NOT EXISTS atlas_patches (\n id TEXT NOT NULL, owner TEXT NOT NULL, conversation_id TEXT, repository TEXT NOT NULL, base_sha TEXT NOT NULL,\n title TEXT NOT NULL, summary TEXT NOT NULL, files_json TEXT NOT NULL, test_plan TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'draft',\n url TEXT, number INTEGER, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, PRIMARY KEY(owner,id)\n);\nCREATE INDEX IF NOT EXISTS atlas_patches_owner_created ON atlas_patches(owner,created_at DESC);\nCREATE TABLE IF NOT EXISTS atlas_imports (kind TEXT NOT NULL, owner TEXT NOT NULL, source_id TEXT NOT NULL, PRIMARY KEY(kind,owner,source_id));\n-- Import markers prevent deleted or renamed legacy content being resurrected.\nINSERT OR IGNORE INTO atlas_conversations(owner,id,title,mode,repository,created_at,updated_at)\n SELECT owner,'legacy-'||lower(hex(owner))||'-'||mode,'Imported '||mode||' history',mode,NULL,MIN(created_at),MAX(created_at) FROM atlas_messages m\n WHERE NOT EXISTS(SELECT 1 FROM atlas_imports i WHERE i.kind='message' AND i.owner=m.owner AND i.source_id=CAST(m.id AS TEXT)) GROUP BY owner,mode;\nINSERT OR IGNORE INTO atlas_turns(owner,id,conversation_id,prompt,answer,status,created_at,updated_at)\n SELECT owner,'legacy-'||id,'legacy-'||lower(hex(owner))||'-'||mode,prompt,answer,CASE WHEN length(trim(answer))>0 THEN 'completed' ELSE 'incomplete' END,created_at,created_at FROM atlas_messages m\n WHERE NOT EXISTS(SELECT 1 FROM atlas_imports i WHERE i.kind='message' AND i.owner=m.owner AND i.source_id=CAST(m.id AS TEXT));\nINSERT OR IGNORE INTO atlas_imports(kind,owner,source_id) SELECT 'message',owner,CAST(id AS TEXT) FROM atlas_messages;\nINSERT OR IGNORE INTO atlas_conversations(owner,id,title,mode,repository,created_at,updated_at)\n SELECT owner,'schedule-'||id,'Schedule: '||substr(prompt,1,80),'research',NULL,created_at,created_at FROM atlas_tasks t\n WHERE NOT EXISTS(SELECT 1 FROM atlas_imports i WHERE i.kind='task' AND i.owner=t.owner AND i.source_id=t.id);\nINSERT OR IGNORE INTO atlas_schedules(owner,id,conversation_id,title,prompt,mode,repository,enabled,schedule_kind,interval_minutes,timezone,created_at,updated_at)\n SELECT owner,id,'schedule-'||id,substr(prompt,1,80),prompt,'research',NULL,0,'interval',interval_minutes,'Europe/London',created_at,created_at FROM atlas_tasks t\n WHERE NOT EXISTS(SELECT 1 FROM atlas_imports i WHERE i.kind='task' AND i.owner=t.owner AND i.source_id=t.id);\nINSERT OR IGNORE INTO atlas_imports(kind,owner,source_id) SELECT 'task',owner,id FROM atlas_tasks;\nINSERT OR IGNORE INTO atlas_schedule_runs(owner,id,task_id,request_id,occurrence_key,status,started_at,finished_at,result,error_code)\n SELECT r.owner,'legacy-'||r.id,r.task_id,'legacy-'||r.id,'legacy-'||r.id,CASE WHEN r.status='running' THEN 'uncertain' ELSE r.status END,r.started_at,r.finished_at,r.result,CASE WHEN r.status='running' THEN 'legacy_interrupted' ELSE NULL END\n FROM atlas_task_runs r JOIN atlas_schedules s ON s.owner=r.owner AND s.id=r.task_id\n WHERE NOT EXISTS(SELECT 1 FROM atlas_imports i WHERE i.kind='run' AND i.owner=r.owner AND i.source_id=r.id);\nINSERT OR IGNORE INTO atlas_imports(kind,owner,source_id) SELECT 'run',owner,id FROM atlas_task_runs;\nINSERT INTO atlas_schema(id,version,updated_at) VALUES(1,6,CAST(strftime('%s','now') AS INTEGER)*1000)\n ON CONFLICT(id) DO UPDATE SET version=MAX(version,excluded.version),updated_at=excluded.updated_at;\n\n-- Persistent coding workspaces. Each changed file has its own bounded row.\nCREATE TABLE IF NOT EXISTS atlas_coding_runs (\n owner TEXT NOT NULL, id TEXT NOT NULL, conversation_id TEXT NOT NULL, request_id TEXT NOT NULL,\n prompt TEXT NOT NULL, model TEXT NOT NULL, credential_updated_at INTEGER NOT NULL,\n repository TEXT NOT NULL, base_branch TEXT, base_sha TEXT, base_tree_sha TEXT,\n status TEXT NOT NULL DEFAULT 'preparing', stage TEXT NOT NULL DEFAULT 'Preparing workspace', phase TEXT NOT NULL DEFAULT 'snapshot',\n revision INTEGER NOT NULL DEFAULT 1, manifest_json TEXT NOT NULL DEFAULT '{}',\n session_id TEXT, environment_id TEXT, input_file_id TEXT, turn_id TEXT,\n prior_turns_json TEXT NOT NULL DEFAULT '[]', input_key TEXT NOT NULL,\n budget_cents INTEGER NOT NULL DEFAULT 200, total_budget_cents INTEGER NOT NULL DEFAULT 200,\n consumed_before INTEGER NOT NULL DEFAULT 0, consumed_after INTEGER,\n summary TEXT NOT NULL DEFAULT '', checks_json TEXT NOT NULL DEFAULT '[]', activity_json TEXT NOT NULL DEFAULT '[]',\n changes_json TEXT NOT NULL DEFAULT '{\"added\":0,\"modified\":0,\"deleted\":0}',\n error_code TEXT, error_message TEXT, review_ready INTEGER NOT NULL DEFAULT 0, can_continue INTEGER NOT NULL DEFAULT 0,\n cancel_requested INTEGER NOT NULL DEFAULT 0, cancel_generation INTEGER NOT NULL DEFAULT 0, lease_id TEXT, lease_until INTEGER,\n publish_url TEXT, publish_number INTEGER, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,\n finished_at INTEGER, dispatched_at INTEGER,\n PRIMARY KEY(owner,id), UNIQUE(owner,request_id),\n FOREIGN KEY(owner,conversation_id) REFERENCES atlas_conversations(owner,id) ON DELETE CASCADE\n);\nCREATE INDEX IF NOT EXISTS atlas_coding_runs_conversation ON atlas_coding_runs(owner,conversation_id,created_at DESC);\nCREATE UNIQUE INDEX IF NOT EXISTS atlas_coding_runs_active ON atlas_coding_runs(owner,conversation_id)\n WHERE status IN ('preparing','running','waiting','uncertain','publishing');\nCREATE TABLE IF NOT EXISTS atlas_coding_changes (\n owner TEXT NOT NULL, run_id TEXT NOT NULL, revision INTEGER NOT NULL, path TEXT NOT NULL,\n operation TEXT NOT NULL, before_sha TEXT, before_mode TEXT, after_sha TEXT, after_mode TEXT,\n content_base64 TEXT, binary INTEGER NOT NULL DEFAULT 0, diff TEXT NOT NULL DEFAULT '', diff_truncated INTEGER NOT NULL DEFAULT 0,\n added_lines INTEGER, removed_lines INTEGER, bytes INTEGER NOT NULL DEFAULT 0,\n PRIMARY KEY(owner,run_id,revision,path),\n FOREIGN KEY(owner,run_id) REFERENCES atlas_coding_runs(owner,id) ON DELETE CASCADE\n);\nINSERT INTO atlas_schema(id,version,updated_at) VALUES(1,7,CAST(strftime('%s','now') AS INTEGER)*1000)\n ON CONFLICT(id) DO UPDATE SET version=MAX(version,excluded.version),updated_at=excluded.updated_at;\n\n-- Reusable cloud environment recipes. A coding run keeps an immutable snapshot.\nCREATE TABLE IF NOT EXISTS atlas_environments (\n owner TEXT NOT NULL, id TEXT NOT NULL, name TEXT NOT NULL, repository TEXT NOT NULL,\n branch TEXT NOT NULL DEFAULT '', setup_command TEXT NOT NULL DEFAULT '', test_command TEXT NOT NULL DEFAULT '',\n machine TEXT NOT NULL DEFAULT 'medium' CHECK(machine IN ('small','medium','large')),\n network TEXT NOT NULL DEFAULT 'dependencies' CHECK(network IN ('dependencies','off')),\n revision INTEGER NOT NULL DEFAULT 1,\n archived INTEGER NOT NULL DEFAULT 0 CHECK(archived IN (0,1)),\n created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,\n PRIMARY KEY(owner,id)\n);\nCREATE INDEX IF NOT EXISTS atlas_environments_owner ON atlas_environments(owner,archived,updated_at DESC);\nALTER TABLE atlas_coding_runs ADD COLUMN environment_profile_id TEXT;\nALTER TABLE atlas_coding_runs ADD COLUMN environment_config_json TEXT NOT NULL DEFAULT '{}';\nALTER TABLE atlas_coding_runs ADD COLUMN cloud_status TEXT;\nALTER TABLE atlas_coding_runs ADD COLUMN cloud_checked_at INTEGER;\nALTER TABLE atlas_coding_runs ADD COLUMN retry_from_run_id TEXT;\nINSERT INTO atlas_schema(id,version,updated_at) VALUES(1,8,CAST(strftime('%s','now') AS INTEGER)*1000)\n ON CONFLICT(id) DO UPDATE SET version=MAX(version,excluded.version),updated_at=excluded.updated_at;\n\n-- Persist selected cross-app references, never a copy of private message bodies.\nCREATE TABLE IF NOT EXISTS atlas_workspace_contexts (\n owner TEXT NOT NULL, conversation_id TEXT NOT NULL,\n source_json TEXT NOT NULL, metadata_json TEXT NOT NULL,\n updated_at INTEGER NOT NULL,\n PRIMARY KEY(owner,conversation_id),\n FOREIGN KEY(owner,conversation_id) REFERENCES atlas_conversations(owner,id) ON DELETE CASCADE\n);\nINSERT INTO atlas_schema(id,version,updated_at) VALUES(1,9,CAST(strftime('%s','now') AS INTEGER)*1000)\n ON CONFLICT(id) DO UPDATE SET version=MAX(version,excluded.version),updated_at=excluded.updated_at;\n"
  + '\n' + `-- Durable manual answers and a common timeline for existing Atlas executors.
CREATE TABLE IF NOT EXISTS atlas_answer_runs (
 owner TEXT NOT NULL, id TEXT NOT NULL, conversation_id TEXT NOT NULL,
 request_id TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1,
 input_json TEXT NOT NULL, connection_version INTEGER NOT NULL, resume_from TEXT,
 status TEXT NOT NULL CHECK(status IN ('queued','running','stopping','completed','incomplete','failed','cancelled','uncertain')),
 checkpoint TEXT NOT NULL, error_code TEXT,
 available_at INTEGER NOT NULL, lease_token TEXT, lease_until INTEGER,
 created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
 PRIMARY KEY(owner,id), UNIQUE(owner,request_id),
 FOREIGN KEY(owner,conversation_id) REFERENCES atlas_conversations(owner,id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS atlas_answer_runs_active ON atlas_answer_runs(owner,conversation_id)
 WHERE status IN ('queued','running','stopping');
CREATE INDEX IF NOT EXISTS atlas_answer_runs_due ON atlas_answer_runs(available_at,lease_until)
 WHERE status IN ('queued','running','stopping');
CREATE INDEX IF NOT EXISTS atlas_answer_runs_recent ON atlas_answer_runs(owner,updated_at DESC,id);

CREATE TABLE IF NOT EXISTS atlas_run_events (
 owner TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('background','coding','scheduled')), run_id TEXT NOT NULL,
 seq INTEGER NOT NULL CHECK(seq>0), revision INTEGER NOT NULL, attempt_id TEXT, status TEXT NOT NULL,
 checkpoint TEXT NOT NULL, stage TEXT, recorded_at INTEGER NOT NULL,
 PRIMARY KEY(owner,kind,run_id,seq)
);
CREATE INDEX IF NOT EXISTS atlas_run_events_attempt ON atlas_run_events(owner,attempt_id) WHERE kind='background';

-- Capture events in the same commit as their source state. Each run has its own cursor.
CREATE TRIGGER IF NOT EXISTS atlas_answer_run_created AFTER INSERT ON atlas_answer_runs
BEGIN
 INSERT INTO atlas_run_events(owner,kind,run_id,seq,revision,attempt_id,status,checkpoint,stage,recorded_at)
 VALUES(NEW.owner,'background',NEW.id,1,NEW.revision,NEW.request_id,NEW.status,NEW.checkpoint,NULL,NEW.updated_at);
END;
CREATE TRIGGER IF NOT EXISTS atlas_answer_run_changed AFTER UPDATE ON atlas_answer_runs
WHEN OLD.status<>NEW.status OR OLD.checkpoint<>NEW.checkpoint OR OLD.revision<>NEW.revision
BEGIN
 INSERT INTO atlas_run_events(owner,kind,run_id,seq,revision,attempt_id,status,checkpoint,stage,recorded_at)
 SELECT NEW.owner,'background',NEW.id,COALESCE(MAX(seq),0)+1,NEW.revision,NEW.request_id,NEW.status,NEW.checkpoint,NULL,NEW.updated_at
 FROM atlas_run_events WHERE owner=NEW.owner AND kind='background' AND run_id=NEW.id;
END;
CREATE TRIGGER IF NOT EXISTS atlas_answer_run_deleted AFTER DELETE ON atlas_answer_runs
BEGIN
 DELETE FROM atlas_run_events WHERE owner=OLD.owner AND kind='background' AND run_id=OLD.id;
END;
CREATE TRIGGER IF NOT EXISTS atlas_answer_run_stopping AFTER UPDATE OF status ON atlas_answer_runs
WHEN OLD.status='running' AND NEW.status='stopping'
BEGIN
 UPDATE atlas_requests SET cancel_requested=1,
 status=CASE WHEN dispatched=0 THEN 'cancelled' ELSE status END,
 error_code=CASE WHEN dispatched=0 THEN 'request_cancelled' ELSE error_code END,
 finished_at=CASE WHEN dispatched=0 THEN NEW.updated_at ELSE finished_at END
 WHERE owner=NEW.owner AND id=NEW.request_id AND status IN ('pending','running');
END;

CREATE TRIGGER IF NOT EXISTS atlas_coding_run_created AFTER INSERT ON atlas_coding_runs
BEGIN
 INSERT INTO atlas_run_events(owner,kind,run_id,seq,revision,attempt_id,status,checkpoint,stage,recorded_at)
 VALUES(NEW.owner,'coding',NEW.id,1,NEW.revision,NULL,NEW.status,NEW.phase,NEW.stage,NEW.created_at);
END;
CREATE TRIGGER IF NOT EXISTS atlas_coding_run_changed AFTER UPDATE ON atlas_coding_runs
WHEN OLD.status<>NEW.status OR OLD.phase<>NEW.phase OR OLD.stage<>NEW.stage OR OLD.revision<>NEW.revision OR OLD.cancel_requested<>NEW.cancel_requested OR OLD.review_ready<>NEW.review_ready
BEGIN
 INSERT INTO atlas_run_events(owner,kind,run_id,seq,revision,attempt_id,status,checkpoint,stage,recorded_at)
 SELECT NEW.owner,'coding',NEW.id,COALESCE(MAX(seq),0)+1,NEW.revision,NULL,NEW.status,
 CASE WHEN NEW.cancel_requested=1 AND OLD.cancel_requested=0 THEN 'stop_requested' ELSE NEW.phase END,NEW.stage,NEW.updated_at
 FROM atlas_run_events WHERE owner=NEW.owner AND kind='coding' AND run_id=NEW.id;
END;
CREATE TRIGGER IF NOT EXISTS atlas_coding_run_deleted AFTER DELETE ON atlas_coding_runs
BEGIN
 DELETE FROM atlas_run_events WHERE owner=OLD.owner AND kind='coding' AND run_id=OLD.id;
END;

CREATE TRIGGER IF NOT EXISTS atlas_schedule_run_created AFTER INSERT ON atlas_schedule_runs
BEGIN
 INSERT INTO atlas_run_events(owner,kind,run_id,seq,revision,attempt_id,status,checkpoint,stage,recorded_at)
 VALUES(NEW.owner,'scheduled',NEW.id,1,1,NULL,NEW.status,NEW.status,NULL,NEW.started_at);
END;
CREATE TRIGGER IF NOT EXISTS atlas_schedule_run_changed AFTER UPDATE ON atlas_schedule_runs
WHEN OLD.status<>NEW.status OR OLD.cancel_requested<>NEW.cancel_requested
BEGIN
 INSERT INTO atlas_run_events(owner,kind,run_id,seq,revision,attempt_id,status,checkpoint,stage,recorded_at)
 SELECT NEW.owner,'scheduled',NEW.id,COALESCE(MAX(seq),0)+1,1,NULL,NEW.status,
 CASE WHEN NEW.cancel_requested=1 AND OLD.cancel_requested=0 THEN 'stop_requested' ELSE NEW.status END,
 NULL,COALESCE(NEW.finished_at,MAX(NEW.started_at,CAST(strftime('%s','now') AS INTEGER)*1000))
 FROM atlas_run_events WHERE owner=NEW.owner AND kind='scheduled' AND run_id=NEW.id;
END;
CREATE TRIGGER IF NOT EXISTS atlas_schedule_run_deleted AFTER DELETE ON atlas_schedule_runs
BEGIN
 DELETE FROM atlas_run_events WHERE owner=OLD.owner AND kind='scheduled' AND run_id=OLD.id;
END;

INSERT INTO atlas_schema(id,version,updated_at) VALUES(1,10,CAST(strftime('%s','now') AS INTEGER)*1000)
 ON CONFLICT(id) DO UPDATE SET version=MAX(version,excluded.version),updated_at=excluded.updated_at;
` + '\n' + `-- Independent research and verification within an explicitly approved run.
CREATE TABLE IF NOT EXISTS atlas_run_subtasks (
 owner TEXT NOT NULL, run_id TEXT NOT NULL,
 step TEXT NOT NULL CHECK(step IN ('research','verification')),
 request_id TEXT,
 status TEXT NOT NULL CHECK(status IN ('queued','running','completed','incomplete','failed','cancelled','uncertain')),
 answer TEXT NOT NULL DEFAULT '', sources_json TEXT NOT NULL DEFAULT '[]', error_code TEXT, updated_at INTEGER NOT NULL,
 PRIMARY KEY(owner,run_id,step), UNIQUE(owner,request_id),
 FOREIGN KEY(owner,run_id) REFERENCES atlas_answer_runs(owner,id) ON DELETE CASCADE
);

CREATE TRIGGER IF NOT EXISTS atlas_parallel_run_created AFTER INSERT ON atlas_answer_runs
WHEN json_extract(NEW.input_json,'$.plan')='parallel_research'
BEGIN
 INSERT INTO atlas_run_subtasks(owner,run_id,step,status,updated_at)
 VALUES(NEW.owner,NEW.id,'research','queued',NEW.created_at),(NEW.owner,NEW.id,'verification','queued',NEW.created_at);
END;

CREATE TRIGGER IF NOT EXISTS atlas_parallel_run_retried AFTER UPDATE OF revision ON atlas_answer_runs
WHEN OLD.revision<>NEW.revision
BEGIN
 UPDATE atlas_run_subtasks SET status='queued',request_id=NULL,answer='',sources_json='[]',error_code=NULL,updated_at=NEW.updated_at
 WHERE owner=NEW.owner AND run_id=NEW.id AND status<>'completed';
END;

CREATE TRIGGER IF NOT EXISTS atlas_parallel_run_stopped AFTER UPDATE OF status ON atlas_answer_runs
WHEN OLD.status<>NEW.status AND NEW.status IN ('stopping','cancelled')
BEGIN
 UPDATE atlas_requests SET cancel_requested=1,status=CASE WHEN dispatched=0 THEN 'cancelled' ELSE status END,
 error_code=CASE WHEN dispatched=0 THEN 'request_cancelled' ELSE error_code END,
 finished_at=CASE WHEN dispatched=0 THEN NEW.updated_at ELSE finished_at END
 WHERE owner=NEW.owner AND id IN (SELECT request_id FROM atlas_run_subtasks WHERE owner=NEW.owner AND run_id=NEW.id AND status='running')
 AND status IN ('pending','running');
 UPDATE atlas_run_subtasks SET status='cancelled',updated_at=NEW.updated_at
 WHERE owner=NEW.owner AND run_id=NEW.id AND status='queued';
END;

CREATE TRIGGER IF NOT EXISTS atlas_subtask_changed AFTER UPDATE OF status ON atlas_run_subtasks
WHEN OLD.status<>NEW.status
BEGIN
 INSERT INTO atlas_run_events(owner,kind,run_id,seq,revision,attempt_id,status,checkpoint,stage,recorded_at)
 SELECT p.owner,'background',p.id,COALESCE((SELECT MAX(e.seq) FROM atlas_run_events e WHERE e.owner=p.owner AND e.kind='background' AND e.run_id=p.id),0)+1,
 p.revision,NULL,NEW.status,'subtask',NEW.step,NEW.updated_at
 FROM atlas_answer_runs p WHERE p.owner=NEW.owner AND p.id=NEW.run_id;
END;

INSERT INTO atlas_schema(id,version,updated_at) VALUES(1,11,CAST(strftime('%s','now') AS INTEGER)*1000)
 ON CONFLICT(id) DO UPDATE SET version=MAX(version,excluded.version),updated_at=excluded.updated_at;
`;

const MODES = new Set(['research','developer','personal','fitness','tasks']);
const REQUEST_STATES = new Set(['pending','running','completed','failed','cancelled','incomplete','uncertain']);
const MESSAGE_STATES = new Set(['running','completed','failed','cancelled','incomplete','uncertain']);
const DEFAULTS = {memoryEnabled:false,memory:'',dailyRequestLimit:20,dailyBudgetUsd:null,timezone:'Europe/London'};
export class AtlasStoreError extends Error {
  constructor(code,message,status=400){super(message);this.name='AtlasStoreError';this.code=code;this.status=status;}
}
const fail=(code,message,status)=>{throw new AtlasStoreError(code,message,status);};
const missing=()=>fail('not_found','This Atlas item is unavailable.',404);
const stamp=()=>Date.now();
const dayAt=now=>new Date(now).toISOString().slice(0,10);
const parse=(s,fallback)=>{try{return JSON.parse(s);}catch{return fallback;}};
const bool=v=>v===true||v===1;
function text(value,max,{empty=false,name='value'}={}){
  if(typeof value!=='string'||(!empty&&!value.trim())||value.length>max)fail('invalid_request','Invalid '+name+'.');
  return value;
}
function ownerId(owner){return text(owner,256,{name:'owner'});}
function itemId(id){if(typeof id!=='string'||!/^[A-Za-z0-9._:-]{1,600}$/.test(id))fail('invalid_id','Invalid Atlas item identifier.');return id;}
function finite(value,min,max,name){if(!Number.isFinite(value)||value<min||value>max)fail('invalid_request','Invalid '+name+'.');return value;}
export function validTimeZone(value){
  text(value,100,{name:'timezone'});
  try{new Intl.DateTimeFormat('en-US',{timeZone:value}).format(0);}catch{fail('invalid_timezone','Choose a valid timezone.');}
  return value;
}
function repository(value){if(value==null||value==='')return null;if(typeof value!=='string'||!/^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/.test(value))fail('invalid_repository','Invalid repository.');return value;}
function mode(value){if(!MODES.has(value))fail('invalid_mode','Choose a valid Atlas workspace.');return value;}
function database(env){if(!env?.ATLAS_DB)fail('storage_missing','Atlas storage is not configured.',503);return env.ATLAS_DB;}
function statement(env,sql,...args){return database(env).prepare(sql).bind(...args);}
async function run(env,sql,...args){const r=await statement(env,sql,...args).run();if(r?.success===false)fail('storage_unavailable','Atlas could not save this change.',503);return r;}
async function batch(env,commands){const r=await database(env).batch(commands.map(([sql,...args])=>statement(env,sql,...args)));if(r.some(x=>x?.success===false))fail('storage_unavailable','Atlas could not save this change.',503);return r;}
async function first(env,sql,...args){return statement(env,sql,...args).first();}
async function all(env,sql,...args){const r=await statement(env,sql,...args).all();if(r?.success===false)fail('storage_unavailable','Atlas could not read this data.',503);return r?.results||[];}
function conversationRow(row){return row?{...row,archived:bool(row.archived)}:null;}
function messageRow(row){if(!row)return null;const {sources_json,context_json,...rest}=row;return {...rest,sources:parse(sources_json,[]),context:parse(context_json,[])};}
function briefRow(row){if(!row)return null;const {sources_json,...rest}=row;return {...rest,sources:parse(sources_json,[])};}
function taskRow(row){if(!row)return null;const {weekdays_json,...rest}=row;return {...rest,enabled:bool(row.enabled),weekdays:parse(weekdays_json,[])};}
function safeCode(code){return typeof code==='string'&&/^[a-z][a-z0-9_]{0,95}$/.test(code)?code:null;}
function limitedJson(value,max,name){const encoded=JSON.stringify(value);if(encoded.length>max)fail('context_too_large','The '+name+' is too large.');return encoded;}
function safeSources(value=[]){
  if(!Array.isArray(value)||value.length>100)fail('invalid_sources','Invalid source list.');
  return value.flatMap(s=>{
    if(!s||typeof s.url!=='string'||s.url.length>4096)return [];
    let url;try{url=new URL(s.url);}catch{return [];}
    if(url.protocol!=='https:'||url.username||url.password)return [];
    const result={url:url.href,title:typeof s.title==='string'?s.title.slice(0,500):url.hostname};
    for(const key of ['start_index','end_index'])if(Number.isInteger(s[key])&&s[key]>=0&&s[key]<=1000000)result[key]=s[key];
    return [result];
  });
}

export async function storageStatus(env){
  if(!env?.ATLAS_DB)return {ready:false,schemaVersion:0,requiredVersion:SCHEMA_VERSION,code:'storage_missing'};
  try{
    const row=await first(env,'SELECT version FROM atlas_schema WHERE id=1');
    const tables=await all(env,"SELECT name FROM sqlite_schema WHERE type='table' AND name IN ('atlas_credentials','atlas_conversations','atlas_turns','atlas_requests','atlas_settings','atlas_briefs','atlas_provider_health','atlas_schedules','atlas_schedule_runs','atlas_integrations','atlas_patches','atlas_imports')");
    const ready=(row?.version||0)>=CHAT_SCHEMA_VERSION&&tables.length===12;
    return {ready,schemaVersion:row?.version||0,requiredVersion:SCHEMA_VERSION,...(ready?{}:{code:'storage_upgrade_required'})};
  }catch{return {ready:false,schemaVersion:0,requiredVersion:SCHEMA_VERSION,code:'storage_upgrade_required'};}
}
async function upgradedStorageStatus(env){
  const status=await storageStatus(env);
  if(!status.ready||status.schemaVersion<SCHEMA_VERSION)return null;
  const columns=await all(env,'PRAGMA table_info(atlas_coding_runs)');
  const tables=await all(env,"SELECT name FROM sqlite_schema WHERE type='table' AND name IN ('atlas_environments','atlas_workspace_contexts','atlas_answer_runs','atlas_run_events','atlas_run_subtasks')");
  return tables.length===5&&['environment_profile_id','environment_config_json','cloud_status','cloud_checked_at','retry_from_run_id'].every(name=>columns.some(column=>column.name===name))?status:null;
}
function schemaStatements(sql){
  const statements=[];
  let pending=[], trigger=false;
  for(const line of sql.split('\n')){
    pending.push(line);
    if(/^CREATE TRIGGER\b/i.test(line.trim()))trigger=true;
    // Canonical migrations terminate ordinary statements at the end of a line
    // and trigger bodies on their own END; line.
    if(trigger ? line.trim()!=='END;' : !line.trimEnd().endsWith(';')||line.trimStart().startsWith('--'))continue;
    statements.push(pending.join('\n').trim());
    pending=[];trigger=false;
  }
  return statements;
}
export async function upgradeStorage(env){
  // SQLite's ADD COLUMN has no IF NOT EXISTS. Keep canonical migration SQL
  // unchanged, but skip already-applied additive columns on explicit re-runs.
  const columns=await all(env,'PRAGMA table_info(atlas_coding_runs)');
  const statements=schemaStatements(SCHEMA_SQL).filter(sql=>{
    const alter=/^ALTER TABLE atlas_coding_runs ADD COLUMN ([a-z_]+)/i.exec(sql.replace(/^--[^\n]*(?:\n|$)/gm,'').trim());
    return !alter||!columns.some(column=>column.name===alter[1]);
  });
  try{await batch(env,statements.map(sql=>[sql]));}catch{
    // A concurrent explicit setup may have completed the same migration.
    const status=await upgradedStorageStatus(env).catch(()=>null);
    if(status)return status;
    fail('storage_upgrade_failed','Atlas could not upgrade storage. Try again or check the database binding.',503);
  }
  const status=await upgradedStorageStatus(env);
  if(!status)fail('storage_upgrade_failed','Atlas storage upgrade could not be verified.',503);
  return status;
}

export async function upgradeReleasedStorage(env){
  if(!env?.ATLAS_DB||env.ATLAS_RELEASE_SCHEMA!==String(SCHEMA_VERSION))return;
  // The deployed cron applies this release to an existing Atlas database.
  // An empty binding still needs explicit administrator setup.
  const recorded=await first(env,'SELECT version FROM atlas_schema WHERE id=1');
  if(!recorded||recorded.version>=SCHEMA_VERSION||!(await storageStatus(env)).ready)return;
  await upgradeStorage(env);
}
export async function getSettings(env,owner){
  const row=await first(env,'SELECT * FROM atlas_settings WHERE owner=?',ownerId(owner));
  return row?{memoryEnabled:bool(row.memory_enabled),memory:row.memory,dailyRequestLimit:row.daily_request_limit,dailyBudgetUsd:row.daily_budget_usd,timezone:row.timezone}:{...DEFAULTS};
}
export async function saveSettings(env,owner,patch){
  ownerId(owner);if(!patch||typeof patch!=='object'||Array.isArray(patch))fail('invalid_settings','Invalid Atlas settings.');
  const value={...await getSettings(env,owner)};
  if(Object.hasOwn(patch,'memoryEnabled')){if(typeof patch.memoryEnabled!=='boolean')fail('invalid_settings','Memory choice must be on or off.');value.memoryEnabled=patch.memoryEnabled;}
  if(Object.hasOwn(patch,'memory'))value.memory=text(patch.memory,8000,{empty:true,name:'memory'});
  if(Object.hasOwn(patch,'dailyRequestLimit')){if(!Number.isInteger(patch.dailyRequestLimit))fail('invalid_settings','Request allowance must be a whole number.');value.dailyRequestLimit=finite(patch.dailyRequestLimit,1,100,'daily allowance');}
  if(Object.hasOwn(patch,'dailyBudgetUsd'))value.dailyBudgetUsd=patch.dailyBudgetUsd==null?null:finite(patch.dailyBudgetUsd,0.01,10000,'estimated daily budget');
  if(Object.hasOwn(patch,'timezone'))value.timezone=validTimeZone(patch.timezone);
  await run(env,'INSERT INTO atlas_settings(owner,memory_enabled,memory,daily_request_limit,daily_budget_usd,timezone,updated_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(owner) DO UPDATE SET memory_enabled=excluded.memory_enabled,memory=excluded.memory,daily_request_limit=excluded.daily_request_limit,daily_budget_usd=excluded.daily_budget_usd,timezone=excluded.timezone,updated_at=excluded.updated_at',owner,Number(value.memoryEnabled),value.memory,value.dailyRequestLimit,value.dailyBudgetUsd,value.timezone,stamp());
  return value;
}
export async function listConversations(env,owner,{archived=false}={}){
  return (await all(env,'SELECT * FROM atlas_conversations WHERE owner=? AND archived=? ORDER BY updated_at DESC,id LIMIT 200',ownerId(owner),Number(!!archived))).map(conversationRow);
}
export async function createConversation(env,owner,{title='New conversation',mode:workspace='research',repository:repo=null}={}){
  ownerId(owner);const id=crypto.randomUUID(),now=stamp();text(title,160,{name:'conversation title'});mode(workspace);repo=repository(repo);
  if(repo&&workspace!=='developer')fail('invalid_repository','Repository context belongs to Developer conversations.');
  const row=await first(env,'INSERT INTO atlas_conversations(owner,id,title,mode,repository,created_at,updated_at) SELECT ?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM atlas_conversations WHERE owner=?)<500 RETURNING *',owner,id,title.trim(),workspace,repo,now,now,owner);
  if(!row)fail('conversation_limit','Archive or delete conversations before creating more.',409);
  return conversationRow(row);
}
export async function getConversation(env,owner,id){return conversationRow(await first(env,'SELECT * FROM atlas_conversations WHERE owner=? AND id=?',ownerId(owner),itemId(id)));}
export async function updateConversation(env,owner,id,patch){
  const row=await getConversation(env,owner,id);if(!row)missing();
  if(!patch||typeof patch!=='object')fail('invalid_request','Invalid conversation change.');
  const title=Object.hasOwn(patch,'title')?text(patch.title,160,{name:'title'}).trim():row.title;
  const archived=Object.hasOwn(patch,'archived')?patch.archived:row.archived;
  if(typeof archived!=='boolean')fail('invalid_request','Invalid archive choice.');
  if((Object.hasOwn(patch,'mode')&&patch.mode!==row.mode)||(Object.hasOwn(patch,'repository')&&repository(patch.repository)!==row.repository))fail('conversation_context_fixed','Start a new conversation to change its workspace or repository.',409);
  await run(env,'UPDATE atlas_conversations SET title=?,archived=?,updated_at=? WHERE owner=? AND id=?',title,Number(archived),stamp(),owner,id);
  return getConversation(env,owner,id);
}
export async function deleteConversation(env,owner,id){
  if(!await getConversation(env,owner,id))missing();
  await batch(env,[
    ['UPDATE atlas_requests SET cancel_requested=1,conversation_id=NULL WHERE owner=? AND conversation_id=?',owner,id],
    ['UPDATE atlas_schedules SET enabled=0,next_run=NULL,conversation_id=NULL WHERE owner=? AND conversation_id=?',owner,id],
    ['DELETE FROM atlas_patches WHERE owner=? AND conversation_id=?',owner,id],
    // Migration preserves the originals, but an explicit conversation delete
    // also erases the imported source messages. Keep their import tombstones.
    ["DELETE FROM atlas_messages WHERE owner=? AND EXISTS(SELECT 1 FROM atlas_turns t JOIN atlas_imports i ON i.owner=t.owner AND i.kind='message' AND t.id='legacy-'||i.source_id WHERE t.owner=atlas_messages.owner AND t.conversation_id=? AND t.id='legacy-'||atlas_messages.id)",owner,id],
    ['DELETE FROM atlas_conversations WHERE owner=? AND id=?',owner,id]
  ]);return {deleted:true};
}
export async function listMessages(env,owner,conversationId,{limit=100}={}){
  return (await getMessagePage(env,owner,conversationId,{limit})).messages;
}
export async function getMessage(env,owner,id){
  return messageRow(await first(env,'SELECT * FROM atlas_turns WHERE owner=? AND id=?',ownerId(owner),itemId(id)));
}
export async function getMessagePage(env,owner,conversationId,{limit=100,beforeId=null}={}){
  if(!await getConversation(env,owner,conversationId))missing();
  if(!Number.isInteger(limit)||limit<1||limit>1000)fail('invalid_request','Invalid history limit.');
  await recoverStaleRequests(env,owner);
  let cursor=null;
  if(beforeId!=null){cursor=await first(env,'SELECT created_at,id FROM atlas_turns WHERE owner=? AND conversation_id=? AND id=?',owner,conversationId,itemId(beforeId));if(!cursor)missing();}
  const predicate=cursor?' AND (created_at<? OR (created_at=? AND id<?))':'';
  const args=cursor?[cursor.created_at,cursor.created_at,cursor.id]:[];
  const rows=await all(env,'SELECT * FROM atlas_turns WHERE owner=? AND conversation_id=?'+predicate+' ORDER BY created_at DESC,id DESC LIMIT ?',owner,conversationId,...args,limit+1);
  const hasMore=rows.length>limit,messages=rows.slice(0,limit).reverse().map(messageRow);
  return {messages,hasMore,nextBeforeId:hasMore?messages[0].id:null};
}
export async function* iterateMessages(env,owner,conversationId,{pageSize=250}={}){
  if(!await getConversation(env,owner,conversationId))missing();
  if(!Number.isInteger(pageSize)||pageSize<1||pageSize>1000)fail('invalid_request','Invalid export page size.');
  await recoverStaleRequests(env,owner);
  // A stable upper bound prevents messages created during export from turning
  // a finite export into an unbounded stream. Each database read stays bounded.
  const upper=await first(env,'SELECT created_at,id FROM atlas_turns WHERE owner=? AND conversation_id=? ORDER BY created_at DESC,id DESC LIMIT 1',owner,conversationId);
  if(!upper)return;
  let cursor=null;
  while(true){
    const lower=cursor?' AND (created_at>? OR (created_at=? AND id>?))':'';
    const args=cursor?[cursor.created_at,cursor.created_at,cursor.id]:[];
    const rows=await all(env,'SELECT * FROM atlas_turns WHERE owner=? AND conversation_id=? AND (created_at<? OR (created_at=? AND id<=?))'+lower+' ORDER BY created_at,id LIMIT ?',owner,conversationId,upper.created_at,upper.created_at,upper.id,...args,pageSize);
    if(!rows.length)return;
    for(const row of rows)yield messageRow(row);
    cursor=rows[rows.length-1];
    if(rows.length<pageSize)return;
  }
}
export async function createMessage(env,owner,conversationId,{id,prompt,status='running',context=[]}={}){
  const conversation=await getConversation(env,owner,conversationId);if(!conversation)missing();if(conversation.archived)fail('conversation_archived','Restore this conversation before adding a message.',409);
  itemId(id);text(prompt,16000,{name:'prompt'});if(!MESSAGE_STATES.has(status))fail('invalid_request','Invalid message state.');
  const now=stamp();const encoded=limitedJson(context,196608,'attached context');
  await batch(env,[
    ['INSERT INTO atlas_turns(owner,id,conversation_id,prompt,status,context_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)',owner,id,conversationId,prompt,status,encoded,now,now],
    ['UPDATE atlas_conversations SET updated_at=? WHERE owner=? AND id=?',now,owner,conversationId]
  ]);
  return messageRow(await first(env,'SELECT * FROM atlas_turns WHERE owner=? AND id=?',owner,id));
}
export async function finishMessage(env,owner,id,{answer='',status,sources=[],context,errorCode=null}={}){
  ownerId(owner);itemId(id);text(answer,240000,{empty:true,name:'answer'});
  if(!MESSAGE_STATES.has(status)||status==='running')fail('invalid_request','Invalid completed message state.');
  const existing=await first(env,'SELECT * FROM atlas_turns WHERE owner=? AND id=?',owner,id);if(!existing)missing();
  if(existing.status!=='running')return messageRow(existing);
  if(status==='completed'&&!answer.trim()){status='incomplete';errorCode='empty_response';}
  const now=stamp(),encoded=context===undefined?existing.context_json:limitedJson(context,196608,'attached context');
  await batch(env,[
    ["UPDATE atlas_turns SET answer=?,status=?,sources_json=?,context_json=?,error_code=?,updated_at=? WHERE owner=? AND id=? AND status='running'",answer,status,limitedJson(safeSources(sources),100000,'sources'),encoded,safeCode(errorCode),now,owner,id],
    ['UPDATE atlas_conversations SET updated_at=? WHERE owner=? AND id=?',now,owner,existing.conversation_id]
  ]);return messageRow(await first(env,'SELECT * FROM atlas_turns WHERE owner=? AND id=?',owner,id));
}
export async function setConversationSummary(env,owner,id,{summary,throughId}){
  if(!await getConversation(env,owner,id))missing();text(summary,12000,{empty:true,name:'conversation summary'});
  if(throughId!=null&&!await first(env,'SELECT id FROM atlas_turns WHERE owner=? AND conversation_id=? AND id=?',owner,id,itemId(throughId)))missing();
  await run(env,'UPDATE atlas_conversations SET summary=?,summary_through_id=?,updated_at=? WHERE owner=? AND id=?',summary,throughId||null,stamp(),owner,id);
  return getConversation(env,owner,id);
}
export async function listBriefs(env,owner){return (await all(env,'SELECT owner,id,conversation_id,message_id,title,created_at FROM atlas_briefs WHERE owner=? ORDER BY created_at DESC LIMIT 200',ownerId(owner)));}
export async function createBrief(env,owner,{conversationId,messageId,title}={}){
  const conversation=await getConversation(env,owner,conversationId);if(!conversation)missing();
  const message=await first(env,'SELECT * FROM atlas_turns WHERE owner=? AND conversation_id=? AND id=?',owner,conversationId,itemId(messageId));
  if(!message)missing();if(message.status!=='completed'||!message.answer.trim())fail('brief_incomplete','Finish the answer before saving it as a brief.',409);
  title=text(title||conversation.title,160,{name:'brief title'}).trim();const id=crypto.randomUUID();
  const result=await first(env,'INSERT INTO atlas_briefs(owner,id,conversation_id,message_id,title,answer,sources_json,created_at) SELECT ?,?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM atlas_briefs WHERE owner=?)<500 RETURNING *',owner,id,conversationId,messageId,title,message.answer,message.sources_json,stamp(),owner);
  if(!result)fail('brief_limit','Delete a brief before saving more.',409);return briefRow(result);
}
export async function getBrief(env,owner,id){return briefRow(await first(env,'SELECT * FROM atlas_briefs WHERE owner=? AND id=?',ownerId(owner),itemId(id)));}
export async function deleteBrief(env,owner,id){if(!await getBrief(env,owner,id))missing();await run(env,'DELETE FROM atlas_briefs WHERE owner=? AND id=?',owner,id);return {deleted:true};}

const counted="(dispatched=1 OR status IN ('pending','running'))";
export async function getRequest(env,owner,id){return first(env,'SELECT * FROM atlas_requests WHERE owner=? AND id=?',ownerId(owner),itemId(id));}
export async function recoverStaleRequests(env,owner,{now=stamp()}={}){
  ownerId(owner);finite(now,0,Number.MAX_SAFE_INTEGER,'recovery time');const cutoff=now-600000;
  // These local repairs never replay provider requests. Repair the displayed
  // turn in the same transaction as its ledger row, retaining any partial text.
  // A stale turn whose ledger was already settled is repaired too, covering a
  // worker termination between the two original persistence steps.
  const results=await batch(env,[
    ["UPDATE atlas_turns SET status=COALESCE((SELECT CASE WHEN r.status IN ('failed','cancelled','incomplete') THEN r.status WHEN r.dispatched=1 THEN 'uncertain' ELSE 'failed' END FROM atlas_requests r WHERE r.owner=atlas_turns.owner AND r.id=atlas_turns.id),'uncertain'),error_code=COALESCE((SELECT r.error_code FROM atlas_requests r WHERE r.owner=atlas_turns.owner AND r.id=atlas_turns.id),'request_interrupted'),updated_at=? WHERE owner=? AND status='running' AND created_at<? AND NOT EXISTS(SELECT 1 FROM atlas_requests r WHERE r.owner=atlas_turns.owner AND r.id=atlas_turns.id AND r.created_at>=?)",now,owner,cutoff,cutoff],
    ["UPDATE atlas_requests SET status=CASE WHEN dispatched=1 THEN 'uncertain' ELSE 'failed' END,error_code='request_interrupted',finished_at=? WHERE owner=? AND status IN ('pending','running') AND (operation<>'coding' OR dispatched=0) AND created_at<?",now,owner,cutoff]
  ]);
  return {messagesRecovered:results[0]?.meta?.changes||0,requestsRecovered:results[1]?.meta?.changes||0};
}
export async function reserveRequest(env,owner,{id,operation,model:chosenModel,conversationId=null,estimatedCostUsd=0}={}){
  ownerId(owner);itemId(id);text(operation,40,{name:'request operation'});text(chosenModel,100,{name:'model'});
  if(!/^[a-z_]+$/.test(operation))fail('invalid_request','Invalid request operation.');
  const checkDuplicate=row=>{
    if(row.cancel_requested||row.status==='cancelled')fail('request_cancelled','This request was cancelled.',409);
    if(row.operation!==operation||row.model!==chosenModel||row.conversation_id!==conversationId)fail('request_id_reused','This request identifier belongs to another operation.',409);
    return {duplicate:true,request:row};
  };
  const now=stamp(),day=dayAt(now);
  await recoverStaleRequests(env,owner,{now});
  let row=await getRequest(env,owner,id);if(row)return checkDuplicate(row);
  if(conversationId&&!await getConversation(env,owner,conversationId))missing();
  if(estimatedCostUsd==null)estimatedCostUsd=0;
  finite(estimatedCostUsd,0,10000,'cost estimate');
  row=await first(env,
    "INSERT OR IGNORE INTO atlas_requests(owner,id,conversation_id,operation,model,day,reserved_cost_usd,created_at) SELECT ?,?,?,?,?,?,?,? WHERE COALESCE((SELECT requests FROM atlas_usage WHERE owner=? AND day=?),0)+(SELECT COUNT(*) FROM atlas_requests WHERE owner=? AND day=? AND "+counted+")<COALESCE((SELECT daily_request_limit FROM atlas_settings WHERE owner=?),20) AND ((SELECT daily_budget_usd FROM atlas_settings WHERE owner=?) IS NULL OR ((SELECT COALESCE(SUM(CASE WHEN status IN ('pending','running') OR (dispatched=1 AND estimated_cost_usd IS NULL) THEN MAX(reserved_cost_usd,COALESCE(estimated_cost_usd,0)) ELSE COALESCE(estimated_cost_usd,0) END),0) FROM atlas_requests WHERE owner=? AND day=?)<?+(SELECT daily_budget_usd FROM atlas_settings WHERE owner=?) AND (SELECT COALESCE(SUM(CASE WHEN status IN ('pending','running') OR (dispatched=1 AND estimated_cost_usd IS NULL) THEN MAX(reserved_cost_usd,COALESCE(estimated_cost_usd,0)) ELSE COALESCE(estimated_cost_usd,0) END),0) FROM atlas_requests WHERE owner=? AND day=?)+?<=(SELECT daily_budget_usd FROM atlas_settings WHERE owner=?))) RETURNING *",
    owner,id,conversationId,operation,chosenModel,day,estimatedCostUsd,now,
    owner,day,owner,day,owner,owner,owner,day,0,owner,owner,day,estimatedCostUsd,owner);
  if(row)return {duplicate:false,request:row};
  row=await getRequest(env,owner,id);if(row)return checkDuplicate(row);
  const usage=await usageSummary(env,owner);
  if(usage.totals.requests>=usage.limits.dailyRequestLimit)fail('daily_request_limit','Your daily Atlas request allowance has been reached.',429);
  fail('daily_budget_limit','Your estimated daily Atlas budget has been reached.',429);
}
export async function markRequestDispatched(env,owner,id,{credentialUpdatedAt}={}){
  const guarded=credentialUpdatedAt!==undefined;
  const row=await first(env,"UPDATE atlas_requests SET dispatched=1,status='running' WHERE owner=? AND id=? AND status='pending' AND cancel_requested=0"+(guarded?' AND EXISTS(SELECT 1 FROM atlas_credentials c WHERE c.owner=atlas_requests.owner AND c.updated_at=?)':'')+' RETURNING *',ownerId(owner),itemId(id),...(guarded?[credentialUpdatedAt]:[]));
  if(row)return row;
  const existing=await getRequest(env,owner,id);if(!existing)missing();
  if(existing.cancel_requested||existing.status==='cancelled')fail('request_cancelled','This request was cancelled.',409);
  if(guarded&&existing.status==='pending')fail('provider_connection_changed','The saved OpenAI connection changed while this request was being prepared. Try again with the current connection.',409);
  fail('request_already_dispatched','This request has already been handled.',409);
}
export async function extendRequestReservation(env,owner,id,estimatedCostUsd){
  ownerId(owner);itemId(id);finite(estimatedCostUsd,0,10000,'cost estimate');
  // Every model round shares one request. Atomically compare its new total
  // reservation with other requests on the original billing day, so concurrent
  // continuations cannot each spend the same remaining allowance. A dispatched
  // request with missing final usage retains its reservation in both checks.
  const row=await first(env,
    "UPDATE atlas_requests SET reserved_cost_usd=MAX(reserved_cost_usd,?) WHERE owner=? AND id=? AND cancel_requested=0 AND ((status='pending' AND dispatched=0) OR (status='running' AND dispatched=1)) AND ((SELECT daily_budget_usd FROM atlas_settings WHERE owner=atlas_requests.owner) IS NULL OR (SELECT COALESCE(SUM(CASE WHEN other.status IN ('pending','running') OR (other.dispatched=1 AND other.estimated_cost_usd IS NULL) THEN MAX(other.reserved_cost_usd,COALESCE(other.estimated_cost_usd,0)) ELSE COALESCE(other.estimated_cost_usd,0) END),0) FROM atlas_requests AS other WHERE other.owner=atlas_requests.owner AND other.day=atlas_requests.day AND other.id<>atlas_requests.id)+MAX(reserved_cost_usd,COALESCE(estimated_cost_usd,0),?)<=(SELECT daily_budget_usd FROM atlas_settings WHERE owner=atlas_requests.owner)) RETURNING *",
    estimatedCostUsd,owner,id,estimatedCostUsd);
  if(row)return row;
  const existing=await getRequest(env,owner,id);if(!existing)missing();
  if(existing.cancel_requested||existing.status==='cancelled')fail('request_cancelled','This request was cancelled.',409);
  if(!((existing.status==='pending'&&existing.dispatched===0)||(existing.status==='running'&&existing.dispatched===1)))fail('request_not_active','This request is no longer active.',409);
  fail('daily_budget_limit','Your estimated daily Atlas budget has been reached.',429);
}
export async function finishRequest(env,owner,id,record={}){
  ownerId(owner);itemId(id);
  if(!REQUEST_STATES.has(record.status)||['pending','running'].includes(record.status))fail('invalid_request','Invalid final request state.');
  const existing=await getRequest(env,owner,id);if(!existing)missing();
  if(!['pending','running','uncertain'].includes(existing.status))return existing;
  const number=(key,max)=>record[key]==null?null:finite(record[key],0,max,key);
  const input=number('inputTokens',1000000000),output=number('outputTokens',1000000000),cached=number('cachedTokens',1000000000),searches=number('webSearchCalls',1000000),cost=number('estimatedCostUsd',10000),duration=number('durationMs',86400000);
  const upstream=typeof record.upstreamRequestId==='string'&&/^[A-Za-z0-9_.:-]{1,200}$/.test(record.upstreamRequestId)?record.upstreamRequestId:null;
  await run(env,"UPDATE atlas_requests SET status=?,input_tokens=?,output_tokens=?,cached_tokens=?,web_search_calls=?,estimated_cost_usd=?,error_code=?,upstream_request_id=?,duration_ms=?,finished_at=? WHERE owner=? AND id=? AND status IN ('pending','running','uncertain')",record.status,input,output,cached,searches,cost,safeCode(record.errorCode),upstream,duration,stamp(),owner,id);
  return getRequest(env,owner,id);
}
export async function cancelRequest(env,owner,id,{undispatchedOnly=false}={}){
  ownerId(owner);itemId(id);const now=stamp();
  // Stop can arrive while preflight is still loading and before reservation.
  // Persist that intent first; a later reservation cannot overwrite this row.
  await batch(env,[
    ["INSERT OR IGNORE INTO atlas_requests(owner,id,operation,model,day,status,cancel_requested,error_code,created_at,finished_at) VALUES(?,?,'cancel','cancelled',?,'cancelled',1,'request_cancelled',?,?)",owner,id,dayAt(now),now,now],
    ["UPDATE atlas_requests SET cancel_requested=1,status=CASE WHEN dispatched=0 THEN 'cancelled' ELSE status END,error_code=CASE WHEN dispatched=0 THEN 'request_cancelled' ELSE error_code END,finished_at=CASE WHEN dispatched=0 THEN ? ELSE finished_at END WHERE owner=? AND id=? AND status IN ('pending','running')"+(undispatchedOnly?' AND dispatched=0':''),now,owner,id]
  ]);
  return getRequest(env,owner,id);
}
export async function usageSummary(env,owner){
  ownerId(owner);const day=dayAt(stamp()),settings=await getSettings(env,owner);
  await recoverStaleRequests(env,owner);
  const records=await all(env,'SELECT * FROM atlas_requests WHERE owner=? AND day=? ORDER BY created_at DESC LIMIT 500',owner,day);
  const legacy=await first(env,'SELECT requests FROM atlas_usage WHERE owner=? AND day=?',owner,day);
  // The display list is bounded independently from the allowance and cost
  // totals: repeated local preflight failures must not hide older paid work.
  const total=await first(env,"SELECT COALESCE(SUM(CASE WHEN "+counted+" THEN 1 ELSE 0 END),0) AS requests,COALESCE(SUM(status='completed'),0) AS completed,COALESCE(SUM(status NOT IN ('completed','pending','running')),0) AS failed,COALESCE(SUM(status IN ('pending','running')),0) AS pending,COALESCE(SUM(input_tokens),0) AS inputTokens,COALESCE(SUM(output_tokens),0) AS outputTokens,COALESCE(SUM(estimated_cost_usd),0) AS estimatedCostUsd,COALESCE(SUM(dispatched=1 AND estimated_cost_usd IS NULL),0) AS unknownCostRequests FROM atlas_requests WHERE owner=? AND day=?",owner,day);
  const totals={...total,requests:total.requests+(legacy?.requests||0),unknownCostRequests:total.unknownCostRequests+(legacy?.requests||0)};
  totals.estimatedCostUsd=Math.round(totals.estimatedCostUsd*1000000000)/1000000000;
  return {day,limits:{dailyRequestLimit:settings.dailyRequestLimit,dailyBudgetUsd:settings.dailyBudgetUsd},totals,requests:records.map(({owner:_,...record})=>record),budgetIsEstimate:true};
}
export async function getProviderHealth(env,owner){
  const row=await first(env,'SELECT * FROM atlas_provider_health WHERE owner=?',ownerId(owner));
  return row?{model:row.model,lastCheckedAt:row.last_checked_at,lastSuccessAt:row.last_success_at,lastErrorCode:row.last_error_code,credentialUpdatedAt:row.credential_updated_at}:{model:null,lastCheckedAt:null,lastSuccessAt:null,lastErrorCode:null,credentialUpdatedAt:null};
}
export async function recordProviderHealth(env,owner,patch={}){
  ownerId(owner);const current=await getProviderHealth(env,owner),value={...current,...patch};
  if(value.model!=null)text(value.model,100,{name:'model'});
  for(const name of ['lastCheckedAt','lastSuccessAt','credentialUpdatedAt'])if(value[name]!=null)finite(value[name],0,Number.MAX_SAFE_INTEGER,name);
  const guard=Object.hasOwn(patch,'credentialUpdatedAt')&&patch.credentialUpdatedAt!=null;
  await run(env,'INSERT INTO atlas_provider_health(owner,model,last_checked_at,last_success_at,last_error_code,credential_updated_at) SELECT ?,?,?,?,?,? WHERE ?=0 OR EXISTS(SELECT 1 FROM atlas_credentials WHERE owner=? AND updated_at=?) ON CONFLICT(owner) DO UPDATE SET model=excluded.model,last_checked_at=excluded.last_checked_at,last_success_at=excluded.last_success_at,last_error_code=excluded.last_error_code,credential_updated_at=excluded.credential_updated_at',owner,value.model,value.lastCheckedAt,value.lastSuccessAt,safeCode(value.lastErrorCode),value.credentialUpdatedAt,Number(guard),owner,patch.credentialUpdatedAt??null);
  return getProviderHealth(env,owner);
}

function localParts(time,zone){
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(time);
  return Object.fromEntries(parts.filter(p=>['year','month','day','hour','minute'].includes(p.type)).map(p=>[p.type,Number(p.value)]));
}
function wallValue(parts){return Date.UTC(parts.year,parts.month-1,parts.day,parts.hour||0,parts.minute||0);}
function resolveWallTime(parts,zone){
  const target=wallValue(parts),offsets=new Set();
  for(const shift of [-172800000,-86400000,0,86400000,172800000]){const time=target+shift;offsets.add(wallValue(localParts(time,zone))-time);}
  const candidates=[...offsets].map(offset=>target-offset).sort((a,b)=>a-b);
  const exact=candidates.filter(time=>wallValue(localParts(time,zone))===target);
  if(exact.length)return exact[0]; // A repeated wall-clock time runs once, at its first occurrence.
  const later=candidates.map(time=>({time,wall:wallValue(localParts(time,zone))})).filter(x=>x.wall>target&&x.wall-target<=86400000).sort((a,b)=>a.wall-b.wall||a.time-b.time);
  // Move a nonexistent local time forward by the daylight-saving gap.
  if(later.length)return later[0].time;
  fail('schedule_time_unavailable','This local schedule time could not be resolved.');
}
export function nextTaskRun(task,after=Date.now()){
  finite(after,0,8640000000000000,'schedule time');
  if(task.schedule_kind==='interval')return after+finite(task.interval_minutes,60,10080,'schedule interval')*60000;
  const zone=validTimeZone(task.timezone),clock=/^(\d\d):(\d\d)$/.exec(task.local_time||'');
  if(!clock||Number(clock[1])>23||Number(clock[2])>59)fail('invalid_schedule','Choose a valid local time.');
  const current=localParts(after,zone),date=Date.UTC(current.year,current.month-1,current.day),weekdays=task.weekdays||parse(task.weekdays_json,[]);
  for(let offset=0;offset<=8;offset++){
    const d=new Date(date+offset*86400000);
    if(task.schedule_kind==='weekly'&&!weekdays.includes(d.getUTCDay()))continue;
    const result=resolveWallTime({year:d.getUTCFullYear(),month:d.getUTCMonth()+1,day:d.getUTCDate(),hour:Number(clock[1]),minute:Number(clock[2])},zone);
    if(result>after)return result;
  }
  fail('invalid_schedule','The schedule does not have a future run.');
}
function taskValue(body,previous=null){
  if(!body||typeof body!=='object'||Array.isArray(body))fail('invalid_schedule','Invalid scheduled task.');
  const value={...(previous||{}),...body};
  value.prompt=text(value.prompt,12000,{name:'scheduled prompt'}).trim();
  value.title=text(value.title||value.prompt.slice(0,80),160,{name:'task title'}).trim();
  value.mode=mode(value.mode||'research');value.repository=repository(value.repository);
  if(value.repository&&value.mode!=='developer')fail('invalid_repository','Repository context belongs to Developer tasks.');
  value.schedule_kind=value.schedule_kind||'interval';
  if(!['interval','daily','weekly'].includes(value.schedule_kind))fail('invalid_schedule','Choose interval, daily or weekly scheduling.');
  value.timezone=validTimeZone(value.timezone||'Europe/London');
  if(value.schedule_kind==='interval'){
    value.interval_minutes=value.interval_minutes??1440;
    if(!Number.isInteger(value.interval_minutes))fail('invalid_schedule','The interval must be a whole number of minutes.');
    finite(value.interval_minutes,60,10080,'interval');value.local_time=null;value.weekdays=[];
  }else{
    value.interval_minutes=null;const match=/^(\d\d):(\d\d)$/.exec(value.local_time||'09:00');
    if(!match||Number(match[1])>23||Number(match[2])>59)fail('invalid_schedule','Choose a local time in HH:mm format.');
    value.local_time=match[0];
    if(value.schedule_kind==='weekly'){
      if(!Array.isArray(value.weekdays)||!value.weekdays.length||value.weekdays.length>7||value.weekdays.some(n=>!Number.isInteger(n)||n<0||n>6))fail('invalid_schedule','Choose at least one weekday.');
      value.weekdays=[...new Set(value.weekdays)].sort();
    }else value.weekdays=[];
  }
  value.include_fitness=Object.hasOwn(body,'includeFitness')?body.includeFitness:bool(value.include_fitness);
  if(typeof value.include_fitness!=='boolean'||(value.include_fitness&&value.mode!=='fitness'))fail('invalid_schedule','Fitness context needs an explicit Fitness workspace choice.');
  value.context=Object.hasOwn(body,'context')?body.context:(value.context||[]);
  if(!Array.isArray(value.context)||value.context.length>12)fail('invalid_context','Choose at most twelve context items.');
  value.context_json=limitedJson(value.context,32000,'schedule context');
  return value;
}
const taskSelect="SELECT s.*,(SELECT MAX(r.started_at) FROM atlas_schedule_runs r WHERE r.owner=s.owner AND r.task_id=s.id) AS last_run,(SELECT r.status FROM atlas_schedule_runs r WHERE r.owner=s.owner AND r.task_id=s.id ORDER BY r.started_at DESC,r.id DESC LIMIT 1) AS last_status FROM atlas_schedules s";
function fullTask(row){const value=taskRow(row);if(!value)return null;value.context=parse(value.context_json,[]);delete value.context_json;value.includeFitness=bool(value.include_fitness);return value;}
export async function listTasks(env,owner){return (await all(env,taskSelect+' WHERE s.owner=? ORDER BY s.created_at DESC,s.id LIMIT 50',ownerId(owner))).map(fullTask);}
export async function getTask(env,owner,id){return fullTask(await first(env,taskSelect+' WHERE s.owner=? AND s.id=?',ownerId(owner),itemId(id)));}
export async function createTask(env,owner,body={}){
  ownerId(owner);const value=taskValue(body),id=crypto.randomUUID(),now=stamp();
  if((await first(env,'SELECT COUNT(*) AS count FROM atlas_schedules WHERE owner=?',owner)).count>=50)fail('task_limit','Delete an old scheduled task before creating more.',409);
  let conversationId=body.conversationId||null;
  if(conversationId){const c=await getConversation(env,owner,conversationId);if(!c)missing();if(c.mode!==value.mode||c.repository!==value.repository)fail('conversation_context_fixed','Choose a conversation with matching workspace and repository.',409);}
  else conversationId=crypto.randomUUID();
  const commands=[];
  if(!body.conversationId)commands.push(['INSERT INTO atlas_conversations(owner,id,title,mode,repository,created_at,updated_at) SELECT ?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM atlas_schedules WHERE owner=?)<50',owner,conversationId,'Schedule: '+value.title,value.mode,value.repository,now,now,owner]);
  commands.push(['INSERT INTO atlas_schedules(owner,id,conversation_id,title,prompt,mode,repository,schedule_kind,interval_minutes,local_time,timezone,weekdays_json,include_fitness,context_json,created_at,updated_at) SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM atlas_schedules WHERE owner=?)<50',owner,id,conversationId,value.title,value.prompt,value.mode,value.repository,value.schedule_kind,value.interval_minutes,value.local_time,value.timezone,JSON.stringify(value.weekdays),Number(value.include_fitness),value.context_json,now,now,owner]);
  await batch(env,commands);const result=await getTask(env,owner,id);if(!result)fail('task_limit','Delete an old scheduled task before creating more.',409);return result;
}
export async function updateTask(env,owner,id,body={}){
  const current=await getTask(env,owner,id);if(!current)missing();const value=taskValue(body,current);
  if(value.mode!==current.mode||value.repository!==current.repository)fail('conversation_context_fixed','Create a new task to change workspace or repository.',409);
  const enabled=Object.hasOwn(body,'enabled')?body.enabled:current.enabled;if(typeof enabled!=='boolean')fail('invalid_schedule','Invalid task activation choice.');
  if(enabled&&!current.enabled&&body.confirm!==true)fail('confirmation_required','Confirm recurring API usage before enabling this task.',409);
  const now=stamp(),scheduleChanged=['schedule_kind','interval_minutes','local_time','timezone','weekdays'].some(k=>Object.hasOwn(body,k));
  const next=enabled?(!current.enabled||scheduleChanged?nextTaskRun(value,now):current.next_run):null;
  const commands=[['UPDATE atlas_schedules SET title=?,prompt=?,enabled=?,schedule_kind=?,interval_minutes=?,local_time=?,timezone=?,weekdays_json=?,include_fitness=?,context_json=?,next_run=?,updated_at=? WHERE owner=? AND id=?',value.title,value.prompt,Number(enabled),value.schedule_kind,value.interval_minutes,value.local_time,value.timezone,JSON.stringify(value.weekdays),Number(value.include_fitness),value.context_json,next,now,owner,id]];
  if(enabled)commands.push(['INSERT INTO atlas_controls(owner,stopped) VALUES(?,0) ON CONFLICT(owner) DO UPDATE SET stopped=0',owner]);
  if(body.enabled===false)commands.push(["UPDATE atlas_schedule_runs SET cancel_requested=1 WHERE owner=? AND task_id=? AND status IN ('queued','running')",owner,id]);
  await batch(env,commands);return getTask(env,owner,id);
}
export async function stopTasks(env,owner){
  ownerId(owner);await batch(env,[
    ['INSERT INTO atlas_controls(owner,stopped) VALUES(?,1) ON CONFLICT(owner) DO UPDATE SET stopped=1',owner],
    ['UPDATE atlas_schedules SET enabled=0,next_run=NULL,updated_at=? WHERE owner=?',stamp(),owner],
    ['UPDATE atlas_tasks SET enabled=0,next_run=NULL WHERE owner=?',owner],
    ["UPDATE atlas_schedule_runs SET cancel_requested=1 WHERE owner=? AND status IN ('queued','running')",owner],
    ["UPDATE atlas_requests SET cancel_requested=1 WHERE owner=? AND id IN (SELECT request_id FROM atlas_schedule_runs WHERE owner=? AND status IN ('queued','running'))",owner,owner]
  ]);return {stopped:true};
}
export async function taskRuns(env,owner,id){
  if(!await getTask(env,owner,id))missing();
  return (await all(env,'SELECT * FROM atlas_schedule_runs WHERE owner=? AND task_id=? ORDER BY started_at DESC,id DESC LIMIT 100',owner,id)).map(row=>{const {sources_json,...rest}=row;return {...rest,sources:parse(sources_json,[]),manual:bool(row.manual)};});
}
export async function deleteTask(env,owner,id){
  const task=await getTask(env,owner,id);if(!task)missing();
  if(task.lease_id)fail('task_running','Stop the running task before removing its schedule.',409);
  await run(env,'DELETE FROM atlas_schedules WHERE owner=? AND id=?',owner,id);return {deleted:true};
}
