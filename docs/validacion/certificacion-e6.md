# Certificación E6 · Indicadores y dashboards (Quality360)

Dueño: `q360-qa`. Alcance: 10 HDU (E6-F01..F05, E6-B01..B05), 30 escenarios y 117 casos de `docs/backlog/e6-indicadores-dashboards.md`, más la regresión de E1, E2, E3, E4, E5, modelo de datos, login y E7 (sección 7 del backlog). Plan: `docs/arquitectura/e6-plan-construccion.md`.

**Estado de este documento: preparación (Q1). Sin dictamen.** Ninguna prueba de E6 se ha ejecutado; los 117 casos son esqueletos `test.fixme` (no certifican). El dictamen, la tabla de resultados y los defectos los completa la Ola 7 contra el stack real. El código bajo prueba se indicará con su commit al certificar.

## Veredicto

Pendiente (Ola 7). Sin dictamen para ninguna HDU.

| HDU | Escenarios | Casos | Dictamen |
| --- | --- | --- | --- |
| E6-B01 | 3 | 11 | sin dictamen |
| E6-B02 | 3 | 13 | sin dictamen |
| E6-B03 | 3 | 14 | sin dictamen |
| E6-B04 | 3 | 12 | sin dictamen |
| E6-B05 | 3 | 12 | sin dictamen |
| E6-F01 | 3 | 12 | sin dictamen |
| E6-F02 | 3 | 12 | sin dictamen |
| E6-F03 | 3 | 12 | sin dictamen |
| E6-F04 | 3 | 9 | sin dictamen |
| E6-F05 | 3 | 10 | sin dictamen |

## Entorno (previsto)

- Stack real: Supabase local + `npm run local` (con Indicadores en :3005 y `INDICADORES_URL` en el gateway). Fixture: `seed:e7` + `seed:e4` + `seed:e6`. Hora de referencia de snapshots con `Q360_FECHA_REFERENCIA`.
- Proyectos de Playwright (`tests/playwright.config.ts`): `e6-api` y `e6-e2e`; reutilizan las sesiones de `e7-setup`. Excluidos de los proyectos `api`/`e2e`/`e7-*`.
- Contrato: `tests/support/contrato.ts` carga `contracts/indicadores.v1.yaml` (usar `cumpleContrato(esquema, cuerpo, "indicadores")`).
- Ayudantes: `tests/support/e6.ts` (cifras esperadas, menús exactos, rutas nuevas, `limpiarE6`, `recargarSemillaE6`, `celulasE6`, `rutaIndicadores`).
- Limpieza: `indicadores.*` y `organizacion.cierre_hdu` se vacían con el dueño de la base, nunca por API. Cada archivo que cierra una HDU llama a `recargarSemillaE6()` al terminar (CERRADA es terminal).
- Aislamiento de base: `DATABASE_URL_INDICADORES` (o `services/indicadores/.env`) para `conIndicadores`.

## Cambios en pruebas ya certificadas (solo por cambios documentados)

Todos dependen solo del diseño y del contrato. **No se han ejecutado** (la plataforma de E6 aún no existe); fallarán hasta que `q360-frontend`, `q360-infra` y `q360-backend` entreguen lo suyo, y deben pasar en la Ola 7.

| Prueba | Cambio | Motivo |
| --- | --- | --- |
| `e2e/e1-f02-portal-qe.spec.ts` (E1-F02#3) | Menú del QE: `Bandeja, Equipo, Historias supervisadas, Impedimentos, Indicadores, Integraciones, Perfil` | Backlog E6 §7 y brecha 10 del diseño (el backlog omite «Integraciones», que E5 ya trajo) |
| `e2e/e7-f01-ingreso-por-rol.spec.ts` (E7-F01#2 T02) | Menú de Líder y Auditor: `Bandeja, Indicadores, Perfil` | Backlog E6 §7 |
| `e2e/e7-f01-ingreso-por-rol.spec.ts` (E7-F01#2 T02b, nueva) | Menú del Administrador `Bandeja, Usuarios, Supervisión, Integraciones, Snapshots de indicadores, Perfil`; el del Analista no cambia | Diseño 2.2 |
| `e2e/e7-f01-ingreso-por-rol.spec.ts` (E7-F01#3 T04c, nueva) | La matriz de rutas de T04 suma `/qe/indicadores`, `/lider/indicadores`, `/auditor/indicadores`, `/admin/indicadores/snapshots` (16 combinaciones ajenas con acceso denegado y sin datos; cada rol entra a la suya). T04 (20 combinaciones) no cambia | Backlog E6 §7 (E7-F01-T04) |
| `e2e/e7-f06-bandeja-auditor.spec.ts` (E7-F06#3 T07) | También recorre `/auditor/indicadores`: solo lectura, sin controles de umbral ni snapshot | Backlog E6 §7 (E7-F06-T07). El encabezado «Indicadores» (h1) es una suposición del diseño |
| `api/seguridad-aislamiento-esquemas.spec.ts` | `svc_organizacion`, `svc_certificaciones` y `svc_impedimentos` no leen `indicadores`; prueba nueva `[E6]` de `svc_indicadores` (no superusuario, lee `indicadores`, no lee `organizacion` incluida `cierre_hdu`, `certificaciones`, `impedimentos` ni `public`) | D24; plan «q360-infra» L1 |
| `support/contrato.ts`, `support/env.ts`, `support/db.ts` | `indicadores.v1.yaml`; `databaseUrlIndicadores`; `conIndicadores` | Infraestructura de E6 |
| `playwright.config.ts` | Proyectos `e6-api` y `e6-e2e`; los archivos `e6-*` se excluyen de `api` y `e2e` | Infraestructura de E6 |
| Sin cambio necesario | `e7-b04-auditor.spec.ts` T10 (crea su propia exportación antes de leer la última entrada `EXPORTAR`), las demás bandejas de E7 (D170), `e2-hdu`/`e3-acceso-y-cierre`/`e4-impedimentos-organizacion` (servicios), E2-B02#3 sin justificación y E7-F03 `listas-cerrar` | Backlog E6 §7 |

**Pendientes de la Ola 7 (no resueltos en Q1):**
- `modelo-datos-*` (`support/modeloDatos.ts`) enumera tres esquemas con columnas del modelo ER; sumar `indicadores` exige el modelo físico final de `q360-backend` (X1). El aislamiento ya se cubre en `seguridad-aislamiento-esquemas.spec.ts`.
- Pruebas de enumeración de rutas o variables del gateway (`E5-GW`, pruebas de configuración): revisar tras G1.
- El historial de `/hdu/:id` con el evento `CIERRE_EXCEPCION` (E2-F04): lo cubren E6-F05 y la regresión de E2.
- Búsqueda de secretos: `CRON_SECRET`, `INDICADORES_SERVICIO_TOKEN` y `Authorization` no deben aparecer en registros, respuestas ni DOM.
- axe a 1280 y 375 px en las 5 pantallas y el diálogo `dialogo-cierre-excepcion` (F7 de frontend).

## Defectos por agente

Ninguno reportado todavía (nada ejecutado).

## Rondas

| Ronda | Qué se corrió | Resultado |
| --- | --- | --- |
| 0 (Q1) | Solo preparación; verificación estática (el TypeScript de `support/e6.ts`, de los 10 esqueletos y de las pruebas editadas compila sin errores de sintaxis) | Nada ejecutado contra el stack |

## Resultado por prueba (esqueletos; a completar en la Ola 7)

Estado de las 117 pruebas: todas `test.fixme` = **no ejecutadas, no certifican**.

| ID | Prueba | Proyecto | Resultado | Evidencia |
| --- | --- | --- | --- | --- |
| [E6-B01#1] E6-B01-T01 | GET /v1/indicadores/cumplimiento | e6-api | pendiente (fixme) | — |
| [E6-B01#1] E6-B01-T02 | Dos consultas | e6-api | pendiente (fixme) | — |
| [E6-B01#1] E6-B01-T03 | Consultan | e6-api | pendiente (fixme) | — |
| [E6-B01#2] E6-B01-T04 | celulaId=CEL-A; sprintId=SP-PROX; ambos | e6-api | pendiente (fixme) | — |
| [E6-B01#2] E6-B01-T05 | celulaId con UUID válido inexistente; luego un UUID mal formado | e6-api | pendiente (fixme) | — |
| [E6-B01#3] E6-B01-T06 | Consulta; QE1 aprueba el entregable 4 de H1; consulta de nuevo | e6-api | pendiente (fixme) | — |
| [E6-B01#1] E6-B01-T07 | Consultan | e6-api | pendiente (fixme) | — |
| [E6-B01#1] E6-B01-T08 | Consulta | e6-api | pendiente (fixme) | — |
| [E6-B01#1] E6-B01-T09 | Consulta | e6-api | pendiente (fixme) | — |
| [E6-B01#1] E6-B01-T10 | Consulta | e6-api | pendiente (fixme) | — |
| [E6-B01#1] E6-B01-T11 | Consulta; luego celulaId=CEL-A | e6-api | pendiente (fixme) | — |
| [E6-B02#1] E6-B02-T01 | GET /v1/indicadores/semaforo | e6-api | pendiente (fixme) | — |
| [E6-B02#1] E6-B02-T02 | Consultan | e6-api | pendiente (fixme) | — |
| [E6-B02#1] E6-B02-T03 | GET /v1/indicadores/semaforo/<CEL-A>/hdu; luego <CEL-B> | e6-api | pendiente (fixme) | — |
| [E6-B02#1] E6-B02-T04 | Piden el drill-down | e6-api | pendiente (fixme) | — |
| [E6-B02#2] E6-B02-T05 | GET /v1/indicadores/carga | e6-api | pendiente (fixme) | — |
| [E6-B02#3] E6-B02-T06 | PUT umbral-carga {valor: 1}; luego GET carga; luego {valor: 2} | e6-api | pendiente (fixme) | — |
| [E6-B02#3] E6-B02-T07 | PUT con 0, 51, 2.5, «abc» y vacío | e6-api | pendiente (fixme) | — |
| [E6-B02#3] E6-B02-T08 | PUT umbral-carga; QE2 GET umbral-carga?qeId=<QE1> | e6-api | pendiente (fixme) | — |
| [E6-B02#3] E6-B02-T09 | GET umbral-carga/historial | e6-api | pendiente (fixme) | — |
| [E6-B02#1] E6-B02-T10 | GET semaforo | e6-api | pendiente (fixme) | — |
| [E6-B02#1] E6-B02-T11 | GET semaforo | e6-api | pendiente (fixme) | — |
| [E6-B02#2] E6-B02-T12 | Ambos consultan carga; LID1 consulta | e6-api | pendiente (fixme) | — |
| [E6-B02#2] E6-B02-T13 | GET carga como AUD1 | e6-api | pendiente (fixme) | — |
| [E6-B03#1] E6-B03-T01 | GET /v1/cron/indicadores/snapshot con el secreto | e6-api | pendiente (fixme) | — |
| [E6-B03#1] E6-B03-T02 | Misma ruta sin cabecera, con un secreto incorrecto y con la sesión de ADM1 | e6-api | pendiente (fixme) | — |
| [E6-B03#1] E6-B03-T03 | Genera el snapshot | e6-api | pendiente (fixme) | — |
| [E6-B03#2] E6-B03-T04 | Ejecuta el snapshot dos veces el mismo día | e6-api | pendiente (fixme) | — |
| [E6-B03#2] E6-B03-T05 | Ejecuta, aprueba el entregable 4 de H1, ejecuta | e6-api | pendiente (fixme) | — |
| [E6-B03#2] E6-B03-T06 | Dos POST manuales simultáneos | e6-api | pendiente (fixme) | — |
| [E6-B03#1] E6-B03-T07 | POST /v1/indicadores/snapshots | e6-api | pendiente (fixme) | — |
| [E6-B03#1] E6-B03-T08 | Dispara el snapshot; repone el servicio y lo dispara de nuevo | e6-api | pendiente (fixme) | — |
| [E6-B03#3] E6-B03-T09 | GET tendencia como QE1 con CEL-A y SP-PROX | e6-api | pendiente (fixme) | — |
| [E6-B03#3] E6-B03-T10 | QE2 consulta la misma serie; AUD1 también | e6-api | pendiente (fixme) | — |
| [E6-B03#3] E6-B03-T11 | GET tendencia; ADM1 además GET snapshots/ejecuciones | e6-api | pendiente (fixme) | — |
| [E6-B03#1] E6-B03-T12 | Genera el snapshot | e6-api | pendiente (fixme) | — |
| [E6-B03#3] E6-B03-T13 | Mueve H1 de SP-PROX a SP-LEJ y genera otro | e6-api | pendiente (fixme) | — |
| [E6-B03#1] E6-B03-T14 | Lee la configuración | e6-api | pendiente (fixme) | — |
| [E6-B04#1] E6-B04-T01 | exportacion?vista=cumplimiento&formato=csv&celulaId=CEL-A | e6-api | pendiente (fixme) | — |
| [E6-B04#1] E6-B04-T02 | Exporta semaforo y carga en CSV | e6-api | pendiente (fixme) | — |
| [E6-B04#2] E6-B04-T03 | exportacion?vista=semaforo&formato=pdf | e6-api | pendiente (fixme) | — |
| [E6-B04#3] E6-B04-T04 | Exportan semaforo en CSV | e6-api | pendiente (fixme) | — |
| [E6-B04#1] E6-B04-T05 | Exporta semaforo | e6-api | pendiente (fixme) | — |
| [E6-B04#1] E6-B04-T06 | Exporta carga en CSV | e6-api | pendiente (fixme) | — |
| [E6-B04#1] E6-B04-T07 | Exporta | e6-api | pendiente (fixme) | — |
| [E6-B04#1] E6-B04-T08 | Exporta en ambos formatos con más filas que el tope | e6-api | pendiente (fixme) | — |
| [E6-B04#1] E6-B04-T09 | Exportan | e6-api | pendiente (fixme) | — |
| [E6-B04#1] E6-B04-T10 | vista=otra; formato=xls; celulaId=abc | e6-api | pendiente (fixme) | — |
| [E6-B04#2] E6-B04-T11 | Exporta cumplimiento en CSV y PDF | e6-api | pendiente (fixme) | — |
| [E6-B04#1] E6-B04-T12 | Exporta tendencia en CSV con 3 snapshots | e6-api | pendiente (fixme) | — |
| [E6-B05#1] E6-B05-T01 | Cambia a CERRADA con una justificación de 40 caracteres | e6-api | pendiente (fixme) | — |
| [E6-B05#1] E6-B05-T02 | Cierra sin justificacion; con " "; con 19 y con 501 caracteres | e6-api | pendiente (fixme) | — |
| [E6-B05#1] E6-B05-T03 | Cierra con una justificación de exactamente 20 caracteres | e6-api | pendiente (fixme) | — |
| [E6-B05#2] E6-B05-T04 | Cierran H2 con justificación válida | e6-api | pendiente (fixme) | — |
| [E6-B05#2] E6-B05-T05 | Cierra con justificación válida; luego resuelve I2 y repite | e6-api | pendiente (fixme) | — |
| [E6-B05#2] E6-B05-T06 | (a) H1 en EN_EJECUCION con justificación válida; (b) H2 en PENDIENTE_CIERRE con Certificaciones detenido y jus | e6-api | pendiente (fixme) | — |
| [E6-B05#3] E6-B05-T07 | Pide el certificado de H2 y trata de generarlo | e6-api | pendiente (fixme) | — |
| [E6-B05#3] E6-B05-T08 | ADM1 lee GET /v1/auditoria?entidad=HDU&entidadId=<H2>; AUD1 lee GET /v1/hdu/<H2> y su historial (D192) | e6-api | pendiente (fixme) | — |
| [E6-B05#1] E6-B05-T09 | Cierra con y sin justificacion en dos pruebas de la misma semilla | e6-api | pendiente (fixme) | — |
| [E6-B05#3] E6-B05-T10 | Marca un entregable, registra un impedimento y trata de reabrir H2 | e6-api | pendiente (fixme) | — |
| [E6-B05#1] E6-B05-T11 | Dos cierres simultáneos con justificación | e6-api | pendiente (fixme) | — |
| [E6-B05#regresión] E6-B05-T12 | Ejecuta las pruebas certificadas de e3-acceso-y-cierre.test.ts, e4-impedimentos-organizacion.test.ts (E4-B02)  | e6-api | pendiente (fixme) | — |
| [E6-F01#1] E6-F01-T01 | Abre /qe/indicadores | e6-e2e | pendiente (fixme) | — |
| [E6-F01#1] E6-F01-T02 | Abre /qe/indicadores | e6-e2e | pendiente (fixme) | — |
| [E6-F01#1] E6-F01-T03 | Abre /lider/indicadores | e6-e2e | pendiente (fixme) | — |
| [E6-F01#1] E6-F01-T04 | Abre /auditor/indicadores | e6-e2e | pendiente (fixme) | — |
| [E6-F01#2] E6-F01-T05 | Filtra Célula = CEL-A | e6-e2e | pendiente (fixme) | — |
| [E6-F01#2] E6-F01-T06 | Filtra Sprint = SP-PROX; luego agrega Célula = CEL-A | e6-e2e | pendiente (fixme) | — |
| [E6-F01#3] E6-F01-T07 | Filtra Célula = CEL-C y Sprint = SP-PROX | e6-e2e | pendiente (fixme) | — |
| [E6-F01#3] E6-F01-T08 | Abre /qe/indicadores | e6-e2e | pendiente (fixme) | — |
| [E6-F01#1] E6-F01-T09 | Abre /qe/indicadores | e6-e2e | pendiente (fixme) | — |
| [E6-F01#1] E6-F01-T10 | Abren las rutas de indicadores que no son suyas | e6-e2e | pendiente (fixme) | — |
| [E6-F01#regresión] E6-F01-T11 | Ejecuta las pruebas certificadas de E1-F02, E7-F01 y E7-F03 | e6-e2e | pendiente (fixme) | — |
| [E6-F01#1] E6-F01-T12 | Abre /qe/indicadores | e6-e2e | pendiente (fixme) | — |
| [E6-F02#1] E6-F02-T01 | Abre la pestaña Semáforo | e6-e2e | pendiente (fixme) | — |
| [E6-F02#1] E6-F02-T02 | Abre la pestaña Semáforo | e6-e2e | pendiente (fixme) | — |
| [E6-F02#1] E6-F02-T03 | Abren el semáforo | e6-e2e | pendiente (fixme) | — |
| [E6-F02#2] E6-F02-T04 | Selecciona CEL-A | e6-e2e | pendiente (fixme) | — |
| [E6-F02#2] E6-F02-T05 | Selecciona CEL-B | e6-e2e | pendiente (fixme) | — |
| [E6-F02#2] E6-F02-T06 | Selecciona CEL-B; luego CEL-C | e6-e2e | pendiente (fixme) | — |
| [E6-F02#3] E6-F02-T07 | Resuelve I1 en el detalle de H3 (E4-F03) y vuelve al Semáforo; luego reabre I1 | e6-e2e | pendiente (fixme) | — |
| [E6-F02#3] E6-F02-T08 | Resuelve I3 y vuelve al Semáforo; luego reabre I3 | e6-e2e | pendiente (fixme) | — |
| [E6-F02#1] E6-F02-T09 | Abre el Semáforo | e6-e2e | pendiente (fixme) | — |
| [E6-F02#1] E6-F02-T10 | Abre el Semáforo | e6-e2e | pendiente (fixme) | — |
| [E6-F02#1] E6-F02-T11 | Abre el Semáforo | e6-e2e | pendiente (fixme) | — |
| [E6-F02#1] E6-F02-T12 | Abren el Semáforo | e6-e2e | pendiente (fixme) | — |
| [E6-F03#1] E6-F03-T01 | Abre la pestaña Carga | e6-e2e | pendiente (fixme) | — |
| [E6-F03#1] E6-F03-T02 | Abre la pestaña Carga | e6-e2e | pendiente (fixme) | — |
| [E6-F03#2] E6-F03-T03 | Fija el umbral en 1 | e6-e2e | pendiente (fixme) | — |
| [E6-F03#2] E6-F03-T04 | Fija el umbral en 2 | e6-e2e | pendiente (fixme) | — |
| [E6-F03#3] E6-F03-T05 | Abre la pestaña Carga | e6-e2e | pendiente (fixme) | — |
| [E6-F03#2] E6-F03-T06 | Prueba 0, 51, 2.5, «abc» y vacío; luego 50 | e6-e2e | pendiente (fixme) | — |
| [E6-F03#2] E6-F03-T07 | Abre la pestaña Carga | e6-e2e | pendiente (fixme) | — |
| [E6-F03#2] E6-F03-T08 | Abre la pestaña Carga | e6-e2e | pendiente (fixme) | — |
| [E6-F03#2] E6-F03-T09 | QE1 cambia el umbral de 5 a 1; QE2 abre su Carga | e6-e2e | pendiente (fixme) | — |
| [E6-F03#2] E6-F03-T10 | Ambos abren la Carga | e6-e2e | pendiente (fixme) | — |
| [E6-F03#1] E6-F03-T11 | Abre la pestaña Carga | e6-e2e | pendiente (fixme) | — |
| [E6-F03#1] E6-F03-T12 | Abren la pestaña Carga | e6-e2e | pendiente (fixme) | — |
| [E6-F04#1] E6-F04-T01 | Abre la pestaña Tendencia con CEL-A y SP-PROX | e6-e2e | pendiente (fixme) | — |
| [E6-F04#1] E6-F04-T02 | Quita el filtro de célula y de sprint | e6-e2e | pendiente (fixme) | — |
| [E6-F04#2] E6-F04-T03 | Exporta PDF | e6-e2e | pendiente (fixme) | — |
| [E6-F04#2] E6-F04-T04 | Exporta CSV | e6-e2e | pendiente (fixme) | — |
| [E6-F04#3] E6-F04-T05 | Abre la pestaña Tendencia | e6-e2e | pendiente (fixme) | — |
| [E6-F04#1] E6-F04-T06 | Abre la pestaña Tendencia | e6-e2e | pendiente (fixme) | — |
| [E6-F04#1] E6-F04-T07 | Abre la pestaña Tendencia | e6-e2e | pendiente (fixme) | — |
| [E6-F04#2] E6-F04-T08 | Exporta el Semáforo | e6-e2e | pendiente (fixme) | — |
| [E6-F04#2] E6-F04-T09 | Intentan abrir el dashboard y llamar a la exportación | e6-e2e | pendiente (fixme) | — |
| [E6-F05#1] E6-F05-T01 | Abre /hdu/<H2> y pulsa boton-cerrar-excepcion | e6-e2e | pendiente (fixme) | — |
| [E6-F05#2] E6-F05-T02 | Confirma vacío; luego con 19 caracteres; luego intenta escribir 501 | e6-e2e | pendiente (fixme) | — |
| [E6-F05#1] E6-F05-T03 | Escribe una justificación de 40 caracteres y confirma | e6-e2e | pendiente (fixme) | — |
| [E6-F05#3] E6-F05-T04 | Revisa el detalle | e6-e2e | pendiente (fixme) | — |
| [E6-F05#3] E6-F05-T05 | Abren /hdu/<H2> | e6-e2e | pendiente (fixme) | — |
| [E6-F05#1] E6-F05-T06 | Abren una HDU en PENDIENTE_CIERRE con menos de 10 aprobados (H5 llevada a ese estado) | e6-e2e | pendiente (fixme) | — |
| [E6-F05#2] E6-F05-T07 | Escribe una justificación válida y confirma | e6-e2e | pendiente (fixme) | — |
| [E6-F05#1] E6-F05-T08 | Abre /hdu/<H8> | e6-e2e | pendiente (fixme) | — |
| [E6-F05#1] E6-F05-T09 | Abre /hdu/<H2> y pulsa cerrar | e6-e2e | pendiente (fixme) | — |
| [E6-F05#regresión] E6-F05-T10 | Ejecuta las pruebas certificadas de E2-F04, E3-F01 y E7-F03 | e6-e2e | pendiente (fixme) | — |
