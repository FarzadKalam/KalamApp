-- خواندن پیامک‌ها برای کاربران با دسترسی محدود نباید برای هر سطر، زمینهٔ دسترسی را دوباره بسازد.
-- این migration همان قرارداد دسترسی پیشین را با یک context مشترک در هر صفحه اجرا می‌کند.

begin;

create or replace function public.kalam_can_view_module_record_from_context(
  p_permissions jsonb,
  p_user_id uuid,
  p_role_id uuid,
  p_allowed_user_ids uuid[],
  p_allowed_role_ids uuid[],
  p_module_id text,
  p_assignee_type text default null,
  p_assignee_id uuid default null,
  p_assignee_role_id uuid default null
)
returns boolean
language sql
immutable
set search_path = public
as $$
  with module_context as (
    select
      coalesce(p_permissions -> lower(trim(coalesce(p_module_id, ''))), '{}'::jsonb) as module_permissions
  ), scope_context as (
    select
      module_permissions,
      coalesce(nullif(lower(trim(coalesce(module_permissions ->> 'record_scope', ''))), ''), 'all') as record_scope,
      lower(trim(coalesce(p_assignee_type, ''))) as assignee_type
    from module_context
  ), assignment_context as (
    select
      module_permissions,
      record_scope,
      case
        when assignee_type = 'role' then null::uuid
        else p_assignee_id
      end as row_user_id,
      case
        when assignee_type = 'role' then coalesce(p_assignee_role_id, p_assignee_id)
        when assignee_type = 'user' then null::uuid
        else p_assignee_role_id
      end as row_role_id
    from scope_context
  )
  select case
    when lower(trim(coalesce(module_permissions ->> 'view', 'true'))) = 'false'
      and record_scope = 'all' then false
    when record_scope = 'all' then true
    when record_scope = 'own' then row_user_id = p_user_id
    when record_scope = 'team' then row_user_id = p_user_id or row_role_id = p_role_id
    when record_scope = 'subtree' then
      row_user_id = any(coalesce(p_allowed_user_ids, array[]::uuid[]))
      or row_role_id = any(coalesce(p_allowed_role_ids, array[]::uuid[]))
    else false
  end
  from assignment_context;
$$;

create or replace function public.get_accessible_sms_delivery_reports_page(
  p_limit integer default 80,
  p_before_at timestamptz default null,
  p_before_id uuid default null
)
returns table (
  id uuid, title text, module_id text, record_id text, related_module_id text, related_record_id uuid, customer_id uuid,
  assignee_id uuid, assignee_type text, assignee_role_id uuid, direction text, provider text, provider_message_id text,
  sender text, recipient text, phone_number text, phone_number_id uuid, phone_match_status text, message_text text,
  status text, error_message text, metadata jsonb, sent_at timestamptz, received_at timestamptz, message_at timestamptz,
  created_at timestamptz, updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_org_id uuid := public.current_org_id();
  v_role_id uuid;
  v_permissions jsonb := '{}'::jsonb;
  v_profile_mobile_1 text;
  v_profile_mobile text;
  v_profile_phone text := '';
  v_profile_phone_tail text := '';
  v_allowed_role_ids uuid[] := array[]::uuid[];
  v_allowed_user_ids uuid[] := array[]::uuid[];
begin
  if v_user_id is null or v_org_id is null then
    return;
  end if;

  select
    profile.role_id,
    profile.mobile_1,
    profile.mobile,
    coalesce(role.permissions, '{}'::jsonb)
  into v_role_id, v_profile_mobile_1, v_profile_mobile, v_permissions
  from public.profiles profile
  left join public.org_roles role
    on role.id = profile.role_id
   and role.org_id = profile.org_id
  where profile.id = v_user_id
    and profile.org_id = v_org_id
  limit 1;

  if not found then
    return;
  end if;

  v_profile_phone := public.kalam_normalize_phone_digits(coalesce(v_profile_mobile_1, v_profile_mobile, ''));
  v_profile_phone_tail := case when length(v_profile_phone) >= 10 then right(v_profile_phone, 10) else v_profile_phone end;

  with recursive role_tree as (
    select role.id
    from public.org_roles role
    where role.id = v_role_id
      and role.org_id = v_org_id
    union all
    select child.id
    from public.org_roles child
    join role_tree parent on child.parent_id = parent.id
    where child.org_id = v_org_id
  )
  select coalesce(array_agg(id), array[]::uuid[])
    into v_allowed_role_ids
  from role_tree;

  select coalesce(array_agg(profile.id), array[]::uuid[])
    into v_allowed_user_ids
  from public.profiles profile
  where profile.org_id = v_org_id
    and (
      profile.id = v_user_id
      or profile.role_id = any(v_allowed_role_ids)
    );

  return query
  with limits as (
    select least(greatest(coalesce(p_limit, 80), 1), 200) as effective_limit
  ), candidate_messages as (
    select
      message.*,
      coalesce(message.received_at, message.sent_at, message.created_at) as resolved_message_at
    from public.outbound_messages message
    cross join limits
    where message.org_id = v_org_id
      and message.channel_type = 'sms'
      and (
        p_before_at is null
        or coalesce(message.received_at, message.sent_at, message.created_at) < p_before_at
        or (
          coalesce(message.received_at, message.sent_at, message.created_at) = p_before_at
          and p_before_id is not null
          and message.id < p_before_id
        )
      )
    order by coalesce(message.received_at, message.sent_at, message.created_at) desc nulls last,
      message.created_at desc,
      message.id desc
    limit least(greatest((select effective_limit from limits) * 20, 400), 2000)
  ), visible_messages as (
    select message.*
    from candidate_messages message
    where public.kalam_can_view_module_record_from_context(
      v_permissions,
      v_user_id,
      v_role_id,
      v_allowed_user_ids,
      v_allowed_role_ids,
      'sms_delivery_reports',
      message.assignee_type,
      message.assignee_id,
      message.assignee_role_id
    )
    or (
      v_profile_phone <> ''
      and (
        public.kalam_normalize_phone_digits(message.sender) like '%' || v_profile_phone
        or public.kalam_normalize_phone_digits(message.recipient) like '%' || v_profile_phone
        or public.kalam_normalize_phone_digits(
          case when coalesce(nullif(message.direction, ''), 'outbound') = 'inbound' then message.sender else message.recipient end
        ) like '%' || v_profile_phone
        or (
          v_profile_phone_tail <> ''
          and (
            right(public.kalam_normalize_phone_digits(message.sender), 10) = v_profile_phone_tail
            or right(public.kalam_normalize_phone_digits(message.recipient), 10) = v_profile_phone_tail
            or right(public.kalam_normalize_phone_digits(
              case when coalesce(nullif(message.direction, ''), 'outbound') = 'inbound' then message.sender else message.recipient end
            ), 10) = v_profile_phone_tail
          )
        )
      )
    )
    or (
      lower(coalesce(message.module_id, '')) = 'profiles'
      and public.kalam_try_uuid(message.record_id) = v_user_id
    )
    or (
      lower(coalesce(message.related_module_id, '')) = 'profiles'
      and public.kalam_try_uuid(message.related_record_id) = v_user_id
    )
    or exists (
      select 1
      from (
        select
          'customers'::text as target_module_id,
          customer.assignee_type,
          customer.assignee_id,
          customer.assignee_role_id
        from public.customers customer
        where customer.org_id = v_org_id
          and customer.id = any(array[
            case when lower(coalesce(message.module_id, '')) = 'customers' then public.kalam_try_uuid(message.record_id) end,
            case when lower(coalesce(message.related_module_id, '')) = 'customers' then public.kalam_try_uuid(message.related_record_id) end,
            message.customer_id
          ]::uuid[])

        union all

        select
          'suppliers'::text,
          supplier.assignee_type,
          supplier.assignee_id,
          supplier.assignee_role_id
        from public.suppliers supplier
        where supplier.org_id = v_org_id
          and supplier.id = any(array[
            case when lower(coalesce(message.module_id, '')) = 'suppliers' then public.kalam_try_uuid(message.record_id) end,
            case when lower(coalesce(message.related_module_id, '')) = 'suppliers' then public.kalam_try_uuid(message.related_record_id) end
          ]::uuid[])

        union all

        select
          'employees'::text,
          employee.assignee_type,
          employee.assignee_id,
          employee.assignee_role_id
        from public.employees employee
        where employee.org_id = v_org_id
          and employee.id = any(array[
            case when lower(coalesce(message.module_id, '')) = 'employees' then public.kalam_try_uuid(message.record_id) end,
            case when lower(coalesce(message.related_module_id, '')) = 'employees' then public.kalam_try_uuid(message.related_record_id) end
          ]::uuid[])
      ) target
      where public.kalam_can_view_module_record_from_context(
        v_permissions,
        v_user_id,
        v_role_id,
        v_allowed_user_ids,
        v_allowed_role_ids,
        target.target_module_id,
        target.assignee_type,
        target.assignee_id,
        target.assignee_role_id
      )
    )
  )
  select
    message.id,
    coalesce(nullif(message.title, ''), nullif(message.sender, ''), nullif(message.recipient, ''), 'پیامک'),
    message.module_id,
    message.record_id,
    message.related_module_id,
    public.kalam_try_uuid(message.related_record_id),
    message.customer_id,
    message.assignee_id,
    message.assignee_type,
    message.assignee_role_id,
    coalesce(nullif(message.direction, ''), 'outbound'),
    message.provider,
    message.provider_message_id,
    message.sender,
    message.recipient,
    case when coalesce(nullif(message.direction, ''), 'outbound') = 'inbound' then message.sender else message.recipient end,
    message.phone_number_id,
    message.phone_match_status,
    message.message_text,
    message.status,
    message.error_message,
    message.metadata,
    message.sent_at,
    message.received_at,
    message.resolved_message_at,
    message.created_at,
    message.updated_at
  from visible_messages message
  order by message.resolved_message_at desc nulls last, message.created_at desc, message.id desc
  limit (select effective_limit from limits);
end;
$$;

-- مسیر سازگاری قدیمی هم از همان query بهینه استفاده می‌کند.
create or replace function public.get_accessible_sms_delivery_reports(
  p_limit integer default 80
)
returns table (
  id uuid, title text, module_id text, record_id text, related_module_id text, related_record_id uuid, customer_id uuid,
  assignee_id uuid, assignee_type text, assignee_role_id uuid, direction text, provider text, provider_message_id text,
  sender text, recipient text, phone_number text, phone_number_id uuid, phone_match_status text, message_text text,
  status text, error_message text, metadata jsonb, sent_at timestamptz, received_at timestamptz, message_at timestamptz,
  created_at timestamptz, updated_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select *
  from public.get_accessible_sms_delivery_reports_page(p_limit, null, null);
$$;

revoke all on function public.kalam_can_view_module_record_from_context(jsonb, uuid, uuid, uuid[], uuid[], text, text, uuid, uuid) from public, anon, authenticated;
revoke all on function public.get_accessible_sms_delivery_reports_page(integer, timestamptz, uuid) from public, anon;
revoke all on function public.get_accessible_sms_delivery_reports(integer) from public, anon;
grant execute on function public.get_accessible_sms_delivery_reports_page(integer, timestamptz, uuid) to authenticated;
grant execute on function public.get_accessible_sms_delivery_reports(integer) to authenticated;

notify pgrst, 'reload schema';

commit;
