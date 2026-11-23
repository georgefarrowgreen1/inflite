CREATE TABLE IF NOT EXISTS atlas_improvements (
 id TEXT PRIMARY KEY,
 owner TEXT NOT NULL,
 title TEXT NOT NULL,
 hypothesis TEXT NOT NULL,
 metric TEXT NOT NULL,
 baseline TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'proposed' CHECK(status IN ('proposed','archived')),
 created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS atlas_improvements_owner ON atlas_improvements(owner,created_at DESC);
CREATE TABLE IF NOT EXISTS atlas_evaluations (
 id TEXT PRIMARY KEY,
 improvement_id TEXT NOT NULL REFERENCES atlas_improvements(id),
 owner TEXT NOT NULL,
 candidate_sha TEXT NOT NULL,
 baseline_sha TEXT NOT NULL,
 evidence_url TEXT NOT NULL,
 outcome TEXT NOT NULL CHECK(outcome IN ('pass','fail','inconclusive')),
 created_at INTEGER NOT NULL
);
