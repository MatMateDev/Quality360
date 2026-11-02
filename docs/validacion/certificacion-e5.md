# Certificación E5 · Integración con Jira Cloud (Quality360)

Dueño: `q360-qa`. Alcance: 8 HDU (E5-F01..F04, E5-B01..B04), 24 escenarios y los casos de `docs/backlog/e5-integracion-jira.md`, más la regresión de E1, E2, E3, modelo de datos, login, E7 y E4. Código bajo prueba: commit `2813869` (rama `feature/e1-e2-quality360`). No se modificó código de producción.

## Veredicto

**8 HDU CERTIFICADAS, 0 OBSERVADAS, 0 NO VERIFICABLES** (tras las re-verificaciones con `f9ba416` y `335a506`). Los 24 escenarios tienen prueba ejecutada; las 117 pruebas E5 pasan. DEF-E5-01 a DEF-E5-03 (portal) quedaron cerrados en las re-verificaciones; el detalle de cada ronda está más abajo. Pendiente del usuario: **E5-MAN-01** (caso manual contra un Jira real, no ejecutado).

| HDU | Dictamen | Fundamento |
| --- | --- | --- |
| E5-F01 | CERTIFICADA | 3/3 escenarios, T01–T10 verdes; re-verificado con `335a506`: Conexión sin desborde a 375 px (DEF-E5-03 cerrado) |
| E5-F02 | CERTIFICADA | Re-verificado con `f9ba416`: T03 y el resto de `e5-f02-sincronizar.spec.ts` verdes, y Sincronizar ya no desborda a 375 px |
| E5-F03 | CERTIFICADA | 3/3; T14 corrido con 250 filas, no 500 (ver observaciones) |
| E5-F04 | CERTIFICADA | 3/3; T01–T10 verdes; T11 verde |
| E5-B01 | CERTIFICADA | 3/3; token cifrado, ausente de respuestas, base y registros; 503 solo al cifrar/descifrar |
| E5-B02 | CERTIFICADA | 3/3; paginación, tope, 429, presupuesto, Organización caída |
| E5-B03 | CERTIFICADA | 3/3; upsert sin tocar estado/analista/QE/checklist/impedimentos/riesgo |
| E5-B04 | CERTIFICADA | 3/3; historial por rol, sin secretos, una ejecución a la vez, neutralización CSV en las 6 exportaciones |

Resumen: CERTIFICADA 8 · OBSERVADA 0 · NO VERIFICABLE 0. Defectos abiertos: 0.

## Entorno

- Base vaciada con `supabase:stop --no-backup`; configuración con `preparar-entorno.mjs --forzar` (llave de cifrado conservada), `packages/auth-nest` compilado, Prisma regenerado en los 4 servicios, `npm run local -- --build`. Fixture `seed:e7`, `seed:e4`, `seed:e5`. No se corrió `ws:test`.
- Base pura para los valores absolutos de E7: `npm run local` siempre carga la semilla MVP, así que se truncaron los datos de servicio y Auth y se recargó solo `seed:e7` + `seed:e4` + `seed:e5`; después se restauró la semilla MVP (`npm run seed`) para E1–E3.
- Jira simulado en `tests/support/jira-falso/` (:4010, lo arranca `globalSetup`): modos NORMAL, LIMITE, LIMITE_PAGINA_2, LENTO, RETARDO_1S, CAIDO, TOKEN_REVOCADO, SIN_PERMISO, RESPUESTA_INVALIDA; proyectos QTY (12), BIG (230), EXACTO (100), VACIO; `search/jql` con `nextPageToken`, ADF y `customfield_10020`. Extensiones de QA: `LIMITE_SIEMPRE` (429 persistente, necesario porque la prueba de conexión no usa `search/jql`) y `SIN_PERMISO` también niega `project/{clave}`. Archivos en `tests/fixtures/e5/`.
- Instancias del perfil de QA (`tests/support/entornoE5.ts`): I2 :3104 sin llave, I3 :3105 otra llave, I4 :3106 presupuesto 2.500 ms, I5 :3107 `NODE_ENV=production`, :3108/:3109 con Organización tras un proxy que se corta o con límite alto, y gateways :3111–:3113 con `INTEGRACIONES_URL`/`IMPEDIMENTOS_URL` ausentes. Pila de «Integraciones caída»: gateway :3100 y portal :5180.
- Las pruebas de API de E5 van a un segundo gateway del mismo build (:3110) con el límite de escrituras alzado (el real, :3000, limita a 30/min); `E5-GW#1` y el portal usan el gateway real. Comando: `cd tests && GATEWAY_URL=http://localhost:3110 npx playwright test --project=e5-api --project=e5-e2e`.
- Limpieza (sección 9): al final de cada archivo, `limpiarE5()` borra con el dueño de la base las HDU de origen no manual (y `E5M-*`) con sus dependientes y vacía `integraciones.*`; B04-T15 borra además los usuarios y la auditoría que crea.

## Rondas

| Ronda | Qué se corrió | Resultado |
| --- | --- | --- |
| 1 | E5 completa sobre la base con semilla MVP | 124 pasan, 4 fallan: B02-T13 (mi comprobación de registros contaba la palabra «Authorization» del mensaje del gateway «sin cabecera Authorization»), F03-T10 (429 del gateway real en el portal; se agregó 1 reintento al proyecto `e5-e2e`, como en E4) y 2 defectos de producto |
| 2 | Corregido lo de pruebas; base pura: valores absolutos E7, E5, E4, E7 tras E5 y E1/E2/E3/modelo/login | E7 absolutos: 19/19 (8 absolutos verdes). E4: 11 fallas iniciales porque `seed:e4` ya recorre todas las páginas (DEF-E4-01 corregido) y mi parche dejó de aplicar; ajustado, 146/146. E5: 126 pasan (11 de setup), 2 fallan (producto). E7 tras E5: 178 pasan, 3 omitidas, 2 fallan por faltar los usuarios de la semilla MVP en la base pura (y un fallo de login en `e7-setup`); con la semilla, 13/13 verdes. Resto: 256 pasan, 1 omitida (`E1-B01#3`, límite del proveedor) |
| 3 | E5 completa y luego E7 completa sobre la base con MVP | E5: igual que la ronda 2 (115/117, sin flakies). E7: 175 pasan, 8 omitidas (absolutos, solo válidos en base pura; sus resultados están en la ronda 2) |

## Cambios en pruebas ya certificadas (solo por cambios documentados)

| Prueba | Cambio | Motivo |
| --- | --- | --- |
| `e1-f02-portal-qe.spec.ts` (E1-F02#3) | El menú del QE incluye «Integraciones» tras «Impedimentos» | D107, sección 9 |
| `e7-f06-bandeja-auditor.spec.ts` (E7-F06#3 T07) | También recorre `/auditor/integraciones` y exige 0 `button[type=submit]`, sin sincronizar ni selector de archivo | 6.ª pestaña del Auditor |
| `support/contrato.ts` | Carga `integraciones.v1.yaml` | Contrato nuevo |
| `support/e4.ts` (`recargarE4`) | Ejecuta `seed:e4` tal cual si ya no existe el texto a parchar | DEF-E4-01 corregido en la semilla (cdb28be) |
| `support/env.ts`, `support/db.ts`, `playwright.config.ts` | `databaseUrlIntegraciones`, `conIntegraciones`, `globalSetup` del Jira falso, proyectos `e5-api` y `e5-e2e` (excluidos de `api`/`e2e`) | Infraestructura de E5 |
| Sin cambio necesario | Menú del Administrador (E1-F07/F08 no afirman lista exacta); ninguna prueba afirmaba 501 en `/v1/integraciones/*`; detalle de HDU (E2-F04 y E3-F01 pasan); D129 (E4 con Impedimentos caído pasa; `E5-GW#4` lo cubre) | |

## Defectos por agente

| ID | Agente dueño | Severidad | Reproducción |
| --- | --- | --- | --- |
| DEF-E5-01 (CERRADO en `f9ba416`) | `q360-frontend` | Baja | Sincronizar `QTY`; en el Jira falso cambiar `QTY-2` a prioridad Highest; sincronizar de nuevo. «HDU actualizadas» muestra `Prioridad: MEDIA → CRITICA` (códigos del enum) en vez de `Media → Crítica` (E5-F02-T03). Prueba: `e5-f02-sincronizar.spec.ts` T03 |
| DEF-E5-02 (CERRADO en `f9ba416`) | `q360-frontend` | Media | Sincronizar `QTY` a 375 px de ancho: `QTY-8` tiene un título de 200 caracteres sin espacios y la lista «HDU creadas» desborda (scrollWidth 1991 > 375); falta `overflow-wrap` en `.fila-resultado`. Prueba: `e5-a11y-responsivo.spec.ts` (primer caso) |
| DEF-E5-03 (CERRADO en `335a506`) | `q360-frontend` | Baja | Abrir `/admin/integraciones` a 375 px: scrollWidth 380 > 375 (antes de `f9ba416` no ocurría; sospecha del `min-width:0`/pestañas «Importar archivo» e «Historial» que sobresalen). Prueba: `e5-a11y-responsivo.spec.ts` primer caso |

Sin defectos para `q360-backend`, `q360-integraciones`, `q360-seguridad-gateway` ni `q360-infra`.

## Accesibilidad

axe (wcag2a/aa, 21a/aa) a 1280 y 375 px contra el stack real sobre Conexión (sin configurar y configurada), Sincronizar (vacío, resultado, error), Importar (vacío, vista previa, error, resultado), Historial (lista y detalle), `/qe/integraciones`, pestaña del Auditor y detalle de HDU con y sin descripción: **0 violaciones serious/critical**. Único hallazgo: DEF-E5-02.

## Observaciones y lo no cubierto

- **E5-MAN-01 (manual contra Jira real): no ejecutado; queda para el usuario.** Tampoco se verificó contra Atlassian el nombre del campo Sprint ni el orden `key > "X-n"` (supuestos de D96).
- E5-F03-T14: con 500 filas e I4 (2,5 s) el avance se detiene cerca de las 350 filas en este entorno: re-verificar lo ya importado cuesta ~85 ms por lote de 25 (1,65 s para 500 filas) y D114 no inicia llamadas con menos de 1 s de presupuesto. Se certificó con 250 filas, que converge; con el presupuesto normal (8 s) 500 filas se importan en 5,7 s.
- E5-F01-T02: el `PUT` hace además `GET field` (3 peticiones, todas con autenticación válida).
- E5-F01-T08: la lista de cambios dice «API token (cambiado)» en vez de «token cambiado».
- E5-B04-T15: el importador recorta tabulación y retorno de carro iniciales, así que no pueden llegar por la aplicación; para ejercitar la exportación se fijaron esos títulos con el dueño de la base y se verificó el prefijo de comilla simple.
- E5-B01-T11: el registro del gateway nombra «sin cabecera Authorization Bearer» (sin valor); se exige que no haya token, Base64, `Basic <valor>` ni `Authorization` con valor. Se revisan los registros de `npm run local` y de los gateways; la salida de las instancias extra se revisó en memoria en los casos que las usan.
- Una INCOMPLETA por tope no trae la sugerencia `CONTINUAR`; la continuación viene en `GET /v1/integraciones/estado` (`continuar`).
- Simulaciones HTTP en el portal: F02-T09 y F03-T14 redirigen la petición a instancias del perfil de QA con `page.route`. Las caídas de Integraciones usan el gateway con `INTEGRACIONES_URL` a un puerto muerto.
- Fuera de alcance local: despliegue en Vercel (D110/D128) y migraciones en la nube.

## Resultado por prueba (ronda 3; evidencia: salida de Playwright de `e5-api` y `e5-e2e`)

Las regresiones E5-F01-T11, E5-F02-T12, E5-F03-T13, E5-F04-T11 y E5-B04-T14 se ejecutaron en la suite completa tras la limpieza: E1-F02/F07/F08, E2, E3 y E7 (175 verdes en la ronda 3) y E1/E2/E3/modelo/login (256 verdes en la ronda 2).

| ID | Prueba | Proyecto | Resultado | Duración |
| --- | --- | --- | --- | --- |
| E5-B01#1 T01 | T01: el token se guarda cifrado (AES-256-GCM) y nunca vuelve en claro | e5-api | pasa | 0.9 s |
| E5-B01#1 T02 | T02: GET no trae token ni cifrado; dos guardados del mismo token producen cifrado e IV distintos | e5-api | pasa | 0.3 s |
| E5-B01#2 T05 | T05: probar sin guardar hace exactamente myself y project/QTY con autenticación válida y no cambia la configuración | e5-api | pasa | 0.1 s |
| E5-B01#2 T06 | T06 (negativo): cada falla de Jira se informa con 200 y ok:false con su código fijo, sin credenciales | e5-api | pasa | 5.3 s |
| E5-B01#3 T08 | T08 (negativo): QE1, QE2, ANA1, LID1 y AUD1 reciben 403 ACCESO_DENEGADO idéntico en PUT, GET y probar; sin token 401; la configuración no cambia | e5-api | pasa | 0.6 s |
| E5-B01#1 T09 | T09 (negativo): validaciones de formato y de destino (400 VALIDACION con campo, 422 CATALOGO_INVALIDO y QE_INVALIDO); el último caso válido usa los tipos por defecto | e5-api | pasa | 0.3 s |
| E5-B01#1 T10 | T10: tres eventos de configuración con actor y fecha; tokenCambiado solo en el cambio de token; ningún evento trae el token | e5-api | pasa | 0.2 s |
| E5-B01#1 T11 | T11: ni la salida de los servicios ni sus instancias adicionales contienen el token, Authorization, Basic ni el correo codificado | e5-api | pasa | 0.0 s |
| E5-B01#3 T12 | T12: con svc_integraciones no hay llaves foráneas a otro esquema, otro esquema es ilegible y evento_configuracion es de solo inserción | e5-api | pasa | 0.0 s |
| E5-B01#1 T03 | T03 (negativo): sin INTEGRACIONES_LLAVE_CIFRADO el PUT da 503 LLAVE_CIFRADO_NO_DISPONIBLE, no guarda ni consulta a Jira; /health y las lecturas siguen | e5-api | pasa | 1.2 s |
| E5-B01#1 T04 | T04 (negativo): con otra llave el token no se descifra: 409 TOKEN_NO_DESCIFRABLE en sincronizar y probar, sin llamar a Jira; con la llave A vuelve a funcionar | e5-api | pasa | 1.3 s |
| E5-B01#2 T07 | T07 (negativo): el sitio solo puede ser https://<subdominio>.atlassian.net; el host de prueba se acepta en la instancia de pruebas y se rechaza en producción (I5) | e5-api | pasa | 1.3 s |
| E5-B02#1 T01 | T01: la primera sincronización de QTY lee 11, crea 10 con 1 error y la consulta usa solo el proyecto y los tipos configurados | e5-api | pasa | 0.3 s |
| E5-B02#1 T02 | T02: el mapeo de prioridad, sprint y truncados de QTY-3, 4, 5, 6, 8, 9, 10 y 12 y sus advertencias | e5-api | pasa | 0.7 s |
| E5-B02#1 T03 | T03: la descripción ADF se convierte a texto plano (títulos, viñetas, mención, enlace; nodo desconocido ignorado) | e5-api | pasa | 0.3 s |
| E5-B02#1 T04 | T04 (negativo): QTY-11 sin título es una fila con error y no aborta; el Bug QTY-7 no se lee | e5-api | pasa | 0.3 s |
| E5-B02#2 T05 | T05: BIG (230) en 3 ejecuciones con continuarDesde: 100, 100 y 30 sin duplicados y paginación de a 50 con nextPageToken | e5-api | pasa | 2.7 s |
| E5-B02#2 T06 | T06: EXACTO (100) no inventa una continuación y VACIO (0) termina exitosa con todo en 0 | e5-api | pasa | 1.3 s |
| E5-B02#3 T07 | T07: con 429 en las 2 primeras búsquedas se reintenta 2 veces con espera de 1 s y se registran los eventos | e5-api | pasa | 2.3 s |
| E5-B02#3 T08 | T08 (negativo): 429 persistente en la página 2 deja INCOMPLETA con lo procesado y al continuar termina sin duplicados | e5-api | pasa | 4.7 s |
| E5-B02#1 T09 | T09 (negativo): con Jira LENTO la sincronización es FALLIDA por JIRA_TIEMPO_AGOTADO en menos de 4 s, sin HDU y registrada | e5-api | pasa | 3.2 s |
| E5-B02#3 T10 | T10 (negativo): TOKEN_REVOCADO, SIN_PERMISO, RESPUESTA_INVALIDA, CAIDO y sitio cerrado dejan FALLIDA con el código y el mensaje fijos, sin repetir el token | e5-api | pasa | 0.3 s |
| E5-B02#1 T11 | T11 (negativo): QE1, QE2, ANA1, LID1 y AUD1 reciben 403; sin token 401; sin configuración 409 JIRA_NO_CONFIGURADO; no se registran ejecuciones ni se llama a Jira | e5-api | pasa | 0.2 s |
| E5-B02#2 T12 | T12: con presupuesto de 2.500 ms y Jira a 1 s por página, BIG termina INCOMPLETA por PRESUPUESTO_DE_TIEMPO en menos de 3,5 s con lo procesado registrado | e5-api | pasa | 2.9 s |
| E5-B02#1 T13 | T13 (negativo): con Organización caída antes de empezar da 503 SERVICIO_NO_DISPONIBLE sin ejecución ni llamadas a Jira; si cae tras el primer lote queda INCOMPLETA/FALLID | e5-api | pasa | 2.9 s |
| E5-B03#1 T01 | T01: la vista previa de historias-validas.csv simula 4 creaciones sin escribir, sin ejecución y sin auditoría | e5-api | pasa | 0.2 s |
| E5-B03#1 T02 | T02: reglas de fila: código inválido, título de 201, descripción de 1.001 y tabla de prioridades | e5-api | pasa | 0.4 s |
| E5-B03#1 T03 | T03 (negativo): errores de estructura del archivo con su código y estado; ninguno crea HDU | e5-api | pasa | 0.6 s |
| E5-B03#2 T04 | T04: actualizar solo título y prioridad, vacío no borra, y la auditoría guarda antes y después | e5-api | pasa | 0.3 s |
| E5-B03#2 T05 | T05: una HDU en trabajo conserva estado, analista, QE, célula, sprint, checklist, impedimentos y riesgo; solo cambian título y prioridad | e5-api | pasa | 1.0 s |
| E5-B03#2 T06 | T06: importar dos veces el mismo archivo no duplica: la 2.ª deja 4 omitidas SIN_CAMBIOS y no suma auditoría | e5-api | pasa | 0.3 s |
| E5-B03#2 T07 | T07: el código se compara sin distinguir mayúsculas; arc-9 duplicado en el archivo y alta manual duplicada | e5-api | pasa | 0.4 s |
| E5-B03#2 T08 | T08: una HDU manual se omite salvo que se pida vincular (entonces pasa a CSV); una cerrada nunca se modifica | e5-api | pasa | 0.4 s |
| E5-B03#3 T09 | T09: modo normal importa las válidas e informa cada error; modo estricto no importa nada; estricto sin errores importa todo | e5-api | pasa | 0.5 s |
| E5-B03#3 T10 | T10: si una HDU se crea a mano entre la vista previa y la confirmación, esa fila se omite y las demás se crean completas | e5-api | pasa | 0.4 s |
| E5-B03#1 T11 | T11 (negativo): QE1, ANA1, LID1 y AUD1 reciben 403 en vista previa e importación; sin token 401; no hay HDU ni ejecuciones | e5-api | pasa | 0.3 s |
| E5-B03#1 T12 | T12 (negativo): con el QE por defecto desactivado y una fila con INACT1, esas filas dan QE_INVALIDO y no hay 5xx | e5-api | pasa | 0.2 s |
| E5-B03#3 T13 | T13 (negativo): el upsert interno de Organización exige un Administrador: QE1 403, servicio 403, sin token 401, 26 filas 400 y 25 válidas 200 | e5-api | pasa | 0.3 s |
| E5-B03#2 T14 | T14: historias-validas.json crea 3 HDU con origen JSON y acepta qeCorreo y qe_correo | e5-api | pasa | 0.4 s |
| E5-B04#1 T01 | T01: la ejecución de QTY registra origen, actor, fechas, duración, resultado, contadores y proyecto | e5-api | pasa | 0.2 s |
| E5-B04#1 T02 | T02: la importación de un CSV guarda nombre, tamaño y huella SHA-256, y nunca el contenido | e5-api | pasa | 0.3 s |
| E5-B04#1 T03 | T03: el detalle de QTY trae 11 filas (10 CREADA con idHistoria y QTY-11 ERROR TITULO_VACIO) con la referencia de Jira | e5-api | pasa | 0.3 s |
| E5-B04#1 T04 | T04: en R1–R4 la suma de contadores es igual a leídas y la fallida cierra con código, fecha y los CHECK de la base | e5-api | pasa | 0.5 s |
| E5-B04#2 T05 | T05: el historial se ordena por fecha, filtra por origen y resultado, pagina con tope 100 y acota por desde y hasta | e5-api | pasa | 0.6 s |
| E5-B04#2 T06 | T06: el detalle respeta el ámbito del QE: QE2 ve sus HDU, QE1 solo las filas con error (sin título) y el contador de ocultas, AUD1 todo | e5-api | pasa | 0.6 s |
| E5-B04#2 T07 | T07 (negativo): LID1 y ANA1 reciben 403 en todo; un id inexistente da 404 a ADM1 y AUD1 y 403 a QE1 y LID1; sin token 401 | e5-api | pasa | 0.7 s |
| E5-B04#3 T08 | T08: con Jira en TOKEN_REVOCADO el token, su Base64 y Authorization/Basic no aparecen en la respuesta, en ninguna tabla ni en el registro del servicio | e5-api | pasa | 0.2 s |
| E5-B04#1 T12 | T12: la auditoría de HDU registra 4 CREAR_HDU (origen CSV) y 1 ACTUALIZAR_HDU con antes y después, sin cambiar la vista «auditoría de usuarios» | e5-api | pasa | 0.3 s |
| E5-B04#1 T13 | T13 (negativo): un archivo sin la columna título responde 422 COLUMNAS_FALTANTES con ejecucionId, deja una ejecución FALLIDA con huella y la vista previa no registra nada | e5-api | pasa | 0.2 s |
| E5-B04#3 T15 | T15: toda exportación CSV neutraliza las celdas de texto que empiezan con = + - @ tab o CR (HDU, bitácora, certificados, impedimentos, gestión y auditoría de usuarios) | e5-api | pasa | 1.6 s |
| E5-B04#3 T09 | T09: con Organización cortada el error es el mensaje fijo, sin URL internas, trazas ni cabeceras, en la respuesta y en la tabla | e5-api | pasa | 1.3 s |
| E5-B04#1 T10 | T10: con svc_integraciones no se puede borrar, modificar una ejecución cerrada ni un detalle, ni violar los CHECK; no hay llaves foráneas a otro esquema | e5-api | pasa | 0.2 s |
| E5-B04#1 T11 | T11: dos sincronizaciones simultáneas dan 200 y 409 INTEGRACION_EN_CURSO con una sola ejecución; una EN_CURSO de hace 6 minutos queda INTERRUMPIDA | e5-api | pasa | 6.6 s |
| E5-GW#1 | el gateway real ya no responde 501 en /v1/integraciones/*: 200 para el Administrador, 401 sin token, 403 para el Líder | e5-api | pasa | 0.1 s |
| E5-GW#2 | /v1/interno/* no se publica en el gateway | e5-api | pasa | 0.0 s |
| E5-GW#3 | con INTEGRACIONES_URL ausente el gateway arranca y solo /v1/integraciones/* responde 503 SERVICIO_NO_DISPONIBLE; el resto sigue | e5-api | pasa | 1.2 s |
| E5-GW#3 | con INTEGRACIONES_URL inválida el gateway arranca y solo /v1/integraciones/* responde 503 SERVICIO_NO_DISPONIBLE; el resto sigue | e5-api | pasa | 1.2 s |
| E5-GW#4 | con IMPEDIMENTOS_URL ausente (D129) el gateway arranca y solo las rutas de Impedimentos responden 503; Integraciones y HDU siguen | e5-api | pasa | 1.2 s |
| E5-A11Y | Administrador · Conexión (sin configurar y configurada) y Sincronizar (sin configurar, con resultado y con error) | e5-e2e | FALLA | 12.7 s |
| E5-A11Y | Administrador · Importar archivo (vacío, vista previa, error de archivo y resultado) e Historial (lista y detalle) | e5-e2e | pasa | 18.4 s |
| E5-A11Y | QE (/qe/integraciones con detalle y filas ocultas) y Auditor (pestaña Integraciones) | e5-e2e | pasa | 12.8 s |
| E5-A11Y | detalle de HDU con origen y descripción de Jira (QE responsable) y vacío de descripción de una HDU manual | e5-e2e | pasa | 5.9 s |
| E5-F01#3 T09 | T09 (API): los cuatro roles reciben 403 en GET configuracion (refuerza el negativo de interfaz) | e5-e2e | pasa | 0.3 s |
| E5-F01#1 T01 | T01: ADM1 completa la conexión y «Probar y guardar»: conexión exitosa, estado Conectado, token «termina en AB12» y el campo vuelve vacío | e5-e2e | pasa | 0.9 s |
| E5-F01#1 T02 | T02: tras guardar, el Jira falso recibió una petición a myself y una al proyecto QTY, todas con autenticación válida | e5-e2e | pasa | 0.9 s |
| E5-F01#2 T03 | T03 (negativo): con un token incorrecto aparece JIRA_CREDENCIAL_INVALIDA sin el token en la página ni en la red, y la configuración anterior se conserva | e5-e2e | pasa | 0.8 s |
| E5-F01#2 T04 | T04 (negativo): sitio inexistente, proyecto inexistente y SIN_PERMISO muestran sus códigos y mensajes y no guardan nada | e5-e2e | pasa | 1.0 s |
| E5-F01#2 T05 | T05 (negativo): los campos inválidos muestran un mensaje bajo cada uno y no llega ninguna petición a Jira | e5-e2e | pasa | 0.8 s |
| E5-F01#3 T06 | T06: al reabrir la pantalla el token nunca aparece: campo vacío de tipo contraseña, estado «termina en AB12», sin token en la respuesta ni en el almacenamiento del navega | e5-e2e | pasa | 1.0 s |
| E5-F01#3 T07 | T07: cambiar solo el sprint de respaldo con el token vacío conserva el token: el falso recibe la prueba con el mismo token | e5-e2e | pasa | 0.8 s |
| E5-F01#1 T08 | T08: cambiar el token por q360-token-nuevo-CD34 muestra «termina en CD34» y un evento «token cambiado» sin su valor | e5-e2e | pasa | 0.8 s |
| E5-F01#1 T10 | T10 (negativo): con Integraciones detenida la pestaña Conexión dice «No disponible» con «Reintentar» y la bandeja del Administrador carga normal | e5-e2e | pasa | 5.4 s |
| E5-F01#1 T09 | T09 (negativo): QE1 abre /admin/integraciones y recibe acceso denegado con «Ir a mi bandeja»; ninguna petición de configuración devuelve 200 | e5-e2e | pasa | 0.8 s |
| E5-F01#1 T09 | T09 (negativo): ANA1 abre /admin/integraciones y recibe acceso denegado con «Ir a mi bandeja»; ninguna petición de configuración devuelve 200 | e5-e2e | pasa | 0.6 s |
| E5-F01#1 T09 | T09 (negativo): LID1 abre /admin/integraciones y recibe acceso denegado con «Ir a mi bandeja»; ninguna petición de configuración devuelve 200 | e5-e2e | pasa | 0.6 s |
| E5-F01#1 T09 | T09 (negativo): AUD1 abre /admin/integraciones y recibe acceso denegado con «Ir a mi bandeja»; ninguna petición de configuración devuelve 200 | e5-e2e | pasa | 0.5 s |
| E5-F02#1 T01 | T01: «Sincronizar con Jira» lee 11, crea 10, 0 actualizadas, 0 omitidas, 1 con error y 5 advertencias; resultado «Con errores» y QTY-11 con «El título es obligatorio» | e5-e2e | pasa | 0.9 s |
| E5-F02#1 T02 | T02: las 10 HDU nuevas suman al total, aparecen en «Asignar analista» de QE2 y el detalle de QTY-1 muestra origen Jira, prioridad Alta, sprint E5 Sprint 2, su descripción | e5-e2e | pasa | 2.7 s |
| E5-F02#1 T03 | T03: tras cambiar QTY-2 y QTY-1 en Jira, la segunda sincronización actualiza 2, omite 8 y muestra «Título: Recuperar contraseña → Recuperar clave» y «Prioridad: Media → C | e5-e2e | FALLA | 11.6 s |
| E5-F02#2 T04 | T04: sin QTY-11, dos sincronizaciones seguidas: la 1.ª crea 10 y es «Exitosa»; la 2.ª muestra «Sin cambios» con 10 omitidas y 0 creadas | e5-e2e | pasa | 1.8 s |
| E5-F02#3 T05 | T05 (negativo): con Jira CAIDO aparece JIRA_NO_DISPONIBLE con «Importar un archivo», la ejecución queda Fallida en el Historial y no se creó ninguna HDU | e5-e2e | pasa | 1.1 s |
| E5-F02#3 T06 | T06 (negativo): con TOKEN_REVOCADO aparece JIRA_CREDENCIAL_INVALIDA con enlace a Conexión y el token no aparece en la página aunque el falso lo repita | e5-e2e | pasa | 0.7 s |
| E5-F02#1 T07 | T07: BIG (230) en tres ejecuciones con «Continuar»: 100 con aviso y botón, otras 100, y 30 «Exitosa» sin botón; 230 HDU BIG | e5-e2e | pasa | 4.3 s |
| E5-F02#1 T08 | T08: con el falso en LIMITE la sincronización termina «Con errores» con 10 creadas y el aviso «Jira pidió esperar 2 veces; se reintentó» | e5-e2e | pasa | 3.7 s |
| E5-F02#1 T09 | T09 (negativo): con dos pestañas el botón queda «Sincronizando…» y la segunda recibe «Ya hay una sincronización en curso»; una sola ejecución en el historial | e5-e2e | pasa | 7.9 s |
| E5-F02#1 T10 | T10 (negativo): sin configuración, la pestaña Sincronizar muestra el estado vacío con el enlace a Conexión y sin botón «Sincronizar» | e5-e2e | pasa | 0.6 s |
| E5-F02#1 T11 | T11 (negativo): QE1 recibe acceso denegado en /admin/integraciones y no ve «Sincronizar» en su propio portal | e5-e2e | pasa | 0.7 s |
| E5-F02#1 T11 | T11 (negativo): ANA1 recibe acceso denegado en /admin/integraciones y no ve «Sincronizar» en su propio portal | e5-e2e | pasa | 0.5 s |
| E5-F02#1 T11 | T11 (negativo): LID1 recibe acceso denegado en /admin/integraciones y no ve «Sincronizar» en su propio portal | e5-e2e | pasa | 0.5 s |
| E5-F02#1 T11 | T11 (negativo): AUD1 recibe acceso denegado en /admin/integraciones y no ve «Sincronizar» en su propio portal | e5-e2e | pasa | 0.8 s |
| E5-F03#1 T01 | T01: historias-validas.csv: vista previa Crear 4 y, al importar, 4 creadas «Exitosa»; ARC-3 con prioridad Baja y título «Consulta, con coma» | e5-e2e | pasa | 1.1 s |
| E5-F03#1 T02 | T02: historias-validas.json: Crear 3 y las HDU ARC-J1 a ARC-J3 existen con origen JSON | e5-e2e | pasa | 0.9 s |
| E5-F03#1 T03 | T03: el CSV con «;», BOM y comillas da la misma vista previa que historias-validas.csv | e5-e2e | pasa | 0.8 s |
| E5-F03#2 T04 | T04 (negativo): sin la columna título se informa COLUMNAS_FALTANTES «Faltan las columnas: titulo», no hay «Importar» y no se crea nada | e5-e2e | pasa | 0.7 s |
| E5-F03#2 T05 | T05 (negativo): archivo vacío, .xlsx, JSON «{» y CSV con comillas sin cerrar muestran su código y no ofrecen importar | e5-e2e | pasa | 0.8 s |
| E5-F03#2 T06 | T06 (negativo): un CSV de 501 filas y otro de 1,2 MB dan DEMASIADAS_FILAS («máximo 500») y ARCHIVO_MUY_GRANDE («máximo 1 MB») | e5-e2e | pasa | 0.8 s |
| E5-F03#3 T07 | T07: historias-con-errores.csv: vista previa Crear 2 y Con error 7 con el motivo de cada una; al importar 2 creadas y 7 con error «Con errores» | e5-e2e | pasa | 0.9 s |
| E5-F03#3 T08 | T08: con el modo estricto el resultado es «Fallida» por MODO_ESTRICTO, sin creadas y con 7 con error; ARC-10 no existe y la ejecución queda en el historial | e5-e2e | pasa | 1.0 s |
| E5-F03#3 T09 | T09: sobre historias-validas ya importado, historias-actualizacion.csv: Crear 1 (ARC-5), Actualizar 1 (ARC-1), Omitir 2 (ARC-2 «Sin cambios»; E7-H1 «Ya existe una HDU cre | e5-e2e | pasa | 1.0 s |
| E5-F03#3 T10 | T10: con «Vincular HDU creadas a mano» E7-H1 se actualiza (título y prioridad del archivo), su origen pasa a CSV y su estado y avance no cambian | e5-e2e | pasa | 1.1 s |
| E5-F03#1 T11 | T11: «Cancelar» tras la vista previa no deja HDU ARC-* ni ejecuciones nuevas | e5-e2e | pasa | 0.8 s |
| E5-F03#1 T14 | T14: con presupuesto de 2,5 s y una Organización lenta, 250 filas (el backlog dice 500; ver nota) se importan repitiendo «Importar el mismo archivo»: sin duplicados y la  | e5-e2e | pasa | 8.3 s |
| E5-F03#1 T12 | T12 (negativo): QE1 recibe acceso denegado en /admin/integraciones/importar y no tiene «selector-archivo» en su portal | e5-e2e | pasa | 0.8 s |
| E5-F03#1 T12 | T12 (negativo): ANA1 recibe acceso denegado en /admin/integraciones/importar y no tiene «selector-archivo» en su portal | e5-e2e | pasa | 0.6 s |
| E5-F03#1 T12 | T12 (negativo): LID1 recibe acceso denegado en /admin/integraciones/importar y no tiene «selector-archivo» en su portal | e5-e2e | pasa | 0.5 s |
| E5-F03#1 T12 | T12 (negativo): AUD1 recibe acceso denegado en /admin/integraciones/importar y no tiene «selector-archivo» en su portal | e5-e2e | pasa | 0.8 s |
| E5-F04#1 T01 | T01: «Última ejecución» es R4 (Jira, Fallida, ADM1, 0 leídas) y «Última completada» es R3 (CSV, Con errores, 2 creadas, 7 con error) | e5-e2e | pasa | 1.2 s |
| E5-F04#2 T02 | T02: la lista trae R4, R3, R2, R1; filtra por origen CSV y por resultado Fallida, ordena ascendente y conserva los filtros en la URL | e5-e2e | pasa | 1.8 s |
| E5-F04#3 T03 | T03: el detalle de R3 trae 9 filas (2 creadas y 7 con error); con «Solo filas con error» quedan 7 con sus motivos y sin tokens ni contenido de archivo | e5-e2e | pasa | 1.2 s |
| E5-F04#3 T04 | T04: el detalle de R1 trae 11 filas (10 creadas con 5 advertencias visibles y QTY-11 con TITULO_VACIO) y la referencia de Jira como texto | e5-e2e | pasa | 1.1 s |
| E5-F04#2 T09 | T09: sin ejecuciones el Historial muestra «Aún no se ha sincronizado ni importado nada» y ningún error | e5-e2e | pasa | 0.7 s |
| E5-F04#2 T05 | T05: QE2 ve las 4 ejecuciones con sus contadores y el detalle de R2 y R1 con las filas de sus HDU y la fila con error, sin ningún botón de escritura | e5-e2e | pasa | 1.6 s |
| E5-F04#3 T06 | T06: QE1 ve las 4 ejecuciones; en R1 0 filas de HDU, «10 filas de HDU fuera de tu ámbito» y la fila con error de QTY-11; en R3 solo las 7 filas con error | e5-e2e | pasa | 1.7 s |
| E5-F04#1 T10 | T10 (negativo): con Integraciones detenida /qe/integraciones dice «No disponible» con «Reintentar» y el resto del portal del QE carga | e5-e2e | pasa | 5.2 s |
| E5-F04#1 T07 | T07: AUD1 ve en la pestaña «Integraciones» lo mismo que ADM1 (4 ejecuciones y los detalles completos) y ninguna pestaña tiene acciones de escritura | e5-e2e | pasa | 2.6 s |
| E5-F04#1 T08 | T08 (negativo): LID1 recibe acceso denegado en /qe/integraciones y /admin/integraciones y el listado responde 403 | e5-e2e | pasa | 0.8 s |
| E5-F04#1 T08 | T08 (negativo): ANA1 recibe acceso denegado en /qe/integraciones y /admin/integraciones y el listado responde 403 | e5-e2e | pasa | 0.8 s |

## Re-verificación (commit f9ba416, hash de pruebas: ver git log)

`e5-f02-sincronizar`, `e5-a11y-responsivo`, `e5-f01-conexion` y `e5-b02-sincronizacion` (humo): 55 pasan y 1 falla (a11y, solo DEF-E5-03). axe sigue sin violaciones serious/critical.

## Re-verificación 2 (commit 335a506)

`e5-a11y-responsivo`, `e5-f01-conexion` y `e5-f02-sincronizar`: 43 pasan, 0 fallan. Pendiente del usuario: E5-MAN-01.
