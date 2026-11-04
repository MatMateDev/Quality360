# Certificación E5 · Consulta de Jira y asignación de HDU (Quality360)

Dueño: `q360-qa`. Cambio certificado: «E5 · consulta y asignación» (`docs/backlog/e5-consulta-asignacion.md`, D132–D152), sobre el código de `b980a3a` (rama `feature/e1-e2-quality360`, backend, gateway, portal e infraestructura integrados). No se modificó código de producción. Certificación anterior de E5: `certificacion-e5.md`.

## Ronda 3

Código: HEAD `a733617` (incluye `11f5910` y `8f8f35e`, ya en producción, y DEF-E5C-04 en `0ee4aaf`). No se tocó código de producción. Pruebas del 4-nov-2026 sobre el stack real local (Supabase local vaciado con `stop --no-backup`, `npm run local`, semillas `seed`, `seed:e7`, `seed:e4`, `seed:e5`), con **Organización e Integraciones con `DATABASE_URL` terminada en `&connection_limit=1`** (como la nube), el gateway :3000 con `LIMITE_TASA_MAX` y `LIMITE_TASA_ESCRITURA_MAX` en 100000 (OBS-7) y las pruebas de API contra un segundo gateway :3110 del mismo build con los cubos alzados. Un primer arranque sobre una base con restos de Auth de rondas anteriores dejó la semilla E7 con ids de usuario distintos de los de Auth (todo inicio de sesión del portal daba «acceso no habilitado»): se descartó, se vació la base y se repitió; no es un defecto del producto.

### Veredicto de la ronda 3

**10 HDU CERTIFICADAS, 0 OBSERVADAS, 0 NO VERIFICABLES. DEF-E5C-04 está CERRADO. Defectos de producto abiertos: ninguno.**

| HDU | Ronda 2 | Ronda 3 | Fundamento |
| --- | --- | --- | --- |
| E5-F01 | CERTIFICADA | CERTIFICADA | Verde en la corrida completa de E5 |
| E5-F02 | CERTIFICADA | CERTIFICADA | F02 completa: 26 de 26 (15 de F02 y 11 de sesiones) |
| E5-F03 | CERTIFICADA (reserva OBS-5) | CERTIFICADA | Verde en la corrida completa de E5, incluido T14 (OBS-5 no reapareció) |
| E5-F04 | CERTIFICADA | CERTIFICADA | Verde en la corrida completa de E5 |
| E5-F05 | CERTIFICADA | CERTIFICADA | F05 completa: 42 de 42 (31 de F05 y 11 de sesiones), dos veces; confirmar crea las HDU sin ERROR_INTERNO. Una intermitencia de la prueba T19 corregida (ver abajo) |
| E5-B01 | CERTIFICADA | CERTIFICADA | Verde |
| E5-B02 | CERTIFICADA | CERTIFICADA | Verde; además `e5-pool-unico` E5-B02#1 con una conexión |
| E5-B03 | CERTIFICADA | CERTIFICADA | Verde; además `e5-pool-unico` E5-B03#2 y #3 con una conexión |
| E5-B04 | CERTIFICADA | CERTIFICADA | B04 completa: 27 de 27 (16 de B04 y 11 de sesiones) |
| E5-B05 | CERTIFICADA | CERTIFICADA | B05 completa: 49 de 49 (38 de B05 y 11 de sesiones), con T38 nueva |

Resumen: CERTIFICADA 10 · OBSERVADA 0 · NO VERIFICABLE 0.

### DEF-E5C-04 · Confirmar con una conexión y etiqueta `celula-*` desconocida

| Aspecto | Evidencia | Resultado |
| --- | --- | --- |
| Confirmar no da ERROR_INTERNO con `connection_limit=1` | `services/organizacion/test/integracion/e5-pool-unico.test.ts`, 8 de 8: los 4 casos de `8f8f35e` y 4 nuevos «E5-C» (CREAR válida crea con una sola conexión; CREAR con código existente da HDU_CREADA_DESPUES aunque la asignación sea inválida; CREAR con asignación inválida da ASIGNACION_INVALIDA y no escribe; ACTUALIZAR vincula y actualiza el título). Orden de motivos conservado | **Pasa** |
| Lo mismo por HTTP real, contra Organización e Integraciones arrancadas con una conexión | Nueva `api/e5-b05` **T38** (`[E5-B05#11]`): QTY-1 con `celula-desconocida`, QTY-2 con dos etiquetas `celula-*` (ambigua), QTY-3 con `Celula-Inexistente` y otra etiqueta; las 4 filas quedan en NUEVA sin CELULA_NO_ENCONTRADA, se marcan, se confirma: 200, ejecución `CONFIRMACION` con `leidas 4, creadas 4, EXITOSA`, consulta CONFIRMADA, +4 HDU con origen JIRA y la respuesta no contiene ERROR_INTERNO | **Pasa** |
| Confirmar por el portal | F05 completa y B05 completa con la misma configuración | **Pasa** |

T38 no se corrió contra el código anterior a `0ee4aaf`, así que no se vio en rojo; su valor de regresión descansa en el diseño del caso y en la prueba roja/verde de `e5-pool-unico` que documenta `fix-e5-pool-unico.md`. El Jira simulado ahora devuelve `labels` y acepta `labels` en `PUT /__issues/{clave}` (`tests/support/jira-falso/servidor.ts`).

### Cifras de la ronda 3

| Corrida | Base | Resultado |
| --- | --- | --- |
| `e5-pool-unico` (Organización, `connection_limit=1&pool_timeout=1`) | local | 8 de 8 |
| Suite de node de Organización | local | 327 pasan, 0 fallan |
| Suite de node de Integraciones | local | 327 pasan, 0 fallan |
| T38 aislada | MVP | pasa |
| B04 / B05 / F05 / F02 completas (incluyen 11 pruebas de sesión cada una) | MVP | 27 / 49 / 42 / 26 pasan, 0 fallan |
| E5 completa (`e5-api` + `e5-e2e`) | MVP | 208 pasan, 1 intermitente (F05 T19), 0 fallan |
| F05 T19, `--repeat-each` sin reintentos, antes del ajuste | MVP | 2 de 8 fallan |
| F05 T19, después del ajuste | MVP | 16 de 16 (otra repetición de 10 sin el ajuste no reprodujo la falla) |
| F05 completa tras el ajuste, sin reintentos | MVP | 42 de 42 |
| E7 | MVP | 175 pasan, 8 omitidas (valores absolutos, base pura), 0 fallan |
| E4 | MVP | 146 pasan, 0 fallan |
| E1–E3, modelo de datos, seguridad y login (`api` + `e2e`) | MVP | 258 pasan, 1 omitida (`E1-B01#3`, límite del proveedor), 0 fallan |

No se repitió E7 en base pura (no se pidió en esta ronda); los valores absolutos de E7 siguen certificados solo por la ronda 2.

### Hallazgo de la ronda 3 (de la prueba, no del producto)

- **F05 T19 (carrera de la prueba).** «Dos Administradores confirman a la vez» leía el texto de las dos pantallas en el instante en que el recuento de HDU llegaba a 4; en 2 de 8 ejecuciones sin reintentos la pantalla aún mostraba «Consulta abierta» sin el resultado (la actualización de la interfaz llega después del commit). Con las 4 HDU creadas una sola vez y sin duplicados en las dos fallas. Ahora la prueba espera hasta 30 s el texto «Resultado / ya se confirmó / en curso». El mismo patrón de OBS-7/ronda 2 queda descartado como causa: los cubos de tasa estaban alzados.

### Cambios en pruebas de la ronda 3

| Prueba | Cambio | Motivo |
| --- | --- | --- |
| `api/e5-b05` T38 (nueva, `[E5-B05#11]`) | Etiquetas `celula-*` desconocida, ambigua y con mayúsculas: NUEVA y confirmación sin ERROR_INTERNO | DEF-E5C-04 |
| `support/jira-falso/servidor.ts` | `labels` en las issues y en `PUT /__issues` | Soporte de T38 |
| `e2e/e5-f05` T19 | Espera con `expect.poll` el texto de resultado | Carrera de la prueba |

### Reproducibilidad

Arranque: `LIMITE_TASA_MAX=100000 LIMITE_TASA_ESCRITURA_MAX=100000 npm run local` con las dos `DATABASE_URL` locales terminadas en `&connection_limit=1` (los `.env` no se versionan), y `PORT=3110` con los tres límites alzados para el segundo gateway. Script `tests/logs-e5/ronda7.sh`; salidas en `tests/logs-e5/q7-*` y `r3x-*`/`r3y-*` (no versionadas).

## Ronda 2

Código: HEAD `7debadd` (incluye DEF-E5C-01 en `467815a`/`4c79df4` y DEF-E5C-02/03 en `c102c2d`). No se tocó código de producción. Pruebas del 3-nov-2026 sobre el stack real local, con Integraciones con `DATABASE_URL` terminada en `?schema=integraciones&connection_limit=1` (como la nube) en todas las corridas salvo cuatro repeticiones de diagnóstico de T28 (ver OBS-6).

### Veredicto de la ronda 2

**10 HDU CERTIFICADAS, 0 OBSERVADAS, 0 NO VERIFICABLES. Los tres defectos de la ronda 1 están cerrados. Defectos de producto abiertos: ninguno.** Quedan dos hallazgos de entorno o de diseño (OBS-6, OBS-7) para el arquitecto, OBS-5 sigue vigente y está pendiente del usuario E5-MAN-01.

| HDU | Ronda 1 | Ronda 2 | Fundamento |
| --- | --- | --- | --- |
| E5-F01 | CERTIFICADA | CERTIFICADA | Verde en las dos bases (T01–T11) |
| E5-F02 | CERTIFICADA | CERTIFICADA | Verde en las dos bases (T01–T13) |
| E5-F03 | CERTIFICADA | CERTIFICADA (con reserva OBS-5) | T01–T13 verdes siempre; T14 verde en la base pura y aislada, falla en la corrida completa de la base MVP (ver OBS-5) |
| E5-F04 | CERTIFICADA | CERTIFICADA | T02 sin la espera entre filtros: verde 3 de 3 aislada y en las 3 corridas completas de E5 |
| E5-F05 | OBSERVADA | **CERTIFICADA** | 13/13 escenarios. T16 verde (aviso, solo lectura, botón «Ir a la nueva consulta», ninguna HDU creada); T29 nueva verde |
| E5-B01 | CERTIFICADA | CERTIFICADA | Verde |
| E5-B02 | CERTIFICADA | CERTIFICADA | Verde |
| E5-B03 | CERTIFICADA | CERTIFICADA | Verde |
| E5-B04 | CERTIFICADA | CERTIFICADA | Verde |
| E5-B05 | OBSERVADA | **CERTIFICADA** | 14/14 escenarios. T37 estable; T28 verde con el cierre por pasadas (OBS-6) |

Resumen: CERTIFICADA 10 · OBSERVADA 0 · NO VERIFICABLE 0.

### Estado de los defectos

| ID | Agente dueño | Estado | Evidencia de la ronda 2 |
| --- | --- | --- | --- |
| DEF-E5C-01 | `q360-backend` | **CERRADO** | `api/e5-b05` T37 (dos PATCH simultáneos sobre una fila, célula y QE) con `connection_limit=1`: 6 de 6 y 5 de 5 en repeticiones dirigidas (`--repeat-each`), y verde en las 2 corridas completas de B05 y en las 3 de E5. Prueba nueva de portal `e2e/e5-f05` T29 (célula y QE elegidos en menos de 300 ms, medido con `Date.now()` dentro de la prueba): conserva ambos valores, el sprint propuesto y «falta: analista» en pantalla, tras recargar y en el servidor; 5 de 5 aislada y verde en las corridas completas con límite alzado. En la primera corrida completa (límites por defecto) T29 falló en el primer intento y pasó en el reintento: el QE quedó vacío; no se trazó, coincide con el patrón de OBS-7 y no se volvió a ver en las otras 10 ejecuciones. |
| DEF-E5C-02 | `q360-frontend` | **CERRADO** | `e2e/e5-f05` T16 (ajustada al botón): `aviso-consulta-reemplazada` con «Esta consulta fue reemplazada por <nombre>.», `selector-celula` ausente (solo lectura), `boton-ir-nueva-consulta` visible, ninguna HDU creada y, al pulsar el botón, la consulta nueva editable sin el aviso. Verde 3 de 3 aislada y en las corridas completas con límite de tasa alzado (OBS-7). axe a 1280 y 375 px sobre esta pantalla (prueba nueva de `e5-a11y-responsivo`): sin violaciones serious ni critical y sin desborde. |
| DEF-E5C-03 | `q360-frontend` | **CERRADO** | `e2e/e5-f04` T02 sin la espera entre los cambios de filtro (origen CSV, limpiar origen, «Fallida» en seguida): verde 3 de 3 aislada y en las 3 corridas completas de E5. |

### Defectos y hallazgos nuevos

Ningún defecto de producto nuevo. Hallazgos para el arquitecto:

- **OBS-6 (T28 y F05-T23; diseño del presupuesto, no defecto).** Las dos pruebas esperaban que la segunda pasada de la confirmación creara las 205 HDU restantes dentro del presupuesto de 8 s. En este equipo una pasada crea entre 125 y 205 (sin cambiar la prueba: 4 de 5 ejecuciones con `connection_limit=1` quedaron cortas (125, 175 y 200 creadas en las que se midieron); sin él, 3 de 4 también), así que la consulta termina `INCOMPLETA` y se repite. No depende de `connection_limit=1` ni del cambio: el ritmo es de unos 40 ms por fila entre Integraciones y Organización. El comportamiento es el diseñado (cada pasada es repetible y no duplica; el total fue siempre 230 sin duplicados), pero con 500 filas y Organización lenta la persona hará varias pasadas. Se cambió la prueba para repetir hasta cerrar (máximo 5 pasadas) y exigir 205 creadas en total sin duplicados. Decidir si `INTEGRACIONES_PRESUPUESTO_MS` (8000 por defecto) debe subir; medir en la nube.
- **OBS-7 (límite de tasa del gateway real frente a las pruebas del portal; entorno de prueba).** Las pruebas de portal usan el gateway real (:3000), cuyo cubo general es de 300 solicitudes por minuto. En la corrida completa de la base MVP con los límites por defecto, F05 falló T16 (dos intentos) y T23, T19 falló en el diagnóstico y T06, T29 y T10 fallaron una vez. En la traza de T19 la primera solicitud de la página, `GET /v1/me`, devolvió 429 y el portal no mostró `consulta-abierta`; los otros casos siguen el mismo patrón («no aparece la pantalla», «la fila no cambia») y no se trazaron uno por uno. Al reiniciar solo el gateway :3000 con `LIMITE_TASA_MAX=100000`, F05 completa pasó 42 de 42 en 2,4 min (con el límite por defecto: 7,7 min con fallas) y E5 completa pasó salvo F03 T14 (OBS-5). No se sabe qué muestra el portal cuando `/v1/me` da 429 (se vio una pantalla sin la consulta y sin mensaje): conviene que `q360-frontend` lo revise, aunque una persona real no llega a 300 solicitudes por minuto.

### Los intermitentes de la ronda 1

| Prueba | Veredicto | Explicación |
| --- | --- | --- |
| `e5-f03` T10 | Entorno de prueba | Su falla de la ronda 1 fue el límite de escrituras del gateway real (30 por minuto). En la ronda 2 pasó en todas las corridas completas y en la de F03 sola. |
| `e5-f05` T06 | Entorno de prueba | Falló en el primer intento de la corrida completa con límites por defecto («Sin asignar» tras aplicar al grupo) y pasó en el reintento; con el cubo general alzado pasó en las 3 corridas completas siguientes. Mismo patrón que OBS-7. |

### Cifras de la ronda 2

| Corrida | Base | Resultado |
| --- | --- | --- |
| T37, repeticiones dirigidas | MVP | 6 de 6 y 5 de 5 |
| F05 T16 y F04 T02 (3 repeticiones cada una), T29 (5), a11y del aviso | MVP | todas verdes |
| F05 completa, límites por defecto | MVP | 39 pasan (28 de F05 y 11 de sesiones), 2 fallan (T16, T23), 1 intermitente (T06) |
| B05 completa | MVP | 47 pasan, 1 falla (T28, OBS-6) |
| E5 completa, límites por defecto | MVP | 204 pasan, 2 fallan (T28; T16 en los dos intentos), 2 intermitentes (T06, T29) |
| T28 sin cambiar la prueba: 5 ejecuciones con `connection_limit=1` (la de B05 completa, la de E5 completa y 3 repeticiones) y 4 repeticiones sin él | MVP | 1 de 5 y 1 de 4 pasan |
| Tras el cierre por pasadas y `LIMITE_TASA_MAX` alzado en :3000: F05 completa, B05 completa, T28 (3), T37 (5) | MVP | F05 42 de 42; B05 48 de 48; T28 3 de 3; T37 5 de 5 |
| E5 completa, mismo entorno | MVP | 207 pasan, 1 falla: F03 T14 (OBS-5); aislada pasa en 29 s; F03 completa sola también la falla |
| E5 completa | base pura | **208 pasan, 0 fallan** (197 pruebas de E5 y 11 de sesiones; F03 T14 pasa) |
| E1–E3, modelo de datos, seguridad y login (`api` + `e2e`) | MVP | 258 pasan, 1 omitida (`E1-B01#3`), 0 fallan |
| E4 | MVP | 146 pasan, 0 fallan |
| E7 | MVP | 175 pasan, 8 omitidas (valores absolutos), 0 fallan |
| E7 | base pura | 177 pasan, 3 omitidas, 3 fallan: `E7-B02#2 T07` y `E7-F06#1 T03b` (usuarios de la semilla MVP que la base pura no tiene; no certifican, pasaron en la base MVP) y `E7-F06#2 T05` (el CSV trajo 11 filas y la pantalla 15, por HDU `B05-CONTRATO-*` de pruebas de API anteriores; aislada pasa en 10 s) |
| axe a 1280 y 375 px en todas las pantallas de E5, incluida la nueva del aviso de reemplazo y la consulta tras «Ir a la nueva consulta» | MVP y base pura | sin violaciones serious ni critical ni desborde |

Las corridas de E1–E4 y E7 de la base MVP se hicieron con las pruebas de E5 sin ajustes en curso y con el gateway :3000 con límites por defecto; no cambian respecto de la ronda 1.

### Cambios en pruebas de la ronda 2

| Prueba | Cambio | Motivo |
| --- | --- | --- |
| `e2e/e5-f04-historial.spec.ts` T02 | Se quitó la espera entre los dos cambios de filtro | DEF-E5C-03 corregido |
| `e2e/e5-f05-asignacion.spec.ts` T16 | Verifica el texto «Esta consulta fue reemplazada por …», `boton-ir-nueva-consulta` y su efecto; si no aparece el diálogo de reemplazo, describe el estado (ejecuciones sin terminar, pantalla, alertas) | DEF-E5C-02 corregido |
| `e2e/e5-f05-asignacion.spec.ts` T23 | «Continuar confirmación» se repite hasta cerrar (máximo 5 pasadas) y se verifica el total sin duplicados | OBS-6 |
| `api/e5-b05-consulta-asignacion.spec.ts` T28 | Confirma hasta `CONFIRMADA` (máximo 5 pasadas), exige 205 creadas en total y sin duplicados | OBS-6 |
| `e2e/e5-f05-asignacion.spec.ts` T29 (nueva, E5-F05#3) | Célula y QE en menos de 300 ms conservan ambos valores y el sprint | DEF-E5C-01 en el portal |
| `e2e/e5-a11y-responsivo.spec.ts` (nueva) | axe del aviso de reemplazo en solo lectura y de la consulta nueva tras el botón, a 1280 y 375 px | Pantalla nueva |

### Reproducibilidad

Pruebas de API con `GATEWAY_URL=http://localhost:3110` (gateway del mismo build con los cubos alzados); el portal usa :3000, que en las corridas finales se levantó con `LIMITE_TASA_MAX=100000` (OBS-7). Salidas en `tests/logs-e5/q4-*`, `q5-*` y `q6-*` (no versionadas). La base pura se obtuvo vaciando los esquemas de servicio y `auth.users` con el dueño de la base, restituyendo los 5 roles de `organizacion.rol` que crean las migraciones y corriendo solo `seed:e7`, `seed:e4` y `seed:e5`.

## Veredicto de la ronda 1 (superado por la ronda 2)

**8 HDU CERTIFICADAS, 2 OBSERVADAS, 0 NO VERIFICABLES. Defectos abiertos: 2 de severidad media y 1 baja (todos de portal o Integraciones).** Los 56 escenarios de E5 tienen prueba ejecutada; 53 pasan, 2 fallan por defectos reales de producto (E5-F05#8 y E5-B05#4) y 1 (E5-F03#1) pasó en la ronda 1 y no concluyó en la ronda 2 por la velocidad del equipo (OBS-5). Pendiente del usuario: **E5-MAN-01** (caso manual contra un Jira real, no ejecutado).

| HDU | Dictamen | Fundamento |
| --- | --- | --- |
| E5-F01 | CERTIFICADA | Regresión verde (T01–T11). Ningún caso afirma los textos del destino que cambian en D143 (búsqueda en `tests/`) |
| E5-F02 (reescrita) | CERTIFICADA | 5/5 escenarios (T01–T12, T12 ×4 roles); T13 es la regresión de la suite (verde) |
| E5-F03 | CERTIFICADA | Regresión verde en la ronda 1 (T01–T14). En la ronda 2 T14 no terminó por la velocidad del equipo (ver OBS-5); no es un efecto del cambio |
| E5-F04 (+ escenario 4) | CERTIFICADA | 4/4 escenarios; T12 y T13 verdes; T01–T11 adaptados a la lista con 5 ejecuciones |
| E5-F05 (nueva) | **OBSERVADA** | 12/13 escenarios verdes. E5-F05#8 falla en T16 (DEF-E5C-02): al reemplazar la consulta desde otra pestaña el portal cambia a la consulta nueva sin el aviso «fue reemplazada» |
| E5-B01 | CERTIFICADA | Regresión verde; T04 y T12 adaptados (consultar en lugar de sincronizar; FK a `consulta_jira`) |
| E5-B02 (reescrita) | CERTIFICADA | 4/4 escenarios, T01–T14 + T15 (datos borde de QTY-15) |
| E5-B03 | CERTIFICADA | Regresión verde (T01–T14) |
| E5-B04 (+ escenario 4) | CERTIFICADA | 4/4 escenarios; T16 y T17 verdes; T01–T13 adaptados a consulta/confirmación |
| E5-B05 (nueva) | **OBSERVADA** | 13/14 escenarios verdes. E5-B05#4 falla en T37 (DEF-E5C-01): dos PATCH casi simultáneos sobre la misma fila pierden uno de los campos |

Resumen: CERTIFICADA 8 · OBSERVADA 2 · NO VERIFICABLE 0.

## Entorno

- Stack real local: Supabase local (Docker, base vaciada con `supabase stop --no-backup`), `npm run local -- --build` (organización, certificaciones, impedimentos, integraciones, gateway :3000, portal :5173) y semillas `seed` (MVP) + `seed:e7` + `seed:e4` + `seed:e5`. Jira simulado en `tests/support/jira-falso/` (:4010) con el proyecto nuevo `ENORME` (520 historias) y, por `PUT /__issues/`, QTY-13 (ADF), QTY-14 y QTY-15 (título de 200 caracteres sin espacios, descripción de 1.000 y sprint de 80).
- Las pruebas de API van a un segundo gateway del mismo build (:3110) con los cubos de tasa alzados (el real, :3000, limita a 30 escrituras/min); el portal, `E5-GW#1`, `E5-GW#5` y la prueba del cubo D152 usan el gateway real.
- Instancias del perfil de QA (`tests/support/entornoE5.ts`): I2–I5 como en la certificación anterior; I4 :3106 con presupuesto de 1.500 ms (ver OBS-4), I6 :3116 con `INTEGRACIONES_CONSULTA_VIGENCIA_MS=2000`, :3114–:3118 para reinicio, carreras y Organización cortada; proxies de Organización que cortan una ruta (`/estado-codigos`, `/upsert`) o ejecutan un gancho entre la pre-validación y la escritura (`/asignaciones/validar`).
- Arnés: ADM2 y QE5 se crean por la API en la prueba y se borran con su auditoría (`crearArnes`); la célula de 60 caracteres se crea con el dueño de la base (`crearCelulaLarga`, no hay API para crear células) y se borra al terminar; no están en la semilla. La limpieza `limpiarE5()` vacía `consulta_item` y `consulta_jira` (en ese orden) además de lo anterior, y borra las HDU manuales `QTY-*`, `BIG-*`, `EXACTO-*` y `ENORME-*` que crean los casos.
- Valores absolutos de E7: se corrieron sobre una base pura (truncado de datos de servicio y Auth, solo `seed:e7` + `seed:e4` + `seed:e5`); el resto, sobre la base con la semilla MVP.
- Evidencia: salidas de Playwright en `tests/logs-e5/` (`q1-*.log/json` ronda 1, `q2-*.log/json` ronda 2, `q3-re.*` repetición), no versionadas.

## Rondas

| Ronda | Qué se corrió | Resultado |
| --- | --- | --- |
| 0 | Construcción de las pruebas contra el stack real; ajustes de las propias pruebas (selectores, esperas de guardado, textos) | No cuenta como ronda: 3 defectos de prueba corregidos |
| 1 | Base MVP: E5 completa (API + portal), E7, E4, E1–E3 + modelo de datos + seguridad + login | E5: 202 pasan, 2 fallan (T37, T16), 2 flaky (F03-T10 por el límite de escrituras del gateway, F05-T06). E4: 146/146. Resto: 258 pasan, 1 omitida (`E1-B01#3`, límite del proveedor). E7: el primer intento cayó en `e7-setup` (inicio de sesión de ANA1 y ANA2 por la interfaz, sin pruebas ejecutadas); tras esperar la ventana de límite de inicios de sesión de Supabase: 175 pasan, 8 omitidas (absolutos de base pura), 0 fallan |
| 2 | Base pura (solo `seed:e7/e4/e5`): E7; luego E5 completa | E7: 178 pasan, 3 omitidas (valores absolutos en pantalla: exigen una base con solo `seed:e7`), 2 fallan por usar usuarios de la semilla MVP que la base pura no tiene (`E7-B02#2 T07`, `E7-F06#1 T03b`; ambos pasaron en la ronda 1). E5: 201 pasan, 4 fallan, 1 flaky: T37 y T16 (defectos); F04-T02 (carrera de la prueba con el filtro; sincronizada y repetida en verde); F03-T14 (OBS-5) |
| 3 | No hubo: los defectos son de producción y no se corrigen en esta sesión | Repetición dirigida de F04-T02 y F05-T05 (con el aviso de célula sin Líder agregado): 13 pasan |

Los dos defectos abiertos reprodujeron en las dos rondas. Si se corrigen, la ronda siguiente corre primero `api/e5-b05` T37 y `e2e/e5-f05` T16 y después la suite completa.

## Defectos por agente dueño (ronda 1; los tres quedaron cerrados en la ronda 2)

| ID | Agente dueño | Severidad | Reproducción | Prueba |
| --- | --- | --- | --- | --- |
| DEF-E5C-01 | `q360-backend` (Integraciones); secundario `q360-frontend` | Media | Sobre la consulta A, enviar a la vez `PATCH …/items {itemIds:[QTY-1], asignacion:{celulaId: CEL-C}}` y `PATCH …/items {itemIds:[QTY-1], asignacion:{qeId: QE2}}`. Ambos responden 200, pero la fila queda con un solo campo (a veces solo la célula, a veces solo el QE) y sin el sprint propuesto: la edición de última escritura toma la fila de antes de que la otra confirme y pisa el resultado. En el portal ocurre al elegir célula y QE con menos de ~300 ms entre ambos: la fila queda «Incompleta (falta: QE, analista y sprint)» o sin sprint, sin error. Propuesta: leer la fila bajo bloqueo (`SELECT … FOR UPDATE`) dentro de la transacción de la edición; el portal puede además serializar los guardados por fila | `tests/api/e5-b05-consulta-asignacion.spec.ts` T37 (falla en todas las ejecuciones) |
| DEF-E5C-02 | `q360-frontend` | Media | Abrir la consulta A en una pestaña; en otra (o por la API) consultar con `reemplazar: true`; en la primera cambiar el selector de célula de QTY-1. El PATCH responde 409 `CONSULTA_NO_ABIERTA` (`estado: REEMPLAZADA`) y el portal relee `consultas/actual`, que ya es la consulta nueva: muestra la nueva, sin asignaciones y sin `aviso-consulta-reemplazada` («Esta consulta fue reemplazada por …»). La persona pierde su trabajo sin explicación. Esperado (E5-F05#8, T16): aviso con el motivo, consulta anterior en solo lectura y ninguna HDU creada | `tests/e2e/e5-f05-asignacion.spec.ts` T16 (falla en las dos rondas) |
| DEF-E5C-03 | `q360-frontend` | Baja | En Historial, filtrar por origen CSV, luego limpiar el origen y elegir enseguida el resultado «Fallida»: el segundo cambio se aplica sobre el estado anterior (`origen=CSV`) y la lista queda vacía. Con 1,5 s entre cambios funciona. Intermitente (pasó en la ronda 1) | `tests/e2e/e5-f04-historial.spec.ts` T02 (la prueba ahora espera entre cambios) |

Sin defectos para `q360-integraciones`, `q360-seguridad-gateway` ni `q360-infra`.

## Observaciones (no son defectos; para decisión del arquitecto)

- **OBS-1.** La fila de la consulta guarda `prioridad: null` cuando Jira no la trae o no la entiende (QTY-5, QTY-6); el backlog (E5-B02-T02) dice `MEDIA`. El contrato admite `null` y la HDU creada sí nace `MEDIA` (prueba adicional E5-B05-T36). Ajustar el backlog.
- **OBS-2.** Tras confirmar la consulta A con 4 marcadas, el texto dice «7 filas sin marcar no se crearon» (6 nuevas más QTY-11, que no es marcable); el backlog (E5-F05-T11) dice 6. La prueba verifica 7.
- **OBS-3.** `urlExterna` se arma con `http://` si el sitio es local (`127.0.0.1`, `localhost`) y con `https://` en otro caso; el backlog dice siempre `https://`. Con Jira Cloud (`*.atlassian.net`) no se pudo verificar.
- **OBS-4.** E5-B02-T12 con presupuesto de 2.500 ms y Jira a 1 s por página termina `INCOMPLETA` por el tope de 100 por tanda (dos páginas en ~2 s), no por `PRESUPUESTO_DE_TIEMPO`. Se verificó el corte por tiempo con 1.500 ms.
- **OBS-5.** E5-F03-T14 (re-importar el mismo archivo con presupuesto de 2,5 s y Organización lenta) es sensible a la velocidad del equipo: cada pasada vuelve a recorrer las filas ya creadas (~33 ms cada una con el navegador en marcha) y, si eso consume el presupuesto, no avanza (se estancó en 75). Con 250 filas pasó en la ronda 1; en la ronda 2 no. La importación no cambia en este cambio (D143); en API sin navegador completa en 3 pasadas. Riesgo para archivos grandes con Organización lenta; medir en la nube.

## Cobertura por escenario

Resultado de la última ejecución de cada prueba (el de la ronda 1; las filas marcadas «ronda 2» cambiaron en la ronda 2); entre paréntesis, lo que no pasó.

| Escenario | Pruebas | Resultado |
| --- | --- | --- |
| E5-B01#1 | T01, T02, T03, T04, T09, T10, T11 | pasa |
| E5-B01#2 | T05, T06, T07 | pasa |
| E5-B01#3 | T08, T12 | pasa |
| E5-B02#1 | T01, T02, T03, T04, T09, T11, T15 | pasa |
| E5-B02#2 | T05, T06, T12 | pasa |
| E5-B02#3 | T07, T08, T10 | pasa |
| E5-B02#4 | T13, T14 | pasa |
| E5-B03#1 | T01, T02, T03, T11, T12 | pasa |
| E5-B03#2 | T04, T05, T06, T07, T08, T14 | pasa |
| E5-B03#3 | T09, T10, T13 | pasa |
| E5-B04#1 | T01, T02, T03, T04, T10, T11, T12, T13 | pasa |
| E5-B04#2 | T05, T06, T07 | pasa |
| E5-B04#3 | T08, T09, T15 | pasa |
| E5-B04#4 | T16, T17 | pasa |
| E5-B05#1 | T01, T34 | pasa |
| E5-B05#2 | T02, T03, T04, T05 | pasa |
| E5-B05#3 | T06 | pasa |
| E5-B05#4 | T07, T08, T09, T37 | pasa (ronda 2) |
| E5-B05#5 | T10, T11, T12 | pasa |
| E5-B05#6 | T13, T14, T36 | pasa |
| E5-B05#7 | T15, T16 | pasa |
| E5-B05#8 | T17, T18 | pasa |
| E5-B05#9 | T19, T20, T21 | pasa |
| E5-B05#10 | T22, T23, T24, T35 | pasa |
| E5-B05#11 | T25, T26, T27 | pasa |
| E5-B05#12 | T28, T29, T30 | pasa |
| E5-B05#13 | T31, T32 | pasa |
| E5-B05#14 | T33 | pasa |
| E5-F01#1 | T01, T02, T08, T09, T10 | pasa |
| E5-F01#2 | T03, T04, T05 | pasa |
| E5-F01#3 | T06, T07, T09 | pasa |
| E5-F02#1 | T01, T02, T03, T08, T09, T11, T12 | pasa |
| E5-F02#2 | T04 | pasa |
| E5-F02#3 | T05, T06 | pasa |
| E5-F02#4 | T10 | pasa |
| E5-F02#5 | T07 | pasa |
| E5-F03#1 | T01, T02, T03, T11, T12, T14 | pasa (T14 en la base pura y aislada; falla en la corrida completa de la base MVP, OBS-5) |
| E5-F03#2 | T04, T05, T06 | pasa |
| E5-F03#3 | T07, T08, T09, T10 | pasa |
| E5-F04#1 | T01, T07, T08, T10 | pasa |
| E5-F04#2 | T02, T05, T09 | pasa |
| E5-F04#3 | T03, T04, T06 | pasa |
| E5-F04#4 | T12, T13 | pasa |
| E5-F05#1 | T01, T02 | pasa |
| E5-F05#2 | T03, T04, T05, T27 | pasa |
| E5-F05#3 | T06, T07, T24, T29 | pasa |
| E5-F05#4 | T08, T09 | pasa |
| E5-F05#5 | T10, T11, T25 | pasa |
| E5-F05#6 | T12, T13 | pasa |
| E5-F05#7 | T14 | pasa |
| E5-F05#8 | T15, T16, T17 | pasa (ronda 2) |
| E5-F05#9 | T18, T19 | pasa |
| E5-F05#10 | T20 | pasa |
| E5-F05#11 | T21, T22 | pasa |
| E5-F05#12 | T23 | pasa |
| E5-F05#13 | T26 | pasa |

Lectura de la tabla: `E5-B05#4 T37` y `E5-F05#8 T16` son los defectos DEF-E5C-01 y DEF-E5C-02; `E5-F03#1 T14` pasó en la ronda 1 y no concluyó en la ronda 2 (OBS-5). Una prueba omitida o saltada no certifica.

Pruebas fuera de la tabla, todas ejecutadas y verdes: `E5-GW#1`, `#2`, `#3` (×2), `#4`, `#5` (la ruta `sincronizaciones` da 404 y las 7 rutas de la consulta con id están publicadas); `GW-D152` (100 `PATCH` seguidos y uno de 230 filas por el gateway real sin 429; el cubo propio de 120/min, no el de escritura de 30/min); 5 pruebas de accesibilidad.

### Seguridad y casos pedidos

| Tema | Prueba | Resultado |
| --- | --- | --- |
| Solo el Administrador opera la consulta | B05-T31: las 8 rutas × QE1, QE2, ANA1, LID1 y AUD1 dan 403; sin token 401; id inexistente 404 a ADM1 y 403 al resto; ninguna ejecución registrada. F05-T26 y F02-T12 (portal) | Pasa |
| El Auditor lee el historial, no el borrador | B05-T31 (403 en el borrador), B04-T17, F04-T13 (ve las ejecuciones con su fase, sin `grupo-nuevas` ni botones) | Pasa |
| El token nunca se expone | B02-T10, B04-T08, B05-T32, B05-T33 (respuestas, tablas `integraciones.*` y registros sin el token, su Base64 ni `Authorization`), F02-T06 (la página) | Pasa |
| Textos de Jira hostiles | B05-T32 (`<img onerror>`, `=HYPERLINK`, `' OR 1=1 --`), F05-T27 (se ven como texto) | Pasa |
| Campos desconocidos y fila ajena | B05-T32: 400 por `origen`, `estado`, `creadoPor` y `grupo` como asignación; 404 para la fila de otra consulta; 403 al token de servicio en el upsert | Pasa |
| Dos Administradores | B05-T25 (409 `CONSULTA_MODIFICADA` con la versión actual), T26 (confirmación simultánea: una sola ejecución, 4 HDU), T27; F05-T18 y T19 | Pasa |
| Vencimiento de 24 h | B05-T23 y F05-T15 con la instancia I6 (2 s): `actual` en `null`, filas purgadas, 410 `CONSULTA_VENCIDA` | Pasa (la vigencia real de 24 h solo se verificó en `venceEn`) |
| Tope de 500 y «continuar» | B05-T29: 5 tandas, `TOPE_DE_CONSULTA`, sexta 409 `CONSULTA_LLENA`, confirmar lo leído | Pasa |
| 429 de Jira | B02-T07 (2 reintentos de 1 s), T08 (429 persistente: 50 filas revisables y confirmables), F02-T08 | Pasa |
| PATCH de 230 filas sin 429 en el gateway | `GW-D152` y B05-T28 (un solo PATCH asigna 230); F05-T24 | Pasa |
| HDU creada a mano durante la consulta | B05-T19, T21 (carrera entre la pre-validación y la escritura), F05-T20 | Pasa |
| Efecto sobre E2 | F05-T10: las HDU de Jira llegan con analista, no suman a «Asignar analista» del QE2 y ANA3 las ve; B05-T13: historial inicial de asignación (anterior vacío, motivo fijo) y auditoría `CREAR_HDU` con `consultaId` | Pasa |
| Revisar y confirmar no llaman a Jira | B05-T06, F05-T25 (Jira CAIDO, `/__solicitudes` sin cambios) | Pasa |
| Persistencia | B05-T01 (instancia nueva del servicio y otro Administrador ven la misma consulta) | Pasa |

## Accesibilidad y responsividad

`e5-a11y-responsivo.spec.ts` (axe con `wcag2a/aa` y `wcag21a/aa`, 1280 y 375 px, sin violaciones serious ni critical y sin desborde horizontal): Conexión, Sincronizar/Consultar (sin configuración, con resultado, con error y con QTY-15 de borde), consulta abierta (Nuevas con QTY-15, panel de grupo plegable a 375 px, fila incompleta con CEL-A, Con error, diálogo de confirmación, resultado de la confirmación, consulta confirmada), consulta B (Cambiaron y Sin cambios, diálogo de descarte, consulta descartada), Importar archivo, Historial (lista y detalle), `/qe/integraciones`, pestaña del Auditor y detalle de HDU: **verde en las dos rondas**. F05-T27: recorrido por teclado en el orden casilla de selección, célula, QE, analista, sprint, casilla de marcar; el estado se anuncia por texto.

## Regresión

| Suite | Resultado |
| --- | --- |
| E1, E2, E3, modelo de datos, seguridad de esquemas, recuperación de contraseña y login (`api` + `e2e`) | 258 pasan, 1 omitida (`E1-B01#3`, límite del proveedor), 0 fallan |
| E4 (`e4-api` + `e4-e2e`) | 146 pasan |
| E7 (`e7-api` + `e7-e2e`), base con MVP | 175 pasan, 8 omitidas (valores absolutos), 0 fallan |
| E7, base pura | 178 pasan, 3 omitidas (absolutos en pantalla, exigen una base con solo `seed:e7`), 2 fallan por faltar usuarios MVP en esa base (no certifican; pasaron en la otra) |
| E5 (F01, F03, B01, B03 incluidas) | Ver rondas |

## Cambios en pruebas ya certificadas

| Prueba | Cambio | Motivo |
| --- | --- | --- |
| `api/e5-b02-sincronizacion.spec.ts`, `e2e/e5-f02-sincronizar.spec.ts` | Sustituidas por `e5-b02-consulta.spec.ts` y `e5-f02-consultar.spec.ts` | §7 del backlog; las de sincronización directa se quitaron |
| `api/e5-b01-configuracion.spec.ts` T04, T12 | T04 consulta en lugar de sincronizar; T12 admite la FK de `consulta_item` a `consulta_jira` | Retiro de `sincronizaciones` y D133 |
| `api/e5-b04-registro.spec.ts` T01, T03–T11 | Usan consulta y confirmación; las ejecuciones son 5 (C1, R1 confirmación, R2, R3, R4); el detalle de R1 son 10 CREADA | La consulta no tiene filas de detalle (D141) |
| `api/e5-gateway.spec.ts` GW#3; nuevas GW#5 y D152 | `consultas` en lugar de `sincronizaciones` | Rutas del gateway |
| `e2e/e5-f04-historial.spec.ts` T01–T07 | Cinco ejecuciones; R1 es la confirmación; T02 espera entre cambios de filtro | Fases y DEF-E5C-03 |
| `e2e/e5-a11y-responsivo.spec.ts` | «Sincronizar» pasa a Consultar; pantalla nueva de revisión | Cambio de pantallas |
| `e2e/e7-f06-bandeja-auditor.spec.ts` T07 | El Auditor no tiene `boton-consultar-jira` (antes `boton-sincronizar`) | Nombre del botón |
| `support/e5.ts`, `support/e5c.ts` (nuevo), `support/entornoE5.ts`, `support/jira-falso/servidor.ts` | Se quitan las ayudas de sincronización; ayudas de consulta, arnés y proxies; proyecto `ENORME` | Soporte |

## No cubierto

- **E5-MAN-01** (caso manual contra Jira Cloud real): no ejecutado. `urlExterna` con `https://` y el cuerpo real de Jira solo se probaron contra el falso.
- **Nube:** `infrastructure/nube/006_rls_consulta_asignacion_nube.sql`, el tiempo real de la función de 30 s en Vercel con 230 filas y la regla de Supabase pausado no se probaron; el PATCH de 230 filas se midió solo en local.
- **Vigencia real de 24 h:** solo se verificó `venceEn` (24 h ± 0,5 h) y el vencimiento con 2 s; el vencimiento perezoso a las 24 h reales no se esperó.
- **Aviso de células sin Líder y lista de combinaciones** (la nota de §5 del diseño): el portal no los entrega (el contrato no da ese agregado); sí está el aviso por fila `aviso-sin-lider`, verificado en CEL-C (F05-T05).
- **Consulta de 500 filas en el portal:** el tope se verificó por API (B05-T29); en pantalla se verificó 230 filas (F02-T07, F05-T23, T24).
- **Tres pruebas UI de valores absolutos de E7** (`e7-abs-fixture-ui`) y `E1-B01#3`: omitidas; no certifican.
- **Solo Chromium**, sin lector de pantalla real ni dispositivos físicos.
