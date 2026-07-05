// @ts-nocheck

type AssistantAction =
  | 'chat'
  | 'chat_stream'
  | 'suggest_auto_capabilities'
  | 'chat_with_file'
  | 'analyze_file'
  | 'upload_file'
  | 'send_file'
  | 'create_record_from_prompt'
  | 'update_record_from_prompt'
  | 'process_operation_from_prompt'
  | 'workflow_ai_prompt'
  | 'get_thread'
  | 'delete_thread'
  | 'propose_note'
  | 'confirm_action'
  | 'suggest_reply'
  | 'get_ai_settings'
  | 'save_ai_settings'
  | 'get_ai_overview'
  | 'test_provider'
  | 'list_models'
  | 'get_credit'
  | 'list_threads'
  | 'rename_thread'
  | 'archive_thread'
  | 'share_thread'
  | 'transcribe_voice'
  | 'generate_voice_output'
  | 'generate_image'
  | 'get_image_status'
  | 'run_task_bundle'
  | 'embed_document_chunks'
  | 'rebuild_instruction_ai_context'
  | 'rebuild_job_description_ai_context'
  | 'saas_ai';

type RequestContext = {
  route?: string;
  mode?: 'record' | 'list' | 'page' | string;
  moduleId?: string | null;
  recordId?: string | null;
  visibleRecordIds?: string[];
  selectedRecordIds?: string[];
  intent?: 'process_guide' | string;
  processFieldKey?: string | null;
  selectedProcessId?: string | null;
  selectedProcessGroupId?: string | null;
  processGuideContext?: Record<string, any> | null;
  availableProcesses?: Array<{
    id: string;
    label: string;
    templateId?: string | null;
    templateName?: string | null;
    stageCount?: number;
  }>;
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const FUNCTION_BUILD = 'ai-assistant-2026-07-05-01';
const DEFAULT_AI_BASE_URL = 'https://api.avalai.ir/v1';
const DEFAULT_AI_FALLBACK_BASE_URL = 'https://api.avalapis.ir/v1';
const DEFAULT_AI_MODEL = '';
const DEFAULT_EMBEDDING_MODEL = 'text-embedding-3-small';
const PROVIDER_REQUEST_TIMEOUT_MS = 45000;
const IMAGE_PROVIDER_TIMEOUT_MS = 120000;
const LONG_MEDIA_PROVIDER_TIMEOUT_MS = 45000;
const IMAGE_STATUS_STALE_MS = 180000;
const IMAGE_STATUS_HARD_TIMEOUT_MS = 1800000;
const IMAGE_STATUS_WARN_MS = 60000;
const IMAGE_PROMPT_MAX_CHARS = 4000;
const DEFAULT_AI_MARGIN_PERCENT = 30;
const DEFAULT_AI_EXCHANGE_RATE_IRT = 115000;
const AI_AUTHOR_NAME = 'دستیار هوشمند';
const MAX_PAGE_CONTEXT_RECORDS = 10;
const MAX_RETRIEVED_CONTEXTS = 4;
const KNOWLEDGE_MATCH_THRESHOLD = 0.52;
const INSTRUCTION_MATCH_THRESHOLD = 0.46;
const PRIMARY_AI_MODEL_KEY = '__primary_model';

const PRIMARY_MODEL_CAPABILITIES = new Set([
  'dashboard_chat',
  'record_chat',
  'customer_reply_suggestion',
  'document_analysis',
  'workflow_ai_prompt',
  'deep_reasoning',
  'legal_assistant',
  'web_search',
]);

const PRIMARY_MODEL_PREFERRED_IDS = [
  'gemini-3.1-flash-lite',
  'gemini-3.5-flash',
  'gpt-5.4-mini',
  'grok-4.3',
  'gpt-5.5',
  'qwen3.7-max',
  'kimi-k2.6',
];
const PRIMARY_MODEL_ALLOWED_IDS = new Set(PRIMARY_MODEL_PREFERRED_IDS);

const AI_CAPABILITY_FEATURE_KEYS: Record<string, string> = {
  dashboard_chat: 'ai_chat',
  record_chat: 'ai_chat',
  customer_reply_suggestion: 'ai_chat',
  document_analysis: 'ai_document_analysis',
  workflow_ai_prompt: 'ai_chat',
  deep_reasoning: 'ai_deep_reasoning',
  legal_assistant: 'ai_legal_assistant',
  web_search: 'ai_web_search',
  embedding: 'ai_document_analysis',
  voice_input: 'ai_voice_input',
  image_generation: 'ai_image_generation',
  voice_output: 'ai_voice_output',
  video_generation: 'ai_video_generation',
  document_generation: 'ai_document_analysis',
  voip_auto_reply: 'ai_voip_auto_reply',
};

const TENANT_READY_AI_CAPABILITIES = new Set([
  'dashboard_chat',
  'record_chat',
  'customer_reply_suggestion',
  'document_analysis',
  'workflow_ai_prompt',
  'deep_reasoning',
  'legal_assistant',
  'web_search',
  'embedding',
  'voice_input',
  'voice_output',
  'image_generation',
  'video_generation',
  'document_generation',
]);

const AUTO_ROUTER_CAPABILITIES = [
  'document_analysis',
  'voice_input',
  'voice_output',
  'image_generation',
  'video_generation',
  'document_generation',
  'web_search',
  'deep_reasoning',
  'legal_assistant',
  'record_creation',
  'process_operation',
];

const ALLOWED_MODULES = new Set([
  'productBundles',
  'purchaseInvoices',
  'priceLists',
  'marketingLeads',
  'deliveryForms',
  'salesCatalog',
  'stockTransfers',
  'productionBOM',
  'productionOrders',
  'productionGroupOrders',
  'fiscalYears',
  'chartOfAccounts',
  'journalEntries',
  'accountingEventRules',
  'costCenters',
  'cashBoxes',
  'bankAccounts',
  'pettyFunds',
  'cashBankOperations',
  'expenseDocuments',
  'attendanceLogs',
  'workSchedules',
  'leaveRequests',
  'overtimeRequests',
  'missionRequests',
  'employeeAdvances',
  'employeeBonusRequests',
  'employeePenaltyRequests',
  'employeeContracts',
  'jobDescriptions',
  'jobDescription',
  'payrollSlips',
  'recruitmentApplicants',
  'processTemplates',
  'processRuns',
  'webForms',
  'secretariatDocuments',
  'products',
  'billboards',
  'product_bundles',
  'warehouses',
  'shelves',
  'stock_transfers',
  'production_boms',
  'production_orders',
  'production_group_orders',
  'customers',
  'suppliers',
  'invoices',
  'purchase_invoices',
  'projects',
  'marketing_leads',
  'process_templates',
  'process_runs',
  'tasks',
  'calculation_formulas',
  'fiscal_years',
  'chart_of_accounts',
  'journal_entries',
  'accounting_event_rules',
  'cost_centers',
  'cash_boxes',
  'bank_accounts',
  'petty_funds',
  'cheques',
  'barters',
  'cash_bank_operations',
  'employees',
  'job_descriptions',
  'attendance_logs',
  'work_schedules',
  'leave_requests',
  'overtime_requests',
  'mission_requests',
  'price_lists',
  'web_forms',
  'warehouses',
  'shelves',
  'stock_transfers',
  'cost_centers',
  'cash_boxes',
  'bank_accounts',
  'fiscal_years',
  'expense_documents',
  'employee_advances',
]);

const MODULE_TABLE_MAP: Record<string, string> = {
  productBundles: 'product_bundles',
  purchaseInvoices: 'purchase_invoices',
  priceLists: 'price_lists',
  marketingLeads: 'marketing_leads',
  deliveryForms: 'delivery_forms',
  salesCatalog: 'sales_catalog',
  stockTransfers: 'stock_transfers',
  productionBOM: 'production_bom',
  productionOrders: 'production_orders',
  productionGroupOrders: 'production_group_orders',
  fiscalYears: 'fiscal_years',
  chartOfAccounts: 'chart_of_accounts',
  journalEntries: 'journal_entries',
  accountingEventRules: 'accounting_event_rules',
  costCenters: 'cost_centers',
  cashBoxes: 'cash_boxes',
  bankAccounts: 'bank_accounts',
  pettyFunds: 'petty_funds',
  cashBankOperations: 'cash_bank_operations',
  expenseDocuments: 'expense_documents',
  attendanceLogs: 'attendance_logs',
  workSchedules: 'work_schedules',
  leaveRequests: 'leave_requests',
  overtimeRequests: 'overtime_requests',
  missionRequests: 'mission_requests',
  employeeAdvances: 'employee_advances',
  employeeBonusRequests: 'employee_bonus_requests',
  employeePenaltyRequests: 'employee_penalty_requests',
  employeeContracts: 'employee_contracts',
  jobDescriptions: 'job_descriptions',
  jobDescription: 'job_descriptions',
  payrollSlips: 'payroll_slips',
  recruitmentApplicants: 'recruitment_applicants',
  processTemplates: 'process_templates',
  processRuns: 'process_runs',
  webForms: 'web_forms',
  secretariatDocuments: 'secretariat_documents',
  product_bundles: 'product_bundles',
  purchase_invoices: 'purchase_invoices',
  marketing_leads: 'marketing_leads',
  cash_bank_operations: 'cash_bank_operations',
  expense_documents: 'expense_documents',
  employee_advances: 'employee_advances',
  job_descriptions: 'job_descriptions',
  leave_requests: 'leave_requests',
  overtime_requests: 'overtime_requests',
  mission_requests: 'mission_requests',
  process_runs: 'process_runs',
};

const getModuleTable = (moduleId: string) => MODULE_TABLE_MAP[String(moduleId || '').trim()] || String(moduleId || '').trim();

const MODULE_ALIASES: Record<string, string[]> = {
  customers: ['مشتری', 'مشتریان', 'customer', 'customers', 'خریدار', 'کارفرما', 'مشتریم', 'خریداران', 'طرف حساب'],
  suppliers: ['تامین کننده', 'تامین‌کننده', 'تامین کنندگان', 'supplier', 'suppliers', 'فروشنده', 'تأمین', 'پیمانکار'],
  invoices: [
    'فاکتور فروش', 'فاکتور', 'صورتحساب', 'invoice', 'invoices',
    'فروش', 'فروشم', 'فروش‌ها', 'درآمد', 'درآمدم', 'revenue', 'sales',
    'فروخته', 'فروختیم', 'ثبت فروش',
  ],
  purchase_invoices: [
    'فاکتور خرید', 'خرید', 'purchase invoice', 'purchase',
    'هزینه خرید', 'خریدها', 'خریدم', 'مخارج', 'cost of purchase',
  ],
  price_lists: ['لیست قیمت', 'لیست قیمت‌ها', 'قیمت', 'price list', 'price lists', 'pricing', 'نرخ'],
  product_bundles: ['پکیج', 'پکیج‌ها', 'باندل', 'bundle', 'bundles', 'package', 'packages'],
  cash_bank_operations: [
    'پرداخت', 'پرداختی', 'دریافت', 'دریافتی', 'نقد', 'بانک', 'cash', 'bank', 'payment', 'receipt',
    'موجودی', 'حساب بانکی', 'تراکنش', 'واریز', 'برداشت',
  ],
  petty_funds: ['تنخواه', 'تنخواه گردان', 'petty', 'petty fund'],
  products: ['محصول', 'محصولات', 'کالا', 'product', 'products', 'اقلام', 'کالاها', 'جنس', 'موجودی کالا'],
  projects: ['پروژه', 'پروژه‌ها', 'project', 'projects', 'پروژه‌ام', 'پروژه‌هام'],
  tasks: ['فعالیت', 'کار', 'وظیفه', 'task', 'tasks', 'یادآوری', 'کارها', 'فعالیت‌ها', 'تسک'],
  process_runs: ['فرآیند', 'فرایند', 'مراحل', 'مرحله', 'process', 'workflow', 'گردش کار'],
  marketing_leads: ['سرنخ', 'لید', 'lead', 'leads', 'بازاریابی', 'فرصت فروش', 'مشتری بالقوه'],
  cheques: ['چک', 'cheque', 'check', 'چک‌ها', 'اسناد'],
  barters: ['تهاتر', 'barter'],
  employees: ['کارمند', 'کارکنان', 'منابع انسانی', 'employee', 'employees', 'پرسنل', 'نیروی انسانی', 'نیرو', 'کارمندم'],
  job_descriptions: ['شرح شغل', 'شرح شغل‌ها', 'شرح شغلی', 'شناسنامه شغل', 'job description', 'job descriptions', 'job role', 'نقش شغلی'],
  journal_entries: ['سند حسابداری', 'journal', 'journal entry', 'اسناد حسابداری', 'سند مالی'],
  // Warehouse / inventory
  warehouses: ['انبار', 'انبارها', 'warehouse', 'warehouses', 'موجودی انبار', 'انبارم'],
  stock_transfers: ['انتقال انبار', 'حواله انبار', 'انتقال کالا', 'stock transfer', 'حواله'],
  // Accounting
  cost_centers: ['مرکز هزینه', 'مراکز هزینه', 'cost center', 'سرفصل هزینه'],
  cash_boxes: ['صندوق', 'صندوق نقد', 'cash box', 'cashbox'],
  bank_accounts: ['حساب بانکی', 'حساب‌های بانکی', 'bank account', 'بانک‌ها', 'شماره حساب'],
  fiscal_years: ['سال مالی', 'سال‌های مالی', 'fiscal year', 'دوره مالی'],
  // HR
  attendance_logs: ['حضور غیاب', 'کارکرد', 'ورود خروج', 'حضور', 'غیاب', 'attendance'],
  leave_requests: ['مرخصی', 'درخواست مرخصی', 'leave', 'مرخصی‌ها'],
  work_schedules: ['شیفت کاری', 'برنامه کاری', 'ساعت کاری', 'work schedule', 'شیفت'],
  overtime_requests: ['اضافه‌کاری', 'اضافه کاری', 'overtime', 'اضافه وقت'],
  mission_requests: ['مأموریت', 'ماموریت', 'mission', 'مأموریت‌ها'],
  // Recruitment
  recruitmentApplicants: ['متقاضی', 'استخدام', 'recruit', 'applicant', 'جذب نیرو', 'کاریابی'],
};

const MODULE_SEARCH_FIELDS: Record<string, string[]> = {
  customers: ['full_name', 'business_name', 'name', 'mobile_1', 'mobile', 'phone', 'system_code'],
  suppliers: ['full_name', 'business_name', 'name', 'mobile_1', 'mobile', 'phone', 'system_code'],
  invoices: ['name', 'system_code', 'invoice_number', 'description'],
  purchase_invoices: ['name', 'system_code', 'invoice_number', 'description'],
  products: ['name', 'title', 'sku', 'system_code', 'description'],
  projects: ['name', 'title', 'system_code', 'description'],
  tasks: ['name', 'title', 'description', 'system_code'],
  process_runs: ['name', 'title', 'system_code', 'description'],
  marketing_leads: ['full_name', 'business_name', 'name', 'mobile_1', 'mobile', 'phone', 'system_code'],
  cash_bank_operations: ['name', 'description', 'system_code', 'tracking_code'],
  cheques: ['name', 'description', 'system_code', 'cheque_number'],
  barters: ['name', 'description', 'system_code'],
  employees: ['full_name', 'name', 'mobile_1', 'mobile', 'employee_code'],
  job_descriptions: ['name', 'system_code', 'job_goal', 'job_responsibilities', 'job_duties', 'job_requirements'],
  price_lists: ['name', 'title', 'description', 'system_code'],
  product_bundles: ['name', 'title', 'description', 'system_code'],
  warehouses: ['name', 'title', 'system_code', 'description'],
  shelves: ['name', 'title', 'system_code'],
  stock_transfers: ['name', 'system_code', 'description'],
  cost_centers: ['name', 'title', 'system_code', 'description'],
  cash_boxes: ['name', 'title', 'system_code'],
  bank_accounts: ['name', 'title', 'account_number', 'system_code'],
  fiscal_years: ['name', 'title', 'system_code'],
  leave_requests: ['name', 'system_code', 'description'],
  work_schedules: ['name', 'title', 'system_code'],
  overtime_requests: ['name', 'system_code', 'description'],
  mission_requests: ['name', 'system_code', 'description'],
};

const QUERY_STOP_WORDS = new Set([
  // Persian question / filler words
  'این', 'اون', 'اینا', 'اونا', 'برای', 'درباره', 'راجع', 'راجب',
  'چی', 'چیه', 'چطور', 'چگونه', 'چرا', 'چه', 'چند', 'چقدر',
  'کدام', 'کدوم', 'مورد', 'های', 'ها', 'من', 'تو', 'شما', 'ما',
  'هست', 'است', 'بود', 'بوده', 'بودیم', 'شده', 'شد', 'هستند',
  'داری', 'دارم', 'داریم', 'داره', 'دارند',
  'کن', 'کرد', 'کردیم', 'کنید', 'کنم',
  'بده', 'بگو', 'نشون', 'بیار', 'بریم',
  // Time words (common in analytical questions)
  'ماه', 'هفته', 'روز', 'سال', 'امروز', 'دیروز', 'امسال', 'پارسال',
  'جاری', 'گذشته', 'فعلی', 'اخیر', 'آخرین', 'اخیراً',
  'اول', 'آخر', 'شروع', 'پایان',
  // English fillers
  'the', 'and', 'with', 'about', 'what', 'who', 'how', 'when', 'where',
  'is', 'are', 'was', 'were', 'have', 'has', 'had',
  // Module names (already covered by alias filter, belt-and-suspenders)
  'customer', 'customers', 'invoice', 'invoices',
  'product', 'products', 'project', 'projects',
  'مشتری', 'مشتریان', 'فاکتور', 'محصول', 'محصولات', 'پروژه',
  'پرداخت', 'دریافت',
]);

const MANAGEMENT_DIRECTORY_KEYWORDS = [
  'مدیر',
  'سرپرست',
  'رئیس',
  'مسئول',
  'lead',
  'manager',
  'supervisor',
  'head',
  'director',
  'chief',
  'owner',
  'ceo',
];

const SENSITIVE_FIELD_PATTERNS = [
  /password/i,
  /passcode/i,
  /secret/i,
  /token/i,
  /api[_-]?key/i,
  /authorization/i,
  /cookie/i,
  /credential/i,
  /private[_-]?key/i,
  /refresh[_-]?token/i,
];

const json = (status: number, payload: Record<string, any>) =>
  new Response(JSON.stringify({ build: FUNCTION_BUILD, ...payload }), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
      'X-Kalam-Function-Build': FUNCTION_BUILD,
    },
  });

const readJsonBody = async (req: Request) => {
  const raw = await req.text();
  if (!raw.trim()) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error('بدنه درخواست JSON معتبر نیست.');
  }
};

const parseJsonSafe = (raw: string) => {
  try {
    return raw ? JSON.parse(raw) : null;
  } catch {
    return raw;
  }
};

const compactProviderRaw = (raw: any, maxLength = 4000) => {
  if (raw == null) return null;
  try {
    const text = typeof raw === 'string'
      ? raw
      : JSON.stringify(raw, (key, value) => {
        if (typeof value === 'string') {
          const lowerKey = String(key || '').toLowerCase();
          if ((lowerKey.includes('b64') || lowerKey.includes('base64') || lowerKey === 'data') && value.length > 120) {
            return `[base64 omitted: ${value.length} chars]`;
          }
          if (value.length > 1200) return `${value.slice(0, 1200)}…`;
        }
        return value;
      }, 2);
    return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text;
  } catch {
    const text = String(raw || '');
    return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text;
  }
};

const normalizeAiContentText = (value: any): string => {
  if (value == null) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value).trim();
  }
  if (Array.isArray(value)) {
    return value.map((item) => normalizeAiContentText(item)).filter(Boolean).join('\n').trim();
  }
  if (typeof value !== 'object') return '';
  const type = String(value?.type || '').trim().toLowerCase();
  if (type === 'text' || type === 'output_text' || type === 'input_text' || type === 'message') {
    const direct = String(value?.text || value?.content || value?.value || '').trim();
    if (direct) return direct;
  }
  if (Array.isArray(value?.content)) {
    return value.content.map((item: any) => normalizeAiContentText(item)).filter(Boolean).join('\n').trim();
  }
  return '';
};

const normalizeAiContentAttachments = (value: any): Array<Record<string, any>> => {
  const results: Array<Record<string, any>> = [];
  const seen = new Set<string>();
  const visit = (item: any) => {
    if (item == null) return;
    if (Array.isArray(item)) {
      item.forEach((entry) => visit(entry));
      return;
    }
    if (typeof item !== 'object') return;
    const url = String(
      item?.url
      || item?.file_url
      || item?.download_url
      || item?.media_url
      || item?.link_url
      || item?.image_url?.url
      || item?.image_url
      || ''
    ).trim();
    if (url && !seen.has(url)) {
      seen.add(url);
      const fallbackName = String(url.split('?')[0].split('#')[0].split('/').pop() || 'file').trim() || 'file';
      results.push({
        name: String(item?.name || item?.file_name || item?.fileName || item?.filename || fallbackName).trim() || fallbackName,
        url,
        mimeType: String(item?.mimeType || item?.mime_type || '').trim() || null,
        fileType: String(item?.fileType || item?.file_type || item?.media_type || item?.kind || item?.type || '').trim() || null,
      });
    }
    if (Array.isArray(item?.content)) visit(item.content);
  };
  visit(value);
  return results;
};

const normalizeBaseUrl = (value: string) => {
  const raw = String(value || DEFAULT_AI_BASE_URL).trim().replace(/\/+$/, '');
  if (!raw) return DEFAULT_AI_BASE_URL;
  if (/^https?:\/\//i.test(raw)) return raw;
  return `https://${raw}`;
};

const normalizeBaseUrlList = (value: string, fallback = '') =>
  String(value || fallback || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .map(normalizeBaseUrl);

const uniqueBaseUrls = (...groups: string[][]) => {
  const seen = new Set<string>();
  const urls: string[] = [];
  groups.flat().forEach((url) => {
    const normalized = normalizeBaseUrl(url);
    const key = normalized.toLowerCase();
    if (!normalized || seen.has(key)) return;
    seen.add(key);
    urls.push(normalized);
  });
  return urls;
};

const getEnvProviderConfig = () => ({
  provider: String(Deno.env.get('AI_PROVIDER') || Deno.env.get('AVALAI_PROVIDER') || 'avalai').trim() || 'avalai',
  baseUrl: normalizeBaseUrl(Deno.env.get('AI_BASE_URL') || Deno.env.get('AVALAI_BASE_URL') || DEFAULT_AI_BASE_URL),
  fallbackBaseUrls: normalizeBaseUrlList(
    Deno.env.get('AI_FALLBACK_BASE_URLS') || Deno.env.get('AVALAI_FALLBACK_BASE_URLS') || Deno.env.get('AVALAI_FALLBACK_BASE_URL'),
    DEFAULT_AI_FALLBACK_BASE_URL,
  ),
  model: String(Deno.env.get('AI_MODEL') || Deno.env.get('AVALAI_MODEL') || DEFAULT_AI_MODEL).trim() || DEFAULT_AI_MODEL,
  apiKey: String(Deno.env.get('AI_API_KEY') || Deno.env.get('AVALAI_API_KEY') || Deno.env.get('OPENAI_API_KEY') || '').trim(),
  isActive: true,
  source: 'env',
});

const isRetryableProviderStatus = (status: number) => status === 408 || status === 409 || status === 425 || status === 429 || status >= 500;

const isProviderTimeoutError = (error: any) => {
  const text = `${String(error?.name || '')} ${String(error?.message || error || '')}`;
  return /abort|timeout|timed out|upstream server is timing out|request has been cancelled/i.test(text);
};

const requestAvalaiWithFallback = async (
  providerConfig: any,
  path: string,
  init: RequestInit,
  options?: { stripVersionForPath?: boolean; disableFallback?: boolean },
) => {
  const baseUrls = options?.disableFallback ? [providerConfig?.baseUrl || DEFAULT_AI_BASE_URL] : uniqueBaseUrls(
    [providerConfig?.baseUrl || DEFAULT_AI_BASE_URL],
    Array.isArray(providerConfig?.fallbackBaseUrls) ? providerConfig.fallbackBaseUrls : [],
  );
  let lastError: any = null;

  for (const baseUrl of baseUrls) {
    const base = options?.stripVersionForPath
      ? normalizeBaseUrl(baseUrl).replace(/\/v\d+$/i, '')
      : normalizeBaseUrl(baseUrl);
    const url = `${base}${path.startsWith('/') ? path : `/${path}`}`;
    try {
      const response = await fetch(url, init);
      if (response.ok || !isRetryableProviderStatus(response.status) || baseUrl === baseUrls[baseUrls.length - 1]) {
        return { response, baseUrl };
      }
      lastError = new Error(`AvalAI retryable status ${response.status} from ${baseUrl}`);
    } catch (error) {
      lastError = error;
      if (isProviderTimeoutError(error)) {
        throw new Error('سرویس هوش مصنوعی در زمان مناسب پاسخ نداد. درخواست متوقف شد تا سرور دچار timeout نشود؛ چند لحظه بعد دوباره تلاش کنید یا مدل سریع‌تری انتخاب کنید.');
      }
      if (baseUrl === baseUrls[baseUrls.length - 1]) throw error;
    }
  }

  throw lastError || new Error('اتصال به AvalAI برقرار نشد.');
};

const getServiceHeaders = (serviceRoleKey: string, preferRepresentation = false) => ({
  apikey: serviceRoleKey,
  Authorization: `Bearer ${serviceRoleKey}`,
  'Content-Type': 'application/json',
  ...(preferRepresentation ? { Prefer: 'return=representation' } : {}),
});

const restUrl = (supabaseUrl: string, table: string, params: Record<string, string | number | boolean | null | undefined>) => {
  const url = new URL(`${supabaseUrl.replace(/\/+$/, '')}/rest/v1/${table}`);
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value !== null && value !== undefined) url.searchParams.set(key, String(value));
  });
  return url.toString();
};

const restSelect = async (
  supabaseUrl: string,
  serviceRoleKey: string,
  table: string,
  params: Record<string, string | number | boolean | null | undefined>,
) => {
  const response = await fetch(restUrl(supabaseUrl, table, params), {
    method: 'GET',
    headers: getServiceHeaders(serviceRoleKey),
  });
  const raw = await response.text();
  const parsed = parseJsonSafe(raw);
  if (!response.ok) {
    throw new Error(typeof parsed === 'string' ? parsed : JSON.stringify(parsed || {}));
  }
  return Array.isArray(parsed) ? parsed : [];
};

const safeRestSelect = async (
  supabaseUrl: string,
  serviceRoleKey: string,
  table: string,
  params: Record<string, string | number | boolean | null | undefined>,
) => {
  try {
    return await restSelect(supabaseUrl, serviceRoleKey, table, params);
  } catch {
    return [];
  }
};

const restInsert = async (
  supabaseUrl: string,
  serviceRoleKey: string,
  table: string,
  rows: Record<string, any>[],
) => {
  const response = await fetch(restUrl(supabaseUrl, table, { select: '*' }), {
    method: 'POST',
    headers: getServiceHeaders(serviceRoleKey, true),
    body: JSON.stringify(rows),
  });
  const raw = await response.text();
  const parsed = parseJsonSafe(raw);
  if (!response.ok) {
    throw new Error(typeof parsed === 'string' ? parsed : JSON.stringify(parsed || {}));
  }
  return Array.isArray(parsed) ? parsed : [];
};

const restUpsert = async (
  supabaseUrl: string,
  serviceRoleKey: string,
  table: string,
  rows: Record<string, any>[],
  onConflict: string,
) => {
  const response = await fetch(restUrl(supabaseUrl, table, { select: '*', on_conflict: onConflict }), {
    method: 'POST',
    headers: {
      ...getServiceHeaders(serviceRoleKey, true),
      Prefer: 'resolution=merge-duplicates,return=representation',
    },
    body: JSON.stringify(rows),
  });
  const raw = await response.text();
  const parsed = parseJsonSafe(raw);
  if (!response.ok) {
    throw new Error(typeof parsed === 'string' ? parsed : JSON.stringify(parsed || {}));
  }
  return Array.isArray(parsed) ? parsed : [];
};

const restPatch = async (
  supabaseUrl: string,
  serviceRoleKey: string,
  table: string,
  filters: Record<string, string | number | boolean | null | undefined>,
  payload: Record<string, any>,
) => {
  const response = await fetch(restUrl(supabaseUrl, table, { ...filters, select: '*' }), {
    method: 'PATCH',
    headers: getServiceHeaders(serviceRoleKey, true),
    body: JSON.stringify(payload),
  });
  const raw = await response.text();
  const parsed = parseJsonSafe(raw);
  if (!response.ok) {
    throw new Error(typeof parsed === 'string' ? parsed : JSON.stringify(parsed || {}));
  }
  return Array.isArray(parsed) ? parsed : [];
};

const restDelete = async (
  supabaseUrl: string,
  serviceRoleKey: string,
  table: string,
  filters: Record<string, string | number | boolean | null | undefined>,
) => {
  const response = await fetch(restUrl(supabaseUrl, table, filters), {
    method: 'DELETE',
    headers: getServiceHeaders(serviceRoleKey),
  });
  const raw = await response.text();
  const parsed = parseJsonSafe(raw);
  if (!response.ok) {
    throw new Error(typeof parsed === 'string' ? parsed : JSON.stringify(parsed || {}));
  }
  return Array.isArray(parsed) ? parsed : [];
};

const restRpc = async (
  supabaseUrl: string,
  serviceRoleKey: string,
  fnName: string,
  payload: Record<string, any>,
) => {
  const response = await fetch(`${supabaseUrl.replace(/\/+$/, '')}/rest/v1/rpc/${fnName}`, {
    method: 'POST',
    headers: getServiceHeaders(serviceRoleKey),
    body: JSON.stringify(payload || {}),
  });
  const raw = await response.text();
  const parsed = parseJsonSafe(raw);
  if (!response.ok) {
    throw new Error(typeof parsed === 'string' ? parsed : JSON.stringify(parsed || {}));
  }
  return parsed;
};

const verifyUserToken = async (supabaseUrl: string, serviceRoleKey: string, userToken: string) => {
  const response = await fetch(`${supabaseUrl.replace(/\/+$/, '')}/auth/v1/user`, {
    method: 'GET',
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${userToken}`,
    },
  });

  if (!response.ok) {
    throw new Error('نشست شما معتبر نیست. دوباره وارد حساب کاربری شوید.');
  }

  const user = await response.json();
  if (!user?.id) throw new Error('نشست شما معتبر نیست. دوباره وارد حساب کاربری شوید.');
  return user;
};

const normalizeId = (value: any) => String(value || '').trim();
const isUuid = (value: any) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value || '').trim());

const getResolvedAssigneeId = (source: any) => {
  if (!source || typeof source !== 'object') return '';
  const normalizedType = String(source?.assignee_type || '').trim().toLowerCase();
  const prefersRoleAssignee = normalizedType === 'role' || (!normalizedType && source?.assignee_role_id);
  const rawValue = prefersRoleAssignee ? (source?.assignee_role_id ?? source?.assignee_id) : source?.assignee_id;
  return normalizeId(rawValue);
};

const computeDescendantRoleIds = (roleId: string | null, roles: any[]) => {
  const rootId = normalizeId(roleId);
  if (!rootId) return new Set<string>();

  const childrenByParent = new Map<string, string[]>();
  (roles || []).forEach((role) => {
    const id = normalizeId(role?.id);
    const parentId = normalizeId(role?.parent_id);
    if (!id || !parentId) return;
    const next = childrenByParent.get(parentId) || [];
    next.push(id);
    childrenByParent.set(parentId, next);
  });

  const result = new Set<string>([rootId]);
  const stack = [rootId];
  while (stack.length) {
    const current = stack.pop();
    (childrenByParent.get(current) || []).forEach((childId) => {
      if (result.has(childId)) return;
      result.add(childId);
      stack.push(childId);
    });
  }
  return result;
};

const buildRolePath = (roleId: string | null, roles: any[]) => {
  const byId = new Map((roles || []).map((role) => [String(role?.id || ''), role]));
  const path: any[] = [];
  const seen = new Set<string>();
  let cursor = normalizeId(roleId);
  while (cursor && !seen.has(cursor)) {
    seen.add(cursor);
    const role = byId.get(cursor);
    if (!role) break;
    path.push({ id: role.id, title: role.title || role.name || role.id, parent_id: role.parent_id || null });
    cursor = normalizeId(role.parent_id);
  }
  return path.reverse();
};

const loadUserContext = async (supabaseUrl: string, serviceRoleKey: string, user: any) => {
  const profiles = await restSelect(supabaseUrl, serviceRoleKey, 'profiles', {
    id: `eq.${user.id}`,
    select: 'id,org_id,role_id,full_name,email,mobile_1,mobile,job_title,position,team',
    limit: 1,
  });
  const profile = profiles[0];
  if (!profile?.id) throw new Error('پروفایل کاربر پیدا نشد.');

  let allowedRoleIds = new Set<string>();
  let allowedUserIds = new Set<string>();
  const orgId = normalizeId(profile.org_id);
  const allRoles = orgId
    ? await safeRestSelect(supabaseUrl, serviceRoleKey, 'org_roles', {
        org_id: `eq.${orgId}`,
        select: 'id,org_id,title,permissions,parent_id',
        limit: 1000,
      })
    : [];
  const role = allRoles.find((item) => normalizeId(item?.id) === normalizeId(profile.role_id)) || null;

  if (orgId && profile.role_id) {
    allowedRoleIds = computeDescendantRoleIds(profile.role_id, allRoles);
    const roleIdList = Array.from(allowedRoleIds).filter(isUuid);
    if (roleIdList.length > 0) {
      const users = await safeRestSelect(supabaseUrl, serviceRoleKey, 'profiles', {
        org_id: `eq.${orgId}`,
        role_id: `in.(${roleIdList.join(',')})`,
        select: 'id,role_id,full_name',
        limit: 2000,
      });
      users.forEach((row) => {
        if (row?.id) allowedUserIds.add(String(row.id));
      });
    }
  }
  if (profile.id) allowedUserIds.add(String(profile.id));

  const rolePath = buildRolePath(profile.role_id, allRoles);
  const roleById = new Map((allRoles || []).map((item) => [String(item?.id || ''), item]));
  const subordinateRoles = Array.from(allowedRoleIds)
    .filter((id) => id !== normalizeId(profile.role_id))
    .map((id) => ({ id, title: roleById.get(id)?.title || id }));

  return {
    user,
    profile,
    role,
    orgId: orgId || null,
    userId: String(profile.id),
    roleId: profile.role_id ? String(profile.role_id) : null,
    permissions: role?.permissions && typeof role.permissions === 'object' ? role.permissions : null,
    allowedRoleIds,
    allowedUserIds,
    rolePath,
    subordinateRoles,
  };
};

const isMissingRelationError = (error: any) => {
  const message = String(error?.message || error || '').toLowerCase();
  return (
    message.includes('could not find the table') ||
    message.includes('relation') && message.includes('does not exist') ||
    message.includes('pgrst205') ||
    message.includes('pgrst204') ||
    message.includes('42703') ||
    message.includes('42p01')
  );
};

const canManageAiSettings = (authContext: any) => {
  const permissions = authContext?.permissions;
  if (!permissions || typeof permissions !== 'object') return true;
  const settingsPerm = permissions?.__settings_tabs || {};
  const fields = settingsPerm?.fields || {};
  return settingsPerm?.view !== false
    && settingsPerm?.edit !== false
    && fields?.ai !== false
    && fields?.ai_settings !== false;
};

const canRebuildInstructionAiContext = (authContext: any) => {
  const permissions = authContext?.permissions;
  if (!permissions || typeof permissions !== 'object') return true;
  const perm = permissions?.instructions || {};
  const fields = perm?.fields || {};
  return perm?.view !== false
    && perm?.edit !== false
    && fields?.__action_rebuild_instruction_ai_context !== false;
};

const canRebuildJobDescriptionAiContext = (authContext: any) => {
  const permissions = authContext?.permissions;
  if (!permissions || typeof permissions !== 'object') return true;
  const perm = permissions?.job_descriptions || {};
  const fields = perm?.fields || {};
  return perm?.view !== false
    && perm?.edit !== false
    && fields?.__action_rebuild_job_description_ai_context !== false;
};

const canViewSaasAdmin = (authContext: any) => {
  const permissions = authContext?.permissions;
  if (!permissions || typeof permissions !== 'object') return false;
  const perm = permissions?.__saas_admin || {};
  return perm?.view === true || perm?.edit === true || perm?.demo_override === true;
};

const truthyPlanFeature = (value: any) => {
  if (value === true) return true;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return normalized === 'true' || normalized === 'enabled' || normalized === 'full' || normalized === 'limited';
  }
  if (value && typeof value === 'object') return value.enabled === true || value.available === true;
  return false;
};

const loadTenantAiPlanContext = async (supabaseUrl: string, serviceRoleKey: string, authContext: any) => {
  if (!authContext?.orgId) {
    return { available: false, planCode: null, features: {}, reason: 'missing_org' };
  }
  const orgRows = await safeRestSelect(supabaseUrl, serviceRoleKey, 'saas_org_settings', {
    org_id: `eq.${authContext.orgId}`,
    select: 'org_id,plan_code,feature_overrides,status,is_readonly',
    limit: 1,
  });
  const orgSettings = orgRows[0] || null;
  if (!orgSettings) {
    return {
      available: canViewSaasAdmin(authContext),
      planCode: null,
      features: canViewSaasAdmin(authContext)
        ? Object.fromEntries(Object.values(AI_CAPABILITY_FEATURE_KEYS).map((key) => [key, true]))
        : {},
      reason: canViewSaasAdmin(authContext) ? 'saas_admin_internal' : 'missing_saas_org_settings',
    };
  }
  const planCode = String(orgSettings?.plan_code || '').trim();
  const planRows = planCode
    ? await safeRestSelect(supabaseUrl, serviceRoleKey, 'saas_plans', {
        code: `eq.${planCode}`,
        select: 'code,enabled_features,is_active',
        limit: 1,
      })
    : [];
  const plan = planRows[0] || null;
  const merged = {
    ...(plan?.enabled_features && typeof plan.enabled_features === 'object' ? plan.enabled_features : {}),
    ...(orgSettings?.feature_overrides && typeof orgSettings.feature_overrides === 'object' ? orgSettings.feature_overrides : {}),
  };
  return {
    available: Boolean(plan?.is_active !== false),
    planCode,
    features: merged,
    status: orgSettings?.status || null,
    isReadonly: orgSettings?.is_readonly === true,
    reason: plan ? null : 'missing_plan',
  };
};

const isAiCapabilityPlanAvailable = (planContext: any, capability: string) => {
  const normalized = String(capability || '').trim();
  const featureKey = AI_CAPABILITY_FEATURE_KEYS[normalized];
  if (!featureKey) return true;
  if (!planContext?.available) return false;
  if (normalized === 'dashboard_chat' || normalized === 'record_chat' || normalized === 'workflow_ai_prompt' || normalized === 'customer_reply_suggestion') {
    return truthyPlanFeature(planContext?.features?.[featureKey]) || truthyPlanFeature(planContext?.features?.ai_knowledge);
  }
  if (normalized === 'document_analysis' || normalized === 'embedding') {
    return truthyPlanFeature(planContext?.features?.[featureKey]) || truthyPlanFeature(planContext?.features?.ai_knowledge);
  }
  return truthyPlanFeature(planContext?.features?.[featureKey]);
};

const buildAiCapabilityAvailability = (planContext: any, settings: any, catalogRows: any[] = []) => {
  const selected = settings?.feature_flags && typeof settings.feature_flags === 'object' ? settings.feature_flags : {};
  const catalogByCapability = new Map<string, any[]>();
  (catalogRows || []).forEach((model: any) => {
    const tags = Array.isArray(model?.capability_tags) ? model.capability_tags : [];
    tags.forEach((tag: string) => {
      const next = catalogByCapability.get(tag) || [];
      next.push(model);
      catalogByCapability.set(tag, next);
    });
  });
  const result: Record<string, any> = {};
  Object.keys(AI_CAPABILITY_FEATURE_KEYS).forEach((capability) => {
    const planAvailable = isAiCapabilityPlanAvailable(planContext, capability);
    const hasReadyModel = capability === 'embedding' || (catalogByCapability.get(capability) || [])
      .some((model: any) => model?.is_active !== false && model?.is_coming_soon !== true);
    const tenantReady = TENANT_READY_AI_CAPABILITIES.has(capability);
    const orgEnabled = selected?.[capability] !== false;
    result[capability] = {
      planAvailable,
      tenantReady,
      hasReadyModel,
      enabled: planAvailable && tenantReady && hasReadyModel && orgEnabled,
      featureKey: AI_CAPABILITY_FEATURE_KEYS[capability],
    };
  });
  return result;
};

const assertAiCapabilityEnabled = async (
  supabaseUrl: string,
  serviceRoleKey: string,
  authContext: any,
  settings: any,
  capability: string,
) => {
  const planContext = await loadTenantAiPlanContext(supabaseUrl, serviceRoleKey, authContext);
  const flags = settings?.feature_flags && typeof settings.feature_flags === 'object' ? settings.feature_flags : {};
  const normalized = String(capability || '').trim();
  if (!TENANT_READY_AI_CAPABILITIES.has(normalized)) {
    throw new Error('این قابلیت هوش مصنوعی هنوز برای استفاده سازمانی آماده نشده است.');
  }
  if (!isAiCapabilityPlanAvailable(planContext, normalized)) {
    throw new Error('این قابلیت در پلن فعلی سازمان فعال نیست.');
  }
  if (flags?.[normalized] === false) {
    throw new Error('این قابلیت در تنظیمات هوش مصنوعی سازمان غیرفعال است.');
  }
  return planContext;
};

const filterSelectableAiModels = (models: any[], capability: string) =>
  (models || []).filter((model: any) => {
    const tags = Array.isArray(model?.capability_tags) ? model.capability_tags : [];
    return model?.is_active !== false
      && model?.is_coming_soon !== true
      && tags.includes(capability);
  });

const pickPreferredPrimaryAiModel = (models: any[]) => {
  const candidates = (models || []).filter((model: any) => {
    const tags = Array.isArray(model?.capability_tags) ? model.capability_tags : [];
    return model?.is_active !== false
      && model?.is_coming_soon !== true
      && PRIMARY_MODEL_ALLOWED_IDS.has(String(model?.id || '').trim())
      && tags.some((tag: string) => PRIMARY_MODEL_CAPABILITIES.has(String(tag || '').trim()));
  });
  const byId = new Map(candidates.map((model: any) => [String(model?.id || '').trim(), model]).filter(([id]) => id));
  for (const preferredId of PRIMARY_MODEL_PREFERRED_IDS) {
    if (byId.has(preferredId)) return preferredId;
  }
  const scored = candidates
    .map((model: any) => {
      const tags = Array.isArray(model?.capability_tags) ? model.capability_tags : [];
      const coverage = tags.filter((tag: string) => PRIMARY_MODEL_CAPABILITIES.has(String(tag || '').trim())).length;
      const tier = String(model?.metadata?.tier || '').toLowerCase();
      const economyBonus = tier === 'economy' ? 4 : tier === 'balanced' ? 2 : 0;
      const inputCost = Number(model?.input_usd_per_1m || 0);
      const outputCost = Number(model?.output_usd_per_1m || 0);
      const costPenalty = Number.isFinite(inputCost + outputCost) ? Math.min(5, (inputCost + outputCost) / 2) : 2;
      return { id: String(model?.id || '').trim(), score: coverage + economyBonus - costPenalty };
    })
    .filter((item: any) => item.id)
    .sort((a: any, b: any) => b.score - a.score);
  return scored[0]?.id || '';
};

const sanitizeTenantSelectedModels = (models: any[], selectedModels: Record<string, any>) => {
  const next: Record<string, string> = {};
  const primaryCandidates = (models || []).filter((model: any) => {
    const tags = Array.isArray(model?.capability_tags) ? model.capability_tags : [];
    return model?.is_active !== false
      && model?.is_coming_soon !== true
      && PRIMARY_MODEL_ALLOWED_IDS.has(String(model?.id || '').trim())
      && tags.some((tag: string) => PRIMARY_MODEL_CAPABILITIES.has(String(tag || '').trim()));
  });
  const requestedPrimary = String(selectedModels?.[PRIMARY_AI_MODEL_KEY] || '').trim();
  const primaryIds = new Set(primaryCandidates.map((model: any) => String(model?.id || '').trim()).filter(Boolean));
  const primaryModel = primaryIds.has(requestedPrimary)
    ? requestedPrimary
    : pickPreferredPrimaryAiModel(primaryCandidates);
  if (primaryModel) next[PRIMARY_AI_MODEL_KEY] = primaryModel;
  Object.keys(AI_CAPABILITY_FEATURE_KEYS).forEach((capability) => {
    if (capability === 'embedding') return;
    const requested = String(selectedModels?.[capability] || '').trim();
    const allowed = filterSelectableAiModels(models, capability);
    const allowedIds = new Set(allowed.map((model: any) => String(model?.id || '').trim()).filter(Boolean));
    const resolved = PRIMARY_MODEL_CAPABILITIES.has(capability) && primaryModel && allowedIds.has(primaryModel)
      ? primaryModel
      : allowedIds.has(requested) ? requested : String(allowed[0]?.id || requested || '').trim();
    if (resolved) next[capability] = resolved;
  });
  return next;
};

const sanitizeTenantFeatureFlags = (availability: Record<string, any>, incoming: Record<string, any>) => {
  const result: Record<string, boolean> = {};
  Object.keys(availability || {}).forEach((capability) => {
    const requested = incoming?.[capability] === true;
    result[capability] = requested && availability[capability]?.planAvailable === true && availability[capability]?.tenantReady === true && availability[capability]?.hasReadyModel !== false;
  });
  return result;
};

const loadOrgAiSettings = async (supabaseUrl: string, serviceRoleKey: string, authContext: any) => {
  if (!authContext?.orgId) return null;
  try {
    const rows = await restSelect(supabaseUrl, serviceRoleKey, 'org_ai_settings', {
      org_id: `eq.${authContext.orgId}`,
      select: '*',
      limit: 1,
    });
    return rows[0] || null;
  } catch (error) {
    if (isMissingRelationError(error)) return null;
    throw error;
  }
};

const listActiveAiModels = async (supabaseUrl: string, serviceRoleKey: string) =>
  safeRestSelect(supabaseUrl, serviceRoleKey, 'ai_model_catalog', {
    is_active: 'eq.true',
    select: 'id,capability_tags,is_coming_soon',
    order: 'id.asc',
    limit: 500,
  }).catch(() => []);

const pickCapabilityModelFromCatalog = (
  settings: any,
  capability: string,
  catalogRows: any[],
  requestedOverride?: string | null,
) => {
  const selected = settings?.selected_models && typeof settings.selected_models === 'object'
    ? settings.selected_models
    : {};
  const allowed = filterSelectableAiModels(catalogRows, capability);
  const allowedIds = new Set(allowed.map((model: any) => String(model?.id || '').trim()).filter(Boolean));
  const primaryModel = String(selected?.[PRIMARY_AI_MODEL_KEY] || '').trim();
  const requested = String(requestedOverride || (PRIMARY_MODEL_CAPABILITIES.has(capability) && allowedIds.has(primaryModel) ? primaryModel : selected?.[capability]) || '').trim();
  if (requested && allowedIds.has(requested)) return requested;
  return String(allowed[0]?.id || '').trim();
};

const resolveOrgCapabilityModel = async (
  supabaseUrl: string,
  serviceRoleKey: string,
  settings: any,
  capability: string,
  requestedOverride?: string | null,
) => {
  const catalogRows = await listActiveAiModels(supabaseUrl, serviceRoleKey);
  const model = pickCapabilityModelFromCatalog(settings, capability, catalogRows, requestedOverride);
  if (model) return model;
  throw new Error('برای این قابلیت هوش مصنوعی، مدل فعال و قابل استفاده در تنظیمات سازمان پیدا نشد.');
};

const getCentralProviderConfig = () => {
  const envConfig = getEnvProviderConfig();
  return {
    provider: String(envConfig.provider || 'avalai').trim() || 'avalai',
    baseUrl: normalizeBaseUrl(envConfig.baseUrl || DEFAULT_AI_BASE_URL),
    fallbackBaseUrls: Array.isArray(envConfig.fallbackBaseUrls) ? envConfig.fallbackBaseUrls : [DEFAULT_AI_FALLBACK_BASE_URL],
    model: String(envConfig.model || DEFAULT_AI_MODEL).trim() || DEFAULT_AI_MODEL,
    apiKey: String(envConfig.apiKey || '').trim(),
    isActive: true,
    source: 'central',
  };
};

const resolveProviderConfig = async (
  supabaseUrl: string,
  serviceRoleKey: string,
  authContext: any,
  capability = 'dashboard_chat',
  options: { modelOverride?: string | null } = {},
) => {
  const centralConfig = getCentralProviderConfig();
  const settings = await loadOrgAiSettings(supabaseUrl, serviceRoleKey, authContext);
  const model = await resolveOrgCapabilityModel(
    supabaseUrl,
    serviceRoleKey,
    settings,
    capability,
    options?.modelOverride,
  );
  return {
    ...centralConfig,
    model,
    capability,
    orgAiSettings: settings,
  };
};

const getModulePermission = (permissions: any, moduleId: string) => {
  if (!permissions || typeof permissions !== 'object') return {};
  const perm = permissions?.[moduleId];
  return perm && typeof perm === 'object' ? perm : {};
};

const getRecordScope = (perm: any) => {
  const value = String(perm?.record_scope || '').trim();
  if (value === 'own' || value === 'team' || value === 'subtree' || value === 'all') return value;
  return perm?.view === false ? 'own' : 'all';
};

const canAccessAssignedRecord = (record: any, authContext: any, recordScope = 'all') => {
  if (!record) return false;
  const currentOrgId = normalizeId(authContext?.orgId);
  const recordOrgId = normalizeId(record?.org_id);
  if (currentOrgId && !recordOrgId) return false;
  if (currentOrgId && recordOrgId && currentOrgId !== recordOrgId) return false;
  if (recordScope === 'all') return true;

  const resolvedAssigneeId = getResolvedAssigneeId(record);
  if (!resolvedAssigneeId) return false;

  if (recordScope === 'team') {
    return !!authContext.roleId && record?.assignee_type === 'role' && resolvedAssigneeId === authContext.roleId;
  }

  if (recordScope === 'subtree') {
    const allowedRoleIds = authContext.allowedRoleIds || new Set<string>();
    const allowedUserIds = authContext.allowedUserIds || new Set<string>();
    if (record?.assignee_type === 'role') return allowedRoleIds.has(resolvedAssigneeId);
    if (record?.assignee_type === 'user') return allowedUserIds.has(resolvedAssigneeId);
    return false;
  }

  return !!authContext.userId && record?.assignee_type === 'user' && resolvedAssigneeId === authContext.userId;
};

const canViewModule = (perm: any) => perm?.view !== false;
const canCreateModule = (perm: any) => perm?.create !== false && perm?.edit !== false && perm?.view !== false;

const canViewReports = (authContext: any) => {
  const perm = authContext?.permissions?.__reports || {};
  const fields = perm?.fields || {};
  return perm?.view !== false && fields?.hub_page !== false;
};

const isSensitiveField = (key: string) => {
  const normalized = String(key || '').trim();
  if (!normalized || normalized.startsWith('__')) return true;
  return SENSITIVE_FIELD_PATTERNS.some((pattern) => pattern.test(normalized));
};

const serializeFieldValue = (value: any) => {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return value.length > 1400 ? `${value.slice(0, 1400)}...` : value;
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  try {
    const serialized = JSON.stringify(value);
    return serialized.length > 1400 ? `${serialized.slice(0, 1400)}...` : value;
  } catch {
    return String(value);
  }
};

const sanitizeRecord = (record: any, perm: any) => {
  const fields = perm?.fields && typeof perm.fields === 'object' ? perm.fields : {};
  const result: Record<string, any> = {};
  Object.entries(record || {}).forEach(([key, value]) => {
    if (isSensitiveField(key)) return;
    if (Object.prototype.hasOwnProperty.call(fields, key) && fields[key] === false) return;
    result[key] = serializeFieldValue(value);
  });
  return result;
};

const normalizeContext = (context: RequestContext | null | undefined): RequestContext => ({
  route: String(context?.route || '').trim(),
  mode: String(context?.mode || '').trim() || 'page',
  moduleId: context?.moduleId ? String(context.moduleId).trim() : null,
  recordId: context?.recordId ? String(context.recordId).trim() : null,
  visibleRecordIds: Array.isArray(context?.visibleRecordIds) ? context.visibleRecordIds.map(String) : [],
  selectedRecordIds: Array.isArray(context?.selectedRecordIds) ? context.selectedRecordIds.map(String) : [],
  intent: String(context?.intent || '').trim() || undefined,
  processFieldKey: context?.processFieldKey ? String(context.processFieldKey).trim() : null,
  selectedProcessId: context?.selectedProcessId ? String(context.selectedProcessId).trim() : null,
  selectedProcessGroupId: context?.selectedProcessGroupId ? String(context.selectedProcessGroupId).trim() : null,
  processGuideContext: context?.processGuideContext && typeof context.processGuideContext === 'object'
    ? context.processGuideContext
    : null,
  availableProcesses: Array.isArray(context?.availableProcesses)
    ? context.availableProcesses
        .map((item) => ({
          id: String(item?.id || '').trim(),
          label: String(item?.label || '').trim(),
          templateId: item?.templateId ? String(item.templateId).trim() : null,
          templateName: item?.templateName ? String(item.templateName).trim() : null,
          stageCount: Number(item?.stageCount || 0) || 0,
        }))
        .filter((item) => item.id && item.label)
    : [],
});

const normalizeIds = (ids: any[]) => Array.from(
  new Set((ids || []).map((id) => normalizeId(id)).filter(isUuid))
);

const buildContextKey = (rawContext: RequestContext) => {
  const context = normalizeContext(rawContext);
  if (context.intent === 'process_guide' && context.moduleId) {
    const processId = context.selectedProcessId || context.selectedProcessGroupId || 'unknown';
    return `process_guide:${context.moduleId}:${context.recordId || 'page'}:${context.processFieldKey || 'process'}:${processId}`;
  }
  if (context.mode === 'record' && context.moduleId && context.recordId) return `record:${context.moduleId}:${context.recordId}`;
  const route = String(context.route || '').split('#')[0].trim();
  if (route) return `route:${route}`;
  if (context.moduleId) return `${context.mode || 'page'}:${context.moduleId}`;
  return 'page:unknown';
};

const getContextKind = (context: RequestContext | null | undefined) => {
  const normalized = normalizeContext(context || {});
  if (normalized.intent === 'process_guide') return 'process_guide';
  if (normalized.mode === 'record' && normalized.moduleId && normalized.recordId) return 'record';
  if (normalized.moduleId) return normalized.mode === 'list' ? 'module_page' : 'module';
  if (normalized.route) return 'page';
  return 'general';
};

const buildThreadContextLabel = (pageContext: any) => {
  const context = normalizeContext(pageContext?.context || {});
  if (context.intent === 'process_guide') {
    const processLabel = (context.availableProcesses || [])
      .find((item: any) => String(item?.id || '') === String(context.selectedProcessId || context.selectedProcessGroupId || ''))?.label;
    return `راهنمای فرآیند${processLabel ? `: ${processLabel}` : ''}`;
  }
  if (context.mode === 'record' && pageContext?.moduleId && pageContext?.recordId) {
    return `رکورد ${pageContext.moduleId}`;
  }
  if (pageContext?.moduleId) {
    return context.mode === 'list' ? `صفحه لیست ${pageContext.moduleId}` : `ماژول ${pageContext.moduleId}`;
  }
  if (context.route) return `صفحه ${context.route}`;
  return 'گفتگوی عمومی';
};

const buildThreadTitle = (title: string, pageContext: any) => {
  const base = String(title || '').trim();
  const label = buildThreadContextLabel(pageContext);
  if (!base) return label.slice(0, 120);
  if (base.includes(label)) return base.slice(0, 120);
  return `${base} · ${label}`.slice(0, 120);
};

const fetchRowsWithFallback = async (
  supabaseUrl: string,
  serviceRoleKey: string,
  moduleId: string,
  params: Record<string, string | number>,
) => {
  try {
    return await restSelect(supabaseUrl, serviceRoleKey, moduleId, params);
  } catch (firstError) {
    if (String(params?.order || '').startsWith('updated_at')) {
      return await restSelect(supabaseUrl, serviceRoleKey, moduleId, { ...params, order: 'created_at.desc' });
    }
    if (String(params?.order || '').startsWith('created_at')) {
      const next = { ...params };
      delete next.order;
      return await restSelect(supabaseUrl, serviceRoleKey, moduleId, next);
    }
    throw firstError;
  }
};

const fetchPermittedRows = async (
  supabaseUrl: string,
  serviceRoleKey: string,
  authContext: any,
  moduleId: string,
  params: Record<string, string | number>,
  limit = 8,
) => {
  if (!moduleId || !ALLOWED_MODULES.has(moduleId)) return [];
  const perm = getModulePermission(authContext.permissions, moduleId);
  if (!canViewModule(perm)) return [];
  const recordScope = getRecordScope(perm);
  const rows = await safeRestSelect(supabaseUrl, serviceRoleKey, moduleId, {
    select: '*',
    limit,
    ...params,
  });
  return (rows || [])
    .filter((row) => canAccessAssignedRecord(row, authContext, recordScope))
    .slice(0, limit)
    .map((row) => sanitizeRecord(row, perm));
};

const buildRelatedContexts = async (
  supabaseUrl: string,
  serviceRoleKey: string,
  authContext: any,
  moduleId: string,
  recordId: string | null,
  record: any,
) => {
  const related: any[] = [];
  const push = async (targetModuleId: string, params: Record<string, string | number>, summary: string) => {
    const records = await fetchPermittedRows(supabaseUrl, serviceRoleKey, authContext, targetModuleId, params, 8);
    if (records.length) related.push({ moduleId: targetModuleId, summary, records });
  };

  if (moduleId === 'customers' && recordId) {
    await push('invoices', { customer_id: `eq.${recordId}`, order: 'updated_at.desc' }, 'فاکتورهای مرتبط مشتری');
    await push('cash_bank_operations', { customer_id: `eq.${recordId}`, order: 'updated_at.desc' }, 'پرداخت‌ها و دریافت‌های مستقیم مشتری');
    await push('tasks', { related_customer: `eq.${recordId}`, order: 'updated_at.desc' }, 'فعالیت‌های مرتبط مشتری');
    await push('projects', { customer_id: `eq.${recordId}`, order: 'updated_at.desc' }, 'پروژه‌های مرتبط مشتری');
  }

  if (moduleId === 'invoices' && recordId) {
    const customerId = normalizeId(record?.customer_id);
    const projectId = normalizeId(record?.project_id);
    if (customerId) await push('customers', { id: `eq.${customerId}` }, 'مشتری فاکتور');
    if (projectId) await push('projects', { id: `eq.${projectId}` }, 'پروژه فاکتور');
    await push('tasks', { related_invoice: `eq.${recordId}`, order: 'updated_at.desc' }, 'فعالیت‌های مرتبط فاکتور');
  }

  if (moduleId === 'projects' && recordId) {
    await push('tasks', { project_id: `eq.${recordId}`, order: 'updated_at.desc' }, 'فعالیت‌های پروژه');
    await push('process_runs', { project_id: `eq.${recordId}`, order: 'updated_at.desc' }, 'فرآیندها و مراحل پروژه');
    await push('invoices', { project_id: `eq.${recordId}`, order: 'updated_at.desc' }, 'فاکتورهای فروش پروژه');
    await push('purchase_invoices', { project_id: `eq.${recordId}`, order: 'updated_at.desc' }, 'فاکتورهای خرید پروژه');
  }

  if (moduleId === 'employees' && recordId) {
    const profileId = normalizeId(record?.assignee_id);
    const jobDescriptionId = normalizeId(record?.job_description_id);
    if (jobDescriptionId) await push('job_descriptions', { id: `eq.${jobDescriptionId}` }, 'شرح شغل انتخاب‌شده کارمند');
    if (profileId) await push('tasks', { assignee_id: `eq.${profileId}`, order: 'updated_at.desc' }, 'فعالیت‌های ارجاع‌شده به کارمند');
    await push('tasks', { related_to_module: 'eq.employees', source_record_id: `eq.${recordId}`, order: 'updated_at.desc' }, 'فعالیت‌های مرتبط با پرونده کارمند');
  }

  if (moduleId === 'tasks') {
    const customerId = normalizeId(record?.related_customer);
    const projectId = normalizeId(record?.project_id);
    const invoiceId = normalizeId(record?.related_invoice);
    if (customerId) await push('customers', { id: `eq.${customerId}` }, 'مشتری مرتبط فعالیت');
    if (projectId) await push('projects', { id: `eq.${projectId}` }, 'پروژه مرتبط فعالیت');
    if (invoiceId) await push('invoices', { id: `eq.${invoiceId}` }, 'فاکتور مرتبط فعالیت');
  }

  return related.slice(0, 6);
};

const buildReportContext = async (
  supabaseUrl: string,
  serviceRoleKey: string,
  authContext: any,
  context: RequestContext,
) => {
  const route = String(context?.route || '').split('?')[0];
  const match = route.match(/^\/reports\/([^/]+)/i);
  if (!match || match[1] === 'create' || match[1] === 'edit') return null;
  if (!canViewReports(authContext)) {
    return {
      context,
      permitted: false,
      summary: 'کاربر به گزارش‌ها دسترسی مشاهده ندارد.',
      records: [],
      moduleId: null,
      recordId: null,
      relatedContexts: [],
    };
  }

  const reportId = normalizeId(match[1]);
  if (!isUuid(reportId)) return null;
  const reports = await safeRestSelect(supabaseUrl, serviceRoleKey, 'report_definitions', {
    id: `eq.${reportId}`,
    org_id: `eq.${authContext.orgId}`,
    select: 'id,name,description,module_id,report_type,config,is_active,updated_at',
    limit: 1,
  });
  const report = reports[0] || null;
  if (!report) {
    return {
      context,
      permitted: false,
      summary: 'گزارش موردنظر پیدا نشد یا به سازمان فعلی تعلق ندارد.',
      records: [],
      moduleId: null,
      recordId: null,
      relatedContexts: [],
    };
  }

  const reportModuleId = normalizeId(report.module_id);
  const moduleRows = reportModuleId
    ? await fetchPermittedRows(supabaseUrl, serviceRoleKey, authContext, reportModuleId, {
        order: 'updated_at.desc',
        limit: 10,
      }, 10)
    : [];

  return {
    context,
    permitted: true,
    summary: `زمینه مجاز: گزارش ${report.name || report.id} بر اساس ماژول ${reportModuleId || 'نامشخص'}.`,
    records: [{
      report: {
        id: report.id,
        name: report.name,
        description: report.description,
        module_id: report.module_id,
        report_type: report.report_type,
        config: report.config,
        is_active: report.is_active,
      },
      sample_rows: moduleRows,
    }],
    moduleId: 'reports',
    recordId: report.id,
    relatedContexts: [],
  };
};

const buildPermittedPageContext = async (
  supabaseUrl: string,
  serviceRoleKey: string,
  authContext: any,
  rawContext: RequestContext,
) => {
  const context = normalizeContext(rawContext);
  const reportContext = await buildReportContext(supabaseUrl, serviceRoleKey, authContext, context);
  if (reportContext) return reportContext;

  const moduleId = String(context.moduleId || '').trim();
  if (!moduleId || !ALLOWED_MODULES.has(moduleId)) {
    return {
      context,
      permitted: false,
      summary: 'این صفحه به ماژول دیتایی قابل خواندن برای دستیار وصل نیست.',
      records: [],
      moduleId: null,
      recordId: null,
      relatedContexts: [],
    };
  }

  const perm = getModulePermission(authContext.permissions, moduleId);
  const recordScope = getRecordScope(perm);
  if (!canViewModule(perm)) {
    return {
      context,
      permitted: false,
      summary: 'کاربر به این ماژول دسترسی مشاهده ندارد.',
      records: [],
      moduleId,
      recordId: context.recordId || null,
      relatedContexts: [],
    };
  }

  if (context.mode === 'record' && context.recordId) {
    const rows = await restSelect(supabaseUrl, serviceRoleKey, moduleId, {
      id: `eq.${context.recordId}`,
      select: '*',
      limit: 1,
    });
    const record = rows[0] || null;
    if (!record || !canAccessAssignedRecord(record, authContext, recordScope)) {
      return {
        context,
        permitted: false,
        summary: 'رکورد موردنظر پیدا نشد یا کاربر به آن دسترسی ندارد.',
        records: [],
        moduleId,
        recordId: context.recordId,
        relatedContexts: [],
      };
    }
    const relatedContexts = await buildRelatedContexts(supabaseUrl, serviceRoleKey, authContext, moduleId, context.recordId, record);
    return {
      context,
      permitted: true,
      summary: `زمینه مجاز: رکورد ${context.recordId} از ماژول ${moduleId}.`,
      records: [sanitizeRecord(record, perm)],
      moduleId,
      recordId: context.recordId,
      recordScope,
      relatedContexts,
      processGuideContext: context.processGuideContext || null,
      intent: context.intent || null,
      processFieldKey: context.processFieldKey || null,
      selectedProcessId: context.selectedProcessId || context.selectedProcessGroupId || null,
      availableProcesses: context.availableProcesses || [],
    };
  }

  const selectedIds = normalizeIds(context.selectedRecordIds || []).slice(0, MAX_PAGE_CONTEXT_RECORDS);
  const visibleIds = selectedIds.length
    ? selectedIds
    : normalizeIds(context.visibleRecordIds || []).slice(0, MAX_PAGE_CONTEXT_RECORDS);
  const rows = visibleIds.length
    ? await restSelect(supabaseUrl, serviceRoleKey, moduleId, {
        id: `in.(${visibleIds.join(',')})`,
        select: '*',
        limit: MAX_PAGE_CONTEXT_RECORDS,
      })
    : await fetchRowsWithFallback(supabaseUrl, serviceRoleKey, moduleId, {
        select: '*',
        order: 'updated_at.desc',
        limit: MAX_PAGE_CONTEXT_RECORDS,
      });

  const permittedRows = (rows || [])
    .filter((row) => canAccessAssignedRecord(row, authContext, recordScope))
    .slice(0, MAX_PAGE_CONTEXT_RECORDS)
    .map((row) => sanitizeRecord(row, perm));

  return {
    context,
    permitted: true,
    summary: selectedIds.length
      ? `زمینه مجاز: ${permittedRows.length} رکورد انتخاب‌شده از ماژول ${moduleId}.`
      : visibleIds.length
      ? `زمینه مجاز: ${permittedRows.length} رکورد از صفحه فعلی لیست ${moduleId}.`
      : `زمینه مجاز: آخرین ${permittedRows.length} رکورد قابل مشاهده از ماژول ${moduleId}.`,
      records: permittedRows,
      moduleId,
      recordId: null,
      recordScope,
      relatedContexts: [],
      processGuideContext: context.processGuideContext || null,
      intent: context.intent || null,
      processFieldKey: context.processFieldKey || null,
      selectedProcessId: context.selectedProcessId || context.selectedProcessGroupId || null,
      availableProcesses: context.availableProcesses || [],
    };
};

const tokenize = (value: string) =>
  Array.from(
    new Set(
      String(value || '')
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s_-]+/gu, ' ')
        .split(/\s+/)
        .map((item) => item.trim())
        .filter((item) => item.length >= 2)
    )
  ).slice(0, 16);

const splitTextIntoAiChunks = (body: string, maxLength = 1200) => {
  const paragraphs = String(body || '')
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map((item) => item.trim())
    .filter(Boolean);
  const chunks: string[] = [];
  let current = '';
  paragraphs.forEach((paragraph) => {
    if (!current) {
      current = paragraph;
      return;
    }
    if (`${current}\n\n${paragraph}`.length <= maxLength) {
      current = `${current}\n\n${paragraph}`;
      return;
    }
    chunks.push(current);
    current = paragraph;
  });
  if (current) chunks.push(current);
  if (chunks.length === 0 && body.trim()) chunks.push(body.trim().slice(0, maxLength));
  return chunks.flatMap((chunk) => {
    if (chunk.length <= maxLength) return [chunk];
    const pieces: string[] = [];
    for (let index = 0; index < chunk.length; index += maxLength) {
      pieces.push(chunk.slice(index, index + maxLength));
    }
    return pieces;
  });
};

const hashText = (value: string) => {
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) + hash) + value.charCodeAt(index);
    hash &= 0xffffffff;
  }
  return Math.abs(hash).toString(16);
};

const getSearchTerms = (message: string) =>
  tokenize(message)
    .filter((token) => !QUERY_STOP_WORDS.has(token))
    .filter((token) => !Object.values(MODULE_ALIASES).flat().some((alias) => alias.toLowerCase() === token))
    .slice(0, 5);

const detectRelevantModuleIds = (message: string, pageContext: any) => {
  const text = String(message || '').toLowerCase();
  const result = new Set<string>();
  Object.entries(MODULE_ALIASES).forEach(([moduleId, aliases]) => {
    if (aliases.some((alias) => text.includes(alias.toLowerCase()))) {
      result.add(moduleId);
    }
  });
  if (pageContext?.moduleId && ALLOWED_MODULES.has(pageContext.moduleId)) result.add(pageContext.moduleId);
  return Array.from(result).slice(0, MAX_RETRIEVED_CONTEXTS + 1);
};

const rowMatchesTerms = (row: any, terms: string[]) => {
  if (!terms.length) return true;
  const haystack = JSON.stringify(row || {}).toLowerCase();
  return terms.some((term) => haystack.includes(term.toLowerCase()));
};

const fetchModuleRowsForQuery = async (
  supabaseUrl: string,
  serviceRoleKey: string,
  authContext: any,
  moduleId: string,
  message: string,
) => {
  if (!moduleId || !ALLOWED_MODULES.has(moduleId)) return [];
  const perm = getModulePermission(authContext.permissions, moduleId);
  if (!canViewModule(perm)) return [];
  const recordScope = getRecordScope(perm);
  const terms = getSearchTerms(message);
  const searchFields = MODULE_SEARCH_FIELDS[moduleId] || ['name', 'title', 'system_code', 'description'];

  for (const term of terms) {
    const safeTerm = term.replace(/[(),*]/g, ' ').trim();
    if (!safeTerm) continue;
    try {
      const orExpr = searchFields.map((field) => `${field}.ilike.*${safeTerm}*`).join(',');
      const rows = await restSelect(supabaseUrl, serviceRoleKey, moduleId, {
        select: '*',
        or: `(${orExpr})`,
        order: 'updated_at.desc',
        limit: 20,
      });
      const permittedRows = (rows || [])
        .filter((row) => canAccessAssignedRecord(row, authContext, recordScope))
        .slice(0, 8)
        .map((row) => sanitizeRecord(row, perm));
      if (permittedRows.length) return permittedRows;
    } catch {
      // Some modules do not have every searchable column. Fall back to recent rows.
    }
  }

  const rows = await safeRestSelect(supabaseUrl, serviceRoleKey, moduleId, {
    select: '*',
    order: 'updated_at.desc',
    limit: 40,
  });
  return (rows || [])
    .filter((row) => canAccessAssignedRecord(row, authContext, recordScope))
    .filter((row) => rowMatchesTerms(row, terms))
    .slice(0, 8)
    .map((row) => sanitizeRecord(row, perm));
};

const fetchRelevantModuleContexts = async (
  supabaseUrl: string,
  serviceRoleKey: string,
  authContext: any,
  message: string,
  pageContext: any,
) => {
  const modules = detectRelevantModuleIds(message, pageContext)
    .filter((moduleId) => moduleId && moduleId !== pageContext?.moduleId)
    .slice(0, MAX_RETRIEVED_CONTEXTS);
  const contexts: any[] = [];
  for (const moduleId of modules) {
    const records = await fetchModuleRowsForQuery(supabaseUrl, serviceRoleKey, authContext, moduleId, message);
    if (records.length) {
      contexts.push({
        moduleId,
        summary: `رکوردهای مجاز مرتبط از ماژول ${moduleId}`,
        records,
      });
    }
  }
  return contexts;
};

const normalizeFaDigits = (value: string) => String(value || '')
  .replace(/[۰-۹]/g, (digit) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)))
  .replace(/[٠-٩]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)));

const dateOnlyFromUtc = (value: Date) => value.toISOString().slice(0, 10);

const getTehranToday = () => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Tehran',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const byType = new Map(parts.map((part) => [part.type, part.value]));
  return `${byType.get('year')}-${byType.get('month')}-${byType.get('day')}`;
};

const parseDateOnlyUtc = (value: string) => new Date(`${value}T00:00:00.000Z`);

const PERSIAN_MONTH_COUNTS: Record<string, number> = {
  یک: 1,
  دو: 2,
  سه: 3,
  چهار: 4,
  پنج: 5,
  شش: 6,
  هفت: 7,
  هشت: 8,
  نه: 9,
  ده: 10,
  یازده: 11,
  دوازده: 12,
};

const extractRequestedMonthCount = (message: string) => {
  const normalized = normalizeFaDigits(message).toLowerCase();
  const numeric = normalized.match(/(\d{1,2})\s*ماه/);
  if (numeric) return Math.max(1, Math.min(24, Number(numeric[1]) || 1));
  for (const [word, count] of Object.entries(PERSIAN_MONTH_COUNTS)) {
    if (normalized.includes(`${word} ماه`)) return count;
  }
  return 1;
};

const resolveFinancialPeriod = (message: string) => {
  const normalized = normalizeFaDigits(message).toLowerCase();
  const todayIso = getTehranToday();
  const today = parseDateOnlyUtc(todayIso);
  const currentMonthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  const requestedMonthCount = extractRequestedMonthCount(normalized);

  if (/(سال گذشته|سال قبل|previous year|last year)/i.test(normalized)) {
    const year = today.getUTCFullYear() - 1;
    return {
      label: 'سال گذشته',
      dateFrom: dateOnlyFromUtc(new Date(Date.UTC(year, 0, 1))),
      dateTo: dateOnlyFromUtc(new Date(Date.UTC(year, 11, 31))),
    };
  }

  if (/(امسال|سال جاری|this year|current year)/i.test(normalized)) {
    return {
      label: 'سال جاری تا امروز',
      dateFrom: dateOnlyFromUtc(new Date(Date.UTC(today.getUTCFullYear(), 0, 1))),
      dateTo: todayIso,
    };
  }

  if (/(هفته گذشته|هفته قبل|previous week|last week)/i.test(normalized)) {
    const currentWeekStart = new Date(today);
    const daysSinceSaturday = (today.getUTCDay() + 1) % 7;
    currentWeekStart.setUTCDate(today.getUTCDate() - daysSinceSaturday);
    const previousWeekStart = new Date(currentWeekStart);
    previousWeekStart.setUTCDate(previousWeekStart.getUTCDate() - 7);
    const previousWeekEnd = new Date(currentWeekStart);
    previousWeekEnd.setUTCDate(previousWeekEnd.getUTCDate() - 1);
    return {
      label: 'هفته گذشته',
      dateFrom: dateOnlyFromUtc(previousWeekStart),
      dateTo: dateOnlyFromUtc(previousWeekEnd),
    };
  }

  if (
    requestedMonthCount > 1
    && /(گذشته|اخیر|قبل|recent|last)/i.test(normalized)
  ) {
    const start = new Date(Date.UTC(
      today.getUTCFullYear(),
      today.getUTCMonth() - (requestedMonthCount - 1),
      1,
    ));
    return {
      label: `${requestedMonthCount} ماه اخیر تا امروز`,
      dateFrom: dateOnlyFromUtc(start),
      dateTo: todayIso,
    };
  }

  if (/(ماه گذشته|ماه قبل|previous month|last month)/i.test(normalized)) {
    const start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1));
    const end = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 0));
    return {
      label: 'ماه گذشته',
      dateFrom: dateOnlyFromUtc(start),
      dateTo: dateOnlyFromUtc(end),
    };
  }

  return {
    label: 'ماه جاری تا امروز',
    dateFrom: dateOnlyFromUtc(currentMonthStart),
    dateTo: todayIso,
  };
};

const detectFinancialAnalyticsIntent = (message: string) => {
  const text = String(message || '').trim().toLowerCase();
  if (!text) return null;
  if (/(سود\s*و\s*زیان|سود|زیان|حاشیه سود|profit|loss|margin)/i.test(text)) return 'profit_loss';
  if (/(وضعیت مالی|عملکرد مالی|گزارش مالی|financial performance|financial status)/i.test(text)) return 'financial_overview';
  if (/(فروش|درآمد|revenue|sales)/i.test(text)) return 'sales_overview';
  if (/(هزینه|مخارج|خرید|expense|cost|purchase)/i.test(text)) return 'cost_overview';
  return null;
};

const canReadAggregateFields = (perm: any, requiredFields: string[]) => {
  if (!canViewModule(perm) || getRecordScope(perm) !== 'all') return false;
  const fields = perm?.fields && typeof perm.fields === 'object' ? perm.fields : {};
  return requiredFields.every((field) => fields?.[field] !== false);
};

const fetchFinancialAnalyticsContext = async (
  supabaseUrl: string,
  serviceRoleKey: string,
  authContext: any,
  message: string,
) => {
  const intent = detectFinancialAnalyticsIntent(message);
  if (!intent || !authContext?.orgId) return null;

  const period = resolveFinancialPeriod(message);
  const permissions = authContext?.permissions && typeof authContext.permissions === 'object'
    ? authContext.permissions
    : {};
  const accountingPerm = permissions?.__accounting || {};
  const accountingFields = accountingPerm?.fields && typeof accountingPerm.fields === 'object'
    ? accountingPerm.fields
    : {};
  const includeAccounting = accountingPerm?.view !== false
    && accountingFields?.dashboard_page !== false
    && accountingFields?.reports_hub !== false
    && accountingFields?.journal_entry_lines_view !== false
    && canViewModule(getModulePermission(permissions, 'journal_entries'))
    && canViewModule(getModulePermission(permissions, 'chart_of_accounts'));
  const includeSales = canReadAggregateFields(
    getModulePermission(permissions, 'invoices'),
    ['invoice_date', 'status', 'total_invoice_amount'],
  );
  const includePurchases = canReadAggregateFields(
    getModulePermission(permissions, 'purchase_invoices'),
    ['invoice_date', 'status', 'total_invoice_amount'],
  );
  const includeExpenses = canReadAggregateFields(
    getModulePermission(permissions, 'expense_documents'),
    ['expense_date', 'status', 'total_amount'],
  );
  const permissionScope = {
    accounting: includeAccounting,
    sales: includeSales,
    purchases: includePurchases,
    expenses: includeExpenses,
  };

  if (!Object.values(permissionScope).some(Boolean)) {
    return {
      kind: 'financial_snapshot',
      intent,
      period,
      available: false,
      reason: 'permission_denied',
      permission_scope: permissionScope,
    };
  }

  try {
    const snapshot = await restRpc(supabaseUrl, serviceRoleKey, 'get_ai_financial_snapshot', {
      p_org_id: authContext.orgId,
      p_date_from: period.dateFrom,
      p_date_to: period.dateTo,
      p_include_accounting: includeAccounting,
      p_include_sales: includeSales,
      p_include_purchases: includePurchases,
      p_include_expenses: includeExpenses,
    });
    const accountingAvailable = snapshot?.accounting?.available === true;
    const unpostedCount = Number(snapshot?.accounting?.unposted_entry_count || 0);
    return {
      ...snapshot,
      intent,
      period,
      available: true,
      permission_scope: permissionScope,
      data_quality: accountingAvailable
        ? (unpostedCount > 0 ? 'posted_ledger_with_unposted_entries' : 'posted_ledger')
        : 'operational_only',
    };
  } catch (error) {
    console.warn('Financial analytics context unavailable', error);
    return {
      kind: 'financial_snapshot',
      intent,
      period,
      available: false,
      reason: 'financial_snapshot_unavailable',
      permission_scope: permissionScope,
    };
  }
};

const isSystemAiInstructionChunk = (row: any) =>
  String(row?.metadata?.system_key || '').trim() === 'ai_instructions'
  || String(row?.metadata?.document_type || '').trim() === 'ai_instructions';

const isOperationalInstructionChunk = (row: any) =>
  String(row?.source_kind || row?.metadata?.source_kind || '').trim() === 'instruction'
  || String(row?.metadata?.document_type || '').trim() === 'module_instruction';

const isJobDescriptionChunk = (row: any) =>
  String(row?.source_kind || row?.metadata?.source_kind || '').trim() === 'job_description'
  || String(row?.source_module_id || row?.metadata?.source_module_id || '').trim() === 'job_descriptions'
  || String(row?.metadata?.document_type || '').trim() === 'job_description';

const isChunkRelevantToModule = (row: any, moduleId?: string | null) => {
  const normalizedModuleId = String(moduleId || '').trim();
  if (!normalizedModuleId) return true;
  const targets = Array.isArray(row?.source_target_module_ids)
    ? row.source_target_module_ids
    : isOperationalInstructionChunk(row) && Array.isArray(row?.metadata?.module_ids)
    ? row.metadata.module_ids
    : [];
  const normalizedTargets = targets.map((item: any) => String(item || '').trim()).filter(Boolean);
  return normalizedTargets.length === 0 || normalizedTargets.includes(normalizedModuleId);
};

const canActorViewInstructionRow = (instruction: any, authContext: any) => {
  const allowedUserIds = normalizeIds(Array.isArray(instruction?.visible_to_user_ids) ? instruction.visible_to_user_ids : []);
  const allowedRoleIds = normalizeIds(Array.isArray(instruction?.visible_to_role_ids) ? instruction.visible_to_role_ids : []);
  if (allowedUserIds.length === 0 && allowedRoleIds.length === 0) return true;
  const userId = normalizeId(authContext?.userId);
  const roleId = normalizeId(authContext?.roleId);
  return (!!userId && allowedUserIds.includes(userId)) || (!!roleId && allowedRoleIds.includes(roleId));
};

const filterFreshOperationalInstructionChunks = async (
  supabaseUrl: string,
  serviceRoleKey: string,
  authContext: any,
  rows: any[],
  moduleId?: string | null,
) => {
  const operationalIds = Array.from(new Set(
    (rows || [])
      .filter(isOperationalInstructionChunk)
      .map((row: any) => normalizeId(row?.source_record_id || row?.metadata?.source_record_id))
      .filter(isUuid)
  ));
  if (operationalIds.length === 0) return rows;
  const instructionRows = await restSelect(supabaseUrl, serviceRoleKey, 'instructions', {
    org_id: `eq.${authContext.orgId}`,
    id: `in.(${operationalIds.join(',')})`,
    select: 'id,status,module_ids,visible_to_user_ids,visible_to_role_ids,use_for_ai,ai_index_status',
    limit: 80,
  }).catch(() => []);
  const instructionById = new Map(instructionRows.map((item: any) => [String(item?.id || ''), item]));
  const allowedStatuses = new Set(['approved', 'published']);
  const normalizedModuleId = String(moduleId || '').trim();
  return (rows || []).filter((row: any) => {
    if (!isOperationalInstructionChunk(row)) return true;
    const sourceRecordId = normalizeId(row?.source_record_id || row?.metadata?.source_record_id);
    const instruction = instructionById.get(sourceRecordId);
    if (!instruction) return false;
    if (instruction?.use_for_ai !== true) return false;
    if (!allowedStatuses.has(String(instruction?.status || '').trim())) return false;
    if (String(instruction?.ai_index_status || '').trim() !== 'ready') return false;
    if (!canActorViewInstructionRow(instruction, authContext)) return false;
    if (!normalizedModuleId) return true;
    const moduleIds = Array.isArray(instruction?.module_ids)
      ? instruction.module_ids.map((item: any) => String(item || '').trim()).filter(Boolean)
      : [];
    return moduleIds.length === 0 || moduleIds.includes(normalizedModuleId);
  });
};

const filterFreshJobDescriptionChunks = async (
  supabaseUrl: string,
  serviceRoleKey: string,
  authContext: any,
  rows: any[],
) => {
  const jobDescriptionIds = Array.from(new Set(
    (rows || [])
      .filter(isJobDescriptionChunk)
      .map((row: any) => normalizeId(row?.source_record_id || row?.metadata?.source_record_id))
      .filter(isUuid)
  ));
  if (jobDescriptionIds.length === 0) return rows;
  const perm = getModulePermission(authContext?.permissions, 'job_descriptions');
  if (!canViewModule(perm)) return (rows || []).filter((row: any) => !isJobDescriptionChunk(row));
  const recordScope = getRecordScope(perm);
  const jobRows = await restSelect(supabaseUrl, serviceRoleKey, 'job_descriptions', {
    org_id: `eq.${authContext.orgId}`,
    id: `in.(${jobDescriptionIds.join(',')})`,
    select: 'id,org_id,use_for_ai,ai_index_status,assignee_id,assignee_type,assignee_role_id',
    limit: 80,
  }).catch(() => []);
  const jobById = new Map(jobRows.map((item: any) => [String(item?.id || ''), item]));
  return (rows || []).filter((row: any) => {
    if (!isJobDescriptionChunk(row)) return true;
    const sourceRecordId = normalizeId(row?.source_record_id || row?.metadata?.source_record_id);
    const jobDescription = jobById.get(sourceRecordId);
    if (!jobDescription) return false;
    if (jobDescription?.use_for_ai !== true) return false;
    if (String(jobDescription?.ai_index_status || '').trim() !== 'ready') return false;
    return canAccessAssignedRecord(jobDescription, authContext, recordScope);
  });
};

const fetchKnowledgeChunks = async (
  supabaseUrl: string,
  serviceRoleKey: string,
  authContext: any,
  query: string,
  options: { moduleId?: string | null } = {},
) => {
  if (!authContext.orgId) return [];
  const instructionRowsFor = (rows: any[]) => rows.filter(isSystemAiInstructionChunk);
  const moduleId = String(options?.moduleId || '').trim();
  const rows = await restSelect(supabaseUrl, serviceRoleKey, 'document_chunks', {
    org_id: `eq.${authContext.orgId}`,
    status: 'eq.active',
    select: 'id,document_id,chunk_index,content,metadata,updated_at,allowed_user_ids,allowed_role_ids,source_kind,source_module_id,source_record_id,source_target_module_ids',
    order: 'updated_at.desc',
    limit: 80,
  });
  let visibleRows = rows.filter((row: any) => {
    const allowedUserIds = Array.isArray(row?.allowed_user_ids)
      ? row.allowed_user_ids.map(normalizeId).filter(isUuid)
      : [];
    const allowedRoleIds = Array.isArray(row?.allowed_role_ids)
      ? row.allowed_role_ids.map(normalizeId).filter(isUuid)
      : [];
    if (allowedUserIds.length === 0 && allowedRoleIds.length === 0) return true;
    const userId = normalizeId(authContext?.userId);
    const roleId = normalizeId(authContext?.roleId);
    return (!!userId && allowedUserIds.includes(userId)) || (!!roleId && allowedRoleIds.includes(roleId));
  }).filter((row: any) => isChunkRelevantToModule(row, moduleId));
  visibleRows = await filterFreshOperationalInstructionChunks(supabaseUrl, serviceRoleKey, authContext, visibleRows, moduleId);
  visibleRows = await filterFreshJobDescriptionChunks(supabaseUrl, serviceRoleKey, authContext, visibleRows);
  const instructionRows = instructionRowsFor(visibleRows);
  const queryText = String(query || '').trim();
  if (queryText) {
    try {
      const providerConfig = getCentralProviderConfig();
      if (providerConfig.apiKey) {
        const embeddingResult = await callEmbeddings(providerConfig, queryText.slice(0, 8000), DEFAULT_EMBEDDING_MODEL);
        let vectorRows: any[] = [];
        try {
          vectorRows = await restRpc(supabaseUrl, serviceRoleKey, 'match_ai_document_chunks_hybrid', {
            p_org_id: authContext.orgId,
            p_user_id: authContext.userId || null,
            p_role_id: authContext.roleId || null,
            p_query_text: queryText.slice(0, 2000),
            p_query_embedding: `[${embeddingResult.embedding.join(',')}]`,
            p_match_count: 6,
            p_match_threshold: KNOWLEDGE_MATCH_THRESHOLD,
            p_full_text_weight: 1.15,
            p_semantic_weight: 1,
            p_rrf_k: 50,
          });
        } catch {
          vectorRows = await restRpc(supabaseUrl, serviceRoleKey, 'match_ai_document_chunks', {
            p_org_id: authContext.orgId,
            p_user_id: authContext.userId || null,
            p_role_id: authContext.roleId || null,
            p_query_embedding: `[${embeddingResult.embedding.join(',')}]`,
            p_match_count: 6,
          });
        }
        const freshVectorRows = await filterFreshOperationalInstructionChunks(supabaseUrl, serviceRoleKey, authContext, vectorRows || [], moduleId);
        const freshAccessibleVectorRows = await filterFreshJobDescriptionChunks(supabaseUrl, serviceRoleKey, authContext, freshVectorRows || []);
        const filteredVectorRows = freshAccessibleVectorRows
          .filter((row: any) => isChunkRelevantToModule(row, moduleId))
          .filter((row: any) => Number(row?.similarity || 0) >= (isOperationalInstructionChunk(row) ? INSTRUCTION_MATCH_THRESHOLD : KNOWLEDGE_MATCH_THRESHOLD))
          .filter((row: any) => !instructionRows.some((item: any) => String(item.id) === String(row.id)))
          .slice(0, Math.max(0, 6 - instructionRows.slice(0, 2).length));
        if (filteredVectorRows.length > 0) {
          await recordAiUsageLedger(supabaseUrl, serviceRoleKey, authContext, {
            capability: 'embedding',
            provider: providerConfig.provider,
            model: DEFAULT_EMBEDDING_MODEL,
            requestId: embeddingResult.requestId,
            usageMetadata: embeddingResult.usageMetadata,
            status: 'finalized',
            metadata: { source: 'knowledge_retrieval' },
          });
          return [...instructionRows.slice(0, 2), ...filteredVectorRows];
        }
      }
    } catch (error) {
      console.warn('Embedding retrieval fallback used', error);
    }
  }
  const otherRows = visibleRows.filter((row: any) => !instructionRows.includes(row));
  const tokens = tokenize(query);
  if (!tokens.length) return [...instructionRows.slice(0, 2), ...otherRows.slice(0, Math.max(0, 4 - instructionRows.slice(0, 2).length))];
  const scoredRows = otherRows
    .map((row) => {
      const haystack = `${row?.content || ''} ${JSON.stringify(row?.metadata || {})}`.toLowerCase();
      const score = tokens.reduce((sum, token) => sum + (haystack.includes(token) ? 1 : 0), 0);
      return { ...row, score };
    })
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(0, 6 - instructionRows.slice(0, 2).length));
  return [...instructionRows.slice(0, 2), ...scoredRows];
};

const loadCompanyContext = async (supabaseUrl: string, serviceRoleKey: string, authContext: any) => {
  const [companyRows, orgRows] = await Promise.all([
    authContext.orgId
      ? safeRestSelect(supabaseUrl, serviceRoleKey, 'company_settings', {
          org_id: `eq.${authContext.orgId}`,
          select: 'id,org_id,company_name,company_full_name,trade_name,company_name_en,currency_code,currency_label,ceo_name,mobile,phone,address,website,email,updated_at',
          limit: 1,
        })
      : Promise.resolve([]),
    authContext.orgId
      ? safeRestSelect(supabaseUrl, serviceRoleKey, 'organizations', {
          id: `eq.${authContext.orgId}`,
          select: 'id,name,slug,is_active',
          limit: 1,
        })
      : Promise.resolve([]),
  ]);
  const company = companyRows[0] || {};
  const organization = orgRows[0] || {};
  return {
    org_id: authContext.orgId,
    organization_name: organization?.name || null,
    organization_slug: organization?.slug || null,
    company_name: company?.company_name || organization?.name || null,
    company_full_name: company?.company_full_name || null,
    trade_name: company?.trade_name || null,
    company_name_en: company?.company_name_en || null,
    currency_code: company?.currency_code || 'IRT',
    currency_label: company?.currency_label || 'تومان',
    ceo_name: company?.ceo_name || null,
    phone: company?.phone || company?.mobile || null,
    email: company?.email || null,
    website: company?.website || null,
    address: company?.address || null,
  };
};

const buildUserPromptContext = (authContext: any) => ({
  id: authContext?.profile?.id || null,
  full_name: authContext?.profile?.full_name || authContext?.user?.email || null,
  email: authContext?.profile?.email || authContext?.user?.email || null,
  mobile: authContext?.profile?.mobile_1 || authContext?.profile?.mobile || null,
  job_title: authContext?.profile?.job_title || null,
  position: authContext?.profile?.position || null,
  team: authContext?.profile?.team || null,
  role_id: authContext?.roleId || null,
  role_title: authContext?.role?.title || null,
  role_path: authContext?.rolePath || [],
  subordinate_roles: (authContext?.subordinateRoles || []).slice(0, 20),
});

const matchesDirectoryKeywords = (values: Array<unknown>, keywords: string[]) => {
  const haystack = values
    .map((value) => String(value || '').trim().toLowerCase())
    .filter(Boolean)
    .join(' ');
  if (!haystack) return false;
  return keywords.some((keyword) => haystack.includes(String(keyword || '').trim().toLowerCase()));
};

const loadOrgPeopleContext = async (
  supabaseUrl: string,
  serviceRoleKey: string,
  authContext: any,
  message: string,
) => {
  if (!authContext?.orgId) {
    return {
      summary: 'سازمان کاربر مشخص نیست.',
      total_roles: 0,
      total_users: 0,
      roles: [],
      relevant_users: [],
      leadership: [],
    };
  }

  const [roleRows, userRows] = await Promise.all([
    safeRestSelect(supabaseUrl, serviceRoleKey, 'org_roles', {
      org_id: `eq.${authContext.orgId}`,
      select: 'id,title,parent_id',
      limit: 1000,
    }),
    safeRestSelect(supabaseUrl, serviceRoleKey, 'profiles', {
      org_id: `eq.${authContext.orgId}`,
      select: 'id,full_name,role_id,job_title,position,team,updated_at',
      order: 'updated_at.desc',
      limit: 400,
    }),
  ]);

  const roles = (roleRows || []).map((row: any) => ({
    id: normalizeId(row?.id),
    title: String(row?.title || '').trim() || null,
    parent_id: normalizeId(row?.parent_id),
  })).filter((row) => row.id);
  const roleById = new Map(roles.map((row: any) => [String(row.id), row]));
  const roleUserCounts = new Map<string, number>();
  const roleChildCounts = new Map<string, number>();

  roles.forEach((role: any) => {
    if (role.parent_id) {
      roleChildCounts.set(role.parent_id, (roleChildCounts.get(role.parent_id) || 0) + 1);
    }
  });

  const users = (userRows || []).map((row: any) => {
    const roleId = normalizeId(row?.role_id);
    const roleTitle = roleId ? roleById.get(roleId)?.title || null : null;
    if (roleId) {
      roleUserCounts.set(roleId, (roleUserCounts.get(roleId) || 0) + 1);
    }
    const rolePathTitles = roleId
      ? buildRolePath(roleId, roles as any[]).map((role) => String(role?.title || '').trim()).filter(Boolean)
      : [];
    const isLeader = Boolean(
      (roleId && (roleChildCounts.get(roleId) || 0) > 0)
      || matchesDirectoryKeywords(
        [roleTitle, row?.job_title, row?.position, row?.team],
        MANAGEMENT_DIRECTORY_KEYWORDS,
      )
    );
    return {
      id: normalizeId(row?.id),
      full_name: String(row?.full_name || '').trim() || null,
      role_id: roleId || null,
      role_title: roleTitle,
      role_path_titles: rolePathTitles,
      job_title: String(row?.job_title || '').trim() || null,
      position: String(row?.position || '').trim() || null,
      team: String(row?.team || '').trim() || null,
      is_leadership: isLeader,
    };
  }).filter((row) => row.id && row.full_name);

  const queryTerms = getSearchTerms(message);
  const matchingUsers = queryTerms.length > 0
    ? users.filter((row: any) => matchesDirectoryKeywords(
      [row.full_name, row.role_title, row.job_title, row.position, row.team, ...(row.role_path_titles || [])],
      queryTerms,
    ))
    : [];
  const leadership = users
    .filter((row: any) => row.is_leadership)
    .slice(0, 20);

  const relevantUsers = Array.from(new Map(
    [...matchingUsers.slice(0, 20), ...leadership]
      .map((row: any) => [String(row.id), row]),
  ).values()).slice(0, 40);

  const summarizedRoles = roles.map((role: any) => ({
    id: role.id,
    title: role.title,
    parent_title: role.parent_id ? roleById.get(role.parent_id)?.title || null : null,
    child_role_count: roleChildCounts.get(role.id) || 0,
    assigned_user_count: roleUserCounts.get(role.id) || 0,
  }));

  return {
    summary: 'دایرکتوری کاربران و نقش‌های همین سازمان. خارج از این سازمان هیچ کاربر یا نقشی در این context وجود ندارد.',
    total_roles: roles.length,
    total_users: users.length,
    roles: summarizedRoles.slice(0, 120),
    relevant_users: relevantUsers,
    leadership: leadership.map((row: any) => ({
      id: row.id,
      full_name: row.full_name,
      role_title: row.role_title,
      role_path_titles: row.role_path_titles,
      job_title: row.job_title,
      position: row.position,
      team: row.team,
    })),
  };
};

const buildPromptMessages = (
  message: string,
  pageContext: any,
  knowledgeChunks: any[],
  companyContext: any,
  orgPeopleContext: any,
  authContext: any,
  retrievedContexts: any[],
  historyRows: any[] = [],
  webSearchResults: any[] = [],
  options: {
    legalMode?: boolean;
    deepReasoning?: boolean;
    selectedCapabilities?: string[];
    businessAnalytics?: any;
  } = {},
) => {
  const knowledge = knowledgeChunks.map((chunk, index) => ({
    index: index + 1,
    id: chunk.id,
    document_id: chunk.document_id,
    title: chunk?.metadata?.document_title || null,
    content: String(chunk?.content || '').slice(0, 1200),
  }));
  const aiInstructionIds = new Set(
    knowledgeChunks
      .filter(isSystemAiInstructionChunk)
      .map((chunk: any) => String(chunk?.id || ''))
  );
  const operationalInstructionIds = new Set(
    knowledgeChunks
      .filter(isOperationalInstructionChunk)
      .map((chunk: any) => String(chunk?.id || ''))
  );
  const aiInstructions = knowledge.filter((chunk) => aiInstructionIds.has(String(chunk.id || '')));
  const operationalInstructions = knowledge.filter((chunk) => operationalInstructionIds.has(String(chunk.id || '')));
  const otherKnowledge = knowledge.filter((chunk) =>
    !aiInstructionIds.has(String(chunk.id || ''))
    && !operationalInstructionIds.has(String(chunk.id || ''))
  );
  const contextPayload = {
    company: companyContext,
    current_user: buildUserPromptContext(authContext),
    organization_directory: orgPeopleContext,
    current_page: {
      summary: pageContext.summary,
      moduleId: pageContext.moduleId,
      recordId: pageContext.recordId,
      records: pageContext.records,
      related_contexts: pageContext.relatedContexts || [],
    },
    process_guide: pageContext.intent === 'process_guide'
      ? {
          intent: pageContext.intent,
          process_field_key: pageContext.processFieldKey || null,
          selected_process_id: pageContext.selectedProcessId || null,
          available_processes: pageContext.availableProcesses || [],
          process_guide_context: pageContext.processGuideContext || null,
        }
      : null,
    retrieved_permitted_contexts: retrievedContexts,
    business_analytics: options.businessAnalytics || null,
    web_search_results: webSearchResults.length ? webSearchResults : undefined,
    selected_ai_capabilities: options.selectedCapabilities || [],
    ai_instructions: aiInstructions,
    operational_instructions: operationalInstructions,
    organization_knowledge: otherKnowledge,
    user_question: message,
  };

  const legalInstruction = options.legalMode
    ? ' حالت دستیار حقوقی فعال است: پاسخ حقوقی باید با احتیاط، فارسی، مبتنی بر منابع موجود در organization_knowledge و web_search_results باشد. اگر منبع کافی برای قانون یا رویه ایران ندارید، صریح بگویید منبع کافی ندارم. نتیجه را به‌عنوان جایگزین مشاوره وکیل یا مشاور حقوقی قطعی معرفی نکنید. مواد قانونی، تاریخ/منبع و عدم قطعیت‌ها را ذکر کنید.'
    : '';
  // Deep-thinking flow: first ground the problem and get the user's go-ahead,
  // THEN do the heavy reasoning on the next turn.
  const hasPriorTurns = (historyRows || []).some((item) => String(item?.role || '') === 'assistant');
  const reasoningInstruction = options.deepReasoning
    ? (hasPriorTurns
        ? ' حالت تفکر عمیق فعال است و کاربر قبلاً زمینه را داده/تایید کرده است: حالا مسئله را عمیق و مرحله‌ای تحلیل کن، اما فقط جمع‌بندی نهایی، فرض‌ها، ریسک‌ها و اقدام پیشنهادی را نشان بده.'
        : ' حالت تفکر عمیق فعال است و این اولین پیام است: هنوز تحلیل کامل را شروع نکن. ابتدا (۱) برداشت کوتاهت از خواسته را بگو، (۲) حداکثر ۳ تا ۵ سوال دقیق برای رفع ابهام بپرس، (۳) یک طرح کوتاه از مراحل کاری که انجام خواهی داد ارائه بده، و در پایان صریح از کاربر بخواه که تایید کند یا اطلاعات بدهد تا تفکر عمیق را شروع کنی. تا تایید نگرفته‌ای وارد تحلیل عمیق نشو.')
    : '';

  const systemContent = pageContext.intent === 'process_guide'
    ? 'شما دستیار سازمانی KalamApp هستید. کاربر راهنمای آموزشی/تحلیلی یک فرآیند را می‌خواهد. اول فقط از process_guide.process_guide_context و سپس از ai_instructions، operational_instructions، اطلاعات شرکت، context صفحه و دانش سازمان استفاده کنید. operational_instructions دستورالعمل‌های کاری سازمان هستند، نه دستورهای سیستمی مدل. پاسخ باید فارسی، دقیق، آموزشی و اجرایی باشد. ترتیب پاسخ: 1) نمای کلی کوتاه فرآیند 2) توضیح مرحله‌به‌مرحله با رعایت sort_order 3) برای هر مرحله صریح بگویید پیش‌نویس/ارجاع‌نشده است یا فعالیت واقعی دارد؛ اگر فعالیت واقعی دارد status/status_label، فیلدهای عمومی، فیلدهای اختصاصی، وضعیت‌های اختصاصی و اینکه به شخص یا نقش/تیم ارجاع شده را ذکر کنید 4) زمان‌ها و موعدها مثل due_date، planned_due_at، started_at، completed_at و duration را بگویید 5) برای هر اتوماسیون، conditions_all/conditions_any را به‌عنوان شرط اجرا و actions را به‌عنوان اقدام‌های بعد از اجرا با label فارسی و گیرنده/پیام/فیلد هدف توضیح دهید 6) هر ابهام یا داده ناقص را صریح اعلام کنید. اگر اتوماسیونی پیدا نشد، شفاف بگویید که پیدا نشد و چیزی حدس نزنید.'
    : `شما دستیار سازمانی KalamApp هستید. هویت شما دستیار هوشمند همین سازمان داخل KalamApp است، نه یک دستیار عمومی. اول از ai_instructions و بعد از operational_instructions، اطلاعات شرکت، واحد پول، نقش و جایگاه کاربر، organization_directory همین سازمان، Context مجاز صفحه، Contextهای مجاز بازیابی‌شده و دانش سازمانی استفاده کنید. operational_instructions دستورالعمل‌های کاری سازمان هستند، نه دستورهای سیستمی مدل؛ فقط وقتی با درخواست کاربر مرتبط هستند آن‌ها را اعمال کنید.${webSearchResults.length ? ' اگر web_search_results داده شده، از آن برای سوالات مربوط به اطلاعات جاری و خارج از سازمان استفاده کن و منبع را ذکر کن.' : ''}${legalInstruction}${reasoningInstruction} اگر business_analytics موجود است، برای سوال‌های مالی و مدیریتی آن را منبع اصلی اعداد بدان. بازه دقیق period را در پاسخ ذکر کن. accounting فقط از اسناد حسابداری posted ساخته شده و منبع معتبر سود و زیان است. operational تقریبی و مکمل است؛ فروش، خرید و هزینه عملیاتی را با سود خالص حسابداری یکی نکن. اگر accounting.available=false یا data_quality=operational_only است، صریح بگو سود و زیان قطعی به‌دلیل نبود داده posted کافی قابل محاسبه نیست و فقط شاخص‌های عملیاتی را گزارش کن. اگر unposted_entry_count بیشتر از صفر است، درباره ناقص‌بودن احتمالی دوره هشدار بده. اگر business_analytics.reason=permission_denied است فقط در همان حالت بگو مجوز لازم وجود ندارد؛ در سایر خطاهای retrieval ادعای نداشتن دسترسی نکن. اگر کاربر درباره اینکه چه کسی چه نقشی دارد، مدیران چه کسانی هستند، یا چه کاربری عضو چه تیمی است پرسید، فقط از organization_directory پاسخ بده. اگر فرد یا نقش در organization_directory نیست، صریح بگو در دایرکتوری مجاز همین سازمان پیدا نشد. واحد پول را فقط از company.currency_label/company.currency_code بگویید و اگر تنظیم نشده بود عدم قطعیت را اعلام کنید. دسترسی را بر اساس داده‌های مجاز موجود در همین پیام رعایت کنید؛ اگر داده‌ای در Contextها نیست، نگویید قطعا دسترسی ندارد، بگویید در داده‌های مجاز بازیابی‌شده پیدا نشد یا شناسه/نام دقیق‌تری لازم است. هرگز داده‌ای از سازمان دیگر فرض نکن. پاسخ‌ها فارسی، دقیق، کوتاه و اجرایی باشند. هیچ تغییر داده، ثبت یادداشت یا اقدام عملیاتی انجام ندهید. اگر درخواست کاربر مبهم است یا برای پاسخ درست به اطلاعات بیشتری نیاز داری، به‌جای حدس‌زدن، اول حداکثر ۲ تا ۳ سوال کوتاه و دقیق بپرس. وقتی خروجی به‌صورت فایل قابل‌دانلود (Word، Excel، PDF) برای کاربر مفیدتر است (مثل گزارش، جدول داده، قرارداد، صورت‌حساب یا فهرست بلند)، در پایان پاسخ به‌صورت کوتاه پیشنهاد بده که می‌توانی همان را به‌صورت فایل بسازی و از کاربر بخواه عملگر «ساخت فایل» را فعال کند.`;

  const historyMessages = (historyRows || [])
    .filter((item) => ['user', 'assistant'].includes(String(item?.role || '')))
    .slice(-12)
    .map((item) => ({
      role: String(item.role),
      content: String(item.content || '').slice(0, 3000),
    }));

  return [
    {
      role: 'system',
      content: systemContent,
    },
    ...historyMessages,
    {
      role: 'user',
      content: `Context مجاز و سوال کاربر:\n${JSON.stringify(contextPayload, null, 2)}`,
    },
  ];
};

const extractUsageMetadata = (parsed: any, providerConfig: any) => {
  const usage = parsed?.usage || parsed?.choices?.[0]?.usage || parsed?.usage_info || null;
  const billing = parsed?.estimated_cost || parsed?.billing || parsed?.cost || parsed?.usage_cost || parsed?.charge || parsed?.choices?.[0]?.billing || null;
  const cost: Record<string, any> = {};
  if (billing && typeof billing === 'object') Object.assign(cost, billing);
  if (typeof billing === 'number') cost.amount = billing;
  ['cost', 'cost_usd', 'usd', 'amount', 'amount_usd', 'rial', 'rials', 'toman', 'tomans', 'amount_rial', 'amount_toman', 'currency'].forEach((key) => {
    if (parsed && Object.prototype.hasOwnProperty.call(parsed, key)) cost[key] = parsed[key];
  });

  return {
    provider: providerConfig.provider,
    model: providerConfig.model,
    capability: providerConfig.capability || null,
    usage,
    cost: Object.keys(cost).length ? cost : null,
  };
};

const getChatFinishReason = (parsed: any) =>
  String(parsed?.choices?.[0]?.finish_reason ?? parsed?.choices?.[0]?.finishReason ?? '').trim();

const isCompleteChatFinishReason = (finishReason: string) => {
  const normalized = String(finishReason || '').trim();
  return !normalized || normalized === 'stop' || normalized === 'tool_calls' || normalized === 'function_call';
};

const buildIncompleteAiResponseError = (finishReason: string, partialContent = '') => {
  const normalized = String(finishReason || 'unknown').trim() || 'unknown';
  const error: any = new Error(normalized === 'length'
    ? 'پاسخ هوش مصنوعی به سقف طول خروجی رسید و کامل نشد. لطفاً درخواست را کوتاه‌تر یا دقیق‌تر ارسال کنید.'
    : normalized === 'content_filter'
    ? 'پاسخ هوش مصنوعی به‌دلیل محدودیت ایمنی کامل نشد.'
    : 'پاسخ هوش مصنوعی کامل دریافت نشد. لطفاً دوباره تلاش کنید.'
  );
  error.finishReason = normalized;
  error.partialContent = String(partialContent || '');
  error.incomplete = true;
  return error;
};

const loadModelPricing = async (supabaseUrl: string, serviceRoleKey: string, model: string) => {
  const modelId = String(model || '').trim();
  if (!modelId) return null;
  try {
    const rows = await restSelect(supabaseUrl, serviceRoleKey, 'ai_model_catalog', {
      id: `eq.${modelId}`,
      select: '*',
      limit: 1,
    });
    return rows[0] || null;
  } catch {
    return null;
  }
};

const numberFrom = (value: any, fallback = 0) => {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
};

const estimateAiCharge = (usageMetadata: any, pricing: any, fallbackMargin = DEFAULT_AI_MARGIN_PERCENT) => {
  const usage = usageMetadata?.usage || {};
  const cost = usageMetadata?.cost || {};
  const promptTokens = numberFrom(usage.prompt_tokens ?? usage.prompt ?? usage.input_tokens ?? usage.input, 0);
  const completionTokens = numberFrom(usage.completion_tokens ?? usage.completion ?? usage.output_tokens ?? usage.output, 0);
  const rawUnitFromProvider = numberFrom(cost.unit ?? cost.usd ?? cost.cost_usd ?? cost.amount_usd, NaN);
  const rawIrtFromProvider = numberFrom(cost.irt ?? cost.rial ?? cost.rials ?? cost.amount_rial, NaN);
  const exchangeRate = numberFrom(cost.exchange_rate ?? pricing?.exchange_rate_irt, DEFAULT_AI_EXCHANGE_RATE_IRT);
  const marginPercent = numberFrom(pricing?.margin_percent, fallbackMargin);
  const inputRate = numberFrom(pricing?.input_usd_per_1m, 0);
  const outputRate = numberFrom(pricing?.output_usd_per_1m, 0);
  const estimatedUnit = Number.isFinite(rawUnitFromProvider)
    ? rawUnitFromProvider
    : (promptTokens * inputRate + completionTokens * outputRate) / 1_000_000;
  const rawCostIrt = Number.isFinite(rawIrtFromProvider)
    ? rawIrtFromProvider
    : estimatedUnit * exchangeRate;
  const billedAmountIrt = Math.ceil(Math.max(0, rawCostIrt) * (1 + Math.max(0, marginPercent) / 100));
  return {
    rawCostUnit: Number(estimatedUnit.toFixed(10)),
    rawCostIrt: Math.ceil(rawCostIrt),
    billedAmountIrt,
    marginPercent,
    exchangeRate,
  };
};

const recordAiUsageLedger = async (
  supabaseUrl: string,
  serviceRoleKey: string,
  authContext: any,
  args: {
    threadId?: string | null;
    messageId?: string | null;
    requestId?: string | null;
    capability: string;
    provider: string;
    model: string;
    usageMetadata: any;
    status?: string;
    metadata?: Record<string, any>;
  },
) => {
  if (!authContext?.orgId) return null;
  try {
    const settings = await loadOrgAiSettings(supabaseUrl, serviceRoleKey, authContext);
    const pricing = await loadModelPricing(supabaseUrl, serviceRoleKey, args.model);
    const charge = estimateAiCharge(args.usageMetadata, pricing, numberFrom(settings?.default_margin_percent, DEFAULT_AI_MARGIN_PERCENT));
    const rows = await restInsert(supabaseUrl, serviceRoleKey, 'org_ai_usage_ledger', [{
      org_id: authContext.orgId,
      user_id: authContext.userId || null,
      thread_id: args.threadId || null,
      message_id: args.messageId || null,
      avalai_request_id: args.requestId || null,
      capability: args.capability || 'dashboard_chat',
      provider: args.provider || 'avalai',
      model: args.model || '',
      status: args.status || 'finalized',
      raw_cost_unit: charge.rawCostUnit,
      raw_cost_irt: charge.rawCostIrt,
      billed_amount_irt: charge.billedAmountIrt,
      margin_percent: charge.marginPercent,
      exchange_rate_irt: charge.exchangeRate,
      usage: args.usageMetadata || {},
      metadata: args.metadata || {},
      finalized_at: new Date().toISOString(),
    }]);
    return rows[0] || null;
  } catch (error) {
    console.warn('AI usage ledger insert skipped', error);
    return null;
  }
};

const withCustomerBilling = (usageMetadata: any, ledger: any) => {
  if (!usageMetadata || !ledger) return usageMetadata;
  return {
    ...usageMetadata,
    customer_billing: {
      amount_irt: numberFrom(ledger?.billed_amount_irt, 0),
      margin_percent: numberFrom(ledger?.margin_percent, 0),
      exchange_rate_irt: numberFrom(ledger?.exchange_rate_irt, DEFAULT_AI_EXCHANGE_RATE_IRT),
      ledger_id: ledger?.id || null,
    },
  };
};

const patchAiMessageCustomerBilling = async (
  supabaseUrl: string,
  serviceRoleKey: string,
  authContext: any,
  message: any,
  usageMetadata: any,
  ledger: any,
) => {
  if (!message?.id || !ledger) return;
  const rows = await safeRestSelect(supabaseUrl, serviceRoleKey, 'ai_messages', {
    id: `eq.${message.id}`,
    org_id: `eq.${authContext.orgId}`,
    select: 'id,metadata',
    limit: 1,
  }).catch(() => []);
  const rowMetadata = rows?.[0]?.metadata && typeof rows[0].metadata === 'object' ? rows[0].metadata : null;
  const currentMetadata = rowMetadata || (message?.metadata && typeof message.metadata === 'object' ? message.metadata : {});
  await restPatch(supabaseUrl, serviceRoleKey, 'ai_messages', {
    id: `eq.${message.id}`,
    org_id: `eq.${authContext.orgId}`,
  }, {
    metadata: {
      ...currentMetadata,
      usage: withCustomerBilling(usageMetadata, ledger),
    },
  }).catch((error: any) => console.warn('AI message billing patch skipped', error));
};

// Reasoning models use internal chain-of-thought tokens before producing output.
// They require max_completion_tokens (not max_tokens) and do NOT support temperature.
// Covers: OpenAI o-series, GPT-5 family, DeepSeek R1, Grok reasoning variants,
//         Kimi Thinking, QwQ, and any model explicitly named "reasoning".
const REASONING_MODEL_PATTERNS = [
  /^o\d/i,              // OpenAI: o1, o3, o4
  /\bo[34][-_]/i,       // OpenAI: o3-mini, o4-mini
  /^gpt-5/i,            // OpenAI: gpt-5, gpt-5-mini, gpt-5.4 family
  /deepseek-r\d/i,      // DeepSeek: deepseek-r1, deepseek-r2
  /\breasonin/i,        // any model with "reasoning" in name
  /\bqwq\b/i,           // Alibaba QwQ
  /kimi.thinking/i,     // Moonshot Kimi Thinking
  /grok.*\breason/i,    // Grok reasoning variants
];
const isReasoningModel = (model: string) =>
  REASONING_MODEL_PATTERNS.some((p) => p.test(String(model || '').trim()));

// AvalAI gateway errors sometimes arrive as a full HTML error page (e.g. a 504
// Cloudflare page). Turn that into a short, readable Persian message.
const shortenProviderError = (raw: any) => {
  const text = String(raw || '').trim();
  if (/credit has been exhausted|don't have enough credit|not enough credit|top up your account|ava\.al\/billing/i.test(text)) {
    return 'اعتبار حساب Avalai تمام شده یا برای این درخواست کافی نیست. اعتبار پنل Avalai را شارژ کنید و دوباره تلاش کنید.';
  }
  if (/upstream server is timing out|workerrequestcancelled|request has been cancelled|gateway.*time-?out|timed out|timeout/i.test(text)) {
    return 'سرویس هوش مصنوعی در زمان مناسب پاسخ نداد. چند لحظه بعد دوباره تلاش کنید یا برای این درخواست مدل سریع‌تری انتخاب کنید.';
  }
  const isHtml = /<html|<!doctype/i.test(text);
  if (isHtml && /gateway timeout|error\s*504|خطای ۵۰۴|\b504\b/i.test(text)) {
    return 'سرویس هوش مصنوعی موقتاً پاسخ نداد (Gateway Timeout). چند لحظه بعد دوباره تلاش کنید.';
  }
  if (isHtml) {
    const stripped = text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    return (stripped.slice(0, 200) || 'خطای موقت سرویس هوش مصنوعی.');
  }
  return text.length > 400 ? `${text.slice(0, 400)}…` : text;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const isRetriableProviderFailure = (status: number, message: string) => {
  const normalized = String(message || '').trim().toLowerCase();
  return status >= 500
    || /unexpected condition|try again later|temporar|gateway|timeout|timed out|workerrequestcancelled|cancelled/i.test(normalized);
};

const extractImagePayload = (raw: any): {
  imageBase64: string;
  imageUrl: string;
  debugShape: string;
} => {
  const candidates: any[] = [];
  const push = (value: any, label: string) => {
    if (!value) return;
    candidates.push({ value, label });
  };

  push(raw, 'root');
  push(raw?.image, 'image');
  push(raw?.images?.[0], 'images[0]');
  push(raw?.data?.[0], 'data[0]');
  push(raw?.output?.[0], 'output[0]');
  push(raw?.result, 'result');
  push(raw?.response?.data?.[0], 'response.data[0]');
  push(raw?.candidates?.[0]?.content?.parts?.find((part: any) => part?.inline_data?.data || part?.inlineData?.data || part?.file_data?.file_uri || part?.fileData?.fileUri), 'gemini.part');

  for (const entry of candidates) {
    const item = entry.value;
    const imageBase64 = String(
      item?.b64_json
      || item?.base64
      || item?.image_base64
      || item?.inline_data?.data
      || item?.inlineData?.data
      || ''
    ).trim();
    const imageUrl = String(
      item?.url
      || item?.image_url
      || item?.uri
      || item?.file_data?.file_uri
      || item?.fileData?.fileUri
      || ''
    ).trim();
    if (imageBase64 || imageUrl) {
      return { imageBase64, imageUrl, debugShape: entry.label };
    }
  }

  return { imageBase64: '', imageUrl: '', debugShape: 'none' };
};

const CHAT_COMPLETIONS_TIMEOUT_MS = PROVIDER_REQUEST_TIMEOUT_MS;

const callChatCompletions = async (
  providerConfig: any,
  messages: Array<{ role: string; content: any }>,
  options?: {
    temperature?: number;
    maxTokens?: number;
    maxCompletionTokens?: number;
    safetyIdentifier?: string;
    timeoutMs?: number;
    responseFormat?: Record<string, any> | null;
  }
) => {
  if (providerConfig?.isActive === false) {
    throw new Error('اتصال AI برای این سازمان غیرفعال است.');
  }
  if (!providerConfig.apiKey) {
    throw new Error('کلید مرکزی AI تنظیم نشده است. مقدار AI_API_KEY یا AVALAI_API_KEY را در Edge Function secrets ثبت کنید.');
  }

  const primaryModel = String(providerConfig.model || '').trim();
  if (!primaryModel) throw new Error('برای این قابلیت هوش مصنوعی، مدل فعال در تنظیمات سازمان پیدا نشد.');
  const modelsToTry = [primaryModel];

  let lastErrorMessage = '';
  for (let attempt = 0; attempt < modelsToTry.length; attempt += 1) {
    const model = modelsToTry[attempt];
    const reasoning = isReasoningModel(model);
    const requestBody: Record<string, any> = {
      model,
      messages,
      safety_identifier: options?.safetyIdentifier || undefined,
    };
    if (options?.responseFormat && typeof options.responseFormat === 'object') {
      requestBody.response_format = options.responseFormat;
    }
    if (reasoning) {
      requestBody.max_completion_tokens = options?.maxCompletionTokens ?? options?.maxTokens ?? 2500;
    } else {
      requestBody.temperature = options?.temperature ?? 0.2;
      requestBody.max_tokens = options?.maxTokens ?? 2000;
    }

    let response: Response;
    let baseUrl: string;
    try {
      const result = await requestAvalaiWithFallback(providerConfig, '/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${providerConfig.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(options?.timeoutMs ?? CHAT_COMPLETIONS_TIMEOUT_MS),
      }, { disableFallback: true });
      response = result.response;
      baseUrl = result.baseUrl;
    } catch (error: any) {
      lastErrorMessage = String(error?.message || 'اتصال به سرویس هوش مصنوعی برقرار نشد.');
      continue;
    }

    const requestId = response.headers.get('x-request-id') || response.headers.get('x-avalai-request-id') || null;
    const raw = await response.text();
    const parsed = parseJsonSafe(raw);
    if (!response.ok) {
      const message = typeof parsed === 'string' ? parsed : (parsed?.error?.message || (raw && raw.length < 600 ? raw : `status ${response.status}`));
      lastErrorMessage = String(message);
      throw new Error(`خطای provider هوش مصنوعی: ${shortenProviderError(message)}`);
    }

    const content = parsed?.choices?.[0]?.message?.content ?? parsed?.choices?.[0]?.text ?? '';
    const normalizedContent = normalizeAiContentText(content);
    const finishReason = getChatFinishReason(parsed);
    if (!isCompleteChatFinishReason(finishReason)) {
      throw buildIncompleteAiResponseError(finishReason, normalizedContent);
    }
    return {
      content: normalizedContent,
      attachments: normalizeAiContentAttachments(content),
      provider: providerConfig.provider,
      model,
      requestId,
      baseUrl,
      raw: parsed,
      finishReason,
      usageMetadata: extractUsageMetadata(parsed, { ...providerConfig, model }),
    };
  }
  throw new Error(`خطای provider هوش مصنوعی: ${shortenProviderError(lastErrorMessage || 'سرویس در دسترس نیست.')}`);
};

const parseChatStreamDelta = (parsed: any) => {
  const choice = Array.isArray(parsed?.choices) ? parsed.choices[0] : null;
  const delta = choice?.delta?.content ?? choice?.message?.content ?? choice?.text ?? '';
  return {
    text: typeof delta === 'string' ? delta : normalizeAiContentText(delta),
    finishReason: String(choice?.finish_reason ?? choice?.finishReason ?? '').trim(),
  };
};

const callChatCompletionsStream = async (
  providerConfig: any,
  messages: Array<{ role: string; content: any }>,
  options: {
    temperature?: number;
    maxTokens?: number;
    maxCompletionTokens?: number;
    safetyIdentifier?: string;
    timeoutMs?: number;
    onDelta?: (text: string) => void | Promise<void>;
  } = {},
) => {
  if (providerConfig?.isActive === false) {
    throw new Error('اتصال AI برای این سازمان غیرفعال است.');
  }
  if (!providerConfig.apiKey) {
    throw new Error('کلید مرکزی AI تنظیم نشده است. مقدار AI_API_KEY یا AVALAI_API_KEY را در Edge Function secrets ثبت کنید.');
  }

  const model = String(providerConfig.model || '').trim();
  if (!model) throw new Error('برای این قابلیت هوش مصنوعی، مدل فعال در تنظیمات سازمان پیدا نشد.');
  const reasoning = isReasoningModel(model);
  const requestBody: Record<string, any> = {
    model,
    messages,
    stream: true,
    stream_options: { include_usage: true },
    safety_identifier: options?.safetyIdentifier || undefined,
  };
  if (reasoning) {
    requestBody.max_completion_tokens = options?.maxCompletionTokens ?? options?.maxTokens ?? 2500;
  } else {
    requestBody.temperature = options?.temperature ?? 0.2;
    requestBody.max_tokens = options?.maxTokens ?? 2000;
  }

  const result = await requestAvalaiWithFallback(providerConfig, '/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${providerConfig.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
    signal: AbortSignal.timeout(options?.timeoutMs ?? CHAT_COMPLETIONS_TIMEOUT_MS),
  }, { disableFallback: true });
  const response = result.response;
  const requestId = response.headers.get('x-request-id') || response.headers.get('x-avalai-request-id') || null;
  if (!response.ok) {
    const raw = await response.text();
    const parsed = parseJsonSafe(raw);
    const message = typeof parsed === 'string' ? parsed : (parsed?.error?.message || (raw && raw.length < 600 ? raw : `status ${response.status}`));
    throw new Error(`خطای provider هوش مصنوعی: ${shortenProviderError(message)}`);
  }
  if (!response.body) throw new Error('پاسخ جریانی هوش مصنوعی در دسترس نیست.');

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let doneMarker = false;
  let finalParsed: any = null;
  let finishReason = '';
  let content = '';

  const processEvent = async (eventText: string) => {
    const dataLines = eventText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trim())
      .filter(Boolean);
    for (const dataLine of dataLines) {
      if (dataLine === '[DONE]') {
        doneMarker = true;
        continue;
      }
      const parsed = parseJsonSafe(dataLine);
      if (!parsed || typeof parsed !== 'object') continue;
      finalParsed = parsed;
      const delta = parseChatStreamDelta(parsed);
      if (delta.text) {
        content += delta.text;
        await options.onDelta?.(delta.text);
      }
      if (delta.finishReason) finishReason = delta.finishReason;
    }
  };

  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    buffer += decoder.decode(chunk.value, { stream: true });
    const parts = buffer.split(/\r?\n\r?\n/);
    buffer = parts.pop() || '';
    for (const part of parts) {
      if (part.trim()) await processEvent(part);
    }
  }
  buffer += decoder.decode();
  if (buffer.trim()) await processEvent(buffer);

  if (!doneMarker) throw buildIncompleteAiResponseError('stream_interrupted', content);
  if (!isCompleteChatFinishReason(finishReason)) throw buildIncompleteAiResponseError(finishReason, content);

  return {
    content: content.trim(),
    attachments: [],
    provider: providerConfig.provider,
    model,
    requestId,
    baseUrl: result.baseUrl,
    raw: finalParsed,
    finishReason,
    usageMetadata: extractUsageMetadata(finalParsed, { ...providerConfig, model }),
  };
};

const normalizeBase64Payload = (value: any, mimeType?: string | null) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^data:[^;]+;base64,/i.test(raw)) return raw;
  const mime = String(mimeType || '').trim();
  return mime ? `data:${mime};base64,${raw.replace(/^data:[^;]+;base64,/i, '')}` : raw.replace(/^data:[^;]+;base64,/i, '');
};

const getPublicSupabaseUrl = (supabaseUrl: string) => {
  const explicit = [
    Deno.env.get('SUPABASE_PUBLIC_URL'),
    Deno.env.get('PUBLIC_SUPABASE_URL'),
    Deno.env.get('EXTERNAL_SUPABASE_URL'),
    Deno.env.get('VITE_SUPABASE_URL'),
  ].map((item) => String(item || '').trim()).find(Boolean);
  const raw = explicit || supabaseUrl;
  try {
    const parsed = new URL(raw);
    const hostname = parsed.hostname.toLowerCase();
    if (hostname === 'kong' || hostname === 'localhost' || hostname === '127.0.0.1' || hostname.endsWith('.internal')) {
      return 'https://api.tazesystem.ir';
    }
    if (parsed.protocol === 'http:') parsed.protocol = 'https:';
    return parsed.toString().replace(/\/+$/, '');
  } catch {
    return 'https://api.tazesystem.ir';
  }
};

const buildOpenAiFileContentPart = (file: any) => {
  const base64 = normalizeBase64Payload(
    file?.data || file?.base64 || file?.file_data || file?.fileData,
    file?.mimeType || file?.mime_type || file?.type || null,
  );
  if (!base64) return null;
  const filename = String(file?.filename || file?.fileName || file?.name || 'uploaded-file').trim() || 'uploaded-file';
  return {
    type: 'file',
    file: {
      filename,
      file_data: base64,
    },
  };
};

const buildOpenAiInputContentParts = (text: string, file?: any) => {
  const parts: any[] = [{ type: 'text', text }];
  const mimeType = String(file?.mimeType || file?.mime_type || file?.type || '').trim().toLowerCase();
  const data = normalizeBase64Payload(
    file?.data || file?.base64 || file?.file_data || file?.fileData,
    mimeType || null,
  );
  if (data && mimeType.startsWith('image/')) {
    parts.push({ type: 'image_url', image_url: { url: data } });
    return parts;
  }
  const filePart = buildOpenAiFileContentPart(file || {});
  if (filePart) parts.push(filePart);
  return parts;
};

const extractJsonObjectFromText = (value: any) => {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const withoutFence = raw
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/i, '')
    .trim();
  const candidates = [withoutFence];
  const start = withoutFence.indexOf('{');
  const end = withoutFence.lastIndexOf('}');
  if (start >= 0 && end > start) candidates.push(withoutFence.slice(start, end + 1));
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === 'object') return parsed;
    } catch {
      // try next candidate
    }
  }
  return null;
};

const normalizeAiRecordValue = (value: any, field: any) => {
  if (value === undefined || value === '') return null;
  if (value === null) return null;
  const type = String(field?.type || '').trim();
  if (['number', 'price', 'percentage', 'stock', 'percentage_or_amount'].includes(type)) {
    const normalized = Number(String(value).replace(/[,\s]/g, ''));
    return Number.isFinite(normalized) ? normalized : null;
  }
  if (type === 'checkbox') return value === true || String(value).trim().toLowerCase() === 'true' || String(value).trim() === '1' || String(value).trim() === 'بله';
  if (type === 'multi_select' || type === 'multi_relation') {
    return Array.isArray(value) ? value : [value].filter((item) => item !== null && item !== undefined && item !== '');
  }
  if (type === 'select' || type === 'status') {
    const allowed = Array.isArray(field?.options) ? field.options.map((option: any) => String(option?.value ?? '').trim()).filter(Boolean) : [];
    const normalized = String(value || '').trim();
    if (!allowed.length || allowed.includes(normalized)) return normalized || null;
    const byLabel = (field.options || []).find((option: any) => String(option?.label || '').trim() === normalized);
    return byLabel ? byLabel.value : null;
  }
  return value;
};

const sanitizeAiRecordPayload = (rawPayload: any, schema: any) => {
  const blockedKeys = new Set([
    'id',
    'org_id',
    'system_code',
    'created_at',
    'updated_at',
    'created_by',
    'updated_by',
    'deleted_at',
  ]);
  const fields = Array.isArray(schema?.fields) ? schema.fields : [];
  const allowed = new Map(
    fields
      .map((field: any) => [String(field?.key || '').trim(), field] as const)
      .filter(([key]) => key && !blockedKeys.has(key)),
  );
  const rawFields = rawPayload?.fields && typeof rawPayload.fields === 'object' ? rawPayload.fields : rawPayload;
  const payload: Record<string, any> = {};
  Object.entries(rawFields || {}).forEach(([key, value]) => {
    const normalizedKey = String(key || '').trim();
    const field = allowed.get(normalizedKey);
    if (!field) return;
    payload[normalizedKey] = normalizeAiRecordValue(value, field);
  });
  return payload;
};

const buildAiRecordTitle = (record: any, fallback: string) => {
  const candidates = [
    record?.system_code,
    record?.name,
    record?.title,
    record?.full_name,
    record?.business_name,
    record?.invoice_number,
    record?.description,
  ];
  const value = candidates.map((item) => String(item || '').trim()).find(Boolean);
  return value || fallback || 'رکورد جدید';
};

const normalizeAiClarificationQuestions = (value: any) =>
  (Array.isArray(value) ? value : [])
    .map((item: any) => String(item || '').trim())
    .filter(Boolean)
    .slice(0, 5);

const buildAiClarificationReply = (reply: string, questions: string[]) => {
  const base = reply.trim() || 'برای انجام دقیق این درخواست به چند اطلاعات تکمیلی نیاز دارم.';
  if (!questions.length) return base;
  return [
    base,
    '',
    ...questions.map((question, index) => `${index + 1}. ${question}`),
  ].join('\n');
};

const callEmbeddings = async (providerConfig: any, input: string, model = DEFAULT_EMBEDDING_MODEL) => {
  if (!providerConfig.apiKey) throw new Error('کلید مرکزی AI تنظیم نشده است.');
  const { response, baseUrl } = await requestAvalaiWithFallback(providerConfig, '/embeddings', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${providerConfig.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      input,
      encoding_format: 'float',
    }),
  });
  const requestId = response.headers.get('x-request-id') || response.headers.get('x-avalai-request-id') || null;
  const raw = await response.text();
  const parsed = parseJsonSafe(raw);
  if (!response.ok) {
    const message = typeof parsed === 'string' ? parsed : (parsed?.error?.message || JSON.stringify(parsed || {}));
    throw new Error(`خطای embedding هوش مصنوعی: ${message}`);
  }
  const embedding = parsed?.data?.[0]?.embedding;
  if (!Array.isArray(embedding)) throw new Error('پاسخ embedding معتبر نیست.');
  return {
    embedding,
    requestId,
    baseUrl,
    usageMetadata: extractUsageMetadata(parsed, { ...providerConfig, model, capability: 'embedding' }),
  };
};

// Web search keywords that suggest the user needs real-time/external information
const WEB_SEARCH_TRIGGER_PATTERNS = [
  /امروز|دیروز|این هفته|این ماه|الان|فعلی|اخیر/,
  /آخرین|جدیدترین|تازه‌ترین|جدید/,
  /اخبار|خبر|رویداد/,
  /قیمت.*(دلار|ارز|طلا|بیتکوین|سهام)/,
  /نرخ.*(ارز|دلار|یورو)/,
  /today|latest|current|news|price/i,
];

const shouldTriggerWebSearch = (message: string) =>
  WEB_SEARCH_TRIGGER_PATTERNS.some((p) => p.test(message));

const callWebSearch = async (
  providerConfig: any,
  query: string,
  model = '',
  numResults = 5,
  required = false,
): Promise<{ results: any[]; requestId: string | null }> => {
  if (!providerConfig.apiKey) {
    if (required) throw new Error('کلید مرکزی AvalAI برای جستجوی وب تنظیم نشده است.');
    return { results: [], requestId: null };
  }
  const base = normalizeBaseUrl(providerConfig.baseUrl || DEFAULT_AI_BASE_URL).replace(/\/v\d+$/i, '');
  const url = `${base}/v1/search`;
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${providerConfig.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model, query, num_results: numResults }),
      signal: AbortSignal.timeout(12000),
    });
    const requestId = response.headers.get('x-request-id') || response.headers.get('x-avalai-request-id') || null;
    const raw = await response.text();
    const parsed = parseJsonSafe(raw);
    if (!response.ok) {
      if (required) {
        const message = typeof parsed === 'string' ? parsed : (parsed?.error?.message || parsed?.message || raw || 'جستجوی وب در AvalAI ناموفق بود.');
        throw new Error(`خطای جستجوی وب AvalAI: ${message}`);
      }
      return { results: [], requestId };
    }
    const rawResults = Array.isArray(parsed?.results) ? parsed.results
      : Array.isArray(parsed?.organic) ? parsed.organic
      : Array.isArray(parsed) ? parsed
      : [];
    const results = rawResults.slice(0, numResults).map((item: any) => ({
      title: String(item?.title || item?.name || '').trim(),
      url: String(item?.url || item?.link || '').trim(),
      snippet: String(item?.snippet || item?.description || item?.content || '').slice(0, 400).trim(),
    })).filter((item: any) => item.title || item.snippet);
    return { results, requestId };
  } catch (error) {
    if (required) throw error;
    return { results: [], requestId: null };
  }
};

// Route a model id to the correct AvalAI endpoint family. Mirrors
// ai_model_catalog.metadata.api_route (see database_v1_phase260).
const isGeminiImageModel = (model: string) => /^gemini[-.\d]*.*image/i.test(String(model || '').trim());

const buildImagePromptWithSettings = (prompt: string, settings: any = {}) => {
  const instructions: string[] = [];
  if (settings?.persianText === true) {
    instructions.push('اگر تصویر شامل نوشته، تیتر، تابلو، پوستر یا عدد است، متن‌ها را فارسی و طبیعی بنویس.');
  }
  if (settings?.persianDigits === true) {
    instructions.push('همه عددهای قابل مشاهده داخل تصویر را با ارقام فارسی ۰۱۲۳۴۵۶۷۸۹ نمایش بده.');
  }
  if (settings?.rtlText === true) {
    instructions.push('چیدمان نوشته‌ها باید راست‌به‌چپ، راست‌چین و مناسب زبان فارسی باشد.');
  }
  if (settings?.orientationHorizontal === true) {
    instructions.push('کادر نهایی افقی باشد.');
  } else if (settings?.orientationVertical === true) {
    instructions.push('کادر نهایی عمودی باشد.');
  }
  if (!instructions.length) return prompt;
  return `${prompt}\n\nالزامات خروجی تصویر:\n${instructions.map((item) => `- ${item}`).join('\n')}`;
};

const clampImagePrompt = (value: string) => {
  const text = String(value || '').trim();
  if (text.length <= IMAGE_PROMPT_MAX_CHARS) return text;
  return text.slice(0, IMAGE_PROMPT_MAX_CHARS).trim();
};

const appendImageContextToPrompt = (prompt: string, args: { companyContext?: any; pageSummary?: string | null; knowledgeChunks?: any[] }) => {
  const contextLines: string[] = [];
  const company = args.companyContext || {};
  const companyName = String(company.trade_name || company.company_name || company.organization_name || '').trim();
  if (companyName) contextLines.push(`نام سازمان/برند: ${companyName}`);
  if (company.company_name_en) contextLines.push(`نام انگلیسی برند: ${company.company_name_en}`);
  if (company.website) contextLines.push(`وب‌سایت: ${company.website}`);
  if (args.pageSummary) contextLines.push(`زمینه صفحه: ${String(args.pageSummary).slice(0, 300)}`);
  const knowledge = (args.knowledgeChunks || [])
    .map((item: any) => String(item?.content || item?.text || '').trim())
    .filter(Boolean)
    .slice(0, 2);
  if (knowledge.length) {
    contextLines.push(`دانش سازمانی مرتبط:\n${knowledge.map((item) => `- ${item.replace(/\s+/g, ' ').slice(0, 240)}`).join('\n')}`);
  }
  if (!contextLines.length) return prompt;
  return clampImagePrompt(`${prompt}\n\nزمینه مجاز سازمان برای استفاده در تصویر:\n${contextLines.join('\n')}`);
};

// Gemini image (Nano Banana) models are served via the native Gemini endpoint
// (/v1beta/models/{id}:generateContent), NOT the OpenAI /v1/images/generations route.
// Calling them on /images/generations hangs and returns a 504 gateway timeout.
const callGeminiImageGenerate = async (
  providerConfig: any,
  prompt: string,
  options: { sourceImages?: Array<{ data: string; mimeType?: string }>; extraConfig?: Record<string, any> } = {},
) => {
  if (!providerConfig.apiKey) throw new Error('کلید مرکزی AI تنظیم نشده است.');
  const model = String(providerConfig.model || '').trim();
  if (!model) throw new Error('برای تولید تصویر، مدل فعال در تنظیمات سازمان پیدا نشد.');
  const parts: any[] = [{ text: prompt }];
  for (const src of (options.sourceImages || [])) {
    const data = String(src?.data || '').replace(/^data:[^;]+;base64,/, '').trim();
    if (data) parts.push({ inline_data: { mime_type: src?.mimeType || 'image/png', data } });
  }
  const body: Record<string, any> = {
    contents: [{ parts }],
    generationConfig: {
      responseModalities: ['TEXT', 'IMAGE'],
      ...(options.extraConfig && typeof options.extraConfig === 'object' ? options.extraConfig : {}),
    },
  };
  // Gemini native endpoint lives at /v1beta (strip the /v1 suffix from the base url).
  const { response, baseUrl } = await requestAvalaiWithFallback(
    providerConfig,
    `/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${providerConfig.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(IMAGE_PROVIDER_TIMEOUT_MS),
    },
    { stripVersionForPath: true, disableFallback: true },
  );
  const requestId = response.headers.get('x-request-id') || response.headers.get('x-avalai-request-id') || null;
  const parsed = parseJsonSafe(await response.text());
  if (!response.ok) {
    const message = typeof parsed === 'string' ? parsed : (parsed?.error?.message || JSON.stringify(parsed || {}));
    throw new Error(`تولید تصویر ناموفق بود: ${shortenProviderError(message)}`);
  }
  const extracted = extractImagePayload(parsed);
  if (!extracted.imageBase64 && !extracted.imageUrl) {
    throw new Error(`خروجی تصویر از مدل دریافت نشد. شکل پاسخ: ${extracted.debugShape}`);
  }
  return {
    imageBase64: extracted.imageBase64,
    imageUrl: extracted.imageUrl,
    provider: providerConfig.provider,
    model,
    requestId,
    baseUrl,
    raw: parsed,
    usageMetadata: extractUsageMetadata(parsed, { ...providerConfig, model, capability: 'image_generation' }),
  };
};

const uint8ToBase64 = (bytes: Uint8Array) => {
  let binary = '';
  const chunkSize = 0x8000; // avoid call-stack limits on large images
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
};

const normalizeRawBase64 = (value: string) => {
  const withoutHeader = String(value || '').replace(/^data:[^;]+;base64,/i, '');
  const compact = withoutHeader.replace(/\s/g, '').replace(/-/g, '+').replace(/_/g, '/');
  if (!compact) return '';
  const padding = compact.length % 4;
  return padding ? `${compact}${'='.repeat(4 - padding)}` : compact;
};

const base64ToUint8Array = (value: string) => {
  const normalized = normalizeRawBase64(value);
  if (!normalized) return new Uint8Array();
  let binary = '';
  try {
    binary = atob(normalized);
  } catch {
    throw new Error('فایل ارسالی قابل خواندن نیست. لطفاً فایل یا ویس را دوباره انتخاب و ارسال کنید.');
  }
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
};

const callAudioTranscription = async (
  providerConfig: any,
  audioBase64: string,
  mimeType = 'audio/webm',
  filename = 'voice.webm',
) => {
  if (!providerConfig.apiKey) throw new Error('کلید مرکزی AI تنظیم نشده است.');
  const bytes = base64ToUint8Array(audioBase64);
  if (!bytes.length) throw new Error('فایل صوتی معتبر نیست.');
  // Use only the organization's selected STT model; do not silently switch engines.
  const candidateModels = Array.from(new Set([String(providerConfig.model || '').trim()].filter(Boolean)));
  if (candidateModels.length === 0) throw new Error('برای تبدیل صوت به متن، مدل فعال در تنظیمات سازمان پیدا نشد.');
  let lastMessage = '';

  for (const model of candidateModels) {
    const formData = new FormData();
    formData.append('model', model);
    formData.append('file', new Blob([bytes], { type: mimeType || 'audio/webm' }), filename || 'voice.webm');
    const { response, baseUrl } = await requestAvalaiWithFallback(providerConfig, '/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${providerConfig.apiKey}` },
      body: formData,
      signal: AbortSignal.timeout(LONG_MEDIA_PROVIDER_TIMEOUT_MS),
    }, { disableFallback: true });
    const requestId = response.headers.get('x-request-id') || response.headers.get('x-avalai-request-id') || null;
    const parsed = parseJsonSafe(await response.text());
    if (response.ok) {
      const transcript = String(parsed?.text || parsed?.transcript || parsed?.data?.text || '').trim();
      if (!transcript) throw new Error('متنی از ویس دریافت نشد.');
      return {
        transcript,
        provider: providerConfig.provider,
        model,
        requestId,
        baseUrl,
        raw: parsed,
        usageMetadata: extractUsageMetadata(parsed, { ...providerConfig, model, capability: 'voice_input' }),
      };
    }
    const message = typeof parsed === 'string' ? parsed : (parsed?.error?.message || parsed?.message || JSON.stringify(parsed || {}));
    lastMessage = `${model}: ${message}`;
    if (response.status === 401 || response.status === 403) {
      throw new Error(`تبدیل صوت به متن ناموفق بود: ${message}`);
    }
  }
  throw new Error(`تبدیل صوت به متن ناموفق بود: ${lastMessage || 'مدل مناسب برای تبدیل صوت پیدا نشد.'}`);
};

// Valid OpenAI/ElevenLabs voices on /v1/audio/speech (per AvalAI docs).
const AUDIO_SPEECH_VOICES = new Set([
  'alloy', 'ash', 'ballad', 'coral', 'echo', 'fable', 'onyx', 'nova', 'sage', 'shimmer', 'verse',
]);
const AUDIO_SPEECH_FORMATS = new Set(['mp3', 'opus', 'aac', 'flac', 'wav', 'pcm']);

const callAudioSpeech = async (
  providerConfig: any,
  text: string,
  options: { voice?: string; speed?: number; responseFormat?: string } = {},
) => {
  if (!providerConfig.apiKey) throw new Error('کلید مرکزی AI تنظیم نشده است.');
  const model = String(providerConfig.model || '').trim();
  if (!model) throw new Error('برای تولید صدا، مدل فعال در تنظیمات سازمان پیدا نشد.');
  const requestedVoice = String(options.voice || '').trim().toLowerCase();
  const voice = AUDIO_SPEECH_VOICES.has(requestedVoice) ? requestedVoice : 'alloy';
  const requestedFormat = String(options.responseFormat || '').trim().toLowerCase();
  const responseFormat = AUDIO_SPEECH_FORMATS.has(requestedFormat) ? requestedFormat : 'mp3';
  const speed = Number.isFinite(Number(options.speed))
    ? Math.min(4, Math.max(0.25, Number(options.speed)))
    : undefined;
  const { response, baseUrl } = await requestAvalaiWithFallback(providerConfig, '/audio/speech', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${providerConfig.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      input: text,
      voice,
      response_format: responseFormat,
      ...(speed !== undefined ? { speed } : {}),
    }),
    signal: AbortSignal.timeout(LONG_MEDIA_PROVIDER_TIMEOUT_MS),
  }, { disableFallback: true });
  const requestId = response.headers.get('x-request-id') || response.headers.get('x-avalai-request-id') || null;
  const contentType = response.headers.get('content-type') || 'audio/mpeg';
  if (!response.ok) {
    const raw = await response.text();
    const parsed = parseJsonSafe(raw);
    const message = typeof parsed === 'string' ? parsed : (parsed?.error?.message || parsed?.message || raw || 'تولید صدا ناموفق بود.');
    throw new Error(`تولید صدا ناموفق بود: ${shortenProviderError(message)}`);
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (!bytes.length) throw new Error('خروجی صوتی معتبر نیست.');
  return {
    bytes,
    contentType,
    format: responseFormat,
    provider: providerConfig.provider,
    model,
    requestId,
    baseUrl,
    usageMetadata: {
      provider: providerConfig.provider,
      model,
      capability: 'voice_output',
      input_characters: text.length,
    },
  };
};

const callImageGeneration = async (
  providerConfig: any,
  prompt: string,
  options: {
    sourceImages?: Array<{ data: string; mimeType?: string; filename?: string }>;
    size?: string;
    quality?: string;
    n?: number;
    extraBody?: Record<string, any>;
  } = {},
) => {
  if (!providerConfig.apiKey) throw new Error('کلید مرکزی AI تنظیم نشده است.');
  const model = String(providerConfig.model || '').trim();
  if (!model) throw new Error('برای تولید تصویر، مدل فعال در تنظیمات سازمان پیدا نشد.');
  const sourceImages = Array.isArray(options.sourceImages)
    ? options.sourceImages.filter((src) => String(src?.data || '').trim())
    : [];

  // Gemini Nano Banana models -> native /v1beta generateContent (handles both
  // generation and editing-with-source-images via inline_data parts).
  if (isGeminiImageModel(model)) {
    return await callGeminiImageGenerate({ ...providerConfig, model }, prompt, {
      sourceImages,
      extraConfig: options.extraBody,
    });
  }

  const allowedSizes = new Set(['1024x1024', '1024x1536', '1536x1024', '1024x1792', '1792x1024', 'auto']);
  const size = allowedSizes.has(String(options.size || '').trim()) ? String(options.size).trim() : '1024x1024';
  const n = Math.min(4, Math.max(1, Number(options.n) || 1));

  // OpenAI-family image models with source image(s) -> /v1/images/edits (multipart).
  if (sourceImages.length > 0) {
    const formData = new FormData();
    formData.append('model', model);
    formData.append('prompt', prompt);
    formData.append('n', String(n));
    formData.append('size', size);
    sourceImages.forEach((src, index) => {
      const bytes = base64ToUint8Array(src.data);
      const mime = src.mimeType || 'image/png';
      const ext = mime.includes('jpeg') || mime.includes('jpg') ? 'jpg' : 'png';
      formData.append('image', new Blob([bytes], { type: mime }), src.filename || `source_${index}.${ext}`);
    });
    if (options.extraBody && typeof options.extraBody === 'object') {
      Object.entries(options.extraBody).forEach(([key, value]) => {
        formData.append(key, typeof value === 'string' ? value : JSON.stringify(value));
      });
    }
    let lastFailure = '';
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      const { response, baseUrl } = await requestAvalaiWithFallback(providerConfig, '/images/edits', {
        method: 'POST',
        headers: { Authorization: `Bearer ${providerConfig.apiKey}` },
        body: formData,
        signal: AbortSignal.timeout(IMAGE_PROVIDER_TIMEOUT_MS),
      }, { disableFallback: true });
      const requestId = response.headers.get('x-request-id') || response.headers.get('x-avalai-request-id') || null;
      const parsed = parseJsonSafe(await response.text());
      if (!response.ok) {
        const message = typeof parsed === 'string' ? parsed : (parsed?.error?.message || JSON.stringify(parsed || {}));
        lastFailure = `ویرایش تصویر ناموفق بود: ${shortenProviderError(message)}`;
        if (attempt < 2 && isRetriableProviderFailure(response.status, message)) {
          await sleep(1200);
          continue;
        }
        const error: any = new Error(lastFailure);
        error.providerRawResponse = parsed;
        error.providerStatus = response.status;
        error.providerRequestId = requestId;
        throw error;
      }
      const extracted = extractImagePayload(parsed);
      if (!extracted.imageBase64 && !extracted.imageUrl) {
        lastFailure = `خروجی تصویر از مدل دریافت نشد. شکل پاسخ: ${extracted.debugShape}${requestId ? ` | request id: ${requestId}` : ''}`;
        if (attempt < 2) {
          await sleep(800);
          continue;
        }
        const error: any = new Error(lastFailure);
        error.providerRawResponse = parsed;
        error.providerRequestId = requestId;
        throw error;
      }
      return {
        imageBase64: extracted.imageBase64,
        imageUrl: extracted.imageUrl,
        provider: providerConfig.provider,
        model,
        requestId,
        baseUrl,
        raw: parsed,
        usageMetadata: extractUsageMetadata(parsed, { ...providerConfig, model, capability: 'image_generation' }),
      };
    }
    throw new Error(lastFailure || 'ویرایش تصویر ناموفق بود.');
  }

  let lastFailure = '';
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const { response, baseUrl } = await requestAvalaiWithFallback(providerConfig, '/images/generations', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${providerConfig.apiKey}`,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(IMAGE_PROVIDER_TIMEOUT_MS),
      body: JSON.stringify({
        model,
        prompt,
        ...(options.quality && String(options.quality) !== 'auto' ? { quality: options.quality } : {}),
        ...(options.extraBody && typeof options.extraBody === 'object' ? { extra_body: options.extraBody } : {}),
        n,
        size,
        // gpt-image-* always return b64_json and REJECT the response_format param.
        ...(/^gpt-image/i.test(model) ? {} : { response_format: 'b64_json' }),
      }),
    }, { disableFallback: true });
    const requestId = response.headers.get('x-request-id') || response.headers.get('x-avalai-request-id') || null;
    const parsed = parseJsonSafe(await response.text());
    if (!response.ok) {
      const message = typeof parsed === 'string' ? parsed : (parsed?.error?.message || JSON.stringify(parsed || {}));
      lastFailure = `تولید تصویر ناموفق بود: ${shortenProviderError(message)}`;
      if (attempt < 2 && isRetriableProviderFailure(response.status, message)) {
        await sleep(1200);
        continue;
      }
      const error: any = new Error(lastFailure);
      error.providerRawResponse = parsed;
      error.providerStatus = response.status;
      error.providerRequestId = requestId;
      throw error;
    }
    const extracted = extractImagePayload(parsed);
    if (!extracted.imageBase64 && !extracted.imageUrl) {
      lastFailure = `خروجی تصویر از مدل دریافت نشد. شکل پاسخ: ${extracted.debugShape}${requestId ? ` | request id: ${requestId}` : ''}`;
      if (attempt < 2) {
        await sleep(800);
        continue;
      }
      const error: any = new Error(lastFailure);
      error.providerRawResponse = parsed;
      error.providerRequestId = requestId;
      throw error;
    }
    return {
      imageBase64: extracted.imageBase64,
      imageUrl: extracted.imageUrl,
      provider: providerConfig.provider,
      model,
      requestId,
      baseUrl,
      raw: parsed,
      usageMetadata: extractUsageMetadata(parsed, { ...providerConfig, model, capability: 'image_generation' }),
    };
  }
  throw new Error(lastFailure || 'تولید تصویر ناموفق بود.');
};

// ── Video generation (async job, per AvalAI /v1/videos docs) ──────────────────
const callVideoCreate = async (
  providerConfig: any,
  prompt: string,
  options: { seconds?: number; size?: string; inputReference?: { data: string; mimeType?: string } } = {},
) => {
  if (!providerConfig.apiKey) throw new Error('کلید مرکزی AI تنظیم نشده است.');
  const model = String(providerConfig.model || '').trim();
  if (!model) throw new Error('برای تولید ویدیو، مدل فعال در تنظیمات سازمان پیدا نشد.');
  const seconds = String(Math.min(20, Math.max(1, Number(options.seconds) || 4)));
  const size = String(options.size || '720x1280').trim();
  const safetyIdentifier = `org_${providerConfig.orgId || ''}_video`.slice(0, 256);

  let init: RequestInit;
  if (options.inputReference?.data) {
    const formData = new FormData();
    formData.append('model', model);
    formData.append('prompt', prompt.slice(0, 1000));
    formData.append('seconds', seconds);
    formData.append('size', size);
    formData.append('safety_identifier', safetyIdentifier);
    const mime = options.inputReference.mimeType || 'image/png';
    const ext = mime.includes('jpeg') || mime.includes('jpg') ? 'jpg' : 'png';
    formData.append('input_reference', new Blob([base64ToUint8Array(options.inputReference.data)], { type: mime }), `reference.${ext}`);
    init = { method: 'POST', headers: { Authorization: `Bearer ${providerConfig.apiKey}` }, body: formData, signal: AbortSignal.timeout(LONG_MEDIA_PROVIDER_TIMEOUT_MS) };
  } else {
    init = {
      method: 'POST',
      headers: { Authorization: `Bearer ${providerConfig.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, prompt: prompt.slice(0, 1000), seconds, size, safety_identifier: safetyIdentifier }),
      signal: AbortSignal.timeout(LONG_MEDIA_PROVIDER_TIMEOUT_MS),
    };
  }
  const { response, baseUrl } = await requestAvalaiWithFallback(providerConfig, '/videos', init, { disableFallback: true });
  const requestId = response.headers.get('x-request-id') || response.headers.get('x-avalai-request-id') || null;
  const parsed = parseJsonSafe(await response.text());
  if (!response.ok) {
    const message = typeof parsed === 'string' ? parsed : (parsed?.error?.message || JSON.stringify(parsed || {}));
    throw new Error(`ساخت ویدیو ناموفق بود: ${shortenProviderError(message)}`);
  }
  return {
    videoId: String(parsed?.id || '').trim(),
    status: String(parsed?.status || 'queued').trim(),
    progress: numberFrom(parsed?.progress, 0),
    model,
    seconds: Number(seconds),
    provider: providerConfig.provider,
    requestId,
    baseUrl,
    raw: parsed,
  };
};

const callVideoStatus = async (providerConfig: any, videoId: string) => {
  if (!providerConfig.apiKey) throw new Error('کلید مرکزی AI تنظیم نشده است.');
  const { response } = await requestAvalaiWithFallback(providerConfig, `/videos/${encodeURIComponent(videoId)}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${providerConfig.apiKey}` },
    signal: AbortSignal.timeout(30000),
  });
  const parsed = parseJsonSafe(await response.text());
  if (!response.ok) {
    const message = typeof parsed === 'string' ? parsed : (parsed?.error?.message || JSON.stringify(parsed || {}));
    throw new Error(`دریافت وضعیت ویدیو ناموفق بود: ${message}`);
  }
  return {
    status: String(parsed?.status || 'processing').trim(),
    progress: numberFrom(parsed?.progress, 0),
    seconds: numberFrom(parsed?.seconds, 0),
    raw: parsed,
  };
};

const callVideoContent = async (providerConfig: any, videoId: string) => {
  if (!providerConfig.apiKey) throw new Error('کلید مرکزی AI تنظیم نشده است.');
  const { response } = await requestAvalaiWithFallback(providerConfig, `/videos/${encodeURIComponent(videoId)}/content`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${providerConfig.apiKey}` },
    signal: AbortSignal.timeout(LONG_MEDIA_PROVIDER_TIMEOUT_MS),
  }, { disableFallback: true });
  if (!response.ok) {
    const message = parseJsonSafe(await response.text());
    throw new Error(`دانلود ویدیو ناموفق بود: ${typeof message === 'string' ? message : JSON.stringify(message || {})}`);
  }
  const contentType = response.headers.get('content-type') || 'video/mp4';
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (!bytes.length) throw new Error('خروجی ویدیو معتبر نیست.');
  return { bytes, contentType };
};

const uploadGeneratedImage = async (
  supabaseUrl: string,
  serviceRoleKey: string,
  authContext: any,
  imageResult: any,
) => {
  const orgId = normalizeId(authContext?.orgId);
  if (!orgId) throw new Error('سازمان کاربر مشخص نیست.');
  let bytes: Uint8Array | null = null;
  let contentType = 'image/png';
  if (imageResult?.imageBase64) {
    bytes = base64ToUint8Array(imageResult.imageBase64);
  } else if (imageResult?.imageUrl) {
    const imageResponse = await fetch(imageResult.imageUrl);
    if (!imageResponse.ok) throw new Error('دریافت تصویر ساخته‌شده ناموفق بود.');
    contentType = imageResponse.headers.get('content-type') || contentType;
    bytes = new Uint8Array(await imageResponse.arrayBuffer());
  }
  if (!bytes?.length) throw new Error('خروجی تصویر معتبر نیست.');
  const ext = contentType.includes('jpeg') || contentType.includes('jpg') ? 'jpg' : 'png';
  const objectPath = `ai_generated/${orgId}/${Date.now()}_${crypto.randomUUID()}.${ext}`;
  const response = await fetch(`${supabaseUrl.replace(/\/+$/, '')}/storage/v1/object/images/${objectPath}`, {
    method: 'POST',
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': contentType,
      'x-upsert': 'true',
    },
    body: bytes,
  });
  const parsed = parseJsonSafe(await response.text());
  if (!response.ok) {
    throw new Error(typeof parsed === 'string' ? parsed : parsed?.message || 'ذخیره تصویر ساخته‌شده ناموفق بود.');
  }
  const publicSupabaseUrl = getPublicSupabaseUrl(supabaseUrl);
  return {
    bucket: 'images',
    path: objectPath,
    url: `${publicSupabaseUrl}/storage/v1/object/public/images/${objectPath}`,
    mimeType: contentType,
  };
};

const uploadGeneratedBinaryAsset = async (
  supabaseUrl: string,
  serviceRoleKey: string,
  authContext: any,
  bytes: Uint8Array,
  contentType: string,
  input: { prefix: string; extension: string },
) => {
  const orgId = normalizeId(authContext?.orgId);
  if (!orgId) throw new Error('سازمان کاربر مشخص نیست.');
  if (!bytes?.length) throw new Error('فایل خروجی معتبر نیست.');
  const extension = String(input.extension || 'bin').replace(/^\./, '').trim() || 'bin';
  const safePrefix = String(input.prefix || 'ai_generated').trim() || 'ai_generated';
  const objectPath = `ai_generated/${orgId}/${safePrefix}_${Date.now()}_${crypto.randomUUID()}.${extension}`;
  const response = await fetch(`${supabaseUrl.replace(/\/+$/, '')}/storage/v1/object/images/${objectPath}`, {
    method: 'POST',
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': contentType || 'application/octet-stream',
      'x-upsert': 'true',
    },
    body: bytes,
  });
  const parsed = parseJsonSafe(await response.text());
  if (!response.ok) {
    throw new Error(typeof parsed === 'string' ? parsed : parsed?.message || 'ذخیره فایل ساخته‌شده ناموفق بود.');
  }
  const publicSupabaseUrl = getPublicSupabaseUrl(supabaseUrl);
  return {
    bucket: 'images',
    path: objectPath,
    url: `${publicSupabaseUrl}/storage/v1/object/public/images/${objectPath}`,
    mimeType: contentType || 'application/octet-stream',
  };
};

const detectTableExists = async (supabaseUrl: string, serviceRoleKey: string, table: string) => {
  try {
    await restSelect(supabaseUrl, serviceRoleKey, table, { select: 'id', limit: 1 });
    return true;
  } catch {
    return false;
  }
};

const slugifyFileFolder = (value: string) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^\w\u0600-\u06FF\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'ai-files';

const ensureFileFolder = async (
  supabaseUrl: string,
  serviceRoleKey: string,
  authContext: any,
  input: {
    name: string;
    parentId?: string | null;
    folderType?: string;
    moduleId?: string | null;
    recordId?: string | null;
    sourceScope: string;
    sourceKey: string;
    metadata?: Record<string, any> | null;
    sortOrder?: number;
  },
) => {
  const existing = await safeRestSelect(supabaseUrl, serviceRoleKey, 'file_folders', {
    org_id: `eq.${authContext.orgId}`,
    source_scope: `eq.${input.sourceScope}`,
    source_key: `eq.${input.sourceKey}`,
    select: '*',
    limit: 1,
  });
  if (existing[0]) return existing[0];
  const rows = await restInsert(supabaseUrl, serviceRoleKey, 'file_folders', [{
    org_id: authContext.orgId,
    parent_id: input.parentId || null,
    name: input.name,
    slug: slugifyFileFolder(input.name),
    folder_type: input.folderType || 'manual',
    module_id: input.moduleId || null,
    record_id: input.recordId || null,
    source_scope: input.sourceScope,
    source_key: input.sourceKey,
    visibility: 'private',
    is_system: true,
    color_token: 'violet',
    icon_token: 'robot',
    metadata: input.metadata || {},
    sort_order: Number(input.sortOrder || 0),
    created_by: authContext.userId || null,
  }]);
  return rows[0] || null;
};

const ensureAiFileManagerFolder = async (
  supabaseUrl: string,
  serviceRoleKey: string,
  authContext: any,
  pageContext: any,
) => {
  const hasFileManager = await detectTableExists(supabaseUrl, serviceRoleKey, 'file_folders');
  if (!hasFileManager) return null;
  const moduleId = String(pageContext?.moduleId || '').trim();
  const recordId = String(pageContext?.recordId || '').trim();
  if (moduleId && recordId) {
    const recordFolderRows = await safeRestSelect(supabaseUrl, serviceRoleKey, 'file_folders', {
      org_id: `eq.${authContext.orgId}`,
      source_scope: 'eq.record_root',
      source_key: `eq.record_root:${moduleId}:${recordId}`,
      select: '*',
      limit: 1,
    });
    const parent = recordFolderRows[0] || await ensureFileFolder(supabaseUrl, serviceRoleKey, authContext, {
      name: 'رکورد',
      folderType: 'system_record',
      moduleId,
      recordId,
      sourceScope: 'record_root',
      sourceKey: `record_root:${moduleId}:${recordId}`,
      metadata: { auto_created: true, module_id: moduleId, record_id: recordId, source: 'ai_assistant' },
    });
    return await ensureFileFolder(supabaseUrl, serviceRoleKey, authContext, {
      name: 'فایل‌های هوش مصنوعی',
      parentId: parent?.id || null,
      folderType: 'manual',
      moduleId,
      recordId,
      sourceScope: 'ai_record_files',
      sourceKey: `ai_record_files:${moduleId}:${recordId}`,
      metadata: { auto_created: true, source: 'ai_assistant', module_id: moduleId, record_id: recordId },
      sortOrder: 900,
    });
  }
  return await ensureFileFolder(supabaseUrl, serviceRoleKey, authContext, {
    name: 'فایل‌های هوش مصنوعی',
    folderType: 'manual',
    moduleId: null,
    recordId: null,
    sourceScope: 'ai_workspace_files',
    sourceKey: `ai_workspace_files:${authContext.orgId}`,
    metadata: { auto_created: true, source: 'ai_assistant', scope: 'workspace' },
    sortOrder: 900,
  });
};

const registerAiGeneratedFileInFileManager = async (
  supabaseUrl: string,
  serviceRoleKey: string,
  authContext: any,
  pageContext: any,
  file: { bucket: string; path: string; url: string; mimeType?: string | null },
  input: { displayName: string; fileType: string; threadId?: string | null; messageId?: string | null; prompt?: string | null },
) => {
  const hasFileManager = await detectTableExists(supabaseUrl, serviceRoleKey, 'file_assets');
  if (!hasFileManager) return null;
  const folder = await ensureAiFileManagerFolder(supabaseUrl, serviceRoleKey, authContext, pageContext);
  const moduleId = String(pageContext?.moduleId || '').trim() || null;
  const recordId = String(pageContext?.recordId || '').trim() || null;
  const displayName = String(input.displayName || file.path.split('/').pop() || 'AI file').trim();
  const ext = displayName.includes('.') ? String(displayName.split('.').pop() || '').trim().toLowerCase() : null;
  const recordFileType = input.fileType === 'image' || input.fileType === 'video' ? input.fileType : 'file';
  const assetRows = await restUpsert(supabaseUrl, serviceRoleKey, 'file_assets', [{
    org_id: authContext.orgId,
    storage_bucket: file.bucket,
    storage_path: file.path,
    target_url: file.url,
    display_name: displayName,
    canonical_name: displayName.toLowerCase(),
    file_ext: ext,
    mime_type: file.mimeType || null,
    file_type: input.fileType || 'file',
    visibility: 'private',
    is_public: false,
    uploaded_by: authContext.userId || null,
    origin_module_id: moduleId,
    origin_record_id: recordId,
    origin_folder_id: folder?.id || null,
    metadata: {
      source: 'ai_generated',
      thread_id: input.threadId || null,
      message_id: input.messageId || null,
      prompt: input.prompt || null,
    },
  }], 'storage_bucket,storage_path');
  const asset = assetRows[0] || null;
  if (!asset?.id) return null;

  const entryRows = await restInsert(supabaseUrl, serviceRoleKey, 'file_entries', [{
    org_id: authContext.orgId,
    asset_id: asset.id,
    folder_id: folder?.id || null,
    entry_type: 'origin',
    entry_name: displayName,
    module_id: moduleId,
    record_id: recordId,
    source_table: 'ai_messages',
    source_row_id: input.messageId || null,
    sort_order: 0,
    metadata: {
      source: 'ai_generated',
      thread_id: input.threadId || null,
      prompt: input.prompt || null,
    },
    created_by: authContext.userId || null,
  }]).catch(() => []);
  const entry = entryRows[0] || null;

  const hasRecordFiles = moduleId && recordId && await detectTableExists(supabaseUrl, serviceRoleKey, 'record_files');
  if (hasRecordFiles) {
    await restInsert(supabaseUrl, serviceRoleKey, 'record_files', [{
      org_id: authContext.orgId,
      module_id: moduleId,
      record_id: recordId,
      file_url: file.url,
      file_type: recordFileType,
      file_name: displayName,
      mime_type: file.mimeType || null,
      sort_order: 0,
      folder_id: folder?.id || null,
      asset_id: asset.id,
      file_entry_id: entry?.id || null,
      entry_type: 'origin',
      is_shortcut: false,
      source_module_id: moduleId,
      source_record_id: recordId,
      metadata: {
        source: 'ai_generated',
        thread_id: input.threadId || null,
        message_id: input.messageId || null,
      },
    }]).catch(() => []);
  }

  return { asset, entry, folder };
};

const fetchThreadMessages = async (
  supabaseUrl: string,
  serviceRoleKey: string,
  authContext: any,
  threadId: string,
  limit = 120,
) => {
  if (!isUuid(threadId)) return [];
  return await safeRestSelect(supabaseUrl, serviceRoleKey, 'ai_messages', {
    thread_id: `eq.${threadId}`,
    org_id: `eq.${authContext.orgId}`,
    select: 'id,thread_id,role,content,provider,model,metadata,created_at',
    order: 'created_at.asc',
    limit,
  });
};

const findThreadByContextKey = async (
  supabaseUrl: string,
  serviceRoleKey: string,
  authContext: any,
  contextKey: string,
) => {
  const rows = await safeRestSelect(supabaseUrl, serviceRoleKey, 'ai_threads', {
    org_id: `eq.${authContext.orgId}`,
    user_id: `eq.${authContext.userId}`,
    status: 'eq.active',
    context_key: `eq.${contextKey}`,
    select: '*',
    order: 'updated_at.desc',
    limit: 1,
  });
  return rows[0] || null;
};

const canAccessThreadRow = (thread: any, authContext: any) => {
  if (!thread) return false;
  if (normalizeId(thread?.org_id) !== normalizeId(authContext?.orgId)) return false;
  if (normalizeId(thread?.user_id) === normalizeId(authContext?.userId)) return true;
  if (normalizeId(thread?.created_by) === normalizeId(authContext?.userId)) return true;
  const sharedUserIds = Array.isArray(thread?.shared_user_ids) ? thread.shared_user_ids.map(normalizeId) : [];
  const sharedRoleIds = Array.isArray(thread?.shared_role_ids) ? thread.shared_role_ids.map(normalizeId) : [];
  return sharedUserIds.includes(normalizeId(authContext?.userId)) || sharedRoleIds.includes(normalizeId(authContext?.roleId));
};

const fetchThreadForRead = async (
  supabaseUrl: string,
  serviceRoleKey: string,
  authContext: any,
  threadId: string,
) => {
  if (!isUuid(threadId)) return null;
  const rows = await safeRestSelect(supabaseUrl, serviceRoleKey, 'ai_threads', {
    id: `eq.${threadId}`,
    org_id: `eq.${authContext.orgId}`,
    status: 'eq.active',
    select: '*',
    limit: 1,
  });
  const thread = rows[0] || null;
  return canAccessThreadRow(thread, authContext) ? thread : null;
};

const ensureThread = async (
  supabaseUrl: string,
  serviceRoleKey: string,
  authContext: any,
  payload: { threadId?: string | null; title?: string; pageContext?: any; contextKey?: string; provider?: string; model?: string; forceNew?: boolean; continueByContext?: boolean },
) => {
  const requestedThreadId = normalizeId(payload.threadId);
  if (requestedThreadId && isUuid(requestedThreadId)) {
    const rows = await restSelect(supabaseUrl, serviceRoleKey, 'ai_threads', {
      id: `eq.${requestedThreadId}`,
      org_id: `eq.${authContext.orgId}`,
      user_id: `eq.${authContext.userId}`,
      status: 'eq.active',
      select: '*',
      limit: 1,
    });
    if (rows[0]) return rows[0];
  }

  const contextKey = payload.contextKey || buildContextKey(payload.pageContext?.context || {});
  if (!payload.forceNew && payload.continueByContext === true) {
    const existing = await findThreadByContextKey(supabaseUrl, serviceRoleKey, authContext, contextKey);
    if (existing) return existing;
  }

  const inserted = await restInsert(supabaseUrl, serviceRoleKey, 'ai_threads', [{
    org_id: authContext.orgId,
    user_id: authContext.userId,
    status: 'active',
    title: buildThreadTitle(payload.title || '', payload.pageContext),
    context_type: getContextKind(payload.pageContext?.context || {}),
    context_key: contextKey,
    module_id: payload.pageContext?.moduleId || null,
    record_id: payload.pageContext?.recordId || null,
    provider: payload.provider || getEnvProviderConfig().provider,
    model: payload.model || getEnvProviderConfig().model,
    metadata: {
      route: payload.pageContext?.context?.route || null,
      summary: payload.pageContext?.summary || null,
      context_kind: getContextKind(payload.pageContext?.context || {}),
      context_label: buildThreadContextLabel(payload.pageContext),
      context: payload.pageContext?.context || null,
      module_id: payload.pageContext?.moduleId || null,
      record_id: payload.pageContext?.recordId || null,
      intent: payload.pageContext?.intent || payload.pageContext?.context?.intent || null,
      process_field_key: payload.pageContext?.processFieldKey || payload.pageContext?.context?.processFieldKey || null,
      selected_process_id: payload.pageContext?.selectedProcessId || payload.pageContext?.context?.selectedProcessId || payload.pageContext?.context?.selectedProcessGroupId || null,
      last_activity_kind: 'created',
    },
  }]);
  return inserted[0];
};

const insertAiMessage = async (
  supabaseUrl: string,
  serviceRoleKey: string,
  authContext: any,
  payload: Record<string, any>,
) => {
  const rows = await restInsert(supabaseUrl, serviceRoleKey, 'ai_messages', [{
    org_id: authContext.orgId,
    ...payload,
  }]);
  return rows[0] || null;
};

const runBackgroundTask = (task: Promise<any>) => {
  const guarded = task.catch((error) => console.error('ai-assistant background task failed', error));
  const runtime = (globalThis as any)?.EdgeRuntime;
  if (runtime && typeof runtime.waitUntil === 'function') {
    runtime.waitUntil(guarded);
  } else {
    void guarded;
  }
};

const ensureOrgAiSettings = async (supabaseUrl: string, serviceRoleKey: string, authContext: any) => {
  const existing = await loadOrgAiSettings(supabaseUrl, serviceRoleKey, authContext);
  if (existing) return existing;
  const catalogRows = await listActiveAiModels(supabaseUrl, serviceRoleKey);
  const selectedModels = sanitizeTenantSelectedModels(catalogRows, {});
  const rows = await restInsert(supabaseUrl, serviceRoleKey, 'org_ai_settings', [{
    org_id: authContext.orgId,
    selected_models: selectedModels,
    feature_flags: {
      dashboard_chat: true,
      record_chat: true,
      customer_reply_suggestion: true,
      document_analysis: true,
      workflow_ai_prompt: true,
      web_search: false,       // off by default — admin enables when API key is set
      voice_input: false,
      voice_output: false,
      image_generation: false,
      video_generation: false,
      voip_auto_reply: false,
    },
    require_human_approval: true,
    default_margin_percent: DEFAULT_AI_MARGIN_PERCENT,
    created_by: authContext.userId,
    updated_by: authContext.userId,
  }]);
  return rows[0] || null;
};

const fetchAvalaiCredit = async (providerConfig: any) => {
  if (!providerConfig.apiKey) return { available: false, message: 'کلید مرکزی AvalAI تنظیم نشده است.' };
  const { response, baseUrl } = await requestAvalaiWithFallback(providerConfig, '/user/v1/credit', {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${providerConfig.apiKey}`,
      'Content-Type': 'application/json',
    },
  }, { stripVersionForPath: true });
  const raw = await response.text();
  const parsed = parseJsonSafe(raw);
  if (!response.ok) {
    return { available: false, status: response.status, message: typeof parsed === 'string' ? parsed : parsed?.message || 'اعتبار AvalAI دریافت نشد.', raw: parsed };
  }
  return { available: true, credit: parsed, baseUrl };
};

const handleGetAiSettings = async (supabaseUrl: string, serviceRoleKey: string, authContext: any) => {
  if (!canManageAiSettings(authContext)) {
    return json(403, { success: false, message: 'دسترسی مدیریت تنظیمات هوش مصنوعی را ندارید.' });
  }
  const settings = await ensureOrgAiSettings(supabaseUrl, serviceRoleKey, authContext);
  return json(200, { success: true, settings });
};

const handleSaveAiSettings = async (supabaseUrl: string, serviceRoleKey: string, authContext: any, body: any) => {
  if (!canManageAiSettings(authContext)) {
    return json(403, { success: false, message: 'دسترسی مدیریت تنظیمات هوش مصنوعی را ندارید.' });
  }
  if (!authContext.orgId) return json(400, { success: false, message: 'سازمان کاربر مشخص نیست.' });
  const incoming = body?.settings || {};
  const existing = await ensureOrgAiSettings(supabaseUrl, serviceRoleKey, authContext);
  const catalogRows = await safeRestSelect(supabaseUrl, serviceRoleKey, 'ai_model_catalog', {
    is_active: 'eq.true',
    select: '*',
    order: 'id.asc',
    limit: 300,
  });
  const planContext = await loadTenantAiPlanContext(supabaseUrl, serviceRoleKey, authContext);
  const baseAvailability = buildAiCapabilityAvailability(planContext, existing, catalogRows);
  const selectedModels = incoming.selected_models && typeof incoming.selected_models === 'object'
    ? incoming.selected_models
    : incoming.selectedModels && typeof incoming.selectedModels === 'object'
    ? incoming.selectedModels
    : existing?.selected_models || {};
  const featureFlags = incoming.feature_flags && typeof incoming.feature_flags === 'object'
    ? incoming.feature_flags
    : incoming.featureFlags && typeof incoming.featureFlags === 'object'
    ? incoming.featureFlags
    : existing?.feature_flags || {};
  const sanitizedModels = sanitizeTenantSelectedModels(catalogRows, selectedModels);
  const sanitizedFlags = sanitizeTenantFeatureFlags(baseAvailability, featureFlags);
  const rows = await restUpsert(supabaseUrl, serviceRoleKey, 'org_ai_settings', [{
    org_id: authContext.orgId,
    selected_models: sanitizedModels,
    feature_flags: sanitizedFlags,
    daily_limit_irt: incoming.daily_limit_irt ?? incoming.dailyLimitIrt ?? existing?.daily_limit_irt ?? null,
    monthly_limit_irt: incoming.monthly_limit_irt ?? incoming.monthlyLimitIrt ?? existing?.monthly_limit_irt ?? null,
    require_human_approval: incoming.require_human_approval !== false && incoming.requireHumanApproval !== false,
    default_margin_percent: numberFrom(incoming.default_margin_percent ?? incoming.defaultMarginPercent, numberFrom(existing?.default_margin_percent, DEFAULT_AI_MARGIN_PERCENT)),
    metadata: { ...(existing?.metadata || {}), last_saved_via: 'ai_settings_tab' },
    created_by: existing?.created_by || authContext.userId,
    updated_by: authContext.userId,
  }], 'org_id');
  return json(200, { success: true, settings: rows[0] || existing });
};

const handleGetAiOverview = async (supabaseUrl: string, serviceRoleKey: string, authContext: any) => {
  if (!canManageAiSettings(authContext)) {
    return json(403, { success: false, message: 'دسترسی مشاهده تنظیمات هوش مصنوعی را ندارید.' });
  }
  const [settings, rawModels, wallets, ledgerRows] = await Promise.all([
    ensureOrgAiSettings(supabaseUrl, serviceRoleKey, authContext),
    safeRestSelect(supabaseUrl, serviceRoleKey, 'ai_model_catalog', {
      is_active: 'eq.true',
      select: '*',
      order: 'id.asc',
      limit: 200,
    }),
    authContext.orgId
      ? safeRestSelect(supabaseUrl, serviceRoleKey, 'org_ai_wallets', {
          org_id: `eq.${authContext.orgId}`,
          select: '*',
          limit: 1,
        })
      : Promise.resolve([]),
    authContext.orgId
      ? safeRestSelect(supabaseUrl, serviceRoleKey, 'org_ai_usage_ledger', {
          org_id: `eq.${authContext.orgId}`,
          select: 'id,capability,model,status,raw_cost_irt,billed_amount_irt,usage,created_at',
          order: 'created_at.desc',
          limit: 200,
        })
      : Promise.resolve([]),
  ]);
  const planContext = await loadTenantAiPlanContext(supabaseUrl, serviceRoleKey, authContext);
  const availability = buildAiCapabilityAvailability(planContext, settings, rawModels);
  const models = (rawModels || []).filter((model: any) => model?.is_coming_soon !== true);
  const totals = (ledgerRows || []).reduce((acc: any, row: any) => {
    if (String(row?.status || '') !== 'finalized') return acc;
    acc.billed_amount_irt += numberFrom(row?.billed_amount_irt, 0);
    acc.raw_cost_irt += numberFrom(row?.raw_cost_irt, 0);
    acc.requests += 1;
    const model = String(row?.model || 'unknown');
    acc.by_model[model] = (acc.by_model[model] || 0) + numberFrom(row?.billed_amount_irt, 0);
    const capability = String(row?.capability || 'unknown');
    acc.by_capability[capability] = (acc.by_capability[capability] || 0) + numberFrom(row?.billed_amount_irt, 0);
    return acc;
  }, { billed_amount_irt: 0, raw_cost_irt: 0, requests: 0, by_model: {}, by_capability: {} });
  const [providerCredit, companyContext] = await Promise.all([
    fetchAvalaiCredit(getCentralProviderConfig()).catch((error: any) => ({
      available: false,
      message: String(error?.message || error || 'اعتبار AvalAI دریافت نشد.'),
    })),
    loadCompanyContext(supabaseUrl, serviceRoleKey, authContext),
  ]);
  return json(200, {
    success: true,
    settings,
    models,
    plan: {
      code: planContext?.planCode || null,
      reason: planContext?.reason || null,
    },
    capabilityAvailability: availability,
    wallet: wallets[0] || null,
    usage: {
      totals,
      recent: ledgerRows || [],
    },
    providerCredit,
    company: companyContext,
  });
};

// Non-admin endpoint: lets any org member see which model each capability will
// use in the compose box, and the selectable models — read from the ORG's
// available model list (active catalog) + the org's per-capability selection.
const handleGetComposeModels = async (supabaseUrl: string, serviceRoleKey: string, authContext: any) => {
  const [settings, rawModels] = await Promise.all([
    loadOrgAiSettings(supabaseUrl, serviceRoleKey, authContext),
    safeRestSelect(supabaseUrl, serviceRoleKey, 'ai_model_catalog', {
      is_active: 'eq.true',
      select: 'id,display_name_fa,capability_tags,is_coming_soon',
      order: 'id.asc',
      limit: 200,
    }),
  ]);
  const planContext = await loadTenantAiPlanContext(supabaseUrl, serviceRoleKey, authContext);
  const availability = buildAiCapabilityAvailability(planContext, settings, rawModels);
  const models = (rawModels || []).filter((m: any) => m?.is_coming_soon !== true);
  const labelOf = (id: string) => {
    const row = models.find((m: any) => String(m?.id || '') === id);
    return String(row?.display_name_fa || id || '').trim() || id;
  };
  const capabilities: Record<string, any> = {};
  Object.keys(AI_CAPABILITY_FEATURE_KEYS).forEach((capability) => {
    if (capability === 'embedding') return;
    const selectable = models
      .filter((m: any) => {
        const tags = Array.isArray(m?.capability_tags) ? m.capability_tags : [];
        return tags.includes(capability);
      })
      .map((m: any) => ({ value: String(m?.id || ''), label: labelOf(String(m?.id || '')) }))
      .filter((opt: any) => opt.value);
    const resolved = pickCapabilityModelFromCatalog(settings, capability, models);
    capabilities[capability] = {
      model: resolved,
      modelLabel: resolved ? labelOf(resolved) : 'مدل فعال ندارد',
      selectable,
      available: availability?.[capability] ? availability[capability].planAvailable !== false
        && availability[capability].tenantReady !== false
        && availability[capability].hasReadyModel !== false : true,
    };
  });
  return json(200, { success: true, capabilities });
};

const handleGetThread = async (supabaseUrl: string, serviceRoleKey: string, authContext: any, body: any) => {
  const requestedThreadId = normalizeId(body?.threadId);
  if (requestedThreadId && isUuid(requestedThreadId)) {
    const thread = await fetchThreadForRead(supabaseUrl, serviceRoleKey, authContext, requestedThreadId);
    const messages = thread ? await fetchThreadMessages(supabaseUrl, serviceRoleKey, authContext, thread.id, 200) : [];
    return json(200, {
      success: true,
      thread,
      threadId: thread?.id || null,
      messages,
    });
  }
  const context = normalizeContext(body?.context || {});
  const contextKey = buildContextKey(context);
  const thread = await findThreadByContextKey(supabaseUrl, serviceRoleKey, authContext, contextKey);
  const messages = thread ? await fetchThreadMessages(supabaseUrl, serviceRoleKey, authContext, thread.id, 200) : [];
  return json(200, {
    success: true,
    thread: thread ? {
      id: thread.id,
      title: thread.title,
      contextKey: thread.context_key,
      moduleId: thread.module_id,
      recordId: thread.record_id,
      provider: thread.provider,
      model: thread.model,
      updatedAt: thread.updated_at,
    } : null,
    threadId: thread?.id || null,
    messages,
  });
};

const isHiddenAssistantThread = (thread: any) => {
  const metadata = thread?.metadata && typeof thread.metadata === 'object' ? thread.metadata : {};
  const contextKey = String(thread?.context_key || metadata?.context_key || '').trim();
  const lastActivityKind = String(metadata?.last_activity_kind || '').trim();
  const replyChannel = String(metadata?.reply_channel || '').trim();
  const source = String(metadata?.source || metadata?.context?.source || '').trim();
  const capability = String(metadata?.capability || '').trim();
  return contextKey.startsWith('reply:sms:')
    || contextKey.startsWith('reply:bot:')
    || lastActivityKind === 'reply_suggestion'
    || replyChannel === 'sms'
    || replyChannel === 'bot'
    || source === 'reply_suggestion'
    || source === 'notifications_chat_reply_suggest'
    || capability === 'customer_reply_suggestion'
    || metadata?.customer_reply_suggestion === true;
};

const handleListThreads = async (supabaseUrl: string, serviceRoleKey: string, authContext: any, body: any) => {
  const search = String(body?.search || '').trim();
  const baseSelect = 'id,org_id,title,context_type,context_key,module_id,record_id,provider,model,metadata,created_at,updated_at,pinned_at,is_shared,shared_user_ids,shared_role_ids,user_id';
  const limit = Math.max(10, Math.min(100, Number(body?.limit || 50)));
  const ownParams: Record<string, any> = {
    org_id: `eq.${authContext.orgId}`,
    user_id: `eq.${authContext.userId}`,
    status: 'eq.active',
    select: baseSelect,
    order: 'updated_at.desc',
    limit,
  };
  if (search) ownParams.title = `ilike.*${search}*`;
  const sharedUserParams: Record<string, any> = {
    org_id: `eq.${authContext.orgId}`,
    status: 'eq.active',
    shared_user_ids: `cs.{${authContext.userId}}`,
    select: baseSelect,
    order: 'updated_at.desc',
    limit,
  };
  const sharedRoleParams: Record<string, any> = authContext.roleId ? {
    org_id: `eq.${authContext.orgId}`,
    status: 'eq.active',
    shared_role_ids: `cs.{${authContext.roleId}}`,
    select: baseSelect,
    order: 'updated_at.desc',
    limit,
  } : {};
  if (search) {
    sharedUserParams.title = `ilike.*${search}*`;
    if (authContext.roleId) sharedRoleParams.title = `ilike.*${search}*`;
  }
  const [ownRows, sharedUserRows, sharedRoleRows] = await Promise.all([
    safeRestSelect(supabaseUrl, serviceRoleKey, 'ai_threads', ownParams),
    safeRestSelect(supabaseUrl, serviceRoleKey, 'ai_threads', sharedUserParams),
    authContext.roleId ? safeRestSelect(supabaseUrl, serviceRoleKey, 'ai_threads', sharedRoleParams) : Promise.resolve([]),
  ]);
  const rows = Array.from(new Map([...ownRows, ...sharedUserRows, ...sharedRoleRows]
    .filter((row: any) => canAccessThreadRow(row, authContext))
    .filter((row: any) => !isHiddenAssistantThread(row))
    .map((row: any) => [String(row.id), {
      ...row,
      is_owner: normalizeId(row.user_id) === normalizeId(authContext.userId),
    }])).values())
    .sort((a: any, b: any) => String(b.updated_at || '').localeCompare(String(a.updated_at || '')))
    .slice(0, limit);
  return json(200, { success: true, threads: rows });
};

const handleRenameThread = async (supabaseUrl: string, serviceRoleKey: string, authContext: any, body: any) => {
  const threadId = normalizeId(body?.threadId);
  const title = String(body?.title || '').trim().slice(0, 120);
  if (!isUuid(threadId)) return json(400, { success: false, message: 'شناسه گفتگو معتبر نیست.' });
  if (!title) return json(400, { success: false, message: 'عنوان گفتگو خالی است.' });
  const rows = await restPatch(supabaseUrl, serviceRoleKey, 'ai_threads', {
    id: `eq.${threadId}`,
    org_id: `eq.${authContext.orgId}`,
    user_id: `eq.${authContext.userId}`,
  }, {
    title,
    updated_at: new Date().toISOString(),
  });
  return json(200, { success: true, thread: rows[0] || null });
};

const handleArchiveThread = async (supabaseUrl: string, serviceRoleKey: string, authContext: any, body: any) => {
  const threadId = normalizeId(body?.threadId);
  if (!isUuid(threadId)) return json(400, { success: false, message: 'شناسه گفتگو معتبر نیست.' });
  const rows = await restPatch(supabaseUrl, serviceRoleKey, 'ai_threads', {
    id: `eq.${threadId}`,
    org_id: `eq.${authContext.orgId}`,
    user_id: `eq.${authContext.userId}`,
  }, {
    status: 'archived',
    archived_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
  return json(200, { success: true, archived: rows.length > 0 });
};

const normalizeUuidArray = (value: any) =>
  Array.from(new Set((Array.isArray(value) ? value : [])
    .map((item) => normalizeId(item))
    .filter(isUuid)));

const handleShareThread = async (supabaseUrl: string, serviceRoleKey: string, authContext: any, body: any) => {
  const threadId = normalizeId(body?.threadId);
  if (!isUuid(threadId)) return json(400, { success: false, message: 'شناسه گفتگو معتبر نیست.' });
  const rows = await restSelect(supabaseUrl, serviceRoleKey, 'ai_threads', {
    id: `eq.${threadId}`,
    org_id: `eq.${authContext.orgId}`,
    user_id: `eq.${authContext.userId}`,
    status: 'eq.active',
    select: '*',
    limit: 1,
  });
  const thread = rows[0] || null;
  if (!thread) return json(404, { success: false, message: 'گفتگو برای اشتراک‌گذاری پیدا نشد یا مالک آن نیستید.' });

  const requestedUserIds = normalizeUuidArray(body?.sharedUserIds || body?.shared_user_ids);
  const requestedRoleIds = normalizeUuidArray(body?.sharedRoleIds || body?.shared_role_ids);

  const [validUsers, validRoles] = await Promise.all([
    requestedUserIds.length
      ? safeRestSelect(supabaseUrl, serviceRoleKey, 'profiles', {
          org_id: `eq.${authContext.orgId}`,
          id: `in.(${requestedUserIds.join(',')})`,
          select: 'id',
          limit: 500,
        })
      : Promise.resolve([]),
    requestedRoleIds.length
      ? safeRestSelect(supabaseUrl, serviceRoleKey, 'org_roles', {
          org_id: `eq.${authContext.orgId}`,
          id: `in.(${requestedRoleIds.join(',')})`,
          select: 'id',
          limit: 300,
        })
      : Promise.resolve([]),
  ]);
  const sharedUserIds = validUsers.map((row: any) => normalizeId(row?.id)).filter(isUuid);
  const sharedRoleIds = validRoles.map((row: any) => normalizeId(row?.id)).filter(isUuid);
  const patched = await restPatch(supabaseUrl, serviceRoleKey, 'ai_threads', {
    id: `eq.${threadId}`,
    org_id: `eq.${authContext.orgId}`,
    user_id: `eq.${authContext.userId}`,
  }, {
    shared_user_ids: sharedUserIds,
    shared_role_ids: sharedRoleIds,
    is_shared: sharedUserIds.length > 0 || sharedRoleIds.length > 0,
    updated_at: new Date().toISOString(),
    metadata: {
      ...(thread?.metadata || {}),
      shared_at: new Date().toISOString(),
      shared_by: authContext.userId,
    },
  });
  return json(200, { success: true, thread: patched[0] || null });
};

const handleDeleteThread = async (supabaseUrl: string, serviceRoleKey: string, authContext: any, body: any) => {
  const threadId = normalizeId(body?.threadId);
  if (!isUuid(threadId)) return json(400, { success: false, message: 'شناسه چت معتبر نیست.' });
  const rows = await restPatch(supabaseUrl, serviceRoleKey, 'ai_threads', {
    id: `eq.${threadId}`,
    org_id: `eq.${authContext.orgId}`,
    user_id: `eq.${authContext.userId}`,
  }, {
    status: 'archived',
    updated_at: new Date().toISOString(),
  });
  return json(200, { success: true, archived: rows.length > 0 });
};

const prepareChatRequest = async (supabaseUrl: string, serviceRoleKey: string, authContext: any, body: any) => {
  const message = String(body?.message || '').trim();
  if (!message) {
    const error: any = new Error('متن سوال خالی است.');
    error.status = 400;
    throw error;
  }

  const rawContext = normalizeContext(body?.context || {});
  const requestedCapability = String(body?.capability || '').trim();
  const selectedCapabilities = Array.isArray(body?.capabilities)
    ? body.capabilities.map((item: any) => String(item || '').trim()).filter(Boolean)
    : [];
  const selectedCapabilitySet = new Set(selectedCapabilities);
  const capability = requestedCapability
    || (selectedCapabilitySet.has('legal_assistant') ? 'legal_assistant' : '')
    || (selectedCapabilitySet.has('deep_reasoning') ? 'deep_reasoning' : '')
    || (rawContext.mode === 'record' ? 'record_chat' : 'dashboard_chat');
  const contextKey = buildContextKey(rawContext);
  const providerConfig = await resolveProviderConfig(supabaseUrl, serviceRoleKey, authContext, capability, { modelOverride: body?.modelOverride });
  const planContext = await assertAiCapabilityEnabled(supabaseUrl, serviceRoleKey, authContext, providerConfig.orgAiSettings, capability);
  for (const selectedCapability of selectedCapabilities) {
    if (AI_CAPABILITY_FEATURE_KEYS[selectedCapability]) {
      await assertAiCapabilityEnabled(supabaseUrl, serviceRoleKey, authContext, providerConfig.orgAiSettings, selectedCapability);
    }
  }
  const pageContext = await buildPermittedPageContext(supabaseUrl, serviceRoleKey, authContext, rawContext);
  const canUseKnowledge = isAiCapabilityPlanAvailable(planContext, 'document_analysis');
  const [knowledgeChunks, companyContext, orgPeopleContext] = await Promise.all([
    canUseKnowledge ? fetchKnowledgeChunks(supabaseUrl, serviceRoleKey, authContext, message, { moduleId: pageContext.moduleId }) : Promise.resolve([]),
    loadCompanyContext(supabaseUrl, serviceRoleKey, authContext),
    loadOrgPeopleContext(supabaseUrl, serviceRoleKey, authContext, message),
  ]);
  const [retrievedContexts, businessAnalytics] = await Promise.all([
    fetchRelevantModuleContexts(supabaseUrl, serviceRoleKey, authContext, message, pageContext),
    fetchFinancialAnalyticsContext(supabaseUrl, serviceRoleKey, authContext, message),
  ]);

  const orgAiSettings = providerConfig.orgAiSettings;
  const webSearchEnabled = orgAiSettings?.feature_flags?.web_search === true
    && isAiCapabilityPlanAvailable(planContext, 'web_search');
  const forceWebSearch = selectedCapabilitySet.has('web_search') || selectedCapabilitySet.has('legal_assistant');
  const shouldSearchWeb = webSearchEnabled && (forceWebSearch || shouldTriggerWebSearch(message));
  const webSearchModel = shouldSearchWeb
    ? await resolveOrgCapabilityModel(supabaseUrl, serviceRoleKey, orgAiSettings, 'web_search')
    : '';
  const webSearchResults = shouldSearchWeb
    ? await callWebSearch(providerConfig, message, webSearchModel, 5, forceWebSearch).then((r) => r.results)
    : [];

  const thread = await ensureThread(supabaseUrl, serviceRoleKey, authContext, {
    threadId: body?.threadId || null,
    title: message.slice(0, 90),
    pageContext,
    contextKey,
    provider: providerConfig.provider,
    model: providerConfig.model,
    forceNew: body?.forceNewThread === true,
  });
  const previousMessages = await fetchThreadMessages(supabaseUrl, serviceRoleKey, authContext, thread.id, 30);

  const userMessage = await insertAiMessage(supabaseUrl, serviceRoleKey, authContext, {
    thread_id: thread.id,
    role: 'user',
    content: message,
    provider: providerConfig.provider,
    model: providerConfig.model,
    metadata: {
      context: pageContext.context,
      context_key: contextKey,
      context_summary: pageContext.summary,
      input_kind: String(body?.inputKind || body?.input_kind || 'text').trim() || 'text',
      capabilities: selectedCapabilities,
      file: body?.file ? {
        filename: body.file?.filename || body.file?.fileName || body.file?.name || null,
        mime_type: body.file?.mimeType || body.file?.mime_type || null,
        size: body.file?.size || null,
        url: body.file?.url || body.file?.file_url || null,
        bucket: body.file?.bucket || null,
        path: body.file?.path || null,
        asset_id: body.file?.assetId || body.file?.asset_id || null,
        entry_id: body.file?.entryId || body.file?.entry_id || null,
      } : null,
    },
  });

  const promptMessages = buildPromptMessages(
    message,
    pageContext,
    knowledgeChunks,
    companyContext,
    orgPeopleContext,
    authContext,
    retrievedContexts,
    previousMessages,
    webSearchResults,
    {
      legalMode: selectedCapabilitySet.has('legal_assistant'),
      deepReasoning: selectedCapabilitySet.has('deep_reasoning') || capability === 'deep_reasoning',
      selectedCapabilities,
      businessAnalytics,
    },
  );

  return {
    message,
    body,
    selectedCapabilities,
    selectedCapabilitySet,
    capability,
    contextKey,
    providerConfig,
    pageContext,
    knowledgeChunks,
    companyContext,
    retrievedContexts,
    businessAnalytics,
    webSearchResults,
    forceWebSearch,
    thread,
    userMessage,
    promptMessages,
  };
};

const buildThreadModelOverrides = (thread: any, capability: string, model: string, modelOverride?: string | null) => {
  const existing = thread?.metadata?.model_overrides && typeof thread.metadata.model_overrides === 'object'
    ? thread.metadata.model_overrides
    : {};
  const requested = String(modelOverride || '').trim();
  if (!requested) return existing;
  return {
    ...existing,
    [capability || 'dashboard_chat']: String(model || requested).trim() || requested,
  };
};

const buildThreadComposerPreferences = (body: any, thread: any = null) => {
  const existing = thread?.metadata?.composer_preferences && typeof thread.metadata.composer_preferences === 'object'
    ? thread.metadata.composer_preferences
    : {};
  const incoming = body?.composerPreferences && typeof body.composerPreferences === 'object'
    ? body.composerPreferences
    : {};
  const selectedCapabilities = Array.isArray(incoming.selectedCapabilities)
    ? Array.from(new Set(incoming.selectedCapabilities.map((item: any) => String(item || '').trim()).filter(Boolean))).slice(0, 12)
    : Array.isArray(body?.capabilities)
    ? Array.from(new Set(body.capabilities.map((item: any) => String(item || '').trim()).filter(Boolean))).slice(0, 12)
    : existing.selectedCapabilities || [];
  const mediaSettings = incoming.mediaSettings && typeof incoming.mediaSettings === 'object'
    ? incoming.mediaSettings
    : body?.settings && typeof body.settings === 'object'
    ? body.settings
    : existing.mediaSettings || {};
  const modelOverrides = incoming.modelOverrides && typeof incoming.modelOverrides === 'object'
    ? incoming.modelOverrides
    : existing.modelOverrides || {};
  const hasIncomingRecordCreationTarget = Object.prototype.hasOwnProperty.call(incoming, 'recordCreationTargetModuleId');
  const recordCreationTargetModuleId = hasIncomingRecordCreationTarget
    ? String(incoming.recordCreationTargetModuleId || '').trim() || null
    : String(body?.recordCreation?.moduleId || existing.recordCreationTargetModuleId || '').trim() || null;
  const hasIncomingCurrentModelOverride = Object.prototype.hasOwnProperty.call(incoming, 'currentModelOverride');
  const currentModelOverride = hasIncomingCurrentModelOverride
    ? String(incoming.currentModelOverride || '').trim() || null
    : String(body?.modelOverride || existing.currentModelOverride || '').trim() || null;
  return {
    selectedCapabilities,
    mediaSettings,
    recordCreationTargetModuleId,
    processOperationMode: Object.prototype.hasOwnProperty.call(incoming, 'processOperationMode')
      ? incoming.processOperationMode === true
      : existing.processOperationMode === true,
    modelOverrides,
    currentModelOverride,
    updated_at: new Date().toISOString(),
  };
};

const patchChatThreadAfterAssistant = async (
  supabaseUrl: string,
  serviceRoleKey: string,
  authContext: any,
  prepared: any,
  aiResult: any,
  options: { failed?: boolean; failedContent?: string } = {},
) => {
  const inputKind = String(prepared.body?.inputKind || prepared.body?.input_kind || 'text').trim() || 'text';
  const failed = options.failed === true;
  await restPatch(supabaseUrl, serviceRoleKey, 'ai_threads', { id: `eq.${prepared.thread.id}`, org_id: `eq.${authContext.orgId}` }, {
    updated_at: new Date().toISOString(),
    provider: aiResult?.provider || prepared.providerConfig.provider,
    model: aiResult?.model || prepared.providerConfig.model,
    context_type: getContextKind(prepared.pageContext.context || {}),
    module_id: prepared.pageContext.moduleId || null,
    record_id: prepared.pageContext.recordId || null,
    metadata: {
      ...(prepared.thread?.metadata || {}),
      route: prepared.pageContext.context?.route || null,
      summary: prepared.pageContext.summary || null,
      context_kind: getContextKind(prepared.pageContext.context || {}),
      context_label: buildThreadContextLabel(prepared.pageContext),
      context: prepared.pageContext.context || null,
      module_id: prepared.pageContext.moduleId || null,
      record_id: prepared.pageContext.recordId || null,
      intent: prepared.pageContext.intent || prepared.pageContext.context?.intent || null,
      selected_process_id: prepared.pageContext.selectedProcessId || prepared.pageContext.context?.selectedProcessId || prepared.pageContext.context?.selectedProcessGroupId || null,
      model_overrides: buildThreadModelOverrides(prepared.thread, prepared.capability, aiResult?.model || prepared.providerConfig.model, prepared.body?.modelOverride),
      composer_preferences: buildThreadComposerPreferences(prepared.body, prepared.thread),
      last_activity_kind: failed ? `${inputKind}_failed` : inputKind,
      last_message_preview: failed ? String(options.failedContent || '').slice(0, 300) : prepared.message.slice(0, 300),
    },
  });
};

const handleChat = async (supabaseUrl: string, serviceRoleKey: string, authContext: any, body: any) => {
  const prepared = await prepareChatRequest(supabaseUrl, serviceRoleKey, authContext, body);
  const {
    message,
    selectedCapabilities,
    capability,
    contextKey,
    providerConfig,
    pageContext,
    knowledgeChunks,
    companyContext,
    retrievedContexts,
    businessAnalytics,
    webSearchResults,
    forceWebSearch,
    thread,
    userMessage,
    promptMessages,
  } = prepared;
  let aiResult: any;
  try {
    aiResult = await callChatCompletions(providerConfig, promptMessages, {
      safetyIdentifier: `org_${authContext.orgId}_user_${authContext.userId}_cap_${capability}`,
    });
  } catch (error: any) {
    const providerFailure = shortenProviderError(String(error?.message || error || 'chat_failed'));
    const failedContent = providerFailure.startsWith('خطای provider')
      ? providerFailure
      : `پاسخ هوش مصنوعی ناموفق بود: ${providerFailure}`;
    const assistantMessage = await insertAiMessage(supabaseUrl, serviceRoleKey, authContext, {
      thread_id: thread.id,
      role: 'assistant',
      content: failedContent,
      provider: providerConfig.provider,
      model: providerConfig.model,
      metadata: {
        context_summary: pageContext.summary,
        context_key: contextKey,
        company_currency_label: companyContext?.currency_label || null,
        knowledge_chunk_ids: knowledgeChunks.map((chunk) => chunk.id),
        retrieved_context_modules: retrievedContexts.map((ctx) => ctx.moduleId),
        web_search_used: webSearchResults.length > 0,
        capabilities: selectedCapabilities,
        capability,
        business_analytics: businessAnalytics ? {
          intent: businessAnalytics.intent || null,
          period: businessAnalytics.period || null,
          available: businessAnalytics.available === true,
          data_quality: businessAnalytics.data_quality || null,
          reason: businessAnalytics.reason || null,
        } : null,
        failed: true,
        status: 'failed',
        error: providerFailure,
        incomplete: error?.incomplete === true,
        finish_reason: error?.finishReason || null,
        partial_content: error?.partialContent ? String(error.partialContent).slice(0, 4000) : null,
      },
    });
    await patchChatThreadAfterAssistant(supabaseUrl, serviceRoleKey, authContext, prepared, providerConfig, {
      failed: true,
      failedContent,
    }).catch(() => []);
    return json(200, {
      success: false,
      thread,
      threadId: thread.id,
      userMessageId: userMessage?.id || null,
      messageId: assistantMessage?.id || null,
      message: failedContent,
      provider: providerConfig.provider,
      model: providerConfig.model,
      messages: [userMessage, assistantMessage].filter(Boolean),
      contextSummary: pageContext.summary,
      retrievedContextModules: retrievedContexts.map((ctx) => ctx.moduleId),
      businessAnalytics,
      knowledgeSources: knowledgeChunks.map((chunk) => ({
        id: chunk.id,
        documentId: chunk.document_id,
        title: chunk?.metadata?.document_title || null,
        chunkIndex: chunk.chunk_index,
      })),
    });
  }
  const assistantMessage = await insertAiMessage(supabaseUrl, serviceRoleKey, authContext, {
    thread_id: thread.id,
    role: 'assistant',
    content: aiResult.content,
    provider: aiResult.provider,
    model: aiResult.model,
    metadata: {
      context_summary: pageContext.summary,
      context_key: contextKey,
      company_currency_label: companyContext?.currency_label || null,
      knowledge_chunk_ids: knowledgeChunks.map((chunk) => chunk.id),
      retrieved_context_modules: retrievedContexts.map((ctx) => ctx.moduleId),
      web_search_used: webSearchResults.length > 0,
      capabilities: selectedCapabilities,
      attachments: Array.isArray(aiResult.attachments) ? aiResult.attachments : [],
      usage: aiResult.usageMetadata,
      avalai_request_id: aiResult.requestId || null,
      capability,
      business_analytics: businessAnalytics ? {
        intent: businessAnalytics.intent || null,
        period: businessAnalytics.period || null,
        available: businessAnalytics.available === true,
        data_quality: businessAnalytics.data_quality || null,
        reason: businessAnalytics.reason || null,
      } : null,
    },
  });

  const ledger = await recordAiUsageLedger(supabaseUrl, serviceRoleKey, authContext, {
    threadId: thread.id,
    messageId: assistantMessage?.id || null,
    requestId: aiResult.requestId,
    capability,
    provider: aiResult.provider,
    model: aiResult.model,
    usageMetadata: aiResult.usageMetadata,
    metadata: {
      source: 'chat',
      context_key: contextKey,
      knowledge_chunk_ids: knowledgeChunks.map((chunk) => chunk.id),
      capabilities: selectedCapabilities,
      web_search_forced: forceWebSearch,
    },
  });
  await patchAiMessageCustomerBilling(supabaseUrl, serviceRoleKey, authContext, assistantMessage, aiResult.usageMetadata, ledger);

  await patchChatThreadAfterAssistant(supabaseUrl, serviceRoleKey, authContext, prepared, aiResult);

  return json(200, {
    success: true,
    threadId: thread.id,
    userMessageId: userMessage?.id || null,
    messageId: assistantMessage?.id || null,
    answer: aiResult.content,
    attachments: Array.isArray(aiResult.attachments) ? aiResult.attachments : [],
    provider: aiResult.provider,
    model: aiResult.model,
    usage: withCustomerBilling(aiResult.usageMetadata, ledger),
    ledger,
    contextSummary: pageContext.summary,
    retrievedContextModules: retrievedContexts.map((ctx) => ctx.moduleId),
    businessAnalytics,
    knowledgeSources: knowledgeChunks.map((chunk) => ({
      id: chunk.id,
      documentId: chunk.document_id,
      title: chunk?.metadata?.document_title || null,
      chunkIndex: chunk.chunk_index,
    })),
  });
};

const ssePayload = (event: string, payload: Record<string, any>) =>
  `event: ${event}\ndata: ${JSON.stringify({ build: FUNCTION_BUILD, ...payload })}\n\n`;

const handleChatStream = (supabaseUrl: string, serviceRoleKey: string, authContext: any, body: any) => {
  const encoder = new TextEncoder();
  return new Response(new ReadableStream({
    start(controller) {
      const send = (event: string, payload: Record<string, any>) => {
        controller.enqueue(encoder.encode(ssePayload(event, payload)));
      };
      (async () => {
        let prepared: any = null;
        try {
          prepared = await prepareChatRequest(supabaseUrl, serviceRoleKey, authContext, body);
          send('meta', {
            success: true,
            threadId: prepared.thread.id,
            userMessageId: prepared.userMessage?.id || null,
            provider: prepared.providerConfig.provider,
            model: prepared.providerConfig.model,
          });

          const aiResult = await callChatCompletionsStream(prepared.providerConfig, prepared.promptMessages, {
            safetyIdentifier: `org_${authContext.orgId}_user_${authContext.userId}_cap_${prepared.capability}`,
            onDelta: (text) => {
              if (text) send('delta', { text });
            },
          });

          const assistantMessage = await insertAiMessage(supabaseUrl, serviceRoleKey, authContext, {
            thread_id: prepared.thread.id,
            role: 'assistant',
            content: aiResult.content,
            provider: aiResult.provider,
            model: aiResult.model,
            metadata: {
              context_summary: prepared.pageContext.summary,
              context_key: prepared.contextKey,
              company_currency_label: prepared.companyContext?.currency_label || null,
              knowledge_chunk_ids: prepared.knowledgeChunks.map((chunk: any) => chunk.id),
              retrieved_context_modules: prepared.retrievedContexts.map((ctx: any) => ctx.moduleId),
              web_search_used: prepared.webSearchResults.length > 0,
              capabilities: prepared.selectedCapabilities,
              attachments: Array.isArray(aiResult.attachments) ? aiResult.attachments : [],
              usage: aiResult.usageMetadata,
              avalai_request_id: aiResult.requestId || null,
              capability: prepared.capability,
              finish_reason: aiResult.finishReason || null,
              business_analytics: prepared.businessAnalytics ? {
                intent: prepared.businessAnalytics.intent || null,
                period: prepared.businessAnalytics.period || null,
                available: prepared.businessAnalytics.available === true,
                data_quality: prepared.businessAnalytics.data_quality || null,
                reason: prepared.businessAnalytics.reason || null,
              } : null,
            },
          });

          const ledger = await recordAiUsageLedger(supabaseUrl, serviceRoleKey, authContext, {
            threadId: prepared.thread.id,
            messageId: assistantMessage?.id || null,
            requestId: aiResult.requestId,
            capability: prepared.capability,
            provider: aiResult.provider,
            model: aiResult.model,
            usageMetadata: aiResult.usageMetadata,
            metadata: {
              source: 'chat_stream',
              context_key: prepared.contextKey,
              knowledge_chunk_ids: prepared.knowledgeChunks.map((chunk: any) => chunk.id),
              capabilities: prepared.selectedCapabilities,
              web_search_forced: prepared.forceWebSearch,
            },
          });
          await patchAiMessageCustomerBilling(supabaseUrl, serviceRoleKey, authContext, assistantMessage, aiResult.usageMetadata, ledger);
          await patchChatThreadAfterAssistant(supabaseUrl, serviceRoleKey, authContext, prepared, aiResult);

          send('done', {
            success: true,
            threadId: prepared.thread.id,
            userMessageId: prepared.userMessage?.id || null,
            messageId: assistantMessage?.id || null,
            answer: aiResult.content,
            attachments: Array.isArray(aiResult.attachments) ? aiResult.attachments : [],
            provider: aiResult.provider,
            model: aiResult.model,
            usage: withCustomerBilling(aiResult.usageMetadata, ledger),
            ledger,
            contextSummary: prepared.pageContext.summary,
            retrievedContextModules: prepared.retrievedContexts.map((ctx: any) => ctx.moduleId),
            businessAnalytics: prepared.businessAnalytics,
            knowledgeSources: prepared.knowledgeChunks.map((chunk: any) => ({
              id: chunk.id,
              documentId: chunk.document_id,
              title: chunk?.metadata?.document_title || null,
              chunkIndex: chunk.chunk_index,
            })),
          });
        } catch (error: any) {
          const providerFailure = shortenProviderError(String(error?.message || error || 'chat_failed'));
          const failedContent = providerFailure.startsWith('خطای provider')
            ? providerFailure
            : `پاسخ هوش مصنوعی ناموفق بود: ${providerFailure}`;
          let assistantMessage: any = null;
          if (prepared?.thread?.id) {
            assistantMessage = await insertAiMessage(supabaseUrl, serviceRoleKey, authContext, {
              thread_id: prepared.thread.id,
              role: 'assistant',
              content: failedContent,
              provider: prepared.providerConfig.provider,
              model: prepared.providerConfig.model,
              metadata: {
                context_summary: prepared.pageContext.summary,
                context_key: prepared.contextKey,
                company_currency_label: prepared.companyContext?.currency_label || null,
                knowledge_chunk_ids: prepared.knowledgeChunks.map((chunk: any) => chunk.id),
                retrieved_context_modules: prepared.retrievedContexts.map((ctx: any) => ctx.moduleId),
                web_search_used: prepared.webSearchResults.length > 0,
                capabilities: prepared.selectedCapabilities,
                capability: prepared.capability,
                failed: true,
                status: 'failed',
                error: providerFailure,
                incomplete: error?.incomplete === true,
                finish_reason: error?.finishReason || null,
                partial_content: error?.partialContent ? String(error.partialContent).slice(0, 4000) : null,
              },
            }).catch(() => null);
            await patchChatThreadAfterAssistant(supabaseUrl, serviceRoleKey, authContext, prepared, prepared.providerConfig, {
              failed: true,
              failedContent,
            }).catch(() => []);
          }
          send('error', {
            success: false,
            threadId: prepared?.thread?.id || null,
            userMessageId: prepared?.userMessage?.id || null,
            messageId: assistantMessage?.id || null,
            message: failedContent,
            incomplete: error?.incomplete === true,
            finishReason: error?.finishReason || null,
          });
        } finally {
          controller.close();
        }
      })();
    },
  }), {
    status: 200,
    headers: {
      ...corsHeaders,
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Kalam-Function-Build': FUNCTION_BUILD,
    },
  });
};

const handleChatWithFile = async (supabaseUrl: string, serviceRoleKey: string, authContext: any, body: any) => {
  const file = body?.file || body?.attachment || {};
  const prompt = String(body?.message || body?.prompt || 'این فایل را تحلیل کن.').trim() || 'این فایل را تحلیل کن.';
  const extractedText = String(file?.text || file?.extractedText || body?.extractedText || body?.extracted_text || '').trim();
  const filename = String(file?.filename || file?.fileName || file?.name || 'فایل پیوست').trim() || 'فایل پیوست';
  const mimeType = String(file?.mimeType || file?.mime_type || file?.type || '').trim() || null;
  const selectedCapabilities = Array.isArray(body?.capabilities)
    ? body.capabilities.map((item: any) => String(item || '').trim()).filter(Boolean)
    : [];
  const selectedCapabilitySet = new Set(selectedCapabilities);

  if (extractedText) {
    const textMessage = [
      prompt,
      '',
      `نام فایل: ${filename}`,
      mimeType ? `نوع فایل: ${mimeType}` : '',
      '',
      'محتوای فایل:',
      extractedText,
    ].filter(Boolean).join('\n');
    return await handleChat(supabaseUrl, serviceRoleKey, authContext, {
      ...body,
      action: 'chat',
      capability: selectedCapabilitySet.has('legal_assistant')
        ? 'legal_assistant'
        : selectedCapabilitySet.has('deep_reasoning')
        ? 'deep_reasoning'
        : 'document_analysis',
      message: textMessage,
      inputKind: 'file',
    });
  }

  const fileParts = buildOpenAiInputContentParts(prompt, file).slice(1);
  if (!fileParts.length) {
    return json(400, { success: false, message: 'فایل یا محتوای قابل تحلیل ارسال نشده است.' });
  }

  const rawContext = normalizeContext(body?.context || {});
  const capability = 'document_analysis';
  const contextKey = buildContextKey(rawContext);
  const providerConfig = await resolveProviderConfig(supabaseUrl, serviceRoleKey, authContext, capability, { modelOverride: body?.modelOverride });
  const planContext = await assertAiCapabilityEnabled(supabaseUrl, serviceRoleKey, authContext, providerConfig.orgAiSettings, capability);
  const pageContext = await buildPermittedPageContext(supabaseUrl, serviceRoleKey, authContext, rawContext);
  const canUseKnowledge = isAiCapabilityPlanAvailable(planContext, 'document_analysis');
  const [knowledgeChunks, companyContext, orgPeopleContext] = await Promise.all([
    canUseKnowledge ? fetchKnowledgeChunks(supabaseUrl, serviceRoleKey, authContext, prompt, { moduleId: pageContext.moduleId }) : Promise.resolve([]),
    loadCompanyContext(supabaseUrl, serviceRoleKey, authContext),
    loadOrgPeopleContext(supabaseUrl, serviceRoleKey, authContext, prompt),
  ]);
  const retrievedContexts = await fetchRelevantModuleContexts(supabaseUrl, serviceRoleKey, authContext, prompt, pageContext);

  const thread = await ensureThread(supabaseUrl, serviceRoleKey, authContext, {
    threadId: body?.threadId || null,
    title: `${filename} - ${prompt}`.slice(0, 90),
    pageContext,
    contextKey,
    provider: providerConfig.provider,
    model: providerConfig.model,
    forceNew: body?.forceNewThread === true,
  });
  const previousMessages = await fetchThreadMessages(supabaseUrl, serviceRoleKey, authContext, thread.id, 30);

  const userContentForDb = [
    prompt,
    '',
    `فایل پیوست: ${filename}`,
    mimeType ? `نوع فایل: ${mimeType}` : '',
  ].filter(Boolean).join('\n');
  const userMessage = await insertAiMessage(supabaseUrl, serviceRoleKey, authContext, {
    thread_id: thread.id,
    role: 'user',
    content: userContentForDb,
    provider: providerConfig.provider,
    model: providerConfig.model,
    metadata: {
      context: pageContext.context,
      context_key: contextKey,
      context_summary: pageContext.summary,
      input_kind: 'file',
      file: {
        filename,
        mime_type: mimeType,
        size: numberFrom(file?.size || file?.fileSize || 0, 0) || null,
        url: file?.url || file?.file_url || null,
        bucket: file?.bucket || null,
        path: file?.path || null,
        asset_id: file?.assetId || file?.asset_id || null,
        entry_id: file?.entryId || file?.entry_id || null,
      },
    },
  });

  const promptMessages = buildPromptMessages(
    prompt,
    pageContext,
    knowledgeChunks,
    companyContext,
    orgPeopleContext,
    authContext,
    retrievedContexts,
    previousMessages,
    [],
    {
      legalMode: selectedCapabilitySet.has('legal_assistant'),
      deepReasoning: selectedCapabilitySet.has('deep_reasoning'),
      selectedCapabilities,
    },
  );
  const lastUserIndex = promptMessages.map((item) => item.role).lastIndexOf('user');
  if (lastUserIndex >= 0) {
    promptMessages[lastUserIndex] = {
      role: 'user',
      content: buildOpenAiInputContentParts(String(promptMessages[lastUserIndex].content || ''), file),
    };
  }

  let aiResult: any;
  try {
    aiResult = await callChatCompletions(providerConfig, promptMessages, {
      safetyIdentifier: `org_${authContext.orgId}_user_${authContext.userId}_cap_${capability}`,
    });
  } catch (error: any) {
    const providerFailure = shortenProviderError(String(error?.message || error || 'file_chat_failed'));
    const failedContent = providerFailure.startsWith('خطای provider')
      ? providerFailure
      : `تحلیل فایل با هوش مصنوعی ناموفق بود: ${providerFailure}`;
    const assistantMessage = await insertAiMessage(supabaseUrl, serviceRoleKey, authContext, {
      thread_id: thread.id,
      role: 'assistant',
      content: failedContent,
      provider: providerConfig.provider,
      model: providerConfig.model,
      metadata: {
        context_summary: pageContext.summary,
        context_key: contextKey,
        company_currency_label: companyContext?.currency_label || null,
        knowledge_chunk_ids: knowledgeChunks.map((chunk) => chunk.id),
        retrieved_context_modules: retrievedContexts.map((ctx) => ctx.moduleId),
        capability,
        failed: true,
        status: 'failed',
        error: providerFailure,
        file: {
          filename,
          mime_type: mimeType,
        },
      },
    });
    await restPatch(supabaseUrl, serviceRoleKey, 'ai_threads', { id: `eq.${thread.id}`, org_id: `eq.${authContext.orgId}` }, {
      updated_at: new Date().toISOString(),
      provider: providerConfig.provider,
      model: providerConfig.model,
      context_type: getContextKind(pageContext.context || {}),
      module_id: pageContext.moduleId || null,
      record_id: pageContext.recordId || null,
      metadata: {
        ...(thread?.metadata || {}),
        route: pageContext.context?.route || null,
        summary: pageContext.summary || null,
        context_kind: getContextKind(pageContext.context || {}),
        context_label: buildThreadContextLabel(pageContext),
        context: pageContext.context || null,
        module_id: pageContext.moduleId || null,
        record_id: pageContext.recordId || null,
        last_activity_kind: 'file_failed',
        last_message_preview: failedContent.slice(0, 300),
      },
    }).catch(() => []);
    return json(200, {
      success: false,
      thread,
      threadId: thread.id,
      userMessageId: userMessage?.id || null,
      messageId: assistantMessage?.id || null,
      message: failedContent,
      provider: providerConfig.provider,
      model: providerConfig.model,
      messages: [userMessage, assistantMessage].filter(Boolean),
      contextSummary: pageContext.summary,
      retrievedContextModules: retrievedContexts.map((ctx) => ctx.moduleId),
    });
  }
  const assistantMessage = await insertAiMessage(supabaseUrl, serviceRoleKey, authContext, {
    thread_id: thread.id,
    role: 'assistant',
    content: aiResult.content,
    provider: aiResult.provider,
    model: aiResult.model,
    metadata: {
      context_summary: pageContext.summary,
      context_key: contextKey,
      company_currency_label: companyContext?.currency_label || null,
      knowledge_chunk_ids: knowledgeChunks.map((chunk) => chunk.id),
      retrieved_context_modules: retrievedContexts.map((ctx) => ctx.moduleId),
      usage: aiResult.usageMetadata,
      avalai_request_id: aiResult.requestId || null,
      capability,
      file: {
        filename,
        mime_type: mimeType,
      },
    },
  });

  const ledger = await recordAiUsageLedger(supabaseUrl, serviceRoleKey, authContext, {
    threadId: thread.id,
    messageId: assistantMessage?.id || null,
    requestId: aiResult.requestId,
    capability,
    provider: aiResult.provider,
    model: aiResult.model,
    usageMetadata: aiResult.usageMetadata,
    metadata: {
      source: 'chat_with_file',
      context_key: contextKey,
      filename,
    },
  });
  await patchAiMessageCustomerBilling(supabaseUrl, serviceRoleKey, authContext, assistantMessage, aiResult.usageMetadata, ledger);

  await restPatch(supabaseUrl, serviceRoleKey, 'ai_threads', { id: `eq.${thread.id}`, org_id: `eq.${authContext.orgId}` }, {
    updated_at: new Date().toISOString(),
    provider: aiResult.provider,
    model: aiResult.model,
    context_type: getContextKind(pageContext.context || {}),
    module_id: pageContext.moduleId || null,
    record_id: pageContext.recordId || null,
    metadata: {
      ...(thread?.metadata || {}),
      route: pageContext.context?.route || null,
      summary: pageContext.summary || null,
      context_kind: getContextKind(pageContext.context || {}),
      context_label: buildThreadContextLabel(pageContext),
      context: pageContext.context || null,
      module_id: pageContext.moduleId || null,
      record_id: pageContext.recordId || null,
      last_activity_kind: 'file',
      last_file_name: filename,
      last_message_preview: prompt.slice(0, 300),
    },
  });

  return json(200, {
    success: true,
    threadId: thread.id,
    userMessageId: userMessage?.id || null,
    messageId: assistantMessage?.id || null,
    answer: aiResult.content,
    provider: aiResult.provider,
    model: aiResult.model,
    usage: withCustomerBilling(aiResult.usageMetadata, ledger),
    ledger,
    contextSummary: pageContext.summary,
    retrievedContextModules: retrievedContexts.map((ctx) => ctx.moduleId),
    knowledgeSources: knowledgeChunks.map((chunk) => ({
      id: chunk.id,
      documentId: chunk.document_id,
      title: chunk?.metadata?.document_title || null,
      chunkIndex: chunk.chunk_index,
    })),
  });
};

const handleRecordMutationFromPrompt = async (supabaseUrl: string, serviceRoleKey: string, authContext: any, body: any) => {
  const isUpdate = String(body?.action || '').trim() === 'update_record_from_prompt'
    || String(body?.outputMode || body?.output_mode || '').trim() === 'update_record';
  const mutationAction = isUpdate ? 'update_record_from_prompt' : 'create_record_from_prompt';
  const mutationVerb = isUpdate ? 'ویرایش' : 'ساخت';
  const prompt = String(body?.message || body?.prompt || '').trim();
  if (!prompt) return json(400, { success: false, message: `متن درخواست ${mutationVerb} رکورد خالی است.` });

  const schema = body?.recordCreation || body?.record_creation || {};
  const targetModuleId = String(schema?.moduleId || body?.targetModuleId || body?.target_module_id || '').trim();
  if (!targetModuleId || !ALLOWED_MODULES.has(targetModuleId)) {
    return json(400, { success: false, message: `ماژول مقصد برای ${mutationVerb} رکورد معتبر نیست.` });
  }
  const requestedFields = Array.isArray(schema?.fields) ? schema.fields : [];
  const targetTable = getModuleTable(targetModuleId);
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(targetTable)) {
    return json(400, { success: false, message: 'جدول مقصد برای ساخت رکورد معتبر نیست.' });
  }
  const targetPerm = getModulePermission(authContext.permissions, targetModuleId);
  if (isUpdate ? targetPerm?.edit === false || targetPerm?.view === false : !canCreateModule(targetPerm)) {
    return json(403, { success: false, message: `شما دسترسی ${mutationVerb} رکورد در این ماژول را ندارید.` });
  }
  const permissionFields = targetPerm?.fields && typeof targetPerm.fields === 'object'
    ? targetPerm.fields
    : {};
  const fields = requestedFields.filter((field: any) => {
    const fieldKey = String(field?.key || '').trim();
    return fieldKey && permissionFields[fieldKey] !== false;
  });
  if (fields.length === 0) return json(400, { success: false, message: `فیلدهای مجاز برای ${mutationVerb} رکورد مشخص نیست.` });
  const effectiveSchema = { ...schema, fields };

  const rawContext = normalizeContext(body?.context || {});
  const capability = String(body?.capability || 'workflow_ai_prompt').trim() || 'workflow_ai_prompt';
  const contextKey = buildContextKey(rawContext);
  const providerConfig = await resolveProviderConfig(supabaseUrl, serviceRoleKey, authContext, capability, { modelOverride: body?.modelOverride });
  await assertAiCapabilityEnabled(supabaseUrl, serviceRoleKey, authContext, providerConfig.orgAiSettings, capability);
  const pageContext = await buildPermittedPageContext(supabaseUrl, serviceRoleKey, authContext, rawContext);
  if (isUpdate && (!pageContext?.recordId || pageContext?.moduleId !== targetModuleId)) {
    return json(400, { success: false, message: 'برای ویرایش با هوش مصنوعی باید رکورد جاری همان ماژول مشخص باشد.' });
  }
  const planContext = await loadTenantAiPlanContext(supabaseUrl, serviceRoleKey, authContext);
  const canUseKnowledge = isAiCapabilityPlanAvailable(planContext, 'document_analysis');
  const file = body?.file || body?.attachment || null;
  const filePrompt = file ? [
    prompt,
    '',
    `فایل پیوست: ${String(file?.filename || file?.fileName || file?.name || 'فایل پیوست').trim() || 'فایل پیوست'}`,
    String(file?.text || '').trim() ? `محتوای فایل:\n${String(file.text).trim()}` : '',
  ].filter(Boolean).join('\n') : prompt;

  const moduleLabel = String(schema?.moduleLabel || schema?.module_label || targetModuleId).trim() || targetModuleId;
  const fieldLines = fields.map((field: any) => {
    const options = Array.isArray(field?.options) && field.options.length
      ? ` گزینه‌های مجاز: ${field.options.slice(0, 40).map((option: any) => `${option?.label || option?.value}=${option?.value}`).join('، ')}`
      : '';
    return `- ${field.key}: ${field.label || field.key} (${field.type || 'text'}${field.required ? '، ضروری' : ''})${options}`;
  }).join('\n');

  const systemPrompt = [
    `شما دستیار ${mutationVerb} رکورد در یک نرم‌افزار SaaS سازمانی هستید.`,
    'فقط از اطلاعاتی که کاربر داده استفاده کن.',
    `اگر برای ${mutationVerb} قابل اتکا اطلاعات کافی نیست، یا برای خواسته کاربر ابهام مهمی وجود دارد، تغییری ایجاد نکن و needs_clarification=true بده.`,
    'سوال‌ها را فقط به اطلاعات لازم برای تکمیل همان درخواست محدود کن؛ فقط به فیلدهای اجباری اکتفا نکن و داده‌های مهم کسب‌وکاری را هم بسنج.',
    'خروجی باید فقط JSON معتبر باشد؛ هیچ متن اضافی قبل یا بعد JSON ننویس.',
    'کلیدهای fields فقط باید از فهرست فیلدهای مجاز باشند. ستون org_id، id، system_code، created_at، updated_at، created_by و updated_by را برنگردان.',
    '',
    `ماژول مقصد: ${moduleLabel}`,
    'فیلدهای مجاز:',
    fieldLines,
    '',
    'قالب خروجی:',
    '{"reply":"پیام کوتاه فارسی برای کاربر","needs_clarification":false,"questions":[],"record":{"fields":{}}}',
  ].join('\n');

  const thread = await ensureThread(supabaseUrl, serviceRoleKey, authContext, {
    threadId: body?.threadId || null,
    title: `${mutationVerb} ${moduleLabel}: ${prompt}`.slice(0, 90),
    pageContext,
    contextKey,
    provider: providerConfig.provider,
    model: providerConfig.model,
    forceNew: body?.forceNewThread === true,
  });
  const [companyContext, orgPeopleContext, knowledgeChunks, retrievedContexts, previousMessages] = await Promise.all([
    loadCompanyContext(supabaseUrl, serviceRoleKey, authContext),
    loadOrgPeopleContext(supabaseUrl, serviceRoleKey, authContext, prompt),
    canUseKnowledge ? fetchKnowledgeChunks(supabaseUrl, serviceRoleKey, authContext, prompt, { moduleId: pageContext.moduleId || targetModuleId }) : Promise.resolve([]),
    fetchRelevantModuleContexts(supabaseUrl, serviceRoleKey, authContext, prompt, pageContext),
    fetchThreadMessages(supabaseUrl, serviceRoleKey, authContext, thread.id, 20),
  ]);

  const userMessage = await insertAiMessage(supabaseUrl, serviceRoleKey, authContext, {
    thread_id: thread.id,
    role: 'user',
    content: filePrompt,
    provider: providerConfig.provider,
    model: providerConfig.model,
    metadata: {
      context: pageContext.context,
      context_key: contextKey,
      input_kind: String(body?.inputKind || body?.input_kind || (file ? 'file' : 'text')).trim() || 'text',
      action: mutationAction,
      target_module_id: targetModuleId,
    },
  });
  const mutationMessages = buildPromptMessages(
    filePrompt,
    pageContext,
    knowledgeChunks,
    companyContext,
    orgPeopleContext,
    authContext,
    retrievedContexts,
    previousMessages,
    [],
    {
      legalMode: false,
      deepReasoning: capability === 'deep_reasoning',
      selectedCapabilities: Array.isArray(body?.capabilities)
        ? body.capabilities.map((item: any) => String(item || '').trim()).filter(Boolean)
        : ['record_creation'],
    },
  );
  mutationMessages.unshift({ role: 'system', content: systemPrompt });
  const lastMutationUserIndex = mutationMessages.map((item) => item.role).lastIndexOf('user');
  if (lastMutationUserIndex >= 0) {
    mutationMessages[lastMutationUserIndex] = {
      role: 'user',
      content: file && !String(file?.text || '').trim()
        ? buildOpenAiInputContentParts(filePrompt, file)
        : filePrompt,
    };
  }

  const aiResult = await callChatCompletions(providerConfig, mutationMessages, {
    safetyIdentifier: `org_${authContext.orgId}_user_${authContext.userId}_cap_${capability}_${isUpdate ? 'update' : 'create'}_record`,
    responseFormat: { type: 'json_object' },
  });

  const parsed = extractJsonObjectFromText(aiResult.content) || {};
  const clarificationQuestions = normalizeAiClarificationQuestions(parsed?.questions);
  const needsClarification = parsed?.needs_clarification === true || parsed?.needsClarification === true || clarificationQuestions.length > 0;
  const recordDraft = parsed?.record || (Array.isArray(parsed?.records) ? parsed.records[0] : null) || parsed;
  const payload = sanitizeAiRecordPayload(recordDraft, effectiveSchema);
  const relationFieldKey = String(schema?.relationFieldKey || schema?.relation_field_key || body?.relationFieldKey || body?.relation_field_key || '').trim();
  if (relationFieldKey && pageContext?.recordId) payload[relationFieldKey] = pageContext.recordId;
  const generatedReply = String(parsed?.reply || '').trim();
  const previewOnly = !isUpdate && (
    body?.previewOnly === true
    || body?.preview_only === true
    || body?.autoExecute === false
    || body?.auto_execute === false
  );

  if (previewOnly || needsClarification) {
    const hasPayload = !needsClarification && Object.keys(payload).length > 0;
    const reply = generatedReply
      ? (needsClarification ? buildAiClarificationReply(generatedReply, clarificationQuestions) : generatedReply)
      : (hasPayload
        ? `پیش‌نویس ${moduleLabel} آماده شد و برای ساخت نیاز به تایید شما دارد.`
        : buildAiClarificationReply('برای ساخت دقیق این رکورد اطلاعات کافی ندارم.', clarificationQuestions));
    const assistantMessage = await insertAiMessage(supabaseUrl, serviceRoleKey, authContext, {
      thread_id: thread.id,
      role: 'assistant',
      content: hasPayload ? `${reply}\n\nبرای ساخت رکورد، تایید کاربر لازم است.` : reply,
      provider: aiResult.provider,
      model: aiResult.model,
      metadata: {
        context_key: contextKey,
        usage: aiResult.usageMetadata,
        avalai_request_id: aiResult.requestId || null,
        capability,
        action: 'create_record_from_prompt',
        target_module_id: targetModuleId,
        proposed_record: hasPayload ? payload : null,
        raw_ai_json: parsed,
        requires_confirmation: hasPayload,
      },
    });
    const actionRows = hasPayload ? await restInsert(supabaseUrl, serviceRoleKey, 'ai_action_logs', [{
      org_id: authContext.orgId,
      thread_id: thread.id,
      message_id: assistantMessage?.id || null,
      module_id: pageContext.moduleId || targetModuleId,
      record_id: pageContext.recordId || null,
      action_type: 'create_record_from_prompt',
      status: 'proposed',
      proposed_payload: {
        prompt,
        reply,
        target_module_id: targetModuleId,
        target_table: targetTable,
        module_label: moduleLabel,
        record_creation_schema: effectiveSchema,
        payload,
        relation_field_key: relationFieldKey || null,
        context: pageContext.context || null,
        module_id: pageContext.moduleId || null,
        record_id: pageContext.recordId || null,
      },
      result_payload: { model: aiResult.model, preview_only: true },
      avalai_request_id: aiResult.requestId || null,
      created_by: authContext.userId || null,
    }]) : [];
    const proposedAction = actionRows[0] || null;
    const ledger = await recordAiUsageLedger(supabaseUrl, serviceRoleKey, authContext, {
      threadId: thread.id,
      messageId: assistantMessage?.id || null,
      requestId: aiResult.requestId,
      capability,
      provider: aiResult.provider,
      model: aiResult.model,
      usageMetadata: aiResult.usageMetadata,
      metadata: {
        source: 'create_record_preview',
        context_key: contextKey,
        target_module_id: targetModuleId,
        proposed: hasPayload,
      },
    });
    await patchAiMessageCustomerBilling(supabaseUrl, serviceRoleKey, authContext, assistantMessage, aiResult.usageMetadata, ledger);
    await restPatch(supabaseUrl, serviceRoleKey, 'ai_threads', { id: `eq.${thread.id}`, org_id: `eq.${authContext.orgId}` }, {
      updated_at: new Date().toISOString(),
      provider: aiResult.provider,
      model: aiResult.model,
      context_type: getContextKind(pageContext.context || {}),
      module_id: pageContext.moduleId || targetModuleId,
      record_id: pageContext.recordId || null,
      metadata: {
        ...(thread?.metadata || {}),
        route: pageContext.context?.route || null,
        summary: pageContext.summary || null,
        context_kind: getContextKind(pageContext.context || {}),
        context_label: buildThreadContextLabel(pageContext),
        context: pageContext.context || null,
        module_id: pageContext.moduleId || targetModuleId,
        record_id: pageContext.recordId || null,
        last_activity_kind: hasPayload ? 'create_record_preview' : 'create_record_skipped',
        last_message_preview: prompt.slice(0, 300),
        last_action_log_id: proposedAction?.id || null,
      },
    });
    return json(200, {
      success: true,
      threadId: thread.id,
      userMessageId: userMessage?.id || null,
      messageId: assistantMessage?.id || null,
      answer: hasPayload ? `${reply}\n\nبرای ساخت رکورد، تایید کاربر لازم است.` : reply,
      proposedAction: proposedAction ? {
        id: proposedAction.id,
        actionType: 'create_record_from_prompt',
        moduleId: pageContext.moduleId || targetModuleId,
        recordId: pageContext.recordId || null,
        targetModuleId,
        title: moduleLabel,
        status: 'proposed',
        schema: effectiveSchema,
        proposedPayload: {
          prompt,
          reply,
          target_module_id: targetModuleId,
          target_table: targetTable,
          module_label: moduleLabel,
          payload,
          relation_field_key: relationFieldKey || null,
        },
      } : null,
      provider: aiResult.provider,
      model: aiResult.model,
      usage: withCustomerBilling(aiResult.usageMetadata, ledger),
      ledger,
    });
  }

  const createdRecords: any[] = [];
  const updatedRecords: any[] = [];
  if (Object.keys(payload).length > 0) {
    if (isUpdate) {
      await restPatch(supabaseUrl, serviceRoleKey, targetTable, {
        id: `eq.${pageContext.recordId}`,
        org_id: `eq.${authContext.orgId}`,
      }, {
        ...payload,
        updated_by: authContext.userId || null,
        updated_at: new Date().toISOString(),
      });
      const currentRecord = pageContext.records?.[0] || {};
      updatedRecords.push({
        module_id: targetModuleId,
        table: targetTable,
        id: pageContext.recordId,
        title: buildAiRecordTitle({ ...currentRecord, ...payload }, moduleLabel),
      });
    } else {
      const rows = await restInsert(supabaseUrl, serviceRoleKey, targetTable, [{
        org_id: authContext.orgId,
        ...payload,
      }]);
      const created = rows[0] || null;
      if (created) {
        createdRecords.push({
          module_id: targetModuleId,
          table: targetTable,
          id: created.id || null,
          title: buildAiRecordTitle(created, moduleLabel),
        });
      }
    }
  }

  const reply = generatedReply
    || (isUpdate
      ? (updatedRecords.length > 0
          ? `${moduleLabel} با اطلاعات استخراج‌شده به‌روزرسانی شد.`
          : 'اطلاعات کافی برای ویرایش رکورد پیدا نشد.')
      : (createdRecords.length > 0
          ? `${moduleLabel} با اطلاعات استخراج‌شده ساخته شد.`
          : 'اطلاعات کافی برای ساخت رکورد پیدا نشد.'));
  const assistantMessage = await insertAiMessage(supabaseUrl, serviceRoleKey, authContext, {
    thread_id: thread.id,
    role: 'assistant',
    content: reply,
    provider: aiResult.provider,
    model: aiResult.model,
    metadata: {
      context_key: contextKey,
      usage: aiResult.usageMetadata,
      avalai_request_id: aiResult.requestId || null,
      capability,
      action: mutationAction,
      target_module_id: targetModuleId,
      created_records: createdRecords,
      updated_records: updatedRecords,
      raw_ai_json: parsed,
    },
  });

  const ledger = await recordAiUsageLedger(supabaseUrl, serviceRoleKey, authContext, {
    threadId: thread.id,
    messageId: assistantMessage?.id || null,
    requestId: aiResult.requestId,
    capability,
    provider: aiResult.provider,
    model: aiResult.model,
    usageMetadata: aiResult.usageMetadata,
    metadata: {
      source: mutationAction,
      context_key: contextKey,
      target_module_id: targetModuleId,
      created_count: createdRecords.length,
      updated_count: updatedRecords.length,
    },
  });
  await patchAiMessageCustomerBilling(supabaseUrl, serviceRoleKey, authContext, assistantMessage, aiResult.usageMetadata, ledger);

  await restInsert(supabaseUrl, serviceRoleKey, 'ai_action_logs', [{
    org_id: authContext.orgId,
    thread_id: thread.id,
    message_id: assistantMessage?.id || null,
    module_id: pageContext.moduleId || targetModuleId,
    record_id: pageContext.recordId || createdRecords[0]?.id || null,
    action_type: mutationAction,
    status: createdRecords.length > 0 || updatedRecords.length > 0 ? 'executed' : 'skipped',
    proposed_payload: {
      prompt,
      target_module_id: targetModuleId,
      schema_fields: fields.map((field: any) => field.key),
    },
    result_payload: {
      reply,
      created_records: createdRecords,
      updated_records: updatedRecords,
      model: aiResult.model,
    },
    avalai_request_id: aiResult.requestId || null,
    created_by: authContext.userId || null,
    executed_at: new Date().toISOString(),
  }]).catch((error: any) => console.warn('AI record mutation action log skipped', error));

  await restPatch(supabaseUrl, serviceRoleKey, 'ai_threads', { id: `eq.${thread.id}`, org_id: `eq.${authContext.orgId}` }, {
    updated_at: new Date().toISOString(),
    provider: aiResult.provider,
    model: aiResult.model,
    context_type: getContextKind(pageContext.context || {}),
    module_id: pageContext.moduleId || targetModuleId,
    record_id: pageContext.recordId || createdRecords[0]?.id || null,
    metadata: {
      ...(thread?.metadata || {}),
      route: pageContext.context?.route || null,
      summary: pageContext.summary || null,
      context_kind: getContextKind(pageContext.context || {}),
      context_label: buildThreadContextLabel(pageContext),
      context: pageContext.context || null,
      module_id: pageContext.moduleId || targetModuleId,
      record_id: pageContext.recordId || createdRecords[0]?.id || null,
      last_activity_kind: isUpdate ? 'update_record' : 'create_record',
      last_message_preview: prompt.slice(0, 300),
      last_created_records: createdRecords,
      last_updated_records: updatedRecords,
    },
  });

  return json(200, {
    success: true,
    threadId: thread.id,
    userMessageId: userMessage?.id || null,
    messageId: assistantMessage?.id || null,
    answer: reply,
    createdRecords,
    updatedRecords,
    provider: aiResult.provider,
    model: aiResult.model,
    usage: withCustomerBilling(aiResult.usageMetadata, ledger),
    ledger,
  });
};

const normalizeTaskBundleInputs = (body: any) => {
  const bundle = body?.bundle && typeof body.bundle === 'object' ? body.bundle : {};
  const rawInputs = [
    ...(Array.isArray(bundle?.inputs) ? bundle.inputs : []),
    ...(Array.isArray(body?.inputs) ? body.inputs : []),
  ];
  return rawInputs
    .map((input: any, index: number) => {
      const type = String(input?.type || input?.kind || '').trim() || 'text';
      const file = input?.file || input?.attachment || input;
      const filename = String(file?.filename || file?.fileName || file?.name || input?.label || '').trim();
      const mimeType = String(file?.mimeType || file?.mime_type || file?.type || input?.mimeType || '').trim();
      return {
        id: String(input?.id || `bundle-input-${index + 1}`),
        type,
        label: String(input?.label || filename || type).trim(),
        text: String(input?.text || input?.prompt || input?.transcript || '').trim(),
        file: ['file', 'image', 'document', 'attachment'].includes(type) ? {
          filename: filename || 'فایل پیوست',
          mimeType,
          size: numberFrom(file?.size || file?.fileSize || 0, 0) || null,
          text: String(file?.text || file?.prompt || input?.text || '').trim(),
          data: file?.data || file?.base64 || file?.file_data || null,
          url: file?.url || file?.file_url || null,
          assetId: file?.assetId || file?.asset_id || null,
          entryId: file?.entryId || file?.entry_id || null,
          moduleId: file?.moduleId || file?.module_id || null,
          recordId: file?.recordId || file?.record_id || null,
        } : null,
        audio: type === 'voice' || type === 'audio' ? {
          data: input?.audio?.data || input?.data || input?.base64 || '',
          mimeType: input?.audio?.mimeType || input?.audio?.mime_type || input?.mimeType || 'audio/webm',
          durationMs: numberFrom(input?.audio?.durationMs || input?.audio?.duration_ms || input?.durationMs, 0),
          filename: String(input?.audio?.filename || input?.filename || 'voice.webm').trim() || 'voice.webm',
        } : null,
      };
    })
    .filter((input: any) => input.text || input.file || input.audio);
};

const transcribeTaskBundleVoices = async (
  supabaseUrl: string,
  serviceRoleKey: string,
  authContext: any,
  inputs: any[],
) => {
  const voiceInputs = inputs.filter((input) => input.audio?.data);
  if (!voiceInputs.length) return [];
  const providerConfig = await resolveProviderConfig(supabaseUrl, serviceRoleKey, authContext, 'voice_input');
  await assertAiCapabilityEnabled(supabaseUrl, serviceRoleKey, authContext, providerConfig.orgAiSettings, 'voice_input');
  const transcripts: any[] = [];
  for (const input of voiceInputs.slice(0, 3)) {
    const result = await callAudioTranscription(
      providerConfig,
      String(input.audio.data || ''),
      String(input.audio.mimeType || 'audio/webm'),
      String(input.audio.filename || 'voice.webm'),
    );
    transcripts.push({ inputId: input.id, label: input.label || 'ویس', transcript: result.transcript });
    await recordAiUsageLedger(supabaseUrl, serviceRoleKey, authContext, {
      capability: 'voice_input',
      provider: result.provider,
      model: result.model,
      requestId: result.requestId,
      usageMetadata: result.usageMetadata,
      metadata: {
        source: 'task_bundle_voice_transcription',
        bundle_input_id: input.id,
        mime_type: input.audio.mimeType || 'audio/webm',
        duration_ms: input.audio.durationMs || 0,
      },
    });
  }
  return transcripts;
};

const buildTaskBundlePrompt = (body: any, inputs: any[], transcripts: any[], previousContext: any = null) => {
  const baseMessage = String(body?.message || body?.prompt || body?.bundle?.message || '').trim();
  const previousSummary = String(previousContext?.summary || previousContext?.analysis || previousContext?.text || '').trim();
  const textParts = inputs
    .filter((input) => input.text && !input.audio)
    .map((input) => `متن ${input.label || input.type}:\n${input.text}`);
  const voiceParts = transcripts.map((item) => `متن تبدیل‌شده از ${item.label || 'ویس'}:\n${item.transcript}`);
  const fileParts = inputs
    .filter((input) => input.file)
    .map((input) => {
      const file = input.file || {};
      return [
        `پیوست: ${file.filename || input.label || 'فایل'}`,
        file.mimeType ? `نوع: ${file.mimeType}` : '',
        file.text ? `متن/داده استخراج‌شده:\n${file.text}` : '',
      ].filter(Boolean).join('\n');
    });
  return [
    baseMessage || 'این ورودی‌ها را بررسی کن و مطابق عملگرهای انتخاب‌شده اقدام پیشنهادی بده.',
    previousSummary ? `زمینه ذخیره‌شده از مرحله قبل همین گفتگو:\n${previousSummary}` : '',
    '',
    ...textParts,
    ...voiceParts,
    ...fileParts,
  ].filter(Boolean).join('\n\n').trim();
};

const AUTO_RECORD_CREATION_PATTERNS = [
  /(?:بساز|ایجاد کن|ثبت کن|اضافه کن).*(?:رکورد|مشتری|تامین|تأمین|فاکتور|پروژه|محصول|کارمند|فعالیت|درخواست|سند)/i,
  /(?:به عنوان|تبدیل به).*(?:مشتری|تامین کننده|تامین‌کننده|فاکتور|پروژه|محصول|کارمند|فعالیت|درخواست|سند)/i,
];

const AUTO_PROCESS_OPERATION_PATTERNS = [
  /(?:فرآیند|فرایند|گردش کار|گردش‌کار|مرحله|فعالیت).*(?:اجرا|ارجاع|اقدام|تغییر|ببر|منتقل|بروزرسانی|به‌روزرسانی)/i,
  /(?:اقدام فرآیندی|اقدام فرایندی|process operation|workflow action)/i,
];

const AUTO_IMAGE_GENERATION_PATTERNS = [
  /(?:تصویر|عکس|پوستر|بنر|کاور).*(?:بساز|ایجاد کن|طراحی کن|درست کن)/i,
  /(?:تصویر|عکس).*(?:اصلاح|ادیت|ویرایش|تغییر)/i,
  /(?:لوگو|بنر|پوستر|کاور).*(?:بساز|طراحی کن)/i,
];

const IMAGE_PROMPT_ONLY_PATTERNS = [
  /(?:پرامپت|prompt|متن|توضیح|دستور).*(?:برای|جهت).*(?:تولید|ساخت|ایجاد).*(?:تصویر|عکس|پوستر|بنر|کاور|image)/i,
  /(?:برای|جهت).*(?:تولید|ساخت|ایجاد).*(?:تصویر|عکس|پوستر|بنر|کاور|image).*(?:پرامپت|prompt|متن|توضیح|دستور).*(?:بنویس|بده|تهیه کن|آماده کن)/i,
  /(?:پرامپت|prompt).*(?:تصویر|عکس|image).*(?:بنویس|بده|تهیه کن|آماده کن)/i,
];

const DIRECT_IMAGE_GENERATION_PATTERNS = [
  /(?:خودت|مستقیماً|مستقیم|همین حالا).*(?:تصویر|عکس|پوستر|بنر|کاور).*(?:بساز|تولید کن|ایجاد کن)/i,
  /(?:تصویر|عکس|پوستر|بنر|کاور).*(?:را|رو).*(?:بساز|تولید کن|ایجاد کن|طراحی کن)/i,
];

const IMAGE_PROMPT_WORD_PATTERN = /(?:پرامپت|prompt|متن|توضیح|دستور).*(?:تصویر|عکس|پوستر|بنر|کاور|image)|(?:تصویر|عکس|پوستر|بنر|کاور|image).*(?:پرامپت|prompt|متن|توضیح|دستور)/i;

const wantsImagePromptOnly = (text: string) => {
  const value = String(text || '').trim();
  const asksForPrompt = IMAGE_PROMPT_ONLY_PATTERNS.some((pattern) => pattern.test(value));
  const explicitDirectGeneration = DIRECT_IMAGE_GENERATION_PATTERNS.some((pattern) => pattern.test(value))
    && !IMAGE_PROMPT_WORD_PATTERN.test(value);
  return asksForPrompt && !explicitDirectGeneration;
};

const AUTO_VOICE_OUTPUT_PATTERNS = [
  /(?:صدا|ویس|فایل صوتی).*(?:بساز|تولید کن|بخوان|بگو|تبدیل کن)/i,
  /(?:متن|این نوشته).*(?:را|رو).*(?:به صدا|به ویس|صوتی)/i,
];

const AUTO_DOCUMENT_GENERATION_PATTERNS = [
  /(?:فایل|ورد|اکسل|pdf|پی دی اف|گزارش|خروجی|csv).*(?:بساز|درست کن|ایجاد کن|تولید کن)/i,
  /(?:فرم|نامه|قرارداد|پیشنهاد|گزارش).*(?:تهیه کن|بساز|در قالب)/i,
];

const AUTO_LEGAL_PATTERNS = [
  /(?:حقوقی|قانون|قرارداد|شکایت|تعهد|مسئولیت|دادرسی|دادگاه|آیین نامه|آیین‌نامه)/i,
  /(?:legal|contract|law|compliance)/i,
];

const AUTO_DEEP_REASONING_PATTERNS = [
  /(?:عمیق|قدم به قدم|مرحله به مرحله|تحلیل کن|مقایسه کن|استدلال کن|سناریو)/i,
  /(?:reasoning|analyze deeply|step by step)/i,
];

const buildAutoRouterHistoryText = (messages: any[], limit = 8) =>
  (messages || [])
    .filter((item: any) => item && (item.role === 'user' || item.role === 'assistant'))
    .slice(-limit)
    .map((item: any) => {
      const role = item.role === 'assistant' ? 'دستیار' : 'کاربر';
      const content = String(item?.content || '').replace(/\s+/g, ' ').trim();
      return content ? `${role}: ${content.slice(0, 700)}` : '';
    })
    .filter(Boolean)
    .join('\n');

const pickAutoTargetModuleId = (
  suggestedModuleId: string | null,
  message: string,
  pageContext: any,
  authContext: any,
) => {
  const requested = String(suggestedModuleId || '').trim();
  const canUseModule = (moduleId: string) => {
    if (!moduleId || !ALLOWED_MODULES.has(moduleId)) return false;
    return canCreateModule(getModulePermission(authContext.permissions, moduleId));
  };
  if (canUseModule(requested)) return requested;
  const detected = detectRelevantModuleIds(message, pageContext).filter((moduleId) => canUseModule(moduleId));
  if (detected.length === 1) return detected[0];
  if (pageContext?.moduleId && canUseModule(String(pageContext.moduleId))) return String(pageContext.moduleId);
  return null;
};

const detectHeuristicAutoRoute = (
  prompt: string,
  inputs: any[],
  transcripts: any[],
  availableCapabilities: string[],
) => {
  const available = new Set((availableCapabilities || []).map((item) => String(item || '').trim()));
  const text = String(prompt || '').trim();
  const normalized = text.toLowerCase();
  const hasImageInput = inputs.some((input) => input.type === 'image' || String(input?.file?.mimeType || '').toLowerCase().startsWith('image/'));
  const hasFileInput = inputs.some((input) => input.file);
  const hasVoiceInput = transcripts.length > 0 || inputs.some((input) => input.audio);
  const suggestions: string[] = [];

  const add = (capability: string) => {
    if (!available.has(capability) || suggestions.includes(capability)) return;
    suggestions.push(capability);
  };

  if (hasVoiceInput) add('voice_input');
  if (hasFileInput) add('document_analysis');
  if (!wantsImagePromptOnly(normalized) && AUTO_IMAGE_GENERATION_PATTERNS.some((pattern) => pattern.test(normalized))) add('image_generation');
  if (AUTO_VOICE_OUTPUT_PATTERNS.some((pattern) => pattern.test(normalized))) add('voice_output');
  if (AUTO_DOCUMENT_GENERATION_PATTERNS.some((pattern) => pattern.test(normalized))) add('document_generation');
  if (AUTO_PROCESS_OPERATION_PATTERNS.some((pattern) => pattern.test(normalized))) add('process_operation');
  if (AUTO_RECORD_CREATION_PATTERNS.some((pattern) => pattern.test(normalized))) add('record_creation');
  if (AUTO_LEGAL_PATTERNS.some((pattern) => pattern.test(normalized))) add('legal_assistant');
  if (!suggestions.includes('legal_assistant') && shouldTriggerWebSearch(normalized)) add('web_search');
  if (AUTO_DEEP_REASONING_PATTERNS.some((pattern) => pattern.test(normalized))) add('deep_reasoning');
  if (hasImageInput && suggestions.includes('image_generation')) {
    const next = suggestions.filter((item) => item !== 'document_analysis');
    return Array.from(new Set(next));
  }
  return Array.from(new Set(suggestions));
};

const handleSuggestAutoCapabilities = async (supabaseUrl: string, serviceRoleKey: string, authContext: any, body: any) => {
  const rawContext = normalizeContext(body?.context || {});
  const baseCapability = rawContext.mode === 'record' ? 'record_chat' : 'dashboard_chat';
  const providerConfig = await resolveProviderConfig(supabaseUrl, serviceRoleKey, authContext, baseCapability, { modelOverride: body?.modelOverride });
  const planContext = await assertAiCapabilityEnabled(supabaseUrl, serviceRoleKey, authContext, providerConfig.orgAiSettings, baseCapability);
  const catalogRows = await listActiveAiModels(supabaseUrl, serviceRoleKey);
  const availability = buildAiCapabilityAvailability(planContext, providerConfig.orgAiSettings, catalogRows);
  const availableCapabilities = AUTO_ROUTER_CAPABILITIES.filter((capability) => availability?.[capability]?.enabled === true);

  const existingThread = body?.threadId
    ? await fetchThreadForRead(supabaseUrl, serviceRoleKey, authContext, String(body.threadId))
    : null;
  const previousTaskContext = existingThread?.metadata?.task_bundle_context && typeof existingThread.metadata.task_bundle_context === 'object'
    ? existingThread.metadata.task_bundle_context
    : null;
  const inputs = normalizeTaskBundleInputs(body);
  const transcripts = availability?.voice_input?.enabled === true
    ? await transcribeTaskBundleVoices(supabaseUrl, serviceRoleKey, authContext, inputs)
    : [];
  const prompt = inputs.length
    ? buildTaskBundlePrompt(body, inputs, transcripts, previousTaskContext)
    : String(body?.message || body?.prompt || '').trim();
  if (!prompt) return json(400, { success: false, message: 'متن یا ورودی کافی برای تصمیم‌گیری خودکار دریافت نشد.' });

  const pageContext = await buildPermittedPageContext(supabaseUrl, serviceRoleKey, authContext, rawContext);
  const previousMessages = existingThread
    ? await fetchThreadMessages(supabaseUrl, serviceRoleKey, authContext, existingThread.id, 20)
    : [];
  const canUseKnowledge = isAiCapabilityPlanAvailable(planContext, 'document_analysis');
  const [knowledgeChunks, companyContext, orgPeopleContext, retrievedContexts] = await Promise.all([
    canUseKnowledge ? fetchKnowledgeChunks(supabaseUrl, serviceRoleKey, authContext, prompt, { moduleId: pageContext.moduleId }) : Promise.resolve([]),
    loadCompanyContext(supabaseUrl, serviceRoleKey, authContext),
    loadOrgPeopleContext(supabaseUrl, serviceRoleKey, authContext, prompt),
    fetchRelevantModuleContexts(supabaseUrl, serviceRoleKey, authContext, prompt, pageContext),
  ]);

  const heuristicCapabilities = detectHeuristicAutoRoute(prompt, inputs, transcripts, availableCapabilities);
  const routerSystemPrompt = [
    'شما فقط موتور تصمیم‌گیرنده برای انتخاب عملگرهای هوش مصنوعی هستید.',
    'پاسخ شما باید فقط JSON معتبر باشد و هیچ متن اضافه‌ای نداشته باشد.',
    'فقط از capabilityهای مجاز زیر انتخاب کن و capability جدید نساز:',
    availableCapabilities.length ? availableCapabilities.join(', ') : 'هیچ capability فعال نیست',
    'اگر کاربر فقط گفتگوی عادی می‌خواهد، capabilities را خالی برگردان.',
    'اگر کاربر از فایل، تصویر یا ویس چیزی فرستاده و می‌خواهد آن را بررسی یا از آن اطلاعات استخراج شود، document_analysis و در صورت وجود صوت voice_input را انتخاب کن.',
    'اگر کاربر خواسته از روی ورودی‌ها رکورد ساخته شود، record_creation را انتخاب کن و اگر نوع رکورد روشن است target_module_id را هم بده.',
    'اگر کاربر خواسته مرحله، فعالیت یا فرآیند اجرا/تغییر/ارجاع شود، process_operation را انتخاب کن.',
    'اگر کاربر ساخت یا اصلاح تصویر می‌خواهد، image_generation را انتخاب کن؛ مخصوصاً وقتی تصویر مبنا هم فرستاده شده است.',
    'اگر کاربر فقط پرامپت، متن، توضیح یا دستور برای تولید تصویر می‌خواهد، image_generation را انتخاب نکن؛ این یک گفتگوی متنی عادی است مگر اینکه صریحاً بخواهد خود تصویر همین حالا ساخته شود.',
    'اگر کاربر ساخت فایل Word/Excel/PDF/CSV یا گزارش خروجی می‌خواهد، document_generation را انتخاب کن.',
    'اگر کاربر تبدیل متن به ویس می‌خواهد، voice_output را انتخاب کن.',
    'اگر سوال نیازمند اطلاعات جاری وب است، web_search را انتخاب کن.',
    'اگر سوال حقوقی است، legal_assistant را انتخاب کن.',
    'اگر سوال پیچیده و نیازمند تحلیل چندمرحله‌ای است، deep_reasoning را انتخاب کن.',
    'چند capability را فقط وقتی باهم برگردان که واقعاً برای انجام همان درخواست لازم باشند.',
    'برای record_creation اگر نوع رکورد روشن نیست target_module_id را null بگذار.',
    'قالب خروجی:',
    '{"capabilities":[],"target_module_id":null,"reason":"...","confidence":"low|medium|high"}',
  ].join('\n');
  const routingUserPrompt = [
    `درخواست اصلی کاربر:\n${prompt}`,
    heuristicCapabilities.length ? `پیشنهاد اولیه heuristic:\n${heuristicCapabilities.join(', ')}` : '',
    previousMessages.length ? `خلاصه گفتگوی قبلی:\n${buildAutoRouterHistoryText(previousMessages)}` : '',
    inputs.length ? `نوع ورودی‌ها:\n${inputs.map((input) => `- ${input.type}: ${input.label}`).join('\n')}` : '',
  ].filter(Boolean).join('\n\n');

  let capabilities = heuristicCapabilities;
  let targetModuleId: string | null = null;
  let routeReason = heuristicCapabilities.length
    ? `heuristic:${heuristicCapabilities.join(',')}`
    : 'plain_chat';
  let routeConfidence = heuristicCapabilities.length ? 'medium' : 'low';
  let usageWithBilling: any = null;
  let ledger: any = null;
  try {
    const routingMessages = buildPromptMessages(
      routingUserPrompt,
      pageContext,
      knowledgeChunks,
      companyContext,
      orgPeopleContext,
      authContext,
      retrievedContexts,
      previousMessages,
      [],
      {
        legalMode: false,
        deepReasoning: false,
        selectedCapabilities: heuristicCapabilities,
      },
    );
    routingMessages.unshift({ role: 'system', content: routerSystemPrompt });
    const routeResult = await callChatCompletions(providerConfig, routingMessages, {
      safetyIdentifier: `org_${authContext.orgId}_user_${authContext.userId}_cap_${baseCapability}_auto_router`,
      responseFormat: { type: 'json_object' },
    });
    const parsed = extractJsonObjectFromText(routeResult.content) || {};
    const suggestedCapabilities = Array.isArray(parsed?.capabilities)
      ? parsed.capabilities.map((item: any) => String(item || '').trim()).filter(Boolean)
      : [];
    const filtered = suggestedCapabilities
      .filter((capability: string) => availableCapabilities.includes(capability))
      .filter((capability: string) => !(capability === 'image_generation' && wantsImagePromptOnly(prompt.toLowerCase())));
    capabilities = filtered.length ? Array.from(new Set(filtered)) : heuristicCapabilities;
    targetModuleId = pickAutoTargetModuleId(String(parsed?.target_module_id || '').trim() || null, prompt, pageContext, authContext);
    routeReason = String(parsed?.reason || routeReason || '').trim() || routeReason;
    routeConfidence = String(parsed?.confidence || routeConfidence || '').trim() || routeConfidence;
    ledger = await recordAiUsageLedger(supabaseUrl, serviceRoleKey, authContext, {
      threadId: existingThread?.id || null,
      requestId: routeResult.requestId,
      capability: baseCapability,
      provider: routeResult.provider,
      model: routeResult.model,
      usageMetadata: routeResult.usageMetadata,
      metadata: {
        source: 'auto_router',
        suggested_capabilities: capabilities,
        target_module_id: targetModuleId,
        confidence: routeConfidence,
      },
    });
    usageWithBilling = withCustomerBilling(routeResult.usageMetadata, ledger);
    return json(200, {
      success: true,
      capabilities,
      targetModuleId,
      capability: baseCapability,
      reason: routeReason,
      confidence: routeConfidence,
      provider: routeResult.provider,
      model: routeResult.model,
      usage: usageWithBilling,
      ledger,
    });
  } catch (error) {
    console.warn('AI auto-router fell back to heuristics', error);
  }

  if (capabilities.includes('record_creation')) {
    targetModuleId = pickAutoTargetModuleId(null, prompt, pageContext, authContext);
  }
  return json(200, {
    success: true,
    capabilities,
    targetModuleId,
    capability: baseCapability,
    reason: routeReason,
    confidence: routeConfidence,
    provider: providerConfig.provider,
    model: providerConfig.model,
    usage: usageWithBilling,
    ledger,
  });
};

const parseAssistantJsonResponse = async (response: Response) => {
  const text = await response.text();
  const parsed = parseJsonSafe(text);
  return parsed && typeof parsed === 'object' ? parsed : { success: false, message: String(text || '').slice(0, 500) };
};

const handleRunTaskBundle = async (supabaseUrl: string, serviceRoleKey: string, authContext: any, body: any) => {
  const selectedCapabilities = Array.from(new Set(Array.isArray(body?.capabilities)
    ? body.capabilities.map((item: any) => String(item || '').trim()).filter(Boolean)
    : []));
  const selectedCapabilitySet = new Set(selectedCapabilities);
  if ((body?.recordCreation || body?.record_creation) && !selectedCapabilitySet.has('record_creation')) {
    selectedCapabilities.push('record_creation');
    selectedCapabilitySet.add('record_creation');
  }
  const inputs = normalizeTaskBundleInputs(body);
  const baseMessage = String(body?.message || body?.prompt || body?.bundle?.message || '').trim();
  if (!baseMessage && inputs.length === 0) {
    return json(400, { success: false, message: 'متن، فایل یا ویس برای ارسال به هوش مصنوعی دریافت نشد.' });
  }

  for (const selectedCapability of selectedCapabilities) {
    if (AI_CAPABILITY_FEATURE_KEYS[selectedCapability]) {
      const providerConfig = await resolveProviderConfig(supabaseUrl, serviceRoleKey, authContext, selectedCapability, { modelOverride: body?.modelOverride });
      await assertAiCapabilityEnabled(supabaseUrl, serviceRoleKey, authContext, providerConfig.orgAiSettings, selectedCapability);
    }
  }

  const existingThread = body?.threadId ? await fetchThreadForRead(supabaseUrl, serviceRoleKey, authContext, String(body.threadId)) : null;
  const previousTaskContext = existingThread?.metadata?.task_bundle_context && typeof existingThread.metadata.task_bundle_context === 'object'
    ? existingThread.metadata.task_bundle_context
    : null;
  const transcripts = await transcribeTaskBundleVoices(supabaseUrl, serviceRoleKey, authContext, inputs);
  const prompt = buildTaskBundlePrompt(body, inputs, transcripts, previousTaskContext);
  const files = inputs.map((input) => input.file).filter(Boolean);
  const firstFile = files[0] || null;
  const bundleMeta = {
    input_count: inputs.length,
    input_types: inputs.map((input) => input.type),
    file_count: files.length,
    voice_count: transcripts.length,
    capabilities: selectedCapabilities,
  };
  const collectedMessages: any[] = [];
  const collectedResults: any[] = [];
  let workingThreadId = String(body?.threadId || '').trim() || null;
  let provider: string | null = null;
  let model: string | null = null;
  let finalAnswerParts: string[] = [];
  let proposedAction: any = null;
  let usage: any = null;
  let ledger: any = null;

  const runStep = async (stepName: string, promise: Promise<Response>) => {
    const data = await parseAssistantJsonResponse(await promise);
    if (data?.threadId) workingThreadId = String(data.threadId);
    if (data?.provider) provider = data.provider;
    if (data?.model) model = data.model;
    if (data?.usage) usage = data.usage;
    if (data?.ledger) ledger = data.ledger;
    if (Array.isArray(data?.messages)) collectedMessages.push(...data.messages);
    if (data?.messageId && workingThreadId) {
      const threadMessages = await fetchThreadMessages(supabaseUrl, serviceRoleKey, authContext, workingThreadId, 20);
      const message = threadMessages.find((item: any) => String(item.id) === String(data.messageId));
      if (message) collectedMessages.push(message);
    }
    if (data?.proposedAction && !proposedAction) proposedAction = data.proposedAction;
    collectedResults.push({ step: stepName, ...data });
    return data;
  };

  const shouldRunAnalysis = selectedCapabilitySet.has('document_analysis')
    || files.length > 0
    || transcripts.length > 0
    || !!previousTaskContext;

  let analysisText = String(previousTaskContext?.summary || previousTaskContext?.analysis || '').trim();
  if (shouldRunAnalysis) {
    const analysisPrompt = [
      'این مرحله تحلیل مشترک باندل است. همه ورودی‌ها و زمینه قبلی همین گفتگو را یکپارچه کن.',
      'اگر اطلاعات برای عملگرهای بعدی مثل ساخت رکورد یا ساخت فایل کافی نیست، دقیق و کوتاه سوال تکمیلی بپرس؛ ولی داده‌های استخراج‌شده را هم در پاسخ نگه دار.',
      prompt,
    ].join('\n\n');
    const analysisData = await runStep('document_analysis', firstFile
      ? handleChatWithFile(supabaseUrl, serviceRoleKey, authContext, {
        ...body,
        action: 'chat_with_file',
        capability: 'document_analysis',
        capabilities: selectedCapabilities,
        message: analysisPrompt,
        inputKind: 'task_bundle_analysis',
        file: firstFile,
        threadId: workingThreadId,
        metadata: { ...(body?.metadata || {}), task_bundle: bundleMeta },
      })
      : handleChat(supabaseUrl, serviceRoleKey, authContext, {
        ...body,
        action: 'chat',
        capability: 'document_analysis',
        capabilities: selectedCapabilities,
        message: analysisPrompt,
        inputKind: 'task_bundle_analysis',
        threadId: workingThreadId,
        metadata: { ...(body?.metadata || {}), task_bundle: bundleMeta },
      }));
    if (analysisData?.success === false) {
      return json(200, { ...analysisData, taskBundle: bundleMeta, results: collectedResults, messages: collectedMessages });
    }
    analysisText = String(analysisData?.answer || analysisData?.message || analysisText || '').trim();
    if (analysisText) finalAnswerParts.push(analysisText);
  }

  const sharedPrompt = [
    prompt,
    analysisText ? `\nتحلیل مشترک قابل استفاده برای عملگرهای بعدی:\n${analysisText}` : '',
  ].filter(Boolean).join('\n\n').trim();

  if (selectedCapabilitySet.has('record_creation')) {
    const data = await runStep('record_creation', handleRecordMutationFromPrompt(supabaseUrl, serviceRoleKey, authContext, {
      ...body,
      action: 'create_record_from_prompt',
      capability: body?.capability || (body?.context?.mode === 'record' ? 'record_chat' : 'dashboard_chat'),
      message: sharedPrompt,
      inputKind: 'task_bundle',
      file: firstFile,
      threadId: workingThreadId,
      previewOnly: true,
      metadata: { ...(body?.metadata || {}), task_bundle: bundleMeta },
    }));
    if (data?.answer) finalAnswerParts.push(String(data.answer));
  }

  if (selectedCapabilitySet.has('process_operation')) {
    const data = await runStep('process_operation', handleProcessOperationFromPrompt(supabaseUrl, serviceRoleKey, authContext, {
      ...body,
      action: 'process_operation_from_prompt',
      message: sharedPrompt,
      inputKind: 'task_bundle',
      file: firstFile,
      threadId: workingThreadId,
      previewOnly: true,
      metadata: { ...(body?.metadata || {}), task_bundle: bundleMeta },
    }));
    if (data?.answer) finalAnswerParts.push(String(data.answer));
  }

  if (selectedCapabilitySet.has('document_generation')) {
    const documentPrompt = [
      'بر اساس تحلیل مشترک و ورودی‌های همین باندل، یک فایل کاربردی و رسمی بساز.',
      'اگر موضوع، سند پرداخت/رسید/هزینه است، جدول داده‌های استخراج‌شده، ابهام‌ها و پیشنهاد ثبت را هم بیاور.',
      sharedPrompt,
    ].join('\n\n');
    const data = await runStep('document_generation', handleGenerateDocument(supabaseUrl, serviceRoleKey, authContext, {
      ...body,
      action: 'generate_document',
      message: documentPrompt,
      prompt: documentPrompt,
      inputKind: 'task_bundle_document',
      threadId: workingThreadId,
      metadata: { ...(body?.metadata || {}), task_bundle: bundleMeta },
    }));
    if (data?.answer) finalAnswerParts.push(String(data.answer));
  }

  if (!collectedResults.length) {
    const data = await runStep('chat', handleChat(supabaseUrl, serviceRoleKey, authContext, {
      ...body,
      action: 'chat',
      message: sharedPrompt || prompt,
      inputKind: 'task_bundle',
      threadId: workingThreadId,
      metadata: { ...(body?.metadata || {}), task_bundle: bundleMeta },
    }));
    if (data?.answer) finalAnswerParts.push(String(data.answer));
  }

  if (workingThreadId) {
    const threadForPatch = await fetchThreadForRead(supabaseUrl, serviceRoleKey, authContext, workingThreadId);
    const taskContext = {
      summary: analysisText || sharedPrompt.slice(0, 4000),
      last_prompt: baseMessage || null,
      capabilities: selectedCapabilities,
      inputs: bundleMeta,
      updated_at: new Date().toISOString(),
    };
    await restPatch(supabaseUrl, serviceRoleKey, 'ai_threads', { id: `eq.${workingThreadId}`, org_id: `eq.${authContext.orgId}` }, {
      metadata: {
        ...(threadForPatch?.metadata || {}),
        task_bundle_context: taskContext,
        last_activity_kind: 'task_bundle',
        last_message_preview: (baseMessage || analysisText || 'باندل هوش مصنوعی').slice(0, 300),
        composer_preferences: buildThreadComposerPreferences(body, threadForPatch),
      },
      updated_at: new Date().toISOString(),
    }).catch(() => []);
  }

  const threadMessages = workingThreadId
    ? await fetchThreadMessages(supabaseUrl, serviceRoleKey, authContext, workingThreadId, 200)
    : [];

  return json(200, {
    success: true,
    threadId: workingThreadId,
    messageId: collectedResults[collectedResults.length - 1]?.messageId || null,
    answer: finalAnswerParts.filter(Boolean).join('\n\n') || 'نتیجه باندل آماده شد.',
    proposedAction,
    provider,
    model,
    usage,
    ledger,
    taskBundle: bundleMeta,
    results: collectedResults,
    messages: threadMessages.length ? threadMessages : collectedMessages,
  });
};

const PROCESS_TASK_CUSTOM_FIELDS_KEY = 'process_task_custom_fields';
const PROCESS_TASK_CUSTOM_FIELD_VALUES_KEY = 'process_task_custom_field_values';
const PROCESS_TASK_STATUS_OPTIONS_KEY = 'process_task_status_options';

const normalizeAiProcessStatus = (value: any) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (['todo', 'planned', 'in_progress', 'review', 'done', 'completed', 'blocked', 'canceled'].includes(normalized)) {
    if (normalized === 'completed') return 'done';
    return normalized;
  }
  return 'todo';
};

const normalizeAiProcessStageStatus = (value: any) => {
  const normalized = normalizeAiProcessStatus(value);
  return normalized === 'planned' || normalized === 'review' ? 'todo' : normalized;
};

const normalizeAiProcessAssignee = (value: any, orgPeopleContext: any) => {
  if (!value || typeof value !== 'object') return { assignee_id: null, assignee_role_id: null, assignee_type: null };
  const type = String(value?.type || value?.assignee_type || '').trim().toLowerCase();
  const id = normalizeId(value?.id || value?.user_id || value?.role_id);
  if (!id || !isUuid(id)) return { assignee_id: null, assignee_role_id: null, assignee_type: null };
  const roleIds = new Set((orgPeopleContext?.roles || []).map((row: any) => normalizeId(row?.id)).filter(Boolean));
  const userIds = new Set((orgPeopleContext?.users || []).map((row: any) => normalizeId(row?.id)).filter(Boolean));
  if (type === 'role' && roleIds.has(id)) return { assignee_id: null, assignee_role_id: id, assignee_type: 'role' };
  if (type === 'user' && userIds.has(id)) return { assignee_id: id, assignee_role_id: null, assignee_type: 'user' };
  if (roleIds.has(id)) return { assignee_id: null, assignee_role_id: id, assignee_type: 'role' };
  if (userIds.has(id)) return { assignee_id: id, assignee_role_id: null, assignee_type: 'user' };
  return { assignee_id: null, assignee_role_id: null, assignee_type: null };
};

const addDaysIso = (days: any) => {
  const amount = Number(days);
  if (!Number.isFinite(amount)) return null;
  const date = new Date();
  date.setDate(date.getDate() + Math.max(0, Math.min(365, Math.round(amount))));
  return date.toISOString();
};

const buildProcessTaskPayload = ({
  authContext,
  moduleId,
  recordId,
  processRun,
  stage,
  processRunStage,
  orgPeopleContext,
  sourceTemplateId = null,
}: {
  authContext: any;
  moduleId: string;
  recordId: string;
  processRun: any;
  stage: any;
  processRunStage?: any;
  orgPeopleContext: any;
  sourceTemplateId?: string | null;
}) => {
  const assignee = normalizeAiProcessAssignee(stage?.assignee || {
    id: stage?.assignee_user_id || stage?.default_assignee_id || stage?.assignee_role_id || stage?.default_assignee_role_id,
    type: stage?.assignee_role_id || stage?.default_assignee_role_id ? 'role' : 'user',
  }, orgPeopleContext);
  const customFields = Array.isArray(stage?.custom_fields)
    ? stage.custom_fields
    : Array.isArray(stage?.process_task_custom_fields)
      ? stage.process_task_custom_fields
      : Array.isArray(stage?.metadata?.[PROCESS_TASK_CUSTOM_FIELDS_KEY])
        ? stage.metadata[PROCESS_TASK_CUSTOM_FIELDS_KEY]
        : [];
  const customValues = stage?.custom_values && typeof stage.custom_values === 'object'
    ? stage.custom_values
    : stage?.metadata?.[PROCESS_TASK_CUSTOM_FIELD_VALUES_KEY] && typeof stage.metadata[PROCESS_TASK_CUSTOM_FIELD_VALUES_KEY] === 'object'
      ? stage.metadata[PROCESS_TASK_CUSTOM_FIELD_VALUES_KEY]
      : {};
  const statusOptions = Array.isArray(stage?.status_options)
    ? stage.status_options
    : Array.isArray(stage?.metadata?.[PROCESS_TASK_STATUS_OPTIONS_KEY])
      ? stage.metadata[PROCESS_TASK_STATUS_OPTIONS_KEY]
      : [];
  const processGroup = {
    id: normalizeId(processRun?.process_group_id || processRun?.id) || null,
    name: String(processRun?.process_name || '').trim() || null,
    template_id: normalizeId(processRun?.template_id || sourceTemplateId) || null,
    template_name: String(processRun?.template_name || '').trim() || null,
  };
  const processNodeKey = String(
    processRunStage?.process_node_key
    || processRunStage?.metadata?.process_node_key
    || stage?.process_node_key
    || stage?.metadata?.process_node_key
    || '',
  ).trim() || null;
  const processLaneKey = String(
    processRunStage?.process_lane_key
    || processRunStage?.metadata?.process_lane_key
    || stage?.process_lane_key
    || stage?.metadata?.process_lane_key
    || 'lane_1',
  ).trim() || 'lane_1';
  const processGraph = (
    processRunStage?.metadata?.process_graph
    || stage?.process_graph
    || stage?.metadata?.process_graph
    || null
  );
  return {
    org_id: authContext.orgId,
    name: String(stage?.name || stage?.stage_name || stage?.title || 'فعالیت فرآیند').trim() || 'فعالیت فرآیند',
    status: normalizeAiProcessStatus(stage?.task_status || stage?.status),
    priority: String(stage?.priority || 'medium').trim() || 'medium',
    description: String(stage?.description || stage?.metadata?.description || '').trim() || null,
    task_type: String(stage?.task_type || stage?.metadata?.task_type || 'فعالیت سازمانی').trim() || 'فعالیت سازمانی',
    due_date: stage?.due_date || stage?.due_at || addDaysIso(stage?.due_days),
    wage: numberFrom(stage?.wage, 0),
    weight: numberFrom(stage?.weight, 0),
    sort_order: Number(stage?.sort_order || 10),
    source_template_id: normalizeId(sourceTemplateId || processRun?.template_id || stage?.source_template_id) || null,
    source_stage_sort_order: Number(stage?.sort_order || processRunStage?.sort_order || 10),
    process_group_id: normalizeId(processRun?.process_group_id || processRun?.id) || null,
    process_run_id: normalizeId(processRun?.id) || null,
    process_run_stage_id: normalizeId(processRunStage?.id || stage?.process_run_stage_id) || null,
    process_node_key: processNodeKey,
    process_lane_key: processLaneKey,
    related_to_module: moduleId,
    source_module_id: moduleId,
    source_record_id: recordId,
    ...assignee,
    created_by: authContext.userId || null,
    updated_by: authContext.userId || null,
    recurrence_info: {
      ...(stage?.recurrence_info && typeof stage.recurrence_info === 'object' ? stage.recurrence_info : {}),
      task_type: String(stage?.task_type || stage?.metadata?.task_type || 'فعالیت سازمانی').trim() || 'فعالیت سازمانی',
      process_automation_rules: Array.isArray(stage?.automation_rules)
        ? stage.automation_rules
        : Array.isArray(stage?.metadata?.automation_rules)
          ? stage.metadata.automation_rules
          : [],
      process_target_module_ids: Array.isArray(stage?.process_target_module_ids) ? stage.process_target_module_ids : [moduleId],
      process_links: { [moduleId]: recordId },
      process_run_id: normalizeId(processRun?.id) || null,
      process_run_stage_id: normalizeId(processRunStage?.id || stage?.process_run_stage_id) || null,
      process_node_key: processNodeKey,
      process_lane_key: processLaneKey,
      process_graph: processGraph,
      process_group: processGroup,
      [PROCESS_TASK_CUSTOM_FIELDS_KEY]: customFields,
      [PROCESS_TASK_STATUS_OPTIONS_KEY]: statusOptions,
      [PROCESS_TASK_CUSTOM_FIELD_VALUES_KEY]: customValues,
    },
  };
};

const loadAiProcessContext = async (supabaseUrl: string, serviceRoleKey: string, authContext: any, pageContext: any) => {
  const moduleId = String(pageContext?.moduleId || '').trim();
  const recordId = normalizeId(pageContext?.recordId);
  const templateRows = await safeRestSelect(supabaseUrl, serviceRoleKey, 'process_templates', {
    org_id: `eq.${authContext.orgId}`,
    is_active: 'eq.true',
    select: 'id,module_id,name,description,process_kind,auto_copy_mode,created_at',
    order: 'updated_at.desc',
    limit: 80,
  });
  const relevantTemplates = (templateRows || []).filter((template: any) => {
    const templateModule = String(template?.module_id || '').trim();
    return !moduleId || templateModule === moduleId || templateModule === 'tasks' || templateModule === 'process_runs';
  }).slice(0, 30);
  const templateIds = relevantTemplates.map((template: any) => normalizeId(template?.id)).filter(isUuid);
  const templateStages = templateIds.length
    ? await safeRestSelect(supabaseUrl, serviceRoleKey, 'process_template_stages', {
        template_id: `in.(${templateIds.join(',')})`,
        select: 'id,template_id,stage_name,sort_order,default_status,default_assignee_id,default_assignee_role_id,auto_create_task,wage,metadata',
        order: 'sort_order.asc',
        limit: 300,
      })
    : [];
  const runs = moduleId && isUuid(recordId)
    ? await safeRestSelect(supabaseUrl, serviceRoleKey, 'process_runs', {
        org_id: `eq.${authContext.orgId}`,
        module_id: `eq.${moduleId}`,
        record_id: `eq.${recordId}`,
        select: 'id,template_id,module_id,record_id,process_name,status,copied_mode,started_at,process_group_id,created_at',
        order: 'created_at.desc',
        limit: 20,
      })
    : [];
  const runIds = runs.map((run: any) => normalizeId(run?.id)).filter(isUuid);
  const runStages = runIds.length
    ? await safeRestSelect(supabaseUrl, serviceRoleKey, 'process_run_stages', {
        process_run_id: `in.(${runIds.join(',')})`,
        select: 'id,process_run_id,template_stage_id,stage_name,sort_order,status,task_id,assignee_user_id,assignee_role_id,wage,metadata,planned_due_at,started_at,completed_at',
        order: 'sort_order.asc',
        limit: 400,
      })
    : [];
  const taskFilters: Promise<any[]>[] = [];
  if (moduleId && isUuid(recordId)) {
    taskFilters.push(safeRestSelect(supabaseUrl, serviceRoleKey, 'tasks', {
      org_id: `eq.${authContext.orgId}`,
      source_module_id: `eq.${moduleId}`,
      source_record_id: `eq.${recordId}`,
      select: 'id,name,status,task_type,priority,assignee_id,assignee_role_id,assignee_type,due_date,sort_order,process_group_id,process_run_id,process_run_stage_id,source_template_id,source_stage_sort_order,recurrence_info',
      order: 'sort_order.asc',
      limit: 300,
    }));
  }
  if (runIds.length) {
    taskFilters.push(safeRestSelect(supabaseUrl, serviceRoleKey, 'tasks', {
      org_id: `eq.${authContext.orgId}`,
      process_run_id: `in.(${runIds.join(',')})`,
      select: 'id,name,status,task_type,priority,assignee_id,assignee_role_id,assignee_type,due_date,sort_order,process_group_id,process_run_id,process_run_stage_id,source_template_id,source_stage_sort_order,recurrence_info',
      order: 'sort_order.asc',
      limit: 300,
    }));
  }
  const taskRows = (await Promise.all(taskFilters)).flat();
  const tasks = Array.from(new Map(taskRows.map((task: any) => [normalizeId(task?.id), task])).values()).filter((task: any) => task?.id);
  const stagesByTemplateId = new Map<string, any[]>();
  templateStages.forEach((stage: any) => {
    const key = normalizeId(stage?.template_id);
    stagesByTemplateId.set(key, [...(stagesByTemplateId.get(key) || []), stage]);
  });
  const stagesByRunId = new Map<string, any[]>();
  runStages.forEach((stage: any) => {
    const key = normalizeId(stage?.process_run_id);
    stagesByRunId.set(key, [...(stagesByRunId.get(key) || []), stage]);
  });
  return {
    templates: relevantTemplates.map((template: any) => ({
      ...template,
      stages: (stagesByTemplateId.get(normalizeId(template?.id)) || []).slice(0, 30),
    })),
    runs: runs.map((run: any) => ({
      ...run,
      stages: (stagesByRunId.get(normalizeId(run?.id)) || []).slice(0, 40),
    })),
    tasks,
  };
};

const buildAiProcessOperationPrompt = (input: any) => [
  'شما دستیار اجرای فرآیند تازه سیستم هستید. فقط JSON معتبر برگردان و هیچ توضیح خارج از JSON ننویس.',
  'فقط از operationهای مجاز استفاده کن و هیچ UUID تازه یا ساختگی نساز.',
  'اگر باید از الگوی موجود استفاده شود، template_id باید دقیقاً یکی از templateهای context باشد.',
  'اگر باید روی اجرای موجود کار شود، process_run_id و stage_id باید دقیقاً از context باشد.',
  'اگر درخواست کاربر برای اجرای دقیق فرآیند یا ساخت فعالیت کافی نیست، عملیات نساز؛ needs_clarification=true و questions بده.',
  'سوال‌ها باید بر اساس هدف کاربر و مسیر واقعی فرآیند باشد، نه فقط فیلدهای اجباری.',
  'حذف مرحله واقعی مجاز نیست؛ برای حذف/کم کردن مرحله واقعی از cancel_stage_task استفاده کن.',
  'برای ساخت فرآیند خام، stages را کامل و مرتب بده. وضعیت فعالیت باید یکی از todo/planned/in_progress/review/done/canceled باشد.',
  'برای وضعیت‌ها و فیلدهای اختصاصی هر فعالیت، از status_options و custom_fields/custom_values داخل stage استفاده کن؛ فیلدهای عمومی فعالیت مثل status، task_type، due_date، start_date و completed_at را هم جداگانه در نظر بگیر.',
  'process_context شامل templates، runs، stages و tasks مجاز همین رکورد است. ترتیب فعالیت‌ها را از sort_order/source_stage_sort_order بخوان و بدون داده واقعی حدس نزن.',
  'شرط‌های اجرای اتوماسیون‌ها conditions_all و conditions_any هستند؛ همه شرط‌ها را قبل از پیشنهاد اکشن بررسی کن و اگر شرط نامشخص است، آن را به‌عنوان ابهام برگردان.',
  'اکشن‌های اجرای اتوماسیون‌ها در automation_rules.actions هستند؛ نوع اکشن، گیرنده‌ها، پیام/یادداشت/فیلد هدف و تنظیمات زمان‌بندی یا تاخیر را حفظ کن و در operationهای پیشنهادی از دست نده.',
  'زمان‌ها و موعدها را از due_date، planned_due_at، started_at، completed_at، duration_value، duration_unit و duration_from بخوان.',
  '',
  'operationهای مجاز:',
  '- materialize_template_to_tasks: کپی الگوی موجود و ساخت task واقعی برای مرحله‌ها',
  '- create_raw_process_with_tasks: ساخت فرآیند خام و task واقعی بر اساس پرامپت',
  '- add_stage_task: افزودن مرحله/task به اجرای موجود یا رکورد جاری',
  '- update_stage_task: ویرایش task/stage موجود',
  '- cancel_stage_task: لغو مرحله/task موجود',
  '',
  'قالب خروجی:',
  '{"reply":"پیام کوتاه فارسی","needs_clarification":false,"questions":[],"operations":[{"type":"create_raw_process_with_tasks","process_name":"...","stages":[{"name":"...","sort_order":10,"task_type":"فعالیت سازمانی","status":"todo","due_days":2,"assignee":{"type":"role","id":"..."}, "custom_fields":[], "custom_values":{}, "status_options":[], "automation_rules":[]}]}]}',
  '',
  JSON.stringify(input),
].join('\n');

const executeAiProcessOperation = async (
  supabaseUrl: string,
  serviceRoleKey: string,
  authContext: any,
  pageContext: any,
  operation: any,
  processContext: any,
  orgPeopleContext: any,
) => {
  const type = String(operation?.type || '').trim();
  const moduleId = String(operation?.module_id || pageContext?.moduleId || '').trim();
  const recordId = normalizeId(operation?.record_id || pageContext?.recordId);
  if (!moduleId || !isUuid(recordId)) throw new Error('رکورد مقصد فرآیند مشخص نیست.');
  const modulePerm = getModulePermission(authContext.permissions, moduleId);
  const taskPerm = getModulePermission(authContext.permissions, 'tasks');
  if (!canViewModule(modulePerm) || !canCreateModule(taskPerm)) {
    throw new Error('دسترسی ایجاد یا تغییر فعالیت‌های فرآیند را ندارید.');
  }

  if (type === 'materialize_template_to_tasks') {
    const templateId = normalizeId(operation?.template_id);
    const template = (processContext.templates || []).find((item: any) => normalizeId(item?.id) === templateId);
    if (!template) throw new Error('الگوی فرآیند مجاز پیدا نشد.');
    const processName = String(operation?.process_name || template.name || '').trim() || 'فرآیند';
    const runIdResult = await restRpc(supabaseUrl, serviceRoleKey, 'create_process_run_from_template', {
      p_org_id: authContext.orgId,
      p_template_id: templateId,
      p_module_id: moduleId,
      p_record_id: recordId,
      p_process_name: processName,
      p_copied_mode: 'auto',
    });
    const processRunId = Array.isArray(runIdResult) ? normalizeId(runIdResult[0]) : normalizeId(runIdResult);
    if (!isUuid(processRunId)) throw new Error('اجرای فرآیند ساخته نشد.');
    const runRows = await restSelect(supabaseUrl, serviceRoleKey, 'process_runs', {
      id: `eq.${processRunId}`,
      org_id: `eq.${authContext.orgId}`,
      select: 'id,template_id,module_id,record_id,process_name,status,process_group_id',
      limit: 1,
    });
    const processRun = runRows[0] || { id: processRunId, template_id: templateId, process_name: processName };
    const stageRows = await restSelect(supabaseUrl, serviceRoleKey, 'process_run_stages', {
      process_run_id: `eq.${processRunId}`,
      select: 'id,process_run_id,template_stage_id,stage_name,sort_order,status,assignee_user_id,assignee_role_id,wage,metadata',
      order: 'sort_order.asc',
      limit: 200,
    });
    const createdTasks: any[] = [];
    for (const runStage of stageRows) {
      if (runStage?.task_id) continue;
      const templateStage = (template.stages || []).find((stage: any) => normalizeId(stage?.id) === normalizeId(runStage?.template_stage_id)) || {};
      if (templateStage?.auto_create_task === false && operation?.force !== true) continue;
      const payload = buildProcessTaskPayload({
        authContext,
        moduleId,
        recordId,
        processRun,
        processRunStage: runStage,
        stage: { ...templateStage, ...runStage, name: runStage.stage_name },
        orgPeopleContext,
        sourceTemplateId: templateId,
      });
      const taskRows = await restInsert(supabaseUrl, serviceRoleKey, 'tasks', [payload]);
      const task = taskRows[0] || null;
      if (task?.id) {
        createdTasks.push({ id: task.id, title: buildAiRecordTitle(task, payload.name), stage_id: runStage.id });
        await restPatch(supabaseUrl, serviceRoleKey, 'process_run_stages', { id: `eq.${runStage.id}` }, {
          task_id: task.id,
          status: normalizeAiProcessStageStatus(task.status),
          updated_at: new Date().toISOString(),
        }).catch(() => []);
      }
    }
    return { type, process_run_id: processRunId, created_tasks: createdTasks, title: processName };
  }

  if (type === 'create_raw_process_with_tasks') {
    const processName = String(operation?.process_name || 'فرآیند هوش مصنوعی').trim() || 'فرآیند هوش مصنوعی';
    const processGroupId = `ai_process_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const processRows = await restInsert(supabaseUrl, serviceRoleKey, 'process_runs', [{
      org_id: authContext.orgId,
      template_id: null,
      module_id: moduleId,
      record_id: recordId,
      process_name: processName,
      status: 'active',
      copied_mode: 'auto',
      started_at: new Date().toISOString(),
      process_group_id: processGroupId,
      created_by: authContext.userId || null,
      updated_by: authContext.userId || null,
    }]);
    const processRun = processRows[0];
    if (!processRun?.id) throw new Error('اجرای فرآیند خام ساخته نشد.');
    const inputStages = Array.isArray(operation?.stages) ? operation.stages : [];
    const createdTasks: any[] = [];
    for (const [index, inputStage] of inputStages.entries()) {
      const stageName = String(inputStage?.name || inputStage?.stage_name || `مرحله ${index + 1}`).trim() || `مرحله ${index + 1}`;
      const assignee = normalizeAiProcessAssignee(inputStage?.assignee, orgPeopleContext);
      const stageRows = await restInsert(supabaseUrl, serviceRoleKey, 'process_run_stages', [{
        process_run_id: processRun.id,
        template_stage_id: null,
        stage_name: stageName,
        sort_order: Number(inputStage?.sort_order || ((index + 1) * 10)),
        status: normalizeAiProcessStageStatus(inputStage?.status),
        assignee_user_id: assignee.assignee_id,
        assignee_role_id: assignee.assignee_role_id,
        wage: numberFrom(inputStage?.wage, 0),
        metadata: {
          ...(inputStage?.metadata && typeof inputStage.metadata === 'object' ? inputStage.metadata : {}),
          source: 'ai_process_operation',
          process_group_id: processGroupId,
          task_type: String(inputStage?.task_type || 'فعالیت سازمانی').trim() || 'فعالیت سازمانی',
          automation_rules: Array.isArray(inputStage?.automation_rules) ? inputStage.automation_rules : [],
          [PROCESS_TASK_CUSTOM_FIELDS_KEY]: Array.isArray(inputStage?.custom_fields) ? inputStage.custom_fields : [],
          [PROCESS_TASK_STATUS_OPTIONS_KEY]: Array.isArray(inputStage?.status_options) ? inputStage.status_options : [],
          [PROCESS_TASK_CUSTOM_FIELD_VALUES_KEY]: inputStage?.custom_values && typeof inputStage.custom_values === 'object' ? inputStage.custom_values : {},
        },
      }]);
      const processRunStage = stageRows[0] || null;
      const payload = buildProcessTaskPayload({
        authContext,
        moduleId,
        recordId,
        processRun,
        processRunStage,
        stage: { ...inputStage, name: stageName, process_group_id: processGroupId },
        orgPeopleContext,
      });
      const taskRows = await restInsert(supabaseUrl, serviceRoleKey, 'tasks', [payload]);
      const task = taskRows[0] || null;
      if (task?.id) {
        createdTasks.push({ id: task.id, title: buildAiRecordTitle(task, payload.name), stage_id: processRunStage?.id || null });
        if (processRunStage?.id) {
          await restPatch(supabaseUrl, serviceRoleKey, 'process_run_stages', { id: `eq.${processRunStage.id}` }, {
            task_id: task.id,
            status: normalizeAiProcessStageStatus(task.status),
            updated_at: new Date().toISOString(),
          }).catch(() => []);
        }
      }
    }
    return { type, process_run_id: processRun.id, created_tasks: createdTasks, title: processName };
  }

  if (type === 'add_stage_task') {
    const runId = normalizeId(operation?.process_run_id);
    const run = runId
      ? (processContext.runs || []).find((item: any) => normalizeId(item?.id) === runId)
      : (processContext.runs || [])[0];
    if (!run?.id) {
      return await executeAiProcessOperation(supabaseUrl, serviceRoleKey, authContext, pageContext, {
        type: 'create_raw_process_with_tasks',
        process_name: operation?.process_name || 'فرآیند هوش مصنوعی',
        stages: [operation?.stage || operation],
      }, processContext, orgPeopleContext);
    }
    const existingSorts = (run.stages || []).map((stage: any) => Number(stage?.sort_order || 0));
    const nextSort = Number(operation?.stage?.sort_order || operation?.sort_order || (Math.max(0, ...existingSorts) + 10));
    const stage = { ...(operation?.stage || operation), sort_order: nextSort };
    const assignee = normalizeAiProcessAssignee(stage?.assignee, orgPeopleContext);
    const stageRows = await restInsert(supabaseUrl, serviceRoleKey, 'process_run_stages', [{
      process_run_id: run.id,
      stage_name: String(stage?.name || stage?.stage_name || 'مرحله جدید').trim() || 'مرحله جدید',
      sort_order: nextSort,
      status: normalizeAiProcessStageStatus(stage?.status),
      assignee_user_id: assignee.assignee_id,
      assignee_role_id: assignee.assignee_role_id,
      wage: numberFrom(stage?.wage, 0),
      metadata: { ...(stage?.metadata || {}), source: 'ai_process_operation', process_group_id: run.process_group_id || run.id },
    }]);
    const processRunStage = stageRows[0] || null;
    const taskRows = await restInsert(supabaseUrl, serviceRoleKey, 'tasks', [buildProcessTaskPayload({
      authContext,
      moduleId,
      recordId,
      processRun: run,
      processRunStage,
      stage,
      orgPeopleContext,
      sourceTemplateId: run.template_id || null,
    })]);
    const task = taskRows[0] || null;
    if (task?.id && processRunStage?.id) {
      await restPatch(supabaseUrl, serviceRoleKey, 'process_run_stages', { id: `eq.${processRunStage.id}` }, { task_id: task.id, updated_at: new Date().toISOString() }).catch(() => []);
    }
    return { type, process_run_id: run.id, created_tasks: task?.id ? [{ id: task.id, title: buildAiRecordTitle(task, task.name), stage_id: processRunStage?.id || null }] : [] };
  }

  if (type === 'update_stage_task') {
    const taskId = normalizeId(operation?.task_id);
    const stageId = normalizeId(operation?.stage_id || operation?.process_run_stage_id);
    const task = taskId
      ? (processContext.tasks || []).find((item: any) => normalizeId(item?.id) === taskId)
      : stageId
        ? (processContext.tasks || []).find((item: any) => normalizeId(item?.process_run_stage_id) === stageId)
        : null;
    if (!task?.id) throw new Error('فعالیت قابل ویرایش در context پیدا نشد.');
    const patch: Record<string, any> = { updated_at: new Date().toISOString() };
    if (operation?.name || operation?.title) patch.name = String(operation.name || operation.title).trim();
    if (operation?.status) patch.status = normalizeAiProcessStatus(operation.status);
    if (operation?.description !== undefined) patch.description = String(operation.description || '').trim() || null;
    if (operation?.due_date || operation?.due_days !== undefined) patch.due_date = operation.due_date || addDaysIso(operation.due_days);
    if (operation?.assignee) Object.assign(patch, normalizeAiProcessAssignee(operation.assignee, orgPeopleContext));
    if (operation?.custom_values && typeof operation.custom_values === 'object') {
      const recurrence = task.recurrence_info && typeof task.recurrence_info === 'object' ? task.recurrence_info : {};
      patch.recurrence_info = {
        ...recurrence,
        [PROCESS_TASK_CUSTOM_FIELD_VALUES_KEY]: {
          ...(recurrence?.[PROCESS_TASK_CUSTOM_FIELD_VALUES_KEY] || {}),
          ...operation.custom_values,
        },
      };
    }
    await restPatch(supabaseUrl, serviceRoleKey, 'tasks', { id: `eq.${task.id}`, org_id: `eq.${authContext.orgId}` }, patch);
    if (task.process_run_stage_id) {
      await restPatch(supabaseUrl, serviceRoleKey, 'process_run_stages', { id: `eq.${task.process_run_stage_id}` }, {
        status: normalizeAiProcessStageStatus(patch.status || task.status),
        task_id: task.id,
        updated_at: new Date().toISOString(),
      }).catch(() => []);
    }
    return { type, updated_task_id: task.id, title: patch.name || task.name };
  }

  if (type === 'cancel_stage_task') {
    const taskId = normalizeId(operation?.task_id);
    const stageId = normalizeId(operation?.stage_id || operation?.process_run_stage_id);
    const task = taskId
      ? (processContext.tasks || []).find((item: any) => normalizeId(item?.id) === taskId)
      : stageId
        ? (processContext.tasks || []).find((item: any) => normalizeId(item?.process_run_stage_id) === stageId)
        : null;
    if (!task?.id && !stageId) throw new Error('مرحله یا فعالیت قابل لغو پیدا نشد.');
    if (task?.id) {
      await restPatch(supabaseUrl, serviceRoleKey, 'tasks', { id: `eq.${task.id}`, org_id: `eq.${authContext.orgId}` }, {
        status: 'canceled',
        updated_at: new Date().toISOString(),
      });
    }
    const targetStageId = stageId || normalizeId(task?.process_run_stage_id);
    if (targetStageId) {
      await restPatch(supabaseUrl, serviceRoleKey, 'process_run_stages', { id: `eq.${targetStageId}` }, {
        status: 'canceled',
        updated_at: new Date().toISOString(),
      }).catch(() => []);
    }
    return { type, canceled_task_id: task?.id || null, canceled_stage_id: targetStageId || null };
  }

  throw new Error(`اقدام فرآیندی ${type || 'نامشخص'} پشتیبانی نمی‌شود.`);
};

const handleProcessOperationFromPrompt = async (supabaseUrl: string, serviceRoleKey: string, authContext: any, body: any) => {
  const prompt = String(body?.message || body?.prompt || '').trim();
  if (!prompt) return json(400, { success: false, message: 'متن اقدام فرآیندی خالی است.' });
  const file = body?.file || body?.attachment || null;
  const filePrompt = file ? [
    prompt,
    '',
    `فایل پیوست: ${String(file?.filename || file?.fileName || file?.name || 'فایل پیوست').trim() || 'فایل پیوست'}`,
    String(file?.text || '').trim() ? `محتوای فایل:\n${String(file.text).trim()}` : '',
  ].filter(Boolean).join('\n') : prompt;
  const rawContext = normalizeContext(body?.context || {});
  const pageContext = await buildPermittedPageContext(supabaseUrl, serviceRoleKey, authContext, rawContext);
  if (!pageContext.permitted || !pageContext.moduleId || !pageContext.recordId) {
    return json(403, { success: false, message: 'برای اجرای اقدام فرآیندی باید روی رکورد قابل دسترس باشید.' });
  }
  const processPerm = getModulePermission(authContext.permissions, 'process_runs');
  const taskPerm = getModulePermission(authContext.permissions, 'tasks');
  if (!canViewModule(processPerm) || !canCreateModule(taskPerm)) {
    return json(403, { success: false, message: 'دسترسی لازم برای مدیریت فرآیند و فعالیت‌ها را ندارید.' });
  }
  const capability = String(body?.capability || 'workflow_ai_prompt').trim() || 'workflow_ai_prompt';
  const providerConfig = await resolveProviderConfig(supabaseUrl, serviceRoleKey, authContext, capability, { modelOverride: body?.modelOverride });
  await assertAiCapabilityEnabled(supabaseUrl, serviceRoleKey, authContext, providerConfig.orgAiSettings, capability);
  const [processContext, orgPeopleContext, companyContext] = await Promise.all([
    loadAiProcessContext(supabaseUrl, serviceRoleKey, authContext, pageContext),
    loadOrgPeopleContext(supabaseUrl, serviceRoleKey, authContext, filePrompt),
    loadCompanyContext(supabaseUrl, serviceRoleKey, authContext),
  ]);
  const contextKey = buildContextKey(rawContext);
  const thread = await ensureThread(supabaseUrl, serviceRoleKey, authContext, {
    threadId: body?.threadId || null,
    title: `اقدام فرآیندی: ${prompt}`.slice(0, 90),
    pageContext,
    contextKey,
    provider: providerConfig.provider,
    model: providerConfig.model,
    forceNew: body?.forceNewThread === true,
  });
  const userMessage = await insertAiMessage(supabaseUrl, serviceRoleKey, authContext, {
    thread_id: thread.id,
    role: 'user',
    content: filePrompt,
    provider: providerConfig.provider,
    model: providerConfig.model,
    metadata: {
      input_kind: String(body?.inputKind || body?.input_kind || (file ? 'file' : 'process_operation')).trim() || 'process_operation',
      context_key: contextKey,
      context: pageContext.context,
      file: file ? {
        filename: file?.filename || file?.fileName || file?.name || null,
        mime_type: file?.mimeType || file?.mime_type || null,
        size: file?.size || null,
        asset_id: file?.assetId || file?.asset_id || null,
        entry_id: file?.entryId || file?.entry_id || null,
      } : null,
    },
  });
  const processPrompt = buildAiProcessOperationPrompt({
    request: filePrompt,
    company: companyContext,
    current: {
      module_id: pageContext.moduleId,
      record_id: pageContext.recordId,
      summary: pageContext.summary,
      record: pageContext.records?.[0] || null,
    },
    people: {
      roles: (orgPeopleContext.roles || []).slice(0, 60),
      users: (orgPeopleContext.users || []).slice(0, 120),
    },
    process_context: processContext,
  });
  const aiResult = await callChatCompletions(providerConfig, [
    {
      role: 'user',
      content: file && !String(file?.text || '').trim()
        ? buildOpenAiInputContentParts(processPrompt, file)
        : processPrompt,
    },
  ], {
    safetyIdentifier: `org_${authContext.orgId}_user_${authContext.userId}_cap_${capability}_process_operation`,
  });
  const parsed = extractJsonObjectFromText(aiResult.content) || {};
  const clarificationQuestions = normalizeAiClarificationQuestions(parsed?.questions);
  const needsClarification = parsed?.needs_clarification === true || parsed?.needsClarification === true || clarificationQuestions.length > 0;
  const operations = !needsClarification && Array.isArray(parsed?.operations) ? parsed.operations : [];
  if (operations.length === 0) {
    const reply = buildAiClarificationReply(String(parsed?.reply || '').trim() || 'برای اجرای دقیق این اقدام فرآیندی به اطلاعات بیشتری نیاز دارم.', clarificationQuestions);
    const assistantMessage = await insertAiMessage(supabaseUrl, serviceRoleKey, authContext, {
      thread_id: thread.id,
      role: 'assistant',
      content: reply,
      provider: aiResult.provider,
      model: aiResult.model,
      metadata: {
        action: 'process_operation_from_prompt',
        capability,
        context_key: contextKey,
        usage: aiResult.usageMetadata,
        avalai_request_id: aiResult.requestId || null,
        raw_ai_json: parsed,
        needs_clarification: needsClarification,
      },
    });
    const ledger = await recordAiUsageLedger(supabaseUrl, serviceRoleKey, authContext, {
      threadId: thread.id,
      messageId: assistantMessage?.id || null,
      requestId: aiResult.requestId,
      capability,
      provider: aiResult.provider,
      model: aiResult.model,
      usageMetadata: aiResult.usageMetadata,
      metadata: { source: 'process_operation_clarification', context_key: contextKey },
    });
    await patchAiMessageCustomerBilling(supabaseUrl, serviceRoleKey, authContext, assistantMessage, aiResult.usageMetadata, ledger);
    await restPatch(supabaseUrl, serviceRoleKey, 'ai_threads', { id: `eq.${thread.id}`, org_id: `eq.${authContext.orgId}` }, {
      updated_at: new Date().toISOString(),
      provider: aiResult.provider,
      model: aiResult.model,
      metadata: {
        ...(thread?.metadata || {}),
        route: pageContext.context?.route || null,
        summary: pageContext.summary || null,
        context_kind: getContextKind(pageContext.context || {}),
        context_label: buildThreadContextLabel(pageContext),
        context: pageContext.context || null,
        module_id: pageContext.moduleId || null,
        record_id: pageContext.recordId || null,
        last_activity_kind: 'process_operation_clarification',
        last_message_preview: prompt.slice(0, 300),
      },
    });
    return json(200, {
      success: true,
      threadId: thread.id,
      userMessageId: userMessage?.id || null,
      messageId: assistantMessage?.id || null,
      answer: reply,
      provider: aiResult.provider,
      model: aiResult.model,
      usage: withCustomerBilling(aiResult.usageMetadata, ledger),
    });
  }
  const reply = String(parsed?.reply || '').trim() || 'اقدام‌های فرآیندی اجرا شد.';
  const previewOnly = body?.previewOnly === true || body?.preview_only === true || body?.autoExecute === false || body?.auto_execute === false;
  if (previewOnly) {
    const assistantMessage = await insertAiMessage(supabaseUrl, serviceRoleKey, authContext, {
      thread_id: thread.id,
      role: 'assistant',
      content: `${reply}\n\nبرای اجرای این اقدام، تایید کاربر لازم است.`,
      provider: aiResult.provider,
      model: aiResult.model,
      metadata: {
        action: 'process_operation_from_prompt',
        capability,
        context_key: contextKey,
        usage: aiResult.usageMetadata,
        avalai_request_id: aiResult.requestId || null,
        proposed_operations: operations,
        raw_ai_json: parsed,
        requires_confirmation: true,
      },
    });
    const actionRows = await restInsert(supabaseUrl, serviceRoleKey, 'ai_action_logs', [{
      org_id: authContext.orgId,
      thread_id: thread.id,
      message_id: assistantMessage?.id || null,
      module_id: pageContext.moduleId,
      record_id: pageContext.recordId,
      action_type: 'process_operation_from_prompt',
      status: 'proposed',
      proposed_payload: {
        prompt,
        reply,
        operations,
        context: pageContext.context || null,
        module_id: pageContext.moduleId,
        record_id: pageContext.recordId,
      },
      result_payload: { model: aiResult.model, preview_only: true },
      avalai_request_id: aiResult.requestId || null,
      created_by: authContext.userId || null,
    }]);
    const proposedAction = actionRows[0] || null;
    const ledger = await recordAiUsageLedger(supabaseUrl, serviceRoleKey, authContext, {
      threadId: thread.id,
      messageId: assistantMessage?.id || null,
      requestId: aiResult.requestId,
      capability,
      provider: aiResult.provider,
      model: aiResult.model,
      usageMetadata: aiResult.usageMetadata,
      metadata: { source: 'process_operation_preview', context_key: contextKey, operation_count: operations.length },
    });
    await patchAiMessageCustomerBilling(supabaseUrl, serviceRoleKey, authContext, assistantMessage, aiResult.usageMetadata, ledger);
    await restPatch(supabaseUrl, serviceRoleKey, 'ai_threads', { id: `eq.${thread.id}`, org_id: `eq.${authContext.orgId}` }, {
      updated_at: new Date().toISOString(),
      provider: aiResult.provider,
      model: aiResult.model,
      metadata: {
        ...(thread?.metadata || {}),
        route: pageContext.context?.route || null,
        summary: pageContext.summary || null,
        context_kind: getContextKind(pageContext.context || {}),
        context_label: buildThreadContextLabel(pageContext),
        context: pageContext.context || null,
        module_id: pageContext.moduleId || null,
        record_id: pageContext.recordId || null,
        last_activity_kind: 'process_operation_preview',
        last_message_preview: prompt.slice(0, 300),
        last_action_log_id: proposedAction?.id || null,
      },
    });
    return json(200, {
      success: true,
      threadId: thread.id,
      userMessageId: userMessage?.id || null,
      messageId: assistantMessage?.id || null,
      answer: `${reply}\n\nبرای اجرای این اقدام، تایید کاربر لازم است.`,
      proposedAction: {
        id: proposedAction?.id || null,
        actionType: 'process_operation_from_prompt',
        moduleId: pageContext.moduleId,
        recordId: pageContext.recordId,
        operations,
        status: 'proposed',
      },
      operations,
      provider: aiResult.provider,
      model: aiResult.model,
      usage: withCustomerBilling(aiResult.usageMetadata, ledger),
    });
  }

  const executed: any[] = [];
  for (const operation of operations.slice(0, 8)) {
    executed.push(await executeAiProcessOperation(supabaseUrl, serviceRoleKey, authContext, pageContext, operation, processContext, orgPeopleContext));
  }
  const assistantMessage = await insertAiMessage(supabaseUrl, serviceRoleKey, authContext, {
    thread_id: thread.id,
    role: 'assistant',
    content: reply,
    provider: aiResult.provider,
    model: aiResult.model,
    metadata: {
      action: 'process_operation_from_prompt',
      capability,
      context_key: contextKey,
      usage: aiResult.usageMetadata,
      avalai_request_id: aiResult.requestId || null,
      operations: executed,
      raw_ai_json: parsed,
    },
  });
  const ledger = await recordAiUsageLedger(supabaseUrl, serviceRoleKey, authContext, {
    threadId: thread.id,
    messageId: assistantMessage?.id || null,
    requestId: aiResult.requestId,
    capability,
    provider: aiResult.provider,
    model: aiResult.model,
    usageMetadata: aiResult.usageMetadata,
    metadata: { source: 'process_operation_from_prompt', context_key: contextKey, operation_count: executed.length },
  });
  await patchAiMessageCustomerBilling(supabaseUrl, serviceRoleKey, authContext, assistantMessage, aiResult.usageMetadata, ledger);
  await restInsert(supabaseUrl, serviceRoleKey, 'ai_action_logs', [{
    org_id: authContext.orgId,
    thread_id: thread.id,
    message_id: assistantMessage?.id || null,
    module_id: pageContext.moduleId,
    record_id: pageContext.recordId,
    action_type: 'process_operation_from_prompt',
    status: 'executed',
    proposed_payload: { prompt, raw_operations: operations },
    result_payload: { reply, operations: executed, model: aiResult.model },
    avalai_request_id: aiResult.requestId || null,
    created_by: authContext.userId || null,
    executed_at: new Date().toISOString(),
  }]).catch((error: any) => console.warn('AI process operation log skipped', error));
  await restPatch(supabaseUrl, serviceRoleKey, 'ai_threads', { id: `eq.${thread.id}`, org_id: `eq.${authContext.orgId}` }, {
    updated_at: new Date().toISOString(),
    provider: aiResult.provider,
    model: aiResult.model,
    context_type: getContextKind(pageContext.context || {}),
    module_id: pageContext.moduleId || null,
    record_id: pageContext.recordId || null,
    metadata: {
      ...(thread?.metadata || {}),
      route: pageContext.context?.route || null,
      summary: pageContext.summary || null,
      context_kind: getContextKind(pageContext.context || {}),
      context_label: buildThreadContextLabel(pageContext),
      context: pageContext.context || null,
      module_id: pageContext.moduleId || null,
      record_id: pageContext.recordId || null,
      last_activity_kind: 'process_operation',
      last_message_preview: prompt.slice(0, 300),
      last_process_operations: executed,
    },
  });
  return json(200, {
    success: true,
    threadId: thread.id,
    userMessageId: userMessage?.id || null,
    messageId: assistantMessage?.id || null,
    answer: reply,
    operations: executed,
    provider: aiResult.provider,
    model: aiResult.model,
    usage: withCustomerBilling(aiResult.usageMetadata, ledger),
    ledger,
  });
};

const handleTranscribeVoice = async (supabaseUrl: string, serviceRoleKey: string, authContext: any, body: any) => {
  const audio = body?.audio || {};
  const audioBase64 = String(audio?.data || body?.audioBase64 || body?.audio_base64 || '').trim();
  if (!audioBase64) return json(400, { success: false, message: 'فایل صوتی ارسال نشده است.' });
  const providerConfig = await resolveProviderConfig(supabaseUrl, serviceRoleKey, authContext, 'voice_input');
  await assertAiCapabilityEnabled(supabaseUrl, serviceRoleKey, authContext, providerConfig.orgAiSettings, 'voice_input');
  const result = await callAudioTranscription(
    providerConfig,
    audioBase64,
    String(audio?.mimeType || audio?.mime_type || body?.mimeType || 'audio/webm'),
    String(audio?.filename || body?.filename || 'voice.webm'),
  );
  const ledger = await recordAiUsageLedger(supabaseUrl, serviceRoleKey, authContext, {
    capability: 'voice_input',
    provider: result.provider,
    model: result.model,
    requestId: result.requestId,
    usageMetadata: result.usageMetadata,
    metadata: {
      source: 'voice_transcription',
      mime_type: String(audio?.mimeType || audio?.mime_type || body?.mimeType || 'audio/webm'),
      duration_ms: numberFrom(audio?.durationMs || audio?.duration_ms || body?.durationMs, 0),
    },
  });
  return json(200, {
    success: true,
    transcript: result.transcript,
    provider: result.provider,
    model: result.model,
    usage: result.usageMetadata,
    ledger,
  });
};

const handleGenerateVoiceOutput = async (supabaseUrl: string, serviceRoleKey: string, authContext: any, body: any) => {
  const text = String(body?.text || body?.prompt || body?.message || '').trim();
  if (!text) return json(400, { success: false, message: 'متن تولید صدا خالی است.' });
  const rawContext = normalizeContext(body?.context || {});
  const contextKey = buildContextKey(rawContext);
  const providerConfig = await resolveProviderConfig(supabaseUrl, serviceRoleKey, authContext, 'voice_output', { modelOverride: body?.modelOverride });
  await assertAiCapabilityEnabled(supabaseUrl, serviceRoleKey, authContext, providerConfig.orgAiSettings, 'voice_output');
  const pageContext = await buildPermittedPageContext(supabaseUrl, serviceRoleKey, authContext, rawContext);
  const thread = await ensureThread(supabaseUrl, serviceRoleKey, authContext, {
    threadId: body?.threadId || null,
    title: `تولید صدا: ${text}`.slice(0, 90),
    pageContext,
    contextKey,
    provider: providerConfig.provider,
    model: providerConfig.model,
    forceNew: body?.forceNewThread === true,
  });
  const userMessage = await insertAiMessage(supabaseUrl, serviceRoleKey, authContext, {
    thread_id: thread.id,
    role: 'user',
    content: text,
    provider: providerConfig.provider,
    model: providerConfig.model,
    metadata: {
      context: pageContext.context,
      context_key: contextKey,
      context_summary: pageContext.summary,
      input_kind: 'voice_output_prompt',
      capability: 'voice_output',
    },
  });
  const voiceOptions = (body?.settings && typeof body.settings === 'object') ? body.settings : {};
  const voiceResult = await callAudioSpeech(providerConfig, text, {
    voice: voiceOptions.voice || body?.voice,
    speed: voiceOptions.speed ?? body?.speed,
    responseFormat: voiceOptions.responseFormat || voiceOptions.format || body?.responseFormat,
  });
  const extension = String(voiceResult.format || '').trim()
    || (String(voiceResult.contentType || '').includes('wav') ? 'wav' : 'mp3');
  const storedVoice = await uploadGeneratedBinaryAsset(supabaseUrl, serviceRoleKey, authContext, voiceResult.bytes, voiceResult.contentType, {
    prefix: 'voice',
    extension,
  });
  let fileManagerResult: any = null;
  const assistantMessage = await insertAiMessage(supabaseUrl, serviceRoleKey, authContext, {
    thread_id: thread.id,
    role: 'assistant',
    content: 'فایل صوتی آماده شد.',
    provider: voiceResult.provider,
    model: voiceResult.model,
    metadata: {
      capability: 'voice_output',
      prompt: text,
      file: storedVoice,
      usage: voiceResult.usageMetadata,
      avalai_request_id: voiceResult.requestId || null,
    },
  });
  fileManagerResult = await registerAiGeneratedFileInFileManager(supabaseUrl, serviceRoleKey, authContext, pageContext, storedVoice, {
    displayName: `صدای هوش مصنوعی ${new Date().toISOString().slice(0, 10)}.${extension}`,
    fileType: 'audio',
    threadId: thread.id,
    messageId: assistantMessage?.id || null,
    prompt: text,
  }).catch((error) => {
    console.warn('Could not register generated voice in file manager', error);
    return null;
  });
  if (assistantMessage?.id && fileManagerResult) {
    await restPatch(supabaseUrl, serviceRoleKey, 'ai_messages', {
      id: `eq.${assistantMessage.id}`,
      org_id: `eq.${authContext.orgId}`,
    }, {
      metadata: {
        capability: 'voice_output',
        prompt: text,
        file: {
          ...storedVoice,
          asset_id: fileManagerResult?.asset?.id || null,
          entry_id: fileManagerResult?.entry?.id || null,
          folder_id: fileManagerResult?.folder?.id || null,
        },
        usage: voiceResult.usageMetadata,
        avalai_request_id: voiceResult.requestId || null,
      },
    }).catch(() => []);
  }
  const ledger = await recordAiUsageLedger(supabaseUrl, serviceRoleKey, authContext, {
    threadId: thread.id,
    messageId: assistantMessage?.id || null,
    requestId: voiceResult.requestId,
    capability: 'voice_output',
    provider: voiceResult.provider,
    model: voiceResult.model,
    usageMetadata: voiceResult.usageMetadata,
    metadata: { source: 'voice_output', user_message_id: userMessage?.id || null, storage_path: storedVoice.path },
  });
  await patchAiMessageCustomerBilling(supabaseUrl, serviceRoleKey, authContext, assistantMessage, voiceResult.usageMetadata, ledger);
  await restPatch(supabaseUrl, serviceRoleKey, 'ai_threads', { id: `eq.${thread.id}`, org_id: `eq.${authContext.orgId}` }, {
    updated_at: new Date().toISOString(),
    provider: voiceResult.provider,
    model: voiceResult.model,
    context_type: getContextKind(pageContext.context || {}),
    module_id: pageContext.moduleId || null,
    record_id: pageContext.recordId || null,
    metadata: {
      ...(thread?.metadata || {}),
      route: pageContext.context?.route || null,
      summary: pageContext.summary || null,
      context_kind: getContextKind(pageContext.context || {}),
      context_label: buildThreadContextLabel(pageContext),
      context: pageContext.context || null,
      module_id: pageContext.moduleId || null,
      record_id: pageContext.recordId || null,
      last_activity_kind: 'voice_output',
      last_message_preview: text.slice(0, 300),
      last_file_path: storedVoice.path,
      last_file_asset_id: fileManagerResult?.asset?.id || null,
      last_file_entry_id: fileManagerResult?.entry?.id || null,
      ai_files_folder_id: fileManagerResult?.folder?.id || null,
      composer_preferences: buildThreadComposerPreferences(body, thread),
    },
  });
  return json(200, {
    success: true,
    threadId: thread.id,
    userMessageId: userMessage?.id || null,
    messageId: assistantMessage?.id || null,
    answer: 'فایل صوتی آماده شد.',
    file: {
      ...storedVoice,
      asset_id: fileManagerResult?.asset?.id || null,
      entry_id: fileManagerResult?.entry?.id || null,
      folder_id: fileManagerResult?.folder?.id || null,
    },
    provider: voiceResult.provider,
    model: voiceResult.model,
    usage: withCustomerBilling(voiceResult.usageMetadata, ledger),
    ledger,
  });
};

const handleGenerateImage = async (supabaseUrl: string, serviceRoleKey: string, authContext: any, body: any) => {
  const prompt = String(body?.prompt || body?.message || '').trim();
  if (!prompt) return json(400, { success: false, message: 'متن درخواست تصویر خالی است.' });
  const rawContext = normalizeContext(body?.context || {});
  const contextKey = buildContextKey(rawContext);
  const providerConfig = await resolveProviderConfig(supabaseUrl, serviceRoleKey, authContext, 'image_generation', { modelOverride: body?.modelOverride });
  const planContext = await assertAiCapabilityEnabled(supabaseUrl, serviceRoleKey, authContext, providerConfig.orgAiSettings, 'image_generation');
  const pageContext = await buildPermittedPageContext(supabaseUrl, serviceRoleKey, authContext, rawContext);
  const imageSettings = (body?.settings && typeof body.settings === 'object') ? body.settings : {};
  const useOrganizationContext = imageSettings.useOrganizationContext !== false;
  const canUseKnowledge = useOrganizationContext && isAiCapabilityPlanAvailable(planContext, 'document_analysis');
  const [companyContext, knowledgeChunks] = await Promise.all([
    useOrganizationContext ? loadCompanyContext(supabaseUrl, serviceRoleKey, authContext) : Promise.resolve(null),
    canUseKnowledge ? fetchKnowledgeChunks(supabaseUrl, serviceRoleKey, authContext, prompt, { moduleId: pageContext.moduleId }) : Promise.resolve([]),
  ]);
  const thread = await ensureThread(supabaseUrl, serviceRoleKey, authContext, {
    threadId: body?.threadId || null,
    title: prompt.slice(0, 90),
    pageContext,
    contextKey,
    provider: providerConfig.provider,
    model: providerConfig.model,
    forceNew: body?.forceNewThread === true,
  });
  const userMessage = await insertAiMessage(supabaseUrl, serviceRoleKey, authContext, {
    thread_id: thread.id,
    role: 'user',
    content: prompt,
    provider: providerConfig.provider,
    model: providerConfig.model,
    metadata: {
      context: pageContext.context,
      context_key: contextKey,
      context_summary: pageContext.summary,
      input_kind: 'image_prompt',
      capability: 'image_generation',
    },
  });
  const providerPrompt = clampImagePrompt(appendImageContextToPrompt(
    buildImagePromptWithSettings(prompt, imageSettings),
    { companyContext, pageSummary: pageContext.summary || null, knowledgeChunks },
  ));
  const rawSources = Array.isArray(body?.sourceImages) ? body.sourceImages
    : Array.isArray(imageSettings.sourceImages) ? imageSettings.sourceImages
    : [];
  const sourceImages = rawSources
    .map((src: any) => ({
      data: String(src?.data || src?.base64 || '').trim(),
      mimeType: String(src?.mimeType || src?.mime_type || 'image/png').trim() || 'image/png',
      filename: String(src?.filename || src?.fileName || '').trim() || undefined,
    }))
    .filter((src: any) => src.data);
  // Edit/refine an existing image (e.g. the last output or a replied-to image):
  // the client passes its storage URL and we fetch it server-side as a source.
  const sourceUrls = (Array.isArray(body?.sourceImageUrls) ? body.sourceImageUrls
    : Array.isArray(imageSettings.sourceImageUrls) ? imageSettings.sourceImageUrls
    : [])
    .map((u: any) => String(u || '').trim())
    .filter(Boolean)
    .slice(0, 4);
  for (const url of sourceUrls) {
    try {
      const resp = await fetch(url, { signal: AbortSignal.timeout(20000) });
      if (!resp.ok) continue;
      const mimeType = resp.headers.get('content-type') || 'image/png';
      const bytes = new Uint8Array(await resp.arrayBuffer());
      if (bytes.length) sourceImages.push({ data: uint8ToBase64(bytes), mimeType, filename: undefined });
    } catch (error) {
      console.warn('Could not fetch source image url for editing', error);
    }
  }
  const imageCallOptions = {
    sourceImages,
    size: imageSettings.size || body?.size,
    quality: imageSettings.quality || body?.quality,
    n: imageSettings.n || body?.n,
    extraBody: imageSettings.extraBody || imageSettings.extra_body,
  };
  const promptSettings = {
    persianText: imageSettings.persianText === true,
    persianDigits: imageSettings.persianDigits === true,
    rtlText: imageSettings.rtlText === true,
    orientationHorizontal: imageSettings.orientationHorizontal === true,
    orientationVertical: imageSettings.orientationVertical === true,
    useOrganizationContext,
  };
  const backgroundQueuedAt = new Date().toISOString();
  const pendingImageMetadata = {
    capability: 'image_generation',
    capabilities: ['image_generation'],
    kind: 'image_generation',
    pending_status: true,
    recheckable: true,
    status: 'processing',
    started_at: Date.now(),
    prompt,
    provider_prompt: providerPrompt,
    prompt_settings: promptSettings,
    context: pageContext.context,
    context_key: contextKey,
    context_summary: pageContext.summary,
    background_task: {
      status: 'queued',
      queued_at: backgroundQueuedAt,
      provider: providerConfig.provider,
      model: providerConfig.model,
    },
    image_call_options: {
      size: imageCallOptions.size || null,
      quality: imageCallOptions.quality || null,
      n: imageCallOptions.n || null,
      extraBody: imageCallOptions.extraBody || null,
      hasSourceImages: sourceImages.length > 0,
    },
  };
  const assistantMessage = await insertAiMessage(supabaseUrl, serviceRoleKey, authContext, {
    thread_id: thread.id,
    role: 'assistant',
    content: 'در حال ساخت تصویر...',
    provider: providerConfig.provider,
    model: providerConfig.model,
    metadata: pendingImageMetadata,
  });
  await restPatch(supabaseUrl, serviceRoleKey, 'ai_threads', { id: `eq.${thread.id}`, org_id: `eq.${authContext.orgId}` }, {
    updated_at: new Date().toISOString(),
    provider: providerConfig.provider,
    model: providerConfig.model,
    context_type: getContextKind(pageContext.context || {}),
    module_id: pageContext.moduleId || null,
    record_id: pageContext.recordId || null,
    metadata: {
      ...(thread?.metadata || {}),
      route: pageContext.context?.route || null,
      summary: pageContext.summary || null,
      context_kind: getContextKind(pageContext.context || {}),
      context_label: buildThreadContextLabel(pageContext),
      context: pageContext.context || null,
      module_id: pageContext.moduleId || null,
      record_id: pageContext.recordId || null,
      last_activity_kind: 'image_generation_pending',
      last_message_preview: prompt.slice(0, 300),
      pending_message_id: assistantMessage?.id || null,
      composer_preferences: buildThreadComposerPreferences(body, thread),
    },
  }).catch(() => []);

  runBackgroundTask((async () => {
    try {
      const backgroundStartedAt = new Date().toISOString();
      await restPatch(supabaseUrl, serviceRoleKey, 'ai_messages', {
        id: `eq.${assistantMessage.id}`,
        org_id: `eq.${authContext.orgId}`,
      }, {
        metadata: {
          ...pendingImageMetadata,
          background_task: {
            ...(pendingImageMetadata.background_task || {}),
            status: 'running',
            started_at: backgroundStartedAt,
          },
        },
      }).catch(() => []);
      const imageResult = await callImageGeneration(providerConfig, providerPrompt, imageCallOptions);
      const storedImage = await uploadGeneratedImage(supabaseUrl, serviceRoleKey, authContext, imageResult);
      const fileManagerResult = await registerAiGeneratedFileInFileManager(supabaseUrl, serviceRoleKey, authContext, pageContext, storedImage, {
        displayName: `تصویر هوش مصنوعی ${new Date().toISOString().slice(0, 10)}.png`,
        fileType: 'image',
        threadId: thread.id,
        messageId: assistantMessage?.id || null,
        prompt,
      }).catch((error) => {
        console.warn('Could not register generated image in file manager', error);
        return null;
      });
      const finalImage = fileManagerResult ? {
        ...storedImage,
        asset_id: fileManagerResult?.asset?.id || null,
        entry_id: fileManagerResult?.entry?.id || null,
        folder_id: fileManagerResult?.folder?.id || null,
      } : storedImage;
      const ledger = await recordAiUsageLedger(supabaseUrl, serviceRoleKey, authContext, {
        threadId: thread.id,
        messageId: assistantMessage?.id || null,
        requestId: imageResult.requestId,
        capability: 'image_generation',
        provider: imageResult.provider,
        model: imageResult.model,
        usageMetadata: imageResult.usageMetadata,
        metadata: { source: 'image_generation', user_message_id: userMessage?.id || null, storage_path: storedImage.path },
      });
      await patchAiMessageCustomerBilling(supabaseUrl, serviceRoleKey, authContext, assistantMessage, imageResult.usageMetadata, ledger);
      await restPatch(supabaseUrl, serviceRoleKey, 'ai_messages', {
        id: `eq.${assistantMessage.id}`,
        org_id: `eq.${authContext.orgId}`,
      }, {
        content: 'تصویر آماده شد.',
        provider: imageResult.provider,
        model: imageResult.model,
        created_at: assistantMessage?.created_at || new Date().toISOString(),
        metadata: {
          capability: 'image_generation',
          capabilities: ['image_generation'],
          kind: 'image_generation',
          pending_status: false,
          status: 'completed',
          prompt,
          provider_prompt: providerPrompt,
          prompt_settings: promptSettings,
          background_task: {
            ...(pendingImageMetadata.background_task || {}),
            status: 'completed',
            queued_at: backgroundQueuedAt,
            started_at: backgroundStartedAt,
            completed_at: new Date().toISOString(),
          },
          image: finalImage,
          usage: withCustomerBilling(imageResult.usageMetadata, ledger),
          avalai_request_id: imageResult.requestId || null,
          provider_raw_response: compactProviderRaw(imageResult.raw),
        },
      }).catch(() => []);
      await restPatch(supabaseUrl, serviceRoleKey, 'ai_threads', { id: `eq.${thread.id}`, org_id: `eq.${authContext.orgId}` }, {
        updated_at: new Date().toISOString(),
        provider: imageResult.provider,
        model: imageResult.model,
        context_type: getContextKind(pageContext.context || {}),
        module_id: pageContext.moduleId || null,
        record_id: pageContext.recordId || null,
        metadata: {
          ...(thread?.metadata || {}),
          route: pageContext.context?.route || null,
          summary: pageContext.summary || null,
          context_kind: getContextKind(pageContext.context || {}),
          context_label: buildThreadContextLabel(pageContext),
          context: pageContext.context || null,
          module_id: pageContext.moduleId || null,
          record_id: pageContext.recordId || null,
          last_activity_kind: 'image_generation',
          last_message_preview: prompt.slice(0, 300),
          last_image_path: storedImage.path,
          last_file_asset_id: fileManagerResult?.asset?.id || null,
          last_file_entry_id: fileManagerResult?.entry?.id || null,
          ai_files_folder_id: fileManagerResult?.folder?.id || null,
          composer_preferences: buildThreadComposerPreferences(body, thread),
        },
      }).catch(() => []);
    } catch (error: any) {
      const rawFailure = shortenProviderError(String(error?.message || error || 'image_generation_failed'));
      const providerRawFailure = compactProviderRaw(error?.providerRawResponse || error?.providerRaw || error?.raw || null);
      const failureMessage = `ساخت تصویر ناموفق بود. سرویس هوش مصنوعی در زمان مناسب پاسخ نداد یا خطا داد. چند لحظه بعد دوباره تلاش کنید.${rawFailure ? `\nجزئیات: ${rawFailure}` : ''}`;
      await restPatch(supabaseUrl, serviceRoleKey, 'ai_messages', {
        id: `eq.${assistantMessage?.id}`,
        org_id: `eq.${authContext.orgId}`,
      }, {
        content: failureMessage,
        provider: providerConfig.provider,
        model: providerConfig.model,
        metadata: {
          capability: 'image_generation',
          capabilities: ['image_generation'],
          kind: 'image_generation',
          pending_status: false,
          status: 'failed',
          failed: true,
          prompt,
          provider_prompt: providerPrompt,
          prompt_settings: promptSettings,
          background_task: {
            ...(pendingImageMetadata.background_task || {}),
            status: 'failed',
            queued_at: backgroundQueuedAt,
            failed_at: new Date().toISOString(),
          },
          error: rawFailure || 'image_generation_failed',
          failed_note: failureMessage,
          provider_status: error?.providerStatus || null,
          avalai_request_id: error?.providerRequestId || null,
          provider_error_raw: providerRawFailure || rawFailure,
        },
      }).catch(() => []);
      await restPatch(supabaseUrl, serviceRoleKey, 'ai_threads', { id: `eq.${thread.id}`, org_id: `eq.${authContext.orgId}` }, {
        updated_at: new Date().toISOString(),
        provider: providerConfig.provider,
        model: providerConfig.model,
        context_type: getContextKind(pageContext.context || {}),
        module_id: pageContext.moduleId || null,
        record_id: pageContext.recordId || null,
        metadata: {
          ...(thread?.metadata || {}),
          route: pageContext.context?.route || null,
          summary: pageContext.summary || null,
          context_kind: getContextKind(pageContext.context || {}),
          context_label: buildThreadContextLabel(pageContext),
          context: pageContext.context || null,
          module_id: pageContext.moduleId || null,
          record_id: pageContext.recordId || null,
          last_activity_kind: 'image_generation_failed',
          last_message_preview: failureMessage.slice(0, 300),
          composer_preferences: buildThreadComposerPreferences(body, thread),
        },
      }).catch(() => []);
    }
  })());

  return json(200, {
    success: true,
    pending: true,
    threadId: thread.id,
    userMessageId: userMessage?.id || null,
    messageId: assistantMessage?.id || null,
    answer: 'درخواست ساخت تصویر ثبت شد.',
    provider: providerConfig.provider,
    model: providerConfig.model,
    messages: [userMessage, assistantMessage].filter(Boolean),
  });
};

const handleGetImageStatus = async (supabaseUrl: string, serviceRoleKey: string, authContext: any, body: any) => {
  const messageId = normalizeId(body?.messageId);
  if (!messageId) return json(400, { success: false, message: 'شناسه پیام تصویر ارسال نشده است.' });
  const rows = await safeRestSelect(supabaseUrl, serviceRoleKey, 'ai_messages', {
    id: `eq.${messageId}`,
    org_id: `eq.${authContext.orgId}`,
    select: 'id,thread_id,role,content,provider,model,metadata,created_at',
    limit: '1',
  });
  const msg = rows[0] || null;
  if (!msg) return json(404, { success: false, message: 'پیام ساخت تصویر پیدا نشد.' });
  const metadata = msg.metadata || {};
  const recoverableTimedOutImage = metadata?.error === 'image_generation_worker_timeout'
    && String(metadata?.background_task?.status || '').trim() === 'running';
  if (recoverableTimedOutImage) {
    const restoredStartedAt = Number(metadata.started_at || 0);
    const restoredElapsedMs = restoredStartedAt ? Date.now() - restoredStartedAt : 0;
    if (restoredStartedAt && restoredElapsedMs > IMAGE_STATUS_HARD_TIMEOUT_MS) {
      const hardFailedMessage = [
        'ساخت تصویر بیشتر از سقف قابل پیگیری طول کشیده و دیگر به‌عنوان درخواست در حال اجرا نگه داشته نمی‌شود.',
        'پاسخ نهایی از سرویس AvalAI یا مرحله ذخیره‌سازی به سامانه نرسیده است؛ اگر هزینه‌ای در پنل سرویس‌دهنده ثبت شده، با request id زیر قابل پیگیری است.',
        `مدل: ${String(metadata?.background_task?.model || msg.model || 'نامشخص')}`,
        'وضعیت ثبت‌شده پردازش: running',
        metadata?.avalai_request_id ? `Request ID: ${String(metadata.avalai_request_id)}` : '',
      ].filter(Boolean).join('\n');
      const failedMetadata = {
        ...metadata,
        pending_status: false,
        status: 'failed',
        delayed: false,
        failed: true,
        failed_note: hardFailedMessage,
        manual_recheck_only: false,
        error: 'image_generation_hard_timeout',
        provider_error_raw: metadata.provider_error_raw || metadata.provider_raw_response || hardFailedMessage,
        background_task: {
          ...(metadata.background_task || {}),
          status: 'failed',
          failed_at: new Date().toISOString(),
          timeout_ms: restoredElapsedMs,
        },
      };
      const updatedMessage = { ...msg, content: hardFailedMessage, metadata: failedMetadata };
      await restPatch(supabaseUrl, serviceRoleKey, 'ai_messages', {
        id: `eq.${messageId}`,
        org_id: `eq.${authContext.orgId}`,
      }, {
        content: hardFailedMessage,
        metadata: failedMetadata,
      }).catch(() => []);
      return json(200, {
        success: true,
        status: 'failed',
        diagnosticMessage: hardFailedMessage,
        messageId,
        threadId: msg.thread_id,
        message: updatedMessage,
      });
    }
    const restoredMessage = [
      'این درخواست قبلاً به‌خاطر طولانی شدن از حالت انتظار خارج شده بود، اما پردازش آن هنوز قابل بررسی است.',
      'چند لحظه بعد دوباره «بررسی مجدد» را بزنید؛ اگر خروجی آماده شده باشد، همین کارت به نتیجه نهایی تبدیل می‌شود.',
      `مدل: ${String(metadata?.background_task?.model || msg.model || 'نامشخص')}`,
      'وضعیت پردازش: running',
    ].join('\n');
    const restoredMetadata = {
      ...metadata,
      pending_status: true,
      status: 'delayed',
      delayed: true,
      failed: false,
      failed_note: restoredMessage,
      manual_recheck_only: true,
      error: 'image_generation_delayed',
      provider_error_raw: metadata.provider_error_raw || metadata.provider_raw_response || null,
      background_task: {
        ...(metadata.background_task || {}),
        status: 'running',
        restored_at: new Date().toISOString(),
      },
    };
    const updatedMessage = { ...msg, content: restoredMessage, metadata: restoredMetadata };
    await restPatch(supabaseUrl, serviceRoleKey, 'ai_messages', {
      id: `eq.${messageId}`,
      org_id: `eq.${authContext.orgId}`,
    }, {
      content: restoredMessage,
      metadata: restoredMetadata,
    }).catch(() => []);
    return json(200, {
      success: true,
      status: 'delayed',
      diagnosticMessage: restoredMessage,
      messageId,
      threadId: msg.thread_id,
      message: updatedMessage,
    });
  }
  if (metadata.pending_status === true) {
    const startedAt = Number(metadata.started_at || 0);
    const elapsedMs = startedAt ? Date.now() - startedAt : 0;
    const backgroundTask = metadata.background_task && typeof metadata.background_task === 'object'
      ? metadata.background_task
      : {};
    const backgroundStatus = String(backgroundTask.status || '').trim();
    const providerRawResponse = metadata.provider_raw_response || metadata.provider_error_raw || null;
    const buildDiagnosticMessage = () => {
      if (backgroundStatus === 'queued') {
        return 'ساخت تصویر هنوز توسط پردازش پس‌زمینه شروع نشده است. اگر این وضعیت ادامه پیدا کند، احتمالاً worker سرور بعد از ثبت درخواست اجرا نشده یا متوقف شده است.';
      }
      if (backgroundStatus === 'running') {
        return 'ساخت تصویر در حال اجراست، اما هنوز خروجی نهایی از سرویس تصویر یا ذخیره‌سازی دریافت نشده است.';
      }
      return 'ساخت تصویر هنوز کامل نشده است. اگر این وضعیت طولانی شود، احتمالاً سرویس تصویر پاسخ نداده یا پردازش پس‌زمینه کامل نشده است.';
    };
    if (startedAt && elapsedMs > IMAGE_STATUS_HARD_TIMEOUT_MS) {
      const hardFailedMessage = [
        'ساخت تصویر بیشتر از سقف قابل پیگیری طول کشیده و درخواست در حالت انتظار بسته شد.',
        buildDiagnosticMessage(),
        'پاسخ نهایی از AvalAI یا مرحله ذخیره‌سازی به سامانه نرسیده است. اگر request id ثبت شده باشد، می‌توانید آن را در پنل سرویس‌دهنده پیگیری کنید.',
        `مدل: ${String(backgroundTask.model || msg.model || 'نامشخص')}`,
        `وضعیت ثبت‌شده پردازش: ${backgroundStatus || 'نامشخص'}`,
        metadata?.avalai_request_id ? `Request ID: ${String(metadata.avalai_request_id)}` : '',
      ].filter(Boolean).join('\n');
      const failedMetadata = {
        ...metadata,
        pending_status: false,
        status: 'failed',
        delayed: false,
        failed: true,
        failed_note: hardFailedMessage,
        manual_recheck_only: false,
        error: 'image_generation_hard_timeout',
        provider_error_raw: providerRawResponse || hardFailedMessage,
        background_task: {
          ...backgroundTask,
          status: 'failed',
          failed_at: new Date().toISOString(),
          timeout_ms: elapsedMs,
        },
      };
      const updatedMessage = { ...msg, content: hardFailedMessage, metadata: failedMetadata };
      await restPatch(supabaseUrl, serviceRoleKey, 'ai_messages', {
        id: `eq.${messageId}`,
        org_id: `eq.${authContext.orgId}`,
      }, {
        content: hardFailedMessage,
        metadata: failedMetadata,
      }).catch(() => []);
      return json(200, {
        success: true,
        status: 'failed',
        diagnosticMessage: hardFailedMessage,
        messageId,
        threadId: msg.thread_id,
        message: updatedMessage,
      });
    }
    if (startedAt && elapsedMs > IMAGE_STATUS_STALE_MS) {
      const delayedMessage = [
        'ساخت تصویر بیشتر از زمان معمول طول کشیده، اما درخواست حذف نشده و هنوز قابل بررسی است.',
        buildDiagnosticMessage(),
        'می‌توانید چند لحظه بعد دوباره «بررسی مجدد» را بزنید؛ اگر خروجی بعداً آماده شود، همین کارت به نتیجه نهایی تبدیل می‌شود.',
        `مدل: ${String(backgroundTask.model || msg.model || 'نامشخص')}`,
        `وضعیت پردازش: ${backgroundStatus || 'نامشخص'}`,
      ].join('\n');
      await restPatch(supabaseUrl, serviceRoleKey, 'ai_messages', {
        id: `eq.${messageId}`,
        org_id: `eq.${authContext.orgId}`,
      }, {
        content: delayedMessage,
        metadata: {
          ...metadata,
          pending_status: true,
          status: 'delayed',
          delayed: true,
          failed: false,
          failed_note: delayedMessage,
          manual_recheck_only: true,
          error: 'image_generation_delayed',
          provider_error_raw: providerRawResponse,
          background_task: {
            ...backgroundTask,
            status: backgroundStatus || 'delayed',
            delayed_at: new Date().toISOString(),
            delay_ms: elapsedMs,
          },
        },
      }).catch(() => []);
      return json(200, {
        success: true,
        status: 'delayed',
        message: {
          ...msg,
          content: delayedMessage,
          metadata: {
            ...metadata,
            pending_status: true,
            status: 'delayed',
            delayed: true,
            failed: false,
            failed_note: delayedMessage,
            manual_recheck_only: true,
            error: 'image_generation_delayed',
            provider_error_raw: providerRawResponse,
            background_task: {
              ...backgroundTask,
              status: backgroundStatus || 'delayed',
              delayed_at: new Date().toISOString(),
              delay_ms: elapsedMs,
            },
          },
        },
        diagnosticMessage: delayedMessage,
        messageId,
        threadId: msg.thread_id,
      });
    }
    const diagnosticMessage = startedAt && elapsedMs > IMAGE_STATUS_WARN_MS ? buildDiagnosticMessage() : null;
    return json(200, {
      success: true,
      status: 'processing',
      messageId,
      threadId: msg.thread_id,
      message: msg,
      diagnosticMessage,
      elapsedMs,
      backgroundStatus: backgroundStatus || null,
      provider: msg.provider,
      model: msg.model,
    });
  }
  return json(200, {
    success: true,
    status: metadata.failed || metadata.status === 'failed' ? 'failed' : 'completed',
    messageId,
    threadId: msg.thread_id,
    message: msg,
    image: metadata.image || null,
    usage: metadata.usage || null,
    provider: msg.provider,
    model: msg.model,
  });
};

// ── AI file generation (Word / Excel / PDF / CSV) ─────────────────────────────
const DOCUMENT_FORMATS: Record<string, { ext: string; mime: string }> = {
  docx: { ext: 'docx', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
  xlsx: { ext: 'xlsx', mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
  pdf: { ext: 'pdf', mime: 'application/pdf' },
  csv: { ext: 'csv', mime: 'text/csv' },
};

const escapeHtml = (value: any) => String(value ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const normalizeDocumentSpec = (raw: any) => {
  const spec = raw && typeof raw === 'object' ? raw : {};
  const blocks = Array.isArray(spec.blocks) ? spec.blocks : [];
  const sheets = Array.isArray(spec.sheets) ? spec.sheets : [];
  // Derive a sheet from the first table block when none was provided (xlsx/csv).
  if (!sheets.length) {
    const table = blocks.find((b: any) => b?.type === 'table' && Array.isArray(b.columns));
    if (table) sheets.push({ name: 'Sheet1', columns: table.columns, rows: Array.isArray(table.rows) ? table.rows : [] });
  }
  return { title: String(spec.title || '').trim() || 'سند هوش مصنوعی', blocks, sheets };
};

const buildDocumentHtml = (spec: any) => {
  const parts: string[] = [];
  parts.push(`<h1>${escapeHtml(spec.title)}</h1>`);
  for (const block of spec.blocks) {
    if (!block || typeof block !== 'object') continue;
    if (block.type === 'heading') {
      const level = Math.min(4, Math.max(1, Number(block.level) || 2));
      parts.push(`<h${level}>${escapeHtml(block.text)}</h${level}>`);
    } else if (block.type === 'paragraph') {
      parts.push(`<p>${escapeHtml(block.text)}</p>`);
    } else if (block.type === 'list' && Array.isArray(block.items)) {
      parts.push(`<ul>${block.items.map((it: any) => `<li>${escapeHtml(it)}</li>`).join('')}</ul>`);
    } else if (block.type === 'table' && Array.isArray(block.columns)) {
      const head = `<tr>${block.columns.map((c: any) => `<th>${escapeHtml(c)}</th>`).join('')}</tr>`;
      const rows = (Array.isArray(block.rows) ? block.rows : [])
        .map((row: any[]) => `<tr>${(Array.isArray(row) ? row : []).map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`)
        .join('');
      parts.push(`<table border="1" cellspacing="0" cellpadding="6">${head}${rows}</table>`);
    }
  }
  return `<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8" />
<style>
  body{font-family:Tahoma,'IRANSans',sans-serif;direction:rtl;padding:32px;color:#1f2937;line-height:1.9}
  h1{font-size:22px} h2{font-size:18px} h3{font-size:16px}
  table{border-collapse:collapse;width:100%;margin:12px 0}
  th{background:#f3f4f6} th,td{border:1px solid #d1d5db;padding:6px;text-align:right}
  @page{size:A4;margin:18mm}
</style></head><body>${parts.join('\n')}
<script>window.__KALAMAPP_PRINT_READY = true;</script></body></html>`;
};

const buildCsvBytes = (spec: any) => {
  const sheet = spec.sheets[0] || { columns: [], rows: [] };
  const escapeCell = (cell: any) => {
    const text = String(cell ?? '');
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const lines: string[] = [];
  if (Array.isArray(sheet.columns) && sheet.columns.length) lines.push(sheet.columns.map(escapeCell).join(','));
  for (const row of (Array.isArray(sheet.rows) ? sheet.rows : [])) {
    lines.push((Array.isArray(row) ? row : []).map(escapeCell).join(','));
  }
  // Prepend UTF-8 BOM so Excel opens Persian text correctly.
  return new TextEncoder().encode('﻿' + lines.join('\r\n'));
};

const buildDocxBytes = async (spec: any) => {
  const docx = await import('https://esm.sh/docx@8.5.0');
  const { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType, AlignmentType } = docx as any;
  const children: any[] = [
    new Paragraph({ heading: HeadingLevel.TITLE, alignment: AlignmentType.RIGHT, bidirectional: true, children: [new TextRun(String(spec.title))] }),
  ];
  for (const block of spec.blocks) {
    if (!block || typeof block !== 'object') continue;
    if (block.type === 'heading') {
      const level = Number(block.level) || 2;
      const heading = level <= 1 ? HeadingLevel.HEADING_1 : level === 2 ? HeadingLevel.HEADING_2 : HeadingLevel.HEADING_3;
      children.push(new Paragraph({ heading, alignment: AlignmentType.RIGHT, bidirectional: true, children: [new TextRun(String(block.text || ''))] }));
    } else if (block.type === 'paragraph') {
      children.push(new Paragraph({ alignment: AlignmentType.RIGHT, bidirectional: true, children: [new TextRun(String(block.text || ''))] }));
    } else if (block.type === 'list' && Array.isArray(block.items)) {
      for (const item of block.items) {
        children.push(new Paragraph({ bullet: { level: 0 }, alignment: AlignmentType.RIGHT, bidirectional: true, children: [new TextRun(String(item || ''))] }));
      }
    } else if (block.type === 'table' && Array.isArray(block.columns)) {
      const headerRow = new TableRow({ children: block.columns.map((c: any) => new TableCell({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, bidirectional: true, children: [new TextRun({ text: String(c ?? ''), bold: true })] })] })) });
      const bodyRows = (Array.isArray(block.rows) ? block.rows : []).map((row: any[]) =>
        new TableRow({ children: block.columns.map((_: any, idx: number) => new TableCell({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, bidirectional: true, children: [new TextRun(String((Array.isArray(row) ? row[idx] : '') ?? ''))] })] })) }));
      children.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [headerRow, ...bodyRows] }));
    }
  }
  const document = new Document({ sections: [{ properties: {}, children }] });
  const buffer = await Packer.toBuffer(document);
  return new Uint8Array(buffer);
};

const buildXlsxBytes = async (spec: any) => {
  const XLSX = await import('https://esm.sh/xlsx@0.18.5');
  const wb = (XLSX as any).utils.book_new();
  const sheets = spec.sheets.length ? spec.sheets : [{ name: 'Sheet1', columns: [], rows: [] }];
  sheets.forEach((sheet: any, index: number) => {
    const aoa: any[][] = [];
    if (Array.isArray(sheet.columns) && sheet.columns.length) aoa.push(sheet.columns);
    for (const row of (Array.isArray(sheet.rows) ? sheet.rows : [])) aoa.push(Array.isArray(row) ? row : [row]);
    const ws = (XLSX as any).utils.aoa_to_sheet(aoa);
    (XLSX as any).utils.book_append_sheet(wb, ws, String(sheet.name || `Sheet${index + 1}`).slice(0, 31));
  });
  const out = (XLSX as any).write(wb, { bookType: 'xlsx', type: 'array' });
  return new Uint8Array(out);
};

const renderPdfViaService = async (supabaseUrl: string, serviceRoleKey: string, html: string, title: string) => {
  const url = `${supabaseUrl.replace(/\/+$/, '')}/functions/v1/render-pdf`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${serviceRoleKey}`, apikey: serviceRoleKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ documentHtml: html, title, filename: title }),
    signal: AbortSignal.timeout(LONG_MEDIA_PROVIDER_TIMEOUT_MS),
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`تولید PDF ناموفق بود: ${detail.slice(0, 300)}`);
  }
  return new Uint8Array(await response.arrayBuffer());
};

const handleGenerateDocument = async (supabaseUrl: string, serviceRoleKey: string, authContext: any, body: any) => {
  const prompt = String(body?.prompt || body?.message || '').trim();
  if (!prompt) return json(400, { success: false, message: 'متن درخواست ساخت فایل خالی است.' });
  const requestedFormat = String(body?.format || body?.settings?.format || 'docx').trim().toLowerCase();
  const format = DOCUMENT_FORMATS[requestedFormat] ? requestedFormat : 'docx';
  const rawContext = normalizeContext(body?.context || {});
  const contextKey = buildContextKey(rawContext);
  const providerConfig = await resolveProviderConfig(supabaseUrl, serviceRoleKey, authContext, 'document_generation', { modelOverride: body?.modelOverride });
  await assertAiCapabilityEnabled(supabaseUrl, serviceRoleKey, authContext, providerConfig.orgAiSettings, 'document_generation');
  const pageContext = await buildPermittedPageContext(supabaseUrl, serviceRoleKey, authContext, rawContext);
  const thread = await ensureThread(supabaseUrl, serviceRoleKey, authContext, {
    threadId: body?.threadId || null,
    title: `ساخت فایل: ${prompt}`.slice(0, 90),
    pageContext,
    contextKey,
    provider: providerConfig.provider,
    model: providerConfig.model,
    forceNew: body?.forceNewThread === true,
  });
  const userMessage = await insertAiMessage(supabaseUrl, serviceRoleKey, authContext, {
    thread_id: thread.id,
    role: 'user',
    content: prompt,
    provider: providerConfig.provider,
    model: providerConfig.model,
    metadata: { context: pageContext.context, context_key: contextKey, input_kind: 'document_prompt', capability: 'document_generation', format },
  });

  // Ask the model for a strict JSON document spec.
  const schemaHint = format === 'xlsx' || format === 'csv'
    ? 'برای فایل صفحه‌گسترده، آرایه‌ی sheets را پر کن: [{"name":"...","columns":["..."],"rows":[["..."]]}].'
    : 'برای سند متنی، آرایه‌ی blocks را پر کن: heading {type,text,level}، paragraph {type,text}، list {type,items[]}، table {type,columns[],rows[[]]}.';
  const aiResult = await callChatCompletions(providerConfig, [
    { role: 'system', content: `تو یک تولیدکننده‌ی محتوای ساختاریافته برای ساخت فایل هستی. فقط و فقط یک JSON معتبر برگردان (بدون توضیح، بدون markdown). ساختار: {"title":"...","blocks":[...],"sheets":[...]}. ${schemaHint} همه‌ی متن‌ها فارسی و رسمی باشند.` },
    { role: 'user', content: prompt },
  ], { safetyIdentifier: `org_${authContext.orgId}_user_${authContext.userId}_cap_document_generation`, maxTokens: 4000 });

  let spec: any;
  try {
    const cleaned = String(aiResult.content || '').replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    spec = normalizeDocumentSpec(JSON.parse(start >= 0 && end >= 0 ? cleaned.slice(start, end + 1) : cleaned));
  } catch {
    spec = normalizeDocumentSpec({ title: prompt.slice(0, 80), blocks: [{ type: 'paragraph', text: String(aiResult.content || '') }] });
  }

  let bytes: Uint8Array;
  if (format === 'docx') bytes = await buildDocxBytes(spec);
  else if (format === 'xlsx') bytes = await buildXlsxBytes(spec);
  else if (format === 'csv') bytes = buildCsvBytes(spec);
  else bytes = await renderPdfViaService(supabaseUrl, serviceRoleKey, buildDocumentHtml(spec), spec.title);

  const stored = await uploadGeneratedBinaryAsset(supabaseUrl, serviceRoleKey, authContext, bytes, DOCUMENT_FORMATS[format].mime, {
    prefix: 'document',
    extension: DOCUMENT_FORMATS[format].ext,
  });
  const assistantMessage = await insertAiMessage(supabaseUrl, serviceRoleKey, authContext, {
    thread_id: thread.id,
    role: 'assistant',
    content: `فایل ${format.toUpperCase()} آماده شد: ${spec.title}`,
    provider: aiResult.provider,
    model: aiResult.model,
    metadata: { capability: 'document_generation', format, prompt, file: stored, usage: aiResult.usageMetadata },
  });
  const fileManagerResult = await registerAiGeneratedFileInFileManager(supabaseUrl, serviceRoleKey, authContext, pageContext, stored, {
    displayName: `${spec.title}.${DOCUMENT_FORMATS[format].ext}`,
    fileType: 'file',
    threadId: thread.id,
    messageId: assistantMessage?.id || null,
    prompt,
  }).catch((error) => { console.warn('Could not register generated document', error); return null; });
  const fileResult = {
    ...stored,
    asset_id: fileManagerResult?.asset?.id || null,
    entry_id: fileManagerResult?.entry?.id || null,
    folder_id: fileManagerResult?.folder?.id || null,
  };
  if (assistantMessage?.id && fileManagerResult) {
    await restPatch(supabaseUrl, serviceRoleKey, 'ai_messages', { id: `eq.${assistantMessage.id}`, org_id: `eq.${authContext.orgId}` }, {
      metadata: { capability: 'document_generation', format, prompt, file: fileResult, usage: aiResult.usageMetadata },
    }).catch(() => []);
  }
  const ledger = await recordAiUsageLedger(supabaseUrl, serviceRoleKey, authContext, {
    threadId: thread.id,
    messageId: assistantMessage?.id || null,
    requestId: aiResult.requestId,
    capability: 'document_generation',
    provider: aiResult.provider,
    model: aiResult.model,
    usageMetadata: aiResult.usageMetadata,
    metadata: { source: 'document_generation', format, storage_path: stored.path },
  });
  await patchAiMessageCustomerBilling(supabaseUrl, serviceRoleKey, authContext, assistantMessage, aiResult.usageMetadata, ledger);
  await restPatch(supabaseUrl, serviceRoleKey, 'ai_threads', { id: `eq.${thread.id}`, org_id: `eq.${authContext.orgId}` }, {
    updated_at: new Date().toISOString(),
    provider: aiResult.provider,
    model: aiResult.model,
    context_type: getContextKind(pageContext.context || {}),
    module_id: pageContext.moduleId || null,
    record_id: pageContext.recordId || null,
    metadata: {
      ...(thread?.metadata || {}),
      route: pageContext.context?.route || null,
      summary: pageContext.summary || null,
      context_kind: getContextKind(pageContext.context || {}),
      context_label: buildThreadContextLabel(pageContext),
      context: pageContext.context || null,
      module_id: pageContext.moduleId || null,
      record_id: pageContext.recordId || null,
      last_activity_kind: 'document_generation',
      last_message_preview: prompt.slice(0, 300),
      last_file_path: stored.path,
      last_file_asset_id: fileManagerResult?.asset?.id || null,
      last_file_entry_id: fileManagerResult?.entry?.id || null,
      ai_files_folder_id: fileManagerResult?.folder?.id || null,
      composer_preferences: buildThreadComposerPreferences(body, thread),
    },
  }).catch(() => []);
  return json(200, {
    success: true,
    threadId: thread.id,
    userMessageId: userMessage?.id || null,
    messageId: assistantMessage?.id || null,
    answer: `فایل ${format.toUpperCase()} آماده شد.`,
    file: fileResult,
    format,
    provider: aiResult.provider,
    model: aiResult.model,
    usage: withCustomerBilling(aiResult.usageMetadata, ledger),
    ledger,
  });
};

const handleGenerateVideo = async (supabaseUrl: string, serviceRoleKey: string, authContext: any, body: any) => {
  const prompt = String(body?.prompt || body?.message || '').trim();
  if (!prompt) return json(400, { success: false, message: 'متن درخواست ویدیو خالی است.' });
  const rawContext = normalizeContext(body?.context || {});
  const contextKey = buildContextKey(rawContext);
  const providerConfig = await resolveProviderConfig(supabaseUrl, serviceRoleKey, authContext, 'video_generation', { modelOverride: body?.modelOverride });
  await assertAiCapabilityEnabled(supabaseUrl, serviceRoleKey, authContext, providerConfig.orgAiSettings, 'video_generation');
  const pageContext = await buildPermittedPageContext(supabaseUrl, serviceRoleKey, authContext, rawContext);
  const settings = (body?.settings && typeof body.settings === 'object') ? body.settings : {};
  const sources = Array.isArray(body?.sourceImages) ? body.sourceImages : (Array.isArray(settings.sourceImages) ? settings.sourceImages : []);
  const firstSource = sources.map((src: any) => ({
    data: String(src?.data || src?.base64 || '').trim(),
    mimeType: String(src?.mimeType || src?.mime_type || 'image/png').trim() || 'image/png',
  })).find((src: any) => src.data) || null;

  const thread = await ensureThread(supabaseUrl, serviceRoleKey, authContext, {
    threadId: body?.threadId || null,
    title: `تولید ویدیو: ${prompt}`.slice(0, 90),
    pageContext,
    contextKey,
    provider: providerConfig.provider,
    model: providerConfig.model,
    forceNew: body?.forceNewThread === true,
  });
  const userMessage = await insertAiMessage(supabaseUrl, serviceRoleKey, authContext, {
    thread_id: thread.id,
    role: 'user',
    content: prompt,
    provider: providerConfig.provider,
    model: providerConfig.model,
    metadata: { context: pageContext.context, context_key: contextKey, input_kind: 'video_prompt', capability: 'video_generation' },
  });
  const created = await callVideoCreate({ ...providerConfig, orgId: authContext.orgId }, prompt, {
    seconds: settings.seconds || body?.seconds,
    size: settings.size || body?.size,
    inputReference: firstSource,
  });
  const assistantMessage = await insertAiMessage(supabaseUrl, serviceRoleKey, authContext, {
    thread_id: thread.id,
    role: 'assistant',
    content: 'در حال ساخت ویدیو... (ممکن است چند دقیقه طول بکشد)',
    provider: created.provider,
    model: created.model,
    metadata: {
      capability: 'video_generation',
      status: 'processing',
      video_id: created.videoId,
      prompt,
      seconds: created.seconds,
      avalai_request_id: created.requestId || null,
    },
  });
  await restPatch(supabaseUrl, serviceRoleKey, 'ai_threads', { id: `eq.${thread.id}`, org_id: `eq.${authContext.orgId}` }, {
    updated_at: new Date().toISOString(),
    metadata: {
      ...(thread?.metadata || {}),
      last_activity_kind: 'video_generation',
      last_message_preview: prompt.slice(0, 300),
      composer_preferences: buildThreadComposerPreferences(body, thread),
    },
  }).catch(() => []);
  return json(200, {
    success: true,
    threadId: thread.id,
    userMessageId: userMessage?.id || null,
    messageId: assistantMessage?.id || null,
    videoId: created.videoId,
    status: created.status || 'processing',
    progress: created.progress,
    provider: created.provider,
    model: created.model,
  });
};

const handleGetVideoStatus = async (supabaseUrl: string, serviceRoleKey: string, authContext: any, body: any) => {
  const videoId = String(body?.videoId || body?.video_id || '').trim();
  const messageId = normalizeId(body?.messageId);
  if (!videoId) return json(400, { success: false, message: 'شناسه ویدیو ارسال نشده است.' });
  const providerConfig = await resolveProviderConfig(supabaseUrl, serviceRoleKey, authContext, 'video_generation');
  const statusResult = await callVideoStatus({ ...providerConfig, orgId: authContext.orgId }, videoId);

  if (statusResult.status === 'completed') {
    const rawContext = normalizeContext(body?.context || {});
    const pageContext = await buildPermittedPageContext(supabaseUrl, serviceRoleKey, authContext, rawContext);
    const content = await callVideoContent({ ...providerConfig, orgId: authContext.orgId }, videoId);
    const storedVideo = await uploadGeneratedBinaryAsset(supabaseUrl, serviceRoleKey, authContext, content.bytes, content.contentType, {
      prefix: 'video',
      extension: 'mp4',
    });
    const fileManagerResult = await registerAiGeneratedFileInFileManager(supabaseUrl, serviceRoleKey, authContext, pageContext, storedVideo, {
      displayName: `ویدیو هوش مصنوعی ${new Date().toISOString().slice(0, 10)}.mp4`,
      fileType: 'video',
      threadId: normalizeId(body?.threadId),
      messageId,
      prompt: String(body?.prompt || ''),
    }).catch((error) => {
      console.warn('Could not register generated video in file manager', error);
      return null;
    });
    const fileResult = {
      ...storedVideo,
      asset_id: fileManagerResult?.asset?.id || null,
      entry_id: fileManagerResult?.entry?.id || null,
      folder_id: fileManagerResult?.folder?.id || null,
    };
    const usageMetadata = { provider: providerConfig.provider, model: providerConfig.model, capability: 'video_generation', video_seconds: statusResult.seconds };
    const ledger = await recordAiUsageLedger(supabaseUrl, serviceRoleKey, authContext, {
      threadId: normalizeId(body?.threadId),
      messageId,
      capability: 'video_generation',
      provider: providerConfig.provider,
      model: providerConfig.model,
      usageMetadata,
      metadata: { source: 'video_generation', video_id: videoId, storage_path: storedVideo.path },
    });
    if (messageId) {
      await restPatch(supabaseUrl, serviceRoleKey, 'ai_messages', { id: `eq.${messageId}`, org_id: `eq.${authContext.orgId}` }, {
        content: 'ویدیو آماده شد.',
        metadata: { capability: 'video_generation', status: 'completed', video_id: videoId, file: fileResult, usage: withCustomerBilling(usageMetadata, ledger) },
      }).catch(() => []);
    }
    return json(200, { success: true, status: 'completed', progress: 100, file: fileResult, usage: withCustomerBilling(usageMetadata, ledger), ledger });
  }

  if (statusResult.status === 'failed') {
    if (messageId) {
      await restPatch(supabaseUrl, serviceRoleKey, 'ai_messages', { id: `eq.${messageId}`, org_id: `eq.${authContext.orgId}` }, {
        content: 'ساخت ویدیو ناموفق بود.',
        metadata: { capability: 'video_generation', status: 'failed', video_id: videoId },
      }).catch(() => []);
    }
    return json(200, { success: true, status: 'failed', progress: statusResult.progress });
  }

  return json(200, { success: true, status: statusResult.status || 'processing', progress: statusResult.progress });
};

const normalizeReplyDraftMessages = (items: any[]) =>
  (Array.isArray(items) ? items : [])
    .map((item: any, index: number) => {
      const text = String(item?.text || item?.content || '').trim();
      if (!text) return null;
      const direction = String(item?.direction || '').trim().toLowerCase();
      const role = direction === 'outbound' || direction === 'assistant' || direction === 'agent'
        ? 'agent'
        : direction === 'inbound' || direction === 'user' || direction === 'customer'
        ? 'customer'
        : 'unknown';
      return {
        index: index + 1,
        role,
        direction: direction || null,
        author_name: String(item?.authorName || item?.author_name || '').trim() || null,
        created_at: String(item?.createdAt || item?.created_at || '').trim() || null,
        text: text.slice(0, 2400),
      };
    })
    .filter(Boolean)
    .slice(-18);

const getNumericTotal = (rows: any[], keys: string[]) =>
  (rows || []).reduce((sum: number, row: any) => {
    const next = keys.reduce((acc, key) => {
      if (acc !== null) return acc;
      const raw = row?.[key];
      const parsed = typeof raw === 'string' ? Number(raw) : Number(raw ?? NaN);
      return Number.isFinite(parsed) ? parsed : null;
    }, null as number | null);
    return sum + (next || 0);
  }, 0);

const fetchPermittedSingleRecord = async (
  supabaseUrl: string,
  serviceRoleKey: string,
  authContext: any,
  moduleId: string,
  recordId: string,
) => {
  if (!moduleId || !recordId || !ALLOWED_MODULES.has(moduleId) || !isUuid(recordId)) return null;
  const perm = getModulePermission(authContext.permissions, moduleId);
  if (!canViewModule(perm)) return null;
  const recordScope = getRecordScope(perm);
  const rows = await safeRestSelect(supabaseUrl, serviceRoleKey, moduleId, {
    id: `eq.${recordId}`,
    select: '*',
    limit: 1,
  });
  const row = rows[0] || null;
  if (!row || !canAccessAssignedRecord(row, authContext, recordScope)) return null;
  return sanitizeRecord(row, perm);
};

const fetchPermittedRowsByAnyFilter = async (
  supabaseUrl: string,
  serviceRoleKey: string,
  authContext: any,
  moduleId: string,
  filters: Array<Record<string, string | number>>,
  limit = 8,
) => {
  for (const params of filters) {
    const rows = await fetchPermittedRows(supabaseUrl, serviceRoleKey, authContext, moduleId, params, limit);
    if (rows.length > 0) return rows;
  }
  return [];
};

const fetchCounterpartyBusinessContext = async (
  supabaseUrl: string,
  serviceRoleKey: string,
  authContext: any,
  counterparty: { moduleId: 'customers' | 'suppliers'; recordId: string } | null,
) => {
  if (!counterparty?.moduleId || !counterparty?.recordId) {
    return {
      counterparty: null,
      invoices: [],
      projects: [],
      payments: [],
      financial_summary: null,
    };
  }

  const counterpartyRecord = await fetchPermittedSingleRecord(
    supabaseUrl,
    serviceRoleKey,
    authContext,
    counterparty.moduleId,
    counterparty.recordId,
  );

  if (!counterpartyRecord) {
    return {
      counterparty: null,
      invoices: [],
      projects: [],
      payments: [],
      financial_summary: null,
    };
  }

  if (counterparty.moduleId === 'customers') {
    const [invoices, projects, payments] = await Promise.all([
      fetchPermittedRowsByAnyFilter(supabaseUrl, serviceRoleKey, authContext, 'invoices', [
        { customer_id: `eq.${counterparty.recordId}`, order: 'updated_at.desc' },
      ], 10),
      fetchPermittedRowsByAnyFilter(supabaseUrl, serviceRoleKey, authContext, 'projects', [
        { customer_id: `eq.${counterparty.recordId}`, order: 'updated_at.desc' },
      ], 10),
      fetchPermittedRowsByAnyFilter(supabaseUrl, serviceRoleKey, authContext, 'cash_bank_operations', [
        { customer_id: `eq.${counterparty.recordId}`, order: 'updated_at.desc' },
        { related_customer: `eq.${counterparty.recordId}`, order: 'updated_at.desc' },
        { counterparty_id: `eq.${counterparty.recordId}`, order: 'updated_at.desc' },
      ], 12),
    ]);
    const financialSummary = {
      invoice_count: invoices.length,
      project_count: projects.length,
      payment_count: payments.length,
      invoice_total_estimate: getNumericTotal(invoices, ['grand_total', 'total_amount', 'payable_total', 'amount_total']),
      payment_total_estimate: getNumericTotal(payments, ['amount', 'amount_total', 'value', 'debit', 'credit']),
      open_invoice_count: invoices.filter((row: any) => {
        const status = String(row?.status || '').trim().toLowerCase();
        return status && !['paid', 'settled', 'completed', 'closed', 'done'].includes(status);
      }).length,
    };
    return {
      counterparty: counterpartyRecord,
      invoices,
      projects,
      payments,
      financial_summary: financialSummary,
    };
  }

  const [purchaseInvoices, projects, payments] = await Promise.all([
    fetchPermittedRowsByAnyFilter(supabaseUrl, serviceRoleKey, authContext, 'purchase_invoices', [
      { supplier_id: `eq.${counterparty.recordId}`, order: 'updated_at.desc' },
    ], 10),
    fetchPermittedRowsByAnyFilter(supabaseUrl, serviceRoleKey, authContext, 'projects', [
      { supplier_id: `eq.${counterparty.recordId}`, order: 'updated_at.desc' },
      { contractor_supplier_id: `eq.${counterparty.recordId}`, order: 'updated_at.desc' },
    ], 10),
    fetchPermittedRowsByAnyFilter(supabaseUrl, serviceRoleKey, authContext, 'cash_bank_operations', [
      { supplier_id: `eq.${counterparty.recordId}`, order: 'updated_at.desc' },
      { related_supplier: `eq.${counterparty.recordId}`, order: 'updated_at.desc' },
      { counterparty_id: `eq.${counterparty.recordId}`, order: 'updated_at.desc' },
    ], 12),
  ]);
  const financialSummary = {
    invoice_count: purchaseInvoices.length,
    project_count: projects.length,
    payment_count: payments.length,
    invoice_total_estimate: getNumericTotal(purchaseInvoices, ['grand_total', 'total_amount', 'payable_total', 'amount_total']),
    payment_total_estimate: getNumericTotal(payments, ['amount', 'amount_total', 'value', 'debit', 'credit']),
    open_invoice_count: purchaseInvoices.filter((row: any) => {
      const status = String(row?.status || '').trim().toLowerCase();
      return status && !['paid', 'settled', 'completed', 'closed', 'done'].includes(status);
    }).length,
  };
  return {
    counterparty: counterpartyRecord,
    invoices: purchaseInvoices,
    projects,
    payments,
    financial_summary: financialSummary,
  };
};

const fetchReplyCrossModuleContext = async (
  supabaseUrl: string,
  serviceRoleKey: string,
  authContext: any,
) => {
  const [products, productBundles, priceLists, purchaseInvoices, recentCustomers, recentSuppliers] = await Promise.all([
    fetchPermittedRowsByAnyFilter(supabaseUrl, serviceRoleKey, authContext, 'products', [
      { order: 'updated_at.desc' },
    ], 10),
    fetchPermittedRowsByAnyFilter(supabaseUrl, serviceRoleKey, authContext, 'product_bundles', [
      { order: 'updated_at.desc' },
    ], 10),
    fetchPermittedRowsByAnyFilter(supabaseUrl, serviceRoleKey, authContext, 'price_lists', [
      { order: 'updated_at.desc' },
    ], 8),
    fetchPermittedRowsByAnyFilter(supabaseUrl, serviceRoleKey, authContext, 'purchase_invoices', [
      { order: 'updated_at.desc' },
    ], 8),
    fetchPermittedRowsByAnyFilter(supabaseUrl, serviceRoleKey, authContext, 'customers', [
      { order: 'updated_at.desc' },
    ], 8),
    fetchPermittedRowsByAnyFilter(supabaseUrl, serviceRoleKey, authContext, 'suppliers', [
      { order: 'updated_at.desc' },
    ], 8),
  ]);

  const users = authContext?.orgId
    ? await safeRestSelect(supabaseUrl, serviceRoleKey, 'profiles', {
      org_id: `eq.${authContext.orgId}`,
      select: 'id,full_name,email,mobile_1,mobile,role_id,job_title,position,team,updated_at',
      order: 'updated_at.desc',
      limit: 20,
    })
    : [];

  return {
    products,
    product_bundles: productBundles,
    price_lists: priceLists,
    purchase_invoices: purchaseInvoices,
    recent_customers: recentCustomers,
    recent_suppliers: recentSuppliers,
    users: (users || []).map((row: any) => ({
      id: row?.id || null,
      full_name: row?.full_name || null,
      email: row?.email || null,
      mobile: row?.mobile_1 || row?.mobile || null,
      role_id: row?.role_id || null,
      job_title: row?.job_title || null,
      position: row?.position || null,
      team: row?.team || null,
    })),
  };
};

const handleSuggestReply = async (supabaseUrl: string, serviceRoleKey: string, authContext: any, body: any) => {
  const channel = String(body?.channel || '').trim().toLowerCase();
  if (channel !== 'sms' && channel !== 'bot') {
    return json(400, { success: false, message: 'کانال پیشنهاد پاسخ معتبر نیست.' });
  }

  const rawContext = normalizeContext(body?.context || {});
  const contextForReply: RequestContext = rawContext.moduleId
    ? rawContext
    : {
      route: '/notifications',
      mode: 'page',
      moduleId: null,
      recordId: null,
      visibleRecordIds: [],
      selectedRecordIds: [],
    };

  const contextKey = buildContextKey(contextForReply);
  const [providerConfig, companyContext] = await Promise.all([
    resolveProviderConfig(supabaseUrl, serviceRoleKey, authContext, 'customer_reply_suggestion'),
    loadCompanyContext(supabaseUrl, serviceRoleKey, authContext),
  ]);
  await assertAiCapabilityEnabled(supabaseUrl, serviceRoleKey, authContext, providerConfig.orgAiSettings, 'customer_reply_suggestion');
  const thread = await ensureThread(supabaseUrl, serviceRoleKey, authContext, {
    threadId: body?.threadId || null,
    title: channel === 'sms' ? 'پیشنهاد پاسخ پیامک' : 'پیشنهاد پاسخ بات',
    pageContext: { context: contextForReply, moduleId: contextForReply.moduleId || null, recordId: contextForReply.recordId || null, summary: 'reply_suggestion' },
    contextKey: `reply:${channel}:${contextKey}`,
    provider: providerConfig.provider,
    model: providerConfig.model,
  });

  let counterpartyModuleId = String(body?.counterparty?.moduleId || body?.counterpartyModuleId || contextForReply.moduleId || '').trim();
  let counterpartyRecordId = String(body?.counterparty?.recordId || body?.counterpartyRecordId || contextForReply.recordId || '').trim();

  if ((!counterpartyModuleId || !counterpartyRecordId) && channel === 'bot') {
    const botGroupId = normalizeId(body?.botGroupId);
    if (isUuid(botGroupId)) {
      const rows = await safeRestSelect(supabaseUrl, serviceRoleKey, 'counterparty_bot_groups', {
        id: `eq.${botGroupId}`,
        org_id: `eq.${authContext.orgId}`,
        select: 'id,target_type,customer_id,supplier_id,channel_type,group_title,bot_chat_id,status',
        limit: 1,
      });
      const group = rows[0] || null;
      if (group) {
        const type = String(group?.target_type || '').trim();
        if (type === 'customers' && group?.customer_id) {
          counterpartyModuleId = 'customers';
          counterpartyRecordId = String(group.customer_id);
        } else if (type === 'suppliers' && group?.supplier_id) {
          counterpartyModuleId = 'suppliers';
          counterpartyRecordId = String(group.supplier_id);
        }
      }
    }
  }

  const counterparty =
    (counterpartyModuleId === 'customers' || counterpartyModuleId === 'suppliers') && isUuid(counterpartyRecordId)
      ? { moduleId: counterpartyModuleId as 'customers' | 'suppliers', recordId: counterpartyRecordId }
      : null;

  const incomingDraftMessages = normalizeReplyDraftMessages(body?.recentMessages || []);
  const fallbackQuery = incomingDraftMessages.map((item: any) => item.text).join(' ');
  const phoneHint = String(body?.phone || body?.phoneNumber || '').trim();
  let recentMessages = incomingDraftMessages;

  if (recentMessages.length === 0 && channel === 'bot') {
    const botGroupId = normalizeId(body?.botGroupId);
    if (isUuid(botGroupId)) {
      const rows = await safeRestSelect(supabaseUrl, serviceRoleKey, 'counterparty_bot_messages', {
        bot_group_id: `eq.${botGroupId}`,
        org_id: `eq.${authContext.orgId}`,
        select: 'id,direction,content_text,payload,created_at',
        order: 'created_at.desc',
        limit: 18,
      });
      recentMessages = (rows || [])
        .slice()
        .reverse()
        .map((row: any, index: number) => ({
          index: index + 1,
          role: String(row?.direction || '').trim() === 'outbound' ? 'agent' : 'customer',
          direction: String(row?.direction || '').trim() || null,
          author_name: String((row?.payload as any)?.sender_display_name || '').trim() || null,
          created_at: String(row?.created_at || '').trim() || null,
          text: String(row?.content_text || '').trim().slice(0, 2400),
        }))
        .filter((item: any) => item.text);
    }
  }

  if (recentMessages.length === 0 && channel === 'sms' && phoneHint) {
    const rows = await safeRestSelect(supabaseUrl, serviceRoleKey, 'sms_delivery_reports', {
      org_id: `eq.${authContext.orgId}`,
      phone_number: `eq.${phoneHint}`,
      select: 'id,direction,message_text,message_at,created_at,sender,recipient',
      order: 'message_at.desc',
      limit: 18,
    });
    recentMessages = (rows || [])
      .slice()
      .reverse()
      .map((row: any, index: number) => ({
        index: index + 1,
        role: String(row?.direction || '').trim() === 'outbound' ? 'agent' : 'customer',
        direction: String(row?.direction || '').trim() || null,
        author_name: String(row?.direction || '').trim() === 'outbound' ? 'کاربر سازمان' : String(row?.sender || '').trim() || null,
        created_at: String(row?.message_at || row?.created_at || '').trim() || null,
        text: String(row?.message_text || '').trim().slice(0, 2400),
      }))
      .filter((item: any) => item.text);
  }

  const businessContext = await fetchCounterpartyBusinessContext(supabaseUrl, serviceRoleKey, authContext, counterparty);
  const knowledgeQuery = [
    fallbackQuery,
    String(body?.instruction || '').trim(),
    channel === 'sms' ? 'پیشنهاد پاسخ پیامک مشتری' : 'پیشنهاد پاسخ گفتگوی بات مشتری',
  ]
    .filter(Boolean)
    .join('\n');
  const [knowledgeChunks, crossModuleContext] = await Promise.all([
    fetchKnowledgeChunks(supabaseUrl, serviceRoleKey, authContext, knowledgeQuery, { moduleId: counterparty?.moduleId || contextForReply.moduleId || null }),
    fetchReplyCrossModuleContext(supabaseUrl, serviceRoleKey, authContext),
  ]);
  const retrievedContexts = await fetchRelevantModuleContexts(
    supabaseUrl,
    serviceRoleKey,
    authContext,
    [knowledgeQuery, recentMessages.map((item: any) => item.text).join('\n')].filter(Boolean).join('\n'),
    { moduleId: counterparty?.moduleId || contextForReply.moduleId || null },
  );
  const userContext = buildUserPromptContext(authContext);

  const payload = {
    request: {
      channel,
      tone: String(body?.tone || '').trim() || 'professional',
      instruction: String(body?.instruction || '').trim() || null,
    },
    company: companyContext,
    requester: userContext,
    active_context: {
      module_id: contextForReply.moduleId || null,
      record_id: contextForReply.recordId || null,
      phone: phoneHint || null,
    },
    counterparty: {
      module_id: counterparty?.moduleId || null,
      record_id: counterparty?.recordId || null,
      profile: businessContext.counterparty,
      financial_summary: businessContext.financial_summary,
      recent_invoices: businessContext.invoices.slice(0, 6),
      recent_projects: businessContext.projects.slice(0, 6),
      recent_payments: businessContext.payments.slice(0, 8),
    },
    cross_module_context: crossModuleContext,
    conversation: recentMessages.slice(-16),
    retrieved_contexts: retrievedContexts.slice(0, 4),
    ai_instructions: knowledgeChunks
      .filter(isSystemAiInstructionChunk)
      .slice(0, 2)
      .map((chunk, index) => ({
        index: index + 1,
        id: chunk.id,
        title: chunk?.metadata?.document_title || null,
        content: String(chunk?.content || '').slice(0, 1100),
      })),
    operational_instructions: knowledgeChunks
      .filter(isOperationalInstructionChunk)
      .slice(0, 2)
      .map((chunk, index) => ({
        index: index + 1,
        id: chunk.id,
        title: chunk?.metadata?.document_title || null,
        content: String(chunk?.content || '').slice(0, 1100),
      })),
    organization_knowledge: knowledgeChunks
      .filter((chunk: any) =>
        !isSystemAiInstructionChunk(chunk)
        && !isOperationalInstructionChunk(chunk)
      )
      .map((chunk, index) => ({
        index: index + 1,
        id: chunk.id,
        title: chunk?.metadata?.document_title || null,
        content: String(chunk?.content || '').slice(0, 1100),
      })),
  };

  const aiResult = await callChatCompletions(providerConfig, [
    {
      role: 'system',
      content:
        'شما دستیار پاسخ‌دهی سازمانی KalamApp هستید. فقط متن «پاسخ پیشنهادی قابل ارسال برای مشتری» را بنویسید. از پیام‌های مکالمه اخیر، نقش سازمانی کاربر، وضعیت مشتری/تامین‌کننده، سوابق فاکتور/پروژه/پرداخت مجاز، اطلاعات کالا/خدمت، لیست قیمت، پکیج‌ها، فاکتورهای خرید، اطلاعات مشتریان/کاربران مجاز، operational_instructions به‌عنوان دستورالعمل‌های کاری مرتبط، و اسناد/قوانین سازمان استفاده کنید. اگر اطلاعات قطعی نیست، با عبارت محتاطانه و بدون ادعای قطعی بنویسید. خروجی باید فارسی، حرفه‌ای، روشن، کوتاه و اجرایی باشد. Markdown، عنوان، توضیح فرایند و متن اضافی ننویسید.',
    },
    {
      role: 'user',
      content: JSON.stringify(payload),
    },
  ], {
    temperature: 0.22,
    maxTokens: 460,
    safetyIdentifier: `org_${authContext.orgId}_user_${authContext.userId}_cap_customer_reply_suggestion`,
  });

  const suggestedReply = String(aiResult.content || '').replace(/^["'`]+|["'`]+$/g, '').trim();
  if (!suggestedReply) {
    throw new Error('پاسخ پیشنهادی معتبر از AI دریافت نشد.');
  }

  const userMessage = await insertAiMessage(supabaseUrl, serviceRoleKey, authContext, {
    thread_id: thread.id,
    role: 'user',
    content: `reply_suggestion:${channel}`,
    provider: providerConfig.provider,
    model: providerConfig.model,
    metadata: {
      context_key: `reply:${channel}:${contextKey}`,
      source: 'notifications_chat_reply_suggest',
      channel,
      counterparty_module_id: counterparty?.moduleId || null,
      counterparty_record_id: counterparty?.recordId || null,
      conversation_size: recentMessages.length,
      knowledge_chunk_ids: knowledgeChunks.map((chunk) => chunk.id),
    },
  });

  const assistantMessage = await insertAiMessage(supabaseUrl, serviceRoleKey, authContext, {
    thread_id: thread.id,
    role: 'assistant',
    content: suggestedReply,
    provider: aiResult.provider,
    model: aiResult.model,
    metadata: {
      source: 'reply_suggestion',
      channel,
      usage: aiResult.usageMetadata,
      avalai_request_id: aiResult.requestId || null,
      context_key: `reply:${channel}:${contextKey}`,
      counterparty_module_id: counterparty?.moduleId || null,
      counterparty_record_id: counterparty?.recordId || null,
      financial_summary: businessContext.financial_summary,
      related_modules: counterparty?.moduleId === 'customers'
        ? ['invoices', 'projects', 'cash_bank_operations']
        : counterparty?.moduleId === 'suppliers'
        ? ['purchase_invoices', 'projects', 'cash_bank_operations']
        : [],
      cross_module_context_sizes: {
        products: crossModuleContext.products.length,
        product_bundles: crossModuleContext.product_bundles.length,
        price_lists: crossModuleContext.price_lists.length,
        purchase_invoices: crossModuleContext.purchase_invoices.length,
        recent_customers: crossModuleContext.recent_customers.length,
        recent_suppliers: crossModuleContext.recent_suppliers.length,
        users: crossModuleContext.users.length,
      },
      retrieved_context_modules: retrievedContexts.map((ctx: any) => ctx.moduleId),
    },
  });

  await restPatch(supabaseUrl, serviceRoleKey, 'ai_threads', { id: `eq.${thread.id}`, org_id: `eq.${authContext.orgId}` }, {
    updated_at: new Date().toISOString(),
    provider: aiResult.provider,
    model: aiResult.model,
    context_type: getContextKind(contextForReply || {}),
    module_id: counterparty?.moduleId || contextForReply.moduleId || null,
    record_id: counterparty?.recordId || contextForReply.recordId || null,
    metadata: {
      ...(thread?.metadata || {}),
      last_reply_suggestion_at: new Date().toISOString(),
      reply_channel: channel,
      context_kind: counterparty ? 'record' : getContextKind(contextForReply || {}),
      context_label: counterparty
        ? `پاسخ ${channel === 'sms' ? 'پیامک' : 'بات'} برای ${counterparty.moduleId}`
        : buildThreadContextLabel({ context: contextForReply, moduleId: contextForReply.moduleId || null, recordId: contextForReply.recordId || null }),
      context: contextForReply,
      module_id: counterparty?.moduleId || contextForReply.moduleId || null,
      record_id: counterparty?.recordId || contextForReply.recordId || null,
      last_activity_kind: 'reply_suggestion',
      last_message_preview: suggestedReply.slice(0, 300),
    },
  });

  const ledger = await recordAiUsageLedger(supabaseUrl, serviceRoleKey, authContext, {
    threadId: thread.id,
    messageId: assistantMessage?.id || null,
    requestId: aiResult.requestId,
    capability: 'customer_reply_suggestion',
    provider: aiResult.provider,
    model: aiResult.model,
    usageMetadata: aiResult.usageMetadata,
    metadata: { source: 'reply_suggestion', channel, context_key: `reply:${channel}:${contextKey}` },
  });
  await patchAiMessageCustomerBilling(supabaseUrl, serviceRoleKey, authContext, assistantMessage, aiResult.usageMetadata, ledger);

  return json(200, {
    success: true,
    threadId: thread.id,
    userMessageId: userMessage?.id || null,
    messageId: assistantMessage?.id || null,
    suggestedReply,
    provider: aiResult.provider,
    model: aiResult.model,
    usage: withCustomerBilling(aiResult.usageMetadata, ledger),
    ledger,
    context: {
      channel,
      counterpartyModuleId: counterparty?.moduleId || null,
      counterpartyRecordId: counterparty?.recordId || null,
      conversationMessages: recentMessages.length,
      retrievedContextModules: retrievedContexts.map((ctx: any) => ctx.moduleId),
      knowledgeSources: knowledgeChunks.map((chunk) => ({
        id: chunk.id,
        documentId: chunk.document_id,
        title: chunk?.metadata?.document_title || null,
        chunkIndex: chunk.chunk_index,
      })),
    },
  });
};

const parseModelsResponse = (parsed: any) => {
  const list = Array.isArray(parsed?.data)
    ? parsed.data
    : Array.isArray(parsed?.models)
    ? parsed.models
    : Array.isArray(parsed)
    ? parsed
    : [];
  return list
    .map((item: any) => {
      if (typeof item === 'string') return { id: item, label: item };
      const id = String(item?.id || item?.name || item?.model || '').trim();
      if (!id) return null;
      return {
        id,
        label: String(item?.display_name || item?.label || item?.name || id).trim(),
        raw: item,
      };
    })
    .filter(Boolean);
};

const handleListModels = async (supabaseUrl: string, serviceRoleKey: string, authContext: any, body: any) => {
  if (!canManageAiSettings(authContext)) {
    return json(403, { success: false, message: 'دسترسی مشاهده مدل‌های AI را ندارید.' });
  }
  const catalogRows = await safeRestSelect(supabaseUrl, serviceRoleKey, 'ai_model_catalog', {
    is_active: 'eq.true',
    select: '*',
    order: 'id.asc',
    limit: 200,
  });
  if (catalogRows.length > 0) {
    return json(200, {
      success: true,
      models: catalogRows.filter((row: any) => row?.is_coming_soon !== true).map((row: any) => ({
        id: row.id,
        label: row.display_name_fa || row.id,
        capability_tags: row.capability_tags || [],
        pricing: row,
      })),
      raw: { source: 'ai_model_catalog' },
    });
  }
  const providerConfig = getCentralProviderConfig();
  if (!providerConfig.apiKey) {
    return json(200, {
      success: true,
      models: [],
      warning: 'کلید مرکزی AI تنظیم نشده است و catalog مدل‌ها هم خالی است.',
    });
  }
  const { response, baseUrl } = await requestAvalaiWithFallback(providerConfig, '/models', {
    method: 'GET',
    headers: { Authorization: `Bearer ${providerConfig.apiKey}`, 'Content-Type': 'application/json' },
  });
  const raw = await response.text();
  const parsed = parseJsonSafe(raw);
  if (!response.ok) {
    return json(200, {
      success: true,
      models: [],
      warning: 'Provider لیست مدل‌ها را از مسیر OpenAI-compatible /models برنگرداند و catalog مدل‌ها هم خالی است.',
      raw: parsed,
    });
  }
  return json(200, {
    success: true,
    models: parseModelsResponse(parsed),
    raw: { ...parsed, baseUrl },
  });
};

const handleTestProvider = async (supabaseUrl: string, serviceRoleKey: string, authContext: any, body: any) => {
  if (!canManageAiSettings(authContext)) {
    return json(403, { success: false, message: 'دسترسی مدیریت اتصالات AI را ندارید.' });
  }
  const providerConfig = await resolveProviderConfig(supabaseUrl, serviceRoleKey, authContext, 'dashboard_chat');
  const result = await callChatCompletions(providerConfig, [
    { role: 'system', content: 'فقط عبارت «اتصال برقرار است» را برگردان.' },
    { role: 'user', content: 'تست اتصال' },
  ], { temperature: 0, maxTokens: 30, safetyIdentifier: `org_${authContext.orgId}_test_provider` });
  await recordAiUsageLedger(supabaseUrl, serviceRoleKey, authContext, {
    capability: 'dashboard_chat',
    provider: result.provider,
    model: result.model,
    requestId: result.requestId,
    usageMetadata: result.usageMetadata,
    metadata: { source: 'test_provider' },
  });
  return json(200, {
    success: true,
    message: result.content || 'اتصال برقرار است',
    provider: result.provider,
    model: result.model,
    usage: result.usageMetadata,
  });
};

const normalizeCreditPayload = (payload: any) => {
  const flat = payload && typeof payload === 'object' ? payload : { value: payload };
  const candidates = [
    flat.balance,
    flat.credit,
    flat.credits,
    flat.remaining,
    flat.remaining_credit,
    flat.total_available,
    flat?.data?.balance,
    flat?.data?.credit,
    flat?.data?.remaining,
  ].filter((item) => item !== null && item !== undefined && item !== '');
  return {
    value: candidates[0] ?? null,
    currency: flat.currency || flat?.data?.currency || flat.unit || null,
    rial: flat.rial || flat.rials || flat.amount_rial || flat?.data?.rial || flat?.data?.amount_rial || null,
    toman: flat.toman || flat.tomans || flat.amount_toman || flat?.data?.toman || flat?.data?.amount_toman || null,
    token: flat.token || flat.tokens || flat.remaining_tokens || flat?.data?.tokens || null,
    raw: payload,
  };
};

const handleGetCredit = async (supabaseUrl: string, serviceRoleKey: string, authContext: any, body: any) => {
  if (!canManageAiSettings(authContext)) {
    return json(403, { success: false, message: 'دسترسی مدیریت اتصالات AI را ندارید.' });
  }
  const providerCredit = await fetchAvalaiCredit(getCentralProviderConfig());
  return json(200, {
    success: true,
    ...providerCredit,
    credit: providerCredit.available ? normalizeCreditPayload(providerCredit.credit) : null,
  });
};

const handleEmbedDocumentChunks = async (supabaseUrl: string, serviceRoleKey: string, authContext: any, body: any) => {
  if (!canManageAiSettings(authContext)) {
    return json(403, { success: false, message: 'دسترسی بازسازی embedding اسناد را ندارید.' });
  }
  const settings = await ensureOrgAiSettings(supabaseUrl, serviceRoleKey, authContext);
  await assertAiCapabilityEnabled(supabaseUrl, serviceRoleKey, authContext, settings, 'embedding');
  const documentId = normalizeId(body?.documentId || body?.document_id);
  if (!isUuid(documentId)) return json(400, { success: false, message: 'شناسه سند معتبر نیست.' });
  const chunks = await restSelect(supabaseUrl, serviceRoleKey, 'document_chunks', {
    org_id: `eq.${authContext.orgId}`,
    document_id: `eq.${documentId}`,
    status: 'eq.active',
    select: 'id,content,embedding_status',
    order: 'chunk_index.asc',
    limit: 80,
  });
  if (chunks.length === 0) {
    return json(200, { success: true, processed: 0, failed: 0, message: 'بخشی برای embedding پیدا نشد.' });
  }
  const providerConfig = getCentralProviderConfig();
  const jobRows = await restInsert(supabaseUrl, serviceRoleKey, 'ai_document_ingestion_jobs', [{
    org_id: authContext.orgId,
    document_id: documentId,
    status: 'running',
    job_type: 'embedding',
    created_by: authContext.userId,
  }]).catch(() => []);
  const job = jobRows[0] || null;
  let processed = 0;
  let failed = 0;
  for (const chunk of chunks.slice(0, 40)) {
    const chunkId = normalizeId(chunk?.id);
    const content = String(chunk?.content || '').trim();
    if (!chunkId || !content) continue;
    try {
      const embeddingResult = await callEmbeddings(providerConfig, content.slice(0, 8000), DEFAULT_EMBEDDING_MODEL);
      await restPatch(supabaseUrl, serviceRoleKey, 'document_chunks', {
        id: `eq.${chunkId}`,
        org_id: `eq.${authContext.orgId}`,
      }, {
        embedding: `[${embeddingResult.embedding.join(',')}]`,
        embedding_model: DEFAULT_EMBEDDING_MODEL,
        embedding_dimension: 1536,
        embedding_status: 'ready',
        embedding_updated_at: new Date().toISOString(),
        embedding_error: null,
      });
      processed += 1;
      await recordAiUsageLedger(supabaseUrl, serviceRoleKey, authContext, {
        capability: 'embedding',
        provider: providerConfig.provider,
        model: DEFAULT_EMBEDDING_MODEL,
        requestId: embeddingResult.requestId,
        usageMetadata: embeddingResult.usageMetadata,
        metadata: { source: 'document_embedding', document_id: documentId, chunk_id: chunkId },
      });
    } catch (error: any) {
      failed += 1;
      await restPatch(supabaseUrl, serviceRoleKey, 'document_chunks', {
        id: `eq.${chunkId}`,
        org_id: `eq.${authContext.orgId}`,
      }, {
        embedding_status: 'failed',
        embedding_error: String(error?.message || error).slice(0, 500),
        embedding_updated_at: new Date().toISOString(),
      }).catch(() => []);
    }
  }
  if (job?.id) {
    await restPatch(supabaseUrl, serviceRoleKey, 'ai_document_ingestion_jobs', {
      id: `eq.${job.id}`,
      org_id: `eq.${authContext.orgId}`,
    }, {
      status: failed > 0 && processed === 0 ? 'failed' : 'completed',
      processed_chunks: processed,
      failed_chunks: failed,
      updated_at: new Date().toISOString(),
    }).catch(() => []);
  }
  return json(200, { success: true, processed, failed });
};

const handleRebuildInstructionAiContext = async (supabaseUrl: string, serviceRoleKey: string, authContext: any, body: any) => {
  if (!canRebuildInstructionAiContext(authContext)) {
    return json(403, { success: false, message: 'دسترسی بازسازی دستورالعمل برای هوش مصنوعی را ندارید.' });
  }
  const instructionId = normalizeId(body?.instructionId || body?.instruction_id);
  if (!isUuid(instructionId)) return json(400, { success: false, message: 'شناسه دستورالعمل معتبر نیست.' });

  const settings = await ensureOrgAiSettings(supabaseUrl, serviceRoleKey, authContext);
  await assertAiCapabilityEnabled(supabaseUrl, serviceRoleKey, authContext, settings, 'embedding');

  const rows = await restSelect(supabaseUrl, serviceRoleKey, 'instructions', {
    org_id: `eq.${authContext.orgId}`,
    id: `eq.${instructionId}`,
    select: 'id,org_id,name,system_code,status,department,module_ids,visible_to_user_ids,visible_to_role_ids,goal,body,tags,use_for_ai',
    limit: 1,
  });
  const instruction = rows[0] || null;
  if (!instruction) return json(404, { success: false, message: 'دستورالعمل در این سازمان پیدا نشد.' });

  await restDelete(supabaseUrl, serviceRoleKey, 'document_chunks', {
    org_id: `eq.${authContext.orgId}`,
    source_kind: 'eq.instruction',
    source_module_id: 'eq.instructions',
    source_record_id: `eq.${instructionId}`,
  });

  const now = new Date().toISOString();
  const status = String(instruction?.status || '').trim();
  const useForAi = instruction?.use_for_ai === true;
  const allowedStatuses = new Set(['approved', 'published']);
  const moduleIds = Array.isArray(instruction?.module_ids)
    ? Array.from(new Set(instruction.module_ids.map((item: any) => String(item || '').trim()).filter(Boolean)))
    : [];
  const allowedUserIds = normalizeIds(Array.isArray(instruction?.visible_to_user_ids) ? instruction.visible_to_user_ids : []);
  const allowedRoleIds = normalizeIds(Array.isArray(instruction?.visible_to_role_ids) ? instruction.visible_to_role_ids : []);
  const tags = Array.isArray(instruction?.tags)
    ? instruction.tags.map((item: any) => String(item || '').trim()).filter(Boolean)
    : [];
  const title = String(instruction?.name || '').trim() || 'دستورالعمل بدون عنوان';
  const content = [
    `عنوان دستورالعمل: ${title}`,
    instruction?.system_code ? `کد سیستمی: ${String(instruction.system_code).trim()}` : '',
    instruction?.department ? `دپارتمان: ${String(instruction.department).trim()}` : '',
    moduleIds.length ? `ماژول‌های مرتبط: ${moduleIds.join('، ')}` : '',
    tags.length ? `برچسب‌ها: ${tags.join('، ')}` : '',
    instruction?.goal ? `هدف:\n${String(instruction.goal).trim()}` : '',
    instruction?.body ? `متن دستورالعمل:\n${String(instruction.body).trim()}` : '',
  ].filter(Boolean).join('\n\n').trim();
  const contentHash = hashText(content);

  if (!useForAi || !allowedStatuses.has(status) || !content) {
    await restPatch(supabaseUrl, serviceRoleKey, 'instructions', {
      id: `eq.${instructionId}`,
      org_id: `eq.${authContext.orgId}`,
    }, {
      ai_index_status: 'skipped',
      ai_index_updated_at: now,
      ai_index_error: !useForAi
        ? null
        : !allowedStatuses.has(status)
        ? 'فقط دستورالعمل‌های تایید شده یا ابلاغ شده برای هوش مصنوعی استفاده می‌شوند.'
        : 'متنی برای آماده‌سازی هوش مصنوعی وجود ندارد.',
      ai_content_hash: contentHash,
      updated_at: now,
    });
    return json(200, {
      success: true,
      processed: 0,
      failed: 0,
      message: !useForAi
        ? 'استفاده از این دستورالعمل برای هوش مصنوعی غیرفعال است.'
        : 'این دستورالعمل در وضعیت قابل استفاده برای هوش مصنوعی نیست.',
    });
  }

  const providerConfig = getCentralProviderConfig();
  const chunks = splitTextIntoAiChunks(content, 1200).slice(0, 40);
  let processed = 0;
  let failed = 0;
  const insertRows: Record<string, any>[] = [];

  for (const [index, chunkContent] of chunks.entries()) {
    const baseRow: Record<string, any> = {
      org_id: authContext.orgId,
      document_id: null,
      chunk_index: index,
      content: chunkContent,
      content_hash: hashText(chunkContent),
      token_estimate: Math.ceil(chunkContent.length / 4),
      status: 'active',
      allowed_user_ids: allowedUserIds,
      allowed_role_ids: allowedRoleIds,
      source_kind: 'instruction',
      source_module_id: 'instructions',
      source_record_id: instructionId,
      source_target_module_ids: moduleIds,
      metadata: {
        document_title: title,
        document_type: 'module_instruction',
        source_kind: 'instruction',
        source_module_id: 'instructions',
        source_record_id: instructionId,
        instruction_status: status,
        department: String(instruction?.department || '').trim() || null,
        module_ids: moduleIds,
        tags,
      },
    };
    try {
      const embeddingResult = await callEmbeddings(providerConfig, chunkContent.slice(0, 8000), DEFAULT_EMBEDDING_MODEL);
      insertRows.push({
        ...baseRow,
        embedding: `[${embeddingResult.embedding.join(',')}]`,
        embedding_model: DEFAULT_EMBEDDING_MODEL,
        embedding_dimension: 1536,
        embedding_status: 'ready',
        embedding_updated_at: now,
        embedding_error: null,
      });
      processed += 1;
      await recordAiUsageLedger(supabaseUrl, serviceRoleKey, authContext, {
        capability: 'embedding',
        provider: providerConfig.provider,
        model: DEFAULT_EMBEDDING_MODEL,
        requestId: embeddingResult.requestId,
        usageMetadata: embeddingResult.usageMetadata,
        metadata: { source: 'instruction_embedding', instruction_id: instructionId, chunk_index: index },
      });
    } catch (error: any) {
      failed += 1;
      insertRows.push({
        ...baseRow,
        embedding_status: 'failed',
        embedding_error: String(error?.message || error).slice(0, 500),
        embedding_updated_at: now,
      });
    }
  }

  if (insertRows.length > 0) {
    await restInsert(supabaseUrl, serviceRoleKey, 'document_chunks', insertRows);
  }

  const finalStatus = failed > 0 ? 'failed' : processed > 0 ? 'ready' : 'skipped';
  await restPatch(supabaseUrl, serviceRoleKey, 'instructions', {
    id: `eq.${instructionId}`,
    org_id: `eq.${authContext.orgId}`,
  }, {
    ai_index_status: finalStatus,
    ai_index_updated_at: now,
    ai_index_error: failed > 0 ? `${failed} بخش آماده نشد.` : null,
    ai_content_hash: contentHash,
    updated_at: now,
  });

  return json(200, {
    success: true,
    processed,
    failed,
    message: failed > 0
      ? `بازسازی انجام شد، اما ${failed.toLocaleString('fa-IR')} بخش خطا داشت.`
      : `دستورالعمل برای هوش مصنوعی آماده شد؛ ${processed.toLocaleString('fa-IR')} بخش ساخته شد.`,
  });
};

const handleRebuildJobDescriptionAiContext = async (supabaseUrl: string, serviceRoleKey: string, authContext: any, body: any) => {
  if (!canRebuildJobDescriptionAiContext(authContext)) {
    return json(403, { success: false, message: 'دسترسی بازسازی شرح شغل برای هوش مصنوعی را ندارید.' });
  }
  const jobDescriptionId = normalizeId(body?.jobDescriptionId || body?.job_description_id);
  if (!isUuid(jobDescriptionId)) return json(400, { success: false, message: 'شناسه شرح شغل معتبر نیست.' });

  const settings = await ensureOrgAiSettings(supabaseUrl, serviceRoleKey, authContext);
  await assertAiCapabilityEnabled(supabaseUrl, serviceRoleKey, authContext, settings, 'embedding');

  const rows = await restSelect(supabaseUrl, serviceRoleKey, 'job_descriptions', {
    org_id: `eq.${authContext.orgId}`,
    id: `eq.${jobDescriptionId}`,
    select: 'id,org_id,name,system_code,job_goal,job_responsibilities,job_duties,job_requirements,behavioral_traits,career_path,performance_kpi,competency_ksa,role_relationships,salary_calculation_notes,job_description_notes,tags,use_for_ai,assignee_id,assignee_type,assignee_role_id',
    limit: 1,
  });
  const jobDescription = rows[0] || null;
  if (!jobDescription) return json(404, { success: false, message: 'شرح شغل در این سازمان پیدا نشد.' });

  const perm = getModulePermission(authContext?.permissions, 'job_descriptions');
  if (!canAccessAssignedRecord(jobDescription, authContext, getRecordScope(perm))) {
    return json(403, { success: false, message: 'دسترسی به این شرح شغل را ندارید.' });
  }

  await restDelete(supabaseUrl, serviceRoleKey, 'document_chunks', {
    org_id: `eq.${authContext.orgId}`,
    source_kind: 'eq.job_description',
    source_module_id: 'eq.job_descriptions',
    source_record_id: `eq.${jobDescriptionId}`,
  });

  const now = new Date().toISOString();
  const useForAi = jobDescription?.use_for_ai === true;
  const tags = Array.isArray(jobDescription?.tags)
    ? jobDescription.tags.map((item: any) => String(item || '').trim()).filter(Boolean)
    : [];
  const title = String(jobDescription?.name || '').trim() || 'شرح شغل بدون عنوان';
  const content = [
    `عنوان شرح شغل: ${title}`,
    jobDescription?.system_code ? `کد سیستمی: ${String(jobDescription.system_code).trim()}` : '',
    tags.length ? `برچسب‌ها: ${tags.join('، ')}` : '',
    jobDescription?.job_goal ? `هدف:\n${String(jobDescription.job_goal).trim()}` : '',
    jobDescription?.job_responsibilities ? `مسئولیت‌ها:\n${String(jobDescription.job_responsibilities).trim()}` : '',
    jobDescription?.job_duties ? `شرح وظایف:\n${String(jobDescription.job_duties).trim()}` : '',
    jobDescription?.job_requirements ? `شرایط احراز:\n${String(jobDescription.job_requirements).trim()}` : '',
    jobDescription?.behavioral_traits ? `ویژگی‌های رفتاری:\n${String(jobDescription.behavioral_traits).trim()}` : '',
    jobDescription?.career_path ? `مسیر ارتقا:\n${String(jobDescription.career_path).trim()}` : '',
    jobDescription?.performance_kpi ? `شاخص‌های ارزیابی عملکرد:\n${String(jobDescription.performance_kpi).trim()}` : '',
    jobDescription?.competency_ksa ? `نظام شایستگی:\n${String(jobDescription.competency_ksa).trim()}` : '',
    jobDescription?.role_relationships ? `ارتباط با سایر نقش‌ها:\n${String(jobDescription.role_relationships).trim()}` : '',
    jobDescription?.salary_calculation_notes ? `محاسبه حقوق:\n${String(jobDescription.salary_calculation_notes).trim()}` : '',
    jobDescription?.job_description_notes ? `توضیحات تکمیلی:\n${String(jobDescription.job_description_notes).trim()}` : '',
  ].filter(Boolean).join('\n\n').trim();
  const contentHash = hashText(content);

  if (!useForAi || !content) {
    await restPatch(supabaseUrl, serviceRoleKey, 'job_descriptions', {
      id: `eq.${jobDescriptionId}`,
      org_id: `eq.${authContext.orgId}`,
    }, {
      ai_index_status: 'skipped',
      ai_index_updated_at: now,
      ai_index_error: !useForAi ? null : 'متنی برای آماده‌سازی هوش مصنوعی وجود ندارد.',
      ai_content_hash: contentHash,
      updated_at: now,
    });
    return json(200, {
      success: true,
      processed: 0,
      failed: 0,
      message: !useForAi
        ? 'استفاده از این شرح شغل برای هوش مصنوعی غیرفعال است.'
        : 'متنی برای آماده‌سازی هوش مصنوعی وجود ندارد.',
    });
  }

  const providerConfig = getCentralProviderConfig();
  const chunks = splitTextIntoAiChunks(content, 1200).slice(0, 40);
  let processed = 0;
  let failed = 0;
  const insertRows: Record<string, any>[] = [];

  for (const [index, chunkContent] of chunks.entries()) {
    const baseRow: Record<string, any> = {
      org_id: authContext.orgId,
      document_id: null,
      chunk_index: index,
      content: chunkContent,
      content_hash: hashText(chunkContent),
      token_estimate: Math.ceil(chunkContent.length / 4),
      status: 'active',
      allowed_user_ids: [],
      allowed_role_ids: [],
      source_kind: 'job_description',
      source_module_id: 'job_descriptions',
      source_record_id: jobDescriptionId,
      source_target_module_ids: ['job_descriptions', 'employees'],
      metadata: {
        document_title: title,
        document_type: 'job_description',
        source_kind: 'job_description',
        source_module_id: 'job_descriptions',
        source_record_id: jobDescriptionId,
        tags,
      },
    };
    try {
      const embeddingResult = await callEmbeddings(providerConfig, chunkContent.slice(0, 8000), DEFAULT_EMBEDDING_MODEL);
      insertRows.push({
        ...baseRow,
        embedding: `[${embeddingResult.embedding.join(',')}]`,
        embedding_model: DEFAULT_EMBEDDING_MODEL,
        embedding_dimension: 1536,
        embedding_status: 'ready',
        embedding_updated_at: now,
        embedding_error: null,
      });
      processed += 1;
      await recordAiUsageLedger(supabaseUrl, serviceRoleKey, authContext, {
        capability: 'embedding',
        provider: providerConfig.provider,
        model: DEFAULT_EMBEDDING_MODEL,
        requestId: embeddingResult.requestId,
        usageMetadata: embeddingResult.usageMetadata,
        metadata: { source: 'job_description_embedding', job_description_id: jobDescriptionId, chunk_index: index },
      });
    } catch (error: any) {
      failed += 1;
      insertRows.push({
        ...baseRow,
        embedding_status: 'failed',
        embedding_error: String(error?.message || error).slice(0, 500),
        embedding_updated_at: now,
      });
    }
  }

  if (insertRows.length > 0) {
    await restInsert(supabaseUrl, serviceRoleKey, 'document_chunks', insertRows);
  }

  const finalStatus = failed > 0 ? 'failed' : processed > 0 ? 'ready' : 'skipped';
  await restPatch(supabaseUrl, serviceRoleKey, 'job_descriptions', {
    id: `eq.${jobDescriptionId}`,
    org_id: `eq.${authContext.orgId}`,
  }, {
    ai_index_status: finalStatus,
    ai_index_updated_at: now,
    ai_index_error: failed > 0 ? `${failed} بخش آماده نشد.` : null,
    ai_content_hash: contentHash,
    updated_at: now,
  });

  return json(200, {
    success: true,
    processed,
    failed,
    message: failed > 0
      ? `بازسازی انجام شد، اما ${failed.toLocaleString('fa-IR')} بخش خطا داشت.`
      : `شرح شغل برای هوش مصنوعی آماده شد؛ ${processed.toLocaleString('fa-IR')} بخش ساخته شد.`,
  });
};

const handleProposeNote = async (supabaseUrl: string, serviceRoleKey: string, authContext: any, body: any) => {
  const userMessage = String(body?.message || '').trim() || 'برای این رکورد یک یادداشت کوتاه و کاربردی پیشنهاد بده.';
  const pageContext = await buildPermittedPageContext(supabaseUrl, serviceRoleKey, authContext, {
    ...(body?.context || {}),
    mode: 'record',
  });

  if (!pageContext.permitted || !pageContext.moduleId || !pageContext.recordId || pageContext.records.length === 0) {
    return json(403, { success: false, message: 'برای پیشنهاد یادداشت باید روی یک رکورد قابل دسترس باشید.' });
  }

  const knowledgeChunks = await fetchKnowledgeChunks(supabaseUrl, serviceRoleKey, authContext, userMessage, { moduleId: pageContext.moduleId });
  const providerConfig = await resolveProviderConfig(supabaseUrl, serviceRoleKey, authContext);
  const thread = await ensureThread(supabaseUrl, serviceRoleKey, authContext, {
    threadId: body?.threadId || null,
    title: `یادداشت ${pageContext.moduleId}`,
    pageContext,
    provider: providerConfig.provider,
    model: providerConfig.model,
  });

  const aiResult = await callChatCompletions(providerConfig, [
    {
      role: 'system',
      content:
        'شما دستیار KalamApp هستید. بر اساس Context مجاز، فقط متن یک یادداشت فارسی کوتاه، روشن و قابل ثبت روی رکورد بسازید. هیچ توضیح اضافه، عنوان، نقل قول یا markdown ننویسید.',
    },
    {
      role: 'user',
      content: JSON.stringify({
        request: userMessage,
        context: {
          summary: pageContext.summary,
          moduleId: pageContext.moduleId,
          recordId: pageContext.recordId,
          record: pageContext.records[0],
        },
        knowledge: knowledgeChunks.map((chunk) => ({
          title: chunk?.metadata?.document_title || null,
          content: String(chunk?.content || '').slice(0, 900),
        })),
      }),
    },
  ], { temperature: 0.25, maxTokens: 360 });

  const noteContent = String(aiResult.content || '').replace(/^["'`]+|["'`]+$/g, '').trim();
  if (!noteContent) throw new Error('Provider متن یادداشت معتبری برنگرداند.');

  const userAiMessage = await insertAiMessage(supabaseUrl, serviceRoleKey, authContext, {
    thread_id: thread.id,
    role: 'user',
    content: userMessage,
    provider: providerConfig.provider,
    model: providerConfig.model,
    metadata: {
      context_key: buildContextKey(pageContext.context || {}),
      context_summary: pageContext.summary,
      input_kind: 'propose_note',
      module_id: pageContext.moduleId,
      record_id: pageContext.recordId,
    },
  });

  const assistantMessage = await insertAiMessage(supabaseUrl, serviceRoleKey, authContext, {
    thread_id: thread.id,
    role: 'assistant',
    content: noteContent,
    provider: aiResult.provider,
    model: aiResult.model,
    metadata: {
      source: 'propose_note',
      context_key: buildContextKey(pageContext.context || {}),
      context_summary: pageContext.summary,
      usage: aiResult.usageMetadata,
      avalai_request_id: aiResult.requestId || null,
      module_id: pageContext.moduleId,
      record_id: pageContext.recordId,
    },
  });

  const actionRows = await restInsert(supabaseUrl, serviceRoleKey, 'ai_action_logs', [{
    org_id: authContext.orgId,
    thread_id: thread.id,
    action_type: 'send_note',
    status: 'proposed',
    module_id: pageContext.moduleId,
    record_id: pageContext.recordId,
    proposed_payload: {
      module_id: pageContext.moduleId,
      record_id: pageContext.recordId,
      content: noteContent,
      mention_user_ids: [authContext.userId],
      mention_role_ids: [],
      source_type: 'ai',
      author_name: AI_AUTHOR_NAME,
      provider: aiResult.provider,
      model: aiResult.model,
    },
    result: {},
    created_by: authContext.userId,
  }]);
  const action = actionRows[0] || null;

  await restPatch(supabaseUrl, serviceRoleKey, 'ai_threads', { id: `eq.${thread.id}`, org_id: `eq.${authContext.orgId}` }, {
    updated_at: new Date().toISOString(),
    provider: aiResult.provider,
    model: aiResult.model,
    context_type: getContextKind(pageContext.context || {}),
    module_id: pageContext.moduleId || null,
    record_id: pageContext.recordId || null,
    metadata: {
      ...(thread?.metadata || {}),
      route: pageContext.context?.route || null,
      summary: pageContext.summary || null,
      context_kind: getContextKind(pageContext.context || {}),
      context_label: buildThreadContextLabel(pageContext),
      context: pageContext.context || null,
      module_id: pageContext.moduleId || null,
      record_id: pageContext.recordId || null,
      last_activity_kind: 'propose_note',
      last_message_preview: noteContent.slice(0, 300),
      last_action_log_id: action?.id || null,
    },
  });

  await recordAiUsageLedger(supabaseUrl, serviceRoleKey, authContext, {
    threadId: thread.id,
    messageId: assistantMessage?.id || null,
    requestId: aiResult.requestId,
    capability: 'record_chat',
    provider: aiResult.provider,
    model: aiResult.model,
    usageMetadata: aiResult.usageMetadata,
    metadata: { source: 'propose_note', action_log_id: action?.id || null, user_message_id: userAiMessage?.id || null },
  });

  return json(200, {
    success: true,
    threadId: thread.id,
    proposedAction: {
      id: action?.id || null,
      actionType: 'send_note',
      moduleId: pageContext.moduleId,
      recordId: pageContext.recordId,
      content: noteContent,
      status: 'proposed',
    },
  });
};

const handleSaasAi = async (supabaseUrl: string, serviceRoleKey: string, authContext: any, body: any) => {
  if (!canViewSaasAdmin(authContext)) {
    return json(403, { success: false, message: 'دسترسی پنل مدیریت تازه سیستم لازم است.' });
  }
  const subAction = String(body?.sub || '').trim();

  if (subAction === 'overview') {
    const [allUsage, models, providerCredit, orgRows] = await Promise.all([
      safeRestSelect(supabaseUrl, serviceRoleKey, 'org_ai_usage_ledger', {
        select: 'id,org_id,capability,model,provider,status,raw_cost_irt,billed_amount_irt,margin_percent,created_at',
        order: 'created_at.desc',
        limit: 600,
      }),
      safeRestSelect(supabaseUrl, serviceRoleKey, 'ai_model_catalog', {
        select: '*',
        order: 'id.asc',
        limit: 300,
      }),
      fetchAvalaiCredit(getCentralProviderConfig()).catch(() => ({ available: false, message: 'اعتبار دریافت نشد.' })),
      safeRestSelect(supabaseUrl, serviceRoleKey, 'organizations', {
        select: 'id,name,slug',
        limit: 2000,
      }),
    ]);
    const orgNameById = new Map((orgRows || []).map((row: any) => [
      normalizeId(row?.id),
      String(row?.name || row?.slug || '').trim() || 'سازمان بدون نام',
    ]));

    const byOrg = new Map<string, { org_id: string; org_name: string; requests: number; billed_irt: number; raw_irt: number; models: Set<string> }>();
    for (const row of allUsage) {
      const orgId = normalizeId(row.org_id);
      if (!orgId) continue;
      const entry = byOrg.get(orgId) || { org_id: orgId, org_name: orgNameById.get(orgId) || 'سازمان بدون نام', requests: 0, billed_irt: 0, raw_irt: 0, models: new Set() };
      entry.requests++;
      entry.billed_irt += numberFrom(row.billed_amount_irt, 0);
      entry.raw_irt += numberFrom(row.raw_cost_irt, 0);
      if (row.model) entry.models.add(String(row.model));
      byOrg.set(orgId, entry);
    }
    const orgSummaries = Array.from(byOrg.values()).map((item) => ({
      ...item,
      models: Array.from(item.models),
    })).sort((a, b) => b.billed_irt - a.billed_irt);

    const finalized = allUsage.filter((row) => String(row.status) === 'finalized');
    const totals = finalized.reduce(
      (acc, row) => {
        acc.billed_irt += numberFrom(row.billed_amount_irt, 0);
        acc.raw_irt += numberFrom(row.raw_cost_irt, 0);
        acc.requests++;
        const model = String(row.model || 'unknown');
        acc.by_model[model] = (acc.by_model[model] || 0) + numberFrom(row.billed_amount_irt, 0);
        const cap = String(row.capability || 'unknown');
        acc.by_capability[cap] = (acc.by_capability[cap] || 0) + numberFrom(row.billed_amount_irt, 0);
        return acc;
      },
      { billed_irt: 0, raw_irt: 0, requests: 0, by_model: {} as Record<string, number>, by_capability: {} as Record<string, number> }
    );

    return json(200, {
      success: true,
      models,
      allUsage: allUsage.slice(0, 200).map((row: any) => ({
        ...row,
        org_name: orgNameById.get(normalizeId(row?.org_id)) || 'سازمان بدون نام',
      })),
      orgSummaries,
      totals,
      providerCredit: {
        ...providerCredit,
        credit: (providerCredit as any).available ? normalizeCreditPayload((providerCredit as any).credit) : null,
      },
    });
  }

  if (subAction === 'sync_models') {
    const providerConfig = getCentralProviderConfig();
    if (!providerConfig.apiKey) {
      return json(200, { success: true, models: [], warning: 'کلید مرکزی AI تنظیم نشده است.' });
    }
    const { response } = await requestAvalaiWithFallback(providerConfig, '/models', {
      method: 'GET',
      headers: { Authorization: `Bearer ${providerConfig.apiKey}`, 'Content-Type': 'application/json' },
    });
    const raw = await response.text();
    const parsed = parseJsonSafe(raw);
    if (!response.ok) {
      return json(200, { success: false, models: [], message: 'دریافت لیست مدل‌ها از AvalAI ناموفق بود.', raw: parsed });
    }
    return json(200, { success: true, models: parseModelsResponse(parsed), raw: parsed });
  }

  if (subAction === 'upsert_model') {
    const row = body?.model || {};
    const modelId = String(row?.id || '').trim();
    if (!modelId) return json(400, { success: false, message: 'شناسه مدل الزامی است.' });
    const rows = await restUpsert(supabaseUrl, serviceRoleKey, 'ai_model_catalog', [{
      id: modelId,
      provider: String(row.provider || 'avalai').trim(),
      display_name_fa: String(row.display_name_fa || modelId).trim(),
      capability_tags: Array.isArray(row.capability_tags) ? row.capability_tags : [],
      input_usd_per_1m: numberFrom(row.input_usd_per_1m, 0),
      cached_input_usd_per_1m: row.cached_input_usd_per_1m !== undefined ? numberFrom(row.cached_input_usd_per_1m, 0) : null,
      output_usd_per_1m: numberFrom(row.output_usd_per_1m, 0),
      specific_cost_usd: row.specific_cost_usd !== undefined ? numberFrom(row.specific_cost_usd, 0) : null,
      specific_cost_unit: row.specific_cost_unit ? String(row.specific_cost_unit) : null,
      margin_percent: numberFrom(row.margin_percent, 30),
      exchange_rate_irt: numberFrom(row.exchange_rate_irt, DEFAULT_AI_EXCHANGE_RATE_IRT),
      is_active: row.is_active !== false,
      is_coming_soon: row.is_coming_soon === true,
      pricing_source: String(row.pricing_source || 'manual').trim(),
      metadata: row.metadata && typeof row.metadata === 'object' ? row.metadata : {},
      updated_at: new Date().toISOString(),
    }], 'id');
    return json(200, { success: true, model: rows[0] || null });
  }

  if (subAction === 'toggle_model') {
    const modelId = String(body?.modelId || '').trim();
    const isActive = body?.is_active !== false;
    if (!modelId) return json(400, { success: false, message: 'شناسه مدل الزامی است.' });
    await restPatch(supabaseUrl, serviceRoleKey, 'ai_model_catalog', { id: `eq.${modelId}` }, {
      is_active: isActive,
      updated_at: new Date().toISOString(),
    });
    return json(200, { success: true, modelId, is_active: isActive });
  }

  return json(400, { success: false, message: 'عملیات SaaS AI پشتیبانی نمی‌شود.' });
};

const handleConfirmAction = async (supabaseUrl: string, serviceRoleKey: string, authContext: any, body: any) => {
  const actionLogId = normalizeId(body?.actionLogId);
  if (!isUuid(actionLogId)) return json(400, { success: false, message: 'شناسه اقدام معتبر نیست.' });

  const rows = await restSelect(supabaseUrl, serviceRoleKey, 'ai_action_logs', {
    id: `eq.${actionLogId}`,
    org_id: `eq.${authContext.orgId}`,
    created_by: `eq.${authContext.userId}`,
    select: '*',
    limit: 1,
  });
  const action = rows[0] || null;
  if (!action) return json(404, { success: false, message: 'اقدام پیشنهادی پیدا نشد.' });
  if (String(action.status) !== 'proposed') {
    return json(409, { success: false, message: 'این اقدام قبلا پردازش شده است.', status: action.status });
  }
  if (String(action.action_type) === 'create_record_from_prompt') {
    const proposed = action.proposed_payload || {};
    const targetModuleId = String(proposed.target_module_id || '').trim();
    if (!targetModuleId || !ALLOWED_MODULES.has(targetModuleId)) {
      await restPatch(supabaseUrl, serviceRoleKey, 'ai_action_logs', { id: `eq.${actionLogId}` }, {
        status: 'failed',
        result_payload: { error: 'invalid_target_module' },
      });
      return json(400, { success: false, message: 'ماژول مقصد برای ساخت رکورد معتبر نیست.' });
    }
    const targetPerm = getModulePermission(authContext.permissions, targetModuleId);
    if (!canCreateModule(targetPerm)) {
      await restPatch(supabaseUrl, serviceRoleKey, 'ai_action_logs', { id: `eq.${actionLogId}` }, {
        status: 'failed',
        result_payload: { error: 'create_access_denied' },
      });
      return json(403, { success: false, message: 'شما دسترسی ساخت رکورد در این ماژول را ندارید.' });
    }
    const schema = proposed.record_creation_schema && typeof proposed.record_creation_schema === 'object'
      ? proposed.record_creation_schema
      : { fields: [] };
    const fields = Array.isArray(schema?.fields) ? schema.fields : [];
    if (fields.length === 0) return json(400, { success: false, message: 'فیلدهای مجاز برای ساخت رکورد مشخص نیست.' });
    const targetTable = getModuleTable(targetModuleId);
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(targetTable)) {
      return json(400, { success: false, message: 'جدول مقصد برای ساخت رکورد معتبر نیست.' });
    }
    const moduleId = normalizeId(proposed.module_id || action.module_id);
    const recordId = normalizeId(proposed.record_id || action.record_id);
    if (moduleId && recordId) {
      const pageContext = await buildPermittedPageContext(supabaseUrl, serviceRoleKey, authContext, {
        ...(proposed.context || {}),
        mode: 'record',
        moduleId,
        recordId,
      });
      if (!pageContext.permitted) {
        await restPatch(supabaseUrl, serviceRoleKey, 'ai_action_logs', { id: `eq.${actionLogId}` }, {
          status: 'failed',
          result_payload: { error: 'access_denied_on_confirm' },
        });
        return json(403, { success: false, message: 'دسترسی شما به رکورد مرتبط برای ساخت رکورد تایید نشد.' });
      }
    }
    const payload = sanitizeAiRecordPayload({ fields: proposed.payload || {} }, schema);
    if (Object.keys(payload).length === 0) return json(400, { success: false, message: 'اطلاعات کافی برای ساخت رکورد وجود ندارد.' });
    const rows = await restInsert(supabaseUrl, serviceRoleKey, targetTable, [{
      org_id: authContext.orgId,
      ...payload,
    }]);
    const created = rows[0] || null;
    const moduleLabel = String(proposed.module_label || schema?.moduleLabel || targetModuleId).trim() || targetModuleId;
    const createdRecords = created ? [{
      module_id: targetModuleId,
      table: targetTable,
      id: created.id || null,
      title: buildAiRecordTitle(created, moduleLabel),
    }] : [];
    await restPatch(supabaseUrl, serviceRoleKey, 'ai_action_logs', { id: `eq.${actionLogId}` }, {
      status: created ? 'executed' : 'skipped',
      confirmed_by: authContext.userId,
      executed_at: new Date().toISOString(),
      result_payload: { created_records: createdRecords },
      result: { created_records: createdRecords },
    });
    if (action.thread_id) {
      await insertAiMessage(supabaseUrl, serviceRoleKey, authContext, {
        thread_id: action.thread_id,
        role: 'assistant',
        content: created
          ? `${moduleLabel} تایید و ساخته شد.`
          : 'اطلاعات کافی برای ساخت رکورد پیدا نشد.',
        provider: getEnvProviderConfig().provider,
        model: getEnvProviderConfig().model,
        metadata: {
          source: 'confirm_create_record',
          action_log_id: actionLogId,
          created_records: createdRecords,
        },
      }).catch(() => null);
      const threadRows = await restSelect(supabaseUrl, serviceRoleKey, 'ai_threads', {
        id: `eq.${action.thread_id}`,
        org_id: `eq.${authContext.orgId}`,
        select: 'id,metadata',
        limit: 1,
      }).catch(() => []);
      const existingThread = threadRows[0] || {};
      await restPatch(supabaseUrl, serviceRoleKey, 'ai_threads', { id: `eq.${action.thread_id}`, org_id: `eq.${authContext.orgId}` }, {
        updated_at: new Date().toISOString(),
        module_id: moduleId || targetModuleId,
        record_id: recordId || created?.id || null,
        metadata: {
          ...(existingThread?.metadata && typeof existingThread.metadata === 'object' ? existingThread.metadata : {}),
          last_activity_kind: 'create_record_confirmed',
          last_created_records: createdRecords,
          last_action_log_id: actionLogId,
        },
      }).catch(() => []);
    }
    return json(200, { success: true, actionLogId, threadId: action.thread_id || null, createdRecords });
  }

  if (String(action.action_type) === 'process_operation_from_prompt') {
    const proposed = action.proposed_payload || {};
    const moduleId = normalizeId(proposed.module_id || action.module_id);
    const recordId = normalizeId(proposed.record_id || action.record_id);
    const pageContext = await buildPermittedPageContext(supabaseUrl, serviceRoleKey, authContext, {
      ...(proposed.context || {}),
      mode: 'record',
      moduleId,
      recordId,
    });
    if (!pageContext.permitted || !pageContext.moduleId || !pageContext.recordId) {
      await restPatch(supabaseUrl, serviceRoleKey, 'ai_action_logs', { id: `eq.${actionLogId}` }, {
        status: 'failed',
        result_payload: { error: 'access_denied_on_confirm' },
      });
      return json(403, { success: false, message: 'دسترسی شما به رکورد مقصد برای اجرای اقدام فرآیندی تایید نشد.' });
    }
    const operations = Array.isArray(proposed.operations) ? proposed.operations : [];
    if (operations.length === 0) return json(400, { success: false, message: 'اقدام فرآیندی قابل اجرا پیدا نشد.' });
    const [processContext, orgPeopleContext] = await Promise.all([
      loadAiProcessContext(supabaseUrl, serviceRoleKey, authContext, pageContext),
      loadOrgPeopleContext(supabaseUrl, serviceRoleKey, authContext, String(proposed.prompt || '')),
    ]);
    const executed: any[] = [];
    for (const operation of operations.slice(0, 8)) {
      executed.push(await executeAiProcessOperation(supabaseUrl, serviceRoleKey, authContext, pageContext, operation, processContext, orgPeopleContext));
    }
    await restPatch(supabaseUrl, serviceRoleKey, 'ai_action_logs', { id: `eq.${actionLogId}` }, {
      status: 'executed',
      confirmed_by: authContext.userId,
      executed_at: new Date().toISOString(),
      result_payload: { operations: executed },
      result: { operations: executed },
    });
    if (action.thread_id) {
      await insertAiMessage(supabaseUrl, serviceRoleKey, authContext, {
        thread_id: action.thread_id,
        role: 'assistant',
        content: 'اقدام‌های فرآیندی تایید و اجرا شد.',
        provider: getEnvProviderConfig().provider,
        model: getEnvProviderConfig().model,
        metadata: {
          source: 'confirm_process_operation',
          action_log_id: actionLogId,
          operations: executed,
        },
      }).catch(() => null);
    }
    return json(200, { success: true, actionLogId, operations: executed });
  }

  if (String(action.action_type) !== 'send_note') {
    return json(400, { success: false, message: 'این نوع اقدام در v1 پشتیبانی نمی‌شود.' });
  }

  const proposed = action.proposed_payload || {};
  const moduleId = normalizeId(proposed.module_id || action.module_id);
  const recordId = normalizeId(proposed.record_id || action.record_id);
  const pageContext = await buildPermittedPageContext(supabaseUrl, serviceRoleKey, authContext, {
    mode: 'record',
    moduleId,
    recordId,
  });
  if (!pageContext.permitted) {
    await restPatch(supabaseUrl, serviceRoleKey, 'ai_action_logs', { id: `eq.${actionLogId}` }, {
      status: 'failed',
      result: { error: 'access_denied_on_confirm' },
    });
    return json(403, { success: false, message: 'دسترسی شما به این رکورد برای ثبت یادداشت تایید نشد.' });
  }

  const content = String(proposed.content || '').trim();
  if (!content) return json(400, { success: false, message: 'متن یادداشت خالی است.' });

  const noteRows = await restInsert(supabaseUrl, serviceRoleKey, 'notes', [{
    org_id: authContext.orgId,
    module_id: moduleId,
    record_id: recordId,
    content,
    mention_user_ids: Array.isArray(proposed.mention_user_ids) && proposed.mention_user_ids.length
      ? proposed.mention_user_ids
      : [authContext.userId],
    mention_role_ids: Array.isArray(proposed.mention_role_ids) ? proposed.mention_role_ids : [],
    reply_to: null,
    author_id: null,
    author_name: AI_AUTHOR_NAME,
    source_type: 'ai',
    metadata: {
      action_log_id: actionLogId,
      confirmed_by: authContext.userId,
      provider: proposed.provider || getEnvProviderConfig().provider,
      model: proposed.model || getEnvProviderConfig().model,
    },
  }]);
  const note = noteRows[0] || null;

  await restPatch(supabaseUrl, serviceRoleKey, 'ai_action_logs', { id: `eq.${actionLogId}` }, {
    status: 'executed',
    confirmed_by: authContext.userId,
    executed_at: new Date().toISOString(),
    result: { note_id: note?.id || null },
  });

  return json(200, { success: true, note, actionLogId });
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method === 'GET') {
    return json(405, { success: false, build: FUNCTION_BUILD, message: 'روش ارسال درخواست معتبر نیست. عملیات هوش مصنوعی باید با POST ارسال شود.' });
  }
  if (req.method !== 'POST') {
    return json(405, { success: false, message: 'روش ارسال درخواست معتبر نیست.' });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !serviceRoleKey) {
      return json(500, { success: false, message: 'تنظیمات سرور کامل نیست. متغیرهای Supabase Function را بررسی کنید.' });
    }

    const authHeader = req.headers.get('authorization') || '';
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (!token) return json(401, { success: false, message: 'نشست شما معتبر نیست. دوباره وارد حساب کاربری شوید.' });

    const user = await verifyUserToken(supabaseUrl, serviceRoleKey, token);
    const authContext = await loadUserContext(supabaseUrl, serviceRoleKey, user);
    const body = await readJsonBody(req);
    const action: AssistantAction = String(body?.action || 'chat') as AssistantAction;

    if (action === 'get_ai_settings') return await handleGetAiSettings(supabaseUrl, serviceRoleKey, authContext);
    if (action === 'save_ai_settings') return await handleSaveAiSettings(supabaseUrl, serviceRoleKey, authContext, body);
    if (action === 'get_ai_overview') return await handleGetAiOverview(supabaseUrl, serviceRoleKey, authContext);
    if (action === 'get_compose_models') return await handleGetComposeModels(supabaseUrl, serviceRoleKey, authContext);
    if (action === 'test_provider') return await handleTestProvider(supabaseUrl, serviceRoleKey, authContext, body);
    if (action === 'list_models') return await handleListModels(supabaseUrl, serviceRoleKey, authContext, body);
    if (action === 'get_credit') return await handleGetCredit(supabaseUrl, serviceRoleKey, authContext, body);
    if (action === 'list_threads') return await handleListThreads(supabaseUrl, serviceRoleKey, authContext, body);
    if (action === 'rename_thread') return await handleRenameThread(supabaseUrl, serviceRoleKey, authContext, body);
    if (action === 'archive_thread') return await handleArchiveThread(supabaseUrl, serviceRoleKey, authContext, body);
    if (action === 'share_thread') return await handleShareThread(supabaseUrl, serviceRoleKey, authContext, body);
    if (action === 'transcribe_voice') return await handleTranscribeVoice(supabaseUrl, serviceRoleKey, authContext, body);
    if (action === 'generate_voice_output') return await handleGenerateVoiceOutput(supabaseUrl, serviceRoleKey, authContext, body);
    if (action === 'generate_image') return await handleGenerateImage(supabaseUrl, serviceRoleKey, authContext, body);
    if (action === 'get_image_status') return await handleGetImageStatus(supabaseUrl, serviceRoleKey, authContext, body);
    if (action === 'generate_video') return await handleGenerateVideo(supabaseUrl, serviceRoleKey, authContext, body);
    if (action === 'get_video_status') return await handleGetVideoStatus(supabaseUrl, serviceRoleKey, authContext, body);
    if (action === 'generate_document') return await handleGenerateDocument(supabaseUrl, serviceRoleKey, authContext, body);
    if (action === 'run_task_bundle') return await handleRunTaskBundle(supabaseUrl, serviceRoleKey, authContext, body);
    if (action === 'embed_document_chunks') return await handleEmbedDocumentChunks(supabaseUrl, serviceRoleKey, authContext, body);
    if (action === 'rebuild_instruction_ai_context') return await handleRebuildInstructionAiContext(supabaseUrl, serviceRoleKey, authContext, body);
    if (action === 'rebuild_job_description_ai_context') return await handleRebuildJobDescriptionAiContext(supabaseUrl, serviceRoleKey, authContext, body);
    if (action === 'get_thread') return await handleGetThread(supabaseUrl, serviceRoleKey, authContext, body);
    if (action === 'delete_thread') return await handleDeleteThread(supabaseUrl, serviceRoleKey, authContext, body);
    if (action === 'suggest_auto_capabilities') return await handleSuggestAutoCapabilities(supabaseUrl, serviceRoleKey, authContext, body);
    if (action === 'create_record_from_prompt' || action === 'update_record_from_prompt') {
      return await handleRecordMutationFromPrompt(supabaseUrl, serviceRoleKey, authContext, body);
    }
    if (action === 'process_operation_from_prompt') return await handleProcessOperationFromPrompt(supabaseUrl, serviceRoleKey, authContext, body);
    if (action === 'workflow_ai_prompt') {
      const outputMode = String(body?.outputMode || body?.output_mode || '').trim();
      if (outputMode === 'create_record' || outputMode === 'update_record') {
        return await handleRecordMutationFromPrompt(supabaseUrl, serviceRoleKey, authContext, body);
      }
      if (outputMode === 'process_operation') return await handleProcessOperationFromPrompt(supabaseUrl, serviceRoleKey, authContext, { ...body, autoExecute: true });
      return await handleChat(supabaseUrl, serviceRoleKey, authContext, { ...body, action: 'chat', capability: 'workflow_ai_prompt', forceNewThread: body?.forceNewThread !== false });
    }
    if (action === 'chat_stream') return handleChatStream(supabaseUrl, serviceRoleKey, authContext, body);
    if (action === 'chat') return await handleChat(supabaseUrl, serviceRoleKey, authContext, body);
    if (action === 'chat_with_file' || action === 'analyze_file' || action === 'upload_file' || action === 'send_file') {
      return await handleChatWithFile(supabaseUrl, serviceRoleKey, authContext, body);
    }
    if (action === 'suggest_reply') return await handleSuggestReply(supabaseUrl, serviceRoleKey, authContext, body);
    if (action === 'propose_note') return await handleProposeNote(supabaseUrl, serviceRoleKey, authContext, body);
    if (action === 'confirm_action') return await handleConfirmAction(supabaseUrl, serviceRoleKey, authContext, body);
    if (action === 'saas_ai') return await handleSaasAi(supabaseUrl, serviceRoleKey, authContext, body);

    return json(400, { success: false, message: 'اقدام درخواستی پشتیبانی نمی‌شود.' });
  } catch (error: any) {
    const message = shortenProviderError(String(error?.message || 'خطای ناشناخته'));
    const status = Number(error?.status || 0) || (message === 'Unauthorized' ? 401 : 500);
    console.error('ai-assistant failed', error);
    return json(status, { success: false, message });
  }
});
