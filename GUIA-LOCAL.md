# Guía para ejecutar Quality360 en local

Esta guía deja la plataforma funcionando en tu computador con datos reales: inicio de sesión con Supabase, gateway, servicios y base de datos Postgres. Está escrita para Windows, pero los comandos son los mismos en macOS y Linux.

Tiempo estimado: unos 20 minutos la primera vez, casi todo esperando descargas. Las siguientes veces, 1 a 2 minutos.

---

## Paso 1 · Instalar los requisitos

| Programa | Versión | Cómo verificar |
| --- | --- | --- |
| [Git](https://git-scm.com/downloads) | cualquiera reciente | `git --version` |
| [Node.js](https://nodejs.org/) | **24** | `node -v` debe mostrar `v24.x` |
| npm | 11 (viene con Node 24) | `npm -v` |
| [Docker Desktop](https://www.docker.com/products/docker-desktop/) | cualquiera reciente | `docker info` sin errores |

Además necesitas:

- **Espacio en disco:** unos 8 GB libres. Las imágenes de Supabase ocupan varios GB.
- **Puertos libres:** `3000` a `3004`, `5173` y `54321` a `54324`.

> **Solo en Windows:** activa las rutas largas de Git **antes de clonar**. Sin esto aparecen errores `Filename too long`:
>
> ```bash
> git config --global core.longpaths true
> ```

## Paso 2 · Clonar el repositorio

Clónalo en una carpeta de ruta corta, por ejemplo `C:\dev`:

```bash
git clone https://github.com/MatMateDev/Quality360.git
cd Quality360
```

## Paso 3 · Instalar las dependencias

```bash
npm install
```

Toma entre 1 y 3 minutos.

## Paso 4 · Abrir Docker Desktop

Abre Docker Desktop y espera a que indique que el motor está corriendo. Verifica en la terminal:

```bash
docker info
```

Si responde con un error, Docker aún no está listo: espera unos segundos y vuelve a intentar.

## Paso 5 · Levantar la plataforma

```bash
npm run local
```

Este único comando hace todo lo siguiente:

1. Inicia Supabase local en Docker (Auth, Postgres y Storage). **La primera vez descarga sus imágenes y tarda varios minutos.**
2. Crea los esquemas y roles de la base de datos, y los buckets privados de evidencias y certificados.
3. Genera la configuración local (archivos `.env`, que no se suben a Git).
4. Compila los servicios y aplica las migraciones.
5. Arranca Organización, Certificaciones, Impedimentos, Integraciones, el gateway y el portal.
6. Carga los datos de demo.

Sabrás que terminó cuando veas:

```
Quality360 está corriendo con datos reales.

  Portal           http://localhost:5173
  Gateway          http://localhost:3000
  Supabase Studio  http://127.0.0.1:54323
```

**No cierres esa terminal:** los procesos viven mientras el comando está abierto.

## Paso 6 · Entrar al portal

Abre http://localhost:5173 e inicia sesión. La contraseña de todos los usuarios es `Quality360Demo#2025`.

| Rol | Correo | Qué verás |
| --- | --- | --- |
| Administrador | `patricia.rojas@quality360.local` | Usuarios, roles y supervisión |
| QE | `carla.fuentes@quality360.local` | Su equipo (Ana y Beatriz) y las historias que supervisa |
| Analista QA | `ana.torres@quality360.local` | Su supervisora, sus historias asignadas y el checklist de entregables |

Estos usuarios y su contraseña **solo existen en tu Supabase local**. La lista completa, con qué escenario de prueba habilita cada usuario, está en [`infrastructure/seed/mvp/README.md`](infrastructure/seed/mvp/README.md).

## Paso 7 · Detener

- **Detener la plataforma:** `Ctrl+C` en la terminal donde corre `npm run local`.
- **Detener también Supabase** (libera memoria; los datos se conservan):

  ```bash
  cd infrastructure
  npm run supabase:stop
  ```

La próxima vez solo necesitas abrir Docker Desktop y ejecutar `npm run local`.

### Si ya tenías una versión anterior

Después de `git pull`, ejecuta `npm install` y luego `npm run local -- --build`:

- **Desde una versión sin E3:** `npm run local` detecta que tu Supabase local no tiene Storage y lo reinicia con Storage activo. También agrega a la configuración de Certificaciones las variables nuevas.
- **Desde una versión anterior al modelo de datos:** las migraciones renombran las tablas según el modelo ER (por ejemplo `hdu` pasa a `historia_usuario`) y crean las nuevas (`rol`, `historia_sprint`, `certificacion`, `evidencia`, `impedimento`…).

En ambos casos **los datos se conservan**. El modelo y su correspondencia con las tablas están en `docs/arquitectura/modelo-datos/` y en `docs/arquitectura/decisiones-mvp.md` (D23–D27).

## Paso 8 · Recorrer el flujo de certificación (E3)

1. Entra como **Carla** (QE), abre una HDU que supervisa y asígnala a Ana si no tiene analista.
2. Entra como **Ana** (Analista QA), abre la HDU y marca el entregable 1 con un enlace `https://…` o un archivo PDF, PNG o JPEG de hasta 10 MB. Los entregables se marcan en orden, del 1 al 10.
3. Vuelve como **Carla**: en su inicio, «Aprobaciones pendientes» lista lo que espera revisión. Aprueba o rechaza con observaciones.
4. Con los entregables 1 a 8 aprobados, Carla genera el **certificado PDF** desde el detalle de la HDU. Eso completa el entregable 9.
5. Cualquier persona, sin iniciar sesión, puede validar el folio impreso en http://localhost:5173/verificar.
6. Con los 10 entregables aprobados, la HDU puede pasar a **Cerrada**.

---

## Tareas frecuentes

| Quiero… | Comando |
| --- | --- |
| Ver cambios de código de los servicios o del gateway | `npm run local -- --build` |
| Ver los archivos de evidencias y certificados | Supabase Studio → Storage → buckets `evidencias` y `certificados` |
| Volver a cargar los datos de demo (no duplica) | `npm run seed` |
| Ver y consultar la base de datos | Abrir http://127.0.0.1:54323 (Supabase Studio) |
| Regenerar la configuración local | `node infrastructure/local/preparar-entorno.mjs --forzar` y luego reiniciar `npm run local` |
| Correr las pruebas de cada servicio | `npm run ws:test` (con Supabase corriendo). **Borra los datos locales de Organización**: después ejecuta `npm run seed` |
| Correr la suite de certificación | Con la plataforma arriba: `cd tests`, `npm install`, `npx playwright install chromium`, `npm test` |

### Empezar con la base de datos limpia

Correr las pruebas crea muchos usuarios y HDU de prueba. Para volver a dejar solo los datos de demo:

```bash
cd infrastructure
npm run supabase:stop -- --no-backup
cd ..
npm run local
```

`--no-backup` **borra todos los datos locales**. El comando siguiente vuelve a crear todo desde cero.

---

## Problemas frecuentes

| Síntoma | Causa probable | Solución |
| --- | --- | --- |
| `Docker no responde. Abre Docker Desktop…` | Docker Desktop cerrado o iniciando | Ábrelo, espera a que el motor esté corriendo y repite `npm run local` |
| `Filename too long` al clonar o instalar | Rutas largas deshabilitadas en Windows | `git config --global core.longpaths true` y clonar en una carpeta corta |
| `organizacion no respondió en http://localhost:3001/health` | Puerto ocupado por otra ejecución anterior | Cierra la otra terminal con `npm run local` o termina el proceso que usa el puerto |
| `Cannot find module '@quality360/auth-nest'` | Compilación incompleta | `npm run local -- --build` |
| No puedo iniciar sesión con los usuarios de demo | Los datos no se cargaron | Revisa el final de la salida de `npm run local` o ejecuta `npm run seed` |
| El portal muestra «sesión expirada» o errores 401 tras regenerar la configuración | Los servicios siguen con el token anterior | `Ctrl+C` y `npm run local` de nuevo |
| El panel de administración muestra cientos de usuarios | Quedaron datos de corridas de pruebas | Sigue «Empezar con la base de datos limpia» |
| La primera ejecución parece detenida en «Iniciando Supabase local» | Está descargando imágenes de Docker | Espera; puede tardar varios minutos según tu conexión |
| El checklist muestra «No disponible en este momento» | Certificaciones no arrancó o le falta configuración | `node infrastructure/local/preparar-entorno.mjs --forzar` y luego `npm run local -- --build` |
| Al adjuntar un archivo aparece un error de subida | Supabase local sin Storage o sin buckets | `Ctrl+C` y `npm run local` de nuevo: reinicia Supabase con Storage y crea los buckets |

---

## Qué corre y dónde

| Componente | Puerto | Tecnología |
| --- | --- | --- |
| Portal | 5173 | React 19 + Vite |
| Gateway | 3000 | NestJS |
| Organización | 3001 | NestJS + Prisma |
| Certificaciones | 3002 | NestJS + Prisma |
| Impedimentos | 3003 | NestJS + Prisma |
| Integraciones | 3004 | NestJS + Prisma |
| Supabase API, Auth y Storage | 54321 | Supabase CLI en Docker |
| Postgres | 54322 | Supabase CLI en Docker |
| Supabase Studio | 54323 | Supabase CLI en Docker |

### Integraciones en local y Jira simulado (E5)

`npm run local` levanta Integraciones (puerto 3004, `/health`) igual que los otros servicios: aplica sus migraciones (esquema `integraciones`, rol `svc_integraciones`) y el gateway le reenvía las rutas `/v1/integraciones/*` con `INTEGRACIONES_URL=http://localhost:3004`.

- **Llave de cifrado de desarrollo.** `preparar-entorno.mjs` genera `INTEGRACIONES_LLAVE_CIFRADO` con `crypto.randomBytes(32).toString('base64')` y la guarda solo en `services/integraciones/.env` (no versionado). Es una llave por máquina: si ya existe y es válida se conserva, para no dejar ilegible el token de Jira guardado; si falta, el siguiente `npm run local` regenera el archivo. Si la borras, se crea otra y hay que volver a guardar el token en la pantalla de Integraciones. Sin llave el servicio arranca igual y solo cifrar o descifrar responde 503 `LLAVE_CIFRADO_NO_DISPONIBLE`.
- **Jira simulado.** El Jira falso de QA (`tests/support/jira-falso/`, lo construye q360-qa) escucha en `http://127.0.0.1:4010` y lo arranca el `globalSetup` de Playwright; no forma parte de `npm run local`. Para que Integraciones acepte ese sitio, el `.env` local trae `INTEGRACIONES_PERMITIR_HOST_PRUEBA=true` (se ignora con `NODE_ENV=production`). Credenciales del falso: correo `admin@quality360.local` y token `q360-token-valido-AB12` (datos de prueba, no reales). Un puerto cerrado como `http://127.0.0.1:4011` representa un sitio inexistente.
- **Instancias extra del perfil de QA (backlog E5, 10.3).** Se arrancan a mano con el mismo `.env` y variables sobreescritas; ninguna llave va en el repositorio (en Git Bash; en PowerShell usa `$env:VAR='...'`):
  - **I2**, sin llave de cifrado, puerto 3104: `PORT=3104 INTEGRACIONES_LLAVE_CIFRADO= node --env-file=services/integraciones/.env services/integraciones/dist/main.js`
  - **I3**, otra llave: `PORT=3105 INTEGRACIONES_LLAVE_CIFRADO=$(node -e "console.log(require('crypto').randomBytes(32).toString('base64'))") node --env-file=...`
  - **I4**, presupuesto corto: `PORT=3106 INTEGRACIONES_PRESUPUESTO_MS=2500 node --env-file=...`
  - **I5**, producción (prueba D95): `PORT=3107 NODE_ENV=production node --env-file=...`
  Las variables del proceso tienen prioridad sobre `--env-file`. Los puertos 3105 a 3107 son una convención de esta guía; solo 3104 viene del backlog.
- **Perfil de pruebas del servicio:** `JIRA_TIEMPO_LIMITE_MS=1500`, `JIRA_ESPERA_MAX_429_MS=1500`, `INTEGRACIONES_PRESUPUESTO_MS=8000`, `JIRA_TOPE_ISSUES=100`; se pasan igual, como variables del proceso.

> Las credenciales de esta guía (contraseña de demo y contraseñas `*_local_dev` de los roles de base de datos) **solo sirven en local**. Nunca las uses en un entorno publicado.
