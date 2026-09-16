#!/usr/bin/env node
// Quality360 · Aplica un archivo .sql contra el Postgres local de Supabase,
// conectado como `postgres` (único rol autorizado a crear esquemas y roles).
// Uso:  node infrastructure/db/scripts/aplicar-sql.mjs <ruta-al-archivo.sql>
// Funciona igual en PowerShell y en Git Bash: no depende de psql en el host,
// lo ejecuta dentro del contenedor `supabase_db_quality360` vía `docker exec`.

import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const CONTAINER = process.env.Q360_DB_CONTAINER ?? "supabase_db_quality360";

const archivo = process.argv[2];
if (!archivo) {
  console.error("Uso: node aplicar-sql.mjs <ruta-al-archivo.sql>");
  process.exit(1);
}

const rutaAbsoluta = resolve(archivo);
let sql;
try {
  sql = readFileSync(rutaAbsoluta, "utf8");
} catch (error) {
  console.error(`No se pudo leer ${rutaAbsoluta}: ${error.message}`);
  process.exit(1);
}

console.log(`Aplicando ${rutaAbsoluta} en el contenedor ${CONTAINER} (rol postgres)...`);

const psql = spawn(
  "docker",
  ["exec", "-i", CONTAINER, "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-f", "-"],
  { stdio: ["pipe", "inherit", "inherit"] }
);

psql.stdin.write(sql);
psql.stdin.end();

psql.on("close", (code) => {
  if (code === 0) {
    console.log("OK: script aplicado sin errores.");
  } else {
    console.error(`FALLO: psql terminó con código ${code}.`);
  }
  process.exit(code ?? 1);
});

psql.on("error", (error) => {
  console.error(`No se pudo ejecutar docker: ${error.message}`);
  console.error("¿Está Docker corriendo y el contenedor de Supabase levantado (npm run supabase:start)?");
  process.exit(1);
});
