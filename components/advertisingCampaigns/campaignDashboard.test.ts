import { describe, expect, it, vi } from 'vitest';
import React from 'react';
import { render, waitFor } from '@testing-library/react';

vi.mock('../../utils/webFormTemplateFormAdapter', () => ({
  createWebFormTemplateRecordSaver: () => async () => ({}),
}));
import { ADVERTISING_CAMPAIGN_SOURCE_VALUE } from '../../utils/advertisingCampaigns';
import { customerModule } from '../../modules/customerConfig';
import { invoicesConfig } from '../../modules/invoicesConfig';
import { marketingLeadsModule } from '../../modules/marketingLeadsConfig';
import { normalizeCampaignDashboardSummary, normalizeCampaignToolReport } from './campaignDashboardService';
import { buildCampaignRangeSegments } from './CampaignRangeCalendar';
import { getCampaignToolActions } from './CampaignToolCard';
import CampaignToolReportPanel from './CampaignToolReportPanel';
import type { CampaignToolRecord } from './types';

const makeTool = (patch: Partial<CampaignToolRecord> = {}): CampaignToolRecord => ({
  id: 'tool-1',
  campaign_id: 'campaign-1',
  tool_type: 'sms',
  enabled: true,
  status: 'ready',
  config: { kind: 'sms' },
  ...patch,
});

describe('campaign dashboard contracts', () => {
  it('normalizes snake_case dashboard and report payloads', () => {
    expect(normalizeCampaignDashboardSummary({
      estimated_cost: 1200,
      actual_leads: 8,
      invoice_count: 3,
      attributed_revenue: 9500,
    })).toMatchObject({
      estimatedCost: 1200,
      actualLeads: 8,
      invoiceCount: 3,
      attributedRevenue: 9500,
    });

    expect(normalizeCampaignToolReport({
      records: {
        leads: [{ system_code: 'L-1' }],
        customers: [{ system_code: 'C-1' }],
        invoices: [],
      },
      totals: { leads: 14, customers: 2, invoices: 0 },
    })).toMatchObject({
      totals: { leads: 14, customers: 2, invoices: 0 },
      leads: [{ system_code: 'L-1' }],
    });
  });

  it('creates inclusive calendar segments and falls back to one day when end is empty', () => {
    const segments = buildCampaignRangeSegments([
      makeTool({ planned_start_at: '2026-08-20T10:00:00Z', planned_end_at: '2026-08-22T18:00:00Z' }),
      makeTool({ id: 'tool-2', planned_start_at: '2026-08-25T10:00:00Z', planned_end_at: null }),
    ], 'planned_start_at', 'planned_end_at');

    expect(Array.from(segments.values()).flat().filter((item) => item.tool.id === 'tool-1')).toHaveLength(3);
    expect(Array.from(segments.values()).flat().filter((item) => item.tool.id === 'tool-2')).toHaveLength(1);
  });

  it('does not expose dispatch controls to tool-limited collaborators', () => {
    expect(getCampaignToolActions(makeTool(), 'full')).toContain('send_now');
    expect(getCampaignToolActions(makeTool(), 'tool_limited')).not.toContain('send_now');
    expect(getCampaignToolActions(makeTool({ tool_type: 'outdoor', status: 'running' }), 'tool_limited'))
      .toEqual(['pause', 'complete_manual']);
  });

  it('renders a mobile report fallback without exposing a raw UUID', async () => {
    const rawId = '10000000-0000-4000-8000-000000000001';
    const loader = vi.fn(async () => ({
      summary: {},
      leads: [{ id: rawId, title: 'لید آزمون', status: 'new' }],
      customers: [],
      invoices: [],
      totals: { leads: 1, customers: 0, invoices: 0 },
    }));
    const { container, getAllByText } = render(React.createElement(CampaignToolReportPanel, {
      toolId: 'tool-1',
      loader,
    }));

    await waitFor(() => expect(getAllByText('لید آزمون').length).toBeGreaterThan(0));
    expect(container.textContent).not.toContain(rawId);
    expect(container.querySelector('.md\\:hidden')).not.toBeNull();
  });

  it.each([
    [marketingLeadsModule, 'source'],
    [customerModule, 'lead_source'],
    [invoicesConfig, 'sale_source'],
  ])('adds protected campaign attribution fields to %s', (moduleConfig, sourceFieldKey) => {
    const sourceField = moduleConfig.fields.find((field) => field.key === sourceFieldKey) as any;
    const campaignField = moduleConfig.fields.find((field) => field.key === 'advertising_campaign_id');
    const toolField = moduleConfig.fields.find((field) => field.key === 'advertising_campaign_tool_id');

    expect(sourceField.options).toContainEqual(expect.objectContaining({
      value: ADVERTISING_CAMPAIGN_SOURCE_VALUE,
      label: 'کمپین تبلیغاتی',
    }));
    expect(sourceField.protectedDynamicValues).toContain(ADVERTISING_CAMPAIGN_SOURCE_VALUE);
    expect(campaignField?.logic?.visibleIf).toMatchObject({ field: sourceFieldKey, value: ADVERTISING_CAMPAIGN_SOURCE_VALUE });
    expect(toolField?.relationConfig?.filter).toEqual({
      campaign_id: { $field: 'advertising_campaign_id' },
      enabled: true,
    });
  });
});
