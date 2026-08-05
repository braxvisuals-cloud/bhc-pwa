-- Bush Hills Church of Christ - Analytics D1 schema
-- Run this once in the Cloudflare dashboard's D1 Console after creating
-- the analytics-db database. No CLI/wrangler needed.

CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  event_name TEXT NOT NULL,
  path TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_events_created_at ON events(created_at);
CREATE INDEX IF NOT EXISTS idx_events_name ON events(event_name);
