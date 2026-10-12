-- Quality360 · Organización · alinea el esquema con el modelo de datos (modelo ER y
-- lógico de Quality360, D23–D27). Conserva todos los datos existentes:
--   1. Rol pasa de enum a tabla; usuario.id_rol es llave foránea.
--   2. Tablas y columnas toman los nombres del modelo (id_usuario, email,
--      historia_usuario, id_supervisor, fecha_desde, ...).
--   3. Atributos nuevos: celula.descripcion/activo, sprint.estado/id_celula,
--      historia_usuario.descripcion.
--   4. El sprint de una HU pasa a historia_sprint (N:M con fechas).
-- Se aplica con el rol `svc_organizacion` sobre el esquema `organizacion`.

-- 1. Rol ----------------------------------------------------------------------
CREATE TABLE "rol" (
    "id_rol" UUID NOT NULL DEFAULT gen_random_uuid(),
    "nombre" VARCHAR(30) NOT NULL,
    "descripcion" VARCHAR(150),

    CONSTRAINT "rol_pkey" PRIMARY KEY ("id_rol")
);
CREATE UNIQUE INDEX "rol_nombre_key" ON "rol"("nombre");

INSERT INTO "rol" ("nombre", "descripcion") VALUES
    ('ADMINISTRADOR', 'Gestiona usuarios, roles y la supervisión entre QE y analistas'),
    ('QE', 'Quality Engineer: supervisa a su equipo y aprueba entregables'),
    ('ANALISTA_QA', 'Certifica las historias de usuario que tiene asignadas');

-- 2. Usuario ------------------------------------------------------------------
ALTER TABLE "usuario" ADD COLUMN "id_rol" UUID;
UPDATE "usuario" u SET "id_rol" = r."id_rol" FROM "rol" r WHERE r."nombre" = u."rol"::text;
ALTER TABLE "usuario" ALTER COLUMN "id_rol" SET NOT NULL;
ALTER TABLE "usuario" DROP COLUMN "rol";
DROP TYPE "Rol";

ALTER TABLE "usuario" RENAME COLUMN "id" TO "id_usuario";
ALTER TABLE "usuario" RENAME COLUMN "correo" TO "email";
ALTER TABLE "usuario" RENAME COLUMN "creado_en" TO "fecha_creacion";
ALTER INDEX "usuario_correo_key" RENAME TO "usuario_email_key";
ALTER TABLE "usuario"
    ALTER COLUMN "nombre" SET DATA TYPE VARCHAR(120),
    ALTER COLUMN "email" SET DATA TYPE VARCHAR(150);

CREATE INDEX "usuario_id_rol_idx" ON "usuario"("id_rol");
ALTER TABLE "usuario" ADD CONSTRAINT "usuario_id_rol_fkey"
    FOREIGN KEY ("id_rol") REFERENCES "rol"("id_rol") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 3. Supervision --------------------------------------------------------------
ALTER TABLE "supervision" RENAME COLUMN "id" TO "id_supervision";
ALTER TABLE "supervision" RENAME COLUMN "qe_id" TO "id_supervisor";
ALTER TABLE "supervision" RENAME COLUMN "analista_id" TO "id_supervisado";
ALTER TABLE "supervision" RENAME COLUMN "desde" TO "fecha_desde";
ALTER TABLE "supervision" RENAME COLUMN "hasta" TO "fecha_hasta";
ALTER INDEX "supervision_qe_id_idx" RENAME TO "supervision_id_supervisor_idx";
ALTER INDEX "supervision_analista_id_idx" RENAME TO "supervision_id_supervisado_idx";
ALTER INDEX "supervision_analista_id_hasta_idx" RENAME TO "supervision_id_supervisado_fecha_hasta_idx";
ALTER INDEX "supervision_analista_id_vigente_key" RENAME TO "supervision_id_supervisado_vigente_key";
ALTER TABLE "supervision" RENAME CONSTRAINT "supervision_qe_id_fkey" TO "supervision_id_supervisor_fkey";
ALTER TABLE "supervision" RENAME CONSTRAINT "supervision_analista_id_fkey" TO "supervision_id_supervisado_fkey";
ALTER TABLE "supervision" ADD CONSTRAINT "supervision_fechas_check"
    CHECK ("fecha_hasta" IS NULL OR "fecha_hasta" >= "fecha_desde");

-- 4. Celula -------------------------------------------------------------------
ALTER TABLE "celula" RENAME COLUMN "id" TO "id_celula";
ALTER TABLE "celula" ALTER COLUMN "nombre" SET DATA TYPE VARCHAR(100);
ALTER TABLE "celula"
    ADD COLUMN "descripcion" VARCHAR(250),
    ADD COLUMN "activo" BOOLEAN NOT NULL DEFAULT true;

-- 5. Sprint (antes de renombrar hdu, que se usa para asignar la célula) -------
CREATE TYPE "EstadoSprint" AS ENUM ('PLANIFICADO', 'EN_CURSO', 'CERRADO');

ALTER TABLE "sprint" RENAME COLUMN "id" TO "id_sprint";
ALTER TABLE "sprint" RENAME COLUMN "inicio" TO "fecha_inicio";
ALTER TABLE "sprint" RENAME COLUMN "fin" TO "fecha_fin";
ALTER TABLE "sprint" ALTER COLUMN "nombre" SET DATA TYPE VARCHAR(100);
ALTER TABLE "sprint"
    ADD COLUMN "estado" "EstadoSprint" NOT NULL DEFAULT 'PLANIFICADO',
    ADD COLUMN "id_celula" UUID;

UPDATE "sprint" SET "estado" = (CASE
    WHEN "fecha_fin" < CURRENT_DATE THEN 'CERRADO'
    WHEN "fecha_inicio" > CURRENT_DATE THEN 'PLANIFICADO'
    ELSE 'EN_CURSO'
END)::"EstadoSprint";

-- Cada sprint queda en la célula que más lo usa; si ninguna HU lo usa, en la
-- primera célula por nombre.
UPDATE "sprint" s SET "id_celula" = (
    SELECT h."celula_id" FROM "hdu" h
    WHERE h."sprint_id" = s."id_sprint"
    GROUP BY h."celula_id"
    ORDER BY count(*) DESC, h."celula_id"
    LIMIT 1
);
UPDATE "sprint" SET "id_celula" = (SELECT "id_celula" FROM "celula" ORDER BY "nombre" LIMIT 1)
WHERE "id_celula" IS NULL;
ALTER TABLE "sprint" ALTER COLUMN "id_celula" SET NOT NULL;
ALTER TABLE "sprint" ADD CONSTRAINT "sprint_fechas_check" CHECK ("fecha_fin" >= "fecha_inicio");

CREATE INDEX "sprint_id_celula_idx" ON "sprint"("id_celula");
ALTER TABLE "sprint" ADD CONSTRAINT "sprint_id_celula_fkey"
    FOREIGN KEY ("id_celula") REFERENCES "celula"("id_celula") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 6. HistoriaUsuario (antes hdu) ----------------------------------------------
ALTER TABLE "hdu" RENAME TO "historia_usuario";
ALTER TABLE "historia_usuario" RENAME COLUMN "id" TO "id_historia";
ALTER TABLE "historia_usuario" RENAME COLUMN "celula_id" TO "id_celula";
ALTER TABLE "historia_usuario" RENAME COLUMN "creado_en" TO "fecha_creacion";
ALTER TABLE "historia_usuario"
    ALTER COLUMN "codigo" SET DATA TYPE VARCHAR(50),
    ALTER COLUMN "titulo" SET DATA TYPE VARCHAR(200);
ALTER TABLE "historia_usuario" ADD COLUMN "descripcion" VARCHAR(1000);

ALTER TABLE "historia_usuario" RENAME CONSTRAINT "hdu_pkey" TO "historia_usuario_pkey";
ALTER INDEX "hdu_codigo_normalizado_key" RENAME TO "historia_usuario_codigo_normalizado_key";
ALTER INDEX "hdu_celula_id_idx" RENAME TO "historia_usuario_id_celula_idx";
ALTER INDEX "hdu_qe_responsable_id_idx" RENAME TO "historia_usuario_qe_responsable_id_idx";
ALTER INDEX "hdu_analista_id_idx" RENAME TO "historia_usuario_analista_id_idx";
ALTER INDEX "hdu_estado_idx" RENAME TO "historia_usuario_estado_idx";
ALTER TABLE "historia_usuario" RENAME CONSTRAINT "hdu_celula_id_fkey" TO "historia_usuario_id_celula_fkey";
ALTER TABLE "historia_usuario" RENAME CONSTRAINT "hdu_qe_responsable_id_fkey" TO "historia_usuario_qe_responsable_id_fkey";
ALTER TABLE "historia_usuario" RENAME CONSTRAINT "hdu_analista_id_fkey" TO "historia_usuario_analista_id_fkey";

-- 7. HistoriaSprint -----------------------------------------------------------
CREATE TABLE "historia_sprint" (
    "id_historia_sprint" UUID NOT NULL,
    "fecha_asignacion" DATE NOT NULL DEFAULT CURRENT_DATE,
    "fecha_retiro" DATE,
    "id_historia" UUID NOT NULL,
    "id_sprint" UUID,

    CONSTRAINT "historia_sprint_pkey" PRIMARY KEY ("id_historia_sprint"),
    CONSTRAINT "historia_sprint_fechas_check" CHECK ("fecha_retiro" IS NULL OR "fecha_retiro" >= "fecha_asignacion")
);
CREATE INDEX "historia_sprint_id_historia_idx" ON "historia_sprint"("id_historia");
CREATE INDEX "historia_sprint_id_sprint_idx" ON "historia_sprint"("id_sprint");
-- Índice único PARCIAL (Prisma no lo expresa en el DSL): un solo sprint vigente por HU.
CREATE UNIQUE INDEX "historia_sprint_id_historia_vigente_key" ON "historia_sprint"("id_historia") WHERE "fecha_retiro" IS NULL;
ALTER TABLE "historia_sprint" ADD CONSTRAINT "historia_sprint_id_historia_fkey"
    FOREIGN KEY ("id_historia") REFERENCES "historia_usuario"("id_historia") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "historia_sprint" ADD CONSTRAINT "historia_sprint_id_sprint_fkey"
    FOREIGN KEY ("id_sprint") REFERENCES "sprint"("id_sprint") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "historia_sprint" ("id_historia_sprint", "fecha_asignacion", "id_historia", "id_sprint")
SELECT gen_random_uuid(), "fecha_creacion"::date, "id_historia", "sprint_id" FROM "historia_usuario";

ALTER TABLE "historia_usuario" DROP CONSTRAINT "hdu_sprint_id_fkey";
DROP INDEX "hdu_sprint_id_idx";
ALTER TABLE "historia_usuario" DROP COLUMN "sprint_id";
