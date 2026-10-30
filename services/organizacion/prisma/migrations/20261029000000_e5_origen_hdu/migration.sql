-- Quality360 · Organización · E5 (D97, D124).
-- Se aplica con el rol `svc_organizacion` sobre el esquema `organizacion`
-- (en la nube lo aplica `postgres` con `set local search_path to organizacion;`).
-- Las HDU existentes y las de la semilla quedan `MANUAL`. Sin llaves foráneas hacia otro esquema.

-- ------------------------------------------------------------ historia_usuario
ALTER TABLE "historia_usuario"
    ADD COLUMN "origen" VARCHAR(10) NOT NULL DEFAULT 'MANUAL',
    ADD COLUMN "clave_externa" VARCHAR(60),
    ADD COLUMN "url_externa" VARCHAR(300);

ALTER TABLE "historia_usuario"
    ADD CONSTRAINT "historia_usuario_origen_ck" CHECK ("origen" IN ('MANUAL', 'JIRA', 'CSV', 'JSON')),
    -- La clave y el enlace de Jira solo existen en una HDU de origen JIRA.
    ADD CONSTRAINT "historia_usuario_externa_ck" CHECK (("clave_externa" IS NULL AND "url_externa" IS NULL) OR "origen" = 'JIRA');

-- Limpieza de QA y consultas por fuente: solo indexa lo que no es manual.
CREATE INDEX "historia_usuario_origen_idx" ON "historia_usuario"("origen") WHERE "origen" <> 'MANUAL';

-- --------------------------------------------------------------------- auditoría
-- El valor nuevo no se usa en esta transacción.
ALTER TYPE "AccionAuditoria" ADD VALUE IF NOT EXISTS 'ACTUALIZAR_HDU';
