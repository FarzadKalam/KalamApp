// @vitest-environment node
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

let db: PGlite;
const org = '20000000-0000-4000-8000-000000000001';
const other = '20000000-0000-4000-8000-000000000002';
const uid = '10000000-0000-4000-8000-000000000001';
const migration = readFileSync('database_v1_phase604_module_field_action_permissions.sql', 'utf8');
const setPermission = (value: unknown) => db.query('update org_roles set permissions=$1::jsonb', [JSON.stringify({ customers: value })]);

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create role anon;create role authenticated;create schema auth;
    create function auth.uid() returns uuid language sql as $$select '${uid}'::uuid$$;
    create function current_org_id() returns uuid language sql as $$select nullif(current_setting('test.org',true),'')::uuid$$;
    create function saas_offering_keys() returns jsonb language sql as $$select '{"modules":["customers"],"features":["goals"]}'::jsonb$$;
    create function current_org_has_plan_module(text,boolean) returns boolean language sql as $$select true$$;
    create function current_org_has_plan_feature(text,boolean) returns boolean language sql as $$select false$$;
    create table org_roles(id uuid,org_id uuid,permissions jsonb);
    create table user_organization_memberships(user_id uuid,org_id uuid,role_id uuid,is_active boolean);
    insert into org_roles values('${uid}','${org}','{}');
    insert into user_organization_memberships values('${uid}','${org}','${uid}',true);
    create table customers(id integer primary key,org_id uuid,name text,price numeric,kind text default 'customer',lines jsonb);
    alter table customers enable row level security;
    create policy own_org on customers to authenticated using(org_id=public.current_org_id()) with check(org_id=public.current_org_id());
    grant select,insert,update,delete on customers to authenticated;
    select set_config('test.org','${org}',false);`);
  await db.exec(migration); await db.exec(migration);
}, 60000);
beforeEach(async () => {
  await db.exec(`reset role;truncate customers;select set_config('test.org','${org}',false);update user_organization_memberships set is_active=true;`);
  await setPermission({ view: true, edit: true, delete: true });
  await db.exec(`insert into customers(id,org_id,name,price,lines) values(1,'${org}','before',10,'[{"id":"a","price":10},{"id":"b","price":20}]');`);
});
afterAll(async () => { await db?.close(); });

describe.sequential('server-side module and field mutation permissions', () => {
  it('separates creation from editing and retains legacy fallback', async () => {
    await setPermission({ view: true, create: false, edit: true });
    await db.exec('set role authenticated');
    await expect(db.exec(`insert into customers(id,org_id) values(2,'${org}')`)).rejects.toThrow('دسترسی');
    await db.exec("update customers set name='edited' where id=1;reset role");
    await setPermission({ view: true, create: true, edit: false });
    await db.exec('set role authenticated');
    await db.exec(`insert into customers(id,org_id,name) values(2,'${org}','created')`);
    await expect(db.exec("update customers set name='denied' where id=1")).rejects.toThrow('دسترسی');
  });
  it('rejects protected values and clearing but allows unchanged protected fields', async () => {
    await setPermission({ field_actions: { price: { edit: false }, name: { delete: false } } });
    await db.exec('set role authenticated');
    await expect(db.exec('update customers set price=20 where id=1')).rejects.toThrow('فیلد');
    await db.exec("update customers set name='allowed',price=10 where id=1");
    await expect(db.exec("update customers set name='' where id=1")).rejects.toThrow('پاک');
    await db.exec('delete from customers where id=1');
  });
  it('accepts an omitted denied field default, rejects an explicit different value', async () => {
    await setPermission({ field_actions: { kind: { create: false } } });
    await db.exec('set role authenticated');
    await db.exec(`insert into customers(id,org_id) values(2,'${org}')`);
    await expect(db.exec(`insert into customers(id,org_id,kind) values(3,'${org}','changed')`)).rejects.toThrow('فیلد');
  });
  it('protects JSON table columns without denying a reorder of stable rows', async () => {
    await setPermission({ field_actions: { 'lines.price': { edit: false } } });
    await db.exec('set role authenticated');
    await db.exec(`update customers set lines='[{"id":"b","price":20},{"id":"a","price":10}]' where id=1`);
    await expect(db.exec(`update customers set lines='[{"id":"b","price":99},{"id":"a","price":10}]' where id=1`)).rejects.toThrow('ستون');
  });
  it('fails closed on cross-org writes, missing organization and inactive membership', async () => {
    await db.exec('set role authenticated');
    await expect(db.exec(`insert into customers(id,org_id) values(2,'${other}')`)).rejects.toThrow('سازمان');
    await db.exec("select set_config('test.org','',false)");
    await expect(db.exec(`insert into customers(id,org_id) values(2,'${org}')`)).rejects.toThrow('سازمان');
    await db.exec(`reset role;select set_config('test.org','${org}',false);update user_organization_memberships set is_active=false;set role authenticated`);
    await expect(db.exec(`insert into customers(id,org_id) values(2,'${org}')`)).rejects.toThrow('دسترسی');
  });
  it('returns only current organization entitlement decisions', async () => {
    expect((await db.query<{ value: unknown }>('select current_org_permission_availability() value')).rows[0].value)
      .toEqual({ modules: { customers: true }, features: { goals: false, customer_club: false } });
    expect((await db.query<{value:boolean}>("select current_user_can_module_field('customers',null) value")).rows[0].value).toBe(false);
  });
});
