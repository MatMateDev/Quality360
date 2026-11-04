# ADR 0016 · Consulta de Jira en dos pasos: borrador guardado en Integraciones y confirmación sin Jira

- **Estado:** aceptada
- **Fecha:** 2026-11-02
- **Decisiones base:** D132–D144 (`docs/backlog/e5-consulta-asignacion.md`) y D145–D152 (`decisiones-mvp.md`, sección «E5 · Consulta de Jira y asignación de HDU»)
- **Modifica:** ADR 0015 (se retira la sincronización directa; se mantiene todo lo demás)

## Contexto

En E5 certificada, «Sincronizar con Jira» creaba y actualizaba HDU en la misma petición, con célula, QE y sprint fijos de la configuración y sin analista. El usuario pidió revisar antes de escribir: separar nuevas, cambiadas y sin cambios, asignar célula, QE, analista y sprint por HDU, y confirmar solo lo elegido, sin que confirmar dependa de Jira. Siguen vigentes los límites del plan gratuito (funciones de unos 10 s, sin tareas programadas), la regla de no guardar texto de Jira (D104, D123) y la de escribir HDU solo a través de Organización (D100).

## Decisión

- **La consulta es una entidad de Integraciones** (`integraciones.consulta_jira` y `consulta_item`). Guarda lo mapeado de cada issue y la asignación elegida, nunca la respuesta cruda de Jira ni credenciales. Hay una sola `ABIERTA` (índice único parcial), dura 24 h y vence de forma perezosa al leerla.
- **Excepción acotada a D104/D123.** Los textos de Jira viven solo mientras la consulta está abierta. Al confirmarse, vencer, reemplazarse o descartarse, las filas se borran (`consulta_item` es la única tabla de Integraciones con `DELETE`) y queda la cabecera con sus contadores.
- **Solo «Consultar Jira» llama a Jira.** Clasifica contra Organización en solo lectura (`hdu/estado-codigos`). Editar y confirmar usan lo guardado: el host y el proyecto de la consulta y la instantánea del destino.
- **Organización sigue siendo la dueña de las reglas.** Valida la asignación (QE activo, analista del equipo vigente del QE, sprint de la célula) y propone el sprint (`asignaciones/validar`). Crea en modo confirmación por el mismo caso de uso que E2, con historial inicial de asignación y auditoría.
- **Concurrencia por `version`.** Las ediciones son de última escritura. Confirmar exige la `version` vista, y el índice de «una ejecución a la vez» (D104) impide dos confirmaciones simultáneas.
- **Se retira** `POST /v1/integraciones/jira/sincronizaciones`. Las ejecuciones anteriores quedan en el historial con fase `DIRECTA` y no se continúan.

## Consecuencias

- Hay 2 tablas nuevas y 4 columnas nuevas en `ejecucion_integracion`, con el invariante de contadores por fase. Hay 8 operaciones nuevas en el gateway y 2 internos nuevos en Organización. Organización no necesita migración.
- Confirmar tampoco cabe siempre en una función: se procesa por lotes de 25 y «Continuar confirmación» reanuda sin duplicar, marcando cada fila como `aplicada`.
- La revisión es compartida entre Administradores. Se protege con `version` y no con bloqueos.
- Se rehacen las 25 pruebas de E5-F02 y E5-B02 y las del gateway que enumeran rutas.

## Alternativas descartadas

- **Guardar la consulta en el navegador.** Se pierde al recargar, no es compartida y obliga a enviar 500 filas al confirmar sin que el servidor pueda verificarlas.
- **Crear las HDU en un estado «borrador» dentro de Organización.** Contamina bandejas, conteos y E7. Además cambia la máquina de estados de D10.
- **Volver a leer Jira al confirmar.** Hace que confirmar dependa de Jira y del 429, y se puede confirmar algo distinto de lo revisado.
- **Bloqueo exclusivo de la consulta por Administrador.** Hoy no hay forma de liberarlo sin tareas programadas. Con `version` alcanza.
