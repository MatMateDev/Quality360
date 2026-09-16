#!/usr/bin/env node
// Levanta Quality360 completo en local con datos reales: Supabase, esquemas, migraciones,
// servicios, gateway, portal y semilla.
// Uso: npm run local            (compila solo lo que falte)
//      npm run local -- --build (recompila todo)
// Requisitos: Node 24, Docker Desktop abierto y `npm install` hecho en la raíz.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const INFRA = join(RAIZ, 'infrastructure');
const WIN = process.platform === 'win32';
const reconstruir = process.argv.includes('--build');
const hijos = [];

const titulo = (texto) => console.log(`\n> ${texto}`);

function detener(codigo = 0) {
  for (const hijo of hijos) {
    if (hijo.exitCode !== null) continue;
    if (WIN) spawnSync('taskkill', ['/pid', String(hijo.pid), '/T', '/F'], { stdio: 'ignore' });
    else hijo.kill('SIGTERM');
  }
  process.exit(codigo);
}
process.on('SIGINT', () => {
  console.log('\nDeteniendo procesos...');
  detener(0);
});

function correr(descripcion, comando, cwd = RAIZ) {
  titulo(descripcion);
  const resultado = spawnSync(comando, { cwd, shell: true, stdio: 'inherit' });
  if (resultado.status !== 0) {
    console.error(`[x] Falló: ${descripcion}`);
    detener(1);
  }
}

async function responde(url) {
  try {
    return (await fetch(url, { signal: AbortSignal.timeout(2000) })).ok;
  } catch {
    return false;
  }
}

async function esperar(url, segundos = 90) {
  for (let i = 0; i < segundos; i++) {
    if (await responde(url)) return true;
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}

// 1. Docker y Supabase
titulo('Verificando Docker');
if (spawnSync('docker info', { shell: true, stdio: 'ignore' }).status !== 0) {
  console.error('[x] Docker no responde. Abre Docker Desktop y vuelve a ejecutar.');
  process.exit(1);
}
const supabaseArriba =
  spawnSync('npx --yes supabase@2.117.0 status --workdir .', { cwd: INFRA, shell: true, stdio: 'ignore' }).status === 0;
if (supabaseArriba) titulo('Supabase local ya está corriendo');
else correr('Iniciando Supabase local', 'npm run supabase:start', INFRA);

// 2. Esquemas, roles y configuración local
correr('Aplicando esquemas y roles (idempotente)', 'npm run db:schemas', INFRA);
correr('Preparando configuración local', `"${process.execPath}" infrastructure/local/preparar-entorno.mjs`);

// 3. Compilación (solo lo que falte, salvo --build)
const artefactos = {
  'packages/auth-nest': 'packages/auth-nest/dist/index.js',
  'services/organizacion': 'services/organizacion/dist/main.js',
  'services/certificaciones': 'services/certificaciones/dist/main.js',
  'services/impedimentos': 'services/impedimentos/dist/main.js',
  'apps/gateway': 'apps/gateway/dist/main.js',
};
for (const [workspace, artefacto] of Object.entries(artefactos)) {
  if (reconstruir || !existsSync(join(RAIZ, artefacto))) correr(`Compilando ${workspace}`, `npm run build -w ${workspace}`);
}

// 4. Migraciones de cada servicio que las tenga
for (const servicio of ['organizacion', 'certificaciones', 'impedimentos']) {
  const carpeta = join(RAIZ, 'services', servicio, 'prisma', 'migrations');
  const tieneMigraciones = existsSync(carpeta) && readdirSync(carpeta).some((f) => !f.endsWith('.toml'));
  if (tieneMigraciones) correr(`Migraciones de ${servicio}`, `npm run migrate:deploy -w services/${servicio}`);
}

// 5. Procesos: se reutiliza lo que ya esté respondiendo
const PROCESOS = [
  { nombre: 'organizacion', args: ['--env-file=services/organizacion/.env', 'services/organizacion/dist/main.js'], salud: 'http://localhost:3001/health' },
  { nombre: 'certificaciones', args: ['--env-file=services/certificaciones/.env', 'services/certificaciones/dist/main.js'], salud: 'http://localhost:3002/health' },
  { nombre: 'impedimentos', args: ['--env-file=services/impedimentos/.env', 'services/impedimentos/dist/main.js'], salud: 'http://localhost:3003/health' },
  { nombre: 'gateway', args: ['--env-file=apps/gateway/.env', 'apps/gateway/dist/main.js'], salud: 'http://localhost:3000/health' },
  { nombre: 'portal', npm: 'npm run dev -w apps/web', salud: 'http://localhost:5173/' },
];
titulo('Arrancando servicios, gateway y portal');
for (const proceso of PROCESOS) {
  if (await responde(proceso.salud)) {
    console.log(`  ${proceso.nombre}: ya responde, se reutiliza`);
    continue;
  }
  const hijo = proceso.npm
    ? spawn(proceso.npm, { cwd: RAIZ, shell: true })
    : spawn(process.execPath, proceso.args, { cwd: RAIZ });
  const prefijo = `[${proceso.nombre}]`.padEnd(17);
  const volcar = (datos) =>
    String(datos)
      .split(/\r?\n/)
      .filter(Boolean)
      .forEach((linea) => console.log(`${prefijo} ${linea}`));
  hijo.stdout.on('data', volcar);
  hijo.stderr.on('data', volcar);
  hijo.on('exit', (codigo) => {
    if (codigo !== null && codigo !== 0) console.error(`${prefijo} terminó con código ${codigo}`);
  });
  hijos.push(hijo);
}
for (const proceso of PROCESOS) {
  if (!(await esperar(proceso.salud))) {
    console.error(`[x] ${proceso.nombre} no respondió en ${proceso.salud}`);
    detener(1);
  }
  console.log(`  ok ${proceso.nombre}`);
}

// 6. Datos semilla (idempotente)
correr('Cargando datos semilla', 'npm run seed');

// 7. Resumen
const datos = JSON.parse(readFileSync(join(INFRA, 'seed/mvp/datos.json'), 'utf8'));
const ejemplo = (rol) => datos.usuarios.find((u) => u.rol === rol && u.activo !== false)?.correo;
console.log(`
Quality360 está corriendo con datos reales.

  Portal           http://localhost:5173
  Gateway          http://localhost:3000
  Supabase Studio  http://127.0.0.1:54323

  Contraseña de demo (solo local): ${datos.contrasenaDemo}
    Administrador  ${ejemplo('ADMINISTRADOR')}
    QE             ${ejemplo('QE')}
    Analista QA    ${ejemplo('ANALISTA_QA')}
  Todos los usuarios: infrastructure/seed/mvp/README.md
`);
if (hijos.length) console.log('Ctrl+C detiene los procesos iniciados por este comando.');
else {
  console.log('Todo ya estaba corriendo; no se inició ningún proceso nuevo.');
  process.exit(0);
}
