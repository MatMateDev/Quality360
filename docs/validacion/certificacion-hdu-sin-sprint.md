# Certificación · `GET /v1/hdu` con HDU sin sprint vigente (Quality360)

Dueño: `q360-qa`. Cambio certificado: commit `38d6c15` (rama `fix/hdu-sin-sprint-vigente`, sobre `90df435` = `quality360/main` tras el PR #10), «`GET /v1/hdu` tolera HU sin sprint vigente; DEF-E5C-05 limpia lo que crea». No se tocó código de producción. Pruebas del 5-nov-2026.

Defecto de origen (hallado en DEF-E5C-05): en `services/organizacion`, `GET /v1/hdu` respondía 500 a todos si alguna HDU no tenía sprint vigente, porque `aHduDominio` lanza.

## Veredicto

| Alcance | Dictamen |
| --- | --- |
| `GET /v1/hdu` con HDU sin sprint vigente: 200 para los 5 roles, la HDU rota queda fuera, `total`, páginas y filtros cuadran, el portal muestra el resto | **CERTIFICADO** |
| La prueba `def-e5c-05-sql-calificadas` limpia `DEF-1`, su célula y sus usuarios aunque falle | **CERTIFICADO** (con un fallo inyectado a mano) |
| Que ningún otro endpoint de HDU responda 500 con una HDU sin sprint | **OBSERVADO**: 4 defectos abiertos (DEF-SINSPRINT-01 a 04), ninguno bloquea el arreglo del listado |

Defectos abiertos: 4 (1 media, 3 baja). Sin regresiones en E2 ni en E7 atribuibles al cambio (ver «Regresión»).

## 1. Revisión del diff `90df435..38d6c15`

Archivos: `mapeadores.ts`, `hdu.prisma.repositorio.ts` (producción); `ayudas.ts`, `def-e5c-05-sql-calificadas.test.ts`, `hdu-sin-sprint-vigente.test.ts` (pruebas).

¿Dejar la HDU fuera es correcto frente a los contratos?

| Punto | Resultado |
| --- | --- |
| Contrato | `HduResumen.sprint` es obligatorio y no nulo (`comun.v1.yaml`). Una HDU sin sprint no se puede representar; excluirla es coherente. Los contratos no documentan la exclusión (sugerencia a quien los mantenga) |
| Paginación y `total` | `listarPorAmbito` usa el mismo `where` (ámbito, filtro y `CON_SPRINT_VIGENTE`) en `findMany` y en `count`. Probado: recorrer todas las páginas de a 5 da exactamente `total` ítems, sin duplicados y sin la HDU rota |
| Filtros | `celulaId`, `sprintId`, `estado` y su combinación siguen en 200 y excluyen la HDU rota; `items.length == total` |
| Aviso | 1 `WARN` por consulta con los códigos y los ids (`HU sin sprint vigente excluidas del listado: SINSPRINT-1 (…), SINSPRINT-2 (…)`), 30 avisos en el registro de esta sesión |
| Contadores | **No cuadran**: ver DEF-SINSPRINT-02 |
| Otros mapeos | Solo los listados usan `aHdusDominio`. Las lecturas y escrituras de una HDU siguen con `aHduDominio` y lanzan: ver DEF-SINSPRINT-01 |

## 2. Suite de Organización (base propia)

Entorno: segundo Supabase local (proyecto `q360hdusp`, API 54421, Postgres 54422, Auth y Storage propios) con esquemas, roles, buckets y migraciones aplicados desde este commit; así no se toca el Postgres compartido (54322). `DATABASE_URL` con `connection_limit=1`.

| Prueba | Resultado real |
| --- | --- |
| `npm run typecheck -w services/organizacion` | Sin errores |
| `npm test -w services/organizacion` (unitarias + integración, `--test-concurrency=1`) | 326 pruebas: **325 pasan, 1 falla**, 0 omitidas, 0 canceladas |
| La que falla: `integracion/e5-pool-unico.test.ts` | Falla al cargar: su guarda exige `127.0.0.1:54322` (`url.port === '54322'`) y la base propia está en 54422. **No se ejecutó**: no certifica nada. No depende del diff (la última certificación la dio 8 de 8 en otro entorno) |
| `hdu-sin-sprint-vigente.test.ts` (nueva) | 4 de 4: GET /v1/hdu 200 para ADMINISTRADOR y QE excluyendo la rota, repositorio (`buscarPorIds`, `listarTodasPorAmbito`, `buscarPorCodigosNormalizados`) sin fallar, `aHdusDominio` descarta y avisa |
| `def-e5c-05-sql-calificadas.test.ts` | Pasa. Fallo inyectado: se editó solo el JS compilado (`build-pruebas`) para lanzar justo después de crear la HDU `DEF-1`. Resultado: la prueba falla como debe y la base queda sin `DEF-1`, sin `Célula DEF`, sin los 3 usuarios locales y sin cuentas de Auth nuevas en los 3 minutos siguientes |

## 3. Stack real local

Stack propio: Postgres 54422, Auth/Storage 54421, Organización 3151, Certificaciones 3152, Impedimentos 3153, Integraciones 3154, gateway 3150, portal 5373, con `connection_limit=1` y límites de tasa alzados (100000). Semillas `seed` y `seed:e7`.

Se crearon dos HDU por el gateway (QE Carla Fuentes, analista Ana Torres): `SINSPRINT-1` y `SINSPRINT-2` (esta con un estado y un impedimento). Se les cerró `historia_sprint.fecha_retiro` con el rol dueño de la tabla (`svc_organizacion`; `postgres` no tiene permiso sobre ella).

`GET /v1/hdu?tamanoPagina=100` por el gateway, por rol:

| Rol | Antes de cerrar el sprint | Después |
| --- | --- | --- |
| Administrador | 200, 23 | **200, 22** |
| QE | 200, 7 | **200, 6** |
| Analista QA | 200, 4 | **200, 3** |
| Líder QA | 200, 15 | **200, 14** |
| Auditor | 200, 23 | **200, 22** |

Prueba nueva `tests/e2e/hdu-sin-sprint-vigente.spec.ts` (crea sus HDU, cierra el sprint de una con el dueño de la tabla y borra todo en `afterAll`): 18 de 18 en las dos corridas (9 de inicio de sesión y 9 pruebas):

| ID | Qué verifica | Resultado |
| --- | --- | --- |
| `[SIN-SPRINT#1]` ×5 | 200 por rol, todos los `sprint` no nulos, la rota ausente, la sana presente | Pasa |
| `[SIN-SPRINT#2]` | Páginas de a 5: total estable, suma exacta, sin duplicados | Pasa |
| `[SIN-SPRINT#3]` | Filtros célula, sprint, estado y combinados | Pasa |
| `[SIN-SPRINT#4]` | Portal `/qe/hdu` (Carla) y `/qa/hdu` (Ana): muestran la sana, no la rota, sin alerta ni «no disponible» | Pasa |
| `[SIN-SPRINT#5]` | `GET /v1/hdu/{id}` y `/historial` de la rota no responden 500 | Marcada `test.fail`: «pasa» mientras el defecto DEF-SINSPRINT-01 exista y se pone en rojo al corregirlo (entonces se quita el `.fail`) |

### Otros endpoints con una HDU sin sprint (sondeo por rol, mismas dos HDU)

Control: con la misma HDU antes de cerrarle el sprint, 0 respuestas 500 (solo 4xx esperadas de mi sondeo).

| Endpoint | Resultado con HDU sin sprint |
| --- | --- |
| `GET /v1/hdu/{id}` (detalle) | **500 ERROR_INTERNO** para los 5 roles |
| `GET /v1/hdu/{id}/historial` | **500** para los 5 roles |
| `POST /v1/hdu/{id}/estado`, `PUT /v1/hdu/{id}/analista` | **500** |
| `GET /v1/interno/hdu/{id}/acceso` (Organización) | **500** para los 5 roles; Certificaciones e Impedimentos lo usan, así que `GET /v1/hdu/{id}/entregables` y `/impedimentos` por el gateway dan **503 SERVICIO_NO_DISPONIBLE** |
| `GET /v1/bandeja/{analista,qe,lider,admin,auditor}` (E7) | 200 |
| `GET /v1/inicio/{qe,qa,admin}` (E1) | 200 (contadores con DEF-02) |
| `GET /v1/riesgo/hdu` (E4), `GET /v1/qe/aprobaciones-pendientes`, `GET /v1/auditor/exportaciones/hdu` | 200 |
| `GET /v1/interno/hdu/{ambito,ambito/detalle,responsable}` | 200 |
| `POST /v1/interno/hdu/consulta` con la rota | Administrador y Auditor 200 (la omite); QE, Analista y Líder **403** (DEF-03) |
| `POST /v1/interno/integraciones/hdu/estado-codigos` (E5) | 200 con `existe:false` para la rota (DEF-03) |
| `POST /v1/interno/integraciones/hdu/upsert` (E5) con el código de la rota | 200 `OMITIDA / HDU_MANUAL_EXISTENTE` (DEF-03) |

## 4. Regresión de E2 y E7 (con las dos HDU sin sprint presentes)

| Suite | Resultado real |
| --- | --- |
| E2 API (`e2-b01..b04`) | 12 de 12 |
| E2 portal (`e2-f01..f04`) | 21 de 21 (incluye los 9 de inicio de sesión) |
| E7 API (`--project=e7-api`) | 65 pasan, 4 fallan, 5 omitidas |
| E7 portal (`--project=e7-e2e`) | 113 pasan, 4 fallan, 3 omitidas |

Análisis de los 8 fallos de «Certificaciones detenida» (E7-B03#2 T09 y T10, E7-B04#1 T12, E7-F02#2 T04, E7-F03#2 T04, E7-F04#2 T05, E7-F06#3 T08): no son del cambio. El arnés `tests/support/entornoE7.ts` levanta sus pilas «caídas» en los puertos fijos 3100 (gateway), 3101 (Organización), 3202 y 5180, y mi stack usaba 3100 y 3101: el arnés creyó que su Organización «sin Certificaciones» ya estaba arriba y habló con la mía. Se movió mi stack a 3150–3154 / 5373 y se repitieron: **15 de 15 (API) y 15 de 15 (portal)**.

El fallo restante: `[E7-B02#2] T06` (`e7-b02-ambito.spec.ts:110`) esperaba `total = 43` (su `SELECT count(*) FROM historia_usuario`) y recibió 41. Es consecuencia directa y esperada del cambio: cuenta las 2 HDU sin sprint que el listado ya no devuelve. Al borrar `SINSPRINT-1/2` la prueba pasa (12 de 12 con el inicio de sesión). Ese oráculo deja de ser válido con datos inconsistentes; ajustarlo es de `q360-qa` (contar solo las que tienen sprint vigente).

Omitidas (5 API, 3 portal): no certifican nada. Todas son las `ABS-*` del fixture (`e7-abs-fixture` y `e7-abs-fixture-ui`), que se omiten solas porque exigen una base «solo con seed:e7» y aquí está también la semilla MVP.

## 5. Defectos

| ID | Severidad | Agente dueño | Reproducción | Esperado |
| --- | --- | --- | --- | --- |
| DEF-SINSPRINT-01 | Media | `q360-backend` | Crear una HDU, cerrarle `historia_sprint.fecha_retiro` con el dueño de la tabla y, con cualquier rol, `GET /v1/hdu/{id}` y `/historial` → 500 `ERROR_INTERNO`; `POST /v1/hdu/{id}/estado` y `PUT /v1/hdu/{id}/analista` → 500; `GET /v1/interno/hdu/{id}/acceso` → 500, y por eso `GET /v1/hdu/{id}/entregables` y `/impedimentos` → 503. Causa: `buscarPorId`, `buscarPorCodigoNormalizado` y las escrituras usan `aHduDominio`, que lanza. Se llega por enlace directo o desde Certificaciones e Impedimentos | Una respuesta controlada (404 o un error de negocio de datos inconsistentes), nunca 500/503; o detalle con `sprint` indicado como ausente si el contrato lo admite. Prueba `[SIN-SPRINT#5]` lo cubre |
| DEF-SINSPRINT-02 | Baja | `q360-backend` | Con 2 HDU sin sprint de Carla/Ana: `GET /v1/inicio/qe` da `hduEnAmbito: 16` y la lista de Carla `total: 14`; `GET /v1/inicio/qa` da `hduAsignadas: 6` y la lista de Ana `total: 4`. `resumenAmbitoQe` y `resumenPorAnalista` cuentan sin `CON_SPRINT_VIGENTE` | Contadores del inicio iguales al total de la lista a la que llevan |
| DEF-SINSPRINT-03 | Baja | `q360-backend` | (a) `POST /v1/interno/hdu/consulta {hduIds:[rota]}` como QE, Analista o Líder → 403 `ACCESO_DENEGADO` aunque `GET /v1/interno/hdu/ambito` incluye ese id en `hduIds`; el Administrador la omite en silencio. (b) `estado-codigos` responde `existe:false` para el código de la rota, mientras `upsert` responde `HDU_MANUAL_EXISTENTE` con su id: una consulta de Jira la presentaría como nueva. Causa: `buscarPorIds` y `buscarPorCodigosNormalizados` ahora descartan la fila sin avisar al llamador | Ámbito, lote y E5 coherentes entre sí. No se observó un fallo visible en E3/E4 en este entorno (`/v1/riesgo/hdu` y `/v1/qe/aprobaciones-pendientes` dieron 200); queda como riesgo latente |
| DEF-SINSPRINT-04 | Baja | `q360-backend` | `hdu-sin-sprint-vigente.test.ts` no limpia al terminar: tras la suite quedaron `ROTA-1`, `ROTA-2` y `SANA-1` en la base (más sus usuarios de Auth). Es el mismo tipo de resto que provocó el 500 original, ahora oculto por el filtro, y movió mis conteos de base (23 incluía `SANA-1`) | Un `after` que borre lo que crea, como se hizo con `def-e5c-05` |

Observaciones (no defectos del cambio):
- OBS-1: el arnés `entornoE7.ts` fija los puertos 3100, 3101, 3202 y 5180; cualquier stack que los use hace fallar en falso las pruebas «Certificaciones detenida». Conviene parametrizarlos (`q360-qa`/`q360-infra`).
- OBS-2: `e5-pool-unico.test.ts` solo admite `127.0.0.1:54322`; no se puede ejecutar contra una base propia sin editarla.
- OBS-3: la suite deja cuentas `prueba.*@quality360.local` en Auth (169 en esta base). La prueba de `def-e5c-05` ya no suma.

## 6. Límites

- La base y el stack fueron propios, no el Postgres compartido ni la nube; los resultados no se midieron en producción.
- `e5-pool-unico` no se ejecutó (OBS-2). Las 8 omitidas de E7 no cuentan.
- El portal se verificó en `/qe/hdu` y `/qa/hdu`; el Administrador, el Líder y el Auditor no tienen lista de HDU propia con ese listado, y sus bandejas se probaron por API (200), no por pantalla.
- E2 y E7 se repitieron en lo que lista HDU; E1, E3, E4 y E5 no se volvieron a correr completos. Se sondearon sus endpoints de HDU a mano (sección 3), sin sus suites.
- La interpretación de «sin sprint vigente» incluye tanto la HDU sin ninguna fila de `historia_sprint` como la que solo tiene filas retiradas o con `id_sprint` nulo (las tres las cubre la prueba del commit; en vivo solo se probó la de fila retirada).
- Un primer `seed:e7` sin las variables del stack propio falló con 401 (apuntaba por defecto a 54321/3002, el stack de otra sesión); solo pudo haber hecho lecturas allí. No es un defecto del producto.
- Las HDU de prueba (`SINSPRINT-*`, `SPR*`) se borraron al terminar y el stack propio se desmontó.
