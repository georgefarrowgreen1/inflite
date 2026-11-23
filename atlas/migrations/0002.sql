CREATE TABLE IF NOT EXISTS atlas_tasks (
 id TEXT PRIMARY KEY,
 owner TEXT NOT NULL,
 prompt TEXT NOT NULL,
 interval_minutes INTEGER NOT NULL CHECK(interval_minutes BETWEEN 60 AND 10080),
 enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN (0,1)),
 next_run INTEGER,
 created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS atlas_tasks_owner ON atlas_tasks(owner);
CREATE TABLE IF NOT EXISTS atlas_task_runs (
 id TEXT PRIMARY KEY,
 task_id TEXT NOT NULL,
 owner TEXT NOT NULL,
 started_at INTEGER NOT NULL,
 finished_at INTEGER,
 status TEXT NOT NULL CHECK(status IN ('running','completed','failed','cancelled')),
 result TEXT,
 FOREIGN KEY(task_id) REFERENCES atlas_tasks(id)
);
