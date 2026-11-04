// @vitest-environment node
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';

const orgA = '10000000-0000-4000-8000-000000000001';
const orgB = '10000000-0000-4000-8000-000000000002';
const admin = '20000000-0000-4000-8000-000000000001';
const member = '20000000-0000-4000-8000-000000000002';
const roleA = '30000000-0000-4000-8000-000000000001';
const roleB = '30000000-0000-4000-8000-000000000002';
const roleC = '30000000-0000-4000-8000-000000000003';
let db: PGlite;
const scalar = async (sql: string, params: unknown[] = []) => (await db.query<{ value: any }>(sql, params)).rows[0]?.value;
const context = async (host: string, user = admin, selected?: string) => {
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user]);
  await db.query("select set_config('request.headers',$1,false)", [JSON.stringify({ origin: `https://${host}`, 'x-organization-id': selected })]);
};

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create function auth.role() returns text language sql stable as $$ select nullif(current_setting('request.jwt.claim.role',true),'') $$;
    create table auth.users(id uuid primary key,phone text,phone_confirmed_at timestamptz);
    create table auth.identities(user_id uuid,provider text,identity_data jsonb);
    create table public.organizations(id uuid primary key,name text,is_active boolean default true);
    create table public.org_roles(id uuid primary key,org_id uuid,title text,permissions jsonb default '{}',created_at timestamptz default now(),parent_id uuid,sort_order integer,icon_key text);
    create table public.profiles(id uuid primary key,org_id uuid,role_id uuid,role text,is_active boolean default true,
      full_name text,email text,mobile_1 text,mobile text,job_title text,avatar_url text,created_at timestamptz default now(),
      voip_enabled boolean,voip_operator_code text,voip_extension text,voip_service_id text,voip_dial_mode text);
    create table public.user_organization_memberships(id uuid default gen_random_uuid(),user_id uuid,org_id uuid,role_id uuid,
      software_role text,is_owner boolean default false,is_active boolean default true,
      created_at timestamptz default now(),updated_at timestamptz default now(),unique(user_id,org_id));
    create table public.company_settings(org_id uuid,company_name text,company_full_name text,trade_name text,updated_at timestamptz,created_at timestamptz);
    create table public.saas_org_settings(org_id uuid,slug text,resolved_host text,is_billing_provider boolean default false);
    create table public.chat_groups(id uuid,org_id uuid,name text);
    create table public.changelogs(org_id uuid,module_id text,record_id text,action text,user_id uuid,record_title text,metadata jsonb);
    create function public.get_public_branding(p_hostname text) returns table(org_id uuid) language sql as $$
      select s.org_id from public.saas_org_settings s where s.resolved_host=p_hostname $$;
    create function public.org_is_saas_admin(p_org_id uuid) returns boolean language sql as $$
      select coalesce((select is_billing_provider from public.saas_org_settings where org_id=p_org_id),false) $$;
    create function public.normalize_iran_mobile_e164(p text) returns text language sql immutable as $$
      select case when p like '09%' then '+98'||substring(p from 2) when p like '989%' then '+'||p when p like '+989%' then p else null end $$;
    insert into public.organizations values ('${orgA}','Legacy English A',true),('${orgB}','Legacy English B',true);
    insert into public.company_settings(org_id,company_full_name) values ('${orgA}','سازمان الف'),('${orgB}','تازه سیستم');
    insert into public.saas_org_settings values ('${orgA}','alpha','alpha.tazesystem.ir',false),('${orgB}','panel','panel.tazesystem.ir',true);
    insert into public.org_roles(id,org_id,title,permissions) values
      ('${roleA}','${orgA}','مدیر', '{"tasks":{"view":true},"__saas_admin":{"view":true}}'),
      ('${roleB}','${orgB}','مدیر تازه سیستم','{"__saas_admin":{"view":true,"edit":true}}'),
      ('${roleC}','${orgA}','ویرایشگر','{}');
    insert into public.profiles(id,org_id,role_id,role,full_name,mobile_1,email) values
      ('${admin}','${orgA}','${roleA}','admin','مدیر','09120000001','admin@example.test'),
      ('${member}','${orgB}','${roleB}','editor','عضو مشترک','09120000002','private@example.test');
    insert into public.user_organization_memberships(user_id,org_id,role_id,software_role) values
      ('${admin}','${orgA}','${roleA}','admin'),('${admin}','${orgB}','${roleB}','admin'),
      ('${member}','${orgA}','${roleC}','editor'),('${member}','${orgB}','${roleB}','editor');
    insert into auth.users values ('${member}','989120000002',now());
  `);
  const migration = readFileSync(new URL('../database_v1_phase573_membership_scoped_organization_context.sql', import.meta.url), 'utf8');
  await db.exec(migration);
  await db.exec(migration); // Idempotence is part of the deployment contract.
}, 60_000);
afterAll(async () => { await db?.close(); });

describe('organization membership contract in PostgreSQL', () => {
  it('switches request context and roles without moving the shared profile', async () => {
    await context('alpha.tazesystem.ir');
    expect(await scalar('select public.current_org_id() as value')).toBe(orgA);
    await scalar('select public.activate_saas_admin_panel_context() as value');
    await context('panel.tazesystem.ir');
    expect(await scalar('select public.current_org_id() as value')).toBe(orgB);
    expect((await scalar('select public.get_current_organization_context() as value')).role_id).toBe(roleB);
    expect(await scalar('select org_id as value from public.profiles where id=$1', [admin])).toBe(orgA);
    await context('alpha.tazesystem.ir');
    const members = await scalar('select public.list_organization_members($1) as value', [orgA]);
    expect(members.some((item: any) => item.id === member)).toBe(true);
    expect(members.find((item: any) => item.id === member).role).toBe('editor');
  });
  it('uses Persian organization names only after authentication', async () => {
    const accesses = await scalar('select public.get_current_user_organization_accesses() as value');
    expect(accesses.map((item: any) => item.org_name)).toContain('سازمان الف');
    const candidate = await scalar("select public.check_phone_login_candidate('09120000002') as value");
    expect(candidate.org_id).toBeNull(); expect(candidate.role_id).toBeNull();
    expect(candidate.is_active).toBe(true);
  });
  it('rejects a forged selection on a bound host and fails closed for unknown hosts', async () => {
    await context('alpha.tazesystem.ir', admin, orgB);
    expect(await scalar('select public.current_org_id() as value')).toBe(orgA);
    await expect(db.query('select public.list_organization_members($1)', [orgB])).rejects.toThrow();
    await context('unknown.tazesystem.ir');
    expect(await scalar('select public.current_org_id() as value')).toBeNull();
    await context('app.tazesystem.ir');
    expect(await scalar('select public.current_org_id() as value')).toBeNull();
  });
  it('changes only the selected membership, records the actor, and rejects a foreign role', async () => {
    await context('alpha.tazesystem.ir');
    await expect(db.query('select public.manage_organization_member($1,$2)', [member, { role_id: roleB }])).rejects.toThrow();
    await db.query('select public.manage_organization_member($1,$2)', [member, { is_active: false }]);
    expect(await scalar('select is_active as value from public.user_organization_memberships where user_id=$1 and org_id=$2', [member, orgB])).toBe(true);
    await context('alpha.tazesystem.ir', member);
    expect(await scalar('select public.current_org_id() as value')).toBeNull();
    await context('panel.tazesystem.ir', member);
    expect(await scalar('select public.current_org_id() as value')).toBe(orgB);
    await context('alpha.tazesystem.ir');
    await db.query('select public.manage_organization_member($1,$2)', [member, { is_active: true }]);
    expect(await scalar('select user_id as value from public.changelogs limit 1')).toBe(admin);
  });
  it('prevents self-removal and unauthorized member management', async () => {
    await expect(db.query('select public.manage_organization_member($1,$2,true)', [admin, {}])).rejects.toThrow();
    await context('alpha.tazesystem.ir', member);
    await expect(db.query('select public.manage_organization_member($1,$2)', [admin, { role: 'viewer' }])).rejects.toThrow();
  });
  it('redacts identity details for ordinary members and never exposes other memberships', async () => {
    const members = await scalar('select public.list_organization_members($1) as value', [orgA]);
    expect(members.find((item: any) => item.id === admin).email).toBeNull();
    expect(members.every((item: any) => item.org_id === orgA)).toBe(true);
  });
  it('removes membership without deleting the identity or membership in another organization', async () => {
    await context('alpha.tazesystem.ir');
    await db.query('select public.manage_organization_member($1,$2,true)', [member, {}]);
    expect(await scalar('select count(*)::int as value from public.profiles where id=$1', [member])).toBe(1);
    expect(await scalar('select count(*)::int as value from public.user_organization_memberships where user_id=$1 and org_id=$2', [member, orgB])).toBe(1);
  });
  it('blocks old clients from moving profiles and allows a self avatar update in another active organization', async () => {
    await context('panel.tazesystem.ir', admin);
    await db.query("select set_config('request.jwt.claim.role','authenticated',false)");
    await expect(db.query('update public.profiles set org_id=$1 where id=$2', [orgB, admin])).rejects.toThrow();
    await db.query("select public.update_own_profile_avatar('https://example.test/avatar.png')");
    expect(await scalar('select avatar_url as value from public.profiles where id=$1', [admin])).toBe('https://example.test/avatar.png');
    await db.query("select set_config('request.jwt.claim.role','',false)");
  });
  it('paginates identity search beyond the first thousand members', async () => {
    await context('alpha.tazesystem.ir');
    await db.exec(`insert into public.profiles(id,org_id,role_id,role,full_name)
      select md5('directory-test-'||i)::uuid,'${orgB}','${roleB}','viewer','عضو '||i from generate_series(1,1002) i;
      insert into public.user_organization_memberships(user_id,org_id,role_id,software_role)
      select md5('directory-test-'||i)::uuid,'${orgA}','${roleC}','viewer' from generate_series(1,1002) i;`);
    const { rows } = await db.query<{ total_count: number }>("select * from public.search_org_identity_options(null,array['user'],5,1000)");
    expect(rows).toHaveLength(3);
    expect(Number(rows[0].total_count)).toBe(1003);
  });
});
