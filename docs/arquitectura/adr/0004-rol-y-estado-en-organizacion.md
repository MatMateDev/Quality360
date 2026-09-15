# ADR 0004 · El rol y el estado activo viven en Organización, no en el token

- **Estado:** aceptada
- **Fecha:** 2026-09-15
- **Decisión base:** D4

## Contexto

Supabase permite guardar datos en `user_metadata`, que el propio usuario puede editar desde el cliente. Los escenarios exigen que un usuario desactivado pierda acceso aunque su token siga vigente (E1-B07#3), y que un cambio de rol se refleje en la siguiente consulta del perfil (E1-F11#3).

## Decisión

- Supabase Auth solo **autentica**. Cada servicio **autoriza**: lee el rol vigente, el estado activo y el ámbito desde Organización en **cada** solicitud.
- **Organización** los lee de su propia base.
- **Certificaciones e Impedimentos** llaman a `GET /v1/interno/acceso` y `GET /v1/interno/hdu/{id}/acceso` de Organización con el token propagado, sin caché.
- **`packages/auth-nest`** define la interfaz `ResolutorDeAcceso`, que cada servicio implementa (local en Organización, remota en los demás). El guard deniega a quien tenga `activo: false`.
- El gateway verifica firma, `exp`, `iss` y `aud` contra JWKS, pero no toma decisiones de rol.
- **Nunca** se leen roles desde `user_metadata`, `app_metadata` ni claims personalizados.
- Un usuario autenticado en Supabase pero sin registro en Organización, o inactivo, recibe 403 `ACCESO_DENEGADO` genérico. El portal lo trata igual que un login fallido.

## Consecuencias

- La desactivación y el cambio de rol surten efecto en la solicitud siguiente, sin esperar a que venza el token.
- Cada solicitud a Certificaciones o Impedimentos cuesta una llamada extra a Organización. Es aceptable en el volumen del MVP; si hiciera falta, un caché de pocos segundos debe decidirse en un ADR nuevo.
- Si Organización cae, los demás servicios no pueden autorizar y responden error: nunca conceden acceso por defecto.
- El access token sigue siendo válido para el gateway hasta su `exp` después de `signOut`. Se recomienda un TTL corto en Supabase (E1-B11#3).

## Alternativas descartadas

- **Rol en `user_metadata`:** editable por el usuario, así que es una escalada de privilegios.
- **Rol en `app_metadata` o con un custom access token hook:** no es editable, pero queda obsoleto hasta que vence o se renueva el token, y no refleja la desactivación de inmediato.
- **Autorizar solo en el gateway:** rompe la regla «autenticar no es autorizar» y deja los servicios expuestos ante llamadas internas.
