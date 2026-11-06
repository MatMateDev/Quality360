-- E5 · detalle de la HDU y confirmación una a una (D196-D207, ADR 0018). Aditiva: el código anterior sigue funcionando
-- porque toda columna nueva tiene valor por defecto o admite NULL. Sin llaves foráneas hacia otro esquema (D24).
-- Las SQL crudas de esta migración califican el esquema (`integraciones.`): no dependen del search_path (DEF-E5C-05).

-- ------------------------------------------------------------------------------------------- consulta_item
-- AlterTable
ALTER TABLE "integraciones"."consulta_item"
    ADD COLUMN "detalle" JSONB,
    ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN "analista_auto" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "aplicando_desde" TIMESTAMPTZ(6),
    ADD COLUMN "ya_asignada" JSONB,
    ADD COLUMN "alcance_aplicacion" VARCHAR(4),
    ADD COLUMN "aplicado_por_id" UUID,
    ADD COLUMN "aplicado_por_nombre" VARCHAR(150),
    ADD COLUMN "aplicado_en" TIMESTAMPTZ(6);

-- Las filas `aplicada` que ya existen vienen de un lote `INCOMPLETA` (D148): reciben `LOTE` y los datos de la consulta.
-- Quien las aplicó es quien asignó la fila, o en su defecto quien creó la consulta.
UPDATE "integraciones"."consulta_item" AS i
SET "alcance_aplicacion" = 'LOTE',
    "aplicado_por_id" = COALESCE(i."asignado_por_id", c."creada_por_id"),
    "aplicado_por_nombre" = COALESCE(i."asignado_por_nombre", c."creada_por_nombre"),
    "aplicado_en" = COALESCE(i."asignado_en", c."creada_en")
FROM "integraciones"."consulta_jira" AS c
WHERE i."id_consulta" = c."id_consulta" AND i."aplicada";

ALTER TABLE "integraciones"."consulta_item"
    ADD CONSTRAINT "item_detalle_ck" CHECK ("detalle" IS NULL OR (jsonb_typeof("detalle") = 'object' AND octet_length("detalle"::text) <= 40960)),
    ADD CONSTRAINT "item_revision_ck" CHECK ("revision" >= 1),
    ADD CONSTRAINT "item_analista_auto_ck" CHECK (NOT "analista_auto" OR "analista_id" IS NOT NULL),
    ADD CONSTRAINT "item_ya_asignada_ck" CHECK ("ya_asignada" IS NULL OR jsonb_typeof("ya_asignada") = 'object'),
    ADD CONSTRAINT "item_alcance_aplicacion_ck" CHECK ("alcance_aplicacion" IS NULL OR "alcance_aplicacion" IN ('LOTE', 'HDU')),
    ADD CONSTRAINT "item_aplicacion_ck" CHECK (
        "aplicada" = ("alcance_aplicacion" IS NOT NULL)
        AND ("alcance_aplicacion" IS NOT NULL OR ("aplicado_por_id" IS NULL AND "aplicado_por_nombre" IS NULL AND "aplicado_en" IS NULL))
    );

-- `item_hdu_ck` se relaja: una fila `NUEVA` (o `CON_ERROR`) puede guardar `id_historia` cuando la HDU se creó desde la
-- consulta (`aplicada`) o la creó otra persona durante la revisión (`ya_asignada`). Los demás datos de la HDU existente
-- siguen siendo solo de `CAMBIO` y `SIN_CAMBIOS`.
ALTER TABLE "integraciones"."consulta_item" DROP CONSTRAINT "item_hdu_ck";
ALTER TABLE "integraciones"."consulta_item" ADD CONSTRAINT "item_hdu_ck" CHECK (
    "grupo" IN ('CAMBIO', 'SIN_CAMBIOS')
    OR ("origen_hdu" IS NULL AND "estado_hdu" IS NULL AND "qe_hdu_nombre" IS NULL
        AND ("id_historia" IS NULL OR "aplicada" OR "ya_asignada" IS NOT NULL))
);

-- ------------------------------------------------------------------------------------------- consulta_jira
-- HDU creadas desde la consulta (por fila y por lote). Se conserva al purgar las filas (D205).
ALTER TABLE "integraciones"."consulta_jira" ADD COLUMN "creadas" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "integraciones"."consulta_jira" ADD CONSTRAINT "consulta_creadas_ck" CHECK ("creadas" >= 0);

-- ------------------------------------------------------------------------------------- ejecucion_integracion
-- `alcance`: `LOTE` es «Confirmar marcadas» (y toda ejecución que no es una confirmación por fila); `HDU` es una sola fila (D206).
ALTER TABLE "integraciones"."ejecucion_integracion" ADD COLUMN "alcance" VARCHAR(4) NOT NULL DEFAULT 'LOTE';
ALTER TABLE "integraciones"."ejecucion_integracion"
    ADD CONSTRAINT "ejecucion_alcance_ck" CHECK ("alcance" IN ('LOTE', 'HDU')),
    ADD CONSTRAINT "ejecucion_alcance_fase_ck" CHECK ("alcance" = 'LOTE' OR "fase" = 'CONFIRMACION'),
    -- Una ejecución `HDU` se inserta ya cerrada y con una sola fila: nunca ocupa `ejecucion_en_curso_key` (D104, D202).
    ADD CONSTRAINT "ejecucion_alcance_hdu_ck" CHECK ("alcance" = 'LOTE' OR ("leidas" = 1 AND "terminada_en" IS NOT NULL));
CREATE INDEX "ejecucion_integracion_alcance_idx" ON "integraciones"."ejecucion_integracion"("alcance", "iniciada_en" DESC);

-- La identidad de una ejecución suma el alcance.
CREATE OR REPLACE FUNCTION "integraciones"."ejecucion_cerrada_inmutable_fn"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF OLD."terminada_en" IS NOT NULL THEN
        RAISE EXCEPTION 'La ejecución % está cerrada y no se puede modificar', OLD."id_ejecucion" USING ERRCODE = '23001';
    END IF;
    IF NEW."id_ejecucion" IS DISTINCT FROM OLD."id_ejecucion"
        OR NEW."origen" IS DISTINCT FROM OLD."origen"
        OR NEW."fase" IS DISTINCT FROM OLD."fase"
        OR NEW."alcance" IS DISTINCT FROM OLD."alcance"
        -- La primera tanda de una consulta se registra antes de que la consulta exista: su `consulta_id` se fija una sola vez al cerrar.
        OR (OLD."consulta_id" IS NOT NULL AND NEW."consulta_id" IS DISTINCT FROM OLD."consulta_id")
        OR NEW."actor_id" IS DISTINCT FROM OLD."actor_id"
        OR NEW."actor_nombre" IS DISTINCT FROM OLD."actor_nombre"
        OR NEW."actor_rol" IS DISTINCT FROM OLD."actor_rol"
        OR NEW."iniciada_en" IS DISTINCT FROM OLD."iniciada_en" THEN
        RAISE EXCEPTION 'La identidad de la ejecución % no se puede modificar', OLD."id_ejecucion" USING ERRCODE = '23001';
    END IF;
    RETURN NEW;
END;
$$ SET search_path = integraciones, pg_catalog;

-- Una ejecución `HDU` nace cerrada: su única fila de detalle se inserta en la misma transacción, después de la ejecución.
-- Se admite esa fila solo mientras la ejecución `HDU` no tenga ninguna (el detalle sigue siendo de solo inserción).
CREATE OR REPLACE FUNCTION "integraciones"."detalle_solo_en_curso_fn"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM "integraciones"."ejecucion_integracion" AS e
        WHERE e."id_ejecucion" = NEW."id_ejecucion" AND e."terminada_en" IS NOT NULL
          AND NOT (e."alcance" = 'HDU' AND NOT EXISTS (
              SELECT 1 FROM "integraciones"."detalle_ejecucion" AS d WHERE d."id_ejecucion" = e."id_ejecucion"))
    ) THEN
        RAISE EXCEPTION 'La ejecución % está cerrada: no admite más filas de detalle', NEW."id_ejecucion" USING ERRCODE = '23001';
    END IF;
    RETURN NEW;
END;
$$ SET search_path = integraciones, pg_catalog;

-- ----------------------------------------------------------------------------------------- configuracion_jira
-- `customfield_*` de «Acceptance Criteria» / «Criterios de aceptación», detectado al guardar la conexión (D199).
ALTER TABLE "integraciones"."configuracion_jira" ADD COLUMN "campo_criterios" VARCHAR(30);

-- ------------------------------------------------------------------------------------------------- permisos
-- TRUNCATE no pasa por los disparadores y nunca se concede (convención de las migraciones anteriores).
REVOKE TRUNCATE ON "integraciones"."consulta_jira", "integraciones"."consulta_item", "integraciones"."ejecucion_integracion", "integraciones"."configuracion_jira" FROM svc_integraciones;
