-- Quality360 · RLS en las tablas de Impedimentos (Supabase en la nube)
--
-- Se aplica DESPUÉS de la migración de Prisma `20261012000000_modelo_datos` de
-- services/impedimentos, con `set local search_path to impedimentos;`. Mismo criterio
-- que 002 y 003: anon, authenticated y service_role no tienen permisos sobre el esquema;
-- solo svc_impedimentos tiene política. Toda tabla nueva de Impedimentos debe sumarse aquí.
-- Es idempotente.
do $$
declare t text;
begin
  foreach t in array array['impedimento', 'accion_impedimento'] loop
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
