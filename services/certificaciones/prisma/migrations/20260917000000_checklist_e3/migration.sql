-- Quality360 · Certificaciones · checklist de entregables, bitácora y certificado (E3, D15–D22).
-- Se aplica con el rol `svc_certificaciones` sobre el esquema `certificaciones`.

-- CreateEnum
CREATE TYPE "ClaveEntregable" AS ENUM ('PLAN_PRUEBAS', 'DASHBOARD', 'CASOS_PRUEBA', 'APROBACION_CASOS', 'EJECUCION', 'EVIDENCIAS', 'DEFECTOS', 'APROBACION_UAT', 'CERTIFICADO', 'CIERRE_PRUEBAS');

-- CreateEnum
CREATE TYPE "EstadoEntregable" AS ENUM ('PENDIENTE', 'POR_APROBAR', 'APROBADO');

-- CreateEnum
CREATE TYPE "TipoEvidencia" AS ENUM ('ENLACE', 'ARCHIVO', 'CERTIFICADO');

-- CreateEnum
CREATE TYPE "AccionChecklist" AS ENUM ('MARCAR', 'DESMARCAR', 'APROBAR', 'RECHAZAR', 'GENERAR_CERTIFICADO');

-- CreateTable
CREATE TABLE "entregable" (
    "id" UUID NOT NULL,
    "hdu_id" UUID NOT NULL,
    "clave" "ClaveEntregable" NOT NULL,
    "estado" "EstadoEntregable" NOT NULL DEFAULT 'PENDIENTE',
    "evidencia_tipo" "TipoEvidencia",
    "evidencia_url" TEXT,
    "evidencia_ruta" TEXT,
    "evidencia_nombre" TEXT,
    "evidencia_tipo_contenido" TEXT,
    "evidencia_tamano_bytes" INTEGER,
    "evidencia_folio" TEXT,
    "completado_por_id" UUID,
    "completado_por_nombre" TEXT,
    "completado_en" TIMESTAMPTZ(6),
    "aprobado_por_id" UUID,
    "aprobado_por_nombre" TEXT,
    "aprobado_en" TIMESTAMPTZ(6),
    "observacion" TEXT,
    "observado_por_id" UUID,
    "observado_por_nombre" TEXT,
    "observado_en" TIMESTAMPTZ(6),
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "entregable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evento_checklist" (
    "id" UUID NOT NULL,
    "hdu_id" UUID NOT NULL,
    "clave" "ClaveEntregable" NOT NULL,
    "accion" "AccionChecklist" NOT NULL,
    "actor_id" UUID NOT NULL,
    "actor_nombre" TEXT NOT NULL,
    "actor_rol" TEXT NOT NULL,
    "fecha" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "valor_anterior" JSONB,
    "valor_nuevo" JSONB,
    "motivo" TEXT,

    CONSTRAINT "evento_checklist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "certificado" (
    "id" UUID NOT NULL,
    "hdu_id" UUID NOT NULL,
    "folio" TEXT NOT NULL,
    "hdu_codigo" TEXT NOT NULL,
    "hdu_titulo" TEXT NOT NULL,
    "emitido_por_id" UUID NOT NULL,
    "emitido_por_nombre" TEXT NOT NULL,
    "emitido_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ruta_pdf" TEXT NOT NULL,
    "huella_sha256" TEXT NOT NULL,

    CONSTRAINT "certificado_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "entregable_estado_idx" ON "entregable"("estado");

-- CreateIndex
CREATE UNIQUE INDEX "entregable_hdu_id_clave_key" ON "entregable"("hdu_id", "clave");

-- CreateIndex
CREATE INDEX "evento_checklist_hdu_id_fecha_idx" ON "evento_checklist"("hdu_id", "fecha");

-- CreateIndex
CREATE UNIQUE INDEX "certificado_hdu_id_key" ON "certificado"("hdu_id");

-- CreateIndex
CREATE UNIQUE INDEX "certificado_folio_key" ON "certificado"("folio");

