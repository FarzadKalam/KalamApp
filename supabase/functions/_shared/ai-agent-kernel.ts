import {
  getAgentDefinition,
  getAgentTitleFa,
  normalizeSelectedAgents,
  type AgentKey,
} from './ai-agent-catalog.ts';
import type { CentralAiGrounding } from './ai-grounding.ts';

export const heuristicSelectAgentsAndCapabilities = (params: {
  message: string;
  explicitAgents?: unknown;
  explicitCapabilities?: unknown;
  pageContext?: any;
  allowedAgents?: AgentKey[];
}): {
  agents: AgentKey[];
  capabilities: string[];
  reasonFa: string;
} => {
  const text = String(params.message || '').trim().toLowerCase();
  const explicitAgents = normalizeSelectedAgents(params.explicitAgents);
  const explicitCaps = Array.isArray(params.explicitCapabilities)
    ? Array.from(new Set(params.explicitCapabilities.map((c) => String(c || '').trim()).filter(Boolean)))
    : [];

  const detectedAgents = new Set<AgentKey>(explicitAgents);
  const detectedCaps = new Set<string>(explicitCaps);

  const moduleId = String(params.pageContext?.moduleId || '').trim();

  if (moduleId === 'instagram_conversations' || /(اینستاگرام|اینستا|استوری|ریل|کامنت|دایرکت\s*اینستا|ویترین|boxapi)/i.test(text)) {
    detectedAgents.add('instagrammer');
    if (/(بساز|ساخت|قانون|شرط|ویترین|کارت|پاسخ\s*خودکار)/i.test(text)) detectedCaps.add('record_creation');
  }
  if (['invoices', 'customers', 'marketing_leads', 'sales_return_invoices', 'price_lists', 'product_bundles'].includes(moduleId)
    || /(فاکتور|پیش[‌ ]?فاکتور|فروش|لید|سرنخ|مشتری|تخفیف|تسویه|رسید\s*پرداخت|برگشت\s*از\s*فروش)/i.test(text)) {
    detectedAgents.add('sales_leads');
    if (/(بزن|بساز|ایجاد|تسویه|صدور|ثبت|برگشت)/i.test(text)) detectedCaps.add('record_creation');
  }
  if (['purchase_invoices', 'suppliers', 'purchase_return_invoices', 'warehouses'].includes(moduleId)
    || /(خرید|تأمین|تامین|تأمین[‌ ]?کننده|موجودی\s*انبار|کسری\s*کالا|برگشت\s*از\s*خرید)/i.test(text)) {
    detectedAgents.add('purchase_supply');
    if (/(بساز|ثبت|ایجاد|سفارش)/i.test(text)) detectedCaps.add('record_creation');
  }
  if (['employees', 'recruitment_applicants', 'leave_requests', 'overtime_requests', 'mission_requests', 'job_descriptions'].includes(moduleId)
    || /(منابع\s*انسانی|آنبوردینگ|استخدام|کارمند|همکار|مرخصی|اضافه[‌ ]?کار|مأموریت|ماموریت|شرح\s*شغل|قوانین\s*اداری)/i.test(text)) {
    detectedAgents.add('hr_manager');
    if (/(بساز|ثبت|ایجاد|معرفی)/i.test(text)) detectedCaps.add('record_creation');
  }
  if (['reservations', 'reservation_resources'].includes(moduleId)
    || /(رزرو|رزرواسیون|نوبت|سالن|اتاق|سانس|بافر|تایم\s*خالی|بیعانه)/i.test(text)) {
    detectedAgents.add('reservation');
    if (/(رزرو\s*کن|ثبت|ایجاد|لغو|تغییر)/i.test(text)) detectedCaps.add('record_creation');
  }
  if (['projects', 'tasks', 'process_templates', 'process_runs'].includes(moduleId)
    || /(پروژه|فرآیند|فرایند|الگو|مرحله|فعالیت|تسک|تاسک|ارجاع)/i.test(text)) {
    detectedAgents.add('project_process');
    if (/(بساز|ایجاد|تعریف|شروع|مرحله|اجرا)/i.test(text)) {
      if (/(فرآیند|فرایند|مرحله|الگو)/i.test(text)) detectedCaps.add('process_operation');
      if (/(پروژه|فعالیت|تسک|الگو)/i.test(text)) detectedCaps.add('record_creation');
    }
  }
  if (/(پاسخگویی\s*مشتری|مشتری\s*پیام|بات\s*مشتری|تلگرام|بله|روبیکا|پیامک|تماس\s*مشتری|پیگیری\s*از\s*مسئول)/i.test(text)) {
    detectedAgents.add('customer_response');
    detectedCaps.add('customer_reply_suggestion');
  }
  if (/(راهنما|آموزش|چطور|چگونه|کجا\s*تنظیم|نحوه\s*کار|ویدیو\s*آموزش|فیلم\s*آموزش|راهنمای\s*نرم|یاد\s*بگیرم|طریقه)/i.test(text)) {
    detectedAgents.add('system_guide');
  }
  if (/(تغییر\s*قیمت|تنظیم\s*قیمت|افزایش\s*قیمت|کاهش\s*قیمت|اصلاح\s*قیمت|درصد.*(افزایش|کاهش|تغییر|ببر\s*بالا|بیار\s*پایین)|لیست\s*قیمت.*(تغییر|افزایش|کاهش)|پکیج.*قیمت|پیش[‌ ]?فاکتور.*قیمت)/i.test(text)) {
    detectedAgents.add('sales_leads');
    detectedCaps.add('pricing_adjustment');
    detectedCaps.add('record_creation');
  }

  if (/(الگوی\s*فرآیند|فرآیند\s*کامل|پروژه\s*از\s*روی\s*الگو)/i.test(text)) {
    detectedCaps.add('process_operation');
    detectedCaps.add('record_creation');
  }

  if (detectedAgents.size === 0 || detectedAgents.size > 1) {
    detectedAgents.add('lead_orchestrator');
  }

  let agents = Array.from(detectedAgents);
  if (Array.isArray(params.allowedAgents) && params.allowedAgents.length > 0) {
    const allowedSet = new Set(params.allowedAgents);
    const filtered = agents.filter((a) => allowedSet.has(a));
    agents = filtered.length ? filtered : [params.allowedAgents[0]];
  }

  return {
    agents,
    capabilities: Array.from(detectedCaps),
    reasonFa: `تشخیص هوشمند برای ${agents.map((a) => getAgentTitleFa(a)).join('، ')}`,
  };
};

export const generateCallbackToken = (): string => {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
};

export const createWaitingApprovalRun = async (params: {
  supabaseUrl: string;
  serviceRoleKey: string;
  orgId: string;
  userId?: string | null;
  agentKey: AgentKey;
  selectedAgents?: AgentKey[];
  channel: string;
  summaryFa: string;
  actionType: string;
  actionPayload: Record<string, any>;
  moduleId?: string | null;
  recordId?: string | null;
}): Promise<{
  runId: string | null;
  actionLogId: string | null;
  callbackToken: string;
}> => {
  const headers = {
    apikey: params.serviceRoleKey,
    Authorization: `Bearer ${params.serviceRoleKey}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  };
  const baseUrl = params.supabaseUrl.replace(/\/+$/, '');
  const callbackToken = generateCallbackToken();

  const runRes = await fetch(`${baseUrl}/rest/v1/ai_agent_runs`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      org_id: params.orgId,
      initiated_by: params.userId || null,
      execution_policy: params.channel === 'staff_bot' ? 'staff_bot_chat' : 'interactive_chat',
      status: 'waiting_approval',
      confidence: 'high',
      risk: 'medium',
      agent_key: params.agentKey,
      selected_agents: params.selectedAgents?.length ? params.selectedAgents : [params.agentKey],
      trigger_type: 'interactive',
      channel: params.channel,
      source_metadata: {
        summary_fa: params.summaryFa,
        action_type: params.actionType,
      },
      waiting_approval_payload: {
        action_type: params.actionType,
        module_id: params.moduleId || null,
        record_id: params.recordId || null,
        payload: params.actionPayload,
        summary_fa: params.summaryFa,
      },
    }),
  });
  const runData = await runRes.json().catch(() => null);
  const runId = Array.isArray(runData) ? runData[0]?.id || null : runData?.id || null;

  const logRes = await fetch(`${baseUrl}/rest/v1/ai_action_logs`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      org_id: params.orgId,
      created_by: params.userId || null,
      action_type: params.actionType,
      module_id: params.moduleId || null,
      record_id: params.recordId || null,
      status: 'proposed',
      approval_status: 'pending',
      callback_token: callbackToken,
      channel: params.channel,
      agent_key: params.agentKey,
      proposed_payload: {
        ...params.actionPayload,
        summary_fa: params.summaryFa,
        ...(runId ? { agent_run_id: runId } : {}),
      },
      result_payload: runId ? { agent_run_id: runId } : {},
    }),
  });
  const logData = await logRes.json().catch(() => null);
  const actionLogId = Array.isArray(logData) ? logData[0]?.id || null : logData?.id || null;

  return { runId, actionLogId, callbackToken };
};

export const compileOnboardingQaPolicy = (params: {
  agentKey: AgentKey;
  existingPolicy?: Record<string, any> | null;
  answers: Record<string, string>;
}): {
  policyJson: Record<string, any>;
  summaryFa: string;
} => {
  const def = getAgentDefinition(params.agentKey);
  const nextPolicy: Record<string, any> = {
    ...(params.existingPolicy && typeof params.existingPolicy === 'object' ? params.existingPolicy : {}),
  };

  const lines: string[] = [];
  for (const q of def?.onboardingQuestions || []) {
    const val = String(params.answers?.[q.policyField] ?? params.answers?.[q.key] ?? '').trim();
    if (!val) continue;
    nextPolicy[q.policyField] = val;
    lines.push(`• ${q.questionFa}: ${val}`);
  }
  if (params.answers?.custom_tone_notes) {
    nextPolicy.custom_tone_notes = String(params.answers.custom_tone_notes).trim();
  }
  nextPolicy.onboarding_updated_at = new Date().toISOString();

  return {
    policyJson: nextPolicy,
    summaryFa: lines.length
      ? `سیاست تخصصی ${getAgentTitleFa(params.agentKey)} بر اساس پاسخ‌های شما ثبت شد:\n${lines.join('\n')}`
      : `تنظیمات پایه ${getAgentTitleFa(params.agentKey)} ذخیره شد.`,
  };
};

export const buildAgentsOverviewForActor = (grounding: CentralAiGrounding) => {
  return Object.values(grounding.agentStates || {}).map((state) => ({
    key: state.agentKey,
    titleFa: state.definition.titleFa,
    shortTitleFa: state.definition.shortTitleFa,
    subtitleFa: state.definition.subtitleFa,
    descriptionFa: state.definition.descriptionFa,
    badgeColor: state.definition.badgeColor,
    iconKey: state.definition.iconKey,
    orgEnabled: state.orgEnabled,
    canView: state.canView,
    canChat: state.canChat,
    canToggle: state.canToggle,
    canEdit: state.canEdit,
    canUse: state.canUse,
    planAllowed: state.planAllowed,
    rbacAllowed: state.rbacAllowed,
    memberCanUse: state.memberCanUse,
    staffBotEnabled: state.staffBotEnabled,
    autonomyMode: state.autonomyMode,
    toneStyle: state.toneStyle,
    supportsBackground: state.definition.supportsBackground,
    backgroundEnabled: state.config?.background_config?.enabled === true,
    backgroundLastRunAt: state.config?.background_last_run_at || null,
    backgroundLastStatus: state.config?.background_last_status || null,
    backgroundLastSummary: state.config?.background_last_summary || null,
    backgroundLastError: state.config?.background_last_error || null,
    onboardingCompleted: Boolean(state.config?.onboarding_completed_at),
    missingModules: state.missingModules,
    primaryModules: state.definition.primaryModules,
    defaultCapabilities: state.definition.defaultCapabilities,
  }));
};
