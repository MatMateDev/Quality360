-- E5 · consulta y asignación (D132-D152): consulta guardada (`consulta_jira`, `consulta_item`), fase y contadores de
-- consulta en `ejecucion_integracion` y `asignacion` en `detalle_ejecucion`. Aditiva: el código anterior sigue
-- funcionando porque las columnas nuevas tienen valor por defecto. Sin llaves foráneas hacia otro esquema (D24).

-- AlterTable
ALTER TABLE "detalle_ejecucion" ADD COLUMN     "asignacion" JSONB;

-- AlterTable
ALTER TABLE "ejecucion_integracion" ADD COLUMN     "cambiaron" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "consulta_id" UUID,
ADD COLUMN     "fase" VARCHAR(12) NOT NULL DEFAULT 'DIRECTA',
ADD COLUMN     "nuevas" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "sin_cambios" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "consulta_jira" (
    "id_consulta" UUID NOT NULL DEFAULT gen_random_uuid(),
    "estado" VARCHAR(12) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "creada_por_id" UUID NOT NULL,
    "creada_por_nombre" VARCHAR(150) NOT NULL,
    "creada_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "vence_en" TIMESTAMPTZ(6) NOT NULL,
    "cerrada_en" TIMESTAMPTZ(6),
    "cerrada_por_id" UUID,
    "cerrada_por_nombre" VARCHAR(150),
    "proyecto_clave" VARCHAR(10) NOT NULL,
    "sitio_host" VARCHAR(100) NOT NULL,
    "hay_mas" BOOLEAN NOT NULL DEFAULT false,
    "continuar_desde" VARCHAR(40),
    "sugerencia_celula_id" UUID,
    "sugerencia_qe_id" UUID,
    "sprint_respaldo_id" UUID,
    "sugerencia_celula_nombre" VARCHAR(120),
    "sugerencia_qe_nombre" VARCHAR(150),
    "sprint_respaldo_nombre" VARCHAR(120),
    "total_filas" INTEGER NOT NULL DEFAULT 0,
    "nuevas" INTEGER NOT NULL DEFAULT 0,
    "cambiaron" INTEGER NOT NULL DEFAULT 0,
    "sin_cambios" INTEGER NOT NULL DEFAULT 0,
    "con_error" INTEGER NOT NULL DEFAULT 0,
    "con_advertencias" INTEGER NOT NULL DEFAULT 0,
    "descartadas" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "consulta_jira_pkey" PRIMARY KEY ("id_consulta")
);

-- CreateTable
CREATE TABLE "consulta_item" (
    "id_item" UUID NOT NULL DEFAULT gen_random_uuid(),
    "id_consulta" UUID NOT NULL,
    "posicion" INTEGER NOT NULL,
    "grupo" VARCHAR(11) NOT NULL,
    "codigo" VARCHAR(60),
    "titulo" VARCHAR(200),
    "descripcion" VARCHAR(1000),
    "prioridad" VARCHAR(7),
    "sprint_jira" VARCHAR(120),
    "referencia" JSONB,
    "advertencias" JSONB,
    "motivo" VARCHAR(40),
    "id_historia" UUID,
    "origen_hdu" VARCHAR(6),
    "estado_hdu" VARCHAR(20),
    "qe_hdu_nombre" VARCHAR(150),
    "cambios" JSONB,
    "celula_id" UUID,
    "qe_id" UUID,
    "analista_id" UUID,
    "sprint_id" UUID,
    "celula_nombre" VARCHAR(120),
    "qe_nombre" VARCHAR(150),
    "analista_nombre" VARCHAR(150),
    "sprint_nombre" VARCHAR(120),
    "sprint_origen" VARCHAR(8),
    "aviso_sin_lider" BOOLEAN NOT NULL DEFAULT false,
    "marcada" BOOLEAN NOT NULL DEFAULT false,
    "aplicada" BOOLEAN NOT NULL DEFAULT false,
    "asignado_por_id" UUID,
    "asignado_por_nombre" VARCHAR(150),
    "asignado_en" TIMESTAMPTZ(6),

    CONSTRAINT "consulta_item_pkey" PRIMARY KEY ("id_item")
);

-- CreateIndex
CREATE INDEX "consulta_jira_creada_idx" ON "consulta_jira"("creada_en" DESC);

-- CreateIndex
CREATE INDEX "consulta_item_grupo_idx" ON "consulta_item"("id_consulta", "grupo", "posicion");

-- CreateIndex
CREATE UNIQUE INDEX "consulta_item_posicion_key" ON "consulta_item"("id_consulta", "posicion");

-- CreateIndex
CREATE INDEX "ejecucion_integracion_fase_idx" ON "ejecucion_integracion"("fase", "iniciada_en" DESC);

-- AddForeignKey
ALTER TABLE "ejecucion_integracion" ADD CONSTRAINT "ejecucion_integracion_consulta_id_fkey" FOREIGN KEY ("consulta_id") REFERENCES "consulta_jira"("id_consulta") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consulta_item" ADD CONSTRAINT "consulta_item_id_consulta_fkey" FOREIGN KEY ("id_consulta") REFERENCES "consulta_jira"("id_consulta") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------------------------
-- Lo que Prisma no expresa. Se documenta en prisma/schema.prisma. En la nube lo aplica `postgres` con
-- `set local search_path to integraciones;`.
-- ---------------------------------------------------------------------------------------------

-- ------------------------------------------------------------------------------- consulta_jira
ALTER TABLE "consulta_jira"
    ADD CONSTRAINT "consulta_estado_ck" CHECK ("estado" IN ('ABIERTA', 'CONFIRMADA', 'REEMPLAZADA', 'VENCIDA', 'DESCARTADA')),
    ADD CONSTRAINT "consulta_version_ck" CHECK ("version" >= 1),
    ADD CONSTRAINT "consulta_cierre_ck" CHECK (("estado" = 'ABIERTA') = ("cerrada_en" IS NULL)),
    ADD CONSTRAINT "consulta_proyecto_ck" CHECK ("proyecto_clave" ~ '^[A-Z][A-Z0-9_]{1,9}$'),
    ADD CONSTRAINT "consulta_contadores_positivos_ck" CHECK ("total_filas" >= 0 AND "nuevas" >= 0 AND "cambiaron" >= 0 AND "sin_cambios" >= 0 AND "con_error" >= 0 AND "con_advertencias" >= 0 AND "descartadas" >= 0),
    ADD CONSTRAINT "consulta_tope_ck" CHECK ("total_filas" <= 500),
    ADD CONSTRAINT "consulta_contadores_ck" CHECK ("nuevas" + "cambiaron" + "sin_cambios" + "con_error" = "total_filas");

-- Una sola consulta abierta a la vez (D134): un segundo INSERT `ABIERTA` viola este índice (23505).
CREATE UNIQUE INDEX "consulta_abierta_key" ON "consulta_jira" ((true)) WHERE "estado" = 'ABIERTA';

-- Una consulta cerrada no se modifica; nunca cambian su identidad, su autor ni su fecha de creación. La transición
-- ABIERTA -> otro estado sí está permitida.
CREATE FUNCTION "consulta_cerrada_inmutable_fn"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF OLD."estado" <> 'ABIERTA' THEN
        RAISE EXCEPTION 'La consulta % está cerrada y no se puede modificar', OLD."id_consulta" USING ERRCODE = '23001';
    END IF;
    IF NEW."id_consulta" IS DISTINCT FROM OLD."id_consulta"
        OR NEW."creada_por_id" IS DISTINCT FROM OLD."creada_por_id"
        OR NEW."creada_por_nombre" IS DISTINCT FROM OLD."creada_por_nombre"
        OR NEW."creada_en" IS DISTINCT FROM OLD."creada_en" THEN
        RAISE EXCEPTION 'La identidad de la consulta % no se puede modificar', OLD."id_consulta" USING ERRCODE = '23001';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER "consulta_cerrada_inmutable" BEFORE UPDATE ON "consulta_jira"
    FOR EACH ROW EXECUTE FUNCTION "consulta_cerrada_inmutable_fn"();

-- ------------------------------------------------------------------------------- consulta_item
-- Mayúsculas del código para la unicidad de la consulta (la primera lectura gana, D135).
ALTER TABLE "consulta_item" ADD COLUMN "codigo_normalizado" VARCHAR(60) GENERATED ALWAYS AS (upper("codigo")) STORED;
CREATE UNIQUE INDEX "consulta_item_codigo_key" ON "consulta_item"("id_consulta", "codigo_normalizado");

ALTER TABLE "consulta_item"
    ADD CONSTRAINT "item_posicion_ck" CHECK ("posicion" >= 1),
    ADD CONSTRAINT "item_grupo_ck" CHECK ("grupo" IN ('NUEVA', 'CAMBIO', 'SIN_CAMBIOS', 'CON_ERROR')),
    ADD CONSTRAINT "item_prioridad_ck" CHECK ("prioridad" IS NULL OR "prioridad" IN ('BAJA', 'MEDIA', 'ALTA', 'CRITICA')),
    ADD CONSTRAINT "item_sprint_origen_ck" CHECK ("sprint_origen" IS NULL OR "sprint_origen" IN ('JIRA', 'RESPALDO', 'MANUAL')),
    ADD CONSTRAINT "item_advertencias_ck" CHECK ("advertencias" IS NULL OR jsonb_typeof("advertencias") = 'array'),
    ADD CONSTRAINT "item_motivo_ck" CHECK (("grupo" IN ('SIN_CAMBIOS', 'CON_ERROR')) = ("motivo" IS NOT NULL)),
    ADD CONSTRAINT "item_hdu_ck" CHECK ("grupo" IN ('CAMBIO', 'SIN_CAMBIOS') OR ("id_historia" IS NULL AND "origen_hdu" IS NULL AND "estado_hdu" IS NULL AND "qe_hdu_nombre" IS NULL)),
    ADD CONSTRAINT "item_cambios_ck" CHECK ("cambios" IS NULL OR "grupo" = 'CAMBIO'),
    ADD CONSTRAINT "item_asignacion_ck" CHECK ("grupo" = 'NUEVA' OR (
        "celula_id" IS NULL AND "qe_id" IS NULL AND "analista_id" IS NULL AND "sprint_id" IS NULL
        AND "celula_nombre" IS NULL AND "qe_nombre" IS NULL AND "analista_nombre" IS NULL AND "sprint_nombre" IS NULL
        AND "sprint_origen" IS NULL AND "aviso_sin_lider" = false
        AND "asignado_por_id" IS NULL AND "asignado_por_nombre" IS NULL AND "asignado_en" IS NULL)),
    -- Solo se marca una fila de «Cambiaron» o una «Nueva» con la asignación completa (D139).
    ADD CONSTRAINT "marcada_valida" CHECK (NOT "marcada" OR "grupo" = 'CAMBIO' OR ("grupo" = 'NUEVA' AND "celula_id" IS NOT NULL AND "qe_id" IS NOT NULL AND "analista_id" IS NOT NULL AND "sprint_id" IS NOT NULL)),
    ADD CONSTRAINT "aplicada_marcada" CHECK (NOT "aplicada" OR "marcada");

-- Las filas solo se escriben mientras la consulta está abierta. El DELETE no pasa por aquí: es la purga (D133).
CREATE FUNCTION "item_solo_consulta_abierta_fn"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM "consulta_jira"
        WHERE "id_consulta" = NEW."id_consulta" AND "estado" = 'ABIERTA'
    ) THEN
        RAISE EXCEPTION 'La consulta % no está abierta: no admite cambios en sus filas', NEW."id_consulta" USING ERRCODE = '23001';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER "item_solo_consulta_abierta" BEFORE INSERT OR UPDATE ON "consulta_item"
    FOR EACH ROW EXECUTE FUNCTION "item_solo_consulta_abierta_fn"();

-- ----------------------------------------------------------------------- ejecucion_integracion
ALTER TABLE "ejecucion_integracion"
    ADD CONSTRAINT "ejecucion_fase_ck" CHECK ("fase" IN ('DIRECTA', 'CONSULTA', 'CONFIRMACION')),
    ADD CONSTRAINT "ejecucion_fase_origen_ck" CHECK ("fase" = 'DIRECTA' OR "origen" = 'JIRA'),
    ADD CONSTRAINT "ejecucion_consulta_ck" CHECK ("fase" <> 'DIRECTA' OR "consulta_id" IS NULL),
    ADD CONSTRAINT "ejecucion_confirmacion_ck" CHECK ("fase" <> 'CONFIRMACION' OR "consulta_id" IS NOT NULL),
    ADD CONSTRAINT "ejecucion_contadores_consulta_positivos_ck" CHECK ("nuevas" >= 0 AND "cambiaron" >= 0 AND "sin_cambios" >= 0);

-- El invariante de los contadores pasa a ser por fase (D141). Las filas existentes son `DIRECTA` con ceros.
ALTER TABLE "ejecucion_integracion" DROP CONSTRAINT "ejecucion_contadores_ck";
ALTER TABLE "ejecucion_integracion" ADD CONSTRAINT "ejecucion_contadores_ck" CHECK (
    "terminada_en" IS NULL
    OR ("fase" = 'CONSULTA'
        AND "nuevas" + "cambiaron" + "sin_cambios" + "con_error" = "leidas"
        AND "creadas" = 0 AND "actualizadas" = 0 AND "omitidas" = 0)
    OR ("fase" <> 'CONSULTA'
        AND "creadas" + "actualizadas" + "omitidas" + "con_error" = "leidas"
        AND "nuevas" = 0 AND "cambiaron" = 0 AND "sin_cambios" = 0)
);

-- La identidad de una ejecución suma la fase y la consulta.
CREATE OR REPLACE FUNCTION "ejecucion_cerrada_inmutable_fn"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF OLD."terminada_en" IS NOT NULL THEN
        RAISE EXCEPTION 'La ejecución % está cerrada y no se puede modificar', OLD."id_ejecucion" USING ERRCODE = '23001';
    END IF;
    IF NEW."id_ejecucion" IS DISTINCT FROM OLD."id_ejecucion"
        OR NEW."origen" IS DISTINCT FROM OLD."origen"
        OR NEW."fase" IS DISTINCT FROM OLD."fase"
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
$$;

-- ------------------------------------------------------------------------------ detalle_ejecucion
ALTER TABLE "detalle_ejecucion"
    ADD CONSTRAINT "detalle_asignacion_ck" CHECK ("asignacion" IS NULL OR jsonb_typeof("asignacion") = 'object');

-- --------------------------------------------------------------------------------------- permisos
-- Una consulta no se borra. `consulta_item` conserva el DELETE: es la purga (D133). TRUNCATE no pasa por los
-- disparadores y nunca se concede.
REVOKE DELETE, TRUNCATE ON "consulta_jira" FROM svc_integraciones;
REVOKE TRUNCATE ON "consulta_item" FROM svc_integraciones;
