CREATE TABLE IF NOT EXISTS sync_accounts (
  sync_id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sync_blobs (
  sync_id TEXT NOT NULL,
  scope TEXT NOT NULL,
  ciphertext TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (sync_id, scope),
  FOREIGN KEY (sync_id) REFERENCES sync_accounts(sync_id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS refresh_runs (
  request_id TEXT PRIMARY KEY,
  scope TEXT NOT NULL,
  source TEXT NOT NULL,
  status TEXT NOT NULL,
  started_at TEXT,
  completed_at TEXT,
  duration_ms INTEGER,
  result_json TEXT,
  error TEXT
);
CREATE INDEX IF NOT EXISTS idx_refresh_scope_time ON refresh_runs(scope, completed_at DESC);
CREATE TABLE IF NOT EXISTS refresh_limits (
  limit_key TEXT PRIMARY KEY,
  last_requested_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS analytics_daily (
  day TEXT NOT NULL,
  path TEXT NOT NULL,
  views INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, path)
);
