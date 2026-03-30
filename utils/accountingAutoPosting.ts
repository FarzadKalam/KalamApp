import type { SupabaseClient } from '@supabase/supabase-js';
import type { NavigateFunction } from 'react-router-dom';
import { MODULES } from '../moduleRegistry';
import { SYSTEM_MODULE_SETTINGS_CONNECTION_TYPE } from '../pages/Settings/moduleSettingsTypes';

type SupportedInvoiceModule = 'invoices' | 'purchase_invoices';

interface DefaultAccounts {
  default_accounts_receivable_id?: string | null;
  default_accounts_payable_id?: string | null;
  default_sales_revenue_id?: string | null;
  default_payment_cash_id?: string | null;
  default_payment_bank_id?: string | null;
  default_inventory_asset_id?: string | null;
  default_cogs_id?: string | null;
}

interface CoaRow {
  id?: string | null;
  code?: string | null;
  name?: string | null;
  account_type?: string | null;
  nature?: string | null;
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
}

type Notifier = {
  success?: (content: string) => void;
  warning?: (content: string) => void;
  error?: (content: string) => void;
  info?: (content: string) => void;
};

const DEFAULT_ACCOUNT_CODE_PRIORITY: Record<keyof DefaultAccounts, string[]> = {
  default_accounts_receivable_id: ['1111', '111'],
  default_accounts_payable_id: ['2101', '210'],
  default_sales_revenue_id: ['4101', '410'],
  default_payment_cash_id: ['1101'],
  default_payment_bank_id: ['1102'],
  default_inventory_asset_id: ['1301'],
  default_cogs_id: ['5101'],
};

const FINAL_STATUSES: Record<SupportedInvoiceModule, Set<string>> = {
  invoices: new Set(['final', 'settled', 'completed', 'confirmed']),
  purchase_invoices: new Set(['final', 'settled', 'completed']),
};

const PAYMENT_FINAL_STATUSES = new Set(['received', 'paid', 'cleared']);
const OUTDOOR_AD_COST_CENTER_NAME = 'تبلیغات محیطی';
const OUTDOOR_AD_KEYWORDS = ['تبلیغات محیطی', 'billboard', 'outdoor'];

const EVENT_LABELS_FA: Record<string, string> = {
  sales_invoice_finalized: 'نهایی‌سازی فاکتور فروش',
  purchase_invoice_finalized: 'نهایی‌سازی فاکتور خرید',
  sales_payment_received: 'دریافت وجه فاکتور فروش',
  purchase_payment_paid: 'پرداخت وجه فاکتور خرید',
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

const fetchAutoDefaultAccountsFromCoa = async (supabase: SupabaseClient): Promise<DefaultAccounts> => {
  const { data, error } = await supabase
    .from('chart_of_accounts')
    .select('id, code, name, account_type, nature')
    .in('account_type', ['asset', 'liability', 'income', 'expense']);

  if (error) throw error;

  const idByCode = new Map<string, string>();
  const rows = (data || []) as CoaRow[];
  rows.forEach((row) => {
    const code = String(row?.code || '').trim();
    const id = String(row?.id || '').trim();
    if (!code || !id) return;
    if (!idByCode.has(code)) idByCode.set(code, id);
  });

  const resolved: DefaultAccounts = {};
  (Object.keys(DEFAULT_ACCOUNT_CODE_PRIORITY) as Array<keyof DefaultAccounts>).forEach((key) => {
    const matched = DEFAULT_ACCOUNT_CODE_PRIORITY[key]
      .map((code) => idByCode.get(code))
      .find(Boolean);
    if (matched) resolved[key] = matched;
  });

  const findByTypeAndName = (accountType: string, keywords: string[]): string | null => {
    const matched = rows.find((row) => {
      const type = String(row?.account_type || '').trim().toLowerCase();
      if (type !== accountType) return false;
      const haystack = `${String(row?.name || '')} ${String(row?.code || '')}`.toLowerCase();
      return keywords.some((kw) => haystack.includes(kw.toLowerCase()));
    });
    return matched?.id ? String(matched.id) : null;
  };

  const findFirstByType = (accountType: string): string | null => {
    const matched = rows.find((row) => String(row?.account_type || '').trim().toLowerCase() === accountType);
    return matched?.id ? String(matched.id) : null;
  };

  if (!resolved.default_accounts_receivable_id) {
    resolved.default_accounts_receivable_id =
      findByTypeAndName('asset', ['دریافتنی', 'receivable']) ||
      findByTypeAndName('asset', ['تجاری']) ||
      findFirstByType('asset');
  }
  if (!resolved.default_accounts_payable_id) {
    resolved.default_accounts_payable_id =
      findByTypeAndName('liability', ['پرداختنی', 'payable']) ||
      findFirstByType('liability');
  }
  if (!resolved.default_sales_revenue_id) {
    resolved.default_sales_revenue_id =
      findByTypeAndName('income', ['فروش', 'درآمد', 'revenue']) ||
      findFirstByType('income');
  }
  if (!resolved.default_payment_cash_id) {
    resolved.default_payment_cash_id =
      findByTypeAndName('asset', ['صندوق', 'cash']) ||
      null;
  }
  if (!resolved.default_payment_bank_id) {
    resolved.default_payment_bank_id =
      findByTypeAndName('asset', ['بانک', 'bank']) ||
      null;
  }
  if (!resolved.default_inventory_asset_id) {
    resolved.default_inventory_asset_id =
      findByTypeAndName('asset', ['موجودی', 'inventory']) ||
      null;
  }
  if (!resolved.default_cogs_id) {
    resolved.default_cogs_id =
      findByTypeAndName('expense', ['بهای تمام شده', 'cost', 'cogs']) ||
      null;
  }

  return resolved;
};

const fetchDefaultAccounts = async (supabase: SupabaseClient): Promise<DefaultAccounts> => {
  const { data, error } = await supabase
    .from('integration_settings')
    .select('settings')
    .eq('connection_type', SYSTEM_MODULE_SETTINGS_CONNECTION_TYPE)
    .limit(1)
    .maybeSingle();

  if (error && String(error.code) !== 'PGRST116') {
    throw new Error('خواندن تنظیمات حسابداری ناموفق بود.');
  }

  const configured = (get(data?.settings || {}, 'modules.accounting.defaults', {}) || {}) as DefaultAccounts;
  const inferred = await fetchAutoDefaultAccountsFromCoa(supabase);
  const validAccountIds = await fetchValidChartAccountIdSet(supabase);

  return {
    default_accounts_receivable_id:
      pickValidAccountId(configured.default_accounts_receivable_id, inferred.default_accounts_receivable_id, validAccountIds),
    default_accounts_payable_id:
      pickValidAccountId(configured.default_accounts_payable_id, inferred.default_accounts_payable_id, validAccountIds),
    default_sales_revenue_id:
      pickValidAccountId(configured.default_sales_revenue_id, inferred.default_sales_revenue_id, validAccountIds),
    default_payment_cash_id:
      pickValidAccountId(configured.default_payment_cash_id, inferred.default_payment_cash_id, validAccountIds),
    default_payment_bank_id:
      pickValidAccountId(configured.default_payment_bank_id, inferred.default_payment_bank_id, validAccountIds),
    default_inventory_asset_id:
      pickValidAccountId(configured.default_inventory_asset_id, inferred.default_inventory_asset_id, validAccountIds),
    default_cogs_id:
      pickValidAccountId(configured.default_cogs_id, inferred.default_cogs_id, validAccountIds),
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

const getInvoiceLabel = (invoice: InvoiceRow, recordId: string) => {
  return String(invoice.system_code || invoice.name || recordId);
};

const resolvePaymentAccountId = (
  payment: PaymentRow,
  defaults: DefaultAccounts,
  validAccountIds: ValidAccountIdSet,
  bankAccountToLedgerMap: Map<string, string | null>
): string | null => {
  const direct = normalizeAccountId(payment.target_account || payment.source_account);
  if (direct) {
    if (validAccountIds.has(direct)) return direct;
    const mappedLedger = normalizeAccountId(bankAccountToLedgerMap.get(direct));
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
  result: SyncResult
): JournalLine[] => {
  const receivableAccount = defaults.default_accounts_receivable_id;
  const revenueAccount = defaults.default_sales_revenue_id;
  const totalInvoiceAmountRaw = toNumber(invoice.total_invoice_amount);
  const computedInvoiceAmount = calcInvoiceItemsGrandTotal(invoiceItems);
  const totalInvoiceAmount = totalInvoiceAmountRaw > 0 ? totalInvoiceAmountRaw : computedInvoiceAmount;

  if (!receivableAccount || !revenueAccount) {
    pushSyncError(result, 'حساب‌های پیش‌فرض دریافتنی/درآمد فروش تعریف نشده‌اند.');
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
    const itemTotal = toNumber(item.total_price);
    acc[costCenterId] = (acc[costCenterId] || 0) + itemTotal;
    return acc;
  }, {} as Record<string, number>);

  const lines: JournalLine[] = [
    {
      account_id: String(receivableAccount),
      debit: totalInvoiceAmount,
      credit: 0,
      description: `ثبت دریافتنی فاکتور فروش - ${getInvoiceLabel(invoice, '')}`,
    },
  ];

  const groupedEntries = Object.entries(salesByCostCenter).filter(([, amount]) => toNumber(amount) > 0);
  if (groupedEntries.length === 0) {
    lines.push({
      account_id: String(revenueAccount),
      debit: 0,
      credit: totalInvoiceAmount,
      description: `ثبت درآمد فروش - ${getInvoiceLabel(invoice, '')}`,
      cost_center_id: null,
    });
    return lines;
  }

  groupedEntries.forEach(([costCenterId, amountRaw]) => {
    lines.push({
      account_id: String(revenueAccount),
      debit: 0,
      credit: toNumber(amountRaw),
      description: `ثبت درآمد فروش - ${getInvoiceLabel(invoice, '')}`,
      cost_center_id: costCenterId === '__no_cost_center__' ? null : costCenterId,
    });
  });

  return lines;
};

const buildPurchaseFinalizedLines = (
  invoice: InvoiceRow,
  defaults: DefaultAccounts,
  result: SyncResult
): JournalLine[] => {
  const purchaseDebitAccount = defaults.default_inventory_asset_id || defaults.default_cogs_id;
  const payableAccount = defaults.default_accounts_payable_id;
  const totalInvoiceAmountRaw = toNumber(invoice.total_invoice_amount);
  const totalInvoiceAmount = totalInvoiceAmountRaw > 0
    ? totalInvoiceAmountRaw
    : calcInvoiceItemsGrandTotal(readInvoiceItems(invoice));

  if (!purchaseDebitAccount || !payableAccount) {
    pushSyncError(result, 'حساب‌های پیش‌فرض خرید/موجودی یا پرداختنی تعریف نشده‌اند.');
    return [];
  }

  if (totalInvoiceAmount <= 0) {
    pushSyncError(result, 'مبلغ فاکتور خرید معتبر نیست.');
    return [];
  }

  return [
    {
      account_id: String(purchaseDebitAccount),
      debit: totalInvoiceAmount,
      credit: 0,
      description: `ثبت خرید/موجودی - ${getInvoiceLabel(invoice, '')}`,
    },
    {
      account_id: String(payableAccount),
      debit: 0,
      credit: totalInvoiceAmount,
      description: `ثبت حساب پرداختنی - ${getInvoiceLabel(invoice, '')}`,
    },
  ];
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

  const bankAccountToLedgerMap = new Map<string, string | null>();
  if (directAccountIds.length > 0) {
    const { data: banks, error: bankError } = await supabase
      .from('bank_accounts')
      .select('id, account_id')
      .in('id', directAccountIds);
    if (bankError) throw bankError;
    (banks || []).forEach((bank: any) => {
      const id = normalizeAccountId(bank?.id);
      if (!id) return;
      bankAccountToLedgerMap.set(id, normalizeAccountId(bank?.account_id));
    });
  }

  for (const payment of payments) {
    const paymentAmount = toNumber(payment.amount);
    if (paymentAmount <= 0) continue;
    if (!isPaymentSettled(payment.status)) continue;

    const paymentAccountId = resolvePaymentAccountId(
      payment,
      defaults,
      validAccountIds,
      bankAccountToLedgerMap
    );
    if (!paymentAccountId) {
      pushSyncError(result, `حساب مقصد برای پرداخت ${String(payment.id || '')} مشخص نیست.`);
      continue;
    }

    if (moduleId === 'invoices') {
      const receivableAccount = defaults.default_accounts_receivable_id;
      if (!receivableAccount) {
        pushSyncError(result, 'حساب دریافتنی پیش‌فرض تعریف نشده است.');
        break;
      }

      lines.push({
        account_id: String(paymentAccountId),
        debit: paymentAmount,
        credit: 0,
        description: `ثبت دریافت وجه - ${getInvoiceLabel(invoice, '')}`,
      });
      lines.push({
        account_id: String(receivableAccount),
        debit: 0,
        credit: paymentAmount,
        description: `تسویه حساب دریافتنی - ${getInvoiceLabel(invoice, '')}`,
      });
      continue;
    }

    const payableAccount = defaults.default_accounts_payable_id;
    if (!payableAccount) {
      pushSyncError(result, 'حساب پرداختنی پیش‌فرض تعریف نشده است.');
      break;
    }

    lines.push({
      account_id: String(payableAccount),
      debit: paymentAmount,
      credit: 0,
      description: `تسویه حساب پرداختنی - ${getInvoiceLabel(invoice, '')}`,
    });
    lines.push({
      account_id: String(paymentAccountId),
      debit: 0,
      credit: paymentAmount,
      description: `ثبت پرداخت وجه - ${getInvoiceLabel(invoice, '')}`,
    });
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
  eventKeys,
  description,
  lines,
  result,
}: {
  supabase: SupabaseClient;
  moduleId: SupportedInvoiceModule;
  recordId: string;
  invoice: InvoiceRow;
  eventKeys: string[];
  description: string;
  lines: JournalLine[];
  result: SyncResult;
}): Promise<string | null> => {
  const normalizedEventKeys = Array.from(
    new Set(
      (eventKeys || [])
        .map((value) => String(value || '').trim())
        .filter(Boolean)
    )
  );

  if (lines.length === 0) return null;
  if (normalizedEventKeys.length === 0) return null;

  if (!isBalanced(lines)) {
    const eventLabel = normalizedEventKeys.map((key) => EVENT_LABELS_FA[key] || key).join('، ');
    pushSyncError(result, `سند حسابداری برای رویداد «${eventLabel}» متوازن نیست.`);
    return null;
  }

  for (const eventKey of normalizedEventKeys) {
    const existingId = await findExistingEntry(supabase, moduleId, recordId, eventKey);
    if (existingId) return null;
  }

  const sourceRecordTitle = getInvoiceLabel(invoice, recordId);
  const { data: journalEntry, error: journalError } = await supabase
    .from('journal_entries')
    .insert({
      entry_date: invoice.invoice_date || new Date().toISOString().slice(0, 10),
      description,
      status: 'draft',
      source_record_id: recordId,
      source_record_title: sourceRecordTitle,
      source_table: moduleId,
      source_module: moduleId,
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

  const linkRows = normalizedEventKeys.map((eventKey) => ({
    event_key: eventKey,
    source_table: moduleId,
    source_record_id: recordId,
    journal_entry_id: journalEntry.id,
  }));
  const { error: linkError } = await supabase.from('journal_entry_links').insert(linkRows);
  if (linkError) {
    await supabase.from('journal_lines').delete().eq('entry_id', journalEntry.id);
    await supabase.from('journal_entries').delete().eq('id', journalEntry.id);
    if (String(linkError.code || '') === '23505') {
      return null;
    }
    throw linkError;
  }

  result.createdEventKeys.push(...normalizedEventKeys);
  result.createdJournalEntryIds.push(String(journalEntry.id));
  return String(journalEntry.id);
};

export const syncInvoiceAccountingEntries = async (
  args: SyncInvoiceAccountingEntriesArgs
): Promise<SyncResult> => {
  const { supabase, moduleId, recordId, includePayments = false } = args;
  const result: SyncResult = { createdEventKeys: [], errors: [], createdJournalEntryIds: [] };

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

    if (!isFinalStatus(moduleId, invoice.status)) {
      return result;
    }

    const defaultAccounts = await fetchDefaultAccounts(supabase);
    const invoiceLabel = getInvoiceLabel(invoice, recordId);

    const finalizedEventKey = moduleId === 'invoices' ? 'sales_invoice_finalized' : 'purchase_invoice_finalized';
    const paymentEventKey = moduleId === 'invoices' ? 'sales_payment_received' : 'purchase_payment_paid';

    const invoiceItems = moduleId === 'invoices' ? readInvoiceItems(invoice) : [];
    const costCenterByProductId = moduleId === 'invoices'
      ? await fetchCostCentersByProduct(supabase, invoiceItems)
      : {};

    const finalizedLines =
      moduleId === 'invoices'
        ? buildSalesFinalizedLines(
            invoice,
            invoiceItems,
            costCenterByProductId,
            defaultAccounts,
            result
          )
        : buildPurchaseFinalizedLines(invoice, defaultAccounts, result);

    const paymentLines = includePayments
      ? await buildPaymentLines(supabase, moduleId, invoice, defaultAccounts, result)
      : [];

    const [existingFinalizedEntryId, existingPaymentEntryId] = await Promise.all([
      finalizedLines.length > 0 ? findExistingEntry(supabase, moduleId, recordId, finalizedEventKey) : Promise.resolve(null),
      paymentLines.length > 0 ? findExistingEntry(supabase, moduleId, recordId, paymentEventKey) : Promise.resolve(null),
    ]);

    if (includePayments && finalizedLines.length > 0 && paymentLines.length > 0 && !existingFinalizedEntryId && !existingPaymentEntryId) {
      await createJournalEntry({
        supabase,
        moduleId,
        recordId,
        invoice,
        eventKeys: [finalizedEventKey, paymentEventKey],
        description: moduleId === 'invoices'
          ? `صدور خودکار سند فروش و دریافت وجه - ${invoiceLabel}`
          : `صدور خودکار سند خرید و پرداخت وجه - ${invoiceLabel}`,
        lines: [...finalizedLines, ...paymentLines],
        result,
      });
    } else {
      if (finalizedLines.length > 0 && !existingFinalizedEntryId) {
        await createJournalEntry({
          supabase,
          moduleId,
          recordId,
          invoice,
          eventKeys: [finalizedEventKey],
          description: moduleId === 'invoices'
            ? `صدور خودکار سند فروش - ${invoiceLabel}`
            : `صدور خودکار سند خرید - ${invoiceLabel}`,
          lines: finalizedLines,
          result,
        });
      }

      if (paymentLines.length > 0 && !existingPaymentEntryId) {
        await createJournalEntry({
          supabase,
          moduleId,
          recordId,
          invoice,
          eventKeys: [paymentEventKey],
          description: moduleId === 'invoices'
            ? `صدور خودکار سند دریافت وجه - ${invoiceLabel}`
            : `صدور خودکار سند پرداخت وجه - ${invoiceLabel}`,
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

    if (syncResult.createdJournalEntryIds.length > 0) {
      const lastJournalId = syncResult.createdJournalEntryIds[syncResult.createdJournalEntryIds.length - 1];
      const journalModule = MODULES.journal_entries;
      notifier?.success?.('سند حسابداری با موفقیت ایجاد شد.');
      navigate(`/${journalModule.table}/${lastJournalId}`);
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
