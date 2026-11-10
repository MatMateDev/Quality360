-- Quality360 · Organización · E6 (D173-D175, D189).
-- Se aplica con el rol `svc_organizacion` sobre el esquema `organizacion`
-- (en la nube lo aplica `postgres` con `set local search_path to organizacion;`).
-- Cierre con excepción: constancia inmutable por HDU. Sin columna nueva en
-- `historia_usuario` (`cierreParcial` se deriva con EXISTS) y sin llaves
-- foráneas hacia otro esquema.

-- --------------------------------------------------------------------- cierre_hdu
CREATE TABLE "cierre_hdu" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "id_historia" UUID NOT NULL,
    "aprobados" SMALLINT NOT NULL,
    "pendientes" TEXT[] NOT NULL,
    "justificacion" VARCHAR(500) NOT NULL,
    "actor_id" TEXT NOT NULL,
    "actor_nombre" TEXT NOT NULL,
    "actor_rol" VARCHAR(30) NOT NULL,
    "fecha" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),

    CONSTRAINT "cierre_hdu_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "cierre_hdu_aprobados_ck" CHECK ("aprobados" BETWEEN 0 AND 9),
    -- aprobados + pendientes = 10 (los diez entregables de D15).
    CONSTRAINT "cierre_hdu_pendientes_ck" CHECK (cardinality("pendientes") = 10 - "aprobados"),
    CONSTRAINT "cierre_hdu_justificacion_ck" CHECK (char_length("justificacion") BETWEEN 20 AND 500)
);

-- Una constancia como máximo por HDU: el segundo de dos cierres simultáneos no puede insertar.
CREATE UNIQUE INDEX "cierre_hdu_id_historia_key" ON "cierre_hdu"("id_historia");

ALTER TABLE "cierre_hdu" ADD CONSTRAINT "cierre_hdu_id_historia_fkey"
    FOREIGN KEY ("id_historia") REFERENCES "historia_usuario"("id_historia") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Solo inserción (D175). Se impone con un disparador en vez de `REVOKE UPDATE, DELETE`: quitarle UPDATE al
-- dueño de la tabla (el rol de servicio, cuando migra con su propio rol) rompe la comprobación de la llave
-- foránea al borrar una HDU (`SELECT … FOR KEY SHARE` exige UPDATE), y la limpieza de las pruebas borra HDU.
-- El disparador falla igual para cualquier rol, dueño o no, y no afecta a `TRUNCATE` (limpieza de pruebas).
CREATE FUNCTION "cierre_hdu_solo_insercion"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'cierre_hdu es de solo inserción: % no está permitido', TG_OP USING ERRCODE = '42501';
END;
$$;

CREATE TRIGGER "cierre_hdu_inmutable" BEFORE UPDATE OR DELETE ON "cierre_hdu"
    FOR EACH ROW EXECUTE FUNCTION "cierre_hdu_solo_insercion"();

-- --------------------------------------------------------------------- auditoría
-- El valor nuevo no se usa en esta transacción.
ALTER TYPE "AccionAuditoria" ADD VALUE IF NOT EXISTS 'CERRAR_HDU_PARCIAL';
