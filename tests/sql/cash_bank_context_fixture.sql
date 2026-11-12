-- Isolated PostgreSQL fixture only; the shared cluster already has authenticated/anon.
create schema auth;
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('test.user_id',true),'')::uuid;
$$;
grant usage on schema auth to authenticated;
grant execute on function auth.uid() to authenticated;
create table organizations(id uuid primary key,is_active boolean not null default true);
create table company_settings(org_id uuid not null);
create table org_roles(org_id uuid not null,permissions jsonb not null default '{}');
create table saas_org_settings(org_id uuid primary key,resolved_host text,is_billing_provider boolean default false,updated_at timestamptz default now());
create table user_organization_memberships(user_id uuid,org_id uuid,is_active boolean default true,primary key(user_id,org_id));
create index on saas_org_settings(lower(resolved_host));
insert into organizations(id) values
 ('10000000-0000-4000-8000-000000000001'),('10000000-0000-4000-8000-000000000002');
insert into profiles(id,org_id) values ('90000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001');
insert into user_organization_memberships(user_id,org_id) select '90000000-0000-4000-8000-000000000001',id from organizations;
insert into saas_org_settings(org_id,resolved_host) values
 ('10000000-0000-4000-8000-000000000001','one.example.test'),('10000000-0000-4000-8000-000000000002','two.example.test');
-- Calling the old presentation resolver is a test failure: RLS must not build branding JSON.
create function get_public_branding(text) returns table(org_id uuid) language plpgsql as $$
begin raise exception 'The RLS identity path must not materialize public branding'; end;
$$;
