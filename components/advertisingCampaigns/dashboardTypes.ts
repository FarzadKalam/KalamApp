import type { CampaignDashboardSummary } from './types';

export type CampaignAttributionRecord = {
  id?: string | null;
  system_code?: string | null;
  name?: string | null;
  title?: string | null;
  full_name?: string | null;
  invoice_number?: string | number | null;
  status?: string | null;
  created_at?: string | null;
  attributed_at?: string | null;
  amount?: number | null;
  total_invoice_amount?: number | null;
};

export type CampaignToolReport = {
  summary: CampaignDashboardSummary;
  leads: CampaignAttributionRecord[];
  customers: CampaignAttributionRecord[];
  invoices: CampaignAttributionRecord[];
  totals: {
    leads: number;
    customers: number;
    invoices: number;
  };
};

export type CampaignDashboardToolMetric = {
  toolId: string;
  label: string;
  estimatedCost: number;
  actualCost: number;
  expectedLeads: number;
  actualLeads: number;
  expectedCustomers: number;
  actualCustomers: number;
};

export type CampaignTimelineMetric = {
  label: string;
  value: number;
};

