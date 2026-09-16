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
  usuarios o HDU de la semilla que otros escenarios necesitan. Correr la
  suite dos veces da el mismo resultado (verificado).
- Comando para reproducir: `cd tests && npx playwright test` (requiere el
  stack arriba y `npx playwright install chromium` la primera vez).

## Interpretaciones ya decididas (arquitecto)

- **E2-B02#3**: se verifica como cierre rechazado con `CHECKLIST_NO_DISPONIBLE`
  (ninguna HDU llega a `CERRADA` en esta corrida, D11).
- **E1-F06#3**: se verifica con la fuente de HDU caída (E2 ya está
  habilitada); el portal debe decir «no disponible», nunca 0.

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
