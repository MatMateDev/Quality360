-- Quality360 · Organización · Corrida E7 (bandejas por rol), D28–D30, D45, D52 y D54.
--
--   1. Catálogo de roles: LIDER_QA y AUDITOR (los 3 códigos actuales no cambian).
--   2. Enums de auditoría: ASIGNAR_CELULAS_LIDER, EXPORTAR, REASIGNAR_QE_RESPONSABLE y la
--      entidad EXPORTACION. Postgres no deja usar un valor nuevo de un enum en la misma
--      transacción en que se agrega, así que esta migración no inserta filas con ellos.
--   3. Tabla celula_lider (vigencia por índice único parcial, sin llaves foráneas fuera de
--      `organizacion`) y tabla hdu_historial_responsable (reasignación del QE responsable).
--   4. Índices de lectura global de la auditoría (filtros del Auditor).
--
-- Se aplica con el rol `svc_organizacion` sobre el esquema `organizacion`.

-- 1. Roles ---------------------------------------------------------------------
INSERT INTO "rol" ("nombre", "descripcion") VALUES
    ('LIDER_QA', 'Líder QA: lee las HDU de las células que tiene a cargo (solo lectura)'),
    ('AUDITOR', 'Auditor: lee todo el sistema y exporta CSV (solo lectura)')
ON CONFLICT ("nombre") DO NOTHING;

-- 2. Enums ---------------------------------------------------------------------
ALTER TYPE "AccionAuditoria" ADD VALUE IF NOT EXISTS 'ASIGNAR_CELULAS_LIDER';
ALTER TYPE "AccionAuditoria" ADD VALUE IF NOT EXISTS 'EXPORTAR';
ALTER TYPE "AccionAuditoria" ADD VALUE IF NOT EXISTS 'REASIGNAR_QE_RESPONSABLE';
ALTER TYPE "EntidadAuditoria" ADD VALUE IF NOT EXISTS 'EXPORTACION';

-- 3. celula_lider ----------------------------------------------------------------
CREATE TABLE "celula_lider" (
    "id_celula_lider" UUID NOT NULL DEFAULT gen_random_uuid(),
    "id_usuario" UUID NOT NULL,
    "id_celula" UUID NOT NULL,
    "fecha_desde" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    "fecha_hasta" TIMESTAMPTZ(6),
    "asignado_por_tipo" "TipoActor" NOT NULL,
    "asignado_por_id" TEXT NOT NULL,
    "asignado_por_nombre" TEXT NOT NULL,
    "retirado_por_tipo" "TipoActor",
    "retirado_por_id" TEXT,
    "retirado_por_nombre" TEXT,

    CONSTRAINT "celula_lider_pkey" PRIMARY KEY ("id_celula_lider"),
    CONSTRAINT "celula_lider_fechas_ck" CHECK ("fecha_hasta" IS NULL OR "fecha_hasta" >= "fecha_desde"),
    CONSTRAINT "celula_lider_retiro_ck" CHECK (("fecha_hasta" IS NULL) = ("retirado_por_id" IS NULL))
);

ALTER TABLE "celula_lider" ADD CONSTRAINT "celula_lider_id_usuario_fkey"
    FOREIGN KEY ("id_usuario") REFERENCES "usuario"("id_usuario") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "celula_lider" ADD CONSTRAINT "celula_lider_id_celula_fkey"
    FOREIGN KEY ("id_celula") REFERENCES "celula"("id_celula") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Una asignación vigente por líder y célula (Prisma no expresa índices parciales).
CREATE UNIQUE INDEX "celula_lider_vigente_key" ON "celula_lider"("id_usuario", "id_celula") WHERE "fecha_hasta" IS NULL;
-- Células sin líder vigente.
CREATE INDEX "celula_lider_celula_vigente_idx" ON "celula_lider"("id_celula") WHERE "fecha_hasta" IS NULL;
CREATE INDEX "celula_lider_usuario_historial_idx" ON "celula_lider"("id_usuario", "fecha_desde" DESC);

-- hdu_historial_responsable (D54) -------------------------------------------------
CREATE TABLE "hdu_historial_responsable" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "hdu_id" UUID NOT NULL,
    "qe_anterior_id" UUID NOT NULL,
    "qe_nuevo_id" UUID NOT NULL,
    "motivo" TEXT NOT NULL,
    "actor_tipo" "TipoActor" NOT NULL,
    "actor_id" TEXT NOT NULL,
    "actor_nombre" TEXT NOT NULL,
    "fecha" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),

    CONSTRAINT "hdu_historial_responsable_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "hdu_historial_responsable_hdu_id_idx" ON "hdu_historial_responsable"("hdu_id");
ALTER TABLE "hdu_historial_responsable" ADD CONSTRAINT "hdu_historial_responsable_hdu_id_fkey"
    FOREIGN KEY ("hdu_id") REFERENCES "historia_usuario"("id_historia") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 4. Auditoría ---------------------------------------------------------------------
CREATE INDEX "auditoria_actor_fecha_idx" ON "auditoria"("actor_id", "fecha");
CREATE INDEX "auditoria_accion_fecha_idx" ON "auditoria"("accion", "fecha");
