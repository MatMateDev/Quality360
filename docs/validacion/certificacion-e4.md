# Certificación E4 · Impedimentos y riesgos (Quality360)

Dueño: `q360-qa`. Alcance: 8 HDU (E4-F01..F04, E4-B01..B04), 24 escenarios y 89 casos del backlog (`docs/backlog/e4-impedimentos-y-riesgos.md`), más la regresión de E1, E2, E3, modelo de datos, login y E7. Código bajo prueba: commit `fa4205d` (rama `feature/e1-e2-quality360`). No se modificó código de producción.

## Veredicto

**8 de 8 HDU CERTIFICADAS** (con observaciones, ninguna bloqueante). Los 24 escenarios tienen al menos una prueba ejecutada y en verde; los 89 casos del backlog están cubiertos (T10 de F01 y T14 de B02 son la regresión de la suite completa, ver abajo). Defectos abiertos: 2, ambos de baja severidad y del agente `q360-integraciones` (semilla), sin efecto sobre el producto.

## Entorno y cómo se obtuvieron los valores absolutos

- Configuración regenerada con `node infrastructure/local/preparar-entorno.mjs --forzar` (IMPEDIMENTOS_URL, CERTIFICACIONES_URL, PERMITIR_CARGA_SEMILLA en los `.env` locales). Prisma regenerado en los tres servicios y `packages/auth-nest` compilado antes de levantar.
- Base local vaciada con `supabase:stop --no-backup` (autorizado). **No se usó `npm run local` tal cual** porque siempre carga la semilla MVP al final y esta altera los conteos: se levantó con un script equivalente que replica `infrastructure/local/levantar.mjs` (Supabase, esquemas, buckets, entorno, build, migraciones, procesos) sin el paso de semilla. La migración de Impedimentos se aplicó en ese arranque.
- **Base pura**: solo `npm run seed:e7` y `npm run seed:e4` (11 usuarios, 8 HDU, 5 impedimentos, 1 riesgo fijado). Sobre ella corrieron los valores absolutos de E7 (`e7-abs`, **8 de 8 pasan** con los cambios de E4) y todo E4: `tests/full-run-e4-pura.log` → **146 pasan** (135 pruebas E4 + 11 de preparación de sesiones), 0 fallas, 0 omitidas.
- **Base completa**: `npm run seed` (semilla MVP) encima, y la suite completa de todas las épicas (rondas siguientes). Los contadores del fixture E4 que dependen de toda la base (`hduRiesgoAlto` del Administrador: 2 en la base pura, 72-75 con la semilla MVP) solo se afirman en valor exacto sobre la base pura; en la completa se exige un entero.
- Pilas alternativas (`tests/support/entornoE4.ts`, mismo patrón de E7): Impedimentos caído para el gateway y para Organización, Certificaciones caída solo para Impedimentos, e Impedimentos con `Q360_FECHA_REFERENCIA`. El stack principal nunca se toca.
- El fixture se recarga entre casos con `reiniciarFixtureE4()`: `TRUNCATE` de `impedimentos.*` con `supabase_admin` (el dueño de las tablas, `svc_impedimentos`, no puede borrar, D65) y `seed:e4`.

## Rondas

| Ronda | Qué se corrió | Resultado |
| --- | --- | --- |
| 1 | Suite completa sobre la base con semilla MVP (`full-run-e4-ronda1.log`) | 521 pasan, 10 fallan, 9 omitidas, 35 sin correr (cascada de bloques seriales). 5 fallas del modelo de datos y 2 de E7 por cambios **documentados** de E4 (tabla siguiente), 3 por la propia prueba E4 (base no pura, candidatos extra de la semilla MVP, paginación) |
| 2 | Primero lo que falló, luego sus archivos completos | Pruebas corregidas (ver cambios). Una prueba E4 resultó sensible a la hora del día (I1 «hace 2 horas» cuenta 1 día de calendario si se corre entre 00:00 y 02:00, D74): ahora compara con los días de calendario reales |
| 3 | Suite completa (`full-run-e4-ronda3.log`): 431 pasan, 9 omitidas, **0 fallas fuera de E4**; las 11 fallas de E4 fueron `seed:e4` rechazando la recarga (defecto DEF-E4-01) | Se corrigió la recarga en la prueba (copia en memoria del script con paginación) y se reejecutó E4 completo tres veces (`ronda3c`, `3d`, `3e`): las fallas residuales fueron 429 del gateway en lecturas/escrituras sin reintento propio; con un reintento por prueba E4, **`ronda3e`: 145 pasan + 1 «flaky»** (E4-F03 T03, pasó en el reintento; sin él, pasa en solitario 3 de 3 veces) |

Resultado acumulado de la suite completa: E1, E2, E3, modelo de datos, login, E7 y E4, sin regresiones. Omitidas (9, ninguna certifica): 8 valores absolutos de E7 (válidos solo sobre la base pura; allí pasaron, ver arriba) y `E1-B01#3` (límite de intentos del proveedor, omitida por diseño desde antes).

## Cambios en pruebas ya certificadas (solo por cambios documentados)

| Prueba | Cambio | Motivo |
| --- | --- | --- |
| E1-F02#3 (`e1-f02-portal-qe.spec.ts`) | El arreglo del menú del QE suma «Impedimentos» antes de «Perfil» | Sección 6 del backlog E4, D71 |
| `modelo-datos-estructura` / `modeloDatos.ts` | `riesgo_hdu` pasa a tabla de extensión; `impedimento.id_certificacion` admite NULL (relación entre servicios con `obligatorio: false`); los INSERT de prueba incluyen las columnas nuevas (`id_historia`, autor, `tipo_accion`, actor) y valores válidos del catálogo | D58, D65, D88 |
| `modelo-datos-aislamiento` | `accion_impedimento` es de solo inserción: se espera `UPDATE` denegado a `svc_impedimentos` (`SOLO_INSERCION`) | D65 (`REVOKE UPDATE, DELETE`) |
| E7-F04 T05 (`e7-f04-bandeja-lider.spec.ts`) | Ya no busca «—» en toda la tabla (la columna aditiva «Bloqueo» lo usa para «sin bloqueo»); exige «No disponible» en Avance y Certificado de las 6 filas | Sección 6 (columnas nuevas al final), D87 |
| E7-F05 T01 (`e7-f05-bandeja-admin.spec.ts`) | La aserción «el cuerpo no contiene "impedimento"» (D36 de E7) se sustituye por «los pendientes de configuración no los mencionan» y «existe el contador de impedimentos» | D87 supera D36 para la bandeja del Administrador |
| D81 (`celda-accion-*`) | Sin cambios: E7-F03 ya usa `toContainText`; la nueva prueba verifica la insignia dentro de la celda y fuera del botón | D81 |
| `getByText` del nombre del QE en el detalle | Revisado: E2-F04 usa `exact: true` dentro de un contenedor acotado y pasa | — |
| `support/contrato.ts` | Carga también `impedimentos.v1.yaml` | Contrato nuevo |
| `playwright.config.ts` | Proyectos `e4-api` y `e4-e2e` (dependen de `e7-setup`; un reintento por prueba por el límite de tasa del gateway); `api` y `e2e` ignoran `e4-*` | Nueva épica |

E2-B02 y E3 (cierre): los casos existentes cierran HDU con checklist incompleto (409 `CHECKLIST_INCOMPLETO`, que se evalúa antes que los impedimentos, D77) y el flujo completo de cierre sin impedimentos lo recorre `modelo-datos-flujo`; ambos pasan sin cambios.

## Resultado por escenario

Todas las pruebas llevan el ID del escenario en el nombre. Evidencia (registros locales, no versionados por .gitignore): `tests/full-run-e4-ronda3e.log` (E4 completo con la base completa), `tests/full-run-e4-pura.log` (base pura) y las rondas anteriores en `tests/`.

| Escenario | Pruebas (casos del backlog) | Resultado real |
| --- | --- | --- |
| E4-F01#1 | e2e T01, T02, T06, T07, T08, T09 (+ bandeja del Analista, bloques con Impedimentos caído) | Pasa. Registro con autor, responsable y «HDU bloqueada»; bandeja «Bloqueada»/filtro; QE sin analista; solo lectura de LID1/AUD1/ADM1 y denegado a QE1/ANA1 ajenos; HDU cerrada sin botón; sección «No disponible» con Impedimentos detenido |
| E4-F01#2 | e2e T03, T04 | Pasa. Mensajes por campo; el contador limita a 1.000; no se crea nada |
| E4-F01#3 | e2e T05 + API de contadores absolutos de las 10 bandejas | Pasa. QE2: abiertos 2 y nuevos 2, insignia «Nuevo»; «Requiere mi acción» no gana filas (D71) |
| E4-F02#1 | e2e T01, T02, T03, T04, T08, T09, T10; API T01, T02, T09 | Pasa. Orden riesgo y días, resueltos, «Solo lectura»; 8 combinaciones de acceso denegado sin ninguna petición con 200; Certificaciones caída (ver observaciones) |
| E4-F02#2 | e2e T05 | Pasa. «Tu equipo no tiene bloqueos» con contadores 0 y sin error |
| E4-F02#3 | e2e T06, T07; API de filtros | Pasa. Célula (con URL), tipo y búsqueda; «No hay impedimentos con esos filtros» distinto del vacío |
| E4-F03#1 | e2e T01, T02, T07, T08, T09 (+ 409 de estado desactualizado) | Pasa. Resolver, validación «Indica la acción tomada», seguimiento; botones solo para el QE responsable |
| E4-F03#2 | e2e T03, T04, T05, T11 (+ bandeja del Líder y del Administrador) | Pasa. Escalamiento y destinos válidos (solo Líderes y Administradores), `escalados-a-mi`, lista del Administrador, sin botones de gestión |
| E4-F03#3 | e2e T06, T10 | Pasa. Reabrir con historial REGISTRAR→RESOLVER→REABRIR; tras reasignar el QE (D54) el anterior queda de solo lectura y el nuevo ve «Reabrir» |
| E4-F04#1 | e2e T01, T02, T09 | Pasa. Fijar con justificación, errores (nivel, vacía, 501), origen «Fijado por»; Analista sin panel ni llamada a `/riesgo`; QE ajeno denegado; LID1/AUD1/ADM1 sin botones |
| E4-F04#2 | e2e T03, T04, T05, T08, T10 | Pasa. Factores con valores, «Usar el sugerido», aviso «La sugerencia actual es Alto», cálculo parcial y «No disponible» (nunca Bajo) |
| E4-F04#3 | e2e T06, T07; API de «Riesgo por HDU» | Pasa. Orden H1,H5,H6,H2,H8 y filtros por nivel; QE2 vacío con Alto; 503 con filtro y Certificaciones caída |
| E4-B01#1 | API T01, T02, T03, T05, T06, T10 | Pasa. 201 conforme a contrato, ciclo activo, validaciones, CHECK y sin FK entre esquemas; no se crea ciclo |
| E4-B01#2 | API T04 | Pasa. `bloqueada`/`abiertos` en la evaluación interna y el listado |
| E4-B01#3 | API T07, T08, T09 | Pasa. 403 idénticos, 401, 409 `HDU_CERRADA`; sin filas |
| E4-B02#1 | API T01, T02, T06, T07, T08, T09, T10 | Pasa. Transiciones, escalamiento con detalle, reabrir; 20 combinaciones 403 + 401; concurrencia 200/409 con una sola acción |
| E4-B02#2 | API T03, T04, T12, T12b, T13; e2e de cierre | Pasa. Desbloqueo; 409 `HDU_BLOQUEADA` con total y hasta 20 (22 sembrados); 503 con el bloque indisponible; error en pantalla; insignia D81 |
| E4-B02#3 | API T05, T11 | Pasa. 409 `TRANSICION_INVALIDA` con el mensaje exigido; `HDU_CERRADA` |
| E4-B03#1 | API T01, T02, T05, T06 | Pasa. Factores, valores y umbrales exactos |
| E4-B03#2 | API T03, T04, T11, T12 | Pasa. Sprint vencido/medio/alto; fecha de referencia (hoy+3, −1, −2); cerrada sin sugerencia; Certificaciones caída |
| E4-B03#3 | API T07, T08, T09, T10 | Pasa. Fijar contra la sugerencia, `sugeridoAlFijar`, `cambio:false`, validaciones, permisos, HDU cerrada |
| E4-B04#1 | API T01, T02, T08 | Pasa. Entradas con actor, anterior y nuevo; los intentos rechazados no dejan entradas |
| E4-B04#2 | API T03, T04, T05, T09, T10, T11; e2e T12 | Pasa. Orden, rango, filtros, 16 denegados + 401, CSV con BOM y `;` (6 y 10 líneas, `X-Q360-Filas`), registro `EXPORTAR` (`IMPEDIMENTOS` y `GESTION_IMPEDIMENTOS`), pestaña del Auditor con 5 y 9 filas y sin escritura |
| E4-B04#3 | API T06, T07 | Pasa. Historial íntegro tras el cierre; `UPDATE`/`DELETE` fallan con 42501 y las rutas de edición no existen |

Complementos fuera de escenario: contrato (`ImpedimentoDetalle`, `ImpedimentosHdu`, `RiesgoHdu`, `PaginaImpedimentos`, `PaginaRiesgoHdu`, `HistorialGestionHdu`, `PaginaAuditorImpedimentos`, `ErrorHduBloqueada`, `ErrorImpedimentosNoVerificables`, `ErrorTransicionImpedimento`, `BandejaAnalista/Qe/Lider/Admin/Auditor` con `impedimentos`), permisos del servidor (D75), candidatos, catálogo, bandejas con Impedimentos caído (200 con bloques `indisponible`, nunca 0, `soloBloqueadas` → `hdu` indisponible).

## Accesibilidad (D84)

`tests/e2e/e4-a11y-responsivo.spec.ts`, axe (WCAG 2 A/AA y 2.1 A/AA) a 1280 y 375 px contra el stack real, **0 violaciones serious/critical y 0 desbordes a 375 px** (8 de 8 pruebas): detalle como Analista, QE responsable, QE supervisor, Líder, Administrador y Auditor (con «HDU bloqueada»); `error-hdu-bloqueada`; diálogos de registrar, resolver, escalar, seguimiento, reabrir y fijar riesgo, abiertos y con errores de validación; `/qe/impedimentos` y `/qe/impedimentos/riesgo` con datos, vacío, filtros sin coincidencias, error e indisponible; las 5 bandejas con sus bloques; `/auditor/impedimentos` en sus dos vistas; Certificaciones caída (parcial y «No disponible»).

## Dictamen por HDU

| HDU | Dictamen | Fundamento |
| --- | --- | --- |
| E4-F01 | CERTIFICADA | 3/3 escenarios; T01 a T09 propios y T10 como regresión de E2-F04, E3-F01 y E7-F02 (verde en la suite completa) |
| E4-F02 | CERTIFICADA | 3/3; observación sobre T08 (abajo) |
| E4-F03 | CERTIFICADA | 3/3; una prueba intermitente por 429 del gateway (T03), verde en el reintento y en solitario |
| E4-F04 | CERTIFICADA | 3/3; axe en el panel y los diálogos |
| E4-B01 | CERTIFICADA | 3/3 con contrato |
| E4-B02 | CERTIFICADA | 3/3; cierre bloqueado 409 con total y 503 verificados |
| E4-B03 | CERTIFICADA | 3/3; valores de factores exactos y fecha de referencia |
| E4-B04 | CERTIFICADA | 3/3; solo inserción comprobada en la base y por API; exportación auditada |

Resumen: **CERTIFICADA 8, OBSERVADA 0, NO VERIFICABLE 0.** Las pruebas omitidas (9) no certifican nada; ninguna pertenece a E4.

## Totales

- E4: **135 pruebas** (76 de API y 59 e2e, incluidas 8 de accesibilidad) pasan sobre la base pura (146 con las 11 de sesiones) y **135 de 135** sobre la completa en la ronda 3e (134 al primer intento y 1 en el reintento).
- Suite completa de las demás épicas en la ronda 3: **431 pasan, 0 fallan, 9 omitidas**.

## Defectos abiertos, por agente dueño

| ID | Agente | Severidad | Reproducción | Efecto |
| --- | --- | --- | --- | --- |
| DEF-E4-01 | q360-integraciones | Baja (semilla) | `infrastructure/seed/e4/cargar.mjs` lista las HDU con `GET /v1/hdu?tamanoPagina=100` y solo mira la primera página. Con más de 100 HDU en la base compartida (137 tras las suites de E1 a E7) falla con «Faltan las HDU H1…H8 del fixture E7: corre antes npm run seed:e7» aunque existan. Reproducir: correr cualquier suite completa y luego `npm run seed:e4` | El fixture no se puede recargar en una base de uso. Solución: recorrer todas las páginas. La prueba usa una copia en memoria con ese único cambio |
| DEF-E4-02 | q360-integraciones | Muy baja | `datos.json` siembra I4 como «Criterio de aceptacion ambiguo» (sin tilde); el backlog dice «aceptación» | Solo cosmético; las pruebas usan el texto sembrado |

No hay defectos abiertos para `q360-backend`, `q360-seguridad-gateway` ni `q360-frontend`.

## Observaciones (no son defectos)

1. **E4-F02-T08 contra D68/D90.** El backlog dice que con Certificaciones caída «el riesgo de I2 dice No disponible». El servicio informa ALTO con `calculoParcial: true` (I2 ya alcanza ALTO por `IMPEDIMENTO_ANTIGUO`), que es lo que fijan D90 y E4-B03-T12 para H1. «No disponible» aparece cuando los factores evaluables no llegan a ALTO (I1 en H3), con el orden de respaldo por días informado. Se certificó con esa interpretación; conviene corregir el texto del caso.
2. **Impedimento inexistente.** Las operaciones de escritura responden 403 también a Administrador y Auditor (el rol sin permiso se rechaza antes de saber si existe); la lectura (`GET /v1/impedimentos/{id}`) responde 404 a ellos y 403 al resto, como pide D50/D89.
3. **Parámetro del listado de riesgo.** El filtro de bloqueadas es `soloBloqueadas` (contrato), no `bloqueada` como dice el backlog; la prueba usa el del contrato.
4. **Límite de tasa del gateway (429).** Las lecturas y escrituras de la interfaz no reintentan; en corridas largas con muchos usuarios aparecen 429 aislados (2 de 4 corridas completas de E4). Se mitigó con reintentos en la prueba; es una propiedad del entorno de prueba, no de E4.
5. **Propagación de la relación tras reasignar el QE (D54).** En una corrida aislada, el QE nuevo tardó unos segundos en ver «Reabrir»; la prueba recarga hasta verlo. No se pudo reproducir de forma estable; no se abre defecto.
6. **Dependencia horaria del fixture.** «I1 hace 2 horas» da 1 día de calendario entre 00:00 y 02:00 (D74). Las pruebas lo calculan.
7. Texto del comentario de `REGISTRAR`: «Registro del impedimento.» (con punto); el backlog lo cita sin punto.

## No cubierto

- Despliegue en la nube (D91, Vercel y RLS de `infrastructure/nube/004`): no se probó; solo el stack local.
- Límite de 50.000 filas de las exportaciones de E4 (E7 ya cubre el mecanismo con otro recurso).
- Cierre exitoso de una HDU con impedimentos que acaban de resolverse: no se ejecutó sobre H8 para no cerrarla (el backlog lo pide así); se verificó la consulta interna de cierre en cero y el flujo de cierre sin impedimentos de `modelo-datos-flujo`.
- Filtros de fecha, actor y acción en la pestaña del Auditor por pantalla (cubiertos por API).
- Navegación completa por teclado de los diálogos (axe corre sobre ellos abiertos; el cierre con Escape se ejerció en varias pruebas).
- `Q360_FECHA_REFERENCIA` ignorada con `NODE_ENV=production`: no verificado.
