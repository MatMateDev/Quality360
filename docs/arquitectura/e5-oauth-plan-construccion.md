# E5 · Conexión con Jira por OAuth 2.0 (3LO) · Plan de construcción

Fecha: 2026-11-22. Base: `main` en `542ef16` más el commit de contratos de esta corrida. Complementa `e5-plan-construccion.md`, `e5-consulta-plan-construccion.md` y `e5-detalle-plan-construccion.md`, que siguen vigentes en todo lo que este plan no cambia.

**Insumos**
- Backlog: `docs/backlog/e5-oauth-jira.md`. Trae 2 HDU nuevas (E5-F08 y E5-B08) y 7 escenarios agregados (E5-F01 #4 y #5, E5-F02 #6, E5-B01 #4 a #6 y E5-B02 #7). E5 pasa de 111 a 145 escenarios y el total, de 291 a 325.
- Diseño: `docs/diseno/e5-oauth-jira.md`. Contiene la microcopy (§9), los `data-testid` (§10) y la guía del portal (§11). **`q360-frontend` lo sigue al pie de la letra**, salvo las resoluciones de su §12, que están en `decisiones-mvp.md`.
- Decisiones: D209–D218, con ajustes, en `decisiones-mvp.md` (sección «E5 · Conexión con Jira por OAuth 2.0 (3LO)») y en el ADR 0019.
- Guía para el usuario (registro de la app y variables): `docs/arquitectura/guia-oauth-atlassian.md`.

**Contratos (contract-first, todos aditivos).** `npm run contracts:lint` pasa sin advertencias y `npm run contracts:check` cubre 325/325.

| Archivo | Cambio |
| --- | --- |
| `integraciones.v1.yaml` | **4 rutas nuevas:** `POST /v1/integraciones/jira/oauth/iniciar` (`iniciarConexionOauthJira`), `POST …/oauth/retorno` (`completarConexionOauthJira`), `POST …/oauth/sitio` (`elegirSitioOauthJira`) y `DELETE /v1/integraciones/jira/oauth` (`desconectarOauthJira`, 204), con ejemplos. El cuerpo de `PUT configuracion` es `oneOf` (API token u OAuth) y el de `probar`, `anyOf`. Cambian las descripciones y los `x-hdu` de `GET`/`PUT configuracion`, `probar`, `eventos`, `consultas` y `continuaciones`. Respuestas nuevas: `ConflictoCredencialJira` (reemplaza a `TokenNoDescifrable`), `OauthNoDisponible`, `RetornoOauthInvalido`, `SitioOauthNoValido`, `ConflictoSitioOauth` y `SinConexionOauth`. `IntegracionNoDisponible` suma `JIRA_OAUTH_NO_CONFIGURADO` |
| `comun.v1.yaml` | `CodigoError` suma `JIRA_OAUTH_NO_CONFIGURADO`, `JIRA_OAUTH_ESTADO_INVALIDO`, `JIRA_OAUTH_SITIO_NO_VALIDO` y `JIRA_OAUTH_SIN_CONEXION`. `CodigoErrorIntegracion` suma `JIRA_RECONEXION_NECESARIA`, `JIRA_OAUTH_PERMISOS_INSUFICIENTES`, `JIRA_OAUTH_CONSENTIMIENTO_RECHAZADO`, `JIRA_OAUTH_CANJE_FALLIDO` y `JIRA_OAUTH_SIN_SITIO`. `ErrorIntegracion` suma `permisosFaltantes`. `ConfiguracionJira` suma `metodo`, `oauthDisponible` y `oauth`, los tres obligatorios. `EventoConfiguracionJira` suma `tipo` y `oauth`, obligatorios, y `CampoConfiguracionJira` suma `metodo`. `SolicitudConfiguracionJira` y `SolicitudPruebaJira` suman un `metodo` opcional (`const: API_TOKEN`, sin `default`). Esquemas nuevos: `PermisoAtlassian`, `MetodoConexionJira`, `EstadoConexionOauthJira`, `SitioJiraOauth`, `SitioCandidatoJiraOauth`, `ConexionOauthJira`, `InicioAutorizacionOauthJira`, `SolicitudRetornoOauthJira`, `SolicitudSitioOauthJira`, `ResultadoConexionOauthJira`, `SolicitudConfiguracionJiraOauth`, `SolicitudPruebaJiraOauth` y `TipoEventoConfiguracionJira` |
| `gateway.v1.yaml` | Reenvía las 4 rutas. `/v1/integraciones/*` pasa de 18 rutas y 20 operaciones a 22 y 24 |
| `organizacion.v1.yaml` | Sin cambios |
| `scripts/verificar-cobertura.mjs` | E5 espera 145 escenarios y lee `e5-oauth-jira.md` |

**Tipos y despliegue del portal.** Después de `npm run contracts:types`, el typecheck del portal falla en 6 puntos, todos esperados:
- `src/lib/mensajesIntegracion.ts:172`: `ETIQUETAS_CAMPO_CONFIGURACION` necesita `metodo`.
- `src/mocks/dataE5.ts`, líneas 99, 120, 148 y 149: faltan `metodo`, `oauthDisponible`, `oauth`, `tipo` y `oauth` del evento.
- `src/mocks/handlersE5.ts:324`.

Como `npm run build` del portal ejecuta `gen:types` y `tsc` antes de `vite build`, **esta rama no se fusiona a `main` sin FO1**: el despliegue del portal en Vercel fallaría. Lo corrige `q360-frontend` en FO1.

> **Aviso: puerto fijo `FuenteJira`** (`services/integraciones/src/dominio/puertos/fuente-jira.ts`). Su comentario dice «interfaz FIJA». Este plan lo cambia **solo de forma aditiva** (D214, D218):
> - `CredencialJira {sitio, correo, token}` no cambia. Se suma `CredencialJiraOauth {tipo: 'OAUTH', cloudId, tokenAcceso, sitio, permisos}`, y los métodos aceptan `CredencialJira | CredencialJiraOauth` (se distingue con `'tipo' in c`). Con OAuth, la base es `<url API>/ex/jira/{cloudId}` y la autenticación es `Bearer`.
> - Método nuevo `probarCuenta(c, o): Promise<ResultadoJira<{ usuarioJira: string; cuentaId: string }>>`, con una sola llamada a `/rest/api/3/myself`. Lo usa «Probar conexión» cuando no hay proyecto. `cuentaId` se guarda en la conexión y no sale en ninguna respuesta pública (desvío 1 de la ronda 1, aceptado).
> - `CodigoErrorJira` suma `'JIRA_OAUTH_PERMISOS_INSUFICIENTES'`, y el resultado fallido suma `permisosFaltantes?: string[]`.
> - Con OAuth, el cliente comprueba `permisos` contra la tabla de permisos por endpoint antes de llamar. Si falta alguno, responde `JIRA_OAUTH_PERMISOS_INSUFICIENTES` sin llamar. Ante un 401 responde `JIRA_CREDENCIAL_INVALIDA` con los `permisosFaltantes` de ese endpoint. La renovación forzada y el único reintento los hace la aplicación (`CredencialesJira`, JO5), no el cliente.
>
> Ninguna firma existente deja de compilar para quien la llama. Quien implementa `FuenteJira` debe sumar `probarCuenta` y aceptar la unión: hoy son `cliente-jira-http.ts` y el doble de `services/integraciones/test/ayudas.ts`. `q360-backend` no tiene trabajo en el puerto. Si alguien necesita cambiar una firma existente, pasa antes por `q360-arquitecto`.

## Modelo de datos

### Integraciones · migración `services/integraciones/prisma/migrations/20261122000000_e5_oauth_jira/migration.sql` (q360-integraciones)

Va en el esquema `integraciones`, sin llaves foráneas hacia otro esquema (D24). Toda SQL cruda, también la de las funciones, se califica con `"integraciones".` (DEF-E5C-05), y las funciones llevan `SET search_path = integraciones, pg_catalog`. Es **compatible con el código anterior**: las columnas nuevas tienen valor por defecto, y las que pasan a admitir nulos solo quedan nulas con `metodo = 'OAUTH'`, que el código anterior no escribe. Por eso puede aplicarse antes de publicar el código nuevo.

**`configuracion_jira` (cambios)**

| Cambio | Detalle |
| --- | --- |
| `metodo varchar(9) NOT NULL DEFAULT 'API_TOKEN'` | CHECK `configuracion_jira_metodo_ck`: `metodo IN ('API_TOKEN', 'OAUTH')`. Las filas existentes quedan `API_TOKEN` |
| `DROP NOT NULL` | En `correo`, `token_cifrado`, `token_iv`, `token_tag` y `token_ultimos4`. Los CHECK de largo de IV y etiqueta (`configuracion_jira_iv_ck`, `configuracion_jira_tag_ck`) siguen y aceptan nulos |
| CHECK `configuracion_jira_metodo_credencial_ck` | `(metodo = 'API_TOKEN' AND correo IS NOT NULL AND token_cifrado IS NOT NULL AND token_iv IS NOT NULL AND token_tag IS NOT NULL AND token_ultimos4 IS NOT NULL) OR (metodo = 'OAUTH' AND correo IS NULL AND token_cifrado IS NULL AND token_iv IS NULL AND token_tag IS NULL AND token_ultimos4 IS NULL)` |
| `sitio_url` | Sigue `NOT NULL`. Con OAuth guarda la URL del sitio elegido: se muestra, arma los enlaces «Abrir en Jira» y es el `sitio_host` del historial. Nunca se llama a esa URL |
| Permisos | Sin cambios: sigue sin `DELETE` (005) |

**`conexion_oauth_jira` (nueva, una sola fila)**

| Columna | Tipo | Regla |
| --- | --- | --- |
| `id` | `smallint PRIMARY KEY DEFAULT 1` | CHECK `id = 1` |
| `estado` | `varchar(20) NOT NULL` | CHECK `IN ('CONECTADA', 'PENDIENTE_SITIO', 'RECONEXION_NECESARIA')` |
| `cloud_id` | `varchar(36) NULL` | CHECK `cloud_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'` (se guarda en minúsculas) |
| `sitio_url` | `varchar(100) NULL` | CHECK `sitio_url ~ '^https://[a-z0-9][a-z0-9-]{0,62}\.atlassian\.net$'` |
| `sitio_nombre` | `varchar(150) NULL` | |
| `sitios_candidatos` | `jsonb NULL` | CHECK `IS NULL OR (jsonb_typeof(sitios_candidatos) = 'array' AND jsonb_array_length(sitios_candidatos) BETWEEN 2 AND 50)`. Solo `{id, nombre, url}` |
| `cuenta_id` | `varchar(128) NULL` | `accountId` de `/myself` |
| `cuenta_nombre` | `varchar(150) NULL` | `displayName` (o el correo o el `accountId`, supuesto S3) |
| `scopes_concedidos` | `varchar(400) NOT NULL` | Separados por espacio |
| `acceso_cifrado`, `acceso_iv`, `acceso_tag` | `bytea NULL` | IV de 12 bytes y etiqueta de 16 (CHECK de largo) |
| `renovacion_cifrada`, `renovacion_iv`, `renovacion_tag` | `bytea NULL` | Ídem |
| `acceso_expira_en` | `timestamptz NULL` | |
| `renovado_en` | `timestamptz NULL` | |
| `llave_version` | `smallint NOT NULL DEFAULT 1` | |
| `conectado_por_id`, `conectado_por_nombre`, `conectado_en` | `uuid NOT NULL`, `varchar(150) NOT NULL`, `timestamptz NOT NULL` | Quién conectó por última vez |
| `actualizado_en` | `timestamptz NOT NULL DEFAULT now()` | |

CHECK por estado:
- `conexion_oauth_tokens_ck`: los seis `bytea` y `acceso_expira_en` son nulos **si y solo si** `estado = 'RECONEXION_NECESARIA'`.
- `conexion_oauth_pendiente_ck`: `(estado = 'PENDIENTE_SITIO') = (sitios_candidatos IS NOT NULL)`. Además, en `PENDIENTE_SITIO`, `cloud_id`, `sitio_url`, `sitio_nombre`, `cuenta_id` y `cuenta_nombre` son nulos.
- `conexion_oauth_conectada_ck`: en `CONECTADA`, `cloud_id`, `sitio_url`, `sitio_nombre`, `cuenta_id` y `cuenta_nombre` no son nulos.
- En `RECONEXION_NECESARIA` se conservan la cuenta y el sitio, si los había («Última cuenta», diseño §3.2).

Permisos: conserva `DELETE`, porque desconectar y el cambio a API token borran la fila. `REVOKE TRUNCATE`.

**`oauth_estado_jira` (nueva)**

| Columna | Tipo | Regla |
| --- | --- | --- |
| `id` | `uuid PRIMARY KEY DEFAULT gen_random_uuid()` | |
| `estado_hash` | `char(64) NOT NULL UNIQUE` | CHECK `estado_hash ~ '^[0-9a-f]{64}$'` (SHA-256 en hexadecimal; el `state` nunca se guarda) |
| `actor_id` | `uuid NOT NULL` | Administrador que inició |
| `creado_en` | `timestamptz NOT NULL DEFAULT now()` | |
| `expira_en` | `timestamptz NOT NULL` | CHECK `expira_en > creado_en` (10 minutos) |
| `usado_en` | `timestamptz NULL` | |

- Disparador `oauth_estado_solo_consumo` (`BEFORE UPDATE`), con su función `"integraciones"."oauth_estado_solo_consumo_fn"()`. Solo deja pasar `usado_en` de nulo a una fecha, una vez. Cualquier otro cambio lanza `23001`, como los disparadores de E5.
- Conserva `DELETE` solo para la purga de los estados de más de 1 día, que hace `oauth/iniciar` (D211). `REVOKE TRUNCATE`.
- Consumo atómico: `UPDATE "integraciones"."oauth_estado_jira" SET usado_en = now() WHERE estado_hash = $1 AND actor_id = $2 AND usado_en IS NULL AND expira_en > now() RETURNING id`.

**`evento_oauth_jira` (nueva, solo inserción)**

| Columna | Tipo | Regla |
| --- | --- | --- |
| `id_evento` | `uuid PRIMARY KEY DEFAULT gen_random_uuid()` | |
| `fecha` | `timestamptz NOT NULL DEFAULT now()` | Índice `evento_oauth_jira_fecha_idx (fecha DESC)` |
| `actor_id`, `actor_nombre` | `uuid NOT NULL`, `varchar(150) NOT NULL` | En `REFRESCO_FALLIDO`, el Administrador cuya operación disparó la renovación |
| `tipo` | `varchar(20) NOT NULL` | CHECK `IN ('CONECTAR_OAUTH', 'RECONECTAR', 'DESCONECTAR', 'REFRESCO_FALLIDO')` |
| `sitio_nombre`, `cuenta_nombre` | `varchar(150) NULL` | |
| `codigo` | `varchar(40) NULL` | CHECK `codigo IS NULL OR codigo ~ '^[A-Z_]{3,40}$'` y `(tipo = 'REFRESCO_FALLIDO') = (codigo IS NOT NULL)` |

`REVOKE UPDATE, DELETE, TRUNCATE`. Nunca guarda tokens, `code`, `state` ni el secreto.

- **Prisma:** se suman los modelos `ConexionOauthJira`, `OauthEstadoJira` y `EventoOauthJira`. `ConfiguracionJira` suma `metodo` y vuelve opcionales `correo`, `tokenCifrado`, `tokenIv`, `tokenTag` y `tokenUltimos4`. El comentario «lo que Prisma no expresa» suma los CHECK, el disparador y los `REVOKE` de esta migración.
- **Nube:** `infrastructure/nube/007_rls_oauth_jira_nube.sql`, ya escrito. Activa RLS en las 3 tablas nuevas, con la política `servicio_integraciones` solo para `svc_integraciones`, y quita todo a `anon`, `authenticated` y `service_role`. Repite los `REVOKE` porque en la nube los privilegios por defecto los vuelven a otorgar. Se aplica **después** de la migración, como 005 y 006. `q360-infra` lo revisa: es su carpeta y lo escribió el arquitecto a pedido de la corrida.

### Organización

**No tiene migración ni cambios.**

## Variables

| Servicio | Variable | Defecto | Nota |
| --- | --- | --- | --- |
| Integraciones | `JIRA_OAUTH_CLIENT_ID` | — | Opcional y no fatal (D216). En Vercel: Production, *Sensitive* |
| Integraciones | `JIRA_OAUTH_CLIENT_SECRET` | — | Ídem. Nunca en el repositorio, el chat, los registros, las respuestas ni la auditoría. Solo viaja en el cuerpo JSON hacia `/oauth/token` |
| Integraciones | `JIRA_OAUTH_REDIRECT_URI` | — | Producción: `https://quality360-one.vercel.app/admin/integraciones/jira/oauth/retorno`. Debe ser `https://`, con esa ruta exacta y sin parámetros, fragmento ni credenciales. Con la bandera de prueba también admite `http://localhost:<puerto>` o `http://127.0.0.1:<puerto>`. Un valor inválido cuenta como ausente |
| Integraciones (solo pruebas) | `JIRA_OAUTH_URL_AUTORIZACION` | `https://auth.atlassian.com` | Solo con `INTEGRACIONES_PERMITIR_HOST_PRUEBA=true`, fuera de producción y con la forma `http://127.0.0.1:<puerto>` (D213) |
| Integraciones (solo pruebas) | `JIRA_OAUTH_URL_API` | `https://api.atlassian.com` | Ídem |

`oauthDisponible` es `true` solo con las tres primeras válidas. Un valor inválido se registra una vez, sin el valor. El gateway y el portal no tienen variables nuevas.

## Paquetes de trabajo por agente (sin archivos en común)

### q360-integraciones · `services/integraciones/**`

| Id | Tarea | Archivos | Escenarios |
| --- | --- | --- | --- |
| JO1 | Migración `20261122000000_e5_oauth_jira`, Prisma y las pruebas de modelo: CHECK, disparador de `usado_en`, `REVOKE` y compatibilidad con una fila `API_TOKEN` existente | `prisma/migrations/20261122000000_e5_oauth_jira/migration.sql`, `prisma/schema.prisma`, `test/integracion/e5-b08-modelo.test.ts` (nuevo) | B08#2, #3, #12, #14 (modelo) |
| JO2 | Variables y cifrado. `configuracion.ts` lee las 5 variables con las reglas de D216 y D213. `CifradorToken` suma `cifrarSecreto(texto, datoAsociado)` y `descifrarSecreto(cifrado, datoAsociado)`, con los datos asociados de D214 | `src/configuracion.ts`, `src/aplicacion/puertos.ts` (solo `CifradorToken`), `src/infraestructura/cifrado/cifrador-aes-gcm.ts`, `test/salud.test.ts`, `test/infraestructura/cifrado/cifrador-aes-gcm.test.ts` (nuevo) | B08#2, #11, B01#1 (ajuste) |
| JO3 | Dominio OAuth puro, sin infraestructura: permisos requeridos y por endpoint con `permisosFaltantes()`, filtro y orden de sitios (D212), armado de la URL de autorización, máquina de estados de la conexión (qué estado y qué evento corresponde a cada resultado) y los errores nuevos | `src/dominio/oauth/permisos.ts`, `src/dominio/oauth/sitios.ts`, `src/dominio/oauth/autorizacion.ts`, `src/dominio/oauth/conexion.ts` (todos nuevos), `src/dominio/errores.ts`, `test/dominio/oauth.test.ts` (nuevo) | B08#1, #5, #6, #9, #14 |
| JO4 | Frontera con Atlassian. Puerto `AutorizadorAtlassian` (canje, renovación y sitios) y su cliente HTTP: hosts fijos, `redirect: 'manual'`, cuerpo de error sin leer, 2xx acotado y validado, y clasificación por estado (definitivo o pasajero). `FuenteJira` con Bearer, según el aviso de arriba. Dobles de prueba | `src/dominio/puertos/autorizador-atlassian.ts` (nuevo), `src/dominio/puertos/fuente-jira.ts`, `src/infraestructura/atlassian/cliente-atlassian-http.ts` (nuevo), `src/infraestructura/jira/cliente-jira-http.ts`, `test/ayudas.ts`, `test/infraestructura/atlassian/cliente-atlassian-http.test.ts` (nuevo), `test/infraestructura/jira/cliente-jira-http.test.ts` | B08#2, #4, #7, #10, #14, B01#2 |
| JO5 | Repositorio de la conexión y `CredencialesJira`. Lectura sin candado si faltan más de 5 minutos. Si no, renovación serializada según D214: `$transaction(async tx => …)` solo con `tx`, `SET LOCAL lock_timeout`, `FOR UPDATE` en SQL cruda calificada, relectura, guardar antes de usar, 55P03 → `JIRA_TIEMPO_AGOTADO`. Renovación forzada tras 401 solo si el vencimiento no cambió; un reintento por operación. Fallo definitivo → `RECONEXION_NECESARIA` y un solo `REFRESCO_FALLIDO` | `src/aplicacion/puertos.ts` (solo `ConexionOauthRepositorio`), `src/infraestructura/prisma/conexion-oauth.prisma.repositorio.ts` (nuevo), `src/aplicacion/credenciales-jira.ts` (nuevo), `test/integracion/def-e5c-05-sql-calificadas.test.ts`, `test/integracion/e5-b08-renovacion.test.ts` (nuevo, con la carrera de dos renovaciones) | B08#7–#10 |
| JO6 | Servicio OAuth, controlador y validación: iniciar (purga, `state`, URL), retorno (algoritmo del ADR 0019), sitio y desconectar. Orden 401 → 403 → 400 → 503 → 409 → ejecución. Eventos `CONECTAR_OAUTH`, `RECONECTAR` y `DESCONECTAR`. Ningún `code`, `state` ni token en registros o errores | `src/aplicacion/oauth-jira.servicio.ts` (nuevo), `src/api/controladores/oauth.controller.ts` (nuevo), `src/api/validacion/oauth.ts` (nuevo), `src/api/filtros/filtro-integraciones.ts`, `src/app.module.ts`, `test/integracion/e5-b08-oauth.test.ts` (nuevo) | B08#1–#6, #11–#14 |
| JO7 | Configuración y consulta con el método. `GET` con `metodo`, `oauthDisponible` y `oauth`. `PUT` y `probar` con `metodo` y con el cambio de método de D209 (borra la conexión y registra `DESCONECTAR`, o deja nulos el correo y el token). `probar` OAuth sin proyecto usa `probarCuenta`. Eventos mezclados por fecha. Consultar y continuar obtienen la credencial de `CredencialesJira`; `sitioHost` y los enlaces salen del sitio OAuth. 503 `JIRA_OAUTH_NO_CONFIGURADO` con el método OAuth sin las variables | `src/aplicacion/configuracion.servicio.ts`, `src/aplicacion/vistas.ts`, `src/aplicacion/consulta.servicio.ts`, `src/api/validacion/cuerpos.ts`, `src/api/controladores/conexion.controller.ts`, `src/infraestructura/prisma/configuracion.prisma.repositorio.ts`, `src/infraestructura/prisma/mapeadores.ts`, `src/dominio/tipos.ts`, `test/integracion/e5-b01-configuracion.test.ts`, `test/integracion/e5-b02-consulta.test.ts` | B01#1–#6, B02#7, B08#7–#11 y la parte de servidor de F01#4, #5, F02#6, F08#8–#11 |
| JO8 | Documentación del servicio, sin valores | `.env.example`, `README.md` (ambos de `services/integraciones`) | — |

Reglas:
- El dominio no importa nada de infraestructura. La aleatoriedad y el hash del `state` (`node:crypto`) van en la aplicación.
- Ningún token, `code`, `state` ni el secreto aparecen en registros, errores, auditoría o `detalle_ejecucion`. Una prueba de JO6 lo verifica capturando los registros.
- Ninguna SQL toca otro esquema.

### q360-seguridad-gateway · `apps/gateway/**`

| Id | Tarea | Archivos | Escenarios |
| --- | --- | --- | --- |
| GO1 | Declarar las 4 rutas una por una: `@Post('jira/oauth/iniciar')`, `@Post('jira/oauth/retorno')`, `@Post('jira/oauth/sitio')` y `@Delete('jira/oauth')`. Sin query; el cuerpo, tal cual; el 204 del `DELETE` sale sin cuerpo y con `x-trace-id`. Van al cubo de escritura general. No se registra el cuerpo de `oauth/retorno` ni la respuesta de `oauth/iniciar`: hoy el reenviador no registra cuerpos, y una prueba lo fija. El comentario de cabecera pasa a 22 rutas y 24 operaciones | `src/api/integraciones.controller.ts`, `pruebas/e5-integraciones.test.ts` (de 18 a 22 rutas y de 20 a 24 operaciones; las 4 nuevas entran en las listas de 401, de 403 tal cual y de 503; más una prueba que captura los registros y no encuentra `code` ni `state`) | B08#13, #14, F08#12 |

### q360-frontend · `apps/web/**` (sigue el diseño §2 a §11)

| Id | Tarea | Archivos | Escenarios |
| --- | --- | --- | --- |
| FO1 | Tipos regenerados. Cliente API: `iniciarConexionOauth`, `completarConexionOauth`, `elegirSitioOauth`, `desconectarOauth`, y `probar` y `guardar` con `metodo`. Mocks MSW de las 4 rutas y del `GET` nuevo. `ETIQUETAS_CAMPO_CONFIGURACION.metodo`. Textos de §9 y traducción de permisos (§3.2). Deja el typecheck en verde | `src/api/integraciones.ts`, `src/mocks/dataE5.ts`, `src/mocks/handlersE5.ts`, `src/lib/mensajesIntegracion.ts`, `src/lib/rutasIntegraciones.ts` | — |
| FO2 | Captura del retorno antes de Supabase (D210). Un módulo nuevo, importado en **primer lugar** por `main.tsx`, actúa solo en `/admin/integraciones/jira/oauth/retorno`: lee `code`, `state` y `error`, limpia la dirección con `history.replaceState` y los deja en memoria para un único consumo, a prueba de StrictMode. Nada va a `localStorage` ni a `sessionStorage`. Se verifica que ningún módulo cree el cliente de Supabase al importarse. Ruta nueva dentro del `RequireRole` del Administrador, hermana de `admin/integraciones` y sin pestañas. `PaginaRetornoOauthJira` con los 11 estados de §4.2, la redirección de §4.3 y el foco de §8.1. Sin sesión al volver, la captura se descarta al iniciar sesión y se muestra el aviso de §4.1 #4 | `src/main.tsx`, `src/lib/capturaRetornoOauth.ts` (nuevo), `src/routes/router.tsx`, `src/pages/admin/integraciones/PaginaRetornoOauthJira.tsx` (nuevo) | F08#1–#3, #5, #6, #12 |
| FO3 | Tarjeta de estado (§3): `tarjeta-estado-conexion` y `chip-conexion` con el `data-estado` de la tabla «Chip de la conexión» de `decisiones-mvp.md`. Muestra `estado-oauth`, cuenta, sitio, permisos traducidos y fechas. «Probar conexión» manda solo `{metodo}` del método activo. Incluye la insignia «Lista, sin activar», `aviso-reconexion`, «Reconectar» y las acciones por estado (§3.5) | `src/components/integraciones/TarjetaEstadoConexion.tsx` (nuevo), `src/components/integraciones/Insignias.tsx` | F01#5, F08#1, #8, #10 |
| FO4 | Selector de método y panel OAuth (§2): `selector-metodo`, el botón con sus 4 estados y `aria-disabled`, `aviso-oauth-no-disponible`, `error-oauth` y el cambio de método de §6 (avisos y `confirmar-cambio-a-api-token`). El formulario del API token y «Proyecto y destino» no cambian. **`form-jira` sigue envolviendo el panel del método, «Proyecto y destino» y los botones en ambos métodos** (lo espera `e5-a11y-responsivo.spec.ts`) | `src/components/integraciones/SelectorMetodoConexion.tsx` (nuevo), `src/components/integraciones/PanelOauthJira.tsx` (nuevo), `src/components/integraciones/FormularioConexionJira.tsx`, `src/pages/admin/integraciones/PaginaConexionJira.tsx` | F01#4, F08#7, #9, #10 |
| FO5 | Lista de sitios (§5): `lista-sitios`, preselección del `actual` y `boton-elegir-sitio` con `aria-disabled` hasta elegir, más sus errores | `src/components/integraciones/ListaSitiosOauth.tsx` (nuevo) | F08#4 |
| FO6 | Desconectar, revocación y guía. Diálogo `confirmar-desconexion` con «Lo ya importado no se borra.», `ayuda-revocar-jira` y `panel-guia-oauth`, cuyo pie apunta a `docs/arquitectura/guia-oauth-atlassian.md`. Los eventos OAuth en «Cambios de configuración» siguen §3.8, con «Sistema» como actor en `REFRESCO_FALLIDO` | `src/components/integraciones/DialogoDesconexionOauth.tsx` (nuevo), `src/components/integraciones/AyudaOauthJira.tsx` (nuevo), `src/components/integraciones/ListaEventosConfiguracion.tsx` | F08#11, F01#1 (eventos) |
| FO7 | Consultar Jira con reconexión necesaria (§7): `error-consulta` con `JIRA_RECONEXION_NECESARIA`, glifo `⚠` e «Ir a Conexión». Los textos de `JIRA_SIN_PERMISO` y `JIRA_PROYECTO_NO_ENCONTRADO` dependen del método: con API token quedan los certificados (E5-F01-T04) | `src/components/integraciones/ErrorIntegracion.tsx`, `src/components/integraciones/ResultadoConsulta.tsx` | F02#6, F08#8 |
| FO8 | Pruebas unitarias y accesibilidad del portal | `src/test/e5Conexion.test.tsx` (línea 37: `OK` → `conectado-api-token`), `src/test/e5Oauth.test.tsx` (nuevo), `src/test/e5RetornoOauth.test.tsx` (nuevo) | F08#13 |

Si la ruta de retorno no queda protegida por el `RequireRole` del Administrador sin tocar `RequireAuth`, `q360-frontend` lo informa a `q360-arquitecto` antes de improvisar.

### q360-infra · `infrastructure/**`

| Id | Tarea | Archivos |
| --- | --- | --- |
| IN1 | Entorno local de pruebas. `services/integraciones/.env` suma `JIRA_OAUTH_CLIENT_ID=q360-local` y un `JIRA_OAUTH_CLIENT_SECRET` aleatorio, generado en cada preparación como la llave de cifrado y nunca versionado. También `JIRA_OAUTH_REDIRECT_URI=http://localhost:5173/admin/integraciones/jira/oauth/retorno` y `JIRA_OAUTH_URL_AUTORIZACION` y `JIRA_OAUTH_URL_API` = `http://127.0.0.1:4011`. Compose pasa las tres `JIRA_OAUTH_*` con valor vacío por defecto. Revisión de `nube/007` | `infrastructure/local/preparar-entorno.mjs`, `infrastructure/docker-compose.yml`, `infrastructure/README.md`, `infrastructure/nube/007_rls_oauth_jira_nube.sql` (solo revisión) |

### q360-qa · `tests/**` (Atlassian simulado, fixture y certificación)

- **Atlassian simulado** en `tests/support/atlassian-falso/` (`servidor.ts`, `cliente.ts`), sin dependencias, en `http://127.0.0.1:4011`, arrancado por el `globalSetup` de E5. Sirve `GET /authorize`, `POST /oauth/token`, `GET /oauth/token/accessible-resources` y `ANY /ex/jira/{cloudid}/rest/api/3/...`. Estas últimas reutilizan los manejadores del Jira falso de 4010 y exigen un Bearer vigente y el `cloudid` correcto.
- Valida `client_id` y `client_secret` contra los del `.env` local de Integraciones.
- Modos: `NORMAL`, `CONSENTIMIENTO_RECHAZADO`, `VARIOS_SITIOS`, `SIN_SITIO`, `SIN_SCOPES_JIRA`, `SCOPES_INSUFICIENTES`, `CANJE_RECHAZADO`, `RENOVACION_INVALID_GRANT` (403), `RENOVACION_CAIDA` (5xx), `ACCESO_CORTO` (`expires_in` corto), `ACCESO_REVOCADO` (401 en la API) y `SIN_PERMISO_PROYECTO`.
- Control: `POST /__control`, `POST /__reset` y `GET /__solicitudes`. Este último devuelve método, ruta, si el Bearer era válido y cuántas renovaciones hubo; nunca valores de tokens ni del secreto. La renovación invalida el token anterior de inmediato, para detectar a quien no guarda el nuevo.
- **Arnés:** `tests/support/entornoE5.ts` y `tests/playwright.config.ts`, con una variante sin las variables `JIRA_OAUTH_*` para F08#7 y B08#11, como `entornoCaido.ts`.
- **Archivos nuevos:** `tests/api/e5-b08-oauth.spec.ts`, `tests/e2e/e5-f08-oauth.spec.ts` y `tests/e2e/e5-a11y-oauth.spec.ts`, con axe en la pestaña (todos los estados), la página de retorno (11 estados) y los 2 diálogos, a 1280 y 375 px. Los IDs de caso siguen el patrón `E5-F08-Tnn`. La ruta de retorno entra en la matriz de acceso de E7-F01.
- La prueba real contra Atlassian es **E5-MAN-02**, manual y del usuario, con la guía. Ninguna prueba automática depende de Atlassian.

## Orden y dependencias

| Ola | Agente | Tarea | Depende de |
| --- | --- | --- | --- |
| 1 | integraciones | JO1 migración y Prisma | contratos |
| 1 | integraciones | JO2 variables y cifrado | contratos |
| 1 | integraciones | JO3 dominio OAuth | contratos |
| 1 | gateway | GO1 | contratos |
| 1 | frontend | FO1 tipos, API, mocks y textos | contratos |
| 1 | infra | IN1 entorno local | contratos |
| 1 | qa | Atlassian simulado y arnés | contratos, IN1 |
| 2 | integraciones | JO4 frontera con Atlassian y `FuenteJira` | JO2, JO3 |
| 2 | frontend | FO2, FO3, FO4 y FO5 contra mocks | FO1 |
| 3 | integraciones | JO5 repositorio y `CredencialesJira` | JO1, JO4 |
| 3 | frontend | FO6 y FO7 | FO3 |
| 4 | integraciones | JO6 servicio OAuth y controlador | JO5 |
| 5 | integraciones | JO7 configuración y consulta con el método, y JO8 | JO6 |
| 6 | frontend | FO8 y prueba contra el stack real con el Atlassian simulado (sin mocks) | JO7, GO1, IN1 |
| 7 | qa | Certificación: escenarios nuevos y la regresión de abajo | todo |
| 8 | usuario | E5-MAN-02 en producción, con la guía | despliegue |

Al cerrar la corrida, `q360-arquitecto` actualiza `GUIA-LOCAL.md` y el `.env.example` de la raíz con el Atlassian simulado, y revisa el trabajo de los demás agentes.

**Cierre (2026-11-23).** Hecho tras la ronda 1 de QA (`docs/validacion/certificacion-e5-oauth.md`). `GUIA-LOCAL.md` explica cómo probar «Conectar con Jira» a mano con el Atlassian simulado y qué escribe `preparar-entorno.mjs`. Los desvíos aceptados que fijan conducta quedan en D219–D223 (`decisiones-mvp.md`, «Cierre de la corrida»). Las pruebas de JO5 con `connection_limit=1` quedaron en `test/integracion/def-e5c-05-oauth.test.ts` y las de JO7 en `test/integracion/e5-b01-oauth.test.ts`. Ningún contrato cambia.

## Despliegue

1. **Supabase:** si está pausado, se reactiva y se espera `ACTIVE_HEALTHY`. Se aplica la migración con `apply_migration` (nombre `q360_integraciones_20261122000000_e5_oauth_jira`, con `set local search_path to integraciones;`) y después `infrastructure/nube/007_rls_oauth_jira_nube.sql`, con las comprobaciones de su encabezado. La migración es compatible con el código anterior.
2. **Variables:** el usuario carga `JIRA_OAUTH_CLIENT_ID`, `JIRA_OAUTH_CLIENT_SECRET` y `JIRA_OAUTH_REDIRECT_URI` en `quality360-integraciones` (Production, *Sensitive*), con `docs/arquitectura/guia-oauth-atlassian.md`. Puede hacerlo antes o después del código: sin ellas, «Conectar con Jira» aparece deshabilitado y el API token sigue funcionando.
3. **Código:** Integraciones, después el gateway (tarda ~2 min más en publicar las rutas nuevas) y al final el portal, todo con el mismo merge a `main`. **El portal no se publica sin FO1** (typecheck).
4. **Comprobación:** con sesión de Administrador, la guía §4 y luego E5-MAN-02.

## Pruebas certificadas que cambian

| Prueba | Por qué |
| --- | --- |
| `tests/e2e/e5-f01-conexion.spec.ts`, E5-F01-T01 (líneas 57 y 62) | `chip-conexion` cambia `data-estado`: `SIN_PROBAR` pasa a `sin-conectar` y `OK` a `conectado-api-token`. Además, sin configuración la pestaña abre en OAuth (diseño §2.2): antes de `llenarFormulario` se pulsa `opcion-api-token`. Ningún resultado funcional cambia |
| E5-F01-T02 (línea 69) y T05 (línea 129) | Empiezan sin configuración: suman el clic en `opcion-api-token` antes de llenar el formulario |
| `apps/web/src/test/e5Conexion.test.tsx` (línea 37) | `OK` pasa a `conectado-api-token` (FO8) |
| `tests/api/e5-b01-configuracion.spec.ts` (validaciones de contrato de las líneas 33, 48, 144, 176 y 258) | `ConfiguracionJira` y `EventoConfiguracionJira` tienen requeridos nuevos. Pasan sin tocar la prueba cuando JO7 esté listo |
| `apps/gateway/pruebas/e5-integraciones.test.ts` | De 18 a 22 rutas y de 20 a 24 operaciones (GO1) |
| `tests/api/e5-gateway.spec.ts` | Suma un caso: las 4 rutas OAuth están publicadas (no dan 404), responden 401 sin token y el 403 de Integraciones al Analista llega tal cual |
| `tests/e2e/e5-a11y-responsivo.spec.ts` (línea 54) | Sin cambio: espera `[data-testid=form-jira]`, que sigue en ambos métodos (FO4) |
| Regresión sin cambio esperado | E5-F01-T03, T04 (con API token, el texto de `JIRA_SIN_PERMISO` no cambia) y T06 a T11; E5-B01 completo con API token; E5-B02, E5-F02, E5-B05 a E5-B07 y E7-F01 |

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| supabase-js cierra la sesión al ver `error_description` en la dirección | Captura en el primer módulo de `main.tsx`, solo en la ruta de retorno, y limpieza con `replaceState` antes de crear el cliente (FO2, D210). Hay prueba unitaria con `?error=access_denied&error_description=…` |
| Dos renovaciones a la vez rompen la conexión | Candado de fila con `tx`, guardar antes de usar y la prueba de carrera de JO5 con el falso que invalida el token anterior |
| El candado y la renovación agotan los 8 s | `lock_timeout` de 3 s, tiempo límite de la renovación de min(3 s, restante) y `timeout` de la transacción de 7 s. 55P03 → `JIRA_TIEMPO_AGOTADO` (supuesto S4) |
| Merge a `main` sin FO1 rompe el build del portal | Fusionar contratos, servicio, gateway y FO1 juntos (Despliegue, paso 3) |
| La URL de retorno no coincide letra por letra | Validación de D216, guía con la URL exacta y problema frecuente documentado |
| Los scopes clásicos no bastan | E5-MAN-02 los confirma. La lista vive en una constante y el contrato no la fija como enum |
