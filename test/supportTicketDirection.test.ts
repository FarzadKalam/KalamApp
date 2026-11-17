// @vitest-environment node
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

let db: PGlite;
const provider = '20000000-0000-4000-8000-000000000001';
const internal = '20000000-0000-4000-8000-000000000002';
const customer = '20000000-0000-4000-8000-000000000003';
const outsider = '20000000-0000-4000-8000-000000000004';
const operator = '10000000-0000-4000-8000-000000000001';
const recipient = '10000000-0000-4000-8000-000000000002';
const otherUser = '10000000-0000-4000-8000-000000000003';
const sql545 = readFileSync('database_v1_phase545_saas_support_tickets.sql','utf8');
const sql563 = readFileSync('database_v1_phase563_account_checkout_and_support_access.sql','utf8');
const migration = readFileSync('database_v1_phase607_support_navigation_and_ticket_type.sql','utf8');
const definition = (source: string, name: string) => {
  const start = source.indexOf(`create or replace function public.${name}(`);
  if (start < 0) throw new Error(name);
  return source.slice(start, source.indexOf('$$;',source.indexOf('as $$', start)) + 3);
};
const actor = (org: string, user: string) => db.query("select set_config('test.org',$1,false),set_config('test.uid',$2,false)",[org,user]);
let outgoingId: string;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create role anon;create role authenticated;create schema auth;
    create table auth.users(id uuid primary key);
    insert into auth.users values('${operator}'),('${recipient}'),('${otherUser}');
    create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
    create function current_org_id() returns uuid language sql as $$select nullif(current_setting('test.org',true),'')::uuid$$;
    create table organizations(id uuid primary key,name text);
    insert into organizations values('${provider}','Provider'),('${internal}','Internal'),('${customer}','Customer'),('${outsider}','Other');
    create table org_roles(id uuid,org_id uuid,permissions jsonb);
    insert into org_roles values('${operator}','${provider}','{"__saas_admin":{"view":true,"edit":true}}'),
      ('${recipient}','${internal}','{"__saas_admin":{"view":true,"edit":true}}'),
      ('${otherUser}','${customer}','{"__support_tickets":{"view":true,"fields":{"view_all":false,"reply_all":false}}}');
    create table user_organization_memberships(user_id uuid,org_id uuid,role_id uuid,is_active boolean,is_owner boolean default false,software_role text default 'user');
    insert into user_organization_memberships(user_id,org_id,role_id,is_active) values('${operator}','${provider}','${operator}',true),
      ('${operator}','${internal}','${recipient}',true),('${recipient}','${customer}','${otherUser}',true),('${otherUser}','${customer}','${otherUser}',true);
    create table profiles(id uuid primary key,full_name text,email text);
    insert into profiles values('${operator}','Operator',null),('${recipient}','Recipient',null),('${otherUser}','Other user',null);
    create function support_provider_org_id() returns uuid language sql as $$select '${provider}'::uuid$$;
    create function org_is_saas_admin(uuid) returns boolean language sql as $$select $1 in('${provider}'::uuid,'${internal}'::uuid)$$;
    create function current_user_has_saas_admin_permission() returns boolean language sql as $$select org_is_saas_admin(current_org_id()) and auth.uid()='${operator}'::uuid$$;
    create function support_ticket_code(bigint) returns text language sql as $$select 'TS-'||$1::text$$;
    create function kalam_upsert_notification_item(uuid,text,text,text,text,text,text,text,text,text,uuid[],uuid[],boolean,jsonb,timestamptz) returns uuid language sql as $$select gen_random_uuid()$$;
    create function kalam_realtime_org_topic(uuid) returns text language sql as $$select 'org:'||$1::text$$;
    create function kalam_broadcast_notification(text,text,jsonb) returns void language plpgsql as $$begin return;end$$;
    create table saas_support_categories(code text primary key,title text,is_active boolean default true);
    insert into saas_support_categories values('technical','Technical',true);
    create table saas_support_tickets(id uuid primary key default gen_random_uuid(),ticket_no bigint generated always as identity,
      org_id uuid,customer_org_id uuid,created_by uuid,category_code text,subject text,status text default 'waiting_operator',assigned_to uuid,
      created_at timestamptz default now(),updated_at timestamptz default now(),last_message_at timestamptz default now(),first_response_at timestamptz,closed_at timestamptz);
    create table saas_support_messages(id uuid primary key default gen_random_uuid(),org_id uuid,ticket_id uuid,author_id uuid,visibility text,message_kind text default 'reply',body text,created_at timestamptz default now());
    create table saas_support_reads(ticket_id uuid,user_id uuid,last_read_at timestamptz);
    create table saas_support_attachments(id uuid,message_id uuid,file_name text,mime_type text,file_size bigint,object_path text);
    create table saas_support_forwards(id uuid,ticket_id uuid,source_message_id uuid,note_message_id uuid,recipient_id uuid);
    create table saas_support_forward_attachments(forward_id uuid,attachment_id uuid);
    create table saas_support_events(id uuid default gen_random_uuid(),org_id uuid,ticket_id uuid,actor_id uuid,event_type text,old_value text,new_value text,details jsonb,created_at timestamptz default now());`);
  for (const name of ['support_customer_can','support_is_operator','support_unread_total','support_list_tickets']) await db.exec(definition(sql563,name));
  for (const name of ['support_can_view_ticket','support_customer_notification_recipients','support_get_ticket','support_create_ticket','support_send_message','support_can_attach_to_message']) await db.exec(definition(sql545,name));
  await db.exec(migration);await db.exec(migration);
}, 60000);
afterAll(async () => { await db?.close(); });

describe.sequential('shared support inbox direction and recipients', () => {
  it('allows both internal desks to start outgoing tickets', async () => {
    await actor(internal,operator);
    const result = await db.query<{value: { id: string }}>("select support_create_outgoing_ticket($1,$2,'technical','Hello customer','Support message') value",[customer,recipient]);
    outgoingId=result.rows[0].value.id;
    const list=await db.query<{value: any[]}>('select support_list_tickets() value');
    expect(list.rows[0].value[0]).toMatchObject({ id:outgoingId,ticket_type:'outgoing',customer_user_id:recipient });
    await actor(provider,operator);
    expect((await db.query<{value:any[]}>('select support_list_tickets() value')).rows[0].value).toHaveLength(1);
  });
  it('delivers the outgoing ticket to its recipient with an unread count, without exposing it to other members', async () => {
    await actor(customer,recipient);
    expect((await db.query<{value:number}>('select support_unread_total() value')).rows[0].value).toBe(1);
    const thread=(await db.query<{value:any}>('select support_get_ticket($1) value',[outgoingId])).rows[0].value;
    expect(thread.ticket).toMatchObject({ticket_type:'outgoing',customer_user_id:recipient,created_by:operator});
    expect((await db.query<{value:string[]}>('select support_customer_notification_recipients($1) value',[outgoingId])).rows[0].value).toEqual([recipient]);
    await db.query("select support_send_message($1,'Customer reply',false)",[outgoingId]);
    await actor(customer,otherUser);
    expect((await db.query<{value:any[]}>('select support_list_tickets() value')).rows[0].value).toEqual([]);
    await expect(db.query('select support_get_ticket($1)',[outgoingId])).rejects.toThrow('support_access_denied');
  });
  it('keeps direction stable after a reply and counts unread messages for both admin organizations', async () => {
    for (const org of [internal,provider]) {
      await actor(org,operator);
      expect((await db.query<{value:number}>('select support_unread_total() value')).rows[0].value).toBe(1);
      expect((await db.query<{value:any}>('select support_get_ticket($1) value',[outgoingId])).rows[0].value.ticket.ticket_type).toBe('outgoing');
    }
  });
  it('blocks tenant initiation, cross-organization recipients and tenant workflows', async () => {
    await actor(customer,recipient);
    await expect(db.query("select support_create_outgoing_ticket($1,$2,'technical','Denied','Denied')",[customer,recipient])).rejects.toThrow('support_access_denied');
    await expect(db.query('select support_workflow_context()')).rejects.toThrow('support_access_denied');
    await actor(internal,operator);
    await expect(db.query("select support_create_outgoing_ticket($1,$2,'technical','Denied','Denied')",[outsider,recipient])).rejects.toThrow('support_recipient_invalid');
    expect((await db.query<{value:string}>('select support_workflow_context() value')).rows[0].value).toBe(provider);
  });
  it('retains customer initiation as incoming', async () => {
    await actor(customer,recipient);
    const created=(await db.query<{value:any}>("select support_create_ticket('technical','Customer initiated','Customer message') value")).rows[0].value;
    const ticket=(await db.query<{value:any}>('select support_get_ticket($1) value',[created.id])).rows[0].value.ticket;
    expect(ticket.ticket_type).toBe('incoming');
  });
});
