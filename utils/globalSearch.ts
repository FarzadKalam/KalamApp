import type { SupabaseClient } from '@supabase/supabase-js';
import { FieldType, type ModuleDefinition } from '../types';
import { getRecordTitle } from './recordTitle';
import { normalizePhoneDigits, normalizePhoneForStorage } from './phoneNumber';
import type { PermissionMap } from './permissions';

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

const searchCache = new Map<string, { expiresAt: number; groups: GlobalSearchGroup[] }>();

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

const fieldLabel = (field: any): string => String(field?.labels?.fa || field?.labels?.en || field?.key || '').trim();

const isSearchableField = (field: any): boolean => {
  const key = String(field?.key || '').trim();
  if (!key || key.includes('.')) return false;
  if (field?.type === FieldType.IMAGE || field?.type === FieldType.JSON || field?.type === FieldType.TAGS) return false;
  if (field?.type === FieldType.TEXT || field?.type === FieldType.LONG_TEXT || field?.type === FieldType.SUPER_LONG_TEXT) return true;
  if (field?.type === FieldType.PHONE || field?.type === FieldType.LINK) return true;
  return /name|title|code|number|phone|mobile|email|subject|description|notes|status|city|address/i.test(key);
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

const getDisplayKeys = (module: ModuleDefinition, keys: string[]): string[] => {
  const dashboardKeys = module.dashboard?.recentListFields || [];
  return Array.from(new Set(['id', 'created_at', 'updated_at', 'system_code', 'manual_code', ...keys, ...dashboardKeys]))
    .filter((key) => key && !key.includes('.'));
};

export const buildGlobalSearchModules = (
  modules: Record<string, ModuleDefinition>,
  permissions?: PermissionMap | null
): GlobalSearchModule[] =>
  Object.entries(modules)
    .filter(([moduleId, module]) => module && permissions?.[moduleId]?.view !== false)
    .map(([moduleId, module]) => {
      const keys = getModuleSearchKeys(module);
      const fieldLabels = (module.fields || []).reduce<Record<string, string>>((acc, field: any) => {
        const key = String(field?.key || '').trim();
        if (key) acc[key] = fieldLabel(field) || key;
        return acc;
      }, {});
      const phoneKeys = (module.fields || [])
        .filter((field: any) => field?.type === FieldType.PHONE || /phone|mobile/i.test(String(field?.key || '')))
        .map((field: any) => String(field.key || '').trim())
        .filter((key: string) => keys.includes(key));

      return {
        id: moduleId,
        title: module.titles?.fa || module.titles?.faSingular || moduleId,
        keys,
        displayKeys: getDisplayKeys(module, keys),
        fieldLabels,
        phoneKeys,
      };
    })
    .filter((module) => module.keys.length > 0);

const escapePostgrestSearchTerm = (value: string): string =>
  String(value || '')
    .replace(/[,%()*]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const itemMatchesField = (value: unknown, query: string, phoneVariants: string[]): boolean => {
  const text = normalizePersianSearchText(value);
  if (!text) return false;
  if (text.includes(query)) return true;
  const digits = normalizePhoneDigits(value);
  return Boolean(digits && phoneVariants.some((variant) => digits.includes(normalizePhoneDigits(variant))));
};

const buildResultFromPayload = (
  module: GlobalSearchModule,
  moduleConfig: ModuleDefinition,
  payload: Record<string, any>,
  query: string,
  phoneVariants: string[]
): GlobalSearchResult => {
  const matchedFields = module.keys
    .filter((key) => itemMatchesField(payload?.[key], query, phoneVariants))
    .slice(0, 4)
    .map((key) => ({ key, label: module.fieldLabels[key] || key }));
  const title = getRecordTitle(payload, moduleConfig, { fallback: String(payload?.id || '-') });
  const subtitleKey = ['system_code', 'manual_code', 'legacy_contact_code', 'accounting_code', 'mobile_1', 'phone']
    .find((key) => payload?.[key]);

  return {
    moduleId: module.id,
    moduleTitle: module.title,
    recordId: String(payload?.id || ''),
    title,
    subtitle: subtitleKey ? String(payload[subtitleKey] || '') : '',
    matchedFields,
    payload,
    score: matchedFields.length,
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
  const payload = (row?.payload && typeof row.payload === 'object') ? row.payload : {};
  const matchedKeys = Array.isArray(row?.matched_fields) ? row.matched_fields : [];
  const matchedFields = matchedKeys.map((key: unknown) => {
    const normalizedKey = String(key || '').trim();
    return { key: normalizedKey, label: module.fieldLabels[normalizedKey] || normalizedKey };
  }).filter((item: GlobalSearchMatchField) => item.key);
  const title = String(row?.title || '').trim() || getRecordTitle(payload, moduleConfigs[moduleId], { fallback: recordId });

  return {
    moduleId,
    moduleTitle: module.title,
    recordId,
    title,
    subtitle: String(row?.subtitle || payload?.system_code || payload?.manual_code || '').trim(),
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
        hasMore: items.length >= limitPerModule,
      };
    });
};

const fallbackSearch = async (
  supabase: SupabaseClient,
  moduleConfigs: Record<string, ModuleDefinition>,
  modules: GlobalSearchModule[],
  query: string,
  limitPerModule: number,
  offset: number
): Promise<GlobalSearchGroup[]> => {
  const safeTerm = escapePostgrestSearchTerm(query);
  if (!safeTerm) return [];
  const phoneVariants = buildPhoneSearchVariants(query);

  const settled = await Promise.allSettled(modules.map(async (module) => {
    const rowsById = new Map<string, Record<string, any>>();
    const successfulKeys = new Set<string>();
    const candidateQueries: Array<{ key: string; term: string }> = [];
    module.keys.forEach((key) => candidateQueries.push({ key, term: safeTerm }));
    module.phoneKeys.forEach((key) => {
      phoneVariants.forEach((variant) => {
        const safeVariant = escapePostgrestSearchTerm(variant);
        if (safeVariant) candidateQueries.push({ key, term: safeVariant });
      });
    });

    for (const candidate of candidateQueries) {
      const { data, error } = await supabase
        .from(module.id)
        .select(`id, ${candidate.key}`)
        .ilike(candidate.key, `%${candidate.term}%`)
        .range(0, offset + limitPerModule - 1);

      if (error) continue;
      successfulKeys.add(candidate.key);
      (data || []).forEach((row: any) => {
        const rowId = String(row?.id || '').trim();
        if (!rowId) return;
        rowsById.set(rowId, { ...(rowsById.get(rowId) || {}), ...row });
      });
      if (rowsById.size >= offset + limitPerModule) break;
    }

    const foundIds = Array.from(rowsById.keys()).slice(offset, offset + limitPerModule);
    if (!foundIds.length) return null;

    let rows = foundIds.map((id) => rowsById.get(id)).filter(Boolean) as Record<string, any>[];
    const { data: detailRows } = await supabase
      .from(module.id)
      .select('*')
      .in('id', foundIds);
    if (Array.isArray(detailRows) && detailRows.length > 0) {
      const detailById = new Map(detailRows.map((row: any) => [String(row?.id || ''), row]));
      rows = foundIds.map((id) => detailById.get(id) || rowsById.get(id)).filter(Boolean) as Record<string, any>[];
    }

    const moduleConfig = moduleConfigs[module.id];
    const items = rows
      .map((row: any) => buildResultFromPayload(module, moduleConfig, row, query, phoneVariants))
      .filter((item) => item.recordId);

    return {
      moduleId: module.id,
      moduleTitle: module.title,
      items,
      hasMore: rowsById.size > offset + limitPerModule || (items.length >= limitPerModule && successfulKeys.size > 0),
    } as GlobalSearchGroup;
  }));

  return settled
    .map((item) => item.status === 'fulfilled' ? item.value : null)
    .filter((group): group is GlobalSearchGroup => Boolean(group && group.items.length));
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
  }
): Promise<GlobalSearchGroup[]> => {
  const query = normalizeGlobalSearchQuery(options.query);
  const limitPerModule = Math.max(1, Math.min(30, options.limitPerModule || FALLBACK_SEARCH_LIMIT));
  const offset = Math.max(0, options.offset || 0);
  const activeModules = modules.filter((module) => module.keys.length > 0);
  if (!query || !activeModules.length) return [];

  const cacheKey = JSON.stringify({
    query,
    limitPerModule,
    offset,
    modules: activeModules.map((module) => module.id),
  });
  const cached = searchCache.get(cacheKey);
  if (!options.forceRefresh && cached && cached.expiresAt > Date.now()) return cached.groups;

  const modulesById = new Map(activeModules.map((module) => [module.id, module]));
  let groups: GlobalSearchGroup[];

  const { data, error } = await supabase.rpc('global_search_records', {
    p_query: query,
    p_modules: activeModules.map((module) => module.id),
    p_limit_per_module: limitPerModule,
    p_offset: offset,
  });

  if (!error && Array.isArray(data)) {
    const results = data
      .map((row: any) => normalizeRpcRow(row, modulesById, moduleConfigs))
      .filter((item): item is GlobalSearchResult => Boolean(item));
    groups = groupResults(activeModules, results, limitPerModule);
  } else {
    if (error) console.warn('Global search RPC unavailable, using client fallback', error);
    groups = await fallbackSearch(supabase, moduleConfigs, activeModules, query, limitPerModule, offset);
  }

  searchCache.set(cacheKey, { expiresAt: Date.now() + SEARCH_CACHE_TTL_MS, groups });
  return groups;
};
