# Certificación E5 · Detalle de la HDU y confirmación una a una (Quality360)

Dueño: `q360-qa`. Cambio certificado: «E5 · detalle y asignación por HDU» (`docs/backlog/e5-detalle-asignacion-por-hdu.md`, D196–D207, ADR 0018, plan `docs/arquitectura/e5-detalle-plan-construccion.md`), sobre el código de `4d48647` (arquitecto `7323a81`, gateway GD1 `af873b9`, organización OD1–OD3 `91244ce`, web FD1–FD6 `0b34cba`, integraciones JD1–JD7 `a22358d`). **Ronda 1 de 3.** Pruebas del 5-nov-2026. No se tocó código de producción: solo `tests/` y `docs/validacion/`.

> **Ronda 2 (sobre `df825ef`): los 6 defectos quedan cerrados y las 14 HDU están CERTIFICADAS. Ver la sección «Ronda 2» al final.** Lo que sigue es la ronda 1.

## Veredicto (ronda 1)

**4 HDU nuevas: 2 CERTIFICADAS (E5-B06, E5-B07) y 2 OBSERVADAS (E5-F06, E5-F07). De las 6 HDU modificadas, 5 CERTIFICADAS y 1 OBSERVADA (E5-F02). 6 defectos abiertos (DEF-E5D-01 a 06): 3 de severidad media y 3 bajas, los 6 de `q360-frontend`.** Backend y gateway no tienen defectos de producto abiertos: los 15 escenarios de E5-B07, los 9 de E5-B06 y los escenarios agregados a E5-B02, E5-B04 y E5-B05 pasan contra el stack real, también con una conexión por servicio y detrás de PgBouncer en modo transacción (salvo la latencia del emulador, ver «Pooler»). Quedan observaciones para el arquitecto y los dueños (OBS-D1 a D6), sin bloquear.

| HDU | Escenarios | Dictamen | Fundamento |
| --- | --- | --- | --- |
| E5-F06 · detalle completo | 10 | **OBSERVADA** | 8 de 10 pasan. #6 falla (DEF-E5D-01: con `detalle: null` el panel solo muestra el aviso, no lo que sí hay de la fila). #10 pasa en teclado y móvil pero axe da 1 hallazgo *serious* repetido en todo estado del panel (DEF-E5D-04, «Abrir en Jira») |
| E5-F07 · confirmar HDU por HDU | 14 | **OBSERVADA** | 13 de 14 pasan. #8 falla en un detalle (DEF-E5D-02: tras `ASIGNACIONES_INVALIDAS` el estado de la fila queda «No se pudo confirmar» y no «Incompleta»); la HDU no se crea y el campo se limpia como pide el backlog |
| E5-B06 · detalle en la consulta | 9 | **CERTIFICADA** | 9 de 9. Una búsqueda por página con los `fields` de D196, mapeo completo, criterios `CAMPO`/`DESCRIPCION`/`null`, saneamiento y límites, datos raros sin `CON_ERROR`, lectura con 401/403/404/409/410 sin llamar a Jira, retención en todas las salidas, presupuesto y consulta anterior |
| E5-B07 · asignación por HDU | 15 | **CERTIFICADA** | 15 de 15. Analista único, 0/2+/inactivo/supervisión cerrada, crear una HDU, `repetida`, dos Administradores a la vez (4 rondas), `FILA_MODIFICADA`, `FILA_EN_CURSO`, `HDU_YA_ASIGNADA`, validación, lote y permisos. El #6 se resuelve a favor del contrato (OBS-D4) |
| E5-F05 (ajustada, +#14, #15) | 13 + 2 | **CERTIFICADA** | Las 6 pruebas ajustadas (T03, T06, T07, T09, T10, T14) y T29 pasan; #14 y #15 pasan |
| E5-B05 (ajustada, +#15) | 14 + 1 | **CERTIFICADA** | T31 y `E5-GW#5` con las 10 rutas; #4, #6, #10, #13, #15 pasan |
| E5-B02 (+#5, #6) | 4 + 2 | **CERTIFICADA** | Presupuesto de llamadas y `yaAsignada` en CAMBIO y SIN_CAMBIOS |
| E5-F02 (+#4) | 5 + 1 | **OBSERVADA** | #4 falla (DEF-E5D-03): el diálogo de reemplazo no informa «N HDU ya creadas se conservan» |
| E5-F04 y E5-B04 (+#5) | 4+1 y 4+1 | **CERTIFICADA** | Chip «Una HDU», filtro `alcance` en portal y API, invariante de D141 con `leidas = 1` |
| E5-F01, F03, B01, B03 | regresión | **CERTIFICADA** (F03 con reserva OBS-5) | Verde en la corrida completa salvo F03 T14, el intermitente conocido OBS-5 (ver «Regresión»); F01, B01 y B03 sin reservas |

Resumen: **CERTIFICADA 11 (B06, B07, F05, B05, B02, F04, B04, F01, F03 con reserva OBS-5, B01, B03) · OBSERVADA 3 (F06, F07, F02) · NO VERIFICABLE 0.** De los 55 escenarios nuevos o agregados (48 de las 4 HDU nuevas más 7 agregados), **51 pasan y 4 no** (F06#6, F06#10 por axe, F07#8, F02#4).

## Cifras

| Corrida (stack propio, base `q360_e5d`, conexión directa con `connection_limit=1`) | Resultado |
| --- | --- |
| E5 API completa (`e5-api`) | 147 pruebas: 146 pasan, 1 falla (E5-B05 T28, intermitente conocido; 3 de 3 verdes al repetirla, ver OBS-D3) |
| `e5-b07` T20 (añadida después de esa corrida) | pasa |
| E5 portal completo (`e5-e2e`) | 146 pruebas: 139 pasan, 7 fallan: los defectos (F06#6, F07#8, F02#4 y los 3 casos de axe de DEF-E5D-04) y E5-F03 T14 (OBS-5: pasó en las dos primeras corridas completas y falló en la final y en 5 intentos aislados posteriores, con la base ya más grande tras las regresiones; ver «Regresión») |
| Pruebas nuevas de esta ronda | API 35 (E5-B06 15, E5-B07 20) y portal 39 (F06 15, F07 20, axe 4) |
| Unitarias del portal (FD7: `e5Asignacion`, `e5Consulta`, `e5Detalle`, `e5ConfirmacionFila`) | 91 de 91 |
| Regresión `api` (E1–E3, modelo de datos, seguridad, login) | 116 pasan, 1 omitida (`E1-B01#3`, límite del proveedor), 1 falla por el entorno (ver «Regresión») |
| Regresión `e2e` (E1–E3 portal) | 132 pasan, 1 falla por el entorno (recuperación de contraseña, puerto del portal) |
| E7 API / portal | 68 + 119 pasan, 8 omitidas (valores absolutos de base pura, no certifican); 1 falla de API por colisión de puertos y pasa al repetirla |
| E4 API / portal | 81 + 67 pasan; 6 fallas por colisión de puertos que pasan al repetirlas (12 de 12 y 14 de 14) |

Pruebas omitidas o saltadas: ninguna cuenta como certificada.

## Entorno

- **Stack real, sin mocks:** Supabase local (Docker, Auth y Postgres reales), Organización, Certificaciones, Impedimentos e Integraciones del build de `4d48647` (migración `20261106000000_e5_detalle_hdu` aplicada), gateway y portal (Vite). Semillas `seed`, `seed:e7`, `seed:e4` y `seed:e5`. Jira simulado en :4010.
- **Aislamiento (otra sesión usaba :3000–:3004 y :5173):** puertos propios (gateway 3200 con límites de escritura alzados, gateway de API 3210 con los tres cubos alzados, servicios 3201–3204, portal 5273) y base propia `q360_e5d` en el mismo Postgres, creada con `infrastructure/db/001_esquemas_roles.sql`, con tablas `auth.users` (copia de la de Supabase, necesaria para las pruebas que la leen) y `storage.objects` (esquema vacío para el caso de aislamiento). Las cuentas de Auth son las del Supabase local compartido (la semilla las vincula sin cambiar su clave).
- **Conexión:** las `DATABASE_URL` de los servicios terminan en `&connection_limit=1`, como en la nube. Las pruebas leen la base por `DATABASE_URL_DUENO` (la de `q360_e5d`).
- **PgBouncer 1.26 real, modo transacción** (`edoburu/pgbouncer`, `server_reset_query = DISCARD ALL`, el mismo emulador de DEF-E5C-05): comprobado que `SET search_path` no sobrevive a la transacción. Segunda pila de servicios (Organización, Impedimentos, Integraciones, dos gateways y portal en 3230–3240 y 5373) con `DATABASE_URL` por el pooler (`pgbouncer=true&options=-c search_path=public`).
- Ajustes del arnés (solo `tests/`): puertos y rutas fijos pasan a variables de entorno (`GATEWAY_REAL_URL`, `LOGS_E5_DIR`, `PUERTO_ALT_IMPEDIMENTOS`, `PUERTO_ALT_CERTIFICACIONES`; la consulta directa de E4-B02 T12b y T35 de E5-B05 usan la configuración del entorno en vez de `localhost:3003` y `…/postgres`).

## Pruebas ajustadas y arnés nuevo

| Cambio | Detalle |
| --- | --- |
| Jira simulado (`tests/support/jira-falso/servidor.ts`) | Devuelve `created`, `updated`, `duedate`, `resolutiondate`, `parent` (con `hierarchyLevel`), `startDate` de sprint y el campo «Acceptance Criteria» (`customfield_10050`) solo si el `fields` de la búsqueda los pide, como Jira. `/field` lista ese campo (`POST /__campos` lo quita). `/__solicitudes` registra `fields` y `bytes` de cada respuesta. Se cargan **a pedido** con `POST /__detalle` (no en la base, para no mover los conteos de QTY de las pruebas certificadas): QTY-15 (20 KB de ADF con `media`, macro, `<script>`, `<b>`, `<img onerror>`, enlace `javascript:`, tabla con `=cmd`, caracteres de control), QTY-16 (vacía), QTY-17 (25 etiquetas, 3 sprints, épica, vencimiento y campo de criterios) y QTY-18 (criterios en un encabezado); con `pesado`, el proyecto PESADO (100 issues de 20 KB). Desvío del plan: el plan los ponía en la base; al hacerlo, QTY pasaba de 11 a 15 filas y rompía conteos certificados |
| `tests/support/e5d.ts`, `e5dui.ts` | Rutas nuevas, arnés (ADM2, QE5, **QE6 con ANA5 inactiva y ANA6 activa**, equipos descartables), proxy que reenvía el upsert y corta la respuesta, ayudas de portal y axe |
| `e5-f05-asignacion.spec.ts` | «Confirmar (N)» → «Confirmar marcadas (N)» (T10, T12, T14); T09 con el texto nuevo de `ayuda-sin-analistas`; T14 y T29 usan QE1 (dos analistas) para seguir viendo «falta: analista», porque con QE2 el analista queda asignado solo. T03, T06, T07 ya pasaban analista explícito |
| `e5-b05-consulta-asignacion.spec.ts`, `e5-gateway.spec.ts` | T31 y E5-GW#5 con las **10** rutas de la consulta (suman `GET …/items/{itemId}` y `POST …/items/{itemId}/confirmaciones`). T07, T08, T10, T11 ya mandaban el analista explícito y pasan sin cambios; T11 mantiene `FILA_NO_ASIGNABLE` en `SIN_CAMBIOS` |

## Escenarios nuevos

Cada fila es una prueba ejecutada. Archivos: `tests/api/e5-b06-detalle.spec.ts`, `tests/api/e5-b07-confirmacion-fila.spec.ts`, `tests/e2e/e5-f06-detalle.spec.ts`, `tests/e2e/e5-f07-confirmacion-fila.spec.ts`, `tests/e2e/e5-a11y-detalle.spec.ts`. Evidencia: salida de Playwright de la corrida (`tests/logs-e5d/`, no versionada) y capturas en `docs/validacion/evidencia-e5-detalle/`.

### E5-B06 · Detalle en la consulta (API)

| ID | Prueba | Resultado real |
| --- | --- | --- |
| B06#1 | T01 | **Pasa.** Una `search/jql` por página (1 con 15 issues; BIG hace `ceil(leidas/50)`), ninguna otra ruta de Jira (ni `issue/{clave}`, `field` ni `project`), `fields` con los 12 campos de D196 más el de criterios, sin `expand` ni `renderedFields` |
| B06#2 | T02 | **Pasa.** QTY-17: prioridad Highest → CRITICA, 20 de 25 etiquetas con `etiquetasTotal 25`, 3 sprints CERRADO/ACTIVO/FUTURO con inicio y fin, épica QTY-100, fechas en UTC, `urlJira`; cumple `DetalleItemConsulta` |
| B06#3 | T03 | **Pasa.** QTY-17 `CAMPO`, QTY-18 `DESCRIPCION` (la descripción conserva todo), QTY-16 `null`; leer el detalle no llama a Jira. Sin el campo en `/field` (`campo_criterios` queda NULL) QTY-17 ya no es `CAMPO`; con el campo repuesto vuelve `customfield_10050` |
| B06#4 | T04 | **Pasa.** QTY-15 (20 KB): texto plano ≤ 8.000 con `truncado: true`, sin `<script>`/`<b>`/`<img>`/`onerror`/`javascript:`, `media` y macro como «[contenido no mostrable]», enlace `http` como «texto (url)», tabla «Campo · Valor», `=cmd` literal, control eliminado, fila `NUEVA` (no `CON_ERROR`), ≤ 40.960 bytes |
| B06#5 | T05 | **Pasa.** Fechas no ISO, `duedate` en otro formato, padre que no es épica, sprint sin fechas, `labels` que no es lista, criterios que no son ADF: todo `null` o vacío y las dos issues siguen `NUEVA` (solo QTY-11 con error) |
| B06#6 | T06, T07 | **Pasan.** 200 con Jira caído y 0 llamadas; 403 a QE1, QE2, ANA1, LID1, AUD1; 401; 404 con consulta o fila inexistente y con `itemId` de otra consulta; 400 con un id que no es UUID; 409 con la consulta cerrada; 410 con vigencia de 2 s |
| B06#7 | T08, T12 | **Pasan.** Marca única en épica y criterios: ni en ejecución, detalle de ejecución, consulta, auditoría, HDU ni registros de los servicios; filas purgadas al confirmar, reemplazar y descartar. T12 (base): CHECK de 40 KB, tipo objeto, `analista_auto` exige analista, `aplicada` exige alcance, `revision ≥ 1`, `creadas ≥ 0`, `campo_criterios` varchar(30), `alcance HDU` no cambia, y solo `consulta_item` tiene la columna `detalle` |
| B06#8 | T09, T13 | **Pasan.** 100 issues de 20 KB con Jira a 1 s por página: EXITOSA en 2,2 s, 100 filas con detalle; Jira `LENTO`: `FALLIDA/JIRA_TIEMPO_AGOTADO` sin consulta ni filas; presupuesto de 1,5 s: `INCOMPLETA/PRESUPUESTO_DE_TIEMPO` con 50 filas completas y «Continuar» termina en 100. T13 mide el peso (sección siguiente) |
| B06#9 | T10 | **Pasa.** `detalle: null` con 200, la fila sigue asignable y confirmable |
| B05#15 | T11 | **Pasa.** El listado trae `yaAsignada`, `revision`, `analistaAuto`, `aplicada` y no trae el detalle |
| B02#5, #6 | T16, T17 | **Pasan.** 429 con 2 reintentos y una búsqueda por página; `estado-codigos.analista` y `yaAsignada` en CAMBIO y SIN_CAMBIOS (con y sin Analista) |

### E5-B07 · Asignación por HDU (API contra el gateway real)

| ID | Prueba | Resultado real |
| --- | --- | --- |
| B07#1 | T01, T17 | **Pasan.** QE2 (ANA3 sola) y QE6 (1 activa + 1 inactiva): `analistaAuto true`, `revision` y `version` suben, también en el PATCH en grupo; cambiar a QE1 recalcula. Contrato interno: `asignaciones/validar` con `proponerAnalista` da `analistasActivos` y `analistaPropuesto` solo si es 1; credencial de servicio 403, sin sesión 401 |
| B07#2 | T02 | **Pasa.** QE5 (0) y QE1 (2): `analistaId null` sin error; QE6: la activa; supervisión cerrada no cuenta |
| B07#3 | T03 | **Pasa.** Explícito se respeta (`analistaAuto false`, incluso en QE2); `ANALISTA_FUERA_DE_EQUIPO` y `ANALISTA_INVALIDO`; un rechazo no cambia la fila |
| B07#4 | T04 | **Pasa.** 200 `CREADA` con Jira caído y 0 llamadas; HDU con célula, QE2, ANA3 y sprint; historial inicial de asignación; auditoría `CREAR_HDU` con `consultaId`; fila `aplicada` con `aplicacion.alcance HDU`; `version` sube y `venceEn` no cambia; cumple `ResultadoConfirmacionFila` |
| B07#5 | T05 | **Pasa.** `ASIGNACION_INCOMPLETA` con `detalles`; `FILA_NO_ASIGNABLE` en SIN_CAMBIOS, CAMBIO y CON_ERROR; 6 cuerpos mal formados 400; ninguna HDU |
| B07#6 | T06, T07 | **Pasan.** `yaAsignada` al consultar; PATCH de asignación y POST sobre CAMBIO/SIN_CAMBIOS = **422 `FILA_NO_ASIGNABLE`** (decisión en OBS-D4); sobre una NUEVA que dejó de serlo, PATCH 422 y POST 409 `HDU_YA_ASIGNADA`; marcar una CAMBIO sigue igual |
| B07#7 | T07 | **Pasa.** 409 `HDU_YA_ASIGNADA` con `{idHistoria, qe, analista}` **actuales** (QE1 y ANA2), cumple `ErrorHduYaAsignada`; la HDU del QE no cambia, no hay segunda auditoría; la fila queda `yaAsignada` y desmarcada |
| B07#8 | T08, T19 | **Pasan.** Dos Administradores a la vez, 4 rondas: exactamente un 200 y un 409 (en las 4, ADM1 recibió `FILA_EN_CURSO` y ADM2 el 200); una HDU y una auditoría por código; el reintento del ganador es 200 `repetida` y el del otro sigue 409 `HDU_YA_ASIGNADA`. T19: con la fila tomada, 409 `FILA_EN_CURSO` sin crear; la toma vence a los 2 s y entonces crea |
| B07#9 | T09 | **Pasa.** 409 `FILA_MODIFICADA` con la fila actual, nada creado; con la `revision` nueva crea |
| B07#10 | T10 | **Pasa.** Analista desactivado, analista que cambió de equipo y QE desactivado: 409 `ASIGNACIONES_INVALIDAS` con una fila y el motivo, nada escrito, fila desmarcada con el campo limpio y la toma liberada |
| B07#11 | T11, T20 | **Pasan.** (a) Organización crea y se pierde la respuesta: 503 `SERVICIO_NO_DISPONIBLE`, toma liberada, el reintento es 200 `repetida: true` con una HDU, una auditoría y una ejecución; (b) Organización cortada: 503, sin HDU, toma liberada. T20: lote con Organización más lenta que el tiempo límite: 60 de 60 HDU sin duplicar (OBS-D3) |
| B07#12 | T12, T18 | **Pasan.** El lote omite lo aplicado una a una y no lo cuenta (`leidas 2`), cierra con `creadas 4`; con cero pendientes 422 `SIN_SELECCION`. T18: con 1 HDU por fila y un lote cortado, `creadas` suma fila y lote (26), `marcadasNuevas` incluye lo aplicado (61) y `marcadasNuevas − creadas = pendientes` (35) |
| B07#13 | T13, T14 | **Pasan.** La consulta sigue ABIERTA con `venceEn` intacto; reemplazar y descartar conservan las HDU y dejan `creadas` en la consulta cerrada; al vencer (2,5 s) la HDU creada permanece y la fila siguiente da 410 |
| B07#14 | T15 | **Pasa.** 401, 403 (también con ids ajenos, antes del 404), 404, 400 (campo extra), 409 y 422 en el orden documentado; sin secretos en los registros; cubo propio: 120 POST pasan y desde el 121 hay 429 (el cubo de escritura general sería de 30) |
| B07#15 | T16 | **Pasa.** Ejecución `CONFIRMACION` cerrada con `alcance HDU`, `leidas 1`, detalle con la asignación en nombres, visible a Administrador y Auditor; QE1 ve la ejecución pero su fila como oculta y QE2 la ve; filtro `alcance` separa HDU de LOTE; 400 con un valor inválido; LID1 y ANA1 403 |

### E5-F06 · Detalle (portal contra el stack real)

| ID | Prueba | Resultado real |
| --- | --- | --- |
| F06#1 | T01 | **Pasa.** Panel `role=dialog`, `aria-modal`, con todos los campos, «Abrir en Jira» (`_blank`, `noopener`), «Datos de Jira del…», 0 llamadas a Jira; Enter sobre el código abre QTY-18 con «Tomados de la descripción» |
| F06#2 | T02 | **Pasa.** CAMBIO con «Título: … → …», SIN_CAMBIOS, CON_ERROR con el motivo; sin selectores ni «Confirmar asignación» |
| F06#3 | T03 | **Pasa.** Seis secciones «Sin … en Jira» y cuatro fechas «—» |
| F06#4 | T04 | **Pasa.** A 1280 y 375: «Texto recortado; ver completo en Jira», «Ver todo» con `aria-expanded`, bloque con scroll interno y `tabindex=0`, «+N más en Jira», título de 200, sprint de 80 y etiquetas largas sin scroll horizontal |
| F06#5 | T05 | **Pasa.** `window.__xss` indefinido, 0 diálogos, 0 elementos `script/b/img/iframe/object/embed` en el panel y en «Ver descripción», 0 enlaces `javascript:` o `data:`, 0 manejadores `on*` en el documento; `<script>` y `<b>html</b>` se ven como texto; lista y tabla en orden |
| F06#6 | T06 | **FALLA** (DEF-E5D-01) |
| F06#7 | T07 | **Pasa.** Con el panel abierto y la consulta descartada, la siguiente acción cierra el panel, deja 0 texto de Jira y ofrece «Consultar Jira» |
| F06#8 | T08 | **Pasa.** `error-detalle` con `role=alert`, «No se pudo cargar el detalle», la tabla sigue usable y «Reintentar» muestra el detalle |
| F06#9 | T09 ×4 | **Pasan.** QE1, LID1, ANA1 y AUD1: ni «Ver detalle» ni panel ni petición de detalle con 200 |
| F06#10 | T10, T11 + axe | **Pasan T10 y T11:** foco en «Cerrar», 80 Tab y Shift+Tab sin salir, Esc devuelve el foco, «Detalle de QTY-2», «Anterior»; a 375 px la hoja ocupa el ancho, objetivos ≥ 44 px, sin desborde. **El axe falla** (DEF-E5D-04) |
| F05#15 | T12 | **Pasa.** «Ver detalle» desde las cuatro familias de filas |

### E5-F07 · Confirmar una a una (portal contra el stack real)

| ID | Prueba | Resultado real |
| --- | --- | --- |
| F07#1 | T01 | **Pasa.** Con QE1 el selector lista solo ANA1 y ANA2, «Elige un analista del equipo de…», «Incompleta (falta: analista)» y el botón con `aria-disabled` y su motivo |
| F07#2 | T02 | **Pasa.** QE2: ANA3 asignada, aviso «Asignado automáticamente: único analista de…», anuncio, «Lista», sobrevive a recargar; QE1 limpia y lo anuncia; QE6 asigna ANA6; elegido a mano quita el aviso |
| F07#3 | T03 | **Pasa.** QE5 y único inactivo: «Este QE no supervisa analistas activos. Elige otro QE.», sin opciones y sin confirmar; QE6 lista solo a la activa |
| F07#4 | T04 | **Pasa.** Fila «Creada» de solo lectura con «Asignada a… / …» (`data-qe`, `data-analista`), «Ir a la HDU» (`/hdu/<id>`, que el Administrador ve), anuncio, foco en el «Ver detalle» de la fila siguiente, «1 creada», consulta abierta, 0 llamadas a Jira |
| F07#5 | T05 | **Pasa.** Alerta con `data-qe`, `data-analista`, `data-id-historia`, `role=note` al cargar, «/ sin Analista» y con Analista, sin selectores ni confirmar, enlace a la HDU, contador, y completa en el panel con el apoyo |
| F07#6 | T06 | **Pasa.** `role=alert` con los nombres actuales, fila de solo lectura, foco en el título de la alerta, anuncio «No se creó nada», la HDU del QE intacta |
| F07#7 | T07 | **Pasa.** `aviso-fila-modificada` (`role=alert`), la fila toma el analista de ADM2, no crea; al confirmar de nuevo crea con ese valor |
| F07#8 | T08 | **FALLA** (DEF-E5D-02) |
| F07#9 | T09 | **Pasa.** El doble clic hace 1 solicitud; si se pierde la respuesta: «No se pudo confirmar…» con «Reintentar», la HDU ya existe y reintentar deja «Creada» sin duplicar ni auditar dos veces |
| F07#10 | T10, T16 | **Pasan.** «Confirmar marcadas (2)» con 2 creadas una a una, texto de coexistencia, sin «Continuar confirmación», resultado «2 HDU ya estaban creadas y no se repitieron». T16 (BIG, servidor real): «Confirmar marcadas (60)» con 1 creada; con el lote cortado aparece el aviso de incompleta; tras recargar sigue habiendo camino para terminar; 61 HDU sin duplicar (supuestos del portal, ver abajo) |
| F07#11 | T11 | **Pasa.** Consulta reemplazada por ADM2: aviso con el motivo y «Consultar Jira», lo ya creado permanece |
| F07#12 | T12 | **Pasa.** «Descartar» sin creadas, «Terminar revisión» con creadas; «2 HDU ya creadas se conservan; M filas sin confirmar se perderán.», «Seguir revisando» no cierra, «Terminar revisión» cierra y conserva |
| F07#13 | T13 ×4 | **Pasan.** QE1, LID1, ANA1 y AUD1 sin «Confirmar asignación» y 403 por API |
| F07#14 | T17 + axe | **Pasa.** Orden de foco Seleccionar → código → Ver detalle → Célula → QE → Analista → Sprint → Incluir → Confirmar; a 375 px controles ≥ 44 px, «Confirmar» a ancho completo, selectores apilados, sin desborde. El axe de la fila creada, el error de la fila, la alerta y el diálogo de «Terminar revisión» no da hallazgos propios (el único es el de DEF-E5D-04 en el panel) |
| F05#14 | (F07 T05) | **Pasa.** Alerta en SIN_CAMBIOS y CAMBIO |
| F02#4 | T14 | **FALLA** (DEF-E5D-03) |
| F04#5 | T15 | **Pasa.** Chip «Una HDU» en la ejecución y el filtro por alcance (HDU deja el chip, LOTE lo quita) |

### Los supuestos del portal que se pidió verificar

| Supuesto | Resultado |
| --- | --- |
| (a) «Continuar confirmación» frente a filas creadas una a una | **Se cumple con el servidor real.** Con 1 HDU por fila y 60 marcadas, `aplicadas 1` y `pendientes 60` no son un lote incompleto y el portal no muestra «Continuar confirmación»; el portal lo decide por `creadas > 0`. Tras un lote cortado (`creadas 26`, `aplicadas 26`, `pendientes 35`) y recargar la página, el portal sigue ofreciendo cómo terminar («Confirmar marcadas (35)», que continúa el lote) y se cierra con 61 HDU sin duplicar. Efecto: con `creadas > 0`, tras recargar, el camino es «Confirmar marcadas» y no «Continuar confirmación» (no se pierde nada) |
| (b) `marcadasNuevas` incluye las aplicadas y N resta `creadas` | **Se cumple.** `marcadasNuevas = 61`, `creadas = 26` (suma las de fila y las de lote), `pendientes = 35` y `marcadasNuevas − creadas = pendientes` antes y después del lote |

## Peso de la página de Jira (D196) y recomendación

Medido contra el Jira simulado con 50 issues por página y con los mismos `fields` que antes y que ahora (`tests/api/e5-b06-detalle.spec.ts`, T13 y T09):

| Perfil | Antes | Ahora | Aumento |
| --- | --- | --- | --- |
| BIG (descripciones de unos 20 caracteres) | 18.263 B | 22.863 B | ×1,25 |
| PESADO (descripciones de 20 KB) | 1.118.272 B | 1.125.472 B | ×1,01 |

El aumento por los campos nuevos (`created`, `updated`, `duedate`, `resolutiondate`, `parent`, criterios) es de unos 4,6 KB (liviana) a 7,2 KB (pesada) por página de 50: **la descripción ya viajaba completa antes de este cambio**, así que lo que pesa es el texto, no el cambio. Consulta real de 100 issues pesadas con Jira a 1 s por búsqueda:

| `INTEGRACIONES_JIRA_TAMANO_PAGINA` | Peticiones | Bytes por página | Tiempo | Detalle guardado |
| --- | --- | --- | --- | --- |
| 50 (defecto) | 2 | 1,125 MB cada una | 2,3 s | 860.684 B (8,6 KB por fila, acotado por el recorte de 8.000) |
| 25 | 4 | 0,563 MB cada una | 4,4 s | igual |

**Recomendación: dejar 50.** (1) El cambio casi no agrega peso; (2) con 25 el número de llamadas por tanda se duplica (más 429 posibles y la tanda de 100 usa 4,4 s de los 8 s del presupuesto con Jira a 1 s, contra 2,3 s); (3) el peor caso medido (50 issues de 20 KB, 1,1 MB) cabe en el tiempo por petición de 3 s con un Jira local, pero no se midió contra Jira Cloud real. La variable queda como palanca: bajar a 25 solo si en producción aparecen `JIRA_TIEMPO_AGOTADO` por páginas pesadas. Las 500 filas del tope pesarían como máximo 4,3 MB de detalle en la base (bien bajo los 20 MB de D198).

## Accesibilidad y revisión visual (1280 y 375 px)

Estados revisados con axe (WCAG 2.0/2.1 A y AA; se piden 0 hallazgos *serious* o *critical*) y con captura (`docs/validacion/evidencia-e5-detalle/`): panel completo, vacío y hostil; fila con asignación automática; alerta «ya asignada» en la lista (Sin cambios y Cambiaron) y en el panel; error de red al confirmar; error de asignación inválida; error al cargar el detalle; fila creada; resumen con «Confirmar marcadas» y «Terminar revisión» y su diálogo.

| Hallazgo | Estado |
| --- | --- |
| axe: `label-content-name-mismatch` (serious) en «Abrir en Jira» en todo estado del panel, a 1280 y 375 | DEF-E5D-04 |
| Ningún otro hallazgo de axe en ninguno de los estados; sin desborde horizontal a 375 px; objetivos táctiles ≥ 44 px en la hoja, la fila y el botón de confirmar | Pasa |
| Visual: «Cerrar» se parte en vertical («Cerra / r») en el encabezado del panel a 1280 y 375; el sprint futuro se ve «2 ene——» | DEF-E5D-05 |
| Visual 375: la alerta compacta de Cambiaron y Sin cambios queda junto al título y lo reduce a unos 30 px («Filt / rar / por / fec / ha») | DEF-E5D-06 |
| Visual: fila creada en verde con «Creada», «Asignada a… / …» e «Ir a la HDU»; alerta ámbar con glifo, texto en negrita y enlace en botón de 44 px; error rojo con glifo `✕` y texto; en 375 el error de asignación inválida repite «Falta: analista» sobre y bajo el botón (parte de DEF-E5D-02) | Revisado |

## Pooler (PgBouncer en modo transacción, una conexión por servicio)

| Corrida | Resultado |
| --- | --- |
| `e5-b06` + `e5-b07` (46 pruebas) | 43 pasan. 3 fallan por latencia del emulador, no por el cambio: T09 (presupuesto de 1,5 s), T18 y T20 (lotes con una instancia extra de Integraciones y tiempo límite por defecto). Con `ORGANIZACION_TIMEOUT_MS=30000` y presupuesto de 60 s, T18 pasa |
| `e5-f06` + `e5-f07` (46 pruebas, portal 5373) | 42 pasan; 3 fallan por los defectos (F06#6, F07#8, F02#4) y 1, F07#10 T16 (lote cortado), por la misma latencia |
| Rutas principales por el pooler | Detalle, `yaAsignada`, confirmar una fila, `repetida`, carrera de dos Administradores, `FILA_MODIFICADA`, `FILA_EN_CURSO`, `ASIGNACIONES_INVALIDAS`, permisos y registro: pasan |

Medición de la latencia (`tests/logs-e5d/lote25.mjs`): el upsert de 25 filas `CREAR` tarda **1,3 s directo y 5,1 s por el emulador**, es decir, justo sobre el tiempo límite por defecto de Organización (5 s). Es la misma causa que en DEF-E5C-05 / OBS-6. En la nube el pooler (Supavisor) añade mucha menos latencia por transacción que el emulador con `DISCARD ALL` sobre Docker, y no se midió contra la nube.

## Regresión

| Proyecto | Resultado | Fallas y por qué |
| --- | --- | --- |
| `api` (E1–E3, modelo de datos, seguridad, login) | 116 pasan, 1 omitida | `seguridad-aislamiento-esquemas` «[E6] svc_indicadores»: este stack no tiene el servicio Indicadores (no existe en la rama), así que no existe `indicadores.snapshot_indicadores`; no es del cambio |
| `e2e` (E1–E3) | 132 pasan | Recuperación de contraseña: Supabase solo admite `redirect_to` en `127.0.0.1:5173` y el portal propio está en :5273; entorno |
| `e7-api` / `e7-e2e` | 68 + 119 pasan; 5 + 3 omitidas (valores absolutos de base pura) | `E7-B04#3 T11` falló porque la pila de la prueba usa el puerto fijo 3202, ocupado por mi Certificaciones; con `PUERTO_ALT_CERTIFICACIONES` pasa (12 de 12) |
| `e4-api` / `e4-e2e` | 81 + 67 pasan | 6 pruebas de «fuente caída» chocaron con mi Impedimentos en :3203 (y una con `localhost:3003` fijo, el stack de la otra sesión); con los puertos configurables pasan (17 de 17 y 14 de 14) |
| E5 completo | ver «Cifras» | `E5-F03 T14` (OBS-5 conocido: 250 filas con Organización lenta y 2,5 s de presupuesto; cada pasada gasta el presupuesto en releer las ~150 filas ya existentes, a unos 10 ms por fila, y no avanza. La ruta de importación de archivos no cambió en este cambio: `integraciones.servicio.ts` solo consulta a la HDU existente por `consultaId`, que el CSV no manda. Pasó en las dos primeras corridas con la base chica y falla desde que la base creció con las regresiones; no se corrió contra el código anterior, así que «no es regresión» queda sin demostrar, solo sin evidencia en contra) y `E5-B05 T28` (OBS-D3) |

Rutas modificadas de Organización (`asignaciones/validar`, `estado-codigos`, `hdu/upsert`) quedan cubiertas por E5-B07 T17, T04, T08, T11 y T20 y por E5-B03 T13 y E5-B05 T13, T21 (verdes). **No se corrieron** las suites de node de los servicios (`npm test -w services/…`): truncan la base a la que apunta su `.env.test` y el Postgres local es compartido con otra sesión.

## Defectos

| ID | Dueño | Severidad | Escenario | Descripción y reproducción |
| --- | --- | --- | --- | --- |
| DEF-E5D-01 | `q360-frontend` | Media | E5-F06#6 | **Con `detalle: null` el panel no muestra lo que sí hay de la fila.** Reproducción: consultar Jira; con el dueño de la base `UPDATE integraciones.consulta_item SET detalle = NULL WHERE id_consulta = '<id>'` (simula una consulta abierta antes del despliegue); abrir `/admin/integraciones/sincronizar` y «Ver detalle» en QTY-1. Esperado (backlog F06#6, diseño §2.7): título, descripción corta, prioridad, estado y responsable más el aviso. Obtenido: solo el título del encabezado y el aviso; no aparecen descripción corta, prioridad, estado ni responsable (`PanelDetalleHdu.tsx` pinta el cuerpo solo si `detalle`). Prueba: `e5-f06-detalle.spec.ts` F06#6 T06 |
| DEF-E5D-02 | `q360-frontend` | Baja | E5-F07#8 | **Tras `ASIGNACIONES_INVALIDAS` el estado de la fila es «✕ No se pudo confirmar», no «Incompleta».** Reproducción: crear un QE con un analista, dejar la fila «Lista» (asignación automática), desactivar al analista (`PATCH /v1/usuarios/{id} {"activo":false}`) y pulsar «Confirmar asignación». El mensaje «<Analista> ya no está disponible.» sale, el campo se limpia y la HDU no se crea, pero el estado sigue en error (`data-estado="error"`) y «Falta: analista» aparece dos veces (sobre y bajo el botón). Prueba: F07#8 T08 |
| DEF-E5D-03 | `q360-frontend` (con `q360-integraciones` y `q360-arquitecto` por el contrato) | Media | E5-F02#4 | **El diálogo de reemplazo no dice «N HDU ya creadas se conservan».** Reproducción: crear una HDU con «Confirmar asignación» y pulsar «Consultar Jira»: el diálogo dice «…con 1 fila asignada. Si la reemplazas, se pierden las asignaciones.». `ErrorConsultaAbierta` (409 `CONSULTA_ABIERTA`) no trae `creadas`; `GET /consultas/actual` sí (`consulta.creadas`), así que el portal puede leerlo de ahí o el contrato sumar el campo. Prueba: F02#4 T14 |
| DEF-E5D-04 | `q360-frontend` (el diseño §2.5 fija ese nombre accesible: avisar a `q360-arquitecto`) | Media (axe *serious*) | E5-F06#10, F07#14 | **«Abrir en Jira» incumple WCAG 2.5.3.** El texto visible es «Abrir en Jira ↗» y el `aria-label` «Abrir QTY-17 en Jira (se abre en otra pestaña)» no lo contiene. axe: `label-content-name-mismatch` en `a[data-testid=enlace-abrir-jira]`, en cada estado del panel y a 1280 y 375. Arreglo: «Abrir en Jira: QTY-17 (se abre en otra pestaña)» o texto visible «Abrir QTY-17 en Jira». Pruebas: `e5-a11y-detalle.spec.ts` (3 de 4 casos) |
| DEF-E5D-05 | `q360-frontend` | Baja | E5-F06#10 (visual) | El botón «Cerrar» del encabezado del panel se parte en vertical («Cerra / r») a 1280 y 375 (`panel-completo-1280.png`, `panel-completo-375.png`); un sprint futuro sin fin se ve «2 ene——» |
| DEF-E5D-06 | `q360-frontend` | Baja | E5-F05#14 (visual 375) | A 375 px la alerta compacta de Cambiaron y Sin cambios se coloca junto al título y lo aprieta (~30 px, «Filt / rar / por / fec / ha»); el diseño §5.3 la pone en una segunda línea (`alerta-lista-375.png`) |

## Observaciones (sin defecto)

| ID | Tema | Detalle |
| --- | --- | --- |
| OBS-D1 | Saneamiento | El panel sanea la descripción larga, pero la descripción corta de la fila (`item.descripcion`, la que se compara y se crea en la HDU), las etiquetas, la épica y los sprints conservan el texto tal cual, incluido `<script>` o `<b>html</b>`. Es el comportamiento certificado de E5 y el portal lo pinta como texto (0 elementos ejecutables ni manejadores, verificado en el DOM), así que no hay riesgo hoy; cualquier otro consumidor debe escapar |
| OBS-D2 | Lote y fila tomada | Si una fila marcada la tiene tomada otra petición en ese momento, el lote la omite sin contarla y, si no quedan otras marcadas, cierra la consulta `CONFIRMADA` y la purga (D203/D205). La confirmación de esa fila en vuelo crea la HDU pero ya no puede marcar la fila (el reintento da 409 `CONSULTA_NO_ABIERTA`). Es coherente con D205, pero el Administrador que confirmaba esa fila recibe un error aunque la HDU quede creada |
| OBS-D3 | Contadores tras una respuesta perdida | Si Organización escribe un lote y responde después del tiempo límite, la repetición clasifica lo ya escrito como `OMITIDA`/`HDU_CREADA_DESPUES` (T20: pasadas FALLIDA 0, INCOMPLETA 25 omitidas, INCOMPLETA 25, EXITOSA 10): las 60 HDU existen, una auditoría cada una, pero `creadas` de la ejecución y del historial queda corto. La fila a fila resuelve lo mismo con `repetida` (OD3); el lote no. Es la causa del intermitente de `E5-B05 T28` bajo carga (suma 180 de 205), que se repite en verde 3 de 3 |
| OBS-D4 | Backlog frente a contrato | (1) E5-B07#6 dice 409 `HDU_YA_ASIGNADA` al confirmar una fila `CAMBIO`/`SIN_CAMBIOS` con `yaAsignada`; el backend responde **422 `FILA_NO_ASIGNABLE`**. Se decide **a favor del contrato** (`integraciones.v1.yaml`: el orden es 422 `FILA_NO_ASIGNABLE` si no es `NUEVA` antes del 409 `HDU_YA_ASIGNADA`) y del propio #5 del backlog (no `NUEVA` = 422); el 409 es para una `NUEVA` que dejó de serlo. Corrige el backlog `q360-arquitecto`. (2) E5-B07#11 dice 503 `ORGANIZACION_NO_DISPONIBLE`; el contrato y el servicio dan 503 `SERVICIO_NO_DISPONIBLE`. (3) E5-B07#8 admite `FILA_EN_CURSO` para el que pierde: es lo que ocurrió en las 4 rondas |
| OBS-D6 | Aviso de lote incompleto | Justo después de un lote cortado el portal muestra un instante «Se aplicaron 1 de 61» (la cifra de antes del lote) y pocos segundos después «26 de 61»; la prueba espera el valor correcto. Cosmético |
| OBS-D5 | Latencia y lote de 25 | El upsert de 25 filas con una conexión y pooler en modo transacción roza el tiempo límite de Organización (5,1 s frente a 5 s en el emulador; 1,3 s directo). Conviene que `q360-backend` y `q360-integraciones` confirmen el margen en la nube (tamaño del lote o `ORGANIZACION_TIMEOUT_MS`) |

## Límites

- No se probó contra un Jira real (E5-MAN-01 sigue pendiente del usuario), ni contra el Supavisor de Supabase ni la nube; el pooler es PgBouncer 1.26 con `DISCARD ALL`.
- El peso de la página es del Jira simulado: no mide la latencia ni el límite de Atlassian.
- El Jira simulado cobra `maxResults` como máximo 50: probar 100 por página no es posible con él.
- No se corrieron E6 ni las suites de node de los servicios (comparten Postgres con otra sesión).
- Revisión visual: capturas de Chromium de escritorio (1280 y 375 px) leídas a mano, sin Safari ni lector de pantalla real.
- La máquina estuvo cargada por otra sesión durante la corrida final del portal (27 min contra 9): explica el intermitente F03 T14 y la duración.

## Reproducibilidad

Stack: `npm run build` de los seis workspaces y migraciones sobre `q360_e5d`; servicios con `node --env-file=<servicio>/.env <servicio>/dist/main.js` y los puertos propios; gateway de API con `LIMITE_TASA_MAX`, `LIMITE_TASA_ESCRITURA_MAX` y `LIMITE_TASA_CONSULTA_MAX` en 100000; portal con `npm run dev -w apps/web -- --port 5273 --strictPort`. Pruebas desde `tests/` con `PORTAL_URL`, `GATEWAY_URL`, `INTEGRACIONES_URL`, `DATABASE_URL_DUENO`, `LOGS_E5_DIR` y los puertos alternos exportados. Salidas en `tests/logs-e5d/` (no versionadas).

## Ronda 2

Código: `df825ef` (ronda 1 más las correcciones de `q360-frontend` para DEF-E5D-01 a 06; backend y gateway sin cambios). Pruebas del 5 y 6-nov-2026 sobre un stack real nuevo: base propia con `auth.users` y `storage`, puertos propios (3200–3210, 5273), una conexión por servicio y, para las rutas principales, PgBouncer 1.26 en modo transacción (3230–3240, 5373). No se tocó código de producción.

### Veredicto de la ronda 2

**14 HDU CERTIFICADAS, 0 OBSERVADAS, 0 NO VERIFICABLES. Los 6 defectos están CERRADOS. Defectos abiertos: ninguno.** E5-F06, E5-F07 y E5-F02 pasan de OBSERVADA a CERTIFICADA. Queda la reserva OBS-5 sobre E5-F03 T14 (ver abajo) y las observaciones OBS-D1 a D6 de la ronda 1, sin cambios.

| Defecto | Verificación | Resultado |
| --- | --- | --- |
| DEF-E5D-01 (F06#6) | `e5-f06` T06 en el navegador: con `detalle: null` el panel muestra título, descripción corta, prioridad, estado y responsable más el aviso | **Cerrado** |
| DEF-E5D-02 (F07#8) | `e5-f07` T08: tras `ASIGNACIONES_INVALIDAS` la fila queda «Incompleta (falta: analista)»; captura `error-asignacion-invalida-375.png`: un solo «Falta: analista» y el error rojo bajo el botón | **Cerrado** |
| DEF-E5D-03 (F02#4) | `e5-f07` T14: el diálogo de reemplazo informa «N HDU ya creadas se conservan» | **Cerrado** |
| DEF-E5D-04 (axe) | `e5-a11y-detalle` 4 de 4 casos a 1280 y 375 px, 0 hallazgos serious o critical (panel completo, vacío, hostil, alerta, errores, fila creada, diálogo) | **Cerrado** |
| DEF-E5D-05 (visual) | Captura `panel-completo-375.png`: «Cerrar» en una línea y el sprint futuro se ve «2 ene» | **Cerrado** |
| DEF-E5D-06 (visual 375) | Captura `alerta-lista-375.png`: el título «Filtrar por fecha» ocupa su línea y la alerta va en una segunda línea a todo el ancho, con «Ir a la HDU» en botón de 44 px | **Cerrado** |

La revisión visual de DEF-E5D-05 y 06 la hice yo, leyendo las capturas regeneradas a 1280 y 375 px (`docs/validacion/evidencia-e5-detalle/`).

### Cifras de la ronda 2

| Corrida | Resultado |
| --- | --- |
| Verificación de los defectos (`e5-f06`, `e5-f07`, `e5-a11y-detalle`, que incluye F02#4) | 50 de 50 |
| E5 API completa (backend y gateway sin cambios) | 148 de 148 (T28 incluido, verde) |
| E5 portal completo | 146 pruebas: 145 pasan, 1 falla: E5-F03 T14 (ver abajo). Las demás, incluidas las de los defectos, pasan |
| Pooler: `e5-b06` + `e5-b07` (API) | 45 de 46. Falla T20 (lote con Organización lenta; tiempo límite de 5 s frente a 5,1 s del emulador, OBS-D5). T09 y T18, que fallaron en la ronda 1 por lo mismo, pasan esta vez |
| Pooler: `e5-f06` + `e5-f07` + `e5-a11y-detalle` (portal) | 50 de 50 |

### E5-F03 T14

- **En la corrida completa del portal falla** (dos intentos, `INCOMPLETA` en vez de `EXITOSA`), igual que en la ronda 1.
- **En aislamiento pasa:** 1 de 1 con `--retries=0` en 21,8 s. También pasa con `e5-a11y-detalle` + `e5-f03` (31 de 31) y con `e5-a11y`, `e5-f01`, `e5-f02` y `e5-f03` en la misma corrida (66 de 66, sin reintentos).
- **No corrí la comparación contra `821fe32`**: la instrucción era hacerla solo si fallaba en aislamiento, y no falló. Queda sin explicar por qué falla únicamente en la corrida completa (después de la API completa y de los archivos previos); la ruta de importación de archivos no cambió en este cambio. Se mantiene como OBS-5, con la reserva de que no se demostró con el código anterior.

### Limpieza

Procesos detenidos (puertos 3200–3240 y 5273/5373), contenedor `q360-pgb-e5d` y base `q360_e5d` eliminados, `.env` locales borrados.
