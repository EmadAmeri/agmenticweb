CREATE TABLE IF NOT EXISTS otp_challenges (
  id TEXT PRIMARY KEY,
  normalized_email TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5,
  created_at TEXT NOT NULL,
  verified_at TEXT,
  request_ip TEXT NOT NULL DEFAULT '',
  user_agent TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS otp_email_created
  ON otp_challenges(normalized_email, created_at DESC);

CREATE INDEX IF NOT EXISTS otp_ip_created
  ON otp_challenges(request_ip, created_at DESC);
