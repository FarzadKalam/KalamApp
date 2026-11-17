\set ON_ERROR_STOP on
DO $$ BEGIN
  IF public.is_valid_tenant_site_blocks('[{"type":"button","text":"x","href":"//evil.example"}]'::jsonb) THEN RAISE EXCEPTION 'protocol-relative URL accepted'; END IF;
  IF public.is_valid_tenant_site_blocks('[{"type":"button","text":"x","href":"/\\\\evil.example"}]'::jsonb) THEN RAISE EXCEPTION 'backslash URL accepted'; END IF;
END $$;
-- Test-only deterministic fixtures in a disposable local PostgreSQL database.
INSERT INTO public.organizations(id,name,slug) VALUES
 ('11111111-1111-4111-8111-111111111111','Tenant A','tenant-a'),
 ('22222222-2222-4222-8222-222222222222','Tenant B','tenant-b');
INSERT INTO public.saas_org_settings(org_id,slug,status) VALUES
 ('11111111-1111-4111-8111-111111111111','tenant-a','active'),
 ('22222222-2222-4222-8222-222222222222','tenant-b','active');
INSERT INTO auth.users(id) VALUES
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
INSERT INTO public.user_organization_memberships(org_id,user_id,software_role,is_owner,is_active) VALUES
 ('11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','manager',false,true),
 ('22222222-2222-4222-8222-222222222222','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','manager',false,true);
INSERT INTO public.products(id,org_id,name) VALUES
 ('aaaaaaaa-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Product A'),
 ('bbbbbbbb-0000-4000-8000-000000000002','22222222-2222-4222-8222-222222222222','Product B');
INSERT INTO public.external_connections(id,org_id,provider,is_active,sync_policy) VALUES
 ('aaaaaaaa-1000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','woocommerce',true,'{"invoices":"manual"}'),
 ('bbbbbbbb-1000-4000-8000-000000000002','22222222-2222-4222-8222-222222222222','woocommerce',true,'{"invoices":"manual"}');
INSERT INTO public.external_order_inbox(org_id,connection_id,external_id,payload) VALUES
 ('11111111-1111-4111-8111-111111111111','aaaaaaaa-1000-4000-8000-000000000001','12','{"id":12,"meta_data":[]}');
INSERT INTO public.external_sync_history(org_id,connection_id,module_key,action,direction,status) VALUES
 ('11111111-1111-4111-8111-111111111111','aaaaaaaa-1000-4000-8000-000000000001','products','sync_record','from_site','succeeded'),
 ('22222222-2222-4222-8222-222222222222','bbbbbbbb-1000-4000-8000-000000000002','products','sync_record','from_site','succeeded');

-- Owner A saves and explicitly publishes; a later draft must not replace the published version.
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role','authenticated',true);
SELECT set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
SELECT set_config('request.jwt.claim.org_id','11111111-1111-4111-8111-111111111111',true);
SELECT * FROM public.save_tenant_site_page_draft(NULL,'a-home','Tenant A home','[{"type":"heading","text":"A published","level":1}]'::jsonb) \gset a_
SELECT * FROM public.publish_tenant_site_page(:'a_page_id');
SELECT * FROM public.save_tenant_site_page_draft(:'a_page_id','a-home','Tenant A draft','[{"type":"paragraph","text":"A draft only"}]'::jsonb) \gset a2_
DO $$ BEGIN
END $$;
COMMIT;

-- Tenant B's page exists but remains unpublished.
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role','authenticated',true);
SELECT set_config('request.jwt.claim.sub','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',true);
SELECT set_config('request.jwt.claim.org_id','22222222-2222-4222-8222-222222222222',true);
SELECT * FROM public.save_tenant_site_page_draft(NULL,'b-home','Tenant B draft','[{"type":"paragraph","text":"B secret"}]'::jsonb) \gset b_
COMMIT;

-- Tenant A cannot read or modify B's page or product content, even through privileged RPC entry points.
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role','authenticated',true);
SELECT set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
SELECT set_config('request.jwt.claim.org_id','11111111-1111-4111-8111-111111111111',true);
DO $$ BEGIN
  IF (SELECT count(*) FROM public.site_pages WHERE org_id='22222222-2222-4222-8222-222222222222') <> 0 THEN RAISE EXCEPTION 'cross-tenant site page visible'; END IF;
  IF (SELECT count(*) FROM public.site_page_versions WHERE org_id='22222222-2222-4222-8222-222222222222') <> 0 THEN RAISE EXCEPTION 'cross-tenant site version visible'; END IF;
  IF (SELECT count(*) FROM public.product_site_content WHERE org_id='22222222-2222-4222-8222-222222222222') <> 0 THEN RAISE EXCEPTION 'cross-tenant product content visible'; END IF;
  IF (SELECT count(*) FROM public.external_sync_history WHERE org_id='22222222-2222-4222-8222-222222222222') <> 0 THEN RAISE EXCEPTION 'cross-tenant sync history visible'; END IF;
END $$;
-- Check explicit cross-tenant page update rejection using the psql variable as a GUC.
SELECT set_config('test.page_b_id', :'b_page_id', true);
DO $$ BEGIN
  BEGIN
    PERFORM * FROM public.save_tenant_site_page_draft(current_setting('test.page_b_id')::uuid,'b-home','Unauthorized','[]'::jsonb);
    RAISE EXCEPTION 'expected cross-tenant page update denial';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'expected cross-tenant page update denial' THEN RAISE; END IF;
  END;
END $$;
INSERT INTO public.product_site_content(org_id,product_id,title,slug)
VALUES ('11111111-1111-4111-8111-111111111111','aaaaaaaa-0000-4000-8000-000000000001','Product A site draft','product-a');
DO $$ BEGIN
  BEGIN
    INSERT INTO public.product_site_content(org_id,product_id,title,slug)
    VALUES ('22222222-2222-4222-8222-222222222222','bbbbbbbb-0000-4000-8000-000000000002','Cross tenant','cross-tenant');
    RAISE EXCEPTION 'expected cross-tenant product insert denial';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'expected cross-tenant product insert denial' THEN RAISE; END IF;
  END;
  BEGIN
    INSERT INTO public.external_sync_history(org_id,connection_id,module_key,action,direction,status)
    VALUES ('11111111-1111-4111-8111-111111111111','aaaaaaaa-1000-4000-8000-000000000001','products','sync_record','from_site','succeeded');
    RAISE EXCEPTION 'expected authenticated history insert denial';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
    WHEN OTHERS THEN IF SQLERRM = 'expected authenticated history insert denial' THEN RAISE; END IF;
  END;
END $$;
COMMIT;

-- Anonymous users see only the explicit published version; draft-only tenant B page is not public.
BEGIN;
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claim.role','anon',true);
DO $$ BEGIN
  IF (SELECT count(*) FROM public.get_published_site_page('tenant-a','a-home')) <> 1 THEN RAISE EXCEPTION 'published page missing publicly'; END IF;
  IF (SELECT title FROM public.get_published_site_page('tenant-a','a-home')) <> 'Tenant A home' THEN RAISE EXCEPTION 'draft overwrote published version'; END IF;
  IF (SELECT count(*) FROM public.get_published_site_page('tenant-b','b-home')) <> 0 THEN RAISE EXCEPTION 'unpublished draft exposed publicly'; END IF;
END $$;
COMMIT;

-- The outcome wrapper serializes the import and reports create once, then skip, then update by policy.
BEGIN;
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claim.role','service_role',true);
DO $$ DECLARE v_outcome text; BEGIN
  SELECT outcome INTO v_outcome FROM public.import_woocommerce_order_with_outcome('aaaaaaaa-1000-4000-8000-000000000001','12');
  IF v_outcome <> 'created' THEN RAISE EXCEPTION 'expected created, got %',v_outcome; END IF;
END $$;
COMMIT;
BEGIN;
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claim.role','service_role',true);
DO $$ DECLARE v_outcome text; BEGIN
  SELECT outcome INTO v_outcome FROM public.import_woocommerce_order_with_outcome('aaaaaaaa-1000-4000-8000-000000000001','12');
  IF v_outcome <> 'skipped' THEN RAISE EXCEPTION 'expected skipped, got %',v_outcome; END IF;
END $$;
COMMIT;
UPDATE public.external_connections SET sync_policy='{"invoices":"woocommerce"}' WHERE id='aaaaaaaa-1000-4000-8000-000000000001';
BEGIN;
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claim.role','service_role',true);
DO $$ DECLARE v_outcome text; BEGIN
  SELECT outcome INTO v_outcome FROM public.import_woocommerce_order_with_outcome('aaaaaaaa-1000-4000-8000-000000000001','12');
  IF v_outcome <> 'updated' THEN RAISE EXCEPTION 'expected updated, got %',v_outcome; END IF;
END $$;
COMMIT;

\echo 'PASS: local PostgreSQL RLS/manual publish/outcome integration assertions'
