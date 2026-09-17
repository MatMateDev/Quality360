-- Quality360 · Esquemas y roles para el proyecto Supabase en la nube
--
-- Igual que infrastructure/db/001_esquemas_roles.sql, pero los roles se crean SIN contraseña:
-- no pueden conectarse hasta que alguien les asigne una en el SQL Editor de Supabase
-- (ver GUIA-RENDER.md). Así ninguna credencial de producción queda en el repositorio.
-- Es idempotente: se puede ejecutar más de una vez.

begin;

create schema if not exists organizacion;
create schema if not exists certificaciones;
create schema if not exists impedimentos;
create schema if not exists integraciones;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'svc_organizacion') then
    create role svc_organizacion login;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'svc_certificaciones') then
    create role svc_certificaciones login;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'svc_impedimentos') then
    create role svc_impedimentos login;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'svc_integraciones') then
    create role svc_integraciones login;
  end if;
end
$$;

grant connect on database postgres to
  svc_organizacion, svc_certificaciones, svc_impedimentos, svc_integraciones;

-- Ningún esquema de servicio se expone a la Data API ni a los roles de Supabase.
revoke all on schema organizacion, certificaciones, impedimentos, integraciones
  from public, anon, authenticated, service_role;

grant usage, create on schema organizacion to svc_organizacion;
grant usage, create on schema certificaciones to svc_certificaciones;
grant usage, create on schema impedimentos to svc_impedimentos;
grant usage, create on schema integraciones to svc_integraciones;

-- Las migraciones en la nube se aplican con el rol postgres (MCP de Supabase, D13):
-- cada servicio recibe lectura y escritura sobre las tablas que postgres cree en su esquema.
alter default privileges for role postgres in schema organizacion
  grant select, insert, update, delete on tables to svc_organizacion;
alter default privileges for role postgres in schema organizacion
  grant usage, select on sequences to svc_organizacion;
alter default privileges for role postgres in schema certificaciones
  grant select, insert, update, delete on tables to svc_certificaciones;
alter default privileges for role postgres in schema certificaciones
  grant usage, select on sequences to svc_certificaciones;
alter default privileges for role postgres in schema impedimentos
  grant select, insert, update, delete on tables to svc_impedimentos;
alter default privileges for role postgres in schema impedimentos
  grant usage, select on sequences to svc_impedimentos;
alter default privileges for role postgres in schema integraciones
  grant select, insert, update, delete on tables to svc_integraciones;
alter default privileges for role postgres in schema integraciones
  grant usage, select on sequences to svc_integraciones;

-- Aislamiento: ningún rol alcanza el esquema de otro servicio.
revoke all on schema certificaciones, impedimentos, integraciones from svc_organizacion;
revoke all on schema organizacion, impedimentos, integraciones from svc_certificaciones;
revoke all on schema organizacion, certificaciones, integraciones from svc_impedimentos;
revoke all on schema organizacion, certificaciones, impedimentos from svc_integraciones;

commit;
