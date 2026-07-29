import type { SupabaseClient } from '@supabase/supabase-js';
import { SYSTEM_MODULE_SETTINGS_CONNECTION_TYPE } from '../pages/Settings/moduleSettingsTypes';
import { fetchSessionBootstrap } from './sessionCache';
import { generateNextJournalEntryNo } from './journalEntryNumbering';

export type TreasuryAccountingModule = 'cash_bank_operations' | 'cheques' | 'barters' | 'bank_accounts' | 'cash_boxes' | 'petty_funds' | 'customers' | 'suppliers' | 'employees';

type Result = { journalEntryId: string | null; created: boolean; warnings: string[] };

const n = (value: unknown) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};
const text = (value: unknown) => String(value || '').trim();

const loadDefaults = async (supabase: SupabaseClient) => {
  const session = await fetchSessionBootstrap(supabase);
  const orgId = text(session?.orgId) || null;
  let query = supabase.from('integration_settings').select('settings').eq('connection_type', SYSTEM_MODULE_SETTINGS_CONNECTION_TYPE).limit(1);
  query = orgId ? query.eq('org_id', orgId) : query.is('org_id', null);
  const { data, error } = await query.maybeSingle();
  if (error && String(error.code) !== 'PGRST116') throw error;
  const defaults = (data?.settings as any)?.modules?.accounting?.defaults || {};
  const keys = [
    'default_accounts_receivable_id', 'default_accounts_payable_id', 'default_payment_cash_id',
    'default_payment_bank_id', 'default_cheques_receivable_id', 'default_cheques_payable_id',
    'default_barter_clearing_id', 'default_expense_account_id', 'default_payroll_payable_id',
  ];
  const result: Record<string, string | null> = {};
  keys.forEach((key) => { result[key] = text(defaults[key]) || null; });
  const ids = Object.values(result).filter((id): id is string => Boolean(id));
  if (ids.length === 0) return result;
  const { data: valid, error: validError } = await supabase.from('chart_of_accounts').select('id').in('id', ids);
  if (validError) throw validError;
  const validIds = new Set((valid || []).map((row: any) => text(row.id)));
  Object.keys(result).forEach((key) => { if (result[key] && !validIds.has(result[key] as string)) result[key] = null; });
  return result;
};

const ledgerAccountForTreasury = async (supabase: SupabaseClient, accountId: string | null) => {
  if (!accountId) return null;
  const [bank, cash, petty] = await Promise.all([
    supabase.from('bank_accounts').select('account_id').eq('id', accountId).maybeSingle(),
    supabase.from('cash_boxes').select('account_id').eq('id', accountId).maybeSingle(),
    supabase.from('petty_funds').select('account_id').eq('id', accountId).maybeSingle(),
  ]);
  if (bank.error) throw bank.error;
  if (cash.error) throw cash.error;
  if (petty.error) throw petty.error;
  return text(bank.data?.account_id || cash.data?.account_id || petty.data?.account_id) || null;
};

const existing = async (supabase: SupabaseClient, moduleId: TreasuryAccountingModule, id: string, eventKey: string) => {
  const { data, error } = await supabase.from('journal_entry_links').select('journal_entry_id').eq('source_table', moduleId).eq('source_record_id', id).eq('event_key', eventKey).maybeSingle();
  if (error) throw error;
  return text(data?.journal_entry_id) || null;
};

const getSource = (record: any, moduleId: TreasuryAccountingModule) => {
  if (moduleId === 'cash_bank_operations') return { date: record.operation_date, label: record.description || 'بدون عنوان' };
  if (moduleId === 'cheques') return { date: record.due_date || record.issue_date, label: record.serial_no || record.sayad_id || 'بدون عنوان' };
  if (moduleId === 'bank_accounts') return { date: record.created_at, label: record.bank_name || record.account_number || 'حساب بانکی' };
  if (moduleId === 'cash_boxes') return { date: record.created_at, label: record.name || record.code || 'صندوق' };
  if (moduleId === 'petty_funds') return { date: record.created_at, label: record.name || record.code || 'تنخواه' };
  if (moduleId === 'customers' || moduleId === 'suppliers' || moduleId === 'employees') return { date: record.created_at, label: record.full_name || record.business_name || `${record.first_name || ''} ${record.last_name || ''}`.trim() || record.system_code || 'طرف حساب' };
  return { date: record.barter_date, label: record.name || record.system_code || 'بدون عنوان' };
};

const missing = (warnings: string[], account: string | null, label: string) => {
  if (!account) warnings.push(`حساب «${label}» در تنظیمات حسابداری انتخاب نشده است.`);
};

const buildLines = async (supabase: SupabaseClient, moduleId: TreasuryAccountingModule, record: any, defaults: Record<string, string | null>, warnings: string[]) => {
  if (moduleId === 'customers' || moduleId === 'suppliers' || moduleId === 'employees') {
    const openingBalance = n(record.previous_system_balance_total);
    const counterpartyAccount = moduleId === 'customers'
      ? defaults.default_accounts_receivable_id
      : moduleId === 'suppliers'
        ? defaults.default_accounts_payable_id
        : defaults.default_payroll_payable_id;
    if (openingBalance === 0) {
      warnings.push('برای این طرف حساب، مانده اول دوره‌ای برای صدور سند ثبت نشده است.');
      return [];
    }
    missing(warnings, counterpartyAccount, moduleId === 'customers' ? 'حساب دریافتنی مشتری' : moduleId === 'suppliers' ? 'حساب پرداختنی تأمین‌کننده' : 'حساب پرداختنی کارمند');
    if (!counterpartyAccount) return [];
    const isDebit = moduleId === 'customers' ? openingBalance > 0 : openingBalance < 0;
    warnings.push('طرف مقابل مانده اول دوره را در پیش‌نویس سند انتخاب و تکمیل کنید.');
    return [{
      account_id: counterpartyAccount,
      debit: isDebit ? Math.abs(openingBalance) : 0,
      credit: isDebit ? 0 : Math.abs(openingBalance),
      description: `مانده اول دوره - ${getSource(record, moduleId).label}`,
    }];
  }

  if (moduleId === 'bank_accounts' || moduleId === 'cash_boxes' || moduleId === 'petty_funds') {
    const openingBalance = n(record.opening_balance);
    const treasuryAccount = text(record.account_id) || null;
    if (openingBalance === 0) {
      warnings.push('برای این حساب، مانده اول دوره‌ای برای صدور سند ثبت نشده است.');
      return [];
    }
    missing(warnings, treasuryAccount, 'حساب متناظر خزانه');
    if (!treasuryAccount) return [];
    warnings.push('طرف مقابل مانده اول دوره را در پیش‌نویس سند انتخاب و تکمیل کنید.');
    return [{
      account_id: treasuryAccount,
      debit: openingBalance > 0 ? Math.abs(openingBalance) : 0,
      credit: openingBalance < 0 ? Math.abs(openingBalance) : 0,
      description: `مانده اول دوره - ${getSource(record, moduleId).label}`,
    }];
  }

  const amount = n(record.amount || record.initial_amount);
  if (amount <= 0) {
    warnings.push('مبلغ عملیات برای صدور سند معتبر نیست.');
    return [];
  }
  if (moduleId === 'cheques') {
    const received = text(record.cheque_type) === 'received';
    const chequeAccount = defaults[received ? 'default_cheques_receivable_id' : 'default_cheques_payable_id'];
    const partyAccount = defaults[received ? 'default_accounts_receivable_id' : 'default_accounts_payable_id'];
    missing(warnings, chequeAccount, received ? 'اسناد دریافتنی' : 'اسناد پرداختنی');
    missing(warnings, partyAccount, received ? 'دریافتنی مشتری' : 'پرداختنی تامین‌کننده');
    if (!chequeAccount || !partyAccount) return [];
    return received
      ? [{ account_id: chequeAccount, debit: amount, credit: 0, description: `ثبت چک دریافتی - ${getSource(record, moduleId).label}` }, { account_id: partyAccount, debit: 0, credit: amount, description: 'ثبت طلب طرف حساب بابت چک' }]
      : [{ account_id: partyAccount, debit: amount, credit: 0, description: 'تسویه بدهی با چک پرداختی' }, { account_id: chequeAccount, debit: 0, credit: amount, description: `ثبت چک پرداختی - ${getSource(record, moduleId).label}` }];
  }
  if (moduleId === 'barters') {
    const clearing = defaults.default_barter_clearing_id;
    const party = text(record.barter_type) === 'incoming' ? defaults.default_accounts_receivable_id : defaults.default_accounts_payable_id;
    missing(warnings, clearing, 'حساب واسط تهاتر');
    missing(warnings, party, text(record.barter_type) === 'incoming' ? 'دریافتنی طرف تهاتر' : 'پرداختنی طرف تهاتر');
    if (!clearing || !party) return [];
    return text(record.barter_type) === 'incoming'
      ? [{ account_id: clearing, debit: amount, credit: 0, description: `ثبت تهاتر دریافتی - ${getSource(record, moduleId).label}` }, { account_id: party, debit: 0, credit: amount, description: 'تسویه طرف حساب با تهاتر' }]
      : [{ account_id: party, debit: amount, credit: 0, description: 'تسویه طرف حساب با تهاتر' }, { account_id: clearing, debit: 0, credit: amount, description: `ثبت تهاتر پرداختی - ${getSource(record, moduleId).label}` }];
  }

  const operationType = text(record.operation_type);
  const paymentType = text(record.payment_type);
  if (operationType === 'transfer') {
    const sourceId = text(record.payment_account_id || record.payment_bank_account_id || record.payment_cash_box_id || record.payment_petty_fund_id) || null;
    const destinationId = text(record.receipt_account_id || record.receipt_bank_account_id || record.receipt_cash_box_id || record.receipt_petty_fund_id) || null;
    const sourceAccount = await ledgerAccountForTreasury(supabase, sourceId);
    const destinationAccount = await ledgerAccountForTreasury(supabase, destinationId);
    missing(warnings, sourceAccount, 'حساب مبدأ انتقال');
    missing(warnings, destinationAccount, 'حساب مقصد انتقال');
    if (!sourceAccount || !destinationAccount) return [];
    return [
      { account_id: destinationAccount, debit: amount, credit: 0, description: 'انتقال به حساب مقصد' },
      { account_id: sourceAccount, debit: 0, credit: amount, description: 'انتقال از حساب مبدأ' },
    ];
  }
  const isReceipt = operationType === 'receipt';
  const isCheque = paymentType === 'cheque' || Boolean(record.cheque_id);
  const treasurySourceId = isReceipt
    ? text(record.receipt_account_id || record.receipt_bank_account_id || record.receipt_cash_box_id || record.receipt_petty_fund_id || record.bank_account_id || record.cash_box_id || record.petty_fund_id) || null
    : text(record.payment_account_id || record.payment_bank_account_id || record.payment_cash_box_id || record.payment_petty_fund_id || record.bank_account_id || record.cash_box_id || record.petty_fund_id) || null;
  const treasuryAccount = isCheque
    ? defaults[isReceipt ? 'default_cheques_receivable_id' : 'default_cheques_payable_id']
    : await ledgerAccountForTreasury(supabase, treasurySourceId) || defaults[isReceipt ? 'default_payment_cash_id' : 'default_payment_bank_id'];
  const counterparty = record.sales_invoice_id
    ? defaults.default_accounts_receivable_id
    : record.purchase_invoice_id
      ? defaults.default_accounts_payable_id
      : record.payroll_slip_id
        ? defaults.default_payroll_payable_id
        : record.expense_document_id
          ? defaults.default_expense_payable_id
          : record.barter_id
            ? defaults.default_barter_clearing_id
            : null;
  missing(warnings, treasuryAccount, isCheque ? (isReceipt ? 'اسناد دریافتنی' : 'اسناد پرداختنی') : 'حساب صندوق/بانک');
  missing(warnings, counterparty, 'حساب طرف عملیات');
  if (!treasuryAccount) return [];
  const lines: any[] = !counterparty ? [] : (isReceipt
    ? [{ account_id: treasuryAccount, debit: amount, credit: 0, description: 'دریافت در خزانه' }, { account_id: counterparty, debit: 0, credit: amount, description: 'تسویه طرف حساب' }]
    : [{ account_id: counterparty, debit: amount, credit: 0, description: 'تسویه طرف حساب' }, { account_id: treasuryAccount, debit: 0, credit: amount, description: 'پرداخت از خزانه' }]);
  const transferFee = !isReceipt ? Math.max(0, n(record.transfer_fee)) : 0;
  if (transferFee > 0) {
    const expenseAccount = defaults.default_expense_account_id;
    missing(warnings, expenseAccount, 'هزینه پیش‌فرض برای کارمزد انتقال');
    if (expenseAccount) {
      lines.push(
        { account_id: expenseAccount, debit: transferFee, credit: 0, description: 'هزینه کارمزد انتقال' },
        { account_id: treasuryAccount, debit: 0, credit: transferFee, description: 'پرداخت کارمزد انتقال' },
      );
    }
  }
  return lines;
};

export const syncTreasuryAccountingEntry = async (
  supabase: SupabaseClient,
  moduleId: TreasuryAccountingModule,
  recordId: string,
): Promise<Result> => {
  const eventKey = `${moduleId}_manual_posted`;
  const oldId = await existing(supabase, moduleId, recordId, eventKey);
  if (oldId) return { journalEntryId: oldId, created: false, warnings: [] };
  const { data: record, error } = await supabase.from(moduleId).select('*').eq('id', recordId).maybeSingle();
  if (error) throw error;
  if (!record) throw new Error('رکورد موردنظر یافت نشد.');
  const defaults = await loadDefaults(supabase);
  const warnings: string[] = [];
  const lines = await buildLines(supabase, moduleId, record, defaults, warnings);
  const source = getSource(record, moduleId);
  const entryDate = source.date || new Date().toISOString().slice(0, 10);
  const { data: years, error: yearError } = await supabase.from('fiscal_years').select('id,start_date,end_date,is_active,is_closed').order('start_date', { ascending: false });
  if (yearError) throw yearError;
  const fiscalYearId = (years || []).find((year: any) => !year.is_closed && entryDate >= year.start_date && entryDate <= year.end_date)?.id || (years || []).find((year: any) => year.is_active && !year.is_closed)?.id || null;
  const entryNo = await generateNextJournalEntryNo({ supabase: supabase as any, fiscalYearId });
  const { data: entry, error: entryError } = await supabase.from('journal_entries').insert({
    entry_no: entryNo, entry_date: entryDate, fiscal_year_id: fiscalYearId, description: `پیش‌نویس سند دستی - ${source.label}`,
    status: 'draft', source_module: moduleId, source_table: moduleId, source_record_id: recordId, source_record_title: source.label,
    metadata: { posting_mode: 'manual', posting_warnings: warnings, incomplete: warnings.length > 0 || lines.length === 0, source_event_key: eventKey },
  }).select('id').single();
  if (entryError) throw entryError;
  if (lines.length > 0) {
    const { error: lineError } = await supabase.from('journal_lines').insert(lines.map((line, index) => ({ ...line, entry_id: entry.id, line_no: index + 1 })));
    if (lineError) throw lineError;
  }
  const { error: linkError } = await supabase.from('journal_entry_links').insert({ event_key: eventKey, source_table: moduleId, source_record_id: recordId, journal_entry_id: entry.id });
  if (linkError) throw linkError;
  return { journalEntryId: String(entry.id), created: true, warnings };
};

export const isTreasuryAccountingModule = (moduleId?: string | null): moduleId is TreasuryAccountingModule =>
  moduleId === 'cash_bank_operations' || moduleId === 'cheques' || moduleId === 'barters'
  || moduleId === 'bank_accounts' || moduleId === 'cash_boxes' || moduleId === 'petty_funds'
  || moduleId === 'customers' || moduleId === 'suppliers' || moduleId === 'employees';
