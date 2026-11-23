CREATE TABLE IF NOT EXISTS atlas_messages (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 owner TEXT NOT NULL,
 mode TEXT NOT NULL,
 prompt TEXT NOT NULL,
 answer TEXT NOT NULL,
 created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS atlas_messages_owner_mode ON atlas_messages(owner,mode,id DESC);
CREATE TABLE IF NOT EXISTS atlas_usage (
 owner TEXT NOT NULL,
 day TEXT NOT NULL,
 requests INTEGER NOT NULL DEFAULT 0,
 PRIMARY KEY(owner,day)
);
