-- Keep the SMS list responsive by pre-limiting recent org messages
-- before applying per-row communication access checks.

begin;

create or replace function public.get_accessible_sms_delivery_reports(
  p_limit integer default 80
)
returns table (
  id uuid,
  title text,
  module_id text,
  record_id text,
  related_module_id text,
  related_record_id uuid,
  customer_id uuid,
  assignee_id uuid,
  assignee_type text,
  assignee_role_id uuid,
  direction text,
  provider text,
  provider_message_id text,
  sender text,
  recipient text,
  phone_number text,
  phone_number_id uuid,
  phone_match_status text,
  message_text text,
  status text,
  error_message text,
  metadata jsonb,
  sent_at timestamptz,
  received_at timestamptz,
  message_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  with limits as (
    select least(greatest(coalesce(p_limit, 80), 1), 200) as effective_limit
  ),
  candidate_messages as (
    select
      m.id,
      coalesce(nullif(m.title, ''), nullif(m.sender, ''), nullif(m.recipient, ''), 'پیامک') as title,
      m.module_id,
      m.record_id,
      m.related_module_id,
      public.kalam_try_uuid(m.related_record_id) as related_record_id,
      m.customer_id,
      m.assignee_id,
      m.assignee_type,
      m.assignee_role_id,
      coalesce(nullif(m.direction, ''), 'outbound') as direction,
      m.provider,
      m.provider_message_id,
      m.sender,
      m.recipient,
      case when coalesce(nullif(m.direction, ''), 'outbound') = 'inbound' then m.sender else m.recipient end as phone_number,
      m.phone_number_id,
      m.phone_match_status,
      m.message_text,
      m.status,
      m.error_message,
      m.metadata,
      m.sent_at,
      m.received_at,
      coalesce(m.received_at, m.sent_at, m.created_at) as message_at,
      m.created_at,
      m.updated_at
    from public.outbound_messages m
    cross join limits
    where public.current_org_id() is not null
      and m.org_id = public.current_org_id()
      and m.channel_type = 'sms'
    order by coalesce(m.received_at, m.sent_at, m.created_at) desc nulls last, m.created_at desc, m.id desc
    limit least(greatest((select effective_limit from limits) * 20, 400), 2000)
  )
  select
    m.id,
    m.title,
    m.module_id,
    m.record_id,
    m.related_module_id,
    m.related_record_id,
    m.customer_id,
    m.assignee_id,
    m.assignee_type,
    m.assignee_role_id,
    m.direction,
    m.provider,
    m.provider_message_id,
    m.sender,
    m.recipient,
    m.phone_number,
    m.phone_number_id,
    m.phone_match_status,
    m.message_text,
    m.status,
    m.error_message,
    m.metadata,
    m.sent_at,
    m.received_at,
    m.message_at,
    m.created_at,
    m.updated_at
  from candidate_messages m
  where public.kalam_can_view_communication_record(
    'sms',
    public.current_org_id(),
    m.assignee_type,
    m.assignee_id,
    m.assignee_role_id,
    m.module_id,
    public.kalam_try_uuid(m.record_id),
    m.related_module_id,
    m.related_record_id,
    m.customer_id
  )
  order by m.message_at desc nulls last, m.created_at desc, m.id desc
  limit (select effective_limit from limits);
$$;

grant execute on function public.get_accessible_sms_delivery_reports(integer) to authenticated;
revoke all on function public.get_accessible_sms_delivery_reports(integer) from public, anon;

notify pgrst, 'reload schema';

commit;
