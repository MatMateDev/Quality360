# Guía para publicar Quality360 en Vercel

Deja la plataforma funcionando en internet con datos reales:

- **Supabase en la nube** (proyecto `ufdnrrpeznwyargzgopu`, región São Paulo): base de datos y login.
- **Vercel** (plan Hobby, gratis), cinco proyectos en la región São Paulo (`gru1`):

| Proyecto Vercel | Root Directory | Qué es |
| --- | --- | --- |
| `quality360-certificaciones` | `services/certificaciones` | Servicio de certificaciones |
| `quality360-impedimentos` | `services/impedimentos` | Impedimentos y riesgo por HDU (E4) |
| `quality360-organizacion` | `services/organizacion` | Usuarios, supervisión y HDU |
| `quality360-gateway` | `apps/gateway` | Punto de entrada de la API |
| `quality360-portal` | `apps/web` | Portal web |

Cada carpeta ya trae su `vercel.json` (instalación desde la raíz del monorepo, compilación, región y rutas). Los servicios se publican como una función que sirve el código compilado (`api/index.mjs`).

> **Ya está hecho en Supabase:** esquemas `organizacion`, `certificaciones`, `impedimentos` e `integraciones`, roles de servicio **sin contraseña**, permisos, aislamiento entre servicios y las tablas de Organización. Los roles `anon`, `authenticated` y `service_role` no tienen acceso a esos esquemas. Además, las tablas de Organización tienen **RLS activo** con una sola política, para `svc_organizacion` (`infrastructure/nube/002_rls_organizacion_nube.sql`).
>
> **Cambios de base de datos:** las migraciones de `services/*/prisma/migrations` se aplican en Supabase en orden de fecha, cada una precedida de `set local search_path to <esquema>;`, y después los scripts `infrastructure/nube/002` a `004` (RLS y buckets). Hazlo justo antes de publicar el código que las necesita: el código nuevo no funciona con las tablas anteriores, ni al revés.

Tiempo estimado: 30 a 40 minutos.

---

## Paso 1 · Asignar contraseñas a los roles de base de datos (Supabase)

1. Genera dos contraseñas largas, **solo letras y números** para no tener que codificarlas en la URL. En PowerShell (usa un generador aleatorio seguro):

   ```powershell
   [guid]::NewGuid().ToString('N')
   ```

   Ejecútalo tres veces y guarda las tres en un lugar seguro.

2. En [Supabase](https://supabase.com/dashboard/project/ufdnrrpeznwyargzgopu) abre **SQL Editor** y ejecuta, reemplazando los valores:

   ```sql
   alter role svc_organizacion with password 'CONTRASEÑA_ORGANIZACION';
   alter role svc_certificaciones with password 'CONTRASEÑA_CERTIFICACIONES';
   alter role svc_impedimentos with password 'CONTRASEÑA_IMPEDIMENTOS';
   ```

## Paso 2 · Reunir los datos de conexión (Supabase)

1. En el proyecto, pulsa **Connect** y elige **Transaction pooler** (puerto `6543`). Copia el **host**: algo como `aws-0-sa-east-1.pooler.supabase.com` (puede decir `aws-1-…`).
2. Arma las tres URL de base de datos. El usuario es `rol.idProyecto`:

   ```
   postgresql://svc_organizacion.ufdnrrpeznwyargzgopu:CONTRASEÑA_ORGANIZACION@HOST:6543/postgres?schema=organizacion&pgbouncer=true&connection_limit=1
   postgresql://svc_certificaciones.ufdnrrpeznwyargzgopu:CONTRASEÑA_CERTIFICACIONES@HOST:6543/postgres?schema=certificaciones&pgbouncer=true&connection_limit=1
   postgresql://svc_impedimentos.ufdnrrpeznwyargzgopu:CONTRASEÑA_IMPEDIMENTOS@HOST:6543/postgres?schema=impedimentos&pgbouncer=true&connection_limit=1
   ```

3. En **Project Settings > API Keys** copia:
   - La **clave publicable** (`sb_publishable_…`): la usa el portal y es pública por diseño.
   - La **clave secreta** (`sb_secret_…`, o la `service_role` legacy): **solo** para Organización y Certificaciones (Impedimentos no la usa). Nunca la compartas ni la subas al repositorio.

4. Genera el token entre servicios (una sola vez, guárdalo):

   ```powershell
   [guid]::NewGuid().ToString('N') + [guid]::NewGuid().ToString('N')
   ```

## Paso 3 · Crear los proyectos en Vercel

Para **cada** fila de la tabla del inicio, en este orden (certificaciones, impedimentos, organización, gateway, portal):

1. En [vercel.com/new](https://vercel.com/new), importa el repositorio **MatMateDev/Quality360**.
2. **Project Name:** el de la tabla.
3. **Root Directory:** pulsa *Edit* y elige la carpeta de la tabla.
4. **Framework Preset:** déjalo como lo detecte; el `vercel.json` de la carpeta manda.
5. Abre **Environment Variables** y agrega las de la sección correspondiente (abajo).
6. Pulsa **Deploy** y, al terminar, **copia la URL de producción** (por ejemplo `https://quality360-organizacion.vercel.app`). La necesitarás en los proyectos siguientes.

> Si Vercel asigna una URL con sufijo porque el nombre ya existe, usa **la URL real** en las variables de los proyectos siguientes.

### Variables de `quality360-certificaciones`

| Variable | Valor |
| --- | --- |
| `DATABASE_URL` | URL de `svc_certificaciones` del paso 2 |
| `SUPABASE_URL` | `https://ufdnrrpeznwyargzgopu.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Clave secreta del paso 2: firma subidas y descargas de evidencias y certificados (E3) |
| `ORGANIZACION_URL` | `https://quality360-organizacion.vercel.app` (ajústala cuando exista) |
| `PORTAL_URL` | URL real del portal: se imprime en el certificado para verificar el folio |

### Variables de `quality360-impedimentos`

| Variable | Valor |
| --- | --- |
| `DATABASE_URL` | URL de `svc_impedimentos` del paso 2 (`?schema=impedimentos&pgbouncer=true`) |
| `SUPABASE_URL` | `https://ufdnrrpeznwyargzgopu.supabase.co` (el verificador JWT se configura igual que en Certificaciones) |
| `ORGANIZACION_URL` | `https://quality360-organizacion.vercel.app` (ajústala cuando exista) |
| `CERTIFICACIONES_URL` | URL real de `quality360-certificaciones` |
| `NODE_ENV` | `production` (hace que se ignore `Q360_FECHA_REFERENCIA`, D90) |
| `ORGANIZACION_TIMEOUT_MS`, `CERTIFICACIONES_TIMEOUT_MS` | Solo si cambias los valores por defecto (5000 y 2000) |
| `RIESGO_DIAS_IMPEDIMENTO_ALTO`, `RIESGO_DIAS_SPRINT_ALTO`, `RIESGO_AVANCE_ALTO`, `RIESGO_DIAS_SPRINT_MEDIO`, `RIESGO_AVANCE_MEDIO` | Solo si cambias los umbrales por defecto (D67) |
| `EXPORTACION_LIMITE_FILAS` | Solo si cambias el límite por defecto (50.000) |
| `PERMITIR_CARGA_SEMILLA` y `X_Q360_SERVICIO_TOKEN` | Solo mientras se carga la semilla E4, como en Organización; después, `PERMITIR_CARGA_SEMILLA=false` y Redeploy |

> No agregues `Q360_FECHA_REFERENCIA` en la nube.

### Variables de `quality360-organizacion`

| Variable | Valor |
| --- | --- |
| `DATABASE_URL` | URL de `svc_organizacion` del paso 2 |
| `SUPABASE_URL` | `https://ufdnrrpeznwyargzgopu.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Clave secreta del paso 2 |
| `X_Q360_SERVICIO_TOKEN` | Token del paso 2 |
| `PERMITIR_CARGA_SEMILLA` | `true` (solo hasta el paso 4) |
| `CERTIFICACIONES_URL` | URL real de `quality360-certificaciones` |
| `IMPEDIMENTOS_URL` | URL real de `quality360-impedimentos`. Sin ella el cierre de una HDU responde 503 (D60) |
| `IMPEDIMENTOS_TIMEOUT_MS` | Opcional (2000 por defecto) |

### Variables de `quality360-gateway`

| Variable | Valor |
| --- | --- |
| `SUPABASE_URL` | `https://ufdnrrpeznwyargzgopu.supabase.co` |
| `ORGANIZACION_URL` | URL real de `quality360-organizacion` |
| `CERTIFICACIONES_URL` | URL real de `quality360-certificaciones` |
| `IMPEDIMENTOS_URL` | URL real de `quality360-impedimentos`. **Obligatoria**: en producción el gateway no arranca sin ella |
| `IMPEDIMENTOS_TIMEOUT_MS` | Opcional; si falta, vale `TIEMPO_LIMITE_SERVICIO_MS` |
| `PORTAL_ORIGENES` | `https://quality360-portal.vercel.app` (ajústala cuando exista) |
| `CONFIAR_PROXY` | `1` |
| `TIEMPO_LIMITE_FUENTE_MS` | `10000` |
| `TIEMPO_LIMITE_SERVICIO_MS` | `15000` |

### Variables de `quality360-portal`

| Variable | Valor |
| --- | --- |
| `VITE_USAR_MOCKS` | `false` |
| `VITE_SUPABASE_URL` | `https://ufdnrrpeznwyargzgopu.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | Clave publicable del paso 2 |
| `VITE_GATEWAY_URL` | URL real de `quality360-gateway` |

### Ajustar las URL que no existían aún

- En `quality360-certificaciones` y `quality360-impedimentos`, confirma `ORGANIZACION_URL`.
- En `quality360-gateway`, confirma `PORTAL_ORIGENES` con la URL real del portal.

Después de cambiar variables, en ese proyecto ve a **Deployments**, abre el último y pulsa **Redeploy**: las variables solo se aplican en un despliegue nuevo.

**Verificación rápida:** abre `https://<gateway>/health`, `https://<organizacion>/health` y `https://<impedimentos>/health`. Los tres deben responder `{"estado":"ok"}`. Además, sin iniciar sesión:

- `https://<gateway>/v1/catalogos/tipos-impedimento` → 401 `NO_AUTENTICADO` (si responde 501, el gateway desplegado es anterior a E4).
- `https://<gateway>/v1/interno/impedimentos/evaluacion` → 404: las rutas internas no se publican.

## Paso 4 · Cargar los usuarios de demo

Desde tu copia local del repositorio (con `npm install` hecho), en PowerShell:

```powershell
$env:ORGANIZACION_URL = "https://quality360-organizacion.vercel.app"   # URL real
$env:X_Q360_SERVICIO_TOKEN = "TOKEN_DEL_PASO_2"
$env:CONTRASENA_DEMO = "UNA_CONTRASEÑA_NUEVA_DE_12_O_MAS"
npm run seed
```

Debe terminar con `Sin rechazos.`: crea 10 usuarios, 2 células, 3 sprints y 14 HDU. Correrlo de nuevo no duplica nada.

**Luego desactiva la carga:** en `quality360-organizacion` cambia `PERMITIR_CARGA_SEMILLA` a `false` y haz **Redeploy**.

## Paso 5 · Entrar

Abre la URL del portal e inicia sesión con la contraseña que elegiste en `CONTRASENA_DEMO`:

| Rol | Correo |
| --- | --- |
| Administrador | `patricia.rojas@quality360.local` |
| QE | `carla.fuentes@quality360.local` |
| Analista QA | `ana.torres@quality360.local` |

En **Supabase > Authentication > URL Configuration**, pon la URL del portal como **Site URL**. Se usa en las invitaciones cuando el administrador crea usuarios nuevos.

---

## Problemas frecuentes

| Síntoma | Causa probable | Solución |
| --- | --- | --- |
| El portal muestra error de red al iniciar sesión o al cargar paneles | `PORTAL_ORIGENES` del gateway no coincide con la URL del portal (CORS) | Corrige la variable en el gateway y haz Redeploy |
| `/health` responde, pero todo da 403 «sin registro en Organización» | Los usuarios de demo no se cargaron | Repite el paso 4 |
| Organización falla con error de conexión a la base | Contraseña, host del pooler o formato de `DATABASE_URL` incorrectos | Revisa el paso 2: usuario `svc_organizacion.ufdnrrpeznwyargzgopu` y puerto `6543` |
| La primera carga tarda unos segundos | Arranque en frío de las funciones | Es normal; las siguientes solicitudes son rápidas |
| El gateway responde 500 en todas las rutas tras desplegar E4 | Falta `IMPEDIMENTOS_URL` en el gateway (es obligatoria en producción) | Agrégala y haz Redeploy |
| Cerrar una HDU responde 503 «No pudimos verificar los impedimentos de la HDU» | `IMPEDIMENTOS_URL` falta o está mal en Organización, o Impedimentos no responde | Corrige la variable en Organización, revisa `https://<impedimentos>/health` y haz Redeploy |
| La semilla responde 404 | `PERMITIR_CARGA_SEMILLA` no está en `true` o no se hizo Redeploy | Activa la variable y redespliega |

> Las contraseñas y claves de esta guía viven solo en Supabase y en las variables de Vercel. Nunca las escribas en archivos del repositorio.
