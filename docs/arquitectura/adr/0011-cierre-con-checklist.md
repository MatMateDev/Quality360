# ADR 0011 · El cierre de una HDU exige el checklist completo, consultado a Certificaciones

- **Estado:** aceptada
- **Fecha:** 2026-09-15
- **Decisión base:** D11

## Contexto

E2-B02#3 pide rechazar el paso a `CERRADA` mientras falten entregables. El checklist de 10 entregables pertenece a Certificaciones y llega con E3, fuera del alcance de esta corrida. La regla no negociable 4 prohíbe tratar una fuente caída como dato: no se puede suponer el checklist completo ni vacío.

## Decisión

- **Consulta:** para pasar de `PENDIENTE_CIERRE` a `CERRADA`, Organización consulta `GET /v1/hdu/{hduId}/checklist` de Certificaciones.
  - Propaga `Authorization` y `x-trace-id`.
  - El tiempo límite es de 2 s, configurable con `CERTIFICACIONES_TIMEOUT_MS`.
- **Resultado según la respuesta de Certificaciones:**

  | Respuesta de Certificaciones | Resultado |
  | --- | --- |
  | 200 con `completo: true` | Se cierra la HDU. |
  | 200 con `completo: false` | 409 `CHECKLIST_INCOMPLETO` |
  | 503 `CAPACIDAD_NO_DISPONIBLE`, otro error o tiempo agotado | 409 `CHECKLIST_NO_DISPONIBLE` |

  Los dos 409 usan el esquema `ErrorCierreRechazado`, que incluye el bloque `checklist`.
- **En esta corrida:** Certificaciones responde 503 `CAPACIDAD_NO_DISPONIBLE` después de autenticar, así que todo cierre se rechaza con `CHECKLIST_NO_DISPONIBLE` y el mensaje «No se puede cerrar la HDU: el checklist de entregables no está disponible para verificarse».
- **Detalle de HDU:** el gateway compone el bloque `checklist`, que hoy siempre llega `indisponible`. El portal muestra el avance como «no disponible», nunca como 0 %.
- **Desde E3:** Certificaciones implementa la respuesta 200 (`ResumenChecklist`) sin cambiar el contrato de Organización ni el del gateway.

## Consecuencias

- E2-B02#3 se verifica en esta corrida con `CHECKLIST_NO_DISPONIBLE`. `q360-qa` debe dejar escrita esa interpretación en el dictamen; `CHECKLIST_INCOMPLETO` queda cubierto por contrato para E3.
- Se usa 409 y no 503 hacia el cliente: la solicitud es válida, pero la regla de negocio no permite cerrar sin evidencia. El portal lo muestra como rechazo, no como falla del sistema.
- Ninguna HDU de la semilla puede estar `CERRADA`.

## Alternativas descartadas

- **Permitir el cierre mientras E3 no exista:** inventa un checklist completo y viola la regla 4.
- **Copiar un indicador de checklist en Organización:** duplica datos de Certificaciones y crea dos fuentes de verdad.
- **Propagar 503 al cliente:** confunde un rechazo de negocio con una caída.
