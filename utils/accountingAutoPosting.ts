import type { SupabaseClient } from '@supabase/supabase-js';
import type { NavigateFunction } from 'react-router-dom';
import { MODULES } from '../moduleRegistry';
import { SYSTEM_MODULE_SETTINGS_CONNECTION_TYPE } from '../pages/Settings/moduleSettingsTypes';
import { fetchSessionBootstrap } from './sessionCache';
import { generateNextJournalEntryNo } from './journalEntryNumbering';

type SupportedInvoiceModule = 'invoices' | 'purchase_invoices' | 'sales_return_invoices' | 'purchase_return_invoices';

interface DefaultAccounts {
  default_accounts_receivable_id?: string | null;
  default_accounts_payable_id?: string | null;
  default_sales_revenue_id?: string | null;
  default_payment_cash_id?: string | null;
  default_payment_bank_id?: string | null;
  default_inventory_asset_id?: string | null;
  default_cogs_id?: string | null;
  default_sales_tax_id?: string | null;
  default_purchase_tax_id?: string | null;
  default_expense_account_id?: string | null;
}

type ValidAccountIdSet = Set<string>;

interface JournalLine {
  account_id: string;
  debit: number;
  credit: number;
  description?: string;
  cost_center_id?: string | null;
}

interface InvoiceItemRow {
  product_id?: string | null;
  cost_center_id?: string | null;
  total_price?: number | string | null;
  quantity?: number | string | null;
  unit_price?: number | string | null;
  price?: number | string | null;
  discount?: number | string | null;
  discount_type?: string | null;
  vat?: number | string | null;
  vat_type?: string | null;
  products?: {
    id?: string | null;
    name?: string | null;
    product_type?: string | null;
    category?: string | null;
    product_category?: string | null;
    goods_subgroup?: string | null;
    service_subgroup?: string | null;
    cost_center_id?: string | null;
  } | null;
}

interface PaymentRow {
  id?: string | null;
  amount?: number | string | null;
  status?: string | null;
  target_account?: string | null;
  source_account?: string | null;
  payment_type?: string | null;
  transfer_fee?: number | string | null;
}

interface InvoiceRow {
  id?: string | null;
  name?: string | null;
  system_code?: string | null;
  status?: string | null;
  invoice_date?: string | null;
  total_invoice_amount?: number | string | null;
  invoiceItems?: InvoiceItemRow[] | null;
  invoice_items?: InvoiceItemRow[] | null;
  payments_json?: PaymentRow[] | null;
  payments?: PaymentRow[] | null;
}

interface SyncInvoiceAccountingEntriesArgs {
  supabase: SupabaseClient;
  moduleId: SupportedInvoiceModule;
  recordId: string;
  recordData?: any;
  includePayments?: boolean;
}

interface SyncResult {
  createdEventKeys: string[];
  errors: string[];
  createdJournalEntryIds: string[];
  resolvedJournalEntries: ResolvedJournalEntry[];
}

export interface ResolvedJournalEntry {
  eventKey: string;
  journalEntryId: string;
  state: 'created' | 'existing';
}

type Notifier = {
  success?: (content: string) => void;
  warning?: (content: string) => void;
  error?: (content: string) => void;
  info?: (content: string) => void;
};

const FINAL_STATUSES: Record<SupportedInvoiceModule, Set<string>> = {
  invoices: new Set(['final', 'settled', 'completed', 'confirmed']),
  purchase_invoices: new Set(['final', 'settled', 'completed']),
  sales_return_invoices: new Set(['final', 'settled', 'completed', 'confirmed']),
  purchase_return_invoices: new Set(['final', 'settled', 'completed']),
};

const PAYMENT_FINAL_STATUSES = new Set(['received', 'paid', 'approved', 'cleared']);
const OUTDOOR_AD_COST_CENTER_NAME = 'تبلیغات محیطی';
const OUTDOOR_AD_KEYWORDS = ['تبلیغات محیطی', 'billboard', 'outdoor'];

const EVENT_LABELS_FA: Record<string, string> = {
  sales_invoice_finalized: 'نهایی‌سازی فاکتور فروش',
  purchase_invoice_finalized: 'نهایی‌سازی فاکتور خرید',
  sales_payment_received: 'دریافت وجه فاکتور فروش',
  purchase_payment_paid: 'پرداخت وجه فاکتور خرید',
  sales_return_invoice_finalized: 'نهایی‌سازی برگشت از فروش',
  purchase_return_invoice_finalized: 'نهایی‌سازی برگشت از خرید',
  sales_return_payment_paid: 'بازپرداخت برگشت از فروش',
  purchase_return_payment_received: 'دریافت وجه برگشت از خرید',
};

export const getAccountingEventLabelFa = (eventKey: string): string => {
  const normalized = String(eventKey || '').trim();
  return EVENT_LABELS_FA[normalized] || normalized;
};

const toNumber = (value: unknown): number => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

const normalizeStatus = (value: unknown): string => String(value || '').trim().toLowerCase();

const normalizeTextForMatch = (value: unknown): string => {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک');
};

const isFinalStatus = (moduleId: SupportedInvoiceModule, status: unknown): boolean => {
  return FINAL_STATUSES[moduleId].has(normalizeStatus(status));
};

// Helper to get nested property
const get = (obj: object, path: string, defaultValue: any = undefined) => {
  const travel = (regexp: RegExp) =>
    String.prototype.split
      .call(path, regexp)
      .filter(Boolean)
      .reduce((res, key) => (res !== null && res !== undefined ? res[key as keyof typeof res] : res), obj);
  const result = travel(/[,[\]]+?/) || travel(/[,[\].]+?/);
  return result === undefined || result === obj ? defaultValue : result;
};

const normalizeAccountId = (value: unknown): string | null => {
  const v = String(value || '').trim();
  return v || null;
};

const normalizePostingMessage = (raw: unknown, fallback: string): string => {
  const messageText = String(raw || '').trim();
  if (!messageText) return fallback;

  const lower = messageText.toLowerCase();
  if (lower.includes('missing default accounts') && lower.includes('receivable') && lower.includes('revenue')) {
    return 'حساب‌های پیش‌فرض دریافتنی و درآمد فروش تعریف نشده‌اند.';
  }
  if (lower.includes('missing default accounts') && lower.includes('payable')) {
    return 'حساب پیش‌فرض پرداختنی تعریف نشده است.';
  }
  if (lower.includes('json object requested') && lower.includes('multiple')) {
    return 'چند تنظیم هم‌زمان برای حسابداری پیدا شد. لطفا فقط یک تنظیم پیش‌فرض نگه دارید.';
  }
  if (lower.includes('column') && lower.includes('does not exist')) {
    return 'ساختار دیتابیس با نسخه فعلی کد هماهنگ نیست. migrationها را اجرا کنید.';
  }
  if (lower.includes('failed to fetch') || lower.includes('network')) {
    return 'ارتباط با سرور برقرار نشد. اتصال شبکه را بررسی کنید.';
  }
  if (/[a-z]/i.test(messageText)) {
    return fallback;
  }
  return messageText;
};

const pushSyncError = (
  result: SyncResult,
  errorMessage: string,
  fallback = 'خطا در صدور سند حسابداری.'
) => {
  result.errors.push(normalizePostingMessage(errorMessage, fallback));
};

const pushResolvedJournalEntry = (
  result: SyncResult,
  entry: ResolvedJournalEntry
) => {
  const eventKey = String(entry?.eventKey || '').trim();
  const journalEntryId = String(entry?.journalEntryId || '').trim();
  const state = entry?.state === 'existing' ? 'existing' : 'created';
  if (!eventKey || !journalEntryId) return;
  const exists = result.resolvedJournalEntries.some(
    (item) => item.eventKey === eventKey && item.journalEntryId === journalEntryId
  );
  if (exists) return;
  result.resolvedJournalEntries.push({ eventKey, journalEntryId, state });
};

const toFaPostingError = (error: any, fallback: string): string => {
  const rawMessage = String(error?.message || error?.details || '').trim();
  const code = String(error?.code || '').trim();
  const lower = rawMessage.toLowerCase();
  const details = String(error?.details || '').trim().toLowerCase();

  if (code === '42501' || lower.includes('permission denied')) {
    return 'دسترسی لازم برای انجام این عملیات را ندارید.';
  }
  if (code === '23503' || lower.includes('foreign key')) {
    if (details.includes('journal_lines_account_id_fkey') || details.includes('chart_of_accounts')) {
      return 'حساب متناظر برای ثبت سند معتبر نیست. حساب پیش‌فرض یا حساب بانکی انتخاب‌شده را بررسی کنید.';
    }
    return 'به دلیل وابستگی داده‌ها، عملیات قابل انجام نیست.';
  }
  if (code === '23505' || lower.includes('duplicate key')) {
    return 'این رکورد قبلا ثبت شده است.';
  }
  if (code === 'PGRST204') {
    return 'ساختار دیتابیس با نسخه فعلی کد هماهنگ نیست. migrationها را اجرا کنید.';
  }
  if (lower.includes('not found')) {
    return 'رکورد موردنظر یافت نشد.';
  }
  if (lower.includes('column') && lower.includes('does not exist')) {
    return 'ساختار دیتابیس با نسخه فعلی کد هماهنگ نیست. migrationها را اجرا کنید.';
  }
  if (lower.includes('failed to fetch') || lower.includes('network')) {
    return 'ارتباط با سرور برقرار نشد. اتصال شبکه را بررسی کنید.';
  }
  return normalizePostingMessage(rawMessage, fallback);
};

const fetchValidChartAccountIdSet = async (supabase: SupabaseClient): Promise<ValidAccountIdSet> => {
  const { data, error } = await supabase
    .from('chart_of_accounts')
    .select('id');
  if (error) throw error;

  const set: ValidAccountIdSet = new Set();
  (data || []).forEach((row: any) => {
    const id = String(row?.id || '').trim();
    if (id) set.add(id);
  });
  return set;
};

const pickValidAccountId = (
  configuredValue: unknown,
  inferredValue: unknown,
  validAccountIds: ValidAccountIdSet
): string | null => {
  const configuredId = normalizeAccountId(configuredValue);
  if (configuredId && validAccountIds.has(configuredId)) return configuredId;
  const inferredId = normalizeAccountId(inferredValue);
  if (inferredId && validAccountIds.has(inferredId)) return inferredId;
  return null;
};

const fetchDefaultAccounts = async (supabase: SupabaseClient): Promise<DefaultAccounts> => {
  const session = await fetchSessionBootstrap(supabase);
  const currentOrgId = String(session?.orgId || '').trim() || null;
  let query = supabase
    .from('integration_settings')
    .select('settings')
    .eq('connection_type', SYSTEM_MODULE_SETTINGS_CONNECTION_TYPE)
    .limit(1);

  query = currentOrgId
    ? query.eq('org_id', currentOrgId)
    : query.is('org_id', null);

  const { data, error } = await query.maybeSingle();

  if (error && String(error.code) !== 'PGRST116') {
    throw new Error('خواندن تنظیمات حسابداری ناموفق بود.');
  }

  const configured = (get(data?.settings || {}, 'modules.accounting.defaults', {}) || {}) as DefaultAccounts;
  const validAccountIds = await fetchValidChartAccountIdSet(supabase);

  return {
    default_accounts_receivable_id:
      pickValidAccountId(configured.default_accounts_receivable_id, null, validAccountIds),
    default_accounts_payable_id:
      pickValidAccountId(configured.default_accounts_payable_id, null, validAccountIds),
    default_sales_revenue_id:
      pickValidAccountId(configured.default_sales_revenue_id, null, validAccountIds),
    default_payment_cash_id:
      pickValidAccountId(configured.default_payment_cash_id, null, validAccountIds),
    default_payment_bank_id:
      pickValidAccountId(configured.default_payment_bank_id, null, validAccountIds),
    default_inventory_asset_id:
      pickValidAccountId(configured.default_inventory_asset_id, null, validAccountIds),
    default_cogs_id:
      pickValidAccountId(configured.default_cogs_id, null, validAccountIds),
    default_sales_tax_id:
      pickValidAccountId(configured.default_sales_tax_id, null, validAccountIds),
    default_purchase_tax_id:
      pickValidAccountId(configured.default_purchase_tax_id, null, validAccountIds),
    default_expense_account_id:
      pickValidAccountId(configured.default_expense_account_id, null, validAccountIds),
  };
};

const fetchInvoiceRow = async (
  supabase: SupabaseClient,
  moduleId: SupportedInvoiceModule,
  recordId: string
): Promise<InvoiceRow | null> => {
  const { data, error } = await supabase
    .from(moduleId)
    .select('*')
    .eq('id', recordId)
    .maybeSingle();

  if (error && String(error.code) !== 'PGRST116') throw error;
  return (data || null) as InvoiceRow | null;
};

const readInvoiceItems = (invoice: InvoiceRow): InvoiceItemRow[] => {
  if (Array.isArray(invoice.invoiceItems)) return invoice.invoiceItems;
  if (Array.isArray(invoice.invoice_items)) return invoice.invoice_items;
  return [];
};

const readInvoicePayments = (invoice: InvoiceRow): PaymentRow[] => {
  if (Array.isArray(invoice.payments)) return invoice.payments;
  if (Array.isArray(invoice.payments_json)) return invoice.payments_json;
  return [];
};

const getInvoiceItemBreakdown = (item: InvoiceItemRow) => {
  const quantity = toNumber(item?.quantity);
  const unitPrice = toNumber(item?.unit_price || item?.price);
  const rawBase = quantity > 0 && unitPrice > 0 ? quantity * unitPrice : toNumber(item?.total_price);
  const discountValue = Math.max(0, toNumber(item?.discount));
  const discount = String(item?.discount_type || 'amount').toLowerCase() === 'percent'
    ? rawBase * Math.min(100, discountValue) / 100
    : discountValue;
  const net = Math.max(0, rawBase - Math.min(rawBase, discount));
  const vatValue = Math.max(0, toNumber(item?.vat));
  const vat = String(item?.vat_type || 'percent').toLowerCase() === 'amount'
    ? vatValue
    : net * vatValue / 100;
  return { net, vat, total: net + vat };
};

const getInvoiceTaxBreakdown = (items: InvoiceItemRow[]) =>
  (items || []).reduce<{ net: number; vat: number; total: number }>((sum, item) => {
    const row = getInvoiceItemBreakdown(item);
    return { net: sum.net + row.net, vat: sum.vat + row.vat, total: sum.total + row.total };
  }, { net: 0, vat: 0, total: 0 });

const calcInvoiceItemsGrandTotal = (items: InvoiceItemRow[]): number => {
  return (Array.isArray(items) ? items : []).reduce((sum, item) => {
    const rowTotal = toNumber(item?.total_price);
    if (rowTotal > 0) return sum + rowTotal;
    return sum;
  }, 0);
};

const isOutdoorAdvertisingProduct = (productLike: Record<string, any> | null | undefined): boolean => {
  const haystack = normalizeTextForMatch([
    productLike?.name,
    productLike?.product_category,
    productLike?.category,
    productLike?.service_subgroup,
    productLike?.goods_subgroup,
    productLike?.product_type,
  ].filter(Boolean).join(' '));

  if (!haystack) return false;
  return OUTDOOR_AD_KEYWORDS.some((keyword) => haystack.includes(normalizeTextForMatch(keyword)));
};

const fetchCostCentersByProduct = async (
  supabase: SupabaseClient,
  items: InvoiceItemRow[]
): Promise<Record<string, string | null>> => {
  const productIds = Array.from(
    new Set(
      items
        .map((item) => String(item?.product_id || '').trim())
        .filter(Boolean)
    )
  );

  if (productIds.length === 0) return {};

  const { data, error } = await supabase
    .from('products')
    .select('*')
    .in('id', productIds);

  if (error) throw error;

  const productRows = (data || []) as Record<string, any>[];

  const needsOutdoorFallback = productRows.some((row) => {
    const hasCostCenter = Boolean(String(row?.cost_center_id || '').trim());
    return !hasCostCenter && isOutdoorAdvertisingProduct(row);
  });

  let outdoorCostCenterId: string | null = null;
  if (needsOutdoorFallback) {
    const { data: centers, error: centerError } = await supabase
      .from('cost_centers')
      .select('id, name')
      .ilike('name', `%${OUTDOOR_AD_COST_CENTER_NAME}%`)
      .limit(20);
    if (centerError) throw centerError;

    const exact = (centers || []).find(
      (center: any) => normalizeTextForMatch(center?.name) === normalizeTextForMatch(OUTDOOR_AD_COST_CENTER_NAME)
    );
    const picked = exact || (centers || [])[0];
    outdoorCostCenterId = picked?.id ? String(picked.id) : null;
  }

  const map: Record<string, string | null> = {};
  productRows.forEach((row: any) => {
    const id = String(row?.id || '').trim();
    if (!id) return;
    const directCostCenter = row?.cost_center_id ? String(row.cost_center_id).trim() : '';
    if (directCostCenter) {
      map[id] = directCostCenter;
      return;
    }
    if (isOutdoorAdvertisingProduct(row)) {
      map[id] = outdoorCostCenterId;
      return;
    }
    map[id] = null;
  });
  return map;
};

const getInvoiceLabel = (invoice: InvoiceRow, _recordId: string) => {
  return String(invoice.system_code || invoice.name || 'بدون عنوان');
};

const resolvePaymentAccountId = (
  payment: PaymentRow,
  defaults: DefaultAccounts,
  validAccountIds: ValidAccountIdSet,
  financialAccountToLedgerMap: Map<string, string | null>
): string | null => {
  const direct = normalizeAccountId(payment.target_account || payment.source_account);
  if (direct) {
    if (validAccountIds.has(direct)) return direct;
    const mappedLedger = normalizeAccountId(financialAccountToLedgerMap.get(direct));
    if (mappedLedger && validAccountIds.has(mappedLedger)) return mappedLedger;
  }

  const paymentType = normalizeStatus(payment.payment_type);
  if (paymentType === 'cash') {
    const cashId = normalizeAccountId(defaults.default_payment_cash_id);
    return cashId && validAccountIds.has(cashId) ? cashId : null;
  }
  const bankId = normalizeAccountId(defaults.default_payment_bank_id);
  return bankId && validAccountIds.has(bankId) ? bankId : null;
};

const isPaymentSettled = (status: unknown): boolean => {
  const normalized = normalizeStatus(status);
  if (!normalized) return true;
  return PAYMENT_FINAL_STATUSES.has(normalized);
};

const isBalanced = (lines: JournalLine[]) => {
  const totalDebits = lines.reduce((sum, line) => sum + toNumber(line.debit), 0);
  const totalCredits = lines.reduce((sum, line) => sum + toNumber(line.credit), 0);
  return Math.abs(totalDebits - totalCredits) <= 0.01;
};

const buildSalesFinalizedLines = (
  invoice: InvoiceRow,
  invoiceItems: InvoiceItemRow[],
  costCenterByProductId: Record<string, string | null>,
  defaults: DefaultAccounts,
  result: SyncResult,
  isReturn = false,
): JournalLine[] => {
  const receivableAccount = defaults.default_accounts_receivable_id;
  const revenueAccount = defaults.default_sales_revenue_id;
  const taxAccount = defaults.default_sales_tax_id;
  const totalInvoiceAmountRaw = toNumber(invoice.total_invoice_amount);
  const computedInvoiceAmount = calcInvoiceItemsGrandTotal(invoiceItems);
  const totalInvoiceAmount = totalInvoiceAmountRaw > 0 ? totalInvoiceAmountRaw : computedInvoiceAmount;

  const taxBreakdown = getInvoiceTaxBreakdown(invoiceItems);
  if (!receivableAccount || !revenueAccount) {
    pushSyncError(result, 'حساب‌های پیش‌فرض دریافتنی/درآمد فروش تعریف نشده‌اند.');
    return [];
  }
  if (taxBreakdown.vat > 0 && !taxAccount) {
    pushSyncError(result, 'حساب مالیات ارزش افزوده فروش تعریف نشده است.');
    return [];
  }

  if (totalInvoiceAmount <= 0) {
    pushSyncError(result, 'مبلغ فاکتور فروش معتبر نیست.');
    return [];
  }

  const salesByCostCenter = invoiceItems.reduce((acc: Record<string, number>, item: InvoiceItemRow) => {
    const productId = String(item?.product_id || '').trim();
    const directCostCenter = item?.cost_center_id
      ? String(item.cost_center_id)
      : (item.products?.cost_center_id ? String(item.products.cost_center_id) : null);
    const costCenterFromProduct = productId ? (costCenterByProductId[productId] || null) : null;
    const costCenterId = directCostCenter || costCenterFromProduct || '__no_cost_center__';
    const itemTotal = getInvoiceItemBreakdown(item).net;
    acc[costCenterId] = (acc[costCenterId] || 0) + itemTotal;
    return acc;
  }, {} as Record<string, number>);

  const lines: JournalLine[] = [
    {
      account_id: String(receivableAccount),
      debit: isReturn ? 0 : totalInvoiceAmount,
      credit: isReturn ? totalInvoiceAmount : 0,
      description: `${isReturn ? 'ثبت برگشت دریافتنی' : 'ثبت دریافتنی فاکتور فروش'} - ${getInvoiceLabel(invoice, '')}`,
    },
  ];

  const groupedEntries = Object.entries(salesByCostCenter).filter(([, amount]) => toNumber(amount) > 0);
  const revenueTotal = Math.max(0, totalInvoiceAmount - taxBreakdown.vat);
  if (groupedEntries.length === 0) {
    lines.push({
      account_id: String(revenueAccount),
      debit: isReturn ? revenueTotal : 0,
      credit: isReturn ? 0 : revenueTotal,
      description: `ثبت درآمد فروش - ${getInvoiceLabel(invoice, '')}`,
      cost_center_id: null,
    });
    if (taxBreakdown.vat > 0 && taxAccount) lines.push({ account_id: taxAccount, debit: isReturn ? taxBreakdown.vat : 0, credit: isReturn ? 0 : taxBreakdown.vat, description: `${isReturn ? 'برگشت مالیات ارزش افزوده فروش' : 'مالیات ارزش افزوده فروش'} - ${getInvoiceLabel(invoice, '')}` });
    return lines;
  }

  let groupedRevenue = 0;
  groupedEntries.forEach(([costCenterId, amountRaw]) => {
    groupedRevenue += toNumber(amountRaw);
    lines.push({
      account_id: String(revenueAccount),
      debit: isReturn ? toNumber(amountRaw) : 0,
      credit: isReturn ? 0 : toNumber(amountRaw),
      description: `ثبت درآمد فروش - ${getInvoiceLabel(invoice, '')}`,
      cost_center_id: costCenterId === '__no_cost_center__' ? null : costCenterId,
    });
  });

  const revenueRemainder = revenueTotal - groupedRevenue;
  if (revenueRemainder > 0.01) {
    lines.push({ account_id: String(revenueAccount), debit: isReturn ? revenueRemainder : 0, credit: isReturn ? 0 : revenueRemainder, description: `${isReturn ? 'تعدیل برگشت فروش' : 'تعدیل درآمد پس از تخفیف'} - ${getInvoiceLabel(invoice, '')}`, cost_center_id: null });
  }
  if (taxBreakdown.vat > 0 && taxAccount) {
    lines.push({ account_id: taxAccount, debit: isReturn ? taxBreakdown.vat : 0, credit: isReturn ? 0 : taxBreakdown.vat, description: `${isReturn ? 'برگشت مالیات ارزش افزوده فروش' : 'مالیات ارزش افزوده فروش'} - ${getInvoiceLabel(invoice, '')}` });
  }

  return lines;
};

const buildPurchaseFinalizedLines = (
  invoice: InvoiceRow,
  defaults: DefaultAccounts,
  result: SyncResult,
  isReturn = false,
): JournalLine[] => {
  const purchaseDebitAccount = defaults.default_inventory_asset_id || defaults.default_cogs_id;
  const payableAccount = defaults.default_accounts_payable_id;
  const purchaseTaxAccount = defaults.default_purchase_tax_id;
  const items = readInvoiceItems(invoice);
  const taxBreakdown = getInvoiceTaxBreakdown(items);
  const totalInvoiceAmountRaw = toNumber(invoice.total_invoice_amount);
  const totalInvoiceAmount = totalInvoiceAmountRaw > 0
    ? totalInvoiceAmountRaw
    : calcInvoiceItemsGrandTotal(readInvoiceItems(invoice));

  if (!purchaseDebitAccount || !payableAccount) {
    pushSyncError(result, 'حساب‌های پیش‌فرض خرید/موجودی یا پرداختنی تعریف نشده‌اند.');
    return [];
  }
  if (taxBreakdown.vat > 0 && !purchaseTaxAccount) {
    pushSyncError(result, 'حساب اعتبار مالیاتی خرید تعریف نشده است.');
    return [];
  }

  if (totalInvoiceAmount <= 0) {
    pushSyncError(result, 'مبلغ فاکتور خرید معتبر نیست.');
    return [];
  }

  const lines: JournalLine[] = [
    {
      account_id: String(purchaseDebitAccount),
      debit: isReturn ? 0 : Math.max(0, totalInvoiceAmount - taxBreakdown.vat),
      credit: isReturn ? Math.max(0, totalInvoiceAmount - taxBreakdown.vat) : 0,
      description: `ثبت خرید/موجودی - ${getInvoiceLabel(invoice, '')}`,
    },
    {
      account_id: String(payableAccount),
      debit: isReturn ? totalInvoiceAmount : 0,
      credit: isReturn ? 0 : totalInvoiceAmount,
      description: `ثبت حساب پرداختنی - ${getInvoiceLabel(invoice, '')}`,
    },
  ];
  if (taxBreakdown.vat > 0 && purchaseTaxAccount) {
    lines.push({ account_id: purchaseTaxAccount, debit: isReturn ? 0 : taxBreakdown.vat, credit: isReturn ? taxBreakdown.vat : 0, description: `${isReturn ? 'برگشت اعتبار مالیاتی خرید' : 'اعتبار مالیاتی خرید'} - ${getInvoiceLabel(invoice, '')}` });
  }
  return lines;
};

const buildPaymentLines = async (
  supabase: SupabaseClient,
  moduleId: SupportedInvoiceModule,
  invoice: InvoiceRow,
  defaults: DefaultAccounts,
  result: SyncResult
): Promise<JournalLine[]> => {
  const payments = readInvoicePayments(invoice);
  const lines: JournalLine[] = [];
  const validAccountIds = await fetchValidChartAccountIdSet(supabase);

  const directAccountIds = Array.from(
    new Set(
      payments
        .map((payment) => normalizeAccountId(payment.target_account || payment.source_account))
        .filter((v): v is string => Boolean(v))
    )
  );

  const financialAccountToLedgerMap = new Map<string, string | null>();
  if (directAccountIds.length > 0) {
    const [banksRes, cashBoxesRes, pettyFundsRes] = await Promise.all([
      supabase.from('bank_accounts').select('id, account_id').in('id', directAccountIds),
      supabase.from('cash_boxes').select('id, account_id').in('id', directAccountIds),
      supabase.from('petty_funds').select('id, account_id').in('id', directAccountIds),
    ]);
    if (banksRes.error) throw banksRes.error;
    if (cashBoxesRes.error) throw cashBoxesRes.error;
    if (pettyFundsRes.error) throw pettyFundsRes.error;

    [...(banksRes.data || []), ...(cashBoxesRes.data || []), ...(pettyFundsRes.data || [])].forEach((account: any) => {
      const id = normalizeAccountId(account?.id);
      if (!id) return;
      financialAccountToLedgerMap.set(id, normalizeAccountId(account?.account_id));
    });
  }

  for (const payment of payments) {
    const paymentAmount = toNumber(payment.amount);
    const transferFee = Math.max(0, toNumber(payment.transfer_fee));
    if (paymentAmount <= 0) continue;
    if (!isPaymentSettled(payment.status)) continue;

    const paymentAccountId = resolvePaymentAccountId(
      payment,
      defaults,
      validAccountIds,
      financialAccountToLedgerMap
    );
    if (!paymentAccountId) {
      pushSyncError(result, `حساب مقصد برای پرداخت ${String(payment.id || '')} مشخص نیست.`);
      continue;
    }

    const isSales = moduleId === 'invoices' || moduleId === 'sales_return_invoices';
    if (isSales) {
      const receivableAccount = defaults.default_accounts_receivable_id;
      if (!receivableAccount) {
        pushSyncError(result, 'حساب دریافتنی پیش‌فرض تعریف نشده است.');
        break;
      }

      lines.push({
        account_id: String(paymentAccountId),
        debit: moduleId === 'sales_return_invoices' ? 0 : paymentAmount,
        credit: moduleId === 'sales_return_invoices' ? paymentAmount : 0,
        description: `${moduleId === 'sales_return_invoices' ? 'بازپرداخت وجه' : 'ثبت دریافت وجه'} - ${getInvoiceLabel(invoice, '')}`,
      });
      lines.push({
        account_id: String(receivableAccount),
        debit: moduleId === 'sales_return_invoices' ? paymentAmount : 0,
        credit: moduleId === 'sales_return_invoices' ? 0 : paymentAmount,
        description: `${moduleId === 'sales_return_invoices' ? 'ایجاد طلب بابت برگشت' : 'تسویه حساب دریافتنی'} - ${getInvoiceLabel(invoice, '')}`,
      });
      if (moduleId === 'sales_return_invoices' && transferFee > 0) {
        const expenseAccount = defaults.default_expense_account_id;
        if (!expenseAccount) {
          pushSyncError(result, 'حساب هزینه پیش‌فرض برای ثبت کارمزد انتقال تعریف نشده است.');
          continue;
        }
        lines.push(
          { account_id: String(expenseAccount), debit: transferFee, credit: 0, description: `هزینه کارمزد انتقال - ${getInvoiceLabel(invoice, '')}` },
          { account_id: String(paymentAccountId), debit: 0, credit: transferFee, description: `پرداخت کارمزد انتقال - ${getInvoiceLabel(invoice, '')}` },
        );
      }
      continue;
    }

    const payableAccount = defaults.default_accounts_payable_id;
    if (!payableAccount) {
      pushSyncError(result, 'حساب پرداختنی پیش‌فرض تعریف نشده است.');
      break;
    }

    const isPurchaseReturn = moduleId === 'purchase_return_invoices';
    lines.push({
      account_id: String(payableAccount),
      debit: isPurchaseReturn ? 0 : paymentAmount,
      credit: isPurchaseReturn ? paymentAmount : 0,
      description: `${isPurchaseReturn ? 'دریافت وجه برگشت خرید' : 'تسویه حساب پرداختنی'} - ${getInvoiceLabel(invoice, '')}`,
    });
    lines.push({
      account_id: String(paymentAccountId),
      debit: isPurchaseReturn ? paymentAmount : 0,
      credit: isPurchaseReturn ? 0 : paymentAmount,
      description: `${isPurchaseReturn ? 'ثبت دریافت وجه از تامین‌کننده' : 'ثبت پرداخت وجه'} - ${getInvoiceLabel(invoice, '')}`,
    });

    if (transferFee > 0) {
      const expenseAccount = defaults.default_expense_account_id;
      if (!expenseAccount) {
        pushSyncError(result, 'حساب هزینه پیش‌فرض برای ثبت کارمزد انتقال تعریف نشده است.');
        continue;
      }
      lines.push(
        { account_id: String(expenseAccount), debit: transferFee, credit: 0, description: `هزینه کارمزد انتقال - ${getInvoiceLabel(invoice, '')}` },
        { account_id: String(paymentAccountId), debit: 0, credit: transferFee, description: `پرداخت کارمزد انتقال - ${getInvoiceLabel(invoice, '')}` },
      );
    }
  }

  return lines;
};

const findExistingEntry = async (
  supabase: SupabaseClient,
  moduleId: SupportedInvoiceModule,
  recordId: string,
  eventKey: string
): Promise<string | null> => {
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

const createJournalEntry = async ({
  supabase,
  moduleId,
  recordId,
  invoice,
  eventKey,
  description,
  lines,
  result,
}: {
  supabase: SupabaseClient;
  moduleId: SupportedInvoiceModule;
  recordId: string;
  invoice: InvoiceRow;
  eventKey: string;
  description: string;
  lines: JournalLine[];
  result: SyncResult;
}): Promise<ResolvedJournalEntry | null> => {
  const normalizedEventKey = String(eventKey || '').trim();
  const normalizedEventKeys = normalizedEventKey ? [normalizedEventKey] : [];
  if (!normalizedEventKey) return null;

  if (lines.length > 0 && !isBalanced(lines)) {
    const eventLabel = normalizedEventKeys.map((key) => EVENT_LABELS_FA[key] || key).join('، ');
    pushSyncError(result, `سند حسابداری برای رویداد «${eventLabel}» متوازن نیست.`);
    return null;
  }

  const existingId = await findExistingEntry(supabase, moduleId, recordId, normalizedEventKey);
  if (existingId) {
    const existingEntry: ResolvedJournalEntry = {
      eventKey: normalizedEventKey,
      journalEntryId: existingId,
      state: 'existing',
    };
    pushResolvedJournalEntry(result, existingEntry);
    return existingEntry;
  }

  const sourceRecordTitle = getInvoiceLabel(invoice, recordId);
  const entryDate = invoice.invoice_date || new Date().toISOString().slice(0, 10);

  const { data: yearRows } = await supabase
    .from('fiscal_years')
    .select('id, start_date, end_date, is_active, is_closed')
    .order('start_date', { ascending: false });

  const fiscalYearId: string | null = (() => {
    const years = (yearRows || []) as Array<{ id: string; start_date: string; end_date: string; is_active: boolean; is_closed: boolean }>;
    const byDate = years.find((y) => !y.is_closed && entryDate >= y.start_date && entryDate <= y.end_date);
    if (byDate) return byDate.id;
    const active = years.find((y) => y.is_active && !y.is_closed);
    return active?.id ?? null;
  })();

  const entryNo = await generateNextJournalEntryNo({ supabase, fiscalYearId });

  const { data: journalEntry, error: journalError } = await supabase
    .from('journal_entries')
    .insert({
      entry_no: entryNo,
      entry_date: entryDate,
      fiscal_year_id: fiscalYearId,
      description,
      status: 'draft',
      source_record_id: recordId,
      source_record_title: sourceRecordTitle,
      source_table: moduleId,
      source_module: moduleId,
      metadata: {
        posting_mode: 'manual',
        posting_warnings: result.errors,
        incomplete: lines.length === 0 || result.errors.length > 0,
        source_event_key: normalizedEventKey,
      },
    })
    .select('id')
    .single();

  if (journalError) throw journalError;
  if (!journalEntry?.id) throw new Error('ایجاد سند حسابداری ناموفق بود.');

  const linesToInsert = lines.map((line, index) => ({
    ...line,
    line_no: index + 1,
    entry_id: journalEntry.id,
  }));

  const { error: linesError } = await supabase.from('journal_lines').insert(linesToInsert);
  if (linesError) {
    await supabase.from('journal_entries').delete().eq('id', journalEntry.id);
    throw linesError;
  }

  const linkRow = {
    event_key: normalizedEventKey,
    source_table: moduleId,
    source_record_id: recordId,
    journal_entry_id: journalEntry.id,
  };
  const { error: linkError } = await supabase.from('journal_entry_links').insert(linkRow);
  if (linkError) {
    await supabase.from('journal_lines').delete().eq('entry_id', journalEntry.id);
    await supabase.from('journal_entries').delete().eq('id', journalEntry.id);
    if (String(linkError.code || '') === '23505') {
      const duplicateId = await findExistingEntry(supabase, moduleId, recordId, normalizedEventKey);
      if (!duplicateId) return null;
      const duplicateEntry: ResolvedJournalEntry = {
        eventKey: normalizedEventKey,
        journalEntryId: duplicateId,
        state: 'existing',
      };
      pushResolvedJournalEntry(result, duplicateEntry);
      return duplicateEntry;
    }
    throw linkError;
  }

  result.createdEventKeys.push(normalizedEventKey);
  result.createdJournalEntryIds.push(String(journalEntry.id));
  const createdEntry: ResolvedJournalEntry = {
    eventKey: normalizedEventKey,
    journalEntryId: String(journalEntry.id),
    state: 'created',
  };
  pushResolvedJournalEntry(result, createdEntry);
  return createdEntry;
};

export const syncInvoiceAccountingEntries = async (
  args: SyncInvoiceAccountingEntriesArgs
): Promise<SyncResult> => {
  const { supabase, moduleId, recordId, includePayments = false } = args;
  const result: SyncResult = {
    createdEventKeys: [],
    errors: [],
    createdJournalEntryIds: [],
    resolvedJournalEntries: [],
  };

  if (!recordId) {
    pushSyncError(result, 'شناسه رکورد معتبر نیست.');
    return result;
  }

  try {
    const invoice = await fetchInvoiceRow(supabase, moduleId, recordId);
    if (!invoice) {
      pushSyncError(result, 'فاکتور موردنظر یافت نشد.');
      return result;
    }
    const resolvedInvoice: InvoiceRow = invoice;

    if (!isFinalStatus(moduleId, resolvedInvoice.status)) {
      return result;
    }

    const defaultAccounts = await fetchDefaultAccounts(supabase);
    const invoiceLabel = getInvoiceLabel(resolvedInvoice, recordId);

    const isSalesModule = moduleId === 'invoices' || moduleId === 'sales_return_invoices';
    const isReturnModule = moduleId === 'sales_return_invoices' || moduleId === 'purchase_return_invoices';
    const finalizedEventKey = moduleId === 'invoices'
      ? 'sales_invoice_finalized'
      : moduleId === 'purchase_invoices'
        ? 'purchase_invoice_finalized'
        : moduleId === 'sales_return_invoices'
          ? 'sales_return_invoice_finalized'
          : 'purchase_return_invoice_finalized';
    const paymentEventKey = moduleId === 'invoices'
      ? 'sales_payment_received'
      : moduleId === 'purchase_invoices'
        ? 'purchase_payment_paid'
        : moduleId === 'sales_return_invoices'
          ? 'sales_return_payment_paid'
          : 'purchase_return_payment_received';

    const invoiceItems = readInvoiceItems(resolvedInvoice);
    const costCenterByProductId = isSalesModule
      ? await fetchCostCentersByProduct(supabase, invoiceItems)
      : {};

    const finalizedLines =
      isSalesModule
        ? buildSalesFinalizedLines(
            resolvedInvoice,
            invoiceItems,
            costCenterByProductId,
            defaultAccounts,
            result,
            moduleId === 'sales_return_invoices'
          )
        : buildPurchaseFinalizedLines(resolvedInvoice, defaultAccounts, result, moduleId === 'purchase_return_invoices');

    const paymentLines = includePayments
      ? await buildPaymentLines(supabase, moduleId, resolvedInvoice, defaultAccounts, result)
      : [];

    const [existingFinalizedEntryId, existingPaymentEntryId] = await Promise.all([
      finalizedLines.length > 0 ? findExistingEntry(supabase, moduleId, recordId, finalizedEventKey) : Promise.resolve(null),
      paymentLines.length > 0 ? findExistingEntry(supabase, moduleId, recordId, paymentEventKey) : Promise.resolve(null),
    ]);

    if (existingFinalizedEntryId) {
      pushResolvedJournalEntry(result, {
        eventKey: finalizedEventKey,
        journalEntryId: existingFinalizedEntryId,
        state: 'existing',
      });
    }
    if (existingPaymentEntryId) {
      pushResolvedJournalEntry(result, {
        eventKey: paymentEventKey,
        journalEntryId: existingPaymentEntryId,
        state: 'existing',
      });
    }

    if (false && includePayments && finalizedLines.length > 0 && paymentLines.length > 0 && !existingFinalizedEntryId && !existingPaymentEntryId) {
      await createJournalEntry({
        supabase,
        moduleId,
        recordId,
        invoice: resolvedInvoice,
        eventKey: finalizedEventKey,
        description: isReturnModule ? `صدور دستی سند برگشت و تسویه - ${invoiceLabel}` : (isSalesModule ? `صدور دستی سند فروش و دریافت وجه - ${invoiceLabel}` : `صدور دستی سند خرید و پرداخت وجه - ${invoiceLabel}`),
        lines: [...finalizedLines, ...paymentLines],
        result,
      });
    } else {
      if (!existingFinalizedEntryId && (finalizedLines.length > 0 || result.errors.length > 0)) {
        await createJournalEntry({
          supabase,
          moduleId,
          recordId,
          invoice: resolvedInvoice,
          eventKey: finalizedEventKey,
          description: isReturnModule ? `صدور دستی سند برگشت - ${invoiceLabel}` : (isSalesModule ? `صدور دستی سند فروش - ${invoiceLabel}` : `صدور دستی سند خرید - ${invoiceLabel}`),
          lines: finalizedLines,
          result,
        });
      }

      if (paymentLines.length > 0 && !existingPaymentEntryId) {
        await createJournalEntry({
          supabase,
          moduleId,
          recordId,
          invoice: resolvedInvoice,
          eventKey: paymentEventKey,
          description: isReturnModule ? `صدور دستی سند تسویه برگشت - ${invoiceLabel}` : (isSalesModule ? `صدور دستی سند دریافت وجه - ${invoiceLabel}` : `صدور دستی سند پرداخت وجه - ${invoiceLabel}`),
          lines: paymentLines,
          result,
        });
      }
    }
  } catch (error: any) {
    console.error('خطا در همگام‌سازی اسناد حسابداری فاکتور:', error);
    pushSyncError(result, toFaPostingError(error, 'خطا در صدور سند حسابداری.'));
  }

  return result;
};

export const createJournalFromInvoice = async (
  supabase: SupabaseClient,
  invoiceId: string,
  navigate: NavigateFunction,
  notifier?: Notifier
) => {
  try {
    const syncResult = await syncInvoiceAccountingEntries({
      supabase,
      moduleId: 'invoices',
      recordId: invoiceId,
      includePayments: true,
    });

    if (syncResult.resolvedJournalEntries.length > 0) {
      const lastJournalId = syncResult.resolvedJournalEntries[syncResult.resolvedJournalEntries.length - 1]?.journalEntryId;
      const journalModule = MODULES.journal_entries;
      notifier?.success?.('سند حسابداری با موفقیت ایجاد شد.');
      if (lastJournalId) {
        navigate(`/${journalModule.table}/${lastJournalId}`);
      }
      if (syncResult.errors.length > 0) {
        notifier?.warning?.('صدور سند با هشدار همراه بود.');
      }
      return;
    }

    if (syncResult.errors.length > 0) {
      notifier?.error?.(normalizePostingMessage(syncResult.errors[0], 'خطا در صدور سند حسابداری.'));
      return;
    }

    notifier?.info?.('سندی صادر نشد.');
  } catch (error: any) {
    console.error('خطا در ایجاد سند حسابداری از فاکتور:', error);
    notifier?.error?.(toFaPostingError(error, 'ایجاد سند حسابداری ناموفق بود.'));
  }
};
