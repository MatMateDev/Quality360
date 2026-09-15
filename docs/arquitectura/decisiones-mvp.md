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
