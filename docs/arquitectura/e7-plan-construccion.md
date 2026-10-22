# E7 · Plan de construcción (bandejas por rol)

Fecha: 2026-10-21. Rama: `feature/e1-e2-quality360`.

**Insumos:**
- Backlog: `docs/backlog/e7-bandejas-por-rol.md`, con 11 HDU, 33 escenarios y 100 casos.
- Diseño: `docs/diseno/e7-bandejas-por-rol.md`.
- Decisiones: D28–D53 en `docs/arquitectura/decisiones-mvp.md` (sección «Corrida E7») y ADR 0013.

**Contrato:** el de `contracts/*.yaml`, que pasa `npm run contracts:lint` y `npm run contracts:check` (159/159 escenarios de E1, E2, E3 y E7). Nadie cambia un contrato sin pasar por `q360-arquitecto`. Si al construir aparece una brecha, se reporta y no se improvisa en el código.

## Cómo se trabaja en paralelo

- `q360-backend` y `q360-frontend` arrancan el mismo día contra los contratos.
- El portal trabaja con MSW (`apps/web/src/mocks`), con los cuerpos de `contracts/dist/types/*.d.ts` (`npm run contracts:types`), hasta que el backend publique cada endpoint. Los mocks no cuentan como avance: cada HDU se da por terminada solo cuando funciona contra el stack real (`docker compose` + Supabase local).
- Cada agente trabaja en su worktree, escribe solo en sus carpetas, hace commit con su prefijo y no hace push.

## Orden y dependencias

| Ola | Quién | Entrega | Desbloquea |
| --- | --- | --- | --- |
| 1 | backend | B1 · migración, roles, `celula_lider`, `auth-nest` con 5 roles | Todo lo demás |
| 1 | frontend | F1 · roles, menú, acceso denegado y componentes base, con mocks | F2–F4 |
| 1 | integraciones | Fixture E7 de la sección 3 del backlog (semilla) | Pruebas de `q360-qa` |
| 2 | backend | B2 · ámbitos internos y relaciones de lectura (E7-B02) | B3, B4 |
| 2 | backend | B3 · cambio de rol atómico y células del líder (E7-B01) | F4 |
| 2 | frontend | F2 · bandejas Analista, QE y Administrador, con mocks | — |
| 3 | backend | B4 · lote de checklist en Certificaciones y las 5 bandejas (E7-B03) | F2, F3 reales |
| 3 | backend | B5 · consultas y exportaciones del Auditor (E7-B04) | F3 real |
| 3 | frontend | F3 · bandejas Líder y Auditor, y detalle en solo lectura | — |
| 3 | frontend | F4 · usuarios: rol y células (E7-F07) | — |
| 4 | backend | B6 · rutas nuevas en el gateway | Integración real del portal |
| 5 | qa | Regresión E1–E3, reescritura de las pruebas de D41 y certificación E7 | Dictamen |

B6 es corto y puede ir en la ola 2 (son reenvíos). Se deja aparte para no bloquear las pruebas de API, que llaman directo al servicio en desarrollo.

## q360-backend

### B1 · Modelo de datos y roles (E7-B01#1)

**Archivos:**
- `services/organizacion/prisma/schema.prisma`
- `services/organizacion/prisma/migrations/20261021000000_e7_roles_celula_lider/migration.sql`
- `services/certificaciones/prisma/schema.prisma`
- `services/certificaciones/prisma/migrations/20261021000000_e7_lectura_global/migration.sql`

**Qué hace:**
- Escribe las migraciones tal como las especifica «Modelo de datos» en la Corrida E7 (D52): 2 filas de rol, 3 valores de enum, la tabla `celula_lider` con sus 2 CHECK y 3 índices (uno único parcial), y los índices de auditoría y de bitácora.
- Las aplica en local con `prisma migrate deploy`. En la nube se aplican al cerrar la corrida (D13).
- Actualiza `services/organizacion/src/dominio/tipos.ts` (roles) y `packages/auth-nest/src/tipos.ts`: `Rol` y `ROLES` pasan a 5 valores, y `ResolucionAcceso.ambito.celulasIds` es nuevo.
- Revisa `acceso.guard.ts` y `resolutor-remoto.ts`: el guard sigue tomando el rol solo de Organización (D4) y no debe tener listas fijas de 3 roles.

**Prueba:** `modelo-datos-estructura` debe seguir pasando. Agrega un caso que confirma que el índice parcial rechaza dos vigentes de la misma célula para el mismo líder.

### B2 · Ámbitos internos y solo lectura (E7-B02)

**Organización:**
- `dominio/reglas/ambito.ts`: Líder → HDU de sus células vigentes; Auditor → todas.
- `dominio/reglas/permisos-hdu.ts`: relaciones `LECTOR_CELULA` y `LECTOR_AUDITORIA`, siempre con permisos en `false`.
- `aplicacion/acceso.servicio.ts` y `api/controladores/acceso-interno.controller.ts`:
  - `GET /v1/interno/acceso` agrega `celulasIds`.
  - `GET /v1/interno/hdu/{id}/acceso` agrega las relaciones nuevas.
  - Nuevos: `GET /v1/interno/hdu/ambito` y `POST /v1/interno/hdu/consulta`, con 403 completo si un id cae fuera de ámbito.
- `hdu.controller.ts` y `hdu.servicio.ts`:
  - `GET /v1/hdu`, `/{id}` e `/{id}/historial` admiten los 5 roles.
  - `celulaId` fuera de las células del Líder → 403.
  - Para el Líder sin células, lista vacía con 200.
  - Para el Auditor, una HDU inexistente → 404 (D50).
- `catalogos.controller.ts`: los catálogos admiten los 5 roles.

**Certificaciones:**
- `api/controladores/checklist.controller.ts` y `aplicacion/checklist.servicio.ts`: las lecturas admiten las relaciones de lectura; toda escritura las rechaza con 403 sin crear eventos (E7-B02-T08/T09).
- `infraestructura/organizacion.cliente.ts`: métodos `ambito()` y `consultarHdu(ids)`.

**Regla transversal:** toda ruta que escribe lista sus roles de forma explícita, y Líder y Auditor nunca están (D32).

### B3 · Rol y células (E7-B01)

**Archivos:** `usuarios.controller.ts`, `api/dto/usuarios.dto.ts`, `aplicacion/usuarios.servicio.ts`, `aplicacion/errores-extendidos.ts`, `dominio/repositorios/usuario.repositorio.ts` y su repositorio Prisma, y un repositorio nuevo `celula-lider` (dominio e infraestructura).

**Cambio de rol:**
- `PUT /v1/usuarios/{id}/rol` y `POST /v1/usuarios` aceptan `celulaIds` y lo aplican en una transacción con `FOR UPDATE` (D42).
- Orden de validación (D43): 400 → 422 `CATALOGO_INVALIDO` → `ULTIMO_ADMINISTRADOR` → `RELACIONES_INCOMPATIBLES`.
- El 409 informa todas las relaciones a la vez, con las 4 claves: `analistasVigentes`, `supervisorVigente`, `hduAbiertas{total, items≤20}` y `celulasVigentes`.
- D40 y D31 aplican al cambio de rol. `PATCH` (desactivar) no cambia.

**Células del líder:**
- `GET|PUT /v1/usuarios/{id}/celulas-lider`, con 409 `ROL_INCOMPATIBLE` y auditoría `ASIGNAR_CELULAS_LIDER` (antes y después).
- `GET /v1/usuarios/{id}` (nuevo).
- `Usuario.celulasVigentes` en todas las respuestas de usuario.
- `GET /v1/roles`.

**Otros:**
- `resumenes.servicio.ts`: `porRol` con 5 roles, que alimenta `/v1/inicio/admin`, ya certificado.
- `carga-semilla.servicio.ts` y `carga-semilla.dto.ts`: `CargaUsuario.celulaIds`.

### B4 · Bandejas (E7-B03, D46)

**Certificaciones:**
- `POST /v1/interno/checklist/estados`, que devuelve `SeguimientoHdu` por id con:
  - `observaciones`: entregables en PENDIENTE cuyo último evento es `RECHAZAR`.
  - `listaParaCertificar`: 1–8 aprobados y el 9 no.
  - `listaParaCerrar`: 10 aprobados.
  - `porAprobarDesde`, `listaDesde` y `ultimaActividad`.
- `GET /v1/interno/resumen-auditoria`.
- Archivos: `checklist.servicio.ts` (o uno nuevo, `seguimiento.servicio.ts`), `checklist.repositorio.ts` y el controlador.

**Organización:**
- Un módulo nuevo de bandejas:
  - `api/controladores/bandejas.controller.ts`
  - `aplicacion/bandejas.servicio.ts`
  - `aplicacion/puertos/proveedor-seguimiento.ts`
  - `infraestructura/certificaciones/proveedor-seguimiento.http.ts`, con 2 s de tiempo límite (`CERTIFICACIONES_TIMEOUT_MS`)
- Las 5 rutas `/v1/bandeja/*` exigen su propio rol, con el mismo 403 para cualquier otro (D33).
- Contadores y listas según la sección 6 del backlog; bloques `ok` o `indisponible`.
- Ante una caída de Certificaciones, aplica las reglas de D46 sobre filtros, orden y `calculoParcial`.
- `tamanoPagina` se recorta a 100 (D49).
- Pendientes y últimos cambios del Administrador según D51.

**Pruebas que deben pasar:** E7-B03-T01 a T14, con la semilla del fixture.

### B5 · Auditor (E7-B04, D48)

**Organización:**
- `GET /v1/auditor/auditoria-usuarios`, que muestra solo campos de la lista blanca y descarta claves que contengan `password`, `token` o `secret`.
- `GET /v1/auditor/exportaciones/{hdu, auditoria-usuarios}`.
- `POST /v1/interno/auditoria/exportaciones`.
- Archivos: `auditoria.controller.ts`, `auditoria.servicio.ts`, el repositorio de auditoría y un generador CSV en `infraestructura/csv/`.
- CSV en UTF-8 con BOM y separador `;`. Límite en `EXPORTACION_LIMITE_FILAS`.

**Certificaciones:**
- `GET /v1/auditor/bitacora`, `/certificados` y `/exportaciones/{bitacora, certificados}`.
- Antes de entregar el archivo, registra la exportación en Organización; si el registro falla, 503.
- Exige `rol: AUDITOR` según `/v1/interno/acceso`.
- `valido` se calcula con la misma función que la verificación pública (D45).

**Regla común:** `/v1/auditor/*` responde 403 a todo rol distinto de Auditor, incluido el Administrador. `/v1/auditoria` sigue siendo del Administrador (D53).

### B6 · Gateway (E7, reenvío)

**Archivos:**
- `apps/gateway/src/api/proxy.controller.ts`, con las rutas de Organización.
- `apps/gateway/src/api/certificaciones.controller.ts`, con las rutas de Certificaciones.
- `apps/gateway/src/aplicacion/reenviador.ts`.

**Rutas, declaradas una por una (no hay comodín):**
- `GET /v1/roles`
- `GET /v1/usuarios/{id}`
- `GET|PUT /v1/usuarios/{id}/celulas-lider`
- `GET /v1/bandeja/{analista, qe, lider, admin, auditor}`
- `GET /v1/auditor/{auditoria-usuarios, bitacora, certificados}`
- `GET /v1/auditor/exportaciones/{hdu, auditoria-usuarios, bitacora, certificados}`

**Comportamiento:**
- `reenviador.ts` transmite `text/csv` y las cabeceras `Content-Disposition` y `X-Q360-Filas` sin convertirlas a JSON.
- `/v1/interno/*` no se publica.
- Si el destino no responde, 503 `SERVICIO_NO_DISPONIBLE`.

## q360-frontend

Cada paso trabaja primero con MSW y luego contra el stack real. Los testids y textos certificados no cambian; los nuevos son los del diseño.

### F1 · Roles, menú y acceso denegado (E7-F01)

**Primer paso, bloqueante:** con los contratos de E7, `npm run contracts:types` genera `Rol` con 5 valores, y `tsc --noEmit` de `apps/web` falla en 3 puntos (comprobado el 2026-10-21):
- `src/components/Etiquetas.tsx:3`
- `src/types/dominio.ts:84`
- `src/mocks/handlers.ts:119`

Son los `Record<Rol, …>` y el `porRol` de 3 roles. Hay que corregirlos antes de cualquier otro cambio, porque el build de Vercel regenera los tipos.

**Archivos:**
- `src/types/dominio.ts`: `ROLES_CATALOGO`, `ETIQUETAS_ROL` y etiquetas de `AccionChecklist` y `AccionAuditoria` (D45).
- `src/auth/AuthContext.tsx`: `rutaPortal` para los 5 roles.
- `src/auth/RequireRole.tsx`: muestra `AccesoDenegado` variante «sección» en la URL pedida, sin `Navigate` (D41).
- `src/auth/RequireAuth.tsx`: descarta un `from` de otro rol.
- `src/pages/PortalRedirect.tsx` y `src/routes/router.tsx`: rutas `/lider` y `/auditor/*`.
- `src/components/Layout.tsx`: menú con «Bandeja» primero y enlace para saltar al contenido.
- `src/components/AccesoDenegado.tsx`: dos variantes y el botón «Ir a mi bandeja».
- `src/lib/httpClient.ts`: ante un 403, vuelve a consultar `/v1/me` y redirige si cambió el rol.
- Componentes base (5.1 del diseño): `BloqueEstado`, `TarjetaMetrica`, `DialogoConfirmacion`, `BloqueDatos`, `TablaBandeja`, `Paginacion`, `BarraFiltros` y `useFiltrosUrl`, `CeldaAvance`, `AvisoSoloLectura` y `EncabezadoBandeja`.
- Estilos: `src/styles/tokens.css` y `global.css`.
- Unitarias: actualiza `src/test/routeGuard.test.tsx` según la tabla de D41 en la Corrida E7.

### F2 · Bandejas Analista, QE y Administrador (E7-F02, F03, F05)

**Archivos:**
- `src/api/bandejas.ts` (nuevo), con la conversión de la URL a los parámetros de API (D49).
- `src/pages/qa/QaInicioPage.tsx`, `src/pages/qe/QeInicioPage.tsx` y `src/pages/admin/AdminInicioPage.tsx`: conservan las tarjetas certificadas y agregan los bloques nuevos.
- `src/pages/qe/QeAprobacionesPage.tsx`: acepta `?hdu=`.
- `src/pages/admin/AdminSupervisionPage.tsx`: acepta `?analista=` y `?qe=` (D44).

**Comportamiento:**
- La bandeja del QE sigue llamando a `/v1/inicio/qe` para el resumen de equipo.
- Con `calculoParcial`, la bandeja del QE muestra el aviso parcial.
- Los mocks se actualizan en `src/mocks/handlers.ts` y `data.ts`: 5 roles en `porRol` y 4 campos en `relaciones`.

### F3 · Líder, Auditor y detalle en solo lectura (E7-F04, F06)

**Archivos:**
- Páginas nuevas:
  - `src/pages/lider/LiderBandejaPage.tsx`
  - `src/pages/auditor/AuditorBandejaPage.tsx`
  - `src/pages/auditor/AuditorCertificadosPage.tsx`
  - `src/pages/auditor/AuditorBitacoraPage.tsx`
  - `src/pages/auditor/AuditorAuditoriaUsuariosPage.tsx`
- Componentes nuevos: `PestanasAuditor` y `BotonExportarCsv` (descarga autenticada con `Blob`).
- API nueva: `src/api/auditor.ts`.
- `src/pages/hdu/HduDetailPage.tsx`: aviso de solo lectura, sin controles de escritura cuando `permisos` es `false` (D39), y las anclas `#asignacion`, `#certificado` y `#estado`.

**Reglas:** en las pantallas del Auditor no hay `<form>` ni `button[type=submit]`. El portal no muestra ninguna clave que contenga `password`, `token` o `secret`.

### F4 · Usuarios: rol y células (E7-F07)

**Archivos:**
- `src/pages/admin/AdminUsuariosPage.tsx`: 5 roles, columna Células a partir de `celulasVigentes`, `?usuario=`, `?rol=`, `?nuevo=` y paginación.
- `src/api/usuarios.ts`: `celulaIds` en crear y en cambiar rol, `celulas-lider` y `GET /v1/usuarios/{id}`.
- Componentes nuevos: `SelectorCelulas`, `DialogoCelulasLider` y `MensajeExito`.

**Comportamiento:**
- El cambio de rol es **una sola llamada** (D42): no hay `aviso-parcial`.
- Los mensajes del 409 se arman con `relaciones` (D43).

## Otros dueños

- **q360-integraciones** (`infrastructure/seed/`):
  - Carga el fixture de la sección 3 del backlog E7, con `CargaUsuario.celulaIds` para LID1.
  - Prepara los estados de checklist de H1–H8 con las operaciones reales de Certificaciones.
  - Crea LID1, LID2, AUD1 e INACT1 en Supabase Auth.
- **q360-qa** (`tests/`, `docs/validacion/`):
  - Reescribe las pruebas listadas en D41.
  - Corre la regresión E1–E3, que debe pasar.
  - Certifica E7 en `docs/validacion/certificacion-e7.md`, con el ID de escenario en cada prueba y axe sobre las 5 bandejas.
- **q360-arquitecto:** revisa cada entrega con las reglas de rechazo:
  - SQL o llaves foráneas entre esquemas.
  - Imports entre servicios.
  - Dominio en `packages/`.
  - Autorización por claims del token.
  - Una falla convertida en 0 o en `[]`.
  - Un dominio que depende de la infraestructura.

## Criterio de terminado por HDU

- El endpoint responde lo que dice el contrato contra el stack real, verificado por una prueba de API.
- La pantalla funciona contra el gateway real.
- Las pruebas de regresión de la sección 4 del backlog E7 siguen pasando.
