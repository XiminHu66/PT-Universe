CREATE TABLE IF NOT EXISTS research_ai_accounts(owner TEXT PRIMARY KEY);
CREATE TABLE IF NOT EXISTS research_ai_settings(key TEXT PRIMARY KEY,value TEXT);
-- One-time enrollment of existing saved PT workspaces. Public sync registration
-- does not grant permission to consume the owner's Gemini key.
INSERT OR IGNORE INTO research_ai_accounts(owner)
SELECT DISTINCT sync_id FROM sync_blobs
WHERE LENGTH(ciphertext)>100 AND NOT EXISTS(SELECT 1 FROM research_ai_settings WHERE key='enrolled');
INSERT OR IGNORE INTO research_ai_settings(key,value) VALUES('enrolled',datetime('now'));
