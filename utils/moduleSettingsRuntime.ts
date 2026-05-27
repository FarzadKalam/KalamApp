import { MODULES } from '../moduleRegistry';
import { BlockDefinition, BlockType, FieldLocation, ModuleDefinition, ModuleField } from '../types';
import { SYSTEM_MODULE_SETTINGS_CONNECTION_TYPE, type ModuleSettingsConfig, type ModuleSettingsStore } from '../pages/Settings/moduleSettingsTypes';
import { fetchSessionBootstrap } from './sessionCache';
import { buildResolvedConditionalFieldSettings } from './conditionalFieldDefaults';
import { type ConditionalFieldSettings, normalizeConditionalFieldSettings } from './conditionalFieldRules';

export const MODULE_SETTINGS_APPLIED_EVENT = 'kalam:module-settings-applied';
export const MODULE_SETTINGS_UPDATED_EVENT = 'kalam:module-settings-updated';

const MODULE_SETTINGS_TTL_MS = 5 * 60_000;

const cloneDeep = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const isModuleSettingsUnavailableError = (error: any) =>
  Number(error?.status) === 404
  || String(error?.code || '').toUpperCase() === 'PGRST205';

const moduleSettingsCache: {
  orgId: string | null;
  data: ModuleSettingsStore | null;
  expiresAt: number;
  unavailable: boolean;
  promise: Promise<ModuleSettingsStore | null> | null;
} = {
  orgId: null,
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

const moduleConditionalDisplaySnapshot: Record<string, ConditionalFieldSettings> = {};

const ATTENDANCE_LOG_DETAIL_FIELD_ORDER: Record<string, number> = {
  presence_minutes: 1,
  presence_hours: 2,
  actual_check_in_time: 3,
  actual_check_out_time: 4,
  manual_check_in_time: 5,
  manual_check_out_time: 6,
  location_text: 7,
  notes: 8,
};

const normalizeAttendanceLogsDetailSchema = (fields: ModuleField[]) => {
  const allowedDetailFieldKeys = new Set(Object.keys(ATTENDANCE_LOG_DETAIL_FIELD_ORDER));
  const normalizedFields = (fields || []).map((field) => {
    const fieldKey = String(field?.key || '').trim();
    if (allowedDetailFieldKeys.has(fieldKey)) {
      return {
        ...field,
        location: FieldLocation.BLOCK,
        blockId: 'attendance_info',
        order: ATTENDANCE_LOG_DETAIL_FIELD_ORDER[fieldKey],
      };
    }

    if (
      String(field?.location || '') === FieldLocation.BLOCK
      || ['base', 'legacy_import', 'runtime', 'attendance_info'].includes(String(field?.blockId || ''))
    ) {
      return {
        ...field,
        location: FieldLocation.BLOCK,
        blockId: 'attendance_hidden',
        isTableColumn: fieldKey === 'closure_status' ? false : field.isTableColumn,
      };
    }

    return field;
  });

  const normalizedBlocks = [{
    id: 'attendance_info',
    titles: { fa: 'اطلاعات تردد', en: 'Attendance Info' },
    type: BlockType.FIELD_GROUP,
    order: 1,
  }];

  return {
    fields: normalizedFields,
    blocks: normalizedBlocks,
  };
};

const normalizeFields = (fields: ModuleField[]) =>
  [...(fields || [])]
    .sort((a, b) => (a.order || 0) - (b.order || 0))
    .map((field, index) => ({ ...field, order: index + 1 }));

const normalizeBlocks = (blocks: BlockDefinition[]) =>
  [...(blocks || [])]
    .sort((a, b) => (a.order || 0) - (b.order || 0))
    .map((block, index) => ({ ...block, order: index + 1 }));

const isSchemaItemActive = (item: any) => item?.isActive !== false && item?.disabled !== true;

const filterActiveSchema = (
  schema: { fields?: ModuleField[]; blocks?: BlockDefinition[] }
) => {
  const activeBlocks = (schema.blocks || []).filter(isSchemaItemActive);
  const activeBlockIds = new Set(
    activeBlocks.map((block) => String(block?.id || '').trim()).filter(Boolean)
  );
  const activeFields = (schema.fields || []).filter((field) => {
    if (!isSchemaItemActive(field)) return false;
    const blockId = String((field as any)?.blockId || '').trim();
    if (!blockId) return true;
    return activeBlockIds.has(blockId);
  });
  return {
    fields: activeFields,
    blocks: activeBlocks,
  };
};

const mergeRequiredTagsField = (
  baseFields: ModuleField[],
  incomingFields: ModuleField[]
): ModuleField[] => {
  const baseTagsField = (baseFields || []).find((field) => String(field?.key || '').trim() === 'tags');
  if (!baseTagsField) return incomingFields;
  const hasIncomingTags = (incomingFields || []).some((field) => String(field?.key || '').trim() === 'tags');
  if (hasIncomingTags) return incomingFields;
  return [...incomingFields, cloneDeep(baseTagsField)];
};

const mergeSchemaFieldsWithBase = (
  baseFields: ModuleField[],
  incomingFields: ModuleField[]
): ModuleField[] => {
  const baseFieldMap = new Map(
    (baseFields || [])
      .map((field) => [String(field?.key || '').trim(), field] as const)
      .filter(([key]) => Boolean(key))
  );
  const mergedIncomingFields = (incomingFields || []).map((field) => {
    const fieldKey = String(field?.key || '').trim();
    const baseField = fieldKey ? baseFieldMap.get(fieldKey) : null;
    return baseField
      ? { ...cloneDeep(baseField), ...field }
      : field;
  });

  const incomingKeys = new Set(
    mergedIncomingFields.map((f) => String(f?.key || '').trim()).filter(Boolean)
  );
  const missingBaseFields = (baseFields || []).filter(
    (f) => f?.key && !incomingKeys.has(String(f.key).trim())
  );
  if (missingBaseFields.length === 0) return mergedIncomingFields;
  return [...mergedIncomingFields, ...cloneDeep(missingBaseFields)];
};

const mergeSchemaBlocksWithBase = (
  baseBlocks: BlockDefinition[],
  incomingBlocks: BlockDefinition[]
): BlockDefinition[] => {
  const baseBlockMap = new Map(
    (baseBlocks || [])
      .map((block) => [String(block?.id || '').trim(), block] as const)
      .filter(([id]) => Boolean(id))
  );
  const mergedIncomingBlocks = (incomingBlocks || []).map((block) => {
    const blockId = String(block?.id || '').trim();
    const baseBlock = blockId ? baseBlockMap.get(blockId) : null;
    return baseBlock
      ? { ...cloneDeep(baseBlock), ...block }
      : block;
  });

  const incomingIds = new Set(
    mergedIncomingBlocks.map((block) => String(block?.id || '').trim()).filter(Boolean)
  );
  const missingBaseBlocks = (baseBlocks || []).filter(
    (block) => block?.id && !incomingIds.has(String(block.id).trim())
  );
  if (missingBaseBlocks.length === 0) return mergedIncomingBlocks;
  return [...mergedIncomingBlocks, ...cloneDeep(missingBaseBlocks)];
};

export const mergeModuleSchemaWithBase = (
  baseSchema: { fields?: ModuleField[]; blocks?: BlockDefinition[] } | null | undefined,
  incomingSchema: { fields?: ModuleField[]; blocks?: BlockDefinition[] } | null | undefined
) => {
  const baseFields = cloneDeep((baseSchema?.fields || []) as ModuleField[]);
  const incomingFields = cloneDeep((incomingSchema?.fields || baseFields) as ModuleField[]);
  const mergedFields = mergeRequiredTagsField(
    baseFields,
    mergeSchemaFieldsWithBase(baseFields, incomingFields)
  );
  const mergedBlocks = mergeSchemaBlocksWithBase(
    cloneDeep((baseSchema?.blocks || []) as BlockDefinition[]),
    cloneDeep((incomingSchema?.blocks || baseSchema?.blocks || []) as BlockDefinition[])
  );
  return {
    fields: mergedFields,
    blocks: mergedBlocks,
  };
};

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
    const mergedSchema = mergeModuleSchemaWithBase(base, incomingSchema);
    const activeSchema = filterActiveSchema(mergedSchema);
    const normalizedSchema = moduleId === 'attendance_logs'
      ? normalizeAttendanceLogsDetailSchema(activeSchema.fields)
      : activeSchema;

    moduleDef.fields = normalizeFields(normalizedSchema.fields);
    moduleDef.blocks = normalizeBlocks(normalizedSchema.blocks);
    moduleConditionalDisplaySnapshot[moduleId] = buildResolvedConditionalFieldSettings(
      { id: moduleId, fields: moduleDef.fields } as Pick<ModuleDefinition, 'id' | 'fields'>,
      incoming?.conditionalDisplay
    );
  });

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(MODULE_SETTINGS_APPLIED_EVENT));
  }
};

export const getResolvedModuleConditionalDisplay = (moduleId?: string | null) => {
  const normalizedModuleId = String(moduleId || '').trim();
  if (!normalizedModuleId) return normalizeConditionalFieldSettings();
  return moduleConditionalDisplaySnapshot[normalizedModuleId] || normalizeConditionalFieldSettings();
};

export const getBaseModuleSchemaSnapshot = (moduleId?: string | null) => {
  const normalizedModuleId = String(moduleId || '').trim();
  if (!normalizedModuleId) return null;
  const base = baseModuleRegistrySnapshot[normalizedModuleId];
  if (!base) return null;
  return {
    fields: cloneDeep((base.fields || []) as ModuleField[]),
    blocks: cloneDeep((base.blocks || []) as BlockDefinition[]),
  };
};

export const getBaseModuleFieldDefinition = (moduleId?: string | null, fieldKey?: string | null) => {
  const baseSchema = getBaseModuleSchemaSnapshot(moduleId);
  const normalizedFieldKey = String(fieldKey || '').trim();
  if (!baseSchema || !normalizedFieldKey) return null;
  return baseSchema.fields.find((field) => String(field?.key || '').trim() === normalizedFieldKey) || null;
};

export const loadModuleSettingsStore = async (supabaseClient: any): Promise<ModuleSettingsStore | null> => {
  const session = await fetchSessionBootstrap(supabaseClient);
  const orgId = String(session?.orgId || '').trim() || null;
  const now = Date.now();
  if (moduleSettingsCache.orgId === orgId && moduleSettingsCache.expiresAt > now) {
    if (moduleSettingsCache.unavailable) return null;
    if (moduleSettingsCache.data) return moduleSettingsCache.data;
  }

  if (moduleSettingsCache.orgId === orgId && moduleSettingsCache.promise) {
    return moduleSettingsCache.promise;
  }

  moduleSettingsCache.promise = (async () => {
    let query = supabaseClient
      .from('integration_settings')
      .select('settings')
      .eq('connection_type', SYSTEM_MODULE_SETTINGS_CONNECTION_TYPE)
      .eq('is_active', true)
      .order('updated_at', { ascending: false })
      .limit(1);

    query = orgId
      ? query.eq('org_id', orgId)
      : query.is('org_id', null);

    const { data, error } = await query.maybeSingle();

    if (error) {
      if (isModuleSettingsUnavailableError(error)) {
        moduleSettingsCache.orgId = orgId;
        moduleSettingsCache.data = null;
        moduleSettingsCache.unavailable = true;
        moduleSettingsCache.expiresAt = Date.now() + MODULE_SETTINGS_TTL_MS;
        return null;
      }
      throw error;
    }

    const settings = data?.settings;
    if (!settings || typeof settings !== 'object') {
      moduleSettingsCache.orgId = orgId;
      moduleSettingsCache.data = null;
      moduleSettingsCache.unavailable = false;
      moduleSettingsCache.expiresAt = Date.now() + MODULE_SETTINGS_TTL_MS;
      return null;
    }
    const modules = (settings as any)?.modules;
    if (!modules || typeof modules !== 'object') {
      moduleSettingsCache.orgId = orgId;
      moduleSettingsCache.data = null;
      moduleSettingsCache.unavailable = false;
      moduleSettingsCache.expiresAt = Date.now() + MODULE_SETTINGS_TTL_MS;
      return null;
    }

    const store = { modules: modules as Record<string, ModuleSettingsConfig> };
    moduleSettingsCache.orgId = orgId;
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
