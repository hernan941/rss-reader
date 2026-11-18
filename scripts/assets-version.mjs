// Genera src/assets-version.ts con un hash del contenido de public/app.css y public/app.js.
// Se usa como ?v=... en las URLs para poder cachear los assets "para siempre".
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

const root = new URL("../", import.meta.url);
const hash = createHash("sha256");
for (const f of ["public/app.css", "public/app.js"]) hash.update(readFileSync(new URL(f, root)));
const version = hash.digest("hex").slice(0, 10);

writeFileSync(
  new URL("src/assets-version.ts", root),
  `// GENERADO por scripts/assets-version.mjs: no editar ni versionar.\nexport const ASSETS_VERSION = "${version}";\n`,
);
console.log(`assets-version: ${version}`);
