-- نماهای دفتر نقد و بانک فقط برای سازندهٔ همان نما در همان سازمان قابل دسترسی‌اند.
begin;

drop policy if exists saved_views_cash_bank_private on public.saved_views;
create policy saved_views_cash_bank_private on public.saved_views
  as restrictive for all to authenticated
  using (
    org_id = public.current_org_id()
    and (module_id <> 'cash_bank_ledger' or created_by = auth.uid())
  )
  with check (
    org_id = public.current_org_id()
    and (module_id <> 'cash_bank_ledger' or created_by = auth.uid())
  );

commit;
