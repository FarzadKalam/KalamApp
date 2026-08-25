import { supabase } from '../../supabaseClient';
import type { CampaignDashboardSummary } from './types';
import type { CampaignAttributionRecord, CampaignToolReport } from './dashboardTypes';

const asFiniteNumber = (value: unknown) => {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

const asRows = (value: unknown): CampaignAttributionRecord[] => (
  Array.isArray(value) ? value.filter((item) => item && typeof item === 'object') as CampaignAttributionRecord[] : []
);

export const normalizeCampaignDashboardSummary = (value: unknown): CampaignDashboardSummary => {
  const payload = value && typeof value === 'object' ? value as Record<string, any> : {};
  const source = payload.summary && typeof payload.summary === 'object' ? payload.summary : payload;
  return {
    estimatedCost: asFiniteNumber(source.estimatedCost ?? source.estimated_cost),
    actualCost: asFiniteNumber(source.actualCost ?? source.actual_cost),
    expectedLeads: asFiniteNumber(source.expectedLeads ?? source.expected_leads),
    actualLeads: asFiniteNumber(source.actualLeads ?? source.actual_leads),
    expectedCustomers: asFiniteNumber(source.expectedCustomers ?? source.expected_customers),
    actualCustomers: asFiniteNumber(source.actualCustomers ?? source.actual_customers),
    invoiceCount: asFiniteNumber(source.invoiceCount ?? source.invoice_count),
    attributedRevenue: asFiniteNumber(source.attributedRevenue ?? source.attributed_revenue),
    sentCount: asFiniteNumber(source.sentCount ?? source.sent_count),
    deliveredCount: asFiniteNumber(source.deliveredCount ?? source.delivered_count),
    failedCount: asFiniteNumber(source.failedCount ?? source.failed_count),
    repliedCount: asFiniteNumber(source.repliedCount ?? source.replied_count),
    unsubscribedCount: asFiniteNumber(source.unsubscribedCount ?? source.unsubscribed_count),
  };
};

export const normalizeCampaignToolReport = (value: unknown): CampaignToolReport => {
  const payload = value && typeof value === 'object' ? value as Record<string, any> : {};
  const records = payload.records && typeof payload.records === 'object' ? payload.records as Record<string, any> : payload;
  const leads = asRows(records.leads ?? records.marketing_leads);
  const customers = asRows(records.customers);
  const invoices = asRows(records.invoices ?? records.sales_invoices);
  const rawTotals = payload.totals && typeof payload.totals === 'object' ? payload.totals : {};
  return {
    summary: normalizeCampaignDashboardSummary(payload.summary ?? payload),
    leads,
    customers,
    invoices,
    totals: {
      leads: asFiniteNumber(rawTotals.leads ?? payload.lead_count ?? leads.length),
      customers: asFiniteNumber(rawTotals.customers ?? payload.customer_count ?? customers.length),
      invoices: asFiniteNumber(rawTotals.invoices ?? payload.invoice_count ?? invoices.length),
    },
  };
};

export const loadCampaignDashboardSummary = async (campaignId: string) => {
  const normalizedId = String(campaignId || '').trim();
  if (!normalizedId) return normalizeCampaignDashboardSummary(null);
  const { data, error } = await supabase.rpc('advertising_campaign_dashboard_summary', {
    p_campaign_id: normalizedId,
  });
  if (error) throw error;
  return normalizeCampaignDashboardSummary(data);
};

export const loadCampaignToolReport = async (
  toolId: string,
  { limit = 25, offset = 0 }: { limit?: number; offset?: number } = {},
) => {
  const normalizedId = String(toolId || '').trim();
  if (!normalizedId) return normalizeCampaignToolReport(null);
  const { data, error } = await supabase.rpc('advertising_campaign_tool_report', {
    p_tool_id: normalizedId,
    p_limit: Math.max(1, Math.min(100, Math.floor(limit))),
    p_offset: Math.max(0, Math.floor(offset)),
  });
  if (error) throw error;
  return normalizeCampaignToolReport(data);
};
