-- Quality360 · Impedimentos · tablas del modelo de datos (modelo ER y lógico de
-- Quality360, D23–D27). La funcionalidad llega con E4.
-- Se aplica con el rol `svc_impedimentos` sobre el esquema `impedimentos`.

CREATE TABLE "impedimento" (
    "id_impedimento" UUID NOT NULL,
    "titulo" VARCHAR(200) NOT NULL,
    "descripcion" VARCHAR(1000),
    "tipo" VARCHAR(30) NOT NULL,
    "estado" VARCHAR(30) NOT NULL,
    "fecha_registro" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fecha_resolucion" TIMESTAMPTZ(6),
    "id_certificacion" UUID NOT NULL,

    CONSTRAINT "impedimento_pkey" PRIMARY KEY ("id_impedimento"),
    CONSTRAINT "impedimento_fechas_check" CHECK ("fecha_resolucion" IS NULL OR "fecha_resolucion" >= "fecha_registro")
);
-- id_certificacion apunta a Certificaciones: sin llave foránea entre esquemas.
CREATE INDEX "impedimento_id_certificacion_idx" ON "impedimento"("id_certificacion");

CREATE TABLE "accion_impedimento" (
    "id_accion_impedimento" UUID NOT NULL,
    "descripcion" VARCHAR(500) NOT NULL,
    "fecha_accion" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "estado" VARCHAR(30) NOT NULL,
    "observacion" VARCHAR(500),
    "id_impedimento" UUID NOT NULL,

    CONSTRAINT "accion_impedimento_pkey" PRIMARY KEY ("id_accion_impedimento")
);
CREATE INDEX "accion_impedimento_id_impedimento_idx" ON "accion_impedimento"("id_impedimento");
ALTER TABLE "accion_impedimento" ADD CONSTRAINT "accion_impedimento_id_impedimento_fkey"
    FOREIGN KEY ("id_impedimento") REFERENCES "impedimento"("id_impedimento") ON DELETE RESTRICT ON UPDATE CASCADE;
