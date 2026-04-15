-- KalamApp V1 - Phase 100
-- Persian runtime errors for already-deployed database functions.
-- Run this migration on the current database; old migrations do not need to be replayed.

begin;

create or replace function public.trg_validate_posted_journal_entry()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total_debit numeric(18,2);
  v_total_credit numeric(18,2);
begin
  if (new.status = 'posted' and coalesce(old.status, '') <> 'posted') then
    select
      coalesce(sum(l.debit), 0)::numeric(18,2),
      coalesce(sum(l.credit), 0)::numeric(18,2)
    into v_total_debit, v_total_credit
    from public.journal_lines l
    where l.entry_id = new.id;

    new.total_debit = v_total_debit;
    new.total_credit = v_total_credit;

    if v_total_debit <= 0 or v_total_credit <= 0 then
      raise exception 'برای ثبت نهایی، سند باید حداقل یک ردیف بدهکار و یک ردیف بستانکار با مبلغ غیرصفر داشته باشد.';
    end if;

    if abs(v_total_debit - v_total_credit) > 0.009 then
      raise exception 'سند تراز نیست. جمع بدهکار (%) و بستانکار (%) باید برابر باشد.', v_total_debit, v_total_credit;
    end if;

    new.posted_at = coalesce(new.posted_at, now());
    new.posted_by = coalesce(new.posted_by, auth.uid());
  end if;

  return new;
end;
$$;

create or replace function public.trg_guard_journal_entry_lifecycle()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_start_date date;
  v_end_date date;
  v_is_closed boolean;
begin
  if new.fiscal_year_id is not null then
    select fy.start_date, fy.end_date, fy.is_closed
    into v_start_date, v_end_date, v_is_closed
    from public.fiscal_years fy
    where fy.id = new.fiscal_year_id;

    if not found then
      raise exception 'سال مالی سند پیدا نشد.';
    end if;

    if new.entry_date < v_start_date or new.entry_date > v_end_date then
      raise exception 'تاریخ سند (%) خارج از بازه سال مالی (% تا %) است.', new.entry_date, v_start_date, v_end_date;
    end if;

    if new.status = 'posted' and coalesce(v_is_closed, false) then
      raise exception 'ثبت نهایی در سال مالی بسته مجاز نیست.';
    end if;
  elsif new.status = 'posted' then
    raise exception 'برای ثبت نهایی، انتخاب سال مالی الزامی است.';
  end if;

  if tg_op = 'UPDATE' then
    if old.status = 'posted' and new.status = 'draft' then
      raise exception 'سند ثبت‌نهایی‌شده قابل برگشت به پیش‌نویس نیست.';
    end if;

    if old.status = 'posted' and new.status = 'posted' then
      if new.entry_date is distinct from old.entry_date
         or new.description is distinct from old.description
         or new.fiscal_year_id is distinct from old.fiscal_year_id
         or new.entry_no is distinct from old.entry_no
         or new.source_module is distinct from old.source_module
         or new.source_table is distinct from old.source_table
         or new.source_record_id is distinct from old.source_record_id then
        raise exception 'سند ثبت‌نهایی‌شده قفل است و قابل ویرایش مستقیم نیست.';
      end if;
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.trg_guard_journal_entry_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(nullif(old.status, ''), 'draft') <> 'draft' then
    raise exception 'فقط اسناد پیش‌نویس قابل حذف هستند.';
  end if;
  return old;
end;
$$;

create or replace function public.trg_guard_journal_lines_mutation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entry_id uuid;
  v_status text;
begin
  v_entry_id := coalesce(new.entry_id, old.entry_id);

  if v_entry_id is null then
    raise exception 'هر ردیف سند باید به یک سند حسابداری معتبر متصل باشد.';
  end if;

  select e.status
  into v_status
  from public.journal_entries e
  where e.id = v_entry_id;

  if v_status is null then
    if tg_op = 'DELETE' then
      return old;
    end if;
    raise exception 'سند والد برای تغییر ردیف پیدا نشد.';
  end if;

  if v_status <> 'draft' then
    raise exception 'فقط ردیف‌های اسناد پیش‌نویس قابل تغییر هستند.';
  end if;

  if tg_op = 'UPDATE' and new.entry_id is distinct from old.entry_id then
    select e.status
    into v_status
    from public.journal_entries e
    where e.id = new.entry_id;

    if v_status is null then
      raise exception 'سند مقصد برای انتقال ردیف پیدا نشد.';
    end if;

    if v_status <> 'draft' then
      raise exception 'انتقال ردیف به سند غیرپیش‌نویس مجاز نیست.';
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

create or replace function public.prevent_org_role_cycle()
returns trigger
language plpgsql
as $$
declare
  v_parent_id uuid;
begin
  if new.parent_id is null then
    return new;
  end if;

  if new.parent_id = new.id then
    raise exception 'جایگاه سازمانی نمی‌تواند زیرمجموعه خودش باشد.';
  end if;

  v_parent_id := new.parent_id;
  while v_parent_id is not null loop
    if v_parent_id = new.id then
      raise exception 'ساختار جایگاه‌های سازمانی چرخه دارد و معتبر نیست.';
    end if;

    select parent_id
      into v_parent_id
    from public.org_roles
    where id = v_parent_id;
  end loop;

  return new;
end;
$$;

create or replace function public.reserve_taxpayer_invoice_serial(
  p_org_id uuid,
  p_fiscal_id text,
  p_min_last_serial bigint default 0
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_serial bigint;
  v_fiscal_id text := upper(nullif(btrim(coalesce(p_fiscal_id, '')), ''));
  v_min_last_serial bigint := greatest(coalesce(p_min_last_serial, 0), 0);
begin
  if p_org_id is null then
    raise exception 'شناسه سازمان الزامی است.';
  end if;

  if v_fiscal_id is null then
    raise exception 'شناسه مالیاتی الزامی است.';
  end if;

  insert into public.taxpayer_invoice_sequences (org_id, fiscal_id, last_serial)
  values (p_org_id, v_fiscal_id, v_min_last_serial + 1)
  on conflict (org_id, fiscal_id)
  do update set
    last_serial = greatest(public.taxpayer_invoice_sequences.last_serial, v_min_last_serial) + 1,
    updated_at = now()
  returning last_serial into v_serial;

  return v_serial;
end;
$$;

create or replace function public.create_process_run_from_template(
  p_org_id uuid,
  p_template_id uuid,
  p_module_id text,
  p_record_id uuid,
  p_process_name text default null,
  p_copied_mode text default 'manual'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_run_id uuid;
  v_template_name text;
begin
  select t.name
    into v_template_name
  from public.process_templates t
  where t.id = p_template_id
    and t.org_id = p_org_id;

  if v_template_name is null then
    raise exception 'الگوی فرآیند برای این سازمان پیدا نشد. org_id=% template_id=%', p_org_id, p_template_id;
  end if;

  insert into public.process_runs (
    org_id,
    template_id,
    module_id,
    record_id,
    process_name,
    status,
    copied_mode,
    started_at,
    created_by,
    updated_by
  )
  values (
    p_org_id,
    p_template_id,
    p_module_id,
    p_record_id,
    coalesce(nullif(p_process_name, ''), v_template_name),
    'active',
    case when p_copied_mode in ('manual', 'auto') then p_copied_mode else 'manual' end,
    now(),
    auth.uid(),
    auth.uid()
  )
  returning id into v_run_id;

  if p_record_id is not null and nullif(trim(coalesce(p_module_id, '')), '') is not null then
    insert into public.process_run_links (process_run_id, module_id, record_id, is_primary)
    values (v_run_id, p_module_id, p_record_id, true)
    on conflict (process_run_id, module_id, record_id) do update
      set is_primary = excluded.is_primary;
  end if;

  insert into public.process_run_stages (
    process_run_id,
    template_stage_id,
    stage_name,
    sort_order,
    status,
    assignee_user_id,
    assignee_role_id,
    wage,
    metadata
  )
  select
    v_run_id,
    s.id,
    s.stage_name,
    s.sort_order,
    s.default_status,
    s.default_assignee_id,
    s.default_assignee_role_id,
    s.wage,
    s.metadata
  from public.process_template_stages s
  where s.template_id = p_template_id
  order by s.sort_order, s.created_at;

  return v_run_id;
end;
$$;

create or replace function public.move_records_to_recycle_bin(
  p_module_id text,
  p_source_table text,
  p_record_ids uuid[],
  p_deleted_by uuid default auth.uid(),
  p_deleted_by_name text default null,
  p_org_id uuid default public.current_org_id()
)
returns integer
language plpgsql
set search_path = public
as $$
declare
  v_source_table text;
  v_record_id uuid;
  v_snapshot jsonb;
  v_count integer := 0;
begin
  v_source_table := public.resolve_recycle_bin_source_table(p_source_table);
  if v_source_table is null then
    raise exception 'منبع سطل بازیافت معتبر نیست: %', p_source_table;
  end if;

  foreach v_record_id in array coalesce(p_record_ids, array[]::uuid[])
  loop
    execute format(
      'select to_jsonb(t) from public.%I t where t.id = $1',
      v_source_table
    )
    into v_snapshot
    using v_record_id;

    if v_snapshot is null then
      raise exception 'رکورد % در ماژول % پیدا نشد یا قبلا حذف شده است.', v_record_id, p_module_id;
    end if;

    delete from public.recycle_bin_records
    where source_table = v_source_table
      and source_record_id = v_record_id;

    insert into public.recycle_bin_records (
      org_id,
      module_id,
      source_table,
      source_record_id,
      record_title,
      snapshot,
      deleted_by,
      deleted_by_name
    )
    values (
      coalesce(p_org_id, (v_snapshot->>'org_id')::uuid, public.current_org_id()),
      trim(coalesce(p_module_id, '')),
      v_source_table,
      v_record_id,
      public.recycle_bin_record_title(v_snapshot),
      v_snapshot,
      p_deleted_by,
      nullif(trim(coalesce(p_deleted_by_name, '')), '')
    );

    execute format(
      'delete from public.%I where id = $1',
      v_source_table
    )
    using v_record_id;

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

create or replace function public.restore_recycle_bin_records(
  p_recycle_ids uuid[]
)
returns integer
language plpgsql
set search_path = public
as $$
declare
  v_recycle_id uuid;
  v_row public.recycle_bin_records%rowtype;
  v_columns text;
  v_count integer := 0;
begin
  foreach v_recycle_id in array coalesce(p_recycle_ids, array[]::uuid[])
  loop
    select *
    into v_row
    from public.recycle_bin_records
    where id = v_recycle_id;

    if not found then
      raise exception 'رکورد سطل بازیافت % پیدا نشد.', v_recycle_id;
    end if;

    if v_row.expires_at < now() then
      delete from public.recycle_bin_records where id = v_recycle_id;
      raise exception 'مهلت بازگردانی رکورد سطل بازیافت % تمام شده است.', v_recycle_id;
    end if;

    select string_agg(format('%I', c.column_name), ', ' order by c.ordinal_position)
    into v_columns
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = v_row.source_table
      and v_row.snapshot ? c.column_name;

    if v_columns is null then
      raise exception 'ستون‌های لازم برای جدول % پیدا نشد.', v_row.source_table;
    end if;

    execute format(
      'insert into public.%I (%s) select %s from jsonb_populate_record(null::public.%I, $1)',
      v_row.source_table,
      v_columns,
      v_columns,
      v_row.source_table
    )
    using v_row.snapshot;

    delete from public.recycle_bin_records where id = v_recycle_id;
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

notify pgrst, 'reload schema';

commit;
