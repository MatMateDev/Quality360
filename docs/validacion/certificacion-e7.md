# Certificación E7 · Bandejas por rol (Quality360)

Dueño: `q360-qa`. Alcance: 12 HDU (E7-F01..F07, E7-B01..B05), 36 escenarios, sobre el commit `43f6b67` (rama `feature/e1-e2-quality360`), más la regresión de E1, E2, E3, modelo de datos y login. Pruebas en `tests/` (Playwright 1.63, `@axe-core/playwright` 4.14, validación de contrato con `ajv` + `yaml` contra `contracts/*.yaml`).

## Veredicto

- **Regresión: sin regresiones de producto.** En la corrida completa final (429 pruebas) pasan todas las de E1, E2, E3, modelo de datos y login, con las reescrituras documentadas abajo.
- **E7: 1 HDU CERTIFICADA, 11 OBSERVADAS, 0 NO VERIFICABLE.** Casi todos los escenarios funcionales pasan; las pruebas que fallan reproducen defectos de producto (sección «Defectos»). La mayoría de las OBSERVADAS lo son por accesibilidad (axe) o por contrato, no por comportamiento.
- Corrida final (`tests/full-run-e7-ronda3b.log`, 24 min): **399 pasan, 28 fallan, 2 omitidas** de 429 (161 son pruebas E7). Después se hizo más robusta `E7-F06#1 T04` (pasa) y se agregó axe a `/admin/usuarios` (falla por los mismos defectos de accesibilidad que las bandejas).

## Entorno

Supabase local, Organización :3001, Certificaciones :3002, Impedimentos :3003, gateway :3000 y portal :5173 con `npm run local` (se reinició tras un cierre de Docker Desktop). Semilla MVP más fixture `npm run seed:e7` (HDU `E7-H1..E7-H8`; usuarios `adm1, qe1, qe2, ana1..ana4, lid1, lid2, aud1, inact1 @quality360.local`). Fuente caída: instancias secundarias (Organización :3101, Certificaciones :3202, gateway :3100, portal :5180) y un proxy que corta rutas de Organización; el stack principal nunca se toca (`tests/support/entornoE7.ts`). Reproducir: `cd tests && npx playwright test` (proyectos `e7-setup`, `e7-api`, `e7-e2e`).

### Limitación: base compartida
El fixture exacto de la sección 3 (10 usuarios activos, 8 HDU, LID1 5/1/1/1) solo se cumple sobre una base vacía (README de `seed/e7`). Esta base acumula semilla MVP y residuos de otras corridas, y el reinicio de datos fue denegado por el sistema de permisos, por lo que **no se verificaron los valores absolutos**. Se verificó así: (a) el subconjunto `E7-H*` coincide exactamente con el backlog (LID1 ve H1,H2,H3,H5,H6,H7; 5 abiertas, 1 cerrada, 1 sin analista, 1 certificado) y (b) cada contador global se contrasta con una consulta SQL independiente. Una limpieza previa (`e7-sesiones.ts`) desactiva usuarios `qa.*` residuales de correo único. **Para certificar los valores absolutos hay que repetir sobre base vacía + `seed:e7`.**

## Cambios a pruebas certificadas

| Prueba | Cambio | Motivo |
| --- | --- | --- |
| `e1-f02-portal-qe` [E1-F02#2] x2 | Afirma `acceso-denegado` en la URL pedida (`/admin/usuarios`, `/qa/hdu`), texto «No tienes acceso a esta sección», enlace «Ir a mi bandeja» y ninguna petición de datos, en vez de `toHaveURL(/qe$/)` | D41 (el escenario admite «acceso denegado o redirección») |
| [E1-F02#3] | Menú `Bandeja, Equipo, Historias supervisadas, Perfil` | D29 |
| `e1-f05-portal-qa` [E1-F05#3] x2 | Ídem D41 (`/qe`, `/admin/usuarios`) | D41 |
| [E1-F05#2] | Menú `Bandeja, Mis HDU, Perfil` | D29 |
| E1-F02#1, E1-F05#1, E1-F07#1 y 4 de `login-redireccion-rol` | El nombre se busca dentro del `banner` | La bandeja del Administrador repite nombres en «Últimos cambios» (modo estricto) |
| `modelo-datos-estructura` x2 y `support/modeloDatos.ts` | Tablas de extensión suman `celula_lider` y `hdu_historial_responsable` (+3 llaves foráneas); `organizacion.rol` tiene 5 filas | Migración E7 (D28, D30, D52, D54) |
| `e2-f04` [E2-F04#3] | El clic de cambio de estado reintenta ante 429 | Falló una vez en una corrida completa por límite de tasa; aislada pasaba |
| «Rol inválido» con LIDER_QA/AUDITOR | No existía ninguna (E1-B08 usa `SUPERADMIN_INEXISTENTE`); E7-B01 T03 usa `SUPERVISOR` | Sección 4 del backlog |

## Resultados por escenario (corrida final)

| Escenario | Casos con prueba | Resultado real |
| --- | --- | --- |
| E7-B01#1 | T01, T02, T02b | 3/3 pasan |
| E7-B01#2 | T03..T08 | 6/6 pasan |
| E7-B01#3 | T09, T10 | 2/2 pasan |
| E7-B02#1 | T01..T05 | 5/5 pasan |
| E7-B02#2 | T06, T07 | 2/2 pasan |
| E7-B02#3 | T08 (x2), T09 | 3/3 pasan |
| E7-B03#1 | T01..T08 | 8/8 pasan |
| E7-B03#2 | T09, T10, T11 | 3/3 pasan |
| E7-B03#3 | T12, T13, T14 | 3/3 pasan |
| E7-B04#1 | T01, T01b, T02..T05, T12 | 6/7; FALLA T01b (DEF-02) |
| E7-B04#2 | T06, T07, T08 | 3/3 pasan |
| E7-B04#3 | T09, T09b, T10, T11 | 4/4 pasan |
| E7-B05#1 | T01, T04, T05 (+ UI) | 3/3 pasan |
| E7-B05#2 | T02 (+ UI) | 1/1 pasa |
| E7-B05#3 | T03 | 1/1 pasa |
| E7-F01#1 | T01 x5, T07, T07b, T08 | 7/8; FALLA T07 (DEF-03) |
| E7-F01#2 | T02 x2, T03 | 3/3 pasan |
| E7-F01#3 | T04, T04b, T05, T06 | 4/4 pasan |
| E7-F02#1 | T01, T02, T07 | 3/3 pasan |
| E7-F02#2 | T03, T04 | 2/2 pasan |
| E7-F02#3 | T05, T05b, T06 | 3/3 pasan |
| E7-F03#1 | T01, T02, T06c | 3/3 pasan |
| E7-F03#2 | T03, T04 | 2/2 pasan |
| E7-F03#3 | T05, T06, T06b | 3/3 pasan |
| E7-F04#1 | T01, T02, T03, T03b, T09 | 5/5 pasan |
| E7-F04#2 | T04, T05 | 2/2 pasan |
| E7-F04#3 | T06, T07, T07b, T08 | 4/4 pasan |
| E7-F05#1 | T01, T02, T02b | 3/3 pasan (T02b intermitente, DEF-10) |
| E7-F05#2 | T03, T04 | T04 pasa; **T03 omitida** (no certifica) |
| E7-F05#3 | T05, T05b, T05c, T06 | 3/4; FALLA T05c (DEF-08) |
| E7-F06#1 | T01, T02, T03, T03b, T04, T04b, T06c | 6/7; FALLA T04b (DEF-05) |
| E7-F06#2 | T05, T06, T06b | 2/3; FALLA T06b (DEF-04) |
| E7-F06#3 | T07, T08, T09 | 3/3 pasan |
| E7-F07#1 | T01, T02, T03 | 3/3 pasan |
| E7-F07#2 | T04, T05 | 2/2 pasan |
| E7-F07#3 | T06, T06b | 2/2 pasan |

Matrices que pasan: 5 roles x 4 portales ajenos por pantalla (20) y por API (20 x 403 con cuerpo idéntico); 14+14 mutaciones de Líder y Auditor con 403 y sin cambios; 28 consultas/exportaciones del Auditor negadas a otros roles; exportación CSV con BOM, separador `;` y registro en auditoría; límite 422; cambio de rol atómico con 409 estructurado; células del líder con historial; reasignación del QE responsable. Casos de regresión del backlog (F03-T07, F05-T07, F07-T07, B02-T10): cubiertos por la corrida completa de las HDU originales, que pasa.

## Accesibilidad y responsividad

- **375 px sin desborde horizontal: pasa** en las 5 bandejas, pestañas del Auditor, Usuarios y los estados sin células y sin HDU.
- **axe (WCAG 2 A/AA): FALLA en todas** con violaciones serious/critical: contraste 4.42:1 (`#687386` sobre `#f4f6f8`) en `.etiqueta` y descripción, y 4.33:1 en `badge-estado`; `aria-required-children` por `<caption tabindex="-1">` en `<table role="table">`; el detalle de HDU suma `aria-progressbar-name`. Pasan el acceso denegado y los objetivos táctiles de 44 px.

## Dictamen por HDU

| HDU | Dictamen | Fundamento |
| --- | --- | --- |
| E7-F01 | OBSERVADA | #2 y #3 pasan; #1 T07 falla (DEF-03); axe |
| E7-F02 | OBSERVADA | funcional 8/8; solo axe |
| E7-F03 | OBSERVADA | funcional 8/8; solo axe |
| E7-F04 | OBSERVADA | funcional 11/11; solo axe |
| E7-F05 | OBSERVADA | #2 T03 omitida (no verificable en esta base); T05c falla; axe |
| E7-F06 | OBSERVADA | T04b y T06b fallan; axe |
| E7-F07 | OBSERVADA | funcional 7/7; solo axe en `/admin/usuarios` |
| E7-B01 | **CERTIFICADA** | 11/11, incluido contrato |
| E7-B02 | OBSERVADA | funcional 10/10; contrato (DEF-01) |
| E7-B03 | OBSERVADA | funcional 14/14; contrato (DEF-01) |
| E7-B04 | OBSERVADA | T01b falla (DEF-02) |
| E7-B05 | OBSERVADA | funcional 5/5 y UI; contrato (DEF-01) |

Resumen: **CERTIFICADA 1, OBSERVADA 11, NO VERIFICABLE 0**.

## Defectos abiertos por agente dueño

**q360-frontend**
- DEF-03 (media-baja) E7-F01-T07: tras cambiar el rol, recargar deja «Acceso denegado» en la URL antigua (`/qa`) en vez de ir a `/qe`. Solo el 403 en sesión redirige (T07b pasa). Posible conflicto D41 vs regla de F01: confirmar con arquitecto.
- DEF-04 (media) Bitácora del Auditor: los filtros HDU y Actor se arman con lo ya cargado; `E7-H2` (con eventos) no se puede elegir (`#filtro-hdu`).
- DEF-05 (baja) Auditoría: «Células: … → sin células» y bitácora «evidencia: …» (valores anidados como «…»).
- DEF-06 (serious) Contraste insuficiente en todas las bandejas y Usuarios.
- DEF-07 (critical) `<caption tabindex="-1">` dentro de `role="table"` en todas las tablas; `.barra-progreso` sin nombre en el detalle.
- DEF-08 (baja) `/admin/usuarios?usuario=<id>` no resalta la fila si no está en la página 1 (el diálogo sí abre).
- DEF-10 (media, intermitente) «Pendientes de configuración» muestra 25 filas sin total ni paginación: con 32 pendientes se ocultaban «Líder sin células» y «Célula sin líder» (ronda 2 y ejecución parcial). T02b pasó en la corrida final: confirmar.

**q360-backend**
- DEF-01 (media-baja) Contrato: `sprint` devuelve `inicio` y `fin` no declarados (`additionalProperties: false`) en `GET /v1/hdu`, `/v1/bandeja/*` y `PUT /v1/hdu/{id}/qe-responsable`. Corregir la respuesta o el contrato (q360-arquitecto).
- DEF-02 (media) `GET /v1/auditor/bitacora` y su exportación responden 403 completo si la página incluye eventos de una HDU que Organización no conoce (42 HDU huérfanas en la base). Repro: `?pagina=10&tamanoPagina=25` como AUD1 → 403 (páginas 1-4 → 200).
- DEF-09 (baja) Desactivar un Líder conserva sus células vigentes: la célula cuenta como «con líder» y `celulasSinLider` baja a 0 (D51 pide solo usuarios activos).

**q360-integraciones**
- DEF-11 (baja) El fixture dice que E7-H7 tiene una evidencia en archivo; `seed:e7` solo crea enlaces y certificado. La capacidad se probó con una HDU propia.

## No cubierto
- Valores absolutos del fixture y [E7-F05#2] «todo en orden» (T03 omitida): requieren base vacía.
- Accesibilidad de diálogos abiertos y de la pestaña Bitácora; navegación por teclado.
- Rondas: 1 (parcial, dependencia mal configurada entre proyectos), 2 (completa) y 3 (completa; una primera pasada se invalidó porque mi limpieza desactivaba usuarios de correo fijo que usa E1-F10, ya corregido, y Docker se había cerrado).
