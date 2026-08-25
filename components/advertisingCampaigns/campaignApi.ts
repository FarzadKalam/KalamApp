import { supabase } from '../../supabaseClient';
import { fetchRecordTagsMap } from '../../utils/referenceData';
import { syncRecordTags } from '../../utils/recordTags';
import { clearSessionBootstrapCache, fetchSessionBootstrap } from '../../utils/sessionCache';
import { buildClientFallbackSystemCode } from '../../utils/systemCode';
import { ADVERTISING_CAMPAIGNS_MODULE_ID, getCampaignToolLabel } from '../../utils/advertisingCampaigns';
import { createCampaignToolDraft, createEmptyCampaign } from './campaignUtils';
import type {
  CampaignAccessMode,
  CampaignAudienceRule,
  CampaignRecord,
  CampaignToolRecord,
  CampaignToolType,
  CampaignWorkspace,
} from './types';

const CAMPAIGN_COLUMNS = [
  'id', 'org_id', 'name', 'system_code', 'status', 'image_url', 'description', 'target_audience',
  'start_at', 'end_at', 'assignee_id', 'assignee_role_id', 'assignee_type', 'viewer_user_ids',
  'viewer_role_ids', 'tool_types', 'created_by', 'created_at', 'updated_by', 'updated_at', 'is_archived',
].join(',');

const TOOL_COLUMNS = [
  'id', 'org_id', 'campaign_id', 'tool_type', 'title', 'enabled', 'status', 'config', 'estimated_cost', 'actual_cost',
  'planned_start_at', 'planned_end_at', 'actual_start_at', 'actual_end_at', 'expected_leads', 'expected_customers',
  'actual_leads', 'actual_customers', 'collaborator_user_ids', 'collaborator_role_ids', 'process_template_id',
  'execution_process_draft', 'result_summary', 'assignee_id', 'assignee_role_id', 'created_by', 'created_at', 'updated_by', 'updated_at',
].join(',');

const AUDIENCE_COLUMNS = 'id,campaign_id,target_module_id,conditions_all,conditions_any,enabled';

const normalizeArray = (value: unknown): string[] => Array.isArray(value)
  ? Array.from(new Set(value.map((item) => String(item || '').trim()).filter(Boolean)))
  : [];

const normalizeCampaign = (row: any): CampaignRecord => ({
  ...createEmptyCampaign(),
  ...(row || {}),
  id: String(row?.id || ''),
  name: String(row?.name || ''),
  status: row?.status || 'draft',
  viewer_user_ids: normalizeArray(row?.viewer_user_ids),
  viewer_role_ids: normalizeArray(row?.viewer_role_ids),
  tool_types: normalizeArray(row?.tool_types),
  loyalty_rule_ids: normalizeArray(row?.loyalty_rule_ids),
  discount_code_ids: normalizeArray(row?.discount_code_ids),
  tags: normalizeArray(row?.tags),
});

const normalizeTool = (row: any): CampaignToolRecord => ({
  ...createCampaignToolDraft(String(row?.campaign_id || ''), String(row?.tool_type || '')),
  ...(row || {}),
  id: String(row?.id || ''),
  campaign_id: String(row?.campaign_id || ''),
  tool_type: String(row?.tool_type || ''),
  enabled: row?.enabled !== false,
  status: row?.status || 'draft',
  config: row?.config && typeof row.config === 'object'
    ? row.config
    : createCampaignToolDraft(String(row?.campaign_id || ''), String(row?.tool_type || '')).config,
  collaborator_user_ids: normalizeArray(row?.collaborator_user_ids),
  collaborator_role_ids: normalizeArray(row?.collaborator_role_ids),
});

const normalizeAudienceRule = (row: any): CampaignAudienceRule => ({
  id: row?.id ? String(row.id) : undefined,
  campaign_id: row?.campaign_id ? String(row.campaign_id) : undefined,
  target_module_id: row?.target_module_id,
  conditions_all: Array.isArray(row?.conditions_all) ? row.conditions_all : [],
  conditions_any: Array.isArray(row?.conditions_any) ? row.conditions_any : [],
  enabled: row?.enabled !== false,
});

const throwIfError = (result: { error?: any }) => {
  if (result?.error) throw result.error;
};

const getCampaignWriteSession = async () => {
  let sessionResult = await supabase.auth.getSession();
  let session = sessionResult.data.session;
  const expiresSoon = !session?.expires_at || session.expires_at * 1000 <= Date.now() + 60_000;
  if (expiresSoon) {
    const refreshed = await supabase.auth.refreshSession();
    if (!refreshed.error && refreshed.data.session) session = refreshed.data.session;
  }
  if (!session?.user?.id || !session.access_token) {
    clearSessionBootstrapCache();
    throw new Error('نشست ورود شما معتبر نیست. لطفاً یک‌بار از حساب خارج و دوباره وارد شوید.');
  }
  const bootstrap = await fetchSessionBootstrap(supabase, { force: true });
  if (!bootstrap.orgId || bootstrap.user?.id !== session.user.id) {
    clearSessionBootstrapCache();
    throw new Error('سازمان جاری برای ایجاد کمپین مشخص نیست. لطفاً صفحه را تازه‌سازی کنید.');
  }
  return { userId: session.user.id, orgId: bootstrap.orgId };
};

const readJoinIds = async (
  table: 'advertising_campaign_loyalty_rules' | 'advertising_campaign_discount_codes',
  targetColumn: 'loyalty_rule_id' | 'discount_code_id',
  campaignId: string,
) => {
  const result = await supabase.from(table).select(targetColumn).eq('campaign_id', campaignId).limit(1000);
  if (result.error) throw result.error;
  return normalizeArray((result.data || []).map((row: any) => row?.[targetColumn]));
};

const loadFullWorkspace = async (campaignId: string): Promise<CampaignWorkspace> => {
  const campaignResult = await supabase
    .from('advertising_campaigns')
    .select(CAMPAIGN_COLUMNS)
    .eq('id', campaignId)
    .eq('is_archived', false)
    .maybeSingle();
  throwIfError(campaignResult);
  if (!campaignResult.data) throw new Error('کمپین تبلیغاتی پیدا نشد یا اجازه مشاهده آن را ندارید.');

  const [toolsResult, audienceResult, loyaltyRuleIds, discountCodeIds, tagsMap] = await Promise.all([
    supabase.from('advertising_campaign_tools').select(TOOL_COLUMNS).eq('campaign_id', campaignId).order('created_at'),
    supabase.from('advertising_campaign_audience_rules').select(AUDIENCE_COLUMNS).eq('campaign_id', campaignId),
    readJoinIds('advertising_campaign_loyalty_rules', 'loyalty_rule_id', campaignId),
    readJoinIds('advertising_campaign_discount_codes', 'discount_code_id', campaignId),
    fetchRecordTagsMap(supabase, ADVERTISING_CAMPAIGNS_MODULE_ID, [campaignId]).catch(() => ({})),
  ]);
  throwIfError(toolsResult);
  throwIfError(audienceResult);
  const campaign = normalizeCampaign({
    ...campaignResult.data,
    loyalty_rule_ids: loyaltyRuleIds,
    discount_code_ids: discountCodeIds,
    tags: (tagsMap[campaignId] || []).map((tag: any) => String(tag?.id || '')).filter(Boolean),
  });
  return {
    campaign,
    tools: (toolsResult.data || []).map(normalizeTool),
    audienceRules: (audienceResult.data || []).map(normalizeAudienceRule),
    accessMode: 'full',
  };
};

const loadLimitedWorkspace = async (campaignId: string): Promise<CampaignWorkspace> => {
  const result = await supabase.rpc('advertising_campaign_collaboration_workspace', { p_campaign_id: campaignId });
  throwIfError(result);
  const raw = Array.isArray(result.data) ? result.data[0] : result.data;
  if (!raw) throw new Error('اجازه مشاهده این کمپین را ندارید.');
  return {
    campaign: normalizeCampaign({ ...(raw.campaign || raw), access_mode: 'tool_limited' }),
    tools: (raw.tools || []).map(normalizeTool),
    audienceRules: [],
    accessMode: 'tool_limited',
  };
};

export const loadCampaignWorkspace = async (campaignId: string): Promise<CampaignWorkspace> => {
  try {
    return await loadFullWorkspace(campaignId);
  } catch (fullError) {
    try {
      return await loadLimitedWorkspace(campaignId);
    } catch {
      throw fullError;
    }
  }
};

const campaignPayload = (campaign: CampaignRecord) => ({
  name: String(campaign.name || '').trim(),
  status: campaign.status || 'draft',
  image_url: String(campaign.image_url || '').trim() || null,
  description: String(campaign.description || '').trim() || null,
  target_audience: String(campaign.target_audience || '').trim() || null,
  start_at: campaign.start_at || null,
  end_at: campaign.end_at || null,
  assignee_id: campaign.assignee_id || null,
  assignee_role_id: campaign.assignee_role_id || null,
  assignee_type: campaign.assignee_type || null,
  viewer_user_ids: normalizeArray(campaign.viewer_user_ids),
  viewer_role_ids: normalizeArray(campaign.viewer_role_ids),
  tool_types: normalizeArray(campaign.tool_types),
});

export const createAdvertisingCampaign = async (campaign: CampaignRecord): Promise<CampaignRecord> => {
  const session = await getCampaignWriteSession();
  const orgId = String(session.orgId || '').trim();
  if (!orgId) throw new Error('سازمان جاری برای ایجاد کمپین مشخص نیست.');
  const systemCode = await buildClientFallbackSystemCode(
    supabase,
    ADVERTISING_CAMPAIGNS_MODULE_ID,
    'advertising_campaigns',
    { orgId },
  );
  // PostgREST evaluates SELECT policies for `return=representation`. The
  // campaign's read policy intentionally scopes a newly-created record, so
  // creation and its subsequent read must be separate requests.
  const insertResult = await supabase.from('advertising_campaigns').insert([{
    ...campaignPayload(campaign),
    org_id: orgId,
    system_code: systemCode,
    created_by: session.userId,
    updated_by: session.userId,
  }]);
  throwIfError(insertResult);
  const result = await supabase
    .from('advertising_campaigns')
    .select(CAMPAIGN_COLUMNS)
    .eq('org_id', orgId)
    .eq('system_code', systemCode)
    .maybeSingle();
  throwIfError(result);
  if (!result.data) throw new Error('کمپین ساخته شد، اما خواندن اطلاعات آن کامل نشد. صفحه را تازه‌سازی کنید.');
  return normalizeCampaign(result.data);
};

export const updateAdvertisingCampaign = async (campaign: CampaignRecord): Promise<CampaignRecord> => {
  const session = await getCampaignWriteSession();
  const result = await supabase.from('advertising_campaigns').update({
    ...campaignPayload(campaign),
    updated_by: session.userId,
    updated_at: new Date().toISOString(),
  }).eq('id', campaign.id).select(CAMPAIGN_COLUMNS).single();
  throwIfError(result);
  return normalizeCampaign({ ...campaign, ...result.data });
};

const replaceJoinRows = async (
  campaignId: string,
  table: 'advertising_campaign_loyalty_rules' | 'advertising_campaign_discount_codes',
  targetColumn: 'loyalty_rule_id' | 'discount_code_id',
  values: string[] | undefined,
) => {
  const deleteResult = await supabase.from(table).delete().eq('campaign_id', campaignId);
  throwIfError(deleteResult);
  const ids = normalizeArray(values);
  if (ids.length === 0) return;
  const insertResult = await supabase.from(table).insert(ids.map((id) => ({ campaign_id: campaignId, [targetColumn]: id })));
  throwIfError(insertResult);
};

export const saveCampaignRelations = async (campaign: CampaignRecord) => {
  await Promise.all([
    replaceJoinRows(campaign.id, 'advertising_campaign_loyalty_rules', 'loyalty_rule_id', campaign.loyalty_rule_ids),
    replaceJoinRows(campaign.id, 'advertising_campaign_discount_codes', 'discount_code_id', campaign.discount_code_ids),
    syncRecordTags(supabase, ADVERTISING_CAMPAIGNS_MODULE_ID, campaign.id, campaign.tags || []),
  ]);
};

const toolPayload = (tool: CampaignToolRecord) => ({
  campaign_id: tool.campaign_id,
  tool_type: tool.tool_type,
  title: String(tool.title || '').trim() || getCampaignToolLabel(tool.tool_type),
  enabled: tool.enabled !== false,
  status: tool.status || 'draft',
  config: tool.config || {},
  estimated_cost: Number(tool.estimated_cost || 0),
  actual_cost: Number(tool.actual_cost || 0),
  planned_start_at: tool.planned_start_at || null,
  planned_end_at: tool.planned_end_at || null,
  actual_start_at: tool.actual_start_at || null,
  actual_end_at: tool.actual_end_at || null,
  expected_leads: Number(tool.expected_leads || 0),
  expected_customers: Number(tool.expected_customers || 0),
  actual_leads: Number(tool.actual_leads || 0),
  actual_customers: Number(tool.actual_customers || 0),
  collaborator_user_ids: normalizeArray(tool.collaborator_user_ids),
  collaborator_role_ids: normalizeArray(tool.collaborator_role_ids),
  process_template_id: tool.process_template_id || null,
  execution_process_draft: tool.execution_process_draft || {},
  result_summary: String(tool.result_summary || '').trim() || null,
  assignee_id: tool.assignee_id || null,
  assignee_role_id: tool.assignee_role_id || null,
});

export const saveCampaignTools = async (
  campaignId: string,
  tools: CampaignToolRecord[],
  selectedToolTypes: CampaignToolType[],
): Promise<CampaignToolRecord[]> => {
  const session = await fetchSessionBootstrap(supabase);
  const selected = new Set(normalizeArray(selectedToolTypes));
  const existingIds: string[] = [];
  const saved: CampaignToolRecord[] = [];

  for (const originalTool of tools) {
    const tool = { ...originalTool, campaign_id: campaignId, enabled: selected.has(String(originalTool.tool_type)) };
    if (String(tool.id || '').startsWith('draft:') || !tool.id) {
      const result = await supabase.from('advertising_campaign_tools').insert([{
        ...toolPayload(tool), created_by: session?.user?.id || null, updated_by: session?.user?.id || null,
      }]).select(TOOL_COLUMNS).single();
      throwIfError(result);
      saved.push(normalizeTool(result.data));
      continue;
    }
    existingIds.push(tool.id);
    const result = await supabase.from('advertising_campaign_tools').update({
      ...toolPayload(tool), updated_by: session?.user?.id || null, updated_at: new Date().toISOString(),
    }).eq('id', tool.id).select(TOOL_COLUMNS).single();
    throwIfError(result);
    saved.push(normalizeTool(result.data));
  }

  for (const toolType of selected) {
    if (saved.some((tool) => tool.tool_type === toolType)) continue;
    const draft = createCampaignToolDraft(campaignId, toolType);
    const result = await supabase.from('advertising_campaign_tools').insert([{
      ...toolPayload(draft), created_by: session?.user?.id || null, updated_by: session?.user?.id || null,
    }]).select(TOOL_COLUMNS).single();
    throwIfError(result);
    saved.push(normalizeTool(result.data));
  }
  return saved;
};

export const patchAdvertisingCampaignToolExecution = async (
  tool: Pick<CampaignToolRecord, 'id' | 'campaign_id'>,
  patch: Pick<Partial<CampaignToolRecord>, 'status' | 'actual_start_at' | 'actual_end_at' | 'actual_cost' | 'result_summary'>,
) => {
  const session = await fetchSessionBootstrap(supabase);
  const payload = Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined));
  const result = await supabase.from('advertising_campaign_tools').update({
    ...payload,
    updated_by: session?.user?.id || null,
    updated_at: new Date().toISOString(),
  }).eq('campaign_id', tool.campaign_id).eq('id', tool.id).select(TOOL_COLUMNS).single();
  throwIfError(result);
  return normalizeTool(result.data);
};

export const patchAdvertisingCampaignCollaborationTool = async (
  toolId: string,
  patch: Partial<CampaignToolRecord>,
): Promise<Partial<CampaignToolRecord>> => {
  const allowed: Partial<CampaignToolRecord> = {};
  const scalarKeys: Array<keyof CampaignToolRecord> = [
    'status', 'actual_cost', 'actual_leads', 'actual_customers',
    'actual_start_at', 'actual_end_at', 'result_summary',
  ];
  scalarKeys.forEach((key) => {
    if (patch[key] !== undefined) (allowed as any)[key] = patch[key];
  });
  if (patch.config && typeof patch.config === 'object') {
    const resultConfigKeys = [
      'result_notes', 'result_metrics', 'result_attachments', 'actual_reach',
      'actual_impressions', 'actual_clicks', 'actual_responses', 'completion_percentage',
    ];
    const config = Object.fromEntries(Object.entries(patch.config as any).filter(([key]) => resultConfigKeys.includes(key)));
    if (Object.keys(config).length) allowed.config = config as CampaignToolRecord['config'];
  }
  const result = await supabase.rpc('update_advertising_campaign_collaboration_tool', {
    p_tool_id: toolId,
    p_patch: allowed,
  });
  throwIfError(result);
  return (result.data || {}) as Partial<CampaignToolRecord>;
};

export const saveCampaignAudienceRules = async (
  campaignId: string,
  rules: CampaignAudienceRule[],
): Promise<CampaignAudienceRule[]> => {
  const rows: CampaignAudienceRule[] = [];
  for (const rule of rules) {
    const payload = {
      campaign_id: campaignId,
      target_module_id: rule.target_module_id,
      conditions_all: Array.isArray(rule.conditions_all) ? rule.conditions_all : [],
      conditions_any: Array.isArray(rule.conditions_any) ? rule.conditions_any : [],
      enabled: rule.enabled !== false,
    };
    const result = rule.id
      ? await supabase.from('advertising_campaign_audience_rules').update(payload).eq('id', rule.id).select(AUDIENCE_COLUMNS).single()
      : await supabase.from('advertising_campaign_audience_rules').insert([payload]).select(AUDIENCE_COLUMNS).single();
    throwIfError(result);
    rows.push(normalizeAudienceRule(result.data));
  }
  return rows;
};

export type CampaignRelationOption = { value: string; label: string; subtitle?: string };

export const loadCampaignRelationOptions = async (): Promise<{
  loyaltyRules: CampaignRelationOption[];
  discountCodes: CampaignRelationOption[];
}> => {
  const [rules, codes] = await Promise.all([
    supabase.from('customer_loyalty_rules').select('id,name,rule_type,is_active').eq('is_active', true).order('created_at', { ascending: false }).limit(200),
    supabase.from('customer_discount_codes').select('id,code,title,is_active').eq('is_active', true).order('created_at', { ascending: false }).limit(200),
  ]);
  return {
    loyaltyRules: (rules.data || []).map((row: any) => ({ value: String(row.id), label: String(row.name || 'طرح بدون عنوان'), subtitle: String(row.rule_type || '') })),
    discountCodes: (codes.data || []).map((row: any) => ({ value: String(row.id), label: `${String(row.title || 'کد تخفیف')} (${String(row.code || '')})` })),
  };
};

export const createQuickLoyaltyRule = async (name: string): Promise<CampaignRelationOption> => {
  const result = await supabase.from('customer_loyalty_rules').insert([{
    name: String(name || '').trim(), rule_type: 'cashback', reward_type: 'amount', reward_amount: 0,
    reward_percent: 0, conditions_all: [], conditions_any: [], config: {}, is_active: true,
  }]).select('id,name').single();
  throwIfError(result);
  return { value: String(result.data.id), label: String(result.data.name) };
};

export const createQuickDiscountCode = async (input: { code: string; title: string }): Promise<CampaignRelationOption> => {
  const code = String(input.code || '').trim().toUpperCase().replace(/\s+/g, '');
  const result = await supabase.from('customer_discount_codes').insert([{
    code, title: String(input.title || '').trim(), discount_type: 'amount', discount_value: 0,
    conditions_all: [], conditions_any: [], metadata: { code_scope: 'public' }, is_active: true,
  }]).select('id,code,title').single();
  throwIfError(result);
  return { value: String(result.data.id), label: `${String(result.data.title)} (${String(result.data.code)})` };
};

export const resolveCampaignAccessMode = (workspace: CampaignWorkspace | null): CampaignAccessMode =>
  workspace?.accessMode === 'tool_limited' ? 'tool_limited' : 'full';
