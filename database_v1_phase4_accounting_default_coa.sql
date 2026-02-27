-- =====================================================
-- KalamApp - Phase 4 Default Chart Of Accounts (Iran)
-- Date: 2026-02-26
-- Type: Additive / non-breaking seed migration
-- Prerequisite: database_v1_phase2_accounting.sql
-- =====================================================

-- -----------------------------------------------------
-- Seed default COA for current organization (idempotent)
-- -----------------------------------------------------
do $$
declare
  v_org_id uuid := public.current_org_id();
  v_existing_id uuid;
  r record;
begin
  create temporary table tmp_coa_seed (
    code text not null,
    name text not null,
    account_type text not null,
    account_level text not null,
    nature text not null,
    parent_code text,
    is_leaf boolean not null default true
  ) on commit drop;

  insert into tmp_coa_seed (code, name, account_type, account_level, nature, parent_code, is_leaf)
  values
    -- دارایی‌ها
    ('1', 'دارایی ها', 'asset', 'group', 'debit', null, false),
    ('11', 'دارایی های جاری', 'asset', 'general', 'debit', '1', false),
    ('110', 'وجوه نقد و بانک', 'asset', 'subsidiary', 'debit', '11', false),
    ('1101', 'صندوق', 'asset', 'detail', 'debit', '110', true),
    ('1102', 'بانک ها', 'asset', 'detail', 'debit', '110', true),
    ('111', 'مطالبات تجاری', 'asset', 'subsidiary', 'debit', '11', false),
    ('1111', 'حساب های دریافتنی تجاری', 'asset', 'detail', 'debit', '111', true),
    ('1112', 'اسناد دریافتنی', 'asset', 'detail', 'debit', '111', true),
    ('112', 'پیش پرداخت ها', 'asset', 'subsidiary', 'debit', '11', false),
    ('1121', 'پیش پرداخت خرید', 'asset', 'detail', 'debit', '112', true),
    ('13', 'موجودی ها', 'asset', 'general', 'debit', '1', false),
    ('130', 'موجودی کالا', 'asset', 'subsidiary', 'debit', '13', false),
    ('1301', 'موجودی کالا', 'asset', 'detail', 'debit', '130', true),
    ('14', 'دارایی های ثابت', 'asset', 'general', 'debit', '1', false),
    ('140', 'دارایی ثابت مشهود', 'asset', 'subsidiary', 'debit', '14', false),
    ('1401', 'ماشین آلات و تجهیزات', 'asset', 'detail', 'debit', '140', true),

    -- بدهی‌ها
    ('2', 'بدهی ها', 'liability', 'group', 'credit', null, false),
    ('21', 'بدهی های جاری', 'liability', 'general', 'credit', '2', false),
    ('210', 'بدهی های تجاری', 'liability', 'subsidiary', 'credit', '21', false),
    ('2101', 'حساب های پرداختنی تجاری', 'liability', 'detail', 'credit', '210', true),
    ('2102', 'اسناد پرداختنی', 'liability', 'detail', 'credit', '210', true),
    ('211', 'مالیات و عوارض', 'liability', 'subsidiary', 'credit', '21', false),
    ('2111', 'مالیات و عوارض ارزش افزوده پرداختنی', 'liability', 'detail', 'credit', '211', true),
    ('212', 'سایر بدهی های جاری', 'liability', 'subsidiary', 'credit', '21', false),
    ('2121', 'حقوق و دستمزد پرداختنی', 'liability', 'detail', 'credit', '212', true),
    ('22', 'بدهی های غیرجاری', 'liability', 'general', 'credit', '2', false),
    ('220', 'وام ها', 'liability', 'subsidiary', 'credit', '22', false),
    ('2201', 'وام بلندمدت', 'liability', 'detail', 'credit', '220', true),

    -- سرمایه
    ('3', 'حقوق مالکانه', 'equity', 'group', 'credit', null, false),
    ('31', 'سرمایه و اندوخته ها', 'equity', 'general', 'credit', '3', false),
    ('310', 'سرمایه', 'equity', 'subsidiary', 'credit', '31', false),
    ('3101', 'سرمایه', 'equity', 'detail', 'credit', '310', true),
    ('320', 'سود و زیان انباشته', 'equity', 'subsidiary', 'credit', '31', false),
    ('3201', 'سود و زیان انباشته', 'equity', 'detail', 'credit', '320', true),

    -- درآمدها
    ('4', 'درآمدها', 'income', 'group', 'credit', null, false),
    ('41', 'درآمد عملیاتی', 'income', 'general', 'credit', '4', false),
    ('410', 'فروش', 'income', 'subsidiary', 'credit', '41', false),
    ('4101', 'فروش کالا و خدمات', 'income', 'detail', 'credit', '410', true),
    ('4102', 'برگشت از فروش و تخفیفات', 'income', 'detail', 'debit', '410', true),
    ('42', 'سایر درآمدها', 'income', 'general', 'credit', '4', false),
    ('420', 'درآمدهای متفرقه', 'income', 'subsidiary', 'credit', '42', false),
    ('4201', 'سایر درآمدهای عملیاتی', 'income', 'detail', 'credit', '420', true),

    -- هزینه‌ها
    ('5', 'هزینه ها', 'expense', 'group', 'debit', null, false),
    ('51', 'بهای تمام شده', 'expense', 'general', 'debit', '5', false),
    ('510', 'بهای تمام شده کالای فروش رفته', 'expense', 'subsidiary', 'debit', '51', false),
    ('5101', 'بهای تمام شده کالای فروش رفته', 'expense', 'detail', 'debit', '510', true),
    ('52', 'هزینه های اداری و عمومی', 'expense', 'general', 'debit', '5', false),
    ('520', 'هزینه های عمومی', 'expense', 'subsidiary', 'debit', '52', false),
    ('5201', 'هزینه حقوق و دستمزد', 'expense', 'detail', 'debit', '520', true),
    ('5202', 'هزینه حمل و نقل', 'expense', 'detail', 'debit', '520', true),
    ('53', 'مالیات و عوارض خرید', 'expense', 'general', 'debit', '5', false),
    ('530', 'اعتبار مالیاتی خرید', 'expense', 'subsidiary', 'debit', '53', false),
    ('5301', 'مالیات و عوارض ارزش افزوده خرید', 'expense', 'detail', 'debit', '530', true),
    ('54', 'هزینه های مالی', 'expense', 'general', 'debit', '5', false),
    ('540', 'هزینه های مالی', 'expense', 'subsidiary', 'debit', '54', false),
    ('5401', 'کارمزد و بهره بانکی', 'expense', 'detail', 'debit', '540', true);

  for r in
    select *
    from tmp_coa_seed
    order by length(code), code
  loop
    select c.id
    into v_existing_id
    from public.chart_of_accounts c
    where c.code = r.code
      and c.org_id is not distinct from v_org_id
    limit 1;

    if v_existing_id is null then
      insert into public.chart_of_accounts (
        org_id, code, name, account_type, account_level, nature,
        is_leaf, is_system, is_active
      )
      values (
        v_org_id, r.code, r.name, r.account_type, r.account_level, r.nature,
        r.is_leaf, true, true
      );
    else
      update public.chart_of_accounts c
      set
        name = r.name,
        account_type = r.account_type,
        account_level = r.account_level,
        nature = r.nature,
        is_leaf = r.is_leaf,
        is_system = true,
        is_active = true,
        updated_at = now()
      where c.id = v_existing_id;
    end if;
  end loop;

  -- Set parent links by code relation
  update public.chart_of_accounts c
  set parent_id = p.id,
      updated_at = now()
  from tmp_coa_seed s
  left join public.chart_of_accounts p
    on p.code = s.parent_code
   and p.org_id is not distinct from v_org_id
  where c.code = s.code
    and c.org_id is not distinct from v_org_id
    and c.parent_id is distinct from p.id;

  -- Ensure all parent accounts are non-leaf
  update public.chart_of_accounts p
  set is_leaf = false,
      updated_at = now()
  where p.org_id is not distinct from v_org_id
    and exists (
      select 1
      from public.chart_of_accounts c
      where c.parent_id = p.id
    );
end $$;

-- -----------------------------------------------------
-- Notes
-- 1) This seed is idempotent and can be re-run safely.
-- 2) It creates a practical default COA structure for Iran market needs.
-- 3) You can customize account names/codes per organization after seeding.
-- -----------------------------------------------------
