# Plataforma QA Dashboard

Plataforma web para el seguimiento y gestión de certificaciones QA mediante dashboards.

## Requisitos

Para ejecutar el proyecto se requiere:

- GitHub Desktop
- Visual Studio Code
- Node.js 24.x
- npm

## Clonar el proyecto

1. Aceptar la invitación al repositorio privado en GitHub.
2. Abrir GitHub Desktop.
3. Ir a `File → Clone repository`.
4. Seleccionar el repositorio `capstone-grupo-8-qa-dashboard`.
5. Elegir una carpeta local.
6. Presionar `Clone`.

Ejemplo de ubicación:

```text
C:\Proyectos\capstone-grupo-8-qa-dashboard
```

## Levantar el proyecto

Abrir la carpeta clonada en Visual Studio Code.

Luego abrir una terminal:

```text
Terminal → New Terminal
```

Verificar que la terminal esté ubicada en la carpeta del proyecto:

```text
C:\Proyectos\capstone-grupo-8-qa-dashboard
```

Instalar las dependencias:

```bash
npm install
```

Luego iniciar la aplicación:

```bash
npm run dev
```

Abrir en el navegador:

```text
http://localhost:5173
```

## Detener la aplicación

En la terminal presionar:

```text
Ctrl + C
```

## Importante

No ejecutar:

```bash
npm create vite
```

El proyecto ya está creado y debe ser clonado desde GitHub.

La carpeta `node_modules` no se almacena en el repositorio, por lo que cada integrante debe ejecutar:

```bash
npm install
```

después de clonar el proyecto por primera vez.

Actualmente algunos datos del prototipo se almacenan mediante `localStorage`, por lo que esos datos son locales a cada navegador y no se comparten mediante GitHub.

## Roles actuales del prototipo

- Administrador
- Quality Engineer (QE)
- Analista QA

## Flujo de trabajo

Antes de comenzar a trabajar:

```text
Fetch origin
```

Después de realizar cambios:

```text
Guardar cambios
→ Commit
→ Push origin
```

## Proyecto académico

Proyecto desarrollado como parte de Capstone de Ingeniería en Informática.
