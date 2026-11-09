// @vitest-environment node
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const provider = '10000000-0000-4000-8000-000000000001';
const customer = '10000000-0000-4000-8000-000000000002';
const other = '10000000-0000-4000-8000-000000000003';
const operator = '20000000-0000-4000-8000-000000000001';
const role = '30000000-0000-4000-8000-000000000001';
let db: PGlite; let installation: string; let firstRelease: string;
const scalar = async (sql: string, params: unknown[] = []) => (await db.query<{ value: any }>(sql, params)).rows[0]?.value;
async function context(org: string | null = provider, user: string | null = operator, service = false) {
  await db.query("select set_config('test.org',$1,false),set_config('test.user',$2,false),set_config('test.role',$3,false)", [org || '', user || '', service ? 'service_role' : 'authenticated']);
}
const rpc = (action: string, id: string | null = null, payload: unknown = {}) => scalar('select public.admin_local_installation($1,$2,$3) as value', [action, id, JSON.stringify(payload)]);
const worker = (action: string, id: string | null = null, lease: string | null = null, payload: unknown = {}) => scalar('select public.worker_local_installation($1,$2,$3,$4) as value', [action, id, lease, JSON.stringify(payload)]);
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create schema storage;
    create table public.organizations(id uuid primary key,name text);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.user',true),'')::uuid $$;
    create function auth.role() returns text language sql stable as $$ select current_setting('test.role',true) $$;
    create function public.current_org_id() returns uuid language sql stable as $$ select nullif(current_setting('test.org',true),'')::uuid $$;
    create function public.org_is_saas_admin(p uuid) returns boolean language sql stable as $$ select p='${provider}'::uuid $$;
    create function public.organization_display_name(p uuid) returns text language sql stable as $$ select name from public.organizations where id=p $$;
    create function public.support_is_operator(p text) returns boolean language sql stable as $$ select public.current_org_id()='${provider}'::uuid $$;
    create function public.support_ticket_code(p bigint) returns text language sql immutable as $$ select 'T-'||p::text $$;
    create table auth.users(id uuid primary key);
    create table public.org_roles(id uuid primary key,org_id uuid,permissions jsonb);
    create table public.user_organization_memberships(user_id uuid,org_id uuid,role_id uuid,is_active boolean default true);
    create table public.saas_org_settings(org_id uuid);
    create table public.saas_support_tickets(id uuid primary key,org_id uuid,customer_org_id uuid,ticket_no bigint,subject text,status text);
    create table public.tenant_items(id uuid default gen_random_uuid(),org_id uuid,value text);
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint);
    insert into auth.users values('${operator}');
    insert into public.organizations values('${provider}','تازه سیستم'),('${customer}','مشتری'),('${other}','مشتری دیگر');
    insert into public.org_roles values('${role}','${provider}','{"__saas_admin":{"view":true,"fields":{"local_view":true,"local_build":true,"local_export":true,"local_cutover":true}}}');
    insert into public.user_organization_memberships values('${operator}','${provider}','${role}',true);
    insert into public.saas_org_settings values('${customer}'),('${other}');
  `);
  const sql = readFileSync('database_v1_phase575_local_installations.sql', 'utf8');
  await db.exec(sql); await db.exec(sql); // Reapplying the migration must preserve records and policies.
  await context();
}, 60_000);
afterAll(async () => { await db?.close(); });

describe.sequential('dedicated installation security and lifecycle', () => {
  it('fails closed without org, without membership and for a tenant', async () => {
    for (const org of [null, customer, other]) { await context(org); expect(await scalar("select public.local_installation_can('view') as value")).toBe(false); }
    await context(provider, null); expect(await scalar("select public.local_installation_can('build') as value")).toBe(false);
    await context();
  });
  it('creates a provider-owned installation, not a customer-owned row', async () => {
    const result = await rpc('create', null, { customer_org_id: customer, title: 'نصب آزمایشی', public_url: 'https://app.example.ir', admin_name: 'مدیر', admin_email: 'admin@example.ir', install_kind: 'fresh', access_mode: 'public', tls_mode: 'provided', delivery_mode: 'file' });
    installation = result.id;
    expect(await scalar('select org_id as value from public.saas_local_installations where id=$1', [installation])).toBe(provider);
    await expect(rpc('prepare', installation)).rejects.toThrow(/بستهٔ لوکال/);
  });
  it('does not allow a tenant to access the installation or invoke worker APIs', async () => {
    await context(customer);
    await expect(rpc('detail', installation)).rejects.toThrow(/اجازه/);
    await expect(worker('claim')).rejects.toThrow(/Worker access/);
    await db.exec('set role authenticated');
    expect((await db.query('select id from public.saas_local_installations')).rows).toHaveLength(0);
    await db.exec('reset role'); await context();
  });
  it('rejects untested releases and binds a queued job to the exact release', async () => {
    await context(provider, null, true);
    await expect(worker('publish', null, null, { org_id: provider, manifest: {} })).rejects.toThrow(/verification/);
    firstRelease = '40000000-0000-4000-8000-000000000001';
    const publish = (id: string, version: string) => worker('publish', null, null, { id, org_id: provider, version, commit_sha: 'a'.repeat(40), schema_version: '576', manifest: { checks: { central_release: 'passed', clean_database: 'passed', offline_install: 'passed' } }, artifact_path: 'release.tar.gz', signature_path: 'manifest.sig', checksum: 'b'.repeat(64) });
    await publish(firstRelease, '2.120.0.0.0');
    await context(); const job = await rpc('prepare', installation); const duplicate = await rpc('prepare', installation);
    expect(duplicate.job_id).toBe(job.job_id); expect(duplicate.existing).toBe(true);
    await context(provider, null, true); await publish('40000000-0000-4000-8000-000000000002', '2.121.0.0.0');
    const claimed = await worker('claim'); expect(claimed.release.id).toBe(firstRelease);
    await expect(worker('succeed', claimed.job.id, '50000000-0000-4000-8000-000000000001', {})).rejects.toThrow(/lease/);
    await worker('fail', claimed.job.id, claimed.job.lease_token, { error_code: 'TEST_FAILURE', message: 'شکست آزمایشی' });
    await context(); expect((await rpc('detail', installation)).jobs[0].status).toBe('failed');
  });
  it('does not blindly re-execute an expired running job', async () => {
    await rpc('prepare', installation); await context(provider, null, true);
    const claimed = await worker('claim');
    await db.query("update public.saas_local_jobs set lease_until=now()-interval '1 second' where id=$1", [claimed.job.id]);
    expect(await worker('claim')).toBeNull();
    expect(await scalar('select status as value from public.saas_local_jobs where id=$1', [claimed.job.id])).toBe('needs_review');
    await context();
  });
  it('accepts only allowlisted report fields and keeps unknown secrets out of storage', async () => {
    await rpc('import_report', installation, { format: 'kalamapp-diagnostics-v1', generated_at: new Date().toISOString(), version: '2.120.0.0.0', disk_free_bytes: 10, services: [{ name: 'db', status: 'healthy', password: 'secret' }], token: 'secret', records: [{ id: other }] });
    const result = await rpc('detail', installation);
    expect(JSON.stringify(result.report)).not.toContain('secret'); expect(result.report.report.services[0]).toEqual({ name: 'db', status: 'healthy' });
  });
  it('enforces the write fence even for service role operations and org changes', async () => {
    await db.query('insert into public.tenant_items(org_id,value) values($1,$2)', [customer, 'keep']);
    await db.query("insert into public.saas_local_transfer_locks(org_id,installation_id,state) values($1,$2,'frozen')", [customer, installation]);
    await expect(db.query("update public.tenant_items set value='blocked' where org_id=$1", [customer])).rejects.toThrow(/فقط‌خواندنی/);
    await expect(db.query('update public.tenant_items set org_id=$1 where org_id=$2', [other, customer])).rejects.toThrow(/فقط‌خواندنی/);
    await db.query('insert into public.tenant_items(org_id,value) values($1,$2)', [other, 'allowed']);
  });
});
