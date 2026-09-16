-- Quality360 · Esquemas de dominio y roles de servicio
-- Dueño: q360-infra · Decisión: D3 (informe p. 11) · Reglas no negociables (informe pp. 8-9)
--
-- Qué hace este script:
--   1. Crea los 4 esquemas de dominio: organizacion, certificaciones, impedimentos, integraciones.
--   2. Crea un rol de LOGIN por servicio (svc_organizacion, svc_certificaciones,
--      svc_impedimentos, svc_integraciones), sin privilegios de superusuario.
--   3. Aplica el mínimo privilegio: cada rol recibe USAGE + CREATE solo sobre su propio
--      esquema, y privilegios por defecto sobre las tablas que él mismo cree ahí.
--   4. Revoca explícitamente el acceso de PUBLIC, anon, authenticated y service_role
--      sobre los 4 esquemas de dominio y sobre el esquema public.
--
-- Cómo se aplica: `npm run db:schemas` (ver infrastructure/README.md). Es IDEMPOTENTE:
-- puede ejecutarse varias veces sin error (usa IF NOT EXISTS / DO blocks).
--
-- Nota sobre las contraseñas: son valores fijos NO SECRETOS, válidos solo para el
-- Postgres local de Supabase (accesible únicamente en 127.0.0.1:54322 y en la red
-- interna de Docker, nunca expuesto a internet — ver ADR 0008 y "No hagas" del
-- agente q360-infra). Nunca se usan para un proyecto Supabase alojado: ahí las
-- credenciales por servicio se generan aparte y viven solo en el `.env` de cada
-- entorno (ver sección "Nube" de infrastructure/README.md).

begin;

-- 1. Esquemas de dominio -----------------------------------------------------

create schema if not exists organizacion;
create schema if not exists certificaciones;
create schema if not exists impedimentos;
create schema if not exists integraciones;

comment on schema organizacion is
  'Quality360 · organizacion y seguimiento: usuarios, roles, equipos, celulas, sprints, HDU (dueño: servicio organizacion)';
comment on schema certificaciones is
  'Quality360 · ciclos y checklist de certificacion (dueño: servicio certificaciones; E3 fuera de alcance en esta corrida)';
comment on schema impedimentos is
  'Quality360 · impedimentos reportados (dueño: servicio impedimentos; E4 fuera de alcance en esta corrida)';
comment on schema integraciones is
  'Quality360 · integraciones externas y carga semilla (dueño: servicio integraciones)';

-- 2. Roles de login por servicio (sin superusuario, sin BYPASSRLS) -----------

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'svc_organizacion') then
    create role svc_organizacion login password 'svc_organizacion_local_dev';
  end if;
  if not exists (select 1 from pg_roles where rolname = 'svc_certificaciones') then
    create role svc_certificaciones login password 'svc_certificaciones_local_dev';
  end if;
  if not exists (select 1 from pg_roles where rolname = 'svc_impedimentos') then
    create role svc_impedimentos login password 'svc_impedimentos_local_dev';
  end if;
  if not exists (select 1 from pg_roles where rolname = 'svc_integraciones') then
    create role svc_integraciones login password 'svc_integraciones_local_dev';
  end if;
end
$$;

comment on role svc_organizacion is 'Quality360 · login del servicio organizacion; solo alcanza su propio esquema';
comment on role svc_certificaciones is 'Quality360 · login del servicio certificaciones; solo alcanza su propio esquema';
comment on role svc_impedimentos is 'Quality360 · login del servicio impedimentos; solo alcanza su propio esquema';
comment on role svc_integraciones is 'Quality360 · login del servicio integraciones; solo alcanza su propio esquema';

-- Cada rol puede conectarse a la base, pero eso no le da acceso a ningún esquema
-- todavía (el acceso se otorga esquema por esquema más abajo).
grant connect on database postgres to
  svc_organizacion, svc_certificaciones, svc_impedimentos, svc_integraciones;

-- 3. Mínimo privilegio: revocar los accesos por defecto -----------------------

-- Nadie tiene privilegios en public por el solo hecho de existir.
revoke all on schema public from public;

-- Los roles de la Data API (anon/authenticated/service_role vía PostgREST) y
-- PUBLIC no reciben nada en los 4 esquemas de dominio. Esto es una defensa
-- adicional: la Data API de Supabase nunca debe alcanzar estos esquemas porque
-- infrastructure/supabase/config.toml no los agrega a `[api].schemas`.
revoke all on schema organizacion, certificaciones, impedimentos, integraciones
  from public, anon, authenticated, service_role;

-- 4. USAGE + CREATE de cada rol solo sobre su propio esquema ------------------

grant usage, create on schema organizacion to svc_organizacion;
grant usage, create on schema certificaciones to svc_certificaciones;
grant usage, create on schema impedimentos to svc_impedimentos;
grant usage, create on schema integraciones to svc_integraciones;

-- 5. Privilegios por defecto sobre las tablas que cada rol crea en su esquema -
-- Prisma corre las migraciones de cada servicio conectado con su propio rol
-- (svc_organizacion crea las tablas de `organizacion`, etc.), así que el rol ya
-- es dueño de lo que crea y tiene privilegios completos por ser el dueño; no
-- hace falta (ni Postgres lo permite sin ser miembro del rol) declarar
-- "ALTER DEFAULT PRIVILEGES FOR ROLE svc_x" desde la sesión de `postgres`.
--
-- Lo que sí declaramos aquí es el caso de soporte/depuración: si alguna vez un
-- objeto se crea conectado como `postgres` dentro de estos esquemas, el rol de
-- servicio dueño del esquema igual recibe SELECT/INSERT/UPDATE/DELETE sobre
-- tablas y USAGE/SELECT sobre secuencias por defecto.

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

-- 6. Aislamiento explícito: cada rol NO alcanza los esquemas ajenos -----------
-- (Redundante con el paso 3 —nadie parte con privilegios—, pero se deja
-- explícito y a prueba de reordenamientos futuros del script.)

revoke all on schema certificaciones, impedimentos, integraciones from svc_organizacion;
revoke all on schema organizacion, impedimentos, integraciones from svc_certificaciones;
revoke all on schema organizacion, certificaciones, integraciones from svc_impedimentos;
revoke all on schema organizacion, certificaciones, impedimentos from svc_integraciones;

commit;
