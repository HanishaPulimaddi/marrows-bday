-- wrangler d1 execute marrow-bday-db --remote --file=./schema.sql

CREATE TABLE IF NOT EXISTS subscriptions (
  id        TEXT PRIMARY KEY,
  endpoint  TEXT UNIQUE,
  p256dh    TEXT,
  auth      TEXT,
  createdAt INTEGER
);

-- The delivery queue. IndexedDB stays the source of truth for what she sees;
-- a row here exists only so the cron has something to send. Shares the note id.
--
-- dueAt is ALWAYS epoch milliseconds. No formatted strings, no offsets, no
-- timezone names - local time is produced in the browser at display time.
CREATE TABLE IF NOT EXISTS reminders (
  id             TEXT PRIMARY KEY,   -- same id as the local note
  text           TEXT NOT NULL,
  dueAt          INTEGER NOT NULL,   -- epoch milliseconds, UTC
  sent           INTEGER DEFAULT 0,
  subscriptionId TEXT,
  createdAt      INTEGER,
  updatedAt      INTEGER,
  attempts       INTEGER DEFAULT 0   -- give up after 5
);

-- the pair the sweep filters on, every minute
CREATE INDEX IF NOT EXISTS idx_reminders_sweep ON reminders (sent, dueAt);
