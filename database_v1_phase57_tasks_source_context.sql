alter table if exists public.tasks
  add column if not exists weight numeric(18,3) not null default 0,
  add column if not exists source_module_id text,
  add column if not exists source_record_id uuid,
  add column if not exists source_template_id uuid,
  add column if not exists source_stage_sort_order integer,
  add column if not exists process_group_id text,
  add column if not exists blocked_reason text,
  add column if not exists waiting_for_task_type text,
  add column if not exists escalation_level integer not null default 0;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'tasks'
      and column_name = 'start_date'
      and data_type = 'date'
  ) then
    alter table public.tasks
      alter column start_date type timestamptz
      using case
        when start_date is null then null
        else start_date::timestamptz
      end;
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'tasks_source_template_id_fkey') then
    alter table public.tasks
      add constraint tasks_source_template_id_fkey
      foreign key (source_template_id) references public.process_templates(id) on delete set null
      not valid;
  end if;
end $$;

update public.tasks
set source_module_id = nullif(trim(coalesce(source_module_id, related_to_module, '')), '')
where coalesce(source_module_id, '') = '';

update public.tasks
set source_record_id = case
  when source_record_id is not null then source_record_id
  when related_to_module = 'products' then related_product
  when related_to_module = 'customers' then related_customer
  when related_to_module = 'suppliers' then related_supplier
  when related_to_module = 'production_orders' then related_production_order
  when related_to_module = 'invoices' then related_invoice
  when related_to_module = 'projects' then project_id
  when related_to_module = 'purchase_invoices' then purchase_invoice_id
  when related_to_module = 'marketing_leads' then marketing_lead_id
  else null
end
where source_record_id is null;

update public.tasks
set source_template_id = nullif(coalesce(recurrence_info -> 'process_group' ->> 'template_id', ''), '')::uuid
where source_template_id is null
  and coalesce(recurrence_info -> 'process_group' ->> 'template_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';

update public.tasks
set process_group_id = nullif(trim(coalesce(process_group_id, recurrence_info -> 'process_group' ->> 'id', '')), '')
where coalesce(process_group_id, '') = '';

update public.tasks
set source_stage_sort_order = coalesce(source_stage_sort_order, sort_order)
where source_stage_sort_order is null
  and sort_order is not null;

create index if not exists idx_tasks_source_record
  on public.tasks(source_module_id, source_record_id);

create index if not exists idx_tasks_source_template
  on public.tasks(source_template_id, source_stage_sort_order);

create index if not exists idx_tasks_process_group
  on public.tasks(process_group_id, sort_order);
