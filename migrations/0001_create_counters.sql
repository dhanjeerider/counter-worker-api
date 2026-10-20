CREATE TABLE IF NOT EXISTS counters (
  id TEXT PRIMARY KEY NOT NULL,
  value INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  CHECK (typeof(value) = 'integer'),
  CHECK (value BETWEEN -9007199254740991 AND 9007199254740991)
);

CREATE INDEX IF NOT EXISTS idx_counters_updated_at ON counters(updated_at DESC);
