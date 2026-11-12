export type SupportedAiCurrencyCode = 'IRT' | 'IRR' | 'USD' | 'EUR';

export type NormalizedAvalaiCredit = {
  value: number | null;
  currency: string | null;
  irt: number | null;
  toman: number | null;
  rial: number | null;
  token: number | null;
  unitCredit: number | null;
  remainingUnit: number | null;
  totalUnit: number | null;
  limit: number | null;
  exchangeRate: number | null;
  raw: unknown;
};

export type AiChargeEstimate = {
  rawCostUnit: number;
  rawCostIrt: number;
  billedAmountIrt: number;
  marginPercent: number;
  exchangeRate: number;
  exchangeRateSource: 'provider_response' | 'inferred_from_provider_cost' | 'avalai_live' | 'catalog_manual' | 'ledger_history' | 'unavailable';
};

export const toFiniteBillingNumber = (value: unknown, fallback = 0): number => {
  if (value === null || value === undefined || value === '') return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const toPositiveBillingNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const toNonNegativeBillingNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
};

const pickFirstPositive = (...values: unknown[]): number | null => {
  for (const val of values) {
    const parsed = toPositiveBillingNumber(val);
    if (parsed !== null) return parsed;
  }
  return null;
};

const pickFirstNonNegative = (...values: unknown[]): number | null => {
  for (const val of values) {
    const parsed = toNonNegativeBillingNumber(val);
    if (parsed !== null) return parsed;
  }
  return null;
};

const normalizeRawCurrencyTag = (value: unknown): string => {
  const raw = String(value ?? '').trim().toUpperCase();
  if (raw === 'IRR' || raw === 'RIAL' || raw === 'RIALS' || raw.includes('ریال')) return 'IRR';
  if (raw === 'IRT' || raw === 'TOMAN' || raw === 'TOMANS' || raw === 'TMN' || raw.includes('تومان')) return 'IRT';
  if (raw === 'USD' || raw === '$') return 'USD';
  if (raw === 'EUR' || raw === '€') return 'EUR';
  return raw;
};

export const normalizeOrgCurrencyCode = (
  currencyCode?: string | null,
  currencyLabel?: string | null,
): SupportedAiCurrencyCode => {
  const normalized = normalizeRawCurrencyTag(currencyCode);
  if (normalized === 'IRR' || normalized === 'IRT' || normalized === 'USD' || normalized === 'EUR') {
    return normalized;
  }
  const fromLabel = normalizeRawCurrencyTag(currencyLabel);
  if (fromLabel === 'IRR') return 'IRR';
  return 'IRT';
};

export const resolveOrgCurrencyLabel = (
  currencyCode?: string | null,
  currencyLabel?: string | null,
): string => {
  const code = normalizeOrgCurrencyCode(currencyCode, currencyLabel);
  const cleanedLabel = String(currencyLabel || '').trim();
  if (code === 'IRR') return cleanedLabel || 'ریال';
  if (code === 'USD') return cleanedLabel || 'دلار';
  if (code === 'EUR') return cleanedLabel || 'یورو';
  return cleanedLabel || 'تومان';
};

export const convertIrtToOrgDisplayAmount = (
  amountIrt: unknown,
  currencyCode?: string | null,
  options?: { exchangeRateIrt?: number | null },
): number => {
  const irt = toFiniteBillingNumber(amountIrt, 0);
  const code = normalizeOrgCurrencyCode(currencyCode);
  if (code === 'IRR') return Math.round(irt * 10);
  if (code === 'USD') {
    const rate = toPositiveBillingNumber(options?.exchangeRateIrt);
    if (rate) return Number((irt / rate).toFixed(4));
  }
  return Math.round(irt);
};

export const formatAiAmountForOrg = (
  amountIrt: unknown,
  company?: { currency_code?: string | null; currency_label?: string | null } | null,
  options?: { exchangeRateIrt?: number | null },
): string => {
  const irt = toFiniteBillingNumber(amountIrt, 0);
  const code = normalizeOrgCurrencyCode(company?.currency_code, company?.currency_label);
  const label = resolveOrgCurrencyLabel(code, company?.currency_label);
  if (code === 'IRR') {
    return `${Math.round(irt * 10).toLocaleString('fa-IR', { maximumFractionDigits: 0 })} ${label}`;
  }
  if (code === 'USD') {
    const rate = toPositiveBillingNumber(options?.exchangeRateIrt);
    if (rate) {
      const usd = irt / rate;
      return `$${usd.toLocaleString('en-US', { minimumFractionDigits: usd > 0 && usd < 0.01 ? 4 : 2, maximumFractionDigits: 4 })}`;
    }
    return `${Math.round(irt).toLocaleString('fa-IR', { maximumFractionDigits: 0 })} تومان`;
  }
  if (code === 'EUR') {
    // Backend ledger stores IRT without a live EUR conversion rate; stay honest with Toman.
    return `${Math.round(irt).toLocaleString('fa-IR', { maximumFractionDigits: 0 })} تومان`;
  }
  return `${Math.round(irt).toLocaleString('fa-IR', { maximumFractionDigits: 0 })} ${label}`;
};

export const extractProviderCostInIrt = (cost: Record<string, any> = {}, parent: Record<string, any> = {}): number | null => {
  const currencyTag = normalizeRawCurrencyTag(cost?.currency ?? parent?.currency);

  const explicitToman = pickFirstNonNegative(
    cost?.irt,
    cost?.toman,
    cost?.tomans,
    cost?.amount_irt,
    cost?.amount_toman,
    cost?.cost_irt,
    cost?.cost_toman,
    parent?.cost_irt,
    parent?.amount_irt,
    parent?.toman,
    currencyTag === 'IRT' ? (cost?.amount ?? cost?.cost ?? parent?.amount) : null,
  );
  if (explicitToman !== null) return explicitToman;

  const explicitRial = pickFirstNonNegative(
    cost?.rial,
    cost?.rials,
    cost?.amount_rial,
    cost?.cost_rial,
    parent?.cost_rial,
    parent?.amount_rial,
    parent?.rial,
    currencyTag === 'IRR' ? (cost?.amount ?? cost?.cost ?? parent?.amount) : null,
  );
  if (explicitRial !== null) {
    return explicitRial / 10;
  }

  return null;
};

export const extractProviderExchangeRateIrt = (
  cost: Record<string, any> = {},
  parent: Record<string, any> = {},
): number | null => {
  const rateCurrency = normalizeRawCurrencyTag(
    cost?.exchange_rate_currency ?? parent?.exchange_rate_currency,
  );

  const explicitTomanRate = pickFirstPositive(
    cost?.exchange_rate_irt,
    cost?.exchangeRateIrt,
    cost?.usd_to_irt,
    parent?.exchange_rate_irt,
    parent?.exchangeRateIrt,
    rateCurrency !== 'IRR' ? (cost?.exchange_rate ?? cost?.exchangeRate ?? parent?.exchange_rate ?? parent?.exchangeRate) : null,
  );
  if (explicitTomanRate !== null) return explicitTomanRate;

  const explicitRialRate = pickFirstPositive(
    cost?.exchange_rate_rial,
    parent?.exchange_rate_rial,
    rateCurrency === 'IRR' ? (cost?.exchange_rate ?? cost?.exchangeRate ?? parent?.exchange_rate ?? parent?.exchangeRate) : null,
  );
  if (explicitRialRate !== null) {
    return explicitRialRate / 10;
  }

  return null;
};

export const normalizeAvalaiCreditPayload = (payload: any): NormalizedAvalaiCredit => {
  const flat = payload && typeof payload === 'object' ? payload : { value: payload };
  const data = flat?.data && typeof flat.data === 'object' ? flat.data : {};
  const wallet = flat?.wallet && typeof flat.wallet === 'object' ? flat.wallet : {};
  const balance = flat?.balance && typeof flat.balance === 'object' ? flat.balance : {};
  const currency = flat.currency || data.currency || balance.currency || null;
  const currencyTag = normalizeRawCurrencyTag(currency);

  const candidates = [
    flat.remaining_irt,
    flat.toman,
    flat.irt,
    flat.balance,
    flat.credit,
    flat.credits,
    flat.remaining,
    flat.remaining_credit,
    flat.total_available,
    data.remaining_irt,
    data.toman,
    data.irt,
    data.balance,
    data.credit,
    data.remaining,
    wallet.balance,
    wallet.credit,
    balance.value,
    balance.amount,
  ].filter((item) => item !== null && item !== undefined && item !== '');

  const explicitToman = pickFirstNonNegative(
    flat.toman,
    flat.tomans,
    flat.irt,
    flat.remaining_irt,
    flat.amount_irt,
    flat.amount_toman,
    flat.remaining_toman,
    data.toman,
    data.tomans,
    data.irt,
    data.remaining_irt,
    data.amount_irt,
    data.amount_toman,
    data.remaining_toman,
    wallet.toman,
    wallet.irt,
    wallet.remaining_irt,
    balance.toman,
    balance.irt,
    currencyTag === 'IRT' ? (flat.balance ?? flat.remaining ?? flat.credit ?? data.balance ?? data.remaining) : null,
  );

  const explicitRial = pickFirstNonNegative(
    flat.rial,
    flat.rials,
    flat.amount_rial,
    flat.remaining_rial,
    data.rial,
    data.rials,
    data.amount_rial,
    data.remaining_rial,
    wallet.rial,
    wallet.remaining_rial,
    balance.rial,
    currencyTag === 'IRR' ? (flat.balance ?? flat.remaining ?? flat.credit ?? data.balance ?? data.remaining) : null,
  );

  const normalizedIrt = explicitToman !== null
    ? explicitToman
    : (explicitRial !== null ? explicitRial / 10 : null);

  const remainingUnit = pickFirstNonNegative(
    flat.remaining_unit,
    flat.remainingUnit,
    data.remaining_unit,
    data.remainingUnit,
    wallet.remaining_unit,
  );
  const totalUnit = pickFirstNonNegative(
    flat.total_unit,
    flat.totalUnit,
    data.total_unit,
    data.totalUnit,
    wallet.total_unit,
  );
  const limit = pickFirstNonNegative(flat.limit, data.limit, wallet.limit);
  const token = pickFirstNonNegative(
    flat.token,
    flat.tokens,
    flat.remaining_tokens,
    flat.credit_tokens,
    data.token,
    data.tokens,
    data.remaining_tokens,
    wallet.tokens,
    balance.tokens,
  );
  const unitCredit = pickFirstNonNegative(
    flat.remaining_unit,
    flat.total_unit,
    flat.unit_credit,
    flat.unit,
    flat.credit_unit,
    data.remaining_unit,
    data.total_unit,
    data.unit_credit,
    data.unit,
    wallet.unit_credit,
  );

  const directExchangeRate = extractProviderExchangeRateIrt(flat, data);
  const inferredExchangeRate = directExchangeRate === null
    && normalizedIrt !== null
    && remainingUnit !== null
    && remainingUnit > 0
    ? Number((normalizedIrt / remainingUnit).toFixed(2))
    : null;

  return {
    value: toNonNegativeBillingNumber(candidates[0]) ?? normalizedIrt,
    currency: currency ? String(currency) : (normalizedIrt !== null ? 'IRT' : null),
    irt: normalizedIrt,
    toman: normalizedIrt,
    rial: explicitRial,
    token,
    unitCredit,
    remainingUnit,
    totalUnit,
    limit,
    exchangeRate: directExchangeRate ?? (inferredExchangeRate && inferredExchangeRate > 0 ? inferredExchangeRate : null),
    raw: payload,
  };
};

export const estimateAiChargeCore = (
  usageMetadata: any,
  pricing: any,
  options?: {
    fallbackMargin?: number;
    liveExchangeRateIrt?: number | null;
    ledgerFallbackExchangeRateIrt?: number | null;
  },
): AiChargeEstimate => {
  const usage = usageMetadata?.usage && typeof usageMetadata.usage === 'object' ? usageMetadata.usage : {};
  const cost = usageMetadata?.cost && typeof usageMetadata.cost === 'object' ? usageMetadata.cost : {};

  const promptTokens = Math.max(
    0,
    toFiniteBillingNumber(usage.prompt_tokens ?? usage.prompt ?? usage.input_tokens ?? usage.input, 0),
  );
  const completionTokens = Math.max(
    0,
    toFiniteBillingNumber(usage.completion_tokens ?? usage.completion ?? usage.output_tokens ?? usage.output, 0),
  );

  const rawUnitFromProvider = pickFirstNonNegative(cost.unit, cost.usd, cost.cost_usd, cost.amount_usd);
  const rawIrtFromProvider = extractProviderCostInIrt(cost, usageMetadata || {});
  const providerExchangeRate = extractProviderExchangeRateIrt(cost, usageMetadata || {});

  const fallbackMargin = toFiniteBillingNumber(options?.fallbackMargin, 30);
  const marginPercent = Math.max(0, toFiniteBillingNumber(pricing?.margin_percent, fallbackMargin));
  const inputRate = Math.max(0, toFiniteBillingNumber(pricing?.input_usd_per_1m, 0));
  const outputRate = Math.max(0, toFiniteBillingNumber(pricing?.output_usd_per_1m, 0));
  const specificCostUsd = Math.max(0, toFiniteBillingNumber(pricing?.specific_cost_usd, 0));

  const tokenUsdCost = (promptTokens * inputRate + completionTokens * outputRate) / 1_000_000;
  const estimatedUnit = rawUnitFromProvider !== null
    ? rawUnitFromProvider
    : (tokenUsdCost > 0 ? tokenUsdCost : specificCostUsd);

  const inferredRateFromCost = rawIrtFromProvider !== null && rawIrtFromProvider > 0 && estimatedUnit > 0
    ? Number((rawIrtFromProvider / estimatedUnit).toFixed(2))
    : null;

  const liveRate = toPositiveBillingNumber(options?.liveExchangeRateIrt);
  const catalogOverrideAllowed = Boolean(
    pricing?.metadata?.override_exchange_rate === true
    || String(pricing?.pricing_source || '').trim() === 'manual_exchange_rate'
    || (pricing?.provider && String(pricing.provider).trim().toLowerCase() !== 'avalai'),
  );
  const catalogPositiveRate = toPositiveBillingNumber(pricing?.exchange_rate_irt);
  const ledgerFallbackRate = toPositiveBillingNumber(options?.ledgerFallbackExchangeRateIrt);

  let exchangeRate = 0;
  let exchangeRateSource: AiChargeEstimate['exchangeRateSource'] = 'unavailable';

  if (providerExchangeRate !== null) {
    exchangeRate = providerExchangeRate;
    exchangeRateSource = 'provider_response';
  } else if (inferredRateFromCost !== null && inferredRateFromCost > 0) {
    exchangeRate = inferredRateFromCost;
    exchangeRateSource = 'inferred_from_provider_cost';
  } else if (catalogOverrideAllowed && catalogPositiveRate !== null) {
    exchangeRate = catalogPositiveRate;
    exchangeRateSource = 'catalog_manual';
  } else if (liveRate !== null) {
    exchangeRate = liveRate;
    exchangeRateSource = 'avalai_live';
  } else if (ledgerFallbackRate !== null) {
    exchangeRate = ledgerFallbackRate;
    exchangeRateSource = 'ledger_history';
  } else if (catalogPositiveRate !== null) {
    exchangeRate = catalogPositiveRate;
    exchangeRateSource = 'catalog_manual';
  }

  const rawCostIrt = rawIrtFromProvider !== null
    ? rawIrtFromProvider
    : Math.max(0, estimatedUnit * exchangeRate);
  const billedAmountIrt = Math.ceil(Math.max(0, rawCostIrt) * (1 + Math.max(0, marginPercent) / 100));

  return {
    rawCostUnit: Number(Math.max(0, estimatedUnit).toFixed(10)),
    rawCostIrt: Math.ceil(Math.max(0, rawCostIrt)),
    billedAmountIrt,
    marginPercent,
    exchangeRate,
    exchangeRateSource,
  };
};

export const extractAvalaiTransactionCostCore = (
  payload: any,
  fallbackExchangeRateIrt = 0,
) => {
  const candidates = Array.isArray(payload?.transactions)
    ? payload.transactions
    : Array.isArray(payload?.data)
    ? payload.data
    : Array.isArray(payload?.results)
    ? payload.results
    : [];
  const first = (candidates[0] || payload?.transaction || payload?.data || payload || {}) as Record<string, any>;
  const cost = (first?.cost || first?.estimated_cost || first?.billing || first?.amount || first?.charge || {}) as Record<string, any>;

  const rawUnit = pickFirstNonNegative(
    cost?.unit,
    cost?.usd,
    cost?.amount_usd,
    first?.cost_unit,
    first?.cost_usd,
    first?.amount_usd,
  );
  const rawIrt = extractProviderCostInIrt(cost, first);
  const explicitRate = extractProviderExchangeRateIrt(cost, first);
  const inferredRate = explicitRate === null && rawIrt !== null && rawIrt > 0 && rawUnit !== null && rawUnit > 0
    ? Number((rawIrt / rawUnit).toFixed(2))
    : null;
  const exchangeRate = explicitRate
    ?? (inferredRate && inferredRate > 0 ? inferredRate : null)
    ?? toPositiveBillingNumber(fallbackExchangeRateIrt)
    ?? 0;

  return {
    rawCostUnit: rawUnit !== null ? Number(rawUnit.toFixed(10)) : null,
    rawCostIrt: rawIrt !== null ? Math.ceil(rawIrt) : null,
    exchangeRate,
    raw: payload,
  };
};

const NON_ADDITIVE_COST_RATE_KEYS = new Set([
  'exchange_rate',
  'exchange_rate_irt',
  'exchange_rate_rial',
  'exchangeRate',
  'exchangeRateIrt',
  'usd_to_irt',
  'rate',
]);

export const mergeChatCostParts = (costParts: Array<Record<string, any> | null | undefined>) => {
  const merged: Record<string, any> = {};
  for (const part of costParts) {
    if (!part || typeof part !== 'object') continue;
    for (const [key, value] of Object.entries(part)) {
      if (value === null || value === undefined || value === '') continue;
      if (key === 'currency' || key === 'exchange_rate_currency') {
        merged[key] = value;
        continue;
      }
      const num = Number(value);
      if (!Number.isFinite(num)) continue;
      if (NON_ADDITIVE_COST_RATE_KEYS.has(key)) {
        if (num > 0) merged[key] = num;
      } else {
        merged[key] = Number(merged[key] || 0) + num;
      }
    }
  }
  return Object.keys(merged).length > 0 ? merged : null;
};
