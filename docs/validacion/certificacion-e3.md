# Certificación E3 · Quality360 (Ola 3)

Dueño: `q360-qa`. Gate aplicado: sección «Certificación» de
`docs/arquitectura/decisiones-mvp.md`, extendida a E3 (decisiones D15–D22,
«Corrida E3»). Alcance: 8 HDU (E3-F01–F04, E3-B01–B04), 24 escenarios, sobre
`services/certificaciones` con los ajustes de Organización, el gateway y el
portal (commit `4e04e83`). Además: verificación de que E1 (32 HDU, 96
escenarios) y E2 no tuvieron regresiones, ejecutando la suite completa.

## Entorno verificado

- Supabase local (`http://127.0.0.1:54321`, DB `127.0.0.1:54322`, Storage con
  los buckets privados `evidencias` y `certificados`), gateway
  `http://localhost:3000`, Organización `:3001`, Certificaciones `:3002`,
  portal `http://localhost:5173` — todo ya levantado por el orquestador antes
  de esta corrida, no reiniciado por `q360-qa`.
- Semilla `infrastructure/seed/mvp/` cargada. Ninguna prueba de esta ronda
  modifica usuarios o HDU de la semilla: cada prueba crea su propia HDU con
  Carla (QE) como responsable y le asigna a Ana (analista de su equipo
  vigente), por API (`tests/support/checklist.ts#crearHduAsignadaAAna`).
- Pruebas en `tests/` (Playwright 1.63): proyecto `setup` (login real por UI),
  proyecto `e2e` (escenarios F contra el portal real, incluida la subida real
  de un archivo con `setInputFiles`, la descarga del certificado por el
  evento `download` del navegador, y la verificación pública del folio en
  `/verificar/:folio`) y proyecto `api` (escenarios B contra el gateway real,
  con `request`).
- Comando para reproducir: `cd tests && npx playwright test` (stack arriba,
  `npx playwright install chromium` la primera vez).

## Interpretaciones ya decididas (arquitecto)

- **D11 + D19 (Corrida E3):** con Certificaciones respondiendo de verdad, una
  HDU con el checklist completo y los 10 entregables aprobados **sí** puede
  llegar a `CERRADA`. Esta corrida no fuerza a ninguna HDU propia hasta ese
  punto (los escenarios E3 verifican hasta la generación del certificado, que
  deja 9/10; ningún escenario de E2 vuelve a intentar el cierre completo), pero
  el entorno compartido ya contenía una HDU de otra sesión de trabajo
  (`HDU-HUMO-830455`, asignada a Ana) efectivamente `CERRADA` — ver «Nota de
  método» más abajo, porque cambió la interpretación de `E2-F03#2`.
- **E3-B03#2 (verificación pública):** se verifica primero por API
  (`GET /v1/certificados/{folio}/verificacion`, sin sesión, D21) en
  `tests/api/e3-b03-certificado.spec.ts`, y además de punta a punta desde el
  portal público `/verificar/:folio` dentro de `tests/e2e/e3-f04-certificado.spec.ts`
  (`[E3-F04#1]`, tras generar el certificado), cumpliendo la consigna de
  cubrir la verificación pública del folio también por UI.

## Efectos de E3 sobre E1 y E2 (actualización de pruebas existentes)

Instrucción de la Ola 3: actualizar las pruebas de E2 que cambian por E3 sin
debilitar lo que ya verificaban.

- **`[E2-B02#3]`** (`tests/api/e2-b02-transiciones-estado.spec.ts`):
  antes verificaba que el cierre se rechazara con `CHECKLIST_NO_DISPONIBLE`
  porque Certificaciones no respondía (interpretación de la Ola 2). Ahora
  Certificaciones responde de verdad, así que se reescribió para el caso que
  `docs/arquitectura/decisiones-mvp.md` («Efectos de E3 sobre E1 y E2») pide
  verificar: una HDU con el checklist **incompleto mostrando avance real**
  (se marcan y aprueban 2 de los 10 entregables) recibe 409
  `CHECKLIST_INCOMPLETO`, con `checklist.estado: "ok"` y
  `checklist.datos: {completados: 2, totalEntregables: 10,
  porcentajeCumplimiento: 20, completo: false}` — nunca `indisponible` ni un
  `0` fijo. Se conserva todo lo que ya verificaba el escenario (código de
  error, forma del bloque `checklist`, que la HDU no queda en un estado a
  medias) y se agrega la comprobación del avance real, más estricta que
  antes.
- **`[E2-F04#1]`** (`tests/e2e/e2-f04-detalle-hdu.spec.ts`): antes verificaba
  el testid `checklist-no-disponible` con el texto «No disponible». Ese
  testid ya no existe en el DOM para una HDU con Certificaciones disponible:
  se reemplazó por la aserción de que el bloque «Avance del checklist» del
  detalle de HDU (`apps/web/src/pages/hdu/HduDetailPage.tsx`) muestra el
  avance real de una HDU recién creada, `0% (0/10)` — un bloque `ok`
  explícito con datos reales, no la ausencia de datos. Se conserva el resto
  de las aserciones del escenario (código, responsables, sin analista).
- **`[E2-F03#2]`** (`tests/e2e/e2-f03-listado-hdu.spec.ts`), aunque no está en
  la lista explícita de la consigna, también cambió de significado por el
  mismo motivo y se corrigió — ver «Nota de método» y «Defectos» abajo.

## Nota de método: HDU_HUMO y el filtro «Cerrada» de E2-F03#2

`docs/arquitectura/decisiones-mvp.md` (D11, corrida E2) documentaba: «en esta
corrida ninguna HDU llega a `CERRADA`», y `[E2-F03#2]` usaba exactamente ese
hecho para probar «consulta sin resultados» (filtraba por Estado = Cerrada,
sin más, y esperaba la lista vacía para cualquier usuario). Con E3 habilitado
esa premisa ya no es válida en general: el propio entorno local compartido
tenía una HDU ajena a esta ronda (`HDU-HUMO-830455`, «Humo E3: pago con
tarjeta», célula Clientes, asignada a Ana, con QE responsable Carla) que otra
sesión de trabajo ya llevó a `CERRADA` de verdad, evidencia de que el cierre
con checklist completo funciona (D19). Esa HDU no es de la semilla ni de esta
suite: por la regla de aislamiento no se tocó ni se borró.

Se corrigió `[E2-F03#2]` para que ya no dependa de un supuesto global sobre
el entorno: en tiempo real, con la sesión de Ana, se calcula (por API) una
célula sin ninguna HDU `CERRADA` de Ana y se combina ese filtro de Célula con
el de Estado = Cerrada; la combinación queda garantizada vacía sin asumir
nada sobre datos ajenos y sin tocarlos. Esto es lo mismo que ya documentaba
`certificacion-e1-e2.md` para `E2-F03#3` (HDU propias en vez de asumir el
tamaño o contenido del catálogo compartido), aplicado ahora también a este
escenario. No es un defecto de producto: el cierre funcionando es lo
esperado de E3; el defecto era que la prueba de E2 asumía, sin verificarlo,
que nunca ocurriría en este entorno.

El límite de tasa de escritura del gateway (30/min, ver
`certificacion-e1-e2.md`, «Nota de método») también aplica aquí: los
escenarios de E3 que encadenan varias escrituras (marcar+aprobar 7 u 8
entregables, generar el certificado) tardan más cuando coinciden con otras
escrituras de la misma corrida (hasta ~1 min por prueba, ver la tabla de
evidencia); `tests/support/api.ts` ya reintenta ante 429 con `Retry-After`, y
esta ronda agrega el mismo patrón para la interfaz en
`tests/support/ui.ts` (`confirmarDialogoChecklistConReintento`,
`clicChecklistConReintento`, `descargaChecklistConReintento`), que observan
el resultado real en pantalla (diálogo cerrado, botón que desaparece, evento
de descarga) en vez de una URL de red puntual, porque una acción del
checklist puede encadenar más de una escritura (p. ej. `evidencias` +
`marcar` al subir un archivo).

## Ronda 1 · E3 completo, por archivo

Ejecución inicial por archivo (más rápida para localizar problemas):
`npx playwright test --project=api api/e3-b01-registro-entregables.spec.ts api/e3-b02-orden-aprobacion.spec.ts api/e3-b03-certificado.spec.ts api/e3-b04-bitacora.spec.ts`
y luego cada `e2e/e3-f0N-*.spec.ts` con `--project=e2e`.

- **Defecto propio de la prueba, corregido en la misma ronda (no llegó a la
  corrida completa):** `[E3-B04#1]` esperaba `valorAnterior: {estado:
  "PENDIENTE"}` en el evento `MARCAR` de un entregable recién creado. La
  bitácora (`services/certificaciones/src/infraestructura/checklist.repositorio.ts#fotoEntregable`)
  guarda `null` cuando no existe un registro previo del entregable en la base
  (antes del primer marcado no hay fila que fotografiar), lo cual es
  exactamente lo que permite el contrato
  (`EventoChecklist.valorAnterior: [object, 'null']`, `contracts/comun.v1.yaml`).
  Se corrigió la aserción a `toBeNull()`. No es un defecto de
  `q360-backend`: el comportamiento respeta el contrato.

Tras la corrección, los 24 escenarios de E3 pasan de forma aislada:

| Escenario | Prueba | Resultado | Evidencia |
| --- | --- | --- | --- |
| E3-B01#1 | `tests/api/e3-b01-registro-entregables.spec.ts` | Pasa | `marcar` responde `completado: {id: Ana, nombre, fecha}` y `evidencia: {tipo: ENLACE, url}`; el `GET /entregables` posterior confirma el mismo registro |
| E3-B01#2 | `tests/api/e3-b01-registro-entregables.spec.ts` | Pasa | Segundo `marcar` sobre el mismo entregable (ya `POR_APROBAR`) → 409 `ENTREGABLE_YA_REGISTRADO` |
| E3-B01#3 | `tests/api/e3-b01-registro-entregables.spec.ts` | Pasa | Carla (QE responsable) y Patricia (Administrador) intentan `marcar` → 403 `ACCESO_DENEGADO` en ambos casos (solo `ANALISTA_QA` puede) |
| E3-B02#1 | `tests/api/e3-b02-orden-aprobacion.spec.ts` | Pasa | Marcar `DASHBOARD` con `PLAN_PRUEBAS` pendiente → 409 `ORDEN_ENTREGABLES`, `detalles` incluye `campo: PLAN_PRUEBAS` |
| E3-B02#2 | `tests/api/e3-b02-orden-aprobacion.spec.ts` | Pasa | Ana (analista asignada) intenta `aprobar` su propio entregable → 403 `ACCESO_DENEGADO`; Carla (QE responsable) sí puede |
| E3-B02#3 | `tests/api/e3-b02-orden-aprobacion.spec.ts` | Pasa | `resumen.completados`/`porcentajeCumplimiento` en `0→0%`, `marcar` sin aprobar sigue en `0→0%` (D16: completo = aprobado), tras aprobar 1 y 2 entregables sube a `10%` y `20%` |
| E3-B03#1 | `tests/api/e3-b03-certificado.spec.ts` | Pasa | `POST /certificado` con 1–8 aprobados → 201, folio `Q360-\d{4}-[A-Z2-7]{8}`, huella SHA-256 de 64 hex; reintento → 409 `CERTIFICADO_EXISTENTE`; `GET` redescarga el mismo folio; entregable 9 (`CERTIFICADO`) queda `APROBADO` con `evidencia: {tipo: CERTIFICADO, folio}` |
| E3-B03#2 | `tests/api/e3-b03-certificado.spec.ts` | Pasa | `GET /v1/certificados/{folio}/verificacion` sin token → 200, `valido: true`, `hdu.codigo` coincide, misma huella; folio inventado → 404 |
| E3-B03#3 | `tests/api/e3-b03-certificado.spec.ts` | Pasa | Con 7 de los 8 exigidos aprobados (falta `APROBACION_UAT`) → 409 `ENTREGABLES_PENDIENTES`, `detalles` = exactamente `[{campo: APROBACION_UAT, ...}]` |
| E3-B04#1 | `tests/api/e3-b04-bitacora.spec.ts` | Pasa | Evento `MARCAR`: actor Ana (rol `ANALISTA_QA`), `valorNuevo.estado = POR_APROBAR`; evento `APROBAR`: actor Carla (rol `QE`), `valorAnterior.estado = POR_APROBAR` → `valorNuevo.estado = APROBADO` |
| E3-B04#2 | `tests/api/e3-b04-bitacora.spec.ts` | Pasa | Evento `DESMARCAR` conserva el motivo exacto enviado |
| E3-B04#3 | `tests/api/e3-b04-bitacora.spec.ts` | Pasa | Carla (QE responsable) obtiene la bitácora completa (≥3 eventos, incluye `MARCAR` y `APROBAR`); Francisco (sin relación con la HDU) → 403 |
| E3-F01#1 | `tests/e2e/e3-f01-checklist.spec.ts` | Pasa | 10 `entregable-{clave}` visibles en orden 1–10; `completado-PLAN_PRUEBAS` = «Completado por Ana Torres…», `aprobado-PLAN_PRUEBAS` = «Aprobado por Carla Fuentes…»; `completado-DASHBOARD` = «Sin completar» |
| E3-F01#2 | `tests/e2e/e3-f01-checklist.spec.ts` | Pasa | Con 2/10 aprobados: `checklist-porcentaje` = «20 %», `checklist-completados` = «2 de 10 aprobados» |
| E3-F01#3 | `tests/e2e/e3-f01-checklist.spec.ts` | Pasa | Patricia (Administrador, relación `ADMINISTRADOR`) ve `checklist-solo-lectura`; con `PLAN_PRUEBAS` en `POR_APROBAR`, no existen `boton-marcar-*` ni `boton-aprobar-PLAN_PRUEBAS` ni `boton-rechazar-PLAN_PRUEBAS` |
| E3-F02#1 | `tests/e2e/e3-f02-marcar-entregable.spec.ts` | Pasa | Ana sube un PDF real (`setInputFiles`, subida directa a Storage con la URL firmada) y marca `PLAN_PRUEBAS`: queda «Por aprobar», `completado-PLAN_PRUEBAS` con su nombre, `evidencia-PLAN_PRUEBAS` = «Descargar evidencia-prueba.pdf» |
| E3-F02#2 | `tests/e2e/e3-f02-marcar-entregable.spec.ts` | Pasa | Clic en «Marcar» de `DASHBOARD` sin `PLAN_PRUEBAS` aprobado: no abre diálogo (validación previa en el cliente), `aviso-DASHBOARD` = «Completa «Plan de pruebas»…» |
| E3-F02#3 | `tests/e2e/e3-f02-marcar-entregable.spec.ts` | Pasa | Desmarca `PLAN_PRUEBAS` con motivo → vuelve a «Pendiente»; la bitácora del checklist (`bitacora-item-0`) muestra «…desmarcó…» con el motivo exacto |
| E3-F03#1 | `tests/e2e/e3-f03-aprobaciones.spec.ts` | Pasa | Carla aprueba `PLAN_PRUEBAS` (`POR_APROBAR`) → «Aprobado», `aprobado-PLAN_PRUEBAS` = «Aprobado por Carla Fuentes…» |
| E3-F03#2 | `tests/e2e/e3-f03-aprobaciones.spec.ts` | Pasa | Carla rechaza con comentario → vuelve a «Pendiente», `observacion-PLAN_PRUEBAS` con el comentario; en una segunda sesión de navegador autenticada como Ana, la misma observación es visible en su propia vista |
| E3-F03#3 | `tests/e2e/e3-f03-aprobaciones.spec.ts` | Pasa | Desde «Accesos rápidos» del inicio QE (`enlace-aprobaciones-pendientes`) se llega a `/qe/aprobaciones`; 2 HDU con `PLAN_PRUEBAS` por aprobar aparecen agrupadas, cada una con su fila `bandeja-{codigo}-PLAN_PRUEBAS` |
| E3-F04#1 | `tests/e2e/e3-f04-certificado.spec.ts` | Pasa | Con 1–8 aprobados, «Generar certificado» habilitado; clic produce un evento `download` real con nombre `*.pdf`; `certificado-folio` muestra el folio y «emitido por»; `estado-CERTIFICADO` = «Aprobado»; navegar a `/verificar/{folio}` (público) muestra `verificacion-valida` con el código de la HDU |
| E3-F04#2 | `tests/e2e/e3-f04-certificado.spec.ts` | Pasa | Con 3/8 aprobados, `boton-generar-certificado` deshabilitado; `motivo-certificado-deshabilitado` = «Faltan entregables por aprobar: Aprobación de casos de prueba, …» |
| E3-F04#3 | `tests/e2e/e3-f04-certificado.spec.ts` | Pasa | Con el certificado ya generado por API, no aparece «Generar certificado»; «Descargar certificado» produce un evento `download` con nombre exactamente `{folio}.pdf`, igual al emitido |

### Dictamen HDU — E3 (Ronda 1, aislado)

| HDU | Dictamen | Motivo |
| --- | --- | --- |
| E3-F01 | CERTIFICADA | 3/3 escenarios pasan |
| E3-F02 | CERTIFICADA | 3/3 escenarios pasan (incluye subida real de archivo) |
| E3-F03 | CERTIFICADA | 3/3 escenarios pasan |
| E3-F04 | CERTIFICADA | 3/3 escenarios pasan (incluye descarga real por evento `download` y verificación pública) |
| E3-B01 | CERTIFICADA | 3/3 escenarios pasan |
| E3-B02 | CERTIFICADA | 3/3 escenarios pasan |
| E3-B03 | CERTIFICADA | 3/3 escenarios pasan |
| E3-B04 | CERTIFICADA | 3/3 escenarios pasan (tras corregir la aserción de la propia prueba, ver arriba) |

## Ronda 2 · Suite completa (E1 + E2 + E3), primera corrida

`cd tests && npx playwright test` (135 pruebas: 9 `setup` + 126 escenarios/
pruebas de seguridad) →

**134/135 pasaron** en 9.8 min. Única falla:

```
1) [e2e] › e2e\e2-f03-listado-hdu.spec.ts:32:3 › E2-F03 · Listado de HDU del Analista QA
   › [E2-F03#2] informa que no hay HDU cuando ningún registro cumple los filtros

Error: expect(locator).toContainText(expected) failed
Locator: getByTestId('bloque-mis-hdu-vacio')
Expected substring: "No hay historias de usuario con esos criterios."
Error: element(s) not found
```

Repetida en aislamiento (misma falla, no fue una interferencia puntual de la
corrida larga): causa raíz identificada y corregida, ver «Nota de método»
arriba. No es un defecto de `q360-frontend` ni de `q360-backend`: el filtro
«Estado = Cerrada» sencillamente ya tenía una coincidencia real
(`HDU-HUMO-830455`, ajena a esta suite) desde que E3 permite cerrar HDU de
verdad. Se corrigió únicamente `tests/e2e/e2-f03-listado-hdu.spec.ts`.

## Ronda 3 · Suite completa (E1 + E2 + E3), corrida final

Primero se repitió en aislamiento la prueba corregida
(`npx playwright test --project=e2e e2e/e2-f03-listado-hdu.spec.ts` →
12/12, incluidas `[E2-F03#1]` y `[E2-F03#3]` del mismo archivo), y luego la
suite completa una vez más:

`cd tests && npx playwright test` →

**135/135 pruebas pasaron (9 `setup` + 126 escenarios/pruebas de seguridad),
0 fallas, en 8.6 min.**

Desglose de las 126: 96 escenarios de E1 (72) + E2 (24), 24 escenarios de E3,
4 pruebas de aislamiento de esquemas (`seguridad-aislamiento-esquemas.spec.ts`,
sin ID de HDU propio) y 2 pruebas adicionales de las mismas HDU F1-F02#2/
F1-F05#3 que ya cubrían dos rutas distintas cada una (ver
`certificacion-e1-e2.md`). Ningún escenario falló, ninguno quedó pendiente.

Evidencia (líneas relevantes de la corrida final, `tests/full-run-e3-final.log`):

```
ok 51 [api] › e2-b02-transiciones-estado.spec.ts › [E2-B02#3] … (57.7s)
ok 58-69 [api] › e3-b01..e3-b04 … 12/12 (los más lentos, 58–60s, por reintento ante 429)
ok 116 [e2e] › e2-f03-listado-hdu.spec.ts › [E2-F03#2] … (607ms)
ok 118 [e2e] › e2-f04-detalle-hdu.spec.ts › [E2-F04#1] … (568ms)
ok 121-132 [e2e] › e3-f01..e3-f04 … 12/12
  135 passed (8.6m)
```

## Dictamen final por HDU

### E3 (esta corrida)

| HDU | Dictamen | Motivo |
| --- | --- | --- |
| E3-F01 | CERTIFICADA | 3/3 escenarios pasan en la corrida completa |
| E3-F02 | CERTIFICADA | 3/3 escenarios pasan en la corrida completa |
| E3-F03 | CERTIFICADA | 3/3 escenarios pasan en la corrida completa |
| E3-F04 | CERTIFICADA | 3/3 escenarios pasan en la corrida completa |
| E3-B01 | CERTIFICADA | 3/3 escenarios pasan en la corrida completa |
| E3-B02 | CERTIFICADA | 3/3 escenarios pasan en la corrida completa |
| E3-B03 | CERTIFICADA | 3/3 escenarios pasan en la corrida completa |
| E3-B04 | CERTIFICADA | 3/3 escenarios pasan en la corrida completa |

### E1 y E2 (confirmación de no regresión)

Las 32 HDU y 96 escenarios de `docs/validacion/certificacion-e1-e2.md` se
volvieron a ejecutar como parte de esta corrida completa (Rondas 2 y 3) y
siguen **CERTIFICADA** cada una, sin cambios de dictamen. Dos escenarios
cambiaron de prueba por los efectos de E3 (ver sección dedicada arriba) sin
perder cobertura: `E2-B02#3` y `E2-F04#1`; un tercero (`E2-F03#2`) se
endureció por la misma causa. El defecto de `q360-frontend` ya reportado en
`certificacion-e1-e2.md` (paginación/búsqueda ausente en los selects de
`AdminSupervisionPage`) no se volvió a evaluar en esta ronda (fuera del
alcance de E3) y sigue abierto tal como quedó documentado ahí.

## Resumen final

- **Pruebas ejecutadas (corrida final, Ronda 3):** 135/135 pasan (9 `setup` +
  126 escenarios/pruebas), 0 fallan.
- **Escenarios de E3:** 24/24 ejecutados, 24/24 pasan.
- **Escenarios de E1+E2:** 96/96 ejecutados, 96/96 pasan (sin regresión).
- **HDU de E3:** 8/8 `CERTIFICADA`, 0 `OBSERVADA`, 0 `NO VERIFICABLE`.
- **HDU de E1+E2:** 32/32 siguen `CERTIFICADA` (confirmado en esta corrida).
- **Defectos de producto abiertos en esta ronda:** ninguno. El único defecto
  abierto en todo el proyecto sigue siendo el ya reportado en
  `certificacion-e1-e2.md` (`q360-frontend`, severidad media, selects de
  `AdminSupervisionPage` sin paginar), no tocado por esta ronda.
- **Hallazgos de la propia suite de pruebas, corregidos dentro de esta ronda
  (no defectos de producto):** la aserción de `[E3-B04#1]` sobre
  `valorAnterior` (Ronda 1) y la dependencia de `[E2-F03#2]` en que ninguna
  HDU llegara nunca a `CERRADA` (Rondas 2–3), ambas en `tests/`.
- **Rondas usadas:** 3 de 3 (Ronda 1: E3 aislado con una corrección propia;
  Ronda 2: primera corrida completa con una falla; Ronda 3: repetición
  aislada de la prueba corregida + corrida completa final, 0 fallas).
- Suite completa reproducible con `cd tests && npx playwright test`.

## Escenarios cubiertos según la consigna de la Ola 3

| Cobertura pedida | Dónde |
| --- | --- |
| Subida real de archivo (`setInputFiles`, PDF) | `[E3-F02#1]`, `tests/e2e/e3-f02-marcar-entregable.spec.ts` |
| Descarga del certificado (evento `download` real) | `[E3-F04#1]` y `[E3-F04#3]`, `tests/e2e/e3-f04-certificado.spec.ts` |
| Verificación pública del folio | `[E3-B03#2]` (API, incluye folio desconocido → 404) y dentro de `[E3-F04#1]` (portal, `/verificar/:folio`) |
| Aislamiento: HDU y usuarios propios por prueba | `tests/support/checklist.ts#crearHduAsignadaAAna` (Carla + Ana, por API, en cada prueba) |
| Ayudas por API para 1–8 aprobados, escrituras mínimas | `tests/support/checklist.ts#avanzarChecklist` |
