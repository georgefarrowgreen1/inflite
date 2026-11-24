-- Independent research and verification within an explicitly approved run.
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
