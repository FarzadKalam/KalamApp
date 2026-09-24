-- TazeSystem V1 Phase 525: اتصال شارژ دستی پیامک به کیف پول مصرفی و تکمیل سوابق.
begin;

create or replace function public.admin_get_saas_org_sms_wallet(p_org_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public
as $$
declare w public.org_sms_wallets%rowtype;
begin
  if not public.current_user_has_saas_admin_permission('view') then raise exception 'permission denied'; end if;
  select * into w from public.org_sms_wallets where org_id=p_org_id;
  return coalesce(to_jsonb(w),'{}'::jsonb);
end;
$$;
revoke all on function public.admin_get_saas_org_sms_wallet(uuid) from public,anon;
grant execute on function public.admin_get_saas_org_sms_wallet(uuid) to authenticated;

create or replace function public.admin_adjust_saas_org_account(
  p_org_id uuid,
  p_sms_delta numeric default 0,
  p_ai_delta_irt numeric default 0,
  p_billing_wallet_delta_irt numeric default 0,
  p_reason text default null
)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  v_sms numeric := coalesce(p_sms_delta,0);
  v_ai numeric := coalesce(p_ai_delta_irt,0);
  v_wallet numeric := coalesce(p_billing_wallet_delta_irt,0);
  v_reason text := coalesce(nullif(trim(p_reason),''),'تغییر دستی مدیر تازه سیستم');
  v_wallet_row public.org_sms_wallets%rowtype;
  v_ai_row public.org_ai_wallets%rowtype;
  v_billing_row public.org_billing_wallets%rowtype;
begin
  if not public.current_user_has_saas_admin_permission('edit_orgs') then raise exception 'permission denied'; end if;
  if not exists(select 1 from public.saas_org_settings where org_id=p_org_id) then raise exception 'saas_org_not_found'; end if;
  if v_sms=0 and v_ai=0 and v_wallet=0 then raise exception 'admin_adjustment_empty'; end if;

  if v_sms<>0 then
    insert into public.org_sms_wallets(org_id,status) values(p_org_id,'active') on conflict(org_id) do nothing;
    select * into v_wallet_row from public.org_sms_wallets where org_id=p_org_id for update;
    if v_wallet_row.balance_irt+v_sms<0 then raise exception 'sms_wallet_negative_balance'; end if;
    update public.org_sms_wallets set balance_irt=balance_irt+v_sms,status='active',updated_at=now() where org_id=p_org_id returning * into v_wallet_row;
    insert into public.org_sms_wallet_transactions(org_id,kind,amount_irt,balance_after_irt,description,metadata,created_by)
    values(p_org_id,'admin_adjustment',v_sms,v_wallet_row.balance_irt,v_reason,jsonb_build_object('source','admin_adjustment'),auth.uid());
  end if;

  if v_ai<>0 then
    insert into public.org_ai_wallets(org_id,balance_irt,status) values(p_org_id,0,'active') on conflict(org_id) do nothing;
    select * into v_ai_row from public.org_ai_wallets where org_id=p_org_id for update;
    if v_ai_row.balance_irt+v_ai<0 then raise exception 'ai_wallet_negative_balance'; end if;
    update public.org_ai_wallets set balance_irt=balance_irt+v_ai,status='active',updated_at=now() where org_id=p_org_id returning * into v_ai_row;
    if v_ai>0 then insert into public.org_ai_credit_grants(org_id,amount_irt,reason,granted_by,metadata) values(p_org_id,v_ai,v_reason,auth.uid(),jsonb_build_object('source','admin_adjustment')); end if;
  end if;

  if v_wallet<>0 then
    insert into public.org_billing_wallets(org_id,balance_irt,status) values(p_org_id,0,'active') on conflict(org_id) do nothing;
    select * into v_billing_row from public.org_billing_wallets where org_id=p_org_id for update;
    if v_billing_row.balance_irt+v_wallet<0 then raise exception 'billing_wallet_negative_balance'; end if;
    update public.org_billing_wallets set balance_irt=balance_irt+v_wallet,updated_at=now() where org_id=p_org_id returning * into v_billing_row;
    insert into public.org_billing_wallet_transactions(org_id,kind,amount_irt,balance_after_irt,description,metadata,created_by)
    values(p_org_id,'admin_adjustment',v_wallet,v_billing_row.balance_irt,v_reason,jsonb_build_object('source','admin_adjustment'),auth.uid());
  end if;

  insert into public.saas_account_admin_history(org_id,kind,title,amount_irt,metadata,created_by)
  values(p_org_id,'admin_adjustment',v_reason,nullif(v_sms+v_ai+v_wallet,0),jsonb_build_object('sms_delta_irt',v_sms,'ai_delta_irt',v_ai,'billing_wallet_delta_irt',v_wallet),auth.uid());
  return public.saas_account_overview_payload(p_org_id);
end;
$$;

revoke all on function public.admin_adjust_saas_org_account(uuid,numeric,numeric,numeric,text) from public,anon;
grant execute on function public.admin_adjust_saas_org_account(uuid,numeric,numeric,numeric,text) to authenticated;
notify pgrst,'reload schema';
commit;
