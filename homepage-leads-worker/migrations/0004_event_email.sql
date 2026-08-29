ALTER TABLE leads ADD COLUMN event_status TEXT NOT NULL DEFAULT 'disabled';
ALTER TABLE leads ADD COLUMN event_sent_at TEXT;

CREATE TABLE outbox_next (
  id TEXT PRIMARY KEY,
  lead_id TEXT NOT NULL,
  channel TEXT NOT NULL CHECK(channel IN ('email', 'sheet', 'welcome', 'event')),
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  available_at TEXT NOT NULL,
  queued_at TEXT,
  processed_at TEXT,
  last_error TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE
);

INSERT INTO outbox_next SELECT * FROM outbox;
DROP TABLE outbox;
ALTER TABLE outbox_next RENAME TO outbox;
CREATE INDEX outbox_delivery_queue ON outbox(status, available_at, queued_at);
