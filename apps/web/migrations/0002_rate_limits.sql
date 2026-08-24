-- Migration number: 0002 	 2026-08-23
-- Per-client rate limiting for POST /api/installs (see schema.sql for the
-- semantics). Also the first enforcement of the 90-day retention policy:
-- events older than 90 days are deleted here once, and kept pruned by the API.
CREATE TABLE IF NOT EXISTS rate_limits (
  client_key   TEXT PRIMARY KEY,
  window_start INTEGER NOT NULL,
  count        INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_rate_limits_window ON rate_limits (window_start);

DELETE FROM installs WHERE installed_at < datetime('now', '-90 days');
