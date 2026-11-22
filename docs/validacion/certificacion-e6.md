# Certificación de E6 · Indicadores y dashboards (recertificación)

Dueño: `q360-qa`. Fecha de la corrida: 2026-11-22. Fuente de los casos: `docs/backlog/e6-indicadores-dashboards.md` (ya alineado con el modelo, OBS-E6-01 a 07 y D208).

Esta es la segunda certificación de E6. La primera dejó sus pruebas sin versionar en una carpeta temporal que se perdió; aquí se reescribieron todas contra el stack real, sin mocks ni `page.route`. Solo cuenta como «pasa» lo que se ejecutó y terminó en verde; nada se saltó ni quedó en `fixme`.

## 1. Dictamen por HDU

| HDU | Casos del backlog | Resultado real | Dictamen |
| --- | --- | --- | --- |
| E6-F01 Cumplimiento y filtros | 12 (T01–T12) | 12 de 12 pasan | **CERTIFICADA** |
| E6-F02 Semáforo y drill-down | 12 (T01–T12) | 12 de 12 pasan | **CERTIFICADA** |
| E6-F03 Carga y umbral | 12 (T01–T12) | 12 de 12 pasan | **CERTIFICADA** |
| E6-F04 Tendencia y exportación | 9 (T01–T09) | 9 de 9 pasan | **CERTIFICADA** |
| E6-F05 Cierre con excepción (UI) | 10 (T01–T10) | 10 de 10 pasan | **CERTIFICADA** |
| E6-B01 Cumplimiento (API) | 11 (T01–T11) | 11 de 11 pasan | **CERTIFICADA** |
| E6-B02 Semáforo, carga y umbral (API) | 13 (T01–T13) | 13 de 13 pasan | **CERTIFICADA** |
| E6-B03 Snapshot y tendencia (API) | 14 (T01–T14) | 14 de 14 pasan | **CERTIFICADA** |
| E6-B04 Exportación (API) | 12 (T01–T12) | 12 de 12 pasan | **CERTIFICADA** |
| E6-B05 Cierre con excepción (API) | 12 (T01–T12) | 12 de 12 pasan | **CERTIFICADA con reserva** (T12, abajo) |

Total: 117 casos y 30 escenarios, todos con prueba automatizada y el ID en el nombre (`[E6-B05#2] E6-B05-T05: …`).

**Reserva de E6-B05-T12.** El backlog pide «ejecutar las pruebas certificadas de `e3-acceso-y-cierre.test.ts`, `e4-impedimentos-organizacion.test.ts` y E2-B02». Esas son suites del servicio Organización (`npm test -w services/organizacion`) que vacían la base compartida, así que **no se ejecutaron**. El caso T12 se cubre con un sustituto de API sobre el stack real: checklist incompleto sin justificación (409 `CHECKLIST_INCOMPLETO` con el bloque `ok`), transición inválida (409) y `HDU_BLOQUEADA` con checklist completo. Además, la regresión de E2-B02 y E4-B02 por API (suites `api` y `e4-api`) pasó completa, ver sección 4. Quien tenga una base desechable debería correr esas dos suites de servicio.

Casos adicionales de esta certificación (no están en el backlog): seguridad 4 (`E6-SEC`), desviaciones de diseño 6 (`E6-DIS`), axe a 1280 y 375 px sobre 10 pantallas 20 (`E6-A11Y-1280` y `E6-A11Y-375`), secretos en el DOM y estado en la URL 2 (`E6-DOM`) y verificación de DEF-E6-01 a 03 en 3 (`E6-A11Y-DEF01` a `DEF03`). Todos pasan.

## 2. Cifras del estado base (contrastadas con el producto)

Fixture: `seed` (MVP), `seed:e7`, `seed:e4`, `seed:e5` y `seed:e6`, en ese orden: **base compartida**.

| Usuario | Totales | Certificadas | Cerradas con excepción | En curso | Sin iniciar | Bloqueadas | Cumplimiento |
| --- | --- | --- | --- | --- | --- | --- | --- |
| QE1 | 5 | 1 | 0 | 3 | 1 | 2 | 44,0 |
| QE2 | 3 | 1 | 0 | 1 | 1 | 1 | 33,3 |
| LID1 | 6 | 1 | 0 | 3 | 2 | 3 | 36,7 |
| QE1 tras cerrar H2 con excepción | 5 | 1 | 1 | 2 | 1 | 2 | 44,0 (H2 cuenta 10 %) |
| QE1, célula CEL-A | 3 | 0 | 0 | 2 | 1 | 1 | 13,3 |
| QE1, SP-PROX de CEL-A / de CEL-B | 1 / 1 | 0 | 0 | 1 / 1 | 0 | 1 / 1 | 30,0 / 80,0 |

Cifras que el arquitecto agregó al backlog para el Auditor en la base compartida: **coinciden con el producto**, por API (E6-B01-T07) y por pantalla (E6-F01-T04): CEL-A 4 HDU 35,0 %, CEL-B 2 HDU 40,0 %, CEL-C 2 HDU 50,0 %, suma 8 HDU y 40,0 % conjunto; los totales de AUD1 igualan el conteo de HDU de la base y suman las cuatro categorías.

El mensaje de rechazo de E6-F05-T07 también coincide: «No se puede cerrar la HDU: tiene 1 impedimento abierto o escalado. Resuélvelos y vuelve a intentar.», con enlace a I2 en `lista-error-bloqueantes`.

## 3. Entorno y commits bajo prueba

- Worktree `Quality360-e6`, rama `e6-indicadores`, HEAD `58d0727` (portal, DEF-E6-01 a 03) sobre `8276fdf` (backlog), `5eed7ad` (semilla con LID3, DEF-E6-04 y 05), `8a8abce` (nube), `6544dfb` (SQL calificadas) y `c19cf75` (E6). Las pruebas no modifican código de producción.
- Stack real: Supabase local y `npm run local` (Organización :3001, Certificaciones :3002, Impedimentos :3003, Integraciones :3004, Indicadores :3005, gateway :3000, portal :5173).
- Pruebas de API con un **gateway alterno :3110** del mismo build y los tres cubos de tasa en 100000 (`GATEWAY_URL=http://localhost:3110`); las de portal usan el gateway real :3000.
- Fuentes caídas sin detener el stack: instancias alternas del mismo build (Organización :3101, Indicadores :3205, gateway :3100, portal :5180) con la URL de la fuente apuntando a un puerto muerto (:3199). También para límites de exportación bajos, `Q360_FECHA_REFERENCIA` y un proxy que corta solo `/v1/interno/auditoria/exportaciones`. Código: `tests/support/entornoE6.ts`.
- Estado entre casos: el dueño de la base toma una foto de las tablas del fixture (`historia_usuario` E7-H*, historial, checklists, certificados, supervisiones, células, usuarios) y la restaura al terminar cada caso, además de vaciar `indicadores.*` y `cierre_hdu`; con `seed:e4` se recargan los impedimentos. Código: `tests/support/e6run.ts` (`fotoE6`, `restaurarE6`). Las series de snapshots se generan con el gancho D184 (`POST /v1/interno/carga/snapshots`) en fechas pasadas.
- Contrato: las respuestas se validan con `cumpleContrato(esquema, cuerpo)` contra `contracts/comun.v1.yaml` (los esquemas de Indicadores viven ahí, no en `indicadores.v1.yaml`; ver OBS-E6-09).

### Resultados de las corridas

| Corrida | Resultado |
| --- | --- |
| `e7-setup` + `e6-api` + `e6-e2e` sobre base limpia, antes de la regresión de E5 | **160 pasan, 0 fallan, 0 omitidas, 0 flaky** (11 sesiones + 72 API + 77 portal) |
| Las 3 pruebas `E6-A11Y-DEF01` a `DEF03` (agregadas después) | 3 pasan (corrida aparte) |
| Nube: `e6-api` con Organización e Indicadores en `&connection_limit=1` | **83 pasan** (11 sesiones + 72) |
| Nube: `e6-api` con ambos detrás de PgBouncer 1.26 real en modo transacción (`edoburu/pgbouncer`, `server_reset_query = DISCARD ALL`, URL `:6543/…&connection_limit=1&pgbouncer=true`) | **83 pasan**; el rol `svc_indicadores` conserva su `search_path` tras `DISCARD ALL` |

Procesos normales restaurados y contenedor de PgBouncer eliminado al terminar.

## 4. Regresión completa

Con `seed:e6` cargada, sin quitarle células a nadie. Orden: base, E7, E4, E5 (la regresión de E5 crea HDU en CEL-A y CEL-B, por eso va al final).

| Proyectos | Resultado |
| --- | --- |
| `setup`, `api`, `e2e` (E1 a E3, modelo de datos, seguridad, fuentes caídas) | 257 pasan, 1 omitida, 2 fallan → DEF-E6-07 (cerrado: 21 de 21 pasan tras el ajuste) |
| `e7-*` | **177 pasan**, 8 omitidas |
| `e4-*` | **146 pasan** |
| `e5-*` | 277 pasan, 5 fallan, 1 flaky de 283 en la primera corrida; ver OBS-E6-14 |

- Las 8 pruebas de E7 y E4 que antes fallaban por LID2 **pasan** con LID2 sin células: `E7-B03#1 T06`, `E7-A11Y` y `E7-RESP` «bandeja del Líder QA sin células» (×3), `E7-F04#2 T04`, `E7-F05#1 T02`, `E7-F05#3 T05` y `E4-F03#2`.
- Menús que cambian por E6: `E1-F02#3` y `E7-F01#2` pasan (QE: Bandeja, Equipo, Historias supervisadas, Impedimentos, Indicadores, Integraciones, Perfil; Líder y Auditor: Bandeja, Indicadores, Perfil; Administrador con «Snapshots de indicadores»), además de `E7-F01#3 T04c` (rutas de indicadores por rol).
- Omitidas, todas por diseño y **no certifican nada**: `E1-B01#3` (límite de intentos, `@limite-intentos`) y las 8 de `E7-ABS` (valores absolutos del fixture en base pura: no aplican a la base compartida).
- `E5-B01#1 T11` leyó el registro real del stack (`LOGS_E5_DIR` apuntando a una carpeta con una copia de `local-e6.log`) y pasó.

## 5. Defectos de la primera ronda

| ID | Estado | Evidencia de esta corrida |
| --- | --- | --- |
| DEF-E6-01 `aria-controls` al panel real | **Cerrado** | `E6-A11Y-DEF01`: ningún `aria-controls` expandido apunta a un id inexistente y «Ver HDU de <célula>» apunta a `lista-drilldown-panel`. Queda la OBS-E6-08 (menor) |
| DEF-E6-02 tabla de tendencia enfocable | **Cerrado** | `E6-A11Y-DEF02`: la región «Tabla de cumplimiento por fecha, desplazable» tiene `tabindex=0` y recibe foco; axe sin violaciones en Tendencia a 1280 y 375 px |
| DEF-E6-03 contraste del botón de peligro en hover | **Cerrado** | `E6-A11Y-DEF03`: contraste calculado de «Cerrar con excepción» en hover ≥ 4,5:1; axe sin violaciones con el cuadro abierto a 1280 y 375 px |
| DEF-E6-04 motivo en las reasignaciones de la semilla | **Cerrado** | `infrastructure/seed/e6/escenarios.mjs` envía `motivo` en sus 4 llamadas; en la base queda `hdu_historial_asignacion.motivo = «Escenario E6: H4 pasa a ANA1»`; los `PUT` con `motivo` de las pruebas dan 200 (E6-B02-T12, E6-F03-T10) |
| DEF-E6-05 CEL-D con LID3 y LID2 sin células | **Cerrado** | LID2 tiene 0 células vigentes en la base; LID3 ve CEL-D «Sin HDU» (E6-B02-T11, E6-F02-T11); las 8 pruebas de E7 y E4 de la sección 4 pasan |

## 6. Defectos nuevos y observaciones

No se encontró ningún defecto de producto de E6 con severidad de bloqueo ni mayor.

| ID | Tipo | Dueño | Descripción y reproducción |
| --- | --- | --- | --- |
| DEF-E6-07 | Defecto de pruebas (cerrado) | `q360-qa` | `tests/api/modelo-datos-estructura.spec.ts` (2 casos) fallaba porque su dato (`tests/support/modeloDatos.ts`) no conocía la tabla de extensión `organizacion.cierre_hdu` ni su llave foránea a `historia_usuario`. Se agregaron como extensión de E6 (D175). No se agregó a `SOLO_INSERCION`: `cierre_hdu` es inmutable por disparador, no por `REVOKE`. Rerun: 21 de 21 pasan |
| OBS-E6-08 | Menor | `q360-frontend` | En `BotonExportar.tsx` el botón `boton-exportar` lleva `aria-controls={idPanel}` y, con el menú cerrado (`aria-expanded=false`), ese id no existe en el DOM (`BUTTON#_r_0_`). axe no lo marca y el patrón es admitido, pero es el mismo tipo de referencia que DEF-E6-01. Reproducción: abrir `/qe/indicadores` y buscar `[aria-controls]` sin `getElementById` |
| OBS-E6-09 | Menor | `q360-arquitecto` | `contracts/comun.v1.yaml` declara `multipleOf: 0.1` en los porcentajes (`PuntoTendencia.cumplimiento`, `PorcentajeIndicador`). Un valor válido como 33,3 falla con Ajv por coma flotante (33,3 / 0,1 = 332,99999999999994). Se usó `multipleOfPrecision: 6` en `tests/support/contrato.ts`; otro consumidor del contrato con validación estricta rechazaría respuestas correctas. Además, el encargo menciona `cumpleContrato(…, "indicadores")`, pero los esquemas de Indicadores están en `comun.v1.yaml` |
| OBS-E6-10 | Backlog | `q360-arquitecto` | E6-B03-T13 pide mover H1 de SP-PROX a SP-LEJ, pero SP-LEJ es de CEL-C y el modelo exige un sprint de la célula de la HDU (422 `CATALOGO_INVALIDO`). La prueba usa SP-MED de CEL-A (misma célula) y valida lo mismo: filas anteriores intactas, fila nueva y serie de SP-PROX que termina el día anterior |
| OBS-E6-11 | Backlog | `q360-arquitecto` | E6-F05-T06 y E6-B05-T03 llevan H5 a `PENDIENTE_CIERRE` y la «asignan a un analista antes». Si se asigna a ANA2, ANA2 queda dentro del ámbito y no recibe acceso denegado. El helper de pruebas la asigna a ANA1 (equipo de QE1); conviene decirlo en el backlog |
| OBS-E6-12 | Información | `q360-arquitecto` | «Certificaciones detenido» en E6-F05-T09 exige cortar Certificaciones tanto para Organización (cierre) como para el gateway (el portal lee el checklist directo por el gateway). Con solo Organización cortada, el portal muestra el checklist y abre el cuadro |
| OBS-E6-13 | Información | — | «`CIERRE_EXCEPCION` aparece sin rol y `escala=1`»: se validó la parte de «sin rol» (el actor del evento trae solo `tipo`, `id`, `nombre`, E6-DIS-T05) y `escala=1` como parámetro de URL de Tendencia que ajusta la escala (E6-DOM-T02). No hay texto en el backlog ni en el diseño que fije otro alcance; si «escala=1» significa otra cosa, queda sin cubrir |
| OBS-E6-14 | Regresión E5 (no atribuible a E6) | `q360-frontend` / `q360-qa` | `e5-e2e` es inestable contra el gateway real: en 3 corridas de `e5-f03`, `e5-f05` y `e5-f07` fallaron conjuntos distintos (A: F03-T10, F05-T06, T16, T29, F07-T03, T12; B: F05-T08, T17, T26, F07-T10; C: F05-T06, T16, T29, F07-T09). Cada uno pasa en al menos otra corrida, y T06, T16 y T29 pasan aislados. Los reintentos muestran la pantalla de ingreso con «Demasiados intentos de ingreso» o `consulta-abierta` ausente, sin errores 5xx en el registro. No hay evidencia de relación con E6 (el cambio de E6 no toca E5). No se puede dar por certificada la regresión de esos casos de E5 en una sola corrida verde: queda **observada** |
| OBS-E5-B07-T11 | Preexistente, ajena a E6 | `q360-backend` | Observación de la suite de Organización (`E5-B07-T11`) informada por el coordinador. No se ejecutó aquí porque esa suite vacía la base compartida |

## 7. Desviaciones de diseño validadas

| Desviación | Prueba | Resultado |
| --- | --- | --- |
| `cierre_hdu` es inmutable por un disparador (`cierre_hdu_inmutable`), no por `REVOKE` | E6-DIS-T01, E6-B05-T08 | El rol del servicio y el dueño conservan el privilegio `UPDATE` y `DELETE`, y aun así ambos fallan por el disparador; `TRUNCATE` del dueño sí pasa (así se limpia entre casos) |
| Líder y Auditor no reciben `permisos.cerrarConExcepcion` | E6-DIS-T02, E6-F05-T05, E6-F05-T06 | La propiedad está ausente para Líder y Auditor; Administrador y Analista la reciben en `false`; solo el QE responsable en `true` |
| Con Certificaciones caída el cierre da 409 `CHECKLIST_NO_DISPONIBLE` | E6-DIS-T03, E6-B05-T06(b), E6-F05-T09 | 409 con `checklist.estado: indisponible`, no 503; la HDU no cambia |
| Los motivos del drill-down se limitan al color de la celda | E6-DIS-T04, E6-F02-T04 a T06 | H1 solo `RIESGO_ALTO` aunque tiene I2 abierto; H6 solo `IMPEDIMENTO_ESCALADO` aunque su riesgo es MEDIO; H3 en CEL-B amarilla trae `RIESGO_MEDIO` e `IMPEDIMENTO_ABIERTO` |
| `CIERRE_EXCEPCION` aparece sin rol | E6-DIS-T05 | El actor trae `tipo`, `id` y `nombre`; no hay `rol` ni `actorRol` en el evento. Para `escala=1` ver OBS-E6-13 |
| `guardarLote` hace una consulta por fila en una transacción de 5 s | E6-DIS-T06 | El código recorre las filas con `tx.$queryRaw` dentro de `$transaction`; el snapshot del fixture escribe más de 10 filas en menos de 2,5 s (unos 170 ms con 32 filas). Con el tope de 1000 HDU el margen contra 5 s no se midió |

## 8. Seguridad

- `CRON_SECRET`, `INDICADORES_SERVICIO_TOKEN`, `X_Q360_SERVICIO_TOKEN` y el `Authorization` del llamante **no aparecen** en cuerpos ni cabeceras de las respuestas de indicadores, exportaciones CSV y PDF, snapshots y cron (E6-SEC-T03), ni en el DOM, los registros del stack y del gateway alterno (E6-SEC-T04, E6-DOM-T01).
- El cron sin cabecera, con secreto ajeno, con un JWT de sesión o con el secreto sin `Bearer` responde 401 por el gateway y directo al servicio, y no crea ejecución (E6-B03-T02, E6-SEC-T02).
- Las rutas internas (`/v1/interno/carga/snapshots`, `/v1/interno/auditoria/exportaciones`, `/v1/interno/hdu/ambito`, `/v1/interno/checklist/estados`, `/v1/interno/impedimentos/evaluacion`) no se publican en el gateway: 404, también con la credencial de servicio y con sesión de administrador (E6-SEC-T01).
- Acceso cruzado: ANA1 y ADM1 reciben 403 en toda ruta de indicadores y exportación; QE2 y LID1 reciben 403 en células ajenas; sin sesión, 401 (E6-B01-T03, B02-T04, B02-T08, B03-T07, B03-T11, B04-T09 y los negativos de portal).

## 9. Lo que no se pudo cubrir

- Suites de servicio de Organización (`e3-acceso-y-cierre`, `e4-impedimentos-organizacion`, E2-B02): no se ejecutan sobre la base compartida (reserva de E6-B05-T12).
- Valores absolutos en base pura (E6-B01-T07, B02-T02, B02-T13, F01-T04, B04-T04 en su rama «base pura»): solo se ejecutó la rama de base compartida.
- El tiempo de `guardarLote` con 1000 HDU y la transacción de 5 s a ese volumen.
- `escala=1` más allá del parámetro de Tendencia (OBS-E6-13).
- Despliegue en nube real (Vercel): se simuló el pooler (PgBouncer) y el límite de conexiones, no el despliegue.

## 10. Estado en que queda la base

La regresión de E5 dejó datos suyos (81 HDU en total y las de CEL-A y CEL-B que crea E5), así que las cifras absolutas de LID1 y AUD1 ya no coinciden. E7-H1 a H8 están en su estado del fixture, LID2 sin células, `cierre_hdu` e `indicadores.*` vacíos. Para repetir la certificación hay que correr E6 antes de la regresión de E5 o recargar la base.
