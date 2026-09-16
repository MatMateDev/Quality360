# Quality360

Plataforma para supervisar la certificación QA de historias de usuario (HDU). El Quality Engineer (QE) supervisa a su equipo de analistas y cada Analista QA certifica las HDU que tiene asignadas. Proyecto Capstone de Ingeniería en Informática, DuocUC, Grupo 8.

## Estado

| Épica | Alcance | Estado |
| --- | --- | --- |
| E1 · Acceso, portales y organización QA | 24 HDU, 72 escenarios | Certificada |
| E2 · Gestión de HDU | 8 HDU, 24 escenarios | Certificada |
| E3 · Certificación y entregables | 8 HDU | Pendiente |
| E4 · Impedimentos y riesgos | 8 HDU | Pendiente |
| E5 · Integración con Jira Cloud | 8 HDU | Pendiente |
| E6 · Indicadores y dashboards | 8 HDU | Pendiente |

La certificación de E1 y E2 cubre los 96 escenarios de aceptación del backlog, con 111 pruebas automatizadas contra el stack real. El dictamen por escenario y por HDU está en [`docs/validacion/certificacion-e1-e2.md`](docs/validacion/certificacion-e1-e2.md).

## Arquitectura

```
Navegador ── Portal React ── Gateway ──┬── Organización ─┐
                 │                      ├── Certificaciones ├── Postgres (un esquema y un rol por servicio)
                 │                      └── Impedimentos ──┘
                 └── Supabase Auth (identidad)
```

- **Portal** (`apps/web`): React 19, Vite, TypeScript. Un portal por rol: Administrador, QE y Analista QA.
- **Gateway** (`apps/gateway`): único punto público. Verifica la sesión, enruta y compone los paneles de inicio. Si una fuente cae, el bloque se muestra como no disponible, nunca con cifras inventadas.
- **Servicios** (`services/*`): NestJS y Prisma. Cada uno usa su propio esquema y su propio rol de Postgres, sin SQL entre esquemas. Supabase Auth autentica, pero cada servicio vuelve a autorizar el rol, el usuario activo y el ámbito.
- **Contratos** (`contracts/`): OpenAPI 3.1 versionado, con los roles y escenarios de cada operación.

Decisiones y justificación: [`docs/arquitectura/decisiones-mvp.md`](docs/arquitectura/decisiones-mvp.md) y los ADR en [`docs/arquitectura/adr/`](docs/arquitectura/adr/).

## Requisitos

- Node.js 24 y npm 11
- Docker Desktop abierto (Supabase local corre en contenedores)

## Levantar en local

```bash
npm install
npm run local
```

`npm run local` deja la plataforma funcionando con datos reales:

1. Inicia Supabase local, si no está corriendo.
2. Crea los esquemas y roles de base de datos.
3. Genera la configuración local (archivos `.env`, que no se versionan).
4. Compila y aplica las migraciones.
5. Arranca los servicios, el gateway y el portal.
6. Carga los datos de demo.

Se puede ejecutar varias veces: reutiliza lo que ya está corriendo y no duplica datos.

| Recurso | URL |
| --- | --- |
| Portal | http://localhost:5173 |
| Gateway | http://localhost:3000 |
| Supabase Studio | http://127.0.0.1:54323 |

Usuarios de demo (contraseña `Quality360Demo#2025`, **solo local**):

| Rol | Correo |
| --- | --- |
| Administrador | `patricia.rojas@quality360.local` |
| QE | `carla.fuentes@quality360.local` |
| Analista QA | `ana.torres@quality360.local` |

La lista completa, con los escenarios que habilita cada usuario, está en [`infrastructure/seed/mvp/README.md`](infrastructure/seed/mvp/README.md).

`Ctrl+C` detiene los procesos. Para recompilar todo: `npm run local -- --build`. Para detener Supabase: `npm run supabase:stop` dentro de `infrastructure/`.

## Pruebas

```bash
# Pruebas unitarias y de integración de cada workspace
npm run ws:test

# Suite de certificación (Playwright), con la plataforma levantada
cd tests
npm install
npx playwright install chromium
npm test
```

## Estructura

| Carpeta | Contenido |
| --- | --- |
| `apps/web` | Portal React |
| `apps/gateway` | Gateway NestJS |
| `packages/auth-nest` | Verificación de sesión y autorización compartida |
| `services/organizacion` | Usuarios, supervisión, HDU, células y sprints (E1, E2) |
| `services/certificaciones` | Base del servicio de certificaciones (E3) |
| `services/impedimentos` | Base del servicio de impedimentos (E4) |
| `contracts` | Contratos OpenAPI |
| `infrastructure` | Supabase local, SQL de esquemas y roles, Docker Compose, semilla y arranque local |
| `tests` | Suite de certificación E2E y de API |
| `docs` | Arquitectura, backlog y validación |

## Seguridad

- Los archivos `.env` no se versionan. `npm run local` los genera a partir de Supabase local.
- Las contraseñas de los roles `svc_*` (sufijo `_local_dev`) y la contraseña de demo **solo sirven en local**. Un entorno en la nube debe usar credenciales nuevas, generadas fuera del repositorio.
- La clave `service_role` de Supabase solo la usa el servicio de Organización; nunca llega al navegador.
- Docker Compose (`infrastructure/docker-compose.yml`) es una alternativa a `npm run local`; ver [`infrastructure/README.md`](infrastructure/README.md). El servicio `integraciones` está bajo el perfil `e5` hasta que exista su código.
