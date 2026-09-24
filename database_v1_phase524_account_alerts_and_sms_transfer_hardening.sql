-- TazeSystem V1 Phase 524: اعلان‌های اعتبار/دوره و ثبت انتقال پیامک.
begin;

-- یک اعلان در هر روز قابل بستن است؛ فردا دوباره برای همان وضعیت قابل نمایش خواهد بود.
create or replace function public.dismiss_user_announcement(
  p_announcement_id uuid,
  p_surface text
)
returns boolean
language plpgsql security definer set search_path = public
as $$
declare
  v_surface text := public.normalize_announcement_surface(p_surface);
  v_org_id uuid := public.current_org_id();
begin
  if auth.uid() is null then raise exception 'permission denied'; end if;
  if v_surface not in ('public_site', 'user_panel', 'login_page') then raise exception 'surface is invalid'; end if;
  if not exists (select 1 from public.saas_user_announcements a where a.id = p_announcement_id and a.is_active and a.allow_dismiss) then return false; end if;
  insert into public.saas_user_announcement_dismissals(announcement_id,org_id,user_id,surface,dismissed_at)
  values(p_announcement_id,v_org_id,auth.uid(),v_surface,now())
  on conflict (announcement_id,user_id,surface) do update set org_id=excluded.org_id,dismissed_at=now();
  return true;
end;
$$;

create or replace function public.get_active_user_announcements(
  p_surface text,
  p_path text default null,
  p_host text default null
)
returns table(id uuid, kind text, title text, body text, media_items jsonb, allow_dismiss boolean, priority integer, conditions_all jsonb, conditions_any jsonb, starts_at timestamptz, ends_at timestamptz)
language plpgsql stable security definer set search_path = public
as $$
declare
  v_surface text := public.normalize_announcement_surface(p_surface);
  v_path text := lower(trim(coalesce(p_path,'')));
  v_host text := lower(trim(coalesce(p_host,'')));
  v_org_id uuid := public.current_org_id();
  v_user_id uuid := auth.uid();
  v_role_id uuid := null;
  v_is_demo boolean := false;
begin
  if v_surface not in ('public_site','user_panel','login_page') then return; end if;
  if v_user_id is not null then select p.role_id into v_role_id from public.profiles p where p.id=v_user_id; end if;
  if v_org_id is not null then select coalesce(s.is_demo,false) into v_is_demo from public.saas_org_settings s where s.org_id=v_org_id; end if;
  return query
  select a.id, case when trim(coalesce(a.kind,'header'))='popup' then 'popup' else 'header' end,
    coalesce(a.title,''),coalesce(a.body,''),coalesce(a.media_items,'[]'::jsonb),coalesce(a.allow_dismiss,false),coalesce(a.priority,100),coalesce(a.conditions_all,'[]'::jsonb),coalesce(a.conditions_any,'[]'::jsonb),a.starts_at,a.ends_at
  from public.saas_user_announcements a
  where a.is_active and (a.starts_at is null or a.starts_at<=now()) and (a.ends_at is null or a.ends_at>=now())
    and ((v_surface='public_site' and a.show_on_public_site) or (v_surface='user_panel' and a.show_on_user_panel) or (v_surface='login_page' and a.show_on_login))
    and (coalesce(array_length(a.target_org_ids,1),0)=0 or (v_org_id is not null and v_org_id=any(a.target_org_ids)))
    and (coalesce(array_length(a.target_user_ids,1),0)=0 or (v_user_id is not null and v_user_id=any(a.target_user_ids)))
    and (coalesce(array_length(a.target_role_ids,1),0)=0 or (v_role_id is not null and v_role_id=any(a.target_role_ids)))
    and (coalesce(a.audience_scope,'all')='all' or (a.audience_scope='demo_only' and v_is_demo) or (a.audience_scope='non_demo_only' and not v_is_demo))
    and (coalesce(array_length(a.target_host_patterns,1),0)=0 or exists(select 1 from unnest(a.target_host_patterns) p(pattern) where v_host like replace(lower(trim(p.pattern)),'*','%')))
    and (coalesce(array_length(a.target_path_patterns,1),0)=0 or exists(select 1 from unnest(a.target_path_patterns) p(pattern) where v_path like replace(lower(trim(p.pattern)),'*','%')))
    and (not a.allow_dismiss or v_user_id is null or not exists(select 1 from public.saas_user_announcement_dismissals d where d.announcement_id=a.id and d.user_id=v_user_id and d.surface=v_surface and d.org_id is not distinct from v_org_id and d.dismissed_at::date=current_date))
  order by coalesce(a.priority,100),a.created_at desc;
end;
$$;
revoke all on function public.dismiss_user_announcement(uuid,text), public.get_active_user_announcements(text,text,text) from public;
grant execute on function public.dismiss_user_announcement(uuid,text) to authenticated;
grant execute on function public.get_active_user_announcements(text,text,text) to anon,authenticated;

insert into public.saas_user_announcements(kind,title,body,show_on_user_panel,allow_dismiss,audience_scope,conditions_all,priority)
select 'popup','دورهٔ حساب شما رو به پایان است','تا پایان دورهٔ حساب شما کمتر از ۷ روز باقی مانده است. برای حفظ دسترسی، تمدید یا ارتقای پلن را از تنظیمات حساب انجام دهید.',true,true,'all', '[{"field":"is_authenticated","operator":"is_true"},{"field":"can_view_account_settings","operator":"is_true"},{"field":"is_saas_admin_org","operator":"is_false"},{"field":"trial_days_remaining","operator":"gte","value":0},{"field":"trial_days_remaining","operator":"lte","value":7}]'::jsonb,20
where not exists (select 1 from public.saas_user_announcements where title='دورهٔ حساب شما رو به پایان است');

insert into public.saas_user_announcements(kind,title,body,show_on_user_panel,allow_dismiss,audience_scope,conditions_all,priority)
select 'header','اعتبار هوش مصنوعی رو به پایان است','اعتبار باقی‌ماندهٔ هوش مصنوعی سازمان به ۱۰۰٬۰۰۰ تومان یا کمتر رسیده است. از تنظیمات حساب آن را شارژ کنید.',true,true,'all','[{"field":"is_authenticated","operator":"is_true"},{"field":"can_view_account_settings","operator":"is_true"},{"field":"is_saas_admin_org","operator":"is_false"},{"field":"ai_wallet_remaining_irt","operator":"lte","value":100000}]'::jsonb,30
where not exists (select 1 from public.saas_user_announcements where title='اعتبار هوش مصنوعی رو به پایان است');

insert into public.saas_user_announcements(kind,title,body,show_on_user_panel,allow_dismiss,audience_scope,conditions_all,priority)
select 'header','اعتبار پیامک رو به پایان است','اعتبار باقی‌ماندهٔ پیامک سازمان به ۱۰۰٬۰۰۰ تومان یا کمتر رسیده است. از تنظیمات حساب آن را شارژ کنید.',true,true,'all','[{"field":"is_authenticated","operator":"is_true"},{"field":"can_view_account_settings","operator":"is_true"},{"field":"is_saas_admin_org","operator":"is_false"},{"field":"sms_wallet_remaining_irt","operator":"lte","value":100000}]'::jsonb,31
where not exists (select 1 from public.saas_user_announcements where title='اعتبار پیامک رو به پایان است');

notify pgrst,'reload schema';
commit;
