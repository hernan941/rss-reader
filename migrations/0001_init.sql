CREATE TABLE feeds (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  url             TEXT NOT NULL UNIQUE,
  title           TEXT NOT NULL DEFAULT '',
  site_url        TEXT NOT NULL DEFAULT '',
  etag            TEXT NOT NULL DEFAULT '',
  last_modified   TEXT NOT NULL DEFAULT '',
  last_checked_at INTEGER NOT NULL DEFAULT 0,
  last_error      TEXT NOT NULL DEFAULT '',
  created_at      INTEGER NOT NULL
);

CREATE TABLE entries (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  feed_id    INTEGER NOT NULL REFERENCES feeds(id) ON DELETE CASCADE,
  guid       TEXT NOT NULL,
  title      TEXT NOT NULL,
  link       TEXT NOT NULL,
  summary    TEXT NOT NULL DEFAULT '',
  image      TEXT NOT NULL DEFAULT '',
  sort_at    INTEGER NOT NULL,           -- fecha de publicación (o de descarga) en ms
  is_read    INTEGER NOT NULL DEFAULT 0,
  is_starred INTEGER NOT NULL DEFAULT 0,
  UNIQUE (feed_id, guid)
);

CREATE INDEX idx_entries_sort ON entries (sort_at DESC, id DESC);
CREATE INDEX idx_entries_feed ON entries (feed_id, sort_at DESC, id DESC);
CREATE INDEX idx_entries_unread ON entries (is_read, sort_at DESC);
CREATE INDEX idx_entries_starred ON entries (is_starred, sort_at DESC);
