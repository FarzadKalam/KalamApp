-- =====================================================
-- KalamApp - Phase 125
-- Leave web forms: hidden pending status
-- =====================================================

begin;

alter table public.leave_requests
  add column if not exists status text not null default 'pending';

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conrelid = 'public.leave_requests'::regclass
      and conname = 'chk_leave_requests_status'
  ) then
    alter table public.leave_requests
      drop constraint chk_leave_requests_status;
  end if;

  alter table public.leave_requests
    add constraint chk_leave_requests_status
    check (status in ('draft', 'pending', 'review', 'approved', 'completed', 'rejected', 'canceled'))
    not valid;
end $$;

update public.web_forms wf
set config = jsonb_set(
  coalesce(wf.config, '{}'::jsonb),
  '{default_record_values}',
  coalesce(wf.config->'default_record_values', '{}'::jsonb) || jsonb_build_object('status', 'pending'),
  true
)
where wf.target_module_id = 'leave_requests';

update public.web_form_fields wff
set
  default_value = '"pending"'::jsonb,
  is_hidden = true,
  config = coalesce(wff.config, '{}'::jsonb) || jsonb_build_object('select_options', '[]'::jsonb)
from public.web_forms wf
where wff.web_form_id = wf.id
  and wf.target_module_id = 'leave_requests'
  and coalesce(wff.target_field_key, wff.field_key, '') = 'status';

create or replace function public.apply_web_form_leave_review_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(new.status, '') <> 'submitted'
     or coalesce(new.target_module_id, '') <> 'leave_requests'
     or new.target_record_id is null then
    return new;
  end if;

  update public.leave_requests lr
  set
    status = 'pending',
    updated_at = coalesce(new.created_at, now())
  where lr.id = new.target_record_id
    and (new.org_id is null or lr.org_id = new.org_id);

  new.record_payload := coalesce(new.record_payload, '{}'::jsonb)
    || jsonb_build_object('status', 'pending');

  return new;
end;
$$;

drop trigger if exists trg_web_form_submissions_leave_review_status on public.web_form_submissions;
create trigger trg_web_form_submissions_leave_review_status
before insert on public.web_form_submissions
for each row
execute function public.apply_web_form_leave_review_status();

update public.leave_requests lr
set status = 'pending'
from public.web_form_submissions wfs
where wfs.target_module_id = 'leave_requests'
  and wfs.status = 'submitted'
  and wfs.target_record_id = lr.id
  and coalesce(lr.status, '') in ('', 'draft', 'review');

notify pgrst, 'reload schema';

commit;
