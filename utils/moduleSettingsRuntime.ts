import { useSyncExternalStore } from 'react';
import { MODULES } from '../moduleRegistry';
import { BlockDefinition, BlockType, FieldLocation, ModuleDefinition, ModuleField } from '../types';
import { SYSTEM_MODULE_SETTINGS_CONNECTION_TYPE, type ModuleSettingsConfig, type ModuleSettingsStore } from '../pages/Settings/moduleSettingsTypes';
import { fetchSessionBootstrap } from './sessionCache';
import { clearAppRuntimeCache, getAppRuntimeCached } from './appRuntimeCache';
import { getSelectedOrganizationId } from './organizationContext';
import { buildResolvedConditionalFieldSettings } from './conditionalFieldDefaults';
import { type ConditionalFieldSettings, normalizeConditionalFieldSettings } from './conditionalFieldRules';

export const MODULE_SETTINGS_APPLIED_EVENT = 'kalam:module-settings-applied';
export const MODULE_SETTINGS_UPDATED_EVENT = 'kalam:module-settings-updated';

const MODULE_SETTINGS_TTL_MS = 5 * 60_000;
const MODULE_SETTINGS_CACHE_PREFIX = 'module-settings:';

const cloneDeep = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const isModuleSettingsUnavailableError = (error: any) =>
  Number(error?.status) === 404
  || String(error?.code || '').toUpperCase() === 'PGRST205';

let moduleSettingsGeneration = 0;
let moduleSettingsVersion = 0;
const moduleSettingsListeners = new Set<() => void>();
let primedModuleSettingsEntry: { orgId: string; store: ModuleSettingsStore | null; expiresAt: number } | null = null;

export const getModuleSettingsVersion = () => moduleSettingsVersion;

export const subscribeModuleSettings = (listener: () => void) => {
  moduleSettingsListeners.add(listener);
  return () => {
    moduleSettingsListeners.delete(listener);
  };
};

export const useModuleSettingsVersion = () =>
  useSyncExternalStore(subscribeModuleSettings, getModuleSettingsVersion, getModuleSettingsVersion);

const notifyModuleSettingsListeners = () => {
  moduleSettingsVersion += 1;
  moduleSettingsListeners.forEach((listener) => {
    try {
      listener();
    } catch {
      // ignore listener errors
    }
  });
};

export const clearModuleSettingsCache = () => {
  moduleSettingsGeneration += 1;
  primedModuleSettingsEntry = null;
  clearAppRuntimeCache(MODULE_SETTINGS_CACHE_PREFIX);
};

export const primeModuleSettingsCache = (
  store: ModuleSettingsStore | null,
  orgId?: string | null
) => {
  clearAppRuntimeCache(MODULE_SETTINGS_CACHE_PREFIX);
  const normalizedOrgId = String(orgId || getSelectedOrganizationId() || '').trim();
  if (!normalizedOrgId) {
    primedModuleSettingsEntry = null;
    return;
  }
  primedModuleSettingsEntry = {
    orgId: normalizedOrgId,
    store: store ? cloneDeep(store) : null,
    expiresAt: Date.now() + MODULE_SETTINGS_TTL_MS,
  };
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

const applyClearedKeys = <T extends Record<string, any>>(item: T): T => {
  const clearedKeys = Array.isArray((item as any)?._clearedKeys) ? (item as any)._clearedKeys : [];
  if (clearedKeys.length === 0) return item;
  const next = { ...item };
  clearedKeys.forEach((rawKey: string) => {
    const key = String(rawKey || '').trim();
    if (!key) return;
    delete (next as any)[key];
  });
  return next;
};

const filterActiveSchema = (
  schema: { fields?: ModuleField[]; blocks?: BlockDefinition[] }
) => {
  const activeBlocks = (schema.blocks || [])
    .filter(isSchemaItemActive)
    .map((block) =>
      Array.isArray(block?.tableColumns)
        ? {
            ...block,
            tableColumns: block.tableColumns.filter(isSchemaItemActive),
          }
        : block
    );
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

const mergeStaticFieldOptions = (
  baseField: { options?: any[]; type?: any },
  incomingField: ModuleField | NonNullable<BlockDefinition['tableColumns']>[number]
): any => {
  if ((incomingField as any)?._optionsCustomized === true) return incomingField;
  if (incomingField?.type && baseField?.type && incomingField.type !== baseField.type) return incomingField;
  if (!Array.isArray(baseField.options) || baseField.options.length === 0) return incomingField;
  if (!Array.isArray(incomingField.options)) return incomingField;

  const configuredOptionsByValue = new Map(
    incomingField.options
      .map((option) => [String(option?.value ?? '').trim(), option] as const)
      .filter(([value]) => Boolean(value))
  );
  const baseOptionValues = new Set(
    baseField.options
      .map((option) => String(option?.value ?? '').trim())
      .filter(Boolean)
  );
  const orderedOptions = [
    ...baseField.options.map((option) => {
      const configuredOption = configuredOptionsByValue.get(String(option?.value ?? '').trim());
      return configuredOption ? { ...option, ...configuredOption } : cloneDeep(option);
    }),
    ...incomingField.options.filter(
      (option) => !baseOptionValues.has(String(option?.value ?? '').trim())
    ),
  ];

  if (JSON.stringify(orderedOptions) === JSON.stringify(incomingField.options)) return incomingField;
  return {
    ...incomingField,
    options: orderedOptions,
  };
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
    if (!baseField) return applyClearedKeys(field);
    const clonedBase = cloneDeep(baseField);
    const typeChanged = Boolean(field?.type && baseField?.type && field.type !== baseField.type);
    if (typeChanged) {
      delete clonedBase.options;
      delete clonedBase.dynamicOptionsCategory;
      delete clonedBase.relationConfig;
      delete clonedBase.defaultValue;
    }
    let merged = applyClearedKeys({ ...clonedBase, ...field });
    if (String(field?.location || '').trim().toLowerCase() === 'header' && !String(field?.blockId || '').trim()) {
      delete merged.blockId;
    }
    if (field?.defaultValue === null) {
      delete merged.defaultValue;
    }
    merged = mergeStaticFieldOptions(baseField, merged);
    return merged;
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

const mergeTableColumnsWithBase = (
  baseColumns: BlockDefinition['tableColumns'],
  incomingColumns: BlockDefinition['tableColumns'],
  customized?: boolean
): BlockDefinition['tableColumns'] => {
  const baseCols = Array.isArray(baseColumns) ? baseColumns : [];
  if (!Array.isArray(incomingColumns)) {
    return baseColumns ? cloneDeep(baseColumns) : undefined;
  }
  const baseColMap = new Map(
    baseCols
      .map((col) => [String(col?.key || '').trim(), col] as const)
      .filter(([key]) => Boolean(key))
  );
  const mergedIncoming = incomingColumns.map((col) => {
    const colKey = String(col?.key || '').trim();
    const baseCol = colKey ? baseColMap.get(colKey) : null;
    if (!baseCol) return applyClearedKeys(col);
    const clonedBase = cloneDeep(baseCol);
    const typeChanged = Boolean(col?.type && baseCol?.type && col.type !== baseCol.type);
    if (typeChanged) {
      delete clonedBase.options;
      delete clonedBase.dynamicOptionsCategory;
      delete clonedBase.relationConfig;
      delete clonedBase.defaultValue;
    }
    let merged = applyClearedKeys({ ...clonedBase, ...col });
    if (col?.defaultValue === null) {
      delete merged.defaultValue;
    }
    merged = mergeStaticFieldOptions(baseCol, merged);
    return merged;
  });

  if (customized) {
    return mergedIncoming;
  }

  const incomingKeys = new Set(
    mergedIncoming.map((col) => String(col?.key || '').trim()).filter(Boolean)
  );
  const missingBase = baseCols.filter((col) => col?.key && !incomingKeys.has(String(col.key).trim()));
  return missingBase.length > 0 ? [...mergedIncoming, ...cloneDeep(missingBase)] : mergedIncoming;
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
    if (!baseBlock) return applyClearedKeys(block);
    const merged = applyClearedKeys({ ...cloneDeep(baseBlock), ...block });
    const mergedTableColumns = mergeTableColumnsWithBase(
      baseBlock.tableColumns,
      block.tableColumns,
      Boolean((block as any)?._tableColumnsCustomized)
    );
    if (mergedTableColumns) {
      merged.tableColumns = mergedTableColumns;
    }
    return merged;
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

const ORIGINAL_INVOICE_MODULE_IDS = new Set(['invoices', 'purchase_invoices']);
const RETURN_INVOICE_LABEL_PATTERN = /برگشت|استرداد|بازپرداخت/;

const restoreBaseInvoiceLabels = (
  moduleId: string,
  baseFields: ModuleField[],
  mergedFields: ModuleField[],
  baseBlocks: BlockDefinition[],
  mergedBlocks: BlockDefinition[]
) => {
  if (!ORIGINAL_INVOICE_MODULE_IDS.has(moduleId)) {
    return { fields: mergedFields, blocks: mergedBlocks };
  }

  const baseFieldByKey = new Map(
    (baseFields || [])
      .map((field) => [String(field?.key || '').trim(), field] as const)
      .filter(([key]) => Boolean(key))
  );
  const baseBlockById = new Map(
    (baseBlocks || [])
      .map((block) => [String(block?.id || '').trim(), block] as const)
      .filter(([id]) => Boolean(id))
  );

  const fields = (mergedFields || []).map((field) => {
    const fieldKey = String(field?.key || '').trim();
    const baseField = fieldKey ? baseFieldByKey.get(fieldKey) : null;
    const nextFa = String(field?.labels?.fa || '').trim();
    const baseFa = String(baseField?.labels?.fa || '').trim();
    if (!baseField || !nextFa || !baseFa) return field;
    if (!RETURN_INVOICE_LABEL_PATTERN.test(nextFa) || RETURN_INVOICE_LABEL_PATTERN.test(baseFa)) return field;
    return {
      ...field,
      labels: {
        ...(field.labels || {}),
        fa: baseFa,
      },
    };
  });

  const blocks = (mergedBlocks || []).map((block) => {
    const blockId = String(block?.id || '').trim();
    const baseBlock = blockId ? baseBlockById.get(blockId) : null;
    const nextFa = String(block?.titles?.fa || '').trim();
    const baseFa = String(baseBlock?.titles?.fa || '').trim();
    if (!baseBlock || !nextFa || !baseFa) return block;
    if (!RETURN_INVOICE_LABEL_PATTERN.test(nextFa) || RETURN_INVOICE_LABEL_PATTERN.test(baseFa)) return block;
    return {
      ...block,
      titles: {
        ...(block.titles || {}),
        fa: baseFa,
      },
    };
  });

  return { fields, blocks };
};

export const mergeModuleSchemaWithBase = (
  baseSchema: { fields?: ModuleField[]; blocks?: BlockDefinition[] } | null | undefined,
  incomingSchema: { fields?: ModuleField[]; blocks?: BlockDefinition[] } | null | undefined,
  moduleId?: string | null
) => {
  const baseFields = cloneDeep((baseSchema?.fields || []) as ModuleField[]);
  const baseBlocks = cloneDeep((baseSchema?.blocks || []) as BlockDefinition[]);
  const incomingFields = cloneDeep((incomingSchema?.fields || baseFields) as ModuleField[]);
  const mergedFields = mergeRequiredTagsField(
    baseFields,
    mergeSchemaFieldsWithBase(baseFields, incomingFields)
  );
  const mergedBlocks = mergeSchemaBlocksWithBase(
    baseBlocks,
    cloneDeep((incomingSchema?.blocks || baseSchema?.blocks || []) as BlockDefinition[])
  );
  return restoreBaseInvoiceLabels(String(moduleId || ''), baseFields, mergedFields, baseBlocks, mergedBlocks);
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
    const mergedSchema = mergeModuleSchemaWithBase(base, incomingSchema, moduleId);
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

  notifyModuleSettingsListeners();

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
  const generation = moduleSettingsGeneration;
  const selectedOrgId = getSelectedOrganizationId();
  const session = await fetchSessionBootstrap(supabaseClient);
  const orgId = String(session.orgId || '').trim();
  const userId = session.user?.id;
  const isCurrent = () => generation === moduleSettingsGeneration && getSelectedOrganizationId() === selectedOrgId;
  if (!userId || !orgId || session.bootstrapError || !isCurrent()) return null;

  if (
    primedModuleSettingsEntry
    && primedModuleSettingsEntry.orgId === orgId
    && primedModuleSettingsEntry.expiresAt > Date.now()
  ) {
    return primedModuleSettingsEntry.store ? cloneDeep(primedModuleSettingsEntry.store) : null;
  }

  const store = await getAppRuntimeCached<ModuleSettingsStore | null>({
    key: `${MODULE_SETTINGS_CACHE_PREFIX}${userId}:${orgId}`,
    ttlMs: MODULE_SETTINGS_TTL_MS,
    loader: async () => {
      const { data, error } = await supabaseClient
        .from('integration_settings')
        .select('settings')
        .eq('connection_type', SYSTEM_MODULE_SETTINGS_CONNECTION_TYPE)
        .eq('is_active', true)
        .eq('org_id', orgId)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (isModuleSettingsUnavailableError(error)) return null;
      if (error) throw error;

      const modules = data?.settings?.modules;
      return modules && typeof modules === 'object' ? { modules } : null;
    },
  });
  return isCurrent() ? store : null;
};
