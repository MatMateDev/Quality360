# ADR 0001 · Monorepo con npm workspaces

- **Estado:** aceptada
- **Fecha:** 2026-09-15
- **Decisión base:** D1

## Contexto

El repositorio contiene hoy un prototipo React en `src/` con su `package.json` en la raíz. El MVP suma un portal, un gateway, cuatro servicios, una librería compartida de guards y contratos OpenAPI. Varios agentes trabajan en paralelo sobre carpetas distintas y el equipo ya usa npm.

## Decisión

- Un solo repositorio con npm workspaces: `apps/*`, `packages/*` y `services/*`. Un solo `package-lock.json` en la raíz.
- La raíz es dueña de `package.json`, `tsconfig.base.json`, `.editorconfig`, `redocly.yaml` y los scripts transversales:
  - `contracts:lint`, `contracts:check` y `contracts:bundle` para los contratos.
  - `ws:lint`, `ws:test` y `ws:build`, que recorren los workspaces con `--if-present`.
- `tsconfig.base.json` fija solo el rigor común (`strict`, `target`). Cada proyecto define `module`, `moduleResolution`, `lib` y decoradores: Nest y Vite necesitan valores distintos.
- El prototipo sigue en la raíz con `dev`, `build`, `preview` y `lint` (`oxlint src`) hasta que `apps/web` lo reemplace y el equipo apruebe retirarlo.
- Cada agente instala con `npm install --workspace <su-workspace>`.

## Consecuencias

- Contratos, código y CI viven en un mismo commit, así que un cambio de contrato se revisa junto con su implementación.
- Las dependencias se elevan a `node_modules` de la raíz. El prototipo y `apps/web` deben usar la misma versión mayor de React para no duplicarla.
- Un workspace sin `package.json` no existe para npm. Las carpetas creadas en la Ola 0 solo tienen su README hasta que el agente dueño genere el proyecto.
- Al retirar el prototipo hay que quitar de la raíz `vite`, `@vitejs/plugin-react`, `react`, `react-dom`, `index.html`, `vite.config.js` y los scripts `dev`, `build` y `preview`.

## Alternativas descartadas

- **pnpm, Turborepo o Nx:** más rápidos, pero suman una herramienta que el equipo no usa y un paso más en CI.
- **Un repositorio por servicio:** los contratos se desincronizan y el CI se multiplica.
- **Mover el prototipo a `apps/web` en la Ola 0:** rompería `npm run dev` y le quitaría la migración a su dueño (`q360-frontend`).
