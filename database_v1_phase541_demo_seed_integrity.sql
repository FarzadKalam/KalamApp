begin;

-- Only the authenticated Edge Function may mutate the seed manifest.
revoke insert, update, delete on public.demo_seed_batches, public.demo_seed_records from authenticated, anon;
create index if not exists idx_demo_seed_records_origin on public.demo_seed_records(org_id, table_name, record_id);

create or replace function public.begin_demo_seed_batch(p_org_id uuid, p_user_id uuid, p_pack_key text, p_industry text)
returns uuid language plpgsql security definer set search_path = public as $$
declare result uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended('demo:' || p_org_id::text, 0));
  if not exists(select 1 from public.saas_org_settings where org_id = p_org_id and is_demo) then
    raise exception 'این حساب آزمایشی نیست.';
  end if;
  if exists(select 1 from public.demo_seed_batches where org_id = p_org_id and cleared_at is null and status <> 'cleared') then
    raise exception 'داده‌های نمونه قبلی یا ساخت ناتمام وجود دارد؛ ابتدا آن‌ها را حذف کنید.';
  end if;
  insert into public.demo_seed_batches(org_id, pack_key, industry_key, seeded_by, status)
  values(p_org_id, p_pack_key, p_industry, p_user_id, 'seeding') returning id into result;
  return result;
end; $$;

-- Capture synchronous dependent rows as well (for example financial history),
-- so deleting a sample does not leave generated records behind.
create or replace function public.track_demo_seed_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare batch_key uuid; row_data jsonb := to_jsonb(new); batch_org uuid;
begin
  batch_key := nullif(current_setting('app.demo_seed_batch_id', true), '')::uuid;
  if batch_key is null then return new; end if;
  select org_id into batch_org from public.demo_seed_batches where id = batch_key and status = 'seeding';
  if batch_org is null or row_data->>'org_id' is distinct from batch_org::text then
    raise exception 'سازمان داده نمونه معتبر نیست.';
  end if;
  insert into public.demo_seed_records(batch_id,org_id,table_name,record_id,delete_order,label)
  values(batch_key,batch_org,tg_table_name,(row_data->>'id')::uuid,100,
    coalesce(row_data->>'name',row_data->>'title',row_data->>'full_name','داده نمونه'))
  on conflict(batch_id,table_name,record_id) do nothing;
  return new;
end; $$;

do $$ declare t record; begin
  for t in
    select c.table_name from information_schema.columns c
    join information_schema.tables tbl on tbl.table_schema=c.table_schema and tbl.table_name=c.table_name and tbl.table_type='BASE TABLE'
    where c.table_schema='public' and c.column_name='org_id' and c.udt_name='uuid'
      and c.table_name not in ('demo_seed_records','demo_seed_batches')
      and exists(select 1 from information_schema.columns i where i.table_schema='public' and i.table_name=c.table_name and i.column_name='id' and i.udt_name='uuid')
  loop
    execute format('drop trigger if exists zz_track_demo_seed_insert on public.%I',t.table_name);
    execute format('create trigger zz_track_demo_seed_insert after insert on public.%I for each row execute function public.track_demo_seed_insert()',t.table_name);
  end loop;
end $$;

create or replace function public.insert_demo_seed_rows(p_batch_id uuid, p_table_name text, p_rows jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare batch_org uuid; row_data jsonb; inserted jsonb; result jsonb := '[]'; cols text; vals text; has_org boolean;
begin
  select org_id into batch_org from public.demo_seed_batches where id=p_batch_id and status='seeding' for update;
  if batch_org is null then raise exception 'نوبت ساخت داده نمونه معتبر نیست.'; end if;
  if p_table_name <> all(array[
    'org_roles','warehouses','shelves','suppliers','products','price_lists','product_bundles','bundle_items',
    'customers','marketing_leads','process_templates','process_template_stages','projects','project_members',
    'process_runs','process_run_stages','tasks','invoices','purchase_invoices','secretariat_documents',
    'delivery_forms','stock_transfers','work_schedules','employees','attendance_logs','leave_requests',
    'overtime_requests','mission_requests','recruitment_applicants','employee_contracts','payroll_slips',
    'employee_bonus_requests','employee_penalty_requests','surveys','goals','expense_documents',
    'reservation_resources','reservations','workflows'
  ]) then raise exception 'بخش داده نمونه مجاز نیست.'; end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 100 then raise exception 'داده نمونه معتبر نیست.'; end if;
  select exists(select 1 from information_schema.columns where table_schema='public' and table_name=p_table_name and column_name='org_id') into has_org;
  perform set_config('app.demo_seed_batch_id',p_batch_id::text,true);
  for row_data in select value from jsonb_array_elements(p_rows) loop
    row_data := row_data || jsonb_build_object('id',gen_random_uuid());
    if has_org then row_data := row_data || jsonb_build_object('org_id',batch_org); end if;
    select string_agg(format('%I',key),',' order by key), string_agg(format('r.%I',key),',' order by key)
      into cols,vals from jsonb_object_keys(row_data) key;
    execute format('insert into public.%1$I (%2$s) select %3$s from jsonb_populate_record(null::public.%1$I,$1) r returning to_jsonb(%1$I.*)',p_table_name,cols,vals)
      into inserted using row_data;
    -- Child tables without org_id are tracked explicitly; access is restricted to service_role.
    insert into public.demo_seed_records(batch_id,org_id,table_name,record_id,label)
    values(p_batch_id,batch_org,p_table_name,(inserted->>'id')::uuid,coalesce(inserted->>'name',inserted->>'title','داده نمونه'))
    on conflict(batch_id,table_name,record_id) do nothing;
    result := result || jsonb_build_array(inserted);
  end loop;
  perform set_config('app.demo_seed_batch_id','',true);
  update public.demo_seed_batches set updated_at=now(), seeded_records_count=(select count(*) from public.demo_seed_records where batch_id=p_batch_id) where id=p_batch_id;
  return result;
end; $$;

create or replace function public.clear_demo_seed_batches(p_org_id uuid, p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare item record; fk record; n bigint; remaining integer; progress integer; has_org boolean; relation_oid regclass; child_org boolean; child_uuid boolean; blocked boolean; deleted integer := 0;
begin
  perform pg_advisory_xact_lock(hashtextextended('demo:' || p_org_id::text,0));
  -- A recent writer may still be creating records. A crashed run becomes recoverable after 15 minutes.
  if exists(select 1 from public.demo_seed_batches where org_id=p_org_id and status='seeding' and updated_at > now()-interval '15 minutes') then
    raise exception 'ساخت داده‌های نمونه هنوز در حال انجام است؛ کمی بعد دوباره تلاش کنید.';
  end if;
  perform 1 from public.demo_seed_batches where org_id=p_org_id and cleared_at is null for update;
  update public.demo_seed_batches set status='clearing' where org_id=p_org_id and cleared_at is null and status<>'cleared';

  create temporary table demo_delete_targets on commit drop as
    select distinct r.table_name,r.record_id from public.demo_seed_records r
    join public.demo_seed_batches b on b.id=r.batch_id and b.org_id=r.org_id
    where r.org_id=p_org_id and b.cleared_at is null;

  -- Fail before deleting anything if a real row would be removed by a cascading FK.
  -- Other external references are handled by PostgreSQL; restrictive relationships block atomically.
  for item in select distinct table_name from demo_delete_targets loop
    relation_oid := to_regclass(format('public.%I',item.table_name));
    if relation_oid is null then raise exception 'بخشی از داده‌های نمونه در دسترس نیست.'; end if;
    for fk in select c.conrelid,c.conkey,c.confkey,c.confdeltype,n.nspname,cl.relname
      from pg_constraint c join pg_class cl on cl.oid=c.conrelid join pg_namespace n on n.oid=cl.relnamespace
      where c.contype='f' and c.confrelid=relation_oid and c.confdeltype='c'
    loop
      if array_length(fk.conkey,1)<>1 or array_length(fk.confkey,1)<>1 then
        raise exception 'حذف نمونه با این وابستگی نیاز به بررسی دارد.';
      end if;
      select exists(select 1 from pg_attribute where attrelid=fk.conrelid and attname='org_id' and not attisdropped),
        exists(select 1 from pg_attribute where attrelid=fk.conrelid and attname='id' and atttypid='uuid'::regtype and not attisdropped)
        into child_org,child_uuid;
      if not child_uuid then
        execute format('select exists(select 1 from %I.%I c join public.%I p on c.%I=p.%I join demo_delete_targets d on d.table_name=$1 and d.record_id=p.id)',
          fk.nspname,fk.relname,item.table_name,
          (select attname from pg_attribute where attrelid=fk.conrelid and attnum=fk.conkey[1]),
          (select attname from pg_attribute where attrelid=relation_oid and attnum=fk.confkey[1])) into blocked using item.table_name;
      else
        execute format('select exists(select 1 from %I.%I c join public.%I p on c.%I=p.%I join demo_delete_targets d on d.table_name=$1 and d.record_id=p.id where not exists(select 1 from demo_delete_targets child where child.table_name=$2 and child.record_id=c.id)%s)',
          fk.nspname,fk.relname,item.table_name,
          (select attname from pg_attribute where attrelid=fk.conrelid and attnum=fk.conkey[1]),
          (select attname from pg_attribute where attrelid=relation_oid and attnum=fk.confkey[1]),
          case when child_org then ' or (c.org_id is distinct from $3 and p.id in (select record_id from demo_delete_targets where table_name=$1))' else '' end)
          into blocked using item.table_name,fk.relname,p_org_id;
      end if;
      if blocked then raise exception 'اطلاعات جدیدی به داده‌های نمونه وابسته شده است. ابتدا ارتباط آن‌ها را جدا کنید؛ هیچ داده‌ای حذف نشد.'; end if;
    end loop;
  end loop;

  -- Retry restrictive FK dependencies until children have been deleted. Each failed
  -- attempt rolls back in its own subtransaction; the entire cleanup is atomic.
  loop
    select count(*) into remaining from demo_delete_targets;
    exit when remaining=0;
    progress := 0;
    for item in select * from demo_delete_targets loop
      select exists(select 1 from information_schema.columns where table_schema='public' and table_name=item.table_name and column_name='org_id') into has_org;
      begin
        execute format('delete from public.%I where id=$1%s',item.table_name,case when has_org then ' and org_id=$2' else '' end) using item.record_id,p_org_id;
        get diagnostics n = row_count;
        deleted := deleted+n;
        delete from demo_delete_targets where table_name=item.table_name and record_id=item.record_id;
        progress := progress+1;
      exception when foreign_key_violation or restrict_violation then null;
      end;
    end loop;
    if progress=0 then raise exception 'داده‌های نمونه به اطلاعات دیگری متصل‌اند. ابتدا ارتباط آن‌ها را جدا کنید؛ هیچ داده‌ای حذف نشد.'; end if;
  end loop;
  update public.demo_seed_batches set status='cleared',cleared_by=p_user_id,cleared_at=now()
    where org_id=p_org_id and cleared_at is null;
  return jsonb_build_object('success',true,'status','cleared','has_seeded_batch',false,'seeded_records_count',0,'deleted_records_count',deleted);
end; $$;

revoke all on function public.begin_demo_seed_batch(uuid,uuid,text,text), public.insert_demo_seed_rows(uuid,text,jsonb), public.clear_demo_seed_batches(uuid,uuid), public.track_demo_seed_insert() from public,anon,authenticated;
grant execute on function public.begin_demo_seed_batch(uuid,uuid,text,text), public.insert_demo_seed_rows(uuid,text,jsonb), public.clear_demo_seed_batches(uuid,uuid) to service_role;
commit;
