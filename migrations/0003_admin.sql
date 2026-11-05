ALTER TABLE users ADD COLUMN disabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN last_seen_at INTEGER NOT NULL DEFAULT 0;

-- Ajustes de la instancia (registro abierto/cerrado, límite de usuarios)
CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
