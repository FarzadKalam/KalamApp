-- TazeSystem V1 Phase 523: ثبت هزینهٔ واقعی پیامک از اختلاف اعتبار provider.
begin;
create or replace function public.charge_org_sms_wallet_usage(p_org_id uuid, p_provider_before numeric, p_provider_after numeric, p_margin_percent numeric default 30, p_message_count integer default 1, p_metadata jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_raw numeric:=greatest(0,coalesce(p_provider_before,0)-coalesce(p_provider_after,0)); v_charge numeric:=round(v_raw*(1+greatest(0,coalesce(p_margin_percent,30))/100),2); w public.org_sms_wallets%rowtype; from_included numeric; from_balance numeric;
begin
 if p_org_id is null or v_raw<=0 then return jsonb_build_object('success',true,'raw_cost_irt',v_raw,'charged_irt',0); end if;
 insert into public.org_sms_wallets(org_id,status) values(p_org_id,'active') on conflict(org_id) do nothing;
 select * into w from public.org_sms_wallets where org_id=p_org_id for update;
 if w.status<>'active' then raise exception 'sms_wallet_blocked'; end if;
 from_included:=least(w.included_quota_irt,v_charge); from_balance:=v_charge-from_included;
 if w.included_quota_irt+w.balance_irt-w.reserved_irt < v_charge then raise exception 'sms_wallet_insufficient'; end if;
 update public.org_sms_wallets set included_quota_irt=included_quota_irt-from_included,balance_irt=balance_irt-from_balance,updated_at=now() where org_id=p_org_id returning * into w;
  insert into public.org_sms_wallet_transactions(org_id,kind,amount_irt,balance_after_irt,description,metadata) values(p_org_id,'usage',-v_charge,w.balance_irt,'هزینهٔ مصرف پیامک',w.metadata||coalesce(p_metadata,'{}'::jsonb)||jsonb_build_object('message_count',p_message_count,'raw_cost_irt',v_raw,'margin_percent',p_margin_percent,'provider_before',p_provider_before,'provider_after',p_provider_after,'charged_irt',v_charge));
 return jsonb_build_object('success',true,'raw_cost_irt',v_raw,'charged_irt',v_charge,'balance_irt',w.balance_irt,'included_quota_irt',w.included_quota_irt);
end; $$;
revoke all on function public.charge_org_sms_wallet_usage(uuid,numeric,numeric,numeric,integer,jsonb) from public,anon,authenticated;
grant execute on function public.charge_org_sms_wallet_usage(uuid,numeric,numeric,numeric,integer,jsonb) to service_role;
notify pgrst,'reload schema';
commit;
