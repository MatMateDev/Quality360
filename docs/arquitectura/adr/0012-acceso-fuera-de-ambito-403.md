# ADR 0012 · Acceso fuera del ámbito: 403 `ACCESO_DENEGADO` con mensaje genérico

- **Estado:** aceptada
- **Fecha:** 2026-09-15
- **Decisión base:** D12

## Contexto

E2-F04#2 pide «acceso denegado» cuando un usuario abre una HDU con la que no está relacionado. E1-B02#2-3, E1-B04#2 y E1-B05#3 piden impedir el acceso por ámbito entre analistas y equipos. La regla 5 exige errores genéricos que no revelen información.

## Decisión

- **Un solo código** para todo rechazo de autorización: 403 `ACCESO_DENEGADO`, mensaje «No tienes acceso a este recurso» y `detalles` vacío. Aplica a:
  - Rol no permitido para la operación.
  - Usuario inactivo o sin registro en Organización, aunque su token sea válido.
  - Recurso fuera del ámbito: HDU ajena, equipo de otro QE, resumen de otro analista.
- **Sin revelar existencia.** Para QE y Analista QA, una HDU que no existe también responde 403. El 404 `NO_ENCONTRADO` solo lo recibe el Administrador, que puede ver todo. `GET /v1/interno/hdu/{id}/acceso` responde `permitido: false` en ambos casos.
- **Autenticación aparte.** La sesión ausente o inválida es 401 `NO_AUTENTICADO`, y la vencida 401 `SESION_EXPIRADA`, nunca 403.
- **Quién decide.** El servicio dueño del recurso, no el gateway, que solo propaga la respuesta.
- **Motivo real.** Rol, inactivo, ámbito o inexistente se escriben en el log del servicio con el `traceId`, nunca en la respuesta.
- **Portal.** Ante un 403 en una ruta de datos muestra la pantalla «Acceso denegado». Ante un 403 de `GET /v1/me` cierra la sesión y muestra el mensaje genérico del login.

## Consecuencias

- Las pruebas de acceso cruzado de `q360-qa` esperan 403, tanto por URL directa como por API, también con identificadores inventados.
- Diagnosticar un 403 exige buscar el `traceId` en los logs del servicio.
- Ocultar acciones en el portal es solo una ayuda: la autorización real se valida en cada solicitud.

## Alternativas descartadas

- **404 para recursos fuera de ámbito:** oculta la existencia, pero contradice el «acceso denegado» del backlog.
- **Mensajes específicos** («usuario desactivado», «no supervisas a este analista»): facilitan enumerar usuarios y relaciones.
- **403 para la sesión vencida:** impediría que el portal distinga entre volver al login y mostrar acceso denegado.
