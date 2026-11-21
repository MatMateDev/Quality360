# Épica 6 · Indicadores y dashboards

Fecha: 2026-11-04. Formato igual al de `e4-impedimentos-y-riesgos.md` y `e5-integracion-jira.md` (F = frontend, B = backend; escenarios Contexto → Evento → Resultado esperado). Las decisiones siguen la numeración de `docs/arquitectura/decisiones-mvp.md` (última usada: D152; esta épica usa D153–D175).

Alcance de esta ronda: refinamiento, diseño de datos y casos de prueba. No hay código. Fuente de los escenarios originales: `historias-quality360.md`, sección «ÉPICA 6» (líneas 613-696). Los 24 escenarios originales se conservan en su intención; se precisan los datos, los roles, las fórmulas y los códigos de error.

## 1. Resumen

- **Qué se pide:** el QE supervisa de un vistazo el cumplimiento de certificación de su equipo (indicadores, semáforo por célula, carga por analista, tendencia) y exporta lo que ve. El sistema guarda una foto diaria para poder mostrar la tendencia.
- **Conjunto de esta ronda:** 10 HDU (5 de frontend, 5 de backend), 30 escenarios y 117 casos de prueba. Ocho HDU son las del backlog original; **E6-F05 y E6-B05 («Cierre con excepción») son nuevas**, agregadas por decisión del usuario del 2026-11-04 (el QE responsable puede cerrar una HDU con menos de 10 entregables aprobados, con justificación).
- **Servicio dueño:** Indicadores, **servicio nuevo** `services/indicadores`, con esquema `indicadores` y rol `svc_indicadores` propios. No existe código ni contrato hoy.
- **Lo que no cambia:** ninguna regla de E1 a E5 ni E7 por causa de los indicadores. Indicadores solo **lee** por API y no escribe en esquemas ajenos (regla no negociable 1). **La única regla certificada que cambia es la de cierre (D11, E2-B02#3)**, por E6-F05/E6-B05 (D173–D175); se hace de forma aditiva para que ningún resultado certificado cambie (sección 7).
- **Ampliación respecto del backlog original (decisión del usuario):** las pantallas son del QE en el backlog, pero también las ven el Líder QA (sus células) y el Auditor (todo), en solo lectura. El Administrador no ve dashboards; solo dispara y consulta el estado del snapshot. El Analista QA no ve nada de E6.
- **Efecto sobre lo certificado:** datos de prueba (menús de los portales) y la regla de cierre, sin cambio de resultado esperado en las pruebas existentes. Ver sección 7.

### Decisiones de esta épica

| ID | Decisión | Motivo |
| --- | --- | --- |
| D153 | **Ámbito de los indicadores (extiende D18, D32 y D57).** **QE:** HDU donde es QE responsable, más las HDU de los analistas que supervisa con supervisión vigente (solo lectura, mismo criterio que E4). **Líder QA:** HDU de las células que tiene vigentes (D30). **Auditor:** todas. **Administrador y Analista QA:** 403 `ACCESO_DENEGADO` en toda ruta de indicadores, salvo las del snapshot para el Administrador (D164). Una HDU puede estar en el ámbito de dos QE (responsable y supervisor del analista); cada uno la ve en el suyo | Coherente con E4 y E7. Es una diferencia consciente con la bandeja del QE (E7, solo responsable): la bandeja lista acciones, el dashboard supervisa. Confirmado por el usuario el 2026-11-04 |
| D154 | **Servicio Indicadores.** `services/indicadores` con esquema `indicadores`, rol `svc_indicadores`, contrato `contracts/indicadores.v1.yaml` (dueño `q360-arquitecto`), sin llaves foráneas ni SQL hacia otro esquema (D24). Los indicadores en vivo se calculan al consultar con llamadas internas a Organización (HDU, célula, sprint, analista, QE, estado), Certificaciones (avance y certificado: `POST /v1/interno/checklist/estados`) e Impedimentos (bloqueo y riesgo: `POST /v1/interno/impedimentos/evaluacion`, lote de hasta 1000 HDU). Tiempo máximo de 2 s por llamada, en paralelo (D69). Sin caché | D46, D47, D69. Sin caché para que E6-B01#3 sea verdadero |
| D155 | **Clasificación de una HDU** (definiciones de 3.2). Totales, certificadas, **cerradas con excepción**, en curso y sin iniciar son **excluyentes** y suman los totales. «Bloqueada» es transversal (D59) y no suma. Una HDU cerrada con menos de 10 entregables aprobados **no** es «certificada»: va en su propia categoría | El backlog nombra cinco cifras sin definirlas; se agregan «sin iniciar» y «cerradas con excepción» para que cuadren y para no presentar como certificado lo que no lo es. Pregunta abierta 1 |
| D156 | **Cumplimiento promedio** = media aritmética del avance **real** de cada HDU del filtro (avance = `aprobados/10`, D16), sin ponderar por célula ni sprint. HDU sin ciclo = 0 %. Las cerradas se incluyen con su avance real: una cerrada con excepción con 3 aprobados aporta 30 %, no 100 %. Sin HDU = `null`, nunca 0 %. API con 1 decimal (mitad hacia arriba); pantalla con entero | Decisión del usuario: cerrar sin completar no equivale a completar |
| D157 | **Semáforo por célula** (decisión del usuario, 3.4). Rojo: alguna HDU con riesgo vigente `ALTO` o algún impedimento `ESCALADO`. Amarillo: alguna HDU con riesgo `MEDIO` o algún impedimento `ABIERTO`. Verde: ninguno. Solo HDU no cerradas. Sin HDU en el ámbito: gris «Sin HDU». Fuente caída: nunca verde (3.4) | Regla no negociable 4 |
| D158 | **Drill-down.** Lista las HDU que generan el color de la célula, con el motivo de cada una (`RIESGO_ALTO`, `IMPEDIMENTO_ESCALADO`, `RIESGO_MEDIO`, `IMPEDIMENTO_ABIERTO`). Una HDU puede tener dos motivos. Célula verde: lista vacía con el texto «Sin HDU con riesgo ni impedimentos» | E6-F02#2 |
| D159 | **Umbral de sobrecarga** (decisión del usuario, 3.5). Lo fija **cada QE para su equipo**. Por defecto **5** HDU activas (no cerradas), entero de **1 a 50**. Sobrecarga = activas **mayores** que el umbral (5 no es sobrecarga; 6 sí). Líder QA y Auditor lo ven en solo lectura. Administrador y Analista: 403 | El valor por defecto lo propone el analista |
| D160 | **Analista visto por varios QE.** Cada QE aplica **su** umbral a la carga del analista, y la carga es la del analista completo (todas sus HDU activas dentro del ámbito de quien mira, que incluye siempre las de un analista que supervisa). Un analista tiene a lo sumo un QE supervisor vigente (E1-F10, D190), así que el caso es: supervisado por un QE y con HDU de otro QE responsable, que lo ve como «No supervisado por ti». Líder y Auditor ven una fila por analista dentro del grupo de su QE supervisor, con el umbral de ese QE. Un analista sin QE supervisor usa el valor por defecto y lleva la etiqueta «Sin QE supervisor» | Un analista puede aparecer sobrecargado para un QE y no para otro; es correcto, porque cada uno define su tolerancia |
| D161 | **Auditoría del umbral.** Tabla propia `evento_umbral_carga` de solo inserción (valor anterior, valor nuevo, actor, fecha). No se escribe en `organizacion.auditoria` (patrón de D70). Lo leen el QE dueño y el Auditor | Regla no negociable 1 |
| D162 | **Snapshot diario.** Una fila por **fecha × célula × sprint × ámbito**, donde ámbito es `TODOS` (todas las HDU del par, sin duplicar; lo usan Líder y Auditor) o el identificador de un QE (HDU de su ámbito D153; lo usa ese QE). La clave pedida por el usuario (día/célula/sprint) se amplía con el ámbito porque el QE no puede ver cifras de HDU ajenas. Célula y sprint son los vigentes de cada HDU en ese momento. Las HDU sin sprint no se guardan (la tendencia es por sprint) | Sin el ámbito, o se filtraría información o la tendencia del QE no cuadraría con su dashboard |
| D163 | **Fecha y hora.** Todo en `America/Santiago`. `fecha` del snapshot = fecha de calendario de Santiago al ejecutarse. Vercel Cron (plan Hobby, 1 vez al día, con precisión de una hora): `0 6 * * *` UTC, que cae entre 02:00 y 03:59 de Santiago en horario de invierno y de verano, siempre en el mismo día. El punto de la tendencia de un día refleja el estado de esa madrugada, es decir, el cierre del día anterior. El cron llama por `GET` con `Authorization: Bearer <CRON_SECRET>`; actor `SISTEMA` | Evita que el cambio de hora mueva el día del snapshot |
| D164 | **Idempotencia y ejecución.** Restricción única `(fecha, celula, sprint, ambito)`; escribir es *upsert*, de modo que repetir el día no duplica y deja el estado de la última ejecución (el botón manual refresca la foto). Una sola ejecución a la vez (índice único parcial sobre `ejecucion_snapshot` en curso, como E5): otra simultánea recibe 409 `EJECUCION_EN_CURSO`. **Todo o nada:** si cualquier fuente falla, la ejecución queda `FALLIDA` con su motivo y no se escribe ninguna fila (nada parcial ni inventado). Tope de 1000 HDU por corrida; si hay más, `FALLIDA` con `EXCEDE_TOPE`. Las filas no se borran nunca (`REVOKE DELETE`) | E6-B03#2 |
| D165 | **Administrador y snapshot.** Puede disparar `POST /v1/indicadores/snapshots` («Generar snapshot ahora») y ver `GET /v1/indicadores/snapshots/ejecuciones` (fecha, origen `CRON` o `MANUAL`, actor, inicio, duración, resultado, filas escritas, motivo). Ve metadatos de ejecución, no cifras ni series | Operar sin ver los indicadores |
| D166 | **Tendencia.** Una serie por par (célula, sprint): eje X las fechas con snapshot en orden ascendente, eje Y el cumplimiento promedio del ámbito del usuario. Un día sin snapshot es un **hueco**, no se interpola. Con un solo punto se muestra el punto y el aviso. Por defecto: los sprints vigentes (`inicio ≤ hoy ≤ fin`) de las células visibles, hasta 6 series; si no hay ninguno, el sprint con snapshot más reciente de cada célula. Un sprint cerrado conserva su serie con una marca en su fecha de fin; sus indicadores en vivo siguen disponibles | E6-F04#1 |
| D167 | **Qué snapshot usa la tendencia.** El de cada fecha del ámbito del usuario: `TODOS` para Líder y Auditor, el del QE para el QE. Líder y Auditor suman filas `TODOS` de las células que les corresponden; el cumplimiento de la suma se recalcula con `suma_avance / (10 × hdu_total)`, nunca como promedio de promedios. El Líder ve la historia completa de sus células **vigentes**, también la anterior a su asignación (confirmado por el usuario el 2026-11-04) | Las filas guardan sumas, no solo el promedio |
| D168 | **Exportación.** CSV y PDF desde cada vista, con los filtros aplicados, un encabezado (título, vista, filtros, rol y ámbito, fecha y hora de Chile) y solo datos del ámbito del usuario. Neutralización de fórmulas como D122 en toda celda de texto, incluidas las del encabezado. Exportan QE, Líder y Auditor (confirmado por el usuario el 2026-11-04). Máximo 50.000 filas en CSV (D35) y 200 en PDF (422 `EXPORTACION_EXCEDE_LIMITE`, «Acota los filtros» o «Usa CSV»). Cada exportación se registra en la auditoría de Organización **antes** de entregar el archivo (como D48); si el registro falla, 503 y no hay archivo. Si un bloque de la vista está indisponible, no se exporta (503 `INDICADORES_NO_DISPONIBLES`) | Sin cifras inventadas dentro de un archivo que se comparte |
| D169 | **Fuente caída.** Cada indicador y bloque trae `estado: ok \| indisponible` (D34). Organización caída: 503 `SERVICIO_NO_DISPONIBLE` (sin ámbito no hay nada que mostrar). Certificaciones caída: indisponibles certificadas, en curso, sin iniciar, cumplimiento y, en el semáforo, el riesgo por atraso. Impedimentos caído: indisponibles bloqueadas y semáforo. El resto sigue | Informe pp. 8-9 y regla no negociable 4 |
| D170 | **Rutas y menús.** QE `/qe/indicadores` (pestañas Cumplimiento, Semáforo, Carga, Tendencia); Líder `/lider/indicadores`; Auditor `/auditor/indicadores`; Administrador `/admin/indicadores/snapshots`. Se agrega una opción de menú a esos cuatro roles (sección 7). La bandeja no cambia: no hay contadores ni filas nuevas en E7 (mismo criterio que D71) | D36 y D37 preveían que esto lo traía E6 |
| D171 | **Cambios de célula o sprint.** Los indicadores en vivo usan siempre la célula y el sprint **vigentes** de la HDU. Las filas ya guardadas no se reescriben: si una HDU cambia de sprint, la serie del sprint anterior queda como estaba y la del nuevo empieza ese día. Los saltos son esperables y no se corrigen | Un snapshot es una foto |
| D172 | **Parámetros y pruebas.** `INDICADORES_UMBRAL_DEFECTO=5`, `INDICADORES_UMBRAL_MIN=1`, `INDICADORES_UMBRAL_MAX=50`, `INDICADORES_TOPE_HDU=1000`, `EXPORTACION_PDF_LIMITE_FILAS=200`, `CRON_SECRET`. `Q360_FECHA_REFERENCIA` (ignorada en producción, como E4) fija «ahora» para el snapshot y los cálculos de fecha | Pruebas deterministas |
| D173 | **Cierre con excepción (modifica D11 y E2-B02#3).** El **QE responsable** (D18) puede pasar una HDU de `PENDIENTE_CIERRE` a `CERRADA` con **menos de 10 entregables aprobados** si envía una **justificación** de 20 a 500 caracteres (después de quitar espacios; texto en blanco = 422 `JUSTIFICACION_REQUERIDA`; largo fuera de rango = 400 `VALIDACION` con `campo: justificacion`). Sin justificación el comportamiento actual no cambia: 409 `CHECKLIST_INCOMPLETO` (el cuerpo suma `puedeCerrarConExcepcion: true` solo para el QE responsable). **Un impedimento `ABIERTO` o `ESCALADO` sigue bloqueando el cierre** (D59, D60), también el parcial. Orden de validación: transición (D10) → checklist (409 `CHECKLIST_NO_DISPONIBLE` si Certificaciones no responde, como D11: sin saber cuántos hay aprobados no se puede cerrar; corregido por D192) → justificación (antes, 403 si quien la envía no es el QE responsable, D189) → impedimentos. Con 10 aprobados el cierre es el de siempre y una justificación enviada se ignora. `CERRADA` sigue siendo terminal (D10): no hay reapertura | Decisión del usuario: no es obligatorio llegar al 100 %; cerrar queda a criterio y responsabilidad del QE |
| D174 | **Sin certificado.** El certificado exige los 10 entregables completos (E3-F04). El cierre con excepción **no emite** certificado ni lo habilita; la HDU cerrada no admite generarlo. Si existiera un certificado emitido antes del cierre, sigue vigente. El detalle de la HDU muestra el aviso «Cerrada con excepción: N de 10 entregables aprobados» con la justificación, el autor y la fecha, y el texto «Sin certificado»; el checklist se conserva visible con los entregables pendientes. El avance queda congelado en el valor real al cerrar | Recomendación del analista: un certificado es una afirmación de completitud |
| D175 | **Registro del cierre con excepción.** Tabla nueva de Organización `cierre_hdu` (solo inserción, `REVOKE UPDATE, DELETE`): `id_historia`, `aprobados`, `pendientes` (códigos de entregable), `justificacion`, `actor_id`, `actor_nombre`, `actor_rol`, `fecha`. Además una entrada `CERRAR_HDU_PARCIAL` en `organizacion.auditoria` (actor, HDU, aprobados y justificación), que lee el Administrador en `GET /v1/auditoria?entidad=HDU`; el Auditor ve el cierre en el historial de la HDU (evento `CIERRE_EXCEPCION`), porque la auditoría de usuarios de E7-F06 no incluye la entidad HDU (D189, D192). `GET /v1/hdu/{id}` suma el bloque `cierre` (nulo si no hubo excepción) y el listado de HDU un booleano `cierreParcial`: cambios aditivos. Indicadores usa `cierreParcial` para clasificar (3.2) | Trazabilidad e historial; Organización es dueña del estado de la HDU |

## 2. Mapa de cobertura: qué existe y qué falta

| Necesidad | Qué existe | Qué falta | HDU |
| --- | --- | --- | --- |
| Datos de HDU, célula, sprint, analista, QE | Organización | Consulta interna por ámbito y por lote para Indicadores | E6-B01, E6-B02 |
| Avance y certificado por HDU | Certificaciones (`POST /v1/interno/checklist/estados`) | Nada nuevo; se consume | E6-B01 |
| Bloqueo y riesgo por HDU | E4: `POST /v1/interno/impedimentos/evaluacion` (`bloqueada`, `abiertos`, `escalados`, `nivelVigente`) | Nada nuevo; se consume. E4 dejó este insumo previsto | E6-B02 |
| Servicio, esquema, rol y contrato | No existen | `services/indicadores`, `svc_indicadores`, `indicadores.v1.yaml`, rutas del gateway | Todas |
| Umbral de carga y su auditoría | Nada | Tablas `umbral_carga` y `evento_umbral_carga` | E6-F03, E6-B02 |
| Snapshot diario y tendencia | Nada | Tablas, tarea programada, botón manual | E6-F04, E6-B03 |
| Exportación | Auditor exporta HDU, bitácora, impedimentos (D35, D70) | Exportación de indicadores para QE, Líder y Auditor, con PDF | E6-F04, E6-B04 |
| Cerrar una HDU incompleta | D11: el cierre exige checklist completo (E2-B02#3, `CHECKLIST_INCOMPLETO`) | Cierre con excepción: justificación, registro, aviso en el detalle, sin certificado | E6-F05, E6-B05 |
| Pantallas | Bandejas (E7) | Cuatro pestañas por rol y la pantalla de snapshots | E6-F01 a F04 |

Dependencias de construcción: B03 (tabla y snapshot) → F04; B01 → F01; B02 → F02 y F03; B04 → exportación de F04. B01 y B02 comparten las llamadas internas. B05 → F05, y B05 antes de B01 para que `cierreParcial` exista al clasificar (hasta entonces, Indicadores no tiene cerradas con excepción y la categoría vale 0).

## 3. Definiciones

### 3.1 Fuentes y ámbito

| Dato | Fuente | Se usa en |
| --- | --- | --- |
| HDU, estado, célula, sprint vigente (`historia_sprint` sin `fecha_retiro`) con `inicio` y `fin`, analista, QE responsable, supervisión vigente | Organización | Todo |
| Avance (`aprobados/10`) y certificado emitido | Certificaciones | Cumplimiento, certificadas, en curso, sin iniciar, tendencia |
| Bloqueo (impedimentos `ABIERTO` o `ESCALADO`, D59), impedimentos por estado, nivel de riesgo vigente (D66) | Impedimentos | Bloqueadas, semáforo |

### 3.2 Clasificación de una HDU

| Indicador | Definición | Fuente |
| --- | --- | --- |
| HDU totales | HDU del ámbito que cumplen los filtros, de cualquier estado | Organización |
| Cerradas con excepción | Estado `CERRADA` con cierre con excepción (`cierreParcial`, D173): se cerró con menos de 10 entregables aprobados. No tienen certificado (D174) | Organización |
| Certificadas | No es cerrada con excepción y tiene certificado emitido **o** su estado es `CERRADA` (cierre normal con 10 aprobados) | Organización + Certificaciones |
| Sin iniciar | No certificada, no cerrada y en estado `PENDIENTE` | Organización + Certificaciones |
| En curso | No certificada, no cerrada y en estado `DISENO_PRUEBAS`, `EN_EJECUCION` o `PENDIENTE_CIERRE` | Organización + Certificaciones |
| Bloqueadas | Tiene al menos un impedimento `ABIERTO` o `ESCALADO` (D59). Transversal: una HDU puede ser a la vez «en curso» y «bloqueada», o «certificada» y «bloqueada» (H8 con certificado sin cerrar). Una cerrada nunca está bloqueada (D60) | Impedimentos |
| Activa | Cualquier HDU en estado distinto de `CERRADA` (incluye `PENDIENTE`). Es la medida de carga | Organización |

Invariante: totales = certificadas + cerradas con excepción + en curso + sin iniciar. «Cerradas con excepción» depende solo de Organización, así que no queda indisponible cuando cae Certificaciones. Una HDU cerrada con excepción es «cerrada» para la carga (no es activa) y para el semáforo (no aporta color).

### 3.3 Cumplimiento promedio

`cumplimiento promedio = Σ avance(h) / N` sobre las N HDU del filtro, con `avance(h) = aprobados(h) × 10 %`. Ejemplo (QE1): HDU de 30, 10, 0, 80 y 100 % dan 220 / 5 = 44 %. Reglas: HDU sin ciclo = 0 %; HDU cerrada normal = 100 % (10 aprobados); HDU cerrada con excepción = su avance real al cerrar (por ejemplo 1 aprobado = 10 %); N = 0 ⇒ `null` («Sin datos»); redondeo a un decimal con mitad hacia arriba en la API y entero en pantalla (36,67 → 36,7 en la API y 37 % en pantalla). Se calcula sobre las HDU del filtro, no como promedio de promedios de células.

### 3.4 Semáforo por célula

El color se calcula con las HDU **no cerradas** de la célula dentro del ámbito de quien consulta. Por eso una misma célula puede verse de otro color para dos QE o para el QE y el Líder.

| Color | Condición | Texto |
| --- | --- | --- |
| Rojo | Alguna HDU con riesgo vigente `ALTO` **o** algún impedimento `ESCALADO` | «Rojo» |
| Amarillo | Sin rojo y alguna HDU con riesgo vigente `MEDIO` **o** algún impedimento `ABIERTO` | «Amarillo» |
| Verde | Hay HDU no cerradas, todas con riesgo `BAJO` y ningún impedimento `ABIERTO` ni `ESCALADO`; o la célula solo tiene HDU cerradas | «Verde» |
| Gris | La célula no tiene HDU en el ámbito | «Sin HDU» |
| Gris | Fuente caída que impide asegurar el color (ver abajo) | «No disponible» |

El riesgo vigente es el de E4 (D66: el fijado por el QE o, si no hay, el sugerido), y un impedimento escalado manda sobre un riesgo fijado más bajo (en el fixture, H6 tiene riesgo `MEDIO` fijado y un impedimento escalado: su célula es roja). Una HDU cerrada nunca aporta color.

**Fuente caída** (regla no negociable 4): solo el rojo es concluyente. Si hay un factor rojo conocido se muestra Rojo con `calculoParcial: true`. Si no lo hay y alguna HDU quedó sin evaluar, la célula se muestra «No disponible» (con «al menos Amarillo» si ya hay un factor amarillo), **nunca Verde**.

El color siempre lleva el texto (no depende solo del color). La vista no filtra por sprint: es el estado actual; sí filtra por célula.

### 3.5 Carga de trabajo y umbral

- Fila por analista: HDU activas, HDU por estado (`PENDIENTE`, `DISENO_PRUEBAS`, `EN_EJECUCION`, `PENDIENTE_CIERRE`, `CERRADA`) y cumplimiento (promedio de avance de todas sus HDU del ámbito, igual que 3.3).
- Aparecen los analistas que el QE supervisa y los que tienen HDU suyas como responsable. Los segundos llevan la etiqueta «No supervisado por ti».
- Fila especial «Sin analista asignado» con las HDU activas sin analista; es informativa y no se evalúa contra el umbral.
- Un analista sin HDU aparece con ceros y el texto «Sin HDU asignadas» (diferente de un error). Su cumplimiento se muestra «—», no 0 %.
- Un analista desactivado que conserva HDU activas aparece con la etiqueta «Inactivo» y se evalúa igual; sin HDU no aparece.
- **Sobrecarga:** HDU activas **mayores que** el umbral del QE. Los filtros de célula y sprint no cambian la evaluación (se evalúa siempre sobre todas las HDU activas del ámbito), pero sí las columnas por estado. Se marca con `data-sobrecarga="true"` y el texto «Sobrecargado» además del color.
- **Umbral:** valor por defecto 5 (`porDefecto: true` mientras el QE no lo cambie), entero de 1 a 50. Se aplica al instante y retroactivamente a la vista (no se guarda en snapshots).

### 3.6 Snapshot

Columnas de `snapshot_indicadores` (sección 5): `hdu_total`, `certificadas`, `cerradas_excepcion`, `en_curso`, `sin_iniciar`, `bloqueadas`, `suma_avance` (puntos porcentuales), `cumplimiento_promedio`, `hdu_riesgo_alto`, `hdu_riesgo_medio`, `impedimentos_abiertos`, `impedimentos_escalados`, `semaforo`. Un sprint «cerrado» (`fin` anterior a hoy) sigue recibiendo snapshots mientras tenga HDU vigentes en él.

### 3.7 Errores

| Código | HTTP | Cuándo |
| --- | --- | --- |
| `ACCESO_DENEGADO` | 403 | Rol sin acceso (Administrador y Analista en indicadores; QE o Líder fuera de su célula) o QE que fija el umbral de otro |
| `NO_AUTENTICADO` | 401 | Sin sesión, o cron sin o con `CRON_SECRET` incorrecto |
| `VALIDACION` | 400 | Parámetro mal formado (UUID, vista o formato inválido) o umbral no entero; con `campo` |
| `VALOR_FUERA_DE_RANGO` | 400 | Umbral menor que 1 o mayor que 50 |
| `SERVICIO_NO_DISPONIBLE` | 503 | Organización caída (o falla del registro de auditoría de una exportación) |
| `INDICADORES_NO_DISPONIBLES` | 503 | Exportar con un bloque indisponible |
| `EJECUCION_EN_CURSO` | 409 | Ya hay un snapshot corriendo |
| `EXPORTACION_EXCEDE_LIMITE` | 422 | Más filas que el máximo |

Un filtro con UUID válido que no existe o está fuera del ámbito **no** da error: responde 200 con `sinDatos: true` (no revela existencia). El drill-down de una célula ajena sí es un recurso: 403 para QE y Líder, 404 para el Auditor si no existe.

## 4. Matriz de permisos

| Operación | Analista QA | QE | Líder QA | Administrador | Auditor |
| --- | --- | --- | --- | --- | --- |
| Cumplimiento, semáforo, drill-down, carga, tendencia | No (403) | Su ámbito | Sus células vigentes (solo lectura) | No (403) | Todo (solo lectura) |
| Ver umbral de carga | No | El propio | El de cada QE de su ámbito | No | El de cualquier QE |
| Fijar umbral de carga | No | **Solo el propio** | No | No | No |
| Historial del umbral | No | El propio | No | No | Sí |
| Exportar CSV o PDF | No | Su ámbito | Sus células | No | Todo |
| Generar snapshot manual y ver ejecuciones | No | No | No | **Sí** | No |
| Cron del snapshot | — | — | — | — | Solo `CRON_SECRET` (actor `SISTEMA`) |

Toda operación que no está en «Sí» responde 403 `ACCESO_DENEGADO` con mensaje genérico. Sin sesión: 401. En el portal, el botón de una acción no permitida **no existe** (no solo deshabilitado), igual que D39. Una prueba que pulse con un permiso retirado recibe 403 y el mensaje «Ya no tienes permiso para esta acción».

## 5. Modelo de datos

Migración de Indicadores `<fecha>_e6_indicadores`, solo esquema `indicadores`, sin llaves foráneas a otro esquema (D24). Identificadores de otros servicios como UUID sin FK.

**`snapshot_indicadores`:** `id uuid PK`, `fecha date NOT NULL` (Santiago), `id_celula uuid NOT NULL`, `celula_nombre varchar(150)`, `id_sprint uuid NOT NULL`, `sprint_nombre varchar(150)`, `ambito varchar(40) NOT NULL` (`TODOS` o `QE:<uuid>`), `hdu_total`, `certificadas`, `cerradas_excepcion`, `en_curso`, `sin_iniciar`, `bloqueadas` (int NOT NULL, CHECK ≥ 0 y `hdu_total = certificadas + cerradas_excepcion + en_curso + sin_iniciar`), `suma_avance int NOT NULL`, `cumplimiento_promedio numeric(5,1)`, `hdu_riesgo_alto`, `hdu_riesgo_medio`, `impedimentos_abiertos`, `impedimentos_escalados` (int), `semaforo varchar(10)` (CHECK `ROJO|AMARILLO|VERDE`), `id_ejecucion uuid NOT NULL`, `generado_en timestamptz`. **Único** `(fecha, id_celula, id_sprint, ambito)`. Índice `(ambito, id_sprint, fecha)`. `REVOKE DELETE`.

**`ejecucion_snapshot`:** `id uuid PK`, `fecha date`, `origen` (`CRON|MANUAL`), `actor_id uuid NULL`, `actor_nombre varchar(150)` (`SISTEMA` para el cron), `inicio`, `fin timestamptz`, `resultado` (`EN_CURSO|EXITOSA|FALLIDA`), `filas_escritas int`, `motivo varchar(60) NULL` (`ORGANIZACION_NO_DISPONIBLE`, `CERTIFICACIONES_NO_DISPONIBLE`, `IMPEDIMENTOS_NO_DISPONIBLE`, `EXCEDE_TOPE`, `ERROR_INTERNO`). Índice único parcial `WHERE resultado = 'EN_CURSO'`. Una ejecución que lleva más de 5 minutos `EN_CURSO` se considera abandonada y deja de bloquear (como E5, D121). No guarda cifras ni datos personales.

**`umbral_carga`:** `id_qe uuid PK`, `valor smallint NOT NULL CHECK (valor BETWEEN 1 AND 50)`, `actualizado_por uuid`, `actualizado_en timestamptz`.

**`evento_umbral_carga`** (solo inserción, `REVOKE UPDATE, DELETE`): `id`, `id_qe`, `valor_anterior smallint NULL` (NULL en la primera vez; el implícito 5 se registra como anterior = 5), `valor_nuevo smallint`, `actor_id`, `actor_nombre`, `fecha timestamptz`. Índice `(id_qe, fecha DESC)`.

Las exportaciones no tienen tabla propia: su registro va en la auditoría de Organización (D168).

## 6. Contratos y rutas

Contrato nuevo `contracts/indicadores.v1.yaml`. El gateway debe enrutar `/v1/indicadores/**` y `/v1/cron/indicadores/**` al servicio Indicadores (`q360-seguridad-gateway`); la ruta del cron no pasa por la sesión del portal y solo valida `CRON_SECRET`.

| Método y ruta | Uso | Roles |
| --- | --- | --- |
| `GET /v1/indicadores/cumplimiento?celulaId&sprintId` | Indicadores de 3.2 y 3.3, por indicador `estado: ok\|indisponible` | QE, Líder, Auditor |
| `GET /v1/indicadores/semaforo?celulaId` | Una entrada por célula: `color`, `riesgoMaximo`, `impedimentosAbiertos`, `impedimentosEscalados`, `calculoParcial`, `estado` | QE, Líder, Auditor |
| `GET /v1/indicadores/semaforo/{celulaId}/hdu` | Drill-down con `motivos` por HDU | QE, Líder, Auditor |
| `GET /v1/indicadores/carga?celulaId&sprintId` | Filas por analista, `umbral`, `porDefecto`, `sobrecargado` | QE, Líder, Auditor |
| `GET /v1/indicadores/umbral-carga?qeId` | Umbral (el propio si no se da `qeId`) | QE (el propio), Líder y Auditor (los de su ámbito) |
| `PUT /v1/indicadores/umbral-carga` | Fija `{valor}` | Solo el QE dueño |
| `GET /v1/indicadores/umbral-carga/historial?qeId` | Eventos, más recientes primero | QE (el propio), Auditor |
| `GET /v1/indicadores/tendencia?celulaId&sprintId&desde&hasta` | Series ascendentes por fecha | QE, Líder, Auditor |
| `GET /v1/indicadores/exportacion?vista=cumplimiento\|semaforo\|carga\|tendencia&formato=csv\|pdf&…filtros` | Archivo | QE, Líder, Auditor |
| `POST /v1/indicadores/snapshots` | Disparo manual | Administrador |
| `GET /v1/indicadores/snapshots/ejecuciones` | Últimas ejecuciones, paginadas | Administrador |
| `GET /v1/cron/indicadores/snapshot` | Disparo programado | `CRON_SECRET` |

Reglas comunes: errores con el formato de `comun.v1.yaml`; filtros en la URL; fechas en hora de Chile. Cambios aditivos en otros contratos (los define `q360-backend`, sin tocar los existentes): una consulta interna de Organización por ámbito (rol, usuario y filtros → HDU con célula, sprint con fechas, analista, QE, estado, supervisión) y otra para el snapshot con ámbito global; el endpoint de Certificaciones y el de evaluación de Impedimentos se consumen tal como están. La exportación llama a Organización para registrar la auditoría (D168). Vercel: `vercel.json` suma la tarea programada de D163.

## 7. Efecto sobre HDU certificadas

Regla: ningún escenario certificado cambia de resultado esperado. Se **agrega** contenido.

| HDU o suite certificada | Qué cambia | Efecto |
| --- | --- | --- |
| **E1-F02#3 y menús de los portales** | QE: `["Bandeja","Equipo","Historias supervisadas","Impedimentos","Indicadores","Perfil"]` (la opción nueva va después de «Impedimentos»). Líder, Auditor y Administrador suman una opción («Indicadores» para Líder y Auditor; «Snapshots de indicadores» para el Administrador). El menú del Analista no cambia | **Sí, en el dato de la prueba** que afirma el arreglo exacto (patrón de D41 y E4). Se actualiza en las pruebas de menú de E1 y E7 |
| **E7-F01 (acceso a portales)** | Rutas nuevas `/qe/indicadores`, `/lider/indicadores`, `/auditor/indicadores`, `/admin/indicadores/snapshots`; los demás roles reciben acceso denegado (D41) | Ninguno. Se suman a la matriz de E7-F01-T04 |
| **Bandejas de E7 (F02 a F06, B03)** | Ninguno: no hay contadores ni filas nuevas (D170) | Ninguno |
| **Exportaciones del Auditor y entradas `EXPORTAR` de auditoría** | Las exportaciones de E6 dejan entradas `EXPORTAR` en la auditoría de Organización (D168) | Las pruebas de E7 que leen «la última entrada» o «el primer ítem de últimos cambios» crean su propio evento antes de leer (mismo aviso que E4) |
| **E2-B02#3 y D11 (cierre con checklist incompleto)** | **Regla modificada (D173).** Antes: se rechaza hasta completar el checklist. Ahora: se rechaza salvo que el QE responsable envíe una justificación válida. Sin justificación el resultado es el de siempre (409 `CHECKLIST_INCOMPLETO`, con el campo aditivo `puedeCerrarConExcepcion`) | **Cambia el enunciado del escenario, no el resultado de las pruebas existentes**, porque ninguna envía justificación. Se reescribe la descripción de E2-B02#3 en `historias-quality360.md` («…se rechaza, salvo cierre con excepción del QE responsable, E6-B05»). Pruebas que deben seguir pasando sin cambios: `services/organizacion/test/integracion/e3-acceso-y-cierre.test.ts` («checklist incompleto: 409 CHECKLIST_INCOMPLETO con el bloque ok» y la de Certificaciones caída: 503) y `e4-impedimentos-organizacion.test.ts` (`[E4-B02#2]` orden transición, checklist, impedimentos; y las de `HDU_BLOQUEADA` con checklist completo). Las pruebas de UI que provocan el rechazo desde el detalle deben conservar el mensaje y el código; el botón nuevo aparece **además** de ese mensaje (E6-F05) |
| **E4 (D60, orden de validación del cierre)** | El orden pasa a transición → checklist → justificación → impedimentos (D173). El rechazo por impedimentos abiertos sigue igual | Ninguno sobre los casos existentes: E4-B02 no envía justificación |
| **E3 (certificado, E3-F04/B03)** | Ninguno: el certificado sigue exigiendo los 10 entregables (D174) | Ninguno. Caso nuevo de verificación en E6-B05-T07 |
| **E7-F03 y `listas-cerrar`** | Ninguno: el contador sigue contando HDU con 10 aprobados y no cerradas; el cierre con excepción se hace desde el detalle (D71) | Ninguno |
| **E2-F04, detalle de HDU** | El detalle suma el bloque «Cerrada con excepción» y el botón «Cerrar con excepción» solo para el QE responsable; ambos después del checklist | Ninguno con los `data-testid` y el orden certificados |
| **Contratos** | `organizacion.v1.yaml`: campo opcional `justificacion` en el cambio de estado, bloque `cierre` en el detalle, `cierreParcial` en el listado, campo `puedeCerrarConExcepcion` en el 409; `comun.v1.yaml`: sin códigos nuevos (se usan `JUSTIFICACION_REQUERIDA` y `VALIDACION` de E4) | Todos aditivos |
| **Certificado de E4, resto de E5** | Ninguno | Ninguno |
| **Semilla** | `seed:e6` agrega lo estático de la sección 8: **QE3** (QE sin analistas ni HDU), **LID3** (Líder QA propio de E6) y **CEL-D** (sin HDU, asignada a LID3) (D208). No agrega HDU. Los sprints con fechas ya los define E4; los snapshots y el resto de los datos los crean las propias pruebas | Ninguno sobre lo que E7 y E4 dan por hecho: `hdu-total` sigue en 8, LID2 sigue sin células, CEL-C sigue sin líder y ningún usuario del fixture E7 cambia. Los contadores globales de E7 (10 usuarios activos 1/2/4/2/1, `qe-sin-analistas` 0) se afirman en valor exacto en la base pura **antes** de `seed:e6`; después, QE3 y LID3 suman 2 activos y QE3 cuenta como QE sin analistas |

## 8. Fixture de datos de prueba (compartido)

Parte del fixture de E7 y E4: mismos usuarios, células y H1–H8, impedimentos I1–I5, sprints SP-VENC, SP-PROX, SP-MED y SP-LEJ, y «hoy» en `America/Santiago`. Supuesto a confirmar con `q360-integraciones`: H4 tiene 0 % de avance (E4 solo fija el nivel BAJO por sprint lejano). Para E6-F05 y E6-B05 las pruebas llevan por los estados de D10 a H2 (1 aprobado, sin impedimentos abiertos: I4 está resuelto), a H5 (sin aprobados, hay que asignarle un analista antes) y a H1 (3 aprobados, con I2 abierto) hasta `PENDIENTE_CIERRE`, con las herramientas de E2; H8 (10 aprobados) se usa para el cierre normal. Cada archivo de pruebas recarga la semilla porque un cierre es terminal. Las pruebas de snapshot generan sus propias fechas con `Q360_FECHA_REFERENCIA`.

**Base pura y base compartida** (misma convención que E7 y E4, `docs/validacion/certificacion-e7.md`). La **base pura** tiene solo el fixture: `seed:e7`, `seed:e4` y `seed:e6`, sin la semilla MVP. La **base compartida** tiene además la semilla MVP (`npm run seed`) y lo que dejan las suites anteriores. El Auditor ve todo el sistema, así que sus cifras absolutas (E6-F01-T04, E6-B01-T07, E6-B02-T02, E6-B02-T13 y las exportaciones del Auditor, como E6-B04-T04) se afirman en valor exacto solo en la base pura. En la compartida se contrastan con el conteo de la base y con las células del fixture: CEL-A, CEL-B y CEL-C suman 8 HDU con cumplimiento 40 %.

**Avance y estado:** H1 30 %, H2 10 %, H3 0 %, H4 0 %, H5 0 %, H6 80 %, H7 100 % (cerrada, certificado F7), H8 100 % (pendiente de cierre, certificado F8). Riesgo vigente: H1 ALTO, H2 MEDIO, H3 MEDIO, H4 BAJO, H5 ALTO, H6 MEDIO (fijado), H7 sin evaluar, H8 BAJO. Bloqueadas: H1 (I2), H3 (I1) y H6 (I3, escalado).

**Indicadores esperados (sin filtros):**

| Usuario (ámbito) | Totales | Certificadas | Cerradas con excepción | En curso | Sin iniciar | Bloqueadas | Cumplimiento |
| --- | --- | --- | --- | --- | --- | --- | --- |
| QE1 (H1, H2, H5, H6, H8) | 5 | 1 (H8) | 0 | 3 (H1, H2, H6) | 1 (H5) | 2 (H1, H6) | 44 % (44,0) |
| QE2 (H3, H4, H7) | 3 | 1 (H7) | 0 | 1 (H4) | 1 (H3) | 1 (H3) | 33 % (33,3) |
| LID1 (H1, H2, H3, H5, H6, H7) | 6 | 1 | 0 | 3 | 2 (H3, H5) | 3 | 37 % (36,7) |
| AUD1 (las 8) | 8 | 2 (H7, H8) | 0 | 4 (H1, H2, H4, H6) | 2 | 3 | 40 % (40,0) |

El estado base no tiene cierres con excepción (H7 y H8 tienen 10 aprobados), por eso la columna nueva vale 0 y los demás valores no cambian. **Con un cierre con excepción** (E6-F01-T12 y E6-B01-T11: QE1 lleva H2, con 1 aprobado, a `PENDIENTE_CIERRE` y la cierra con justificación): QE1 pasa a totales 5, certificadas 1 (H8), cerradas con excepción 1 (H2), en curso 2 (H1, H6), sin iniciar 1 (H5), bloqueadas 2 y cumplimiento 44 % (H2 aporta 10 %, su avance real; si se contara como 100 % darían 62 %). El semáforo de CEL-A no cambia (H1 y H5 siguen en ALTO) y H2 sale de la carga de ANA2, que queda con 1 activa (H8) y 1 cerrada.

Con filtros para QE1: CEL-A (H1, H2, H5) = 3 totales, 0 certificadas, 2 en curso, 1 sin iniciar, 1 bloqueada, 13 % (13,3). El modelo tiene un sprint por célula, así que «SP-PROX» son **dos ids**: SP-PROX de CEL-A (H1) y SP-PROX de CEL-B (H6). Sprint = SP-PROX de CEL-A: 1 total (H1), 1 en curso, 1 bloqueada, 30 %. Sprint = SP-PROX de CEL-B: 1 total (H6), 1 en curso, 1 bloqueada, 80 %. La media de los dos es 55 %, pero ningún filtro único la produce. CEL-A y SP-PROX de CEL-A = 1 total (H1), 30 %. Una célula con el sprint de otra célula (por ejemplo, CEL-C y SP-PROX de CEL-A) no tiene HDU: «No hay HDU con esos filtros».

**Semáforo esperado:**

| Usuario | CEL-A | CEL-B | CEL-C |
| --- | --- | --- | --- |
| QE1 | Rojo (H1, H5: `RIESGO_ALTO`) | Rojo (H6: `IMPEDIMENTO_ESCALADO`) | Verde (H8) |
| QE2 | Verde (solo H7, cerrada) | Amarillo (H3: `RIESGO_MEDIO` e `IMPEDIMENTO_ABIERTO`) | Verde (H4) |
| LID1 | Rojo | Rojo | no la ve |
| AUD1 | Rojo | Rojo | Verde |

**Carga esperada (umbral por defecto 5):** QE1: ANA1 2 activas (H1, H6 en ejecución), cumplimiento 55 %; ANA2 2 activas (H2 en ejecución, H8 pendiente de cierre), 55 %; «Sin analista asignado» 1 (H5). QE2: ANA3 2 activas (H3 pendiente, H4 diseño de pruebas) y 1 cerrada (H7), cumplimiento 33 %. Con umbral 1, ANA1 y ANA2 quedan sobrecargados; con 2, ninguno. ANA4 no tiene QE ni HDU.

**Datos que suma E6:** `seed:e6` crea QE3 (QE activo sin analistas ni HDU), LID3 (Líder QA propio de E6, solo con CEL-D) y CEL-D (célula sin HDU, asignada a LID3), D208. LID2 sigue sin células, como exigen las pruebas certificadas de E7 y E4. Desde E6, CEL-D es la célula **ajena** para QE2 (no tiene HDU suyas); CEL-C no lo es, porque tiene H4. Para LID1 la ajena sigue siendo CEL-C. Las pruebas agregan además ANA4 supervisada por QE2 (para «sin asignaciones»), H4 reasignada a ANA1 por ADM1 con `PUT /v1/hdu/{id}/analista` (para la regla D160: ANA1 queda supervisada por QE1 y con una HDU de QE2; la supervisión doble no existe, D190), un analista desactivado con una HDU activa (por la API del Administrador: crear, asignar y desactivar; E1-B07 solo impide desactivar a un QE con analistas) y una serie de snapshots de tres días (H1 en 30, 30 y 40 %).

## 9. Convenciones comunes de pantalla

Se mantienen las de E7 y E4: estados cargando, vacío, error con «Reintentar» e indisponible; filtros en la URL; acceso denegado con «Ir a mi bandeja»; fechas en hora de Chile.

- **Claves de los identificadores (D191):** `<codigo>` de `tarjeta-celula-<codigo>` es el **id** de la célula y la clave de `fila-analista-<clave>` es el **id** del analista: el modelo no tiene códigos de célula ni de usuario. Las pruebas resuelven CEL-A o ANA1 con la semilla y acotan por el nombre visible.
- **Identificadores de prueba:** `tab-cumplimiento`, `tab-semaforo`, `tab-carga`, `tab-tendencia`, `filtro-celula`, `filtro-sprint`, `indicador-<clave>` (`totales`, `certificadas`, `cerradas-excepcion`, `en-curso`, `sin-iniciar`, `bloqueadas`, `cumplimiento`), `estado-sin-datos`, `estado-indisponible-<clave>`, `estado-error-<clave>`, `tarjeta-celula-<codigo>` con `data-color`, `lista-drilldown`, `fila-analista-<codigo>` con `data-sobrecarga`, `campo-umbral`, `boton-guardar-umbral`, `historial-umbral`, `grafica-tendencia`, `aviso-sin-historial`, `boton-exportar`, `snapshot-estado`, `boton-generar-snapshot`.
- **Sin datos** (E6-F01#3): un mensaje, sin cifras ni 0 %. Dos textos: «Aún no tienes HDU en tu ámbito» (ámbito vacío) y «No hay HDU con esos filtros» (filtro sin coincidencias).
- **Color:** todo semáforo y toda sobrecarga llevan además un texto; el contraste cumple el AA verificable con axe.
- **Botón de exportar:** `boton-exportar` con menú CSV y PDF; mientras se genera dice «Generando…» y queda deshabilitado.
- Si Indicadores no responde: «No disponible» con «Reintentar» en la pestaña, sin afectar el resto del portal.

## 10. HDU de frontend

### E6-F01 · Quality Engineer (QE)

Quiero ver un dashboard con el cumplimiento de certificación de mi equipo. Para supervisar el avance de un vistazo.

| # | Criterio | Contexto | Evento | Resultado esperado |
| --- | --- | --- | --- | --- |
| 1 | Indicadores | Existen HDU con avance en mi ámbito. | Abre `/qe/indicadores` (pestaña Cumplimiento). | Se muestran HDU totales, certificadas, cerradas con excepción, en curso, sin iniciar, bloqueadas y cumplimiento promedio, con las definiciones de 3.2 y 3.3; los totales cuadran con la suma de certificadas, cerradas con excepción, en curso y sin iniciar. |
| 2 | Filtro por sprint y célula | Hay varios sprints y células. | Aplica filtros. | Todos los indicadores se recalculan con la selección y los filtros quedan en la URL. |
| 3 | Sin datos | No hay HDU en el filtro (o en el ámbito). | Aplica filtros. | Se informa que no hay datos con el texto que corresponde, sin cifras ni 0 %. |

Reglas de negocio:
- Ver D153–D157, D169 y las secciones 3.2 y 3.3. La misma pantalla, en solo lectura, la usan el Líder QA (`/lider/indicadores`, sus células) y el Auditor (`/auditor/indicadores`, todo). El Administrador y el Analista reciben acceso denegado.
- Los filtros son Célula (solo células con HDU en el ámbito) y Sprint (sprints de esas HDU; los cerrados llevan «(cerrado)»; «Sin sprint» es una opción). Por defecto «Todas».
- Estados: cargando; sin datos; error con «Reintentar»; indisponible por indicador (Certificaciones caída deja «No disponible» en certificadas, en curso, sin iniciar y cumplimiento, y conserva totales, cerradas con excepción y bloqueadas).
- Efecto sobre HDU certificada: menú y rutas nuevas (sección 7).

Casos de prueba:

| ID | Tipo | Escenario | Datos | Pasos | Resultado esperado |
| --- | --- | --- | --- | --- | --- |
| E6-F01-T01 | e2e | #1 | QE1 | Abre `/qe/indicadores` | Totales 5, certificadas 1, cerradas con excepción 0, en curso 3, sin iniciar 1, bloqueadas 2, cumplimiento 44 %; la suma de las cuatro categorías es 5 |
| E6-F01-T02 | e2e | #1 | QE2 | Abre `/qe/indicadores` | Totales 3, certificadas 1, en curso 1, sin iniciar 1, bloqueadas 1, cumplimiento 33 %; no aparecen cifras de QE1 |
| E6-F01-T03 | e2e | #1 | LID1 | Abre `/lider/indicadores` | Totales 6, certificadas 1, en curso 3, sin iniciar 2, bloqueadas 3, cumplimiento 37 % |
| E6-F01-T04 | e2e | #1 | AUD1 | Abre `/auditor/indicadores` | **Base pura:** totales 8, certificadas 2, en curso 4, sin iniciar 2, bloqueadas 3, cumplimiento 40 %. **Base compartida:** los totales igualan el conteo de HDU de la base y, filtrando CEL-A, CEL-B y CEL-C, suman 8 HDU con cumplimiento conjunto 40 % (CEL-A 4 HDU 35 %, CEL-B 2 HDU 40 %, CEL-C 2 HDU 50 %). En ambas, la pantalla no tiene controles de edición |
| E6-F01-T05 | e2e | #2 | QE1 | Filtra Célula = CEL-A | Totales 3, certificadas 0, en curso 2, sin iniciar 1, bloqueadas 1, cumplimiento 13 %; la URL conserva `?celula=` |
| E6-F01-T06 | e2e | #2 | QE1 | Filtra Sprint = SP-PROX de CEL-A; luego Sprint = SP-PROX de CEL-B; luego Célula = CEL-A con SP-PROX de CEL-A | SP-PROX de CEL-A: totales 1 (H1), en curso 1, bloqueadas 1, cumplimiento 30 %. SP-PROX de CEL-B: totales 1 (H6), en curso 1, bloqueadas 1, cumplimiento 80 % (media de los dos: 55 %). CEL-A con SP-PROX de CEL-A: totales 1, cumplimiento 30 % |
| E6-F01-T07 | e2e | #3 | QE1 | Filtra Célula = CEL-C y Sprint = SP-PROX de CEL-A (el sprint de otra célula) | `estado-sin-datos` «No hay HDU con esos filtros»; no hay ningún `indicador-*` con cifra ni «0 %» |
| E6-F01-T08 | e2e | #3 | QE3 (sin HDU) | Abre `/qe/indicadores` | `estado-sin-datos` «Aún no tienes HDU en tu ámbito»; sin cifras |
| E6-F01-T09 | e2e | #1 | QE1 con Certificaciones detenido | Abre `/qe/indicadores` | Totales 5, cerradas con excepción 0 y bloqueadas 2 con valor; certificadas, en curso, sin iniciar y cumplimiento dicen «No disponible» (sin ceros); el resto del portal carga |
| E6-F01-T10 | e2e | #1 negativo | ANA1, ADM1; QE1 en `/lider/indicadores` | Abren las rutas de indicadores que no son suyas | Acceso denegado con «Ir a mi bandeja» en todas; ninguna petición de datos devuelve 200 |
| E6-F01-T11 | e2e | regresión | QE1, LID1, AUD1, ADM1 | Ejecuta las pruebas certificadas de E1-F02, E7-F01 y E7-F03 | Pasan (con el arreglo de menús actualizado donde se afirma exacto) |
| E6-F01-T12 | e2e | #1 | QE1 tras cerrar H2 con excepción (1 aprobado) | Abre `/qe/indicadores` | Totales 5, certificadas 1, `indicador-cerradas-excepcion` 1, en curso 2, sin iniciar 1, bloqueadas 2, cumplimiento 44 % (H2 cuenta 10 %, no 100 %); la etiqueta de la categoría dice «Cerradas con excepción (sin certificado)» |

### E6-F02 · Quality Engineer (QE)

Quiero ver un semáforo de riesgo e impedimentos por célula. Para identificar dónde intervenir primero.

| # | Criterio | Contexto | Evento | Resultado esperado |
| --- | --- | --- | --- | --- |
| 1 | Semáforo | Existen HDU con distintos riesgos e impedimentos. | Abre la pestaña Semáforo. | Cada célula del ámbito muestra su color y su texto según 3.4: rojo con riesgo `ALTO` o impedimento `ESCALADO`, amarillo con riesgo `MEDIO` o impedimento `ABIERTO`, verde sin ninguno. |
| 2 | Drill-down | Una célula está en rojo (o amarillo). | La selecciona. | Se listan las HDU que generan el color, con el motivo de cada una, y un enlace «Abrir» al detalle de la HDU. |
| 3 | Actualización | Se resuelve un impedimento. | Vuelve a la vista. | El semáforo refleja el nuevo estado sin pasos adicionales (sin caché). |

Reglas de negocio:
- Ver D157, D158, D169 y la sección 3.4. Líder y Auditor ven la misma pestaña en solo lectura.
- Orden de las tarjetas: rojo, amarillo, verde, gris; dentro del color, por nombre. Orden del drill-down: motivo de mayor gravedad, riesgo vigente (Alto, Medio), días abiertos del impedimento.
- Una célula sin HDU en el ámbito aparece gris «Sin HDU» (solo si el usuario la tiene asignada, por ejemplo un Líder con una célula nueva).
- Si Impedimentos o Certificaciones no responden se aplica la regla de fuente caída de 3.4; el drill-down muestra solo lo conocido y lo dice.

Casos de prueba:

| ID | Tipo | Escenario | Datos | Pasos | Resultado esperado |
| --- | --- | --- | --- | --- | --- |
| E6-F02-T01 | e2e | #1 | QE1 | Abre la pestaña Semáforo | CEL-A rojo, CEL-B rojo, CEL-C verde; cada tarjeta tiene el texto del color y `data-color` |
| E6-F02-T02 | e2e | #1 | QE2 | Abre la pestaña Semáforo | CEL-A verde (solo la HDU cerrada H7), CEL-B amarillo, CEL-C verde |
| E6-F02-T03 | e2e | #1 | LID1; AUD1 | Abren el semáforo | LID1: CEL-A rojo y CEL-B rojo, sin CEL-C. AUD1: rojo, rojo y verde |
| E6-F02-T04 | e2e | #2 | QE1 | Selecciona CEL-A | `lista-drilldown` con H1 y H5 (`RIESGO_ALTO`); no están H2 (MEDIO) ni las de otras células |
| E6-F02-T05 | e2e | #2 | QE1 | Selecciona CEL-B | Una fila: H6 con motivo `IMPEDIMENTO_ESCALADO` (I3) y riesgo vigente MEDIO fijado; no aparece H3 (es de QE2) |
| E6-F02-T06 | e2e | #2 | QE2 | Selecciona CEL-B; luego CEL-C | CEL-B: H3 con `RIESGO_MEDIO` e `IMPEDIMENTO_ABIERTO`. CEL-C: «Sin HDU con riesgo ni impedimentos» |
| E6-F02-T07 | e2e | #3 | QE2 | Resuelve I1 en el detalle de H3 (E4-F03) y vuelve al Semáforo; luego reabre I1 | Tras resolver: CEL-B verde. Tras reabrir: amarillo |
| E6-F02-T08 | e2e | #3 | QE1 | Resuelve I3 y vuelve al Semáforo; luego reabre I3 | Tras resolver: CEL-B amarillo (H6 queda con MEDIO fijado). Tras reabrir: amarillo, no rojo, porque I3 vuelve a `ABIERTO` y no a `ESCALADO` (regla certificada E4-F03#3); el motivo es `IMPEDIMENTO_ABIERTO` |
| E6-F02-T09 | e2e | #1 | QE1 con Impedimentos detenido | Abre el Semáforo | Las 3 tarjetas dicen «No disponible»; ninguna es verde; el resto del portal carga |
| E6-F02-T10 | e2e | #1 | QE1 con Certificaciones detenido | Abre el Semáforo | CEL-A rojo con aviso «cálculo parcial» (H1 sigue en ALTO por sus impedimentos), CEL-B rojo (escalado), CEL-C «No disponible» y no verde |
| E6-F02-T11 | e2e | #1 | LID3 con CEL-D asignada (sin HDU, `seed:e6`, D208) | Abre el Semáforo | Tarjeta CEL-D gris «Sin HDU», no verde |
| E6-F02-T12 | e2e | #1 negativo | ANA1, ADM1 | Abren el Semáforo | Acceso denegado; la petición de semáforo devuelve 403 |

### E6-F03 · Quality Engineer (QE)

Quiero ver la carga de trabajo de cada analista de mi equipo. Para distribuir las HDU de forma equilibrada.

| # | Criterio | Contexto | Evento | Resultado esperado |
| --- | --- | --- | --- | --- |
| 1 | Carga por analista | Los analistas tienen HDU asignadas. | Abre la pestaña Carga. | Se muestra por analista la cantidad de HDU por estado, las activas, el cumplimiento y el umbral aplicado. |
| 2 | Sobrecarga | Un analista supera el umbral que configuré. | Abre la vista. | La fila se destaca con color y con el texto «Sobrecargado». El QE puede cambiar su umbral desde la misma pestaña. |
| 3 | Sin asignaciones | Un analista de mi equipo no tiene HDU. | Abre la vista. | Aparece con ceros y «Sin HDU asignadas», diferenciado de un error. |

Reglas de negocio:
- Ver D159–D161 y la sección 3.5.
- Control del umbral: campo numérico entero con el valor actual, «Valor por defecto» mientras no se haya cambiado, ayuda «De 1 a 50 HDU activas; se considera sobrecarga superar este valor» y `boton-guardar-umbral`. Mensajes: «Ingresa un número entero» y «El umbral debe estar entre 1 y 50». Al guardar, la vista se recalcula. Solo el QE dueño tiene el control; Líder y Auditor ven el valor y el nombre del QE (no hay botón).
- Líder y Auditor ven las filas agrupadas por QE supervisor, cada grupo con su umbral. El Auditor ve además `historial-umbral` (valor anterior y nuevo, quién, cuándo); el QE ve el suyo.
- Con filtros de célula o sprint, las columnas por estado se recalculan, pero la marca de sobrecarga no (3.5).
- Estados: cargando; error con «Reintentar»; con Certificaciones caída el cumplimiento dice «No disponible» y la sobrecarga sigue (solo depende de Organización).

Casos de prueba:

| ID | Tipo | Escenario | Datos | Pasos | Resultado esperado |
| --- | --- | --- | --- | --- | --- |
| E6-F03-T01 | e2e | #1 | QE1 | Abre la pestaña Carga | `fila-analista-ANA1`: 2 activas, 2 en ejecución, cumplimiento 55 %; `fila-analista-ANA2`: 2 activas (1 en ejecución, 1 pendiente de cierre), 55 %; fila «Sin analista asignado» con 1 (H5); umbral 5 «Valor por defecto»; ninguna sobrecargada |
| E6-F03-T02 | e2e | #1 | QE2 | Abre la pestaña Carga | ANA3: 2 activas (1 pendiente, 1 en diseño), 1 cerrada, cumplimiento 33 %; no aparecen ANA1 ni ANA2 |
| E6-F03-T03 | e2e | #2 | QE1 | Fija el umbral en 1 | ANA1 y ANA2 con `data-sobrecarga="true"` y el texto «Sobrecargado»; la fila «Sin analista asignado» no se marca |
| E6-F03-T04 | e2e | #2 | QE1 | Fija el umbral en 2 | Ninguna fila sobrecargada (2 no supera 2); con 1 de nuevo, vuelven a marcarse |
| E6-F03-T05 | e2e | #3 | QE2 con ANA4 supervisada (ANA4 sin HDU) | Abre la pestaña Carga | `fila-analista-ANA4` con ceros, «Sin HDU asignadas» y cumplimiento «—»; sin estilo de error; la carga de ANA3 sigue igual |
| E6-F03-T06 | e2e | #2 negativo | QE1 | Prueba 0, 51, 2.5, «abc» y vacío; luego 50 | Un mensaje por cada valor inválido, nada se guarda; 50 se guarda y la pantalla lo muestra |
| E6-F03-T07 | e2e | #2 | LID1 con el umbral de QE1 en 1 | Abre la pestaña Carga | Ve ANA1 y ANA2 en el grupo de QE1, con umbral 1. ANA1: 2 activas (H1, H6) y «Sobrecargado». ANA2: solo H2, porque H8 es de CEL-C y LID1 no la ve (D160): «1 de 1», sin marca de sobrecarga. No existen `campo-umbral` ni `boton-guardar-umbral` |
| E6-F03-T08 | e2e | #2 | AUD1 | Abre la pestaña Carga | Ve los grupos de QE1 y QE2 y el `historial-umbral` de QE1 con los cambios hechos; ANA4 aparece con «Sin QE supervisor», umbral 5 y sin HDU |
| E6-F03-T09 | e2e | #2 | QE1, QE2 | QE1 cambia el umbral de 5 a 1; QE2 abre su Carga | El historial de QE1 muestra anterior 5, nuevo 1, actor QE1 y fecha; el umbral de QE2 sigue 5; QE2 no ve nada de QE1 |
| E6-F03-T10 | e2e | #2 | ANA1 supervisada por QE1 (umbral 1); H4 (QE2 responsable) reasignada a ANA1 por ADM1; QE2 con umbral 5 (D190) | Ambos abren la Carga | QE1: ANA1 con 3 activas (H1, H6, H4) y sobrecargada. QE2: ANA1 con 1 activa (H4), «No supervisado por ti» y no sobrecargada |
| E6-F03-T11 | e2e | #1 | QE1 con Certificaciones detenido | Abre la pestaña Carga | Cantidades por estado y marca de sobrecarga correctas; el cumplimiento dice «No disponible» |
| E6-F03-T12 | e2e | #1 negativo | ANA1, ADM1 | Abren la pestaña Carga | Acceso denegado; las peticiones devuelven 403 |

### E6-F04 · Quality Engineer (QE)

Quiero ver la tendencia histórica del cumplimiento y exportar el dashboard. Para reportar el avance a la célula.

| # | Criterio | Contexto | Evento | Resultado esperado |
| --- | --- | --- | --- | --- |
| 1 | Tendencia | Existen snapshots diarios. | Abre la gráfica de tendencia. | Se muestra la evolución del cumplimiento promedio por sprint, una serie por (célula, sprint), con las fechas en orden y los huecos sin interpolar. |
| 2 | Exportación | El QE está en el dashboard. | Presiona Exportar y elige PDF o CSV. | Se descarga el archivo de la vista abierta, con los filtros aplicados, un encabezado y la fecha de generación. |
| 3 | Sin historial | No hay snapshots en el ámbito. | Abre la gráfica. | Se informa «Aún no hay historial», sin gráfica ni valores. |

Reglas de negocio:
- Ver D162–D168 y las secciones 3.6 y 5. El Líder y el Auditor ven la misma gráfica y también exportan.
- La gráfica tiene un texto alternativo (tabla de puntos accesible) y cada punto lleva fecha y valor. Un solo punto: se muestra el punto y «Aún hay un solo día de historial». El punto de un día refleja la madrugada de esa fecha (D163); el portal lo indica en una nota.
- La exportación vale para las cuatro pestañas; descarga la pestaña activa con sus filtros. Nombre del archivo `quality360-indicadores-<vista>-AAAAMMDD.<ext>`.
- Si el bloque no está disponible, el botón informa «No se pudo generar el reporte: hay datos no disponibles» y no descarga nada.
- Efecto sobre HDU certificada: ninguno más allá de la sección 7.

Casos de prueba:

| ID | Tipo | Escenario | Datos | Pasos | Resultado esperado |
| --- | --- | --- | --- | --- | --- |
| E6-F04-T01 | e2e | #1 | QE1, snapshots de tres días (H1 en 30, 30 y 40 %) | Abre la pestaña Tendencia con CEL-A y SP-PROX | `grafica-tendencia` con una serie de 3 puntos en orden de fecha: 30, 30 y 40 %; la tabla accesible lo repite |
| E6-F04-T02 | e2e | #1 | QE1 | Quita el filtro de célula y de sprint | Una serie por cada (célula, sprint) vigente con snapshot, con un máximo de 6; cada serie rotulada «Célula · Sprint» |
| E6-F04-T03 | e2e | #2 | QE1 en la pestaña Cumplimiento | Exporta PDF | Se descarga `quality360-indicadores-cumplimiento-AAAAMMDD.pdf` con tipo `application/pdf` |
| E6-F04-T04 | e2e | #2 | QE1, filtro CEL-A en Semáforo | Exporta CSV | Archivo `.csv` con el encabezado y los filtros «Célula: CEL-A», y solo filas de CEL-A |
| E6-F04-T05 | e2e | #3 | QE sin snapshots (se limpian en el entorno de prueba) | Abre la pestaña Tendencia | `aviso-sin-historial` «Aún no hay historial»; no hay gráfica ni valores |
| E6-F04-T06 | e2e | #1 | QE1, snapshots de los días 1 y 3 sin el día 2 | Abre la pestaña Tendencia | La línea tiene un hueco en el día 2 y no pasa por un valor inventado |
| E6-F04-T07 | e2e | #1 | QE1, un solo snapshot | Abre la pestaña Tendencia | Un punto y el texto «Aún hay un solo día de historial» |
| E6-F04-T08 | e2e | #2 | QE1 con Impedimentos detenido | Exporta el Semáforo | Mensaje «No se pudo generar el reporte: hay datos no disponibles»; no se descarga archivo |
| E6-F04-T09 | e2e | #2 negativo | ANA1, ADM1 | Intentan abrir el dashboard y llamar a la exportación | Acceso denegado; la exportación devuelve 403; no existe `boton-exportar` |

### E6-F05 · Quality Engineer (QE) — nueva

Quiero cerrar una HDU con menos de 10 entregables aprobados, justificando la decisión. Para cerrar el trabajo que ya no se completará sin perder la trazabilidad de por qué.

| # | Criterio | Contexto | Evento | Resultado esperado |
| --- | --- | --- | --- | --- |
| 1 | Cierre con excepción | Soy el QE responsable de una HDU en «Pendiente de cierre» con menos de 10 entregables aprobados y sin impedimentos abiertos. | Pulso «Cerrar con excepción», escribo la justificación y confirmo. | La HDU queda Cerrada; el detalle muestra «Cerrada con excepción: N de 10 entregables aprobados» con la justificación, mi nombre y la fecha, y la lista de los entregables que quedaron pendientes. |
| 2 | Justificación obligatoria | El cuadro está abierto. | Confirmo sin justificación, con menos de 20 caracteres o con más de 500. | Se marca el campo con su mensaje, el cuadro sigue abierto con lo escrito y la HDU no cambia. Con impedimentos abiertos se informa que no se puede cerrar y se enlaza a ellos. |
| 3 | Constancia | La HDU quedó cerrada con excepción. | Reviso el detalle y el historial (yo, el Líder o el Auditor). | Se ve «Sin certificado», no hay botón para generarlo, el checklist sigue visible con los pendientes y el historial muestra el evento «Cierre con excepción» con actor, fecha y justificación. |

Reglas de negocio:
- Ver D173–D175 y la sección 7. El botón «Cerrar con excepción» existe solo para el QE responsable y solo con la HDU en `PENDIENTE_CIERRE`, con menos de 10 aprobados. Para los demás roles **no existe** (D39). Con 10 aprobados el botón sigue siendo el del cierre normal, «Pasar a Cerrada» (certificado en E2 y E4), y no pide justificación.
- Cuadro: título «Cerrar con excepción», texto «Quedan N entregables sin aprobar: <lista>. No se emitirá certificado y la HDU no podrá reabrirse», campo de justificación con contador (20 a 500) y los botones «Cerrar con excepción» y «Cancelar».
- Si el QE pulsa «Pasar a Cerrada» con el checklist incompleto, el rechazo certificado se conserva (mensaje y código) y aparece además el botón nuevo. Con Certificaciones caída: «No pudimos verificar el checklist de la HDU» y sin cuadro.
- Efecto sobre HDU certificada: ver sección 7 (E2-B02#3, detalle de HDU).

Casos de prueba:

| ID | Tipo | Escenario | Datos | Pasos | Resultado esperado |
| --- | --- | --- | --- | --- | --- |
| E6-F05-T01 | e2e | #1 | QE1, H2 en `PENDIENTE_CIERRE` (1 aprobado) | Abre `/hdu/<H2>` y pulsa `boton-cerrar-excepcion` | El cuadro dice «Quedan 9 entregables sin aprobar» y los lista; hay contador de justificación |
| E6-F05-T02 | e2e | #2 negativo | QE1, mismo cuadro | Confirma vacío; luego con 19 caracteres; luego intenta escribir 501 | «La justificación es obligatoria»; «La justificación debe tener entre 20 y 500 caracteres»; el contador impide pasar de 500; la HDU sigue en `PENDIENTE_CIERRE` |
| E6-F05-T03 | e2e | #1 | QE1 | Escribe una justificación de 40 caracteres y confirma | Estado Cerrada; `cierre-excepcion` dice «Cerrada con excepción: 1 de 10 entregables aprobados» con la justificación, «QE1» y la fecha de hoy |
| E6-F05-T04 | e2e | #3 | QE1 tras T03 | Revisa el detalle | `sin-certificado` «Sin certificado»; no existe el botón de generar certificado; el checklist muestra los 9 pendientes; no hay botón de reabrir |
| E6-F05-T05 | e2e | #3 | LID1, AUD1 tras T03 | Abren `/hdu/<H2>` | Ven el bloque `cierre-excepcion` y el evento «Cierre con excepción» en el historial, con la justificación; sin botones de acción (D39) |
| E6-F05-T06 | e2e | #1 negativo | QE2, ANA2, LID1, AUD1, ADM1 | Abren una HDU en `PENDIENTE_CIERRE` con menos de 10 aprobados (H5 llevada a ese estado) | No existe `boton-cerrar-excepcion` en ningún rol; QE2 y ANA2 además reciben acceso denegado (fuera de ámbito) |
| E6-F05-T07 | e2e | #2 negativo | QE1, H1 en `PENDIENTE_CIERRE` con I2 abierto | Escribe una justificación válida y confirma | El rechazo reutiliza el mensaje certificado de E4 (`error-hdu-bloqueada`): «No se puede cerrar la HDU: tiene 1 impedimento abierto o escalado. Resuélvelos y vuelve a intentar.», con enlace a I2 en `lista-error-bloqueantes`; la HDU sigue en `PENDIENTE_CIERRE`; al resolver I2 y repetir, se cierra |
| E6-F05-T08 | e2e | #1 | QE1, H8 (10 aprobados, certificado F8) | Abre `/hdu/<H8>` | El botón es «Pasar a Cerrada» y no pide justificación; queda Cerrada sin el bloque de excepción |
| E6-F05-T09 | e2e | #1 | QE1 con Certificaciones detenido | Abre `/hdu/<H2>` y pulsa cerrar | «No pudimos verificar el checklist de la HDU»; no se abre el cuadro; la HDU no cambia |
| E6-F05-T10 | e2e | regresión | QE1, ANA1, AUD1 | Ejecuta las pruebas certificadas de E2-F04, E3-F01 y E7-F03 | Pasan sin cambios |

## 11. HDU de backend

### E6-B01 · Quality Engineer (QE)

Quiero que el sistema calcule los indicadores de cumplimiento sobre datos autorizados. Para que el dashboard sea confiable.

| # | Criterio | Contexto | Evento | Resultado esperado |
| --- | --- | --- | --- | --- |
| 1 | Cálculo por ámbito | Un QE (o Líder o Auditor) solicita los indicadores. | Se procesa. | Se calculan solo sobre las HDU de su ámbito (D153), con las definiciones de 3.2 y 3.3. |
| 2 | Filtros | Se envían sprint y célula. | Se procesa. | Los agregados respetan los filtros; un filtro sin coincidencias da `sinDatos: true` y `null` en el promedio, no ceros. |
| 3 | Consistencia | Cambia un entregable. | Se solicita el dashboard. | Los indicadores reflejan el cambio en la misma consulta (sin caché). |

Reglas de negocio:
- Ver D153–D156, D169, D171. Respuesta: `hduTotales`, `certificadas`, `cerradasConExcepcion`, `enCurso`, `sinIniciar`, `bloqueadas`, `cumplimientoPromedio` (1 decimal o `null`), cada uno con `estado`, y `sinDatos`.
- Un id de célula o sprint que no existe o está fuera del ámbito: 200 con `sinDatos: true`. Un UUID mal formado: 400 `VALIDACION`.
- Organización caída: 503. Certificaciones o Impedimentos caídos: solo los indicadores que dependen de ellos quedan `indisponible` (D169).

Casos de prueba:

| ID | Tipo | Escenario | Datos | Pasos | Resultado esperado |
| --- | --- | --- | --- | --- | --- |
| E6-B01-T01 | api | #1 | QE1 | `GET /v1/indicadores/cumplimiento` | 200: totales 5, certificadas 1, en curso 3, sin iniciar 1, bloqueadas 2, cumplimiento 44.0 |
| E6-B01-T02 | api | #1 | QE2; QE1 con `celulaId` CEL-B | Dos consultas | QE2: totales 3, cumplimiento 33.3. QE1 en CEL-B: solo H6 (totales 1, 80.0), sin H3 |
| E6-B01-T03 | api | #1 negativo | ANA1, ADM1; sin sesión | Consultan | 403 `ACCESO_DENEGADO` los dos primeros; 401 `NO_AUTENTICADO` el último |
| E6-B01-T04 | api | #2 | QE1 | `celulaId`=CEL-A; `sprintId`=SP-PROX de CEL-A; `sprintId`=SP-PROX de CEL-B; CEL-A con SP-PROX de CEL-A | CEL-A: 3 HDU, 13.3. SP-PROX de CEL-A: 1 HDU (H1), 30.0. SP-PROX de CEL-B: 1 HDU (H6), 80.0 (media de los dos: 55.0). CEL-A con SP-PROX de CEL-A: 1 HDU (H1), 30.0 |
| E6-B01-T05 | api | #2 | QE2 | `celulaId` con UUID válido inexistente; luego un UUID mal formado | El primero 200 con `sinDatos: true` y `cumplimientoPromedio: null`; el segundo 400 `VALIDACION` |
| E6-B01-T06 | api | #3 | QE1 | Consulta; QE1 aprueba el entregable 4 de H1; consulta de nuevo | Antes 44.0; después 46.0 (H1 pasa de 30 a 40 %); sin esperas |
| E6-B01-T07 | api | #1 | LID1; AUD1 | Consultan | LID1: 6 HDU, 36.7. AUD1, **base pura:** 8 HDU, 40.0. AUD1, **base compartida:** `hduTotales` igual al conteo de HDU de la base, y con `celulaId` CEL-A, CEL-B y CEL-C suma 8 HDU con cumplimiento conjunto 40.0 (CEL-A 4 HDU 35.0, CEL-B 2 HDU 40.0, CEL-C 2 HDU 50.0). En ambos, certificadas + cerradas con excepción + en curso + sin iniciar = totales |
| E6-B01-T08 | api | #1 | QE1 con Certificaciones detenido | Consulta | 200: `hduTotales` 5, `cerradasConExcepcion` 0 y `bloqueadas` 2 con `estado: ok`; certificadas, en curso, sin iniciar y cumplimiento con `estado: indisponible` y valor `null` (no 0) |
| E6-B01-T09 | api | #1 | QE1 con Organización detenido | Consulta | 503 `SERVICIO_NO_DISPONIBLE`; no hay cifras |
| E6-B01-T10 | api | #1 | QE1 con Impedimentos detenido | Consulta | `bloqueadas` indisponible y el resto con valor |
| E6-B01-T11 | api | #1 | QE1 tras cerrar H2 con excepción (E6-B05-T01) | Consulta; luego `celulaId`=CEL-A | Completo: `certificadas` 1, `cerradasConExcepcion` 1, `enCurso` 2, `sinIniciar` 1, cumplimiento 44.0 (H2 aporta 10, no 100). CEL-A: 3 HDU (H1, H2, H5), `cerradasConExcepcion` 1, cumplimiento 13.3. La suma de las cuatro categorías es igual a `hduTotales` |

### E6-B02 · Quality Engineer (QE)

Quiero que el sistema agregue riesgo e impedimentos por célula y analista. Para alimentar el semáforo y la carga de trabajo.

| # | Criterio | Contexto | Evento | Resultado esperado |
| --- | --- | --- | --- | --- |
| 1 | Agregación por célula | Existen HDU con riesgo e impedimentos. | Se procesa. | Se devuelve por célula el riesgo máximo, los impedimentos abiertos y escalados, el color según 3.4 y las HDU que lo generan. |
| 2 | Agregación por analista | Se solicita la carga. | Se procesa. | Se devuelven las HDU por estado, las activas y el cumplimiento por analista, con la sobrecarga evaluada. |
| 3 | Umbral | Se configura un umbral de carga. | Se procesa. | Se marca a los analistas que lo superan; el umbral queda auditado. |

Reglas de negocio:
- Ver D157–D161 y las secciones 3.4 y 3.5. `riesgoMaximo` es el mayor `nivelVigente` entre las HDU no cerradas de la célula. `impedimentosAbiertos` cuenta los `ABIERTO` y `impedimentosEscalados` los `ESCALADO`.
- Drill-down: `motivos` por HDU entre `RIESGO_ALTO`, `IMPEDIMENTO_ESCALADO`, `RIESGO_MEDIO`, `IMPEDIMENTO_ABIERTO`. Célula ajena: 403 para QE y Líder; inexistente: 404 para el Auditor.
- Umbral: `PUT` con `{valor}` entero de 1 a 50, solo del QE dueño; cada cambio inserta un evento. Si el valor es igual al vigente no se inserta evento (200 sin cambios).
- Analista desactivado con HDU activas: aparece con `inactivo: true`. Supervisado por varios QE: D160.

Casos de prueba:

| ID | Tipo | Escenario | Datos | Pasos | Resultado esperado |
| --- | --- | --- | --- | --- | --- |
| E6-B02-T01 | api | #1 | QE1 | `GET /v1/indicadores/semaforo` | CEL-A: ROJO, riesgoMaximo ALTO, abiertos 1 (I2), escalados 0. CEL-B: ROJO, riesgoMaximo MEDIO, abiertos 0, escalados 1 (I3). CEL-C: VERDE, riesgoMaximo BAJO |
| E6-B02-T02 | api | #1 | QE2; AUD1 | Consultan | QE2: CEL-A VERDE (0 HDU activas), CEL-B AMARILLO (MEDIO, abiertos 1), CEL-C VERDE. AUD1: CEL-A ROJO, CEL-B ROJO, CEL-C VERDE. **Base pura:** AUD1 recibe solo esas tres células. **Base compartida:** AUD1 recibe además las células de la semilla MVP, tantas como células con HDU tenga la base, y CEL-A, CEL-B y CEL-C mantienen esos colores |
| E6-B02-T03 | api | #1 | QE1 | `GET /v1/indicadores/semaforo/<CEL-A>/hdu`; luego `<CEL-B>` | CEL-A: H1 y H5, motivos `RIESGO_ALTO`. CEL-B: H6, motivo `IMPEDIMENTO_ESCALADO`, nivel vigente MEDIO |
| E6-B02-T04 | api | #1 negativo | QE2 con CEL-D (ajena: sin HDU de QE2); LID1 con CEL-C (no es suya); AUD1 con un UUID inexistente | Piden el drill-down | QE2 y LID1: 403 `ACCESO_DENEGADO`. AUD1: 404. CEL-C no sirve como ajena para QE2, porque tiene H4 |
| E6-B02-T05 | api | #2 | QE1 | `GET /v1/indicadores/carga` | ANA1: activas 2, enEjecucion 2, cumplimiento 55.0. ANA2: activas 2 (enEjecucion 1, pendienteCierre 1), 55.0. Fila sin analista: 1. `umbral` 5, `porDefecto` true, ninguna `sobrecargado` |
| E6-B02-T06 | api | #3 | QE1 | `PUT umbral-carga {valor: 1}`; luego `GET carga`; luego `{valor: 2}` | ANA1 y ANA2 `sobrecargado: true` con 1; con 2 ninguno; `porDefecto` false |
| E6-B02-T07 | api | #3 negativo | QE1 | `PUT` con 0, 51, 2.5, «abc» y vacío | 0 y 51: 400 `VALOR_FUERA_DE_RANGO`; el resto 400 `VALIDACION` con `campo: valor`; el umbral no cambia |
| E6-B02-T08 | api | #3 negativo | QE2, LID1, AUD1, ADM1, ANA1 | Cada uno hace `PUT umbral-carga`; QE2 `GET umbral-carga?qeId=<QE1>`; LID1 y AUD1 leen el de QE1 | El `PUT` de QE2 es sobre su propio umbral y es válido (200, D159). LID1, AUD1, ADM1 y ANA1: 403 `ACCESO_DENEGADO`. El umbral de QE1 sigue en 5. QE2 recibe 403 al leer el de QE1; LID1 y AUD1 lo leen con 200 (valor 5) |
| E6-B02-T09 | api | #3 | QE1 tras dos cambios (5→1, 1→2) | `GET umbral-carga/historial` | Dos eventos, el más reciente primero, con valor anterior, nuevo, actor y fecha; un intento directo de `UPDATE` o `DELETE` con el rol `svc_indicadores` falla; AUD1 lo lee y LID1 recibe 403 |
| E6-B02-T10 | api | #1 | QE1 con Certificaciones detenido | `GET semaforo` | CEL-A ROJO con `calculoParcial: true` (H1 alcanza ALTO solo con impedimentos), CEL-B ROJO, CEL-C `color: null`, `estado: indisponible` (no VERDE) |
| E6-B02-T11 | api | #1 | QE2; LID3 con CEL-D sin HDU (`seed:e6`, D208) | `GET semaforo` | CEL-A (solo cerrada): VERDE con `hduActivas: 0`. CEL-D: `color: null`, `estado: SIN_HDU` |
| E6-B02-T12 | api | #2 | ANA1 supervisada por QE1 (umbral 1); H4 reasignada a ANA1 por ADM1; QE2 con umbral 5 (D190) | Ambos consultan `carga`; LID1 consulta | QE1: ANA1 `activas` 3, `sobrecargado: true`. QE2: ANA1 `activas` 1, `supervisadoPorMi: false`, `sobrecargado: false`. LID1: una fila de ANA1 en el grupo de QE1, `activas` 2 (H4 es de CEL-C), umbral 1, `sobrecargado: true` |
| E6-B02-T13 | api | #2 | Analista desactivado con una HDU activa; ANA4 | `GET carga` como AUD1 | El desactivado con `inactivo: true` y su HDU contada; ANA4 sin QE supervisor (umbral 5). **Base pura:** ANA4 con ceros y solo los grupos de QE1, QE2 y «Sin QE supervisor». **Base compartida:** hay además los grupos y analistas de la semilla MVP; las activas de cada fila igualan el conteo de HDU no cerradas de ese analista en la base, y las filas de ANA1, ANA2 y ANA3 dan los valores del fixture |

### E6-B03 · Administrador

Quiero que el sistema genere un snapshot diario de indicadores. Para disponer de tendencia histórica.

| # | Criterio | Contexto | Evento | Resultado esperado |
| --- | --- | --- | --- | --- |
| 1 | Generación programada | Llega la hora configurada (o el Administrador la dispara). | Se ejecuta la tarea. | Se guarda un snapshot por fecha, célula, sprint y ámbito (D162) y la ejecución queda registrada. |
| 2 | Idempotencia | La tarea se ejecuta dos veces el mismo día. | Se ejecuta. | No se duplica el snapshot: queda una sola fila por clave, con el estado de la última ejecución. |
| 3 | Consulta | Se solicita la serie histórica. | Se procesa. | Se devuelve ordenada por fecha ascendente, solo con el ámbito del usuario. |

Reglas de negocio:
- Ver D162–D167, D172 y las secciones 3.6 y 5. Fecha de calendario de Santiago. El cron usa `GET /v1/cron/indicadores/snapshot` con `CRON_SECRET`; con una sesión de usuario, la ruta responde 401.
- Las filas guardan `suma_avance` y conteos, no solo el promedio, para poder sumar células (D167).
- Todo o nada y concurrencia: D164. Mientras una ejecución corre, otra recibe 409 `EJECUCION_EN_CURSO`.
- Tendencia: `GET /v1/indicadores/tendencia` devuelve por serie (`celula`, `sprint`) los puntos `{fecha, cumplimiento, hduTotal}` ascendentes; sin filas, `sinDatos: true`.
- El Administrador consulta ejecuciones, no series (403 en tendencia).

Casos de prueba:

| ID | Tipo | Escenario | Datos | Pasos | Resultado esperado |
| --- | --- | --- | --- | --- | --- |
| E6-B03-T01 | api | #1 | `CRON_SECRET` de prueba | `GET /v1/cron/indicadores/snapshot` con el secreto | 200; ejecución `EXITOSA`, origen `CRON`, actor `SISTEMA`, filas escritas mayor que 0 y fecha = hoy en Santiago |
| E6-B03-T02 | api | #1 negativo | — | Misma ruta sin cabecera, con un secreto incorrecto y con la sesión de ADM1 | 401 `NO_AUTENTICADO` en los tres; no se crea ninguna ejecución |
| E6-B03-T03 | api | #1 | Estado base | Genera el snapshot | Fila (CEL-A, SP-PROX, ámbito QE1): hdu_total 1, suma_avance 30, cumplimiento 30.0, bloqueadas 1; la fila `TODOS` del mismo par tiene los mismos valores; en cada par, hdu_total = certificadas + cerradas_excepcion + en_curso + sin_iniciar; la suma de `hdu_total` de las filas `TODOS` iguala las HDU con sprint vigente |
| E6-B03-T04 | api | #2 | Estado base | Ejecuta el snapshot dos veces el mismo día | El número de filas es el mismo tras la segunda; la segunda ejecución informa filas actualizadas; una inserción directa con la misma clave viola la restricción única |
| E6-B03-T05 | api | #2 | H1 de 30 a 40 % entre dos ejecuciones | Ejecuta, aprueba el entregable 4 de H1, ejecuta | Una sola fila por clave y la de H1 ahora con suma_avance 40 y cumplimiento 40.0 |
| E6-B03-T06 | api | #2 | — | Dos `POST` manuales simultáneos | Una respuesta 200 y otra 409 `EJECUCION_EN_CURSO`; una sola ejecución `EXITOSA` |
| E6-B03-T07 | api | #1 | ADM1; QE1, LID1, AUD1, ANA1 | `POST /v1/indicadores/snapshots` | ADM1: 200, origen `MANUAL`, actor ADM1. Los demás: 403 `ACCESO_DENEGADO` |
| E6-B03-T08 | api | #1 negativo | Impedimentos detenido | Dispara el snapshot; repone el servicio y lo dispara de nuevo | Primero: ejecución `FALLIDA` con motivo `IMPEDIMENTOS_NO_DISPONIBLE` y 0 filas escritas (el conteo total no cambia). Luego: `EXITOSA` |
| E6-B03-T09 | api | #3 | Snapshots de tres días | `GET tendencia` como QE1 con CEL-A y SP-PROX | Una serie con 3 puntos en orden ascendente de fecha: 30.0, 30.0, 40.0 |
| E6-B03-T10 | api | #3 | Los mismos snapshots | QE2 consulta la misma serie; AUD1 también | QE2: `sinDatos: true` (H1 no está en su ámbito). AUD1: la serie completa (ámbito `TODOS`) |
| E6-B03-T11 | api | #3 negativo | ADM1; ANA1 | `GET tendencia`; ADM1 además `GET snapshots/ejecuciones` | 403 en tendencia para ambos; ADM1 ve las ejecuciones (fecha, origen, resultado, filas) sin cifras de indicadores |
| E6-B03-T12 | api | #1 | `Q360_FECHA_REFERENCIA` = 2026-07-01T02:30:00Z (invierno, 22:30 del 30 de junio en Santiago) | Genera el snapshot | `fecha` = 2026-06-30 |
| E6-B03-T13 | api | #3 | H1 cambia de sprint después del snapshot | Mueve H1 de SP-PROX a SP-LEJ y genera otro | Las filas anteriores no cambian; hay una fila nueva (CEL-A, SP-LEJ) y la serie de SP-PROX termina en el día anterior |
| E6-B03-T14 | unit | #1 | `vercel.json` | Lee la configuración | Una tarea programada con `GET /v1/cron/indicadores/snapshot` y `0 6 * * *`, compatible con el plan Hobby (una vez al día) |

### E6-B04 · Quality Engineer (QE)

Quiero que el sistema exporte los indicadores del dashboard. Para compartir reportes con la célula.

| # | Criterio | Contexto | Evento | Resultado esperado |
| --- | --- | --- | --- | --- |
| 1 | Exportación CSV | Se solicita CSV de una vista. | Se procesa. | Se genera con los indicadores filtrados, un encabezado y la fecha. |
| 2 | Exportación PDF | Se solicita PDF de una vista. | Se procesa. | Se genera con encabezado, filtros aplicados y fecha. |
| 3 | Ámbito | Un QE (o Líder) exporta. | Se procesa. | Solo incluye datos de su ámbito. |

Reglas de negocio:
- Ver D168 y D169. Vistas: `cumplimiento` (una fila por indicador), `semaforo` (una fila por HDU no cerrada del ámbito, con su célula, el color de la célula y sus motivos, vacíos si no genera color; y una fila por célula sin HDU no cerradas; precisado por D186 para que E6-B04-T04 incluya CEL-C, que es verde), `carga` (una fila por analista) y `tendencia` (una fila por fecha y serie).
- CSV: UTF-8 con BOM, separador `;` (igual que E7, D48; decisión del usuario 2026-11-04), fin de línea CRLF, RFC 4180. Primero un bloque de encabezado de dos columnas (`Reporte`, `Vista`, `Filtros`, `Rol y ámbito`, `Generado (hora de Chile)`), una línea en blanco y la tabla. Las celdas de texto que empiezan con `=`, `+`, `-`, `@`, tabulación o retorno de carro se prefijan con `'` (D122), incluido el bloque de encabezado y los nombres de analista y los títulos de HDU; los números y las fechas ISO no.
- PDF: título «Quality360 · Indicadores», vista, filtros, rol y ámbito, fecha y hora de Chile, la tabla (con el semáforo escrito en texto) y el pie con el número de página.
- Sin datos para los filtros: 200 con el archivo y el texto «Sin datos para los filtros aplicados» (nunca cifras de relleno).
- El registro de la exportación en Organización (actor, vista, formato, filtros, cantidad de filas) va antes de entregar. Falla: 503 y sin archivo.

Casos de prueba:

| ID | Tipo | Escenario | Datos | Pasos | Resultado esperado |
| --- | --- | --- | --- | --- | --- |
| E6-B04-T01 | api | #1 | QE1 | `exportacion?vista=cumplimiento&formato=csv&celulaId=CEL-A` | 200 `text/csv`; el encabezado incluye «Filtros: Célula CEL-A» y la fecha; los valores coinciden con `GET cumplimiento` (totales 3, cumplimiento 13.3) |
| E6-B04-T02 | api | #1 | Título de HDU y nombre de analista que empiezan con `=`, `+`, `-`, `@`, tabulación y retorno de carro (datos de prueba) | Exporta `semaforo` y `carga` en CSV | Cada celda de texto con esos inicios lleva el prefijo `'`; los números (incluso negativos) y las fechas ISO no; el texto del filtro también |
| E6-B04-T03 | api | #2 | QE1 | `exportacion?vista=semaforo&formato=pdf` | 200 `application/pdf` que empieza con `%PDF`; el texto extraído contiene «Quality360 · Indicadores», los filtros, el rol y la fecha en hora de Chile, y «Rojo» escrito en las filas |
| E6-B04-T04 | api | #3 | QE2; QE1; LID1; AUD1 | Exportan `semaforo` en CSV | QE2: solo H3 y los de su ámbito, sin H1 ni H6. QE1: sin H3. LID1: sin H4 ni H8. AUD1: HDU de las tres células. **Base pura:** solo esas filas. **Base compartida:** también las filas de la semilla MVP, una por HDU no cerrada de la base más una por célula sin HDU no cerradas (D186); las filas de CEL-A, CEL-B y CEL-C son las del fixture |
| E6-B04-T05 | api | #1 negativo | Impedimentos detenido | Exporta `semaforo` | 503 `INDICADORES_NO_DISPONIBLES`; sin archivo |
| E6-B04-T06 | api | #1 | QE1 | Exporta `carga` en CSV | Una entrada `EXPORTAR` en la auditoría de Organización con actor QE1, vista `carga`, formato y filtros y cantidad de filas; aparece antes de la respuesta |
| E6-B04-T07 | api | #1 negativo | Auditoría de Organización detenida | Exporta | 503 `SERVICIO_NO_DISPONIBLE` y sin archivo |
| E6-B04-T08 | api | #1 negativo | `EXPORTACION_LIMITE_FILAS` y `EXPORTACION_PDF_LIMITE_FILAS` bajos en la prueba | Exporta en ambos formatos con más filas que el tope | 422 `EXPORTACION_EXCEDE_LIMITE` con «Acota los filtros» (CSV) y «Usa CSV» (PDF) |
| E6-B04-T09 | api | #1 negativo | ANA1, ADM1; sin sesión | Exportan | 403 `ACCESO_DENEGADO` los dos primeros; 401 el tercero |
| E6-B04-T10 | api | #1 negativo | QE1 | `vista=otra`; `formato=xls`; `celulaId=abc` | 400 `VALIDACION` con `campo` en cada caso |
| E6-B04-T11 | api | #2 | QE1 con filtros CEL-C y SP-PROX de CEL-A (el sprint de otra célula) | Exporta `cumplimiento` en CSV y PDF | 200 en ambos; el archivo trae el encabezado y «Sin datos para los filtros aplicados», sin filas de cifras ni «0 %» |
| E6-B04-T12 | api | #1 | QE1 | Exporta `tendencia` en CSV con 3 snapshots | Tres filas por fecha en orden ascendente (30.0, 30.0, 40.0), iguales a `GET tendencia`; un día sin snapshot no genera fila |

### E6-B05 · Quality Engineer (QE) — nueva

Quiero que el sistema permita cerrar una HDU con entregables sin aprobar cuando el QE responsable lo justifica. Para que el cierre refleje la decisión del QE sin falsear el cumplimiento.

| # | Criterio | Contexto | Evento | Resultado esperado |
| --- | --- | --- | --- | --- |
| 1 | Cierre con excepción | La HDU está en `PENDIENTE_CIERRE` con menos de 10 aprobados, sin impedimentos abiertos, y quien solicita es el QE responsable. | Solicita el estado `CERRADA` con `justificacion` válida. | La HDU pasa a `CERRADA`; se guarda el registro (aprobados, pendientes, justificación, actor, fecha) y la HDU queda marcada `cierreParcial`. |
| 2 | Reglas | Falta la justificación, es inválida, hay impedimentos abiertos, quien solicita no es el QE responsable o la fuente no responde. | Solicita el cierre. | Se rechaza con el código que corresponde (D173) y la HDU no cambia. |
| 3 | Registro y consecuencias | Se cerró con excepción. | Se consulta la HDU, el certificado, la auditoría o los indicadores. | Hay una entrada `CERRAR_HDU_PARCIAL` en la auditoría, el detalle trae el bloque `cierre`, no existe certificado ni se puede emitir, y los indicadores la cuentan como cerrada con excepción con su avance real. |

Reglas de negocio:
- Ver D173–D175. La operación es la de cambio de estado de E2-B02, con el campo opcional `justificacion`. Códigos: sin justificación y checklist incompleto, 409 `CHECKLIST_INCOMPLETO` (sin cambio, con `puedeCerrarConExcepcion: true` para el QE responsable); justificación en blanco, 422 `JUSTIFICACION_REQUERIDA`; largo fuera de 20–500, 400 `VALIDACION` con `campo: justificacion`; impedimentos abiertos o escalados, 409 `HDU_BLOQUEADA` (hasta 20); Certificaciones caída, 409 `CHECKLIST_NO_DISPONIBLE` (como el cierre certificado de E2-B02, D192); relación que no es QE responsable, 403 `ACCESO_DENEGADO`; estado de origen distinto de `PENDIENTE_CIERRE`, 409 `TRANSICION_INVALIDA`.
- El cierre, el registro `cierre_hdu`, la marca y la auditoría se escriben en la misma transacción de Organización. Dos cierres simultáneos: uno 200 y el otro 409 `TRANSICION_INVALIDA`.
- Una justificación enviada con 10 aprobados se ignora y no se guarda.
- Una HDU cerrada con excepción sigue la regla de toda `CERRADA`: no admite marcar entregables, impedimentos nuevos (409 `HDU_CERRADA`) ni reapertura.

Casos de prueba:

| ID | Tipo | Escenario | Datos | Pasos | Resultado esperado |
| --- | --- | --- | --- | --- | --- |
| E6-B05-T01 | api | #1 | QE1, H2 en `PENDIENTE_CIERRE` (1 aprobado) | Cambia a `CERRADA` con una justificación de 40 caracteres | 200: estado `CERRADA`, `cierreParcial` true; `cierre` con aprobados 1, 9 pendientes, justificación, actor QE1 y fecha |
| E6-B05-T02 | api | #1 negativo | QE1, H2 en `PENDIENTE_CIERRE` | Cierra sin `justificacion`; con `"   "`; con 19 y con 501 caracteres | 409 `CHECKLIST_INCOMPLETO` con `puedeCerrarConExcepcion: true`; 422 `JUSTIFICACION_REQUERIDA`; 400 `VALIDACION` (`campo: justificacion`) en los dos últimos; la HDU sigue en `PENDIENTE_CIERRE` |
| E6-B05-T03 | api | #1 | QE1, H5 en `PENDIENTE_CIERRE` | Cierra con una justificación de exactamente 20 caracteres | 200 (límite inferior). Con exactamente 500, 200 en otra HDU de prueba |
| E6-B05-T04 | api | #2 negativo | QE2 (no responsable), el QE que solo supervisa al analista, ANA2, LID1, ADM1, AUD1 | Cierran H2 con justificación válida | 403 `ACCESO_DENEGADO` en todos; la HDU no cambia |
| E6-B05-T05 | api | #2 negativo | QE1, H1 en `PENDIENTE_CIERRE` con I2 abierto | Cierra con justificación válida; luego resuelve I2 y repite | Primero 409 `HDU_BLOQUEADA` con I2 en el cuerpo y sin registro; después 200 con cierre con excepción |
| E6-B05-T06 | api | #2 negativo | QE1 | (a) H1 en `EN_EJECUCION` con justificación válida; (b) H2 en `PENDIENTE_CIERRE` con Certificaciones detenido y justificación válida; (c) H1 en `PENDIENTE_CIERRE` con I2 abierto y sin justificación | (a) 409 `TRANSICION_INVALIDA` antes de mirar la justificación; (b) 409 `CHECKLIST_NO_DISPONIBLE` con `checklist.estado: indisponible` (D192); (c) 409 `CHECKLIST_INCOMPLETO`, no `HDU_BLOQUEADA` (el orden es transición, checklist, justificación, impedimentos) |
| E6-B05-T07 | api | #3 | QE1 tras T01 | Pide el certificado de H2 y trata de generarlo | No existe certificado; la generación se rechaza (409) sin crear ninguno; el certificado de H8 no cambia |
| E6-B05-T08 | api | #3 | QE1 tras T01; ADM1; AUD1 | ADM1 lee `GET /v1/auditoria?entidad=HDU&entidadId=<H2>`; AUD1 lee `GET /v1/hdu/<H2>` y su historial (D192) | Entrada `CERRAR_HDU_PARCIAL` con actor, HDU, aprobados 1 y justificación; el detalle trae el bloque `cierre`; el listado de HDU marca `cierreParcial`; un `UPDATE` o `DELETE` sobre `cierre_hdu` con el rol del servicio falla |
| E6-B05-T09 | api | #1 | QE1, H8 (10 aprobados) | Cierra con y sin `justificacion` en dos pruebas de la misma semilla | 200 en ambas, `cierreParcial` false, sin registro en `cierre_hdu` y sin entrada `CERRAR_HDU_PARCIAL` (la justificación se ignora) |
| E6-B05-T10 | api | #3 | QE1 tras T01 | Marca un entregable, registra un impedimento y trata de reabrir H2 | 409 en las tres operaciones (`HDU_CERRADA` y `TRANSICION_INVALIDA`); H2 no cambia |
| E6-B05-T11 | api | #1 | QE1, H2 | Dos cierres simultáneos con justificación | Uno 200 y el otro 409 `TRANSICION_INVALIDA`; un solo registro en `cierre_hdu` |
| E6-B05-T12 | api | regresión | QE1, QE2 | Ejecuta las pruebas certificadas de `e3-acceso-y-cierre.test.ts`, `e4-impedimentos-organizacion.test.ts` (E4-B02) y E2-B02 | Pasan sin cambios (ninguna envía justificación) |

## 12. Totales y trazabilidad

| HDU | Escenarios | Casos de prueba | Servicio / dueño |
| --- | --- | --- | --- |
| E6-F01 | 3 | 12 | Portal (`q360-frontend`) |
| E6-F02 | 3 | 12 | Portal |
| E6-F03 | 3 | 12 | Portal |
| E6-F04 | 3 | 9 | Portal |
| E6-F05 (nueva) | 3 | 10 | Portal |
| E6-B01 | 3 | 11 | Indicadores (`q360-backend`) |
| E6-B02 | 3 | 13 | Indicadores |
| E6-B03 | 3 | 14 | Indicadores, con la tarea programada |
| E6-B04 | 3 | 12 | Indicadores, Organización para el registro de exportaciones |
| E6-B05 (nueva) | 3 | 12 | Organización (`q360-backend`), con Certificaciones e Impedimentos |
| **Total** | **30** | **117** | |

Regresión de HDU certificadas dentro del total: E6-F01-T11, E6-F05-T10 y E6-B05-T12. Negativos de acceso por rol: E6-F01-T10, E6-F02-T12, E6-F03-T12, E6-F04-T09, E6-F05-T06, E6-B01-T03, E6-B02-T04 y T08, E6-B03-T02, T07 y T11, E6-B04-T09, E6-B05-T04.

| Capacidad | Frontend | Backend |
| --- | --- | --- |
| Cumplimiento y filtros | E6-F01 | E6-B01 |
| Semáforo y drill-down | E6-F02 | E6-B02 |
| Carga y umbral | E6-F03 | E6-B02 |
| Snapshot y tendencia | E6-F04 | E6-B03 |
| Exportación | E6-F04 | E6-B04 |
| Cierre con excepción | E6-F05 | E6-B05 |

Trabajo adicional fuera de las 10 HDU, que los agentes deben contemplar: contrato `indicadores.v1.yaml` y cambios aditivos en `organizacion.v1.yaml` (`q360-arquitecto`); migración de Organización con `cierre_hdu`, la marca `cierreParcial`, el campo `justificacion` y la entrada de auditoría `CERRAR_HDU_PARCIAL` (`q360-backend`); reescritura del enunciado de E2-B02#3 en `historias-quality360.md` y de la descripción de D11 en `decisiones-mvp.md` (que `q360-analista` actualiza al aprobarse esta épica); servicio, migración, rol `svc_indicadores` y semilla de la sección 8 (`q360-backend`, `q360-integraciones`); consultas internas de Organización por ámbito y registro de la exportación; rutas del gateway y regla del cron con `CRON_SECRET` (`q360-seguridad-gateway`); `vercel.json` con la tarea diaria; menús y rutas nuevas del portal (sección 7). Certificación: `q360-qa` emite el dictamen en `docs/validacion/certificacion-e6.md`, con el ID del escenario en el nombre de cada prueba (`[E6-F03#2]`), la regresión de la sección 7 y axe sobre las pantallas nuevas.

## 13. Preguntas abiertas

Resueltas por el usuario el 2026-11-04 (ya incorporadas): ámbito amplio del QE (D153), el Líder QA exporta (D168) y el Líder ve la tendencia anterior a su asignación (D167). La pregunta sobre las HDU cerradas en el promedio se resolvió con una regla nueva: cuentan con su avance real y el cierre con excepción es una categoría propia (D155, D156, D173–D175).

Confirmadas por el usuario el 2026-11-04 (ya no quedan preguntas abiertas):

1. **Categoría propia para el cierre con excepción (D155).** Se propone «Cerradas con excepción» separada de «Certificadas», para que el dashboard no muestre como certificado lo que no tiene los 10 entregables. Alternativa: contarlas como certificadas con una marca, lo que sube la cifra de certificadas y la hace menos fiable ante un auditor. **Recomendación:** categoría propia, como está escrito.
2. **Reapertura (D173).** Una HDU cerrada con excepción no se puede reabrir, porque `CERRADA` es terminal (D10). Si el equipo retoma el trabajo habría que crear una HDU nueva. **Recomendación:** mantenerlo así en esta ronda; reabrir exigiría una transición nueva, su justificación y revisar el cálculo de avance y de los snapshots ya guardados.
