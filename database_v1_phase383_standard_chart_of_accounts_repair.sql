-- =====================================================
-- KalamApp - Phase 383: Standard chart of accounts repair
-- Type: additive / idempotent / tenant-safe
-- Restores only missing standard accounts and their hierarchy.
-- =====================================================

create or replace function public.seed_standard_chart_of_accounts(p_org_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_org_id is null then
    raise exception 'شناسه سازمان برای ایجاد جدول حساب‌ها الزامی است.';
  end if;

  -- ابتدا همه حساب‌های استانداردِ جاافتاده را می‌سازیم. parent_id در مرحله بعد
  -- تنظیم می‌شود تا ترتیب ثبت، وابستگی ایجاد نکند.
  with seed(code, name, account_type, account_level, nature, parent_code, is_leaf) as (
    values
      ('1', 'دارایی ها', 'asset', 'group', 'debit', null, false),
      ('11', 'دارایی های جاری', 'asset', 'general', 'debit', '1', false),
      ('110', 'وجوه نقد و بانک', 'asset', 'subsidiary', 'debit', '11', false),
      ('1101', 'صندوق', 'asset', 'detail', 'debit', '110', true),
      ('1102', 'بانک ها', 'asset', 'detail', 'debit', '110', true),
      ('1103', 'تنخواه', 'asset', 'detail', 'debit', '110', true),
      ('111', 'مطالبات تجاری', 'asset', 'subsidiary', 'debit', '11', false),
      ('1111', 'حساب های دریافتنی تجاری', 'asset', 'detail', 'debit', '111', true),
      ('1112', 'اسناد دریافتنی', 'asset', 'detail', 'debit', '111', true),
      ('112', 'پیش پرداخت ها', 'asset', 'subsidiary', 'debit', '11', false),
      ('1121', 'پیش پرداخت خرید', 'asset', 'detail', 'debit', '112', true),
      ('1122', 'مساعده کارکنان', 'asset', 'detail', 'debit', '112', true),
      ('13', 'موجودی ها', 'asset', 'general', 'debit', '1', false),
      ('130', 'موجودی کالا', 'asset', 'subsidiary', 'debit', '13', false),
      ('1301', 'موجودی کالا', 'asset', 'detail', 'debit', '130', true),
      ('14', 'دارایی های ثابت', 'asset', 'general', 'debit', '1', false),
      ('140', 'دارایی ثابت مشهود', 'asset', 'subsidiary', 'debit', '14', false),
      ('1401', 'ماشین آلات و تجهیزات', 'asset', 'detail', 'debit', '140', true),

      ('2', 'بدهی ها', 'liability', 'group', 'credit', null, false),
      ('21', 'بدهی های جاری', 'liability', 'general', 'credit', '2', false),
      ('210', 'بدهی های تجاری', 'liability', 'subsidiary', 'credit', '21', false),
      ('2101', 'حساب های پرداختنی تجاری', 'liability', 'detail', 'credit', '210', true),
      ('2102', 'اسناد پرداختنی', 'liability', 'detail', 'credit', '210', true),
      ('211', 'مالیات و عوارض', 'liability', 'subsidiary', 'credit', '21', false),
      ('2111', 'مالیات و عوارض ارزش افزوده پرداختنی', 'liability', 'detail', 'credit', '211', true),
      ('212', 'سایر بدهی های جاری', 'liability', 'subsidiary', 'credit', '21', false),
      ('2121', 'حقوق و دستمزد پرداختنی', 'liability', 'detail', 'credit', '212', true),
      ('2122', 'مالیات حقوق پرداختنی', 'liability', 'detail', 'credit', '212', true),
      ('2123', 'بیمه پرداختنی', 'liability', 'detail', 'credit', '212', true),
      ('2124', 'حساب واسط تهاتر', 'liability', 'detail', 'credit', '212', true),
      ('22', 'بدهی های غیرجاری', 'liability', 'general', 'credit', '2', false),
      ('220', 'وام ها', 'liability', 'subsidiary', 'credit', '22', false),
      ('2201', 'وام بلندمدت', 'liability', 'detail', 'credit', '220', true),

      ('3', 'حقوق مالکانه', 'equity', 'group', 'credit', null, false),
      ('31', 'سرمایه و اندوخته ها', 'equity', 'general', 'credit', '3', false),
      ('310', 'سرمایه', 'equity', 'subsidiary', 'credit', '31', false),
      ('3101', 'سرمایه', 'equity', 'detail', 'credit', '310', true),
      ('320', 'سود و زیان انباشته', 'equity', 'subsidiary', 'credit', '31', false),
      ('3201', 'سود و زیان انباشته', 'equity', 'detail', 'credit', '320', true),

      ('4', 'درآمدها', 'income', 'group', 'credit', null, false),
      ('41', 'درآمد عملیاتی', 'income', 'general', 'credit', '4', false),
      ('410', 'فروش', 'income', 'subsidiary', 'credit', '41', false),
      ('4101', 'فروش کالا و خدمات', 'income', 'detail', 'credit', '410', true),
      ('4102', 'برگشت از فروش و تخفیفات', 'income', 'detail', 'debit', '410', true),
      ('42', 'سایر درآمدها', 'income', 'general', 'credit', '4', false),
      ('420', 'درآمدهای متفرقه', 'income', 'subsidiary', 'credit', '42', false),
      ('4201', 'سایر درآمدهای عملیاتی', 'income', 'detail', 'credit', '420', true),

      ('5', 'هزینه ها', 'expense', 'group', 'debit', null, false),
      ('51', 'بهای تمام شده', 'expense', 'general', 'debit', '5', false),
      ('510', 'بهای تمام شده کالای فروش رفته', 'expense', 'subsidiary', 'debit', '51', false),
      ('5101', 'بهای تمام شده کالای فروش رفته', 'expense', 'detail', 'debit', '510', true),
      ('52', 'هزینه های اداری و عمومی', 'expense', 'general', 'debit', '5', false),
      ('520', 'هزینه های عمومی', 'expense', 'subsidiary', 'debit', '52', false),
      ('5201', 'هزینه حقوق و دستمزد', 'expense', 'detail', 'debit', '520', true),
      ('5202', 'هزینه حمل و نقل', 'expense', 'detail', 'debit', '520', true),
      ('5203', 'هزینه بیمه سهم کارفرما', 'expense', 'detail', 'debit', '520', true),
      ('5204', 'هزینه‌های عمومی و اداری', 'expense', 'detail', 'debit', '520', true),
      ('53', 'مالیات و عوارض خرید', 'expense', 'general', 'debit', '5', false),
      ('530', 'اعتبار مالیاتی خرید', 'expense', 'subsidiary', 'debit', '53', false),
      ('5301', 'مالیات و عوارض ارزش افزوده خرید', 'expense', 'detail', 'debit', '530', true),
      ('54', 'هزینه های مالی', 'expense', 'general', 'debit', '5', false),
      ('540', 'هزینه های مالی', 'expense', 'subsidiary', 'debit', '54', false),
      ('5401', 'کارمزد و بهره بانکی', 'expense', 'detail', 'debit', '540', true)
  )
  insert into public.chart_of_accounts (
    org_id, code, name, account_type, account_level, nature,
    is_leaf, is_system, is_active
  )
  select p_org_id, code, name, account_type, account_level, nature,
    is_leaf, true, true
  from seed
  on conflict (org_id, code) do nothing;

  -- فقط حساب‌های سیستمی به ساختار استاندارد متصل می‌شوند؛ حساب سفارشیِ Tenant
  -- با کد یکسان هرگز جابه‌جا یا بازنویسی نمی‌شود.
  with seed(code, parent_code) as (
    values
      ('1', null), ('11', '1'), ('110', '11'), ('1101', '110'), ('1102', '110'), ('1103', '110'),
      ('111', '11'), ('1111', '111'), ('1112', '111'), ('112', '11'), ('1121', '112'), ('1122', '112'),
      ('13', '1'), ('130', '13'), ('1301', '130'), ('14', '1'), ('140', '14'), ('1401', '140'),
      ('2', null), ('21', '2'), ('210', '21'), ('2101', '210'), ('2102', '210'), ('211', '21'), ('2111', '211'),
      ('212', '21'), ('2121', '212'), ('2122', '212'), ('2123', '212'), ('2124', '212'), ('22', '2'), ('220', '22'), ('2201', '220'),
      ('3', null), ('31', '3'), ('310', '31'), ('3101', '310'), ('320', '31'), ('3201', '320'),
      ('4', null), ('41', '4'), ('410', '41'), ('4101', '410'), ('4102', '410'), ('42', '4'), ('420', '42'), ('4201', '420'),
      ('5', null), ('51', '5'), ('510', '51'), ('5101', '510'), ('52', '5'), ('520', '52'),
      ('5201', '520'), ('5202', '520'), ('5203', '520'), ('5204', '520'), ('53', '5'), ('530', '53'), ('5301', '530'),
      ('54', '5'), ('540', '54'), ('5401', '540')
  )
  update public.chart_of_accounts account
  set parent_id = parent_account.id
  from seed
  left join public.chart_of_accounts parent_account
    on parent_account.org_id = p_org_id
   and parent_account.code = seed.parent_code
  where account.org_id = p_org_id
    and account.code = seed.code
    and account.is_system = true
    and account.parent_id is distinct from parent_account.id;

  -- هر حساب استانداردی که در این ساختار والد دارد، نباید برگ نهایی باشد.
  with seed(code, parent_code) as (
    values
      ('11', '1'), ('110', '11'), ('1101', '110'), ('1102', '110'), ('1103', '110'),
      ('111', '11'), ('1111', '111'), ('1112', '111'), ('112', '11'), ('1121', '112'), ('1122', '112'),
      ('13', '1'), ('130', '13'), ('1301', '130'), ('14', '1'), ('140', '14'), ('1401', '140'),
      ('21', '2'), ('210', '21'), ('2101', '210'), ('2102', '210'), ('211', '21'), ('2111', '211'),
      ('212', '21'), ('2121', '212'), ('2122', '212'), ('2123', '212'), ('2124', '212'), ('22', '2'), ('220', '22'), ('2201', '220'),
      ('31', '3'), ('310', '31'), ('3101', '310'), ('320', '31'), ('3201', '320'),
      ('41', '4'), ('410', '41'), ('4101', '410'), ('4102', '410'), ('42', '4'), ('420', '42'), ('4201', '420'),
      ('51', '5'), ('510', '51'), ('5101', '510'), ('52', '5'), ('520', '52'), ('5201', '520'), ('5202', '520'), ('5203', '520'), ('5204', '520'),
      ('53', '5'), ('530', '53'), ('5301', '530'), ('54', '5'), ('540', '54'), ('5401', '540')
  )
  update public.chart_of_accounts account
  set is_leaf = false
  where account.org_id = p_org_id
    and account.is_system = true
    and account.is_leaf = true
    and account.code in (select distinct parent_code from seed where parent_code is not null);
end;
$$;

revoke all on function public.seed_standard_chart_of_accounts(uuid) from public;

-- تمام Tenantهای موجود به‌صورت مستقل ترمیم می‌شوند.
select public.seed_standard_chart_of_accounts(organizations.id)
from public.organizations;

-- Tenantهای جدید نیز از همان ابتدا ساختار کامل و سلسله‌مراتبی را دریافت می‌کنند.
create or replace function public.seed_standard_chart_of_accounts_for_new_org()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.seed_standard_chart_of_accounts(new.id);
  return new;
end;
$$;

revoke all on function public.seed_standard_chart_of_accounts_for_new_org() from public;
drop trigger if exists trg_organizations_seed_standard_chart_of_accounts on public.organizations;
create trigger trg_organizations_seed_standard_chart_of_accounts
after insert on public.organizations
for each row
execute function public.seed_standard_chart_of_accounts_for_new_org();

