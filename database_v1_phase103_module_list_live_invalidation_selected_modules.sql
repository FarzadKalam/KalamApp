-- KalamApp V1 - Phase 103
-- Selected module-list live invalidation triggers for low-risk rollout.

begin;

create or replace function public.kalam_emit_module_list_invalidation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_module_id text := nullif(trim(coalesce(tg_argv[0], '')), '');
  v_row jsonb;
  v_org_id uuid;
  v_record_id text;
  v_action text := lower(tg_op);
  v_updated_at timestamptz;
  v_scope_hint jsonb;
begin
  if v_module_id is null then
    return coalesce(new, old);
  end if;

  v_row := case
    when tg_op = 'DELETE' then to_jsonb(old)
    else to_jsonb(new)
  end;

  v_org_id := nullif(v_row ->> 'org_id', '')::uuid;
  if v_org_id is null then
    return coalesce(new, old);
  end if;

  v_record_id := nullif(v_row ->> 'id', '');
  v_updated_at := coalesce(
    nullif(v_row ->> 'updated_at', '')::timestamptz,
    nullif(v_row ->> 'created_at', '')::timestamptz,
    now()
  );
  v_scope_hint := jsonb_strip_nulls(jsonb_build_object(
    'assignee_user_id', nullif(v_row ->> 'assignee_id', ''),
    'assignee_role_id', nullif(v_row ->> 'assignee_role_id', '')
  ));

  perform public.kalam_broadcast_module_list_invalidation(
    v_org_id,
    v_module_id,
    v_record_id,
    v_action,
    v_updated_at,
    coalesce(v_scope_hint, '{}'::jsonb)
  );

  return coalesce(new, old);
end;
$$;

do $$
begin
  if to_regclass('public.customers') is not null then
    drop trigger if exists trg_customers_module_list_invalidation on public.customers;
    create trigger trg_customers_module_list_invalidation
      after insert or update or delete on public.customers
      for each row execute function public.kalam_emit_module_list_invalidation('customers');
  end if;

  if to_regclass('public.products') is not null then
    drop trigger if exists trg_products_module_list_invalidation on public.products;
    create trigger trg_products_module_list_invalidation
      after insert or update or delete on public.products
      for each row execute function public.kalam_emit_module_list_invalidation('products');
  end if;

  if to_regclass('public.tasks') is not null then
    drop trigger if exists trg_tasks_module_list_invalidation on public.tasks;
    create trigger trg_tasks_module_list_invalidation
      after insert or update or delete on public.tasks
      for each row execute function public.kalam_emit_module_list_invalidation('tasks');
  end if;

  if to_regclass('public.invoices') is not null then
    drop trigger if exists trg_invoices_module_list_invalidation on public.invoices;
    create trigger trg_invoices_module_list_invalidation
      after insert or update or delete on public.invoices
      for each row execute function public.kalam_emit_module_list_invalidation('invoices');
  end if;

  if to_regclass('public.process_runs') is not null then
    drop trigger if exists trg_process_runs_module_list_invalidation on public.process_runs;
    create trigger trg_process_runs_module_list_invalidation
      after insert or update or delete on public.process_runs
      for each row execute function public.kalam_emit_module_list_invalidation('process_runs');
  end if;

  if to_regclass('public.process_templates') is not null then
    drop trigger if exists trg_process_templates_module_list_invalidation on public.process_templates;
    create trigger trg_process_templates_module_list_invalidation
      after insert or update or delete on public.process_templates
      for each row execute function public.kalam_emit_module_list_invalidation('process_templates');
  end if;
end $$;

revoke all on function public.kalam_emit_module_list_invalidation() from public, anon, authenticated;

notify pgrst, 'reload schema';

commit;
