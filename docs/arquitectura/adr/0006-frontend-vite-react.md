# ADR 0006 · Frontend con Vite, React 19 y TypeScript

- **Estado:** aceptada
- **Fecha:** 2026-09-15
- **Decisión base:** D6

## Contexto

El prototipo en `src/` es React 19 con Vite en JavaScript. Usa `localStorage` como fuente de datos y un selector de rol simulado. El MVP necesita rutas protegidas por rol, datos del servidor con cuatro estados visibles (cargando, error, vacío e indisponible) y tipos alineados con el contrato del gateway.

## Decisión

- `apps/web` con Vite, React 19 y TypeScript.
- **React Router** para las rutas `/admin`, `/qe` y `/qa`, con un guard que decide según el `rol` de `GET /v1/me`. Nunca según el token ni `localStorage`.
- **TanStack Query** para los datos del servidor. `signOut` limpia su caché.
- **`@supabase/supabase-js`** solo para autenticar (`signInWithPassword`, `signOut` y renovación de sesión).
- **Tipos** generados con `openapi-typescript` desde `contracts/gateway.v1.yaml`. Los contratos usan `$ref` a `comun.v1.yaml`; si el generador lo requiere, se genera desde `npm run contracts:bundle`.
- **MSW** para mocks basados en el contrato mientras el backend no esté listo; **Vitest** y **Testing Library** para las pruebas.
- **Un único cliente HTTP:** agrega `Authorization: Bearer` y ante 401 `SESION_EXPIRADA` limpia la sesión y vuelve al login.
- **Variables del front:** solo `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` y `VITE_GATEWAY_URL`.
- **Migración:** de `src/` se rescatan estilos y componentes útiles. El prototipo no se borra hasta que el equipo lo apruebe (ADR 0001).

## Consecuencias

- El contrato manda: si cambia una respuesta, los tipos del front fallan en compilación.
- Cada bloque compuesto se modela como unión discriminada por `estado` (`ok` o `indisponible`), así que el portal no puede mostrar `0` por una fuente caída sin escribirlo a propósito.
- Durante la transición conviven dos apps Vite: el prototipo en la raíz (5173 con `npm run dev`) y `apps/web`, que necesita otro puerto si ambas corren a la vez.

## Alternativas descartadas

- **Next.js:** el SSR no aporta en un portal autenticado y suma un servidor más.
- **Seguir en JavaScript:** sin tipos del contrato, las diferencias con el backend se detectarían tarde.
- **Redux para datos del servidor:** TanStack Query ya resuelve caché, reintentos y estados de carga sin código repetitivo.
