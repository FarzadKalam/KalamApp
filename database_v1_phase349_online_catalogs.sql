-- Phase 349: Online catalogs
-- Tenant-safe public catalogs with stable presentation configuration and live source records.

begin;

alter table if exists public.company_settings add column if not exists slogan text;

create table if not exists public.online_catalogs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.current_org_id(),
  module_id text not null check (module_id in ('products', 'billboards', 'price_lists', 'product_bundles')),
  title text not null,
  public_description text,
  internal_description text,
  template_id text not null default 'catalog_grid' check (template_id in ('catalog_grid', 'catalog_fullpage')),
  is_active boolean not null default true,
  content_update_mode text not null default 'live' check (content_update_mode in ('static', 'live')),
  public_token text not null default substr(encode(sha256(cast(gen_random_uuid()::text || clock_timestamp()::text || random()::text as bytea)), 'hex'), 1, 48),
  source_record_ids jsonb not null default '[]'::jsonb,
  content_snapshot jsonb not null default '[]'::jsonb,
  display_field_keys jsonb not null default '[]'::jsonb,
  presentation jsonb not null default '{}'::jsonb,
  tags jsonb not null default '[]'::jsonb,
  record_count integer not null default 0 check (record_count >= 0),
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_refreshed_at timestamptz not null default now(),
  constraint online_catalogs_source_ids_array check (jsonb_typeof(source_record_ids) = 'array'),
  constraint online_catalogs_content_snapshot_array check (jsonb_typeof(content_snapshot) = 'array'),
  constraint online_catalogs_display_fields_array check (jsonb_typeof(display_field_keys) = 'array'),
  constraint online_catalogs_tags_array check (jsonb_typeof(tags) = 'array')
);

create table if not exists public.online_catalog_org_defaults (
  org_id uuid primary key default public.current_org_id(),
  feature_cards jsonb not null default '[]'::jsonb,
  customers jsonb not null default '[]'::jsonb,
  updated_by uuid,
  updated_at timestamptz not null default now()
);

create unique index if not exists online_catalogs_public_token_uidx on public.online_catalogs(public_token);
create index if not exists online_catalogs_org_module_updated_idx on public.online_catalogs(org_id, module_id, updated_at desc);
create index if not exists online_catalogs_org_active_idx on public.online_catalogs(org_id, is_active) where is_active;

create or replace function public.online_catalogs_set_derived_fields()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.public_token is null or new.public_token !~ '^[0-9a-f]{48}$' then
    new.public_token := substr(encode(sha256(cast(gen_random_uuid()::text || clock_timestamp()::text || random()::text as bytea)), 'hex'), 1, 48);
  end if;
  new.record_count := jsonb_array_length(coalesce(new.source_record_ids, '[]'::jsonb));
  new.updated_at := now();
  if tg_op = 'INSERT' then
    new.last_refreshed_at := now();
  elsif new.source_record_ids is distinct from old.source_record_ids
     or new.display_field_keys is distinct from old.display_field_keys
     or new.presentation is distinct from old.presentation
     or new.content_snapshot is distinct from old.content_snapshot
     or new.content_update_mode is distinct from old.content_update_mode then
    new.last_refreshed_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_online_catalogs_derived_fields on public.online_catalogs;
create trigger trg_online_catalogs_derived_fields
  before insert or update on public.online_catalogs
  for each row execute function public.online_catalogs_set_derived_fields();

alter table public.online_catalogs enable row level security;
alter table public.online_catalog_org_defaults enable row level security;

drop policy if exists online_catalogs_org_select on public.online_catalogs;
drop policy if exists online_catalogs_org_insert on public.online_catalogs;
drop policy if exists online_catalogs_org_update on public.online_catalogs;
drop policy if exists online_catalogs_org_delete on public.online_catalogs;
create policy online_catalogs_org_select on public.online_catalogs for select to authenticated using (org_id = public.current_org_id());
create policy online_catalogs_org_insert on public.online_catalogs for insert to authenticated with check (org_id = public.current_org_id());
create policy online_catalogs_org_update on public.online_catalogs for update to authenticated using (org_id = public.current_org_id()) with check (org_id = public.current_org_id());
create policy online_catalogs_org_delete on public.online_catalogs for delete to authenticated using (org_id = public.current_org_id());

drop policy if exists online_catalog_org_defaults_org_select on public.online_catalog_org_defaults;
drop policy if exists online_catalog_org_defaults_org_insert on public.online_catalog_org_defaults;
drop policy if exists online_catalog_org_defaults_org_update on public.online_catalog_org_defaults;
create policy online_catalog_org_defaults_org_select on public.online_catalog_org_defaults for select to authenticated using (org_id = public.current_org_id());
create policy online_catalog_org_defaults_org_insert on public.online_catalog_org_defaults for insert to authenticated with check (org_id = public.current_org_id());
create policy online_catalog_org_defaults_org_update on public.online_catalog_org_defaults for update to authenticated using (org_id = public.current_org_id()) with check (org_id = public.current_org_id());

grant select, insert, update, delete on public.online_catalogs to authenticated;
grant select, insert, update on public.online_catalog_org_defaults to authenticated;

create or replace function public.list_online_catalog_live_counts()
returns table(catalog_id uuid, live_count integer)
language sql security invoker set search_path = public as $$
  select c.id,
    case c.module_id
      when 'products' then (select count(*)::integer from public.products p where p.org_id = c.org_id and p.id = any(array(select value::uuid from jsonb_array_elements_text(c.source_record_ids) where value ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')))
      when 'billboards' then (select count(*)::integer from public.billboards b where b.org_id = c.org_id and b.id = any(array(select value::uuid from jsonb_array_elements_text(c.source_record_ids) where value ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')))
      when 'price_lists' then (select count(*)::integer from public.price_lists p where p.org_id = c.org_id and p.id = any(array(select value::uuid from jsonb_array_elements_text(c.source_record_ids) where value ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')))
      when 'product_bundles' then (select count(*)::integer from public.product_bundles p where p.org_id = c.org_id and p.id = any(array(select value::uuid from jsonb_array_elements_text(c.source_record_ids) where value ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')))
      else 0
    end as live_count
  from public.online_catalogs c
  where c.org_id = public.current_org_id();
$$;

revoke all on function public.list_online_catalog_live_counts() from public, anon;
grant execute on function public.list_online_catalog_live_counts() to authenticated;

create or replace function public.online_catalog_filter_fields(payload jsonb, requested jsonb)
returns jsonb language sql immutable set search_path = public as $$
  select coalesce(jsonb_object_agg(entry.key, entry.value), '{}'::jsonb)
  from jsonb_each(coalesce(payload, '{}'::jsonb)) entry
  where jsonb_exists(coalesce(requested, '[]'::jsonb), entry.key)
    and entry.key !~* '(^id$|_id$|uuid|org|token|secret|password|created_by|updated_by)';
$$;

revoke all on function public.online_catalog_filter_fields(jsonb, jsonb) from public, anon, authenticated;

create or replace function public.get_public_online_catalog(p_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_catalog public.online_catalogs%rowtype;
  v_company jsonb := '{}'::jsonb;
  v_items jsonb := '[]'::jsonb;
  v_ids uuid[];
begin
  if p_token is null or p_token !~ '^[0-9a-f]{48}$' then return jsonb_build_object('error', 'not_found'); end if;
  select * into v_catalog from public.online_catalogs where public_token = p_token and is_active = true limit 1;
  if not found then return jsonb_build_object('error', 'not_found'); end if;

  select jsonb_strip_nulls(jsonb_build_object(
    'company_name', coalesce(company_full_name, company_name, trade_name), 'trade_name', trade_name,
    'company_name_en', company_name_en, 'slogan', slogan, 'logo_url', logo_url, 'phone', phone,
    'mobile', mobile, 'email', email, 'website', website, 'address', address, 'instagram_id', instagram_id,
    'whatsapp_number', whatsapp_number, 'telegram_id', telegram_id, 'palette_key', brand_palette_key
  )) into v_company from public.company_settings where org_id = v_catalog.org_id order by updated_at desc limit 1;

  select coalesce(array_agg(value::uuid), '{}'::uuid[]) into v_ids
  from jsonb_array_elements_text(v_catalog.source_record_ids)
  where value ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';

  if v_catalog.module_id in ('products', 'billboards') then
    if v_catalog.module_id = 'products' then
      select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'title', p.name, 'image_url', p.image_url, 'status', p.status,
        'fields', public.online_catalog_filter_fields(to_jsonb(p), v_catalog.display_field_keys)
      )) order by p.updated_at desc), '[]'::jsonb) into v_items from public.products p where p.org_id = v_catalog.org_id and p.id = any(v_ids);
    else
      select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'title', coalesce(b.name, b.address), 'image_url', b.image_url, 'status', b.status, 'location', b.location,
        'fields', public.online_catalog_filter_fields(to_jsonb(b), v_catalog.display_field_keys)
      )) order by b.updated_at desc), '[]'::jsonb) into v_items from public.billboards b where b.org_id = v_catalog.org_id and b.id = any(v_ids);
    end if;
  elsif v_catalog.module_id = 'price_lists' then
    select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
      'title', coalesce(p.name, b.name, item.value->>'product_name', item.value->>'name'),
      'image_url', coalesce(p.image_url, b.image_url), 'status', coalesce(p.status, b.status),
      'location', b.location,
      'fields', public.online_catalog_filter_fields(item.value, v_catalog.display_field_keys)
    ))), '[]'::jsonb) into v_items
    from public.price_lists pl cross join lateral jsonb_array_elements(coalesce(pl.items, '[]'::jsonb)) item
    left join public.products p on p.id::text = item.value->>'product_id' and p.org_id = pl.org_id
    left join public.billboards b on b.id::text = item.value->>'product_id' and b.org_id = pl.org_id
    where pl.org_id = v_catalog.org_id and pl.id = any(v_ids);
  else
    select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
      'title', coalesce(p.name, b.name, item.value->>'product_name', item.value->>'name'),
      'image_url', coalesce(p.image_url, b.image_url), 'status', coalesce(p.status, b.status),
      'location', b.location,
      'fields', public.online_catalog_filter_fields(item.value, v_catalog.display_field_keys)
    ))), '[]'::jsonb) into v_items
    from public.product_bundles pb cross join lateral jsonb_array_elements(coalesce(pb.products, '[]'::jsonb)) item
    left join public.products p on p.id::text = item.value->>'product_id' and p.org_id = pb.org_id
    left join public.billboards b on b.id::text = item.value->>'product_id' and b.org_id = pb.org_id
    where pb.org_id = v_catalog.org_id and pb.id = any(v_ids);
  end if;

  return jsonb_build_object(
    'catalog', jsonb_build_object('title', v_catalog.title, 'description', v_catalog.public_description,
      'template_id', v_catalog.template_id, 'presentation', v_catalog.presentation, 'record_count', jsonb_array_length(v_items),
      'last_refreshed_at', v_catalog.last_refreshed_at, 'module_id', v_catalog.module_id, 'display_field_keys', v_catalog.display_field_keys),
    'company', coalesce(v_company, '{}'::jsonb), 'items', v_items
  );
end;
$$;

revoke all on function public.get_public_online_catalog(text) from public, authenticated;
grant execute on function public.get_public_online_catalog(text) to anon;

commit;
