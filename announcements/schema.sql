-- Bush Hills Church of Christ - Announcements D1 schema
-- Run this once in the Cloudflare dashboard's D1 "Console" tab after
-- creating the announcements-db database. No CLI/wrangler needed.

CREATE TABLE IF NOT EXISTS announcements (
  id TEXT PRIMARY KEY,
  raw_text TEXT NOT NULL,
  cleaned_text TEXT NOT NULL,
  created_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  delete_token TEXT NOT NULL
);
