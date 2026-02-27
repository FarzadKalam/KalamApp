-- =====================================================
-- KalamApp - Phase 3 Accounting Guards
-- Date: 2026-02-26
-- Type: Additive / non-breaking migration
-- Prerequisite: database_v1_phase2_accounting.sql
-- =====================================================

-- -----------------------------------------------------
-- Journal entry lifecycle guard
-- -----------------------------------------------------
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
      raise exception 'Fiscal year not found for journal entry.';
    end if;

    if new.entry_date < v_start_date or new.entry_date > v_end_date then
      raise exception 'Entry date (%) is outside fiscal year range (% to %).', new.entry_date, v_start_date, v_end_date;
    end if;

    if new.status = 'posted' and coalesce(v_is_closed, false) then
      raise exception 'Cannot post journal entry in a closed fiscal year.';
    end if;
  elsif new.status = 'posted' then
    raise exception 'Posted journal entry must have a fiscal year.';
  end if;

  if tg_op = 'UPDATE' then
    if old.status = 'posted' and new.status = 'draft' then
      raise exception 'Cannot change posted journal entry back to draft.';
    end if;

    if old.status = 'posted' and new.status = 'posted' then
      if new.entry_date is distinct from old.entry_date
         or new.description is distinct from old.description
         or new.fiscal_year_id is distinct from old.fiscal_year_id
         or new.entry_no is distinct from old.entry_no
         or new.source_module is distinct from old.source_module
         or new.source_table is distinct from old.source_table
         or new.source_record_id is distinct from old.source_record_id then
        raise exception 'Posted journal entry is locked and cannot be edited directly.';
      end if;
    end if;
  end if;

  return new;
end;
$$;

-- -----------------------------------------------------
-- Journal entry delete guard
-- -----------------------------------------------------
create or replace function public.trg_guard_journal_entry_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.status <> 'draft' then
    raise exception 'Only draft journal entries can be deleted.';
  end if;
  return old;
end;
$$;

-- -----------------------------------------------------
-- Journal lines mutation guard
-- -----------------------------------------------------
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
    raise exception 'Journal line must reference a journal entry.';
  end if;

  select e.status
  into v_status
  from public.journal_entries e
  where e.id = v_entry_id;

  if v_status is null then
    raise exception 'Parent journal entry not found for journal line mutation.';
  end if;

  if v_status <> 'draft' then
    raise exception 'Only draft journal entries can be modified.';
  end if;

  if tg_op = 'UPDATE' and new.entry_id is distinct from old.entry_id then
    select e.status
    into v_status
    from public.journal_entries e
    where e.id = new.entry_id;

    if v_status is null then
      raise exception 'Target journal entry not found for journal line move.';
    end if;

    if v_status <> 'draft' then
      raise exception 'Cannot move line to a non-draft journal entry.';
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

-- -----------------------------------------------------
-- Triggers
-- -----------------------------------------------------
drop trigger if exists trg_journal_entries_guard_lifecycle on public.journal_entries;
create trigger trg_journal_entries_guard_lifecycle
before insert or update on public.journal_entries
for each row execute function public.trg_guard_journal_entry_lifecycle();

drop trigger if exists trg_journal_entries_guard_delete on public.journal_entries;
create trigger trg_journal_entries_guard_delete
before delete on public.journal_entries
for each row execute function public.trg_guard_journal_entry_delete();

drop trigger if exists trg_journal_lines_guard_mutation on public.journal_lines;
create trigger trg_journal_lines_guard_mutation
before insert or update or delete on public.journal_lines
for each row execute function public.trg_guard_journal_lines_mutation();

-- -----------------------------------------------------
-- Grants
-- -----------------------------------------------------
grant execute on function public.trg_guard_journal_entry_lifecycle() to authenticated, service_role;
grant execute on function public.trg_guard_journal_entry_delete() to authenticated, service_role;
grant execute on function public.trg_guard_journal_lines_mutation() to authenticated, service_role;

-- -----------------------------------------------------
-- Notes
-- 1) Posted documents are locked for direct edits.
-- 2) Journal lines can only be changed while parent entry is draft.
-- 3) Posting requires valid fiscal year/date range and non-closed fiscal year.
-- -----------------------------------------------------
