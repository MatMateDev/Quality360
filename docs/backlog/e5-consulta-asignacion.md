# Épica 5 · Consulta de Jira y asignación de HDU

Fecha: 2026-11-02. Complemento de `e5-integracion-jira.md` (E5 certificada y publicada). Mismo formato: F = frontend, B = backend; escenarios Contexto → Evento → Resultado esperado. Las decisiones siguen la numeración de `docs/arquitectura/decisiones-mvp.md` (última usada: D131; este cambio usa D132–D144).

Alcance: refinamiento, diseño de datos y casos de prueba. No hay código. Los números de sección que se citan sin archivo (4.2, 5.1, 7.2, 9, 10) son los de `e5-integracion-jira.md`.

## 1. Resumen

- **Qué se pide:** la sincronización directa («Sincronizar con Jira» crea y actualiza HDU de inmediato con célula, QE y sprint fijos) se reemplaza por dos pasos. (1) El Administrador pulsa **«Consultar Jira»**: una llamada controlada a la API de Jira (con los límites de E5) deja el resultado guardado en el servidor como una **consulta** revisable. (2) Revisa, asigna y **confirma**. Revisar, asignar y confirmar no llaman a Jira. No hay sincronización automática ni periódica.
- **La consulta separa** las historias en **Nuevas** (no existen en Quality360), **Cambiaron en Jira** (título, descripción o prioridad distintos, con antes → después) y **Sin cambios**. Las issues que no se pueden importar (título vacío, código inválido) van aparte, en «Con error».
- **El Administrador asigna** célula, QE responsable, Analista QA y sprint, por fila o a un grupo de filas marcadas. Confirmar crea solo las HDU nuevas marcadas y ya asignadas, y actualiza solo las «Cambiaron» que el Administrador marque, sin tocar sus asignaciones ni su estado.
- **Se mantiene:** token cifrado (D94), solo el Administrador opera (D93), historial y auditoría de E5-F04/B04, límites de ejecución (D96, D114), importación CSV/JSON de E5-F03/B03 (sin cambios, D143).
- **HDU:** 2 nuevas (**E5-F05**, **E5-B05**), 2 reescritas (**E5-F02**, **E5-B02**, ahora «Consultar Jira») y 2 con un escenario aditivo (**E5-F04**, **E5-B04**). E5-F01, E5-B01, E5-F03 y E5-B03 no cambian de intención.
- **Conjunto de este cambio:** 56 escenarios en E5 (24 certificados, 5 reescritos o agregados en F02/B02/F04/B04 y 27 nuevos en F05/B05), 171 casos automáticos (eran 102) y 1 manual opcional.
- **Hallazgo que condiciona la regla de coherencia (sección 3):** en E1/E2/E7 **no existe** una pertenencia del QE ni del Analista a una célula. La célula aparece en la HDU, el sprint y el Líder. La coherencia que sí es verificable es QE activo con rol QE, Analista activo del **equipo vigente de ese QE** (E2-F02, ADR 0009) y sprint de la célula (D120). Ver D138 y la pregunta abierta 2.

### 1.1 Cambios respecto de E5 certificada

| Punto | E5 certificada | Este cambio | Motivo |
| --- | --- | --- | --- |
| Botón del Administrador | «Sincronizar con Jira»: crea y actualiza en el acto | **«Consultar Jira»**: guarda una consulta; no escribe HDU (D132) | Decisión del usuario: revisión antes de escribir |
| Célula de las HDU de Jira | Una sola, fija, de la configuración (D99) | La elige el Administrador **por HDU** (D137) | Jira no conoce células |
| QE responsable | El QE por defecto de la configuración | Lo elige el Administrador por HDU | Decisión del usuario |
| Analista | Sin analista; el QE lo asigna en E2-F02 | El Administrador lo asigna al confirmar (D137, supuesto S2) | Decisión del usuario |
| Sprint | Por nombre dentro de la célula fija; si no, respaldo | Propuesto desde Jira dentro de la célula **elegida**, con el respaldo como valor por defecto si es de esa célula; editable (D137) | Decisión del usuario |
| Qué se actualiza | Todo lo que difiere, de inmediato | Solo las «Cambiaron» que el Administrador marque (D140) | Decisión del usuario |
| «Vincular HDU creadas a mano» | Casilla global de la sincronización | Se decide **por fila**: marcar una HDU creada a mano en «Cambiaron» equivale a vincularla (D144). La casilla sigue en Importar archivo | Coherencia con la revisión por fila |
| Ruta `POST /v1/integraciones/jira/sincronizaciones` | Existe | **Se retira** (D132) | Evita un segundo camino sin revisión |
| Destino en Conexión (célula, QE, sprint de respaldo) | Destino de las HDU de Jira y de los archivos | Sigue obligatorio y sin cambio de campos; solo rige para **archivos** y para el sprint de respaldo (D143) | Cero regresión sobre E5-F01/B01 |

## 2. Decisiones de este cambio

| ID | Decisión | Motivo |
| --- | --- | --- |
| D132 | **Flujo de dos pasos.** «Consultar Jira» llama a Jira una vez (con tandas si es grande, D135) y guarda una consulta en el servidor. «Revisar y asignar» y «Confirmar» no llaman a Jira: funcionan aunque Jira esté caído o el token revocado. **Se retira** `POST /v1/integraciones/jira/sincronizaciones` y el botón «Sincronizar con Jira»; la pestaña se llama «Consultar Jira» y conserva el `data-testid` `pestana-sincronizar`. No hay tarea programada ni disparo automático (se confirma D96). Las ejecuciones directas anteriores quedan en el historial con fase `DIRECTA` | Decisión del usuario |
| D133 | **La consulta es una entidad guardada en el servidor** (`integraciones.consulta_jira` y `consulta_item`, sección 5). Guarda por issue solo lo **mapeado** (código, título ≤ 200, descripción ≤ 1.000, prioridad, nombre del sprint de Jira, estado y responsable de Jira como referencia, advertencias), nunca la respuesta cruda de Jira ni credenciales. Es una excepción acotada a D104/D123 («no se guarda texto de Jira»): los textos viven solo mientras la consulta está abierta y se **purgan** al cerrarse, vencer, reemplazarse o descartarse (la cabecera con sus contadores queda). Es el único dato de Integraciones que admite `DELETE` (solo `consulta_item`) | La revisión necesita los textos; la purga limita la retención |
| D134 | **Vida de la consulta.** Una sola consulta **abierta** a la vez en todo el sistema (índice único parcial; un proyecto por configuración, D96). Vigencia de **24 h** desde la última llamada a Jira (`INTEGRACIONES_CONSULTA_VIGENCIA_MS`, 86.400.000; editar no la renueva). Estados: `ABIERTA`, `CONFIRMADA`, `REEMPLAZADA`, `VENCIDA`, `DESCARTADA`. Consultar con una abierta exige `reemplazar: true`; sin él, 409 `CONSULTA_ABIERTA` con quién la creó, cuándo y cuántas filas tiene asignadas. El vencimiento es **perezoso** (se aplica al leerla o al consultar; no hay tarea programada). Una `VENCIDA` no cuenta como abierta. Es compartida: cualquier Administrador la ve y la edita | Evita que dos Administradores trabajen consultas distintas sin saberlo y acota la antigüedad de los datos de Jira |
| D135 | **Consultar respeta los límites de E5.** Mismos valores de D96/D114/D105: página de 50, tope de 100 issues por tanda, presupuesto de 8 s, 3 s por petición, 429 con hasta 2 reintentos. Una tanda `INCOMPLETA` deja la consulta `ABIERTA` con lo leído y `hayMas`; **«Continuar consulta»** (`POST …/consultas/{id}/continuaciones`) lee la tanda siguiente desde el `continuarDesde` guardado y **acumula en la misma consulta**, sin perder asignaciones. Tope de **500 filas por consulta** (`INTEGRACIONES_CONSULTA_TOPE_ITEMS`): al llegar, la tanda termina `INCOMPLETA` con `TOPE_DE_CONSULTA` y «Continuar» responde 409 `CONSULTA_LLENA` (se confirma y se vuelve a consultar). Cada tanda registra **su propia ejecución** (fase `CONSULTA`). Una issue ya leída no se duplica: gana la primera lectura | Mismo diseño de E5; 500 coincide con el máximo de un archivo |
| D136 | **Clasificación.** Al guardar la tanda, Integraciones consulta a Organización (solo lectura, `POST /v1/interno/integraciones/hdu/estado-codigos`, lote ≤ 100, token del Administrador) y deja cada issue en un grupo: **`NUEVA`** (el código normalizado no existe), **`CAMBIO`** (existe, no está `CERRADA` y llega título, descripción o prioridad **no vacío y distinto**, como D98; una prioridad ausente o desconocida no cuenta), **`SIN_CAMBIOS`** (existe y no difiere, o existe y está `CERRADA`, con el motivo `HDU_CERRADA`) y **`CON_ERROR`** (`CODIGO_INVALIDO`, `TITULO_VACIO`, no marcable). Cada `CAMBIO` guarda `antes` (valores de Quality360 en ese momento) y `despues`. La advertencia `SPRINT_NO_ENCONTRADO` **ya no se calcula al consultar**: depende de la célula y aparece al asignar (D137). Si Organización no responde, la ejecución es `FALLIDA` con `ORGANIZACION_NO_DISPONIBLE` y no se guarda consulta | Separar nuevas, cambios y sin cambios es el pedido central; la célula aún no se conoce |
| D137 | **Asignación de una HDU nueva.** Obligatorios para poder marcarla: **célula, QE responsable, Analista QA y sprint** (supuesto S2: el pedido habla de HDU «ya asignadas»; si el Administrador no quiere analista todavía, no marca la fila y vuelve a consultar). Las filas nacen **sin asignar**: la consulta no preasigna célula, QE ni analista, ni siquiera con los valores de la configuración. **Sprint (supuesto S1):** al fijar la célula, el servidor propone (a) el sprint de Jira elegido con la regla de 5.1 (activo, si no futuro más próximo, si no el cerrado más reciente) y buscado **por nombre dentro de esa célula**; (b) si no hay, el **sprint de respaldo de la configuración, solo si pertenece a la célula elegida** (D120); (c) si no, vacío, y el Administrador elige. Siempre es editable y el origen de la propuesta se muestra («Sprint de Jira», «Sprint de respaldo»). Si Jira traía un sprint que no existe en la célula, la fila muestra la advertencia `SPRINT_NO_ENCONTRADO` | Jira es la fuente de la propuesta; el Administrador decide |
| D138 | **Coherencia de la asignación** (resultado de verificar E1/E2/E7, sección 3). Un servidor valida, en cada edición y otra vez al confirmar: célula existente y activa; QE: usuario **activo con rol QE** (D54, 422 `QE_INVALIDO`); Analista: usuario **activo con rol Analista QA y del equipo vigente del QE elegido** (E2-F02#2, ADR 0009; 422 `ANALISTA_FUERA_DE_EQUIPO` o `ANALISTA_INVALIDO`); sprint **de la célula** (D120, 422 `CATALOGO_INVALIDO`). Es más estricta que ADR 0009 para el Administrador («puede asignar a cualquier Analista»): aquí el QE y el analista se eligen juntos y deben formar un par supervisado. No se exige que haya un Líder en la célula: si no lo tiene o está inactivo, la fila muestra el aviso informativo «La célula no tiene Líder activo: nadie la verá como Líder» (CEL-C del fixture). Cambiar el QE de una fila **limpia** el analista y cambiar la célula **recalcula** el sprint | No existe pertenencia a célula; el equipo del QE es la relación real |
| D139 | **Edición por fila y en grupo.** `PATCH …/consultas/{id}/items` acepta el alcance `itemIds` (hasta 100) o `{grupo, todas: true}` (todo el grupo, también el que no está en pantalla), un `asignacion` parcial (`celulaId`, `qeId`, `analistaId`, `sprintId`) y `marcada`. En grupo, cada fila se valida con su combinación final: las que no pasan **no cambian** y se devuelven en `rechazadas` (fila, campo, motivo); las demás sí (aplicación parcial informada, nunca silenciosa). Solo las filas `NUEVA` se asignan. Marcar una `NUEVA` exige asignación completa y válida (422 `ASIGNACION_INCOMPLETA` con lo que falta); marcar una `CAMBIO` no exige nada; `SIN_CAMBIOS` y `CON_ERROR` no se marcan (422 `FILA_NO_MARCABLE`). Si una edición deja inválida una `NUEVA` marcada, se **desmarca** y la respuesta la lista en `desmarcadas`. **Concurrencia:** la consulta tiene `version` (entera), que sube con cada cambio; las ediciones son de última escritura, pero **confirmar exige la `version` que el Administrador vio** (409 `CONSULTA_MODIFICADA` si otra persona cambió algo) | Dos Administradores no deben confirmar lo que el otro cambió sin verlo |
| D140 | **Confirmar** (`POST …/consultas/{id}/confirmaciones`, cuerpo `{version}`; no llama a Jira ni lee la configuración: usa el sitio y el proyecto guardados en la consulta). Orden: (1) comprueba que la consulta esté `ABIERTA` y vigente y que haya filas marcadas (422 `SIN_SELECCION`); (2) **pre-valida todas las asignaciones** marcadas contra Organización (`POST /v1/interno/integraciones/asignaciones/validar`); si alguna dejó de ser válida, **409 `ASIGNACIONES_INVALIDAS`** con las filas y el motivo, **no escribe nada** y deja esas filas desmarcadas; (3) escribe por lotes de 25 con el token del Administrador (upsert de D100 ampliado): crea las `NUEVA` con su asignación y actualiza solo título, descripción y prioridad de las `CAMBIO` marcadas (D98); nunca estado, analista, QE, sprint, célula, checklist ni impedimentos de una existente. Resultados por fila: `CREADA`, `ACTUALIZADA`, `OMITIDA` (`HDU_CREADA_DESPUES`, `HDU_CERRADA`, `SIN_CAMBIOS`) o `ERROR` (`ASIGNACION_INVALIDA` si cambió entre la pre-validación y la escritura). Si el tiempo (D114) u Organización cortan, la ejecución es `INCOMPLETA`, la consulta sigue `ABIERTA` y repetir **«Continuar confirmación»** solo procesa las filas aún no aplicadas. Al terminar la última, la consulta pasa a `CONFIRMADA`, las filas no marcadas **se descartan** (se purgan) y se informa cuántas. Una HDU creada a mano con ese código tras la consulta nunca se sobrescribe (`HDU_CREADA_DESPUES`) | Decisión del usuario más las carreras identificadas (E5-B05) |
| D141 | **Historial y auditoría.** `ejecucion_integracion` suma `fase` (`DIRECTA` para lo anterior y para archivos, `CONSULTA`, `CONFIRMACION`), `consulta_id` y los contadores `nuevas`, `cambiaron`, `sin_cambios` (solo fase `CONSULTA`). El invariante de D103 pasa a ser por fase: `CONSULTA`: `nuevas + cambiaron + sin_cambios + con_error = leidas`; las demás, el de siempre. Una ejecución `CONSULTA` no genera filas de detalle (el detalle es la consulta mientras vive). Una `CONFIRMACION` sí (una fila por HDU) y suma a `detalle_ejecucion` la columna `asignacion` (nombres de célula, QE, analista y sprint, no ids). Cada HDU creada deja la auditoría `CREAR_HDU` (con `origen`, `consultaId` y la asignación) y una **entrada inicial** en el historial de asignación de E2-B04 (anterior vacío, motivo fijo «Asignación inicial al confirmar la consulta de Jira»); cada actualización, `ACTUALIZAR_HDU` con antes y después. Las ediciones de una consulta abierta son un borrador y no se auditan una por una; quedan `creada_por`, `asignado_por` y `asignado_en` por fila. D106 (visibilidad del QE) se aplica igual a las filas de una confirmación | Regla no negociable 1; trazabilidad de quién asignó qué |
| D142 | **Permisos de la consulta.** Todas las rutas de la consulta (ver, editar, confirmar, descartar) son **solo del Administrador**; el resto, 403 `ACCESO_DENEGADO`; consulta inexistente, 404 `CONSULTA_NO_ENCONTRADA` al Administrador y 403 al resto (como D106). El Auditor, que «lee todo», lee **registros** (historial, ejecuciones, auditoría de las HDU creadas), no el **borrador**: la consulta contiene textos de Jira sin aprobar y asignaciones que pueden cambiar. QE, Líder y Analista no ven el borrador; ven las HDU recién creadas en sus bandejas según su ámbito | Mínimo privilegio; el historial sigue visible para Administrador, QE y Auditor |
| D143 | **Importación CSV/JSON (E5-F03/B03): sin cambios** (propuesta; pregunta abierta 1). Ya tiene sus dos pasos (vista previa y confirmar), muestra por fila qué pasaría y el contenido lo trae el propio Administrador, que puede indicar `celula`, `sprint` y `qe_correo` por fila. Por eso se conserva el destino de la configuración (célula, QE, sprint de respaldo, E5-F01) como valor por defecto **de archivos**. Las HDU de archivo siguen naciendo sin analista (E2-F02). Texto de Conexión: «Destino de las HDU nuevas» pasa a «Destino por defecto (archivos y sprint de respaldo)» y la nota «Las HDU llegan sin analista; tu QE lo asigna después» pasa a «Las HDU de Jira se asignan al revisar la consulta. Estos valores se usan al importar archivos» | Sin regresión sobre F01/F03/B01/B03 |
| D144 | **Vincular HDU creadas a mano, por fila.** Una HDU `MANUAL` con el mismo código que una issue de Jira aparece en `CAMBIO` (si difiere) o `SIN_CAMBIOS` (si no) con el chip «Creada a mano». Marcarla en `CAMBIO` equivale a «vincular» (D97): se actualiza título, descripción y prioridad, su origen pasa a `JIRA`, se llenan `clave_externa` y `url_externa`, y su estado, analista, QE y sprint no cambian. Sin marcarla, no se toca. Desaparece `aviso-vincular-sugerido` de la sincronización | Misma regla de D97, decidida fila por fila |

**Supuestos que se registran (reversibles):** S1 sprint propuesto desde Jira con respaldo por defecto (D137). S2 analista obligatorio para marcar una HDU nueva (D137). S3 vigencia de 24 h (D134). S4 tope de 500 filas por consulta (D135). S5 la consulta es compartida entre Administradores (D134). Todos son variables o reglas de una sola línea.

**Ajustes del arquitecto (2026-11-02):** D145–D152 en `docs/arquitectura/decisiones-mvp.md`. D145 separa «seleccionar» (portal) de «marcar» (servidor) y corrige E5-F05-T06, T07, T14 y T24 y los identificadores de la sección 9. Contratos y plan: `docs/arquitectura/e5-consulta-plan-construccion.md`.

## 3. Verificación de las reglas de E1/E2/E7

| Regla buscada | Dónde se verificó | Resultado |
| --- | --- | --- |
| Pertenencia del QE o del Analista a una célula | Reglas de dominio, ADR 0009, modelo de E7 (`celula_lider`), E7-F05 (pendientes), E4 | **No existe.** La célula está en la HDU, el sprint (D120) y el Líder (`celula_lider`). Los pendientes del Administrador solo miran analista sin QE, QE sin analistas, Líder sin células y célula sin Líder |
| QE responsable de una HDU | D54, D99 | Usuario activo con rol QE (422 `QE_INVALIDO`); el catálogo ya existe (`GET /v1/catalogos/personas?rol=QE&activo=true`) |
| Analista de una HDU | E2-F02#2, ADR 0009, D43 | Del equipo vigente del QE (`supervision`, máximo un QE por analista). El Administrador puede asignar a cualquiera en E2; aquí se exige el par (D138) |
| Sprint y célula | D120, D55 | El sprint pertenece a una célula; D120 lo exige a las HDU de integración |
| Quién ve una HDU | D47, E7 | QE: responsable o supervisor del analista; Analista: la suya; Líder: sus células vigentes; Administrador y Auditor: todas |
| Líder inactivo o célula sin Líder | D55 | No impide crear HDU; la HDU solo no tiene Líder que la vea |

Consecuencia: al elegir **QE y analista juntos** (el analista solo puede ser del equipo de ese QE) la HDU nace visible para sus tres responsables y consistente con E1. La célula solo condiciona el sprint y la visibilidad del Líder.

## 4. Catálogos

### 4.1 Grupos, estados y fases

| Campo | Valores |
| --- | --- |
| Grupo de una fila | `NUEVA` («Nuevas»), `CAMBIO` («Cambiaron en Jira»), `SIN_CAMBIOS` («Sin cambios»), `CON_ERROR` («Con error») |
| Estado de la consulta | `ABIERTA`, `CONFIRMADA` («Confirmada»), `REEMPLAZADA` («Reemplazada»), `VENCIDA` («Vencida»), `DESCARTADA` («Descartada») |
| Fase de la ejecución | `DIRECTA` («Directa», lo anterior y los archivos), `CONSULTA` («Consulta»), `CONFIRMACION` («Confirmación») |
| Origen de la propuesta de sprint | `JIRA`, `RESPALDO`, `MANUAL` |

### 4.2 Códigos de error nuevos

| Código | HTTP | Cuándo |
| --- | --- | --- |
| `CONSULTA_ABIERTA` | 409 | Consultar con una abierta y sin `reemplazar` (trae `consultaId`, `creadaPor`, `creadaEn`, `asignadas`) |
| `CONSULTA_NO_ABIERTA` | 409 | Editar, confirmar, continuar o descartar una consulta `CONFIRMADA`, `REEMPLAZADA` o `DESCARTADA` (trae el `estado`) |
| `CONSULTA_VENCIDA` | 410 | Editar, confirmar o continuar una consulta pasada de su vigencia |
| `CONSULTA_MODIFICADA` | 409 | Confirmar con una `version` que ya no es la actual (trae la actual) |
| `CONSULTA_LLENA` | 409 | Continuar una consulta que ya tiene 500 filas |
| `CONSULTA_NO_ENCONTRADA` | 404 | Identificador inexistente (solo Administrador) |
| `SIN_SELECCION` | 422 | Confirmar sin ninguna fila marcada |
| `ASIGNACION_INCOMPLETA` | 422 | Marcar una `NUEVA` sin célula, QE, analista o sprint (trae `faltantes`) |
| `ASIGNACION_INVALIDA` | 422 | Un valor de la asignación no cumple D138 (trae `campo`) |
| `ASIGNACIONES_INVALIDAS` | 409 | Confirmar con filas cuya asignación dejó de ser válida (trae `filas`) |
| `ANALISTA_FUERA_DE_EQUIPO`, `ANALISTA_INVALIDO` | 422 | Analista de otro equipo o sin equipo / inactivo o con otro rol (campo `analistaId`) |
| `FILA_NO_MARCABLE`, `FILA_NO_ASIGNABLE` | 422 | Marcar o asignar una fila `SIN_CAMBIOS` o `CON_ERROR`; asignar una `CAMBIO` |
| `TOPE_DE_CONSULTA` | 200 (ejecución `INCOMPLETA`) | La consulta llegó a 500 filas |

`QE_INVALIDO` y `CATALOGO_INVALIDO` (con `campo`) se conservan de D54 y D120. Los códigos de Jira son los de 4.4.

### 4.3 Motivos de fila nuevos (confirmación)

| Código | Resultado | Cuándo | Mensaje |
| --- | --- | --- | --- |
| `HDU_CREADA_DESPUES` | OMITIDA | Una fila `NUEVA` marcada, pero el código ya existe al escribir | «La HDU se creó mientras revisabas la consulta. No se modificó» |
| `ASIGNACION_INVALIDA` | ERROR | La asignación dejó de ser válida entre la pre-validación y la escritura | «La asignación ya no es válida» |

Siguen vigentes `SIN_CAMBIOS`, `HDU_CERRADA` y los demás de 4.2.

## 5. Modelo de datos (Integraciones, migración `<fecha>_e5_consulta_asignacion`, sin llaves foráneas a otro esquema, D24)

**`consulta_jira`:** `id_consulta uuid PK`; `estado varchar(12)` (CHECK de 5 valores); `version integer NOT NULL DEFAULT 1`; `creada_por_id`, `creada_por_nombre`, `creada_en`; `vence_en timestamptz NOT NULL`; `cerrada_en timestamptz NULL`, `cerrada_por_id NULL`; `proyecto_clave varchar(10)`, `sitio_host varchar(100)` (instantánea, para armar `urlExterna` sin la configuración); `hay_mas boolean`, `continuar_desde varchar(40) NULL`; `total_filas`, `nuevas`, `cambiaron`, `sin_cambios`, `con_error` (enteros, quedan al purgar). Índice único parcial `((true)) WHERE estado = 'ABIERTA'`. Disparador: una consulta cerrada no cambia. `REVOKE DELETE`.

**`consulta_item`:** `id_item uuid PK`, `id_consulta uuid` (FK a `consulta_jira`, mismo esquema), `posicion integer`, `grupo varchar(11)` (CHECK de 4); `codigo varchar(60)`, `titulo varchar(200)`, `descripcion varchar(1000) NULL`, `prioridad varchar(7)`, `sprint_jira varchar(120) NULL`, `referencia jsonb NULL` (estado y responsable de Jira, informativo), `advertencias jsonb NULL`, `motivo varchar(40) NULL`; para `CAMBIO`: `id_historia uuid`, `origen_hdu varchar(10)`, `cambios jsonb` (`{campo: {antes, despues}}`, 1.000 caracteres por valor); asignación: `celula_id`, `qe_id`, `analista_id`, `sprint_id` (UUID sin FK), `sprint_origen varchar(7)`; `marcada boolean DEFAULT false`, `aplicada boolean DEFAULT false`, `asignado_por_id`, `asignado_en`. `UNIQUE (id_consulta, codigo)`. CHECK: `marcada` solo si el grupo es `NUEVA` con asignación completa o `CAMBIO`. Índice `(id_consulta, grupo, posicion)`. `DELETE` solo para el rol del servicio (purga, D133); `UPDATE` solo mientras la consulta está `ABIERTA`.

**`ejecucion_integracion`:** `fase varchar(12) NOT NULL DEFAULT 'DIRECTA'` (CHECK), `consulta_id uuid NULL`, `nuevas`, `cambiaron`, `sin_cambios` `integer NOT NULL DEFAULT 0`. El CHECK del invariante pasa a ser por fase (D141). Índice `(fase, iniciada_en DESC)`.

**`detalle_ejecucion`:** `asignacion jsonb NULL` (`{celula, qe, analista, sprint}` con nombres).

**Organización** (migración `<fecha>_e5_asignacion_inicial`): sin columnas nuevas en `historia_usuario`. El historial de asignación admite la entrada inicial con analista anterior nulo. Internos nuevos: `POST /v1/interno/integraciones/hdu/estado-codigos` (lectura, ≤ 100 códigos), `POST /v1/interno/integraciones/asignaciones/validar` (≤ 100 asignaciones) y el `upsert` de D100 con `asignacion {celulaId, qeResponsableId, analistaId, sprintId}` y `consultaId` para las creaciones. Catálogo aditivo: `GET /v1/catalogos/personas` suma el filtro `supervisorId` (Analistas del equipo vigente de ese QE, solo Administrador).

**Nube:** `infrastructure/nube/006_rls_consulta_asignacion_nube.sql` activa RLS sin políticas en las dos tablas nuevas y repite los `REVOKE`, como `005`.

## 6. Rutas y permisos

| Método y ruta | Uso | Roles |
| --- | --- | --- |
| `POST /v1/integraciones/jira/consultas` | Consultar Jira. Cuerpo `{reemplazar?}`. 200 `{consulta, ejecucion}`; 409 `CONSULTA_ABIERTA`, `JIRA_NO_CONFIGURADO`, `INTEGRACION_EN_CURSO` | Administrador |
| `POST /v1/integraciones/jira/consultas/{id}/continuaciones` | Continuar consulta (lee la tanda siguiente y acumula) | Administrador |
| `GET /v1/integraciones/jira/consultas/actual` | La consulta abierta o `{consulta: null}`; aplica el vencimiento | Administrador |
| `GET /v1/integraciones/jira/consultas/{id}` | Cabecera, contadores, `version`, `venceEn`, estado | Administrador |
| `GET /v1/integraciones/jira/consultas/{id}/items` | Filas con `grupo`, `q`, `pagina`, `tamanoPagina` (D49) | Administrador |
| `PATCH /v1/integraciones/jira/consultas/{id}/items` | Asignar y marcar (D139). 200 `{aplicadas, rechazadas[], desmarcadas[], version}` | Administrador |
| `POST /v1/integraciones/jira/consultas/{id}/confirmaciones` | Confirmar (D140). Cuerpo `{version}`. 200 con la ejecución y `consulta {estado, pendientes}` | Administrador |
| `POST /v1/integraciones/jira/consultas/{id}/descartes` | Descartar | Administrador |
| `GET /v1/integraciones/ejecuciones` | Suma el filtro `fase` y los campos `fase`, `nuevas`, `cambiaron`, `sinCambios` | Administrador, QE, Auditor |

Orden de validación: 401 → 403 → 404 → 413/400/422 de estructura → 410 (vencida) → 409 (estado, versión, en curso) → ejecución. Las filas se identifican por `id_item`; un `itemId` de otra consulta da 404. Los cuerpos rechazan campos desconocidos (400): `origen`, `estado`, `creadoPor` o `grupo` no se aceptan como asignación. Matriz: ver D142.

## 7. Efecto sobre HDU certificadas y sobre E1, E2 y E7

Regla: el comportamiento certificado de E1, E2, E3, E4 y E7 no cambia para los datos y roles existentes. Cambian E5-F02, E5-B02 y sus casos. La nota de limpieza de la sección 9 de E5 sigue siendo obligatoria (también para las HDU que nacen con analista).

| HDU o suite certificada | Qué cambia | Efecto |
| --- | --- | --- |
| **E5-F02, E5-B02** | Pasan a «Consultar Jira» (sección 10): el escenario 1 ya no crea HDU; se agregan los escenarios 4 y 5 (F02) y 4 (B02) | **Sí.** Se reescriben los 25 casos: E5-F02-T01–T12 y E5-B02-T01–T13 se sustituyen por los de este documento. Se conservan los datos, las instancias y los modos del falso |
| **E5-F01, E5-B01** | Solo el texto de ayuda del destino (D143). Los campos, validaciones y rutas no cambian. El QE por defecto y la célula dejan de aplicarse a Jira; siguen para archivos | **Ninguno** en los casos (ninguno afirma la nota «Las HDU llegan sin analista…»; `q360-qa` lo confirma con una búsqueda) |
| **E5-F03, E5-B03** | Sin cambios (D143) | Ninguno |
| **E5-F04, E5-B04** | Aditivo: columna y filtro `fase`, contadores de consulta, escenario 4 (F04) y 4 (B04) | Los casos certificados no cambian; en `lista-ejecuciones` la columna nueva no altera el orden de las existentes. Las ejecuciones de fase `DIRECTA` se ven como siempre |
| **E2-F02, E2-B04 (asignar analista e historial)** | Las HDU de Jira confirmadas llegan **con analista**: no aparecen en la fila «Asignar analista» del QE. Su historial de asignación empieza con una entrada inicial (analista anterior vacío) | Ninguno sobre E2 en sí. Cambia el dato de E5-F02-T02 (antes «filas Asignar analista para las 10 nuevas»); las pruebas de E2 siguen pasando si se limpia |
| **E2-F01, E2-B01 (crear HDU, unicidad)** | La creación manual no cambia. La unicidad sin distinguir mayúsculas es la misma: crear a mano un código que Jira ya trajo y se confirmó da 409 `CODIGO_HDU_DUPLICADO` | Ninguno |
| **E2-F03, E2-B03 (listado y ámbito)** | Una HDU de Jira tiene QE responsable y analista reales: aparece en las vistas de esos usuarios | Ninguno |
| **E1 (supervisión, E1-F10/B09; usuarios, E1-B07)** | Se **lee** la supervisión vigente; no se escribe. Cambiar la supervisión o desactivar un analista mientras hay una consulta abierta invalida las asignaciones afectadas, que se detectan al confirmar (D140) | Ninguno |
| **E7-F02 a F05 (bandejas)** | Las HDU nuevas se cuentan donde ya se cuentan; el Analista y el QE las ven según su ámbito; el Líder, si la célula es suya | Ninguno **si se limpia** (`hdu-total 8` y los demás conteos del fixture) |
| **E7-F05 (pendientes del Administrador)** | Una consulta abierta o sin confirmar **no** es un pendiente | Ninguno |
| **E7-F06, E7-B04 (Auditor)** | El Auditor no ve el borrador (D142); sí ve el historial con la fase | Ninguno. E7-F06-T07 sigue sin encontrar `button[type=submit]` |
| **E7-B05 (reasignar QE, D54)** | Sin cambios. Es la vía para corregir después de confirmar | Ninguno |
| **Gateway** | Retira `jira/sincronizaciones`, suma las 8 rutas de la consulta | Las pruebas del gateway que cuenten o enumeren las 10 rutas de `integraciones.v1.yaml` cambian (`q360-seguridad-gateway`, `q360-qa`) |
| **Contratos** | `integraciones.v1.yaml` suma las rutas y esquemas; `organizacion.v1.yaml` suma los internos y el filtro `supervisorId`; `comun.v1.yaml` suma los códigos de 4.2. `npm run contracts:check` debe cubrir los escenarios nuevos | Aditivo, salvo el retiro de la sincronización |
| **Semilla** | `seed:e5` suma el sprint «E5 Sprint A1» en CEL-A (sección 8) | Ninguno sobre `hdu-total 8` |

## 8. Fixture y Jira simulado (adiciones a la sección 10)

- **Falso:** sin cambios de endpoints. Proyecto nuevo `ENORME` (520 Story, `ENORME-1` a `ENORME-520`) para el tope de 500. QTY-13 (ADF) y QTY-14 (Story «Reportes por célula», prioridad Medium, descripción «Texto», sin sprint) se agregan con `PUT /__issues/` cuando un caso lo pide. `GET /__solicitudes` es la prueba de que **revisar y confirmar no llaman a Jira**.
- **Usuarios:** los de E7 (ADM1, QE1 con ANA1 y ANA2, QE2 con ANA3, ANA4 sin QE, LID1 en CEL-A y CEL-B, CEL-C sin Líder, AUD1, INACT1 QE desactivado). Se suma **ADM2** (segundo Administrador, lo crea el arnés con la API al inicio de los casos que lo piden) y **QE5** (QE activo sin analistas, creado por la API).
- **Sprints:** «E5 Sprint 1» y «E5 Sprint 2» (CEL-C, como hoy) y **«E5 Sprint A1» (CEL-A)**, nuevo en `seed:e5`.
- **Configuración base:** la de E5 (QTY, CEL-C, QE2, respaldo «E5 Sprint 1»).
- **Consulta A:** primera consulta de `QTY` base: `leidas 11`, `nuevas 10`, `cambiaron 0`, `sinCambios 0`, `conError 1` (QTY-11), `conAdvertencias 4` (QTY-5, 6, 8, 9; `SPRINT_NO_ENCONTRADO` ya no se cuenta al consultar, D136), resultado `CON_ERRORES`.
- **Asignación válida de referencia:** CEL-C, QE2, ANA3, sprint propuesto por la regla (QTY-1: «E5 Sprint 2» desde Jira; QTY-4: «E5 Sprint 1» del respaldo; QTY-3: «Sprint Externo 9» no existe, respaldo con advertencia). Par distinto: CEL-C o CEL-A, QE1, ANA1 o ANA2.
- **Consulta B:** tras confirmar A completa (con ayuda de la API), el falso cambia QTY-2 (título «Recuperar clave», prioridad Highest) y QTY-1 (otra descripción) y agrega QTY-14. Resultado: `nuevas 1`, `cambiaron 2`, `sinCambios 8`, `conError 1`.
- **Estado base y limpieza:** los de E5 (sección 10.4 y nota de la sección 9). La limpieza vacía también `integraciones.consulta_jira` y `consulta_item` y las HDU con `origen <> 'MANUAL'`. Las HDU manuales que crea un caso (QTY-3, QTY-5) se borran con el dueño de la base.
- **Instancia I6:** igual que la base con `INTEGRACIONES_CONSULTA_VIGENCIA_MS=2000` (vencimiento). I4 (presupuesto 2.500 ms) se reutiliza.

## 9. Convenciones comunes de pantalla

Se mantienen las de la sección 11 de E5. La pestaña «Consultar Jira» (`pestana-sincronizar`) muestra el panel de la consulta y, debajo, la consulta abierta con sus grupos.

- **Identificadores de prueba nuevos:** `boton-consultar-jira`, `boton-continuar-consulta`, `consulta-abierta` (con `data-estado` y `data-version`), `res-nuevas`, `res-cambiaron`, `res-sin-cambios`, `res-con-error`, `res-advertencias`, `mensaje-sin-novedades`, `dialogo-reemplazar`, `grupo-nuevas`, `grupo-cambiaron`, `grupo-sin-cambios`, `grupo-con-error`, `fila-<codigo>` (con `data-completa`), `celda-cambios`, `selector-celula`, `selector-qe`, `selector-analista`, `selector-sprint`, `chip-sprint-origen`, `chip-sprint-respaldo`, `chip-creada-a-mano`, `aviso-sin-lider`, `casilla-seleccionar` (solo portal: a qué filas actúa el panel de grupo, D145), `casilla-seleccionar-grupo` (Nuevas, la página), `casilla-marcar` (incluir en la confirmación, `marcada` del servidor), `casilla-marcar-grupo` (solo «Cambiaron», la página), `casilla-incluir-al-aplicar`, `boton-marcar-todas`, `boton-seleccionar-todo-el-grupo`, `panel-asignar-grupo`, `boton-aplicar-grupo`, `alerta-rechazadas`, `boton-confirmar` («Confirmar (N)»), `boton-continuar-confirmacion`, `boton-descartar-consulta`, `resultado-confirmacion`, `error-consulta` (con `data-codigo`), `aviso-consulta-vencida`, `aviso-consulta-reemplazada`, `aviso-consulta-modificada`, `alerta-asignaciones-invalidas`.
- **Listas en diálogos y paneles:** los selectores de analista y sprint con lista visible de hasta 6 filas (D131). La opción «Elige…» es la primera y no es un valor.
- **Estado por texto, no solo color:** cada fila dice «Sin asignar», «Incompleta (falta: analista)», «Lista» o «Marcada»; los grupos son encabezados con contador.
- **Sin permiso:** QE, Líder, Analista y Auditor no ven la pestaña de Administrador (D107); el botón no existe.
- **Mientras corre** «Consultar Jira» o «Confirmar»: botón deshabilitado («Consultando…», «Confirmando…») y espera indeterminada (D114).

## 10. HDU

### E5-F02 · Administrador (reescrita: Consultar Jira)

Quiero consultar las HDU de un proyecto Jira desde Quality360. Para revisarlas y asignarlas antes de crearlas. *(Cambio respecto de E5 certificada: la sincronización ya no escribe HDU; deja una consulta guardada. Los escenarios 1 a 3 conservan su intención.)*

| # | Criterio | Contexto | Evento | Resultado esperado |
| --- | --- | --- | --- | --- |
| 1 | Consulta | La conexión está configurada y no hay consulta abierta. | Pulsa «Consultar Jira». | Se guarda la consulta y se muestra el resumen (leídas, nuevas, cambiaron, sin cambios, con error) y el acceso a revisarla. No se crea ni se modifica ninguna HDU. Si quedan más historias que el tope, se avisa y se ofrece «Continuar consulta». |
| 2 | Sin novedades | Jira no tiene historias nuevas ni modificadas. | Pulsa «Consultar Jira». | Se informa «Sin novedades: todas las historias de Jira ya están en Quality360 sin cambios». No hay nada que confirmar. |
| 3 | Error de API | Jira no responde, rechaza la credencial o limita la tasa. | Pulsa «Consultar Jira». | Se informa el error con su mensaje (D105) y se sugiere «Importar un archivo». La ejecución queda registrada como fallida. No se crea una consulta nueva y la que estuviera abierta se conserva. |
| 4 | Ya hay una consulta abierta | Existe una consulta abierta con asignaciones hechas. | Pulsa «Consultar Jira». | Se pide confirmar: «Ya hay una consulta abierta de <nombre> del <fecha> con N filas asignadas. Si la reemplazas, se pierden las asignaciones». Cancelar no cambia nada ni llama a Jira. Reemplazar crea una consulta nueva. |
| 5 | Consulta grande | El proyecto tiene más historias que el tope por tanda. | Pulsa «Consultar Jira» y luego «Continuar consulta». | Cada tanda se suma a la misma consulta, sin perder lo asignado. Al llegar a 500 filas se avisa que hay que confirmar y consultar de nuevo. |

Contenido de pantalla (pestaña «Consultar Jira»):

| Elemento | Detalle |
| --- | --- |
| Encabezado | Proyecto y sitio configurados, estado de la conexión, última ejecución |
| Texto fijo | «Consultar Jira lee las historias y las deja para revisión. No crea ni modifica HDU hasta que confirmes.» |
| Botones | `boton-consultar-jira` (principal); `boton-continuar-consulta` solo si la consulta abierta tiene `hayMas` |
| Resumen | `resumen-ejecucion` con `res-leidas`, `res-nuevas`, `res-cambiaron`, `res-sin-cambios`, `res-con-error` y `res-advertencias` (no suma); `resultado-ejecucion`; aviso de esperas por límite de tasa |
| Consulta abierta | `consulta-abierta`: quién la creó, cuándo, «Vence el <fecha y hora>», filas asignadas y marcadas |
| Vacío / error | Sin configuración: `estado-vacio-jira`. Con error: `error-consulta` y la sugerencia (tabla 4.5 del diseño de E5, con «Consultar de nuevo» en vez de «Reintentar sincronización») |

Reglas de negocio:
- D132, D134, D135 y D105. «Consultar Jira» solo se ofrece al Administrador. Un clic dispara una sola ejecución; con otra en curso: «Ya hay una consulta o confirmación en curso».
- El portal conserva el texto de D115 (`SIN_RESPUESTA`) para consultas sin respuesta.

Casos de prueba:

| ID | Tipo | Escenario | Datos | Pasos | Resultado esperado |
| --- | --- | --- | --- | --- | --- |
| E5-F02-T01 | e2e | #1 | ADM1, configuración base, `QTY`, 8 HDU | Abre «Consultar Jira» y pulsa `boton-consultar-jira` | `res-leidas` 11, `res-nuevas` 10, `res-cambiaron` 0, `res-sin-cambios` 0, `res-con-error` 1, `res-advertencias` 4; `resultado-ejecucion` «Con errores»; `consulta-abierta` con vencimiento a 24 h; acceso «Revisar y asignar (10 nuevas)» |
| E5-F02-T02 | e2e | #1 | ADM1, QE2 tras T01 | ADM1 abre la lista de HDU; QE2 abre `/qe` | `hdu-total` 8; QE2 no tiene filas nuevas en «Asignar analista»; `/__solicitudes`: una consulta `project = QTY`, ninguna escritura |
| E5-F02-T03 | e2e | #1 | ADM1, consulta A confirmada con ayuda de la API; falso: QTY-2 «Recuperar clave» y Highest, QTY-1 con otra descripción, QTY-14 nueva | Pulsa «Consultar Jira» | `res-nuevas` 1, `res-cambiaron` 2, `res-sin-cambios` 8, `res-con-error` 1 |
| E5-F02-T04 | e2e | #2 | ADM1, falso sin QTY-11, consulta A confirmada | Consulta otra vez | `mensaje-sin-novedades` visible; `res-nuevas` 0, `res-cambiaron` 0, `res-sin-cambios` 10, «Exitosa»; no existe `boton-confirmar` |
| E5-F02-T05 | e2e | #3 negativo | ADM1 con consulta A abierta, falso en `CAIDO` | Pulsa «Consultar Jira» y confirma el reemplazo | `error-consulta` con `data-codigo` `JIRA_NO_DISPONIBLE`, «Jira no está disponible por ahora.», enlace «Importar un archivo»; el historial muestra una ejecución «Fallida» de fase Consulta; **la consulta A sigue abierta** con sus filas |
| E5-F02-T06 | e2e | #3 negativo | ADM1, falso en `TOKEN_REVOCADO` | Consulta | `JIRA_CREDENCIAL_INVALIDA` con enlace a Conexión; el texto del token no aparece en la página |
| E5-F02-T07 | e2e | #5 | ADM1, proyecto `BIG` (230) | Consulta; «Continuar consulta»; «Continuar consulta» | 1.ª: leídas 100, `aviso-incompleta` «Se leyeron 100 historias; quedan más en Jira» y `boton-continuar-consulta`. 2.ª: acumula 200. 3.ª: 230, «Exitosa», sin botón. `consulta-abierta` con 230 filas; ninguna HDU `BIG-*` creada |
| E5-F02-T08 | e2e | #1 | ADM1, falso en `LIMITE`, `QTY` | Consulta | «Con errores» (por QTY-11) con 10 nuevas y el aviso «Jira pidió esperar 2 veces; se reintentó» |
| E5-F02-T09 | e2e | #1 negativo | ADM1 con dos pestañas, falso en `LENTO` con límite alto | Consulta en una y, mientras corre, en la otra | Botón deshabilitado en «Consultando…»; la segunda recibe «Ya hay una consulta o confirmación en curso»; una sola ejecución en el historial |
| E5-F02-T10 | e2e | #4 | ADM1, consulta A con 3 filas asignadas | Pulsa «Consultar Jira»; cancela; vuelve a pulsar y reemplaza | `dialogo-reemplazar` con el nombre, la fecha y «3 filas asignadas»; al cancelar el falso no recibe peticiones y la consulta sigue; al reemplazar hay una consulta nueva sin asignaciones y la anterior queda «Reemplazada» |
| E5-F02-T11 | e2e | #1 negativo | ADM1 sin configuración | Abre «Consultar Jira» | `estado-vacio-jira` con el enlace a Conexión; no existe `boton-consultar-jira` |
| E5-F02-T12 | e2e | #1 negativo | QE1, ANA1, LID1, AUD1 | Abren `/admin/integraciones` y recorren su portal | Acceso denegado en la ruta; en `/qe/integraciones` y en la pestaña del Auditor no existe `boton-consultar-jira` |
| E5-F02-T13 | e2e | regresión | ADM1, QE1, QE2 | Tras la limpieza, ejecuta las pruebas certificadas de E2-F01, E2-F03, E7-F03 y E7-F05 | Pasan sin cambios |

### E5-F05 · Administrador

Quiero revisar la consulta de Jira, asignar célula, QE y analista a las HDU nuevas y confirmar solo lo que elijo. Para incorporar las HDU a Quality360 con los responsables correctos y sin sorpresas.

| # | Criterio | Contexto | Evento | Resultado esperado |
| --- | --- | --- | --- | --- |
| 1 | Grupos separados | Hay una consulta abierta con historias nuevas, modificadas y sin cambios. | Abre la consulta. | Ve tres grupos con su contador: «Nuevas», «Cambiaron en Jira» (con antes → después de título, descripción y prioridad) y «Sin cambios»; las issues no importables, aparte, en «Con error». |
| 2 | Asignación por fila | Una historia nueva está sin asignar. | Elige célula, QE responsable, analista y revisa el sprint propuesto. | La fila queda «Lista»; el sprint se propone desde Jira o desde el sprint de respaldo, indica su origen y se puede cambiar; lo elegido se conserva al recargar o volver otro día. |
| 3 | Asignación en grupo y corrección | Varias historias nuevas están marcadas. | Aplica célula, QE, analista y sprint al grupo y luego corrige una fila. | Se aplica a todas las filas compatibles y se informan las que no lo fueron con su motivo; después se puede corregir cualquier fila por separado. |
| 4 | Coherencia de la asignación | El Administrador elige QE, analista y sprint. | Abre los selectores. | El analista solo lista a los del equipo del QE elegido; el sprint, solo los de la célula; cambiar el QE limpia el analista y cambiar la célula recalcula el sprint. Si el QE no tiene analistas, se explica y la fila no se puede marcar. |
| 5 | Confirmar las nuevas | Hay filas nuevas marcadas y asignadas, y otras sin marcar. | Pulsa «Confirmar». | Se crean solo las marcadas, con su célula, QE, analista y sprint, y se muestra el resultado; las demás no se crean. No se llama a Jira. |
| 6 | Confirmar los cambios | Hay filas de «Cambiaron en Jira», algunas marcadas. | Pulsa «Confirmar». | Se actualizan solo las marcadas (título, descripción, prioridad); su estado, QE, analista, sprint y célula no cambian; las no marcadas conservan sus valores. |
| 7 | Nada que confirmar o filas incompletas | No hay filas marcadas, o una nueva le falta algún dato. | Intenta confirmar o marcarla. | «Confirmar» no se puede usar sin selección y la fila incompleta no se marca: se indica qué le falta. «Marcar todas» marca solo las completas e informa cuántas quedaron fuera. |
| 8 | Consulta vencida, reemplazada o descartada | La consulta venció, otra persona la reemplazó o el Administrador la descarta. | Intenta editar o confirmar. | Se avisa con el motivo, la consulta queda de solo lectura y se ofrece «Consultar Jira»; no se crea ninguna HDU. Descartar pide confirmación. |
| 9 | Dos administradores | Otra persona modificó o confirmó la consulta mientras se revisaba. | Pulsa «Confirmar». | Se avisa «Otra persona modificó la consulta», se recarga con sus cambios y no se escribe nada; si ya se confirmó, se muestra el resultado. |
| 10 | HDU creada a mano mientras tanto | Un QE creó una HDU con el código de una historia nueva marcada. | Confirma. | Esa fila se omite con el motivo «La HDU se creó mientras revisabas la consulta» y la HDU del QE no cambia; las demás se crean. |
| 11 | Asignación que dejó de ser válida | Un analista fue desactivado o cambió de equipo desde que se asignó. | Confirma. | No se crea ninguna HDU; se listan las filas afectadas, quedan desmarcadas y se corrigen antes de confirmar de nuevo. |
| 12 | Confirmación incompleta | Son muchas filas o Organización deja de responder. | Confirma. | Se informa cuántas se aplicaron, la consulta sigue abierta y «Continuar confirmación» procesa solo el resto, sin duplicar. |
| 13 | Permisos | El usuario no es Administrador. | Intenta abrir la consulta. | Acceso denegado; la pestaña y los botones no existen para los demás roles. |

Contenido de pantalla (consulta abierta, bajo el panel de «Consultar Jira»):

| Elemento | Detalle |
| --- | --- |
| Cabecera | Quién la creó, cuándo, «Vence el …», contadores por grupo, filas marcadas y asignadas, `boton-descartar-consulta` |
| Nuevas | Tabla con `casilla-seleccionar` y `casilla-marcar` (D145), código, título, prioridad, sprint de Jira, y los selectores `selector-celula`, `selector-qe`, `selector-analista`, `selector-sprint`, estado de la fila y avisos (`chip-sprint-origen`, advertencias, `aviso-sin-lider`). `panel-asignar-grupo` con los cuatro selectores y `boton-aplicar-grupo` actúa sobre las filas marcadas; `boton-seleccionar-todo-el-grupo` ofrece «Seleccionar las N filas del grupo» (no solo las de la página) |
| Cambiaron en Jira | Casilla, código, título, `celda-cambios` con «Título: A → B», «Descripción: …», «Prioridad: Media → Crítica»; chip «Creada a mano» si corresponde y la nota «Al actualizar pasará a figurar como Jira; su estado, analista y QE no cambian» |
| Sin cambios | Código, título y motivo («Sin cambios», «La HDU está cerrada y no se modifica»), solo lectura |
| Con error | Código, motivo («El título es obligatorio»), solo lectura |
| Confirmar | `boton-confirmar` («Confirmar (N)») con el texto «Se crearán X HDU y se actualizarán Y. No se llamará a Jira. Las filas sin marcar se descartarán.»; `resultado-confirmacion` con los contadores y el detalle; `boton-continuar-confirmacion` si quedó incompleta |

Reglas de negocio:
- D132 a D144. Solo el Administrador. Los textos de Jira se muestran como texto, nunca como HTML.
- Las listas se paginan de a 25 (máximo 100) con filtros por texto; marcar «todo el grupo» actúa en el servidor.
- El estado de una consulta `VENCIDA`, `REEMPLAZADA` o `DESCARTADA` es de solo lectura y sin filas editables.
- Efecto sobre HDU certificada: ninguno en pantalla (sección 7).

Casos de prueba:

| ID | Tipo | Escenario | Datos | Pasos | Resultado esperado |
| --- | --- | --- | --- | --- | --- |
| E5-F05-T01 | e2e | #1 | ADM1, consulta B (1 nueva, 2 cambiaron, 8 sin cambios, 1 con error) | Abre la consulta abierta | `grupo-nuevas` (1), `grupo-cambiaron` (2), `grupo-sin-cambios` (8), `grupo-con-error` (1). En `fila-QTY-2`: «Título: Recuperar contraseña → Recuperar clave» y «Prioridad: Media → Crítica»; en QTY-1, «Descripción: … → …» |
| E5-F05-T02 | e2e | #1 | ADM1; QE1 creó a mano QTY-5 con título «Notificaciones» antes de la consulta A | Consulta y abre | 9 nuevas; QTY-5 en `grupo-cambiaron` con `chip-creada-a-mano` y la nota de que pasará a figurar como Jira |
| E5-F05-T03 | e2e | #2 | ADM1, consulta A | En `fila-QTY-1` elige CEL-C, QE2, ANA3 | `selector-sprint` propone «E5 Sprint 2» con `chip-sprint-origen` «Sprint de Jira»; la fila dice «Lista»; recarga la página: la asignación sigue |
| E5-F05-T04 | e2e | #2 | ADM1, consulta A | En QTY-4 (sin sprint) elige CEL-C; en QTY-3 (sprint «Sprint Externo 9») elige CEL-C | QTY-4: «E5 Sprint 1», `chip-sprint-respaldo`. QTY-3: «E5 Sprint 1» con `chip-sprint-respaldo` y la advertencia «El sprint de Jira no existe en esta célula». Cambia QTY-4 a «E5 Sprint 2»: se conserva |
| E5-F05-T05 | e2e | #2 y #4 | ADM1, consulta A | En QTY-1 elige CEL-A | `selector-sprint` queda sin propuesta («Elige un sprint»); la lista solo trae «E5 Sprint A1»; «E5 Sprint 1» y «E5 Sprint 2» no están; la fila dice «Incompleta (falta: sprint)»; `aviso-sin-lider` no aparece en CEL-A y sí en CEL-C |
| E5-F05-T06 | e2e | #3 | ADM1, consulta A | Selecciona QTY-1 a QTY-4 con `casilla-seleccionar` (D145); en `panel-asignar-grupo` elige CEL-C, QE2, ANA3, deja activa `casilla-incluir-al-aplicar` y pulsa `boton-aplicar-grupo`; luego en `fila-QTY-2` cambia el QE a QE1 | Las 4 filas «Listas» con su sprint propuesto; al cambiar el QE de QTY-2 el analista queda vacío con «Elige un analista del equipo de QE1»; elige ANA1; las otras tres no cambian |
| E5-F05-T07 | e2e | #3 negativo | ADM1, consulta A | Selecciona 3 filas con `casilla-seleccionar` (D145) y aplica CEL-C, QE2 y ANA1 | `alerta-rechazadas` con las 3 filas y «ANA1 no pertenece al equipo de QE2»; ninguna cambió; las demás filas intactas |
| E5-F05-T08 | e2e | #4 | ADM1, consulta A | Abre `selector-analista` con QE2; luego con QE1; abre `selector-qe` | QE2: solo ANA3. QE1: ANA1 y ANA2. ANA4 (sin QE) nunca aparece. `selector-qe` no lista a INACT1 ni a ningún otro rol |
| E5-F05-T09 | e2e | #4 negativo | ADM1, consulta A, QE5 (sin analistas) | En QTY-1 elige QE5 | `selector-analista` vacío con «Este QE no tiene analistas en su equipo»; `casilla-marcar` deshabilitada |
| E5-F05-T10 | e2e | #5 | ADM1, consulta A, QTY-1 a QTY-4 listas y marcadas (CEL-C, QE2, ANA3), QTY-6 a QTY-12 sin marcar | Pulsa `boton-confirmar` («Confirmar (4)») | `resultado-confirmacion`: creadas 4, omitidas 0, con error 0; `hdu-total` 12; QTY-1: CEL-C, QE2, ANA3, «E5 Sprint 2», Pendiente, «Origen: Jira»; ANA3 la ve en su bandeja; QE2 no la ve en «Asignar analista»; las 6 sin marcar no existen; `/__solicitudes` no recibió ninguna petición desde antes de confirmar |
| E5-F05-T11 | e2e | #5 | ADM1 tras T10 | Revisa la pantalla | `consulta-abierta` con `data-estado` «CONFIRMADA», solo lectura; texto «6 filas sin marcar no se crearon; consulta de nuevo para traerlas»; `boton-consultar-jira` disponible |
| E5-F05-T12 | e2e | #6 | ADM1, consulta B, QTY-2 y QTY-1 ya asignadas (QE1, ANA1) | Marca solo QTY-2 y confirma | actualizadas 1; QTY-2 con título «Recuperar clave» y prioridad Crítica; su estado, QE1, ANA1, sprint y célula iguales; QTY-1 conserva su descripción anterior |
| E5-F05-T13 | e2e | #6 | ADM1, consulta A con QTY-5 manual en `grupo-cambiaron` | Marca QTY-5 y confirma | actualizadas 1; el detalle de QTY-5 muestra «Origen: Jira», el título de Jira y el mismo QE1, estado y analista de antes |
| E5-F05-T14 | e2e | #7 | ADM1, consulta A | Sin marcar nada mira `boton-confirmar`; marca una fila incompleta; pulsa `boton-marcar-todas` («Incluir todas las listas», D145) en «Nuevas» con 4 listas y 6 incompletas | `boton-confirmar` deshabilitado con «Marca al menos una fila»; la casilla de la fila incompleta deshabilitada con «Falta: analista»; «Marcar todas» marca 4 y avisa «6 siguen incompletas» |
| E5-F05-T15 | e2e | #8 | ADM1, instancia I6 (vigencia 2 s), consulta A con filas asignadas | Espera 3 s y recarga | `aviso-consulta-vencida` «La consulta venció. Consulta Jira de nuevo»; sin selectores ni `boton-confirmar`; las filas ya no están; `boton-consultar-jira` disponible sin diálogo de reemplazo |
| E5-F05-T16 | e2e | #8 | ADM1 con dos pestañas sobre la consulta A | En la 2.ª reemplaza la consulta; en la 1.ª marca una fila | `aviso-consulta-reemplazada` «Esta consulta fue reemplazada por <nombre>»; la 1.ª queda en solo lectura; ninguna HDU creada |
| E5-F05-T17 | e2e | #8 | ADM1, consulta A | Pulsa `boton-descartar-consulta`; cancela; vuelve a pulsar y confirma | Con cancelar nada cambia; al confirmar, estado «Descartada», filas purgadas, ninguna HDU creada |
| E5-F05-T18 | e2e | #9 | ADM1 y ADM2 sobre la consulta A con QTY-1 a QTY-4 listas y marcadas | ADM2 abre la consulta (ve las asignaciones de ADM1) y cambia el analista de QTY-1; ADM1 pulsa Confirmar | `aviso-consulta-modificada` «Otra persona modificó la consulta»; ADM1 ve el cambio de ADM2 y ninguna HDU se creó; al confirmar de nuevo se crean 4 |
| E5-F05-T19 | e2e | #9 | ADM1 y ADM2, consulta con 4 listas | Ambos pulsan Confirmar a la vez | Uno ve el resultado (creadas 4); el otro «Esta consulta ya se confirmó» o «Ya hay una confirmación en curso»; `hdu-total` 12, sin duplicados |
| E5-F05-T20 | e2e | #10 | ADM1, consulta A con QTY-1 a QTY-4 marcadas; después QE1 crea a mano QTY-3 | Confirma | creadas 3; omitidas 1; QTY-3 con «La HDU se creó mientras revisabas la consulta»; la HDU de QE1 conserva título, QE1 y origen Manual |
| E5-F05-T21 | e2e | #11 | ADM1, consulta A con QTY-1 a QTY-4 marcadas (QE2, ANA3); el arnés desactiva a ANA3 | Confirma | `alerta-asignaciones-invalidas` con las 4 filas y «ANA3 ya no está disponible»; `hdu-total` 8; las 4 desmarcadas; se reasigna a ANA1/QE1, se marcan y se confirma: creadas 4 |
| E5-F05-T22 | e2e | #11 | ADM1, consulta A con QTY-1 marcada (QE2, ANA3); se mueve a ANA3 al equipo de QE1 | Confirma | `alerta-asignaciones-invalidas` «ANA3 ya no pertenece al equipo de QE2»; nada se crea |
| E5-F05-T23 | e2e | #12 | ADM1, `BIG` consultado completo (230), todo el grupo asignado y marcado; Organización se detiene tras el primer lote | Confirma; reinicia Organización; pulsa `boton-continuar-confirmacion` | 1.ª: `aviso-incompleta` «Se aplicaron 25 de 230» y la consulta sigue «Abierta»; 2.ª: se aplican las otras 205 sin repetir; 230 HDU `BIG-*` sin duplicados |
| E5-F05-T24 | e2e | #3 y #12 | ADM1, `BIG` (230) | Marca `casilla-seleccionar-grupo` (la página), pulsa `boton-seleccionar-todo-el-grupo` («Seleccionar las 230 filas del grupo») y aplica CEL-C, QE2, ANA3 | Las 230 filas quedan «Listas», incluidas las que no se ven en la página; el contador dice «230 asignadas» |
| E5-F05-T25 | e2e | #5 | ADM1, consulta A con 4 listas y marcadas, falso en `CAIDO` | Confirma | Se crean 4: confirmar no depende de Jira; `/__solicitudes` sin peticiones nuevas |
| E5-F05-T26 | e2e | #13 | QE1, ANA1, LID1, AUD1 | Abren `/admin/integraciones` y recorren su portal | Acceso denegado en la ruta; en `/qe/integraciones` y en la pestaña del Auditor no existe `grupo-nuevas`, `boton-confirmar` ni ninguna consulta |
| E5-F05-T27 | e2e | #2 y #4 | ADM1, consulta A | Recorre una fila solo con teclado (selectores de célula, QE, analista, sprint, casilla) | Todos los controles son alcanzables en orden; el estado de la fila se anuncia por texto, no por color; los textos de Jira con `<b>` o `=` se ven como texto |
| E5-F05-T28 | e2e | regresión | ADM1, QE1, QE2, ANA3 | Tras la limpieza, ejecuta E2-F02, E7-F02, E7-F03 y E7-F05 | Pasan sin cambios |

### E5-F04 · Administrador, QE y Auditor (aditivo)

Se agrega un escenario; los tres certificados no cambian.

| # | Criterio | Contexto | Evento | Resultado esperado |
| --- | --- | --- | --- | --- |
| 4 | Fases | Hay consultas y confirmaciones en el historial. | Abre el historial y filtra por fase. | Cada ejecución indica su fase («Consulta», «Confirmación», «Directa»); las consultas muestran leídas, nuevas, cambiaron y sin cambios; las confirmaciones, creadas, actualizadas, omitidas y con error, con el detalle por HDU y la asignación. El QE y el Auditor ven lo mismo en solo lectura y no ven las consultas abiertas. |

Casos agregados:

| ID | Tipo | Escenario | Datos | Pasos | Resultado esperado |
| --- | --- | --- | --- | --- | --- |
| E5-F04-T12 | e2e | #4 | ADM1 con una consulta A y su confirmación (4 creadas) | Abre «Historial»; filtra Fase = Consulta; luego Confirmación | Consulta: leídas 11, nuevas 10, cambiaron 0, sin cambios 0, con error 1. Confirmación: creadas 4, con el detalle de QTY-1 a QTY-4 y «CEL-C · QE2 · ANA3 · E5 Sprint 2» en la columna Asignación |
| E5-F04-T13 | e2e | #4 | QE2, AUD1 tras T12 | QE2 abre `/qe/integraciones`; AUD1 su pestaña | Ambos ven las dos ejecuciones con su fase; QE2 ve en la confirmación las HDU de su ámbito y «N filas de HDU fuera de tu ámbito»; ninguno ve filas de la consulta ni `grupo-nuevas`; no hay botones de escritura |

### E5-B02 · Administrador (reescrita: Consultar Jira)

Quiero que el sistema consuma la API REST de Jira Cloud y guarde las issues mapeadas como una consulta. Para que el Administrador las revise antes de crear HDU. *(Cambio respecto de E5 certificada: no escribe HDU. Los escenarios 1 a 3 conservan su intención.)*

| # | Criterio | Contexto | Evento | Resultado esperado |
| --- | --- | --- | --- | --- |
| 1 | Mapeo y guardado | Se obtienen las issues del proyecto. | Se procesa. | Clave, título, descripción, prioridad y sprint de Jira se mapean según 5.1 y se guardan en la consulta, clasificados en nuevas, cambiaron, sin cambios y con error (D136). No se crea ni se actualiza ninguna HDU. |
| 2 | Paginación, tope y tandas | El proyecto tiene más issues que la página, el tope por tanda o el tope de la consulta. | Se procesa y se continúa. | Se recorren páginas de 50 hasta 100 por tanda; si queda más, la ejecución termina incompleta y «continuar» acumula en la misma consulta sin duplicar y sin perder lo asignado; la consulta no pasa de 500 filas. |
| 3 | Límite de tasa | Jira responde con límite excedido. | Se procesa. | Se reintenta con espera (máximo 2 veces) y se registra el evento; si persiste, termina con lo guardado y `JIRA_LIMITE_DE_TASA`. |
| 4 | Consulta de solo lectura sobre Organización | La consulta clasifica contra las HDU existentes. | Se procesa. | Organización solo recibe lecturas; si no responde, la ejecución falla con `ORGANIZACION_NO_DISPONIBLE` y no se guarda una consulta a medias. |

Reglas de negocio:
- Contrato `POST /v1/integraciones/jira/consultas` y `…/{id}/continuaciones`; D93 a D96, D101, D103, D105, D132 a D136. Solo el Administrador. Sin configuración: 409 `JIRA_NO_CONFIGURADO`.
- La consulta a Jira usa solo el proyecto y los tipos configurados; los textos que se interpolan se validan con los formatos de B01.
- Cada tanda registra su ejecución (fase `CONSULTA`); los fallos de una issue no detienen a las demás (van a «Con error»).

Casos de prueba:

| ID | Tipo | Escenario | Datos | Pasos | Resultado esperado |
| --- | --- | --- | --- | --- | --- |
| E5-B02-T01 | api | #1 | ADM1, configuración base, `QTY` | `POST consultas`; `GET /v1/hdu` | 200 `consulta {estado ABIERTA, version 1, venceEn}` y `ejecucion {fase CONSULTA, leidas 11, nuevas 10, cambiaron 0, sinCambios 0, conError 1, conAdvertencias 4, resultado CON_ERRORES}`. `/__solicitudes`: la consulta contiene `project = QTY` y los tipos `Story` e `Historia`. El listado sigue con 8 HDU y la auditoría no tiene entradas nuevas de `HDU` |
| E5-B02-T02 | api | #1 | ADM1 tras T01 | `GET items?grupo=NUEVA` | QTY-1: título, prioridad ALTA, `sprintJira "E5 Sprint 2"`, descripción «Como usuario quiero activar 2FA», `referencia` con el estado y el responsable de Jira, asignación vacía. QTY-3 CRITICA; QTY-4 BAJA; QTY-5 y QTY-6 MEDIA con `PRIORIDAD_AUSENTE` y `PRIORIDAD_DESCONOCIDA`; QTY-8 con título de 200 y `TITULO_TRUNCADO`; QTY-9 con descripción de 1.000 y `DESCRIPCION_TRUNCADA`; QTY-12 con `sprintJira "E5 Sprint 1"` (el activo) |
| E5-B02-T03 | api | #1 | ADM1, falso con QTY-13 de descripción ADF (títulos, viñetas, mención, enlace, nodo desconocido) | Consulta | La descripción guardada es texto plano con saltos de línea, «- » en las viñetas, el nombre de la mención y el texto del enlace; el nodo desconocido se ignora |
| E5-B02-T04 | api | #1 negativo | ADM1, `QTY` | `GET items?grupo=CON_ERROR`; busca QTY-7 | QTY-11: `TITULO_VACIO`, sin posibilidad de marcar; las otras 10 se guardaron. QTY-7 (Bug) no figura en ningún grupo |
| E5-B02-T05 | api | #2 | ADM1, `BIG` (230) | `POST consultas`; dos veces `POST continuaciones` | 1.ª: `leidas 100`, `INCOMPLETA`, `hayMas true`, `continuarDesde "BIG-100"`; el falso recibió 2 peticiones de 50. 2.ª: 100 más, mismo `consulta.id`. 3.ª: `leidas 30`, `EXITOSA`, `hayMas false`. 230 filas sin duplicados; 3 ejecuciones de fase `CONSULTA` |
| E5-B02-T06 | api | #2 | ADM1, proyectos `EXACTO` (100) y `VACIO` (0) | Consulta cada uno | `EXACTO`: `leidas 100`, `EXITOSA`, `hayMas false`. `VACIO`: todo en 0, `EXITOSA`, consulta `ABIERTA` sin filas |
| E5-B02-T07 | api | #3 | ADM1, falso en `LIMITE`, `QTY` | Consulta | Completa con `nuevas 10`; `reintentos429 2`; `eventos` con dos entradas `JIRA_LIMITE_DE_TASA` con `espera_ms 1000` |
| E5-B02-T08 | api | #3 negativo | ADM1, falso en `LIMITE_PAGINA_2`, `BIG` | Consulta; pasa el falso a `NORMAL`; continúa | 1.ª: `INCOMPLETA`, `JIRA_LIMITE_DE_TASA`, 50 filas guardadas, `continuarDesde "BIG-50"`, la consulta sigue `ABIERTA` y se puede revisar y confirmar lo leído. Al continuar, termina sin duplicados |
| E5-B02-T09 | api | #1 negativo | ADM1, falso en `LENTO`, `QTY` | Consulta | 200 `FALLIDA`, `JIRA_TIEMPO_AGOTADO`, en menos de 4 s; no se guarda consulta; la ejecución queda registrada |
| E5-B02-T10 | api | #1 negativo | ADM1; falso en `TOKEN_REVOCADO`, `SIN_PERMISO`, `RESPUESTA_INVALIDA`, `CAIDO`; sitio en puerto cerrado | Consulta en cada situación | `FALLIDA` con `JIRA_CREDENCIAL_INVALIDA`, `JIRA_SIN_PERMISO`, `JIRA_RESPUESTA_INVALIDA`, `JIRA_NO_DISPONIBLE` y `JIRA_SITIO_NO_ENCONTRADO`; el `mensajeError` es fijo y no repite el token; 5 ejecuciones registradas y ninguna consulta nueva |
| E5-B02-T11 | api | #1 negativo | QE1, QE2, ANA1, LID1, AUD1, sin token; ADM1 sin configuración | `POST consultas` | 403 `ACCESO_DENEGADO` ×5; 401 sin token; 409 `JIRA_NO_CONFIGURADO` para ADM1; el falso no recibe peticiones; no se registra ejecución |
| E5-B02-T12 | api | #2 | ADM1, instancia I4 (presupuesto 2.500 ms), falso en `RETARDO_1S`, `BIG` | Consulta | `INCOMPLETA` con `PRESUPUESTO_DE_TIEMPO`, `hayMas true`, `duracionMs` menor o igual a 3.500; las filas de las páginas leídas están guardadas |
| E5-B02-T13 | api | #4 negativo | ADM1 con Organización detenida | `POST consultas` | 503 `SERVICIO_NO_DISPONIBLE`, el falso no recibe peticiones y no hay ejecución. Con Organización detenida después de leer la primera página: 200 `FALLIDA` con `ORGANIZACION_NO_DISPONIBLE` y sin consulta guardada |
| E5-B02-T14 | api | #4 | ADM1 con la consulta A abierta | Consulta con `reemplazar: true` y falso en `CAIDO` | La ejecución es `FALLIDA`; la consulta A sigue `ABIERTA` y completa (una falla de Jira no destruye la consulta abierta) |

### E5-B05 · Administrador

Quiero que el sistema guarde la consulta de Jira, valide la asignación de responsables y cree o actualice solo las HDU que el Administrador confirma. Para controlar qué entra a Quality360 y con qué responsables.

| # | Criterio | Contexto | Evento | Resultado esperado |
| --- | --- | --- | --- | --- |
| 1 | Consulta guardada | Se completó una consulta. | Se solicita la consulta actual, incluso desde otra sesión o tras reiniciar el servicio. | Se devuelve la misma consulta con sus filas, asignaciones, marcas y `version`. |
| 2 | Clasificación | Hay issues nuevas, modificadas, iguales, de una HDU cerrada, de una HDU creada a mano y con error. | Se consulta. | Cada una queda en su grupo según D136, con `antes` y `despues` en las que cambiaron. |
| 3 | Revisar y confirmar no llaman a Jira | Hay una consulta abierta. | Se revisa, asigna y confirma, incluso con Jira caído o el token revocado. | Jira no recibe peticiones y todo funciona. |
| 4 | Asignación coherente | Se asigna célula, QE, analista y sprint a una fila. | Se guarda. | Se acepta si el QE es activo y QE, el analista es activo y del equipo de ese QE, y el sprint es de la célula; si no, se rechaza con el campo y el código. |
| 5 | Marcado y asignación en grupo | Se asigna o se marca un grupo de filas. | Se aplica. | Se aplica a las filas compatibles y se informan las rechazadas y las desmarcadas; solo se marca lo completo (D139). |
| 6 | Confirmar crea | Hay filas nuevas marcadas y completas. | Se confirma. | Se crean solo esas, con la asignación elegida, historial inicial de asignación y auditoría; las no marcadas no se crean. |
| 7 | Confirmar actualiza | Hay filas «cambiaron» marcadas. | Se confirma. | Se actualizan solo título, descripción y prioridad de esas; ni estado, ni analista, ni QE, ni sprint, ni célula, ni checklist cambian. |
| 8 | Asignación que dejó de ser válida | Un QE o analista se desactivó o cambió de equipo después de asignarlo. | Se confirma. | 409 `ASIGNACIONES_INVALIDAS` con las filas; no se escribe nada y esas filas quedan desmarcadas. |
| 9 | Carreras con HDU | Entre la consulta y la confirmación se creó a mano el mismo código, se cerró la HDU o ya tiene los valores. | Se confirma. | La fila se omite con su motivo y nada se sobrescribe; las demás se procesan. |
| 10 | Vida de la consulta | Hay una consulta abierta, vencida, reemplazada o descartada. | Se consulta, edita, confirma o descarta. | Una sola abierta a la vez; reemplazar exige `reemplazar`; lo vencido, reemplazado y descartado es de solo lectura y sus filas se purgan. |
| 11 | Dos administradores | Dos administradores editan o confirman a la vez. | Se confirma. | Confirmar exige la `version` vista (409 `CONSULTA_MODIFICADA`); dos confirmaciones simultáneas producen una sola. |
| 12 | Consulta grande | La consulta tiene cientos de filas o la confirmación no cabe en una petición. | Se asigna, se confirma y se continúa. | Se asigna todo el grupo en el servidor; la confirmación se aplica por lotes y puede continuar sin duplicar; el tope es de 500 filas. |
| 13 | Permisos y seguridad | Quien llama no es Administrador, o envía datos manipulados. | Llama a cualquier ruta de la consulta. | 401 sin sesión; 403 a los demás roles; 404 para ids ajenos; campos desconocidos rechazados; ningún secreto en las respuestas. |
| 14 | Registro | Termina una consulta o una confirmación. | Se registra. | Queda la ejecución con su fase, actor y contadores (con el invariante de la fase) y, en la confirmación, el detalle por HDU con la asignación; sin secretos. |

Reglas de negocio:
- D132 a D144; tablas de la sección 5; rutas de la sección 6. Solo el Administrador.
- La creación pasa por el mismo camino y las mismas validaciones que E2-B01 (catálogos, unicidad sin distinguir mayúsculas, historial inicial) más la asignación; el creador es el Administrador. No se llama a Certificaciones ni a Impedimentos.
- Las escrituras usan el token del Administrador (D100/D126); `X-Q360-Servicio-Token` no sirve.
- Si Organización cae durante la confirmación: `INCOMPLETA` (o `FALLIDA` si no se aplicó nada) con `ORGANIZACION_NO_DISPONIBLE`, y la consulta sigue abierta.

Casos de prueba:

| ID | Tipo | Escenario | Datos | Pasos | Resultado esperado |
| --- | --- | --- | --- | --- | --- |
| E5-B05-T01 | api | #1 | ADM1 y ADM2, consulta A | ADM1 consulta; se reinicia Integraciones; ADM2 hace `GET consultas/actual` | Misma `id`, `estado ABIERTA`, `creadaPor ADM1`, `nuevas 10`, `conError 1`, `version` igual |
| E5-B05-T02 | api | #2 | ADM1, consulta B | `GET items` de cada grupo | `NUEVA`: QTY-14. `CAMBIO`: QTY-1 y QTY-2; QTY-2 con `cambios {titulo {antes «Recuperar contraseña», despues «Recuperar clave»}, prioridad {antes MEDIA, despues CRITICA}}`. `SIN_CAMBIOS`: 8. `CON_ERROR`: QTY-11 |
| E5-B05-T03 | api | #2 | ADM1; el arnés cierra la HDU de QTY-9 (con otro título en Jira) | Consulta | QTY-9 en `SIN_CAMBIOS` con motivo `HDU_CERRADA`; no se puede marcar (`FILA_NO_MARCABLE`) |
| E5-B05-T04 | api | #2 | ADM1; HDU de QTY-5 y QTY-6 creadas con el mismo título y prioridad que Jira (que no trae o no entiende la prioridad) | Consulta | Ambas en `SIN_CAMBIOS`: una prioridad ausente o desconocida no es un cambio |
| E5-B05-T05 | api | #2 | ADM1; QE1 creó a mano QTY-5 («Notificaciones») y QTY-1 con el mismo título que Jira | Consulta | QTY-5 en `CAMBIO` con `origenHdu MANUAL`; QTY-1 en `SIN_CAMBIOS` con `origenHdu MANUAL` |
| E5-B05-T06 | api | #3 | ADM1, consulta A, falso en `CAIDO` | `GET items`, `PATCH`, `POST confirmaciones` | Todo responde 200; `/__solicitudes` no cambia entre el inicio y el fin |
| E5-B05-T07 | api | #4 | ADM1, consulta A | `PATCH` a QTY-1 con CEL-C, QE2, ANA3 | 200; la fila es completa (`completa true`, `sprintId` el propuesto, `sprintOrigen JIRA`); `version` sube en 1 |
| E5-B05-T08 | api | #4 negativo | ADM1, consulta A | `PATCH` a QTY-1 con: ANA1 como QE; INACT1 como QE; QE2 con ANA1; QE2 con ANA4; ANA3 desactivado; sprint «E5 Sprint A1» con CEL-C; célula inexistente; id no UUID; campo extra `estado` | 422 `QE_INVALIDO` ×2 (campo `qeId`); 422 `ANALISTA_FUERA_DE_EQUIPO` ×2; 422 `ANALISTA_INVALIDO`; 422 `CATALOGO_INVALIDO` (campo `sprintId`); 422 `CATALOGO_INVALIDO` (campo `celulaId`); 400 `VALIDACION` ×2; la fila no cambió y la `version` tampoco |
| E5-B05-T09 | api | #4 | ADM1, consulta A | `PATCH` a QTY-1 con CEL-C; a QTY-4 con CEL-C; a QTY-3 con CEL-C; a QTY-1 con CEL-A | QTY-1: `sprintOrigen JIRA` «E5 Sprint 2»; QTY-4: `RESPALDO` «E5 Sprint 1»; QTY-3: `RESPALDO` con la advertencia `SPRINT_NO_ENCONTRADO`; QTY-1 con CEL-A: `sprintId null` (el sprint anterior se limpia) y `completa false` |
| E5-B05-T10 | api | #5 | ADM1, consulta A | Marca una fila completa, una incompleta, una de `SIN_CAMBIOS` (consulta B) y una de `CAMBIO` | Completa: `marcada true`. Incompleta: 422 `ASIGNACION_INCOMPLETA` con `faltantes`. `SIN_CAMBIOS`: 422 `FILA_NO_MARCABLE`. `CAMBIO`: marcada sin asignación |
| E5-B05-T11 | api | #5 | ADM1, consulta A | `PATCH` con `{grupo NUEVA, todas true}` y CEL-C, QE2, ANA3; luego con QE2 y ANA1; luego con `itemIds` que incluyen una `SIN_CAMBIOS` | 1.º: `aplicadas 10`, `rechazadas []`. 2.º: `aplicadas 0`, `rechazadas` ×10 con `ANALISTA_FUERA_DE_EQUIPO` y las filas sin cambio. 3.º: la `SIN_CAMBIOS` en `rechazadas` con `FILA_NO_ASIGNABLE`, las demás aplicadas |
| E5-B05-T12 | api | #5 | ADM1, QTY-1 completa y marcada | `PATCH` cambia su célula a CEL-A | 200 con `desmarcadas ["QTY-1"]`; la fila queda `marcada false` y `completa false` |
| E5-B05-T13 | api | #6 | ADM1, QTY-1 a QTY-4 asignadas (CEL-C, QE2, ANA3) y marcadas; QTY-6 a QTY-12 sin marcar | `POST confirmaciones {version}`; `GET /v1/hdu/{id}` de QTY-1 y su historial | 200 `ejecucion {fase CONFIRMACION, leidas 4, creadas 4}`; `consulta {estado CONFIRMADA}`. QTY-1: `codigo`, título, prioridad ALTA, sprint «E5 Sprint 2», célula CEL-C, QE2, analista ANA3, estado PENDIENTE, `creadoPor` ADM1, `origen JIRA`. Historial de asignación: una entrada con analista anterior vacío, nuevo ANA3 y el motivo fijo. Auditoría `CREAR_HDU` con `consultaId` y la asignación. QTY-6 a QTY-12 no existen; `hdu-total` 12 |
| E5-B05-T14 | api | #6 | ADM1 tras T13 | `GET /v1/checklist` de QTY-1 y las tablas de Certificaciones e Impedimentos | Sin entregables marcados; ninguna fila nueva en Certificaciones ni en Impedimentos |
| E5-B05-T15 | api | #7 | ADM1, consulta B; QTY-1 y QTY-2 asignadas a QE1/ANA1 con estados distintos | Marca QTY-2 y confirma; compara el detalle antes y después | `actualizadas 1`; título «Recuperar clave», prioridad CRITICA; estado, analista, QE, sprint y célula idénticos; auditoría `ACTUALIZAR_HDU` con antes y después; sin entradas nuevas en `hdu_historial_estado`; QTY-1 intacta |
| E5-B05-T16 | api | #7 | ADM1; QTY-5 creada a mano por QE1 (`MANUAL`), consulta con QTY-5 en `CAMBIO` | Marca QTY-5 y confirma | `origen JIRA`, `claveExterna "QTY-5"`, `urlExterna` `https://<host>/browse/QTY-5` con el host guardado en la consulta; estado, analista, QE y sprint iguales |
| E5-B05-T17 | api | #8 negativo | ADM1, QTY-1 a QTY-4 marcadas (QE2, ANA3); el arnés desactiva a ANA3 | `POST confirmaciones` | 409 `ASIGNACIONES_INVALIDAS` con las 4 filas (`ANALISTA_INVALIDO`); `hdu-total` 8; las 4 desmarcadas; la consulta sigue `ABIERTA`; no se registra ejecución |
| E5-B05-T18 | api | #8 negativo | ADM1, QTY-1 marcada (QE2, ANA3); se cambia la supervisión de ANA3 a QE1; otro caso: se desactiva QE2 por el arnés | `POST confirmaciones` | 409 `ASIGNACIONES_INVALIDAS` con `ANALISTA_FUERA_DE_EQUIPO` y con `QE_INVALIDO` respectivamente; nada creado |
| E5-B05-T19 | api | #9 | ADM1, QTY-1 a QTY-4 marcadas; QE1 crea a mano QTY-3 después | `POST confirmaciones` | `creadas 3`, `omitidas 1`; la fila de QTY-3 `OMITIDA` con `HDU_CREADA_DESPUES`; la HDU de QE1 conserva título, QE1 y origen `MANUAL`; resultado `EXITOSA` |
| E5-B05-T20 | api | #9 | ADM1, consulta B con QTY-2 marcada; el arnés cierra la HDU de QTY-2; otro caso: se iguala su título y prioridad a los de Jira | `POST confirmaciones` | Primer caso: `OMITIDA` `HDU_CERRADA`, sin cambios. Segundo: `OMITIDA` `SIN_CAMBIOS`. Nada se escribe en ninguno |
| E5-B05-T21 | api | #9 | ADM1; el código de QTY-2 se crea a mano entre la pre-validación y la escritura (código existente al insertar) | `POST confirmaciones` | Solo esa fila `OMITIDA` con `HDU_CREADA_DESPUES`; el lote no falla completo; las demás se crean |
| E5-B05-T22 | api | #10 | ADM1, consulta A abierta | `POST consultas` sin `reemplazar`; luego con `reemplazar: true`; `PATCH` y `confirmaciones` sobre la anterior | 409 `CONSULTA_ABIERTA` con `creadaPor`, `creadaEn` y `asignadas`; luego 200 con una consulta nueva y la anterior `REEMPLAZADA` con sus filas purgadas (`GET` devuelve la cabecera y los contadores); `PATCH` y `confirmaciones` sobre la anterior: 409 `CONSULTA_NO_ABIERTA` con `estado REEMPLAZADA` |
| E5-B05-T23 | api | #10 | Instancia I6 (vigencia 2 s), consulta A con filas asignadas | Espera 3 s; `GET consultas/actual`; `PATCH`; `confirmaciones`; `POST consultas` | `actual`: `{consulta: null}` y la anterior como `VENCIDA` sin filas; `PATCH` y `confirmaciones`: 410 `CONSULTA_VENCIDA`; `POST consultas` sin `reemplazar`: 200 (la vencida no cuenta como abierta); ninguna HDU creada |
| E5-B05-T24 | api | #10 | ADM1, consulta A | `POST descartes`; otra vez; `PATCH` | 200 `DESCARTADA` con filas purgadas; las dos siguientes: 409 `CONSULTA_NO_ABIERTA`; ninguna HDU creada |
| E5-B05-T25 | api | #11 | ADM1 y ADM2, consulta A con 4 filas marcadas, `version 7` | ADM2 hace `PATCH`; ADM1 `POST confirmaciones {version: 7}`; luego con la versión nueva | 409 `CONSULTA_MODIFICADA` con la `version` actual y ninguna HDU creada; con la nueva, 200 y creadas 4 |
| E5-B05-T26 | api | #11 | ADM1 y ADM2, 4 filas marcadas | Ambos `POST confirmaciones` a la vez | Una responde 200 (creadas 4); la otra 409 (`INTEGRACION_EN_CURSO` o `CONSULTA_NO_ABIERTA`); 4 HDU sin duplicados; una sola ejecución `CONFIRMACION` |
| E5-B05-T27 | api | #11 | ADM1 crea la consulta | ADM2 hace `GET`, `PATCH` y `POST descartes` | 200 en las tres: la consulta es compartida; `asignadoPor` de cada fila indica a ADM2 |
| E5-B05-T28 | api | #12 | ADM1, `BIG` (230) consultado en 3 tandas | `PATCH {grupo NUEVA, todas true}` con CEL-C, QE2, ANA3; marca todo el grupo; confirma con Organización detenida tras el primer lote; reinicia; vuelve a confirmar | Un solo `PATCH` asigna 230. Confirmación 1: `INCOMPLETA`, `ORGANIZACION_NO_DISPONIBLE`, 25 creadas, consulta `ABIERTA`, `pendientes 205`. Confirmación 2: 205 más, `EXITOSA`, consulta `CONFIRMADA`. 230 HDU `BIG-*` sin duplicados y las 25 primeras no se repiten |
| E5-B05-T29 | api | #12 | ADM1, falso `ENORME` (520) | `POST consultas` y 4 `POST continuaciones`; otra | Tras 5 tandas: 500 filas, última `INCOMPLETA` con `TOPE_DE_CONSULTA`, `hayMas true`; la sexta: 409 `CONSULTA_LLENA`; se puede confirmar lo leído |
| E5-B05-T30 | api | #12 | ADM1, falso en `LIMITE_PAGINA_2`, `BIG` | Consulta (50 filas); asigna y confirma 10 | La consulta de 50 filas es revisable; la confirmación crea las 10 marcadas sin llamar a Jira |
| E5-B05-T31 | api | #13 negativo | QE1, QE2, ANA1, LID1, AUD1, sin token; ADM1 con id inexistente | Cada una de las 8 rutas de la consulta | 403 `ACCESO_DENEGADO` en las 8 para los 5 roles; 401 sin token; 404 `CONSULTA_NO_ENCONTRADA` para ADM1; para un rol no administrador el id inexistente da 403; ninguna ejecución registrada |
| E5-B05-T32 | api | #13 negativo | ADM1; falso con un título `<img src=x onerror=1>` y otro `=HYPERLINK("x")`; id de una fila de otra consulta | `GET items`; `PATCH` con `origen`, `estado` o `creadoPor`; `PATCH` con el id de otra consulta; `q` con `' OR 1=1 --`; upsert con `X-Q360-Servicio-Token` | Los textos se devuelven tal cual (el portal los muestra como texto); 400 por los campos desconocidos; 404 para la fila ajena; la búsqueda no falla y no devuelve nada; el upsert con el token de servicio da 403; ninguna respuesta contiene el token ni su cifrado |
| E5-B05-T33 | api | #14 | ADM1 tras A y su confirmación | `GET ejecuciones?fase=CONSULTA`; `fase=CONFIRMACION`; el detalle de la confirmación | Consulta: `leidas 11 = nuevas 10 + cambiaron 0 + sinCambios 0 + conError 1`, sin filas de detalle. Confirmación: `creadas 4 = leidas 4`, 4 filas `CREADA` con `asignacion {celula «CEL-C», qe, analista, sprint}` y sin secretos |
| E5-B05-T34 | api | #1 negativo | ADM1 con Organización detenida durante la clasificación | `POST consultas` con la consulta A abierta y `reemplazar: true` | `FALLIDA` con `ORGANIZACION_NO_DISPONIBLE`; la consulta A sigue abierta; no hay consulta nueva |
| E5-B05-T35 | db | #10 y #14 | Dueño de la base y `svc_integraciones` | Insertar dos consultas `ABIERTA`; actualizar una `CONFIRMADA`; `DELETE` en `consulta_jira`; `DELETE` en `consulta_item`; `UPDATE` de una ejecución `CONSULTA` cerrada; leer las tablas con el rol anónimo | 23505 en la segunda `ABIERTA`; el disparador rechaza el `UPDATE`; `DELETE` en `consulta_jira`, 42501; en `consulta_item`, permitido solo al rol del servicio; el rol anónimo no lee (RLS) |

### E5-B04 · Administrador (aditivo)

Se agrega un escenario; los tres certificados no cambian.

| # | Criterio | Contexto | Evento | Resultado esperado |
| --- | --- | --- | --- | --- |
| 4 | Fases | Termina una consulta, una confirmación o una ejecución directa. | Se registra y se consulta el historial. | Cada ejecución guarda su fase; el invariante de contadores se cumple por fase (D141); el historial se puede filtrar por fase; el detalle de una confirmación incluye la asignación; nada guarda texto de Jira fuera de la consulta abierta. |

Casos agregados:

| ID | Tipo | Escenario | Datos | Pasos | Resultado esperado |
| --- | --- | --- | --- | --- | --- |
| E5-B04-T16 | api | #4 | ADM1 con una consulta, una confirmación y una importación de archivo | `GET ejecuciones?fase=…` (3 valores); intenta `UPDATE` de la ejecución cerrada | Cada filtro devuelve solo su fase (el archivo es `DIRECTA`); el invariante se cumple en las tres; el `UPDATE` lo rechaza el disparador |
| E5-B04-T17 | api | #4 | ADM1, QE2, AUD1 tras T16 | `GET ejecuciones/{id}/detalle` de la confirmación | ADM1 y AUD1 ven las 4 filas con la asignación; QE2 ve las de su ámbito y `filasOcultas`; la ejecución de consulta no tiene detalle de filas para nadie |

## 11. Resumen de casos

| HDU | Casos | Cambio |
| --- | --- | --- |
| E5-F01 | 11 | Sin cambio |
| E5-F02 | 13 | Reescrita (eran 12) |
| E5-F03 | 14 | Sin cambio |
| E5-F04 | 13 | +2 (eran 11) |
| E5-F05 | 28 | Nueva |
| E5-B01 | 12 | Sin cambio |
| E5-B02 | 14 | Reescrita (eran 13) |
| E5-B03 | 14 | Sin cambio |
| E5-B04 | 17 | +2 (eran 15) |
| E5-B05 | 35 | Nueva |
| **Automáticos** | **171** | Eran 102 |
| Manual opcional (E5-MAN-01) | 1 | Se ajusta: sus pasos 2 y 3 pasan a «Consulta» y «Confirma» |

De los 171 automáticos, 6 son de regresión sobre lo certificado (E5-F01-T11, E5-F02-T13, E5-F03-T13, E5-F04-T11, E5-F05-T28 y E5-B04-T14).

**Escenarios en E5:** 24 certificados + 5 agregados a HDU existentes (F02 +2, B02 +1, F04 +1, B04 +1) + 27 nuevos (F05 13, B05 14) = **56**. Los escenarios 1 a 3 de F02 y 1 a 3 de B02 conservan su intención con otro resultado. Los 25 casos de F02 y B02 que se sustituyen se listan en la sección 7.

## 12. Trazabilidad

| Capacidad | Frontend | Backend | Contrato |
| --- | --- | --- | --- |
| Consultar Jira (y continuar) | E5-F02 | E5-B02 | `POST /v1/integraciones/jira/consultas`, `POST …/consultas/{id}/continuaciones`, `GET /v1/interno/hdu/…/estado-codigos` |
| Revisar y asignar | E5-F05 (1–4, 7) | E5-B05 (1–5) | `GET …/consultas/actual`, `GET …/consultas/{id}`, `GET …/consultas/{id}/items`, `PATCH …/consultas/{id}/items`, `GET /v1/catalogos/{celulas, sprints, personas}`, `POST /v1/interno/integraciones/asignaciones/validar` |
| Confirmar | E5-F05 (5, 6, 10–12) | E5-B05 (6–9, 12) | `POST …/consultas/{id}/confirmaciones`, `POST /v1/interno/integraciones/hdu/upsert` |
| Vida de la consulta y concurrencia | E5-F05 (8, 9) | E5-B05 (10, 11) | `POST …/consultas/{id}/descartes`, `version` y códigos de 4.2 |
| Permisos y seguridad | E5-F05 (13) | E5-B05 (13) | D142, matriz de la sección 6 |
| Historial y auditoría | E5-F04 (4) | E5-B04 (4), E5-B05 (14) | `GET /v1/integraciones/ejecuciones?fase=` |
| Destino por defecto de archivos | E5-F01 (texto) | E5-B01, E5-B03 | Sin cambio (D143) |

## 13. Preguntas resueltas (usuario, 2026-11-02)

Las cuatro se resolvieron con el valor por defecto que ya aplica este documento:

1. **CSV/JSON:** no pasa por la consulta; sigue como en E5-F03/B03 (D143).
2. **Pertenencia de QE y Analista a una célula:** no se modela ahora; la coherencia sigue siendo la de D138. Queda como mejora futura de E1/E7.
3. **Destino en Conexión:** célula y QE siguen obligatorios y sirven como valor sugerido en la asignación en grupo; E5-F01/B01 no cambian.
4. **Filas sin marcar al confirmar:** se descartan y la consulta pasa a `CONFIRMADA` (D140).
