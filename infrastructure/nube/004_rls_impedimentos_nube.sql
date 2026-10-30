-- Quality360 · RLS y permisos en las tablas de Impedimentos (Supabase en la nube)
--
-- Se aplica DESPUÉS de las migraciones de Prisma `20261012000000_modelo_datos` y
-- `20261026000000_e4_impedimentos_riesgo` de services/impedimentos, con
-- `set local search_path to impedimentos;`. Mismo criterio que 002 y 003: anon, authenticated y
-- service_role no tienen permisos sobre el esquema; solo svc_impedimentos tiene política. Toda
-- tabla nueva de Impedimentos debe sumarse aquí. Es idempotente.
do $$
declare t text;
begin
  foreach t in array array['impedimento', 'accion_impedimento', 'riesgo_hdu'] loop
    execute format('alter table impedimentos.%I enable row level security', t);
    if not exists (
      select 1 from pg_policies
      where schemaname = 'impedimentos' and tablename = t and policyname = 'servicio_impedimentos'
    ) then
      execute format(
        'create policy servicio_impedimentos on impedimentos.%I for all to svc_impedimentos using (true) with check (true)',
        t
      );
    end if;
  end loop;
end $$;

-- El historial es de solo inserción (D65, D70) y no hay borrados físicos. La migración ya lo
-- revoca, pero en la nube la aplica `postgres` y los privilegios por defecto vuelven a otorgarlos:
-- se repite aquí. E4-B04-T07 espera el error 42501.
revoke update, delete on impedimentos.accion_impedimento from svc_impedimentos;
revoke update, delete on impedimentos.riesgo_hdu from svc_impedimentos;
revoke delete on impedimentos.impedimento from svc_impedimentos;
