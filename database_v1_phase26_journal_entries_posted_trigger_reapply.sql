-- =====================================================
-- KalamApp - Phase 26 Journal Entries Posted Trigger Reapply
-- Date: 2026-03-21
-- Type: Additive / non-breaking migration
-- Goal: re-apply the posted journal entry trigger fix on older/self-hosted databases
-- =====================================================

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
      raise exception 'Posted journal entry must have non-zero debit and credit totals.';
    end if;

    if abs(v_total_debit - v_total_credit) > 0.009 then
      raise exception 'Journal entry is not balanced (debit=% credit=%).', v_total_debit, v_total_credit;
    end if;

    new.posted_at = coalesce(new.posted_at, now());
    new.posted_by = coalesce(new.posted_by, auth.uid());
  end if;

  return new;
end;
$$;

drop trigger if exists trg_journal_entries_validate_posted on public.journal_entries;
create trigger trg_journal_entries_validate_posted
before update on public.journal_entries
for each row execute function public.trg_validate_posted_journal_entry();

grant execute on function public.trg_validate_posted_journal_entry() to authenticated, service_role;

commit;
