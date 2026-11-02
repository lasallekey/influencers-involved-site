-- 0002: charity status/normalization, test-record flag, optional social profile URL.
-- Additive for `pioneers`; `social_accounts` is rebuilt (SQLite cannot drop NOT NULL in place). Existing rows are preserved.
PRAGMA foreign_keys = ON;

ALTER TABLE pioneers ADD COLUMN charity_status TEXT NOT NULL DEFAULT 'selected';   -- 'selected' | 'undecided'
ALTER TABLE pioneers ADD COLUMN charity_key    TEXT;                               -- normalized name used for counting; NULL when undecided
ALTER TABLE pioneers ADD COLUMN is_test        INTEGER NOT NULL DEFAULT 0;         -- 1 = automated/synthetic registration; never counted

-- Backfill for rows created before this migration (approximate key; new rows use the application's normalizer).
UPDATE pioneers SET charity_key = lower(trim(selected_charity)) WHERE selected_charity <> '';
UPDATE pioneers SET is_test = 1
 WHERE private_email LIKE '%@example.%' OR private_email LIKE '%.test' OR private_email LIKE '%.invalid'
    OR private_email LIKE '%.example' OR private_email LIKE '%.localhost' OR private_email LIKE 'smoke+%';
CREATE INDEX idx_pioneers_eligible ON pioneers(registration_status, is_test);

CREATE TABLE social_accounts_new (
  id                        INTEGER PRIMARY KEY AUTOINCREMENT,
  pioneer_id                TEXT NOT NULL REFERENCES pioneers(pioneer_id) ON DELETE CASCADE,
  platform                  TEXT NOT NULL,
  handle_or_channel         TEXT NOT NULL,
  handle_normalized         TEXT NOT NULL DEFAULT '',                -- lowercase, without a leading @; used to avoid double counting
  profile_url               TEXT,                                    -- optional; never guessed from the handle
  public_display_permission INTEGER NOT NULL DEFAULT 0 CHECK (public_display_permission IN (0,1))
);
INSERT INTO social_accounts_new (id, pioneer_id, platform, handle_or_channel, handle_normalized, profile_url, public_display_permission)
  SELECT id, pioneer_id, platform, handle_or_channel, lower(ltrim(trim(handle_or_channel), '@')), profile_url, public_display_permission FROM social_accounts;
DROP TABLE social_accounts;
ALTER TABLE social_accounts_new RENAME TO social_accounts;
CREATE INDEX idx_social_pioneer ON social_accounts(pioneer_id);
CREATE INDEX idx_social_handle  ON social_accounts(platform, handle_normalized);
