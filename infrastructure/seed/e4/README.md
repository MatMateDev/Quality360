# Quality360 · Fixture E4 (impedimentos y riesgo)

Carga, encima del fixture E7, la sección 7 de `docs/backlog/e4-impedimentos-y-riesgos.md`, con la que
`q360-qa` certifica E4. Solo usa las APIs (Organización e Impedimentos); no escribe SQL.

```
npm run seed:e7      # primero: células, usuarios y HDU H1-H8
npm run seed:e4
```

Requiere el stack levantado con `PERMITIR_CARGA_SEMILLA=true` (Organización e Impedimentos), el mismo
`X_Q360_SERVICIO_TOKEN` y las variables de `infrastructure/seed/mvp/.env.carga`. Puertos por defecto:
Organización 3001 e Impedimentos 3003 (`ORGANIZACION_URL`, `IMPEDIMENTOS_URL`). `npm run seed:e4 -- --sin-verificar`
omite la verificación final.

## Qué carga

| Elemento | Detalle |
| --- | --- |
| Sprints | `SP-VENC` (fin hoy − 3: H5), `SP-PROX` (hoy + 2: H1, H6), `SP-MED` (hoy + 6: H2), `SP-LEJ` (hoy + 20: H3, H4, H8), uno por célula de cada HDU; nombre `<alias> <célula> <fin>`, inicio = fin − 14 días. H7 (cerrada) conserva su sprint |
| Impedimentos | I1 a I5 con sus acciones y fechas relativas a la carga (hace 2 horas; 6; 3 y 1; 5 y 2; 20 y 15 días), por `POST /v1/interno/carga/impedimentos` |
| Riesgo | H6 fijado en MEDIO por QE1 hace 2 días, «Dependencia en gestión con el equipo de Pagos» (`POST /v1/interno/carga/riesgo`) |

«Hoy» es el día en `America/Santiago`. No crea HDU, usuarios ni células (si faltan HDU, pide correr
`seed:e7`) y no deja impedimentos abiertos en H8. Los datos están en `datos.json`.

## Idempotencia

Sprints por nombre (incluye la fecha de fin), impedimentos por HDU + título, riesgo por HDU + fecha
(redondeada al día). Repetir el mismo día no cambia nada. Otro día crea sprints nuevos y mueve las
HDU, pero los impedimentos y el riesgo ya cargados conservan sus fechas. Para un fixture fresco (los
casos que escriben cambian el historial) el arnés de `q360-qa` vacía `impedimentos.*` con el dueño
de la base (`svc_impedimentos` no puede borrar) y vuelve a correr `seed:e4`.

## Verificación

Al terminar consulta, como QE1 y QE2, `GET /v1/hdu/{id}/impedimentos` y `GET /v1/hdu/{id}/riesgo` de
H1 a H6 y H8, y compara bloqueo, nivel sugerido, factores, nivel vigente y origen con la tabla de
valores derivados. Los contadores por usuario (bandejas) los verifican las pruebas.

## Supuestos

- Se omiten `sugeridoAlFijar` y `nivelAnterior` en el riesgo de H6 (opcionales en el contrato).
- E7 no fija fechas de sprint; H4 queda en SP-LEJ y H2 conserva 1 entregable aprobado.
- El historial de acciones de I1-I5 usa comentarios genéricos salvo los dados por el backlog.
