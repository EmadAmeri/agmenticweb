PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS leads (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  normalized_email TEXT NOT NULL,
  source TEXT NOT NULL,
  category TEXT NOT NULL,
  campaign_id TEXT NOT NULL,
  page_url TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  last_submitted_at TEXT NOT NULL,
  duplicate_count INTEGER NOT NULL DEFAULT 0,
  email_status TEXT NOT NULL DEFAULT 'pending',
  sheet_status TEXT NOT NULL DEFAULT 'pending',
  last_error TEXT NOT NULL DEFAULT '',
  user_agent TEXT NOT NULL DEFAULT '',
  country TEXT NOT NULL DEFAULT ''
);

CREATE UNIQUE INDEX IF NOT EXISTS leads_dedupe
  ON leads(normalized_email, source, campaign_id);

CREATE INDEX IF NOT EXISTS leads_created_at
  ON leads(created_at DESC);

CREATE TABLE IF NOT EXISTS outbox (
  id TEXT PRIMARY KEY,
  lead_id TEXT NOT NULL,
  channel TEXT NOT NULL CHECK(channel IN ('email', 'sheet')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'queued', 'processing', 'done')),
  attempts INTEGER NOT NULL DEFAULT 0,
  available_at TEXT NOT NULL,
  queued_at TEXT,
  processed_at TEXT,
  last_error TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE,
  UNIQUE(lead_id, channel)
);

CREATE INDEX IF NOT EXISTS outbox_reconcile
  ON outbox(status, available_at, queued_at);
