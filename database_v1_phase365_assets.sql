-- KalamApp V1 - Phase 365
-- ماژول اموال، ثبت خودکار از هزینه و تحویل داخلی امن

begin;

create table if not exists public.assets (
  id uuid primary key default gen_random_uuid()
);

alter table public.assets
  add column if not exists org_id uuid references public.organizations(id) on delete cascade default public.current_org_id(),
  add column if not exists name text not null default '',
  add column if not exists system_code text,
  add column if not exists asset_tag_code text,
  add column if not exists image_url text,
  add column if not exists status text not null default 'available',
  add column if not exists storage_location text,
  add column if not exists assignee_id uuid references public.profiles(id) on delete set null,
  add column if not exists assignee_type text,
  add column if not exists assignee_role_id uuid references public.org_roles(id) on delete set null,
  add column if not exists source_expense_document_id uuid references public.expense_documents(id) on delete set null,
  add column if not exists source_expense_row_key text,
  add column if not exists source_expense_unit_index integer,
  add column if not exists process_template_id uuid references public.process_templates(id) on delete set null,
  add column if not exists execution_process_draft jsonb not null default '{}'::jsonb,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists tags jsonb not null default '[]'::jsonb,
  add column if not exists notes text,
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists updated_by uuid references auth.users(id) on delete set null,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

alter table public.assets
  alter column org_id set not null;

alter table public.delivery_forms
  add column if not exists storage_location text;

alter table public.assets
  drop constraint if exists chk_assets_status,
  drop constraint if exists chk_assets_assignee_type;

alter table public.assets
  add constraint chk_assets_status
    check (status in ('available', 'assigned', 'maintenance', 'retired')) not valid,
  add constraint chk_assets_assignee_type
    check (assignee_type is null or assignee_type in ('user', 'role')) not valid;

create unique index if not exists idx_assets_org_system_code
  on public.assets(org_id, system_code)
  where nullif(btrim(system_code), '') is not null;

create unique index if not exists idx_assets_org_asset_tag_code
  on public.assets(org_id, asset_tag_code)
  where nullif(btrim(asset_tag_code), '') is not null;

create unique index if not exists idx_assets_expense_row_unit_once
  on public.assets(org_id, source_expense_document_id, source_expense_row_key, source_expense_unit_index);

create index if not exists idx_assets_org_status
  on public.assets(org_id, status, updated_at desc);
create index if not exists idx_assets_org_storage_location
  on public.assets(org_id, storage_location)
  where nullif(btrim(storage_location), '') is not null;
create index if not exists idx_assets_org_assignee
  on public.assets(org_id, assignee_id, assignee_role_id);
create index if not exists idx_assets_org_source_expense
  on public.assets(org_id, source_expense_document_id)
  where source_expense_document_id is not null;

alter table public.assets enable row level security;

drop policy if exists assets_select_org on public.assets;
create policy assets_select_org on public.assets
  for select to authenticated
  using (org_id = public.current_org_id());

drop policy if exists assets_insert_org on public.assets;
create policy assets_insert_org on public.assets
  for insert to authenticated
  with check (org_id = public.current_org_id());

drop policy if exists assets_update_org on public.assets;
create policy assets_update_org on public.assets
  for update to authenticated
  using (org_id = public.current_org_id())
  with check (org_id = public.current_org_id());

drop policy if exists assets_delete_org on public.assets;
create policy assets_delete_org on public.assets
  for delete to authenticated
  using (org_id = public.current_org_id());

grant select, insert, update, delete on public.assets to authenticated;

drop trigger if exists trg_assets_system_code_autogen on public.assets;
create trigger trg_assets_system_code_autogen
  before insert or update on public.assets
  for each row execute function public.assign_system_code_from_module_settings();

do $$
begin
  if to_regprocedure('public.kalam_record_audit_fields_before()') is not null then
    drop trigger if exists trg_kalam_record_audit_fields_before on public.assets;
    create trigger trg_kalam_record_audit_fields_before
      before insert or update on public.assets
      for each row execute function public.kalam_record_audit_fields_before();
  end if;
  if to_regprocedure('public.kalam_record_activity_after()') is not null then
    drop trigger if exists trg_kalam_record_activity_after on public.assets;
    create trigger trg_kalam_record_activity_after
      after insert or update or delete on public.assets
      for each row execute function public.kalam_record_activity_after();
  end if;
end $$;

create or replace function public.sync_assets_from_finalized_expense()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item jsonb;
  v_row_key text;
  v_title text;
  v_quantity numeric;
  v_unit integer;
begin
  if new.org_id is null or new.status not in ('approved', 'paid', 'posted') then
    return new;
  end if;

  for v_item in
    select value from jsonb_array_elements(coalesce(new.items, '[]'::jsonb))
  loop
    if not coalesce((v_item ->> 'is_asset')::boolean, false) then
      continue;
    end if;

    v_title := nullif(btrim(coalesce(v_item ->> 'description', '')), '');
    v_row_key := nullif(btrim(coalesce(v_item ->> 'row_key', '')), '');
    begin
      v_quantity := nullif(btrim(coalesce(v_item ->> 'quantity', '')), '')::numeric;
    exception when invalid_text_representation then
      v_quantity := null;
    end;

    if v_title is null then
      raise exception 'برای ثبت مال، شرح ردیف هزینه الزامی است.';
    end if;
    if v_row_key is null then
      raise exception 'شناسه داخلی ردیف مال معتبر نیست؛ ردیف هزینه را دوباره ذخیره کنید.';
    end if;
    if v_quantity is null or v_quantity <= 0 or trunc(v_quantity) <> v_quantity then
      raise exception 'تعداد ردیف ثبت به‌عنوان مال باید یک عدد صحیحِ بزرگ‌تر از صفر باشد.';
    end if;

    for v_unit in 1..v_quantity::integer loop
      insert into public.assets (
        org_id, name, status, source_expense_document_id,
        source_expense_row_key, source_expense_unit_index, metadata
      )
      values (
        new.org_id, v_title, 'available', new.id,
        v_row_key, v_unit,
        jsonb_build_object('source', 'expense_document', 'source_item_key', v_row_key, 'source_unit_index', v_unit)
      )
      on conflict (org_id, source_expense_document_id, source_expense_row_key, source_expense_unit_index) do nothing;
    end loop;
  end loop;

  return new;
end;
$$;

drop trigger if exists trg_expense_documents_sync_assets on public.expense_documents;
create trigger trg_expense_documents_sync_assets
  after insert or update of status, items on public.expense_documents
  for each row execute function public.sync_assets_from_finalized_expense();

create or replace function public.apply_internal_asset_delivery()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile_id uuid;
  v_item jsonb;
  v_asset_id uuid;
  v_asset_title text;
begin
  if new.org_id is null
     or new.form_type <> 'asset_delivery'
     or new.received_by_type <> 'internal'
     or new.status <> 'confirmed'
     or (tg_op = 'UPDATE' and old.status = 'confirmed') then
    return new;
  end if;

  if new.received_by_employee_id is null then
    raise exception 'برای تحویل داخلی مال، تحویل‌گیرنده داخلی را انتخاب کنید.';
  end if;
  if nullif(btrim(coalesce(new.storage_location, '')), '') is null then
    raise exception 'برای تحویل داخلی مال، محل نگهداری الزامی است.';
  end if;

  select e.related_profile_id
    into v_profile_id
  from public.employees e
  where e.id = new.received_by_employee_id
    and e.org_id = new.org_id
  limit 1;

  if v_profile_id is null then
    raise exception 'برای ثبت مسئول مال، ابتدا برای تحویل‌گیرنده داخلی کاربر مرتبط تعریف کنید.';
  end if;

  for v_item in
    select value from jsonb_array_elements(coalesce(new.items, '[]'::jsonb))
  loop
    begin
      v_asset_id := nullif(btrim(coalesce(v_item ->> 'asset_id', '')), '')::uuid;
    exception when invalid_text_representation then
      raise exception 'یکی از اقلام فرم تحویل، مال نامعتبر دارد.';
    end;
    if v_asset_id is null then
      continue;
    end if;

    update public.assets
    set assignee_id = v_profile_id,
        assignee_type = 'user',
        assignee_role_id = null,
        storage_location = new.storage_location,
        status = 'assigned'
    where id = v_asset_id
      and org_id = new.org_id
    returning name into v_asset_title;

    if not found then
      raise exception 'مال انتخاب‌شده متعلق به سازمان جاری نیست یا پیدا نشد.';
    end if;

    insert into public.changelogs (
      org_id, module_id, record_id, action, record_title, metadata
    ) values (
      new.org_id, 'assets', v_asset_id::text, 'update', v_asset_title,
      jsonb_build_object(
        'source', 'asset_delivery',
        'delivery_form_id', new.id::text,
        'summary', 'تحویل داخلی مال از طریق فرم تحویل ثبت شد.'
      )
    );
  end loop;

  return new;
end;
$$;

drop trigger if exists trg_delivery_forms_apply_internal_asset_delivery on public.delivery_forms;
create trigger trg_delivery_forms_apply_internal_asset_delivery
  after insert or update of status on public.delivery_forms
  for each row execute function public.apply_internal_asset_delivery();

do $$
declare
  v_definition text;
  v_rewritten text;
begin
  if to_regprocedure('public.global_search_records(text,text[],integer,integer)') is null then
    return;
  end if;
  select pg_get_functiondef('public.global_search_records(text,text[],integer,integer)'::regprocedure)
    into v_definition;
  v_rewritten := regexp_replace(
    v_definition,
    '''expense_documents''[[:space:]]*,[[:space:]]*''employee_advances''',
    '''expense_documents'', ''assets'', ''employee_advances'''
  );
  if v_rewritten is distinct from v_definition then
    execute v_rewritten;
  end if;
end $$;

do $$
begin
  if to_regclass('public.saas_plans') is not null then
    update public.saas_plans
    set enabled_modules = jsonb_set(coalesce(enabled_modules, '{}'::jsonb), '{assets}', 'true'::jsonb, true);
  end if;
end $$;

notify pgrst, 'reload schema';

commit;
