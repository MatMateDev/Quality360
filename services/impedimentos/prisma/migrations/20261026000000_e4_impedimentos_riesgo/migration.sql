-- Quality360 · Impedimentos · E4 (D58, D63, D65, D88).
-- Se aplica con el rol `svc_impedimentos` sobre el esquema `impedimentos`
-- (en la nube lo aplica `postgres` con `set local search_path to impedimentos;`).
-- Las tablas están vacías, así que los NOT NULL se agregan sin valores de relleno.
-- Sin llaves foráneas hacia otro esquema: `id_historia`, `id_certificacion`,
-- `responsable_id`, `creado_por_id` y `actor_id` son UUID de otros servicios.

-- ---------------------------------------------------------------- impedimento
ALTER TABLE "impedimento"
    ADD COLUMN "id_historia" UUID NOT NULL,
    ADD COLUMN "responsable_id" UUID,
    ADD COLUMN "responsable_nombre" VARCHAR(150) NOT NULL,
    ADD COLUMN "creado_por_id" UUID NOT NULL,
    ADD COLUMN "creado_por_nombre" VARCHAR(150) NOT NULL,
    ADD COLUMN "creado_por_rol" VARCHAR(30) NOT NULL,
    ADD COLUMN "abierto_desde" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ADD COLUMN "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- D58: una HDU sin ciclo de certificación también puede tener impedimentos.
ALTER TABLE "impedimento" ALTER COLUMN "id_certificacion" DROP NOT NULL;

ALTER TABLE "impedimento"
    ADD CONSTRAINT "impedimento_tipo_ck" CHECK ("tipo" IN ('AMBIENTE','DATOS_PRUEBA','ACCESO','REQUISITOS','DEPENDENCIA','DEFECTO_BLOQUEANTE','HERRAMIENTA','RECURSOS','OTRO')),
    ADD CONSTRAINT "impedimento_estado_ck" CHECK ("estado" IN ('ABIERTO','ESCALADO','RESUELTO')),
    ADD CONSTRAINT "impedimento_resolucion_ck" CHECK (("estado" = 'RESUELTO') = ("fecha_resolucion" IS NOT NULL)),
    ADD CONSTRAINT "impedimento_creado_por_rol_ck" CHECK ("creado_por_rol" IN ('ANALISTA_QA','QE'));

CREATE INDEX "impedimento_historia_estado_idx" ON "impedimento"("id_historia", "estado");
CREATE INDEX "impedimento_abiertos_idx" ON "impedimento"("estado", "abierto_desde") WHERE "estado" <> 'RESUELTO';
CREATE INDEX "impedimento_responsable_escalado_idx" ON "impedimento"("responsable_id") WHERE "estado" = 'ESCALADO';
CREATE INDEX "impedimento_fecha_registro_idx" ON "impedimento"("fecha_registro" DESC);

-- ----------------------------------------------------------- accion_impedimento
ALTER TABLE "accion_impedimento"
    ADD COLUMN "tipo_accion" VARCHAR(30) NOT NULL,
    ADD COLUMN "estado_anterior" VARCHAR(30),
    ADD COLUMN "actor_id" UUID NOT NULL,
    ADD COLUMN "actor_nombre" VARCHAR(150) NOT NULL,
    ADD COLUMN "actor_rol" VARCHAR(30) NOT NULL,
    ADD COLUMN "detalle" JSONB;

ALTER TABLE "accion_impedimento"
    ADD CONSTRAINT "accion_impedimento_tipo_ck" CHECK ("tipo_accion" IN ('REGISTRAR','ESCALAR','RESOLVER','REABRIR','SEGUIMIENTO')),
    ADD CONSTRAINT "accion_impedimento_anterior_ck" CHECK (("tipo_accion" = 'REGISTRAR') = ("estado_anterior" IS NULL)),
    ADD CONSTRAINT "accion_impedimento_estado_ck" CHECK ("estado" IN ('ABIERTO','ESCALADO','RESUELTO')),
    ADD CONSTRAINT "accion_impedimento_estado_anterior_valor_ck" CHECK ("estado_anterior" IS NULL OR "estado_anterior" IN ('ABIERTO','ESCALADO','RESUELTO'));

CREATE INDEX "accion_impedimento_impedimento_fecha_idx" ON "accion_impedimento"("id_impedimento", "fecha_accion");
CREATE INDEX "accion_impedimento_fecha_idx" ON "accion_impedimento"("fecha_accion" DESC);
CREATE INDEX "accion_impedimento_actor_fecha_idx" ON "accion_impedimento"("actor_id", "fecha_accion");

-- ----------------------------------------------------------------- riesgo_hdu
-- Solo inserción: el nivel vigente es la última fila de la HDU (D65, D66).
CREATE TABLE "riesgo_hdu" (
    "id_riesgo" UUID NOT NULL DEFAULT gen_random_uuid(),
    "id_historia" UUID NOT NULL,
    "nivel" VARCHAR(10) NOT NULL,
    "nivel_anterior" VARCHAR(10),
    "justificacion" VARCHAR(500) NOT NULL,
    "sugerido_al_fijar" VARCHAR(10),
    "actor_id" UUID NOT NULL,
    "actor_nombre" VARCHAR(150) NOT NULL,
    "actor_rol" VARCHAR(30) NOT NULL,
    "fecha" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "riesgo_hdu_pkey" PRIMARY KEY ("id_riesgo"),
    CONSTRAINT "riesgo_hdu_nivel_ck" CHECK ("nivel" IN ('BAJO','MEDIO','ALTO')),
    CONSTRAINT "riesgo_hdu_nivel_anterior_ck" CHECK ("nivel_anterior" IS NULL OR "nivel_anterior" IN ('BAJO','MEDIO','ALTO')),
    CONSTRAINT "riesgo_hdu_sugerido_ck" CHECK ("sugerido_al_fijar" IS NULL OR "sugerido_al_fijar" IN ('BAJO','MEDIO','ALTO'))
);
CREATE INDEX "riesgo_hdu_historia_fecha_idx" ON "riesgo_hdu"("id_historia", "fecha" DESC);
CREATE INDEX "riesgo_hdu_fecha_idx" ON "riesgo_hdu"("fecha" DESC);

-- --------------------------------------------------------------------- permisos
-- No hay borrados físicos y el historial es de solo inserción (D65, D70).
-- Funciona aunque `svc_impedimentos` sea el dueño de la tabla (local).
REVOKE UPDATE, DELETE ON "accion_impedimento", "riesgo_hdu" FROM svc_impedimentos;
REVOKE DELETE ON "impedimento" FROM svc_impedimentos;
