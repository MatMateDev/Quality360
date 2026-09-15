# ADR 0005 · Prisma como ORM, con schema y migraciones por servicio

- **Estado:** aceptada
- **Fecha:** 2026-09-15
- **Decisión base:** D5

## Contexto

Cada servicio es dueño exclusivo de su esquema y de sus migraciones (informe p. 12). No puede haber claves foráneas ni consultas hacia otro esquema. El dominio no debe depender del ORM.

## Decisión

- Cada servicio tiene su propio `prisma/schema.prisma` y su carpeta `prisma/migrations`.
- El datasource apunta solo a su esquema (`?schema=organizacion`, etc.) y se conecta con el rol de ese servicio (`svc_organizacion`), nunca con `postgres` ni `service_role`.
- `DATABASE_URL` es distinta por servicio y cada contenedor recibe únicamente la suya.
- Las referencias a entidades de otro servicio se guardan como columnas `uuid` sin relación Prisma ni `FOREIGN KEY`. Por ejemplo, Certificaciones guarda `hdu_id`, pero no una relación hacia `organizacion.hdu`.
- Prisma vive en `src/infraestructura`. Los repositorios implementan interfaces del dominio y convierten modelos Prisma en entidades.
- Las migraciones se aplican con `prisma migrate deploy` al arrancar el entorno y en CI. `prisma migrate dev` se usa solo en desarrollo, con una base sombra que el rol del servicio pueda crear o una `shadowDatabaseUrl` explícita.
- Toda regla que dependa de concurrencia se respalda en la base. Ejemplos: el índice único parcial de supervisión vigente y el índice único sobre `lower(codigo)` de HDU.

## Consecuencias

- Tipos generados por servicio y migraciones revisables en cada PR.
- Cada servicio genera su propio cliente Prisma. Hay que ejecutar `prisma generate` por workspace en el build y en el Dockerfile.
- Los índices parciales y las restricciones que Prisma no expresa se escriben como SQL dentro de la migración.
- `q360-infra` debe otorgar a cada rol los permisos que `migrate deploy` necesita (`CREATE` en su esquema), y nada más.

## Alternativas descartadas

- **TypeORM:** migraciones generadas menos confiables y tipos más débiles.
- **Drizzle:** buena opción, pero con menos experiencia en el equipo y menor soporte para migraciones de varios esquemas en Nest.
- **SQL a mano con `pg` o Knex:** control total a costa de más código repetitivo y sin tipos generados.
