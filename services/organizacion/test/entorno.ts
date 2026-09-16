/**
 * Valores por defecto para que las pruebas corran sin ningún `.env*`
 * versionado: apuntan al Supabase local (D8) con el rol `svc_organizacion` y
 * `?schema=organizacion`. Cualquier variable ya presente en el entorno (CI,
 * o `.env.test` cargado con `--env-file-if-exists`) tiene prioridad: `??=`
 * solo completa lo que falte. Los valores de Supabase (ANON/SERVICE_ROLE/JWT
 * secret) son las llaves de demostración fijas y públicas que trae
 * `supabase init` por defecto — no son secretos (ver
 * infrastructure/db/001_esquemas_roles.sql, mismo criterio).
 *
 * Se importa primero en `test/ayudas.ts` y `test/ayudas-app.ts`, antes de
 * instanciar `PrismaClient` o `crearApp`.
 */
process.env.DATABASE_URL ??=
  'postgresql://svc_organizacion:svc_organizacion_local_dev@127.0.0.1:54322/postgres?schema=organizacion';
process.env.SUPABASE_URL ??= 'http://127.0.0.1:54321';
process.env.SUPABASE_ANON_KEY ??=
  'llave-demo-local-omitida-leer-de-supabase-status';
process.env.SUPABASE_SERVICE_ROLE_KEY ??=
  'llave-demo-local-omitida-leer-de-supabase-status';
process.env.SUPABASE_JWT_SECRET ??= 'secreto-hs256-solo-para-pruebas-locales-0000';
process.env.X_Q360_SERVICIO_TOKEN ??= 'token-servicio-local-de-pruebas-0123456789';
process.env.PERMITIR_CARGA_SEMILLA ??= 'true';
process.env.CERTIFICACIONES_URL ??= 'http://127.0.0.1:3002';
