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
};

const toFiniteNumber = (value: unknown, fallback = 0) => {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
};

export const estimateAiUsageCharge = (
  usage: AiTokenUsage | null | undefined,
  pricing: AiModelPricing | null | undefined,
  fallbackMarginPercent = 30,
) => {
  const promptTokens = Math.max(0, toFiniteNumber(usage?.prompt_tokens));
  const completionTokens = Math.max(0, toFiniteNumber(usage?.completion_tokens));
  const inputUsdPer1m = Math.max(0, toFiniteNumber(pricing?.input_usd_per_1m));
  const outputUsdPer1m = Math.max(0, toFiniteNumber(pricing?.output_usd_per_1m));
  const exchangeRateIrt = Math.max(0, toFiniteNumber(pricing?.exchange_rate_irt));
  const marginPercent = Math.max(0, toFiniteNumber(pricing?.margin_percent, fallbackMarginPercent));
  const rawCostUsd = (promptTokens / 1_000_000) * inputUsdPer1m
    + (completionTokens / 1_000_000) * outputUsdPer1m;
  const rawCostIrt = rawCostUsd * exchangeRateIrt;
  const billedAmountIrt = rawCostIrt * (1 + marginPercent / 100);

  return {
    promptTokens,
    completionTokens,
    rawCostUsd,
    rawCostIrt,
    billedAmountIrt,
    marginPercent,
    exchangeRateIrt,
  };
};
