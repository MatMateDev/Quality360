# Épica 5 · Integración con Jira Cloud

Fecha: 2026-10-29. Formato igual al de `e4-impedimentos-y-riesgos.md` (F = frontend, B = backend; escenarios Contexto → Evento → Resultado esperado). Las decisiones siguen la numeración de `docs/arquitectura/decisiones-mvp.md` (última usada: D92; esta épica usa D93–D112).

Alcance de esta ronda: refinamiento, diseño de datos y casos de prueba. No hay código. Fuente de los escenarios originales: `historias-quality360.md`, sección «ÉPICA 5». Los 24 escenarios originales se conservan en su intención; cambian los actores (sección 1), se precisan los datos, los límites y los códigos de error, y se corrigen tres puntos del texto del backlog (D112).

## 1. Resumen

- **Qué se pide:** el Administrador configura la conexión con un proyecto de Jira Cloud, sincroniza a mano sus historias hacia Quality360 (crea las que faltan y actualiza las que ya existen) o las importa desde un CSV/JSON, y ve el resultado. El QE y el Auditor consultan el historial en solo lectura.
- **Conjunto de esta ronda:** 8 HDU (4 de frontend, 4 de backend), 24 escenarios y 102 casos de prueba automáticos (más 1 caso manual opcional contra un Jira real). Los casos E5-F03-T14 y E5-B04-T15 los agregó la revisión de arquitectura (D118, D122).
- **Revisión de arquitectura (2026-10-29):** los conflictos del diseño y los supuestos de la sección 16 se resuelven con D113–D128 en `docs/arquitectura/decisiones-mvp.md` (sección «Corrida E5»). Contrato: `contracts/integraciones.v1.yaml`.
- **Servicio dueño:** Integraciones (`services/integraciones`, puerto 3004; hoy solo README). Esquema `integraciones` y rol `svc_integraciones` ya reservados. Escribe las HDU **solo** a través de Organización (reglas no negociables 1 y 3).
- **Lo que no cambia:** estado, analista, QE responsable, checklist, impedimentos, riesgo, célula y sprint de una HDU que ya existe. Una importación nunca los toca (D98).
- **Lo que sí cambia en lo certificado:** nada de lo que se afirma hoy, salvo datos de prueba (dos menús y la ruta `/v1/integraciones/*` del gateway, hoy 501). Aparecen HDU nuevas en las bandejas, así que las pruebas de E5 limpian lo que crean (sección 9).

### 1.1 Cambios respecto del backlog original (marcados)

| Punto | Backlog | Esta épica | Motivo |
| --- | --- | --- | --- |
| Quién sincroniza (E5-F02, E5-B02) | QE | **Administrador** | Decisión del usuario |
| Quién importa CSV/JSON (E5-F03, E5-B03) | QE | **Administrador** (D93) | Un solo actor escribe en la integración; el QE no necesita credenciales ni la herramienta |
| Quién ve el historial (E5-F04) | QE | **Administrador, QE y Auditor**, solo lectura. El QE ve las filas de HDU de su ámbito (D106) | El QE sigue informado de lo que llegó a sus HDU sin poder ejecutar nada |
| Estado y responsable de Jira (E5-B02#1) | «se mapean a la HDU» | **No se mapean** (D101) | El usuario prohíbe tocar estado y analista; el estado de Quality360 sigue su propio flujo (D10) |
| Importación con una fila inválida (E5-F03#2, E5-B03#3) | «sin importar nada» | Error de **estructura** del archivo: no se importa nada. Error de **fila**: se importan las válidas y se informan las demás. «Modo estricto» opcional: todo o nada (D102) | Decisión del usuario: filas con error no abortan todo |
| Dónde se guarda la credencial | No dice | Cifrada en la base con llave solo en Vercel (D94) | Decisión del usuario |

## 2. Decisiones de esta épica

| ID | Decisión | Motivo |
| --- | --- | --- |
| D93 | **Quién opera.** Configurar, probar, sincronizar con Jira, vista previa e importación de archivos: **solo el Administrador** (403 `ACCESO_DENEGADO` al resto). Ver el historial y su detalle: Administrador (todo), Auditor (todo) y QE (resumen de todas las ejecuciones y detalle según D106). Líder QA y Analista QA no tienen acceso. Matriz en la sección 7.2 | Decisión del usuario sobre quién dispara; el resto es la propuesta pedida |
| D94 | **Credencial cifrada.** El Administrador ingresa sitio, correo, API token y proyecto en el portal. El token se cifra en el servicio con **AES-256-GCM** (IV aleatorio de 12 bytes por cifrado, etiqueta de 16 bytes, dato asociado `q360:jira:token:v1`) y se guarda en `integraciones.configuracion_jira`. La llave (32 bytes en base64) es `INTEGRACIONES_LLAVE_CIFRADO` y vive **solo** en las variables de Vercel (y en el `.env` local); nunca en la base ni en el repositorio. El token no vuelve a salir en ninguna respuesta, registro, log, auditoría ni mensaje de error: la API informa `configurado: true` y `ultimos4`. Sin llave válida: 503 `LLAVE_CIFRADO_NO_DISPONIBLE`. Si la llave cambió y el token no se puede descifrar: 409 `TOKEN_NO_DESCIFRABLE` y el Administrador vuelve a ingresarlo. Se guarda `llave_version` para una rotación futura | Decisión del usuario. Es una excepción acotada a la regla 6 (secretos solo en `.env`): lo que se guarda en la base es un cifrado, y la llave sí cumple la regla |
| D95 | **El sitio solo puede ser `https://<subdominio>.atlassian.net`.** El servicio llama a una dirección que escribe un usuario, así que se valida con `^https://[a-z0-9][a-z0-9-]{0,62}\.atlassian\.net$` (sin ruta, puerto ni credenciales) antes de cualquier llamada saliente; si no, 400 `VALIDACION` (`VALOR_NO_PERMITIDO`) y no sale ninguna petición. Para las pruebas existe `INTEGRACIONES_PERMITIR_HOST_PRUEBA=true`, que además admite `http://127.0.0.1:<puerto>`; se **ignora** con `NODE_ENV=production` (mismo criterio que `Q360_FECHA_REFERENCIA`, D90). El portal solo exige una URL no vacía: decide el servidor | Evita que la integración sirva para consultar redes internas (SSRF) |
| D96 | **Sincronización manual, acotada a una función gratuita.** No hay tarea programada. Un proyecto por configuración. La consulta es fija: `project = <CLAVE> AND issuetype in (<tipos>) ORDER BY key ASC`, con `<tipos>` configurable (por defecto `Story, Historia`); no se aceptan JQL libres. API REST v3 de Jira con autenticación básica (correo + API token): `GET /rest/api/3/search/jql` con `maxResults=50` y el `nextPageToken` que devuelve Jira. Límites por ejecución (variables): **tope de 100 issues** (`JIRA_TOPE_ISSUES=100`), **presupuesto de 8 s** (`INTEGRACIONES_PRESUPUESTO_MS=8000`), 3 s por petición a Jira (`JIRA_TIEMPO_LIMITE_MS=3000`). Si queda más por leer o se acaba el tiempo, la ejecución termina `INCOMPLETA` con `hayMas: true` y `continuarDesde` (la última clave procesada); el botón «Continuar» repite con `key > "<clave>"`. Es seguro repetir: lo ya procesado queda «sin cambios». Si el plan de Vercel permite más duración, se suben las dos variables sin cambiar el diseño | Decisión del usuario. Las funciones gratuitas cortan alrededor de 10 s por defecto |
| D97 | **Identificación: el código de la HDU es la clave de Jira** (`QTY-123`), con la unicidad sin distinguir mayúsculas de E2 (`codigo_normalizado`). Se agrega `historia_usuario.origen` (`MANUAL`, `JIRA`, `CSV`, `JSON`; por defecto `MANUAL`; las existentes quedan `MANUAL`). Una HDU `MANUAL` con el mismo código **no se toca** y la fila queda `omitida` con `HDU_MANUAL_EXISTENTE`, salvo que el Administrador marque «Vincular HDU creadas a mano con el mismo código»: entonces se actualiza y su origen pasa a la fuente que la vinculó. Una HDU de origen no manual se actualiza desde cualquier fuente sin cambiar su origen | Evita pisar con datos de Jira una HDU que un QE ya trabajó, y permite adoptar las que ya existían |
| D98 | **Qué se actualiza y qué nunca.** Si la HDU existe y no está `CERRADA`, se actualizan **solo** `titulo`, `descripcion` y `prioridad`, y solo si el valor que llega es no vacío y distinto. Un valor vacío o ausente nunca borra. Nunca se tocan: estado, analista, QE responsable, checklist, certificado, impedimentos, riesgo, célula ni sprint. Sin diferencias → `omitida` (`SIN_CAMBIOS`). HDU `CERRADA` → `omitida` (`HDU_CERRADA`): un certificado emitido no cambia de título. Las columnas `celula`, `sprint` y `qe_correo` de un archivo se ignoran al actualizar | Decisión del usuario; D60 y D19 |
| D99 | **Destino de una HDU nueva** (célula, sprint y QE son obligatorios en E2). Se guardan en la configuración, elegidos por el Administrador: **célula destino**, **QE responsable por defecto** (usuario activo con rol QE) y **sprint de respaldo**. Jira: el sprint se busca por nombre (sin distinguir mayúsculas) entre los sprints de Quality360; si no existe, se usa el de respaldo con la advertencia `SPRINT_NO_ENCONTRADO`. Las HDU nacen en `PENDIENTE`, **sin analista**: el QE las ve en «Asignar analista» (E2-F02). Archivo: columnas opcionales `celula`, `sprint` y `qe_correo` las reemplazan por fila; si traen un valor que no existe, la fila es error; si vienen vacías, rige la configuración. El importador por archivo exige que Jira esté configurado solo si faltan esos valores en la fila | Los catálogos los carga la semilla (no hay CRUD, E2) y Jira no conoce células ni QE de Quality360 |
| D100 | **Escritura vía Organización.** Nuevo `POST /v1/interno/integraciones/hdu/upsert` en Organización: lote de hasta 25 filas, con el **token del Administrador propagado** (el servicio de semilla `X-Q360-Servicio-Token` y `PERMITIR_CARGA_SEMILLA` no sirven aquí: 403). Parámetros `soloSimular` (vista previa, no escribe) y `vincularExistentes`. Para cada fila: crear con las **mismas validaciones y el mismo camino que E2** (catálogos, unicidad, historial inicial y auditoría `CREAR_HDU` con `origen`), o actualizar según D98 con auditoría `ACTUALIZAR_HDU` (acción nueva, antes y después). Cada fila es una transacción: sin cambios parciales dentro de una HDU. `creado_por` es el Administrador; el QE responsable es el configurado | Regla no negociable 1: Integraciones no escribe en `organizacion` |
| D101 | **Mapeo de campos** (sección 5.1): clave → código; `summary` → título; `description` → descripción (Jira entrega ADF y se convierte a texto); `priority.name` → prioridad; sprint de Jira → sprint por nombre. **No se mapean** el estado ni el responsable de Jira; se muestran como referencia en el detalle de la ejecución y no se guardan en la HDU | Decisión del usuario; corrige E5-B02#1 |
| D102 | **Archivos CSV/JSON** (sección 5.2). El portal lee el archivo y lo envía como texto en un cuerpo JSON `{formato, nombre, contenido, estricto, vincularExistentes}` (sin multipart; máx. **1 MB** y **500 filas**). Dos pasos: `vista-previa` (valida y simula; no escribe ni registra) e `importaciones` (confirma). Errores de **estructura** (vacío, ilegible, formato, columnas obligatorias faltantes, demasiadas filas): 4xx y no se importa nada. Errores de **fila**: se importan las válidas. **Modo estricto** (casilla): si hay una sola fila con error, no se importa nada | Decisión del usuario; E5-F03#2; E5-B03#3 |
| D103 | **Contadores y resultado.** Por ejecución: `leidas`, `creadas`, `actualizadas`, `omitidas`, `conError` (invariante: la suma de los cuatro últimos es igual a `leidas`) y `conAdvertencias` (informativo, no suma). Resultado: `EXITOSA` (completa y sin filas con error), `CON_ERRORES` (completa, al menos una fila con error), `INCOMPLETA` (cortada por tope, tiempo o límite de tasa, con parte procesada; se puede continuar) y `FALLIDA` (no se procesó nada: credencial, sitio, archivo inválido, modo estricto con errores, etc.). «Sin cambios» no es un resultado: es `EXITOSA` con `creadas = 0` y `actualizadas = 0` | Contadores que pidió el usuario |
| D104 | **Registro de cada ejecución** (E5-B04, sección 6.1). Tablas `ejecucion_integracion` y `detalle_ejecucion` (una fila por issue o fila de archivo) en el esquema `integraciones`. Se inserta al iniciar (`EN_CURSO`) y se cierra una sola vez; un disparador impide modificar una ejecución cerrada y no se concede `DELETE`. Un índice único parcial impide dos ejecuciones simultáneas (409 `INTEGRACION_EN_CURSO`); una `EN_CURSO` de más de 5 minutos se cierra como `INTERRUMPIDA` al iniciar la siguiente. Se guarda el nombre del archivo, su tamaño y su huella SHA-256, **no** su contenido. Sin secretos (D94) | Regla no negociable 1; patrón de solo inserción de E3/E4 |
| D105 | **Errores de Jira.** Un fallo de Jira no es un fallo de la API de Quality360: las operaciones de probar, sincronizar e importar responden **200** con el objeto de resultado y `error {codigo, mensaje, sugerencia}`, y la ejecución queda registrada. Códigos y mensajes en la sección 4.4. El 429 se reintenta hasta 2 veces respetando `Retry-After` si es de 3 s o menos y queda presupuesto; cada espera se registra como evento de la ejecución. Los mensajes son fijos del servicio: nunca se copia el texto que devuelve Jira (podría contener el token). Toda falla de Jira sugiere «Importar un archivo» (E5-F02#3) | E5-B02#3, E5-B04#3 |
| D106 | **Visibilidad del historial.** El resumen de todas las ejecuciones es visible para Administrador, Auditor y QE. El detalle por fila: Administrador y Auditor, todo; **QE**, las filas de HDU que están en su ámbito (D47: `GET /v1/interno/hdu/ambito`) más las filas con error completas (código y motivo, sin título), y un contador «N filas de HDU fuera de tu ámbito». Líder y Analista: 403. Ejecución inexistente: 404 al Administrador y al Auditor, 403 al resto (D50, D89) | Mismo criterio de ámbito que E7; el historial no revela HDU ajenas |
| D107 | **Rutas y menús.** Administrador: `/admin/integraciones` con cuatro pestañas (Conexión, Sincronizar, Importar archivo, Historial) y opción de menú «Integraciones». QE: `/qe/integraciones` (historial, solo lectura) y opción «Integraciones» después de «Impedimentos». Auditor: pestaña nueva «Integraciones» (6.ª) en `/auditor`. Líder y Analista: acceso denegado en esas rutas (D41). Sin botones de escritura para QE y Auditor: el botón no existe (D39) | E7-F01; D71 |
| D108 | **El detalle de HDU suma `descripcion` y `origen`** (campos nuevos, aditivos y anulables en `GET /v1/hdu/{id}`; el texto se muestra después del checklist con la etiqueta «Origen: Jira / CSV / JSON / Manual»). `GET /v1/hdu`, las bandejas y los CSV del Auditor **no cambian**. La columna `descripcion` ya existe en la base | La descripción de Jira no tiene dónde verse; D71 prohíbe tocar listados y CSV |
| D109 | **Jira simulado para QA** (sección 10). Un servidor falso en `tests/support/jira-falso/` (dueño `q360-qa`) que imita los endpoints usados y modos de falla. Ninguna prueba automática depende de Atlassian. Hay un caso **manual opcional** contra un Jira real (E5-MAN-01) | Decisión del usuario |
| D110 | **Despliegue gratuito.** Integraciones es el quinto proyecto de Vercel (`quality360-integraciones`, raíz `services/integraciones`, mismo `vercel.json` y `api/index.mjs` que los otros). Variables: `DATABASE_URL` (rol `svc_integraciones`), `ORGANIZACION_URL`, `SUPABASE_URL`, `INTEGRACIONES_LLAVE_CIFRADO`, y los límites de D96. El gateway suma `INTEGRACIONES_URL` y reemplaza el 501 de `integraciones{/*ruta}` por rutas explícitas (como D85). La migración y el RLS (`infrastructure/nube/005`) se aplican al cerrar la corrida (D13). Jira Cloud gratuito permite API tokens; no hay costo adicional. Recordatorio: Supabase se pausa por inactividad; con la base pausada la sincronización responde 503 | D91 |
| D111 | **Auditoría propia.** Los cambios de configuración quedan en `evento_configuracion` (solo inserción: actor, fecha, campos cambiados, `tokenCambiado` verdadero o falso; nunca el token ni su cifrado). Las HDU creadas o actualizadas quedan en `organizacion.auditoria` (entidad `HDU`, D100). Esas entradas **no** entran a la vista «auditoría de usuarios» (D45 solo abarca `USUARIO`, `SUPERVISION` y `EXPORTACION`), así que los «últimos cambios» del Administrador y del Auditor no cambian | Regla no negociable 1 |
| D112 | **Correcciones al texto del backlog E5** (no cambian la intención): (1) E5-F01#1: «Probar y guardar» guarda **solo si la prueba pasa**; si falla, se conserva la configuración anterior. (2) E5-B02#1: no se mapean estado ni responsable (D101). (3) E5-B03#3: la transacción del modo estricto es del archivo completo; en modo normal cada fila es su propia transacción (D100). Además, el texto «Presiona Sincronizar» se llama «Sincronizar con Jira» en pantalla | Coherencia con las decisiones del usuario |

## 3. Mapa de cobertura: qué existe y qué falta

| Necesidad | Qué existe | Qué falta | HDU |
| --- | --- | --- | --- |
| Guardar credenciales de Jira | Esquema `integraciones` y rol `svc_integraciones` vacíos. Servicio 3004 solo README | Tabla de configuración, cifrado, API y pantalla | E5-F01, E5-B01 |
| Leer issues de Jira | Nada (gateway responde 501 en `/v1/integraciones/*`) | Cliente Jira, mapeo, paginación, tope, límite de tasa | E5-F02, E5-B02 |
| Crear/actualizar HDU desde fuente externa | Alta manual `POST /v1/hdu` (solo QE); carga semilla (solo con `PERMITIR_CARGA_SEMILLA`) | `upsert` interno de Organización, columna `origen`, auditoría `ACTUALIZAR_HDU` | E5-B02, E5-B03 |
| Importar CSV/JSON | Lector de `datos.json` solo para la semilla | Validación de archivo, vista previa, modo estricto | E5-F03, E5-B03 |
| Historial de ejecuciones | Nada (el README de la semilla menciona una tabla `Importacion` que el servicio nuevo reemplaza, ver pregunta 5) | Tablas, API y tres vistas de solo lectura | E5-F04, E5-B04 |
| Indicadores de integración | E6 sin construir | **No se absorben**; los contadores quedan disponibles por ejecución | E6 |

Dependencias de construcción: B01 → B02 → B03 → B04; F01 requiere B01; F02 requiere B02 y B04; F03 requiere B03 y B04; F04 requiere B04.

## 4. Catálogos

### 4.1 Orígenes y resultados

| Campo | Valores |
| --- | --- |
| `origen` de la ejecución | `JIRA`, `CSV`, `JSON` (etiquetas «Jira», «CSV», «JSON») |
| `origen` de la HDU | `MANUAL`, `JIRA`, `CSV`, `JSON` |
| `resultado` de la ejecución | `EN_CURSO`, `EXITOSA` («Exitosa»), `CON_ERRORES` («Con errores»), `INCOMPLETA` («Incompleta»), `FALLIDA` («Fallida»), `INTERRUMPIDA` («Interrumpida») |
| `resultado` de una fila | `CREADA`, `ACTUALIZADA`, `OMITIDA`, `ERROR` |
| Estado de la conexión | `SIN_PROBAR`, `OK` («Conectado»), `FALLIDA` («Falló la última prueba») |

### 4.2 Motivos de una fila (`detalle_ejecucion.motivo`)

| Código | Resultado de la fila | Cuándo | Mensaje |
| --- | --- | --- | --- |
| `SIN_CAMBIOS` | OMITIDA | La HDU existe y título, descripción y prioridad no difieren | «Sin cambios» |
| `HDU_CERRADA` | OMITIDA | La HDU existe y está cerrada (D98) | «La HDU está cerrada y no se modifica» |
| `HDU_MANUAL_EXISTENTE` | OMITIDA | Existe una HDU manual con ese código y no se pidió vincular (D97) | «Ya existe una HDU creada a mano con este código» |
| `CODIGO_INVALIDO` | ERROR | Vacío, más de 40 caracteres o fuera de `^[A-Za-z0-9][A-Za-z0-9._-]*$` | «El código no es válido» |
| `TITULO_VACIO` | ERROR | Título vacío o solo espacios | «El título es obligatorio» |
| `TITULO_LARGO` | ERROR | Más de 200 caracteres (solo archivo; en Jira se trunca) | «El título supera los 200 caracteres» |
| `PRIORIDAD_INVALIDA` | ERROR | Valor de archivo fuera de la tabla 5.1 | «La prioridad no es válida» |
| `CODIGO_DUPLICADO_EN_ARCHIVO` | ERROR | El código ya apareció antes en el mismo archivo (gana la primera fila) | «El código está repetido en el archivo» |
| `CELULA_NO_ENCONTRADA` | ERROR | `celula` informada y no existe | «La célula no existe» |
| `SPRINT_NO_ENCONTRADO` | ERROR (archivo) / advertencia (Jira) | `sprint` informado y no existe **en la célula de la fila** (D120) | «El sprint no existe» |
| `SPRINT_REQUERIDO` | ERROR | Fila de archivo con una célula distinta de la configurada y sin `sprint`: el sprint de respaldo es de otra célula (D120) | «Indica un sprint de esa célula» |
| `QE_INVALIDO` | ERROR | `qe_correo` no es un QE activo, o el QE por defecto dejó de serlo | «El QE responsable no es válido» |
| `ERROR_INTERNO` | ERROR | Falla inesperada al escribir la fila | «No pudimos procesar esta fila» |

**Advertencias** (no cambian el resultado de la fila; se cuentan en `conAdvertencias`): `SPRINT_NO_ENCONTRADO` (Jira), `PRIORIDAD_AUSENTE`, `PRIORIDAD_DESCONOCIDA`, `TITULO_TRUNCADO`, `DESCRIPCION_TRUNCADA`, `COLUMNA_IGNORADA`.

### 4.3 Errores de archivo (estructura)

| Código | HTTP | Cuándo |
| --- | --- | --- |
| `ARCHIVO_VACIO` | 422 | Sin contenido o sin filas de datos |
| `ARCHIVO_MUY_GRANDE` | 413 | Más de 1 MB |
| `FORMATO_NO_SOPORTADO` | 422 | `formato` distinto de `CSV` o `JSON` |
| `ARCHIVO_ILEGIBLE` | 422 | JSON mal formado, comillas del CSV sin cerrar, JSON que no es lista de objetos ni `{historias: [...]}` |
| `COLUMNAS_FALTANTES` | 422 | Falta `codigo` o `titulo`; el cuerpo lista todas las faltantes |
| `DEMASIADAS_FILAS` | 422 | Más de 500 filas |
| `MODO_ESTRICTO` | 200 (resultado `FALLIDA`) | Modo estricto con al menos una fila con error: no se importa nada |

### 4.4 Errores de Jira y de la configuración

| Código | Causa | Mensaje al Administrador | Sugerencia |
| --- | --- | --- | --- |
| `JIRA_CREDENCIAL_INVALIDA` | Jira responde 401 | «Jira rechazó el correo o el API token. Revisa la conexión.» | Ir a Conexión |
| `JIRA_SIN_PERMISO` | Jira responde 403 | «La cuenta de Jira no tiene permiso para leer este proyecto.» | Revisar permisos del proyecto |
| `JIRA_SITIO_NO_ENCONTRADO` | No resuelve el nombre, conexión rechazada o 404 en la raíz | «No pudimos conectar con ese sitio de Jira. Revisa la dirección.» | Revisar el sitio |
| `JIRA_PROYECTO_NO_ENCONTRADO` | El proyecto no existe o no es visible | «No encontramos el proyecto en Jira.» | Revisar la clave |
| `JIRA_LIMITE_DE_TASA` | 429 después de los reintentos | «Jira pidió esperar demasiado. Reintenta en unos minutos.» | Continuar más tarde o importar un archivo |
| `JIRA_TIEMPO_AGOTADO` | Una petición supera `JIRA_TIEMPO_LIMITE_MS` | «Jira no respondió a tiempo.» | Reintentar o importar un archivo |
| `JIRA_NO_DISPONIBLE` | 5xx | «Jira no está disponible por ahora.» | Importar un archivo |
| `JIRA_RESPUESTA_INVALIDA` | 200 con un cuerpo que no es la respuesta esperada | «Jira respondió algo que no entendimos.» | Reintentar o importar un archivo |
| `JIRA_NO_CONFIGURADO` (409) | No hay configuración guardada | «Configura la conexión con Jira antes de sincronizar.» | Ir a Conexión |
| `PRESUPUESTO_DE_TIEMPO` | Se acabó `INTEGRACIONES_PRESUPUESTO_MS` | «Se alcanzó el tiempo máximo. Continúa para procesar el resto.» | Botón «Continuar» |
| `ORGANIZACION_NO_DISPONIBLE` | Organización no responde durante la ejecución | «No pudimos guardar las HDU en este momento.» | Reintentar |
| `LLAVE_CIFRADO_NO_DISPONIBLE` (503) | Falta o es inválida `INTEGRACIONES_LLAVE_CIFRADO` | «La integración no está habilitada en el servidor.» | Avisar al responsable del despliegue |
| `TOKEN_NO_DESCIFRABLE` (409) | La llave cambió | «Vuelve a ingresar el API token.» | Ir a Conexión |

## 5. Mapeo y formatos

### 5.1 Mapeo de campos Jira → HDU

| Campo de Jira | Campo de la HDU | Regla |
| --- | --- | --- |
| `key` (`QTY-12`) | `codigo` | Se usa tal cual. Debe cumplir `^[A-Za-z0-9][A-Za-z0-9._-]*$`, máx. 40 (D97) |
| `fields.summary` | `titulo` | Se recorta a 200 caracteres con `TITULO_TRUNCADO`. Vacío → fila con error `TITULO_VACIO` |
| `fields.description` (ADF) | `descripcion` | Se convierte a texto plano: párrafos y títulos separados por salto de línea, viñetas con «- », menciones y enlaces con su texto, nodos desconocidos ignorados. Se recorta a 1.000 caracteres con `DESCRIPCION_TRUNCADA`. `null` no borra (D98) |
| `fields.priority.name` | `prioridad` | Tabla de abajo. Ausente → `MEDIA` con `PRIORIDAD_AUSENTE`; desconocida → `MEDIA` con `PRIORIDAD_DESCONOCIDA`. Al **actualizar**, ausente o desconocida no cambia la prioridad |
| Campo Sprint (`customfield_*`, se detecta por `GET /rest/api/3/field`: esquema `gh-sprint`) | Sprint vigente (solo al crear) | Se elige el sprint con estado `active`; si no hay, el `future` más próximo; si no, el `closed` de fecha de fin más reciente. Se busca por nombre en Quality360; sin coincidencia o sin sprint → sprint de respaldo (con `SPRINT_NO_ENCONTRADO` si había nombre) |
| (configuración) | `celula`, `qeResponsableId` | Célula destino y QE por defecto (D99) |
| `fields.status.name`, `fields.assignee.displayName` | — | **No se mapean**. Solo se muestran en el detalle de la ejecución como referencia |
| `fields.issuetype.name` | — | Filtra: solo los tipos configurados |

**Prioridad** (sin distinguir mayúsculas ni tildes): `CRITICA` ← Highest, Blocker, Critical, Más alta, Crítica, CRITICA; `ALTA` ← High, Alta, ALTA; `MEDIA` ← Medium, Media, MEDIA; `BAJA` ← Low, Lowest, Baja, Más baja, BAJA. Los archivos aceptan la misma tabla; un valor fuera de ella es `PRIORIDAD_INVALIDA`.

### 5.2 Formato de archivo

| Aspecto | Regla |
| --- | --- |
| Codificación | UTF-8, con o sin BOM |
| CSV | Primera fila de encabezado obligatoria. Separador `,` o `;` (se detecta en el encabezado). Comillas dobles RFC 4180 (campos con coma, comillas o saltos de línea). Encabezados sin distinguir mayúsculas ni tildes (`código` = `codigo`) |
| JSON | Una lista de objetos, o un objeto `{"historias": [...]}`. Claves iguales a las columnas; `qeCorreo` equivale a `qe_correo` |
| Columnas | `codigo` (obligatoria), `titulo` (obligatoria), `descripcion`, `prioridad`, `celula` (nombre), `sprint` (nombre), `qe_correo`. Otras columnas se ignoran con la advertencia `COLUMNA_IGNORADA` (una sola vez por archivo) |
| Límites | 1 MB de texto y 500 filas de datos. Se comprueba primero el tamaño (413), luego formato, columnas y filas |
| Valores | Los espacios al inicio y al final se recortan. `descripcion` de más de 1.000 caracteres se recorta con `DESCRIPCION_TRUNCADA`. `prioridad` vacía: `MEDIA` al crear, sin cambio al actualizar. Un valor de celda que empieza con `=`, `+`, `-` o `@` se guarda tal cual (el portal lo muestra como texto); se neutraliza al exportar (D122) |
| Repetir un archivo | Es seguro: lo ya importado queda `SIN_CAMBIOS` |

## 6. Modelo de datos

### 6.1 Integraciones (migración `<fecha>_e5_integracion_jira`, solo esquema `integraciones`, sin llaves foráneas a otro esquema, D24)

**`configuracion_jira`** (una sola fila: `id smallint PRIMARY KEY CHECK (id = 1)`):

| Columna | Tipo | Regla |
| --- | --- | --- |
| `sitio_url` | `varchar(100) NOT NULL` | D95 |
| `correo` | `varchar(150) NOT NULL` | Correo de la cuenta de Jira |
| `proyecto_clave` | `varchar(10) NOT NULL` | `^[A-Z][A-Z0-9_]{1,9}$` |
| `tipos_issue` | `varchar(200) NOT NULL DEFAULT 'Story,Historia'` | Lista separada por comas, hasta 5 tipos |
| `campo_sprint` | `varchar(30) NULL` | `customfield_*` detectado y guardado |
| `celula_id`, `qe_responsable_id`, `sprint_respaldo_id` | `uuid NOT NULL` | De Organización, sin FK (D24) |
| `token_cifrado`, `token_iv`, `token_tag` | `bytea NOT NULL` | AES-256-GCM (D94) |
| `llave_version` | `smallint NOT NULL DEFAULT 1` | |
| `token_ultimos4` | `char(4) NOT NULL` | Es lo único del token en claro |
| `estado_conexion` | `varchar(12) NOT NULL` | CHECK `SIN_PROBAR|OK|FALLIDA` |
| `ultima_prueba_en`, `ultima_prueba_codigo` | `timestamptz NULL`, `varchar(40) NULL` | |
| `actualizado_por_id`, `actualizado_por_nombre`, `actualizado_en` | `uuid`, `varchar(150)`, `timestamptz` NOT NULL | |

**`evento_configuracion`** (solo inserción): `id_evento uuid PK`, `actor_id`, `actor_nombre`, `fecha timestamptz`, `campos_cambiados jsonb` (lista de nombres), `token_cambiado boolean`, `resultado_prueba varchar(40)`. `REVOKE UPDATE, DELETE`.

**`ejecucion_integracion`:**

| Columna | Tipo | Regla |
| --- | --- | --- |
| `id_ejecucion` | `uuid PK` | |
| `origen` | `varchar(5) NOT NULL` | CHECK `JIRA|CSV|JSON` |
| `estricto`, `vincular_existentes` | `boolean NOT NULL DEFAULT false` | |
| `actor_id`, `actor_nombre`, `actor_rol` | `uuid`, `varchar(150)`, `varchar(30)` NOT NULL | |
| `iniciada_en`, `terminada_en` | `timestamptz NOT NULL`, `NULL` mientras corre | |
| `resultado` | `varchar(12) NOT NULL` | CHECK con los 6 valores |
| `leidas`, `creadas`, `actualizadas`, `omitidas`, `con_error`, `con_advertencias` | `integer NOT NULL DEFAULT 0` | CHECK: `creadas + actualizadas + omitidas + con_error = leidas` al cerrar |
| `reintentos_429` | `integer NOT NULL DEFAULT 0` | |
| `codigo_error`, `mensaje_error` | `varchar(40) NULL`, `varchar(300) NULL` | Solo códigos y mensajes fijos de la sección 4 |
| `proyecto_clave`, `sitio_host` | `varchar(10) NULL`, `varchar(100) NULL` | Instantánea (solo Jira) |
| `archivo_nombre`, `archivo_tamano`, `archivo_huella` | `varchar(150) NULL`, `integer NULL`, `char(64) NULL` | SHA-256 (solo archivos) |
| `hay_mas`, `continuar_desde` | `boolean NOT NULL DEFAULT false`, `varchar(40) NULL` | D96 |
| `eventos` | `jsonb NULL` | Esperas por 429: `[{tipo, espera_ms, fecha}]` |

Índices: `(iniciada_en DESC)`; único parcial `(true) WHERE terminada_en IS NULL` (una sola ejecución en curso). Disparador `ejecucion_cerrada_inmutable`: si `OLD.terminada_en IS NOT NULL`, rechaza el `UPDATE`. `REVOKE DELETE`.

**`detalle_ejecucion`:** `id_detalle uuid PK`, `id_ejecucion uuid NOT NULL` (FK a `ejecucion_integracion`, mismo esquema), `fila integer NOT NULL` (número de fila o posición en Jira), `codigo varchar(60) NULL`, `id_historia uuid NULL` (sin FK), `resultado varchar(12) NOT NULL` (CHECK con los 4; `ACTUALIZADA` tiene 11 caracteres), `motivo varchar(40) NULL`, `mensaje varchar(200) NULL`, `advertencias jsonb NULL`, `cambios jsonb NULL` (`{campo: {antes, despues}}`, valores recortados a 200 caracteres), `referencia jsonb NULL` (estado y responsable de Jira, solo informativo). `REVOKE UPDATE, DELETE`. Hasta 500 filas por ejecución (el máximo de un archivo).

### 6.2 Organización (migración `<fecha>_e5_origen_hdu`)

`historia_usuario.origen varchar(10) NOT NULL DEFAULT 'MANUAL'` con CHECK `MANUAL|JIRA|CSV|JSON`; `AccionAuditoria` suma `ACTUALIZAR_HDU`. Las HDU existentes y las de la semilla quedan `MANUAL`.

## 7. Contratos y rutas

Contrato nuevo `contracts/integraciones.v1.yaml` (dueño `q360-arquitecto`). Cambios aditivos: `organizacion.v1.yaml` suma `POST /v1/interno/integraciones/hdu/upsert`, `origen` y `descripcion` en el detalle de HDU, y la acción de auditoría `ACTUALIZAR_HDU`. Gateway (`q360-seguridad-gateway`): rutas explícitas hacia el puerto 3004 (D110) y límite de cuerpo de 1,5 MB solo para `archivos/*`; `/v1/interno/*` no se publica.

### 7.1 Rutas

| Método y ruta | Uso | Roles |
| --- | --- | --- |
| `GET /v1/integraciones/jira/configuracion` | Configuración sin secretos: `{configurado, sitio, correo, proyecto, tiposIssue, celula, qeResponsable, sprintRespaldo, token {configurado, ultimos4}, estadoConexion, ultimaPruebaEn}` | Administrador |
| `PUT /v1/integraciones/jira/configuracion` | Probar y guardar (D112). `token` opcional si ya hay uno guardado. 200 `{guardado, prueba {ok, usuarioJira, proyecto, error?}}` | Administrador |
| `POST /v1/integraciones/jira/configuracion/probar` | Probar con los datos del formulario (o con lo guardado) sin guardar. 200 `{ok, usuarioJira?, proyecto?, error?}` | Administrador |
| `GET /v1/integraciones/jira/configuracion/eventos` | Cambios de configuración | Administrador |
| `POST /v1/integraciones/jira/sincronizaciones` | Sincronizar. Cuerpo `{continuarDesde?, vincularExistentes?}`. 200 con la ejecución; 409 `JIRA_NO_CONFIGURADO` o `INTEGRACION_EN_CURSO` | Administrador |
| `POST /v1/integraciones/archivos/vista-previa` | Valida y simula. 200 `{filas, crear, actualizar, omitir, errores, advertencias, detalle[]}`; errores de estructura 4xx | Administrador |
| `POST /v1/integraciones/archivos/importaciones` | Confirma la importación. 200 con la ejecución; errores de estructura 4xx (la ejecución `FALLIDA` queda registrada y se informa su `ejecucionId`) | Administrador |
| `GET /v1/integraciones/ejecuciones` | Historial con `origen`, `resultado`, `desde`, `hasta`, `orden=iniciadaEn:asc\|desc`, `pagina`, `tamanoPagina` (D49) | Administrador, QE, Auditor |
| `GET /v1/integraciones/ejecuciones/{id}` | Ejecución con contadores, eventos y error | Administrador, QE, Auditor |
| `GET /v1/integraciones/ejecuciones/{id}/detalle` | Filas con `resultado`, `soloErrores`, `pagina`; aplica D106 (`filasOcultas`) | Administrador, QE, Auditor |
| `GET /v1/integraciones/estado` | Última ejecución, última completada y (solo Administrador) `jiraConfigurado` | Administrador, QE, Auditor |
| `POST /v1/interno/integraciones/hdu/upsert` (Organización) | Lote ≤ 25 con `soloSimular` y `vincularExistentes` (D100) | Interno: token de un Administrador |

Reglas comunes: errores con el formato de `comun.v1.yaml`. Orden de validación: 401 `NO_AUTENTICADO` → 403 `ACCESO_DENEGADO` → 413 → 400/422 de estructura → 409 → ejecución. Sin sesión: 401. Organización caída antes de empezar: 503 `SERVICIO_NO_DISPONIBLE` sin ejecución registrada (no se sabría quién es el actor).

### 7.2 Matriz de permisos

| Operación | Administrador | QE | Líder QA | Analista QA | Auditor |
| --- | --- | --- | --- | --- | --- |
| Ver, probar y guardar la configuración | Sí | No (403) | No | No | No |
| Sincronizar, vista previa, importar | Sí | No | No | No | No |
| Resumen del historial y `estado` | Sí | Sí | No | No | Sí |
| Detalle por fila | Todo | Su ámbito + filas con error (D106) | No | No | Todo |
| Rutas del portal | `/admin/integraciones` | `/qe/integraciones` | Denegado | Denegado | Pestaña en `/auditor` |

Un identificador inexistente: 404 para Administrador y Auditor; 403 para el resto. Sin sesión: 401.

## 8. Límites de ejecución en la función gratuita

| Aspecto | Valor | Cómo se cumple |
| --- | --- | --- |
| Duración | Presupuesto 8 s (`INTEGRACIONES_PRESUPUESTO_MS`) para una función de 10 s | Se mide desde el inicio; antes de cada página de Jira y de cada lote a Organización se verifica que quede tiempo; si no, `INCOMPLETA` |
| Tamaño de página de Jira | 50 | Con `nextPageToken` |
| Tope por ejecución | 100 issues (Jira); 500 filas (archivo) | Más issues: `hayMas` y «Continuar» |
| Lotes a Organización | 25 filas por llamada, en serie, 5 s por llamada | Un archivo de 500 filas son 20 llamadas; si no alcanza el tiempo, se repite el mismo archivo (lo hecho queda `SIN_CAMBIOS`) |
| Reintentos por 429 | 2, con espera de `Retry-After` si es ≤ 3 s y hay presupuesto (`JIRA_ESPERA_MAX_429_MS=3000`) | Cada espera queda en `eventos` |
| Cuerpo de la petición | Archivo ≤ 1 MB (límite de la plataforma: 4,5 MB) | D102 |
| Ejecuciones simultáneas | Una | D104 |
| Pruebas | Todas las variables se bajan en el perfil de QA (sección 10.3) | Para no esperar tiempos reales |

## 9. Efecto sobre HDU certificadas

Regla: ningún escenario certificado cambia de resultado esperado para los datos y roles existentes. Se **agrega** contenido. Las suites certificadas se vuelven a ejecutar como regresión.

| HDU o suite certificada | Qué cambia | Efecto |
| --- | --- | --- |
| **E2-F01, E2-B01 (crear HDU, unicidad)** | La creación manual no cambia (`POST /v1/hdu`, solo QE). Las HDU importadas entran por el `upsert` interno con las mismas validaciones y el mismo historial inicial. La unicidad (D97, sin distinguir mayúsculas) es la misma: crear a mano `qty-1` cuando ya existe `QTY-1` importada da 409 `CODIGO_HDU_DUPLICADO` | Ninguno. `creadoPor` de una importada es el Administrador y el QE responsable es el configurado: ninguna prueba certificada afirma que el creador sea el QE |
| **E2-F02 (asignar analista)** | Las HDU importadas nacen sin analista y aparecen en la fila «Asignar analista» del QE destino | Ninguno. Es el flujo esperado; solo cambian conteos si los datos de E5 siguen en la base (ver la nota de limpieza) |
| **E2-F03, E2-B03 (listado y ámbito)** | Se listan con los mismos filtros. El ámbito es el de siempre (QE responsable) | Ninguno |
| **E2-F04, E3-F01 (detalle y checklist)** | `GET /v1/hdu/{id}` suma `descripcion` y `origen` (anulables). El portal los muestra después del checklist (D108) | Ninguno si se conservan los `data-testid` y el orden de las secciones certificadas. Una prueba con esquema estricto del detalle debe aceptar los campos nuevos; el contrato se actualiza |
| **E2-B02 y D60 (estados y cierre)** | No se toca el estado. Una HDU importada se cierra con las reglas de siempre (checklist, impedimentos) | Ninguno |
| **E3 (checklist) y E4 (impedimentos y riesgo)** | Una importación no llama a Certificaciones ni a Impedimentos y no modifica sus tablas | Ninguno; se prueba (E5-B03-T05) |
| **E7-F02 a F05 (bandejas)** | No se agregan bloques ni contadores. Las HDU nuevas se cuentan donde ya se cuentan (`hdu-total`, «Sin analista», listados) | Ninguno **si se limpia**: `hdu-total 8`, «sin analista 1» de QE1 y los demás conteos del fixture E7 se rompen si las HDU de E5 quedan |
| **E7-F06, E7-B04 (Auditor)** | Pestaña nueva «Integraciones» (6.ª). El CSV de HDU no cambia de columnas | Ninguno. E7-F06-T07 («Recorre las pestañas, sin botones de escritura») debe recorrer también la nueva y no encontrar `button[type=submit]` |
| **E1-F02#3 (menú del QE)** | Opción nueva «Integraciones» después de «Impedimentos»: `["Bandeja","Equipo","Historias supervisadas","Impedimentos","Integraciones","Perfil"]` | **Sí, en el dato de la prueba** (igual que D41/E4). Se actualiza `e1-f02-portal-qe.spec.ts` y su unitaria |
| **E1-F07, E1-F08 (portal del Administrador)** | Opción nueva «Integraciones» en el menú del Administrador | `q360-qa` revisa si afirman la lista exacta; las pruebas que consultan «accesos a usuarios, roles y supervisión» no cambian. Menús de Analista, Líder y Auditor: sin cambios |
| **E7-F01 (acceso a portales)** | Rutas nuevas `/admin/integraciones` y `/qe/integraciones`; se suman a la matriz de E7-F01-T04 (otros roles: acceso denegado, D41) | Ninguno |
| **E1-B12 y auditoría de usuarios (E7)** | `organizacion.auditoria` recibe entradas de entidad `HDU` (`CREAR_HDU`, `ACTUALIZAR_HDU`). La vista «auditoría de usuarios» no incluye la entidad `HDU` (D45, D111) | Ninguno sobre los «últimos cambios». Las pruebas de E1-B12 que leen «la última entrada» crean su propio evento antes de leer |
| **Gateway (E1-B02, `NoImplementadoController`)** | `/v1/integraciones/*` deja de responder 501 | Cualquier prueba que afirme 501 en esa ruta cambia; `q360-qa` la busca antes de construir |
| **Semilla (`PERMITIR_CARGA_SEMILLA`)** | No cambia. `seed:e5` solo carga los sprints «E5 Sprint 1» y «E5 Sprint 2» (en CEL-C) por `POST /v1/interno/carga/sprints` | Ninguno sobre `hdu-total 8`, usuarios ni células |
| **Nota de limpieza (obligatoria)** | Las pruebas de E5 crean HDU, que no se pueden borrar por la API. El arnés de E5, igual que el de E4, usa el dueño de la base para borrar las HDU con `origen <> 'MANUAL'` y sus filas dependientes, y vacía `integraciones.*`, al terminar cada archivo; luego se corre la regresión de E7 | Sin esta limpieza, E7 falla por conteos, no por un defecto |

## 10. Jira simulado y fixture

### 10.1 Servidor falso (`tests/support/jira-falso/`, dueño `q360-qa`)

Un servidor HTTP de Node (sin dependencias) en el puerto `JIRA_FALSO_PUERTO=4010`, que arranca el `globalSetup` de Playwright. Sirve datos de `proyectos.json` y imita solo lo que usa el servicio:

| Endpoint del falso | Comportamiento |
| --- | --- |
| `GET /rest/api/3/myself` | 200 `{accountId, displayName: "Admin Jira Falso"}` si la autenticación básica coincide con `admin@quality360.local` y un token válido (`q360-token-valido-AB12` o `q360-token-nuevo-CD34`); si no, 401 |
| `GET /rest/api/3/project/{CLAVE}` | 200 `{key, name}` para proyectos existentes; 404 si no |
| `GET /rest/api/3/field` | Lista con `{id: "customfield_10020", name: "Sprint", schema: {custom: "com.pyxis.greenhopper.jira:gh-sprint"}}` |
| `GET /rest/api/3/search/jql` | Interpreta solo `project = X`, `issuetype in (...)`, `key > "X-n"` y `ORDER BY key ASC`. Devuelve `{issues, nextPageToken?, isLast}` con página máxima de 50; descripción en ADF; campos `summary`, `description`, `priority`, `issuetype`, `status`, `assignee` y `customfield_10020` (lista de sprints con `name`, `state`, `endDate`) |

Control (solo del arnés, sin autenticación): `POST /__control {modo, proyecto?}` fija un modo; `POST /__reset` vuelve a los datos base; `PUT /__issues/{CLAVE}` agrega o cambia una issue; `DELETE /__issues/{CLAVE}`; `GET /__solicitudes` devuelve cada petición recibida (método, ruta, consulta y si la autenticación coincidía; nunca el valor del token) para afirmar qué consultas hizo el servicio.

| Modo | Efecto |
| --- | --- |
| `NORMAL` | Respuestas correctas |
| `LIMITE` | Las 2 primeras peticiones de `search/jql` responden 429 con `Retry-After: 1`; luego correctas |
| `LIMITE_PAGINA_2` | La 2.ª página responde siempre 429 con `Retry-After: 1` |
| `LENTO` | Cada respuesta tarda 5 s |
| `RETARDO_1S` | Cada página tarda 1 s (para el presupuesto de tiempo) |
| `CAIDO` | 503 en todo |
| `TOKEN_REVOCADO` | 401 en todo, y el cuerpo del 401 repite el token recibido dentro del mensaje (para comprobar que el servicio no copia textos de Jira) |
| `SIN_PERMISO` | 403 en `search/jql` |
| `RESPUESTA_INVALIDA` | 200 con un cuerpo que no es JSON |

### 10.2 Datos del falso

**Proyecto `QTY` (base)**. Sprints de Quality360 existentes: «E5 Sprint 1» (respaldo) y «E5 Sprint 2».

| Clave | Tipo | Título (`summary`) | Descripción | Prioridad | Sprint de Jira | Resultado esperado al crear |
| --- | --- | --- | --- | --- | --- | --- |
| QTY-1 | Story | Login con doble factor | Texto «Como usuario quiero activar 2FA» | High | «E5 Sprint 2» (active) | ALTA, sprint E5 Sprint 2 |
| QTY-2 | Story | Recuperar contraseña | ADF de 2 párrafos | Medium | «E5 Sprint 1» (future) | MEDIA, E5 Sprint 1 |
| QTY-3 | Historia | Exportar reporte mensual | `null` | Highest | «Sprint Externo 9» (closed) | CRITICA, respaldo, advertencia `SPRINT_NO_ENCONTRADO` |
| QTY-4 | Story | Filtrar por fecha | Texto corto | Low | (ninguno) | BAJA, respaldo |
| QTY-5 | Story | Notificaciones push | Texto corto | (sin prioridad) | (ninguno) | MEDIA, advertencia `PRIORIDAD_AUSENTE` |
| QTY-6 | Story | Modo oscuro | Texto corto | «Urgentísima» | (ninguno) | MEDIA, advertencia `PRIORIDAD_DESCONOCIDA` |
| QTY-7 | **Bug** | Error en login | Texto | High | (ninguno) | No se lee (tipo no configurado) |
| QTY-8 | Story | Título de 250 caracteres | Texto | Medium | (ninguno) | Título de 200, advertencia `TITULO_TRUNCADO` |
| QTY-9 | Story | Descripción larga | 1.500 caracteres | Medium | (ninguno) | Descripción de 1.000, advertencia `DESCRIPCION_TRUNCADA` |
| QTY-10 | Story | Perfil de usuario | `null` | Lowest | (ninguno) | BAJA |
| QTY-11 | Story | (vacío) | Texto | High | (ninguno) | **Fila con error** `TITULO_VACIO` |
| QTY-12 | Story | Búsqueda global | Texto | Medium | «Sprint Externo 9» (closed) y «E5 Sprint 1» (active) | MEDIA, se elige el activo: E5 Sprint 1 |

Primera sincronización esperada de `QTY`: `leidas 11` (el Bug no se lee), `creadas 10`, `actualizadas 0`, `omitidas 0`, `conError 1`, `conAdvertencias 5` (QTY-3, 5, 6, 8, 9), resultado `CON_ERRORES`. La configuración usa célula CEL-C, QE2 y «E5 Sprint 1» como respaldo. «QTY sin QTY-11» (se elimina esa issue con `DELETE /__issues/QTY-11`) deja `creadas 10`, `conError 0` y `EXITOSA`.

**Otros proyectos del falso:** `BIG` (230 Story, `BIG-1` a `BIG-230`, título «Historia grande N»); `EXACTO` (exactamente 100 Story); `VACIO` (sin issues); `NOEXISTE` (no existe, 404).

**Archivos** (`tests/fixtures/e5/`; las filas son las que se afirman):

| Archivo | Contenido |
| --- | --- |
| `historias-validas.csv` | Encabezado `codigo,titulo,descripcion,prioridad,celula,sprint,qe_correo`. Filas: `ARC-1,Alta de cliente,Registro básico,ALTA,CEL-C,E5 Sprint 2,`; `ARC-2,Baja de cliente,,MEDIA,,,`; `ARC-3,"Consulta, con coma",Detalle,baja,,E5 Sprint 1,`; `ARC-4,Reporte diario,,CRITICA,CEL-C,,<correo de QE2>` |
| `historias-validas.json` | Lista de 3 objetos: `ARC-J1`, `ARC-J2`, `ARC-J3` con título y prioridad |
| `historias-validas-puntocoma-bom.csv` | Las mismas 4 filas de `historias-validas.csv`, con `;`, BOM y comillas |
| `historias-con-errores.csv` | 9 filas: `ARC-10` válida; `ARC-11` con prioridad `URGENTE`; código vacío; código `ARC 12` (con espacio); `ARC-10` repetida; `ARC-13` con célula `CEL-Z`; `ARC-14` con sprint `No existe`; `ARC-15` con `qe_correo` de ANA1; `ARC-16` válida. Esperado: 2 creadas, 7 con error |
| `sin-columna-titulo.csv` | Encabezado `codigo,descripcion` |
| `historias-actualizacion.csv` | Tras `historias-validas.csv`: `ARC-1` con título y prioridad CRITICA nuevos; `ARC-2` idéntica; el código de H1 (HDU manual); `ARC-5` nueva. Esperado: 1 creada, 1 actualizada, 2 omitidas (`SIN_CAMBIOS`, `HDU_MANUAL_EXISTENTE`) |
| Generados por la prueba | Vacío; solo encabezado; 501 filas; 1,2 MB; `.xlsx`; JSON `{`; CSV con comillas sin cerrar; JSON que no es lista |

### 10.3 Perfil de pruebas del servicio

`INTEGRACIONES_PERMITIR_HOST_PRUEBA=true`, `JIRA_TIEMPO_LIMITE_MS=1500`, `JIRA_ESPERA_MAX_429_MS=1500`, `INTEGRACIONES_PRESUPUESTO_MS=8000`, `JIRA_TOPE_ISSUES=100`, `INTEGRACIONES_LLAVE_CIFRADO` de prueba. Instancias adicionales del mismo servicio para los casos que lo piden: **I2** (puerto 3104, sin llave de cifrado), **I3** (llave distinta), **I4** (`INTEGRACIONES_PRESUPUESTO_MS=2500`) e **I5** (`NODE_ENV=production`, para D95). Sitio de las pruebas: `http://127.0.0.1:4010`. Un puerto cerrado (`http://127.0.0.1:4011`) representa un sitio inexistente.

### 10.4 Estado base y cuentas

Fixture E7 + E4 (ADM1, QE1, QE2, ANA1–ANA4, LID1, LID2, AUD1, INACT1; H1–H8; `hdu-total 8`) más `seed:e5` (los dos sprints). Credenciales del falso: correo `admin@quality360.local` y token `q360-token-valido-AB12`. «Configuración base» = sitio `http://127.0.0.1:4010`, proyecto `QTY`, tipos `Story, Historia`, CEL-C, QE2, «E5 Sprint 1», conectada. Cada archivo de pruebas parte del estado base, con el falso en `NORMAL` y `integraciones.*` vacío, y termina con la limpieza de la sección 9.

### 10.5 Caso manual opcional contra un Jira real

| ID | Tipo | Datos | Pasos | Resultado esperado |
| --- | --- | --- | --- | --- |
| E5-MAN-01 | manual (opcional) | Un sitio Jira Cloud gratuito del equipo con un proyecto de 3 a 5 historias, un API token propio y la clave del proyecto. Quality360 en la nube (o local con `INTEGRACIONES_PERMITIR_HOST_PRUEBA` apagado) | 1. Como Administrador, en Conexión ingresa los datos reales y pulsa «Probar y guardar». 2. Sincroniza. 3. Cambia el título de una historia en Jira y sincroniza otra vez. 4. Pon un token errado y vuelve a probar | 1. «Conectado» y token «termina en» los 4 últimos. 2. Las historias aparecen en Quality360 con el código igual a la clave de Jira, la descripción como texto y la prioridad mapeada. 3. 1 actualizada y el resto sin cambios. 4. Mensaje de credencial inválida sin el token. Verifica además el nombre del campo Sprint y que `key > "X-n"` ordene bien (supuestos de D96 y de la tabla 5.1) y anota cualquier diferencia |

## 11. Convenciones comunes de pantalla

Se mantienen las de E7 y E4: estados cargando, vacío, error con «Reintentar» e indisponible; paginación del servidor de 25 (máximo 100); filtros en la URL; acceso denegado con «Ir a mi bandeja»; fechas en hora de Chile.

- **Identificadores de prueba:** `pestana-conexion`, `pestana-sincronizar`, `pestana-importar`, `pestana-historial`, `form-jira`, `campo-token`, `token-estado`, `chip-conexion`, `error-conexion` (con `data-codigo`), `boton-probar-guardar`, `boton-sincronizar`, `boton-continuar`, `resumen-ejecucion` con `res-leidas`, `res-creadas`, `res-actualizadas`, `res-omitidas`, `res-con-error`, `res-advertencias`, `resultado-ejecucion` (con `data-resultado`), `mensaje-sin-cambios`, `aviso-incompleta`, `error-sincronizacion` (con `data-codigo`), `selector-archivo`, `vista-previa`, `boton-importar`, `casilla-estricto`, `casilla-vincular`, `error-archivo` (con `data-codigo`), `lista-ejecuciones`, `ultima-ejecucion`, `detalle-ejecucion`, `filtro-solo-errores`, `filas-ocultas`, `estado-vacio-<clave>`, `estado-error-<clave>`, `estado-indisponible-<clave>`.
- **Acciones de escritura** solo para el Administrador. Para QE y Auditor el botón **no existe** (no solo deshabilitado). Un botón pulsado sin permiso real recibe 403 y el portal informa «Ya no tienes permiso para esta acción».
- **Mientras corre una sincronización o importación** el botón queda deshabilitado y dice «Sincronizando…» o «Importando…». Se muestra un mensaje de espera, porque puede tardar hasta unos segundos.
- **El token** es un campo de contraseña sin autocompletado. Nunca se rellena con el valor guardado; el estado se lee en `token-estado`: «Configurado · termina en AB12» o «No configurado». Un campo vacío al guardar significa «conservar».

## 12. HDU de frontend

### E5-F01 · Administrador

Quiero configurar la conexión con Jira Cloud (sitio, credenciales, proyecto y destino de las HDU). Para habilitar la sincronización de HDU.

| # | Criterio | Contexto | Evento | Resultado esperado |
| --- | --- | --- | --- | --- |
| 1 | Configuración válida | El Administrador ingresa sitio, correo, API token, proyecto y el destino (célula, QE y sprint de respaldo). | Pulsa «Probar y guardar». | Se confirma la conexión («Conexión exitosa con Jira como <nombre>»), se guarda cifrada, el estado pasa a «Conectado» y el token queda como «Configurado · termina en <últimos 4>». |
| 2 | Credenciales inválidas | El token es incorrecto (o el sitio o el proyecto no existen). | Pulsa «Probar y guardar». | Se informa el error con su mensaje claro (D105), sin mostrar el token, y **no** se guarda nada: se conserva la configuración anterior. |
| 3 | Credenciales protegidas | La configuración existe. | Vuelve a abrir la pantalla. | El token nunca aparece: el campo está vacío y el estado dice «Configurado · termina en <últimos 4>». Guardar con el campo vacío conserva el token. |

Contenido de pantalla (`/admin/integraciones`, pestaña «Conexión»):

| Elemento | Detalle |
| --- | --- |
| Conexión | Sitio de Jira (ayuda: `https://su-empresa.atlassian.net`) · Correo de la cuenta · API token (contraseña) · Clave del proyecto (ayuda: «Por ejemplo, QTY») · Tipos de issue (por defecto `Story, Historia`) |
| Destino de las HDU nuevas | Célula · QE responsable por defecto (solo QE activos) · Sprint de respaldo, con la nota «Las HDU llegan sin analista; tu QE lo asigna después» |
| Estado | `chip-conexion` («Sin probar», «Conectado», «Falló la última prueba») y fecha de la última prueba |
| Botones | «Probar y guardar» (principal) y «Probar sin guardar» |
| Cambios de configuración | Lista de los últimos eventos (quién, cuándo, qué campos; nunca el token) |

Reglas de negocio:
- Ver D93–D95, D105, D111 y D112. Solo el Administrador ve la pantalla y el menú «Integraciones».
- Validaciones del portal: correo con formato, proyecto `^[A-Z][A-Z0-9_]{1,9}$`, tipos de 1 a 5, destino completo. Sitio: solo que sea una URL; el servidor aplica D95.
- Si Integraciones no responde: «No disponible» con «Reintentar»; el resto del portal no se afecta.
- Efecto sobre HDU certificada: opción de menú nueva (sección 9).

Casos de prueba:

| ID | Tipo | Escenario | Datos | Pasos | Resultado esperado |
| --- | --- | --- | --- | --- | --- |
| E5-F01-T01 | e2e | #1 | ADM1, falso `NORMAL`, sin configuración | Abre `/admin/integraciones`, completa sitio `http://127.0.0.1:4010`, correo `admin@quality360.local`, token `q360-token-valido-AB12`, proyecto `QTY`, CEL-C, QE2, «E5 Sprint 1» y pulsa «Probar y guardar» | Mensaje «Conexión exitosa con Jira como Admin Jira Falso»; `chip-conexion` «Conectado»; `token-estado` «Configurado · termina en AB12»; el campo de token queda vacío |
| E5-F01-T02 | e2e | #1 | ADM1 tras T01 | Consulta `/__solicitudes` del falso | Una petición a `myself` y una al proyecto `QTY`, ambas con autenticación válida |
| E5-F01-T03 | e2e | #2 negativo | ADM1, configuración base | Cambia el token por `token-malo-ZZ99` y pulsa «Probar y guardar» | `error-conexion` con `data-codigo` `JIRA_CREDENCIAL_INVALIDA` y «Jira rechazó el correo o el API token. Revisa la conexión.»; el texto `token-malo-ZZ99` no está en la página ni en ninguna respuesta de red; `token-estado` sigue en «termina en AB12» |
| E5-F01-T04 | e2e | #2 negativo | ADM1 | Prueba con sitio `http://127.0.0.1:4011` (sin servidor); luego con proyecto `NOEXISTE`; luego con falso en `SIN_PERMISO` | `JIRA_SITIO_NO_ENCONTRADO`, `JIRA_PROYECTO_NO_ENCONTRADO` y `JIRA_SIN_PERMISO` con sus mensajes; ninguna se guarda |
| E5-F01-T05 | e2e | #2 negativo | ADM1 | Deja vacío el correo, escribe `qty-1` como proyecto, no elige QE; luego un correo sin arroba | Un mensaje bajo cada campo; el falso no recibe ninguna petición |
| E5-F01-T06 | e2e | #3 | ADM1, configuración base | Recarga la página | `campo-token` está vacío y de tipo contraseña; `token-estado` «Configurado · termina en AB12»; la respuesta de `GET configuracion` no tiene la cadena del token; `localStorage` y `sessionStorage` no la contienen |
| E5-F01-T07 | e2e | #3 | ADM1, configuración base | Cambia solo el sprint de respaldo, deja el token vacío y pulsa «Probar y guardar» | Se guarda; el falso recibió la prueba con el mismo token (autenticación válida); `token-estado` sigue en AB12 |
| E5-F01-T08 | e2e | #1 | ADM1, configuración base | Cambia el token por `q360-token-nuevo-CD34` y guarda | `token-estado` «termina en CD34»; la lista de cambios muestra un evento «token cambiado» sin su valor |
| E5-F01-T09 | e2e | #1 negativo | QE1, ANA1, LID1, AUD1 | Abren `/admin/integraciones` | Acceso denegado con «Ir a mi bandeja» en las 4; ninguna petición a `/v1/integraciones/jira/configuracion` devuelve 200; el menú de QE1 no tiene opciones de configuración |
| E5-F01-T10 | e2e | #1 | ADM1 con Integraciones detenido | Abre la pestaña Conexión | Estado «No disponible» con «Reintentar»; la bandeja `/admin` carga normal |
| E5-F01-T11 | e2e | regresión | ADM1 | Ejecuta las pruebas certificadas de E1-F07, E1-F08 y E7-F05 | Pasan (con el dato del menú actualizado si lo afirman exacto) |

### E5-F02 · Administrador

Quiero sincronizar las HDU de un proyecto Jira hacia Quality360. Para no registrarlas manualmente. *(Cambio respecto del backlog: el actor era el QE.)*

| # | Criterio | Contexto | Evento | Resultado esperado |
| --- | --- | --- | --- | --- |
| 1 | Sincronización | La conexión está configurada. | Pulsa «Sincronizar con Jira». | Se muestran las HDU nuevas y las actualizadas, con el resumen (leídas, creadas, actualizadas, omitidas, con error) y las filas con error. Si quedan más historias que el tope, se avisa y se ofrece «Continuar». |
| 2 | Sin cambios | Jira no tiene historias nuevas ni modificadas. | Pulsa «Sincronizar con Jira». | Se informa «Sin cambios: Jira no tiene historias nuevas ni modificadas», con los contadores en 0 salvo «omitidas». |
| 3 | Error de API | Jira no responde, rechaza la credencial o limita la tasa. | Pulsa «Sincronizar con Jira». | Se informa el error con su mensaje (D105) y se sugiere «Importar un archivo». La ejecución queda registrada como fallida. |

Contenido de pantalla (pestaña «Sincronizar»):

| Elemento | Detalle |
| --- | --- |
| Encabezado | Proyecto y sitio configurados, estado de la conexión y la última ejecución |
| Opciones | Casilla `casilla-vincular` «Vincular HDU creadas a mano con el mismo código» (apagada) |
| Botón | `boton-sincronizar`; `boton-continuar` solo si la última ejecución quedó `INCOMPLETA` |
| Resumen | `resumen-ejecucion` con los seis contadores y `resultado-ejecucion`; si hubo esperas por límite de tasa: «Jira pidió esperar N veces; se reintentó» |
| Listas | «HDU creadas», «HDU actualizadas» (con los campos que cambiaron y sus valores antes y después), «Omitidas» (con motivo) y «Filas con error» (código, motivo). Cada una con enlace «Ver detalle» a la ejecución |
| Vacío / error | Sin configuración: `estado-vacio-jira` «Configura la conexión con Jira antes de sincronizar» con enlace a Conexión. Con error: `error-sincronizacion` y la sugerencia con enlace a «Importar archivo» |

Reglas de negocio:
- Ver D96–D99, D101, D103 y D105. El botón «Continuar» repite con `continuarDesde`.
- Un solo clic dispara una sola ejecución: el botón se deshabilita mientras corre. Si hay otra en curso (otra pestaña o persona): «Ya hay una sincronización en curso».
- Efecto sobre HDU certificada: ninguno en pantalla; las HDU creadas se ven en las bandejas (sección 9).

Casos de prueba:

| ID | Tipo | Escenario | Datos | Pasos | Resultado esperado |
| --- | --- | --- | --- | --- | --- |
| E5-F02-T01 | e2e | #1 | ADM1, configuración base, proyecto `QTY` | Abre «Sincronizar» y pulsa «Sincronizar con Jira» | `res-leidas` 11, `res-creadas` 10, `res-actualizadas` 0, `res-omitidas` 0, `res-con-error` 1, `res-advertencias` 5; `resultado-ejecucion` «Con errores»; la lista de creadas tiene 10 códigos (QTY-1 a QTY-12 salvo QTY-7 y QTY-11); la fila con error es QTY-11 con «El título es obligatorio» |
| E5-F02-T02 | e2e | #1 | ADM1 tras T01; QE2 y ADM1 | ADM1 abre la lista de HDU; QE2 abre `/qe` y el detalle de QTY-1 | Total de HDU 18 (`hdu-total` de la bandeja de ADM1 = 18); en la bandeja de QE2 hay filas «Asignar analista» para las 10 nuevas; el detalle de QTY-1 muestra «Origen: Jira», prioridad Alta, sprint «E5 Sprint 2», descripción «Como usuario quiero activar 2FA» y estado Pendiente |
| E5-F02-T03 | e2e | #1 | ADM1 tras T01; en el falso: QTY-2 con título «Recuperar clave» y prioridad Highest; QTY-1 con otra descripción | Sincroniza otra vez | `res-actualizadas` 2, `res-omitidas` 8, `res-creadas` 0, `res-con-error` 1; en «HDU actualizadas», QTY-2 muestra «Título: Recuperar contraseña → Recuperar clave» y «Prioridad: Media → Crítica» |
| E5-F02-T04 | e2e | #2 | ADM1, falso sin QTY-11 | Sincroniza dos veces seguidas | 1.ª: creadas 10, «Exitosa». 2.ª: `mensaje-sin-cambios` visible, `res-creadas` 0, `res-actualizadas` 0, `res-omitidas` 10, «Exitosa» |
| E5-F02-T05 | e2e | #3 negativo | ADM1, falso en `CAIDO` | Sincroniza | `error-sincronizacion` con `data-codigo` `JIRA_NO_DISPONIBLE`; texto «Jira no está disponible por ahora.»; enlace «Importar un archivo» que abre la pestaña de importación; el historial muestra una ejecución «Fallida»; no se creó ninguna HDU |
| E5-F02-T06 | e2e | #3 negativo | ADM1, falso en `TOKEN_REVOCADO` | Sincroniza | `JIRA_CREDENCIAL_INVALIDA` con enlace a Conexión; el texto del token no aparece en la página (aunque el falso lo repita en su 401) |
| E5-F02-T07 | e2e | #1 | ADM1, proyecto `BIG` (230) | Sincroniza; pulsa «Continuar»; pulsa «Continuar» | 1.ª: leídas 100, creadas 100, `aviso-incompleta` «Se procesaron 100 historias; quedan más en Jira» y `boton-continuar`. 2.ª: otras 100. 3.ª: 30 y «Exitosa» sin botón. Total 230 HDU `BIG-*` |
| E5-F02-T08 | e2e | #1 | ADM1, falso en `LIMITE`, proyecto `QTY` | Sincroniza | Termina «Con errores» (por QTY-11) con creadas 10 y el aviso «Jira pidió esperar 2 veces; se reintentó» |
| E5-F02-T09 | e2e | #1 negativo | ADM1 con dos pestañas | Pulsa «Sincronizar» en una y, mientras corre (falso en `LENTO` con límite alto en esta prueba), en la otra | El botón queda deshabilitado en «Sincronizando…»; la segunda recibe «Ya hay una sincronización en curso»; hay una sola ejecución en el historial |
| E5-F02-T10 | e2e | #1 negativo | ADM1 sin configuración | Abre «Sincronizar» | `estado-vacio-jira` con el enlace a Conexión; no existe `boton-sincronizar` |
| E5-F02-T11 | e2e | #1 negativo | QE1, ANA1, LID1, AUD1 | Abren `/admin/integraciones` y recorren su portal | Acceso denegado en la ruta; en `/qe/integraciones` y en la pestaña del Auditor no existe `boton-sincronizar` |
| E5-F02-T12 | e2e | regresión | ADM1, QE1, QE2 | Tras la limpieza, ejecuta las pruebas certificadas de E2-F01, E2-F03, E7-F03 y E7-F05 | Pasan sin cambios |

### E5-F03 · Administrador

Quiero importar HDU desde un archivo CSV o JSON. Para contar con una alternativa cuando Jira no esté disponible. *(Cambio respecto del backlog: el actor era el QE.)*

| # | Criterio | Contexto | Evento | Resultado esperado |
| --- | --- | --- | --- | --- |
| 1 | Importación válida | El archivo cumple el formato. | Selecciona el archivo y confirma la vista previa. | Se muestra una vista previa (qué se creará, actualizará u omitirá) y, al confirmar, se importan las HDU con su resumen. |
| 2 | Formato inválido | Al archivo le faltan columnas obligatorias, está vacío o es ilegible. | Selecciona el archivo. | Se indican los errores del archivo y no se ofrece importar; no se crea nada. |
| 3 | Duplicados y filas con error | Algunas HDU ya existen y otras filas tienen errores. | Confirma la importación. | Se actualizan las existentes (según D98), se importan las filas válidas y se informan cuántas y cuáles quedaron omitidas o con error. Con «modo estricto», una fila con error impide importar todo. |

Contenido de pantalla (pestaña «Importar archivo»):

| Elemento | Detalle |
| --- | --- |
| Instrucciones | Formato, columnas (obligatorias y opcionales), límites (1 MB, 500 filas) y enlace a una plantilla CSV descargable |
| Selector | `selector-archivo` (`.csv`, `.json`) |
| Opciones | `casilla-estricto` «Importar solo si todas las filas son válidas»; `casilla-vincular` (D97) |
| Vista previa | `vista-previa`: contadores «Crear N · Actualizar N · Omitir N · Con error N» y tabla fila · código · título · acción · motivo. Aviso fijo: «Al actualizar solo se modifican título, descripción y prioridad» |
| Botones | `boton-importar` (solo con archivo estructuralmente válido) y «Cancelar» (no deja rastro) |
| Resultado | El mismo `resumen-ejecucion` de la sincronización, con enlace al detalle |
| Errores | `error-archivo` con `data-codigo` y el mensaje; para columnas faltantes, la lista completa |

Reglas de negocio:
- Ver D97–D99, D102 y D103. Ni la vista previa ni «Cancelar» registran ejecución; sí lo hace «Importar», incluso si el modo estricto lo deja sin importar nada.
- El portal comprueba tamaño y extensión antes de enviar; el servidor vuelve a comprobarlo.
- Efecto sobre HDU certificada: ninguno (sección 9).

Casos de prueba:

| ID | Tipo | Escenario | Datos | Pasos | Resultado esperado |
| --- | --- | --- | --- | --- | --- |
| E5-F03-T01 | e2e | #1 | ADM1, `historias-validas.csv` | Selecciona el archivo; revisa la vista previa; pulsa «Importar» | Vista previa: Crear 4, Actualizar 0, Omitir 0, Con error 0, con las 4 filas; tras importar, `res-creadas` 4 y «Exitosa»; ARC-1 a ARC-4 existen, y ARC-3 tiene prioridad Baja y título «Consulta, con coma» |
| E5-F03-T02 | e2e | #1 | ADM1, `historias-validas.json` | Igual que T01 | Crear 3; tras importar, ARC-J1 a ARC-J3 existen con origen JSON |
| E5-F03-T03 | e2e | #1 | ADM1, `historias-validas-puntocoma-bom.csv` | Igual que T01 | La vista previa es idéntica a la de T01 (separador `;` y BOM resueltos) |
| E5-F03-T04 | e2e | #2 negativo | ADM1, `sin-columna-titulo.csv` | Selecciona el archivo | `error-archivo` `COLUMNAS_FALTANTES` con «Faltan las columnas: titulo»; no existe `boton-importar`; no se creó ninguna HDU |
| E5-F03-T05 | e2e | #2 negativo | ADM1; archivo vacío, un `.xlsx`, un JSON `{`, un CSV con comillas sin cerrar | Selecciona cada uno | `ARCHIVO_VACIO`, `FORMATO_NO_SOPORTADO`, `ARCHIVO_ILEGIBLE` y `ARCHIVO_ILEGIBLE` con sus mensajes; ninguno ofrece importar |
| E5-F03-T06 | e2e | #2 negativo | ADM1; CSV de 501 filas y CSV de 1,2 MB | Selecciona cada uno | `DEMASIADAS_FILAS` («máximo 500») y `ARCHIVO_MUY_GRANDE` («máximo 1 MB»); no se ofrece importar |
| E5-F03-T07 | e2e | #3 | ADM1, `historias-con-errores.csv` | Selecciona; revisa; importa sin modo estricto | Vista previa: Crear 2, Con error 7, con la fila, el código y el motivo de cada error. Tras importar: creadas 2, con error 7, «Con errores». Existen ARC-10 y ARC-16; no existen ARC-11, ARC-13, ARC-14 ni ARC-15 |
| E5-F03-T08 | e2e | #3 | ADM1, mismo archivo | Activa `casilla-estricto` e importa | Resultado «Fallida» con `MODO_ESTRICTO`; creadas 0, con error 7; no existe ARC-10; la ejecución queda en el historial |
| E5-F03-T09 | e2e | #3 | ADM1 tras T01, `historias-actualizacion.csv`, H1 manual | Selecciona; revisa; importa | Crear 1 (ARC-5), Actualizar 1 (ARC-1), Omitir 2 (ARC-2 «Sin cambios»; H1 «Ya existe una HDU creada a mano con este código»); tras importar, ARC-1 tiene el título y la prioridad Crítica nuevos |
| E5-F03-T10 | e2e | #3 | ADM1, mismo archivo, con `casilla-vincular` | Importa | H1 se actualiza (título y prioridad del archivo) y su origen pasa a CSV; su estado sigue «En ejecución» y su avance no cambia; H7 (cerrada), si se incluye, queda omitida con «La HDU está cerrada y no se modifica» |
| E5-F03-T11 | e2e | #1 | ADM1, `historias-validas.csv` | Selecciona; revisa la vista previa; pulsa «Cancelar» | No existe ninguna HDU ARC-*; el historial no tiene ejecuciones nuevas |
| E5-F03-T12 | e2e | #1 negativo | QE1, ANA1, LID1, AUD1 | Abren `/admin/integraciones` y sus propias pantallas | Acceso denegado en la ruta; no existe `selector-archivo` en `/qe/integraciones` ni en la pestaña del Auditor |
| E5-F03-T13 | e2e | regresión | ADM1, QE2 | Tras la limpieza, ejecuta las pruebas certificadas de E2-F01 (duplicado manual) y E7-F03 | Pasan |
| E5-F03-T14 | e2e | #1 | ADM1, instancia I4 (presupuesto 2.500 ms), CSV de 500 filas válidas, Organización con retardo de prueba | Selecciona; importa; pulsa «Importar el mismo archivo» hasta terminar | 1.ª: `aviso-incompleta` «Se procesaron N de 500 filas por el límite de tiempo…», sin `boton-continuar` y con `boton-importar-de-nuevo`; las siguientes: lo ya importado como «Sin cambios»; la última, «Exitosa». Ninguna HDU duplicada (D118) |

### E5-F04 · Administrador, QE y Auditor

Quiero ver el estado y el historial de sincronizaciones e importaciones. Para confiar en la información importada. *(Cambio respecto del backlog: el QE ve el historial en solo lectura; el Administrador y el Auditor se suman.)*

| # | Criterio | Contexto | Evento | Resultado esperado |
| --- | --- | --- | --- | --- |
| 1 | Última ejecución | Existen ejecuciones previas. | Abre el panel de integración. | Se muestra fecha, origen, resultado, contadores y quién la ejecutó, para la última ejecución y para la última completada. |
| 2 | Historial | Hay varias ejecuciones. | Abre el historial. | Se listan con fecha, origen (Jira, CSV, JSON), actor y resultado, de la más reciente a la más antigua, con filtros. |
| 3 | Detalle de errores | Una ejecución falló parcialmente. | Abre el detalle. | Se muestran las filas o issues con error y su motivo, con la visibilidad que corresponde a su rol. |

Contenido de pantalla (pestaña «Historial» del Administrador, `/qe/integraciones` y pestaña «Integraciones» del Auditor, todo de solo lectura salvo las acciones del Administrador en sus otras pestañas):

| Elemento | Detalle |
| --- | --- |
| Panel `ultima-ejecucion` | Dos tarjetas: «Última ejecución» y «Última completada» (exitosa o con errores): fecha, origen, actor, resultado (con texto), contadores |
| Tabla `lista-ejecuciones` | Fecha · Origen · Actor · Resultado · Leídas · Creadas · Actualizadas · Omitidas · Con error · Botón «Ver detalle». Orden por defecto: más reciente primero |
| Filtros | Origen · Resultado · Desde · Hasta (en la URL) |
| Detalle `detalle-ejecucion` | Encabezado (origen, archivo y huella o proyecto, actor, duración, esperas por límite de tasa, error global con su sugerencia) y tabla fila · código · título · resultado · motivo · cambios · referencia de Jira. `filtro-solo-errores`. Para el QE, `filas-ocultas` «N filas de HDU fuera de tu ámbito» |
| Vacío / error | «Aún no se ha sincronizado ni importado nada» / error con «Reintentar» / «No disponible» |

Reglas de negocio:
- Ver D106 y D107. Sin botones de escritura para QE y Auditor.
- Los motivos se muestran en español (sección 4.2). Nunca aparecen tokens ni el contenido del archivo.
- Efecto sobre HDU certificada: menú del QE y pestaña del Auditor (sección 9).

Estado previo común (lo prepara el arnés por API, con ADM1): **R1** sincronización de `QTY` (con errores), **R2** `historias-validas.csv` (creadas 4), **R3** `historias-con-errores.csv` (creadas 2, con error 7) y **R4** sincronización con el falso en `CAIDO` (fallida). R1 y R4 son de Jira; R2 y R3 son CSV.

Casos de prueba:

| ID | Tipo | Escenario | Datos | Pasos | Resultado esperado |
| --- | --- | --- | --- | --- | --- |
| E5-F04-T01 | e2e | #1 | ADM1, R1–R4 | Abre «Historial» | «Última ejecución»: R4, Jira, «Fallida», actor ADM1, leídas 0. «Última completada»: R3, CSV, «Con errores», creadas 2, con error 7 |
| E5-F04-T02 | e2e | #2 | ADM1, R1–R4 | Abre `lista-ejecuciones`; filtra origen CSV; luego resultado Fallida; ordena por fecha ascendente | 4 filas en el orden R4, R3, R2, R1; con CSV: R3 y R2; con Fallida: R4; ascendente: R1 primero. Cada fila muestra sus cinco contadores; la URL conserva los filtros |
| E5-F04-T03 | e2e | #3 | ADM1, R3 | Abre el detalle de R3 y activa `filtro-solo-errores` | 9 filas sin el filtro (2 creadas y 7 con error); con el filtro, 7 con su fila, código y motivo («La prioridad no es válida», «El código no es válido», «El código está repetido en el archivo», «La célula no existe», «El sprint no existe», «El QE responsable no es válido»); sin tokens ni contenido de archivo |
| E5-F04-T04 | e2e | #3 | ADM1, R1 | Abre el detalle de R1 | 11 filas: 10 creadas (5 con advertencia visible) y QTY-11 con error `TITULO_VACIO`; la columna «Referencia de Jira» muestra el estado y el responsable de Jira solo como texto |
| E5-F04-T05 | e2e | #2 | QE2, R1–R4 | Abre `/qe/integraciones`; abre el detalle de R2 y de R1 | Ve las 4 ejecuciones con sus contadores; en R2 y R1 ve las filas de las HDU que le pertenecen (ARC-1 a ARC-4; QTY-*) y la fila con error de QTY-11; no existe ningún botón de sincronizar, importar o configurar |
| E5-F04-T06 | e2e | #3 | QE1, R1 y R3 | Abre `/qe/integraciones` y el detalle de R1 y de R3 | Ve las 4 ejecuciones con los mismos contadores que ADM1. En R1: 0 filas de HDU, `filas-ocultas` «10 filas de HDU fuera de tu ámbito» y la fila con error de QTY-11 (código y motivo, sin título). En R3: las 7 filas con error, sin las 2 creadas (HDU de QE2) |
| E5-F04-T07 | e2e | #1 | AUD1, R1–R4 | Abre la pestaña «Integraciones» de `/auditor` y recorre las pestañas | Ve lo mismo que ADM1 en el historial y en los detalles; no existe `button[type=submit]` ni acciones de escritura en ninguna pestaña |
| E5-F04-T08 | e2e | #1 negativo | LID1, ANA1 | Abren `/qe/integraciones` y `/admin/integraciones` | Acceso denegado en ambas; `GET /v1/integraciones/ejecuciones` responde 403 |
| E5-F04-T09 | e2e | #2 | ADM1 sin ejecuciones | Abre «Historial» | `estado-vacio-historial` «Aún no se ha sincronizado ni importado nada»; sin error |
| E5-F04-T10 | e2e | #1 | QE2 con Integraciones detenido | Abre `/qe/integraciones` | «No disponible» con «Reintentar»; el resto del portal del QE carga |
| E5-F04-T11 | e2e | regresión | AUD1, QE1 | Ejecuta las pruebas certificadas de E7-F06 y E1-F02 | Pasan (menú del QE con el dato actualizado) |

## 13. HDU de backend

### E5-B01 · Administrador

Quiero que el sistema almacene la configuración de Jira de forma segura. Para proteger las credenciales de integración.

| # | Criterio | Contexto | Evento | Resultado esperado |
| --- | --- | --- | --- | --- |
| 1 | Cifrado | Se guarda un token. | Se procesa. | Se almacena cifrado (AES-256-GCM) y nunca se devuelve en claro; solo se informa que está configurado y sus últimos 4 caracteres. |
| 2 | Prueba de conexión | Se solicita probar. | Se invoca la API de Jira. | Se devuelve el resultado (éxito o código de error) sin exponer credenciales. |
| 3 | Solo administrador | Un QE (u otro rol) intenta configurar, probar o ver la configuración. | Se procesa. | 403 `ACCESO_DENEGADO`; nada cambia. |

Reglas de negocio:
- Contrato de la sección 7.1; D94, D95, D105, D111 y D112. `PUT configuracion` valida el destino con Organización: célula inexistente o sprint inexistente, 422 `CATALOGO_INVALIDO`; QE inexistente, inactivo o que no es QE, 422 `QE_INVALIDO`.
- Validaciones: sitio D95; correo con formato y 150 caracteres como máximo; proyecto `^[A-Z][A-Z0-9_]{1,9}$`; tipos 1 a 5; token de 8 a 200 caracteres (obligatorio solo la primera vez). Campo ausente o fuera de formato: 400 `VALIDACION` con `campo`.
- `PUT` guarda solo si la prueba pasa (D112). La prueba hace `GET myself` y `GET project/{clave}`, y detecta el campo Sprint con `GET field`.
- Orden de validación: 401 → 403 → 400 → 422 → prueba → guardar.

Casos de prueba:

| ID | Tipo | Escenario | Datos | Pasos | Resultado esperado |
| --- | --- | --- | --- | --- | --- |
| E5-B01-T01 | api | #1 | ADM1, falso `NORMAL` | `PUT /v1/integraciones/jira/configuracion` con el token `q360-token-valido-AB12` y el destino base | 200 `guardado true`; la respuesta trae `token {configurado true, ultimos4 "AB12"}` y no contiene la cadena del token. Con el dueño de la base: `token_cifrado` ≠ el token, no lo contiene como subcadena, `token_iv` de 12 bytes, `token_tag` de 16, `llave_version 1`, `token_ultimos4 "AB12"` |
| E5-B01-T02 | api | #1 | ADM1, tras T01 | `GET configuracion`; guarda dos veces el mismo token | El `GET` no tiene campo `token` ni el cifrado; el texto de la respuesta no contiene el token; los dos guardados producen `token_cifrado` y `token_iv` distintos (IV aleatorio) |
| E5-B01-T03 | api | #1 negativo | ADM1, instancia I2 (sin `INTEGRACIONES_LLAVE_CIFRADO`) | `PUT configuracion` | 503 `LLAVE_CIFRADO_NO_DISPONIBLE`; no se guarda ni se consulta al falso; el cuerpo no menciona el valor de ninguna variable |
| E5-B01-T04 | api | #1 negativo | ADM1, configuración base guardada con la llave A; instancia I3 con la llave B | `POST sincronizaciones` y `POST configuracion/probar` (sin token en el cuerpo) en I3 | 409 `TOKEN_NO_DESCIFRABLE` en ambas; el falso no recibe peticiones; ningún texto en claro. Con la llave A, vuelve a funcionar |
| E5-B01-T05 | api | #2 | ADM1, configuración base | `POST configuracion/probar` con los datos válidos, sin guardar | 200 `{ok true, usuarioJira "Admin Jira Falso", proyecto {clave "QTY", nombre}}`; el falso recibió exactamente 2 peticiones (`myself` y `project/QTY`) con autenticación válida; la respuesta no contiene credenciales; `configuracion_jira` no cambió |
| E5-B01-T06 | api | #2 negativo | ADM1; falso en cada modo | `probar` con: token malo; sitio en puerto cerrado; proyecto `NOEXISTE`; `SIN_PERMISO`; `LIMITE_PAGINA_2`/`LIMITE`; `LENTO`; `CAIDO`; `RESPUESTA_INVALIDA` | 200 con `ok false` y el código `JIRA_CREDENCIAL_INVALIDA`, `JIRA_SITIO_NO_ENCONTRADO`, `JIRA_PROYECTO_NO_ENCONTRADO`, `JIRA_SIN_PERMISO`, `JIRA_LIMITE_DE_TASA` (con el 429 persistente), `JIRA_TIEMPO_AGOTADO` (en menos de 4 s), `JIRA_NO_DISPONIBLE`, `JIRA_RESPUESTA_INVALIDA`; ningún cuerpo contiene token, cabecera `Authorization` ni el correo codificado |
| E5-B01-T07 | api | #2 negativo | ADM1, instancias principal e I5 (`NODE_ENV=production`) | `PUT` con sitios `https://evil.example.com`, `http://169.254.169.254`, `https://x.atlassian.net.evil.com`, `https://usuario@x.atlassian.net`; luego `http://127.0.0.1:4010` | Los 4 primeros: 400 `VALIDACION` (`sitio`, `VALOR_NO_PERMITIDO`) y el falso no recibe nada. El último: permitido en la instancia de pruebas y 400 en I5 |
| E5-B01-T08 | api | #3 negativo | QE1, QE2, ANA1, LID1, AUD1 | Cada uno invoca `PUT configuracion`, `GET configuracion` y `POST probar`; luego sin token | 403 `ACCESO_DENEGADO` en las 15 combinaciones con cuerpo idéntico; 401 `NO_AUTENTICADO` sin token; la configuración no cambia |
| E5-B01-T09 | api | #1 negativo | ADM1 | `PUT` con: célula inexistente; sprint inexistente; `qeResponsableId` de ANA1; de INACT1; correo `sin-arroba`; proyecto `qty`; token de 3 caracteres; sin `tiposIssue` | 422 `CATALOGO_INVALIDO` ×2; 422 `QE_INVALIDO` ×2; 400 `VALIDACION` con `campo` ×3; el último usa el valor por defecto `Story,Historia`; nada se guarda salvo el último caso si todo lo demás es válido |
| E5-B01-T10 | api | #1 | ADM1 | Guarda; cambia solo la célula destino (sin token); cambia el token; consulta `GET configuracion/eventos` | 3 eventos con actor ADM1 y fecha; `camposCambiados` y `tokenCambiado` (`false` para el cambio de célula, `true` para el del token); ningún evento contiene el token |
| E5-B01-T11 | api | #1 | Salida estándar y archivo de registro del servicio durante T01–T10 | Busca el token, `Authorization`, `Basic ` y el correo codificado en base64 | Ninguna aparición |
| E5-B01-T12 | api | #3 | Prueba de base de datos con `svc_integraciones` | Inspecciona el esquema; intenta leer `organizacion.historia_usuario`; intenta `DELETE` y `UPDATE` sobre `evento_configuracion` | No existen llaves foráneas hacia otros esquemas; el acceso a otro esquema falla; `DELETE` y `UPDATE` fallan por privilegios |

### E5-B02 · Administrador

Quiero que el sistema consuma la API REST de Jira Cloud y mapee las issues a HDU. Para sincronizar la información de lectura. *(Cambio respecto del backlog: el actor era el QE y no se mapean estado ni responsable.)*

| # | Criterio | Contexto | Evento | Resultado esperado |
| --- | --- | --- | --- | --- |
| 1 | Mapeo de campos | Se obtienen las issues del proyecto. | Se procesa. | Clave, título, descripción, prioridad y sprint se mapean según la sección 5.1 y se crean las HDU que no existen; las que existen se actualizan según D98. |
| 2 | Paginación y tope | El proyecto tiene más issues que el tamaño de página o que el tope por ejecución. | Se procesa. | Se recorren las páginas de a 50 hasta el tope de 100; si queda más, la ejecución termina incompleta y se puede continuar sin duplicar. |
| 3 | Límite de tasa | Jira responde con límite excedido. | Se procesa. | Se reintenta con espera (máximo 2 veces) y se registra el evento; si persiste, termina con lo procesado y el código `JIRA_LIMITE_DE_TASA`. |

Reglas de negocio:
- Contrato `POST /v1/integraciones/jira/sincronizaciones`; D96–D101, D103 y D105. Solo el Administrador. Sin configuración: 409 `JIRA_NO_CONFIGURADO`.
- La consulta a Jira usa solo el proyecto y los tipos configurados; los textos que se interpolan en la consulta se validan con los formatos de B01.
- El servicio llama a Organización por lotes de 25 con el token del Administrador (D100). Si Organización no responde antes de empezar: 503; si cae durante la ejecución: `INCOMPLETA` o `FALLIDA` con `ORGANIZACION_NO_DISPONIBLE`.
- Cada issue deja una fila de detalle; los fallos de una issue no detienen a las demás.

Casos de prueba:

| ID | Tipo | Escenario | Datos | Pasos | Resultado esperado |
| --- | --- | --- | --- | --- | --- |
| E5-B02-T01 | api | #1 | ADM1, configuración base, `QTY` | `POST sincronizaciones`; luego `GET /v1/hdu/{id}` de QTY-1 | 200 `leidas 11`, `creadas 10`, `conError 1`, `resultado CON_ERRORES`. En `/__solicitudes`: la consulta contiene `project = QTY` y los tipos `Story` e `Historia`. QTY-1: `codigo "QTY-1"`, título, prioridad ALTA, sprint «E5 Sprint 2», célula CEL-C, QE responsable QE2, estado PENDIENTE, sin analista, `creadoPor` ADM1, `origen "JIRA"`, descripción «Como usuario quiero activar 2FA» |
| E5-B02-T02 | api | #1 | ADM1, tras T01 | Revisa QTY-3, 4, 5, 6, 8, 9, 10 y 12 | QTY-3 CRITICA con sprint de respaldo; QTY-4 BAJA; QTY-5 y QTY-6 MEDIA; QTY-8 con título de 200 caracteres; QTY-9 con descripción de 1.000; QTY-10 BAJA; QTY-12 con «E5 Sprint 1» (el sprint activo). El detalle de la ejecución trae las advertencias `SPRINT_NO_ENCONTRADO`, `PRIORIDAD_AUSENTE`, `PRIORIDAD_DESCONOCIDA`, `TITULO_TRUNCADO` y `DESCRIPCION_TRUNCADA` en las filas que corresponden |
| E5-B02-T03 | api | #1 | ADM1, falso con QTY-13 de descripción ADF con títulos, viñetas, mención, enlace y un nodo desconocido | Sincroniza | La descripción de QTY-13 es texto plano con saltos de línea, «- » en las viñetas, el nombre de la mención, el texto del enlace; el nodo desconocido se ignora; no hay etiquetas ni JSON |
| E5-B02-T04 | api | #1 negativo | ADM1, `QTY` | Revisa QTY-11 (sin título) y QTY-7 (Bug) | QTY-11: fila `ERROR` `TITULO_VACIO` y no existe la HDU; las otras 10 se crearon (no se aborta). QTY-7 no existe y no figura en el detalle |
| E5-B02-T05 | api | #2 | ADM1, `BIG` (230) | Sincroniza 3 veces, siempre con `continuarDesde` de la respuesta anterior | 1.ª: `leidas 100`, `creadas 100`, `resultado INCOMPLETA`, `hayMas true`, `continuarDesde "BIG-100"`; el falso recibió 2 peticiones de 50 con `nextPageToken` en la segunda. 2.ª: otras 100 desde `BIG-101`. 3.ª: `leidas 30`, `EXITOSA`, `hayMas false`. 230 HDU `BIG-*` sin duplicados |
| E5-B02-T06 | api | #2 | ADM1, proyectos `EXACTO` (100) y `VACIO` (0) | Sincroniza cada uno | `EXACTO`: `leidas 100`, `EXITOSA`, `hayMas false` (el tope exacto no inventa una continuación). `VACIO`: `leidas 0`, todos los contadores 0, `EXITOSA` |
| E5-B02-T07 | api | #3 | ADM1, falso en `LIMITE`, `QTY` | Sincroniza | Completa con `creadas 10`; `reintentos429 2`; `eventos` con dos entradas `JIRA_LIMITE_DE_TASA` con `espera_ms 1000`; la duración es mayor o igual a 2 s |
| E5-B02-T08 | api | #3 negativo | ADM1, falso en `LIMITE_PAGINA_2`, `BIG` | Sincroniza; luego pasa el falso a `NORMAL` y continúa | 1.ª: `INCOMPLETA`, `codigoError JIRA_LIMITE_DE_TASA`, `creadas 50` (la página 1 se procesó y registró), `hayMas true`, `continuarDesde "BIG-50"`. Al continuar, termina sin duplicados |
| E5-B02-T09 | api | #1 negativo | ADM1, falso en `LENTO`, `QTY` | Sincroniza | 200 `FALLIDA`, `codigoError JIRA_TIEMPO_AGOTADO`, en menos de 4 s; no se creó ninguna HDU; la ejecución queda registrada |
| E5-B02-T10 | api | #1 negativo | ADM1; falso en `TOKEN_REVOCADO`, `SIN_PERMISO`, `RESPUESTA_INVALIDA`, `CAIDO`; sitio en puerto cerrado | Sincroniza en cada situación | `FALLIDA` con `JIRA_CREDENCIAL_INVALIDA`, `JIRA_SIN_PERMISO`, `JIRA_RESPUESTA_INVALIDA`, `JIRA_NO_DISPONIBLE` y `JIRA_SITIO_NO_ENCONTRADO`; el `mensajeError` es el mensaje fijo y no repite el token que el falso incluyó en su 401; 5 ejecuciones registradas |
| E5-B02-T11 | api | #1 negativo | QE1, QE2, ANA1, LID1, AUD1, sin token; ADM1 sin configuración | `POST sincronizaciones` | 403 `ACCESO_DENEGADO` ×5; 401 sin token; 409 `JIRA_NO_CONFIGURADO` para ADM1; el falso no recibe peticiones; no se registra ejecución en ninguno de los casos |
| E5-B02-T12 | api | #2 | ADM1, instancia I4 (presupuesto 2.500 ms), falso en `RETARDO_1S`, `BIG` | Sincroniza | `INCOMPLETA` con `codigoError PRESUPUESTO_DE_TIEMPO`, `hayMas true`, `duracionMs` menor o igual a 3.500; las HDU de las páginas procesadas están creadas y registradas |
| E5-B02-T13 | api | #1 negativo | ADM1 con Organización detenida | `POST sincronizaciones` | 503 `SERVICIO_NO_DISPONIBLE`; el falso no recibe peticiones; no hay ejecución registrada. Con Organización detenida después del primer lote: ejecución `INCOMPLETA` o `FALLIDA` con `ORGANIZACION_NO_DISPONIBLE` |

### E5-B03 · Administrador

Quiero que el sistema importe HDU desde CSV/JSON validando su contenido y que cree o actualice según corresponda. Para mantener la calidad de los datos. *(Cambio respecto del backlog: el actor era el QE; el `upsert` también sirve a la sincronización con Jira.)*

| # | Criterio | Contexto | Evento | Resultado esperado |
| --- | --- | --- | --- | --- |
| 1 | Validación | Se recibe un archivo. | Se procesa. | Se valida estructura, columnas, tipos y campos obligatorios; los errores de estructura rechazan el archivo y los de fila se informan fila por fila. |
| 2 | Upsert | Una HDU ya existe. | Se procesa. | Se actualiza sin duplicar, solo título, descripción y prioridad; nunca el estado, el analista, el QE, el checklist ni los impedimentos. |
| 3 | Transacción | Falla una fila. | Se procesa. | En modo normal, las demás se importan y se informa el detalle; en modo estricto no se importa ninguna. |

Reglas de negocio:
- Contratos `archivos/vista-previa`, `archivos/importaciones` y `POST /v1/interno/integraciones/hdu/upsert`; D97–D100, D102, D103 y las secciones 4.2, 4.3 y 5.
- La vista previa usa `soloSimular`: no escribe, no audita y no registra ejecución. La importación valida de nuevo todo (no se confía en la vista previa).
- El `upsert` interno exige el token de un Administrador: con un token de QE, de servicio o sin token, 403 o 401.
- Un lote de más de 25 filas: 400.

Casos de prueba:

| ID | Tipo | Escenario | Datos | Pasos | Resultado esperado |
| --- | --- | --- | --- | --- | --- |
| E5-B03-T01 | api | #1 | ADM1, `historias-validas.csv` | `POST archivos/vista-previa`; `GET /v1/hdu` | 200 `{filas 4, crear 4, actualizar 0, omitir 0, errores 0}` con el detalle por fila; la cantidad de HDU no cambia (8); no hay ejecución registrada ni entradas de auditoría nuevas |
| E5-B03-T02 | api | #1 | ADM1, filas de prueba tabla a tabla | Vista previa con: código con espacio; código de 41 caracteres; título de 201; descripción de 1.001; prioridades `alta`, `Alta`, `Crítica`, `High`, `urgente` | Código y título largo: error `CODIGO_INVALIDO` y `TITULO_LARGO`; descripción: se recorta con `DESCRIPCION_TRUNCADA`; las cuatro prioridades válidas se aceptan (ALTA, ALTA, CRITICA, ALTA); `urgente`: `PRIORIDAD_INVALIDA` |
| E5-B03-T03 | api | #1 negativo | ADM1 | Envía: contenido vacío; solo el encabezado; 501 filas; 1,2 MB; `formato XLSX`; CSV con comillas sin cerrar; JSON `{`; JSON `{"a":1}`; CSV sin `codigo` ni `titulo`; CSV con la columna extra `notas` | `ARCHIVO_VACIO` 422 ×2; `DEMASIADAS_FILAS` 422; `ARCHIVO_MUY_GRANDE` 413; `FORMATO_NO_SOPORTADO` 422; `ARCHIVO_ILEGIBLE` 422 ×3; `COLUMNAS_FALTANTES` 422 con ambas columnas listadas; el de la columna extra pasa con `COLUMNA_IGNORADA`. Ninguno crea HDU |
| E5-B03-T04 | api | #2 | ADM1, `historias-validas.csv` ya importado | Importa un archivo con ARC-1 con título «Alta de cliente v2», descripción en blanco y prioridad CRITICA | `actualizadas 1`; `cambios` = `{titulo: {antes, despues}, prioridad: {antes "ALTA", despues "CRITICA"}}`; la descripción conserva su valor (vacío no borra); la auditoría tiene una entrada `ACTUALIZAR_HDU` con antes y después |
| E5-B03-T05 | api | #2 | ADM1, QE2, ANA3, ARC-1 | Prepara ARC-1: QE2 la pasa a `DISENO_PRUEBAS` y asigna ANA3; ANA3 marca el entregable 1; ANA3 registra un impedimento; QE2 fija riesgo MEDIO. Importa un archivo con título nuevo, `qe_correo` de QE1, `celula` CEL-A y `sprint` «E5 Sprint 2» | Después: estado `DISENO_PRUEBAS`, `analistaId` ANA3, `qeResponsableId` QE2, célula CEL-C y sprint vigente iguales, avance e historial de checklist iguales, el impedimento sigue abierto, el riesgo sigue MEDIO; solo cambiaron título y prioridad; el historial de estado de la HDU no tiene entradas nuevas |
| E5-B03-T06 | api | #2 | ADM1, mismo archivo 2 veces | Importa dos veces `historias-validas.csv` | 1.ª: `creadas 4`. 2.ª: `creadas 0`, `actualizadas 0`, `omitidas 4` con `SIN_CAMBIOS`; la auditoría no suma entradas en la 2.ª |
| E5-B03-T07 | api | #2 | ADM1, ARC-1 existente | Importa `arc-1` (minúsculas); y un archivo con `ARC-9` y `arc-9` | `arc-1` actualiza ARC-1 sin crear otra (la HDU sigue siendo una); en el otro, `ARC-9` se crea y `arc-9` es `CODIGO_DUPLICADO_EN_ARCHIVO`; `POST /v1/hdu` manual con `qty-1` ya importada da 409 `CODIGO_HDU_DUPLICADO` |
| E5-B03-T08 | api | #2 | ADM1, H1 (manual) y H7 (cerrada) | Importa un archivo con sus códigos, sin y con `vincularExistentes` | Sin vincular: ambas `omitidas` (`HDU_MANUAL_EXISTENTE` y `HDU_CERRADA`). Con vincular: H1 `actualizada` y su `origen` pasa a `CSV`; H7 sigue `omitida` con `HDU_CERRADA` y sin cambios |
| E5-B03-T09 | api | #3 | ADM1, `historias-con-errores.csv` | Importa en modo normal; luego otra vez con `estricto true` (tras la limpieza) | Normal: `creadas 2`, `conError 7`, `CON_ERRORES`, con el motivo de cada fila. Estricto: 200 `FALLIDA`, `codigoError MODO_ESTRICTO`, `creadas 0`, `conError 7`, no existe ninguna HDU ARC-1*; con un archivo estricto sin errores, se importan todas |
| E5-B03-T10 | api | #3 | ADM1, archivo de 3 filas válidas; la HDU de la fila 2 se crea a mano entre la vista previa y la confirmación | Vista previa; crea a mano esa HDU; confirma | La fila 2 queda `omitida` (`HDU_MANUAL_EXISTENTE`); las filas 1 y 3 se crean; ninguna fila queda a medias (cada HDU creada tiene su historial inicial) |
| E5-B03-T11 | api | #1 negativo | QE1, ANA1, LID1, AUD1; sin token | `vista-previa` e `importaciones` con un archivo válido | 403 `ACCESO_DENEGADO` ×8; 401 sin token; no hay HDU nuevas ni ejecuciones |
| E5-B03-T12 | api | #1 negativo | ADM1; QE por defecto desactivado después de configurar; fila con `qe_correo` de INACT1 | Importa | Las filas que crean con el QE por defecto: `ERROR` `QE_INVALIDO`; la fila con INACT1: `QE_INVALIDO`; no se crea nada y no se aborta con 5xx |
| E5-B03-T13 | api | #3 negativo | QE1, un token de servicio (`X-Q360-Servicio-Token`), ADM1 | `POST /v1/interno/integraciones/hdu/upsert` de Organización directo; también con un lote de 26 filas (ADM1) | QE1: 403; servicio: 403; sin token: 401; ADM1 con 26: 400 `VALIDACION`; ADM1 con 25 válidas: 200 |
| E5-B03-T14 | api | #2 | ADM1, `historias-validas.json` | Importa | `creadas 3`, `origen "JSON"` en la ejecución y en las HDU; las claves `qeCorreo` y `qe_correo` se aceptan |

### E5-B04 · Administrador

Quiero que el sistema registre cada ejecución de sincronización o importación. Para tener trazabilidad de la integración.

| # | Criterio | Contexto | Evento | Resultado esperado |
| --- | --- | --- | --- | --- |
| 1 | Registro | Termina una ejecución (también las fallidas). | Se procesa. | Se guarda origen, actor, fechas, duración, resultado, contadores (creadas, actualizadas, omitidas, con error) y el detalle por fila, con la suma de contadores igual a las leídas. |
| 2 | Consulta | Se solicita el historial o un detalle. | Se procesa. | Se devuelve ordenado por fecha, con filtros y paginación, y con la visibilidad de cada rol (D106). |
| 3 | Sin secretos | Se registra un error de autenticación. | Se guarda. | No se incluyen tokens, cabeceras ni el texto que devolvió Jira en ningún registro. |

Reglas de negocio:
- D103, D104, D106 y D111; tablas de la sección 6.1.
- Una ejecución se registra apenas pasa la autorización, aunque falle después (credencial, archivo rechazado, modo estricto). No se registran: las vistas previas, los rechazos 401/403/409/413 y el 503 inicial.
- Los filtros siguen D49 (`pagina`, `tamanoPagina` con máximo 100). Rango de fechas con `desde` y `hasta`.

Casos de prueba:

| ID | Tipo | Escenario | Datos | Pasos | Resultado esperado |
| --- | --- | --- | --- | --- | --- |
| E5-B04-T01 | api | #1 | ADM1, configuración base | Sincroniza `QTY`; `GET ejecuciones/{id}` | `origen JIRA`, actor `{ADM1, nombre, rol ADMINISTRADOR}`, `iniciadaEn` y `terminadaEn` coherentes, `duracionMs` mayor que 0, `resultado CON_ERRORES`, `leidas 11`, `creadas 10`, `actualizadas 0`, `omitidas 0`, `conError 1`, `conAdvertencias 5`, `proyecto "QTY"`, `reintentos429 0` |
| E5-B04-T02 | api | #1 | ADM1, `historias-validas.csv` | Importa; consulta la ejecución | `origen CSV`, `archivo {nombre, tamano, huella}` con la huella igual al SHA-256 del archivo; la respuesta y la tabla no contienen el contenido del archivo |
| E5-B04-T03 | api | #1 | ADM1 | Tras sincronizar `QTY`, consulta `…/detalle` | 11 filas: 10 `CREADA` y QTY-11 `ERROR` `TITULO_VACIO`; cada `CREADA` trae `idHistoria`; `referencia` con el estado y el responsable de Jira de la issue |
| E5-B04-T04 | api | #1 | ADM1, R1–R4 | Recorre las 4 ejecuciones | En todas, `creadas + actualizadas + omitidas + conError = leidas`; R4 (fallida): `leidas 0`, `codigoError JIRA_NO_DISPONIBLE`, `terminadaEn` con valor; el CHECK de la base lo garantiza |
| E5-B04-T05 | api | #2 | ADM1, R1–R4 | `GET ejecuciones` sin filtros; con `origen=CSV`; con `resultado=FALLIDA`; con `orden=iniciadaEn:asc`; con `tamanoPagina=500` | 4 ítems en el orden R4, R3, R2, R1; CSV: R3 y R2; FALLIDA: R4; ascendente: R1 primero; `tamanoPagina` efectivo 100 sin error (D49); `desde`/`hasta` acotan por fecha |
| E5-B04-T06 | api | #2 | QE2, QE1, AUD1, R1 y R3 | `GET ejecuciones/{R1}/detalle` y `{R3}/detalle` | QE2: R1 con las 10 filas de HDU (su ámbito) más la fila de QTY-11; `filasOcultas 0`. QE1: R1 con la fila con error de QTY-11 (sin `titulo`) y `filasOcultas 10`; R3 con las 7 filas con error y `filasOcultas 2`. AUD1: todo |
| E5-B04-T07 | api | #2 negativo | LID1, ANA1; identificador inexistente | `GET ejecuciones`, `GET ejecuciones/{id}`, `GET estado`; el inexistente con ADM1, AUD1, QE1, LID1 | LID1 y ANA1: 403 en todo. Inexistente: 404 para ADM1 y AUD1; 403 para QE1 y LID1. Sin token: 401 |
| E5-B04-T08 | api | #3 | ADM1, falso en `TOKEN_REVOCADO` | Sincroniza con el token `q360-token-valido-AB12` (el falso repite el token en su 401); consulta la ejecución y vuelca todas las columnas de texto de `integraciones.*` | La ejecución es `FALLIDA` con `JIRA_CREDENCIAL_INVALIDA` y el mensaje fijo; el token, su Base64 (`correo:token`), la palabra `Authorization` y `Basic ` no aparecen en la respuesta ni en ninguna columna de ninguna tabla ni en el registro del servicio |
| E5-B04-T09 | api | #3 | ADM1, `PRESUPUESTO` y errores de Organización | Provoca `ORGANIZACION_NO_DISPONIBLE` | `mensajeError` es el mensaje fijo; no contiene URL internas, trazas ni cabeceras |
| E5-B04-T10 | api | #1 | Prueba de base de datos con `svc_integraciones` | Intenta `DELETE` en `ejecucion_integracion` y `detalle_ejecucion`; `UPDATE` de una ejecución cerrada; `UPDATE` en `detalle_ejecucion`; `resultado` fuera del catálogo; contadores que no suman | Todos fallan (privilegio, disparador `ejecucion_cerrada_inmutable` o CHECK); no hay llaves foráneas hacia otros esquemas |
| E5-B04-T11 | api | #1 | ADM1, falso en `LENTO` con límite alto (instancia de pruebas) | Dos `POST sincronizaciones` simultáneos; luego, una fila `EN_CURSO` de hace 6 minutos y una sincronización nueva | Uno responde 200 y el otro 409 `INTEGRACION_EN_CURSO`, con una sola ejecución registrada. La fila antigua queda `INTERRUMPIDA` y la nueva se ejecuta |
| E5-B04-T12 | api | #1 | ADM1, archivos de ARC | Importa `historias-validas.csv`, luego una actualización de ARC-1; `GET /v1/auditoria` | 4 entradas `CREAR_HDU` (entidad `HDU`, actor ADM1, `origen CSV`) y 1 `ACTUALIZAR_HDU` con antes y después; la vista del Auditor «auditoría de usuarios» no cambia su total ni sus «últimos cambios» |
| E5-B04-T13 | api | #1 negativo | ADM1, archivo rechazado | Importa `sin-columna-titulo.csv`; luego una vista previa del mismo archivo | La importación responde 422 `COLUMNAS_FALTANTES` con `ejecucionId` y queda una ejecución `FALLIDA` con la huella; la vista previa no registra nada |
| E5-B04-T14 | api | regresión | ADM1, QE1, AUD1 | Tras la limpieza (sección 9), ejecuta las pruebas certificadas de E1-B12, E7-B02, E7-B03 y E7-B04 | Pasan sin cambios |
| E5-B04-T15 | api | #3 | AUD1; ADM1 importa HDU con títulos `=1+1`, `+56`, `-x`, `@SUMA(A1)`, `	A` y `B`; un QE registra un impedimento con título `=HYPERLINK("x")` en una de ellas | Exporta `hdu`, `bitacora`, `certificados`, `impedimentos` y `gestion-impedimentos` (y `auditoria-usuarios` con un motivo que empieza con `=`) | En cada CSV, toda celda de texto que empieza con `=`, `+`, `-`, `@`, tabulación o retorno de carro llega prefijada con `'`; los números y fechas no se prefijan; el resto de las celdas y columnas no cambia (D122) |

## 14. Resumen de casos

| HDU | Casos |
| --- | --- |
| E5-F01 | 11 |
| E5-F02 | 12 |
| E5-F03 | 14 |
| E5-F04 | 11 |
| E5-B01 | 12 |
| E5-B02 | 13 |
| E5-B03 | 14 |
| E5-B04 | 15 |
| **Automáticos** | **102** |
| Manual opcional (E5-MAN-01) | 1 |

De los 102 automáticos, 5 son de regresión sobre lo certificado (E5-F01-T11, E5-F02-T12, E5-F03-T13, E5-F04-T11 y E5-B04-T14).

## 15. Trazabilidad E5

| Capacidad | Frontend | Backend | Contrato |
| --- | --- | --- | --- |
| Configurar y proteger la credencial | E5-F01 | E5-B01 | `GET\|PUT /v1/integraciones/jira/configuracion`, `POST …/probar`, `GET …/eventos` |
| Sincronizar con Jira | E5-F02 | E5-B02 | `POST /v1/integraciones/jira/sincronizaciones`; `POST /v1/interno/integraciones/hdu/upsert` |
| Importar CSV/JSON | E5-F03 | E5-B03 | `POST /v1/integraciones/archivos/{vista-previa, importaciones}` |
| Historial y detalle | E5-F04 | E5-B04 | `GET /v1/integraciones/{ejecuciones, ejecuciones/{id}, ejecuciones/{id}/detalle, estado}` |

## 16. Preguntas abiertas

Ninguna bloquea la construcción. Quedan estos supuestos, con su valor por defecto. **Resueltos** en la sección «Supuestos abiertos del backlog E5» de la Corrida E5 de `decisiones-mvp.md` (1 → D114, 4 → D122, 5: la tabla no existe; 2, 3 y 6 se confirman).

1. **Duración de la función en Vercel.** Se diseña para 10 s (presupuesto de 8 s, tope de 100 issues). Si el plan del proyecto permite más, solo se suben `INTEGRACIONES_PRESUPUESTO_MS` y `JIRA_TOPE_ISSUES`.
2. **Detalles de la API de Jira Cloud.** Se usa `GET /rest/api/3/search/jql` con `nextPageToken`, autenticación básica y el campo Sprint detectado en `GET /rest/api/3/field`; el orden `key ASC` con `key > "X-n"` para continuar. No se pudo contrastar con la documentación de Atlassian en esta ronda: E5-MAN-01 lo verifica contra un Jira real y, si el orden no sirve, `continuarDesde` pasa a ser el `nextPageToken` sin cambiar la API de Quality360.
3. **Líder QA.** No ve el historial de integración (D93). Si se quiere, es aditivo: la misma regla de ámbito que el QE, por sus células.
4. **Fórmulas en CSV.** Un título que empieza con `=`, `+`, `-` o `@` se guarda tal cual. Los CSV que exporta el Auditor (D48) hoy no lo neutralizan; si se quiere, se corrige en la exportación (aditivo, prefijo `'`) y no en la importación.
5. **Tabla `Importacion` de la semilla.** El README de la semilla dice que la carga registra su corrida en `integraciones.Importacion`. Si esa tabla existe en la base, `q360-backend` decide si la conserva para la semilla o la reemplaza por `ejecucion_integracion`; E5 no depende de ella.
6. **Un proyecto y una célula por configuración.** Varios proyectos o varias células destino se pueden agregar después con una tabla de configuraciones; no está en el alcance.
