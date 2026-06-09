// @ts-nocheck

type AssistantAction =
  | 'chat'
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
  | 'embed_document_chunks'
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

const FUNCTION_BUILD = 'ai-assistant-2026-04-08-02';
const DEFAULT_AI_BASE_URL = 'https://api.avalai.ir/v1';
const DEFAULT_AI_FALLBACK_BASE_URL = 'https://api.avalapis.ir/v1';
const DEFAULT_AI_MODEL = 'gpt-4.1-mini';
const DEFAULT_EMBEDDING_MODEL = 'text-embedding-3-small';
const DEFAULT_AI_MARGIN_PERCENT = 30;
const DEFAULT_AI_EXCHANGE_RATE_IRT = 115000;
const AI_AUTHOR_NAME = 'دستیار هوشمند';
const MAX_PAGE_CONTEXT_RECORDS = 10;
const MAX_RETRIEVED_CONTEXTS = 4;

// Default models per capability — chosen for Persian B2B context.
// gpt-4.1-mini : free on AvalAI, 400K ctx, best general value
// gpt-4o       : richer reasoning for document/analysis ($2.50/$10 per 1M)
// serper-search: cheapest Google-based web search ($0.001/query via /v1/search)
// Admins can override per-capability in org_ai_settings.selected_models
const DEFAULT_CAPABILITY_MODELS: Record<string, string> = {
  // ── Chat / reasoning ───────────────────────────────────────────────────
  dashboard_chat: 'gpt-4.1-mini',            // free, strong Persian, 400K ctx
  record_chat: 'gpt-4.1-mini',               // free, good record analysis
  customer_reply_suggestion: 'gpt-4.1-mini', // free, fluent Persian writing
  document_analysis: 'gpt-4o',               // better long-doc comprehension
  workflow_ai_prompt: 'gpt-4.1-mini',        // free, reliable structured output
  voip_auto_reply: 'gpt-4.1-mini',           // free, fast response generation
  // ── Web search ─────────────────────────────────────────────────────────
  web_search: 'serper-search',               // $0.001/query — cheapest Google
  // ── Embeddings ─────────────────────────────────────────────────────────
  embedding: DEFAULT_EMBEDDING_MODEL,        // text-embedding-3-small (pgvector compat)
  // ── Voice ──────────────────────────────────────────────────────────────
  voice_input: 'gpt-4o-transcribe',          // higher accuracy than mini
  voice_output: 'eleven-multilingual-v2',    // ElevenLabs — best Persian TTS
  // ── Media generation ───────────────────────────────────────────────────
  image_generation: 'gpt-image-1',           // reliable OpenAI image gen
  video_generation: 'sora-2',               // OpenAI video gen
};

const ALLOWED_MODULES = new Set([
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
]);

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

const requestAvalaiWithFallback = async (
  providerConfig: any,
  path: string,
  init: RequestInit,
  options?: { stripVersionForPath?: boolean },
) => {
  const baseUrls = uniqueBaseUrls(
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
  return Array.isArray(parsed) ? parsed : [];
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

const canViewSaasAdmin = (authContext: any) => {
  const permissions = authContext?.permissions;
  if (!permissions || typeof permissions !== 'object') return false;
  const perm = permissions?.__saas_admin || {};
  return perm?.view === true || perm?.edit === true || perm?.demo_override === true;
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

const getCapabilityModel = (settings: any, capability: string, fallback = DEFAULT_AI_MODEL) => {
  const selected = settings?.selected_models && typeof settings.selected_models === 'object'
    ? settings.selected_models
    : {};
  return String(selected?.[capability] || DEFAULT_CAPABILITY_MODELS[capability] || fallback || DEFAULT_AI_MODEL).trim() || DEFAULT_AI_MODEL;
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
) => {
  const centralConfig = getCentralProviderConfig();
  const settings = await loadOrgAiSettings(supabaseUrl, serviceRoleKey, authContext);
  return {
    ...centralConfig,
    model: getCapabilityModel(settings, capability, centralConfig.model),
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
  if (context.mode === 'record' && context.moduleId && context.recordId) return `record:${context.moduleId}:${context.recordId}`;
  const route = String(context.route || '').split('#')[0].trim();
  if (route) return `route:${route}`;
  if (context.moduleId) return `${context.mode || 'page'}:${context.moduleId}`;
  return 'page:unknown';
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

const fetchKnowledgeChunks = async (supabaseUrl: string, serviceRoleKey: string, authContext: any, query: string) => {
  if (!authContext.orgId) return [];
  const instructionRowsFor = (rows: any[]) => rows.filter((row: any) =>
    String(row?.metadata?.system_key || '').trim() === 'ai_instructions'
    || String(row?.metadata?.document_type || '').trim() === 'ai_instructions'
  );
  const rows = await restSelect(supabaseUrl, serviceRoleKey, 'document_chunks', {
    org_id: `eq.${authContext.orgId}`,
    status: 'eq.active',
    select: 'id,document_id,chunk_index,content,metadata,updated_at,allowed_user_ids,allowed_role_ids',
    order: 'updated_at.desc',
    limit: 80,
  });
  const visibleRows = rows.filter((row: any) => {
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
  });
  const instructionRows = instructionRowsFor(visibleRows);
  const queryText = String(query || '').trim();
  if (queryText) {
    try {
      const providerConfig = getCentralProviderConfig();
      if (providerConfig.apiKey) {
        const embeddingResult = await callEmbeddings(providerConfig, queryText.slice(0, 8000), DEFAULT_EMBEDDING_MODEL);
        const vectorRows = await restRpc(supabaseUrl, serviceRoleKey, 'match_ai_document_chunks', {
          p_org_id: authContext.orgId,
          p_user_id: authContext.userId || null,
          p_role_id: authContext.roleId || null,
          p_query_embedding: `[${embeddingResult.embedding.join(',')}]`,
          p_match_count: 6,
        });
        const filteredVectorRows = (vectorRows || [])
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
      .filter((chunk: any) =>
        String(chunk?.metadata?.system_key || '').trim() === 'ai_instructions'
        || String(chunk?.metadata?.document_type || '').trim() === 'ai_instructions'
      )
      .map((chunk: any) => String(chunk?.id || ''))
  );
  const aiInstructions = knowledge.filter((chunk) => aiInstructionIds.has(String(chunk.id || '')));
  const otherKnowledge = knowledge.filter((chunk) => !aiInstructionIds.has(String(chunk.id || '')));
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
    web_search_results: webSearchResults.length ? webSearchResults : undefined,
    ai_instructions: aiInstructions,
    organization_knowledge: otherKnowledge,
    user_question: message,
  };

  const systemContent = pageContext.intent === 'process_guide'
    ? 'شما دستیار سازمانی KalamApp هستید. کاربر راهنمای آموزشی یک فرآیند را می‌خواهد. اول فقط از process_guide.process_guide_context و سپس از ai_instructions، اطلاعات شرکت، context صفحه و دانش سازمان استفاده کنید. پاسخ باید فارسی، دقیق، آموزشی و اجرایی باشد. ترتیب پاسخ: 1) نمای کلی کوتاه فرآیند 2) توضیح مرحله‌به‌مرحله 3) برای هر مرحله صریح بگویید پیش‌نویس/ارجاع‌نشده است یا فعالیت واقعی دارد؛ اگر فعالیت واقعی دارد status/status_label و اینکه به شخص یا نقش/تیم ارجاع شده را ذکر کنید 4) برای هر مرحله بگویید اگر انجام شود چه پیام، اعلان یا اقدام خودکاری رخ می‌دهد و مخاطب آن کیست 5) شرط‌ها، فیلدها و اکشن‌ها را با label فارسی موجود در context توضیح دهید 6) هر ابهام یا داده ناقص را صریح اعلام کنید. اگر اتوماسیونی پیدا نشد، شفاف بگویید که پیدا نشد و چیزی حدس نزنید.'
    : `شما دستیار سازمانی KalamApp هستید. هویت شما دستیار هوشمند همین سازمان داخل KalamApp است، نه یک دستیار عمومی. اول از ai_instructions و بعد از اطلاعات شرکت، واحد پول، نقش و جایگاه کاربر، organization_directory همین سازمان، Context مجاز صفحه، Contextهای مجاز بازیابی‌شده و دانش سازمانی استفاده کنید.${webSearchResults.length ? ' اگر web_search_results داده شده، از آن برای سوالات مربوط به اطلاعات جاری و خارج از سازمان استفاده کن و منبع را ذکر کن.' : ''} اگر کاربر درباره اینکه چه کسی چه نقشی دارد، مدیران چه کسانی هستند، یا چه کاربری عضو چه تیمی است پرسید، فقط از organization_directory پاسخ بده. اگر فرد یا نقش در organization_directory نیست، صریح بگو در دایرکتوری مجاز همین سازمان پیدا نشد. واحد پول را فقط از company.currency_label/company.currency_code بگویید و اگر تنظیم نشده بود عدم قطعیت را اعلام کنید. دسترسی را بر اساس داده‌های مجاز موجود در همین پیام رعایت کنید؛ اگر داده‌ای در Contextها نیست، نگویید قطعا دسترسی ندارد، بگویید در داده‌های مجاز بازیابی‌شده پیدا نشد یا شناسه/نام دقیق‌تری لازم است. هرگز داده‌ای از سازمان دیگر فرض نکن. پاسخ‌ها فارسی، دقیق، کوتاه و اجرایی باشند. هیچ تغییر داده، ثبت یادداشت یا اقدام عملیاتی انجام ندهید.`;

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

const callChatCompletions = async (
  providerConfig: any,
  messages: Array<{ role: string; content: string }>,
  options?: { temperature?: number; maxTokens?: number; safetyIdentifier?: string }
) => {
  if (providerConfig?.isActive === false) {
    throw new Error('اتصال AI برای این سازمان غیرفعال است.');
  }
  if (!providerConfig.apiKey) {
    throw new Error('کلید مرکزی AI تنظیم نشده است. مقدار AI_API_KEY یا AVALAI_API_KEY را در Edge Function secrets ثبت کنید.');
  }

  const model = String(providerConfig.model || '').trim();
  const reasoning = isReasoningModel(model);

  // Reasoning models: large max_completion_tokens budget (thinking + output),
  // no temperature. Regular models: standard max_tokens + temperature.
  const requestBody: Record<string, any> = {
    model,
    messages,
    safety_identifier: options?.safetyIdentifier || undefined,
  };
  if (reasoning) {
    requestBody.max_completion_tokens = 8000;
  } else {
    requestBody.temperature = options?.temperature ?? 0.2;
    requestBody.max_tokens = options?.maxTokens ?? 2000;
  }

  const { response, baseUrl } = await requestAvalaiWithFallback(providerConfig, '/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${providerConfig.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
  });

  const requestId = response.headers.get('x-request-id') || response.headers.get('x-avalai-request-id') || null;
  const raw = await response.text();
  const parsed = parseJsonSafe(raw);
  if (!response.ok) {
    const message = typeof parsed === 'string' ? parsed : (parsed?.error?.message || JSON.stringify(parsed || {}));
    throw new Error(`خطای provider هوش مصنوعی: ${message}`);
  }

  const content = parsed?.choices?.[0]?.message?.content || parsed?.choices?.[0]?.text || '';
  return {
    content: String(content || '').trim(),
    provider: providerConfig.provider,
    model: providerConfig.model,
    requestId,
    baseUrl,
    raw: parsed,
    usageMetadata: extractUsageMetadata(parsed, providerConfig),
  };
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
  model = 'serper-search',
  numResults = 5,
): Promise<{ results: any[]; requestId: string | null }> => {
  if (!providerConfig.apiKey) return { results: [], requestId: null };
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
    if (!response.ok) return { results: [], requestId };
    const parsed = parseJsonSafe(await response.text());
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
  } catch {
    return { results: [], requestId: null };
  }
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
  payload: { threadId?: string | null; title?: string; pageContext?: any; contextKey?: string; provider?: string; model?: string; forceNew?: boolean },
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
  if (!payload.forceNew) {
    const existing = await findThreadByContextKey(supabaseUrl, serviceRoleKey, authContext, contextKey);
    if (existing) return existing;
  }

  const inserted = await restInsert(supabaseUrl, serviceRoleKey, 'ai_threads', [{
    org_id: authContext.orgId,
    user_id: authContext.userId,
    status: 'active',
    title: String(payload.title || '').trim().slice(0, 120),
    context_type: payload.pageContext?.context?.mode || 'page',
    context_key: contextKey,
    module_id: payload.pageContext?.moduleId || null,
    record_id: payload.pageContext?.recordId || null,
    provider: payload.provider || getEnvProviderConfig().provider,
    model: payload.model || getEnvProviderConfig().model,
    metadata: {
      route: payload.pageContext?.context?.route || null,
      summary: payload.pageContext?.summary || null,
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

const ensureOrgAiSettings = async (supabaseUrl: string, serviceRoleKey: string, authContext: any) => {
  const existing = await loadOrgAiSettings(supabaseUrl, serviceRoleKey, authContext);
  if (existing) return existing;
  const rows = await restInsert(supabaseUrl, serviceRoleKey, 'org_ai_settings', [{
    org_id: authContext.orgId,
    selected_models: DEFAULT_CAPABILITY_MODELS,
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
  const selectedModels = incoming.selected_models && typeof incoming.selected_models === 'object'
    ? incoming.selected_models
    : incoming.selectedModels && typeof incoming.selectedModels === 'object'
    ? incoming.selectedModels
    : existing?.selected_models || DEFAULT_CAPABILITY_MODELS;
  const featureFlags = incoming.feature_flags && typeof incoming.feature_flags === 'object'
    ? incoming.feature_flags
    : incoming.featureFlags && typeof incoming.featureFlags === 'object'
    ? incoming.featureFlags
    : existing?.feature_flags || {};
  const rows = await restUpsert(supabaseUrl, serviceRoleKey, 'org_ai_settings', [{
    org_id: authContext.orgId,
    selected_models: { ...DEFAULT_CAPABILITY_MODELS, ...selectedModels },
    feature_flags: featureFlags,
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
  const [settings, models, wallets, ledgerRows] = await Promise.all([
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
    wallet: wallets[0] || null,
    usage: {
      totals,
      recent: ledgerRows || [],
    },
    providerCredit,
    company: companyContext,
  });
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

const handleListThreads = async (supabaseUrl: string, serviceRoleKey: string, authContext: any, body: any) => {
  const search = String(body?.search || '').trim();
  const baseSelect = 'id,title,context_type,context_key,module_id,record_id,provider,model,metadata,created_at,updated_at,pinned_at,is_shared,shared_user_ids,shared_role_ids,user_id';
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

const handleChat = async (supabaseUrl: string, serviceRoleKey: string, authContext: any, body: any) => {
  const message = String(body?.message || '').trim();
  if (!message) return json(400, { success: false, message: 'متن سوال خالی است.' });

  const rawContext = normalizeContext(body?.context || {});
  const requestedCapability = String(body?.capability || '').trim();
  const capability = requestedCapability
    || (rawContext.mode === 'record' ? 'record_chat' : 'dashboard_chat');
  const contextKey = buildContextKey(rawContext);
  const pageContext = await buildPermittedPageContext(supabaseUrl, serviceRoleKey, authContext, rawContext);
  const [knowledgeChunks, providerConfig, companyContext, orgPeopleContext] = await Promise.all([
    fetchKnowledgeChunks(supabaseUrl, serviceRoleKey, authContext, message),
    resolveProviderConfig(supabaseUrl, serviceRoleKey, authContext, capability),
    loadCompanyContext(supabaseUrl, serviceRoleKey, authContext),
    loadOrgPeopleContext(supabaseUrl, serviceRoleKey, authContext, message),
  ]);
  const retrievedContexts = await fetchRelevantModuleContexts(supabaseUrl, serviceRoleKey, authContext, message, pageContext);

  // Web search: call only when feature is enabled and query looks like it needs external/current info
  const orgAiSettings = providerConfig.orgAiSettings;
  const webSearchEnabled = orgAiSettings?.feature_flags?.web_search === true;
  const webSearchModel = getCapabilityModel(orgAiSettings, 'web_search', 'serper-search');
  const webSearchResults = webSearchEnabled && shouldTriggerWebSearch(message)
    ? await callWebSearch(providerConfig, message, webSearchModel, 5).then((r) => r.results).catch(() => [])
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
    metadata: { context: pageContext.context, context_key: contextKey, context_summary: pageContext.summary },
  });

  const aiResult = await callChatCompletions(providerConfig, buildPromptMessages(
    message,
    pageContext,
    knowledgeChunks,
    companyContext,
    orgPeopleContext,
    authContext,
    retrievedContexts,
    previousMessages,
    webSearchResults,
  ), {
    safetyIdentifier: `org_${authContext.orgId}_user_${authContext.userId}_cap_${capability}`,
  });
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
      usage: aiResult.usageMetadata,
      avalai_request_id: aiResult.requestId || null,
      capability,
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
    },
  });

  await restPatch(supabaseUrl, serviceRoleKey, 'ai_threads', { id: `eq.${thread.id}`, org_id: `eq.${authContext.orgId}` }, {
    updated_at: new Date().toISOString(),
    provider: aiResult.provider,
    model: aiResult.model,
  });

  return json(200, {
    success: true,
    threadId: thread.id,
    userMessageId: userMessage?.id || null,
    messageId: assistantMessage?.id || null,
    answer: aiResult.content,
    provider: aiResult.provider,
    model: aiResult.model,
    usage: aiResult.usageMetadata,
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
    fetchKnowledgeChunks(supabaseUrl, serviceRoleKey, authContext, knowledgeQuery),
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
      .filter((chunk: any) =>
        String(chunk?.metadata?.system_key || '').trim() === 'ai_instructions'
        || String(chunk?.metadata?.document_type || '').trim() === 'ai_instructions'
      )
      .slice(0, 2)
      .map((chunk, index) => ({
        index: index + 1,
        id: chunk.id,
        title: chunk?.metadata?.document_title || null,
        content: String(chunk?.content || '').slice(0, 1100),
      })),
    organization_knowledge: knowledgeChunks
      .filter((chunk: any) =>
        String(chunk?.metadata?.system_key || '').trim() !== 'ai_instructions'
        && String(chunk?.metadata?.document_type || '').trim() !== 'ai_instructions'
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
        'شما دستیار پاسخ‌دهی سازمانی KalamApp هستید. فقط متن «پاسخ پیشنهادی قابل ارسال برای مشتری» را بنویسید. از پیام‌های مکالمه اخیر، نقش سازمانی کاربر، وضعیت مشتری/تامین‌کننده، سوابق فاکتور/پروژه/پرداخت مجاز، اطلاعات کالا/خدمت، لیست قیمت، پکیج‌ها، فاکتورهای خرید، اطلاعات مشتریان/کاربران مجاز و اسناد/قوانین سازمان استفاده کنید. اگر اطلاعات قطعی نیست، با عبارت محتاطانه و بدون ادعای قطعی بنویسید. خروجی باید فارسی، حرفه‌ای، روشن، کوتاه و اجرایی باشد. Markdown، عنوان، توضیح فرایند و متن اضافی ننویسید.',
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
    metadata: {
      ...(thread?.metadata || {}),
      last_reply_suggestion_at: new Date().toISOString(),
      reply_channel: channel,
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

  return json(200, {
    success: true,
    threadId: thread.id,
    userMessageId: userMessage?.id || null,
    messageId: assistantMessage?.id || null,
    suggestedReply,
    provider: aiResult.provider,
    model: aiResult.model,
    usage: aiResult.usageMetadata,
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
      models: catalogRows.map((row: any) => ({
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
      models: Object.values(DEFAULT_CAPABILITY_MODELS).map((id) => ({ id, label: id })),
      warning: 'کلید مرکزی AI تنظیم نشده است؛ لیست پیش‌فرض نمایش داده شد.',
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
      models: Object.values(DEFAULT_CAPABILITY_MODELS).map((id) => ({ id, label: id })),
      warning: 'Provider لیست مدل‌ها را از مسیر OpenAI-compatible /models برنگرداند؛ لیست پیشنهادی نمایش داده شد.',
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

const handleProposeNote = async (supabaseUrl: string, serviceRoleKey: string, authContext: any, body: any) => {
  const userMessage = String(body?.message || '').trim() || 'برای این رکورد یک یادداشت کوتاه و کاربردی پیشنهاد بده.';
  const pageContext = await buildPermittedPageContext(supabaseUrl, serviceRoleKey, authContext, {
    ...(body?.context || {}),
    mode: 'record',
  });

  if (!pageContext.permitted || !pageContext.moduleId || !pageContext.recordId || pageContext.records.length === 0) {
    return json(403, { success: false, message: 'برای پیشنهاد یادداشت باید روی یک رکورد قابل دسترس باشید.' });
  }

  const knowledgeChunks = await fetchKnowledgeChunks(supabaseUrl, serviceRoleKey, authContext, userMessage);
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
    const [allUsage, models, providerCredit] = await Promise.all([
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
    ]);

    const byOrg = new Map<string, { org_id: string; requests: number; billed_irt: number; raw_irt: number; models: Set<string> }>();
    for (const row of allUsage) {
      const orgId = normalizeId(row.org_id);
      if (!orgId) continue;
      const entry = byOrg.get(orgId) || { org_id: orgId, requests: 0, billed_irt: 0, raw_irt: 0, models: new Set() };
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
      allUsage: allUsage.slice(0, 200),
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
    if (action === 'test_provider') return await handleTestProvider(supabaseUrl, serviceRoleKey, authContext, body);
    if (action === 'list_models') return await handleListModels(supabaseUrl, serviceRoleKey, authContext, body);
    if (action === 'get_credit') return await handleGetCredit(supabaseUrl, serviceRoleKey, authContext, body);
    if (action === 'list_threads') return await handleListThreads(supabaseUrl, serviceRoleKey, authContext, body);
    if (action === 'rename_thread') return await handleRenameThread(supabaseUrl, serviceRoleKey, authContext, body);
    if (action === 'archive_thread') return await handleArchiveThread(supabaseUrl, serviceRoleKey, authContext, body);
    if (action === 'share_thread') return await handleShareThread(supabaseUrl, serviceRoleKey, authContext, body);
    if (action === 'embed_document_chunks') return await handleEmbedDocumentChunks(supabaseUrl, serviceRoleKey, authContext, body);
    if (action === 'get_thread') return await handleGetThread(supabaseUrl, serviceRoleKey, authContext, body);
    if (action === 'delete_thread') return await handleDeleteThread(supabaseUrl, serviceRoleKey, authContext, body);
    if (action === 'chat') return await handleChat(supabaseUrl, serviceRoleKey, authContext, body);
    if (action === 'suggest_reply') return await handleSuggestReply(supabaseUrl, serviceRoleKey, authContext, body);
    if (action === 'propose_note') return await handleProposeNote(supabaseUrl, serviceRoleKey, authContext, body);
    if (action === 'confirm_action') return await handleConfirmAction(supabaseUrl, serviceRoleKey, authContext, body);
    if (action === 'saas_ai') return await handleSaasAi(supabaseUrl, serviceRoleKey, authContext, body);

    return json(400, { success: false, message: 'اقدام درخواستی پشتیبانی نمی‌شود.' });
  } catch (error: any) {
    const message = String(error?.message || 'خطای ناشناخته');
    const status = message === 'Unauthorized' ? 401 : 500;
    console.error('ai-assistant failed', error);
    return json(status, { success: false, message });
  }
});
