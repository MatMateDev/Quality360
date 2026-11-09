-- Quality360 · RLS y permisos de la consulta de Jira en la nube · E5 consulta y asignación (D133, D151)
--
-- Se aplica DESPUÉS de la migración de Prisma `20261102000000_e5_consulta_asignacion` de services/integraciones,
-- con `set local search_path to integraciones;`. Mismo criterio que 005: anon, authenticated y service_role no
-- tienen permisos ni políticas; solo svc_integraciones tiene política. Es idempotente.
--
-- Comprobación posterior (E5-B05-T35): el rol anónimo no lee ninguna de las dos tablas.
--   set role anon; select count(*) from integraciones.consulta_jira;   -- debe fallar con 42501
do $$
declare t text;
begin
  foreach t in array array['consulta_jira', 'consulta_item'] loop
    execute format('alter table integraciones.%I enable row level security', t);
    if not exists (
      select 1 from pg_policies
      where schemaname = 'integraciones' and tablename = t and policyname = 'servicio_integraciones'
    ) then
      execute format(
        'create policy servicio_integraciones on integraciones.%I for all to svc_integraciones using (true) with check (true)',
        t
      );
    end if;
    execute format('revoke all on integraciones.%I from anon, authenticated, service_role', t);
  end loop;
end $$;

-- Una consulta no se borra y nada se vacía. `consulta_item` conserva el DELETE: es la purga (D133).
-- La migración ya lo revoca, pero en la nube los privilegios por defecto vuelven a otorgarlos.
revoke delete, truncate on integraciones.consulta_jira from svc_integraciones;
revoke truncate on integraciones.consulta_item from svc_integraciones;
