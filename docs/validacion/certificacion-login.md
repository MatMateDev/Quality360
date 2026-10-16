# Certificación del login y de la autenticación con Supabase · Quality360

Dueño: `q360-qa`. Alcance: el rediseño del inicio de sesión («Acceso A») y la autenticación con Supabase Auth
(commits `0973efd` frontend, `5470488` seguridad, `c730188` D8 y `a4f05f8` backlog), sobre el stack local.
HDU: **E1-F01**, **E1-F13** (recuperar el acceso, interfaz), **E1-B01**, **E1-B11** y **E1-B13**
(restablecimiento seguro). Regresión **solo local**: sin despliegue, push ni commit.

## Dictamen final

| HDU | Dictamen | Razón |
| --- | --- | --- |
| E1-F01 (3 escenarios) | **CERTIFICADA** | 14 pruebas pasan en la regresión completa |
| E1-F13 (3) | **CERTIFICADA** | 7 pruebas con su ID pasan (solicitud, nueva contraseña, enlace inválido) |
| E1-B13 (3) | **CERTIFICADA**, con #3 parcial | #1 y #2 pasan por API y por la interfaz (D1 y D2 corregidos; sus pruebas pasan sin modificarlas). #3: la redirección y el 429 de reenvío pasan; el límite en la nube queda pendiente, igual que E1-B01#3 |
| E1-B01 (3) | **CERTIFICADA**, con #3 **NO VERIFICABLE** en local | #1 y #2 pasan por API y por la interfaz. #3: la enumeración pasa; el límite de intentos no existe en Supabase local (K1) y su prueba se omite con esa razón |
| E1-B11 (3) | **CERTIFICADA** | #1, #2 y #3 pasan por API; #1 y #2 también por la interfaz |

Sin regresión: los 102 escenarios de E1+E2 (96 anteriores + 6 de E1-F13/E1-B13) y los 24 de E3 tienen al menos
una prueba que pasa, y las 43 `[MODELO]` pasan. Las demás HDU certificadas conservan su dictamen. Defectos de
la ronda 1: D1–D6, D8 y D11 corregidos; D7, D9 y D10 siguen abiertos como deuda.

## Historia de la certificación

- **Ronda 1:** 70 pruebas nuevas; las unitarias de los workspaces pasaron (286), pero `npm run ws:test` vació la
  semilla de Organización (D9) y el seed no se podía repetir con más de 1000 cuentas en Auth (D8). Se encontraron
  D1 (media) y D2 (baja) con pruebas rojas.
- **Ronda 2 (esta):** D8 corregido por el orquestador, D1–D6 por `q360-frontend`; semilla restaurada con
  `npm run seed`. Regresión completa local. Regla nueva: no se ejecuta `ws:test` ni las pruebas de
  `services/organizacion` ni `services/certificaciones` (vacían la base compartida).

## Entorno verificado

- Stack local del orquestador, sin detenerlo: portal Vite `:5173`, gateway `:3000`, Supabase `:54321` (GoTrue
  2.196.0), Mailpit `:54324`. `VITE_USAR_MOCKS=false`. Semilla cargada: login real de `patricia.rojas` con
  `/v1/me` 200 al empezar y al terminar.
- Node 24.16.0, Playwright 1.63.0 (Chromium). `@axe-core/playwright` no existe en el repo y no se instaló: la
  accesibilidad se verifica con comprobaciones directas (`[LOGIN-A11Y]`).
- Las pruebas de E1-F13/E1-B13 crean su propia cuenta (no usan usuarios de la semilla) y la limpian: desactivan al
  usuario, lo eliminan de Auth y vacían su buzón de Mailpit.
- Reproducir: `cd tests && npx playwright test`. Logs (no versionados por `*.log`):
  `tests/login-regresion-completa.log` (suite completa) y `tests/login-ronda1-login.log` (specs del login).
  Capturas: `docs/validacion/evidencia-login/` (28 PNG, todas regeneradas).

## Pruebas nuevas y modificadas (solo `tests/`)

| Archivo | Pruebas | Qué verifica |
| --- | --- | --- |
| `e2e/e1-f01-login.spec.ts` (reescrito) | 14 | E1-F01 #1 (formulario, ojo dentro del campo, `aria-label`/`aria-pressed`, teclado, enlaces a recuperar y `/verificar`), #2 (vacíos, formatos, sin solicitud a `/auth/v1/`, foco), #3 («Ingresando…», mensaje genérico, correo conservado, contraseña vacía, igual para existente e inexistente) |
| `e2e/e1-b01-login-ui.spec.ts` | 10 | E1-B01 #1/#2/#3 por la interfaz (desactivado, sin registro en Organización, 429/abort/503 simulados, `/v1/me` 503/abort/429) y D6 (rechazo de Organización = `signOut` local y la otra sesión sigue viva) |
| `e2e/e1-b11-sesion-ui.spec.ts` | 3 | E1-B11 #1: 401 `SESION_EXPIRADA` real del gateway → `aviso-sesion` ámbar |
| `e2e/login-redireccion-rol.spec.ts` | 7 | Login → `/admin`, `/qe`, `/qa` (E1-F07#1, E1-F02#1, E1-F05#1) y navegación |
| `e2e/login-responsivo-a11y.spec.ts` | 22 | 3 pantallas × 5 anchos (sin scroll horizontal, logo, un único `h1`, campos 16 px, controles 44 px), errores largos, estructura, teclado y foco, contraste, movimiento reducido |
| `e2e/recuperacion-contrasena-ui.spec.ts` | 16 | E1-F13 #1–#3 y E1-B13 #1–#3 de punta a punta, D3 (aviso no reaparece), D6 (abandono = cierre local) y `[LOGIN-SEG]` |
| `api/recuperacion-contrasena.spec.ts` | 6 | IDs `[E1-B13#n]`; D11: `afterAll` elimina la cuenta `qa.recupera-clave-…` |
| `support/login.ts`, `support/correoLocal.ts`, `support/ui.ts` | — | Soporte (textos y testids, medición de disposición, Mailpit, `getByLabel(..., {exact:true})`) |

Cambio de premisa por D4: `verificarDisposicion` y `[LOGIN-A11Y]` ya no buscan el `h1` del panel de marca sino el
título del formulario como único `h1` en los 5 anchos; el titular del panel solo se exige visible desde 1024 px.

## Escenario → prueba → resultado

Todas se ejecutaron en la regresión completa (`tests/login-regresion-completa.log`) y pasan, salvo la omitida indicada.

| ID | Prueba | Resultado | Evidencia |
| --- | --- | --- | --- |
| E1-F01#1 | formulario, ojo dentro del campo, `aria-label` alterna, teclado, enlaces (3 e2e) | Pasa | `login-1280x800-formulario.png` |
| E1-F01#2 | vacíos, uno vacío, 4 formatos, solo espacios (8 e2e) | Pasa | `login-1280x800-campos-vacios.png` |
| E1-F01#3 | «Ingresando…», genérico idéntico, sin filtrar la contraseña (3 e2e) | Pasa | `login-1280x800-ingresando.png`, `-credenciales-incorrectas.png` |
| E1-F13#1 | solicitud por la UI y misma confirmación para registrado e inexistente; 429 de reenvío simulado | Pasa | `recuperar-1280x800-confirmacion.png` |
| E1-F13#2 | validaciones (8 caracteres, coincidencia); éxito → `/login` con `aviso-contrasena-actualizada`, que no reaparece al recargar (D3) | Pasa | `restablecer-1280x800-no-coincide.png`, `login-1280x800-contrasena-actualizada.png` |
| E1-F13#3 | segundo uso, otro navegador, enlaces manipulados → `enlace-invalido` sin acceso | Pasa | `restablecer-1280x800-enlace-invalido.png` |
| E1-B01#1 | API login de Carla con `/v1/me` 200; UI reintento y entrada al portal | Pasa | — |
| E1-B01#2 | API: 403 idéntico para desactivado y sin registro; clave errónea = inexistente. UI: genérico, al recargar no reaparece, sin sesión; D6 | Pasa | `login-1280x800-usuario-desactivado.png` |
| E1-B01#3 | API: enumeración (6 intentos). API `@limite-intentos` | Pasa / **Omitida: NO VERIFICABLE en local** (45 intentos sin 429; falta `GOTRUE_RATE_LIMIT_HEADER`) | `login-1280x800-demasiados-intentos.png` (simulado) |
| E1-B11#1 | API 401 `SESION_EXPIRADA`; UI `aviso-sesion` | Pasa | `login-1280x800-sesion-expirada.png` |
| E1-B11#2 | API: el cierre local y el global revocan la renovación | Pasa | — |
| E1-B11#3 | API: alcance documentado (access token vigente hasta `exp`) | Pasa | — |
| E1-B13#1 | API #1, #2, #4 (respuesta idéntica, el correo llega, un solo uso); UI: correo solo a la cuenta registrada | Pasa | — |
| E1-B13#2 | API #3 (clave anterior inválida, sesiones previas no renuevan); UI: sin `/v1/` en `/restablecer-contrasena`; **sesión abandonada (D1)**; **token fuera del historial (D2)**; abandono cierra solo local (D6) | Pasa (D1 y D2 pasan sin modificar las pruebas) | `recuperacion-sesion-abandonada-qa.png` |
| E1-B13#3 | API #5 (`redirectTo` ajeno), #6 (429); UI: 429 real de reenvío y límite por IP | Pasa. **Límite de la nube: pendiente** | — |

## Regresión completa frente a `certificacion-modelo-datos.md`

| Suite | Pasan | Fallan | Omitidas |
| --- | --- | --- | --- |
| `tests/` completo (257: 9 `setup`, 117 `api`, 131 `e2e`) | **256** | **0** | **1** (`@limite-intentos`, limitación conocida) |
| Escenarios por ID, E1+E2 | 102/102 (96 + 6 de E1-F13/E1-B13) | 0 | 0 |
| Escenarios por ID, E3 | 24/24 | 0 | 0 |
| `[MODELO]` | 43/43 | 0 | 0 |
| Unitarias `apps/web` (vitest, 10 archivos) | 91 | 0 | 0 |
| Unitarias `apps/gateway` | 40 | 0 | 0 |
| Unitarias `packages/auth-nest` | 38 | 0 | 0 |
| Unitarias `services/*` | no ejecutadas por la regla D9 (ronda 1: certificaciones 43, impedimentos 1, organizacion 98; la prueba nueva de D8 no se re-verificó) | — | — |

La última certificación (modelo de datos, ronda 2) fue 175/175 con 96 + 24 escenarios y 43 `[MODELO]`. Ahora pasan
256 y se omite 1, con 6 escenarios más (E1-F13/E1-B13) y las pruebas del login: sin regresión en E1, E2, E3 ni en el
modelo de datos, y sin pruebas intermitentes.

## Hallazgos

Cada defecto trae su estado tras la ronda 2. Los marcados «corregido» se volvieron a ejecutar con sus pruebas,
que no se modificaron (excepto D4, donde cambió la premisa de la prueba de disposición, ver más abajo).

### Defectos de la ronda 1 y su estado

| # | Sev. | Dueño | Hallazgo | Estado y evidencia |
| --- | --- | --- | --- | --- |
| D1 | Media | `q360-frontend` | Una sesión de recuperación abandonada (carga completa hacia `/qa`) entraba al portal sin contraseña | **Corregido.** `auth/supabaseAuthProvider.ts` admite solo una sesión con `amr` `password`, o la del enlace dentro de `/restablecer-contrasena`; en cualquier otra ruta la descarta con `signOut` local. `[E1-B13#2] una sesión de recuperación abandonada …` pasa sin modificarla (antes fallaba con «abrió el portal en /qa … amr: otp») |
| D2 | Baja | `q360-frontend` | El token del enlace quedaba en una entrada del historial (`#access_token=…`) | **Corregido.** El hash se quita con `history.replaceState` antes de crear el cliente y la sesión se establece con `setSession`. `[E1-B13#2] el token del enlace no queda en una entrada del historial …` pasa sin modificarla |
| D3 | Baja | `q360-frontend` | El aviso «contraseña actualizada» reaparecía al recargar `/login` | **Corregido.** La observación pasó a aserción dentro de `[E1-F13#2] con una contraseña válida …`: tras recargar el aviso no está |
| D4 | Baja | `q360-frontend` | Sin `h1` bajo 1024 px | **Corregido.** El título del formulario es el único `h1` en todos los tamaños; el titular del panel pasó a `<p>`. Cambió la premisa de `verificarDisposicion`/`[LOGIN-RESP]`: antes exigían «h1 del panel solo desde 1024 px»; ahora exigen un único `h1` visible (el título del formulario) en los 5 anchos y el titular del panel solo desde 1024 px. `[LOGIN-A11Y]` busca el título como `h1` |
| D5 | Baja | `q360-frontend` | `width`/`height` del logo no coincidían con el archivo | **Corregido.** 367×296 en `AccesoLayout.tsx` |
| D6 | Baja | `q360-frontend` | Cualquier 401/403 de `/v1/me` y el abandono de la recuperación hacían `signOut` global | **Corregido.** Ambos usan `scope: "local"`. Dos pruebas nuevas lo verifican con una segunda sesión del mismo usuario que sigue pudiendo renovarse: `[E1-B01#2] el rechazo de Organización cierra solo la sesión de este navegador …` y `[E1-B13#2] abandonar la recuperación cierra solo la sesión local …` |
| D8 | Alta | `q360-backend` | `buscarPorCorreo` solo miraba las primeras 1000 cuentas de Auth | **Corregido** por el orquestador (pagina todas las cuentas; prueba unitaria propia). Con 1700+ cuentas en Auth el seed volvió a cargar sin rechazos y la regresión completa corrió sobre esa semilla |
| D11 | Baja | `q360-seguridad-gateway` | La spec de API de recuperación dejaba una cuenta `qa.recupera-clave-…` por ejecución | **Corregido** (cambio de `q360-qa` en `tests/`): `afterAll` desactiva la cuenta en Organización, la elimina de Auth y vacía su buzón |
| D7 | Baja | `q360-frontend` | El bundle de producción incluye `mocks/data.ts` (contraseña demo `Quality360!`) | **Abierto (deuda, preexistente).** No se revisó en esta ronda |
| D9 | Alta (proceso) | `q360-backend` | Las pruebas de Organización vacían la base compartida y dejan una cuenta `prueba.*` por prueba | **Abierto (deuda).** Por esa razón no se ejecutaron `ws:test` ni las pruebas de `services/organizacion` ni de `services/certificaciones` en la ronda 2 |
| D10 | Media | `q360-backend` / `q360-infra` | `npm run ws:test` no corre en Windows con el stack arriba (EPERM en `prisma generate`) | **Abierto (deuda)** |
| D12 | Baja | `q360-arquitecto` | Artefactos sin versionar (`tsconfig.tsbuildinfo`, `tmp/`, `output/`, `.agents/`, `.codex/`) | Fuera del alcance de esta ronda: no se vuelve a revisar |

### Revisado sin hallazgo

- **Enumeración de cuentas en el login:** `invalid_credentials` es idéntico para contraseña errónea, correo
  inexistente y desactivado (API); en la interfaz el HTML de la alerta es idéntico en los tres casos y para una
  cuenta sin registro en Organización.
- **Enumeración en la recuperación:** misma confirmación y misma respuesta de Auth (200 `{}`) para un correo
  registrado e inexistente; el 429 `over_email_send_rate_limit` (real, por reenvío inmediato) y el simulado se
  muestran como confirmación; solo `over_request_rate_limit` y la caída del servicio se informan.
- **Redirección abierta:** `redirectTo` es siempre el origen del portal; un `redirect_to` ajeno cae al `site_url`
  (API) y ningún parámetro de la URL cambia el destino tras ingresar (`LOGIN-SEG`).
- **Sesión de recuperación:** no se llama a `/v1/me` mientras se está en `/restablecer-contrasena`; abandonarla
  (por la interfaz o con una carga completa) la descarta; el token no queda en la URL ni en el historial.
- Enlaces manipulados (sin enlace, token falso, código falso, `#error=…`) muestran `enlace-invalido`.

### Limitaciones conocidas (no son defectos)

- **K1 · Límite de intentos en local:** Supabase local no aplica ningún límite por IP (45 intentos seguidos sin
  429; falta `GOTRUE_RATE_LIMIT_HEADER` en el contenedor de la CLI). `[E1-B01#3] al superar el límite…` se omite
  con esa razón y es la única prueba omitida de la regresión. En la nube el límite lo aplica Auth › Rate Limits;
  la reacción del portal se verificó con respuestas simuladas, que no certifican el límite del proveedor.
- **K2 · Token válido hasta su vencimiento tras cerrar sesión:** `signOut()` global revoca la renovación en todas
  las sesiones, pero el gateway verifica el JWT localmente (JWKS) y el access token ya emitido sigue respondiendo
  200 hasta su `exp` (`jwt_expiry` 3600 s). Decisión documentada en `apps/gateway/README.md`; la cubre
  `[E1-B11#3]`.
- **K3 · Desactivar no banea en Auth:** un usuario desactivado en Organización puede autenticarse y renovar en
  Supabase; todo `/v1/*` le responde 403 (D4 de las decisiones, E1-B07#3). El portal lo trata como credenciales
  y cierra la sesión local.
- **K4 · SMTP con 500 solo para correos registrados:** con el SMTP por defecto de la nube, GoTrue responde 500
  `unexpected_failure` únicamente cuando la cuenta existe y el envío falla; para un inexistente responde 200. El
  portal informa el 500 como «servicio no disponible» (`auth/errorAcceso.ts`), así que en ese escenario la
  interfaz distingue cuentas. `[E1-B13#1] limitación conocida …` fija el comportamiento actual. Se resuelve con
  un SMTP propio (abajo); si se prefiere neutralizarlo en el portal, es decisión de `q360-frontend` con
  `q360-seguridad-gateway`.
- **K5 · Mailpit local:** `max_frequency` de 1 s en local (60 s por defecto en la nube); el SMTP local no limita el
  envío.
- **K6 · El gateway no mira `amr`:** acepta en `/v1/*` un access token de recuperación (`amr: otp`) igual que uno de
  contraseña; la defensa está en el portal (D1). Rechazar en el gateway los tokens sin `password` en `amr`
  sería una defensa en profundidad opcional de `q360-seguridad-gateway`.

## Pasos pendientes en la nube (no aplicados; ver `decisiones-mvp.md`, «Sesión e identidad»)

La regresión de esta certificación es solo local: no se desplegó, no se hizo push ni commit.

1. **Auth › URL Configuration › Site URL:** `https://quality360-one.vercel.app`.
2. **Auth › URL Configuration › Redirect URLs:** agregar `https://quality360-one.vercel.app/restablecer-contrasena`.
3. **Auth › SMTP Settings:** configurar un SMTP propio. El SMTP por defecto solo entrega a los miembros del
   equipo del proyecto y tiene un tope bajo por hora; sin él la recuperación no llega a los usuarios reales y se
   expone K4.
4. **Auth › Rate Limits:** confirmar el valor de «sign-ups and sign-ins» (E1-B01#3, que no se puede verificar en
   local; también el límite de envíos de E1-B13#3) y ajustar los correos por hora a la capacidad del SMTP.
5. Con la nube, E1-B01#3, el límite de E1-B13#3 y K4 se pueden verificar de verdad;
   `tests/api/e1-b01-credenciales.spec.ts` ya trae la prueba `@limite-intentos`.

## Escenarios y áreas no cubiertos

- Pruebas unitarias de `services/organizacion`, `certificaciones` e `impedimentos` (regla D9).
- Flujo PKCE con un enlace real; Safari, Firefox y lectores de pantalla (solo Chromium); análisis con axe.
- Nube (Vercel y Supabase): no se probó.
