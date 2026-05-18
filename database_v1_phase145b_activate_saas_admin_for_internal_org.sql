-- =====================================================
-- فعال‌سازی __saas_admin برای سازمان داخلی
-- org_id: 62f02c27-ff88-46b1-9fe2-e2d7cbc29a6a
-- تاریخ: 2026-05-15
-- =====================================================
-- این migration فقط یک‌بار روی سازمان داخلی اجرا می‌شود.
-- بعد از اجرا، از Settings > چارت سازمانی می‌توانید
-- per-role تنظیم کنید که کدام نقش دسترسی SaaS Admin داشته باشد.
-- =====================================================

begin;

-- ابتدا وضعیت فعلی را ببینیم
do $$
declare
  v_org_id uuid := '62f02c27-ff88-46b1-9fe2-e2d7cbc29a6a';
  v_role_count integer;
begin
  select count(*) into v_role_count
  from public.org_roles
  where org_id = v_org_id;

  raise notice 'تعداد نقش‌های سازمان: %', v_role_count;
end;
$$;

-- فعال‌سازی __saas_admin فقط روی نقش‌های admin/owner سازمان داخلی
-- نقش‌های دیگر از طریق Settings > چارت سازمانی تنظیم می‌شوند
update public.org_roles
set
  permissions = jsonb_set(
    coalesce(permissions, '{}'::jsonb),
    '{__saas_admin}',
    jsonb_build_object(
      'view', true,
      'edit', true,
      'fields', jsonb_build_object('demo_override', true)
    ),
    true
  ),
  updated_at = now()
where
  org_id = '62f02c27-ff88-46b1-9fe2-e2d7cbc29a6a'
  and (
    lower(coalesce(title, '')) in ('super_admin', 'admin', 'مدیر', 'مدیر کل', 'owner')
    or is_system = true
  );

-- گزارش نتیجه
do $$
declare
  v_updated integer;
  v_role record;
begin
  select count(*) into v_updated
  from public.org_roles
  where
    org_id = '62f02c27-ff88-46b1-9fe2-e2d7cbc29a6a'
    and (permissions -> '__saas_admin' -> 'view') = 'true'::jsonb;

  raise notice '✅ تعداد نقش‌های با دسترسی SaaS Admin: %', v_updated;

  -- لیست نقش‌هایی که دسترسی گرفتند
  for v_role in
    select title, id
    from public.org_roles
    where
      org_id = '62f02c27-ff88-46b1-9fe2-e2d7cbc29a6a'
      and (permissions -> '__saas_admin' -> 'view') = 'true'::jsonb
  loop
    raise notice '  → نقش: % (id: %)', v_role.title, v_role.id;
  end loop;
end;
$$;

notify pgrst, 'reload schema';

commit;
