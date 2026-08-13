-- ویترین‌های محصولات، رسانه‌ها، کامنت‌ها و رویدادهای تعاملی اینستاگرام.
-- همهٔ داده‌ها در سطح سازمان ایزوله و دسترسی گفتگوها fail-closed است.

begin;

create table if not exists public.instagram_product_showcases (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  account_id uuid references public.instagram_accounts(id) on delete set null,
  name text not null,
  description text,
  source_kind text not null default 'manual' check (source_kind in ('manual','price_list','online_catalog')),
  source_id uuid,
  presentation jsonb not null default '{"layout":"carousel","max_items":10}'::jsonb,
  button_templates jsonb not null default '[]'::jsonb,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint instagram_product_showcases_org_name_unique unique (org_id, name)
);

create table if not exists public.instagram_product_showcase_items (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  showcase_id uuid not null references public.instagram_product_showcases(id) on delete cascade,
  source_module_id text not null check (source_module_id in ('products','billboards','product_bundles')),
  source_record_id uuid not null,
  sort_order integer not null default 0,
  title_override text,
  image_override_url text,
  field_bindings jsonb not null default '{"title":"name","description":"description","price":"price","unit":"unit_name"}'::jsonb,
  snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint instagram_product_showcase_items_unique unique (showcase_id, source_module_id, source_record_id)
);

create table if not exists public.instagram_social_media (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  provider_id uuid not null references public.instagram_providers(id) on delete cascade,
  account_id uuid not null references public.instagram_accounts(id) on delete cascade,
  provider_media_id text not null,
  media_type text not null check (media_type in ('post','reel','story')),
  caption text,
  media_url text,
  thumbnail_url text,
  permalink text,
  metrics jsonb not null default '{}'::jsonb,
  provider_payload jsonb not null default '{}'::jsonb,
  published_at timestamptz,
  expires_at timestamptz,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint instagram_social_media_provider_unique unique (provider_id, provider_media_id)
);

create table if not exists public.instagram_comments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  provider_id uuid not null references public.instagram_providers(id) on delete cascade,
  account_id uuid not null references public.instagram_accounts(id) on delete cascade,
  media_id uuid not null references public.instagram_social_media(id) on delete cascade,
  provider_comment_id text not null,
  parent_comment_id uuid references public.instagram_comments(id) on delete cascade,
  author_scoped_id text,
  author_username text,
  author_name text,
  author_profile_photo_url text,
  content_text text not null,
  like_count integer not null default 0,
  status text not null default 'new' check (status in ('new','open','pending','resolved','hidden')),
  tags jsonb not null default '[]'::jsonb,
  assignee_user_id uuid references public.profiles(id) on delete set null,
  assignee_role_id uuid references public.org_roles(id) on delete set null,
  provider_payload jsonb not null default '{}'::jsonb,
  commented_at timestamptz,
  replied_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint instagram_comments_provider_unique unique (provider_id, provider_comment_id)
);

create table if not exists public.instagram_interaction_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  provider_id uuid references public.instagram_providers(id) on delete set null,
  account_id uuid references public.instagram_accounts(id) on delete set null,
  account_username text,
  conversation_id uuid references public.instagram_conversations(id) on delete set null,
  comment_id uuid references public.instagram_comments(id) on delete set null,
  showcase_id uuid references public.instagram_product_showcases(id) on delete set null,
  showcase_item_id uuid references public.instagram_product_showcase_items(id) on delete set null,
  event_type text not null check (event_type in ('direct_received','comment_received','comment_replied','showcase_button_clicked')),
  button_key text,
  message_text text,
  tags jsonb not null default '[]'::jsonb,
  payload jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  processed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_instagram_showcases_org_account on public.instagram_product_showcases(org_id, account_id, is_active);
create index if not exists idx_instagram_showcase_items_showcase_sort on public.instagram_product_showcase_items(showcase_id, sort_order, id);
create index if not exists idx_instagram_social_media_org_account_published on public.instagram_social_media(org_id, account_id, published_at desc, id desc);
create index if not exists idx_instagram_comments_org_media_commented on public.instagram_comments(org_id, media_id, commented_at desc, id desc);
create index if not exists idx_instagram_events_org_type_occurred on public.instagram_interaction_events(org_id, event_type, occurred_at desc, id desc);
create index if not exists idx_instagram_events_tags_gin on public.instagram_interaction_events using gin(tags);

alter table public.instagram_product_showcases enable row level security;
alter table public.instagram_product_showcase_items enable row level security;
alter table public.instagram_social_media enable row level security;
alter table public.instagram_comments enable row level security;
alter table public.instagram_interaction_events enable row level security;

create or replace function public.kalam_can_view_instagram_org(p_org_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_permissions jsonb := '{}'::jsonb;
begin
  if auth.uid() is null or p_org_id is null or p_org_id <> public.current_org_id() then return false; end if;
  select coalesce(role_row.permissions, '{}'::jsonb) into v_permissions
  from public.profiles profile_row
  left join public.org_roles role_row on role_row.id = profile_row.role_id and role_row.org_id = profile_row.org_id
  where profile_row.id = auth.uid() and profile_row.org_id = p_org_id
  limit 1;
  if not found then return false; end if;
  return lower(coalesce(v_permissions -> '__saas_admin' ->> 'view', 'false')) = 'true'
    or lower(coalesce(v_permissions -> '__saas_admin' ->> 'edit', 'false')) = 'true'
    or lower(coalesce(v_permissions -> 'instagram_conversations' ->> 'view', 'false')) = 'true';
end;
$$;

drop policy if exists instagram_product_showcases_org_select on public.instagram_product_showcases;
create policy instagram_product_showcases_org_select on public.instagram_product_showcases for select to authenticated using (org_id = public.current_org_id() and public.kalam_can_view_instagram_org(org_id));
drop policy if exists instagram_product_showcase_items_org_select on public.instagram_product_showcase_items;
create policy instagram_product_showcase_items_org_select on public.instagram_product_showcase_items for select to authenticated using (org_id = public.current_org_id() and public.kalam_can_view_instagram_org(org_id));
drop policy if exists instagram_social_media_org_select on public.instagram_social_media;
create policy instagram_social_media_org_select on public.instagram_social_media for select to authenticated using (org_id = public.current_org_id() and public.kalam_can_view_instagram_org(org_id));
drop policy if exists instagram_comments_org_select on public.instagram_comments;
create policy instagram_comments_org_select on public.instagram_comments for select to authenticated using (org_id = public.current_org_id() and public.kalam_can_view_instagram_org(org_id));
drop policy if exists instagram_interaction_events_org_select on public.instagram_interaction_events;
create policy instagram_interaction_events_org_select on public.instagram_interaction_events for select to authenticated using (org_id = public.current_org_id() and public.kalam_can_view_instagram_org(org_id));

revoke all on public.instagram_product_showcases, public.instagram_product_showcase_items, public.instagram_social_media, public.instagram_comments, public.instagram_interaction_events from anon, authenticated;
grant select on public.instagram_product_showcases, public.instagram_product_showcase_items, public.instagram_social_media, public.instagram_comments, public.instagram_interaction_events to authenticated;
grant execute on function public.kalam_can_view_instagram_org(uuid) to authenticated;
revoke all on function public.kalam_can_view_instagram_org(uuid) from public, anon;

-- رویدادهای اینستاگرام مانند سایر رکوردها وارد صف durable گردش‌کار می‌شوند.
-- شرط‌های «نوع رویداد، پیج، دکمه، متن و ویترین» از روی همین رکورد ساخته می‌شوند.
drop trigger if exists workflow_event_queue_row on public.instagram_interaction_events;
create trigger workflow_event_queue_row
  after insert or update on public.instagram_interaction_events
  for each row execute function public.enqueue_workflow_event_from_row();

update public.org_roles role_row
set permissions = jsonb_set(
  coalesce(role_row.permissions, '{}'::jsonb),
  '{instagram_conversations,fields,manage_showcases}',
  to_jsonb(lower(coalesce(role_row.permissions -> '__settings_tabs' ->> 'edit', 'false')) = 'true'),
  true
);

notify pgrst, 'reload schema';
commit;
