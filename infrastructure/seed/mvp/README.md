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

> **Esta carga no pasa por el servicio `services/integraciones` ni deja registro en el esquema
> `integraciones`.** El cargador es un script de Node que habla solo con Organización. El esquema
> `integraciones` guarda únicamente las ejecuciones de E5 (sincronización con Jira e importación de
> archivos desde el portal); no existe una tabla `Importacion` ni se registra aquí la semilla.

`cargar.mjs`, en este orden:

1. Crea células, sprints, usuarios y HDU llamando a
   `POST /v1/interno/carga/{celulas,sprints,usuarios,hdu}` de Organización con la cabecera
   `X-Q360-Servicio-Token`. Estas rutas son idempotentes por su clave natural (nombre, correo o
   código): si la fila ya existe, Organización responde `200` con `creado: false` y no cambia nada.
2. Aplica el historial de supervisión (`PUT /v1/analistas/{id}/supervisor`), la asignación de
   analista por HDU (`PUT /v1/hdu/{id}/analista`) y el avance de estado de cada HDU
   (`POST /v1/hdu/{id}/estado`, un paso a la vez, según D10). El historial completo solo se
   aplica a un analista creado en esa corrida; en las siguientes se confirma solo el supervisor final.
3. Cada paso que Organización rechaza (400/404/409/422) queda en el resumen con su motivo y no
   aborta el resto; si hubo algún rechazo, el comando termina con código 1.

Variables de entorno: `X_Q360_SERVICIO_TOKEN` (obligatoria), `ORGANIZACION_URL` (por defecto
`http://localhost:3001`) y `CONTRASENA_DEMO` (opcional). Organización debe estar arriba con
`PERMITIR_CARGA_SEMILLA=true` y el mismo `X_Q360_SERVICIO_TOKEN`.

`esquema.json` describe la forma de `datos.json`, pero `cargar.mjs` hoy **no** lo aplica: Organización
valida cada fila al recibirla.

## Formatos de archivo aceptados

El comando `seed` solo lee `datos.json` (JSON propio de la semilla). La importación de historias
desde CSV o JSON (`codigo, titulo, descripcion, prioridad, celula, sprint, qe_correo`) es de E5 y
se hace desde el portal; ver `docs/backlog/e5-integracion-jira.md`, sección 5.2. Los sprints y
datos que necesita E5 los deja `npm run seed:e5` (ver `infrastructure/seed/e5/README.md`).

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
| Lorena Soto | lorena.soto@quality360.local | LIDER_QA | sí | **E7**: Líder con las células Pagos y Clientes; ve todas las HDU de la semilla, solo lectura |
| Andrés Vega | andres.vega@quality360.local | AUDITOR | sí | **E7**: lee todo el sistema, filtra y exporta CSV; no modifica nada |

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
- Jira no participa en esta semilla. La integración (E5) es solo de lectura, se configura desde el
  portal y, sin configuración, el servicio responde `JIRA_NO_CONFIGURADO` (ver
  `docs/backlog/e5-integracion-jira.md`).
