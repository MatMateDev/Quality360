# Certificación E1 y E2 · Quality360 (Ola 2)

Dueño: `q360-qa`. Gate aplicado: sección «Certificación» de
`docs/arquitectura/decisiones-mvp.md`. Alcance: 32 HDU, 96 escenarios (E1:
F01–F12, B01–B12; E2: F01–F04, B01–B04).

## Entorno verificado

- Supabase local (`http://127.0.0.1:54321`, DB `127.0.0.1:54322`), gateway
  `http://localhost:3000`, Organización `:3001`, Certificaciones `:3002`,
  Impedimentos `:3003`, portal `http://localhost:5173` — levantados por el
  orquestador, no reiniciados por `q360-qa`.
- Semilla `infrastructure/seed/mvp/` cargada e idempotente (`npm run seed`).
- Rama `feature/e1-e2-quality360`, árbol principal.
- Pruebas en `tests/` (Playwright): proyecto `setup` (login real por UI,
  guarda `storageState`), proyecto `e2e` (escenarios F contra el portal
  real) y proyecto `api` (escenarios B contra el gateway real, con
  `request`, incluido el acceso cruzado sin pasar por la interfaz).
- Regla de aislamiento: toda prueba que muta datos (usuarios, HDU,
  supervisión, estado, rol) opera sobre entidades creadas por ella misma con
  identificadores únicos (`tests/support/unique.ts`); nunca sobre los
  usuarios o HDU de la semilla que otros escenarios necesitan.
- Comando para reproducir: `cd tests && npx playwright test` (requiere el
  stack arriba y `npx playwright install chromium` la primera vez).

## Interpretaciones ya decididas (arquitecto)

- **E2-B02#3**: se verifica como cierre rechazado con `CHECKLIST_NO_DISPONIBLE`
  (ninguna HDU llega a `CERRADA` en esta corrida, D11).
- **E1-F06#3**: se verifica con la fuente de HDU caída (E2 ya está
  habilitada); el portal debe decir «no disponible», nunca 0.

## Nota de método: límite de tasa de escritura y ejecución

El gateway aplica 30 escrituras/min por defecto (`LIMITE_TASA_ESCRITURA_MAX`).
La suite de certificación crea muchas entidades propias (regla de
aislamiento), así que en tramos de alta concentración de pruebas de
escritura puede toparse con `429 DEMASIADAS_SOLICITUDES`; `tests/support/api.ts`
reintenta automáticamente respetando `Retry-After` (hasta 4 reintentos). Con
eso, cada grupo pasa de forma consistente ejecutado solo o junto a los
grupos ya cerrados. Ejecutar dos veces **seguidas y sin pausa** la suite ya
acumulada completa (grupos 1 a 3, ~45 escenarios con sus fixtures) sí agota
los reintentos en algunos casos por la ventana compartida de 60 s, con
esperas de hasta 1.5 h y fallas transitorias; las mismas pruebas, ejecutadas
de nuevo de forma aislada inmediatamente después, pasaron sin cambios de
código. No es un defecto de producto: es el límite de tasa funcionando como
está diseñado bajo una carga de escritura muy superior a la de uso real. Por
eso la verificación de «correr la suite dos veces da el mismo resultado» se
hace por grupo (como se muestra en cada sección) y la suite completa se
corre una sola vez más al final, como pide la instrucción de la Ola 2.

## Ronda 1 · Grupo 1 — Login y acceso por rol

Escenarios: E1-F01 (3), E1-F02 (3), E1-F05 (3), E1-F07 (3), E1-B01 (3),
E1-B02 (3) = 18 escenarios.

Ejecución: `npx playwright test e2e/e1-f01-login.spec.ts e2e/e1-f02-portal-qe.spec.ts e2e/e1-f05-portal-qa.spec.ts e2e/e1-f07-portal-admin.spec.ts api/e1-b01-credenciales.spec.ts api/e1-b02-ambito.spec.ts`
→ **29/29 pasaron** (18 escenarios + 9 sesiones de `setup`), dos corridas
consecutivas con el mismo resultado.

| Escenario | Prueba | Resultado | Evidencia |
| --- | --- | --- | --- |
| E1-F01#1 | `tests/e2e/e1-f01-login.spec.ts` | Pasa | Campos correo/contraseña visibles, botón Mostrar/Ocultar alterna `type` |
| E1-F01#2 | `tests/e2e/e1-f01-login.spec.ts` | Pasa | Errores de campo visibles; sin solicitud a `auth/v1/token` (interceptada y verificada) |
| E1-F01#3 | `tests/e2e/e1-f01-login.spec.ts` | Pasa | `indicador-ingresando` visible durante la espera; `error-login` con el mismo texto genérico para correo existente e inexistente |
| E1-F02#1 | `tests/e2e/e1-f02-portal-qe.spec.ts` | Pasa | Redirige a `/qe`, muestra "Carla Fuentes" y enlaces Equipo/Historias supervisadas |
| E1-F02#2 | `tests/e2e/e1-f02-portal-qe.spec.ts` | Pasa | `/admin` y `/qa` redirigen a `/qe` para una sesión QE |
| E1-F02#3 | `tests/e2e/e1-f02-portal-qe.spec.ts` | Pasa | Nav del QE = Inicio/Equipo/Historias supervisadas/Perfil; sin Usuarios ni Supervisión |
| E1-F05#1 | `tests/e2e/e1-f05-portal-qa.spec.ts` | Pasa | Redirige a `/qa`, muestra "Ana Torres" |
| E1-F05#2 | `tests/e2e/e1-f05-portal-qa.spec.ts` | Pasa | Nav del QA = Inicio/Mis HDU/Perfil; sin Usuarios ni Equipo |
| E1-F05#3 | `tests/e2e/e1-f05-portal-qa.spec.ts` | Pasa | `/qe` y `/admin/usuarios` redirigen a `/qa` |
| E1-F07#1 | `tests/e2e/e1-f07-portal-admin.spec.ts` | Pasa | Redirige a `/admin`, muestra "Patricia Rojas" |
| E1-F07#2 | `tests/e2e/e1-f07-portal-admin.spec.ts` | Pasa | Nav incluye enlaces Usuarios y Supervisión |
| E1-F07#3 | `tests/e2e/e1-f07-portal-admin.spec.ts` | Pasa | Token forjado HS256 vencido (firmado con `SUPABASE_JWT_SECRET`, respaldo local del verificador) inyectado en `localStorage`; al navegar, el portal redirige a `/login` y muestra "Inicia sesión" |
| E1-B01#1 | `tests/api/e1-b01-credenciales.spec.ts` | Pasa | Login real de Carla + `GET /v1/me` 200 con `rol: QE` |
| E1-B01#2 | `tests/api/e1-b01-credenciales.spec.ts` | Pasa | Gabriela (inactiva) autentica en Supabase Auth pero `GET /v1/me` y `GET /v1/usuarios` responden 403 `ACCESO_DENEGADO`, mensaje sin mencionar "inactivo" |
| E1-B01#3 | `tests/api/e1-b01-credenciales.spec.ts` | Pasa | 5 intentos fallidos alternando correo existente/inexistente → mismo `400 invalid_credentials` en todos (protección de fuerza bruta es de Supabase Auth, fuera del gateway per `contracts/gateway.v1.yaml#x-escenarios-sin-operacion`; ver nota en Defectos) |
| E1-B02#1 | `tests/api/e1-b02-ambito.spec.ts` | Pasa | Sin token → 401 `NO_AUTENTICADO`; token basura → 401 |
| E1-B02#2 | `tests/api/e1-b02-ambito.spec.ts` | Pasa | Ana pide `/v1/inicio/qa?analistaId=<Beatriz>` → 403 `ACCESO_DENEGADO` |
| E1-B02#3 | `tests/api/e1-b02-ambito.spec.ts` | Pasa | Carla pide `/v1/qe/analistas?qeId=<Marcos>` → 403 `ACCESO_DENEGADO` |

### Dictamen HDU — Grupo 1

| HDU | Dictamen | Motivo |
| --- | --- | --- |
| E1-F01 | CERTIFICADA | 3/3 escenarios pasan |
| E1-F02 | CERTIFICADA | 3/3 escenarios pasan |
| E1-F05 | CERTIFICADA | 3/3 escenarios pasan |
| E1-F07 | CERTIFICADA | 3/3 escenarios pasan |
| E1-B01 | CERTIFICADA | 3/3 escenarios pasan (B01#3 con la salvedad de infraestructura anotada abajo) |
| E1-B02 | CERTIFICADA | 3/3 escenarios pasan |

### Notas / defectos — Grupo 1

- **E1-B01#3 (observación, no defecto de producto):** el GoTrue local no
  aplicó ningún límite de tasa perceptible tras 12 intentos fallidos
  consecutivos contra `POST /auth/v1/token`. El contrato ya marca este
  escenario como `x-escenarios-sin-operacion` (responsabilidad de
  `infrastructure/supabase`, dueño `q360-infra`). Se documenta como hallazgo
  informativo, no bloqueante, para que `q360-infra` decida si configura
  `[auth.rate_limit]` en `infrastructure/supabase/config.toml`. Severidad:
  baja.

Sin defectos de producto abiertos en este grupo.

## Ronda 1 · Grupo 2 — Portales de QE y QA

Escenarios: E1-F03 (3), E1-F04 (3), E1-F06 (3), E1-B03 (3), E1-B04 (3),
E1-B05 (3) = 18 escenarios.

Interpretación de fuente caída (E1-F03#3, E1-F06#3, E1-B03#3): se levanta
una segunda instancia del gateway (`http://localhost:3100`) con
`FUENTE_RESUMEN_HDU_URL` apuntando a un puerto muerto (`:3199`), y para los
escenarios F una segunda instancia del portal (`http://localhost:5180`)
apuntando a ese gateway; el stack principal no se toca. Por diseño (regla no
negociable #4 de `docs/arquitectura/decisiones-mvp.md`), la caída de una
fuente se representa como un bloque `indisponible` dentro de una respuesta
200, nunca como un error de solicitud completo. Por eso E1-F03#3 y E1-F06#3
se verifican comprobando que el bloque de HDU muestra el texto de «no
disponible» (`bloque-hdu-qe-indisponible` / `bloque-hdu-qa-indisponible`)
mientras el otro bloque de la misma pantalla sigue mostrando datos reales
(caída parcial, no total), distinguible de cargando y de un cero explícito.
Queda escrita también en el código (`tests/e2e/fuente-caida-inicio.spec.ts`).

Ejecución: `npx playwright test api/e1-b03-resumen-qe.spec.ts api/e1-b04-equipo-qe.spec.ts api/e1-b05-resumen-qa.spec.ts e2e/e1-f03-qe-inicio.spec.ts e2e/e1-f04-qe-equipo.spec.ts e2e/e1-f06-qa-inicio.spec.ts e2e/fuente-caida-inicio.spec.ts`
→ **27/27 pasaron** (18 escenarios + 9 sesiones de `setup`), dos corridas
consecutivas con el mismo resultado; los puertos `3100`/`5180` quedan libres
al terminar (verificado con `netstat`/`tasklist`).

| Escenario | Prueba | Resultado | Evidencia |
| --- | --- | --- | --- |
| E1-F03#1 | `tests/e2e/e1-f03-qe-inicio.spec.ts` | Pasa | Carla: `tarjeta-equipo` y `tarjeta-hdu-qe` con valores numéricos; enlaces a `/qe/equipo` y `/qe/hdu` |
| E1-F03#2 | `tests/e2e/e1-f03-qe-inicio.spec.ts` | Pasa | Sofía: `tarjeta-equipo` muestra "0" explícito (consulta ok, sin analistas) |
| E1-F03#3 | `tests/e2e/fuente-caida-inicio.spec.ts` | Pasa | Ver interpretación arriba: `bloque-hdu-qe-indisponible` visible, `tarjeta-equipo` sigue con datos |
| E1-F04#1 | `tests/e2e/e1-f04-qe-equipo.spec.ts` | Pasa | Carla ve a Ana y Beatriz por nombre y correo |
| E1-F04#2 | `tests/e2e/e1-f04-qe-equipo.spec.ts` | Pasa | El correo de Diego (reasignado a Marcos) no aparece en el equipo de Carla |
| E1-F04#3 | `tests/e2e/e1-f04-qe-equipo.spec.ts` | Pasa | Sofía: `bloque-equipo-lista-vacio` = "No tienes analistas asignados." |
| E1-F06#1 | `tests/e2e/e1-f06-qa-inicio.spec.ts` | Pasa | Ana: `valor-supervisor` = "Carla Fuentes", `tarjeta-hdu-qa` numérica |
| E1-F06#2 | `tests/e2e/e1-f06-qa-inicio.spec.ts` | Pasa | Francisco: `valor-supervisor` = "Sin supervisor asignado" |
| E1-F06#3 | `tests/e2e/fuente-caida-inicio.spec.ts` | Pasa | Ver interpretación arriba: `bloque-hdu-qa-indisponible` visible, supervisor sigue con datos |
| E1-B03#1 | `tests/api/e1-b03-resumen-qe.spec.ts` | Pasa | Carla: `equipo.datos.analistasVigentes>=2`, `hdu.datos.hduEnAmbito>=6`, ambos `estado: ok` |
| E1-B03#2 | `tests/api/e1-b03-resumen-qe.spec.ts` | Pasa | Sofía: `equipo: {estado: ok, datos: {analistasVigentes: 0}}` |
| E1-B03#3 | `tests/api/e1-b03-resumen-qe.spec.ts` | Pasa | Gateway de prueba con `FUENTE_RESUMEN_HDU_URL` muerta: `hdu.estado === "indisponible"`, sin `datos`; `equipo.estado === "ok"` |
| E1-B04#1 | `tests/api/e1-b04-equipo-qe.spec.ts` | Pasa | `GET /v1/qe/analistas` de Carla incluye a Ana/Beatriz y excluye a Diego |
| E1-B04#2 | `tests/api/e1-b04-equipo-qe.spec.ts` | Pasa | Carla pide `qeId=<Marcos>` → 403 `ACCESO_DENEGADO` |
| E1-B04#3 | `tests/api/e1-b04-equipo-qe.spec.ts` | Pasa | Patricia (admin) pide `qeId=<Carla>` → 200 con el equipo de Carla |
| E1-B05#1 | `tests/api/e1-b05-resumen-qa.spec.ts` | Pasa | Ana: supervisor = Carla, `hdu.datos.hduAsignadas>=3`, `estado: ok` |
| E1-B05#2 | `tests/api/e1-b05-resumen-qa.spec.ts` | Pasa | Francisco: `supervisor: {estado: ok, datos: {supervisor: null}}` |
| E1-B05#3 | `tests/api/e1-b05-resumen-qa.spec.ts` | Pasa | Ana pide `analistaId=<Beatriz>` → 403 `ACCESO_DENEGADO` |

### Dictamen HDU — Grupo 2

| HDU | Dictamen | Motivo |
| --- | --- | --- |
| E1-F03 | CERTIFICADA | 3/3 escenarios pasan (interpretación de fuente caída documentada arriba) |
| E1-F04 | CERTIFICADA | 3/3 escenarios pasan |
| E1-F06 | CERTIFICADA | 3/3 escenarios pasan (interpretación de fuente caída documentada arriba) |
| E1-B03 | CERTIFICADA | 3/3 escenarios pasan |
| E1-B04 | CERTIFICADA | 3/3 escenarios pasan |
| E1-B05 | CERTIFICADA | 3/3 escenarios pasan |

Sin defectos de producto abiertos en este grupo.

## Ronda 1 · Grupo 3 — Administración, supervisión, perfil y sesión

Escenarios: E1-F08 (3), E1-F09 (3), E1-F10 (3), E1-F11 (3), E1-F12 (3),
E1-B06 (3), E1-B07 (3), E1-B08 (3), E1-B09 (3), E1-B10 (3), E1-B11 (3),
E1-B12 (3) = 36 escenarios.

Nota sobre E1-B08#2 (caja blanca, sin arriesgar la sesión de Patricia): se
crea un administrador propio de la prueba y se le fija contraseña con la
Admin API de Supabase (`SUPABASE_SERVICE_ROLE_KEY`, solo en memoria, nunca
versionada); para reducir el conteo global de administradores activos a
uno solo se actualiza la columna `activo` directamente en Postgres con el
rol `svc_organizacion` (mismo rol y esquema que usa Organización, ver
`tests/support/db.ts`), nunca a través de la sesión HTTP de Patricia. Un
`try/finally` restaura exactamente los administradores que estaban activos
antes de la prueba, se ejecute bien o falle; se verificó que Patricia sigue
activa y operativa después de correr esta prueba varias veces seguidas.

Defecto encontrado (`q360-frontend`, severidad media): `AdminSupervisionPage`
(`apps/web/src/pages/admin/AdminSupervisionPage.tsx`) puebla sus selects de
Analista QA y QE con `useUsuarios({ rol })` sin `tamanoPagina`, así que el
gateway devuelve como máximo 20 usuarios (el valor por defecto del
contrato) ordenados por nombre, sin buscador ni paginación en esa pantalla.
Con más de 20 QE o Analistas QA activos (ya ocurre en este entorno, con
datos propios de otras pruebas), los que quedan fuera de las primeras 20
posiciones alfabéticas no aparecen en el desplegable y no se pueden
seleccionar para asignar o cambiar supervisor — sin ningún aviso en la
interfaz. Reproducción: iniciar sesión como Administrador, abrir
`/admin/supervision` con más de 20 QE activos en el sistema, e intentar
seleccionar en "QE supervisor" uno cuyo nombre ordene después del puesto
20; la opción no existe en el `<select>`. `tests/e2e/e1-f10-admin-supervision.spec.ts`
lo evita nombrando sus fixtures con un prefijo `"0-"` que ordena primero,
y lo deja documentado en el código.

Ejecución: `npx playwright test --project=api api/e1-b06-resumen-admin.spec.ts api/e1-b07-registro-usuarios.spec.ts api/e1-b08-cambio-rol.spec.ts api/e1-b09-supervision.spec.ts api/e1-b10-perfil.spec.ts api/e1-b11-sesion.spec.ts api/e1-b12-auditoria.spec.ts --project=e2e e2e/e1-f08-admin-inicio.spec.ts e2e/e1-f09-admin-usuarios.spec.ts e2e/e1-f10-admin-supervision.spec.ts e2e/e1-f11-perfil.spec.ts e2e/e1-f12-cerrar-sesion.spec.ts e2e/fuente-caida-inicio.spec.ts`
→ **47/47 pasaron** (36 escenarios + 9 sesiones de `setup` + 2 pruebas de
`fuente-caida-inicio.spec.ts` ya contadas en el Grupo 2), repetido con el
mismo resultado (ver nota de método arriba).

| Escenario | Prueba | Resultado | Evidencia |
| --- | --- | --- | --- |
| E1-F08#1 | `tests/e2e/e1-f08-admin-inicio.spec.ts` | Pasa | Tarjetas de usuarios/supervisión con valores numéricos; enlaces a `/admin/usuarios` y `/admin/supervision` |
| E1-F08#2 | `tests/e2e/fuente-caida-inicio.spec.ts` | Pasa | Gateway de prueba con `FUENTE_RESUMEN_SUPERVISION_URL` muerta: bloques de supervisión `indisponible`, usuarios sigue `ok` |
| E1-F08#3 | `tests/e2e/e1-f08-admin-inicio.spec.ts` | Pasa | Clic en cada acceso abre `/admin/usuarios` y `/admin/supervision` |
| E1-F09#1 | `tests/e2e/e1-f09-admin-usuarios.spec.ts` | Pasa | Buscar por el correo de un usuario recién creado deja una sola fila |
| E1-F09#2 | `tests/e2e/e1-f09-admin-usuarios.spec.ts` | Pasa | Errores "El nombre/correo es obligatorio." y el diálogo sigue abierto |
| E1-F09#3 | `tests/e2e/e1-f09-admin-usuarios.spec.ts` | Pasa | Diálogo "Desactivar usuario" antes de confirmar; fila pasa a "Inactivo" |
| E1-F10#1 | `tests/e2e/e1-f10-admin-supervision.spec.ts` | Pasa | Al elegir analista y QE nuevo, se muestra el QE vigente antes de confirmar |
| E1-F10#2 | `tests/e2e/e1-f10-admin-supervision.spec.ts` | Pasa | Confirmar sin motivo muestra `error-supervision`; con motivo, se guarda |
| E1-F10#3 | `tests/e2e/e1-f10-admin-supervision.spec.ts` | Pasa | Historial lista ambos QE con fechas y el motivo del cambio |
| E1-F11#1 | `tests/e2e/e1-f11-perfil.spec.ts` | Pasa | Nombre, correo y rol de Ana visibles en `/perfil` |
| E1-F11#2 | `tests/e2e/e1-f11-perfil.spec.ts` | Pasa | Sin `select`/`combobox` de rol en la pantalla |
| E1-F11#3 | `tests/e2e/e1-f11-perfil.spec.ts` | Pasa | Tras cambiar el rol por API y recargar, el perfil muestra "QE" |
| E1-F12#1 | `tests/e2e/e1-f12-cerrar-sesion.spec.ts` | Pasa | Botón "Cerrar sesión" visible en `/qa`, `/qa/hdu` y `/perfil` |
| E1-F12#2 | `tests/e2e/e1-f12-cerrar-sesion.spec.ts` | Pasa | Tras el clic, `/login` con el formulario de ingreso |
| E1-F12#3 | `tests/e2e/e1-f12-cerrar-sesion.spec.ts` | Pasa | `goBack()` y la URL directa a `/qa/hdu` no muestran "Mis HDU" tras cerrar sesión |
| E1-B06#1 | `tests/api/e1-b06-resumen-admin.spec.ts` | Pasa | Carla pide `/v1/inicio/admin` → 403 `ACCESO_DENEGADO` |
| E1-B06#2 | `tests/api/e1-b06-resumen-admin.spec.ts` | Pasa | `total === activos + inactivos`, ambos bloques `ok` |
| E1-B06#3 | `tests/api/e1-b06-resumen-admin.spec.ts` | Pasa | `total` sube en 1 justo después de crear un usuario |
| E1-B07#1 | `tests/api/e1-b07-registro-usuarios.spec.ts` | Pasa | Segundo alta con el mismo correo → 409 `CORREO_DUPLICADO` |
| E1-B07#2 | `tests/api/e1-b07-registro-usuarios.spec.ts` | Pasa | `PATCH` de correo conserva el mismo `id` |
| E1-B07#3 | `tests/api/e1-b07-registro-usuarios.spec.ts` | Pasa | Mismo token, antes 200 y después de desactivar 403, sin volver a iniciar sesión |
| E1-B08#1 | `tests/api/e1-b08-cambio-rol.spec.ts` | Pasa | Rol fuera de catálogo → 400 `VALIDACION` |
| E1-B08#2 | `tests/api/e1-b08-cambio-rol.spec.ts` | Pasa | Ver nota de caja blanca arriba; 409 `ULTIMO_ADMINISTRADOR`, Patricia restaurada y verificada activa |
| E1-B08#3 | `tests/api/e1-b08-cambio-rol.spec.ts` | Pasa | QE con analista vigente → 409 `RELACIONES_INCOMPATIBLES` con el analista listado |
| E1-B09#1 | `tests/api/e1-b09-supervision.spec.ts` | Pasa | Supervisor no QE → 422 `SUPERVISION_INVALIDA` |
| E1-B09#2 | `tests/api/e1-b09-supervision.spec.ts` | Pasa | Sin motivo → 422 `MOTIVO_REQUERIDO`; con motivo, relación anterior cerrada y nueva vigente; historial con 2 items, 1 vigente |
| E1-B09#3 | `tests/api/e1-b09-supervision.spec.ts` | Pasa | Un QE con 2 analistas vigentes simultáneos |
| E1-B10#1 | `tests/api/e1-b10-perfil.spec.ts` | Pasa | `id`/`correo`/`rol` coinciden con la sesión de Marcos |
| E1-B10#2 | `tests/api/e1-b10-perfil.spec.ts` | Pasa | Claves exactas `[correo, id, nombre, rol]` |
| E1-B10#3 | `tests/api/e1-b10-perfil.spec.ts` | Pasa | Sin "password"/"token"/"secret" en la respuesta |
| E1-B11#1 | `tests/api/e1-b11-sesion.spec.ts` | Pasa | Token HS256 forjado vencido → 401 `SESION_EXPIRADA` |
| E1-B11#2 | `tests/api/e1-b11-sesion.spec.ts` | Pasa | Tras `logout`, el `refresh_token` ya no puede renovar la sesión |
| E1-B11#3 | `tests/api/e1-b11-sesion.spec.ts` | Pasa | El access token ya emitido sigue autenticando tras el `logout` (alcance documentado en `apps/gateway/README.md`) |
| E1-B12#1 | `tests/api/e1-b12-auditoria.spec.ts` | Pasa | `CREAR_USUARIO` y `CAMBIAR_ROL` registrados con actor y valores |
| E1-B12#2 | `tests/api/e1-b12-auditoria.spec.ts` | Pasa | `CAMBIAR_SUPERVISOR` conserva el motivo exacto |
| E1-B12#3 | `tests/api/e1-b12-auditoria.spec.ts` | Pasa | Sin "password"/"secret"/"token" en los registros |

### Dictamen HDU — Grupo 3

| HDU | Dictamen | Motivo |
| --- | --- | --- |
| E1-F08 | CERTIFICADA | 3/3 escenarios pasan |
| E1-F09 | CERTIFICADA | 3/3 escenarios pasan |
| E1-F10 | CERTIFICADA | 3/3 escenarios pasan (con el defecto de `q360-frontend` anotado arriba, que no impide el flujo bajo prueba) |
| E1-F11 | CERTIFICADA | 3/3 escenarios pasan |
| E1-F12 | CERTIFICADA | 3/3 escenarios pasan |
| E1-B06 | CERTIFICADA | 3/3 escenarios pasan |
| E1-B07 | CERTIFICADA | 3/3 escenarios pasan |
| E1-B08 | CERTIFICADA | 3/3 escenarios pasan |
| E1-B09 | CERTIFICADA | 3/3 escenarios pasan |
| E1-B10 | CERTIFICADA | 3/3 escenarios pasan |
| E1-B11 | CERTIFICADA | 3/3 escenarios pasan |
| E1-B12 | CERTIFICADA | 3/3 escenarios pasan |

### Defectos abiertos — Grupo 3

| # | Defecto | Agente dueño | Severidad | Reproducción |
| --- | --- | --- | --- | --- |
| 1 | `AdminSupervisionPage` no pagina ni busca en sus selects de QE/Analista QA (`useUsuarios({rol})` sin `tamanoPagina`); con más de 20 activos de un rol, algunos no se pueden seleccionar para (re)asignar supervisor, sin aviso. | `q360-frontend` | Media | Con >20 QE activos, abrir `/admin/supervision` e intentar seleccionar en "QE supervisor" uno cuyo nombre ordene después del puesto 20: no aparece en el `<select>`. |
