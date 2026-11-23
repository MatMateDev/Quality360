-- Quality360 · Integraciones · E5 OAuth con Jira (D209, D211, D214, D215, D217; ADR 0019).
-- Compatible con el código anterior: las columnas nuevas tienen valor por defecto y las que pasan a admitir nulos solo
-- quedan nulas con metodo = 'OAUTH', que el código anterior no escribe. Toda SQL se califica con "integraciones"
-- (DEF-E5C-05) y las funciones fijan su propio search_path.

-- ------------------------------------------------------------------- configuracion_jira
ALTER TABLE "integraciones"."configuracion_jira" ADD COLUMN "metodo" VARCHAR(9) NOT NULL DEFAULT 'API_TOKEN';

ALTER TABLE "integraciones"."configuracion_jira"
    ALTER COLUMN "correo" DROP NOT NULL,
    ALTER COLUMN "token_cifrado" DROP NOT NULL,
    ALTER COLUMN "token_iv" DROP NOT NULL,
    ALTER COLUMN "token_tag" DROP NOT NULL,
    ALTER COLUMN "token_ultimos4" DROP NOT NULL;

ALTER TABLE "integraciones"."configuracion_jira"
    ADD CONSTRAINT "configuracion_jira_metodo_ck" CHECK ("metodo" IN ('API_TOKEN', 'OAUTH')),
    ADD CONSTRAINT "configuracion_jira_metodo_credencial_ck" CHECK (
        ("metodo" = 'API_TOKEN' AND "correo" IS NOT NULL AND "token_cifrado" IS NOT NULL AND "token_iv" IS NOT NULL
            AND "token_tag" IS NOT NULL AND "token_ultimos4" IS NOT NULL)
        OR
        ("metodo" = 'OAUTH' AND "correo" IS NULL AND "token_cifrado" IS NULL AND "token_iv" IS NULL
            AND "token_tag" IS NULL AND "token_ultimos4" IS NULL)
    );

-- ------------------------------------------------------------------- conexion_oauth_jira (una sola fila)
CREATE TABLE "integraciones"."conexion_oauth_jira" (
    "id" SMALLINT NOT NULL DEFAULT 1,
    "estado" VARCHAR(20) NOT NULL,
    "cloud_id" VARCHAR(36),
    "sitio_url" VARCHAR(100),
    "sitio_nombre" VARCHAR(150),
    "sitios_candidatos" JSONB,
    "cuenta_id" VARCHAR(128),
    "cuenta_nombre" VARCHAR(150),
    "scopes_concedidos" VARCHAR(400) NOT NULL,
    "acceso_cifrado" BYTEA,
    "acceso_iv" BYTEA,
    "acceso_tag" BYTEA,
    "renovacion_cifrada" BYTEA,
    "renovacion_iv" BYTEA,
    "renovacion_tag" BYTEA,
    "acceso_expira_en" TIMESTAMPTZ(6),
    "renovado_en" TIMESTAMPTZ(6),
    "llave_version" SMALLINT NOT NULL DEFAULT 1,
    "conectado_por_id" UUID NOT NULL,
    "conectado_por_nombre" VARCHAR(150) NOT NULL,
    "conectado_en" TIMESTAMPTZ(6) NOT NULL,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),

    CONSTRAINT "conexion_oauth_jira_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "integraciones"."conexion_oauth_jira"
    ADD CONSTRAINT "conexion_oauth_unica_ck" CHECK ("id" = 1),
    ADD CONSTRAINT "conexion_oauth_estado_ck" CHECK ("estado" IN ('CONECTADA', 'PENDIENTE_SITIO', 'RECONEXION_NECESARIA')),
    ADD CONSTRAINT "conexion_oauth_cloud_ck" CHECK ("cloud_id" IS NULL OR "cloud_id" ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'),
    ADD CONSTRAINT "conexion_oauth_sitio_ck" CHECK ("sitio_url" IS NULL OR "sitio_url" ~ '^https://[a-z0-9][a-z0-9-]{0,62}\.atlassian\.net$'),
    ADD CONSTRAINT "conexion_oauth_candidatos_ck" CHECK (
        "sitios_candidatos" IS NULL
        OR (jsonb_typeof("sitios_candidatos") = 'array' AND jsonb_array_length("sitios_candidatos") BETWEEN 2 AND 50)
    ),
    ADD CONSTRAINT "conexion_oauth_iv_ck" CHECK (
        ("acceso_iv" IS NULL OR octet_length("acceso_iv") = 12) AND ("renovacion_iv" IS NULL OR octet_length("renovacion_iv") = 12)
    ),
    ADD CONSTRAINT "conexion_oauth_tag_ck" CHECK (
        ("acceso_tag" IS NULL OR octet_length("acceso_tag") = 16) AND ("renovacion_tag" IS NULL OR octet_length("renovacion_tag") = 16)
    ),
    -- Los seis bytea y el vencimiento son nulos si y solo si la conexión necesita reconexión.
    ADD CONSTRAINT "conexion_oauth_tokens_ck" CHECK (
        ("estado" = 'RECONEXION_NECESARIA') = (
            "acceso_cifrado" IS NULL AND "acceso_iv" IS NULL AND "acceso_tag" IS NULL
            AND "renovacion_cifrada" IS NULL AND "renovacion_iv" IS NULL AND "renovacion_tag" IS NULL
            AND "acceso_expira_en" IS NULL
        )
        AND (
            "estado" = 'RECONEXION_NECESARIA' OR (
                "acceso_cifrado" IS NOT NULL AND "acceso_iv" IS NOT NULL AND "acceso_tag" IS NOT NULL
                AND "renovacion_cifrada" IS NOT NULL AND "renovacion_iv" IS NOT NULL AND "renovacion_tag" IS NOT NULL
                AND "acceso_expira_en" IS NOT NULL
            )
        )
    ),
    ADD CONSTRAINT "conexion_oauth_pendiente_ck" CHECK (
        ("estado" = 'PENDIENTE_SITIO') = ("sitios_candidatos" IS NOT NULL)
        AND ("estado" <> 'PENDIENTE_SITIO' OR (
            "cloud_id" IS NULL AND "sitio_url" IS NULL AND "sitio_nombre" IS NULL AND "cuenta_id" IS NULL AND "cuenta_nombre" IS NULL
        ))
    ),
    ADD CONSTRAINT "conexion_oauth_conectada_ck" CHECK (
        "estado" <> 'CONECTADA' OR (
            "cloud_id" IS NOT NULL AND "sitio_url" IS NOT NULL AND "sitio_nombre" IS NOT NULL
            AND "cuenta_id" IS NOT NULL AND "cuenta_nombre" IS NOT NULL
        )
    );

-- ------------------------------------------------------------------- oauth_estado_jira
CREATE TABLE "integraciones"."oauth_estado_jira" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "estado_hash" CHAR(64) NOT NULL,
    "actor_id" UUID NOT NULL,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    "expira_en" TIMESTAMPTZ(6) NOT NULL,
    "usado_en" TIMESTAMPTZ(6),

    CONSTRAINT "oauth_estado_jira_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "oauth_estado_jira_estado_hash_key" ON "integraciones"."oauth_estado_jira"("estado_hash");

ALTER TABLE "integraciones"."oauth_estado_jira"
    ADD CONSTRAINT "oauth_estado_hash_ck" CHECK ("estado_hash" ~ '^[0-9a-f]{64}$'),
    ADD CONSTRAINT "oauth_estado_vigencia_ck" CHECK ("expira_en" > "creado_en");

-- Solo deja pasar `usado_en` de nulo a una fecha, una vez. Cualquier otro cambio lanza 23001 (como los de E5).
CREATE FUNCTION "integraciones"."oauth_estado_solo_consumo_fn"() RETURNS trigger LANGUAGE plpgsql
    SET search_path = integraciones, pg_catalog AS $$
BEGIN
    IF OLD."usado_en" IS NULL AND NEW."usado_en" IS NOT NULL
       AND NEW."id" = OLD."id" AND NEW."estado_hash" = OLD."estado_hash" AND NEW."actor_id" = OLD."actor_id"
       AND NEW."creado_en" = OLD."creado_en" AND NEW."expira_en" = OLD."expira_en" THEN
        RETURN NEW;
    END IF;
    RAISE EXCEPTION 'oauth_estado_jira solo admite marcar usado_en una vez' USING ERRCODE = '23001';
END;
$$;

CREATE TRIGGER "oauth_estado_solo_consumo" BEFORE UPDATE ON "integraciones"."oauth_estado_jira"
    FOR EACH ROW EXECUTE FUNCTION "integraciones"."oauth_estado_solo_consumo_fn"();

-- ------------------------------------------------------------------- evento_oauth_jira (solo inserción)
CREATE TABLE "integraciones"."evento_oauth_jira" (
    "id_evento" UUID NOT NULL DEFAULT gen_random_uuid(),
    "fecha" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    "actor_id" UUID NOT NULL,
    "actor_nombre" VARCHAR(150) NOT NULL,
    "tipo" VARCHAR(20) NOT NULL,
    "sitio_nombre" VARCHAR(150),
    "cuenta_nombre" VARCHAR(150),
    "codigo" VARCHAR(40),

    CONSTRAINT "evento_oauth_jira_pkey" PRIMARY KEY ("id_evento")
);

CREATE INDEX "evento_oauth_jira_fecha_idx" ON "integraciones"."evento_oauth_jira"("fecha" DESC);

ALTER TABLE "integraciones"."evento_oauth_jira"
    ADD CONSTRAINT "evento_oauth_tipo_ck" CHECK ("tipo" IN ('CONECTAR_OAUTH', 'RECONECTAR', 'DESCONECTAR', 'REFRESCO_FALLIDO')),
    ADD CONSTRAINT "evento_oauth_codigo_ck" CHECK (
        ("codigo" IS NULL OR "codigo" ~ '^[A-Z_]{3,40}$') AND (("tipo" = 'REFRESCO_FALLIDO') = ("codigo" IS NOT NULL))
    );

-- ------------------------------------------------------------------- permisos
REVOKE TRUNCATE ON "integraciones"."conexion_oauth_jira" FROM svc_integraciones;
REVOKE TRUNCATE ON "integraciones"."oauth_estado_jira" FROM svc_integraciones;
REVOKE UPDATE, DELETE, TRUNCATE ON "integraciones"."evento_oauth_jira" FROM svc_integraciones;
