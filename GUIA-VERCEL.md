# Guía para publicar Quality360 en Vercel

Deja la plataforma funcionando en internet con datos reales:

- **Supabase en la nube** (proyecto `ufdnrrpeznwyargzgopu`, región São Paulo): base de datos y login.
- **Vercel** (plan Hobby, gratis), cuatro proyectos en la región São Paulo (`gru1`):

| Proyecto Vercel | Root Directory | Qué es |
| --- | --- | --- |
| `quality360-certificaciones` | `services/certificaciones` | Servicio de certificaciones |
| `quality360-organizacion` | `services/organizacion` | Usuarios, supervisión y HDU |
| `quality360-gateway` | `apps/gateway` | Punto de entrada de la API |
| `quality360-portal` | `apps/web` | Portal web |

Cada carpeta ya trae su `vercel.json` (instalación desde la raíz del monorepo, compilación, región y rutas). Los servicios se publican como una función que sirve el código compilado (`api/index.mjs`).

> **Ya está hecho en Supabase:** esquemas `organizacion`, `certificaciones`, `impedimentos` e `integraciones`, roles de servicio **sin contraseña**, permisos, aislamiento entre servicios y las tablas de Organización. Los roles `anon`, `authenticated` y `service_role` no tienen acceso a esos esquemas. Además, las tablas de Organización tienen **RLS activo** con una sola política, para `svc_organizacion` (`infrastructure/nube/002_rls_organizacion_nube.sql`).

Tiempo estimado: 30 a 40 minutos.

---

## Paso 1 · Asignar contraseñas a los roles de base de datos (Supabase)

1. Genera dos contraseñas largas, **solo letras y números** para no tener que codificarlas en la URL. En PowerShell (usa un generador aleatorio seguro):

   ```powershell
   [guid]::NewGuid().ToString('N')
   ```

   Ejecútalo dos veces y guarda ambas en un lugar seguro.

2. En [Supabase](https://supabase.com/dashboard/project/ufdnrrpeznwyargzgopu) abre **SQL Editor** y ejecuta, reemplazando los valores:

   ```sql
   alter role svc_organizacion with password 'CONTRASEÑA_ORGANIZACION';
   alter role svc_certificaciones with password 'CONTRASEÑA_CERTIFICACIONES';
   ```

## Paso 2 · Reunir los datos de conexión (Supabase)

1. En el proyecto, pulsa **Connect** y elige **Transaction pooler** (puerto `6543`). Copia el **host**: algo como `aws-0-sa-east-1.pooler.supabase.com` (puede decir `aws-1-…`).
2. Arma las dos URL de base de datos. El usuario es `rol.idProyecto`:

   ```
   postgresql://svc_organizacion.ufdnrrpeznwyargzgopu:CONTRASEÑA_ORGANIZACION@HOST:6543/postgres?schema=organizacion&pgbouncer=true&connection_limit=1
   postgresql://svc_certificaciones.ufdnrrpeznwyargzgopu:CONTRASEÑA_CERTIFICACIONES@HOST:6543/postgres?schema=certificaciones&pgbouncer=true&connection_limit=1
   ```

3. En **Project Settings > API Keys** copia:
   - La **clave publicable** (`sb_publishable_…`): la usa el portal y es pública por diseño.
   - La **clave secreta** (`sb_secret_…`, o la `service_role` legacy): **solo** para Organización. Nunca la compartas ni la subas al repositorio.

4. Genera el token entre servicios (una sola vez, guárdalo):

   ```powershell
   [guid]::NewGuid().ToString('N') + [guid]::NewGuid().ToString('N')
   ```

## Paso 3 · Crear los proyectos en Vercel

Para **cada** fila de la tabla del inicio, en este orden (certificaciones, organización, gateway, portal):

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
| `ORGANIZACION_URL` | `https://quality360-organizacion.vercel.app` (ajústala cuando exista) |

### Variables de `quality360-organizacion`

| Variable | Valor |
| --- | --- |
| `DATABASE_URL` | URL de `svc_organizacion` del paso 2 |
| `SUPABASE_URL` | `https://ufdnrrpeznwyargzgopu.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Clave secreta del paso 2 |
| `X_Q360_SERVICIO_TOKEN` | Token del paso 2 |
| `PERMITIR_CARGA_SEMILLA` | `true` (solo hasta el paso 4) |
| `CERTIFICACIONES_URL` | URL real de `quality360-certificaciones` |

### Variables de `quality360-gateway`

| Variable | Valor |
| --- | --- |
| `SUPABASE_URL` | `https://ufdnrrpeznwyargzgopu.supabase.co` |
| `ORGANIZACION_URL` | URL real de `quality360-organizacion` |
| `CERTIFICACIONES_URL` | URL real de `quality360-certificaciones` |
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

- En `quality360-certificaciones`, confirma `ORGANIZACION_URL`.
- En `quality360-gateway`, confirma `PORTAL_ORIGENES` con la URL real del portal.

Después de cambiar variables, en ese proyecto ve a **Deployments**, abre el último y pulsa **Redeploy**: las variables solo se aplican en un despliegue nuevo.

**Verificación rápida:** abre `https://<gateway>/health` y `https://<organizacion>/health`. Ambos deben responder `{"estado":"ok"}`.

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
| La semilla responde 404 | `PERMITIR_CARGA_SEMILLA` no está en `true` o no se hizo Redeploy | Activa la variable y redespliega |

> Las contraseñas y claves de esta guía viven solo en Supabase y en las variables de Vercel. Nunca las escribas en archivos del repositorio.
