import { describe, expect, it } from 'vitest';
import { estimateAiUsageCharge } from './aiBilling';

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
});
