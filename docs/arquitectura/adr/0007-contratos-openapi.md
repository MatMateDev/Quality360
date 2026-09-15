# ADR 0007 · Contratos OpenAPI 3.1 en `contracts/`

- **Estado:** aceptada
- **Fecha:** 2026-09-15
- **Decisión base:** D7

## Contexto

El portal, el gateway y los servicios se construyen en paralelo (Olas 1a y 1b) sin coordinación directa. Los contratos deben bastar para que cada parte trabaje sola y para que `q360-qa` valide las respuestas.

## Decisión

- **Archivos:** `gateway.v1.yaml` (portal → gateway), `organizacion.v1.yaml` (gateway y servicios → Organización), `certificaciones.v1.yaml` y `comun.v1.yaml` (esquemas, respuestas y parámetros compartidos, referenciados con `$ref`).
- **Extensiones:**
  - `x-roles` en cada operación: `ADMINISTRADOR`, `QE`, `ANALISTA_QA`, `SERVICIO` (credencial de servicio) o `PUBLICO` (salud).
  - `x-hdu` con los escenarios que cubre, por ejemplo `E2-B02#3`. Queda vacío solo en operaciones técnicas.
  - `x-hdu-transversal` para los escenarios que aplican a toda operación protegida.
  - `x-escenarios-sin-operacion` para los escenarios solo de interfaz o del proveedor, con su motivo.
  - `x-codigos` en cada respuesta de error y `x-transiciones` en `EstadoHdu`.
- **Errores:** esquema único `{codigo, mensaje, traceId, detalles[]}` con catálogo cerrado `CodigoError`. La tabla de estados HTTP está en `comun.v1.yaml`.
- **Composición:** `{fuente, estado: ok | indisponible, datos?}`, modelado como unión discriminada por `estado`.
- **Validación:**
  - `npm run contracts:lint`: Redocly `recommended` más dos reglas que exigen `x-roles` y `x-hdu` en cada operación.
  - `npm run contracts:check`: los 96 escenarios de E1 y E2 aparecen en los contratos.
  - `npm run contracts:bundle`: genera un archivo por contrato, sin `$ref` externos, en `contracts/dist/`.
- **Versionado:** un cambio incompatible crea `*.v2.yaml`. Este ADR y los agentes afectados se actualizan en el mismo PR.

## Ajustes respecto del listado base de rutas

1. **`GET /v1/auditoria`** (Administrador), para verificar por API los escenarios E1-B12 y E2-B04#1-2.
2. **Parámetros de ámbito:**
   - `analistaId` en `GET /v1/inicio/qa`, para E1-B05#3 y el acceso administrativo.
   - `qeId` en `GET /v1/qe/analistas`, para E1-B04#2-3.
3. **Rutas de Organización que no están en el gateway:**
   - `/v1/resumenes/{qe,qa,admin}/*`: una fuente por bloque, para que falle un bloque sin arrastrar al resto.
   - `/v1/interno/acceso` y `/v1/interno/hdu/{id}/acceso`: `ResolutorDeAcceso` remoto.
   - `/v1/interno/carga/{usuarios,celulas,sprints,hdu}`: semilla idempotente.
4. **`GET /health`** sin autenticación en cada contrato.

## Decisiones tomadas fuera de D1–D12

- **Credencial de servicio:**
  - Integraciones llama a Organización con la cabecera `X-Q360-Servicio-Token` (secreto por servicio en `.env`). El gateway la descarta si llega desde afuera.
  - `/v1/interno/carga/*` exige además `PERMITIR_CARGA_SEMILLA=true`. `contrasenaInicial` solo existe ahí.
- **Alta de usuarios por el Administrador:** con invitación de Supabase Auth (`inviteUserByEmail`), sin contraseña en la API. En local llega a Mailpit.
- **Operaciones sin cambio real** (mismo rol, mismo QE, mismo analista): 200 con `cambio: false`, sin historial ni auditoría.
- **Unicidad:** correo en minúsculas y código de HDU sin distinguir mayúsculas.
- **Composición en el gateway:**
  - Un 400, 401, 403 o 404 de una fuente se devuelve completo; otro fallo deja el bloque `indisponible`.
  - Cada fuente tiene su URL configurable, para simular la caída de HDU aunque viva en Organización (E1-B03#3, E1-F06#3).
- **Desactivación:** desactivar a un QE con analistas vigentes responde 409 `RELACIONES_INCOMPATIBLES`, igual que el cambio de rol.

## Consecuencias

- Cada agente genera tipos o DTO desde su contrato. Si una herramienta no resuelve `$ref` externos, usa `contracts:bundle`.
- Organización repite las operaciones del gateway sin 429 ni 503 `SERVICIO_NO_DISPONIBLE`, así que un cambio en una operación compartida se edita en ambos archivos.

## Alternativas descartadas

- **Generar OpenAPI desde el código de Nest:** el contrato llegaría después de la implementación, e impide el trabajo en paralelo.
- **Un solo contrato para todo:** mezcla lo público con lo interno y expondría rutas de carga en el portal.
