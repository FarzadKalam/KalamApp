import type { WorkflowCondition } from '../../utils/workflowTypes';
import type {
  CampaignAccessMode,
  CampaignStatus,
  CampaignToolStatus,
  CampaignToolType as CoreCampaignToolType,
} from '../../utils/advertisingCampaigns';

export type { CampaignAccessMode, CampaignStatus, CampaignToolStatus } from '../../utils/advertisingCampaigns';

export type CampaignToolType = CoreCampaignToolType | (string & {});
export type CampaignTargetModule = 'marketing_leads' | 'customers' | 'invoices';

export type CampaignAttachment = {
  name: string;
  url: string;
  mimeType?: string | null;
  assetId?: string | null;
  entryId?: string | null;
  moduleId?: string | null;
  recordId?: string | null;
  fileType?: string | null;
  recordFileId?: string | null;
};

export type CampaignContentItem = {
  id?: string;
  row_key?: string;
  content_type?: string | null;
  account_id?: string | null;
  title?: string | null;
  caption?: string | null;
  media_url?: string | null;
  destination_url?: string | null;
  planned_at?: string | null;
  published_at?: string | null;
  status?: string | null;
  estimated_cost?: number | null;
  actual_cost?: number | null;
  metadata?: Record<string, unknown>;
};

export type CampaignCommonToolConfig = {
  attachments?: CampaignAttachment[];
  notes?: string | null;
  result_notes?: string | null;
  content_items?: CampaignContentItem[];
};

export type CampaignSmsConfig = CampaignCommonToolConfig & {
  kind: 'sms';
  sender_number?: string | null;
  estimated_audience?: number | null;
  message_template?: string | null;
  cost_per_page?: number | null;
  vat_percent?: number | null;
  audience_sources?: Array<'internal' | 'excel'>;
  import_attachments?: CampaignAttachment[];
  scheduled_at?: string | null;
  inbound_enabled?: boolean;
  inbound_match_mode?: 'exact' | 'contains';
  inbound_expected_values?: string[];
  reply_window_value?: number | null;
  reply_window_unit?: 'hour' | 'day';
  inbound_actions?: unknown[];
};

export type CampaignEmailConfig = CampaignCommonToolConfig & {
  kind: 'email';
  connection_id?: string | null;
  sender_name?: string | null;
  reply_to?: string | null;
  estimated_audience?: number | null;
  audience_sources?: Array<'internal' | 'excel'>;
  import_attachments?: CampaignAttachment[];
  subject?: string | null;
  preheader?: string | null;
  html_body?: string | null;
  plain_text_body?: string | null;
  scheduled_at?: string | null;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  unsubscribe_footer_enabled?: boolean;
  cost_per_email?: number | null;
  vat_percent?: number | null;
};

export type CampaignBotConfig = CampaignCommonToolConfig & {
  kind: 'bot_group' | 'bot_private';
  channel?: 'telegram' | 'bale' | 'rubika' | null;
  connection_id?: string | null;
  group_ids?: string[];
  audience_sources?: Array<'internal'>;
  message_template?: string | null;
  scheduled_at?: string | null;
  silent?: boolean;
  pin_message?: boolean;
  cta_label?: string | null;
  cta_url?: string | null;
};

export type CampaignInstagramPostConfig = CampaignCommonToolConfig & {
  kind: 'instagram_post';
  account_id?: string | null;
  content_items?: CampaignContentItem[];
};

export type CampaignManualToolConfig = CampaignCommonToolConfig & {
  kind: 'manual';
  vendor?: string | null;
  location?: string | null;
  platform?: string | null;
  objective?: string | null;
  pricing_model?: 'fixed' | 'cpc' | 'cpm' | 'cpa' | null;
  landing_url?: string | null;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  impressions?: number | null;
  reach?: number | null;
  clicks?: number | null;
  conversions?: number | null;
  content_items?: CampaignContentItem[];
  custom_values?: Record<string, unknown>;
};

export type CampaignChannelConfig =
  | CampaignSmsConfig
  | CampaignEmailConfig
  | CampaignBotConfig
  | CampaignInstagramPostConfig
  | CampaignManualToolConfig;

export type CampaignRecord = {
  id: string;
  org_id?: string | null;
  name: string;
  system_code?: string | null;
  status: CampaignStatus;
  image_url?: string | null;
  description?: string | null;
  target_audience?: string | null;
  start_at?: string | null;
  end_at?: string | null;
  assignee_id?: string | null;
  assignee_role_id?: string | null;
  assignee_type?: 'user' | 'role' | null;
  viewer_user_ids?: string[];
  viewer_role_ids?: string[];
  tool_types?: CampaignToolType[];
  loyalty_rule_ids?: string[];
  discount_code_ids?: string[];
  tags?: string[];
  created_by?: string | null;
  created_at?: string | null;
  updated_by?: string | null;
  updated_at?: string | null;
  is_archived?: boolean;
  access_mode?: CampaignAccessMode;
};

export type CampaignToolRecord = {
  id: string;
  org_id?: string | null;
  campaign_id: string;
  tool_type: CampaignToolType;
  title?: string | null;
  enabled: boolean;
  status: CampaignToolStatus;
  config: CampaignChannelConfig;
  estimated_cost?: number | null;
  actual_cost?: number | null;
  planned_start_at?: string | null;
  planned_end_at?: string | null;
  actual_start_at?: string | null;
  actual_end_at?: string | null;
  expected_leads?: number | null;
  expected_customers?: number | null;
  actual_leads?: number | null;
  actual_customers?: number | null;
  collaborator_user_ids?: string[];
  collaborator_role_ids?: string[];
  process_template_id?: string | null;
  execution_process_draft?: unknown;
  result_summary?: string | null;
  assignee_id?: string | null;
  assignee_role_id?: string | null;
  created_by?: string | null;
  created_at?: string | null;
  updated_by?: string | null;
  updated_at?: string | null;
};

export type CampaignAudienceRule = {
  id?: string;
  campaign_id?: string;
  target_module_id: CampaignTargetModule;
  conditions_all: WorkflowCondition[];
  conditions_any: WorkflowCondition[];
  enabled: boolean;
};

export type CampaignWizardDraft = {
  campaign: CampaignRecord;
  tools: CampaignToolRecord[];
  audienceRules: CampaignAudienceRule[];
};

export type CampaignWorkspace = CampaignWizardDraft & {
  accessMode: CampaignAccessMode;
};

export type CampaignToolAction =
  | 'test'
  | 'prepare'
  | 'send_now'
  | 'schedule'
  | 'pause'
  | 'resume'
  | 'cancel'
  | 'retry'
  | 'start_manual'
  | 'complete_manual';

export type CampaignDashboardSummary = {
  estimatedCost?: number;
  actualCost?: number;
  expectedLeads?: number;
  actualLeads?: number;
  expectedCustomers?: number;
  actualCustomers?: number;
  invoiceCount?: number;
  attributedRevenue?: number;
  sentCount?: number;
  deliveredCount?: number;
  failedCount?: number;
  repliedCount?: number;
  unsubscribedCount?: number;
};
