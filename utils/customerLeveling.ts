import type { SupabaseClient } from '@supabase/supabase-js';

type CustomerRank = 'normal' | 'silver' | 'gold' | 'vip';

type RankRule = {
  min_purchase_count: number;
  min_total_spend: number;
  min_acquaintance_days: number;
};

export type CustomerLevelingConfig = {
  enabled: boolean;
  eligible_statuses: string[];
  silver: RankRule;
  gold: RankRule;
  vip: RankRule;
};

const DEFAULT_LEVELING_CONFIG: CustomerLevelingConfig = {
  enabled: true,
  eligible_statuses: ['final', 'settled', 'completed'],
  silver: {
    min_purchase_count: 3,
    min_total_spend: 30000000,
    min_acquaintance_days: 30,
  },
  gold: {
    min_purchase_count: 8,
    min_total_spend: 120000000,
    min_acquaintance_days: 120,
  },
  vip: {
    min_purchase_count: 15,
    min_total_spend: 300000000,
    min_acquaintance_days: 365,
  },
};

type CustomerDerivedStats = {
  purchaseCount: number;
  totalSpend: number;
  totalPaidAmount: number;
  firstPurchaseDate: string | null;
  lastPurchaseDate: string | null;
  acquaintanceDays: number;
};

const LEVELING_INTEGRATION_KEY = 'customer_leveling_config';
const CUSTOMER_STAT_FIELDS = [
  'purchase_count',
  'total_spend',
  'total_paid_amount',
  'first_purchase_date',
  'last_purchase_date',
  'rank',
] as const;

const missingCustomerColumnsCache = new Set<string>();
let knownCustomerColumns: Set<string> | null = null;

const toNumber = (value: unknown, fallback = 0) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
};

const normalizeRule = (rule: any, fallback: RankRule): RankRule => ({
  min_purchase_count: Math.max(0, toNumber(rule?.min_purchase_count, fallback.min_purchase_count)),
  min_total_spend: Math.max(0, toNumber(rule?.min_total_spend, fallback.min_total_spend)),
  min_acquaintance_days: Math.max(0, toNumber(rule?.min_acquaintance_days, fallback.min_acquaintance_days)),
});

const parseMissingColumnFromError = (error: any): string | null => {
  const raw = String(error?.message || error?.details || error?.hint || '');
  if (!raw) return null;

  const patterns = [
    /column\s+["']?([a-zA-Z0-9_]+)["']?\s+of\s+relation/i,
    /Could not find the '([a-zA-Z0-9_]+)' column/i,
    /([a-zA-Z0-9_]+)\s+does not exist/i,
    /customers\.([a-zA-Z0-9_]+)/i,
  ];

  for (const pattern of patterns) {
    const match = raw.match(pattern);
    if (match?.[1]) return String(match[1]).trim();
  }
  return null;
};

const RECEIVED_PAYMENT_STATUSES = new Set([
  'received',
  'paid',
  'settled',
  'دریافت شده',
  'پرداخت شده',
  'تسویه شده',
]);

const isReceivedPaymentStatus = (status: unknown): boolean => {
  const normalized = String(status || '').trim().toLowerCase();
  return RECEIVED_PAYMENT_STATUSES.has(normalized);
};

export const normalizeLevelingConfig = (config: any): CustomerLevelingConfig => {
  if (!config || typeof config !== 'object') return DEFAULT_LEVELING_CONFIG;
  const statuses = Array.isArray(config.eligible_statuses)
    ? config.eligible_statuses.map((s: any) => String(s || '').trim()).filter(Boolean)
    : DEFAULT_LEVELING_CONFIG.eligible_statuses;

  return {
    enabled: config.enabled !== false,
    eligible_statuses: statuses.length ? statuses : DEFAULT_LEVELING_CONFIG.eligible_statuses,
    silver: normalizeRule(config.silver, DEFAULT_LEVELING_CONFIG.silver),
    gold: normalizeRule(config.gold, DEFAULT_LEVELING_CONFIG.gold),
    vip: normalizeRule(config.vip, DEFAULT_LEVELING_CONFIG.vip),
  };
};

export const getDefaultLevelingConfig = (): CustomerLevelingConfig => DEFAULT_LEVELING_CONFIG;

const extractLevelingConfig = (companySettingsRow: any): CustomerLevelingConfig => {
  const raw = companySettingsRow && typeof companySettingsRow === 'object'
    ? (companySettingsRow as any).customer_leveling_config
    : null;
  return normalizeLevelingConfig(raw);
};

const toDateOnly = (value: string | null | undefined): string | null => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
};

const getDiffInDays = (fromDateOnly: string | null): number => {
  if (!fromDateOnly) return 0;
  const from = new Date(`${fromDateOnly}T00:00:00Z`);
  if (Number.isNaN(from.getTime())) return 0;
  const now = new Date();
  const diffMs = now.getTime() - from.getTime();
  return diffMs > 0 ? Math.floor(diffMs / (24 * 60 * 60 * 1000)) : 0;
};

const meetsRule = (
  stats: { purchaseCount: number; totalSpend: number; acquaintanceDays: number },
  rule: RankRule
) => {
  return (
    stats.purchaseCount >= rule.min_purchase_count
    && stats.totalSpend >= rule.min_total_spend
    && stats.acquaintanceDays >= rule.min_acquaintance_days
  );
};

const computeRank = (
  stats: { purchaseCount: number; totalSpend: number; acquaintanceDays: number },
  config: CustomerLevelingConfig
): CustomerRank => {
  if (!config.enabled) return 'normal';
  if (meetsRule(stats, config.vip)) return 'vip';
  if (meetsRule(stats, config.gold)) return 'gold';
  if (meetsRule(stats, config.silver)) return 'silver';
  return 'normal';
};

const isMissingCustomerLevelingColumnError = (error: any) => {
  const raw = String(error?.message || error?.details || error?.hint || '');
  return error?.code === 'PGRST204' || /customer_leveling_config/i.test(raw);
};

const loadIntegrationLevelingConfig = async (supabase: SupabaseClient): Promise<CustomerLevelingConfig | null> => {
  const { data, error } = await supabase
    .from('integration_settings')
    .select('settings')
    .eq('connection_type', 'site')
    .maybeSingle();

  if (error) {
    const raw = String(error?.message || error?.details || '');
    if (error.code === 'PGRST116' || /integration_settings/i.test(raw)) return null;
    throw error;
  }

  const settings = data?.settings && typeof data.settings === 'object' ? data.settings : {};
  const config = (settings as any)?.[LEVELING_INTEGRATION_KEY];
  if (!config) return null;
  return normalizeLevelingConfig(config);
};

const saveIntegrationLevelingConfig = async (supabase: SupabaseClient, config: CustomerLevelingConfig) => {
  const normalized = normalizeLevelingConfig(config);
  const { data: existing } = await supabase
    .from('integration_settings')
    .select('id, provider, is_active, settings')
    .eq('connection_type', 'site')
    .maybeSingle();

  const mergedSettings = {
    ...(existing?.settings && typeof existing.settings === 'object' ? existing.settings : {}),
    [LEVELING_INTEGRATION_KEY]: normalized,
  };

  const payload: any = {
    connection_type: 'site',
    provider: existing?.provider || 'rest_api',
    is_active: existing?.is_active ?? true,
    settings: mergedSettings,
  };
  if (existing?.id) payload.id = existing.id;

  const { error } = await supabase
    .from('integration_settings')
    .upsert([payload], { onConflict: 'connection_type' });

  if (error) throw error;
};

export type CustomerLevelingConfigLoadResult = {
  config: CustomerLevelingConfig;
  source: 'company_settings' | 'integration_settings' | 'default';
  companyRecordId: string | null;
  hasCompanyLevelingColumn: boolean;
};

export const loadCustomerLevelingConfig = async (
  supabase: SupabaseClient
): Promise<CustomerLevelingConfigLoadResult> => {
  const { data, error } = await supabase
    .from('company_settings')
    .select('*')
    .limit(1)
    .maybeSingle();

  if (error && !isMissingCustomerLevelingColumnError(error)) {
    throw error;
  }

  const hasCompanyLevelingColumn = !!(data && Object.prototype.hasOwnProperty.call(data, 'customer_leveling_config'));
  const companyRecordId = data?.id ? String(data.id) : null;

  if (hasCompanyLevelingColumn) {
    return {
      config: extractLevelingConfig(data),
      source: 'company_settings',
      companyRecordId,
      hasCompanyLevelingColumn: true,
    };
  }

  const integrationConfig = await loadIntegrationLevelingConfig(supabase);
  if (integrationConfig) {
    return {
      config: integrationConfig,
      source: 'integration_settings',
      companyRecordId,
      hasCompanyLevelingColumn: false,
    };
  }

  return {
    config: DEFAULT_LEVELING_CONFIG,
    source: 'default',
    companyRecordId,
    hasCompanyLevelingColumn: false,
  };
};

export const saveCustomerLevelingConfig = async ({
  supabase,
  config,
  companyRecordId,
  preferCompanySettings,
}: {
  supabase: SupabaseClient;
  config: CustomerLevelingConfig;
  companyRecordId?: string | null;
  preferCompanySettings?: boolean;
}): Promise<{ source: 'company_settings' | 'integration_settings'; companyRecordId: string | null }> => {
  const normalized = normalizeLevelingConfig(config);

  if (preferCompanySettings !== false) {
    try {
      const payload = { customer_leveling_config: normalized };
      if (companyRecordId) {
        const { error } = await supabase.from('company_settings').update(payload).eq('id', companyRecordId);
        if (error) throw error;
        return { source: 'company_settings', companyRecordId };
      } else {
        const { data, error } = await supabase
          .from('company_settings')
          .insert([payload])
          .select('id')
          .maybeSingle();
        if (error) throw error;
        return { source: 'company_settings', companyRecordId: data?.id ? String(data.id) : null };
      }
    } catch (err: any) {
      if (!isMissingCustomerLevelingColumnError(err)) throw err;
    }
  }

  await saveIntegrationLevelingConfig(supabase, normalized);
  return { source: 'integration_settings', companyRecordId: null };
};

const loadCompanyLevelingConfig = async (supabase: SupabaseClient): Promise<CustomerLevelingConfig> => {
  const loaded = await loadCustomerLevelingConfig(supabase);
  return loaded.config;
};

export const calculateCustomerStatsFromInvoices = (
  invoiceRows: any[],
  config: CustomerLevelingConfig,
  customerCreatedAt?: string | null
): CustomerDerivedStats => {
  const allRows = Array.isArray(invoiceRows) ? invoiceRows : [];
  const eligibleRows = allRows.filter((row: any) => config.eligible_statuses.includes(String(row?.status || '')));

  const purchaseCount = eligibleRows.length;
  const totalSpend = eligibleRows.reduce((sum: number, row: any) => sum + toNumber(row?.total_invoice_amount), 0);
  const totalPaidAmount = allRows.reduce((sum: number, row: any) => {
    const payments = Array.isArray(row?.payments) ? row.payments : [];
    const received = payments.reduce((pSum: number, payment: any) => {
      if (!isReceivedPaymentStatus(payment?.status)) return pSum;
      return pSum + toNumber(payment?.amount);
    }, 0);
    return sum + received;
  }, 0);

  const dates = eligibleRows
    .map((row: any) => toDateOnly(row?.invoice_date || row?.created_at))
    .filter(Boolean) as string[];
  dates.sort((a, b) => a.localeCompare(b));

  const firstPurchaseDate = dates[0] || null;
  const lastPurchaseDate = dates[dates.length - 1] || null;
  const customerStartDate = toDateOnly(customerCreatedAt || null);
  const acquaintanceDays = getDiffInDays(customerStartDate || firstPurchaseDate);

  return {
    purchaseCount,
    totalSpend,
    totalPaidAmount,
    firstPurchaseDate,
    lastPurchaseDate,
    acquaintanceDays,
  };
};

const ensureKnownCustomerColumns = async (supabase: SupabaseClient, sampleCustomerId?: string) => {
  if (knownCustomerColumns) return;

  try {
    let query = supabase.from('customers').select('*').limit(1);
    if (sampleCustomerId) query = query.eq('id', sampleCustomerId);
    const { data, error } = await query.maybeSingle();
    if (error) return;
    if (!data || typeof data !== 'object') return;
    const keys = new Set(Object.keys(data));
    knownCustomerColumns = keys;
    CUSTOMER_STAT_FIELDS.forEach((field) => {
      if (!keys.has(field)) missingCustomerColumnsCache.add(field);
    });
  } catch {
    // ignore
  }
};

const stripMissingColumns = (payload: Record<string, any>) => {
  const next = { ...payload };
  missingCustomerColumnsCache.forEach((column) => {
    delete next[column];
  });
  return next;
};

export const syncCustomerLevelsByInvoiceCustomers = async ({
  supabase,
  customerIds,
}: {
  supabase: SupabaseClient;
  customerIds: Array<string | null | undefined>;
}) => {
  const ids = Array.from(new Set((customerIds || []).map((id) => String(id || '').trim()).filter(Boolean)));
  if (!ids.length) return;

  const config = await loadCompanyLevelingConfig(supabase);
  await ensureKnownCustomerColumns(supabase, ids[0]);
  const { data: customers, error: customersError } = await supabase
    .from('customers')
    .select('id, created_at')
    .in('id', ids);
  if (customersError) throw customersError;
  const customerCreatedAtById = new Map<string, string | null>(
    (customers || []).map((row: any) => [String(row.id), row?.created_at ? String(row.created_at) : null])
  );

  const { data: invoices, error: invoicesError } = await supabase
    .from('invoices')
    .select('customer_id, status, total_invoice_amount, invoice_date, created_at, payments')
    .in('customer_id', ids);

  if (invoicesError) throw invoicesError;

  const byCustomer = new Map<string, any[]>();
  ids.forEach((id) => byCustomer.set(id, []));

  (invoices || []).forEach((row: any) => {
    const id = String(row?.customer_id || '');
    if (!id || !byCustomer.has(id)) return;
    byCustomer.get(id)!.push(row);
  });

  for (const customerId of ids) {
    const stats = calculateCustomerStatsFromInvoices(
      byCustomer.get(customerId) || [],
      config,
      customerCreatedAtById.get(customerId) || null
    );
    const rank = computeRank(
      {
        purchaseCount: stats.purchaseCount,
        totalSpend: stats.totalSpend,
        acquaintanceDays: stats.acquaintanceDays,
      },
      config
    );

    const fullPayload: Record<string, any> = {
      purchase_count: stats.purchaseCount,
      total_spend: stats.totalSpend,
      total_paid_amount: stats.totalPaidAmount,
      first_purchase_date: stats.firstPurchaseDate,
      last_purchase_date: stats.lastPurchaseDate,
      rank,
    };

    let payload = stripMissingColumns(fullPayload);
    // اگر بعضی ستون‌ها هنوز در دیتابیس ساخته نشده‌اند، با حذف همان ستون ادامه بده.
    while (Object.keys(payload).length > 0) {
      const { error: updateError } = await supabase
        .from('customers')
        .update(payload)
        .eq('id', customerId);

      if (!updateError) break;

      const missingColumn = parseMissingColumnFromError(updateError);
      if (missingColumn && Object.prototype.hasOwnProperty.call(payload, missingColumn)) {
        missingCustomerColumnsCache.add(missingColumn);
        delete payload[missingColumn];
        payload = stripMissingColumns(payload);
        continue;
      }
      throw updateError;
    }
  }
};
