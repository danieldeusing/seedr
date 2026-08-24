-- Migration number: 0001 	 2026-06-12
-- Initial schema (already applied to the production database before the
-- migrations folder existed; recorded here so a fresh database matches).
CREATE TABLE IF NOT EXISTS installs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  slug        TEXT NOT NULL,
  item_type   TEXT NOT NULL,
  tool        TEXT NOT NULL,
  scope       TEXT NOT NULL,
  cli_version TEXT NOT NULL,
  country     TEXT NOT NULL DEFAULT 'unknown',
  installed_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_installs_slug ON installs (slug);
CREATE INDEX IF NOT EXISTS idx_installs_installed_at ON installs (installed_at);
