-- Quality360 · RLS y permisos de la conexión OAuth con Jira en la nube · E5 OAuth (D211, D214, D217, ADR 0019)
--
-- Se aplica DESPUÉS de la migración de Prisma `20261122000000_e5_oauth_jira` de services/integraciones,
-- con `set local search_path to integraciones;`. Mismo criterio que 005 y 006: anon, authenticated y
-- service_role no tienen permisos ni políticas; solo svc_integraciones tiene política. Es idempotente.
-- La migración es compatible con el código anterior (columnas nuevas con valor por defecto, tablas que el
-- código anterior no usa): se puede aplicar antes de publicar el código nuevo.
--
-- Comprobación posterior (la lista entera debe fallar con 42501):
--   set role anon; select count(*) from integraciones.conexion_oauth_jira;
--   set role anon; select count(*) from integraciones.oauth_estado_jira;
--   set role anon; select count(*) from integraciones.evento_oauth_jira;
-- Y que el servicio no puede vaciar ni reescribir la auditoría:
--   set role svc_integraciones; delete from integraciones.evento_oauth_jira;   -- 42501
do $$
declare t text;
begin
  foreach t in array array['conexion_oauth_jira', 'oauth_estado_jira', 'evento_oauth_jira'] loop
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

-- La auditoría de la conexión es de solo inserción (D217). `conexion_oauth_jira` conserva el DELETE
-- (desconectar y el cambio a API token borran la única fila) y `oauth_estado_jira` también (purga de los
-- estados de más de 1 día, D211). Nada se vacía con TRUNCATE, que no pasa por los disparadores.
-- La migración ya lo revoca, pero en la nube los privilegios por defecto vuelven a otorgarlos: se repite aquí.
revoke update, delete, truncate on integraciones.evento_oauth_jira from svc_integraciones;
revoke truncate on integraciones.conexion_oauth_jira from svc_integraciones;
revoke truncate on integraciones.oauth_estado_jira from svc_integraciones;
-- `configuracion_jira` sigue sin DELETE (005); la migración solo le suma `metodo` y vuelve opcionales
-- las columnas del API token.
revoke delete, truncate on integraciones.configuracion_jira from svc_integraciones;
