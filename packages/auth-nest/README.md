# `@quality360/auth-nest`

Identidad y autorización para los servicios NestJS de Quality360. **Sin lógica de negocio:** verifica la sesión de Supabase y aplica la decisión de acceso que entrega Organización.

- Dueño: `q360-seguridad-gateway`.
- Consumidores: `apps/gateway` (solo autentica) y los servicios de `services/` (autentican y autorizan).
- Decisiones que implementa: **D4** y ADR 0004 (el rol y el estado activo viven en Organización, nunca en el token), **D12** y ADR 0012 (403 genérico), formato de error de `contracts/comun.v1.yaml`.

## Instalación en un workspace

```jsonc
// services/<servicio>/package.json
"dependencies": { "@quality360/auth-nest": "*" }
```

```bash
npm install --workspace services/<servicio>
npm run build --workspace packages/auth-nest   # el paquete se consume compilado desde dist/
```

El paquete es ESM (`"type": "module"`), se compila con `tsc` a `dist/` con tipos y `.d.ts.map`. Requiere Node >= 24 y NestJS 11 (`@nestjs/common`, `@nestjs/core`, `reflect-metadata` y `rxjs` son *peer dependencies*).

## Qué verifica del token

El access token de Supabase se valida contra el **JWKS** de `<SUPABASE_URL>/auth/v1/.well-known/jwks.json`: firma, `exp`, `iss` y `aud`. El secreto **HS256** (`SUPABASE_JWT_SECRET`) se admite solo como respaldo local, y únicamente si la variable existe; es el formato de las llaves *legacy* de Supabase local.

- El algoritmo se toma del encabezado solo para elegir entre dos verificadores cuyos algoritmos ya están fijados por configuración (`ES256`, `RS256`, `EdDSA` o `HS256`). Lo que diga el cliente nunca amplía lo permitido.
- Un token `HS256` jamás se valida contra una llave pública, ni al revés: la confusión de algoritmo se rechaza. `alg: none` también.
- La llave se elige por `kid`; un `kid` desconocido fuerza una recarga del JWKS y, si no aparece, responde 401.
- Se exige `sub` con forma de UUID y `exp` presente. Un token de llave de API (`role` distinto de `authenticated`) o de sesión anónima no vale como sesión de usuario.
- **Nunca** se leen `user_metadata` ni `app_metadata`. La identidad expone solo `id`, `correo`, `token`, `expiraEn`, `emisor` y `sesionId`.

Respuestas: token inválido → 401 `NO_AUTENTICADO`; token vencido → 401 `SESION_EXPIRADA`; JWKS inalcanzable → 503 `SERVICIO_NO_DISPONIBLE` (se falla cerrado: no se da por inválida una sesión que quizá es legítima, ni se concede acceso).

## Variables de entorno

| Variable | Obligatoria | Uso |
| --- | --- | --- |
| `SUPABASE_URL` | sí (salvo que se den `SUPABASE_JWT_ISSUER` y `SUPABASE_JWKS_URL`) | Deduce el emisor y la URL del JWKS. |
| `SUPABASE_JWT_ISSUER` | no | `iss` esperado. Por defecto `<SUPABASE_URL>/auth/v1`. Útil cuando el contenedor llega a Supabase por otra URL que la del token. |
| `SUPABASE_JWT_AUDIENCE` | no | `aud` esperado. Por defecto `authenticated`. |
| `SUPABASE_JWKS_URL` | no | Sobrescribe la URL del JWKS. |
| `SUPABASE_JWT_SECRET` | no | Respaldo HS256 local. Sin ella, los tokens HS256 se rechazan. |
| `SUPABASE_JWT_TOLERANCIA_S` | no | Tolerancia de reloj en segundos (5 por defecto). |

`opcionesDesdeEntorno()` las lee; ninguna tiene valor por defecto para los secretos.

## `IdentidadGuard`

Autentica y deja `request.identidad`. No autoriza nada.

```ts
@Module({
  imports: [
    AuthNestModule.forRoot({
      verificador: opcionesDesdeEntorno(),   // o { supabaseUrl, emisor, audiencia, secretoHs256 }
      resolutor: { useClass: ResolutorDeAccesoPrisma },
      guardiaAccesoGlobal: true,             // el gateway lo deja en false: solo autentica
    }),
  ],
})
export class AppModule {}
```

`forRoot` registra `IdentidadGuard` como guard global (se falla cerrado: toda ruta nueva exige sesión) y el filtro `FiltroErroresQ360`, que responde en el formato común y fija `x-trace-id`. Para excluir una ruta, `@Publico()`:

```ts
@Publico()
@Get('health')
salud() { return { estado: 'ok' }; }
```

También existe `forRootAsync({ inject, useFactory })` para tomar la configuración de `ConfigService`.

## `@Roles(...)` y `AccesoGuard`

`@Roles(...)` declara los roles de la operación (`x-roles` del contrato). `AccesoGuard` compara contra el rol **vigente** que entrega Organización, nunca contra el token.

```ts
@Roles('ADMINISTRADOR')
@Get('v1/usuarios')
listar(@AccesoActual() acceso: ResolucionAcceso) { /* acceso.rol, acceso.ambito */ }
```

`AccesoGuard` deniega con 403 `ACCESO_DENEGADO` y mensaje genérico —el mismo cuerpo en los tres casos, para no revelar nada— cuando el usuario no tiene registro en Organización, está inactivo (aunque su token siga vigente, E1-B07#3) o su rol no está en `@Roles(...)`. Sin `@Roles(...)` basta con estar registrado y activo. Si Organización no responde, 503: nunca concede acceso por defecto.

Decoradores de parámetro: `@IdentidadActual()` y `@AccesoActual()`.

## `ResolutorDeAcceso`

Interfaz que cada servicio implementa; es el único punto donde se decide el rol.

```ts
interface ResolutorDeAcceso {
  resolver(identidad: Identidad, contexto: ContextoAcceso): Promise<ResolucionAcceso | null>;
}

interface ResolucionAcceso {
  usuarioId: string;
  rol: 'ADMINISTRADOR' | 'QE' | 'ANALISTA_QA';
  activo: boolean;
  ambito: { qeSupervisorId: string | null; analistasSupervisadosIds: readonly string[] };
}
```

- `null` = el usuario autenticado no tiene registro en Organización → 403.
- **Organización** lo implementa con sus propias tablas y lo registra con `resolutor: { useClass: ... }`.
- **Los demás servicios** usan la implementación remota incluida, que consulta `GET /v1/interno/acceso` con el token propagado y sin caché. Nunca leen el esquema `organizacion`:

```ts
AuthNestModule.forRoot({
  verificador: opcionesDesdeEntorno(),
  resolutor: { useClass: ResolutorDeAccesoRemoto },
  guardiaAccesoGlobal: true,
});
// y en el módulo del servicio:
{ provide: OPCIONES_RESOLUTOR_REMOTO, useValue: { organizacionUrl: process.env.ORGANIZACION_URL } }
```

Si el resolutor se registra en otro módulo, basta con proveerlo bajo el token `RESOLUTOR_DE_ACCESO`: `AccesoGuard` lo busca en todo el contenedor.

## Errores y traza

`ExcepcionQ360(estado, codigo, { mensaje?, detalles?, motivo? })` produce `{codigo, mensaje, traceId, detalles[]}` con el catálogo cerrado de `comun.v1.yaml`. Atajos: `noAutenticado`, `sesionExpirada`, `accesoDenegado`, `errorValidacion`, `noEncontrado`, `demasiadasSolicitudes`, `servicioNoDisponible`, `capacidadNoDisponible`, `errorInterno`.

`motivo` es **solo para el log**: el motivo real de un 401 o un 403 se registra junto al `traceId` y jamás viaja en la respuesta. `middlewareTraza` acepta la traza del cliente solo si tiene forma segura (`[A-Za-z0-9._-]{8,128}`); si no, genera una nueva.

## Pruebas

```bash
npm test --workspace packages/auth-nest
```

38 pruebas con el runner de Node. No necesitan Supabase ni Docker: generan sus propias llaves RSA y EC, sirven un JWKS local y firman con un secreto HS256 propio. Cubren token válido (RS256, ES256 y HS256), expirado, firma inválida, `aud` e `iss` incorrectos, `alg: none`, confusión de algoritmo, `kid` desconocido, `sub` ausente o no UUID, llave de API, JWKS caído, usuario inactivo, rol no permitido, usuario sin registro y rol inyectado en `user_metadata`.
