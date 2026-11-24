-- Durable manual answers and a common timeline for existing Atlas executors.
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
