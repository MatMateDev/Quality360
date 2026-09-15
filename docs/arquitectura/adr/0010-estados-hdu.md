# ADR 0010 · Máquina de estados de la HDU

- **Estado:** aceptada
- **Fecha:** 2026-09-15
- **Decisión base:** D10

## Contexto

E2-B02 exige validar las transiciones de estado de una HDU para respetar el orden del proceso de certificación. Una transición inválida debe rechazarse indicando las permitidas.

## Decisión

Enum `EstadoHdu`: `PENDIENTE`, `DISENO_PRUEBAS`, `EN_EJECUCION`, `PENDIENTE_CIERRE` y `CERRADA`.

| Desde | Transiciones permitidas |
| --- | --- |
| `PENDIENTE` | `DISENO_PRUEBAS` |
| `DISENO_PRUEBAS` | `EN_EJECUCION` |
| `EN_EJECUCION` | `PENDIENTE_CIERRE` |
| `PENDIENTE_CIERRE` | `CERRADA` (con checklist completo, ADR 0011), `EN_EJECUCION` (reapertura) |
| `CERRADA` | ninguna, es terminal |

- **Estado inicial:** toda HDU nace en `PENDIENTE`. El historial registra un evento de creación `null → PENDIENTE`.
- **Qué se rechaza:** saltos, retrocesos distintos de la reapertura, y pedir el mismo estado. Responden 409 `TRANSICION_INVALIDA` con `estadoActual`, `estadoSolicitado` y `transicionesPermitidas`.
- **Quién puede cambiarlo:** el analista asignado, un QE con la HDU en su ámbito y el Administrador. La credencial de servicio puede avanzar estados para la semilla, pero no pedir `CERRADA`.
- **Qué registra una transición aceptada:** actualiza `estadoActualizadoEn`, y en la misma transacción escribe el historial (anterior, nuevo, actor y fecha) y la auditoría `CAMBIAR_ESTADO_HDU`.
- **Qué recibe el portal:** el detalle de la HDU trae `transicionesPermitidas` y `permisos.cambiarEstado`, para mostrar solo acciones válidas. El servicio vuelve a validar siempre.
- **Dónde vive la tabla:** en `EstadoHdu.x-transiciones` del contrato y en una única función de dominio de Organización.

## Consecuencias

- La regla está en un solo lugar del dominio y su tabla es verificable contra el contrato.
- Una HDU `CERRADA` no se reabre. Si E3 necesita invalidar un certificado, lo decidirá en un ADR nuevo.
- En esta corrida ninguna HDU puede llegar a `CERRADA` (ADR 0011), ni siquiera en la semilla.
- El bloqueo por impedimentos (E4) no será un estado: se modelará aparte para no romper esta tabla.

## Alternativas descartadas

- **Transiciones libres con confirmación:** el backlog exige orden (E2-B02#2).
- **Usar el estado de Jira:** los estados de origen se guardan tal cual como `estadoOrigen` en E5, sin traducirse a estados QA.
- **Un estado `BLOQUEADA`:** mezclaría el ciclo de certificación con el de impedimentos.
