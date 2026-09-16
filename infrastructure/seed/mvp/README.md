# Quality360 · Semilla MVP (E1/E2)

Dueño: `q360-integraciones`. Datos ficticios para que `q360-qa` certifique E1
(acceso, portales, organización QA) y E2 (gestión de HDU) contra un estado
conocido. Todos los nombres son inventados; todos los correos usan el dominio
`@quality360.local` (nunca un dominio real).

## Archivos

- `esquema.json` — JSON Schema (2020-12) que valida `datos.json` antes de cargar nada.
- `datos.json` — usuarios, catálogos, HDU, historial de supervisión, asignaciones
  de analista y estados objetivo de cada HDU. Usa una `clave` local (string) para
  referenciar entidades dentro del mismo archivo; esa clave nunca se envía a la
  API de Organización.

## Cómo se carga

Con Supabase local y Organización corriendo (`PERMITIR_CARGA_SEMILLA=true`):

```
npm run seed
```

Lee `X_Q360_SERVICIO_TOKEN` y `ORGANIZACION_URL` del entorno o de `infrastructure/seed/mvp/.env.carga` (no versionado; el token debe ser el mismo que usa Organización). El cargador es `cargar.mjs`: idempotente, con rechazos por fila y salida distinta de cero si alguna fila falla. Correrlo dos veces no duplica datos.

> El servicio `services/integraciones` (adaptadores CSV/JSON y Jira con registro de importaciones) queda pendiente para E5; esta carga no depende de él.

El script (`services/integraciones/src/cli/seed.ts`):

1. Valida `datos.json` contra `esquema.json` con Ajv. Si el archivo no cumple el
   esquema, no llama a ninguna API y termina con error.
2. Crea usuarios, células, sprints y HDU llamando a
   `POST /v1/interno/carga/{usuarios,celulas,sprints,hdu}` de Organización con la
   cabecera `X-Q360-Servicio-Token` (`ORGANIZACION_X_Q360_SERVICIO_TOKEN`). Estas
   cuatro rutas ya son idempotentes por su clave natural (correo, nombre o código):
   si la fila ya existe, Organización responde `200` con `creado: false` y no
   cambia nada.
3. Inicia sesión como la administradora sembrada (password grant contra Supabase
   Auth local) y, con esa sesión real, aplica el historial de supervisión
   (`PUT /v1/analistas/{id}/supervisor`), la asignación de analista por HDU
   (`PUT /v1/hdu/{id}/analista`) y el avance de estado de cada HDU
   (`POST /v1/hdu/{id}/estado`, un paso a la vez, según D10). Antes de repetir un
   historial de supervisión de más de un paso (la reasignación de Diego),
   consulta `GET /v1/analistas/{id}/supervision/historial`: si ya existe, no
   repite los pasos intermedios.
4. Cada fila que Organización rechaza (400/404/409/422) queda con su motivo; no
   aborta el archivo completo.
5. Registra la corrida completa (origen, archivo, fecha, filas aceptadas,
   filas rechazadas y el motivo de cada rechazo) en la tabla `Importacion` del
   esquema `integraciones`, con el rol `svc_integraciones`.

Variables de entorno relevantes (`services/integraciones/.env`):
`ORGANIZACION_URL`, `X_Q360_SERVICIO_TOKEN`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`,
`DATABASE_URL` (rol `svc_integraciones`, `?schema=integraciones`). Organización
debe estar arriba con `PERMITIR_CARGA_SEMILLA=true` y el mismo
`X_Q360_SERVICIO_TOKEN`.

## Formatos de archivo aceptados

El comando `seed` solo lee `datos.json` (JSON). El adaptador `ArchivoFuente`
del dominio de Integraciones (para historias de Jira/CSV, E2 en adelante)
también acepta CSV; ver `services/integraciones/README.md`.

## Contraseña de demo

Todas las cuentas se crean con la misma contraseña, **solo válida en el
Supabase local de este repositorio**: `Quality360Demo#2025` (ver
`datos.json#/contrasenaDemo`). Nunca se usa en un proyecto Supabase en la
nube ni con datos reales.

## Usuarios sembrados y escenarios que habilitan

| Usuario | Correo | Rol | Activo | Escenarios que habilita |
| --- | --- | --- | --- | --- |
| Patricia Rojas | patricia.rojas@quality360.local | ADMINISTRADOR | sí | E1-F07, E1-F08, E1-F09, E1-B06, E1-B07, E1-B08, E1-B12; ejecuta la semilla como sesión real |
| Carla Fuentes | carla.fuentes@quality360.local | QE | sí | E1-F02, E1-F03#1 (con equipo), E1-F04#1 (equipo con Ana y Beatriz), E2-F02#1 (HDU-PAG-006 sin analista, asignable a su equipo) |
| Marcos Ibáñez | marcos.ibanez@quality360.local | QE | sí | E1-F02, E1-F04#1 (equipo con Elena y Diego), E1-F04#2/E1-F10#3 (recibe a Diego reasignado) |
| Sofía Herrera | sofia.herrera@quality360.local | QE | sí | **E1-F03 escenario 2**: QE sin analistas (equipo vacío); sus HDU (HDU-SOF-001, HDU-SOF-002) quedan sin analista posible |
| Ana Torres | ana.torres@quality360.local | ANALISTA_QA | sí | E1-F05, E1-F06#1 (con supervisor = Carla), E2-F03/E2-F04 (analista con HDU asignadas: HDU-PAG-001, 003, 005) |
| Beatriz Molina | beatriz.molina@quality360.local | ANALISTA_QA | sí | E1-F05, E1-F06#1 (con supervisor = Carla), E2-F03/E2-F04 (HDU-PAG-002, 004) |
| Diego Salazar | diego.salazar@quality360.local | ANALISTA_QA | sí | **E1-F04 escenario 2 / E1-F10 escenario 3**: historial de 2 QE (Carla → Marcos) con motivo; E2-F03/E2-F04 (HDU-CLI-001, 003, 005) |
| Elena Campos | elena.campos@quality360.local | ANALISTA_QA | sí | E1-F05, E1-F06#1 (con supervisor = Marcos), E2-F03/E2-F04 (HDU-CLI-002, 004, 006) |
| Francisco Reyes | francisco.reyes@quality360.local | ANALISTA_QA | sí | **E1-F06 escenario 2**: analista sin supervisor asignado |
| Gabriela Núñez | gabriela.nunez@quality360.local | ANALISTA_QA | **no** | E1-F01#2 (login rechazado, usuario inactivo), E1-B02 (usuario desactivado no accede) |

## Catálogos

- Células: **Pagos**, **Clientes**.
- Sprints: **Sprint 2025.33** (2025-08-11 a 2025-08-24), **Sprint 2025.34**
  (2025-08-25 a 2025-09-07), **Sprint 2025.35** (2025-09-08 a 2025-09-21).

## HDU (14)

Repartidas en los 3 sprints y las 2 células, con QE responsable Carla, Marcos
o Sofía. Estados alcanzados con `POST /v1/hdu/{id}/estado` (D10; nunca se pide
`CERRADA` desde la semilla porque, en esta corrida, el checklist de
Certificaciones responde «indisponible» — D11):

| Estado | Código(s) |
| --- | --- |
| `PENDIENTE` | HDU-PAG-004, HDU-PAG-006, HDU-CLI-004, HDU-SOF-001 |
| `DISENO_PRUEBAS` | HDU-PAG-002, HDU-PAG-005, HDU-CLI-003, HDU-SOF-002 |
| `EN_EJECUCION` | HDU-PAG-001, HDU-CLI-001, HDU-CLI-006 |
| `PENDIENTE_CIERRE` | HDU-PAG-003, HDU-CLI-002, HDU-CLI-005 |

Sin analista asignado (**E2-F02 escenario 1**): **HDU-PAG-006** (asignable,
Carla tiene equipo), **HDU-SOF-001** y **HDU-SOF-002** (no asignables, Sofía
no supervisa a nadie).

## Límites conocidos

- La semilla no lleva ninguna HDU a `CERRADA`: el cierre depende del checklist
  de Certificaciones (D11), fuera del control de Integraciones.
- El adaptador Jira (`JiraFuente`) no participa en esta semilla: solo lee, y
  sin credenciales reporta la fuente como «no configurada» (ver
  `services/integraciones/README.md`).
