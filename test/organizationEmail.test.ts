// @vitest-environment node
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
let db: PGlite;
const org = '10000000-0000-4000-8000-000000000001';
const other = '10000000-0000-4000-8000-000000000002';
const user = '20000000-0000-4000-8000-000000000001';
const account = '30000000-0000-4000-8000-000000000001';
const messageId = '40000000-0000-4000-8000-000000000001';
const scalar = async (sql: string) => (await db.query<{ value: any }>(sql)).rows[0]?.value;
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create role anon;create role authenticated;create role service_role;
    create schema auth;create schema storage;
    create table auth.users(id uuid primary key);insert into auth.users values('${user}');
    create table public.organizations(id uuid primary key);insert into organizations values('${org}'),('${other}');
    create table public.saas_plans(id uuid primary key,enabled_features jsonb);
    insert into saas_plans values(gen_random_uuid(),'{}'),(gen_random_uuid(),'{"organization_email":false}');
    create table public.integration_settings(id uuid primary key,org_id uuid,settings jsonb,connection_type text,is_active boolean);
    insert into integration_settings values('${account}','${org}','{"host":"smtp.example.com","username":"office@example.com","password":"legacy-private"}','email',true);
    create table public.outbound_messages(id uuid primary key);
    create table storage.buckets(id text primary key,name text,public boolean);
    create function auth.uid() returns uuid language sql stable as $$select '${user}'::uuid$$;
    create function public.current_org_id() returns uuid language sql stable as $$select nullif(current_setting('test.org',true),'')::uuid$$;
    create function public.get_current_organization_context() returns jsonb language sql stable as $$select case when current_org_id() is null then null else jsonb_build_object('org_id',current_org_id(),'role','admin','permissions',coalesce(nullif(current_setting('test.permissions',true),''),'{}')::jsonb) end$$;
    create function public.current_org_has_plan_feature(text,boolean) returns boolean language sql stable as $$select coalesce(nullif(current_setting('test.feature',true),''),'true')::boolean$$;
    select set_config('test.org','${org}',false);
  `);
  const migration = readFileSync(new URL('../database_v1_phase574_organization_email_foundation.sql', import.meta.url), 'utf8');
  await db.exec(migration); await db.exec(migration);
  await db.exec(`insert into email_messages(id,org_id,account_id,direction,message_id,from_address,subject,status) values('${messageId}','${org}','${account}','inbound','<test@example.com>','sender@example.com','موضوع','received');
    grant usage on schema public,auth to authenticated;`);
}, 60000);
afterAll(async () => { await db.close(); });
describe('organization email SQL security and persistence', () => {
  it('preserves operator-disabled plan features and migrates passwords out of client-readable settings', async () => {
    expect(await scalar(`select count(*)::int value from saas_plans where enabled_features->>'organization_email'='false'`)).toBe(1);
    expect(await scalar(`select settings ? 'password' value from integration_settings`)).toBe(false);
    expect(await scalar(`select legacy_credentials->'smtp'->>'password' value from email_account_secrets`)).toBe('legacy-private');
  });
  it('enforces organization isolation, null context, private credentials and private BCC', async () => {
    await db.exec('set role authenticated');
    expect(await scalar('select count(*)::int value from email_messages')).toBe(1);
    await expect(db.query('select * from email_account_secrets')).rejects.toThrow();
    await expect(db.query('select * from email_message_private')).rejects.toThrow();
    await db.query("select set_config('test.org',$1,false)", [other]);
    expect(await scalar('select count(*)::int value from email_messages')).toBe(0);
    await expect(db.query('select email_mark_read($1)', [messageId])).rejects.toThrow();
    await db.query("select set_config('test.org','',false)");
    expect(await scalar('select count(*)::int value from email_messages')).toBe(0);
    await db.exec(`reset role;select set_config('test.org','${org}',false);`);
  });
  it('separates read and send permissions and fails closed when the plan disables email', async () => {
    await db.exec(`select set_config('test.permissions','{"__communications":{"view":true,"edit":true,"fields":{"send_email":false}}}',false)`);
    expect(await scalar("select email_can_access('view') value")).toBe(true);
    expect(await scalar("select email_can_access('send') value")).toBe(false);
    await db.exec("select set_config('test.feature','false',false)");
    expect(await scalar("select email_can_access('view') value")).toBe(false);
    await db.exec("select set_config('test.feature','true',false);select set_config('test.permissions','{}',false)");
  });
  it('records read receipts per user and rejects cross-organization accounts and duplicate send requests', async () => {
    await db.exec('set role authenticated'); await db.query('select email_mark_read($1)', [messageId]);
    const result = await scalar("select email_list_messages('inbox') value");
    expect(result[0].is_read).toBe(true); expect(result[0]).not.toHaveProperty('bcc_addresses');
    expect(await scalar("select jsonb_array_length(email_list_messages('unread')) value")).toBe(0);
    await db.exec('reset role');
    await expect(db.query(`insert into email_messages(org_id,account_id,direction,message_id,from_address,status) values($1,$2,'outbound','<bad>','a@example.com','queued')`, [other, account])).rejects.toThrow();
    const request = '50000000-0000-4000-8000-000000000001';
    const insert = `insert into email_messages(org_id,request_key,direction,message_id,from_address,status) values('${org}','${request}','outbound','<unique>','a@example.com','queued')`;
    await db.exec(insert); await expect(db.exec(insert)).rejects.toThrow();
  });
});
