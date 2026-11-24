-- Persist selected cross-app references, never a copy of private message bodies.
CREATE TABLE IF NOT EXISTS atlas_workspace_contexts (
 owner TEXT NOT NULL, conversation_id TEXT NOT NULL,
 source_json TEXT NOT NULL, metadata_json TEXT NOT NULL,
 updated_at INTEGER NOT NULL,
 PRIMARY KEY(owner,conversation_id),
 FOREIGN KEY(owner,conversation_id) REFERENCES atlas_conversations(owner,id) ON DELETE CASCADE
);
INSERT INTO atlas_schema(id,version,updated_at) VALUES(1,9,CAST(strftime('%s','now') AS INTEGER)*1000)
 ON CONFLICT(id) DO UPDATE SET version=MAX(version,excluded.version),updated_at=excluded.updated_at;
