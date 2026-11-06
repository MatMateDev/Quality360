# E5 · Detalle de la HDU y confirmación una a una · Plan de construcción

Fecha: 2026-11-05. Base: `feature/e1-e2-quality360` + DEF-E5C-05 (`b48a87d`). Complementa `e5-consulta-plan-construccion.md`, que sigue vigente en todo lo que este plan no cambia.

**Insumos**
- Backlog: `docs/backlog/e5-detalle-asignacion-por-hdu.md`. Trae 4 HDU nuevas (E5-F06, E5-F07, E5-B06 y E5-B07) y 7 escenarios agregados. Con eso E5 pasa de 56 a 111 escenarios y el total, de 272 a 327.
- Diseño: `docs/diseno/e5-detalle-asignacion-por-hdu.md`. Contiene la microcopy (§6), los `data-testid` (§8) y el inventario de componentes (§9). **`q360-frontend` lo sigue al pie de la letra.**
- Decisiones: D196–D207, con ajustes, en `decisiones-mvp.md` y en el ADR 0018.

**Contratos (contract-first, todos aditivos).** `npm run contracts:lint` pasa sin advertencias y `npm run contracts:check` cubre 327/327.

| Archivo | Cambio |
| --- | --- |
| `integraciones.v1.yaml` | **2 rutas nuevas:** `GET /v1/integraciones/jira/consultas/{id}/items/{itemId}` (`obtenerItemConsulta`) y `POST …/items/{itemId}/confirmaciones` (`confirmarItemConsulta`). El parámetro `ItemId` y las respuestas `ConflictoConfirmarFila` y `FilaNoConfirmable` traen ejemplos. `FilaRechazada` suma `FILA_EN_CURSO` y `HDU_YA_ASIGNADA`. `GET /ejecuciones` suma el filtro `alcance`. Las descripciones de consultar, editar, confirmar en lote y descartar suman D196–D205 |
| `comun.v1.yaml` | Códigos `HDU_YA_ASIGNADA`, `FILA_MODIFICADA` y `FILA_EN_CURSO`. Enum `AlcanceEjecucion`, que también va en `Ejecucion.alcance`. `ItemConsulta` suma `revision`, `analistaAuto`, `aplicando`, `aplicacion` y `yaAsignada`, y `idHistoria` se amplía. `Consulta` suma `creadas` y `yaAsignadas`, y `PaginaItemsConsulta` suma `yaAsignadas`. Esquemas nuevos: `YaAsignada`, `AplicacionFila`, `TextoDetalle`, `CriteriosDetalle`, `SprintDetalle`, `DetalleHdu`, `DetalleItemConsulta`, `SolicitudConfirmacionFila`, `ResultadoConfirmacionFila`, `ErrorHduYaAsignada` y `ErrorFilaModificada`. En los internos: `EstadoCodigoHdu.analista`, `AsignacionAValidar.proponerAnalista`, `AsignacionValidada.analistasActivos` y `.analistaPropuesto`, y `ResultadoFilaUpsert.existente` (`HduExistenteUpsert`) |
| `organizacion.v1.yaml` | Descripciones y `x-hdu` de `estado-codigos`, `asignaciones/validar` y `hdu/upsert`. Las rutas nuevas son 0 |
| `gateway.v1.yaml` | Reenvía las 2 rutas. La consulta pasa de 8 a 10 operaciones y `/v1/integraciones/*` pasa de 16 rutas y 18 operaciones a 18 y 20 |

**Tipos.** Después de `npm run contracts:types`, los campos requeridos nuevos de `ItemConsulta`, `Consulta` y `Ejecucion` hacen fallar los mocks y fixtures del portal que construyen esos objetos a mano. Es esperado, y lo corrige `q360-frontend` en F1.

> **Aviso: puerto fijo `FuenteJira`** (`services/integraciones/src/dominio/puertos/fuente-jira.ts`). Su comentario dice «interfaz FIJA: no se cambia sin avisar a `q360-backend`». Este plan lo cambia **solo de forma aditiva** (D196):
> - `IssueJira` suma campos opcionales: `creada?`, `actualizada?`, `vencimiento?`, `resolucion?`, `padre?: { clave, titulo, esEpica }` y `criteriosAdf?`.
> - `SprintJira` suma `inicio?`.
> - La consulta de `buscarPagina` suma `campoCriterios?: string | null`.
> - Se agrega el método `detectarCampos(c, o): ResultadoJira<{ sprint: string | null; criterios: string | null }>`, con la **misma** llamada a `/field`. `detectarCampoSprint` conserva su firma y delega en él.
>
> Ninguna firma existente cambia. Quien implemente `FuenteJira` debe sumar `detectarCampos`. Hoy son `cliente-jira-http.ts` y el doble de `services/integraciones/test/ayudas.ts`. `q360-backend` queda avisado por este documento y no tiene trabajo en el puerto. Si alguien necesita cambiar una firma existente, pasa antes por `q360-arquitecto`.

## Modelo de datos

### Integraciones · migración `services/integraciones/prisma/migrations/20261106000000_e5_detalle_hdu/migration.sql` (q360-integraciones)

Es aditiva y va en el esquema `integraciones`, sin llaves foráneas hacia otro esquema (D24). Las SQL crudas se califican con `integraciones.` (DEF-E5C-05).

| Tabla | Columna o cambio | Nota |
| --- | --- | --- |
| `consulta_item` | `detalle jsonb NULL` | CHECK `detalle IS NULL OR (jsonb_typeof(detalle) = 'object' AND octet_length(detalle::text) <= 40960)` (D198) |
| | `revision integer NOT NULL DEFAULT 1` | CHECK `>= 1`. Sube con cada `UPDATE` de la fila que cambie datos |
| | `analista_auto boolean NOT NULL DEFAULT false` | CHECK `NOT analista_auto OR analista_id IS NOT NULL` |
| | `aplicando_desde timestamptz NULL` | Toma atómica (D202). Se limpia al aplicar o al fallar |
| | `ya_asignada jsonb NULL` | `{idHistoria, qe, analista}`. CHECK `IS NULL OR jsonb_typeof = 'object'` |
| | `alcance_aplicacion varchar(4) NULL`, `aplicado_por_id uuid NULL`, `aplicado_por_nombre varchar(150) NULL`, `aplicado_en timestamptz NULL` | `ItemConsulta.aplicacion`. CHECK `aplicada = (alcance_aplicacion IS NOT NULL)` y `alcance_aplicacion IN ('LOTE','HDU')`. **Relleno:** las filas `aplicada` existentes reciben `LOTE` y los datos de la consulta |
| | `item_hdu_ck` **se reemplaza** | Nuevo: `grupo IN ('CAMBIO','SIN_CAMBIOS') OR (origen_hdu IS NULL AND estado_hdu IS NULL AND qe_hdu_nombre IS NULL AND (id_historia IS NULL OR aplicada OR ya_asignada IS NOT NULL))`. Así, una `NUEVA` creada desde la consulta o creada por otra persona durante la revisión puede guardar su `id_historia` |
| `consulta_jira` | `creadas integer NOT NULL DEFAULT 0` | CHECK `>= 0`. No se borra al purgar (D205). El disparador `consulta_cerrada_inmutable` no cambia: una confirmación de fila que termina después del cierre **no** actualiza la consulta, ver D205 |
| `ejecucion_integracion` | `alcance varchar(4) NOT NULL DEFAULT 'LOTE'` | CHECK `alcance IN ('LOTE','HDU')` y `alcance = 'LOTE' OR fase = 'CONFIRMACION'`. Índice `(alcance, iniciada_en DESC)`. El disparador `ejecucion_cerrada_inmutable` suma `alcance` a la identidad inmutable |
| `configuracion_jira` | `campo_criterios varchar(30) NULL` | Mismo patrón que `campo_sprint` (D199) |

- `ejecucion_en_curso_key` **no cambia**: la ejecución `HDU` se inserta ya cerrada (D202 a).
- **Permisos y nube:** no hay tablas nuevas, así que el 006 ya las cubre. La migración repite `REVOKE TRUNCATE` sobre las tablas tocadas, como pide la convención. En la nube, se aplica por el MCP de Supabase como las anteriores y se verifica con `modelo-datos-estructura`. **No hace falta un script `00x_rls_*` nuevo.**
- **Prisma:** se suman los campos a `ConsultaJira`, `ConsultaItem`, `EjecucionIntegracion` y `ConfiguracionJira`, y el comentario «lo que Prisma no expresa» suma los CHECK nuevos.

### Organización

**No tiene migración.** Lee `supervision` (vigente = `fecha_hasta IS NULL`, con el índice único del analista vigente de D190), `usuario.activo` y la auditoría `CREAR_HDU` (que ya trae `consultaId` y el actor) para calcular `existente`. Si `q360-backend` encuentra que esa consulta de auditoría necesita un índice (por `entidad_id` y `accion`), lo reporta antes de crear una migración.

### Variables nuevas

| Servicio | Variable | Defecto | Nota |
| --- | --- | --- | --- |
| Integraciones | `INTEGRACIONES_JIRA_TAMANO_PAGINA` | 50 | Mínimo 10 y máximo 100; un valor fuera de rango usa 50 (D196) |
| Integraciones | `INTEGRACIONES_TOMA_FILA_MS` | 30000 | Expiración de `aplicando_desde` (D202). En pruebas de carrera vale 2000 |

## Paquetes de trabajo por agente (sin archivos en común)

### q360-integraciones · `services/integraciones/**`

| Id | Tarea | Archivos | Escenarios |
| --- | --- | --- | --- |
| JD1 | Migración `20261106000000_e5_detalle_hdu`, Prisma y las pruebas de modelo | `prisma/migrations/20261106000000_e5_detalle_hdu/migration.sql`, `prisma/schema.prisma`, `test/integracion/e5-b06-modelo.test.ts` (nuevo) | B06#7 |
| JD2 | Puerto y cliente de Jira: más `fields`, `parent`, fechas, `inicio` de sprint, `detectarCampos` y tamaño de página por variable | `src/dominio/puertos/fuente-jira.ts`, `src/infraestructura/jira/cliente-jira-http.ts`, `src/configuracion.ts`, `test/ayudas.ts`, `test/infraestructura/jira/*` | B06#1, B02#5 |
| JD3 | Dominio de mapeo y saneamiento del detalle: `DetalleHdu`, ADF a texto seguro, criterios de D199, límites y `truncado` | `src/dominio/mapeo/adf-a-texto.ts`, `src/dominio/mapeo/issue.ts`, `src/dominio/mapeo/detalle.ts` (nuevo), `src/dominio/mapeo/criterios.ts` (nuevo), `src/dominio/mapeo/tipos.ts`, `test/dominio/mapeo/*` | B06#2–#5 |
| JD4 | Consultar y continuar: guardan `detalle` y `yaAsignada`/`id_historia` con `estado-codigos.analista`. Configuración: guarda `campo_criterios` | `src/aplicacion/consulta.servicio.ts`, `src/aplicacion/configuracion.servicio.ts`, `src/dominio/consulta/clasificacion.ts`, `src/infraestructura/organizacion/organizacion.cliente.ts`, `src/infraestructura/prisma/consulta.prisma.repositorio.ts`, `src/infraestructura/prisma/configuracion.prisma.repositorio.ts`, `test/integracion/e5-b06-detalle.test.ts` (nuevo) | B06#1–#5, #8, B02#5–#6, B01 (sin regresión) |
| JD5 | Lectura del detalle (`GET …/items/{itemId}`) y los campos nuevos del listado | `src/api/controladores/consulta.controller.ts`, `src/api/validacion/consulta.ts`, `src/aplicacion/vistas-consulta.ts`, `src/infraestructura/prisma/mapeadores.ts` | B06#6, #9, B05#15, F06 (servidor) |
| JD6 | Edición: `proponerAnalista`, `analistaAuto`, `revision`, `HDU_YA_ASIGNADA` solo en `NUEVA`, `FILA_EN_CURSO` | `src/aplicacion/edicion-consulta.servicio.ts`, `src/dominio/consulta/asignacion.ts`, `src/dominio/consulta/errores.ts`, `test/dominio/consulta.test.ts`, `test/integracion/e5-b05-edicion.test.ts` | B07#1–#3, #6 |
| JD7 | Confirmación de una fila: toma atómica, `revision`, idempotencia por actor, `existente` → 409 o `repetida`, ejecución `HDU` ya cerrada, `consulta.creadas`. El lote omite lo aplicado o tomado y toma sus filas igual. `alcance` en el historial | `src/aplicacion/confirmacion-fila.servicio.ts` (nuevo), `src/aplicacion/confirmacion.servicio.ts`, `src/dominio/consulta/confirmacion.ts`, `src/dominio/ejecucion.ts`, `src/aplicacion/historial.servicio.ts`, `src/infraestructura/prisma/ejecucion.prisma.repositorio.ts`, `src/app.module.ts`, `test/integracion/e5-b07-confirmacion-fila.test.ts` (nuevo), `test/integracion/e5-b05-confirmacion.test.ts`, `test/integracion/e5-b04-historial.test.ts` | B07#4–#15, B05#6, #10, B04#5 |

Reglas:
- El dominio no importa nada de infraestructura.
- El detalle nunca se escribe en logs ni en `detalle_ejecucion`.
- Ninguna SQL toca otro esquema.

### q360-backend · `services/organizacion/**` (sin migración)

| Id | Tarea | Archivos | Escenarios |
| --- | --- | --- | --- |
| OD1 | `estado-codigos` suma `analista` (nombre o `null`) | `src/aplicacion/integraciones.servicio.ts`, `src/infraestructura/repositorios/integracion-hdu.prisma.repositorio.ts`, `test/integracion/e5-consulta-internos.test.ts` | B02#6, B07#6 |
| OD2 | `asignaciones/validar` suma `proponerAnalista`, `analistasActivos` y `analistaPropuesto`. Es la misma consulta de supervisión que usa `catalogos/personas?supervisorId=` (se extrae al repositorio y la usan ambas) | `src/api/validacion/integraciones-consulta.ts`, `src/dominio/reglas/asignacion-hdu.ts`, `src/infraestructura/repositorios/supervision.prisma.repositorio.ts`, `src/aplicacion/integraciones.servicio.ts` (solo el método de validar), `test/integracion/e5-consulta-internos.test.ts` | B07#1–#3, #10, F07#1–#3 |
| OD3 | Upsert `CREAR`: `existente` con `creadaPorEstaConsulta` y `creadaPorActor`, también cuando salta la unicidad al insertar | `src/aplicacion/integraciones.servicio.ts` (solo el upsert), `src/infraestructura/repositorios/auditoria.prisma.repositorio.ts`, `test/integracion/e5-consulta-confirmacion.test.ts` | B07#4, #7, #8, #11 |

OD1–OD3 tocan `integraciones.servicio.ts` en métodos distintos y los hace **el mismo agente en serie**, así que no hay solapamiento con otro agente.

### q360-seguridad-gateway · `apps/gateway/**`

| Id | Tarea | Archivos | Escenarios |
| --- | --- | --- | --- |
| GD1 | Declarar las 2 rutas una por una (`GET …/items/:itemId` y `POST …/items/:itemId/confirmaciones`). El `POST` entra al cubo `LIMITE_TASA_CONSULTA_MAX` y sale del de escritura general. Se propagan 409, 410 y 422 con su cuerpo | `src/api/integraciones.controller.ts`, `src/middlewares/limite-tasa.ts`, `pruebas/e5-integraciones.test.ts` (16 → 18 rutas y 18 → 20 operaciones; las 2 nuevas en la lista de 503 y de 401) | B05#13, B07#14 |

### q360-frontend · `apps/web/**` (sigue el diseño §6, §8 y §9)

| Id | Tarea | Archivos | Escenarios |
| --- | --- | --- | --- |
| FD1 | Tipos regenerados, cliente API (`obtenerItemConsulta`, `confirmarItemConsulta`), mocks MSW de las 2 rutas y de los campos nuevos, textos de la §6 | `src/api/integraciones.ts`, `src/mocks/handlersConsulta.ts`, `src/lib/mensajesAsignacion.ts` (`TEXTO_SIN_ANALISTAS` = «Este QE no supervisa analistas activos. Elige otro QE.», `textoAnalistaAutomatico`, `textoYaAsignada`, `textoCreada`, «Confirmar marcadas (N)»), `src/lib/mensajesIntegracion.ts` | — |
| FD2 | `PanelDetalleHdu` y `TextoLargoExpandible` (nuevos): panel modal y hoja móvil, Anterior y Siguiente sin asignar, enlaces solo `https?://` como elementos de React | `src/components/integraciones/PanelDetalleHdu.tsx`, `src/components/integraciones/TextoLargoExpandible.tsx`, `src/styles/integraciones.css` | F06#1–#10, F05#15 |
| FD3 | Tarjeta de fila: «Ver detalle», `aviso-analista-automatico` (desde `analistaAuto`), «Confirmar asignación» con `aria-disabled` y su motivo, estados Confirmando, Creada, Ya asignada y Error, `data-estado` | `src/components/integraciones/TarjetaFilaNueva.tsx`, `src/components/integraciones/SelectorAsignacion.tsx` | F07#1–#4, #7–#9, #14 |
| FD4 | `AlertaHduYaAsignada` (variantes completa, de fila y compacta; `role="note"` al cargar y `alert` en sesión). «Ir a la HDU» → `/hdu/<idHistoria>` (ruta existente, misma pestaña) | `src/components/integraciones/AlertaHduYaAsignada.tsx` (nuevo), `src/components/integraciones/GrupoConsulta.tsx`, `src/components/integraciones/CeldaCambios.tsx` | F07#5, #6, F05#14 |
| FD5 | Coexistencia con el lote: «Confirmar marcadas (N)», texto de coexistencia, «Terminar revisión» y su diálogo, `contador-ya-asignadas`, foco tras confirmar | `src/components/integraciones/ResumenConfirmacion.tsx`, `src/components/integraciones/ConsultaAbierta.tsx`, `src/components/integraciones/ResultadoConfirmacion.tsx`, `src/components/integraciones/ResumenConsulta.tsx` | F07#10–#13, F02#4 |
| FD6 | Historial: chip «Una HDU» y filtro `alcance` | `src/components/integraciones/TablaEjecuciones.tsx`, `src/components/integraciones/VistaHistorial.tsx` | F04#5 |
| FD7 | Pruebas unitarias del portal | `src/test/e5Asignacion.test.tsx`, `src/test/e5Consulta.test.tsx`, `src/test/e5Detalle.test.tsx` (nuevo), `src/test/e5ConfirmacionFila.test.tsx` (nuevo) | — |

Si `/hdu/:id` no muestra la HDU a un Administrador, `q360-frontend` lo informa a `q360-arquitecto` antes de improvisar otra ruta (diseño §10.2).

### q360-qa · `tests/**` (Jira simulado, fixture y certificación)

Adiciones al fixture:
- **Jira simulado** (`tests/support/jira-falso/servidor.ts`):
  - QTY-15: 20 KB de ADF con `media`, una macro y `<script>`.
  - QTY-16: vacía.
  - QTY-17: completa, con 25 etiquetas, 3 sprints, épica y criterios en campo.
  - QTY-18: criterios en un encabezado.
  - Un campo `/field` «Acceptance Criteria».
  - `fields` visibles en `/__solicitudes`.
- **Usuarios:** QE6 (ANA5 inactiva y ANA6 activa) y ADM2.
- **HDU:** QTY-5 creada a mano por QE1 sin analista.

Archivos nuevos: `tests/api/e5-b06-detalle.spec.ts`, `tests/api/e5-b07-confirmacion-fila.spec.ts`, `tests/e2e/e5-f06-detalle.spec.ts` y `tests/e2e/e5-f07-confirmacion-fila.spec.ts`. Los IDs de caso siguen el patrón `E5-F06-Tnn`.

## Orden y dependencias

| Ola | Agente | Tarea | Depende de |
| --- | --- | --- | --- |
| 1 | integraciones | JD1 migración y Prisma | contratos |
| 1 | integraciones | JD2 puerto y cliente Jira | contratos |
| 1 | backend | OD1, OD2, OD3 (en serie) | contratos |
| 1 | gateway | GD1 | contratos |
| 1 | frontend | FD1 tipos, API, mocks y textos | contratos |
| 1 | qa | Jira simulado, fixture y arnés | contratos |
| 2 | integraciones | JD3 dominio de detalle | JD2 |
| 2 | frontend | FD2, FD3, FD4 contra mocks | FD1 |
| 3 | integraciones | JD4 consultar y configuración | JD1, JD3, OD1 |
| 3 | integraciones | JD5 lectura del detalle | JD1, JD4 |
| 4 | integraciones | JD6 edición | JD5, OD2 |
| 4 | frontend | FD5, FD6 | FD3 |
| 5 | integraciones | JD7 confirmación de fila y lote | JD6, OD3 |
| 6 | frontend | FD7 y prueba contra el stack real (sin mocks) | JD7, GD1 |
| 7 | qa | Certificación: escenarios nuevos y regresión de abajo; axe en panel, alerta, error y fila creada a 1280 y 375 | todo |

Despliegue: Organización, después Integraciones (la migración primero), después gateway y al final web. `EstadoCodigoHdu.analista` es opcional, así que Integraciones tolera una Organización anterior durante el despliegue.

## Pruebas certificadas que `q360-qa` debe ajustar

| Prueba | Por qué |
| --- | --- |
| `tests/e2e/e5-f05-asignacion.spec.ts` E5-F05-T03, T06, T07, T09, T10, T14 y `tests/api/e5-b05-consulta-asignacion.spec.ts` E5-B05-T07, T08, T10, T11 | Eligen QE2, que solo tiene a ANA3. Con D201 el Analista queda asignado solo, así que los pasos «falta: analista» o «ANA1 no pertenece a QE2» deben usar QE1 (dos analistas) o enviar el analista explícito. T11 mantiene `FILA_NO_ASIGNABLE` en `SIN_CAMBIOS` (D204) |
| E5-F05-T09 (`tests/e2e/e5-f05-asignacion.spec.ts`, líneas 213 y 221) y `apps/web/src/test/e5Asignacion.test.tsx` (línea 122) | El texto de `ayuda-sin-analistas` cambia: «Este QE no tiene analistas en su equipo» pasa a **«Este QE no supervisa analistas activos. Elige otro QE.»** (diseño §3.2) |
| E5-F05-T10, T12 y T14 (líneas 238, 286 y 327) y `apps/web/src/test/e5Asignacion.test.tsx` (266 y 273) y `e5Consulta.test.tsx` (67) | «Confirmar (N)» pasa a «Confirmar marcadas (N)» |
| `tests/api/e5-b05-consulta-asignacion.spec.ts` E5-B05-T31 y `tests/api/e5-gateway.spec.ts` E5-GW#5 | Las rutas de la consulta pasan de 8 a 10 |
| `apps/gateway/pruebas/e5-integraciones.test.ts` (dueño `q360-seguridad-gateway`, GD1) | Pasa de 16 rutas y 18 operaciones a 18 y 20 |
| `tests/support/contrato.ts` y todo caso que valide `ItemConsulta`, `Consulta` o `Ejecucion` contra el esquema | Tienen campos requeridos nuevos. Pasan cuando JD5 y JD7 estén listos |
| Regresión sin cambio esperado | E5-F05-T28, E5-B04-T14, E5-B02 completo, E5-B01 (al guardar ahora también se detectan los criterios, con la misma llamada a `/field`), E2 y E7-B05 |
