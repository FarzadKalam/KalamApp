-- =====================================================
-- TazeSystem V1 Phase 517
-- جلوگیری fail-closed از نمایش دادهٔ یک سازمان زیر دامنهٔ tenant دیگر.
-- =====================================================

begin;

create or replace function public.current_org_id()
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
  v_origin text;
  v_origin_host text;
  v_origin_org_id uuid;
begin
  select coalesce(p.org_id, r.org_id)
    into v_org_id
  from public.profiles p
  left join public.org_roles r on r.id = p.role_id
  where p.id = auth.uid()
  limit 1;

  -- درخواست‌های مرورگر به API مرکزی، Origin واقعی صفحه را همراه دارند.
  -- اگر این Origin برای tenant شناخته‌شده‌ای باشد، سازمان نشست باید همان باشد.
  -- درخواست‌های داخلی/سروری که Origin ندارند بدون تغییر به رفتار قبلی ادامه می‌دهند.
  begin
    v_origin := lower(trim(coalesce(
      (current_setting('request.headers', true)::jsonb ->> 'origin'),
      ''
    )));
  exception when others then
    v_origin := '';
  end;

  if v_origin ~ '^https?://[^/]+/?$' then
    v_origin_host := split_part(regexp_replace(v_origin, '^https?://', ''), '/', 1);
    v_origin_host := split_part(v_origin_host, ':', 1);

    select s.org_id
      into v_origin_org_id
    from public.saas_org_settings s
    where lower(trim(coalesce(s.resolved_host, ''))) = v_origin_host
    limit 1;

    if v_origin_org_id is not null
       and (v_org_id is null or v_org_id <> v_origin_org_id) then
      return null;
    end if;
  end if;

  return v_org_id;
end;
$$;

notify pgrst, 'reload schema';

commit;
