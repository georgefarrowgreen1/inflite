-- Reusable cloud environment recipes. A coding run keeps an immutable snapshot.
CREATE TABLE IF NOT EXISTS atlas_environments (
 owner TEXT NOT NULL, id TEXT NOT NULL, name TEXT NOT NULL, repository TEXT NOT NULL,
 branch TEXT NOT NULL DEFAULT '', setup_command TEXT NOT NULL DEFAULT '', test_command TEXT NOT NULL DEFAULT '',
 machine TEXT NOT NULL DEFAULT 'medium' CHECK(machine IN ('small','medium','large')),
 network TEXT NOT NULL DEFAULT 'dependencies' CHECK(network IN ('dependencies','off')),
 revision INTEGER NOT NULL DEFAULT 1,
 archived INTEGER NOT NULL DEFAULT 0 CHECK(archived IN (0,1)),
 created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
 PRIMARY KEY(owner,id)
);
CREATE INDEX IF NOT EXISTS atlas_environments_owner ON atlas_environments(owner,archived,updated_at DESC);
ALTER TABLE atlas_coding_runs ADD COLUMN environment_profile_id TEXT;
ALTER TABLE atlas_coding_runs ADD COLUMN environment_config_json TEXT NOT NULL DEFAULT '{}';
ALTER TABLE atlas_coding_runs ADD COLUMN cloud_status TEXT;
ALTER TABLE atlas_coding_runs ADD COLUMN cloud_checked_at INTEGER;
ALTER TABLE atlas_coding_runs ADD COLUMN retry_from_run_id TEXT;
INSERT INTO atlas_schema(id,version,updated_at) VALUES(1,8,CAST(strftime('%s','now') AS INTEGER)*1000)
 ON CONFLICT(id) DO UPDATE SET version=MAX(version,excluded.version),updated_at=excluded.updated_at;
