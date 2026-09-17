-- Quality360 · Certificaciones E3 en Supabase nube: RLS y buckets privados.
--
-- Se aplica DESPUÉS de la migración de Prisma `20260917000000_checklist_e3`
-- (services/certificaciones/prisma/migrations), con `set local search_path to certificaciones;`.
-- Es idempotente.
--
-- 1. RLS como defensa en profundidad, igual que 002 en Organización: anon,
--    authenticated y service_role no tienen permisos sobre el esquema; solo
--    svc_certificaciones tiene política. Toda tabla nueva de Certificaciones debe sumarse aquí.
do $$
declare t text;
begin
  foreach t in array array['entregable', 'evento_checklist', 'certificado'] loop
    execute format('alter table certificaciones.%I enable row level security', t);
    if not exists (
      select 1 from pg_policies
      where schemaname = 'certificaciones' and tablename = t and policyname = 'servicio_certificaciones'
    ) then
      execute format(
        'create policy servicio_certificaciones on certificaciones.%I for all to svc_certificaciones using (true) with check (true)',
        t
      );
    end if;
  end loop;
end $$;

-- La bitácora es de solo inserción (D22): el servicio no puede modificarla ni borrarla.
revoke update, delete on certificaciones.evento_checklist from svc_certificaciones;

-- 2. Buckets privados de Storage (D20). Sin políticas para anon ni authenticated:
--    solo Certificaciones (clave secreta) firma subidas y descargas.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('evidencias', 'evidencias', false, 10485760, array['application/pdf', 'image/png', 'image/jpeg']),
  ('certificados', 'certificados', false, 5242880, array['application/pdf'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
