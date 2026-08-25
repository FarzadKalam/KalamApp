-- TazeSystem - Phase 473 Customer-club level recalculation consistency
-- اجرای دسته‌ای سطح‌بندی، معیارهای معتبر سازمان را مستقل از محل ذخیرهٔ قدیمی
-- یا جدید تنظیمات می‌خواند و فقط تغییر واقعی سطح را ثبت می‌کند.

begin;

create or replace function public.sync_customer_club_levels(p_customer_ids uuid[])
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_org_id uuid := public.current_org_id();
  v_customer_id uuid;
  v_customer record;
  v_settings jsonb := '{}'::jsonb;
  v_enabled boolean := true;
  v_rank text;
  v_old_rank text;
  v_processed integer := 0;
  v_silver jsonb := '{}'::jsonb;
  v_gold jsonb := '{}'::jsonb;
  v_vip jsonb := '{}'::jsonb;
begin
  if v_org_id is null or coalesce(array_length(p_customer_ids, 1), 0) = 0 then
    return 0;
  end if;

  select coalesce(nullif(to_jsonb(cs)->'customer_leveling_config', 'null'::jsonb), '{}'::jsonb)
    into v_settings
  from public.company_settings cs
  where cs.org_id = v_org_id
  limit 1;

  if v_settings = '{}'::jsonb then
    select coalesce(nullif(settings->'customer_leveling_config', 'null'::jsonb), '{}'::jsonb)
      into v_settings
    from public.integration_settings
    where org_id = v_org_id and connection_type = 'site'
    limit 1;
  end if;

  v_enabled := coalesce((v_settings->>'enabled')::boolean, true);
  v_silver := coalesce(v_settings->'silver', '{}'::jsonb);
  v_gold := coalesce(v_settings->'gold', '{}'::jsonb);
  v_vip := coalesce(v_settings->'vip', '{}'::jsonb);

  for v_customer_id in
    select id
    from public.customers
    where org_id = v_org_id and id = any(p_customer_ids)
    order by id
  loop
    perform public.sync_customer_financial_stats(v_customer_id);

    select * into v_customer
    from public.customers
    where id = v_customer_id and org_id = v_org_id;
    if not found then continue; end if;

    v_rank := 'normal';
    if v_enabled then
      if coalesce(v_customer.purchase_count, 0) >= coalesce((v_vip->>'min_purchase_count')::numeric, 15)
         and coalesce(v_customer.total_spend, 0) >= coalesce((v_vip->>'min_total_spend')::numeric, 300000000)
         and coalesce(v_customer.acquaintance_days, 0) >= coalesce((v_vip->>'min_acquaintance_days')::numeric, 365) then
        v_rank := 'vip';
      elsif coalesce(v_customer.purchase_count, 0) >= coalesce((v_gold->>'min_purchase_count')::numeric, 8)
         and coalesce(v_customer.total_spend, 0) >= coalesce((v_gold->>'min_total_spend')::numeric, 120000000)
         and coalesce(v_customer.acquaintance_days, 0) >= coalesce((v_gold->>'min_acquaintance_days')::numeric, 120) then
        v_rank := 'gold';
      elsif coalesce(v_customer.purchase_count, 0) >= coalesce((v_silver->>'min_purchase_count')::numeric, 3)
         and coalesce(v_customer.total_spend, 0) >= coalesce((v_silver->>'min_total_spend')::numeric, 30000000)
         and coalesce(v_customer.acquaintance_days, 0) >= coalesce((v_silver->>'min_acquaintance_days')::numeric, 30) then
        v_rank := 'silver';
      end if;
    end if;

    v_old_rank := coalesce(v_customer.rank, 'normal');
    update public.customers
    set rank = v_rank
    where id = v_customer_id and org_id = v_org_id and rank is distinct from v_rank;

    if v_old_rank is distinct from v_rank then
      perform public.log_customer_club_event(
        'level_changed', 'تغییر سطح مشتری', v_customer_id, null, null, null,
        'customers', v_customer_id, jsonb_build_object('from', v_old_rank, 'to', v_rank)
      );
    end if;
    v_processed := v_processed + 1;
  end loop;

  return v_processed;
end;
$$;

revoke all on function public.sync_customer_club_levels(uuid[]) from public;
grant execute on function public.sync_customer_club_levels(uuid[]) to authenticated;

commit;
