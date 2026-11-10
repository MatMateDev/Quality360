-- Quality360 · Indicadores · E6 (D161, D162, D164, D183, D184, D193).
-- Se aplica con el rol `svc_indicadores` sobre el esquema `indicadores`
-- (en la nube lo aplica `postgres` con `set local search_path to indicadores;`).
-- Sin llaves foráneas hacia otro esquema: célula, sprint, QE y actor son UUID de Organización.

-- ------------------------------------------------------------ ejecucion_snapshot
CREATE TABLE "ejecucion_snapshot" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "fecha" DATE NOT NULL,
    "origen" VARCHAR(10) NOT NULL,
    "actor_id" UUID,
    "actor_nombre" VARCHAR(150) NOT NULL,
    "inicio" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    "fin" TIMESTAMPTZ(6),
    "resultado" VARCHAR(10) NOT NULL,
    "filas_escritas" INTEGER NOT NULL DEFAULT 0,
    "filas_nuevas" INTEGER NOT NULL DEFAULT 0,
    "filas_actualizadas" INTEGER NOT NULL DEFAULT 0,
    "motivo" VARCHAR(60),

    CONSTRAINT "ejecucion_snapshot_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ejecucion_origen_ck" CHECK ("origen" IN ('CRON', 'MANUAL')),
    CONSTRAINT "ejecucion_resultado_ck" CHECK ("resultado" IN ('EN_CURSO', 'EXITOSA', 'FALLIDA')),
    CONSTRAINT "ejecucion_motivo_ck" CHECK (
        "motivo" IS NULL OR "motivo" IN (
            'ORGANIZACION_NO_DISPONIBLE', 'CERTIFICACIONES_NO_DISPONIBLE', 'IMPEDIMENTOS_NO_DISPONIBLE',
            'EXCEDE_TOPE', 'ERROR_INTERNO', 'CONFIGURACION_INVALIDA', 'INTERRUMPIDA'
        )
    ),
    -- Una ejecución cerrada tiene `fin`; una en curso no. El motivo solo existe si falló.
    CONSTRAINT "ejecucion_cierre_ck" CHECK (("resultado" = 'EN_CURSO') = ("fin" IS NULL)),
    CONSTRAINT "ejecucion_motivo_fallida_ck" CHECK (("motivo" IS NOT NULL) = ("resultado" = 'FALLIDA')),
    CONSTRAINT "ejecucion_filas_ck" CHECK (
        "filas_nuevas" >= 0 AND "filas_actualizadas" >= 0 AND "filas_escritas" = "filas_nuevas" + "filas_actualizadas"
    ),
    -- Una fallida no escribe nada (todo o nada, D164).
    CONSTRAINT "ejecucion_fallida_sin_filas_ck" CHECK ("resultado" <> 'FALLIDA' OR "filas_escritas" = 0)
);

-- Una sola ejecución a la vez (D164): la segunda simultánea viola este índice y recibe 409 EJECUCION_EN_CURSO.
CREATE UNIQUE INDEX "ejecucion_en_curso_key" ON "ejecucion_snapshot"("resultado") WHERE "resultado" = 'EN_CURSO';
CREATE INDEX "ejecucion_inicio_idx" ON "ejecucion_snapshot"("inicio" DESC);

-- ---------------------------------------------------------- snapshot_indicadores
CREATE TABLE "snapshot_indicadores" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "fecha" DATE NOT NULL,
    "id_celula" UUID NOT NULL,
    "celula_nombre" VARCHAR(150) NOT NULL,
    "id_sprint" UUID NOT NULL,
    "sprint_nombre" VARCHAR(150) NOT NULL,
    "sprint_inicio" DATE NOT NULL,
    "sprint_fin" DATE NOT NULL,
    "ambito" VARCHAR(40) NOT NULL,
    "hdu_total" INTEGER NOT NULL,
    "certificadas" INTEGER NOT NULL,
    "cerradas_excepcion" INTEGER NOT NULL,
    "en_curso" INTEGER NOT NULL,
    "sin_iniciar" INTEGER NOT NULL,
    "bloqueadas" INTEGER NOT NULL,
    "suma_avance" INTEGER NOT NULL,
    "cumplimiento_promedio" DECIMAL(5,1),
    "hdu_riesgo_alto" INTEGER NOT NULL,
    "hdu_riesgo_medio" INTEGER NOT NULL,
    "impedimentos_abiertos" INTEGER NOT NULL,
    "impedimentos_escalados" INTEGER NOT NULL,
    "semaforo" VARCHAR(10) NOT NULL,
    "id_ejecucion" UUID NOT NULL,
    "generado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),

    CONSTRAINT "snapshot_indicadores_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "snapshot_ambito_ck" CHECK ("ambito" = 'TODOS' OR "ambito" ~ '^QE:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'),
    CONSTRAINT "snapshot_semaforo_ck" CHECK ("semaforo" IN ('ROJO', 'AMARILLO', 'VERDE')),
    CONSTRAINT "snapshot_enteros_ck" CHECK (
        "hdu_total" >= 0 AND "certificadas" >= 0 AND "cerradas_excepcion" >= 0 AND "en_curso" >= 0 AND "sin_iniciar" >= 0
        AND "bloqueadas" >= 0 AND "suma_avance" >= 0 AND "hdu_riesgo_alto" >= 0 AND "hdu_riesgo_medio" >= 0
        AND "impedimentos_abiertos" >= 0 AND "impedimentos_escalados" >= 0
    ),
    -- Las cuatro categorías son excluyentes y suman el total (D155).
    CONSTRAINT "snapshot_suma_ck" CHECK ("hdu_total" = "certificadas" + "cerradas_excepcion" + "en_curso" + "sin_iniciar"),
    CONSTRAINT "snapshot_promedio_ck" CHECK ("cumplimiento_promedio" IS NULL OR "cumplimiento_promedio" BETWEEN 0 AND 100)
);

-- Idempotencia (D164): escribir es upsert sobre esta clave.
CREATE UNIQUE INDEX "snapshot_clave_key" ON "snapshot_indicadores"("fecha", "id_celula", "id_sprint", "ambito");
CREATE INDEX "snapshot_ambito_sprint_fecha_idx" ON "snapshot_indicadores"("ambito", "id_sprint", "fecha");

ALTER TABLE "snapshot_indicadores" ADD CONSTRAINT "snapshot_ejecucion_fkey"
    FOREIGN KEY ("id_ejecucion") REFERENCES "ejecucion_snapshot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ------------------------------------------------------------------ umbral_carga
CREATE TABLE "umbral_carga" (
    "id_qe" UUID NOT NULL,
    "valor" SMALLINT NOT NULL,
    "actualizado_por" UUID NOT NULL,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),

    CONSTRAINT "umbral_carga_pkey" PRIMARY KEY ("id_qe"),
    CONSTRAINT "umbral_valor_ck" CHECK ("valor" BETWEEN 1 AND 50)
);

-- ------------------------------------------------------------ evento_umbral_carga
CREATE TABLE "evento_umbral_carga" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "id_qe" UUID NOT NULL,
    "valor_anterior" SMALLINT NOT NULL,
    "valor_nuevo" SMALLINT NOT NULL,
    "actor_id" UUID NOT NULL,
    "actor_nombre" VARCHAR(150) NOT NULL,
    "fecha" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),

    CONSTRAINT "evento_umbral_carga_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "evento_umbral_valores_ck" CHECK (
        "valor_anterior" BETWEEN 1 AND 50 AND "valor_nuevo" BETWEEN 1 AND 50 AND "valor_anterior" <> "valor_nuevo"
    )
);

CREATE INDEX "evento_umbral_qe_fecha_idx" ON "evento_umbral_carga"("id_qe", "fecha" DESC);

-- ----------------------------------------------------------- privilegios mínimos
-- Las filas del snapshot y de las ejecuciones no se borran nunca; el historial del umbral es de solo inserción.
REVOKE DELETE ON "snapshot_indicadores" FROM svc_indicadores;
REVOKE DELETE ON "ejecucion_snapshot" FROM svc_indicadores;
REVOKE UPDATE, DELETE ON "evento_umbral_carga" FROM svc_indicadores;
REVOKE TRUNCATE ON "snapshot_indicadores", "ejecucion_snapshot", "evento_umbral_carga", "umbral_carga" FROM svc_indicadores;
