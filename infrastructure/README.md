# infrastructure

Supabase local, esquemas y roles de Postgres, Docker Compose y Dockerfiles · dueño: **q360-infra** (`infrastructure/seed/` lo escribe q360-integraciones).

Todos los comandos de esta guía se ejecutan desde `infrastructure/` y funcionan igual en PowerShell y en Git Bash (son scripts de `npm`, sin sintaxis de shell específica).

```bash
cd infrastructure
```

## Requisitos

- Docker Desktop (Windows 11, motor 29+).
- Node.js ≥ 24 y npm ≥ 11 (no hace falta instalar la CLI de Supabase: se usa vía `npx`).
- Puerto 54321-54324 (Supabase), 3000/8080 (Compose) libres en el host.

## Levantar todo el entorno: 3 comandos

```bash
npm run supabase:start   # 1. Supabase local (Auth + Postgres + Studio + Kong + Mailpit)
npm run db:schemas       # 2. Crea los 5 esquemas de dominio y sus roles svc_*
npm run compose:up       # 3. Construye e inicia web, gateway y los 5 servicios
```

Atajo equivalente: `npm run up` (los tres pasos en orden). Para bajar todo: `npm run down`.

> Antes del paso 3 necesitas un `.env` en la **raíz del repo** (copia de `.env.example`) con, al menos, las 5 `DATABASE_URL_*` y las claves de Supabase (ver siguiente sección). `docker-compose.yml` lee ese `.env` con `--env-file ../.env`; nunca se versiona.

## Claves locales de Supabase

Después de `npm run supabase:start`, obtén las claves con:

```bash
npm run supabase:status
```

Equivale a `npx supabase status -o env` y muestra, entre otros:

- `API_URL` (`http://127.0.0.1:54321`), `DB_URL` (`postgresql://postgres:postgres@127.0.0.1:54322/postgres`), `STUDIO_URL` (`http://127.0.0.1:54323`), `MAILPIT_URL`/`INBUCKET_URL` (`http://127.0.0.1:54324`).
- Claves nuevas: `PUBLISHABLE_KEY` (`sb_publishable_…`) y `SECRET_KEY` (`sb_secret_…`).
- Claves legado (JWT HS256, firmadas con `JWT_SECRET`): `ANON_KEY` y `SERVICE_ROLE_KEY`.

Copia lo que necesites a tu `.env` local (nunca a un archivo versionado):

| `.env.example` | viene de `supabase status -o env` |
| --- | --- |
| `SUPABASE_URL` | `API_URL` |
| `SUPABASE_ANON_KEY` | `ANON_KEY` (o `PUBLISHABLE_KEY`) |
| `SUPABASE_SERVICE_ROLE_KEY` | `SERVICE_ROLE_KEY` (o `SECRET_KEY`) — **solo** lo usa `organizacion` |
| `SUPABASE_JWT_SECRET` | `JWT_SECRET` |
| `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` | `API_URL` / `ANON_KEY` (el portal nunca recibe la clave secreta) |

Las 5 `DATABASE_URL_*` usan el rol de servicio correspondiente (ver abajo), por ejemplo:

```
DATABASE_URL_ORGANIZACION=postgresql://svc_organizacion:<password>@host.docker.internal:54322/postgres
```

`<password>` es la que definió `db/001_esquemas_roles.sql` (ver comentario en ese archivo: son valores fijos **no secretos**, válidos solo para el Postgres local, nunca para un proyecto alojado).

## Puertos locales

| Servicio | Puerto | Publicado en Compose |
| --- | --- | --- |
| Portal web (`web`) | 8080 (5173 en `npm run dev` sin Compose) | sí |
| Gateway | 3000 | sí |
| Organización | 3001 | no (solo red interna) |
| Certificaciones | 3002 | no |
| Impedimentos | 3003 | no |
| Integraciones | 3004 | no |
| Indicadores | 3005 | no |
| Supabase API (Kong) | 54321 | — (fuera de Compose) |
| Supabase Postgres | 54322 | — (fuera de Compose, solo `127.0.0.1`) |
| Supabase Studio | 54323 | — |
| Mailpit (correos de Auth) | 54324 | — |

## Esquemas y roles de Postgres (`db/001_esquemas_roles.sql`)

Crea los 5 esquemas de dominio (`organizacion`, `certificaciones`, `impedimentos`, `integraciones`, `indicadores`) y un rol de login por servicio (`svc_organizacion`, `svc_certificaciones`, `svc_impedimentos`, `svc_integraciones`, `svc_indicadores`). Cada rol:

- Tiene `USAGE` + `CREATE` **solo** sobre su propio esquema (para que Prisma corra sus migraciones con ese rol).
- Recibe privilegios por defecto (`ALTER DEFAULT PRIVILEGES`) sobre las tablas que se creen en su esquema.
- **No** alcanza los otros 4 esquemas: se revoca explícitamente, además de que nunca se le concede nada ahí.
- Ninguno de los 5 esquemas se agrega a `[api].schemas` en `supabase/config.toml`, así que la Data API de Supabase (PostgREST) nunca los expone; además se revoca explícitamente `anon`, `authenticated` y `service_role` sobre ellos.

Aplicar (idempotente, se puede correr varias veces):

```bash
npm run db:schemas
```

### Verificación de aislamiento

```bash
npm run db:verificar-aislamiento
```

El script (`db/scripts/verificar-aislamiento.mjs`):

1. Cada rol crea una tabla de prueba en su propio esquema (ejercita `USAGE`+`CREATE`).
2. Control positivo: cada rol lee su propia tabla (debe funcionar).
3. Control de aislamiento: cada rol intenta leer la tabla de los otros 4 esquemas (debe fallar con `permission denied for schema …`).
4. Limpia las tablas de prueba y termina con código de salida 1 si algún rol logró leer un esquema ajeno.

Salida real (ejecutada el 2026-11-04 con `Q360_DB_CONTAINER` apuntando a un Postgres 16 con el mismo `001_esquemas_roles.sql`): los 5 roles crean y leen su propio esquema (`OK`), y las 20 combinaciones cruzadas quedan bloqueadas con `ERROR: permission denied for schema …`. Resultado: *"Cada rol svc_* solo alcanza su propio esquema. Aislamiento verificado."*

## Integraciones en local y Jira simulado (E5)

`npm run local` levanta Integraciones (puerto 3004, `/health`) igual que los otros servicios: aplica sus migraciones (esquema `integraciones`, rol `svc_integraciones`) y el gateway le reenvía las rutas `/v1/integraciones/*` con `INTEGRACIONES_URL=http://localhost:3004`.

- **Llave de cifrado de desarrollo.** `preparar-entorno.mjs` genera `INTEGRACIONES_LLAVE_CIFRADO` con `crypto.randomBytes(32).toString('base64')` y la guarda solo en `services/integraciones/.env` (no versionado). Es una llave por máquina: si ya existe y es válida se conserva, para no dejar ilegible el token de Jira guardado; si falta, el siguiente `npm run local` regenera el archivo. Si la borras, se crea otra y hay que volver a guardar el token en la pantalla de Integraciones. Sin llave el servicio arranca igual y solo cifrar o descifrar responde 503 `LLAVE_CIFRADO_NO_DISPONIBLE`.
- **Jira simulado.** El Jira falso de QA (`tests/support/jira-falso/`, lo construye q360-qa) escucha en `http://127.0.0.1:4010` y lo arranca el `globalSetup` de Playwright; no forma parte de `npm run local`. Para que Integraciones acepte ese sitio, el `.env` local trae `INTEGRACIONES_PERMITIR_HOST_PRUEBA=true` (se ignora con `NODE_ENV=production`). Credenciales del falso: correo `admin@quality360.local` y token `q360-token-valido-AB12` (datos de prueba, no reales). Un puerto cerrado como `http://127.0.0.1:4011` representa un sitio inexistente.
- **Instancias extra del perfil de QA (backlog E5, 10.3).** Se arrancan a mano con el mismo `.env` y variables sobreescritas; ninguna llave va en el repositorio (en Git Bash; en PowerShell usa `$env:VAR='...'`):
  - **I2**, sin llave de cifrado, puerto 3104: `PORT=3104 INTEGRACIONES_LLAVE_CIFRADO= node --env-file=services/integraciones/.env services/integraciones/dist/main.js`
  - **I3**, otra llave: `PORT=3105 INTEGRACIONES_LLAVE_CIFRADO=$(node -e "console.log(require('crypto').randomBytes(32).toString('base64'))") node --env-file=...`
  - **I4**, presupuesto corto: `PORT=3106 INTEGRACIONES_PRESUPUESTO_MS=2500 node --env-file=...`
  - **I5**, producción (prueba D95): `PORT=3107 NODE_ENV=production node --env-file=...`
  - **I6**, vencimiento de la consulta (E5 consulta, D134), puerto 3108: `PORT=3108 INTEGRACIONES_CONSULTA_VIGENCIA_MS=2000 node --env-file=services/integraciones/.env services/integraciones/dist/main.js`. I4 (presupuesto 2.500 ms) se reutiliza.
  Las variables del proceso tienen prioridad sobre `--env-file`. Los puertos 3105 a 3108 son una convención de esta guía; solo 3104 viene del backlog.
- **Variables de la consulta (sin valor fijo).** `INTEGRACIONES_CONSULTA_VIGENCIA_MS` y `INTEGRACIONES_CONSULTA_TOPE_ITEMS` (Integraciones) y `LIMITE_TASA_CONSULTA_MAX` (gateway) quedan vacías en los `.env` locales, que significa el valor por defecto (24 h, 500 filas, 120 por minuto). Si las defines en el entorno al lanzar `npm run local`, los procesos hijos las heredan y ganan a los `.env`.
- **Perfil de pruebas del servicio:** `JIRA_TIEMPO_LIMITE_MS=1500`, `JIRA_ESPERA_MAX_429_MS=1500`, `INTEGRACIONES_PRESUPUESTO_MS=8000`, `JIRA_TOPE_ISSUES=100`; se pasan igual, como variables del proceso.

## Indicadores en local (E6)

`npm run local` levanta Indicadores (puerto 3005, `/health`) como los otros servicios: esquema `indicadores`, rol `svc_indicadores` (de `db/001_esquemas_roles.sql`) y migraciones propias. El gateway le reenvía las rutas `/v1/indicadores/*` con `INDICADORES_URL=http://localhost:3005`. Mientras `services/indicadores` no tenga código compilado, `npm run local` lo omite con un aviso y el resto del entorno arranca igual (el gateway responde 503 en las rutas de indicadores, D179).

- **Dos secretos por máquina.** `preparar-entorno.mjs` genera `INDICADORES_SERVICIO_TOKEN` (D177) y `CRON_SECRET` (D178) con `crypto.randomBytes` y los escribe solo en `.env` no versionados. El token es idéntico en Organización, Certificaciones, Impedimentos e Indicadores; `CRON_SECRET` solo está en Indicadores. Si ya existen se conservan, también con `--forzar`, para que los cuatro servicios sigan coincidiendo. Si borras `services/indicadores/.env`, se generan nuevos y hay que reiniciar los cuatro servicios para que tomen el token.
- **Cron.** En local no corre ningún cron: el snapshot se genera con «Generar snapshot ahora» (Administrador) o llamando a `GET /v1/cron/indicadores/snapshot` con `Authorization: Bearer <CRON_SECRET de services/indicadores/.env>`. En la nube lo ejecuta Vercel a las 06:00 UTC (`services/indicadores/vercel.json`).
- **Persistencia.** `snapshot_indicadores` no admite `DELETE` y `evento_umbral_carga` no admite `UPDATE` ni `DELETE` para `svc_indicadores` (D193). Para limpiar entre pruebas se usa el dueño de la base (`postgres`), nunca la API.

## Docker Compose

`docker-compose.yml` define `web`, `gateway`, `organizacion`, `certificaciones`, `impedimentos`, `integraciones` e `indicadores`, todos en la red interna `interna`. Solo `web` (8080) y `gateway` (3000) publican puertos en el host; los 5 servicios de dominio solo son alcanzables dentro de esa red. Indicadores (3005) depende de Organización y recibe `INDICADORES_SERVICIO_TOKEN` y `CRON_SECRET` desde el `.env` de la raíz (vacíos no impiden arrancar); Organización, Certificaciones e Impedimentos reciben el mismo token. Integraciones ya no está en un perfil `e5`: se levanta con el resto (su `INTEGRACIONES_LLAVE_CIFRADO` es opcional en Compose). Todos tienen `healthcheck` (`GET /health`, sin autenticación, ver `contracts/`). Cada servicio recibe únicamente su propia `DATABASE_URL` (rol `svc_<servicio>`, nunca `postgres` ni `service_role`) apuntando a `host.docker.internal:54322` (con `extra_hosts` para que funcione también en Linux/CI). El Postgres de Supabase **no** se define en este Compose ni publica su puerto aquí: lo administra la CLI de Supabase, y solo escucha en `127.0.0.1:54322` del host.

```bash
npm run compose:config   # valida el YAML resuelto (no requiere que el código de los servicios exista)
npm run compose:up       # build + up -d
npm run compose:down
```

## Dockerfiles

Multi-stage, parametrizados con `ARG WORKSPACE` (y `ARG PORT` en el de Nest) para reutilizarse en los 5 backends/gateway y en el portal:

- `docker/Dockerfile.nest`: instala el monorepo completo, compila solo el workspace indicado (`npm run build --workspace ${WORKSPACE}`), arma una imagen final sin herramientas de build con solo `node_modules` de producción + `dist/`. Corre como usuario no root (`q360`). `HEALTHCHECK` con `wget` contra `/health`.
- `docker/Dockerfile.vite`: compila el portal con Vite (las variables `VITE_*` se incrustan en el build, nunca en runtime) y sirve el resultado estático con `nginx:1.27-alpine` (`docker/nginx.web.conf`, con *fallback* a `index.html` para el ruteo de React Router y un `GET /health`).

Ambos usan como contexto de build la **raíz del repo** (`context: ..` en `docker-compose.yml`), porque necesitan `package.json`/`package-lock.json` del monorepo. No se construyen imágenes de servicios cuyo código todavía no existe (Ola 1b); solo se valida `docker compose config`.

## CI (`.github/workflows/ci.yml`)

En cada Pull Request:

- **`contratos`**: `npm ci`, `npm run contracts:lint` (Redocly) y `npm run contracts:check` (cobertura de escenarios E1/E2 contra el backlog).
- **`workspaces`**: levanta un Postgres del propio runner (nunca Supabase alojado ni secretos reales), detecta con `.github/scripts/listar-workspaces-afectados.mjs` qué workspaces (`apps/*`, `packages/*`, `services/*`) cambiaron en el PR (o corre todos si cambió `package.json`/`package-lock.json` de la raíz) y para cada uno corre `lint`, `test` y `build` (`--if-present`, así no falla si un workspace todavía no define alguno de esos scripts).

## Nube (después, sin ejecutar)

Paso de Supabase local → proyecto Supabase alojado + Render o Railway (D13/D14):

- **Variables que cambian:** `SUPABASE_URL`/`SUPABASE_ANON_KEY`/`SUPABASE_SERVICE_ROLE_KEY`/`SUPABASE_JWT_SECRET` pasan de los valores locales fijos a los del proyecto alojado (rotados, nunca los de este README). Las 5 `DATABASE_URL_*` apuntan al Postgres alojado (host y puerto del proveedor, con SSL) y los roles `svc_*` se recrean ahí con contraseñas fuertes generadas una vez, guardadas solo en el `.env`/los *secrets* de cada plataforma (Render/Railway), nunca en el repo. `ORGANIZACION_URL`/`CERTIFICACIONES_URL`/`IMPEDIMENTOS_URL`/`INTEGRACIONES_URL`/`INDICADORES_URL` y las `FUENTE_RESUMEN_*_URL` pasan de nombres de servicio de Compose (`http://organizacion:3001`) a URLs internas del proveedor (o públicas si el proveedor no ofrece red privada). `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` se recompilan con los valores del proyecto alojado.
- **Qué queda expuesto:** el gateway (y el portal, servido como estático) son los únicos con URL pública; los 5 servicios de dominio siguen sin publicarse (red privada del proveedor, o autenticados con `X_Q360_SERVICIO_TOKEN` si el proveedor no da red privada). El proyecto Supabase alojado expone su API pública (`https://<proyecto>.supabase.co`) protegida por la clave pública (`anon`/`publishable`); los 5 esquemas de dominio siguen sin agregarse a `[api].schemas`, así que la Data API alojada tampoco los expone. La clave `service_role`/`secret` del proyecto alojado es real y solo vive en el `.env` de quien la usa (D13): no se versiona ni se comparte, y sigue limitada a `organizacion` (llamadas a la Admin API de Auth), nunca como rol de conexión a Postgres.
- **Indicadores en Vercel (E6, D194).** Sexto proyecto `quality360-indicadores` (raíz `services/indicadores`, región `gru1`). Orden: (1) `nube/007_rls_indicadores_nube.sql` en el SQL Editor y `alter role svc_indicadores with password '<solo letras y números>'`, sin pegar la contraseña en el repositorio; (2) migración `20261104000000_e6_indicadores` con `set local search_path to indicadores;`, y volver a ejecutar 007 para habilitar RLS y los REVOKE sobre las tablas ya creadas; (3) generar `INDICADORES_SERVICIO_TOKEN` y `CRON_SECRET` con `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`; (4) variables del proyecto: `DATABASE_URL` (rol `svc_indicadores`, pooler 6543), `SUPABASE_URL`, las tres URL de servicios y los dos secretos (Production, *Sensitive*); (5) el mismo `INDICADORES_SERVICIO_TOKEN` en Organización, Certificaciones e Impedimentos, con redeploy; (6) `INDICADORES_URL` en el gateway. Queda expuesto solo lo que reenvía el gateway; `/v1/interno/indicadores/*` da 404 desde afuera y la ruta del cron exige `Authorization: Bearer <CRON_SECRET>`. Paso a paso completo: `docs/arquitectura/e6-plan-construccion.md`, sección «Despliegue».
- **Migraciones al proyecto alojado:** vía el MCP de Supabase (`.mcp.json`), una vez que el usuario autentica su cuenta — no antes (D13), y no forma parte de esta corrida.
