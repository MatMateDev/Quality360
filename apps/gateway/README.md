# `apps/gateway`

Gateway público de Quality360 (NestJS 11, puerto 3000). Es el **único punto de entrada público**: verifica la sesión, enruta a Organización y compone los paneles de inicio. Contrato: `contracts/gateway.v1.yaml`.

- Dueño: `q360-seguridad-gateway`.
- **El gateway autentica, no autoriza.** El rol vigente, el estado activo y el ámbito los valida el servicio dueño en cada solicitud (D4).
- **Nunca recibe contraseñas.** El portal se autentica directo con Supabase (`signInWithPassword`) y envía el access token.
- **No consulta Postgres.** Solo habla HTTP con los servicios internos.

## Arranque

```bash
npm install --workspace apps/gateway
npm run build --workspace packages/auth-nest   # dependencia interna
npm run build --workspace apps/gateway
npm start --workspace apps/gateway             # o npm run start:dev, que lee .env
curl http://localhost:3000/health              # {"estado":"ok"}
```

## Endpoints expuestos

| Método y ruta | Destino |
| --- | --- |
| `GET /health` | Local, sin sesión. |
| `GET /v1/me` | Organización. |
| `GET /v1/inicio/admin` | Compone `usuarios` + `supervision`. |
| `GET /v1/inicio/qe` | Compone `equipo` + `hdu`. |
| `GET /v1/inicio/qa` | Compone `supervisor` + `hdu` (propaga `analistaId`). |
| `GET /v1/qe/analistas`, `GET /v1/qe/analistas-asignables` | Organización. |
| `GET /v1/usuarios`, `POST /v1/usuarios`, `PATCH /v1/usuarios/{id}`, `PUT /v1/usuarios/{id}/rol` | Organización. |
| `PUT /v1/analistas/{id}/supervisor`, `GET /v1/analistas/{id}/supervision/historial` | Organización. |
| `GET /v1/auditoria`, `GET /v1/catalogos/celulas`, `GET /v1/catalogos/sprints` | Organización. |
| `GET /v1/hdu`, `POST /v1/hdu`, `PUT /v1/hdu/{id}/analista`, `POST /v1/hdu/{id}/estado`, `GET /v1/hdu/{id}/historial` | Organización. |
| `GET /v1/hdu/{id}` | Organización (obligatoria) + bloque `checklist` de Certificaciones. |
| `/v1/certificaciones/*`, `/v1/impedimentos/*`, `/v1/integraciones/*` | 501 `CAPACIDAD_NO_DISPONIBLE` hasta que esos servicios existan. |

Las rutas están declaradas una por una: **no hay proxy comodín**. Lo que no está en la tabla responde 404 `NO_ENCONTRADO`, incluidas las rutas internas de Organización.

## Composición y fuentes caídas

`/v1/inicio/*` consulta sus fuentes en paralelo con tiempo límite por fuente (2 s por defecto, `TIEMPO_LIMITE_FUENTE_MS`).

- Si una fuente responde 400, 401, 403 o 404, se devuelve esa respuesta completa.
- Cualquier otro fallo o tiempo agotado deja **ese** bloque en `{"fuente": "...", "estado": "indisponible"}`, sin `datos`, y la respuesta sigue siendo 200. Nunca se rellena con ceros ni con listas vacías: un 0 significa «consulta exitosa sin registros».
- Cada bloque tiene su propia URL, así que se puede tumbar una sola fuente:

```bash
# Deja hdu indisponible en /v1/inicio/qe y /v1/inicio/qa, con el resto en ok
FUENTE_RESUMEN_HDU_URL=http://127.0.0.1:9 npm start --workspace apps/gateway
```

En esta corrida el bloque `checklist` de `GET /v1/hdu/{id}` siempre queda `indisponible`: Certificaciones responde 503 `CAPACIDAD_NO_DISPONIBLE` hasta E3 (D11).

## Sesión: qué revoca `signOut` y qué no

`signOut` de Supabase Auth **revoca el refresh token**, así que la sesión no se puede renovar y el portal queda desconectado. Pero **el access token ya emitido sigue siendo válido hasta su `exp`**: está firmado y el gateway lo verifica sin consultar al proveedor, de modo que quien haya copiado ese token puede seguir usándolo durante lo que le quede de vida (E1-B11#3, ADR 0003 y ADR 0004).

Mitigaciones en uso y recomendadas:

1. **TTL corto en Supabase.** Configurar `JWT expiry` en 3600 s o menos (en local, `[auth] jwt_expiry` de `supabase/config.toml`). Es la ventana máxima de exposición.
2. **La autorización no depende del token.** Aunque el access token siga vivo, un usuario desactivado o con otro rol pierde acceso en su siguiente solicitud, porque el rol y el estado activo se leen de Organización cada vez (D4, E1-B07#3).
3. **Token vencido → 401 `SESION_EXPIRADA`** (E1-B11#1), distinto de `NO_AUTENTICADO`, para que el portal mande al login en vez de mostrar «acceso denegado».
4. El portal limpia su caché al cerrar sesión; el token no se guarda en cookies del gateway.

## Seguridad del borde

- **CORS** solo para los orígenes de `PORTAL_ORIGENES`; cualquier otro no recibe cabeceras CORS.
- **helmet** con sus valores por defecto y `x-powered-by` deshabilitado.
- **`Cache-Control: no-store`** en todas las respuestas: no se cachean datos de sesión (E1-B06#3).
- **Límite de tasa** en `/v1/*` (`LIMITE_TASA_MAX`) y más estricto en escrituras (`LIMITE_TASA_ESCRITURA_MAX`), con 429 `DEMASIADAS_SOLICITUDES` y `Retry-After`.
- **`X-Q360-Servicio-Token` se elimina** de toda solicitud entrante y nunca se agrega al reenviar: esa credencial es solo de Integraciones hacia Organización. El reenvío arma sus cabeceras con lista blanca (`Authorization`, `x-trace-id`, `accept`, `content-type`), así que cookies y cabeceras inventadas no viajan.
- **Los `{id}` de ruta se validan como UUID** antes de construir la URL del servicio (400 `VALIDACION`), lo que corta intentos como `/v1/hdu/..%2Finterno%2Facceso`.
- **Trazas:** cada respuesta lleva `x-trace-id`, que se propaga a los servicios y coincide con `Error.traceId`. Una traza entrante se acepta solo si tiene forma segura; si no, se genera otra.
- Los motivos reales de un 401 o un 403 quedan en el log con su `traceId`; la respuesta siempre es genérica.

## Variables de entorno

Ver `.env.example`. Obligatoria: `SUPABASE_URL` (o bien `SUPABASE_JWT_ISSUER` más `SUPABASE_JWKS_URL`). El resto tiene valores por defecto razonables para local, salvo `SUPABASE_JWT_SECRET`, que si no existe deshabilita el respaldo HS256.

## Pruebas

```bash
npm test --workspace apps/gateway
```

35 pruebas de integración con servicios falsos, sin Supabase ni Docker: bloque `indisponible` con la fuente caída o lenta, respuesta directa de una fuente con 403, servicio caído → 503, token vencido → `SESION_EXPIRADA`, eliminación de `X-Q360-Servicio-Token`, rutas `/v1/interno/*` no expuestas, recorrido de ruta manipulado, 501 de otros servicios, JSON mal formado, CORS, helmet y límite de tasa.
