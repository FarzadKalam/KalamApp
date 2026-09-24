-- TazeSystem V1 Phase 522: انتقال امن کیف پول اصلی به کیف پول پیامک.
begin;
create or replace function public.transfer_current_billing_wallet_to_sms(p_amount_irt numeric)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_org_id uuid:=public.current_org_id(); amount numeric:=greatest(0,coalesce(p_amount_irt,0)); billing public.org_billing_wallets%rowtype; sms public.org_sms_wallets%rowtype;
begin
  if auth.uid() is null or v_org_id is null then raise exception 'organization_access_denied'; end if;
  if amount<10000 or amount>100000000 then raise exception 'sms_wallet_transfer_amount_invalid'; end if;
  if not exists(select 1 from public.user_organization_memberships m where m.user_id=auth.uid() and m.org_id=v_org_id and m.is_active and (m.is_owner or m.software_role='admin')) then raise exception 'organization_admin_required'; end if;
  insert into public.org_billing_wallets(org_id) values(v_org_id) on conflict(org_id) do nothing;
  insert into public.org_sms_wallets(org_id) values(v_org_id) on conflict(org_id) do nothing;
  select * into billing from public.org_billing_wallets where org_id=v_org_id for update;
  if billing.status<>'active' or billing.balance_irt<amount then raise exception 'billing_wallet_insufficient'; end if;
  update public.org_billing_wallets set balance_irt=balance_irt-amount,updated_at=now() where org_id=v_org_id returning * into billing;
  insert into public.org_billing_wallet_transactions(org_id,kind,amount_irt,balance_after_irt,description,created_by,metadata) values(v_org_id,'ai_transfer',-amount,billing.balance_irt,'انتقال به کیف پول پیامک',auth.uid(),jsonb_build_object('target','sms_wallet'));
  update public.org_sms_wallets set balance_irt=balance_irt+amount,status='active',updated_at=now() where org_id=v_org_id returning * into sms;
  insert into public.org_sms_wallet_transactions(org_id,kind,amount_irt,balance_after_irt,description,created_by,metadata) values(v_org_id,'billing_wallet_transfer',amount,sms.balance_irt,'انتقال از کیف پول اصلی',auth.uid(),jsonb_build_object('source','billing_wallet'));
  return jsonb_build_object('success',true,'billing_wallet_balance_irt',billing.balance_irt,'sms_wallet_balance_irt',sms.balance_irt);
end; $$;
revoke all on function public.transfer_current_billing_wallet_to_sms(numeric) from public,anon;
grant execute on function public.transfer_current_billing_wallet_to_sms(numeric) to authenticated;
notify pgrst,'reload schema';
commit;
