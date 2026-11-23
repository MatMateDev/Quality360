# ADR 0019 · Conexión con Jira por OAuth 2.0 (3LO)

- **Estado:** aceptada
- **Fecha:** 2026-11-22
- **Decisiones base:** D209–D218 (`docs/backlog/e5-oauth-jira.md`, con ajustes en `decisiones-mvp.md`, sección «E5 · Conexión con Jira por OAuth 2.0 (3LO)»). Diseño: `docs/diseno/e5-oauth-jira.md`
- **Modifica:** ADR 0015 (enmienda aditiva: el API token, su cifrado y D95 siguen vigentes como método alternativo)

## Contexto

Hoy el Administrador copia y pega un API token. Atlassian no permite que una aplicación cree o lea API tokens, pero ofrece OAuth 2.0 (3LO): el usuario acepta una vez y la aplicación recibe un token de acceso (cerca de 1 hora) y uno de renovación. El de renovación **rota** en cada uso, vence tras 90 días sin uso y se invalida si cambia la contraseña. Siguen vigentes estas restricciones: un esquema por servicio (D24), sin tareas programadas (D96), 8 s por petición (D114), `connection_limit=1` con SQL cruda calificada (DEF-E5C-05), variables no fatales (D127) y la llave AES-256-GCM de D94/D128.

## Decisión

- **Flujo sin rutas públicas.** `POST /v1/integraciones/jira/oauth/iniciar` devuelve la URL de `auth.atlassian.com/authorize` (`audience=api.atlassian.com`, `prompt=consent`, la `redirect_uri` del servidor). Atlassian vuelve a la página del portal `/admin/integraciones/jira/oauth/retorno`. El portal captura `code`, `state` y `error` **antes de crear el cliente de Supabase** (que, si no, interpretaría la dirección), limpia la dirección y envía `POST …/oauth/retorno` con la sesión.
- **`state` de un solo uso.** Son 32 bytes aleatorios. Se guarda solo su hash SHA-256, ligado al Administrador, con 10 minutos de vigencia. Una sola sentencia `UPDATE … WHERE estado_hash = $1 AND actor_id = $2 AND usado_en IS NULL AND expira_en > now() RETURNING` lo valida y lo consume. Cualquier fallo da el mismo 400 `JIRA_OAUTH_ESTADO_INVALIDO` sin llamar a Atlassian.
- **Canje y renovación solo en Integraciones.** El Client secret vive solo en las variables de ese proyecto y viaja solo en el cuerpo JSON hacia `auth.atlassian.com/oauth/token`. El gateway no registra el cuerpo. El portal no ve ni el secreto ni los tokens.
- **Sitio.** `accessible-resources` se filtra por `id` UUID, por URL `https://<sub>.atlassian.net` y por `scopes` de Jira. Con un sitio, conecta. Con varios, la conexión queda `PENDIENTE_SITIO` con los candidatos y el Administrador elige con `POST …/oauth/sitio`. La API se llama en `api.atlassian.com/ex/jira/{cloudid}` con Bearer.
- **SSRF.** Los hosts son fijos en el código y el `cloudid` se valida antes de armar la URL. Se usa `redirect: 'manual'`. El cuerpo de un error de Atlassian nunca se lee: se clasifica por estado HTTP. Los 2xx tienen tamaño acotado y su forma se valida. Los hosts de prueba solo valen con `INTEGRACIONES_PERMITIR_HOST_PRUEBA=true` y fuera de producción.
- **Cifrado.** Ambos tokens usan el mismo cifrador y la misma llave. Cada uno lleva su IV, su etiqueta y un dato asociado propio (`q360:jira:oauth:acceso:v1`, `q360:jira:oauth:renovacion:v1`). No se guarda ninguna subcadena en claro.
- **Renovación serializada.** Se renueva si faltan menos de 5 minutos para el vencimiento:
  1. Se abre `$transaction(async tx => …)`, que usa solo `tx`.
  2. `SET LOCAL lock_timeout = '3s'` y `SELECT … FROM "integraciones"."conexion_oauth_jira" WHERE id = 1 FOR UPDATE`.
  3. Se relee la fila. Si otro proceso ya renovó, se usa ese token.
  4. Si no, se llama a Atlassian y se guardan el token de renovación nuevo, el acceso y el vencimiento.
  5. Se confirma la transacción **antes** de usar el acceso nuevo.

  Si no se obtiene el candado (55P03), la respuesta es `JIRA_TIEMPO_AGOTADO` y nada cambia. Un 401 de Jira provoca una renovación forzada y un reintento por petición.
- **Estados y errores.** Los estados son `CONECTADA`, `PENDIENTE_SITIO` y `RECONEXION_NECESARIA`; «Sin conectar» significa que no hay fila.
  - Un 400, 401 o 403 al renovar pasa a `RECONEXION_NECESARIA`, borra los tokens y registra `REFRESCO_FALLIDO` una vez.
  - Red, tiempo agotado, 5xx o 429 no tocan la credencial.
  - Los errores de Atlassian viajan en un 200 con código y mensaje fijos (D105).
  - Los permisos se validan al canjear y antes de cada llamada. Un 401 que sigue tras renovar es `JIRA_OAUTH_PERMISOS_INSUFICIENTES`, con la lista de lo que falta.
- **Convivencia.** `configuracion_jira.metodo` (`API_TOKEN` u `OAUTH`) decide la credencial de consultar y continuar; probar y guardar indican su propio método. La conexión OAuth vive en su propia fila y puede quedar «lista, sin activar» mientras el API token sigue activo: solo un «Probar y guardar» exitoso cambia el método y descarta la otra credencial. Un `metodo` ausente en el cuerpo equivale a `API_TOKEN`, así que el contrato certificado no cambia.
- **Auditoría.** `evento_oauth_jira` es de solo inserción, con los eventos `CONECTAR_OAUTH`, `RECONECTAR`, `DESCONECTAR` y `REFRESCO_FALLIDO`. Nunca guarda tokens, `code`, `state` ni el secreto. Se lista junto a los guardados.
- **Sin tareas programadas (D96).** La conexión solo se renueva con el uso. Tras 90 días sin uso, la pantalla pide «Reconectar».

## Consecuencias

- **Migración** `20261122000000_e5_oauth_jira`:
  - suma `metodo`;
  - vuelve opcionales las columnas del API token, con un CHECK por método;
  - crea `conexion_oauth_jira`, `oauth_estado_jira` (con DELETE solo para purgar) y `evento_oauth_jira`;
  - el RLS de la nube va en `infrastructure/nube/007_rls_oauth_jira_nube.sql`.
- **Puerto y rutas.** `FuenteJira` crece de forma aditiva con la credencial Bearer. El gateway pasa de 18 a 22 rutas y de 20 a 24 operaciones.
- **Variables.** Hay tres nuevas y opcionales: `JIRA_OAUTH_CLIENT_ID`, `JIRA_OAUTH_CLIENT_SECRET` y `JIRA_OAUTH_REDIRECT_URI`. Sin ellas, toda operación con OAuth responde 503 `JIRA_OAUTH_NO_CONFIGURADO`; desconectar y el API token siguen funcionando.
- **Límites que se aceptan:**
  - reconectar con varios sitios deja la conexión pendiente hasta que se elija uno;
  - hay una sola URL de retorno, la de producción, y en local se usa el Atlassian simulado;
  - sin «Enable sharing», solo el dueño de la app puede conectar.
- **Pruebas certificadas.** Cambian el `data-estado` del chip y un paso en tres casos de E5-F01. Ningún resultado funcional cambia.

## Alternativas descartadas

- **Callback público** en el gateway o en Integraciones: exige una ruta sin sesión que canjea códigos.
- **Tokens en el navegador:** expone el secreto y los tokens.
- **Renovar sin candado, o con un candado en memoria o `pg_advisory_lock`:** la rotación rompería la conexión entre funciones de Vercel, y el candado de sesión no sobrevive al pooler en modo transacción.
- **Tarea programada de renovación:** la prohíbe D96 y queda como mejora futura.
- **Leer el cuerpo del error para distinguir `invalid_grant`:** rompe D213, y el estado HTTP basta.
- **PKCE sin secreto:** la app es confidencial y el `state` ligado a la sesión cubre el riesgo de CSRF.
