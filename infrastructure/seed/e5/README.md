# Quality360 · Semilla E5 (integración con Jira)

Dueño: `q360-integraciones`. Deja el estado de catálogos que necesita E5 (sección 10.4 de
`docs/backlog/e5-integracion-jira.md`), encima del fixture E7. Solo usa la API de Organización; no
escribe SQL ni toca el esquema `integraciones`.

```
npm run seed:e7      # primero: células (CEL-C incluida), usuarios y HDU H1-H8
npm run seed:e5
```

Requiere Organización levantada con `PERMITIR_CARGA_SEMILLA=true`, el mismo `X_Q360_SERVICIO_TOKEN` y las
variables de `infrastructure/seed/mvp/.env.carga`. Puerto por defecto 3001 (`ORGANIZACION_URL`).
Solo para entorno local.

## Qué carga

| Elemento | Detalle |
| --- | --- |
| Sprint «E5 Sprint 1» | Célula CEL-C, de hoy a hoy + 13 días. Es el **sprint de respaldo** de la configuración base y el que usan QTY-2 y QTY-12 del Jira simulado |
| Sprint «E5 Sprint 2» | Célula CEL-C, de hoy + 14 a hoy + 27 días. Lo usan QTY-1 y la fila `ARC-1` de `historias-validas.csv` |

«Hoy» es el día en `America/Santiago`. El script crea la célula CEL-C si no existe (alta idempotente) y
no crea HDU, usuarios ni nada más.

## Idempotencia

Célula y sprints se identifican por nombre (`POST /v1/interno/carga/celulas` y `/sprints`, ya idempotentes).
Repetir el comando no crea nada y no mueve las fechas de un sprint existente. Si «E5 Sprint 1» o
«E5 Sprint 2» existiera en otra célula, el script termina con error: por D120 no serviría para CEL-C.

## Estado de verificación

Este script depende de `sprints[].celulaId` solo para detectar el caso anterior (el campo es opcional en el
contrato hasta que Organización publique O3). No se ejecutó contra el stack al escribirlo, porque los
endpoints de E5 y la corrida completa todavía no existían; `q360-qa` lo corre al armar el estado base.
El resultado de la primera corrida real debe anotarse aquí.
