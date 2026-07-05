import type { SupabaseClient } from '@supabase/supabase-js';
import { FieldType, type ModuleDefinition } from '../types';
import { getFieldLabelFa } from './fieldLabel';
import { getRecordTitle } from './recordTitle';
import { normalizePhoneDigits, normalizePhoneForStorage } from './phoneNumber';
import { isSaasAdminModuleId, type PermissionMap, type RecordScope } from './permissions';

export type GlobalSearchMatchField = {
  key: string;
  label: string;
};

export type GlobalSearchResult = {
  moduleId: string;
  moduleTitle: string;
  recordId: string;
  title: string;
  subtitle: string;
  matchedFields: GlobalSearchMatchField[];
  payload: Record<string, any>;
  score: number;
  createdAt?: string | null;
};

export type GlobalSearchGroup = {
  moduleId: string;
  moduleTitle: string;
  items: GlobalSearchResult[];
  hasMore: boolean;
};

export type GlobalSearchModule = {
  id: string;
  title: string;
  recordScope: RecordScope;
  keys: string[];
  displayKeys: string[];
  fieldLabels: Record<string, string>;
  phoneKeys: string[];
};

const ZERO_WIDTH_REGEX = /[\u200c\u200d\u200e\u200f\u202a-\u202e]/g;
const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';
const FALLBACK_SEARCH_LIMIT = 8;
const SEARCH_CACHE_TTL_MS = 30000;
const FALLBACK_CONCURRENCY = 6;
const FALLBACK_CANDIDATE_MULTIPLIER = 4;
const FALLBACK_CANDIDATE_PADDING = 8;
const FALLBACK_MAX_CANDIDATES = 60;
const GLOBAL_SEARCH_FAST_MODULE_IDS = [
  'customers',
  'suppliers',
  'employees',
  'products',
  'invoices',
  'purchase_invoices',
  'tasks',
  'projects',
  'marketing_leads',
  'secretariat_documents',
];

export const GLOBAL_SEARCH_MIN_QUERY_LENGTH = 2;
export const GLOBAL_SEARCH_RPC_SUPPORTED_MODULE_IDS = [
  'products', 'billboards', 'product_bundles', 'warehouses', 'shelves', 'stock_transfers',
  'secretariat_documents', 'delivery_forms', 'production_boms', 'production_orders',
  'production_group_orders', 'customers', 'suppliers', 'invoices', 'purchase_invoices',
  'projects', 'marketing_leads', 'personas', 'instructions', 'process_templates',
  'process_runs', 'tasks', 'calculation_formulas', 'fiscal_years', 'chart_of_accounts',
  'journal_entries', 'accounting_event_rules', 'cost_centers', 'cash_boxes',
  'bank_accounts', 'petty_funds', 'cheques', 'barters', 'cash_bank_operations',
  'profiles', 'employees', 'attendance_logs', 'work_schedules', 'leave_requests',
  'overtime_requests', 'mission_requests', 'price_lists', 'web_forms',
  'automation_execution_reports', 'sms_delivery_reports', 'voip_call_reports',
  'counterparty_bot_groups', 'expense_documents', 'employee_advances',
  'employee_bonus_requests', 'employee_penalty_requests', 'payroll_slips',
  'employee_contracts', 'recruitment_applicants', 'job_descriptions', 'surveys',
] as const;

const searchCache = new Map<string, { expiresAt: number; groups: GlobalSearchGroup[] }>();
const GLOBAL_SEARCH_RPC_SUPPORTED_MODULE_ID_SET = new Set<string>(GLOBAL_SEARCH_RPC_SUPPORTED_MODULE_IDS);
const ILIKE_SEARCHABLE_FIELD_TYPES = new Set<FieldType>([
  FieldType.TEXT,
  FieldType.LONG_TEXT,
  FieldType.SUPER_LONG_TEXT,
  FieldType.PHONE,
  FieldType.LINK,
  FieldType.SELECT,
  FieldType.STATUS,
]);
const PHONE_LIKE_KEY_REGEX = /(phone|mobile|tel|cell|sender|recipient|source_number|destination_number|respondent_phone)/i;

export const digitsToEnglish = (value: unknown): string =>
  String(value ?? '')
    .replace(/[۰-۹]/g, (digit) => String(PERSIAN_DIGITS.indexOf(digit)))
    .replace(/[٠-٩]/g, (digit) => String(ARABIC_DIGITS.indexOf(digit)));

export const normalizePersianSearchText = (value: unknown): string =>
  digitsToEnglish(value)
    .replace(ZERO_WIDTH_REGEX, ' ')
    .replace(/[ـ]+/g, '')
    .replace(/ك/g, 'ک')
    .replace(/[يى]/g, 'ی')
    .replace(/ۀ/g, 'ه')
    .replace(/ة/g, 'ه')
    .trim()
    .toLocaleLowerCase('fa')
    .replace(/\s+/g, ' ');

export const normalizeGlobalSearchQuery = (value: unknown): string => normalizePersianSearchText(value);
export const isGlobalSearchQueryReady = (value: unknown): boolean =>
  normalizeGlobalSearchQuery(value).length >= GLOBAL_SEARCH_MIN_QUERY_LENGTH;

export const buildPhoneSearchVariants = (value: unknown): string[] => {
  const rawDigits = normalizePhoneDigits(digitsToEnglish(value));
  const storedPhone = normalizePhoneForStorage(value);
  const variants = new Set<string>();
  const push = (item: unknown) => {
    const normalized = String(item ?? '').trim();
    if (normalized) variants.add(normalized);
  };

  push(rawDigits);
  push(storedPhone);
  if (rawDigits.startsWith('0098')) {
    push(`+${rawDigits.slice(2)}`);
    push(`0${rawDigits.slice(4)}`);
    push(rawDigits.slice(4));
  }
  if (rawDigits.startsWith('98')) {
    push(`+${rawDigits}`);
    push(`0${rawDigits.slice(2)}`);
    push(rawDigits.slice(2));
  }
  if (rawDigits.startsWith('09')) {
    push(`+98${rawDigits.slice(1)}`);
    push(`98${rawDigits.slice(1)}`);
    push(rawDigits.slice(1));
  }
  if (rawDigits.startsWith('9') && rawDigits.length >= 10) {
    push(`0${rawDigits}`);
    push(`+98${rawDigits}`);
    push(`98${rawDigits}`);
  }

  return Array.from(variants);
};

const isSearchableField = (field: any): boolean => {
  const key = String(field?.key || '').trim();
  if (!key || key.includes('.')) return false;
  if (field?.type) return ILIKE_SEARCHABLE_FIELD_TYPES.has(field.type);
  return /name|title|code|number|phone|mobile|email|subject|description|notes|status|city|address/i.test(key);
};

const isAbortFailure = (error: any, signal?: AbortSignal): boolean => {
  if (signal?.aborted) return true;
  const name = String(error?.name || '').toLowerCase();
  const message = String(error?.message || error?.details || '').toLowerCase();
  return name === 'aborterror' || message.includes('aborterror') || message.includes('signal is aborted');
};

const isMissingRpcFailure = (error: any): boolean => {
  const code = String(error?.code || '').trim().toUpperCase();
  const message = String(error?.message || '').toLowerCase();
  return code === 'PGRST202' || code === '42883' || message.includes('could not find the function');
};

const getModuleSearchKeys = (module: ModuleDefinition): string[] => {
  const fieldKeys = new Set((module.fields || []).map((field: any) => String(field?.key || '').trim()).filter(Boolean));
  const preferred = [
    'name',
    'title',
    'full_name',
    'first_name',
    'last_name',
    'business_name',
    'legal_name',
    'system_code',
    'manual_code',
    'legacy_contact_code',
    'legacy_system_code',
    'legacy_invoice_number',
    'accounting_code',
    'mobile_1',
    'mobile_2',
    'phone',
    'assistant_phone',
    'email',
    'national_code',
    'national_id',
    'description',
    'notes',
  ];
  const relationKeys = module.relationDisplay?.searchFields || [];
  const typedKeys = (module.fields || []).filter(isSearchableField).map((field: any) => String(field.key || '').trim());
  const keyField = module.fields?.find((field: any) => field.isKey)?.key;

  return Array.from(new Set([...preferred, ...(keyField ? [keyField] : []), ...relationKeys, ...typedKeys]))
    .map((key) => String(key || '').trim())
    .filter((key) => key && fieldKeys.has(key));
};

const getDisplayKeys = (module: ModuleDefinition, keys: string[], fieldPermissions: Record<string, any>): string[] => {
  const dashboardKeys = module.dashboard?.recentListFields || [];
  return Array.from(new Set(['id', 'created_at', 'updated_at', 'system_code', 'manual_code', ...keys, ...dashboardKeys]))
    .filter((key) => key && !key.includes('.') && (key === 'id' || key === 'created_at' || key === 'updated_at' || fieldPermissions[key] !== false));
};

export const buildGlobalSearchModules = (
  modules: Record<string, ModuleDefinition>,
  permissions?: PermissionMap | null
): GlobalSearchModule[] =>
  Object.entries(modules)
    .filter(([moduleId, module]) => module && !isSaasAdminModuleId(moduleId) && permissions?.[moduleId]?.view !== false)
    .map(([moduleId, module]) => {
      const recordScope = permissions?.[moduleId]?.record_scope ?? (permissions?.[moduleId]?.view === false ? 'own' : 'all');
      const fieldPermissions = permissions?.[moduleId]?.fields || {};
      const keys = getModuleSearchKeys(module).filter((key) => fieldPermissions[key] !== false);
      const fieldLabels = (module.fields || []).reduce<Record<string, string>>((acc, field: any) => {
        const key = String(field?.key || '').trim();
        if (key) acc[key] = getFieldLabelFa(field, { moduleId, fallback: key });
        return acc;
      }, {});
      const phoneKeys = (module.fields || [])
        .filter((field: any) => field?.type === FieldType.PHONE || PHONE_LIKE_KEY_REGEX.test(String(field?.key || '')))
        .map((field: any) => String(field.key || '').trim())
        .filter((key: string) => keys.includes(key));

      return {
        id: moduleId,
        title: module.titles?.fa || module.titles?.faSingular || moduleId,
        recordScope,
        keys,
        displayKeys: getDisplayKeys(module, keys, fieldPermissions),
        fieldLabels,
        phoneKeys,
      };
    })
    .filter((module) => module.keys.length > 0);

export const splitGlobalSearchModulesByPriority = (
  modules: GlobalSearchModule[]
): { fastModules: GlobalSearchModule[]; remainingModules: GlobalSearchModule[] } => {
  const priority = new Map(GLOBAL_SEARCH_FAST_MODULE_IDS.map((moduleId, index) => [moduleId, index]));
  const fastModules = modules
    .filter((module) => priority.has(module.id))
    .sort((left, right) => (priority.get(left.id) ?? 999) - (priority.get(right.id) ?? 999));
  const fastModuleIds = new Set(fastModules.map((module) => module.id));
  const remainingModules = modules.filter((module) => !fastModuleIds.has(module.id));
  return { fastModules, remainingModules };
};

export const mergeGlobalSearchGroups = (groups: GlobalSearchGroup[]): GlobalSearchGroup[] => {
  const grouped = new Map<string, GlobalSearchGroup>();
  groups.forEach((group) => {
    const current = grouped.get(group.moduleId);
    if (!current) {
      grouped.set(group.moduleId, {
        ...group,
        items: [...group.items].sort(compareGlobalSearchResults),
      });
      return;
    }
    const deduped = new Map<string, GlobalSearchResult>();
    [...current.items, ...group.items].forEach((item) => {
      const key = `${item.moduleId}:${item.recordId}`;
      const existing = deduped.get(key);
      if (!existing || compareGlobalSearchResults(existing, item) > 0) {
        deduped.set(key, item);
      }
    });
    grouped.set(group.moduleId, {
      ...current,
      items: Array.from(deduped.values()).sort(compareGlobalSearchResults),
      hasMore: current.hasMore || group.hasMore,
    });
  });
  return Array.from(grouped.values());
};

const escapePostgrestSearchTerm = (value: string): string =>
  String(value || '')
    .replace(/[,%()*]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const calculateFieldMatchScore = (value: unknown, query: string, phoneVariants: string[]): number => {
  const text = normalizePersianSearchText(value);
  let score = 0;
  if (text) {
    if (text === query) score += 120;
    else if (text.startsWith(query)) score += 48;
    else if (text.includes(query)) score += 16;
  }

  const digits = normalizePhoneDigits(value);
  if (digits) {
    phoneVariants.forEach((variant) => {
      const normalizedVariant = normalizePhoneDigits(variant);
      if (!normalizedVariant) return;
      if (digits === normalizedVariant) score = Math.max(score, 110);
      else if (digits.startsWith(normalizedVariant)) score = Math.max(score, 42);
      else if (digits.includes(normalizedVariant)) score = Math.max(score, 18);
    });
  }

  return score;
};

const compareGlobalSearchResults = (left: GlobalSearchResult, right: GlobalSearchResult): number => {
  if (right.score !== left.score) return right.score - left.score;
  const rightCreatedAt = right.createdAt ? new Date(right.createdAt).getTime() : 0;
  const leftCreatedAt = left.createdAt ? new Date(left.createdAt).getTime() : 0;
  if (rightCreatedAt !== leftCreatedAt) return rightCreatedAt - leftCreatedAt;
  return String(left.title || '').localeCompare(String(right.title || ''), 'fa');
};

const buildResultFromPayload = (
  module: GlobalSearchModule,
  moduleConfig: ModuleDefinition,
  payload: Record<string, any>,
  query: string,
  phoneVariants: string[]
): GlobalSearchResult => {
  const matchedEntries = module.keys
    .map((key) => ({
      key,
      score: calculateFieldMatchScore(payload?.[key], query, phoneVariants),
    }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score || left.key.localeCompare(right.key, 'fa'));
  const matchedFields = matchedEntries
    .slice(0, 4)
    .map((entry) => ({ key: entry.key, label: module.fieldLabels[entry.key] || entry.key }));
  const title = getRecordTitle(payload, moduleConfig, { fallback: '[بدون عنوان]' });
  const subtitleKey = ['system_code', 'manual_code', 'legacy_contact_code', 'accounting_code', 'mobile_1', 'phone']
    .find((key) => payload?.[key]);
  const titleScore = calculateFieldMatchScore(title, query, phoneVariants);
  const subtitleScore = subtitleKey ? calculateFieldMatchScore(payload?.[subtitleKey], query, phoneVariants) : 0;
  const topFieldScore = matchedEntries[0]?.score || 0;

  return {
    moduleId: module.id,
    moduleTitle: module.title,
    recordId: String(payload?.id || ''),
    title,
    subtitle: subtitleKey ? String(payload[subtitleKey] || '') : '',
    matchedFields,
    payload,
    score: titleScore + subtitleScore + topFieldScore + (matchedFields.length * 10),
    createdAt: payload?.created_at || null,
  };
};

const normalizeRpcRow = (
  row: any,
  modulesById: Map<string, GlobalSearchModule>,
  moduleConfigs: Record<string, ModuleDefinition>
): GlobalSearchResult | null => {
  const moduleId = String(row?.module_id || '').trim();
  const recordId = String(row?.record_id || row?.id || '').trim();
  const module = modulesById.get(moduleId);
  if (!module || !recordId) return null;
  const rawPayload = (row?.payload && typeof row.payload === 'object') ? row.payload : {};
  const visiblePayloadKeys = new Set(['id', 'created_at', ...module.displayKeys]);
  const payload = Object.fromEntries(
    Object.entries(rawPayload).filter(([key]) => visiblePayloadKeys.has(key))
  );
  const allowedMatchKeys = new Set(module.keys);
  const matchedKeys = Array.isArray(row?.matched_fields)
    ? row.matched_fields.filter((key: unknown) => allowedMatchKeys.has(String(key || '').trim()))
    : [];
  const matchedFields = matchedKeys.map((key: unknown) => {
    const normalizedKey = String(key || '').trim();
    return { key: normalizedKey, label: module.fieldLabels[normalizedKey] || normalizedKey };
  }).filter((item: GlobalSearchMatchField) => item.key);
  const title = getRecordTitle(payload, moduleConfigs[moduleId], { fallback: '[بدون عنوان]' });
  const subtitleKey = ['system_code', 'manual_code', 'legacy_contact_code', 'legacy_system_code', 'legacy_invoice_number', 'accounting_code', 'mobile_1', 'phone']
    .find((key) => payload?.[key]);

  return {
    moduleId,
    moduleTitle: module.title,
    recordId,
    title,
    subtitle: subtitleKey ? String(payload[subtitleKey] || '').trim() : '',
    matchedFields,
    payload: { id: recordId, ...payload },
    score: Number(row?.score || 0),
    createdAt: row?.created_at || payload?.created_at || null,
  };
};

const groupResults = (
  modules: GlobalSearchModule[],
  results: GlobalSearchResult[],
  limitPerModule: number
): GlobalSearchGroup[] => {
  const moduleOrder = new Map(modules.map((module, index) => [module.id, index]));
  const grouped = new Map<string, GlobalSearchResult[]>();
  results.forEach((result) => {
    const items = grouped.get(result.moduleId) || [];
    items.push(result);
    grouped.set(result.moduleId, items);
  });

  return Array.from(grouped.entries())
    .sort(([left], [right]) => (moduleOrder.get(left) ?? 9999) - (moduleOrder.get(right) ?? 9999))
    .map(([moduleId, items]) => {
      const module = modules.find((item) => item.id === moduleId);
      return {
        moduleId,
        moduleTitle: module?.title || moduleId,
        items: items.slice(0, limitPerModule),
        hasMore: items.length > limitPerModule,
      };
    });
};

const fallbackSearch = async (
  supabase: SupabaseClient,
  moduleConfigs: Record<string, ModuleDefinition>,
  modules: GlobalSearchModule[],
  query: string,
  limitPerModule: number,
  offset: number,
  signal?: AbortSignal
): Promise<GlobalSearchGroup[]> => {
  const safeTerm = escapePostgrestSearchTerm(query);
  if (!safeTerm) return [];
  const phoneVariants = buildPhoneSearchVariants(query);
  const candidateLimit = Math.min(
    FALLBACK_MAX_CANDIDATES,
    Math.max(limitPerModule * FALLBACK_CANDIDATE_MULTIPLIER, offset + limitPerModule + FALLBACK_CANDIDATE_PADDING)
  );

  const searchModule = async (module: GlobalSearchModule): Promise<GlobalSearchGroup | null> => {
    if (module.recordScope !== 'all') return null;
    if (signal?.aborted) throw new DOMException('Global search aborted', 'AbortError');
    const filters = new Set<string>();
    module.keys.forEach((key) => filters.add(`${key}.ilike.%${safeTerm}%`));
    module.phoneKeys.forEach((key) => {
      phoneVariants.forEach((variant) => {
        const safeVariant = escapePostgrestSearchTerm(variant);
        if (safeVariant) filters.add(`${key}.ilike.%${safeVariant}%`);
      });
    });
    if (!filters.size) return null;

    let request = supabase
      .from(module.id)
      .select(module.displayKeys.join(','))
      .or(Array.from(filters).join(','))
      .range(0, Math.max(0, candidateLimit - 1));
    if (signal) request = request.abortSignal(signal);
    const { data, error } = await request;
    if (error || !Array.isArray(data) || !data.length) return null;

    const moduleConfig = moduleConfigs[module.id];
    const scoredItems = data
      .map((row: any) => buildResultFromPayload(module, moduleConfig, row, query, phoneVariants))
      .filter((item) => item.recordId)
      .sort(compareGlobalSearchResults);
    const pagedItems = scoredItems.slice(offset, offset + limitPerModule);

    return {
      moduleId: module.id,
      moduleTitle: module.title,
      items: pagedItems,
      hasMore: scoredItems.length > offset + limitPerModule || data.length >= candidateLimit,
    } as GlobalSearchGroup;
  };

  const results: GlobalSearchGroup[] = [];
  for (let index = 0; index < modules.length; index += FALLBACK_CONCURRENCY) {
    if (signal?.aborted) throw new DOMException('Global search aborted', 'AbortError');
    const settled = await Promise.allSettled(modules.slice(index, index + FALLBACK_CONCURRENCY).map(searchModule));
    settled.forEach((item) => {
      if (item.status === 'fulfilled' && item.value?.items.length) results.push(item.value);
    });
  }
  return results;
};

export const searchGlobalRecords = async (
  supabase: SupabaseClient,
  moduleConfigs: Record<string, ModuleDefinition>,
  modules: GlobalSearchModule[],
  options: {
    query: string;
    limitPerModule?: number;
    offset?: number;
    forceRefresh?: boolean;
    cacheNamespace?: string;
    signal?: AbortSignal;
  }
): Promise<GlobalSearchGroup[]> => {
  const query = normalizeGlobalSearchQuery(options.query);
  const limitPerModule = Math.max(1, Math.min(30, options.limitPerModule || FALLBACK_SEARCH_LIMIT));
  const offset = Math.max(0, options.offset || 0);
  const activeModules = modules.filter((module) => module.keys.length > 0);
  if (!isGlobalSearchQueryReady(query) || !activeModules.length) return [];

  const cacheKey = JSON.stringify({
    access: options.cacheNamespace || '',
    query,
    limitPerModule,
    offset,
    modules: activeModules.map((module) => [module.id, module.keys]),
  });
  const canUseCache = Boolean(options.cacheNamespace);
  const cached = canUseCache ? searchCache.get(cacheKey) : undefined;
  if (!options.forceRefresh && cached && cached.expiresAt > Date.now()) return cached.groups;

  const modulesById = new Map(activeModules.map((module) => [module.id, module]));
  const rpcModules = activeModules.filter((module) => GLOBAL_SEARCH_RPC_SUPPORTED_MODULE_ID_SET.has(module.id));
  const fallbackOnlyModules = activeModules.filter((module) => !GLOBAL_SEARCH_RPC_SUPPORTED_MODULE_ID_SET.has(module.id));

  const runRpcSearch = async (): Promise<GlobalSearchGroup[]> => {
    if (!rpcModules.length) return [];
    let rpcRequest = supabase.rpc('global_search_records', {
      p_query: query,
      p_modules: rpcModules.map((module) => module.id),
      p_limit_per_module: limitPerModule,
      p_offset: offset,
    });
    if (options.signal) rpcRequest = rpcRequest.abortSignal(options.signal);
    const { data, error } = await rpcRequest;

    if (error) {
      if (isAbortFailure(error, options.signal)) {
        throw new DOMException('Global search aborted', 'AbortError');
      }
      if (!isMissingRpcFailure(error)) {
        throw error;
      }
      console.warn('Global search RPC unavailable, using client fallback', error);
      return fallbackSearch(supabase, moduleConfigs, rpcModules, query, limitPerModule, offset, options.signal);
    }

    if (!Array.isArray(data)) return [];
    const results = data
      .map((row: any) => normalizeRpcRow(row, modulesById, moduleConfigs))
      .filter((item): item is GlobalSearchResult => Boolean(item));
    return groupResults(rpcModules, results, limitPerModule);
  };

  const [rpcGroups, fallbackGroups] = await Promise.all([
    runRpcSearch(),
    fallbackOnlyModules.length
      ? fallbackSearch(supabase, moduleConfigs, fallbackOnlyModules, query, limitPerModule, offset, options.signal)
      : Promise.resolve([] as GlobalSearchGroup[]),
  ]);
  const groups = mergeGlobalSearchGroups([...rpcGroups, ...fallbackGroups]);

  if (canUseCache) {
    searchCache.set(cacheKey, { expiresAt: Date.now() + SEARCH_CACHE_TTL_MS, groups });
  }
  return groups;
};
