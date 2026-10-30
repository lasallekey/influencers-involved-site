-- NEW Influencers Involved Pioneer registry — deliberately empty at launch.
-- Never import or sync the legacy Apps Script / spreadsheet registry.
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS pioneers (
 id TEXT PRIMARY KEY,
 idempotency_key TEXT NOT NULL UNIQUE,
 creator_name TEXT NOT NULL,
 email TEXT NOT NULL,
 email_normalized TEXT NOT NULL UNIQUE,
 country TEXT NOT NULL,
 charity TEXT NOT NULL,
 pledge_date TEXT NOT NULL,
 public_opt_in INTEGER NOT NULL DEFAULT 0 CHECK(public_opt_in IN(0,1)),
 news_opt_in INTEGER NOT NULL DEFAULT 0 CHECK(news_opt_in IN(0,1)),
 collaboration TEXT NOT NULL DEFAULT 'not_now',
 collaboration_types TEXT NOT NULL DEFAULT '[]',
 collaboration_email_opt_in INTEGER NOT NULL DEFAULT 0 CHECK(collaboration_email_opt_in IN(0,1)),
 consent_version TEXT NOT NULL,
 consent_at TEXT NOT NULL,
 created_at TEXT NOT NULL,
 verified_at TEXT DEFAULT NULL
);
CREATE TABLE IF NOT EXISTS social_accounts (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 pioneer_id TEXT NOT NULL REFERENCES pioneers(id) ON DELETE CASCADE,
 platform TEXT NOT NULL,
 handle TEXT NOT NULL,
 profile_url TEXT NOT NULL,
 public_opt_in INTEGER NOT NULL DEFAULT 0 CHECK(public_opt_in IN(0,1))
);
CREATE INDEX IF NOT EXISTS idx_social_pioneer ON social_accounts(pioneer_id);
CREATE TABLE IF NOT EXISTS email_verifications (
 token_hash TEXT PRIMARY KEY,
 pioneer_id TEXT NOT NULL REFERENCES pioneers(id) ON DELETE CASCADE,
 expires_at INTEGER NOT NULL,
 used_at INTEGER DEFAULT NULL,
 created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_verify_pioneer ON email_verifications(pioneer_id);
CREATE TABLE IF NOT EXISTS rate_limits (
 ip_hash TEXT PRIMARY KEY,
 hits INTEGER NOT NULL DEFAULT 1,
 reset_at INTEGER NOT NULL
);
