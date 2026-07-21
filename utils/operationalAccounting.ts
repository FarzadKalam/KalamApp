import type { SupabaseClient } from '@supabase/supabase-js';
import { SYSTEM_MODULE_SETTINGS_CONNECTION_TYPE } from '../pages/Settings/moduleSettingsTypes';
import { fetchSessionBootstrap } from './sessionCache';
import { generateNextJournalEntryNo } from './journalEntryNumbering';
import { parseOperationalPayments, resolvePaymentRowAccountId } from './operationalCashBankSources';

export type OperationalAccountingModule =
  | 'expense_documents'
  | 'employee_advances'
  | 'payroll_slips';

type AccountDefaults = Record<string, string | null>;
type JournalLine = {
  account_id: string;
  debit: number;
  credit: number;
  description: string;
};

type OperationalAccountingResult = {
  journalEntryId: string | null;
  created: boolean;
  warnings: string[];
};

const FINAL_STATUSES = new Set(['approved', 'paid', 'posted', 'settled']);
const PAYMENT_FINAL_STATUSES = new Set(['received', 'paid', 'approved', 'cleared', 'settled', 'completed']);

const ACCOUNT_KEYS = {
  expense: 'default_expense_account_id',
  payable: 'default_expense_payable_id',
  advance: 'default_employee_advance_id',
  payrollExpense: 'default_payroll_expense_id',
  payrollPayable: 'default_payroll_payable_id',
  payrollTax: 'default_payroll_tax_id',
  employeeInsurance: 'default_employee_insurance_payable_id',
  employerInsurance: 'default_employer_insurance_expense_id',
  cash: 'default_payment_cash_id',
  bank: 'default_payment_bank_id',
  chequePayable: 'default_cheques_payable_id',
  barterClearing: 'default_barter_clearing_id',
} as const;

const toNumber = (value: unknown) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

const normalize = (value: unknown) => String(value || '').trim().toLowerCase();

const getRecordAmount = (moduleId: OperationalAccountingModule, record: any) => {
  // تایید درخواست مساعده سند نمی‌سازد؛ فقط مبلغ پرداخت واقعی مبناست.
  if (moduleId === 'employee_advances') return toNumber(record?.paid_amount);
  if (moduleId === 'payroll_slips') return toNumber(record?.gross_amount) || toNumber(record?.net_amount);
  return toNumber(record?.total_amount);
};

const getRecordLabel = (record: any, fallback: string) => {
  const fallbackLabel = fallback && fallback !== record?.id ? fallback : '';
  return String(record?.system_code || record?.name || fallbackLabel).trim() || 'بدون عنوان';
};

const getEntryDate = (moduleId: OperationalAccountingModule, record: any) => {
  if (moduleId === 'expense_documents') return record.expense_date;
  if (moduleId === 'employee_advances') return record.request_date;
  return record.period_end;
};

const getAccrualEventKey = (moduleId: OperationalAccountingModule) => {
  if (moduleId === 'expense_documents') return 'expense_document_posted';
  if (moduleId === 'employee_advances') return 'employee_advance_paid';
  return 'payroll_slip_posted';
};

const getPaymentEventKey = (moduleId: OperationalAccountingModule) => `${getAccrualEventKey(moduleId)}_payment`;

const fetchAccountingDefaults = async (supabase: SupabaseClient): Promise<AccountDefaults> => {
  const session = await fetchSessionBootstrap(supabase);
  const orgId = String(session?.orgId || '').trim() || null;
  let query = supabase
    .from('integration_settings')
    .select('settings')
    .eq('connection_type', SYSTEM_MODULE_SETTINGS_CONNECTION_TYPE)
    .limit(1);
  query = orgId ? query.eq('org_id', orgId) : query.is('org_id', null);

  const { data, error } = await query.maybeSingle();
  if (error && String(error.code) !== 'PGRST116') throw error;

  const settings = data?.settings as any;
  const defaults = settings?.modules?.accounting?.defaults;
  const result: AccountDefaults = {};
  Object.values(ACCOUNT_KEYS).forEach((key) => {
    const value = String(defaults?.[key] || '').trim();
    result[key] = value || null;
  });

  const ids = Object.values(result).filter((value): value is string => Boolean(value));
  if (ids.length === 0) return result;
  const { data: accounts, error: accountError } = await supabase
    .from('chart_of_accounts')
    .select('id')
    .in('id', ids);
  if (accountError) throw accountError;
  const validIds = new Set((accounts || []).map((row: any) => String(row.id)));
  Object.keys(result).forEach((key) => {
    if (result[key] && !validIds.has(result[key] as string)) result[key] = null;
  });
  return result;
};

const findExistingEntry = async (
  supabase: SupabaseClient,
  moduleId: OperationalAccountingModule,
  recordId: string,
  eventKey: string,
) => {
  const { data, error } = await supabase
    .from('journal_entry_links')
    .select('journal_entry_id')
    .eq('source_table', moduleId)
    .eq('source_record_id', recordId)
    .eq('event_key', eventKey)
    .maybeSingle();
  if (error) throw error;
  return data?.journal_entry_id ? String(data.journal_entry_id) : null;
};

const resolveFiscalYear = async (supabase: SupabaseClient, entryDate: string) => {
  const { data, error } = await supabase
    .from('fiscal_years')
    .select('id,start_date,end_date,is_active,is_closed')
    .order('start_date', { ascending: false });
  if (error) throw error;
  const years = data || [];
  return years.find((year: any) => !year.is_closed && entryDate >= year.start_date && entryDate <= year.end_date)?.id
    || years.find((year: any) => year.is_active && !year.is_closed)?.id
    || null;
};

const addMissing = (warnings: string[], accountId: string | null, label: string) => {
  if (!accountId) warnings.push(`حساب «${label}» در تنظیمات حسابداری انتخاب نشده است.`);
};

const buildAccrualLines = (
  moduleId: OperationalAccountingModule,
  record: any,
  amount: number,
  defaults: AccountDefaults,
  label: string,
  warnings: string[],
): JournalLine[] => {
  if (moduleId === 'employee_advances') {
    const advance = defaults[ACCOUNT_KEYS.advance];
    const cashOrBank = defaults[ACCOUNT_KEYS.cash] || defaults[ACCOUNT_KEYS.bank];
    addMissing(warnings, advance, 'مساعده کارکنان');
    addMissing(warnings, cashOrBank, 'صندوق یا بانک پرداخت مساعده');
    if (!advance || !cashOrBank) return [];
    return [
      { account_id: advance, debit: amount, credit: 0, description: `ثبت مساعده کارکنان - ${label}` },
      { account_id: cashOrBank, debit: 0, credit: amount, description: `پرداخت مساعده کارکنان - ${label}` },
    ];
  }

  const expense = moduleId === 'payroll_slips'
    ? defaults[ACCOUNT_KEYS.payrollExpense]
    : defaults[ACCOUNT_KEYS.expense];
  const payable = moduleId === 'payroll_slips'
    ? defaults[ACCOUNT_KEYS.payrollPayable]
    : defaults[ACCOUNT_KEYS.payable];
  addMissing(warnings, expense, moduleId === 'payroll_slips' ? 'هزینه حقوق' : 'هزینه');
  addMissing(warnings, payable, moduleId === 'payroll_slips' ? 'حقوق پرداختنی' : 'پرداختنی هزینه');
  if (!expense || !payable) return [];

  const lines: JournalLine[] = [
    { account_id: expense, debit: amount, credit: 0, description: `ثبت ${moduleId === 'payroll_slips' ? 'هزینه حقوق' : 'هزینه'} - ${label}` },
    { account_id: payable, debit: 0, credit: moduleId === 'payroll_slips' ? (toNumber(record?.net_amount) || amount) : amount, description: `ثبت ${moduleId === 'payroll_slips' ? 'حقوق پرداختنی' : 'پرداختنی هزینه'} - ${label}` },
  ];

  if (moduleId === 'payroll_slips') {
    const tax = toNumber(record?.income_tax_amount) || toNumber(record?.tax_amount);
    const employeeInsurance = toNumber(record?.insurance_employee_amount);
    const employerInsurance = toNumber(record?.insurance_employer_amount);
    if (tax > 0) {
      const taxAccount = defaults[ACCOUNT_KEYS.payrollTax];
      addMissing(warnings, taxAccount, 'مالیات حقوق');
      if (taxAccount) lines.push({ account_id: taxAccount, debit: 0, credit: tax, description: `مالیات حقوق - ${label}` });
    }
    if (employeeInsurance > 0) {
      const insuranceAccount = defaults[ACCOUNT_KEYS.employeeInsurance];
      addMissing(warnings, insuranceAccount, 'بیمه سهم کارمند');
      if (insuranceAccount) lines.push({ account_id: insuranceAccount, debit: 0, credit: employeeInsurance, description: `بیمه سهم کارمند - ${label}` });
    }
    if (employerInsurance > 0) {
      const employerAccount = defaults[ACCOUNT_KEYS.employerInsurance];
      addMissing(warnings, employerAccount, 'هزینه بیمه سهم کارفرما');
      if (employerAccount) lines.push({ account_id: employerAccount, debit: employerInsurance, credit: 0, description: `هزینه بیمه سهم کارفرما - ${label}` });
    }
    if (toNumber(record?.advance_deduction_total) > 0) {
      const advanceAccount = defaults[ACCOUNT_KEYS.advance];
      addMissing(warnings, advanceAccount, 'مساعده کارکنان برای کسر از حقوق');
      if (advanceAccount) lines.push({ account_id: advanceAccount, debit: 0, credit: toNumber(record.advance_deduction_total), description: `کسر مساعده - ${label}` });
    }
  }
  return lines;
};

const buildPaymentLines = async (
  supabase: SupabaseClient,
  moduleId: OperationalAccountingModule,
  record: any,
  defaults: AccountDefaults,
  label: string,
  warnings: string[],
) => {
  if (moduleId === 'employee_advances') return [];
  const payments = parseOperationalPayments(record?.payments);
  const lines: JournalLine[] = [];
  for (const payment of payments) {
    const amount = toNumber(payment?.amount);
    if (amount <= 0 || !PAYMENT_FINAL_STATUSES.has(normalize(payment?.status))) continue;
    const sourceAccountId = resolvePaymentRowAccountId(payment, 'source_account');
    let ledgerAccountId: string | null = null;
    if (sourceAccountId) {
      const [bank, cash, petty] = await Promise.all([
        supabase.from('bank_accounts').select('account_id').eq('id', sourceAccountId).maybeSingle(),
        supabase.from('cash_boxes').select('account_id').eq('id', sourceAccountId).maybeSingle(),
        supabase.from('petty_funds').select('account_id').eq('id', sourceAccountId).maybeSingle(),
      ]);
      if (bank.error) throw bank.error;
      if (cash.error) throw cash.error;
      if (petty.error) throw petty.error;
      ledgerAccountId = String(bank.data?.account_id || cash.data?.account_id || petty.data?.account_id || '').trim() || null;
    }
    const isCheque = normalize(payment?.payment_type) === 'cheque' || Boolean(payment?.cheque_id || payment?.spent_cheque_id);
    if (!ledgerAccountId && isCheque) ledgerAccountId = defaults[ACCOUNT_KEYS.chequePayable];
    if (!ledgerAccountId) {
      ledgerAccountId = normalize(payment?.payment_type) === 'cash'
        ? defaults[ACCOUNT_KEYS.cash]
        : defaults[ACCOUNT_KEYS.bank];
    }
    addMissing(warnings, ledgerAccountId, isCheque ? 'اسناد پرداختنی' : 'حساب صندوق/بانک پرداخت');
    const payable = moduleId === 'payroll_slips' ? defaults[ACCOUNT_KEYS.payrollPayable] : defaults[ACCOUNT_KEYS.payable];
    addMissing(warnings, payable, moduleId === 'payroll_slips' ? 'حقوق پرداختنی' : 'پرداختنی');
    if (!ledgerAccountId || !payable) continue;
    lines.push(
      { account_id: payable, debit: amount, credit: 0, description: `تسویه پرداخت - ${label}` },
      { account_id: ledgerAccountId, debit: 0, credit: amount, description: `ثبت خروج وجه - ${label}` },
    );
  }
  return lines;
};

const insertDraftEntry = async (
  supabase: SupabaseClient,
  moduleId: OperationalAccountingModule,
  recordId: string,
  record: any,
  eventKey: string,
  lines: JournalLine[],
  warnings: string[],
  label: string,
): Promise<string> => {
  const entryDate = getEntryDate(moduleId, record) || new Date().toISOString().slice(0, 10);
  const fiscalYearId = await resolveFiscalYear(supabase, entryDate);
  const entryNo = await generateNextJournalEntryNo({ supabase: supabase as any, fiscalYearId });
  const metadata = {
    posting_mode: 'manual',
    posting_warnings: warnings,
    incomplete: warnings.length > 0 || lines.length === 0,
    source_event_key: eventKey,
  };
  const { data: entry, error: entryError } = await supabase.from('journal_entries').insert({
    entry_no: entryNo,
    entry_date: entryDate,
    fiscal_year_id: fiscalYearId,
    description: `پیش‌نویس سند دستی - ${label}`,
    status: 'draft',
    source_record_id: recordId,
    source_record_title: label,
    source_table: moduleId,
    source_module: moduleId,
    metadata,
  }).select('id').single();
  if (entryError) throw entryError;
  if (!entry?.id) throw new Error('ایجاد پیش‌نویس سند حسابداری ناموفق بود.');

  if (lines.length > 0) {
    const { error: lineError } = await supabase.from('journal_lines').insert(
      lines.map((line, index) => ({ ...line, entry_id: entry.id, line_no: index + 1 }))
    );
    if (lineError) throw lineError;
  }
  const { error: linkError } = await supabase.from('journal_entry_links').insert({
    event_key: eventKey,
    source_table: moduleId,
    source_record_id: recordId,
    journal_entry_id: entry.id,
  });
  if (linkError) throw linkError;
  return String(entry.id);
};

export const syncOperationalAccountingEntry = async (
  supabase: SupabaseClient,
  moduleId: OperationalAccountingModule,
  recordId: string,
): Promise<OperationalAccountingResult> => {
  if (!recordId) return { journalEntryId: null, created: false, warnings: ['شناسه رکورد معتبر نیست.'] };
  const { data: record, error } = await supabase.from(moduleId).select('*').eq('id', recordId).maybeSingle();
  if (error) throw error;
  if (!record) throw new Error('رکورد موردنظر یافت نشد.');
  if (!FINAL_STATUSES.has(normalize(record.status))) {
    throw new Error('برای صدور سند، وضعیت رکورد باید تایید، پرداخت، تسویه یا سند شده باشد.');
  }

  const defaults = await fetchAccountingDefaults(supabase);
  const label = getRecordLabel(record, recordId);
  const accrualEventKey = getAccrualEventKey(moduleId);
  const existingAccrualId = await findExistingEntry(supabase, moduleId, recordId, accrualEventKey);
  if (existingAccrualId) return { journalEntryId: existingAccrualId, created: false, warnings: [] };

  const warnings: string[] = [];
  const amount = getRecordAmount(moduleId, record);
  if (amount <= 0) warnings.push('مبلغ رکورد برای صدور سند معتبر نیست.');
  const accrualLines = amount > 0 ? buildAccrualLines(moduleId, record, amount, defaults, label, warnings) : [];
  // پرداخت‌ها یک رویداد مستقل هستند تا پرداخت نقدی/بانکی دوباره با سند فاکتور قاطی نشود.
  // عملیات نقد و بانک همچنان منبع عملیاتی است و این مسیر فقط سند دستی می‌سازد.
  const paymentLines = await buildPaymentLines(supabase, moduleId, record, defaults, label, warnings);
  const entryId = await insertDraftEntry(supabase, moduleId, recordId, record, accrualEventKey, accrualLines, warnings, label);
  if (paymentLines.length > 0) {
    const paymentEventKey = getPaymentEventKey(moduleId);
    const existingPaymentId = await findExistingEntry(supabase, moduleId, recordId, paymentEventKey);
    if (!existingPaymentId) {
      await insertDraftEntry(supabase, moduleId, recordId, record, paymentEventKey, paymentLines, warnings, `${label} - پرداخت‌ها`);
    }
  }
  return { journalEntryId: entryId, created: true, warnings };
};

export const isOperationalAccountingModule = (moduleId?: string | null): moduleId is OperationalAccountingModule =>
  moduleId === 'expense_documents' || moduleId === 'employee_advances' || moduleId === 'payroll_slips';
