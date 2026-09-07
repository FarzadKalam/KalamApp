-- Phase 487: لید مرتبط در درخواست و اعمال تغییر وضعیت تابلو
-- انتخاب لید نیز مانند مشتری و فاکتور فقط در محدوده سازمان جاری اعتبارسنجی می‌شود.

begin;

alter table public.billboard_status_changes
  add column if not exists marketing_lead_id uuid references public.marketing_leads(id) on delete set null;

create index if not exists idx_billboard_status_changes_org_marketing_lead
  on public.billboard_status_changes(org_id, marketing_lead_id)
  where marketing_lead_id is not null;

create or replace function public.guard_billboard_operational_status_change()
returns trigger language plpgsql set search_path = public as $$
begin
  if current_setting('app.billboard_status_change_authorized', true) = 'on' then return new; end if;
  if new.status is distinct from old.status or new.related_customer is distinct from old.related_customer
     or new.related_invoice is distinct from old.related_invoice or new.marketing_lead_id is distinct from old.marketing_lead_id
     or new.start_date is distinct from old.start_date or new.end_date is distinct from old.end_date then
    raise exception 'تغییر وضعیت و اطلاعات رزرو تابلو فقط از طریق درخواست تغییر وضعیت مجاز است.';
  end if;
  return new;
end;
$$;

create or replace function public.request_billboard_status_change(p_input jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_org_id uuid := public.current_org_id(); v_billboard public.billboards%rowtype; v_id uuid;
  v_billboard_id uuid := nullif(trim(coalesce(p_input ->> 'billboard_id', '')), '')::uuid;
  v_target_status text := nullif(trim(coalesce(p_input ->> 'target_status', '')), '');
  v_customer_id uuid := nullif(trim(coalesce(p_input ->> 'customer_id', '')), '')::uuid;
  v_invoice_id uuid := nullif(trim(coalesce(p_input ->> 'invoice_id', '')), '')::uuid;
  v_marketing_lead_id uuid := nullif(trim(coalesce(p_input ->> 'marketing_lead_id', '')), '')::uuid;
  v_template_id uuid := nullif(trim(coalesce(p_input ->> 'process_template_id', '')), '')::uuid;
  v_batch_id uuid := nullif(trim(coalesce(p_input ->> 'batch_id', '')), '')::uuid; v_template_snapshot jsonb := '{}'::jsonb; v_title text;
begin
  if v_org_id is null or auth.uid() is null then raise exception 'سازمان یا کاربر جاری معتبر نیست.'; end if;
  if not public.current_org_has_plan_feature('billboard_status_management', true) then raise exception 'قابلیت مدیریت تغییر وضعیت تابلوها در پلن سازمان فعال نیست.'; end if;
  if not public.can_manage_billboard_status_change('request') then raise exception 'اجازه ثبت درخواست تغییر وضعیت ندارید.'; end if;
  if v_target_status not in ('free','oral_reserve','final_reserve','in_line','opening','near_finish','opening_deadline_ended','pickup_queue','inactive','blocked') then raise exception 'وضعیت مقصد معتبر نیست.'; end if;
  if v_target_status = 'blocked' and nullif(trim(coalesce(p_input ->> 'block_reason', '')), '') is null then raise exception 'دلیل مسدودسازی الزامی است.'; end if;
  if v_target_status in ('oral_reserve','final_reserve','in_line','opening','near_finish','opening_deadline_ended','pickup_queue') and (v_customer_id is null or nullif(trim(coalesce(p_input ->> 'start_date', '')), '') is null or nullif(trim(coalesce(p_input ->> 'end_date', '')), '') is null) then raise exception 'برای این وضعیت، مشتری و بازه اکران الزامی است.'; end if;
  select * into v_billboard from public.billboards where id = v_billboard_id and org_id = v_org_id for share;
  if not found then raise exception 'تابلوی انتخاب‌شده در سازمان جاری پیدا نشد.'; end if;
  if v_customer_id is not null and not exists (select 1 from public.customers where id = v_customer_id and org_id = v_org_id) then raise exception 'مشتری انتخاب‌شده معتبر نیست.'; end if;
  if v_invoice_id is not null and not exists (select 1 from public.invoices where id = v_invoice_id and org_id = v_org_id) then raise exception 'فاکتور انتخاب‌شده معتبر نیست.'; end if;
  if v_marketing_lead_id is not null and not exists (select 1 from public.marketing_leads where id = v_marketing_lead_id and org_id = v_org_id) then raise exception 'لید انتخاب‌شده معتبر نیست.'; end if;
  if v_template_id is not null then
    if not exists (select 1 from public.process_templates where id = v_template_id and org_id = v_org_id and ('billboard_status_changes' = module_id or 'billboard_status_changes' = any(coalesce(module_ids, '{}'::text[])))) then raise exception 'الگوی فرآیند انتخاب‌شده برای درخواست تغییر وضعیت تابلو سازگار نیست.'; end if;
    select jsonb_build_object('template', to_jsonb(t), 'stages', coalesce((select jsonb_agg(to_jsonb(s) order by s.sort_order) from public.process_template_stages s where s.template_id = t.id), '[]'::jsonb)) into v_template_snapshot from public.process_templates t where t.id = v_template_id and t.org_id = v_org_id;
  end if;
  v_title := concat('تغییر وضعیت ', coalesce(nullif(trim(v_billboard.name), ''), 'تابلو'), ' به ', v_target_status);
  insert into public.billboard_status_changes (org_id,title,billboard_id,source_status,target_status,customer_id,invoice_id,marketing_lead_id,start_date,end_date,block_reason,description,requested_by,batch_id,process_template_id,process_template_snapshot)
  values (v_org_id,v_title,v_billboard.id,v_billboard.status,v_target_status,v_customer_id,v_invoice_id,v_marketing_lead_id,nullif(trim(coalesce(p_input ->> 'start_date', '')), '')::date,nullif(trim(coalesce(p_input ->> 'end_date', '')), '')::date,nullif(trim(coalesce(p_input ->> 'block_reason', '')), ''),nullif(trim(coalesce(p_input ->> 'description', '')), ''),auth.uid(),v_batch_id,v_template_id,v_template_snapshot) returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.decide_billboard_status_change(p_change_id uuid, p_decision text, p_note text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_org_id uuid := public.current_org_id(); v_change public.billboard_status_changes%rowtype; v_billboard public.billboards%rowtype; v_run_id uuid; v_initial_nodes text[];
begin
  if v_org_id is null or auth.uid() is null then raise exception 'سازمان یا کاربر جاری معتبر نیست.'; end if;
  if not public.current_org_has_plan_feature('billboard_status_management', true) or not public.can_manage_billboard_status_change('approve') then raise exception 'اجازه تأیید تغییر وضعیت ندارید.'; end if;
  select * into v_change from public.billboard_status_changes where id = p_change_id and org_id = v_org_id for update;
  if not found then raise exception 'درخواست تغییر وضعیت پیدا نشد.'; end if;
  if v_change.request_status <> 'pending_approval' then raise exception 'این درخواست قبلاً تعیین تکلیف شده است.'; end if;
  if lower(trim(coalesce(p_decision, ''))) = 'reject' then if nullif(trim(coalesce(p_note, '')), '') is null then raise exception 'دلیل رد درخواست الزامی است.'; end if; update public.billboard_status_changes set request_status='rejected',approved_by=auth.uid(),approved_at=now(),approval_note=trim(p_note) where id=v_change.id; return v_change.id; end if;
  if lower(trim(coalesce(p_decision, ''))) <> 'approve' then raise exception 'تصمیم معتبر نیست.'; end if;
  select * into v_billboard from public.billboards where id=v_change.billboard_id and org_id=v_org_id for update;
  if not found then raise exception 'تابلوی مرتبط پیدا نشد.'; end if;
  if v_billboard.status is distinct from v_change.source_status then update public.billboard_status_changes set request_status='needs_review',approved_by=auth.uid(),approved_at=now(),approval_note=coalesce(nullif(trim(p_note), ''),'وضعیت تابلو پس از ثبت درخواست تغییر کرده است.') where id=v_change.id; return v_change.id; end if;
  perform set_config('app.billboard_status_change_authorized','on',true);
  update public.billboards set status=v_change.target_status, related_customer=case when v_change.target_status in ('oral_reserve','final_reserve','in_line','opening','near_finish','opening_deadline_ended','pickup_queue') then v_change.customer_id else null end, related_invoice=case when v_change.target_status in ('oral_reserve','final_reserve','in_line','opening','near_finish','opening_deadline_ended','pickup_queue') then v_change.invoice_id else null end, marketing_lead_id=case when v_change.target_status in ('oral_reserve','final_reserve','in_line','opening','near_finish','opening_deadline_ended','pickup_queue') then v_change.marketing_lead_id else null end, start_date=case when v_change.target_status in ('oral_reserve','final_reserve','in_line','opening','near_finish','opening_deadline_ended','pickup_queue') then v_change.start_date else null end, end_date=case when v_change.target_status in ('oral_reserve','final_reserve','in_line','opening','near_finish','opening_deadline_ended','pickup_queue') then v_change.end_date else null end, updated_by=auth.uid() where id=v_billboard.id and org_id=v_org_id;
  if jsonb_typeof(v_change.process_template_snapshot -> 'template')='object' and v_change.process_template_snapshot -> 'template' <> '{}'::jsonb then v_run_id:=public.create_billboard_status_change_process_run(v_change.id); select array_agg(process_node_key) into v_initial_nodes from (select distinct on (coalesce(process_lane_key,'lane_1')) process_node_key from public.process_run_stages where process_run_id=v_run_id order by coalesce(process_lane_key,'lane_1'),sort_order asc) x; if coalesce(array_length(v_initial_nodes,1),0)>0 then perform public.activate_process_run_nodes(v_org_id,v_run_id,v_initial_nodes,auth.uid()); end if; end if;
  update public.billboard_status_changes set request_status='approved',approved_by=auth.uid(),approved_at=now(),approval_note=nullif(trim(coalesce(p_note,'')),''),process_run_id=v_run_id where id=v_change.id; return v_change.id;
end;
$$;

create or replace function public.workflow_create_billboard_status_change(p_org_id uuid,p_actor_user_id uuid,p_input jsonb,p_origin_execution_key text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_input jsonb := coalesce(p_input, '{}'::jsonb); v_billboard public.billboards%rowtype; v_lead_id uuid := nullif(trim(coalesce(v_input->>'marketing_lead_id','')),'')::uuid; v_customer_id uuid := nullif(trim(coalesce(v_input->>'customer_id','')),'')::uuid; v_invoice_id uuid := nullif(trim(coalesce(v_input->>'invoice_id','')),'')::uuid; v_billboard_id uuid := nullif(trim(coalesce(v_input->>'billboard_id','')),'')::uuid; v_status text := nullif(trim(coalesce(v_input->>'target_status','')),''); v_template_id uuid := nullif(trim(coalesce(v_input->>'process_template_id','')),'')::uuid; v_snapshot jsonb := '{}'::jsonb;
begin
  if coalesce(auth.role(),'') <> 'service_role' then raise exception 'دسترسی ثبت خودکار تغییر وضعیت تابلو وجود ندارد.' using errcode='42501'; end if;
  if p_org_id is null or p_actor_user_id is null or jsonb_typeof(v_input)<>'object' then raise exception 'اطلاعات ثبت خودکار تغییر وضعیت تابلو کامل نیست.' using errcode='22023'; end if;
  if not exists(select 1 from public.profiles where id=p_actor_user_id and org_id=p_org_id) then raise exception 'کاربر اجرای گردش‌کار در سازمان جاری معتبر نیست.' using errcode='42501'; end if;
  if not public.org_has_plan_feature(p_org_id,'billboard_status_management',true) then raise exception 'قابلیت مدیریت تغییر وضعیت تابلوها در پلن سازمان فعال نیست.' using errcode='42501'; end if;
  if v_status not in ('free','oral_reserve','final_reserve','in_line','opening','near_finish','opening_deadline_ended','pickup_queue','inactive','blocked') then raise exception 'وضعیت مقصد معتبر نیست.' using errcode='22023'; end if;
  if v_status = 'blocked' and nullif(trim(coalesce(v_input->>'block_reason','')),'') is null then raise exception 'دلیل مسدودسازی الزامی است.' using errcode='22023'; end if;
  if v_status in ('oral_reserve','final_reserve','in_line','opening','near_finish','opening_deadline_ended','pickup_queue') and (v_customer_id is null or nullif(trim(coalesce(v_input->>'start_date','')),'') is null or nullif(trim(coalesce(v_input->>'end_date','')),'') is null) then raise exception 'برای این وضعیت، مشتری و بازه اکران الزامی است.' using errcode='22023'; end if;
  select * into v_billboard from public.billboards where id=v_billboard_id and org_id=p_org_id for share; if not found then raise exception 'تابلوی انتخاب‌شده در سازمان جاری پیدا نشد.' using errcode='P0002'; end if;
  if v_customer_id is not null and not exists(select 1 from public.customers where id=v_customer_id and org_id=p_org_id) then raise exception 'مشتری انتخاب‌شده معتبر نیست.' using errcode='22023'; end if;
  if v_invoice_id is not null and not exists(select 1 from public.invoices where id=v_invoice_id and org_id=p_org_id) then raise exception 'فاکتور انتخاب‌شده معتبر نیست.' using errcode='22023'; end if;
  if v_lead_id is not null and not exists(select 1 from public.marketing_leads where id=v_lead_id and org_id=p_org_id) then raise exception 'لید انتخاب‌شده معتبر نیست.' using errcode='22023'; end if;
  if v_template_id is not null then if not exists(select 1 from public.process_templates where id=v_template_id and org_id=p_org_id and ('billboard_status_changes'=module_id or 'billboard_status_changes'=any(coalesce(module_ids,'{}'::text[])))) then raise exception 'الگوی فرآیند انتخاب‌شده برای درخواست تغییر وضعیت تابلو سازگار نیست.' using errcode='22023'; end if; select jsonb_build_object('template',to_jsonb(t),'stages',coalesce((select jsonb_agg(to_jsonb(s) order by s.sort_order) from public.process_template_stages s where s.template_id=t.id),'[]'::jsonb)) into v_snapshot from public.process_templates t where t.id=v_template_id and t.org_id=p_org_id; end if;
  perform set_config('app.workflow_origin_execution_key',coalesce(nullif(trim(p_origin_execution_key),''),''),true);
  insert into public.billboard_status_changes (org_id,title,billboard_id,source_status,target_status,customer_id,invoice_id,marketing_lead_id,start_date,end_date,block_reason,description,requested_by,process_template_id,process_template_snapshot) values (p_org_id,concat('تغییر وضعیت ',coalesce(nullif(trim(v_billboard.name),''),'تابلو'),' به ',v_status),v_billboard.id,v_billboard.status,v_status,v_customer_id,v_invoice_id,v_lead_id,nullif(trim(coalesce(v_input->>'start_date','')),'')::date,nullif(trim(coalesce(v_input->>'end_date','')),'')::date,nullif(trim(coalesce(v_input->>'block_reason','')),''),nullif(trim(coalesce(v_input->>'description','')),''),p_actor_user_id,v_template_id,v_snapshot) returning id into v_id;
  return v_id;
end;
$$;

-- مسیر گردش‌کار با نقش سرویس اجرا می‌شود؛ منطق اعتبارسنجی آن با RPC کاربر یکی می‌ماند.
create or replace function public.workflow_update_billboard_status_change(p_org_id uuid,p_actor_user_id uuid,p_change_id uuid,p_patch jsonb,p_origin_execution_key text default null)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_change public.billboard_status_changes%rowtype; v_next jsonb; v_lead_id uuid; v_customer_id uuid; v_invoice_id uuid; v_status text; v_key text; v_allowed text[]:=array['target_status','customer_id','invoice_id','marketing_lead_id','start_date','end_date','block_reason','description'];
begin
  if coalesce(auth.role(),'') <> 'service_role' then raise exception 'دسترسی ویرایش خودکار تغییر وضعیت تابلو وجود ندارد.' using errcode='42501'; end if;
  if p_org_id is null or p_actor_user_id is null or p_change_id is null or jsonb_typeof(coalesce(p_patch,'{}'::jsonb))<>'object' then raise exception 'اطلاعات ویرایش خودکار تغییر وضعیت تابلو کامل نیست.' using errcode='22023'; end if;
  if not exists(select 1 from public.profiles where id=p_actor_user_id and org_id=p_org_id) or not public.org_has_plan_feature(p_org_id,'billboard_status_management',true) then raise exception 'دسترسی سازمانی معتبر برای ویرایش وجود ندارد.' using errcode='42501'; end if;
  for v_key in select jsonb_object_keys(p_patch) loop if not v_key=any(v_allowed) then raise exception 'فیلد ویرایش درخواست تغییر وضعیت معتبر نیست.' using errcode='22023'; end if; end loop;
  select * into v_change from public.billboard_status_changes where id=p_change_id and org_id=p_org_id for update; if not found then raise exception 'درخواست تغییر وضعیت در سازمان جاری پیدا نشد.' using errcode='P0002'; end if;
  if v_change.request_status<>'pending_approval' then raise exception 'فقط درخواست در انتظار تأیید قابل ویرایش است.' using errcode='22023'; end if;
  v_next:=to_jsonb(v_change)||p_patch; v_status:=nullif(trim(coalesce(v_next->>'target_status','')),''); v_customer_id:=nullif(trim(coalesce(v_next->>'customer_id','')),'')::uuid; v_invoice_id:=nullif(trim(coalesce(v_next->>'invoice_id','')),'')::uuid; v_lead_id:=nullif(trim(coalesce(v_next->>'marketing_lead_id','')),'')::uuid;
  if v_status not in ('free','oral_reserve','final_reserve','in_line','opening','near_finish','opening_deadline_ended','pickup_queue','inactive','blocked') then raise exception 'وضعیت مقصد معتبر نیست.' using errcode='22023'; end if;
  if v_status='blocked' and nullif(trim(coalesce(v_next->>'block_reason','')),'') is null then raise exception 'دلیل مسدودسازی الزامی است.' using errcode='22023'; end if;
  if v_status in ('oral_reserve','final_reserve','in_line','opening','near_finish','opening_deadline_ended','pickup_queue') and (v_customer_id is null or nullif(trim(coalesce(v_next->>'start_date','')),'') is null or nullif(trim(coalesce(v_next->>'end_date','')),'') is null) then raise exception 'برای این وضعیت، مشتری و بازه اکران الزامی است.' using errcode='22023'; end if;
  if v_customer_id is not null and not exists(select 1 from public.customers where id=v_customer_id and org_id=p_org_id) then raise exception 'مشتری انتخاب‌شده معتبر نیست.' using errcode='22023'; end if; if v_invoice_id is not null and not exists(select 1 from public.invoices where id=v_invoice_id and org_id=p_org_id) then raise exception 'فاکتور انتخاب‌شده معتبر نیست.' using errcode='22023'; end if; if v_lead_id is not null and not exists(select 1 from public.marketing_leads where id=v_lead_id and org_id=p_org_id) then raise exception 'لید انتخاب‌شده معتبر نیست.' using errcode='22023'; end if;
  if to_jsonb(v_change) @> p_patch then return false; end if;
  perform set_config('app.workflow_origin_execution_key',coalesce(nullif(trim(p_origin_execution_key),''),''),true);
  update public.billboard_status_changes set target_status=v_status,customer_id=v_customer_id,invoice_id=v_invoice_id,marketing_lead_id=v_lead_id,start_date=nullif(trim(coalesce(v_next->>'start_date','')),'')::date,end_date=nullif(trim(coalesce(v_next->>'end_date','')),'')::date,block_reason=nullif(trim(coalesce(v_next->>'block_reason','')),''),description=nullif(trim(coalesce(v_next->>'description','')),''),updated_at=now() where id=p_change_id and org_id=p_org_id;
  return true;
end;
$$;

revoke all on function public.workflow_create_billboard_status_change(uuid,uuid,jsonb,text) from public, authenticated;
revoke all on function public.workflow_update_billboard_status_change(uuid,uuid,uuid,jsonb,text) from public, authenticated;
grant execute on function public.workflow_create_billboard_status_change(uuid,uuid,jsonb,text) to service_role;
grant execute on function public.workflow_update_billboard_status_change(uuid,uuid,uuid,jsonb,text) to service_role;
notify pgrst, 'reload schema';
commit;
