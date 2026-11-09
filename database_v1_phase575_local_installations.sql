-- Dedicated installations belong to the provider organization, not to customer tenants.
-- All cross-organization operations use narrow audited RPCs. No credentials are stored here.
begin;

create table if not exists public.saas_local_installations (
 id uuid primary key default gen_random_uuid(), org_id uuid not null references public.organizations(id),
 customer_org_id uuid not null references public.organizations(id), title text not null,
 system_code text not null default ('LI-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,12))),
 customer_name text not null, assigned_to uuid references auth.users(id),
 install_kind text not null check(install_kind in ('fresh','migration')),
 access_mode text not null check(access_mode in ('internal','public')),
 public_url text not null check(public_url ~ '^https://[^/[:space:]]+(:[0-9]+)?$'),
 tls_mode text not null check(tls_mode in ('provided','internal_ca')),
 delivery_mode text not null check(delivery_mode in ('download','file')),
 admin_name text not null, admin_email text not null,
 telemetry_enabled boolean not null default false,
 status text not null default 'draft' check(status in ('draft','preparing','ready','installing','trial','awaiting_cutover','active','failed','archived')),
 created_by uuid not null references auth.users(id), created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(), last_report_at timestamptz,
 unique(org_id,system_code), unique(id,org_id)
);
create index if not exists local_installs_org_recent on public.saas_local_installations(org_id,created_at desc);
create index if not exists local_installs_customer on public.saas_local_installations(org_id,customer_org_id);

create table if not exists public.saas_local_releases (
 id uuid primary key default gen_random_uuid(), org_id uuid not null references public.organizations(id),
 version text not null, commit_sha text not null check(commit_sha ~ '^[a-f0-9]{40}$'),
 schema_version text not null, manifest jsonb not null,
 artifact_path text not null, signature_path text not null, checksum text not null check(checksum ~ '^[a-f0-9]{64}$'),
 is_current_central boolean not null default false, verified_at timestamptz not null,
 created_at timestamptz not null default now(), unique(org_id,version), unique(id,org_id)
);
create unique index if not exists local_release_current on public.saas_local_releases(org_id) where is_current_central;

create table if not exists public.saas_local_jobs (
 id uuid primary key default gen_random_uuid(), org_id uuid not null,
 installation_id uuid not null, release_id uuid not null,
 kind text not null check(kind in ('prepare','export_trial','export_final')),
 status text not null default 'queued' check(status in ('queued','running','succeeded','failed','needs_review')),
 stage text not null default 'queued', requested_by uuid not null references auth.users(id),
 requested_at timestamptz not null default now(), started_at timestamptz, finished_at timestamptz,
 lease_token uuid, lease_until timestamptz, attempt integer not null default 0,
 error_code text, message text, result jsonb not null default '{}',
 foreign key(installation_id,org_id) references public.saas_local_installations(id,org_id),
 foreign key(release_id,org_id) references public.saas_local_releases(id,org_id), unique(id,org_id)
);
create unique index if not exists local_job_one_active on public.saas_local_jobs(installation_id) where status in ('queued','running','needs_review');
create index if not exists local_jobs_queue on public.saas_local_jobs(status,requested_at);
create index if not exists local_jobs_org_install on public.saas_local_jobs(org_id,installation_id,requested_at desc);

create table if not exists public.saas_local_events (
 id bigint generated always as identity primary key, org_id uuid not null, installation_id uuid not null,
 job_id uuid, event_type text not null, stage text, message text not null,
 created_at timestamptz not null default now(), actor_id uuid references auth.users(id),
 foreign key(installation_id,org_id) references public.saas_local_installations(id,org_id),
 foreign key(job_id,org_id) references public.saas_local_jobs(id,org_id)
);
create index if not exists local_events_install on public.saas_local_events(org_id,installation_id,id desc);

create table if not exists public.saas_local_reports (
 id uuid primary key default gen_random_uuid(),org_id uuid not null,installation_id uuid not null,
 report jsonb not null, received_at timestamptz not null default now(), source text not null check(source in ('manual','telemetry')),
 foreign key(installation_id,org_id) references public.saas_local_installations(id,org_id)
);
create index if not exists local_reports_install on public.saas_local_reports(org_id,installation_id,received_at desc);
create table if not exists public.saas_local_ticket_links (
 org_id uuid not null,installation_id uuid not null,ticket_id uuid not null references public.saas_support_tickets(id),
 primary key(installation_id,ticket_id),foreign key(installation_id,org_id) references public.saas_local_installations(id,org_id)
);
create index if not exists local_tickets_org on public.saas_local_ticket_links(org_id,installation_id);

-- Private worker-only capabilities. Neither API clients nor customer organizations can read these.
create table if not exists public.saas_local_credentials (
 installation_id uuid primary key references public.saas_local_installations(id), org_id uuid not null references public.organizations(id),
 telemetry_token_hash text, expires_at timestamptz, recovery_public_key text
);
create table if not exists public.saas_local_transfer_locks (
 org_id uuid primary key references public.organizations(id),installation_id uuid not null references public.saas_local_installations(id),
 state text not null check(state in ('frozen','cutover')),created_at timestamptz not null default now()
);

create or replace function public.local_installation_can(p_action text)
returns boolean language plpgsql stable security definer set search_path=public as $$
declare p jsonb;
begin
 if auth.uid() is null or public.current_org_id() is null or not public.org_is_saas_admin(public.current_org_id()) then return false; end if;
 select r.permissions->'__saas_admin' into p from public.user_organization_memberships m
 join public.org_roles r on r.id=m.role_id and r.org_id=m.org_id
 where m.user_id=auth.uid() and m.org_id=public.current_org_id() and m.is_active limit 1;
 if p is null or not coalesce((p->>'view')::boolean,false) then return false; end if;
 return coalesce((p->'fields'->>('local_'||p_action))::boolean,false);
end $$;
revoke all on function public.local_installation_can(text) from public,anon;
grant execute on function public.local_installation_can(text) to authenticated,service_role;

do $$ declare t text; begin
 foreach t in array array['saas_local_installations','saas_local_releases','saas_local_jobs','saas_local_events','saas_local_reports','saas_local_ticket_links','saas_local_credentials','saas_local_transfer_locks'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from anon,authenticated',t);
  execute format('grant all on public.%I to service_role',t);
  if t not in ('saas_local_credentials','saas_local_transfer_locks') then
   execute format('grant select on public.%I to authenticated',t);
   execute format('drop policy if exists local_admin_read on public.%I',t);
   execute format('create policy local_admin_read on public.%I for select to authenticated using (org_id=public.current_org_id() and public.local_installation_can(''view''))',t);
  end if;
 end loop;
end $$;
grant usage,select on sequence public.saas_local_events_id_seq to service_role;

create or replace function public.local_installation_safe_report(p_report jsonb)
returns jsonb language plpgsql stable set search_path=public as $$
declare s jsonb; services jsonb:='[]';
begin
 if jsonb_typeof(p_report) is distinct from 'object' or pg_column_size(p_report)>65536 or p_report->>'format' is distinct from 'kalamapp-diagnostics-v1'
 or coalesce(p_report->>'generated_at','') !~ '^\d{4}-\d\d-\d\dT' then raise exception 'گزارش نصب معتبر نیست.'; end if;
 if (p_report->>'generated_at')::timestamptz>now()+interval '5 minutes' then raise exception 'زمان گزارش نصب معتبر نیست.'; end if;
 if jsonb_typeof(p_report->'services')='array' then
 for s in select value from jsonb_array_elements(p_report->'services') limit 32 loop
  if coalesce(s->>'name','') !~ '^[a-z][a-z0-9_-]{0,48}$' or coalesce(s->>'status','') not in ('healthy','unhealthy','running','stopped','unknown') then raise exception 'وضعیت سرویس معتبر نیست.'; end if;
  services:=services||jsonb_build_array(jsonb_build_object('name',s->>'name','status',s->>'status'));
 end loop; end if;
 return jsonb_build_object('format','kalamapp-diagnostics-v1','generated_at',(p_report->>'generated_at')::timestamptz,
 'version',left(regexp_replace(coalesce(p_report->>'version',''), '[^0-9.]','','g'),40),
 'services',services,'disk_free_bytes',greatest(0,least(coalesce((p_report->>'disk_free_bytes')::numeric,0),1e18)),
 'last_backup_at',case when p_report->>'last_backup_at' ~ '^\d{4}-\d\d-\d\dT' then (p_report->>'last_backup_at')::timestamptz else null end);
end $$;
revoke all on function public.local_installation_safe_report(jsonb) from public,anon,authenticated;

create or replace function public.admin_local_installation(p_action text,p_id uuid default null,p_payload jsonb default '{}')
returns jsonb language plpgsql security definer set search_path=public as $$
declare o uuid:=public.current_org_id(); i public.saas_local_installations; j public.saas_local_jobs;
 r public.saas_local_releases; need text; c text; v_result jsonb; frozen boolean;
begin
 need:=case p_action when 'create' then 'build' when 'prepare' then 'build' when 'export_trial' then 'export' when 'export_final' then 'cutover'
 when 'download' then 'view' when 'link_ticket_code' then 'view' when 'import_report' then 'view' when 'detail' then 'view' when 'customers' then 'build'
 when 'set_recovery_key' then 'export' when 'authorize_receipt' then 'cutover' when 'issue_report_token' then 'build' when 'operators' then 'build' when 'review_interrupted' then 'build'
 when 'retry' then 'build' else null end;
 if need is null or not public.local_installation_can(need) then raise exception using errcode='42501',message='اجازهٔ انجام این عملیات را ندارید.'; end if;
 if p_action='operators' then
  select coalesce(jsonb_agg(x),'[]') into v_result from(select m.user_id as id,coalesce(nullif(p.full_name,''),'[بدون عنوان]') as name
   from public.user_organization_memberships m join public.profiles p on p.id=m.user_id where m.org_id=o and m.is_active order by p.full_name limit 100)x;
  return jsonb_build_object('operators',v_result);
 elsif p_action='customers' then
  select coalesce(jsonb_agg(x),'[]') into v_result from (select org_id as id, public.organization_display_name(org_id) as name
   from public.saas_org_settings where org_id<>o and (p_payload->>'cursor' is null or org_id::text>p_payload->>'cursor')
   and (nullif(trim(p_payload->>'search'),'') is null or public.organization_display_name(org_id) ilike '%'||left(p_payload->>'search',100)||'%') order by org_id limit 30) x;
  return jsonb_build_object('customers',v_result);
 end if;
 if p_action='create' then
  if length(trim(coalesce(p_payload->>'title','')))<2 or length(p_payload->>'title')>180 or
   coalesce(p_payload->>'admin_email','') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or
   coalesce(p_payload->>'public_url','') !~ '^https://[a-zA-Z0-9.-]+(:[0-9]{1,5})?$' or
   coalesce(p_payload->>'admin_name','')='' then raise exception 'نام نصب، نشانی امن و مشخصات مدیر را کامل کنید.'; end if;
  if not exists(select 1 from public.saas_org_settings where org_id=(p_payload->>'customer_org_id')::uuid and org_id<>o and not public.org_is_saas_admin(org_id))
   then raise exception 'سازمان مشتری معتبر نیست.'; end if;
  if nullif(p_payload->>'assigned_to','') is not null and not exists(select 1 from public.user_organization_memberships
   where org_id=o and user_id=(p_payload->>'assigned_to')::uuid and is_active) then raise exception 'مسئول باید عضو سازمان اپراتور باشد.'; end if;
  insert into public.saas_local_installations(org_id,customer_org_id,title,customer_name,assigned_to,install_kind,access_mode,public_url,tls_mode,delivery_mode,admin_name,admin_email,telemetry_enabled,created_by)
  values(o,(p_payload->>'customer_org_id')::uuid,trim(p_payload->>'title'),public.organization_display_name((p_payload->>'customer_org_id')::uuid),
   coalesce(nullif(p_payload->>'assigned_to','')::uuid,auth.uid()),p_payload->>'install_kind',p_payload->>'access_mode',p_payload->>'public_url',p_payload->>'tls_mode',p_payload->>'delivery_mode',
   left(p_payload->>'admin_name',180),left(p_payload->>'admin_email',254),coalesce((p_payload->>'telemetry_enabled')::boolean,false),auth.uid()) returning * into i;
  insert into public.saas_local_events(org_id,installation_id,event_type,message,actor_id) values(o,i.id,'created','پروندهٔ نصب ایجاد شد.',auth.uid());
  return jsonb_build_object('id',i.id);
 end if;
 select * into i from public.saas_local_installations where id=p_id and org_id=o for update;
 if not found then raise exception using errcode='42501',message='پروندهٔ نصب در دسترس نیست.'; end if;
 if p_action='detail' then
  return jsonb_build_object('installation',to_jsonb(i),'jobs',coalesce((select jsonb_agg(x) from
   (select id,kind,status,stage,requested_at,started_at,finished_at,attempt,error_code,message,result,release_id from public.saas_local_jobs where installation_id=i.id and org_id=o order by requested_at desc limit 30)x),'[]'),
   'events',coalesce((select jsonb_agg(x) from(select event_type,stage,message,created_at from public.saas_local_events where installation_id=i.id and org_id=o order by id desc limit 100)x),'[]'),
   'report',(select jsonb_build_object('report',report,'received_at',received_at,'source',source) from public.saas_local_reports where installation_id=i.id and org_id=o order by (report->>'generated_at')::timestamptz desc,received_at desc limit 1),
   'release',(select jsonb_build_object('version',version,'verified_at',verified_at) from public.saas_local_releases where org_id=o and is_current_central),
   'recovery_key_configured',exists(select 1 from public.saas_local_credentials where installation_id=i.id and recovery_public_key is not null),
   'source_frozen',exists(select 1 from public.saas_local_transfer_locks where org_id=i.customer_org_id),
   'tickets',case when public.support_is_operator('support_view') then coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'code',public.support_ticket_code(t.ticket_no),'subject',t.subject,'status',t.status)) from public.saas_local_ticket_links l join public.saas_support_tickets t on t.id=l.ticket_id and t.org_id=o where l.installation_id=i.id and l.org_id=o),'[]') else '[]'::jsonb end);
 elsif p_action='review_interrupted' then
  select * into j from public.saas_local_jobs where installation_id=i.id and status='needs_review' for update;
  if not found or p_payload->>'confirmation' is distinct from i.system_code or (j.kind<>'prepare' and not public.local_installation_can('cutover')) then
   raise exception 'بررسی خروجی، worker و قفل انتقال و تأیید کد نصب لازم است.'; end if;
  update public.saas_local_jobs set status='failed',finished_at=now(),error_code='INTERRUPTION_REVIEWED',message='توقف اجرا توسط اپراتور بررسی شد؛ عملیات جدید نیازمند درخواست جداست.' where id=j.id;
 elsif p_action='set_recovery_key' then
  if length(coalesce(p_payload->>'public_key','')) not between 400 and 8192 or p_payload->>'public_key' not like '-----BEGIN PUBLIC KEY-----%'
   or exists(select 1 from public.saas_local_jobs where installation_id=i.id and kind like 'export_%') then raise exception 'کلید عمومی معتبر را پیش از نخستین خروجی اطلاعات ثبت کنید.'; end if;
  insert into public.saas_local_credentials(installation_id,org_id,recovery_public_key) values(i.id,o,p_payload->>'public_key')
   on conflict(installation_id) do update set recovery_public_key=excluded.recovery_public_key;
 elsif p_action='issue_report_token' then
  if not i.telemetry_enabled then raise exception 'ارسال گزارش برای این نصب فعال نشده است.'; end if;
  c:=replace(gen_random_uuid()::text||gen_random_uuid()::text,'-','');
  insert into public.saas_local_credentials(installation_id,org_id,telemetry_token_hash) values(i.id,o,encode(sha256(convert_to(c,'UTF8')),'hex'))
   on conflict(installation_id) do update set telemetry_token_hash=excluded.telemetry_token_hash;
  insert into public.saas_local_events(org_id,installation_id,event_type,message,actor_id) values(o,i.id,p_action,'کلید ارسال گزارش صادر و کلید قبلی باطل شد.',auth.uid());
  return jsonb_build_object('token',c);
 elsif p_action='authorize_receipt' then
  select * into j from public.saas_local_jobs where id=(p_payload->>'job_id')::uuid and org_id=o and installation_id=i.id and status='succeeded' and kind in ('export_trial','export_final');
  if not found then raise exception 'خروجی قابل بررسی پیدا نشد.'; end if;
  return jsonb_build_object('job_id',j.id,'actor',auth.uid(),'public_key',(select recovery_public_key from public.saas_local_credentials where installation_id=i.id));
 elsif p_action='import_report' then
  v_result:=public.local_installation_safe_report(p_payload);
  insert into public.saas_local_reports(org_id,installation_id,report,source) values(o,i.id,v_result,'manual');
  update public.saas_local_installations set last_report_at=now() where id=i.id;
 elsif p_action='link_ticket_code' then
  if not public.support_is_operator('support_view') or not exists(select 1 from public.saas_support_tickets where public.support_ticket_code(ticket_no)=p_payload->>'code' and org_id=o and customer_org_id=i.customer_org_id)
   then raise exception 'تیکت متعلق به همین مشتری و قابل مشاهده انتخاب شود.'; end if;
  insert into public.saas_local_ticket_links select o,i.id,id from public.saas_support_tickets where org_id=o and customer_org_id=i.customer_org_id and public.support_ticket_code(ticket_no)=p_payload->>'code' on conflict do nothing;
 elsif p_action='download' then
  if not exists(select 1 from public.saas_local_jobs where id=(p_payload->>'job_id')::uuid and org_id=o and installation_id=i.id and status='succeeded') then raise exception 'بستهٔ آماده‌ای برای این عملیات وجود ندارد.'; end if;
  select * into j from public.saas_local_jobs where id=(p_payload->>'job_id')::uuid and org_id=o;
  if j.kind='prepare' and not public.local_installation_can('build') then raise exception using errcode='42501',message='اجازهٔ دریافت بسته را ندارید.'; end if;
  if j.kind<>'prepare' and not public.local_installation_can('export') then raise exception using errcode='42501',message='اجازهٔ دریافت خروجی داده را ندارید.'; end if;
  if j.kind<>'prepare' and (j.result->>'expires_at')::timestamptz<=now() then raise exception 'مهلت دریافت خروجی داده گذشته است.'; end if;
  insert into public.saas_local_events(org_id,installation_id,event_type,message,actor_id) values(o,i.id,'download','دریافت بسته درخواست شد.',auth.uid());
  return jsonb_build_object('path',j.result->>'artifact_path','release_id',j.release_id,'kind',j.kind);
 elsif p_action in ('prepare','export_trial','export_final','retry') then
  if exists(select 1 from public.saas_local_jobs where installation_id=i.id and status in ('queued','running','needs_review')) then
   select * into j from public.saas_local_jobs where installation_id=i.id and status in ('queued','running','needs_review');
   return jsonb_build_object('job_id',j.id,'existing',true);
  end if;
  if p_action='retry' then
   select * into j from public.saas_local_jobs where installation_id=i.id order by requested_at desc limit 1;
   if j.status<>'failed' or j.kind<>'prepare' then raise exception 'برای انتقال اطلاعات، عملیات جدید با بررسی مجوز اجرا کنید.'; end if;
  end if;
  select * into r from public.saas_local_releases where org_id=o and is_current_central;
  if not found then raise exception 'نسخهٔ جاری سرور مرکزی هنوز بستهٔ لوکال تأییدشده ندارد.'; end if;
  if p_action like 'export_%' then
   if i.install_kind<>'migration' then raise exception 'این پرونده برای نصب تازه است.'; end if;
   if r.manifest#>>'{checks,tenant_transfer}' is distinct from 'passed' then raise exception 'انتقال این نسخه هنوز آزمون و تأیید نشده است.'; end if;
   if p_action='export_final' and (p_payload->>'confirmation' is distinct from i.system_code or not exists(select 1 from public.saas_local_jobs where installation_id=i.id and release_id=r.id and kind='export_trial' and status='succeeded' and result->>'restore_verified'='true')) then
    raise exception 'بازیابی آزمایشی باید تأیید شود؛ کد نصب را برای انتقال نهایی وارد کنید.'; end if;
  end if;
  insert into public.saas_local_jobs(org_id,installation_id,release_id,kind,requested_by) values(o,i.id,r.id,case when p_action='retry' then j.kind else p_action end,auth.uid()) returning * into j;
  update public.saas_local_installations set status='preparing',updated_at=now() where id=i.id;
  insert into public.saas_local_events(org_id,installation_id,job_id,event_type,message,actor_id) values(o,i.id,j.id,'queued','عملیات در صف اجرا قرار گرفت.',auth.uid());
  return jsonb_build_object('job_id',j.id,'existing',false);
 end if;
 insert into public.saas_local_events(org_id,installation_id,event_type,message,actor_id) values(o,i.id,p_action,'پروندهٔ نصب به‌روز شد.',auth.uid());
 return jsonb_build_object('success',true);
end $$;
revoke all on function public.admin_local_installation(text,uuid,jsonb) from public,anon;
grant execute on function public.admin_local_installation(text,uuid,jsonb) to authenticated;

create or replace function public.worker_local_installation(p_action text,p_id uuid default null,p_lease uuid default null,p_payload jsonb default '{}')
returns jsonb language plpgsql security definer set search_path=public as $$
declare j public.saas_local_jobs;i public.saas_local_installations;r public.saas_local_releases; o uuid;
begin
 if coalesce(auth.role(),'')<>'service_role' then raise exception using errcode='42501',message='Worker access required'; end if;
 if p_action='expired_artifacts' then
  return coalesce((select jsonb_agg(x) from (select id,result->>'artifact_path' as path from public.saas_local_jobs
   where kind<>'prepare' and status='succeeded' and (result->>'expires_at')::timestamptz<=now() and not result ? 'purged_at'
   order by finished_at limit 100)x),'[]'::jsonb);
 elsif p_action='artifact_purged' then
  update public.saas_local_jobs set result=(result-'artifact_path')||jsonb_build_object('purged_at',now())
   where id=p_id and kind<>'prepare' and status='succeeded' and (result->>'expires_at')::timestamptz<=now();
  return jsonb_build_object('success',true);
 elsif p_action='restore_receipt' then
  select * into j from public.saas_local_jobs where id=p_id and status='succeeded' and kind in ('export_trial','export_final') for update;
  if not found or p_payload#>>'{receipt,installation_id}' is distinct from j.installation_id::text or p_payload#>>'{receipt,checksum}' is distinct from j.result->>'checksum'
   or p_payload#>>'{receipt,version}' is distinct from j.result->>'version' or p_payload#>>'{receipt,password_login}' is distinct from 'passed'
   or p_payload#>>'{receipt,data_integrity}' is distinct from 'passed' then raise exception 'Restore receipt does not match the snapshot'; end if;
  update public.saas_local_jobs set result=result||jsonb_build_object('restore_verified',true) where id=j.id;
  if j.kind='export_final' then
   update public.saas_local_transfer_locks set state='cutover' where installation_id=j.installation_id;
   update public.saas_local_installations set status='awaiting_cutover' where id=j.installation_id;
  end if;
  insert into public.saas_local_events(org_id,installation_id,job_id,event_type,message,actor_id) values(j.org_id,j.installation_id,j.id,'restore_verified','بازیابی و ورود با رمز قبلی با رسید امضاشده تأیید شد.',(p_payload->>'actor')::uuid);
  return jsonb_build_object('success',true);
 elsif p_action='publish' then
  o:=(p_payload->>'org_id')::uuid;
  if not public.org_is_saas_admin(o) or p_payload#>>'{manifest,checks,offline_install}' is distinct from 'passed'
   or p_payload#>>'{manifest,checks,clean_database}' is distinct from 'passed' or p_payload#>>'{manifest,checks,central_release}' is distinct from 'passed'
   then raise exception 'Release verification is incomplete'; end if;
  perform pg_advisory_xact_lock(hashtext(o::text||':local-release'));
  update public.saas_local_releases set is_current_central=false where org_id=o and is_current_central;
  insert into public.saas_local_releases(id,org_id,version,commit_sha,schema_version,manifest,artifact_path,signature_path,checksum,is_current_central,verified_at)
  values(coalesce((p_payload->>'id')::uuid,gen_random_uuid()),o,p_payload->>'version',p_payload->>'commit_sha',p_payload->>'schema_version',p_payload->'manifest',p_payload->>'artifact_path',p_payload->>'signature_path',p_payload->>'checksum',true,now());
  return jsonb_build_object('success',true);
 elsif p_action='claim' then
  -- Expired work may have had side effects: it is never blindly executed again.
  update public.saas_local_jobs set status='needs_review',error_code='WORKER_INTERRUPTED',message='اجرای worker قطع شده؛ خروجی و قفل انتقال باید بررسی شوند.'
   where status='running' and lease_until<now();
  select * into j from public.saas_local_jobs where status='queued' order by requested_at for update skip locked limit 1;
  if not found then return null; end if;
  update public.saas_local_jobs set status='running',stage='preflight',started_at=coalesce(started_at,now()),lease_token=gen_random_uuid(),lease_until=now()+interval '2 minutes',attempt=attempt+1 where id=j.id returning * into j;
 else
  select * into j from public.saas_local_jobs where id=p_id and status='running' and lease_token=p_lease and lease_until>now() for update;
  if not found then raise exception 'Job lease is no longer valid'; end if;
  if p_action='heartbeat' then
   update public.saas_local_jobs set lease_until=now()+interval '2 minutes' where id=j.id;
  elsif p_action='stage' then
   if coalesce(p_payload->>'stage','') !~ '^[a-z_]{1,48}$' then raise exception 'Invalid stage'; end if;
   update public.saas_local_jobs set stage=p_payload->>'stage',message=left(p_payload->>'message',300) where id=j.id;
   insert into public.saas_local_events(org_id,installation_id,job_id,event_type,stage,message) values(j.org_id,j.installation_id,j.id,'stage',p_payload->>'stage',left(p_payload->>'message',300));
  elsif p_action in ('succeed','fail') then
   if p_action='succeed' and (coalesce(p_payload#>>'{result,artifact_path}','') not like j.org_id::text||'/'||j.installation_id::text||'/'||j.id::text||'/%'
    or p_payload#>>'{result,artifact_path}' like '%..%' or coalesce(p_payload#>>'{result,checksum}','') !~ '^[a-f0-9]{64}$'
    or (j.kind<>'prepare' and ((p_payload#>>'{result,expires_at}')::timestamptz is null or (p_payload#>>'{result,expires_at}')::timestamptz>now()+interval '7 days')))
    then raise exception 'Verified artifact is required'; end if;
   update public.saas_local_jobs set status=case when p_action='succeed' then 'succeeded' else 'failed' end,stage=case when p_action='succeed' then 'complete' else stage end,
    finished_at=now(),lease_until=null,result=case when p_action='succeed' then p_payload->'result' else '{}'::jsonb end,
    error_code=left(p_payload->>'error_code',80),message=left(p_payload->>'message',300) where id=j.id;
   update public.saas_local_installations set status=case when p_action='fail' then 'failed' when j.kind='prepare' then 'ready' when j.kind='export_trial' then 'trial' else 'awaiting_cutover' end,updated_at=now() where id=j.installation_id;
   insert into public.saas_local_events(org_id,installation_id,job_id,event_type,message) values(j.org_id,j.installation_id,j.id,p_action,left(p_payload->>'message',300));
  else raise exception 'Unknown worker action'; end if;
 end if;
 select * into i from public.saas_local_installations where id=j.installation_id;
 select * into r from public.saas_local_releases where id=j.release_id;
 return jsonb_build_object('job',to_jsonb(j),'installation',to_jsonb(i),'release',to_jsonb(r));
end $$;
revoke all on function public.worker_local_installation(text,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.worker_local_installation(text,uuid,uuid,jsonb) to service_role;

create or replace function public.receive_local_installation_report(p_id uuid,p_token text,p_report jsonb)
returns void language plpgsql security definer set search_path=public as $$
declare i public.saas_local_installations; safe jsonb;
begin
 if coalesce(auth.role(),'')<>'service_role' then raise exception using errcode='42501',message='Service access required'; end if;
 select * into i from public.saas_local_installations where id=p_id for update;
 if not found or not i.telemetry_enabled or not exists(select 1 from public.saas_local_credentials
  where installation_id=i.id and telemetry_token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex') and (expires_at is null or expires_at>now())) then
  raise exception using errcode='42501',message='Report credential is not valid'; end if;
 if exists(select 1 from public.saas_local_reports where installation_id=i.id and source='telemetry' and received_at>now()-interval '1 minute') then return; end if;
 safe:=public.local_installation_safe_report(p_report);
 insert into public.saas_local_reports(org_id,installation_id,report,source) values(i.org_id,i.id,safe,'telemetry');
 update public.saas_local_installations set last_report_at=now() where id=i.id;
end $$;
revoke all on function public.receive_local_installation_report(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.receive_local_installation_report(uuid,text,jsonb) to service_role;

-- Write fence is also enforced against service-role writes, not just the UI.
create or replace function public.local_installation_assert_writable(p_org_id uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
 if exists(select 1 from public.saas_local_transfer_locks where org_id=p_org_id) then
  raise exception using errcode='55000',message='این سازمان برای انتقال به نسخهٔ اختصاصی فقط‌خواندنی است.';
 end if;
end $$;
revoke all on function public.local_installation_assert_writable(uuid) from public,anon;
grant execute on function public.local_installation_assert_writable(uuid) to authenticated,service_role;
create or replace function public.local_installation_write_fence()
returns trigger language plpgsql security definer set search_path=public as $$
begin
 if TG_OP<>'INSERT' then perform public.local_installation_assert_writable((to_jsonb(old)->>'org_id')::uuid); end if;
 if TG_OP<>'DELETE' then perform public.local_installation_assert_writable((to_jsonb(new)->>'org_id')::uuid); return new; end if;
 return old;
end $$;
revoke all on function public.local_installation_write_fence() from public,anon,authenticated;
do $$ declare t record; begin
 for t in select c.table_name from information_schema.columns c join information_schema.tables tb using(table_schema,table_name)
 where c.table_schema='public' and c.column_name='org_id' and tb.table_type='BASE TABLE' and c.table_name not like 'saas_local_%' loop
  execute format('drop trigger if exists local_installation_write_fence on public.%I',t.table_name);
  execute format('create trigger local_installation_write_fence before insert or update or delete on public.%I for each row execute function public.local_installation_write_fence()',t.table_name);
 end loop;
end $$;

insert into storage.buckets(id,name,public,file_size_limit)
values('local-installations-private','local-installations-private',false,53687091200) on conflict(id) do nothing;
-- No authenticated storage policy: downloads are signed only after the scoped RPC authorizes them.

commit;
