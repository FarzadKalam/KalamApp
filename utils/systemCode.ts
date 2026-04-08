const MODULES_WITH_SYSTEM_CODE = new Set([
  'barters',
  'billboards',
  'customers',
  'employees',
  'invoices',
  'products',
  'production_boms',
  'production_group_orders',
  'production_orders',
  'projects',
  'purchase_invoices',
  'shelves',
  'suppliers',
  'tasks',
  'warehouses',
]);

export const supportsSystemCode = (moduleName?: string | null) => {
  const normalized = String(moduleName || '').trim();
  if (!normalized) return false;
  return MODULES_WITH_SYSTEM_CODE.has(normalized);
};

const SYSTEM_MODULE_SETTINGS_CONNECTION_TYPE = 'module_settings';

const DEFAULT_SYSTEM_CODE_START_NUMBER = 100;
const DEFAULT_CUSTOMER_SYSTEM_CODE_START_NUMBER = 234;
const MAX_SYSTEM_CODE_SEQUENCE_NUMBER = 2147483647;
const MAX_SYSTEM_CODE_NUMBER_WIDTH = 20;

type ResolvedSystemCodeConfig = {
  prefix: string;
  startNumber: number;
  numberWidth: number | null;
};

let moduleSettingsCache: Record<string, any> | null = null;
let moduleSettingsPromise: Promise<Record<string, any> | null> | null = null;

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

const loadModuleSettings = async (supabaseClient: any) => {
  if (moduleSettingsCache) return moduleSettingsCache;
  if (moduleSettingsPromise) return moduleSettingsPromise;

  moduleSettingsPromise = (async () => {
    try {
      const { data } = await supabaseClient
        .from('integration_settings')
        .select('settings')
        .eq('connection_type', SYSTEM_MODULE_SETTINGS_CONNECTION_TYPE)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      const modules = data?.settings?.modules;
      moduleSettingsCache = modules && typeof modules === 'object' ? modules : {};
      return moduleSettingsCache;
    } catch {
      moduleSettingsCache = {};
      return moduleSettingsCache;
    } finally {
      moduleSettingsPromise = null;
    }
  })();

  return moduleSettingsPromise;
};

export const clearSystemCodeSettingsCache = () => {
  moduleSettingsCache = null;
  moduleSettingsPromise = null;
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
  tableName?: string | null
) => {
  const { prefix, startNumber, numberWidth } = await resolveSystemCodeConfig(supabaseClient, moduleName);
  const sourceTable = String(tableName || moduleName || '').trim();
  if (!sourceTable) {
    return formatSystemCodeValue(prefix, startNumber, numberWidth);
  }

  try {
    const { data } = await supabaseClient
      .from(sourceTable)
      .select('system_code')
      .ilike('system_code', `${prefix}%`)
      .limit(5000);

    const suffixPattern = new RegExp(`^${escapeRegExp(prefix)}(\\d+)$`);
    const rows = ((data || []) as Array<{ system_code?: string | null }>);
    const matchingNumbers = rows.reduce<number[]>((acc, row) => {
      const code = String(row?.system_code || '').trim().toUpperCase();
      const match = code.match(suffixPattern);
      if (!match) return acc;
      const numeric = Number(match[1]);
      if (!Number.isFinite(numeric) || numeric > MAX_SYSTEM_CODE_SEQUENCE_NUMBER) return acc;
      acc.push(numeric);
      return acc;
    }, []);

    const maxExistingNumber = matchingNumbers.reduce((maxValue: number, currentValue: number) => (
      Math.max(maxValue, currentValue)
    ), startNumber - 1);

    return formatSystemCodeValue(prefix, Math.max(startNumber, maxExistingNumber + 1), numberWidth);
  } catch {
    return formatSystemCodeValue(prefix, startNumber, numberWidth);
  }
};
