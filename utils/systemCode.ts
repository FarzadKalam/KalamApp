import { fetchSessionBootstrap } from './sessionCache';

const MODULES_WITH_SYSTEM_CODE = new Set([
  'barters',
  'billboards',
  'customers',
  'employees',
  'employee_advances',
  'employee_contracts',
  'expense_documents',
  'invoices',
  'payroll_slips',
  'products',
  'production_boms',
  'production_group_orders',
  'production_orders',
  'projects',
  'purchase_invoices',
  'recruitment_applicants',
  'secretariat_documents',
  'shelves',
  'delivery_forms',
  'suppliers',
  'tasks',
  'stock_transfers',
  'warehouses',
]);

export const supportsSystemCode = (moduleName?: string | null) => {
  const normalized = String(moduleName || '').trim();
  if (!normalized) return false;
  if (normalized === 'profiles') return false;
  return MODULES_WITH_SYSTEM_CODE.has(normalized);
};

const SYSTEM_MODULE_SETTINGS_CONNECTION_TYPE = 'module_settings';

const DEFAULT_SYSTEM_CODE_START_NUMBER = 100;
const DEFAULT_CUSTOMER_SYSTEM_CODE_START_NUMBER = 100;
const MAX_SYSTEM_CODE_SEQUENCE_NUMBER = 2147483647;
const MAX_SYSTEM_CODE_NUMBER_WIDTH = 20;
const SYSTEM_CODE_SCAN_BATCH_SIZE = 1000;

type ResolvedSystemCodeConfig = {
  prefix: string;
  startNumber: number;
  numberWidth: number | null;
};

let moduleSettingsCache: Record<string, any> | null = null;
let moduleSettingsPromise: Promise<Record<string, any> | null> | null = null;
const generatedSystemCodeLastNumbers = new Map<string, number>();

const getDefaultSystemCodePrefix = (moduleName?: string | null) => {
  const normalized = String(moduleName || '').trim();
  return (normalized ? normalized[0] : 'M').toUpperCase();
};

const getDefaultSystemCodeStartNumber = (moduleName?: string | null) => {
  const normalized = String(moduleName || '').trim();
  return normalized === 'customers' ? DEFAULT_CUSTOMER_SYSTEM_CODE_START_NUMBER : DEFAULT_SYSTEM_CODE_START_NUMBER;
};

const getDefaultSystemCodeNumberWidth = (moduleName?: string | null) => {
  const normalized = String(moduleName || '').trim();
  return normalized === 'customers' ? 3 : null;
};

const normalizeSystemCodeStartNumber = (value: unknown) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return DEFAULT_SYSTEM_CODE_START_NUMBER;
  if (numeric > MAX_SYSTEM_CODE_SEQUENCE_NUMBER) return DEFAULT_SYSTEM_CODE_START_NUMBER;
  return Math.max(Math.trunc(numeric), 0);
};

const normalizeSystemCodeNumberWidth = (value: unknown) => {
  if (value === null || value === undefined || value === '') return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  const normalized = Math.max(Math.trunc(numeric), 0);
  return normalized > 0 && normalized <= MAX_SYSTEM_CODE_NUMBER_WIDTH ? normalized : null;
};

const normalizeSystemCodePrefix = (value: unknown, fallback: string) => {
  const normalized = String(value || '').trim().toUpperCase().replace(/\s+/g, '');
  return normalized || fallback;
};

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const formatSystemCodeValue = (prefix: string, numericValue: number, numberWidth: number | null) => {
  const normalizedNumber = Math.max(0, Math.trunc(numericValue));
  const suffix = numberWidth ? String(normalizedNumber).padStart(numberWidth, '0') : String(normalizedNumber);
  return `${prefix}${suffix}`;
};

const parseSystemCodeNumber = (systemCode: unknown, prefix: string): number | null => {
  const code = String(systemCode || '').trim().toUpperCase();
  const suffixPattern = new RegExp(`^${escapeRegExp(prefix)}(\\d+)$`);
  const match = code.match(suffixPattern);
  if (!match) return null;
  const numeric = Number(match[1]);
  if (!Number.isFinite(numeric) || numeric > MAX_SYSTEM_CODE_SEQUENCE_NUMBER) return null;
  return Math.trunc(numeric);
};

const getCurrentOrgId = async (supabaseClient: any, explicitOrgId?: string | null) => {
  const normalizedExplicit = String(explicitOrgId || '').trim();
  if (normalizedExplicit) return normalizedExplicit;
  const session = await fetchSessionBootstrap(supabaseClient);
  return String(session?.orgId || '').trim() || null;
};

const getCounterLastNumber = async (
  supabaseClient: any,
  tableName: string,
  orgId: string | null,
  prefix: string
): Promise<number | null> => {
  try {
    const { data, error } = await supabaseClient
      .from('system_code_counters')
      .select('last_number')
      .eq('table_name', tableName)
      .eq('org_scope', orgId || '__global__')
      .eq('prefix', prefix)
      .maybeSingle();
    if (error || data?.last_number === undefined || data?.last_number === null) return null;
    const numeric = Number(data.last_number);
    return Number.isFinite(numeric) ? Math.trunc(numeric) : null;
  } catch {
    return null;
  }
};

const getRpcLastNumber = async (
  supabaseClient: any,
  tableName: string,
  orgId: string | null,
  prefix: string
): Promise<number | null> => {
  try {
    const { data, error } = await supabaseClient.rpc('find_system_code_last_number', {
      p_table_name: tableName,
      p_org_id: orgId,
      p_prefix: prefix,
      p_max_sequence: MAX_SYSTEM_CODE_SEQUENCE_NUMBER,
    });
    if (error) return null;
    const numeric = Number(data);
    return Number.isFinite(numeric) ? Math.trunc(numeric) : null;
  } catch {
    return null;
  }
};

const scanLastSystemCodeNumber = async (
  supabaseClient: any,
  tableName: string,
  orgId: string | null,
  prefix: string
): Promise<number> => {
  let maxExistingNumber = 0;
  let from = 0;

  for (;;) {
    let query = supabaseClient
      .from(tableName)
      .select('system_code')
      .ilike('system_code', `${prefix}%`)
      .range(from, from + SYSTEM_CODE_SCAN_BATCH_SIZE - 1);

    if (orgId) query = query.eq('org_id', orgId);

    let { data, error } = await query;
    if (error && orgId) {
      ({ data, error } = await supabaseClient
        .from(tableName)
        .select('system_code')
        .ilike('system_code', `${prefix}%`)
        .range(from, from + SYSTEM_CODE_SCAN_BATCH_SIZE - 1));
    }
    if (error) break;

    const rows = (data || []) as Array<{ system_code?: string | null }>;
    rows.forEach((row) => {
      const numeric = parseSystemCodeNumber(row?.system_code, prefix);
      if (numeric !== null) maxExistingNumber = Math.max(maxExistingNumber, numeric);
    });

    if (rows.length < SYSTEM_CODE_SCAN_BATCH_SIZE) break;
    from += SYSTEM_CODE_SCAN_BATCH_SIZE;
  }

  return maxExistingNumber;
};

const normalizeLegacyCustomerDefaults = (config: ResolvedSystemCodeConfig, namingSettings: any, moduleName?: string | null) => {
  if (String(moduleName || '').trim() !== 'customers') return config;

  const hasExplicitWidth = namingSettings?.numberWidth !== undefined && namingSettings?.numberWidth !== null;
  const normalizedPrefix = String(config.prefix || '').trim().toUpperCase();
  const isCustomerDefaultPrefix = !normalizedPrefix || normalizedPrefix === 'C';

  if (!hasExplicitWidth && isCustomerDefaultPrefix && Number(config.startNumber) === DEFAULT_SYSTEM_CODE_START_NUMBER) {
    return {
      prefix: 'C',
      startNumber: DEFAULT_CUSTOMER_SYSTEM_CODE_START_NUMBER,
      numberWidth: 3,
    };
  }

  if (!hasExplicitWidth && isCustomerDefaultPrefix) {
    return {
      ...config,
      prefix: normalizedPrefix || 'C',
      numberWidth: 3,
    };
  }

  return config;
};

let moduleSettingsCacheOrgId: string | null = null;
let moduleSettingsPromiseOrgId: string | null = null;

const loadModuleSettings = async (supabaseClient: any) => {
  const orgId = await getCurrentOrgId(supabaseClient);
  if (moduleSettingsCache && moduleSettingsCacheOrgId === orgId) return moduleSettingsCache;
  if (moduleSettingsPromise && moduleSettingsPromiseOrgId === orgId) return moduleSettingsPromise;

  moduleSettingsPromise = (async () => {
    try {
      let query = supabaseClient
        .from('integration_settings')
        .select('settings')
        .eq('connection_type', SYSTEM_MODULE_SETTINGS_CONNECTION_TYPE)
        .order('created_at', { ascending: false })
        .limit(1);

      query = orgId
        ? query.eq('org_id', orgId)
        : query.is('org_id', null);

      const { data } = await query.maybeSingle();

      const modules = data?.settings?.modules;
      moduleSettingsCacheOrgId = orgId;
      moduleSettingsCache = modules && typeof modules === 'object' ? modules : {};
      return moduleSettingsCache;
    } catch {
      moduleSettingsCacheOrgId = orgId;
      moduleSettingsCache = {};
      return moduleSettingsCache;
    } finally {
      moduleSettingsPromise = null;
      moduleSettingsPromiseOrgId = null;
    }
  })();
  moduleSettingsPromiseOrgId = orgId;

  return moduleSettingsPromise;
};

export const clearSystemCodeSettingsCache = () => {
  moduleSettingsCache = null;
  moduleSettingsPromise = null;
  moduleSettingsCacheOrgId = null;
  moduleSettingsPromiseOrgId = null;
  generatedSystemCodeLastNumbers.clear();
};

export const resolveSystemCodeConfig = async (
  supabaseClient: any,
  moduleName?: string | null
) : Promise<ResolvedSystemCodeConfig> => {
  const normalizedModule = String(moduleName || '').trim();
  const fallbackPrefix = getDefaultSystemCodePrefix(normalizedModule);
  const fallbackStartNumber = getDefaultSystemCodeStartNumber(normalizedModule);
  const fallbackNumberWidth = getDefaultSystemCodeNumberWidth(normalizedModule);
  if (!normalizedModule) {
    return {
      prefix: 'M',
      startNumber: DEFAULT_SYSTEM_CODE_START_NUMBER,
      numberWidth: null,
    };
  }

  try {
    const modules = await loadModuleSettings(supabaseClient);
    const namingSettings = modules?.[normalizedModule]?.general?.systemCodeNaming || {};

    const configuredPrefix = normalizeSystemCodePrefix(
      namingSettings?.prefix ?? namingSettings?.prefixLetter,
      fallbackPrefix
    );
    const startNumber = normalizeSystemCodeStartNumber(
      namingSettings?.startNumber ?? fallbackStartNumber
    );
    const numberWidth = normalizeSystemCodeNumberWidth(
      namingSettings?.numberWidth ?? fallbackNumberWidth
    );

    const resolvedConfig = {
      prefix: configuredPrefix || fallbackPrefix,
      startNumber,
      numberWidth,
    };
    return normalizeLegacyCustomerDefaults(resolvedConfig, namingSettings, normalizedModule);
  } catch {
    return {
      prefix: fallbackPrefix,
      startNumber: fallbackStartNumber,
      numberWidth: fallbackNumberWidth,
    };
  }
};

export const resolveSystemCodePrefix = async (
  supabaseClient: any,
  moduleName?: string | null
) => {
  const config = await resolveSystemCodeConfig(supabaseClient, moduleName);
  return config.prefix;
};

export const buildClientFallbackSystemCode = async (
  supabaseClient: any,
  moduleName?: string | null,
  tableName?: string | null,
  options?: { orgId?: string | null }
) => {
  const { prefix, startNumber, numberWidth } = await resolveSystemCodeConfig(supabaseClient, moduleName);
  const sourceTable = String(tableName || moduleName || '').trim();
  if (!sourceTable) {
    return formatSystemCodeValue(prefix, startNumber, numberWidth);
  }

  try {
    const orgId = await getCurrentOrgId(supabaseClient, options?.orgId);
    const cacheKey = `${sourceTable}:${orgId || '__global__'}:${prefix}`;
    const cachedLastNumber = generatedSystemCodeLastNumbers.get(cacheKey);

    const counterLastNumber = await getCounterLastNumber(supabaseClient, sourceTable, orgId, prefix);
    const rpcLastNumber = await getRpcLastNumber(supabaseClient, sourceTable, orgId, prefix);
    const knownLastNumbers = [cachedLastNumber, counterLastNumber, rpcLastNumber]
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value));
    let maxExistingNumber = knownLastNumbers.length > 0
      ? Math.max(...knownLastNumbers)
      : await scanLastSystemCodeNumber(supabaseClient, sourceTable, orgId, prefix);

    maxExistingNumber = Math.max(Number(maxExistingNumber) || 0, startNumber - 1);
    const nextNumber = Math.min(maxExistingNumber + 1, MAX_SYSTEM_CODE_SEQUENCE_NUMBER);
    generatedSystemCodeLastNumbers.set(cacheKey, nextNumber);
    return formatSystemCodeValue(prefix, nextNumber, numberWidth);
  } catch {
    return formatSystemCodeValue(prefix, startNumber, numberWidth);
  }
};
