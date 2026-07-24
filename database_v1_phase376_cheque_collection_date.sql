-- TazeSystem - Phase 376
-- تاریخ وصول چک برای محاسبه دقیق پورسانت
-- تمام دستورات idempotent هستند.

begin;

alter table if exists public.cheques
  add column if not exists spent_date date,
  add column if not exists cleared_at timestamptz;

update public.cheques
set cleared_at = coalesce(cleared_at, spent_date::timestamptz, updated_at)
where cleared_at is null
  and lower(coalesce(status, '')) in ('cleared', 'collected', 'cashed', 'settled', 'completed', 'passed', 'paid');

create or replace function public.set_cheque_collection_date()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if lower(coalesce(new.status, '')) in ('cleared', 'collected', 'cashed', 'settled', 'completed', 'passed', 'paid')
     and (tg_op = 'INSERT' or lower(coalesce(old.status, '')) not in ('cleared', 'collected', 'cashed', 'settled', 'completed', 'passed', 'paid')) then
    new.cleared_at := coalesce(new.cleared_at, new.spent_date::timestamptz, now());
  end if;
  return new;
end;
$$;

drop trigger if exists trg_cheques_set_collection_date on public.cheques;
create trigger trg_cheques_set_collection_date
before insert or update of status on public.cheques
for each row
execute function public.set_cheque_collection_date();

create index if not exists idx_cheques_org_cleared_at
  on public.cheques(org_id, cleared_at desc)
  where cleared_at is not null;

commit;
