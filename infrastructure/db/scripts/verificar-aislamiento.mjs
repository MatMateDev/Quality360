#!/usr/bin/env node
// Quality360 · Verificación de aislamiento de esquemas (informe p. 15).
//
// Para cada rol svc_* intenta LEER un esquema ajeno y falla el script (exit 1)
// si algún rol logra leerlo. También comprueba, como control positivo, que
// cada rol SÍ puede leer su propio esquema.
//
// No depende de psql en el host: ejecuta dentro del contenedor de Postgres de
// Supabase local vía `docker exec`, por lo que funciona igual en PowerShell y
// en Git Bash.
//
// Uso: node infrastructure/db/scripts/verificar-aislamiento.mjs

import { spawnSync } from "node:child_process";

const CONTAINER = process.env.Q360_DB_CONTAINER ?? "supabase_db_quality360";

const roles = [
  { rol: "svc_organizacion", password: "svc_organizacion_local_dev", esquema: "organizacion" },
  { rol: "svc_certificaciones", password: "svc_certificaciones_local_dev", esquema: "certificaciones" },
  { rol: "svc_impedimentos", password: "svc_impedimentos_local_dev", esquema: "impedimentos" },
  { rol: "svc_integraciones", password: "svc_integraciones_local_dev", esquema: "integraciones" },
];

function psql(rol, password, sql) {
  return spawnSync(
    "docker",
    [
      "exec",
      "-e",
      `PGPASSWORD=${password}`,
      CONTAINER,
      "psql",
      "-U",
      rol,
      "-d",
      "postgres",
      "-h",
      "127.0.0.1",
      "-v",
      "ON_ERROR_STOP=1",
      "-tAc",
      sql,
    ],
    { encoding: "utf8" }
  );
}

let fallas = 0;

console.log("=== Quality360 · Verificacion de aislamiento de esquemas (informe p. 15) ===\n");

console.log("-- Preparacion: cada rol crea su propia tabla de prueba --");
for (const { rol, password, esquema } of roles) {
  const crear = psql(
    rol,
    password,
    `create table if not exists ${esquema}.zz_prueba_aislamiento (id int primary key, nota text); ` +
      `insert into ${esquema}.zz_prueba_aislamiento values (1, 'ok') on conflict (id) do nothing;`
  );
  const ok = crear.status === 0;
  console.log(`  ${ok ? "OK   " : "FALLO"}  ${rol} crea/usa ${esquema}.zz_prueba_aislamiento`);
  if (!ok) {
    fallas++;
    console.error(`    ${(crear.stderr ?? "").trim()}`);
  }
}

console.log("\n-- Control positivo: cada rol LEE su propio esquema (debe funcionar) --");
for (const { rol, password, esquema } of roles) {
  const leer = psql(rol, password, `select nota from ${esquema}.zz_prueba_aislamiento where id = 1;`);
  const ok = leer.status === 0 && leer.stdout.trim() === "ok";
  console.log(`  ${ok ? "OK   " : "FALLO"}  ${rol} lee ${esquema} (propio)`);
  if (!ok) {
    fallas++;
    console.error(`    ${(leer.stderr ?? "").trim()}`);
  }
}

console.log("\n-- Aislamiento: cada rol intenta LEER un esquema ajeno (debe fallar) --");
for (const { rol, password, esquema: esquemaPropio } of roles) {
  for (const { esquema: esquemaAjeno } of roles) {
    if (esquemaAjeno === esquemaPropio) continue;
    const intento = psql(rol, password, `select nota from ${esquemaAjeno}.zz_prueba_aislamiento where id = 1;`);
    const stderr = (intento.stderr ?? "").trim();
    const bloqueado = intento.status !== 0 && /permission denied/i.test(stderr);
    console.log(`  ${bloqueado ? "OK (bloqueado)     " : "FALLO (pudo leer!) "}  ${rol} -> ${esquemaAjeno}`);
    if (bloqueado) {
      console.log(`    motivo: ${stderr.split("\n")[0]}`);
    } else {
      fallas++;
      console.error(`    salida inesperada: status=${intento.status} stdout="${(intento.stdout ?? "").trim()}" stderr="${stderr}"`);
    }
  }
}

console.log("\n-- Limpieza: se eliminan las tablas de prueba --");
for (const { rol, password, esquema } of roles) {
  psql(rol, password, `drop table if exists ${esquema}.zz_prueba_aislamiento;`);
}
console.log("  listo.");

console.log("\n=== Resumen ===");
if (fallas > 0) {
  console.error(`FALLAS: ${fallas}. El aislamiento de esquemas NO se cumple.`);
  process.exit(1);
}
console.log("Cada rol svc_* solo alcanza su propio esquema. Aislamiento verificado.");
process.exit(0);
