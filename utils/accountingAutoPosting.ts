import type { SupabaseClient } from '@supabase/supabase-js';

type SupportedInvoiceModule = 'invoices' | 'purchase_invoices';

type InvoiceAccountingSyncParams = {
  supabase: SupabaseClient;
  moduleId: SupportedInvoiceModule;
  recordId: string;
  recordData?: Record<string, any> | null;
  includePayments?: boolean;
};

type AccountingEventRule = {
  event_key: string;
  debit_account_id: string | null;
  credit_account_id: string | null;
  vat_account_id: string | null;
  receivable_account_id: string | null;
  payable_account_id: string | null;
  is_active: boolean;
};

type JournalLineDraft = {
  account_id: string;
  debit: number;
  credit: number;
  description?: string | null;
  party_type?: string | null;
  party_id?: string | null;
};

type InvoiceSnapshot = {
  id: string;
  status: string | null;
  invoice_date: string | null;
  system_code: string | null;
  name: string | null;
  customer_id: string | null;
  supplier_id: string | null;
  total_invoice_amount: number;
  total_received_amount: number;
  invoiceItems: any[];
  payments: any[];
};

export type InvoiceAccountingSyncResult = {
  createdEventKeys: string[];
  skippedEventKeys: string[];
  errors: string[];
};

const FINAL_STATUSES = new Set(['final', 'settled', 'completed']);
const PAYMENT_READY_STATUSES = new Set(['settled', 'completed']);

const toNumber = (value: any): number => {
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const normalizeStatus = (value: any) => String(value || '').trim().toLowerCase();

const almostEqual = (a: number, b: number) => Math.abs(a - b) <= 0.01;

const toSafeArray = (value: any) => (Array.isArray(value) ? value : []);

const parseInvoiceBreakdown = (invoiceItems: any[], totalInvoiceAmount: number) => {
  let netAmount = 0;
  let vatAmount = 0;

  for (const row of toSafeArray(invoiceItems)) {
    const qty = Math.abs(toNumber(row?.quantity ?? row?.qty ?? row?.count));
    const unitPrice = Math.abs(toNumber(row?.unit_price ?? row?.price));
    const base = qty * unitPrice;

    const discountRaw = Math.abs(toNumber(row?.discount));
    const discountType = String(row?.discount_type || 'amount');
    const discountAmount = discountType === 'percent' ? base * (discountRaw / 100) : discountRaw;

    const afterDiscount = Math.max(0, base - discountAmount);

    const vatRaw = Math.abs(toNumber(row?.vat));
    const vatType = String(row?.vat_type || 'percent');
    const vatRowAmount = vatType === 'percent' ? afterDiscount * (vatRaw / 100) : vatRaw;

    netAmount += afterDiscount;
    vatAmount += Math.max(0, vatRowAmount);
  }

  const computedGross = netAmount + vatAmount;
  const grossAmount = totalInvoiceAmount > 0 ? totalInvoiceAmount : computedGross;

  if (grossAmount <= 0) {
    return { grossAmount: 0, netAmount: 0, vatAmount: 0 };
  }

  if (computedGross <= 0) {
    return { grossAmount, netAmount: grossAmount, vatAmount: 0 };
  }

  if (almostEqual(computedGross, grossAmount)) {
    return { grossAmount, netAmount, vatAmount };
  }

  const adjustedNet = Math.max(0, grossAmount - vatAmount);
  return { grossAmount, netAmount: adjustedNet, vatAmount };
};

const sumReceivedPayments = (payments: any[]) => {
  return toSafeArray(payments).reduce((sum, row) => {
    if (normalizeStatus(row?.status) !== 'received') return sum;
    return sum + Math.abs(toNumber(row?.amount));
  }, 0);
};

const buildSnapshotFromRecord = (row: Record<string, any>): InvoiceSnapshot => {
  return {
    id: String(row?.id || ''),
    status: row?.status ? String(row.status) : null,
    invoice_date: row?.invoice_date ? String(row.invoice_date) : null,
    system_code: row?.system_code ? String(row.system_code) : null,
    name: row?.name ? String(row.name) : null,
    customer_id: row?.customer_id ? String(row.customer_id) : null,
    supplier_id: row?.supplier_id ? String(row.supplier_id) : null,
    total_invoice_amount: toNumber(row?.total_invoice_amount),
    total_received_amount: toNumber(row?.total_received_amount),
    invoiceItems: toSafeArray(row?.invoiceItems),
    payments: toSafeArray(row?.payments),
  };
};

const fetchInvoiceSnapshot = async (
  supabase: SupabaseClient,
  moduleId: SupportedInvoiceModule,
  recordId: string
): Promise<InvoiceSnapshot> => {
  const { data, error } = await supabase
    .from(moduleId)
    .select(
      'id,status,invoice_date,system_code,name,customer_id,supplier_id,total_invoice_amount,total_received_amount,"invoiceItems",payments'
    )
    .eq('id', recordId)
    .single();

  if (error) throw error;
  return buildSnapshotFromRecord(data || {});
};

const fetchRule = async (
  supabase: SupabaseClient,
  eventKey: string
): Promise<AccountingEventRule | null> => {
  const { data, error } = await supabase
    .from('accounting_event_rules')
    .select(
      'event_key,debit_account_id,credit_account_id,vat_account_id,receivable_account_id,payable_account_id,is_active'
    )
    .eq('event_key', eventKey)
    .eq('is_active', true)
    .maybeSingle();

  if (error) throw error;
  return (data || null) as AccountingEventRule | null;
};

const resolveFiscalYearId = async (
  supabase: SupabaseClient,
  entryDate: string | null
): Promise<string | null> => {
  const { data, error } = await supabase
    .from('fiscal_years')
    .select('id,start_date,end_date,is_active,is_closed')
    .eq('is_closed', false)
    .order('is_active', { ascending: false })
    .order('start_date', { ascending: false });

  if (error) throw error;
  const rows = (data || []) as Array<{
    id: string;
    start_date: string;
    end_date: string;
    is_active: boolean;
  }>;

  if (rows.length === 0) return null;

  if (entryDate) {
    const inRange = rows.find((row) => row.start_date <= entryDate && row.end_date >= entryDate);
    if (inRange) return inRange.id;
  }

  const active = rows.find((row) => row.is_active);
  if (active) return active.id;

  return rows[0]?.id || null;
};

const validateLines = (rawLines: JournalLineDraft[]) => {
  const lines = rawLines
    .map((line) => ({
      ...line,
      debit: Math.max(0, toNumber(line.debit)),
      credit: Math.max(0, toNumber(line.credit)),
      account_id: String(line.account_id || '').trim(),
      description: line.description ? String(line.description) : null,
      party_type: line.party_type ? String(line.party_type) : null,
      party_id: line.party_id ? String(line.party_id) : null,
    }))
    .filter((line) => line.account_id && (line.debit > 0 || line.credit > 0));

  const totalDebit = lines.reduce((sum, line) => sum + line.debit, 0);
  const totalCredit = lines.reduce((sum, line) => sum + line.credit, 0);
  const balanced = totalDebit > 0 && totalCredit > 0 && almostEqual(totalDebit, totalCredit);

  return { lines, totalDebit, totalCredit, balanced };
};

const createPostedJournalEntry = async ({
  supabase,
  eventKey,
  sourceTable,
  sourceModule,
  sourceRecordId,
  entryDate,
  fiscalYearId,
  description,
  lines,
}: {
  supabase: SupabaseClient;
  eventKey: string;
  sourceTable: string;
  sourceModule: string;
  sourceRecordId: string;
  entryDate: string;
  fiscalYearId: string | null;
  description: string;
  lines: JournalLineDraft[];
}): Promise<{ created: boolean; reason?: string }> => {
  const { lines: safeLines, balanced } = validateLines(lines);
  if (!balanced || safeLines.length === 0) {
    return { created: false, reason: 'invalid_lines' };
  }

  const { data: existingLink, error: linkReadError } = await supabase
    .from('journal_entry_links')
    .select('id')
    .eq('event_key', eventKey)
    .eq('source_table', sourceTable)
    .eq('source_record_id', sourceRecordId)
    .maybeSingle();
  if (linkReadError) throw linkReadError;
  if (existingLink?.id) return { created: false, reason: 'already_linked' };

  const { data: insertedEntry, error: entryError } = await supabase
    .from('journal_entries')
    .insert({
      fiscal_year_id: fiscalYearId,
      entry_date: entryDate,
      description,
      status: 'draft',
      source_module: sourceModule,
      source_table: sourceTable,
      source_record_id: sourceRecordId,
    })
    .select('id')
    .single();
  if (entryError) throw entryError;

  const entryId = String(insertedEntry?.id || '');
  if (!entryId) throw new Error('Journal entry was not created.');

  const linePayload = safeLines.map((line, index) => ({
    entry_id: entryId,
    line_no: index + 1,
    account_id: line.account_id,
    description: line.description || null,
    debit: line.debit,
    credit: line.credit,
    party_type: line.party_type || null,
    party_id: line.party_id || null,
  }));

  const { error: linesError } = await supabase.from('journal_lines').insert(linePayload);
  if (linesError) {
    await supabase.from('journal_entries').delete().eq('id', entryId);
    throw linesError;
  }

  const { error: linkInsertError } = await supabase.from('journal_entry_links').insert({
    event_key: eventKey,
    source_table: sourceTable,
    source_record_id: sourceRecordId,
    journal_entry_id: entryId,
  });
  if (linkInsertError) {
    if ((linkInsertError as any)?.code === '23505') {
      await supabase.from('journal_entries').delete().eq('id', entryId);
      return { created: false, reason: 'already_linked' };
    }
    await supabase.from('journal_entries').delete().eq('id', entryId);
    throw linkInsertError;
  }

  const { error: postError } = await supabase
    .from('journal_entries')
    .update({ status: 'posted' })
    .eq('id', entryId);
  if (postError) {
    await supabase.from('journal_entry_links').delete().eq('journal_entry_id', entryId);
    await supabase.from('journal_entries').delete().eq('id', entryId);
    throw postError;
  }

  return { created: true };
};

const buildSalesInvoiceLines = (
  snapshot: InvoiceSnapshot,
  rule: AccountingEventRule
): JournalLineDraft[] => {
  const receivableAccount = rule.receivable_account_id || rule.debit_account_id;
  const incomeAccount = rule.credit_account_id;
  if (!receivableAccount || !incomeAccount) return [];

  const breakdown = parseInvoiceBreakdown(snapshot.invoiceItems, snapshot.total_invoice_amount);
  const gross = breakdown.grossAmount;
  const vat = Math.max(0, breakdown.vatAmount);
  if (gross <= 0) return [];

  const hasVatLine = vat > 0 && !!rule.vat_account_id;
  const incomeCredit = hasVatLine ? Math.max(0, gross - vat) : gross;

  const lines: JournalLineDraft[] = [
    {
      account_id: receivableAccount,
      debit: gross,
      credit: 0,
      party_type: 'customer',
      party_id: snapshot.customer_id,
      description: 'حساب دریافتنی مشتری',
    },
    {
      account_id: incomeAccount,
      debit: 0,
      credit: incomeCredit,
      description: 'درآمد فروش',
    },
  ];

  if (hasVatLine && rule.vat_account_id) {
    lines.push({
      account_id: rule.vat_account_id,
      debit: 0,
      credit: vat,
      description: 'مالیات و عوارض فروش',
    });
  }

  return lines;
};

const buildPurchaseInvoiceLines = (
  snapshot: InvoiceSnapshot,
  rule: AccountingEventRule
): JournalLineDraft[] => {
  const purchaseAccount = rule.debit_account_id;
  const payableAccount = rule.payable_account_id || rule.credit_account_id;
  if (!purchaseAccount || !payableAccount) return [];

  const breakdown = parseInvoiceBreakdown(snapshot.invoiceItems, snapshot.total_invoice_amount);
  const gross = breakdown.grossAmount;
  const vat = Math.max(0, breakdown.vatAmount);
  if (gross <= 0) return [];

  const hasVatLine = vat > 0 && !!rule.vat_account_id;
  const purchaseDebit = hasVatLine ? Math.max(0, gross - vat) : gross;

  const lines: JournalLineDraft[] = [
    {
      account_id: purchaseAccount,
      debit: purchaseDebit,
      credit: 0,
      description: 'ثبت خرید/موجودی',
    },
  ];

  if (hasVatLine && rule.vat_account_id) {
    lines.push({
      account_id: rule.vat_account_id,
      debit: vat,
      credit: 0,
      description: 'اعتبار مالیاتی خرید',
    });
  }

  lines.push({
    account_id: payableAccount,
    debit: 0,
    credit: gross,
    party_type: 'supplier',
    party_id: snapshot.supplier_id,
    description: 'حساب پرداختنی تامین کننده',
  });

  return lines;
};

const buildSalesPaymentLines = (
  snapshot: InvoiceSnapshot,
  rule: AccountingEventRule
): JournalLineDraft[] => {
  const cashAccount = rule.debit_account_id;
  const receivableAccount = rule.receivable_account_id;
  if (!cashAccount || !receivableAccount) return [];

  const paymentFromRows = sumReceivedPayments(snapshot.payments);
  const amount = Math.max(snapshot.total_received_amount, paymentFromRows);
  if (amount <= 0) return [];

  return [
    {
      account_id: cashAccount,
      debit: amount,
      credit: 0,
      description: 'دریافت وجه',
    },
    {
      account_id: receivableAccount,
      debit: 0,
      credit: amount,
      party_type: 'customer',
      party_id: snapshot.customer_id,
      description: 'تسویه حساب دریافتنی مشتری',
    },
  ];
};

const buildPurchasePaymentLines = (
  snapshot: InvoiceSnapshot,
  rule: AccountingEventRule
): JournalLineDraft[] => {
  const payableAccount = rule.payable_account_id;
  const cashAccount = rule.credit_account_id;
  if (!payableAccount || !cashAccount) return [];

  const paymentFromRows = sumReceivedPayments(snapshot.payments);
  const amount = Math.max(snapshot.total_received_amount, paymentFromRows);
  if (amount <= 0) return [];

  return [
    {
      account_id: payableAccount,
      debit: amount,
      credit: 0,
      party_type: 'supplier',
      party_id: snapshot.supplier_id,
      description: 'تسویه حساب پرداختنی تامین کننده',
    },
    {
      account_id: cashAccount,
      debit: 0,
      credit: amount,
      description: 'پرداخت وجه',
    },
  ];
};

const runEventIfPossible = async ({
  supabase,
  snapshot,
  moduleId,
  eventKey,
  description,
  lineBuilder,
  result,
}: {
  supabase: SupabaseClient;
  snapshot: InvoiceSnapshot;
  moduleId: SupportedInvoiceModule;
  eventKey: string;
  description: string;
  lineBuilder: (snapshot: InvoiceSnapshot, rule: AccountingEventRule) => JournalLineDraft[];
  result: InvoiceAccountingSyncResult;
}) => {
  try {
    const rule = await fetchRule(supabase, eventKey);
    if (!rule) {
      result.skippedEventKeys.push(eventKey);
      return;
    }

    const lines = lineBuilder(snapshot, rule);
    if (!lines.length) {
      result.skippedEventKeys.push(eventKey);
      return;
    }

    const fiscalYearId = await resolveFiscalYearId(supabase, snapshot.invoice_date || null);
    const posted = await createPostedJournalEntry({
      supabase,
      eventKey,
      sourceTable: moduleId,
      sourceModule: moduleId === 'invoices' ? 'sales' : 'purchase',
      sourceRecordId: snapshot.id,
      entryDate: snapshot.invoice_date || new Date().toISOString().slice(0, 10),
      fiscalYearId,
      description,
      lines,
    });

    if (posted.created) {
      result.createdEventKeys.push(eventKey);
    } else {
      result.skippedEventKeys.push(eventKey);
    }
  } catch (error: any) {
    result.errors.push(`${eventKey}: ${error?.message || 'unknown_error'}`);
  }
};

export const syncInvoiceAccountingEntries = async ({
  supabase,
  moduleId,
  recordId,
  recordData,
  includePayments = false,
}: InvoiceAccountingSyncParams): Promise<InvoiceAccountingSyncResult> => {
  const result: InvoiceAccountingSyncResult = {
    createdEventKeys: [],
    skippedEventKeys: [],
    errors: [],
  };

  if (!recordId) return result;

  let snapshot: InvoiceSnapshot;
  try {
    snapshot = recordData
      ? buildSnapshotFromRecord({ id: recordId, ...recordData })
      : await fetchInvoiceSnapshot(supabase, moduleId, recordId);
    if (!snapshot.id) snapshot.id = recordId;
  } catch (error: any) {
    result.errors.push(`snapshot: ${error?.message || 'cannot_load_invoice'}`);
    return result;
  }

  const status = normalizeStatus(snapshot.status);
  if (!FINAL_STATUSES.has(status)) {
    result.skippedEventKeys.push('status_not_final');
    return result;
  }

  const invoiceLabel = snapshot.system_code || snapshot.name || snapshot.id;

  if (moduleId === 'invoices') {
    await runEventIfPossible({
      supabase,
      snapshot,
      moduleId,
      eventKey: 'sales_invoice_finalized',
      description: `صدور خودکار سند فروش - ${invoiceLabel}`,
      lineBuilder: buildSalesInvoiceLines,
      result,
    });
  } else {
    await runEventIfPossible({
      supabase,
      snapshot,
      moduleId,
      eventKey: 'purchase_invoice_finalized',
      description: `صدور خودکار سند خرید - ${invoiceLabel}`,
      lineBuilder: buildPurchaseInvoiceLines,
      result,
    });
  }

  if (!includePayments && !PAYMENT_READY_STATUSES.has(status)) {
    return result;
  }

  if (moduleId === 'invoices') {
    await runEventIfPossible({
      supabase,
      snapshot,
      moduleId,
      eventKey: 'sales_payment_received',
      description: `ثبت خودکار دریافت وجه فروش - ${invoiceLabel}`,
      lineBuilder: buildSalesPaymentLines,
      result,
    });
  } else {
    await runEventIfPossible({
      supabase,
      snapshot,
      moduleId,
      eventKey: 'purchase_payment_paid',
      description: `ثبت خودکار پرداخت خرید - ${invoiceLabel}`,
      lineBuilder: buildPurchasePaymentLines,
      result,
    });
  }

  return result;
};
