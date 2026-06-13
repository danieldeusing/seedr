CREATE TABLE installs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  slug        TEXT NOT NULL,
  item_type   TEXT NOT NULL,
  tool        TEXT NOT NULL,
  scope       TEXT NOT NULL,
  cli_version TEXT NOT NULL,
  country     TEXT NOT NULL DEFAULT 'unknown',
  installed_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_installs_slug ON installs (slug);
CREATE INDEX idx_installs_installed_at ON installs (installed_at);
