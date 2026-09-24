-- TazeSystem V1 Phase 521
-- کیف پول‌های مصرفی tenant، هدیهٔ یک‌بارهٔ دمو/اولین خرید و مبنای اعلان‌ها.
begin;

create table if not exists public.org_sms_wallets (
  org_id uuid primary key references public.organizations(id) on delete cascade,
  balance_irt numeric not null default 0 check (balance_irt >= 0),
  included_quota_irt numeric not null default 0 check (included_quota_irt >= 0),
  reserved_irt numeric not null default 0 check (reserved_irt >= 0),
  status text not null default 'active' check (status in ('active','blocked','disabled')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.org_sms_wallet_transactions (
  id uuid primary key default gen_random_uuid(), org_id uuid not null references public.organizations(id) on delete cascade,
  kind text not null check (kind in ('gift','topup','billing_wallet_transfer','usage','refund','admin_adjustment')),
  amount_irt numeric not null check (amount_irt <> 0), balance_after_irt numeric not null check (balance_after_irt >= 0),
  description text not null, metadata jsonb not null default '{}'::jsonb, created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_org_sms_wallet_transactions_org_created on public.org_sms_wallet_transactions(org_id, created_at desc);
alter table public.org_sms_wallets enable row level security;
alter table public.org_sms_wallet_transactions enable row level security;
drop policy if exists p_org_sms_wallets_read on public.org_sms_wallets;
create policy p_org_sms_wallets_read on public.org_sms_wallets for select to authenticated using (org_id = public.current_org_id());
drop policy if exists p_org_sms_wallet_transactions_read on public.org_sms_wallet_transactions;
create policy p_org_sms_wallet_transactions_read on public.org_sms_wallet_transactions for select to authenticated using (org_id = public.current_org_id());
revoke all on public.org_sms_wallets, public.org_sms_wallet_transactions from public, anon, authenticated;
grant select on public.org_sms_wallets, public.org_sms_wallet_transactions to authenticated;

create table if not exists public.saas_consumption_credit_gifts (
  org_id uuid not null references public.organizations(id) on delete cascade,
  gift_kind text not null check (gift_kind in ('demo','first_paid_plan')),
  ai_amount_irt numeric not null default 0, sms_amount_irt numeric not null default 0,
  granted_at timestamptz not null default now(), primary key (org_id, gift_kind)
);
alter table public.saas_consumption_credit_gifts enable row level security;
revoke all on public.saas_consumption_credit_gifts from public, anon, authenticated;

create or replace function public.grant_saas_consumption_welcome_credit(p_org_id uuid, p_gift_kind text, p_plan_code text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_ai numeric := 0; v_sms numeric := 0; v_existing_ai numeric := 0; v_existing_sms numeric := 0; ai_wallet public.org_ai_wallets%rowtype; sms_wallet public.org_sms_wallets%rowtype;
begin
  if p_org_id is null or p_gift_kind not in ('demo','first_paid_plan') then return jsonb_build_object('success',false); end if;
  if exists(select 1 from public.saas_consumption_credit_gifts where org_id=p_org_id and gift_kind=p_gift_kind) then return jsonb_build_object('success',true,'already_granted',true); end if;
  if p_gift_kind='demo' then v_ai:=80000; v_sms:=10000;
  else
    case lower(coalesce(p_plan_code,'')) when 'cloud_starter' then v_ai:=120000; v_sms:=120000; when 'cloud_growth' then v_ai:=250000; v_sms:=250000; when 'cloud_enterprise' then v_ai:=500000; v_sms:=500000; else return jsonb_build_object('success',false,'reason','not_paid_plan'); end case;
    select coalesce(sum(ai_amount_irt),0),coalesce(sum(sms_amount_irt),0) into v_existing_ai,v_existing_sms from public.saas_consumption_credit_gifts where org_id=p_org_id;
    v_ai:=greatest(0,v_ai-v_existing_ai); v_sms:=greatest(0,v_sms-v_existing_sms);
  end if;
  insert into public.org_ai_wallets(org_id,status) values(p_org_id,'active') on conflict(org_id) do nothing;
  insert into public.org_sms_wallets(org_id,status) values(p_org_id,'active') on conflict(org_id) do nothing;
  update public.org_ai_wallets set included_quota_irt=included_quota_irt+v_ai,updated_at=now() where org_id=p_org_id returning * into ai_wallet;
  update public.org_sms_wallets set included_quota_irt=included_quota_irt+v_sms,updated_at=now() where org_id=p_org_id returning * into sms_wallet;
  insert into public.saas_consumption_credit_gifts(org_id,gift_kind,ai_amount_irt,sms_amount_irt) values(p_org_id,p_gift_kind,v_ai,v_sms);
  if v_sms>0 then insert into public.org_sms_wallet_transactions(org_id,kind,amount_irt,balance_after_irt,description,metadata) values(p_org_id,'gift',v_sms,sms_wallet.balance_irt,'هدیه اعتبار پیامک',jsonb_build_object('gift_kind',p_gift_kind)); end if;
  return jsonb_build_object('success',true,'ai_amount_irt',v_ai,'sms_amount_irt',v_sms);
end; $$;

create or replace function public.trg_grant_saas_consumption_welcome_credit()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.is_demo then perform public.grant_saas_consumption_welcome_credit(new.org_id,'demo',new.plan_code); end if;
  if not new.is_demo and lower(coalesce(new.plan_code,'')) in ('cloud_starter','cloud_growth','cloud_enterprise') then perform public.grant_saas_consumption_welcome_credit(new.org_id,'first_paid_plan',new.plan_code); end if;
  return new;
end; $$;
drop trigger if exists trg_saas_consumption_welcome_credit on public.saas_org_settings;
create trigger trg_saas_consumption_welcome_credit after insert or update of is_demo,plan_code on public.saas_org_settings for each row execute function public.trg_grant_saas_consumption_welcome_credit();

-- داده‌های موجود نیز فقط یک‌بار و بر مبنای وضعیت واقعی خودشان هدیه می‌گیرند.
select public.grant_saas_consumption_welcome_credit(org_id,'demo',plan_code) from public.saas_org_settings where is_demo;
select public.grant_saas_consumption_welcome_credit(org_id,'first_paid_plan',plan_code) from public.saas_org_settings where not is_demo and lower(coalesce(plan_code,'')) in ('cloud_starter','cloud_growth','cloud_enterprise');

notify pgrst, 'reload schema';
commit;
