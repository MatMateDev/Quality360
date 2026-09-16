-- Quality360 · Organización · agrega quién registró cada relación de
-- supervisión (comun.v1.yaml#/RelacionSupervision.registradoPor).

-- AlterTable
ALTER TABLE "supervision" ADD COLUMN     "actor_id" TEXT NOT NULL,
ADD COLUMN     "actor_nombre" TEXT NOT NULL,
ADD COLUMN     "actor_tipo" "TipoActor" NOT NULL;
