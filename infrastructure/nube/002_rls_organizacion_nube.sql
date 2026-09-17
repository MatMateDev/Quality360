-- Quality360 · RLS en las tablas de Organización (Supabase en la nube)
--
-- Defensa en profundidad. anon, authenticated y service_role ya no tienen permisos sobre el
-- esquema organizacion (001_esquemas_roles_nube.sql); con RLS activo, aunque alguien les
-- otorgara un permiso por error, no verían filas. Solo svc_organizacion tiene política.
--
-- En la nube las tablas pertenecen a postgres (las migraciones se aplican por MCP), así que
-- svc_organizacion no es dueño y necesita esta política para seguir leyendo y escribiendo.
-- Toda tabla nueva que agregue una migración de Organización debe incluirse aquí.
-- Es idempotente.

do $$
declare t text;
begin
  foreach t in array array[
    'usuario', 'supervision', 'celula', 'sprint', 'hdu',
    'hdu_historial_estado', 'hdu_historial_asignacion', 'auditoria'
  ] loop
    execute format('alter table organizacion.%I enable row level security', t);
    if not exists (
      select 1 from pg_policies
      where schemaname = 'organizacion' and tablename = t and policyname = 'servicio_organizacion'
    ) then
      execute format(
        'create policy servicio_organizacion on organizacion.%I for all to svc_organizacion using (true) with check (true)',
        t
      );
    end if;
  end loop;
end $$;
