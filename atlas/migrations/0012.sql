-- One attempted repair per confirmed Status incident and Atlas owner.
CREATE TABLE IF NOT EXISTS atlas_incident_repairs (
 owner TEXT NOT NULL, incident_id TEXT NOT NULL,
 title TEXT NOT NULL, repository TEXT, branch TEXT, prompt TEXT, services_json TEXT NOT NULL,
 conversation_id TEXT NOT NULL, request_id TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('pending','started','stopped','attention')),
 message TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
 PRIMARY KEY(owner,incident_id), UNIQUE(owner,request_id)
);

INSERT INTO atlas_schema(id,version,updated_at) VALUES(1,12,CAST(strftime('%s','now') AS INTEGER)*1000)
 ON CONFLICT(id) DO UPDATE SET version=MAX(version,excluded.version),updated_at=excluded.updated_at;
