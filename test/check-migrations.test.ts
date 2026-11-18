import { describe, expect, it } from "vitest";
import { checkMigrations } from "../scripts/migrations-rules.mjs";

const baseFiles = ["migrations/0001_init.sql", "migrations/0006_reparse.sql"];
const run = (changes: { status: string; path: string }[], sql = "ALTER TABLE t ADD COLUMN x TEXT;", allowDestructive = false) =>
  checkMigrations({ changes, baseFiles, readFile: () => sql, allowDestructive });

describe("checkMigrations", () => {
  it("sin cambios es válido", () => {
    expect(run([])).toEqual({ errors: [], added: 0 });
  });

  it("acepta una migración nueva aditiva", () => {
    expect(run([{ status: "A", path: "migrations/0007_x.sql" }])).toEqual({ errors: [], added: 1 });
  });

  it("rechaza modificar o borrar existentes", () => {
    expect(run([{ status: "M", path: "migrations/0001_init.sql" }]).errors[0]).toMatch(/No se pueden modificar/);
    expect(run([{ status: "D", path: "migrations/0001_init.sql" }]).errors).toHaveLength(1);
  });

  it("rechaza nombres inválidos, números repetidos o no mayores que la base", () => {
    expect(run([{ status: "A", path: "migrations/7_x.sql" }]).errors[0]).toMatch(/Nombre inválido/);
    expect(run([{ status: "A", path: "migrations/0003_dup.sql" }]).errors[0]).toMatch(/mayor que el último/);
    const dup = run([
      { status: "A", path: "migrations/0007_a.sql" },
      { status: "A", path: "migrations/0007_b.sql" },
    ]);
    expect(dup.errors[0]).toMatch(/duplicado/);
  });

  it("rechaza SQL destructivo salvo permiso, e ignora comentarios", () => {
    const c = [{ status: "A", path: "migrations/0007_x.sql" }];
    expect(run(c, "drop table t;").errors[0]).toMatch(/destructivo/);
    expect(run(c, "drop table t;", true).errors).toEqual([]);
    expect(run(c, "-- DROP TABLE t\n/* DELETE FROM t */ ALTER TABLE t ADD COLUMN x TEXT;").errors).toEqual([]);
  });

  it("ON DELETE CASCADE en claves foráneas no es destructivo, pero DELETE FROM sí", () => {
    const c = [{ status: "A", path: "migrations/0007_x.sql" }];
    const fk = "CREATE TABLE a (id INTEGER, f INTEGER REFERENCES feeds(id)\n  ON\n DELETE CASCADE, g INTEGER REFERENCES feeds(id) on delete set null);";
    expect(run(c, fk).errors).toEqual([]);
    expect(run(c, "DELETE FROM x;").errors[0]).toMatch(/DELETE/);
  });
});
