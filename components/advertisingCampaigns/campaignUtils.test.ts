import { describe, expect, it } from 'vitest';
import {
  calculateSmsEstimatedCost,
  buildCampaignMessageSnapshot,
  campaignRichTextToPlainText,
  createCampaignToolDraft,
  applyCampaignAudienceSummaryToConfig,
  containsSmsOptOutPhrase,
  estimateSmsPages,
  keepCampaignDateRangeValid,
  invalidateCampaignAudienceSummaryConfig,
  getCampaignToolEmptyMessageError,
  normalizeCampaignSenderNumbers,
  normalizeCampaignAudienceSummary,
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

  it('keeps automatically saved campaign date ranges valid', () => {
    expect(keepCampaignDateRangeValid(
      { start_at: '2026-08-26T10:00:00.000Z', end_at: '2026-08-26T11:00:00.000Z' },
      { start_at: '2026-08-26T12:00:00.000Z' },
      'start_at',
      'end_at',
    )).toEqual({ start_at: '2026-08-26T12:00:00.000Z', end_at: '2026-08-26T12:00:00.000Z' });
  });

  it('normalizes audience counts and maps the sendable count to SMS estimates', () => {
    const summary = normalizeCampaignAudienceSummary({
      matched_count: '12', unique_count: 10, duplicate_count: 2,
      invalid_count: 1, excluded_count: 1, suppressed_count: -4, sendable_count: 8.9,
    });
    expect(summary).toEqual({
      matched_count: 12, unique_count: 10, duplicate_count: 2,
      invalid_count: 1, excluded_count: 1, suppressed_count: 0, sendable_count: 8,
    });
    expect(applyCampaignAudienceSummaryToConfig('sms', { kind: 'sms', message: 'سلام' }, summary, '2026-08-27T10:00:00.000Z'))
      .toMatchObject({
        message: 'سلام', estimated_audience: 8, sendable_audience_count: 8,
        audience_finalized_at: '2026-08-27T10:00:00.000Z',
      });
  });

  it('stores audience summaries without inventing an estimate for private bot tools', () => {
    const config = applyCampaignAudienceSummaryToConfig('bot_private', { kind: 'bot_private', channel: 'telegram' }, { sendable_count: 4 });
    expect(config).toMatchObject({ sendable_audience_count: 4, unique_audience_count: 0 });
    expect(config).not.toHaveProperty('estimated_audience');
  });

  it('invalidates a finalized count when its conditions change', () => {
    const config = invalidateCampaignAudienceSummaryConfig('email', {
      kind: 'email', estimated_audience: 9, sendable_audience_count: 9,
      audience_finalized_at: '2026-08-27T10:00:00.000Z', subject: 'خبرنامه',
    });
    expect(config).toMatchObject({ subject: 'خبرنامه' });
    expect(config).not.toHaveProperty('estimated_audience');
    expect(config).not.toHaveProperty('sendable_audience_count');
    expect(config).not.toHaveProperty('audience_finalized_at');
  });

  it('converts rich campaign SMS content to provider-safe plain text', () => {
    expect(campaignRichTextToPlainText('<p>سلام&nbsp;دوست من</p><p>لغو۱۱</p>'))
      .toBe('سلام دوست من\nلغو۱۱');
    const tool = createCampaignToolDraft('campaign-1', 'sms');
    tool.config = { ...tool.config, message_template: '<p>پیام کمپین</p>' } as any;
    expect(buildCampaignMessageSnapshot(tool)).toMatchObject({
      message: 'پیام کمپین',
      text: 'پیام کمپین',
      variable_catalog: [],
    });
    expect(getCampaignToolEmptyMessageError(tool)).toBeNull();
  });

  it('snapshots only descriptors that are actually used in the message', () => {
    const tool = createCampaignToolDraft('campaign-1', 'sms');
    tool.config = { ...tool.config, message_template: 'سلام {{full_name}}' } as any;
    const descriptors = [
      { key: 'full_name', module_id: 'customers', field_key: 'full_name', field_type: 'text' },
      { key: 'email', module_id: 'customers', field_key: 'email', field_type: 'email' },
    ];

    expect(buildCampaignMessageSnapshot(tool, { variableCatalog: descriptors }).variable_catalog)
      .toEqual([descriptors[0]]);
  });

  it('rejects visually empty rich text for every automatic message tool', () => {
    (['sms', 'email', 'bot_group', 'bot_private'] as const).forEach((toolType) => {
      const tool = createCampaignToolDraft('campaign-1', toolType);
      tool.config = { ...tool.config, message_template: '<p><br></p>', html_body: '<p>&nbsp;</p>' } as any;
      expect(getCampaignToolEmptyMessageError(tool)).toContain('خالی است');
    });
  });
});
