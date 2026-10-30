# E4 · Plan de construcción (impedimentos y riesgos)

Fecha: 2026-10-26. Rama: `feature/e1-e2-quality360`.

**Insumos:**
- Backlog: `docs/backlog/e4-impedimentos-y-riesgos.md`, con 8 HDU, 24 escenarios y 89 casos (catálogos en la sección 3, modelo de datos en la 4, efectos sobre lo certificado en la 6 y fixture en la 7).
- Diseño: `docs/diseno/e4-impedimentos-y-riesgos.md`.
- Decisiones: D57–D74 en el backlog y D75–D92 en `docs/arquitectura/decisiones-mvp.md` (sección «Corrida E4»), más el ADR 0014.

**Contrato:** el de `contracts/*.yaml`. Pasa `npm run contracts:lint` sin advertencias y `npm run contracts:check` con 186/186 escenarios (E1, E2, E3, E4 y E7). Nadie cambia un contrato sin pasar por `q360-arquitecto`; si al construir aparece una brecha, se reporta y no se improvisa en el código.

**Tipos del portal:** con los contratos de E4, `npm run contracts:types` y `tsc --noEmit` de `apps/web` terminan sin errores (comprobado el 2026-10-26). No hay paso bloqueante de tipos. Los mocks de MSW no están tipados con `Bandeja*`, así que el compilador no avisa que les falta el bloque `impedimentos`: hay que agregarlo a mano (F1).

## Cómo se trabaja en paralelo

- `q360-backend`, `q360-seguridad-gateway`, `q360-integraciones` y `q360-frontend` arrancan el mismo día contra los contratos.
- El portal trabaja con MSW (`apps/web/src/mocks`) y los tipos de `contracts/dist/types/gateway.v1.d.ts` hasta que el backend publique cada endpoint. Los mocks no cuentan como avance: una HDU se da por terminada solo cuando funciona contra el stack real (Supabase local más `npm run local` o Compose) y después en la nube.
- Cada agente trabaja en su worktree, escribe solo en sus carpetas, hace commit con su prefijo y no hace push.
- Al cerrar la corrida, `q360-qa` vuelve a ejecutar la regresión de E1, E2, E3 y E7 (sección 6 del backlog E4) y certifica E4 en `docs/validacion/certificacion-e4.md`.

## Orden y dependencias

| Ola | Quién | Entrega | Desbloquea |
| --- | --- | --- | --- |
| 1 | backend | B1 · migración y configuración de Impedimentos | Todo lo de Impedimentos |
| 1 | backend | B6 · internos nuevos de Organización (acceso con candidatos, ámbito con detalle, campos de `HduParaCertificacion`, sprint de una HDU) | B2, B3, semilla |
| 1 | backend | B7 · `SeguimientoHdu.certificacionId` en Certificaciones | B2 |
| 1 | gateway | G1 · rutas de E4 hacia Impedimentos | Integración real del portal |
| 1 | frontend | F1 · tipos, menú, componentes base y mocks | F2–F5 |
| 2 | backend | B2 · registro y ciclo de vida (E4-B01, B02) | F2, F3 reales; B5 |
| 2 | integraciones | S1 · semilla E4 (fixture de la sección 7) | Pruebas de `q360-qa` |
| 2 | frontend | F2 · sección «Impedimentos» del detalle, diálogos y cierre bloqueado (E4-F01, F03) | — |
| 3 | backend | B3 · riesgo (E4-B03) | F4 real, B5 |
| 3 | backend | B4 · gestión y Auditor (E4-B04) | F5 real |
| 3 | backend | B5 · internos para Organización y carga semilla | B8 |
| 3 | frontend | F3 · `/qe/impedimentos` y `/qe/impedimentos/riesgo` (E4-F02, F04) | — |
| 3 | frontend | F4 · panel «Riesgo» del detalle (E4-F04) | — |
| 4 | backend | B8 · Organización: cierre bloqueado y bloques de bandejas | F5 real |
| 4 | frontend | F5 · bloques de las 5 bandejas y pestaña del Auditor | — |
| 5 | infra y backend | D1 · Impedimentos en Vercel, variables y migración en la nube | Certificación en la nube |
| 6 | qa | Regresión E1–E3 y E7, certificación E4 y axe (D84) | Dictamen |

## q360-backend · Impedimentos (`services/impedimentos`)

La estructura sigue la de Certificaciones: `api` → `aplicacion` → `dominio`, con `infraestructura` detrás de puertos. El dominio no importa Prisma, Nest ni clientes HTTP.

### B1 · Modelo de datos y configuración (D88)

**Archivos:**
- `prisma/schema.prisma`, con los modelos `Impedimento`, `AccionImpedimento` y `RiesgoHdu`.
- `prisma/migrations/20261026000000_e4_impedimentos_riesgo/migration.sql`, tal como lo especifica «Modelo de datos» en la Corrida E4: columnas, 4 CHECK en `impedimento`, CHECK en `accion_impedimento` y `riesgo_hdu`, índices (2 parciales) y `REVOKE`.
- `src/configuracion.ts`, con estas variables:
  - `CERTIFICACIONES_URL`, `ORGANIZACION_TIMEOUT_MS` (5000 por defecto, como en Certificaciones) y `CERTIFICACIONES_TIMEOUT_MS` (2000).
  - `RIESGO_DIAS_IMPEDIMENTO_ALTO=5`, `RIESGO_DIAS_SPRINT_ALTO=3`, `RIESGO_AVANCE_ALTO=70`, `RIESGO_DIAS_SPRINT_MEDIO=7` y `RIESGO_AVANCE_MEDIO=50` (D67).
  - `Q360_FECHA_REFERENCIA`, que se ignora con `NODE_ENV=production` (D68, D90).
  - `EXPORTACION_LIMITE_FILAS` (50.000) y `PERMITIR_CARGA_SEMILLA` más el secreto de `credencialServicio`, como en Organización.

**Prueba:** `modelo-datos-estructura` debe seguir pasando, con `riesgo_hdu` agregada. E4-B01-T10 (sin FK a otros esquemas y CHECK que rechazan) y E4-B04-T07 (UPDATE y DELETE dan 42501).

### B2 · Registro y ciclo de vida (E4-B01, E4-B02)

**Archivos:**
- `src/dominio/`:
  - `impedimento.ts`: entidad, transiciones de la tabla 3.2 y `operacionesPermitidas`.
  - `permisos.ts`: la matriz de relaciones de D89.
  - `dias.ts`: días de calendario en `America/Santiago`.
  - Sin dependencias de infraestructura.
- `src/aplicacion/impedimentos.servicio.ts`, con los puertos `ProveedorAcceso` (Organización) y `ProveedorSeguimiento` (Certificaciones).
- `src/infraestructura/organizacion/organizacion.cliente.ts`: `acceso()`, `accesoHdu(id, {incluirCandidatos})`, `ambito()`, `ambitoDetalle()`, `consultarHdu(ids)` y `registrarExportacion()`.
- `src/infraestructura/certificaciones/certificaciones.cliente.ts`: `estados(ids)`.
- `src/infraestructura/prisma/` con los repositorios.
- `src/api/controladores/impedimentos.controller.ts` y `catalogos.controller.ts`, con sus DTO.

**Rutas:**
- `GET /v1/catalogos/tipos-impedimento`
- `GET|POST /v1/hdu/{hduId}/impedimentos`
- `GET /v1/hdu/{hduId}/impedimentos/responsables`
- `GET /v1/impedimentos` y `GET /v1/impedimentos/{id}`
- `POST /v1/impedimentos/{id}/{resolver, escalar, reabrir, seguimiento}`

**Reglas:**
- Orden de validación de D89.
- Registro y transición en una transacción, con `SELECT … FOR UPDATE` (D62).
- Candidatos desde `candidatosResponsable` (D63, D64).
- `certificacionId` desde `SeguimientoHdu.certificacionId`, o `null` si Certificaciones no responde. Nunca se crea un ciclo (D58).
- `permisos`, `esNuevo` y `operacionesPermitidas` en cada respuesta (D75).
- `GET /v1/impedimentos`: ámbito con una llamada a `ambito()`, filas con `consultarHdu`, riesgo con B3 y orden D74 con respaldo informado en `orden`.

**Pruebas:** E4-B01-T01 a T10 y E4-B02-T01 a T11 (T12 a T14 llegan con B8).

### B3 · Riesgo (E4-B03)

**Archivos:**
- `src/dominio/riesgo/calculo.ts`, una función pura que recibe impedimentos, `sprintFin`, avance, «hoy» y umbrales, y devuelve nivel, factores con `detalle` (D76), `factoresNoEvaluados` y `calculoParcial` (D90).
- `src/aplicacion/riesgo.servicio.ts`.
- `src/api/controladores/riesgo.controller.ts`.

**Rutas:** `GET|PUT /v1/hdu/{hduId}/riesgo` y `GET /v1/riesgo/hdu` (con `ambitoDetalle()` de Organización y `estados()` de Certificaciones en lotes de 1000).

**Reglas:**
- Analista → 403 (D73).
- `PUT` con `cambio: false` cuando nada cambia; la última fila se lee con `FOR UPDATE`.
- Filtro `nivel` con Certificaciones caída → 503.

**Pruebas:** E4-B03-T01 a T12. La unitaria de `calculo.ts` cubre los bordes: 70 % exacto, día de término = 0, sin sprint y fuente caída.

### B4 · Gestión y Auditor (E4-B04)

**Archivos:** `src/aplicacion/gestion.servicio.ts`, `src/api/controladores/gestion.controller.ts`, `src/api/controladores/auditor.controller.ts` y un generador CSV en `src/infraestructura/csv/` (UTF-8 con BOM, separador `;` y cabecera `X-Q360-Filas`, igual que Certificaciones).

**Rutas:**
- `GET /v1/hdu/{hduId}/gestion-impedimentos` (con el filtro `tipo`; el Analista recibe solo `IMPEDIMENTO`).
- `GET /v1/auditor/{impedimentos, gestion-impedimentos}` y sus 2 exportaciones. Exigen `rol: AUDITOR` y registran la exportación en Organización **antes** de entregar el archivo (D48, D70).

**Pruebas:** E4-B04-T01 a T11.

### B5 · Internos y carga semilla (D86, D88)

**Archivos:** `src/api/controladores/interno.controller.ts` y `carga-semilla.controller.ts`.

**Rutas:**
- `POST /v1/interno/impedimentos/evaluacion`: lote de hasta 1000 con los datos que envía Organización. Autoriza con `ambito()` y responde 403 completo si un id cae fuera.
- `GET /v1/interno/hdu/{hduId}/impedimentos/abiertos`: `{hduId, total, items ≤ 20}`.
- `POST /v1/interno/carga/impedimentos` y `POST /v1/interno/carga/riesgo`: con `credencialServicio` y `PERMITIR_CARGA_SEMILLA`.

**Regla:** el gateway no publica `/v1/interno/*`.

## q360-backend · Organización (`services/organizacion`)

### B6 · Internos para Impedimentos (D86)

**Archivos:** `api/controladores/acceso-interno.controller.ts`, `aplicacion/acceso.servicio.ts`, `carga-semilla.controller.ts` y `carga-semilla.servicio.ts`, y el repositorio de HDU.

**Cambios:**
- `GET /v1/interno/hdu/{id}/acceso?incluirCandidatos=true` agrega `candidatosResponsable {registro, escalamiento}`, solo con usuarios activos:
  - `registro`: el QE responsable y el QE supervisor vigente del analista, sin repetir.
  - `escalamiento`: Líderes con la célula vigente y Administradores activos.
- `HduParaCertificacion` suma `celulaId`, `sprintId` y `sprintFin` (sprint vigente de `historia_sprint`) en `acceso`, `consulta` y `hdu/responsable`.
- `GET /v1/interno/hdu/ambito/detalle` (nuevo): todo el ámbito, ordenado por código, con `incluirCerradas`.
- `PUT /v1/interno/carga/hdu/{id}/sprint` (nuevo, para la semilla).
- `RecursoExportacion` acepta `IMPEDIMENTOS` y `GESTION_IMPEDIMENTOS` en `POST /v1/interno/auditoria/exportaciones` (hoy se valida en el DTO; no hay enum en la base).

### B8 · Cierre bloqueado y bloques de bandeja (D60, D77, D87)

**Archivos:**
- `aplicacion/puertos/proveedor-impedimentos.ts` e `infraestructura/impedimentos/proveedor-impedimentos.http.ts`, con 2 s (`IMPEDIMENTOS_URL`, `IMPEDIMENTOS_TIMEOUT_MS`) y el token y `x-trace-id` propagados.
- `aplicacion/hdu.servicio.ts` (cambio de estado) y `errores-extendidos.ts`, con `ErrorHduBloqueada` y `ErrorImpedimentosNoVerificables`.
- `aplicacion/bandejas.servicio.ts` y `api/controladores/bandejas.controller.ts`, con el parámetro `soloBloqueadas` en las bandejas del Analista y del Líder.

**Cierre:** después de transición y checklist, consulta `GET /v1/interno/hdu/{hduId}/impedimentos/abiertos`:
- `total > 0` → 409 `HDU_BLOQUEADA` con la lista.
- Sin respuesta → 503 con `impedimentos.estado: indisponible`.
- La HDU no cambia.

**Bandejas:**
- Llaman a `POST /v1/interno/impedimentos/evaluacion` en lotes de 1000 con estado, `sprintFin` y avance (`seguimiento.porcentaje`, o `null`).
- Arman los contadores y listas de D87 y D79.
- `bloqueo` por fila (Analista y Líder), `riesgo` por fila (Líder) y `bloqueo` en las filas `CERRAR` del QE (D81).
- En el Administrador, Certificaciones se consulta solo para `hduRiesgoAlto`.
- Impedimentos caído → solo los bloques E4 `indisponible`.

**Pruebas que deben pasar:** E4-B02-T12 a T14, E4-B01-T04 (evaluación), el «contrato» de E7-B03 (exige el bloque `impedimentos`) y toda E7-B03.

## q360-backend · Certificaciones (`services/certificaciones`)

### B7 · Ciclo activo en el seguimiento (D86)

**Archivos:** `aplicacion/seguimiento.servicio.ts` (o el que arma `SeguimientoHdu`) y su repositorio.

**Cambio:** `SeguimientoHdu.certificacionId` es el ciclo activo, o `null`. Es el único cambio en Certificaciones; sin migración.

**Prueba:** el «contrato» de E7-B03 vuelve a pasar con B7 y B8.

## q360-seguridad-gateway · Gateway (`apps/gateway`)

### G1 · Rutas de E4 (D85)

**Archivos:**
- `src/api/impedimentos.controller.ts` (nuevo), registrado en `app.module.ts`.
- `src/configuracion.ts`, con `IMPEDIMENTOS_URL` obligatoria.
- `src/api/no-implementado.controller.ts`: se retira `impedimentos{/*ruta}`.
- `src/aplicacion/reenviador.ts`, que ya transmite `text/csv`.

**Rutas, declaradas una por una (sin comodín):**
- `GET /v1/catalogos/tipos-impedimento`
- `GET|POST /v1/hdu/:hduId/impedimentos`
- `GET /v1/hdu/:hduId/impedimentos/responsables`
- `GET|PUT /v1/hdu/:hduId/riesgo`
- `GET /v1/hdu/:hduId/gestion-impedimentos`
- `GET /v1/impedimentos` y `GET /v1/impedimentos/:id`
- `POST /v1/impedimentos/:id/(resolver|escalar|reabrir|seguimiento)`
- `GET /v1/riesgo/hdu`
- `GET /v1/auditor/(impedimentos|gestion-impedimentos)` y `GET /v1/auditor/exportaciones/(impedimentos|gestion-impedimentos)`

**Reglas:**
- `uuidDeRuta` valida los ids (400) antes de reenviar.
- Destino caído → 503.
- Las escrituras usan el límite de tasa estricto.
- `/v1/interno/*` sigue sin publicarse.

**Prueba:** las rutas de E4 no colisionan con `GET /v1/hdu/:id`, `/analista`, `/estado`, `/historial`, `/qe-responsable` ni con las de Certificaciones; `/v1/interno/impedimentos/evaluacion` responde 404 desde afuera.

## q360-integraciones · Semilla (`infrastructure/seed/e4/`)

### S1 · Fixture E4 (sección 7 del backlog E4, D88)

**Archivos:** `infrastructure/seed/e4/cargar.mjs` y su `README.md`, y el script `seed:e4` en el `package.json` raíz (lo agrega `q360-arquitecto` cuando exista el archivo).

**Carga, encima del fixture E7:**
- Sprints con fin relativo a hoy en `America/Santiago`, uno por célula cuando hace falta: SP-VENC (hoy − 3), SP-PROX (hoy + 2), SP-MED (hoy + 6) y SP-LEJ (hoy + 20).
- Cada HDU en su sprint, con `PUT /v1/interno/carga/hdu/{id}/sprint`.
- I1–I5 con sus acciones y fechas, con `POST /v1/interno/carga/impedimentos`.
- El riesgo de H6, con `POST /v1/interno/carga/riesgo`.

**Reglas:**
- No crea HDU, usuarios ni células, y no deja impedimentos abiertos en H8.
- Verifica los valores derivados de la sección 7 al terminar: bloqueos, sugeridos y contadores por usuario.
- Reinicio: el arnés de `q360-qa` vacía `impedimentos.*` con el dueño de la base y vuelve a cargar, porque `svc_impedimentos` no puede borrar.

## q360-frontend · Portal (`apps/web`)

Cada paso trabaja primero con MSW y después contra el stack real. Los testids y textos certificados no cambian; los nuevos son los de la sección 11 del diseño.

### F1 · Base

**Archivos:**
- `src/types/dominio.ts`: alias de `TipoImpedimento`, `EstadoImpedimento`, `NivelRiesgo`, etc., con sus etiquetas (las `x-etiquetas` del contrato).
- `src/api/impedimentos.ts` y `src/api/riesgo.ts` (nuevos).
- `src/components/Layout.tsx`: menú del QE con «Impedimentos» sin `end`.
- `src/routes/router.tsx`: `/qe/impedimentos`, `/qe/impedimentos/riesgo` y `/auditor/impedimentos`, con acceso denegado para los demás roles (D41).
- Componentes nuevos: `SemaforoRiesgo` (3 variantes), `InsigniaEstadoImpedimento`, `InsigniaBloqueo`, `TarjetaImpedimento`, `FormImpedimento` y los diálogos (sobre `DialogoConfirmacion`); `PestanasAuditor` se generaliza a `PestanasNav`.
- `src/styles/tokens.css` y `bandejas.css`: tokens del semáforo (sección 10.2 del diseño).
- `src/mocks/handlersE7.ts` y `dataE7.ts` (o un `handlersE4.ts` nuevo), con el bloque `impedimentos` en las 5 bandejas y los endpoints de E4 con el fixture de la sección 7.
- Unitaria del menú del QE: actualiza el arreglo de 5 opciones (sección 6 del backlog E4).

### F2 · Detalle de HDU: impedimentos y cierre (E4-F01, E4-F03)

**Archivos:** `src/pages/hdu/HduDetailPage.tsx` y componentes nuevos en `src/components/impedimentos/`.

**Comportamiento:**
- Aviso `hdu-bloqueada`, sección `seccion-impedimentos` y panel `#riesgo`, después del checklist y antes de «Cambiar estado» (4.1 del diseño).
- Botones según `permisos` y `operacionesPermitidas` (D75); el parámetro `?impedimento=` lleva a la tarjeta (D78).
- Errores 409 `HDU_BLOQUEADA` (con `total` para «y N más», D77) y 503 con `impedimentos` en `manejarCambioEstado`, sin tocar los mensajes certificados.
- Estados de la sección cargando, vacío, error e indisponible, sin afectar el resto del detalle.

### F3 · Pantallas del QE (E4-F02, E4-F04#3)

**Archivos:** `src/pages/qe/QeImpedimentosPage.tsx` y `QeRiesgoPage.tsx` (nuevas).

**Comportamiento:**
- Filtros en la URL (`?celula=` → `celulaId`, D49 y D92).
- Contadores de `PaginaImpedimentos.contadores`.
- «Solo lectura» por `soloLectura`.
- Aviso de orden de respaldo cuando `orden` no es el pedido.
- Vacío del equipo distinto del vacío de filtros.

### F4 · Panel «Riesgo» (E4-F04)

**Archivos:** `src/components/impedimentos/PanelRiesgo.tsx` y `DialogoFijarRiesgo.tsx`.

**Comportamiento:**
- Frases de los factores armadas con `detalle` (D76).
- Avisos `aviso-sugerencia-distinta` y `aviso-calculo-parcial`.
- Historial con `gestion-impedimentos?tipo=RIESGO` (D82).
- El panel no se renderiza para el Analista: no hay ninguna llamada, `permisos.puedeVerRiesgo` es falso.

### F5 · Bandejas y Auditor (E4-F01#3, E4-F03#2, E4-B04)

**Archivos:**
- `src/pages/qa/QaInicioPage.tsx`, `qe/QeInicioPage.tsx`, `lider/LiderBandejaPage.tsx`, `admin/AdminInicioPage.tsx` y `auditor/AuditorBandejaPage.tsx`.
- `src/pages/auditor/AuditorPestanasPage.tsx`, con la quinta pestaña.
- `src/components/bandeja/columnasHdu.tsx` (columnas «Bloqueo» y «Riesgo» al final).

**Comportamiento:**
- Bloques debajo de lo certificado (sección 7 del diseño).
- La insignia de la fila «Cerrar HDU» va fuera del botón y después del texto (D81).
- Ningún `button[type=submit]` en el Auditor.

## Despliegue (D91)

Impedimentos pasa a ser el cuarto servicio en la nube. Sin él, ninguna HDU se puede cerrar (503, D60) y los bloques E4 de las bandejas quedan «No disponible».

**`q360-backend` (en `services/impedimentos`):**
- `vercel.json` igual al de Certificaciones, con build de `packages/auth-nest` y `services/impedimentos`, región `gru1`, rewrite a `/api/index`, e `includeFiles` de `dist/**` y `generated/**`.
- `api/index.mjs` y `public/` (copiados de Certificaciones). El `schema.prisma` no necesita `binaryTargets`, igual que en los otros servicios.

**El usuario, en Vercel** (los secretos no pasan por el chat):
1. Crear el proyecto `quality360-impedimentos` en el equipo MatmatDev, con raíz `services/impedimentos`, conectado a `MatMateDev/Quality360`, rama `main`.
2. Variables del proyecto `quality360-impedimentos`:
   - `DATABASE_URL`: pooler de Supabase con el rol `svc_impedimentos` y `?schema=impedimentos&pgbouncer=true`.
   - `SUPABASE_URL` y las variables del verificador JWT, iguales a las de Certificaciones.
   - `ORGANIZACION_URL=https://quality360-organizacion.vercel.app` y `CERTIFICACIONES_URL=https://quality360-certificaciones.vercel.app`.
   - `ORGANIZACION_TIMEOUT_MS` y `CERTIFICACIONES_TIMEOUT_MS`, solo si se cambian los valores por defecto.
   - `RIESGO_*`, solo si se cambian los valores por defecto. `NODE_ENV=production`, para ignorar `Q360_FECHA_REFERENCIA`.
   - `PERMITIR_CARGA_SEMILLA` y el secreto de servicio, solo mientras se carga la semilla, como en Organización.
3. Proyecto `quality360-gateway`: `IMPEDIMENTOS_URL=https://quality360-impedimentos.vercel.app`.
4. Proyecto `quality360-organizacion`: `IMPEDIMENTOS_URL` (la misma URL) e `IMPEDIMENTOS_TIMEOUT_MS` (opcional, 2000).
5. Redesplegar el gateway y Organización después de agregar las variables.

**Base de datos en la nube (al cerrar la corrida, D13):**
1. Si Supabase está pausado, reactivarlo y esperar `ACTIVE_HEALTHY`.
2. Aplicar la migración con `apply_migration`, con el nombre `q360_impedimentos_20261026000000_e4_impedimentos_riesgo` y `set local search_path to impedimentos;`.
3. Aplicar después `infrastructure/nube/004_rls_impedimentos_nube.sql`, actualizado por `q360-infra` con `riesgo_hdu` y los `REVOKE`.
4. Publicar el código justo después: el código anterior no funciona con las columnas nuevas.

**`q360-infra` (local):**
- `infrastructure/docker-compose.yml`: `IMPEDIMENTOS_URL` en `organizacion`; `CERTIFICACIONES_URL` y `RIESGO_*` en `impedimentos`.
- `infrastructure/local/preparar-entorno.mjs`: `IMPEDIMENTOS_URL` en los `.env` del gateway y de Organización, y `CERTIFICACIONES_URL` en el de Impedimentos.

**Comprobar el despliegue sin contraseñas:**
- `GET https://quality360-impedimentos.vercel.app/health` → 200.
- `GET https://quality360-gateway.vercel.app/v1/catalogos/tipos-impedimento` sin token → 401 `NO_AUTENTICADO` (hoy responde 501).
- `GET https://quality360-gateway.vercel.app/v1/interno/impedimentos/evaluacion` → 404.

## q360-qa · Certificación

- Agrega `impedimentos.v1.yaml` a `tests/support/contrato.ts`.
- Escribe las pruebas con el ID del escenario en el nombre (`[E4-F03#2] T03: …`). Antes de cada archivo recarga la semilla E4 (S1).
- Regresión de la sección 6 del backlog E4: E2-B02 (cierre), E2-F04, E3-F01, toda E7 (incluido el «contrato» de E7-B03, E7-F03-T01 con D81 y E7-B04-T09 con D80) y el arreglo nuevo del menú en E1-F02#3.
- axe según D84.
- Dictamen por HDU en `docs/validacion/certificacion-e4.md`, en local y en la nube.
