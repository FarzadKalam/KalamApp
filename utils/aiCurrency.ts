import { normalizeCurrencyConfig, type CurrencyCode, type CurrencyConfig } from './currency';
import { formatPersianNumberWithGrouping, formatPersianPrice } from './persianNumberFormatter';

export type AiCompanyCurrencyInput = {
  currency_code?: string | null;
  currency_label?: string | null;
  code?: CurrencyCode | string | null;
  label?: string | null;
} | null | undefined;

export const resolveAiCurrencyConfig = (
  company?: AiCompanyCurrencyInput,
  fallback?: CurrencyConfig | null,
): CurrencyConfig => {
  const companyCode = String(company?.currency_code ?? company?.code ?? '').trim();
  const companyLabel = company?.currency_label ?? company?.label ?? undefined;
  if (companyCode) {
    return normalizeCurrencyConfig({
      code: companyCode as CurrencyCode,
      label: companyLabel,
    });
  }
  if (fallback?.code) {
    return normalizeCurrencyConfig(fallback);
  }
  return normalizeCurrencyConfig({ code: 'IRT', label: 'تومان' });
};

/**
 * Converts a stored internal IRT amount (Toman base) to the tenant's display unit.
 * - IRT: 1x
 * - IRR: 10x (Toman -> Rial)
 * - USD: amountIrt / exchangeRateIrt when live exchange rate is provided
 * - EUR: kept as IRT integer unless USD/EUR conversion exists (paired with getAiDisplayCurrencyMeta label 'تومان')
 */
export const getAiDisplayCurrencyMeta = (
  company?: AiCompanyCurrencyInput,
  fallback?: CurrencyConfig | null,
  options?: { exchangeRateIrt?: number | null },
) => {
  const resolved = resolveAiCurrencyConfig(company, fallback);
  const rate = Number(options?.exchangeRateIrt || 0);
  if (resolved.code === 'IRR') {
    return {
      code: 'IRR' as CurrencyCode,
      label: resolved.label || 'ریال',
      multiplierFromIrt: 10,
      isUsdConverted: false,
      inputSupportsOrgUnit: true,
    };
  }
  if (resolved.code === 'USD' && Number.isFinite(rate) && rate > 0) {
    return {
      code: 'USD' as CurrencyCode,
      label: resolved.label || 'دلار',
      multiplierFromIrt: 1 / rate,
      isUsdConverted: true,
      inputSupportsOrgUnit: false,
    };
  }
  return {
    code: 'IRT' as CurrencyCode,
    label: resolved.code === 'IRT' ? (resolved.label || 'تومان') : 'تومان',
    multiplierFromIrt: 1,
    isUsdConverted: false,
    inputSupportsOrgUnit: resolved.code === 'IRT',
  };
};

export const convertIrtToDisplayAmount = (
  amountIrt: unknown,
  company?: AiCompanyCurrencyInput,
  fallback?: CurrencyConfig | null,
  options?: { exchangeRateIrt?: number | null },
): number => {
  const irt = Number(amountIrt || 0);
  if (!Number.isFinite(irt)) return 0;
  const meta = getAiDisplayCurrencyMeta(company, fallback, options);
  if (meta.isUsdConverted) {
    return Number((irt * meta.multiplierFromIrt).toFixed(4));
  }
  return Math.round(irt * meta.multiplierFromIrt);
};

/**
 * Converts an input amount entered in org currency (IRT or IRR) back to base IRT (Toman)
 * before persisting *_irt columns or initiating Zarinpal IRT topups.
 */
export const convertDisplayInputToIrt = (
  displayAmount: unknown,
  company?: AiCompanyCurrencyInput,
  fallback?: CurrencyConfig | null,
): number => {
  const value = Number(displayAmount || 0);
  if (!Number.isFinite(value) || value <= 0) return 0;
  const resolved = resolveAiCurrencyConfig(company, fallback);
  if (resolved.code === 'IRR') {
    return Math.round(value / 10);
  }
  return Math.round(value);
};

export const formatAiCurrencyFromIrt = (
  amountIrt: unknown,
  company?: AiCompanyCurrencyInput,
  fallback?: CurrencyConfig | null,
  options?: { exchangeRateIrt?: number | null },
): string => {
  const irt = Number(amountIrt || 0);
  if (!Number.isFinite(irt)) return '۰ تومان';
  const meta = getAiDisplayCurrencyMeta(company, fallback, options);
  if (meta.isUsdConverted) {
    const usd = Math.max(0, irt * meta.multiplierFromIrt);
    const digits = usd > 0 && usd < 0.01 ? 4 : 2;
    return `$${usd.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: 4 })}`;
  }
  const scaled = Math.round(irt * meta.multiplierFromIrt);
  return `${formatPersianPrice(scaled)} ${meta.label}`;
};

export const formatAiIrtAmount = (amountIrt: unknown): string => {
  const irt = Number(amountIrt || 0);
  if (!Number.isFinite(irt)) return '۰ تومان';
  return `${formatPersianNumberWithGrouping(Math.round(irt), 0)} تومان`;
};
