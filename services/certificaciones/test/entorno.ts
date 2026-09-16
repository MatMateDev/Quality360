/**
 * Valores por defecto para que las pruebas corran sin ningún `.env*`
 * versionado: apuntan al Supabase local con el rol `svc_certificaciones` y
 * `?schema=certificaciones`. Cualquier variable ya presente en el entorno
 * (CI, o `.env.test` cargado con `--env-file-if-exists`) tiene prioridad.
 */
process.env.DATABASE_URL ??=
  'postgresql://svc_certificaciones:svc_certificaciones_local_dev@127.0.0.1:54322/postgres?schema=certificaciones';
process.env.SUPABASE_URL ??= 'http://127.0.0.1:54321';
process.env.SUPABASE_JWT_SECRET ??= 'secreto-hs256-solo-para-pruebas-locales-0000';
process.env.ORGANIZACION_URL ??= 'http://127.0.0.1:3001';
process.env.X_Q360_SERVICIO_TOKEN ??= 'token-servicio-local-de-pruebas-0123456789';
