-- Private authentication metadata only. Credentials and handoffs are encrypted.
CREATE TABLE IF NOT EXISTS mv_hybrid_login_config (
 id TEXT PRIMARY KEY, cipher TEXT NOT NULL, created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS mv_hybrid_login_flows (
 digest TEXT PRIMARY KEY, browser_digest TEXT NOT NULL, kind TEXT NOT NULL,
 cipher TEXT NOT NULL, expires_at INTEGER NOT NULL, consumed INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS mv_hybrid_login_connections (
 digest TEXT PRIMARY KEY, remember INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'pending',
 cipher TEXT, expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS mv_hybrid_login_limits (
 id TEXT PRIMARY KEY, hits INTEGER NOT NULL, expires_at INTEGER NOT NULL
);
