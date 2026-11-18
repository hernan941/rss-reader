// Reglas puras para validar migraciones de D1 (sin tocar git ni disco).
// Las usa scripts/check-migrations.mjs y test/check-migrations.test.ts.

const NOMBRE_VALIDO = /^migrations\/(\d{4})_[a-z0-9_]+\.sql$/;
const DESTRUCTIVO = /\b(DROP|DELETE|RENAME|TRUNCATE)\b/gi;

/** Quita comentarios `-- ...` y `/* ... *\/` del SQL. */
export function stripSqlComments(sql) {
  return sql.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");
}

/**
 * @param {{
 *   changes: { status: string, path: string }[],
 *   baseFiles: string[],
 *   readFile: (path: string) => string,
 *   allowDestructive?: boolean,
 * }} input
 * @returns {{ errors: string[], added: number }}
 */
export function checkMigrations({ changes, baseFiles, readFile, allowDestructive = false }) {
  const errors = [];

  const tocadas = changes.filter((c) => c.status !== "A");
  if (tocadas.length > 0) {
    errors.push(
      `No se pueden modificar ni borrar migraciones existentes: ${tocadas.map((c) => c.path).join(", ")}`,
    );
  }

  const added = changes.filter((c) => c.status === "A");
  const maxBase = baseFiles
    .map((f) => /(\d{4})_[^/]*\.sql$/.exec(f))
    .filter(Boolean)
    .reduce((max, m) => Math.max(max, Number(m[1])), 0);

  const vistos = new Map();
  for (const { path } of added) {
    const m = NOMBRE_VALIDO.exec(path);
    if (!m) {
      errors.push(`Nombre inválido: ${path} (debe ser migrations/NNNN_nombre_en_minusculas.sql)`);
      continue;
    }
    const n = Number(m[1]);
    if (n <= maxBase) {
      errors.push(
        `Número no válido en ${path}: debe ser mayor que el último de la rama base (${String(maxBase).padStart(4, "0")})`,
      );
    }
    if (vistos.has(n)) {
      errors.push(`Número duplicado ${m[1]}: ${vistos.get(n)} y ${path}`);
    } else {
      vistos.set(n, path);
    }

    if (!allowDestructive) {
      // `ON DELETE CASCADE/SET NULL` en claves foráneas no es destructivo.
      const sql = stripSqlComments(readFile(path)).replace(/\bON\s+DELETE\b/gi, " ");
      const hallazgos = [...new Set([...sql.matchAll(DESTRUCTIVO)].map((x) => x[1].toUpperCase()))];
      if (hallazgos.length > 0) {
        errors.push(
          `SQL destructivo en ${path} (${hallazgos.join(", ")}). Las migraciones deben ser aditivas; ` +
            `si es intencional, pon la etiqueta "migracion-destructiva" en el PR.`,
        );
      }
    }
  }

  return { errors, added: added.length };
}
