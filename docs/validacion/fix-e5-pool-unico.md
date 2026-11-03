# Dictamen acotado: E5 con una conexión Prisma

**CERTIFICADA LOCALMENTE la regresión del bloqueo**, el 2026-11-02. Checkout exclusivo `tmp/codex-fix-e5-pool-timeout`, rama `codex/fix-e5-pool-timeout`, base `414d66e5ffb74d221963a2c67e32a468e926d563`. No recertifica las 8 HDU de E5 ni verifica producción, Jira real, HTTP/Auth o el despliegue.

Prueba: `services/organizacion/test/integracion/e5-pool-unico.test.ts`. Ejecuta `IntegracionesAplicacion` y los repositorios concretos con un único `PrismaService` contra PostgreSQL local, rol dev `svc_organizacion`, esquema `organizacion`, `connection_limit=1&pool_timeout=1`. Antes de conectar valida protocolo, rol, base, esquema y destino exclusivo `localhost/127.0.0.1:54322`; cada caso tiene timeout de 5 s. Sin arnés de truncado, migraciones ni semilla global. Referencias: D120/D124/D125 y algoritmo de `contracts/organizacion.v1.yaml`, `POST /v1/interno/integraciones/hdu/upsert`; esta prueba directa no constituye validación HTTP del contrato.

## Ejecución y evidencia

Compilación limpia, salida vacía y código **0**, antes de la roja y nuevamente después de restaurar el compilado:

```powershell
& 'C:/DuocUC/CAPSTONE/QA-Dashboard/node_modules/.bin/tsc.cmd' -p services/organizacion/tsconfig.pruebas.json
```

**Roja:** se sustituyeron temporalmente solo en `build-pruebas/src/aplicacion/integraciones.servicio.js` las tres llamadas `unidad.buscarCelulaPorNombre`, `unidad.buscarSprintDeCelulaPorNombre` y `unidad.buscarUsuarioPorCorreo` por sus equivalentes del cliente global. El compilado original se restauró en `finally` y se eliminó su respaldo temporal. No se alteró `src` para reproducir el defecto.

```powershell
node --test --test-concurrency=1 --test-name-pattern='crea dos filas JIRA' services/organizacion/build-pruebas/test/integracion/e5-pool-unico.test.js
```

Código **1**; **1 ejecutada, 1 fallida**, 0 canceladas/omitidas. Caso: **2060.933 ms**. Ambas filas devolvieron `ERROR/ERROR_INTERNO`; salida exacta para cada una:

```text
Invalid `prisma.celula.findFirst()` invocation:
Timed out fetching a new connection from the connection pool. More info: http://pris.ly/d/connection-pool (Current connection pool timeout: 1, connection limit: 1)
```

La primera consulta de célula bloquea las siguientes rutas. El mensaje reproduce el mecanismo del P2024 informado de producción; el código Prisma no aparece en la salida porque la aplicación captura la excepción. Limpieza roja: `0 HDU propias; 0 HDU/auditorias/historiaSprint/sprints/celulas/QE residuales.`

**Verde:** tras restaurar y recompilar, se repitió primero el comando del caso fallido: **1/1 pasa**, código **0**, caso **83.8647 ms**. Después se ejecutó todo el archivo:

```powershell
node --test --test-concurrency=1 services/organizacion/build-pruebas/test/integracion/e5-pool-unico.test.js
```

| ID / caso | Resultado real | Evidencia de la ejecución completa |
| --- | --- | --- |
| E5-B02#1 · dos filas Jira | PASA | 71.9494 ms; dos altas; célula de etiqueta, sprint por nombre y QE por correo distintos del respaldo; origen/enlace, sprint vigente y auditoría reales. |
| E5-B02#1 · repetición | PASA | 70.9571 ms; ambas `OMITIDA/SIN_CAMBIOS`, mismos IDs y snapshots de HDU, sprints y auditoría. |
| E5-B03#3 · estricto | PASA | 38.7582 ms; primera válida, segunda `QE_INVALIDO`; eventos SQL prueban INSERT de HDU, sprint y auditoría antes de ROLLBACK, sin COMMIT; cero persistencia. |
| E5-B03#2 · soloSimular | PASA | 85.6019 ms; dos altas y una actualización simuladas; ninguna sentencia de escritura y snapshots persistidos idénticos. |

```text
Estricto: INSERT historia_usuario + historia_sprint + auditoria; ROLLBACK; 0 HDU/auditorias persistidas.
Limpieza verificada: 6 HDU propias; 0 HDU/auditorias/historiaSprint/sprints/celulas/QE residuales.
tests 4
suites 1
pass 4
fail 0
cancelled 0
skipped 0
todo 0
duration_ms 1075.6832
```

El primer intento dentro del sandbox no conectó a `127.0.0.1:54322`: 0 aprobadas y 4 canceladas; no se cuenta como roja ni como certificación. Las ejecuciones anteriores con resultados efectivos se realizaron con acceso local autorizado fuera del sandbox.

## Limpieza, defectos y límites

Cada ejecución crea dos células, dos sprints y dos QE con UUID propios, y actores/códigos exclusivos. El `after` recupera solo sus HDU y elimina auditoría por `entidadId` de esas historias, historiales, relaciones de sprint, HDU y finalmente catálogos/QE en orden de FK. Verifica ausencia de residuos y desconecta en `finally`. No borra tablas ni datos ajenos.

**Defecto de q360-backend:** bloqueo por lookup global dentro de la transacción, reproducido en roja y resuelto en esta regresión local con la unidad de trabajo transaccional. **Defectos abiertos en el alcance: 0.** Pendiente fuera del alcance: verificación de la corrección desplegada en producción y flujo Jira/HTTP completo. No se ejecutaron `ws:test`, otras suites ni Playwright. Sin commits ni push.
