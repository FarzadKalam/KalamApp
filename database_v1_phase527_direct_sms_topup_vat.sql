-- TazeSystem V1 Phase 527: شارژ مستقیم کیف پول پیامک با کسر ارزش افزوده.
begin;

create or replace function public.apply_saas_billing_wallet_topup_payment_transaction(p_transaction_id uuid)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  tx public.payment_transactions%rowtype;
  wallet public.org_billing_wallets%rowtype;
  sms public.org_sms_wallets%rowtype;
  gross numeric;
  net numeric;
  target text;
begin
  select * into tx from public.payment_transactions where id=p_transaction_id for update;
  if tx.id is null or tx.purpose<>'saas_billing_wallet_topup' or tx.status not in ('verified','paid') then raise exception 'payment_not_verified'; end if;
  target:=lower(coalesce(tx.metadata->>'wallet_target','billing'));
  gross:=greatest(0,coalesce((tx.metadata->>'wallet_amount_irt')::numeric,tx.amount,0));
  if gross<=0 then raise exception 'wallet_topup_amount_invalid'; end if;
  if target='sms' then
    if exists(select 1 from public.org_sms_wallet_transactions where org_id=tx.org_id and metadata->>'payment_transaction_id'=tx.id::text) then return jsonb_build_object('success',true,'already_applied',true); end if;
    net:=round(gross/1.10,2);
    insert into public.org_sms_wallets(org_id,status) values(tx.org_id,'active') on conflict(org_id) do nothing;
    select * into sms from public.org_sms_wallets where org_id=tx.org_id for update;
    if sms.status<>'active' then raise exception 'sms_wallet_blocked'; end if;
    update public.org_sms_wallets set balance_irt=balance_irt+net,updated_at=now() where org_id=tx.org_id returning * into sms;
    insert into public.org_sms_wallet_transactions(org_id,kind,amount_irt,balance_after_irt,description,metadata,created_by)
    values(tx.org_id,'topup',net,sms.balance_irt,'شارژ مستقیم کیف پول پیامک',jsonb_build_object('payment_transaction_id',tx.id,'gross_amount_irt',gross,'vat_percent',10,'net_amount_irt',net),tx.created_by);
    return jsonb_build_object('success',true,'wallet_target','sms','gross_amount_irt',gross,'vat_amount_irt',round(gross-net,2),'net_amount_irt',net,'balance_irt',sms.balance_irt);
  end if;
  if exists(select 1 from public.org_billing_wallet_transactions where payment_transaction_id=p_transaction_id) then return jsonb_build_object('success',true,'already_applied',true); end if;
  insert into public.org_billing_wallets(org_id) values(tx.org_id) on conflict(org_id) do nothing;
  select * into wallet from public.org_billing_wallets where org_id=tx.org_id for update;
  if wallet.status<>'active' then raise exception 'billing_wallet_blocked'; end if;
  update public.org_billing_wallets set balance_irt=balance_irt+gross,updated_at=now() where org_id=tx.org_id returning * into wallet;
  insert into public.org_billing_wallet_transactions(org_id,kind,amount_irt,balance_after_irt,payment_transaction_id,description,created_by)
  values(tx.org_id,'topup',gross,wallet.balance_irt,tx.id,'شارژ کیف پول سازمان',tx.created_by);
  return jsonb_build_object('success',true,'wallet_target','billing','balance_irt',wallet.balance_irt);
end;
$$;
revoke all on function public.apply_saas_billing_wallet_topup_payment_transaction(uuid) from public,anon,authenticated;
grant execute on function public.apply_saas_billing_wallet_topup_payment_transaction(uuid) to service_role;
notify pgrst,'reload schema';
commit;
