#!/usr/bin/env node
// Genera la configuración local (.env no versionados) a partir de `supabase status`.
// Uso: node infrastructure/local/preparar-entorno.mjs [--forzar]
// Sin --forzar no toca nada si todos los archivos ya existen. Solo para entorno local.
import { execSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const forzar = process.argv.includes('--forzar');
const ARCHIVOS = [
  'services/organizacion/.env',
  'services/certificaciones/.env',
  'services/impedimentos/.env',
  'apps/gateway/.env',
  'apps/web/.env.local',
  'infrastructure/seed/mvp/.env.carga',
];

if (!forzar && ARCHIVOS.every((a) => existsSync(join(RAIZ, a)))) {
  console.log('Configuración local ya existe (usa --forzar para regenerarla).');
  process.exit(0);
}

let salida;
try {
  salida = execSync('npx --yes supabase@2.117.0 status --workdir . -o env', {
    cwd: join(RAIZ, 'infrastructure'),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
} catch {
  console.error('Supabase local no está corriendo. Ejecuta: npm run supabase:start (en infrastructure/).');
  process.exit(1);
}
const sb = Object.fromEntries(
  salida
    .split(/\r?\n/)
    .filter((l) => l.includes('='))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, '')];
    }),
);
for (const clave of ['API_URL', 'JWT_SECRET', 'SERVICE_ROLE_KEY', 'PUBLISHABLE_KEY']) {
  if (!sb[clave]) {
    console.error(`supabase status no entregó ${clave}.`);
    process.exit(1);
  }
}

// Un solo token para todos, así los servicios siempre coinciden entre sí.
const token = randomBytes(24).toString('hex');
const api = sb.API_URL;
const db = (rol, esquema) => `postgresql://${rol}:${rol}_local_dev@127.0.0.1:54322/postgres?schema=${esquema}`;
const escribir = (ruta, variables) => {
  writeFileSync(join(RAIZ, ruta), Object.entries(variables).map(([k, v]) => `${k}=${v}`).join('\n') + '\n');
  console.log(`  escrito ${ruta}`);
};

escribir('services/organizacion/.env', {
  PORT: 3001,
  DATABASE_URL: db('svc_organizacion', 'organizacion'),
  SUPABASE_URL: api,
  SUPABASE_SERVICE_ROLE_KEY: sb.SERVICE_ROLE_KEY,
  SUPABASE_JWT_SECRET: sb.JWT_SECRET,
  PERMITIR_CARGA_SEMILLA: 'true',
  X_Q360_SERVICIO_TOKEN: token,
  CERTIFICACIONES_URL: 'http://localhost:3002',
});
escribir('services/certificaciones/.env', {
  PORT: 3002,
  DATABASE_URL: db('svc_certificaciones', 'certificaciones'),
  SUPABASE_URL: api,
  SUPABASE_JWT_SECRET: sb.JWT_SECRET,
  ORGANIZACION_URL: 'http://localhost:3001',
  X_Q360_SERVICIO_TOKEN: token,
});
escribir('services/impedimentos/.env', {
  PORT: 3003,
  DATABASE_URL: db('svc_impedimentos', 'impedimentos'),
  SUPABASE_URL: api,
  SUPABASE_JWT_SECRET: sb.JWT_SECRET,
  ORGANIZACION_URL: 'http://localhost:3001',
});
escribir('apps/gateway/.env', {
  PORT: 3000,
  PORTAL_ORIGENES: 'http://localhost:5173',
  SUPABASE_URL: api,
  SUPABASE_JWT_ISSUER: `${api}/auth/v1`,
  SUPABASE_JWT_AUDIENCE: 'authenticated',
  SUPABASE_JWT_SECRET: sb.JWT_SECRET,
  ORGANIZACION_URL: 'http://localhost:3001',
  CERTIFICACIONES_URL: 'http://localhost:3002',
});
escribir('apps/web/.env.local', {
  VITE_USAR_MOCKS: 'false',
  VITE_SUPABASE_URL: api,
  VITE_SUPABASE_ANON_KEY: sb.PUBLISHABLE_KEY,
  VITE_GATEWAY_URL: 'http://localhost:3000',
});
escribir('infrastructure/seed/mvp/.env.carga', {
  X_Q360_SERVICIO_TOKEN: token,
  ORGANIZACION_URL: 'http://localhost:3001',
});
console.log('Configuración local lista. Si Organización ya estaba corriendo, reinícialo para que tome el token nuevo.');
