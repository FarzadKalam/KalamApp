import type { SupabaseClient } from '@supabase/supabase-js';

export type OperationalAccountingModule =
  | 'expense_documents'
  | 'employee_advances'
  | 'payroll_slips';

const FINAL_STATUSES = new Set(['approved', 'paid', 'posted', 'settled']);

const toNumber = (value: unknown) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

const normalize = (value: unknown) => String(value || '').trim().toLowerCase();

const getRecordAmount = (moduleId: OperationalAccountingModule, record: any) => {
  if (moduleId === 'employee_advances') return toNumber(record?.paid_amount) || toNumber(record?.amount);
  if (moduleId === 'payroll_slips') return toNumber(record?.net_amount);
  return toNumber(record?.total_amount);
};

const getRecordLabel = (record: any, fallback: string) =>
  String(record?.system_code || record?.name || fallback || '').trim();

const eventKeyByModule: Record<OperationalAccountingModule, string> = {
  expense_documents: 'expense_document_posted',
  employee_advances: 'employee_advance_paid',
  payroll_slips: 'payroll_slip_posted',
};

const fetchFirstAccountId = async (
  supabase: SupabaseClient,
  accountType: string,
  keywords: string[] = [],
) => {
  const { data, error } = await supabase
    .from('chart_of_accounts')
    .select('id, name, code, account_type')
    .eq('account_type', accountType)
    .limit(100);
  if (error) throw error;
  const rows = data || [];
  const normalizedKeywords = keywords.map((item) => item.toLowerCase());
  const matched = normalizedKeywords.length
    ? rows.find((row: any) => {
        const haystack = `${row?.name || ''} ${row?.code || ''}`.toLowerCase();
        return normalizedKeywords.some((kw) => haystack.includes(kw));
      })
    : null;
  const picked = matched || rows[0];
  return picked?.id ? String(picked.id) : null;
};

const findExistingEntry = async (
  supabase: SupabaseClient,
  moduleId: OperationalAccountingModule,
  recordId: string,
) => {
  const { data, error } = await supabase
    .from('journal_entry_links')
    .select('journal_entry_id')
    .eq('source_table', moduleId)
    .eq('source_record_id', recordId)
    .eq('event_key', eventKeyByModule[moduleId])
    .maybeSingle();
  if (error) throw error;
  return data?.journal_entry_id ? String(data.journal_entry_id) : null;
};

const buildLines = async (
  supabase: SupabaseClient,
  moduleId: OperationalAccountingModule,
  amount: number,
  label: string,
) => {
  if (moduleId === 'expense_documents') {
    const debitAccountId = await fetchFirstAccountId(supabase, 'expense', ['هزینه', 'expense']);
    const creditAccountId = await fetchFirstAccountId(supabase, 'liability', ['پرداختنی', 'payable']);
    if (!debitAccountId || !creditAccountId) throw new Error('حساب هزینه یا حساب پرداختنی تعریف نشده است.');
    return [
      { account_id: debitAccountId, debit: amount, credit: 0, description: `ثبت هزینه - ${label}` },
      { account_id: creditAccountId, debit: 0, credit: amount, description: `ثبت پرداختنی هزینه - ${label}` },
    ];
  }

  if (moduleId === 'employee_advances') {
    const debitAccountId = await fetchFirstAccountId(supabase, 'asset', ['مساعده', 'advance', 'دریافتنی']);
    const creditAccountId = await fetchFirstAccountId(supabase, 'asset', ['بانک', 'bank', 'صندوق', 'cash']);
    if (!debitAccountId || !creditAccountId) throw new Error('حساب مساعده یا حساب پرداخت تعریف نشده است.');
    return [
      { account_id: debitAccountId, debit: amount, credit: 0, description: `ثبت مساعده کارکنان - ${label}` },
      { account_id: creditAccountId, debit: 0, credit: amount, description: `پرداخت مساعده - ${label}` },
    ];
  }

  const debitAccountId = await fetchFirstAccountId(supabase, 'expense', ['حقوق', 'دستمزد', 'salary', 'payroll']);
  const creditAccountId = await fetchFirstAccountId(supabase, 'liability', ['حقوق پرداختنی', 'پرداختنی', 'payable']);
  if (!debitAccountId || !creditAccountId) throw new Error('حساب هزینه حقوق یا حقوق پرداختنی تعریف نشده است.');
  return [
    { account_id: debitAccountId, debit: amount, credit: 0, description: `ثبت هزینه حقوق - ${label}` },
    { account_id: creditAccountId, debit: 0, credit: amount, description: `ثبت حقوق پرداختنی - ${label}` },
  ];
};

export const syncOperationalAccountingEntry = async (
  supabase: SupabaseClient,
  moduleId: OperationalAccountingModule,
  recordId: string,
) => {
  if (!recordId) return { journalEntryId: null as string | null, created: false };
  const { data: record, error } = await supabase.from(moduleId).select('*').eq('id', recordId).maybeSingle();
  if (error) throw error;
  if (!record) throw new Error('رکورد موردنظر یافت نشد.');
  if (!FINAL_STATUSES.has(normalize(record.status))) {
    throw new Error('برای صدور سند، وضعیت رکورد باید تایید، پرداخت، تسویه یا سند شده باشد.');
  }

  const existingId = await findExistingEntry(supabase, moduleId, recordId);
  if (existingId) return { journalEntryId: existingId, created: false };

  const amount = getRecordAmount(moduleId, record);
  if (amount <= 0) throw new Error('مبلغ رکورد برای صدور سند معتبر نیست.');
  const label = getRecordLabel(record, recordId);
  const lines = await buildLines(supabase, moduleId, amount, label);

  const { data: journalEntry, error: journalError } = await supabase
    .from('journal_entries')
    .insert({
      entry_date: record.expense_date || record.request_date || record.period_end || new Date().toISOString().slice(0, 10),
      description: `صدور خودکار سند - ${label}`,
      status: 'draft',
      source_record_id: recordId,
      source_record_title: label,
      source_table: moduleId,
      source_module: moduleId,
    })
    .select('id')
    .single();
  if (journalError) throw journalError;
  if (!journalEntry?.id) throw new Error('ایجاد سند حسابداری ناموفق بود.');

  const { error: linesError } = await supabase.from('journal_lines').insert(
    lines.map((line, index) => ({
      ...line,
      line_no: index + 1,
      entry_id: journalEntry.id,
    }))
  );
  if (linesError) {
    await supabase.from('journal_entries').delete().eq('id', journalEntry.id);
    throw linesError;
  }

  const { error: linkError } = await supabase.from('journal_entry_links').insert({
    event_key: eventKeyByModule[moduleId],
    source_table: moduleId,
    source_record_id: recordId,
    journal_entry_id: journalEntry.id,
  });
  if (linkError) throw linkError;

  return { journalEntryId: String(journalEntry.id), created: true };
};

export const isOperationalAccountingModule = (moduleId?: string | null): moduleId is OperationalAccountingModule =>
  moduleId === 'expense_documents' || moduleId === 'employee_advances' || moduleId === 'payroll_slips';
