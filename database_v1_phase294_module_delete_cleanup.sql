begin;

create or replace function public.recycle_bin_strip_process_fields(
  p_snapshot jsonb
)
returns jsonb
language sql
immutable
as $$
  select coalesce(p_snapshot, '{}'::jsonb)
    || jsonb_build_object(
      'execution_process_draft', '[]'::jsonb,
      'marketing_process_draft', '[]'::jsonb,
      'production_stages_draft', '[]'::jsonb,
      'process_draft', '[]'::jsonb,
      'sub_process_draft', '[]'::jsonb,
      'process_template_id', null
    );
$$;

create or replace function public.recycle_bin_strip_payments(
  p_module_id text,
  p_snapshot jsonb
)
returns jsonb
language plpgsql
immutable
as $$
declare
  v_module_id text := trim(coalesce(p_module_id, ''));
  v_snapshot jsonb := coalesce(p_snapshot, '{}'::jsonb);
  v_total numeric := coalesce(nullif(v_snapshot->>'total_invoice_amount', '')::numeric, 0);
  v_amount numeric := coalesce(nullif(v_snapshot->>'amount', '')::numeric, 0);
  v_net_amount numeric := coalesce(nullif(v_snapshot->>'net_amount', '')::numeric, 0);
begin
  v_snapshot := v_snapshot || jsonb_build_object('payments', '[]'::jsonb);

  if v_module_id in ('invoices', 'purchase_invoices', 'sales_return_invoices', 'purchase_return_invoices') then
    v_snapshot := v_snapshot
      || jsonb_build_object(
        'total_received_amount', 0,
        'remaining_balance', case when v_total > 0 then v_total else 0 end
      );
  elsif v_module_id = 'expense_documents' then
    v_snapshot := v_snapshot
      || jsonb_build_object(
        'paid_amount', 0,
        'remaining_amount', case when v_total > 0 then v_total else coalesce(nullif(v_snapshot->>'total_amount', '')::numeric, 0) end
      );
  elsif v_module_id = 'employee_advances' then
    v_snapshot := v_snapshot
      || jsonb_build_object(
        'paid_amount', 0,
        'remaining_amount', case when v_amount > 0 then v_amount else 0 end
      );
  elsif v_module_id = 'payroll_slips' then
    v_snapshot := v_snapshot
      || jsonb_build_object(
        'paid_amount', 0,
        'remaining_amount', case when v_net_amount > 0 then v_net_amount else 0 end
      );
  end if;

  return v_snapshot;
end;
$$;

create or replace function public.collect_record_file_bundle(
  p_module_id text,
  p_record_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_module_id text := trim(coalesce(p_module_id, ''));
  v_folders jsonb := '[]'::jsonb;
  v_entries jsonb := '[]'::jsonb;
  v_record_files jsonb := '[]'::jsonb;
begin
  if v_module_id = '' or p_record_id is null then
    return '{}'::jsonb;
  end if;

  if to_regclass('public.file_folders') is not null then
    select coalesce(jsonb_agg(to_jsonb(f) order by f.created_at, f.id), '[]'::jsonb)
    into v_folders
    from public.file_folders f
    where f.module_id = v_module_id
      and f.record_id = p_record_id;
  end if;

  if to_regclass('public.file_entries') is not null then
    select coalesce(jsonb_agg(to_jsonb(e) order by e.created_at, e.id), '[]'::jsonb)
    into v_entries
    from public.file_entries e
    where e.module_id = v_module_id
      and e.record_id = p_record_id
      and coalesce(e.is_deleted, false) = false;
  end if;

  if to_regclass('public.record_files') is not null then
    select coalesce(jsonb_agg(to_jsonb(r) order by r.created_at, r.id), '[]'::jsonb)
    into v_record_files
    from public.record_files r
    where (
      r.module_id = v_module_id
      and trim(coalesce(r.record_id, '')) = p_record_id::text
    ) or (
      r.source_module_id = v_module_id
      and trim(coalesce(r.source_record_id, '')) = p_record_id::text
    );
  end if;

  if jsonb_array_length(v_folders) = 0
     and jsonb_array_length(v_entries) = 0
     and jsonb_array_length(v_record_files) = 0 then
    return '{}'::jsonb;
  end if;

  return jsonb_build_object(
    'folders', v_folders,
    'entries', v_entries,
    'record_files', v_record_files
  );
end;
$$;

create or replace function public.restore_record_file_bundle(
  p_bundle jsonb
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item jsonb;
  v_inserted integer := 0;
  v_round_inserted integer := 0;
  v_parent_id uuid;
  v_folder_id uuid;
  v_entry_id uuid;
  v_record_file_id text;
begin
  if p_bundle is null or jsonb_typeof(p_bundle) <> 'object' then
    return 0;
  end if;

  if jsonb_typeof(coalesce(p_bundle->'folders', '[]'::jsonb)) = 'array' then
    loop
      v_round_inserted := 0;
      for v_item in
        select value
        from jsonb_array_elements(coalesce(p_bundle->'folders', '[]'::jsonb))
      loop
        v_folder_id := nullif(v_item->>'id', '')::uuid;
        if v_folder_id is null or exists(select 1 from public.file_folders where id = v_folder_id) then
          continue;
        end if;

        v_parent_id := nullif(v_item->>'parent_id', '')::uuid;
        if v_parent_id is not null and not exists(select 1 from public.file_folders where id = v_parent_id) then
          continue;
        end if;

        insert into public.file_folders
        select *
        from jsonb_populate_record(null::public.file_folders, v_item);
        v_inserted := v_inserted + 1;
        v_round_inserted := v_round_inserted + 1;
      end loop;
      exit when v_round_inserted = 0;
    end loop;
  end if;

  if jsonb_typeof(coalesce(p_bundle->'entries', '[]'::jsonb)) = 'array' then
    for v_item in
      select value
      from jsonb_array_elements(coalesce(p_bundle->'entries', '[]'::jsonb))
    loop
      v_entry_id := nullif(v_item->>'id', '')::uuid;
      if v_entry_id is null or exists(select 1 from public.file_entries where id = v_entry_id) then
        continue;
      end if;
      insert into public.file_entries
      select *
      from jsonb_populate_record(null::public.file_entries, v_item);
      v_inserted := v_inserted + 1;
    end loop;
  end if;

  if to_regclass('public.record_files') is not null
     and jsonb_typeof(coalesce(p_bundle->'record_files', '[]'::jsonb)) = 'array' then
    for v_item in
      select value
      from jsonb_array_elements(coalesce(p_bundle->'record_files', '[]'::jsonb))
    loop
      v_record_file_id := trim(coalesce(v_item->>'id', ''));
      if v_record_file_id = '' or exists(select 1 from public.record_files where id = v_record_file_id) then
        continue;
      end if;
      insert into public.record_files
      select *
      from jsonb_populate_record(null::public.record_files, v_item);
      v_inserted := v_inserted + 1;
    end loop;
  end if;

  return v_inserted;
end;
$$;

create or replace function public.detach_cash_bank_operations_for_source(
  p_module_id text,
  p_record_id uuid,
  p_record_title text default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_module_id text := trim(coalesce(p_module_id, ''));
  v_record_title text := nullif(trim(coalesce(p_record_title, '')), '');
  v_count integer := 0;
begin
  if p_record_id is null or v_module_id = '' or to_regclass('public.cash_bank_operations') is null then
    return 0;
  end if;

  if v_module_id = 'invoices' then
    update public.cash_bank_operations
    set sales_invoice_id = null,
        metadata = (coalesce(metadata, '{}'::jsonb) - 'source_table' - 'source_record_id' - 'source_block_id' - 'source_row_key')
          || jsonb_build_object(
            'is_auto_generated', false,
            'detached_source_table', v_module_id,
            'detached_source_record_id', p_record_id::text,
            'source_record_title', v_record_title
          )
    where sales_invoice_id = p_record_id;
  elsif v_module_id = 'purchase_invoices' then
    update public.cash_bank_operations
    set purchase_invoice_id = null,
        metadata = (coalesce(metadata, '{}'::jsonb) - 'source_table' - 'source_record_id' - 'source_block_id' - 'source_row_key')
          || jsonb_build_object(
            'is_auto_generated', false,
            'detached_source_table', v_module_id,
            'detached_source_record_id', p_record_id::text,
            'source_record_title', v_record_title
          )
    where purchase_invoice_id = p_record_id;
  elsif v_module_id = 'expense_documents' then
    update public.cash_bank_operations
    set expense_document_id = null,
        metadata = (coalesce(metadata, '{}'::jsonb) - 'source_table' - 'source_record_id' - 'source_block_id' - 'source_row_key')
          || jsonb_build_object(
            'is_auto_generated', false,
            'detached_source_table', v_module_id,
            'detached_source_record_id', p_record_id::text,
            'source_record_title', v_record_title
          )
    where expense_document_id = p_record_id;
  elsif v_module_id = 'employee_advances' then
    update public.cash_bank_operations
    set employee_advance_id = null,
        metadata = (coalesce(metadata, '{}'::jsonb) - 'source_table' - 'source_record_id' - 'source_block_id' - 'source_row_key')
          || jsonb_build_object(
            'is_auto_generated', false,
            'detached_source_table', v_module_id,
            'detached_source_record_id', p_record_id::text,
            'source_record_title', v_record_title
          )
    where employee_advance_id = p_record_id;
  elsif v_module_id = 'payroll_slips' then
    update public.cash_bank_operations
    set payroll_slip_id = null,
        metadata = (coalesce(metadata, '{}'::jsonb) - 'source_table' - 'source_record_id' - 'source_block_id' - 'source_row_key')
          || jsonb_build_object(
            'is_auto_generated', false,
            'detached_source_table', v_module_id,
            'detached_source_record_id', p_record_id::text,
            'source_record_title', v_record_title
          )
    where payroll_slip_id = p_record_id;
  else
    update public.cash_bank_operations
    set metadata = (coalesce(metadata, '{}'::jsonb) - 'source_table' - 'source_record_id' - 'source_block_id' - 'source_row_key')
      || jsonb_build_object(
        'is_auto_generated', false,
        'detached_source_table', v_module_id,
        'detached_source_record_id', p_record_id::text,
        'source_record_title', v_record_title
      )
    where trim(coalesce(metadata->>'source_table', '')) = v_module_id
      and trim(coalesce(metadata->>'source_record_id', '')) = p_record_id::text;
  end if;

  get diagnostics v_count = row_count;
  return coalesce(v_count, 0);
end;
$$;

create or replace function public.delete_process_runs_keep_tasks(
  p_run_ids uuid[],
  p_deleted_by uuid default auth.uid(),
  p_deleted_by_name text default null,
  p_org_id uuid default public.current_org_id()
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_run_id uuid;
  v_org_id uuid := p_org_id;
  v_run_snapshot jsonb;
  v_stage_snapshot jsonb;
  v_count integer := 0;
begin
  if v_org_id is null then
    v_org_id := public.current_org_id();
  end if;
  if v_org_id is null then
    raise exception 'سازمان جاری شناسایی نشد.';
  end if;

  foreach v_run_id in array coalesce(p_run_ids, array[]::uuid[])
  loop
    select to_jsonb(r)
    into v_run_snapshot
    from public.process_runs r
    where r.id = v_run_id
      and r.org_id = v_org_id;

    if v_run_snapshot is null then
      continue;
    end if;

    for v_stage_snapshot in
      select to_jsonb(s)
      from public.process_run_stages s
      where s.process_run_id = v_run_id
    loop
      delete from public.recycle_bin_records
      where source_table = 'process_run_stages'
        and source_record_id = (v_stage_snapshot->>'id')::uuid;

      insert into public.recycle_bin_records (
        org_id, module_id, source_table, source_record_id, record_title,
        snapshot, deleted_by, deleted_by_name
      )
      values (
        v_org_id,
        'process_run_stages',
        'process_run_stages',
        (v_stage_snapshot->>'id')::uuid,
        public.recycle_bin_record_title(v_stage_snapshot),
        v_stage_snapshot,
        p_deleted_by,
        nullif(trim(coalesce(p_deleted_by_name, '')), '')
      );
      v_count := v_count + 1;
    end loop;

    update public.tasks
    set process_group_id = null,
        process_group_name = null,
        process_run_id = null,
        process_run_stage_id = null,
        recurrence_info = case
          when recurrence_info is null then null
          when jsonb_typeof(recurrence_info) <> 'object' then recurrence_info
          else recurrence_info - 'process_group' - 'process_run_id' - 'process_run_stage_id'
        end
    where org_id = v_org_id
      and (
        process_run_id = v_run_id
        or process_run_stage_id in (
          select s.id
          from public.process_run_stages s
          where s.process_run_id = v_run_id
        )
      );

    delete from public.process_run_links
    where org_id = v_org_id
      and process_run_id = v_run_id;

    delete from public.recycle_bin_records
    where source_table = 'process_runs'
      and source_record_id = v_run_id;

    insert into public.recycle_bin_records (
      org_id, module_id, source_table, source_record_id, record_title,
      snapshot, deleted_by, deleted_by_name
    )
    values (
      v_org_id,
      'process_runs',
      'process_runs',
      v_run_id,
      public.recycle_bin_record_title(v_run_snapshot),
      v_run_snapshot,
      p_deleted_by,
      nullif(trim(coalesce(p_deleted_by_name, '')), '')
    );

    delete from public.process_run_stages
    where process_run_id = v_run_id;

    delete from public.process_runs
    where id = v_run_id
      and org_id = v_org_id;

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

create or replace function public.delete_module_records_with_cleanup(
  p_module_id text,
  p_source_table text,
  p_record_ids uuid[],
  p_relation_fields jsonb default '[]'::jsonb,
  p_options jsonb default '{}'::jsonb,
  p_deleted_by uuid default auth.uid(),
  p_deleted_by_name text default null,
  p_org_id uuid default public.current_org_id()
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source_table text;
  v_module_id text := trim(coalesce(p_module_id, ''));
  v_record_id uuid;
  v_snapshot jsonb;
  v_stored_snapshot jsonb;
  v_delete_bundle jsonb;
  v_effective_org_id uuid := coalesce(p_org_id, public.current_org_id());
  v_record_title text;
  v_options jsonb := coalesce(p_options, '{}'::jsonb);
  v_delete_payments boolean := coalesce((v_options->>'deletePayments')::boolean, true);
  v_delete_related_activities boolean := coalesce((v_options->>'deleteRelatedActivities')::boolean, false);
  v_delete_files boolean := coalesce((v_options->>'deleteFiles')::boolean, false);
  v_process_mode text := lower(trim(coalesce(v_options->>'processMode', 'all')));
  v_replacement_id uuid := nullif(trim(coalesce(v_options->>'replacementRecordId', '')), '')::uuid;
  v_process_run_ids uuid[];
  v_runs_to_delete uuid[];
  v_runs_to_keep uuid[];
  v_direct_task_ids uuid[];
  v_payment_operation_ids uuid[];
  v_file_bundle jsonb;
  v_count integer := 0;
  v_result jsonb := jsonb_build_object('deleted_count', 0);
  v_run_id uuid;
  v_primary_link record;
begin
  if v_effective_org_id is null then
    raise exception 'سازمان جاری شناسایی نشد.';
  end if;

  v_source_table := public.resolve_recycle_bin_source_table(p_source_table);
  if v_source_table is null then
    raise exception 'منبع سطل بازیافت معتبر نیست: %', p_source_table;
  end if;

  if v_process_mode not in ('all', 'incomplete', 'none') then
    v_process_mode := 'all';
  end if;

  foreach v_record_id in array coalesce(p_record_ids, array[]::uuid[])
  loop
    execute format(
      'select to_jsonb(t) from public.%I t where t.id = $1',
      v_source_table
    )
    into v_snapshot
    using v_record_id;

    if v_snapshot is null then
      continue;
    end if;

    v_record_title := public.recycle_bin_record_title(v_snapshot);
    v_stored_snapshot := v_snapshot;
    v_delete_bundle := '{}'::jsonb;

    select coalesce(array_agg(distinct r.id), array[]::uuid[])
    into v_process_run_ids
    from (
      select pr.id
      from public.process_runs pr
      where pr.org_id = v_effective_org_id
        and pr.module_id = v_module_id
        and pr.record_id = v_record_id
      union
      select prl.process_run_id
      from public.process_run_links prl
      where prl.org_id = v_effective_org_id
        and prl.module_id = v_module_id
        and prl.record_id = v_record_id
    ) r;

    if v_process_mode = 'all' then
      v_runs_to_delete := v_process_run_ids;
    elsif v_process_mode = 'incomplete' then
      select coalesce(array_agg(id), array[]::uuid[])
      into v_runs_to_delete
      from public.process_runs
      where org_id = v_effective_org_id
        and id = any(coalesce(v_process_run_ids, array[]::uuid[]))
        and lower(trim(coalesce(status, ''))) not in ('completed', 'canceled', 'cancelled');
    else
      v_runs_to_delete := array[]::uuid[];
    end if;

    select coalesce(array_agg(id), array[]::uuid[])
    into v_runs_to_keep
    from public.process_runs
    where org_id = v_effective_org_id
      and id = any(coalesce(v_process_run_ids, array[]::uuid[]))
      and not (id = any(coalesce(v_runs_to_delete, array[]::uuid[])));

    if v_delete_payments then
      select coalesce(array_agg(distinct cbo.id), array[]::uuid[])
      into v_payment_operation_ids
      from public.cash_bank_operations cbo
      where cbo.org_id = v_effective_org_id
        and (
          (v_module_id = 'invoices' and cbo.sales_invoice_id = v_record_id)
          or (v_module_id = 'purchase_invoices' and cbo.purchase_invoice_id = v_record_id)
          or (v_module_id = 'expense_documents' and cbo.expense_document_id = v_record_id)
          or (v_module_id = 'employee_advances' and cbo.employee_advance_id = v_record_id)
          or (v_module_id = 'payroll_slips' and cbo.payroll_slip_id = v_record_id)
          or (
            trim(coalesce(cbo.metadata->>'source_table', '')) = v_module_id
            and trim(coalesce(cbo.metadata->>'source_record_id', '')) = v_record_id::text
          )
        );

      if coalesce(array_length(v_payment_operation_ids, 1), 0) > 0 then
        perform public.move_records_to_recycle_bin(
          'cash_bank_operations',
          'cash_bank_operations',
          v_payment_operation_ids,
          p_deleted_by,
          p_deleted_by_name,
          v_effective_org_id
        );
        v_delete_bundle := v_delete_bundle || jsonb_build_object('deleted_payment_operation_ids', to_jsonb(v_payment_operation_ids));
      end if;
    else
      perform public.detach_cash_bank_operations_for_source(v_module_id, v_record_id, v_record_title);
      v_stored_snapshot := public.recycle_bin_strip_payments(v_module_id, v_stored_snapshot);
    end if;

    if v_delete_files then
      v_file_bundle := public.collect_record_file_bundle(v_module_id, v_record_id);
      if v_file_bundle <> '{}'::jsonb then
        v_delete_bundle := v_delete_bundle || jsonb_build_object('record_file_bundle', v_file_bundle);
      end if;

      if to_regclass('public.record_files') is not null then
        delete from public.record_files
        where (
          module_id = v_module_id
          and trim(coalesce(record_id, '')) = v_record_id::text
        ) or (
          source_module_id = v_module_id
          and trim(coalesce(source_record_id, '')) = v_record_id::text
        );
      end if;

      if to_regclass('public.file_entries') is not null then
        delete from public.file_entries
        where module_id = v_module_id
          and record_id = v_record_id;
      end if;

      if to_regclass('public.file_folders') is not null then
        delete from public.file_folders
        where module_id = v_module_id
          and record_id = v_record_id;
      end if;
    end if;

    if coalesce(array_length(v_runs_to_delete, 1), 0) > 0 then
      if v_delete_related_activities then
        perform public.move_records_to_recycle_bin(
          'process_runs',
          'process_runs',
          v_runs_to_delete,
          p_deleted_by,
          p_deleted_by_name,
          v_effective_org_id
        );
      else
        perform public.delete_process_runs_keep_tasks(
          v_runs_to_delete,
          p_deleted_by,
          p_deleted_by_name,
          v_effective_org_id
        );
      end if;

      v_delete_bundle := v_delete_bundle || jsonb_build_object('deleted_process_run_ids', to_jsonb(v_runs_to_delete));
      v_stored_snapshot := public.recycle_bin_strip_process_fields(v_stored_snapshot);
    end if;

    select coalesce(array_agg(distinct t.id), array[]::uuid[])
    into v_direct_task_ids
    from public.tasks t
    where t.org_id = v_effective_org_id
      and t.source_module_id = v_module_id
      and t.source_record_id = v_record_id
      and not (t.process_run_id = any(coalesce(v_runs_to_delete, array[]::uuid[])));

    if v_delete_related_activities and coalesce(array_length(v_direct_task_ids, 1), 0) > 0 then
      perform public.move_records_to_recycle_bin(
        'tasks',
        'tasks',
        v_direct_task_ids,
        p_deleted_by,
        p_deleted_by_name,
        v_effective_org_id
      );
      v_delete_bundle := v_delete_bundle || jsonb_build_object('deleted_task_ids', to_jsonb(v_direct_task_ids));
    end if;

    if v_replacement_id is not null then
      perform public.merge_module_record_references(
        v_module_id,
        v_replacement_id,
        array[v_record_id],
        coalesce(p_relation_fields, '[]'::jsonb)
      );

      if not v_delete_files and to_regclass('public.file_entries') is not null then
        update public.file_entries
        set record_id = v_replacement_id
        where module_id = v_module_id
          and record_id = v_record_id;

        update public.file_entries
        set source_record_id = v_replacement_id
        where source_module_id = v_module_id
          and source_record_id = v_record_id;
      end if;

      if not v_delete_files and to_regclass('public.file_folders') is not null then
        update public.file_folders
        set record_id = v_replacement_id
        where module_id = v_module_id
          and record_id = v_record_id;
      end if;

      if not v_delete_related_activities then
        update public.tasks
        set source_record_id = v_replacement_id
        where org_id = v_effective_org_id
          and source_module_id = v_module_id
          and source_record_id = v_record_id;
      end if;
    end if;

    if coalesce(array_length(v_runs_to_keep, 1), 0) > 0 then
      foreach v_run_id in array v_runs_to_keep
      loop
        if v_replacement_id is not null then
          delete from public.process_run_links d
          where d.org_id = v_effective_org_id
            and d.process_run_id = v_run_id
            and d.module_id = v_module_id
            and d.record_id = v_record_id
            and exists (
              select 1
              from public.process_run_links s
              where s.org_id = d.org_id
                and s.process_run_id = d.process_run_id
                and s.module_id = v_module_id
                and s.record_id = v_replacement_id
            );

          update public.process_run_links
          set record_id = v_replacement_id
          where org_id = v_effective_org_id
            and process_run_id = v_run_id
            and module_id = v_module_id
            and record_id = v_record_id;

          update public.process_runs
          set module_id = v_module_id,
              record_id = v_replacement_id
          where org_id = v_effective_org_id
            and id = v_run_id
            and module_id = v_module_id
            and record_id = v_record_id;
        else
          delete from public.process_run_links
          where org_id = v_effective_org_id
            and process_run_id = v_run_id
            and module_id = v_module_id
            and record_id = v_record_id;

          update public.process_runs
          set module_id = coalesce((
                select l.module_id
                from public.process_run_links l
                where l.org_id = v_effective_org_id
                  and l.process_run_id = v_run_id
                order by l.is_primary desc, l.created_at asc, l.id asc
                limit 1
              ), null),
              record_id = coalesce((
                select l.record_id
                from public.process_run_links l
                where l.org_id = v_effective_org_id
                  and l.process_run_id = v_run_id
                order by l.is_primary desc, l.created_at asc, l.id asc
                limit 1
              ), null)
          where org_id = v_effective_org_id
            and id = v_run_id
            and module_id = v_module_id
            and record_id = v_record_id;
        end if;
      end loop;
    end if;

    if v_delete_bundle <> '{}'::jsonb then
      v_stored_snapshot := v_stored_snapshot || jsonb_build_object('__delete_bundle', v_delete_bundle);
    end if;

    delete from public.recycle_bin_records
    where source_table = v_source_table
      and source_record_id = v_record_id;

    insert into public.recycle_bin_records (
      org_id, module_id, source_table, source_record_id, record_title,
      snapshot, deleted_by, deleted_by_name
    )
    values (
      v_effective_org_id,
      v_module_id,
      v_source_table,
      v_record_id,
      public.recycle_bin_record_title(v_stored_snapshot),
      v_stored_snapshot,
      p_deleted_by,
      nullif(trim(coalesce(p_deleted_by_name, '')), '')
    );

    execute format(
      'delete from public.%I where id = $1',
      v_source_table
    )
    using v_record_id;

    v_count := v_count + 1;
  end loop;

  v_result := jsonb_build_object(
    'deleted_count', v_count,
    'module_id', v_module_id,
    'source_table', v_source_table
  );
  return v_result;
end;
$$;

create or replace function public.restore_recycle_bin_records(
  p_recycle_ids uuid[]
)
returns integer
language plpgsql
set search_path = public
as $$
declare
  v_recycle_id uuid;
  v_row public.recycle_bin_records%rowtype;
  v_columns text;
  v_count integer := 0;
  v_target_exists boolean := false;
  v_parent_id uuid;
  v_delete_bundle jsonb;
begin
  create temporary table if not exists recycle_restore_queue (
    id uuid primary key
  ) on commit drop;

  truncate table recycle_restore_queue;

  foreach v_recycle_id in array coalesce(p_recycle_ids, array[]::uuid[])
  loop
    insert into recycle_restore_queue (id)
    values (v_recycle_id)
    on conflict do nothing;

    select *
    into v_row
    from public.recycle_bin_records
    where id = v_recycle_id;

    if not found then
      raise exception 'رکورد سطل بازیافت % پیدا نشد.', v_recycle_id;
    end if;

    v_delete_bundle := case
      when jsonb_typeof(coalesce(v_row.snapshot->'__delete_bundle', '{}'::jsonb)) = 'object'
        then coalesce(v_row.snapshot->'__delete_bundle', '{}'::jsonb)
      else '{}'::jsonb
    end;

    if jsonb_typeof(coalesce(v_delete_bundle->'deleted_process_run_ids', '[]'::jsonb)) = 'array' then
      insert into recycle_restore_queue (id)
      select r.id
      from public.recycle_bin_records r
      where r.source_table = 'process_runs'
        and r.source_record_id in (
          select nullif(value::text, '')::uuid
          from jsonb_array_elements_text(coalesce(v_delete_bundle->'deleted_process_run_ids', '[]'::jsonb)) value
        )
      on conflict do nothing;
    end if;

    if jsonb_typeof(coalesce(v_delete_bundle->'deleted_task_ids', '[]'::jsonb)) = 'array' then
      insert into recycle_restore_queue (id)
      select r.id
      from public.recycle_bin_records r
      where r.source_table = 'tasks'
        and r.source_record_id in (
          select nullif(value::text, '')::uuid
          from jsonb_array_elements_text(coalesce(v_delete_bundle->'deleted_task_ids', '[]'::jsonb)) value
        )
      on conflict do nothing;
    end if;

    if jsonb_typeof(coalesce(v_delete_bundle->'deleted_payment_operation_ids', '[]'::jsonb)) = 'array' then
      insert into recycle_restore_queue (id)
      select r.id
      from public.recycle_bin_records r
      where r.source_table = 'cash_bank_operations'
        and r.source_record_id in (
          select nullif(value::text, '')::uuid
          from jsonb_array_elements_text(coalesce(v_delete_bundle->'deleted_payment_operation_ids', '[]'::jsonb)) value
        )
      on conflict do nothing;
    end if;

    if v_row.source_table = 'process_templates' then
      insert into recycle_restore_queue (id)
      select r.id
      from public.recycle_bin_records r
      where (
        r.source_table = 'process_template_stages'
        and r.snapshot->>'template_id' = v_row.source_record_id::text
      ) or (
        r.source_table = 'workflows'
        and r.snapshot->>'process_template_id' = v_row.source_record_id::text
        and coalesce(r.snapshot->>'scope_type', '') = 'process_activator'
      )
      on conflict do nothing;
    elsif v_row.source_table = 'process_runs' then
      insert into recycle_restore_queue (id)
      select r.id
      from public.recycle_bin_records r
      where (
        r.source_table = 'process_run_stages'
        and r.snapshot->>'process_run_id' = v_row.source_record_id::text
      ) or (
        r.source_table = 'tasks'
        and (
          r.snapshot->>'process_run_id' = v_row.source_record_id::text
          or r.snapshot->>'process_run_stage_id' in (
            select cr.source_record_id::text
            from public.recycle_bin_records cr
            where cr.source_table = 'process_run_stages'
              and cr.snapshot->>'process_run_id' = v_row.source_record_id::text
          )
        )
      )
      on conflict do nothing;
    elsif v_row.source_table = 'process_template_stages' then
      v_parent_id := nullif(v_row.snapshot->>'template_id', '')::uuid;
      if v_parent_id is not null then
        insert into recycle_restore_queue (id)
        select r.id
        from public.recycle_bin_records r
        where r.source_table = 'process_templates'
          and r.source_record_id = v_parent_id
        on conflict do nothing;

        insert into recycle_restore_queue (id)
        select r.id
        from public.recycle_bin_records r
        where (
          r.source_table = 'process_template_stages'
          and r.snapshot->>'template_id' = v_parent_id::text
        ) or (
          r.source_table = 'workflows'
          and r.snapshot->>'process_template_id' = v_parent_id::text
          and coalesce(r.snapshot->>'scope_type', '') = 'process_activator'
        )
        on conflict do nothing;
      end if;
    elsif v_row.source_table = 'process_run_stages' then
      v_parent_id := nullif(v_row.snapshot->>'process_run_id', '')::uuid;
      if v_parent_id is not null then
        insert into recycle_restore_queue (id)
        select r.id
        from public.recycle_bin_records r
        where r.source_table = 'process_runs'
          and r.source_record_id = v_parent_id
        on conflict do nothing;

        insert into recycle_restore_queue (id)
        select r.id
        from public.recycle_bin_records r
        where (
          r.source_table = 'process_run_stages'
          and r.snapshot->>'process_run_id' = v_parent_id::text
        ) or (
          r.source_table = 'tasks'
          and (
            r.snapshot->>'process_run_id' = v_parent_id::text
            or r.snapshot->>'process_run_stage_id' in (
              select cr.source_record_id::text
              from public.recycle_bin_records cr
              where cr.source_table = 'process_run_stages'
                and cr.snapshot->>'process_run_id' = v_parent_id::text
            )
          )
        )
        on conflict do nothing;
      end if;

      insert into recycle_restore_queue (id)
      select r.id
      from public.recycle_bin_records r
      where r.source_table = 'tasks'
        and r.snapshot->>'process_run_stage_id' = v_row.source_record_id::text
      on conflict do nothing;
    elsif v_row.source_table = 'tasks' then
      v_parent_id := nullif(v_row.snapshot->>'process_run_id', '')::uuid;
      if v_parent_id is not null then
        insert into recycle_restore_queue (id)
        select r.id
        from public.recycle_bin_records r
        where r.source_table = 'process_runs'
          and r.source_record_id = v_parent_id
        on conflict do nothing;

        insert into recycle_restore_queue (id)
        select r.id
        from public.recycle_bin_records r
        where (
          r.source_table = 'process_run_stages'
          and r.snapshot->>'process_run_id' = v_parent_id::text
        ) or (
          r.source_table = 'tasks'
          and (
            r.snapshot->>'process_run_id' = v_parent_id::text
            or r.snapshot->>'process_run_stage_id' in (
              select cr.source_record_id::text
              from public.recycle_bin_records cr
              where cr.source_table = 'process_run_stages'
                and cr.snapshot->>'process_run_id' = v_parent_id::text
            )
          )
        )
        on conflict do nothing;
      end if;

      v_parent_id := nullif(v_row.snapshot->>'process_run_stage_id', '')::uuid;
      if v_parent_id is not null then
        insert into recycle_restore_queue (id)
        select r.id
        from public.recycle_bin_records r
        where r.source_table = 'process_run_stages'
          and r.source_record_id = v_parent_id
        on conflict do nothing;
      end if;
    elsif v_row.source_table = 'workflows' then
      v_parent_id := nullif(v_row.snapshot->>'process_template_id', '')::uuid;
      if v_parent_id is not null then
        insert into recycle_restore_queue (id)
        select r.id
        from public.recycle_bin_records r
        where r.source_table = 'process_templates'
          and r.source_record_id = v_parent_id
        on conflict do nothing;

        insert into recycle_restore_queue (id)
        select r.id
        from public.recycle_bin_records r
        where (
          r.source_table = 'process_template_stages'
          and r.snapshot->>'template_id' = v_parent_id::text
        ) or (
          r.source_table = 'workflows'
          and r.snapshot->>'process_template_id' = v_parent_id::text
          and coalesce(r.snapshot->>'scope_type', '') = 'process_activator'
        )
        on conflict do nothing;
      end if;
    end if;
  end loop;

  for v_recycle_id in
    select q.id
    from recycle_restore_queue q
    join public.recycle_bin_records r on r.id = q.id
    order by
      case r.source_table
        when 'process_templates' then 0
        when 'process_template_stages' then 1
        when 'workflows' then 2
        when 'process_runs' then 3
        when 'process_run_stages' then 4
        when 'tasks' then 5
        when 'cash_bank_operations' then 6
        else 7
      end,
      r.deleted_at,
      r.id
  loop
    select *
    into v_row
    from public.recycle_bin_records
    where id = v_recycle_id;

    if not found then
      raise exception 'رکورد سطل بازیافت % پیدا نشد.', v_recycle_id;
    end if;

    if v_row.expires_at < now() then
      delete from public.recycle_bin_records where id = v_recycle_id;
      raise exception 'مهلت بازگردانی رکورد سطل بازیافت % تمام شده است.', v_recycle_id;
    end if;

    select string_agg(format('%I', c.column_name), ', ' order by c.ordinal_position)
    into v_columns
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = v_row.source_table
      and v_row.snapshot ? c.column_name;

    if v_columns is null then
      raise exception 'ستون‌های لازم برای جدول % پیدا نشد.', v_row.source_table;
    end if;

    execute format(
      'select exists (select 1 from public.%I where id = $1)',
      v_row.source_table
    )
    into v_target_exists
    using v_row.source_record_id;

    if not coalesce(v_target_exists, false) then
      execute format(
        'insert into public.%I (%s) select %s from jsonb_populate_record(null::public.%I, $1)',
        v_row.source_table,
        v_columns,
        v_columns,
        v_row.source_table
      )
      using v_row.snapshot;
    end if;

    v_delete_bundle := case
      when jsonb_typeof(coalesce(v_row.snapshot->'__delete_bundle', '{}'::jsonb)) = 'object'
        then coalesce(v_row.snapshot->'__delete_bundle', '{}'::jsonb)
      else '{}'::jsonb
    end;

    if jsonb_typeof(coalesce(v_delete_bundle->'record_file_bundle', '{}'::jsonb)) = 'object' then
      perform public.restore_record_file_bundle(v_delete_bundle->'record_file_bundle');
    end if;

    delete from public.recycle_bin_records where id = v_recycle_id;
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

grant execute on function public.recycle_bin_strip_process_fields(jsonb) to authenticated, service_role;
grant execute on function public.recycle_bin_strip_payments(text, jsonb) to authenticated, service_role;
grant execute on function public.collect_record_file_bundle(text, uuid) to authenticated, service_role;
grant execute on function public.restore_record_file_bundle(jsonb) to authenticated, service_role;
grant execute on function public.detach_cash_bank_operations_for_source(text, uuid, text) to authenticated, service_role;
grant execute on function public.delete_process_runs_keep_tasks(uuid[], uuid, text, uuid) to authenticated, service_role;
grant execute on function public.delete_module_records_with_cleanup(text, text, uuid[], jsonb, jsonb, uuid, text, uuid) to authenticated, service_role;
grant execute on function public.restore_recycle_bin_records(uuid[]) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
