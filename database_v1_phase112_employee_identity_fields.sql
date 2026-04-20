-- =====================================================
-- KalamApp - Phase 112 Employee Identity Fields
-- Date: 2026-04-19
-- Type: Additive / idempotent migration
-- Goal: split employee name entry and add legal/contact identity fields
-- =====================================================

begin;

alter table public.employees
  add column if not exists prefix text,
  add column if not exists first_name text,
  add column if not exists last_name text,
  add column if not exists legacy_system_code text,
  add column if not exists issued_from text,
  add column if not exists marital_status text,
  add column if not exists children_count integer not null default 0,
  add column if not exists military_service_status text,
  add column if not exists family_contact_name text,
  add column if not exists family_contact_phone text,
  add column if not exists acquaintance_contact_name text,
  add column if not exists acquaintance_contact_phone text;

update public.employees
set
  first_name = coalesce(nullif(first_name, ''), nullif(full_name, '')),
  children_count = coalesce(children_count, 0)
where
  (first_name is null or first_name = '')
  and (last_name is null or last_name = '')
  and full_name is not null
  and full_name <> '';

update public.employees
set
  full_name = nullif(trim(concat_ws(' ', nullif(prefix, ''), nullif(first_name, ''), nullif(last_name, ''))), ''),
  children_count = coalesce(children_count, 0)
where
  nullif(trim(concat_ws(' ', nullif(prefix, ''), nullif(first_name, ''), nullif(last_name, ''))), '') is not null
  or children_count is null;

alter table public.employees
  alter column children_count set default 0,
  alter column children_count set not null;

create index if not exists idx_employees_org_legacy_system_code
  on public.employees(org_id, legacy_system_code)
  where legacy_system_code is not null and legacy_system_code <> '';

create or replace function public.set_employee_full_name()
returns trigger
language plpgsql
as $$
declare
  computed_name text;
begin
  computed_name := nullif(trim(concat_ws(' ', nullif(new.prefix, ''), nullif(new.first_name, ''), nullif(new.last_name, ''))), '');
  if computed_name is not null then
    new.full_name := computed_name;
  end if;
  new.children_count := coalesce(new.children_count, 0);
  return new;
end;
$$;

drop trigger if exists trg_employees_full_name on public.employees;
create trigger trg_employees_full_name
  before insert or update of prefix, first_name, last_name, full_name, children_count on public.employees
  for each row execute function public.set_employee_full_name();

commit;
