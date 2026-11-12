// @vitest-environment node
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const org = '10000000-0000-4000-8000-000000000001';
const cloud = '10000000-0000-4000-8000-000000000002';
const user = '20000000-0000-4000-8000-000000000001';
let db: PGlite;
const scalar = async (sql: string) => (await db.query<{ value: any }>(sql)).rows[0]?.value;
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create schema auth; create function auth.uid() returns uuid language sql as $$ select '${user}'::uuid $$;
    create table organizations(id uuid primary key);
    insert into organizations values('${org}'),('${cloud}');
    create function current_org_id() returns uuid language sql stable as $$ select nullif(current_setting('test.org',true),'')::uuid $$;
    create table user_organization_memberships(user_id uuid,org_id uuid,is_active boolean,is_owner boolean,software_role text);
    insert into user_organization_memberships values('${user}','${org}',true,true,'admin');
    create function org_has_plan_feature(uuid,text,boolean default false) returns boolean language sql as $$ select $2='cloud_feature' or $3 $$;
    create function org_has_plan_module(uuid,text,boolean default false) returns boolean language sql as $$ select $2='cloud_module' or $3 $$;
    select set_config('test.org','${org}',false);`);
  const migration = readFileSync('database_v1_phase576_local_deployment_runtime.sql', 'utf8');
  await db.exec(migration); await db.exec(migration);
}, 60_000);
afterAll(async () => { await db?.close(); });
describe.sequential('local availability retains cloud and role isolation', () => {
  it('preserves cloud plan evaluation while the local table is empty', async () => {
    expect(await scalar(`select org_has_plan_feature('${cloud}','cloud_feature',false) as value`)).toBe(true);
    expect(await scalar(`select org_has_plan_module('${cloud}','cloud_module',false) as value`)).toBe(true);
  });
  it('uses explicit per-organization local policy and fails closed for unknown keys', async () => {
    await db.exec(`insert into local_deployment_runtime(org_id,code,version,features,modules) values('${org}','LI-TEST','2.121.0.0.0','{"local_feature":true}','{"products":true}');`);
    expect(await scalar(`select org_has_plan_feature('${org}','local_feature',false) as value`)).toBe(true);
    expect(await scalar(`select org_has_plan_feature('${org}','cloud_feature',true) as value`)).toBe(false);
    expect(await scalar(`select org_has_plan_module('${org}','cloud_module',true) as value`)).toBe(false);
    expect(await scalar(`select org_has_plan_feature(null,'cloud_feature',true) as value`)).toBe(false);
  });
  it('allows only this organization administrator to manage availability', async () => {
    await db.exec(`set role authenticated; select set_local_installation_availability('{"local_feature":false}','{"products":true}');`);
    expect((await scalar('select get_local_installation_status() as value')).features.local_feature).toBe(false);
    await db.exec(`select set_config('test.org','${cloud}',false)`);
    await expect(scalar('select get_local_installation_status() as value')).rejects.toThrow(/مدیر سازمان/);
    await db.exec('reset role');
  });
});
