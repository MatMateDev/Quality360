# ADR 0009 · Las HDU, células, sprints, asignación e historial viven en Organización y seguimiento

- **Estado:** aceptada
- **Fecha:** 2026-09-15
- **Decisión base:** D9

## Contexto

E2 necesita registrar HDU, asignar analistas, cambiar estados y consultar historial con el ámbito de rol de E1. El informe asigna a Organización y seguimiento la organización de HU y sprints; los ciclos de certificación y el checklist llegan con E3 a Certificaciones.

## Decisión

- El esquema `organizacion` guarda `celula`, `sprint`, `hdu`, `hdu_historial_estado` y `hdu_historial_asignacion`, junto a `usuario`, `supervision` y `auditoria`.
- En el MVP, cada HDU pertenece a **una** célula y **un** sprint. La participación en varios sprints (`HistoriaSprint` del modelo de clases), `codigoOrigen` y `estadoOrigen` quedan para E5.
- **Ámbito:**
  - Analista QA: HDU con `analistaId` propio.
  - QE: HDU donde es QE responsable, o cuyo analista supervisa hoy.
  - Administrador: todas.
- **Asignación de analista:**
  - La hacen el QE responsable de la HDU o el Administrador.
  - Si asigna un QE, el analista debe ser de su equipo vigente. El Administrador puede asignar a cualquier Analista QA activo.
  - Reasignar exige motivo. Una HDU `CERRADA` no se reasigna.
- **Cambio de estado:** lo pueden hacer el analista asignado, un QE con la HDU en su ámbito y el Administrador (ADR 0010).
- **Otros servicios** referencian la HDU por `hduId` (UUID) y resuelven acceso con `GET /v1/interno/hdu/{id}/acceso`. Integraciones incorpora HDU solo por la API de Organización.

## Consecuencias

- Organización concentra E1 y E2 y es el servicio más grande del MVP. Sus módulos internos (usuarios, supervisión, catálogos y HDU) deben quedar separados en `aplicacion/` y `dominio/`.
- Los bloques `equipo` y `hdu` del inicio del QE vienen del mismo servicio. Para probar «fuente de HDU caída» (E1-B03#3, E1-F06#3), el gateway configura una URL propia para la fuente de HDU (ADR 0007).
- Un QE que supervisa al analista, pero no es el responsable, puede ver y cambiar el estado de la HDU, pero no reasignarla.
- Cuando llegue E3, Certificaciones guardará sus ciclos con `hdu_id` sin clave foránea.

## Alternativas descartadas

- **HDU en Certificaciones:** mezclaría la organización del trabajo con la evidencia de certificación, y obligaría a Integraciones a escribir en dos servicios.
- **Un quinto servicio de HDU:** no está en la topología del informe y suma un despliegue más.
- **Asignación permitida a cualquier QE del ámbito:** abre reasignaciones cruzadas entre equipos que el backlog no pide.
