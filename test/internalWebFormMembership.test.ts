// @vitest-environment node
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { expect, it } from 'vitest';

const migration = (name: string) => readFileSync(name, 'utf8');

it('checks active organization membership before loading or submitting internal forms', async () => {
  const db = new PGlite();
  const org = '10000000-0000-4000-8000-000000000001';
  const other = '10000000-0000-4000-8000-000000000002';
  const user = '20000000-0000-4000-8000-000000000001';
  try {
    await db.exec(`
      create role anon;
      create role authenticated;
      create role service_role;
      create schema auth;
      create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('test.user', true), '')::uuid $$;
      create table organizations(id uuid primary key, is_active boolean);
      create table user_organization_memberships(user_id uuid, org_id uuid, is_active boolean);
      create table web_forms(id uuid default gen_random_uuid(), org_id uuid, route_slug text,
        access_scope text, target_module_id text, is_active boolean, config jsonb,
        updated_at timestamptz, created_at timestamptz);
      create table web_form_fields(web_form_id uuid, sort_order int, created_at timestamptz, is_active boolean);
      create table web_form_submissions(org_id uuid, web_form_id uuid, target_module_id text, status text,
        submission_data jsonb, record_payload jsonb, source_context jsonb, error_message text);
      create table integration_settings(org_id uuid, settings jsonb, connection_type text, is_active boolean,
        updated_at timestamptz, created_at timestamptz);
      create function get_public_branding(text) returns table (org_id uuid, company_settings jsonb, branding_settings jsonb)
        language sql as $$ select '${org}'::uuid, '{}'::jsonb, '{}'::jsonb $$;
      insert into organizations values ('${org}', true), ('${other}', true);
      insert into user_organization_memberships values ('${user}', '${other}', true), ('${user}', '${org}', false);
      insert into web_forms(org_id, route_slug, access_scope, is_active, config) values
        ('${org}', 'internal', 'internal', true, '{"default_record_values":{"private_key":"private"}}'),
        ('${org}', 'public', 'public', true, '{}');
      insert into web_form_fields select id, 1, now(), true from web_forms;
    `);
    await db.exec(migration('database_v1_phase357_public_web_forms_conditional_display_repair.sql'));
    const submit = migration('database_v1_phase547_delivery_main_files_and_web_form_uploads.sql');
    const submitStart = submit.indexOf('create or replace function public.submit_public_web_form(');
    await db.exec(submit.slice(submitStart, submit.indexOf('\n$$;', submitStart) + 4));
    const guard = migration('database_v1_phase612_internal_web_form_membership.sql');
    await db.exec(guard);
    await db.exec(guard);

    const read = (slug: string) => db.query<{ web_form: Record<string, unknown>; fields: unknown[] }>(
      'select web_form, fields from public.get_public_web_form($1, null, null)', [slug]);
    const send = (slug: string) => db.query('select public.submit_public_web_form($1)', [slug]);
    expect((await read('internal')).rows[0]).toEqual({ web_form: { access_scope: 'internal' }, fields: [] });
    await expect(send('internal')).rejects.toThrow('WEB_FORM_AUTH_REQUIRED');
    expect((await read('public')).rows[0].fields).toHaveLength(1);

    await db.exec(`select set_config('test.user', '${user}', false)`);
    await expect(read('internal')).rejects.toThrow('WEB_FORM_ORG_ACCESS_DENIED');
    await expect(send('internal')).rejects.toThrow('WEB_FORM_ORG_ACCESS_DENIED');
    await expect(send('public')).rejects.toThrow('WEB_FORM_TARGET_REQUIRED');

    await db.exec(`update user_organization_memberships set is_active = true where org_id = '${org}'`);
    expect((await read('internal')).rows[0].fields).toHaveLength(1);
    await expect(send('internal')).rejects.toThrow('WEB_FORM_TARGET_REQUIRED');
  } finally {
    await db.close();
  }
}, 30000);
