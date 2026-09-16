# apps/web · Portal Quality360

Vite + React 19 + TypeScript · dueño: `q360-frontend` · consume `contracts/gateway.v1.yaml`.

## Requisitos

- Node ≥ 24, npm ≥ 11 (ver raíz del monorepo).
- Desde la raíz: `npm install --workspace apps/web`.

## Variables de entorno

Solo estas tres llegan al front (D6 / regla no negociable #6), más el interruptor de mocks:

| Variable | Uso |
| --- | --- |
| `VITE_SUPABASE_URL` | URL del proyecto Supabase (local o nube). |
| `VITE_SUPABASE_ANON_KEY` | Clave pública: acepta el formato nuevo (`sb_publishable_…`) o la `ANON_KEY` legacy. |
| `VITE_GATEWAY_URL` | URL del gateway público (`apps/gateway`, puerto 3000). |
| `VITE_USAR_MOCKS` | `"true"` activa MSW y el login simulado (sin Supabase). Sin esta variable, o en `"false"`, la app habla con `VITE_GATEWAY_URL` real. |

Copia `.env.example` a `.env.local` (no se versiona) y completa los valores. En este repo ya existe un `.env.local` de desarrollo con `VITE_USAR_MOCKS=true`.

## Scripts

```bash
npm run dev -w apps/web       # http://localhost:5173 (5173 es del portal; el prototipo raíz se corre en otro puerto si choca)
npm run build -w apps/web     # genera tipos del contrato + tsc --noEmit + vite build
npm run test -w apps/web      # Vitest (MSW en modo node)
npm run test:watch -w apps/web
npm run lint -w apps/web
```

`npm run build` y `npm run dev` no regeneran los tipos automáticamente en `dev`; si cambia el contrato, corre `npm run gen:types -w apps/web` (o `npm run contracts:types` desde la raíz). Los tipos se generan en `contracts/dist/types/*.d.ts` (no se versiona, D7).

## Modo mock (MSW)

Con `VITE_USAR_MOCKS=true`:

- El login **no** llama a Supabase: valida contra los usuarios de `src/mocks/data.ts` (`src/auth/mockAuthProvider.ts`).
- Todas las rutas `/v1/*` del gateway están simuladas en `src/mocks/handlers.ts`, con ámbito por rol, paginación, y los códigos de error del contrato (`VALIDACION`, `ACCESO_DENEGADO`, `SESION_EXPIRADA`, `CORREO_DUPLICADO`, `CODIGO_HDU_DUPLICADO`, `TRANSICION_INVALIDA`, `CHECKLIST_NO_DISPONIBLE`/`CHECKLIST_INCOMPLETO`, `MOTIVO_REQUERIDO`, `ANALISTA_FUERA_DE_EQUIPO`, etc.).
- D11: el bloque `checklist` del detalle de HDU siempre responde `indisponible`, y el cierre (`CERRADA`) siempre se rechaza (`CHECKLIST_NO_DISPONIBLE`), salvo el flag interno `simularChecklistIncompleto` usado solo en pruebas para mostrar el mensaje `CHECKLIST_INCOMPLETO`.

### Credenciales de demostración (solo mock, contraseña única `Quality360!`)

| Correo | Rol | Escenario que ilustra |
| --- | --- | --- |
| `admin@quality360.local` | Administrador | Portal completo de administración. |
| `jose.seguel@quality360.local` | QE | Equipo y HDU con datos (E1-F03#1). |
| `constanza.diaz@quality360.local` | QE | Sin analistas ni HDU: estado **vacío** explícito (E1-F03#2, E1-F04#3). |
| `jonathan.choque@quality360.local` | Analista QA | Con supervisor y HDU asignadas (E1-F06#1). |
| `ana.perez@quality360.local` | Analista QA | Sin supervisor: «Sin supervisor asignado» (E1-F06#2). |
| `camila.rojas@quality360.local` | Analista QA | Con supervisor, bloque de HDU **indisponible** (E1-F06#3). |
| `diego.soto@quality360.local` | Analista QA | Usuario inactivo: login válido pero `GET /v1/me` responde 403 y el portal cierra la sesión con el mensaje genérico (E1-B01#2). |

## Estructura

```
src/
  api/          hooks de TanStack Query por recurso (inicio, equipo, usuarios, supervision, catalogos, hdu)
  auth/         AuthContext, guardas de ruta (RequireAuth/RequireRole), proveedores mock/Supabase, sessionStore
  components/   BloqueEstado, TarjetaMetrica, DialogoConfirmacion, Layout, HduListado, Etiquetas, AccesoDenegado
  lib/          httpClient (cliente único), env, queryClient, supabaseClient, formato
  mocks/        handlers, data (usuarios/HDU/células/sprints de demostración), browser.ts, server.ts
  pages/        una carpeta por portal (admin/qe/qa) + hdu/ (detalle compartido) + login/perfil
  routes/       router.tsx (rutas y guardas)
  types/        alias hacia los tipos generados desde contracts/gateway.v1.yaml
  test/         setup de Vitest + MSW y pruebas de integración
```

## Pantallas por HDU (resumen)

| HDU | Pantalla(s) |
| --- | --- |
| E1-F01 | `pages/LoginPage.tsx` |
| E1-F02, F05, F07 | `routes/router.tsx` (guardas), `pages/PortalRedirect.tsx`, `components/Layout.tsx` |
| E1-F03 | `pages/qe/QeInicioPage.tsx` |
| E1-F04 | `pages/qe/QeEquipoPage.tsx` |
| E1-F06 | `pages/qa/QaInicioPage.tsx` |
| E1-F08 | `pages/admin/AdminInicioPage.tsx` |
| E1-F09 | `pages/admin/AdminUsuariosPage.tsx` |
| E1-F10 | `pages/admin/AdminSupervisionPage.tsx` |
| E1-F11 | `pages/PerfilPage.tsx` |
| E1-F12 | `components/Layout.tsx` (botón «Cerrar sesión», siempre visible) |
| E2-F01 | `pages/qe/QeHduFormPage.tsx` |
| E2-F02 | `pages/hdu/HduDetailPage.tsx` (diálogo de asignación) |
| E2-F03 | `pages/qa/QaHduListPage.tsx`, `pages/qe/QeHduListPage.tsx` («Historias supervisadas»), ambas sobre `components/HduListado.tsx` |
| E2-F04 | `pages/hdu/HduDetailPage.tsx` |

## `data-testid` clave

Se agregaron solo donde no había un nombre accesible único (tarjetas de resumen, filas de tabla y bloques de estado). El resto de la interfaz usa roles y nombres accesibles estables (`getByRole`, `getByLabelText`).

### Bloques de estado (cargando / error / vacío / indisponible)

Patrón `bloque-<id>-<estado>` generado por `components/BloqueEstado.tsx`. IDs usados hoy:

`inicio-admin`, `inicio-qe`, `inicio-qa`, `equipo-lista`, `hdu-supervisadas`, `mis-hdu`, `usuarios-lista`, `historial-supervision`, `hdu-detalle`, `hdu-historial`, `perfil`, `supervisor` (dentro del panel de inicio QA).

Ejemplos: `bloque-equipo-lista-vacio`, `bloque-hdu-qa-indisponible` (ver también la tarjeta `tarjeta-hdu-qa`), `bloque-inicio-admin-error`.

### Tarjetas de resumen

Patrón `tarjeta-<id>` (`components/TarjetaMetrica.tsx`): `tarjeta-equipo`, `tarjeta-hdu-qe`, `tarjeta-hdu-qa`, `tarjeta-supervisor`, `tarjeta-usuarios-total`, `tarjeta-usuarios-activos`, `tarjeta-supervision-vigentes`, `tarjeta-supervision-sin-supervisor`. `valor-supervisor` marca el nombre del QE (o su ausencia) dentro de la tarjeta de supervisor.

### Filas de tabla

`fila-hdu-<id>` (listados de HDU), `fila-analista-<id>` (equipo QE), `fila-usuario-<id>` (usuarios admin), `historial-item-<índice>` (historial de HDU), `historial-supervision-<id>` (historial de supervisión).

### Errores y avisos puntuales

`error-login`, `aviso-sesion` (SESION_EXPIRADA), `indicador-ingresando`, `error-codigo-hdu` (E2-F01#3, duplicado junto al campo código), `error-correo-duplicado`, `error-cambio-rol`, `error-cambio-estado-usuario`, `error-supervision`, `aviso-sin-cambios-supervision`, `relacion-vigente-supervision`, `error-asignacion-analista`, `aviso-sin-cambios` (HDU), `valor-analista-hdu`, `checklist-no-disponible`, `acceso-denegado`, y en el cambio de estado de HDU: `error-transicion-invalida`, `error-checklist-no-disponible`, `error-checklist-incompleto` (distintos entre sí, ver `pages/hdu/HduDetailPage.tsx`).

## Diferencias con el contrato / pendientes

- `PUT /v1/usuarios/:id/rol` y `PATCH /v1/usuarios/:id` no exponen un flag `cambio` en el contrato; el aviso «sin cambios» solo se implementó donde el contrato sí lo declara (`asignarSupervisor`, `asignarAnalistaHdu`).
- La validación de `RELACIONES_INCOMPATIBLES` en el mock cubre los casos descritos en el backlog (QE con analistas vigentes, Analista QA con supervisor vigente); no reproduce cada detalle de auditoría (eso es de `q360-backend`).
- El checklist de E3 no existe: el bloque `checklist` de `GET /v1/hdu/{id}` siempre es `indisponible` en el mock (D11), tal como lo hará el backend en esta corrida.
- Auditoría (`GET /v1/auditoria`) no tiene pantalla propia: no está en el alcance de las 48 HU de E1/E2 en el front (el backlog no lo pide como pantalla, solo como verificación por API).
