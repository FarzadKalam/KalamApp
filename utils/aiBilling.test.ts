import { describe, expect, it } from 'vitest';
import { estimateAiUsageCharge } from './aiBilling';
import {
  estimateAiChargeCore,
  extractAvalaiTransactionCostCore,
  extractProviderCostInIrt,
  extractProviderExchangeRateIrt,
  formatAiAmountForOrg,
  mergeChatCostParts,
  normalizeAvalaiCreditPayload,
} from '../supabase/functions/_shared/ai-billing';
import {
  convertDisplayInputToIrt,
  convertIrtToDisplayAmount,
  formatAiCurrencyFromIrt,
  getAiDisplayCurrencyMeta,
} from './aiCurrency';

describe('estimateAiUsageCharge', () => {
  it('converts model token cost to IRT and applies margin', () => {
    const result = estimateAiUsageCharge(
      { prompt_tokens: 1_000_000, completion_tokens: 500_000 },
      {
        input_usd_per_1m: 0.15,
        output_usd_per_1m: 0.6,
        exchange_rate_irt: 60_000,
        margin_percent: 30,
      },
    );

    expect(result.rawCostUsd).toBeCloseTo(0.45);
    expect(result.rawCostIrt).toBeCloseTo(27_000);
    expect(result.billedAmountIrt).toBeCloseTo(35_100);
  });

  it('uses the default margin when model pricing has no margin', () => {
    const result = estimateAiUsageCharge(
      { prompt_tokens: 1_000_000, completion_tokens: 0 },
      { input_usd_per_1m: 1, output_usd_per_1m: 0, exchange_rate_irt: 50_000 },
      25,
    );

    expect(result.marginPercent).toBe(25);
    expect(result.rawCostIrt).toBeCloseTo(50_000);
    expect(result.billedAmountIrt).toBeCloseTo(62_500);
  });

  it('prefers live AvalAI exchange rate over legacy catalog rates unless manual override is set', () => {
    const autoCatalogResult = estimateAiChargeCore(
      { usage: { prompt_tokens: 1_000_000, completion_tokens: 0 } },
      {
        provider: 'avalai',
        input_usd_per_1m: 0.1,
        output_usd_per_1m: 0,
        exchange_rate_irt: 115_000,
        margin_percent: 30,
      },
      { liveExchangeRateIrt: 273_650 },
    );

    expect(autoCatalogResult.exchangeRate).toBe(273_650);
    expect(autoCatalogResult.exchangeRateSource).toBe('avalai_live');
    expect(autoCatalogResult.rawCostIrt).toBe(27_365);

    const manualCatalogResult = estimateAiChargeCore(
      { usage: { prompt_tokens: 1_000_000, completion_tokens: 0 } },
      {
        provider: 'avalai',
        input_usd_per_1m: 0.1,
        output_usd_per_1m: 0,
        exchange_rate_irt: 195_000,
        margin_percent: 30,
        metadata: { override_exchange_rate: true },
      },
      { liveExchangeRateIrt: 273_650 },
    );

    expect(manualCatalogResult.exchangeRate).toBe(195_000);
    expect(manualCatalogResult.exchangeRateSource).toBe('catalog_manual');
  });

  it('prefers provider inline rate and falls back cleanly when no rate is known (never hardcoded 115000)', () => {
    const withProviderCost = estimateAiChargeCore(
      {
        usage: { prompt_tokens: 1000, completion_tokens: 500 },
        cost: { unit: 0.1868885, irt: 50_880.39, exchange_rate: 272_250 },
      },
      { provider: 'avalai', input_usd_per_1m: 0, output_usd_per_1m: 0, exchange_rate_irt: 0, margin_percent: 30 },
      { liveExchangeRateIrt: 273_650 },
    );

    expect(withProviderCost.exchangeRate).toBe(272_250);
    expect(withProviderCost.exchangeRateSource).toBe('provider_response');
    expect(withProviderCost.rawCostIrt).toBe(50_881);

    const unavailableRate = estimateAiChargeCore(
      { usage: { prompt_tokens: 100_000, completion_tokens: 0 } },
      { provider: 'avalai', input_usd_per_1m: 1, output_usd_per_1m: 0, exchange_rate_irt: 0 },
    );

    expect(unavailableRate.exchangeRate).toBe(0);
    expect(unavailableRate.exchangeRateSource).toBe('unavailable');
    expect(unavailableRate.rawCostIrt).toBe(0);
  });
});

describe('AvalAI Rial vs Toman & payload normalization', () => {
  it('converts Rial amounts and rates to Toman without mixing units', () => {
    expect(extractProviderCostInIrt({ rial: 500_000 })).toBe(50_000);
    expect(extractProviderCostInIrt({ irt: 50_000, rial: 500_000 })).toBe(50_000);
    expect(extractProviderExchangeRateIrt({ exchange_rate: 2_736_500, exchange_rate_currency: 'IRR' })).toBe(273_650);
    expect(extractProviderExchangeRateIrt({ exchange_rate: 273_650 })).toBe(273_650);

    const normalizedCredit = normalizeAvalaiCreditPayload({
      remaining_irt: 800_000,
      remaining_unit: 2.9234,
      total_unit: 10,
      limit: 10,
      exchange_rate: 273_650,
    });
    expect(normalizedCredit.toman).toBe(800_000);
    expect(normalizedCredit.irt).toBe(800_000);
    expect(normalizedCredit.rial).toBeNull();
    expect(normalizedCredit.exchangeRate).toBe(273_650);
    expect(normalizedCredit.remainingUnit).toBeCloseTo(2.9234);

    const rialOnlyCredit = normalizeAvalaiCreditPayload({
      remaining_rial: 8_000_000,
      exchange_rate_rial: 2_736_500,
    });
    expect(rialOnlyCredit.toman).toBe(800_000);
    expect(rialOnlyCredit.rial).toBe(8_000_000);
    expect(rialOnlyCredit.exchangeRate).toBe(273_650);
  });

  it('extracts transaction cost and merges streaming cost chunks without summing exchange_rate', () => {
    const tx = extractAvalaiTransactionCostCore({
      results: [{ cost: { unit: 0.02, rial: 54_730 } }],
    });
    expect(tx.rawCostUnit).toBeCloseTo(0.02);
    expect(tx.rawCostIrt).toBe(5_473);
    expect(tx.exchangeRate).toBeCloseTo(273_650);

    const merged = mergeChatCostParts([
      { unit: 0.01, irt: 2736.5, exchange_rate: 273_650 },
      { unit: 0.02, irt: 5473, exchange_rate: 273_650 },
    ]);
    expect(merged?.unit).toBeCloseTo(0.03);
    expect(merged?.irt).toBeCloseTo(8209.5);
    expect(merged?.exchange_rate).toBe(273_650);
  });
});

describe('multi-org AI currency helpers', () => {
  it('scales IRT values cleanly for IRR (x10) and USD (live rate) organizations', () => {
    expect(convertIrtToDisplayAmount(15_000, { currency_code: 'IRR', currency_label: 'ریال' })).toBe(150_000);
    expect(convertDisplayInputToIrt(150_000, { currency_code: 'IRR', currency_label: 'ریال' })).toBe(15_000);

    expect(convertIrtToDisplayAmount(15_000, { currency_code: 'IRT', currency_label: 'تومان' })).toBe(15_000);
    expect(convertDisplayInputToIrt(15_000, { currency_code: 'IRT', currency_label: 'تومان' })).toBe(15_000);

    expect(formatAiCurrencyFromIrt(15_000, { currency_code: 'IRR', currency_label: 'ریال' })).toContain('ریال');
    expect(formatAiCurrencyFromIrt(15_000, { currency_code: 'IRR', currency_label: 'ریال' })).toContain('۱۵۰٬۰۰۰');
    expect(formatAiCurrencyFromIrt(273_650, { currency_code: 'USD' }, null, { exchangeRateIrt: 273_650 })).toBe('$1.00');
    expect(formatAiAmountForOrg(30_000, { currency_code: 'IRR', currency_label: 'ریال' })).toContain('۳۰۰٬۰۰۰');
    expect(getAiDisplayCurrencyMeta({ currency_code: 'EUR', currency_label: 'یورو' }).label).toBe('تومان');
  });
});
