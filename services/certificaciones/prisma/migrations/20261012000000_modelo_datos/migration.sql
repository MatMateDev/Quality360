-- Quality360 · Certificaciones · alinea el esquema con el modelo de datos (modelo
-- ER y lógico de Quality360, D23–D27). Conserva los datos de E3:
--   1. Tablas nuevas del modelo: certificacion, asignacion_certificacion,
--      item_checklist, evidencia, ejecucion_prueba y defecto.
--   2. Cada HU con entregables pasa a tener su certificación (ciclo 1) con los
--      10 ítems del checklist y sus 10 entregables.
--   3. La evidencia sale de las columnas de entregable a la tabla evidencia.
--   4. entregable.hdu_id se reemplaza por id_certificacion (llave foránea).
-- Se aplica con el rol `svc_certificaciones` sobre el esquema `certificaciones`.

-- 1. Tablas nuevas --------------------------------------------------------------
CREATE TYPE "EstadoCertificacion" AS ENUM ('EN_CURSO', 'COMPLETADA');

CREATE TABLE "certificacion" (
    "id_certificacion" UUID NOT NULL,
    "numero_ciclo" INTEGER NOT NULL,
    "estado" "EstadoCertificacion" NOT NULL DEFAULT 'EN_CURSO',
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "fecha_inicio" DATE NOT NULL DEFAULT CURRENT_DATE,
    "fecha_fin" DATE,
    "observacion" VARCHAR(500),
    "id_historia" UUID NOT NULL,

    CONSTRAINT "certificacion_pkey" PRIMARY KEY ("id_certificacion"),
    CONSTRAINT "certificacion_numero_ciclo_check" CHECK ("numero_ciclo" > 0),
    CONSTRAINT "certificacion_fechas_check" CHECK ("fecha_fin" IS NULL OR "fecha_fin" >= "fecha_inicio")
);
CREATE UNIQUE INDEX "certificacion_id_historia_numero_ciclo_key" ON "certificacion"("id_historia", "numero_ciclo");
-- Índice único PARCIAL (Prisma no lo expresa en el DSL): un solo ciclo activo por HU.
CREATE UNIQUE INDEX "certificacion_id_historia_activa_key" ON "certificacion"("id_historia") WHERE "activo";

CREATE TABLE "asignacion_certificacion" (
    "id_asignacion" UUID NOT NULL,
    "fecha_desde" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fecha_hasta" TIMESTAMPTZ(6),
    "id_certificacion" UUID NOT NULL,
    "id_usuario" UUID NOT NULL,

    CONSTRAINT "asignacion_certificacion_pkey" PRIMARY KEY ("id_asignacion"),
    CONSTRAINT "asignacion_certificacion_fechas_check" CHECK ("fecha_hasta" IS NULL OR "fecha_hasta" >= "fecha_desde")
);
CREATE INDEX "asignacion_certificacion_id_certificacion_idx" ON "asignacion_certificacion"("id_certificacion");
CREATE INDEX "asignacion_certificacion_id_usuario_idx" ON "asignacion_certificacion"("id_usuario");
-- Índice único PARCIAL: un solo analista vigente por ciclo.
CREATE UNIQUE INDEX "asignacion_certificacion_vigente_key" ON "asignacion_certificacion"("id_certificacion") WHERE "fecha_hasta" IS NULL;

CREATE TABLE "item_checklist" (
    "id_item_checklist" UUID NOT NULL,
    "nombre" VARCHAR(150) NOT NULL,
    "descripcion" VARCHAR(150),
    "obligatorio" BOOLEAN NOT NULL DEFAULT true,
    "orden" INTEGER NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "id_certificacion" UUID NOT NULL,
    "clave" "ClaveEntregable" NOT NULL,

    CONSTRAINT "item_checklist_pkey" PRIMARY KEY ("id_item_checklist"),
    CONSTRAINT "item_checklist_orden_check" CHECK ("orden" > 0)
);
CREATE UNIQUE INDEX "item_checklist_id_certificacion_orden_key" ON "item_checklist"("id_certificacion", "orden");
CREATE UNIQUE INDEX "item_checklist_id_certificacion_clave_key" ON "item_checklist"("id_certificacion", "clave");

CREATE TABLE "evidencia" (
    "id_evidencia" UUID NOT NULL,
    "nombre" VARCHAR(150) NOT NULL,
    "descripcion" VARCHAR(500),
    "tipo" "TipoEvidencia" NOT NULL,
    "referencia" VARCHAR(500) NOT NULL,
    "fecha_carga" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "id_entregable" UUID NOT NULL,
    "tipo_contenido" TEXT,
    "tamano_bytes" INTEGER,
    "folio" TEXT,

    CONSTRAINT "evidencia_pkey" PRIMARY KEY ("id_evidencia")
);
CREATE INDEX "evidencia_id_entregable_fecha_carga_idx" ON "evidencia"("id_entregable", "fecha_carga");

CREATE TABLE "ejecucion_prueba" (
    "id_ejecucion" UUID NOT NULL,
    "nombre_prueba" VARCHAR(200) NOT NULL,
    "resultado" VARCHAR(30) NOT NULL,
    "fecha_ejecucion" TIMESTAMPTZ(6) NOT NULL,
    "ambiente" VARCHAR(50),
    "observacion" VARCHAR(500),
    "id_certificacion" UUID NOT NULL,

    CONSTRAINT "ejecucion_prueba_pkey" PRIMARY KEY ("id_ejecucion")
);
CREATE INDEX "ejecucion_prueba_id_certificacion_idx" ON "ejecucion_prueba"("id_certificacion");

CREATE TABLE "defecto" (
    "id_defecto" UUID NOT NULL,
    "codigo" VARCHAR(50),
    "titulo" VARCHAR(200) NOT NULL,
    "descripcion" VARCHAR(1000),
    "severidad" VARCHAR(20) NOT NULL,
    "estado" VARCHAR(30) NOT NULL,
    "fecha_reporte" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fecha_cierre" TIMESTAMPTZ(6),
    "id_certificacion" UUID NOT NULL,

    CONSTRAINT "defecto_pkey" PRIMARY KEY ("id_defecto"),
    CONSTRAINT "defecto_fechas_check" CHECK ("fecha_cierre" IS NULL OR "fecha_cierre" >= "fecha_reporte")
);
CREATE INDEX "defecto_id_certificacion_idx" ON "defecto"("id_certificacion");

-- 2. Certificación (ciclo 1) e ítems para cada HU que ya tiene entregables -------
INSERT INTO "certificacion" ("id_certificacion", "numero_ciclo", "fecha_inicio", "id_historia")
SELECT gen_random_uuid(), 1, MIN("desde")::date, "hdu_id"
FROM (
    SELECT "hdu_id", COALESCE("completado_en", "actualizado_en") AS "desde" FROM "entregable"
    UNION ALL
    SELECT "hdu_id", "emitido_en" FROM "certificado"
) AS "trabajo"
GROUP BY "hdu_id";

INSERT INTO "item_checklist" ("id_item_checklist", "nombre", "orden", "id_certificacion", "clave")
SELECT gen_random_uuid(), n."nombre", n."orden", c."id_certificacion", n."clave"::"ClaveEntregable"
FROM "certificacion" c
CROSS JOIN (VALUES
    ('PLAN_PRUEBAS', 'Plan de pruebas', 1),
    ('DASHBOARD', 'Dashboard', 2),
    ('CASOS_PRUEBA', 'Casos de prueba', 3),
    ('APROBACION_CASOS', 'Aprobación de casos de prueba', 4),
    ('EJECUCION', 'Ejecución', 5),
    ('EVIDENCIAS', 'Evidencias', 6),
    ('DEFECTOS', 'Defectos gestionados', 7),
    ('APROBACION_UAT', 'Aprobación UAT', 8),
    ('CERTIFICADO', 'Certificado', 9),
    ('CIERRE_PRUEBAS', 'Cierre de pruebas', 10)
) AS n("clave", "nombre", "orden");

-- 3. Entregable: columnas del modelo y enlace con su certificación --------------
ALTER TABLE "entregable" RENAME COLUMN "id" TO "id_entregable";
ALTER TABLE "entregable" RENAME COLUMN "aprobado_en" TO "fecha_validacion";
ALTER TABLE "entregable"
    ADD COLUMN "nombre" VARCHAR(150),
    ADD COLUMN "descripcion" VARCHAR(500),
    ADD COLUMN "fecha_creacion" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ADD COLUMN "id_certificacion" UUID,
    ADD COLUMN "id_item_checklist" UUID;

UPDATE "entregable" e
SET "id_certificacion" = c."id_certificacion",
    "id_item_checklist" = i."id_item_checklist",
    "nombre" = i."nombre",
    "fecha_creacion" = COALESCE(e."completado_en", e."actualizado_en")
FROM "certificacion" c
JOIN "item_checklist" i ON i."id_certificacion" = c."id_certificacion"
WHERE c."id_historia" = e."hdu_id" AND i."clave" = e."clave";

-- Evidencias existentes → tabla evidencia (fecha_carga = cuando se marcó).
INSERT INTO "evidencia" ("id_evidencia", "nombre", "tipo", "referencia", "fecha_carga", "id_entregable", "tipo_contenido", "tamano_bytes", "folio")
SELECT gen_random_uuid(),
       LEFT(COALESCE("evidencia_nombre", "evidencia_url", 'evidencia'), 150),
       "evidencia_tipo",
       LEFT(COALESCE("evidencia_url", "evidencia_ruta", ''), 500),
       COALESCE("completado_en", "actualizado_en"),
       "id_entregable",
       "evidencia_tipo_contenido",
       "evidencia_tamano_bytes",
       "evidencia_folio"
FROM "entregable"
WHERE "evidencia_tipo" IS NOT NULL;

-- Entregables que aún no existían quedan PENDIENTE: los 10 por certificación.
INSERT INTO "entregable" ("id_entregable", "hdu_id", "clave", "nombre", "id_certificacion", "id_item_checklist")
SELECT gen_random_uuid(), c."id_historia", i."clave", i."nombre", c."id_certificacion", i."id_item_checklist"
FROM "certificacion" c
JOIN "item_checklist" i ON i."id_certificacion" = c."id_certificacion"
WHERE NOT EXISTS (
    SELECT 1 FROM "entregable" e WHERE e."id_certificacion" = c."id_certificacion" AND e."clave" = i."clave"
);

DROP INDEX "entregable_hdu_id_clave_key";
ALTER TABLE "entregable"
    DROP COLUMN "hdu_id",
    DROP COLUMN "evidencia_tipo",
    DROP COLUMN "evidencia_url",
    DROP COLUMN "evidencia_ruta",
    DROP COLUMN "evidencia_nombre",
    DROP COLUMN "evidencia_tipo_contenido",
    DROP COLUMN "evidencia_tamano_bytes",
    DROP COLUMN "evidencia_folio";
ALTER TABLE "entregable"
    ALTER COLUMN "nombre" SET NOT NULL,
    ALTER COLUMN "id_certificacion" SET NOT NULL,
    ALTER COLUMN "id_item_checklist" SET NOT NULL;
CREATE UNIQUE INDEX "entregable_id_certificacion_clave_key" ON "entregable"("id_certificacion", "clave");
CREATE INDEX "entregable_id_item_checklist_idx" ON "entregable"("id_item_checklist");

-- Ciclos con los 10 entregables aprobados quedan COMPLETADA.
UPDATE "certificacion" c
SET "estado" = 'COMPLETADA',
    "fecha_fin" = GREATEST(c."fecha_inicio", (SELECT MAX(e."fecha_validacion")::date FROM "entregable" e WHERE e."id_certificacion" = c."id_certificacion"))
WHERE (SELECT count(*) FROM "entregable" e WHERE e."id_certificacion" = c."id_certificacion" AND e."estado" = 'APROBADO') = 10;

-- 4. Certificado: pertenece a su certificación ---------------------------------
ALTER TABLE "certificado" ADD COLUMN "id_certificacion" UUID;
UPDATE "certificado" ce SET "id_certificacion" = c."id_certificacion"
FROM "certificacion" c WHERE c."id_historia" = ce."hdu_id";
ALTER TABLE "certificado" ALTER COLUMN "id_certificacion" SET NOT NULL;
CREATE UNIQUE INDEX "certificado_id_certificacion_key" ON "certificado"("id_certificacion");

-- 5. Llaves foráneas dentro del esquema ----------------------------------------
ALTER TABLE "asignacion_certificacion" ADD CONSTRAINT "asignacion_certificacion_id_certificacion_fkey"
    FOREIGN KEY ("id_certificacion") REFERENCES "certificacion"("id_certificacion") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "item_checklist" ADD CONSTRAINT "item_checklist_id_certificacion_fkey"
    FOREIGN KEY ("id_certificacion") REFERENCES "certificacion"("id_certificacion") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "entregable" ADD CONSTRAINT "entregable_id_certificacion_fkey"
    FOREIGN KEY ("id_certificacion") REFERENCES "certificacion"("id_certificacion") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "entregable" ADD CONSTRAINT "entregable_id_item_checklist_fkey"
    FOREIGN KEY ("id_item_checklist") REFERENCES "item_checklist"("id_item_checklist") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "evidencia" ADD CONSTRAINT "evidencia_id_entregable_fkey"
    FOREIGN KEY ("id_entregable") REFERENCES "entregable"("id_entregable") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ejecucion_prueba" ADD CONSTRAINT "ejecucion_prueba_id_certificacion_fkey"
    FOREIGN KEY ("id_certificacion") REFERENCES "certificacion"("id_certificacion") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "defecto" ADD CONSTRAINT "defecto_id_certificacion_fkey"
    FOREIGN KEY ("id_certificacion") REFERENCES "certificacion"("id_certificacion") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "certificado" ADD CONSTRAINT "certificado_id_certificacion_fkey"
    FOREIGN KEY ("id_certificacion") REFERENCES "certificacion"("id_certificacion") ON DELETE RESTRICT ON UPDATE CASCADE;
