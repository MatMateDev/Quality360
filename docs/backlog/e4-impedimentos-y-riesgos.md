# Épica 4 · Impedimentos y riesgos

Fecha: 2026-10-26. Formato igual al de `e7-bandejas-por-rol.md` (F = frontend, B = backend; escenarios Contexto → Evento → Resultado esperado). Las decisiones siguen la numeración de `docs/arquitectura/decisiones-mvp.md` (última usada: D56; esta épica usa D57–D74).

Alcance de esta ronda: refinamiento, diseño de datos y casos de prueba. No hay código. Fuente de los escenarios originales: `historias-quality360.md`, sección «ÉPICA 4». Los 24 escenarios originales se conservan en su intención; se precisan los datos, los roles y los códigos de error.

## 1. Resumen

- **Qué se pide:** el Analista QA registra lo que le impide avanzar en una HDU; el QE responsable lo gestiona (resuelve, escala, reabre) y evalúa el nivel de riesgo de la HDU; el sistema calcula una sugerencia de riesgo; todo queda auditado.
- **Conjunto de esta ronda:** 8 HDU (4 de frontend, 4 de backend), 24 escenarios y 89 casos de prueba.
- **Servicio dueño:** Impedimentos (`services/impedimentos`, puerto 3003, hoy solo con `/salud`). Tablas existentes `impedimento` y `accion_impedimento`, más una tabla nueva `riesgo_hdu`.
- **Lo que no cambia:** el estado de la HDU (D10). El bloqueo no es un estado (ADR 0010): se deduce de los impedimentos abiertos.
- **Lo que sí cambia en lo certificado:** el cierre de la HDU (se rechaza con impedimentos abiertos), el detalle de HDU (secciones nuevas), las 5 bandejas de E7 (bloques y contadores nuevos, sin tocar los certificados) y el menú del QE (una opción nueva). Ver sección 6.

### Decisiones de esta épica

| ID | Decisión | Motivo |
| --- | --- | --- |
| D57 | **Autorización por relación con la HDU (extiende D18 y D32).** Impedimentos no lee el esquema de Organización: pregunta `GET /v1/interno/hdu/{id}/acceso` y decide según la relación. Matriz en la sección 3.6. Registran el **Analista asignado** y el **QE responsable**; gestionan (resolver, escalar, reabrir, seguimiento, fijar riesgo) **solo el QE responsable**; el QE supervisor que no es responsable, el Líder QA, el Administrador y el Auditor son de **solo lectura**. Fuera de ámbito: 403 `ACCESO_DENEGADO` (D12) | Coherente con aprobar/certificar (D18) y con el solo lectura de Líder y Auditor (D32). El Administrador no opera sobre el contenido de la HDU: si falta un QE, reasigna con D54 |
| D58 | **Vínculo a la HDU.** Se agrega `impedimento.id_historia` (UUID NOT NULL, sin llave foránea, D24) y `id_certificacion` pasa a admitir NULL. Al registrar se guarda el ciclo activo si existe; si la HDU aún no tiene ciclo (se crea con el primer cambio de un entregable), queda NULL y **no se crea ningún ciclo** como efecto del impedimento. El alcance y los permisos se resuelven siempre por `id_historia` | Una HDU Pendiente sin marcas no tiene `certificacion` y es justo donde nace un impedimento («no tengo ambiente»). Crear ciclos por esta vía alteraría la regla de E3 y los contadores de E7 |
| D59 | **Bloqueo derivado.** HDU bloqueada = tiene al menos un impedimento `ABIERTO` o `ESCALADO`. No hay estado `BLOQUEADA` ni columna en `historia_usuario` (ADR 0010). Un bloqueo **no** impide marcar, aprobar ni certificar: es información de supervisión | Evita tocar las reglas certificadas de E3 y E2 |
| D60 | **El cierre sí se bloquea.** Pasar una HDU de `PENDIENTE_CIERRE` a `CERRADA` se rechaza con 409 `HDU_BLOQUEADA` si tiene impedimentos abiertos o escalados (el cuerpo lista hasta 20). Si Impedimentos no responde, el cierre se rechaza con 503 `SERVICIO_NO_DISPONIBLE` y el mensaje «No pudimos verificar los impedimentos de la HDU» (mismo criterio que D11 con el checklist). Orden de validación: transición (D10) → checklist (D11) → impedimentos. Una HDU `CERRADA` no admite impedimentos nuevos ni cambios de riesgo (409 `HDU_CERRADA`), pero conserva y muestra todo su historial | Un certificado con un bloqueo vigente es contradictorio. Es el único cambio sobre una regla certificada |
| D61 | **Catálogo de tipos** (9 códigos, sección 3.1) con CHECK en base de datos y endpoint `GET /v1/catalogos/tipos-impedimento` | D27: fijar los valores al construir la épica |
| D62 | **Estados y transiciones** (`ABIERTO`, `ESCALADO`, `RESUELTO`; sección 3.2). Cualquier otra transición: 409 `TRANSICION_INVALIDA`. Toda transición toma la fila con `SELECT … FOR UPDATE`: dos órdenes simultáneas dan una respuesta 200 y una 409 | E4-B02 |
| D63 | **Responsable de resolverlo.** Se agregan `responsable_id` (UUID NULL, sin llave foránea) y `responsable_nombre` (VARCHAR 150 NOT NULL). Es una persona de Quality360 elegida de una lista de candidatos, o un tercero escrito a mano («Equipo de Infraestructura»), porque quien destraba un ambiente caído muchas veces no tiene usuario. **El responsable no otorga permisos** (D57): sirve para saber a quién se le pidió y para la bandeja del Líder y del Administrador | El modelo no tiene la columna que pide E4-F01/B01 |
| D64 | **Escalar.** El destino es un Líder QA con la célula de la HDU vigente, un Administrador activo, o un tercero escrito a mano. Escalar cambia el estado a `ESCALADO` y el responsable; la resolución la sigue registrando el QE responsable. Se puede volver a escalar a otro destino. No se escala a un QE ni a un Analista (no tendrían acceso a la HDU, D12) | Respeta D32: el Líder solo lee y se entera por su bandeja |
| D65 | **Modelo de datos** (sección 4): columnas de extensión en `impedimento` y `accion_impedimento`, tabla nueva `riesgo_hdu` de solo inserción, CHECK de tipo y estado, y `REVOKE UPDATE, DELETE` sobre las tablas de historial | D26/D27 |
| D66 | **Nivel de riesgo.** `BAJO`, `MEDIO`, `ALTO` con semáforo verde, amarillo y rojo; «Sin evaluar» (gris) solo para HDU cerrada sin nivel. Nivel **vigente** = el último fijado por el QE; si no hay, el **sugerido**. El nivel fijado no se recalcula solo: si la sugerencia cambia, el portal avisa «La sugerencia actual es X» | E4-F04, E4-B03#3 |
| D67 | **Cálculo del riesgo sugerido** (sección 3.4). Se calcula al consultar, no se guarda. El nivel es el máximo de los factores aplicables. Parámetros por configuración: `RIESGO_DIAS_IMPEDIMENTO_ALTO=5`, `RIESGO_DIAS_SPRINT_ALTO=3`, `RIESGO_AVANCE_ALTO=70`, `RIESGO_DIAS_SPRINT_MEDIO=7`, `RIESGO_AVANCE_MEDIO=50` | E4-B03 deja «cumplimiento bajo» sin número |
| D68 | **Cumplimiento = avance de la HDU** (`aprobados/10`, D16) y el sprint es el vigente de `historia_sprint`. Fechas en calendario de `America/Santiago`. Si falta el avance (Certificaciones no responde) el factor de atraso queda `indisponible`: el resultado se marca `calculoParcial` y **nunca** se informa `BAJO` por una fuente caída (regla no negociable 4). Para pruebas existe `Q360_FECHA_REFERENCIA` (ignorada en producción, mismo criterio que `EXPORTACION_LIMITE_FILAS`) | E6 podrá definir un cumplimiento de sprint distinto sin cambiar esta épica |
| D69 | **Quién calcula.** Impedimentos es el único dueño del cálculo. Para sus pantallas reúne los datos de Organización (`POST /v1/interno/hdu/consulta`, que suma `sprintFin`) y de Certificaciones (`POST /v1/interno/checklist/estados`). Para las bandejas, Organización ya tiene esos datos y se los envía en `POST /v1/interno/impedimentos/evaluacion` (lote de hasta 1000 HDU), así que no hay llamadas circulares | D46, D47 |
| D70 | **Auditoría propia del servicio.** Los cambios de estado quedan en `accion_impedimento` y los de riesgo en `riesgo_hdu`, ambas de solo inserción (el patrón de `evento_checklist`, D22). No se escribe en `organizacion.auditoria`. El Auditor las lee en `/v1/auditor/impedimentos` y `/v1/auditor/gestion-impedimentos`, y las exporta con la misma regla que D48 (el registro de la exportación en Organización va antes de entregar el CSV) | Regla no negociable 1: sin escribir en esquemas ajenos |
| D71 | **Las bandejas reciben bloques nuevos y no modifican los certificados** (cumple D36). En particular **no** se agregan filas a la lista «Requiere mi acción» del QE (E7-F03-T01 afirma 4 filas) ni columnas al CSV de HDU del Auditor. El menú del QE suma **una** opción, «Impedimentos», con dos pestañas | Cero cambio de resultado esperado en E7 |
| D72 | **Notificación al QE (E4-F01#3).** No hay correo ni notificación emergente: el QE lo ve en su bandeja, en el contador `impedimentos-abiertos`, el contador `impedimentos-nuevos` (registrados hace menos de 24 horas) y la insignia «Nuevo» en la fila | No hay infraestructura de mensajería en el MVP |
| D73 | **Visibilidad del riesgo.** El nivel de riesgo y su sugerencia son una herramienta de supervisión: los ven QE responsable, QE supervisor, Líder en sus células, Administrador y Auditor. El **Analista no los ve** (GET riesgo → 403) pero sí ve el bloqueo y sus impedimentos. Reversible con poco costo | Priorizar la supervisión (E4-F04) sin exponer una calificación al evaluado |
| D74 | **Prioridad y antigüedad.** Orden por defecto de los listados: abiertos antes que resueltos, luego riesgo vigente (Alto, Medio, Bajo), luego días abiertos de mayor a menor. Días abiertos = días de calendario entre `abierto_desde` y hoy (o `fecha_resolucion`). `abierto_desde` vale `fecha_registro` y se reinicia al reabrir; `fecha_registro` no cambia nunca. Si el riesgo está `indisponible` se ordena solo por días y la respuesta informa el orden usado (D46) | E4-F02#1 |

## 2. Mapa de cobertura: qué existe y qué falta

| Necesidad | Qué existe | Qué falta | HDU |
| --- | --- | --- | --- |
| Registrar un impedimento | Tablas `impedimento` y `accion_impedimento` sin funcionalidad. Servicio 3003 solo con `/salud` | Responsable, vínculo a la HDU, catálogos, API, formulario en el detalle | E4-F01, E4-B01 |
| Ver impedimentos del equipo | Bandejas de E7 (sin impedimentos, D36) | Pantalla del QE, bloques en bandejas | E4-F02 |
| Resolver, escalar, reabrir | Nada | Ciclo de vida, desbloqueo, historial | E4-F03, E4-B02 |
| Nivel de riesgo | Nada | Tabla, cálculo, panel, listado por riesgo | E4-F04, E4-B03 |
| Trazabilidad | Auditoría de usuarios (Organización), bitácora de checklist (Certificaciones) | Historial propio de impedimentos y riesgo, lectura del Auditor | E4-B04 |
| Dashboards de bloqueos y semáforo | E6-F01, F02, B04 (aún no construidas) | **No se absorben.** E4 deja los datos listos: `bloqueada`, `impedimentosAbiertos`, `nivelRiesgo` por HDU | E6 |

Dependencias de construcción: B01 → B02 → B03 → B04; F01 y F03 requieren B01 y B02; F04 requiere B03; F02 requiere B01 y B03 (para ordenar por riesgo).

## 3. Catálogos

### 3.1 Tipos de impedimento (`impedimento.tipo`, VARCHAR 30)

| Código | Etiqueta | Cuándo se usa |
| --- | --- | --- |
| `AMBIENTE` | Ambiente de pruebas | El ambiente no está disponible o está inestable |
| `DATOS_PRUEBA` | Datos de prueba | Faltan datos, cuentas o archivos de prueba, o son inválidos |
| `ACCESO` | Accesos y permisos | Falta una credencial, VPN o permiso en una herramienta |
| `REQUISITOS` | Requisitos | Criterios de aceptación incompletos, ambiguos o cambiantes |
| `DEPENDENCIA` | Dependencia de otro equipo | Se espera una entrega o un servicio de otro equipo o componente |
| `DEFECTO_BLOQUEANTE` | Defecto bloqueante | Un defecto impide continuar con las pruebas |
| `HERRAMIENTA` | Herramienta o integración | Falla una herramienta de trabajo o su integración (incluida Jira) |
| `RECURSOS` | Personas o tiempo | Falta de disponibilidad de personas o tiempo |
| `OTRO` | Otro | Ninguno de los anteriores; la descripción debe tener al menos 20 caracteres |

### 3.2 Estados y transiciones (`impedimento.estado`, VARCHAR 30)

| Código | Etiqueta | Cuenta como bloqueo |
| --- | --- | --- |
| `ABIERTO` | Abierto | Sí |
| `ESCALADO` | Escalado | Sí |
| `RESUELTO` | Resuelto | No |

| Desde | Operación | Hacia | Quién | Exige |
| --- | --- | --- | --- | --- |
| (nuevo) | Registrar | `ABIERTO` | Analista asignado, QE responsable | Tipo, título, descripción y responsable |
| `ABIERTO` | Resolver | `RESUELTO` | QE responsable | Comentario de 3 a 500 caracteres. Fija `fecha_resolucion` |
| `ABIERTO` | Escalar | `ESCALADO` | QE responsable | Destino (D64) y comentario. Cambia el responsable |
| `ESCALADO` | Resolver | `RESUELTO` | QE responsable | Comentario |
| `ESCALADO` | Escalar de nuevo | `ESCALADO` | QE responsable | Destino distinto y comentario |
| `RESUELTO` | Reabrir | `ABIERTO` | QE responsable | Motivo de 3 a 500 caracteres. Borra `fecha_resolucion` y reinicia `abierto_desde` |
| `ABIERTO`, `ESCALADO` | Seguimiento | (igual) | QE responsable | Comentario. Solo agrega una acción |

Todo lo demás da 409 `TRANSICION_INVALIDA`: escalar o seguir un resuelto («solo puede reabrirse»), reabrir uno abierto o escalado, resolver uno ya resuelto.

**Tipos de acción** (`accion_impedimento.tipo_accion`): `REGISTRAR`, `ESCALAR`, `RESOLVER`, `REABRIR`, `SEGUIMIENTO`. `accion_impedimento.estado` guarda el estado resultante.

### 3.3 Nivel de riesgo y semáforo

| Código | Etiqueta | Semáforo | `data-nivel` |
| --- | --- | --- | --- |
| `ALTO` | Alto | Rojo | `ALTO` |
| `MEDIO` | Medio | Amarillo | `MEDIO` |
| `BAJO` | Bajo | Verde | `BAJO` |
| (sin nivel) | Sin evaluar | Gris | `SIN_EVALUAR` |

El semáforo siempre lleva el texto del nivel (no depende solo del color). Origen del nivel vigente: `MANUAL` (fijado por el QE, con justificación) o `SUGERIDO`.

### 3.4 Cálculo del riesgo sugerido

Solo para HDU no cerradas. Cada factor aplicable se informa en `factores`; el nivel sugerido es el máximo.

| Código del factor | Condición | Nivel |
| --- | --- | --- |
| `IMPEDIMENTO_ABIERTO` | Hay al menos un impedimento `ABIERTO` o `ESCALADO` | MEDIO |
| `IMPEDIMENTO_ANTIGUO` | Algún impedimento `ABIERTO` lleva 5 días o más abierto | ALTO |
| `IMPEDIMENTO_ESCALADO` | Hay al menos un impedimento `ESCALADO` | ALTO |
| `SPRINT_VENCIDO` | El sprint vigente terminó (`fin` anterior a hoy) y la HDU no está cerrada | ALTO |
| `ATRASO_SPRINT_ALTO` | Faltan 3 días o menos para el fin del sprint y el avance es menor a 70 % | ALTO |
| `ATRASO_SPRINT_MEDIO` | Faltan 7 días o menos para el fin del sprint y el avance es menor a 50 % | MEDIO |

Sin factores: `BAJO`. Sin sprint vigente no aplican los tres factores de sprint. «Faltan N días» = fecha de fin menos hoy; el día de término cuenta como 0. Los umbrales son exclusivos del valor indicado (70 % exacto no es atraso). HDU `CERRADA`: sin sugerencia (`HDU_CERRADA`) y conserva su último nivel fijado, si lo tiene.

Con fuente caída (D68): si Certificaciones no responde, los factores de atraso quedan `indisponible`. Si con los factores de impedimentos ya se llega a `ALTO`, se informa ese nivel con `calculoParcial: true`; en cualquier otro caso el nivel sugerido es `null` con estado `indisponible`.

### 3.5 Responsable de resolverlo: candidatos

| Propósito | Candidatos (de Organización, solo activos) | Además |
| --- | --- | --- |
| `REGISTRO` | QE responsable de la HDU (preseleccionado) y QE supervisor vigente del analista, si es otra persona | «Otro (nombre)» |
| `ESCALAMIENTO` | Líderes QA con la célula de la HDU vigente, y Administradores | «Otro (nombre)» |

Un `responsableId` fuera de esa lista: 422 `RESPONSABLE_INVALIDO`. Sin `responsableId`, `responsableNombre` es obligatorio (3 a 150 caracteres).

### 3.6 Matriz de permisos

| Operación | Analista asignado | QE responsable | QE supervisor (no responsable) | Otro QE o Analista | Líder QA (célula vigente) | Administrador | Auditor |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Ver impedimentos e historial de la HDU | Sí | Sí | Sí | No (403) | Sí | Sí | Sí |
| Registrar impedimento | Sí | Sí | No | No | No | No | No |
| Resolver, escalar, reabrir, seguimiento | No | Sí | No | No | No | No | No |
| Ver nivel de riesgo y sugerencia | No (D73) | Sí | Sí | No | Sí | Sí | Sí |
| Fijar nivel de riesgo | No | Sí | No | No | No | No | No |
| Listados de la épica | Su bandeja | `/qe/impedimentos` | `/qe/impedimentos` (solo lectura) | No | Su bandeja | Su bandeja | Pestaña Impedimentos |

Toda operación que no está en «Sí» responde 403 `ACCESO_DENEGADO` con mensaje genérico. Identificador inexistente o fuera de ámbito: 403 para Analista, QE y Líder (no se revela la existencia); 404 para Administrador y Auditor (D50). Sin sesión: 401 `NO_AUTENTICADO`.

## 4. Modelo de datos

Migración de Impedimentos `<fecha>_e4_impedimentos_riesgo`. Las tablas están vacías, así que los cambios son seguros. Sin llaves foráneas fuera del esquema (D24).

**`impedimento` (existente; se agrega):**

| Columna | Tipo | Regla |
| --- | --- | --- |
| `id_historia` | `uuid NOT NULL` | UUID de Organización, sin FK. Índice `(id_historia, estado)` |
| `id_certificacion` | `uuid NULL` | Ahora admite NULL (D58) |
| `responsable_id` | `uuid NULL` | Usuario de Organización, sin FK (D63) |
| `responsable_nombre` | `varchar(150) NOT NULL` | Instantánea del nombre |
| `creado_por_id`, `creado_por_nombre`, `creado_por_rol` | `uuid`, `varchar(150)`, `varchar(30)` NOT NULL | Autor (E4-B01#1) |
| `abierto_desde` | `timestamptz NOT NULL DEFAULT now()` | Se reinicia al reabrir (D74) |
| `actualizado_en` | `timestamptz NOT NULL DEFAULT now()` | |

CHECK: `impedimento_tipo_ck` (9 códigos), `impedimento_estado_ck` (3 códigos), `impedimento_resolucion_ck`: `(estado = 'RESUELTO') = (fecha_resolucion IS NOT NULL)`. El título pasa a ser obligatorio en la API (5 a 200 caracteres) y la descripción también (10 a 1000), aunque la columna `descripcion` siga admitiendo NULL como en el modelo.

**`accion_impedimento` (existente; se agrega):** `tipo_accion varchar(30) NOT NULL` (CHECK con los 5 tipos), `estado_anterior varchar(30) NULL` (NULL en `REGISTRAR`), `actor_id uuid NOT NULL`, `actor_nombre varchar(150) NOT NULL`, `actor_rol varchar(30) NOT NULL`, `detalle jsonb NULL` (en `ESCALAR`: `{responsableAnterior, responsableNuevo}`). `descripcion` es el comentario (en `REGISTRAR`, el texto fijo «Registro del impedimento»), `observacion` queda libre, `estado` es el estado resultante. **Solo inserción:** `REVOKE UPDATE, DELETE` para `svc_impedimentos`.

**`riesgo_hdu` (tabla nueva, solo inserción; el vigente es la última fila por HDU):** `id_riesgo uuid PK`, `id_historia uuid NOT NULL` (sin FK), `nivel varchar(10) NOT NULL` (CHECK `BAJO|MEDIO|ALTO`), `nivel_anterior varchar(10) NULL`, `justificacion varchar(500) NOT NULL`, `sugerido_al_fijar varchar(10) NULL`, `actor_id`, `actor_nombre`, `actor_rol`, `fecha timestamptz NOT NULL DEFAULT now()`. Índice `(id_historia, fecha DESC)`. `REVOKE UPDATE, DELETE`.

## 5. Contratos y rutas

Contrato nuevo `contracts/impedimentos.v1.yaml` (dueño `q360-arquitecto`). El gateway debe enrutar al servicio 3003 estas rutas (hoy `/v1/hdu/**` va a Organización y a Certificaciones, así que las rutas con sufijo necesitan regla propia: `q360-seguridad-gateway`).

| Método y ruta | Uso | Roles |
| --- | --- | --- |
| `POST /v1/hdu/{hduId}/impedimentos` | Registrar (201) | Analista asignado, QE responsable |
| `GET /v1/hdu/{hduId}/impedimentos` | Lista del detalle, con `bloqueada` | Quien ve la HDU |
| `GET /v1/hdu/{hduId}/impedimentos/responsables?proposito=REGISTRO\|ESCALAMIENTO` | Candidatos (3.5) | Analista asignado y QE responsable |
| `GET /v1/impedimentos` | Listado con filtros `estado`, `tipo`, `celulaId`, `analistaId`, `riesgo`, `q`, `orden`, `pagina`, `tamanoPagina` (D49) | QE (su ámbito), Líder, Administrador, Auditor |
| `GET /v1/impedimentos/{id}` | Detalle con acciones | Quien ve la HDU |
| `POST /v1/impedimentos/{id}/{resolver\|escalar\|reabrir\|seguimiento}` | Ciclo de vida | QE responsable |
| `GET /v1/hdu/{hduId}/riesgo` | Nivel vigente, sugerido, factores, origen | Todos menos Analista |
| `PUT /v1/hdu/{hduId}/riesgo` | Fijar nivel `{nivel, justificacion}` | QE responsable |
| `GET /v1/riesgo/hdu` | Listado por riesgo con `nivel`, `celulaId`, `sprintId`, `analistaId`, `estado`, `bloqueada`, `q` | QE, Líder, Administrador, Auditor |
| `GET /v1/hdu/{hduId}/gestion-impedimentos` | Historial cronológico (impedimentos y riesgo) | Quien ve la HDU; el Analista recibe solo los eventos de impedimentos |
| `GET /v1/catalogos/tipos-impedimento` | Catálogo 3.1 | Cualquier sesión |
| `GET /v1/auditor/impedimentos`, `GET /v1/auditor/gestion-impedimentos`, `GET /v1/auditor/exportaciones/{impedimentos\|gestion-impedimentos}` | Pestaña del Auditor y CSV | Solo Auditor |
| `POST /v1/interno/impedimentos/evaluacion` | Lote para bandejas y cierre: por HDU `bloqueada`, `abiertos`, `escalados`, `nivelFijado`, `nivelSugerido`, `nivelVigente`, `estado` | Interno (token propagado, 2 s) |

Cambios aditivos en otros contratos: Organización suma `candidatosResponsable` (QE responsable, QE supervisor, líderes vigentes de la célula, administradores activos; id, nombre, rol) al acceso interno de la HDU, `sprintFin` a `POST /v1/interno/hdu/consulta`, y los bloques nuevos de las 5 bandejas (sección 6). Las respuestas de `GET /v1/hdu` y de `GET /v1/hdu/{id}` **no cambian**.

Reglas comunes de la API: errores con el formato de `comun.v1.yaml`. Campo ausente o fuera de largo: 400 `VALIDACION` con `campo`. Texto en blanco donde se exige comentario, motivo o justificación: 422 (`COMENTARIO_REQUERIDO`, `MOTIVO_REQUERIDO`, `JUSTIFICACION_REQUERIDA`). Tipo fuera del catálogo: 400 `VALIDACION` con `VALOR_NO_PERMITIDO`. HDU cerrada: 409 `HDU_CERRADA`. Fuente caída: 503 `SERVICIO_NO_DISPONIBLE` en endpoints propios o `estado: indisponible` en bloques compuestos (D34).

## 6. Efecto sobre HDU certificadas

Regla: ningún escenario certificado cambia de resultado esperado para los datos y roles existentes. Se **agrega** contenido, salvo el cierre. Las suites certificadas se vuelven a ejecutar como regresión.

| HDU o suite certificada | Qué cambia | Efecto |
| --- | --- | --- |
| **E2-B02#3 y D11 (cierre de HDU)** | Se agrega la verificación de impedimentos (D60). Un cierre con checklist completo y sin impedimentos abiertos se comporta igual | **Sí, regla nueva y única.** Una HDU con un impedimento `ABIERTO` o `ESCALADO` ya no se cierra (409 `HDU_BLOQUEADA`). Las suites que cierran HDU necesitan el servicio Impedimentos arriba; sus datos no tienen impedimentos, así que pasan. La semilla E4 no deja impedimentos abiertos en H8 (la HDU que E7 cierra) |
| **E2-F04#2–#3, E3-F01 (detalle y checklist)** | El detalle suma el aviso «HDU bloqueada», la sección «Impedimentos» y el panel «Riesgo» (este último oculto para el Analista) | Ninguno si se conservan los `data-testid` y el orden de las secciones certificadas; las nuevas van después del checklist. Para Líder, Auditor y Administrador, sin botones de acción (D39): no se rompe E7-F06-T07 (sin `button[type=submit]`) |
| **E7-F02 (bandeja Analista)** | Contador `impedimentos-abiertos`, columna «Bloqueo» y filtro «Solo bloqueadas». Sin riesgo (D73) | Ninguno. Los contadores y el orden certificados no cambian |
| **E7-F03 (bandeja QE)** | Contadores `impedimentos-abiertos`, `impedimentos-nuevos`, `hdu-riesgo-alto` y un **bloque aparte** `lista-impedimentos` (10 filas, enlace «Ver todos»). La lista «Requiere mi acción» no recibe filas (D71) | Ninguno. E7-F03-T01 sigue afirmando 4 filas. La fila «Cerrar HDU» muestra la insignia «Con impedimento abierto» cuando corresponde |
| **E7-F04 (bandeja Líder)** | Contadores `impedimentos-abiertos`, `hdu-bloqueadas` y `escalados-a-mi`, bloque `lista-impedimentos` (solo lectura), columnas «Bloqueo» y «Riesgo», filtro «Solo bloqueadas» | Ninguno. Si una prueba afirma los encabezados exactos de la tabla, debe aceptar las 2 columnas nuevas al final |
| **E7-F05 (bandeja Administrador)** | Contadores `impedimentos-abiertos`, `hdu-bloqueadas`, `hdu-riesgo-alto` y bloque `lista-impedimentos-escalados` (escalados a él). Sin enlaces a pantallas nuevas | Ninguno. «Pendientes de configuración» no cambia |
| **E7-F06 y E7-B04 (Auditor)** | Pestaña nueva «Impedimentos» (5.ª) con sus dos vistas y exportación; contadores `impedimentos-abiertos` y `hdu-bloqueadas` | Ninguno. **El CSV de HDU no cambia de columnas** (D71); E7-B04-T09 sigue pasando. Las exportaciones de E4 dejan entradas `EXPORTAR` en la auditoría: las pruebas de E7 que leen «la última entrada» o «el primer ítem de últimos cambios» crean su propio evento antes de leer |
| **E7-B03 (respuestas de bandeja)** | Campos aditivos con `estado: ok\|indisponible` propio. Si Impedimentos cae, solo esos bloques quedan `indisponible` y la respuesta es 200 | Ninguno. Una prueba con esquema estricto debe aceptar los campos nuevos |
| **E1-F02#3 (menú del QE)** | Opción nueva «Impedimentos» después de «Historias supervisadas»: `["Bandeja","Equipo","Historias supervisadas","Impedimentos","Perfil"]` | **Sí, en el dato de la prueba** (igual que lo hizo D41/D29). Se actualiza el arreglo en `e1-f02-portal-qe.spec.ts` y en su unitaria. Los menús de Analista, Líder, Administrador y Auditor no cambian |
| **E7-F01 (acceso a portales)** | Rutas nuevas `/qe/impedimentos` y `/qe/impedimentos/riesgo` del QE y `/auditor/impedimentos` del Auditor; otros roles reciben acceso denegado (D41) | Ninguno. Se suman a la matriz de E7-F01-T04 |
| **E2 (reasignación de analista), D54 (reasignación de QE), E1-B07/B08** | Los impedimentos siguen a la HDU por `id_historia`. Reasignar el QE responsable traspasa la gestión al nuevo QE; el `responsable_nombre` ya guardado no cambia. No se agregan relaciones incompatibles | Ninguno |
| **Semilla y E7-B02/B03/E7 conteos** | La semilla E4 agrega impedimentos, un nivel de riesgo y fechas de sprint (sección 7). No agrega HDU, usuarios ni células | Ninguno sobre `hdu-total 8`, 10 usuarios activos ni los contadores de E7. Supuesto a confirmar con `q360-integraciones`: E7 no afirma fechas de sprint |
| **`GET /v1/hdu`, `GET /v1/hdu/{id}`, CSV de HDU, certificados, bitácora de checklist** | Sin cambios de contrato | Ninguno |

## 7. Fixture de datos de prueba (compartido)

Parte del fixture de E7 (secciones 3 de `e7-bandejas-por-rol.md`): mismos usuarios, células y H1–H8 (con LID1, LID2, AUD1, ADM1, INACT1). «Hoy» es el día de carga de la semilla en `America/Santiago`. La semilla E4 se recarga antes de cada archivo de pruebas, porque los casos que escriben cambian el historial.

**Sprints** (solo se fijan sus fechas de fin y la HDU a la que pertenecen; el avance es `aprobados/10`):

| Sprint de prueba | Fin | HDU | Avance de la HDU |
| --- | --- | --- | --- |
| SP-VENC | hoy − 3 | H5 | 0 % |
| SP-PROX | hoy + 2 | H1, H6 | H1 30 % (3 aprobados), H6 80 % |
| SP-MED | hoy + 6 | H2 | 10 % (1 aprobado; el 2 está rechazado) |
| SP-LEJ | hoy + 20 | H3, H4, H8 | H3 0 %, H8 100 % |
| (cualquiera) | — | H7 (Cerrada) | 100 % |

**Impedimentos:**

| ID | HDU (célula) | Analista | Tipo y título | Estado | Responsable | Fechas y acciones |
| --- | --- | --- | --- | --- | --- | --- |
| I1 | H3 (CEL-B) | ANA3 | `AMBIENTE` «Ambiente QA no responde» | `ABIERTO` | QE2 | Registrado hace 2 horas. Acciones: REGISTRAR |
| I2 | H1 (CEL-A) | ANA1 | `DATOS_PRUEBA` «Faltan cuentas de prueba con saldo» | `ABIERTO` | QE1 | Registrado hace 6 días. REGISTRAR |
| I3 | H6 (CEL-B) | ANA1 | `DEPENDENCIA` «API de Pagos sin sandbox» | `ESCALADO` | LID1 | Registrado hace 3 días por ANA1 (responsable inicial QE1); escalado a LID1 por QE1 hace 1 día. REGISTRAR, ESCALAR |
| I4 | H2 (CEL-A) | ANA2 | `REQUISITOS` «Criterio de aceptación ambiguo» | `RESUELTO` | QE1 | Registrado hace 5 días; resuelto hace 2 días por QE1 («Se aclaró el criterio con el PO»). REGISTRAR, RESOLVER |
| I5 | H7 (CEL-A, Cerrada) | ANA3 | `ACCESO` «Permisos de la herramienta de pruebas» | `RESUELTO` | QE2 | Registrado hace 20 días; resuelto hace 15 días por QE2. REGISTRAR, RESOLVER |

**Riesgo fijado:** H6 = `MEDIO` por QE1 hace 2 días, justificación «Dependencia en gestión con el equipo de Pagos». Ninguna otra HDU tiene nivel fijado.

**Valores derivados esperados** (HDU no cerradas; H7 sin sugerencia):

| HDU | Bloqueada | Sugerido (factores) | Vigente (origen) |
| --- | --- | --- | --- |
| H1 | Sí (I2) | ALTO (`IMPEDIMENTO_ABIERTO`, `IMPEDIMENTO_ANTIGUO`, `ATRASO_SPRINT_ALTO`) | ALTO (sugerido) |
| H2 | No (I4 resuelto) | MEDIO (`ATRASO_SPRINT_MEDIO`) | MEDIO (sugerido) |
| H3 | Sí (I1) | MEDIO (`IMPEDIMENTO_ABIERTO`) | MEDIO (sugerido) |
| H4 | No | BAJO (sin factores) | BAJO (sugerido) |
| H5 | No | ALTO (`SPRINT_VENCIDO`) | ALTO (sugerido) |
| H6 | Sí (I3) | ALTO (`IMPEDIMENTO_ABIERTO`, `IMPEDIMENTO_ESCALADO`) | MEDIO (fijado) |
| H7 | No | — (cerrada) | Sin evaluar |
| H8 | No | BAJO (sin factores) | BAJO (sugerido) |

**Contadores esperados por usuario** (con el estado base):

| Usuario | Valores |
| --- | --- |
| ANA1 | `impedimentos-abiertos` 2 (I2, I3) |
| ANA2 | 0 |
| ANA3 | 1 (I1) |
| ANA4 | 0 |
| QE1 (H1, H2, H5, H6, H8) | abiertos 2 (H1, H6); nuevos 0; `hdu-riesgo-alto` 2 (H1, H5) |
| QE2 (H3, H4, H7) | abiertos 1 (H3); nuevos 1 (I1); `hdu-riesgo-alto` 0 |
| LID1 (ve H1, H2, H3, H5, H6, H7) | abiertos 3 (I1, I2, I3); `hdu-bloqueadas` 3 (H1, H3, H6); `escalados-a-mi` 1 (I3) |
| LID2 | 0 (sin células) |
| ADM1 | abiertos 3; `hdu-bloqueadas` 3; `hdu-riesgo-alto` 2 (H1, H5); escalados a él 0 |
| AUD1 | `impedimentos-abiertos` 3; `hdu-bloqueadas` 3; en la pestaña Impedimentos, 5 impedimentos; en Gestión, 9 entradas (8 acciones: I1 1, I2 1, I3 2, I4 2, I5 2; más 1 cambio de riesgo) |

Candidatos de escalamiento: H1 y H3, H6 (CEL-A y CEL-B): LID1 y ADM1. H8 (CEL-C, sin líder): solo ADM1. LID2 (sin células), QE1, QE2 y los analistas no son candidatos. Candidatos de registro para H1: QE1 (responsable y supervisor de ANA1; es la misma persona, aparece una vez).

## 8. Convenciones comunes de pantalla

Se mantienen las de E7 (sección 5): estados cargando, vacío, error con «Reintentar» e indisponible; paginación del servidor de 25 (máximo 100); filtros en la URL; acceso denegado con «Ir a mi bandeja»; fechas en hora de Chile.

- **Identificadores de prueba:** `seccion-impedimentos`, `hdu-bloqueada` (aviso), `lista-impedimentos-hdu`, `boton-registrar-impedimento`, `form-impedimento`, `contador-<clave>`, `lista-<clave>`, `estado-vacio-<clave>`, `estado-error-<clave>`, `estado-indisponible-<clave>`, `panel-riesgo`, `semaforo-riesgo` (con `data-nivel`), `riesgo-sugerido`, `form-riesgo`, `insignia-nuevo`.
- **Etiquetas:** estados «Abierto», «Escalado», «Resuelto»; días abiertos «N d»; insignia roja «Bloqueada» en las filas de HDU.
- **Acciones de escritura** solo con la relación del cuadro 3.6. Para los demás roles el botón **no existe** (no solo deshabilitado), igual que D39. Un botón pulsado sin permiso real (por cambio de rol en otra pestaña) recibe 403 y el portal informa «Ya no tienes permiso para esta acción».
- **Confirmación:** resolver, escalar y reabrir abren un cuadro con el campo de texto obligatorio y el botón «Confirmar»; fijar el riesgo exige justificación.

## 9. HDU de frontend

### E4-F01 · Analista QA

Quiero registrar un impedimento sobre una HDU indicando tipo, descripción y responsable de resolverlo. Para que mi QE pueda gestionarlo oportunamente.

| # | Criterio | Contexto | Evento | Resultado esperado |
| --- | --- | --- | --- | --- |
| 1 | Registro | El analista asignado está en el detalle de una HDU que no está cerrada. | Pulsa «Registrar impedimento», completa tipo, título, descripción y responsable, y guarda. | El impedimento aparece en la sección «Impedimentos» del detalle con estado Abierto, su autor y su responsable; el detalle muestra el aviso «HDU bloqueada»; la fila de la HDU en su bandeja muestra «Bloqueada». |
| 2 | Datos obligatorios | Falta la descripción (o el tipo, el título o el responsable). | Presiona Guardar. | Se marca cada campo faltante con su mensaje («La descripción es obligatoria»), el formulario sigue abierto con lo ya escrito y no se crea nada. |
| 3 | Notificación al QE | Se registró el impedimento. | El QE responsable abre su bandeja. | Ve el impedimento en el bloque «Impedimentos abiertos» con la insignia «Nuevo», y sus contadores `impedimentos-abiertos` e `impedimentos-nuevos` suben en uno. |

Reglas de negocio:
- Ver D57–D59, D63, D72 y sección 3. También registra el QE responsable (botón idéntico), por ejemplo en una HDU sin analista. El QE supervisor que no es responsable, el Líder, el Administrador y el Auditor ven la sección sin el botón.
- Formulario: Tipo (catálogo 3.1), Título (5 a 200), Descripción (10 a 1000, con contador; para «Otro», 20 como mínimo), Responsable (candidatos de `REGISTRO` con el QE responsable preseleccionado, u «Otro (nombre)» de 3 a 150).
- Una HDU `CERRADA` no muestra el botón y la sección dice «HDU cerrada: no admite nuevos impedimentos». Se sigue viendo el historial.
- El analista ve el bloqueo y sus impedimentos, pero no el panel de riesgo (D73).
- Estados de la sección: cargando; vacío «Esta HDU no tiene impedimentos registrados»; error con «Reintentar»; indisponible («No disponible») si el servicio Impedimentos no responde, sin afectar al resto del detalle.
- Efecto sobre HDU certificada: ver sección 6 (detalle de HDU y bandeja del Analista, aditivos).

Casos de prueba:

| ID | Tipo | Escenario | Datos | Pasos | Resultado esperado |
| --- | --- | --- | --- | --- | --- |
| E4-F01-T01 | e2e | #1 | ANA3, H4 (sin bloqueo) | Abre `/hdu/<H4>`, pulsa «Registrar impedimento», elige `ACCESO`, título «VPN sin permisos», descripción de 30 caracteres, responsable QE2, guarda | La lista tiene 1 fila Abierta con autor ANA3 y responsable QE2; aparece `hdu-bloqueada`; el formulario se cierra con mensaje de éxito |
| E4-F01-T02 | e2e | #1 | ANA3 tras T01 | Abre `/qa` | `contador-impedimentos-abiertos` pasa de 1 a 2; la fila de H4 muestra «Bloqueada»; el filtro «Solo bloqueadas» deja H3 y H4 |
| E4-F01-T03 | e2e | #2 negativo | ANA3, H4 | Completa todo salvo la descripción y guarda | Mensaje «La descripción es obligatoria» bajo el campo; no se crea nada (la lista de la HDU sigue sin filas) |
| E4-F01-T04 | e2e | #2 negativo | ANA3, H4 | Deja vacío el tipo; luego el título de 4 caracteres; luego una descripción de 1.001 caracteres; luego «Otro» como responsable sin nombre | Un mensaje por cada caso; el contador de la descripción impide pasar de 1.000; no se crea nada |
| E4-F01-T05 | e2e | #3 | ANA3 registra en H4 (T01); QE2 abre `/qe` | Revisa el bloque «Impedimentos abiertos» | `contador-impedimentos-abiertos` 2 y `contador-impedimentos-nuevos` 2; la fila de H4 tiene `insignia-nuevo`; la lista «Requiere mi acción» sigue como antes |
| E4-F01-T06 | e2e | #1 | QE1, H5 (sin analista) | Registra un impedimento `RECURSOS` con responsable QE1 | Se crea; H5 muestra «HDU bloqueada»; el autor figura como QE1 |
| E4-F01-T07 | e2e | #1 negativo | LID1, AUD1, ADM1, QE1 (en H3, de QE2) y ANA1 (en H3) | Abren `/hdu/<H3>` | LID1, AUD1 y ADM1 ven I1 y no existe `boton-registrar-impedimento`; QE1 y ANA1 ven acceso denegado |
| E4-F01-T08 | e2e | #1 negativo | ANA3, H7 (Cerrada) | Abre `/hdu/<H7>` | Ve I5 en el historial y el texto «HDU cerrada: no admite nuevos impedimentos»; sin botón |
| E4-F01-T09 | e2e | #1 | ANA1 con el servicio Impedimentos detenido | Abre `/hdu/<H1>` | La sección dice «No disponible» con «Reintentar»; el checklist y el resto del detalle cargan; no hay botón de registro |
| E4-F01-T10 | e2e | regresión | ANA1, QE1, ADM1 | Ejecuta las pruebas certificadas de E2-F04, E3-F01 y E7-F02 | Pasan sin cambios |

### E4-F02 · Quality Engineer (QE)

Quiero ver los impedimentos abiertos de mi equipo priorizados por antigüedad y riesgo. Para intervenir antes de que afecten la certificación.

| # | Criterio | Contexto | Evento | Resultado esperado |
| --- | --- | --- | --- | --- |
| 1 | Listado priorizado | Existen impedimentos abiertos en HDU de mi ámbito. | Abre «Impedimentos». | Se listan primero por riesgo vigente (Alto, Medio, Bajo) y luego por días abiertos, cada fila con HDU, analista, tipo, estado, responsable y días. Un resuelto solo aparece si activa «Incluir resueltos». |
| 2 | Sin impedimentos | No hay impedimentos abiertos en mi ámbito. | Abre «Impedimentos». | Se informa «Tu equipo no tiene bloqueos», con el contador en 0 y sin error. |
| 3 | Filtro por célula | Hay impedimentos en varias células. | Filtra por célula. | Se muestran solo los de la célula elegida; la URL conserva el filtro. Un filtro sin coincidencias dice «No hay impedimentos con esos filtros», distinto del caso sin bloqueos. |

Contenido de pantalla `/qe/impedimentos` (pestaña «Impedimentos»; la otra pestaña es `/qe/impedimentos/riesgo`, E4-F04):

| Elemento | Detalle |
| --- | --- |
| Contadores | `abiertos` (ABIERTO + ESCALADO), `escalados`, `nuevos` (menos de 24 h) |
| Tabla `lista-impedimentos` | Riesgo (semáforo con texto) · HDU (código y título) · Célula · Analista · Tipo · Título del impedimento · Estado · Responsable · Días abiertos · Registrado · Botón «Abrir» |
| Orden por defecto | Abiertos primero, riesgo vigente, días abiertos (D74). Ordenable por días, registro y riesgo |
| Filtros | Célula · Tipo · Estado (Abierto, Escalado, Resuelto) · Analista · Riesgo · búsqueda por código o título · «Incluir resueltos» (apagado por defecto) |
| Acción | «Abrir» lleva al detalle de la HDU con el impedimento a la vista. Las acciones de gestión están en el detalle (E4-F03) |
| Ámbito | HDU donde es QE responsable o cuyo analista supervisa (E2-B03). Sobre las HDU donde solo supervisa, las filas llevan el texto «Solo lectura» |
| Vacío / error / indisponible | «Tu equipo no tiene bloqueos» / error con «Reintentar» / si falla Certificaciones el riesgo dice «No disponible» y se ordena por días, informándolo |

Reglas de negocio:
- Ver D57, D64, D72, D74 y 3.4.
- Acceso solo para el QE (menú «Impedimentos», D71). Analista, Líder, Administrador y Auditor reciben acceso denegado en `/qe/impedimentos` (D41); el Líder, el Administrador y el Auditor consultan lo suyo en sus bandejas o pestañas.
- Si Impedimentos no responde, la pantalla muestra error con «Reintentar». Si Organización no responde no se puede armar la fila y se muestra el mismo error, nunca una lista vacía.
- Efecto sobre HDU certificada: opción nueva en el menú del QE (sección 6).

Casos de prueba:

| ID | Tipo | Escenario | Datos | Pasos | Resultado esperado |
| --- | --- | --- | --- | --- | --- |
| E4-F02-T01 | e2e | #1 | QE1 | Abre `/qe/impedimentos` | `abiertos` 2, `escalados` 1; la primera fila es I2 (H1, ANA1, ALTO rojo, 6 d, Abierto); la segunda I3 (H6, ANA1, MEDIO amarillo, 3 d, Escalado, responsable LID1); no están I1 ni I4 |
| E4-F02-T02 | e2e | #1 | QE2 | Abre `/qe/impedimentos` | Una fila: I1 (H3, ANA3, MEDIO, 0 d, `insignia-nuevo`); no aparecen I2 ni I3 |
| E4-F02-T03 | e2e | #1 | QE1 | Activa «Incluir resueltos» | 3 filas; I4 (H2, Resuelto) va última |
| E4-F02-T04 | e2e | #1 | QE1 | Ordena por días ascendente | Primero I3 (3 d) y luego I2 (6 d) |
| E4-F02-T05 | e2e | #2 | QE2 tras resolver I1 (E4-F03) | Abre `/qe/impedimentos` | `estado-vacio-impedimentos` con «Tu equipo no tiene bloqueos»; contadores en 0; sin mensaje de error (al terminar, reabre I1) |
| E4-F02-T06 | e2e | #3 | QE1 | Filtra célula = CEL-B; luego CEL-A; luego CEL-C | CEL-B: solo I3. CEL-A: solo I2. CEL-C: «No hay impedimentos con esos filtros» (no el mensaje de equipo sin bloqueos). La URL conserva `?celula=` |
| E4-F02-T07 | e2e | #3 | QE1 | Filtra tipo = `DEPENDENCIA`; luego busca «sandbox» | Ambos dejan solo I3 |
| E4-F02-T08 | e2e | #1 | QE1 con Certificaciones detenido | Abre `/qe/impedimentos` | Se listan I2 e I3; el riesgo de I2 dice «No disponible»; el de I3 muestra MEDIO (fijado); se informa el orden por días; los contadores siguen |
| E4-F02-T09 | e2e | #1 negativo | ANA1, LID1, ADM1, AUD1 | Abre `/qe/impedimentos` y `/qe/impedimentos/riesgo` | Acceso denegado en las 8 combinaciones; ninguna petición de datos devuelve 200 |
| E4-F02-T10 | e2e | #1 | QE1 | Pulsa «Abrir» en la fila de I2 | Abre `/hdu/<H1>` con I2 visible y el aviso «HDU bloqueada» |

### E4-F03 · Quality Engineer (QE)

Quiero resolver o escalar un impedimento registrando la acción tomada. Para dejar trazabilidad de la gestión.

| # | Criterio | Contexto | Evento | Resultado esperado |
| --- | --- | --- | --- | --- |
| 1 | Resolución | El impedimento está abierto y soy el QE responsable de la HDU. | Lo marca como resuelto con un comentario. | Queda Resuelto con su fecha, el comentario aparece en el historial y, si era el último abierto, la HDU deja de estar bloqueada. |
| 2 | Escalamiento | El impedimento excede mi ámbito. | Lo escala eligiendo a quién y registrando un comentario. | Queda Escalado con el destino como responsable; la HDU sigue bloqueada; el destino lo ve en su bandeja si es Líder o Administrador. |
| 3 | Reapertura | Un impedimento resuelto vuelve a ocurrir. | Lo reabre indicando el motivo. | Vuelve a Abierto, la HDU queda bloqueada otra vez y el historial anterior se conserva completo. |

Contenido de pantalla (detalle de la HDU, sección «Impedimentos», visible para el QE responsable):

| Elemento | Detalle |
| --- | --- |
| Fila de impedimento | Tipo · Título · Estado · Responsable · Autor · Abierto desde · Días · botón «Ver historial» |
| Acciones por estado | `ABIERTO`: «Resolver», «Escalar», «Agregar seguimiento». `ESCALADO`: «Resolver», «Escalar a otro», «Agregar seguimiento». `RESUELTO`: «Reabrir». Si la HDU está cerrada no hay ninguna |
| Cuadro «Resolver» | Comentario obligatorio (3 a 500) y «Confirmar» |
| Cuadro «Escalar» | Destino (candidatos de `ESCALAMIENTO` u «Otro (nombre)») y comentario obligatorio |
| Cuadro «Reabrir» | Motivo obligatorio (3 a 500) |
| Historial del impedimento | Cronológico, más antiguo primero: acción · actor y rol · fecha · estado anterior → nuevo · comentario |

Reglas de negocio:
- Ver D57, D59, D62, D64 y la matriz 3.6. Solo el QE responsable ve los botones. El QE supervisor (si no es responsable), el Analista, el Líder, el Administrador y el Auditor ven la fila y el historial sin botones.
- Si el estado cambió mientras el QE tenía el cuadro abierto (otra persona resolvió), la acción recibe 409 `TRANSICION_INVALIDA` y el portal muestra «El impedimento ya cambió de estado. Se actualizó la lista» y recarga.
- El Líder o el Administrador elegido como destino no puede actuar: solo ve el impedimento (D64).
- Efecto sobre HDU certificada: ninguno (detalle de HDU, sección 6).

Casos de prueba:

| ID | Tipo | Escenario | Datos | Pasos | Resultado esperado |
| --- | --- | --- | --- | --- | --- |
| E4-F03-T01 | e2e | #1 | QE1, I2 (H1) | En `/hdu/<H1>` pulsa «Resolver», escribe «Se entregaron las cuentas de prueba» y confirma | I2 queda Resuelto con fecha de hoy y el comentario en el historial; desaparece `hdu-bloqueada`; en `/qe/impedimentos` solo queda I3 |
| E4-F03-T02 | e2e | #1 negativo | QE1, I2 | Abre «Resolver» y confirma con el comentario vacío o de 2 caracteres | «Indica la acción tomada»; el estado no cambia |
| E4-F03-T03 | e2e | #2 | QE1, I2 | Pulsa «Escalar», elige LID1 y escribe «Requiere gestión con TI» | I2 queda Escalado con responsable LID1; H1 sigue con `hdu-bloqueada`; el historial muestra la acción ESCALAR |
| E4-F03-T04 | e2e | #2 | LID1 tras T03 | Abre `/lider` | `escalados-a-mi` 2 (I2 e I3); el bloque `lista-impedimentos` muestra ambos; ningún botón de gestión |
| E4-F03-T05 | e2e | #2 negativo | QE1, I2 | Abre el selector de «Escalar» | Ofrece LID1, ADM1 y «Otro (nombre)»; no ofrece QE1, QE2, ANA1–ANA4 ni LID2 (sin células) |
| E4-F03-T06 | e2e | #3 | QE1, I4 (Resuelto, H2) | Pulsa «Reabrir» y escribe «Volvió a cambiar el criterio» | I4 pasa a Abierto con 0 días; H2 muestra `hdu-bloqueada`; el historial lista REGISTRAR, RESOLVER, REABRIR en ese orden |
| E4-F03-T07 | e2e | #1 negativo | ANA1 y QE2 | ANA1 abre `/hdu/<H1>`; QE2 abre `/hdu/<H1>` | ANA1 ve I2 y su historial sin botones de gestión; QE2 ve acceso denegado |
| E4-F03-T08 | e2e | #1 negativo | LID1, AUD1, ADM1 | Abren `/hdu/<H6>` | Ven I3 con su historial; no existe ningún botón de gestión ni formulario |
| E4-F03-T09 | e2e | #1 | QE1, I2 | Pulsa «Agregar seguimiento» y escribe «Llamé a TI, respuesta mañana» | El historial suma SEGUIMIENTO; el estado sigue Abierto; la HDU sigue bloqueada |
| E4-F03-T10 | e2e | #1 negativo | QE1 (responsable de H2) y QE2 tras reasignar H2 a QE2 (D54) | QE1 (que sigue supervisando a ANA2) abre `/qe/impedimentos` con «Incluir resueltos» y `/hdu/<H2>` | Ve I4 con «Solo lectura» y sin botones; QE2 ahora sí ve «Reabrir» |
| E4-F03-T11 | e2e | #2 | QE1, I2 | Escala a ADM1 y luego entra ADM1 a `/admin` | `lista-impedimentos-escalados` de ADM1 muestra I2; sin botones de gestión |

### E4-F04 · Quality Engineer (QE)

Quiero establecer y visualizar el nivel de riesgo de cada HDU. Para priorizar la supervisión.

| # | Criterio | Contexto | Evento | Resultado esperado |
| --- | --- | --- | --- | --- |
| 1 | Nivel de riesgo | El QE responsable abre el detalle de una HDU. | Selecciona Alto, Medio o Bajo, escribe la justificación y confirma. | Se guarda con su autor y fecha, se muestra con un semáforo y el origen cambia a «Fijado por …». |
| 2 | Riesgo sugerido | La HDU tiene impedimentos abiertos o atraso en el sprint. | Abre el detalle. | Ve el nivel sugerido con los factores que lo explican y puede confirmarlo («Usar el sugerido») o fijar otro; si hay un nivel fijado distinto, se avisa «La sugerencia actual es X». |
| 3 | Listado por riesgo | Existen HDU con distintos niveles. | Abre «Riesgo por HDU» y filtra por Alto. | Se muestran solo las HDU de riesgo alto, ordenadas por riesgo y por impedimentos abiertos. |

Contenido de pantalla:

| Elemento | Detalle |
| --- | --- |
| Panel `panel-riesgo` (detalle de HDU, no visible para el Analista) | Semáforo con nivel vigente y origen («Sugerido» o «Fijado por QE1 el …» con la justificación) · Sugerencia con sus factores en lenguaje claro («Impedimento abierto hace 6 días», «El sprint termina en 2 días y el avance es 30 %») · Historial de cambios de nivel |
| Botones (solo QE responsable) | «Fijar riesgo» abre `form-riesgo` con 3 opciones y justificación (3 a 500). «Usar el sugerido» precarga el nivel; la justificación sigue siendo obligatoria |
| Pestaña «Riesgo por HDU» `/qe/impedimentos/riesgo` | Nivel (semáforo con texto) · HDU · Título · Célula · Sprint · Analista · Estado · Avance · Impedimentos abiertos · Origen (Fijado/Sugerido) · Actualizado |
| Orden por defecto | Riesgo vigente (Alto primero), impedimentos abiertos, código |
| Filtros | Nivel · Célula · Sprint · Analista · Estado (por defecto, no cerradas) · «Solo bloqueadas» · búsqueda |
| Ámbito | El mismo del QE (D57) |
| Vacío | «No hay HDU con ese nivel de riesgo» (con filtro) o «No tienes HDU en tu ámbito» |
| Fuente caída | Si Certificaciones no responde, las HDU con nivel fijado muestran su nivel; las demás dicen «No disponible»; un filtro por nivel deja la lista `indisponible` (D46) |

Reglas de negocio:
- Ver D66–D68, D73 y 3.4. El Analista no ve el panel ni la columna. Líder, Administrador y Auditor ven el panel sin botones; el Líder y el Auditor ven el nivel en sus listados según la sección 6.
- Fijar un nivel no cambia la sugerencia, que se sigue calculando. Se guarda también el nivel sugerido al momento de fijar.
- Efecto sobre HDU certificada: panel nuevo en el detalle y pestaña nueva (sección 6).

Casos de prueba:

| ID | Tipo | Escenario | Datos | Pasos | Resultado esperado |
| --- | --- | --- | --- | --- | --- |
| E4-F04-T01 | e2e | #1 | QE1, H2 (sugerido MEDIO) | Pulsa «Fijar riesgo», elige Alto, escribe «El cliente exige la entrega» y confirma | `semaforo-riesgo` con `data-nivel="ALTO"` y texto «Alto»; origen «Fijado por QE1»; la sugerencia sigue mostrando MEDIO |
| E4-F04-T02 | e2e | #1 negativo | QE1, H2 | Confirma sin justificación; luego con 501 caracteres | «La justificación es obligatoria» y «Máximo 500 caracteres»; no se guarda |
| E4-F04-T03 | e2e | #2 | QE1, H1 | Abre `/hdu/<H1>` | `riesgo-sugerido` ALTO con 3 factores (impedimento abierto, impedimento de 6 días, atraso del sprint con avance 30 %); origen «Sugerido» |
| E4-F04-T04 | e2e | #2 | QE2, H3 y H4 | Abre cada detalle | H3: MEDIO con el factor de impedimento abierto. H4: BAJO con «Sin factores de riesgo» |
| E4-F04-T05 | e2e | #2 | QE1, H1 | Pulsa «Usar el sugerido», escribe la justificación y confirma | El nivel queda ALTO con origen «Fijado por QE1»; sin justificación no deja confirmar |
| E4-F04-T06 | e2e | #3 | QE1 | Abre `/qe/impedimentos/riesgo`; filtra Alto; luego Medio; luego Bajo | Sin filtro: H1, H5, H6, H2, H8 en ese orden. Alto: H1 y H5. Medio: H6 y H2. Bajo: H8. No aparecen H3, H4 ni H7 |
| E4-F04-T07 | e2e | #3 | QE2 | Abre la pestaña; filtra Alto | Sin filtro: H3 (MEDIO), H4 (BAJO). Con Alto: «No hay HDU con ese nivel de riesgo» |
| E4-F04-T08 | e2e | #2 | QE1, H6 | Abre `/hdu/<H6>` | Nivel vigente MEDIO «Fijado por QE1» con su justificación y el aviso «La sugerencia actual es Alto» |
| E4-F04-T09 | e2e | #1 negativo | ANA1, QE2, LID1, AUD1, ADM1 | ANA1 y QE2 abren `/hdu/<H1>`; LID1, AUD1 y ADM1 abren el mismo detalle | ANA1: no existe `panel-riesgo`. QE2: acceso denegado. LID1, AUD1 y ADM1: ven el panel sin «Fijar riesgo» ni «Usar el sugerido» |
| E4-F04-T10 | e2e | #2 | QE1 con Certificaciones detenido | Abre `/hdu/<H1>`, `/hdu/<H8>` y `/hdu/<H6>` | H1: ALTO con `calculoParcial` y el aviso «Cálculo parcial». H8: «No disponible» (no Bajo). H6: MEDIO fijado visible |

## 10. HDU de backend

### E4-B01 · Analista QA

Quiero que el sistema registre los impedimentos como entidad vinculada a la HDU. Para gestionarlos con estados y responsables.

| # | Criterio | Contexto | Evento | Resultado esperado |
| --- | --- | --- | --- | --- |
| 1 | Creación | Se recibe un impedimento válido de quien puede registrar en la HDU. | Se procesa. | 201 con el impedimento guardado con HDU, ciclo de certificación activo (si existe), tipo, título, descripción, creador (id, nombre y rol), responsable y fechas, en estado `ABIERTO`, y una acción `REGISTRAR`. |
| 2 | Bloqueo de la HDU | Se crea un impedimento abierto. | Se consulta la HDU. | La evaluación de la HDU informa `bloqueada: true` y el conteo de abiertos sube; una HDU sin impedimentos abiertos informa `false`. |
| 3 | Ámbito | Un analista registra en una HDU ajena, o lo intenta un rol sin permiso. | Se procesa. | 403 `ACCESO_DENEGADO` sin crear nada. Una HDU cerrada responde 409 `HDU_CERRADA`. |

Reglas de negocio:
- Contrato `POST /v1/hdu/{hduId}/impedimentos` con `{tipo, titulo, descripcion, responsableId?, responsableNombre?}`; D57, D58, D63 y la matriz 3.6.
- El ciclo activo se pide a Certificaciones; si esta no responde, el registro se acepta con `certificacionId: null` (el vínculo operativo es `id_historia`, D58). El impedimento nunca crea el ciclo.
- Validaciones: título de 5 a 200; descripción de 10 a 1000 (20 si el tipo es `OTRO`); tipo del catálogo; si hay `responsableId`, debe estar entre los candidatos de `REGISTRO` (422 `RESPONSABLE_INVALIDO`), y sin `responsableId` hace falta `responsableNombre`.
- Estados de HDU que admiten registro: `PENDIENTE`, `DISENO_PRUEBAS`, `EN_EJECUCION` y `PENDIENTE_CIERRE`.
- La creación y su acción `REGISTRAR` van en una sola transacción.

Casos de prueba:

| ID | Tipo | Escenario | Datos | Pasos | Resultado esperado |
| --- | --- | --- | --- | --- | --- |
| E4-B01-T01 | api | #1 | QE1, H5 (PENDIENTE, sin ciclo) | `POST /v1/hdu/{H5}/impedimentos` con `RECURSOS`, título, descripción de 30 caracteres y `responsableId` = QE1 | 201; `estado ABIERTO`, `certificacionId null`, `creadoPor` QE1 con rol `QE`, `diasAbierto 0`, `abiertoDesde` = `fechaRegistro` |
| E4-B01-T02 | api | #1 | ANA1, H1 (con ciclo) | `POST` con `AMBIENTE` y `responsableNombre` «Equipo de Infraestructura» | 201; `certificacionId` = id del ciclo activo de H1; `responsable {id null, nombre «Equipo de Infraestructura»}`; `creadoPor` ANA1 con rol `ANALISTA_QA` |
| E4-B01-T03 | api | #1 | ANA1, tras T02 | `GET /v1/impedimentos/{id}` | `acciones` con una entrada `REGISTRAR`: `estadoAnterior null`, `estado ABIERTO`, actor ANA1, fecha |
| E4-B01-T04 | api | #2 | QE1, H5 tras T01 | `POST /v1/interno/impedimentos/evaluacion` y `GET /v1/hdu/{H5}/impedimentos` | H5: `bloqueada true`, `abiertos 1`. H4 (sin impedimentos): `bloqueada false`, `abiertos 0` |
| E4-B01-T05 | api | #1 negativo | ANA3, H4 | `POST` sin título; sin descripción; descripción de 9 y de 1.001 caracteres; tipo `INVENTADO`; sin `responsableId` ni nombre | 400 `VALIDACION` en cada uno con el `campo` correspondiente (el tipo con `VALOR_NO_PERMITIDO`); no se crea ninguna fila |
| E4-B01-T06 | api | #1 negativo | ANA3, H4 | `POST` con `responsableId` = ANA1, otro con un id inexistente, otro con `responsableNombre` de 2 caracteres | 422 `RESPONSABLE_INVALIDO` ×2; 400 el tercero; sin filas |
| E4-B01-T07 | api | #3 negativo | ANA1 en H3 (de ANA3); ANA3 en H5; ANA4 en H1 | `POST` en cada una | 403 `ACCESO_DENEGADO` en las 3, con cuerpo idéntico; sin filas |
| E4-B01-T08 | api | #3 negativo | QE2, LID1, AUD1, ADM1 en H1; sin token | `POST` en H1 | 403 ×4 (QE2 ni es responsable ni supervisa; los otros tres son de solo lectura o no operan) y 401 `NO_AUTENTICADO`; H1 conserva solo I2 |
| E4-B01-T09 | api | #3 negativo | ANA3, H7 (CERRADA); ANA3, id de HDU inexistente | `POST` en ambas | 409 `HDU_CERRADA` en H7; 403 en la inexistente; sin filas |
| E4-B01-T10 | api | #1 | Prueba de base de datos con `svc_impedimentos` | Inspecciona `impedimento`, inserta un `tipo` fuera del catálogo y un `RESUELTO` sin `fecha_resolucion` | No existen llaves foráneas hacia otros esquemas; los dos INSERT fallan por CHECK |

### E4-B02 · Quality Engineer (QE)

Quiero que el sistema controle el ciclo de vida de los impedimentos. Para mantener la información consistente.

| # | Criterio | Contexto | Evento | Resultado esperado |
| --- | --- | --- | --- | --- |
| 1 | Estados válidos | El impedimento está abierto (o escalado) y quien lo pide es el QE responsable. | Se solicita resolver o escalar. | Se acepta, el estado cambia según la tabla 3.2 y se registra una acción con actor, rol, fecha, estado anterior y nuevo. |
| 2 | Desbloqueo | Se resuelve el último impedimento abierto o escalado de la HDU. | Se procesa. | La HDU deja de estar bloqueada. Si quedan otros abiertos, sigue bloqueada. |
| 3 | Transición inválida | El impedimento está resuelto. | Se solicita escalar. | 409 `TRANSICION_INVALIDA` con el mensaje «Un impedimento resuelto solo puede reabrirse»; no se registra nada. |

Reglas de negocio:
- Operaciones `resolver`, `escalar`, `reabrir` y `seguimiento` de la sección 5, con la tabla de transiciones 3.2 y el bloqueo de fila de D62.
- `escalar` cambia `responsable_id` y `responsable_nombre` y deja `detalle {responsableAnterior, responsableNuevo}` en la acción; el destino debe estar en los candidatos de `ESCALAMIENTO` o ir como `responsableNombre`.
- `reabrir` borra `fecha_resolucion`, reinicia `abierto_desde` y conserva `fecha_registro` y todas las acciones previas.
- Una HDU `CERRADA` rechaza cualquier operación con 409 `HDU_CERRADA`.
- Cierre de la HDU (D60): `PUT` de estado a `CERRADA` con impedimentos abiertos o escalados responde 409 `HDU_BLOQUEADA` con la lista (código, título y estado, hasta 20). Lo implementa Organización con `POST /v1/interno/impedimentos/evaluacion`.
- Operaciones sin permiso: 403, con la misma regla que B01.

Casos de prueba:

| ID | Tipo | Escenario | Datos | Pasos | Resultado esperado |
| --- | --- | --- | --- | --- | --- |
| E4-B02-T01 | api | #1 | QE1, I2 | `POST /v1/impedimentos/{I2}/resolver` con comentario | 200; `estado RESUELTO`, `fechaResolucion` con valor; nueva acción `RESOLVER`: actor QE1, `estadoAnterior ABIERTO`, `estado RESUELTO`, comentario |
| E4-B02-T02 | api | #1 | QE1, I2 | `POST …/escalar` con `responsableId` = LID1 y comentario | 200; `ESCALADO`, `responsable` LID1; acción `ESCALAR` con `detalle.responsableAnterior` QE1 y `responsableNuevo` LID1 |
| E4-B02-T03 | api | #2 | QE1, H1 (solo I2) y H6 (solo I3) | Resuelve I2 y luego I3 | Tras cada una, la evaluación de H1 y de H6 informa `bloqueada false` y `abiertos 0` |
| E4-B02-T04 | api | #2 | ANA1, QE1, H1 | ANA1 registra un segundo impedimento en H1; QE1 resuelve I2 | H1 sigue `bloqueada true` con `abiertos 1`; al resolver el segundo pasa a `false` |
| E4-B02-T05 | api | #3 negativo | QE1, I4 (RESUELTO) | `escalar`; `resolver`; `seguimiento` | 409 `TRANSICION_INVALIDA` ×3; las acciones de I4 siguen siendo 2 |
| E4-B02-T06 | api | #1 | QE1, I3 (ESCALADO) | `escalar` a ADM1; `resolver` sobre otro ESCALADO; `reabrir` sobre I3 | `escalar` 200 (sigue ESCALADO, responsable ADM1, acción con anterior LID1); `resolver` 200; `reabrir` sobre un no resuelto 409 `TRANSICION_INVALIDA` |
| E4-B02-T07 | api | #1 | QE1, I4 | `POST …/reabrir` con motivo | 200; `ABIERTO`, `fechaResolucion null`, `abiertoDesde` = ahora, `fechaRegistro` sin cambio; `acciones` = REGISTRAR, RESOLVER, REABRIR |
| E4-B02-T08 | api | #1 negativo | QE1, I2 | `resolver` sin comentario; con comentario en blanco; `escalar` sin destino; `escalar` con destino ANA1, QE2 y LID2 | 400; 422 `COMENTARIO_REQUERIDO`; 400; 422 `RESPONSABLE_INVALIDO` ×3; el estado de I2 no cambia |
| E4-B02-T09 | api | #1 negativo | ANA1, QE2, LID1, AUD1, ADM1 sobre I2 (ABIERTO) y I4 (RESUELTO); sin token | Cada rol invoca `resolver`, `escalar` y `reabrir`; luego sin token | 403 `ACCESO_DENEGADO` en las 15 combinaciones y 401 `NO_AUTENTICADO` sin token; los estados no cambian |
| E4-B02-T10 | api | #1 | QE1, I2 | Dos `resolver` simultáneos | Uno responde 200 y el otro 409 `TRANSICION_INVALIDA`; hay una sola acción `RESOLVER` |
| E4-B02-T11 | api | #3 | QE2, I5 (H7 CERRADA) | `reabrir` | 409 `HDU_CERRADA`; I5 sigue resuelto |
| E4-B02-T12 | api | #2 | QE1, H8 (PENDIENTE_CIERRE, 10 aprobados) | QE1 registra un impedimento en H8 y pide el estado `CERRADA` | 409 `HDU_BLOQUEADA` con el impedimento en la lista; H8 sigue `PENDIENTE_CIERRE`; al resolverlo, el cierre ya no responde `HDU_BLOQUEADA` (no se ejecuta para no cerrar H8) |
| E4-B02-T13 | api | #2 | QE1, H8 con el servicio Impedimentos detenido | Pide el estado `CERRADA` | 503 `SERVICIO_NO_DISPONIBLE`; H8 sigue `PENDIENTE_CIERRE` |
| E4-B02-T14 | api | regresión | QE1, ADM1 | Ejecuta las pruebas certificadas de E2-B02 (incluido el cierre con checklist completo y sin impedimentos) y E7-B03 | Pasan sin cambios |

### E4-B03 · Quality Engineer (QE)

Quiero que el sistema calcule un riesgo sugerido a partir de impedimentos y atraso. Para apoyar la priorización del QE.

| # | Criterio | Contexto | Evento | Resultado esperado |
| --- | --- | --- | --- | --- |
| 1 | Impedimento abierto | La HDU tiene un impedimento abierto. | Se calcula el riesgo. | Se sugiere al menos Medio; Alto si lleva 5 días o más abierto o está escalado. |
| 2 | Atraso en sprint | La HDU está por cerrar el sprint con avance bajo, o el sprint ya venció. | Se calcula el riesgo. | Se sugiere Alto (faltan 3 días o menos y avance menor a 70 %, o sprint vencido) o Medio (faltan 7 días o menos y avance menor a 50 %). |
| 3 | Confirmación manual | El QE responsable fija un nivel distinto del sugerido. | Se guarda. | Prevalece el valor del QE como nivel vigente, se registra la justificación y se conserva el sugerido de ese momento. |

Reglas de negocio:
- Contrato `GET /v1/hdu/{hduId}/riesgo` (nivel vigente, origen, sugerido, `factores`, `calculoParcial`, `estado ok|indisponible`) y `PUT /v1/hdu/{hduId}/riesgo` con `{nivel, justificacion}`; D66–D69, tabla 3.4 y matriz 3.6.
- `PUT` agrega una fila a `riesgo_hdu` con `nivel_anterior` (el último fijado, o `null`), `sugerido_al_fijar`, actor y fecha. Repetir el mismo nivel con la misma justificación no agrega filas (`cambio: false`).
- `PUT` válida: nivel del catálogo (400 `VALIDACION` con `VALOR_NO_PERMITIDO`), justificación de 3 a 500 (400; en blanco, 422 `JUSTIFICACION_REQUERIDA`), HDU no cerrada (409 `HDU_CERRADA`).
- Analista: `GET` responde 403 (D73).
- Para pruebas, `Q360_FECHA_REFERENCIA` reemplaza a «hoy» (D68).

Casos de prueba:

| ID | Tipo | Escenario | Datos | Pasos | Resultado esperado |
| --- | --- | --- | --- | --- | --- |
| E4-B03-T01 | api | #1 | QE2, H3 | `GET /v1/hdu/{H3}/riesgo` | `nivelSugerido MEDIO`; `factores` = [`IMPEDIMENTO_ABIERTO`]; `nivelVigente MEDIO`, origen `SUGERIDO` |
| E4-B03-T02 | api | #1 | QE1, H1 | `GET …/riesgo` | `nivelSugerido ALTO`; factores `IMPEDIMENTO_ABIERTO`, `IMPEDIMENTO_ANTIGUO` (6 días) y `ATRASO_SPRINT_ALTO` (2 días, avance 30) |
| E4-B03-T03 | api | #2 | QE1, H2, H5 y H6 | `GET …/riesgo` de cada una | H2: `MEDIO` con `ATRASO_SPRINT_MEDIO` (6 días, avance 10). H5: `ALTO` con `SPRINT_VENCIDO`. H6: sugerido `ALTO` con `IMPEDIMENTO_ESCALADO`, pero `nivelVigente MEDIO` y origen `MANUAL` |
| E4-B03-T04 | api | #2 | QE1 y QE2 | `GET …/riesgo` de H8, H4 y H7 | H8 y H4: `BAJO` con `factores []`. H7: `nivelSugerido null`, motivo `HDU_CERRADA`, vigente sin evaluar |
| E4-B03-T05 | api | #1 | QE1, H8 | Registra un impedimento nuevo en H8 y consulta | `nivelSugerido MEDIO` exacto (0 días de antigüedad, sprint lejano) con `IMPEDIMENTO_ABIERTO` |
| E4-B03-T06 | api | #1 | QE1 y QE2 | Resuelve I2 y consulta H1; resuelve I1 y consulta H3 | H1 sigue `ALTO` (solo `ATRASO_SPRINT_ALTO`); H3 baja a `BAJO` sin factores |
| E4-B03-T07 | api | #3 | QE1, H1 | `PUT …/riesgo` con `BAJO` y justificación «Se acordó con el PO ampliar el sprint» | 200 `cambio true`; `GET` → `nivelVigente BAJO`, origen `MANUAL`, `nivelSugerido ALTO`, `sugeridoAlFijar ALTO`, justificación y autor visibles |
| E4-B03-T08 | api | #3 negativo | QE1, H1 | `PUT` con nivel `CRITICO`; sin justificación; justificación de 501 caracteres; justificación en blanco | 400 `VALIDACION` ×3 y 422 `JUSTIFICACION_REQUERIDA`; sin filas nuevas en `riesgo_hdu` |
| E4-B03-T09 | api | #3 negativo | QE2, ANA1, LID1, AUD1, ADM1 sobre H1; sin token | `PUT` y `GET` | `PUT`: 403 en los 5. `GET`: 403 para QE2 y ANA1; 200 para LID1, AUD1 y ADM1. Sin token: 401 |
| E4-B03-T10 | api | #3 | QE2, H7 (CERRADA) | `PUT …/riesgo` | 409 `HDU_CERRADA` |
| E4-B03-T11 | api | #2 | QE1, con `Q360_FECHA_REFERENCIA` = hoy + 3, hoy − 1 y hoy − 2 | `GET …/riesgo` de H2; con hoy + 3 también de H6 | hoy + 3: H2 `ALTO` (3 días, avance 10, `ATRASO_SPRINT_ALTO`) y H6 incluye `SPRINT_VENCIDO`. hoy − 1: H2 `MEDIO` (7 días, `ATRASO_SPRINT_MEDIO`). hoy − 2: H2 `BAJO` (8 días, sin factores) |
| E4-B03-T12 | api | #2 | QE1 con Certificaciones detenido | `GET …/riesgo` de H1, H8 y H6 | H1: `ALTO`, `calculoParcial true`, atraso `indisponible`. H8: `nivelSugerido null`, `estado indisponible` (no `BAJO`). H6: vigente `MEDIO` (fijado) con sugerido `ALTO` por escalado |

### E4-B04 · Administrador

Quiero que el sistema audite la gestión de impedimentos y riesgos. Para tener trazabilidad de las intervenciones.

| # | Criterio | Contexto | Evento | Resultado esperado |
| --- | --- | --- | --- | --- |
| 1 | Registro | Cambia el estado de un impedimento o el nivel de riesgo. | Se confirma. | Se registra actor, rol, fecha, valor anterior y nuevo, en la misma transacción del cambio; un intento rechazado (403, 409) no deja registro. |
| 2 | Consulta | Un usuario con acceso a la HDU, o el Auditor, pide el historial. | Se procesa. | Se devuelve en orden cronológico (más antiguo primero; admite el inverso), con impedimentos y cambios de riesgo, filtrable por fechas. |
| 3 | Retención | Se cierra la HDU. | Se consulta el historial. | Se conserva el registro completo; nada se puede editar ni borrar. |

Reglas de negocio:
- Fuentes: `accion_impedimento` (REGISTRAR, ESCALAR, RESOLVER, REABRIR, SEGUIMIENTO) y `riesgo_hdu`, ambas de solo inserción (D65, D70). Cada entrada trae `tipo` (`IMPEDIMENTO` o `RIESGO`), acción, impedimento afectado, actor y rol, fecha, anterior, nuevo y comentario. El Analista recibe solo las entradas de impedimentos (D73).
- `GET /v1/hdu/{hduId}/gestion-impedimentos` (por relación con la HDU, incluido el Administrador). `GET /v1/auditor/impedimentos` y `GET /v1/auditor/gestion-impedimentos` (todas las HDU, filtros `desde`, `hasta`, `hduId`, `actorId`, `estado`, `tipo`, `accion`) y `GET /v1/auditor/exportaciones/{impedimentos|gestion-impedimentos}`: solo Auditor (el Administrador recibe 403 aquí, D38 y D53).
- Exportación: CSV UTF-8 con BOM, separador `;`, fechas ISO 8601, límite de 50.000 filas y registro previo en la auditoría de Organización (D48).
- Los nombres de actor se guardan como instantánea: desactivar al usuario no altera el historial.
- Pestaña del Auditor `/auditor/impedimentos`: vista «Impedimentos» (Fecha de registro · HDU · Tipo · Título · Estado · Responsable · Registrado por · Días abiertos · Fecha de resolución) y vista «Gestión» (Fecha · HDU · Tipo de evento · Acción · Impedimento · Actor · Anterior → Nuevo · Comentario), con filtros, orden, paginación y «Exportar CSV». Sin ninguna acción de escritura.
- Efecto sobre HDU certificada: pestaña nueva y exportaciones (sección 6).

Casos de prueba:

| ID | Tipo | Escenario | Datos | Pasos | Resultado esperado |
| --- | --- | --- | --- | --- | --- |
| E4-B04-T01 | api | #1 | QE1, I2 | Resuelve I2 y consulta `GET /v1/hdu/{H1}/gestion-impedimentos` | La última entrada: acción `RESOLVER`, actor QE1 con rol `QE`, fecha, `anterior ABIERTO`, `nuevo RESUELTO`, comentario |
| E4-B04-T02 | api | #1 | QE1, H6 (fijado MEDIO) | `PUT …/riesgo` con `ALTO` y justificación | Nueva entrada de tipo `RIESGO`: `anterior MEDIO`, `nuevo ALTO`, `sugeridoAlFijar ALTO`, actor QE1 y justificación |
| E4-B04-T03 | api | #2 | QE1, H6 (estado base) | `GET /v1/hdu/{H6}/gestion-impedimentos` | 3 entradas en este orden: REGISTRAR de I3 (hace 3 días), cambio de riesgo a MEDIO (hace 2 días), ESCALAR de I3 (hace 1 día) |
| E4-B04-T04 | api | #2 | QE1, H6 | Mismo `GET` con `orden=fecha:desc`; con `desde` = hace 2 días; con `hasta` = hace 3 días | Desc: ESCALAR, RIESGO, REGISTRAR. `desde`: las 2 más recientes. `hasta`: solo REGISTRAR |
| E4-B04-T05 | api | #2 | ANA1, ANA3, LID1, AUD1, ADM1 sobre H6; sin token | `GET gestion-impedimentos` | ANA1: 200 con 2 entradas (sin la de riesgo). ANA3: 403. LID1, AUD1 y ADM1: 200 con 3. Sin token: 401 |
| E4-B04-T06 | api | #3 | AUD1, H7 (CERRADA) | `GET /v1/hdu/{H7}/gestion-impedimentos` | 2 entradas de I5 (REGISTRAR y RESOLVER) con actores y fechas originales, íntegras tras el cierre |
| E4-B04-T07 | api | #3 | Prueba de base de datos con `svc_impedimentos`; QE1 por API | UPDATE y DELETE sobre `accion_impedimento` y `riesgo_hdu`; `PUT` o `DELETE` sobre `/v1/impedimentos/{id}/acciones/{n}` | Las 4 sentencias fallan por permisos (42501); las rutas responden 404 o 405; no cambia ninguna fila |
| E4-B04-T08 | api | #1 negativo | QE1, QE2, ANA1, I2 y H1 | Cuenta las entradas de H1; intentos fallidos: ANA1 `resolver` (403), QE1 `reabrir` sobre I2 abierto (409), QE2 `PUT riesgo` (403); cuenta de nuevo | Sin cambios: ningún intento fallido deja entradas |
| E4-B04-T09 | api | #2 | AUD1 | `GET /v1/auditor/impedimentos` y `GET /v1/auditor/gestion-impedimentos` | 5 impedimentos (I1–I5) y 9 entradas de gestión (8 acciones y 1 cambio de riesgo); con `hduId` = H7 solo las de I5; con `tipo=DEPENDENCIA` solo I3 |
| E4-B04-T10 | api | #2 negativo | ADM1, QE1, LID1, ANA1; sin token | Invocan los 2 endpoints de consulta y los 2 de exportación | 403 `ACCESO_DENEGADO` en los 16 intentos y 401 sin token |
| E4-B04-T11 | api | #2 | AUD1 | Exporta `impedimentos` y consulta la auditoría de usuarios | CSV con BOM, separador `;` y 6 líneas (encabezado y 5 filas); `X-Q360-Filas` 5; la última entrada de auditoría es la exportación con AUD1, recurso y filtros |
| E4-B04-T12 | e2e | #2 | AUD1 | Abre `/auditor`, la pestaña «Impedimentos» y sus dos vistas; revisa los controles | Contadores `impedimentos-abiertos` 3 y `hdu-bloqueadas` 3; 5 filas en «Impedimentos» y 9 en «Gestión»; «Exportar CSV» presente; ningún `button[type=submit]` ni acción de escritura |

## 11. Totales y trazabilidad

| HDU | Escenarios | Casos de prueba | Servicio / dueño |
| --- | --- | --- | --- |
| E4-F01 | 3 | 10 | Portal (`q360-frontend`) |
| E4-F02 | 3 | 10 | Portal |
| E4-F03 | 3 | 11 | Portal |
| E4-F04 | 3 | 10 | Portal |
| E4-B01 | 3 | 10 | Impedimentos (`q360-backend`) |
| E4-B02 | 3 | 14 | Impedimentos, con Organización para el cierre (`q360-backend`) |
| E4-B03 | 3 | 12 | Impedimentos (`q360-backend`) |
| E4-B04 | 3 | 12 | Impedimentos, Organización para el registro de exportaciones (`q360-backend`) |
| **Total** | **24** | **89** | |

Regresión de HDU certificadas dentro del total: E4-F01-T10 y E4-B02-T14. Negativos de acceso por rol: E4-F01-T07, T08, E4-F02-T09, E4-F03-T07, T08, T10, E4-F04-T09, E4-B01-T07, T08, T09, E4-B02-T05, T09, T11, E4-B03-T08, T09, T10, E4-B04-T05, T08, T10.

| Capacidad | Frontend | Backend |
| --- | --- | --- |
| Registrar | E4-F01 | E4-B01 |
| Ver y priorizar | E4-F02 | E4-B01, E4-B03 |
| Resolver, escalar, reabrir; cierre | E4-F03 | E4-B02 |
| Nivel de riesgo | E4-F04 | E4-B03 |
| Trazabilidad y Auditor | (pestaña en E4-B04-T12) | E4-B04 |

Trabajo adicional fuera de las 8 HDU, que los agentes deben contemplar: contrato `impedimentos.v1.yaml` (`q360-arquitecto`); migración y semilla E4 (`q360-backend`, `q360-integraciones`); rutas del gateway para `/v1/hdu/{id}/impedimentos|riesgo|gestion-impedimentos`, `/v1/impedimentos*`, `/v1/riesgo/*` (`q360-seguridad-gateway`); bloques nuevos de bandeja en Organización y en el portal; verificación de cierre en Organización (D60); variables `Q360_FECHA_REFERENCIA` y `RIESGO_*`. Certificación: `q360-qa` emite el dictamen por HDU en `docs/validacion/certificacion-e4.md`, con el ID del escenario en el nombre de cada prueba (`[E4-F03#2]`), la regresión de la sección 6 y axe sobre las pantallas nuevas.

Insumo para E6: por HDU, `bloqueada`, `impedimentosAbiertos` y `nivelVigente` salen de `POST /v1/interno/impedimentos/evaluacion`; el riesgo máximo y los abiertos por célula se agregan sobre eso, sin cambiar esta épica.

## 12. Preguntas abiertas

Ninguna bloquea la construcción. Quedan decididas por criterio y se pueden revertir con poco costo:

1. **El Administrador solo lee (D57).** Si debe poder resolver o reabrir impedimentos de un QE ausente, se agrega la relación `ADMINISTRADOR` a las operaciones de gestión y 3 casos negativos pasan a positivos. Hoy resuelve esa ausencia reasignando el QE (D54).
2. **El Analista no ve el riesgo (D73).** Si debe verlo, se quita el 403 de `GET riesgo` y se muestra el panel sin botones (cambia E4-B03-T09 y E4-F04-T09).
3. **El cierre se bloquea con cualquier impedimento abierto (D60).** Si se prefiere solo advertir, el 409 pasa a un aviso y se retiran E4-B02-T12 y T13.
4. **Umbrales del riesgo (D67).** 5 días, 3 y 7 días, 70 % y 50 % son una propuesta; cambian por configuración sin tocar código ni los casos, salvo los valores de E4-B03-T02, T03 y T11.
5. **Escalar a un QE no es posible (D64).** Un QE ajeno a la HDU no tendría acceso (D12). Si se quiere permitirlo, hace falta una relación de acceso nueva por impedimento.
6. **Supuestos de la semilla.** Confirmar con `q360-integraciones` que E7 no afirma fechas de sprint, que H4 puede quedar en SP-LEJ y que H2 tiene 1 entregable aprobado (el 2 rechazado, D17). Si H4 tiene otro avance, solo cambia el detalle de E4-F04-T04, no el nivel (BAJO por sprint lejano).
