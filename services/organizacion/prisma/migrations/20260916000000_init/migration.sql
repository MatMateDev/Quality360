-- Quality360 · Organización y seguimiento · migración inicial.
-- Se aplica con el rol `svc_organizacion` sobre el esquema `organizacion`
-- (DATABASE_URL con `?schema=organizacion`, ver infrastructure/db/001_esquemas_roles.sql).

-- CreateEnum
CREATE TYPE "Rol" AS ENUM ('ADMINISTRADOR', 'QE', 'ANALISTA_QA');

-- CreateEnum
CREATE TYPE "PrioridadHdu" AS ENUM ('BAJA', 'MEDIA', 'ALTA', 'CRITICA');

-- CreateEnum
CREATE TYPE "EstadoHdu" AS ENUM ('PENDIENTE', 'DISENO_PRUEBAS', 'EN_EJECUCION', 'PENDIENTE_CIERRE', 'CERRADA');

-- CreateEnum
CREATE TYPE "TipoActor" AS ENUM ('USUARIO', 'SERVICIO');

-- CreateEnum
CREATE TYPE "EntidadAuditoria" AS ENUM ('USUARIO', 'SUPERVISION', 'HDU');

-- CreateEnum
CREATE TYPE "AccionAuditoria" AS ENUM ('CREAR_USUARIO', 'ACTUALIZAR_USUARIO', 'ACTIVAR_USUARIO', 'DESACTIVAR_USUARIO', 'CAMBIAR_ROL', 'ASIGNAR_SUPERVISOR', 'CAMBIAR_SUPERVISOR', 'CREAR_HDU', 'CAMBIAR_ESTADO_HDU', 'ASIGNAR_ANALISTA', 'REASIGNAR_ANALISTA');

-- CreateTable
CREATE TABLE "usuario" (
    "id" UUID NOT NULL,
    "nombre" TEXT NOT NULL,
    "correo" TEXT NOT NULL,
    "rol" "Rol" NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "usuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supervision" (
    "id" UUID NOT NULL,
    "qe_id" UUID NOT NULL,
    "analista_id" UUID NOT NULL,
    "desde" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "hasta" TIMESTAMPTZ(6),
    "motivo" TEXT,

    CONSTRAINT "supervision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "celula" (
    "id" UUID NOT NULL,
    "nombre" TEXT NOT NULL,

    CONSTRAINT "celula_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sprint" (
    "id" UUID NOT NULL,
    "nombre" TEXT NOT NULL,
    "inicio" DATE NOT NULL,
    "fin" DATE NOT NULL,

    CONSTRAINT "sprint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hdu" (
    "id" UUID NOT NULL,
    "codigo" TEXT NOT NULL,
    "codigo_normalizado" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "celula_id" UUID NOT NULL,
    "sprint_id" UUID NOT NULL,
    "prioridad" "PrioridadHdu" NOT NULL,
    "qe_responsable_id" UUID NOT NULL,
    "analista_id" UUID,
    "estado" "EstadoHdu" NOT NULL DEFAULT 'PENDIENTE',
    "estado_actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "creado_por_tipo" "TipoActor" NOT NULL,
    "creado_por_id" TEXT NOT NULL,
    "creado_por_nombre" TEXT NOT NULL,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hdu_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hdu_historial_estado" (
    "id" UUID NOT NULL,
    "hdu_id" UUID NOT NULL,
    "estado_anterior" "EstadoHdu" NOT NULL,
    "estado_nuevo" "EstadoHdu" NOT NULL,
    "actor_tipo" "TipoActor" NOT NULL,
    "actor_id" TEXT NOT NULL,
    "actor_nombre" TEXT NOT NULL,
    "fecha" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hdu_historial_estado_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hdu_historial_asignacion" (
    "id" UUID NOT NULL,
    "hdu_id" UUID NOT NULL,
    "analista_anterior_id" UUID,
    "analista_nuevo_id" UUID NOT NULL,
    "motivo" TEXT,
    "actor_tipo" "TipoActor" NOT NULL,
    "actor_id" TEXT NOT NULL,
    "actor_nombre" TEXT NOT NULL,
    "fecha" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hdu_historial_asignacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auditoria" (
    "id" UUID NOT NULL,
    "actor_tipo" "TipoActor" NOT NULL,
    "actor_id" TEXT NOT NULL,
    "actor_nombre" TEXT NOT NULL,
    "entidad" "EntidadAuditoria" NOT NULL,
    "entidad_id" UUID NOT NULL,
    "accion" "AccionAuditoria" NOT NULL,
    "antes" JSONB,
    "despues" JSONB,
    "motivo" TEXT,
    "fecha" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auditoria_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "usuario_correo_key" ON "usuario"("correo");

-- CreateIndex
CREATE INDEX "supervision_qe_id_idx" ON "supervision"("qe_id");

-- CreateIndex
CREATE INDEX "supervision_analista_id_idx" ON "supervision"("analista_id");

-- CreateIndex
CREATE INDEX "supervision_analista_id_hasta_idx" ON "supervision"("analista_id", "hasta");

-- CreateIndex (regla de dominio: máximo un QE vigente por analista — D9/E1-B09)
-- Índice único PARCIAL: Prisma no expresa `WHERE` en el DSL, así que esta
-- migración se escribió a mano a partir del diff generado.
CREATE UNIQUE INDEX "supervision_analista_id_vigente_key" ON "supervision"("analista_id") WHERE "hasta" IS NULL;

-- CreateIndex
CREATE UNIQUE INDEX "celula_nombre_key" ON "celula"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "sprint_nombre_key" ON "sprint"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "hdu_codigo_normalizado_key" ON "hdu"("codigo_normalizado");

-- CreateIndex
CREATE INDEX "hdu_celula_id_idx" ON "hdu"("celula_id");

-- CreateIndex
CREATE INDEX "hdu_sprint_id_idx" ON "hdu"("sprint_id");

-- CreateIndex
CREATE INDEX "hdu_qe_responsable_id_idx" ON "hdu"("qe_responsable_id");

-- CreateIndex
CREATE INDEX "hdu_analista_id_idx" ON "hdu"("analista_id");

-- CreateIndex
CREATE INDEX "hdu_estado_idx" ON "hdu"("estado");

-- CreateIndex
CREATE INDEX "hdu_historial_estado_hdu_id_idx" ON "hdu_historial_estado"("hdu_id");

-- CreateIndex
CREATE INDEX "hdu_historial_asignacion_hdu_id_idx" ON "hdu_historial_asignacion"("hdu_id");

-- CreateIndex
CREATE INDEX "auditoria_entidad_entidad_id_idx" ON "auditoria"("entidad", "entidad_id");

-- CreateIndex
CREATE INDEX "auditoria_fecha_idx" ON "auditoria"("fecha");

-- AddForeignKey
ALTER TABLE "supervision" ADD CONSTRAINT "supervision_qe_id_fkey" FOREIGN KEY ("qe_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supervision" ADD CONSTRAINT "supervision_analista_id_fkey" FOREIGN KEY ("analista_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hdu" ADD CONSTRAINT "hdu_celula_id_fkey" FOREIGN KEY ("celula_id") REFERENCES "celula"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hdu" ADD CONSTRAINT "hdu_sprint_id_fkey" FOREIGN KEY ("sprint_id") REFERENCES "sprint"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hdu" ADD CONSTRAINT "hdu_qe_responsable_id_fkey" FOREIGN KEY ("qe_responsable_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hdu" ADD CONSTRAINT "hdu_analista_id_fkey" FOREIGN KEY ("analista_id") REFERENCES "usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hdu_historial_estado" ADD CONSTRAINT "hdu_historial_estado_hdu_id_fkey" FOREIGN KEY ("hdu_id") REFERENCES "hdu"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hdu_historial_asignacion" ADD CONSTRAINT "hdu_historial_asignacion_hdu_id_fkey" FOREIGN KEY ("hdu_id") REFERENCES "hdu"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
