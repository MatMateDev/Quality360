-- Quality360 · Organización · D208: se retira el rol Líder QA (2026-11-18).
--
--   1. Un usuario que aún tenga el rol LIDER_QA pasa a AUDITOR desactivado: conserva su
--      registro y su rastro, y no entra hasta que un Administrador lo active. El cambio queda
--      en la auditoría como CAMBIAR_ROL hecho por el servicio.
--   2. Sale LIDER_QA del catálogo de roles.
--   3. Se elimina celula_lider con sus índices y llaves. El historial de asignaciones queda en
--      la auditoría (ASIGNAR_CELULAS_LIDER se conserva en el enum para esos registros).
--
-- Es idempotente: en una base sin el rol ni la tabla no cambia nada.
-- Se aplica con el rol `svc_organizacion` sobre el esquema `organizacion`.

-- 1. Usuarios con el rol retirado -------------------------------------------------
WITH retirados AS (
    SELECT u."id_usuario", u."activo"
    FROM "usuario" u
    JOIN "rol" r ON r."id_rol" = u."id_rol"
    WHERE r."nombre" = 'LIDER_QA'
), auditados AS (
    INSERT INTO "auditoria" ("id", "actor_tipo", "actor_id", "actor_nombre", "entidad", "entidad_id", "accion", "antes", "despues", "motivo")
    SELECT gen_random_uuid(), 'SERVICIO', 'migracion-d208', 'Migración D208', 'USUARIO', "id_usuario", 'CAMBIAR_ROL',
           jsonb_build_object('rol', 'LIDER_QA', 'activo', "activo"),
           jsonb_build_object('rol', 'AUDITOR', 'activo', false),
           'D208: se retiró el rol Líder QA'
    FROM retirados
)
UPDATE "usuario"
SET "id_rol" = (SELECT "id_rol" FROM "rol" WHERE "nombre" = 'AUDITOR'),
    "activo" = false,
    "actualizado_en" = now()
WHERE "id_usuario" IN (SELECT "id_usuario" FROM retirados);

-- 2. Catálogo de roles -------------------------------------------------------------
DELETE FROM "rol" WHERE "nombre" = 'LIDER_QA';

-- 3. celula_lider -------------------------------------------------------------------
DROP TABLE IF EXISTS "celula_lider";
