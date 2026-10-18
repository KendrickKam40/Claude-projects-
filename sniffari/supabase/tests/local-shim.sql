-- For local testing only: minimal stand-ins for what a Supabase project provides
-- (auth schema, auth.uid(), and the anon/authenticated roles), so the real migration runs on plain Postgres + PostGIS.
create schema if not exists extensions;
create schema if not exists auth;
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create table auth.users (id uuid primary key default gen_random_uuid(), email text);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema public, extensions, auth to anon, authenticated, service_role;
alter default privileges in schema public grant select on tables to anon;
alter default privileges in schema public grant all on tables to authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated;
