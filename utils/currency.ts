import { useEffect, useState } from 'react';
import { BRANDING_UPDATED_EVENT } from '../theme/brandTheme';

export type CurrencyCode = 'IRT' | 'IRR' | 'USD' | 'EUR';

export type CurrencyConfig = {
  code: CurrencyCode;
  label: string;
};

export const CURRENCY_UPDATED_EVENT = 'erp:currency-updated';
export const CURRENCY_STORAGE_KEY = 'erp:currency-config';

export const CURRENCY_OPTIONS: Array<{ value: CurrencyCode; label: string }> = [
  { value: 'IRT', label: 'تومان' },
  { value: 'IRR', label: 'ریال' },
  { value: 'USD', label: 'دلار' },
  { value: 'EUR', label: 'یورو' },
];

export const DEFAULT_CURRENCY: CurrencyConfig = {
  code: 'IRT',
  label: 'تومان',
};

const isCurrencyCode = (value: any): value is CurrencyCode =>
  ['IRT', 'IRR', 'USD', 'EUR'].includes(String(value || '').toUpperCase());

const resolveCurrencyLabel = (code: CurrencyCode, label?: string | null) => {
  const normalizedLabel = String(label || '').trim();
  if (normalizedLabel) return normalizedLabel;
  return CURRENCY_OPTIONS.find((opt) => opt.value === code)?.label || DEFAULT_CURRENCY.label;
};

export const normalizeCurrencyConfig = (input?: Partial<CurrencyConfig> | null): CurrencyConfig => {
  const candidateCode = String(input?.code || '').trim().toUpperCase();
  const code: CurrencyCode = isCurrencyCode(candidateCode) ? candidateCode : DEFAULT_CURRENCY.code;
  return {
    code,
    label: resolveCurrencyLabel(code, input?.label),
  };
};

export const readCurrencyConfig = (): CurrencyConfig => {
  if (typeof window === 'undefined') return DEFAULT_CURRENCY;
  try {
    const raw = window.localStorage.getItem(CURRENCY_STORAGE_KEY);
    if (!raw) return DEFAULT_CURRENCY;
    const parsed = JSON.parse(raw);
    return normalizeCurrencyConfig(parsed);
  } catch {
    return DEFAULT_CURRENCY;
  }
};

export const persistCurrencyConfig = (input?: Partial<CurrencyConfig> | null) => {
  if (typeof window === 'undefined') return;
  const normalized = normalizeCurrencyConfig(input);
  window.localStorage.setItem(CURRENCY_STORAGE_KEY, JSON.stringify(normalized));
  window.dispatchEvent(new CustomEvent(CURRENCY_UPDATED_EVENT));
};

export const useCurrencyConfig = () => {
  const [currency, setCurrency] = useState<CurrencyConfig>(() => readCurrencyConfig());

  useEffect(() => {
    const reload = () => setCurrency(readCurrencyConfig());
    window.addEventListener(CURRENCY_UPDATED_EVENT, reload);
    window.addEventListener(BRANDING_UPDATED_EVENT, reload as EventListener);
    window.addEventListener('storage', reload);
    return () => {
      window.removeEventListener(CURRENCY_UPDATED_EVENT, reload);
      window.removeEventListener(BRANDING_UPDATED_EVENT, reload as EventListener);
      window.removeEventListener('storage', reload);
    };
  }, []);

  return currency;
};

