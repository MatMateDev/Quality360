# Épica 5 · Detalle de la HDU y asignación una a una

Fecha: 2026-11-05. Complemento de `e5-consulta-asignacion.md` (E5 consulta, certificada y publicada) y de `e5-integracion-jira.md`. Mismo formato: F = frontend, B = backend; escenarios Contexto (Dado) → Evento (Cuando) → Resultado esperado (Entonces). Las secciones que se citan sin archivo (4.2, 5, 6, 9, 10) son las de `e5-consulta-asignacion.md`.

Alcance: refinamiento y criterios de aceptación. No hay código ni casos de prueba detallados (los escribe `q360-qa` a partir de los escenarios). Decisiones nuevas: **D196–D207** (las D153–D195 ya las usa E6; ver sección 2), registradas con ajustes del arquitecto en `docs/arquitectura/decisiones-mvp.md` y en el ADR 0018: donde difieren, mandan esos dos. Nota del arquitecto: los escenarios agregados a E5-B02 son #5 y #6 (E5-B02 tenía 4) y los agregados son 7, no 6; los encabezados de E5-F06/F07 y E5-F04/B04 se normalizaron al formato `### <HDU> ·` que lee `npm run contracts:check`.

Pedido del usuario (2026-11-05, literal): «al apretar consultar Jira, debería traer el detalle de cada HDU (toda la información) para poder asignar al QA que tiene asignado el QE correspondiente, entonces al traer la HDU, se asigna al QA y se confirma la asignación y queda guardado. En caso de que ya fue asignado la hdu, debe arrojar el mensaje DE ALERTA».

## 1. Resumen

- **Qué se pide:** (1) cada fila de la consulta tiene un **panel de detalle** con todo lo que Jira trae de la HDU; (2) al elegir el QE, el Analista sale de **sus supervisados vigentes** y, si es uno solo, queda asignado; (3) cada HDU nueva tiene su propio **«Confirmar asignación»**, que la crea con su asignación y la deja guardada; (4) si la HDU **ya existe con QE o Analista**, se muestra una **alerta** con quién la tiene y no se puede reasignar desde la consulta.
- **Qué ya existe y se reutiliza (no se rehace):** consulta guardada (D133), clasificación (D136), coherencia QE–Analista del equipo vigente (D138), `GET /v1/catalogos/personas?supervisorId=` (D147), `asignaciones/validar` y `hdu/upsert` de Organización (D140, D151), versión de la consulta (D139), historial y auditoría (D141).
- **Respuesta corta al presupuesto de Jira:** el detalle **no necesita otra llamada**. La búsqueda `search/jql` que ya hace «Consultar Jira» acepta la lista de campos (`fields`) y devuelve el detalle completo de las 50 issues de la página en la misma respuesta. Se agregan campos a esa lista; el número de llamadas, las tandas de 100, los 8 s y el 429 no cambian (D196). Abrir el panel y confirmar **no llaman a Jira** (D132 se mantiene).
- **HDU:** 4 nuevas (**E5-F06**, **E5-F07**, **E5-B06**, **E5-B07**) y 5 modificadas (**E5-F05**, **E5-B05**, **E5-F02**, **E5-B02**, **E5-F04/B04**, solo escenarios aditivos o ajustados). Ver sección 9.
- **Confirmación grupal:** **se conserva** como «Confirmar marcadas (N)» (D203). Justificación en la sección 3.
- **No bloquea nada:** no hay preguntas abiertas que impidan construir; las dudas razonables quedan como supuestos reversibles S6–S9 (sección 11).

### 1.1 Qué cambia respecto de la consulta publicada

| Punto | Consulta publicada | Este cambio | Decisión |
| --- | --- | --- | --- |
| Texto de Jira por fila | Título ≤ 200 y descripción ≤ 1.000 (sirven para comparar y crear) | Se suma un **detalle** completo por fila (hasta 8.000 caracteres de descripción más los demás campos); título y descripción de 1.000 siguen siendo lo que se compara y se crea | D196, D197, D198 |
| Campos pedidos a Jira | `summary, description, priority, issuetype, status, assignee, labels` + Sprint | Suma `created, updated, duedate, resolutiondate, parent` y el campo de criterios si está detectado | D196, D199 |
| Analista al elegir QE | Se limpia y se elige de la lista del equipo | Se limpia y, **si el QE tiene exactamente un Analista activo**, se asigna solo | D201 |
| Confirmar | Solo en lote («Confirmar (N)») | Por fila **y** en lote | D202, D203 |
| HDU que ya existe | Aparece en «Cambiaron» o «Sin cambios» (con chip «Creada a mano» si corresponde) | Además muestra la **alerta «Esta HDU ya fue asignada a <QE> / <Analista>»** y la asignación queda bloqueada | D204 |
| Vida de la consulta | Se cierra al confirmar el lote | Con confirmaciones por fila la consulta **sigue abierta** hasta que el Administrador la termine, se descarte, venza o se reemplace; lo creado se conserva siempre | D205 |

## 2. Decisiones nuevas (propuestas, a la espera del visto bueno del arquitecto)

**Numeración:** el usuario pidió «D153+», pero `decisiones-mvp.md` ya registra D153–D195 (corrida E6). Para no duplicar identificadores se propone **D196–D207**.

| ID | Decisión | Motivo |
| --- | --- | --- |
| D196 | **El detalle viaja en la misma llamada de la consulta.** `camposPedidos` suma `created, updated, duedate, resolutiondate, parent` (épica) y, si está detectado, el campo de criterios (D199); el campo Sprint ya se pide. **Prohibido** el `GET /rest/api/3/issue/{clave}` por HDU (100 llamadas por tanda reventarían los 8 s y el 429, D96/D105/D135) y `expand=renderedFields` (HTML de Jira: más peso y sin control del saneamiento). El puerto `FuenteJira` es de interfaz fija: `IssueJira` crece con campos opcionales y se avisa a `q360-backend` | Cero llamadas extra; mismo presupuesto de E5 |
| D197 | **«Toda la información» = los campos del pedido:** resumen, descripción, criterios de aceptación, estado, prioridad (valor de Jira y la de Quality360 equivalente), tipo, responsable en Jira, etiquetas, sprint(s) con estado y fechas, épica (clave y título) y fechas (creación, actualización, vencimiento, resolución), más el enlace «Abrir en Jira». **Queda fuera:** comentarios, adjuntos, subtareas, enlaces entre issues, historial y worklogs (exigen otras llamadas o `expand`); se registra como mejora futura | Delimitar «todo» a lo que cabe en una llamada |
| D198 | **Almacenamiento y saneamiento del detalle.** Nueva columna `consulta_item.detalle jsonb NULL` (≤ 40 KB por fila, 500 filas ≈ 20 MB como máximo, purgado con la fila). Excepción acotada a D104/D123, igual que D133: se purga al cerrarse, vencer, reemplazarse o descartarse la consulta, y **no** se copia a la HDU, a la auditoría ni al historial. Todo texto pasa por `adfATexto` y `limpiarControl` (ya existentes): se guarda **texto plano**, nunca HTML ni ADF crudo; las listas y tablas mantienen su forma; los nodos `media`, macros y extensiones se reemplazan por «[contenido no mostrable]»; solo se conservan enlaces `http`/`https`. Límites: descripción 8.000, criterios 4.000, título de épica 200, 20 etiquetas de 50, 10 sprints, con indicador `truncado` por campo. El portal pinta con texto (nunca `dangerouslySetInnerHTML`) y respeta saltos con `white-space: pre-wrap` | Aunque Jira es de confianza, el texto lo escribe cualquiera; D104/D122 |
| D199 | **Criterios de aceptación.** Jira Cloud no tiene un campo estándar. Orden de búsqueda: (1) un campo personalizado detectado por nombre («Acceptance Criteria», «Criterios de aceptación») con la **misma** respuesta de `/rest/api/3/field` que ya usa `detectarCampoSprint` al probar la conexión (sin llamada nueva; se guarda como `campoCriterios`, `NULL` si no existe); (2) si no, la sección de la descripción que empieza en un encabezado «Criterios de aceptación» / «Acceptance criteria» hasta el siguiente encabezado; (3) si no, «Sin criterios de aceptación en Jira». La sección se **muestra** aparte; la descripción conserva su texto completo | Dar un resultado determinista sin depender de cómo configure cada sitio Jira |
| D200 | **Ruta de detalle:** `GET /v1/integraciones/jira/consultas/{id}/items/{itemId}` (Administrador). El listado de filas **no** incluye el detalle (peso). Filas de una consulta creada antes de este cambio devuelven `detalle: null` y el portal avisa «Esta consulta es anterior al detalle completo; consulta Jira de nuevo» sin romper nada | Listados livianos; compatibilidad con consultas abiertas al desplegar |
| D201 | **Analista único se asigna solo.** Al fijar `qeId` por `PATCH …/items` sin `analistaId`, Organización (dueña de la supervisión, D151) cuenta los Analistas **activos del equipo vigente** del QE (`Supervision` con `hasta IS NULL`, `id_supervisor = qeId`, `Usuario.activo`): con **exactamente 1** devuelve su id (`proponerAnalista` en `asignaciones/validar`) y la fila queda con él y `analistaAuto: true`; con 0 o con 2 o más, el analista queda vacío (D138). Rige igual en la asignación en grupo. Un supervisado inactivo **no cuenta**. Si el Administrador manda `analistaId`, se respeta y se valida | Pedido del usuario; una sola dueña de la regla |
| D202 | **Confirmar una HDU:** `POST /v1/integraciones/jira/consultas/{id}/items/{itemId}/confirmaciones`, cuerpo `{revision}`. Solo filas `NUEVA` completas (no exige estar «marcada»: el clic es la intención). Orden: sesión y permiso → consulta `ABIERTA` y vigente → fila (existe, no aplicada) → `revision` vigente (409 `FILA_MODIFICADA`, devuelve la fila actual) → toma atómica de la fila (`aplicando_desde`, expira a los 30 s) → `asignaciones/validar` → `hdu/upsert` modo `CREAR` con la asignación → marca `aplicada`. **No toma el candado global** de «consulta o confirmación en curso» (si no, un Administrador bloquearía al otro y a su propio lote); la exclusión es por fila. Es **idempotente** por (`consultaId`, código): si Organización ya creó la HDU de esta misma fila y Integraciones no alcanzó a marcarla, reintentar devuelve `CREADA` en vez de error. Va en el cubo de límite propio de D152 (una persona que confirma 40 HDU por minuto no debe recibir 429) | Pedido del usuario; dos Administradores; reintentos |
| D203 | **La confirmación grupal se conserva** y pasa a llamarse **«Confirmar marcadas (N)»**. Conserva D140 sin cambios de regla y suma: omite las filas ya `aplicadas` o en `aplicando` (no son un error ni cuentan en N) y, sin filas marcadas pendientes, responde 422 `SIN_SELECCION` como hoy. Justificación en la sección 3 | Escala (hasta 500 filas, una asignación grupal D139/D145); cero regresión sobre lo certificado |
| D204 | **HDU ya asignada: alerta y bloqueo.** Una HDU «ya asignada» es una que **existe** en Quality360 con QE responsable (toda HDU lo tiene, D54) y/o Analista. `hdu/estado-codigos` suma `analista` (nombre o `null`) y la fila guarda `yaAsignada {idHistoria, qe, analista}` (nombres, instantánea de la clasificación). Mensaje fijo, con `role="alert"`: **«Esta HDU ya fue asignada a <QE> / <Analista>»**; sin Analista: «… a <QE> / sin Analista». Mientras la alerta exista, la fila no admite célula, QE, Analista ni sprint (`PATCH` → 422 `HDU_YA_ASIGNADA`) ni «Confirmar asignación». La reasignación se hace en la gestión de HDU (E2-F02 para el Analista, E7-B05/D54 para el QE) con un enlace «Ir a la HDU». La instantánea puede quedar vieja: la **autoridad es Organización al confirmar** (409 `HDU_YA_ASIGNADA` con los nombres **actuales**, que el portal pinta en la fila). Aplica a `NUEVA` que dejó de serlo, `CAMBIO` y `SIN_CAMBIOS` (incluida `CERRADA`) | Pedido del usuario; coherente con D140 (nunca se tocan QE ni Analista de una existente) |
| D205 | **Consulta con confirmaciones por fila.** Confirmar una HDU no cierra la consulta ni la renueva (24 h desde la última llamada a Jira, D134). Sube su `version` y actualiza `asignadas`/`creadas`. Se cierra por «Confirmar marcadas» (D140), por **«Terminar revisión»** (descarta lo pendiente; es el «Descartar» actual con otro texto cuando ya hay HDU creadas), por vencimiento o por reemplazo. **Lo ya creado nunca se deshace**: el diálogo de reemplazar/descartar muestra «N HDU ya creadas se conservan; M filas sin confirmar se perderán» | Evita perder lo hecho y mantiene el contrato de estados de D134 |
| D206 | **Historial por fila.** Cada confirmación por fila registra una ejecución `fase CONFIRMACION` con nueva columna `alcance` (`LOTE` por defecto, `HDU`), `leidas = 1` y su fila de detalle con `asignacion`, de modo que el invariante de D141 se cumple. La auditoría `CREAR_HDU` y la entrada inicial del historial de asignación son las de D141. E5-F04 muestra el chip «Una HDU» y permite filtrar por `alcance` | Trazabilidad quién asignó qué, sin un camino de auditoría paralelo |
| D207 | **Panel de detalle accesible.** Escritorio: panel lateral modal (`role="dialog"`, `aria-modal`, título enlazado, foco atrapado, Esc cierra y devuelve el foco al botón de la fila). Móvil (≤ 640 px): hoja a pantalla completa y la tabla pasa a tarjetas. Objetivos táctiles ≥ 44 px, sin scroll horizontal a 320 px (`overflow-wrap: anywhere`), contraste AA, estado por texto además de color, anuncios por `aria-live="polite"` (asignación automática, creada) y `role="alert"` (ya asignada, errores), respeta `prefers-reduced-motion`. Botones «Anterior» y «Siguiente sin asignar» para avanzar sin cerrar | D35, D131 |

## 3. Por qué se conserva la confirmación grupal

| Criterio | Solo por fila | Fila y lote (decidido) |
| --- | --- | --- |
| Escala | 230 filas = 230 confirmaciones (el caso `BIG` del backlog) | Un clic para lo que ya se asignó en grupo |
| Lo certificado | Retira E5-B05 #6, T10, T23, T28, T30 y el panel de grupo (D139, D145) | Se conservan; solo cambia el texto del botón |
| Seguridad | Cada HDU se valida sola | Igual, y el lote pre-valida todo antes de escribir (D140) |
| Esfuerzo de revisión | Alguien que quiere mirar cada detalle lo hace una a una | Quien quiere revisar usa el panel; quien confía en una regla usa el lote |
| Costo | — | Una regla más: el lote ignora lo ya aplicado (D203) |

Consecuencia visible: la fila nueva tiene **«Confirmar asignación»** y, arriba de la tabla, **«Confirmar marcadas (N)»**. Ambos escriben por el mismo camino de Organización; no hay dos lógicas.

## 4. Catálogos

### 4.1 Códigos de error nuevos (suman a 4.2 del documento de consulta)

| Código | HTTP | Cuándo |
| --- | --- | --- |
| `HDU_YA_ASIGNADA` | 409 al confirmar; 422 al editar | La HDU existe con QE o Analista (trae `qe`, `analista`, `idHistoria`, `asignadaPor` si se conoce) |
| `FILA_MODIFICADA` | 409 | Confirmar una fila con una `revision` que ya no es la actual (trae la fila actual) |
| `FILA_EN_CURSO` | 409 | Otra persona está confirmando esa misma fila en este momento |
| `DETALLE_NO_DISPONIBLE` | 200 con `detalle: null` | Fila de una consulta anterior a este cambio (no es error HTTP) |

Se reutilizan: `ASIGNACIONES_INVALIDAS` (409, con una sola fila), `CONSULTA_VENCIDA` (410), `CONSULTA_NO_ABIERTA` (409), `ACCESO_DENEGADO` (403), `ORGANIZACION_NO_DISPONIBLE`, `FILA_NO_ASIGNABLE`, `FILA_NO_MARCABLE`.

### 4.2 Campos nuevos de la fila

`consulta_item` suma: `detalle jsonb NULL` (D198), `revision integer NOT NULL DEFAULT 1` (sube con cada cambio de la fila), `analista_auto boolean DEFAULT false`, `aplicando_desde timestamptz NULL`, `ya_asignada jsonb NULL` (`{idHistoria, qe, analista}`), y `id_historia` pasa a llenarse para **toda** fila cuya HDU exista (hoy solo `CAMBIO`). `ejecucion_integracion` suma `alcance varchar(4) NOT NULL DEFAULT 'LOTE'` (CHECK `LOTE`/`HDU`). `configuracion` suma `campo_criterios varchar(20) NULL`. Migración `<fecha>_e5_detalle_hdu`, aditiva, sin FK a otro esquema (D24); la RLS de la nube no cambia (tablas ya cubiertas por `006`), pero se repite el `REVOKE` si se crean columnas en tablas con permisos por columna.

### 4.3 Forma del detalle (`DetalleHdu`)

`resumen`, `descripcion {texto, truncado}`, `criterios {texto, origen: CAMPO|DESCRIPCION|null, truncado}`, `estadoJira`, `prioridadJira`, `prioridadQ360`, `tipo`, `responsableJira`, `etiquetas[] {valor}` + `etiquetasTotal`, `sprints[] {nombre, estado, inicio, fin}`, `epica {clave, titulo} | null`, `fechas {creada, actualizada, vencimiento, resolucion}` (ISO 8601 o `null`), `urlJira`. Los textos ausentes son `null`, nunca cadena vacía.

## 5. Presupuesto de la API de Jira

| Pregunta | Respuesta |
| --- | --- |
| ¿La llamada única de la consulta trae el detalle? | **Sí.** `GET /rest/api/3/search/jql` con `fields=` devuelve en cada issue todos los campos pedidos. Se amplía la lista de campos (D196) |
| ¿Hace falta otra llamada? | **No**, ni por HDU ni por tanda. Tampoco para el campo de criterios: se detecta con la respuesta de `/field` que ya se pide al probar la conexión |
| ¿Cambia el número de llamadas? | No. Mismo `TAMANO_PAGINA` (50), tanda de 100, presupuesto 8 s, 3 s por petición y 429 con hasta 2 reintentos (D135) |
| ¿Qué sí cambia? | El **peso** de cada página (descripciones ADF completas). Estimación: 50 issues × hasta 20 KB ≈ 1 MB por página, antes ≈ 0,3 MB. Mitigación: si una página no cabe en 3 s, el comportamiento actual (`JIRA_TIEMPO_AGOTADO`, tanda `INCOMPLETA`, «Continuar consulta») ya lo cubre; la certificación mide con el falso `LENTO` y descripciones de 20 KB, y si no cabe se baja `TAMANO_PAGINA` a 25 mediante variable de entorno, sin cambiar la lógica |
| ¿Abrir el panel o confirmar llama a Jira? | No (D132). El panel lee la base propia; si el dato está viejo se vuelve a consultar |
| ¿Datos que Jira cambia después de consultar? | El panel muestra lo guardado y la fecha/hora de la consulta («Datos de Jira del <fecha y hora>»). No hay botón «actualizar esta HDU» en este cambio |

## 6. Frontend: detalle completo de la HDU

### E5-F06 · Administrador (nueva): detalle completo de la HDU

Quiero abrir, desde cada fila de la consulta, el detalle completo que Jira trae de la HDU. Para decidir a quién asignarla sin salir de Quality360 ni volver a Jira.

| # | Criterio | Contexto (Dado) | Evento (Cuando) | Resultado esperado (Entonces) |
| --- | --- | --- | --- | --- |
| 1 | Abrir el detalle | Hay una consulta abierta con filas en cualquier grupo. | Pulsa «Ver detalle» de una fila (o Enter sobre su código). | Se abre un panel con: resumen, descripción, criterios de aceptación, estado, prioridad (la de Jira y la equivalente en Quality360), tipo, responsable en Jira, etiquetas, sprint(s) con estado y fechas, épica, fechas (creación, actualización, vencimiento, resolución), «Abrir en Jira» y «Datos de Jira del <fecha y hora>». Sin llamar a Jira. |
| 2 | Filas de otros grupos | La fila es «Cambiaron», «Sin cambios» o «Con error». | Abre el detalle. | Se ve el detalle igual; «Cambiaron» muestra además antes → después; «Con error» muestra el motivo y lo que haya llegado. Los controles de asignación aparecen solo en filas nuevas. |
| 3 | Campos vacíos | La issue no trae descripción, criterios, etiquetas, épica, sprint, responsable o fechas. | Abre el detalle. | Cada sección se muestra con «Sin <campo> en Jira»; nada queda en blanco ni se omite; las fechas inválidas o ausentes se ven como «—». |
| 4 | Texto largo | La descripción supera 8.000 caracteres, el título supera 200, hay más de 20 etiquetas o una palabra sin espacios muy larga. | Abre el detalle. | La descripción se corta con el aviso «Texto recortado; ver completo en Jira» y enlace; etiquetas sobrantes como «+N más»; el contenido se ajusta al ancho y el panel hace scroll interno, sin scroll horizontal. |
| 5 | Contenido peligroso | La descripción trae `<script>`, `<b>`, `<img onerror>`, un enlace `javascript:`, una celda que empieza con `=`, o ADF con imágenes, macros y tablas. | Abre el detalle. | Todo se ve como **texto**; no se ejecuta nada; los enlaces `javascript:` no son enlaces; las imágenes y macros dicen «[contenido no mostrable]»; las listas y tablas conservan su orden. |
| 6 | Consulta anterior al cambio | La consulta se abrió antes del despliegue y no tiene detalle guardado. | Abre el detalle. | Se muestra lo que sí hay (título, descripción corta, prioridad, estado y responsable) y el aviso «Consulta anterior al detalle completo; consulta Jira de nuevo». |
| 7 | Consulta vencida, reemplazada o descartada | El panel está abierto y la consulta deja de estar vigente, o se abre desde una pestaña vieja. | Navega a otra HDU o pulsa cualquier acción. | Se avisa con el motivo (como E5-F05 #8), el panel se cierra, no queda texto de Jira en pantalla y se ofrece «Consultar Jira». |
| 8 | Error al cargar | El servicio falla o la red se corta al pedir el detalle. | Abre el detalle. | `role="alert"` «No se pudo cargar el detalle» con «Reintentar»; la tabla sigue usable. |
| 9 | Permisos | El usuario no es Administrador. | Intenta la ruta o la acción. | Acceso denegado (403); QE, Líder, Analista y Auditor no ven ni «Ver detalle» ni el panel (D142). |
| 10 | Accesibilidad y móvil | Teclado, lector de pantalla o pantalla de 320 px. | Abre, recorre y cierra el panel. | Foco atrapado en el panel y devuelto al botón de la fila al cerrar; Esc cierra; encabezados por sección; en móvil el panel es una hoja a pantalla completa, sin scroll horizontal y con objetivos táctiles ≥ 44 px (D207). |

Contenido de pantalla: `boton-ver-detalle` (en la fila), `panel-detalle-hdu`, `detalle-resumen`, `detalle-descripcion`, `detalle-criterios`, `detalle-estado`, `detalle-prioridad`, `detalle-tipo`, `detalle-responsable`, `detalle-etiquetas`, `detalle-sprints`, `detalle-epica`, `detalle-fechas`, `enlace-abrir-jira`, `aviso-texto-recortado`, `aviso-detalle-antiguo`, `error-detalle`, `boton-anterior`, `boton-siguiente-sin-asignar`, `boton-cerrar-detalle`.

## 7. Frontend: asignar y confirmar HDU por HDU

### E5-F07 · Administrador (nueva): asignar y confirmar HDU por HDU

Quiero elegir el QE y su Analista de una HDU nueva y confirmar la asignación de esa HDU. Para que quede creada y guardada en el momento y seguir con la siguiente.

| # | Criterio | Contexto (Dado) | Evento (Cuando) | Resultado esperado (Entonces) |
| --- | --- | --- | --- | --- |
| 1 | QE con varios analistas | El QE elegido supervisa 2 o más Analistas activos. | Abre el selector de Analista. | Solo lista a esos Analistas (supervisión vigente); el campo queda en «Elige un analista del equipo de <QE>» y la fila en «Incompleta (falta: analista)». |
| 2 | QE con un solo analista | El QE elegido supervisa exactamente un Analista activo. | Elige el QE. | El Analista queda asignado y se anuncia «Asignado automáticamente: único Analista de <QE>»; la fila queda «Lista» (si célula y sprint están). Cambiar de QE recalcula. |
| 3 | QE sin analistas, o con uno inactivo | El QE no supervisa a nadie, o su único supervisado está inactivo. | Elige el QE. | Se explica «Este QE no tiene analistas activos en su equipo» y no se puede confirmar. Si supervisa uno activo y otro inactivo, se asigna el activo. |
| 4 | Confirmar la asignación | La fila está «Lista». | Pulsa «Confirmar asignación». | El botón queda deshabilitado en «Confirmando…»; la HDU se crea con célula, QE, Analista y sprint; la fila pasa a «Creada» con «Asignada a <QE> / <Analista>» y deja de editarse; el foco pasa a la siguiente fila sin asignar y se anuncia «HDU <código> creada». La consulta sigue abierta. No se llama a Jira. |
| 5 | Ya asignada al consultar | La HDU ya existe en Quality360 con QE o Analista. | Ve la fila o abre su detalle. | Alerta fija y visible, no solo en color: **«Esta HDU ya fue asignada a <QE> / <Analista>»**; selectores y «Confirmar asignación» deshabilitados; enlace «Ir a la HDU» para reasignar en la gestión de HDU. Si no tiene Analista: «… a <QE> / sin Analista». |
| 6 | Se asignó mientras revisaba | Otro Administrador, o un QE creando la HDU a mano, la dejó asignada después de la consulta. | Pulsa «Confirmar asignación». | No se crea ni se pisa nada; aparece la alerta de #5 con los nombres **actuales**; la fila queda de solo lectura. |
| 7 | La fila cambió | Otra persona editó esa fila después de que la vi. | Pulsa «Confirmar asignación». | Se avisa «Otra persona modificó esta HDU»; se muestra la fila actual; no se crea; confirma de nuevo con lo que ve. |
| 8 | La asignación dejó de ser válida | El Analista se desactivó, cambió de equipo, o el QE se desactivó. | Pulsa «Confirmar asignación». | No se crea; se indica el motivo («<Analista> ya no está disponible» / «ya no pertenece al equipo de <QE>»); se limpia el campo afectado y la fila vuelve a «Incompleta». |
| 9 | Falla del servicio o doble clic | Organización no responde, se corta la red, o se pulsa dos veces. | Pulsa «Confirmar asignación». | Con falla: «No se pudo confirmar» con «Reintentar» y la fila intacta; reintentar no duplica (si ya se creó, queda «Creada»). El doble clic dispara una sola solicitud. |
| 10 | Confirmar marcadas | Hay filas nuevas marcadas, algunas ya creadas una a una. | Pulsa «Confirmar marcadas (N)». | N cuenta solo las pendientes; las ya creadas no se repiten ni dan error; se aplica D140. |
| 11 | Consulta vencida, reemplazada o descartada | La consulta deja de estar vigente. | Pulsa «Confirmar asignación». | No se crea nada; se avisa con el motivo y se ofrece «Consultar Jira»; las HDU ya creadas permanecen. |
| 12 | Terminar la revisión | Hay HDU creadas una a una y otras sin confirmar. | Pulsa «Terminar revisión». | Pide confirmar con «N HDU ya creadas se conservan; M filas sin confirmar se perderán»; al aceptar la consulta se cierra y se ofrece «Consultar Jira». |
| 13 | Permisos | El usuario no es Administrador. | Intenta confirmar. | 403; el botón no existe para otros roles. |
| 14 | Accesibilidad y móvil | Teclado, lector de pantalla o 320 px. | Recorre selectores, botón y alertas. | Orden de foco lógico; los resultados se anuncian (`aria-live`/`role="alert"`); en móvil cada fila es una tarjeta con sus controles apilados y objetivos ≥ 44 px. |

Contenido de pantalla: `boton-confirmar-asignacion` (por fila y en el panel), `aviso-analista-automatico`, `alerta-hdu-ya-asignada` (con `data-qe`, `data-analista`), `enlace-ir-a-hdu`, `chip-creada`, `aviso-fila-modificada`, `error-confirmar-asignacion`, `boton-confirmar` (texto «Confirmar marcadas (N)»), `boton-terminar-revision`.

## 8. Backend

### E5-B06 · Administrador (nueva): detalle de la HDU en la consulta

Quiero que la consulta guarde, en la misma lectura de Jira, el detalle de cada HDU de forma segura. Para mostrarlo sin volver a llamar a Jira.

| # | Criterio | Contexto (Dado) | Evento (Cuando) | Resultado esperado (Entonces) |
| --- | --- | --- | --- | --- |
| 1 | Una sola llamada | Se consulta un proyecto con N issues. | Se ejecuta «Consultar Jira». | Jira recibe la misma cantidad de peticiones que antes (una por página, más el reintento de 429); el parámetro `fields` incluye los campos de D196; no hay `GET /issue/{clave}` ni `expand`. |
| 2 | Mapeo completo | La issue trae todos los campos. | Se guarda la fila. | `detalle` contiene los campos de 4.3; prioridad de Jira y la equivalente; sprints con estado y fechas; épica desde `parent`. |
| 3 | Criterios de aceptación | El sitio tiene un campo de criterios, no lo tiene pero la descripción tiene el encabezado, o ninguna de las dos. | Se guarda la fila. | Origen `CAMPO`, `DESCRIPCION` o `null` respectivamente; la descripción conserva todo su texto; sin llamada nueva a Jira. |
| 4 | Saneamiento y límites | La descripción trae HTML, ADF con `media`, macros, enlaces `javascript:`, caracteres de control o más de 8.000 caracteres. | Se guarda la fila. | Se guarda texto plano; sin etiquetas ejecutables; `media`/macros como «[contenido no mostrable]»; solo enlaces `http(s)`; caracteres de control eliminados; recorte con `truncado: true`; la fila no se rechaza. |
| 5 | Datos faltantes o raros | Faltan campos, las fechas no son ISO, el `parent` no es una épica, un sprint no tiene fechas, `labels` no es una lista. | Se guarda la fila. | El campo queda `null` o vacío; la issue **no** pasa a «Con error» por esto; ninguna excepción corta la tanda. |
| 6 | Leer el detalle | Hay una consulta abierta. | `GET …/items/{itemId}`. | 200 con `DetalleHdu`; solo Administrador (403 al resto); id de otra consulta o inexistente, 404; consulta vencida, 410; no abierta, 409; sin llamar a Jira. |
| 7 | Retención | La consulta se cierra, vence, se reemplaza o se descarta. | Se purga. | El detalle desaparece con la fila; no queda en `ejecucion_integracion`, `detalle_ejecucion`, auditoría ni logs; las respuestas no llevan secretos. |
| 8 | Peso y tiempo | Una tanda de 100 issues con descripciones de 20 KB, y Jira lento. | Se consulta. | Se respeta el presupuesto de 8 s: si no cabe, la tanda termina `INCOMPLETA` con `hayMas` y «Continuar consulta» sigue; ninguna fila queda a medias. |
| 9 | Consulta anterior al cambio | Había una consulta abierta antes del despliegue. | `GET …/items/{itemId}`. | 200 con `detalle: null`; el resto de la fila funciona; las filas siguen asignables y confirmables. |

### E5-B07 · Administrador (nueva): asignación por HDU y HDU ya asignada

Quiero que el sistema asigne al Analista único del QE, cree una HDU a la vez con su asignación y no permita reasignar una HDU que ya tiene dueño. Para que lo confirmado quede guardado sin pisar a nadie.

| # | Criterio | Contexto (Dado) | Evento (Cuando) | Resultado esperado (Entonces) |
| --- | --- | --- | --- | --- |
| 1 | Analista único | El QE tiene exactamente 1 Analista activo en su equipo vigente. | `PATCH …/items` con `qeId` y sin `analistaId`. | La fila queda con ese `analistaId`, `analistaAuto true`, `version` y `revision` suben. También aplica al `PATCH` en grupo. |
| 2 | Cero, varios o inactivos | El QE supervisa 0, 2 o más, o 1 activo y otros inactivos. | Mismo `PATCH`. | 0 o 2+: `analistaId null`, sin error; 1 activo + inactivos: se asigna el activo. Un supervisión cerrada (`hasta` con fecha) no cuenta. |
| 3 | Analista explícito | Se manda `analistaId`. | `PATCH`. | Se respeta y se valida como en D138 (`ANALISTA_FUERA_DE_EQUIPO`, `ANALISTA_INVALIDO`); `analistaAuto false`. |
| 4 | Confirmar una HDU | La fila es `NUEVA`, completa y sin dueño. | `POST …/items/{itemId}/confirmaciones {revision}`. | 200: HDU creada con célula, QE, Analista y sprint; historial inicial de asignación; auditoría `CREAR_HDU` con `consultaId`; fila `aplicada`; `version` sube; sin llamar a Jira; la respuesta trae la HDU y la fila. |
| 5 | Fila incompleta o no nueva | La fila está incompleta, o es `CAMBIO`/`SIN_CAMBIOS`/`CON_ERROR`. | Mismo `POST`. | 422 `ASIGNACION_INCOMPLETA` (con `faltantes`) o 422 `FILA_NO_ASIGNABLE`; nada se crea. |
| 6 | Ya asignada al consultar | La HDU existe con QE o Analista. | `GET items` y `PATCH` sobre esa fila. | La fila trae `yaAsignada {qe, analista, idHistoria}`; el `PATCH` es 422 `HDU_YA_ASIGNADA`; el `POST` de confirmar es 409 `HDU_YA_ASIGNADA`. Un `PATCH` con `marcada` sobre `CAMBIO` sigue igual que hoy. |
| 7 | Se asignó durante la revisión | La fila era `NUEVA` y alguien creó la HDU antes (QE a mano u otro Administrador). | `POST …/confirmaciones`. | 409 `HDU_YA_ASIGNADA` con los nombres **actuales** leídos de Organización; la fila pasa a `yaAsignada` y queda de solo lectura; la HDU existente no cambia. |
| 8 | Dos Administradores confirman la misma HDU | ADM1 y ADM2 confirman la misma fila a la vez. | Ambos `POST`. | Exactamente uno recibe 200; el otro 409 `HDU_YA_ASIGNADA` (o `FILA_EN_CURSO` si aún se está escribiendo); una sola HDU, una sola auditoría `CREAR_HDU`, sin duplicados por la unicidad del código normalizado. |
| 9 | Fila modificada por otra persona | ADM2 cambió el Analista después de que ADM1 vio la fila. | ADM1 `POST` con la `revision` vieja. | 409 `FILA_MODIFICADA` con la fila actual; nada se crea. |
| 10 | Asignación que dejó de ser válida | El Analista se desactivó, cambió de equipo, o el QE se desactivó. | `POST …/confirmaciones`. | 409 `ASIGNACIONES_INVALIDAS` con una fila y el motivo; nada se escribe; la fila queda desmarcada y con el campo afectado limpio. |
| 11 | Reintento y falla parcial | Organización creó la HDU pero Integraciones no alcanzó a marcarla, o Organización no responde. | Se repite el `POST`. | Caso 1: 200 `CREADA` (idempotente por `consultaId` + código), sin duplicar. Caso 2: 503 `ORGANIZACION_NO_DISPONIBLE`; la fila no queda `aplicando` más de 30 s. |
| 12 | Coexistencia con el lote | Hay filas aplicadas una a una, marcadas y sin marcar. | `POST confirmaciones` (lote). | El lote omite lo `aplicada` y lo `aplicando`; no cuenta lo omitido; con cero pendientes, 422 `SIN_SELECCION`; el resto como D140. |
| 13 | Vida de la consulta | Hay HDU creadas una a una. | Descartar, vencer o reemplazar. | Las HDU creadas permanecen; se purgan solo las filas; los contadores informan creadas y perdidas; el estado final sigue el modelo de D134. |
| 14 | Permisos y orden de validación | No es Administrador, sin sesión, ids ajenos, campos extra. | Cualquiera de las rutas nuevas. | 401 → 403 → 404 → 400/422 de estructura → 410 → 409 → ejecución; 403 a QE/Líder/Analista/Auditor; campos desconocidos, 400; sin secretos. Va en el cubo de límite de D152. |
| 15 | Registro | Se confirma una fila. | Se registra. | Ejecución `CONFIRMACION` con `alcance HDU`, `leidas 1`, detalle con `asignacion` (nombres), visible a Administrador y Auditor; el invariante de D141 se cumple. |

## 9. HDU modificadas (cambios puntuales)

### E5-F05 · Administrador (ajustes y escenarios agregados)

| # | Cambio |
| --- | --- |
| 2 «Asignación por fila» | Agrega: «Si el QE tiene un solo Analista activo, queda asignado solo y se anuncia». |
| 4 «Coherencia» | Agrega: «Si el QE no tiene analistas activos se explica y la fila no se confirma; un supervisado inactivo no aparece». |
| 5 «Confirmar las nuevas» | El botón pasa a **«Confirmar marcadas (N)»**; N excluye las filas ya creadas una a una. |
| 8 «Consulta vencida…» | «Descartar» pasa a «Terminar revisión» cuando ya hay HDU creadas; el diálogo informa cuántas se conservan. |
| 11 «Asignación que dejó de ser válida» | Sin cambios de regla; aplica también a la confirmación por fila (E5-F07 #8). |
| 14 | (nuevo) «HDU que ya está asignada». | **Dado** una HDU de Jira que ya existe con QE o Analista. **Cuando** ve la fila (en «Cambiaron», «Sin cambios» o «Nuevas» si se creó durante la revisión). **Entonces** aparece la alerta «Esta HDU ya fue asignada a <QE> / <Analista>», sin controles de asignación y con «Ir a la HDU». |
| 15 | (nuevo) «Detalle desde la fila». | **Dado** cualquier fila. **Cuando** pulsa «Ver detalle». **Entonces** se abre el panel de E5-F06. |

### E5-B05 · Administrador (ajustes y escenarios agregados)

| # | Cambio |
| --- | --- |
| 4 «Asignación coherente» | Agrega la autoasignación del Analista único (E5-B07 #1–#3). |
| 6 «Confirmar crea» | Ahora puede haber filas ya `aplicadas` por E5-B07; el lote las omite sin error. |
| 10 «Vida de la consulta» | Agrega: una confirmación por fila no cambia el estado de la consulta; solo «Confirmar marcadas», «Terminar revisión», vencer o reemplazar la cierran. |
| 13 «Permisos» | Las 8 rutas de la consulta pasan a **10** (suma `GET …/items/{itemId}` y `POST …/items/{itemId}/confirmaciones`). |
| 15 | (nuevo) `GET items` trae `yaAsignada`, `revision`, `analistaAuto`, `aplicada` y **no** trae el detalle. |

### E5-B02 · Administrador (consulta)

| # | Cambio |
| --- | --- |
| 1 | Agrega: la lista de `fields` de la búsqueda es la de D196 y el detalle se guarda en la misma tanda. |
| 5 | (nuevo) «Presupuesto». | Igual a E5-B06 #1 y #8: más campos, **no** más llamadas, y la misma política de 429, 3 s por petición y 8 s por tanda. |
| 6 | (nuevo) «Clasificación y HDU existente». | `estado-codigos` devuelve el `analista` de la HDU existente y la fila guarda `yaAsignada` (D204) para `CAMBIO` y `SIN_CAMBIOS`. |

### E5-F02 · Administrador (consulta)

| # | Cambio |
| --- | --- |
| 4 «Ya hay una consulta abierta» | El diálogo de reemplazo agrega «N HDU ya creadas se conservan» a las «filas asignadas». |

### E5-F04 · Historial (aditivo)

| # | Cambio |
| --- | --- |
| 5 | (nuevo) | Cada confirmación por fila se ve como una ejecución de fase Confirmación con el chip «Una HDU» y se puede filtrar por `alcance`. |

### E5-B04 · Historial (aditivo)

| # | Cambio |
| --- | --- |
| 5 | (nuevo) | `GET /v1/integraciones/ejecuciones` suma el filtro y el campo `alcance`; el invariante por fase de D141 se cumple con `leidas = 1`. |

## 10. Efecto sobre servicios y contratos

### 10.1 Servicios

| Servicio | Cambio |
| --- | --- |
| **integraciones** | `cliente-jira-http.ts`: `camposPedidos` suma los campos de D196; `leerIssue` lee `parent`, fechas y sprints completos (inicio, estado, fin); `IssueJira`/`SprintJira` crecen con campos **opcionales** (el puerto es de interfaz fija: avisar a `q360-backend`). `detectarCampoSprint` pasa a detectar también el campo de criterios con la misma respuesta de `/field`. `mapearIssue` arma `DetalleHdu` con `adfATexto`, límites y saneamiento de D198; la salida actual (título ≤ 200, descripción ≤ 1.000, referencia) **no cambia**. Nuevo caso de uso «confirmar una fila» (toma atómica, `revision`, idempotencia, llamada a Organización, marcado) y lectura del detalle. Migración `<fecha>_e5_detalle_hdu` (4.2). El lote ignora filas `aplicadas`/`aplicando`. Purga ya existente cubre el detalle |
| **organizacion** | **Sin migración** (la supervisión ya existe: `Supervision` con `id_supervisor`, `id_supervisado`, `fecha_hasta` y el índice único del analista vigente, E1-F10/D190). `hdu/estado-codigos` suma `analista`. `asignaciones/validar` suma `proponerAnalista` (cuenta Analistas activos del equipo vigente del QE y devuelve el id solo si es 1). `hdu/upsert` modo `CREAR` responde 409 `HDU_YA_ASIGNADA` con los nombres actuales y es idempotente por (`consultaId`, código). Ninguna regla de E1/E2/E7 cambia; se **lee** la supervisión, no se escribe |
| **gateway** | 2 rutas nuevas, declaradas una por una (D179): `GET …/consultas/{id}/items/{itemId}` y `POST …/consultas/{id}/items/{itemId}/confirmaciones`. El `POST` entra al cubo `LIMITE_TASA_CONSULTA_MAX` (D152). Sin cambios de sesión ni de CORS. Las pruebas que enumeran las rutas de la consulta pasan de 8 a 10 |
| **web** | Pestaña «Consultar Jira»: botón «Ver detalle» y panel (D207), botón «Confirmar asignación» por fila y dentro del panel, alerta `alerta-hdu-ya-asignada`, aviso de asignación automática, estado «Creada», «Terminar revisión», texto «Confirmar marcadas (N)», tarjetas en móvil, `aria-live`. El selector de Analista usa el catálogo `supervisorId` (D147) y el valor automático que devuelve el `PATCH`. Todo el texto de Jira se pinta como texto |
| **certificaciones, impedimentos, indicadores** | Ninguno. Una HDU creada con Analista entra a sus bandejas y a E6 según su ámbito (ya ocurre con el lote) |

### 10.2 Contratos (todos aditivos)

| Archivo | Cambio |
| --- | --- |
| `integraciones.v1.yaml` | 2 rutas (arriba); esquemas `DetalleHdu`, `ConfirmacionFilaSolicitud {revision}`, `ConfirmacionFilaRespuesta`; `ItemConsulta` suma `yaAsignada`, `revision`, `analistaAuto`, `aplicada`; `PATCH` suma `analistaAuto` en la respuesta; `Ejecucion` suma `alcance` |
| `gateway.v1.yaml` | Las 2 rutas, su límite de tasa y la nota de que el `POST` usa el cubo de D152 |
| `organizacion.v1.yaml` | `estado-codigos` suma `analista`; `asignaciones/validar` suma `proponerAnalista` y devuelve `analistaId` propuesto; `hdu/upsert` suma el 409 `HDU_YA_ASIGNADA` y la idempotencia |
| `comun.v1.yaml` | `EstadoCodigoHdu.analista`; códigos `HDU_YA_ASIGNADA`, `FILA_MODIFICADA`, `FILA_EN_CURSO`; `alcance`. `npm run contracts:check` debe cubrir los escenarios nuevos |

### 10.3 Pruebas certificadas que se ajustan (a confirmar por `q360-qa`)

- **E5-F05-T03, T06, T07, T09, T10, T14** y **E5-B05-T07, T08, T10, T11**: eligen QE2 (que supervisa solo a ANA3); con D201 el Analista queda asignado solo, de modo que los pasos «fila incompleta (falta: analista)» y «ANA1 no pertenece a QE2» deben usar QE1 (dos Analistas) o enviar el Analista explícito. Texto del botón: «Confirmar (N)» → «Confirmar marcadas (N)».
- **E5-B05-T13** y **T31** (conteo de rutas: 8 → 10).
- El resto de E5, E2, E7 y E6 no cambia; se corre la regresión de E5-F05-T28 y E5-B04-T14.

## 11. Fixture, supuestos y preguntas

**Fixture (adiciones):**
- Jira simulado: QTY-15 con descripción de 20 KB y ADF con `media`, macro y `<script>`; QTY-16 sin descripción, etiquetas, épica, sprint, responsable ni fechas; QTY-17 completa (25 etiquetas, 3 sprints, épica, vencimiento, campo de criterios); QTY-18 con criterios solo como encabezado de la descripción. El falso expone `fields` pedidos en `/__solicitudes` para probar E5-B06 #1.
- Usuarios: QE1 (ANA1, ANA2), QE2 (ANA3 solo), QE5 (sin analistas) ya existen; se suma **QE6** (ANA5 inactiva y ANA6 activa, creados por la API). ADM2 para las carreras.
- HDU ya asignada: QTY-5 creada a mano por QE1 (con QE y sin Analista) y QTY-1 asignada a QE2/ANA3 por una confirmación previa.

**Supuestos reversibles (si no se objetan, rigen):**
- **S6** Criterios de aceptación por campo detectado y, si no, por encabezado de la descripción (D199).
- **S7** El detalle vive solo mientras la consulta está abierta; la HDU creada conserva título, descripción de 1.000 y enlace a Jira, no el detalle (D198). Cambiarlo exigiría una columna nueva en `historia_usuario` (E2).
- **S8** «Confirmar asignación» es solo para filas nuevas; actualizar una fila de «Cambiaron» sigue siendo marcar y «Confirmar marcadas».
- **S9** La consulta no se cierra sola al crear la última nueva; el Administrador la termina o vence en 24 h (D205).

**Preguntas abiertas que bloquean:** ninguna.

## 12. Resumen de escenarios

| HDU | Escenarios | Estado |
| --- | --- | --- |
| E5-F06 | 10 | Nueva |
| E5-F07 | 14 | Nueva |
| E5-B06 | 9 | Nueva |
| E5-B07 | 15 | Nueva |
| E5-F05, E5-B05, E5-B02, E5-F02, E5-F04, E5-B04 | 5 ajustados, 7 agregados (F05 #14–#15, B05 #15, B02 #5–#6, F04 #5, B04 #5) | Modificadas |
| **Total nuevo** | **48 escenarios nuevos + 7 agregados = 55; E5 pasa de 56 a 111** | |

## 13. Trazabilidad

| Pedido | HDU | Contrato | Decisión |
| --- | --- | --- | --- |
| Detalle completo por HDU al consultar | E5-F06, E5-B06, E5-B02 #1/#6 | `GET …/items/{itemId}`, `DetalleHdu` | D196–D200 |
| QA del QE correspondiente, asignación automática si es uno | E5-F07 #1–#3, E5-B07 #1–#3 | `PATCH …/items`, `asignaciones/validar` | D201 |
| Confirmar HDU a HDU y que quede guardada | E5-F07 #4, #9–#12, E5-B07 #4, #8–#13, #15 | `POST …/items/{itemId}/confirmaciones` | D202, D203, D205, D206 |
| Alerta si ya fue asignada | E5-F07 #5–#6, E5-F05 #14, E5-B07 #6–#7 | `yaAsignada`, `HDU_YA_ASIGNADA` | D204 |
| Accesibilidad y móvil | E5-F06 #10, E5-F07 #14 | — | D207 |
