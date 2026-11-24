-- Atlas conversations and execution records. Additive and safe to reapply.
CREATE TABLE IF NOT EXISTS atlas_schema (id INTEGER PRIMARY KEY CHECK(id=1), version INTEGER NOT NULL, updated_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS atlas_settings (
 owner TEXT PRIMARY KEY, memory_enabled INTEGER NOT NULL DEFAULT 0 CHECK(memory_enabled IN (0,1)), memory TEXT NOT NULL DEFAULT '',
 daily_request_limit INTEGER NOT NULL DEFAULT 20 CHECK(daily_request_limit BETWEEN 1 AND 100), daily_budget_usd REAL,
 timezone TEXT NOT NULL DEFAULT 'Europe/London', updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS atlas_conversations (
 owner TEXT NOT NULL, id TEXT NOT NULL, title TEXT NOT NULL, mode TEXT NOT NULL, repository TEXT,
 archived INTEGER NOT NULL DEFAULT 0 CHECK(archived IN (0,1)), summary TEXT NOT NULL DEFAULT '', summary_through_id TEXT,
 created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, PRIMARY KEY(owner,id)
);
CREATE INDEX IF NOT EXISTS atlas_conversations_owner_updated ON atlas_conversations(owner,archived,updated_at DESC);
CREATE TABLE IF NOT EXISTS atlas_turns (
 owner TEXT NOT NULL, id TEXT NOT NULL, conversation_id TEXT NOT NULL, prompt TEXT NOT NULL, answer TEXT NOT NULL DEFAULT '',
 status TEXT NOT NULL CHECK(status IN ('running','completed','incomplete','cancelled','failed','uncertain')),
 sources_json TEXT NOT NULL DEFAULT '[]', context_json TEXT NOT NULL DEFAULT '[]', error_code TEXT,
 created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, PRIMARY KEY(owner,id),
 FOREIGN KEY(owner,conversation_id) REFERENCES atlas_conversations(owner,id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS atlas_turns_conversation ON atlas_turns(owner,conversation_id,created_at,id);
CREATE TABLE IF NOT EXISTS atlas_requests (
 owner TEXT NOT NULL, id TEXT NOT NULL, conversation_id TEXT, operation TEXT NOT NULL, model TEXT NOT NULL, day TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','running','completed','failed','cancelled','incomplete','uncertain')),
 dispatched INTEGER NOT NULL DEFAULT 0 CHECK(dispatched IN (0,1)), cancel_requested INTEGER NOT NULL DEFAULT 0 CHECK(cancel_requested IN (0,1)),
 reserved_cost_usd REAL NOT NULL DEFAULT 0, estimated_cost_usd REAL, input_tokens INTEGER, output_tokens INTEGER, cached_tokens INTEGER,
 web_search_calls INTEGER, error_code TEXT, upstream_request_id TEXT, duration_ms INTEGER,
 created_at INTEGER NOT NULL, finished_at INTEGER, PRIMARY KEY(owner,id)
);
CREATE INDEX IF NOT EXISTS atlas_requests_owner_day ON atlas_requests(owner,day,created_at DESC);
CREATE TABLE IF NOT EXISTS atlas_briefs (
 owner TEXT NOT NULL, id TEXT NOT NULL, conversation_id TEXT NOT NULL, message_id TEXT NOT NULL, title TEXT NOT NULL,
 answer TEXT NOT NULL, sources_json TEXT NOT NULL DEFAULT '[]', created_at INTEGER NOT NULL, PRIMARY KEY(owner,id),
 FOREIGN KEY(owner,conversation_id) REFERENCES atlas_conversations(owner,id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS atlas_briefs_owner_created ON atlas_briefs(owner,created_at DESC);
CREATE TABLE IF NOT EXISTS atlas_provider_health (
 owner TEXT PRIMARY KEY, model TEXT, last_checked_at INTEGER, last_success_at INTEGER, last_error_code TEXT, credential_updated_at INTEGER
);
CREATE TABLE IF NOT EXISTS atlas_schedules (
 owner TEXT NOT NULL, id TEXT NOT NULL, conversation_id TEXT, title TEXT NOT NULL, prompt TEXT NOT NULL, mode TEXT NOT NULL DEFAULT 'research', repository TEXT,
 enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN (0,1)), schedule_kind TEXT NOT NULL CHECK(schedule_kind IN ('interval','daily','weekly')),
 interval_minutes INTEGER, local_time TEXT, timezone TEXT NOT NULL DEFAULT 'Europe/London', weekdays_json TEXT NOT NULL DEFAULT '[]', include_fitness INTEGER NOT NULL DEFAULT 0 CHECK(include_fitness IN (0,1)), context_json TEXT NOT NULL DEFAULT '[]',
 next_run INTEGER, lease_id TEXT, lease_until INTEGER, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, PRIMARY KEY(owner,id),
 FOREIGN KEY(owner,conversation_id) REFERENCES atlas_conversations(owner,id)
);
CREATE INDEX IF NOT EXISTS atlas_schedules_due ON atlas_schedules(enabled,next_run,lease_until);
CREATE TABLE IF NOT EXISTS atlas_schedule_runs (
 owner TEXT NOT NULL, id TEXT NOT NULL, task_id TEXT NOT NULL, request_id TEXT NOT NULL, occurrence_key TEXT NOT NULL, scheduled_for INTEGER,
 status TEXT NOT NULL CHECK(status IN ('queued','running','completed','incomplete','failed','cancelled','skipped','uncertain')),
 started_at INTEGER NOT NULL, finished_at INTEGER, result TEXT, prompt_snapshot TEXT, sources_json TEXT NOT NULL DEFAULT '[]', error_code TEXT,
 cancel_requested INTEGER NOT NULL DEFAULT 0 CHECK(cancel_requested IN (0,1)), manual INTEGER NOT NULL DEFAULT 0 CHECK(manual IN (0,1)),
 PRIMARY KEY(owner,id), UNIQUE(owner,task_id,occurrence_key), FOREIGN KEY(owner,task_id) REFERENCES atlas_schedules(owner,id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS atlas_schedule_runs_task ON atlas_schedule_runs(owner,task_id,started_at DESC);
CREATE TABLE IF NOT EXISTS atlas_integrations (
 owner TEXT NOT NULL, kind TEXT NOT NULL, iv TEXT NOT NULL, ciphertext TEXT NOT NULL, metadata TEXT NOT NULL DEFAULT '{}',
 updated_at INTEGER NOT NULL, PRIMARY KEY(owner,kind)
);
CREATE TABLE IF NOT EXISTS atlas_patches (
 id TEXT NOT NULL, owner TEXT NOT NULL, conversation_id TEXT, repository TEXT NOT NULL, base_sha TEXT NOT NULL,
 title TEXT NOT NULL, summary TEXT NOT NULL, files_json TEXT NOT NULL, test_plan TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'draft',
 url TEXT, number INTEGER, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, PRIMARY KEY(owner,id)
);
CREATE INDEX IF NOT EXISTS atlas_patches_owner_created ON atlas_patches(owner,created_at DESC);
CREATE TABLE IF NOT EXISTS atlas_imports (kind TEXT NOT NULL, owner TEXT NOT NULL, source_id TEXT NOT NULL, PRIMARY KEY(kind,owner,source_id));
-- Import markers prevent deleted or renamed legacy content being resurrected.
INSERT OR IGNORE INTO atlas_conversations(owner,id,title,mode,repository,created_at,updated_at)
 SELECT owner,'legacy-'||lower(hex(owner))||'-'||mode,'Imported '||mode||' history',mode,NULL,MIN(created_at),MAX(created_at) FROM atlas_messages m
 WHERE NOT EXISTS(SELECT 1 FROM atlas_imports i WHERE i.kind='message' AND i.owner=m.owner AND i.source_id=CAST(m.id AS TEXT)) GROUP BY owner,mode;
INSERT OR IGNORE INTO atlas_turns(owner,id,conversation_id,prompt,answer,status,created_at,updated_at)
 SELECT owner,'legacy-'||id,'legacy-'||lower(hex(owner))||'-'||mode,prompt,answer,CASE WHEN length(trim(answer))>0 THEN 'completed' ELSE 'incomplete' END,created_at,created_at FROM atlas_messages m
 WHERE NOT EXISTS(SELECT 1 FROM atlas_imports i WHERE i.kind='message' AND i.owner=m.owner AND i.source_id=CAST(m.id AS TEXT));
INSERT OR IGNORE INTO atlas_imports(kind,owner,source_id) SELECT 'message',owner,CAST(id AS TEXT) FROM atlas_messages;
INSERT OR IGNORE INTO atlas_conversations(owner,id,title,mode,repository,created_at,updated_at)
 SELECT owner,'schedule-'||id,'Schedule: '||substr(prompt,1,80),'research',NULL,created_at,created_at FROM atlas_tasks t
 WHERE NOT EXISTS(SELECT 1 FROM atlas_imports i WHERE i.kind='task' AND i.owner=t.owner AND i.source_id=t.id);
INSERT OR IGNORE INTO atlas_schedules(owner,id,conversation_id,title,prompt,mode,repository,enabled,schedule_kind,interval_minutes,timezone,created_at,updated_at)
 SELECT owner,id,'schedule-'||id,substr(prompt,1,80),prompt,'research',NULL,0,'interval',interval_minutes,'Europe/London',created_at,created_at FROM atlas_tasks t
 WHERE NOT EXISTS(SELECT 1 FROM atlas_imports i WHERE i.kind='task' AND i.owner=t.owner AND i.source_id=t.id);
INSERT OR IGNORE INTO atlas_imports(kind,owner,source_id) SELECT 'task',owner,id FROM atlas_tasks;
INSERT OR IGNORE INTO atlas_schedule_runs(owner,id,task_id,request_id,occurrence_key,status,started_at,finished_at,result,error_code)
 SELECT r.owner,'legacy-'||r.id,r.task_id,'legacy-'||r.id,'legacy-'||r.id,CASE WHEN r.status='running' THEN 'uncertain' ELSE r.status END,r.started_at,r.finished_at,r.result,CASE WHEN r.status='running' THEN 'legacy_interrupted' ELSE NULL END
 FROM atlas_task_runs r JOIN atlas_schedules s ON s.owner=r.owner AND s.id=r.task_id
 WHERE NOT EXISTS(SELECT 1 FROM atlas_imports i WHERE i.kind='run' AND i.owner=r.owner AND i.source_id=r.id);
INSERT OR IGNORE INTO atlas_imports(kind,owner,source_id) SELECT 'run',owner,id FROM atlas_task_runs;
INSERT INTO atlas_schema(id,version,updated_at) VALUES(1,6,CAST(strftime('%s','now') AS INTEGER)*1000)
 ON CONFLICT(id) DO UPDATE SET version=MAX(version,excluded.version),updated_at=excluded.updated_at;
