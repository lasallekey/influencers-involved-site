-- Influencers Involved — Pioneer Registry (fresh schema; no legacy data or IDs).
PRAGMA foreign_keys = ON;

CREATE TABLE pioneers (
  id                         INTEGER PRIMARY KEY AUTOINCREMENT,
  pioneer_id                 TEXT NOT NULL UNIQUE,                 -- public certificate ID, e.g. II-7K3M-Q9XD
  submitted_at               TEXT NOT NULL,                        -- server UTC, ISO-8601
  creator_name               TEXT NOT NULL,
  private_email              TEXT NOT NULL,                        -- normalized (trim + lowercase); never public
  country                    TEXT NOT NULL,                        -- ISO 3166-1 alpha-2
  selected_charity           TEXT NOT NULL,
  pledge_date                TEXT NOT NULL,                        -- YYYY-MM-DD
  privacy_preference         TEXT NOT NULL CHECK (privacy_preference IN ('public','anonymous')),
  general_email_opt_in       INTEGER NOT NULL DEFAULT 0 CHECK (general_email_opt_in IN (0,1)),
  general_opt_in_at          TEXT,
  collaboration_interest     TEXT NOT NULL CHECK (collaboration_interest IN ('Yes','Maybe','Not now')),
  collaboration_types        TEXT NOT NULL DEFAULT '[]',           -- JSON array of content|fundraising|awareness
  collab_contact_opt_in      INTEGER NOT NULL DEFAULT 0 CHECK (collab_contact_opt_in IN (0,1)),
  collab_opt_in_at           TEXT,
  optional_withdrawn_at      TEXT,                                 -- set when optional email consents are withdrawn
  email_verification_status  TEXT NOT NULL DEFAULT 'Pending' CHECK (email_verification_status IN ('Pending','Verified')),
  email_verified_at          TEXT,
  consent_version            TEXT NOT NULL,
  consented_at               TEXT NOT NULL,
  registration_status        TEXT NOT NULL DEFAULT 'Active' CHECK (registration_status IN ('Active','Withdrawn')),
  idempotency_key            TEXT NOT NULL UNIQUE
);
-- One active registration per inbox; a withdrawn record frees the address.
CREATE UNIQUE INDEX idx_pioneers_email_active ON pioneers(private_email) WHERE registration_status = 'Active';

CREATE TABLE social_accounts (
  id                        INTEGER PRIMARY KEY AUTOINCREMENT,
  pioneer_id                TEXT NOT NULL REFERENCES pioneers(pioneer_id) ON DELETE CASCADE,
  platform                  TEXT NOT NULL,
  handle_or_channel         TEXT NOT NULL,
  profile_url               TEXT NOT NULL,
  public_display_permission INTEGER NOT NULL DEFAULT 0 CHECK (public_display_permission IN (0,1))
);
CREATE INDEX idx_social_pioneer ON social_accounts(pioneer_id);

CREATE TABLE email_verifications (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  pioneer_id  TEXT NOT NULL REFERENCES pioneers(pioneer_id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL UNIQUE,            -- SHA-256 of the random token; the raw token is never stored
  created_at  TEXT NOT NULL,
  sent_at     TEXT,
  send_status TEXT NOT NULL DEFAULT 'queued' CHECK (send_status IN ('queued','sent','failed','not_configured')),
  expires_at  TEXT NOT NULL,
  consumed_at TEXT
);
CREATE INDEX idx_verif_pioneer ON email_verifications(pioneer_id);

-- Abuse limits: keyed by HMAC of the client address, short-lived windows, purged automatically.
CREATE TABLE rate_limits (
  bucket       TEXT NOT NULL,
  window_start INTEGER NOT NULL,
  count        INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (bucket, window_start)
);
