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
