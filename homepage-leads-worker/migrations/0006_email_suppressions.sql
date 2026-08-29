CREATE TABLE IF NOT EXISTS email_suppressions (
  normalized_email TEXT PRIMARY KEY,
  reason TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

INSERT OR IGNORE INTO email_suppressions (normalized_email, reason, created_at)
VALUES ('michael@badichler.com', 'Manual hold — do not contact until explicitly approved', datetime('now'));
