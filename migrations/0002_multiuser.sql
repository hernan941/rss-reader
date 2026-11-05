-- feeds y entries pasan a ser compartidos; el estado por usuario vive en entry_state.
DROP INDEX IF EXISTS idx_entries_unread;
DROP INDEX IF EXISTS idx_entries_starred;
ALTER TABLE entries DROP COLUMN is_read;
ALTER TABLE entries DROP COLUMN is_starred;

CREATE TABLE users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at    INTEGER NOT NULL
);

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,           -- sha256 del token que viaja en la cookie
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);
CREATE INDEX idx_sessions_user ON sessions (user_id);

CREATE TABLE subscriptions (
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  feed_id    INTEGER NOT NULL REFERENCES feeds(id) ON DELETE CASCADE,
  title      TEXT NOT NULL DEFAULT '',   -- nombre propio del usuario (opcional)
  folder     TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, feed_id)
);
CREATE INDEX idx_subs_feed ON subscriptions (feed_id);

CREATE TABLE entry_state (
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  entry_id   INTEGER NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
  is_read    INTEGER NOT NULL DEFAULT 0,
  is_starred INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, entry_id)
);
CREATE INDEX idx_state_starred ON entry_state (user_id, is_starred);

-- Limitador simple de intentos (login / registro)
CREATE TABLE throttle (
  key          TEXT PRIMARY KEY,
  count        INTEGER NOT NULL,
  window_start INTEGER NOT NULL
);
