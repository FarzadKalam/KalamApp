import { MODULES } from '../moduleRegistry';
import { BlockDefinition, ModuleDefinition, ModuleField } from '../types';
import { SYSTEM_MODULE_SETTINGS_CONNECTION_TYPE, type ModuleSettingsConfig, type ModuleSettingsStore } from '../pages/Settings/moduleSettingsTypes';

export const MODULE_SETTINGS_APPLIED_EVENT = 'kalam:module-settings-applied';
export const MODULE_SETTINGS_UPDATED_EVENT = 'kalam:module-settings-updated';

const MODULE_SETTINGS_TTL_MS = 5 * 60_000;

const cloneDeep = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const isModuleSettingsUnavailableError = (error: any) =>
  Number(error?.status) === 404
  || String(error?.code || '').toUpperCase() === 'PGRST205';

const moduleSettingsCache: {
  data: ModuleSettingsStore | null;
  expiresAt: number;
  unavailable: boolean;
  promise: Promise<ModuleSettingsStore | null> | null;
} = {
  data: null,
  expiresAt: 0,
  unavailable: false,
  promise: null,
};

const baseModuleRegistrySnapshot: Record<string, Pick<ModuleDefinition, 'fields' | 'blocks'>> = Object.fromEntries(
  Object.entries(MODULES).map(([moduleId, moduleDef]) => [
    moduleId,
    {
      fields: cloneDeep(moduleDef.fields || []),
      blocks: cloneDeep(moduleDef.blocks || []),
    },
  ])
);

const normalizeFields = (fields: ModuleField[]) =>
  [...(fields || [])]
    .sort((a, b) => (a.order || 0) - (b.order || 0))
    .map((field, index) => ({ ...field, order: index + 1 }));

const normalizeBlocks = (blocks: BlockDefinition[]) =>
  [...(blocks || [])]
    .sort((a, b) => (a.order || 0) - (b.order || 0))
    .map((block, index) => ({ ...block, order: index + 1 }));

const getIncomingModuleSettings = (
  store: ModuleSettingsStore | null | undefined,
  moduleId: string
): ModuleSettingsConfig | null => {
  const modules = store?.modules;
  if (!modules || typeof modules !== 'object') return null;
  return (modules[moduleId] || null) as ModuleSettingsConfig | null;
};

export const applyModuleSettingsStoreToRegistry = (
  store: ModuleSettingsStore | null | undefined
) => {
  Object.entries(MODULES).forEach(([moduleId, moduleDef]) => {
    const base = baseModuleRegistrySnapshot[moduleId];
    const incoming = getIncomingModuleSettings(store, moduleId);
    const incomingSchema = incoming?.schema;

    moduleDef.fields = normalizeFields(
      cloneDeep((incomingSchema?.fields || base?.fields || []) as ModuleField[])
    );
    moduleDef.blocks = normalizeBlocks(
      cloneDeep((incomingSchema?.blocks || base?.blocks || []) as BlockDefinition[])
    );
  });

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(MODULE_SETTINGS_APPLIED_EVENT));
  }
};

export const loadModuleSettingsStore = async (supabaseClient: any): Promise<ModuleSettingsStore | null> => {
  const now = Date.now();
  if (moduleSettingsCache.expiresAt > now) {
    if (moduleSettingsCache.unavailable) return null;
    if (moduleSettingsCache.data) return moduleSettingsCache.data;
  }

  if (moduleSettingsCache.promise) {
    return moduleSettingsCache.promise;
  }

  moduleSettingsCache.promise = (async () => {
    const { data, error } = await supabaseClient
      .from('integration_settings')
      .select('settings')
      .eq('connection_type', SYSTEM_MODULE_SETTINGS_CONNECTION_TYPE)
      .eq('is_active', true)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      if (isModuleSettingsUnavailableError(error)) {
        moduleSettingsCache.data = null;
        moduleSettingsCache.unavailable = true;
        moduleSettingsCache.expiresAt = Date.now() + MODULE_SETTINGS_TTL_MS;
        return null;
      }
      throw error;
    }

    const settings = data?.settings;
    if (!settings || typeof settings !== 'object') {
      moduleSettingsCache.data = null;
      moduleSettingsCache.unavailable = false;
      moduleSettingsCache.expiresAt = Date.now() + MODULE_SETTINGS_TTL_MS;
      return null;
    }
    const modules = (settings as any)?.modules;
    if (!modules || typeof modules !== 'object') {
      moduleSettingsCache.data = null;
      moduleSettingsCache.unavailable = false;
      moduleSettingsCache.expiresAt = Date.now() + MODULE_SETTINGS_TTL_MS;
      return null;
    }

    const store = { modules: modules as Record<string, ModuleSettingsConfig> };
    moduleSettingsCache.data = store;
    moduleSettingsCache.unavailable = false;
    moduleSettingsCache.expiresAt = Date.now() + MODULE_SETTINGS_TTL_MS;
    return store;
  })();

  try {
    return await moduleSettingsCache.promise;
  } finally {
    moduleSettingsCache.promise = null;
  }
};

export const loadAndApplyModuleSettings = async (supabaseClient: any) => {
  const store = await loadModuleSettingsStore(supabaseClient);
  applyModuleSettingsStoreToRegistry(store);
  return store;
};
