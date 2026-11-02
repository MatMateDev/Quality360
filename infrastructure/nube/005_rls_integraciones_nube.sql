-- Quality360 · RLS y permisos en las tablas de Integraciones (Supabase en la nube) · E5 (D123, D128)
--
-- Se aplica DESPUÉS de la migración de Prisma `20261029000000_e5_integracion_jira` de services/integraciones,
-- con `set local search_path to integraciones;`. Mismo criterio que 002, 003 y 004: anon, authenticated y
-- service_role no tienen permisos ni políticas sobre el esquema (la Data API no expone estas tablas);
-- solo svc_integraciones tiene política. Toda tabla nueva de Integraciones debe sumarse aquí. Es idempotente.
do $$
declare t text;
begin
  foreach t in array array['configuracion_jira', 'evento_configuracion', 'ejecucion_integracion', 'detalle_ejecucion'] loop
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
  end loop;
end $$;

-- Historial de solo inserción y sin borrados físicos (D104, D111). La migración ya lo revoca, pero en la
-- nube la aplica `postgres` y los privilegios por defecto vuelven a otorgarlos: se repite aquí.
-- E5-B01-T12 y E5-B04-T10 esperan 42501 o el error del disparador.
revoke delete on integraciones.configuracion_jira from svc_integraciones;
revoke update, delete, truncate on integraciones.evento_configuracion from svc_integraciones;
revoke delete, truncate on integraciones.ejecucion_integracion from svc_integraciones;
revoke update, delete, truncate on integraciones.detalle_ejecucion from svc_integraciones;
