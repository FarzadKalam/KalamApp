\set ON_ERROR_STOP on
DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE service_role NOLOGIN BYPASSRLS; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE auth.users (id uuid primary key);
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
CREATE OR REPLACE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.role', true), '')
$$;
CREATE OR REPLACE FUNCTION public.current_org_id() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.org_id', true), '')::uuid
$$;
GRANT USAGE ON SCHEMA auth, public TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.uid(), auth.role(), public.current_org_id() TO anon, authenticated, service_role;
CREATE TABLE public.organizations (id uuid primary key, name text not null, slug text unique not null, created_at timestamptz not null default now());
CREATE TABLE public.saas_org_settings (org_id uuid primary key references public.organizations(id), slug text not null, status text default 'active');
CREATE TABLE public.org_roles (id uuid primary key, org_id uuid not null references public.organizations(id), permissions jsonb not null default '{}'::jsonb);
CREATE TABLE public.user_organization_memberships (
  id uuid primary key default gen_random_uuid(), org_id uuid not null references public.organizations(id),
  user_id uuid not null references auth.users(id), role_id uuid references public.org_roles(id),
  software_role text not null default 'manager', is_owner boolean not null default false, is_active boolean not null default true
);
GRANT SELECT ON public.user_organization_memberships TO authenticated;
CREATE TABLE public.products (id uuid primary key, org_id uuid not null references public.organizations(id), name text not null);
GRANT SELECT ON public.products TO authenticated;
CREATE TABLE public.external_connections (
  id uuid primary key, org_id uuid not null references public.organizations(id), provider text not null default 'woocommerce',
  is_active boolean not null default true, sync_policy jsonb not null default '{"invoices":"manual"}'::jsonb
);
CREATE TABLE public.external_record_links (
  id uuid primary key default gen_random_uuid(), org_id uuid not null references public.organizations(id),
  connection_id uuid not null references public.external_connections(id), module_key text not null,
  local_id uuid not null, external_id text not null, local_updated_at timestamptz, external_updated_at timestamptz,
  synced_at timestamptz not null default now(), unique(connection_id,module_key,local_id), unique(connection_id,module_key,external_id)
);
CREATE TABLE public.external_order_inbox (
  id uuid primary key default gen_random_uuid(), org_id uuid not null references public.organizations(id),
  connection_id uuid not null references public.external_connections(id), external_id text not null,
  payload jsonb not null default '{}'::jsonb, unique(connection_id,external_id)
);
CREATE TABLE public.invoices (id uuid primary key default gen_random_uuid(), org_id uuid not null references public.organizations(id), system_code text);
CREATE OR REPLACE FUNCTION public.import_woocommerce_order(p_connection_id uuid, p_external_id text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_invoice uuid; v_org uuid;
BEGIN
  SELECT local_id INTO v_invoice FROM public.external_record_links
    WHERE connection_id=p_connection_id AND module_key='invoices' AND external_id=p_external_id;
  IF v_invoice IS NOT NULL THEN
    UPDATE public.invoices SET system_code=system_code WHERE id=v_invoice;
    RETURN v_invoice;
  END IF;
  SELECT org_id INTO v_org FROM public.external_connections WHERE id=p_connection_id;
  INSERT INTO public.invoices(org_id,system_code) VALUES(v_org,p_external_id) RETURNING id INTO v_invoice;
  INSERT INTO public.external_record_links(org_id,connection_id,module_key,local_id,external_id)
    VALUES(v_org,p_connection_id,'invoices',v_invoice,p_external_id);
  RETURN v_invoice;
END $$;
