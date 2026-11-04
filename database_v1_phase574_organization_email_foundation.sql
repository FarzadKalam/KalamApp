begin;

-- Email is a managed plan feature; existing plans retain the previously available SMTP capability.
update public.saas_plans set enabled_features=coalesce(enabled_features,'{}'::jsonb)||'{"organization_email":true}'::jsonb
where not coalesce(enabled_features,'{}'::jsonb) ? 'organization_email';

create table if not exists public.email_accounts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  label text not null, address text not null,
  mode text not null default 'custom' check(mode in ('custom','managed')),
  status text not null default 'pending' check(status in ('pending','configured','ready','error','disabled')),
  is_active boolean not null default false, is_default boolean not null default false,
  receive_enabled boolean not null default false,
  connection_config jsonb not null default '{}'::jsonb,
  last_sync_at timestamptz, last_error text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(id,org_id)
);
create unique index if not exists email_accounts_org_address on public.email_accounts(org_id,lower(address));
create unique index if not exists email_accounts_managed_address on public.email_accounts(lower(address)) where mode='managed';
create unique index if not exists email_accounts_default on public.email_accounts(org_id) where is_default and is_active;

-- Credentials, BCC and sync cursors are never exposed through authenticated table access.
create table if not exists public.email_account_secrets (
  account_id uuid primary key, org_id uuid not null,
  encrypted_credentials text, legacy_credentials jsonb,
  uid_validity text, last_uid bigint not null default 0,
  sync_locked_until timestamptz,
  foreign key(account_id,org_id) references public.email_accounts(id,org_id) on delete cascade
);
create index if not exists email_account_secrets_org on public.email_account_secrets(org_id);

-- Central sender configuration belongs to the provider organization (layer 1/2), not all tenants.
create table if not exists public.email_platform_settings (
  org_id uuid primary key references public.organizations(id),
  sender_address text, sender_name text, managed_domain text,
  managed_enabled boolean not null default false,
  encrypted_credentials text, updated_at timestamptz not null default now()
);

create table if not exists public.email_messages (
  id uuid primary key default gen_random_uuid(), org_id uuid not null,
  account_id uuid, thread_id uuid not null default gen_random_uuid(),
  direction text not null check(direction in ('inbound','outbound')),
  source text not null default 'manual' check(source in ('manual','automation','system','imap')),
  message_id text not null, in_reply_to text, references_ids text[] not null default '{}',
  external_id text, request_key uuid,
  from_address text not null, from_name text,
  to_addresses text[] not null default '{}', cc_addresses text[] not null default '{}',
  subject text not null default '', body_text text not null default '',
  attachments jsonb not null default '[]'::jsonb,
  status text not null check(status in ('queued','sending','provider_accepted','delivered','bounced','failed','received','unknown_delivery')),
  error_message text, provider_message_id text,
  related_module_id text, related_record_id uuid,
  outbound_message_id uuid references public.outbound_messages(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  message_at timestamptz not null default now(), created_at timestamptz not null default now(),
  foreign key(account_id,org_id) references public.email_accounts(id,org_id),
  foreign key(org_id) references public.organizations(id), unique(id,org_id)
);
create unique index if not exists email_messages_account_external on public.email_messages(account_id,external_id) where external_id is not null;
create unique index if not exists email_messages_org_request on public.email_messages(org_id,request_key) where request_key is not null;
create index if not exists email_messages_account_message_id on public.email_messages(account_id,message_id) where account_id is not null;
create index if not exists email_messages_org_time on public.email_messages(org_id,message_at desc,id desc);
create index if not exists email_messages_org_thread on public.email_messages(org_id,thread_id,message_at,id);
create index if not exists email_messages_org_direction on public.email_messages(org_id,direction,message_at desc,id desc);

create table if not exists public.email_message_private (
  message_id uuid primary key,org_id uuid not null,bcc_addresses text[] not null default '{}',
  foreign key(message_id,org_id) references public.email_messages(id,org_id) on delete cascade
);
create index if not exists email_message_private_org on public.email_message_private(org_id);
create table if not exists public.email_message_receipts (
  org_id uuid not null,message_id uuid not null,user_id uuid not null references auth.users(id) on delete cascade,
  read_at timestamptz not null default now(),primary key(message_id,user_id),
  foreign key(message_id,org_id) references public.email_messages(id,org_id) on delete cascade
);
create index if not exists email_message_receipts_org_user on public.email_message_receipts(org_id,user_id,message_id);

create or replace function public.email_can_access(p_action text default 'view')
returns boolean language plpgsql stable security definer set search_path=public as $$
declare ctx jsonb:=public.get_current_organization_context(); root jsonb; fields jsonb;
begin
  if ctx is null or not public.current_org_has_plan_feature('organization_email',false) then return false; end if;
  root:=coalesce(ctx->'permissions'->'__communications','{}'::jsonb); fields:=coalesce(root->'fields','{}'::jsonb);
  if p_action='manage' then
    return ctx->>'role' in ('admin','super_admin','manager')
      and coalesce((ctx->'permissions'->'__settings_tabs'->>'edit')::boolean,true);
  end if;
  if coalesce((root->>'view')::boolean,true)=false or coalesce((fields->>'use_email')::boolean,true)=false then return false; end if;
  return p_action='view' or (p_action='send' and coalesce((root->>'edit')::boolean,true) and coalesce((fields->>'send_email')::boolean,true));
end;
$$;
revoke all on function public.email_can_access(text) from public,anon;
grant execute on function public.email_can_access(text) to authenticated,service_role;

alter table public.email_accounts enable row level security;
alter table public.email_account_secrets enable row level security;
alter table public.email_platform_settings enable row level security;
alter table public.email_messages enable row level security;
alter table public.email_message_private enable row level security;
alter table public.email_message_receipts enable row level security;
revoke all on public.email_accounts,public.email_account_secrets,public.email_platform_settings,
  public.email_messages,public.email_message_private,public.email_message_receipts from public,anon,authenticated;
grant select on public.email_accounts,public.email_messages,public.email_message_receipts to authenticated;
grant all on public.email_accounts,public.email_account_secrets,public.email_platform_settings,
  public.email_messages,public.email_message_private,public.email_message_receipts to service_role;
drop policy if exists email_accounts_read on public.email_accounts;
create policy email_accounts_read on public.email_accounts for select to authenticated
  using(org_id=public.current_org_id() and public.email_can_access('view'));
drop policy if exists email_messages_read on public.email_messages;
create policy email_messages_read on public.email_messages for select to authenticated
  using(org_id=public.current_org_id() and public.email_can_access('view'));
drop policy if exists email_receipts_read on public.email_message_receipts;
create policy email_receipts_read on public.email_message_receipts for select to authenticated
  using(org_id=public.current_org_id() and user_id=auth.uid() and public.email_can_access('view'));

-- Preserve existing SMTP connections server-side, then remove browser-readable passwords.
insert into public.email_accounts(id,org_id,label,address,status,is_active,is_default)
select i.id,i.org_id,'ایمیل سازمان',coalesce(nullif(i.settings->>'from_email',''),i.settings->>'username'),
  'configured',coalesce(i.is_active,false),false
from public.integration_settings i where i.connection_type='email' and i.org_id is not null
  and nullif(i.settings->>'host','') is not null
  and coalesce(nullif(i.settings->>'from_email',''),i.settings->>'username') like '%@%'
on conflict do nothing;
insert into public.email_account_secrets(account_id,org_id,legacy_credentials)
select a.id,a.org_id,jsonb_build_object('smtp',i.settings) from public.email_accounts a
join public.integration_settings i on i.id=a.id where i.settings ? 'password'
on conflict(account_id) do nothing;
update public.integration_settings i set settings=i.settings-'password'
where i.connection_type='email' and exists(select 1 from public.email_account_secrets s where s.account_id=i.id);

create or replace function public.email_mark_read(p_message_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare v_org uuid:=public.current_org_id();
begin
  if not public.email_can_access('view') or not exists(select 1 from public.email_messages where id=p_message_id and org_id=v_org) then
    raise exception 'دسترسی به این ایمیل مجاز نیست.' using errcode='42501'; end if;
  insert into public.email_message_receipts(org_id,message_id,user_id) values(v_org,p_message_id,auth.uid())
    on conflict(message_id,user_id) do update set read_at=excluded.read_at;
end;
$$;
revoke all on function public.email_mark_read(uuid) from public,anon;
grant execute on function public.email_mark_read(uuid) to authenticated;

create or replace function public.email_list_messages(p_folder text default 'inbox',p_limit integer default 40,p_before timestamptz default null,p_before_id uuid default null,p_thread_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare v_org uuid:=public.current_org_id(); result jsonb;
begin
  if not public.email_can_access('view') then raise exception 'دسترسی به صندوق ایمیل فعال نیست.' using errcode='42501'; end if;
  select coalesce(jsonb_agg(item order by item->>'message_at' desc,item->>'id' desc),'[]'::jsonb) into result from (
    select (to_jsonb(m)-'body_text')||jsonb_build_object('body_text',left(m.body_text,200),'is_read',r.message_id is not null) item
    from public.email_messages m left join public.email_message_receipts r on r.message_id=m.id and r.user_id=auth.uid() and r.org_id=v_org
    where m.org_id=v_org
      and (p_thread_id is not null and m.thread_id=p_thread_id or p_thread_id is null and (
        p_folder='all' or p_folder='inbox' and m.direction='inbound' or p_folder='sent' and m.direction='outbound'
        or p_folder='unread' and m.direction='inbound' and r.message_id is null))
      and (p_before is null or (m.message_at,m.id)<(p_before,coalesce(p_before_id,'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid)))
    order by m.message_at desc,m.id desc limit least(greatest(p_limit,1),100)
  ) rows;
  return result;
end;
$$;
revoke all on function public.email_list_messages(text,integer,timestamptz,uuid,uuid) from public,anon;
grant execute on function public.email_list_messages(text,integer,timestamptz,uuid,uuid) to authenticated;

do $$ begin
  if exists(select 1 from pg_publication where pubname='supabase_realtime') then
    if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='email_messages') then
      alter publication supabase_realtime add table public.email_messages; end if;
    if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='email_message_receipts') then
      alter publication supabase_realtime add table public.email_message_receipts; end if;
  end if;
end $$;

insert into storage.buckets(id,name,public) values('email-attachments','email-attachments',false) on conflict(id) do nothing;
-- Downloads use short-lived server-signed URLs after checking the message's organization and permission.

notify pgrst,'reload schema';
commit;
