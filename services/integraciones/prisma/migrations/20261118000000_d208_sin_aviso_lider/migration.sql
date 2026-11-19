-- D208: se retiró el rol Líder QA y, con él, el aviso «célula sin Líder» de la consulta (E5-F05).
-- item_asignacion_ck nombra la columna y PostgreSQL la borraría junto con ella: se reemplaza por la misma regla
-- sin la columna antes de quitarla. Se puede ejecutar más de una vez.
ALTER TABLE "integraciones"."consulta_item" DROP CONSTRAINT IF EXISTS "item_asignacion_ck";
ALTER TABLE "integraciones"."consulta_item" DROP COLUMN IF EXISTS "aviso_sin_lider";
ALTER TABLE "integraciones"."consulta_item" ADD CONSTRAINT "item_asignacion_ck" CHECK ("grupo" = 'NUEVA' OR (
    "celula_id" IS NULL AND "qe_id" IS NULL AND "analista_id" IS NULL AND "sprint_id" IS NULL
    AND "celula_nombre" IS NULL AND "qe_nombre" IS NULL AND "analista_nombre" IS NULL AND "sprint_nombre" IS NULL
    AND "sprint_origen" IS NULL
    AND "asignado_por_id" IS NULL AND "asignado_por_nombre" IS NULL AND "asignado_en" IS NULL));
