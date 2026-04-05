import { MODULES } from '../moduleRegistry';
import { BlockDefinition, ModuleDefinition, ModuleField } from '../types';
import { SYSTEM_MODULE_SETTINGS_CONNECTION_TYPE, type ModuleSettingsConfig, type ModuleSettingsStore } from '../pages/Settings/moduleSettingsTypes';

export const MODULE_SETTINGS_APPLIED_EVENT = 'kalam:module-settings-applied';
export const MODULE_SETTINGS_UPDATED_EVENT = 'kalam:module-settings-updated';

const cloneDeep = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const isModuleSettingsUnavailableError = (error: any) =>
  Number(error?.status) === 404
  || String(error?.code || '').toUpperCase() === 'PGRST205';

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
  const { data, error } = await supabaseClient
    .from('system_settings')
    .select('settings')
    .eq('connection_type', SYSTEM_MODULE_SETTINGS_CONNECTION_TYPE)
    .eq('is_active', true)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    if (isModuleSettingsUnavailableError(error)) {
      return null;
    }
    throw error;
  }

  const settings = data?.settings;
  if (!settings || typeof settings !== 'object') return null;
  const modules = (settings as any)?.modules;
  if (!modules || typeof modules !== 'object') return null;
  return { modules: modules as Record<string, ModuleSettingsConfig> };
};

export const loadAndApplyModuleSettings = async (supabaseClient: any) => {
  const store = await loadModuleSettingsStore(supabaseClient);
  applyModuleSettingsStoreToRegistry(store);
  return store;
};
