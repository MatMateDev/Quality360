# E6 · Plan de construcción (indicadores y dashboards)

Fecha: 2026-11-04. Rama: `feature/e1-e2-quality360`.

**Insumos:**
- **Backlog:** `docs/backlog/e6-indicadores-dashboards.md`, con 10 HDU, 30 escenarios y 117 casos. Las secciones que más se usan:
  - 3: definiciones.
  - 4: permisos.
  - 5: modelo.
  - 7: efecto sobre lo certificado.
  - 8: fixture.
- **Diseño:** `docs/diseno/e6-indicadores-dashboards.md`. Sus brechas de la sección 15 se resuelven en la tabla de `decisiones-mvp.md`.
- **Decisiones:**
  - D153–D175 están en el backlog.
  - D176–D195 están en `docs/arquitectura/decisiones-mvp.md`, sección «Corrida E6», junto con el modelo de datos.
  - El ADR es el 0017.

**Contratos:** viven en `contracts/*.yaml`.
- Nuevos o cambiados:
  - `indicadores.v1.yaml` es nuevo.
  - `comun`, `organizacion`, `gateway`, `certificaciones` e `impedimentos` tienen cambios aditivos.
- Validación:
  - `npm run contracts:lint` pasa sin advertencias.
  - `npm run contracts:check` cubre 272/272 escenarios; los 30 de E6 están completos.
- Nadie cambia un contrato sin pasar por `q360-arquitecto`. Si aparece una brecha, se reporta y no se improvisa.

**Tipos del portal:** `npm run contracts:types` genera `contracts/dist/types/indicadores.v1.d.ts` y actualiza `gateway.v1.d.ts`.
- **Bloqueante conocido:** `tsc --noEmit -p apps/web/tsconfig.json` falla hoy con 5 errores en `apps/web/src/pages/hdu/HduDetailPage.tsx:305-307`.
- La causa es que el historial asume que el último tipo de evento es `ASIGNACION`, y la unión ahora suma `CIERRE_EXCEPCION`.
- Es la primera tarea de F1 de `q360-frontend`, y nadie más debe tocar ese archivo.

## Cómo se trabaja en paralelo

- Los seis agentes arrancan contra los contratos: `q360-backend`, `q360-seguridad-gateway`, `q360-frontend`, `q360-infra`, `q360-integraciones` y `q360-qa`.
- Cada uno trabaja en su worktree, escribe solo en los archivos que le asigna la tabla de abajo, hace commit con su prefijo y no hace push.
- El portal usa MSW y los tipos generados hasta que exista cada endpoint. **Los mocks no cuentan como avance.** Una HDU se da por terminada solo cuando funciona contra el stack real (Supabase local más `npm run local`) y después en la nube.
- Al cerrar, `q360-qa` repite la regresión de E1–E5 y E7 (sección 7 del backlog E6) y certifica en `docs/validacion/certificacion-e6.md`.

### Archivos por agente (sin solapes)

| Agente | Escribe en | No toca |
| --- | --- | --- |
| `q360-backend` | `services/indicadores/**` salvo `vercel.json`; `services/organizacion/**`; en `services/certificaciones` y `services/impedimentos`, solo la guardia de la credencial de Indicadores, su registro en el controlador interno, `src/configuracion.ts`, `.env.example` y sus pruebas | `infrastructure/**`, `apps/**`, `tests/**` |
| `q360-infra` | `infrastructure/db/**`, `infrastructure/docker/**`, `infrastructure/docker-compose.yml`, `infrastructure/local/**`, `infrastructure/nube/007_rls_indicadores_nube.sql`, `infrastructure/README.md` y `services/indicadores/vercel.json` | `infrastructure/seed/**`, código de los servicios |
| `q360-seguridad-gateway` | `apps/gateway/**` y la fila del gateway en `GUIA-VERCEL.md` | Servicios y portal |
| `q360-frontend` | `apps/web/**` | Todo lo demás |
| `q360-integraciones` | `infrastructure/seed/e6/**` y una nota en `infrastructure/seed/mvp/README.md` | Servicios (la semilla usa solo la API) |
| `q360-qa` | `tests/**` y `docs/validacion/**` | Código de producción |

`package.json` de la raíz ya tiene `seed:e6`, y `contracts/**` es del arquitecto: ninguno de los dos se toca.

## Orden y dependencias

| Ola | Quién | Entrega | Desbloquea |
| --- | --- | --- | --- |
| 1 | backend | X0 · esqueleto de `services/indicadores` (Nest, Prisma, configuración, `/health`, `api/index.mjs`, puerto 3005) | Todo Indicadores, L1 |
| 1 | backend | O1 · migración `20261104000000_e6_cierre_excepcion` y cierre con excepción (E6-B05) | F5 real, X3 |
| 1 | infra | L1 · rol y esquema locales, Compose, `npm run local` con Indicadores, `vercel.json` con el cron | Pruebas locales |
| 1 | gateway | G1 · rutas de indicadores, ruta pública del cron, `INDICADORES_URL` no fatal | Integración real del portal |
| 1 | frontend | F1 · arreglo de `HduDetailPage`, tipos, API, rutas, menús y mocks | F2–F6 |
| 1 | qa | Q1 · `contrato.ts` con `indicadores.v1.yaml`, ayudantes de fixture y limpieza | Pruebas de todos |
| 2 | backend | O2 · internos `GET /v1/interno/indicadores/{ambito,snapshot}` y credencial de Indicadores en Org, Cert e Imp (D176, D177) | X2–X5 |
| 2 | backend | X1 · migración `20261104000000_e6_indicadores` y repositorios | X2–X5 |
| 2 | integraciones | S1 · `seed:e6` | Pruebas de `q360-qa` |
| 2 | frontend | F5 · cierre con excepción en `/hdu/:id` (E6-F05) | — |
| 3 | backend | X2 · filtros y cumplimiento (E6-B01) | F2 real |
| 3 | backend | X3 · semáforo, drill-down, carga y umbral (E6-B02) | F3, F4 reales |
| 3 | frontend | F2 · Cumplimiento (E6-F01) | — |
| 4 | backend | X4 · snapshot: cron, manual, ejecuciones y gancho de prueba; tendencia (E6-B03) | F6 real |
| 4 | backend | X5 · exportación CSV y PDF (E6-B04) | F6 |
| 4 | frontend | F3 · Semáforo (E6-F02), F4 · Carga (E6-F03) | — |
| 5 | frontend | F6 · Tendencia, exportación (E6-F04) y snapshots del Administrador | — |
| 6 | infra y backend | D1 · `nube/007`, migraciones en la nube y proyecto Vercel (D194) | Certificación en la nube |
| 7 | qa | Regresión de E1–E5 y E7, los 117 casos, axe y búsqueda de secretos | Dictamen |

B05 va antes que B01 porque Indicadores clasifica con `cierreParcial`. Los internos de Organización (O2) van antes que cualquier lectura de Indicadores.

## q360-backend · Organización (`services/organizacion`)

### O1 · Cierre con excepción (E6-B05, D173–D175, D189)

- **Migración:** tabla `cierre_hdu` y `ALTER TYPE "AccionAuditoria" ADD VALUE 'CERRAR_HDU_PARCIAL'`. Ver «Modelo de datos» en `decisiones-mvp.md`.
- **`hdu.servicio.ts` › `cambiarEstado`:** sigue el orden de D189 al pie de la letra.
  - Con Certificaciones caído responde siempre 409 `CHECKLIST_NO_DISPONIBLE`. La prueba certificada `test/integracion/e2-hdu.test.ts:258` no cambia.
  - Sin justificación, el 409 `CHECKLIST_INCOMPLETO` suma `puedeCerrarConExcepcion`.
  - Con justificación y sin ser QE responsable: 403.
  - Con justificación en blanco: 422 `JUSTIFICACION_REQUERIDA`. Con largo fuera de 20–500, después de quitar espacios: 400 `VALIDACION` con `campo: justificacion`.
  - Después vienen los impedimentos.
  - Todo en una transacción con `SELECT … FOR UPDATE`, volviendo a verificar `PENDIENTE_CIERRE`.
  - Escribe `cierre_hdu`, dos eventos de historial (`ESTADO` y `CIERRE_EXCEPCION`) y dos entradas de auditoría (`CAMBIAR_ESTADO_HDU` y `CERRAR_HDU_PARCIAL`).
- **Lecturas:**
  - `GET /v1/hdu/{id}` suma `cierre` y `permisos.cerrarConExcepcion`.
  - El listado suma `cierreParcial`, derivado con `EXISTS`.
  - El historial devuelve el evento `CIERRE_EXCEPCION`.
- **Pruebas:** los 12 casos de E6-B05 como integración, más E6-B05-T12. También deben seguir pasando sin cambios `e3-acceso-y-cierre.test.ts` y `e4-impedimentos-organizacion.test.ts`.

### O2 · Internos para Indicadores (D176, D177)

- **`GET /v1/interno/indicadores/ambito`:**
  - Usa el token del usuario.
  - Reglas de D176. Analista y Administrador reciben 403.
  - Una sola consulta por tabla, sin N+1.
- **`GET /v1/interno/indicadores/snapshot?limite=`:**
  - Usa solo la credencial de Indicadores, con una guardia nueva que compara `X-Q360-Servicio-Token` contra `INDICADORES_SERVICIO_TOKEN` en tiempo constante. Si la variable no existe, responde siempre 401.
  - Devuelve todas las HDU, `total` y `ambitosQe`.
- **`POST /v1/interno/auditoria/exportaciones`** acepta el recurso `INDICADORES` y los roles QE y Líder QA.
- `INDICADORES_SERVICIO_TOKEN` en `configuracion.ts` es opcional y no fatal.

## q360-backend · Certificaciones e Impedimentos

### C1 · Credencial de Indicadores

- `POST /v1/interno/checklist/estados` (Certificaciones) y `POST /v1/interno/impedimentos/evaluacion` (Impedimentos) aceptan la sesión **o** la credencial de Indicadores. Usan la misma guardia de O2, copiada en cada servicio: no se importa de un servicio a otro, y `packages/` no recibe lógica.
- Ninguna otra ruta acepta esa credencial. Prueba: con la credencial, `GET /v1/hdu/{id}/checklist` responde 401.
- Certificaciones ya rechaza el certificado de una HDU `CERRADA` (`entregables.ts:156`). Se agrega la prueba E6-B05-T07.

## q360-backend · Indicadores (`services/indicadores`)

La estructura es la de Impedimentos: `api` → `aplicacion` → `dominio`, con `infraestructura` detrás de puertos.
- El dominio (clasificación de 3.2, cumplimiento, semáforo, sobrecarga, series) es puro: no importa Prisma, Nest ni `fetch`.
- Los clientes HTTP de Organización, Certificaciones e Impedimentos viven en `infraestructura/` y no importan código de esos servicios.
- La autenticación usa `packages/auth-nest`, que solo verifica la sesión. El rol sale de Organización (`/v1/interno/acceso` o `ambito`), nunca del token.

### X0 · Esqueleto

- Nest, `configuracion.ts` y `/health`.
- `api/index.mjs`, igual que en los otros servicios. El `vercel.json` es de infra.
- `.env.example` sin valores.
- Variables:
  - `DATABASE_URL`, `ORGANIZACION_URL`, `CERTIFICACIONES_URL`, `IMPEDIMENTOS_URL`, `CRON_SECRET` e `INDICADORES_SERVICIO_TOKEN`.
  - Las de D172: `INDICADORES_UMBRAL_DEFECTO`, `INDICADORES_UMBRAL_MIN`, `INDICADORES_UMBRAL_MAX`, `INDICADORES_TOPE_HDU` y `EXPORTACION_PDF_LIMITE_FILAS`.
  - `INDICADORES_FUENTE_TIMEOUT_MS` (2000), `INDICADORES_SNAPSHOT_TIMEOUT_MS` (8000) y `Q360_FECHA_REFERENCIA`, que se ignora en producción.
- Ninguna variable impide arrancar. Si faltan `CRON_SECRET` o la credencial, el cron y el snapshot responden 401 o quedan `FALLIDA`, y el resto funciona.

### X1 · Modelo

- Migración `20261104000000_e6_indicadores`, con las tablas de §5 del backlog más las columnas de D184 y D193.
- Sin FK a otros esquemas; los ids externos son UUID sin FK.

### X2 · Filtros y cumplimiento (E6-B01)

- D180, D187 y D188.
- `sinDatos` con su motivo. Bloques `indisponible` con valor `null`; nunca 0.

### X3 · Semáforo, drill-down, carga y umbral (E6-B02)

- D181, D182, D183, D188 y D190.
- La carga usa el umbral **de cada QE** del grupo.

### X4 · Snapshot y tendencia (E6-B03)

- **`GET /v1/cron/indicadores/snapshot`:** `Authorization: Bearer` comparado en tiempo constante, origen `CRON` y actor `SISTEMA`.
- **`POST /v1/indicadores/snapshots`:** solo el Administrador; si ya hay una en curso, 409 `EJECUCION_EN_CURSO`.
- **`GET …/ejecuciones`.**
- **Gancho `POST /v1/interno/carga/snapshots`:** requiere la credencial de semilla y `PERMITIR_CARGA_SEMILLA`.
- **Upsert** por `(fecha, celula, sprint, ambito)`. La fecha es la de Santiago, calculada con `Intl` y sin dependencias nuevas.
- **Tendencia:** D185.

### X5 · Exportación (E6-B04)

- D186.
- CSV con `;` (como E7, D48), BOM y CRLF, más la neutralización de D122.
- PDF con `pdf-lib`, la misma versión que usa Certificaciones.
- El archivo se entrega solo después de registrar `EXPORTAR`.

## q360-seguridad-gateway (`apps/gateway`)

### G1 · Rutas, cron y configuración (D178, D179)

- **`src/api/indicadores.controller.ts`:**
  - Reenvía las 12 rutas públicas una por una a `INDICADORES_URL`, sin composición.
  - La exportación se reenvía en binario con `Content-Type`, `Content-Disposition` y `X-Q360-Filas`.
- **Cron:**
  - `GET /v1/cron/indicadores/snapshot` queda marcada como pública, sin verificar sesión, y reenvía `Authorization` tal cual.
  - El gateway **no** conoce `CRON_SECRET`.
  - Se le aplica el límite de escritura.
- **Configuración:**
  - `INDICADORES_URL` es opcional en producción: si falta, `indicadoresUrl: null`, las rutas responden 503 `SERVICIO_NO_DISPONIBLE` y queda un solo registro, sin el valor.
  - En desarrollo vale `http://localhost:3005`.
  - `INDICADORES_TIMEOUT_MS` vale 25000.
- **Rutas que no se publican:**
  - `/v1/interno/indicadores/*` y `/v1/interno/carga/snapshots` desde afuera dan 404.
  - `X-Q360-Servicio-Token` se sigue quitando.
- **Pruebas:**
  - Sin `INDICADORES_URL`, `/health` y `/v1/me` funcionan, y `/v1/indicadores/cumplimiento` da 503.
  - El cron sin `Authorization` llega al servicio, que responde 401.
  - Las rutas internas dan 404.
- **Documentación:** `.env.example`, `README.md` y la fila del gateway en `GUIA-VERCEL.md`.

## q360-frontend (`apps/web`)

- **F1 · Base.**
  - Primero el arreglo de `HduDetailPage.tsx`, para que el historial trate `CIERRE_EXCEPCION` y `tsc` vuelva a 0.
  - Después:
    - `src/api/indicadores.ts`;
    - las rutas `/qe/indicadores`, `/lider/indicadores`, `/auditor/indicadores` y `/admin/indicadores/snapshots`, con `RequireRole`;
    - los menús de la sección 7 del backlog: el QE conserva «Integraciones», según la brecha 10;
    - las pestañas fuera de `AuditorLayout`, según la brecha 9;
    - los mocks MSW.
- **F2 · Cumplimiento** (E6-F01).
  - Las opciones de filtro salen de `/filtros`, y «Sin sprint» solo aparece si `hduSinSprint > 0`.
  - «Datos al …» usa `generadoEn`.
  - Si `sinDatos` es verdadero, se muestra su mensaje y no un 0.
- **F3 · Semáforo** (E6-F02). Tarjetas `tarjeta-celula-<celulaId>` y drill-down de D181. `calculoParcial` muestra «al menos».
- **F4 · Carga** (E6-F03).
  - Grupos `grupo-qe-<qeId|sin-qe>` y filas `fila-analista-<analistaId>`, más la nota de los filtros.
  - El editor del umbral solo está disponible para el QE.
  - El historial del umbral lo ven el QE y el Auditor.
- **F5 · Cierre con excepción** (E6-F05).
  - El botón aparece si se cumple `permisos.cerrarConExcepcion` y el checklist tiene menos de 10 aprobados.
  - Diálogo `dialogo-cierre-excepcion` y bloque `cierre-excepcion`. «Pasar a Cerrada» no se renombra.
- **F6 · Tendencia, exportación y snapshots** (E6-F04 y la pantalla del Administrador).
  - Gráfico SVG propio con tabla alternativa.
  - Descarga con el nombre que entrega `Content-Disposition`.
- **F7 · Accesibilidad.** axe a 1280 y 375 px en las 5 pantallas y el diálogo. Cero violaciones `serious` o `critical`.

## q360-infra

- **L1:**
  - Esquema `indicadores` y rol `svc_indicadores` en `infrastructure/db` (nuevo archivo o extensión de `001`), con `REVOKE` hacia los otros esquemas.
  - Servicio `indicadores` en Compose, en el puerto 3005, con healthcheck.
  - `npm run local` levanta Indicadores y agrega `INDICADORES_URL` al gateway.
  - `preparar-entorno.mjs` genera, una sola vez por máquina, un `INDICADORES_SERVICIO_TOKEN` y un `CRON_SECRET` aleatorios. Los guarda en los `.env` no versionados de Indicadores, Organización, Certificaciones e Impedimentos, y los conserva si ya existen.
- **`services/indicadores/vercel.json`:** el mismo patrón de los otros servicios (región `gru1`, `maxDuration` 30), más `"crons": [{ "path": "/v1/cron/indicadores/snapshot", "schedule": "0 6 * * *" }]`.
- **D1 (con backend):** `infrastructure/nube/007_rls_indicadores_nube.sql`. Crea el esquema y el rol si no existen, habilita RLS sin políticas y aplica los `REVOKE`, de forma idempotente.

## q360-integraciones · Semilla (`infrastructure/seed/e6/`)

- **`cargar.mjs`** (`npm run seed:e6`) es idempotente y usa solo la API y las cargas internas existentes. Agrega lo estático de la sección 8: QE3 (sin analistas ni HDU), LID3 (Líder QA propio de E6), CEL-D asignada a LID3 y ANA4 (sin QE ni HDU). LID2 sigue sin células, como exigen las pruebas certificadas de E7 y E4 (D208).
- **`escenarios.mjs`** exporta ayudantes para `q360-qa`:
  - `supervisarAna4ConQe2`;
  - `reasignarH4AAna1` (ADM1, `PUT /v1/hdu/{id}/analista`, D190);
  - `crearAnalistaDesactivadoConHdu` (crear, asignar y desactivar por la API del Administrador);
  - `cargarSnapshots(instantes)`, que usa `POST /v1/interno/carga/snapshots`. Ejemplo: tres días con H1 en 30, 30 y 40 %.
- **Estado base:** `npm run seed` (MVP) debe volver al estado base de E7, con 10 usuarios activos y `hdu-total 8`. Si eso no es posible, los usuarios de E6 se crean con correos propios y se dejan **inactivos** al limpiar. Esto se documenta en `infrastructure/seed/mvp/README.md`.
- H4 con 0 % de avance queda confirmado por la semilla de E4. Si no lo está, se reporta y no se ajustan las cifras.

## q360-qa (`tests/`, `docs/validacion/`)

- **Q1:**
  - `tests/support/contrato.ts` carga también `indicadores.v1.yaml`.
  - Limpieza: vaciar `indicadores.*` y `organizacion.cierre_hdu` como dueño de la base. Nunca por API.
  - Cada archivo que cierra una HDU recarga la semilla, porque `CERRADA` es terminal.
- **Casos:** los 117 del backlog E6, con el ID del escenario en el nombre (`[E6-F03#2]`).
- **Regresión certificada que cambia o se ve afectada:**
  - Menús exactos de QE, Líder, Auditor y Administrador, en E1-F02#3 y en las pruebas de menú de E7.
  - Matriz de rutas de E7-F01-T04, que suma 4 rutas.
  - E7-F06-T07 y toda prueba que lea «la última entrada de auditoría» o «el primer cambio»: deben crear su propio evento antes de leer.
  - Pruebas del gateway que enumeran rutas o variables.
  - `seguridad-aislamiento-esquemas.spec.ts` y `modelo-datos-*`, que suman el esquema `indicadores` y el rol `svc_indicadores`.
  - El historial de `/hdu/:id` con el evento nuevo.
- **No cambian:** `e2-hdu.test.ts` (409 `CHECKLIST_NO_DISPONIBLE`), `e3-acceso-y-cierre.test.ts`, `e4-impedimentos-organizacion.test.ts`, E2-B02#3 sin justificación y E7-F03 `listas-cerrar`.
- **Búsqueda de secretos:** `CRON_SECRET`, `INDICADORES_SERVICIO_TOKEN` y `Authorization` no aparecen en registros, respuestas ni DOM.

## Lo que se rechaza en revisión

- SQL o llaves foráneas desde `indicadores` hacia otro esquema, o vistas entre esquemas.
- Imports entre servicios. La guardia de la credencial se copia en cada servicio; no se comparte código de dominio por `packages/`.
- Lógica de dominio en `packages/` o en el gateway (clasificación, semáforo, umbral).
- Autorización por el `rol` del token o por `user_metadata`. El ámbito siempre sale de Organización.
- Una fuente caída convertida en 0, en VERDE, en `sobrecargado: false` o en una lista vacía. Lo correcto es `indisponible` o 503.
- Una exportación entregada sin el registro `EXPORTAR`, o con bloques indisponibles.
- Que el cron acepte una petición sin `CRON_SECRET` configurado.
- Que la credencial de Indicadores se acepte en una ruta de escritura.
- Un dominio que importe Prisma, Nest o `fetch`.
- Una variable nueva que impida arrancar al gateway o a un servicio.

## Despliegue (paso a paso para el usuario, sin secretos)

> El código de E6 debe estar en `main` de `MatMateDev/Quality360`, porque un push a `main` redespliega los proyectos existentes. Si Supabase en la nube estuvo pausado, reactívalo antes del paso 1.

1. **Rol de base de datos.**
   - Ejecuta `infrastructure/nube/007_rls_indicadores_nube.sql` en el SQL Editor.
   - Después ejecuta `alter role svc_indicadores with password '<contraseña de solo letras y números>';`.
   - Guarda la contraseña en tu gestor. No la pegues en el chat ni en el repositorio.
2. **Migraciones**, antes de publicar el código y en este orden:
   1. `services/organizacion/prisma/migrations/20261104000000_e6_cierre_excepcion/migration.sql`, precedida de `set local search_path to organizacion;`.
   2. `services/indicadores/prisma/migrations/20261104000000_e6_indicadores/migration.sql`, precedida de `set local search_path to indicadores;`.
3. **Dos secretos nuevos.** Genera cada uno en tu computador con `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`, uno para `CRON_SECRET` y otro para `INDICADORES_SERVICIO_TOKEN`.
4. **Proyecto `quality360-indicadores`.**
   - En vercel.com/new importa el repositorio con **Root Directory** `services/indicadores`.
   - Variables:

| Variable | Valor |
| --- | --- |
| `DATABASE_URL` | `postgresql://svc_indicadores.<idProyecto>:<contraseña>@<HOST del pooler>:6543/postgres?schema=indicadores&pgbouncer=true&connection_limit=1` |
| `SUPABASE_URL` | `https://<idProyecto>.supabase.co` |
| `ORGANIZACION_URL`, `CERTIFICACIONES_URL`, `IMPEDIMENTOS_URL` | URL real de cada proyecto |
| `CRON_SECRET` | El del paso 3. Solo **Production**, marcado como *Sensitive* |
| `INDICADORES_SERVICIO_TOKEN` | El del paso 3. Solo **Production**, marcado como *Sensitive* |

   - Pulsa Deploy. En **Settings › Cron Jobs** debe aparecer `/v1/cron/indicadores/snapshot` con `0 6 * * *`.
5. **El mismo `INDICADORES_SERVICIO_TOKEN`** va en `quality360-organizacion`, `quality360-certificaciones` y `quality360-impedimentos`. Después, **Redeploy** de los tres.
6. **Gateway.** Agrega `INDICADORES_URL` a `quality360-gateway` y haz Redeploy. Si te olvidas de esta variable, el portal funciona igual y solo «Indicadores» aparece como «No disponible».
7. **Verificación sin sesión:**
   - `https://<indicadores>/health` responde `{"estado":"ok"}`.
   - `https://<gateway>/v1/indicadores/cumplimiento` responde 401.
   - `https://<gateway>/v1/cron/indicadores/snapshot` sin cabecera responde 401.
   - `https://<gateway>/v1/interno/indicadores/ambito` responde 404.
8. **Verificación con sesión.**
   - Como Administrador, abre «Snapshots de indicadores» y pulsa «Generar snapshot ahora». La ejecución debe quedar `EXITOSA`.
   - Si queda `FALLIDA` con `CONFIGURACION_INVALIDA`, el token del paso 5 no coincide en algún proyecto.
   - Como QE, abre «Indicadores».
