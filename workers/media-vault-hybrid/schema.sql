-- Independent Media Vault hybrid control plane: metadata ONLY. NEVER store file bytes.
CREATE TABLE IF NOT EXISTS mv_hybrid_jobs (
  id TEXT PRIMARY KEY, kind TEXT NOT NULL, request_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued', created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL, lease_until INTEGER NOT NULL DEFAULT 0,
  completed_bytes INTEGER NOT NULL DEFAULT 0, total_bytes INTEGER NOT NULL DEFAULT 0,
  detail TEXT NOT NULL DEFAULT '', error TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS mv_hybrid_recent ON mv_hybrid_jobs(created_at DESC);
CREATE TABLE IF NOT EXISTS mv_hybrid_files (
  job_id TEXT NOT NULL, relative_path TEXT NOT NULL, name TEXT NOT NULL,
  bytes INTEGER NOT NULL, PRIMARY KEY(job_id,relative_path)
);
CREATE TABLE IF NOT EXISTS mv_hybrid_transfer_usage (
  month TEXT PRIMARY KEY, transferred_bytes INTEGER NOT NULL DEFAULT 0,
  reserved_bytes INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS mv_hybrid_tickets (
  digest TEXT PRIMARY KEY, job_id TEXT NOT NULL, relative_path TEXT NOT NULL,
  bytes INTEGER NOT NULL, month TEXT NOT NULL,
  expires_at INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'new'
);
-- Temporary test-browser capability metadata; never raw credentials or media.
CREATE TABLE IF NOT EXISTS mv_hybrid_browser_sessions (
  digest TEXT PRIMARY KEY, pair_code TEXT NOT NULL UNIQUE,
  expires_at INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'pending',
  job_ids_json TEXT NOT NULL DEFAULT '[]', issued_tickets INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS mv_hybrid_browser_tickets (
  digest TEXT PRIMARY KEY, session_digest TEXT NOT NULL
);
-- Disabled-by-default account sessions: hashes/metadata only, never credentials.
CREATE TABLE IF NOT EXISTS mv_hybrid_app_sessions (
  digest TEXT PRIMARY KEY, id TEXT NOT NULL UNIQUE, pair_code TEXT NOT NULL UNIQUE,
  account_id TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'pending',
  created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL,
  created_jobs INTEGER NOT NULL DEFAULT 0, issued_tickets INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS mv_hybrid_account_jobs (
  job_id TEXT PRIMARY KEY, account_id TEXT NOT NULL,
  request_key TEXT NOT NULL, request_hash TEXT NOT NULL,
  created_by_digest TEXT NOT NULL, UNIQUE(account_id,request_key)
);
CREATE INDEX IF NOT EXISTS mv_hybrid_account_job_scope ON mv_hybrid_account_jobs(account_id,job_id);
CREATE TABLE IF NOT EXISTS mv_hybrid_app_tickets (
  digest TEXT PRIMARY KEY, session_digest TEXT NOT NULL
);

