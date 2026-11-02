-- Quality360 · Integraciones · E5 (D94, D104, D111, D123). Tablas: configuracion_jira, evento_configuracion,
-- ejecucion_integracion y detalle_ejecucion.

-- CreateTable
CREATE TABLE "configuracion_jira" (
    "id" SMALLINT NOT NULL DEFAULT 1,
    "sitio_url" VARCHAR(100) NOT NULL,
    "correo" VARCHAR(150) NOT NULL,
    "proyecto_clave" VARCHAR(10) NOT NULL,
    "tipos_issue" VARCHAR(200) NOT NULL DEFAULT 'Story,Historia',
    "campo_sprint" VARCHAR(30),
    "celula_id" UUID NOT NULL,
    "qe_responsable_id" UUID NOT NULL,
    "sprint_respaldo_id" UUID NOT NULL,
    "token_cifrado" BYTEA NOT NULL,
    "token_iv" BYTEA NOT NULL,
    "token_tag" BYTEA NOT NULL,
    "llave_version" SMALLINT NOT NULL DEFAULT 1,
    "token_ultimos4" CHAR(4) NOT NULL,
    "estado_conexion" VARCHAR(12) NOT NULL,
    "ultima_prueba_en" TIMESTAMPTZ(6),
    "ultima_prueba_codigo" VARCHAR(40),
    "actualizado_por_id" UUID NOT NULL,
    "actualizado_por_nombre" VARCHAR(150) NOT NULL,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "configuracion_jira_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evento_configuracion" (
    "id_evento" UUID NOT NULL DEFAULT gen_random_uuid(),
    "actor_id" UUID NOT NULL,
    "actor_nombre" VARCHAR(150) NOT NULL,
    "fecha" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "campos_cambiados" JSONB NOT NULL,
    "token_cambiado" BOOLEAN NOT NULL,
    "resultado_prueba" VARCHAR(40) NOT NULL,

    CONSTRAINT "evento_configuracion_pkey" PRIMARY KEY ("id_evento")
);

-- CreateTable
CREATE TABLE "ejecucion_integracion" (
    "id_ejecucion" UUID NOT NULL DEFAULT gen_random_uuid(),
    "origen" VARCHAR(5) NOT NULL,
    "estricto" BOOLEAN NOT NULL DEFAULT false,
    "vincular_existentes" BOOLEAN NOT NULL DEFAULT false,
    "actor_id" UUID NOT NULL,
    "actor_nombre" VARCHAR(150) NOT NULL,
    "actor_rol" VARCHAR(30) NOT NULL,
    "iniciada_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "terminada_en" TIMESTAMPTZ(6),
    "duracion_ms" INTEGER,
    "resultado" VARCHAR(12) NOT NULL,
    "leidas" INTEGER NOT NULL DEFAULT 0,
    "creadas" INTEGER NOT NULL DEFAULT 0,
    "actualizadas" INTEGER NOT NULL DEFAULT 0,
    "omitidas" INTEGER NOT NULL DEFAULT 0,
    "con_error" INTEGER NOT NULL DEFAULT 0,
    "con_advertencias" INTEGER NOT NULL DEFAULT 0,
    "reintentos_429" INTEGER NOT NULL DEFAULT 0,
    "codigo_error" VARCHAR(40),
    "mensaje_error" VARCHAR(300),
    "proyecto_clave" VARCHAR(10),
    "sitio_host" VARCHAR(100),
    "archivo_nombre" VARCHAR(150),
    "archivo_tamano" INTEGER,
    "archivo_huella" CHAR(64),
    "hay_mas" BOOLEAN NOT NULL DEFAULT false,
    "continuar_desde" VARCHAR(40),
    "eventos" JSONB,

    CONSTRAINT "ejecucion_integracion_pkey" PRIMARY KEY ("id_ejecucion")
);

-- CreateTable
CREATE TABLE "detalle_ejecucion" (
    "id_detalle" UUID NOT NULL DEFAULT gen_random_uuid(),
    "id_ejecucion" UUID NOT NULL,
    "fila" INTEGER NOT NULL,
    "codigo" VARCHAR(60),
    "titulo" VARCHAR(200),
    "id_historia" UUID,
    "resultado" VARCHAR(12) NOT NULL,
    "motivo" VARCHAR(40),
    "mensaje" VARCHAR(200),
    "advertencias" JSONB,
    "cambios" JSONB,
    "referencia" JSONB,

    CONSTRAINT "detalle_ejecucion_pkey" PRIMARY KEY ("id_detalle")
);

-- CreateIndex
CREATE INDEX "evento_configuracion_fecha_idx" ON "evento_configuracion"("fecha" DESC);

-- CreateIndex
CREATE INDEX "ejecucion_integracion_iniciada_idx" ON "ejecucion_integracion"("iniciada_en" DESC);

-- CreateIndex
CREATE INDEX "ejecucion_integracion_origen_idx" ON "ejecucion_integracion"("origen", "iniciada_en" DESC);

-- CreateIndex
CREATE INDEX "ejecucion_integracion_resultado_idx" ON "ejecucion_integracion"("resultado", "iniciada_en" DESC);

-- CreateIndex
CREATE INDEX "detalle_ejecucion_resultado_idx" ON "detalle_ejecucion"("id_ejecucion", "resultado", "fila");

-- CreateIndex
CREATE INDEX "detalle_ejecucion_historia_idx" ON "detalle_ejecucion"("id_historia");

-- CreateIndex
CREATE UNIQUE INDEX "detalle_ejecucion_fila_key" ON "detalle_ejecucion"("id_ejecucion", "fila");

-- AddForeignKey
ALTER TABLE "detalle_ejecucion" ADD CONSTRAINT "detalle_ejecucion_id_ejecucion_fkey" FOREIGN KEY ("id_ejecucion") REFERENCES "ejecucion_integracion"("id_ejecucion") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------------------------
-- Lo que Prisma no expresa (D94, D104, D111, D123). Se documenta en prisma/schema.prisma.
-- Se aplica con el rol `svc_integraciones` sobre el esquema `integraciones` (en la nube lo aplica
-- `postgres` con `set local search_path to integraciones;`). Sin llaves foráneas hacia otro esquema.
-- ---------------------------------------------------------------------------------------------

-- ------------------------------------------------------------------- configuracion_jira
-- Una sola fila. IV de 12 bytes y etiqueta de 16 (AES-256-GCM). No hay CHECK sobre `sitio_url`: lo valida
-- el servicio (D95), y las pruebas admiten http://127.0.0.1:<puerto> con INTEGRACIONES_PERMITIR_HOST_PRUEBA.
ALTER TABLE "configuracion_jira"
    ADD CONSTRAINT "configuracion_jira_unica_ck" CHECK ("id" = 1),
    ADD CONSTRAINT "configuracion_jira_iv_ck" CHECK (octet_length("token_iv") = 12),
    ADD CONSTRAINT "configuracion_jira_tag_ck" CHECK (octet_length("token_tag") = 16),
    ADD CONSTRAINT "configuracion_jira_estado_ck" CHECK ("estado_conexion" IN ('SIN_PROBAR', 'OK', 'FALLIDA')),
    ADD CONSTRAINT "configuracion_jira_proyecto_ck" CHECK ("proyecto_clave" ~ '^[A-Z][A-Z0-9_]{1,9}$');

-- --------------------------------------------------------------------- evento_configuracion
ALTER TABLE "evento_configuracion"
    ADD CONSTRAINT "evento_configuracion_campos_ck" CHECK (jsonb_typeof("campos_cambiados") = 'array');

-- ----------------------------------------------------------------- ejecucion_integracion
ALTER TABLE "ejecucion_integracion"
    ADD CONSTRAINT "ejecucion_origen_ck" CHECK ("origen" IN ('JIRA', 'CSV', 'JSON')),
    ADD CONSTRAINT "ejecucion_resultado_ck" CHECK ("resultado" IN ('EN_CURSO', 'EXITOSA', 'CON_ERRORES', 'INCOMPLETA', 'FALLIDA', 'INTERRUMPIDA')),
    ADD CONSTRAINT "ejecucion_cierre_ck" CHECK (("resultado" = 'EN_CURSO') = ("terminada_en" IS NULL)),
    -- La suma de los cuatro contadores es igual a `leidas` al cerrar (D103).
    ADD CONSTRAINT "ejecucion_contadores_ck" CHECK ("terminada_en" IS NULL OR "creadas" + "actualizadas" + "omitidas" + "con_error" = "leidas"),
    ADD CONSTRAINT "ejecucion_contadores_positivos_ck" CHECK ("leidas" >= 0 AND "creadas" >= 0 AND "actualizadas" >= 0 AND "omitidas" >= 0 AND "con_error" >= 0 AND "con_advertencias" >= 0 AND "reintentos_429" >= 0),
    -- Un archivo guarda su nombre, su tamaño y su huella SHA-256; nunca su contenido (D104).
    ADD CONSTRAINT "ejecucion_archivo_ck" CHECK ("origen" = 'JIRA' OR ("archivo_nombre" IS NOT NULL AND "archivo_tamano" IS NOT NULL AND "archivo_huella" ~ '^[0-9a-f]{64}$')),
    -- Solo Jira continúa desde una clave (D96, D118).
    ADD CONSTRAINT "ejecucion_continuar_ck" CHECK ("origen" = 'JIRA' OR ("hay_mas" = false AND "continuar_desde" IS NULL));

-- Una sola ejecución activa (D104): un segundo INSERT con `terminada_en` nulo viola este índice (409 INTEGRACION_EN_CURSO).
CREATE UNIQUE INDEX "ejecucion_en_curso_key" ON "ejecucion_integracion" ((true)) WHERE "terminada_en" IS NULL;

-- Una ejecución cerrada no se modifica, y nunca cambian su identidad, su fuente, su actor ni su inicio.
CREATE FUNCTION "ejecucion_cerrada_inmutable_fn"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF OLD."terminada_en" IS NOT NULL THEN
        RAISE EXCEPTION 'La ejecución % está cerrada y no se puede modificar', OLD."id_ejecucion" USING ERRCODE = '23001';
    END IF;
    IF NEW."id_ejecucion" IS DISTINCT FROM OLD."id_ejecucion"
        OR NEW."origen" IS DISTINCT FROM OLD."origen"
        OR NEW."actor_id" IS DISTINCT FROM OLD."actor_id"
        OR NEW."actor_nombre" IS DISTINCT FROM OLD."actor_nombre"
        OR NEW."actor_rol" IS DISTINCT FROM OLD."actor_rol"
        OR NEW."iniciada_en" IS DISTINCT FROM OLD."iniciada_en" THEN
        RAISE EXCEPTION 'La identidad de la ejecución % no se puede modificar', OLD."id_ejecucion" USING ERRCODE = '23001';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER "ejecucion_cerrada_inmutable" BEFORE UPDATE ON "ejecucion_integracion"
    FOR EACH ROW EXECUTE FUNCTION "ejecucion_cerrada_inmutable_fn"();

-- ------------------------------------------------------------------- detalle_ejecucion
ALTER TABLE "detalle_ejecucion"
    ADD CONSTRAINT "detalle_resultado_ck" CHECK ("resultado" IN ('CREADA', 'ACTUALIZADA', 'OMITIDA', 'ERROR')),
    ADD CONSTRAINT "detalle_motivo_ck" CHECK (("resultado" IN ('OMITIDA', 'ERROR')) = ("motivo" IS NOT NULL)),
    ADD CONSTRAINT "detalle_historia_ck" CHECK ("resultado" NOT IN ('CREADA', 'ACTUALIZADA') OR "id_historia" IS NOT NULL);

-- No se agregan filas a una ejecución cerrada.
CREATE FUNCTION "detalle_solo_en_curso_fn"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM "ejecucion_integracion"
        WHERE "id_ejecucion" = NEW."id_ejecucion" AND "terminada_en" IS NOT NULL
    ) THEN
        RAISE EXCEPTION 'La ejecución % está cerrada: no admite más filas de detalle', NEW."id_ejecucion" USING ERRCODE = '23001';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER "detalle_solo_en_curso" BEFORE INSERT ON "detalle_ejecucion"
    FOR EACH ROW EXECUTE FUNCTION "detalle_solo_en_curso_fn"();

-- --------------------------------------------------------------------------- permisos
-- No hay borrados físicos y el historial es de solo inserción (D104, D111). Funciona aunque
-- `svc_integraciones` sea el dueño de la tabla (local). E5-B01-T12 y E5-B04-T10 esperan 42501 o el
-- error del disparador.
REVOKE DELETE ON "configuracion_jira" FROM svc_integraciones;
REVOKE UPDATE, DELETE ON "evento_configuracion" FROM svc_integraciones;
REVOKE DELETE ON "ejecucion_integracion" FROM svc_integraciones;
REVOKE UPDATE, DELETE ON "detalle_ejecucion" FROM svc_integraciones;
-- Ni vaciar las tablas de historial (TRUNCATE no pasa por los disparadores). En la nube el rol no lo recibe nunca.
REVOKE TRUNCATE ON "evento_configuracion", "ejecucion_integracion", "detalle_ejecucion" FROM svc_integraciones;
