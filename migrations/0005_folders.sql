-- Carpetas propias de cada usuario, para que existan aunque no tengan fuentes.
CREATE TABLE folders (
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, name)
);

INSERT INTO folders (user_id, name, created_at)
SELECT DISTINCT user_id, folder, 0 FROM subscriptions WHERE folder <> '';
