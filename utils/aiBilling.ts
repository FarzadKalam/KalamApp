import { estimateAiChargeCore } from '../supabase/functions/_shared/ai-billing';

export type AiTokenUsage = {
  prompt_tokens?: number | null;
  completion_tokens?: number | null;
  total_tokens?: number | null;
};

export type AiModelPricing = {
  input_usd_per_1m?: number | null;
  output_usd_per_1m?: number | null;
  exchange_rate_irt?: number | null;
  margin_percent?: number | null;
  pricing_source?: string | null;
  provider?: string | null;
  metadata?: Record<string, any> | null;
};

const toFiniteNumber = (value: unknown, fallback = 0) => {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
};

export const estimateAiUsageCharge = (
  usage: AiTokenUsage | null | undefined,
  pricing: AiModelPricing | null | undefined,
  fallbackMarginPercent = 30,
  liveExchangeRateIrt?: number | null,
) => {
  const promptTokens = Math.max(0, toFiniteNumber(usage?.prompt_tokens));
  const completionTokens = Math.max(0, toFiniteNumber(usage?.completion_tokens));
  const inputUsdPer1m = Math.max(0, toFiniteNumber(pricing?.input_usd_per_1m));
  const outputUsdPer1m = Math.max(0, toFiniteNumber(pricing?.output_usd_per_1m));
  const result = estimateAiChargeCore(
    { usage: { prompt_tokens: promptTokens, completion_tokens: completionTokens } },
    pricing,
    {
      fallbackMargin: fallbackMarginPercent,
      liveExchangeRateIrt,
    },
  );
  const rawCostUsd = (promptTokens / 1_000_000) * inputUsdPer1m
    + (completionTokens / 1_000_000) * outputUsdPer1m;

  return {
    promptTokens,
    completionTokens,
    rawCostUsd,
    rawCostIrt: rawCostUsd * result.exchangeRate,
    billedAmountIrt: (rawCostUsd * result.exchangeRate) * (1 + result.marginPercent / 100),
    marginPercent: result.marginPercent,
    exchangeRateIrt: result.exchangeRate,
    exchangeRateSource: result.exchangeRateSource,
  };
};
