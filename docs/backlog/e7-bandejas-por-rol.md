# Épica 7 · Bandejas por rol

Fecha: 2026-10-21. Formato igual al de `historias-quality360.md` (F = frontend, B = backend; escenarios Contexto → Evento → Resultado esperado). Las decisiones siguen la numeración de `docs/arquitectura/decisiones-mvp.md` (última usada: D27).

Alcance de esta ronda: diseño, HDU, construcción y certificación.

> **Revisión de arquitectura (2026-10-21).** D28–D40 se mantienen; las decisiones D41–D53, los contratos finales y la resolución de los conflictos del diseño están en `docs/arquitectura/decisiones-mvp.md` (sección «Corrida E7»), y el reparto en `docs/arquitectura/e7-plan-construccion.md`. Correcciones de D50 aplicadas en este archivo: rol fuera del catálogo → 400; `operacion=CAMBIAR_ROL`; fuente caída → 503 `SERVICIO_NO_DISPONIBLE`; parámetros con los nombres del contrato (D49). Esta épica **no** incluye los dashboards de E6, los impedimentos de E4 ni la integración con Jira de E5.

## 1. Resumen

- **Qué se pide:** cada usuario entra, según su rol, a una bandeja con lo que le toca ver o hacer. El Administrador asigna los roles.
- **Roles (5, uno por usuario):** Analista QA, QE, Líder QA (nuevo), Administrador, Auditor (nuevo).
- **Conjunto de esta ronda:** 11 HDU nuevas (7 de frontend, 4 de backend), 33 escenarios y 100 casos de prueba.
- **HDU existentes que se modifican:** 12, sin romper ningún escenario certificado (sección 4).

### Decisiones de esta épica

| ID | Decisión | Motivo |
| --- | --- | --- |
| D28 | Hay 5 roles y cada usuario tiene uno solo. El catálogo `organizacion.rol` pasa de 3 a 5 filas (`LIDER_QA`, `AUDITOR`; los 3 códigos actuales no cambian). | Decisión del usuario. |
| D29 | **La bandeja es la pantalla de inicio de cada portal**, no una ruta nueva. Se conservan `/qa`, `/qe` y `/admin`, y se agregan `/lider` y `/auditor`. La primera opción del menú se llama «Bandeja». | Cero cambio de rutas certificadas; los resúmenes de E1-F03, F06 y F08 siguen y se amplían. |
| D30 | Un Líder QA recibe células mediante la tabla `organizacion.celula_lider` (`id_usuario`, `id_celula`, `fecha_desde`, `fecha_hasta`, `asignado_por`). La asignación vigente es la que no tiene `fecha_hasta`. Un líder puede tener varias células y una célula varios líderes. Una célula sin líder es válida. | Decisión del usuario (dueño de células); conserva historial como la supervisión (E1-B09). |
| D31 | Para cambiar el rol de un Líder QA con células vigentes hay que quitarle antes las células. Se rechaza con 409 `RELACIONES_INCOMPATIBLES`, igual que E1-B08#3. | Coherencia con la regla ya certificada. |
| D32 | Líder QA y Auditor son **solo lectura**. Cualquier operación que modifique datos, con su sesión, responde 403 `ACCESO_DENEGADO` (D12). Se agregan dos relaciones al acceso interno de HDU (extiende D18): `LECTOR_CELULA` (Líder, solo en sus células vigentes) y `LECTOR_AUDITORIA` (Auditor, todas). Ambas permiten ver, nunca marcar, aprobar ni certificar. | Decisión del usuario; se aplica «denegar por defecto» a las escrituras. |
| D33 | Cada bandeja tiene su propio endpoint y exige su rol: `GET /v1/bandeja/{analista, qe, lider, admin, auditor}`. Cualquier otro rol recibe 403, **incluido el Administrador**. La bandeja es personal; el Administrador ve el sistema completo en la suya. | Hace verificable el «acceso denegado» de bandeja ajena. |
| D34 | Fuente caída no es cero (regla no negociable 4). Cada contador y cada lista de la bandeja trae `estado: ok \| indisponible`. Si Certificaciones no responde, solo se marcan indisponibles los bloques que dependen de ella. | Informe pp. 8-9. |
| D35 | Solo el Auditor exporta. Formato CSV, con los filtros aplicados, máximo 50.000 filas (si hay más: 422 `EXPORTACION_EXCEDE_LIMITE` con el mensaje «Acota los filtros»). Cada exportación queda en la auditoría (actor, recurso, filtros, cantidad de filas). | Decisión del usuario («filtrar y exportar»); la exportación de E6 queda para después. |
| D36 | Los impedimentos (E4) no aparecen en ninguna bandeja de esta ronda, ni siquiera con un contador en cero. Cuando exista E4, se agrega un bloque nuevo. | No mostrar cifras de módulos inexistentes (E1-F06#3). |
| D37 | El Líder QA no exporta ni tiene semáforo en esta ronda. Eso lo trae E6. | Alcance mínimo. |
| D38 | Las pantallas de bitácora y auditoría de usuarios son solo del Auditor. El Administrador no las abre en esta ronda (conserva la lista de «últimos cambios» en su bandeja). | Separa operar de auditar. |
| D39 | El detalle de HDU (`/hdu/:id`) sigue siendo una sola pantalla compartida. Para Líder y Auditor se muestra sin botones de acción (no solo deshabilitados): no hay marcar, aprobar, rechazar, cambiar estado, asignar, ni generar certificado. Sí hay descargar evidencia y certificado. | D32; evita acciones que siempre fallarían. |
| D40 | Cambiar el rol de un usuario exige además resolver relaciones de trabajo abiertas: un analista con supervisión vigente o HDU no cerradas asignadas, y un QE con analistas o HDU no cerradas como responsable. Se rechaza con 409 `RELACIONES_INCOMPATIBLES`. | Amplía E1-B08#3 para que un cambio de rol no deje HDU huérfanas. Backend debe confirmar qué parte ya existe. |

## 2. Mapa de cobertura: qué existe y qué falta

| Bandeja / necesidad | HDU existentes que la tocan | Qué falta | HDU nueva |
| --- | --- | --- | --- |
| Ingreso por rol (redirección, menú, acceso denegado) | E1-F02, F05, F07 (1 rol cada una); E1-B02 (ámbito) | Líder y Auditor; matriz completa de acceso cruzado | E7-F01 |
| Bandeja del Analista | E1-F06 (supervisor y conteo), E2-F03 (mis HDU) | Qué me falta hacer: observaciones del QE, esperando aprobación, siguiente entregable | E7-F02, E7-B03 |
| Bandeja del QE | E1-F03 (resumen), E3-F03#3 (bandeja de aprobaciones) | Una vista de «lo que requiere mi acción» (aprobar, asignar, certificar, cerrar) | E7-F03, E7-B03 |
| Bandeja del Líder QA | Nada | Todo: rol, células, ámbito, bandeja | E7-F04, E7-B01, E7-B02, E7-B03 |
| Bandeja del Administrador | E1-F08 (accesos), E1-F09 y E1-B06 (usuarios) | Pendientes de configuración y gestión del rol Líder con sus células | E7-F05, E7-F07, E7-B01, E7-B03 |
| Bandeja del Auditor | E3-B04 (bitácora por HDU), E1-B12 (auditoría, sin pantalla) | Rol, lectura global, bitácora y auditoría global, certificados, exportación | E7-F06, E7-B02, E7-B03, E7-B04 |
| Dashboards (cumplimiento, semáforo, carga) | E6-F01..F04, E6-B01..B04 | Siguen en E6; ninguna se absorbe. Las bandejas son listas de trabajo, no indicadores | — |

Dependencias de construcción: B01 → F07; B02 → F04 y F06; B03 → F02 a F06; B04 → F06; F01 va con B03 (usa `/v1/me`).

## 3. Fixture de datos de prueba (compartido por todos los casos)

Lo carga la semilla de pruebas (`infrastructure/seed`, dueño `q360-integraciones`) y usa las mismas credenciales de demo locales.

| Elemento | Detalle |
| --- | --- |
| Células | CEL-A, CEL-B, CEL-C |
| Usuarios | ADM1 (Admin); QE1 (supervisa ANA1 y ANA2); QE2 (supervisa ANA3); ANA1, ANA2, ANA3; ANA4 (sin QE); LID1 (Líder: CEL-A y CEL-B); LID2 (Líder sin células); AUD1 (Auditor); INACT1 (QE desactivado) |
| H1 | CEL-A, QE1, ANA1, EN_EJECUCION. Entregables 1–3 aprobados, el 4 en POR_APROBAR |
| H2 | CEL-A, QE1, ANA2, EN_EJECUCION. Entregable 2 rechazado con observación «Falta evidencia de datos» (PENDIENTE) |
| H3 | CEL-B, QE2, ANA3, PENDIENTE |
| H4 | CEL-C, QE2, ANA3, DISENO_PRUEBAS |
| H5 | CEL-A, QE1, sin analista, PENDIENTE |
| H6 | CEL-B, QE1, ANA1, EN_EJECUCION. Entregables 1–8 aprobados (lista para certificar) |
| H7 | CEL-A, QE2, ANA3, CERRADA. 10 aprobados, certificado con folio F7 y una evidencia en archivo |
| H8 | CEL-C, QE1, ANA2, PENDIENTE_CIERRE. 10 aprobados, certificado con folio F8, sin cerrar |

Valores esperados que usan los casos:

| Rol / usuario | Abiertas | Otros contadores |
| --- | --- | --- |
| ANA1 | 2 (H1, H6) | con observaciones 0; esperando aprobación 1 |
| ANA2 | 2 (H2, H8) | con observaciones 1; esperando aprobación 0 |
| ANA4 | 0 | todo en 0 (sin HDU) |
| QE1 (responsable de H1, H2, H5, H6, H8) | — | por aprobar 1 entregable en 1 HDU; sin analista 1; listas para certificar 1 (H6); listas para cerrar 1 (H8) |
| QE2 (responsable de H3, H4, H7) | — | por aprobar 0; sin analista 0; listas para certificar 0; listas para cerrar 0 |
| LID1 (ve H1, H2, H3, H5, H6, H7) | 5 | cerradas 1 (H7); sin analista 1 (H5); certificados visibles 1 (F7) |
| LID2 | 0 | células a cargo 0 |
| AUD1 (ve las 8) | 7 | certificados 2 (F7, F8) |
| ADM1 | — | Ver la nota siguiente |

Nota sobre ADM1: INACT1 es un QE desactivado, así que los activos son ADM1, QE1, QE2, ANA1–ANA4, LID1, LID2 y AUD1 = **10**; por rol: Administrador 1, QE 2, Analista QA 4, Líder QA 2, Auditor 1. Inactivos: 1. Analistas sin QE: 1 (ANA4). QE sin analistas: 0. Líderes sin células: 1 (LID2). Células sin líder: 1 (CEL-C). HDU totales: 8.

## 4. HDU existentes que se modifican

Regla: ningún escenario certificado cambia de resultado esperado para los roles ya existentes. Las modificaciones **agregan** roles o contenido. Las pruebas ya certificadas se vuelven a ejecutar como regresión y deben seguir pasando.

| HDU existente | Modificación | Efecto sobre HDU certificada |
| --- | --- | --- |
| E1-F02#2, E1-F05#3, E1-F07 | «Ruta de otro rol» ahora incluye las rutas `/lider` y `/auditor` (acceso denegado). | **Sí en pruebas (D41).** El escenario admite «acceso denegado o redirección» y se sigue cumpliendo, pero hoy el portal redirige y las pruebas afirman la URL del propio portal; pasan a afirmar la pantalla de acceso denegado en la URL pedida. Lista en `decisiones-mvp.md` (Corrida E7). |
| E1-F02#3, E1-F05#2 (menús) | Primera opción «Bandeja». Las demás opciones no cambian. | **Sí, texto del menú.** Las pruebas que buscan el primer ítem del menú por texto deben actualizarse al nuevo nombre. El resto de las opciones y rutas queda igual. |
| E1-F03#1–#3, E1-F06#1–#3, E1-F08#1–#3 | El panel de inicio pasa a ser la bandeja. Se conservan íntegros los resúmenes (analistas e HDU supervisadas; supervisor y conteo; accesos administrativos) y se agregan los bloques nuevos debajo. | Ninguno, siempre que se mantengan los `data-testid` y textos ya certificados. Si cambia el diseño, se conserva el selector. |
| E1-F09#1–#3 y E1-B08#1 | El selector de rol muestra 5 roles; E1-B08#1 («solo roles definidos») usa el catálogo ampliado. | **Sí en datos de prueba:** hoy un código distinto de los 3 roles es inválido; `LIDER_QA` y `AUDITOR` pasan a válidos. Una prueba que use uno de esos códigos como «rol inválido» debe cambiar de dato (usar `SUPERVISOR`). |
| E1-B08#3 | Se amplía con D31 y D40 (más relaciones incompatibles). | **Sí, más estricto.** Cambios de rol que antes pasaban (analista con HDU abiertas) ahora dan 409. Revisar los datos de las pruebas de cambio de rol y de la semilla. |
| E1-B02#2–#3, E2-B03 | El ámbito de lectura agrega: Líder QA = HDU de sus células vigentes; Auditor = todas. | Ninguno para Analista, QE y Administrador. |
| E1-B06#1 | «Solo acceso administrativo» sigue; ahora Líder y Auditor también reciben el rechazo. | Ninguno. |
| E1-F11 | El perfil muestra los nombres «Líder QA» y «Auditor». | Ninguno. |
| E2-F04#2–#3, E3-F01#3 | El detalle y el checklist se abren en solo lectura para Líder y Auditor (D39). «HDU sin acceso» sigue siendo 403 para el Líder en células ajenas. | Ninguno. |
| E3-F03#3 (bandeja de aprobaciones del QE) | No cambia. Se enlaza desde la bandeja del QE. | Ninguno. |
| D18 (permisos por relación) | Dos relaciones nuevas de solo lectura (D32). | Ninguno para las 4 relaciones vigentes. |

Contratos (`contracts/`, dueño `q360-arquitecto`): se agregan los 5 endpoints de bandeja, los 3 de consulta del auditor, la exportación, la asignación de células y el filtro `celulaId` en `GET /v1/hdu`.

## 5. Convenciones comunes de pantalla

- **Estados de cada bloque (D34):** cargando (esqueleto), vacío (mensaje propio, con 0 o lista vacía), error de consulta (mensaje + «Reintentar»), indisponible (la fuente no responde: el contador muestra «No disponible» y el resto de la bandeja sigue funcionando). Los cuatro estados se distinguen visualmente y por texto.
- **Identificadores de prueba:** `data-testid="bandeja-<rol>"` para la pantalla (`analista`, `qe`, `lider`, `admin`, `auditor`), `contador-<clave>` para cada contador, `lista-<clave>` para cada tabla, `estado-vacio-<clave>`, `estado-error-<clave>` y `estado-indisponible-<clave>`.
- **Tablas:** paginación del servidor de 25 filas (máximo 100), orden por columna, búsqueda por código o título, filtros que se conservan en la URL (`?estado=…&celula=…`) para poder compartir o volver atrás.
- **Acceso denegado:** pantalla «No tienes acceso a esta sección» con el botón «Ir a mi bandeja». No muestra datos ni revela si el recurso existe.
- **Etiquetas de estado de HDU:** las ya usadas por el portal (Pendiente, Diseño de pruebas, En ejecución, Pendiente de cierre, Cerrada).
- **Avance:** `aprobados/10` y porcentaje (D16).

## 6. Contenido de cada bandeja

### 6.1 Analista QA · `/qa`

| Elemento | Detalle |
| --- | --- |
| Encabezado | Nombre, QE supervisor vigente (o «Sin supervisor asignado») — se conserva E1-F06 |
| Contadores | `abiertas` (mis HDU no cerradas) · `con-observaciones` (entregables rechazados sin corregir) · `esperando-aprobacion` (entregables en POR_APROBAR) |
| Lista principal «Mis HDU» | Código · Título · Célula · Sprint · Prioridad · Estado · Avance (n/10 y %) · Siguiente entregable (el primero no aprobado) · Observaciones (insignia si tiene) · Actualizada |
| Orden por defecto | Con observaciones primero, luego prioridad (alta a baja), luego sprint |
| Filtros | Estado · Célula · Sprint · «Solo con observaciones» · búsqueda por código o título |
| Acciones | Abrir detalle y checklist (único destino). El analista no crea ni reasigna HDU |
| Ámbito | Solo HDU con `analistaId` igual al usuario |
| Vacío | «No tienes HDU asignadas» (sin supervisor asignado se informa aparte) |

«Con observaciones»: entregable en PENDIENTE cuyo último evento de bitácora es un rechazo.

### 6.2 QE · `/qe`

| Elemento | Detalle |
| --- | --- |
| Encabezado y resumen | Se conservan los de E1-F03: analistas supervisados y HDU bajo supervisión, con acceso a ambos listados |
| Contadores | `por-aprobar` (entregables en POR_APROBAR de HDU donde es QE responsable, y en cuántas HDU) · `sin-analista` · `listas-certificar` (entregables 1–8 aprobados y el 9 sin aprobar) · `listas-cerrar` (10 aprobados y HDU no cerrada) |
| Lista principal «Requiere mi acción» | HDU · Título · Célula · Sprint · Analista · **Acción pendiente** (Aprobar N entregables / Asignar analista / Generar certificado / Cerrar HDU) · Antigüedad (días en espera) · Botón de la acción |
| Orden por defecto | Más antigua primero |
| Filtros | Tipo de acción · Célula · Sprint · Analista · búsqueda |
| Acciones | «Aprobar» abre `/qe/aprobaciones` (E3-F03) ya filtrado a esa HDU · «Asignar» abre el detalle en la asignación (E2-F02) · «Certificar» y «Cerrar» abren el detalle de la HDU. La bandeja no ejecuta la acción por sí misma |
| Ámbito | Solo HDU donde el usuario es QE responsable. Las HDU de sus analistas donde otro QE es responsable salen en el listado de supervisión, no aquí, porque no puede actuar sobre ellas (D18) |
| Vacío | «No tienes acciones pendientes» |

### 6.3 Líder QA · `/lider` (nuevo)

| Elemento | Detalle |
| --- | --- |
| Encabezado | Nombre y chips con sus células vigentes. Sin células: «Aún no tienes células asignadas. Pide al Administrador que te las asigne» |
| Contadores | `celulas` · `hdu-abiertas` · `hdu-cerradas` · `sin-analista` · `certificados` (HDU de sus células con certificado) |
| Resumen por célula | Una fila por célula: HDU por estado (5 estados) y avance promedio de las abiertas |
| Lista principal «HDU de mis células» | Código · Título · Célula · Sprint · Prioridad · Estado · QE responsable · Analista (o «Sin asignar») · Avance · Certificado (folio o «—») · Actualizada |
| Orden por defecto | Célula, luego sprint más reciente, luego código |
| Filtros | Célula (solo las suyas) · Sprint · Estado · QE · Analista · «Sin analista» · búsqueda |
| Acciones | Abrir detalle (solo lectura, D39) · Descargar certificado si existe. Nada más |
| Ámbito | HDU cuya célula esté entre sus asignaciones vigentes. Si el Administrador le quita una célula, esas HDU desaparecen en la siguiente consulta |

### 6.4 Administrador · `/admin`

| Elemento | Detalle |
| --- | --- |
| Accesos | Se conservan los de E1-F08: usuarios, roles y supervisión |
| Contadores | `usuarios-activos` (con desglose por los 5 roles) · `usuarios-inactivos` · `analistas-sin-qe` · `qe-sin-analistas` · `lideres-sin-celulas` · `celulas-sin-lider` · `hdu-total` |
| Lista «Pendientes de configuración» | Una fila por situación a resolver: Usuario · Situación (Analista sin QE / QE sin analistas / Líder sin células) · Botón («Asignar QE» abre `/admin/supervision`; «Asignar células» abre `/admin/usuarios` con el usuario ya seleccionado) |
| Lista «Últimos cambios» | Las últimas 10 entradas de auditoría de usuarios: Fecha · Actor · Operación · Usuario afectado |
| Acciones | Registrar usuario, asignar rol, asignar células al Líder, asignar QE (las pantallas ya existentes, F07 amplía la de usuarios) |
| Ámbito | Todo el sistema |
| Vacío | «No hay pendientes de configuración» (verde). Un contador en 0 se muestra como 0 |

### 6.5 Auditor · `/auditor` (nuevo)

| Elemento | Detalle |
| --- | --- |
| Contadores | `hdu-total` · `certificados` · `eventos-7d` (eventos de bitácora de los últimos 7 días) · `cambios-usuarios-7d` |
| Pestañas | HDU · Certificados · Bitácora de checklist · Auditoría de usuarios. Cada una con filtros, orden, paginación y botón «Exportar CSV» |
| Pestaña HDU `/auditor/hdu` | Código · Título · Célula · Sprint · Estado · QE · Analista · Avance · Certificado · Actualizada. Filtros: célula, sprint, estado, QE, analista, con/sin certificado, rango de fechas. Abre el detalle (solo lectura) con checklist, evidencias, historial de estado y asignación, bitácora y certificado |
| Pestaña Certificados `/auditor/certificados` | Folio · HDU (código y título) · Fecha de emisión · QE emisor · Huella SHA-256 · Validez. Acciones: descargar PDF, abrir la verificación pública |
| Pestaña Bitácora `/auditor/bitacora` | Fecha · HDU · Entregable · Acción (marcar, desmarcar, aprobar, rechazar, certificar) · Actor · Valor anterior → nuevo · Motivo o comentario. Filtros: rango de fechas, HDU, actor, acción |
| Pestaña Auditoría de usuarios `/auditor/auditoria-usuarios` | Fecha · Actor · Operación · Usuario afectado · Cambios (antes → después) · Motivo. Filtros: rango de fechas, actor, operación, usuario afectado. Nunca contraseñas ni tokens (E1-B12#3) |
| Exportar | CSV con los filtros aplicados (D35). Si supera 50.000 filas, avisa «Acota los filtros» |
| Acciones de escritura | Ninguna, en ninguna pantalla |
| Ámbito | Todo el sistema, solo lectura |

## 7. HDU de frontend

### E7-F01 · Usuario autenticado

Quiero entrar automáticamente a la bandeja de mi rol y que solo vea las opciones que me corresponden. Para empezar a trabajar sin pasar por pantallas ajenas.

| # | Criterio | Contexto | Evento | Resultado esperado |
| --- | --- | --- | --- | --- |
| 1 | Redirección por rol | El usuario tiene credenciales válidas y un rol asignado. | Inicia sesión. | Es dirigido a la bandeja de su rol: Analista QA a `/qa`, QE a `/qe`, Líder QA a `/lider`, Administrador a `/admin`, Auditor a `/auditor`. La pantalla muestra su nombre y rol. |
| 2 | Menú según rol | El usuario está en su bandeja. | Revisa el menú. | Solo aparecen las opciones de su rol, con «Bandeja» en primer lugar. El Líder y el Auditor no ven opciones de creación ni de edición. |
| 3 | Bandeja ajena | El usuario está autenticado con un rol. | Abre por URL la bandeja o una pantalla de otro rol. | Ve «No tienes acceso a esta sección» con el botón «Ir a mi bandeja» y no se carga ningún dato. Sin sesión, lo envían al inicio de sesión y, tras ingresar, llega a su propia bandeja aunque la ruta pedida fuera de otro rol. |

Reglas de negocio:
- El rol sale de `/v1/me` (D4), nunca del token ni de lo que haya guardado el navegador. Si el Administrador cambia el rol de un usuario con sesión abierta, al recargar o en la siguiente consulta que responda 403 el portal vuelve a consultar `/v1/me` y lo lleva a la nueva bandeja.
- `/` resuelve al portal del rol. Un usuario desactivado o sin registro en Organización no entra (E1-B01, mensaje genérico).
- Rutas compartidas por todos los roles: `/perfil` y `/hdu/:id` (esta última según el ámbito del rol; fuera de él, acceso denegado).
- Matriz de acceso a portales: cada rol entra solo al suyo. Administrador no entra a `/lider` ni `/auditor`; Auditor no entra a `/admin`.
- Estados: mientras se consulta `/v1/me` se muestra cargando (no un portal equivocado); si `/v1/me` falla por red se muestra error con «Reintentar»; si responde 401 `SESION_EXPIRADA` vuelve al inicio de sesión.
- Efecto sobre HDU certificada: E1-F02#2, E1-F05#3 y E1-F07 (se amplían las rutas ajenas) y el nombre del primer ítem del menú; ver sección 4.

Casos de prueba:

| ID | Tipo | Escenario | Datos | Pasos | Resultado esperado |
| --- | --- | --- | --- | --- | --- |
| E7-F01-T01 | e2e | #1 | Cada uno de ANA1, QE1, LID1, ADM1, AUD1 | Inicia sesión con cada uno | La URL final es `/qa`, `/qe`, `/lider`, `/admin` y `/auditor` respectivamente; se ve `bandeja-<rol>` y el rol en el encabezado |
| E7-F01-T02 | e2e | #2 | LID1 y AUD1 | Inicia sesión y lee el menú | Primer ítem «Bandeja»; no hay «Nueva HDU», «Usuarios» ni «Aprobaciones» |
| E7-F01-T03 | e2e | #2 | ANA1 | Inicia sesión y lee el menú | Aparecen «Bandeja», «Mis HDU», «Perfil» y «Cerrar sesión»; ninguna opción de QE ni Admin |
| E7-F01-T04 | e2e | #3 negativo | ANA1, QE1, LID1, ADM1, AUD1 | Cada uno abre por URL cada portal que no es el suyo (20 combinaciones: 5 roles × 4 portales ajenos) | En las 20 se muestra acceso denegado con «Ir a mi bandeja»; ninguna petición de datos del portal ajeno devuelve 200 |
| E7-F01-T05 | e2e | #3 negativo | AUD1 | Abre `/admin/usuarios` | Acceso denegado; la pantalla no muestra correos de usuarios |
| E7-F01-T06 | e2e | #3 | Sin sesión | Abre `/lider`, inicia sesión como QE1 | Pasa por el inicio de sesión y termina en `/qe`, no en `/lider` |
| E7-F01-T07 | e2e | #1 | ANA2 con rol cambiado a QE por ADM1 (con sesión abierta) | ADM1 cambia el rol; ANA2 recarga | ANA2 queda en `/qe` y ya no puede abrir `/qa` |
| E7-F01-T08 | e2e | #1 negativo | INACT1 | Inicia sesión | Mensaje genérico de credenciales (CREDENCIALES); no entra a ninguna bandeja |

### E7-F02 · Analista QA

Quiero una bandeja con mis HDU ordenadas por lo que me falta hacer. Para corregir primero lo observado y avanzar el siguiente entregable.

| # | Criterio | Contexto | Evento | Resultado esperado |
| --- | --- | --- | --- | --- |
| 1 | Bandeja con trabajo | El analista tiene HDU asignadas, algunas con observaciones del QE. | Abre su bandeja. | Ve los contadores «Abiertas», «Con observaciones» y «Esperando aprobación», y la lista de sus HDU con las observadas primero, el avance y el siguiente entregable de cada una. |
| 2 | Sin HDU, sin supervisor o fuente caída | El analista no tiene HDU, o no tiene QE vigente, o Certificaciones no responde. | Abre su bandeja. | Sin HDU: contadores en 0 y «No tienes HDU asignadas». Sin QE: «Sin supervisor asignado». Con Certificaciones caída: los contadores de observaciones y de aprobación dicen «No disponible» y la lista de HDU sigue visible sin avance. Nunca se muestra 0 por una fuente caída. |
| 3 | Filtros y solo mis HDU | Existen HDU de otros analistas. | Filtra por estado o por «Solo con observaciones» y abre una HDU. | Solo aparecen HDU propias; al abrir una se llega a su detalle y checklist. Una HDU ajena abierta por URL da acceso denegado. |

Reglas de negocio:
- Ver sección 6.1. El analista solo consulta y navega; marcar y adjuntar evidencia se hace en el detalle (E3-F02).
- El contador «Con observaciones» cuenta entregables, y la insignia de la fila indica cuántos.
- Los resúmenes de E1-F06 (supervisor y conteo de HDU) se conservan.

Casos de prueba:

| ID | Tipo | Escenario | Datos | Pasos | Resultado esperado |
| --- | --- | --- | --- | --- | --- |
| E7-F02-T01 | e2e | #1 | ANA2 | Abre `/qa` | Contadores: abiertas 2, con observaciones 1, esperando aprobación 0; la primera fila es H2 con insignia de observación; H8 muestra avance 10/10 |
| E7-F02-T02 | e2e | #1 | ANA1 | Abre `/qa` | Abiertas 2, con observaciones 0, esperando aprobación 1; siguiente entregable de H1 es el 4 |
| E7-F02-T03 | e2e | #2 | ANA4 | Abre `/qa` | Contadores en 0, «No tienes HDU asignadas» y «Sin supervisor asignado»; no hay mensaje de error |
| E7-F02-T04 | e2e | #2 | ANA1 con el servicio de Certificaciones detenido | Abre `/qa` | Contadores de observaciones y aprobación en «No disponible» (`estado-indisponible-*`); la lista muestra H1 y H6; el contador «Abiertas» sigue en 2 |
| E7-F02-T05 | e2e | #3 | ANA2 | Filtra «Solo con observaciones» | Solo H2; el contador no cambia |
| E7-F02-T06 | e2e | #3 negativo | ANA1 | Abre `/hdu/<id de H3>` | Acceso denegado |
| E7-F02-T07 | e2e | #1 | ANA2 | Pulsa la fila de H2 | Abre el detalle con el checklist y la observación «Falta evidencia de datos» visible |

### E7-F03 · Quality Engineer (QE)

Quiero una bandeja con lo que requiere mi acción. Para no revisar HDU una por una y desbloquear a mi equipo.

| # | Criterio | Contexto | Evento | Resultado esperado |
| --- | --- | --- | --- | --- |
| 1 | Acciones pendientes | El QE es responsable de HDU con entregables por aprobar, sin analista, listas para certificar y listas para cerrar. | Abre su bandeja. | Ve los contadores «Por aprobar», «Sin analista», «Listas para certificar» y «Listas para cerrar», más su resumen de equipo, y una lista donde cada fila indica la acción pendiente y tiene su botón. |
| 2 | Sin pendientes o fuente caída | El QE no tiene acciones, o Certificaciones no responde. | Abre su bandeja. | Sin acciones: «No tienes acciones pendientes» con los contadores en 0. Con Certificaciones caída: los contadores y filas que dependen del checklist dicen «No disponible»; «Sin analista» y el resumen del equipo siguen visibles. |
| 3 | Acción y ámbito | Hay una HDU de un analista suyo cuyo QE responsable es otro QE. | Usa el botón de una fila y revisa la lista. | El botón lleva a la pantalla de esa acción (aprobaciones, asignación o detalle). La HDU donde otro QE es responsable no aparece en la lista de acciones. |

Reglas de negocio:
- Ver sección 6.2. La bandeja no ejecuta aprobaciones ni asignaciones: lleva a las pantallas ya certificadas (E3-F03, E2-F02), así que sus reglas (D16, D17, D18) no se duplican.
- La bandeja de aprobaciones `/qe/aprobaciones` se conserva sin cambios y su enlace de «Accesos rápidos» también (E3-F03#3).
- Se conserva el resumen de E1-F03 (analistas y HDU bajo supervisión, sus vacíos y su estado de error).

Casos de prueba:

| ID | Tipo | Escenario | Datos | Pasos | Resultado esperado |
| --- | --- | --- | --- | --- | --- |
| E7-F03-T01 | e2e | #1 | QE1 | Abre `/qe` | Por aprobar 1 (en 1 HDU), sin analista 1, listas para certificar 1, listas para cerrar 1; la lista tiene 4 filas con acciones «Aprobar 1 entregable» (H1), «Asignar analista» (H5), «Generar certificado» (H6), «Cerrar HDU» (H8) |
| E7-F03-T02 | e2e | #1 | QE1 | Pulsa «Aprobar» en H1 | Abre `/qe/aprobaciones` con H1 visible |
| E7-F03-T03 | e2e | #2 | QE2 | Abre `/qe` | Contadores en 0 y «No tienes acciones pendientes»; se conserva el resumen del equipo (1 analista) |
| E7-F03-T04 | e2e | #2 | QE1 con Certificaciones detenido | Abre `/qe` | Por aprobar, listas para certificar y listas para cerrar en «No disponible»; «Sin analista» sigue en 1 y muestra la fila de H5 |
| E7-F03-T05 | e2e | #3 | QE1 | Revisa la lista | No aparece ninguna HDU de CEL-A/B/C donde QE2 sea responsable (H3, H4, H7) |
| E7-F03-T06 | e2e | #3 | QE1 | Pulsa «Asignar analista» en H5 | Abre el detalle de H5 con el selector de analistas del equipo (solo ANA1 y ANA2) |
| E7-F03-T07 | e2e | #1 regresión | QE1 | Ejecuta las pruebas certificadas de E1-F03 y E3-F03 | Pasan sin cambios |

### E7-F04 · Líder QA

Quiero una bandeja con todas las HDU de las células que tengo a cargo. Para conocer el estado de certificación de mis células sin depender de cada QE.

| # | Criterio | Contexto | Evento | Resultado esperado |
| --- | --- | --- | --- | --- |
| 1 | HDU de mis células | El líder tiene dos células con HDU de distintos QE y estados. | Abre su bandeja. | Ve sus células, los contadores, el resumen por célula y la lista de HDU de esas células con QE, analista, avance y certificado. No aparece ninguna HDU de otra célula. |
| 2 | Sin células o fuente caída | El líder no tiene células vigentes, o Certificaciones no responde. | Abre su bandeja. | Sin células: «Aún no tienes células asignadas. Pide al Administrador que te las asigne», sin tablas ni cifras ficticias. Con Certificaciones caída: avance y certificado dicen «No disponible» y la lista de HDU se mantiene. |
| 3 | Solo lectura | El líder abre una HDU de su célula. | Revisa la pantalla. | Ve datos, checklist, evidencias y certificado, y puede descargar el certificado. No hay botones para marcar, aprobar, asignar, cambiar estado ni generar certificado. Una HDU de otra célula da acceso denegado. |

Reglas de negocio:
- Ver sección 6.3 y D30, D32, D39. El filtro de célula solo ofrece las células vigentes del líder.
- Si el Administrador le retira una célula, esas HDU dejan de verse en la siguiente consulta, y su detalle da acceso denegado.
- El Líder no ve jerarquía sobre los QE: aparecen como dato de la fila, sin acciones sobre ellos.

Casos de prueba:

| ID | Tipo | Escenario | Datos | Pasos | Resultado esperado |
| --- | --- | --- | --- | --- | --- |
| E7-F04-T01 | e2e | #1 | LID1 | Abre `/lider` | Chips CEL-A y CEL-B; hdu-abiertas 5, hdu-cerradas 1, sin-analista 1, certificados 1; la lista tiene H1, H2, H3, H5, H6, H7 y ninguna de H4 ni H8 |
| E7-F04-T02 | e2e | #1 | LID1 | Filtra por QE = QE1 | Quedan H1, H2, H5, H6 |
| E7-F04-T03 | e2e | #1 | LID1 | Filtra «Sin analista» | Solo H5 con «Sin asignar» en la columna Analista |
| E7-F04-T04 | e2e | #2 | LID2 | Abre `/lider` | Mensaje de sin células; no hay tabla ni contadores con cifras; sin mensaje de error |
| E7-F04-T05 | e2e | #2 | LID1 con Certificaciones detenido | Abre `/lider` | Avance y certificado en «No disponible»; las 6 HDU siguen listadas; `hdu-abiertas` sigue en 5 |
| E7-F04-T06 | e2e | #3 | LID1 | Abre el detalle de H2 | Se ve el checklist con la observación; no existen botones de marcar, aprobar, asignar, cambiar estado ni generar certificado |
| E7-F04-T07 | e2e | #3 | LID1 | Abre el detalle de H7 y descarga el certificado | Descarga un PDF con el folio F7 |
| E7-F04-T08 | e2e | #3 negativo | LID1 | Abre `/hdu/<id de H4>` (CEL-C) | Acceso denegado |
| E7-F04-T09 | e2e | #1 | ADM1 y LID1 | ADM1 quita CEL-B a LID1; LID1 recarga `/lider` | La lista queda con H1, H2, H5, H7 y desaparece CEL-B de los chips |

### E7-F05 · Administrador

Quiero una bandeja con lo que falta configurar y con mis últimos cambios. Para mantener la organización al día.

| # | Criterio | Contexto | Evento | Resultado esperado |
| --- | --- | --- | --- | --- |
| 1 | Pendientes de configuración | Hay analistas sin QE, líderes sin células y células sin líder. | Abre su bandeja. | Ve los contadores de usuarios (activos con desglose por rol, e inactivos), analistas sin QE, QE sin analistas, líderes sin células, células sin líder y HDU totales, y la lista de pendientes con un botón por fila. |
| 2 | Todo en orden o fuente caída | No hay pendientes, o el servicio de Organización no responde. | Abre su bandeja. | Sin pendientes: «No hay pendientes de configuración» y contadores en 0. Con error: mensaje de error con «Reintentar», sin cifras ficticias (E1-F08#2); los accesos a usuarios, roles y supervisión siguen disponibles. |
| 3 | Ir a resolver | Hay un líder sin células. | Pulsa «Asignar células» en su fila. | Abre la pantalla de usuarios con ese usuario seleccionado. Los últimos cambios de la bandeja incluyen la asignación recién hecha al volver. |

Reglas de negocio:
- Ver sección 6.4. Los accesos de E1-F08 se conservan.
- «Últimos cambios» sale de la auditoría de usuarios (E1-B12) y no muestra contraseñas ni tokens.
- El Administrador no abre las bandejas de otros roles ni las pantallas del Auditor (D33, D38).
- Un contador de HDU totales usa solo Organización; no depende de Certificaciones.

Casos de prueba:

| ID | Tipo | Escenario | Datos | Pasos | Resultado esperado |
| --- | --- | --- | --- | --- | --- |
| E7-F05-T01 | e2e | #1 | ADM1 | Abre `/admin` | usuarios-activos 10 (1 / 2 / 4 / 2 / 1 por rol), usuarios-inactivos 1, analistas-sin-qe 1, qe-sin-analistas 0, lideres-sin-celulas 1, celulas-sin-lider 1, hdu-total 8 |
| E7-F05-T02 | e2e | #1 | ADM1 | Revisa la lista de pendientes | Filas: ANA4 «Analista sin QE», LID2 «Líder sin células» y la célula CEL-C «sin líder» |
| E7-F05-T03 | e2e | #2 | ADM1 tras asignar QE a ANA4, células a LID2 y líder a CEL-C | Recarga `/admin` | Contadores de pendientes en 0 y «No hay pendientes de configuración» |
| E7-F05-T04 | e2e | #2 | ADM1 con Organización detenida | Abre `/admin` | Error con «Reintentar»; no hay cifras; los enlaces de acceso siguen visibles |
| E7-F05-T05 | e2e | #3 | ADM1 | Pulsa «Asignar células» en LID2 | Abre `/admin/usuarios` con LID2 seleccionado |
| E7-F05-T06 | e2e | #3 | ADM1 | Asigna CEL-C a LID2 y vuelve a `/admin` | El primer ítem de «Últimos cambios» es esa asignación con ADM1 como actor |
| E7-F05-T07 | e2e | #1 regresión | ADM1 | Ejecuta las pruebas certificadas de E1-F08 | Pasan sin cambios |

### E7-F06 · Auditor

Quiero consultar todas las HDU, checklists, evidencias, certificados, la bitácora y la auditoría de usuarios, con filtros y exportación. Para verificar la trazabilidad sin poder modificar nada.

| # | Criterio | Contexto | Evento | Resultado esperado |
| --- | --- | --- | --- | --- |
| 1 | Consulta global | Existen HDU de varias células, certificados y eventos. | Abre su bandeja y recorre las cuatro pestañas. | Ve los contadores y, en cada pestaña, la lista completa con sus columnas, orden y paginación; el detalle de cualquier HDU muestra checklist, evidencias, historiales y certificado. |
| 2 | Filtros y exportación | El auditor aplica filtros en una pestaña. | Pulsa «Exportar CSV». | Se descarga un CSV con exactamente las filas y columnas filtradas. Sin resultados se informa «No hay registros con esos filtros» y el botón queda deshabilitado. Si supera 50.000 filas se pide acotar los filtros. |
| 3 | Solo lectura y fuente caída | El auditor está en cualquier pantalla, o una fuente no responde. | Revisa las acciones disponibles. | No existe ningún botón de marcar, aprobar, asignar, editar o crear. Si una fuente cae, solo esa pestaña dice «No disponible» con «Reintentar»; las demás siguen funcionando. |

Reglas de negocio:
- Ver sección 6.5 y D32, D35, D38, D39.
- La auditoría de usuarios es sensible: solo la ve el Auditor y nunca contiene contraseñas ni tokens.
- Fechas en hora local de Chile en pantalla, ISO 8601 en el CSV. El CSV usa separador `;` y codificación UTF-8 con BOM para abrirse bien en Excel.
- Las exportaciones quedan registradas (D35).

Casos de prueba:

| ID | Tipo | Escenario | Datos | Pasos | Resultado esperado |
| --- | --- | --- | --- | --- | --- |
| E7-F06-T01 | e2e | #1 | AUD1 | Abre `/auditor` | hdu-total 8, certificados 2; la pestaña HDU lista H1 a H8 |
| E7-F06-T02 | e2e | #1 | AUD1 | Abre la pestaña Certificados | Dos filas (F7 y F8) con huella SHA-256 y validez; «Descargar PDF» entrega el PDF de F7 |
| E7-F06-T03 | e2e | #1 | AUD1 | Abre el detalle de H7 | Ve los 10 entregables, la evidencia en archivo (descarga con URL firmada), el historial de estado y la bitácora de la HDU |
| E7-F06-T04 | e2e | #1 | AUD1 | Abre la pestaña Auditoría de usuarios | Ve los cambios de la semilla y de pruebas anteriores con actor, operación y antes/después; ninguna fila contiene la cadena «password» ni un token |
| E7-F06-T05 | e2e | #2 | AUD1 | En HDU filtra célula = CEL-A y exporta | CSV con 4 filas de datos (H1, H2, H5, H7) y la fila de encabezado |
| E7-F06-T06 | e2e | #2 | AUD1 | En Bitácora filtra por una HDU sin eventos | «No hay registros con esos filtros»; «Exportar CSV» deshabilitado |
| E7-F06-T07 | e2e | #3 | AUD1 | Recorre las 4 pestañas y el detalle de H1 | No existe ningún botón o formulario de escritura (`button[type=submit]` y acciones de marcar, aprobar, asignar, cambiar estado) |
| E7-F06-T08 | e2e | #3 | AUD1 con Certificaciones detenido | Abre `/auditor` | Las pestañas Certificados y Bitácora dicen «No disponible» con «Reintentar»; las pestañas HDU y Auditoría de usuarios cargan |
| E7-F06-T09 | e2e | #3 negativo | AUD1 | Abre `/qe/aprobaciones`, `/qa/hdu`, `/admin/usuarios` y `/lider` | Acceso denegado en las cuatro |

### E7-F07 · Administrador

Quiero asignar el rol Líder QA o Auditor a un usuario y, para el Líder, elegir sus células. Para definir quién ve qué en las bandejas.

| # | Criterio | Contexto | Evento | Resultado esperado |
| --- | --- | --- | --- | --- |
| 1 | Asignar rol y células | El Administrador edita un usuario activo. | Elige el rol Líder QA, marca CEL-A y CEL-B y confirma. | El selector ofrece los 5 roles; al elegir Líder QA aparece la lista de células; se pide confirmación y se muestra el resultado. Con Auditor no aparece lista de células. |
| 2 | Validaciones | El Administrador deja a un Líder sin células, o intenta cambiar de rol a un Líder que aún las tiene. | Guarda. | Un Líder sin células se permite, con el aviso «Este líder no verá ninguna HDU hasta que le asignes células». Cambiar el rol de un Líder con células se rechaza indicando que primero debe quitárselas; no se aplica ningún cambio parcial. |
| 3 | Reflejo y rastro | El Administrador cambió las células de un Líder. | Consulta el usuario y el historial. | La pantalla muestra las células vigentes y su historial con fechas y quién las asignó; el cambio aparece en la auditoría. |

Reglas de negocio:
- Amplía E1-F09 sin cambiar sus 3 escenarios. Las reglas son las de E7-B01 y D30, D31, D40.
- Las células se eligen de un listado múltiple con búsqueda; se muestran solo las existentes.
- Confirmación previa obligatoria al cambiar rol (E1-F09#3).

Casos de prueba:

| ID | Tipo | Escenario | Datos | Pasos | Resultado esperado |
| --- | --- | --- | --- | --- | --- |
| E7-F07-T01 | e2e | #1 | ADM1, ANA4 | Edita ANA4: rol Líder QA, marca CEL-C, confirma | Mensaje de éxito; al iniciar sesión ANA4 llega a `/lider` con CEL-C |
| E7-F07-T02 | e2e | #1 | ADM1 | Abre el selector de rol | Aparecen Analista QA, QE, Líder QA, Administrador y Auditor |
| E7-F07-T03 | e2e | #1 | ADM1 | Elige Auditor | No se muestra la lista de células |
| E7-F07-T04 | e2e | #2 | ADM1, LID1 | Cambia LID1 a Analista QA | Se rechaza con el mensaje de quitar antes las células; LID1 sigue siendo Líder |
| E7-F07-T05 | e2e | #2 | ADM1, un usuario nuevo | Registra un Líder sin marcar células | Se guarda con el aviso de que no verá HDU |
| E7-F07-T06 | e2e | #3 | ADM1, LID1 | Quita CEL-B y abre el historial | La célula figura vigente solo CEL-A; CEL-B aparece en el historial con fecha de término |
| E7-F07-T07 | e2e | #1 regresión | ADM1 | Ejecuta las pruebas certificadas de E1-F09 | Pasan (ajustando el dato de «rol inválido» según sección 4) |

## 8. HDU de backend

### E7-B01 · Administrador

Quiero que el sistema registre los roles Líder QA y Auditor y las células de cada Líder. Para que la visibilidad de cada usuario quede definida y trazable.

| # | Criterio | Contexto | Evento | Resultado esperado |
| --- | --- | --- | --- | --- |
| 1 | Catálogo y asignación | Existen usuarios activos y células. | El Administrador asigna el rol Líder QA con dos células. | El catálogo ofrece 5 roles; el usuario queda con rol `LIDER_QA` y dos asignaciones vigentes en `celula_lider`; se registra en la auditoría el rol y las células, con actor y fecha. |
| 2 | Reglas de integridad | Se envían datos inválidos o incompatibles. | El Administrador confirma. | Un rol fuera del catálogo se rechaza (400 `VALIDACION`, como E1-B08#1). Asignar células a quien no es Líder se rechaza (409 `ROL_INCOMPATIBLE`). Una célula inexistente se rechaza (422). Cambiar el rol de un Líder con células vigentes se rechaza (409 `RELACIONES_INCOMPATIBLES`). Se mantiene la regla del último administrador. Quitar una célula conserva el registro con `fecha_hasta`. |
| 3 | Solo el Administrador | Un usuario no administrador intenta cambiar roles o células. | Invoca la operación. | Se rechaza con 403 `ACCESO_DENEGADO` y no se modifica nada; sin sesión, 401. |

Reglas de negocio:
- Contrato: `PUT /v1/usuarios/{id}/celulas-lider` con `{ celulaIds: [...] }`, que reemplaza el conjunto vigente en una sola transacción (cierra las que sobran, abre las nuevas). Lectura: `GET /v1/usuarios/{id}/celulas-lider` (vigentes e historial). Además, `PUT /v1/usuarios/{id}/rol` y `POST /v1/usuarios` aceptan `celulaIds` con `rol: LIDER_QA` y aplican rol y células de forma atómica (D42).
- Migración: 2 filas nuevas en `organizacion.rol` y la tabla `celula_lider` con índice único parcial (`id_usuario`, `id_celula`) donde `fecha_hasta` es nula. Sin llaves foráneas fuera del esquema (D24).
- Aplica D31 y D40 en el cambio de rol.
- La auditoría guarda valor anterior y nuevo de las células.

Casos de prueba:

| ID | Tipo | Escenario | Datos | Pasos | Resultado esperado |
| --- | --- | --- | --- | --- | --- |
| E7-B01-T01 | api | #1 | ADM1 | `GET /v1/roles` | 200 con 5 roles, incluidos `LIDER_QA` y `AUDITOR` |
| E7-B01-T02 | api | #1 | ADM1, ANA4 | Cambia ANA4 a `LIDER_QA` y luego `PUT celulas-lider` con CEL-A y CEL-B | 200; `GET` devuelve 2 vigentes; la auditoría tiene 2 entradas nuevas con actor ADM1 |
| E7-B01-T03 | api | #2 | ADM1 | Cambia un usuario al rol `SUPERVISOR` | 400 `VALIDACION` con `{campo: rol, codigo: VALOR_NO_PERMITIDO}` (rol fuera del catálogo) |
| E7-B01-T04 | api | #2 | ADM1, QE1 | `PUT celulas-lider` sobre QE1 | 409 `ROL_INCOMPATIBLE`; sin cambios |
| E7-B01-T05 | api | #2 | ADM1, LID1 | `PUT celulas-lider` con una célula inexistente | 422; las células de LID1 no cambian |
| E7-B01-T06 | api | #2 | ADM1, LID1 | Cambia el rol de LID1 a `ANALISTA_QA` | 409 `RELACIONES_INCOMPATIBLES`; tras `PUT` con lista vacía, el cambio de rol da 200 |
| E7-B01-T07 | api | #2 | ADM1, LID1 | `PUT` con solo CEL-A | CEL-B queda con `fecha_hasta` y sigue en el historial; vigentes = 1 |
| E7-B01-T08 | api | #2 | ADM1 es el único administrador | Intenta cambiar su propio rol | Se rechaza (regla vigente de E1-B08#2) |
| E7-B01-T09 | api | #3 negativo | QE1, ANA1, LID1, AUD1 | Cada uno invoca `PUT celulas-lider` y el cambio de rol | 403 `ACCESO_DENEGADO` en los 8 intentos; los datos no cambian |
| E7-B01-T10 | api | #3 negativo | Sin token | Invoca `PUT celulas-lider` | 401 `NO_AUTENTICADO` |

### E7-B02 · Usuario autenticado

Quiero que el sistema limite lo que veo según mi rol y me impida modificar datos si soy Líder QA o Auditor. Para que la consulta sea amplia pero segura.

| # | Criterio | Contexto | Evento | Resultado esperado |
| --- | --- | --- | --- | --- |
| 1 | Ámbito del Líder | El líder tiene células vigentes. | Consulta el listado, el detalle, el checklist, las evidencias o el certificado de una HDU. | El listado solo incluye HDU de sus células vigentes. Cualquier recurso de una HDU de otra célula responde 403 `ACCESO_DENEGADO` (D12). Un líder sin células recibe una lista vacía con 200, no un error. |
| 2 | Lectura total del Auditor | Existen HDU de todas las células. | El auditor consulta listado, detalle, checklist, evidencias, certificados e historiales. | Recibe todas las HDU y recursos asociados, incluidos URLs firmadas de corta duración para evidencias y certificados (D20). |
| 3 | Sin escritura | Un Líder o un Auditor invoca una operación que modifica datos. | Invoca crear o editar HDU, cambiar estado, asignar, marcar, desmarcar, aprobar, rechazar, generar certificado, usuarios, supervisión o células. | Todas responden 403 `ACCESO_DENEGADO`, sin cambios en los datos ni nuevos eventos de bitácora. |

Reglas de negocio:
- Extiende E2-B03 (ámbito) y D18 (relaciones `LECTOR_CELULA` y `LECTOR_AUDITORIA`, D32). La relación se resuelve en `/v1/interno/hdu/{id}/acceso` de Organización.
- El filtro `celulaId` de `GET /v1/hdu` se acepta, pero solo sobre células del ámbito del rol; fuera de él, 403.
- Para operaciones nuevas se aplica «denegar por defecto»: una ruta que modifica datos debe listar explícitamente los roles autorizados; Líder y Auditor nunca están.
- La verificación pública del certificado (D21) no cambia.
- Efecto sobre HDU certificada: ninguno para Analista, QE y Administrador; se vuelven a ejecutar sus pruebas de E2-B03 y E3-B01/B02.

Casos de prueba:

| ID | Tipo | Escenario | Datos | Pasos | Resultado esperado |
| --- | --- | --- | --- | --- | --- |
| E7-B02-T01 | api | #1 | LID1 | `GET /v1/hdu` | 200 con H1, H2, H3, H5, H6, H7; sin H4 ni H8 |
| E7-B02-T02 | api | #1 negativo | LID1 | `GET /v1/hdu/{H4}`, `…/checklist`, `…/bitacora`, evidencia de H4 y certificado de H8 | 403 `ACCESO_DENEGADO` con mensaje genérico, sin revelar si existe |
| E7-B02-T03 | api | #1 | LID2 | `GET /v1/hdu` | 200 con lista vacía |
| E7-B02-T04 | api | #1 | LID1 | `GET /v1/hdu?celulaId=CEL-C` | 403 |
| E7-B02-T05 | api | #1 | LID1, ADM1 | ADM1 quita CEL-B; LID1 consulta H3 | Antes 200, después 403 |
| E7-B02-T06 | api | #2 | AUD1 | `GET /v1/hdu` y el detalle de cada una | 200 con las 8; el detalle de H7 incluye checklist, bitácora e historiales |
| E7-B02-T07 | api | #2 | AUD1 | Pide URL firmada de la evidencia en archivo de H7 y del certificado F7 | 200 con URL de corta duración; descargarla devuelve el archivo (PDF con `Content-Type: application/pdf` para el certificado) |
| E7-B02-T08 | api | #3 negativo | AUD1 y LID1 | Para cada mutación: crear HDU, cambiar estado de H1, reasignar analista de H1, marcar entregable de H1, aprobar el de H1, generar certificado de H6, crear usuario, cambiar supervisión | 403 en las 16 combinaciones |
| E7-B02-T09 | api | #3 | AUD1 | Compara H1, H6 y la bitácora antes y después de T08 | Sin diferencias: mismos estados y 0 eventos nuevos |
| E7-B02-T10 | api | regresión | ANA1, QE1, ADM1 | Ejecuta las pruebas certificadas de E2-B03 y E3-B01/B02 | Pasan sin cambios |

### E7-B03 · Usuario autenticado

Quiero que el sistema entregue la bandeja de mi rol con contadores y lista calculados sobre mi ámbito. Para ver mi trabajo al ingresar.

| # | Criterio | Contexto | Evento | Resultado esperado |
| --- | --- | --- | --- | --- |
| 1 | Cálculo por ámbito | Cada rol tiene datos en su ámbito. | Solicita `GET /v1/bandeja/<su rol>`. | Devuelve los contadores y la lista de la sección 6 calculados solo con datos de su ámbito; un resultado vacío válido devuelve 0 con estado `ok`. |
| 2 | Fuente no disponible | Certificaciones no responde. | Solicita la bandeja de Analista, QE, Líder o Auditor. | Los bloques que dependen del checklist vienen con `estado: indisponible` y sin valor; los demás vienen `ok` y la respuesta es 200. Nunca se devuelve 0 por una fuente caída (D34). |
| 3 | Rol exclusivo | Un usuario pide la bandeja de otro rol, no tiene sesión o está desactivado. | Invoca el endpoint. | Otro rol, incluido el Administrador: 403 `ACCESO_DENEGADO`. Sin sesión o con token inválido: 401 `NO_AUTENTICADO`. Usuario desactivado: 403 `ACCESO_DENEGADO`. |

Reglas de negocio:
- Endpoints: `GET /v1/bandeja/analista`, `/qe`, `/lider`, `/admin`, `/auditor` (D33). Aceptan `estado`, `celulaId`, `sprintId`, `qeId`, `analistaId`, `q`, `orden`, `pagina` y `tamanoPagina` según corresponda a cada una (D49).
- Servicio dueño: Organización (listas y datos de HDU) compone con Certificaciones (avance y checklist) por contrato interno; sin SQL entre esquemas (regla 1).
- Cada contador y cada lista traen `estado` propio. La respuesta incluye `rol` y `generadaEn`.
- La definición de cada contador es la de las secciones 3 y 6.
- Paginación: 25 por defecto, máximo 100; un `tamano` mayor se recorta a 100.
- La bandeja del Auditor devuelve los contadores y la pestaña HDU; las otras pestañas usan los endpoints de E7-B04.

Casos de prueba:

| ID | Tipo | Escenario | Datos | Pasos | Resultado esperado |
| --- | --- | --- | --- | --- | --- |
| E7-B03-T01 | api | #1 | ANA1, ANA2 | `GET /v1/bandeja/analista` | ANA1: abiertas 2, observaciones 0, esperando 1. ANA2: 2, 1, 0; la lista de ANA2 empieza por H2 |
| E7-B03-T02 | api | #1 | ANA4 | `GET /v1/bandeja/analista` | Contadores 0 con estado `ok`; lista vacía |
| E7-B03-T03 | api | #1 | QE1, QE2 | `GET /v1/bandeja/qe` | QE1: por aprobar 1 (1 HDU), sin analista 1, listas para certificar 1, listas para cerrar 1; QE2: todo 0. Ninguna fila de QE1 es de H3, H4 o H7 |
| E7-B03-T04 | api | #1 | LID1 | `GET /v1/bandeja/lider` | celulas 2, abiertas 5, cerradas 1, sin analista 1, certificados 1; lista de 6 HDU |
| E7-B03-T05 | api | #1 | LID1 | `GET /v1/bandeja/lider?estado=CERRADA` | Solo H7 |
| E7-B03-T06 | api | #1 | ADM1 | `GET /v1/bandeja/admin` | Valores de la sección 3: 10 activos (1/2/4/2/1), 1 inactivo, ANA4 sin QE, LID2 sin células, CEL-C sin líder, 8 HDU |
| E7-B03-T07 | api | #1 | AUD1 | `GET /v1/bandeja/auditor` | hdu-total 8, certificados 2, y contadores de 7 días consistentes con la bitácora y la auditoría |
| E7-B03-T08 | api | #1 | LID1 | `GET /v1/bandeja/lider?tamanoPagina=1000` | El `tamanoPagina` efectivo es 100 |
| E7-B03-T09 | api | #2 | QE1, Certificaciones detenido | `GET /v1/bandeja/qe` | 200; por aprobar, listas para certificar y listas para cerrar con `indisponible`; sin analista = 1 con `ok` |
| E7-B03-T10 | api | #2 | ANA1, LID1, AUD1, Certificaciones detenido | Piden su bandeja | 200; observaciones, aprobación, avance y certificado en `indisponible`; las listas de HDU siguen |
| E7-B03-T11 | api | #2 | ADM1, Certificaciones detenido | `GET /v1/bandeja/admin` | 200 con todo `ok` (no depende de Certificaciones) |
| E7-B03-T12 | api | #3 negativo | ANA1, QE1, LID1, ADM1, AUD1 | Cada uno invoca los 4 endpoints que no son de su rol (20 combinaciones) | 403 `ACCESO_DENEGADO` en las 20; cuerpo idéntico entre ellas |
| E7-B03-T13 | api | #3 negativo | Sin token | Invoca los 5 endpoints | 401 `NO_AUTENTICADO` |
| E7-B03-T14 | api | #3 negativo | INACT1 | `GET /v1/bandeja/qe` | 403 `ACCESO_DENEGADO` |

### E7-B04 · Auditor

Quiero que el sistema entregue la bitácora de checklist, la auditoría de usuarios y los certificados, con filtros y exportación. Para auditar sin poder modificar.

| # | Criterio | Contexto | Evento | Resultado esperado |
| --- | --- | --- | --- | --- |
| 1 | Consulta con filtros | Existen eventos de checklist, cambios de usuarios y certificados. | El auditor consulta cada recurso con filtros de fecha, HDU, actor, acción u operación. | Devuelve solo los registros que cumplen los filtros, ordenados del más reciente al más antiguo, paginados, con los campos de la sección 6.5. Un filtro sin coincidencias devuelve 200 con lista vacía. |
| 2 | Contenido seguro y acceso | El auditor consulta la auditoría de usuarios; otro rol intenta consultar. | Invoca los endpoints. | Ninguna fila incluye contraseñas, tokens ni secretos (E1-B12#3). Cualquier rol distinto de Auditor, incluido el Administrador, recibe 403; sin sesión, 401. |
| 3 | Exportación | El auditor pide exportar con filtros. | Invoca la exportación. | Genera un CSV con los mismos filtros y columnas que la consulta, UTF-8 con BOM, separador `;` y fechas ISO 8601. Con más de 50.000 filas responde 422 `EXPORTACION_EXCEDE_LIMITE`. Cada exportación queda registrada con actor, recurso, filtros y cantidad de filas. |

Reglas de negocio:
- Endpoints propuestos: `GET /v1/auditor/bitacora` (Certificaciones), `GET /v1/auditor/auditoria-usuarios` (Organización), `GET /v1/auditor/certificados` (Certificaciones) y `GET /v1/auditor/exportaciones/{bitacora|auditoria-usuarios|certificados|hdu}`. Todos son GET: no hay escritura del usuario, aunque registrar la exportación sí escribe en la auditoría.
- Filtros: rango de fechas (`desde`, `hasta`), `hduId`, `actorId`, `accion`, `operacion`, `usuarioAfectadoId`.
- La bitácora (`evento_checklist`) y la auditoría ya existen (E3-B04, E1-B12); esta HDU solo agrega la lectura global y la exportación.
- Fuente caída: 503 con código `SERVICIO_NO_DISPONIBLE` (D50), que el portal muestra como «No disponible» solo en esa pestaña.

Casos de prueba:

| ID | Tipo | Escenario | Datos | Pasos | Resultado esperado |
| --- | --- | --- | --- | --- | --- |
| E7-B04-T01 | api | #1 | AUD1 | `GET /v1/auditor/bitacora?hduId={H2}` | 200 con los eventos de H2 (incluido el rechazo del entregable 2), más reciente primero |
| E7-B04-T02 | api | #1 | AUD1 | Bitácora con `accion=APROBAR` y rango de fechas del fixture | Solo eventos de aprobación dentro del rango |
| E7-B04-T03 | api | #1 | AUD1 | `GET /v1/auditor/certificados` | 2 elementos (F7, F8) con folio, HDU, fecha, QE emisor, huella y validez |
| E7-B04-T04 | api | #1 | AUD1 | Auditoría de usuarios con `operacion=CAMBIAR_ROL` | Solo cambios de rol, con antes y después |
| E7-B04-T05 | api | #1 | AUD1 | Bitácora con un filtro sin coincidencias | 200 con lista vacía y total 0 |
| E7-B04-T06 | api | #2 | AUD1 | Auditoría de usuarios, cualquier página, y busca claves `password`, `token`, `secret` | Ninguna fila ni campo las contiene |
| E7-B04-T07 | api | #2 negativo | ADM1, QE1, ANA1, LID1 | Invocan los 3 endpoints de consulta y los 4 de exportación | 403 `ACCESO_DENEGADO` en los 28 intentos |
| E7-B04-T08 | api | #2 negativo | Sin token | Invoca un endpoint | 401 `NO_AUTENTICADO` |
| E7-B04-T09 | api | #3 | AUD1 | Exporta HDU con `celulaId=CEL-A` | CSV con encabezado y 4 filas; BOM presente; separador `;` |
| E7-B04-T10 | api | #3 | AUD1 | Exporta y consulta la auditoría de usuarios | La última entrada de auditoría es la exportación, con AUD1 como actor, recurso, filtros y 4 filas |
| E7-B04-T11 | api | #3 | AUD1, límite de prueba reducido a 2 filas por configuración | Exporta la bitácora con más de 2 filas | 422 `EXPORTACION_EXCEDE_LIMITE` |
| E7-B04-T12 | api | #1 | AUD1, Certificaciones detenido | Consulta bitácora y auditoría de usuarios | Bitácora 503 `SERVICIO_NO_DISPONIBLE`; auditoría de usuarios 200 |

## 9. Totales y trazabilidad

| HDU | Escenarios | Casos de prueba | Servicio / dueño |
| --- | --- | --- | --- |
| E7-F01 | 3 | 8 | Portal (`q360-frontend`) |
| E7-F02 | 3 | 7 | Portal |
| E7-F03 | 3 | 7 | Portal |
| E7-F04 | 3 | 9 | Portal |
| E7-F05 | 3 | 7 | Portal |
| E7-F06 | 3 | 9 | Portal |
| E7-F07 | 3 | 7 | Portal |
| E7-B01 | 3 | 10 | Organización (`q360-backend`) |
| E7-B02 | 3 | 10 | Organización, Certificaciones y gateway (`q360-backend`, `q360-seguridad-gateway`) |
| E7-B03 | 3 | 14 | Organización con Certificaciones (`q360-backend`) |
| E7-B04 | 3 | 12 | Certificaciones y Organización (`q360-backend`) |
| **Total** | **33** | **100** | |

Dentro del total de casos, 4 son regresión de HDU ya certificadas (E7-F03-T07, E7-F05-T07, E7-F07-T07, E7-B02-T10) y los negativos de acceso son: E7-F01-T04, T05, T08, E7-F02-T06, E7-F04-T08, E7-F06-T09, E7-B01-T09, T10, E7-B02-T02, T08, E7-B03-T12, T13, T14 y E7-B04-T07, T08.

| Capacidad | Frontend | Backend |
| --- | --- | --- |
| Ingreso por rol y acceso denegado | E7-F01 | E7-B03 (#3), E7-B02 |
| Bandeja del Analista | E7-F02 | E7-B03 |
| Bandeja del QE | E7-F03 | E7-B03 |
| Bandeja del Líder QA | E7-F04 | E7-B01, B02, B03 |
| Bandeja del Administrador | E7-F05 | E7-B03 |
| Bandeja del Auditor | E7-F06 | E7-B02, B03, B04 |
| Asignación de rol y células | E7-F07 | E7-B01 |

Certificación: `q360-qa` emite el dictamen por HDU (`CERTIFICADA`, `OBSERVADA`, `NO VERIFICABLE`) en `docs/validacion/certificacion-e7.md`, con el ID del escenario en el nombre de cada prueba (`[E7-F04#2]`) y la regresión de las HDU de la sección 4. Además de la semilla de la sección 3 deben existir los usuarios LID1, LID2 y AUD1 en Supabase Auth y en `organizacion.usuario`.

## 10. Preguntas abiertas

Ninguna bloquea la construcción. Quedan decididas por criterio y se pueden revertir con poco costo:

1. **Auditor sin pantalla para el Administrador (D38).** Hoy el Administrador no puede abrir la bitácora ni la auditoría completas, solo los últimos 10 cambios. Si se quiere que también las consulte, se agrega una regla y 2 casos a E7-B04 y E7-F06.
2. **Líder sin exportación (D37).** Si el Líder debe exportar su listado, se reutiliza la exportación de E7-B04 con su ámbito (1 escenario más).
3. **Códigos internos de rol.** `LIDER_QA` y `AUDITOR` siguen el estilo propuesto; `q360-backend` debe alinearlos con los códigos que ya usa el catálogo.
4. **D40 (relaciones incompatibles ampliadas).** Backend debe confirmar qué parte ya valida el cambio de rol; si hoy no revisa las HDU abiertas, la regla es nueva y puede endurecer pruebas certificadas de E1-B08 (sección 4).
