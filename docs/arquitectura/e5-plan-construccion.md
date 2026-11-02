# E5 · Plan de construcción (integración con Jira Cloud)

Fecha: 2026-10-30. Rama: `feature/e1-e2-quality360`.

**Insumos:**
- Backlog: `docs/backlog/e5-integracion-jira.md`, con 8 HDU, 24 escenarios y 102 casos. Catálogos en la sección 4, mapeo y formatos en la 5, modelo de datos en la 6, rutas y permisos en la 7, límites en la 8, efectos sobre lo certificado en la 9 y Jira simulado y fixture en la 10.
- Diseño: `docs/diseno/e5-integracion-jira.md`.
- Decisiones: D93–D112 en el backlog y D113–D128 en `docs/arquitectura/decisiones-mvp.md` (sección «Corrida E5», con el modelo de datos detallado), más el ADR 0015.

**Contrato:** el de `contracts/*.yaml`, con `integraciones.v1.yaml` nuevo y cambios aditivos en `comun`, `organizacion` y `gateway`. `npm run contracts:lint` pasa sin advertencias y `npm run contracts:check` cubre 210/210 escenarios (E1, E2, E3, E4, E5 y E7). Nadie cambia un contrato sin pasar por `q360-arquitecto`; si al construir aparece una brecha, se reporta y no se improvisa en el código.

**Tipos del portal:** con estos contratos, `npm run contracts:types` genera también `contracts/dist/types/integraciones.v1.d.ts`, y `tsc --noEmit -p apps/web/tsconfig.json` termina sin errores (comprobado el 2026-10-30). Los tipos nuevos (`Ejecucion`, `ConfiguracionJira`, `PaginaFilasEjecucion`, `EstadoIntegracion`, `VistaPreviaArchivo`, `ErrorArchivo`, `OrigenHdu`…) ya están en `gateway.v1.d.ts`. No hay paso bloqueante de tipos.

## Cómo se trabaja en paralelo

- Los cinco agentes de construcción arrancan el mismo día contra los contratos: `q360-backend`, `q360-integraciones`, `q360-seguridad-gateway`, `q360-frontend` y `q360-infra`.
- El portal trabaja con MSW y los tipos generados hasta que el backend publique cada endpoint. **Los mocks no cuentan como avance:** una HDU se da por terminada solo cuando funciona contra el stack real (Supabase local más `npm run local`) y después en la nube.
- Cada agente trabaja en su worktree, escribe solo en sus carpetas, hace commit con su prefijo y no hace push.
- **Dentro de `services/integraciones` trabajan dos agentes:**
  - `q360-backend` es dueño del servicio Nest: API, aplicación, persistencia, cifrado y despliegue.
  - `q360-integraciones` es dueño de la frontera con Jira y con los archivos: `src/dominio/mapeo/**`, `src/dominio/puertos/fuente-jira.ts`, `src/infraestructura/jira/**` y `src/infraestructura/archivos/**`, con sus pruebas.
  - Para no pisarse, I0 (el esqueleto) va primero, el mismo día, y la interfaz de la sección «Frontera Jira y archivos» es fija.
- Al cerrar, `q360-qa` vuelve a ejecutar la regresión de E1–E4 y E7 (sección 9 del backlog E5) y certifica E5 en `docs/validacion/certificacion-e5.md`.

## Orden y dependencias

| Ola | Quién | Entrega | Desbloquea |
| --- | --- | --- | --- |
| 1 | backend | I0 · esqueleto de `services/integraciones` (Nest, Prisma, configuración, `/health`, `vercel.json`) | Todo lo de Integraciones |
| 1 | backend | O1 · migración de Organización (`origen`, `clave_externa`, `url_externa`, `ACTUALIZAR_HDU`) | O2, O3 |
| 1 | integraciones | J0 · `src/dominio/puertos/fuente-jira.ts` y los tipos de mapeo (tal como están abajo) | I3, J1 |
| 1 | gateway | G1 · rutas de E5 e `INTEGRACIONES_URL` no fatal | Integración real del portal |
| 1 | frontend | F1 · tipos, API, rutas, menús, pestañas y mocks | F2–F6 |
| 1 | infra | L1 · Integraciones en `npm run local` y Compose (sin perfil `e5`), con llave de desarrollo | Pruebas locales |
| 1 | backend | C1 · neutralización CSV verificada en los 3 servicios (D122) | E5-B04-T15 |
| 2 | backend | I1 · modelo de datos y cifrado (D94, D123) | I2 |
| 2 | backend | O2 · `POST /v1/interno/integraciones/{destino, hdu/upsert}` | I2, I3, I4 |
| 2 | backend | O3 · `GET /v1/hdu/{id}` con los 4 campos; sprints con `celulaId` y filtro | F6, F2 |
| 2 | integraciones | J1 · cliente Jira HTTP (D95, D96, D105) | I3 |
| 2 | integraciones | J2 · mapeo de issues: ADF, prioridad, sprint y recortes (D101, sección 5.1) | I3 |
| 2 | integraciones | J3 · lector y validador de CSV/JSON (D102, sección 5.2) | I4 |
| 2 | qa | Q1 · Jira simulado (`tests/support/jira-falso/`), fixtures y `contrato.ts` | Pruebas de todos |
| 3 | backend | I2 · configuración: GET, PUT, probar y eventos (E5-B01) | F2 real |
| 3 | backend | I3 · sincronización y ejecuciones (E5-B02, E5-B04#1/#3) | F3 real |
| 3 | integraciones | S1 · `seed:e5` (sprints «E5 Sprint 1/2» en CEL-C) y corrección del README de la semilla | Pruebas de `q360-qa` |
| 3 | frontend | F2 · pestaña Conexión (E5-F01) | — |
| 4 | backend | I4 · vista previa e importación, modo estricto (E5-B03) | F4 real |
| 4 | backend | I5 · historial, detalle con ámbito del QE y estado (E5-B04#2) | F5 real |
| 4 | frontend | F3 · Sincronizar (E5-F02), F4 · Importar archivo (E5-F03) | — |
| 5 | frontend | F5 · historial en 3 anfitriones (E5-F04), F6 · descripción y origen en `/hdu/:id` (D108) | — |
| 6 | backend | D1 · `infrastructure/nube/005` y empaquetado Vercel; migraciones en la nube al cerrar (D13) | Certificación en la nube |
| 7 | qa | Regresión E1–E4 y E7, certificación E5, axe y búsqueda de secretos | Dictamen |

## q360-backend · Integraciones (`services/integraciones`)

La estructura es la de Impedimentos: `api` → `aplicacion` → `dominio`, con `infraestructura` detrás de puertos. El dominio no importa Prisma, Nest ni clientes HTTP. Integraciones **no** importa código de otro servicio: llama a Organización por HTTP con el token del usuario, como Impedimentos (`packages/auth-nest` solo verifica la sesión).

### I0 · Esqueleto

- `package.json` (`@quality360/integraciones`), los tsconfig, `src/main.ts`, `src/crear-app.ts`, `src/configuracion.ts`, `/health`, `api/index.mjs`, `vercel.json` y `public/`, copiados del patrón de Impedimentos. En `vercel.json`, el `buildCommand` compila `packages/auth-nest` y `services/integraciones`, y va con `maxDuration: 30` y `regions: ["gru1"]`.
- Límite del cuerpo JSON: 1,5 MB solo en `/v1/integraciones/archivos/*`; el resto queda con el valor por defecto.
- **Variables** (`src/configuracion.ts`). Ninguna tumba el arranque, salvo un `DATABASE_URL` ausente:

| Variable | Defecto | Nota |
| --- | --- | --- |
| `DATABASE_URL` | — | Rol `svc_integraciones`, `?schema=integraciones` |
| `ORGANIZACION_URL` | `http://localhost:3001` | En producción, si falta, todo `/v1/*` responde 503 y `/health` responde 200 |
| `ORGANIZACION_TIMEOUT_MS` | 5000 | Se acota por el presupuesto restante (D114) |
| `INTEGRACIONES_LLAVE_CIFRADO` | — | 32 bytes en Base64. Si falta o es inválida, solo cifrar o descifrar da 503 `LLAVE_CIFRADO_NO_DISPONIBLE`, y `llaveDisponible: false` (D128) |
| `INTEGRACIONES_PRESUPUESTO_MS` | 8000 | D96 |
| `JIRA_TIEMPO_LIMITE_MS` | 3000 | |
| `JIRA_ESPERA_MAX_429_MS` | 3000 | |
| `JIRA_TOPE_ISSUES` | 100 | |
| `INTEGRACIONES_EN_CURSO_MAX_MS` | 300000 | D104 |
| `INTEGRACIONES_PERMITIR_HOST_PRUEBA` | `false` | Se **ignora** con `NODE_ENV=production` (D95) |
| `SUPABASE_URL` y las del verificador | — | Iguales a Impedimentos |

- Los mensajes de error de configuración nombran la variable y la regla, **nunca el valor** (commit e193c46).

### I1 · Modelo de datos y cifrado (D94, D123)

- `prisma/schema.prisma` y `prisma/migrations/20261029000000_e5_integracion_jira/migration.sql`, tal como los especifica «Modelo de datos» de la Corrida E5: 4 tablas, sus CHECK, el índice único parcial, los 2 disparadores y los `REVOKE`.
- `src/infraestructura/cifrado/cifrador-aes-gcm.ts`, con `node:crypto` (`aes-256-gcm`):
  - IV aleatorio de 12 bytes en cada cifrado, etiqueta de 16 bytes y AAD `q360:jira:token:v1`.
  - Descifrar con una llave distinta lanza `TOKEN_NO_DESCIFRABLE`.
  - El token solo vive en memoria durante la petición; no se registra ni se serializa.
- **Pruebas:** E5-B01-T01, T02, T03, T04, T11, T12 y E5-B04-T10. Agregar una prueba unitaria que serializa la entidad de configuración y no encuentra el token.

### I2 · Configuración (E5-B01)

- `GET`, `PUT`, `POST probar` y `GET eventos`, según `integraciones.v1.yaml`.
- Orden en el `PUT`: 401 → 403 → 400 (sitio D95, sin llamada saliente) → 422 (`POST /v1/interno/integraciones/destino`) → prueba (`probar` y `detectarCampoSprint` del puerto) → guardar y registrar el evento.
- Si la prueba falla, solo se actualizan `estado_conexion`, `ultima_prueba_*` y `guardado: false`.
- `probar` hace exactamente 2 llamadas a Jira (E5-B01-T05).

### I3 · Sincronización y ejecuciones (E5-B02, E5-B04#1/#3)

- Caso de uso `SincronizarJira`:
  1. Autoriza.
  2. Lee la configuración. Sin configuración, 409 `JIRA_NO_CONFIGURADO`.
  3. Descifra el token. Si no se puede, 409 `TOKEN_NO_DESCIFRABLE`.
  4. En una transacción, cierra como `INTERRUMPIDA` las ejecuciones viejas e inserta la nueva `EN_CURSO`. Si viola el índice, 409 `INTEGRACION_EN_CURSO`.
  5. Recorre las páginas de Jira con el puerto, mapea con J2, envía lotes de 25 al upsert, inserta las filas de detalle por lote y cierra la ejecución una sola vez.
- Presupuesto y tiempos límite según D114: se usa `restanteMs()` antes de cada llamada.
- Con 100 issues, `hayMas` depende de lo que diga Jira (`EXACTO` no inventa una continuación).
- `continuarDesde` es la última clave procesada.
- Errores según D105 y D117. `mensajeError` y `sugerencias` salen de una tabla fija del servicio.
- **Pruebas:** E5-B02-T01 a T13, E5-B04-T01, T03, T04, T08, T09 y T11.

### I4 · Archivos (E5-B03)

- Orden de validación:
  1. Tamaño en bytes. Más de 1 MB, 413 y no se registra.
  2. `formato`.
  3. Estructura (J3).
  4. Filas (J3).
  5. Simulación o escritura por lotes.
- `vista-previa` usa `soloSimular` y no registra nada.
- `importaciones` registra la ejecución apenas pasa la autorización. Un error de estructura deja la ejecución `FALLIDA` con la huella y responde 422 con `ejecucionId`.
- El modo estricto sigue D125.
- La huella es el SHA-256 del contenido recibido. El contenido no se guarda.
- **Pruebas:** E5-B03-T01 a T14, E5-B04-T02, T12 y T13.

### I5 · Historial (E5-B04#2)

- `GET ejecuciones` (filtros, orden y paginación con recorte a 100, D49), `GET ejecuciones/{id}`, `GET …/detalle` y `GET estado`.
- Para el QE: una llamada a `GET /v1/interno/hdu/ambito` y luego `filasOcultas`. Las filas con error van con `titulo: null` y `referencia: null` (D126).
- Una ejecución inexistente da 404 a Administrador y Auditor y 403 al QE.
- **Pruebas:** E5-B04-T05, T06 y T07.

### D1 · Nube

`infrastructure/nube/005_rls_integraciones_nube.sql` (RLS sin políticas en las 4 tablas y repetición de los `REVOKE`, como `004`). Además, la sección de Integraciones en `services/integraciones/README.md`, con sus variables y sin valores.

## q360-backend · Organización (`services/organizacion`)

### O1 · Migración `20261029000000_e5_origen_hdu`

Tal como la especifica la Corrida E5: `origen`, `clave_externa`, `url_externa`, su CHECK, el índice parcial y `ACTUALIZAR_HDU`. `modelo-datos-estructura` debe seguir pasando, con las columnas nuevas.

### O2 · Internos de E5 (D100, D120, D124)

- `POST /v1/interno/integraciones/destino`: valida y nombra el destino; responde 200 con `errores[]`.
- `POST /v1/interno/integraciones/hdu/upsert`: sigue el algoritmo por fila de su descripción en `organizacion.v1.yaml`.
  - Solo Administrador activo con su token. La credencial de servicio da 403 aunque esté `PERMITIR_CARGA_SEMILLA`.
  - De 1 a 25 filas.
  - Cada fila es una transacción; con `estricto`, el lote completo es una transacción.
  - Crea por el **mismo caso de uso** que `POST /v1/hdu`, con historial inicial y `CREAR_HDU` con `origen`. Crear no debe duplicar reglas: se extrae lo común a una función de dominio.
  - Actualizar audita `ACTUALIZAR_HDU` con antes y después.
  - Nunca llama a Certificaciones ni a Impedimentos.
- **Pruebas:** E5-B03-T05, T07, T08, T10 y T13, más unitarias del algoritmo (`SIN_CAMBIOS` con un valor vacío, `HDU_CERRADA`, `HDU_MANUAL_EXISTENTE`, vincular, `SPRINT_REQUERIDO` y sprint de otra célula).

### O3 · Lecturas

- `GET /v1/hdu/{id}` suma `descripcion`, `origen`, `claveExterna` y `urlExterna`. Listados, bandejas y CSV no cambian (D108).
- `GET /v1/catalogos/sprints` suma `celulaId` en cada sprint y el filtro `celulaId`.

## q360-backend · Neutralización CSV (D122)

### C1 · Los tres generadores

- **Organización** (`services/organizacion/src/infraestructura/csv/generador-csv.ts`), **Certificaciones** y **Impedimentos** ya implementan la regla (`INICIO_FORMULA = /^[=+\-@\t\r]/`, solo en celdas de texto, antes del entrecomillado). **No se cambia el comportamiento.** Lo que falta:
  - Una prueba unitaria en Certificaciones y otra en Impedimentos, igual a la de `services/organizacion/test/dominio/e7-reglas.test.ts`, que cubra los 6 caracteres, un número negativo sin prefijo y una celda con `;` o `"` prefijada **y** entrecomillada (`"'=a;b"`).
  - Un comentario en cada generador que cite D122.
- El código **no** se mueve a `packages/`: cada servicio exporta lo suyo (D48) y `packages/` no tiene lógica de dominio.

## q360-integraciones · Frontera Jira y archivos

### J0 · Puerto y tipos (primer commit, sin cambios después sin avisar)

`src/dominio/puertos/fuente-jira.ts`:

```ts
export type CodigoErrorJira =
  | 'JIRA_CREDENCIAL_INVALIDA' | 'JIRA_SIN_PERMISO' | 'JIRA_SITIO_NO_ENCONTRADO'
  | 'JIRA_PROYECTO_NO_ENCONTRADO' | 'JIRA_LIMITE_DE_TASA' | 'JIRA_TIEMPO_AGOTADO'
  | 'JIRA_NO_DISPONIBLE' | 'JIRA_RESPUESTA_INVALIDA';
export interface CredencialJira { sitio: string; correo: string; token: string }
export interface OpcionesLlamada { tiempoLimiteMs: number; esperaMax429Ms: number; restanteMs: () => number }
export interface EventoEspera { tipo: 'JIRA_LIMITE_DE_TASA'; esperaMs: number; fecha: Date }
export type ResultadoJira<T> =
  | { ok: true; valor: T; eventos: EventoEspera[] }
  | { ok: false; codigo: CodigoErrorJira; eventos: EventoEspera[] };
export interface SprintJira { nombre: string; estado: 'active' | 'future' | 'closed'; fin: string | null }
export interface IssueJira {
  clave: string; tipo: string; titulo: string | null; descripcionAdf: unknown;
  prioridad: string | null; estado: string | null; responsable: string | null; sprints: SprintJira[];
}
export interface PaginaJira { issues: IssueJira[]; nextPageToken: string | null; esUltima: boolean }
export interface FuenteJira {
  probar(c: CredencialJira, proyecto: string, o: OpcionesLlamada):
    Promise<ResultadoJira<{ usuarioJira: string; proyecto: { clave: string; nombre: string } }>>;
  detectarCampoSprint(c: CredencialJira, o: OpcionesLlamada): Promise<ResultadoJira<string | null>>;
  buscarPagina(c: CredencialJira, q: { proyecto: string; tipos: string[]; despuesDe?: string;
    nextPageToken?: string; campoSprint: string | null }, o: OpcionesLlamada): Promise<ResultadoJira<PaginaJira>>;
}
```

`src/dominio/mapeo/tipos.ts` define `FilaMapeada`, que tiene la misma forma que `FilaUpsertHdu` del contrato más `advertencias`, `referencia` y `error` (un `MotivoFila` o `null`). Si `error` no es `null`, la fila no se envía a Organización.

### J1 · Cliente HTTP (`src/infraestructura/jira/cliente-jira-http.ts`)

- Usa `fetch` nativo, sin dependencias nuevas, con `AbortSignal.timeout(min(tiempoLimiteMs, restanteMs()))`.
- Autenticación básica (`correo:token`). La cabecera se arma en el momento y no se registra.
- `GET /rest/api/3/myself`, `/project/{clave}`, `/field` (esquema `gh-sprint`) y `/search/jql`, con `maxResults=50`, `nextPageToken`, los campos `summary`, `description`, `priority`, `issuetype`, `status`, `assignee` y el campo Sprint.
- La consulta JQL fija de D96 se arma con valores ya validados: `proyecto` cumple `^[A-Z][A-Z0-9_]{1,9}$`, cada tipo se entrecomilla y se rechazan las comillas, y `despuesDe` cumple el patrón de código.
- **429:** hasta 2 reintentos si `Retry-After` es menor o igual a `esperaMax429Ms` y queda presupuesto; cada espera es un `EventoEspera`.
- **Mapa de errores:** 401 → `JIRA_CREDENCIAL_INVALIDA`; 403 → `JIRA_SIN_PERMISO`; DNS, conexión rechazada o 404 en la raíz → `JIRA_SITIO_NO_ENCONTRADO`; 404 del proyecto → `JIRA_PROYECTO_NO_ENCONTRADO`; aborto por tiempo → `JIRA_TIEMPO_AGOTADO`; 5xx → `JIRA_NO_DISPONIBLE`; JSON inválido o con otra forma → `JIRA_RESPUESTA_INVALIDA`.
- **Nunca** se lee ni se propaga el cuerpo de un error de Jira (el modo `TOKEN_REVOCADO` del falso lo repite).
- `src/dominio/mapeo/sitio.ts` valida el sitio según D95, con `permitirHostPrueba` como parámetro. La API la usa antes de cualquier llamada.

### J2 · Mapeo (`src/dominio/mapeo/`)

- `adf-a-texto.ts`: párrafos y títulos separados por salto de línea, viñetas con «- », menciones y enlaces con su texto; los nodos desconocidos se ignoran (E5-B02-T03).
- `prioridad.ts`: tabla de 5.1, sin distinguir mayúsculas ni tildes, con las advertencias `PRIORIDAD_AUSENTE` y `PRIORIDAD_DESCONOCIDA`.
- `sprint.ts`: elige el sprint `active`; si no hay, el `future` más próximo; si no, el `closed` más reciente. Devuelve el **nombre**; Organización lo busca en la célula.
- `issue.ts`: recorta el título a 200 (`TITULO_TRUNCADO`) y la descripción a 1.000 (`DESCRIPCION_TRUNCADA`); título vacío → `TITULO_VACIO`; código inválido → `CODIGO_INVALIDO`. Arma `urlExterna` como `<sitio>/browse/<clave>` y `referencia` (estado y responsable).
- Todo es puro, con pruebas unitarias.

### J3 · Archivos (`src/infraestructura/archivos/` y `src/dominio/mapeo/fila-archivo.ts`)

- **CSV RFC 4180** escrito a mano: comillas, saltos de línea dentro de un campo, BOM y separador `,` o `;` detectado en el encabezado. Encabezados sin distinguir mayúsculas ni tildes.
- **JSON:** una lista, o `{historias: [...]}`, con `qeCorreo` o `qe_correo`.
- **Errores de estructura** de la sección 4.3: `COLUMNAS_FALTANTES` lista todas las columnas que faltan; `COLUMNA_IGNORADA` aparece una vez.
- **Validación por fila:** `CODIGO_INVALIDO`, `TITULO_VACIO`, `TITULO_LARGO` (en archivo no se trunca), `PRIORIDAD_INVALIDA`, `CODIGO_DUPLICADO_EN_ARCHIVO` (gana la primera aparición, sin distinguir mayúsculas) y `DESCRIPCION_TRUNCADA`.
- Una celda que empieza con `=`, `+`, `-` o `@` se conserva tal cual (D122).

### S1 · Semilla

- `infrastructure/seed/e5/` y `npm run seed:e5`: «E5 Sprint 1» y «E5 Sprint 2» en CEL-C, con `POST /v1/interno/carga/sprints`, de forma idempotente.
- En `infrastructure/seed/mvp/README.md` se elimina la mención a la tabla `Importacion` (supuesto 5).

**Jira simulado:** es de `q360-qa` (D109, `tests/support/jira-falso/`). `q360-integraciones` no lo construye, pero sus pruebas unitarias de J1 usan un servidor `node:http` mínimo propio, dentro de `services/integraciones/test/`.

## q360-seguridad-gateway (`apps/gateway`)

### G1 · Rutas y configuración (D127)

- `src/api/integraciones.controller.ts`: reenvía las 10 rutas una por una a `INTEGRACIONES_URL`, sin composición. Se quita `integraciones{/*ruta}` de `NoImplementadoController`.
- **`configuracion.ts`:** con `NODE_ENV=production`, si `INTEGRACIONES_URL` falta o es inválida, **no se lanza error**. Queda `integracionesUrl: null`, el controlador responde 503 `SERVICIO_NO_DISPONIBLE` y el registro lo dice una sola vez, sin el valor. En desarrollo, el valor por defecto es `http://localhost:3004`. `INTEGRACIONES_TIMEOUT_MS` vale 12000 por defecto.
- **Cuerpo:** 1,5 MB solo para `/v1/integraciones/archivos/*`. Si lo supera, responde 413 `ARCHIVO_MUY_GRANDE` con `ejecucionId: null` y `columnasFaltantes: []`.
- Las escrituras usan el límite de tasa de escritura que ya existe.
- **Pruebas:**
  - Sin `INTEGRACIONES_URL` en producción, `/health` y `/v1/me` funcionan y `/v1/integraciones/estado` da 503.
  - Con una URL inválida, el gateway arranca.
  - `/v1/interno/integraciones/hdu/upsert` desde afuera da 404.
  - Ninguna prueba afirma ya 501 en `/v1/integraciones/*`.
- **Documentación:** `apps/gateway/.env.example`, `apps/gateway/README.md` y `GUIA-VERCEL.md`, con el contenido de la sección «Despliegue», sin secretos. La fila del gateway en la guía dice explícitamente que `INTEGRACIONES_URL` es **opcional**.

## q360-frontend (`apps/web`)

- **F1 · Base.**
  - `src/types/dominio.ts` con los alias nuevos y `src/api/integraciones.ts`, que incluye el mapeo de `SIN_RESPUESTA` (D115): en los POST de sincronización e importación, un error de red, timeout, 502, 504 o 503 `SERVICIO_NO_DISPONIBLE`.
  - Las rutas `/admin/integraciones{,/sincronizar,/importar,/historial}`, `/qe/integraciones` y `/auditor/integraciones`, con `RequireRole`.
  - Los menús de la sección 2.2 del diseño, la 6.ª pestaña del Auditor y los mocks MSW.
- **F2 · Conexión** (E5-F01).
  - Formulario de 3.4. El selector de sprint se alimenta de `GET /v1/catalogos/sprints?celulaId=` (D120) y el de QE de `GET /v1/catalogos/personas?rol=QE&activo=true`.
  - Muestra `token-estado` y `chip-conexion`. El token se vacía después de cada intento (D116).
  - `aviso-integracion-deshabilitada` aparece si `llaveDisponible` es `false`; `aviso-token-no-descifrable`, si `token.descifrable` es `false`.
- **F3 · Sincronizar** (E5-F02).
  - Resultado por tipo (4.4). Las listas se cargan con `GET …/detalle?resultado=` (D113).
  - `boton-continuar` aparece solo con `estado.continuar`.
  - Sugerencias desde `sugerencias[]` (D117).
  - Una ejecución ajena en curso se consulta con `GET estado` cada 3 s, hasta 30 s.
- **F4 · Importar** (E5-F03).
  - Se genera la plantilla CSV en el cliente (D119) y se valida en el cliente la extensión y el tamaño.
  - Vista previa con paginación en el cliente, modo estricto y vincular.
  - Con `INCOMPLETA`, `boton-importar-de-nuevo` usa el archivo en memoria (D118).
- **F5 · Historial.** `VistaHistorial` con `soloLectura`, con las tarjetas «Última ejecución» y «Última completada» (D121), los filtros en la URL, `?ejecucion=` y `filas-ocultas`.
- **F6 · Detalle de HDU.**
  - `seccion-descripcion-hdu` va después del checklist (conflicto 1), con `hdu-origen`. El texto es plano.
  - Si `urlExterna` existe, se muestra «Abrir en Jira» con `rel="noopener noreferrer"` y `target="_blank"`.
  - Si el API no trae `origen`, la sección no se renderiza.
- **F7 · Accesibilidad y responsividad.** axe a 1280 y 375 px sobre las 4 pestañas del Administrador (con datos, vacía, error, indisponible e integración deshabilitada), `/qe/integraciones`, la pestaña del Auditor y `/hdu/:id` con descripción. Cero violaciones `serious` o `critical`, como en E4 (D84).
- **Pruebas unitarias:** el menú del QE y del Administrador; que el token no persista (`localStorage` y `sessionStorage` vacíos); que QE y Auditor no tengan `button[type=submit]` ni `<form>`; el mapeo de `SIN_RESPUESTA`.

## q360-infra (`infrastructure/`, salvo `seed/` y `nube/005`)

- **L1.**
  - `npm run local` levanta Integraciones en el puerto 3004 y agrega `INTEGRACIONES_URL` al gateway.
  - Genera en `services/integraciones/.env` (no se versiona) una `INTEGRACIONES_LLAVE_CIFRADO` aleatoria, una sola vez por máquina (`crypto.randomBytes(32).toString('base64')`), y la conserva si ya existe.
  - Para las pruebas activa `INTEGRACIONES_PERMITIR_HOST_PRUEBA=true`.
  - En Docker Compose, el servicio `integraciones` sale del perfil `e5`.
  - Documenta las instancias I2 a I5 del perfil de QA (sección 10.3 del backlog E5) como comandos de `npm run local`, sin escribir ninguna llave en el repositorio.

## q360-qa (`tests/`, `docs/validacion/`)

- **Q1.**
  - Jira simulado de la sección 10.1 (puerto 4010, modos, `/__control` y `/__solicitudes`, que nunca devuelve el token).
  - `tests/fixtures/e5/`.
  - `contrato.ts` carga también `integraciones.v1.yaml`.
  - Limpieza de la sección 9: borrar las HDU con `origen <> 'MANUAL'` y sus dependientes, y vaciar `integraciones.*`, con el dueño de la base.
- **Casos:** los 102 del backlog E5, incluidos E5-F03-T14 (D118) y E5-B04-T15 (D122, todas las exportaciones). Además, la búsqueda de secretos de E5-B01-T11 y E5-B04-T08 en el registro de **todos** los servicios y del gateway.
- **Regresión:** las pruebas certificadas afectadas de la Corrida E5 (menús, E7-F06-T07, contrato estricto), seguidas de E1–E4 y E7 completas después de la limpieza.

## Lo que se rechaza en revisión

- SQL o llaves foráneas desde `integraciones` hacia `organizacion` (o al revés), o `id_historia` con FK.
- Imports de un servicio a otro, por ejemplo `services/integraciones` importando de `services/organizacion/src`.
- Lógica de dominio en `packages/`: el mapeo, el CSV y el cifrado van en el servicio.
- Autorización por el `rol` del token o por `user_metadata`.
- Un fallo de Jira o de Organización convertido en «0 creadas» con `EXITOSA`, o en una lista vacía: debe ser `FALLIDA`, `INCOMPLETA` o `indisponible`.
- Un dominio que importe Prisma, Nest o `fetch`.
- El token, `Authorization`, `Basic ` o el correo en Base64 en una respuesta, un registro, una tabla o el DOM.
- Una variable de entorno nueva que impida arrancar al gateway o a Integraciones.

## Despliegue (paso a paso para el usuario, sin secretos)

> Antes de empezar: el código de E5 debe estar en `main` de `MatMateDev/Quality360` (un push a `main` redespliega los proyectos existentes). Supabase en la nube se pausa por inactividad: si estuvo detenido, reactívalo en el panel antes del paso 1. Con la base pausada, Integraciones responde 503.

1. **Contraseña del rol de base de datos.**
   - Genera una contraseña de solo letras y números. En PowerShell: `[guid]::NewGuid().ToString('N')`.
   - En Supabase › **SQL Editor**, ejecuta `alter role svc_integraciones with password '<la contraseña>';`.
   - Guárdala en tu gestor de contraseñas: **no la pegues en el chat ni en el repositorio**.
2. **Migraciones**, en este orden y antes de publicar el código. En el SQL Editor, cada una va precedida de `set local search_path to <esquema>;`:
   1. `services/organizacion/prisma/migrations/20261029000000_e5_origen_hdu/migration.sql` (esquema `organizacion`).
   2. `services/integraciones/prisma/migrations/20261029000000_e5_integracion_jira/migration.sql` (esquema `integraciones`).
   3. `infrastructure/nube/005_rls_integraciones_nube.sql`.
3. **Llave de cifrado.**
   - Genérala en tu computador. Con Node: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`. En PowerShell 7: `$b=[byte[]]::new(32); [Security.Cryptography.RandomNumberGenerator]::Fill($b); [Convert]::ToBase64String($b)`.
   - Debe tener 44 caracteres y terminar en `=`.
   - Cópiala directo a Vercel (paso 4). No la guardes en archivos del repositorio, no la pegues en el chat y no uses la del `.env` local.
4. **Proyecto `quality360-integraciones` en Vercel.**
   - En vercel.com/new importa `MatMateDev/Quality360`, con **Root Directory** `services/integraciones`.
   - Agrega estas variables **antes** de Deploy:

| Variable | Valor |
| --- | --- |
| `DATABASE_URL` | `postgresql://svc_integraciones.<idProyecto>:<contraseña del paso 1>@<HOST del pooler>:6543/postgres?schema=integraciones&pgbouncer=true&connection_limit=1` |
| `SUPABASE_URL` | `https://<idProyecto>.supabase.co` |
| `ORGANIZACION_URL` | URL real de `quality360-organizacion` |
| `INTEGRACIONES_LLAVE_CIFRADO` | La del paso 3. Solo en el entorno **Production**, marcada como *Sensitive* |
| `INTEGRACIONES_PRESUPUESTO_MS`, `JIRA_TOPE_ISSUES`, `JIRA_TIEMPO_LIMITE_MS`, `JIRA_ESPERA_MAX_429_MS` | Solo si cambias los valores por defecto (8000, 100, 3000 y 3000) |

   - **No** agregues `NODE_ENV` (Vercel lo define), `INTEGRACIONES_PERMITIR_HOST_PRUEBA` ni `PERMITIR_CARGA_SEMILLA`.
   - Pulsa Deploy y copia la URL de producción.
5. **Gateway.** En `quality360-gateway`, agrega `INTEGRACIONES_URL` con la URL del paso 4 (y, si quieres, `INTEGRACIONES_TIMEOUT_MS=12000`). Después ve a **Deployments › Redeploy**. Si te olvidas de esta variable, el portal sigue funcionando y solo «Integraciones» muestra «No disponible».
6. **Verificación sin sesión:**
   - `https://<integraciones>/health` → `{"estado":"ok"}`.
   - `https://<gateway>/v1/integraciones/estado` → 401 `NO_AUTENTICADO`. Si responde 501, el gateway desplegado es anterior a E5; si responde 503, falta o está mal `INTEGRACIONES_URL`.
   - `https://<gateway>/v1/interno/integraciones/hdu/upsert` → 404.
7. **Verificación con sesión.**
   - Como Administrador, abre «Integraciones». Si aparece «La integración no está habilitada en el servidor», falta la llave o es inválida (paso 3 y Redeploy de `quality360-integraciones`).
   - Como QE, abre «Integraciones» en el menú: ves el historial sin botones.
8. **Opcional, Jira real (E5-MAN-01).**
   - Crea un API token en id.atlassian.com › Security › API tokens, con una cuenta del equipo en un sitio gratuito de Jira Cloud.
   - Escríbelo **solo** en el campo del portal: queda cifrado y se ve como «Configurado · termina en XXXX».
   - Si algún día cambias la llave del paso 3, el portal pedirá volver a ingresar el token (`TOKEN_NO_DESCIFRABLE`).
