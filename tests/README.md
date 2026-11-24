# tests · Pruebas end-to-end, de contrato y de seguridad con el ID del escenario en el nombre · dueño: q360-qa.

## E5 OAuth (Conectar con Jira)

- **Atlassian simulado:** `support/atlassian-falso/` (`servidor.ts`, `cliente.ts`), en `http://127.0.0.1:4011`, sin dependencias. Lo arranca `support/globalSetupE5.ts` junto con el Jira falso (:4010). Lee el Client ID y el secreto del `.env` de Integraciones; nunca devuelve ni registra tokens, `code`, `state` ni el secreto (`GET /__solicitudes` solo trae método, ruta, estado, si el Bearer era válido y contadores; `POST /__fugas` dice qué clases de secreto contiene un texto sin revelarlas).
- **Modos** (`POST /__control {modo}`): `NORMAL`, `CONSENTIMIENTO_RECHAZADO`, `VARIOS_SITIOS`, `SIN_SITIO`, `SIN_SCOPES_JIRA`, `SCOPES_INSUFICIENTES`, `CANJE_RECHAZADO`, `RENOVACION_INVALID_GRANT`, `RENOVACION_CAIDA`, `ACCESO_CORTO`, `ACCESO_REVOCADO`, `SIN_PERMISO_PROYECTO` y dos extensiones de QA: `SITIOS_HOSTILES` y `RENOVACION_LIMITE`. Además `expiresIn`, `avanzarSegundos` (adelanta el reloj del falso) y `estadoProyecto`.
- **Variante sin `JIRA_OAUTH_*`:** `levantarIntegracionesSinOauth` y `pilaSinOauth` en `support/entornoE5.ts` (E5-F08#7, E5-B08#11).
- **Pruebas propias del falso:** `npx playwright test --project=atlassian-falso` (no necesita el stack).
- **Escenarios:** `api/e5-b08-oauth.spec.ts`, `e2e/e5-f08-oauth.spec.ts`, `e2e/e5-a11y-oauth.spec.ts` y `T04c`/`T04d` de `e2e/e7-f01-ingreso-por-rol.spec.ts`. Los marcados `@pendiente-backend` o `@pendiente-frontend` fallan hasta que lleguen los paquetes de los constructores; no certifican nada hasta pasar.
- El puerto 4011 era el «sitio cerrado» de E5-F01/E5-B01 (`SITIO_CERRADO`); ahora es `http://127.0.0.1:4019`.
