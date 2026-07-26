-- پایداری اقلام و نرخ‌های پورسانت فاکتور و تاریخ احراز تأیید
-- قابل اجرا به‌صورت تکراری و ایمن برای تمام سازمان‌ها

begin;

alter table public.invoices
  add column if not exists approved_at timestamptz;

create or replace function public.snapshot_invoice_commission_items()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item jsonb;
  v_items jsonb := '[]'::jsonb;
  v_position bigint;
  v_product_id uuid;
  v_commission_percentage numeric;
begin
  for v_item, v_position in
    select value, ordinality
    from jsonb_array_elements(coalesce(new."invoiceItems", '[]'::jsonb)) with ordinality
  loop
    begin
      v_product_id := nullif(trim(v_item->>'product_id'), '')::uuid;
    exception when invalid_text_representation then
      v_product_id := null;
    end;

    if nullif(trim(v_item->>'row_key'), '') is null then
      v_item := v_item || jsonb_build_object('row_key', gen_random_uuid()::text);
    end if;

    if nullif(trim(v_item->>'commission_percentage_snapshot'), '') is null then
      v_commission_percentage := null;
      if coalesce(nullif(trim(v_item->>'commission_percentage'), '') ~ '^[0-9]+([.][0-9]+)?$', false)
        and (v_item->>'commission_percentage')::numeric > 0 then
        v_commission_percentage := (v_item->>'commission_percentage')::numeric;
      elsif v_product_id is not null then
        select commission_percentage
          into v_commission_percentage
        from public.products
        where id = v_product_id
          and org_id = new.org_id;

        if not found then
          select commission_percentage
            into v_commission_percentage
          from public.billboards
          where id = v_product_id
            and org_id = new.org_id;
        end if;
      end if;
      if coalesce(v_commission_percentage, 0) > 0 then
        v_item := v_item || jsonb_build_object('commission_percentage_snapshot', v_commission_percentage);
      end if;
    end if;

    v_items := v_items || jsonb_build_array(v_item);
  end loop;

  new."invoiceItems" := v_items;
  return new;
end;
$$;

revoke all on function public.snapshot_invoice_commission_items() from public, anon, authenticated;

drop trigger if exists trg_invoices_aa_snapshot_commission_items on public.invoices;
create trigger trg_invoices_aa_snapshot_commission_items
before insert or update of "invoiceItems" on public.invoices
for each row execute function public.snapshot_invoice_commission_items();

-- درصد و کلید ردیفِ فاکتورهای پیشین نیز یک‌بار snapshot می‌شوند تا تغییر
-- بعدی در محصول یا جابه‌جایی ردیف‌های فاکتور، سابقهٔ پورسانت را تغییر ندهد.
update public.invoices
set "invoiceItems" = "invoiceItems"
where jsonb_array_length(coalesce("invoiceItems", '[]'::jsonb)) > 0;

create or replace function public.set_invoice_lifecycle_dates()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_new_status text := lower(coalesce(new.status, ''));
  v_old_status text := case when tg_op = 'INSERT' then '' else lower(coalesce(old.status, '')) end;
  v_approved_statuses text[] := array['confirmed', 'final', 'prepayment', 'settled', 'completed'];
begin
  if v_new_status = any(v_approved_statuses)
    and (tg_op = 'INSERT' or not (v_old_status = any(v_approved_statuses))) then
    new.approved_at := coalesce(new.approved_at, now());
  end if;

  if v_new_status = 'settled'
    and (tg_op = 'INSERT' or v_old_status <> 'settled') then
    new.settled_at := coalesce(new.settled_at, now());
  end if;

  if v_new_status = 'completed'
    and (tg_op = 'INSERT' or v_old_status <> 'completed') then
    new.completed_at := coalesce(new.completed_at, now());
  end if;

  return new;
end;
$$;

update public.invoices
set approved_at = coalesce(approved_at, completed_at, settled_at, invoice_date::timestamptz, created_at)
where lower(coalesce(status, '')) in ('confirmed', 'final', 'prepayment', 'settled', 'completed')
  and approved_at is null;

update public.invoices
set settled_at = coalesce(settled_at, completed_at, invoice_date::timestamptz, created_at)
where lower(coalesce(status, '')) = 'settled'
  and settled_at is null;

update public.invoices
set completed_at = coalesce(completed_at, settled_at, invoice_date::timestamptz, created_at)
where lower(coalesce(status, '')) = 'completed'
  and completed_at is null;

notify pgrst, 'reload schema';

commit;
