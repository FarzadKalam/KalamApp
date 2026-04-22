// @ts-nocheck

type AssistantAction =
  | 'chat'
  | 'get_thread'
  | 'delete_thread'
  | 'propose_note'
  | 'confirm_action'
  | 'suggest_reply'
  | 'get_provider_settings'
  | 'save_provider_settings'
  | 'test_provider'
  | 'list_models'
  | 'get_credit';

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
const DEFAULT_AI_MODEL = 'gpt-4o-mini';
const AI_AUTHOR_NAME = 'دستیار هوشمند';
const MAX_PAGE_CONTEXT_RECORDS = 10;
const MAX_RETRIEVED_CONTEXTS = 4;

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
]);

const MODULE_ALIASES: Record<string, string[]> = {
  customers: ['مشتری', 'مشتریان', 'customer', 'customers', 'خریدار', 'کارفرما'],
  suppliers: ['تامین کننده', 'تامین‌کننده', 'تامین کنندگان', 'supplier', 'suppliers', 'فروشنده'],
  invoices: ['فاکتور فروش', 'فاکتور', 'صورتحساب', 'invoice', 'invoices', 'دریافت', 'دریافتی'],
  purchase_invoices: ['فاکتور خرید', 'خرید', 'purchase invoice', 'purchase'],
  price_lists: ['لیست قیمت', 'لیست قیمت‌ها', 'قیمت', 'price list', 'price lists', 'pricing'],
  product_bundles: ['پکیج', 'پکیج‌ها', 'باندل', 'bundle', 'bundles', 'package', 'packages'],
  cash_bank_operations: ['پرداخت', 'پرداختی', 'دریافت', 'دریافتی', 'نقد', 'بانک', 'cash', 'bank', 'payment', 'receipt'],
  petty_funds: ['تنخواه', 'تنخواه گردان', 'petty', 'petty fund'],
  products: ['محصول', 'محصولات', 'کالا', 'product', 'products', 'اقلام'],
  projects: ['پروژه', 'پروژه‌ها', 'project', 'projects'],
  tasks: ['فعالیت', 'کار', 'وظیفه', 'task', 'tasks', 'یادآوری'],
  process_runs: ['فرآیند', 'فرایند', 'مراحل', 'مرحله', 'process', 'workflow'],
  marketing_leads: ['سرنخ', 'لید', 'lead', 'leads', 'بازاریابی'],
  cheques: ['چک', 'cheque', 'check'],
  barters: ['تهاتر', 'barter'],
  employees: ['کارمند', 'کارکنان', 'منابع انسانی', 'employee', 'employees'],
  journal_entries: ['سند حسابداری', 'journal', 'journal entry'],
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
};

const QUERY_STOP_WORDS = new Set([
  'این',
  'اون',
  'برای',
  'درباره',
  'راجع',
  'راجب',
  'چی',
  'چیه',
  'کدام',
  'کدوم',
  'مورد',
  'های',
  'ها',
  'من',
  'تو',
  'شما',
  'the',
  'and',
  'with',
  'about',
  'what',
  'who',
  'customer',
  'customers',
  'invoice',
  'invoices',
  'product',
  'products',
  'project',
  'projects',
  'مشتری',
  'مشتریان',
  'فاکتور',
  'محصول',
  'محصولات',
  'پروژه',
  'پرداخت',
  'دریافت',
]);

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

const getEnvProviderConfig = () => ({
  provider: String(Deno.env.get('AI_PROVIDER') || Deno.env.get('AVALAI_PROVIDER') || 'avalai').trim() || 'avalai',
  baseUrl: normalizeBaseUrl(Deno.env.get('AI_BASE_URL') || Deno.env.get('AVALAI_BASE_URL') || DEFAULT_AI_BASE_URL),
  model: String(Deno.env.get('AI_MODEL') || Deno.env.get('AVALAI_MODEL') || DEFAULT_AI_MODEL).trim() || DEFAULT_AI_MODEL,
  apiKey: String(Deno.env.get('AI_API_KEY') || Deno.env.get('AVALAI_API_KEY') || Deno.env.get('OPENAI_API_KEY') || '').trim(),
  isActive: true,
  source: 'env',
});

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

const canManageAiProviderSettings = (authContext: any) => {
  const permissions = authContext?.permissions;
  if (!permissions || typeof permissions !== 'object') return true;
  const settingsPerm = permissions?.__settings_tabs || {};
  const fields = settingsPerm?.fields || {};
  return settingsPerm?.view !== false && settingsPerm?.edit !== false && fields?.connections !== false;
};

const loadOrgProviderSettings = async (supabaseUrl: string, serviceRoleKey: string, authContext: any) => {
  if (!authContext?.orgId) return null;
  try {
    const rows = await restSelect(supabaseUrl, serviceRoleKey, 'ai_provider_settings', {
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

const resolveProviderConfig = async (supabaseUrl: string, serviceRoleKey: string, authContext: any) => {
  const envConfig = getEnvProviderConfig();
  const settings = await loadOrgProviderSettings(supabaseUrl, serviceRoleKey, authContext);
  if (!settings) return envConfig;
  return {
    provider: String(settings.provider || envConfig.provider).trim() || envConfig.provider,
    baseUrl: normalizeBaseUrl(settings.base_url || envConfig.baseUrl),
    model: String(settings.model || envConfig.model).trim() || envConfig.model,
    apiKey: String(settings.api_key || envConfig.apiKey || '').trim(),
    isActive: settings.is_active !== false,
    source: 'org',
  };
};

const resolveProviderConfigFromBody = async (supabaseUrl: string, serviceRoleKey: string, authContext: any, body: any) => {
  const envConfig = getEnvProviderConfig();
  const existing = await loadOrgProviderSettings(supabaseUrl, serviceRoleKey, authContext);
  const incoming = body?.settings || {};
  const hasIncomingIsActive = Object.prototype.hasOwnProperty.call(incoming, 'is_active') || Object.prototype.hasOwnProperty.call(incoming, 'isActive');
  return {
    provider: String(incoming.provider || existing?.provider || envConfig.provider || 'avalai').trim() || 'avalai',
    baseUrl: normalizeBaseUrl(incoming.base_url || incoming.baseUrl || existing?.base_url || envConfig.baseUrl),
    model: String(incoming.model || existing?.model || envConfig.model || DEFAULT_AI_MODEL).trim() || DEFAULT_AI_MODEL,
    apiKey: String(incoming.api_key || incoming.apiKey || existing?.api_key || envConfig.apiKey || '').trim(),
    isActive: hasIncomingIsActive ? incoming.is_active !== false && incoming.isActive !== false : existing?.is_active !== false,
    source: existing ? 'org' : 'env',
  };
};

const maskProviderSettings = (settings: any | null, envConfig = getEnvProviderConfig()) => ({
  provider: String(settings?.provider || envConfig.provider || 'avalai').trim(),
  base_url: String(settings?.base_url || envConfig.baseUrl || DEFAULT_AI_BASE_URL).trim(),
  model: String(settings?.model || envConfig.model || DEFAULT_AI_MODEL).trim(),
  api_key: '',
  has_api_key: Boolean(String(settings?.api_key || envConfig.apiKey || '').trim()),
  is_active: settings?.is_active !== false,
  source: settings ? 'org' : 'env',
});

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
  const rows = await restSelect(supabaseUrl, serviceRoleKey, 'document_chunks', {
    org_id: `eq.${authContext.orgId}`,
    status: 'eq.active',
    select: 'id,document_id,chunk_index,content,metadata,updated_at',
    order: 'updated_at.desc',
    limit: 80,
  });
  const instructionRows = rows.filter((row: any) =>
    String(row?.metadata?.system_key || '').trim() === 'ai_instructions'
    || String(row?.metadata?.document_type || '').trim() === 'ai_instructions'
  );
  const otherRows = rows.filter((row: any) => !instructionRows.includes(row));
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

const buildPromptMessages = (
  message: string,
  pageContext: any,
  knowledgeChunks: any[],
  companyContext: any,
  authContext: any,
  retrievedContexts: any[],
  historyRows: any[] = [],
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
    ai_instructions: aiInstructions,
    organization_knowledge: otherKnowledge,
    user_question: message,
  };

  const systemContent = pageContext.intent === 'process_guide'
    ? 'شما دستیار سازمانی KalamApp هستید. کاربر راهنمای آموزشی یک فرآیند را می‌خواهد. اول فقط از process_guide.process_guide_context و سپس از ai_instructions، اطلاعات شرکت، context صفحه و دانش سازمان استفاده کنید. پاسخ باید فارسی، دقیق، آموزشی و اجرایی باشد. ترتیب پاسخ: 1) نمای کلی کوتاه فرآیند 2) توضیح مرحله‌به‌مرحله 3) برای هر مرحله صریح بگویید پیش‌نویس/ارجاع‌نشده است یا فعالیت واقعی دارد؛ اگر فعالیت واقعی دارد status/status_label و اینکه به شخص یا نقش/تیم ارجاع شده را ذکر کنید 4) برای هر مرحله بگویید اگر انجام شود چه پیام، اعلان یا اقدام خودکاری رخ می‌دهد و مخاطب آن کیست 5) شرط‌ها، فیلدها و اکشن‌ها را با label فارسی موجود در context توضیح دهید 6) هر ابهام یا داده ناقص را صریح اعلام کنید. اگر اتوماسیونی پیدا نشد، شفاف بگویید که پیدا نشد و چیزی حدس نزنید.'
    : 'شما دستیار سازمانی KalamApp هستید. هویت شما دستیار هوشمند همین سازمان داخل KalamApp است، نه یک دستیار عمومی. اول از ai_instructions و بعد از اطلاعات شرکت، واحد پول، نقش و جایگاه کاربر، Context مجاز صفحه، Contextهای مجاز بازیابی‌شده و دانش سازمانی استفاده کنید. واحد پول را فقط از company.currency_label/company.currency_code بگویید و اگر تنظیم نشده بود عدم قطعیت را اعلام کنید. دسترسی را بر اساس داده‌های مجاز موجود در همین پیام رعایت کنید؛ اگر داده‌ای در Contextها نیست، نگویید قطعا دسترسی ندارد، بگویید در داده‌های مجاز بازیابی‌شده پیدا نشد یا شناسه/نام دقیق‌تری لازم است. پاسخ‌ها فارسی، دقیق، کوتاه و اجرایی باشند. هیچ تغییر داده، ثبت یادداشت یا اقدام عملیاتی انجام ندهید.';

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
  const billing = parsed?.billing || parsed?.cost || parsed?.usage_cost || parsed?.charge || parsed?.choices?.[0]?.billing || null;
  const cost: Record<string, any> = {};
  if (billing && typeof billing === 'object') Object.assign(cost, billing);
  if (typeof billing === 'number') cost.amount = billing;
  ['cost', 'cost_usd', 'usd', 'amount', 'amount_usd', 'rial', 'rials', 'toman', 'tomans', 'amount_rial', 'amount_toman', 'currency'].forEach((key) => {
    if (parsed && Object.prototype.hasOwnProperty.call(parsed, key)) cost[key] = parsed[key];
  });

  return {
    provider: providerConfig.provider,
    model: providerConfig.model,
    usage,
    cost: Object.keys(cost).length ? cost : null,
  };
};

const callChatCompletions = async (
  providerConfig: any,
  messages: Array<{ role: string; content: string }>,
  options?: { temperature?: number; maxTokens?: number }
) => {
  if (providerConfig?.isActive === false) {
    throw new Error('اتصال AI برای این سازمان غیرفعال است.');
  }
  if (!providerConfig.apiKey) {
    throw new Error('کلید AI تنظیم نشده است. در تب اتصالات، بخش سرویس‌دهنده AI را تکمیل کنید یا مقدار AI_API_KEY/AVALAI_API_KEY را در Edge Function secrets ثبت کنید.');
  }

  const response = await fetch(`${providerConfig.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${providerConfig.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: providerConfig.model,
      messages,
      temperature: options?.temperature ?? 0.2,
      max_tokens: options?.maxTokens ?? 900,
    }),
  });

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
    raw: parsed,
    usageMetadata: extractUsageMetadata(parsed, providerConfig),
  };
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

const ensureThread = async (
  supabaseUrl: string,
  serviceRoleKey: string,
  authContext: any,
  payload: { threadId?: string | null; title?: string; pageContext?: any; contextKey?: string; provider?: string; model?: string },
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
  const existing = await findThreadByContextKey(supabaseUrl, serviceRoleKey, authContext, contextKey);
  if (existing) return existing;

  const inserted = await restInsert(supabaseUrl, serviceRoleKey, 'ai_threads', [{
    org_id: authContext.orgId,
    user_id: authContext.userId,
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

const handleGetProviderSettings = async (supabaseUrl: string, serviceRoleKey: string, authContext: any) => {
  if (!canManageAiProviderSettings(authContext)) {
    return json(403, { success: false, message: 'دسترسی مدیریت اتصالات AI را ندارید.' });
  }
  const settings = await loadOrgProviderSettings(supabaseUrl, serviceRoleKey, authContext);
  return json(200, {
    success: true,
    settings: maskProviderSettings(settings),
  });
};

const handleSaveProviderSettings = async (supabaseUrl: string, serviceRoleKey: string, authContext: any, body: any) => {
  if (!canManageAiProviderSettings(authContext)) {
    return json(403, { success: false, message: 'دسترسی مدیریت اتصالات AI را ندارید.' });
  }
  if (!authContext.orgId) {
    return json(400, { success: false, message: 'سازمان کاربر مشخص نیست.' });
  }

  const incoming = body?.settings || {};
  const existing = await loadOrgProviderSettings(supabaseUrl, serviceRoleKey, authContext);
  const provider = String(incoming.provider || 'avalai').trim() || 'avalai';
  const baseUrl = normalizeBaseUrl(incoming.base_url || incoming.baseUrl || DEFAULT_AI_BASE_URL);
  const model = String(incoming.model || '').trim() || DEFAULT_AI_MODEL;
  const rawApiKey = String(incoming.api_key || incoming.apiKey || '').trim();
  const apiKey = rawApiKey ? rawApiKey : String(existing?.api_key || '').trim();
  const isActive = incoming.is_active !== false;

  const rows = await restUpsert(supabaseUrl, serviceRoleKey, 'ai_provider_settings', [{
    org_id: authContext.orgId,
    provider,
    base_url: baseUrl,
    model,
    api_key: apiKey,
    is_active: isActive,
    updated_by: authContext.userId,
    created_by: existing?.created_by || authContext.userId,
    metadata: {
      last_saved_via: 'connections_tab',
      key_updated: Boolean(rawApiKey),
    },
  }], 'org_id');

  return json(200, {
    success: true,
    settings: maskProviderSettings(rows[0] || existing),
  });
};

const handleGetThread = async (supabaseUrl: string, serviceRoleKey: string, authContext: any, body: any) => {
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
  const contextKey = buildContextKey(rawContext);
  const pageContext = await buildPermittedPageContext(supabaseUrl, serviceRoleKey, authContext, rawContext);
  const [knowledgeChunks, providerConfig, companyContext] = await Promise.all([
    fetchKnowledgeChunks(supabaseUrl, serviceRoleKey, authContext, message),
    resolveProviderConfig(supabaseUrl, serviceRoleKey, authContext),
    loadCompanyContext(supabaseUrl, serviceRoleKey, authContext),
  ]);
  const retrievedContexts = await fetchRelevantModuleContexts(supabaseUrl, serviceRoleKey, authContext, message, pageContext);
  const thread = await ensureThread(supabaseUrl, serviceRoleKey, authContext, {
    threadId: body?.threadId || null,
    title: message.slice(0, 90),
    pageContext,
    contextKey,
    provider: providerConfig.provider,
    model: providerConfig.model,
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
    authContext,
    retrievedContexts,
    previousMessages,
  ));
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
    resolveProviderConfig(supabaseUrl, serviceRoleKey, authContext),
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
  ], { temperature: 0.22, maxTokens: 460 });

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

  return json(200, {
    success: true,
    threadId: thread.id,
    userMessageId: userMessage?.id || null,
    messageId: assistantMessage?.id || null,
    suggestedReply,
    provider: aiResult.provider,
    model: aiResult.model,
    usage: aiResult.usageMetadata,
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
  if (!canManageAiProviderSettings(authContext)) {
    return json(403, { success: false, message: 'دسترسی مدیریت اتصالات AI را ندارید.' });
  }
  const providerConfig = await resolveProviderConfigFromBody(supabaseUrl, serviceRoleKey, authContext, body);
  if (!providerConfig.apiKey) return json(400, { success: false, message: 'برای دریافت مدل‌ها کلید API لازم است.' });
  const response = await fetch(`${providerConfig.baseUrl}/models`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${providerConfig.apiKey}`,
      'Content-Type': 'application/json',
    },
  });
  const raw = await response.text();
  const parsed = parseJsonSafe(raw);
  if (!response.ok) {
    const providerDefaults = providerConfig.provider === 'openai'
      ? ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-mini', 'gpt-4.1']
      : ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-mini', 'gpt-4.1', 'gemini-2.0-flash', 'claude-3-5-sonnet'];
    return json(200, {
      success: true,
      models: providerDefaults.map((id) => ({ id, label: id })),
      warning: 'Provider لیست مدل‌ها را از مسیر OpenAI-compatible /models برنگرداند؛ لیست پیشنهادی نمایش داده شد.',
      raw: parsed,
    });
  }
  return json(200, {
    success: true,
    models: parseModelsResponse(parsed),
    raw: parsed,
  });
};

const handleTestProvider = async (supabaseUrl: string, serviceRoleKey: string, authContext: any, body: any) => {
  if (!canManageAiProviderSettings(authContext)) {
    return json(403, { success: false, message: 'دسترسی مدیریت اتصالات AI را ندارید.' });
  }
  const providerConfig = await resolveProviderConfigFromBody(supabaseUrl, serviceRoleKey, authContext, body);
  const result = await callChatCompletions(providerConfig, [
    { role: 'system', content: 'فقط عبارت «اتصال برقرار است» را برگردان.' },
    { role: 'user', content: 'تست اتصال' },
  ], { temperature: 0, maxTokens: 30 });
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
  if (!canManageAiProviderSettings(authContext)) {
    return json(403, { success: false, message: 'دسترسی مدیریت اتصالات AI را ندارید.' });
  }
  const providerConfig = await resolveProviderConfigFromBody(supabaseUrl, serviceRoleKey, authContext, body);
  if (!providerConfig.apiKey) return json(400, { success: false, message: 'برای مشاهده اعتبار کلید API لازم است.' });

  const base = providerConfig.baseUrl.replace(/\/+$/, '');
  const root = base.replace(/\/v\d+$/i, '');
  const paths = [
    `${base}/credits`,
    `${base}/credit`,
    `${base}/balance`,
    `${base}/billing/credit_grants`,
    `${root}/credits`,
    `${root}/credit`,
    `${root}/balance`,
    `${root}/api/credits`,
    `${root}/api/balance`,
    `${root}/dashboard/billing/credit_grants`,
    `${root}/user/balance`,
    `${root}/account/balance`,
  ];

  const errors: any[] = [];
  for (const url of Array.from(new Set(paths))) {
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${providerConfig.apiKey}`,
          'Content-Type': 'application/json',
        },
      });
      const raw = await response.text();
      const parsed = parseJsonSafe(raw);
      if (response.ok) {
        return json(200, {
          success: true,
          available: true,
          endpoint: url,
          credit: normalizeCreditPayload(parsed),
        });
      }
      errors.push({ url, status: response.status, body: parsed });
    } catch (error: any) {
      errors.push({ url, message: String(error?.message || error) });
    }
  }

  return json(200, {
    success: true,
    available: false,
    message: 'این provider مسیر عمومی سازگار برای مشاهده اعتبار برنگرداند. اگر مسیر اختصاصی دارد، باید adapter جدا برای آن اضافه شود.',
    errors: errors.slice(0, 4),
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

    if (action === 'get_provider_settings') return await handleGetProviderSettings(supabaseUrl, serviceRoleKey, authContext);
    if (action === 'save_provider_settings') return await handleSaveProviderSettings(supabaseUrl, serviceRoleKey, authContext, body);
    if (action === 'test_provider') return await handleTestProvider(supabaseUrl, serviceRoleKey, authContext, body);
    if (action === 'list_models') return await handleListModels(supabaseUrl, serviceRoleKey, authContext, body);
    if (action === 'get_credit') return await handleGetCredit(supabaseUrl, serviceRoleKey, authContext, body);
    if (action === 'get_thread') return await handleGetThread(supabaseUrl, serviceRoleKey, authContext, body);
    if (action === 'delete_thread') return await handleDeleteThread(supabaseUrl, serviceRoleKey, authContext, body);
    if (action === 'chat') return await handleChat(supabaseUrl, serviceRoleKey, authContext, body);
    if (action === 'suggest_reply') return await handleSuggestReply(supabaseUrl, serviceRoleKey, authContext, body);
    if (action === 'propose_note') return await handleProposeNote(supabaseUrl, serviceRoleKey, authContext, body);
    if (action === 'confirm_action') return await handleConfirmAction(supabaseUrl, serviceRoleKey, authContext, body);

    return json(400, { success: false, message: 'اقدام درخواستی پشتیبانی نمی‌شود.' });
  } catch (error: any) {
    const message = String(error?.message || 'خطای ناشناخته');
    const status = message === 'Unauthorized' ? 401 : 500;
    console.error('ai-assistant failed', error);
    return json(status, { success: false, message });
  }
});
