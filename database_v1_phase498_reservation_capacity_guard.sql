-- کنترل اتمیک ظرفیت و هم‌پوشانی رزروها در هر سازمان.
create or replace function public.validate_reservation_capacity()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_resource_id uuid;
  v_requested numeric;
  v_capacity integer;
  v_preparation_minutes integer;
  v_cleanup_minutes integer;
  v_reserved numeric;
  v_allow_overbooking boolean;
begin
  if public.current_org_id() is null or new.org_id <> public.current_org_id() then
    raise exception 'reservation organization mismatch';
  end if;
  if new.status in ('canceled', 'draft') then return new; end if;

  select coalesce((reservation_settings ->> 'allow_overbooking')::boolean, false)
    into v_allow_overbooking from public.company_settings where org_id = new.org_id limit 1;
  if v_allow_overbooking then return new; end if;

  for v_resource_id, v_requested in
    select nullif(item.value ->> 'resource_id', '')::uuid,
           sum(greatest(coalesce(nullif(item.value ->> 'quantity', '')::numeric, 1), 0))
      from jsonb_array_elements(coalesce(new."reservationItems", '[]'::jsonb)) item(value)
     where nullif(item.value ->> 'resource_id', '') is not null
     group by nullif(item.value ->> 'resource_id', '')::uuid
  loop
    -- قفل تراکنشی per-org/per-resource مانع عبور هم‌زمان دو رزرو از کنترل ظرفیت می‌شود.
    perform pg_advisory_xact_lock(hashtextextended(new.org_id::text || ':' || v_resource_id::text, 0));
    select capacity, preparation_minutes, cleanup_minutes
      into v_capacity, v_preparation_minutes, v_cleanup_minutes
      from public.reservation_resources
      where id = v_resource_id and org_id = new.org_id and status = 'active';
    if v_capacity is null then raise exception 'منبع قابل رزرو معتبر یا فعال نیست'; end if;
    select coalesce(sum(greatest(coalesce(nullif(i.value ->> 'quantity', '')::numeric, 1), 0)), 0)
      into v_reserved
      from public.reservations r cross join lateral jsonb_array_elements(coalesce(r."reservationItems", '[]'::jsonb)) i(value)
      where r.org_id = new.org_id and r.id <> new.id and r.status not in ('canceled', 'draft')
        and r.start_at - make_interval(mins => coalesce(v_preparation_minutes, 0)) < new.end_at + make_interval(mins => coalesce(v_cleanup_minutes, 0))
        and r.end_at + make_interval(mins => coalesce(v_cleanup_minutes, 0)) > new.start_at - make_interval(mins => coalesce(v_preparation_minutes, 0))
        and nullif(i.value ->> 'resource_id', '')::uuid = v_resource_id;
    if v_reserved + v_requested > v_capacity then raise exception 'ظرفیت منبع در بازه انتخاب‌شده تکمیل است'; end if;
  end loop;
  return new;
end;
$$;

drop trigger if exists reservations_capacity_guard on public.reservations;
create trigger reservations_capacity_guard before insert or update of start_at, end_at, status, "reservationItems" on public.reservations for each row execute function public.validate_reservation_capacity();

revoke all on function public.validate_reservation_capacity() from public;
grant execute on function public.validate_reservation_capacity() to authenticated;
