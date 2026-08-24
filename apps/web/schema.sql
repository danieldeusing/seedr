-- Seedr install statistics (Cloudflare D1 "seedr-analytics").
--
-- This file is the current schema for reference and for a fresh database.
-- Applied changes live in migrations/ (numbered, run in order with
-- `wrangler d1 migrations apply seedr-analytics`); keep both in sync.
--
-- Retention: install events are kept for 90 days. functions/api/installs.ts
-- deletes older rows opportunistically (a bounded batch on every POST); there
-- is no identifier in an event, so earlier deletion on request is impossible
-- and unnecessary (see the privacy policy).

CREATE TABLE installs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  slug        TEXT NOT NULL,
  item_type   TEXT NOT NULL,
  tool        TEXT NOT NULL,
  scope       TEXT NOT NULL,
  cli_version TEXT NOT NULL,
  -- coarse country derived by Cloudflare from the request; the IP itself is never stored
  country     TEXT NOT NULL DEFAULT 'unknown',
  installed_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_installs_slug ON installs (slug);
CREATE INDEX idx_installs_installed_at ON installs (installed_at);

-- Per-client rate limiting (functions/api/installs.ts). One row per client and
-- day: client_key = SHA-256(client IP + daily salt), window_start = the
-- 60-second window the count belongs to. Never joined with installs. Rows of
-- past windows are deleted opportunistically on every POST, so the table holds
-- at most the clients active in the current and previous minute.
CREATE TABLE rate_limits (
  client_key   TEXT PRIMARY KEY,
  window_start INTEGER NOT NULL,
  count        INTEGER NOT NULL
);

CREATE INDEX idx_rate_limits_window ON rate_limits (window_start);
