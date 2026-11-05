-- URL del favicon de cada fuente (solo el enlace, no la imagen). Vacío = aún sin buscar.
ALTER TABLE feeds ADD COLUMN favicon_url TEXT NOT NULL DEFAULT '';
