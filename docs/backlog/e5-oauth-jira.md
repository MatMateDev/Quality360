# Épica 5 · Conexión con Jira por OAuth 2.0 (3LO), sin copiar el API token

Fecha: 2026-11-22. Complemento de `e5-integracion-jira.md` (conexión con API token), `e5-consulta-asignacion.md` y `e5-detalle-asignacion-por-hdu.md`. Mismo formato: F = frontend, B = backend; escenarios Contexto (Dado) → Evento (Cuando) → Resultado esperado (Entonces). Las secciones que se citan sin archivo son las de `e5-integracion-jira.md`.

Alcance: refinamiento, criterios de aceptación, impacto y guía de registro. No hay código ni casos de prueba detallados (los escribe `q360-qa` a partir de los escenarios). Decisiones nuevas propuestas: **D209–D218** (la última registrada es D208, «se retira el rol Líder QA»), a la espera del visto bueno de `q360-arquitecto`. Donde el arquitecto difiera, manda el arquitecto; los nombres de variables, rutas y URL de esta página son provisionales y se marcan con `<…>`.

Pedido del usuario (2026-11-22, literal): «Para integrarnos debemos copiar y pegar el token que se crea en jira, como puedo traer eso automaticamente sin la manualidad. Llamar el token desde Q360».

## 1. Resumen

- **Respuesta corta:** Quality360 **no puede** crear ni leer el API token de un usuario: Atlassian no ofrece una API para eso, y sus requisitos de seguridad dicen que las aplicaciones que recogen API tokens no cumplen. Lo que sí existe, y es lo que reemplaza al copiar y pegar, es **OAuth 2.0 (3LO)**: el Administrador pulsa «Conectar con Jira», acepta **una vez** permisos de solo lectura en Atlassian y Quality360 recibe y **renueva por sí mismo** una credencial. Nadie copia nada.
- **Decisiones del usuario (ya tomadas):** (1) botón «Conectar con Jira» con OAuth 2.0 (3LO) en Integraciones → Conexión; (2) el API token se **conserva como alternativa** («Conectar con API token») para pruebas locales o si la app de Atlassian no está configurada, y lo certificado hoy de la conexión no cambia; (3) el usuario registra la app en Atlassian y carga el Client ID y el Client secret en Vercel (proyecto de Integraciones). Quality360 **nunca** muestra ni pide el secreto, ni en pantalla ni en el chat.
- **HDU:** 2 nuevas (**E5-F08**, **E5-B08**; los identificadores E5-F01 a F07 y E5-B01 a B07 están usados) y 4 modificadas con escenarios aditivos o ajustados (**E5-F01**, **E5-B01**, **E5-B02**, **E5-F02**; la «prueba de conexión» no tiene HDU propia: vive en E5-F01 y E5-B01).
- **Lo que no cambia:** lo que ya certifica el método API token (D94, D95, D105, D112, D116), la consulta en dos pasos, la asignación por HDU, el historial, los roles (solo el Administrador opera, D93) y el resto de los portales. QE y Auditor siguen sin ver la configuración.
- **Costo:** cero. La app OAuth de Atlassian es gratuita; el modo privado (por defecto) basta si quien conecta es la cuenta dueña de la app.
- **Prueba real pendiente (manual):** **E5-MAN-02**, la hace el usuario con su sitio `jseguelh.atlassian.net`. Todas las pruebas automáticas usan un Atlassian simulado (sección 9).

### 1.1 Cómo funciona (flujo en lenguaje llano)

1. El Administrador pulsa «Conectar con Jira». Quality360 le pide a Integraciones una dirección de autorización; Integraciones crea un código de un solo uso (`state`) y devuelve la dirección de Atlassian.
2. Atlassian pide iniciar sesión (si hace falta) y aceptar los permisos de lectura. El Administrador acepta o cancela.
3. Atlassian devuelve al navegador a una **página del portal** con un `code` y el `state`. El portal los envía a la pasarela **con la sesión del Administrador** (así no existe ninguna ruta de la pasarela sin sesión).
4. Integraciones valida el `state`, canjea el `code` (con el Client secret, que solo vive en el servidor), pregunta qué sitios de Jira puede ver la cuenta, elige el sitio (o hace elegir) y guarda los tokens **cifrados**.
5. Desde ahí, «Consultar Jira» y «Probar conexión» usan esa credencial. Cuando el token de acceso (dura cerca de 1 hora) vence, Integraciones lo renueva solo. Si la renovación ya no es posible (90 días sin uso, cambio de contraseña en Atlassian), el estado pasa a «Reconexión necesaria» y el Administrador vuelve a pulsar el botón.

### 1.2 Hechos de Atlassian en los que se apoya el diseño

Fuente: documentación oficial (developer.atlassian.com, «OAuth 2.0 (3LO) apps»).

| Tema | Hecho |
| --- | --- |
| Autorización | `GET https://auth.atlassian.com/authorize` con `audience=api.atlassian.com`, `client_id`, `scope` (separados por espacio), `redirect_uri` (debe coincidir con la registrada), `state` (obligatorio), `response_type=code`, `prompt=consent` |
| Canje | `POST https://auth.atlassian.com/oauth/token`, JSON `{grant_type:"authorization_code", client_id, client_secret, code, redirect_uri}` |
| Renovación | Mismo endpoint con `{grant_type:"refresh_token", client_id, client_secret, refresh_token}`. El token de renovación solo se entrega con el permiso `offline_access` |
| Rotación | Cada renovación **devuelve un token de renovación nuevo y deshabilita el anterior** (con 10 minutos de gracia para reutilizar el anterior). Vence tras **90 días de inactividad**; cada nuevo token reinicia ese plazo. La renovación falla con 403 `invalid_grant` si el usuario cambia su contraseña de Atlassian o si no se guardó el token nuevo. Al vencer, hay que repetir la autorización |
| Token de acceso | Dura cerca de 1 hora (`expires_in`) |
| Sitios | `GET https://api.atlassian.com/oauth/token/accessible-resources` (Bearer) devuelve los sitios `{id (= cloudid), url, name, scopes}`. Puede haber varios; el `id` no es único entre productos, así que el tipo de producto se infiere de `scopes` |
| API | `https://api.atlassian.com/ex/jira/{cloudid}/rest/api/3/...` con `Authorization: Bearer`; **no** `https://<sitio>.atlassian.net` |
| Permisos del usuario | Los permisos que la cuenta tiene en Jira se aplican **además** de los scopes |
| Scopes probables | Clásicos `read:jira-work`, `read:jira-user` y `offline_access`. El arquitecto los confirma por endpoint (`/myself`, `/project/{clave}`, `/field`, `/search/jql`) |
| Registro de la app | En developer.atlassian.com: Create → OAuth 2.0 integration → Permissions (Jira API) → Authorization (URL de callback). Es **privada** por defecto (solo su dueño la usa); para otra cuenta hay que activar «Enable sharing», y esa persona verá el aviso de que Atlassian no revisó la app |

### 1.3 Cambios respecto del diseño con API token (marcados)

| Punto | Con API token (hoy) | Con OAuth (esta ronda) | Decisión |
| --- | --- | --- | --- |
| Quién entrega la credencial | El Administrador copia y pega el token | El Administrador acepta permisos una vez en Atlassian | D209 |
| Dirección de Jira | `https://<sub>.atlassian.net` escrita por el usuario (D95) | `https://api.atlassian.com/ex/jira/{cloudid}`: hosts fijos del servidor; el `cloudid` sale de Atlassian y se valida por formato | D212, D213 |
| Autenticación | Básica `correo:token` | `Bearer` con token de acceso de 1 hora, renovado | D214 |
| Qué se guarda cifrado | Token | Token de acceso y de renovación, con vencimiento | D214 |
| Permisos | Los del API token (todos los de la cuenta) | Solo lectura (scopes) y, además, los de la cuenta | D218 |
| Configuración del servidor | Solo la llave de cifrado | Además Client ID, Client secret y URL de retorno, opcionales y no fatales (patrón D127/D129) | D216 |
| Estados de la conexión | Sin probar / Conectado / Falló | Suma «Conectado con Jira (OAuth)», «Reconexión necesaria» y «Conectado con API token» | D215 |

## 2. Decisiones propuestas

| ID | Decisión | Motivo |
| --- | --- | --- |
| D209 | **OAuth 2.0 (3LO) es el método recomendado; el API token queda como alternativa.** La pantalla Conexión ofrece dos métodos excluyentes: «Conectar con Jira» (OAuth) y «Conectar con API token» (flujo actual sin cambios). Solo hay **un método activo** (`configuracion_jira.metodo`: `OAUTH` o `API_TOKEN`; las filas existentes quedan `API_TOKEN`). Quality360 no intenta crear ni leer API tokens (Atlassian no lo permite) | Decisión del usuario; requisito de seguridad de Atlassian |
| D210 | **El retorno de Atlassian cae en una ruta del portal**, `<PORTAL>/admin/integraciones/jira/oauth/retorno` (provisional), protegida por la sesión y el rol Administrador. El portal toma `code`, `state` o `error` de la dirección, **limpia la dirección** (`history.replaceState`, para que el código no quede en el historial ni en una recarga) y envía `POST /v1/integraciones/jira/oauth/retorno` a la pasarela con la sesión. **No hay ninguna ruta pública** de la pasarela ni de Integraciones para el retorno. La `redirect_uri` la arma el servidor desde su configuración; el cliente no la manda. Si no hay sesión al volver, el portal lleva a iniciar sesión y la conexión se reintenta desde el botón (el `code` no se guarda en el navegador) | Una sola superficie autenticada; el código de autorización no se filtra |
| D211 | **`state` de un solo uso.** 32 bytes aleatorios, ligado al Administrador que inició, con vencimiento de **10 minutos**, guardado **solo como hash SHA-256** en `integraciones.oauth_estado_jira` y marcado `usado_en` al consumirse (la marca y la validación van en una sola sentencia atómica, para que dos retornos con el mismo `state` no pasen ambos). Un `state` desconocido, vencido, ya usado o de otro Administrador responde 400 `JIRA_OAUTH_ESTADO_INVALIDO` con un mensaje único (no distingue la causa) y no llama a Atlassian. Se purgan los estados con más de 1 día | Protege contra falsificación de petición (CSRF) y repetición |
| D212 | **Elección del sitio.** Tras canjear el `code`, Integraciones llama a `accessible-resources` y filtra los sitios cuyo `scopes` incluya algún permiso de Jira (no de Confluence u otros) y cuya `url` cumpla `^https://[a-z0-9][a-z0-9-]{0,62}\.atlassian\.net$` (D95, solo para mostrar y guardar; no se llama a esa URL). Cero sitios válidos: error `JIRA_OAUTH_SIN_SITIO`. Uno: se toma. Varios: si uno coincide con el sitio ya configurado se prefiere; si no, el Administrador elige de una lista (nombre y URL). El `cloudid` se valida con el formato UUID antes de armar cualquier dirección saliente; se guarda con `sitio_url` y nombre | Evita llamar a un sitio equivocado y cierra la entrada de datos no confiables a la dirección de la API |
| D213 | **Hosts fijos y sin SSRF.** En OAuth, los únicos destinos salientes son `https://auth.atlassian.com` y `https://api.atlassian.com`, escritos en el servicio, más el `cloudid` ya validado. No se siguen redirecciones; el cuerpo de un error de Atlassian nunca se lee ni se propaga (puede repetir tokens o el `code`). Para las pruebas existen `JIRA_OAUTH_URL_AUTORIZACION`/`JIRA_OAUTH_URL_API` (nombres provisionales) que solo se aceptan con `INTEGRACIONES_PERMITIR_HOST_PRUEBA=true` y se **ignoran con `NODE_ENV=production`** (mismo criterio que D95 y D90). D95 sigue rigiendo el método API token | Mantiene el compromiso de D95 |
| D214 | **Credenciales cifradas, renovación y serialización.** Token de acceso y de renovación se cifran con el mismo AES-256-GCM y la misma llave `INTEGRACIONES_LLAVE_CIFRADO` (D94/D128), con dato asociado distinto por campo (`q360:jira:oauth:acceso:v1`, `q360:jira:oauth:renovacion:v1`), IV aleatorio por cifrado y `llave_version`. Se guarda el vencimiento del token de acceso (`acceso_expira_en`) y la fecha de la última renovación. **Renovación:** antes de cada llamada a Jira, si faltan menos de 5 minutos para el vencimiento, se renueva. Como la renovación **rota** el token, dos renovaciones simultáneas (varias funciones de Vercel) romperían la conexión; por eso se hace dentro de **una transacción que bloquea la fila** (`SELECT … FOR UPDATE` en SQL crudo con el esquema calificado, usando solo el cliente de la transacción: `connection_limit=1`, DEF-E5C-05). Quien llega segundo espera el candado, vuelve a leer, ve el token ya renovado y lo usa sin llamar a Atlassian. **Orden obligatorio: guardar el token de renovación nuevo antes de usar el token de acceso nuevo**; si el guardado falla, no se usa el acceso. Espera máxima del candado y de la llamada de renovación: 3 s (dentro del presupuesto de 8 s, D96). Un 401 de Jira con un acceso que se creía vigente provoca **una** renovación y **un** reintento, nunca más | La rotación de Atlassian es la mayor causa de desconexiones silenciosas |
| D215 | **Estados de la conexión y fallo de renovación.** `GET configuracion` suma `metodo` y `oauth { estado, cuenta, sitio {id, nombre, url}, scopes, conectadoEn, renovadoEn, accesoExpiraEn, requiereElegirSitio }`. Estados de OAuth: `CONECTADA`, `PENDIENTE_SITIO`, `RECONEXION_NECESARIA`. Etiquetas: «Conectado con Jira (OAuth) como <cuenta> en <sitio>», «Reconexión necesaria», «Conectado con API token». Solo un `invalid_grant` (o un 400/401 definitivo del endpoint de token) pasa a `RECONEXION_NECESARIA` y borra los tokens; un fallo **transitorio** (red, tiempo agotado, 5xx de Atlassian, 429) **no** toca la credencial: se informa `JIRA_NO_DISPONIBLE`/`JIRA_TIEMPO_AGOTADO` y se reintenta después. Con reconexión necesaria, probar, consultar y sincronizar responden 200 con `error.codigo = JIRA_RECONEXION_NECESARIA` (D105) y sugerencia «Ir a Conexión» | Distinguir lo permanente de lo pasajero |
| D216 | **Variables opcionales y no fatales** (patrón D127/D129): `JIRA_OAUTH_CLIENT_ID`, `JIRA_OAUTH_CLIENT_SECRET` y `JIRA_OAUTH_REDIRECT_URI` (nombres provisionales). Si falta alguna, Integraciones arranca igual, `GET configuracion` informa `oauthDisponible: false` y las rutas de OAuth responden 503 `JIRA_OAUTH_NO_CONFIGURADO`. El portal muestra «Conectar con Jira» **deshabilitado** (`aria-disabled`, para que el motivo se lea) con el texto «La conexión automática aún no está habilitada en el servidor. Usa la conexión con API token o pide a quien despliega que cargue las credenciales de la app de Atlassian», y el API token sigue disponible. El Client secret nunca sale del servidor: ni en respuestas, ni en registros, ni en auditoría, ni en el portal. También exige la llave de cifrado (si falta, 503 `LLAVE_CIFRADO_NO_DISPONIBLE` como hoy) | Quality360 no depende de que Atlassian esté configurado |
| D217 | **Desconectar y auditoría.** «Desconectar» (solo Administrador, con confirmación) **borra** los tokens cifrados y deja la conexión en «Sin conectar»; no llama a Atlassian (Atlassian no ofrece una revocación para esta app). La pantalla indica cómo quitar el permiso desde la cuenta de Atlassian (sección 8, paso final). Si el método activo era OAuth, la configuración queda sin credencial: consultar y sincronizar responden `JIRA_NO_CONFIGURADO` hasta reconectar o pasar a API token. Auditoría de solo inserción en `integraciones.evento_oauth_jira` (actor, fecha, tipo, sitio, cuenta, código de fallo; nunca tokens, `code`, `state` ni secretos): `CONECTAR_OAUTH`, `RECONECTAR`, `DESCONECTAR`, `REFRESCO_FALLIDO` (una vez por transición, no por intento). Los eventos se muestran en la lista de «Cambios de configuración» de la pestaña | Trazabilidad sin filtrar secretos |
| D218 | **Permisos mínimos.** Scopes pedidos: `read:jira-work`, `read:jira-user` y `offline_access` (lista provisional; `q360-arquitecto` la confirma contra los cuatro endpoints que se usan y, si hace falta, cambia a scopes granulares). Nunca se piden permisos de escritura. Tras el canje se compara lo concedido (`scope` de la respuesta y `scopes` del sitio) con lo requerido: si falta alguno, `JIRA_OAUTH_PERMISOS_INSUFICIENTES`, no se guarda nada y se informa cuál falta. Si el usuario pierde permisos en el proyecto, Jira responde 403/404 y se aplican los códigos existentes (`JIRA_SIN_PERMISO`, `JIRA_PROYECTO_NO_ENCONTRADO`) con un texto que aclara que se refiere a la cuenta conectada | Principio de mínimo privilegio |

Preguntas que bloquean: **ninguna.** Las dudas razonables quedan como supuestos reversibles (sección 11).

## 3. Mapa de cobertura

| Necesidad | Qué existe | Qué falta | HDU |
| --- | --- | --- | --- |
| Credencial sin copiar y pegar | Solo API token (D94) | Autorización, canje, sitios, renovación, almacenamiento | E5-B08, E5-F08 |
| Probar y consultar con ambos métodos | Cliente Jira con autenticación básica contra `<sitio>.atlassian.net` | Credencial de dos formas y dirección `api.atlassian.com/ex/jira/{cloudid}` | E5-B01, E5-B02 (ajuste) |
| Pantalla de conexión | Formulario con API token | Selector de método, botón, retorno, estados, desconectar | E5-F08, E5-F01 (ajuste), E5-F02 (ajuste) |
| Pruebas sin Atlassian real | Jira falso con autenticación básica | Atlassian falso (autorización, token, sitios) y rutas `ex/jira/{cloudid}` en el Jira falso | Sección 9 |

Dependencias de construcción: E5-B08 → E5-B01 (ajuste) → E5-B02 (ajuste); E5-F08 requiere E5-B08; el ajuste de E5-F02 requiere E5-B02.

## 4. Catálogos

### 4.1 Códigos nuevos (se suman a la sección 4.4 de `e5-integracion-jira.md`)

| Código | HTTP | Cuándo | Mensaje | Sugerencia |
| --- | --- | --- | --- | --- |
| `JIRA_OAUTH_NO_CONFIGURADO` | 503 | Faltan Client ID, Client secret o URL de retorno | «La conexión automática con Jira no está habilitada en el servidor.» | Usar API token o avisar a quien despliega |
| `JIRA_OAUTH_ESTADO_INVALIDO` | 400 | `state` desconocido, vencido, usado o de otro Administrador | «La autorización venció o no es válida. Vuelve a pulsar «Conectar con Jira».» | Reiniciar |
| `JIRA_OAUTH_CONSENTIMIENTO_RECHAZADO` | 200 en el cuerpo del retorno | Atlassian volvió con `error=access_denied` (el usuario canceló) | «No aceptaste los permisos en Atlassian. No se conectó nada.» | Reintentar |
| `JIRA_OAUTH_CANJE_FALLIDO` | 200 en el cuerpo | Atlassian rechazó el `code` (vencido, ya usado, secreto mal cargado) | «Atlassian no aceptó la autorización. Vuelve a intentarlo.» | Reintentar; si persiste, revisar el Client ID y el secreto en el servidor |
| `JIRA_OAUTH_SIN_SITIO` | 200 en el cuerpo | La cuenta no tiene ningún sitio de Jira Cloud accesible | «Tu cuenta de Atlassian no tiene acceso a ningún sitio de Jira.» | Usar otra cuenta |
| `JIRA_OAUTH_PERMISOS_INSUFICIENTES` | 200 en el cuerpo | Faltan permisos concedidos | «Faltan permisos en Atlassian: <lista>. Acepta todos los permisos solicitados.» | Reintentar |
| `JIRA_RECONEXION_NECESARIA` | 200 en probar, consultar y sincronizar | La renovación falló con `invalid_grant` o venció | «La conexión con Jira venció. Vuelve a conectar con Jira.» | Ir a Conexión |
| `JIRA_OAUTH_SITIO_NO_VALIDO` | 400 | El sitio elegido no es uno de los candidatos guardados | «El sitio elegido no es válido.» | Reiniciar |
| `JIRA_OAUTH_SIN_CONEXION` | 409 | Se pide elegir sitio o desconectar sin una conexión pendiente | «No hay una conexión pendiente.» | Conectar |

Los fallos transitorios de Atlassian reutilizan `JIRA_NO_DISPONIBLE`, `JIRA_TIEMPO_AGOTADO` y `JIRA_LIMITE_DE_TASA`. Todos los mensajes son fijos del servicio.

## 5. Modelo de datos (migración `<fecha>_e5_oauth_jira`, solo esquema `integraciones`, sin llaves foráneas a otros esquemas, D24)

**`configuracion_jira` (cambios):** `metodo varchar(9) NOT NULL DEFAULT 'API_TOKEN'` con CHECK `API_TOKEN|OAUTH`; `correo`, `token_cifrado`, `token_iv`, `token_tag`, `token_ultimos4` pasan a admitir `NULL` con un CHECK que los exige no nulos cuando `metodo = 'API_TOKEN'` y los exige nulos cuando `metodo = 'OAUTH'`. `sitio_url` se conserva (en OAuth es el del sitio elegido, para mostrarlo y para la instantánea `sitio_host` del historial). Las filas existentes quedan `API_TOKEN` sin pérdida.

**`conexion_oauth_jira`** (una sola fila, `id smallint PRIMARY KEY CHECK (id = 1)`):

| Columna | Tipo | Regla |
| --- | --- | --- |
| `estado` | `varchar(20) NOT NULL` | CHECK `CONECTADA|PENDIENTE_SITIO|RECONEXION_NECESARIA` |
| `cloud_id` | `varchar(36) NULL` | UUID validado; nulo en `PENDIENTE_SITIO` |
| `sitio_url`, `sitio_nombre` | `varchar(100) NULL`, `varchar(150) NULL` | D212 |
| `sitios_candidatos` | `jsonb NULL` | Solo `{id, nombre, url}` mientras `PENDIENTE_SITIO`; sin secretos |
| `cuenta_id`, `cuenta_nombre` | `varchar(128) NULL`, `varchar(150) NULL` | Cuenta de Atlassian conectada |
| `scopes_concedidos` | `varchar(400) NULL` | |
| `renovacion_cifrada`, `renovacion_iv`, `renovacion_tag` | `bytea NULL` | AES-256-GCM (D214); nulos si `RECONEXION_NECESARIA` |
| `acceso_cifrado`, `acceso_iv`, `acceso_tag` | `bytea NULL` | Idem |
| `acceso_expira_en`, `renovado_en` | `timestamptz NULL` | |
| `llave_version` | `smallint NOT NULL DEFAULT 1` | |
| `conectado_por_id`, `conectado_por_nombre`, `conectado_en` | `uuid`, `varchar(150)`, `timestamptz` NOT NULL | |

**`oauth_estado_jira`:** `id uuid PK`, `estado_hash char(64) NOT NULL UNIQUE`, `actor_id uuid NOT NULL`, `creado_en`, `expira_en`, `usado_en timestamptz NULL`. `REVOKE DELETE` salvo la purga por el propio servicio.

**`evento_oauth_jira`** (solo inserción): `id_evento uuid PK`, `fecha`, `actor_id`, `actor_nombre` (el sistema para `REFRESCO_FALLIDO`), `tipo varchar(20)` (CHECK con los cuatro de D217), `sitio_nombre`, `cuenta_nombre`, `codigo varchar(40) NULL`. `REVOKE UPDATE, DELETE`.

La migración y el RLS se aplican como las de E5 (D13, `infrastructure/nube`); en la nube se verifica y se aplica antes de desplegar (Supabase se pausa por inactividad).

## 6. Contratos y rutas

Contrato dueño `q360-arquitecto`. Cambios **aditivos**.

| Método y ruta (provisional) | Uso | Roles |
| --- | --- | --- |
| `POST /v1/integraciones/jira/oauth/iniciar` | Crea el `state` y devuelve `{urlAutorizacion, expiraEn}`. 503 `JIRA_OAUTH_NO_CONFIGURADO` | Administrador |
| `POST /v1/integraciones/jira/oauth/retorno` | Cuerpo `{code?, state, error?}`. Canjea, elige sitio y guarda. 200 `{resultado: CONECTADA\|ELEGIR_SITIO\|ERROR, oauth?, sitios?, error?}`; 400 `JIRA_OAUTH_ESTADO_INVALIDO` | Administrador |
| `POST /v1/integraciones/jira/oauth/sitio` | Cuerpo `{sitioId}`: confirma el sitio elegido | Administrador |
| `DELETE /v1/integraciones/jira/oauth` | Desconecta (D217). 204 | Administrador |
| `GET /v1/integraciones/jira/configuracion` (cambia) | Suma `metodo`, `oauthDisponible`, `oauth{…}` (D215); el resto igual | Administrador |
| `PUT .../configuracion` y `POST .../configuracion/probar` (cambian) | Aceptan `metodo`. Con `OAUTH`, no piden `sitio`, `correo` ni `token`: usan la conexión OAuth (409 `JIRA_NO_CONFIGURADO` si no hay). Con `API_TOKEN`, igual que hoy | Administrador |
| `GET .../configuracion/eventos` (cambia) | Incluye los eventos OAuth de D217 | Administrador |

- **`contracts/integraciones.v1.yaml`:** rutas y esquemas nuevos, `metodo`, `oauth`, `oauthDisponible`, y los códigos de la sección 4.1 en el catálogo de errores. Marcar como secretos a `code`, `state` y cualquier campo de token (que no vuelven en ninguna respuesta).
- **`contracts/gateway.v1.yaml`:** cuatro rutas explícitas nuevas hacia Integraciones, todas con sesión y rol Administrador; ninguna sin sesión; `/v1/interno/*` sigue sin publicarse. El gateway no registra el cuerpo de `oauth/retorno`.
- **`contracts/organizacion.v1.yaml`:** sin cambios.
- Orden de validación (como en E5): 401 → 403 → 400 → 503 (variables) → 409 → ejecución.

## 7. Impacto por servicio

| Servicio | Cambio |
| --- | --- |
| **Integraciones** (`services/integraciones`) | Dueño de todo. Nuevo cliente OAuth (autorización, canje, renovación, sitios) con los hosts fijos de D213; el puerto `FuenteJira` recibe una credencial de dos formas (básica o Bearer + `cloudid`) y `ClienteJiraHttp` arma la dirección según el método y reintenta una vez ante 401 (D214); `ConfiguracionAplicacion` suma conectar, elegir sitio, desconectar, probar y guardar con `metodo`; repositorio de la conexión con el bloqueo de fila (solo el cliente de la transacción); configuración opcional de las tres variables; auditoría `evento_oauth_jira`. `consulta`, `archivos` y `sincronización` no cambian de lógica: obtienen la credencial por el mismo puerto |
| **Gateway** | Cuatro rutas explícitas con sesión y rol Administrador; cuerpo de `oauth/retorno` fuera de los registros |
| **Web** (`apps/web`) | Pestaña Conexión: selector de método, botón y estados (sección 10); página de retorno `/admin/integraciones/jira/oauth/retorno` (solo Administrador); cliente de la API; mensajes y `data-testid` nuevos. Se conserva el formulario del API token y sus `data-testid` |
| **Organización** | **Ninguno.** El perfil del actor y la validación del destino ya existen. No se tocan roles, ámbitos ni la auditoría de usuarios |
| **Servicios de QE, Auditor, Impedimentos, Certificaciones** | Ninguno (D93: solo el Administrador ve y opera la conexión) |
| **Infraestructura** | Variables nuevas en el proyecto de Vercel de Integraciones (sección 8); `infrastructure/nube` con la migración y el RLS; documentar las variables en `.env.example` sin valores |
| **QA** | Atlassian falso y ampliación del Jira falso (sección 9); regresión de E5-F01/E5-B01 con API token |

### 7.1 Efecto sobre lo certificado

Ningún resultado esperado certificado cambia. El método API token conserva sus escenarios, códigos y mensajes (E5-F01-T01 a T11, E5-B01-T01 a T12). Los cambios de la pantalla son **aditivos** (selector, botón, lista de eventos con más tipos): `q360-qa` conserva los `data-testid` existentes (`form-jira`, `campo-token`, `token-estado`, `chip-conexion`, `error-conexion`, `boton-probar-guardar`) y, para que la certificación siga válida sin tocar los casos, el método API token es el que está seleccionado cuando existe una configuración con API token y la pestaña abre sin pestañas ni pasos adicionales para quien no usa OAuth. Sin configuración y con OAuth disponible, la pestaña abre en «Conectar con Jira» (el ajuste que afecta a E5-F01-T01 se marca en E5-F01). No se cambia el menú, las rutas existentes ni los demás portales. Se suma una ruta nueva (`/admin/integraciones/jira/oauth/retorno`) a la matriz de acceso de E7-F01 (otros roles: acceso denegado, D41).

## 8. Guía para el usuario: registrar la app en Atlassian y cargar las variables en Vercel

Hazlo tú; Quality360 no te pedirá el Client secret en ningún momento y **no debes pegarlo en el chat, en un documento ni en un commit**. Los valores entre `<…>` los fija el arquitecto antes de la construcción.

### 8.1 Registrar la app

1. Entra con la cuenta que usará la integración (para el piloto, la dueña de `jseguelh.atlassian.net`) a `https://developer.atlassian.com/console/myapps/`.
2. **Create** → **OAuth 2.0 integration**. Nombre: `Quality360`. Acepta los términos y crea.
3. Menú **Permissions** → **Jira API** → **Add** → **Configure**. Agrega solo lectura: los permisos clásicos «View Jira issue data» (`read:jira-work`) y «View user profile» (`read:jira-user`). No agregues permisos de escritura. (`offline_access` no se marca aquí: la aplicación lo pide al autorizar.)
4. Menú **Authorization** → **OAuth 2.0 (3LO)** → **Add** → en **Callback URL** escribe exactamente: `<PORTAL>/admin/integraciones/jira/oauth/retorno` (por ejemplo `https://<tu-portal>.vercel.app/admin/integraciones/jira/oauth/retorno`; sin barra final, sin parámetros). Guarda.
5. Menú **Settings**: copia el **Client ID** y el **Secret** (visible una vez; si lo pierdes, se genera otro). Guárdalos en tu gestor de contraseñas.
6. Menú **Distribution** (solo si otra cuenta distinta del dueño debe conectar): activa **Enable sharing**. Esa persona verá un aviso de que Atlassian no revisó la app; es esperado. Si solo conecta el dueño, déjala privada.
7. Si el portal local usa otra dirección (`http://localhost:5173`), verifica si la consola admite varias URL de callback; si admite una sola, usa una app aparte para local o prueba solo con el Atlassian simulado (las pruebas automáticas no lo necesitan).

### 8.2 Cargar las variables en Vercel (proyecto `quality360-integraciones`)

1. Vercel → proyecto de Integraciones → **Settings** → **Environment Variables**.
2. Agrega, para **Production** (y Preview si lo usas), marcando **Sensitive** en las dos primeras:

| Nombre (provisional) | Valor |
| --- | --- |
| `JIRA_OAUTH_CLIENT_ID` | El Client ID del paso 5 |
| `JIRA_OAUTH_CLIENT_SECRET` | El Secret del paso 5 |
| `JIRA_OAUTH_REDIRECT_URI` | La misma URL del paso 4 (debe coincidir letra por letra) |

3. Confirma que `INTEGRACIONES_LLAVE_CIFRADO` ya existe (sin ella la integración no cifra nada).
4. Vuelve a desplegar Integraciones (**Deployments** → **Redeploy**), porque las variables se leen al arrancar.
5. En Quality360, abre Integraciones → Conexión: el botón «Conectar con Jira» debe estar habilitado. Si aparece deshabilitado, falta o está mal una de las tres variables.

### 8.3 Primera conexión (prueba real E5-MAN-02) y revocación

1. Pulsa «Conectar con Jira», inicia sesión en Atlassian y acepta. Debes volver a Quality360 con «Conectado con Jira (OAuth) como <tu cuenta> en jseguelh».
2. Elige el proyecto y el destino, y pulsa «Probar y guardar»; luego prueba «Consultar Jira».
3. Para **quitar el acceso** de Quality360: en `https://id.atlassian.com/` → **Perfil y visibilidad** → **Apps conectadas** (o desde la configuración de tu cuenta), busca `Quality360` y revoca. Pulsar «Desconectar» en Quality360 borra las credenciales guardadas, pero el permiso en Atlassian se retira desde allí.

## 9. Atlassian simulado y fixture (dueño `q360-qa`)

Un servidor falso en `tests/support/atlassian-falso/` (sin dependencias, junto al Jira falso del puerto 4010) que imita:

| Endpoint del falso | Comportamiento |
| --- | --- |
| `GET /authorize` | Valida `client_id`, `redirect_uri` y `scope`; con **consentimiento automático** redirige de inmediato a la `redirect_uri` con `code` y el mismo `state` (modo `CONSENTIMIENTO_RECHAZADO`: con `error=access_denied` y el `state`) |
| `POST /oauth/token` | `authorization_code`: canjea un `code` de un solo uso. `refresh_token`: devuelve un token nuevo, **invalida el anterior de inmediato** (para detectar a quien no guarda el nuevo) y cuenta cada renovación. `expires_in` configurable (para forzar renovaciones sin esperar 1 hora) |
| `GET /oauth/token/accessible-resources` | Con Bearer válido, devuelve los sitios del modo (uno, varios, ninguno, sin scopes de Jira) |
| `ANY /ex/jira/{cloudid}/rest/api/3/...` | Apunta al Jira falso existente: exige `Authorization: Bearer` válido y el `cloudid` correcto; reutiliza `myself`, `project`, `field` y `search/jql` y los modos de falla actuales |

Modos: `NORMAL`, `CONSENTIMIENTO_RECHAZADO`, `VARIOS_SITIOS`, `SIN_SITIO`, `SIN_SCOPES_JIRA`, `SCOPES_INSUFICIENTES`, `CANJE_RECHAZADO`, `RENOVACION_INVALID_GRANT` (403), `RENOVACION_CAIDA` (5xx), `ACCESO_CORTO`, `ACCESO_REVOCADO` (401 en la API), `SIN_PERMISO_PROYECTO` (404/403 en el proyecto). Control como el del Jira falso: `POST /__control`, `POST /__reset`, `GET /__solicitudes` (método, ruta, si el Bearer era válido y cuántas renovaciones; nunca valores de tokens ni del secreto). El Atlassian falso solo se conecta si `INTEGRACIONES_PERMITIR_HOST_PRUEBA=true` y fuera de producción (D213). La prueba real contra Atlassian es **E5-MAN-02** (manual, del usuario, con `jseguelh.atlassian.net`); ninguna prueba automática depende de Atlassian.

## 10. HDU de frontend

Identificadores de prueba nuevos: `selector-metodo`, `opcion-oauth`, `opcion-api-token`, `boton-conectar-jira`, `aviso-oauth-no-disponible`, `estado-oauth` (con `data-estado`), `cuenta-oauth`, `sitio-oauth`, `lista-sitios`, `boton-elegir-sitio`, `boton-desconectar-jira`, `confirmar-desconexion`, `aviso-reconexion`, `boton-reconectar-jira`, `error-oauth` (con `data-codigo`), `pagina-retorno-oauth`, `estado-retorno` (con `data-estado`), `ayuda-revocar-jira`.

### E5-F08 · Administrador (nueva): conectar con Jira desde Quality360

Quiero conectar Quality360 con Jira pulsando un botón y aceptando permisos de solo lectura una vez. Para no copiar ni pegar ningún token y que la conexión se mantenga sola.

| # | Criterio | Contexto (Dado) | Evento (Cuando) | Resultado esperado (Entonces) |
| --- | --- | --- | --- | --- |
| 1 | Conexión exitosa | El Administrador está en Conexión, las variables OAuth están cargadas y la cuenta de Atlassian tiene un solo sitio de Jira. | Pulsa «Conectar con Jira», acepta en Atlassian y vuelve a Quality360. | Una página breve de retorno dice «Conectando con Jira…» y lleva a Conexión, que muestra «Conectado con Jira (OAuth) como <cuenta> en <sitio>». No se pidió ningún token. La dirección del navegador ya no contiene `code` ni `state`. |
| 2 | Consentimiento cancelado | El Administrador está en Atlassian. | Pulsa «Cancelar» en la pantalla de permisos. | Vuelve a Conexión con «No aceptaste los permisos en Atlassian. No se conectó nada.», el estado anterior no cambia y puede reintentar. |
| 3 | `state` inválido o vencido | El Administrador abre el enlace de retorno con un `state` ya usado, vencido (más de 10 minutos) o inventado. | La página de retorno lo procesa. | Mensaje «La autorización venció o no es válida. Vuelve a pulsar «Conectar con Jira».» con el botón visible; no se conecta nada y no se revela cuál fue la causa. |
| 4 | Varios sitios | La cuenta ve varios sitios de Jira. | Vuelve de Atlassian. | Aparece la lista de sitios (nombre y URL, con el sitio ya configurado preseleccionado si coincide); el Administrador elige uno y pulsa «Usar este sitio», y la conexión queda con ese sitio. Mientras no elige, el estado es «Falta elegir el sitio» y no se puede consultar. |
| 5 | Cuenta sin Jira | La cuenta de Atlassian no tiene ningún sitio de Jira (o solo otros productos). | Vuelve de Atlassian. | «Tu cuenta de Atlassian no tiene acceso a ningún sitio de Jira.» No se guarda nada. |
| 6 | Permisos insuficientes | Atlassian concedió menos permisos de los solicitados. | Vuelve de Atlassian. | «Faltan permisos en Atlassian: <lista>. Acepta todos los permisos solicitados.» No se guarda nada. |
| 7 | Servidor sin credenciales de la app | Faltan `JIRA_OAUTH_*` en el servidor. | Abre Conexión. | «Conectar con Jira» aparece **deshabilitado** con `aria-disabled` y el texto explicativo (D216); el método API token funciona igual; ningún mensaje muestra nombres de variables ni valores. |
| 8 | Reconexión necesaria | La renovación venció o falló con `invalid_grant`. | Abre Conexión o pulsa «Consultar Jira». | Conexión muestra «Reconexión necesaria» con el botón «Volver a conectar»; «Consultar Jira» muestra el error `JIRA_RECONEXION_NECESARIA` con el enlace a Conexión. Lo ya consultado y creado no se toca. |
| 9 | Cambio de método | Hay una conexión con API token (o con OAuth). | Elige el otro método y lo completa. | Al pasar de API token a OAuth, el API token sigue siendo el activo **hasta que** la conexión OAuth esté lista y «Probar y guardar» pase; entonces el chip cambia a «Conectado con Jira (OAuth)…» y el token deja de usarse. Al volver a API token, se pide el token (nunca se rellena), se prueba y guarda, y se borran las credenciales OAuth guardadas. Si la prueba falla, se conserva el método anterior (D112). |
| 10 | Probar y guardar con OAuth | Hay conexión OAuth y se elige proyecto y destino. | Pulsa «Probar y guardar». | Mensaje «Conexión exitosa con Jira como <cuenta>», se guarda y el estado es «Conectado con Jira (OAuth)…». Si la cuenta no tiene permiso en el proyecto: «La cuenta de Jira conectada no tiene permiso para leer este proyecto.» (o «No encontramos el proyecto…» con la aclaración de que puede ser un tema de permisos de esa cuenta); no se guarda y se conserva lo anterior. |
| 11 | Desconectar | Hay conexión OAuth. | Pulsa «Desconectar» y confirma. | Se pide confirmación («Se borrarán las credenciales guardadas. Para quitar el permiso en Atlassian, revoca la app desde tu cuenta»); al confirmar, el estado es «Sin conectar» y se muestra cómo revocar el permiso en Atlassian. Cancelar no cambia nada. |
| 12 | Solo el Administrador | Un usuario QE, Analista o Auditor, o sin sesión. | Abre la ruta de retorno o de Conexión. | Acceso denegado (D41) o inicio de sesión; ningún botón de OAuth existe para ellos y ninguna llamada a las rutas de OAuth devuelve 200. |
| 13 | Accesibilidad y móvil | Cualquiera de los estados anteriores. | Se usa solo con teclado, con lector de pantalla y a 375 px. | Los botones, la lista de sitios y el diálogo de desconexión se operan con teclado; el diálogo atrapa el foco y devuelve el foco al botón que lo abrió; el botón deshabilitado usa `aria-disabled` y su motivo se lee; los cambios de estado se anuncian en una región `role="status"` (errores con `role="alert"`); sin desbordamiento horizontal a 375 px; sin hallazgos serios de axe en la pestaña, la página de retorno y el diálogo. |

Contenido de pantalla (pestaña «Conexión»): selector de método con «Conectar con Jira (recomendado)» y «Conectar con API token»; en OAuth, botón «Conectar con Jira», estado, cuenta, sitio, fecha de última renovación y «Desconectar»; debajo, la misma sección «Proyecto y destino de las HDU nuevas» que ya existe (proyecto, tipos de issue, célula, QE, sprint de respaldo) y «Probar y guardar»/«Probar sin guardar»; la lista de cambios incluye los eventos de D217.

Reglas de negocio: D209–D218; el portal nunca almacena tokens, `code` ni secretos (ni `localStorage` ni `sessionStorage`) y limpia la dirección de retorno al leerla; el texto «Atlassian no revisó la app» pertenece a Atlassian, no a Quality360; mientras corre el retorno el botón está deshabilitado y se muestra «Conectando…».

### E5-F01 · Administrador (modificada: conexión)

Cambios y escenarios agregados a los de `e5-integracion-jira.md` (los 3 originales, el API token y su pantalla **se mantienen**):

| # | Criterio | Contexto | Evento | Resultado esperado |
| --- | --- | --- | --- | --- |
| 4 (agregado) | Pantalla con dos métodos | Hay variables OAuth y no hay configuración guardada. | Abre Conexión. | Se ve el selector de método con OAuth recomendado; el formulario del API token está disponible al elegir «Conectar con API token» y funciona como antes (E5-F01 #1 a #3). |
| 5 (agregado) | Chip y estado según el método | Hay una configuración guardada. | Abre Conexión. | El chip dice «Conectado con API token» o «Conectado con Jira (OAuth) como <cuenta> en <sitio>» según el método activo. El campo del token solo existe en el método API token. |

Ajuste a los casos existentes: los textos del chip «Conectado» del método API token pasan a «Conectado con API token» (decisión D215). `q360-qa` actualiza el dato afirmado en E5-F01-T01 y T07; no cambia ningún resultado funcional.

### E5-F02 · Administrador (modificada: errores de consulta)

Escenario agregado: **#4** · Contexto: la conexión OAuth necesita reconexión. Evento: pulsa «Consultar Jira» o «Sincronizar». Resultado: `error-sincronizacion` con `data-codigo` `JIRA_RECONEXION_NECESARIA`, el mensaje de la sección 4.1 y el enlace «Ir a Conexión»; no se crea ni modifica ninguna HDU; la consulta abierta se conserva.

## 11. HDU de backend

### E5-B08 · Administrador (nueva): conexión OAuth con Jira y renovación de credenciales

Quiero que el sistema obtenga, guarde y renueve de forma segura la credencial de Jira mediante OAuth 2.0 (3LO). Para que la integración funcione sin que nadie copie un token y sin que se desconecte por sí sola.

| # | Criterio | Contexto (Dado) | Evento (Cuando) | Resultado esperado (Entonces) |
| --- | --- | --- | --- | --- |
| 1 | Inicio de la autorización | El Administrador tiene sesión y las variables OAuth y la llave de cifrado existen. | `POST oauth/iniciar`. | 200 con `urlAutorizacion` hacia `auth.atlassian.com/authorize` con `audience=api.atlassian.com`, `client_id`, los scopes de D218 (incluido `offline_access`), `redirect_uri` del servidor, `response_type=code`, `prompt=consent` y un `state` nuevo; en la base solo está el hash del `state`, con su vencimiento a 10 minutos. |
| 2 | Canje exitoso | `state` válido y un `code` aceptado por Atlassian; un solo sitio de Jira. | `POST oauth/retorno`. | 200 `CONECTADA`; token de acceso y de renovación guardados cifrados con IV y etiqueta propios (ninguno en claro ni en subcadena), con vencimiento; `cuenta` y `sitio` guardados; el `state` queda usado; evento `CONECTAR_OAUTH`; ni el `code` ni los tokens ni el secreto aparecen en la respuesta, registros, auditoría ni errores. |
| 3 | `state` inválido | `state` desconocido, vencido, ya usado o creado por otro Administrador. | `POST oauth/retorno`. | 400 `JIRA_OAUTH_ESTADO_INVALIDO` con el mismo mensaje en los cuatro casos; no se llama a Atlassian y nada se guarda. Dos retornos simultáneos con el mismo `state`: solo uno canjea. |
| 4 | Consentimiento cancelado o canje rechazado | Atlassian volvió con `error=access_denied`, o rechazó el `code`. | `POST oauth/retorno`. | 200 con `JIRA_OAUTH_CONSENTIMIENTO_RECHAZADO` o `JIRA_OAUTH_CANJE_FALLIDO`; el `state` queda consumido; la conexión anterior no cambia; sin textos de Atlassian en la respuesta. |
| 5 | Sitios | El canje tuvo éxito. | Se consultan los sitios accesibles. | Uno: se toma. Varios: `ELEGIR_SITIO` con la lista (id, nombre, URL), conexión en `PENDIENTE_SITIO` (sin sitio aún) y se prefiere el sitio ya configurado si coincide; `POST oauth/sitio` con un id que no es candidato: 400 `JIRA_OAUTH_SITIO_NO_VALIDO`. Ninguno con Jira: `JIRA_OAUTH_SIN_SITIO`, nada guardado. Un `cloudid` que no es UUID o una URL fuera de `*.atlassian.net`: el sitio se descarta. |
| 6 | Permisos | Lo concedido no incluye alguno de los scopes requeridos. | `POST oauth/retorno`. | `JIRA_OAUTH_PERMISOS_INSUFICIENTES` con la lista faltante; nada se guarda. |
| 7 | Renovación automática | El token de acceso vence en menos de 5 minutos. | Se prueba, consulta o sincroniza. | Se renueva una vez, se guarda el token de renovación **nuevo antes** de usar el acceso nuevo, se actualizan vencimiento y `renovado_en`, y la llamada a Jira usa el acceso nuevo. Un 401 con un acceso que se creía vigente provoca una renovación y un reintento; el segundo 401 es `JIRA_RECONEXION_NECESARIA` o `JIRA_CREDENCIAL_INVALIDA` según la causa, sin más reintentos. |
| 8 | Renovaciones simultáneas | Dos o más peticiones necesitan renovar a la vez. | Se ejecutan en paralelo. | Solo una llama a Atlassian; las demás esperan el candado de la fila, releen y usan el token ya renovado (el Atlassian falso cuenta **una** renovación y la conexión sigue `CONECTADA`). Si el candado no se obtiene en 3 s: `JIRA_TIEMPO_AGOTADO` sin tocar la credencial. |
| 9 | Renovación vencida o revocada | Atlassian responde `invalid_grant` (90 días, cambio de contraseña, revocación). | Se prueba, consulta o sincroniza. | El estado pasa a `RECONEXION_NECESARIA`, se borran los tokens, evento `REFRESCO_FALLIDO` (una sola vez) y las operaciones responden 200 `JIRA_RECONEXION_NECESARIA`; reconectar restablece y deja el evento `RECONECTAR`. |
| 10 | Atlassian no disponible | Timeout, red, 5xx o 429 al renovar. | Se prueba, consulta o sincroniza. | `JIRA_TIEMPO_AGOTADO`, `JIRA_NO_DISPONIBLE` o `JIRA_LIMITE_DE_TASA` según el caso; la credencial **no** se borra ni cambia de estado y la siguiente operación reintenta. |
| 11 | Sin credenciales de la app | Faltan las variables `JIRA_OAUTH_*`. | Se invoca cualquier ruta OAuth. | 503 `JIRA_OAUTH_NO_CONFIGURADO` sin mencionar nombres ni valores; el servicio arranca y el método API token funciona; `GET configuracion` informa `oauthDisponible: false`. Sin llave de cifrado: 503 `LLAVE_CIFRADO_NO_DISPONIBLE`. Llave distinta de la que cifró: 409 `TOKEN_NO_DESCIFRABLE` (se pide reconectar). |
| 12 | Desconexión | Hay conexión OAuth. | `DELETE oauth`. | 204; tokens y sitio borrados; evento `DESCONECTAR`; sin llamadas a Atlassian; sin conexión que borrar, 409 `JIRA_OAUTH_SIN_CONEXION`. |
| 13 | Solo Administrador | QE, Analista, Auditor o sin sesión. | Invocan las cuatro rutas. | 403 `ACCESO_DENEGADO` con cuerpo idéntico (401 sin sesión); nada cambia. No existe ninguna ruta de OAuth sin sesión. |
| 14 | Sin fugas ni SSRF | Cualquier operación. | Se inspeccionan registros, respuestas, eventos y peticiones salientes. | Ningún `code`, `state` en claro, token ni secreto aparece; las únicas direcciones salientes son los dos hosts fijos de D213 (más los falsos solo con `INTEGRACIONES_PERMITIR_HOST_PRUEBA` y fuera de producción); no se siguen redirecciones; el cuerpo de un error de Atlassian nunca se lee ni se propaga. |

Reglas de negocio: D209–D218. `connection_limit=1`: el bloqueo de fila y las escrituras de la renovación usan solo el cliente de la transacción, con SQL crudo y esquema calificado (DEF-E5C-05); no se abre una segunda conexión mientras se mantiene el candado. Orden de validación: 401 → 403 → 400 → 503 → 409 → ejecución. El gateway registra solo ruta y resultado de `oauth/retorno`.

### E5-B01 · Administrador (modificada: configuración y prueba de conexión)

Los 3 escenarios originales y el método API token **no cambian**. Cambios y escenarios agregados:

| # | Criterio | Contexto | Evento | Resultado esperado |
| --- | --- | --- | --- | --- |
| 1 (ajuste) | Cifrado | Se guarda un token (API token) o una credencial OAuth. | Se procesa. | Todo secreto se almacena cifrado (AES-256-GCM) y nunca se devuelve; del API token solo `ultimos4`; de OAuth solo cuenta, sitio, scopes y fechas. |
| 2 (ajuste) | Prueba de conexión con ambos métodos | Se solicita probar con `metodo` API token u OAuth. | Se invoca Jira. | API token: exactamente como hoy (`myself` y `project` contra `<sitio>.atlassian.net`). OAuth: las mismas dos llamadas contra `api.atlassian.com/ex/jira/{cloudid}` con Bearer (renovando antes si hace falta); mismo formato de resultado `{ok, usuarioJira, proyecto, error}`; sin exponer credenciales. |
| 4 (agregado) | Guardado con OAuth | Hay una conexión OAuth `CONECTADA` y se envía proyecto y destino. | `PUT configuracion` con `metodo: OAUTH`. | Guarda solo si la prueba pasa (D112); `correo` y token del API token quedan nulos; `sitio_url` es el del sitio OAuth; evento de configuración con `metodo` cambiado; sin conexión OAuth lista: 409 `JIRA_NO_CONFIGURADO`. |
| 5 (agregado) | Cambio de método | Hay configuración con un método. | `PUT` con el otro método. | De OAuth a API token: exige sitio, correo y token (400 si faltan); tras la prueba exitosa, se borra la conexión OAuth. De API token a OAuth: tras la prueba exitosa, el token cifrado se descarta. Si la prueba falla, ambos quedan como estaban. |
| 6 (agregado) | Sin permiso en el proyecto | La cuenta OAuth no tiene acceso al proyecto. | `probar` o `PUT`. | 200 con `ok false` y `JIRA_SIN_PERMISO` o `JIRA_PROYECTO_NO_ENCONTRADO` (Jira puede responder 404 cuando falta permiso); no se guarda; la conexión OAuth sigue `CONECTADA`. |

### E5-B02 · Administrador (modificada: consulta y sincronización)

Escenario agregado: **#7** · Contexto: método OAuth activo, `CONECTADA`. Evento: `consultas` o `sincronizaciones`. Resultado: la búsqueda, la detección de campos y el detalle usan `api.atlassian.com/ex/jira/{cloudid}` con Bearer, con la misma consulta, tope de 100, presupuesto de 8 s y manejo del 429 que hoy; la renovación (D214) cabe en el presupuesto; con `RECONEXION_NECESARIA` responde 200 `JIRA_RECONEXION_NECESARIA` sin crear ejecución parcial. Con el método API token, todo igual que hoy. Los límites de D96 y D135 no cambian.

## 12. Supuestos reversibles (no bloquean)

| # | Supuesto | Si no se cumple |
| --- | --- | --- |
| S1 | Los scopes `read:jira-work`, `read:jira-user` y `offline_access` bastan para `myself`, `project`, `field` y `search/jql` | El arquitecto ajusta la lista o pasa a scopes granulares |
| S2 | La consola de Atlassian acepta la URL de callback del portal desplegado | Se registra otra app para cada entorno |
| S3 | `/myself` devuelve `displayName` con el scope de usuario | Se muestra el correo o el `accountId` (ya cubierto por el cliente actual) |
| S4 | El plan gratuito de Vercel aguanta el candado de 3 s sin agotar el presupuesto de 8 s | Se reduce el tiempo del candado y se devuelve `JIRA_TIEMPO_AGOTADO` |
| S5 | Con uso mensual, el token de renovación no llega a 90 días inactivo | Mejora futura fuera de alcance: una tarea programada gratuita que renueve sin que nadie consulte (hoy D96 prohíbe tareas programadas) |
| S6 | Una organización de Atlassian puede exigir aprobación de apps de terceros | El Administrador de Atlassian aprueba la app o se usa el método API token |

## 13. Riesgos

| Riesgo | Mitigación |
| --- | --- |
| Perder la conexión por una renovación que no se guarda | Candado de fila, orden «guardar antes de usar» y pruebas de concurrencia con el falso que invalida el token anterior (D214) |
| Filtrar el `code` o un token por la dirección, el historial del navegador o los registros | El portal limpia la dirección; el gateway no registra el cuerpo; mensajes fijos (D210, D213) |
| App privada: otra cuenta no puede conectar | Documentado en la guía (8.1 paso 6) |
| Atlassian cambia los plazos o permisos | Los valores están en el servicio y en esta página, no en la base; el arquitecto los revisa en cada despliegue |
| Supabase pausado | La conexión y la renovación responden 503 como el resto de E5 (D110); al reanudar, el token de renovación sigue vigente si pasaron menos de 90 días |

## 14. Casos de prueba manuales

| ID | Tipo | Escenario | Pasos | Resultado esperado |
| --- | --- | --- | --- | --- |
| E5-MAN-02 | manual (usuario) | E5-F08 #1, E5-B08 #2, #7 | Registrar la app y cargar las variables (sección 8); conectar con `jseguelh.atlassian.net`; elegir proyecto; «Probar y guardar»; «Consultar Jira»; esperar más de 1 hora y volver a consultar; «Desconectar» y revocar la app en Atlassian | Conexión sin copiar ningún token; la consulta funciona antes y después de la hora (renovación automática); tras desconectar, queda «Sin conectar»; la app desaparece de las apps conectadas al revocarla |

## 15. Trazabilidad

| Pedido o decisión del usuario | HDU | Decisiones |
| --- | --- | --- |
| Traer el token automáticamente, sin copiar y pegar | E5-F08, E5-B08 | D209–D214 |
| Botón «Conectar con Jira», aceptar una vez, renovación solo | E5-F08 #1, E5-B08 #2 y #7 | D210, D214 |
| API token como alternativa | E5-F01 #4 y #5, E5-B01 #4 y #5, E5-F08 #9 | D209 |
| Lo certificado no cambia | Sección 7.1 | D209 |
| El usuario registra la app y carga las variables; Quality360 no ve el secreto | Sección 8, E5-F08 #7, E5-B08 #11 y #14 | D216 |
