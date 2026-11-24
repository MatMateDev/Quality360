# Certificación E5 · Conectar con Jira por OAuth 2.0 (3LO) (Quality360)

Dueño: `q360-qa`. Cambio certificado: «E5 · Conexión con Jira por OAuth 2.0 (3LO)» (`docs/backlog/e5-oauth-jira.md`, D209–D218, ADR 0019, plan `docs/arquitectura/e5-oauth-plan-construccion.md`), sobre el commit integrado `aac1cd7` (integraciones JO1–JO8 `79e5cfb`, gateway GO1 `bb984ba`, portal FO1–FO7 `64b3ba6`, infra IN1 `a222ab3` y el Atlassian simulado `cbef860`). Ronda 1 de 3.

> **Ronda 2 (sobre `5a059f8`, que contiene `059a8f8`): los 2 defectos están cerrados y las 2 HDU nuevas pasan a CERTIFICADA. Dictamen: CERTIFICADA. Ver «Ronda 2» al final.** Lo que sigue es la ronda 1.

## Dictamen (ronda 1)

**NO CERTIFICADA.** 25 de los 27 escenarios nuevos (14 de E5-B08 y 13 de E5-F08) pasan y las 2 HDU nuevas quedan **OBSERVADAS**, cada una por un defecto de severidad baja (DEF-E5O-01 de `q360-integraciones` y DEF-E5O-02 de `q360-frontend`). Ninguno toca seguridad: no hay fugas, el aislamiento y los permisos funcionan, la renovación serializada pasa con `connection_limit=1` y la regresión de E5 no cambió de resultado. Las 6 HDU modificadas quedan certificadas.

| HDU | Escenarios | Dictamen | Fundamento |
| --- | --- | --- | --- |
| E5-B08 · conexión OAuth y renovación | 14 | **OBSERVADA** | 13 de 14. #9 pasa salvo una afirmación: en `RECONEXION_NECESARIA` el contrato exige `oauth.descifrable: false` y el servicio responde `true` (DEF-E5O-01). El resto de #9 (tokens borrados, un solo `REFRESCO_FALLIDO`, reconectar, `RECONECTAR`) pasa |
| E5-F08 · conectar desde Quality360 | 13 | **OBSERVADA** | 12 de 13. #10 falla en el texto de «proyecto no encontrado» con OAuth cuando aún no hay configuración guardada (DEF-E5O-02). El resto de #10 (guardar con OAuth, no guardar ante el error, conexión intacta) pasa |
| E5-B01 (ajustada, +#4, #5, #6) | 3 + 3 | **CERTIFICADA** | `e5-b01-configuracion.spec.ts` 12 de 12 sin tocarlo; #4 a #6 se ejercen en B08#7, #9, F08#9 y #10 |
| E5-B02 (+#7) | 6 + 1 | **CERTIFICADA** | 15 de 15; la consulta con `RECONEXION_NECESARIA` en F08#8 |
| E5-F01 (+#4, #5) | 3 + 2 | **CERTIFICADA** | 13 de 13. T01, T02 y T05 ajustadas (`opcion-api-token`; `sin-conectar`, `conectado-api-token`) pasan |
| E5-F02 (+#6) | 5 + 1 | **CERTIFICADA** | 14 de 14; #6 se ve en F08 T12 (`error-consulta` con `JIRA_RECONEXION_NECESARIA` y «Ir a Conexión») |
| E5-GW · gateway | +1 | **CERTIFICADA** | 8 de 8; el caso nuevo `E5-GW#4` pasa |
| E7-F01 (ruta de retorno) | +2 | **CERTIFICADA** | T04c (QE1, ANA1, AUD1) y T04d pasan; la ruta entra en la matriz (`ROLES_MATRIZ.adm1.rutasPortal`) |

Resumen: **CERTIFICADA 6 · OBSERVADA 2 · NO VERIFICABLE 0** (más el grupo E1-F13/B13, ver «Regresión»). Defectos abiertos: **2** (ambos de severidad baja). No hay ninguna pasada «a medias»: lo que no se ejecutó o se omitió no cuenta como certificado.

## Cifras

| Corrida | Resultado |
| --- | --- |
| Pruebas propias del Atlassian falso (`atlassian-falso`) | 18 de 18 |
| E5 final bajo `connection_limit=1` (`e5-api`, `e5-e2e` y E7-F01): 348 pruebas | **346 pasan, 2 fallan** (DEF-E5O-01 y DEF-E5O-02; T16 falla además en su reintento) |
| `e5-b08-oauth.spec.ts` | 27 pruebas: 26 pasan, 1 falla (T18, DEF-E5O-01) |
| `e5-f08-oauth.spec.ts` | 24 pruebas: 23 pasan, 1 falla (T16, DEF-E5O-02) |
| `e5-a11y-oauth.spec.ts` (axe, 1280 y 375 px) | 4 de 4 |
| Corrida completa de Playwright, ronda inicial (890 pruebas, configuración por defecto) | 836 pasan, 27 fallan, 7 intermitentes (pasan al reintentar), 7 omitidas, 13 sin ejecutar |
| Repetición de las 27 fallas con el entorno corregido (`--last-failed`, dos pasadas) | 24 pasan; quedan 3: DEF-E5O-01, DEF-E5O-02 y E1-B13#1 (entorno) |
| Pruebas unitarias del portal (vitest) | 36 archivos, 482 de 482 |
| Gateway | 255 de 255 |
| auth-nest | 39 de 39 |
| Integraciones (base propia, RLS de nube aplicada) | 576 de 576 |
| Certificaciones / Impedimentos | 80 de 80 / 80 de 80 |
| Organización | 315 de 317; las 2 fallas no son del cambio (ver «Entorno») |
| typecheck (auth-nest, organización, certificaciones, impedimentos, integraciones, gateway) y build + typecheck del portal | todos en verde |
| oxlint del portal | sale 0 (solo advertencias de reglas de React que ya existían) |
| `contracts:lint` | válido |
| `contracts:check` | E5 145, total 325, 325 cubiertos |

Omitidas o sin ejecutar en la corrida completa: 7 omitidas y 13 sin ejecutar. `E1-B01#3` se omite por el límite del proveedor; las demás dependen de una prueba de su misma serie que falló (`SIN-SPRINT` y la recuperación de contraseña por interfaz, ver «Regresión»). Ninguna cuenta como certificada.

## Entorno

- **Stack real, sin mocks**: Supabase local (Docker), Organización, Certificaciones, Impedimentos e Integraciones, gateway y portal (Vite) del build de `aac1cd7`, con las migraciones aplicadas (incluida `20261122000000_e5_oauth_jira`) y las semillas `seed`, `seed:e7`, `seed:e4` y `seed:e5`. Atlassian simulado en `:4011` y Jira falso en `:4010`, arrancados por el `globalSetup`.
- **Aislamiento** (otra sesión usaba `:3000`–`:3004` y `:5173`): puertos propios (gateway 3200, servicios 3201–3204, portal 5273, instancias auxiliares 3212 y 3213) y bases propias `q360_qa_e5o` (stack y Playwright) y `q360_qa_e5o_u` (pruebas unitarias), ambas nuevas en el mismo Postgres. La base compartida no se tocó. Las `DATABASE_URL` terminan en `&connection_limit=1`, como en la nube. Las pruebas leen la base por `DATABASE_URL_DUENO`.
- **Dos ajustes de entorno** que explican fallas de la corrida inicial y no son del producto: (1) la base propia no tenía `auth.users` ni `storage.objects`, que usan tres pruebas `[MODELO]` y siete de limpieza; se crearon tablas vacías de apoyo; (2) `PUERTO_ALT_IMPEDIMENTOS` y `PUERTO_ALT_CERTIFICACIONES` valían 3203 y 3202 por defecto, que son los puertos de mis propios servicios: las pruebas de «fuente caída» de E4 y la exportación de E7 hablaban con el servicio real y no con el reducido. Con 3213 y 3212 pasan. También se subieron los límites de tasa del gateway (`LIMITE_TASA_*`), como en las certificaciones anteriores; con los de fábrica varias pruebas tardan más que su tiempo límite por los reintentos tras 429.
- **Organización** no cambia en este diff. Sus 2 fallas en la base de pruebas: `e5-pool-unico` exige que la base se llame `postgres` (mi base propia no) y `E5-B07-T11` (dos solicitudes simultáneas con el mismo código) falla con el pool por defecto y pasa con `connection_limit=1` (comprobado: 10 de 10). No tienen relación con OAuth.
- **Grupo E1-F13 / E1-B13 (recuperación de contraseña por interfaz): NO VERIFICABLE aquí.** El enlace de recuperación vuelve a `http://localhost:5173`, que es el portal de la otra sesión, y la prueba abre el correo en ese origen. 1 falla y 11 no se ejecutaron o se omitieron. No cuentan como certificadas ni como falla del cambio; hay que correrlas en un entorno con el portal en `:5173`.
- Ajustes de `tests/` de esta ronda: ver «Cambios en las pruebas».

## Escenarios nuevos

Archivos: `tests/api/e5-b08-oauth.spec.ts`, `tests/e2e/e5-f08-oauth.spec.ts`, `tests/e2e/e5-a11y-oauth.spec.ts` y `tests/e2e/e7-f01-ingreso-por-rol.spec.ts` (T04c y T04d). Etiquetas `@pendiente-*` retiradas. Cada fila es una prueba ejecutada; evidencia: la salida de Playwright de las corridas (`tests/test-results/` y los registros `tests/logs-e5/`, no versionados).

### E5-B08 · Conexión OAuth y renovación (API contra el gateway)

| # | Prueba | Resultado | Qué se afirma |
| --- | --- | --- | --- |
| 1 | T01, T02 | pasan | URL con `audience`, `client_id`, los tres scopes de D218 (ninguno de escritura), `redirect_uri` del servidor, `response_type=code`, `prompt=consent`; `state` de 43 o más caracteres solo como hash SHA-256 con vigencia de 10 min; sin llamar a Atlassian; un `state` distinto en cada llamada; purga de los de más de 1 día; respuesta cumple `InicioAutorizacionOauthJira` |
| 2 | T03, T04 | pasan | 200 `CONECTADA` (contrato `ResultadoConexionOauthJira`); ambos tokens cifrados con IV de 12 y etiqueta de 16 propios y distintos; ni token, `code`, `state` ni secreto en claro (utf8, latin1, hex y base64) en ninguna tabla ni en la respuesta; `state` usado; evento `CONECTAR_OAUTH`; `GET configuracion` sin secretos y con el contrato; dos conexiones producen cifrado e IV distintos y la segunda es `RECONECTAR` |
| 3 | T05, T06, T07 | pasan | `state` desconocido, mal formado, vencido, ya usado o de otro Administrador: 400 `JIRA_OAUTH_ESTADO_INVALIDO` con el mismo mensaje y sin llamar a Atlassian (solo el canje legítimo llegó); el de otro Administrador no se consume; dos retornos simultáneos: uno canjea y el otro 400; cuerpos inválidos 400 `VALIDACION` sin consumir el `state` |
| 4 | T08, T09 | pasan | `access_denied` → 200 `JIRA_OAUTH_CONSENTIMIENTO_RECHAZADO` con la conexión anterior idéntica; otro `error` → `JIRA_OAUTH_CANJE_FALLIDO` sin repetirlo; canje rechazado sin texto de Atlassian, `state` consumido y un segundo retorno ya no llega a Atlassian |
| 5 | T10, T11, T12 | pasan | un sitio se toma; varios → `ELEGIR_SITIO`, `PENDIENTE_SITIO`, candidatos ordenados con `actual` en el configurado, nada se registra aún; consultar sin sitio 409; id ajeno 400 `JIRA_OAUTH_SITIO_NO_VALIDO`; elegir conecta con `CONECTAR_OAUTH`; sin sitios o solo con Confluence: `SIN_SITIO` o `PERMISOS_INSUFICIENTES` y nada guardado; sin conexión pendiente 409; un `cloudid` que no es UUID o una URL fuera de `*.atlassian.net` se descarta y no se llama a ninguna ruta armada con él |
| 6 | T13 | pasa | `JIRA_OAUTH_PERMISOS_INSUFICIENTES` con `permisosFaltantes: [read:jira-work]` y nada guardado |
| 7 | T14, T15, T16 | pasan | acceso por vencer: se renueva una vez, el canje de renovación va antes de la llamada a Jira, la llamada lleva el Bearer nuevo, cambian refresh y acceso cifrados y `renovado_en`; una segunda renovación posterior con el refresh nuevo prueba que se guardó (cero reutilizaciones); 401 con acceso que se creía vigente: una renovación y un solo reintento; renovación buena y reintento en 401: `JIRA_OAUTH_PERMISOS_INSUFICIENTES` con `read:jira-user`, sin más reintentos y la conexión sigue `CONECTADA` |
| 8 | T17 | pasa | cuatro operaciones simultáneas con el acceso vencido: Atlassian cuenta **1** renovación, 0 rechazos y 0 reutilizaciones, las cuatro terminan bien y la conexión sigue `CONECTADA` (con `connection_limit=1`) |
| 9 | T18 | **falla (una afirmación)** | `invalid_grant`: `RECONEXION_NECESARIA`, los siete campos de tokens nulos, cuenta conservada, 200 `JIRA_RECONEXION_NECESARIA` con el mensaje fijo, una segunda operación no llama a Atlassian ni repite el evento, un solo `REFRESCO_FALLIDO`, reconectar deja `RECONECTAR` y la prueba vuelve a pasar. Falla `oauth.descifrable`: llega `true` y el contrato pide `false` (DEF-E5O-01) |
| 10 | T19 | pasa | renovación con Atlassian caído (5xx) o con 429: `JIRA_NO_DISPONIBLE` o `JIRA_LIMITE_DE_TASA`, estado y cifrado sin cambio, sin `REFRESCO_FALLIDO`, y la siguiente operación renueva |
| 11 | T20, T21 | pasan | sin `JIRA_OAUTH_*` (instancia :3108): iniciar, retorno, sitio, probar y guardar con OAuth 503 `JIRA_OAUTH_NO_CONFIGURADO` sin nombres de variables ni valores, sin llamar a Atlassian, con la conexión guardada intacta; `GET` informa `oauthDisponible: false` con el contrato; el API token prueba bien; `DELETE` funciona (204). Sin llave: 503 `LLAVE_CIFRADO_NO_DISPONIBLE`. Con otra llave: `oauth.descifrable: false` y 409 `TOKEN_NO_DESCIFRABLE` sin borrar nada |
| 12 | T22, T23 | pasan | `DELETE`: 204 sin cuerpo y con `x-trace-id`, fila borrada, evento `DESCONECTAR`, sin llamar a Atlassian, configuración y HDU intactas, `oauth: null`; un segundo `DELETE` 409 `JIRA_OAUTH_SIN_CONEXION`; el servicio no puede `DELETE`, `UPDATE` ni `TRUNCATE` la auditoría y no hay llaves foráneas a otro esquema |
| 13 | T24, T25 | pasan | QE, Analista y Auditor: 403 `ACCESO_DENEGADO` con cuerpo idéntico en las 4 rutas; sin sesión y con token inventado: 401; nada se crea ni se llama a Atlassian; no existe ninguna ruta pública de OAuth (404 o 401); un Administrador desactivado con token vigente no usa ninguna ruta |
| 14 | T26, T27 | pasan | tras conectar, repetir, renovar, fallar y rechazar: ni `code`, `state`, tokens ni secreto aparecen en respuestas, tablas, eventos, registro de ejecución ni en los registros de los servicios; las únicas llamadas salientes son las del Atlassian simulado, con las rutas y el `cloudid` del sitio elegido |

### E5-F08 · Conectar con Jira desde Quality360 (portal, Chromium)

| # | Prueba | Resultado | Qué se afirma |
| --- | --- | --- | --- |
| 1 | T01, T02 | pasan | clic en «Conectar con Jira» → Atlassian → página de retorno «Conexión con Jira» → Conexión «Conectado con Jira (OAuth) como Admin Jira Falso en jseguelh»; nunca existe `campo-token`; la dirección ya no lleva `code` ni `state`; ni las respuestas del gateway, ni `localStorage`, ni `sessionStorage`, ni el HTML contienen secretos (`/__fugas` vacío); **ninguna petición al gateway lleva `code`, `state` o `error` en la query** (el retorno va por POST); «Atrás» no vuelve al retorno y recargarlo no repite el canje |
| 2 | T03 | pasa | consentimiento cancelado: «No aceptaste los permisos en Atlassian. No se conectó nada.», el estado anterior no cambia, nada guardado y se puede reintentar hasta conectar |
| 3 | T04, T05 | pasan | `state` inventado, ya usado y vencido: el mismo texto fijo, el botón visible, `data-codigo`, sin revelar la causa y nada conectado |
| 4 | T06, T07, T10 | pasan | varios sitios: lista con nombre y URL, «Falta elegir el sitio», «Usar este sitio» con `aria-disabled` hasta elegir, la consulta bloqueada; el sitio configurado viene preseleccionado y la lista sobrevive a recargar; canje rechazado: «Atlassian no aceptó la autorización…» sin su texto |
| 5 | T08 | pasa | cuenta sin Jira: «Tu cuenta de Atlassian no tiene acceso a ningún sitio de Jira.» y «No se guardó nada.» |
| 6 | T09 | pasa | «Faltan permisos en Atlassian: Ver datos de issues. Acepta todos los permisos solicitados.»; el código técnico no se muestra |
| 7 | T11 | pasa | sin `JIRA_OAUTH_*` (pila propia: Integraciones :3108, gateway :3100, portal :5180): `aria-disabled="true"`, `data-estado="no-disponible"`, sin `disabled`, motivo ligado por `aria-describedby`, en el orden de tabulación, pulsarlo no llama al servidor, ningún nombre de variable en pantalla, y el API token funciona |
| 8 | T12 | pasa | tras `invalid_grant`: chip y tarjeta «Reconexión necesaria» con «Reconectar» (sin `boton-conectar-jira` ni «Probar conexión»); «Consultar Jira» muestra `JIRA_RECONEXION_NECESARIA` con «Ir a Conexión», sin tocar las HDU; «Reconectar» vuelve a «Conectado» y deja `RECONECTAR` |
| 9 | T13, T14 | pasan | del API token a OAuth: el token sigue activo («lista, sin activar») hasta «Probar y guardar»; luego `metodo OAUTH` con correo y token nulos; de OAuth a API token: aviso, campo vacío, un token malo no cambia nada y uno bueno borra la conexión OAuth con evento `DESCONECTAR` |
| 10 | T15 | pasa | «Probar y guardar» con OAuth: «Conexión exitosa con Jira como Admin Jira Falso», se guarda con el sitio OAuth |
| 10 | T16 | **falla** | sin permiso en el proyecto: sí hay código `JIRA_PROYECTO_NO_ENCONTRADO`, no se guarda nada y la conexión sigue `CONECTADA`, pero el texto es el del API token («No encontramos el proyecto en Jira.») y no el de OAuth que pide el diseño §9.3 (DEF-E5O-02) |
| 11 | T17 | pasa | diálogo con «Lo ya importado no se borra.»; cancelar no cambia nada; confirmar deja «Sin conectar», `ayuda-revocar-jira` y evento `DESCONECTAR`, sin llamar a Atlassian |
| 12 | T20 (QE1, ANA1, AUD1), T20b, T20c y E7-F01 T04c y T04d | pasan | acceso denegado a la ruta de retorno (con y sin `code` y `state`) y a Conexión, sin botones de OAuth, ninguna llamada a rutas OAuth, URL limpia; sin sesión pasa por el inicio de sesión sin conservar `code` ni `state`; el Administrador sin parámetros ve «No hay una conexión en curso» |
| 13 | T18, T19 y `e5-a11y-oauth` T01 a T04 | pasan | solo con teclado el diálogo atrapa el foco (6 Tab y 6 Mayús+Tab), el foco inicial va a «Cancelar» y Escape devuelve el foco a «Desconectar»; `role="status"` y `role="alert"` con el error enfocado; axe sin hallazgos serious ni critical y sin desborde a 375 px en la pestaña (6 estados más «OAuth no disponible»), en la página de retorno (los 11 estados) y en los 2 diálogos, a 1280 y 375 px |

## Pruebas certificadas que cambian

| Prueba | Cambio | Resultado |
| --- | --- | --- |
| `e5-f01-conexion.spec.ts` T01 | `data-estado` `SIN_PROBAR` → `sin-conectar` y `OK` → `conectado-api-token`; clic en `opcion-api-token` antes de llenar | pasa |
| T02 y T05 | clic en `opcion-api-token` tras abrir la pestaña | pasan |
| `e5-gateway.spec.ts` | caso nuevo `E5-GW#4`: las 4 rutas OAuth publicadas (no 404 ni 501), 401 sin token, 403 `ACCESO_DENEGADO` del Analista con `traceId`, y `GET` sobre una ruta `POST` da 404 | pasa |
| `e5-b01-configuracion.spec.ts` | sin tocar (contratos de `ConfiguracionJira` y eventos) | 12 de 12 |
| `e7-f01-ingreso-por-rol.spec.ts` | T04c y T04d nuevas, sin alterar T04b; ruta en `ROLES_MATRIZ` | pasan |
| `e5-a11y-responsivo.spec.ts` | sin cambio (`form-jira` sigue en ambos métodos) | 6 de 6 |

## Cambios en las pruebas (solo `tests/**`)

- Las pruebas escritas en la ola 1 contra el contrato se corrigieron donde el defecto estaba en la prueba: el disparador de `oauth_estado_jira` no admite envejecer un `state` por UPDATE (ahora se inserta una fila vencida con `crearEstadoVencido`); el registro del Atlassian simulado incluye las llamadas del propio canje (las pruebas toman solo las posteriores); el texto «JIRA_OAUTH_NO_CONFIGURADO» del `codigo` no es un nombre de variable filtrado; `aria-disabled` no es «enabled» para Playwright (clic forzado); el botón nace `no-disponible` mientras carga la configuración (se espera a `disponible`); con el API token activo se elige `opcion-oauth` antes de conectar y el chip refleja el método activo; el testid del error de consulta es `error-consulta` (el del diseño §7, `error-sincronizacion`, no existe en la pantalla certificada de E5-F02); y el 503 `SERVICIO_NO_DISPONIBLE` se muestra como «sin respuesta» por diseño (el estado `error-servidor` se prueba con un 500).
- Arnés: `PORTAL_URL`, `GATEWAY_URL`, `GATEWAY_REAL_URL`, `INTEGRACIONES_URL`, `DATABASE_URL_DUENO`, `PUERTO_ALT_*`; el puerto de gateway de las pruebas de «solo datos del portal» sale de `env.gatewayUrl` y no de `3000` fijo.
- Se agregó la comprobación de la query (ninguna llamada al gateway lleva `code`, `state` ni `error`) a E5-F08 T01.

## Seguridad

| Comprobación | Resultado |
| --- | --- |
| `code`, `state`, tokens de acceso y de renovación y secreto del cliente en respuestas | ninguno (T03, T09, T26 y F08 T01; `/__fugas` vacío) |
| En las tablas | ninguno; del `state` solo el hash SHA-256 (T01); tokens cifrados con IV y etiqueta propios, sin subcadena en claro |
| En eventos y registro de ejecución | ninguno |
| En los registros del gateway y de Integraciones | ninguno: búsqueda de los valores emitidos (T26) y, al terminar, del secreto real del `.env` y de patrones `code=`, `state=`, `acc-`, `ref-` en `tests/logs-e5`, `test-results` y el informe: sin hallazgos |
| `localStorage`, `sessionStorage`, HTML y barra de direcciones tras la captura | sin secretos; la dirección sin `code` ni `state` (F08 T01, T02, T04) |
| Query de las llamadas al gateway | ninguna con `code`, `state` o `error`: el retorno va por POST con cuerpo. El riesgo anotado por el gateway (los registros de error de auth-nest incluyen la query) no se materializa en ningún flujo de OAuth |
| Secretos en el diff `c703ee0..HEAD` | ninguno: sin `.env`, claves, JWT, tokens ni secretos reales; solo valores de prueba sin valor (`secreto-de-prueba-no-real-0001`) y las variables vacías de `.env.example` y Compose |
| SSRF | las únicas llamadas salientes son las del simulado, solo con las rutas y el `cloudid` válidos (T12, T27). **No cubierto:** que no se sigan redirecciones y que el cuerpo de un error de Atlassian no se lea; lo cubren las pruebas de unidad de `cliente-atlassian-http` (576 de 576), no un caso de punta a punta |
| RLS de la nube (`infrastructure/nube/007_rls_oauth_jira_nube.sql`, aplicado después de la migración en una base local con `anon` y `authenticated`, como superusuario de la base porque localmente las tablas son del rol del servicio) | `anon`, `authenticated` y `service_role`: 42501 «permission denied for schema integraciones» en las 3 tablas; las 3 tablas con RLS y la política `servicio_integraciones`; `svc_integraciones` no puede `DELETE`, `UPDATE` ni `TRUNCATE` `evento_oauth_jira`, ni `TRUNCATE` `oauth_estado_jira` ni `conexion_oauth_jira`; sí lee y puede borrar `conexion_oauth_jira` |

## Desvíos de `q360-integraciones` frente al contrato y el ADR 0019

| # | Desvío | Clasificación | Razón |
| --- | --- | --- | --- |
| 1 | `probarCuenta` devuelve `{usuarioJira, cuentaId}` | **Aceptable** | Es interno al servicio; la respuesta pública `ResultadoPruebaJira` no cambia (T14, T16) |
| 2 | Los candidatos se guardan como `{id, nombre, url}` y `actual` se calcula al responder | **Aceptable** | Coincide con el plan de datos (solo `{id, nombre, url}`) y con el contrato (`actual` en la respuesta); verificado en T10 (el sitio configurado sale `actual` y sobrevive a recargar) |
| 3 | `REFRESCO_FALLIDO` con `codigo` `RENOVACION_RECHAZADA` y `resultadoPrueba` `JIRA_RECONEXION_NECESARIA` (los demás eventos OAuth `OK`) | **Aceptable** | El contrato fija exactamente esa regla para `resultadoPrueba`; el `codigo` cumple el CHECK `^[A-Z_]{3,40}$` (T18) |
| 4 | `CONECTAR_OAUTH` o `RECONECTAR` según exista algún evento de conexión, incluso tras un `DESCONECTAR` | **Aceptable** | Es la lectura literal de D217 («la primera conexión registrada; las siguientes son `RECONECTAR`»); T04 y T18 lo confirman |
| 5 | En el `PUT` OAuth el orden es 503, 409, 422 y la prueba | **Aceptable** | El contrato lo describe en ese orden (503, 409, luego 400 → 422 → prueba) y la convención de la épica es 401 → 403 → 400 → 503 → 409 → ejecución |
| 6 | En el retorno, las fallas pasajeras responden `JIRA_NO_DISPONIBLE`, `JIRA_TIEMPO_AGOTADO`, `JIRA_LIMITE_DE_TASA` o `JIRA_RESPUESTA_INVALIDA`; solo la definitiva `JIRA_OAUTH_CANJE_FALLIDO`; un 401/403 en `myself` es `JIRA_OAUTH_PERMISOS_INSUFICIENTES` con `read:jira-user` | **Aceptable** | `ResultadoConexionOauthJira.error` lista exactamente esos códigos; D218 asigna `read:jira-user` a `myself`; T09 y T13 |
| 7 | El actor de `REFRESCO_FALLIDO` se resuelve antes de abrir la transacción; con Organización caída se usa el id de quien pidió la acción con el nombre «Administrador» | **Aceptable** | Respeta `connection_limit=1` (no se consulta nada con el candado tomado) y el contrato (`Persona` válida, el portal lo muestra como «Sistema»). No se ejecutó con Organización caída: queda cubierto por las pruebas de unidad de Integraciones |
| 8 | Las pruebas de JO7 están en `e5-b01-oauth.test.ts` y las de `connection_limit=1` en `def-e5c-05-oauth.test.ts` | **Aceptable** | Solo la ubicación; las 576 pruebas pasan y T17 verifica el candado de fila con `connection_limit=1` |
| 9 | auth-nest necesita su `dist` | **Aceptable** | Ya lo documenta `ws:test` (construye auth-nest primero); requisito de preparación, no del producto |

## Defectos

| ID | Dueño | Severidad | Defecto |
| --- | --- | --- | --- |
| DEF-E5O-01 | `q360-integraciones` | Baja | `oauth.descifrable` es `true` con la conexión en `RECONEXION_NECESARIA`; el contrato (`comun.v1.yaml`, `ConexionOauthJira.descifrable`) dice que es `false` «siempre en `RECONEXION_NECESARIA` (no hay tokens)». **Reproducción:** `npx playwright test --project=e5-api e5-b08-oauth -g T18` (o: conectar, `RENOVACION_INVALID_GRANT` en el Atlassian simulado, forzar el vencimiento del acceso, `POST configuracion/probar {metodo: OAUTH}` y luego `GET configuracion`). **Esperado:** `oauth: {estado: "RECONEXION_NECESARIA", descifrable: false}`. **Obtenido:** `descifrable: true`. **Dónde:** `services/integraciones/src/aplicacion/credenciales-jira.ts:171` (`descifrable()`: sin tokens nada falla y devuelve `true`; el comentario de la línea 167 dice lo contrario del contrato). Si el equipo prefiere `true`, hay que cambiar el contrato y la prueba; no hay efecto en el portal, que decide la tarjeta por `estado` |
| DEF-E5O-02 | `q360-frontend` | Baja | El texto de `JIRA_PROYECTO_NO_ENCONTRADO` (y el de `JIRA_SIN_PERMISO`) usa el método **guardado**, no el que se está probando. Con una conexión OAuth hecha pero sin configuración guardada (`metodo: null`) y la pestaña en OAuth, «Probar y guardar» muestra «No encontramos el proyecto en Jira.» (API token) en vez de «No encontramos el proyecto. Revisa la clave; también puede ser que la cuenta de Jira conectada no tenga permiso para verlo.» (diseño §9.3, E5-F08#10). **Reproducción:** `npx playwright test --project=e5-e2e e5-f08-oauth -g T16` (conectar por OAuth, `SIN_PERMISO_PROYECTO` en el simulado, clave QTY, destino, «Probar y guardar»). **Esperado:** texto de OAuth. **Obtenido:** texto del API token, con `data-codigo="JIRA_PROYECTO_NO_ENCONTRADO"`. **Dónde:** `apps/web/src/components/integraciones/ErrorIntegracion.tsx:50` (`useMetodoJiraActivo()`) y `apps/web/src/lib/mensajesIntegracion.ts:166`; el formulario sabe el método que mandó (`esOauth` en `FormularioConexionJira.tsx:179`). No se guarda nada y la conexión queda intacta |

Observaciones (no son defectos de producto):

| ID | Dueño | Observación |
| --- | --- | --- |
| OBS-E5O-01 | `q360-arquitecto` | El diseño (§7) y el backlog (E5-F02#6) nombran `error-sincronizacion` «(cert.)», pero la pantalla certificada de E5-F02 usa `error-consulta`. La prueba usa el real; conviene corregir el nombre en el diseño y el backlog |
| OBS-E5O-02 | `q360-infra` | `infrastructure/seed/mvp/.env.carga` no trae `CERTIFICACIONES_URL`; `npm run seed:e7` cae en `localhost:3002` por defecto y, con otro stack en esos puertos, golpea el servicio ajeno (falla con 403 sin modificar nada). Conviene agregarla en `preparar-entorno.mjs` |
| OBS-E5O-03 | `q360-infra` | Las pruebas de E4 y E7 que levantan segundas instancias usan por defecto los puertos 3202 y 3203, que son los de Certificaciones e Impedimentos del stack principal; si el stack usa los de fábrica, las pruebas hablan con el servicio real. Se evita con `PUERTO_ALT_*`; conviene un valor por defecto distinto |
| OBS-E5O-04 | `q360-seguridad-gateway` | El E5-F08 T01 y T02 fallaron una vez con los límites de tasa por defecto (el botón no aparecía porque la configuración recibió un 429 tras 800 pruebas seguidas). Es de la corrida larga, no de OAuth; con los límites alzados pasan |

## Regresión

- **E1 a E4, E7 y modelo de datos** (corrida completa de 890 pruebas, configuración por defecto): 836 pasan. Las 27 fallas, repetidas con el entorno corregido (dos pasadas de `--last-failed`): 24 pasan: las causadas por el entorno propio (falta de `auth.users` y `storage.objects`, colisión de puertos de las instancias auxiliares, tiempo límite con los límites de tasa de fábrica) y las intermitentes. Quedan DEF-E5O-01, DEF-E5O-02 y E1-B13#1.
- **E1-F13 / E1-B13 (recuperación de contraseña por interfaz):** NO VERIFICABLE aquí (ver «Entorno»). Ni el código ni las pruebas de esa HDU cambian en este diff.
- **E5 (todas sus suites) bajo `connection_limit=1` y con los límites alzados:** 346 de 348 (las 2 son los defectos). E5-B01 12, B02 15, B03 14, B04 16, B05 38, B06 15, B07 20, F01 13, F02 14, F03 15, F04 13, F05 30, F06 14, F07 19, gateway 8, accesibilidad 4 + 6 + 4 y E7-F01 18: sin fallas.
- Unitarias, typecheck, build y contratos: ver «Cifras».

## Escenarios que quedan sin cubrir

- **E5-MAN-02:** la prueba real contra Atlassian (`jseguelh.atlassian.net`, la renovación pasada la hora y la revocación) es manual y del usuario, después del despliegue. Ninguna prueba automática depende de Atlassian.
- No se ejecutó la renovación con Organización caída (desvío 7) ni la ausencia de seguimiento de redirecciones de punta a punta (solo en pruebas de unidad).
- E1-F13 / E1-B13: ver «Entorno».

## Cómo repetir

1. Entorno propio: bases nuevas, `psql -f infrastructure/db/001_esquemas_roles.sql`, `npm run migrate:deploy -w services/<servicio>` con las `DATABASE_URL` de esa base (y `&connection_limit=1`), `npm ci` en la raíz y en `tests/`, `npm run build` de auth-nest, los servicios y el gateway, y las semillas con `CERTIFICACIONES_URL` apuntando al servicio propio.
2. Playwright (con `PORTAL_URL`, `GATEWAY_URL`, `GATEWAY_REAL_URL`, `INTEGRACIONES_URL`, `DATABASE_URL_DUENO` y `PUERTO_ALT_*` propios): `npx playwright test --project=atlassian-falso` y, con el stack, `--project=e5-api --project=e5-e2e --project=e7-e2e` con los filtros `e5-` y `e7-f01`.

## Ronda 2

Código certificado: `059a8f8` (DEF-E5O-01 en `4e4ce2f`, DEF-E5O-02 en `348b877`); `5a059f8` solo suma documentos. Mismo entorno que la ronda 1 (stack propio en 32xx y 5273, bases `q360_qa_e5o` y `q360_qa_e5o_u`, `connection_limit=1`, límites de tasa alzados), con Integraciones recompilado.

**Dictamen: CERTIFICADA.** E5-B08 y E5-F08 pasan en sus 14 y 13 escenarios; las 6 HDU modificadas siguen certificadas. Defectos abiertos: 0 (DEF-E5O-01 y DEF-E5O-02 cerrados).

| HDU | Escenarios | Dictamen | Fundamento |
| --- | --- | --- | --- |
| E5-B08 | 14 | **CERTIFICADA** | 27 de 27 pruebas. T18 (`descifrable: false` en `RECONEXION_NECESARIA`) pasa |
| E5-F08 | 13 | **CERTIFICADA** | 24 de 24 pruebas. T16 (texto de OAuth en «proyecto no encontrado») pasa; accesibilidad 4 de 4 |
| E5-B01, B02, F01, F02, E5-GW, E7-F01 (ruta de retorno) | — | **CERTIFICADA** | Sin cambios de resultado respecto de la ronda 1 |

### Cifras de la ronda 2

| Corrida | Resultado |
| --- | --- |
| E5-B08, E5-F08 y accesibilidad de OAuth, completos | todas pasan |
| E5 completo más E7-F01 bajo `connection_limit=1` (348 pruebas) | 345 pasan; 3 fallan por tiempo y **pasan al repetirlas** (12 de 12 con sus dependencias): E5-B05 T28, E5-B07 T20 y E5-F03 T14. Son pruebas de «Organización lenta» o de presupuesto corto, sensibles a la carga de la máquina (en la ronda 1 pasaron; E5-F03 T14 es el intermitente conocido OBS-5). Ninguna es de OAuth |
| Integraciones (base propia, 007 aplicada) | 580 de 580 (con la prueba nueva `e5-b08-descifrable`) |
| Portal (vitest) | 37 archivos, 488 de 488 (incluye `e5TextoPorMetodo` y `capturaRetornoOauth`) |
| Build del portal (con typecheck) y typecheck de Integraciones | en verde |
| Atlassian simulado | 18 de 18 |
| Gateway, auth-nest, Organización, Certificaciones, Impedimentos | no se repiten: el diff `261465a..059a8f8` solo toca Integraciones (`credenciales-jira.ts`) y 3 componentes del portal |
| Escaneo de secretos del diff `261465a..059a8f8` | sin hallazgos (sin `.env`, claves, JWT ni secretos) |

### E1-F13 / E1-B13 (recuperación de contraseña por interfaz)

**Verificada: 25 de 25** (en la ronda 1 era NO VERIFICABLE). Sin tocar el portal de :5173 ni la configuración de Supabase: `recuperacion-contrasena-ui.spec.ts` detecta que el portal bajo prueba no está en la lista de `redirect_to` de Supabase (:5173 y :8080) y, solo entonces, atiende el `/auth/v1/verify` real del correo sin seguir la redirección y cambia su destino (el `site_url` de :5173) por `/restablecer-contrasena` del portal propio, conservando el fragmento con los tokens. El enlace, el token y el correo son los reales de Mailpit; lo emulado es solo la lista de permitidos. La aserción de B13#1 espera `redirect_to` igual al portal si está en la lista, o al `site_url` si no. Con el portal en :5173 u :8080 la prueba no cambia. Esto ejercita la captura de `main.tsx` (FO2) con el portal nuevo: abrir el enlace, el formulario, los enlaces vencidos o falsos y el cierre de sesión pasan, es decir, la captura no actúa fuera de la ruta de retorno OAuth.

### Arranque manual de los simulados

`npm run simulados:jira` (script de la raíz, `tests/support/simulados.ts`) levanta el Jira simulado (:4010) y el Atlassian simulado (:4011), lee el `.env` de Integraciones y queda corriendo hasta Ctrl+C. No descarga nada: Node 24 ejecuta el TypeScript directamente, y para eso `atlassian-falso/servidor.ts` importa `../jira-falso/servidor.ts` con extensión (Playwright lo sigue resolviendo). Comprobado: `GET http://127.0.0.1:4011/__solicitudes` responde `"modo":"NORMAL"`, el Jira responde en :4010 (401 sin credenciales), `/authorize` con el client id y la redirect URI del `.env` responde 302 y las 18 pruebas del simulado siguen en verde. `GUIA-LOCAL.md` (paso 2 y fila de problemas frecuentes) apunta al script.

### Sin cubrir

Igual que en la ronda 1: E5-MAN-02 (manual, contra Atlassian real), Organización caída al renovar y el no seguimiento de redirecciones de punta a punta.
