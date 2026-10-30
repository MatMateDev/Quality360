# services/impedimentos · Impedimentos y riesgos (NestJS + Prisma)

Dueño: q360-backend. Puerto 3003. Corrida E4 (D57–D92).

- Capas: `api` → `aplicacion` → `dominio`, con `infraestructura` detrás de puertos. El dominio no importa Nest ni Prisma.
- Contrato: `contracts/impedimentos.v1.yaml`.
- Migración: `prisma/migrations/20261026000000_e4_impedimentos_riesgo`.
- Pruebas: `npm test -w services/impedimentos` (Postgres local; Organización y Certificaciones simuladas).
- Vercel: `vercel.json`, `api/index.mjs` y `public/`, igual que Certificaciones.
