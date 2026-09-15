# ADR 0003 · Supabase Auth para identidad y Postgres con un esquema y un rol por servicio

- **Estado:** aceptada
- **Fecha:** 2026-09-15
- **Decisión base:** D3

## Contexto

El MVP necesita autenticación segura sin construirla desde cero, y datos privados por servicio con bajo costo de operación para un Capstone. El informe (p. 11) acepta compartir una instancia de PostgreSQL con esquemas privados y credenciales distintas, y advierte que el aislamiento lógico exige permisos, no solo nombres de esquema.

## Decisión

- **Identidad:** Supabase Auth. El portal se autentica directo con `supabase-js` y envía el access token al gateway. El `sub` del token es el `id` del usuario en Organización.
- **Datos:** el Postgres del mismo proyecto Supabase, con los esquemas `organizacion`, `certificaciones`, `impedimentos` e `integraciones`.
- **Un rol de login por servicio** (`svc_organizacion`, etc.), con `USAGE` y `CREATE` solo sobre su esquema. `REVOKE ALL` sobre `public` y sobre los esquemas ajenos.
- **Data API:** ninguno de los cuatro esquemas se expone en la Data API de Supabase (PostgREST). El navegador nunca consulta tablas.
- **Claves:** `service_role` solo en Organización, para la Admin API de Auth (altas, cambio de correo e invitaciones). El portal recibe únicamente `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`.
- **Secretos:** solo en `.env`, que no se versiona. `.env.example` lista las variables sin valores.

## Consecuencias

- Autenticación, expiración y revocación del refresh token las resuelve el proveedor. `signOut` no invalida un access token ya emitido: vive hasta su `exp`, así que se usa un TTL corto (ver ADR 0004 y el README del gateway).
- Una sola instancia implica fallos y mantenimiento compartidos. Es un compromiso aceptado para el MVP.
- `q360-infra` debe probar con un script que ningún rol lee un esquema ajeno (informe p. 15).
- Supabase local (`npx supabase start`) replica el mismo modelo en desarrollo.

## Alternativas descartadas

- **Keycloak o Auth0:** más operación o costo, sin ganancia para el alcance.
- **Una base de datos por servicio:** mejor aislamiento físico, pero multiplica contenedores, backups y conexiones para un equipo pequeño.
- **Esquema `public` con RLS y Data API:** acopla los servicios a tablas compartidas y expone datos al navegador.
