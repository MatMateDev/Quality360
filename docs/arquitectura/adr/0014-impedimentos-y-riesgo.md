# ADR 0014 · Impedimentos y riesgo en su propio servicio, con bloqueo derivado del cierre

- **Estado:** aceptada
- **Fecha:** 2026-10-26
- **Decisiones base:** D57–D74 (backlog E4) y D75–D92 (`decisiones-mvp.md`, Corrida E4)

## Contexto

E4 permite registrar impedimentos sobre una HDU, gestionarlos (resolver, escalar, reabrir), fijar y sugerir un nivel de riesgo y auditar todo. El usuario decidió que un impedimento abierto o escalado bloquea el cierre de la HDU, que solo el QE responsable gestiona y que Administrador, Líder QA y Auditor solo leen. Los datos se reparten entre tres servicios:

- La HDU y su ámbito están en Organización.
- El avance está en Certificaciones.
- Los impedimentos están en el esquema `impedimentos`, que hasta ahora solo tenía tablas.

Rigen las reglas no negociables: sin SQL ni llaves foráneas entre esquemas, cada servicio autoriza por sí mismo y una fuente caída no se convierte en cero ni en `BAJO`.

## Decisión

- **Dueño: el servicio Impedimentos** (puerto 3003, cuarto servicio en Vercel). Guarda impedimentos, acciones y niveles fijados. `accion_impedimento` y `riesgo_hdu` son de solo inserción, protegidas con `REVOKE UPDATE, DELETE`. El vínculo con la HDU es `id_historia`, sin llave foránea.
- **El bloqueo se deriva, no es un estado.** Una HDU está bloqueada si tiene impedimentos `ABIERTO` o `ESCALADO`. El cierre (`POST /v1/hdu/{id}/estado` hacia `CERRADA`) lo valida Organización con una consulta interna a Impedimentos, después de la transición y del checklist:
  - Si hay impedimentos abiertos o escalados, 409 `HDU_BLOQUEADA` con `{total, items ≤ 20}`.
  - Si Impedimentos no responde, 503.
- **Autorización por relación.** Impedimentos pregunta a Organización `GET /v1/interno/hdu/{id}/acceso`, como Certificaciones, y decide con la matriz de E4. Las respuestas traen `permisos` y `operacionesPermitidas`, para que el portal no deduzca la relación.
- **El riesgo sugerido se calcula al consultar.** No se guarda. En sus pantallas, Impedimentos reúne la HDU de Organización y el avance de Certificaciones. En las bandejas, Organización le envía en lote los datos que ya tiene (estado, fin del sprint y avance), así que no hay una segunda ronda de lecturas.
- **El gateway solo reenvía** las rutas de E4, declaradas una por una. Las que llevan sufijo bajo `/v1/hdu/{id}/` conviven con las de Organización y Certificaciones porque ninguna ruta es comodín.

## Consecuencias

- Organización depende de Impedimentos para cerrar una HDU. Sin Impedimentos arriba, ninguna HDU se cierra (503), así que el servicio debe estar desplegado en la nube junto con el gateway y Organización.
- Las bandejas suman un bloque `impedimentos` obligatorio con estado propio. La prueba de contrato de E7-B03 exige que Organización lo publique.
- La autorización hace un viaje de ida y vuelta (Organización → Impedimentos → Organización) en cada bandeja. Es aceptable con 2 s de tiempo límite y es el mismo patrón que E7 usa con Certificaciones.
- Queda una ventana mínima entre la verificación y el cierre: si alguien registra un impedimento justo entonces, la HDU puede cerrarse con ese impedimento abierto (pregunta abierta 1 de la Corrida E4).

## Alternativas descartadas

- **Estado `BLOQUEADA` en la HDU.** Rompe D10 y las reglas certificadas de E2 y E3, y obliga a sincronizar dos fuentes de verdad.
- **Impedimentos dentro de Organización.** Organización ya es el servicio más cargado, y el informe asigna a Impedimentos su propio esquema y su propio rol de base de datos.
- **Guardar el riesgo sugerido.** Quedaría obsoleto apenas cambie el avance, la fecha o un impedimento, y habría que recalcularlo con eventos que el MVP no tiene.
- **Componer las rutas de E4 en el gateway.** Obligaría al gateway a ordenar por riesgo y a aplicar la matriz de permisos, que es lógica de dominio.
