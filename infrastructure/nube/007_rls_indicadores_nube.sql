-- Quality360 · Esquema, rol y RLS de Indicadores (Supabase en la nube) · E6 (D194)
--
-- Es el primer paso del despliegue de Indicadores y se ejecuta en el SQL Editor como `postgres`.
-- Si el esquema y el rol no existen los crea (el rol SIN contraseña: no puede conectarse hasta que
-- alguien le asigne una con `alter role svc_indicadores with password '...'`, sin dejarla en el repo).
-- Después se aplica la migración de Prisma `20261104000000_e6_indicadores` de services/indicadores,
-- con `set local search_path to indicadores;`.
--
-- Mismo criterio que 002 a 006: anon, authenticated y service_role no tienen permisos ni políticas
-- sobre el esquema (la Data API no lo expone); solo svc_indicadores tiene una política por tabla.
-- Es idempotente y tolera que las tablas aún no existan: puede ejecutarse antes de la migración (crea
-- esquema y rol) y de nuevo después (habilita RLS y aplica los REVOKE). Toda tabla nueva de
-- Indicadores queda cubierta sin editar este archivo, porque se recorren las tablas del esquema.

begin;

create schema if not exists indicadores;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'svc_indicadores') then
    create role svc_indicadores login;
  end if;
end
$$;

grant connect on database postgres to svc_indicadores;

-- Ni PUBLIC ni los roles de la Data API alcanzan el esquema.
revoke all on schema indicadores from public, anon, authenticated, service_role;

grant usage, create on schema indicadores to svc_indicadores;

-- Las migraciones en la nube las aplica `postgres` (D13): el servicio recibe lectura y escritura
-- sobre las tablas que postgres cree en su esquema. Los REVOKE de más abajo recortan las de solo inserción.
alter default privileges for role postgres in schema indicadores
  grant select, insert, update, delete on tables to svc_indicadores;
alter default privileges for role postgres in schema indicadores
  grant usage, select on sequences to svc_indicadores;

-- Aislamiento: ningún otro servicio alcanza el esquema de Indicadores, ni Indicadores el de otros.
do $$
declare r text;
begin
  foreach r in array array['svc_organizacion', 'svc_certificaciones', 'svc_impedimentos', 'svc_integraciones'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on schema indicadores from %I', r);
    end if;
  end loop;
end
$$;

revoke all on schema organizacion, certificaciones, impedimentos, integraciones from svc_indicadores;

commit;

-- RLS: una política por tabla, solo para svc_indicadores. Sin política no hay acceso para nadie más
-- (el dueño de la tabla, postgres, no queda sujeto a RLS en Supabase).
do $$
declare t text;
begin
  for t in
    select tablename from pg_tables where schemaname = 'indicadores' and tablename <> '_prisma_migrations'
  loop
    execute format('alter table indicadores.%I enable row level security', t);
    if not exists (
      select 1 from pg_policies
      where schemaname = 'indicadores' and tablename = t and policyname = 'servicio_indicadores'
    ) then
      execute format(
        'create policy servicio_indicadores on indicadores.%I for all to svc_indicadores using (true) with check (true)',
        t
      );
    end if;
  end loop;
end $$;

-- Historiales de solo inserción (D193): los snapshots no se borran y los eventos del umbral no se
-- modifican ni se borran. La migración ya lo revoca, pero en la nube la aplica `postgres` y los
-- privilegios por defecto vuelven a otorgarlos: se repite aquí. Las pruebas esperan 42501.
-- `ejecucion_snapshot` y `umbral_carga` conservan los privilegios por defecto (se actualizan).
do $$
begin
  if to_regclass('indicadores.snapshot_indicadores') is not null then
    revoke delete, truncate on indicadores.snapshot_indicadores from svc_indicadores;
  end if;
  if to_regclass('indicadores.evento_umbral_carga') is not null then
    revoke update, delete, truncate on indicadores.evento_umbral_carga from svc_indicadores;
  end if;
end $$;
