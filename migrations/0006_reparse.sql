-- Fuerza un re-fetch completo una vez: los resúmenes ahora conservan los saltos de párrafo.
UPDATE feeds SET etag = '', last_modified = '', last_checked_at = 0;
