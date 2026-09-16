-- تماس‌های VoIP: نتیجهٔ واقعی مکالمه و مقصد/داخلیِ گرفته‌شده را جدا نگه می‌داریم.
-- اطلاعات برای هر سازمان از RLS موجود جدول استفاده می‌کند.

begin;

alter table public.voip_call_logs
  add column if not exists target_extension text,
  add column if not exists target_endpoint_name text;

create index if not exists idx_voip_call_logs_org_target_extension_started
  on public.voip_call_logs(org_id, target_extension, started_at desc, id desc)
  where target_extension is not null;

create or replace function public.kalam_normalize_voip_call_outcome()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- تماس صفرثانیه‌ای در گزارش provider به‌معنی مکالمهٔ برقرارشده نیست.
  if new.direction in ('incoming', 'outgoing')
    and new.talk_seconds = 0
    and new.status in ('answered', 'completed') then
    new.status := 'missed';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_voip_call_logs_00_outcome on public.voip_call_logs;
create trigger trg_voip_call_logs_00_outcome
  before insert or update of direction, status, talk_seconds
  on public.voip_call_logs
  for each row execute function public.kalam_normalize_voip_call_outcome();

-- گزارش‌های قدیمی با مکالمهٔ صفرثانیه‌ای هم باید مانند تماس بی‌پاسخ دیده شوند.
update public.voip_call_logs
set status = 'missed'
where direction in ('incoming', 'outgoing')
  and talk_seconds = 0
  and status in ('answered', 'completed');

-- در payload تلفنچی، نام endpoint مقصد (به‌ویژه داخلی) کنار شمارهٔ مقصد نگه‌داری می‌شود.
update public.voip_call_logs c
set target_extension = coalesce(
      nullif(trim(c.metadata #>> '{provider_row,target_extension}'), ''),
      nullif(trim(c.metadata #>> '{provider_row,target_exten}'), ''),
      nullif(trim(c.metadata #>> '{provider_row,destination_extension}'), ''),
      nullif(trim(c.metadata #>> '{provider_row,destination_exten}'), ''),
      nullif(trim(c.metadata #>> '{provider_row,contact,call_dest,extension}'), ''),
      nullif(trim(c.metadata #>> '{provider_row,contact,call_dest,number}'), ''),
      case when c.direction = 'incoming'
        then nullif(trim(c.metadata #>> '{provider_row,exten,number}'), '')
        else null
      end,
      c.target_extension
    ),
    target_endpoint_name = coalesce(
      nullif(trim(c.metadata #>> '{provider_row,contact,call_dest,name}'), ''),
      nullif(trim(c.metadata #>> '{provider_row,destination_name}'), ''),
      nullif(trim(c.metadata #>> '{provider_row,target_name}'), ''),
      c.target_endpoint_name
    )
where c.provider = 'telefonchy'
  and c.metadata ? 'provider_row';

-- خروجی RPC را توسعه می‌دهیم تا مقصد/داخلی در پیام‌ها و گزارش تماس نیز قابل نمایش باشد.
drop function if exists public.get_accessible_voip_call_logs_page(integer, timestamptz, uuid);

create or replace function public.get_accessible_voip_call_logs_page(
  p_limit integer default 80,
  p_before_at timestamptz default null,
  p_before_id uuid default null
)
returns table (
  id uuid, title text, provider text, service_id text, direction text, status text, source_number text, destination_number text,
  extension text, target_extension text, target_endpoint_name text, operator_code text,
  module_id text, record_id text, related_module_id text, related_record_id uuid, phone_number_id uuid, phone_match_status text,
  assignee_id uuid, assignee_type text, assignee_role_id uuid, started_at timestamptz, ended_at timestamptz,
  created_at timestamptz, talk_seconds integer, wait_seconds integer, call_id text, file_id text, recording_url text,
  operator_display_name text, provider_operator_id text
)
language sql stable security definer set search_path = public
as $$
  with limits as (select least(greatest(coalesce(p_limit, 80), 1), 200) as effective_limit),
  candidate_calls as (
    select c.* from public.voip_call_logs c cross join limits
    where c.org_id = public.current_org_id()
      and (p_before_at is null or coalesce(c.started_at, c.created_at) < p_before_at
        or (coalesce(c.started_at, c.created_at) = p_before_at and p_before_id is not null and c.id < p_before_id))
    order by c.started_at desc nulls last, c.created_at desc, c.id desc
    limit least(greatest((select effective_limit from limits) * 20, 400), 2000)
  )
  select c.id, c.title, c.provider, c.service_id, c.direction, c.status, c.source_number, c.destination_number,
    c.extension, c.target_extension, c.target_endpoint_name, c.operator_code,
    c.module_id, c.record_id, c.related_module_id, public.kalam_try_uuid(c.related_record_id), c.phone_number_id,
    c.phone_match_status, c.assignee_id, c.assignee_type, c.assignee_role_id, c.started_at, c.ended_at,
    c.created_at, c.talk_seconds, c.wait_seconds, c.call_id, c.file_id, c.recording_url,
    coalesce(nullif(trim(c.metadata->>'operator_display_name'), ''), nullif(trim(c.metadata->>'provider_operator_name'), '')),
    nullif(trim(c.metadata->>'provider_operator_id'), '')
  from candidate_calls c
  where public.kalam_can_view_communication_record_v3(
    'voip', public.current_org_id(), c.assignee_type, c.assignee_id, c.assignee_role_id,
    c.module_id, public.kalam_try_uuid(c.record_id), c.related_module_id, public.kalam_try_uuid(c.related_record_id),
    null::uuid, c.source_number, c.destination_number, c.extension
  )
  order by c.started_at desc nulls last, c.created_at desc, c.id desc
  limit (select effective_limit from limits);
$$;

grant execute on function public.get_accessible_voip_call_logs_page(integer, timestamptz, uuid) to authenticated;
revoke all on function public.get_accessible_voip_call_logs_page(integer, timestamptz, uuid) from public, anon;

notify pgrst, 'reload schema';

commit;
