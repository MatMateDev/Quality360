// Verifica que los contratos cubren los escenarios de E1, E2, E3 y E7 del backlog.
// Uso: npm run contracts:check
// Un escenario está cubierto si su ID aparece en `x-hdu` de alguna operación,
// en `x-hdu-transversal` o en `x-escenarios-sin-operacion` de algún contrato.
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
// Escenarios esperados por épica: protege contra un backlog mal leído (3 por HDU).
const ESPERADOS_POR_EPICA = { E1: 78, E2: 24, E3: 24, E7: 33 };
const EPICAS = Object.keys(ESPERADOS_POR_EPICA);
const ID = /E\d-[FB]\d{2}#\d+/g;

// 1. Escenarios del backlog
const backlog = readFileSync(join(raiz, 'docs', 'backlog', 'historias-quality360.md'), 'utf8');
const esperados = new Set();
let hdu = null;
for (const linea of backlog.split(/\r?\n/)) {
  const titulo = linea.match(/^### (E\d-[FB]\d{2}) ·/);
  if (titulo) {
    hdu = EPICAS.includes(titulo[1].slice(0, 2)) ? titulo[1] : null;
    continue;
  }
  if (linea.startsWith('## ')) hdu = null;
  const fila = hdu && linea.match(/^\| (\d+) \|/);
  if (fila) esperados.add(`${hdu}#${fila[1]}`);
}

// 2. IDs declarados en los contratos
const dirContratos = join(raiz, 'contracts');
const declarados = new Map();
const anotar = (id, origen) => {
  if (!declarados.has(id)) declarados.set(id, new Set());
  declarados.get(id).add(origen);
};
for (const archivo of readdirSync(dirContratos).filter((f) => /\.v\d+\.yaml$/.test(f))) {
  const texto = readFileSync(join(dirContratos, archivo), 'utf8');
  let operacion = null;
  let enSinOperacion = false;
  for (const linea of texto.split(/\r?\n/)) {
    const op = linea.match(/^\s+operationId:\s*(\S+)/);
    if (op) operacion = op[1];
    if (/^x-escenarios-sin-operacion:/.test(linea)) {
      enSinOperacion = true;
      continue;
    }
    if (enSinOperacion && /^\S/.test(linea)) enSinOperacion = false;
    if (enSinOperacion) {
      const m = linea.match(/^\s+- id:\s*(E\d-[FB]\d{2}#\d+)/);
      if (m) anotar(m[1], `${archivo}:sin-operacion`);
      continue;
    }
    if (/^\s*x-hdu(-transversal)?:/.test(linea)) {
      const origen = linea.includes('transversal') ? `${archivo}:transversal` : `${archivo}:${operacion}`;
      for (const id of linea.match(ID) ?? []) anotar(id, origen);
    }
  }
}

// 3. Resultado
const faltantes = [...esperados].filter((id) => !declarados.has(id));
const desconocidos = [...declarados.keys()].filter((id) => !esperados.has(id));
const porEpica = Object.fromEntries(EPICAS.map((e) => [e, [...esperados].filter((id) => id.startsWith(e)).length]));
const epicasIncompletas = EPICAS.filter((e) => porEpica[e] !== ESPERADOS_POR_EPICA[e]);
console.log(`Escenarios ${EPICAS.join('-')} en el backlog: ${esperados.size} (${EPICAS.map((e) => `${e}: ${porEpica[e]}`).join(', ')})`);
if (epicasIncompletas.length) console.log(`Épicas con un número de escenarios inesperado: ${epicasIncompletas.map((e) => `${e} (${porEpica[e]}, se esperaban ${ESPERADOS_POR_EPICA[e]})`).join(', ')}`);
console.log(`Escenarios cubiertos por contratos: ${esperados.size - faltantes.length}`);
if (faltantes.length) console.log(`Sin cobertura (${faltantes.length}): ${faltantes.join(', ')}`);
if (desconocidos.length) console.log(`IDs que no existen en el backlog (${desconocidos.length}): ${desconocidos.join(', ')}`);
if (process.argv.includes('--detalle')) {
  for (const id of [...esperados].sort()) console.log(`${id}\t${[...(declarados.get(id) ?? [])].join(', ')}`);
}
process.exit(faltantes.length || desconocidos.length || epicasIncompletas.length ? 1 : 0);
