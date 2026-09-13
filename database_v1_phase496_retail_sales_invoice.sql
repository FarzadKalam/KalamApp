-- قابلیت فروشگاهی سریع، تنظیمات هر سازمان و مشتری عمومی tenant-safe.
begin;

alter table if exists public.products add column if not exists retail_quick_add_enabled boolean not null default false;
alter table if exists public.products add column if not exists retail_display_order integer;
alter table if exists public.product_bundles add column if not exists retail_quick_add_enabled boolean not null default false;
alter table if exists public.product_bundles add column if not exists retail_display_order integer;
alter table if exists public.company_settings add column if not exists retail_invoice_settings jsonb not null default '{}'::jsonb;
alter table if exists public.customers add column if not exists is_retail_general_customer boolean not null default false;

create unique index if not exists customers_one_retail_general_customer_per_org
  on public.customers (org_id) where is_retail_general_customer = true;
create index if not exists products_retail_quick_add_order_idx
  on public.products (org_id, retail_quick_add_enabled desc, retail_display_order, name);
create index if not exists product_bundles_retail_quick_add_order_idx
  on public.product_bundles (org_id, retail_quick_add_enabled desc, retail_display_order, name);

create or replace function public.ensure_retail_general_customer()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_org_id uuid := public.current_org_id(); v_customer_id uuid;
begin
  if v_org_id is null then raise exception 'سازمان فعال یافت نشد'; end if;
  select id into v_customer_id from public.customers where org_id = v_org_id and is_retail_general_customer = true limit 1;
  if v_customer_id is not null then return v_customer_id; end if;
  insert into public.customers (org_id, full_name, person_type, status, is_retail_general_customer)
  values (v_org_id, 'مشتری عمومی', 'real', 'active', true)
  on conflict (org_id) where is_retail_general_customer = true do update set full_name = public.customers.full_name
  returning id into v_customer_id;
  return v_customer_id;
end;
$$;
revoke all on function public.ensure_retail_general_customer() from public;
grant execute on function public.ensure_retail_general_customer() to authenticated;

update public.cms_landing_pages
set sections = (
  select jsonb_agg(section order by sort_order)
  from (
    select section, ordinality * 10 as sort_order
    from jsonb_array_elements(sections) with ordinality items(section, ordinality)
    union all
    select jsonb_build_object('id','cloud_access','type','cloud_access','enabled',true,'props',jsonb_build_object('eyebrow','همیشه در دسترس','title','کار شما در هر دستگاهی همراهتان است','text','تازه سیستم ابری، سریع و بهینه برای موبایل است.','highlights',jsonb_build_array('داده‌های همگام در همه دستگاه‌ها','رابط لمسی و موبایل‌محور','دسترسی امن از هرجا'))), 15
  ) ordered_sections
)
where slug = 'home' and not exists (select 1 from jsonb_array_elements(sections) s where s->>'id' = 'cloud_access');

notify pgrst, 'reload schema';
commit;
