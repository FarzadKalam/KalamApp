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

type ResolvedSystemCodeConfig = {
  prefixLetter: string;
  startNumber: number;
};

let moduleSettingsCache: Record<string, any> | null = null;
let moduleSettingsPromise: Promise<Record<string, any> | null> | null = null;

const getDefaultSystemCodePrefix = (moduleName?: string | null) => {
  const normalized = String(moduleName || '').trim();
  return (normalized ? normalized[0] : 'M').toUpperCase();
};

const normalizeSystemCodeStartNumber = (value: unknown) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return DEFAULT_SYSTEM_CODE_START_NUMBER;
  return Math.max(Math.trunc(numeric), 0);
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
  if (!normalizedModule) {
    return {
      prefixLetter: 'M',
      startNumber: DEFAULT_SYSTEM_CODE_START_NUMBER,
    };
  }

  try {
    const modules = await loadModuleSettings(supabaseClient);
    const namingSettings = modules?.[normalizedModule]?.general?.systemCodeNaming || {};

    const configuredPrefix = String(namingSettings?.prefixLetter || '')
      .trim()
      .slice(0, 1)
      .toUpperCase();
    const startNumber = normalizeSystemCodeStartNumber(namingSettings?.startNumber);

    return {
      prefixLetter: configuredPrefix || fallbackPrefix,
      startNumber,
    };
  } catch {
    return {
      prefixLetter: fallbackPrefix,
      startNumber: DEFAULT_SYSTEM_CODE_START_NUMBER,
    };
  }
};

export const resolveSystemCodePrefix = async (
  supabaseClient: any,
  moduleName?: string | null
) => {
  const config = await resolveSystemCodeConfig(supabaseClient, moduleName);
  return config.prefixLetter;
};

export const buildClientFallbackSystemCode = async (
  supabaseClient: any,
  moduleName?: string | null,
  tableName?: string | null
) => {
  const { prefixLetter, startNumber } = await resolveSystemCodeConfig(supabaseClient, moduleName);
  const sourceTable = String(tableName || moduleName || '').trim();
  if (!sourceTable) {
    return `${prefixLetter}${startNumber}`;
  }

  try {
    const { data } = await supabaseClient
      .from(sourceTable)
      .select('system_code')
      .ilike('system_code', `${prefixLetter}%`)
      .limit(5000);

    const maxExistingNumber = (data || []).reduce((maxValue: number, row: any) => {
      const code = String(row?.system_code || '').trim().toUpperCase();
      const match = code.match(new RegExp(`^${prefixLetter}(\\d+)$`));
      if (!match) return maxValue;
      const numeric = Number(match[1]);
      if (!Number.isFinite(numeric)) return maxValue;
      return Math.max(maxValue, numeric);
    }, startNumber - 1);

    return `${prefixLetter}${Math.max(startNumber, maxExistingNumber + 1)}`;
  } catch {
    return `${prefixLetter}${startNumber}`;
  }
};
