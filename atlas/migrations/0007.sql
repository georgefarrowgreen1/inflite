-- Persistent coding workspaces. Each changed file has its own bounded row.
CREATE TABLE IF NOT EXISTS atlas_coding_runs (
 owner TEXT NOT NULL, id TEXT NOT NULL, conversation_id TEXT NOT NULL, request_id TEXT NOT NULL,
 prompt TEXT NOT NULL, model TEXT NOT NULL, credential_updated_at INTEGER NOT NULL,
 repository TEXT NOT NULL, base_branch TEXT, base_sha TEXT, base_tree_sha TEXT,
 status TEXT NOT NULL DEFAULT 'preparing', stage TEXT NOT NULL DEFAULT 'Preparing workspace', phase TEXT NOT NULL DEFAULT 'snapshot',
 revision INTEGER NOT NULL DEFAULT 1, manifest_json TEXT NOT NULL DEFAULT '{}',
 session_id TEXT, environment_id TEXT, input_file_id TEXT, turn_id TEXT,
 prior_turns_json TEXT NOT NULL DEFAULT '[]', input_key TEXT NOT NULL,
 budget_cents INTEGER NOT NULL DEFAULT 200, total_budget_cents INTEGER NOT NULL DEFAULT 200,
 consumed_before INTEGER NOT NULL DEFAULT 0, consumed_after INTEGER,
 summary TEXT NOT NULL DEFAULT '', checks_json TEXT NOT NULL DEFAULT '[]', activity_json TEXT NOT NULL DEFAULT '[]',
 changes_json TEXT NOT NULL DEFAULT '{"added":0,"modified":0,"deleted":0}',
 error_code TEXT, error_message TEXT, review_ready INTEGER NOT NULL DEFAULT 0, can_continue INTEGER NOT NULL DEFAULT 0,
 cancel_requested INTEGER NOT NULL DEFAULT 0, cancel_generation INTEGER NOT NULL DEFAULT 0, lease_id TEXT, lease_until INTEGER,
 publish_url TEXT, publish_number INTEGER, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
 finished_at INTEGER, dispatched_at INTEGER,
 PRIMARY KEY(owner,id), UNIQUE(owner,request_id),
 FOREIGN KEY(owner,conversation_id) REFERENCES atlas_conversations(owner,id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS atlas_coding_runs_conversation ON atlas_coding_runs(owner,conversation_id,created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS atlas_coding_runs_active ON atlas_coding_runs(owner,conversation_id)
 WHERE status IN ('preparing','running','waiting','uncertain','publishing');
CREATE TABLE IF NOT EXISTS atlas_coding_changes (
 owner TEXT NOT NULL, run_id TEXT NOT NULL, revision INTEGER NOT NULL, path TEXT NOT NULL,
 operation TEXT NOT NULL, before_sha TEXT, before_mode TEXT, after_sha TEXT, after_mode TEXT,
 content_base64 TEXT, binary INTEGER NOT NULL DEFAULT 0, diff TEXT NOT NULL DEFAULT '', diff_truncated INTEGER NOT NULL DEFAULT 0,
 added_lines INTEGER, removed_lines INTEGER, bytes INTEGER NOT NULL DEFAULT 0,
 PRIMARY KEY(owner,run_id,revision,path),
 FOREIGN KEY(owner,run_id) REFERENCES atlas_coding_runs(owner,id) ON DELETE CASCADE
);
INSERT INTO atlas_schema(id,version,updated_at) VALUES(1,7,CAST(strftime('%s','now') AS INTEGER)*1000)
 ON CONFLICT(id) DO UPDATE SET version=MAX(version,excluded.version),updated_at=excluded.updated_at;
