import { describe, expect, it } from 'vitest';
import {
  calculateSmsEstimatedCost,
  containsSmsOptOutPhrase,
  estimateSmsPages,
  normalizeCampaignSenderNumbers,
} from './campaignUtils';

describe('campaignUtils', () => {
  it('normalizes Persian and Arabic sender lines and removes duplicates', () => {
    expect(normalizeCampaignSenderNumbers(['۵۰۰۰۱', '50001', '٠٩١٢-123-4567', 'bad']))
      .toEqual(['50001', '09121234567']);
  });

  it('detects common opt-out phrase variants', () => {
    expect(containsSmsOptOutPhrase('لطفاً لغو ۱۱')).toBe(true);
    expect(containsSmsOptOutPhrase('لغو-١١')).toBe(true);
    expect(containsSmsOptOutPhrase('ادامه متن')).toBe(false);
  });

  it('uses Unicode SMS segmentation for Persian text', () => {
    expect(estimateSmsPages('ا'.repeat(70)).pages).toBe(1);
    expect(estimateSmsPages('ا'.repeat(71)).pages).toBe(2);
    expect(estimateSmsPages('ا'.repeat(135)).pages).toBe(3);
  });

  it('uses GSM segmentation and counts extended characters twice', () => {
    expect(estimateSmsPages('a'.repeat(160))).toMatchObject({ encoding: 'gsm', pages: 1 });
    expect(estimateSmsPages('a'.repeat(161))).toMatchObject({ encoding: 'gsm', pages: 2 });
    expect(estimateSmsPages('^'.repeat(81))).toMatchObject({ encoding: 'gsm', length: 162, pages: 2 });
  });

  it('calculates estimated SMS cost with VAT safely', () => {
    expect(calculateSmsEstimatedCost({ costPerPage: 100, audienceCount: 10, pages: 2, vatPercent: 10 }))
      .toBe(2200);
    expect(calculateSmsEstimatedCost({ costPerPage: -1, audienceCount: 10, pages: 2, vatPercent: 10 }))
      .toBe(0);
  });
});
