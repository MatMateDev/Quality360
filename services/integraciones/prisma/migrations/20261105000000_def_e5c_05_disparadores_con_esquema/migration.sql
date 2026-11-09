-- DEF-E5C-05 · Dos funciones de disparador nombraban tablas sin esquema ("consulta_jira", "ejecucion_integracion").
-- Tras el pooler de Supabase (modo transacción) el search_path de la conexión no llega al backend y fallaban con 42P01.
-- Se fija el search_path de la propia función; no depende de la conexión ni de un `ALTER ROLE ... SET search_path`.
-- Migración nueva: las anteriores no se modifican.
ALTER FUNCTION "item_solo_consulta_abierta_fn"() SET search_path = integraciones, pg_catalog;
ALTER FUNCTION "detalle_solo_en_curso_fn"() SET search_path = integraciones, pg_catalog;
