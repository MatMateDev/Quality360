# services/integraciones · Integración con Jira Cloud y archivos CSV/JSON (NestJS + Prisma)

Dueño: q360-backend (API, aplicación, persistencia, cifrado y despliegue). La frontera con Jira y con los archivos
(`src/dominio/mapeo/**`, `src/dominio/puertos/fuente-jira.ts`, `src/infraestructura/jira/**`, `src/infraestructura/archivos/**`)
es de q360-integraciones. Puerto 3004. Corrida E5 (D93–D128).

- Capas: `api` → `aplicacion` → `dominio`, con `infraestructura` detrás de puertos. El dominio no importa Nest, Prisma ni `fetch`.
- Contrato: `contracts/integraciones.v1.yaml`.
- Este servicio **no** lee el esquema `organizacion`: resuelve el acceso con `GET /v1/interno/acceso` y escribe las HDU solo con
  `POST /v1/interno/integraciones/hdu/upsert`, siempre con el token del Administrador (D100, D126).
- Pruebas: `npm test -w services/integraciones` (Postgres local; Organización y Jira simulados con implementaciones falsas).

## Variables de entorno

Ninguna tumba el arranque, salvo `DATABASE_URL` ausente (D127, D128). Los mensajes de error nombran la variable, nunca su valor.
Las de ejemplo están en `.env.example`.

| Variable | Defecto | Nota |
| --- | --- | --- |
| `DATABASE_URL` | — | Rol `svc_integraciones`, con `?schema=integraciones` |
| `SUPABASE_URL` | — | Verificación de la sesión (JWKS) |
| `ORGANIZACION_URL` | `http://localhost:3001` | En producción, si falta o es inválida, todo `/v1/*` responde 503 y `/health` responde 200 |
| `ORGANIZACION_TIMEOUT_MS` | 5000 | Se acota por el presupuesto restante (D114) |
| `INTEGRACIONES_LLAVE_CIFRADO` | — | 32 bytes en Base64. Si falta o es inválida: `llaveDisponible: false` y solo cifrar o descifrar responde 503 `LLAVE_CIFRADO_NO_DISPONIBLE` |
| `INTEGRACIONES_PRESUPUESTO_MS` | 8000 | D96, D114 |
| `JIRA_TIEMPO_LIMITE_MS` | 3000 | |
| `JIRA_ESPERA_MAX_429_MS` | 3000 | |
| `JIRA_TOPE_ISSUES` | 100 | |
| `INTEGRACIONES_EN_CURSO_MAX_MS` | 300000 | D104 |
| `INTEGRACIONES_PERMITIR_HOST_PRUEBA` | `false` | Se **ignora** con `NODE_ENV=production` (D95) |

### Conexión con Jira por OAuth 2.0 (3LO) (E5, ADR 0019, D209–D218)

Opcionales y no fatales: sin las tres primeras, `oauthDisponible` es `false`, «Conectar con Jira» queda deshabilitado, las rutas
`oauth/iniciar`, `oauth/retorno` y `oauth/sitio` (y probar, guardar, consultar y continuar con el método OAuth) responden 503
`JIRA_OAUTH_NO_CONFIGURADO`, y el API token, `GET configuracion` y `DELETE …/oauth` siguen funcionando. Los valores se cargan en
Vercel (Production, *Sensitive*) con `docs/arquitectura/guia-oauth-atlassian.md`; nunca van en el repositorio, los registros ni las respuestas.

| Variable | Defecto | Nota |
| --- | --- | --- |
| `JIRA_OAUTH_CLIENT_ID` | — | Client ID de la app registrada en Atlassian |
| `JIRA_OAUTH_CLIENT_SECRET` | — | Solo viaja en el cuerpo JSON hacia `/oauth/token` |
| `JIRA_OAUTH_REDIRECT_URI` | — | `https://<portal>/admin/integraciones/jira/oauth/retorno`, ruta exacta, sin parámetros ni fragmento. Con la bandera de prueba también `http://localhost:<puerto>` o `http://127.0.0.1:<puerto>`. Inválida cuenta como ausente |
| `JIRA_OAUTH_URL_AUTORIZACION` | `https://auth.atlassian.com` | Solo pruebas: vale únicamente con `INTEGRACIONES_PERMITIR_HOST_PRUEBA=true`, fuera de producción y como `http://127.0.0.1:<puerto>` |
| `JIRA_OAUTH_URL_API` | `https://api.atlassian.com` | Ídem |

La migración `20261122000000_e5_oauth_jira` es compatible con el código anterior y se aplica antes de publicar; en la nube se sigue con
`infrastructure/nube/007_rls_oauth_jira_nube.sql`. Los tokens se guardan cifrados (AES-256-GCM, la misma llave) y la renovación se
serializa con `SELECT … FOR UPDATE` de la fila de la conexión.

## Despliegue (Vercel, quinto proyecto `quality360-integraciones`, D128)

Raíz del proyecto `services/integraciones`, con `vercel.json` y `api/index.mjs` como los de Impedimentos (`maxDuration: 30`, región `gru1`).
Variables en Vercel: `DATABASE_URL`, `SUPABASE_URL`, `ORGANIZACION_URL`, `INTEGRACIONES_LLAVE_CIFRADO` (solo Production, *Sensitive*) y,
si se cambian los valores por defecto, las de límites. **No** se agregan `NODE_ENV`, `INTEGRACIONES_PERMITIR_HOST_PRUEBA` ni `PERMITIR_CARGA_SEMILLA`.
El paso a paso (contraseña del rol, migraciones, llave, gateway, verificación) está en `docs/arquitectura/e5-plan-construccion.md`, sección «Despliegue».

Migraciones en la nube, antes de publicar el código y cada una con `set local search_path to <esquema>;`:
`services/organizacion/prisma/migrations/20261029000000_e5_origen_hdu`, `services/integraciones/prisma/migrations/20261029000000_e5_integracion_jira`
y `infrastructure/nube/005_rls_integraciones_nube.sql`.

## Prueba de punta a punta

`node services/integraciones/scripts/e2e-real.mjs` levanta Organización e Integraciones reales (dist) sobre el Supabase local y un Jira falso mínimo (`node:http`): configura, sincroniza, repite, previsualiza e importa un CSV y revisa que no haya secretos en los registros. Requiere `npm run build` en ambos servicios.
