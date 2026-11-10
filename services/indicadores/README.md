# services/indicadores · Indicadores y dashboards (NestJS + Prisma)

Dueño: q360-backend. Puerto 3005. Corrida E6 (D153–D195, ADR 0017). `vercel.json` es de q360-infra.

- Capas: `api` → `aplicacion` → `dominio`, con `infraestructura` detrás de puertos. El dominio (clasificación, cumplimiento,
  semáforo, sobrecarga, series) es puro: no importa Nest, Prisma ni `fetch`.
- Contrato: `contracts/indicadores.v1.yaml`.
- Este servicio **no** lee otros esquemas ni guarda datos vivos: calcula al consultar con las API internas de Organización
  (ámbito, D176), Certificaciones (avance) e Impedimentos (bloqueo y riesgo). Solo guarda lo propio: snapshots, ejecuciones,
  umbral por QE y su historial. El rol sale de Organización, nunca del token.
- Pruebas: `npm test -w services/indicadores` (Postgres local; las tres fuentes simuladas con servidores HTTP falsos).

## Variables de entorno

Ninguna impide el arranque (lo que falta deja inhabilitada su capacidad). Las de ejemplo están en `.env.example`.

| Variable | Defecto | Nota |
| --- | --- | --- |
| `DATABASE_URL` | — | Rol `svc_indicadores`, con `?schema=indicadores`. Sin ella, `/health` responde y las consultas a la base dan 503 |
| `SUPABASE_URL`, `SUPABASE_JWT_SECRET` | — | Verificación de la sesión (D4) |
| `ORGANIZACION_URL` | `http://localhost:3001` | En producción, si falta o es inválida, todo `/v1/*` responde 503 y `/health` 200 |
| `CERTIFICACIONES_URL`, `IMPEDIMENTOS_URL` | `http://localhost:3002`, `:3003` | En producción, ausentes: los bloques que dependen de ellas van `indisponible` |
| `INDICADORES_FUENTE_TIMEOUT_MS` | 2000 | Por llamada a una fuente |
| `INDICADORES_SNAPSHOT_TIMEOUT_MS` | 8000 | Por llamada en el snapshot, con 1 reintento (D178) |
| `CRON_SECRET` | — | Sin valor, `GET /v1/cron/indicadores/snapshot` responde siempre 401 |
| `INDICADORES_SERVICIO_TOKEN` | — | Credencial hacia las tres rutas de lectura global (D177). Sin valor, el snapshot queda `FALLIDA` |
| `INDICADORES_UMBRAL_DEFECTO` / `_MIN` / `_MAX` | 5 / 1 / 50 | D159, D172 |
| `INDICADORES_TOPE_HDU` | 1000 | Tope por corrida del snapshot (D164) |
| `EXPORTACION_LIMITE_FILAS`, `EXPORTACION_PDF_LIMITE_FILAS` | 50000, 200 | D168 |
| `Q360_FECHA_REFERENCIA` | — | Fija «ahora» en pruebas. Se **ignora** con `NODE_ENV=production` (D172) |
| `X_Q360_SERVICIO_TOKEN`, `PERMITIR_CARGA_SEMILLA` | —, `false` | Gancho de prueba `POST /v1/interno/carga/snapshots` (D184) |
