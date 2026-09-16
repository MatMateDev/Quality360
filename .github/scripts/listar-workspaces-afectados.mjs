#!/usr/bin/env node
// Quality360 · Lista, separados por espacio, los workspaces (apps/*, packages/*,
// services/*) afectados por un rango de commits. Un workspace sin package.json
// todavía (stub con solo README.md) no cuenta como workspace real.
//
// Regla: si cambió el package.json o el package-lock.json de la raíz (afecta
// el árbol de dependencias de todos), se consideran afectados TODOS los
// workspaces existentes. Si no, solo los workspaces cuyo directorio contiene
// alguno de los archivos cambiados.
//
// Uso: node listar-workspaces-afectados.mjs <base-ref> <head-ref>
// Salida (stdout): lista de rutas de workspace separadas por espacio, p. ej.
//   apps/web services/organizacion
// Si no hay workspaces con package.json todavía, no imprime nada (éxito).

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const [, , baseRef, headRef] = process.argv;
if (!baseRef || !headRef) {
  console.error("Uso: node listar-workspaces-afectados.mjs <base-ref> <head-ref>");
  process.exit(1);
}

const raiz = process.cwd();

function workspacesReales() {
  const globs = JSON.parse(readFileSync(join(raiz, "package.json"), "utf8")).workspaces ?? [];
  const dirsBase = globs.map((g) => g.replace(/\/\*$/, ""));
  const resultado = [];
  for (const base of dirsBase) {
    const rutaBase = join(raiz, base);
    if (!existsSync(rutaBase)) continue;
    for (const entrada of readdirSync(rutaBase, { withFileTypes: true })) {
      if (!entrada.isDirectory()) continue;
      const ruta = `${base}/${entrada.name}`;
      if (existsSync(join(raiz, ruta, "package.json"))) {
        resultado.push(ruta);
      }
    }
  }
  return resultado.sort();
}

function archivosCambiados(base, head) {
  try {
    const salida = execFileSync("git", ["diff", "--name-only", `${base}...${head}`], {
      encoding: "utf8",
      cwd: raiz,
    });
    return salida.split("\n").map((l) => l.trim()).filter(Boolean);
  } catch (error) {
    console.error(`No se pudo calcular el diff ${base}...${head}: ${error.message}`);
    // Ante la duda, no se bloquea el pipeline: se listan todos los workspaces.
    return null;
  }
}

const todos = workspacesReales();
if (todos.length === 0) {
  // Todavía no hay workspaces con package.json (stubs de Ola 0).
  process.exit(0);
}

const cambios = archivosCambiados(baseRef, headRef);
const cambioGlobal =
  cambios === null || cambios.some((f) => f === "package.json" || f === "package-lock.json");

const afectados = cambioGlobal
  ? todos
  : todos.filter((ws) => cambios.some((f) => f === ws || f.startsWith(`${ws}/`)));

process.stdout.write(afectados.join(" "));
