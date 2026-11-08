CREATE TABLE IF NOT EXISTS shared_builds (
  id TEXT PRIMARY KEY,
  fingerprint TEXT NOT NULL UNIQUE,
  build_json TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
