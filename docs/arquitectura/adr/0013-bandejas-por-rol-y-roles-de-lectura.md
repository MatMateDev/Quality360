# ADR 0013 · Bandejas por rol compuestas en Organización y roles de solo lectura

- **Estado:** aceptada
- **Fecha:** 2026-10-21
- **Decisiones base:** D28–D40 (backlog E7) y D41–D53 (`decisiones-mvp.md`, Corrida E7)

## Contexto

E7 agrega dos roles: el Líder QA, que ve las HDU de sus células, y el Auditor, que lee todo y exporta. También define una bandeja por rol, con contadores y listas que mezclan datos de Organización (HDU, ámbito, usuarios) y de Certificaciones (avance, observaciones, certificado). Las listas se ordenan, filtran y paginan en el servidor con criterios de ambos servicios, por ejemplo «observadas primero» o «solo con observaciones». Rigen las reglas no negociables:

- Sin SQL ni llaves foráneas entre esquemas.
- Cada servicio autoriza por sí mismo.
- Una fuente caída no se convierte en cero.

## Decisión

- **Dueño de la bandeja: Organización.** El gateway solo reenvía `/v1/bandeja/*`. Organización calcula sobre su ámbito y obtiene el estado del checklist en lote con `POST /v1/interno/checklist/estados` de Certificaciones, propagando el token. Cada contador y cada lista se informa como un bloque `{fuente, estado: ok | indisponible, datos?}`.
- **Degradación.** Si Certificaciones no responde, solo sus bloques quedan `indisponible`:
  - Un filtro que depende de Certificaciones deja la lista entera `indisponible`.
  - Un orden que depende de Certificaciones cae a un orden de respaldo, que se informa en la respuesta.
- **Autorización en lote sin cruzar esquemas.** Certificaciones resuelve el ámbito con una llamada a `GET /v1/interno/hdu/ambito` (`{todas, hduIds}`) y obtiene los datos de las HDU con `POST /v1/interno/hdu/consulta`. Un id fuera de ámbito hace fallar todo el lote con 403.
- **Roles de lectura por defecto.** `LIDER_QA` y `AUDITOR` nunca figuran en `x-roles` de una escritura. Sus relaciones con una HDU (`LECTOR_CELULA` y `LECTOR_AUDITORIA`) dejan `permisos` en `false`.
- **Células del Líder.** Tabla `organizacion.celula_lider` con historial, donde la vigente es la que tiene `fecha_hasta` nula (índice único parcial). El cambio de rol con células es atómico.
- **Exportación.** Cada servicio exporta sus propios datos. Certificaciones registra sus exportaciones en la auditoría de Organización por contrato, antes de entregar el archivo.

## Consecuencias

- Organización depende en tiempo de ejecución de Certificaciones, con 2 s de tiempo límite y degradación explícita. La relación inversa (acceso por HDU) ya existía desde E3.
- Las bandejas leen el ámbito completo para ordenar y filtrar. Eso alcanza para el MVP, pero con muchos miles de HDU por ámbito hará falta una proyección del avance en Organización.
- El gateway sigue sin lógica de dominio. Los 5 endpoints de bandeja, las consultas y las exportaciones del Auditor son reenvíos.
- Las pruebas certificadas de acceso a portal ajeno cambian de afirmación: ya no se espera una redirección, sino la pantalla de acceso denegado (D41).

## Alternativas descartadas

- **Composición en el gateway, como `/v1/inicio/*`.** Obligaría al gateway a calcular acciones pendientes, ordenar y filtrar con reglas de dominio de dos servicios.
- **Certificaciones con credencial de servicio y sin token de usuario.** Le permitiría leer cualquier HDU sin validar el ámbito del usuario, contra la regla «cada servicio autoriza».
- **Copiar el avance del checklist en Organización ahora.** Exige eventos y consistencia eventual que el MVP no necesita todavía.
- **Rol de lectura como bandera sobre los roles existentes.** Contradice «un rol por usuario» (D28) y complica la matriz de acceso.
