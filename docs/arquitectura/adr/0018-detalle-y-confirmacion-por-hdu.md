# ADR 0018 · Detalle de la HDU en la consulta y confirmación una a una

- **Estado:** aceptada
- **Fecha:** 2026-11-05
- **Decisiones base:** D196–D207 (`docs/backlog/e5-detalle-asignacion-por-hdu.md`, con ajustes en `decisiones-mvp.md`, sección «E5 · Detalle de la HDU y asignación una a una»)
- **Modifica:** ADR 0016 (enmienda aditiva: la consulta en dos pasos, su vida y su purga siguen vigentes)

## Contexto

El usuario pidió ver todo lo que Jira trae de cada HDU al consultar, que el Analista salga del equipo del QE elegido y quede asignado si es el único, confirmar y guardar HDU por HDU, y recibir una alerta si la HDU ya estaba asignada. Siguen vigentes estas restricciones: el presupuesto de Jira de E5 (8 s, 429, D96/D135), la regla de no retener texto de Jira (D104, D123, con la excepción acotada de D133), que solo Organización escribe HDU (D100) y su dueña de las reglas de asignación (D138, D151), y que una sola ejecución esté en curso a la vez (D104).

## Decisión

- **El detalle va en la misma llamada.** `search/jql` amplía `fields` (D196). Se prohíben `GET /issue/{clave}` (N+1) y `expand`. El puerto `FuenteJira`, de interfaz fija, solo crece de forma aditiva: campos opcionales y el método `detectarCampos()`. Los criterios de aceptación salen del campo detectado al guardar la conexión o del encabezado de la descripción (D199).
- **El detalle no se persiste en la HDU.** Vive en `consulta_item.detalle` (≤ 40 KB) solo mientras la consulta está abierta, y se purga con la fila igual que los textos (D133). No pasa a la HDU, a la auditoría, a `detalle_ejecucion` ni a los logs (D198).
- **Integraciones convierte ADF en texto seguro** en su dominio de mapeo, con `adfATexto` y `limpiarControl` ampliados. Guarda texto plano, conserva solo los enlaces `http(s)` y marca los recortes. El portal pinta texto y nunca HTML.
- **La confirmación de una fila reutiliza el flujo existente.** Usa el mismo `asignaciones/validar` y el mismo `hdu/upsert` en modo confirmación (lote de 1 `CREAR`) que «Confirmar marcadas», sin una segunda lógica de creación. El control de concurrencia es **por fila**: `revision` (409 `FILA_MODIFICADA`) más una toma atómica condicional de 30 s (`FILA_EN_CURSO`), que también respeta el lote. Es idempotente por (`consultaId`, código, actor). La ejecución `alcance: HDU` se inserta ya cerrada, así que no toma el candado global de D104.
- **Organización decide** el Analista único (`proponerAnalista` en `asignaciones/validar`, sobre la supervisión vigente) y si la HDU ya existe (`estado-codigos.analista` al clasificar y `existente` en el upsert al confirmar). Integraciones solo guarda la instantánea `yaAsignada` y traduce: 200 `repetida` o 409 `HDU_YA_ASIGNADA`.

## Consecuencias

- **Integraciones:** una migración aditiva (`detalle`, `revision`, `analista_auto`, `aplicando_desde`, `ya_asignada` y `alcance_aplicacion` en `consulta_item`; `creadas` en `consulta_jira`; `alcance` en `ejecucion_integracion`; `campo_criterios` en `configuracion_jira`) y el CHECK `item_hdu_ck` relajado. **Organización:** sin migración.
- Hay 2 operaciones nuevas en el gateway (la consulta pasa de 8 a 10) y 3 códigos nuevos (`HDU_YA_ASIGNADA`, `FILA_MODIFICADA`, `FILA_EN_CURSO`). Los contratos son todos aditivos.
- Cada página de Jira pesa más (unos 1 MB con descripciones grandes). Si no cabe en 3 s, ya funciona el corte `INCOMPLETA` con «Continuar consulta». Además, `INTEGRACIONES_JIRA_TAMANO_PAGINA` permite bajar la página a 25.
- El historial gana una ejecución por cada HDU confirmada una a una, y se filtra por `alcance`.
- Se ajustan las pruebas certificadas que suponen que el Analista se elige siempre a mano, el texto «Confirmar (N)», el texto de «sin analistas» y el conteo de rutas (lista en el plan).

## Alternativas descartadas

- **`GET /issue/{clave}` al abrir el panel.** Hace que el panel dependa de Jira y del 429, con hasta 500 llamadas por consulta.
- **`expand=renderedFields`.** El HTML de Jira pesa más y obliga a sanear HTML en vez de ADF.
- **Guardar el detalle en `historia_usuario`.** Retiene texto de Jira sin plazo (D104) y cambia E2.
- **Un endpoint nuevo de Organización con «analistas por QE».** Ya existe `catalogos/personas?supervisorId=` (D147). La propuesta va en la validación que Integraciones ya llama.
- **Que el upsert responda 409 por fila.** Es un endpoint de lote compartido con el lote y con los archivos, y un 409 rompería el resultado parcial de D140.
- **Tomar el candado global al confirmar una fila.** Un Administrador bloquearía al otro y a su propio lote.
