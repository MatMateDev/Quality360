# Quality360 · Decisiones de arquitectura del MVP (E1 y E2)

Fuentes: `Quality360_Informe_Arquitectura` (Revisión 2), `docs/arquitectura/Quality360_documento_modelos.html` y `docs/backlog/historias-quality360.md` (generado desde `docs/backlog/Historias_de_usuario_Quality360.xlsx`).
Precedencia: backlog (criterios de aceptación) > informe > este archivo.

## Alcance de esta corrida

- **E1 · Acceso, portales y organización QA:** 24 HDU (F01–F12, B01–B12).
- **E2 · Gestión de HDU:** 8 HDU (F01–F04, B01–B04).
- **Total:** 32 HDU y 96 escenarios. Cada escenario es un criterio verificable y todos se implementan.
- **Fuera de alcance:** E3 a E6. Certificaciones, Impedimentos e Integraciones existen como servicios desplegables; Integraciones además hace la carga semilla.

## Decisiones

| ID | Decisión | Motivo |
| --- | --- | --- |
| D1 | Monorepo con npm workspaces | El equipo ya usa npm; contratos y CI en un solo repo |
| D2 | Backend: NestJS 11 + TypeScript, un proyecto por servicio | Los módulos Nest calzan con api / aplicación / dominio / infraestructura; OpenAPI nativo |
| D3 | Identidad: Supabase Auth. Datos: Postgres de Supabase con 4 esquemas y 4 roles | Informe p. 11 |
| D4 | Rol y estado activo viven en `organizacion`, no en el token | `user_metadata` es editable por el usuario; Supabase solo autentica |
| D5 | ORM: Prisma, con schema y migraciones por servicio | Las migraciones pertenecen al servicio propietario (p. 12) |
| D6 | Frontend: Vite + React 19 + TypeScript, React Router y TanStack Query | Migra el prototipo `src/` |
| D7 | Contratos OpenAPI 3.1 en `contracts/`; tipos del front con openapi-typescript | Informe p. 12 |
| D8 | Local: Supabase CLI (`npx supabase start`) + Docker Compose. Nube después | Topología de la p. 11 |
| D9 | Las HDU, células, sprints, asignación de analista e historial de E2 viven en **Organización y seguimiento** | El informe le asigna la organización de HU y sprints. Los ciclos de certificación llegan con E3 a Certificaciones |
| D10 | Estados de HDU: `PENDIENTE → DISENO_PRUEBAS → EN_EJECUCION → PENDIENTE_CIERRE → CERRADA`, más la reapertura `PENDIENTE_CIERRE → EN_EJECUCION` | E2-B02. Solo avanza un paso; `CERRADA` es terminal |
| D11 | Pasar a `CERRADA` exige el checklist completo, consultado por API a Certificaciones. En esta corrida esa consulta responde «indisponible», así que el cierre se rechaza con un mensaje explícito | E2-B02 escenario 3, sin inventar datos de E3 |
| D12 | Acceso fuera del ámbito: **403 `ACCESO_DENEGADO`** con mensaje genérico | E2-F04 escenario 2 pide «acceso denegado» |
| D13 | Construcción y certificación con **Supabase local**. El proyecto en la nube (`ufdnrrpeznwyargzgopu`) se conecta al final: las migraciones se aplican vía el MCP de Supabase (`.mcp.json`) una vez que el usuario lo autentica, y las claves de nube quedan solo en su `.env` | Las pruebas de QA crean y desactivan usuarios de forma repetida y no deben tocar el proyecto real |
| D14 | Entrega en `MatMateDev/Quality360` (remoto `quality360`): push de la rama certificada como `main`, solo después del dictamen de `q360-qa` | Decisión del usuario; el remoto está vacío |

## Reglas de dominio del backlog

- **Supervisión:** máximo un QE vigente por analista. Cambiar el QE exige un **motivo** y conserva el historial con fechas y motivos (E1-F10, E1-B09).
- **Ámbito de HDU (E2-B03):**
  - Un Analista QA ve las HDU donde `analistaId` es él.
  - Un QE ve las HDU donde es el QE responsable o cuyo analista supervisa hoy.
  - Un Administrador ve todas.
- **Asignación de analista (E2-F02):** solo analistas del equipo vigente del QE. Reasignar pide confirmación y motivo, y queda en el historial.
- **Unicidad (E2-B01):** el código de la HDU es único; la creación guarda célula, sprint, prioridad, QE creador y fecha.
- **Auditoría:** todo cambio de usuario, rol, supervisión, estado o asignación registra el valor anterior, el nuevo, el actor y la fecha (E1-B12, E2-B04).
- **Células y sprints** son catálogos que carga la semilla; su CRUD no está en el backlog.

## Reglas no negociables (informe pp. 8-9 y 13)

1. Sin SQL entre esquemas. Cada servicio usa su propio rol de Postgres y ningún esquema se expone en la Data API de Supabase.
2. Autenticar no es autorizar: el gateway verifica la sesión y cada servicio valida rol, usuario activo y ámbito.
3. Las referencias entre servicios usan UUID y contrato, nunca claves foráneas.
4. Fuente caída no es cero: cada bloque compuesto se marca `ok` o `indisponible`, y el portal distingue cargando, error, vacío e indisponible.
5. El error de login es genérico.
6. Los secretos van solo en `.env`, que no se versiona. El front recibe únicamente la URL y la clave pública de Supabase.

## Sesión e identidad: login, cierre de sesión y recuperación

Verificado contra Supabase Auth local (GoTrue v2.196.0, CLI 2.117.0) el 2026-10-15. Pruebas: `tests/api/e1-b01-credenciales.spec.ts`, `tests/api/e1-b11-sesion.spec.ts` y `tests/api/recuperacion-contrasena.spec.ts`.

### Errores de acceso y mensaje del portal

| Situación | Respuesta real | Tipo en el portal |
| --- | --- | --- |
| Contraseña incorrecta | Auth `400 invalid_credentials` | CREDENCIALES |
| Correo inexistente | Auth `400 invalid_credentials`, con el mismo cuerpo que el caso anterior | CREDENCIALES |
| Correo sin confirmar | Auth `400 email_not_confirmed` solo con la clave correcta; con una incorrecta, `invalid_credentials` | CREDENCIALES |
| Usuario baneado en Auth | Auth `400 user_banned`, **también con clave incorrecta** | CREDENCIALES |
| Usuario desactivado en Organización | Auth `200` (crea sesión) y `/v1/me` `403 ACCESO_DENEGADO` | CREDENCIALES |
| Cuenta en Auth sin registro en Organización | `/v1/me` `403 ACCESO_DENEGADO`, con el mismo cuerpo que el desactivado | CREDENCIALES |
| Sin token o token inválido | `/v1/me` `401 NO_AUTENTICADO` | CREDENCIALES |
| Token vencido | `/v1/me` `401 SESION_EXPIRADA` | Sesión expirada (vuelve al login) |
| Límite de intentos superado | Auth `429 over_request_rate_limit` (en local no ocurre; ver abajo) | DEMASIADOS_INTENTOS |
| Red caída, status 0 o 5xx | — | SERVICIO_NO_DISPONIBLE |

Mensajes:

- **CREDENCIALES:** «Correo o contraseña incorrectos, o acceso no habilitado.»
- **DEMASIADOS_INTENTOS:** «Demasiados intentos de ingreso. Espera unos minutos antes de volver a intentarlo.»
- **SERVICIO_NO_DISPONIBLE:** «No pudimos conectar con el servicio de autenticación. Revisa tu conexión e inténtalo de nuevo.»

### Límite de intentos (E1-B01#3)

- **Local:** `[auth.rate_limit]` define `sign_in_sign_ups = 30` cada 5 min por IP (la CLI lo pasa como `GOTRUE_RATE_LIMIT_OTP`) y `token_refresh = 150`. Pero Supabase CLI 2.117 no define `GOTRUE_RATE_LIMIT_HEADER`, y sin esa variable GoTrue no aplica límites por IP. Observado: 40 intentos fallidos seguidos desde la misma IP respondieron todos 400, ninguno 429. En local, el escenario es **NO VERIFICABLE**: la prueba `@limite-intentos` se omite y deja la razón.
- **Nube (`ufdnrrpeznwyargzgopu`):** no se consultó, porque esta corrida no usa el panel ni secretos de la nube. El límite se configura en **Auth › Rate Limits** («sign-ups and sign-ins» y «token refreshes», por IP cada 5 min). Al superarlo, Auth responde `429 over_request_rate_limit` exista o no el correo. Confirma el valor en el panel.
- Donde el límite sí se aplique, la prueba usa una IP simulada (`X-Forwarded-For`). Si llegara a bloquear la IP real, el contador vive en la memoria de Auth: espera 5 min o reinicia el contenedor (`docker restart supabase_auth_quality360`).

### Cierre de sesión y revocación (E1-B11)

- `signOut()` del portal usa alcance global: revoca la renovación de todas las sesiones del usuario (`refresh_token_not_found`), y el proveedor deja de reconocer la sesión (`GET /auth/v1/user` → `403 session_not_found`).
- El gateway verifica el JWT localmente con JWKS, así que el access token ya emitido sigue respondiendo 200 en `/v1/me` hasta su `exp` (`jwt_expiry` = 3600 s). Es el alcance documentado en `apps/gateway/README.md`. Mitigación: TTL corto en la nube.
- Desactivar a un usuario en Organización **no** lo banea en Supabase Auth. Puede iniciar sesión y renovar en el proveedor, pero todo `/v1/*` le responde 403 (D4, E1-B07#3).
- Cambiar la contraseña revoca la renovación de las demás sesiones del usuario.

### Recuperación de contraseña (E1-F13, E1-B13)

- **Portal:** `/recuperar-contrasena` llama a `resetPasswordForEmail(correo, { redirectTo: origin + "/restablecer-contrasena" })`. `/restablecer-contrasena` llama a `updateUser({ password })` y luego a `signOut()`.
- **Local (verificado):**
  - `additional_redirect_urls` de `infrastructure/supabase/config.toml` admite `/restablecer-contrasena` en `127.0.0.1` y `localhost`, puertos 5173 y 8080.
  - El correo llega a Mailpit (`54324`). `max_frequency = "1s"` y, con el SMTP local, el envío de correos no tiene un tope práctico.
  - `/recover` responde `200 {}` tanto para un correo registrado como para uno inexistente.
  - El enlace sirve una sola vez; al segundo uso, `#error_code=otp_expired`.
  - Un `redirectTo` que no está en la lista cae al `site_url`, así que no hay redirección abierta.
- **Contrato para el portal:** si se reenvía dentro de `max_frequency` (60 s por defecto en la nube), un correo **registrado** recibe `429 over_email_send_rate_limit`, mientras que uno inexistente siempre recibe 200. El portal debe mostrar la misma confirmación neutra en ambos casos; si muestra «demasiados intentos», revela que la cuenta existe.
- **Nube (pendiente, no aplicado):**
  1. **Auth › URL Configuration › Site URL:** `https://quality360-one.vercel.app`.
  2. **Auth › URL Configuration › Redirect URLs:** agregar `https://quality360-one.vercel.app/restablecer-contrasena`.
  3. **Auth › SMTP Settings:** configurar un SMTP propio. El SMTP por defecto de Supabase solo entrega a los miembros del equipo del proyecto y tiene un límite bajo por hora, así que sin SMTP propio la recuperación no llega a los usuarios reales.
  4. **Auth › Rate Limits:** ajustar los correos por hora a la capacidad del SMTP elegido.

## Estructura y dueños

```
apps/web/                   q360-frontend
apps/gateway/               q360-seguridad-gateway
packages/auth-nest/         q360-seguridad-gateway
services/organizacion/      q360-backend
services/certificaciones/   q360-backend
services/impedimentos/      q360-backend
services/integraciones/     q360-integraciones
contracts/, docs/arquitectura/adr/, archivos raíz   q360-arquitecto
infrastructure/, .github/workflows/                  q360-infra   (infrastructure/seed/ lo escribe q360-integraciones)
tests/, docs/validacion/                             q360-qa
```

## Puertos locales

- Portal web: `5173` en desarrollo, `8080` en Compose.
- Gateway: `3000`. Servicios internos: `3001` a `3004`, sin publicarse en Compose.
- Supabase: API `54321`, base de datos `54322`, Studio `54323`.

## Forma de trabajo de los agentes

- **Ola 0:** `q360-arquitecto`, en el árbol principal. Se hace commit al terminar.
- **Ola 1a**, en worktrees aislados y en paralelo: `q360-infra`, `q360-seguridad-gateway` y `q360-frontend`.
- **Ola 1b**, en worktrees: `q360-backend` y luego `q360-integraciones`.
- **Ola 2:** `q360-qa` certifica en el árbol principal, con el stack levantado.
- **Reglas:**
  - Cada agente escribe solo en sus carpetas y hace commit en su rama con el prefijo `[q360-<agente>]`. Nunca hace push.
  - `npm install` va siempre con `--workspace <tu-workspace>`.
  - Las credenciales de demo son solo locales y se documentan en `infrastructure/seed/mvp/README.md`.

## Certificación (gate de `q360-qa`)

- Cada escenario tiene al menos una prueba automatizada con su ID en el nombre, por ejemplo `[E1-F01#2]`.
- **Dictamen por HDU:**
  - `CERTIFICADA` si todos sus escenarios pasan en una ejecución real.
  - `OBSERVADA` si alguno falla.
  - `NO VERIFICABLE` si falta la condición previa, con la razón.
- Cada defecto se asigna al agente dueño, que lo corrige. `q360-qa` vuelve a ejecutar lo que falló, con un máximo de 3 rondas. El resultado queda en `docs/validacion/certificacion-e1-e2.md`.

## Trazabilidad

| Capacidad | Frontend | Backend |
| --- | --- | --- |
| Inicio de sesión | E1-F01 | E1-B01, B02 |
| Portal e inicio QE | E1-F02, F03 | E1-B02, B03 |
| Equipo supervisado | E1-F04 | E1-B04 |
| Portal e inicio QA | E1-F05, F06 | E1-B02, B05 |
| Portal e inicio administrativo | E1-F07, F08 | E1-B02, B06 |
| Usuarios y roles | E1-F09 | E1-B07, B08, B12 |
| Supervisión | E1-F10 | E1-B09, B12 |
| Perfil | E1-F11 | E1-B10 |
| Cierre de sesión | E1-F12 | E1-B11 |
| Registro de HDU | E2-F01 | E2-B01 |
| Asignación de analista | E2-F02 | E2-B03, B04 |
| Listado y filtros | E2-F03 | E2-B03 |
| Detalle y estados | E2-F04 | E2-B02, B04 |

---

# Corrida E3 · Certificación y entregables

- **Alcance:** 8 HDU (E3-F01–F04, E3-B01–B04) y 24 escenarios, en `services/certificaciones`, con los ajustes que necesitan Organización, el gateway y el portal.
- **Precedencia:** igual que en E1 y E2. Las decisiones D15–D22 las tomó el usuario el 2026-09-17, o se derivan de ellas.

## Decisiones

| ID | Decisión | Motivo |
| --- | --- | --- |
| D15 | Los 10 entregables vienen del prototipo, en este orden: `PLAN_PRUEBAS`, `DASHBOARD`, `CASOS_PRUEBA`, `APROBACION_CASOS`, `EJECUCION`, `EVIDENCIAS`, `DEFECTOS`, `APROBACION_UAT`, `CERTIFICADO`, `CIERRE_PRUEBAS` | Lista usada por el equipo en `src/App.jsx` |
| D16 | **Todos** los entregables requieren aprobación del QE. Estados: `PENDIENTE → POR_APROBAR → APROBADO`. Un rechazo vuelve a `PENDIENTE` con observaciones. «Completo» significa `APROBADO` y el porcentaje es `aprobados / 10` | Decisión del usuario (E3-F03, E3-B02#3) |
| D17 | **Orden secuencial estricto:** el entregable N solo se marca si el N-1 está `APROBADO`. Desmarcar N exige que N+1 esté `PENDIENTE` y un motivo | Decisión del usuario (E3-F02#2, E3-B02#1) |
| D18 | **Permisos por relación con la HDU** (`/v1/interno/hdu/{id}/acceso` de Organización):<br>• Marcar o desmarcar: `ANALISTA_ASIGNADO`.<br>• Aprobar, rechazar o generar el certificado: `QE_RESPONSABLE`.<br>• Ver el checklist, la bitácora o el certificado: cualquier relación permitida.<br>• Fuera de ámbito: 403 (D12). | E3-F01#3, E3-B01#3, E3-B02#2 |
| D19 | **El certificado (PDF) completa el entregable 9:** con los entregables 1–8 aprobados, el QE responsable lo genera. Se crea un folio único `Q360-AAAA-XXXXXXXX` y el entregable 9 queda aprobado por ese QE. Luego se marca y aprueba el 10 y la HDU puede cerrarse (D11). El certificado es inmutable: tiene uno por HDU, se vuelve a descargar el mismo y no se puede desmarcar el 9 | Decisión del usuario; resuelve la circularidad de E3-F04 |
| D20 | **Evidencia:**<br>• Puede ser un enlace `https`, o un archivo PDF, PNG o JPEG de hasta 10 MB.<br>• Los archivos van al bucket privado `evidencias` de Supabase Storage con una URL de subida firmada que emite Certificaciones, sin pasar por el gateway ni por Vercel.<br>• Los PDF de certificados van al bucket privado `certificados`.<br>• Las descargas usan URL firmadas de corta duración. | Decisión del usuario; Vercel limita los cuerpos a 4,5 MB |
| D21 | **Verificación pública:** `GET /v1/certificados/{folio}/verificacion` no requiere sesión. Devuelve la HDU (código y título), la fecha de emisión, la validez y la huella SHA-256 del PDF. Un folio desconocido responde 404 | E3-B03#2 |
| D22 | **Bitácora:** tabla de solo inserción `evento_checklist` con actor, fecha, valor anterior y nuevo, y motivo o comentario. Cubre marcar, desmarcar, aprobar, rechazar y generar el certificado. Una HDU `CERRADA` no admite cambios en su checklist (409) | E3-B04 |

## Trazabilidad E3

| Capacidad | Frontend | Backend |
| --- | --- | --- |
| Ver checklist y avance | E3-F01 | E3-B01, B02 |
| Marcar, desmarcar y evidencia | E3-F02 | E3-B01, B02, B04 |
| Aprobar o rechazar y bandeja del QE | E3-F03 | E3-B02, B04 |
| Certificado PDF y verificación | E3-F04 | E3-B03, B04 |

## Efectos de E3 sobre E1 y E2

- **E2-B02#3 y E2-F04#1:** desde E3, Certificaciones responde el checklist. Una HDU sin los 10 entregables aprobados se rechaza al cerrar con 409 `CHECKLIST_INCOMPLETO` y el detalle muestra el avance real. `CHECKLIST_NO_DISPONIBLE` queda solo para cuando Certificaciones no responde. Así lo anticipaba ADR 0011.
- **E1-F02#3:** el menú del QE no cambia. La bandeja de aprobaciones (E3-F03#3) se abre desde **Accesos rápidos** del inicio del QE (`/qe/aprobaciones`).
- **Verificación pública:** `/verificar/{folio}` en el portal no exige sesión (D21).

---

# Corrida modelo de datos · Tablas según el modelo ER y lógico

Fuentes: `docs/arquitectura/modelo-datos/modelo-er-quality360.pdf` (modelo relacional) y `docs/arquitectura/modelo-datos/modelo-logico-quality360.pdf`. Precedencia: reglas no negociables del informe > modelo de datos > este archivo.

## Decisiones

| ID | Decisión | Motivo |
| --- | --- | --- |
| D23 | Las tablas y columnas toman los nombres del modelo de datos (`historia_usuario`, `id_usuario`, `email`, `fecha_desde`…). Los campos de Prisma conservan los nombres del código con `@map`, así que la API no cambia | Fidelidad al modelo sin reescribir portal, gateway ni contratos |
| D24 | Cada entidad vive en el esquema de su servicio, con todas sus llaves foráneas **dentro** del esquema. Las 3 relaciones del modelo que cruzan servicios quedan como UUID sin llave foránea: `certificacion.id_historia`, `asignacion_certificacion.id_usuario` e `impedimento.id_certificacion` | Regla no negociable 3 (sin SQL ni llaves foráneas entre esquemas) |
| D25 | Llaves primarias UUID, no INTEGER | Coherencia con Supabase Auth (`usuario.id_usuario` = `sub`) y con las tablas existentes; IDs no adivinables en las URL |
| D26 | Ajustes al modelo: `CHAR(1)` → `boolean`; `TIMESTAMP` → `timestamptz`; `Supervision.fecha_desde/hasta` en `timestamptz` (no `DATE`) para ordenar el historial; `ItemChecklist.nombre` es texto (el modelo dice INTEGER); `Entregable.idcertificacion` → `id_certificacion`; en `AccionImpedimento`, cuyos tipos se ven cortados en el diagrama, `descripcion` y `observacion` son `VARCHAR(500)` y `estado` `VARCHAR(30)`; `HistoriaUsuario.prioridad` es obligatoria (E2-B01) | Tipos de Postgres y errores menores del diagrama |
| D27 | Los estados que ya gobierna el código usan enum de Postgres (`EstadoSprint`, `EstadoCertificacion`, estados de HU y entregable). Los de tablas sin funcionalidad (`ejecucion_prueba.resultado`, `defecto.severidad/estado`, `impedimento.tipo/estado`, `accion_impedimento.estado`) quedan como `VARCHAR` del largo del modelo: sus valores se fijan con la épica que los use | No inventar reglas que el backlog aún no define |

## Distribución y relaciones

| Entidad del modelo | Esquema.tabla | Llaves foráneas |
| --- | --- | --- |
| Rol | `organizacion.rol` | — |
| Usuario | `organizacion.usuario` | `id_rol` → rol |
| Supervision | `organizacion.supervision` | `id_supervisor`, `id_supervisado` → usuario |
| Celula | `organizacion.celula` | — |
| Sprint | `organizacion.sprint` | `id_celula` → celula |
| HistoriaUsuario | `organizacion.historia_usuario` | `id_celula` → celula |
| HistoriaSprint | `organizacion.historia_sprint` | `id_historia` → historia_usuario; `id_sprint` → sprint (opcional, como en el modelo) |
| Certificacion | `certificaciones.certificacion` | `id_historia`: UUID de Organización, sin llave foránea |
| AsignacionCertificacion | `certificaciones.asignacion_certificacion` | `id_certificacion` → certificacion; `id_usuario`: UUID de Organización |
| ItemChecklist | `certificaciones.item_checklist` | `id_certificacion` → certificacion |
| Entregable | `certificaciones.entregable` | `id_certificacion` → certificacion; `id_item_checklist` → item_checklist (extensión) |
| Evidencia | `certificaciones.evidencia` | `id_entregable` → entregable |
| EjecucionPrueba | `certificaciones.ejecucion_prueba` | `id_certificacion` → certificacion |
| Defecto | `certificaciones.defecto` | `id_certificacion` → certificacion |
| Impedimento | `impedimentos.impedimento` | `id_certificacion`: UUID de Certificaciones |
| AccionImpedimento | `impedimentos.accion_impedimento` | `id_impedimento` → impedimento |

Tablas que no están en el modelo y se conservan porque las exige el backlog: `hdu_historial_estado`, `hdu_historial_asignacion` y `auditoria` (E1-B12, E2-B04); `evento_checklist` y `certificado` (E3-B03, E3-B04). Columnas de extensión: las de autoría y auditoría (`*_por_*`, `actualizado_en`, `motivo`), `historia_usuario.codigo_normalizado`, `qe_responsable_id` y `analista_id` (E2), `item_checklist.clave` y `entregable.clave` (D15).

## Reglas que agrega el modelo

- **Rol:** catálogo de 3 filas que carga la migración; `usuario.id_rol` reemplaza al enum.
- **Sprint de una HU:** vive en `historia_sprint`; el vigente es el que no tiene `fecha_retiro` (índice único parcial). Cada sprint pertenece a una célula y su estado se deduce de las fechas al cargarlo. Que el sprint de una HU sea de su misma célula aún no se exige: el backlog no lo pide y la semilla comparte sprints entre células.
- **Ciclo de certificación:** el primer cambio de un entregable crea la certificación (ciclo 1) con sus 10 ítems y 10 entregables en estado PENDIENTE. Hay un solo ciclo activo por HU (índice único parcial). Pasa a `COMPLETADA`, con `fecha_fin`, cuando los 10 entregables están aprobados.
- **Evidencia:** cada marca agrega una fila. La vigente es la última cargada desde que se marcó (`fecha_carga >= completado_en`); al rechazar o desmarcar deja de estar vigente, pero se conserva.
- **Asignación de certificación:** el analista que marca o desmarca queda como el asignado vigente del ciclo; si cambia, la asignación anterior se cierra con `fecha_hasta`.
- **Largos del modelo en la API:** el correo admite 150 caracteres (antes 254) y el enlace de evidencia 500 (antes 2000). La carga semilla de sprints exige `celulaId`.

---

# Corrida E7 · Bandejas por rol

- **Alcance:** 11 HDU (E7-F01–F07, E7-B01–B04) y 33 escenarios. Fuente: `docs/backlog/e7-bandejas-por-rol.md` (reglas, fixture y 100 casos); los escenarios también están en `docs/backlog/historias-quality360.md` para `npm run contracts:check`. Diseño: `docs/diseno/e7-bandejas-por-rol.md`.
- **Decisiones del usuario (2026-10-21):** el Líder QA es dueño de células: ve todas las HDU de las células que le asigna el Administrador, solo lectura, no aprueba ni exporta. El Auditor lee todo y exporta CSV. Un rol por usuario. El Administrador asigna rol y células.
- **D28–D40** están en el backlog E7 y se mantienen. Las precisiones están en D43 (sobre D40) y D50 (sobre el texto del backlog).
- **Precedencia:** igual que en E1 y E2.
- **Reparto:** `docs/arquitectura/e7-plan-construccion.md`. **ADR:** `adr/0013-bandejas-por-rol-y-roles-de-lectura.md`.

## Decisiones

| ID | Decisión | Motivo |
| --- | --- | --- |
| D41 | **Acceso a un portal ajeno.** Se muestra «No tienes acceso a esta sección» con «Ir a mi bandeja» en la **URL pedida**, dentro del `Layout`. No se redirige y no se hace ninguna petición de datos: el guard actúa antes de montar la página. Sin sesión: login y luego la bandeja propia, aunque la ruta pedida fuera de otro rol. Las pruebas certificadas que esperan la redirección se reescriben (lista abajo). | E7-F01#3 y conflicto 1 del diseño. E1-F02#2 y E1-F05#3 aceptan «acceso denegado o redirección», así que el escenario sigue cumplido; solo cambia lo que afirman las pruebas |
| D42 | **El cambio de rol es atómico.** `PUT /v1/usuarios/{id}/rol` y `POST /v1/usuarios` aceptan `celulaIds` opcional, solo con `rol: LIDER_QA`. Rol, células y auditoría (`CAMBIAR_ROL` y `ASIGNAR_CELULAS_LIDER`) se aplican en **una transacción** que bloquea la fila del usuario (`SELECT … FOR UPDATE`), o no se aplica nada. `celulaIds` no vacío con otro rol → 400. `PUT /v1/usuarios/{id}/celulas-lider` sigue existiendo para cambiar las células de un Líder vigente. El aviso `aviso-parcial` del diseño ya no hace falta | E7-F07#2 («ningún cambio parcial»), conflicto 4 |
| D43 | **El 409 `RELACIONES_INCOMPATIBLES` trae detalles estructurados.** `relaciones` siempre trae 4 campos y los informa todos a la vez, no solo el primero que falla: `analistasVigentes`, `supervisorVigente`, `hduAbiertas {total, items ≤ 20}` (código, título y estado) y `celulasVigentes`. El orden de validación es: catálogo (400) → célula existente (422) → último administrador (409) → relaciones (409). D40 aplica al **cambio de rol**; la desactivación conserva la regla certificada de E1-B07 (solo QE con analistas) | Conflicto 5. El portal arma «tiene N HDU abiertas…» sin otra consulta |
| D44 | **Los parámetros de preselección son aditivos y solo del portal:**<br>• `/admin/usuarios?usuario=<id>&rol=<ROL>&nuevo=1`<br>• `/admin/supervision?analista=<id>` o `?qe=<id>`<br>• `/qe/aprobaciones?hdu=<id>`<br>Sin parámetro, la pantalla es la certificada. Un id inexistente o inválido muestra un aviso, nunca un error ni un 403. Para soportarlos se agregan `GET /v1/usuarios/{id}` y `Usuario.celulasVigentes` (también en el listado: resuelve el conflicto 11 sin consultas por fila) | Conflictos 7, 11 y 12 |
| D45 | **Catálogos que faltaban:**<br>• **Validez del certificado:** booleano `valido`, con el mismo valor que la verificación pública del folio (D21). No hay revocación en el alcance, así que hoy siempre es `true`; el portal muestra «Válido» o «No válido».<br>• **Operación de auditoría:** `AccionAuditoria` suma `ASIGNAR_CELULAS_LIDER` y `EXPORTAR`, y `EntidadAuditoria` suma `EXPORTACION`. La «auditoría de usuarios» abarca las entidades `USUARIO`, `SUPERVISION` y `EXPORTACION` (enum `OperacionAuditoriaUsuarios`). Las etiquetas en español están en `comun.v1.yaml`.<br>• **Acción de bitácora:** enum `AccionChecklist` con códigos estables. El Auditor ve el infinitivo (Marcar, Desmarcar, Aprobar, Rechazar, Certificar) y el historial de la HDU, el pasado | Conflicto 10 |
| D46 | **Las bandejas se componen en Organización.** El gateway solo reenvía `/v1/bandeja/*`. Organización calcula sobre su ámbito y pide el estado del checklist en lote con `POST /v1/interno/checklist/estados` de Certificaciones (token propagado, 2 s). Si Certificaciones no responde:<br>• Sus contadores y el `seguimiento` de cada fila vienen `indisponible` y la respuesta es 200.<br>• Un **filtro** que depende de Certificaciones (`soloConObservaciones`, `tipoAccion` distinto de `ASIGNAR`, `certificado`) deja la lista `indisponible`, nunca la devuelve sin filtrar.<br>• Un **orden** que depende de Certificaciones cae a un orden de respaldo, que se informa en `orden`.<br>• En la del QE solo vienen las acciones `ASIGNAR`, con `calculoParcial: true`.<br>El resumen de equipo del QE sigue en `GET /v1/inicio/qe` | El backlog asigna la bandeja a Organización (E7-B03). Ordenar, filtrar y paginar con datos de ambos servicios no cabe en un gateway sin dominio. Regla no negociable 4 |
| D47 | **Ámbitos de lectura internos que usa Certificaciones.** Cada servicio autoriza por sí mismo:<br>• `GET /v1/interno/acceso` suma `ambito.celulasIds`.<br>• `GET /v1/interno/hdu/{id}/acceso` suma `LECTOR_CELULA` y `LECTOR_AUDITORIA`, que no habilitan ninguna escritura.<br>• `GET /v1/interno/hdu/ambito` (nuevo): `{todas, hduIds}`, para autorizar lotes con una sola llamada.<br>• `POST /v1/interno/hdu/consulta` (nuevo): datos de hasta 1000 HDU, para la bitácora global.<br>Un id fuera de ámbito en un lote → 403 completo, sin datos parciales. `/v1/auditor/*` exige `rol: AUDITOR`: el Administrador recibe 403 | Reglas no negociables 1–3; E7-B02, E7-B04#2 |
| D48 | **Cada servicio exporta lo suyo.**<br>• Organización: `hdu` y `auditoria-usuarios`. Certificaciones: `bitacora` y `certificados`, que registra en Organización con `POST /v1/interno/auditoria/exportaciones` (token del Auditor) **antes** de entregar el archivo; si el registro falla, 503 sin CSV.<br>• CSV en UTF-8 con BOM, separador `;`, fechas ISO 8601 en UTC y cabecera `X-Q360-Filas`. Sin coincidencias, solo el encabezado.<br>• El límite es configurable (`EXPORTACION_LIMITE_FILAS`, 50.000 por defecto) para E7-B04-T11.<br>• Exportar HDU exige Certificaciones (avance y certificado): si no responde, 503 | D35; auditoría sin escribir en esquemas ajenos |
| D49 | **Parámetros de bandejas y consultas:** `celulaId`, `sprintId`, `estado`, `qeId`, `analistaId`, `q` (mínimo 2 caracteres), `orden=columna:asc\|desc`, `pagina` y `tamanoPagina` (25 por defecto; si pasa de 100 se recorta, sin error, y la respuesta informa el tamaño efectivo). La URL del portal conserva `?celula=`, `?tamano=`, etc., y `src/api` hace la conversión | Convención de `comun.v1.yaml` (corrige `celula`/`tamano` del backlog E7-B03) |
| D50 | **Correcciones al texto del backlog E7, ya aplicadas en `e7-bandejas-por-rol.md`:**<br>• Un rol fuera del catálogo responde **400 `VALIDACION`**, no 422, como en la E1-B08#1 certificada (E7-B01#2, T03).<br>• E7-B04-T04 filtra con `operacion=CAMBIAR_ROL`.<br>• Una fuente caída en `/v1/auditor/*` responde **503 `SERVICIO_NO_DISPONIBLE`**; no se crea `FUENTE_NO_DISPONIBLE`.<br>• Se mantiene `GET /v1/roles`.<br>• Para el Auditor, una HDU inexistente responde 404, como para el Administrador; para el Líder, 403 | Coherencia con lo certificado y con `comun.v1.yaml` |
| D51 | **Pendientes del Administrador:** 4 tipos, solo con usuarios activos y células activas. Cada uno tiene su destino:<br>• Analista sin QE → `/admin/supervision?analista=<id>`<br>• QE sin analistas → `/admin/supervision?qe=<id>`<br>• Líder sin células → `/admin/usuarios?usuario=<id>`, con el diálogo de células abierto<br>• Célula sin líder → `/admin/usuarios?rol=LIDER_QA` (no hay pantalla de células)<br>«Últimos cambios» = las 10 entradas más recientes de la auditoría de usuarios | Conflictos 6 y 8. El contador certificado «Analistas sin supervisor» y `analistas-sin-qe` son el mismo dato |
| D52 | **Modelo de datos.** Se agregan 2 filas de rol y la tabla `organizacion.celula_lider`, con llaves foráneas solo dentro de `organizacion` y vigencia por índice único parcial (detalle abajo). Que el usuario sea `LIDER_QA` se valida en la aplicación, dentro de la misma transacción, no con un trigger. En Certificaciones solo se agregan índices de lectura global | D24, D30; reglas no negociables 1 y 3 |
| D53 | **Alcance de D38.** D38 rige para las pantallas y para `/v1/auditor/*`. `GET /v1/auditoria` (E1-B12, certificado por API) sigue siendo del Administrador y no tiene pantalla | No romper E1-B12 |
| D54 | **Reasignación del QE responsable (E7-B05).** `PUT /v1/hdu/{id}/qe-responsable` con `{qeResponsableId, motivo}`, solo Administrador (403 al QE, aunque sea el responsable, al Analista, al Líder y al Auditor). El destino debe ser un usuario activo con rol QE (422 `QE_INVALIDO`); el motivo es obligatorio, de 3 a 500 caracteres (en blanco, 422 `MOTIVO_REQUERIDO`); HDU `CERRADA`, 409 `HDU_CERRADA`; mismo QE, 200 con `cambio: false` sin historial ni auditoría. Con cambio, en una transacción que bloquea la HDU: actualiza `historia_usuario.qe_responsable_id`, inserta en la tabla nueva `hdu_historial_responsable` (QE anterior y nuevo, motivo, actor, fecha) y audita `REASIGNAR_QE_RESPONSABLE` (entidad `HDU`, antes, después y motivo). El historial de la HDU suma el evento `QE_RESPONSABLE`. No toca el analista ni la supervisión. `GET /v1/catalogos/personas?rol&activo` (solo Administrador) entrega las personas para el selector. Cierra la pregunta abierta 1 | El usuario aprobó agregarla (2026-10-21): sin ella, D40 impedía cambiar el rol de cualquier QE con HDU abiertas |
| D55 | **Correcciones de la certificación E7 (DEF-01, 02, 09).**<br>• **`sprint` de una HDU** es un `CatalogoRef` (`id`, `nombre`) en `GET /v1/hdu`, `/v1/bandeja/*` y `PUT /v1/hdu/{id}/qe-responsable`. El portal solo usa el nombre; `inicio` y `fin` quedan en `GET /v1/catalogos/sprints`. Se corrige la respuesta, no el contrato.<br>• **Ids desconocidos en `POST /v1/interno/hdu/consulta`.** Para Administrador y Auditor (ámbito total) se omiten de `items` en vez de dar 403 al lote; con ámbito restringido, un id ajeno o inexistente sigue dando 403 completo (D12, D47). La bitácora global del Auditor y su CSV muestran esa HDU con código «(HDU no disponible)» y título «HDU no disponible en Organización» (`estado` `PENDIENTE` solo como relleno, porque `HduReferencia` lo exige); el CSV agrega el id al código.<br>• **Líder desactivado.** Se excluye a los líderes inactivos del conteo «célula con líder» (`celulasSinLider` y los pendientes `CELULA_SIN_LIDER`); sus asignaciones **no se retiran**. Así el historial queda intacto, desactivar no escribe en `celula_lider` y al reactivar al Líder recupera sus células sin que el Administrador deba volver a asignarlas. Se descartó retirarlas al desactivar porque obligaría a reasignarlas a mano al reactivar | Evidencia de QA en `docs/validacion/certificacion-e7.md`; D51 pide solo usuarios activos |
| D56 | **Rol cambiado frente a acceso denegado (DEF-03, precisa D41).** Si la URL pedida es de un portal que **fue del usuario** (su rol cambió), el portal lo redirige a su bandeja nueva con el aviso «Tu rol cambió. Te llevamos a tu nueva bandeja.» (`aviso-rol-cambio`). Si el portal **nunca fue suyo**, rige D41: acceso denegado en la URL pedida. Para saber el rol previo, `AuthProvider` guarda en `sessionStorage` (`q360.rol-conocido`, `{id, rol}`) el último rol que devolvió `GET /v1/me` y lo compara en cada respuesta: si difiere, hay un cambio de rol (al recargar, o con la sesión abierta tras un 403 que reconsulta `/v1/me`). El `Layout` navega a `rutaPortal(rol)` con el aviso y reconoce el cambio; mientras no se reconozca, `RequireRole` no pinta «acceso denegado» en los portales del rol anterior. Después de ese redireccionamiento la pista queda con el rol nuevo, así que una carga posterior de la URL antigua (p. ej. `/qa`) vuelve a dar acceso denegado, como afirma E7-F01#1 T07. La pista es solo de experiencia: no autoriza nada (la autorización es del backend y el rol vigente sale siempre de `/v1/me`, D4); se borra al cerrar sesión y es por pestaña. Sin pista previa (primera carga), la discrepancia no se puede detectar y rige D41 | Conflicto entre D41 y la regla de E7-F01; DEF-03 de la certificación E7 |

## Modelo de datos (lo escribe `q360-backend`)

**Migración de Organización** `20261021000000_e7_roles_celula_lider`: se escribe, se aplica en local con `prisma migrate deploy` y se prueba. En la nube se aplica al cerrar la corrida, como en D13.

1. **Roles.** `INSERT INTO rol (nombre, descripcion) VALUES ('LIDER_QA', …), ('AUDITOR', …) ON CONFLICT (nombre) DO NOTHING`. Los 3 códigos actuales no cambian (D28).
2. **Enums.** `ALTER TYPE "AccionAuditoria" ADD VALUE 'ASIGNAR_CELULAS_LIDER'`, `… ADD VALUE 'EXPORTAR'` y `ALTER TYPE "EntidadAuditoria" ADD VALUE 'EXPORTACION'`. Postgres no deja usar un valor nuevo de un enum en la misma transacción en que se agrega: la migración no inserta filas con esos valores.
3. **Tabla `celula_lider`** (modelo Prisma `CelulaLider`, `@@map("celula_lider")`):

| Columna | Tipo | Regla |
| --- | --- | --- |
| `id_celula_lider` | `uuid` PK | `DEFAULT gen_random_uuid()` |
| `id_usuario` | `uuid NOT NULL` | FK → `usuario(id_usuario)`, `ON DELETE RESTRICT ON UPDATE CASCADE` |
| `id_celula` | `uuid NOT NULL` | FK → `celula(id_celula)`, `ON DELETE RESTRICT ON UPDATE CASCADE` |
| `fecha_desde` | `timestamptz(6) NOT NULL` | `DEFAULT now()` |
| `fecha_hasta` | `timestamptz(6) NULL` | `NULL` = vigente |
| `asignado_por_tipo`, `asignado_por_id`, `asignado_por_nombre` | `"TipoActor" NOT NULL`, `text NOT NULL`, `text NOT NULL` | Mismo patrón `actor_*` de `supervision` (D30 dice `asignado_por`) |
| `retirado_por_tipo`, `retirado_por_id`, `retirado_por_nombre` | Igual, `NULL` | Se llenan al cerrar |

- **CHECK** `celula_lider_fechas_ck`: `fecha_hasta IS NULL OR fecha_hasta >= fecha_desde`.
- **CHECK** `celula_lider_retiro_ck`: `(fecha_hasta IS NULL) = (retirado_por_id IS NULL)`.
- **Índices:**
  - `celula_lider_vigente_key`: `UNIQUE (id_usuario, id_celula) WHERE fecha_hasta IS NULL`. Es parcial, va en SQL y se documenta en el modelo Prisma, como el de `supervision`.
  - `celula_lider_celula_vigente_idx`: `(id_celula) WHERE fecha_hasta IS NULL`, para las células sin líder.
  - `celula_lider_usuario_historial_idx`: `(id_usuario, fecha_desde DESC)`.
- **Auditoría:** índices `auditoria_actor_fecha_idx (actor_id, fecha)` y `auditoria_accion_fecha_idx (accion, fecha)`, para los filtros del Auditor.
- **Tabla `hdu_historial_responsable`** (D54, agregada a esta migración): `id`, `hdu_id` (FK a `historia_usuario`), `qe_anterior_id`, `qe_nuevo_id`, `motivo`, `actor_*` y `fecha`, con índice por `hdu_id`.
- **Sin cambios** en `historia_usuario`: ya tiene índices por célula, QE, analista y estado.

**Migración de Certificaciones** `20261021000000_e7_lectura_global`, solo índices:

- `evento_checklist (fecha)`
- `evento_checklist (accion, fecha)`
- `evento_checklist (actor_id, fecha)`
- `certificado (emitido_en)`
- `certificado (emitido_por_id)`

Ninguna llave foránea sale de su esquema: `hdu_id` sigue siendo un UUID por contrato (D24).

**Semilla** (`q360-integraciones`): agrega el fixture de la sección 3 del backlog E7 (LID1, LID2, AUD1, INACT1, CEL-A/B/C y H1–H8 con su estado de checklist). `CargaUsuario.rol` acepta los 5 roles y `CargaUsuario.celulaIds` carga las células del Líder al crearlo. Así ninguna ruta publicada por el gateway necesita admitir `SERVICIO`.

## Pruebas certificadas que deben reescribirse (dueño `q360-qa`, con `q360-frontend` en las unitarias)

| Prueba | Hoy afirma | Después (D41, D29) |
| --- | --- | --- |
| `apps/web/src/test/routeGuard.test.tsx` · «un QE que abre una ruta administrativa vuelve a su propio portal» | Vuelve a «Portal QE» | Ve `acceso-denegado` («No tienes acceso a esta sección») en `/admin/usuarios`, con «Ir a mi bandeja» y sin el `h1` «Usuarios» |
| `apps/web/src/test/routeGuard.test.tsx` · «un Analista QA que abre una ruta de QE vuelve a su propio portal» | Vuelve a «Portal Analista QA» | Acceso denegado en `/qe/equipo` |
| `tests/e2e/e1-f02-portal-qe.spec.ts` · `[E1-F02#2]` ×2 | `toHaveURL(/\/qe$/)` | URL `/admin/usuarios` o `/qa/hdu` y `acceso-denegado` visible; ninguna petición de datos del portal ajeno |
| `tests/e2e/e1-f02-portal-qe.spec.ts` · `[E1-F02#3]` | Menú `["Inicio", …]` | `["Bandeja", "Equipo", "Historias supervisadas", "Perfil"]` |
| `tests/e2e/e1-f05-portal-qa.spec.ts` · `[E1-F05#3]` ×2 | `toHaveURL(/\/qa$/)` | Acceso denegado en la URL pedida |
| `tests/e2e/e1-f05-portal-qa.spec.ts` · `[E1-F05#2]` | Menú `["Inicio", …]` | `["Bandeja", "Mis HDU", "Perfil"]` |
| `tests/e2e/login-redireccion-rol.spec.ts` · `[LOGIN-UI]` «tras ingresar, se vuelve a ella» | Vuelve a `/admin/supervision` | Sin cambio (es ruta del propio rol). Se agrega E7-F01-T06 para una ruta ajena |
| `apps/web/src/mocks/handlers.ts` | `porRol` con 3 roles; `relaciones` con 2 campos | 5 roles; 4 campos en `relaciones` (D43). No es una prueba certificada, pero alimenta las unitarias |

Las pruebas de API certificadas no cambian de resultado esperado:

- `e1-b08-cambio-rol` usa `SUPERADMIN_INEXISTENTE` como rol inválido, que sigue siendo inválido.
- `e1-b08`, `e1-b12` y `e1-f11` cambian el rol de usuarios recién creados, sin HDU, así que D40 no las afecta.
- Si alguna prueba valida el esquema estricto de `Usuario`, `ResumenUsuariosAdmin.porRol` o `ResolucionAcceso`, debe aceptar los campos nuevos: `celulasVigentes`, `LIDER_QA`, `AUDITOR` y `celulasIds`.

## Resolución de los conflictos del diseño (sección 6)

| # | Resolución |
| --- | --- |
| 1 | D41. Las pruebas a reescribir están en la tabla anterior |
| 2 | Se acepta: dos variantes de `AccesoDenegado` («sección» y «recurso») y el botón en ambas |
| 3 | Se acepta `BloqueDatos`, que envuelve y no cambia los testids certificados |
| 4 | D42 |
| 5 | D43 |
| 6 | D51 |
| 7 | D44 |
| 8 | Se acepta una sola tarjeta con ambos testids (D51) |
| 9 | Se acepta: `/auditor` muestra la pestaña HDU sin redirigir |
| 10 | D45 |
| 11 | D44 (`Usuario.celulasVigentes`) |
| 12 | Se acepta: sin `<form>` ni `button[type=submit]` en el Auditor. `?hdu=` en aprobaciones es aditivo (D44). `QaHduListPage` y `QeHduListPage` no se tocan |
| 13 | `q360-qa` corre axe sobre las 5 bandejas antes de certificar |
| 14 | D36 sin cambios |

## Trazabilidad E7

| Capacidad | Frontend | Backend | Contrato |
| --- | --- | --- | --- |
| Ingreso por rol y acceso denegado | E7-F01 | E7-B03#3, B02 | `GET /v1/me`, `/v1/bandeja/*` (403) |
| Bandeja del Analista | E7-F02 | E7-B03 | `GET /v1/bandeja/analista`, `POST /v1/interno/checklist/estados` |
| Bandeja del QE | E7-F03 | E7-B03 | `GET /v1/bandeja/qe`, `GET /v1/inicio/qe` |
| Bandeja del Líder | E7-F04 | E7-B01, B02, B03 | `GET /v1/bandeja/lider`, `GET /v1/interno/hdu/ambito` |
| Bandeja del Administrador | E7-F05 | E7-B03 | `GET /v1/bandeja/admin`, `GET /v1/usuarios/{id}` |
| Bandeja del Auditor | E7-F06 | E7-B02, B03, B04 | `GET /v1/bandeja/auditor`, `/v1/auditor/*` |
| Rol y células | E7-F07 | E7-B01 | `GET /v1/roles`, `PUT /v1/usuarios/{id}/rol`, `GET\|PUT /v1/usuarios/{id}/celulas-lider` |

## Preguntas abiertas

1. **QE con HDU abiertas (D40).** Resuelta con D54: el Administrador reasigna el QE responsable con `PUT /v1/hdu/{id}/qe-responsable` y después cambia el rol.
2. **Volumen.** Las bandejas leen el ámbito completo para ordenar y filtrar con datos de Certificaciones (lotes de hasta 1000 HDU). Alcanza para el MVP; con más de unos pocos miles de HDU por ámbito, conviene una proyección del avance en Organización (por eventos).
3. **Validez del certificado (D45).** Hoy siempre es `true`. Si se quiere revocar certificados, hace falta una HDU nueva que defina quién revoca y cómo se ve.

# Corrida E4 · Impedimentos y riesgos

- **Alcance:** 8 HDU (E4-F01–F04, E4-B01–B04), 24 escenarios y 89 casos. Fuente: `docs/backlog/e4-impedimentos-y-riesgos.md` (catálogos, matriz de permisos 3.6, modelo de datos, sección 6 de efectos y fixture). Los escenarios refinados también están en `docs/backlog/historias-quality360.md` para `npm run contracts:check`. Diseño: `docs/diseno/e4-impedimentos-y-riesgos.md`.
- **Decisiones del usuario (2026-10-26):** un impedimento `ABIERTO` o `ESCALADO` bloquea el cierre de la HDU (409 `HDU_BLOQUEADA`); solo el QE responsable gestiona (resolver, escalar, reabrir, seguimiento, fijar riesgo); registran el analista asignado y el QE responsable; Administrador, Líder QA y Auditor solo leen; el Analista QA no ve el riesgo.
- **D57–D74** están en el backlog E4 y se mantienen. Las precisiones están en D77 (sobre D60), D89 (sobre la matriz 3.6) y D92 (texto del backlog).
- **Contratos:** `contracts/impedimentos.v1.yaml` (nuevo) y cambios aditivos en `comun`, `organizacion` y `gateway`. `npm run contracts:lint` sin advertencias y `npm run contracts:check` con 186/186 escenarios (E1, E2, E3, E4 y E7).
- **Reparto:** `docs/arquitectura/e4-plan-construccion.md`. **ADR:** `adr/0014-impedimentos-y-riesgo.md`.

## Decisiones

| ID | Decisión | Motivo |
| --- | --- | --- |
| D75 | **El servidor dice qué se puede hacer.** `GET /v1/hdu/{id}/impedimentos` trae `hduCerrada`, `bloqueada`, los conteos y `permisos {puedeRegistrar, puedeGestionar, puedeVerRiesgo, puedeFijarRiesgo}`. Cada `Impedimento` trae `esNuevo` y `operacionesPermitidas` (según su estado y la relación; vacío si quien consulta no es el QE responsable o si la HDU está cerrada). `GET /v1/hdu/{id}/riesgo` trae `hduCerrada` y `permisos.puedeFijarRiesgo`; `ImpedimentoDetalle` trae `hdu`, `hduCerrada` y `permisos`. El portal muestra u omite cada botón con estos valores y nunca deduce la relación. `GET /v1/hdu/{id}` no cambia | Conflicto 2 del diseño. Mismo patrón que `permisos` del checklist (E3) |
| D76 | **`factores[].detalle` estructurado.** Cada factor trae `codigo`, `nivel` y `detalle` con los valores y umbrales que usó el cálculo: `impedimentos`, `impedimentoId`, `diasAbierto`, `umbralDias`, `sprint {id, nombre}`, `sprintFin`, `diasRestantes`, `avance` y `umbralAvance` (qué campos van con cada código: `DetalleFactorRiesgo`). Los factores que no se pudieron evaluar van en `factoresNoEvaluados`. El portal arma la frase con el detalle y no fija umbrales; si falta un campo, usa la frase genérica del código | Conflicto 3. D67 hace configurables los umbrales |
| D77 | **Cierre bloqueado con total.** El 409 `HDU_BLOQUEADA` (`ErrorHduBloqueada`) trae `impedimentos {total, items ≤ 20}`, los más antiguos primero, cada uno con `id`, `titulo`, `tipo`, `estado` y `diasAbierto` (un impedimento no tiene código; el backlog decía «código, título y estado»). El 503 por Impedimentos caído (`ErrorImpedimentosNoVerificables`) trae `impedimentos: {fuente: impedimentos.impedimentos, estado: indisponible}`, para que el portal lo distinga de una caída del gateway. Orden: transición (D10) → checklist (D11) → impedimentos. La operación es `POST /v1/hdu/{id}/estado` (el backlog decía `PUT`) | Conflicto 4. Mismo patrón que `hduAbiertas {total, items}` de D43 |
| D78 | **Enlace «Abrir»:** `/hdu/:id?impedimento=<id>#impedimentos`. Es solo del portal y aditivo, como D44. Sin el parámetro, el detalle es el certificado. Un id que no está en la lista lleva a la sección sin aviso ni error | Conflicto 1 |
| D79 | **Lista del Líder:** todos los `ABIERTO` y `ESCALADO` de sus células vigentes (hasta 50, con `total`), los escalados a él primero (`escaladoAMi`) y después el orden de D74. Solo lectura, sin botones. Los contadores no dependen de la lista | Conflicto 5. E4-F03-T04 («muestra ambos») y E4-B04 (3 abiertos) se cumplen con la lista completa |
| D80 | **Riesgo del Auditor:** en el panel del detalle y en la vista «Gestión» (eventos `RIESGO`). No se agrega columna a la pestaña HDU del Auditor, ni a `BandejaAuditor.hdu`, ni a su CSV. **E7-B04-T09 no cambia:** afirma 10 columnas exactas y 4 filas de CEL-A, y la semilla E4 no agrega HDU. La API permite `GET /v1/riesgo/hdu` al Auditor, pero no tiene pantalla. Si se quiere la columna en pantalla, es aditiva (sin CSV) | Conflicto 6. D71 prohíbe cambiar el CSV |
| D81 | **Insignia «Con impedimento abierto» en la fila «Cerrar HDU».** `AccionPendienteQe.bloqueo` solo viene en filas `CERRAR`. El portal pone la insignia en un elemento propio (`insignia-con-impedimento-<hduId>`) dentro de `celda-accion-<hduId>`, **después** del texto «Cerrar HDU» y **fuera** del botón `boton-accion-<hduId>-cerrar`, cuyo nombre accesible no cambia. Coordinado con `q360-qa`: E7-F03-T01 usa `toContainText("Cerrar HDU")`, que sigue pasando, y la semilla E4 no deja impedimentos abiertos en H8, así que la fila se ve igual. Ninguna prueba nueva puede usar `toHaveText` exacto sobre `celda-accion-*`. E4-B02-T12 registra uno en H8 y lo resuelve antes de terminar | Conflicto 8, sin cambiar lo certificado |
| D82 | **Historial del detalle:** se confirma el diseño. Cada impedimento muestra sus acciones desde `GET /v1/impedimentos/{id}` (la más antigua primero); el panel de riesgo muestra su historial desde `GET /v1/hdu/{id}/gestion-impedimentos?tipo=RIESGO`. El «Historial» certificado de la HDU no se toca. El Analista no pide el de riesgo (no ve el panel) y, si lo pidiera, recibe solo entradas `IMPEDIMENTO` | Conflicto 10 |
| D83 | **Administrador, solo lectura** (confirma D57 y la pregunta abierta 1 del backlog). Ve impedimentos, historial y riesgo sin botones; la nota `nota-impedimentos-solo-lectura` le indica que puede reasignar el QE (D54). Ninguna operación de gestión admite la relación `ADMINISTRADOR` | Conflicto 11 |
| D84 | **Accesibilidad (gate de `q360-qa`).** axe a 1280 y 375 px sobre: `/hdu/:id` como Analista asignado, QE responsable, QE supervisor, Líder, Administrador y Auditor (incluidos el aviso `hdu-bloqueada` y el error `error-hdu-bloqueada`); los diálogos de registrar, resolver, escalar, reabrir, seguimiento y fijar riesgo, abiertos y con errores de validación; `/qe/impedimentos` y `/qe/impedimentos/riesgo` (con datos, vacío e indisponible); las 5 bandejas con sus bloques E4; `/auditor/impedimentos` en sus dos vistas. Cero violaciones `serious` o `critical` | Conflicto 15. Mismo gate que E7 |
| D85 | **Gateway → Impedimentos** (`IMPEDIMENTOS_URL`, tiempo límite `TIEMPO_LIMITE_SERVICIO_MS`). Reenvío sin composición, con las rutas declaradas una por una en un controlador nuevo: `GET /v1/catalogos/tipos-impedimento`; `GET\|POST /v1/hdu/:hduId/impedimentos`; `GET /v1/hdu/:hduId/impedimentos/responsables`; `GET\|PUT /v1/hdu/:hduId/riesgo`; `GET /v1/hdu/:hduId/gestion-impedimentos`; `GET /v1/impedimentos`; `GET /v1/impedimentos/:id`; `POST /v1/impedimentos/:id/(resolver\|escalar\|reabrir\|seguimiento)`; `GET /v1/riesgo/hdu`; `GET /v1/auditor/(impedimentos\|gestion-impedimentos)` y sus 2 exportaciones (CSV tal cual). Las rutas con sufijo bajo `/v1/hdu/:id/` conviven con las de Organización (`analista`, `estado`, `historial`, `qe-responsable`) y con las de Certificaciones porque ninguna es comodín. Se retira `impedimentos{/*ruta}` de `NoImplementadoController`. `/v1/interno/*` no se publica. Destino caído → 503 | El gateway no tiene dominio (D46). Hoy `/v1/impedimentos/*` responde 501 |
| D86 | **Contratos internos.**<br>• Impedimentos → Organización: `GET /v1/interno/acceso` (rol, activo y ámbito); `GET /v1/interno/hdu/{id}/acceso?incluirCandidatos=true` (relación, `hdu` y `candidatosResponsable {registro, escalamiento}`); `GET /v1/interno/hdu/ambito`; `POST /v1/interno/hdu/consulta`; **nuevo** `GET /v1/interno/hdu/ambito/detalle` (todas las HDU del ámbito, para «Riesgo por HDU»); `POST /v1/interno/auditoria/exportaciones` (recursos nuevos `IMPEDIMENTOS` y `GESTION_IMPEDIMENTOS`). `HduParaCertificacion` suma `celulaId`, `sprintId` y `sprintFin`.<br>• Impedimentos → Certificaciones: `POST /v1/interno/checklist/estados`, para el avance y para el ciclo activo al registrar (campo nuevo `SeguimientoHdu.certificacionId`, `null` sin ciclo).<br>• Organización → Impedimentos: `GET /v1/interno/hdu/{hduId}/impedimentos/abiertos` (cierre, D60) y `POST /v1/interno/impedimentos/evaluacion` (bandejas, D69).<br>Todas con el token del usuario, `x-trace-id` y 2 s. Un id fuera de ámbito en un lote → 403 completo. La vuelta Organización → Impedimentos → Organización solo autoriza (el mismo patrón de Certificaciones en E7) | Reglas no negociables 1–3; D47 |
| D87 | **Bloques de bandeja** (`impedimentos`, obligatorio en las 5 `Bandeja*`; cada contador y lista con su `estado`).<br>• Analista: `impedimentosAbiertos`, `bloqueo` por fila y filtro `soloBloqueadas`, sin riesgo.<br>• QE (ámbito de su bandeja: HDU donde es responsable): `impedimentosAbiertos`, `impedimentosNuevos`, `hduRiesgoAlto`, `lista` (10) y `bloqueo` en las filas `CERRAR`.<br>• Líder: `impedimentosAbiertos`, `hduBloqueadas`, `escaladosAMi`, `lista` (D79), `bloqueo` y `riesgo` por fila y `soloBloqueadas`.<br>• Administrador: `impedimentosAbiertos`, `hduBloqueadas`, `hduRiesgoAlto` y `escalados` (a él).<br>• Auditor: `impedimentosAbiertos` y `hduBloqueadas`.<br>Si Impedimentos cae, solo estos bloques van `indisponible` y la respuesta es 200; `soloBloqueadas` con Impedimentos caído deja `hdu` `indisponible`. `hduRiesgoAlto` es `indisponible` si alguna HDU del ámbito tiene el riesgo `indisponible`. Para el `hduRiesgoAlto` del Administrador, Organización consulta Certificaciones solo para ese contador: los bloques certificados siguen sin depender de ella (E7-B03-T11) | D71, D46, regla no negociable 4 |
| D88 | **Modelo de datos de Impedimentos** (lo escribe `q360-backend`; detalle abajo). Migración `20261026000000_e4_impedimentos_riesgo`, solo en el esquema `impedimentos` y sin llaves foráneas a otro esquema | D24, D65 |
| D89 | **Autorización en Impedimentos.** Cada operación sobre una HDU consulta `GET /v1/interno/hdu/{id}/acceso`, y la relación decide según la tabla de `impedimentos.v1.yaml` (la matriz 3.6). Listados: una llamada a `GET /v1/interno/hdu/ambito`. Catálogo: usuario activo. `/v1/auditor/*`: `rol: AUDITOR`. Orden: 401 → 403 → 400 → 409 `HDU_CERRADA` → 422 → 409 `TRANSICION_INVALIDA`. Un impedimento inexistente da 404 al Administrador y al Auditor y 403 al resto (para saber el rol se consulta `GET /v1/interno/acceso`). Si Organización no responde, 503 | Igual que Certificaciones (D18, D47) |
| D90 | **Precisiones del cálculo.**<br>• «Hoy» es la fecha de `America/Santiago`, o `Q360_FECHA_REFERENCIA` (ignorada con `NODE_ENV=production`), y se usa para días abiertos, días restantes y sprint vencido. `esNuevo` usa el reloj real: menos de 24 h desde `fecha_registro` y no resuelto.<br>• Con el avance caído, el `ALTO` parcial vale si lo alcanza cualquier factor evaluable, no solo los de impedimentos: `SPRINT_VENCIDO` no necesita el avance.<br>• Sin sprint vigente (`sprintFin: null`) no aplican los 3 factores de sprint.<br>• `diasRestantes` es negativo en `SPRINT_VENCIDO` | Completa D67 y D68 sin cambiar ningún caso |
| D91 | **Despliegue.** Impedimentos se publica en Vercel como cuarto servicio (`quality360-impedimentos`, raíz `services/impedimentos`, con el mismo `vercel.json` y `api/index.mjs` que Certificaciones). El gateway suma `IMPEDIMENTOS_URL`, y Organización `IMPEDIMENTOS_URL` e `IMPEDIMENTOS_TIMEOUT_MS`. En local, puerto 3003 en Compose y en `npm run local`. La migración se aplica en la nube al cerrar la corrida (D13), seguida del RLS de `infrastructure/nube/004` (con `riesgo_hdu` y los `REVOKE`) | Sin Impedimentos arriba, el cierre de una HDU responde 503 (D60) |
| D92 | **Correcciones al texto del backlog E4** (no cambian ningún resultado esperado):<br>• El cierre es `POST /v1/hdu/{id}/estado` (D77).<br>• Filtros de API `celulaId`, `analistaId`, `riesgo`, `incluirResueltos` y `orden=columna:asc\|desc` (D49); `?celula=` queda solo en la URL del portal.<br>• El «estado» de la evaluación se llama `riesgo.estado`.<br>• `responsableId` y `responsableNombre` a la vez → 400.<br>• Escalar al mismo responsable actual → 422 `RESPONSABLE_INVALIDO`.<br>• Filtrar por riesgo o por nivel con Certificaciones caída → 503 en los endpoints propios; en las bandejas, bloque `indisponible` | Coherencia con `comun.v1.yaml` y D46 |

## Modelo de datos (lo escribe `q360-backend`)

**Migración** `services/impedimentos/prisma/migrations/20261026000000_e4_impedimentos_riesgo/migration.sql`. Las tablas están vacías en local y en la nube, así que los `NOT NULL` se agregan sin valores de relleno.

**`impedimento`** (existente; se agrega):

| Columna | Tipo | Regla |
| --- | --- | --- |
| `id_historia` | `uuid NOT NULL` | UUID de Organización, sin FK (D58) |
| `id_certificacion` | `uuid NULL` | Pasa a admitir NULL (`ALTER COLUMN … DROP NOT NULL`) |
| `responsable_id` | `uuid NULL` | Usuario de Organización, sin FK; NULL = tercero (D63) |
| `responsable_nombre` | `varchar(150) NOT NULL` | Instantánea |
| `creado_por_id` | `uuid NOT NULL` | Sin FK |
| `creado_por_nombre` | `varchar(150) NOT NULL` | Instantánea |
| `creado_por_rol` | `varchar(30) NOT NULL` | `ANALISTA_QA` o `QE` |
| `abierto_desde` | `timestamptz(6) NOT NULL DEFAULT now()` | Se reinicia al reabrir (D74) |
| `actualizado_en` | `timestamptz(6) NOT NULL DEFAULT now()` | |

- `titulo varchar(200)`, `descripcion varchar(1000) NULL`, `tipo varchar(30)`, `estado varchar(30)`, `fecha_registro` y `fecha_resolucion` no cambian.
- CHECK:
  - `impedimento_tipo_ck`: `tipo IN ('AMBIENTE','DATOS_PRUEBA','ACCESO','REQUISITOS','DEPENDENCIA','DEFECTO_BLOQUEANTE','HERRAMIENTA','RECURSOS','OTRO')`
  - `impedimento_estado_ck`: `estado IN ('ABIERTO','ESCALADO','RESUELTO')`
  - `impedimento_resolucion_ck`: `(estado = 'RESUELTO') = (fecha_resolucion IS NOT NULL)`
  - `impedimento_creado_por_rol_ck`: `creado_por_rol IN ('ANALISTA_QA','QE')`
- Índices:
  - `impedimento_historia_estado_idx (id_historia, estado)`
  - `impedimento_abiertos_idx (estado, abierto_desde) WHERE estado <> 'RESUELTO'`
  - `impedimento_responsable_escalado_idx (responsable_id) WHERE estado = 'ESCALADO'` (escalados a mí)
  - `impedimento_fecha_registro_idx (fecha_registro DESC)` (Auditor)
  - Se conserva el índice de `id_certificacion`.

**`accion_impedimento`** (existente; solo inserción; se agrega):

| Columna | Tipo | Regla |
| --- | --- | --- |
| `tipo_accion` | `varchar(30) NOT NULL` | CHECK `accion_impedimento_tipo_ck`: `REGISTRAR`, `ESCALAR`, `RESOLVER`, `REABRIR`, `SEGUIMIENTO` |
| `estado_anterior` | `varchar(30) NULL` | NULL solo en `REGISTRAR`: CHECK `accion_impedimento_anterior_ck` `(tipo_accion = 'REGISTRAR') = (estado_anterior IS NULL)` |
| `actor_id` | `uuid NOT NULL` | Sin FK |
| `actor_nombre` | `varchar(150) NOT NULL` | Instantánea: desactivar al usuario no altera el historial |
| `actor_rol` | `varchar(30) NOT NULL` | |
| `detalle` | `jsonb NULL` | En `ESCALAR`: `{responsableAnterior, responsableNuevo}` |

- `descripcion varchar(500)` es el comentario (en `REGISTRAR`, «Registro del impedimento»). `estado` es el estado resultante, con el CHECK de los 3 estados, igual que `estado_anterior` cuando no es NULL. `observacion` queda libre y `fecha_accion` no cambia. La FK `id_impedimento → impedimento` es interna del esquema y se mantiene.
- Índices: `accion_impedimento_impedimento_fecha_idx (id_impedimento, fecha_accion)`, `accion_impedimento_fecha_idx (fecha_accion DESC)` y `accion_impedimento_actor_fecha_idx (actor_id, fecha_accion)`.

**`riesgo_hdu`** (nueva; solo inserción; el nivel vigente es la última fila de la HDU):

| Columna | Tipo | Regla |
| --- | --- | --- |
| `id_riesgo` | `uuid` PK | `DEFAULT gen_random_uuid()` |
| `id_historia` | `uuid NOT NULL` | Sin FK |
| `nivel` | `varchar(10) NOT NULL` | CHECK `riesgo_hdu_nivel_ck`: `BAJO`, `MEDIO`, `ALTO` |
| `nivel_anterior` | `varchar(10) NULL` | Mismo CHECK si no es NULL |
| `justificacion` | `varchar(500) NOT NULL` | |
| `sugerido_al_fijar` | `varchar(10) NULL` | Mismo CHECK si no es NULL; NULL si la sugerencia no se pudo calcular |
| `actor_id`, `actor_nombre`, `actor_rol` | `uuid`, `varchar(150)`, `varchar(30)`, NOT NULL | Instantánea |
| `fecha` | `timestamptz(6) NOT NULL DEFAULT now()` | |

- Índices: `riesgo_hdu_historia_fecha_idx (id_historia, fecha DESC)` y `riesgo_hdu_fecha_idx (fecha DESC)`.

**Permisos y concurrencia:**
- Al final de la migración: `REVOKE UPDATE, DELETE ON accion_impedimento, riesgo_hdu FROM svc_impedimentos;` y `REVOKE DELETE ON impedimento FROM svc_impedimentos;` (no hay borrados). Funciona aunque `svc_impedimentos` sea el dueño de la tabla, como en local. En la nube la migración la aplica `postgres` y los privilegios por defecto los vuelven a otorgar, así que `infrastructure/nube/004_rls_impedimentos_nube.sql` suma `riesgo_hdu` al RLS y repite los `REVOKE`. E4-B04-T07 espera 42501.
- Toda transición toma la fila con `SELECT … FOR UPDATE` dentro de la transacción que inserta la acción (D62). Registrar inserta el impedimento y su acción en una transacción. `PUT riesgo` lee la última fila de la HDU con `FOR UPDATE`, para que dos cambios simultáneos no tomen el mismo `nivel_anterior`.
- Prisma: modelos `Impedimento`, `AccionImpedimento` y `RiesgoHdu` con `@map` a estos nombres. Los CHECK, los índices parciales y los `REVOKE` van en SQL y se documentan en `schema.prisma`, como en `celula_lider` (D52).
- Organización y Certificaciones no tienen migración en esta corrida.

**Semilla** (`q360-integraciones`): agrega el fixture de la sección 7 del backlog E4, siempre por API con `credencialServicio`:
- Impedimentos I1–I5 con sus acciones y fechas pasadas: `POST /v1/interno/carga/impedimentos` (nuevo).
- Riesgo fijado de H6: `POST /v1/interno/carga/riesgo` (nuevo).
- Sprints con fin relativo a hoy: `POST /v1/interno/carga/sprints` (existente). Un sprint pertenece a una célula, así que SP-PROX y SP-LEJ se crean una vez por célula (por ejemplo, SP-PROX-A y SP-PROX-B).
- HDU en su sprint: `PUT /v1/interno/carga/hdu/{id}/sprint` de Organización (nuevo).

No agrega HDU, usuarios ni células, y no deja impedimentos abiertos en H8. Para reiniciar el fixture entre archivos de prueba, el arnés vacía `impedimentos.*` con el dueño de la base (`svc_impedimentos` no puede borrar) y vuelve a cargar. Revisado el 2026-10-26: ninguna prueba de `tests/` afirma el nombre del sprint de H1–H8 («Sprint E7»), así que moverlas de sprint no cambia E7.

## Resolución de los conflictos del diseño (sección 12)

| # | Resolución |
| --- | --- |
| 1 | D78 |
| 2 | D75 |
| 3 | D76 |
| 4 | D77 |
| 5 | D79 |
| 6 | D80 |
| 7 | Se acepta: «Bloqueo» y «Riesgo» van al final de las tablas del Analista y del Líder. «Bloqueo» no se mueve tras «Estado»: así no se desplaza ninguna columna certificada |
| 8 | D81 |
| 9 | Se acepta el disclosure con `aria-expanded` y `aria-controls`, con `type="button"` |
| 10 | D82 |
| 11 | D83 |
| 12 | Se acepta: «Confirmar» no se deshabilita con el campo vacío; el portal valida y muestra el mensaje (E4-F03-T02) |
| 13 | Se acepta la pista `pista-cierre-bloqueado`, no bloqueante: el botón sigue habilitado y la prueba ve el 409 del servidor |
| 14 | Se acepta la opción «Impedimentos» del menú del QE sin `end` |
| 15 | D84 |

## Pruebas certificadas que cambian o se ven afectadas

| Prueba | Qué pasa | Dueño |
| --- | --- | --- |
| `tests/e2e/e1-f02-portal-qe.spec.ts` · `[E1-F02#3]` y su unitaria | El menú del QE pasa a `["Bandeja","Equipo","Historias supervisadas","Impedimentos","Perfil"]` (sección 6 del backlog E4) | `q360-qa`, `q360-frontend` |
| `tests/api/e7-b03-bandejas.spec.ts` · «contrato: las 5 respuestas…» | Valida contra `comun.v1.yaml`, donde `impedimentos` es obligatorio. También exige `SeguimientoHdu.certificacionId`. Falla contra los servicios anteriores a E4 y vuelve a pasar cuando Organización publica los bloques y Certificaciones el campo (B7 y B8 del plan). La prueba no se toca | `q360-backend` |
| `tests/support/contrato.ts` | Debe cargar también `impedimentos.v1.yaml` para validar las respuestas de E4 | `q360-qa` |
| `apps/web/src/mocks/handlers.ts` | Las bandejas de MSW necesitan el bloque `impedimentos`. No rompe `tsc`, porque los mocks no están tipados con `Bandeja*` | `q360-frontend` |
| Suites que cierran HDU (E2-B02, E7) | Necesitan Impedimentos arriba (sin él, 503). Sus datos no tienen impedimentos, así que el resultado no cambia | `q360-qa` |

## Trazabilidad E4

| Capacidad | Frontend | Backend | Contrato |
| --- | --- | --- | --- |
| Registrar | E4-F01 | E4-B01 | `POST /v1/hdu/{hduId}/impedimentos`, `…/responsables`, `GET /v1/catalogos/tipos-impedimento` |
| Ver y priorizar | E4-F02 | E4-B01, B03 | `GET /v1/impedimentos`; bandejas con `POST /v1/interno/impedimentos/evaluacion` |
| Ciclo de vida y cierre | E4-F03 | E4-B02 | `POST /v1/impedimentos/{id}/{resolver, escalar, reabrir, seguimiento}`; `POST /v1/hdu/{id}/estado` (409 `HDU_BLOQUEADA`); `GET /v1/interno/hdu/{hduId}/impedimentos/abiertos` |
| Riesgo | E4-F04 | E4-B03 | `GET\|PUT /v1/hdu/{hduId}/riesgo`, `GET /v1/riesgo/hdu`, `GET /v1/interno/hdu/ambito/detalle` |
| Trazabilidad y Auditor | Pestaña del Auditor | E4-B04 | `GET /v1/hdu/{hduId}/gestion-impedimentos`; `/v1/auditor/{impedimentos, gestion-impedimentos}` y sus exportaciones |

## Preguntas abiertas

1. **Carrera entre cierre y registro.** Organización verifica los impedimentos y después cierra. Si justo entonces alguien registra uno, la HDU puede quedar cerrada con un impedimento abierto. Impedimentos vuelve a leer el estado de la HDU al registrar, así que la ventana es de milisegundos; cerrarla del todo exigiría una reserva entre servicios que el MVP no justifica. Si ocurre, el QE lo resuelve y queda en el historial.
2. **Volumen de «Riesgo por HDU».** `GET /v1/interno/hdu/ambito/detalle` trae todo el ámbito, como las bandejas (D46). Alcanza para el MVP; con miles de HDU conviene paginar en Organización.
3. **Columna de riesgo para el Auditor (D80).** Es aditiva y sin CSV, si el usuario la pide.

# Corrida E5 · Integración con Jira Cloud

- **Alcance:** 8 HDU (E5-F01–F04, E5-B01–B04), 24 escenarios y 102 casos automáticos (más el manual opcional E5-MAN-01). Fuente: `docs/backlog/e5-integracion-jira.md` (catálogos en la sección 4, mapeo en la 5, modelo de datos en la 6, rutas en la 7, efectos sobre lo certificado en la 9 y Jira simulado en la 10). Los escenarios refinados también están en `docs/backlog/historias-quality360.md` para `npm run contracts:check`. Diseño: `docs/diseno/e5-integracion-jira.md`.
- **Decisiones del usuario (2026-10-29):**
  - El Administrador configura. El token se cifra con AES-256-GCM, la llave vive solo en Vercel y el token nunca se vuelve a mostrar.
  - El Administrador sincroniza a mano con un botón e importa CSV/JSON.
  - Si la HDU existe, se actualizan solo título, descripción y prioridad; si no existe, se crea.
  - Todo funciona en el plan gratuito.
  - QE y Auditor ven el historial en solo lectura.
- **D93–D112** están en el backlog E5 y se mantienen. D113–D128 resuelven los conflictos del diseño (sección 14) y los supuestos abiertos del backlog (sección 16). Las precisiones sobre decisiones anteriores son D117 (sobre D105), D120 (sobre D99), D122 (sobre D48) y D125 (sobre D102 y D112). D129 (decisión del usuario, 2026-10-30) extiende el patrón no fatal de D127 a `IMPEDIMENTOS_URL` y cierra la pregunta abierta 1.
- **Contratos:** `contracts/integraciones.v1.yaml` es nuevo. Hay cambios aditivos en `comun`, `organizacion` y `gateway`. `npm run contracts:lint` pasa sin advertencias y `npm run contracts:check` cubre 210/210 escenarios (E1, E2, E3, E4, E5 y E7).
- **Reparto:** `docs/arquitectura/e5-plan-construccion.md`. **ADR:** `adr/0015-integracion-jira-y-archivos.md`.

## Decisiones

| ID | Decisión | Motivo |
| --- | --- | --- |
| D113 | **Respuesta de sincronizar e importar.** `POST …/jira/sincronizaciones` y `POST …/archivos/importaciones` responden 200 con la `Ejecucion` cerrada. Su `id` es el `ejecucionId`, y la respuesta trae los seis contadores, `resultado`, `codigoError`, `mensajeError`, `sugerencias`, `hayMas` y `continuarDesde`. El POST no trae las filas: las listas «creadas», «actualizadas», «omitidas» y «con error» se cargan bajo demanda con `GET /v1/integraciones/ejecuciones/{id}/detalle?resultado=…` (25 por página). Un error de estructura al importar responde 422 con `ErrorArchivo.ejecucionId`, que identifica la ejecución `FALLIDA` registrada. En la vista previa, `ejecucionId` es `null` | Conflicto 2. Mantiene la respuesta del POST acotada aunque el archivo tenga 500 filas |
| D114 | **Una sola petición, sin progreso real, que termina antes de 10 s.**<br>• El presupuesto (`INTEGRACIONES_PRESUPUESTO_MS`, 8000) se mide desde que llega la petición.<br>• Cada llamada externa usa como tiempo límite el menor entre el suyo y lo que queda de presupuesto: 3 s para cada página de Jira (`JIRA_TIEMPO_LIMITE_MS`) y 5 s para cada lote de Organización (`ORGANIZACION_TIMEOUT_MS`).<br>• Con menos de 1 s de presupuesto no se inicia otra llamada y la ejecución termina `INCOMPLETA` con `PRESUPUESTO_DE_TIEMPO`.<br>• Un lote de Organización cortado por tiempo no se cuenta en `leidas`. Repetir es seguro: lo que alcanzó a escribirse queda `SIN_CAMBIOS`.<br>• Las filas de detalle se insertan al terminar cada lote, no al final. Así, si Vercel corta la función, lo hecho queda registrado y la siguiente ejecución lo cierra como `INTERRUMPIDA` con los contadores calculados desde el detalle.<br>• No hay sondeo de progreso ni cancelación: el portal muestra una espera indeterminada.<br>• `maxDuration` de las funciones de Integraciones y del gateway es 30 s; el margen protege, pero no se usa | Conflicto 3, D96. El techo real queda en presupuesto + cierre (< 10 s), sin depender de la duración del plan |
| D115 | **`SIN_RESPUESTA` es un código solo del portal.** Si `POST` de sincronización o importación termina en error de red, timeout, 502, 504 o 503 `SERVICIO_NO_DISPONIBLE`, el portal no sabe el resultado. En ese caso muestra «No recibimos respuesta del servidor. La operación pudo haberse completado: revisa el Historial antes de reintentar.», consulta `GET /v1/integraciones/estado` y, si encuentra una ejecución iniciada después del clic, la muestra. No está en ningún contrato ni en ninguna respuesta del servidor, y las pruebas de API no lo afirman. El gateway usa `INTEGRACIONES_TIMEOUT_MS` (12 s) para estas rutas, así que no corta antes que el servicio | Conflicto 4 |
| D116 | **El campo del token se vacía después de cada intento,** con éxito o con error, y al desmontar el formulario. Si ya hay un token guardado y descifrable, dejar el campo vacío significa «conservar». En la primera configuración, después de un error hay que volver a escribirlo. El campo es `password`, con `autocomplete="new-password"`, sin botón «mostrar», y nunca pasa por `localStorage`, `sessionStorage`, la URL ni la consola | Conflicto 5. E5-F01-T03 afirma que el token no queda en la página |
| D117 | **Sugerencias estructuradas** (precisa D105). La ejecución y `ResultadoPruebaJira.error` traen `sugerencias[]`, un enum ordenado cuya primera sugerencia es la acción principal (tabla en `CodigoErrorIntegracion`).<br>• Las fallas de Jira sugieren además `IMPORTAR_ARCHIVO`.<br>• Credencial inválida, sitio o proyecto: `IR_A_CONEXION` como acción principal y luego `IMPORTAR_ARCHIVO`.<br>• **`ORGANIZACION_NO_DISPONIBLE` nunca sugiere importar un archivo**, porque el archivo también escribe a través de Organización: en Jira sugiere `REINTENTAR` y en archivo `IMPORTAR_MISMO_ARCHIVO`.<br>El portal convierte las sugerencias en enlaces solo para el Administrador | Conflictos 6 y 7 |
| D118 | **Una importación `INCOMPLETA` ofrece reintentar el mismo archivo.** No trae `continuarDesde`: su sugerencia es `IMPORTAR_MISMO_ARCHIVO`, el portal conserva el archivo en memoria y muestra `boton-importar-de-nuevo`, y lo ya importado queda `SIN_CAMBIOS`. Se agrega el caso E5-F03-T14 (instancia I4, archivo de 500 filas) | Conflicto 8 |
| D119 | **Etiquetas y plantilla.**<br>• `EN_CURSO` se muestra como «En curso» e `INTERRUMPIDA` como «Interrumpida».<br>• Las advertencias se muestran con los textos de `AdvertenciaFila` en `comun.v1.yaml`, tomados del diseño 7.3.<br>• La **plantilla CSV se genera en el cliente**, sin endpoint. Usa el encabezado `codigo,titulo,descripcion,prioridad,celula,sprint,qe_correo` y una fila `EJEMPLO-1` con la indicación «Reemplaza esta fila».<br>• Los mensajes de error, motivo y advertencia del portal son constantes indexadas por código | Conflictos 9 y 10 |
| D120 | **El sprint pertenece a la célula** (precisa D99, misma regla por célula que la semilla de E4).<br>• `Sprint` suma `celulaId` y `GET /v1/catalogos/sprints` acepta el filtro `celulaId`, ambos aditivos. El selector «Sprint de respaldo» muestra solo los de la célula elegida y se limpia al cambiar de célula.<br>• Al guardar la configuración, un sprint de respaldo de otra célula da 422 `CATALOGO_INVALIDO` con `campo: sprintRespaldoId`.<br>• Al crear una HDU desde Jira o desde un archivo, el sprint se busca por nombre **solo entre los de su célula**. En una fila de archivo con una célula distinta de la configurada y sin sprint, el respaldo no sirve: la fila da error `SPRINT_REQUERIDO` (motivo nuevo).<br>• El selector de QE usa el catálogo que ya existe, `GET /v1/catalogos/personas?rol=QE&activo=true` (D54, solo Administrador); no se agrega otro.<br>• Integraciones valida y nombra el destino con `POST /v1/interno/integraciones/destino` de Organización.<br>• `POST /v1/hdu` (manual, E2) no cambia: sigue sin exigir esta regla | Conflicto 12 y regla de E4 |
| D121 | **«Última completada»** es la ejecución más reciente `EXITOSA` o `CON_ERRORES`. Una `INCOMPLETA` no cuenta. `GET /v1/integraciones/estado` trae `ultimaEjecucion`, `ultimaCompletada`, `enCurso` (con `abandonada` si lleva más de 5 minutos) y, solo para el Administrador, `jiraConfigurado` y `continuar` | Conflicto 15 |
| D122 | **Neutralización de fórmulas en todas las exportaciones CSV** (OWASP CSV Injection; precisa D48).<br>• Toda celda de texto que empiece con `=`, `+`, `-`, `@`, tabulación (`\t`) o retorno de carro (`\r`) se prefija con una comilla simple (`'`), antes del entrecomillado RFC 4180.<br>• Los números, las fechas ISO y los booleanos que genera el servidor no se prefijan: son tipados, no los escribe un usuario, y así un número negativo sigue siendo un número.<br>• Rige para las exportaciones de Organización (`hdu`, `auditoria-usuarios`), Certificaciones (`bitacora`, `certificados`) e Impedimentos (`impedimentos`, `gestion-impedimentos`), y para cualquier CSV futuro.<br>• E5 no agrega exportaciones. La plantilla del cliente es fija y no lleva datos del usuario.<br>• La **importación** guarda el texto tal como llega (pregunta 4 del backlog E5) y el portal lo muestra como texto. Se neutraliza al exportar, no al importar.<br>**Efecto sobre lo certificado:** ninguno sobre los resultados esperados. Los tres generadores (`services/*/src/infraestructura/csv/generador-csv.ts`) ya aplican la regla desde E7 y E4, pero no era una decisión y solo Organización la prueba (`e7-reglas.test.ts`). Desde ahora es obligatoria y verificable: hay una prueba unitaria por servicio y una de API por exportación (`q360-qa`, E5-B04-T15), con un título y un motivo que empiezan con cada uno de los 6 caracteres. E7-B04-T09 (10 columnas y 4 filas de CEL-A) y las exportaciones de E4 no cambian, porque ningún dato del fixture empieza con esos caracteres. `q360-qa` lo confirma con una búsqueda antes de certificar | Pedido del usuario. Un CSV del Auditor abierto en Excel no debe ejecutar fórmulas que haya escrito un usuario |
| D123 | **Modelo de datos de Integraciones.** Detalle en «Modelo de datos» más abajo. Solo usa el esquema `integraciones`, sin llaves foráneas a otro esquema. La configuración es una sola fila. `evento_configuracion` y `detalle_ejecucion` son de solo inserción. `ejecucion_integracion` se cierra una sola vez y no se puede modificar después (disparador). Hay una sola ejecución activa (índice único parcial). No hay `DELETE` | D104, D24 y regla no negociable 1 |
| D124 | **Organización.**<br>• **Columnas nuevas** en `historia_usuario`: `origen`, `clave_externa` y `url_externa`. `descripcion` ya existe. Sin llaves foráneas entre esquemas.<br>• **Auditoría:** acción nueva `ACTUALIZAR_HDU`.<br>• **Internos nuevos:** `POST /v1/interno/integraciones/destino` y `POST /v1/interno/integraciones/hdu/upsert`.<br>• **Detalle de HDU:** `GET /v1/hdu/{id}` suma `descripcion`, `origen`, `claveExterna` y `urlExterna`, todos anulables y aditivos.<br>• **Sin cambios:** listados, bandejas y CSV.<br>• **Enlace a Jira:** el portal puede mostrar «Abrir en Jira» con `urlExterna`, que arma Integraciones con el sitio ya validado (D95) | D97, D100, D108 |
| D125 | **Modo estricto y lotes** (precisa D102 y D112).<br>• **Modo estricto:** primero se simula el archivo completo, lote por lote, con `soloSimular: true`. Si hay al menos una fila con error, no se escribe nada y la ejecución queda 200 `FALLIDA` con `MODO_ESTRICTO`. Si no hay errores, se escribe en lotes con `estricto: true`, y cada lote es una sola transacción en Organización.<br>• **Modo normal:** cada fila es su propia transacción.<br>• **Ventana de carrera:** si entre la simulación y la escritura alguien crea una HDU con el mismo código, el lote que la contiene falla completo y queda `INCOMPLETA`. Los lotes anteriores no se revierten, porque no hay transacciones entre servicios. Repetir el archivo es seguro. El riesgo se acepta como en la pregunta abierta 1 de E4 | Atomicidad posible sin transacciones distribuidas. E5-B03-T09 y E5-F03-T08 se cumplen |
| D126 | **Autorización en Integraciones.**<br>• Cada solicitud consulta `GET /v1/interno/acceso` de Organización con el token propagado y `ORGANIZACION_TIMEOUT_MS` (5 s). Ni el rol ni el estado activo salen del token (D4).<br>• **Escrituras** (configurar, probar, sincronizar, vista previa, importar): solo `ADMINISTRADOR`.<br>• **Lecturas del historial:** `ADMINISTRADOR`, `QE` y `AUDITOR`.<br>• **Detalle para el QE:** una sola llamada a `GET /v1/interno/hdu/ambito` (D106). Las filas con error se le muestran con `titulo: null` y `referencia: null`.<br>• **Ejecución inexistente:** 404 al Administrador y al Auditor, 403 al resto.<br>• **Organización caída antes de empezar:** 503 sin ejecución. **Si cae durante la ejecución:** `INCOMPLETA` (o `FALLIDA` si no se procesó nada) con `ORGANIZACION_NO_DISPONIBLE`.<br>• Toda escritura de HDU pasa por el upsert de Organización con el token del Administrador. `X-Q360-Servicio-Token` solo sirve para la semilla | Reglas no negociables 1–3; igual que D18, D47 y D89 |
| D127 | **Gateway → Integraciones** (aprende del incidente de E4, en el que una variable obligatoria tumbó el gateway completo).<br>• **Rutas:** se declaran una por una las 10 de `integraciones.v1.yaml` y se retira `integraciones{/*ruta}` de `NoImplementadoController`. `/v1/interno/*` no se publica.<br>• **`INTEGRACIONES_URL`:** con `NODE_ENV=production`, si falta o no es una URL válida, el gateway **arranca igual**. Solo `/v1/integraciones/*` responde 503 `SERVICIO_NO_DISPONIBLE`, y el registro dice una vez «INTEGRACIONES_URL no configurada o inválida», sin el valor. En desarrollo, el valor por defecto es `http://localhost:3004`.<br>• **Tiempo límite:** `INTEGRACIONES_TIMEOUT_MS`, 12 s por defecto.<br>• **Cuerpo:** hasta 1,5 MB solo en `/v1/integraciones/archivos/*`. Si lo supera, responde 413 `ARCHIVO_MUY_GRANDE` con `ErrorArchivo`. El resto de las rutas conserva su límite.<br>• Las escrituras usan el límite de tasa de escritura que ya existe | D85, D110. Integraciones es opcional para el resto del portal: su ausencia no debe afectar a E1–E4 ni a E7 |
| D128 | **Despliegue gratuito** (precisa D110).<br>• **Proyecto:** quinto proyecto de Vercel, `quality360-integraciones`, con raíz `services/integraciones` y el mismo `vercel.json` y `api/index.mjs` que Impedimentos (`maxDuration: 30`, región `gru1`).<br>• **`INTEGRACIONES_LLAVE_CIFRADO`:** son 32 bytes aleatorios en Base64 (44 caracteres) y van **solo** en las variables de Vercel de ese proyecto, en el entorno Production. En local se usa otra, generada por `npm run local` en el `.env` (no se versiona). Si la llave falta o no decodifica a 32 bytes, **el servicio arranca igual**: `/health` responde 200 y solo las operaciones que cifran o descifran responden 503 `LLAVE_CIFRADO_NO_DISPONIBLE`.<br>• **Cambio de llave:** cambiarla deja el token como `TOKEN_NO_DESCIFRABLE` y hay que volver a ingresarlo. `llave_version` queda para una rotación futura.<br>• **Gateway:** suma `INTEGRACIONES_URL`. Organización no necesita variables nuevas.<br>• **Migraciones y RLS:** se aplican al cerrar la corrida (D13): `20261029000000_e5_origen_hdu` (Organización), `20261029000000_e5_integracion_jira` (Integraciones) y `infrastructure/nube/005_rls_integraciones_nube.sql` | D94, D110; misma lección que D127 |
| D129 | **`IMPEDIMENTOS_URL` deja de ser obligatoria en el gateway** (decisión del usuario, 2026-10-30; precisa D85 y cierra la pregunta abierta 1).<br>• Sigue el mismo patrón que `INTEGRACIONES_URL` (D127): con `NODE_ENV=production`, si falta o no es una URL `http`/`https` válida, el gateway **arranca igual**. Solo las rutas de Impedimentos del gateway (las de E4 en `gateway.v1.yaml`) responden 503 `SERVICIO_NO_DISPONIBLE`, sin llamar a ningún servicio. El registro dice una vez «IMPEDIMENTOS_URL no configurada o inválida», sin el valor. En desarrollo, el valor por defecto sigue siendo `http://localhost:3003`.<br>• Una URL inválida recibe el mismo trato en cualquier entorno, para ambas variables. Los tiempos límite inválidos (`*_TIMEOUT_MS`) sí impiden arrancar: no son la dirección de un servicio opcional.<br>• La sesión se verifica antes: sin token, esas rutas siguen respondiendo 401.<br>• **Sin cambios:** el cierre de HDU lo decide Organización con su propia `IMPEDIMENTOS_URL` (D60, D91), y sus 409 y 503 llegan tal cual. `/health` responde 200.<br>• **Cambia lo documentado** en `GUIA-VERCEL.md`, que la daba por obligatoria («el gateway no arranca sin ella»), y la prueba del gateway que esperaba el error al arrancar | Incidente de E4: una variable obligatoria tumbó el gateway completo y con él todo el portal. Impedimentos, como Integraciones, es una capacidad que puede faltar sin afectar a E1–E3, E5 ni E7 |

## Modelo de datos (lo escribe `q360-backend`)

**Migración de Integraciones** `services/integraciones/prisma/migrations/20261029000000_e5_integracion_jira/migration.sql` (Prisma con `@map`, como en los otros servicios). Las restricciones CHECK, los índices parciales, los disparadores y los `REVOKE` van en SQL y se documentan en `schema.prisma`.

**`configuracion_jira`** (una fila; columnas de la sección 6.1 del backlog E5):
- `id smallint PRIMARY KEY CHECK (id = 1)`.
- `token_cifrado`, `token_iv` y `token_tag` son `bytea NOT NULL`, con CHECK `octet_length(token_iv) = 12` y `octet_length(token_tag) = 16`. El dato asociado del cifrado es `q360:jira:token:v1` y `llave_version` es 1. `token_ultimos4 char(4)` es lo único del token que se guarda en claro.
- `estado_conexion` tiene un CHECK con `SIN_PROBAR`, `OK` y `FALLIDA`. `celula_id`, `qe_responsable_id` y `sprint_respaldo_id` son UUID sin llave foránea (D24).
- Una prueba fallida en `PUT` solo actualiza `estado_conexion`, `ultima_prueba_en` y `ultima_prueba_codigo` (D112). Sin una fila previa, no inserta nada.
- `REVOKE DELETE`.

**`evento_configuracion`** (solo inserción):
- Columnas: `id_evento uuid PK DEFAULT gen_random_uuid()`, `actor_id uuid`, `actor_nombre varchar(150)`, `fecha timestamptz DEFAULT now()`, `campos_cambiados jsonb NOT NULL` (CHECK `jsonb_typeof = 'array'`, solo nombres de campo), `token_cambiado boolean NOT NULL` y `resultado_prueba varchar(40) NOT NULL`.
- Índice `(fecha DESC)`.
- `REVOKE UPDATE, DELETE`.

**`ejecucion_integracion`** (columnas de la sección 6.1, más `duracion_ms integer NULL`):
- CHECK de catálogo para `origen` y `resultado` (6 valores).
- `ejecucion_cierre_ck`: `(resultado = 'EN_CURSO') = (terminada_en IS NULL)`.
- `ejecucion_contadores_ck`: `terminada_en IS NULL OR creadas + actualizadas + omitidas + con_error = leidas`.
- `ejecucion_archivo_ck`: `origen = 'JIRA' OR (archivo_nombre IS NOT NULL AND archivo_tamano IS NOT NULL AND archivo_huella ~ '^[0-9a-f]{64})`.
- `ejecucion_continuar_ck`: `origen = 'JIRA' OR (hay_mas = false AND continuar_desde IS NULL)`.
- Índice único parcial `ejecucion_en_curso_key ON ejecucion_integracion ((true)) WHERE terminada_en IS NULL`. Si el `INSERT` lo viola, la respuesta es 409 `INTEGRACION_EN_CURSO`.
- Al iniciar, en la misma transacción que el `INSERT`, se cierran como `INTERRUMPIDA` las ejecuciones `EN_CURSO` con `iniciada_en` de hace más de `INTEGRACIONES_EN_CURSO_MAX_MS` (300000 por defecto, D104). Sus contadores se calculan desde `detalle_ejecucion`.
- Disparador `ejecucion_cerrada_inmutable` (`BEFORE UPDATE`): si `OLD.terminada_en IS NOT NULL`, rechaza; también rechaza cambiar `id_ejecucion`, `origen`, `actor_*` o `iniciada_en`.
- Índices: `(iniciada_en DESC)`, `(origen, iniciada_en DESC)` y `(resultado, iniciada_en DESC)`.
- `REVOKE DELETE`.

**`detalle_ejecucion`** (solo inserción; columnas de la sección 6.1, más `titulo varchar(200) NULL`):
- `id_ejecucion` es FK a `ejecucion_integracion`, dentro del mismo esquema, con `ON DELETE RESTRICT`.
- `UNIQUE (id_ejecucion, fila)`.
- CHECK de `resultado` (4 valores).
- `detalle_motivo_ck`: `(resultado IN ('OMITIDA','ERROR')) = (motivo IS NOT NULL)`.
- `detalle_historia_ck`: `resultado NOT IN ('CREADA','ACTUALIZADA') OR id_historia IS NOT NULL`.
- Disparador `detalle_solo_en_curso` (`BEFORE INSERT`): rechaza filas de una ejecución cerrada.
- Índices: `(id_ejecucion, resultado, fila)` e `(id_historia)`.
- `REVOKE UPDATE, DELETE`.
- `cambios` guarda valores recortados a 200 caracteres. Nunca se guarda el contenido del archivo ni un texto de Jira más allá de `referencia` (estado y responsable).

**Nube:** `infrastructure/nube/005_rls_integraciones_nube.sql` activa RLS sin políticas en las 4 tablas, para que la Data API no las exponga, y repite los `REVOKE`, porque en la nube los privilegios por defecto los vuelven a otorgar, igual que en `004`. Las pruebas E5-B01-T12 y E5-B04-T10 esperan 42501 o el error del disparador.

**Migración de Organización** `services/organizacion/prisma/migrations/20261029000000_e5_origen_hdu/migration.sql`:
- `ALTER TABLE historia_usuario ADD COLUMN origen varchar(10) NOT NULL DEFAULT 'MANUAL'`, con CHECK `historia_usuario_origen_ck` (`MANUAL`, `JIRA`, `CSV`, `JSON`). Las filas existentes y las de la semilla quedan `MANUAL`.
- `ADD COLUMN clave_externa varchar(60) NULL` y `ADD COLUMN url_externa varchar(300) NULL`, con CHECK `historia_usuario_externa_ck`: `(clave_externa IS NULL AND url_externa IS NULL) OR origen = 'JIRA'`. Se llenan al crear desde Jira o al vincular desde Jira. Una HDU que no es manual conserva su origen cuando la actualiza otra fuente (D97).
- Índice `historia_usuario_origen_idx (origen) WHERE origen <> 'MANUAL'`, para la limpieza de QA y las consultas.
- `ALTER TYPE "AccionAuditoria" ADD VALUE 'ACTUALIZAR_HDU'`. No se usa en la misma transacción en que se agrega.
- Prisma: `origen String @default("MANUAL") @db.VarChar(10)`, `claveExterna String? @map("clave_externa") @db.VarChar(60)` y `urlExterna String? @map("url_externa") @db.VarChar(300)`.

Certificaciones e Impedimentos no tienen migración en esta corrida. Solo suman la prueba de D122.

## Resolución de los conflictos del diseño (sección 14)

| # | Resolución |
| --- | --- |
| 1 | Se acepta este orden: checklist → «Descripción y origen» → Impedimentos → Riesgo → Cambiar estado. Ningún testid certificado cambia |
| 2 | D113 |
| 3 | D114 |
| 4 | D115 |
| 5 | D116 |
| 6 | D117 |
| 7 | D117: se muestran las dos sugerencias y «Ir a Conexión» es la acción principal |
| 8 | D118 |
| 9 | D119 |
| 10 | D119 |
| 11 | Se acepta: «Importar» sigue habilitado en modo estricto con errores y cuando no hay nada que importar, porque se registra la ejecución |
| 12 | D120 |
| 13 | Se acepta: no hay diálogo de confirmación al vincular. Basta con `aviso-vincular-activo` y la vista previa |
| 14 | Se acepta: el servidor responde siempre «Ya hay una sincronización en curso» y el portal usa su texto por pestaña con el mismo `aviso-en-curso` |
| 15 | D121 |
| 16 | Se acepta: el historial no tiene exportación y el `AvisoSoloLectura` del Auditor no se cambia |
| 17 | Se acepta `?ejecucion=<id>` sin ruta propia |
| 18 | Se acepta. `q360-qa` revisa las pruebas que cuentan secciones de `/hdu/:id` por posición |
| 19 | Se acepta: la referencia de Jira es visible para QE y Auditor solo en las filas que pueden ver. En las filas con error del QE, `referencia` viene `null` (D126) |

## Supuestos abiertos del backlog E5 (sección 16)

| # | Resolución |
| --- | --- |
| 1 | D114: el diseño no depende de la duración del plan |
| 2 | Se mantiene. E5-MAN-01 verifica `search/jql`, `nextPageToken`, el campo Sprint y el orden por clave. Si el orden no sirve, `continuarDesde` pasa a contener el `nextPageToken` sin que cambie el contrato (es un string de hasta 40 caracteres; si el token de Jira fuera más largo, se reabre el contrato) |
| 3 | Se confirma: el Líder QA no ve el historial |
| 4 | D122 |
| 5 | La tabla `Importacion` no existe en ninguna migración ni SQL. `q360-integraciones` corrige `infrastructure/seed/mvp/README.md` |
| 6 | Se confirma: un proyecto y una célula por configuración |

## Pruebas certificadas afectadas (sección 9 del backlog E5)

| Prueba | Qué pasa | Dueño |
| --- | --- | --- |
| `e1-f02-portal-qe.spec.ts` `[E1-F02#3]` y su prueba unitaria | El menú del QE pasa a `["Bandeja","Equipo","Historias supervisadas","Impedimentos","Integraciones","Perfil"]` | `q360-qa`, `q360-frontend` |
| Las de E1-F07/F08 y E7-F05 que afirmen el menú exacto del Administrador | Pasa a `Bandeja, Usuarios, Supervisión, Integraciones, Perfil` | `q360-qa` |
| E7-F06-T07 | Recorre también la 6.ª pestaña («Integraciones») y no encuentra `button[type=submit]` | `q360-qa` |
| Las del gateway que afirmen 501 en `/v1/integraciones/*` | Ahora reenvían al servicio, o responden 503 sin `INTEGRACIONES_URL` | `q360-seguridad-gateway`, `q360-qa` |
| `tests/support/contrato.ts` | Carga también `integraciones.v1.yaml`. Con esquema estricto, `HduDetalleBase` y `Sprint` aceptan los campos nuevos | `q360-qa` |
| Suites de E7 que cuentan HDU | Necesitan la limpieza de la sección 9 (HDU con `origen <> 'MANUAL'` y `integraciones.*`) después de cada archivo E5 | `q360-qa` |

## Trazabilidad E5

| Capacidad | Frontend | Backend | Contrato |
| --- | --- | --- | --- |
| Configurar y proteger la credencial | E5-F01 | E5-B01 | `GET\|PUT /v1/integraciones/jira/configuracion`, `POST …/probar`, `GET …/eventos`, `POST /v1/interno/integraciones/destino`, `GET /v1/catalogos/{sprints,personas}` |
| Sincronizar con Jira | E5-F02 | E5-B02 | `POST /v1/integraciones/jira/sincronizaciones`, `POST /v1/interno/integraciones/hdu/upsert` |
| Importar CSV/JSON | E5-F03 | E5-B03 | `POST /v1/integraciones/archivos/{vista-previa,importaciones}` |
| Historial y detalle | E5-F04 | E5-B04 | `GET /v1/integraciones/{ejecuciones, ejecuciones/{id}, ejecuciones/{id}/detalle, estado}`, `GET /v1/interno/hdu/ambito` |
| Descripción y origen en el detalle | E5-F02 | E5-B02 | `GET /v1/hdu/{id}` |

## Preguntas abiertas

1. ~~**`IMPEDIMENTOS_URL` obligatoria.**~~ Resuelta por D129 (decisión del usuario): `IMPEDIMENTOS_URL` sigue el patrón de D127 en el gateway; sin ella, solo las rutas de E4 responden 503. `GUIA-VERCEL.md` ya lo refleja.
2. **Regla sprint–célula en el alta manual.** D120 la exige solo a las HDU que llegan por integración. Extenderla a `POST /v1/hdu` cambiaría E2-B01, que ya está certificada.
3. **Carrera en el modo estricto (D125).** Si se necesita atomicidad completa para archivos de más de 25 filas, habría que admitir lotes de hasta 500 en una transacción, con un límite de tiempo propio. Hoy no se justifica.

---

# Mejoras de uso tras E4

| ID | Decisión | Motivo |
| --- | --- | --- |
| D130 | **Checklist en orden libre.** Cualquier entregable `PENDIENTE` se marca sin esperar a los anteriores, y cualquier entregable marcado se desmarca sin seguir un orden. Reemplaza el orden estricto de D17. Se mantienen: un registro por entregable (E3-B01#2), la aprobación solo del QE responsable, el certificado automático (D19, que sigue exigiendo los entregables 1 a 8 aprobados) y el bloqueo de una HDU cerrada. El código `ORDEN_ENTREGABLES` queda en desuso. Cambian los escenarios E3-F02#2 y E3-B02#1 | Pedido del usuario: el proceso no debe ser lineal |
| D131 | **Selección dentro de diálogos con lista visible.** Los selectores de los diálogos «Asignar analista» y «Reasignar QE responsable» se muestran como lista con hasta 6 filas y desplazamiento propio, en vez del desplegable nativo, que se abría fuera de la ventana y ocultaba opciones | Pedido del usuario |
| D209 | **Diseño de las bandejas.** IBM Plex Sans pasa a ser la tipografía de todo el portal (antes solo la usaba la pantalla de acceso). La barra superior abre con el logo y la marca «Quality360» arriba a la izquierda (enlace a `/`; el ícono es decorativo, `alt=""`), la sesión a la derecha con las iniciales del usuario y el menú «Portal» debajo. Sobre 750 px la barra queda fija al desplazar. Cada bandeja abre con un encabezado que trae los accesos rápidos (`nav` «Accesos rápidos», antes un panel al final) y una franja de contadores agrupados por tema: Analista «Mi asignación · Mi trabajo · Impedimentos»; QE «Mis pendientes · Mi equipo», luego «Requiere mi acción» e «Impedimentos y riesgo» junto a su lista; Administrador «Usuarios · Supervisión y organización», pendientes y últimos cambios lado a lado, e «Impedimentos y riesgo»; Auditor «Registros · Actividad reciente · Impedimentos». No cambian rutas, permisos, datos, testids ni los textos que buscan las pruebas certificadas.<br>• Número repetido con D209 (OAuth); ver «Numeración» en la sección «E5 · Conexión con Jira por OAuth 2.0 (3LO)» | Pedido del usuario: logo arriba a la izquierda, tipografía acorde y contenedores ordenados |
| D224 | **Orden y simetría de la bandeja del Administrador.** El orden sigue el objetivo de la bandeja, que es tener configurados a los usuarios y la supervisión: (1) estado, con «Usuarios» y «Supervisión y organización» en dos mitades iguales de tres tarjetas cada una; (2) «Pendientes de configuración» a todo el ancho; (3) «Impedimentos y riesgo», de solo consulta y a todo el ancho, con «HDU totales» como referencia de las bloqueadas y en riesgo alto, y debajo «Impedimentos escalados a mí»; (4) «Últimos cambios» al final, a todo el ancho. Cada fila ocupa todo el ancho o se reparte en partes iguales; se retira la rejilla de dos paneles de alto distinto (D209). En todas las bandejas, las tarjetas de una misma fila comparten el alto, y en móvil los grupos usan dos columnas fijas: si el grupo tiene un número impar de tarjetas, la última ocupa la fila completa. No cambian rutas, permisos, datos, testids ni textos | Pedido del usuario: paneles simétricos, el historial al final y el orden según el objetivo de la bandeja |

---

# E5 · Consulta de Jira y asignación de HDU

Detalle, escenarios y casos en `docs/backlog/e5-consulta-asignacion.md` (HDU nuevas E5-F05 y E5-B05; reescritas E5-F02 y E5-B02; aditivas E5-F04 y E5-B04). Decisiones del usuario (2026-11-02): flujo en dos pasos, sin sincronización automática; la consulta queda guardada en el servidor; el Administrador asigna célula, QE y analista; confirmar crea solo lo marcado y asignado y no llama a Jira.

| ID | Decisión | Motivo |
| --- | --- | --- |
| D132 | **Flujo de dos pasos.** «Consultar Jira» llama a Jira una vez (por tandas si es grande) y guarda una consulta; revisar, asignar y confirmar no llaman a Jira. Se retira `POST /v1/integraciones/jira/sincronizaciones`. Sin tarea programada. La pestaña se llama «Consultar Jira» y conserva `pestana-sincronizar`. Lo anterior queda en el historial con fase `DIRECTA` | Pedido del usuario |
| D133 | **La consulta es una entidad guardada** (`consulta_jira`, `consulta_item`). Guarda solo lo mapeado de cada issue, nunca la respuesta cruda ni credenciales. Excepción acotada a D104/D123: los textos de Jira viven mientras la consulta está abierta y se purgan al cerrarse, vencer, reemplazarse o descartarse. `consulta_item` es la única tabla de Integraciones con `DELETE` | La revisión necesita los textos; la purga limita la retención |
| D134 | **Vida de la consulta.** Una sola abierta a la vez (índice único parcial); vigencia de 24 h desde la última llamada a Jira (`INTEGRACIONES_CONSULTA_VIGENCIA_MS`); estados `ABIERTA`, `CONFIRMADA`, `REEMPLAZADA`, `VENCIDA`, `DESCARTADA`; reemplazar exige `reemplazar: true` (409 `CONSULTA_ABIERTA`); vencimiento perezoso; compartida entre Administradores | Evita consultas paralelas y datos viejos |
| D135 | **Consultar respeta los límites de E5** (D96, D105, D114): tandas de 100, 8 s, 429. «Continuar consulta» acumula en la misma consulta sin perder asignaciones. Tope de 500 filas por consulta (`TOPE_DE_CONSULTA`, 409 `CONSULTA_LLENA`). Cada tanda registra su ejecución (fase `CONSULTA`) | Mismo diseño de E5 |
| D136 | **Clasificación** en `NUEVA`, `CAMBIO` (título, descripción o prioridad no vacíos y distintos, como D98), `SIN_CAMBIOS` (incluye HDU `CERRADA`) y `CON_ERROR`, contra Organización en solo lectura (`POST /v1/interno/integraciones/hdu/estado-codigos`). `SPRINT_NO_ENCONTRADO` se calcula al asignar, no al consultar. Si Organización no responde, la ejecución es `FALLIDA` y no se guarda consulta | Separar nuevas, cambios y sin cambios |
| D137 | **Asignación de una HDU nueva.** Célula, QE, analista y sprint son obligatorios para marcarla (supuesto S2). Las filas nacen sin asignar. Sprint (supuesto S1): el de Jira buscado por nombre dentro de la célula elegida; si no, el de respaldo de la configuración solo si es de esa célula (D120); si no, vacío. Siempre editable | Jira propone, el Administrador decide |
| D138 | **Coherencia.** No existe pertenencia de QE ni de Analista a una célula en E1/E2/E7. Se valida: QE activo con rol QE (D54), Analista activo **del equipo vigente del QE elegido** (E2-F02, ADR 0009; más estricto que lo permitido al Administrador en E2) y sprint de la célula (D120). Sin Líder activo en la célula: aviso, no bloqueo. Cambiar el QE limpia el analista; cambiar la célula recalcula el sprint | La relación real es QE–equipo |
| D139 | **Edición por fila y en grupo** (`PATCH …/items`, ids o `{grupo, todas}`): aplicación parcial informada (`rechazadas`, `desmarcadas`); solo se marca lo completo; `version` de la consulta, y confirmar exige la versión vista (409 `CONSULTA_MODIFICADA`) | Dos Administradores |
| D140 | **Confirmar** no llama a Jira ni lee la configuración. Pre-valida todas las asignaciones (409 `ASIGNACIONES_INVALIDAS` sin escribir); escribe por lotes de 25 con el token del Administrador; crea las nuevas marcadas y actualiza solo título, descripción y prioridad de las marcadas en «Cambiaron»; omite con `HDU_CREADA_DESPUES`, `HDU_CERRADA` o `SIN_CAMBIOS`; si queda `INCOMPLETA`, «Continuar confirmación» procesa solo lo no aplicado; al terminar, las filas sin marcar se descartan | Pedido del usuario y carreras identificadas |
| D141 | **Historial y auditoría.** `ejecucion_integracion` suma `fase` (`DIRECTA`, `CONSULTA`, `CONFIRMACION`), `consulta_id` y contadores de consulta; el invariante de D103 pasa a ser por fase. Cada HDU creada deja `CREAR_HDU` con la asignación y una entrada inicial del historial de asignación (E2-B04); el detalle de la confirmación suma `asignacion` | Trazabilidad de quién asignó qué |
| D142 | **Permisos.** Todas las rutas de la consulta son solo del Administrador; el Auditor lee registros (historial), no el borrador | Mínimo privilegio |
| D143 | **CSV/JSON sin cambios** (propuesta; pregunta abierta 1). La configuración (célula, QE, sprint de respaldo) sigue obligatoria y rige para archivos; solo cambian los textos de ayuda | Cero regresión en E5-F01/F03/B01/B03 |
| D144 | **Vincular HDU creadas a mano, por fila:** marcar una HDU `MANUAL` en «Cambiaron» equivale a vincularla (D97); su origen pasa a `JIRA` y no cambian estado, analista, QE ni sprint | Misma regla de D97, fila por fila |

**Preguntas abiertas:** resueltas por el usuario el 2026-11-02 (sección 13 del backlog): (1) CSV/JSON sin cambios (D143); (2) no se modela la pertenencia a célula, queda como mejora futura de E1/E7 (D138); (3) célula y QE de Conexión siguen obligatorios y sirven como sugerencia del panel de grupo (D146); (4) las filas sin marcar se descartan al confirmar (D140).

## Decisiones del arquitecto (contratos y plan, 2026-11-02)

Contratos: `integraciones.v1.yaml`, `gateway.v1.yaml`, `organizacion.v1.yaml` y `comun.v1.yaml`. Plan, modelo de datos y despliegue: `docs/arquitectura/e5-consulta-plan-construccion.md`. ADR 0016.

| ID | Decisión | Motivo |
| --- | --- | --- |
| D145 | **Seleccionar ≠ marcar.** Sobre una fila nueva hay dos controles: `casilla-seleccionar` (estado del portal, no se guarda: a qué filas actúa el panel de grupo) y `casilla-marcar` (`marcada` del servidor: incluir en la confirmación, solo filas «Listas»). `PATCH …/items` acepta como alcance `itemIds` (1 a 100, la selección del portal, sirve con filtro de texto activo) **o** `{grupo, todas: true, q?}` (todo el grupo o, con `q`, todas las que coinciden); suma `marcarListas` («Incluir en la confirmación las filas que queden listas»: marca las que quedan completas y cuenta el resto en `incompletas`, sin rechazarlas). Con alcance de **una fila**, un rechazo es 422 con el código; con varias, 200 con `rechazadas`. Se corrigen E5-F05-T06, T07, T14 y T24 y los identificadores de la sección 9 (`casilla-seleccionar-grupo` en «Nuevas»; `casilla-marcar-grupo` queda solo en «Cambiaron») | Brecha 1 y 2 del diseño (§14): marcar una fila incompleta la rechaza D139, así que el flujo «marca y asigna en grupo» era imposible |
| D146 | **Sugerencia del destino, como instantánea.** Al crear la consulta se copian célula, QE y sprint de respaldo de la configuración (`sugerencia`). Célula y QE solo preseleccionan el panel de grupo; **no** preasignan filas (D137 sigue). La propuesta de sprint usa el respaldo de la instantánea, de modo que editar y confirmar no leen la configuración | Respuesta 3 del usuario; la consulta no cambia si alguien edita Conexión mientras se revisa |
| D147 | **Analistas del equipo de un QE:** `GET /v1/catalogos/personas?supervisorId=<qeId>` (solo Administrador): Analistas QA activos del equipo vigente; un QE sin analistas da `items: []`; un `supervisorId` que no es QE activo, 422 `QE_INVALIDO`. Una petición por QE elegido; el portal la guarda en memoria mientras la consulta está abierta | Brecha 3 del diseño; el filtro ya estaba previsto en la sección 5 del backlog |
| D148 | **Bordes de la consulta.** (a) `GET …/consultas/{id}` es la lectura barata con `version` (una fila y conteos) para saber si otro Administrador la cambió; el portal la llama al volver a la pestaña y antes de confirmar; no hay sondeo. (b) `GET …/items` de una consulta cerrada responde 409 `CONSULTA_NO_ABIERTA` (o 410 si venció), nunca una lista vacía. (c) «Continuar consulta» con `hayMas: false` responde 409 `CONSULTA_COMPLETA` (código nuevo). (d) Una fila ya `aplicada` por una confirmación incompleta es de solo lectura (`FILA_NO_ASIGNABLE` / `FILA_NO_MARCABLE`). (e) La fila guarda los **nombres** de célula, QE, analista y sprint al asignarlos (los da Organización al validar), así listar filas no llama a Organización y el detalle de la confirmación los copia | Brechas 4 del diseño y casos borde sin regla en el backlog |
| D149 | **Contadores `res-*` = acumulados de la consulta** (`Consulta.leidas`, `nuevas`…): T07 espera 100 → 200 → 230. La `Ejecucion` de cada tanda trae solo esa tanda («Esta tanda: N historias») y es lo que muestra el Historial | Brecha 5 del diseño |
| D150 | **Ejecuciones directas antiguas.** Se muestran con fase `DIRECTA` y sus datos tal cual (`hayMas` y `continuarDesde` quedan como dato histórico), pero **ya no se continúan**: `EstadoIntegracion.continuar` deja de emitirse y las sugerencias de una `DIRECTA` no incluyen `CONTINUAR`. El portal ofrece «Ir a Consultar Jira» solo para fases `CONSULTA` y `CONFIRMACION` | Brecha 7 del diseño; la ruta de sincronización se retira (D132) |
| D151 | **Organización sin migración.** `hdu_historial_asignacion.analista_anterior_id` ya admite nulo (migración `init`), y la auditoría guarda `consultaId` y la asignación en su JSON: no se crea `<fecha>_e5_asignacion_inicial`. El upsert suma el **modo confirmación** (`consultaId` y `operacion` `CREAR`/`ACTUALIZAR` por fila, con `asignacion` en `CREAR`), y dos internos de lectura: `hdu/estado-codigos` y `asignaciones/validar`, que también **propone el sprint** (Organización es dueña de los sprints; Integraciones no busca nombres) | Menos cambios en la base; una sola dueña de cada regla |
| D152 | **Límite de tasa de la edición de la consulta.** El guardado inmediato por cambio (diseño §1.4) supera fácil el límite de escritura del gateway (30 por minuto). `PATCH /v1/integraciones/jira/consultas/{id}/items` usa un cubo propio, `LIMITE_TASA_CONSULTA_MAX` (120 por minuto, misma clave por IP y misma ventana que el limitador actual), y queda fuera del cubo de escritura general; el límite general (300) no cambia. Un 429 en la edición se muestra en la fila («No se pudo guardar» + «Reintentar») | Evitar 429 al asignar 10 filas a mano |

---

# E5 · Detalle de la HDU y asignación una a una

Backlog: `docs/backlog/e5-detalle-asignacion-por-hdu.md` (HDU nuevas E5-F06, E5-F07, E5-B06 y E5-B07; ajustes a E5-F05, E5-B05, E5-B02, E5-F02, E5-F04 y E5-B04). Diseño: `docs/diseno/e5-detalle-asignacion-por-hdu.md`. ADR 0018. Plan: `docs/arquitectura/e5-detalle-plan-construccion.md`. Contratos (aditivos): `integraciones.v1.yaml`, `organizacion.v1.yaml`, `gateway.v1.yaml` y `comun.v1.yaml`.

Decisiones del usuario (2026-11-05):

1. Cada HDU tiene un panel con todo el detalle que trae Jira.
2. La lista de Analistas sale de la supervisión vigente del QE elegido. Si el QE supervisa exactamente uno, se asigna solo.
3. «Confirmar asignación» de una fila crea la HDU y la deja guardada. Se conserva «Confirmar marcadas (N)».
4. Si la HDU ya está asignada en Quality360, se muestra la alerta «Esta HDU ya fue asignada a <QE> / <Analista>» y no se puede reasignar desde la consulta.

El analista propuso D196–D207. El arquitecto las acepta con los ajustes marcados como **Ajuste**.

| ID | Decisión | Motivo |
| --- | --- | --- |
| D196 | **El detalle viaja en la misma llamada.** `fields` de `GET /rest/api/3/search/jql` suma `created`, `updated`, `duedate`, `resolutiondate`, `parent` y, si fue detectado, el campo de criterios. No se agrega ninguna llamada: queda prohibido `GET /issue/{clave}` y también `expand=renderedFields`. Se mantienen la página de 50, la tanda de 100, los 3 s por petición, los 8 s por tanda y el 429. **Ajuste:** el tamaño de página pasa a leerse de `INTEGRACIONES_JIRA_TAMANO_PAGINA` (50 por defecto, mínimo 10, máximo 100), así se puede bajar a 25 sin tocar código. **Ajuste (puerto `FuenteJira`, interfaz fija):** todos los cambios son aditivos. `IssueJira` suma campos opcionales (`creada`, `actualizada`, `vencimiento`, `resolucion`, `padre`, `criteriosAdf`). `SprintJira` suma `inicio?`. La consulta de `buscarPagina` suma `campoCriterios?`. Se agrega el método `detectarCampos()`, que devuelve `{ sprint, criterios }` con la misma llamada a `/field`. `detectarCampoSprint` no cambia y pasa a delegar en `detectarCampos()`. Es un aviso para `q360-backend`: nadie fuera de Integraciones implementa el puerto, pero los dobles de prueba (`test/ayudas.ts`) sí deben implementarlo | Cero llamadas extra; el contrato del puerto no se rompe |
| D197 | **«Toda la información» son los campos de `DetalleHdu`:** resumen, descripción, criterios, estado, prioridad de Jira y su equivalente en Quality360, tipo, responsable, etiquetas, sprints, épica, fechas y URL. Quedan fuera los comentarios, los adjuntos, las subtareas, los enlaces, el historial y los worklogs, porque exigen otras llamadas. Se registran como mejora futura | Delimitar «todo» a lo que cabe en una llamada |
| D198 | **Almacenamiento y saneamiento.** `consulta_item.detalle jsonb NULL` guarda hasta 40 KB, con el CHECK `octet_length(detalle::text) <= 40960`, y se purga junto con la fila. Nunca se copia a la HDU, a la auditoría, al historial, a `detalle_ejecucion` ni a los logs. El saneamiento ocurre en `services/integraciones/src/dominio/mapeo/` (dominio puro) y produce **texto plano**: listas con «• » o «1. », tablas como «celda · celda», y `media`, macros y extensiones como «[contenido no mostrable]». Los enlaces solo quedan como «texto (url)» cuando la URL es `http(s)`. Se quitan los caracteres de control. Límites: descripción 8.000, criterios 4.000, épica 200, 20 etiquetas de 50 caracteres y 10 sprints, cada campo con su `truncado`. El portal pinta texto con `pre-wrap` y solo vuelve clicables los tokens `https?://`, como elementos de React. Nunca usa `dangerouslySetInnerHTML` | D104, D122. Lo escribe cualquiera en Jira |
| D199 | **Criterios de aceptación.** Se toman en este orden: (1) el campo personalizado cuyo nombre es «Acceptance Criteria» o «Criterios de aceptación», detectado con la **misma** respuesta de `/field`; (2) la sección de la descripción que empieza en ese encabezado; (3) `null`. **Ajuste:** la detección se hace al **guardar** la conexión, que es donde hoy se detecta Sprint. Al probarla no se detecta, porque probar hace solo `myself` y `project`. Se guarda en la columna nueva `configuracion_jira.campo_criterios varchar(30) NULL`. Las configuraciones existentes quedan en `NULL` hasta el siguiente guardado y, mientras tanto, usan la opción (2) | Determinista y sin llamada nueva |
| D200 | **Ruta de detalle:** `GET /v1/integraciones/jira/consultas/{id}/items/{itemId}`, solo para el Administrador. **Ajuste:** la respuesta es `DetalleItemConsulta { item, detalle, leidaEn, version }` y trae la fila con su `revision`, así el panel puede confirmar sin una segunda lectura. Una fila anterior al cambio llega con `detalle: null`; es un 200, no un error. El listado **no** incluye el detalle | Listados livianos; confirmar desde el panel |
| D201 | **Analista único.** Al fijar el QE sin Analista, Integraciones agrega `proponerAnalista: true` en la llamada a `asignaciones/validar` que ya hace. Organización cuenta los Analistas QA activos con `supervision.fecha_hasta IS NULL` de ese QE y devuelve `analistasActivos` y, solo si hay exactamente uno, `analistaPropuesto`. En ese caso la fila queda con `analistaAuto: true`. Con 0 o con 2 o más Analistas no hay error y el campo queda vacío. Un `analistaId` explícito se valida como en D138 y deja `analistaAuto: false`. La regla vale también para la edición en grupo. **No hay endpoint nuevo:** la lista del selector sigue siendo `GET /v1/catalogos/personas?supervisorId=` (D147), y las dos reglas usan la misma consulta del repositorio de supervisión de Organización | Pedido del usuario; una sola dueña |
| D202 | **Confirmar una HDU:** `POST …/items/{itemId}/confirmaciones {revision}`. El orden de validación es el del contrato. La toma atómica es un `UPDATE … WHERE revision = $2 AND NOT aplicada AND (aplicando_desde IS NULL OR aplicando_desde < now() - 30 s)`. Luego se llama a `asignaciones/validar` y a `hdu/upsert` con un lote de 1 fila `CREAR`. Al final, en una transacción: la fila queda `aplicada` y `marcada` (por el CHECK `aplicada_marcada`), y se guardan `id_historia`, `aplicacion` y `consulta.creadas`. Sin el candado global. **Ajustes:** (a) la ejecución de alcance `HDU` se inserta **ya cerrada**, en la misma transacción, de modo que nunca ocupa `ejecucion_en_curso_key` (D104) ni bloquea un lote o una consulta. (b) La idempotencia es por (`consultaId`, código, **actor**): si el mismo Administrador reintenta, recibe 200 `repetida: true`; si es otro, recibe 409 `HDU_YA_ASIGNADA`. Así, con dos Administradores, solo uno recibe 200 (E5-B07#8). (c) `hdu/upsert` **no** responde 409 porque es de lote: la fila responde `OMITIDA` `HDU_CREADA_DESPUES` con `existente` (`creadaPorEstaConsulta`, `creadaPorActor`, con los nombres actuales), e Integraciones traduce esa respuesta. (d) Cuando Organización no responde, la respuesta es 503 `SERVICIO_NO_DISPONIBLE`, no `ORGANIZACION_NO_DISPONIBLE`, que es un `CodigoErrorIntegracion` y no un código HTTP. La toma se libera. (e) El lote toma sus filas con la misma condición, de modo que una fila nunca la procesan los dos caminos. (f) `PATCH` sobre una fila en toma responde `FILA_EN_CURSO`. (g) Esta ruta usa el cubo `LIMITE_TASA_CONSULTA_MAX` (D152) | Pedido del usuario; dos Administradores; reintentos |
| D203 | **«Confirmar marcadas (N)».** Sigue la regla de D140 y omite las filas `aplicadas` y las que están en toma, sin contarlas ni tratarlas como error. Si no quedan marcadas pendientes, responde 422 `SIN_SELECCION`. La ejecución lleva `alcance: LOTE` | Escala; cero regresión |
| D204 | **HDU ya asignada.** Toda HDU existente tiene QE (D54), por lo que toda fila con HDU existente trae `yaAsignada {idHistoria, qe, analista}`, que viene de `estado-codigos` (este suma `analista`). La alerta tiene texto fijo. Mientras exista, la fila no tiene controles de asignación ni «Confirmar asignación». La autoridad al confirmar es Organización: responde 409 `HDU_YA_ASIGNADA` con los nombres actuales y la fila queda en solo lectura. **Ajuste:** el 422 `HDU_YA_ASIGNADA` del `PATCH` aplica solo a una `NUEVA` con `yaAsignada`, es decir, una que alguien creó durante la revisión. En `CAMBIO` y `SIN_CAMBIOS` sigue respondiendo `FILA_NO_ASIGNABLE`, porque así lo certifica E5-B05-T11, y su `marcada` se edita como hoy. **«Ir a la HDU»** es la ruta existente del portal `/hdu/:id` (`HduDetailPage`, `GET /v1/hdu/{id}`) con `idHistoria`, en la misma pestaña. El Administrador ve todas las HDU, y allí se reasignan el Analista (E2-F02) y el QE (E7-B05). La alerta que ya viene al cargar la lista usa `role="note"`; la que aparece durante la sesión usa `role="alert"` (diseño §5.1) | Pedido del usuario; sin regresión |
| D205 | **Vida de la consulta.** Confirmar una fila no cierra la consulta ni renueva `venceEn`. Sube `version` y `consulta.creadas` (columna nueva `consulta_jira.creadas integer NOT NULL DEFAULT 0`, que se conserva tras la purga). La consulta se cierra con «Confirmar marcadas», «Terminar revisión» (que es la misma ruta de descartes y queda `DESCARTADA`), por vencimiento o por reemplazo. Lo creado nunca se deshace. Descartar con una fila en toma no espera: si la HDU se crea después, se conserva y la ejecución se registra | Evita perder lo hecho |
| D206 | **Historial por fila.** `ejecucion_integracion.alcance varchar(4) NOT NULL DEFAULT 'LOTE'`, con CHECK `LOTE`/`HDU` y CHECK `alcance = 'LOTE' OR fase = 'CONFIRMACION'`. Una ejecución `HDU` tiene `leidas = 1` y una fila de detalle con `asignacion`, y cumple el invariante de D141. `GET /v1/integraciones/ejecuciones` suma el filtro `alcance` | Trazabilidad sin camino paralelo |
| D207 | **Accesibilidad.** Como la propone el backlog, con el detalle del diseño (§7): panel modal con foco atrapado, foco inicial en «Cerrar», `inert` detrás, `aria-disabled` (no `disabled`) en «Confirmar asignación» para que se lea el motivo, hoja completa a 375 px y axe sin hallazgos serios en el panel, la alerta, el error y la fila creada | D35, D131 |

**Cambio de texto:** «Este QE no tiene analistas en su equipo.» pasa a «Este QE no supervisa analistas activos. Elige otro QE.» (diseño §3.2). Las pruebas que lo leen están en el plan.

**Supuestos S6–S9 del backlog:** se aceptan tal cual.

**Trazabilidad:** `npm run contracts:check` cubre 327/327 escenarios: E5 pasa de 56 a 111, con 48 escenarios nuevos y 7 agregados. Los escenarios agregados de E5-B02 se numeraron #5 y #6, porque E5-B02 tenía 4. El backlog decía #6 y #7. `npm run contracts:lint` pasa sin advertencias.

**Preguntas abiertas:**

1. ¿Debe reintentarse sola la detección del campo de criterios en las configuraciones existentes? Hoy, por D199, espera al siguiente guardado de la conexión.
2. Con muchas confirmaciones por fila, `GET /v1/integraciones/ejecuciones` crece una fila por HDU. El filtro `alcance` alcanza para el MVP.

## Ajustes tras la ronda 1 de certificación (2026-11-05, `docs/validacion/certificacion-e5-detalle.md`)

| ID | Tema | Decisión u observación conocida |
| --- | --- | --- |
| OBS-D4 | Backlog frente a contrato | Se corrige el backlog a favor del contrato. **E5-B07#6:** una fila `CAMBIO` o `SIN_CAMBIOS` con `yaAsignada` responde 422 `FILA_NO_ASIGNABLE` al editar y también al confirmar, porque no es `NUEVA` (igual que #5). El 409 `HDU_YA_ASIGNADA` del `POST` y el 422 del `PATCH` quedan para una `NUEVA` que otra persona creó durante la revisión. Esto precisa D204. **E5-B07#11:** el 503 es `SERVICIO_NO_DISPONIBLE` (D202 d). **E5-B07#8:** quien pierde la carrera puede recibir `FILA_EN_CURSO` o `HDU_YA_ASIGNADA`. Contratos y ADR 0018 ya decían esto y no cambian |
| OBS-D2 | Lote que cierra con una fila en toma | **Se acepta como comportamiento conocido**, coherente con D203 y D205. Si «Confirmar marcadas» omite una fila que está en toma y no le quedan otras pendientes, cierra la consulta `CONFIRMADA` y la purga. La confirmación de esa fila termina igual: la HDU queda creada y su ejecución `HDU` queda registrada, pero el reintento de ese Administrador responde 409 `CONSULTA_NO_ABIERTA` aunque la HDU exista. Mitigación a cargo de `q360-frontend`, sin cambiar el contrato: ante `CONSULTA_NO_ABIERTA` después de un «Confirmar asignación» sin respuesta, el portal dice que la HDU pudo haberse creado y ofrece el Historial (la ejecución «Una HDU») o la búsqueda en la gestión de HDU. Esperar a que terminen las tomas antes de cerrar el lote queda como mejora futura, porque exigiría esperas dentro del presupuesto de 8 s |
| OBS-D3 | Contadores del lote tras una respuesta perdida | **Defecto conocido de la confirmación en lote** (D140, anterior a este cambio), que se registra y no bloquea. Si Organización escribe un lote de 25 y responde después del tiempo límite, la repetición recibe esas filas como `OMITIDA` `HDU_CREADA_DESPUES`. No hay duplicados (una HDU y una auditoría por código), pero `creadas` de la ejecución y del historial queda corto. Explica el intermitente de E5-B05-T28. Corrección propuesta para una próxima corrida, sin cambiar el contrato: el lote trata `existente.creadaPorEstaConsulta && existente.creadaPorActor` como `CREADA` (repetida), igual que la fila a fila con `repetida` (OD3); la ejecución la cuenta en `creadas`. Responsable: `q360-integraciones`. Hasta entonces, T28 se marca como intermitente conocido |
| — | Nombre accesible de «Abrir en Jira» | Diseño §2.5: el nombre accesible es «Abrir en Jira: <clave> (se abre en otra pestaña)». Empieza con el texto visible (WCAG 2.5.3) |

---

# Retiro del rol Líder QA

Decisión del usuario (2026-11-18): quitar el rol Líder QA de toda la plataforma (portal, servicios, contratos, base de datos y pruebas), incluida la pantalla de Integraciones del Administrador. En la nube el rol ya no tenía usuarios ni células asignadas.

| ID | Decisión | Motivo |
| --- | --- | --- |
| D208 | **Se retira el rol Líder QA.** El catálogo queda con 4 roles: Analista QA, QE, Administrador y Auditor, que sigue siendo el único de solo lectura.<br>• **Contratos:** sale `LIDER_QA` de `Rol`: el cambio de rol y el alta responden 400 `VALOR_NO_PERMITIDO`. Salen `celulaIds` (400 `VALIDACION`), `Usuario.celulasVigentes`, `relaciones.celulasVigentes` del 409 `RELACIONES_INCOMPATIBLES`, `ambito.celulasIds` del acceso interno, la relación `LECTOR_CELULA`, `GET` y `PUT /v1/usuarios/{id}/celulas-lider` y `GET /v1/bandeja/lider`, que responden 404.<br>• **Bandeja del Administrador:** salen los contadores `lideresSinCelulas` y `celulasSinLider`. Los pendientes son solo `ANALISTA_SIN_QE` y `QE_SIN_ANALISTAS`, siempre con `usuario`.<br>• **Impedimentos:** el escalamiento ofrece solo Administradores activos.<br>• **Integraciones:** sale el aviso «célula sin Líder» de la consulta. La migración `20261118000000_d208_sin_aviso_lider` quita la columna `consulta_item.aviso_sin_lider` y rehace `item_asignacion_ck` sin ella.<br>• **Datos:** la migración `20261118000000_d208_retiro_lider_qa` pasa a cada usuario con `LIDER_QA` a Auditor desactivado, con `CAMBIAR_ROL` en la auditoría (actor «Migración D208»); saca el rol del catálogo y elimina `celula_lider`. `ASIGNAR_CELULAS_LIDER` queda en el enum solo para leer registros anteriores, con la etiqueta «Células de Líder QA (rol retirado)». Las dos migraciones son idempotentes.<br>• **Portal:** sin `/lider`, sin columna ni diálogo de células. Un enlace antiguo a `/lider` lleva a la bandeja propia y `?rol=LIDER_QA` se ignora.<br>• **Semillas:** sin LID1 ni LID2 (E7) ni Lorena Soto (MVP). I3 del fixture E4 queda escalado a ADM1.<br>• **Superadas en lo que toca al Líder:** D30, D31, D32, D33, D37 y D39 (backlog E7); D42 (`celulaIds`), D43 (`celulasVigentes`), D44 (`celulasVigentes`), D47 (`celulasIds`), D51 (pendientes de líder y de célula), D52 (`celula_lider`), D55 (líder desactivado) y el aviso de D138 | Decisión del usuario. Un rol sin usuarios que seguía apareciendo en pantallas y reglas |

---

# E5 · Conexión con Jira por OAuth 2.0 (3LO)

Backlog: `docs/backlog/e5-oauth-jira.md` (HDU nuevas E5-F08 y E5-B08; escenarios agregados a E5-F01, E5-F02, E5-B01 y E5-B02). Diseño: `docs/diseno/e5-oauth-jira.md`. ADR 0019. Plan: `docs/arquitectura/e5-oauth-plan-construccion.md`. Guía para el usuario: `docs/arquitectura/guia-oauth-atlassian.md`. Contratos (aditivos): `integraciones.v1.yaml`, `gateway.v1.yaml` y `comun.v1.yaml`; `organizacion.v1.yaml` no cambia. Nube: `infrastructure/nube/007_rls_oauth_jira_nube.sql`.

Decisiones del usuario (2026-11-22):

1. «Conectar con Jira» con OAuth 2.0 (3LO) es el método principal. El API token se conserva como alternativa y lo certificado de la conexión no cambia.
2. El usuario registra la app en developer.atlassian.com y carga el Client ID y el Client secret en Vercel. Quality360 nunca muestra ni pide el secreto.

El analista propuso D209–D218. El arquitecto las acepta con los ajustes marcados como **Ajuste**. Las rutas, las variables y la URL de retorno quedan con su nombre definitivo.

| ID | Decisión | Motivo |
| --- | --- | --- |
| D209 | **OAuth recomendado y API token como alternativa.** Conexión ofrece dos métodos excluyentes y uno solo está activo: `configuracion_jira.metodo` (`API_TOKEN` u `OAUTH`). Las filas existentes quedan `API_TOKEN`. Quality360 no crea ni lee API tokens.<br>• **Ajuste (convivencia, diseño §12.2):** la conexión OAuth vive en su propia fila (`conexion_oauth_jira`) y puede existir mientras el API token sigue activo («Lista, sin activar», diseño §6.1). `GET configuracion` informa a la vez `metodo` (el activo; `null` sin configuración), `oauthDisponible` y `oauth`. Solo un «Probar y guardar» exitoso cambia el método. Hacia `OAUTH` deja nulos el correo y el API token cifrado. Hacia `API_TOKEN` exige sitio, correo y token, borra la conexión OAuth y registra `DESCONECTAR`. Si la prueba falla, nada cambia; si además el guardado intentaba cambiar de método, tampoco cambia `estadoConexion`, porque el método activo no se probó.<br>• **Ajuste (compatibilidad):** en los cuerpos de `PUT` y `probar`, un `metodo` ausente es `API_TOKEN`. El esquema no declara `default`, para que los tipos generados no lo vuelvan obligatorio: los clientes y las pruebas certificadas del API token no cambian | Decisión del usuario; Atlassian no permite leer API tokens |
| D210 | **Retorno en una página del portal y sin rutas públicas.** Ruta definitiva del portal: `/admin/integraciones/jira/oauth/retorno`, solo para el Administrador. `redirect_uri` exacta de producción: `https://quality360-one.vercel.app/admin/integraciones/jira/oauth/retorno`, sin barra final ni parámetros. El portal envía `POST /v1/integraciones/jira/oauth/retorno` con la sesión. La `redirect_uri` la arma el servidor; el cliente no la manda.<br>• **Ajuste (captura antes de Supabase):** supabase-js lee la dirección al crear su cliente (`detectSessionInUrl`). Un retorno con `?error=access_denied&error_description=…` lo tomaría por un inicio de sesión fallido y **cerraría la sesión del Administrador**. Por eso un módulo propio, importado en primer lugar por `main.tsx`, captura `code`, `state` y `error` **solo en esa ruta**, limpia la dirección con `history.replaceState` y los deja en memoria para un único consumo, a prueba del doble montaje de StrictMode (el patrón de `leerEnlaceRecuperacionSupabase`). Nada va a `localStorage` ni a `sessionStorage`, y nada viaja al inicio de sesión: si no hay sesión al volver, la captura se descarta y Conexión muestra «Tu sesión se cerró durante la conexión…» (diseño §4.1).<br>• La ruta nueva entra en la matriz de acceso de E7-F01: los otros roles reciben acceso denegado (D41) | Una sola superficie autenticada; el `code` no queda en el historial, en una recarga ni en los registros |
| D211 | **`state` de un solo uso**, como lo propone el backlog: 32 bytes aleatorios en base64url y solo su hash SHA-256 en `oauth_estado_jira`, ligado al Administrador y con 10 minutos de vigencia. Se valida y se consume en una sola sentencia (`UPDATE … WHERE estado_hash = $1 AND actor_id = $2 AND usado_en IS NULL AND expira_en > now() RETURNING`). Toda causa de rechazo, también un `state` mal formado, da el mismo 400 `JIRA_OAUTH_ESTADO_INVALIDO`.<br>• **Ajuste:** la purga de los estados de más de 1 día ocurre dentro de `oauth/iniciar`, porque no hay tareas programadas (D96). La tabla conserva `DELETE` solo para esa purga; un disparador solo deja pasar `usado_en` de nulo a una fecha, una vez, y se revoca `TRUNCATE`. El `state` queda consumido en todo retorno que pasa su validación, aunque después falle el canje | CSRF y repetición |
| D212 | **Elección del sitio**, como la propone el backlog.<br>• **Ajuste (filtro):** de `accessible-resources` quedan los sitios cuyo `id` es UUID, cuya `url` cumple `^https://[a-z0-9][a-z0-9-]{0,62}\.atlassian\.net$` y cuyos `scopes` son de Jira, hasta 50 y ordenados por nombre. Si hay sitios de Jira pero ninguno trae los permisos requeridos (D218): `JIRA_OAUTH_PERMISOS_INSUFICIENTES`. Si no hay ninguno de Jira: `JIRA_OAUTH_SIN_SITIO`. Un 401 o 403 de `accessible-resources`: `JIRA_OAUTH_CANJE_FALLIDO`.<br>• **Ajuste (varios sitios):** con un sitio, se conecta directo. Con varios, el que coincide con el ya configurado se marca `actual` y se preselecciona, pero **nunca se elige solo**. La conexión queda `PENDIENTE_SITIO` con `sitiosCandidatos` y el Administrador confirma con `POST /v1/integraciones/jira/oauth/sitio {sitioId}`. Un id que no es candidato da 400 `JIRA_OAUTH_SITIO_NO_VALIDO`; sin conexión pendiente, 409 `JIRA_OAUTH_SIN_CONEXION`. Confirmar llama a `/myself` en ese sitio; si falla de forma pasajera, la conexión sigue pendiente y se puede reintentar | El Administrador decide; ninguna llamada a un sitio no validado |
| D213 | **Hosts fijos y sin SSRF**, como lo propone el backlog. Los únicos destinos son `https://auth.atlassian.com` y `https://api.atlassian.com`, escritos en el código, más el `cloudid` validado como UUID. Se usa `redirect: 'manual'` y una redirección cuenta como error. El cuerpo de un error de Atlassian nunca se lee: se clasifica por estado HTTP. Los 2xx se leen con tamaño acotado y se valida su forma; si no cumple, `JIRA_RESPUESTA_INVALIDA`.<br>• **Ajuste (variables de prueba):** `JIRA_OAUTH_URL_AUTORIZACION` reemplaza a `https://auth.atlassian.com` y `JIRA_OAUTH_URL_API` a `https://api.atlassian.com`. Solo valen con `INTEGRACIONES_PERMITIR_HOST_PRUEBA=true`, fuera de `NODE_ENV=production` y con la forma que D95 admite en pruebas (`http://127.0.0.1:<puerto>`). En producción se ignoran. D95 sigue rigiendo el API token | Mantiene el compromiso de D95 |
| D214 | **Cifrado y renovación serializada**, como los propone el backlog, con estos ajustes.<br>• **Cifrado (aditivo):** el puerto `CifradorToken` suma `cifrarSecreto(texto, datoAsociado)` y `descifrarSecreto(cifrado, datoAsociado)`, que trabajan con `{cifrado, iv, tag, llaveVersion}`, sin `ultimos4`. Los datos asociados son `q360:jira:oauth:acceso:v1` y `q360:jira:oauth:renovacion:v1`. Es el mismo AES-256-GCM con la misma llave (D94, D128), con IV de 12 bytes y etiqueta de 16 por token. No se guarda ninguna subcadena en claro.<br>• **Renovación:** si faltan más de 5 minutos para el vencimiento, el acceso se usa sin candado. Si no, se abre `$transaction(async tx => …)`, que usa **solo** `tx` (`connection_limit=1`), con `SET LOCAL lock_timeout = '3s'` y `SELECT … FROM "integraciones"."conexion_oauth_jira" WHERE id = 1 FOR UPDATE` en SQL cruda calificada (DEF-E5C-05). Se relee la fila: si otro proceso ya renovó, se usa ese acceso. Si no, se llama a Atlassian con un tiempo límite de min(3 s, presupuesto restante), se escriben el token de renovación nuevo, el acceso y el vencimiento, y se hace `COMMIT` **antes** de usar el acceso nuevo. La transacción interactiva lleva `maxWait` 2 s y `timeout` 7 s, siempre dentro del presupuesto de 8 s (D114). Un 55P03 (candado no obtenido) es `JIRA_TIEMPO_AGOTADO` y no cambia nada. Si la respuesta no trae `refresh_token`, se conserva el anterior.<br>• **Ajuste (401):** la renovación forzada tras un 401 ocurre solo si el `acceso_expira_en` guardado sigue siendo el del acceso que se usó; si otro proceso ya renovó, se reintenta con el suyo. Hay una renovación forzada y un reintento por operación (una prueba, un guardado o una tanda), nunca más | La rotación de Atlassian rompe la conexión si dos procesos renuevan a la vez |
| D215 | **Estados y fallos de la conexión**, como los propone el backlog, con estos ajustes.<br>• **Ajuste (lectura):** `oauth` es `{estado, descifrable, cuenta, sitio, sitiosCandidatos, permisos, conectadoEn, conectadoPor, renovadoEn}`. Salen `accesoExpiraEn`, porque el portal no muestra cuentas regresivas (diseño §3.2), y `requiereElegirSitio`, porque lo dice `estado: PENDIENTE_SITIO`. Se suma `descifrable`. «Sin conectar» es `oauth: null`. `GET configuracion` no llama a Atlassian ni renueva.<br>• **Fallo definitivo de la renovación:** HTTP 400, 401 o 403 del endpoint de token (incluye `invalid_grant`), clasificado por estado sin leer el cuerpo (D213). La conexión pasa a `RECONEXION_NECESARIA`, se borran los tokens y se registra `REFRESCO_FALLIDO` solo en la transición desde `CONECTADA`. Red, tiempo agotado, 5xx y 429 no tocan la credencial.<br>• **Con `RECONEXION_NECESARIA`:** probar responde 200 `ok: false`; `PUT`, 200 `guardado: false`; consultar y continuar, 200 con la tanda `FALLIDA`. Todos llevan `JIRA_RECONEXION_NECESARIA` (D105). Con `PENDIENTE_SITIO` o sin conexión: 409 `JIRA_NO_CONFIGURADO`. Si los tokens no se descifran (cambió la llave): 409 `TOKEN_NO_DESCIFRABLE` y `oauth.descifrable: false`, y el portal muestra la tarjeta de «Reconexión necesaria».<br>• **Ajuste (permisos tras renovar):** si la renovación funciona y el reintento vuelve a dar 401, el resultado es `JIRA_OAUTH_PERMISOS_INSUFICIENTES` con los permisos de esa llamada, no `JIRA_RECONEXION_NECESARIA` (E5-B08#7). `JIRA_CREDENCIAL_INVALIDA` queda solo para el API token.<br>• Los textos, las etiquetas y el `data-estado` del chip son los del diseño §3 y §9 (tabla de abajo) | Separar lo permanente de lo pasajero |
| D216 | **Variables opcionales y no fatales** (patrón D127/D129). Nombres definitivos: `JIRA_OAUTH_CLIENT_ID`, `JIRA_OAUTH_CLIENT_SECRET` y `JIRA_OAUTH_REDIRECT_URI`, en el proyecto de Vercel `quality360-integraciones`, entorno Production, marcadas *Sensitive*. Las carga el usuario con la guía; no van en el repositorio, en el chat ni en un documento.<br>• **Ajuste (validación):** `JIRA_OAUTH_REDIRECT_URI` debe empezar con `https://`, tener la ruta exacta `/admin/integraciones/jira/oauth/retorno` y no llevar parámetros, fragmento ni credenciales. Solo con la bandera de prueba se admite `http://localhost:<puerto>` o `http://127.0.0.1:<puerto>`. Un valor inválido cuenta como ausente y se registra una vez, sin el valor. `oauthDisponible` es `true` solo con las tres válidas.<br>• **Ajuste (alcance del 503):** responden `JIRA_OAUTH_NO_CONFIGURADO` `oauth/iniciar`, `oauth/retorno` y `oauth/sitio`, y también probar, guardar, consultar y continuar con el método OAuth, porque sin las credenciales de la app no se puede renovar. No se llama a Atlassian ni se toca nada. `GET configuracion` y `DELETE …/oauth` **siempre** funcionan, sin las variables ni la llave. Iniciar, retorno y sitio exigen además la llave (`LLAVE_CIFRADO_NO_DISPONIBLE`) | Quality360 no depende de que Atlassian esté configurado |
| D217 | **Desconectar y auditoría**, como los propone el backlog, con estos ajustes.<br>• **Ajuste (ruta y alcance):** `DELETE /v1/integraciones/jira/oauth` responde 204 y borra la conexión en cualquier estado (tokens, sitio, cuenta y candidatos). Sin conexión, 409 `JIRA_OAUTH_SIN_CONEXION`. No llama a Atlassian. **No** borra HDU, historial de asignación, ejecuciones, eventos, la consulta abierta ni la fila de configuración, así que el texto «Lo ya importado no se borra» del diálogo queda confirmado (diseño §12.8). Si el método activo era OAuth, consultar y continuar responden 409 `JIRA_NO_CONFIGURADO` hasta reconectar o pasar a API token; confirmar la consulta abierta sigue funcionando porque no llama a Jira (D140). Si el activo es el API token, se borra la conexión «lista, sin activar» y el token sigue en uso.<br>• **Ajuste (auditoría):** `evento_oauth_jira` es de solo inserción (`REVOKE UPDATE, DELETE, TRUNCATE`) y `GET …/configuracion/eventos` la mezcla por fecha con los guardados. `EventoConfiguracionJira` suma `tipo` (`CONFIGURACION`, `CONECTAR_OAUTH`, `RECONECTAR`, `DESCONECTAR`, `REFRESCO_FALLIDO`) y `oauth {cuenta, sitio}`. `CONECTAR_OAUTH` es la primera conexión registrada; las siguientes son `RECONECTAR`. En `REFRESCO_FALLIDO` se guarda como actor al Administrador cuya operación disparó la renovación, y el portal muestra «Sistema». Los intentos fallidos de conexión no se auditan (pregunta abierta 4).<br>• **Ajuste (API token, diseño §12.1):** el API token no tiene «Desconectar»; se reemplaza al guardar otro o al pasar a OAuth | Trazabilidad sin filtrar secretos |
| D218 | **Permisos mínimos:** `read:jira-work`, `read:jira-user` y `offline_access`, en una constante del servicio (`dominio/oauth/permisos.ts`). Nunca se piden permisos de escritura. **Confirmados por endpoint** (tabla de abajo). Los scopes granulares quedan como alternativa, solo si E5-MAN-02 muestra que los clásicos no bastan.<br>• **Ajuste (al canjear):** se compara el `scope` de la respuesta con lo requerido. Si no viene, se asume lo pedido (RFC 6749 §5.1) y manda la comparación de `scopes` por sitio (D212). Si la respuesta no trae `refresh_token`: `JIRA_OAUTH_PERMISOS_INSUFICIENTES` con `offline_access`. En ningún caso se guarda nada.<br>• **Ajuste (antes de cada llamada):** se comprueba `scopes_concedidos` contra los permisos de ese endpoint, sin llamar a Jira si falta alguno. `ErrorIntegracion` suma `permisosFaltantes` y el portal los traduce (diseño §3.2).<br>• Si la cuenta pierde permisos en el proyecto, Jira responde 403 o 404 y se aplican `JIRA_SIN_PERMISO` y `JIRA_PROYECTO_NO_ENCONTRADO`, con el texto del diseño §9.3, que se refiere a la cuenta conectada | Mínimo privilegio |

**Rutas definitivas.** Son 4, todas con sesión y solo para el Administrador: `POST /v1/integraciones/jira/oauth/iniciar`, `POST /v1/integraciones/jira/oauth/retorno`, `POST /v1/integraciones/jira/oauth/sitio` y `DELETE /v1/integraciones/jira/oauth`. Cambian, de forma aditiva, `GET`/`PUT /v1/integraciones/jira/configuracion`, `POST …/configuracion/probar`, `GET …/configuracion/eventos`, `POST …/consultas` y `POST …/consultas/{id}/continuaciones`. El gateway pasa de 18 rutas y 20 operaciones a 22 y 24; las 4 nuevas van al cubo de escritura general, y el gateway no registra el cuerpo de `oauth/retorno` ni la respuesta de `oauth/iniciar`.

**Resoluciones del diseño §12.**

| # | Brecha | Resolución |
| --- | --- | --- |
| 12.1 | «Desconectar» con API token | No existe (D217). El API token se reemplaza al guardar otro o al pasar a OAuth. No hay HDU ni ruta nuevas |
| 12.2 | OAuth lista, sin activar | `GET configuracion` informa `metodo` y `oauth.estado` a la vez, y el servidor conserva las dos credenciales hasta un «Probar y guardar» exitoso con `metodo: OAUTH` (D209) |
| 12.3 | «Reconectar» o «Volver a conectar» | **«Reconectar»** en el botón. El mensaje del servidor sigue siendo «Vuelve a conectar con Jira.». E5-F08 #8 ya está alineado |
| 12.4 | «Probar conexión» | Comparte `POST …/configuracion/probar`, y el portal manda solo `{metodo}` con el método activo. **Ajuste al diseño §3.3:** si hay un proyecto guardado, el servidor también lo valida, con las mismas dos llamadas de E5-B01#2; sin proyecto, solo `myself` y `proyecto: null`. Probar nunca escribe `configuracion_jira`, así que `texto-ultima-prueba` no cambia con «Probar conexión», igual que hoy con «Probar sin guardar» |
| 12.5 | Ruta de retorno | Definitiva: `/admin/integraciones/jira/oauth/retorno` (D210) |
| 12.6 | Texto «muchos días» | Se mantiene vago en el portal. La guía dice el plazo de Atlassian: 90 días sin uso |
| 12.7 | Sitio distinto del configurado | Mejora futura. Hoy el sitio configurado solo se marca `actual` y se preselecciona |
| 12.8 | «Lo ya importado no se borra» | Confirmado: desconectar no borra HDU, historial ni la consulta abierta (D217) |

Otras dos precisiones del diseño: el pie del panel de guía (§11.2) apunta a `docs/arquitectura/guia-oauth-atlassian.md`, no a la sección 8 del backlog, y la referencia «D138-6» de §3.3 es una errata: lo que manda «Probar conexión» lo fija la fila 12.4.

**Permisos por endpoint (D218).**

| Llamada | Host | Permiso |
| --- | --- | --- |
| `POST /oauth/token` (canje y renovación) | `auth.atlassian.com` | Ninguno: Client ID y secreto. Sin `offline_access` no llega el token de renovación |
| `GET /oauth/token/accessible-resources` | `api.atlassian.com` | Cualquier acceso válido |
| `GET /rest/api/3/myself` | `api.atlassian.com/ex/jira/{cloudid}` | `read:jira-user` |
| `GET /rest/api/3/project/{clave}` | ídem | `read:jira-work` |
| `GET /rest/api/3/field` | ídem | `read:jira-work` |
| `GET /rest/api/3/search/jql` | ídem | `read:jira-work` |

**Chip de la conexión.** `chip-conexion` refleja siempre el **método activo**. Su `data-estado` deja los valores de `EstadoConexionJira` (`SIN_PROBAR`, `OK`, `FALLIDA`) y pasa a los del diseño §3.1. Se aplica la primera regla que cumpla:

| # | Condición | `data-estado` |
| --- | --- | --- |
| 1 | `metodo: API_TOKEN` y `estadoConexion: FALLIDA` | `fallo` |
| 2 | `metodo: API_TOKEN` | `conectado-api-token` |
| 3 | `oauth: null` (con `metodo` `OAUTH` o `null`) | `sin-conectar` |
| 4 | `oauth.estado: RECONEXION_NECESARIA` u `oauth.descifrable: false` | `reconexion-necesaria` |
| 5 | `oauth.estado: PENDIENTE_SITIO` | `falta-sitio` |
| 6 | `metodo: OAUTH` y `estadoConexion: FALLIDA` | `fallo` |
| 7 | `oauth.estado: CONECTADA` | `conectado-oauth` |

Con el API token activo, la conexión OAuth se muestra en su propia tarjeta con la insignia «Lista, sin activar», «Falta elegir el sitio» o «Reconexión necesaria»; no es `chip-conexion`, que sigue diciendo «Conectado con API token». E5-F01-T01 y `e5Conexion.test.tsx` cambian el valor afirmado: `SIN_PROBAR` pasa a `sin-conectar` y `OK` pasa a `conectado-api-token` (plan, «Pruebas certificadas»).

**Ajustes al backlog.** E5-F08 #8 dice «Reconectar». E5-F08 #11 suma «Lo ya importado no se borra.». E5-B08 #7 distingue la renovación fallida de los permisos insuficientes (D215). E5-B08 #11 suma probar, guardar, consultar y continuar con OAuth, y deja fuera desconectar (D216). Los escenarios agregados de E5-F01 son #4 y #5; el de E5-F02 es #6; los de E5-B01, #4 a #6; el de E5-B02, #7.

**Trazabilidad:** `npm run contracts:check` cubre 325/325 escenarios: E5 pasa de 111 a 145, con 27 escenarios de E5-F08 y E5-B08 y 7 agregados. El agregado de E5-F02 se numeró #6, porque E5-F02 ya tenía #1 a #5 (el backlog y el diseño lo llamaban #4). E5-F08#13 (accesibilidad) queda en `x-escenarios-sin-operacion`. `npm run contracts:lint` pasa sin advertencias.

**Preguntas abiertas:**

1. Reconectar con varios sitios deja la conexión `PENDIENTE_SITIO` y, mientras tanto, no se puede consultar con OAuth. ¿Conviene conservar la conexión anterior hasta que se elija el sitio? Hoy no se conserva, para tener una sola fila.
2. Una renovación programada evitaría la «Reconexión necesaria» tras 90 días sin uso, pero D96 prohíbe las tareas programadas. Queda como mejora futura.
3. E5-MAN-02 debe confirmar con Atlassian real que los scopes clásicos bastan para los cuatro endpoints. Si no bastan, se pasa a scopes granulares y se actualizan la constante, el contrato y la guía.
4. ¿Se auditan los intentos fallidos de conexión (consentimiento rechazado, canje fallido)? Hoy no se registran.
5. ¿«Probar conexión» debe validar solo la credencial, sin el proyecto guardado, como pedía el diseño §3.3? Hoy valida ambos, para que «probar» tenga un solo significado.
6. El aviso de sitio distinto del configurado (diseño §12.7) queda como mejora futura.

## Cierre de la corrida (ronda 1 de QA, 2026-11-23)

Dictamen: `docs/validacion/certificacion-e5-oauth.md`. QA clasificó como aceptables 9 desvíos de `q360-integraciones`. Los que fijan una conducta que ni el ADR 0019 ni el contrato especifican quedan como D219 a D223. Los demás no necesitan decisión: el 1 (`probarCuenta` también devuelve `cuentaId`) es interno y el plan ya lo dice; el 2 (candidatos guardados como `{id, nombre, url}` y `actual` calculado al responder) es lo que piden el plan de datos y el contrato; el 8 es solo la ubicación de las pruebas (`e5-b01-oauth.test.ts` y `def-e5c-05-oauth.test.ts`), y el 9 es un requisito de preparación (`ws:test` construye auth-nest primero).

| ID | Decisión | Motivo |
| --- | --- | --- |
| D219 | **Eventos de la conexión OAuth** (desvíos 3 y 4).<br>• `evento_oauth_jira.codigo` solo se llena en `REFRESCO_FALLIDO` (CHECK del plan) y vale `RENOVACION_RECHAZADA`, una constante del servicio. Es la única causa que registra el evento: Atlassian rechazó la renovación con 400, 401 o 403, incluido `invalid_grant`. Nunca guarda texto de Atlassian y no sale en la API: `GET …/configuracion/eventos` informa `resultadoPrueba` como fija el contrato (`JIRA_RECONEXION_NECESARIA` en `REFRESCO_FALLIDO` y `OK` en los demás), con `camposCambiados: []` y `tokenCambiado: false`.<br>• `CONECTAR_OAUTH` se registra solo si no hay ningún `CONECTAR_OAUTH` ni `RECONECTAR` anterior. Si lo hay, es `RECONECTAR`, también después de un `DESCONECTAR`: «la primera conexión registrada» de D217 se cuenta sobre toda la historia, no sobre la conexión vigente.<br>• Quedar `PENDIENTE_SITIO` no registra evento; se registra al elegir el sitio.<br>• La mezcla se ordena por `fecha` descendente y, a igual fecha, por `id_evento` descendente. `total` suma las dos tablas | Auditoría sin texto de terceros y un solo significado para «primera conexión» |
| D220 | **Orden de validación de guardar y probar con OAuth** (desvío 5).<br>• `PUT …/configuracion` con `metodo: OAUTH`: 401 → 403 → 400 de formato → 503 `JIRA_OAUTH_NO_CONFIGURADO` → 503 `LLAVE_CIFRADO_NO_DISPONIBLE` → 409 `JIRA_NO_CONFIGURADO` (sin conexión o con `PENDIENTE_SITIO`) → 422 del destino → 409 `TOKEN_NO_DESCIFRABLE` → renovación si hace falta (D214) → prueba → guardar. Los dos 409 quedan a cada lado del 422: el primero no necesita a Organización y el segundo sigue el orden del `PUT` con API token, donde `TOKEN_NO_DESCIFRABLE` va después del destino.<br>• `POST …/configuracion/probar` con `metodo: OAUTH`: el mismo orden, sin el 422. Con proyecto (del cuerpo o el guardado) llama a `myself` y a `project`; sin proyecto, solo a `myself` (fila 12.4).<br>• Con `RECONEXION_NECESARIA` no hay 409: pasado el 422, la prueba responde 200 con `JIRA_RECONEXION_NECESARIA` (D215).<br>• `PUT` con API token: el 400 por token obligatorio (la primera vez o al venir de OAuth) depende de lo guardado, así que va después del 503 de la llave y antes del 422 | Convención de la épica (401 → 403 → 400 → 503 → 409 → ejecución) sin cambiar el orden certificado del API token |
| D221 | **Fallas de Atlassian al conectar y al renovar** (desvío 6).<br>• Se clasifican por estado HTTP (D213), igual en el canje, en `accessible-resources` y en la renovación: 400, 401 o 403 es definitiva; 429, `JIRA_LIMITE_DE_TASA`; 5xx o error de red, `JIRA_NO_DISPONIBLE`; tiempo agotado o presupuesto consumido, `JIRA_TIEMPO_AGOTADO`; cualquier otra respuesta (redirección, 404 o 2xx sin la forma esperada), `JIRA_RESPUESTA_INVALIDA`.<br>• En el retorno, la definitiva del canje o de los sitios es `JIRA_OAUTH_CANJE_FALLIDO`; las pasajeras se informan con su código, en 200 `ERROR`. En ambos casos el `state` queda consumido (D211), no se guarda nada, la conexión anterior sigue intacta y reintentar es volver a pulsar «Conectar con Jira».<br>• `myself` (retorno con un solo sitio y `oauth/sitio`): 401 o 403 es `JIRA_OAUTH_PERMISOS_INSUFICIENTES` con `permisosFaltantes: [read:jira-user]` (D218); 404 es `JIRA_NO_DISPONIBLE`, porque el contrato no admite `JIRA_SITIO_NO_ENCONTRADO` en ese resultado; las pasajeras van con su código. En `oauth/sitio` la conexión sigue `PENDIENTE_SITIO`.<br>• En la conexión (canje, sitios y `myself`) y en la renovación un 429 no se espera: `JIRA_LIMITE_DE_TASA` sale de inmediato. La espera por `Retry-After` de E5 (`JIRA_ESPERA_MAX_429_MS`) sigue solo en las llamadas a Jira de probar, guardar, consultar y continuar | El Administrador está frente a la pantalla: un error claro y reintentable vale más que una espera, y lo pasajero no se confunde con lo definitivo (D215) |
| D222 | **Actor de las operaciones OAuth** (desvío 7).<br>• `oauth/retorno`, `oauth/sitio` y `DELETE …/oauth` piden el perfil del Administrador a Organización antes de escribir. En el retorno eso ocurre después del 503 de configuración y del rechazo de un `state` mal formado, y **antes** de consumir el `state`: si Organización no responde, la respuesta es 503 `SERVICIO_NO_DISPONIBLE`, el `state` sigue sin usar y no se llama a Atlassian. En `oauth/sitio` va después de los 409 y del 400 del sitio; en `DELETE`, después del 409 sin conexión.<br>• En `REFRESCO_FALLIDO` el actor es el Administrador cuya operación pidió la renovación. Se resuelve solo si hay que renovar y antes de abrir la transacción del candado, porque con `connection_limit=1` no se puede consultar nada con la fila tomada. Si Organización no responde o rechaza la consulta, el evento se registra igual, con el id de quien pidió la operación y el nombre «Administrador»: la conexión no puede quedar sin marcar por una falla ajena. El portal lo muestra como «Sistema» (D217) | Cada evento lleva una `Persona` válida y nada se consulta con el candado tomado |
| D223 | **Candado de la renovación** (precisa D214).<br>• Además del 55P03, cuentan como candado no obtenido P2024 (no hubo conexión libre en el pool a tiempo) y P2028 (la transacción interactiva no empezó dentro de `maxWait` o venció su `timeout`). Responden `JIRA_TIEMPO_AGOTADO` sin tocar la conexión.<br>• Riesgo aceptado: si P2028 llega después de que Atlassian rotó el token de renovación y antes del `COMMIT`, el token nuevo se pierde y la renovación siguiente termina en «Reconexión necesaria», que se resuelve con «Reconectar». Con 3 s de candado, 3 s para Atlassian y 7 s de transacción es improbable | Una espera de la base no es un fallo de la credencial |

**Defectos de la ronda 1.** DEF-E5O-01: manda el contrato. `descifrable` es `false` siempre en `RECONEXION_NECESARIA`; se corrige `descifrable()` en Integraciones y no cambia ningún contrato. DEF-E5O-02: manda el diseño §9.3. El texto de `JIRA_SIN_PERMISO` y `JIRA_PROYECTO_NO_ENCONTRADO` depende del método que se prueba, no del guardado; se corrige el portal.

**Documentos alineados con el producto certificado.** El testid del error de consulta es `error-consulta`, no `error-sincronizacion` (diseño §7, §8.2 y §10, backlog E5-F02#6 y FO7 del plan; OBS-E5O-01). El sitio cerrado de las pruebas de E5 pasó del puerto 4011 al 4019, porque el 4011 es ahora el Atlassian simulado (backlog de E5, sección 10.3 y E5-F01-T04). `GUIA-LOCAL.md` y el `.env.example` de la raíz explican el Atlassian simulado.

**Numeración.** D209 quedó asignado dos veces en ramas paralelas: «Diseño de las bandejas» (sección «Mejoras de uso tras E4») y «OAuth recomendado y API token como alternativa» (esta sección). Los dos se citan en código, pruebas y contratos, así que no se renumera ninguno: se distinguen como D209 (bandejas) y D209 (OAuth). Las decisiones nuevas siguen desde D219.
