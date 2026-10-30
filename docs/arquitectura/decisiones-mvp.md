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

---

# Mejoras de uso tras E4

| ID | Decisión | Motivo |
| --- | --- | --- |
| D130 | **Checklist en orden libre.** Cualquier entregable `PENDIENTE` se marca sin esperar a los anteriores, y cualquier entregable marcado se desmarca sin seguir un orden. Reemplaza el orden estricto de D17. Se mantienen: un registro por entregable (E3-B01#2), la aprobación solo del QE responsable, el certificado automático (D19, que sigue exigiendo los entregables 1 a 8 aprobados) y el bloqueo de una HDU cerrada. El código `ORDEN_ENTREGABLES` queda en desuso. Cambian los escenarios E3-F02#2 y E3-B02#1 | Pedido del usuario: el proceso no debe ser lineal |
| D131 | **Selección dentro de diálogos con lista visible.** Los selectores de los diálogos «Asignar analista» y «Reasignar QE responsable» se muestran como lista con hasta 6 filas y desplazamiento propio, en vez del desplegable nativo, que se abría fuera de la ventana y ocultaba opciones | Pedido del usuario |
