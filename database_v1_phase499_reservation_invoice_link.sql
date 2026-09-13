-- همگام‌سازی tenant-safe ارتباط فاکتور فروش و رزرو.
create or replace function public.sync_reservation_sales_invoice_link()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
begin
  if tg_op = 'DELETE' then
    if old.reservation_id is null then
      return old;
    end if;
    v_org_id := old.org_id;
    if public.current_org_id() is null or v_org_id <> public.current_org_id() then
      raise exception 'invoice organization mismatch';
    end if;
    if old.reservation_id is not null then
      update public.reservations
         set sales_invoice_id = null, updated_at = now()
       where id = old.reservation_id
         and org_id = v_org_id
         and sales_invoice_id = old.id;
    end if;
    return old;
  end if;

  if tg_op = 'INSERT' and new.reservation_id is null then
    return new;
  end if;

  if tg_op = 'UPDATE' and old.reservation_id is null and new.reservation_id is null then
    return new;
  end if;

  v_org_id := new.org_id;
  if public.current_org_id() is null or v_org_id <> public.current_org_id() then
    raise exception 'invoice organization mismatch';
  end if;

  if tg_op = 'UPDATE' and old.reservation_id is not null
     and new.reservation_id is distinct from old.reservation_id then
    update public.reservations
       set sales_invoice_id = null, updated_at = now()
     where id = old.reservation_id
       and org_id = v_org_id
       and sales_invoice_id = old.id;
  end if;

  if new.reservation_id is not null then
    update public.reservations
       set sales_invoice_id = new.id, updated_at = now()
     where id = new.reservation_id
       and org_id = new.org_id;
    if not found then
      raise exception 'رزرو مرتبط معتبر نیست';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists invoices_reservation_link_sync on public.invoices;
create trigger invoices_reservation_link_sync
after insert or update of reservation_id or delete on public.invoices
for each row execute function public.sync_reservation_sales_invoice_link();

revoke all on function public.sync_reservation_sales_invoice_link() from public;
