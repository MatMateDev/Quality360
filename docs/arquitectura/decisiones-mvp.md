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
