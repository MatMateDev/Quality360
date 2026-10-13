# Certificación del modelo de datos · Quality360

Dueño: `q360-qa`. Alcance: el commit `f5e67e8` («Modelo de datos: tablas y llaves
foráneas según el modelo ER y lógico», rama `feature/e1-e2-quality360`), descrito
en `docs/arquitectura/decisiones-mvp.md`, «Corrida modelo de datos» (D23–D27).
Fuentes del modelo: `docs/arquitectura/modelo-datos/modelo-er-quality360.pdf` y
`modelo-logico-quality360.pdf` (leídos para fijar las expectativas de las pruebas, no
copiadas de la base).

Preguntas que responde esta corrida:

1. ¿Alguna HDU certificada de E1, E2 o E3 regresó? (suite completa, 120 escenarios).
2. ¿Las 16 tablas, sus columnas, sus llaves foráneas y el aislamiento por esquema
   cumplen el modelo? (43 pruebas nuevas con prefijo `[MODELO]`).

## Entorno verificado

- Plataforma local ya levantada por el orquestador (`npm run local -- --build`), **no
  reiniciada ni detenida por `q360-qa`**: portal `:5173`, gateway `:3000`,
  Organización `:3001`, Certificaciones `:3002`, Impedimentos `:3003`, Supabase
  `:54321` (API) y `:54322` (Postgres 17.6).
- Semilla `infrastructure/seed/mvp/` cargada. No se ejecutó `npm run ws:test`.
- Migraciones `20261012000000_modelo_datos` aplicadas y terminadas en los tres
  esquemas (`_prisma_migrations`: organizacion, certificaciones, impedimentos).
- Node 24.16.0, Playwright 1.63.0 (`tests/`), `pg` 8.x. Las pruebas de base se
  conectan con los roles de servicio `svc_organizacion`, `svc_certificaciones` y
  `svc_impedimentos` (`tests/support/db.ts`), que **no** son superusuario; una de
  las pruebas lo verifica en `pg_roles`. Ninguna prueba usa un rol privilegiado.
- Las pruebas que escriben directo en Postgres lo hacen dentro de una transacción
  que siempre se revierte (`enTransaccionRevertida`); tras la corrida se confirmó
  sin residuos (0 filas de prueba en usuario, sprint, historia_usuario, defecto,
  impedimento, etc.).
- Reproducir: `cd tests && npx playwright test` (stack arriba). Solo el modelo:
  `npx playwright test --project=api modelo-datos`.
- Evidencia (logs de `list`, no versionados por `*.log`): `tests/full-run-modelo-base.log`
  (ronda 1), `tests/full-run-modelo-ronda2.log` (ronda 2),
  `tests/full-run-modelo-final.log` (ronda 3) y `tests/modelo-solo.log` (las 43 pruebas
  `[MODELO]` tras el último ajuste).

## Pruebas nuevas

Cuatro archivos en `tests/api/` y un soporte en `tests/support/modeloDatos.ts`. Las
expectativas (tablas, columnas, tipos, llaves foráneas) están escritas a mano desde el
modelo ER y la tabla «Distribución y relaciones» de las decisiones; si la base cambia,
fallan.

| Archivo | Pruebas | Qué verifica |
| --- | --- | --- |
| `modelo-datos-estructura.spec.ts` | 21 | (a) 16 tablas del modelo en el esquema de su servicio, sin tablas de más ni restos de la estructura anterior (`hdu`, `correo`, `qe_id`, `hdu_id`…); columnas clave con su tipo y nulabilidad (D26: boolean, timestamptz, varchar con el largo del modelo, enum de D27); PK uuid de una sola columna; `rol` con 3 filas y cada usuario sembrado apuntando a su rol. (b) Llaves foráneas del modelo dentro de cada esquema, validadas, y ninguna otra salvo las de las tablas de extensión; **ninguna llave foránea entre esquemas** vista desde cada rol; las 3 relaciones entre servicios (`certificacion.id_historia`, `asignacion_certificacion.id_usuario`, `impedimento.id_certificacion`) son UUID obligatorio sin llave foránea y aceptan un UUID ajeno (transacción revertida); las llaves foráneas se hacen cumplir (SQLSTATE 23503 por esquema); índices únicos parciales (ciclo activo por HU, analista vigente por ciclo, sprint vigente por HU, QE vigente por analista) y la base rechaza el duplicado (23505). |
| `modelo-datos-flujo.spec.ts` | 7 | (c) Trabajando una HU solo por el gateway: Carla crea la HU y la asigna a Ana; Ana marca; Carla aprueba, rechaza; Ana vuelve a marcar; Carla reasigna a Beatriz; Beatriz marca y desmarca. Se lee la base tras cada paso: `historia_usuario` + `historia_sprint` vigente; sin `certificacion` antes del primer cambio; luego ciclo 1 `EN_CURSO` con 10 `item_checklist` y 10 `entregable` enlazados ítem a ítem; `evidencia` vigente (`fecha_carga >= completado_en`), conservada y no vigente tras rechazar o desmarcar; `asignacion_certificacion` abierta y, al cambiar de analista, la anterior cerrada con `fecha_hasta` (nunca dos vigentes); cruce por UUID entre servicios comprobado desde la prueba. Segundo flujo: ciclo completo (8 entregables, certificado, cierre) → `COMPLETADA` con `fecha_fin`, 10 evidencias vigentes y el `certificado` colgando del ciclo. |
| `modelo-datos-aislamiento.spec.ts` | 12 | (d) Por cada rol `svc_*`: no es superusuario ni evade RLS; tiene USAGE y SELECT/INSERT/UPDATE sobre todas sus tablas del modelo (incluidas las nuevas) y **ningún privilegio** sobre ninguna tabla de los otros esquemas (consultado por OID del catálogo); recibe `permission denied` al hacer SELECT, UPDATE y DELETE sobre cada tabla ajena (incluidas `rol`, `historia_usuario`, `historia_sprint`, `certificacion`, `item_checklist`, `evidencia`, `impedimento`, `accion_impedimento`…); tampoco alcanza `public`, `auth` ni `storage`. |
| `modelo-datos-limites-api.spec.ts` | 3 | Los cambios de API que fija el modelo: correo de 150 caracteres aceptado y guardado completo (151 → 400 `VALIDACION`, también al editar); enlace de evidencia de 500 caracteres aceptado y guardado completo (501 → 400 `VALIDACION`, sin ciclo ni evidencia a medias); la carga semilla interna de sprints responde 400 sin `celulaId` y 422 `CATALOGO_INVALIDO` con una célula inexistente, y no crea el sprint. |

Total: 43 pruebas `[MODELO]`.

## Ajustes a pruebas existentes (falla por la prueba, no por el producto)

1. **`[E1-B08#2]`** (`tests/api/e1-b08-cambio-rol.spec.ts`). Falló en la ronda 1 con
   `error: column "id" does not exist`. El escenario prepara su estado con SQL directo
   (rol `svc_organizacion`) y usaba los nombres anteriores al modelo (`usuario.id`,
   `usuario.rol` como enum). Se reescribió el SQL con `id_usuario` y `JOIN organizacion.rol`
   (`r.nombre = 'ADMINISTRADOR'`). La aserción del escenario no cambió: sigue exigiendo 409
   `ULTIMO_ADMINISTRADOR` con un único administrador activo. Falló en la primera sentencia,
   antes de tocar datos; el administrador de prueba que quedó activo se desactivó por la API
   y la prueba corregida pasó (ronda 2 y 3).
2. **Reintentos del checklist en la UI** (`tests/support/ui.ts`). `[E3-F02#1]` falló una vez
   (ronda 3, 31,3 s) con «El diálogo del checklist no se cerró tras varios reintentos por
   límite de tasa». Las ayudas del checklist esperaban 5 s por intento (30 s en total), menos
   que la ventana fija de 60 s del gateway, de modo que una racha de escrituras de pruebas
   anteriores agotaba los reintentos. Ahora esperan 12 s por intento (cubre una ventana). No
   es un cambio del producto ni de lo que verifica el escenario. Pasó en las rondas 1 y 2 y
   pasó tras el ajuste; ver «Resultados por ronda».
3. **Tiempos de las pruebas nuevas** (`modelo-datos-flujo`, `modelo-datos-limites-api`):
   `describe.configure({ timeout })` de 240 s y 180 s porque comparten el límite de tasa
   de escritura del gateway (en la ronda 3 dos de ellas esperaron ≈59 s una ventana).
4. `tests/support/env.ts` expone `servicioToken` (solo lectura de `X_Q360_SERVICIO_TOKEN` desde
   `services/organizacion/.env`, para llamar a la carga semilla en una prueba; no se registra).

## Resultados por ronda

| Ronda | Qué se ejecutó | Resultado real |
| --- | --- | --- |
| 1 | Suite completa existente (135 pruebas: 9 `setup` + 126 pruebas de escenarios y aislamiento), sin las nuevas | 134 pasan, 1 falla: `[E1-B08#2]` (SQL de la prueba con columnas anteriores al modelo). 95 de 96 escenarios de E1+E2 y 24/24 de E3 pasan por ID |
| 2 | Primero `[E1-B08#2]` corregida (1/1 pasa). Luego suite completa: 135 existentes + 40 `[MODELO]` | **175/175 pasan**, 0 fallan, 0 omitidas. 96/96 escenarios de E1+E2 y 24/24 de E3 por ID único |
| 3 | Suite completa: 135 existentes + 43 `[MODELO]` (se añadieron las 3 de límites de API) | 177 pasan, 1 falla: `[E3-F02#1]` por agotar reintentos de límite de tasa en la UI (ajuste 2). 43/43 `[MODELO]`, 96/96 E1+E2 y 23/24 E3 por ID |
| 3 (repetición de lo que falló) | Tras el ajuste 2: proyecto `e2e` de E3 (`e3-f01` a `e3-f04`) con los 9 `setup`: 21 pruebas | 21/21 pasan (`[E3-F02#1]` incluido; `[E3-F03#2]` esperó una ventana completa de 1,0 min y pasó, que es justo el caso del ajuste). Tras ajustar los tiempos, las 43 `[MODELO]` en solitario: 43/43 pasan (`tests/modelo-solo.log`) |

Reglas de método: no se marca «pasa» ninguna prueba omitida (no hubo omitidas ni
`flaky`; la prueba que usa `test.skip` si faltara la credencial de servicio se ejecutó y pasó).
Se respetó el máximo de 3 rondas: no se hizo una cuarta suite completa, de modo que el
ajuste de la UI se validó con la repetición aislada y no con una suite completa nueva; eso
queda dicho abajo en el dictamen.

### Totales de la ronda 3 (última suite completa)

- 178 pruebas ejecutadas: 9 `setup`, 169 de proyectos `e2e` y `api`. **177 pasan, 1 falla**
  (flaky de límite de tasa, ya analizada y corregida).
- 43 `[MODELO]`: 43 pasan. 4 pruebas de aislamiento previas (`seguridad-aislamiento-esquemas`): 4 pasan.
- Escenarios por ID único: E1+E2 96/96 pasan, E3 23/24 en esa corrida (el que falló pasó en las
  rondas 1, 2 y en la repetición).

## Hallazgos

### Defectos de producto abiertos por esta corrida

**Ninguno.** Con el commit `f5e67e8` no se encontró ningún comportamiento del producto
que contradiga el modelo de datos ni la API pública. No hay defectos que asignar a
`q360-backend`, `q360-contratos`, `q360-frontend` ni `q360-infra` desde esta corrida.

### Observaciones (no bloquean, anteriores o ajenas al modelo de datos)

| # | Observación | Severidad | Dueño sugerido | Reproducción |
| --- | --- | --- | --- | --- |
| O1 | El contrato de `POST /v1/interno/carga/sprints` (`contracts/organizacion.v1.yaml`) enumera 401 y 403, y `securitySchemes.credencialServicio` dice que `/v1/interno/carga/*` responde 403 con la carga deshabilitada. El guard (`services/organizacion/src/api/guardias/carga-semilla.guard.ts`) responde **404** en esos casos «como si la ruta no existiera» (diseño del ADR 0007, anterior a esta corrida). La prueba `[MODELO] la carga semilla interna de sprints exige celulaId…` afirma 404, que es lo que hace el servicio | Baja | `q360-contratos` (alinear el texto del contrato con el 404) | `curl -i -X POST http://localhost:3001/v1/interno/carga/sprints -H 'Content-Type: application/json' -d '{"nombre":"x","inicio":"2026-01-05","fin":"2026-01-16","celulaId":"00000000-0000-4000-8000-000000000000"}'` → `404` |
| O2 | El entorno compartido tiene un usuario ADMINISTRADOR activo, `prueba.<uuid>@quality360.local`, creado a las 23:41 (antes de la semilla actual), que viene de las pruebas del servicio de Organización (`services/organizacion/test/ayudas.ts` crea correos `prueba.*`). No lo creó ninguna prueba de `tests/` ni de esta corrida; no afecta ningún resultado | Informativa | `q360-backend` (limpiar en las pruebas de servicio) | `select u.email, u.activo from organizacion.usuario u join organizacion.rol r on r.id_rol = u.id_rol where r.nombre = 'ADMINISTRADOR'` |
| O3 | Sigue abierto el defecto de `q360-frontend` ya reportado en `certificacion-e1-e2.md` (selects de `AdminSupervisionPage` sin paginar, severidad media). Esta corrida no lo tocó ni lo volvió a investigar | Media (sin cambios) | `q360-frontend` | Ver `certificacion-e1-e2.md` |

## Dictamen

### Sin regresión en E1, E2 y E3

**Sin regresión.** Con el modelo de datos de `f5e67e8` en funcionamiento, la suite completa
ejecutó los 120 escenarios (96 de E1+E2, 24 de E3), todos con al menos una prueba que pasa:

- Ronda 2 (suite completa): 96/96 y 24/24 por ID único, 175/175 pruebas.
- Ronda 3 (suite completa): 96/96 de E1+E2; 23/24 de E3, con `[E3-F02#1]` fallando por agotar
  los reintentos de límite de tasa en la UI (causa en el soporte de pruebas, corregida). Ese
  escenario pasó en las rondas 1 y 2 y en la repetición posterior al ajuste.
- La única falla atribuible al modelo de datos fue de la prueba (`[E1-B08#2]`, SQL con
  nombres anteriores al modelo), ya corregida; el comportamiento de la API que verifica
  (409 `ULTIMO_ADMINISTRADOR`) no cambió.

Las 40 HDU certificadas (32 de E1+E2 en `certificacion-e1-e2.md`, 8 de E3 en
`certificacion-e3.md`) **siguen `CERTIFICADA`**; ninguna pasa a `OBSERVADA` ni a
`NO VERIFICABLE`. Limitación declarada: por el tope de 3 rondas, el último ajuste de
soporte (esperas de la UI) se comprobó con la repetición aislada de E3 (21/21) y no con
una cuarta suite completa; el resto de la suite no usa esas ayudas.

### Modelo de datos verificado

**Verificado** en lo que el producto usa hoy y en estructura donde aún no hay funcionalidad:

- 16/16 tablas del modelo en el esquema de su servicio, columnas clave y tipos según el modelo
  y D26/D27; PK uuid (D25); solo las tablas de extensión documentadas además.
- Llaves foráneas del modelo presentes y validadas **dentro** de cada esquema; **ninguna entre
  esquemas**; las 3 relaciones entre servicios son UUID sin llave foránea (regla no negociable 3).
- Índices únicos parciales de vigencia presentes y efectivos.
- Flujo real por API → filas coherentes en `historia_usuario`/`historia_sprint`,
  `certificacion` (ciclo 1, 10 `item_checklist`, 10 `entregable`), `evidencia` (historial y
  vigencia), `asignacion_certificacion` (cierre al cambiar de analista), ciclo `COMPLETADA`
  con su `certificado`.
- Aislamiento: cada `svc_*` no tiene ningún privilegio sobre los esquemas ajenos (incluidas las
  tablas nuevas), no es superusuario y no alcanza `public`, `auth` ni `storage`.
- Límites de API del modelo: correo 150, enlace de evidencia 500, `celulaId` obligatorio en la
  carga semilla de sprints.

## Escenarios y áreas no cubiertas

- **Sin funcionalidad todavía (E4+):** `ejecucion_prueba`, `defecto`, `impedimento` y
  `accion_impedimento` solo se verifican en estructura, llaves foráneas, aislamiento y como
  receptoras de UUID ajeno. No hay API que ejercitar y sus valores de estado (D27) no están
  fijados.
- **Migración sobre datos viejos:** la base ya estaba migrada cuando llegó `q360-qa`; no se
  reprodujo el paso desde la estructura anterior con datos. Se comprobó el resultado (llaves
  foráneas validadas, sin tablas ni columnas heredadas, flujo funcional) pero no la
  conservación fila a fila de los datos previos.
- **Reglas de borrado:** no se probó `ON DELETE RESTRICT`/`SET NULL`; solo el rechazo de hijos sin
  padre al insertar.
- **Sprint de la misma célula que la HU:** no se verifica porque las decisiones («Reglas que agrega
  el modelo») lo dejan sin exigir (la semilla comparte sprints entre células).
- **Contratos:** esta corrida no re-ejecutó `contracts:lint` ni la cobertura 120/120 que ya
  reportó el desarrollador; solo comprobó con la API real los tres cambios de largo/obligatoriedad.
- **Nube (Vercel/Supabase en la nube):** no se probó; solo el entorno local.
