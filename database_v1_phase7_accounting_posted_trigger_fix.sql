-- =====================================================
-- KalamApp - Phase 7 Fix Posted Trigger Conflict
-- Date: 2026-02-27
-- Type: Additive / non-breaking migration
-- Prerequisite: database_v1_phase2_accounting.sql
-- =====================================================

-- علت: در نسخه قبلی، تریگر before update روی journal_entries
-- داخل همان عملیات دوباره همان رکورد را update می‌کرد
-- و خطای زیر رخ می‌داد:
-- tuple to be updated was already modified by an operation triggered by the current command
--
-- راه‌حل: جمع بدهکار/بستانکار را مستقیم در NEW محاسبه و ست کنیم،
-- بدون update مجدد روی همان ردیف.
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

grant execute on function public.trg_validate_posted_journal_entry() to authenticated, service_role;

-- -----------------------------------------------------
-- Notes
-- 1) This migration only patches trigger behavior.
-- 2) Existing data/schema stay unchanged.
-- -----------------------------------------------------

