// Valida las migraciones de un PR contra su rama base.
// Uso: node scripts/check-migrations.mjs origin/master
// ALLOW_DESTRUCTIVE=1 permite SQL destructivo (DROP, DELETE, RENAME, TRUNCATE).
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { checkMigrations } from "./migrations-rules.mjs";

const base = process.argv[2];
if (!base) {
  console.error("Uso: node scripts/check-migrations.mjs <rama-base>  (p. ej. origin/master)");
  process.exit(1);
}

const git = (...args) => execFileSync("git", args, { encoding: "utf8" });

const changes = git("diff", "--name-status", "--no-renames", `${base}...HEAD`, "--", "migrations/")
  .split("\n")
  .filter(Boolean)
  .map((line) => {
    const [status, ...rest] = line.split("\t");
    return { status, path: rest.join("\t") };
  });
const baseFiles = git("ls-tree", "--name-only", base, "migrations/").split("\n").filter(Boolean);

const { errors, added } = checkMigrations({
  changes,
  baseFiles,
  readFile: (p) => readFileSync(p, "utf8"),
  allowDestructive: process.env.ALLOW_DESTRUCTIVE === "1",
});

if (errors.length > 0) {
  for (const e of errors) console.error(`ERROR: ${e}`);
  process.exit(1);
}
console.log(`Migraciones OK (${added} nuevas)`);
