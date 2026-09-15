# ADR 0008 · Entorno local con Supabase CLI y Docker Compose; nube después

- **Estado:** aceptada
- **Fecha:** 2026-09-15
- **Decisión base:** D8

## Contexto

La demostración del MVP y la certificación de `q360-qa` necesitan un stack completo y reproducible en Windows 11 con Docker. La topología objetivo tiene un frontend, un gateway, cuatro servicios y una plataforma administrada de identidad y Postgres (informe p. 11).

## Decisión

- **Supabase local** con `npx supabase start` (la CLI no se instala globalmente). Configuración en `infrastructure/supabase/`.
  - API: `54321`.
  - Postgres: `54322`.
  - Studio: `54323`.
  - Mailpit: `54324`, donde llegan las invitaciones de alta de usuario (ADR 0007).
- **Docker Compose** en `infrastructure/docker-compose.yml`:
  - `web`: portal estático, publicado en `8080`.
  - `gateway`: publicado en `3000`.
  - `organizacion` (`3001`), `certificaciones` (`3002`), `impedimentos` (`3003`) e `integraciones` (`3004`): solo en la red interna, sin publicar puertos.
- Cada servicio recibe solo su propia `DATABASE_URL`, con su rol, hacia el Postgres de Supabase local (`host.docker.internal:54322`). Solo Organización recibe la clave `service_role`.
- En desarrollo sin Compose, `npm run dev` del portal usa `5173` y cada servicio corre con `npm run start:dev --workspace <servicio>`.
- Healthcheck `GET /health` en todos los servicios (declarado en los contratos).
- Los comandos funcionan en PowerShell y Git Bash, expuestos como scripts de npm. El objetivo es levantar todo con tres comandos.
- **Nube:** `q360-infra` documenta sin ejecutar el paso a Render o Railway con un proyecto Supabase alojado: variables que cambian y superficie expuesta.

## Consecuencias

- Docker es requisito para desarrollar y certificar. Supabase local consume varios contenedores y memoria.
- Los contenedores llegan al Postgres del host por `host.docker.internal`, que en Linux (CI) requiere `extra_hosts`. En CI las pruebas usan un Postgres del runner.
- Las credenciales de demo son solo locales y se documentan en `infrastructure/seed/mvp/README.md`.

## Alternativas descartadas

- **Proyecto Supabase en la nube para desarrollo:** estado compartido entre integrantes y secretos reales en cada equipo.
- **Postgres y GoTrue armados a mano en Compose:** replica lo que la CLI de Supabase ya resuelve.
- **Publicar los puertos de los servicios internos:** permitiría saltarse el gateway y contradice la topología.
