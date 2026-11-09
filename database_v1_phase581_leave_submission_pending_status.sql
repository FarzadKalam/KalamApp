-- Restore the reviewed pending status for future leave submissions only.
-- No historical approval/status is rewritten. Organization matching is mandatory.
begin;
create or replace function public.apply_web_form_leave_review_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(new.status, '') <> 'submitted'
     or coalesce(new.target_module_id, '') <> 'leave_requests'
     or new.target_record_id is null or new.org_id is null then
    return new;
  end if;

  update public.leave_requests lr
  set
    status = 'pending',
    updated_at = coalesce(new.created_at, now())
  where lr.id = new.target_record_id
    and lr.org_id = new.org_id;

  if not found then return new; end if;

  new.record_payload := coalesce(new.record_payload, '{}'::jsonb)
    || jsonb_build_object('status', 'pending');

  return new;
end;
$$;
revoke all on function public.apply_web_form_leave_review_status() from public,anon,authenticated;
drop trigger if exists trg_web_form_submissions_leave_review_status on public.web_form_submissions;
create trigger trg_web_form_submissions_leave_review_status before insert on public.web_form_submissions
for each row execute function public.apply_web_form_leave_review_status();
notify pgrst,'reload schema';
commit;
