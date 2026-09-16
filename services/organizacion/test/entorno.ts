import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Valores por defecto para que las pruebas corran sin ningún `.env*`
 * versionado: apuntan al Supabase local (D8) con el rol `svc_organizacion` y
 * `?schema=organizacion`. Cualquier variable ya presente en el entorno (CI,
 * o `.env.test` cargado con `--env-file-if-exists`) tiene prioridad: `??=`
 * solo completa lo que falte. Las llaves de Supabase (ANON, SERVICE_ROLE y JWT secret) no se
 * escriben en el código: si no vienen en el entorno, se leen de
 * `supabase status` del Supabase local.
 *
 * Se importa primero en `test/ayudas.ts` y `test/ayudas-app.ts`, antes de
 * instanciar `PrismaClient` o `crearApp`.
 */
process.env.DATABASE_URL ??=
  'postgresql://svc_organizacion:svc_organizacion_local_dev@127.0.0.1:54322/postgres?schema=organizacion';
process.env.SUPABASE_URL ??= 'http://127.0.0.1:54321';
if (!process.env.SUPABASE_ANON_KEY || !process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.SUPABASE_JWT_SECRET) {
  // Las llaves no se escriben en el código: se leen del Supabase local en ejecución.
  const local = leerSupabaseLocal();
  process.env.SUPABASE_ANON_KEY ??= local.ANON_KEY;
  process.env.SUPABASE_SERVICE_ROLE_KEY ??= local.SERVICE_ROLE_KEY;
  process.env.SUPABASE_JWT_SECRET ??= local.JWT_SECRET;
}
process.env.X_Q360_SERVICIO_TOKEN ??= 'token-servicio-local-de-pruebas-0123456789';
process.env.PERMITIR_CARGA_SEMILLA ??= 'true';
process.env.CERTIFICACIONES_URL ??= 'http://127.0.0.1:3002';


function leerSupabaseLocal(): Record<string, string> {
  const infraestructura = [resolve(process.cwd(), '../../infrastructure'), resolve(process.cwd(), 'infrastructure')].find((d) => existsSync(d));
  try {
    const salida = execSync('npx --yes supabase@2.117.0 status --workdir . -o env', { cwd: infraestructura, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    return Object.fromEntries(
      salida
        .split(/\r?\n/)
        .filter((linea) => linea.includes('='))
        .map((linea) => [linea.slice(0, linea.indexOf('=')), linea.slice(linea.indexOf('=') + 1).replace(/^"|"$/g, '')]),
    );
  } catch {
    throw new Error(
      'Las pruebas de Organización necesitan Supabase local (npm run supabase:start en infrastructure/) o las variables SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY y SUPABASE_JWT_SECRET.',
    );
  }
}
