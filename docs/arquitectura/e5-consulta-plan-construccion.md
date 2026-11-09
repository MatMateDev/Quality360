# E5 · Consulta de Jira y asignación · Plan de construcción

Fecha: 2026-11-02. Rama: `feature/e1-e2-quality360`. Complementa `e5-plan-construccion.md`, que sigue vigente en todo lo que este plan no cambia.

**Insumos**
- Backlog: `docs/backlog/e5-consulta-asignacion.md`, con 56 escenarios en E5 (32 nuevos o reescritos) y 171 casos. Decisiones D132–D144.
- Diseño: `docs/diseno/e5-consulta-asignacion.md` (§11 cambios en pantallas certificadas, §13 `data-testid` y fixture, §14 brechas).
- Decisiones del arquitecto: D145–D152, al final de `docs/arquitectura/decisiones-mvp.md`, y el ADR 0016.

**Contratos (contract-first).** `npm run contracts:lint` pasa sin advertencias y `npm run contracts:check` cubre 242/242 escenarios (E5: 56). Los cambios:

| Archivo | Cambio |
| --- | --- |
| `integraciones.v1.yaml` | Se retira `POST /v1/integraciones/jira/sincronizaciones` (404). Se agregan 7 rutas con 8 operaciones: `POST /jira/consultas`, `GET /jira/consultas/actual`, `GET /jira/consultas/{id}`, `POST …/{id}/continuaciones`, `GET` y `PATCH …/{id}/items`, `POST …/{id}/confirmaciones` y `POST …/{id}/descartes`. `GET /ejecuciones` suma el filtro `fase`. `EstadoIntegracion.continuar` queda en desuso (D150) |
| `comun.v1.yaml` | 13 códigos nuevos en `CodigoError` (con `CONSULTA_COMPLETA`, D148); `TOPE_DE_CONSULTA`; los motivos `HDU_CREADA_DESPUES` y `ASIGNACION_INVALIDA`; los enums `FaseEjecucion`, `EstadoConsulta`, `GrupoConsulta` y `OrigenSprintPropuesto`. `Ejecucion` suma `fase`, `consultaId`, `nuevas`, `cambiaron` y `sinCambios`; `EjecucionEnCurso` suma `fase` y `FilaEjecucion` suma `asignacion`. Esquemas nuevos de la consulta, de los errores y de los internos. El upsert suma el modo confirmación. Se elimina `SolicitudSincronizacion` |
| `organizacion.v1.yaml` | Dos internos nuevos: `POST /v1/interno/integraciones/hdu/estado-codigos` y `POST /v1/interno/integraciones/asignaciones/validar`. La descripción del upsert suma el modo confirmación. `GET /v1/catalogos/personas` suma `supervisorId` (D147) |
| `gateway.v1.yaml` | Reenvía las 8 operaciones nuevas y quita la de sincronización |

**Tipos.** Después de `npm run contracts:types`, el portal deja de compilar mientras siga usando `SolicitudSincronizacion` o la ruta retirada. Es esperado, y lo corrige F1 de `q360-frontend`.

Nadie cambia un contrato sin pasar por `q360-arquitecto`.

## Modelo de datos

### Integraciones · migración `services/integraciones/prisma/migrations/20261102000000_e5_consulta_asignacion/migration.sql` (q360-backend)

Va en el esquema `integraciones`, sin llaves foráneas hacia otro esquema (D24). `id_historia`, `celula_id`, `qe_id`, `analista_id` y `sprint_id` son UUID sin FK. Las llaves foráneas internas (`consulta_item → consulta_jira` y `ejecucion_integracion.consulta_id → consulta_jira`) sí están permitidas.

**`consulta_jira`**

| Columna | Tipo | Nota |
| --- | --- | --- |
| `id_consulta` | `uuid` PK, `gen_random_uuid()` | |
| `estado` | `varchar(12)` NOT NULL | CHECK `ABIERTA`, `CONFIRMADA`, `REEMPLAZADA`, `VENCIDA`, `DESCARTADA` |
| `version` | `integer` NOT NULL DEFAULT 1 | CHECK `>= 1`. Sube con cada cambio de filas o de estado |
| `creada_por_id`, `creada_por_nombre` | `uuid`, `varchar(150)` NOT NULL | |
| `creada_en` | `timestamptz` NOT NULL DEFAULT now() | |
| `vence_en` | `timestamptz` NOT NULL | Hora de la última llamada a Jira + `INTEGRACIONES_CONSULTA_VIGENCIA_MS` |
| `cerrada_en`, `cerrada_por_id`, `cerrada_por_nombre` | NULL | CHECK `(estado = 'ABIERTA') = (cerrada_en IS NULL)` |
| `proyecto_clave` | `varchar(10)` NOT NULL | Mismo CHECK de formato que la configuración |
| `sitio_host` | `varchar(100)` NOT NULL | Sirve para armar `urlExterna` sin leer la configuración |
| `hay_mas` | `boolean` NOT NULL DEFAULT false | |
| `continuar_desde` | `varchar(40)` NULL | |
| `sugerencia_celula_id`, `sugerencia_qe_id`, `sprint_respaldo_id` | `uuid` NULL | Instantánea del destino (D146) |
| `total_filas`, `nuevas`, `cambiaron`, `sin_cambios`, `con_error`, `con_advertencias`, `descartadas` | `integer` NOT NULL DEFAULT 0 | Quedan al purgar. CHECK `>= 0`, `total_filas <= 500` y `nuevas + cambiaron + sin_cambios + con_error = total_filas` |

- Índice único parcial `consulta_abierta_key ON consulta_jira ((true)) WHERE estado = 'ABIERTA'`, que es el 23505 de E5-B05-T35.
- Índice `(creada_en DESC)`, para `ultimaCerrada`.
- Disparador `consulta_cerrada_inmutable`: `BEFORE UPDATE`. Si `OLD.estado <> 'ABIERTA'`, rechaza con 23001. Tampoco cambian `id_consulta`, `creada_por_*` ni `creada_en`. La transición `ABIERTA` → otro estado sí está permitida.

**`consulta_item`**

| Columna | Tipo | Nota |
| --- | --- | --- |
| `id_item` | `uuid` PK | |
| `id_consulta` | `uuid` NOT NULL | FK → `consulta_jira`, `ON DELETE RESTRICT` |
| `posicion` | `integer` NOT NULL | CHECK `>= 1` |
| `grupo` | `varchar(11)` NOT NULL | CHECK `NUEVA`, `CAMBIO`, `SIN_CAMBIOS`, `CON_ERROR` |
| `codigo` | `varchar(60)` NULL | `codigo_normalizado` = `upper(codigo)`, columna generada |
| `titulo`, `descripcion` | `varchar(200)` NULL, `varchar(1000)` NULL | Textos de Jira (D133) |
| `prioridad` | `varchar(7)` NULL | CHECK `BAJA`, `MEDIA`, `ALTA`, `CRITICA` |
| `sprint_jira` | `varchar(120)` NULL | |
| `referencia`, `advertencias` | `jsonb` NULL | `advertencias`: CHECK `jsonb_typeof = 'array'` |
| `motivo` | `varchar(40)` NULL | CHECK: no es nulo solo en `SIN_CAMBIOS` y `CON_ERROR` |
| `id_historia`, `origen_hdu`, `estado_hdu`, `qe_hdu_nombre` | NULL | Solo en `CAMBIO` y `SIN_CAMBIOS` |
| `cambios` | `jsonb` NULL | Solo en `CAMBIO` (CHECK). Hasta 1.000 caracteres por valor |
| `celula_id`, `qe_id`, `analista_id`, `sprint_id` | `uuid` NULL | Solo en `NUEVA` (CHECK) |
| `celula_nombre`, `qe_nombre`, `analista_nombre`, `sprint_nombre` | `varchar` NULL | Nombres de Organización tomados al asignar (D148) |
| `sprint_origen` | `varchar(8)` NULL | CHECK `JIRA`, `RESPALDO`, `MANUAL` |
| `aviso_sin_lider` | `boolean` NOT NULL DEFAULT false | |
| `marcada`, `aplicada` | `boolean` NOT NULL DEFAULT false | |
| `asignado_por_id`, `asignado_por_nombre`, `asignado_en` | NULL | |

- `UNIQUE (id_consulta, codigo_normalizado)`: la primera lectura gana (D135).
- `UNIQUE (id_consulta, posicion)`.
- Índice `(id_consulta, grupo, posicion)`.
- CHECK `marcada_valida`: `NOT marcada OR grupo = 'CAMBIO' OR (grupo = 'NUEVA' AND celula_id, qe_id, analista_id y sprint_id NOT NULL)`.
- CHECK `aplicada_marcada`: `NOT aplicada OR marcada`.
- Disparador `item_solo_consulta_abierta`: `BEFORE INSERT OR UPDATE`. Si la consulta no está `ABIERTA`, rechaza con 23001. `DELETE` no pasa por el disparador: es la purga (D133).

**`ejecucion_integracion`**
- Columnas nuevas:
  - `fase varchar(12) NOT NULL DEFAULT 'DIRECTA'`, con CHECK de los 3 valores.
  - `consulta_id uuid NULL`, con FK interna.
  - `nuevas`, `cambiaron` y `sin_cambios`, `integer NOT NULL DEFAULT 0`.
- CHECK nuevos:
  - `fase = 'DIRECTA' OR origen = 'JIRA'`.
  - `fase <> 'DIRECTA' OR consulta_id IS NULL`.
  - `fase <> 'CONFIRMACION' OR consulta_id IS NOT NULL`.
- Se reemplaza `ejecucion_contadores_ck` por el invariante por fase de D141:
  - `CONSULTA`: `nuevas + cambiaron + sin_cambios + con_error = leidas`, con `creadas = actualizadas = omitidas = 0`.
  - Las demás fases: el invariante de siempre, con `nuevas = cambiaron = sin_cambios = 0`.
  - Las filas existentes cumplen porque quedan con `DEFAULT 'DIRECTA'` y ceros.
- Índice `(fase, iniciada_en DESC)`.
- El disparador `ejecucion_cerrada_inmutable` suma `fase` y `consulta_id` a la identidad que no puede cambiar.

**`detalle_ejecucion`:** suma `asignacion jsonb NULL`, con CHECK `asignacion IS NULL OR jsonb_typeof(asignacion) = 'object'`.

**Permisos** (al final de la migración, como E5):
- `REVOKE DELETE, TRUNCATE ON consulta_jira FROM svc_integraciones`.
- `REVOKE TRUNCATE ON consulta_item FROM svc_integraciones`. El `DELETE` en `consulta_item` **se conserva**: es la purga.

**Prisma:** `ConsultaJira` y `ConsultaItem` en `schema.prisma`, con el comentario «lo que Prisma no expresa» igual que en E5. `modelo-datos-estructura` debe seguir pasando.

### Nube · `infrastructure/nube/006_rls_consulta_asignacion_nube.sql` (q360-backend)

- Se aplica después de la migración, con `set local search_path to integraciones;`, y es idempotente.
- Activa RLS en `consulta_jira` y `consulta_item`, con la política `servicio_integraciones` solo para `svc_integraciones`, como hace 005. `anon`, `authenticated` y `service_role` quedan sin permisos.
- Repite los `REVOKE` de la migración, porque en la nube los privilegios por defecto los vuelven a otorgar.
- Comprobación: el rol anónimo no lee ninguna de las dos tablas (E5-B05-T35).

### Organización

Sin migración (D151): `hdu_historial_asignacion.analista_anterior_id` ya admite nulo y la auditoría guarda la asignación en su JSON. Si `q360-backend` encuentra un CHECK o un índice que lo impida, lo reporta antes de crear una migración.

### Variables nuevas (Integraciones), ninguna impide el arranque

| Variable | Defecto | Nota |
| --- | --- | --- |
| `INTEGRACIONES_CONSULTA_VIGENCIA_MS` | 86400000 | En la instancia I6 vale 2000 |
| `INTEGRACIONES_CONSULTA_TOPE_ITEMS` | 500 | D135 |

Gateway: `LIMITE_TASA_CONSULTA_MAX`, 120 por defecto (D152).

## Orden y dependencias

| Ola | Agente | Tarea | Depende de |
| --- | --- | --- | --- |
| 1 | backend | IC1 · migración, Prisma y `006` | — |
| 1 | backend | OC1 · internos de Organización y catálogo `supervisorId` | — |
| 1 | gateway | GC1 · rutas, `PATCH`, 410 y cubo de tasa | — |
| 1 | frontend | FC1 · tipos, API, mocks y textos | contratos |
| 1 | integraciones | JC1 · revisión del mapeo, semilla y datos borde | — |
| 1 | qa | QC1 · Jira simulado (`ENORME`, QTY-13/14/15) y arnés (ADM2, QE5) | — |
| 2 | backend | IC2 · dominio de la consulta (puro) | IC1 |
| 2 | backend | OC2 · upsert en modo confirmación | OC1 |
| 3 | backend | IC3 · consultar y continuar (E5-B02, B05#1–3, #10) | IC2, OC1 |
| 3 | frontend | FC2 · panel «Consultar Jira» (E5-F02) | FC1, IC3 real |
| 4 | backend | IC4 · editar filas (E5-B05#4, #5, #12) | IC3 |
| 4 | backend | IC5 · confirmar y descartar (E5-B05#6–#11, #14) | IC4, OC2 |
| 4 | frontend | FC3 · revisión y asignación (E5-F05#1–4, #7) | IC4 real |
| 5 | backend | IC6 · historial por fase (E5-B04#4) | IC5 |
| 5 | frontend | FC4 · confirmar, vida y conflictos (E5-F05#5, #6, #8–#13); FC5 · historial y textos (E5-F04#4, §11) | IC5, IC6 |
| 6 | infra | LC1 · instancia I6 y variables en `npm run local` | IC1 |
| 7 | qa | Casos, regresión y certificación (`docs/validacion/certificacion-e5-consulta.md`) | todo |

## q360-backend · Integraciones (`services/integraciones`)

Estructura: `api` → `aplicacion` → `dominio`, con la infraestructura detrás de puertos. El dominio no importa Prisma, Nest ni `fetch`, y el servicio no importa código de otro servicio.

### IC1 · Modelo de datos

- **Archivos:** `prisma/schema.prisma`, la migración `20261102000000_e5_consulta_asignacion`, `infrastructure/nube/006_rls_consulta_asignacion_nube.sql` y `src/configuracion.ts` (las 2 variables).
- **Terminado:** E5-B05-T35 y E5-B04-T16 (el `UPDATE` de una ejecución cerrada) pasan contra Supabase local. La migración aplica sobre una base con datos de E5 certificada sin violar los CHECK nuevos.

### IC2 · Dominio (`src/dominio/consulta/`)

- **Archivos:**
  - `clasificacion.ts`: D136, con la regla de D98; una prioridad ausente o desconocida no cuenta.
  - `asignacion.ts`:
    - combinación final;
    - cambiar el QE limpia el analista;
    - cambiar la célula recalcula el sprint;
    - completitud y `faltantes`;
    - qué se puede marcar y asignar, incluida una fila `aplicada`.
  - `vida.ts`: estados, vencimiento perezoso, reemplazo y tope de 500.
  - `confirmacion.ts`: el plan de lotes de 25 y la traducción de los resultados a `CREADA`, `ACTUALIZADA`, `OMITIDA` y `ERROR`.
- Todo es puro.
- **Terminado:** pruebas unitarias de cada regla de D136–D140 y D145 (incluidos `marcarListas` y la regla «una fila → 422»).

### IC3 · Consultar y continuar

- **Archivos:**
  - `api/controladores/consulta.controller.ts`.
  - `aplicacion/consulta.servicio.ts`: reutiliza la lectura por páginas de `sincronizacion.servicio.ts`, que **se elimina** junto con `sincronizacion.controller.ts`.
  - `infraestructura/prisma/consulta.prisma.repositorio.ts`.
  - `infraestructura/organizacion/organizacion.cliente.ts`, con `estadoCodigos` en lotes de 100.
- **Orden de una tanda:**
  1. Se verifica que no haya otra ejecución en curso (`INTEGRACION_EN_CURSO`).
  2. Se lee Jira.
  3. Se mapea.
  4. Se clasifica.
  5. En **una** transacción: se reemplaza la consulta anterior (con purga), se crea o acumula la consulta y sus filas, y se cierra la ejecución.
- Si Jira u Organización fallan antes del paso 5, la consulta anterior queda intacta.
- `venceEn` se renueva en cada tanda.
- **Terminado:** E5-B02-T01 a T14, E5-B05-T01, T02 a T05, T22, T23, T29 y T34.

### IC4 · Editar filas

- **Archivos:** `aplicacion/edicion-consulta.servicio.ts`, `api/validacion/consulta.ts` (cuerpo estricto, `oneOf` del alcance, 400 por campos desconocidos) y el cliente `validarAsignaciones`.
- **Reglas:**
  - Las combinaciones se **deduplican** antes de llamar a Organización: con 230 filas y una sola combinación, se hace una llamada por cada nombre distinto de sprint de Jira, en lotes de 100.
  - La actualización de las filas y el `version = version + 1` van en la misma transacción, con `WHERE estado = 'ABIERTA' AND vence_en > now()`.
  - Si no cambió nada, no se sube la versión.
- **Terminado:** E5-B05-T06 a T12, T27, T28 (el `PATCH` de las 230 filas) y T32. Además, una prueba de que un `PATCH` de 230 filas termina en menos de 3 s contra Supabase local.

### IC5 · Confirmar y descartar

- **Archivos:** `aplicacion/confirmacion.servicio.ts` y `descarte`, dentro de `consulta.servicio.ts`.
- **Orden:** el de `confirmarConsulta` en el contrato:
  1. Se bloquea la fila de la consulta (`SELECT … FOR UPDATE`) y se compara la `version`.
  2. Pre-validación.
  3. Se inserta la ejecución `CONFIRMACION`.
  4. Lotes de 25 al upsert. Por lote, se marcan las filas `aplicada` y se insertan las filas de detalle.
  5. Al terminar, `CONFIRMADA`, purga y `descartadas`.
- El presupuesto se controla con `restanteMs()` antes de cada lote (D114).
- **Terminado:** E5-B05-T13 a T21, T24 a T26, T28, T30 y T33, más E5-B05-T06 con Jira caído (`/__solicitudes` sin cambios).

### IC6 · Historial

- **Cambios:** el filtro `fase`, los contadores nuevos, `asignacion` en el detalle, el estado sin `continuar` y las sugerencias sin `CONTINUAR` para la fase `DIRECTA` (D150).
- **Terminado:** E5-B04-T16 y T17, y E5-B04-T01 a T15 sin cambios.

## q360-backend · Organización (`services/organizacion`)

### OC1 · Lecturas internas y catálogo

- **Archivos:** `api/validacion/integraciones.ts`, `aplicacion/integraciones.servicio.ts` y el controlador interno de integraciones.
  - `hdu/estado-codigos`: una consulta `WHERE codigo_normalizado = ANY(...)`.
  - `asignaciones/validar`: reutiliza la **misma** función de dominio que valida «analista del equipo del QE» en E2-B02 y «QE activo» en D54 (sin duplicar reglas), más la propuesta de sprint y `celulaSinLiderActivo`.
  - `catalogos/personas?supervisorId=`.
- **Terminado:**
  - Pruebas de integración de las 4 reglas de D138 y de la propuesta de sprint (`JIRA`, `RESPALDO`, ninguna), con los datos de E5-B05-T08 y T09.
  - 403 con la credencial de servicio.
  - 400 con 101 elementos.

### OC2 · Upsert en modo confirmación

- **Cambios:** la rama `consultaId` del algoritmo, tal como la describe el contrato.
- **`CREAR`:**
  - Usa el caso de uso de `POST /v1/hdu`, ampliado con el analista inicial y la entrada de `hdu_historial_asignacion`.
  - `HDU_CREADA_DESPUES` cubre tanto la búsqueda previa como la violación de unicidad al insertar, que se captura por fila.
- **`ACTUALIZAR`:** vincula siempre.
- **Terminado:**
  - E5-B05-T13 (historial inicial con el motivo fijo; `CREAR_HDU` con `consultaId`), T14, T15, T16, T19, T20 y T21.
  - E5-B03-T05 a T13 sin cambios (modo archivo).

## q360-seguridad-gateway (`apps/gateway`)

### GC1 · Rutas, 410 y cubo de tasa

- **Rutas** (`src/api/integraciones.controller.ts`):
  - Se quita `jira/sincronizaciones`, que queda en 404 como cualquier ruta inexistente.
  - Se agregan las 8 operaciones, incluido `PATCH`.
  - Se propagan tal cual 410, 409, 422 y sus cuerpos extendidos.
- **Límite de tasa** (`src/middlewares/limite-tasa.ts` y `configuracion.ts`): `LIMITE_TASA_CONSULTA_MAX` (120) para `PATCH /v1/integraciones/jira/consultas/:id/items`. Esa ruta no consume el cubo de escritura general (D152). Si el valor es inválido, se usa el de por defecto sin tumbar el arranque.
- **Pruebas:** `pruebas/e5-integraciones.test.ts`.
  - La lista pasa de 10 a 16 rutas (18 operaciones).
  - `sincronizaciones` da 404.
  - El `PATCH` se reenvía.
  - 31 `PATCH` seguidos no dan 429.
  - `/v1/interno/integraciones/{hdu/estado-codigos, asignaciones/validar}` desde afuera dan 404.
- **Documentación:** `.env.example`, `README.md` y `GUIA-VERCEL.md` (la variable nueva es opcional).

## q360-frontend (`apps/web`)

Toda la pantalla sigue `docs/diseno/e5-consulta-asignacion.md`: los identificadores del §13 y los cambios de pantallas certificadas del §11.

- **FC1 · Base.**
  - `src/api/integraciones.ts`: se quita `sincronizar` y se agregan las 8 llamadas. `SIN_RESPUESTA` (D115) también aplica a consultar y confirmar: tras un error de red, el portal consulta `GET estado` y `GET consultas/actual`.
  - Tipos regenerados.
  - `lib/mensajesConsulta`, con plurales construidos por función.
  - Mocks MSW de la consulta en `handlersE5`.
- **FC2 · Panel «Consultar Jira».**
  - `PaginaSincronizar.tsx` se reescribe, conservando la ruta y `pestana-sincronizar`.
  - Los `res-*` muestran los **acumulados** de `consulta` y «Esta tanda: N» sale de `ejecucion` (D149).
  - `dialogo-reemplazar` usa los datos de `ErrorConsultaAbierta`.
- **FC3 · Revisión y asignación.**
  - Grupos con filtro y paginación en el servidor.
  - `casilla-seleccionar` es estado local y `casilla-marcar` es del servidor (D145).
  - El panel de grupo envía `itemIds`, o `{grupo, todas: true, q}` si se eligió «Seleccionar las N del grupo», incluso con filtro, porque el contrato lo admite.
  - `marcarListas` se envía según `casilla-incluir-al-aplicar`.
  - Selectores con la regla de §4.4. El analista sale de `GET /v1/catalogos/personas?supervisorId=` (D147), en memoria por QE.
  - Guardado por cambio, con «Reintentar» si hay 429 o 503.
  - El 422 de una sola fila se muestra en el selector.
- **FC4 · Confirmar, vida y conflictos.**
  - Antes del diálogo de confirmación se hace `GET consultas/{id}` y se compara `version` (D148).
  - Con 409 `CONSULTA_MODIFICADA`, se recarga y se muestra `aviso-consulta-modificada`.
  - Se muestran `alerta-asignaciones-invalidas`, `boton-continuar-confirmacion` (si `pendientes > 0`), los avisos de consulta vencida o reemplazada (con `ultimaCerrada`) y el diálogo de descarte.
- **FC5 · Historial y textos.**
  - Columna y filtro `fase`.
  - `contadores-consulta-<id>`.
  - Columna «Asignación» en el detalle.
  - Desaparece «Ir a Sincronizar para continuar» en la fase `DIRECTA` (D150).
  - Textos nuevos de Conexión (D143) y de la nota del QE (§11).
- **Accesibilidad:** axe a 1280 y 375 px sobre la consulta con datos, vacía, vencida e indisponible, sin violaciones `serious` ni `critical`.
- **Pruebas unitarias:**
  - Reglas de los selectores.
  - Plurales.
  - Que QE y Auditor no tengan `grupo-nuevas` ni botones de escritura.
  - `src/test/e5Sincronizar.test.tsx` se reemplaza por `e5Consulta.test.tsx`.
- **Terminado:** E5-F02-T01 a T13, E5-F05-T01 a T28 y E5-F04-T12 y T13 contra el stack real.

## q360-integraciones (frontera Jira, mapeo y semilla)

- **JC1.**
  - **Cliente y puerto `FuenteJira`:** sin cambios.
  - **Mapeo:**
    - Confirmar que `mapearIssue` ya no agrega `SPRINT_NO_ENCONTRADO`, que se calcula al asignar.
    - Confirmar que devuelve el nombre del sprint de Jira (5.1) y la descripción completa hasta 1.000 caracteres.
    - Agregar pruebas unitarias con los datos borde del diseño §13: título de 200 caracteres **sin espacios**, descripción de 1.000 y sprint de Jira de 80 caracteres sin espacios.
  - **`seed:e5`:** suma «E5 Sprint A1» en CEL-A, de forma idempotente y sin crear HDU (`hdu-total` sigue en 8).
- **Terminado:** las pruebas unitarias del mapeo pasan y `npm run seed:e5` es idempotente dos veces seguidas.

## q360-infra

- **LC1.**
  - `npm run local` pasa `INTEGRACIONES_CONSULTA_VIGENCIA_MS` y `INTEGRACIONES_CONSULTA_TOPE_ITEMS` sin valor fijo.
  - Se documenta la instancia **I6** (vigencia 2000 ms) junto a I2–I5.
  - El gateway local pasa `LIMITE_TASA_CONSULTA_MAX`.
- Sin otros cambios de entorno.

## q360-qa (datos y certificación)

- **Jira simulado:**
  - Proyecto `ENORME` (520 issues).
  - QTY-13 (ADF) y QTY-14 por `PUT /__issues/`.
  - **QTY-15, datos borde del diseño §13:** título de 200 caracteres sin espacios, descripción de 1.000 y sprint «<80 caracteres sin espacios>».
- **Arnés:**
  - Crea por la API a ADM2, QE5 y una **célula con nombre de 60 caracteres**, que se borra al terminar. No va en la semilla para no alterar los pendientes de E7-F05, que cuentan las células sin Líder.
  - La limpieza vacía `integraciones.consulta_item` y `consulta_jira`, como dueño de la base y en ese orden.
- **Casos:** los 171 del backlog.

### Pruebas certificadas que se rehacen o se ajustan

| Prueba | Qué pasa |
| --- | --- |
| `tests/api/e5-b02-sincronizacion.spec.ts` y `tests/e2e/e5-f02-sincronizar.spec.ts` | Se **sustituyen** por los casos nuevos de E5-B02 (T01–T14) y E5-F02 (T01–T13). Se conservan los datos, las instancias y los modos del falso |
| `services/integraciones/test/integracion/e5-b02-sincronizacion.test.ts` | Se reemplaza por pruebas de consulta (backend) |
| `tests/api/e5-b04-registro.spec.ts`, `e5-b01-configuracion.test.ts` y `e5-b04-historial.test.ts` | Usan la sincronización para generar ejecuciones: pasan a `consultas` + `confirmaciones`. Los casos certificados no cambian de intención |
| `tests/api/e5-gateway.spec.ts`, `apps/gateway/pruebas/e5-integraciones.test.ts` | Pasan de 10 a 16 rutas (18 operaciones); `sincronizaciones` da 404 |
| `tests/support/e5.ts` y `contrato.ts` | Ayudas de consulta. El esquema estricto acepta los campos nuevos de `Ejecucion` y `FilaEjecucion` |
| `apps/web/src/test/e5Sincronizar.test.tsx` | Lo reemplaza `e5Consulta.test.tsx` |
| E5-F01 que lean los textos del destino | Textos nuevos (D143). `q360-qa` confirma con una búsqueda que ningún caso afirma «Las HDU llegan sin analista…» |
| E5-F04 | Una columna más («Fase») |
| E5-F04-T13, en `nota-integraciones-qe` | Texto nuevo (§11) |
| E5-MAN-01 | Los pasos 2 y 3 pasan a «Consulta» y «Confirma» |
| Regresión | E1–E4 y E7 completas después de la limpieza, en especial E2-F02, E2-B04, E7-F02, F03 y F05 (`hdu-total 8`) |

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| **Función gratuita de Vercel** (`maxDuration` de 30 s configurado, con objetivo de menos de 10 s) | Consultar y confirmar respetan `INTEGRACIONES_PRESUPUESTO_MS` (8 s) y cortan en `INCOMPLETA` con continuación. El `PATCH` de 230 filas deduplica combinaciones (pocas llamadas a Organización) y actualiza en una sola transacción. Hay que medirlo en la nube (IC4) |
| **429 de Jira** | Igual que en E5 (D105): 2 reintentos y `INCOMPLETA` con lo leído. La consulta queda revisable y confirmar no depende de Jira |
| **429 del gateway** al guardar por cambio | Cubo propio de 120 por minuto (D152). El portal reintenta por fila |
| **Concurrencia** | Una sola abierta (índice parcial). `version` con `FOR UPDATE` al confirmar. Una sola ejecución en curso (D104). La unicidad de código en Organización se captura por fila (`HDU_CREADA_DESPUES`). Ediciones de última escritura, con el aviso de §7.3 del diseño |
| **Asignaciones que caducan** (analista desactivado o reasignado) | Se pre-validan todas antes de escribir (409 sin escribir) y se revalidan por fila al escribir (`ASIGNACION_INVALIDA`) |
| **Retención de textos de Jira** | Purga en todas las salidas de `ABIERTA`. El vencimiento perezoso deja textos hasta la próxima lectura después de 24 h. Se acepta, porque no hay tareas programadas (D96); `q360-qa` verifica la purga en T22, T23 y T24 |
| **Supabase pausado** | Igual que en E5: reactivarlo antes de migrar |
| **Tipos del portal rotos** al regenerar | Esperado hasta FC1. No se publica el portal sin FC1 |

## Despliegue en la nube (para el usuario, sin secretos)

La migración va **antes** del merge a `main`, porque un push a `main` redespliega los proyectos y el código nuevo necesita las tablas nuevas. La migración es aditiva: el código anterior sigue funcionando con ella, porque las columnas nuevas tienen valor por defecto.

1. Si Supabase está pausado, reactívalo en el panel.
2. En **SQL Editor**, ejecuta en este orden:
   1. `services/integraciones/prisma/migrations/20261102000000_e5_consulta_asignacion/migration.sql`, precedido de `set local search_path to integraciones;`.
   2. `infrastructure/nube/006_rls_consulta_asignacion_nube.sql`.

   Organización no tiene migración (D151).
3. Comprueba que la tabla `integraciones.consulta_jira` existe y que el rol anónimo no la lee.
4. Haz el merge a `main`. Se redesplegarán `quality360-integraciones`, `quality360-organizacion`, `quality360-gateway` y el portal.
5. Variables opcionales (solo si cambias los valores por defecto). Después, **Redeploy** de cada proyecto:
   - `INTEGRACIONES_CONSULTA_VIGENCIA_MS` y `INTEGRACIONES_CONSULTA_TOPE_ITEMS` en `quality360-integraciones`.
   - `LIMITE_TASA_CONSULTA_MAX` en `quality360-gateway`.
6. Verificación sin sesión:
   - `POST https://<gateway>/v1/integraciones/jira/sincronizaciones` → 404.
   - `GET https://<gateway>/v1/integraciones/jira/consultas/actual` → 401.
   - `https://<gateway>/v1/interno/integraciones/asignaciones/validar` → 404.
7. Verificación con sesión:
   1. Como Administrador, abre «Consultar Jira» y consulta.
   2. Asigna una fila y recarga: la asignación sigue.
   3. Confirma: se crea la HDU con analista y su historial de asignación empieza con «Asignación inicial al confirmar la consulta de Jira».
   4. Como QE y Auditor, en el historial aparecen las fases y no hay consulta.

## Lo que se rechaza en revisión

Lo de `e5-plan-construccion.md`, y además:
- Guardar la respuesta cruda de Jira, o textos de Jira fuera de `consulta_item`.
- Dejar filas sin purgar en una consulta cerrada.
- Que Integraciones busque sprints por nombre o valide equipos por su cuenta: eso es de Organización (D151).
- Confirmar llamando a Jira o leyendo la configuración.
- Un `PATCH` de grupo que falle en silencio: siempre `rechazadas`.
- Una consulta cerrada respondida como lista vacía.
