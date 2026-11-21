# Quality360 · Fixture E6 (indicadores y dashboards)

Dueño: `q360-integraciones`. Agrega, encima de E7 y E4, los datos estáticos de la sección 8 de
`docs/backlog/e6-indicadores-dashboards.md` (plan: `docs/arquitectura/e6-plan-construccion.md`). Solo usa
APIs (Organización, Certificaciones; Indicadores en `escenarios.mjs`); no escribe SQL.

```
npm run seed:e7      # células, usuarios y HDU H1-H8
npm run seed:e4      # sprints, impedimentos I1-I5 y riesgo de H6
npm run seed:e6
```

Requiere el stack local con `PERMITIR_CARGA_SEMILLA=true`, el mismo `X_Q360_SERVICIO_TOKEN` y las
variables de `infrastructure/seed/mvp/.env.carga`. URLs opcionales: `ORGANIZACION_URL` (3001),
`CERTIFICACIONES_URL` (3002), `INDICADORES_URL` (3005), `SUPABASE_URL`. `-- --sin-verificar` omite la
verificación final. Solo local.

## Qué carga `seed:e6` (idempotente)

| Elemento | Detalle |
| --- | --- |
| QE3 | `qe3@quality360.local`, QE activo sin analistas ni HDU |
| ANA4 | `ana4@quality360.local`, analista sin QE ni HDU. Ya la crea `seed:e7`; aquí solo se confirma |
| LID3 | `lid3@quality360.local`, Líder QA activo, solo de CEL-D (LID2 sigue sin células) |
| CEL-D | Célula sin HDU, asignada a LID3 (`PUT /v1/usuarios/{id}/celulas-lider`, sesión ADM1). Si una base antigua la tiene en LID2, se la quita sin tocar otras células |
| Verificación | Avance de H1-H8 (aprobados × 10, por Certificaciones) contra el backlog. Si difiere, informa y termina con código 1 **sin corregir nada** |

Todo recorre las listas con `pagina`/`tamanoPagina=100` hasta agotarlas.

## Supuesto «H4 tiene 0 % de avance»

Confirmado por lectura de las semillas: `seed:e7` deja H4 en `DISENO_PRUEBAS` sin la clave `checklist`
(0 entregables aprobados) y `seed:e4` solo la mueve al sprint lejano SP-LEJ, no registra impedimentos
sobre H4 ni toca su checklist (riesgo `BAJO` sugerido). Cada corrida de `seed:e6` lo vuelve a comprobar
contra Certificaciones e imprime «Supuesto H4 tiene 0 % de avance: CONFIRMADO». **Pendiente:** esa
comprobación en vivo aún no se ejecutó contra el stack (ver «Estado de verificación»).

## Escenarios (`escenarios.mjs`, para `q360-qa`)

No se llaman desde `seed:e6` porque cambian el estado del fixture. Cada función es idempotente.

| Función | Qué hace |
| --- | --- |
| `supervisarAna4ConQe2()` | `PUT /v1/analistas/{id}/supervisor`: ANA4 pasa a QE2 («sin asignaciones») |
| `reasignarH4AAna1()` | ADM1 hace `PUT /v1/hdu/{id}/analista` de `E7-H4` a ANA1 (D190). Con credencial de servicio fallaría: valida el equipo de QE2 |
| `crearAnalistaDesactivadoConHdu()` | Crea `anad@quality360.local` (analista de QE2), le asigna la HDU `E6-HD1` (CEL-A) y lo desactiva con `PATCH /v1/usuarios/{id}` de ADM1 |
| `cargarSnapshots(instantes)` | `POST /v1/interno/carga/snapshots` (Indicadores, D184) por cada instante ISO |
| `instantesDeLaSerie()` | Los tres instantes de `datos.json` (15:00 UTC, hoy − 2, − 1 y hoy). H1 en 30, 30 y 40 %: subir H1 al 40 % (aprobar su 4º entregable) antes de la tercera carga |
| `avanceDe(codigo)` | Avance en % de una HDU, p. ej. `avanceDe('E7-H1')` |

## Estado base de E7 y cómo restablecerlo

Los valores de E7 (10 usuarios activos, 1 inactivo, `hdu-total 8`) solo valen sobre una base vacía con
únicamente `seed:e7`. La API **no borra** usuarios ni HDU, así que lo que agrega E6 no se deshace
por API:

- `seed:e6` suma **QE3** y **LID3** (12 usuarios activos). `ana4` y `lid2` ya estaban. No suma HDU.
- `crearAnalistaDesactivadoConHdu()` suma 1 usuario inactivo (`anad`) y 1 HDU (`E6-HD1`): el total pasa a 9 HDU.
- `reasignarH4AAna1()` y `supervisarAna4ConQe2()` cambian relaciones, no conteos de usuarios o HDU.

Para volver al estado base de E7 (la forma soportada): reiniciar la base local y recargar
(`supabase db reset` y `node infrastructure/local/preparar-entorno.mjs` si procede; luego
`npm run local`, `npm run seed:e7`, `npm run seed:e4` y, si se necesita E6, `npm run seed:e6`). Las
pruebas E7 se corren antes de E6 o tras ese reinicio. `npm run seed` (semilla MVP) **no** restablece
nada: es aditiva y agrega los usuarios y las 14 HDU de E1/E2, por lo que tampoco deja el estado de
E7; ver la nota en `infrastructure/seed/mvp/README.md`.

Alternativa sin reiniciar, solo para que QE3, LID3 y `anad` no cuenten como activos: desactivarlos con
`PATCH /v1/usuarios/{id}` (`activo: false`). Quedan como inactivos (el contador de inactivos sube) y
las HDU no se pueden retirar, así que no devuelve el conteo exacto de E7.

## Estado de verificación

Escrito contra los contratos (`organizacion.v1.yaml`, `indicadores.v1.yaml`). **No se ejecutó contra el
stack real**: no había servicios levantados al construirlo. Solo se comprobó la sintaxis (`node --check`).
Por verificar contra el stack real:

- `seed:e6` completo sobre base vacía + `seed:e7` + `seed:e4`, y una segunda corrida sin cambios.
- El filtro `?q=` de `GET /v1/usuarios` busca por correo completo (se usa para ubicar usuarios).
- `PATCH /v1/usuarios/{id}` con `activo: false` sobre un analista con HDU activa, y que la asignación de
  `E6-HD1` a un analista recién supervisado por QE2 sea aceptada por ADM1.
- `POST /v1/interno/carga/snapshots` de Indicadores (aún lo implementa `q360-backend`; ruta y cuerpo
  `{instante}` tomados del contrato) y que el puerto 3005 sea el definitivo.
- La respuesta de `GET /v1/hdu/{id}/entregables` (`entregables[].estado`), tal como la usa E7.

El resultado de la primera corrida real debe anotarse aquí.
