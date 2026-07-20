-- TazeSystem V1 Phase 345
-- Canonical dashboard process work items with safe related-record context.

begin;

create or replace function public.get_process_work_items_v2(
  p_module_specs jsonb default '[]'::jsonb,
  p_limit integer default 15
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_org_id uuid := public.current_org_id();
  v_limit integer := greatest(1, least(coalesce(p_limit, 15), 80));
begin
  if v_org_id is null or auth.uid() is null then
    return '[]'::jsonb;
  end if;

  return coalesce((
    with raw_items as (
      select value as item
      from jsonb_array_elements(
        public.get_process_work_items_v1(
          p_module_specs,
          least(greatest(v_limit * 6, 30), 80)
        )
      )
    ),
    linked_tasks as (
      select
        t.process_group_id::text as process_group_id,
        coalesce(
          nullif(t.source_module_id, ''),
          case when t.project_id is not null then 'projects' end,
          case when t.marketing_lead_id is not null then 'marketing_leads' end,
          case when t.related_customer is not null then 'customers' end,
          case when t.related_supplier is not null then 'suppliers' end,
          case when t.related_invoice is not null then 'invoices' end,
          case when t.purchase_invoice_id is not null then 'purchase_invoices' end,
          case when t.related_production_order is not null then 'production_orders' end,
          nullif(t.related_to_module, '')
        ) as source_module_id,
        coalesce(
          t.source_record_id,
          t.project_id,
          t.marketing_lead_id,
          t.related_customer,
          t.related_supplier,
          t.related_invoice,
          t.purchase_invoice_id,
          t.related_production_order
        )::text as source_record_id,
        t.recurrence_info
      from public.tasks t
      where t.org_id = v_org_id
        and t.process_group_id is not null
    ),
    item_links as (
      select
        raw.item ->> 'key' as item_key,
        coalesce(jsonb_object_agg(link.module_id, link.record_id) filter (where link.module_id is not null and link.record_id is not null), '{}'::jsonb) as links
      from raw_items raw
      left join linked_tasks task
        on task.process_group_id = nullif(raw.item ->> 'groupId', '')
       and nullif(raw.item ->> 'groupId', '') <> nullif(raw.item ->> 'templateId', '')
      left join lateral jsonb_each_text(
        (
          case
            when jsonb_typeof(task.recurrence_info -> 'process_links') = 'object'
              then task.recurrence_info -> 'process_links'
            else '{}'::jsonb
          end
        ) || case
          when task.source_module_id is not null and task.source_record_id is not null
            then jsonb_build_object(task.source_module_id, task.source_record_id)
          else '{}'::jsonb
        end
      ) as link(module_id, record_id) on true
      group by raw.item ->> 'key'
    ),
    enriched as (
      select
        jsonb_set(
          jsonb_set(
            raw.item,
            '{processLinks}',
            coalesce(item_links.links, '{}'::jsonb)
              || jsonb_build_object(raw.item ->> 'moduleId', raw.item ->> 'recordId'),
            true
          ),
          '{key}',
          to_jsonb(
            case
              when nullif(raw.item ->> 'groupId', '') is not null
               and nullif(raw.item ->> 'groupId', '') <> nullif(raw.item ->> 'templateId', '')
                then 'group:' || (raw.item ->> 'groupId')
              else raw.item ->> 'key'
            end
          ),
          true
        ) as item,
        case
          when nullif(raw.item ->> 'groupId', '') is not null
           and nullif(raw.item ->> 'groupId', '') <> nullif(raw.item ->> 'templateId', '')
            then 'group:' || (raw.item ->> 'groupId')
          else raw.item ->> 'key'
        end as process_identity,
        nullif(raw.item ->> 'updatedAt', '')::timestamptz as updated_at
      from raw_items raw
      left join item_links on item_links.item_key = raw.item ->> 'key'
    ),
    deduped as (
      select distinct on (process_identity) item, updated_at
      from enriched
      where process_identity is not null
      order by process_identity, updated_at desc nulls last
    )
    select jsonb_agg(item order by updated_at desc nulls last)
    from (
      select item, updated_at
      from deduped
      order by updated_at desc nulls last
      limit v_limit + 1
    ) limited
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.get_process_work_items_v2(jsonb, integer) from public;
grant execute on function public.get_process_work_items_v2(jsonb, integer) to authenticated;

notify pgrst, 'reload schema';

commit;
