# ADR 0017 · Servicio Indicadores con snapshot diario y cierre con excepción en Organización

- **Estado:** aceptada
- **Fecha:** 2026-11-04
- **Decisiones base:** D153–D175 (`docs/backlog/e6-indicadores-dashboards.md`) y D176–D195 (`decisiones-mvp.md`, sección «Corrida E6»)
- **Modifica:** ADR 0011 (cierre con checklist). El resto sigue vigente.

## Contexto

E6 pide indicadores sobre los datos de tres servicios: estado y ámbito en Organización, avance en Certificaciones, y riesgo e impedimentos en Impedimentos. Las vistas son cumplimiento, semáforo por célula, carga por analista con umbral, y tendencia diaria con exportación. La tendencia necesita historia que hoy no existe, y el plan gratuito de Vercel permite un solo cron diario y funciones de unos 30 s. La regla de esquemas (D24) prohíbe leer tablas ajenas. Además, el usuario pidió que el QE responsable pueda cerrar una HDU sin los 10 entregables si deja una justificación, lo que cambia D11.

## Decisión

- **Servicio nuevo `services/indicadores`**, con esquema `indicadores` y rol `svc_indicadores`. No es dueño de ningún dato vivo: lee las demás fuentes por sus API internas, sin caché.
  - Organización resuelve el ámbito (D176). Certificaciones entrega el avance e Impedimentos la evaluación, en lotes de 1000 (D188).
  - Solo guarda lo propio: el snapshot, sus ejecuciones, el umbral por QE y su historial.
- **Snapshot diario idempotente** por fecha × célula × sprint × ámbito (upsert).
  - Lo disparan Vercel Cron (`0 6 * * *` UTC, con `CRON_SECRET` en `Authorization`) y el botón del Administrador. Una sola ejecución puede estar `EN_CURSO` a la vez.
  - Para la vista global usa una credencial de servicio propia, `INDICADORES_SERVICIO_TOKEN`, aceptada solo en tres rutas de lectura (D177).
- **Cada bloque informa `estado: ok | indisponible`.** Una fuente caída nunca se muestra como 0, como VERDE ni como lista vacía. La exportación no entrega datos parciales y siempre deja un registro `EXPORTAR`.
- **El cierre con excepción vive en Organización**, dueña del estado de la HDU.
  - Usa la misma ruta de cambio de estado, con el campo `justificacion`, y solo lo puede hacer el QE responsable.
  - Registra en la tabla de solo inserción `cierre_hdu`, con evento de historial `CIERRE_EXCEPCION` y auditoría `CERRAR_HDU_PARCIAL`.
  - No emite certificado. Los impedimentos abiertos siguen bloqueando.

## Consecuencias

- Hay un sexto proyecto Vercel, un rol y un esquema nuevos, y un secreto más que va en cuatro proyectos.
- El gateway suma 12 rutas con `INDICADORES_URL` opcional (D179).
- Las lecturas en vivo cuestan de 2 a 3 llamadas internas, lo que alcanza con el volumen del MVP. Si el volumen crece, habrá que pre-agregar.
- La tendencia solo existe desde el primer snapshot. Las filas guardadas no se recalculan cuando una HDU cambia de célula o de sprint (D171).
- E2-B02#3 cambia de enunciado, no de resultado: sin justificación todo sigue igual. El historial del portal debe tratar un tipo de evento nuevo.

## Alternativas descartadas

- **Calcular en el gateway o en Organización.** El gateway no tiene lógica de dominio (D3). Organización tendría que llamar a Certificaciones e Impedimentos para cada vista, lo que mezcla responsabilidades.
- **Vistas SQL o réplicas entre esquemas.** Violan D24 y acoplan migraciones de servicios distintos.
- **Snapshot por evento** (en cada cambio de estado o checklist). Exige mensajería entre servicios, que el MVP no tiene, y produce más filas de las que una tendencia diaria necesita.
- **Usar el token de semilla para el cron.** Se apaga en producción (D125) y tiene permisos de escritura.
- **Cierre con excepción como estado nuevo `CERRADA_PARCIAL`.** Cambia la máquina de D10 y obliga a revisar todas las bandejas y conteos. Una marca derivada (`cierreParcial`) basta.
